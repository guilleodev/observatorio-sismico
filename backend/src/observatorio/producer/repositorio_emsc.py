"""Estado de la fuente EMSC en PostgreSQL (F8): registro de consultas y marca de actualización PROPIOS (tablas `live.consulta_fuente` y `live.estado_fuente`).

Es deliberado que NO se reutilice `RepositorioProductor`: su estado (`live.estado_ingesta`, una sola fila) y su detección de huecos son del feed de USGS y se
corromperían si EMSC los actualizara. Lo único compartido es `live.version_publicada` (clave `(event_id, updated_ms)`; los identificadores de EMSC llevan prefijo).
"""

import logging
from datetime import datetime, timezone

from psycopg import AsyncConnection

from observatorio.config import SOURCE_EMSC
from observatorio.producer.usgs import ErrorUsgs, Respuesta

log = logging.getLogger("producer.emsc")


def _instante(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


class RepositorioEmsc:
    def __init__(self, conexion: AsyncConnection, fuente: str = SOURCE_EMSC):
        self._conexion = conexion
        self._fuente = fuente

    async def marca(self) -> datetime | None:
        """`updatedafter` de la próxima consulta: el inicio de la última consulta correcta y COMPLETA (None = todavía no hubo ninguna)."""
        cursor = await self._conexion.execute("SELECT marca_actualizacion FROM live.estado_fuente WHERE fuente = %s", (self._fuente,))
        fila = await cursor.fetchone()
        return fila[0] if fila else None

    async def maximos_publicados(self, ids: list[str]) -> dict[str, int]:
        """Mayor `updated` ya publicado de cada evento (los desconocidos no aparecen)."""
        if not ids:
            return {}
        cursor = await self._conexion.execute(
            "SELECT event_id, max(updated_ms) FROM live.version_publicada WHERE event_id = ANY(%s) GROUP BY event_id", (ids,))
        return {fila[0]: fila[1] for fila in await cursor.fetchall()}

    async def marcar_publicada(self, event_id: str, updated_ms: int, particion: int | None, offset: int | None) -> None:
        await self._conexion.execute(
            "INSERT INTO live.version_publicada (event_id, updated_ms, kafka_partition, kafka_offset) VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (event_id, updated_ms) DO NOTHING", (event_id, updated_ms, particion, offset))

    async def registrar_ok(self, iniciada_ms: int, resp: Respuesta, n_eventos: int, ventana: str, nueva_marca: datetime | None) -> int:
        """Consulta correcta: registro y estado en UNA transacción. `nueva_marca=None` deja la marca como estaba (publicación incompleta: se repite la ventana)."""
        async with self._conexion.transaction():
            cursor = await self._conexion.execute(
                "INSERT INTO live.consulta_fuente (fuente, iniciada_at, duracion_ms, resultado, http_status, bytes, eventos, intentos, parametro) "
                "VALUES (%s, %s, %s, 'ok', %s, %s, %s, %s, %s) RETURNING id",
                (self._fuente, _instante(iniciada_ms), resp.duracion_ms, resp.http_status, resp.bytes, n_eventos, resp.intentos, ventana))
            consulta_id = (await cursor.fetchone())[0]
            await self._conexion.execute(
                "INSERT INTO live.estado_fuente (fuente, ultima_consulta_ok_at, marca_actualizacion, consultas_ok) VALUES (%s, %s, %s, 1) "
                "ON CONFLICT (fuente) DO UPDATE SET ultima_consulta_ok_at = EXCLUDED.ultima_consulta_ok_at, "
                "marca_actualizacion = COALESCE(EXCLUDED.marca_actualizacion, live.estado_fuente.marca_actualizacion), "
                "consultas_ok = live.estado_fuente.consultas_ok + 1",
                (self._fuente, _instante(iniciada_ms + resp.duracion_ms), nueva_marca))
        return consulta_id

    async def registrar_error(self, iniciada_ms: int, error: ErrorUsgs, ventana: str | None = None) -> None:
        """Consulta fallida: se registra el error sin tocar la última consulta correcta ni la marca."""
        async with self._conexion.transaction():
            await self._conexion.execute(
                "INSERT INTO live.consulta_fuente (fuente, iniciada_at, resultado, http_status, error, intentos, parametro) "
                "VALUES (%s, %s, 'error', %s, %s, %s, %s)",
                (self._fuente, _instante(iniciada_ms), error.http_status, str(error), error.intentos, ventana))
            await self._conexion.execute(
                "INSERT INTO live.estado_fuente (fuente, ultimo_error_at, ultimo_error, consultas_error) VALUES (%s, %s, %s, 1) "
                "ON CONFLICT (fuente) DO UPDATE SET ultimo_error_at = EXCLUDED.ultimo_error_at, ultimo_error = EXCLUDED.ultimo_error, "
                "consultas_error = live.estado_fuente.consultas_error + 1",
                (self._fuente, _instante(iniciada_ms), str(error)))

    async def registrar_error_publicacion(self, mensaje: str) -> None:
        await self._conexion.execute(
            "INSERT INTO live.estado_fuente (fuente, ultimo_error_at, ultimo_error) VALUES (%s, now(), %s) "
            "ON CONFLICT (fuente) DO UPDATE SET ultimo_error_at = now(), ultimo_error = EXCLUDED.ultimo_error", (self._fuente, mensaje))

    async def actualizar_conteos(self, consulta_id: int, publicadas: int, omitidas: int) -> None:
        await self._conexion.execute("UPDATE live.consulta_fuente SET publicadas = %s, omitidas = %s WHERE id = %s", (publicadas, omitidas, consulta_id))

    async def purgar(self, dias_consultas: int) -> int:
        """Retención: registro de consultas de ESTA fuente con más de `dias_consultas` días. No toca versiones, estado actual ni cuarentena."""
        cursor = await self._conexion.execute(
            "DELETE FROM live.consulta_fuente WHERE fuente = %s AND iniciada_at < now() - make_interval(days => %s)", (self._fuente, dias_consultas))
        return cursor.rowcount
