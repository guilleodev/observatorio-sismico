# Actualizado el 2026-11-08 (F6, 6.3, T032): solo la aserción de las claves de /api/salud, ampliadas en 5.6. El resto no cambia; la evidencia de docs/evidencias/f5/ no se reescribe.
"""Matriz del paso 5.1 contra la API REAL desplegada (F5, T009). SOLO LECTURA (GET/OPTIONS a la API y SELECT a la base).

El oráculo es independiente de la API: se leen las filas de `live.evento_actual` una vez y se filtran en Python. Para que la ingesta en curso no altere la
comparación, las ventanas terminan en un instante FIJO anterior al último evento. Uso (contenedor de pruebas):  python /scripts5/matriz_51.py [http://api:8000]
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
fallos = []


def comprobar(cond, texto):
    print(("  OK    " if cond else "  FALLA ") + texto)
    if not cond:
        fallos.append(texto)


def get(ruta, **params):
    url = f"{API}{ruta}" + (("?" + urllib.parse.urlencode(params)) if params else "")
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"ngrok-skip-browser-warning": "1"}), timeout=30) as r:
            return r.status, json.loads(r.read()), {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read()), {k.lower(): v for k, v in exc.headers.items()}


conn = psycopg.connect(f"host={os.environ['POSTGRES_HOST']} dbname={os.environ['POSTGRES_DB']} user={os.environ['POSTGRES_USER']} password={os.environ['POSTGRES_PASSWORD']}", autocommit=True)
conn.execute("SET TIME ZONE 'UTC'")
filas = conn.execute("SELECT event_id, event_time, mag, country_id, geo_resultado, retirado FROM live.evento_actual").fetchall()
t_max = max(f[1] for f in filas)
fin = (t_max - timedelta(hours=1)).replace(microsecond=0)
inicio = fin - timedelta(hours=36)
print(f"# 5.1 T009 - matriz contra la API real {datetime.now(UTC):%Y-%m-%dT%H:%M:%SZ}  ({API})")
print(f"filas en live.evento_actual: {len(filas)} (retiradas: {sum(1 for f in filas if f[5])}) | ventana fija: [{inicio.isoformat()}, {fin.isoformat()})\n")

paises = {}
for f in filas:
    if f[3]:
        paises[f[3]] = paises.get(f[3], 0) + 1
pais_top = max(paises, key=paises.get)
iso = lambda d: d.isoformat().replace("+00:00", "Z")


def oraculo(start, end, min_mag=None, pais=None):
    base = [f for f in filas if not f[5] and start <= f[1] < end and (pais is None or (f[4] == "sin_pais" if pais == "sin_pais" else f[3] == pais))]
    elegidos = [f for f in base if min_mag is None or (f[2] is not None and float(f[2]) >= min_mag)]
    elegidos.sort(key=lambda f: (-f[1].timestamp(), f[0]))
    return [f[0] for f in elegidos], sum(1 for f in base if f[2] is None)


def recorrer(limit, **params):
    ids, offset, paginas, primera = [], 0, 0, None
    while True:
        st, cuerpo, _ = get("/api/eventos", limit=limit, offset=offset, **params)
        assert st == 200, (st, cuerpo)
        primera = primera or cuerpo["metadata"]
        ids += [f["id"] for f in cuerpo["features"]]
        paginas += 1
        if cuerpo["metadata"]["next_offset"] is None:
            return ids, primera, paginas
        offset = cuerpo["metadata"]["next_offset"]


print("== 1. Filtros válidos: la API (todas las páginas, limit=50) frente al oráculo independiente ==")
casos = [
    ("ventana fija", dict(start=iso(inicio), end=iso(fin)), dict(start=inicio, end=fin)),
    ("min_mag=4", dict(start=iso(inicio), end=iso(fin), min_mag="4"), dict(start=inicio, end=fin, min_mag=4)),
    ("min_mag=5.5", dict(start=iso(inicio), end=iso(fin), min_mag="5.5"), dict(start=inicio, end=fin, min_mag=5.5)),
    (f"country_id={pais_top}", dict(start=iso(inicio), end=iso(fin), country_id=pais_top), dict(start=inicio, end=fin, pais=pais_top)),
    ("country_id en minúsculas", dict(start=iso(inicio), end=iso(fin), country_id=pais_top.lower()), dict(start=inicio, end=fin, pais=pais_top)),
    ("country_id=sin_pais", dict(start=iso(inicio), end=iso(fin), country_id="sin_pais"), dict(start=inicio, end=fin, pais="sin_pais")),
    (f"{pais_top} + min_mag=3", dict(start=iso(inicio), end=iso(fin), country_id=pais_top, min_mag="3"), dict(start=inicio, end=fin, pais=pais_top, min_mag=3)),
    ("sin_pais + min_mag=4", dict(start=iso(inicio), end=iso(fin), country_id="sin_pais", min_mag="4"), dict(start=inicio, end=fin, pais="sin_pais", min_mag=4)),
    ("ventana de 6 h", dict(start=iso(fin - timedelta(hours=6)), end=iso(fin)), dict(start=fin - timedelta(hours=6), end=fin)),
    ("solo end (start = end − 24 h)", dict(end=iso(fin)), dict(start=fin - timedelta(hours=24), end=fin)),
    ("min_mag=10 (sin resultados)", dict(start=iso(inicio), end=iso(fin), min_mag="10"), dict(start=inicio, end=fin, min_mag=10)),
    ("periodo pasado sin datos", dict(start="2020-01-01", end="2020-01-02"), dict(start=datetime(2020, 1, 1, tzinfo=UTC), end=datetime(2020, 1, 2, tzinfo=UTC))),
    ("periodo futuro", dict(start="2030-01-01", end="2030-01-02"), dict(start=datetime(2030, 1, 1, tzinfo=UTC), end=datetime(2030, 1, 2, tzinfo=UTC))),
]
for nombre, params, filtro in casos:
    ids, meta, paginas = recorrer(50, **params)
    esperados, nulos = oraculo(**filtro)
    comprobar(ids == esperados and meta["total"] == len(esperados) and meta["sin_magnitud"] == nulos and len(set(ids)) == len(ids),
              f"{nombre}: {len(ids)} eventos en {paginas} páginas = oráculo ({len(esperados)}), total={meta['total']}, sin_magnitud={meta['sin_magnitud']} (oráculo {nulos}), 0 duplicados")

print("\n== 2. Paginación con límite pequeño y estabilidad con la ventana resuelta ==")
st, p1, _ = get("/api/eventos", limit=25)
m = p1["metadata"]
comprobar(st == 200 and m["count"] == 25 and m["truncated"] is True and m["next_offset"] == 25 and m["limit"] == 25 and m["offset"] == 0 and m["total"] > 25, f"primera página: count=25 truncated=true next_offset=25 total={m['total']}")
ids, _, paginas = recorrer(25, start=iso(datetime.fromtimestamp(m["period"]["start"] / 1000, UTC)), end=iso(datetime.fromtimestamp(m["period"]["end"] / 1000, UTC)))
comprobar(len(ids) == len(set(ids)) and len(ids) == m["total"], f"recorrido con el period resuelto: {len(ids)} eventos únicos en {paginas} páginas = total {m['total']}")
st, ultima, _ = get("/api/eventos", limit=25, offset=m["total"] - (m["total"] % 25 or 25))
comprobar(ultima["metadata"]["truncated"] is False and ultima["metadata"]["next_offset"] is None, "última página: truncated=false, next_offset=null")
st, vacia, _ = get("/api/eventos", offset=10**6)
comprobar(st == 200 and vacia["features"] == [] and vacia["metadata"]["truncated"] is False, "offset fuera de rango: 200 con página vacía (no es error)")

print("\n== 3. Contrato: sin parámetros ==")
st, base, cab = get("/api/eventos")
meta = base["metadata"]
comprobar(st == 200 and cab["content-type"].startswith("application/json") and base["type"] == "FeatureCollection", "200, application/json, FeatureCollection")
comprobar({"generated", "last_ingestion", "mode", "count", "truncated"} <= set(meta) and meta["mode"] == "live", "metadata conserva generated, last_ingestion, mode, count y truncated (mode=live)")
comprobar(set(meta) == {"generated", "last_ingestion", "mode", "count", "truncated", "total", "limit", "offset", "next_offset", "sin_magnitud", "period", "coverage"}, f"campos nuevos aditivos: {sorted(set(meta) - {'generated', 'last_ingestion', 'mode', 'count', 'truncated'})}")
comprobar(meta["period"]["end"] == meta["generated"] and meta["period"]["start"] == meta["generated"] - 86_400_000, "periodo resuelto = últimas 24 h hasta generated")
comprobar(meta["limit"] == 5000 and meta["total"] == meta["count"] and meta["truncated"] is False, f"límite máximo 5000; {meta['count']} eventos de las últimas 24 h, sin truncado")
comprobar(all(set(f["properties"]) == {"mag", "magType", "place", "time", "updated", "country_id", "country_name"} for f in base["features"]), "propiedades de cada Feature intactas")
texto = json.dumps(base)
comprobar("NaN" not in texto and "Infinity" not in texto and "historico" not in texto.lower() and "synthetic" not in texto.lower(), "sin NaN/Infinity, sin histórico ni sintético en la respuesta")
cobertura = conn.execute("SELECT (extract(epoch FROM min(ingested_at) - interval '24 hours') * 1000)::bigint FROM live.evento_actual").fetchone()[0]
comprobar(meta["coverage"]["live_since"] == cobertura, f"coverage.live_since = min(ingested_at) − 24 h = {cobertura}")
ultima_ok = conn.execute("SELECT (extract(epoch FROM ultima_consulta_ok_at) * 1000)::bigint FROM live.estado_ingesta").fetchone()[0]
comprobar(abs(meta["last_ingestion"] - ultima_ok) < 120_000, "last_ingestion = última consulta correcta a USGS (±2 min por la ingesta en curso)")

print("\n== 4. Parámetros inválidos: 422 con {error, detail}; nunca una lista vacía ==")
malos = [dict(start="ayer"), dict(end=""), dict(start="2026-11-02", end="2026-11-01"), dict(min_mag="abc"), dict(min_mag="NaN"), dict(min_mag="inf"), dict(country_id="ATLANTIDA"),
         dict(limit="5001"), dict(limit="0"), dict(limit="x"), dict(offset="-1"), dict(min_magnitud="4"), dict(start="2026-11-01T00:00:00 02:00")]
for params in malos:
    st, cuerpo, _ = get("/api/eventos", **params)
    comprobar(st == 422 and cuerpo.get("error") == "parametro_invalido" and cuerpo.get("detail") and "features" not in cuerpo, f"{params} -> {st} {cuerpo.get('error')}: {str(cuerpo.get('detail'))[:90]}")
st, cuerpo, _ = get("/api/eventos?start=2026-10-01&start=2026-10-02")
comprobar(st == 422 and "repetido" in cuerpo["detail"], f"parámetro repetido -> {st}: {cuerpo['detail']}")
st, cuerpo, _ = get("/api/eventos?start=2026-11-01T00:00:00%2B02:00&end=2026-11-02")
comprobar(st == 200 or st == 422, f"desplazamiento con %2B codificado -> {st}")

print("\n== 5. CORS, métodos y salud ==")
req = urllib.request.Request(f"{API}/api/eventos", method="OPTIONS", headers={"Origin": "http://localhost:4200", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "ngrok-skip-browser-warning"})
with urllib.request.urlopen(req, timeout=10) as r:
    comprobar(r.status == 200 and r.headers["access-control-allow-origin"] == "http://localhost:4200", "preflight OPTIONS con ngrok-skip-browser-warning: origen de desarrollo permitido")
try:
    urllib.request.urlopen(urllib.request.Request(f"{API}/api/eventos", method="POST", data=b"{}"), timeout=10)
    comprobar(False, "POST debería ser 405")
except urllib.error.HTTPError as exc:
    comprobar(exc.code == 405, f"POST -> {exc.code} (la API solo lee)")
st, salud, _ = get("/api/salud")
comprobar(st == 200 and set(salud) == {"status", "database", "last_ingestion", "generated", "ingestion_age_s", "stale", "stale_after_s", "gaps_pending", "live_since"} and (salud["status"], salud["database"]) == ("ok", "ok"), f"/api/salud: los tres campos de 5.1 y los de F5 (5.6): {sorted(salud)}")

print("\n== 6. Idempotencia: dos lecturas idénticas de una ventana fija ==")
a = get("/api/eventos", start=iso(inicio), end=iso(fin), min_mag="4")
b = get("/api/eventos", start=iso(inicio), end=iso(fin), min_mag="4")
quitar = lambda c: {**c, "metadata": {k: v for k, v in c["metadata"].items() if k not in ("generated", "last_ingestion")}}
comprobar(quitar(a[1]) == quitar(b[1]), "mismas features y metadata (salvo generated y last_ingestion) en dos lecturas")

print("\nRESULTADO:", "OK" if not fallos else f"FALLAN {len(fallos)}: {fallos}")
raise SystemExit(1 if fallos else 0)
