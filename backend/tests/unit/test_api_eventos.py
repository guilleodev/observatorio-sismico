"""Pruebas de la API con TestClient (repositorio simulado) y consulta real de la ventana de 24 h."""

import asyncio
import os
from contextlib import asynccontextmanager

import psycopg
import pytest
from fastapi.testclient import TestClient

from observatorio.api.main import crear_app
from observatorio.api.repositorio import BaseDatosNoDisponible, RepositorioApi, a_geojson
from observatorio.config import ConfigPostgres
from observatorio.consumer.mensaje import interpretar_mensaje
from observatorio.consumer.repositorio import RepositorioEventos
from fixtures.mensajes import construir_evento, construir_mensaje, serializar

AHORA = 1_793_113_140_000
ORIGEN = "http://localhost:4200"


def fila(id_="prueba-001", **cambios):
    base = {"id": id_, "lon": -3.7, "lat": 40.4, "depth": 12.0, "mag": 3.2, "mag_type": "ml",
            "place": "Lugar de prueba", "time": AHORA - 600_000, "updated": AHORA - 600_000,
            "country_id": None, "country_name": None}
    return {**base, **cambios}


class RepoFalso:
    def __init__(self, eventos=None, ultima=None, falla=False):
        self.eventos, self.ultima, self.falla = eventos or [], ultima, falla

    async def abrir(self): ...
    async def cerrar(self): ...

    async def comprobar_base(self):
        if self.falla:
            raise BaseDatosNoDisponible("OperationalError")

    async def eventos_recientes(self, ahora_ms):
        if self.falla:
            raise BaseDatosNoDisponible("OperationalError")
        return self.eventos

    async def ultima_ingestion(self):
        if self.falla:
            raise BaseDatosNoDisponible("OperationalError")
        return self.ultima


def cliente(repo):
    return TestClient(crear_app(repo, [ORIGEN], reloj=lambda: AHORA))


def test_estructura_geojson_y_metadatos():
    r = cliente(RepoFalso([fila()], ultima=AHORA - 5_000)).get("/api/eventos")
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/json")
    cuerpo = r.json()
    assert cuerpo["type"] == "FeatureCollection"
    assert cuerpo["metadata"] == {"generated": AHORA, "last_ingestion": AHORA - 5_000,
                                  "mode": "live", "count": 1, "truncated": False}
    f = cuerpo["features"][0]
    assert f["type"] == "Feature" and f["id"] == "prueba-001"
    assert f["geometry"] == {"type": "Point", "coordinates": [-3.7, 40.4, 12.0]}  # lon, lat, prof.
    assert set(f["properties"]) == {"mag", "magType", "place", "time", "updated", "country_id", "country_name"}
    assert f["properties"]["time"] == AHORA - 600_000


def test_nulos_se_serializan_como_null():
    r = cliente(RepoFalso([fila(mag=None, depth=None)], ultima=1)).get("/api/eventos")
    f = r.json()["features"][0]
    assert f["properties"]["mag"] is None and f["geometry"]["coordinates"][2] is None
    assert f["properties"]["country_id"] is None
    assert "NaN" not in r.text and "Infinity" not in r.text


def test_sin_eventos_devuelve_lista_vacia_y_last_ingestion_null():
    r = cliente(RepoFalso()).get("/api/eventos")
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["features"] == [] and cuerpo["metadata"]["count"] == 0
    assert cuerpo["metadata"]["last_ingestion"] is None


def test_base_caida_devuelve_503_no_lista_vacia():
    r = cliente(RepoFalso(falla=True)).get("/api/eventos")
    assert r.status_code == 503
    assert r.json()["error"] == "base_de_datos_no_disponible" and "features" not in r.json()


def test_salud_ok_y_503():
    ok = cliente(RepoFalso(ultima=None)).get("/api/salud")
    assert ok.status_code == 200
    assert ok.json() == {"status": "ok", "database": "ok", "last_ingestion": None}
    assert cliente(RepoFalso(falla=True)).get("/api/salud").status_code == 503


def test_ninguna_respuesta_contiene_synthetic_y_el_modo_es_contractual():
    for ruta in ("/api/eventos", "/api/salud"):
        r = cliente(RepoFalso([fila()])).get(ruta)
        assert "synthetic" not in r.text.lower()
    assert cliente(RepoFalso()).get("/api/eventos").json()["metadata"]["mode"] in ("live", "replay")


@pytest.mark.parametrize("modo", ["synthetic", "otro", ""])
def test_a_geojson_rechaza_modos_no_contractuales(modo):
    with pytest.raises(ValueError):
        a_geojson([], AHORA, None, modo=modo)


def test_a_geojson_admite_replay_y_live():
    assert a_geojson([], AHORA, None, modo="replay")["metadata"]["mode"] == "replay"
    assert a_geojson([], AHORA, None)["metadata"]["mode"] == "live"


def test_cors_origen_permitido():
    r = cliente(RepoFalso()).get("/api/eventos", headers={"Origin": ORIGEN})
    assert r.headers["access-control-allow-origin"] == ORIGEN


def test_cors_preflight_con_cabecera_de_ngrok():
    r = cliente(RepoFalso()).options("/api/eventos", headers={
        "Origin": ORIGEN, "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "ngrok-skip-browser-warning"})
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == ORIGEN
    assert "ngrok-skip-browser-warning" in r.headers["access-control-allow-headers"].lower()


def test_cors_origen_no_autorizado_sin_cabecera():
    r = cliente(RepoFalso()).get("/api/eventos", headers={"Origin": "https://otro.example"})
    assert "access-control-allow-origin" not in r.headers


# --- Ventana de 24 h contra PostgreSQL real (se revierte todo) ---------------------------------

hay_pg = pytest.mark.skipif(not os.environ.get("POSTGRES_HOST"), reason="sin PostgreSQL")


def _mensaje(secuencia, minutos_atras):
    msg = construir_mensaje(construir_evento(secuencia, minutos_atras, ahora=AHORA), ahora=AHORA)
    return interpretar_mensaje(serializar(msg)[1])


@hay_pg
def test_ventana_24h_excluye_el_antiguo_e_incluye_el_reciente():
    async def prueba():
        conninfo = ConfigPostgres.desde_entorno().conninfo()
        async with await psycopg.AsyncConnection.connect(conninfo) as conn:
            async with conn.transaction(force_rollback=True):
                @asynccontextmanager
                async def misma_conexion():
                    yield conn

                escritor, lector = RepositorioEventos(conn), RepositorioApi(misma_conexion)
                await escritor.guardar_version(_mensaje(950, 10), "t", 0, 1)     # reciente (10 min)
                await escritor.guardar_version(_mensaje(951, 1500), "t", 0, 2)   # 25 h: fuera de la ventana
                ids = [e["id"] for e in await lector.eventos_recientes(AHORA)]
                assert "prueba-950" in ids and "prueba-951" not in ids
                assert await lector.ultima_ingestion() is None  # sin consultas a USGS todavía (paso 3.2)
    asyncio.run(prueba())


def test_conexion_fallida_se_traduce_a_base_no_disponible():
    @asynccontextmanager
    async def rota():
        raise psycopg.OperationalError("caída simulada")
        yield

    with pytest.raises(BaseDatosNoDisponible):
        asyncio.run(RepositorioApi(rota).eventos_recientes(AHORA))
