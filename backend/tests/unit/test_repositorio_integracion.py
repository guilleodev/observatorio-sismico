"""Prueba contra PostgreSQL real. Se omite si no hay POSTGRES_HOST. Todo se revierte (ROLLBACK)."""

import asyncio
import os

import psycopg
import pytest

from observatorio.config import ConfigPostgres
from observatorio.consumer.mensaje import interpretar_mensaje
from observatorio.consumer.repositorio import RepositorioEventos
from observatorio.sintetico import construir_evento, construir_mensaje, serializar

pytestmark = pytest.mark.skipif(not os.environ.get("POSTGRES_HOST"), reason="sin PostgreSQL")
AHORA = 1_793_113_140_000


def evento(secuencia=900, ahora=AHORA, mutar=None):
    msg = construir_mensaje(construir_evento(secuencia, ahora=ahora), ahora=ahora)
    if mutar:
        mutar(msg)
    return interpretar_mensaje(serializar(msg)[1])


async def _revertida(prueba):
    conninfo = ConfigPostgres.desde_entorno().conninfo()
    async with await psycopg.AsyncConnection.connect(conninfo) as conn:
        async with conn.transaction(force_rollback=True):  # el repositorio usa un savepoint dentro
            await prueba(conn, RepositorioEventos(conn))


def ejecutar(prueba):
    asyncio.run(_revertida(prueba))


def test_inserta_y_conserva_los_campos():
    async def prueba(conn, repo):
        assert await repo.guardar(evento(), "t", 0, 7) is True
        cur = await conn.execute(
            "SELECT mode, mag, depth_km, kafka_offset, raw->>'id', extract(epoch FROM event_time)*1000 "
            "FROM sintetico.evento_actual WHERE event_id='synthetic-mvp-900'")
        fila = await cur.fetchone()
        assert fila[0] == "synthetic" and float(fila[1]) == 3.2 and float(fila[2]) == 12
        assert fila[3] == 7 and fila[4] == "synthetic-mvp-900" and int(fila[5]) == AHORA - 600_000

    ejecutar(prueba)


def test_duplicado_y_revision_no_crean_ni_cambian_filas():
    async def prueba(conn, repo):
        assert await repo.guardar(evento(), "t", 0, 1) is True
        assert await repo.guardar(evento(), "t", 0, 2) is False
        assert await repo.guardar(evento(ahora=AHORA + 60_000), "t", 0, 3) is False  # `updated` posterior
        cur = await conn.execute(
            "SELECT count(*), max(kafka_offset) FROM sintetico.evento_actual WHERE event_id='synthetic-mvp-900'")
        assert await cur.fetchone() == (1, 1)

    ejecutar(prueba)


def test_nulos_se_guardan_como_null():
    async def prueba(conn, repo):
        def sin_mag(msg):
            msg["event"]["properties"]["mag"] = None

        await repo.guardar(evento(901, mutar=sin_mag), "t", 0, 1)
        cur = await conn.execute("SELECT mag FROM sintetico.evento_actual WHERE event_id='synthetic-mvp-901'")
        assert (await cur.fetchone())[0] is None

    ejecutar(prueba)


def test_fallo_de_postgres_se_propaga():
    async def prueba():
        conn = await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo())
        repo = RepositorioEventos(conn)
        await conn.close()  # simula la caída de la conexión
        with pytest.raises(psycopg.Error):
            await repo.guardar(evento(), "t", 0, 1)

    asyncio.run(prueba())
