"""Versiones y estado actual en PostgreSQL (data-model.md; research R-006).

Una versión es `(event_id, updated)`. Cada versión distinta va al historial (`evento_version`); el estado actual
(`evento_actual`) solo avanza si la versión recibida es más reciente que la almacenada.

F6: el mismo repositorio sirve al flujo en vivo (`live`, por defecto) y a la reproducción aislada (`replay`, con `run_id` y `caso`); ver `destino.py`.
"""

import hashlib
from dataclasses import dataclass

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from observatorio.consumer.destino import DESTINO_LIVE, Destino, sql_actual, sql_cuarentena, sql_retirar, sql_version
from observatorio.consumer.mensaje import Clasificacion, EventoRecibido

# El SQL se genera en `destino.py` para el destino `live` (idéntico al de siempre: lo prueba test_destino_sql.py) y para `replay` (F6).
# Estas constantes son las del flujo en vivo; otras pruebas las sustituyen para provocar fallos, así que `RepositorioEventos` las lee en cada llamada.
SQL_VERSION = sql_version(DESTINO_LIVE)
SQL_ACTUAL = sql_actual(DESTINO_LIVE)
SQL_RETIRAR = sql_retirar(DESTINO_LIVE)
SQL_CUARENTENA = sql_cuarentena(DESTINO_LIVE)


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
    def __init__(self, conexion: AsyncConnection, asignador=None, destino: Destino = DESTINO_LIVE):
        # `asignador` (F4): asigna el país a cada versión. Sin él (pruebas de F3) el país queda sin asignar (nulo).
        self._conexion = conexion
        self._asignador = asignador
        self._destino = destino
        # Solo el destino de replay usa SQL propio; el de `live` lee las constantes del módulo en cada llamada (las pruebas de F3 las parchean).
        self._sql_replay = ({"version": sql_version(destino), "actual": sql_actual(destino), "retirar": sql_retirar(destino), "cuarentena": sql_cuarentena(destino)}
                            if destino.con_run else None)

    @property
    def destino(self) -> Destino:
        return self._destino

    def _sql(self, nombre: str) -> str:
        if self._sql_replay is not None:
            return self._sql_replay[nombre]
        return {"version": SQL_VERSION, "actual": SQL_ACTUAL, "retirar": SQL_RETIRAR, "cuarentena": SQL_CUARENTENA}[nombre]

    async def guardar_version(self, e: EventoRecibido, topic: str, partition: int, offset: int) -> str:
        """Guarda la versión y actualiza el estado actual en UNA transacción.

        Devuelve «duplicada» (esa versión ya estaba), «guardada» (nueva y es la más reciente: crea o actualiza el estado
        actual) o «antigua» (nueva, pero ya hay una posterior: queda solo en el historial).
        """
        # La asignación es un cálculo puro y va ANTES de la transacción; si falla, no se escribe nada ni se confirma el offset.
        a = self._asignador.asignar(e.longitude, e.latitude) if self._asignador is not None else None
        parametros = {
            "country_id": a.country_id if a else None, "country_name": a.nombre if a else None,
            "geo_resultado": a.resultado if a else None, "geo_catalogo": a.catalogo if a else None,
            "event_id": e.event_id, "event_time": e.event_time_ms, "updated": e.updated_ms,
            "mag": e.mag, "mag_type": e.mag_type, "depth_km": e.depth_km,
            "longitude": e.longitude, "latitude": e.latitude, "place": e.place,
            "source": e.source, "mode": e.mode, "ingested_at": e.ingested_at_ms,
            "topic": topic, "partition": partition, "offset": offset, "raw": Jsonb(e.raw),
        }
        if self._destino.con_run:
            if e.mode != self._destino.modo or not e.run_id:
                raise ValueError(f"el destino {self._destino.nombre} solo guarda eventos de modo {self._destino.modo} con run_id (recibido modo={e.mode!r}, run_id={e.run_id!r})")
            parametros.update(run_id=e.run_id, caso=e.caso)
        async with self._conexion.transaction():
            nueva = (await self._conexion.execute(self._sql("version"), parametros)).rowcount == 1
            if not nueva:
                return "duplicada"
            vigente = (await self._conexion.execute(self._sql("actual"), parametros)).rowcount == 1
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
            retirado = c.event_id is not None and c.updated_ms is not None and await self.retirar_evento(c.event_id, c.updated_ms, c.run_id)
            return nuevo, retirado

    async def _insertar_cuarentena(self, c: Clasificacion, ref: ReferenciaMensaje) -> bool:
        parametros = {
            "categoria": c.estado, "motivo": c.motivo, "event_id": _sin_nul(c.event_id), "updated_ms": c.updated_ms,
            "topic": ref.topic, "partition": ref.partition, "offset": ref.offset,
            "clave": _sin_nul(ref.clave.decode("utf-8", errors="replace")) if ref.clave is not None else None,
            "payload": ref.contenido, "huella": calcular_huella(c.estado, c.motivo, c.base_huella),
        }
        if self._destino.con_run:
            if not c.run_id:
                raise ValueError("la cuarentena del destino replay necesita run_id")
            parametros["run_id"] = c.run_id
        return (await self._conexion.execute(self._sql("cuarentena"), parametros)).rowcount == 1

    async def retirar_evento(self, event_id: str, updated_ms: int, run_id: str | None = None) -> bool:
        """Marca como retirado un evento ya conocido cuya versión más reciente deja de ser terremoto (D2)."""
        parametros = {"event_id": event_id, "updated": updated_ms}
        if self._destino.con_run:
            if not run_id:
                raise ValueError("retirar un evento del destino replay necesita run_id")
            parametros["run_id"] = run_id
        async with self._conexion.transaction():
            cursor = await self._conexion.execute(self._sql("retirar"), parametros)
            return cursor.rowcount == 1
