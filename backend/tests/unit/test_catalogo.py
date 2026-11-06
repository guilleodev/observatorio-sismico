"""Paso 4.1: lectura, validación y volcado idempotente del catálogo de países (sin tocar el archivo original).

Las pruebas con PostgreSQL se ejecutan en una transacción que se REVIERTE y con países ficticios (ZZ1, ZZ2…): no dejan
datos en `geo.*`. La prueba del catálogo real se omite si el archivo no está montado en la ruta del contenedor.
"""

import json
import os
from pathlib import Path

import psycopg
import pytest

from observatorio.config import ConfigPostgres, RUTA_CATALOGO_DEFECTO
from observatorio.geo.catalogo import CatalogoInvalido, leer_catalogo, volcar

CUADRADO = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]


def entidad(codigo="ZZ1", nombre_es="Zeta uno", admin="Zeta One", geometria=None, **extra):
    propiedades = {"ADM0_A3": codigo, "NAME_ES": nombre_es, "ADMIN": admin, "CONTINENT": "Europe", "SUBREGION": "Southern Europe",
                   "TYPE": "Sovereign country", "ISO_A3": codigo}
    propiedades.update(extra)
    if geometria is None:
        geometria = {"type": "Polygon", "coordinates": CUADRADO}
    return {"type": "Feature", "properties": propiedades, "geometry": geometria}


def escribir(tmp_path, entidades, nombre="paises.geojson", **raiz):
    ruta = tmp_path / nombre
    cuerpo = {"type": "FeatureCollection", "features": entidades}
    cuerpo.update(raiz)
    ruta.write_text(json.dumps(cuerpo), encoding="utf-8")
    return ruta


# --- validación ------------------------------------------------------------------------------------------------------

def test_un_catalogo_correcto_se_lee_con_sus_atributos(tmp_path):
    cat = leer_catalogo(escribir(tmp_path, [entidad("ZZ1"), entidad("ZZ2", "Zeta dos", "Zeta Two", ISO_A3="-99")]))
    assert [p.country_id for p in cat.paises] == ["ZZ1", "ZZ2"]
    uno, dos = cat.paises
    assert (uno.nombre_es, uno.nombre_en, uno.continente, uno.subregion, uno.tipo, uno.iso_a3) == (
        "Zeta uno", "Zeta One", "Europe", "Southern Europe", "Sovereign country", "ZZ1")
    assert dos.iso_a3 is None  # «-99» significa que el catálogo no da ISO: nulo, no un código inventado
    assert set(cat.geometrias) == {"ZZ1", "ZZ2"}


def test_adm0_a3_repetido_se_rechaza_y_se_nombra(tmp_path):
    with pytest.raises(CatalogoInvalido, match="repetido.*ZZ1"):
        leer_catalogo(escribir(tmp_path, [entidad("ZZ1"), entidad("ZZ1", "Otra", "Other")]))


@pytest.mark.parametrize("codigo", [None, "", "  "])
def test_adm0_a3_ausente_o_vacio_se_rechaza(tmp_path, codigo):
    e = entidad("ZZ1")
    e["properties"]["ADM0_A3"] = codigo
    with pytest.raises(CatalogoInvalido, match="ADM0_A3"):
        leer_catalogo(escribir(tmp_path, [e]))


def test_sin_geometria_o_con_tipo_no_poligonal_se_rechaza(tmp_path):
    sin = entidad("ZZ1")
    sin["geometry"] = None
    punto = entidad("ZZ2", geometria={"type": "Point", "coordinates": [0, 0]})
    with pytest.raises(CatalogoInvalido) as exc:
        leer_catalogo(escribir(tmp_path, [sin, punto]))
    assert "ZZ1" in str(exc.value) and "ZZ2" in str(exc.value)  # informa de todos los problemas a la vez


def test_anillo_abierto_o_coordenadas_fuera_de_rango_se_rechazan(tmp_path):
    abierto = entidad("ZZ1", geometria={"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1]]]})
    fuera = entidad("ZZ2", geometria={"type": "Polygon", "coordinates": [[[0, 0], [200, 0], [1, 95], [0, 0]]]})
    with pytest.raises(CatalogoInvalido) as exc:
        leer_catalogo(escribir(tmp_path, [abierto, fuera]))
    assert "ZZ1" in str(exc.value) and "ZZ2" in str(exc.value)


def test_nombres_vacios_se_rechazan(tmp_path):
    with pytest.raises(CatalogoInvalido, match="NAME_ES"):
        leer_catalogo(escribir(tmp_path, [entidad("ZZ1", nombre_es="")]))


def test_archivo_inexistente_ilegible_o_que_no_es_una_coleccion_se_rechaza(tmp_path):
    with pytest.raises(CatalogoInvalido, match="no existe"):
        leer_catalogo(tmp_path / "nada.geojson")
    roto = tmp_path / "roto.geojson"
    roto.write_text("{ no es json", encoding="utf-8")
    with pytest.raises(CatalogoInvalido, match="JSON"):
        leer_catalogo(roto)
    otro = tmp_path / "otro.geojson"
    otro.write_text(json.dumps({"type": "Feature"}), encoding="utf-8")
    with pytest.raises(CatalogoInvalido, match="FeatureCollection"):
        leer_catalogo(otro)
    with pytest.raises(CatalogoInvalido, match="sin entidades"):
        leer_catalogo(escribir(tmp_path, [], nombre="vacio.geojson"))


def test_la_huella_identifica_el_contenido(tmp_path):
    a = leer_catalogo(escribir(tmp_path, [entidad("ZZ1")], nombre="a.geojson"))
    a_otra_vez = leer_catalogo(tmp_path / "a.geojson")
    b = leer_catalogo(escribir(tmp_path, [entidad("ZZ1", nombre_es="Cambiado")], nombre="b.geojson"))
    assert a.sha256 == a_otra_vez.sha256 and len(a.sha256) == 64
    assert a.sha256 != b.sha256


def test_leer_no_modifica_el_archivo(tmp_path):
    ruta = escribir(tmp_path, [entidad("ZZ1")])
    antes = ruta.read_bytes()
    leer_catalogo(ruta)
    assert ruta.read_bytes() == antes


# --- catálogo real (solo si está montado) ------------------------------------------------------------------------------

@pytest.mark.skipif(not Path(RUTA_CATALOGO_DEFECTO).is_file(), reason="catálogo real no montado en /datos")
def test_el_catalogo_real_cumple_lo_comprobado_en_el_informe():
    cat = leer_catalogo(Path(RUTA_CATALOGO_DEFECTO))
    por_id = {p.country_id: p for p in cat.paises}
    assert len(cat.paises) == 177 and len(por_id) == 177
    assert por_id["ESP"].nombre_es == "España" and por_id["ESP"].iso_a3 == "ESP"
    assert por_id["NOR"].iso_a3 is None and por_id["FRA"].iso_a3 is None  # -99 en el catálogo
    assert por_id["PSX"].iso_a3 == "PSE"  # ADM0_A3 distinto de ISO_A3: por eso no se presupone ISO
    assert por_id["SOL"].nombre_en == "Somaliland"
    assert len(cat.sha256) == 64


# --- volcado idempotente en PostgreSQL real (transacción revertida) ----------------------------------------------------

pytestmark_pg = pytest.mark.skipif(not os.environ.get("POSTGRES_HOST"), reason="sin PostgreSQL")


def _conexion():
    return psycopg.connect(ConfigPostgres.desde_entorno().conninfo())


def _contar(conn):
    return conn.execute("SELECT (SELECT count(*) FROM geo.pais), (SELECT count(*) FROM geo.catalogo)").fetchone()


@pytestmark_pg
def test_el_volcado_es_idempotente_y_no_deja_datos(tmp_path):
    cat = leer_catalogo(escribir(tmp_path, [entidad("ZZ1"), entidad("ZZ2", "Zeta dos", "Zeta Two")]))
    with _conexion() as conn:
        antes = _contar(conn)
        with conn.transaction(force_rollback=True):
            r1 = volcar(conn, cat)
            assert (r1.paises_nuevos, r1.paises_actualizados, r1.paises_sin_cambios, r1.catalogo_nuevo) == (2, 0, 0, True)
            dentro = _contar(conn)
            assert dentro == (antes[0] + 2, antes[1] + 1)
            r2 = volcar(conn, cat)
            assert (r2.paises_nuevos, r2.paises_actualizados, r2.paises_sin_cambios, r2.catalogo_nuevo) == (0, 0, 2, False)
            assert _contar(conn) == dentro  # segunda ejecución: sin cambios
            fila = conn.execute("SELECT nombre_es, nombre_en, continente, iso_a3 FROM geo.pais WHERE country_id = 'ZZ2'").fetchone()
            assert fila == ("Zeta dos", "Zeta Two", "Europe", "ZZ2")
        assert _contar(conn) == antes  # la prueba no deja nada


@pytestmark_pg
def test_un_cambio_en_el_catalogo_actualiza_sin_duplicar_y_no_borra_lo_ausente(tmp_path):
    v1 = leer_catalogo(escribir(tmp_path, [entidad("ZZ1"), entidad("ZZ2")], nombre="v1.geojson"))
    v2 = leer_catalogo(escribir(tmp_path, [entidad("ZZ1", nombre_es="Zeta uno (nuevo)")], nombre="v2.geojson"))
    with _conexion() as conn:
        with conn.transaction(force_rollback=True):
            volcar(conn, v1)
            r = volcar(conn, v2)
            assert r.paises_actualizados == 1 and r.paises_nuevos == 0 and r.catalogo_nuevo
            assert "ZZ2" in r.obsoletos  # ya no está en el catálogo nuevo: se informa, NO se borra (hay claves foráneas)
            assert conn.execute("SELECT nombre_es FROM geo.pais WHERE country_id = 'ZZ1'").fetchone() == ("Zeta uno (nuevo)",)
            assert conn.execute("SELECT count(*) FROM geo.pais WHERE country_id = 'ZZ2'").fetchone() == (1,)
            assert conn.execute("SELECT count(*) FROM geo.catalogo WHERE sha256 IN (%s, %s)", (v1.sha256, v2.sha256)).fetchone() == (2,)
