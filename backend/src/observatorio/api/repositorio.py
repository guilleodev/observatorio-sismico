"""Consultas a live.evento_actual y conversión a GeoJSON (CONTRATO-API.md)."""

import math
from dataclasses import dataclass
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager

import psycopg
from psycopg import AsyncConnection
from psycopg_pool import PoolTimeout

from observatorio.api import estadisticas
from observatorio.api.comparacion import SQL_COBERTURA, SQL_HUECOS_PENDIENTES, SQL_ULTIMA_INGESTION
from observatorio.api.filtros import SIN_PAIS, ErrorParametro, Filtros, para_modo
from observatorio.api.replay import SQL_EJECUCION_POR_ID, SQL_EJECUCION_ULTIMA, SQL_EVENTOS_REPLAY, a_ejecucion
from observatorio.modos import MODO_LIVE, MODO_REPLAY, MODOS_CONTRACTUALES

# {donde} lo construye Filtros.donde() solo con marcadores %(nombre)s: ningún valor del usuario se concatena en el SQL.
SQL_EVENTOS = """
SELECT event_id, longitude, latitude, depth_km, mag, mag_type, place,
       (extract(epoch FROM event_time) * 1000)::bigint,
       (extract(epoch FROM updated_at) * 1000)::bigint,
       country_id, country_name
FROM live.evento_actual
WHERE {donde}
ORDER BY event_time DESC, event_id ASC
LIMIT %(p_limit)s OFFSET %(p_offset)s
"""
SQL_TOTAL = "SELECT count(*) FROM live.evento_actual WHERE {donde}"
SQL_SIN_MAGNITUD = "SELECT count(*) FROM live.evento_actual WHERE {donde} AND mag IS NULL"
SQL_PAIS_EXISTE = "SELECT 1 FROM geo.pais WHERE country_id = %s"




class BaseDatosNoDisponible(Exception):
    """La consulta a PostgreSQL falló; la API responde 503, nunca una lista vacía."""


def _numero(valor) -> float | None:
    """numeric/double -> float; NaN e infinitos (no válidos en JSON) pasan a None."""
    if valor is None:
        return None
    valor = float(valor)
    return valor if math.isfinite(valor) else None


@dataclass(frozen=True)
class PaginaEventos:
    """Una página de eventos y las cifras de la MISMA instantánea (una sola transacción de lectura)."""

    eventos: list[dict]
    total: int
    sin_magnitud: int
    last_ingestion: int | None
    live_since: int | None


@dataclass(frozen=True)
class EstadoSalud:
    """Estado de la ingesta leído en UNA transacción: la edad y el aviso de «desactualizado» los calcula la API con su propio reloj."""

    last_ingestion: int | None
    live_since: int | None
    gaps_pending: int


def opciones_conexion(statement_timeout_s: int) -> str:
    """Opciones de sesión del pool de la API: instantánea consistente por petición, solo lectura, UTC y tiempo máximo por consulta.

    `default_transaction_isolation = repeatable read`: la primera consulta de la petición fija la instantánea y todas las demás (total,
    página, cobertura, última ingesta) ven el mismo estado aunque el consumidor siga escribiendo. `default_transaction_read_only`: la
    API no puede escribir ni por error.
    """
    return (r"-c default_transaction_isolation=repeatable\ read " + "-c default_transaction_read_only=on "
            f"-c timezone=UTC -c statement_timeout={int(statement_timeout_s) * 1000}")


async def _validar_pais(conn, filtros: Filtros) -> None:
    """Un código de país que no está en el catálogo es un error de parámetro (422), no una consulta vacía."""
    if filtros.country_id not in (None, SIN_PAIS):
        if await (await conn.execute(SQL_PAIS_EXISTE, (filtros.country_id,))).fetchone() is None:
            raise ErrorParametro(f"country_id desconocido: {filtros.country_id!r} no está en el catálogo de países (use «{SIN_PAIS}» para eventos sin país)")


class RepositorioApi:
    def __init__(self, conexion: Callable[[], AbstractAsyncContextManager[AsyncConnection]],
                 abrir=None, cerrar=None):
        self._conexion = conexion
        self._abrir, self._cerrar = abrir, cerrar

    async def abrir(self) -> None:
        if self._abrir:
            await self._abrir()

    async def cerrar(self) -> None:
        if self._cerrar:
            await self._cerrar()

    async def _consultar(self, sql: str, parametros: tuple = ()) -> list[tuple]:
        try:
            async with self._conexion() as conn:
                cursor = await conn.execute(sql, parametros)
                return await cursor.fetchall()
        except (psycopg.Error, PoolTimeout, OSError) as exc:
            raise BaseDatosNoDisponible(type(exc).__name__) from exc

    async def ejecucion(self, run_id: str | None) -> dict | None:
        """`metadata.replay` de la ejecución pedida o, sin `run_id`, de la más reciente; None si no existe (o no hay ninguna). Solo lectura."""
        sql, parametros = (SQL_EJECUCION_ULTIMA, ()) if run_id is None else (SQL_EJECUCION_POR_ID, (run_id,))
        filas = await self._consultar(sql, parametros)
        return a_ejecucion(filas[0]) if filas else None

    async def pagina_eventos(self, filtros: Filtros, limit: int, offset: int) -> PaginaEventos:
        """Eventos del filtro (página `limit`/`offset`) con total, magnitudes nulas, última ingesta y cobertura, en UNA transacción."""
        donde, parametros = filtros.donde()
        donde_sin_umbral, parametros_sin_umbral = filtros.donde(con_magnitud=False)
        replay = filtros.modo == MODO_REPLAY
        sql_eventos = SQL_EVENTOS_REPLAY if replay else SQL_EVENTOS
        try:
            async with self._conexion() as conn:
                await _validar_pais(conn, filtros)
                total = (await (await conn.execute(para_modo(SQL_TOTAL, filtros.modo).format(donde=donde), parametros)).fetchone())[0]
                sin_magnitud = (await (await conn.execute(para_modo(SQL_SIN_MAGNITUD, filtros.modo).format(donde=donde_sin_umbral),
                                                          parametros_sin_umbral)).fetchone())[0]
                filas = await (await conn.execute(sql_eventos.format(donde=donde), {**parametros, "p_limit": limit, "p_offset": offset})).fetchall()
                # En replay la cobertura es el intervalo de la ejecución (metadata.replay); la de `live` no se consulta.
                cobertura = None if replay else (await (await conn.execute(SQL_COBERTURA)).fetchone())[0]
                ingestion = await (await conn.execute(SQL_ULTIMA_INGESTION)).fetchone()  # la ingesta EN VIVO, también en replay
        except (psycopg.Error, PoolTimeout, OSError) as exc:
            raise BaseDatosNoDisponible(type(exc).__name__) from exc
        eventos = [
            {"id": f[0], "lon": f[1], "lat": f[2], "depth": _numero(f[3]), "mag": _numero(f[4]),
             "mag_type": f[5], "place": f[6], "time": f[7], "updated": f[8],
             "country_id": f[9], "country_name": f[10], **({"caso": f[11], "replayed_at": f[12]} if replay else {})}
            for f in filas
        ]
        return PaginaEventos(eventos, total, sin_magnitud, ingestion[0] if ingestion else None, cobertura)

    async def estadisticas(self, filtros: Filtros, generado_ms: int, max_casillas: int, margen_publicacion_s: int) -> dict:
        """Estadísticas y comparación del filtro, en UNA transacción de lectura (la misma instantánea que /api/eventos)."""
        try:
            async with self._conexion() as conn:
                await _validar_pais(conn, filtros)
                return await estadisticas.calcular(conn, filtros, generado_ms, max_casillas, margen_publicacion_s)
        except (psycopg.Error, PoolTimeout, OSError) as exc:
            raise BaseDatosNoDisponible(type(exc).__name__) from exc

    async def estado_salud(self) -> EstadoSalud:
        """Última consulta correcta a USGS, inicio de la cobertura real y huecos pendientes; falla con BaseDatosNoDisponible (503) si la base no responde."""
        try:
            async with self._conexion() as conn:
                await conn.execute("SELECT 1")
                ingestion = await (await conn.execute(SQL_ULTIMA_INGESTION)).fetchone()
                cobertura = (await (await conn.execute(SQL_COBERTURA)).fetchone())[0]
                huecos = (await (await conn.execute(SQL_HUECOS_PENDIENTES)).fetchone())[0]
        except (psycopg.Error, PoolTimeout, OSError) as exc:
            raise BaseDatosNoDisponible(type(exc).__name__) from exc
        return EstadoSalud(ingestion[0] if ingestion else None, cobertura, huecos)

    async def comprobar_base(self) -> None:
        await self._consultar("SELECT 1")

    async def ultima_ingestion(self) -> int | None:
        """Instante (ms Unix UTC) de la última consulta CORRECTA a USGS; None si todavía no hubo ninguna.

        No avanza con consultas fallidas: viene de `estado_ingesta`, que solo actualiza el productor al recibir una respuesta válida.
        """
        filas = await self._consultar(SQL_ULTIMA_INGESTION)
        return filas[0][0] if filas else None


def a_geojson(eventos: list[dict], generado_ms: int, ultima_ingestion_ms: int | None, modo: str = MODO_LIVE, *,
              total: int | None = None, limit: int | None = None, offset: int = 0, sin_magnitud: int = 0,
              period: dict | None = None, live_since: int | None = None, replay: dict | None = None) -> dict:
    if modo not in MODOS_CONTRACTUALES:
        raise ValueError(f"mode no contractual: {modo!r}")
    total = len(eventos) + offset if total is None else total
    truncado = offset + len(eventos) < total
    es_replay = modo == MODO_REPLAY
    respuesta = {
        "type": "FeatureCollection",
        "metadata": {
            "generated": generado_ms,
            "last_ingestion": ultima_ingestion_ms,
            "mode": modo,
            "count": len(eventos),
            "truncated": truncado,
            "total": total,
            "limit": len(eventos) if limit is None else limit,
            "offset": offset,
            "next_offset": offset + len(eventos) if truncado else None,
            "sin_magnitud": sin_magnitud,
            "period": period,
            "coverage": {"live_since": live_since},
        },
        "features": [
            {
                "type": "Feature",
                "id": e["id"],
                "geometry": {"type": "Point", "coordinates": [e["lon"], e["lat"], e["depth"]]},
                "properties": {
                    "mag": e["mag"], "magType": e["mag_type"], "place": e["place"],
                    "time": e["time"], "updated": e["updated"],
                    "country_id": e["country_id"], "country_name": e["country_name"],
                    **({"caso": e["caso"], "replayed_at": e["replayed_at"]} if es_replay else {}),
                },
            }
            for e in eventos
        ],
    }
    if es_replay:  # contracts/f6.md §2: la cobertura es el intervalo de la ejecución; con live no aparece ningún campo de replay
        respuesta["metadata"]["replay"] = replay
        respuesta["metadata"]["coverage"] = {"desde": None, "hasta": None} if replay is None else dict(replay["intervalo"])
    return respuesta
