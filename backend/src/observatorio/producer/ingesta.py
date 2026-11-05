"""Un ciclo de ingesta: consultar USGS, registrar, conservar el original y (si procede) publicar en Kafka."""

import gzip
import hashlib
import json
import logging
from dataclasses import dataclass

from observatorio.config import SOURCE_ADMITIDO, ConfigIngesta
from observatorio.modos import MODO_LIVE
from observatorio.producer import usgs
from observatorio.producer.usgs import ErrorUsgs
from observatorio.tiempo import ahora_ms

log = logging.getLogger("producer.ingesta")


@dataclass(frozen=True)
class ResultadoCiclo:
    resultado: str  # "ok" | "error"
    eventos: int | None = None
    publicadas: int = 0
    omitidas: int | None = None
    error: str | None = None


def _canonico(valor) -> bytes:
    return json.dumps(valor, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def hash_features(features: list) -> str:
    """Huella del contenido de `features` (ignora los metadatos de la respuesta, que cambian cada minuto)."""
    return hashlib.sha256(_canonico(features)).hexdigest()


def _clave_version(feature) -> tuple[str, int]:
    """(event_id, updated_ms) para decidir si publicar. Un evento sin `id` o sin `updated` válido también se publica
    (una sola vez por contenido) para que el consumidor lo ponga en cuarentena con motivo en vez de perderlo."""
    propiedades = feature.get("properties") if isinstance(feature, dict) else None
    id_ = feature.get("id") if isinstance(feature, dict) else None
    updated = propiedades.get("updated") if isinstance(propiedades, dict) else None
    if not isinstance(id_, str) or not id_:
        id_ = "sin-id-" + hashlib.sha256(_canonico(feature)).hexdigest()[:12]
    if isinstance(updated, bool) or not isinstance(updated, int):
        updated = 0
    return id_, updated


async def _publicar(repo, publicador, features, ingested_at: int) -> tuple[int, int]:
    claves = [(_clave_version(f), f) for f in features]
    maximos = await repo.maximos_publicados(sorted({clave[0] for clave, _ in claves}))
    publicadas = omitidas = 0
    try:
        for (event_id, updated_ms), feature in claves:
            if event_id in maximos and updated_ms <= maximos[event_id]:  # misma versión o anterior (FAQ 10)
                omitidas += 1
                continue
            mensaje = {"source": SOURCE_ADMITIDO, "ingested_at": ingested_at, "mode": MODO_LIVE, "event": feature}
            particion, offset = await publicador(event_id.encode("utf-8"), json.dumps(mensaje, ensure_ascii=False).encode("utf-8"))
            await repo.marcar_publicada(event_id, updated_ms, particion, offset)  # solo tras la confirmación
            maximos[event_id] = updated_ms
            publicadas += 1
    except Exception as exc:  # Kafka caído, etc.: lo no confirmado no se marca y se reenviará en el ciclo siguiente
        log.error("Fallo al publicar (%s); %s versiones publicadas antes del fallo", exc, publicadas)
        await repo.registrar_error_publicacion(f"publicación: {exc}")
    return publicadas, omitidas


async def ejecutar_ciclo(repo, config: ConfigIngesta, publicador, consultar=usgs.consultar, ahora=ahora_ms) -> ResultadoCiclo:
    iniciada = ahora()
    try:
        resp = await consultar(config.usgs_url, config.timeout_s, config.max_reintentos)
    except ErrorUsgs as error:
        await repo.registrar_error(iniciada, error)
        log.warning("Consulta fallida tras %s intento(s): %s", error.intentos, error)
        return ResultadoCiclo("error", error=str(error))

    features = resp.datos["features"]
    huella = hash_features(features)
    cambiado = huella != await repo.ultimo_hash()
    contenido_gz = gzip.compress(resp.cuerpo) if cambiado else None
    consulta_id = await repo.registrar_ok(iniciada, resp, len(features), huella, contenido_gz)

    if config.publicar and publicador is not None:
        publicadas, omitidas = await _publicar(repo, publicador, features, iniciada + resp.duracion_ms)
        await repo.actualizar_conteos(consulta_id, publicadas, omitidas)
    else:
        publicadas, omitidas = 0, None
    log.info("Consulta ok: %s eventos, %s bytes, %s ms, %s intento(s)%s; publicadas=%s", len(features), resp.bytes,
             resp.duracion_ms, resp.intentos, ", copia guardada" if cambiado else "",
             publicadas if config.publicar else "0 (modo seco)")
    return ResultadoCiclo("ok", eventos=len(features), publicadas=publicadas, omitidas=omitidas)
