"""Servicio productor: consulta USGS cada 60 s y, solo si INGESTA_PUBLICAR=true, publica en Kafka.

En modo seco (por defecto) consulta, registra y conserva la respuesta, pero no publica ni marca versiones como publicadas.
"""

import asyncio
import logging
import time
from pathlib import Path

import psycopg
from aiokafka import AIOKafkaProducer

from observatorio.config import ConfigEmsc, ConfigIngesta, ConfigKafka, ConfigPostgres
from observatorio.producer.ingesta import ejecutar_ciclo
from observatorio.producer.ingesta_emsc import bucle_emsc
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


def iniciar_emsc(pg: ConfigPostgres, config: ConfigIngesta, publicador) -> "asyncio.Task | None":
    """Lanza la tarea de EMSC si está activa (EMSC_ACTIVO) y hay publicación real. Un fallo al leer su configuración NO impide que arranque la ingesta de USGS."""
    try:
        emsc = ConfigEmsc.desde_entorno()
    except Exception as exc:  # noqa: BLE001 - configuración de EMSC no válida: se avisa y se sigue solo con USGS
        log.error("Configuración de EMSC no válida (%s); se ingiere solo USGS", exc)
        return None
    if not emsc.activo:
        log.info("EMSC apagada (EMSC_ACTIVO no es true): solo se ingiere USGS")
        return None
    if publicador is None:
        log.warning("EMSC_ACTIVO=true pero INGESTA_PUBLICAR=false (modo seco): EMSC no se consulta")
        return None
    log.info("Ingesta EMSC cada %s s, magnitud mínima %g, consulta incremental (%s)", emsc.intervalo_s, emsc.mag_min, emsc.url)
    tarea = asyncio.create_task(bucle_emsc(lambda: conectar_postgres(pg), emsc, config.retencion_consultas_dias, publicador), name="emsc")
    tarea.add_done_callback(lambda t: None if t.cancelled() or t.exception() is None else log.error("La tarea de EMSC terminó con error: %r", t.exception()))
    return tarea


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
    tarea_emsc = iniciar_emsc(pg, config, publicador)  # F8: segunda fuente, tarea APARTE con su conexión, su estado y sus errores; None si está apagada
    try:
        while True:
            inicio = time.monotonic()
            for _ in (1, 2):
                try:
                    await ejecutar_ciclo(RepositorioProductor(conexion, config.hueco_margen_s if publicador is not None else None), config, publicador)
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
        if tarea_emsc is not None:
            tarea_emsc.cancel()
            await asyncio.gather(tarea_emsc, return_exceptions=True)
        if productor is not None:
            await productor.stop()
        await conexion.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    asyncio.run(main())
