"""Un ciclo de ingesta de EMSC (F8) y el bucle que lo repite. Aislado de la ingesta de USGS: errores, estado y marca propios.

Consulta INCREMENTAL: cada ciclo pide solo lo creado o revisado desde la última consulta COMPLETA (`updatedafter`, con un solape de seguridad); la primera vez, las
últimas horas. La marca solo avanza si TODAS las versiones nuevas se publicaron: si Kafka falla a mitad, el ciclo siguiente repite la ventana (lo ya publicado se
omite por `live.version_publicada`). Tras una parada, la misma consulta recupera lo actualizado durante ella (hasta `ventana_max_dias`).
"""

import asyncio
import logging
import time
from datetime import datetime, timezone

import psycopg

from observatorio.config import SOURCE_EMSC, ConfigEmsc
from observatorio.producer import emsc
from observatorio.producer.emsc import ErrorEmsc
from observatorio.producer.ingesta import ResultadoCiclo, _clave_version, mensaje_kafka
from observatorio.producer.repositorio_emsc import RepositorioEmsc
from observatorio.tiempo import ahora_ms

log = logging.getLogger("producer.emsc")


def _instante(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


async def _publicar(repo: RepositorioEmsc, publicador, features: list[dict], ingested_at: int) -> tuple[int, int, bool]:
    """(publicadas, omitidas, completo). `completo=False` si algo falló: la marca no avanza."""
    claves = [(_clave_version(f), f) for f in features]
    maximos = await repo.maximos_publicados(sorted({clave[0] for clave, _ in claves}))
    publicadas = omitidas = 0
    try:
        for (event_id, updated_ms), feature in claves:
            if event_id in maximos and updated_ms <= maximos[event_id]:  # misma versión o anterior
                omitidas += 1
                continue
            mensaje = mensaje_kafka(feature, ingested_at, SOURCE_EMSC)
            particion, offset = await publicador(event_id.encode("utf-8"), emsc.a_json(mensaje))
            await repo.marcar_publicada(event_id, updated_ms, particion, offset)  # solo tras la confirmación
            maximos[event_id] = updated_ms
            publicadas += 1
    except Exception as exc:  # Kafka caído, etc.: lo no confirmado no se marca y se reenviará en el ciclo siguiente
        log.error("Fallo al publicar (%s); %s versiones publicadas antes del fallo", exc, publicadas)
        await repo.registrar_error_publicacion(f"publicación: {exc}")
        return publicadas, omitidas, False
    return publicadas, omitidas, True


async def ejecutar_ciclo_emsc(repo: RepositorioEmsc, config: ConfigEmsc, publicador, consultar=emsc.consultar, ahora=ahora_ms) -> ResultadoCiclo:
    iniciada = ahora()
    marca = await repo.marca()
    url, ventana = emsc.construir_url(
        config.url, mag_min=config.mag_min, limite=config.limite,
        **emsc.ventana_consulta(marca, _instante(iniciada), ventana_inicial_h=config.ventana_inicial_h,
                                ventana_max_dias=config.ventana_max_dias, margen_s=config.margen_s))
    try:
        resp = await consultar(url, config.timeout_s, config.max_reintentos)
    except ErrorEmsc as error:
        await repo.registrar_error(iniciada, error, ventana)
        log.warning("Consulta a EMSC fallida tras %s intento(s): %s", error.intentos, error)
        return ResultadoCiclo("error", error=str(error))

    features = emsc.features_adaptadas(resp)
    publicadas, omitidas, completo = await _publicar(repo, publicador, features, iniciada + resp.duracion_ms)
    # La marca es el INICIO de esta consulta (no el último `lastupdate`): lo actualizado mientras se consultaba entra en la siguiente (con el solape de seguridad).
    consulta_id = await repo.registrar_ok(iniciada, resp, len(features), ventana, _instante(iniciada) if completo else None)
    await repo.actualizar_conteos(consulta_id, publicadas, omitidas)
    log.info("EMSC ok (%s): %s eventos, %s bytes, %s ms; publicadas=%s omitidas=%s%s", ventana, len(features), resp.bytes, resp.duracion_ms,
             publicadas, omitidas, "" if completo else " (publicación incompleta: la marca no avanza)")
    return ResultadoCiclo("ok", eventos=len(features), publicadas=publicadas, omitidas=omitidas)


async def bucle_emsc(conectar, config: ConfigEmsc, retencion_consultas_dias: int, publicador, *, dormir=asyncio.sleep) -> None:
    """Repite el ciclo cada `intervalo_s` (entre INICIOS, sin solapar). Nunca propaga un fallo: EMSC no puede detener la ingesta de USGS."""
    conexion = await conectar()
    ciclos = 0
    try:
        while True:
            inicio = time.monotonic()
            try:
                await ejecutar_ciclo_emsc(RepositorioEmsc(conexion), config, publicador)
                ciclos += 1
                if ciclos % 60 == 0:  # una vez por hora aproximadamente
                    borradas = await RepositorioEmsc(conexion).purgar(retencion_consultas_dias)
                    if borradas:
                        log.info("Retención: %s consultas antiguas de EMSC purgadas", borradas)
            except asyncio.CancelledError:
                raise
            except psycopg.Error as exc:  # sin PostgreSQL no se publica a ciegas
                log.error("PostgreSQL falló en EMSC (%s); se reconecta", exc)
                try:
                    await conexion.close()
                except Exception:  # noqa: BLE001 - la conexión ya estaba rota
                    pass
                conexion = await conectar()
            except Exception:  # noqa: BLE001 - EMSC jamás debe tumbar el servicio
                log.exception("Fallo inesperado en el ciclo de EMSC; se reintenta en el siguiente")
            await dormir(max(0.0, config.intervalo_s - (time.monotonic() - inicio)))
    finally:
        await conexion.close()
