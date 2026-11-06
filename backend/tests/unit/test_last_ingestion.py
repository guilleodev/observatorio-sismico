"""`last_ingestion` = última consulta CORRECTA a USGS (paso 3.6). Cada prueba con PostgreSQL se REVIERTE."""

import asyncio
import json
import os
from contextlib import asynccontextmanager

import psycopg
import pytest
from fastapi.testclient import TestClient

from observatorio.api.main import crear_app
from observatorio.api.repositorio import RepositorioApi
from observatorio.config import ConfigPostgres
from observatorio.producer.repositorio import RepositorioProductor
from observatorio.producer.usgs import ErrorUsgs, Respuesta

AHORA = 1_793_113_140_000
hay_pg = pytest.mark.skipif(not os.environ.get("POSTGRES_HOST"), reason="sin PostgreSQL")


class RepoFalso:
    def __init__(self, ultima):
        self.ultima = ultima

    async def abrir(self): ...
    async def cerrar(self): ...
    async def comprobar_base(self): ...
    async def eventos_recientes(self, ahora_ms): return []
    async def ultima_ingestion(self): return self.ultima


def cliente(ultima):
    return TestClient(crear_app(RepoFalso(ultima), ["http://localhost:4200"], reloj=lambda: AHORA))


def test_la_api_devuelve_el_instante_de_la_ultima_consulta_correcta_en_los_dos_endpoints():
    c = cliente(AHORA - 12_000)
    assert c.get("/api/eventos").json()["metadata"]["last_ingestion"] == AHORA - 12_000
    assert c.get("/api/salud").json() == {"status": "ok", "database": "ok", "last_ingestion": AHORA - 12_000}


def test_sin_consultas_correctas_last_ingestion_es_null_aunque_la_api_responda():
    c = cliente(None)
    assert c.get("/api/eventos").json()["metadata"]["last_ingestion"] is None
    assert c.get("/api/salud").json()["last_ingestion"] is None  # «la API responde» no implica «datos al día»


def respuesta():
    cuerpo = json.dumps({"type": "FeatureCollection", "features": []}).encode()
    return Respuesta(cuerpo=cuerpo, http_status=200, duracion_ms=100, bytes=len(cuerpo), intentos=1, datos=json.loads(cuerpo))


async def _revertida(prueba):
    async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
        async with conn.transaction(force_rollback=True):
            @asynccontextmanager
            async def misma_conexion():
                yield conn

            await prueba(conn, RepositorioProductor(conn), RepositorioApi(misma_conexion))


def ejecutar(prueba):
    asyncio.run(_revertida(prueba))


@hay_pg
def test_last_ingestion_nulo_valor_y_no_avanza_con_consultas_fallidas():
    async def prueba(conn, productor, api):
        await conn.execute("UPDATE live.estado_ingesta SET ultima_consulta_ok_at = NULL, ultimo_error = NULL WHERE id = 1")
        assert await api.ultima_ingestion() is None  # antes de la primera consulta correcta

        await productor.registrar_ok(AHORA, respuesta(), 0, "h", None)
        assert await api.ultima_ingestion() == AHORA + 100  # instante en que se terminó de recibir la respuesta

        await productor.registrar_error(AHORA + 60_000, ErrorUsgs("HTTP 503", http_status=503, intentos=4))
        await productor.registrar_error(AHORA + 120_000, ErrorUsgs("tiempo agotado", intentos=4))
        assert await api.ultima_ingestion() == AHORA + 100  # las consultas fallidas no lo avanzan
        error, n_errores = await (await conn.execute("SELECT ultimo_error, consultas_error FROM live.estado_ingesta WHERE id = 1")).fetchone()
        assert error == "tiempo agotado" and n_errores >= 2  # pero el error queda registrado

        await productor.registrar_ok(AHORA + 180_000, respuesta(), 0, "h", None)
        assert await api.ultima_ingestion() == AHORA + 180_100  # al recuperarse vuelve a avanzar

    ejecutar(prueba)


@hay_pg
def test_las_pruebas_no_alteran_el_estado_de_ingesta_real():
    async def leer():
        async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
            return await (await conn.execute("SELECT consultas_ok, ultimo_error FROM live.estado_ingesta WHERE id = 1")).fetchone()

    antes = asyncio.run(leer())

    async def prueba(conn, productor, api):
        await productor.registrar_error(AHORA, ErrorUsgs("prueba", intentos=1))

    ejecutar(prueba)
    assert asyncio.run(leer()) == antes
