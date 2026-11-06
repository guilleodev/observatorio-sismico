"""Servicio consumidor: Kafka -> PostgreSQL con offsets manuales (se confirman tras guardar)."""

import asyncio
import logging
from pathlib import Path

import psycopg
from aiokafka import AIOKafkaConsumer, TopicPartition

from observatorio.config import ConfigKafka, ConfigPostgres, leer_obligatoria
from observatorio.consumer.mensaje import Clasificacion, clasificar_mensaje
from observatorio.consumer.repositorio import ReferenciaMensaje, RepositorioEventos
from observatorio.geo.arranque import esperar_asignador, preparar_asignador

MARCA_SALUD = Path("/tmp/healthy")
ESPERA_MAX_S = 30

log = logging.getLogger("consumer")


async def procesar_registro(consumidor, registro, repositorio) -> str:
    """Clasifica el mensaje, lo persiste y SOLO después confirma su offset. Si persistir falla, no se confirma.

    Resultados: «guardada», «antigua» o «duplicada» (terremoto válido; ver RepositorioEventos.guardar_version), «excluida»
    (no sísmico, a cuarentena y retirada si ya lo conocíamos), «cuarentena» (registro no tratable) y «descartado» (modo o
    fuente fuera de contrato; solo se registra en el log).
    """
    c = clasificar_mensaje(registro.value)
    ref = ReferenciaMensaje(registro.topic, registro.partition, registro.offset, registro.key, registro.value or b"")
    if c.estado == "descartado":
        log.warning("DESCARTADO offset=%s clave=%r motivo=%s", registro.offset, registro.key, c.motivo)
        resultado = "descartado"
    elif c.estado == "valido":
        resultado = await repositorio.guardar_version(c.evento, registro.topic, registro.partition, registro.offset)
        log.info("%s id=%s offset=%s", resultado.upper(), c.event_id, registro.offset)
    elif c.estado == "excluido":
        _, retirado = await repositorio.excluir_evento(c, ref)
        resultado = "excluida"
        log.info("EXCLUIDA id=%s offset=%s motivo=%s retirado=%s", c.event_id, registro.offset, c.motivo, retirado)
    else:
        await repositorio.poner_en_cuarentena(c, ref)
        resultado = "cuarentena"
        log.warning("CUARENTENA id=%s offset=%s clave=%r motivo=%s", c.event_id, registro.offset, registro.key, c.motivo)
    await consumidor.commit({TopicPartition(registro.topic, registro.partition): registro.offset + 1})
    return resultado


# Errores que NO se arreglan reintentando: el dato en sí no cabe en la base (DataError: valor fuera de rango, NUL en texto),
# viola una restricción (IntegrityError) o no se puede codificar (UnicodeError). Los de conexión (OperationalError,
# InterfaceError) y los de Kafka son transitorios y siguen reintentándose.
ERRORES_PERMANENTES = (psycopg.errors.DataError, psycopg.errors.IntegrityError, UnicodeError)
# Excepción (F4): una violación de la clave foránea de país NO es un dato malo sino una configuración incoherente (catálogo o
# `geo.pais` desincronizados): no se manda a cuarentena un terremoto válido, se reintenta sin confirmar hasta corregirlo.
NO_PERMANENTES = (psycopg.errors.ForeignKeyViolation,)


async def aislar_error_permanente(consumidor, registro, repositorio, exc: Exception) -> str:
    """Manda a cuarentena un registro que no se puede persistir (categoría invalido) y confirma su offset."""
    contenido = registro.value or b""
    ref = ReferenciaMensaje(registro.topic, registro.partition, registro.offset, registro.key, contenido)
    motivo = f"error permanente de persistencia: {type(exc).__name__}"
    await repositorio.poner_en_cuarentena(Clasificacion("invalido", motivo=motivo, base_huella=contenido), ref)
    log.error("CUARENTENA offset=%s clave=%r motivo=%s (%s)", registro.offset, registro.key, motivo, exc)
    await consumidor.commit({TopicPartition(registro.topic, registro.partition): registro.offset + 1})
    return "cuarentena"


async def procesar_con_reintentos(consumidor, registro, obtener_repositorio, asegurar_conexion, dormir=asyncio.sleep) -> str:
    """Reintenta EL MISMO registro hasta que se guarde y se confirme: no se salta ni se duplica ninguna versión.

    Si falla guardar (PostgreSQL) no se confirma el offset. Si falla la confirmación (Kafka) después de guardar, el reintento
    encuentra la versión ya guardada («duplicada», idempotente) y vuelve a confirmar. La espera crece 1, 2, 4… hasta ESPERA_MAX_S.
    """
    espera = 1
    while True:
        try:
            return await procesar_registro(consumidor, registro, obtener_repositorio())
        except Exception as exc:
            if isinstance(exc, ERRORES_PERMANENTES) and not isinstance(exc, NO_PERMANENTES):
                # El mismo registro volvería a fallar siempre: reintentar bloquearía la partición (FR-014). Va a cuarentena.
                try:
                    return await aislar_error_permanente(consumidor, registro, obtener_repositorio(), exc)
                except Exception as exc_cuarentena:
                    exc = exc_cuarentena  # no se pudo ni aislar (p. ej. la base cayó entre medias): se trata como transitorio
            log.error("Fallo al procesar offset=%s (%s); NO se salta, reintento en %s s", registro.offset, exc, espera)
            await dormir(espera)
            espera = min(espera * 2, ESPERA_MAX_S)
            await asegurar_conexion()


async def con_reintentos(accion, descripcion: str):
    espera = 1
    while True:
        try:
            return await accion()
        except Exception as exc:
            log.warning("%s no disponible (%s); reintento en %s s", descripcion, exc, espera)
            await asyncio.sleep(espera)
            espera = min(espera * 2, ESPERA_MAX_S)


class ConexionPostgres:
    """Conexión viva a PostgreSQL: se reabre si se cerró o se rompió (p. ej. tras reiniciar la base)."""

    def __init__(self, config: ConfigPostgres, conexion, asignador=None):
        self._config, self._conexion, self.asignador = config, conexion, asignador

    @classmethod
    async def abrir(cls, config: ConfigPostgres) -> "ConexionPostgres":
        return cls(config, await cls._conectar(config))

    @staticmethod
    async def _conectar(config: ConfigPostgres):
        return await con_reintentos(
            lambda: psycopg.AsyncConnection.connect(config.conninfo(), autocommit=True), "PostgreSQL")

    def repositorio(self) -> RepositorioEventos:
        return RepositorioEventos(self._conexion, self.asignador)

    def en_bruto(self):
        return self._conexion

    async def asegurar(self) -> None:
        if self._conexion.closed or self._conexion.broken:
            self._conexion = await self._conectar(self._config)

    async def cerrar(self) -> None:
        await self._conexion.close()


async def main() -> None:
    kafka = ConfigKafka.desde_entorno()
    pg = ConfigPostgres.desde_entorno()
    grupo = leer_obligatoria("KAFKA_CONSUMER_GROUP")

    conexion = await ConexionPostgres.abrir(pg)

    # Sin catálogo válido y coherente con la base NO se consume ni se declara sano (4.2): ningún evento se procesa a ciegas.
    conexion.asignador = await esperar_asignador(lambda: preparar_asignador(conexion.en_bruto()), conexion.asegurar)

    consumidor = AIOKafkaConsumer(
        kafka.topic, bootstrap_servers=kafka.bootstrap_servers, group_id=grupo,
        enable_auto_commit=False, auto_offset_reset="earliest")

    async def arrancar():
        try:
            await consumidor.start()
        except Exception:
            await consumidor.stop()
            raise
    await con_reintentos(arrancar, "Kafka")

    MARCA_SALUD.touch()
    log.info("Consumiendo %s con el grupo %s", kafka.topic, grupo)
    try:
        async for registro in consumidor:
            await procesar_con_reintentos(consumidor, registro, conexion.repositorio, conexion.asegurar)
    finally:
        MARCA_SALUD.unlink(missing_ok=True)
        await consumidor.stop()
        await conexion.cerrar()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    asyncio.run(main())
