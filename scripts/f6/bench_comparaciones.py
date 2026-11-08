"""Comparaciones de 6.5 (F6, T038; FR-021, SC-010): búsqueda secuencial frente a diccionario, y consulta sin índice frente a con índice/clave.
Se ejecuta DENTRO del contenedor de medida con `bash scripts/f6/bench_ejecutar.sh bench_comparaciones.py` (PostgreSQL temporal, datos sintéticos de `bench_datos`).
Un proceso por tamaño (`--n N`); `--todos` los lanza. Búsqueda de TODAS las versiones de un event_id. Casos:
  media  = ids elegidos al azar entre los que existen;  mejor = el id de la primera fila;  peor = un id inexistente (obliga a recorrer todo en una búsqueda secuencial).
  (1) lista de tuplas recorrida entera (O(n));  (2) diccionario event_id -> lista de filas (O(1) esperado; el peor caso teórico O(n) por colisiones no se provoca);
  (3) SQL sobre una tabla SIN clave ni índice (recorrido secuencial);  (4) SQL con índice B-tree creado sobre event_id en esa misma tabla;  (5) SQL con la clave primaria (event_id, updated_at).
Memoria: pico de tracemalloc de CONSTRUIR cada estructura de Python (el recorrido secuencial no reserva nada) y tamaños en disco de tabla e índices (pg_relation_size).
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
import bench_datos as bd  # noqa: E402


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, max(0, round(p / 100 * (len(xs) - 1))))]


def stats(ns):
    ms = [t / 1e6 for t in ns]
    return {"n": len(ms), "mediana_ms": round(statistics.median(ms), 4), "p95_ms": round(pct(ms, 95), 4), "max_ms": round(max(ms), 4)}


def tiempos(f, argumentos):
    out = []
    for a in argumentos:
        t0 = time.perf_counter_ns(); r = f(a); out.append(time.perf_counter_ns() - t0)
    return out, r


def medir(n: int) -> dict:
    import psycopg

    res = {"n": n}
    rng = random.Random(7)
    with psycopg.connect(bd.conninfo_permitido(), autocommit=True) as c:
        bd.cargar(n, c)                                              # bench.evento_version: con clave primaria (event_id, updated_at)
        c.execute("CREATE TABLE bench.sin_clave AS SELECT * FROM bench.evento_version")   # sin clave, sin índices
        c.execute("ANALYZE bench.sin_clave")
        filas = c.execute("SELECT event_id, updated_at, event_time, mag, depth_km, longitude, latitude, place, origen FROM bench.evento_version ORDER BY event_id, updated_at").fetchall()
        ids = sorted({f[0] for f in filas})
        rng.shuffle(filas)                                           # orden de llegada, no ordenado por id (una lista ordenada permitiría búsqueda binaria: otra estructura)
        n_busq = 100 if n >= 100_000 else 200
        azar = [rng.choice(ids) for _ in range(n_busq)]
        ausentes = ["bench-9999999"] * n_busq
        primera = [filas[0][0]] * n_busq

        def secuencial(i):
            return [f for f in filas if f[0] == i]

        t0 = time.perf_counter_ns()
        tracemalloc.start()
        dic = {}
        for f in filas:
            dic.setdefault(f[0], []).append(f)
        res["dic_construccion_ms"] = round((time.perf_counter_ns() - t0) / 1e6, 2)
        res["dic_memoria_tracemalloc_mb"] = round(tracemalloc.get_traced_memory()[1] / 1e6, 2)   # solo el diccionario y sus listas (las filas ya existían)
        tracemalloc.stop()

        res["secuencial"] = {k: stats(tiempos(secuencial, v)[0]) for k, v in (("media", azar), ("mejor", primera), ("peor_ausente", ausentes))}
        res["diccionario"] = {k: stats(tiempos(lambda i: dic.get(i, []), v)[0]) for k, v in (("media", azar), ("mejor", primera), ("peor_ausente", ausentes))}
        assert [secuencial(i) for i in azar[:5]] == [dic[i] for i in azar[:5]]

        def sql(tabla):
            q = f"SELECT event_id, updated_at, mag FROM bench.{tabla} WHERE event_id = %s ORDER BY updated_at"
            return lambda i: c.execute(q, (i,)).fetchall()

        def plan(tabla):
            return " | ".join(r[0].strip() for r in c.execute(f"EXPLAIN SELECT * FROM bench.{tabla} WHERE event_id = 'bench-0000001'").fetchall())[:110]

        for k in range(20):
            sql("sin_clave")(azar[k])
        res["sql_sin_indice"] = {k: stats(tiempos(sql("sin_clave"), v)[0]) for k, v in (("media", azar), ("peor_ausente", ausentes))}
        res["sql_sin_indice_plan"] = plan("sin_clave")
        t0 = time.perf_counter_ns()
        c.execute("CREATE INDEX idx_sin_clave_event_id ON bench.sin_clave (event_id)")
        c.execute("ANALYZE bench.sin_clave")
        res["indice_btree_creacion_ms"] = round((time.perf_counter_ns() - t0) / 1e6, 2)
        res["sql_con_indice"] = {k: stats(tiempos(sql("sin_clave"), v)[0]) for k, v in (("media", azar), ("peor_ausente", ausentes))}
        res["sql_con_indice_plan"] = plan("sin_clave")
        res["sql_clave_primaria"] = {k: stats(tiempos(sql("evento_version"), v)[0]) for k, v in (("media", azar), ("peor_ausente", ausentes))}
        res["sql_clave_primaria_plan"] = plan("evento_version")

        tam = lambda rel: c.execute("SELECT pg_relation_size(%s)", (rel,)).fetchone()[0]
        res["disco_bytes"] = {"tabla_heap": tam("bench.sin_clave"), "indice_event_id": tam("bench.idx_sin_clave_event_id"), "indice_clave_primaria": tam("bench.evento_version_pkey"),
                              "heap_con_pk": tam("bench.evento_version")}
        res["filas"] = n
        res["eventos_distintos"] = len(ids)
        c.execute("DROP SCHEMA bench CASCADE")
    res["rss_maximo_proceso_mb"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)
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
    print("RESULTADO " + json.dumps(medir(a.n), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
