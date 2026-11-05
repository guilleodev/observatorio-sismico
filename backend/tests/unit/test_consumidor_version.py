"""Versiones y estado actual (paso 3.3) contra PostgreSQL real. Cada prueba se REVIERTE: no deja datos en `live`."""

import asyncio
import os

import psycopg
import pytest

from fixtures.mensajes import construir_evento, construir_mensaje, serializar
from observatorio.config import ConfigPostgres
from observatorio.consumer.mensaje import interpretar_mensaje
from observatorio.consumer.repositorio import RepositorioEventos

pytestmark = pytest.mark.skipif(not os.environ.get("POSTGRES_HOST"), reason="sin PostgreSQL")

ID = "prueba-v01"
T_EVENTO = 1_793_000_000_000  # ocurrencia
T_INGESTA = 1_793_100_000_000  # recepción


def version(updated_ms, id_=ID, mag=3.2, ingested_at=T_INGESTA, profundidad=12, evento=None):
    """Mensaje de una versión del evento `id_` con ese `updated` (ms Unix UTC)."""
    ev = construir_evento(1, ahora=T_EVENTO + 600_000)  # time = T_EVENTO
    ev["id"] = id_
    ev["properties"].update(updated=updated_ms, mag=mag)
    ev["geometry"]["coordinates"] = [-3.7, 40.4, profundidad]
    if evento:
        ev.update(evento)
    return interpretar_mensaje(serializar(construir_mensaje(ev, ahora=ingested_at))[1])


async def _revertida(prueba):
    async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
        async with conn.transaction(force_rollback=True):  # el repositorio usa savepoints dentro
            await prueba(conn, RepositorioEventos(conn))


def ejecutar(prueba):
    asyncio.run(_revertida(prueba))


async def recuento(conn, id_=ID):
    actual = (await (await conn.execute("SELECT count(*) FROM live.evento_actual WHERE event_id = %s", (id_,))).fetchone())[0]
    historial = (await (await conn.execute("SELECT count(*) FROM live.evento_version WHERE event_id = %s", (id_,))).fetchone())[0]
    return actual, historial


async def actual(conn, id_=ID):
    cur = await conn.execute(
        "SELECT (extract(epoch FROM updated_at) * 1000)::bigint, mag, retirado FROM live.evento_actual WHERE event_id = %s", (id_,))
    ms, mag, retirado = await cur.fetchone()
    return ms, (float(mag) if mag is not None else None), retirado


def test_evento_nuevo_crea_estado_actual_e_historial():
    async def prueba(conn, repo):
        assert await repo.guardar_version(version(1000), "t", 0, 1) == "guardada"
        assert await recuento(conn) == (1, 1)
        assert await actual(conn) == (1000, 3.2, False)

    ejecutar(prueba)


def test_misma_version_repetida_no_cambia_los_recuentos():
    async def prueba(conn, repo):
        await repo.guardar_version(version(1000), "t", 0, 1)
        for offset in (2, 3, 4):
            assert await repo.guardar_version(version(1000), "t", 0, offset) == "duplicada"
        assert await recuento(conn) == (1, 1)

    ejecutar(prueba)


def test_mismo_updated_con_otro_contenido_prevalece_lo_almacenado():
    """Misma versión (id, updated): gana la ya guardada (supuesto A-06)."""
    async def prueba(conn, repo):
        await repo.guardar_version(version(1000, mag=3.2), "t", 0, 1)
        assert await repo.guardar_version(version(1000, mag=9.9), "t", 0, 2) == "duplicada"
        assert (await actual(conn))[1] == 3.2 and await recuento(conn) == (1, 1)

    ejecutar(prueba)


def test_version_posterior_actualiza_el_estado_y_conserva_ambas_en_el_historial():
    async def prueba(conn, repo):
        await repo.guardar_version(version(1000, mag=3.2), "t", 0, 1)
        assert await repo.guardar_version(version(2000, mag=3.8), "t", 0, 2) == "guardada"
        assert await actual(conn) == (2000, 3.8, False)
        assert await recuento(conn) == (1, 2)

    ejecutar(prueba)


def test_version_antigua_tardia_no_sustituye_a_la_actual_pero_queda_en_el_historial():
    async def prueba(conn, repo):
        await repo.guardar_version(version(1000, mag=3.2), "t", 0, 1)
        await repo.guardar_version(version(3000, mag=4.0), "t", 0, 2)
        assert await repo.guardar_version(version(2000, mag=3.5), "t", 0, 3) == "antigua"
        assert await actual(conn) == (3000, 4.0, False)  # la posterior no se sobrescribe
        assert await recuento(conn) == (1, 3)  # la versión antigua se conserva en el historial

    ejecutar(prueba)


def test_cada_evento_tiene_su_propio_estado():
    async def prueba(conn, repo):
        await repo.guardar_version(version(1000, id_="prueba-v01"), "t", 0, 1)
        await repo.guardar_version(version(500, id_="prueba-v02"), "t", 0, 2)
        assert await recuento(conn, "prueba-v01") == (1, 1) and await recuento(conn, "prueba-v02") == (1, 1)

    ejecutar(prueba)


def test_reclasificacion_a_no_sismico_retira_el_evento_sin_borrarlo_y_conserva_el_historial():
    async def prueba(conn, repo):
        await repo.guardar_version(version(1000), "t", 0, 1)
        assert await repo.retirar_evento(ID, 2000) is True  # llega una versión más reciente que ya no es terremoto
        assert await actual(conn) == (2000, 3.2, True)  # retirado, con el `updated` de esa versión
        assert await recuento(conn) == (1, 1)  # el historial de terremoto válido se conserva

    ejecutar(prueba)


def test_una_version_antigua_no_reactiva_un_evento_retirado_pero_una_posterior_si():
    async def prueba(conn, repo):
        await repo.guardar_version(version(1000), "t", 0, 1)
        await repo.retirar_evento(ID, 3000)
        assert await repo.guardar_version(version(2000), "t", 0, 2) == "antigua"
        assert (await actual(conn))[2] is True  # sigue retirado
        assert await repo.guardar_version(version(4000, mag=4.4), "t", 0, 3) == "guardada"
        assert await actual(conn) == (4000, 4.4, False)  # reactivado por una versión posterior

    ejecutar(prueba)


def test_retirar_un_evento_nunca_visto_no_crea_fila():
    async def prueba(conn, repo):
        assert await repo.retirar_evento("prueba-nunca", 1000) is False
        assert await recuento(conn, "prueba-nunca") == (0, 0)

    ejecutar(prueba)


def test_retirar_con_una_version_no_posterior_no_cambia_nada():
    async def prueba(conn, repo):
        await repo.guardar_version(version(2000), "t", 0, 1)
        assert await repo.retirar_evento(ID, 2000) is False  # misma versión
        assert await repo.retirar_evento(ID, 1000) is False  # anterior
        assert (await actual(conn))[2] is False

    ejecutar(prueba)


def test_marcas_temporales_separadas_en_utc_y_original_conservado():
    """FR-003 y FR-011: ocurrencia, actualización de USGS y procesamiento son distintos y llegan sin alterar."""
    async def prueba(conn, repo):
        v = version(1_793_050_000_000)
        await repo.guardar_version(v, "terremotos.live", 0, 42)
        for tabla in ("evento_actual", "evento_version"):
            cur = await conn.execute(
                f"SELECT (extract(epoch FROM event_time) * 1000)::bigint, (extract(epoch FROM updated_at) * 1000)::bigint, "
                f"(extract(epoch FROM ingested_at) * 1000)::bigint, raw, kafka_topic, kafka_offset, mode "
                f"FROM live.{tabla} WHERE event_id = %s", (ID,))
            ocurrencia, actualizacion, ingesta, raw, topic, offset, modo = await cur.fetchone()
            assert (ocurrencia, actualizacion, ingesta) == (T_EVENTO, 1_793_050_000_000, T_INGESTA)  # tres tiempos distintos
            assert ocurrencia != actualizacion != ingesta  # son tres instantes distintos (timestamptz = UTC)
            assert raw == v.raw and raw["properties"]["updated"] == 1_793_050_000_000  # original sin transformar
            assert (topic, offset, modo) == ("terremotos.live", 42, "live")

    ejecutar(prueba)


def test_nulos_se_conservan_como_null_y_nunca_como_cero():
    async def prueba(conn, repo):
        ev = version(1000)
        ev.raw["properties"]["mag"] = None
        sin_mag = interpretar_mensaje(serializar(construir_mensaje(ev.raw, ahora=T_INGESTA))[1])
        await repo.guardar_version(sin_mag, "t", 0, 1)
        cur = await conn.execute("SELECT mag, depth_km FROM live.evento_version WHERE event_id = %s", (ID,))
        mag, profundidad = await cur.fetchone()
        assert mag is None and float(profundidad) == 12

    ejecutar(prueba)


def test_mag_cero_y_profundidad_negativa_son_validas():
    async def prueba(conn, repo):
        await repo.guardar_version(version(1000, mag=0, profundidad=-2.6), "t", 0, 1)
        cur = await conn.execute("SELECT mag, depth_km FROM live.evento_actual WHERE event_id = %s", (ID,))
        mag, profundidad = await cur.fetchone()
        assert float(mag) == 0 and float(profundidad) == -2.6

    ejecutar(prueba)


def test_las_pruebas_no_dejan_datos_en_las_tablas_definitivas():
    async def prueba(conn, repo):
        await repo.guardar_version(version(1000), "t", 0, 1)

    ejecutar(prueba)

    async def comprobar():
        async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
            return await recuento(conn)

    assert asyncio.run(comprobar()) == (0, 0)
