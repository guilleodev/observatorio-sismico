"""Verificación de la clave de acceso de la API sobre una API TEMPORAL con datos reales de solo lectura (F6, 6.6, FR-041). Se ejecuta en el contenedor de pruebas:
    bash scripts/f6/ejecutar.sh python -X utf8 /scripts6/verificar_acceso_api.py
Arranca dentro del contenedor una API con la configuración pública (CORS de Netlify, API_DOCS=false, gzip) y una clave ALEATORIA DE ESTA EJECUCIÓN (no la real), la prueba con peticiones reales
(sin clave, mala, buena; live y replay; preflight; documentación) y comprueba que la clave no aparece en los registros del servidor. La API real no se toca."""
import gzip
import json
import os
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

NETLIFY = "https://observatorio-sismico.netlify.app"
CLAVE = secrets.token_urlsafe(36)
CAB = "X-Observatorio-Clave"
U = "http://127.0.0.1:8103"
fallos = []


def ok(nombre, cond, detalle=""):
    print(f"  {'OK   ' if cond else 'FALLA'} {nombre} {detalle}")
    if not cond:
        fallos.append(nombre)


def pedir(ruta, metodo="GET", cabeceras=None):
    r = urllib.request.Request(U + ruta, method=metodo, headers=cabeceras or {})
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()


registro = tempfile.NamedTemporaryFile("w+b", delete=False)
env = {**os.environ, "API_CORS_ORIGINS": f"{NETLIFY},http://localhost:4200", "API_DOCS": "false", "API_CLAVE_ACCESO": CLAVE, "PYTHONPATH": "/app/src"}
srv = subprocess.Popen([sys.executable, "-m", "uvicorn", "--factory", "observatorio.api.main:crear_app_desde_entorno", "--host", "127.0.0.1", "--port", "8103"],
                       cwd="/app/src", env=env, stdout=registro, stderr=subprocess.STDOUT)
print("# 6.6 FR-041 - verificación de la clave de acceso (API temporal; clave aleatoria de esta ejecución, no la real)")
try:
    for _ in range(60):
        try:
            urllib.request.urlopen(U + "/api/salud", timeout=2)
        except urllib.error.HTTPError:
            break
        except Exception:
            time.sleep(0.5)
    buena, mala = {CAB: CLAVE}, {CAB: "incorrecta-" + CLAVE[:6]}

    print("\n## 1. Sin clave o con clave incorrecta: 401 y sin datos")
    for ruta in ("/api/salud", "/api/eventos", "/api/estadisticas", "/api/eventos?mode=replay", "/api/estadisticas?mode=replay", "/api/salud?mode=replay", "/api/eventos?mode=otro", "/api/eventos?mode=live&run=x"):
        s, h, b = pedir(ruta)
        s2, _, b2 = pedir(ruta, cabeceras=mala)
        ok(f"{ruta}: sin clave {s}, mala {s2}", s == s2 == 401 and json.loads(b)["error"] == "no_autorizado" and b"features" not in b and b"features" not in b2)
    ok("la clave en la URL no vale", pedir(f"/api/salud?clave={CLAVE}&key={CLAVE}")[0] == 401)
    ok("la clave en Authorization/Cookie no vale", pedir("/api/salud", cabeceras={"Authorization": CLAVE, "Cookie": f"clave={CLAVE}"})[0] == 401)
    for m in ("POST", "PUT", "DELETE"):
        ok(f"{m} sin clave -> 401", pedir("/api/eventos", m)[0] == 401)

    print("\n## 2. Con la clave: funciona, también live frente a replay")
    s, h, b = pedir("/api/eventos?limit=3", cabeceras=buena)
    ok("live: 200 y mode=live", s == 200 and json.loads(b)["metadata"]["mode"] == "live")
    s, h, b = pedir("/api/eventos?mode=replay&limit=3", cabeceras=buena)
    j = json.loads(b)
    ok("replay: 200, mode=replay y ejecución de replay", s == 200 and j["metadata"]["mode"] == "replay" and j["metadata"]["replay"]["run_id"].startswith("r-"), f"({j['metadata']['replay']['run_id']})")
    ids_live = {f["id"] for f in json.loads(pedir("/api/eventos?limit=5000", cabeceras=buena)[2])["features"]}
    ids_rep = {f["id"] for f in json.loads(pedir("/api/eventos?mode=replay&limit=5000", cabeceras=buena)[2])["features"]}
    ok("aislamiento: 0 ids de replay en live", not (ids_live & ids_rep), f"(live {len(ids_live)}, replay {len(ids_rep)})")
    s, h, b = pedir("/api/estadisticas?mode=replay", cabeceras=buena)
    ok("estadísticas de replay: comparación «no aplica»", s == 200 and json.loads(b)["comparacion"]["motivo"] == "no_aplica_en_reproduccion")
    ok("parámetro inválido con clave -> 422", pedir("/api/eventos?mode=otro", cabeceras=buena)[0] == 422)
    s, h, b = pedir("/api/salud?mode=replay", cabeceras=buena)
    ok("salud de replay con bloque replay", s == 200 and "replay" in json.loads(b))
    s, h, b = pedir("/api/eventos?limit=5000", cabeceras={**buena, "Accept-Encoding": "gzip"})
    ok("gzip con clave", s == 200 and h.get("content-encoding") == "gzip" and json.loads(gzip.decompress(b))["metadata"]["mode"] == "live", f"({len(b)} B)")

    print("\n## 3. CORS: preflight sin clave y sin datos; el 401 legible desde el panel")
    s, h, b = pedir("/api/eventos", "OPTIONS", {"Origin": NETLIFY, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": f"{CAB},ngrok-skip-browser-warning"})
    ok("preflight de Netlify con la cabecera de clave -> 200 sin cuerpo de datos", s == 200 and h.get("access-control-allow-origin") == NETLIFY and CAB.lower() in h.get("access-control-allow-headers", "").lower()
       and b"features" not in b and b"metadata" not in b)
    s, h, b = pedir("/api/eventos", "OPTIONS", {"Origin": "https://otro.netlify.app", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": CAB})
    ok("preflight de otro origen -> 400", s == 400 and "access-control-allow-origin" not in h)
    s, h, b = pedir("/api/eventos", cabeceras={"Origin": NETLIFY})
    ok("el 401 lleva el origen exacto de Netlify (el panel puede leerlo y pedir la clave)", s == 401 and h.get("access-control-allow-origin") == NETLIFY)
    s, h, b = pedir("/api/eventos", cabeceras={"Origin": "https://otro.netlify.app"})
    ok("el 401 a un origen ajeno no lleva cabecera CORS", s == 401 and "access-control-allow-origin" not in h)

    print("\n## 4. Documentación y rutas")
    for r in ("/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"):
        ok(f"{r} -> 404", pedir(r)[0] == 404)
    for r in ("/", "/admin", "/metrics", "/.env", "/api", "/api/otro"):
        s = pedir(r)[0]
        ok(f"{r} -> {s}", s in (401, 404), "(bajo /api/ sin clave se contesta 401: no se revela qué rutas existen)" if r.startswith("/api") else "")
finally:
    srv.terminate()
    srv.wait(timeout=10)
    registro.flush()
    registro.seek(0)
    texto = registro.read().decode("utf-8", "replace")
    registro.close()
    os.unlink(registro.name)

print("\n## 5. La clave no se filtra")
lineas = texto.splitlines()
sonda = [l for l in lineas if "?clave=" in l]  # la prueba 1 mete a propósito la clave en la URL: uvicorn registra las URLs, por eso la clave NUNCA debe ir en la URL (el panel no lo hace)
resto = chr(10).join(l for l in lineas if "?clave=" not in l)
ok("la clave (completa ni su prefijo) no aparece en el registro del servidor, salvo en la línea de la sonda que la puso a propósito en la URL", CLAVE not in resto and CLAVE[:10] not in resto,
   f"({len(lineas)} líneas; {len(sonda)} de la sonda de URL, excluida)")
ok("el registro de accesos no contiene la cabecera", CAB.lower() not in texto.lower())
print(f"\nRESULTADO: {'OK' if not fallos else 'FALLAN ' + str(len(fallos)) + ': ' + str(fallos)}")
sys.exit(1 if fallos else 0)
