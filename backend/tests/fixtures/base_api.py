"""Base de datos TEMPORAL para las pruebas de integración de la API (F5): esquema real aplicado, sin datos reales.

Los eventos ficticios nunca tocan las tablas definitivas: cada módulo de pruebas crea su propia base, aplica `sql/001..003` y la elimina al terminar.
"""

import os
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import psycopg

from observatorio.config import ConfigPostgres

SQL_DIR = Path(os.environ.get("SQL_DIR", "/sql"))
SHA = "b" * 64
PAISES = ("ZA1", "ZB1", "ZC1")  # catálogo de juguete (ZC1 queda sin eventos)
INGESTA = datetime(2026, 10, 26, 0, 0, tzinfo=timezone.utc)


def hay_entorno() -> bool:
    return bool(os.environ.get("POSTGRES_HOST")) and (SQL_DIR / "003_esquema_f4.sql").is_file()


def conninfo(base: str) -> str:
    real = ConfigPostgres.desde_entorno()
    return real.conninfo().replace(f"dbname={real.base}", f"dbname={base}")


@contextmanager
def base_temporal(base: str):
    real = ConfigPostgres.desde_entorno()
    assert base != real.base
    with psycopg.connect(real.conninfo(), autocommit=True) as admin:
        admin.execute(f'DROP DATABASE IF EXISTS "{base}"')  # solo la base temporal de esta prueba
        admin.execute(f'CREATE DATABASE "{base}"')
    try:
        with psycopg.connect(conninfo(base), autocommit=True) as c:
            for nombre in ("001_esquema_live.sql", "002_esquema_f3.sql", "003_esquema_f4.sql"):
                c.execute((SQL_DIR / nombre).read_text(encoding="utf-8"))
            c.execute("INSERT INTO geo.catalogo (sha256, archivo, entidades) VALUES (%s, 'toy', 3)", (SHA,))
            for p in PAISES:
                c.execute("INSERT INTO geo.pais (country_id, nombre_es) VALUES (%s, %s)", (p, f"Pais {p}"))
        yield conninfo(base)
    finally:
        with psycopg.connect(real.conninfo(), autocommit=True) as admin:
            admin.execute(f'DROP DATABASE IF EXISTS "{base}"')


def ms(valor: int) -> datetime:
    return datetime.fromtimestamp(valor / 1000, tz=timezone.utc)


def insertar_evento(c, id_: str, tiempo_ms: int, mag, pais: str | None, resultado: str | None = "auto", *, profundidad=10.0, retirado=False,
                    tipo_mag="ml", lugar="Lugar de prueba", ingestado=INGESTA, offset=None):
    """Inserta una fila de `live.evento_actual` (resultado por defecto: interior si hay país, sin_pais si no; None = sin asignar)."""
    if resultado == "auto":  # None explícito = aún sin asignar (geo_resultado nulo)
        resultado = "interior" if pais else "sin_pais"
    c.execute(
        "INSERT INTO live.evento_actual (event_id, event_time, updated_at, mag, mag_type, depth_km, longitude, latitude, place, source, mode, ingested_at, "
        "kafka_topic, kafka_partition, kafka_offset, raw, country_id, country_name, geo_resultado, geo_catalogo, retirado) "
        "VALUES (%s, %s, %s, %s, %s, %s, 1, 2, %s, 'usgs-all-day', 'live', %s, 't', 0, %s, '{}'::jsonb, %s, %s, %s, %s, %s)",
        (id_, ms(tiempo_ms), ms(tiempo_ms), mag, tipo_mag, profundidad, lugar, ingestado,
         abs(hash(id_)) % 10**9 if offset is None else offset, pais, f"Pais {pais}" if pais else None, resultado, SHA, retirado))
