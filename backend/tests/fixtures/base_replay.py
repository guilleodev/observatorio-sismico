"""Base de datos TEMPORAL para las pruebas del replay (F6): esquemas reales 001–004, catálogo de juguete y un histórico ficticio.

Los eventos ficticios nunca tocan las tablas definitivas: cada módulo crea su propia base, aplica `sql/001..004` y la elimina al terminar.
"""

import json
import os
from contextlib import contextmanager
from pathlib import Path

import psycopg

from fixtures.base_api import SHA, SQL_DIR, conninfo, ms  # noqa: F401  (se reexportan para las pruebas)
from fixtures.geo import CODIGOS
from observatorio.config import ConfigPostgres


def hay_entorno() -> bool:
    return bool(os.environ.get("POSTGRES_HOST")) and (Path(SQL_DIR) / "004_esquema_f6.sql").is_file()


@contextmanager
def base_temporal_replay(base: str):
    real = ConfigPostgres.desde_entorno()
    assert base != real.base and base.startswith("obs_")
    with psycopg.connect(real.conninfo(), autocommit=True) as admin:
        admin.execute(f'DROP DATABASE IF EXISTS "{base}"')  # solo la base temporal de esta prueba
        admin.execute(f'CREATE DATABASE "{base}"')
    try:
        with psycopg.connect(conninfo(base), autocommit=True) as c:
            for nombre in ("001_esquema_live.sql", "002_esquema_f3.sql", "003_esquema_f4.sql", "004_esquema_f6.sql"):
                c.execute((Path(SQL_DIR) / nombre).read_text(encoding="utf-8"))
            c.execute("INSERT INTO geo.catalogo (sha256, archivo, entidades) VALUES (%s, 'toy', %s)", (SHA, len(CODIGOS)))
            for p in CODIGOS:
                c.execute("INSERT INTO geo.pais (country_id, nombre_es) VALUES (%s, %s)", (p, f"Pais {p}"))
        yield conninfo(base)
    finally:
        with psycopg.connect(real.conninfo(), autocommit=True) as admin:
            admin.execute(f'DROP DATABASE IF EXISTS "{base}"')


def insertar_historico(c, features: list[dict]) -> None:
    """Inserta un histórico FICTICIO en la base temporal (una consulta y sus eventos)."""
    consulta_id = c.execute(
        "INSERT INTO historico.consulta (inicio, fin, filtros, url, resultado) VALUES ('2025-01-01', '2026-01-01', '{}'::jsonb, 'x', 'ok') "
        "ON CONFLICT (inicio, fin, filtros) DO UPDATE SET url = EXCLUDED.url RETURNING id").fetchone()[0]
    for f in features:
        p, (lon, lat, prof) = f["properties"], f["geometry"]["coordinates"]
        c.execute(
            "INSERT INTO historico.evento (event_id, event_time, updated_at, mag, mag_type, depth_km, longitude, latitude, place, country_id, geo_resultado, "
            "geo_catalogo, origen, consulta_id, raw) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NULL, 'sin_pais', %s, 'historico-usgs-fdsn', %s, %s::jsonb)",
            (f["id"], ms(p["time"]), ms(p["updated"]), p["mag"], p["magType"], prof, lon, lat, p["place"], SHA, consulta_id, json.dumps(f)))


def huella_tabla(c, tabla: str, orden: str) -> str:
    """md5 del contenido de una tabla (para comprobar que no cambia)."""
    return c.execute(f"SELECT coalesce(md5(string_agg(t::text, '|' ORDER BY {orden})), '-') FROM {tabla} t").fetchone()[0]
