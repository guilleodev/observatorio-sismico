"""Servicio productor: se conecta a Kafka con reintentos, marca su salud y espera.

Los eventos se emiten bajo demanda con `python -m observatorio.producer.emitir_sintetico`.
"""

import asyncio
import logging
from pathlib import Path

from aiokafka import AIOKafkaProducer

from observatorio.config import ConfigKafka

MARCA_SALUD = Path("/tmp/healthy")
ESPERA_MAX_S = 30

log = logging.getLogger("producer")


async def conectar(config: ConfigKafka) -> AIOKafkaProducer:
    espera = 1
    while True:
        productor = AIOKafkaProducer(bootstrap_servers=config.bootstrap_servers)
        try:
            await productor.start()
            return productor
        except Exception as exc:
            await productor.stop()
            log.warning("Kafka no disponible (%s); reintento en %s s", exc, espera)
            await asyncio.sleep(espera)
            espera = min(espera * 2, ESPERA_MAX_S)


async def main() -> None:
    config = ConfigKafka.desde_entorno()
    productor = await conectar(config)
    MARCA_SALUD.touch()
    log.info("Conectado a Kafka (%s); a la espera de emisiones bajo demanda", config.bootstrap_servers)
    try:
        await asyncio.Event().wait()  # no termina: el servicio queda vivo
    finally:
        MARCA_SALUD.unlink(missing_ok=True)
        await productor.stop()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    asyncio.run(main())
