"""Escritura idempotente en sintetico.evento_actual (data-model.md)."""

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from observatorio.consumer.mensaje import EventoRecibido

# DO NOTHING: una fila por event_id. La comparación de `updated` (revisiones) llega en F3.
SQL_INSERTAR = """
INSERT INTO sintetico.evento_actual (
    event_id, event_time, updated_at, mag, mag_type, depth_km, longitude, latitude, place,
    source, mode, ingested_at, kafka_topic, kafka_partition, kafka_offset, raw)
VALUES (
    %(event_id)s, to_timestamp(%(event_time)s / 1000.0), to_timestamp(%(updated)s / 1000.0),
    %(mag)s, %(mag_type)s, %(depth_km)s, %(longitude)s, %(latitude)s, %(place)s,
    %(source)s, %(mode)s, to_timestamp(%(ingested_at)s / 1000.0),
    %(topic)s, %(partition)s, %(offset)s, %(raw)s)
ON CONFLICT (event_id) DO NOTHING
"""


class RepositorioEventos:
    def __init__(self, conexion: AsyncConnection):
        self._conexion = conexion

    async def guardar(self, e: EventoRecibido, topic: str, partition: int, offset: int) -> bool:
        """Inserta en una transacción. Devuelve True si creó la fila, False si ya existía."""
        parametros = {
            "event_id": e.event_id, "event_time": e.event_time_ms, "updated": e.updated_ms,
            "mag": e.mag, "mag_type": e.mag_type, "depth_km": e.depth_km,
            "longitude": e.longitude, "latitude": e.latitude, "place": e.place,
            "source": e.source, "mode": e.mode, "ingested_at": e.ingested_at_ms,
            "topic": topic, "partition": partition, "offset": offset, "raw": Jsonb(e.raw),
        }
        async with self._conexion.transaction():
            cursor = await self._conexion.execute(SQL_INSERTAR, parametros)
            return cursor.rowcount == 1
