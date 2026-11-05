"""Atomicidad, reentrega y desorden con PostgreSQL real (paso 3.4). Cada prueba se REVIERTE: no deja datos en `live`."""

import asyncio
import os
from types import SimpleNamespace

import psycopg
import pytest

from fixtures.mensajes import construir_evento, construir_mensaje, serializar
from observatorio.config import ConfigPostgres
from observatorio.consumer import repositorio as modulo_repositorio
from observatorio.consumer.main import procesar_registro
from observatorio.consumer.mensaje import interpretar_mensaje
from observatorio.consumer.repositorio import RepositorioEventos

pytestmark = pytest.mark.skipif(not os.environ.get("POSTGRES_HOST"), reason="sin PostgreSQL")

ID = "prueba-t01"
T_EVENTO = 1_793_000_000_000
T_INGESTA = 1_793_100_000_000


def valor(updated_ms, mag=3.2):
    ev = construir_evento(1, ahora=T_EVENTO + 600_000)
    ev["id"] = ID
    ev["properties"].update(updated=updated_ms, mag=mag)
    return serializar(construir_mensaje(ev, ahora=T_INGESTA))[1]


def registro(offset, updated_ms, mag=3.2):
    return SimpleNamespace(topic="terremotos.live", partition=0, offset=offset, key=ID.encode(), value=valor(updated_ms, mag))


class ConsumidorFalso:
    def __init__(self, fallos_commit=0):
        self.confirmados, self.fallos_commit = [], fallos_commit

    async def commit(self, offsets):
        if self.fallos_commit > 0:
            self.fallos_commit -= 1
            raise ConnectionError("Kafka no responde")
        self.confirmados.extend(offsets.values())


async def _revertida(prueba):
    async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
        async with conn.transaction(force_rollback=True):
            await prueba(conn, RepositorioEventos(conn))


def ejecutar(prueba):
    asyncio.run(_revertida(prueba))


async def estado(conn):
    """(versiones en el historial, `updated` en ms del estado actual o None)."""
    historial = (await (await conn.execute("SELECT count(*) FROM live.evento_version WHERE event_id = %s", (ID,))).fetchone())[0]
    cur = await conn.execute(
        "SELECT (extract(epoch FROM updated_at) * 1000)::bigint FROM live.evento_actual WHERE event_id = %s", (ID,))
    fila = await cur.fetchone()
    return historial, (fila[0] if fila else None)


def test_la_transaccion_es_atomica_si_falla_la_segunda_sentencia(monkeypatch):
    """Si no se puede actualizar el estado actual, la versión del historial tampoco queda (todo o nada)."""
    async def prueba(conn, repo):
        evento = interpretar_mensaje(valor(1000))
        monkeypatch.setattr(modulo_repositorio, "SQL_ACTUAL", "SELECT 1 / 0")  # la segunda sentencia falla
        with pytest.raises(psycopg.Error):
            await repo.guardar_version(evento, "t", 0, 1)
        assert await estado(conn) == (0, None)  # ni versión huérfana ni estado actual
        monkeypatch.undo()  # el mismo mensaje se reprocesa después sin problema
        assert await repo.guardar_version(evento, "t", 0, 1) == "guardada"
        assert await estado(conn) == (1, 1000)

    ejecutar(prueba)


def test_si_falla_la_confirmacion_el_reintento_no_duplica_ni_cambia_los_datos():
    """Se guarda, Kafka no confirma, el mensaje se reentrega: queda una sola versión y se confirma al reintentar."""
    async def prueba(conn, repo):
        consumidor = ConsumidorFalso(fallos_commit=1)
        with pytest.raises(ConnectionError):
            await procesar_registro(consumidor, registro(7, 1000), repo)
        assert consumidor.confirmados == [] and await estado(conn) == (1, 1000)  # guardado, sin confirmar
        assert await procesar_registro(consumidor, registro(7, 1000), repo) == "duplicada"  # reentrega
        assert consumidor.confirmados == [8] and await estado(conn) == (1, 1000)

    ejecutar(prueba)


def test_la_reentrega_completa_de_una_secuencia_no_cambia_los_recuentos():
    async def prueba(conn, repo):
        consumidor = ConsumidorFalso()
        secuencia = [(0, 1000), (1, 2000), (2, 3000)]
        for _ in range(3):  # el broker entrega tres veces toda la secuencia (reinicio sin confirmar)
            for offset, updated in secuencia:
                await procesar_registro(consumidor, registro(offset, updated), repo)
        assert await estado(conn) == (3, 3000)  # 3 versiones distintas, ni una más

    ejecutar(prueba)


def test_versiones_fuera_de_orden_y_reentregadas_dejan_siempre_la_mas_reciente():
    async def prueba(conn, repo):
        consumidor = ConsumidorFalso()
        orden = [3000, 1000, 2000, 3000, 1000]
        resultados = [await procesar_registro(consumidor, registro(i, u, mag=3 + u / 1000), repo) for i, u in enumerate(orden)]
        assert resultados == ["guardada", "antigua", "antigua", "duplicada", "duplicada"]
        assert await estado(conn) == (3, 3000)
        mag = (await (await conn.execute("SELECT mag FROM live.evento_actual WHERE event_id = %s", (ID,))).fetchone())[0]
        assert float(mag) == 6.0  # los datos de la versión 3000, no los de una antigua
        assert consumidor.confirmados == [1, 2, 3, 4, 5]  # todos confirmados, en orden y tras guardar

    ejecutar(prueba)


def test_un_error_de_datos_no_confirma_ni_deja_estado_parcial():
    """Una violación de restricción durante el guardado propaga el error (no se confirma) y no deja nada a medias."""
    async def prueba(conn, repo):
        malo = interpretar_mensaje(valor(1000))
        object.__setattr__(malo, "mode", "otro")  # viola CHECK (mode = 'live') en la primera sentencia
        consumidor = ConsumidorFalso()
        with pytest.raises(psycopg.errors.CheckViolation):
            await procesar_registro_directo(consumidor, malo, repo)
        assert consumidor.confirmados == [] and await estado(conn) == (0, None)

    ejecutar(prueba)


async def procesar_registro_directo(consumidor, evento, repo):
    """Guarda un evento ya interpretado y, solo si no falla, confirma (misma regla que procesar_registro)."""
    await repo.guardar_version(evento, "terremotos.live", 0, 3)
    await consumidor.commit({0: 4})


def test_las_pruebas_no_dejan_datos_en_las_tablas_definitivas():
    async def prueba(conn, repo):
        await procesar_registro(ConsumidorFalso(), registro(0, 1000), repo)

    ejecutar(prueba)

    async def comprobar():
        async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
            return await estado(conn)

    assert asyncio.run(comprobar()) == (0, None)
