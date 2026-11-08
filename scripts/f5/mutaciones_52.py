"""Mutaciones del paso 5.2 (F5, T014): cada cambio deliberado del código de producción DEBE hacer fallar alguna prueba; se restaura siempre el original.

Uso (contenedor de pruebas, con /app montado):  python /scripts5/mutaciones_52.py
"""

import subprocess
import sys
from pathlib import Path

SRC = Path("/app/src/observatorio/api")
PRUEBAS = ["tests/unit/test_api_filtros.py", "tests/unit/test_api_estadisticas.py", "tests/unit/test_api_equivalencia.py", "tests/unit/test_api_eventos_filtros.py", "tests/unit/test_api_paginacion.py", "tests/unit/test_api_eventos.py"]

# (descripción, archivo, original, mutante)
MUTACIONES = [
    ("los nulos de magnitud/profundidad se cuentan en el primer intervalo", "estadisticas.py", "WHEN {columna} IS NULL THEN NULL", "WHEN {columna} IS NULL THEN 0"),
    ("el borde del intervalo pasa a ser inclusivo por la derecha", "estadisticas.py", 'f"WHEN {columna} < {b} THEN {i}"', 'f"WHEN {columna} <= {b} THEN {i}"'),
    ("el último intervalo abierto se funde con el anterior", "estadisticas.py", "ELSE {len(bordes)} END", "ELSE {len(bordes) - 1} END"),
    ("los intervalos vacíos no valen 0", "estadisticas.py", 'recuentos.get(i, 0)', 'recuentos.get(i, 1)'),
    ("los eventos sin asignar se cuentan como país", "estadisticas.py", "        if resultado is None:", "        if False:"),
    ("los eventos sin país no llevan nombre «Sin país asignado»", "estadisticas.py", 'NOMBRE_SIN_PAIS = "Sin país asignado"', 'NOMBRE_SIN_PAIS = "Desconocido"'),
    ("países sin ordenar por recuento", "estadisticas.py", 'key=lambda i: (-i["count"], i["country_id"] or "")', 'key=lambda i: (i["country_id"] or "")'),
    ("el total ignora el umbral de magnitud en sin_magnitud", "estadisticas.py", 'filas("SELECT count(*) FROM live.evento_actual WHERE {donde} AND mag IS NULL", sin_umbral, parametros_sin_umbral)', 'filas("SELECT count(*) FROM live.evento_actual WHERE {donde} AND mag IS NULL", donde, parametros)'),
    ("el total se calcula sin el filtro de país", "estadisticas.py", 'filas("SELECT count(*) FROM live.evento_actual WHERE {donde}", donde, parametros)', 'filas("SELECT count(*) FROM live.evento_actual", "TRUE", {})'),
    ("el recuento por país lee otra tabla", "estadisticas.py", "FROM live.evento_actual WHERE {donde} GROUP BY country_id, geo_resultado", "FROM historico.evento WHERE TRUE GROUP BY country_id, geo_resultado"),
    ("estadísticas acepta limit/offset", "main.py", "comprobar_parametros(peticion, PARAMETROS_FILTRO)", "comprobar_parametros(peticion, PARAMETROS_EVENTOS)"),
    ("estadísticas no valida el país", "repositorio.py", "                await _validar_pais(conn, filtros)\n                return await estadisticas.calcular", "                return await estadisticas.calcular"),
    ("estadísticas sin instantánea consistente (READ COMMITTED)", "repositorio.py", 'r"-c default_transaction_isolation=repeatable\ read " + ', ""),
    ("estadísticas con la base caída devuelven un diccionario vacío", "repositorio.py", "                return await estadisticas.calcular(conn, filtros)\n        except (psycopg.Error, PoolTimeout, OSError) as exc:\n            raise BaseDatosNoDisponible(type(exc).__name__) from exc",
     "                return await estadisticas.calcular(conn, filtros)\n        except (psycopg.Error, PoolTimeout, OSError):\n            return {'total': 0}"),
    ("min_mag no se refleja en filters", "main.py", '"min_mag": None if filtros.min_mag is None else float(filtros.min_mag)', '"min_mag": None'),
]


def ejecutar() -> tuple[int, str]:
    p = subprocess.run([sys.executable, "-m", "pytest", "-q", "-x", "-p", "no:cacheprovider", *PRUEBAS], cwd="/app", capture_output=True, text=True)
    resumen = [l for l in p.stdout.splitlines() if l.startswith(("FAILED", "ERROR")) or " passed" in l or " failed" in l]
    return p.returncode, (resumen[0] if resumen else "")


base_rc, base_txt = ejecutar()
print(f"# 5.2 T014 - mutaciones del paso 5.2\nBase sin mutar: {'OK' if base_rc == 0 else 'FALLA'} ({base_txt})\n")
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
