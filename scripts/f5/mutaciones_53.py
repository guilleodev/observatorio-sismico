"""Mutaciones del paso 5.3 (F5, T017-T021): cada cambio deliberado del código de producción DEBE hacer fallar alguna prueba; se restaura siempre el original.

Uso (contenedor de pruebas, con /app montado):  python /scripts5/mutaciones_53.py
"""

import subprocess
import sys
from pathlib import Path

SRC = Path("/app/src/observatorio/api")
PRUEBAS = ["tests/unit/test_api_horas.py", "tests/unit/test_api_comparacion.py", "tests/unit/test_api_estadisticas.py", "tests/unit/test_api_equivalencia.py", "tests/unit/test_aislamiento_api.py"]

# (descripción, archivo, original, mutante)
MUTACIONES = [
    ("casillas horarias por defecto (floor en vez de techo)", "estadisticas.py", "n = -(-(filtros.end - primera) // timedelta(hours=1))", "n = (filtros.end - primera) // timedelta(hours=1)"),
    ("hora del evento redondeada en vez de truncada", "estadisticas.py", "floor(extract(epoch FROM event_time) / 3600)", "round(extract(epoch FROM event_time) / 3600)"),
    ("las horas sin eventos no valen 0", "estadisticas.py", "(recuentos or {}).get(primera + i * HORA_MS, 0)", "(recuentos or {}).get(primera + i * HORA_MS, 1)"),
    ("el límite de casillas se aplica con >=", "estadisticas.py", "    if n > max_casillas:", "    if n >= max_casillas:"),
    ("la serie omitida devuelve una lista vacía y no null", "estadisticas.py", '"items": None, "motivo"', '"items": [], "motivo"'),
    ("el límite de casillas se ignora", "main.py", "generado, config.max_ventana_horas, config.margen_publicacion_s", "generado, 10**9, config.margen_publicacion_s"),
    ("2025 con 364 días", "comparacion.py", "DIAS_HISTORICO = (H_HASTA - H_DESDE).days", "DIAS_HISTORICO = (H_HASTA - H_DESDE).days - 1"),
    ("la magnitud mínima efectiva no se eleva a 4", "comparacion.py", "efectiva = max(filtros.min_mag if filtros.min_mag is not None else Decimal(MAG_MINIMA), Decimal(MAG_MINIMA))", "efectiva = filtros.min_mag if filtros.min_mag is not None else Decimal(MAG_MINIMA)"),
    ("el esperado no se multiplica por los días de la ventana", "comparacion.py", "esperado = media * dias_ventana", "esperado = media"),
    ("la variación con media 0 se calcula igualmente", "comparacion.py", "    if esperado > 0:", "    if True:"),
    ("el histórico incluye otros tipos de evento", "comparacion.py", "AND raw -> 'properties' ->> 'type' = 'earthquake' ", ""),
    ("el histórico usa magnitud > en vez de >=", "comparacion.py", "AND mag >= %(min_mag)s AND \" + AMBITO", "AND mag > %(min_mag)s AND \" + AMBITO"),
    ("el histórico ignora el ámbito geográfico", "comparacion.py", "AND mag >= %(min_mag)s AND \" + AMBITO", "AND mag >= %(min_mag)s\""),
    ("la mediana se sustituye por la media", "comparacion.py", "SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY eventos)", "SELECT avg(eventos)"),
    ("sin histórico se inventan ceros", "comparacion.py", "    if not await uno(SQL_HISTORICO_DISPONIBLE, h):", "    if False:"),
    ("hueco con límites inclusivos", "comparacion.py", "AND inicio < %(f_end)s AND fin > %(f_start)s", "AND inicio <= %(f_end)s AND fin >= %(f_start)s"),
    ("los huecos recuperados también marcan", "comparacion.py", "WHERE estado = 'pendiente' AND", "WHERE TRUE AND"),
    ("cobertura con <= en vez de <", "comparacion.py", "inicio_ms < cobertura", "inicio_ms <= cobertura"),
    ("hasta_ahora con >=", "comparacion.py", "fin_ms > generado_ms - margen_publicacion_s * 1000", "fin_ms >= generado_ms - margen_publicacion_s * 1000"),
    ("última lectura con >=", "comparacion.py", "fin_ms > ultima", "fin_ms >= ultima"),
    ("el margen de publicación se ignora", "comparacion.py", "generado_ms - margen_publicacion_s * 1000", "generado_ms"),
    ("el histórico cuenta eventos del estado en vivo", "comparacion.py", "SQL_HISTORICO_TOTAL = \"SELECT count(*) FROM historico.evento WHERE \"", "SQL_HISTORICO_TOTAL = \"SELECT count(*) FROM live.evento_actual WHERE \""),
]


def ejecutar() -> tuple[int, str]:
    p = subprocess.run([sys.executable, "-m", "pytest", "-q", "-x", "-p", "no:cacheprovider", *PRUEBAS], cwd="/app", capture_output=True, text=True)
    resumen = [l for l in p.stdout.splitlines() if l.startswith(("FAILED", "ERROR")) or " passed" in l or " failed" in l]
    return p.returncode, (resumen[0] if resumen else "")


base_rc, base_txt = ejecutar()
print(f"# 5.3 T017-T021 - mutaciones del paso 5.3\nBase sin mutar: {'OK' if base_rc == 0 else 'FALLA'} ({base_txt})\n")
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
