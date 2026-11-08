"""Secuencia de mensajes del replay: los eventos reales de la selección MÁS seis casos controlados (F6, research R-004; DG10).

Los casos son datos de demostración etiquetados que exige `ENUNCIADO.md` §11 (duplicado, revisión, versión antigua, magnitud nula, coordenadas inválidas
y evento marítimo). Cada uno tiene un id PROPIO `replay-ctl-<caso>`, copiado de un evento real que NO se altera, y solo puede existir en el esquema `replay`
(constitución v1.0.4). Todo es determinista: la misma selección da siempre la misma secuencia. Este módulo es puro: no lee ni escribe nada.
"""

import json
from copy import deepcopy
from dataclasses import dataclass

from observatorio.consumer.destino import SOURCE_REPLAY
from observatorio.modos import MODO_REPLAY

CASOS = ("duplicado", "revision", "antigua", "magnitud_nula", "coordenadas_invalidas", "maritimo")
PREFIJO_CASO = "replay-ctl-"
PUNTO_MARITIMO = (-140.0, 0.0)  # mitad del Pacífico: ningún polígono del catálogo lo cubre (una prueba lo comprueba con el catálogo real)
SUBIDA_REVISION_MS = 60_000  # la revisión llega un minuto «más reciente» que la primera versión
RETRASO_ANTIGUA_MS = 3_600_000  # la versión antigua es una hora anterior a la vigente
LATITUD_INVALIDA = 123


class SeleccionInsuficiente(ValueError):
    """La selección no tiene eventos con magnitud suficientes para servir de base a los seis casos."""


@dataclass(frozen=True)
class MensajeReplay:
    seq: int  # orden de publicación dentro de la ejecución
    caso: str | None  # nulo en un evento real
    evento: dict  # el Feature de USGS (copia: la entrada no se modifica)
    base: str | None  # id del evento real del que se copió el caso


def _copia_del_caso(base: dict, caso: str) -> dict:
    evento = deepcopy(base)
    evento["id"] = f"{PREFIJO_CASO}{caso}"
    evento["properties"]["place"] = f"Caso controlado: {caso} (copiado de {base['id']})"
    return evento


def _con_magnitud(evento: dict, delta: float) -> dict:
    copia = deepcopy(evento)
    copia["properties"]["mag"] = round(copia["properties"]["mag"] + delta, 1)
    return copia


def _eventos_del_caso(caso: str, base: dict) -> list[dict]:
    """Los mensajes (en orden de envío) que componen un caso."""
    primero = _copia_del_caso(base, caso)
    if caso == "duplicado":
        return [primero, deepcopy(primero)]  # el mismo mensaje dos veces
    if caso == "revision":
        v2 = _con_magnitud(primero, 0.1)
        v2["properties"]["updated"] = primero["properties"]["updated"] + SUBIDA_REVISION_MS
        return [primero, v2]
    if caso == "antigua":  # primero llega la versión vigente y DESPUÉS una anterior, que no debe sustituirla
        vieja = _con_magnitud(primero, -0.1)
        vieja["properties"]["updated"] = primero["properties"]["updated"] - RETRASO_ANTIGUA_MS
        return [primero, vieja]
    if caso == "magnitud_nula":
        primero["properties"]["mag"] = None
        return [primero]
    if caso == "coordenadas_invalidas":
        primero["geometry"]["coordinates"][1] = LATITUD_INVALIDA
        return [primero]
    if caso == "maritimo":
        primero["geometry"]["coordinates"][0], primero["geometry"]["coordinates"][1] = PUNTO_MARITIMO
        return [primero]
    raise ValueError(f"caso desconocido: {caso!r}")


def construir_secuencia(features: list[dict]) -> list[MensajeReplay]:
    """Eventos reales (idénticos y en su orden) con los casos intercalados justo después de su evento base.

    La base de los seis casos son los seis primeros eventos con magnitud no nula, en el orden de `CASOS`. Sin eventos devuelve una lista vacía (no se inventa nada);
    con eventos pero sin seis con magnitud lanza `SeleccionInsuficiente`.
    """
    if not features:
        return []
    con_magnitud = [f for f in features if f["properties"].get("mag") is not None]
    if len(con_magnitud) < len(CASOS):
        raise SeleccionInsuficiente(f"hacen falta {len(CASOS)} eventos con magnitud para los casos controlados y la selección solo tiene {len(con_magnitud)}")
    caso_de = {base["id"]: caso for caso, base in zip(CASOS, con_magnitud)}
    secuencia: list[MensajeReplay] = []
    for f in features:
        secuencia.append(MensajeReplay(len(secuencia), None, deepcopy(f), None))
        caso = caso_de.get(f["id"])
        if caso is not None:
            for evento in _eventos_del_caso(caso, f):
                secuencia.append(MensajeReplay(len(secuencia), caso, evento, f["id"]))
    return secuencia


def a_mensaje_kafka(m: MensajeReplay, run_id: str, velocidad: float | None, ingested_at_ms: int) -> dict:
    """Mensaje de Kafka (contracts/f6.md): `ingested_at` es el instante de REPRODUCCIÓN; el tiempo del evento va intacto dentro de `event`."""
    return {"source": SOURCE_REPLAY, "mode": MODO_REPLAY, "ingested_at": ingested_at_ms, "event": m.evento,
            "replay": {"run_id": run_id, "seq": m.seq, "caso": m.caso, "velocidad": velocidad}}


def serializar(mensaje: dict) -> tuple[bytes, bytes]:
    """(clave, valor): la clave es el id del evento, como en el flujo en vivo."""
    return mensaje["event"]["id"].encode("utf-8"), json.dumps(mensaje, ensure_ascii=False).encode("utf-8")
