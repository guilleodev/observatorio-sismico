"""Versiones y estado actual en PostgreSQL (data-model.md; research R-006).

Una versión es `(event_id, updated)`. Cada versión distinta va al historial (`evento_version`); el estado actual
(`evento_actual`) solo avanza si la versión recibida es más reciente que la almacenada.
"""

import hashlib
from dataclasses import dataclass

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from observatorio.consumer.mensaje import Clasificacion, EventoRecibido

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


# Cuarentena (R-007): excluidos (no sísmicos) e inválidos, con motivo y referencia al mensaje original.
SQL_CUARENTENA = """
INSERT INTO live.cuarentena (categoria, motivo, event_id, updated_ms, kafka_topic, kafka_partition, kafka_offset, clave, payload, huella)
VALUES (%(categoria)s, %(motivo)s, %(event_id)s, %(updated_ms)s, %(topic)s, %(partition)s, %(offset)s, %(clave)s, %(payload)s, %(huella)s)
ON CONFLICT (huella) DO NOTHING
"""


@dataclass(frozen=True)
class ReferenciaMensaje:
    """Dónde estaba el mensaje original y qué contenía."""

    topic: str
    partition: int
    offset: int
    clave: bytes | None
    contenido: bytes


def _sin_nul(texto: str | None) -> str | None:
    """PostgreSQL no admite NUL en `text`: la cuarentena nunca debe fallar por el propio dato que aísla (el original va en `payload`)."""
    return texto.replace("\x00", "") if texto is not None else None


def calcular_huella(categoria: str, motivo: str, base_huella: bytes) -> str:
    """Identidad de un registro de cuarentena: categoría, motivo y versión del evento (o, si no es legible, su contenido).

    No incluye `ingested_at`, así que un reenvío del mismo evento y versión no crea otra fila (ENUNCIADO.md §7).
    """
    return hashlib.sha256(categoria.encode() + b"|" + motivo.encode() + b"|" + base_huella).hexdigest()


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

    async def poner_en_cuarentena(self, c: Clasificacion, ref: ReferenciaMensaje) -> bool:
        """Registra el mensaje (categoría `excluido` o `invalido`). True si es nuevo, False si ya estaba (reenvío)."""
        async with self._conexion.transaction():
            return await self._insertar_cuarentena(c, ref)

    async def excluir_evento(self, c: Clasificacion, ref: ReferenciaMensaje) -> tuple[bool, bool]:
        """Evento que dejó de ser terremoto: lo registra y, en la misma transacción, retira el evento si ya lo conocíamos.

        Devuelve (registro nuevo en cuarentena, evento retirado).
        """
        async with self._conexion.transaction():
            nuevo = await self._insertar_cuarentena(c, ref)
            retirado = c.event_id is not None and c.updated_ms is not None and await self.retirar_evento(c.event_id, c.updated_ms)
            return nuevo, retirado

    async def _insertar_cuarentena(self, c: Clasificacion, ref: ReferenciaMensaje) -> bool:
        parametros = {
            "categoria": c.estado, "motivo": c.motivo, "event_id": _sin_nul(c.event_id), "updated_ms": c.updated_ms,
            "topic": ref.topic, "partition": ref.partition, "offset": ref.offset,
            "clave": _sin_nul(ref.clave.decode("utf-8", errors="replace")) if ref.clave is not None else None,
            "payload": ref.contenido, "huella": calcular_huella(c.estado, c.motivo, c.base_huella),
        }
        return (await self._conexion.execute(SQL_CUARENTENA, parametros)).rowcount == 1

    async def retirar_evento(self, event_id: str, updated_ms: int) -> bool:
        """Marca como retirado un evento ya conocido cuya versión más reciente deja de ser terremoto (D2)."""
        async with self._conexion.transaction():
            cursor = await self._conexion.execute(SQL_RETIRAR, {"event_id": event_id, "updated": updated_ms})
            return cursor.rowcount == 1
