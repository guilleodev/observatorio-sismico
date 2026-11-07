"""Clasificación de los mensajes de Kafka (ENUNCIADO.md §4.1, §5.4 y §6; research R-005).

Cada mensaje es:
- **valido**: terremoto íntegro -> historial y estado actual;
- **excluido**: evento que no es un terremoto (`type != earthquake`) -> cuarentena con el motivo de exclusión;
- **invalido**: registro que no se puede tratar -> cuarentena con motivo y referencia al original;
- **descartado**: fuera del contrato de este consumidor (`mode` o `source` no admitidos); no son datos de USGS live.
"""

import json
import math
from dataclasses import dataclass

from observatorio.config import SOURCES_ADMITIDOS
from observatorio.modos import MODO_REPLAY, MODOS_CONTRACTUALES

TIPO_TERREMOTO = "earthquake"


class MensajeInvalido(Exception):
    """El mensaje no cumple las reglas de validez; el argumento es el motivo."""


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


@dataclass(frozen=True)
class Clasificacion:
    estado: str  # "valido" | "excluido" | "invalido" | "descartado"
    evento: EventoRecibido | None = None  # solo si es válido
    motivo: str | None = None
    event_id: str | None = None  # si se pudo leer (referencia para la cuarentena y la retirada)
    updated_ms: int | None = None
    base_huella: bytes = b""  # identidad de la versión para la huella de cuarentena (R-007)


@dataclass(frozen=True)
class FeatureValido:
    """Campos de un terremoto de USGS ya validados (compartidos por el tiempo real y el histórico)."""

    event_id: str
    event_time_ms: int
    updated_ms: int
    mag: float | None
    mag_type: str | None
    depth_km: float | None
    longitude: float
    latitude: float
    place: str | None


@dataclass(frozen=True)
class ClasificacionFeature:
    estado: str  # "valido" | "excluido" | "invalido"
    feature: FeatureValido | None = None  # solo si es válido
    motivo: str | None = None
    event_id: str | None = None
    updated_ms: int | None = None
    base_huella: bytes = b""


def _canonico(valor) -> bytes:
    return json.dumps(valor, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


# Cota de los instantes en ms Unix: hasta el año 9999. Más allá, `to_timestamp` de PostgreSQL falla (error permanente).
MAX_MS = 253_402_300_799_999


def _entero(valor, nombre: str) -> int:
    if isinstance(valor, bool) or not isinstance(valor, int):
        raise MensajeInvalido(f"{nombre} debe ser un entero (ms Unix UTC)")
    if not -MAX_MS <= valor <= MAX_MS:
        raise MensajeInvalido(f"{nombre} fuera del rango de fechas admitido")
    return valor


def _texto_almacenable(valor) -> bool:
    """False si el JSON del evento tiene un NUL (\\u0000, que text y jsonb rechazan) o un sustituto Unicode suelto."""
    if isinstance(valor, str):
        try:
            valor.encode("utf-8")  # un sustituto suelto no se puede codificar
        except UnicodeEncodeError:
            return False
        return "\x00" not in valor
    if isinstance(valor, dict):
        return all(_texto_almacenable(k) and _texto_almacenable(v) for k, v in valor.items())
    if isinstance(valor, list):
        return all(_texto_almacenable(v) for v in valor)
    return True


def _numero(valor, nombre: str, obligatorio: bool) -> float | None:
    if valor is None and not obligatorio:
        return None
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        raise MensajeInvalido(f"{nombre} debe ser numérica" + ("" if obligatorio else " o nula"))
    if not math.isfinite(valor):
        raise MensajeInvalido(f"{nombre} no finita")
    return float(valor)


def _texto(valor, nombre: str) -> str | None:
    if valor is not None and not isinstance(valor, str):
        raise MensajeInvalido(f"{nombre} debe ser texto o nulo")
    return valor


def _validar_feature(evento: dict, propiedades: dict, event_id: str) -> FeatureValido:
    if not _texto_almacenable(evento):
        raise MensajeInvalido("el evento contiene caracteres que la base no puede almacenar (NUL o sustituto Unicode suelto)")
    geometria = evento.get("geometry")
    if not isinstance(geometria, dict) or geometria.get("type") != "Point":
        raise MensajeInvalido("la geometría falta o no es un Point")
    coordenadas = geometria.get("coordinates")
    if not isinstance(coordenadas, list) or len(coordenadas) != 3:
        raise MensajeInvalido("las coordenadas deben ser [longitud, latitud, profundidad]: tres valores")
    longitud = _numero(coordenadas[0], "longitud", True)
    latitud = _numero(coordenadas[1], "latitud", True)
    if not -180 <= longitud <= 180 or not -90 <= latitud <= 90:
        raise MensajeInvalido("coordenadas fuera de rango")
    return FeatureValido(
        event_id=event_id,
        event_time_ms=_entero(propiedades.get("time"), "time"),
        updated_ms=_entero(propiedades.get("updated"), "updated"),
        mag=_numero(propiedades.get("mag"), "mag", False),
        mag_type=_texto(propiedades.get("magType"), "magType"),
        depth_km=_numero(coordenadas[2], "profundidad", False),
        longitude=longitud,
        latitude=latitud,
        place=_texto(propiedades.get("place"), "place"),
    )


def clasificar_feature(evento: dict) -> ClasificacionFeature:
    """Clasifica un *Feature* de USGS (objeto GeoJSON): válido, excluido (no sísmico) o inválido. Lo reutiliza el histórico (F4)."""
    event_id = evento.get("id")
    if not isinstance(event_id, str) or not event_id:
        return ClasificacionFeature("invalido", motivo=f"id de evento ausente o no textual: {event_id!r}", base_huella=_canonico(evento))

    propiedades = evento.get("properties")
    updated = propiedades.get("updated") if isinstance(propiedades, dict) else None
    updated_ms = updated if isinstance(updated, int) and not isinstance(updated, bool) and abs(updated) <= MAX_MS else None
    base = f"{event_id}|{updated_ms}".encode() if updated_ms is not None else _canonico(evento)
    referencias = {"event_id": event_id, "updated_ms": updated_ms, "base_huella": base}

    if not isinstance(propiedades, dict):
        return ClasificacionFeature("invalido", motivo="las propiedades del evento faltan", **referencias)
    tipo = propiedades.get("type")
    if tipo is None:
        return ClasificacionFeature("invalido", motivo="el tipo de evento (properties.type) falta", **referencias)
    if tipo != TIPO_TERREMOTO:  # se mira antes que el resto: a un no sísmico no le exigimos coordenadas válidas
        return ClasificacionFeature("excluido", motivo=f"tipo de evento no sísmico: {tipo!r}", **referencias)
    try:
        return ClasificacionFeature("valido", feature=_validar_feature(evento, propiedades, event_id), **referencias)
    except MensajeInvalido as exc:
        return ClasificacionFeature("invalido", motivo=str(exc), **referencias)


def clasificar_mensaje(valor: bytes | None) -> Clasificacion:
    contenido = valor or b""
    try:
        msg = json.loads(contenido.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return Clasificacion("invalido", motivo="JSON ilegible", base_huella=contenido)
    if not isinstance(msg, dict):
        return Clasificacion("invalido", motivo="el mensaje no es un objeto JSON", base_huella=contenido)

    modo = msg.get("mode")
    if modo not in MODOS_CONTRACTUALES:
        return Clasificacion("descartado", motivo=f"mode no contractual (solo {', '.join(MODOS_CONTRACTUALES)}): {modo!r}")
    if modo == MODO_REPLAY:  # la reproducción (F6) usa su propio topic y esquema; no se mezcla con live
        return Clasificacion("descartado", motivo="mode replay: este consumidor solo procesa live")
    if msg.get("source") not in SOURCES_ADMITIDOS:
        return Clasificacion("descartado", motivo=f"source no admitido: {msg.get('source')!r} (solo {', '.join(SOURCES_ADMITIDOS)})")

    evento = msg.get("event")
    if not isinstance(evento, dict):
        return Clasificacion("invalido", motivo="falta el objeto 'event'", base_huella=contenido)
    cf = clasificar_feature(evento)
    referencias = {"event_id": cf.event_id, "updated_ms": cf.updated_ms, "base_huella": cf.base_huella}
    if cf.estado != "valido":
        return Clasificacion(cf.estado, motivo=cf.motivo, **referencias)
    try:  # el instante de ingesta es del mensaje, no del Feature: se valida después de él, como antes del refactor
        ingested = _entero(msg.get("ingested_at"), "ingested_at")
    except MensajeInvalido as exc:
        return Clasificacion("invalido", motivo=str(exc), **referencias)
    f = cf.feature
    recibido = EventoRecibido(
        event_id=f.event_id, event_time_ms=f.event_time_ms, updated_ms=f.updated_ms, mag=f.mag, mag_type=f.mag_type,
        depth_km=f.depth_km, longitude=f.longitude, latitude=f.latitude, place=f.place,
        source=msg["source"], mode=msg["mode"], ingested_at_ms=ingested, raw=evento)
    return Clasificacion("valido", evento=recibido, **referencias)


def interpretar_mensaje(valor: bytes) -> EventoRecibido:
    """Devuelve el evento si el mensaje es un terremoto válido; en cualquier otro caso lanza MensajeInvalido con el motivo."""
    clasificacion = clasificar_mensaje(valor)
    if clasificacion.estado != "valido":
        raise MensajeInvalido(clasificacion.motivo)
    return clasificacion.evento
