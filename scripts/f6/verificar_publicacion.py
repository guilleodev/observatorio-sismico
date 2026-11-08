"""Verificación de la API publicada por el túnel (F6, 6.6, T047). SOLO LECTURA (GET/OPTIONS). Biblioteca estándar; se ejecuta en el equipo, sin Docker.
NO se ha ejecutado contra ningún túnel real: requiere la autorización PA-8 (cuentas, authtoken y publicación hechos por la persona estudiante). Ver procedimiento-ngrok-netlify.md.

Uso:
  py -3.13 scripts/f6/verificar_publicacion.py --api https://<dominio>.ngrok-free.app --sitio https://<sitio>.netlify.app            (túnel abierto)
  py -3.13 scripts/f6/verificar_publicacion.py --api https://<dominio>.ngrok-free.app --fase cerrada                                 (tras parar ngrok: debe NO responder datos)
  py -3.13 scripts/f6/verificar_publicacion.py --api https://<dominio>.ngrok-free.app --sitio https://<sitio>.netlify.app --fase reabierta
  Opcional: --inspector http://127.0.0.1:4040 (API local de ngrok) para comprobar que el túnel reenvía SOLO al puerto 8000.
Prueba local del propio script (sin túnel):  --api http://127.0.0.1:8000 --sitio http://localhost:4200 --local   (con --local se esperan las /docs de desarrollo).
"""
import argparse
import gzip
import json
import sys
import urllib.error
import urllib.request

fallos = []
CLAVE = None  # clave de acceso de la API (FR-041): se lee del .env local y se envía solo en cabecera; nunca se imprime


def ok(nombre, cond, detalle=""):
    print(f"  {'OK   ' if cond else 'FALLA'} {nombre} {detalle}")
    if not cond:
        fallos.append(nombre)


def pedir(url, metodo="GET", cabeceras=None, timeout=20):
    r = urllib.request.Request(url, method=metodo, headers={"ngrok-skip-browser-warning": "1", "User-Agent": "verificar-publicacion", **({"X-Observatorio-Clave": CLAVE} if CLAVE and (cabeceras or {}).get("X-Sin-Clave") is None else {}), **{k: v for k, v in (cabeceras or {}).items() if k != "X-Sin-Clave"}})
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return None, {}, str(e).encode()


def fase_abierta(a):
    api, sitio = a.api.rstrip("/"), a.sitio.rstrip("/") if a.sitio else None
    print(f"## Túnel abierto: {api}" + (f" · sitio {sitio}" if sitio else ""))
    if CLAVE:
        s, _, b = pedir(f"{api}/api/salud", cabeceras={"X-Sin-Clave": "1"})
        ok("SIN clave: /api/salud -> 401 (la protección funciona a través del túnel)", s == 401 and b'"status"' not in b, f"-> {s}")
        s, _, b = pedir(f"{api}/api/eventos?limit=1", cabeceras={"X-Sin-Clave": "1"})
        ok("SIN clave: /api/eventos -> 401 y sin datos", s == 401 and b'features' not in b, f"-> {s}")
        s, _, b = pedir(f"{api}/api/eventos?mode=replay", cabeceras={"X-Sin-Clave": "1"})
        ok("SIN clave: modo replay -> 401", s == 401, f"-> {s}")
    ok("HTTPS", api.startswith("https://") or a.local, "(el túnel debe ser HTTPS)")
    s, h, b = pedir(f"{api}/api/salud")
    ok("GET /api/salud responde 200 con status ok", s == 200 and json.loads(b).get("status") == "ok", f"-> {s}")
    s, h, b = pedir(f"{api}/api/eventos?limit=5", cabeceras={"Accept-Encoding": "gzip"})
    cuerpo = gzip.decompress(b) if h.get("content-encoding") == "gzip" else b
    d = json.loads(cuerpo) if s == 200 else {}
    ok("GET /api/eventos devuelve un FeatureCollection con metadata.mode=live", s == 200 and d.get("type") == "FeatureCollection" and d["metadata"]["mode"] == "live", f"-> {s}")
    s, h, b = pedir(f"{api}/api/eventos?mode=replay")
    ok("GET /api/eventos?mode=replay funciona (modo reproducción)", s == 200 and json.loads(b)["metadata"]["mode"] == "replay", f"-> {s}")
    s, h, b = pedir(f"{api}/api/eventos?mode=otro")
    ok("mode inválido -> 422", s == 422)
    if sitio:
        s, h, _ = pedir(f"{api}/api/eventos?limit=1", cabeceras={"Origin": sitio})
        ok("GET con Origin del sitio de Netlify lleva access-control-allow-origin exacto", h.get("access-control-allow-origin") == sitio, f"({h.get('access-control-allow-origin')})")
        s, h, _ = pedir(f"{api}/api/eventos", "OPTIONS", {"Origin": sitio, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "ngrok-skip-browser-warning"})
        ok("preflight real desde Netlify", s == 200 and h.get("access-control-allow-origin") == sitio and "ngrok-skip-browser-warning" in h.get("access-control-allow-headers", "").lower(), f"-> {s}")
        s, h, _ = pedir(f"{api}/api/eventos", "OPTIONS", {"Origin": "https://otro-sitio.netlify.app", "Access-Control-Request-Method": "GET"})
        ok("preflight desde un origen ajeno rechazado", s == 400 and "access-control-allow-origin" not in h, f"-> {s}")
        s, h, b = pedir(sitio + "/")
        ok("el sitio de Netlify responde 200 con la aplicación", s == 200 and b"<app-root" in b, f"-> {s}")
        s, h, b = pedir(sitio + "/config.json")
        cfg = json.loads(b) if s == 200 else {}
        ok("config.json publicado: URL del túnel, refresco >= 10 min, pausa con la pestaña oculta y sin secretos", cfg.get("apiUrl") == api and cfg.get("refreshMs", 0) >= 600000
           and cfg.get("pausarSiOculta") is True and not any(k in cfg for k in ("token", "authtoken", "password", "secret")), str(cfg))
    for ruta in ("/docs", "/redoc", "/openapi.json"):
        s, _, _ = pedir(f"{api}{ruta}")
        ok(f"{ruta} {'accesible en local (--local)' if a.local else 'oculta (404)'}", s == (200 if a.local else 404), f"-> {s}")
    for ruta in ("/admin", "/metrics", "/.env", "/api/otro"):
        s, _, _ = pedir(f"{api}{ruta}")
        ok(f"{ruta} no existe", s in (404, 405), f"-> {s}")
    for m in ("POST", "PUT", "DELETE"):
        ok(f"{m} /api/eventos -> 405", pedir(f"{api}/api/eventos", m)[0] == 405)
    if a.inspector:
        s, _, b = pedir(a.inspector.rstrip("/") + "/api/tunnels")
        t = json.loads(b).get("tunnels", []) if s == 200 else []
        direcciones = [x.get("config", {}).get("addr", "") for x in t]
        ok("ngrok reenvía exactamente un túnel y solo al puerto 8000", len(t) == 1 and direcciones[0].endswith(":8000"), str(direcciones))


def fase_cerrada(a):
    print(f"## Túnel cerrado: {a.api} (no debe servir datos)")
    s, h, b = pedir(f"{a.api.rstrip('/')}/api/salud", timeout=15)
    texto = b[:200].decode("utf-8", "replace")
    ok("el túnel cerrado NO devuelve datos de la API (sin respuesta, 404 de ngrok o error de conexión)", s is None or s in (404, 502, 503) and b'"status":"ok"' not in b, f"-> {s} {texto[:80]!r}")
    print("  --    Observar a mano en el panel de Netlify: pulsar «Actualizar ahora»; debe aparecer «Sin conexión con el backend… Se muestran los últimos datos válidos, leídos hace …» y conservarse el mapa.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", required=True)
    ap.add_argument("--sitio")
    ap.add_argument("--fase", choices=("abierta", "cerrada", "reabierta"), default="abierta")
    ap.add_argument("--inspector")
    ap.add_argument("--env", default=".env", help="archivo con API_CLAVE_ACCESO (por defecto .env); la clave se lee en memoria y no se imprime")
    ap.add_argument("--local", action="store_true", help="prueba del propio script contra la API local (acepta /docs, http)")
    a = ap.parse_args()
    global CLAVE
    try:
        for linea in open(a.env, encoding="utf-8"):
            if linea.startswith("API_CLAVE_ACCESO=") and linea.split("=", 1)[1].strip():
                CLAVE = linea.split("=", 1)[1].strip()
    except OSError:
        pass
    print(f"# clave de acceso: {'cargada del ' + a.env + ' (no se muestra)' if CLAVE else 'no definida (la API se verifica sin clave)'}")
    print(f"# 6.6 T047 - verificación de la publicación (fase {a.fase})")
    (fase_cerrada if a.fase == "cerrada" else fase_abierta)(a)
    if a.fase == "reabierta":
        print("  --    Observar a mano: sin tocar el panel, la recuperación llega en el siguiente reintento (≤ 30 s con la pestaña visible; con la oculta, al volver a verla) y aparece «Conexión recuperada».")
    print(f"\nRESULTADO: {'OK' if not fallos else 'FALLAN ' + str(len(fallos))}")
    sys.exit(1 if fallos else 0)


main()
