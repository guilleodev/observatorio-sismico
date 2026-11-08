"""API de consulta (FastAPI): GET /api/eventos (con filtros y paginación, F5) y GET /api/salud."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg_pool import AsyncConnectionPool

from observatorio.api.filtros import PARAMETROS_FILTRO, PARAMETROS_MODO, ErrorParametro, Filtros, paginacion, validar_modo
from observatorio.api.repositorio import (BaseDatosNoDisponible, RepositorioApi, a_geojson,
                                          opciones_conexion)
from observatorio.config import ConfigApi, ConfigPostgres, leer_obligatoria
from observatorio.modos import MODO_LIVE, MODO_REPLAY
from observatorio.tiempo import ahora_ms

log = logging.getLogger("api")
PARAMETROS_EVENTOS = (*PARAMETROS_FILTRO, "limit", "offset", *PARAMETROS_MODO)
PARAMETROS_ESTADISTICAS = (*PARAMETROS_FILTRO, *PARAMETROS_MODO)
DESCRIPCION_MODE = "live (por defecto) o replay (reproducción histórica aislada, F6)."
DESCRIPCION_RUN = "Solo con mode=replay: run_id de la ejecución (por defecto, la más reciente)."


def comprobar_parametros(peticion: Request, admitidos: tuple[str, ...]) -> None:
    """Un parámetro desconocido o repetido es un error: un filtro mal escrito no puede ignorarse en silencio."""
    vistos: set[str] = set()
    for nombre, _ in peticion.query_params.multi_items():
        if nombre not in admitidos:
            raise ErrorParametro(f"parámetro desconocido: {nombre!r}; admitidos: {', '.join(admitidos)}")
        if nombre in vistos:
            raise ErrorParametro(f"parámetro repetido: {nombre!r}")
        vistos.add(nombre)


def crear_app(repositorio, origenes: list[str], reloj=ahora_ms, config: ConfigApi | None = None) -> FastAPI:
    config = config or ConfigApi.desde_entorno()

    @asynccontextmanager
    async def ciclo_de_vida(_app):
        await repositorio.abrir()
        yield
        await repositorio.cerrar()

    app = FastAPI(title="Observatorio sísmico", lifespan=ciclo_de_vida)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origenes,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["ngrok-skip-browser-warning"],
        allow_credentials=False,
    )

    async def resolver_modo(mode: str | None, run: str | None) -> tuple[str, dict | None]:
        """Valida `mode`/`run` y, en replay, localiza la ejecución (la más reciente por defecto). Un `run` inexistente es un 422."""
        modo, run_id = validar_modo(mode, run)
        if modo != MODO_REPLAY:
            return modo, None
        ejecucion = await repositorio.ejecucion(run_id)
        if ejecucion is None and run_id is not None:
            raise ErrorParametro(f"run desconocido: no existe la ejecución {run_id!r}")
        return modo, ejecucion  # None = todavía no hay ninguna reproducción: respuesta vacía, no un error

    def filtros_de(generado: int, modo: str, ejecucion: dict | None, start, end, min_mag, country_id) -> Filtros:
        intervalo = None
        if ejecucion is not None and ejecucion["intervalo"]["desde"] is not None and ejecucion["intervalo"]["hasta"] is not None:
            intervalo = (ejecucion["intervalo"]["desde"], ejecucion["intervalo"]["hasta"])
        return Filtros.desde_parametros(generado, start, end, min_mag, country_id, modo=modo,
                                        run_id=None if ejecucion is None else ejecucion["run_id"], intervalo=intervalo)

    @app.exception_handler(BaseDatosNoDisponible)
    async def base_no_disponible(_peticion, exc: BaseDatosNoDisponible):
        log.error("Base de datos no disponible: %s", exc)
        return JSONResponse(status_code=503, content={
            "error": "base_de_datos_no_disponible",
            "detail": "No se pudo consultar la base de datos; no se devuelven eventos.",
        })

    @app.exception_handler(ErrorParametro)
    async def parametro_invalido(_peticion, exc: ErrorParametro):
        return JSONResponse(status_code=422, content={"error": "parametro_invalido", "detail": str(exc)})

    @app.exception_handler(RequestValidationError)
    async def validacion(_peticion, exc: RequestValidationError):
        detalle = "; ".join(f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}" for e in exc.errors())
        return JSONResponse(status_code=422, content={"error": "parametro_invalido", "detail": detalle})

    @app.get("/api/eventos")
    async def eventos(
        peticion: Request,
        start: str | None = Query(None, description="Inicio inclusivo, ISO 8601 (sin zona = UTC). Por defecto end − 24 h."),
        end: str | None = Query(None, description="Fin exclusivo, ISO 8601 (sin zona = UTC). Por defecto el instante de la respuesta."),
        min_mag: str | None = Query(None, description="Magnitud mínima; la magnitud nula no la cumple y se cuenta en sin_magnitud."),
        country_id: str | None = Query(None, description="ADM0_A3 del catálogo o «sin_pais» (Sin país asignado)."),
        limit: str | None = Query(None, description="Eventos por página (1 a API_MAX_EVENTOS)."),
        offset: str | None = Query(None, description="Eventos que se saltan (>= 0)."),
        mode: str | None = Query(None, description=DESCRIPCION_MODE),
        run: str | None = Query(None, description=DESCRIPCION_RUN),
    ):
        comprobar_parametros(peticion, PARAMETROS_EVENTOS)
        generado = reloj()
        modo, ejecucion = await resolver_modo(mode, run)
        filtros = filtros_de(generado, modo, ejecucion, start, end, min_mag, country_id)
        tamano, desplazamiento = paginacion(limit, offset, config.max_eventos)
        pagina = await repositorio.pagina_eventos(filtros, tamano, desplazamiento)
        if modo == MODO_LIVE:  # sin mode (o con mode=live) la respuesta es exactamente la de F5
            return a_geojson(pagina.eventos, generado, pagina.last_ingestion, total=pagina.total, limit=tamano, offset=desplazamiento,
                             sin_magnitud=pagina.sin_magnitud, period=filtros.periodo, live_since=pagina.live_since)
        return a_geojson(pagina.eventos, generado, pagina.last_ingestion, modo, total=pagina.total, limit=tamano, offset=desplazamiento,
                         sin_magnitud=pagina.sin_magnitud, period=filtros.periodo, replay=ejecucion)

    @app.get("/api/estadisticas")
    async def estadisticas(
        peticion: Request,
        start: str | None = Query(None, description="Inicio inclusivo, ISO 8601 (sin zona = UTC). Por defecto end − 24 h."),
        end: str | None = Query(None, description="Fin exclusivo, ISO 8601 (sin zona = UTC). Por defecto el instante de la respuesta."),
        min_mag: str | None = Query(None, description="Magnitud mínima (mismos filtros que /api/eventos)."),
        country_id: str | None = Query(None, description="ADM0_A3 del catálogo o «sin_pais» (Sin país asignado)."),
        mode: str | None = Query(None, description=DESCRIPCION_MODE),
        run: str | None = Query(None, description=DESCRIPCION_RUN),
    ):
        comprobar_parametros(peticion, PARAMETROS_ESTADISTICAS)
        generado = reloj()
        modo, ejecucion = await resolver_modo(mode, run)
        filtros = filtros_de(generado, modo, ejecucion, start, end, min_mag, country_id)
        bloques = await repositorio.estadisticas(filtros, generado, config.max_ventana_horas, config.margen_publicacion_s)
        respuesta = {"generated": generado, "period": filtros.periodo,
                     "filters": {"min_mag": None if filtros.min_mag is None else float(filtros.min_mag), "country_id": filtros.country_id},
                     **bloques}
        if modo == MODO_REPLAY:
            respuesta |= {"mode": modo, "replay": ejecucion}
        return respuesta

    @app.get("/api/salud")
    async def salud(peticion: Request, mode: str | None = Query(None, description=DESCRIPCION_MODE),
                    run: str | None = Query(None, description=DESCRIPCION_RUN)):
        for nombre in PARAMETROS_MODO:  # /api/salud ignora lo desconocido (como en F5), pero mode y run se validan como en los demás
            if len(peticion.query_params.getlist(nombre)) > 1:
                raise ErrorParametro(f"parámetro repetido: {nombre!r}")
        generado = reloj()  # la edad y «stale» se calculan con el reloj de la API, no con el del navegador
        modo, ejecucion = await resolver_modo(mode, run)
        estado = await repositorio.estado_salud()  # falla con 503 si la base no responde
        edad = None if estado.last_ingestion is None else max(0, (generado - estado.last_ingestion) // 1000)
        respuesta = {
            "status": "ok", "database": "ok", "last_ingestion": estado.last_ingestion,
            "generated": generado, "ingestion_age_s": edad,
            "stale": edad is None or edad > config.obsoleta_s,  # sin ninguna ingesta correcta también es «desactualizado»
            "stale_after_s": config.obsoleta_s, "gaps_pending": estado.gaps_pending, "live_since": estado.live_since,
        }
        if modo == MODO_REPLAY:  # `last_ingestion` sigue siendo la ingesta EN VIVO; la reproducción va aparte
            respuesta["replay"] = ejecucion
        return respuesta

    return app


def crear_repositorio(conninfo: str, config: ConfigApi) -> RepositorioApi:
    """Repositorio con su pool. open=False: la API arranca aunque PostgreSQL no esté listo; las consultas darán 503 hasta que lo esté.

    Sesión de solo lectura con instantánea consistente por petición y tiempo máximo por consulta (opciones_conexion).
    """
    pool = AsyncConnectionPool(conninfo, kwargs={"options": opciones_conexion(config.statement_timeout_s)},
                               min_size=1, max_size=4, open=False, timeout=3)

    async def abrir():
        await pool.open()

    return RepositorioApi(pool.connection, abrir=abrir, cerrar=pool.close)


def crear_app_desde_entorno() -> FastAPI:
    config = ConfigApi.desde_entorno()
    origenes = [o.strip() for o in leer_obligatoria("API_CORS_ORIGINS").split(",") if o.strip()]
    return crear_app(crear_repositorio(ConfigPostgres.desde_entorno().conninfo(), config), origenes, config=config)
