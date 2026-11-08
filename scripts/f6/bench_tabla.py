"""Convierte las líneas RESULTADO de bench_medidas.py en tablas legibles (F6, 6.4). Uso: py -3.13 scripts/f6/bench_tabla.py <salida.txt>"""
import json, sys
R = [json.loads(l[10:]) for l in open(sys.argv[1], encoding="utf-8") if l.startswith("RESULTADO ")]
def fila(titulo, f):
    print(f"{titulo:<46}" + "".join(f"{f(r):>16}" for r in R))
print(f"{'':<46}" + "".join(f"{'N = ' + format(r['n'], ','):>16}" for r in R))
fila("filas / eventos distintos", lambda r: f"{r['filas']}/{r['eventos_distintos']}")
fila("tamaño de tabla + índice (MB)", lambda r: r["tabla_mb"])
print("(a) búsqueda de versiones por event_id (SQL, clave primaria), por búsqueda")
fila("  mediana / p95 (ms)", lambda r: f"{r['a_busqueda_versiones_sql_pk']['mediana_ms']}/{r['a_busqueda_versiones_sql_pk']['p95_ms']}")
fila("  pico tracemalloc (MB)", lambda r: r["a_busqueda_versiones_sql_pk"]["tracemalloc_pico_mb"])
print("(b) integración geográfica (Asignador, STRtree + covers)")
fila("  por punto mediana / p95 (ms)", lambda r: f"{r['b_geo']['por_punto_mediana_ms']}/{r['b_geo']['por_punto_p95_ms']}")
fila("  total de N puntos, mediana de 3 (ms)", lambda r: r["b_geo"]["total_ms_mediana"])
fila("  pico tracemalloc (MB)", lambda r: r["b_geo"]["tracemalloc_pico_mb"])
print("(c) agregación por ventanas de 1 h (15 repeticiones)")
for k, t in (("c1_agregacion_sql", "SQL GROUP BY"), ("c2_agregacion_python", "Python (trae filas)")):
    fila(f"  {t} mediana / p95 (ms)", lambda r, k=k: f"{r[k]['mediana_ms']}/{r[k]['p95_ms']}")
    fila(f"  {t} pico tracemalloc (MB)", lambda r, k=k: r[k]["tracemalloc_pico_mb"])
fila("RSS máximo del proceso (MB)", lambda r: r["rss_maximo_proceso_mb"])
fila("RSS base antes de (a) / de (b) (MB)", lambda r: f"{r['a_busqueda_versiones_sql_pk']['rss_base_mb']}/{r['b_geo']['rss_base_mb']}")
print("construcción del asignador (ms): " + ", ".join(str(r["b_construccion_asignador_ms"]) for r in R))
