"""Consultas a live.evento_actual y conversión a GeoJSON (CONTRATO-API.md)."""

import math
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager

import psycopg
from psycopg import AsyncConnection
from psycopg_pool import PoolTimeout

from observatorio.modos import MODO_LIVE, MODOS_CONTRACTUALES

VENTANA_MS = 24 * 3600 * 1000

SQL_EVENTOS = """
SELECT event_id, longitude, latitude, depth_km, mag, mag_type, place,
       (extract(epoch FROM event_time) * 1000)::bigint,
       (extract(epoch FROM updated_at) * 1000)::bigint,
       country_id, country_name
FROM live.evento_actual
WHERE event_time >= to_timestamp(%s / 1000.0) AND NOT retirado
ORDER BY event_time DESC
"""


SQL_ULTIMA_INGESTION = "SELECT (extract(epoch FROM ultima_consulta_ok_at) * 1000)::bigint FROM live.estado_ingesta WHERE id = 1"


class BaseDatosNoDisponible(Exception):
    """La consulta a PostgreSQL falló; la API responde 503, nunca una lista vacía."""


def _numero(valor) -> float | None:
    """numeric/double -> float; NaN e infinitos (no válidos en JSON) pasan a None."""
    if valor is None:
        return None
    valor = float(valor)
    return valor if math.isfinite(valor) else None


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

    async def eventos_recientes(self, ahora_ms: int) -> list[dict]:
        filas = await self._consultar(SQL_EVENTOS, (ahora_ms - VENTANA_MS,))
        return [
            {"id": f[0], "lon": f[1], "lat": f[2], "depth": _numero(f[3]), "mag": _numero(f[4]),
             "mag_type": f[5], "place": f[6], "time": f[7], "updated": f[8],
             "country_id": f[9], "country_name": f[10]}
            for f in filas
        ]

    async def comprobar_base(self) -> None:
        await self._consultar("SELECT 1")

    async def ultima_ingestion(self) -> int | None:
        """Instante (ms Unix UTC) de la última consulta CORRECTA a USGS; None si todavía no hubo ninguna.

        No avanza con consultas fallidas: viene de `estado_ingesta`, que solo actualiza el productor al recibir una respuesta válida.
        """
        filas = await self._consultar(SQL_ULTIMA_INGESTION)
        return filas[0][0] if filas else None


def a_geojson(eventos: list[dict], generado_ms: int, ultima_ingestion_ms: int | None, modo: str = MODO_LIVE) -> dict:
    if modo not in MODOS_CONTRACTUALES:
        raise ValueError(f"mode no contractual: {modo!r}")
    return {
        "type": "FeatureCollection",
        "metadata": {
            "generated": generado_ms,
            "last_ingestion": ultima_ingestion_ms,
            "mode": modo,
            "count": len(eventos),
            "truncated": False,
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
                },
            }
            for e in eventos
        ],
    }
