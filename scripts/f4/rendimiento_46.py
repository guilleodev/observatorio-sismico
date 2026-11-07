"""Rendimiento e índices del histórico (F4, paso 4.6, T059; SC-011). Trabaja en una BASE TEMPORAL (`obs_rend_f4`); la base real solo se lee.

Mide, con los 18 302 eventos reales reconstruidos desde los archivos originales (sin red): (a) tiempo de asignación por evento, (b) asignación
RETROACTIVA de 18 302 eventos ya almacenados, (c) carga completa desde archivos locales, y (d) EXPLAIN ANALYZE de las consultas del histórico con y sin
los índices de `historico.evento`. Uso (contenedor de pruebas, con /app, /sql, /scripts, /exportacion y el catálogo montados):
    python -X utf8 /scripts/rendimiento_46.py
"""

import gzip
import json
import os
import statistics
import subprocess
import sys
import time
from pathlib import Path

import psycopg

sys.path.insert(0, "/app/tests")
sys.path.insert(0, "/app/src")
from fixtures.fdsn_simulado import ServidorFdsn  # noqa: E402
from observatorio.config import ConfigPostgres  # noqa: E402
from observatorio.geo.asignador import Asignador  # noqa: E402
from observatorio.geo.catalogo import leer_catalogo, volcar  # noqa: E402
from observatorio.geo.retroactivo import asignar_existentes  # noqa: E402

TEMPORAL = "obs_rend_f4"
real = ConfigPostgres.desde_entorno()
conninfo_temp = real.conninfo().replace(f"dbname={real.base}", f"dbname={TEMPORAL}")
assert TEMPORAL != real.base


def linea(t=""):
    print(t, flush=True)


archivos = sorted(Path("/exportacion").glob("*.geojson.gz"))
entradas = [(f["properties"]["time"], f) for a in archivos for f in json.loads(gzip.decompress(a.read_bytes()))["features"]]
linea(f"# 4.6 T059 - rendimiento e índices {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}")
linea(f"datos: {len(entradas)} terremotos reales de 2025 reconstruidos desde {len(archivos)} archivos originales | contenedor Docker (Windows 11 / Docker Desktop), PostgreSQL local\n")

with psycopg.connect(real.conninfo(), autocommit=True) as c:
    c.execute(f'DROP DATABASE IF EXISTS "{TEMPORAL}"')  # solo la base temporal de un ensayo anterior
    c.execute(f'CREATE DATABASE "{TEMPORAL}"')
try:
    catalogo = leer_catalogo(Path("/datos/paises.geojson"))
    with psycopg.connect(conninfo_temp, autocommit=True) as c:
        for nombre in ("001_esquema_live.sql", "002_esquema_f3.sql", "003_esquema_f4.sql"):
            c.execute((Path("/sql") / nombre).read_text(encoding="utf-8"))
        volcar(c, catalogo)

    linea("== (c) Carga completa desde archivos locales (3 repeticiones; el proceso incluye arrancar Python y construir el índice espacial) ==")
    with ServidorFdsn(entradas) as servidor:
        entorno = dict(os.environ, POSTGRES_DB=TEMPORAL, HISTORICO_URL=servidor.url, HISTORICO_ANIO="2025", HISTORICO_MAX_REINTENTOS="0",
                       CATALOGO_PATH="/datos/paises.geojson", HISTORICO_EXPORT_DIR="/tmp/no_existe", PYTHONPATH="/app/src")
        tiempos, medias, maximos = [], [], []
        for rep in (1, 2, 3):
            if rep > 1:
                with psycopg.connect(conninfo_temp, autocommit=True) as c:
                    c.execute("TRUNCATE historico.cuarentena, historico.evento, historico.archivo, historico.consulta RESTART IDENTITY")
            t0 = time.perf_counter()
            p = subprocess.run([sys.executable, "-m", "observatorio.historico.cargar"], env=entorno, capture_output=True, text=True)
            tiempos.append(time.perf_counter() - t0)
            r = json.loads([x for x in p.stdout.splitlines() if x.startswith("RESUMEN")][-1][8:])
            medias.append(r["asignacion_media_us"])
            maximos.append(r["asignacion_max_ms"])
            assert p.returncode == 0 and r["eventos_nuevos"] == len(entradas)
        linea(f"  tiempos: {[round(t, 2) for t in tiempos]} s | mediana {statistics.median(tiempos):.2f} s | {len(entradas) / statistics.median(tiempos):,.0f} eventos/s en total")
        linea(f"  asignación por evento dentro de la carga: media {statistics.median(medias):.1f} µs (de {medias}) | máximo por ejecución {maximos} ms")

    linea("\n== (a) Asignación por evento: distribución sobre los 18 302 puntos reales ==")
    asignador = Asignador(catalogo)
    with psycopg.connect(conninfo_temp) as c:
        puntos = c.execute("SELECT longitude, latitude FROM historico.evento").fetchall()
    for p in puntos[:2000]:
        asignador.asignar(*p)  # calentamiento
    muestras = []
    for p in puntos:
        t = time.perf_counter_ns()
        asignador.asignar(*p)
        muestras.append(time.perf_counter_ns() - t)
    muestras.sort()
    pct = lambda q: muestras[min(len(muestras) - 1, int(q * len(muestras)))] / 1000
    linea(f"  n={len(muestras)} | media {statistics.fmean(muestras) / 1000:.1f} µs | mediana {pct(0.5):.1f} µs | p95 {pct(0.95):.1f} µs | p99 {pct(0.99):.1f} µs | p99,9 {pct(0.999):.1f} µs | máximo {muestras[-1] / 1000:.1f} µs")

    linea("\n== (b) Asignación RETROACTIVA de 18 302 eventos ya almacenados (live.evento_actual de la base temporal, sin país) ==")
    with psycopg.connect(conninfo_temp, autocommit=True) as c:
        c.execute("INSERT INTO live.evento_actual (event_id, event_time, updated_at, mag, mag_type, depth_km, longitude, latitude, place, source, mode, ingested_at, "
                  "kafka_topic, kafka_partition, kafka_offset, raw) SELECT event_id, event_time, updated_at, mag, mag_type, depth_km, longitude, latitude, place, "
                  "'usgs-all-day', 'live', now(), 't', 0, row_number() OVER (), raw FROM historico.evento")
        t0 = time.perf_counter()
        r = asignar_existentes(c, asignador)
        dt = time.perf_counter() - t0
        linea(f"  leídos {r.leidos} | asignados {r.asignados} | omitidos por carrera {r.omitidos_por_carrera} | {dt:.2f} s en total = {dt / r.leidos * 1e6:.0f} µs por evento (incluye leer y actualizar en la base)")
        t0 = time.perf_counter()
        r2 = asignar_existentes(c, asignador)
        linea(f"  segunda pasada (idempotente): leídos {r2.leidos} en {time.perf_counter() - t0:.3f} s")
        dif = c.execute("SELECT count(*) FROM live.evento_actual l JOIN historico.evento h USING (event_id) WHERE l.country_id IS DISTINCT FROM h.country_id "
                        "OR l.geo_resultado <> h.geo_resultado").fetchone()[0]
        linea(f"  la asignación retroactiva coincide con la de la carga histórica en los {r.asignados} eventos (diferencias: {dif})")
        assert dif == 0

    linea("\n== (d) EXPLAIN ANALYZE de las consultas del histórico, con y sin índices (18 302 filas; mediana de 7 ejecuciones) ==")
    consultas = {
        "un mes (rango de event_time)": "SELECT count(*) FROM historico.evento WHERE event_time >= '2025-07-01' AND event_time < '2025-08-01'",
        "un día (rango estrecho)": "SELECT count(*) FROM historico.evento WHERE event_time >= '2025-07-15' AND event_time < '2025-07-16'",
        "un país en todo el año": "SELECT count(*) FROM historico.evento WHERE country_id = 'CHN'",
        "un país en un mes": "SELECT count(*) FROM historico.evento WHERE country_id = 'CHN' AND event_time >= '2025-07-01' AND event_time < '2025-08-01'",
        "serie diaria global (comparación)": (Path("/sql/consultas/comparacion.sql").read_text(encoding="utf-8").split("-- name: historico_serie_diaria")[1].split("-- name:")[0]
                                              .replace("%(h_desde)s", "'2025-01-01'").replace("%(h_hasta)s", "'2026-01-01'").replace("%(min_mag)s", "4")
                                              .replace("%(ambito)s", "'global'").replace("%(pais)s", "NULL")),
    }

    def medir(sql):
        tiempos_ms, nodo = [], ""
        with psycopg.connect(conninfo_temp, autocommit=True) as c:
            c.execute("SET TIME ZONE 'UTC'")
            for _ in range(7):
                plan = c.execute("EXPLAIN (ANALYZE, FORMAT JSON) " + sql).fetchone()[0][0]
                tiempos_ms.append(plan["Execution Time"])
                n = plan["Plan"]
                while "Plans" in n and n["Node Type"] not in ("Seq Scan", "Index Scan", "Bitmap Heap Scan", "Index Only Scan"):
                    n = n["Plans"][0]
                nodo = n["Node Type"]
        return statistics.median(tiempos_ms), nodo

    con = {k: medir(v) for k, v in consultas.items()}
    with psycopg.connect(conninfo_temp, autocommit=True) as c:
        c.execute("DROP INDEX historico.idx_historico_evento_time")  # SOLO en la base temporal
        c.execute("DROP INDEX historico.idx_historico_evento_pais")
        c.execute("ANALYZE historico.evento")
    sin = {k: medir(v) for k, v in consultas.items()}
    linea(f"  {'consulta':<36}{'con índices (ms)':>18}{'plan':>16}{'sin índices (ms)':>18}{'plan':>12}")
    for k in consultas:
        linea(f"  {k:<36}{con[k][0]:>18.3f}{con[k][1]:>16}{sin[k][0]:>18.3f}{sin[k][1]:>12}")
    linea("  Lectura: con ~18 000 filas el planificador puede preferir el recorrido secuencial; un índice solo se mantiene si mejora de forma apreciable.")
finally:
    with psycopg.connect(real.conninfo(), autocommit=True) as c:
        c.execute(f'DROP DATABASE IF EXISTS "{TEMPORAL}"')
    linea(f"\nbase temporal {TEMPORAL} eliminada")
