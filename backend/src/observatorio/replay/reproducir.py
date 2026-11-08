"""Productor de replay BAJO DEMANDA (F6, 6.1): publica por Kafka una selección histórica con casos controlados, a la velocidad configurada.

    docker compose run --rm --no-deps producer python -m observatorio.replay.reproducir [--dia 2025-03-28] [--run ID] [--reanudar ID] [--solo-plan]

No es un servicio permanente. Lee `historico.evento` (solo lectura, en `seleccion.py`), registra la ejecución en `replay.ejecucion` y publica en `terremotos.replay`
(topic propio: nunca el de vivo; `ConfigReplay` lo comprueba). Conserva `time` y `updated` originales y añade el instante de reproducción (`ingested_at`).
El estado de la ejecución lo escribe este productor: `en_curso` al registrarla y `terminada` tras publicar y confirmar con Kafka el último mensaje.
Reanudar (`--reanudar`) vuelve a publicar la selección completa con el mismo `run_id`: el procesamiento idempotente absorbe los repetidos.
"""

import argparse
import asyncio
import json
import logging
import re
import sys
from datetime import date, datetime, timezone

import psycopg
from aiokafka import AIOKafkaProducer

from observatorio.config import ConfigPostgres, ConfigReplay, leer_obligatoria
from observatorio.replay.casos import MensajeReplay, a_mensaje_kafka, construir_secuencia, serializar
from observatorio.replay.seleccion import elegir_dia, seleccionar
from observatorio.tiempo import ahora_ms

log = logging.getLogger("replay")
RUN_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")

SQL_REGISTRAR = """
INSERT INTO replay.ejecucion (run_id, dia, tamano, mensajes, criterio, intervalo_desde, intervalo_hasta, intervalo_s, velocidad)
VALUES (%(run_id)s, %(dia)s, %(tamano)s, %(mensajes)s, %(criterio)s, %(desde)s, %(hasta)s, %(intervalo_s)s, %(velocidad)s)
ON CONFLICT (run_id) DO UPDATE SET estado = 'en_curso', terminada_at = NULL
WHERE replay.ejecucion.dia IS NOT DISTINCT FROM EXCLUDED.dia AND replay.ejecucion.tamano = EXCLUDED.tamano AND replay.ejecucion.mensajes = EXCLUDED.mensajes
"""
SQL_ESTADO = "UPDATE replay.ejecucion SET estado = %(estado)s, terminada_at = CASE WHEN %(estado)s = 'terminada' THEN now() ELSE NULL END WHERE run_id = %(run_id)s"


def nuevo_run_id(ahora: datetime | None = None) -> str:
    return "r-" + (ahora or datetime.now(timezone.utc)).strftime("%Y%m%dT%H%M%SZ")


def velocidad_prevista(features: list[dict], n_mensajes: int, intervalo_s: float) -> float | None:
    """Aceleración: tiempo real que cubre la selección / duración de la reproducción. Nula si no se puede calcular (un solo evento o ningún tiempo cubierto)."""
    if len(features) < 2 or n_mensajes < 2:
        return None
    tiempos = [f["properties"]["time"] for f in features]
    cubierto_s = (max(tiempos) - min(tiempos)) / 1000
    return round(cubierto_s / ((n_mensajes - 1) * intervalo_s), 3) if cubierto_s > 0 else None


async def publicar(productor, topic: str, secuencia: list[MensajeReplay], run_id: str, velocidad: float | None, intervalo_s: float,
                   *, ahora=ahora_ms, dormir=asyncio.sleep) -> int:
    """Publica la secuencia en orden, un mensaje cada `intervalo_s`, confirmando cada envío con Kafka. Devuelve cuántos publicó."""
    for k, m in enumerate(secuencia):
        clave, valor = serializar(a_mensaje_kafka(m, run_id, velocidad, ahora()))
        await productor.send_and_wait(topic, value=valor, key=clave)
        if k < len(secuencia) - 1:
            await dormir(intervalo_s)
    return len(secuencia)


def registrar_ejecucion(conexion, run_id: str, dia: date | None, features: list[dict], secuencia: list[MensajeReplay], intervalo_s: float, velocidad: float | None) -> None:
    tiempos = [f["properties"]["time"] for f in features]
    parametros = {
        "run_id": run_id, "dia": dia, "tamano": len(features), "mensajes": len(secuencia),
        "criterio": "día UTC con más eventos del histórico (o el indicado); los N primeros por fecha e id; seis casos controlados con ids replay-ctl-",
        "desde": datetime.fromtimestamp(min(tiempos) / 1000, timezone.utc) if tiempos else None,
        "hasta": datetime.fromtimestamp(max(tiempos) / 1000, timezone.utc) if tiempos else None,
        "intervalo_s": intervalo_s, "velocidad": velocidad,
    }
    if conexion.execute(SQL_REGISTRAR, parametros).rowcount != 1:
        raise SystemExit(f"la ejecución {run_id} ya existe con otra selección: usa otro --run (las ejecuciones no se sobrescriben ni se borran)")


def marcar_estado(conexion, run_id: str, estado: str) -> None:
    conexion.execute(SQL_ESTADO, {"run_id": run_id, "estado": estado})


async def ejecutar(args) -> dict:
    cfg = ConfigReplay.desde_entorno()
    n = args.eventos or cfg.eventos
    intervalo_s = args.intervalo if args.intervalo is not None else cfg.intervalo_s
    pg = ConfigPostgres.desde_entorno()
    with psycopg.connect(pg.conninfo(), autocommit=True) as conexion:
        if args.reanudar:
            fila = conexion.execute("SELECT dia, tamano FROM replay.ejecucion WHERE run_id = %s", (args.reanudar,)).fetchone()
            if fila is None:
                raise SystemExit(f"no existe la ejecución {args.reanudar}")
            run_id, dia, n = args.reanudar, fila[0], fila[1]  # la misma selección que la original
            marcar_estado(conexion, run_id, "interrumpida")
        else:
            run_id = args.run or nuevo_run_id()
            if not RUN_ID.fullmatch(run_id):
                raise SystemExit(f"--run solo admite letras, números, '.', '-' y '_' (hasta 64): {run_id!r}")
            dia = date.fromisoformat(args.dia) if args.dia else elegir_dia(conexion)
        if dia is None:
            raise SystemExit("el histórico no tiene eventos: no hay nada que reproducir (no se inventan datos)")
        features = seleccionar(conexion, dia, n)
        if not features:
            raise SystemExit(f"el día {dia} no tiene eventos en el histórico: no hay nada que reproducir")
        secuencia = construir_secuencia(features)
        velocidad = velocidad_prevista(features, len(secuencia), intervalo_s)
        resumen = {"run_id": run_id, "dia": dia.isoformat(), "eventos_reales": len(features), "mensajes": len(secuencia), "casos": sum(1 for m in secuencia if m.caso),
                   "intervalo_s": intervalo_s, "velocidad": velocidad, "topic": cfg.topic, "duracion_prevista_s": round((len(secuencia) - 1) * intervalo_s, 1)}
        if args.solo_plan:
            resumen["plan"] = [{"seq": m.seq, "id": m.evento["id"], "caso": m.caso, "time": m.evento["properties"]["time"], "updated": m.evento["properties"]["updated"]} for m in secuencia]
            return resumen
        registrar_ejecucion(conexion, run_id, dia, features, secuencia, intervalo_s, velocidad)
        productor = AIOKafkaProducer(bootstrap_servers=leer_obligatoria("KAFKA_BOOTSTRAP_SERVERS"))
        await productor.start()
        try:
            resumen["publicados"] = await publicar(productor, cfg.topic, secuencia, run_id, velocidad, intervalo_s)
        finally:
            await productor.stop()
        marcar_estado(conexion, run_id, "terminada")
        resumen["estado"] = "terminada"
        return resumen


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description="Replay histórico aislado por Kafka (F6). Bajo demanda; no escribe en live ni en historico.")
    parser.add_argument("--dia", help="día UTC de 2025 (AAAA-MM-DD); por defecto el que tiene más eventos")
    parser.add_argument("--run", help="identificador de la ejecución; por defecto, la hora UTC actual")
    parser.add_argument("--reanudar", metavar="RUN_ID", help="vuelve a publicar la selección completa de una ejecución interrumpida")
    parser.add_argument("--eventos", type=int, help="eventos reales de la selección (por defecto REPLAY_EVENTOS)")
    parser.add_argument("--intervalo", type=float, help="segundos entre mensajes (por defecto REPLAY_INTERVALO_S)")
    parser.add_argument("--solo-plan", action="store_true", help="solo muestra la secuencia prevista; no registra la ejecución ni publica nada")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    resumen = asyncio.run(ejecutar(args))
    json.dump(resumen, sys.stdout, ensure_ascii=False, indent=2)
    print()


if __name__ == "__main__":
    main()
