"""Tablas legibles de bench_comparaciones.py (F6, 6.5). Uso: py -3.13 -X utf8 scripts/f6/bench_tabla_comparaciones.py <salida.txt>"""
import json, sys
R = [json.loads(l[10:]) for l in open(sys.argv[1], encoding="utf-8") if l.startswith("RESULTADO ")]
f = lambda t, g: print(f"{t:<52}" + "".join(f"{g(r):>20}" for r in R))
print(f"{'tiempo por búsqueda: mediana / p95 (ms)':<52}" + "".join(f"{'N = ' + format(r['n'], ','):>20}" for r in R))
for k, t in (("secuencial", "lista recorrida (secuencial)"), ("diccionario", "diccionario (hash)"), ("sql_sin_indice", "SQL sin clave ni índice"), ("sql_con_indice", "SQL con índice B-tree (event_id)"), ("sql_clave_primaria", "SQL con clave primaria (event_id, updated_at)")):
    for caso in ("media", "mejor", "peor_ausente"):
        if caso in R[0][k]:
            f(f"  {t} · {caso}", lambda r, k=k, caso=caso: f"{r[k][caso]['mediana_ms']}/{r[k][caso]['p95_ms']}")
print("estructuras")
f("  diccionario: construcción (ms)", lambda r: r["dic_construccion_ms"])
f("  diccionario: memoria extra tracemalloc (MB)", lambda r: r["dic_memoria_tracemalloc_mb"])
f("  creación del índice B-tree (ms)", lambda r: r["indice_btree_creacion_ms"])
for k in ("tabla_heap", "indice_event_id", "indice_clave_primaria"):
    f(f"  disco {k} (KB)", lambda r, k=k: round(r["disco_bytes"][k] / 1024))
f("  bytes por fila: heap / índice event_id / PK", lambda r: "/".join(str(round(r["disco_bytes"][k] / r["filas"], 1)) for k in ("tabla_heap", "indice_event_id", "indice_clave_primaria")))
f("RSS máximo del proceso (MB)", lambda r: r["rss_maximo_proceso_mb"])
print("planes (N=100000):"); [print("  " + k + ": " + R[-1][k]) for k in ("sql_sin_indice_plan", "sql_con_indice_plan", "sql_clave_primaria_plan")]
