"""EXPLAIN ANALYZE de las consultas de la API con y sin índices, a tres escalas (F5, paso 5.7, T047). SOLO base TEMPORAL `obs_escala_f5`; la base real solo se LEE.

Datos de la base temporal (rótulo: «datos de escala, réplica tratada como sintética»; nunca en la base real ni en el análisis de sismicidad):
  escala 1: el estado actual REAL de `live` (copiado), sin añadir nada;
  escala 2: + las 18 302 filas reales de `historico.evento` copiadas como estado actual de prueba;
  escala 3: + 9 réplicas más de esas filas (≈ 183 000 filas) con ids distintos y los mismos instantes.
Variantes de índices sobre `live.evento_actual`: V0 ninguno; V1 el actual (`event_time`, de F3); V2 el actual + `(country_id, event_time)` + `(geo_resultado, event_time)`.
Uso (contenedor de pruebas):  python -X utf8 /scripts5/escala_57.py [--mantener | --eliminar]
"""

import statistics
import sys
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import psycopg

sys.path.insert(0, "/app/src")
from observatorio.api import comparacion, estadisticas, repositorio  # noqa: E402
from observatorio.api.filtros import Filtros  # noqa: E402
from observatorio.config import ConfigPostgres  # noqa: E402
from observatorio.geo.catalogo import leer_catalogo, volcar  # noqa: E402

BASE = "obs_escala_f5"
real = ConfigPostgres.desde_entorno()
assert BASE != real.base
conninfo_real = real.conninfo()
conninfo_temp = conninfo_real.replace(f"dbname={real.base}", f"dbname={BASE}")
UTC = timezone.utc
REPETICIONES = 7
COLUMNAS_VIVO = ("event_id, event_time, updated_at, mag, mag_type, depth_km, longitude, latitude, place, country_id, country_name, source, mode, ingested_at, "
                 "kafka_topic, kafka_partition, kafka_offset, raw, stored_at, retirado, geo_resultado, geo_catalogo")


def linea(t=""):
    print(t, flush=True)


if "--eliminar" in sys.argv:
    with psycopg.connect(conninfo_real, autocommit=True) as c:
        c.execute(f'DROP DATABASE IF EXISTS "{BASE}"')
    linea(f"base temporal {BASE} eliminada")
    raise SystemExit(0)


def construir():
    with psycopg.connect(conninfo_real, autocommit=True) as c:
        c.execute(f'DROP DATABASE IF EXISTS "{BASE}"')
        c.execute(f'CREATE DATABASE "{BASE}"')
    with psycopg.connect(conninfo_temp, autocommit=True) as t:
        for nombre in ("001_esquema_live.sql", "002_esquema_f3.sql", "003_esquema_f4.sql"):
            t.execute((Path("/sql") / nombre).read_text(encoding="utf-8"))
        volcar(t, leer_catalogo(Path("/datos/paises.geojson")))
        with psycopg.connect(conninfo_real) as r:  # solo lectura
            for tabla in ("historico.consulta", "historico.evento"):
                with r.cursor().copy(f"COPY (SELECT * FROM {tabla}) TO STDOUT") as co, t.cursor().copy(f"COPY {tabla} FROM STDIN") as cd:
                    for dato in co:
                        cd.write(dato)
            with r.cursor().copy(f"COPY (SELECT {COLUMNAS_VIVO} FROM live.evento_actual) TO STDOUT") as co, t.cursor().copy(f"COPY live.evento_actual ({COLUMNAS_VIVO}) FROM STDIN") as cd:
                for dato in co:
                    cd.write(dato)


def replicar(t, desde_k, hasta_k):
    """Añade réplicas k = desde_k..hasta_k de las filas de historico.evento como estado actual de prueba (ids «esc-k-…»)."""
    t.execute(f"""INSERT INTO live.evento_actual (event_id, event_time, updated_at, mag, mag_type, depth_km, longitude, latitude, place, country_id, country_name, source, mode,
        ingested_at, kafka_topic, kafka_partition, kafka_offset, raw, geo_resultado, geo_catalogo)
        SELECT 'esc-' || k || '-' || e.event_id, e.event_time, e.updated_at, e.mag, e.mag_type, e.depth_km, e.longitude, e.latitude, e.place, e.country_id, p.nombre_es,
               'usgs-all-day', 'live', e.event_time, 'escala', 0, row_number() OVER (), '{{}}'::jsonb, e.geo_resultado, e.geo_catalogo
        FROM historico.evento e LEFT JOIN geo.pais p ON p.country_id = e.country_id, generate_series({desde_k}, {hasta_k}) k""")


def mediana_plan(t, sql, params):
    tiempos, nodos = [], ""
    for _ in range(REPETICIONES):
        plan = t.execute("EXPLAIN (ANALYZE, FORMAT JSON) " + sql, params).fetchone()[0][0]
        tiempos.append(plan["Execution Time"])
    pila, accesos = [plan["Plan"]], []
    while pila:
        n = pila.pop()
        if n["Node Type"] in ("Seq Scan", "Index Scan", "Index Only Scan", "Bitmap Heap Scan"):
            accesos.append(f"{n['Node Type'].replace(' Scan', '').replace('Bitmap Heap', 'Bitmap')}{'(' + n['Index Name'].replace('idx_', '') + ')' if 'Index Name' in n else ''}@{n.get('Relation Name', '')}")
        pila.extend(n.get("Plans", []))
        if n["Node Type"] == "Bitmap Heap Scan":
            for h in n.get("Plans", []):
                if "Index Name" in h:
                    accesos[-1] = f"Bitmap({h['Index Name'].replace('idx_', '')})@{n.get('Relation Name', '')}"
    return statistics.median(tiempos), "+".join(sorted(set(a for a in accesos if "evento_actual" in a or "historico" in a))) or "-"


def suite(t, ventanas):
    """(nombre, sql, params) de las consultas de la API para cada ventana y filtro."""
    casos = []
    for nombre_v, inicio, fin in ventanas:
        for nombre_f, extra in (("sin filtro", {}), ("país USA", {"country_id": "USA"}), ("sin_pais", {"country_id": "sin_pais"})):
            f = Filtros.desde_parametros(int(fin.timestamp() * 1000), inicio.isoformat(), fin.isoformat(), None, extra.get("country_id"))
            donde, p = f.donde()
            etiqueta = f"{nombre_v} · {nombre_f}"
            casos.append((f"eventos (página 5000) · {etiqueta}", repositorio.SQL_EVENTOS.format(donde=donde), {**p, "p_limit": 5000, "p_offset": 0}))
            casos.append((f"total · {etiqueta}", repositorio.SQL_TOTAL.format(donde=donde), p))
            casos.append((f"por país · {etiqueta}", estadisticas.SQL_POR_PAIS.format(donde=donde), p))
            casos.append((f"magnitud · {etiqueta}", estadisticas.SQL_MAGNITUD.format(donde=donde), p))
            if (fin - inicio).days <= 31:
                casos.append((f"por hora · {etiqueta}", estadisticas.SQL_POR_HORA.format(donde=donde), p))
    for ambito, pais in (("global", None), ("pais", "USA"), ("sin_pais", None)):
        h = {"h_desde": comparacion.H_DESDE, "h_hasta": comparacion.H_HASTA, "min_mag": Decimal(4), "ambito": ambito, "pais": pais, "dias": 365}
        casos.append((f"comparación 2025 total · {ambito}", comparacion.SQL_HISTORICO_TOTAL, h))
        casos.append((f"comparación 2025 mediana · {ambito}", comparacion.SQL_HISTORICO_MEDIANA, h))
    casos.append(("cobertura (min ingested_at)", comparacion.SQL_COBERTURA, {}))
    return casos


VARIANTES = [("V0 sin índices", ["DROP INDEX IF EXISTS live.idx_live_evento_actual_event_time", "DROP INDEX IF EXISTS live.idx_f5_pais_tiempo", "DROP INDEX IF EXISTS live.idx_f5_geo_tiempo"]),
             ("V1 actual (event_time)", ["DROP INDEX IF EXISTS live.idx_f5_pais_tiempo", "DROP INDEX IF EXISTS live.idx_f5_geo_tiempo",
                                          "CREATE INDEX IF NOT EXISTS idx_live_evento_actual_event_time ON live.evento_actual (event_time)"]),
             ("V2 + país y geo", ["CREATE INDEX IF NOT EXISTS idx_live_evento_actual_event_time ON live.evento_actual (event_time)",
                                  "CREATE INDEX IF NOT EXISTS idx_f5_pais_tiempo ON live.evento_actual (country_id, event_time)",
                                  "CREATE INDEX IF NOT EXISTS idx_f5_geo_tiempo ON live.evento_actual (geo_resultado, event_time)"])]


def medir_escala(t, titulo, ventanas):
    n = t.execute("SELECT count(*) FROM live.evento_actual").fetchone()[0]
    linea(f"\n## {titulo}: live.evento_actual = {n} filas (historico.evento = {t.execute('SELECT count(*) FROM historico.evento').fetchone()[0]})")
    resultados = {}
    for nombre, sentencias in VARIANTES:
        for s in sentencias:
            t.execute(s)
        t.execute("ANALYZE live.evento_actual")
        for caso, sql, params in suite(t, ventanas):
            resultados.setdefault(caso, {})[nombre] = mediana_plan(t, sql, params)
    linea(f"{'consulta':<62}{'V0 ms':>9}{'V1 ms':>9}{'V2 ms':>9}  acceso V1  →  acceso V2")
    mejoras = []
    for caso, v in resultados.items():
        v0, v1, v2 = v["V0 sin índices"], v["V1 actual (event_time)"], v["V2 + país y geo"]
        linea(f"{caso:<62}{v0[0]:>9.2f}{v1[0]:>9.2f}{v2[0]:>9.2f}  {v1[1]}  →  {v2[1]}")
        mejoras.append((caso, v1[0], v2[0], v0[0]))
    linea(f"  máximo por variante (ms): V0 {max(m[3] for m in mejoras):.2f} | V1 {max(m[1] for m in mejoras):.2f} | V2 {max(m[2] for m in mejoras):.2f} ; suma (ms): V0 {sum(m[3] for m in mejoras):.1f} | V1 {sum(m[1] for m in mejoras):.1f} | V2 {sum(m[2] for m in mejoras):.1f}")
    utiles = [m for m in mejoras if m[2] < m[1] / 2 and m[1] - m[2] >= 1.0]
    linea(f"  consultas donde V2 mejora a V1 al menos 2× y ≥ 1 ms: {len(utiles)} de {len(mejoras)}" + (": " + "; ".join(f"{m[0]} ({m[1]:.1f}→{m[2]:.1f} ms)" for m in utiles) if utiles else ""))
    utiles1 = [m for m in mejoras if m[1] < m[3] / 2 and m[3] - m[1] >= 1.0]
    linea(f"  consultas donde V1 (índice actual) mejora a V0 al menos 2× y ≥ 1 ms: {len(utiles1)} de {len(mejoras)}")
    return n


linea(f"# 5.7 T047 - EXPLAIN ANALYZE con y sin índices {datetime.now(UTC):%Y-%m-%dT%H:%M:%SZ}")
linea("Base temporal obs_escala_f5; datos de escala = réplica de datos reales tratada como SINTÉTICA, solo para medir. Mediana de 7 ejecuciones de EXPLAIN ANALYZE (tiempo de ejecución del servidor, sin red).")
linea("Entorno: contenedor Docker en Windows 11 / Docker Desktop, PostgreSQL 17 local; los tiempos son de esta máquina y de este volumen y no son umbrales de rendimiento.")
t0 = time.perf_counter()
construir()
with psycopg.connect(conninfo_temp, autocommit=True) as t:
    t.execute("SET TIME ZONE 'UTC'")
    fin_vivo = t.execute("SELECT max(event_time) + interval '1 millisecond' FROM live.evento_actual").fetchone()[0]
    ini_vivo = fin_vivo - timedelta(hours=24)
    dia_2025 = (datetime(2025, 7, 15, tzinfo=UTC), datetime(2025, 7, 16, tzinfo=UTC))
    todo = (datetime(2025, 1, 1, tzinfo=UTC), datetime(2027, 1, 1, tzinfo=UTC))
    cobertura_viva = (fin_vivo - timedelta(days=3), fin_vivo)
    linea(f"ventanas: «24 h en vivo» [{ini_vivo:%Y-%m-%dT%H:%MZ}, {fin_vivo:%Y-%m-%dT%H:%MZ}) | «3 días en vivo» | «24 h de 2025» (2025-07-15) | «todo» (2025-01-01 a 2027-01-01)")
    ventanas1 = [("24 h vivo", ini_vivo, fin_vivo), ("3 días vivo", *cobertura_viva), ("todo", *todo)]
    ventanas2 = ventanas1 + [("24 h 2025", *dia_2025)]
    medir_escala(t, "Escala 1 — datos REALES de live (volumen actual)", ventanas1)
    replicar(t, 1, 1)
    medir_escala(t, "Escala 2 — live real + 18 302 filas de escala (≈ 1 año de histórico como estado actual)", ventanas2)
    replicar(t, 2, 10)
    medir_escala(t, "Escala 3 — ≈ 10 años de actividad equivalente (réplicas, ≈ 183 000 filas)", ventanas2)
    for _, sentencias in VARIANTES[2:]:
        for s in sentencias:
            t.execute(s)
    t.execute("ANALYZE live.evento_actual")
linea(f"\nDuración total de la medición: {time.perf_counter() - t0:.0f} s. Los índices de la variante V2 quedan creados en la base temporal.")
if "--mantener" in sys.argv:
    linea(f"La base temporal {BASE} se MANTIENE para las pruebas de tiempos y del navegador (se elimina con --eliminar).")
else:
    with psycopg.connect(conninfo_real, autocommit=True) as c:
        c.execute(f'DROP DATABASE IF EXISTS "{BASE}"')
    linea(f"base temporal {BASE} eliminada")
