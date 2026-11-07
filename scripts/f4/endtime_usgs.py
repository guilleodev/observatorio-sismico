"""Comportamiento de `starttime` / `endtime` de USGS en el límite (F4, paso 4.4, T037). SOLO `count` (no descarga datos). Solo lectura.

Parte A (resolución): comprueba, con un terremoto conocido (Birmania, 2025-03-28 06:20:52.715 UTC, id us7000pn9s), si USGS descarta los
milisegundos de los parámetros de tiempo. Parte B (extremos): con terremotos de la base ya cargada cuyo instante cae en un segundo exacto
(milisegundos = 000), cuenta ventanas [T-1 s, T] y [T, T+1 s] para ver si `endtime` y `starttime` son inclusivos.
Uso (en el contenedor, con la carga histórica hecha):  python -X utf8 /scripts/endtime_usgs.py
"""

import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import psycopg

BASE = "https://earthquake.usgs.gov/fdsnws/event/1/count"
UA = {"User-Agent": "observatorio-sismico/1.0 (proyecto academico de Big Data)"}


def contar(a: datetime, b: datetime, ms: bool = True) -> int:
    f = (lambda d: d.strftime("%Y-%m-%dT%H:%M:%S.") + f"{d.microsecond // 1000:03d}") if ms else (lambda d: d.strftime("%Y-%m-%dT%H:%M:%S"))
    q = urllib.parse.urlencode([("format", "geojson"), ("starttime", f(a)), ("endtime", f(b)), ("minmagnitude", "4"), ("eventtype", "earthquake")])
    with urllib.request.urlopen(urllib.request.Request(f"{BASE}?{q}", headers=UA), timeout=60) as r:
        return json.loads(r.read())["count"]


d = timedelta
print("== Parte A: ¿se tienen en cuenta los milisegundos de los parámetros? ==")
T = datetime.fromtimestamp(1743142852.715, tz=timezone.utc)
print(f"terremoto de referencia: us7000pn9s, time = {T.isoformat(timespec='milliseconds')}")
for nombre, a, b in [("[T-10ms, T+10ms]  (lo contiene con precisión de ms)", T - d(milliseconds=10), T + d(milliseconds=10)),
                     ("[T, T+1 s]", T, T + d(seconds=1)), ("[T-1 s, T]", T - d(seconds=1), T),
                     ("[06:20:52.000, 06:20:52.999]", T.replace(microsecond=0), T.replace(microsecond=999000)),
                     ("[06:20:52.999, 06:20:53.000]", T.replace(microsecond=999000), T.replace(microsecond=0) + d(seconds=1)),
                     ("[06:20:52, 06:20:53] (segundos enteros)", T.replace(microsecond=0), T.replace(microsecond=0) + d(seconds=1)),
                     ("[06:20:53, 06:20:54] (segundos enteros)", T.replace(microsecond=0) + d(seconds=1), T.replace(microsecond=0) + d(seconds=2))]:
    print(f"  {nombre}: count={contar(a, b)}")
print("Lectura: el evento solo se cuenta si la ventana llega a 06:20:53 y empieza antes: USGS descarta la parte de milisegundos de los parámetros,\n"
      "por eso el cargador usa siempre segundos enteros.")

print("\n== Parte B: extremos con terremotos de la carga cuyo instante es un segundo exacto ==")
conninfo = f"host={os.environ['POSTGRES_HOST']} dbname={os.environ['POSTGRES_DB']} user={os.environ['POSTGRES_USER']} password={os.environ['POSTGRES_PASSWORD']}"
with psycopg.connect(conninfo) as conn:
    filas = conn.execute("SELECT event_id, event_time FROM historico.evento WHERE extract(milliseconds FROM event_time)::int % 1000 = 0 "
                         "ORDER BY event_id LIMIT 4").fetchall()
if not filas:
    print("  (la carga no contiene terremotos en segundo exacto)")
for event_id, t in filas:
    t = t.astimezone(timezone.utc)
    print(f"  {event_id} time={t.isoformat(timespec='milliseconds')} | [T-1 s, T] (T = endtime): count={contar(t - d(seconds=1), t, ms=False)} | "
          f"[T, T+1 s] (T = starttime): count={contar(t, t + d(seconds=1), ms=False)} | [T, T]: count={contar(t, t, ms=False)}")
print("Lectura: si [T-1 s, T] cuenta el evento, `endtime` es inclusivo; si [T, T+1 s] también, `starttime` lo es (el evento sale en dos ventanas contiguas).")
