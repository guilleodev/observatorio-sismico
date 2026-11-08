"""Matriz del paso 5.2 contra la API REAL desplegada (F5, T015). SOLO LECTURA (GET a la API y SELECT a la base).

El oráculo es independiente de la API: lee las filas de `live.evento_actual` una vez y calcula los bloques en Python (comparaciones con los bordes).
Las ventanas terminan en un instante FIJO anterior al último evento para que la ingesta en curso no altere la comparación.
Uso (contenedor de pruebas):  python /scripts5/matriz_52.py [http://api:8000]
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import psycopg

API = (sys.argv[1] if len(sys.argv) > 1 else "http://api:8000").rstrip("/")
UTC = timezone.utc
BORDES_MAG, BORDES_PROF = (0, 1, 2, 3, 4, 5, 6, 7, 8), (10, 30, 70, 150, 300, 500)
fallos = []


def comprobar(cond, texto):
    print(("  OK    " if cond else "  FALLA ") + texto)
    if not cond:
        fallos.append(texto)


def get(ruta, **params):
    url = f"{API}{ruta}" + (("?" + urllib.parse.urlencode(params)) if params else "")
    try:
        with urllib.request.urlopen(urllib.request.Request(url), timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read())


conn = psycopg.connect(f"host={os.environ['POSTGRES_HOST']} dbname={os.environ['POSTGRES_DB']} user={os.environ['POSTGRES_USER']} password={os.environ['POSTGRES_PASSWORD']}", autocommit=True)
conn.execute("SET TIME ZONE 'UTC'")
filas = conn.execute("SELECT event_id, event_time, mag, depth_km, country_id, geo_resultado, retirado FROM live.evento_actual").fetchall()
t_max = max(f[1] for f in filas)
fin = (t_max - timedelta(hours=1)).replace(microsecond=0)
inicio = fin - timedelta(hours=36)
iso = lambda d: d.isoformat().replace("+00:00", "Z")
print(f"# 5.2 T015 - matriz contra la API real {datetime.now(UTC):%Y-%m-%dT%H:%M:%SZ}  ({API})")
print(f"filas en live.evento_actual: {len(filas)} (retiradas: {sum(1 for f in filas if f[6])}) | ventana fija: [{iso(inicio)}, {iso(fin)})\n")

mags = [float(f[2]) for f in filas if f[2] is not None]
profs = [float(f[3]) for f in filas if f[3] is not None]
print("== 0. Rango real de los datos (justifica los bordes provisionales de los intervalos) ==")
print(f"  magnitud: {min(mags):.2f} .. {max(mags):.2f} (nulos: {sum(1 for f in filas if f[2] is None)}) | profundidad km: {min(profs):.2f} .. {max(profs):.2f} (nulos: {sum(1 for f in filas if f[3] is None)})")
print(f"  eventos con magnitud < 0: {sum(1 for m in mags if m < 0)} | con profundidad < 0: {sum(1 for p in profs if p < 0)} | magnitud ≥ 8: {sum(1 for m in mags if m >= 8)} | profundidad ≥ 500: {sum(1 for p in profs if p >= 500)}")
dist_prof = [sum(1 for p in profs if (a is None or p >= a) and (b is None or p < b)) for a, b in zip((None, *BORDES_PROF), (*BORDES_PROF, None))]
print(f"  reparto por los intervalos de profundidad propuestos: {dist_prof} (sin intervalos con todo el peso: confirma los bordes)\n")

paises = {}
for f in filas:
    if f[4]:
        paises[f[4]] = paises.get(f[4], 0) + 1
top = sorted(paises, key=lambda c: -paises[c])


def oraculo(start, end, min_mag=None, pais=None):
    sel = [f for f in filas if not f[6] and start <= f[1] < end
           and (pais is None or (f[5] == "sin_pais" if pais == "sin_pais" else f[4] == pais))]
    base_nulos = sum(1 for f in sel if f[2] is None)
    if min_mag is not None:
        sel = [f for f in sel if f[2] is not None and float(f[2]) >= min_mag]
    por_pais, sin_pais, sin_asignar = {}, 0, 0
    for f in sel:
        if f[5] is None:
            sin_asignar += 1
        elif f[5] == "sin_pais":
            sin_pais += 1
        else:
            por_pais[f[4]] = por_pais.get(f[4], 0) + 1
    idx = lambda v, bordes: sum(1 for b in bordes if v >= b)
    mag, prof = [0] * 10, [0] * 7
    for f in sel:
        if f[2] is not None:
            mag[idx(float(f[2]), BORDES_MAG)] += 1
        if f[3] is not None:
            prof[idx(float(f[3]), BORDES_PROF)] += 1
    return dict(total=len(sel), sin_magnitud=base_nulos, pais=por_pais, sin_pais=sin_pais, sin_asignar=sin_asignar, mag=mag, prof=prof,
                mag_nulos=sum(1 for f in sel if f[2] is None), prof_nulos=sum(1 for f in sel if f[3] is None))


casos = [
    ("ventana fija de 36 h", dict(start=iso(inicio), end=iso(fin)), dict(start=inicio, end=fin)),
    ("min_mag=3", dict(start=iso(inicio), end=iso(fin), min_mag="3"), dict(start=inicio, end=fin, min_mag=3)),
    ("min_mag=4", dict(start=iso(inicio), end=iso(fin), min_mag="4"), dict(start=inicio, end=fin, min_mag=4)),
    ("min_mag=5.5", dict(start=iso(inicio), end=iso(fin), min_mag="5.5"), dict(start=inicio, end=fin, min_mag=5.5)),
    (f"country_id={top[0]}", dict(start=iso(inicio), end=iso(fin), country_id=top[0]), dict(start=inicio, end=fin, pais=top[0])),
    (f"country_id={top[0].lower()} (minúsculas)", dict(start=iso(inicio), end=iso(fin), country_id=top[0].lower()), dict(start=inicio, end=fin, pais=top[0])),
    (f"country_id={top[1]} + min_mag=3", dict(start=iso(inicio), end=iso(fin), country_id=top[1], min_mag="3"), dict(start=inicio, end=fin, pais=top[1], min_mag=3)),
    ("country_id=sin_pais", dict(start=iso(inicio), end=iso(fin), country_id="sin_pais"), dict(start=inicio, end=fin, pais="sin_pais")),
    ("sin_pais + min_mag=4", dict(start=iso(inicio), end=iso(fin), country_id="sin_pais", min_mag="4"), dict(start=inicio, end=fin, pais="sin_pais", min_mag=4)),
    ("ventana de 6 h", dict(start=iso(fin - timedelta(hours=6)), end=iso(fin)), dict(start=fin - timedelta(hours=6), end=fin)),
    ("solo end (start = end − 24 h)", dict(end=iso(fin)), dict(start=fin - timedelta(hours=24), end=fin)),
    ("toda la cobertura", dict(start=iso(t_max - timedelta(days=30)), end=iso(fin)), dict(start=t_max - timedelta(days=30), end=fin)),
    ("min_mag=10 (vacío)", dict(start=iso(inicio), end=iso(fin), min_mag="10"), dict(start=inicio, end=fin, min_mag=10)),
    ("periodo pasado sin datos", dict(start="2020-01-01", end="2020-01-02"), dict(start=datetime(2020, 1, 1, tzinfo=UTC), end=datetime(2020, 1, 2, tzinfo=UTC))),
    ("periodo futuro", dict(start="2030-01-01", end="2030-01-02"), dict(start=datetime(2030, 1, 1, tzinfo=UTC), end=datetime(2030, 1, 2, tzinfo=UTC))),
]

print("== 1. /api/estadisticas frente al oráculo independiente y a /api/eventos (listado paginado de 50) ==")
for nombre, params, filtro in casos:
    st, r = get("/api/estadisticas", **params)
    esperado = oraculo(**filtro)
    ids, offset, meta = [], 0, None
    while True:
        s2, ev = get("/api/eventos", limit=50, offset=offset, **params)
        meta = meta or ev["metadata"]
        ids += [f["id"] for f in ev["features"]]
        if ev["metadata"]["next_offset"] is None:
            break
        offset = ev["metadata"]["next_offset"]
    pais = {i["country_id"]: i["count"] for i in r["por_pais"]["items"]}
    sin_pais = pais.pop(None, 0)
    ok = (st == 200 and r["total"] == esperado["total"] == len(ids) == meta["total"] and r["sin_magnitud"] == esperado["sin_magnitud"] == meta["sin_magnitud"]
          and pais == esperado["pais"] and sin_pais == esperado["sin_pais"] and r["por_pais"]["sin_valor"] == esperado["sin_asignar"]
          and [i["count"] for i in r["magnitud"]["items"]] == esperado["mag"] and r["magnitud"]["sin_valor"] == esperado["mag_nulos"]
          and [i["count"] for i in r["profundidad"]["items"]] == esperado["prof"] and r["profundidad"]["sin_valor"] == esperado["prof_nulos"]
          and sum(i["count"] for i in r["por_pais"]["items"]) + r["por_pais"]["sin_valor"] == r["total"]
          and sum(i["count"] for i in r["magnitud"]["items"]) + r["magnitud"]["sin_valor"] == r["total"]
          and sum(i["count"] for i in r["profundidad"]["items"]) + r["profundidad"]["sin_valor"] == r["total"])
    comprobar(ok, f"{nombre}: total={r['total']} (= eventos {len(ids)} = oráculo {esperado['total']}), países={len(pais)}+sin país {sin_pais}, sin_magnitud={r['sin_magnitud']}, Σ bloques = total")

print("\n== 2. Estructura, defecto y unidades ==")
st, r = get("/api/estadisticas")
comprobar(st == 200 and set(r) == {"generated", "period", "filters", "total", "sin_magnitud", "por_pais", "magnitud", "profundidad"}, f"claves: {sorted(r)}")
comprobar(r["period"]["end"] == r["generated"] and r["period"]["start"] == r["generated"] - 86_400_000, "periodo por defecto = últimas 24 h hasta generated")
comprobar((r["por_pais"]["unit"], r["magnitud"]["unit"], r["profundidad"]["unit"]) == ("events", "magnitude", "km") and r["filters"] == {"min_mag": None, "country_id": None}, "unidades y filtros aplicados")
comprobar(len(r["magnitud"]["items"]) == 10 and len(r["profundidad"]["items"]) == 7 and r["magnitud"]["items"][0]["from"] is None and r["profundidad"]["items"][-1]["to"] is None, "10 intervalos de magnitud y 7 de profundidad, extremos abiertos como null")
texto = json.dumps(r)
comprobar("NaN" not in texto and "Infinity" not in texto and "historico" not in texto.lower() and "synthetic" not in texto.lower(), "sin NaN/Infinity, sin histórico ni sintético")
st1, e = get("/api/eventos")
comprobar(e["metadata"]["total"] == r["total"], f"total de /api/eventos (sin parámetros) = total de /api/estadisticas = {r['total']}")
print(f"  top de países (24 h): {[(i['country_id'], i['count']) for i in r['por_pais']['items'][:5]]} | sin país asignado: {next((i['count'] for i in r['por_pais']['items'] if i['country_id'] is None), 0)}")

print("\n== 3. Parámetros inválidos: 422 con {error, detail}; nunca ceros ==")
for params in (dict(start="ayer"), dict(start="2026-11-02", end="2026-11-01"), dict(min_mag="abc"), dict(min_mag="inf"), dict(country_id="ATLANTIDA"), dict(limit="10"), dict(offset="1"), dict(min_magnitud="4")):
    st, c = get("/api/estadisticas", **params)
    comprobar(st == 422 and c.get("error") == "parametro_invalido" and "total" not in c, f"{params} -> {st}: {str(c.get('detail'))[:80]}")

print("\n== 4. Idempotencia: dos lecturas idénticas de una ventana fija ==")
a, b = get("/api/estadisticas", start=iso(inicio), end=iso(fin), min_mag="4")[1], get("/api/estadisticas", start=iso(inicio), end=iso(fin), min_mag="4")[1]
comprobar({k: v for k, v in a.items() if k != "generated"} == {k: v for k, v in b.items() if k != "generated"}, "mismas cifras en dos lecturas")

print("\nRESULTADO:", "OK" if not fallos else f"FALLAN {len(fallos)}: {fallos}")
raise SystemExit(1 if fallos else 0)
