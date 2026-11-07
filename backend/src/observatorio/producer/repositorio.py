"""Estado del productor en PostgreSQL: publicaciones, consultas, respuestas originales y estado de ingesta (D1).

El productor solo escribe estas tablas; el estado de los eventos (evento_actual, evento_version, cuarentena) es del consumidor.
"""

import logging
from datetime import datetime, timedelta, timezone

from psycopg import AsyncConnection

from observatorio.producer.usgs import ErrorUsgs, Respuesta


log = logging.getLogger("producer.huecos")
UMBRAL = timedelta(hours=24)  # el feed all_day solo cubre las últimas 24 h


def _instante(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


def calcular_hueco(anterior: datetime, ahora: datetime, margen_s: int) -> tuple[datetime, datetime] | None:
    """Intervalo sin cobertura entre dos consultas correctas, o None si no hay hueco.

    Hay hueco si pasó MÁS de `24 h − margen` desde la consulta correcta anterior. El intervalo es
    (anterior − margen, ahora − 24 h + margen): el margen cubre los eventos publicados con retraso y se aplica por ambos lados.
    """
    margen = timedelta(seconds=margen_s)
    if ahora - anterior <= UMBRAL - margen:
        return None
    inicio, fin = anterior - margen, ahora - UMBRAL + margen
    return (inicio, fin) if fin > inicio else None


class RepositorioProductor:
    def __init__(self, conexion: AsyncConnection, margen_hueco_s: int | None = None):
        # `margen_hueco_s=None` desactiva la detección de huecos (modo seco: no se anota nada si no se publica)
        self._conexion = conexion
        self._margen_hueco_s = margen_hueco_s

    async def ultimo_hash(self) -> str | None:
        cursor = await self._conexion.execute("SELECT ultimo_hash_features FROM live.estado_ingesta WHERE id = 1")
        fila = await cursor.fetchone()
        return fila[0] if fila else None

    async def maximos_publicados(self, ids: list[str]) -> dict[str, int]:
        """Mayor `updated` ya publicado de cada evento (los desconocidos no aparecen)."""
        if not ids:
            return {}
        cursor = await self._conexion.execute(
            "SELECT event_id, max(updated_ms) FROM live.version_publicada WHERE event_id = ANY(%s) GROUP BY event_id",
            (ids,))
        return {fila[0]: fila[1] for fila in await cursor.fetchall()}

    async def marcar_publicada(self, event_id: str, updated_ms: int, particion: int | None, offset: int | None) -> None:
        await self._conexion.execute(
            "INSERT INTO live.version_publicada (event_id, updated_ms, kafka_partition, kafka_offset) "
            "VALUES (%s, %s, %s, %s) ON CONFLICT (event_id, updated_ms) DO NOTHING",
            (event_id, updated_ms, particion, offset))

    async def registrar_ok(self, iniciada_ms: int, resp: Respuesta, n_eventos: int, hash_features: str,
                           contenido_gz: bytes | None) -> int:
        """Consulta correcta: registro, copia comprimida (solo si cambió) y estado, en una transacción."""
        async with self._conexion.transaction():
            cursor = await self._conexion.execute(
                "INSERT INTO live.consulta_extraccion (iniciada_at, duracion_ms, resultado, http_status, bytes, eventos, intentos) "
                "VALUES (%s, %s, 'ok', %s, %s, %s, %s) RETURNING id",
                (_instante(iniciada_ms), resp.duracion_ms, resp.http_status, resp.bytes, n_eventos, resp.intentos))
            consulta_id = (await cursor.fetchone())[0]
            ahora = _instante(iniciada_ms + resp.duracion_ms)
            await self._anotar_hueco(ahora)  # antes de actualizar estado_ingesta: aún está la consulta correcta anterior
            if contenido_gz is not None:
                await self._conexion.execute(
                    "INSERT INTO live.respuesta_original (consulta_id, hash_features, contenido_gz, tamano_bytes) "
                    "VALUES (%s, %s, %s, %s)", (consulta_id, hash_features, contenido_gz, resp.bytes))
            await self._conexion.execute(
                "UPDATE live.estado_ingesta SET ultima_consulta_ok_at = %s, ultimo_hash_features = %s, "
                "consultas_ok = consultas_ok + 1 WHERE id = 1",
                (ahora, hash_features))
        return consulta_id

    async def _anotar_hueco(self, ahora: datetime) -> None:
        """Si pasó más de 24 h − margen desde la consulta correcta anterior, anota el hueco (idempotente por (inicio, fin))."""
        if self._margen_hueco_s is None:
            return
        cursor = await self._conexion.execute("SELECT ultima_consulta_ok_at FROM live.estado_ingesta WHERE id = 1")
        fila = await cursor.fetchone()
        if fila is None or fila[0] is None:  # primera consulta correcta de la historia: no hay con qué comparar
            return
        hueco = calcular_hueco(fila[0], ahora, self._margen_hueco_s)
        if hueco is None:
            return
        cursor = await self._conexion.execute(
            "INSERT INTO live.hueco (inicio, fin) VALUES (%s, %s) ON CONFLICT (inicio, fin) DO NOTHING", hueco)
        if cursor.rowcount:
            log.warning("HUECO de ingesta anotado: sin cobertura entre %s y %s (última consulta correcta: %s). "
                        "Recuperar a demanda con: python -m observatorio.recuperacion.recuperar", hueco[0], hueco[1], fila[0])

    async def registrar_error(self, iniciada_ms: int, error: ErrorUsgs) -> None:
        """Consulta fallida: se registra el error sin tocar la última consulta correcta ni el último hash válido."""
        async with self._conexion.transaction():
            await self._conexion.execute(
                "INSERT INTO live.consulta_extraccion (iniciada_at, resultado, http_status, error, intentos) "
                "VALUES (%s, 'error', %s, %s, %s)", (_instante(iniciada_ms), error.http_status, str(error), error.intentos))
            await self._conexion.execute(
                "UPDATE live.estado_ingesta SET ultimo_error_at = %s, ultimo_error = %s, consultas_error = consultas_error + 1 "
                "WHERE id = 1", (_instante(iniciada_ms), str(error)))

    async def actualizar_conteos(self, consulta_id: int, publicadas: int, omitidas: int) -> None:
        await self._conexion.execute(
            "UPDATE live.consulta_extraccion SET publicadas = %s, omitidas = %s WHERE id = %s",
            (publicadas, omitidas, consulta_id))

    async def purgar(self, dias_respuestas: int, dias_consultas: int) -> tuple[int, int]:
        """Retención (R-004): copias de respuestas con más de `dias_respuestas` y registro de consultas con más de `dias_consultas`.

        Borrar una consulta borra también su copia (ON DELETE CASCADE). No toca versiones, estado actual, publicaciones ni cuarentena.
        Devuelve (copias borradas, consultas borradas).
        """
        async with self._conexion.transaction():
            copias = (await self._conexion.execute(
                "DELETE FROM live.respuesta_original WHERE creada_at < now() - make_interval(days => %s)", (dias_respuestas,))).rowcount
            consultas = (await self._conexion.execute(
                "DELETE FROM live.consulta_extraccion WHERE iniciada_at < now() - make_interval(days => %s)", (dias_consultas,))).rowcount
        return copias, consultas

    async def registrar_error_publicacion(self, mensaje: str) -> None:
        await self._conexion.execute(
            "UPDATE live.estado_ingesta SET ultimo_error_at = now(), ultimo_error = %s WHERE id = 1", (mensaje,))
