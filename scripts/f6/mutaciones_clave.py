"""Mutaciones de la clave de acceso (F6, 6.6, FR-041): cada cambio deliberado debe hacer fallar alguna prueba; el original se restaura SIEMPRE.
Backend (contenedor de pruebas):   bash scripts/f6/ejecutar.sh python -u /scripts6/mutaciones_clave.py
Frontend (equipo, desde la raíz):  python scripts/f6/mutaciones_clave.py --front   (usa node --test)"""
import os
import subprocess
import sys
from pathlib import Path

FRONT = "--front" in sys.argv
RAIZ = Path(os.environ.get("RAIZ", "/app" if not FRONT else "."))
if FRONT:
    SRC, PRUEBAS, CMD, CWD = Path("frontend/src/app"), ["tests/acceso.test.ts", "tests/api.service.test.ts", "tests/estado.test.ts"], ["node", "--test", "--no-warnings"], "frontend"
    MUT = [
        ("la clave no se envía en la cabecera", "api.service.ts", "if (this.clave !== null) headers[CABECERA_CLAVE] = this.clave;", ""),
        ("la clave viaja en la URL", "api.service.ts", "const consulta = new URLSearchParams(params).toString();", "const consulta = new URLSearchParams({ ...params, ...(this.clave ? { clave: this.clave } : {}) }).toString();"),
        ("el 401 se trata como error de servidor", "api.service.ts", "if (respuesta.status === 401) return new ErrorApi('autorizacion',", "if (false) return new ErrorApi('autorizacion',"),
        ("la clave rechazada no se olvida", "app.component.ts", "this.api?.establecerClave(null); // la clave rechazada se olvida", ""),
        ("la clave se guarda en sessionStorage", "api.service.ts", "this.clave = clave && clave.trim() !== '' ? clave.trim() : null;", "this.clave = clave && clave.trim() !== '' ? clave.trim() : null; sessionStorage.setItem('c', clave ?? '');"),
        ("el campo no es de tipo contraseña", "acceso/acceso.component.ts", 'type="password"', 'type="text"'),
        ("sin clave se reintenta en bucle", "app.component.ts", "if (config.mode === 'api' && !this.pideClave()) this.programar(config, correcto);", "if (config.mode === 'api') this.programar(config, correcto);"),
        ("el aviso de acceso se confunde con una caída", "estado.ts", "if (e.error && e.error.tipo === 'autorizacion') {\n    lista.push", "if (false) {\n    lista.push"),
    ]
else:
    SRC, PRUEBAS, CMD, CWD = RAIZ / "src" / "observatorio", ["tests/unit/test_acceso_api.py", "tests/unit/test_cors_f6.py", "tests/unit/test_api_salud.py"], [sys.executable, "-m", "pytest", "-q", "-x", "-p", "no:cacheprovider"], str(RAIZ)
    MUT = [
        ("la protección se desactiva", "api/main.py", "    if clave:\n        clave_bytes", "    if False:\n        clave_bytes"),
        ("la comparación acepta cualquier clave", "api/main.py", "not hmac.compare_digest(peticion.headers.get(CABECERA_CLAVE, \"\").encode(), clave_bytes)", "False"),
        ("la comparación no es en tiempo constante (==)", "api/main.py", "not hmac.compare_digest(peticion.headers.get(CABECERA_CLAVE, \"\").encode(), clave_bytes)", "peticion.headers.get(CABECERA_CLAVE, \"\") != clave"),
        ("solo se protege /api/eventos", "api/main.py", 'peticion.url.path.startswith("/api/")', 'peticion.url.path.startswith("/api/eventos")'),
        ("el rechazo es 403 en vez de 401", "api/main.py", "JSONResponse(status_code=401, content={\"error\": \"no_autorizado\"", "JSONResponse(status_code=403, content={\"error\": \"no_autorizado\""),
        ("el middleware de la clave no se registra", "api/main.py", "        app.add_middleware(BaseHTTPMiddleware, dispatch=exigir_clave)  # el más interno: después de CORS y gzip\n", ""),
        ("CORS no admite la cabecera de la clave", "api/main.py", 'allow_headers=["ngrok-skip-browser-warning", CABECERA_CLAVE],', 'allow_headers=["ngrok-skip-browser-warning"],'),
        ("la clave sale en el repr de la configuración", "config.py", "clave_acceso: str | None = field(default=None, repr=False)", "clave_acceso: str | None = field(default=None)"),
        ("se acepta una clave débil", "config.py", "if len(valor) < 32 or not re.fullmatch", "if len(valor) < 1 or not re.fullmatch"),
        ("el error de configuración repite el valor", "config.py", 'raise ConfigError("API_CLAVE_ACCESO debe tener', 'raise ConfigError(f"{valor} API_CLAVE_ACCESO debe tener'),
    ]


def ejecutar():
    try:
        p = subprocess.run([*CMD, *PRUEBAS] if not FRONT else [*CMD, *PRUEBAS], cwd=CWD, capture_output=True, text=True, timeout=180)
    except subprocess.TimeoutExpired:
        return 1
    return p.returncode


print(f"# Mutaciones de la clave de acceso ({'frontend' if FRONT else 'backend'})")
if ejecutar() != 0:
    raise SystemExit("la base ya falla")
sup = []
for desc, archivo, a, b in MUT:
    ruta = SRC / archivo
    t = ruta.read_text(encoding="utf-8")
    if t.count(a) != 1:
        print(f"  ?? {desc}: el original aparece {t.count(a)} veces")
        sup.append(desc + " (no aplicable)")
        continue
    try:
        ruta.write_text(t.replace(a, b, 1), encoding="utf-8", newline="\n")
        rc = ejecutar()
    finally:
        ruta.write_text(t, encoding="utf-8", newline="\n")
    print(f"  {'DETECTADA' if rc else 'SOBREVIVE '} {desc}")
    if rc == 0:
        sup.append(desc)
print(f"restaurado: {'OK' if ejecutar() == 0 else 'FALLA'} | mutaciones: {len(MUT)} | detectadas: {len(MUT) - len(sup)} | supervivientes: {sup or 'ninguna'}")
raise SystemExit(1 if sup else 0)
