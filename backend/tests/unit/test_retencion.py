"""Retención (paso 3.6) contra PostgreSQL real: copias a 3 días y consultas a 30 días. Cada prueba se REVIERTE."""

import asyncio
import gzip
import os

import psycopg
import pytest

from fixtures.mensajes import construir_evento, construir_mensaje, serializar
from observatorio.config import ConfigPostgres
from observatorio.consumer.mensaje import clasificar_mensaje
from observatorio.consumer.repositorio import ReferenciaMensaje, RepositorioEventos
from observatorio.producer.repositorio import RepositorioProductor

pytestmark = pytest.mark.skipif(not os.environ.get("POSTGRES_HOST"), reason="sin PostgreSQL")


async def _revertida(prueba):
    async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
        async with conn.transaction(force_rollback=True):
            await prueba(conn, RepositorioProductor(conn))


def ejecutar(prueba):
    asyncio.run(_revertida(prueba))


async def consulta(conn, dias_atras: float, copia_dias_atras: float | None = None, marca="prueba") -> int:
    """Inserta una consulta de hace `dias_atras` días y, opcionalmente, su copia comprimida de hace `copia_dias_atras`."""
    cur = await conn.execute(
        "INSERT INTO live.consulta_extraccion (iniciada_at, resultado, error) "
        "VALUES (now() - make_interval(secs => %s), 'ok', %s) RETURNING id", (dias_atras * 86400, marca))
    consulta_id = (await cur.fetchone())[0]
    if copia_dias_atras is not None:
        await conn.execute(
            "INSERT INTO live.respuesta_original (consulta_id, hash_features, contenido_gz, tamano_bytes, creada_at) "
            "VALUES (%s, %s, %s, 1, now() - make_interval(secs => %s))",
            (consulta_id, "h" + str(consulta_id), gzip.compress(b"{}"), copia_dias_atras * 86400))
    return consulta_id


async def existe(conn, tabla: str, columna: str, valor) -> bool:
    cur = await conn.execute(f"SELECT count(*) FROM live.{tabla} WHERE {columna} = %s", (valor,))
    return (await cur.fetchone())[0] == 1


def test_las_copias_con_mas_de_3_dias_se_purgan_y_las_recientes_se_conservan():
    async def prueba(conn, repo):
        vieja = await consulta(conn, 1, copia_dias_atras=5)  # consulta reciente, copia de hace 5 días
        reciente = await consulta(conn, 1, copia_dias_atras=1)  # copia de hace 1 día
        limite = await consulta(conn, 1, copia_dias_atras=2.9)
        copias, _ = await repo.purgar(3, 30)
        assert copias >= 1
        assert not await existe(conn, "respuesta_original", "consulta_id", vieja)
        assert await existe(conn, "respuesta_original", "consulta_id", reciente)
        assert await existe(conn, "respuesta_original", "consulta_id", limite)
        assert await existe(conn, "consulta_extraccion", "id", vieja)  # el registro de la consulta se mantiene (30 días)

    ejecutar(prueba)


def test_las_consultas_con_mas_de_30_dias_se_purgan_con_su_copia():
    async def prueba(conn, repo):
        antigua = await consulta(conn, 31, copia_dias_atras=31)
        reciente = await consulta(conn, 29)
        await repo.purgar(3, 30)
        assert not await existe(conn, "consulta_extraccion", "id", antigua)
        assert not await existe(conn, "respuesta_original", "consulta_id", antigua)  # cascada
        assert await existe(conn, "consulta_extraccion", "id", reciente)

    ejecutar(prueba)


def test_la_purga_no_toca_versiones_estado_actual_publicaciones_ni_cuarentena():
    async def prueba(conn, repo):
        await consulta(conn, 40, copia_dias_atras=40)
        eventos = RepositorioEventos(conn)
        ev = construir_evento(1, ahora=1_793_000_000_000)
        ev["id"] = "prueba-r01"
        valido = clasificar_mensaje(serializar(construir_mensaje(ev, ahora=1_793_100_000_000))[1])
        await eventos.guardar_version(valido.evento, "t", 0, 1)
        ev2 = dict(ev, id="prueba-r02", properties=dict(ev["properties"], type="explosion"))
        excluido = clasificar_mensaje(serializar(construir_mensaje(ev2, ahora=1_793_100_000_000))[1])
        await eventos.excluir_evento(excluido, ReferenciaMensaje("t", 0, 2, b"prueba-r02", b"{}"))
        await repo.marcar_publicada("prueba-r01", 1, 0, 1)
        antes = [(await (await conn.execute(f"SELECT count(*) FROM live.{t}")).fetchone())[0]
                 for t in ("evento_actual", "evento_version", "version_publicada", "cuarentena")]
        copias, consultas = await repo.purgar(3, 30)
        despues = [(await (await conn.execute(f"SELECT count(*) FROM live.{t}")).fetchone())[0]
                   for t in ("evento_actual", "evento_version", "version_publicada", "cuarentena")]
        assert antes == despues and consultas >= 1

    ejecutar(prueba)


def test_con_una_retencion_mas_larga_no_se_purga_lo_que_aun_es_reciente():
    async def prueba(conn, repo):
        c = await consulta(conn, 10, copia_dias_atras=10)
        await repo.purgar(30, 60)
        assert await existe(conn, "consulta_extraccion", "id", c) and await existe(conn, "respuesta_original", "consulta_id", c)

    ejecutar(prueba)


def test_las_pruebas_no_dejan_datos():
    async def prueba(conn, repo):
        await consulta(conn, 1, copia_dias_atras=1, marca="PRUEBA-RETENCION")

    ejecutar(prueba)

    async def comprobar():
        async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
            cur = await conn.execute("SELECT count(*) FROM live.consulta_extraccion WHERE error = 'PRUEBA-RETENCION'")
            return (await cur.fetchone())[0]

    assert asyncio.run(comprobar()) == 0
