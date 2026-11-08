"""/api/estadisticas: país y distribuciones (F5, paso 5.2, T011; SC-001, SC-004).

Base TEMPORAL (`obs_api_f5_estad`). El conjunto de 16 eventos está contado A MANO (intervalos, nulos, sin país, sin asignar, retirado, límites del periodo): las
expectativas son literales, no el resultado del mismo SQL. La equivalencia con /api/eventos y el cálculo independiente generalizado están en test_api_equivalencia.py.
"""

import asyncio
import json
from contextlib import asynccontextmanager

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg_pool import AsyncConnectionPool

from fixtures.base_api import INGESTA, SHA, base_temporal, conninfo, hay_entorno, insertar_evento, ms
from observatorio.api.estadisticas import BORDES_MAGNITUD, BORDES_PROFUNDIDAD, bloque_por_pais, intervalos
from observatorio.api.filtros import Filtros
from observatorio.api.main import crear_app, crear_repositorio
from observatorio.api.repositorio import BaseDatosNoDisponible, RepositorioApi, opciones_conexion
from observatorio.config import ConfigApi

hay_pg = pytest.mark.skipif(not hay_entorno(), reason="sin PostgreSQL o sin /sql montado")
AHORA = 1_793_113_140_000
H = 3_600_000
BASE = "obs_api_f5_estad"
CONFIG = ConfigApi(max_eventos=5000, max_ventana_horas=744, obsoleta_s=300, statement_timeout_s=10, margen_publicacion_s=900)

# (id, magnitud, profundidad, país, resultado geográfico)
DENTRO = [
    ("a01", -0.5, -3, "ZA1", "auto"), ("a02", 0.0, 0, "ZA1", "auto"), ("a03", 0.99, 9.99, "ZA1", "auto"), ("a04", 1.0, 10, "ZA1", "auto"),
    ("a05", 3.9, 29.9, "ZB1", "auto"), ("a06", 4.0, 30, "ZB1", "auto"), ("a07", 4.99, 69.99, "ZB1", "auto"), ("a08", 5.0, 70, None, "auto"),
    ("a09", 7.99, 149, None, "auto"), ("a10", 8.0, 150, None, "auto"), ("a11", 9.1, 299.99, "ZA1", "auto"), ("a12", None, 300, "ZA1", "auto"),
    ("a13", 4.5, None, "ZA1", "auto"), ("a14", 4.5, 499, "ZB1", "auto"), ("a15", 6.0, 500, None, None), ("a16", 6.0, 700, "ZB1", "auto"),
]

INTERVALOS_MAG = [(None, 0.0), (0.0, 1.0), (1.0, 2.0), (2.0, 3.0), (3.0, 4.0), (4.0, 5.0), (5.0, 6.0), (6.0, 7.0), (7.0, 8.0), (8.0, None)]
INTERVALOS_PROF = [(None, 10), (10, 30), (30, 70), (70, 150), (150, 300), (300, 500), (500, None)]


def con_recuentos(limites, recuentos):
    return [{"from": a, "to": b, "count": n} for (a, b), n in zip(limites, recuentos)]


@pytest.fixture(scope="module")
def cliente():
    if not hay_entorno():
        pytest.skip("sin PostgreSQL")
    with base_temporal(BASE) as info:
        with psycopg.connect(info, autocommit=True) as c:
            for i, (id_, mag, prof, pais, res) in enumerate(DENTRO):
                insertar_evento(c, id_, AHORA - (1 + i) * 600_000, mag, pais, res, profundidad=prof)
            insertar_evento(c, "x01", AHORA - 30 * 60_000, 7.0, "ZA1", profundidad=10, retirado=True)      # retirado: nunca cuenta
            insertar_evento(c, "x02", AHORA - 25 * H, 5.0, "ZA1", profundidad=10)                          # fuera del periodo
            insertar_evento(c, "x03", AHORA, 5.0, "ZA1", profundidad=10)                                    # en end (exclusivo): fuera
            # eventos de OTRAS fuentes con las mismas fechas y países: no deben contarse jamás
            c.execute("CREATE SCHEMA sintetico")
            c.execute("CREATE TABLE sintetico.evento_actual (LIKE live.evento_actual INCLUDING ALL)")
            insertar_evento(c, "s01", AHORA - 5 * 60_000, 6.0, "ZA1")
            c.execute("INSERT INTO sintetico.evento_actual SELECT * FROM live.evento_actual WHERE event_id = 's01'")
            c.execute("DELETE FROM live.evento_actual WHERE event_id = 's01'")
            cid = c.execute("INSERT INTO historico.consulta (inicio, fin, filtros, url, resultado) VALUES ('2025-01-01', '2026-01-01', '{}', 'x', 'ok') RETURNING id").fetchone()[0]
            c.execute("INSERT INTO historico.evento (event_id, event_time, updated_at, mag, longitude, latitude, country_id, geo_resultado, geo_catalogo, origen, consulta_id, raw) "
                      "VALUES ('h01', %s, %s, 6, 0, 0, 'ZA1', 'interior', %s, 'historico-usgs-fdsn', %s, '{\"properties\": {\"type\": \"earthquake\"}}'::jsonb)", (ms(AHORA - 60_000), ms(AHORA - 60_000), SHA, cid))
        app = crear_app(crear_repositorio(info, CONFIG), ["http://localhost:4200"], reloj=lambda: AHORA, config=CONFIG)
        with TestClient(app) as tc:
            yield tc


def stats(cliente, **params):
    r = cliente.get("/api/estadisticas", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_estructura_y_unidades_de_la_respuesta(cliente):
    r = stats(cliente)
    assert set(r) == {"generated", "period", "filters", "total", "sin_magnitud", "por_pais", "magnitud", "profundidad", "por_hora", "comparacion"}  # 5.3 añade por_hora y comparacion
    assert r["generated"] == AHORA and r["period"] == {"start": AHORA - 24 * H, "end": AHORA} and r["filters"] == {"min_mag": None, "country_id": None}
    assert (r["por_pais"]["unit"], r["magnitud"]["unit"], r["profundidad"]["unit"]) == ("events", "magnitude", "km")
    assert all(set(r[b]) == {"unit", "sin_valor", "items"} for b in ("por_pais", "magnitud", "profundidad"))
    texto = json.dumps(r)
    assert "NaN" not in texto and "Infinity" not in texto


def test_recuentos_por_pais_con_sin_pais_y_sin_asignar_aparte(cliente):
    r = stats(cliente)
    assert r["total"] == 16 and r["sin_magnitud"] == 1
    assert r["por_pais"]["items"] == [
        {"country_id": "ZA1", "country_name": "Pais ZA1", "count": 7},
        {"country_id": "ZB1", "country_name": "Pais ZB1", "count": 5},
        {"country_id": None, "country_name": "Sin país asignado", "count": 3},          # solo geo_resultado = 'sin_pais'
    ]
    assert r["por_pais"]["sin_valor"] == 1                                              # a15: aún sin asignar, no es «sin país» ni un país


def test_magnitud_con_intervalos_fijos_bordes_inclusivos_por_la_izquierda_y_nulos_aparte(cliente):
    m = stats(cliente)["magnitud"]
    assert m["items"] == con_recuentos(INTERVALOS_MAG, [1, 2, 1, 0, 1, 4, 1, 2, 1, 2])  # -0,5 | 0,0 y 0,99 | 1,0 | – | 3,9 | 4,0 4,99 4,5 4,5 | 5,0 | 6,0 6,0 | 7,99 | 8,0 y 9,1
    assert m["sin_valor"] == 1 and sum(i["count"] for i in m["items"]) + m["sin_valor"] == 16   # el nulo NO se cuenta como 0 ni en el primer intervalo


def test_profundidad_con_intervalos_fijos_negativos_en_el_primero_y_nulos_aparte(cliente):
    p = stats(cliente)["profundidad"]
    assert p["items"] == con_recuentos(INTERVALOS_PROF, [3, 2, 2, 2, 2, 2, 2])           # −3, 0, 9,99 | 10, 29,9 | 30, 69,99 | 70, 149 | 150, 299,99 | 300, 499 | 500, 700
    assert p["sin_valor"] == 1 and sum(i["count"] for i in p["items"]) + p["sin_valor"] == 16


def test_los_intervalos_son_fijos_y_cubren_todo_el_rango(cliente):
    for bloque, limites in (("magnitud", INTERVALOS_MAG), ("profundidad", INTERVALOS_PROF)):
        items = stats(cliente)[bloque]["items"]
        assert [(i["from"], i["to"]) for i in items] == limites
        assert items[0]["from"] is None and items[-1]["to"] is None                      # extremos abiertos: null, nunca Infinity
        assert all(a["to"] == b["from"] for a, b in zip(items, items[1:]))              # sin huecos ni solapes


def test_min_mag_excluye_los_nulos_los_cuenta_aparte_y_deja_sin_valor_a_cero(cliente):
    r = stats(cliente, min_mag="4")
    assert r["filters"]["min_mag"] == 4.0 and r["total"] == 10 and r["sin_magnitud"] == 1   # a12 no cumple el umbral y se cuenta aparte
    assert r["magnitud"]["sin_valor"] == 0 and sum(i["count"] for i in r["magnitud"]["items"]) == 10
    assert r["magnitud"]["items"][0]["count"] == 0 and r["magnitud"]["items"][1]["count"] == 0   # nada por debajo de 4
    assert r["por_pais"]["items"] == [{"country_id": "ZB1", "country_name": "Pais ZB1", "count": 4}, {"country_id": None, "country_name": "Sin país asignado", "count": 3},
                                      {"country_id": "ZA1", "country_name": "Pais ZA1", "count": 2}]  # empate 4/3/2 ordenado por recuento
    assert r["por_pais"]["sin_valor"] == 1


def test_filtro_de_pais_deja_solo_ese_pais(cliente):
    r = stats(cliente, country_id="zb1")
    assert r["filters"]["country_id"] == "ZB1" and r["total"] == 5
    assert r["por_pais"]["items"] == [{"country_id": "ZB1", "country_name": "Pais ZB1", "count": 5}] and r["por_pais"]["sin_valor"] == 0


def test_filtro_sin_pais_deja_solo_la_categoria_sin_pais(cliente):
    r = stats(cliente, country_id="sin_pais")
    assert r["total"] == 3 and r["por_pais"]["items"] == [{"country_id": None, "country_name": "Sin país asignado", "count": 3}]
    assert r["por_pais"]["sin_valor"] == 0                                              # a15 (sin asignar) no es sin_pais


@pytest.mark.parametrize("params", [{"country_id": "ZC1"}, {"min_mag": "10"}, {"start": "2020-01-01", "end": "2020-01-02"}, {"start": "2030-01-01", "end": "2030-01-02"}])
def test_periodo_o_filtro_vacio_devuelve_ceros_validos_con_todos_los_intervalos(cliente, params):
    r = stats(cliente, **params)
    assert r["total"] == 0 and r["por_pais"]["items"] == [] and r["por_pais"]["sin_valor"] == 0
    assert [i["count"] for i in r["magnitud"]["items"]] == [0] * 10 and [i["count"] for i in r["profundidad"]["items"]] == [0] * 7
    assert r["magnitud"]["sin_valor"] == 0 and r["profundidad"]["sin_valor"] == 0


def test_limites_del_periodo_start_inclusivo_end_exclusivo(cliente):
    # a01 está a −10 min; x03 justo en end queda fuera; x02 (−25 h) fuera
    assert stats(cliente, start="2026-10-27T14:59:00Z", end="2026-10-27T14:59:00.001Z")["total"] == 1   # AHORA es 14:59:00Z: x03 está exactamente en start (inclusivo)
    r = cliente.get("/api/estadisticas", params={"start": "2026-10-27T14:49:00Z", "end": "2026-10-27T14:59:00Z"}).json()
    assert r["total"] == 1                                                                             # a01 (14:49:00 inclusivo); x03 (14:59:00) excluido


def test_no_se_mezclan_historico_ni_sintetico(cliente):
    r = stats(cliente)
    assert r["total"] == 16 and r["por_pais"]["items"][0]["count"] == 7                  # s01 (sintético) y h01 (histórico) en la misma ventana y país no suman


def test_los_errores_de_parametros_son_422_con_el_mismo_formato_que_eventos(cliente):
    for consulta in ("start=ayer", "min_mag=abc", "min_mag=NaN", "country_id=ATLANTIDA", "start=2026-11-02&end=2026-11-01", "limit=10", "offset=0", "min_magnitud=4", "min_mag=4&min_mag=5"):
        r = cliente.get(f"/api/estadisticas?{consulta}")
        assert r.status_code == 422 and r.json()["error"] == "parametro_invalido" and r.json()["detail"], consulta
    assert cliente.post("/api/estadisticas").status_code == 405


def test_la_base_inalcanzable_es_503_y_nunca_ceros(cliente):
    import re
    info = conninfo(BASE)
    malo = re.sub(r"host=\S+", "host=servidor-inexistente-f5", info, count=1)
    with TestClient(crear_app(crear_repositorio(malo, CONFIG), ["http://localhost:4200"], reloj=lambda: AHORA, config=CONFIG)) as c:
        r = c.get("/api/estadisticas")
        assert r.status_code == 503 and r.json()["error"] == "base_de_datos_no_disponible" and "total" not in r.json()


# --- instantánea consistente: el invariante de sumas se cumple aunque entren eventos entre consultas ---------------------

class ConEscritorConcurrente:
    def __init__(self, conn, escribir):
        self._conn, self._escribir, self._n = conn, escribir, 0

    async def execute(self, *args, **kwargs):
        resultado = await self._conn.execute(*args, **kwargs)
        self._n += 1
        if self._n == 1:                       # tras la primera consulta (el total) entra un evento confirmado desde otra conexión
            await self._escribir()
        return resultado


async def _estadisticas_con_intruso(info, opciones):
    pool = AsyncConnectionPool(info, kwargs={"options": opciones} if opciones else {}, min_size=1, max_size=2, open=False)
    await pool.open()
    try:
        async def escribir():
            async with await psycopg.AsyncConnection.connect(info, autocommit=True) as w:
                await w.execute(
                    "INSERT INTO live.evento_actual (event_id, event_time, updated_at, mag, depth_km, longitude, latitude, source, mode, ingested_at, kafka_topic, kafka_partition, "
                    "kafka_offset, raw, country_id, geo_resultado, geo_catalogo) VALUES ('intruso', %s, %s, 5, 5, 0, 0, 'usgs-all-day', 'live', %s, 't', 0, 999998, '{}'::jsonb, 'ZA1', 'interior', %s)",
                    (ms(AHORA - 60_000), ms(AHORA - 60_000), INGESTA, SHA))

        @asynccontextmanager
        async def conexion():
            async with pool.connection() as conn:
                yield ConEscritorConcurrente(conn, escribir)

        return await RepositorioApi(conexion).estadisticas(Filtros.desde_parametros(AHORA), AHORA, 744, 900)
    finally:
        await pool.close()


def _suma_bloques(r):
    return (sum(i["count"] for i in r["por_pais"]["items"]) + r["por_pais"]["sin_valor"],
            sum(i["count"] for i in r["magnitud"]["items"]) + r["magnitud"]["sin_valor"])


@hay_pg
def test_con_la_sesion_de_produccion_total_y_bloques_salen_del_mismo_estado():
    with base_temporal(BASE + "_snap") as info:
        with psycopg.connect(info, autocommit=True) as c:
            for i, (id_, mag, prof, pais, res) in enumerate(DENTRO):
                insertar_evento(c, id_, AHORA - (1 + i) * 600_000, mag, pais, res, profundidad=prof)
        r = asyncio.run(_estadisticas_con_intruso(info, opciones_conexion(10)))
        assert r["total"] == 16 and _suma_bloques(r) == (16, 16)
        with psycopg.connect(info, autocommit=True) as c:
            c.execute("DELETE FROM live.evento_actual WHERE event_id = 'intruso'")  # base temporal: se retira el intruso de la primera pasada
        control = asyncio.run(_estadisticas_con_intruso(info, None))      # prueba de la prueba: sin REPEATABLE READ las sumas divergen del total
        assert control["total"] == 16 and _suma_bloques(control) == (17, 17)


# --- funciones puras --------------------------------------------------------------------------------------------------

def test_intervalos_rellena_los_vacios_y_deja_los_extremos_abiertos():
    assert intervalos((10, 30), {1: 4}) == [{"from": None, "to": 10, "count": 0}, {"from": 10, "to": 30, "count": 4}, {"from": 30, "to": None, "count": 0}]


def test_bordes_fijos_documentados():
    assert BORDES_MAGNITUD == (0, 1, 2, 3, 4, 5, 6, 7, 8) and BORDES_PROFUNDIDAD == (10, 30, 70, 150, 300, 500)


def test_bloque_por_pais_agrupa_resultados_del_mismo_pais_y_separa_sin_pais_y_sin_asignar():
    filas = [("ESP", "España", "interior", 3), ("ESP", "España", "frontera", 2), ("FRA", "Francia", "varias", 1), (None, None, "sin_pais", 4), (None, None, None, 5)]
    assert bloque_por_pais(filas) == {"unit": "events", "sin_valor": 5, "items": [
        {"country_id": "ESP", "country_name": "España", "count": 5}, {"country_id": None, "country_name": "Sin país asignado", "count": 4},
        {"country_id": "FRA", "country_name": "Francia", "count": 1}]}
    assert bloque_por_pais([]) == {"unit": "events", "sin_valor": 0, "items": []}
