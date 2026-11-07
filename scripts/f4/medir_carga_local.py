"""Medición de la carga histórica completa DESDE ARCHIVOS LOCALES (F4, paso 4.4, SC-011) y reconstrucción reproducible. Solo lee la base real.

Crea una BASE TEMPORAL (`obs_medida_f4`), sirve los 12 archivos originales exportados (data/historico) con el servidor FDSN simulado en el mismo
contenedor (sin red) y ejecuta la orden de carga real contra esa base temporal. Mide el tiempo y comprueba que el resultado es idéntico al de la
base real (mismos eventos, mismas fechas de actualización y mismos países). Borra solo la base temporal. Uso (contenedor de pruebas):
    python -X utf8 /scripts/medir_carga_local.py
"""

import gzip
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import psycopg

sys.path.insert(0, "/app/tests")
sys.path.insert(0, "/app/src")
from fixtures.fdsn_simulado import ServidorFdsn  # noqa: E402
from observatorio.config import ConfigPostgres  # noqa: E402
from observatorio.geo.catalogo import leer_catalogo, volcar  # noqa: E402

TEMPORAL = "obs_medida_f4"
real = ConfigPostgres.desde_entorno()
conninfo_real = real.conninfo()
conninfo_temp = conninfo_real.replace(f"dbname={real.base}", f"dbname={TEMPORAL}")
assert TEMPORAL != real.base
HUELLA = "SELECT count(*) || ' ' || md5(string_agg(event_id || updated_at::text || coalesce(country_id, '-') || geo_resultado, '|' ORDER BY event_id)) FROM historico.evento"


def linea(texto=""):
    print(texto, flush=True)


archivos = sorted(Path("/exportacion").glob("*.geojson.gz"))
entradas = []
for a in archivos:
    for f in json.loads(gzip.decompress(a.read_bytes()))["features"]:
        entradas.append((f["properties"]["time"], f))
linea(f"# 4.4 SC-011 - carga completa desde archivos locales {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}")
linea(f"{len(archivos)} archivos originales exportados ({sum(a.stat().st_size for a in archivos) / 1e6:.2f} MB comprimidos) -> {len(entradas)} features")

with psycopg.connect(conninfo_real, autocommit=True) as c:
    c.execute(f'DROP DATABASE IF EXISTS "{TEMPORAL}"')  # solo la base temporal de un ensayo anterior
    c.execute(f'CREATE DATABASE "{TEMPORAL}"')
try:
    with psycopg.connect(conninfo_temp, autocommit=True) as c:
        for nombre in ("001_esquema_live.sql", "002_esquema_f3.sql", "003_esquema_f4.sql"):
            c.execute((Path("/sql") / nombre).read_text(encoding="utf-8"))
        volcar(c, leer_catalogo(Path("/datos/paises.geojson")))
    with psycopg.connect(conninfo_real) as c:
        huella_real = c.execute(HUELLA).fetchone()[0]
    with ServidorFdsn(entradas) as servidor:
        entorno = dict(os.environ, POSTGRES_DB=TEMPORAL, HISTORICO_URL=servidor.url, HISTORICO_ANIO="2025", HISTORICO_MAX_REINTENTOS="0",
                       CATALOGO_PATH="/datos/paises.geojson", HISTORICO_EXPORT_DIR="/tmp/no_existe", PYTHONPATH="/app/src")
        orden = [sys.executable, "-m", "observatorio.historico.cargar"]
        tiempos = []
        for repeticion in (1, 2, 3):
            if repeticion > 1:  # repite desde cero en la misma base temporal: vacía SOLO las tablas de historico de la base temporal
                with psycopg.connect(conninfo_temp, autocommit=True) as c:
                    c.execute("TRUNCATE historico.cuarentena, historico.evento, historico.archivo, historico.consulta RESTART IDENTITY")
            t0 = time.perf_counter()
            p = subprocess.run(orden, env=entorno, capture_output=True, text=True)
            dt = time.perf_counter() - t0
            resumen = json.loads([x for x in p.stdout.splitlines() if x.startswith("RESUMEN")][-1][8:])
            tiempos.append(dt)
            linea(f"  repetición {repeticion}: {dt:.2f} s en total (proceso completo, incl. arranque de Python y del índice espacial) | código de salida {p.returncode} | "
                  f"eventos nuevos {resumen['eventos_nuevos']} | consultas al servidor local {resumen['peticiones_http']} | "
                  f"asignación media {resumen['asignacion_media_us']} µs, máxima {resumen['asignacion_max_ms']} ms ({resumen['asignaciones']} asignaciones)")
            assert p.returncode == 0 and resumen["eventos_nuevos"] == len(entradas)
    with psycopg.connect(conninfo_temp) as c:
        huella_temp = c.execute(HUELLA).fetchone()[0]
    linea(f"\nmediana de {len(tiempos)} repeticiones: {sorted(tiempos)[1]:.2f} s | mínimo {min(tiempos):.2f} s | máximo {max(tiempos):.2f} s")
    linea(f"huella (recuento + md5 de ids, updated, país y resultado) de la base real:      {huella_real}")
    linea(f"huella de la reconstrucción desde los archivos originales (base temporal):      {huella_temp}")
    assert huella_real == huella_temp, "la reconstrucción desde los archivos no coincide con la base real"
    linea("RESULTADO: OK - reconstruir el histórico desde los archivos originales da exactamente el mismo contenido que la base real")
finally:
    with psycopg.connect(conninfo_real, autocommit=True) as c:
        c.execute(f'DROP DATABASE IF EXISTS "{TEMPORAL}"')
    linea(f"base temporal {TEMPORAL} eliminada")
