"""Verificación local previa a publicar (F6, 6.6, T044; FR-027, FR-028). Se ejecuta en el contenedor de pruebas: bash scripts/f6/ejecutar.sh python /scripts6/verificar_cors_local.py

Arranca DOS APIs TEMPORALES dentro del contenedor (nunca la real, que no se toca): una con la configuración pública (CORS exacto con un origen de Netlify de EJEMPLO y API_DOCS=false)
y otra con la de desarrollo (docs activas). Leen la base real en SOLO LECTURA (como hace la API) y desaparecen con el contenedor. No se abre ningún túnel ni se contacta con ngrok o Netlify.
"""
import gzip
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

NETLIFY = "https://sitio-de-ejemplo.netlify.app"   # origen de EJEMPLO: el real se conoce al crear el sitio (T046)
LOCAL = "http://localhost:4200"
fallos = []


def ok(nombre, cond, detalle=""):
    print(f"  {'OK   ' if cond else 'FALLA'} {nombre} {detalle}")
    if not cond:
        fallos.append(nombre)


def arrancar(puerto, extra):
    env = {**os.environ, "API_CORS_ORIGINS": f"{NETLIFY},{LOCAL}", **extra}
    p = subprocess.Popen([sys.executable, "-m", "uvicorn", "--factory", "observatorio.api.main:crear_app_desde_entorno", "--host", "127.0.0.1", "--port", str(puerto)],
                         cwd="/app/src", env={**env, "PYTHONPATH": "/app/src"}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{puerto}/api/salud", timeout=2)
            return p
        except Exception:
            time.sleep(0.5)
    p.kill()
    raise SystemExit(f"la API temporal del puerto {puerto} no arrancó")


def pedir(puerto, ruta, metodo="GET", cabeceras=None):
    r = urllib.request.Request(f"http://127.0.0.1:{puerto}{ruta}", method=metodo, headers=cabeceras or {})
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            return resp.status, dict((k.lower(), v) for k, v in resp.headers.items()), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict((k.lower(), v) for k, v in e.headers.items()), e.read()


def preflight(puerto, origen, metodo="GET", cabeceras="ngrok-skip-browser-warning"):
    return pedir(puerto, "/api/eventos", "OPTIONS", {"Origin": origen, "Access-Control-Request-Method": metodo, "Access-Control-Request-Headers": cabeceras})


print("# 6.6 T044 - verificación local previa a publicar (APIs temporales; la real no se toca)")
publica = arrancar(8101, {"API_DOCS": "false"})
desarrollo = arrancar(8102, {})
try:
    print("\n## 1. Preflight con Origin simulado (configuración pública: Netlify de ejemplo + localhost:4200)")
    for o in (NETLIFY, LOCAL):
        s, h, _ = preflight(8101, o)
        ok(f"preflight desde {o}", s == 200 and h.get("access-control-allow-origin") == o, f"-> {s}, allow-origin={h.get('access-control-allow-origin')}")
        ok(f"  permite la cabecera ngrok-skip-browser-warning y solo GET/OPTIONS ({o})", "ngrok-skip-browser-warning" in h.get("access-control-allow-headers", "").lower()
           and {m.strip() for m in h.get("access-control-allow-methods", "").split(",")} == {"GET", "OPTIONS"} and "access-control-allow-credentials" not in h)
    for o in ("https://otro.netlify.app", "http://localhost:4201", "https://sitio-de-ejemplo.netlify.app.malo.com", "http://sitio-de-ejemplo.netlify.app", "null", "*"):
        s, h, _ = preflight(8101, o)
        ok(f"preflight rechazado desde {o}", s == 400 and "access-control-allow-origin" not in h, f"-> {s}")
    s, h, _ = preflight(8101, NETLIFY, "POST")
    ok("preflight de POST rechazado", s == 400, f"-> {s}")
    s, h, _ = preflight(8101, NETLIFY, "GET", "authorization")
    ok("preflight con cabecera no declarada (authorization) rechazado", s == 400, f"-> {s}")
    s, h, _ = pedir(8101, "/api/salud", "GET", {"Origin": NETLIFY})
    ok("GET real con Origin de Netlify lleva el origen exacto", s == 200 and h.get("access-control-allow-origin") == NETLIFY)
    s, h, _ = pedir(8101, "/api/salud", "GET", {"Origin": "https://otro.netlify.app"})
    ok("GET real con un origen ajeno no recibe cabecera CORS (el navegador lo bloquea)", s == 200 and "access-control-allow-origin" not in h,
       "(CORS no es autenticación: un cliente sin navegador, como curl, SÍ recibe los datos)")
    for m in ("POST", "PUT", "DELETE"):
        ok(f"{m} /api/eventos -> 405", pedir(8101, "/api/eventos", m)[0] == 405)

    print("\n## 2. Compresión HTTP sobre datos reales (API temporal, /api/eventos de las últimas 24 h y estadísticas)")
    for ruta in ("/api/eventos", "/api/estadisticas", "/api/salud"):
        s1, h1, b1 = pedir(8101, ruta, "GET", {"Accept-Encoding": "identity"})
        s2, h2, b2 = pedir(8101, ruta, "GET", {"Accept-Encoding": "gzip"})
        comp = h2.get("content-encoding") == "gzip"
        cuerpo = gzip.decompress(b2) if comp else b2
        ok(f"{ruta}: sin compresión {len(b1)} B, con gzip {len(b2)} B", s1 == s2 == 200 and (comp or len(b1) < 1000),
           f"(ahorro {100 - round(100 * len(b2) / len(b1))} %)" if comp else "(demasiado pequeña: no se comprime)")
    VENTANA = "?start=2026-11-06T00:00:00Z&end=2026-11-07T00:00:00Z&limit=5000"   # ventana pasada y fija: dos lecturas deben dar el mismo contenido
    s, h, b = pedir(8101, "/api/eventos" + VENTANA, "GET", {"Accept-Encoding": "identity"})
    s2, h2, b2 = pedir(8101, "/api/eventos" + VENTANA, "GET", {"Accept-Encoding": "gzip"})
    a, c = json.loads(b), json.loads(gzip.decompress(b2))
    for d in (a, c):
        d["metadata"].pop("generated"); d["metadata"].pop("last_ingestion")
    ok("el JSON descomprimido es idéntico al sin comprimir", a == c, f"({len(a['features'])} eventos)")
    por_refresco = sum(len(pedir(8101, r, 'GET', {'Accept-Encoding': 'gzip'})[2]) for r in ("/api/salud", "/api/eventos", "/api/estadisticas"))
    sin = sum(len(pedir(8101, r, 'GET', {'Accept-Encoding': 'identity'})[2]) for r in ("/api/salud", "/api/eventos", "/api/estadisticas"))
    print(f"  --    transferencia por refresco del panel: {sin / 1024:.1f} KB sin comprimir → {por_refresco / 1024:.1f} KB con gzip (ahorro {100 - round(100 * por_refresco / sin)} %)")

    print("\n## 3. Rutas que saldrían por el túnel")
    spec = json.loads(pedir(8102, "/openapi.json")[2])
    rutas_dev = sorted((p, ",".join(m.upper() for m in ms)) for p, ms in spec["paths"].items())
    print("  API de desarrollo (docs activas) · rutas de datos publicadas en OpenAPI: " + "; ".join(f"{m} {p}" for p, m in rutas_dev))
    for ruta in ("/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"):
        s_dev, s_pub = pedir(8102, ruta)[0], pedir(8101, ruta)[0]
        ok(f"{ruta}: desarrollo {s_dev}, pública {s_pub}", s_dev in (200,) and s_pub == 404 if ruta != "/docs/oauth2-redirect" else s_pub == 404)
    for ruta in ("/", "/admin", "/metrics", "/api", "/api/otro", "/.env", "/api/eventos/../.env"):
        s = pedir(8101, ruta)[0]
        ok(f"ruta inexistente {ruta} -> {s}", s in (404, 405))
    ok("la API pública solo atiende 3 rutas", sorted(p for p in json.loads(pedir(8102, '/openapi.json')[2])['paths']) == ["/api/estadisticas", "/api/eventos", "/api/salud"])

    print("\n## 4. Errores sin filtrar información interna")
    s, h, b = pedir(8101, "/api/eventos?limit=abc")
    t = b.decode()
    ok("422 con {error, detail} y sin rutas internas, SQL ni credenciales", s == 422 and all(x not in t.lower() for x in ("traceback", "psycopg", "select ", "password", "/app/", "postgres")), f"-> {t[:90]}")
finally:
    for p in (publica, desarrollo):
        p.terminate()
        p.wait(timeout=10)
print(f"\nRESULTADO: {'OK' if not fallos else 'FALLAN ' + str(len(fallos)) + ': ' + str(fallos)}")
sys.exit(1 if fallos else 0)
