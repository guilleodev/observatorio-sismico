"""Repositorio del productor contra PostgreSQL real (esquema live). Cada prueba se REVIERTE (ROLLBACK)."""

import asyncio
import gzip
import json
import os

import psycopg
import pytest

from observatorio.config import ConfigPostgres
from observatorio.producer.repositorio import RepositorioProductor
from observatorio.producer.usgs import ErrorUsgs, Respuesta

pytestmark = pytest.mark.skipif(not os.environ.get("POSTGRES_HOST"), reason="sin PostgreSQL")
AHORA = 1_793_113_140_000


def respuesta():
    cuerpo = json.dumps({"type": "FeatureCollection", "features": [{"id": "a"}]}).encode()
    return Respuesta(cuerpo=cuerpo, http_status=200, duracion_ms=150, bytes=len(cuerpo), intentos=2, datos=json.loads(cuerpo))


async def _revertida(prueba):
    conninfo = ConfigPostgres.desde_entorno().conninfo()
    async with await psycopg.AsyncConnection.connect(conninfo) as conn:
        async with conn.transaction(force_rollback=True):  # el repositorio usa savepoints dentro
            await prueba(conn, RepositorioProductor(conn))


def ejecutar(prueba):
    asyncio.run(_revertida(prueba))


def test_maximos_publicados_por_evento_y_marcado_idempotente():
    async def prueba(conn, repo):
        await repo.marcar_publicada("prueba-a", 1000, 0, 5)
        await repo.marcar_publicada("prueba-a", 2000, 0, 6)
        await repo.marcar_publicada("prueba-a", 2000, 0, 7)  # repetida: no falla ni duplica
        await repo.marcar_publicada("prueba-b", 500, 0, 8)
        assert await repo.maximos_publicados(["prueba-a", "prueba-b", "prueba-c"]) == {"prueba-a": 2000, "prueba-b": 500}
        assert await repo.maximos_publicados([]) == {}
        cur = await conn.execute("SELECT count(*) FROM live.version_publicada WHERE event_id LIKE 'prueba-%'")
        assert (await cur.fetchone())[0] == 3

    ejecutar(prueba)


def test_registrar_ok_guarda_consulta_copia_comprimida_y_estado():
    async def prueba(conn, repo):
        resp = respuesta()
        antes = (await (await conn.execute("SELECT consultas_ok FROM live.estado_ingesta WHERE id = 1")).fetchone())[0]
        consulta_id = await repo.registrar_ok(AHORA, resp, 1, "hash1", gzip.compress(resp.cuerpo))
        fila = await (await conn.execute(
            "SELECT resultado, http_status, bytes, eventos, intentos, duracion_ms, extract(epoch FROM iniciada_at)*1000 "
            "FROM live.consulta_extraccion WHERE id = %s", (consulta_id,))).fetchone()
        assert fila[:6] == ("ok", 200, resp.bytes, 1, 2, 150) and int(fila[6]) == AHORA
        gz = (await (await conn.execute("SELECT contenido_gz FROM live.respuesta_original WHERE consulta_id = %s",
                                        (consulta_id,))).fetchone())[0]
        assert gzip.decompress(gz) == resp.cuerpo
        estado = await (await conn.execute(
            "SELECT consultas_ok, ultimo_hash_features, extract(epoch FROM ultima_consulta_ok_at)*1000 "
            "FROM live.estado_ingesta WHERE id = 1")).fetchone()
        assert estado[0] == antes + 1 and estado[1] == "hash1" and int(estado[2]) == AHORA + resp.duracion_ms  # instante de recepción
        assert await repo.ultimo_hash() == "hash1"

    ejecutar(prueba)


def test_registrar_ok_sin_copia_no_crea_respuesta_original():
    async def prueba(conn, repo):
        consulta_id = await repo.registrar_ok(AHORA, respuesta(), 1, "hash2", None)
        cur = await conn.execute("SELECT count(*) FROM live.respuesta_original WHERE consulta_id = %s", (consulta_id,))
        assert (await cur.fetchone())[0] == 0

    ejecutar(prueba)


def test_registrar_error_no_avanza_la_ultima_consulta_correcta():
    async def prueba(conn, repo):
        await repo.registrar_ok(AHORA, respuesta(), 1, "h", None)
        antes = await (await conn.execute("SELECT ultima_consulta_ok_at, consultas_error FROM live.estado_ingesta WHERE id = 1")).fetchone()
        await repo.registrar_error(AHORA + 60_000, ErrorUsgs("HTTP 503", http_status=503, intentos=4))
        despues = await (await conn.execute(
            "SELECT ultima_consulta_ok_at, consultas_error, ultimo_error, ultimo_hash_features FROM live.estado_ingesta WHERE id = 1")).fetchone()
        assert despues[0] == antes[0] and despues[1] == antes[1] + 1
        assert "503" in despues[2] and despues[3] == "h"  # el último hash válido se conserva
        fila = await (await conn.execute(
            "SELECT resultado, http_status, intentos, error FROM live.consulta_extraccion ORDER BY id DESC LIMIT 1")).fetchone()
        assert fila[:3] == ("error", 503, 4) and "503" in fila[3]

    ejecutar(prueba)


def test_actualizar_conteos_y_error_de_publicacion():
    async def prueba(conn, repo):
        consulta_id = await repo.registrar_ok(AHORA, respuesta(), 3, "h3", None)
        await repo.actualizar_conteos(consulta_id, 2, 1)
        fila = await (await conn.execute("SELECT publicadas, omitidas FROM live.consulta_extraccion WHERE id = %s", (consulta_id,))).fetchone()
        assert fila == (2, 1)
        await repo.registrar_error_publicacion("Kafka caído")
        e = await (await conn.execute("SELECT ultimo_error FROM live.estado_ingesta WHERE id = 1")).fetchone()
        assert e[0] == "Kafka caído"

    ejecutar(prueba)


def test_las_pruebas_no_dejan_datos():
    async def prueba(conn, repo):
        await repo.marcar_publicada("prueba-z", 1, 0, 0)

    ejecutar(prueba)

    async def comprobar():
        async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
            cur = await conn.execute("SELECT count(*) FROM live.version_publicada WHERE event_id LIKE 'prueba-%'")
            return (await cur.fetchone())[0]

    assert asyncio.run(comprobar()) == 0
