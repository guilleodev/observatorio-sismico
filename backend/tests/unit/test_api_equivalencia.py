"""Equivalencia entre /api/eventos, /api/estadisticas y un cálculo independiente (F5, paso 5.2, T014; SC-002, SC-003, SC-004).

Base TEMPORAL (`obs_api_f5_equiv`) con 90 eventos reproducibles (semilla fija) que mezclan países, «sin país», sin asignar, magnitudes y profundidades nulas,
valores en los bordes de los intervalos, retirados y eventos fuera del periodo. El oráculo es Python puro (comparaciones con los bordes), no el SQL de la API.
"""

import random

import psycopg
import pytest
from fastapi.testclient import TestClient

from fixtures.base_api import base_temporal, conninfo, hay_entorno, insertar_evento
from observatorio.api.estadisticas import BORDES_MAGNITUD, BORDES_PROFUNDIDAD
from observatorio.api.filtros import desde_ms
from observatorio.api.main import crear_app, crear_repositorio
from observatorio.config import ConfigApi

pytestmark = pytest.mark.skipif(not hay_entorno(), reason="sin PostgreSQL o sin /sql montado")

AHORA = 1_793_113_140_000
H = 3_600_000
BASE = "obs_api_f5_equiv"
CONFIG = ConfigApi(max_eventos=5000, max_ventana_horas=744, obsoleta_s=300, statement_timeout_s=10, margen_publicacion_s=900)
MAGS = [None, -0.5, 0.0, 0.99, 1.0, 2.5, 3.99, 4.0, 4.0, 4.5, 5.0, 5.9, 6.0, 7.99, 8.0, 9.2]
PROFS = [None, -3.0, 0.0, 9.99, 10.0, 29.99, 30.0, 69.9, 70.0, 149.0, 150.0, 299.9, 300.0, 499.0, 500.0, 650.0]
PAISES = [None, None, "ZA1", "ZA1", "ZA1", "ZB1", "ZB1"]


def generar():
    azar = random.Random(52)
    eventos = []
    for i in range(90):
        pais = azar.choice(PAISES)
        eventos.append({"id": f"q{i:03d}", "t": AHORA - azar.randrange(0, 72 * H, 1000) - 1, "mag": azar.choice(MAGS), "prof": azar.choice(PROFS),
                        "pais": pais, "retirado": i % 13 == 0, "asignado": pais is not None or i % 3 != 0})  # sin asignar = sin país y sin geo_resultado (estado previo a F4)
    eventos.append({"id": "borde-start", "t": AHORA - 24 * H, "mag": 4.0, "prof": 10.0, "pais": "ZA1", "retirado": False, "asignado": True})
    eventos.append({"id": "borde-end", "t": AHORA, "mag": 4.0, "prof": 10.0, "pais": "ZA1", "retirado": False, "asignado": True})
    return eventos


EVENTOS = generar()


@pytest.fixture(scope="module")
def entorno():
    with base_temporal(BASE) as info:
        with psycopg.connect(info, autocommit=True) as c:
            for e in EVENTOS:
                insertar_evento(c, e["id"], e["t"], e["mag"], e["pais"], "auto" if e["asignado"] else None, profundidad=e["prof"], retirado=e["retirado"])
        app = crear_app(crear_repositorio(info, CONFIG), ["http://localhost:4200"], reloj=lambda: AHORA, config=CONFIG)
        with TestClient(app) as tc:
            yield tc, info


def iso(ms):
    return desde_ms(ms).isoformat().replace("+00:00", "Z")


def seleccion(start=AHORA - 24 * H, end=AHORA, min_mag=None, pais=None, con_umbral=True):
    """Oráculo: eventos vigentes (no retirados) del periodo y ámbito; con_umbral=False deja pasar las magnitudes por debajo del umbral y las nulas."""
    def ambito(e):
        if pais is None:
            return True
        if pais == "sin_pais":
            return e["pais"] is None and e["asignado"]        # sin_pais exige haber sido asignado
        return e["pais"] == pais

    sel = [e for e in EVENTOS if not e["retirado"] and start <= e["t"] < end and ambito(e)]
    if con_umbral and min_mag is not None:
        sel = [e for e in sel if e["mag"] is not None and e["mag"] >= min_mag]
    return sel


def intervalo(valor, bordes):
    return sum(1 for b in bordes if valor >= b)                # nº de bordes alcanzados = índice del intervalo


def oraculo(**filtro):
    sel = seleccion(**filtro)
    pais, sin_pais, sin_asignar = {}, 0, 0
    for e in sel:
        if not e["asignado"]:
            sin_asignar += 1
        elif e["pais"] is None:
            sin_pais += 1
        else:
            pais[e["pais"]] = pais.get(e["pais"], 0) + 1
    mag, prof = [0] * (len(BORDES_MAGNITUD) + 1), [0] * (len(BORDES_PROFUNDIDAD) + 1)
    for e in sel:
        if e["mag"] is not None:
            mag[intervalo(e["mag"], BORDES_MAGNITUD)] += 1
        if e["prof"] is not None:
            prof[intervalo(e["prof"], BORDES_PROFUNDIDAD)] += 1
    return {"total": len(sel), "sin_magnitud": sum(1 for e in seleccion(**{**filtro, "con_umbral": False}) if e["mag"] is None),
            "pais": pais, "sin_pais": sin_pais, "sin_asignar": sin_asignar, "mag": mag, "prof": prof,
            "mag_nulos": sum(1 for e in sel if e["mag"] is None), "prof_nulos": sum(1 for e in sel if e["prof"] is None)}


COMBINACIONES = [
    ("defecto", {}, {}),
    ("min_mag 4", {"min_mag": "4"}, {"min_mag": 4}),
    ("min_mag 4.5 (borde inclusivo)", {"min_mag": "4.5"}, {"min_mag": 4.5}),
    ("min_mag 7", {"min_mag": "7"}, {"min_mag": 7}),
    ("país ZA1", {"country_id": "ZA1"}, {"pais": "ZA1"}),
    ("país ZB1 con min_mag 4", {"country_id": "ZB1", "min_mag": "4"}, {"pais": "ZB1", "min_mag": 4}),
    ("sin_pais", {"country_id": "sin_pais"}, {"pais": "sin_pais"}),
    ("sin_pais con min_mag 5", {"country_id": "sin_pais", "min_mag": "5"}, {"pais": "sin_pais", "min_mag": 5}),
    ("país válido sin eventos (ZC1)", {"country_id": "ZC1"}, {"pais": "ZC1"}),
    ("48 h", {"start": iso(AHORA - 48 * H), "end": iso(AHORA)}, {"start": AHORA - 48 * H}),
    ("72 h con min_mag 3", {"start": iso(AHORA - 72 * H), "end": iso(AHORA + 1000), "min_mag": "3"}, {"start": AHORA - 72 * H, "end": AHORA + 1000, "min_mag": 3}),
    ("ventana de 3 h", {"start": iso(AHORA - 5 * H), "end": iso(AHORA - 2 * H)}, {"start": AHORA - 5 * H, "end": AHORA - 2 * H}),
    ("start exacto en un evento", {"start": iso(AHORA - 24 * H), "end": iso(AHORA)}, {"start": AHORA - 24 * H, "end": AHORA}),
    ("periodo sin eventos", {"start": "2020-01-01", "end": "2020-01-02"}, {"start": 1577836800000, "end": 1577923200000}),
]


def todas_las_paginas(cliente, params, limite):
    ids, offset = [], 0
    while True:
        r = cliente.get("/api/eventos", params={**params, "limit": limite, "offset": offset}).json()
        ids += [f["id"] for f in r["features"]]
        if r["metadata"]["next_offset"] is None:
            return ids, r["metadata"]
        offset = r["metadata"]["next_offset"]


@pytest.mark.parametrize("nombre,params,filtro", COMBINACIONES, ids=[c[0] for c in COMBINACIONES])
def test_eventos_estadisticas_y_oraculo_coinciden_en_el_100_por_100(entorno, nombre, params, filtro):
    cliente, _ = entorno
    esperado = oraculo(**filtro)
    stats = cliente.get("/api/estadisticas", params=params).json()
    ids, meta = todas_las_paginas(cliente, params, 7)                                  # límite pequeño: el listado está truncado salvo que quepa en una página
    # 1. mismo conjunto lógico: recuento de /api/eventos (todas las páginas) = total de /api/estadisticas = oráculo
    assert len(ids) == meta["total"] == stats["total"] == esperado["total"], nombre
    assert len(set(ids)) == len(ids)
    assert stats["sin_magnitud"] == meta["sin_magnitud"] == esperado["sin_magnitud"]
    # 2. cada bloque coincide con el cálculo independiente
    por_pais = {i["country_id"]: i["count"] for i in stats["por_pais"]["items"]}
    assert por_pais.pop(None, 0) == esperado["sin_pais"] and por_pais == esperado["pais"]
    assert stats["por_pais"]["sin_valor"] == esperado["sin_asignar"]
    assert [i["count"] for i in stats["magnitud"]["items"]] == esperado["mag"] and stats["magnitud"]["sin_valor"] == esperado["mag_nulos"]
    assert [i["count"] for i in stats["profundidad"]["items"]] == esperado["prof"] and stats["profundidad"]["sin_valor"] == esperado["prof_nulos"]
    # 2b. (5.3) serie por hora UTC y recuento reciente de la comparación frente al oráculo
    inicio, fin = filtro.get("start", AHORA - 24 * H), filtro.get("end", AHORA)
    primera = inicio - inicio % H
    cuentas = {primera + i * H: 0 for i in range(-(-(fin - primera) // H))}
    for e in seleccion(**filtro):
        cuentas[e["t"] - e["t"] % H] += 1
    assert stats["por_hora"]["items"] == [{"hour": h, "count": n} for h, n in cuentas.items()]
    assert sum(i["count"] for i in stats["por_hora"]["items"]) == stats["total"]
    efectiva = max(filtro.get("min_mag") or 4, 4)
    assert stats["comparacion"]["reciente"]["count"] == len(seleccion(**{**filtro, "min_mag": efectiva}))
    assert stats["comparacion"]["min_mag_efectiva"] == efectiva and stats["comparacion"]["comparacion_disponible"] is False  # esta base no tiene histórico
    # 3. invariante de sumas (SC-004)
    assert sum(i["count"] for i in stats["por_pais"]["items"]) + stats["por_pais"]["sin_valor"] == stats["total"]
    assert sum(i["count"] for i in stats["magnitud"]["items"]) + stats["magnitud"]["sin_valor"] == stats["total"]
    assert sum(i["count"] for i in stats["profundidad"]["items"]) + stats["profundidad"]["sin_valor"] == stats["total"]


def test_con_listado_truncado_las_estadisticas_son_identicas_a_las_del_listado_completo(entorno):
    cliente, _ = entorno
    completo = cliente.get("/api/eventos").json()["metadata"]
    truncado = cliente.get("/api/eventos", params={"limit": 3}).json()["metadata"]
    assert truncado["truncated"] is True and truncado["count"] == 3 and truncado["total"] == completo["total"]
    # /api/estadisticas no admite limit (es 422) y por tanto no puede calcularse sobre una página: su total es el del listado SIN truncar
    assert cliente.get("/api/estadisticas", params={"limit": 3}).status_code == 422
    assert cliente.get("/api/estadisticas").json()["total"] == completo["total"] > 3


def test_una_revision_mueve_el_evento_de_pais_y_magnitud_sin_contarlo_dos_veces(entorno):
    cliente, info = entorno
    antes = cliente.get("/api/estadisticas", params={"min_mag": "4"}).json()
    victima = next(e for e in seleccion(min_mag=4) if e["pais"] == "ZA1")
    with psycopg.connect(info, autocommit=True) as c:
        # revisión de USGS: otra magnitud (por debajo del umbral) y otro país; el estado actual conserva UNA fila por evento
        c.execute("UPDATE live.evento_actual SET mag = 3.0, country_id = 'ZB1' WHERE event_id = %s", (victima["id"],))
        try:
            despues = cliente.get("/api/estadisticas", params={"min_mag": "4"}).json()
            assert despues["total"] == antes["total"] - 1                              # ya no cumple el umbral
            za = lambda r: next((i["count"] for i in r["por_pais"]["items"] if i["country_id"] == "ZA1"), 0)
            zb = lambda r: next((i["count"] for i in r["por_pais"]["items"] if i["country_id"] == "ZB1"), 0)
            assert za(despues) == za(antes) - 1 and zb(despues) == zb(antes)           # salió de ZA1 por la magnitud
            sin_umbral = cliente.get("/api/estadisticas").json()
            assert sum(i["count"] for i in sin_umbral["por_pais"]["items"]) + sin_umbral["por_pais"]["sin_valor"] == sin_umbral["total"]
            assert cliente.get("/api/estadisticas").json()["total"] == oraculo()["total"]   # sigue siendo un evento por id
        finally:
            c.execute("UPDATE live.evento_actual SET mag = %s, country_id = 'ZA1' WHERE event_id = %s", (victima["mag"], victima["id"]))
    assert cliente.get("/api/estadisticas", params={"min_mag": "4"}).json() == {**antes, "generated": antes["generated"]}


def test_idempotencia_dos_lecturas_seguidas_son_iguales(entorno):
    cliente, _ = entorno
    assert cliente.get("/api/estadisticas", params={"country_id": "ZA1", "min_mag": "4"}).json() == cliente.get("/api/estadisticas", params={"country_id": "ZA1", "min_mag": "4"}).json()


def test_el_conjunto_incluye_los_casos_dificiles_que_justifican_la_prueba(entorno):
    """Comprueba la propia prueba: el oráculo ve eventos nulos, sin país, sin asignar y retirados en el periodo por defecto."""
    sel = seleccion()
    assert any(e["mag"] is None for e in sel) and any(e["prof"] is None for e in sel)
    assert any(e["pais"] is None and e["asignado"] for e in sel) and any(not e["asignado"] for e in sel)
    assert any(e["retirado"] for e in EVENTOS if AHORA - 24 * H <= e["t"] < AHORA)
