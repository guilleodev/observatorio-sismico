"""Cuarentena, exclusión y retirada con PostgreSQL real (paso 3.5). Cada prueba se REVIERTE: no deja datos en `live`."""

import asyncio
import json
import os
from types import SimpleNamespace

import psycopg
import pytest

from fixtures.mensajes import construir_evento, construir_mensaje
from observatorio.config import ConfigPostgres
from observatorio.consumer.main import procesar_registro
from observatorio.consumer.repositorio import RepositorioEventos

pytestmark = pytest.mark.skipif(not os.environ.get("POSTGRES_HOST"), reason="sin PostgreSQL")

ID = "prueba-q01"
T_EVENTO = 1_793_000_000_000
T_INGESTA = 1_793_100_000_000


def valor(updated_ms=1000, tipo="earthquake", coordenadas=None, ingested_at=T_INGESTA, id_=ID):
    ev = construir_evento(1, ahora=T_EVENTO + 600_000)
    ev["id"] = id_
    ev["properties"].update(updated=updated_ms, type=tipo, mag=3.2)
    if coordenadas is not None:
        ev["geometry"]["coordinates"] = coordenadas
    return json.dumps(construir_mensaje(ev, ahora=ingested_at), ensure_ascii=False).encode("utf-8")


class Consumidor:
    def __init__(self):
        self.confirmados = []

    async def commit(self, offsets):
        self.confirmados.extend(offsets.values())


def registro(offset, contenido, clave=ID.encode()):
    return SimpleNamespace(topic="terremotos.live", partition=0, offset=offset, key=clave, value=contenido)


async def _revertida(prueba):
    async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
        async with conn.transaction(force_rollback=True):
            await prueba(conn, RepositorioEventos(conn), Consumidor())


def ejecutar(prueba):
    asyncio.run(_revertida(prueba))


async def actual(conn, id_=ID):
    cur = await conn.execute(
        "SELECT (extract(epoch FROM updated_at) * 1000)::bigint, retirado FROM live.evento_actual WHERE event_id = %s", (id_,))
    return await cur.fetchone()


async def cuarentena(conn):
    cur = await conn.execute(
        "SELECT categoria, motivo, event_id, updated_ms, kafka_topic, kafka_partition, kafka_offset, clave, payload "
        "FROM live.cuarentena WHERE event_id = %s ORDER BY id", (ID,))
    return await cur.fetchall()


async def total_cuarentena(conn):
    return (await (await conn.execute("SELECT count(*) FROM live.cuarentena")).fetchone())[0]


def test_un_evento_no_sismico_queda_en_cuarentena_con_motivo_y_referencia_y_no_en_el_estado_actual():
    async def prueba(conn, repo, consumidor):
        contenido = valor(tipo="explosion")
        assert await procesar_registro(consumidor, registro(11, contenido), repo) == "excluida"
        assert await actual(conn) is None  # nunca fue terremoto: no crea estado actual
        (fila,) = await cuarentena(conn)
        categoria, motivo, event_id, updated_ms, topic, particion, offset, clave, payload = fila
        assert (categoria, event_id, updated_ms) == ("excluido", ID, 1000) and "explosion" in motivo
        assert (topic, particion, offset, clave) == ("terremotos.live", 0, 11, ID)  # referencia al mensaje original
        assert bytes(payload) == contenido  # y copia del contenido recibido
        assert consumidor.confirmados == [12]  # offset confirmado después de persistir

    ejecutar(prueba)


def test_coordenadas_invalidas_van_a_cuarentena_y_no_dibujan_ningun_punto():
    async def prueba(conn, repo, consumidor):
        assert await procesar_registro(consumidor, registro(0, valor(coordenadas=[-3.7, 145, 10])), repo) == "cuarentena"
        assert (await actual(conn)) is None  # 0 puntos
        (fila,) = await cuarentena(conn)
        assert fila[0] == "invalido" and "fuera de rango" in fila[1] and fila[2] == ID
        assert consumidor.confirmados == [1]

    ejecutar(prueba)


def test_un_mensaje_ilegible_va_a_cuarentena_y_no_bloquea_la_cola():
    async def prueba(conn, repo, consumidor):
        basura = b"esto no es JSON"
        assert await procesar_registro(consumidor, registro(0, basura, clave=b"PRUEBA-k"), repo) == "cuarentena"
        assert await procesar_registro(consumidor, registro(1, valor()), repo) == "guardada"  # el siguiente sigue su curso
        assert consumidor.confirmados == [1, 2]
        cur = await conn.execute("SELECT categoria, event_id, updated_ms, clave, payload FROM live.cuarentena ORDER BY id DESC LIMIT 1")
        categoria, event_id, updated_ms, clave, payload = await cur.fetchone()
        assert (categoria, event_id, updated_ms, clave, bytes(payload)) == ("invalido", None, None, "PRUEBA-k", basura)

    ejecutar(prueba)


def test_el_reenvio_del_mismo_evento_y_version_no_crea_otra_fila_aunque_cambie_ingested_at():
    async def prueba(conn, repo, consumidor):
        antes = await total_cuarentena(conn)
        await procesar_registro(consumidor, registro(0, valor(tipo="explosion", ingested_at=T_INGESTA)), repo)
        await procesar_registro(consumidor, registro(1, valor(tipo="explosion", ingested_at=T_INGESTA + 7000)), repo)
        await procesar_registro(consumidor, registro(2, valor(coordenadas=[0, 145, 1], ingested_at=T_INGESTA)), repo)
        await procesar_registro(consumidor, registro(3, valor(coordenadas=[0, 145, 1], ingested_at=T_INGESTA + 9000)), repo)
        assert await total_cuarentena(conn) - antes == 2  # una por (categoría, motivo, versión)
        assert consumidor.confirmados == [1, 2, 3, 4]  # todos confirmados

    ejecutar(prueba)


def test_una_version_invalida_no_sustituye_a_la_ultima_version_valida():
    async def prueba(conn, repo, consumidor):
        await procesar_registro(consumidor, registro(0, valor(updated_ms=1000)), repo)
        assert await procesar_registro(consumidor, registro(1, valor(updated_ms=2000, coordenadas=[0, 145, 1])), repo) == "cuarentena"
        assert await actual(conn) == (1000, False)  # el estado actual conserva la última válida
        assert await procesar_registro(consumidor, registro(2, valor(updated_ms=3000)), repo) == "guardada"  # una posterior válida se procesa
        assert await actual(conn) == (3000, False)
        assert len(await cuarentena(conn)) == 1  # la cuarentena se conserva

    ejecutar(prueba)


def test_reclasificacion_a_no_sismico_retira_el_evento_y_una_posterior_lo_reactiva():
    async def prueba(conn, repo, consumidor):
        await procesar_registro(consumidor, registro(0, valor(updated_ms=1000)), repo)
        assert await procesar_registro(consumidor, registro(1, valor(updated_ms=2000, tipo="quarry blast")), repo) == "excluida"
        assert await actual(conn) == (2000, True)  # retirado, sin borrarse
        assert (await (await conn.execute("SELECT count(*) FROM live.evento_version WHERE event_id = %s", (ID,))).fetchone())[0] == 1
        assert await procesar_registro(consumidor, registro(2, valor(updated_ms=1500)), repo) == "antigua"  # una antigua no lo reactiva
        assert await actual(conn) == (2000, True)
        assert await procesar_registro(consumidor, registro(3, valor(updated_ms=3000)), repo) == "guardada"  # una posterior sí
        assert await actual(conn) == (3000, False)
        (fila,) = await cuarentena(conn)
        assert fila[0] == "excluido" and fila[3] == 2000  # la exclusión queda como parte de la secuencia de revisiones

    ejecutar(prueba)


def test_una_exclusion_anterior_a_la_version_actual_no_retira_el_evento():
    async def prueba(conn, repo, consumidor):
        await procesar_registro(consumidor, registro(0, valor(updated_ms=3000)), repo)
        await procesar_registro(consumidor, registro(1, valor(updated_ms=2000, tipo="explosion")), repo)
        assert await actual(conn) == (3000, False)
        assert len(await cuarentena(conn)) == 1  # pero se registra

    ejecutar(prueba)


def test_los_modos_y_fuentes_fuera_de_contrato_se_descartan_sin_tocar_las_tablas():
    async def prueba(conn, repo, consumidor):
        antes = await total_cuarentena(conn)
        for modo in ("synthetic", "replay"):
            msg = json.loads(valor())
            msg["mode"] = modo
            assert await procesar_registro(consumidor, registro(0, json.dumps(msg).encode()), repo) == "descartado"
        msg = json.loads(valor())
        msg["source"] = "otra-fuente"
        assert await procesar_registro(consumidor, registro(1, json.dumps(msg).encode()), repo) == "descartado"
        assert await total_cuarentena(conn) == antes and await actual(conn) is None
        assert consumidor.confirmados == [1, 1, 2]  # se confirman para no bloquear la cola

    ejecutar(prueba)


def test_las_pruebas_no_dejan_datos_en_las_tablas_definitivas():
    """Compara antes y después (las tablas ya contienen datos reales del feed): la transacción de prueba no cambia nada."""
    async def leer():
        async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
            return await total_cuarentena(conn), await actual(conn)

    antes = asyncio.run(leer())

    async def prueba(conn, repo, consumidor):
        await procesar_registro(consumidor, registro(0, valor(tipo="explosion")), repo)
        await procesar_registro(consumidor, registro(1, b"basura"), repo)

    ejecutar(prueba)
    assert asyncio.run(leer()) == antes and antes[1] is None  # sin filas nuevas y sin estado del evento de prueba
