"""Paso 4.2: asignación de país por punto-en-polígono (regla de R-002) con un catálogo de juguete, sin base de datos."""

import math

import pytest

from fixtures.geo import entidades_de_juguete, escribir_catalogo
from observatorio.geo.asignador import Asignador, GeometriaIrreparable
from observatorio.geo.catalogo import leer_catalogo


@pytest.fixture()
def catalogo(tmp_path):
    return leer_catalogo(escribir_catalogo(tmp_path / "juguete.geojson"))


@pytest.fixture()
def asignador(catalogo):
    return Asignador(catalogo)


def resumen(a):
    return (a.country_id, a.resultado)


def test_un_punto_estrictamente_dentro_es_interior_y_trae_el_nombre_en_espanol(asignador, catalogo):
    a = asignador.asignar(5, 5)
    assert resumen(a) == ("ZA1", "interior") and a.nombre == "Alfa" and a.catalogo == catalogo.sha256


def test_un_punto_en_el_borde_de_un_solo_pais_es_frontera(asignador):
    assert resumen(asignador.asignar(5, 0)) == ("ZA1", "frontera")  # borde inferior de ZA1
    assert resumen(asignador.asignar(0, 0)) == ("ZA1", "frontera")  # vértice


def test_un_punto_en_el_borde_compartido_cae_en_varias_coincidencias_y_gana_el_menor_adm0_a3(asignador):
    assert resumen(asignador.asignar(10, 5)) == ("ZA1", "varias")  # ZA1 y ZB1: gana ZA1 por orden alfabético
    assert resumen(asignador.asignar(10, 10)) == ("ZA1", "varias")  # esquina compartida


def test_solapamiento_de_dos_poligonos_es_varias_con_el_menor_identificador(asignador):
    assert resumen(asignador.asignar(67, 5)) == ("ZE1", "varias")  # dentro de ZE1 y de ZF1
    assert resumen(asignador.asignar(62, 5)) == ("ZE1", "interior")  # solo ZE1
    assert resumen(asignador.asignar(72, 5)) == ("ZF1", "interior")  # solo ZF1


def test_el_hueco_de_un_poligono_y_el_exterior_son_sin_pais_sin_buscar_el_mas_cercano(asignador):
    assert resumen(asignador.asignar(31, 1)) == ("ZC1", "interior")  # la parte sólida de ZC1
    a = asignador.asignar(40, 10)  # dentro del hueco de ZC1 (un «lago»), cerca de un país: sigue sin país
    assert resumen(a) == (None, "sin_pais") and a.nombre is None
    assert resumen(asignador.asignar(21, 5)) == (None, "sin_pais")  # a un grado de ZB1: no se le atribuye
    assert resumen(asignador.asignar(100, 50)) == (None, "sin_pais")


def test_el_resultado_no_depende_del_orden_del_catalogo_ni_de_cuantas_veces_se_pregunte(tmp_path, asignador):
    invertido = Asignador(leer_catalogo(escribir_catalogo(tmp_path / "inv.geojson", list(reversed(entidades_de_juguete())))))
    puntos = [(5, 5), (10, 5), (67, 5), (40, 10), (0, 0), (100, 50), (81, 5)]
    for p in puntos:
        esperado = resumen(asignador.asignar(*p))
        assert resumen(asignador.asignar(*p)) == esperado == resumen(invertido.asignar(*p))


@pytest.mark.parametrize("lon, lat", [(180, 0), (-180, 0), (0, 90), (0, -90), (180, 90), (-180, -90), (0, 0)])
def test_coordenadas_limite_son_validas_y_no_dan_error(asignador, lon, lat):
    assert asignador.asignar(lon, lat).resultado in {"interior", "frontera", "varias", "sin_pais"}


@pytest.mark.parametrize("lon, lat", [(math.nan, 0), (0, math.inf), (181, 0), (0, -91)])
def test_coordenadas_imposibles_se_rechazan_con_un_error_explicito(asignador, lon, lat):
    with pytest.raises(ValueError, match="coordenadas"):
        asignador.asignar(lon, lat)


def test_una_geometria_invalida_se_repara_solo_en_memoria_y_se_informa(asignador, catalogo):
    assert asignador.reparadas == ("ZG1",)
    assert resumen(asignador.asignar(81, 5)) == ("ZG1", "interior")  # triángulo izquierdo de la corbata
    assert resumen(asignador.asignar(89, 5)) == ("ZG1", "interior")  # triángulo derecho
    assert resumen(asignador.asignar(85, 9)) == (None, "sin_pais")  # entre los dos triángulos: fuera
    assert catalogo.geometrias["ZG1"]["coordinates"] == [[[80, 0], [90, 10], [90, 0], [80, 10], [80, 0]]]  # el original no se toca


def test_una_geometria_que_no_se_puede_reparar_aborta_con_su_identificador(tmp_path):
    vacia = {"type": "Feature",
             "properties": {"ADM0_A3": "ZH1", "NAME_ES": "H", "ADMIN": "H", "CONTINENT": "x", "SUBREGION": "x", "TYPE": "x", "ISO_A3": "ZH1"},
             "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [2, 2], [0, 0]]]}}  # tres puntos alineados: área nula
    with pytest.raises(GeometriaIrreparable, match="ZH1"):
        Asignador(leer_catalogo(escribir_catalogo(tmp_path / "h.geojson", [vacia])))
