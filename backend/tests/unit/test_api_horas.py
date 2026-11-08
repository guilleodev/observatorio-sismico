"""Serie por hora UTC de /api/estadisticas (F5, paso 5.3, T017; SC-004).

Base TEMPORAL (`obs_api_f5_horas`). Las expectativas son literales o un cálculo en Python con división entera de milisegundos, no el SQL de la API.
"""

import psycopg
import pytest
from fastapi.testclient import TestClient

from fixtures.base_api import base_temporal, conninfo, hay_entorno, insertar_evento
from observatorio.api.estadisticas import HORA_MS, bloque_por_hora, casillas_horarias
from observatorio.api.filtros import Filtros, desde_ms
from observatorio.api.main import crear_app, crear_repositorio
from observatorio.config import ConfigApi

hay_pg = pytest.mark.skipif(not hay_entorno(), reason="sin PostgreSQL o sin /sql montado")
AHORA = 1_793_113_140_000                       # 2026-10-27T14:59:00Z
HORA = 1_793_109_600_000                        # 2026-10-27T14:00:00Z, inicio de hora
BASE = "obs_api_f5_horas"
CONFIG = ConfigApi(max_eventos=5000, max_ventana_horas=744, obsoleta_s=300, statement_timeout_s=10, margen_publicacion_s=900)

# (id, instante en ms, magnitud, país)
EVENTOS = [
    ("h00", HORA, 5.0, "ZA1"),                         # hh:00:00.000 → hora 0 (el borde inicial pertenece a la ventana que empieza)
    ("h01", HORA + HORA_MS - 1, 4.0, "ZB1"),           # hh:59:59.999 → todavía hora 0
    ("h02", HORA + HORA_MS, 3.0, "ZA1"),               # hh+1:00:00.000 → hora 1
    ("h03", HORA + 3 * HORA_MS + 1_800_000, 6.0, None),  # hora 3 (las horas 2 y 4 quedan vacías)
    ("h05", HORA + 5 * HORA_MS - 1, 2.0, "ZA1"),       # hora 4, último milisegundo
    ("h06", HORA + 5 * HORA_MS, 5.5, "ZB1"),           # hora 5
]


def a_ms_hora(valor):
    return valor - valor % HORA_MS


def esperado(start, end, eventos=EVENTOS, filtro=lambda e: True):
    """Oráculo: cuenta por hora con división entera y rellena todas las horas que toca [start, end)."""
    primera = a_ms_hora(start)
    n = -(-(end - primera) // HORA_MS)
    cuentas = {primera + i * HORA_MS: 0 for i in range(n)}
    for e in eventos:
        if start <= e[1] < end and filtro(e):
            cuentas[a_ms_hora(e[1])] += 1
    return [{"hour": h, "count": c} for h, c in cuentas.items()]


def iso(ms):
    return desde_ms(ms).isoformat().replace("+00:00", "Z")


@pytest.fixture(scope="module")
def cliente():
    if not hay_entorno():
        pytest.skip("sin PostgreSQL")
    with base_temporal(BASE) as info:
        with psycopg.connect(info, autocommit=True) as c:
            for id_, t, mag, pais in EVENTOS:
                insertar_evento(c, id_, t, mag, pais)
        with TestClient(crear_app(crear_repositorio(info, CONFIG), ["http://localhost:4200"], reloj=lambda: AHORA, config=CONFIG)) as tc:
            yield tc, info


def horas(cliente, **params):
    r = cliente.get("/api/estadisticas", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_horas_sin_eventos_aparecen_con_cero_y_los_bordes_van_a_la_hora_correcta(cliente):
    c, _ = cliente
    r = horas(c, start=iso(HORA), end=iso(HORA + 6 * HORA_MS))
    h = r["por_hora"]
    assert h["unit"] == "events/hour UTC" and h["sin_valor"] == 0
    assert h["items"] == esperado(HORA, HORA + 6 * HORA_MS)
    assert [i["count"] for i in h["items"]] == [2, 1, 0, 1, 1, 1]              # hora 0: h00 y h01 | hora 1: h02 | hora 2: vacía | hora 3: h03 | hora 4: h05 | hora 5: h06
    assert sum(i["count"] for i in h["items"]) == r["total"] == 6


def test_el_literal_documenta_las_horas_vacias(cliente):
    c, _ = cliente
    items = horas(c, start=iso(HORA), end=iso(HORA + 6 * HORA_MS))["por_hora"]["items"]
    assert [i["hour"] for i in items] == [HORA + k * HORA_MS for k in range(6)]  # casillas consecutivas de una hora, sin saltos


def test_end_exclusivo_en_hh00_no_crea_casilla_extra_y_un_milisegundo_mas_si(cliente):
    c, _ = cliente
    justo = horas(c, start=iso(HORA), end=iso(HORA + 5 * HORA_MS))["por_hora"]["items"]
    assert len(justo) == 5 and justo[-1]["hour"] == HORA + 4 * HORA_MS           # h06 (en end) queda fuera y no hay casilla de la hora 5
    mas = horas(c, start=iso(HORA), end=iso(HORA + 5 * HORA_MS + 1))["por_hora"]["items"]
    assert len(mas) == 6 and mas[-1] == {"hour": HORA + 5 * HORA_MS, "count": 1}  # un ms más: entra h06 y aparece la hora 5


def test_ventana_parcial_al_inicio_y_al_fin_cuenta_solo_lo_que_cae_dentro(cliente):
    c, _ = cliente
    start, end = HORA + 1_800_000, HORA + 3 * HORA_MS + 1_800_001                 # mitad de la hora 0 hasta justo después de h03
    items = horas(c, start=iso(start), end=iso(end))["por_hora"]["items"]
    assert items == esperado(start, end)
    assert items[0]["hour"] == HORA                                                # la primera casilla es la hora que contiene start
    assert [i["count"] for i in items] == [1, 1, 0, 1]                             # h00 queda antes de start (excluido); h01 dentro


def test_se_agrupa_por_la_hora_del_evento_y_no_por_la_de_ingesta(cliente):
    c, info = cliente
    with psycopg.connect(info, autocommit=True) as w:                               # ingesta muy posterior al evento: no cambia su hora
        w.execute("UPDATE live.evento_actual SET ingested_at = %s WHERE event_id = 'h00'", (desde_ms(HORA + 40 * HORA_MS),))
    items = horas(c, start=iso(HORA), end=iso(HORA + 2 * HORA_MS))["por_hora"]["items"]
    assert items[0]["count"] == 2


def test_una_revision_que_mueve_el_evento_de_hora_lo_cuenta_una_sola_vez(cliente):
    c, info = cliente
    antes = horas(c, start=iso(HORA), end=iso(HORA + 6 * HORA_MS))
    with psycopg.connect(info, autocommit=True) as w:
        w.execute("UPDATE live.evento_actual SET event_time = %s WHERE event_id = 'h03'", (desde_ms(HORA + 2 * HORA_MS + 5),))   # de la hora 3 a la 2
        try:
            despues = horas(c, start=iso(HORA), end=iso(HORA + 6 * HORA_MS))
            assert [i["count"] for i in despues["por_hora"]["items"]] == [2, 1, 1, 0, 1, 1]
            assert sum(i["count"] for i in despues["por_hora"]["items"]) == despues["total"] == antes["total"]
        finally:
            w.execute("UPDATE live.evento_actual SET event_time = %s WHERE event_id = 'h03'", (desde_ms(HORA + 3 * HORA_MS + 1_800_000),))
    assert horas(c, start=iso(HORA), end=iso(HORA + 6 * HORA_MS)) == antes


def test_los_filtros_se_aplican_tambien_a_la_serie(cliente):
    c, _ = cliente
    ventana = dict(start=iso(HORA), end=iso(HORA + 6 * HORA_MS))
    assert horas(c, country_id="ZA1", **ventana)["por_hora"]["items"] == esperado(HORA, HORA + 6 * HORA_MS, filtro=lambda e: e[3] == "ZA1")
    assert horas(c, min_mag="5", **ventana)["por_hora"]["items"] == esperado(HORA, HORA + 6 * HORA_MS, filtro=lambda e: e[2] >= 5)
    assert horas(c, country_id="sin_pais", **ventana)["por_hora"]["items"] == esperado(HORA, HORA + 6 * HORA_MS, filtro=lambda e: e[3] is None)


def test_periodo_sin_eventos_devuelve_todas_las_casillas_a_cero(cliente):
    c, _ = cliente
    h = horas(c, start="2020-01-01T00:00:00Z", end="2020-01-01T05:30:00Z")["por_hora"]
    assert [i["count"] for i in h["items"]] == [0] * 6 and h["items"][0]["hour"] == 1577836800000


def test_el_periodo_por_defecto_son_25_casillas_porque_toca_25_horas_utc(cliente):
    c, _ = cliente
    h = horas(c)["por_hora"]["items"]                       # [AHORA − 24 h, AHORA) = de 14:59 a 14:59: toca las horas 14 (ayer) … 14 (hoy)
    assert len(h) == 25 and h[0]["hour"] == HORA - 24 * HORA_MS and h[-1]["hour"] == HORA


# --- límite de 744 casillas: se omite solo la serie ------------------------------------------------------------------

@pytest.mark.parametrize("nombre,start,end,casillas", [
    ("744 casillas justas (31 días desde hh:00)", HORA, HORA + 744 * HORA_MS, 744),
    ("745 casillas: un milisegundo más", HORA, HORA + 744 * HORA_MS + 1, 745),
    ("31 días + 1 s desde hh:00", HORA, HORA + 744 * HORA_MS + 1000, 745),
    ("31 días exactos pero empezando a mitad de hora", HORA + 1_800_000, HORA + 1_800_000 + 744 * HORA_MS, 745),
])
def test_limite_de_744_casillas(cliente, nombre, start, end, casillas):
    c, _ = cliente
    r = horas(c, start=iso(start), end=iso(end))
    assert casillas_horarias(Filtros.desde_parametros(AHORA, iso(start), iso(end)))[1] == casillas
    h = r["por_hora"]
    if casillas <= 744:
        assert len(h["items"]) == 744 and h["items"] == esperado(start, end)
    else:
        assert h == {"unit": "events/hour UTC", "sin_valor": 0, "items": None, "motivo": "ventana_demasiado_amplia", "max_casillas": 744}
        # el resto de estadísticas sigue siendo válido: solo se omite la serie
        assert r["total"] == sum(1 for e in EVENTOS if start <= e[1] < end) > 0 and r["por_pais"]["items"] and len(r["magnitud"]["items"]) == 10 and len(r["profundidad"]["items"]) == 7
        assert r["comparacion"]["reciente"]["count"] >= 0
        assert sum(i["count"] for i in r["por_pais"]["items"]) + r["por_pais"]["sin_valor"] == r["total"]


# --- funciones puras --------------------------------------------------------------------------------------------------

def test_casillas_horarias_cuenta_las_horas_que_toca_el_periodo():
    f = lambda a, b: Filtros.desde_parametros(AHORA, iso(a), iso(b))
    assert casillas_horarias(f(HORA, HORA + HORA_MS)) == (HORA, 1)
    assert casillas_horarias(f(HORA + 1, HORA + HORA_MS)) == (HORA, 1)
    assert casillas_horarias(f(HORA + 1, HORA + HORA_MS + 1)) == (HORA, 2)
    assert casillas_horarias(f(HORA + HORA_MS - 1, HORA + HORA_MS + 1)) == (HORA, 2)


def test_bloque_por_hora_rellena_ceros_y_omite_con_motivo():
    f = Filtros.desde_parametros(AHORA, iso(HORA), iso(HORA + 3 * HORA_MS))
    assert bloque_por_hora(f, {HORA + HORA_MS: 4}, 744)["items"] == [{"hour": HORA, "count": 0}, {"hour": HORA + HORA_MS, "count": 4}, {"hour": HORA + 2 * HORA_MS, "count": 0}]
    assert bloque_por_hora(f, None, 2) == {"unit": "events/hour UTC", "sin_valor": 0, "items": None, "motivo": "ventana_demasiado_amplia", "max_casillas": 2}
