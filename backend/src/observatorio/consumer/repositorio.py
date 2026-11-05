"""Versiones y estado actual en PostgreSQL (data-model.md; research R-006).

Una versión es `(event_id, updated)`. Cada versión distinta va al historial (`evento_version`); el estado actual
(`evento_actual`) solo avanza si la versión recibida es más reciente que la almacenada.
"""

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from observatorio.consumer.mensaje import EventoRecibido

COLUMNAS = """event_id, event_time, updated_at, mag, mag_type, depth_km, longitude, latitude, place,
    source, mode, ingested_at, kafka_topic, kafka_partition, kafka_offset, raw"""
VALORES = """%(event_id)s, to_timestamp(%(event_time)s / 1000.0), to_timestamp(%(updated)s / 1000.0),
    %(mag)s, %(mag_type)s, %(depth_km)s, %(longitude)s, %(latitude)s, %(place)s,
    %(source)s, %(mode)s, to_timestamp(%(ingested_at)s / 1000.0),
    %(topic)s, %(partition)s, %(offset)s, %(raw)s"""

# Historial: una fila por versión distinta. Si ya existe (event_id, updated_at) no hace nada.
SQL_VERSION = f"""
INSERT INTO live.evento_version ({COLUMNAS})
VALUES ({VALORES})
ON CONFLICT (event_id, updated_at) DO NOTHING
"""

# Estado actual: se crea o se actualiza SOLO si la versión recibida es más reciente (una antigua no lo sobrescribe).
# Una versión posterior de terremoto también reactiva un evento retirado.
SQL_ACTUAL = f"""
INSERT INTO live.evento_actual ({COLUMNAS}, retirado)
VALUES ({VALORES}, false)
ON CONFLICT (event_id) DO UPDATE SET
    event_time = EXCLUDED.event_time, updated_at = EXCLUDED.updated_at, mag = EXCLUDED.mag, mag_type = EXCLUDED.mag_type,
    depth_km = EXCLUDED.depth_km, longitude = EXCLUDED.longitude, latitude = EXCLUDED.latitude, place = EXCLUDED.place,
    source = EXCLUDED.source, mode = EXCLUDED.mode, ingested_at = EXCLUDED.ingested_at, kafka_topic = EXCLUDED.kafka_topic,
    kafka_partition = EXCLUDED.kafka_partition, kafka_offset = EXCLUDED.kafka_offset, raw = EXCLUDED.raw,
    retirado = false, stored_at = now()
WHERE EXCLUDED.updated_at > live.evento_actual.updated_at
"""

# Reclasificación a no sísmico (D2): el evento sale del estado actual sin borrarse. Toma el `updated_at` de la versión que
# lo retira, de modo que una versión antigua tardía no lo reviva. Un evento nunca visto no crea fila.
SQL_RETIRAR = """
UPDATE live.evento_actual SET retirado = true, updated_at = to_timestamp(%(updated)s / 1000.0), stored_at = now()
WHERE event_id = %(event_id)s AND updated_at < to_timestamp(%(updated)s / 1000.0)
"""


class RepositorioEventos:
    def __init__(self, conexion: AsyncConnection):
        self._conexion = conexion

    async def guardar_version(self, e: EventoRecibido, topic: str, partition: int, offset: int) -> str:
        """Guarda la versión y actualiza el estado actual en UNA transacción.

        Devuelve «duplicada» (esa versión ya estaba), «guardada» (nueva y es la más reciente: crea o actualiza el estado
        actual) o «antigua» (nueva, pero ya hay una posterior: queda solo en el historial).
        """
        parametros = {
            "event_id": e.event_id, "event_time": e.event_time_ms, "updated": e.updated_ms,
            "mag": e.mag, "mag_type": e.mag_type, "depth_km": e.depth_km,
            "longitude": e.longitude, "latitude": e.latitude, "place": e.place,
            "source": e.source, "mode": e.mode, "ingested_at": e.ingested_at_ms,
            "topic": topic, "partition": partition, "offset": offset, "raw": Jsonb(e.raw),
        }
        async with self._conexion.transaction():
            nueva = (await self._conexion.execute(SQL_VERSION, parametros)).rowcount == 1
            if not nueva:
                return "duplicada"
            vigente = (await self._conexion.execute(SQL_ACTUAL, parametros)).rowcount == 1
            return "guardada" if vigente else "antigua"

    async def retirar_evento(self, event_id: str, updated_ms: int) -> bool:
        """Marca como retirado un evento ya conocido cuya versión más reciente deja de ser terremoto (D2)."""
        async with self._conexion.transaction():
            cursor = await self._conexion.execute(SQL_RETIRAR, {"event_id": event_id, "updated": updated_ms})
            return cursor.rowcount == 1
