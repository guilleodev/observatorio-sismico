"""Mutaciones del frontend (F5, paso 5.4, T025-T027): cada cambio deliberado de la lógica pura DEBE hacer fallar alguna prueba de `node --test`; se restaura siempre el original.

Uso (desde la raíz del repositorio, con Node 24):  py -3.13 scripts/f5/mutaciones_54.py
"""

import os
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2] / "frontend"
APP = RAIZ / "src" / "app"
ENTORNO = {**os.environ, "NODE_NO_WARNINGS": "1"}

# (descripción, archivo, original, mutante)
MUTACIONES = [
    ("la ventana usa el reloj del navegador y no generated", "filtros.ts", "return { startMs: generadoMs - DIA_MS, endMs: generadoMs };\n}", "return { startMs: Date.now() - DIA_MS, endMs: Date.now() };\n}"),
    ("los últimos 7 días son 6", "filtros.ts", "generadoMs - 7 * DIA_MS", "generadoMs - 6 * DIA_MS"),
    ("«desde = hasta» se acepta", "filtros.ts", "desde >= hasta", "desde > hasta"),
    ("el periodo personalizado sin fechas se acepta", "filtros.ts", "if (desde === undefined && hasta === undefined) errores.push", "if (false) errores.push"),
    ("min_mag no viaja a la API", "filtros.ts", "if (typeof mag === 'number') p['min_mag'] = String(mag);", ""),
    ("sin_pais se pasa a mayúsculas", "filtros.ts", "pais.toLowerCase() === SIN_PAIS ? SIN_PAIS : pais.toUpperCase()", "pais.toUpperCase()"),
    ("el país en minúsculas no se normaliza", "filtros.ts", ": pais.toUpperCase();", ": pais;"),
    ("el 31 de febrero se acepta", "filtros.ts", "return coincide && anio >= 1970", "return true && anio >= 1970"),
    ("una magnitud infinita se acepta", "filtros.ts", "return Number.isFinite(v) ? v : null;", "return v;"),
    ("start sin zona horaria", "filtros.ts", "start: new Date(ventana.startMs).toISOString()", "start: new Date(ventana.startMs).toString()"),
    ("el catálogo no se ordena por nombre", "filtros.ts", ".sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))", ""),
    ("un 422 se trata como error de servidor", "api.service.ts", "respuesta.status === 422", "respuesta.status === 4220"),
    ("las páginas siguientes no llevan offset (repiten la primera)", "api.service.ts", "{ ...params, offset: String(offset) }", "params"),
    ("la guarda de páginas corta una página más tarde", "api.service.ts", "paginas >= this.maxPaginas", "paginas > this.maxPaginas"),
    ("la guarda de páginas finge que está completo", "api.service.ts", "paginas, incompleta: true }", "paginas, incompleta: false }"),
    ("una petición nueva no cancela a la anterior", "api.service.ts", "    this.control?.abort();\n    this.control = new AbortController();", "    this.control = new AbortController();"),
    ("toda respuesta tardía es vigente", "api.service.ts", "return id === this.id;", "return true;"),
    ("la cabecera de ngrok nunca se envía", "api.service.ts", "if (this.omitirAvisoNgrok) headers", "if (false) headers"),
    ("no hay respaldo si /api/salud no trae generated", "api.service.ts", "if (this.generadoEnSalud !== false) {", "if (true) {"),
    ("el tiempo agotado se confunde con fallo de red", "api.service.ts", "if (nombre === 'TimeoutError')", "if (nombre === 'XTimeoutError')"),
    ("el corte de color a 70 km es inclusivo", "formato.ts", "p < 70 ?", "p <= 70 ?"),
    ("sin magnitud el radio es 0", "formato.ts", "return m === null ? 4 :", "return m === null ? 0 :"),
]


def ejecutar() -> tuple[int, str]:
    p = subprocess.run(["node", "--test", *sorted(str(f.relative_to(RAIZ)) for f in (RAIZ / "tests").glob("*.test.ts"))], cwd=RAIZ, capture_output=True, text=True, env=ENTORNO, timeout=300)
    lineas = [l for l in p.stdout.splitlines() if l.startswith("✖") or l.startswith("ℹ pass") or l.startswith("ℹ fail")]
    return p.returncode, " | ".join(lineas[:2])


base_rc, base_txt = ejecutar()
print(f"# 5.4 T025-T027 - mutaciones del frontend\nBase sin mutar: {'OK' if base_rc == 0 else 'FALLA'} ({base_txt})\n")
if base_rc:
    sys.exit("la base ya falla: no se puede evaluar ninguna mutación")
supervivientes = []
for descripcion, archivo, original, mutante in MUTACIONES:
    ruta = APP / archivo
    texto = ruta.read_text(encoding="utf-8")
    if texto.count(original) != 1:
        print(f"  ??  {descripcion}: el original aparece {texto.count(original)} veces (se esperaba 1)")
        supervivientes.append(descripcion + " (no aplicable)")
        continue
    try:
        ruta.write_text(texto.replace(original, mutante, 1), encoding="utf-8", newline="\n")
        rc, txt = ejecutar()
    finally:
        ruta.write_text(texto, encoding="utf-8", newline="\n")
    if rc == 0:
        supervivientes.append(descripcion)
    print(f"  {'DETECTADA' if rc else 'SOBREVIVE':10} {descripcion}  [{txt[:100]}]")
final_rc, final_txt = ejecutar()
print(f"\nRestaurado: {'OK' if final_rc == 0 else 'FALLA'} ({final_txt})")
print(f"Mutaciones: {len(MUTACIONES)} | detectadas: {len(MUTACIONES) - len(supervivientes)} | supervivientes: {supervivientes or 'ninguna'}")
sys.exit(1 if supervivientes or final_rc else 0)
