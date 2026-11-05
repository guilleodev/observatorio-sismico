"""Servicio productor: consulta USGS cada 60 s y, solo si INGESTA_PUBLICAR=true, publica en Kafka.

En modo seco (por defecto) consulta, registra y conserva la respuesta, pero no publica ni marca versiones como publicadas.
"""

import asyncio
import logging
import time
from pathlib import Path

import psycopg
from aiokafka import AIOKafkaProducer

from observatorio.config import ConfigIngesta, ConfigKafka, ConfigPostgres
from observatorio.producer.ingesta import ejecutar_ciclo
from observatorio.producer.repositorio import RepositorioProductor

MARCA_SALUD = Path("/tmp/healthy")
ESPERA_MAX_S = 30

log = logging.getLogger("producer")


async def con_reintentos(accion, descripcion: str):
    espera = 1
    while True:
        try:
            return await accion()
        except Exception as exc:
            log.warning("%s no disponible (%s); reintento en %s s", descripcion, exc, espera)
            await asyncio.sleep(espera)
            espera = min(espera * 2, ESPERA_MAX_S)


async def conectar_postgres(pg: ConfigPostgres):
    return await con_reintentos(lambda: psycopg.AsyncConnection.connect(pg.conninfo(), autocommit=True), "PostgreSQL")


async def conectar_kafka(kafka: ConfigKafka) -> AIOKafkaProducer:
    async def arrancar():
        productor = AIOKafkaProducer(bootstrap_servers=kafka.bootstrap_servers)
        try:
            await productor.start()
        except Exception:
            await productor.stop()
            raise
        return productor

    return await con_reintentos(arrancar, "Kafka")


async def main() -> None:
    kafka, pg, config = ConfigKafka.desde_entorno(), ConfigPostgres.desde_entorno(), ConfigIngesta.desde_entorno()
    log.info("Ingesta USGS cada %s s en modo %s (%s)", config.intervalo_s,
             "PUBLICACIÓN REAL" if config.publicar else "SECO: no se publica en Kafka", config.usgs_url)

    conexion = await conectar_postgres(pg)
    productor, publicador = None, None
    if config.publicar:
        productor = await conectar_kafka(kafka)

        async def publicador(clave: bytes, valor: bytes):
            meta = await productor.send_and_wait(kafka.topic, value=valor, key=clave)
            return meta.partition, meta.offset

    MARCA_SALUD.touch()
    try:
        while True:
            inicio = time.monotonic()
            for _ in (1, 2):
                try:
                    await ejecutar_ciclo(RepositorioProductor(conexion), config, publicador)
                    break
                except psycopg.Error as exc:  # sin PostgreSQL no se publica a ciegas (R-014)
                    log.error("PostgreSQL falló (%s); se reconecta antes de reintentar el ciclo", exc)
                    await conexion.close()
                    conexion = await conectar_postgres(pg)
                except Exception:
                    log.exception("Fallo inesperado en el ciclo; se reintenta en el siguiente")
                    break
            # intervalo entre INICIOS de ciclo, sin solapar: si el ciclo duró más, el siguiente empieza ya
            await asyncio.sleep(max(0.0, config.intervalo_s - (time.monotonic() - inicio)))
    finally:
        MARCA_SALUD.unlink(missing_ok=True)
        if productor is not None:
            await productor.stop()
        await conexion.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    asyncio.run(main())
