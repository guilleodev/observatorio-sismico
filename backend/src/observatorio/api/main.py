"""API de consulta (FastAPI): GET /api/eventos y GET /api/salud."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg_pool import AsyncConnectionPool

from observatorio.api.repositorio import BaseDatosNoDisponible, RepositorioApi, a_geojson
from observatorio.config import ConfigPostgres, leer_obligatoria
from observatorio.tiempo import ahora_ms

log = logging.getLogger("api")


def crear_app(repositorio, origenes: list[str], reloj=ahora_ms) -> FastAPI:
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

    @app.get("/api/eventos")
    async def eventos():
        generado = reloj()
        filas = await repositorio.eventos_recientes(generado)
        return a_geojson(filas, generado, await repositorio.ultima_ingestion())

    @app.get("/api/salud")
    async def salud():
        await repositorio.comprobar_base()  # falla con 503 si la base no responde
        return {"status": "ok", "database": "ok", "last_ingestion": await repositorio.ultima_ingestion()}

    return app


def crear_app_desde_entorno() -> FastAPI:
    pg = ConfigPostgres.desde_entorno()
    origenes = [o.strip() for o in leer_obligatoria("API_CORS_ORIGINS").split(",") if o.strip()]
    # open=False: la API arranca aunque PostgreSQL no esté listo; las consultas darán 503 hasta que lo esté.
    pool = AsyncConnectionPool(pg.conninfo(), min_size=1, max_size=4, open=False, timeout=3)

    async def abrir():
        await pool.open()

    return crear_app(RepositorioApi(pool.connection, abrir=abrir, cerrar=pool.close), origenes)
