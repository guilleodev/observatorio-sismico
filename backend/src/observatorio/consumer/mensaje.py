"""Validación del mensaje de Kafka (contracts/mensaje-kafka.md). Un mensaje inválido se descarta con motivo."""

import json
from dataclasses import dataclass

from observatorio.sintetico import MODO_MVP, PREFIJO_ID


class MensajeInvalido(Exception):
    """El mensaje no cumple el contrato; el argumento es el motivo del descarte."""


@dataclass(frozen=True)
class EventoRecibido:
    event_id: str
    event_time_ms: int
    updated_ms: int
    mag: float | None
    mag_type: str | None
    depth_km: float | None
    longitude: float
    latitude: float
    place: str | None
    source: str
    mode: str
    ingested_at_ms: int
    raw: dict


def _entero(valor, nombre: str) -> int:
    if isinstance(valor, bool) or not isinstance(valor, int):
        raise MensajeInvalido(f"{nombre} debe ser un entero (ms Unix UTC)")
    return valor


def _numero(valor, nombre: str, obligatorio: bool) -> float | None:
    if valor is None and not obligatorio:
        return None
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        raise MensajeInvalido(f"{nombre} debe ser numérico")
    return float(valor)


def interpretar_mensaje(valor: bytes) -> EventoRecibido:
    try:
        msg = json.loads(valor.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise MensajeInvalido("JSON inválido") from None
    if not isinstance(msg, dict) or not isinstance(msg.get("event"), dict):
        raise MensajeInvalido("falta el objeto 'event'")

    if msg.get("mode") != MODO_MVP:
        raise MensajeInvalido(f"mode no permitido: {msg.get('mode')!r}")
    evento = msg["event"]
    event_id = evento.get("id")
    if not isinstance(event_id, str) or not event_id.startswith(PREFIJO_ID):
        raise MensajeInvalido(f"id sin el prefijo {PREFIJO_ID!r}: {event_id!r}")

    coords = (evento.get("geometry") or {}).get("coordinates")
    if not isinstance(coords, list) or len(coords) < 2:
        raise MensajeInvalido("faltan las coordenadas [lon, lat, profundidad]")
    lon = _numero(coords[0], "longitud", True)
    lat = _numero(coords[1], "latitud", True)
    if not -180 <= lon <= 180 or not -90 <= lat <= 90:
        raise MensajeInvalido("coordenadas fuera de rango")
    profundidad = _numero(coords[2], "profundidad", False) if len(coords) > 2 else None

    props = evento.get("properties") or {}
    return EventoRecibido(
        event_id=event_id,
        event_time_ms=_entero(props.get("time"), "time"),
        updated_ms=_entero(props.get("updated"), "updated"),
        mag=_numero(props.get("mag"), "mag", False),
        mag_type=props.get("magType"),
        depth_km=profundidad,
        longitude=lon,
        latitude=lat,
        place=props.get("place"),
        source=str(msg.get("source", "")),
        mode=msg["mode"],
        ingested_at_ms=_entero(msg.get("ingested_at"), "ingested_at"),
        raw=evento,
    )
