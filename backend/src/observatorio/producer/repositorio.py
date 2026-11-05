"""Estado del productor en PostgreSQL: publicaciones, consultas, respuestas originales y estado de ingesta (D1).

El productor solo escribe estas tablas; el estado de los eventos (evento_actual, evento_version, cuarentena) es del consumidor.
"""

from datetime import datetime, timezone

from psycopg import AsyncConnection

from observatorio.producer.usgs import ErrorUsgs, Respuesta


def _instante(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


class RepositorioProductor:
    def __init__(self, conexion: AsyncConnection):
        self._conexion = conexion

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
            if contenido_gz is not None:
                await self._conexion.execute(
                    "INSERT INTO live.respuesta_original (consulta_id, hash_features, contenido_gz, tamano_bytes) "
                    "VALUES (%s, %s, %s, %s)", (consulta_id, hash_features, contenido_gz, resp.bytes))
            await self._conexion.execute(
                "UPDATE live.estado_ingesta SET ultima_consulta_ok_at = %s, ultimo_hash_features = %s, "
                "consultas_ok = consultas_ok + 1 WHERE id = 1",
                (_instante(iniciada_ms + resp.duracion_ms), hash_features))
        return consulta_id

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

    async def registrar_error_publicacion(self, mensaje: str) -> None:
        await self._conexion.execute(
            "UPDATE live.estado_ingesta SET ultimo_error_at = now(), ultimo_error = %s WHERE id = 1", (mensaje,))
