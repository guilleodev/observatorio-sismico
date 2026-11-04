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
    """Guarda el registro y SOLO después confirma su offset. Si guardar falla, no se confirma."""
    try:
        evento = interpretar_mensaje(registro.value)
    except MensajeInvalido as motivo:
        # Descarte visible (la cuarentena duradera es de F3); se confirma para no bloquear la cola.
        log.warning("DESCARTADO offset=%s clave=%r motivo=%s", registro.offset, registro.key, motivo)
        resultado = "descartado"
    else:
        creado = await repositorio.guardar(evento, registro.topic, registro.partition, registro.offset)
        resultado = "guardado" if creado else "duplicado"
        log.info("%s id=%s offset=%s", resultado.upper(), evento.event_id, registro.offset)
    await consumidor.commit({TopicPartition(registro.topic, registro.partition): registro.offset + 1})
    return resultado


async def con_reintentos(accion, descripcion: str):
    espera = 1
    while True:
        try:
            return await accion()
        except Exception as exc:
            log.warning("%s no disponible (%s); reintento en %s s", descripcion, exc, espera)
            await asyncio.sleep(espera)
            espera = min(espera * 2, ESPERA_MAX_S)


async def main() -> None:
    kafka = ConfigKafka.desde_entorno()
    pg = ConfigPostgres.desde_entorno()
    grupo = leer_obligatoria("KAFKA_CONSUMER_GROUP")

    conexion = await con_reintentos(
        lambda: psycopg.AsyncConnection.connect(pg.conninfo(), autocommit=True), "PostgreSQL")

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
    repositorio = RepositorioEventos(conexion)
    try:
        async for registro in consumidor:
            espera = 1
            while True:  # mismo registro hasta que se guarde: no se salta ningún offset
                try:
                    await procesar_registro(consumidor, registro, repositorio)
                    break
                except Exception as exc:
                    log.error("Fallo al guardar offset=%s (%s); NO se confirma, reintento en %s s",
                              registro.offset, exc, espera)
                    await asyncio.sleep(espera)
                    espera = min(espera * 2, ESPERA_MAX_S)
                    if conexion.closed or conexion.broken:
                        conexion = await con_reintentos(
                            lambda: psycopg.AsyncConnection.connect(pg.conninfo(), autocommit=True),
                            "PostgreSQL")
                        repositorio = RepositorioEventos(conexion)
    finally:
        MARCA_SALUD.unlink(missing_ok=True)
        await consumidor.stop()
        await conexion.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    asyncio.run(main())
