"""Comparación con la media diaria de 2025 en /api/estadisticas (F5, paso 5.3, T019/T020; SC-005).

Base TEMPORAL (`obs_api_f5_cmp`) con un histórico ficticio de 2025 y eventos en vivo: nunca se mezclan con los 18 302 reales. Las expectativas están contadas a mano
o calculadas en Python (total / 365, mediana de la serie diaria con ceros) y se contrastan además con la implementación de referencia de F4
(`scripts/f4/comparacion.py` sobre `sql/consultas/comparacion.sql`, montados en /scripts y /sql) sobre los MISMOS datos.
"""

import os
import statistics
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

from fixtures.base_api import SHA, base_temporal, conninfo, hay_entorno, insertar_evento
from observatorio.api.filtros import a_ms
from observatorio.api.main import crear_app, crear_repositorio
from observatorio.config import ConfigApi

SCRIPTS = Path(os.environ.get("SCRIPTS_DIR", "/scripts"))
pytestmark = pytest.mark.skipif(not (hay_entorno() and (SCRIPTS / "comparacion.py").is_file()), reason="sin PostgreSQL, /sql o /scripts montados")
sys.path.insert(0, str(SCRIPTS))

UTC = timezone.utc
AHORA = 1_793_113_140_000                                    # 2026-10-27T14:59:00Z
BASE = "obs_api_f5_cmp"
CONFIG = ConfigApi(max_eventos=5000, max_ventana_horas=744, obsoleta_s=300, statement_timeout_s=10, margen_publicacion_s=900)
INICIO, FIN = "2026-10-26T00:00:00Z", "2026-10-27T00:00:00Z"   # ventana de 1 día completa (termina 14 h 59 min antes de generated)
H_DESDE, H_HASTA = datetime(2025, 1, 1, tzinfo=UTC), datetime(2026, 1, 1, tzinfo=UTC)


def t(texto):
    return datetime.fromisoformat(texto).replace(tzinfo=UTC)


def ms_de(texto):
    return a_ms(t(texto))


# (id, instante, magnitud, país, resultado, tipo)
HISTORICO = [
    ("z1", "2025-01-01T00:00:00", 4.0, "ZA1", "interior", "earthquake"), ("z2", "2025-01-01T12:00:00", 4.5, "ZA1", "interior", "earthquake"),
    ("z3", "2025-01-01T23:59:59", 6.0, "ZA1", "frontera", "earthquake"), ("z4", "2025-01-03T08:00:00", 5.0, "ZA1", "interior", "earthquake"),
    ("z5", "2025-01-03T09:00:00", 4.2, "ZA1", "interior", "earthquake"), ("z6", "2025-06-15T10:00:00", 4.6, "ZA1", "interior", "earthquake"),
    ("z7", "2025-12-31T23:59:59", 4.1, "ZA1", "interior", "earthquake"),
    ("z8", "2025-01-01T05:00:00", 3.9, "ZA1", "interior", "earthquake"),             # bajo el umbral
    ("z9", "2025-03-01T00:00:00", None, "ZA1", "interior", "earthquake"),            # magnitud nula: no cumple el umbral
    ("z10", "2025-04-01T00:00:00", 4.3, "ZA1", "interior", "quarry blast"),          # otro tipo
    ("z11", "2024-12-31T23:59:59", 5.5, "ZA1", "interior", "earthquake"),            # fuera del periodo (antes)
    ("z12", "2026-01-01T00:00:00", 5.5, "ZA1", "interior", "earthquake"),            # fuera del periodo (end exclusivo)
    ("y1", "2025-02-02T00:00:00", 4.4, "ZB1", "interior", "earthquake"), ("y2", "2025-02-02T05:00:00", 5.2, "ZB1", "interior", "earthquake"),
    ("y3", "2025-09-09T00:00:00", 6.5, "ZB1", "interior", "earthquake"),
    ("s1", "2025-05-05T00:00:00", 4.7, None, "sin_pais", "earthquake"), ("s2", "2025-05-05T02:00:00", 4.0, None, "sin_pais", "earthquake"),
    ("s3", "2025-08-08T00:00:00", 5.9, None, "sin_pais", "earthquake"),
    ("hx", "2026-10-26T12:00:00", 6.0, "ZA1", "interior", "earthquake"),             # histórico con fecha reciente: jamás cuenta como reciente
]
HISTORICO += [(f"d{k:03d}", (datetime(2025, 1, 1) + timedelta(days=k, hours=12)).isoformat(), 4.0, "ZD1", "interior", "earthquake") for k in range(200)]  # 200 días con 1 evento

# (id, instante, magnitud, país, retirado)
LIVE = [
    ("l1", "2026-10-26T10:00:00", 4.3, "ZA1", False), ("l2", "2026-10-26T11:00:00", 5.0, "ZA1", False), ("l3", "2026-10-26T12:00:00", 4.4, None, False),
    ("l4", "2026-10-26T13:00:00", 4.0, "ZB1", False), ("l5", "2026-10-26T14:00:00", 6.0, "ZA1", True),            # retirado
    ("l6", "2026-10-26T15:00:00", 3.5, "ZA1", False),                                                              # bajo el umbral
    ("l7", "2026-10-26T16:00:00", None, "ZA1", False),                                                             # magnitud nula
    ("l8", "2026-10-25T23:59:59", 5.0, "ZA1", False), ("l9", "2026-10-27T00:00:00", 5.0, "ZA1", False),          # fuera de [INICIO, FIN)
    ("l10", "2026-10-26T18:00:00", 4.5, "ZC1", False),                                                             # país sin histórico
    ("lx", "2025-03-03T00:00:00", 6.0, "ZA1", False),                                                              # vivo con fecha de 2025: jamás cuenta en el histórico
]


def sembrar(c, historico=True):
    c.execute("INSERT INTO geo.pais (country_id, nombre_es) VALUES ('ZD1', 'Pais ZD1')")
    if historico:
        cid = c.execute("INSERT INTO historico.consulta (inicio, fin, filtros, url, resultado) VALUES ('2025-01-01', '2026-01-01', '{}', 'x', 'ok') RETURNING id").fetchone()[0]
        for i, instante, mag, pais, res, tipo in HISTORICO:
            c.execute("INSERT INTO historico.evento (event_id, event_time, updated_at, mag, longitude, latitude, country_id, geo_resultado, geo_catalogo, origen, consulta_id, raw) "
                      "VALUES (%s, %s, %s, %s, 0, 0, %s, %s, %s, 'historico-usgs-fdsn', %s, %s)", (i, t(instante), t(instante), mag, pais, res, SHA, cid, Jsonb({"properties": {"type": tipo}})))
    for i, instante, mag, pais, retirado in LIVE:
        insertar_evento(c, i, ms_de(instante), mag, pais, retirado=retirado)
    c.execute("UPDATE live.estado_ingesta SET ultima_consulta_ok_at = %s WHERE id = 1", (t("2026-10-27T14:58:50"),))


@pytest.fixture(scope="module")
def entorno():
    with base_temporal(BASE) as info:
        with psycopg.connect(info, autocommit=True) as c:
            sembrar(c)
        with TestClient(crear_app(crear_repositorio(info, CONFIG), ["http://localhost:4200"], reloj=lambda: AHORA, config=CONFIG)) as tc:
            yield tc, info


def comp(cliente, **params):
    r = cliente.get("/api/estadisticas", params={"start": INICIO, "end": FIN, **params})
    assert r.status_code == 200, r.text
    return r.json()["comparacion"]


# --- contenido y estructura ---------------------------------------------------------------------------------------------

def test_estructura_fuentes_y_ventana_completa_sin_motivos(entorno):
    c, _ = entorno
    r = comp(c)
    assert set(r) == {"unit", "comparacion_disponible", "ambito", "country_id", "fuente", "min_mag_solicitada", "min_mag_efectiva", "min_mag_elevada", "reciente", "historico",
                      "variacion", "variacion_definida", "periodo_reciente_incompleto", "motivos_incompleto"}
    assert r["comparacion_disponible"] is True and r["unit"] == "events" and r["ambito"] == "global" and r["country_id"] is None
    assert r["reciente"]["source"] == "live" and r["historico"]["source"] == "historico"             # cada cifra con su fuente: nunca mezcladas
    assert r["reciente"]["desde"] == ms_de("2026-10-26T00:00:00") and r["reciente"]["hasta"] == ms_de("2026-10-27T00:00:00") and r["reciente"]["dias"] == 1.0
    assert r["historico"]["periodo"] == {"desde": "2025-01-01", "hasta": "2026-01-01"} and r["historico"]["dias"] == 365
    assert r["periodo_reciente_incompleto"] is False and r["motivos_incompleto"] == []              # termina antes del margen de publicación y de la última lectura


# (nombre, parámetros, ámbito, país, total histórico a mano, reciente a mano, nulos recientes a mano)
CASOS = [
    ("global ≥ 4", {}, "global", None, 13 + 200, 5, 1),                      # z1-z7 (7) + y1-y3 (3) + s1-s3 (3) + 200 de ZD1 ; l1 l2 l3 l4 l10 ; l7
    ("ZA1", {"country_id": "ZA1"}, "pais", "ZA1", 7, 2, 1),                  # l1 l2 ; l7
    ("ZB1", {"country_id": "zb1"}, "pais", "ZB1", 3, 1, 0),
    ("sin país", {"country_id": "sin_pais"}, "sin_pais", None, 3, 1, 0),
    ("ZD1 (mediana distinta de 0)", {"country_id": "ZD1"}, "pais", "ZD1", 200, 0, 0),
    ("ZC1 (sin histórico: media 0)", {"country_id": "ZC1"}, "pais", "ZC1", 0, 1, 0),
    ("min_mag 5", {"min_mag": "5"}, "global", None, 2 + 2 + 1, 1, 1),        # z3 z4 ; y2 y3 ; s3 ; l2 ; l7 (nula, aparte)
    ("min_mag 4 exacto", {"min_mag": "4"}, "global", None, 213, 5, 1),
]


@pytest.mark.parametrize("nombre,params,ambito,pais,total_h,reciente,nulos", CASOS, ids=[c[0] for c in CASOS])
def test_cifras_a_mano_media_sobre_365_y_variacion(entorno, nombre, params, ambito, pais, total_h, reciente, nulos):
    c, _ = entorno
    r = comp(c, **params)
    assert (r["ambito"], r["country_id"]) == (ambito, pais)                                            # mismo ámbito en ambos periodos
    assert r["historico"]["total"] == total_h and r["historico"]["dias"] == 365
    assert r["historico"]["media_diaria"] == pytest.approx(total_h / 365)                              # días de cero eventos incluidos en el denominador
    assert r["historico"]["esperado_para_ventana"] == pytest.approx(total_h / 365)                      # ventana de 1 día = la media diaria
    assert r["reciente"]["count"] == reciente and r["reciente"]["sin_magnitud"] == nulos
    if total_h == 0:
        assert r["variacion"] is None and r["variacion_definida"] is False                              # media 0: «no definida», nunca 0 ni infinito
    else:
        assert r["variacion_definida"] is True and r["variacion"] == pytest.approx((reciente - total_h / 365) / (total_h / 365))


def test_la_mediana_diaria_es_la_de_la_serie_con_los_dias_de_cero(entorno):
    c, _ = entorno
    serie = [0] * 365
    for k in range(200):
        serie[k] = 1
    assert comp(c, country_id="ZD1")["historico"]["mediana_diaria"] == statistics.median(serie) == 1.0   # 200 días con 1 y 165 con 0
    assert comp(c, country_id="ZA1")["historico"]["mediana_diaria"] == 0.0                              # pocos días con eventos: la media está inflada, la mediana no


def test_variacion_con_media_positiva_y_reciente_cero_es_menos_uno(entorno):
    c, _ = entorno
    assert comp(c, country_id="ZD1")["variacion"] == pytest.approx(-1.0)


@pytest.mark.parametrize("solicitada,efectiva,elevada,total_h", [(None, 4.0, True, 213), (2, 4.0, True, 213), (3.99, 4.0, True, 213), (4, 4.0, False, 213), (5, 5.0, False, 5)])
def test_la_magnitud_minima_efectiva_es_al_menos_4_en_ambos_periodos_y_se_indica(entorno, solicitada, efectiva, elevada, total_h):
    c, _ = entorno
    r = comp(c, **({} if solicitada is None else {"min_mag": str(solicitada)}))
    assert r["min_mag_solicitada"] == (None if solicitada is None else float(solicitada)) and r["min_mag_efectiva"] == efectiva and r["min_mag_elevada"] is elevada
    assert r["historico"]["total"] == total_h                                                          # el histórico usa la MISMA magnitud efectiva


def test_el_esperado_es_la_media_por_los_dias_de_la_ventana(entorno):
    c, _ = entorno
    for dias, fin in ((3, "2026-10-27T00:00:00Z"), (0.5, "2026-10-26T12:00:00Z")):
        inicio = t(fin.rstrip("Z")) - timedelta(days=dias)
        r = comp(c, start=inicio.isoformat().replace("+00:00", "Z"), end=fin, country_id="ZA1")
        assert r["reciente"]["dias"] == dias and r["historico"]["esperado_para_ventana"] == pytest.approx(7 / 365 * dias)
        assert r["variacion"] == pytest.approx((r["reciente"]["count"] - 7 / 365 * dias) / (7 / 365 * dias))


def test_historico_y_vivo_no_se_mezclan(entorno):
    c, _ = entorno
    # hx (histórico con fecha reciente, ZA1, 6.0) no suma al reciente (2) y lx (vivo con fecha de 2025, ZA1, 6.0) no suma al histórico (7)
    r = comp(c, country_id="ZA1")
    assert r["reciente"]["count"] == 2 and r["historico"]["total"] == 7


def test_los_retirados_nulos_y_otros_tipos_no_cuentan(entorno):
    c, _ = entorno
    r = comp(c, country_id="ZA1")
    assert r["reciente"]["count"] == 2                      # l5 (retirado), l6 (<4), l7 (nula), l8/l9 (fuera) no cuentan
    assert r["historico"]["total"] == 7                     # z8 (<4), z9 (nula), z10 (otro tipo), z11/z12 (fuera del año) no cuentan


# --- contraste con la implementación de referencia de F4 ----------------------------------------------------------------

@pytest.mark.parametrize("params,ambito,pais,min_mag", [({}, "global", None, 4.0), ({"country_id": "ZA1"}, "pais", "ZA1", 4.0), ({"country_id": "ZB1", "min_mag": "2"}, "pais", "ZB1", 2.0),
                                                        ({"country_id": "sin_pais"}, "sin_pais", None, 4.0), ({"country_id": "ZC1"}, "pais", "ZC1", 4.0),
                                                        ({"country_id": "ZD1"}, "pais", "ZD1", 4.0), ({"min_mag": "5"}, "global", None, 5.0)])
def test_coincide_con_la_implementacion_de_referencia_de_f4(entorno, params, ambito, pais, min_mag):
    from comparacion import comparar
    c, info = entorno
    api = comp(c, **params)
    with psycopg.connect(info, autocommit=True) as conn:
        f4 = comparar(conn, ambito, pais, min_mag, t("2026-10-26T00:00:00"), t("2026-10-27T00:00:00"), H_DESDE, H_HASTA)
    assert api["historico"]["total"] == f4.total_historico
    assert api["historico"]["media_diaria"] == pytest.approx(f4.media_diaria) and api["historico"]["mediana_diaria"] == pytest.approx(f4.mediana_diaria)
    assert api["reciente"]["count"] == f4.reciente and api["reciente"]["sin_magnitud"] == f4.reciente_mag_nula
    assert api["min_mag_efectiva"] == f4.min_mag_aplicada
    if "min_mag" in params:                                                  # sin parámetro la API dice «elevada» (no se pidió ninguna); F4 recibe 4.0 explícito
        assert api["min_mag_elevada"] is f4.min_mag_elevada
    if f4.variacion is None:
        assert api["variacion"] is None and api["variacion_definida"] is False
    else:
        assert api["variacion"] == pytest.approx(f4.variacion)


# --- periodo reciente incompleto: cada motivo por separado --------------------------------------------------------------

class Estado:
    """Altera y restaura el estado de la base temporal para provocar un motivo concreto."""

    def __init__(self, info):
        self.conn = psycopg.connect(info, autocommit=True)

    def ultima(self, instante):
        self.conn.execute("UPDATE live.estado_ingesta SET ultima_consulta_ok_at = %s WHERE id = 1", (t(instante) if instante else None,))

    def hueco(self, inicio, fin, estado="pendiente"):
        self.conn.execute("INSERT INTO live.hueco (inicio, fin, estado) VALUES (%s, %s, %s)", (t(inicio), t(fin), estado))

    def limpiar(self):
        self.conn.execute("DELETE FROM live.hueco")
        self.ultima("2026-10-27T14:58:50")
        self.conn.close()


@pytest.fixture
def estado(entorno):
    e = Estado(entorno[1])
    yield e
    e.limpiar()


def motivos(c, **params):
    r = comp(c, **params)
    assert r["periodo_reciente_incompleto"] is bool(r["motivos_incompleto"])
    return r["motivos_incompleto"]


def test_hueco_pendiente_que_intersecta_marca_la_ventana_incompleta(entorno, estado):
    c, _ = entorno
    estado.hueco("2026-10-26T06:00:00", "2026-10-26T09:00:00")
    assert motivos(c) == ["hueco_pendiente"]


def test_un_hueco_recuperado_o_fuera_de_la_ventana_no_cuenta(entorno, estado):
    c, _ = entorno
    estado.hueco("2026-10-26T06:00:00", "2026-10-26T09:00:00", "recuperado")
    estado.hueco("2026-10-20T00:00:00", "2026-10-26T00:00:00")            # termina justo en start: no intersecta (fin > start es falso)
    estado.hueco("2026-10-27T00:00:00", "2026-10-27T06:00:00")            # empieza justo en end: no intersecta
    assert motivos(c) == []


def test_ventana_que_empieza_antes_de_la_cobertura_en_vivo(entorno):
    c, _ = entorno                                                         # cobertura = primera ingesta (2026-10-26) − 24 h = 2026-10-25T00:00
    assert motivos(c, start="2026-10-24T23:59:59Z", end=FIN) == ["antes_de_cobertura"]
    assert motivos(c, start="2026-10-25T00:00:00Z", end=FIN) == []        # empezar justo en la cobertura es completo


def test_ventana_que_llega_hasta_ahora_por_el_retraso_de_publicacion(entorno, estado):
    c, _ = entorno
    estado.ultima("2026-10-27T14:58:59")
    margen = AHORA - 900 * 1000                                             # generated − 900 s = 14:44:00Z
    assert motivos(c, start="2026-10-26T14:44:00Z", end="2026-10-27T14:44:00Z") == []                 # end == generated − margen: no es «hasta ahora»
    assert motivos(c, start="2026-10-26T14:44:01Z", end="2026-10-27T14:44:01Z") == ["hasta_ahora"]    # un segundo dentro del margen
    assert margen == ms_de("2026-10-27T14:44:00")


def test_ventana_posterior_a_la_ultima_lectura_correcta(entorno, estado):
    c, _ = entorno
    estado.ultima("2026-10-26T20:00:00")                                    # el feed no se lee con éxito desde hace 19 h
    assert motivos(c) == ["despues_de_ultima_lectura"]
    estado.ultima(None)                                                     # nunca hubo una lectura correcta
    assert motivos(c) == ["despues_de_ultima_lectura"]


def test_varios_motivos_a_la_vez_y_la_ventana_por_defecto(entorno, estado):
    c, _ = entorno
    estado.hueco("2026-10-26T06:00:00", "2026-10-26T09:00:00")
    assert motivos(c, start="2026-10-24T00:00:00Z", end="2026-10-27T14:59:00Z") == ["hueco_pendiente", "antes_de_cobertura", "hasta_ahora", "despues_de_ultima_lectura"]
    r = c.get("/api/estadisticas").json()["comparacion"]                    # sin parámetros: [generated − 24 h, generated); el hueco queda fuera de esa ventana
    assert r["periodo_reciente_incompleto"] is True and r["motivos_incompleto"] == ["hasta_ahora", "despues_de_ultima_lectura"]


# --- sin histórico cargado ---------------------------------------------------------------------------------------------

def test_sin_historico_cargado_no_se_inventan_ceros():
    with base_temporal(BASE + "_vacio") as info:
        with psycopg.connect(info, autocommit=True) as w:
            sembrar(w, historico=False)
        with TestClient(crear_app(crear_repositorio(info, CONFIG), ["http://localhost:4200"], reloj=lambda: AHORA, config=CONFIG)) as c:
            r = comp(c)
    assert r["comparacion_disponible"] is False and r["historico"] is None and r["variacion"] is None and r["variacion_definida"] is False
    assert r["reciente"]["count"] == 5 and r["reciente"]["source"] == "live"                          # el recuento reciente sigue siendo válido


# --- el histórico no se modifica -----------------------------------------------------------------------------------------

def test_el_historico_queda_intacto_tras_muchas_comparaciones(entorno):
    c, info = entorno
    huella = "SELECT md5(string_agg(event_id || event_time::text || coalesce(mag::text, '-') || coalesce(country_id, '-'), '|' ORDER BY event_id)), count(*) FROM historico.evento"
    with psycopg.connect(info, autocommit=True) as w:
        antes = w.execute(huella).fetchone()
        for params in ({}, {"country_id": "ZA1"}, {"country_id": "sin_pais", "min_mag": "5"}, {"country_id": "ZD1"}):
            comp(c, **params)
            comp(c, **params)
        assert w.execute(huella).fetchone() == antes and antes[1] == len(HISTORICO)


def test_la_ventana_que_termina_justo_en_la_ultima_lectura_correcta_esta_completa(entorno, estado):
    c, _ = entorno
    estado.ultima("2026-10-27T00:00:00")                  # última lectura == end: nada falta después
    assert motivos(c) == []
    estado.ultima("2026-10-26T23:59:59")                  # un segundo antes de end: faltan datos
    assert motivos(c) == ["despues_de_ultima_lectura"]
