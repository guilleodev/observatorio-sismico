"""Mensajes de Kafka de PRUEBA para los tests (no se usan en el camino de producción).

Tienen la forma del feed de USGS. Los ids empiezan por `prueba-`. El modo por defecto es `live`;
los tests lo cambian para comprobar los rechazos. Nunca se insertan en las tablas definitivas:
las pruebas con PostgreSQL se ejecutan en una transacción que se revierte.
"""

import json

from observatorio.tiempo import ahora_ms

SOURCE = "fixture-pruebas"
PREFIJO_ID = "prueba-"


def construir_evento(secuencia: int = 1, minutos_atras: int = 10, ahora: int | None = None) -> dict:
    if secuencia < 1:
        raise ValueError("secuencia debe ser >= 1")
    if minutos_atras < 0:
        raise ValueError("minutos_atras debe ser >= 0")
    instante = (ahora_ms() if ahora is None else ahora) - minutos_atras * 60_000
    return {
        "type": "Feature",
        "id": f"{PREFIJO_ID}{secuencia:03d}",
        "geometry": {"type": "Point", "coordinates": [-3.7, 40.4, 12]},  # [lon, lat, profundidad_km]
        "properties": {
            "type": "earthquake", "mag": 3.2, "magType": "ml", "place": "Lugar de prueba",
            "time": instante, "updated": instante,
        },
    }


def construir_mensaje(evento: dict, ahora: int | None = None, modo: str = "live") -> dict:
    return {"source": SOURCE, "ingested_at": ahora_ms() if ahora is None else ahora, "mode": modo, "event": evento}


def serializar(mensaje: dict) -> tuple[bytes, bytes]:
    """(clave, valor): la clave es el id del evento y el valor, el JSON en UTF-8."""
    return mensaje["event"]["id"].encode("utf-8"), json.dumps(mensaje, ensure_ascii=False).encode("utf-8")
