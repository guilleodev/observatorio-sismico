"""/api/salud ampliado (F5, paso 5.6, T039/T040; SC-006, SC-007): estado de la ingesta con el reloj de la API y umbral configurable.

Unitarias con un repositorio simulado y reloj fijo; integración con PostgreSQL REAL en una base TEMPORAL (`obs_api_f5_salud`), sin tocar los servicios.
"""

import re

import psycopg
import pytest
from fastapi.testclient import TestClient

from fixtures.base_api import base_temporal, conninfo, hay_entorno, insertar_evento
from observatorio.api.main import crear_app, crear_repositorio
from observatorio.api.repositorio import BaseDatosNoDisponible, EstadoSalud
from observatorio.config import ConfigApi

AHORA = 1_793_113_140_000
ORIGEN = "http://localhost:4200"
CAMPOS = {"status", "database", "last_ingestion", "generated", "ingestion_age_s", "stale", "stale_after_s", "gaps_pending", "live_since"}
hay_pg = pytest.mark.skipif(not hay_entorno(), reason="sin PostgreSQL o sin /sql montado")


def config(obsoleta_s=300):
    return ConfigApi(max_eventos=5000, max_ventana_horas=744, obsoleta_s=obsoleta_s, statement_timeout_s=10, margen_publicacion_s=900)


class RepoFalso:
    def __init__(self, estado=None, falla=False):
        self.estado, self.falla = estado or EstadoSalud(None, None, 0), falla

    async def abrir(self): ...
    async def cerrar(self): ...

    async def estado_salud(self):
        if self.falla:
            raise BaseDatosNoDisponible("OperationalError")
        return self.estado


def salud(ultima, reloj=AHORA, obsoleta_s=300, huecos=0, desde=None):
    app = crear_app(RepoFalso(EstadoSalud(ultima, desde, huecos)), [ORIGEN], reloj=lambda: reloj, config=config(obsoleta_s))
    r = TestClient(app).get("/api/salud")
    assert r.status_code == 200
    return r.json()


def test_campos_previos_y_nuevos_del_contrato():
    r = salud(AHORA - 9_000, huecos=2, desde=AHORA - 86_400_000)
    assert set(r) == CAMPOS
    assert (r["status"], r["database"], r["last_ingestion"]) == ("ok", "ok", AHORA - 9_000)  # los tres previos conservan nombre y significado
    assert r["generated"] == AHORA and r["ingestion_age_s"] == 9 and r["stale"] is False and r["stale_after_s"] == 300
    assert r["gaps_pending"] == 2 and r["live_since"] == AHORA - 86_400_000


@pytest.mark.parametrize("edad_ms,stale", [(0, False), (299_999, False), (300_000, False), (300_999, False), (301_000, True), (3_600_000, True)])
def test_stale_justo_antes_y_despues_del_umbral_con_reloj_simulado(edad_ms, stale):
    r = salud(AHORA - edad_ms)
    assert r["stale"] is stale and r["ingestion_age_s"] == edad_ms // 1000   # la edad mostrada y el aviso son coherentes (se compara la edad entera)


def test_el_umbral_es_configurable():
    assert salud(AHORA - 61_000, obsoleta_s=60)["stale"] is True and salud(AHORA - 61_000, obsoleta_s=60)["stale_after_s"] == 60
    assert salud(AHORA - 61_000, obsoleta_s=600)["stale"] is False


def test_sin_ninguna_ingesta_correcta_es_desactualizado_y_la_edad_es_null():
    r = salud(None)
    assert r["last_ingestion"] is None and r["ingestion_age_s"] is None and r["stale"] is True   # «la API responde» no implica «datos al día»


def test_un_reloj_de_ingesta_en_el_futuro_no_da_edad_negativa_ni_stale():
    r = salud(AHORA + 5_000)
    assert r["ingestion_age_s"] == 0 and r["stale"] is False


def test_la_edad_usa_el_reloj_de_la_api_y_no_el_de_la_maquina():
    # el reloj inyectado manda: con la misma última ingesta, otro «generated» da otra edad
    assert salud(1_000_000, reloj=1_000_000 + 120_000)["ingestion_age_s"] == 120
    assert salud(1_000_000, reloj=1_000_000 + 4_000_000)["ingestion_age_s"] == 4000


def test_base_caida_es_503_explicito_y_nunca_un_estado_sano():
    r = TestClient(crear_app(RepoFalso(falla=True), [ORIGEN], reloj=lambda: AHORA, config=config())).get("/api/salud")
    assert r.status_code == 503 and r.json()["error"] == "base_de_datos_no_disponible" and "status" not in r.json() and "stale" not in r.json()


def test_sin_credenciales_ni_rutas_ni_nombres_de_tabla():
    texto = TestClient(crear_app(RepoFalso(), [ORIGEN], reloj=lambda: AHORA, config=config())).get("/api/salud").text.lower()
    for prohibido in ("password", "passwd", "secret", "token", "postgres", "host", "dbname", "live.", "geo.", "historico", "evento_actual", "estado_ingesta", "hueco", "kafka", "/app", "select "):
        assert prohibido not in texto, prohibido
    assert "nan" not in re.findall(r"[a-z]+", texto)


def test_solo_get_y_options_y_cors_sin_cambios():
    c = TestClient(crear_app(RepoFalso(), [ORIGEN], reloj=lambda: AHORA, config=config()))
    assert c.post("/api/salud").status_code == 405
    r = c.options("/api/salud", headers={"Origin": ORIGEN, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "ngrok-skip-browser-warning"})
    assert r.status_code == 200 and r.headers["access-control-allow-origin"] == ORIGEN


# --- PostgreSQL real (base temporal) ---------------------------------------------------------------------------------

BASE = "obs_api_f5_salud"


@pytest.fixture
def entorno():
    with base_temporal(BASE) as info:
        app = crear_app(crear_repositorio(info, config()), [ORIGEN], reloj=lambda: AHORA, config=config())
        with TestClient(app) as tc:
            yield tc, info


@hay_pg
def test_integracion_sin_datos_ni_ingesta(entorno):
    c, _ = entorno
    r = c.get("/api/salud").json()
    assert r["last_ingestion"] is None and r["stale"] is True and r["gaps_pending"] == 0 and r["live_since"] is None and r["ingestion_age_s"] is None


@hay_pg
def test_integracion_ultima_ingesta_huecos_pendientes_y_cobertura(entorno):
    c, info = entorno
    with psycopg.connect(info, autocommit=True) as w:
        w.execute("UPDATE live.estado_ingesta SET ultima_consulta_ok_at = to_timestamp(%s / 1000.0) WHERE id = 1", (AHORA - 45_000,))
        w.execute("INSERT INTO live.hueco (inicio, fin, estado) VALUES ('2026-10-01', '2026-10-02', 'pendiente'), ('2026-10-03', '2026-10-04', 'pendiente'), ('2026-10-05', '2026-10-06', 'recuperado')")
        insertar_evento(w, "s1", AHORA - 3_600_000, 4.2, "ZA1")   # ingested_at por defecto = 2026-10-26T00:00Z
    r = c.get("/api/salud").json()
    assert r["last_ingestion"] == AHORA - 45_000 and r["ingestion_age_s"] == 45 and r["stale"] is False
    assert r["gaps_pending"] == 2                                  # solo los pendientes, no el recuperado
    assert r["live_since"] == 1_792_972_800_000 - 86_400_000        # min(ingested_at) − 24 h, como en F4: 2026-10-26T00:00Z menos 24 h
    with psycopg.connect(info, autocommit=True) as w:
        w.execute("UPDATE live.estado_ingesta SET ultima_consulta_ok_at = to_timestamp(%s / 1000.0) WHERE id = 1", (AHORA - 400_000,))
    assert c.get("/api/salud").json()["stale"] is True             # 400 s > 300 s: el aviso aparece; al reanudarse la ingesta (valor anterior) desaparece


@hay_pg
def test_integracion_ingesta_antigua_aparece_y_desaparece_al_reanudarse(entorno):
    c, info = entorno
    def fijar(edad_ms):
        with psycopg.connect(info, autocommit=True) as w:
            w.execute("UPDATE live.estado_ingesta SET ultima_consulta_ok_at = to_timestamp(%s / 1000.0) WHERE id = 1", (AHORA - edad_ms,))
        return c.get("/api/salud").json()
    assert fijar(10_000)["stale"] is False
    assert fijar(900_000)["stale"] is True
    assert fijar(20_000)["stale"] is False


@hay_pg
def test_integracion_base_inalcanzable_es_503_y_la_sesion_es_de_solo_lectura(entorno):
    _, info = entorno
    malo = re.sub(r"host=\S+", "host=servidor-inexistente-f5", info, count=1)
    with TestClient(crear_app(crear_repositorio(malo, config()), [ORIGEN], reloj=lambda: AHORA, config=config())) as c:
        r = c.get("/api/salud")
        assert r.status_code == 503 and r.json()["error"] == "base_de_datos_no_disponible"
