"""Prueba contra PostgreSQL real (tabla live.evento_actual). Se omite si no hay POSTGRES_HOST.

Cada prueba corre dentro de una transacción que se REVIERTE: no queda ningún dato en las tablas definitivas.
"""

import asyncio
import os

import psycopg
import pytest

from observatorio.config import ConfigPostgres
from observatorio.consumer.mensaje import interpretar_mensaje
from observatorio.consumer.repositorio import RepositorioEventos
from fixtures.mensajes import construir_evento, construir_mensaje, serializar

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


def test_inserta_la_version_y_el_estado_actual_con_sus_campos():
    async def prueba(conn, repo):
        assert await repo.guardar_version(evento(), "t", 0, 7) == "guardada"
        for tabla in ("evento_actual", "evento_version"):
            cur = await conn.execute(
                f"SELECT mode, mag, depth_km, kafka_offset, raw->>'id', extract(epoch FROM event_time)*1000 "
                f"FROM live.{tabla} WHERE event_id='prueba-900'")
            fila = await cur.fetchone()
            assert fila[0] == "live" and float(fila[1]) == 3.2 and float(fila[2]) == 12
            assert fila[3] == 7 and fila[4] == "prueba-900" and int(fila[5]) == AHORA - 600_000

    ejecutar(prueba)


def test_nulos_se_guardan_como_null():
    async def prueba(conn, repo):
        def sin_mag(msg):
            msg["event"]["properties"]["mag"] = None

        await repo.guardar_version(evento(901, mutar=sin_mag), "t", 0, 1)
        cur = await conn.execute("SELECT mag FROM live.evento_actual WHERE event_id='prueba-901'")
        assert (await cur.fetchone())[0] is None

    ejecutar(prueba)


def test_restricciones_check_rechazan_modos_y_rangos_invalidos():
    cols = ("INSERT INTO live.evento_actual(event_id,event_time,updated_at,longitude,latitude,source,mode,"
            "ingested_at,kafka_topic,kafka_partition,kafka_offset,raw) VALUES ")
    casos = [
        "('prueba-c1',now(),now(),0,0,'x','synthetic',now(),'t',0,0,'{}')",  # modo no contractual
        "('prueba-c2',now(),now(),0,0,'x','replay',now(),'t',0,0,'{}')",     # replay no entra en live
        "('prueba-c3',now(),now(),0,95,'x','live',now(),'t',0,0,'{}')",      # latitud fuera de rango
        "('',now(),now(),0,0,'x','live',now(),'t',0,0,'{}')",                # id vacio
    ]

    async def prueba(conn, repo):
        for valores in casos:
            with pytest.raises(psycopg.errors.CheckViolation):
                async with conn.transaction():  # savepoint: el error no aborta la transaccion externa
                    await conn.execute(cols + valores)

    ejecutar(prueba)


def test_fallo_de_postgres_se_propaga():
    async def prueba():
        conn = await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo())
        repo = RepositorioEventos(conn)
        await conn.close()  # simula la caída de la conexión
        with pytest.raises(psycopg.Error):
            await repo.guardar_version(evento(), "t", 0, 1)

    asyncio.run(prueba())
