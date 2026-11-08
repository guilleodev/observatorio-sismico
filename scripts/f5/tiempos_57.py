"""Tiempos de respuesta HTTP de la API (F5, paso 5.7, T049). SOLO LECTURA (GET a la API).

≥ 100 peticiones secuenciales por endpoint y combinación de filtros (tras 5 de calentamiento), con ventana de 24 h y con la cobertura completa, y una prueba con 4 clientes concurrentes
(el panel lanza eventos y estadísticas a la vez). Se mide desde el contenedor de pruebas (red de Compose): tiempo hasta recibir y leer TODO el cuerpo.
Uso:  python -X utf8 /scripts5/tiempos_57.py real  http://api:8000
      python -X utf8 /scripts5/tiempos_57.py escala http://api-f5-escala:8000     (API temporal sobre la base de escala; datos sintéticos de réplica)
"""

import json
import statistics
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

MODO, BASE = sys.argv[1], sys.argv[2].rstrip("/")
N, CALENTAMIENTO = 120, 5
UTC = timezone.utc
iso = lambda d: d.isoformat().replace("+00:00", "Z")


def pedir(ruta, **params):
    url = f"{BASE}{ruta}" + (("?" + urllib.parse.urlencode(params)) if params else "")
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            cuerpo = r.read()
            return (time.perf_counter() - t0) * 1000, r.status, len(cuerpo)
    except urllib.error.HTTPError as exc:
        return (time.perf_counter() - t0) * 1000, exc.code, len(exc.read())


def pct(valores, q):
    v = sorted(valores)
    return v[min(len(v) - 1, int(q * len(v)))]


salud = json.load(urllib.request.urlopen(f"{BASE}/api/salud", timeout=30))
generado = datetime.fromtimestamp(salud["generated"] / 1000, UTC)
print(f"# 5.7 T049 - tiempos HTTP ({MODO}) {datetime.now(UTC):%Y-%m-%dT%H:%M:%SZ}  ({BASE})")
print("Medido desde un contenedor en la red de Compose (Windows 11 / Docker Desktop, PostgreSQL 17 local); tiempo hasta leer todo el cuerpo. Son mediciones de ESTA máquina y de este volumen, no umbrales.")
if MODO == "real":
    fin = (generado - timedelta(hours=1)).replace(microsecond=0)
    desde_cobertura = datetime.fromtimestamp(salud["live_since"] / 1000, UTC).replace(microsecond=0)
    casos = [
        ("GET /api/salud", "/api/salud", {}),
        ("eventos · 24 h", "/api/eventos", {"start": iso(fin - timedelta(hours=24)), "end": iso(fin)}),
        ("eventos · 24 h · país USA", "/api/eventos", {"start": iso(fin - timedelta(hours=24)), "end": iso(fin), "country_id": "USA"}),
        ("eventos · 24 h · M ≥ 4,5", "/api/eventos", {"start": iso(fin - timedelta(hours=24)), "end": iso(fin), "min_mag": "4.5"}),
        ("eventos · cobertura completa", "/api/eventos", {"start": iso(desde_cobertura), "end": iso(fin)}),
        ("eventos · cobertura · sin_pais", "/api/eventos", {"start": iso(desde_cobertura), "end": iso(fin), "country_id": "sin_pais"}),
        ("estadísticas · 24 h", "/api/estadisticas", {"start": iso(fin - timedelta(hours=24)), "end": iso(fin)}),
        ("estadísticas · 24 h · país USA", "/api/estadisticas", {"start": iso(fin - timedelta(hours=24)), "end": iso(fin), "country_id": "USA"}),
        ("estadísticas · 24 h · M ≥ 4,5", "/api/estadisticas", {"start": iso(fin - timedelta(hours=24)), "end": iso(fin), "min_mag": "4.5"}),
        ("estadísticas · cobertura completa", "/api/estadisticas", {"start": iso(desde_cobertura), "end": iso(fin)}),
        ("estadísticas · cobertura · sin_pais", "/api/estadisticas", {"start": iso(desde_cobertura), "end": iso(fin), "country_id": "sin_pais"}),
    ]
    paralelas = [casos[1], casos[6]]
else:
    d = datetime(2025, 7, 15, tzinfo=UTC)
    casos = [
        ("GET /api/salud", "/api/salud", {}),
        ("eventos · 24 h de 2025 (escala)", "/api/eventos", {"start": iso(d), "end": iso(d + timedelta(days=1))}),
        ("eventos · todo 2025 (límite 5 000)", "/api/eventos", {"start": "2025-01-01T00:00:00Z", "end": "2026-01-01T00:00:00Z"}),
        ("eventos · todo 2025 · país USA", "/api/eventos", {"start": "2025-01-01T00:00:00Z", "end": "2026-01-01T00:00:00Z", "country_id": "USA"}),
        ("estadísticas · 24 h de 2025", "/api/estadisticas", {"start": iso(d), "end": iso(d + timedelta(days=1))}),
        ("estadísticas · 30 días de 2025", "/api/estadisticas", {"start": "2025-07-01T00:00:00Z", "end": "2025-07-31T00:00:00Z"}),
        ("estadísticas · todo 2025 (serie horaria omitida)", "/api/estadisticas", {"start": "2025-01-01T00:00:00Z", "end": "2026-01-01T00:00:00Z"}),
        ("estadísticas · todo 2025 · país USA", "/api/estadisticas", {"start": "2025-01-01T00:00:00Z", "end": "2026-01-01T00:00:00Z", "country_id": "USA"}),
        ("estadísticas · todo 2025 · sin_pais", "/api/estadisticas", {"start": "2025-01-01T00:00:00Z", "end": "2026-01-01T00:00:00Z", "country_id": "sin_pais"}),
    ]
    paralelas = [casos[2], casos[7]]

print(f"\n{'caso':<46}{'n':>5}{'err':>5}{'KB':>8}{'mín':>8}{'mediana':>9}{'p95':>8}{'p99':>8}{'máx':>8}   (ms)")
for nombre, ruta, params in casos:
    for _ in range(CALENTAMIENTO):
        pedir(ruta, **params)
    muestras = [pedir(ruta, **params) for _ in range(N)]
    t = [m[0] for m in muestras]
    errores = sum(1 for m in muestras if m[1] != 200)
    print(f"{nombre:<46}{len(t):>5}{errores:>5}{muestras[0][2] / 1024:>8.1f}{min(t):>8.1f}{statistics.median(t):>9.1f}{pct(t, .95):>8.1f}{pct(t, .99):>8.1f}{max(t):>8.1f}")

print("\n== 4 clientes concurrentes (el panel pide eventos y estadísticas a la vez; pool de la API = 4 conexiones) ==")
resultados: dict[str, list[float]] = {c[0]: [] for c in paralelas}
errores_conc = []


def cliente(caso, repeticiones):
    for _ in range(repeticiones):
        ms, estado, _ = pedir(caso[1], **caso[2])
        resultados[caso[0]].append(ms)
        if estado != 200:
            errores_conc.append(estado)


hilos = [threading.Thread(target=cliente, args=(paralelas[i % 2], 30)) for i in range(4)]
t0 = time.perf_counter()
for h in hilos:
    h.start()
for h in hilos:
    h.join()
print(f"120 peticiones en {time.perf_counter() - t0:.1f} s con 4 hilos; errores: {len(errores_conc)}")
for nombre, t in resultados.items():
    print(f"  {nombre:<46} n={len(t):>3} mediana {statistics.median(t):>7.1f} | p95 {pct(t, .95):>7.1f} | máx {max(t):>7.1f} ms")
