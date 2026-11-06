"""Mediciones de rendimiento de la asignación de país (F4, paso 4.3, T025). Solo lectura; las inserciones de la parte 4 se REVIERTEN.

NO se declara ningún umbral como cumplido: SC-011 tiene los umbrales «pendientes de medición». Aquí solo se registran los valores observados
y las condiciones de la medición; los umbrales se proponen después y los confirma la persona estudiante.
Uso (en el contenedor, con backend en /app): PYTHONPATH=/app/src:/app/tests python -X utf8 /scripts/medir_asignacion.py
"""

import asyncio
import os
import platform
import random
import statistics
import sys
import time
import tracemalloc
from pathlib import Path

import psycopg
import shapely
from shapely import make_valid
from shapely.geometry import Point, shape

from fixtures.mensajes import construir_evento, construir_mensaje
from observatorio.config import ConfigPostgres, RUTA_CATALOGO_DEFECTO
from observatorio.consumer.mensaje import clasificar_mensaje
from observatorio.consumer.repositorio import RepositorioEventos
from observatorio.geo.asignador import Asignador
from observatorio.geo.catalogo import leer_catalogo

RUTA = Path(os.environ.get("CATALOGO_PATH", RUTA_CATALOGO_DEFECTO))


def resumen_ns(muestras, etiqueta):
    m = sorted(muestras)
    p = lambda q: m[min(len(m) - 1, int(q * len(m)))]
    print(f"  {etiqueta}: n={len(m)} | media={statistics.fmean(m) / 1000:.1f} µs | mediana={statistics.median(m) / 1000:.1f} µs | "
          f"p95={p(0.95) / 1000:.1f} µs | p99={p(0.99) / 1000:.1f} µs | máx={m[-1] / 1000:.1f} µs")


def tiempo_ns(f, *a):
    t = time.perf_counter_ns()
    f(*a)
    return time.perf_counter_ns() - t


print(f"== Entorno == Python {sys.version.split()[0]} | shapely {shapely.__version__} (GEOS {shapely.geos_version_string}) | {platform.machine()} | CPU lógicas: {os.cpu_count()} | contenedor Docker (Windows 11, Docker Desktop)")
print("Las cifras dependen de la máquina y de la carga del momento: son observaciones de esta ejecución, no garantías.\n")

print("== 1. Arranque: lectura y validación del catálogo, y construcción del índice ==")
lecturas = [tiempo_ns(leer_catalogo, RUTA) for _ in range(5)]
catalogo = leer_catalogo(RUTA)
construcciones = []
for _ in range(5):
    construcciones.append(tiempo_ns(Asignador, catalogo))
tracemalloc.start()
asignador = Asignador(catalogo)
_, pico = tracemalloc.get_traced_memory()
tracemalloc.stop()
print(f"  leer_catalogo (JSON de {RUTA.stat().st_size / 1024:.0f} KiB, validación estructural): mediana {statistics.median(lecturas) / 1e6:.0f} ms (5 repeticiones)")
print(f"  Asignador (177 polígonos, make_valid de {len(asignador.reparadas)} reparadas, STRtree): mediana {statistics.median(construcciones) / 1e6:.0f} ms (5 repeticiones)")
print(f"  memoria Python adicional al construir el índice (tracemalloc, pico): {pico / 1024 / 1024:.1f} MiB")

print("\n== 2. Tiempo por llamada a asignar() ==")
rnd = random.Random(42)
globo = [(rnd.uniform(-180, 180), rnd.uniform(-90, 90)) for _ in range(20000)]
conninfo = ConfigPostgres.desde_entorno().conninfo()
with psycopg.connect(conninfo) as conn:
    reales = [(r[0], r[1]) for r in conn.execute("SELECT longitude, latitude FROM live.evento_actual").fetchall()]
for p in globo[:2000] + reales * 5:  # calentamiento
    asignador.asignar(*p)
resumen_ns([tiempo_ns(asignador.asignar, *p) for p in reales], f"eventos reales de live ({len(reales)} puntos, sobre todo EE. UU.)")
resumen_ns([tiempo_ns(asignador.asignar, *p) for p in globo], "puntos aleatorios del globo (20 000; ~2/3 mar)")
t = time.perf_counter()
for p in globo:
    asignador.asignar(*p)
dt = time.perf_counter() - t
print(f"  rendimiento sostenido: {len(globo) / dt:,.0f} asignaciones/s ({dt / len(globo) * 1e6:.1f} µs por punto, incluida la sobrecarga del bucle)")

print("\n== 3. Índice espacial (STRtree) frente a recorrido secuencial de los 177 polígonos ==")
geoms = sorted((c, make_valid(g) if not g.is_valid else g) for c, g in ((c, shape(s)) for c, s in catalogo.geometrias.items()))
muestra = globo[:2000]


def secuencial(lon, lat):
    pt = Point(lon, lat)
    for c, g in geoms:
        if g.covers(pt):
            return c
    return None


t = time.perf_counter()
for p in muestra:
    secuencial(*p)
seq = (time.perf_counter() - t) / len(muestra)
t = time.perf_counter()
for p in muestra:
    asignador.asignar(*p)
idx = (time.perf_counter() - t) / len(muestra)
print(f"  recorrido secuencial (hasta el primer polígono que cubre; los puntos del mar recorren los 177): {seq * 1e6:.1f} µs por punto")
print(f"  STRtree + covers: {idx * 1e6:.1f} µs por punto | factor: {seq / idx:.1f}×  (n=2 000 puntos del globo)")
print("  Nota: con 177 polígonos el índice ya compensa; el coste de cada `covers` crece con la complejidad del polígono, no con el número de países.")

print("\n== 4. Coste de la asignación dentro del guardado del consumidor (PostgreSQL real, transacción revertida) ==")


def mensaje(i, lon, lat):
    ev = construir_evento(1, ahora=1_793_000_000_000)
    ev["id"] = f"prueba-m{i:04d}"
    ev["geometry"]["coordinates"] = [lon, lat, 10.0]
    return clasificar_mensaje(__import__("json").dumps(construir_mensaje(ev, ahora=1_793_100_000_000)).encode()).evento


async def medir_guardado(con_asignador, puntos):
    tiempos = []
    async with await psycopg.AsyncConnection.connect(conninfo) as conn:
        async with conn.transaction(force_rollback=True):
            repo = RepositorioEventos(conn, asignador if con_asignador else None)
            for i, (lon, lat) in enumerate(puntos):
                e = mensaje(i, lon, lat)
                t0 = time.perf_counter_ns()
                await repo.guardar_version(e, "t", 0, i)
                tiempos.append(time.perf_counter_ns() - t0)
    return tiempos


puntos = reales[:300] if len(reales) >= 300 else (reales * 2)[:300]
sin = asyncio.run(medir_guardado(False, puntos))
con = asyncio.run(medir_guardado(True, puntos))
resumen_ns(sin, "guardar_version SIN asignación (país nulo)")
resumen_ns(con, "guardar_version CON asignación de país")
print(f"  sobrecoste de la asignación en la mediana: {(statistics.median(con) - statistics.median(sin)) / 1000:.1f} µs por evento (ruido de la base incluido)")

print("\n== Referencia para SC-011 (sin umbrales aprobados) ==")
print("  intervalo de consulta del productor: 60 s; volumen en vivo observado: del orden de 1 evento por minuto.")
print("  Los umbrales objetivo de SC-011 están PENDIENTES DE MEDICIÓN y los confirma la persona estudiante; este informe no declara ninguno cumplido.")
