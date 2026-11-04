"""Emite el evento sintético a Kafka y espera la confirmación del broker.

Uso: python -m observatorio.producer.emitir_sintetico [--repeat N] [--secuencia N] [--minutos-atras M]
Código de salida 0 si todos los mensajes fueron confirmados; distinto de 0 si Kafka falla.
"""

import argparse
import asyncio
import sys

from aiokafka import AIOKafkaProducer

from observatorio.config import ConfigError, ConfigKafka
from observatorio.sintetico import construir_evento, construir_mensaje, serializar

TIMEOUT_CONEXION_S = 15


def entero_minimo(minimo: int):
    def convertir(texto: str) -> int:
        valor = int(texto)
        if valor < minimo:
            raise argparse.ArgumentTypeError(f"debe ser >= {minimo}")
        return valor

    return convertir


def leer_argumentos(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Emite un evento sintético (MVP) a Kafka")
    parser.add_argument("--repeat", type=entero_minimo(1), default=1,
                        help="reenvía el mismo mensaje N veces (prueba de reenvío idéntico)")
    parser.add_argument("--secuencia", type=entero_minimo(1), default=1,
                        help="sufijo del id: synthetic-mvp-00N")
    parser.add_argument("--minutos-atras", type=entero_minimo(0), default=10,
                        help="minutos transcurridos desde que ocurrió el evento")
    return parser.parse_args(argv)


async def emitir(config: ConfigKafka, repeat: int, secuencia: int, minutos_atras: int) -> int:
    evento = construir_evento(secuencia=secuencia, minutos_atras=minutos_atras)
    clave, valor = serializar(construir_mensaje(evento))  # un único mensaje, reenviado repeat veces

    productor = AIOKafkaProducer(bootstrap_servers=config.bootstrap_servers)
    try:
        await asyncio.wait_for(productor.start(), timeout=TIMEOUT_CONEXION_S)
        for i in range(1, repeat + 1):
            meta = await productor.send_and_wait(config.topic, value=valor, key=clave)
            print(f"[{i}/{repeat}] confirmado: id={evento['id']} topic={meta.topic} "
                  f"partición={meta.partition} offset={meta.offset}")
    finally:
        await productor.stop()
    return repeat


def main() -> int:
    args = leer_argumentos()
    try:
        config = ConfigKafka.desde_entorno()
        asyncio.run(emitir(config, args.repeat, args.secuencia, args.minutos_atras))
    except ConfigError as exc:
        print(f"ERROR de configuración: {exc}", file=sys.stderr)
        return 2
    except Exception as exc:  # Kafka caído, tiempo agotado, etc.: error visible y código distinto de 0
        print(f"ERROR: no se pudo publicar en Kafka ({type(exc).__name__}: {exc})", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
