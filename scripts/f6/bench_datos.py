"""Datos SINTÉTICOS de escala para las mediciones de 6.4 (F6, T036; FR-019, FR-020).

Genera, de forma determinista (semilla fija), N versiones de eventos con identificadores `bench-XXXXXXX`, instantes repartidos en 2025 y epicentros aleatorios
sobre el globo. Todas las filas llevan `origen = 'sintetico-bench'` (restricción CHECK de la tabla) y solo se cargan en el esquema `bench` de un PostgreSQL TEMPORAL:
`conectar()` se niega a abrir cualquier servidor que no sea el contenedor `bench-f6-pg` y cualquier base que no sea `bench`, de modo que ni `live`, ni `historico`,
ni `sintetico`, ni `replay` del servidor real pueden recibir estas filas.
"""
import os
import random
from datetime import datetime, timedelta, timezone

SEMILLA = 20261108
ORIGEN = "sintetico-bench"
HOST_PERMITIDO = "bench-f6-pg"
BASE_PERMITIDA = "bench"
INICIO_2025 = datetime(2025, 1, 1, tzinfo=timezone.utc)
SEGUNDOS_2025 = 365 * 86400
TAMANOS = (1_000, 10_000, 100_000)
VERSIONES_POR_EVENTO = 1.5  # media: cada evento tiene 1 versión y uno de cada dos, 2

DDL = """
DROP SCHEMA IF EXISTS bench CASCADE;
CREATE SCHEMA bench;
CREATE TABLE bench.evento_version (
    event_id   text NOT NULL,
    updated_at timestamptz NOT NULL,
    event_time timestamptz NOT NULL,
    mag        numeric,
    depth_km   numeric,
    longitude  double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    latitude   double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    place      text,
    origen     text NOT NULL CHECK (origen = 'sintetico-bench'),
    PRIMARY KEY (event_id, updated_at)
);
"""
INSERT = ("INSERT INTO bench.evento_version (event_id, updated_at, event_time, mag, depth_km, longitude, latitude, place, origen) "
          "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)")


def generar(n: int, semilla: int = SEMILLA) -> list[tuple]:
    """Exactamente `n` filas (event_id, updated_at, event_time, mag, depth_km, lon, lat, place, origen), iguales en cada ejecución con la misma semilla."""
    if n < 1:
        raise ValueError("n debe ser >= 1")
    rng = random.Random(semilla)
    filas, evento = [], 0
    while len(filas) < n:
        evento += 1
        t = INICIO_2025 + timedelta(seconds=rng.randrange(SEGUNDOS_2025))
        lon, lat = round(rng.uniform(-180, 180), 4), round(rng.uniform(-90, 90), 4)
        mag = None if rng.random() < 0.02 else round(rng.uniform(0.5, 8.0), 1)
        prof = round(rng.uniform(0, 600), 1)
        for k in range(1 + (rng.random() < VERSIONES_POR_EVENTO - 1)):
            if len(filas) == n:
                break
            filas.append((f"bench-{evento:07d}", t + timedelta(minutes=5 * (k + 1)), t, mag, prof, lon, lat, f"Evento sintético {evento}", ORIGEN))
    return filas


def conninfo_permitido() -> str:
    """Cadena de conexión SOLO al PostgreSQL temporal de las mediciones; cualquier otro destino es un error."""
    host, base = os.environ.get("BENCH_PG_HOST", ""), os.environ.get("BENCH_PG_DB", BASE_PERMITIDA)
    if host != HOST_PERMITIDO or base != BASE_PERMITIDA:
        raise RuntimeError(f"destino no permitido ({host!r}/{base!r}): las cargas de escala solo van a {HOST_PERMITIDO}/{BASE_PERMITIDA}")
    return f"host={host} dbname={base} user=postgres password={os.environ.get('BENCH_PG_PASSWORD', 'bench')}"


def cargar(n: int, conn) -> int:
    """Recrea el esquema `bench` y carga `n` filas sintéticas; devuelve las filas realmente insertadas."""
    conn.execute(DDL)
    with conn.cursor() as cur:
        cur.executemany(INSERT, generar(n))
    conn.execute("ANALYZE bench.evento_version")
    return conn.execute("SELECT count(*) FROM bench.evento_version").fetchone()[0]
