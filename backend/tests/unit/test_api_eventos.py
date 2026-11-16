"""Pruebas de la API con TestClient (repositorio simulado) y consulta real de la ventana de 24 h."""

import asyncio
import json
import os
from contextlib import asynccontextmanager

import psycopg
import pytest
from fastapi.testclient import TestClient

from observatorio.api.main import crear_app
from observatorio.api.filtros import Filtros
from observatorio.api.repositorio import BaseDatosNoDisponible, EstadoSalud, PaginaEventos, RepositorioApi, a_geojson
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

    async def estado_salud(self):
        if self.falla:
            raise BaseDatosNoDisponible("OperationalError")
        return EstadoSalud(self.ultima, None, 0)

    async def pagina_eventos(self, filtros, limit, offset):
        if self.falla:
            raise BaseDatosNoDisponible("OperationalError")
        pagina = self.eventos[offset:offset + limit]
        return PaginaEventos(pagina, len(self.eventos), sum(1 for e in self.eventos if e["mag"] is None), self.ultima, None)

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
                                  "mode": "live", "count": 1, "truncated": False,
                                  # F5: campos aditivos del contrato (los cinco anteriores conservan nombre y significado)
                                  "total": 1, "limit": 5000, "offset": 0, "next_offset": None, "sin_magnitud": 0,
                                  "period": {"start": AHORA - 86_400_000, "end": AHORA}, "coverage": {"live_since": None}}
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
    # F5 (5.6): campos aditivos del contrato; status, database y last_ingestion conservan nombre y significado
    assert ok.json() == {"status": "ok", "database": "ok", "last_ingestion": None, "generated": AHORA, "ingestion_age_s": None, "stale": True,
                         "stale_after_s": 300, "gaps_pending": 0, "live_since": None,
                         "fuentes": {"emsc": {"activa": False, "last_ingestion": None, "ingestion_age_s": None}}}  # F8: bloque aditivo
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
                ids = [e["id"] for e in (await lector.pagina_eventos(Filtros.desde_parametros(AHORA), 5000, 0)).eventos]
                assert "prueba-950" in ids and "prueba-951" not in ids
                assert await lector.ultima_ingestion() != 0  # viene de estado_ingesta; sus casos están en test_last_ingestion.py
    asyncio.run(prueba())


def test_conexion_fallida_se_traduce_a_base_no_disponible():
    @asynccontextmanager
    async def rota():
        raise psycopg.OperationalError("caída simulada")
        yield

    with pytest.raises(BaseDatosNoDisponible):
        asyncio.run(RepositorioApi(rota).pagina_eventos(Filtros.desde_parametros(AHORA), 5000, 0))


@hay_pg
def test_los_eventos_retirados_no_aparecen_en_la_api():
    """Un evento reclasificado a no sísmico (retirado) se queda en la base pero la API no lo devuelve."""
    async def prueba():
        conninfo = ConfigPostgres.desde_entorno().conninfo()
        async with await psycopg.AsyncConnection.connect(conninfo) as conn:
            async with conn.transaction(force_rollback=True):
                @asynccontextmanager
                async def misma_conexion():
                    yield conn

                escritor, lector = RepositorioEventos(conn), RepositorioApi(misma_conexion)
                await escritor.guardar_version(_mensaje(960, 10), "t", 0, 1)
                await escritor.guardar_version(_mensaje(961, 10), "t", 0, 2)
                assert await escritor.retirar_evento("prueba-961", AHORA + 1) is True
                ids = [e["id"] for e in (await lector.pagina_eventos(Filtros.desde_parametros(AHORA), 5000, 0)).eventos]
                assert "prueba-960" in ids and "prueba-961" not in ids
                cur = await conn.execute("SELECT count(*) FROM live.evento_actual WHERE event_id = 'prueba-961'")
                assert (await cur.fetchone())[0] == 1  # no se borra: solo deja de mostrarse

    asyncio.run(prueba())


@hay_pg
def test_la_api_devuelve_el_pais_asignado_o_null_sin_cambiar_el_resto(tmp_path):
    """F4: country_id y country_name salen de live.evento_actual (catálogo de juguete sembrado en la transacción revertida)."""
    from fixtures.geo import escribir_catalogo
    from observatorio.geo.asignador import Asignador
    from observatorio.geo.catalogo import leer_catalogo

    catalogo = leer_catalogo(escribir_catalogo(tmp_path / "juguete.geojson"))

    def con_coordenadas(secuencia, lon, lat):
        msg = construir_mensaje(construir_evento(secuencia, 10, ahora=AHORA), ahora=AHORA)
        msg["event"]["geometry"]["coordinates"] = [lon, lat, 12]
        return interpretar_mensaje(serializar(msg)[1])

    async def prueba():
        async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
            async with conn.transaction(force_rollback=True):
                await conn.execute("INSERT INTO geo.catalogo (sha256, archivo, entidades) VALUES (%s, %s, %s)", (catalogo.sha256, catalogo.archivo, len(catalogo.paises)))
                for p in catalogo.paises:
                    await conn.execute("INSERT INTO geo.pais (country_id, nombre_es, nombre_en) VALUES (%s, %s, %s)", (p.country_id, p.nombre_es, p.nombre_en))

                @asynccontextmanager
                async def misma_conexion():
                    yield conn

                escritor, lector = RepositorioEventos(conn, Asignador(catalogo)), RepositorioApi(misma_conexion)
                await escritor.guardar_version(con_coordenadas(970, 5, 5), "t", 0, 1)  # dentro de ZA1
                await escritor.guardar_version(con_coordenadas(971, 100, 50), "t", 0, 2)  # mar abierto: sin país
                por_id = {e["id"]: e for e in (await lector.pagina_eventos(Filtros.desde_parametros(AHORA), 5000, 0)).eventos}
                assert (por_id["prueba-970"]["country_id"], por_id["prueba-970"]["country_name"]) == ("ZA1", "Alfa")
                assert (por_id["prueba-971"]["country_id"], por_id["prueba-971"]["country_name"]) == (None, None)
                cuerpo = a_geojson([por_id["prueba-970"], por_id["prueba-971"]], AHORA, None)
                props = [f["properties"] for f in cuerpo["features"]]
                assert all(set(p) == {"mag", "magType", "place", "time", "updated", "country_id", "country_name", "source"} for p in props)  # contrato intacto; F8 añade `source` (aditivo)
                assert "NaN" not in json.dumps(cuerpo)

    asyncio.run(prueba())
