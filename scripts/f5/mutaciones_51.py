"""Mutaciones del paso 5.1 (F5, T008): cada cambio deliberado del código de producción DEBE hacer fallar alguna prueba; se restaura siempre el original.

Uso (contenedor de pruebas, con /app montado):  python /scripts5/mutaciones_51.py
"""

import subprocess
import sys
from pathlib import Path

SRC = Path("/app/src/observatorio/api")
PRUEBAS = ["tests/unit/test_api_filtros.py", "tests/unit/test_api_eventos_filtros.py", "tests/unit/test_api_paginacion.py", "tests/unit/test_api_eventos.py"]

# (descripción, archivo, original, mutante)
MUTACIONES = [
    ("end deja de ser exclusivo (< pasa a <=)", "filtros.py", '"event_time < %(f_end)s"', '"event_time <= %(f_end)s"'),
    ("start deja de ser inclusivo (>= pasa a >)", "filtros.py", '"event_time >= %(f_start)s"', '"event_time > %(f_start)s"'),
    ("se incluyen los eventos retirados", "filtros.py", '"event_time < %(f_end)s", "NOT retirado"]', '"event_time < %(f_end)s"]'),
    ("min_mag exclusivo (>= pasa a >)", "filtros.py", '"mag >= %(f_min_mag)s"', '"mag > %(f_min_mag)s"'),
    ("la magnitud nula se trata como 0", "filtros.py", '"mag >= %(f_min_mag)s"', '"coalesce(mag, 0) >= %(f_min_mag)s"'),
    ("sin_pais por country_id nulo (incluye los sin asignar)", "filtros.py", '"geo_resultado = \'sin_pais\'"', '"country_id IS NULL"'),
    ("el país no se filtra", "filtros.py", '        elif self.country_id is not None:\n            condiciones.append("country_id = %(f_country)s")\n            parametros["f_country"] = self.country_id\n', ""),
    ("limit se recorta en silencio", "filtros.py", "    if not 1 <= lim <= maximo:\n        raise", "    lim = min(max(lim, 1), maximo)\n    if False:\n        raise"),
    ("start >= end se acepta", "filtros.py", "    if inicio >= fin:", "    if False:"),
    ("el país en minúsculas no se normaliza", "filtros.py", "else codigo.upper()", "else codigo"),
    ("sin_magnitud ignora el umbral de magnitud", "repositorio.py", "SQL_SIN_MAGNITUD.format(donde=donde_sin_umbral), parametros_sin_umbral", "SQL_SIN_MAGNITUD.format(donde=donde), parametros"),
    ("sin desempate por id", "repositorio.py", "ORDER BY event_time DESC, event_id ASC", "ORDER BY event_time DESC"),
    ("truncated con <= en vez de <", "repositorio.py", "truncado = offset + len(eventos) < total", "truncado = offset + len(eventos) <= total"),
    ("next_offset siempre presente", "repositorio.py", "\"next_offset\": offset + len(eventos) if truncado else None", "\"next_offset\": offset + len(eventos)"),
    ("sin instantánea consistente (READ COMMITTED)", "repositorio.py", r'r"-c default_transaction_isolation=repeatable\ read " + ', ""),
    ("la sesión de la API deja de ser de solo lectura", "repositorio.py", '"-c default_transaction_read_only=on "', '"-c default_transaction_read_only=off "'),
    ("un país desconocido se acepta", "repositorio.py", "if existe is None:", "if False:"),
    ("la cobertura usa min(event_time)", "repositorio.py", "min(ingested_at) - interval", "min(event_time) - interval"),
    ("un parámetro desconocido se ignora", "main.py", "        if nombre not in admitidos:", "        if False:"),
    ("un parámetro repetido se acepta", "main.py", "        if nombre in vistos:", "        if False:"),
    ("la base caída devuelve una lista vacía", "repositorio.py", "        except (psycopg.Error, PoolTimeout, OSError) as exc:\n            raise BaseDatosNoDisponible(type(exc).__name__) from exc\n        eventos = [",
     "        except (psycopg.Error, PoolTimeout, OSError):\n            return PaginaEventos([], 0, 0, None, None)\n        eventos = ["),
]


def ejecutar() -> tuple[int, str]:
    p = subprocess.run([sys.executable, "-m", "pytest", "-q", "-x", "-p", "no:cacheprovider", *PRUEBAS], cwd="/app", capture_output=True, text=True)
    resumen = [l for l in p.stdout.splitlines() if l.startswith(("FAILED", "ERROR")) or " passed" in l or " failed" in l]
    return p.returncode, (resumen[0] if resumen else "")


base_rc, base_txt = ejecutar()
print(f"# 5.1 T008 - mutaciones del paso 5.1\nBase sin mutar: {'OK' if base_rc == 0 else 'FALLA'} ({base_txt})\n")
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
