"""Mutaciones del frontend (F5, paso 5.5, T032-T036): cada cambio deliberado de la lógica pura DEBE hacer fallar alguna prueba de `node --test`; se restaura siempre el original.

Uso (desde la raíz del repositorio, con Node 24):  py -3.13 scripts/f5/mutaciones_55.py
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
    ("los nulos se ordenan al principio", "tabla.ts", "if (x === null) return 1;", "if (x === null) return -1;"),
    ("una columna nueva empieza siempre en ascendente", "tabla.ts", "DESCENDENTE_PRIMERO.includes(clave) ? 'desc' : 'asc'", "'asc'"),
    ("la búsqueda distingue mayúsculas", "tabla.ts", ".toLowerCase().trim();", ".trim();"),
    ("la búsqueda exige solo una palabra", "tabla.ts", "palabras.every(", "palabras.some("),
    ("la página no se ajusta al máximo", "tabla.ts", "Math.min(Math.max(1, Math.trunc(pagina) || 1), paginas)", "Math.max(1, Math.trunc(pagina) || 1)"),
    ("paginaDe se equivoca en una página", "tabla.ts", "Math.floor(i / tamano) + 1", "Math.floor(i / tamano)"),
    ("el corte de clase de profundidad es inclusivo", "tabla.ts", "profundidad < 70 ? 'Menos de 70 km'", "profundidad <= 70 ? 'Menos de 70 km'"),
    ("el evento sin id pierde su identificador derivado", "tabla.ts", "`sin-id-${indice}`", "'sin-id'"),
    ("NaN llega a la tabla como número", "tabla.ts", "typeof v === 'number' && Number.isFinite(v) ? v : null", "typeof v === 'number' ? v : null"),
    ("un evento sin país aparece vacío", "tabla.ts", "p?.country_name ?? SIN_PAIS_TEXTO", "p?.country_name ?? ''"),
    ("el empate de ordenación no se desempata por id", "tabla.ts", "return c !== 0 ? signo * c : porId(a, b);", "return signo * c;"),
    ("el máximo redondo salta de 2 a 5", "graficas.ts", "f <= 2 ? 2", "f <= 2 ? 5"),
    ("las barras inventan una altura mínima", "graficas.ts", "const h = Math.max(0, v) / maximo * altoUtil;", "const h = Math.max(1, v) / maximo * altoUtil;"),
    ("las etiquetas del eje se solapan (floor)", "graficas.ts", "Math.ceil(n / maxEtiquetas)", "Math.floor(n / maxEtiquetas)"),
    ("el extremo abierto se escribe con >", "graficas.ts", "`≥ ${num(desde)}`", "`> ${num(desde)}`"),
    ("«Sin país asignado» desaparece del gráfico", "graficas.ts", "if (sinPais) items.push", "if (false) items.push"),
    ("«Otros» suma países en vez de eventos", "graficas.ts", "resto.reduce((s, i) => s + i.count, 0)", "resto.length"),
    ("la hora se escribe en hora local", "graficas.ts", "d.getUTCHours()", "d.getHours()"),
    ("el cero tiene signo negativo", "comparacion.ts", "pct >= 0 ? '+' : '−'", "pct > 0 ? '+' : '−'"),
    ("media 0 se presenta como 0 %", "comparacion.ts", "'no definida (la media de 2025 para este filtro es 0)'", "'0 %'"),
    ("el recuento reciente se atribuye al histórico", "comparacion.ts", "valor: String(c.reciente.count), fuente: 'Feed en vivo (live)'", "valor: String(c.reciente.count), fuente: 'Histórico de 2025 (historico)'"),
    ("se muestran filas de 2025 sin histórico", "comparacion.ts", "if (c.historico) {", "if (true) {"),
    ("no se avisa de la magnitud elevada a 4", "comparacion.ts", "c.min_mag_elevada ? 'La comparación", "false ? 'La comparación"),
    ("con M4,5 se avisa de cobertura baja", "comparacion.ts", "c.min_mag_efectiva < MAG_COBERTURA_COMPLETA", "c.min_mag_efectiva <= MAG_COBERTURA_COMPLETA"),
    ("el aviso de periodo incompleto se invierte", "comparacion.ts", "incompleto: c.periodo_reciente_incompleto", "incompleto: !c.periodo_reciente_incompleto"),
    ("un motivo desconocido rompe el panel", "comparacion.ts", "MOTIVOS[motivo] ?? motivo", "MOTIVOS[motivo]"),
    ("las estadísticas se piden con otros filtros", "api.service.ts", "this.estadisticas(params, externa)]", "this.estadisticas({}, externa)]"),
    ("no se valida la forma de las estadísticas", "api.service.ts", "|| !d.comparacion?.reciente", "|| false"),
    ("se redondea el valor y no la presentación (ceros sobrantes)", "formato.ts", "Number(n.toFixed(decimales))", "n.toFixed(decimales)"),
]


def ejecutar() -> tuple[int, str]:
    p = subprocess.run(["node", "--test", *sorted(str(f.relative_to(RAIZ)) for f in (RAIZ / "tests").glob("*.test.ts"))], cwd=RAIZ, capture_output=True, text=True, env=ENTORNO, timeout=300)
    lineas = [l for l in p.stdout.splitlines() if l.startswith("✖") or l.startswith("ℹ pass") or l.startswith("ℹ fail")]
    return p.returncode, " | ".join(lineas[:2])


base_rc, base_txt = ejecutar()
print(f"# 5.5 T032-T036 - mutaciones del frontend\nBase sin mutar: {'OK' if base_rc == 0 else 'FALLA'} ({base_txt})\n")
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
