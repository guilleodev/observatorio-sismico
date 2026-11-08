"""API con `mode=replay` (F6, paso 6.2, T019; contracts/f6.md §2; FR-008, FR-009, SC-004).

Unitarias con un repositorio simulado (validación, 503) e integración con PostgreSQL REAL en bases TEMPORALES (`obs_api_f6_*`): nunca se toca la base definitiva.
Los datos son ficticios y están contados a mano. Se siembran a propósito eventos EN VIVO con los mismos ids y fechas para detectar cualquier mezcla.
"""

import json

import psycopg
import pytest
from fastapi.testclient import TestClient

from fixtures.base_api import INGESTA, insertar_evento
from fixtures.base_replay import base_temporal_replay, conninfo, hay_entorno, ms, SHA
from observatorio.api.main import crear_app, crear_repositorio
from observatorio.api.repositorio import BaseDatosNoDisponible, EstadoSalud
from observatorio.config import ConfigApi

hay_pg = pytest.mark.skipif(not hay_entorno(), reason="sin PostgreSQL o sin /sql montado")
ORIGEN = "http://localhost:4200"
CONFIG = ConfigApi(max_eventos=5000, max_ventana_horas=744, obsoleta_s=300, statement_timeout_s=10, margen_publicacion_s=900)
AHORA = 1_793_113_140_000                       # reloj de la API fijado (2026-10-27)
D = 1_742_000_000_000                           # 2025-03-15: tiempo ORIGINAL de los eventos reproducidos
H = 3_600_000
# Ejecución A (terminada): intervalo [D, D+4h]; ejecución B (en curso, más reciente): intervalo [D+10h, D+11h].
EVENTOS_A = [  # (id, offset de tiempo, mag, país, caso)
    ("ev1", 0, 4.0, "ZA1", None), ("ev2", 1 * H, 5.5, "ZB1", None), ("ev3", 2 * H, None, "ZA1", None),
    ("ev4", 4 * H, 6.2, None, None), ("replay-ctl-duplicado", 3 * H, 4.5, "ZA1", "duplicado"),
]
EVENTOS_B = [("ev1", 10 * H, 3.0, "ZA1", None), ("evB", 11 * H, 7.0, "ZB1", None)]


def sembrar_ejecucion(c, run, estado, desde, hasta, velocidad, iniciada, terminada, eventos, retirado=()):
    c.execute("INSERT INTO replay.ejecucion (run_id, dia, tamano, mensajes, criterio, intervalo_desde, intervalo_hasta, intervalo_s, velocidad, iniciada_at, terminada_at, estado) "
              "VALUES (%s, '2025-03-15', %s, %s, 'prueba', %s, %s, 2, %s, %s, %s, %s)",
              (run, len(eventos), len(eventos), ms(desde), ms(hasta), velocidad, ms(iniciada), ms(terminada) if terminada else None, estado))
    for i, (id_, off, mag, pais, caso) in enumerate(eventos):
        t = D + off                                           # tiempo ORIGINAL del evento
        c.execute(
            "INSERT INTO replay.evento_actual (run_id, event_id, event_time, updated_at, mag, mag_type, depth_km, longitude, latitude, place, country_id, country_name, "
            "geo_resultado, geo_catalogo, source, mode, ingested_at, kafka_topic, kafka_partition, kafka_offset, raw, retirado, caso) "
            "VALUES (%s, %s, %s, %s, %s, 'mb', 10, 1, 2, 'Lugar', %s, %s, %s, %s, 'replay-historico', 'replay', %s, 'terremotos.replay', 0, %s, '{}'::jsonb, %s, %s)",
            (run, id_, ms(t), ms(t), mag, pais, f"Pais {pais}" if pais else None, "interior" if pais else "sin_pais", SHA, ms(iniciada + 1000 * (i + 1)), i, id_ in retirado, caso))


@pytest.fixture(scope="module")
def cliente():
    if not hay_entorno():
        pytest.skip("sin PostgreSQL")
    with base_temporal_replay("obs_api_f6_modo") as info:
        with psycopg.connect(info, autocommit=True) as c:
            sembrar_ejecucion(c, "r-a", "terminada", D, D + 4 * H, 1200, AHORA - 5 * H, AHORA - 4 * H, EVENTOS_A, retirado=("ev4",))
            # B usa los mismos ids de evento que A (ev1): una ejecución no debe pisar ni mezclarse con otra
            sembrar_ejecucion(c, "r-b", "en_curso", D + 10 * H, D + 11 * H, 600, AHORA - 1 * H, None, EVENTOS_B)
            # eventos EN VIVO recientes y con el mismo id: jamás deben aparecer en replay
            insertar_evento(c, "ev1", AHORA - 60_000, 6.6, "ZA1")
            insertar_evento(c, "live-solo", AHORA - 120_000, 5.0, "ZB1")
            insertar_evento(c, "live-antiguo", D + H, 5.0, "ZA1")        # en el periodo de A, pero en vivo
            c.execute("UPDATE live.estado_ingesta SET ultima_consulta_ok_at = to_timestamp(%s / 1000.0) WHERE id = 1", (AHORA - 30_000,))
        app = crear_app(crear_repositorio(info, CONFIG), [ORIGEN], reloj=lambda: AHORA, config=CONFIG)
        with TestClient(app) as tc:
            yield tc


def ids(r):
    return [f["id"] for f in r.json()["features"]]


# --- validación estricta de mode y run -------------------------------------------------------------------------------

@hay_pg
@pytest.mark.parametrize("consulta", [
    "mode=foo", "mode=REPLAY", "mode=", "mode=live&run=r-a", "run=r-a", "mode=replay&run=no-existe", "mode=replay&run=", "mode=replay&run=a%20b",
    "mode=replay&run=" + "x" * 65, "mode=live&mode=replay", "mode=replay&run=r-a&run=r-b", "mode=replay;DROP",
])
@pytest.mark.parametrize("ruta", ["/api/eventos", "/api/estadisticas", "/api/salud"])
def test_mode_o_run_invalidos_son_422_en_los_tres_endpoints(cliente, ruta, consulta):
    r = cliente.get(f"{ruta}?{consulta}")
    assert r.status_code == 422, (ruta, consulta, r.text)
    assert r.json()["error"] == "parametro_invalido" and r.json()["detail"]


@hay_pg
def test_sin_mode_y_con_mode_live_son_identicas_y_sin_campos_de_replay(cliente):
    base = cliente.get("/api/eventos", params={"start": "2026-10-26T00:00:00Z", "end": "2026-10-28T00:00:00Z"})
    live = cliente.get("/api/eventos", params={"start": "2026-10-26T00:00:00Z", "end": "2026-10-28T00:00:00Z", "mode": "live"})
    assert base.status_code == live.status_code == 200 and base.json() == live.json()
    meta = base.json()["metadata"]
    assert meta["mode"] == "live" and "replay" not in meta and set(meta["coverage"]) == {"live_since"}
    assert sorted(ids(base)) == ["ev1", "live-solo"]
    assert all(set(f["properties"]) == {"mag", "magType", "place", "time", "updated", "country_id", "country_name"} for f in base.json()["features"])
    assert "replay" not in cliente.get("/api/salud").json() and "mode" not in cliente.get("/api/estadisticas").json()


@hay_pg
def test_live_por_defecto_sigue_siendo_24_horas_y_solo_live(cliente):
    r = cliente.get("/api/eventos")
    assert r.status_code == 200 and sorted(ids(r)) == ["ev1", "live-solo"]       # live-antiguo (2025) queda fuera de las 24 h
    assert r.json()["metadata"]["period"] == {"start": AHORA - 24 * H, "end": AHORA}


# --- replay lee solo replay.*, por ejecución ---------------------------------------------------------------------------

@hay_pg
def test_replay_por_defecto_lee_la_ejecucion_mas_reciente_aunque_este_en_curso(cliente):
    r = cliente.get("/api/eventos", params={"mode": "replay"})
    assert r.status_code == 200
    j = r.json()
    assert sorted(ids(r)) == ["ev1", "evB"]
    assert j["metadata"]["mode"] == "replay" and j["metadata"]["replay"]["run_id"] == "r-b" and j["metadata"]["replay"]["estado"] == "en_curso"
    assert "live-solo" not in ids(r) and j["metadata"]["total"] == 2


@hay_pg
def test_replay_de_una_ejecucion_concreta_no_mezcla_otras_ni_live_ni_retirados(cliente):
    r = cliente.get("/api/eventos", params={"mode": "replay", "run": "r-a"})
    j = r.json()
    assert j["metadata"]["replay"]["run_id"] == "r-a" and j["metadata"]["total"] == 4          # ev4 está retirado; ev1 de B y el ev1 en vivo no cuentan
    assert ids(r) == ["replay-ctl-duplicado", "ev3", "ev2", "ev1"]                              # orden: tiempo descendente
    assert "live-antiguo" not in ids(r) and "ev4" not in ids(r)
    assert {f["properties"]["time"] for f in j["features"] if f["id"] == "ev1"} == {D}          # el ev1 de A, no el de B (D+10h) ni el vivo


@hay_pg
def test_metadata_replay_y_propiedades_del_contrato(cliente):
    j = cliente.get("/api/eventos", params={"mode": "replay", "run": "r-a"}).json()
    assert j["metadata"]["replay"] == {"run_id": "r-a", "estado": "terminada", "tamano": 5, "velocidad": 1200.0,
                                       "intervalo": {"desde": D, "hasta": D + 4 * H}, "iniciada_at": AHORA - 5 * H, "terminada_at": AHORA - 4 * H}
    assert j["metadata"]["coverage"] == {"desde": D, "hasta": D + 4 * H}
    por_id = {f["id"]: f["properties"] for f in j["features"]}
    assert por_id["ev1"]["caso"] is None and por_id["replay-ctl-duplicado"]["caso"] == "duplicado"
    assert por_id["ev3"]["mag"] is None and j["metadata"]["sin_magnitud"] == 1                  # la magnitud nula sigue siendo null
    assert all(isinstance(p["replayed_at"], int) for p in por_id.values()) and por_id["ev1"]["replayed_at"] == AHORA - 5 * H + 1000 * 1
    assert all(set(p) == {"mag", "magType", "place", "time", "updated", "country_id", "country_name", "caso", "replayed_at"} for p in por_id.values())


@hay_pg
def test_el_periodo_por_defecto_es_el_intervalo_de_la_ejecucion_y_no_las_ultimas_24_horas(cliente):
    j = cliente.get("/api/eventos", params={"mode": "replay", "run": "r-a"}).json()
    assert j["metadata"]["period"] == {"start": D, "end": D + 4 * H + 1}                        # [desde, hasta + 1 ms): el último evento (hasta) entra
    assert j["metadata"]["period"]["end"] != AHORA and j["metadata"]["period"]["start"] != AHORA - 24 * H
    assert cliente.get("/api/estadisticas", params={"mode": "replay", "run": "r-a"}).json()["period"] == j["metadata"]["period"]


@hay_pg
def test_los_filtros_funcionan_igual_en_replay(cliente):
    def pedir(**p):
        return cliente.get("/api/eventos", params={"mode": "replay", "run": "r-a", **p})
    assert sorted(ids(pedir(min_mag="5"))) == ["ev2"]                                           # la nula no cumple el umbral
    assert sorted(ids(pedir(country_id="zb1"))) == ["ev2"]
    assert pedir(country_id="XXX").status_code == 422
    assert ids(pedir(limit="2")) == ["replay-ctl-duplicado", "ev3"] and pedir(limit="2").json()["metadata"]["next_offset"] == 2
    assert ids(pedir(limit="2", offset="2")) == ["ev2", "ev1"]
    assert ids(pedir(start="2025-03-15T00:00:00Z", end="2025-03-16T00:00:00Z")).count("ev1") == 1
    assert pedir(start="2026-01-01T00:00:00Z", end="2026-01-02T00:00:00Z").json()["features"] == []


@hay_pg
def test_los_parametros_desconocidos_siguen_siendo_422_en_replay(cliente):
    assert cliente.get("/api/eventos", params={"mode": "replay", "sort": "mag"}).status_code == 422


# --- estadísticas -----------------------------------------------------------------------------------------------------

@hay_pg
def test_estadisticas_de_replay_mismos_bloques_y_comparacion_no_aplica(cliente):
    j = cliente.get("/api/estadisticas", params={"mode": "replay", "run": "r-a"}).json()
    assert {"total", "sin_magnitud", "por_pais", "magnitud", "profundidad", "por_hora", "comparacion"} <= set(j)
    assert j["mode"] == "replay" and j["replay"]["run_id"] == "r-a"
    assert (j["total"], j["sin_magnitud"]) == (4, 1)
    assert j["comparacion"] == {"unit": "events", "comparacion_disponible": False, "motivo": "no_aplica_en_reproduccion", "historico": None, "variacion": None}
    assert {i["country_id"]: i["count"] for i in j["por_pais"]["items"]} == {"ZA1": 3, "ZB1": 1}
    assert sum(i["count"] for i in j["magnitud"]["items"]) + j["magnitud"]["sin_valor"] == 4
    assert sum(i["count"] for i in j["por_hora"]["items"]) == 4 and len(j["por_hora"]["items"]) == 5          # 5 horas UTC tocadas por [D, D+4h+1ms)


@hay_pg
def test_estadisticas_coinciden_con_los_eventos_de_la_misma_consulta(cliente):
    for run in ("r-a", "r-b"):
        e = cliente.get("/api/eventos", params={"mode": "replay", "run": run}).json()
        s = cliente.get("/api/estadisticas", params={"mode": "replay", "run": run}).json()
        assert s["total"] == e["metadata"]["total"] and s["sin_magnitud"] == e["metadata"]["sin_magnitud"]


@hay_pg
def test_estadisticas_en_vivo_conservan_la_comparacion_de_f5(cliente):
    j = cliente.get("/api/estadisticas").json()
    assert j["comparacion"]["reciente"]["source"] == "live" and "motivo" not in j["comparacion"]
    assert j["total"] == 2 and "replay" not in j


# --- salud ------------------------------------------------------------------------------------------------------------

@hay_pg
def test_salud_replay_anade_el_bloque_replay_y_mantiene_la_ingesta_en_vivo(cliente):
    vivo = cliente.get("/api/salud").json()
    j = cliente.get("/api/salud", params={"mode": "replay", "run": "r-a"}).json()
    assert {k: v for k, v in j.items() if k != "replay"} == vivo                                # los campos de F5 no cambian
    assert j["last_ingestion"] == AHORA - 30_000 and j["replay"]["run_id"] == "r-a" and j["replay"]["tamano"] == 5
    assert cliente.get("/api/salud", params={"mode": "replay"}).json()["replay"]["run_id"] == "r-b"


# --- sin ejecuciones y fallos --------------------------------------------------------------------------------------------

@hay_pg
def test_sin_ejecuciones_es_200_vacio_con_metadata_replay_nulo():
    with base_temporal_replay("obs_api_f6_vacio") as info:
        with psycopg.connect(info, autocommit=True) as c:
            insertar_evento(c, "ev1", AHORA - 60_000, 6.0, "ZA1")
            sembrar_ejecucion(c, "r-huerfana", "terminada", D, D + H, 600, AHORA, None, [("huerfano", 0, 5.0, "ZA1", None)])
            c.execute("DELETE FROM replay.ejecucion")             # filas de replay SIN ejecución registrada: con run_id nulo jamás deben mostrarse
        with TestClient(crear_app(crear_repositorio(info, CONFIG), [ORIGEN], reloj=lambda: AHORA, config=CONFIG)) as tc:
            j = tc.get("/api/eventos", params={"mode": "replay"}).json()
            assert j["features"] == [] and j["metadata"]["total"] == 0 and j["metadata"]["replay"] is None and j["metadata"]["mode"] == "replay"
            s = tc.get("/api/estadisticas", params={"mode": "replay"})
            assert s.status_code == 200 and s.json()["total"] == 0 and s.json()["replay"] is None
            assert tc.get("/api/salud", params={"mode": "replay"}).json()["replay"] is None
            assert tc.get("/api/eventos", params={"mode": "replay", "run": "r-a"}).status_code == 422
            assert [f["id"] for f in tc.get("/api/eventos").json()["features"]] == ["ev1"]        # live intacto


def test_validar_modo_y_formato_de_run_sin_base_de_datos():
    from observatorio.api.filtros import ErrorParametro, Filtros, validar_modo

    assert validar_modo(None, None) == ("live", None) and validar_modo("replay", None) == ("replay", None) and validar_modo("replay", "r-a.1_2") == ("replay", "r-a.1_2")
    for malo in ("a b", "", "x" * 65, "r;DROP", "r/../x", "ñ"):
        with pytest.raises(ErrorParametro, match="run no es un identificador"):
            validar_modo("replay", malo)
    with pytest.raises(ErrorParametro, match="solo se admite con mode=replay"):
        validar_modo("live", "r-a")
    with pytest.raises(ErrorParametro, match="mode debe ser"):
        validar_modo("Replay", None)
    donde, parametros = Filtros.desde_parametros(AHORA, modo="replay", run_id=None).donde()      # sin ejecución: nada coincide
    assert "run_id IS NULL" in donde and "f_run" not in parametros
    donde, parametros = Filtros.desde_parametros(AHORA, modo="replay", run_id="r-a").donde()
    assert "run_id = %(f_run)s" in donde and parametros["f_run"] == "r-a" and "r-a" not in donde
    assert "run_id" not in Filtros.desde_parametros(AHORA).donde()[0]                            # en vivo la cláusula es la de F5


class RepoCaido:
    async def abrir(self): ...
    async def cerrar(self): ...

    async def ejecucion(self, run_id):
        raise BaseDatosNoDisponible("OperationalError")

    async def estado_salud(self):
        raise BaseDatosNoDisponible("OperationalError")

    async def pagina_eventos(self, *a):
        raise BaseDatosNoDisponible("OperationalError")


@pytest.mark.parametrize("ruta", ["/api/eventos", "/api/estadisticas", "/api/salud"])
def test_postgresql_caido_en_replay_es_503_nunca_una_lista_vacia(ruta):
    r = TestClient(crear_app(RepoCaido(), [ORIGEN], reloj=lambda: AHORA, config=CONFIG)).get(ruta, params={"mode": "replay"})
    assert r.status_code == 503 and r.json()["error"] == "base_de_datos_no_disponible" and "features" not in r.json()


def test_la_validacion_de_mode_ocurre_antes_de_consultar_la_base():
    r = TestClient(crear_app(RepoCaido(), [ORIGEN], reloj=lambda: AHORA, config=CONFIG)).get("/api/eventos", params={"mode": "otro"})
    assert r.status_code == 422                                                                 # con la base caída, un parámetro inválido sigue siendo 422
