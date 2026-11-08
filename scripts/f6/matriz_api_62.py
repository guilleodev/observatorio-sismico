"""Matriz de contratos de la API real (F6, 6.2, T026). SOLO LECTURA: únicamente GET. Uso: py -3.13 scripts/f6/matriz_api_62.py [--base http://127.0.0.1:8000]"""
import json, sys, urllib.error, urllib.parse, urllib.request
BASE = sys.argv[sys.argv.index("--base") + 1] if "--base" in sys.argv else "http://127.0.0.1:8000"
fallos = []

def get(ruta, **p):
    url = BASE + ruta + ("?" + urllib.parse.urlencode(p) if p else "")
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)

def ok(nombre, cond, detalle=""):
    print(f"  {'OK ' if cond else 'FALLA'} {nombre} {detalle}")
    if not cond: fallos.append(nombre)

print(f"# 6.2 T026 - matriz de contratos sobre la API real ({BASE})")
print("\n## 422")
for ruta in ("/api/eventos", "/api/estadisticas", "/api/salud"):
    for q in ({"mode": "otro"}, {"mode": "REPLAY"}, {"mode": "live", "run": "r-f6-prueba-a"}, {"run": "r-f6-prueba-a"}, {"mode": "replay", "run": "no-existe"}, {"mode": "replay", "run": "a b"}):
        s, c = get(ruta, **q)
        ok(f"{ruta} {q} -> 422", s == 422 and c.get("error") == "parametro_invalido")

print("\n## live: sin mode == mode=live y sin campos de replay")
a = get("/api/eventos", start="2026-11-06T00:00:00Z", end="2026-11-07T00:00:00Z", limit="5000")[1]
b = get("/api/eventos", start="2026-11-06T00:00:00Z", end="2026-11-07T00:00:00Z", limit="5000", mode="live")[1]
for d in (a, b): d["metadata"].pop("generated"); d["metadata"].pop("last_ingestion")
ok("eventos sin mode == mode=live", a == b, f"({a['metadata']['total']} eventos)")
ok("live sin metadata.replay", "replay" not in a["metadata"] and a["metadata"]["mode"] == "live")
ok("live sin ids de replay", not any(f["id"].startswith("replay-ctl-") for f in a["features"]))
s, sal = get("/api/salud"); ok("salud live sin bloque replay", "replay" not in sal)
s, est = get("/api/estadisticas"); ok("estadisticas live con comparación en vivo", est["comparacion"]["reciente"]["source"] == "live" and "replay" not in est)
s, v = get("/api/eventos"); ok("live por defecto: periodo de 24 h", v["metadata"]["period"]["end"] - v["metadata"]["period"]["start"] == 86_400_000)

print("\n## replay por ejecución")
for run in ("r-f6-prueba-a", "r-f6-prueba-b"):
    s, e = get("/api/eventos", mode="replay", run=run, limit="5000")
    m = e["metadata"]; r = m["replay"]
    ok(f"{run}: 200, mode=replay, run_id", s == 200 and m["mode"] == "replay" and r["run_id"] == run, f"estado={r['estado']} vel={r['velocidad']} tamano={r['tamano']}")
    ok(f"{run}: periodo = intervalo [desde, hasta+1)", m["period"] == {"start": r["intervalo"]["desde"], "end": r["intervalo"]["hasta"] + 1} and m["coverage"] == r["intervalo"])
    ok(f"{run}: 35 eventos (30 reales + 5 casos)", m["total"] == 35 == len(e["features"]), f"total={m['total']}")
    casos = sorted(f["properties"]["caso"] for f in e["features"] if f["properties"]["caso"])
    ok(f"{run}: 5 casos controlados", casos == ["antigua", "duplicado", "magnitud_nula", "maritimo", "revision"], str(casos))
    ok(f"{run}: caso y replayed_at en todas las features", all("caso" in f["properties"] and isinstance(f["properties"]["replayed_at"], int) for f in e["features"]))
    ok(f"{run}: ids de casos con prefijo propio", all(f["id"].startswith("replay-ctl-") == (f["properties"]["caso"] is not None) for f in e["features"]))
    ok(f"{run}: magnitud nula = null", any(f["properties"]["mag"] is None for f in e["features"]) and m["sin_magnitud"] >= 1, f"sin_magnitud={m['sin_magnitud']}")
    s, st = get("/api/estadisticas", mode="replay", run=run)
    ok(f"{run}: estadísticas total == eventos", st["total"] == m["total"] and st["period"] == m["period"] and st["replay"]["run_id"] == run)
    ok(f"{run}: comparación no aplica", st["comparacion"] == {"unit": "events", "comparacion_disponible": False, "motivo": "no_aplica_en_reproduccion", "historico": None, "variacion": None})
    ok(f"{run}: por_hora/país/mag/prof suman el total", sum(i["count"] for i in st["por_hora"]["items"]) == st["total"] and sum(i["count"] for i in st["por_pais"]["items"]) + st["por_pais"]["sin_valor"] == st["total"] and sum(i["count"] for i in st["magnitud"]["items"]) + st["magnitud"]["sin_valor"] == st["total"])
    s, sa = get("/api/salud", mode="replay", run=run)
    ok(f"{run}: salud con bloque replay y last_ingestion en vivo", sa["replay"] == r and sa["last_ingestion"] == get("/api/salud")[1]["last_ingestion"] or abs(sa["last_ingestion"] - get("/api/salud")[1]["last_ingestion"]) < 3_600_000)
    s, f = get("/api/eventos", mode="replay", run=run, min_mag="5", limit="5000")
    ok(f"{run}: min_mag funciona", all((x["properties"]["mag"] or 0) >= 5 for x in f["features"]) and f["metadata"]["total"] < 35, f"total={f['metadata']['total']}")
s, d = get("/api/eventos", mode="replay"); ok("replay sin run = ejecución más reciente (r-f6-prueba-b)", d["metadata"]["replay"]["run_id"] == "r-f6-prueba-b")
s, d = get("/api/eventos", mode="replay", run="r-f6-prueba-a", limit="10"); ok("paginación en replay", len(d["features"]) == 10 and d["metadata"]["next_offset"] == 10 and d["metadata"]["truncated"])

print("\n## separación")
live_ids = {f["id"] for f in get("/api/eventos", start="2026-01-01T00:00:00Z", end="2027-01-01T00:00:00Z", limit="5000")[1]["features"]}
rep_ids = {f["id"] for f in get("/api/eventos", mode="replay", run="r-f6-prueba-a", limit="5000")[1]["features"]}
ok("0 ids de replay en /api/eventos en vivo", not (live_ids & rep_ids), f"(live={len(live_ids)}, replay={len(rep_ids)})")
s, f = get("/api/eventos", mode="replay", run="r-f6-prueba-a", start="2026-11-01T00:00:00Z", end="2026-11-08T00:00:00Z")
ok("replay con periodo de 2026 (fechas de live) no devuelve nada", f["metadata"]["total"] == 0)
print(f"\nRESULTADO: {'OK' if not fallos else 'FALLAN: ' + str(fallos)}")
sys.exit(1 if fallos else 0)
