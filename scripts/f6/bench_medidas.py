"""Mediciones de tiempo y memoria de 6.4 (F6, T036; FR-019, FR-020, SC-010). Se ejecuta DENTRO del contenedor de medida (ver bench_ejecutar.sh).

Un PROCESO por tamaño (`--n N`) para que el máximo residente (RSS) de cada tamaño sea independiente; el modo `--todos` los lanza uno tras otro.
Operaciones (con datos sintéticos de `bench_datos`, solo en el PostgreSQL temporal):
  (a) búsqueda de versiones por event_id: consulta SQL con la clave primaria (event_id, updated_at), una a una (latencia por búsqueda);
  (b) integración geográfica: `Asignador.asignar` (STRtree + predicado exacto) sobre los N epicentros del catálogo real de países (solo lectura);
  (c) agregación por ventanas de 1 h UTC del tiempo del evento: (c1) en SQL (GROUP BY) y (c2) trayendo las filas a Python y agrupando allí.
Tiempo: `time.perf_counter_ns` (reloj monotónico); mediana y p95. Memoria: pico de `tracemalloc` de UNA repetición aparte (tracemalloc ralentiza, por eso no se
mide el tiempo con él) y máximo residente del proceso (`ru_maxrss`), con el RSS base anterior a la operación para restarlo.
"""
import argparse
import json
import os
import random
import resource
import statistics
import subprocess
import sys
import time
import tracemalloc

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, "/app/src")
import bench_datos as bd  # noqa: E402


def rss_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024  # KB en Linux


def percentil(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, max(0, round(p / 100 * (len(xs) - 1))))]


def resumen(tiempos_ns):
    ms = [t / 1e6 for t in tiempos_ns]
    return {"n": len(ms), "mediana_ms": round(statistics.median(ms), 4), "p95_ms": round(percentil(ms, 95), 4), "max_ms": round(max(ms), 4)}


def con_memoria(funcion):
    """Pico de tracemalloc (MB) de una ejecución de `funcion`, medida aparte de los tiempos."""
    tracemalloc.start()
    try:
        funcion()
        return round(tracemalloc.get_traced_memory()[1] / 1e6, 2)
    finally:
        tracemalloc.stop()


def medir_n(n: int) -> dict:
    import psycopg
    from observatorio.geo.asignador import Asignador
    from observatorio.geo.catalogo import leer_catalogo
    from pathlib import Path

    res = {"n": n}
    with psycopg.connect(bd.conninfo_permitido(), autocommit=True) as c:
        filas_cargadas = bd.cargar(n, c)
        res["filas"] = filas_cargadas
        res["eventos_distintos"] = c.execute("SELECT count(DISTINCT event_id) FROM bench.evento_version").fetchone()[0]
        res["tabla_mb"] = round(c.execute("SELECT pg_total_relation_size('bench.evento_version')").fetchone()[0] / 1e6, 2)
        rng = random.Random(1)

        # (a) búsqueda de versiones por event_id
        ids = [r[0] for r in c.execute("SELECT DISTINCT event_id FROM bench.evento_version").fetchall()]
        muestra = [rng.choice(ids) for _ in range(500)]
        sql = "SELECT event_id, updated_at, mag FROM bench.evento_version WHERE event_id = %s ORDER BY updated_at"
        for i in muestra[:20]:
            c.execute(sql, (i,)).fetchall()  # calentamiento
        base = rss_mb()
        tiempos = []
        for i in muestra:
            t0 = time.perf_counter_ns(); r = c.execute(sql, (i,)).fetchall(); tiempos.append(time.perf_counter_ns() - t0)
            assert r, i
        res["a_busqueda_versiones_sql_pk"] = {**resumen(tiempos), "tracemalloc_pico_mb": con_memoria(lambda: [c.execute(sql, (i,)).fetchall() for i in muestra]), "rss_base_mb": round(base, 1)}
        plan = " | ".join(r[0].strip() for r in c.execute("EXPLAIN " + sql, (muestra[0],)).fetchall())
        res["a_plan"] = plan[:160]

        # (b) integración geográfica
        t0 = time.perf_counter_ns()
        cat = leer_catalogo(Path(os.environ.get("CATALOGO_PATH", "/datos/paises.geojson")))
        asig = Asignador(cat)
        res["b_construccion_asignador_ms"] = round((time.perf_counter_ns() - t0) / 1e6, 1)
        puntos = [(r[0], r[1]) for r in c.execute("SELECT longitude, latitude FROM bench.evento_version ORDER BY event_id, updated_at").fetchall()]
        for p in puntos[:200]:
            asig.asignar(*p)
        base = rss_mb()
        por_punto, totales = [], []
        for _ in range(3):
            t_ini = time.perf_counter_ns()
            for p in puntos:
                t0 = time.perf_counter_ns(); asig.asignar(*p); por_punto.append(time.perf_counter_ns() - t0)
            totales.append(time.perf_counter_ns() - t_ini)
        reparto = {}
        for p in puntos[:5000]:
            k = asig.asignar(*p).resultado; reparto[k] = reparto.get(k, 0) + 1
        res["b_geo"] = {**{f"por_punto_{k}": v for k, v in resumen(por_punto).items() if k != "n"}, "total_ms_mediana": round(statistics.median(totales) / 1e6, 1),
                        "total_ms_p95": round(percentil(totales, 95) / 1e6, 1), "puntos": len(puntos), "repeticiones": 3,
                        "tracemalloc_pico_mb": con_memoria(lambda: [asig.asignar(*p) for p in puntos]), "rss_base_mb": round(base, 1), "reparto_primeros_5000": reparto}

        # (c) agregación por ventanas de 1 h
        sql_c1 = "SELECT (floor(extract(epoch FROM event_time) / 3600) * 3600000)::bigint, count(*) FROM bench.evento_version GROUP BY 1"

        def c1():
            return dict(c.execute(sql_c1).fetchall())

        def c2():
            horas = {}
            for (t,) in c.execute("SELECT event_time FROM bench.evento_version").fetchall():
                h = int(t.timestamp()) // 3600 * 3600000
                horas[h] = horas.get(h, 0) + 1
            return horas

        assert c1() == c2()  # los dos métodos dan el mismo resultado
        for nombre, f in (("c1_agregacion_sql", c1), ("c2_agregacion_python", c2)):
            base = rss_mb()
            ts = []
            for _ in range(15):
                t0 = time.perf_counter_ns(); f(); ts.append(time.perf_counter_ns() - t0)
            res[nombre] = {**resumen(ts), "tracemalloc_pico_mb": con_memoria(f), "rss_base_mb": round(base, 1), "ventanas": len(f())}
        c.execute("DROP SCHEMA bench CASCADE")
    res["rss_maximo_proceso_mb"] = round(rss_mb(), 1)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int)
    ap.add_argument("--todos", action="store_true")
    a = ap.parse_args()
    if a.todos:
        for n in bd.TAMANOS:
            p = subprocess.run([sys.executable, "-X", "utf8", os.path.abspath(__file__), "--n", str(n)], capture_output=True, text=True)
            sys.stdout.write(p.stdout)
            if p.returncode:
                sys.stderr.write(p.stderr)
                raise SystemExit(p.returncode)
        return
    print("RESULTADO " + json.dumps(medir_n(a.n), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
