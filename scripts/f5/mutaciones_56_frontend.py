"""Mutaciones del frontend (F5, paso 5.6, T041-T042): cada cambio deliberado de la lógica pura DEBE hacer fallar alguna prueba de `node --test`; se restaura siempre el original.

Uso (desde la raíz del repositorio, con Node 24):  py -3.13 scripts/f5/mutaciones_56_frontend.py
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
    ("los segundos de la edad no llevan cero a la izquierda", "estado.ts", "String(s % 60).padStart(2, '0')", "String(s % 60)"),
    ("la edad de la lectura puede salir negativa", "estado.ts", "Math.max(0, ahoraMonotonico - lecturaMonotonica)", "ahoraMonotonico - lecturaMonotonica"),
    ("tras un fallo se espera refreshMs en vez de reintentar pronto", "estado.ts", "return correcto ? Math.max(minimoMs, Number(refreshMs) || 60000) : minimoMs;", "return Math.max(minimoMs, Number(refreshMs) || 60000);"),
    ("un 422 se trata como sin conexión", "estado.ts", "if (e.error && e.error.tipo === 'validacion') {", "if (false) {"),
    ("«desactualizado» se muestra aunque no haya conexión", "estado.ts", "if (!e.error && e.salud && e.salud.stale === true) {", "if (e.salud && e.salud.stale === true) {"),
    ("«sin eventos» se muestra aunque haya un error de conexión", "estado.ts", "if (!e.error && e.hayLectura && e.cargados === 0", "if (e.hayLectura && e.cargados === 0"),
    ("el aviso de truncado salta con todos los eventos cargados", "estado.ts", "e.cargados < e.total", "e.cargados <= e.total"),
    ("se avisa de huecos aunque haya 0", "estado.ts", "e.salud.gaps_pending > 0", "e.salud.gaps_pending >= 0"),
    ("se anuncia la recuperación con el error vigente", "estado.ts", "if (!e.error && e.recuperadoEn) {", "if (e.recuperadoEn) {"),
    ("un 422 hace que el estado general sea sin conexión", "estado.ts", "if (e.error && e.error.tipo !== 'validacion') return", "if (e.error) return"),
    ("la antigüedad de la ingesta se muestra en segundos como milisegundos", "estado.ts", "formatoEdad(salud.ingestion_age_s * 1000)", "formatoEdad(salud.ingestion_age_s)"),
    ("sin ingesta no se avisa de desactualizado", "estado.ts", "if (!e.error && e.salud && e.salud.stale === true) {\n    const umbral", "if (!e.error && e.salud && e.salud.stale === true && e.salud.last_ingestion) {\n    const umbral"),
    ("referencia descarta el estado de /api/salud", "api.service.ts", "return { generado: salud.generated, salud };", "return { generado: salud.generated, salud: null };"),
    ("la lectura parcial no indica qué página falta", "api.service.ts", "paginas, incompleta: true, siguiente };", "paginas, incompleta: true, siguiente: null };"),
    ("«cargar el resto» empieza otra vez desde el principio", "api.service.ts", "let offset = desde;", "let offset = 0;"),
    ("el panel pide todas las páginas en la carga inicial", "api.service.ts", "this.todasLasPaginas(params, externa, maxPaginas)", "this.todasLasPaginas(params, externa)"),
]


def ejecutar() -> tuple[int, str]:
    p = subprocess.run(["node", "--test", *sorted(str(f.relative_to(RAIZ)) for f in (RAIZ / "tests").glob("*.test.ts"))], cwd=RAIZ, capture_output=True, text=True, env=ENTORNO, timeout=300)
    lineas = [l for l in p.stdout.splitlines() if l.startswith("✖") or l.startswith("ℹ pass") or l.startswith("ℹ fail")]
    return p.returncode, " | ".join(lineas[:2])


base_rc, base_txt = ejecutar()
print(f"# 5.6 T041-T042 - mutaciones del frontend\nBase sin mutar: {'OK' if base_rc == 0 else 'FALLA'} ({base_txt})\n")
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
