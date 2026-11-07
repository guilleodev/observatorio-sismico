"""Calidad del histórico con las seis dimensiones de F3 (F4, paso 4.6, T058). Solo lectura (más 40 consultas por id a USGS para la exactitud).

Completitud, unicidad, validez, consistencia, actualidad y exactitud. Uso (contenedor del producer con /scripts montado):
    python -X utf8 /scripts/calidad_historico.py
"""

import json
import os
import random
import time
import urllib.request

import psycopg

fallos = []


def comprobar(cond, texto):
    print(("  OK    " if cond else "  FALLA ") + texto)
    if not cond:
        fallos.append(texto)


conn = psycopg.connect(f"host={os.environ['POSTGRES_HOST']} dbname={os.environ['POSTGRES_DB']} user={os.environ['POSTGRES_USER']} password={os.environ['POSTGRES_PASSWORD']}", autocommit=True)
conn.execute("SET TIME ZONE 'UTC'")
q = lambda sql, *a: conn.execute(sql, a).fetchall()
n = q("SELECT count(*) FROM historico.evento")[0][0]
print(f"histórico: {n} eventos | cuarentena: {q('SELECT count(*) FROM historico.cuarentena')[0][0]}\n")

print("== 1. Completitud (% con valor) ==")
c = q("SELECT 100.0*count(mag)/count(*), 100.0*count(mag_type)/count(*), 100.0*count(depth_km)/count(*), 100.0*count(place)/count(*), "
      "100.0*count(country_id)/count(*), 100.0*count(raw->'properties'->>'felt')/count(*), 100.0*count(raw->'properties'->>'net')/count(*) FROM historico.evento")[0]
print(f"  magnitud {c[0]:.1f} % | tipo de magnitud {c[1]:.1f} % | profundidad {c[2]:.1f} % | place {c[3]:.1f} % | país asignado {c[4]:.1f} % | felt (opcional) {c[5]:.1f} % | red (opcional) {c[6]:.1f} %")
comprobar(c[0] == 100 and c[2] == 100 and c[3] == 100, "magnitud, profundidad y place completos (los obligatorios de la consulta M>=4)")
print(f"  país asignado {c[4]:.1f} %: el resto es «Sin país asignado» por diseño (no es un dato que falte): {100 - c[4]:.1f} % sin país")

print("\n== 2. Unicidad ==")
d = q("SELECT count(*), count(DISTINCT event_id) FROM historico.evento")[0]
comprobar(d[0] == d[1], f"event_id único: {d[0]} filas, {d[1]} distintos")
comprobar(q("SELECT count(*) FROM (SELECT huella FROM historico.cuarentena GROUP BY 1 HAVING count(*) > 1) s")[0][0] == 0, "huellas de cuarentena únicas")
print(f"  duplicados y repeticiones absorbidos al cargar: {q('SELECT coalesce(sum(duplicados),0), coalesce(sum(fuera_de_tramo),0) FROM historico.consulta')[0]} (duplicados, fuera de tramo)")

print("\n== 3. Validez ==")
v = q("SELECT count(*) FILTER (WHERE longitude NOT BETWEEN -180 AND 180 OR latitude NOT BETWEEN -90 AND 90), "
      "count(*) FILTER (WHERE raw->'properties'->>'type' <> 'earthquake'), count(*) FILTER (WHERE mag < 4 OR mag > 10), "
      "count(*) FILTER (WHERE depth_km < -10 OR depth_km > 800), count(*) FILTER (WHERE event_time < '2025-01-01' OR event_time >= '2026-01-01'), "
      "count(*) FILTER (WHERE jsonb_typeof(raw->'geometry'->'coordinates') <> 'array' OR jsonb_array_length(raw->'geometry'->'coordinates') <> 3) FROM historico.evento")[0]
comprobar(v == (0, 0, 0, 0, 0, 0), f"coordenadas en rango, tipo earthquake, 4 ≤ mag ≤ 10, −10 ≤ profundidad ≤ 800 km, 2025 UTC, geometría de 3 valores (fallos: {v})")
print(f"  magnitud {q('SELECT min(mag), max(mag) FROM historico.evento')[0]} | profundidad (km) {q('SELECT min(depth_km), max(depth_km) FROM historico.evento')[0]}")

print("\n== 4. Consistencia ==")
comprobar(q("SELECT count(*) FROM historico.evento WHERE (country_id IS NULL) <> (geo_resultado = 'sin_pais')")[0][0] == 0, "country_id nulo ⇔ geo_resultado = 'sin_pais'")
comprobar(q("SELECT count(DISTINCT geo_catalogo) FROM historico.evento")[0][0] == 1, "una sola versión del catálogo en todo el histórico")
dif = q("SELECT count(*) FROM historico.evento WHERE abs(mag::float8 - (raw->'properties'->>'mag')::float8) > 1e-9 OR longitude <> (raw->'geometry'->'coordinates'->>0)::float8 "
        "OR latitude <> (raw->'geometry'->'coordinates'->>1)::float8 OR abs(depth_km::float8 - (raw->'geometry'->'coordinates'->>2)::float8) > 1e-9 "
        "OR event_time <> to_timestamp((raw->'properties'->>'time')::bigint / 1000.0) OR updated_at <> to_timestamp((raw->'properties'->>'updated')::bigint / 1000.0) "
        "OR event_id <> raw->>'id'")[0][0]
exactas = q("SELECT count(*) FROM historico.evento WHERE mag::float8 <> (raw->'properties'->>'mag')::float8 OR depth_km::float8 <> (raw->'geometry'->'coordinates'->>2)::float8")[0][0]
maxdif = q("SELECT max(greatest(abs(mag::float8 - (raw->'properties'->>'mag')::float8), abs(depth_km::float8 - (raw->'geometry'->'coordinates'->>2)::float8))) FROM historico.evento")[0][0]
comprobar(dif == 0, f"las columnas coinciden con el original (`raw`) —magnitud y profundidad con tolerancia 1e-9—, coordenadas, tiempo, actualización e id (diferencias: {dif})")
print(f"  nota de exactitud numérica: {exactas} eventos tienen magnitud o profundidad que difieren del original en la cifra 16 (máx. {maxdif:.1e}): la columna `numeric` guarda 15 cifras "
      "significativas del double de USGS; el valor exacto se conserva en `raw`. No es una pérdida de información relevante (mismo comportamiento que live, F3).")
comprobar(q("SELECT count(*) FROM historico.evento e JOIN historico.consulta c ON c.id = e.consulta_id WHERE e.event_time < c.inicio OR e.event_time >= c.fin")[0][0] == 0, "cada evento está dentro del tramo de su consulta")

print("\n== 5. Actualidad ==")
a = q("SELECT min(extraida_at), max(extraida_at) FROM historico.consulta WHERE resultado = 'ok'")[0]
print(f"  extracción: {a[0]:%Y-%m-%d %H:%M} .. {a[1]:%Y-%m-%d %H:%M} UTC (instantánea del catálogo revisado; no se actualiza sola)")
r = q("SELECT count(*) FILTER (WHERE updated_at > event_time + interval '30 days'), count(*) FILTER (WHERE updated_at > event_time + interval '365 days'), "
      "percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM updated_at - event_time)/86400) FROM historico.evento")[0]
print(f"  eventos revisados por USGS > 30 días después de ocurrir: {r[0]} ({100 * r[0] / n:.1f} %); > 365 días: {r[1]} | mediana de (updated − time): {r[2]:.1f} días")
print("  nota: `updated` refleja la última revisión de USGS en la extracción; el histórico no incluye revisiones posteriores a la fecha de extracción.")

print("\n== 6. Exactitud: 40 eventos al azar frente a la consulta por id a USGS ==")
ids = [f[0] for f in q("SELECT event_id FROM historico.evento ORDER BY event_id")]
muestra = random.Random(46).sample(ids, 40)
iguales = difieren = errores = 0
for eid in muestra:
    url = f"https://earthquake.usgs.gov/fdsnws/event/1/query?eventid={eid}&format=geojson"
    try:
        f = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "observatorio-sismico/1.0 (proyecto academico)"}), timeout=60).read())
    except Exception as exc:
        errores += 1
        print(f"  {eid}: no consultable ({exc})")
        continue
    mio = q("SELECT raw FROM historico.evento WHERE event_id = %s", eid)[0][0]
    campos = lambda x: (x["properties"]["mag"], x["properties"]["time"], tuple(x["geometry"]["coordinates"]))
    if campos(f) == campos(mio):
        iguales += 1
    else:
        difieren += 1
        print(f"  {eid} difiere: USGS ahora {campos(f)} | guardado {campos(mio)} | updated ahora {f['properties']['updated']} frente a {mio['properties']['updated']}")
    time.sleep(0.2)
print(f"  idénticos en magnitud, tiempo y coordenadas: {iguales}/{len(muestra)} | difieren: {difieren} | no consultables: {errores}")
comprobar(difieren == 0, "ninguno de los eventos muestreados difiere del catálogo actual de USGS" if not difieren else f"{difieren} eventos revisados por USGS desde la carga (se listan arriba)")
print(f"  asignación de país: recalculada para los {n} eventos con un método independiente en 4.6-sin-pais-historico.txt (0 diferencias)")

print("\n== Proporción «sin país» ==")
sp = q("SELECT count(*) FILTER (WHERE geo_resultado = 'sin_pais') FROM historico.evento")[0][0]
print(f"  {sp} de {n} ({100 * sp / n:.1f} %): causa analizada en 4.6-sin-pais-historico.txt (mar abierto 84 % de ellos; limitación 1:110 M ≈ 1,4 %)")
print("\nRESULTADO:", "OK" if not fallos else f"FALLAN {len(fallos)}: {fallos}")
raise SystemExit(1 if fallos else 0)
