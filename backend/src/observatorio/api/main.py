"""API de consulta (FastAPI): GET /api/eventos (con filtros y paginación, F5) y GET /api/salud."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg_pool import AsyncConnectionPool

from observatorio.api.filtros import PARAMETROS_FILTRO, ErrorParametro, Filtros, paginacion
from observatorio.api.repositorio import (BaseDatosNoDisponible, RepositorioApi, a_geojson,
                                          opciones_conexion)
from observatorio.config import ConfigApi, ConfigPostgres, leer_obligatoria
from observatorio.tiempo import ahora_ms

log = logging.getLogger("api")
PARAMETROS_EVENTOS = (*PARAMETROS_FILTRO, "limit", "offset")


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
    ):
        comprobar_parametros(peticion, PARAMETROS_EVENTOS)
        generado = reloj()
        filtros = Filtros.desde_parametros(generado, start, end, min_mag, country_id)
        tamano, desplazamiento = paginacion(limit, offset, config.max_eventos)
        pagina = await repositorio.pagina_eventos(filtros, tamano, desplazamiento)
        return a_geojson(pagina.eventos, generado, pagina.last_ingestion, total=pagina.total, limit=tamano, offset=desplazamiento,
                         sin_magnitud=pagina.sin_magnitud, period=filtros.periodo, live_since=pagina.live_since)

    @app.get("/api/estadisticas")
    async def estadisticas(
        peticion: Request,
        start: str | None = Query(None, description="Inicio inclusivo, ISO 8601 (sin zona = UTC). Por defecto end − 24 h."),
        end: str | None = Query(None, description="Fin exclusivo, ISO 8601 (sin zona = UTC). Por defecto el instante de la respuesta."),
        min_mag: str | None = Query(None, description="Magnitud mínima (mismos filtros que /api/eventos)."),
        country_id: str | None = Query(None, description="ADM0_A3 del catálogo o «sin_pais» (Sin país asignado)."),
    ):
        comprobar_parametros(peticion, PARAMETROS_FILTRO)
        generado = reloj()
        filtros = Filtros.desde_parametros(generado, start, end, min_mag, country_id)
        bloques = await repositorio.estadisticas(filtros, generado, config.max_ventana_horas, config.margen_publicacion_s)
        return {"generated": generado, "period": filtros.periodo,
                "filters": {"min_mag": None if filtros.min_mag is None else float(filtros.min_mag), "country_id": filtros.country_id},
                **bloques}

    @app.get("/api/salud")
    async def salud():
        generado = reloj()  # la edad y «stale» se calculan con el reloj de la API, no con el del navegador
        estado = await repositorio.estado_salud()  # falla con 503 si la base no responde
        edad = None if estado.last_ingestion is None else max(0, (generado - estado.last_ingestion) // 1000)
        return {
            "status": "ok", "database": "ok", "last_ingestion": estado.last_ingestion,
            "generated": generado, "ingestion_age_s": edad,
            "stale": edad is None or edad > config.obsoleta_s,  # sin ninguna ingesta correcta también es «desactualizado»
            "stale_after_s": config.obsoleta_s, "gaps_pending": estado.gaps_pending, "live_since": estado.live_since,
        }

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
