"""F6, T004: los seis casos controlados del replay (research R-004). Datos de demostración etiquetados, con id propio `replay-ctl-<caso>`:
copian un evento real, que NO se altera."""

import json
import os
from copy import deepcopy
from pathlib import Path

import pytest

from fixtures.replay_datos import seleccion_ficticia
from observatorio.replay import casos as c

CASOS_ESPERADOS = {"duplicado": 2, "revision": 2, "antigua": 2, "magnitud_nula": 1, "coordenadas_invalidas": 1, "maritimo": 1}


def propiedades(m):
    return m.evento["properties"]


def del_caso(secuencia, caso):
    return [m for m in secuencia if m.caso == caso]


def test_hay_nueve_mensajes_de_casos_y_los_treinta_reales_no_cambian():
    reales = seleccion_ficticia(30)
    secuencia = c.construir_secuencia(reales)
    assert len(secuencia) == 39 and [m.seq for m in secuencia] == list(range(39))
    assert {k: len(del_caso(secuencia, k)) for k in c.CASOS} == CASOS_ESPERADOS
    assert [m.evento for m in secuencia if m.caso is None] == reales  # idénticos, en su orden
    assert all(m.base is None for m in secuencia if m.caso is None)


def test_construir_la_secuencia_no_modifica_la_entrada_y_es_determinista():
    reales = seleccion_ficticia(30)
    copia = deepcopy(reales)
    a, b = c.construir_secuencia(reales), c.construir_secuencia(reales)
    assert reales == copia and a == b


def test_todos_los_casos_tienen_id_propio_y_ninguno_reutiliza_un_id_real():
    reales = seleccion_ficticia(30)
    ids_reales = {f["id"] for f in reales}
    for m in c.construir_secuencia(reales):
        if m.caso is None:
            continue
        assert m.evento["id"] == f"replay-ctl-{m.caso}" and m.evento["id"] not in ids_reales
        assert m.base in ids_reales  # el evento real del que se copió


def test_la_base_son_los_seis_primeros_eventos_con_magnitud_no_nula_en_orden():
    reales = seleccion_ficticia(30, con_nulos_al_principio=2)  # los dos primeros tienen magnitud nula
    secuencia = c.construir_secuencia(reales)
    esperado = [f["id"] for f in reales if f["properties"]["mag"] is not None][:6]
    bases = []
    for caso in c.CASOS:
        bases.append(del_caso(secuencia, caso)[0].base)
    assert bases == esperado


def test_cada_caso_va_justo_despues_de_su_evento_base_y_el_tiempo_no_retrocede():
    secuencia = c.construir_secuencia(seleccion_ficticia(30))
    for i, m in enumerate(secuencia):
        if m.caso is not None and (i == 0 or secuencia[i - 1].caso is None):
            assert secuencia[i - 1].evento["id"] == m.base  # el primer mensaje de cada caso sigue a su base
    tiempos = [propiedades(m)["time"] for m in secuencia]
    assert tiempos == sorted(tiempos)  # la reproducción conserva el orden por fecha del evento


def test_el_tiempo_del_caso_es_el_del_evento_base():
    reales = {f["id"]: f for f in seleccion_ficticia(30)}
    for m in c.construir_secuencia(list(reales.values())):
        if m.caso is not None:
            assert propiedades(m)["time"] == reales[m.base]["properties"]["time"]


def test_duplicado_es_el_mismo_evento_dos_veces():
    a, b = del_caso(c.construir_secuencia(seleccion_ficticia(30)), "duplicado")
    assert a.evento == b.evento and a.seq != b.seq


def test_revision_sube_updated_un_minuto_y_la_magnitud_una_decima():
    v1, v2 = del_caso(c.construir_secuencia(seleccion_ficticia(30)), "revision")
    assert propiedades(v2)["updated"] == propiedades(v1)["updated"] + 60_000
    assert propiedades(v2)["mag"] == round(propiedades(v1)["mag"] + 0.1, 1) and propiedades(v2)["mag"] != propiedades(v1)["mag"]
    assert v1.evento["id"] == v2.evento["id"] and v1.seq < v2.seq


def test_antigua_llega_despues_de_la_nueva_con_updated_una_hora_anterior():
    nueva, vieja = del_caso(c.construir_secuencia(seleccion_ficticia(30)), "antigua")
    assert nueva.seq < vieja.seq and nueva.evento["id"] == vieja.evento["id"]
    assert propiedades(vieja)["updated"] == propiedades(nueva)["updated"] - 3_600_000
    assert propiedades(vieja)["mag"] == round(propiedades(nueva)["mag"] - 0.1, 1)


def test_magnitud_nula_coordenadas_invalidas_y_maritimo():
    s = c.construir_secuencia(seleccion_ficticia(30))
    (nula,), (invalida,), (maritimo,) = del_caso(s, "magnitud_nula"), del_caso(s, "coordenadas_invalidas"), del_caso(s, "maritimo")
    assert propiedades(nula)["mag"] is None
    assert invalida.evento["geometry"]["coordinates"][1] == 123 and not -90 <= 123 <= 90
    assert maritimo.evento["geometry"]["coordinates"][:2] == list(c.PUNTO_MARITIMO)
    for m in (nula, invalida, maritimo):
        assert "Caso controlado" in propiedades(m)["place"]


def test_faltan_eventos_con_magnitud_para_los_seis_casos():
    with pytest.raises(c.SeleccionInsuficiente):
        c.construir_secuencia(seleccion_ficticia(5))
    todos_nulos = seleccion_ficticia(30, con_nulos_al_principio=30)
    with pytest.raises(c.SeleccionInsuficiente):
        c.construir_secuencia(todos_nulos)


def test_sin_eventos_no_hay_casos_ni_se_inventa_nada():
    assert c.construir_secuencia([]) == []


def test_el_envoltorio_kafka_cumple_el_contrato():
    m = c.construir_secuencia(seleccion_ficticia(30))[3]
    msg = c.a_mensaje_kafka(m, run_id="r-1", velocidad=1200.0, ingested_at_ms=1_794_300_000_000)
    assert msg == {"source": "replay-historico", "mode": "replay", "ingested_at": 1_794_300_000_000, "event": m.evento,
                   "replay": {"run_id": "r-1", "seq": 3, "caso": m.caso, "velocidad": 1200.0}}
    clave, valor = c.serializar(msg)
    assert clave == m.evento["id"].encode("utf-8") and json.loads(valor) == msg


def test_el_punto_maritimo_no_esta_cubierto_por_ningun_poligono_del_catalogo_real():
    ruta = Path(os.environ.get("CATALOGO_PATH", "/datos/paises.geojson"))
    if not ruta.is_file():
        pytest.skip("sin catálogo real montado")
    from observatorio.geo.asignador import Asignador
    from observatorio.geo.catalogo import leer_catalogo

    resultado = Asignador(leer_catalogo(ruta)).asignar(*c.PUNTO_MARITIMO)
    assert resultado.resultado == "sin_pais" and resultado.country_id is None
