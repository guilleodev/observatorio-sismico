"""Mutaciones del paso 6.2 (F6, T024): cada cambio deliberado del código de producción DEBE hacer fallar alguna prueba; el original se restaura SIEMPRE.

Las pruebas se escribieron a la vez que el código y pasaron a la primera: esto es la compensación (como en 6.1).
Backend (contenedor de pruebas, /app montado):   bash scripts/f6/ejecutar.sh python -u /scripts6/mutaciones_62.py
Frontend (Node en el equipo, desde la raíz):     node scripts/f6/mutaciones_62_front.mjs
"""

import os
import subprocess
import sys
from pathlib import Path

SRC = Path("/app/src/observatorio")
TIEMPO_MAXIMO_S = 120
PRUEBAS = ["tests/unit/test_api_replay.py", "tests/unit/test_aislamiento_api.py", "tests/unit/test_api_filtros.py", "tests/unit/test_api_eventos.py",
           "tests/unit/test_api_estadisticas.py", "tests/unit/test_api_salud.py", "tests/unit/test_aislamiento.py"]

# (descripción, archivo relativo a observatorio/, original, mutante)
MUTACIONES = [
    ("mode se ignora: cualquier valor se acepta", "api/filtros.py", "    if modo not in MODOS_CONTRACTUALES:", "    if False:"),
    ("run se admite con mode=live", "api/filtros.py", "    if modo != MODO_REPLAY:\n        raise ErrorParametro(\"run solo", "    if False:\n        raise ErrorParametro(\"run solo"),
    ("run con formato libre (sin validar)", "api/filtros.py", "    if not _RUN_VALIDO.match(run):", "    if False:"),
    ("replay lee live.evento_actual (el selector no cambia el esquema)", "api/filtros.py", 'return sql.replace("live.evento_actual", "replay.evento_actual")', "return sql"),
    ("replay no filtra por ejecución", "api/filtros.py", 'condiciones.append("run_id = %(f_run)s")', 'condiciones.append("TRUE")'),
    ("sin ejecuciones, replay devuelve todas las filas", "api/filtros.py", 'condiciones.append("run_id IS NULL")', 'condiciones.append("TRUE")'),
    ("periodo de 24 h en replay", "api/filtros.py", "        if modo == MODO_REPLAY and intervalo is not None:", "        if False:"),
    ("el último evento queda fuera del periodo (hasta sin +1 ms)", "api/filtros.py", "desde_ms(intervalo[1] + 1)", "desde_ms(intervalo[1])"),
    ("un run inexistente se ignora en silencio", "api/main.py", "        if ejecucion is None and run_id is not None:", "        if False:"),
    ("metadata.replay ausente en /api/eventos", "api/main.py", "sin_magnitud=pagina.sin_magnitud, period=filtros.periodo, replay=ejecucion)", "sin_magnitud=pagina.sin_magnitud, period=filtros.periodo, replay=None)"),
    ("/api/salud sin bloque replay", "api/main.py", '            respuesta["replay"] = ejecucion', "            pass"),
    ("/api/estadisticas sin mode/replay en la respuesta", "api/main.py", '            respuesta |= {"mode": modo, "replay": ejecucion}', "            pass"),
    ("las estadísticas de replay calculan la comparación en vivo", "api/estadisticas.py", "(dict(COMPARACION_NO_APLICA) if filtros.modo == MODO_REPLAY", "(dict(COMPARACION_NO_APLICA) if False"),
    ("las estadísticas de replay leen live", "api/estadisticas.py", "para_modo(sql, filtros.modo).format(donde=donde_)", "sql.format(donde=donde_)"),
    ("el total de replay se cuenta en live", "api/repositorio.py", "para_modo(SQL_TOTAL, filtros.modo)", "SQL_TOTAL"),
    ("el caso y el instante de reproducción se pierden", "api/repositorio.py", '**({"caso": f[11], "replayed_at": f[12]} if replay else {})', "**{}"),
    ("las propiedades de replay aparecen también en vivo", "api/repositorio.py", '**({"caso": e["caso"], "replayed_at": e["replayed_at"]} if es_replay else {}),', '**({"caso": None, "replayed_at": None}),'),
    ("replay devuelve campos de replay también en vivo (metadata)", "api/repositorio.py", "    if es_replay:  # contracts/f6.md", "    if True:  # contracts/f6.md"),
    ("por defecto se elige la ejecución más antigua", "api/replay.py", "ORDER BY iniciada_at DESC, run_id DESC LIMIT 1", "ORDER BY iniciada_at ASC, run_id ASC LIMIT 1"),
    ("la velocidad de la ejecución se pierde", "api/replay.py", '"velocidad": None if velocidad is None else float(velocidad),', '"velocidad": None,'),
    ("el intervalo de la ejecución se invierte", "api/replay.py", '"intervalo": {"desde": desde, "hasta": hasta}', '"intervalo": {"desde": hasta, "hasta": desde}'),
    ("la cobertura de replay no es el intervalo de la ejecución", "api/repositorio.py", 'dict(replay["intervalo"])', '{"desde": None, "hasta": None}'),
]


def ejecutar() -> tuple[int, str]:
    try:  # un mutante puede colgar las pruebas: se corta y cuenta como detectado
        p = subprocess.run([sys.executable, "-m", "pytest", "-q", "-x", "-p", "no:cacheprovider", *PRUEBAS], cwd="/app", capture_output=True, text=True, env=os.environ, timeout=TIEMPO_MAXIMO_S)
    except subprocess.TimeoutExpired:
        return 1, f"TIMEOUT de {TIEMPO_MAXIMO_S} s"
    resumen = [l for l in p.stdout.splitlines() if l.startswith(("FAILED", "ERROR")) or " passed" in l or " failed" in l]
    return p.returncode, (resumen[0] if resumen else "")


base_rc, base_txt = ejecutar()
print(f"# 6.2 T024 - mutaciones del backend\nBase sin mutar: {'OK' if base_rc == 0 else 'FALLA'} ({base_txt})\n")
if base_rc:
    raise SystemExit("la base ya falla: no se puede evaluar ninguna mutación")
supervivientes = []
for descripcion, archivo, original, mutante in MUTACIONES:
    ruta = SRC / archivo
    texto = ruta.read_text(encoding="utf-8")
    if texto.count(original) != 1:
        print(f"  ?? {descripcion}: el original aparece {texto.count(original)} veces (se esperaba 1)")
        supervivientes.append(descripcion + " (no aplicable)")
        continue
    try:
        ruta.write_text(texto.replace(original, mutante, 1), encoding="utf-8")
        rc, txt = ejecutar()
    finally:
        ruta.write_text(texto, encoding="utf-8")
    if rc == 0:
        supervivientes.append(descripcion)
    print(f"  {'DETECTADA' if rc else 'SOBREVIVE':10} {descripcion}  [{txt[:110]}]")

final_rc, final_txt = ejecutar()
print(f"\nRestaurado: {'OK' if final_rc == 0 else 'FALLA'} ({final_txt})")
print(f"Mutaciones: {len(MUTACIONES)} | detectadas: {len(MUTACIONES) - len(supervivientes)} | supervivientes: {supervivientes or 'ninguna'}")
raise SystemExit(1 if supervivientes or final_rc else 0)
