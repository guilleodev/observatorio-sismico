"""Servicio consumidor: Kafka -> PostgreSQL con offsets manuales (se confirman tras guardar)."""

import asyncio
import logging
from pathlib import Path

import psycopg
from aiokafka import AIOKafkaConsumer, TopicPartition

from observatorio.config import ConfigKafka, ConfigPostgres, leer_obligatoria
from observatorio.consumer.mensaje import MensajeInvalido, interpretar_mensaje
from observatorio.consumer.repositorio import RepositorioEventos

MARCA_SALUD = Path("/tmp/healthy")
ESPERA_MAX_S = 30

log = logging.getLogger("consumer")


async def procesar_registro(consumidor, registro, repositorio) -> str:
    """Guarda la versión y SOLO después confirma su offset. Si guardar falla, no se confirma.

    Resultados: «guardada», «antigua» o «duplicada» (ver RepositorioEventos.guardar_version) y «descartado» si el mensaje no es válido."""
    try:
        evento = interpretar_mensaje(registro.value)
    except MensajeInvalido as motivo:
        # Descarte visible (la cuarentena duradera es de F3); se confirma para no bloquear la cola.
        log.warning("DESCARTADO offset=%s clave=%r motivo=%s", registro.offset, registro.key, motivo)
        resultado = "descartado"
    else:
        resultado = await repositorio.guardar_version(evento, registro.topic, registro.partition, registro.offset)
        log.info("%s id=%s offset=%s", resultado.upper(), evento.event_id, registro.offset)
    await consumidor.commit({TopicPartition(registro.topic, registro.partition): registro.offset + 1})
    return resultado


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

    def __init__(self, config: ConfigPostgres, conexion):
        self._config, self._conexion = config, conexion

    @classmethod
    async def abrir(cls, config: ConfigPostgres) -> "ConexionPostgres":
        return cls(config, await cls._conectar(config))

    @staticmethod
    async def _conectar(config: ConfigPostgres):
        return await con_reintentos(
            lambda: psycopg.AsyncConnection.connect(config.conninfo(), autocommit=True), "PostgreSQL")

    def repositorio(self) -> RepositorioEventos:
        return RepositorioEventos(self._conexion)

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
