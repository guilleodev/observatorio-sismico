"""Construcción del evento sintético y del mensaje de Kafka (contracts/mensaje-kafka.md)."""

import json
import time

# TEMPORAL: retirar o aislar como máximo al cerrar el paso 3.1 de la hoja de ruta (research R-001).
MODO_MVP = "synthetic"

SOURCE = "synthetic-generator"
PREFIJO_ID = "synthetic-"


def ahora_ms() -> int:
    return int(time.time() * 1000)


def construir_evento(secuencia: int = 1, minutos_atras: int = 10, ahora: int | None = None) -> dict:
    """Feature GeoJSON con la forma del feed de USGS. Determinista salvo por la hora de referencia."""
    if secuencia < 1:
        raise ValueError("secuencia debe ser >= 1")
    if minutos_atras < 0:
        raise ValueError("minutos_atras debe ser >= 0")
    instante = (ahora_ms() if ahora is None else ahora) - minutos_atras * 60_000
    return {
        "type": "Feature",
        "id": f"{PREFIJO_ID}mvp-{secuencia:03d}",
        "geometry": {"type": "Point", "coordinates": [-3.7, 40.4, 12]},  # [lon, lat, profundidad_km]
        "properties": {
            "type": "earthquake",
            "mag": 3.2,
            "magType": "ml",
            "place": "SINTÉTICO: ejemplo de prueba",
            "time": instante,
            "updated": instante,
        },
    }


def construir_mensaje(evento: dict, ahora: int | None = None) -> dict:
    return {
        "source": SOURCE,
        "ingested_at": ahora_ms() if ahora is None else ahora,
        "mode": MODO_MVP,
        "event": evento,
    }


def serializar(mensaje: dict) -> tuple[bytes, bytes]:
    """Devuelve (clave, valor): la clave es el id del evento y el valor, el JSON en UTF-8."""
    clave = mensaje["event"]["id"].encode("utf-8")
    valor = json.dumps(mensaje, ensure_ascii=False).encode("utf-8")
    return clave, valor
