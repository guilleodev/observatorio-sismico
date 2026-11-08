"""Mutaciones del paso 5.6, backend (F5, T039-T040): cada cambio deliberado del código de producción DEBE hacer fallar alguna prueba; se restaura siempre el original.

Uso (contenedor de pruebas, con /app montado):  python /scripts5/mutaciones_56.py
"""

import subprocess
import sys
from pathlib import Path

SRC = Path("/app/src/observatorio/api")
PRUEBAS = ["tests/unit/test_api_salud.py", "tests/unit/test_api_eventos.py", "tests/unit/test_last_ingestion.py", "tests/unit/test_aislamiento_api.py"]

# (descripción, archivo, original, mutante)
MUTACIONES = [
    ("el umbral de «desactualizado» es inclusivo (>=)", "main.py", "edad > config.obsoleta_s", "edad >= config.obsoleta_s"),
    ("sin ninguna ingesta no se considera desactualizado", "main.py", "\"stale\": edad is None or edad > config.obsoleta_s", "\"stale\": edad is not None and edad > config.obsoleta_s"),
    ("la edad con reloj en el futuro sale negativa", "main.py", "max(0, (generado - estado.last_ingestion) // 1000)", "(generado - estado.last_ingestion) // 1000"),
    ("la edad se calcula en décimas de segundo", "main.py", "(generado - estado.last_ingestion) // 1000)", "(generado - estado.last_ingestion) // 100)"),
    ("generated usa el reloj de la máquina y no el inyectado", "main.py", "        generado = reloj()  # la edad", "        generado = ahora_ms()  # la edad"),
    ("el umbral mostrado no es el configurado", "main.py", "\"stale_after_s\": config.obsoleta_s", "\"stale_after_s\": 300"),
    ("los huecos recuperados también se cuentan", "comparacion.py", "WHERE estado = 'pendiente'\"  # para /api/salud", "WHERE TRUE\"  # para /api/salud"),
    ("la cobertura usa min(event_time)", "comparacion.py", "SELECT (extract(epoch FROM min(ingested_at) - interval '24 hours')", "SELECT (extract(epoch FROM min(event_time) - interval '24 hours')"),
    ("con la base caída /api/salud sale sana", "repositorio.py", "            raise BaseDatosNoDisponible(type(exc).__name__) from exc\n        return EstadoSalud(", "            return EstadoSalud(None, None, 0)\n        return EstadoSalud("),
    ("last_ingestion se toma del evento más reciente", "repositorio.py", "return EstadoSalud(ingestion[0] if ingestion else None, cobertura, huecos)", "return EstadoSalud(cobertura, cobertura, huecos)"),
]


def ejecutar() -> tuple[int, str]:
    p = subprocess.run([sys.executable, "-m", "pytest", "-q", "-x", "-p", "no:cacheprovider", *PRUEBAS], cwd="/app", capture_output=True, text=True)
    resumen = [l for l in p.stdout.splitlines() if l.startswith(("FAILED", "ERROR")) or " passed" in l or " failed" in l]
    return p.returncode, (resumen[0] if resumen else "")


base_rc, base_txt = ejecutar()
print(f"# 5.6 T039-T040 - mutaciones del backend de /api/salud\nBase sin mutar: {'OK' if base_rc == 0 else 'FALLA'} ({base_txt})\n")
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
    estado = "DETECTADA" if rc != 0 else "SOBREVIVE"
    if rc == 0:
        supervivientes.append(descripcion)
    print(f"  {estado:10} {descripcion}  [{txt[:110]}]")
final_rc, final_txt = ejecutar()
print(f"\nRestaurado: {'OK' if final_rc == 0 else 'FALLA'} ({final_txt})")
print(f"Mutaciones: {len(MUTACIONES)} | detectadas: {len(MUTACIONES) - len(supervivientes)} | supervivientes: {supervivientes or 'ninguna'}")
raise SystemExit(1 if supervivientes or final_rc else 0)
