"""Mutaciones del paso 6.1 (F6, T013): cada cambio deliberado del código de producción o del esquema DEBE hacer fallar alguna prueba; se restaura siempre el original.

Las pruebas del replay se escribieron a la vez que el código y pasaron a la primera: esto es la compensación (como en F5). Uso (contenedor de pruebas, /app montado):
    bash scripts/f6/ejecutar.sh python -u /scripts6/mutaciones_61.py
El código se muta sobre /app/src (el contenedor es temporal y el original se restaura SIEMPRE en un `finally`); el esquema, sobre una COPIA de /sql en /tmp
(el /sql real está montado de solo lectura), que se usa con SQL_DIR.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

SRC = Path("/app/src/observatorio")
SQL_ORIGINAL = Path("/sql")
SQL_COPIA = Path("/tmp/sql_mutado")
TIEMPO_MAXIMO_S = 60  # la suite entera tarda unos 5 s
PRUEBAS = ["tests/unit/test_destino_sql.py", "tests/unit/test_replay_mensaje.py", "tests/unit/test_replay_casos.py", "tests/unit/test_replay_seleccion.py",
           "tests/unit/test_replay_integracion.py", "tests/unit/test_consumidor_replay_bucle.py", "tests/unit/test_replay_reproducir.py", "tests/unit/test_aislamiento.py"]

# (descripción, archivo relativo a observatorio/, original, mutante)
MUTACIONES = [
    ("se admite el esquema histórico como destino", "consumer/destino.py", 'ESQUEMAS_PERMITIDOS = ("live", "replay")', 'ESQUEMAS_PERMITIDOS = ("live", "replay", "historico")'),
    ("el estado actual de replay se identifica solo por event_id", "consumer/destino.py", 'clave = "run_id, event_id" if d.con_run else "event_id"', 'clave = "event_id"'),
    ("la cuarentena de replay se deduplica solo por huella", "consumer/destino.py", 'conflicto = "run_id, huella" if d.con_run else "huella"', 'conflicto = "huella"'),
    ("retirar un evento no se limita a su ejecución", "consumer/destino.py", 'filtro_run = " AND run_id = %(run_id)s" if d.con_run else ""', 'filtro_run = ""'),
    ("el replay admite también la fuente en vivo", "consumer/destino.py", "fuentes=(SOURCE_REPLAY,)", 'fuentes=(SOURCE_REPLAY, "usgs-all-day")'),
    ("el consumidor en vivo acepta mensajes de replay", "consumer/mensaje.py", "    if modo != destino.modo:", "    if False:"),
    ("se acepta un mensaje de replay sin run_id válido", "consumer/mensaje.py", "        if not isinstance(run_id, str) or not RUN_ID.fullmatch(run_id):", "        if False:"),
    ("la velocidad 0 se acepta", "consumer/mensaje.py", "or velocidad <= 0)", "or velocidad < 0)"),
    ("una secuencia negativa se acepta", "consumer/mensaje.py", "or seq < 0:", "or seq < -5:"),
    ("el caso controlado se pierde al clasificar", "consumer/mensaje.py", 'caso=bloque.get("caso") if bloque is not None else None)', "caso=None)"),
    ("un caso desconocido se acepta", "consumer/mensaje.py", "caso not in CASOS_REPLAY)", "False)"),
    ("el repositorio de replay no exige run_id", "consumer/repositorio.py", "            if e.mode != self._destino.modo or not e.run_id:", "            if False:"),
    ("el caso no se guarda en la base", "consumer/repositorio.py", "parametros.update(run_id=e.run_id, caso=e.caso)", "parametros.update(run_id=e.run_id, caso=None)"),
    ("el destino replay escribe con el SQL de live", "consumer/repositorio.py", "        if self._sql_replay is not None:", "        if False:"),
    ("la cuarentena de replay no exige run_id", "consumer/repositorio.py", "            if not c.run_id:", "            if False:"),
    ("el consumidor clasifica sin su destino", "consumer/main.py", "c = clasificar_mensaje(registro.value, destino)", "c = clasificar_mensaje(registro.value)"),
    ("el consumidor de replay termina en cuanto hay inactividad (aunque no haya empezado)", "consumer/main.py", "        if ultimo is not None and ahora - ultimo >= cfg.espera_final_s:", "        if ahora - inicio >= cfg.espera_final_s:"),
    ("el consumidor de replay no recuerda el último mensaje", "consumer/main.py", "                ultimo = reloj()", "                pass"),
    ("el consumidor de replay espera sin límite", "consumer/main.py", "        if ultimo is None and ahora - inicio >= cfg.espera_max_s:", "        if False:"),
    ("la revisión no sube el updated", "replay/casos.py", "SUBIDA_REVISION_MS = 60_000", "SUBIDA_REVISION_MS = 0"),
    ("la versión antigua es posterior", "replay/casos.py", '["updated"] - RETRASO_ANTIGUA_MS', '["updated"] + RETRASO_ANTIGUA_MS'),
    ("el punto marítimo cae en tierra", "replay/casos.py", "PUNTO_MARITIMO = (-140.0, 0.0)", "PUNTO_MARITIMO = (5.0, 5.0)"),
    ("la latitud inválida es válida", "replay/casos.py", "LATITUD_INVALIDA = 123", "LATITUD_INVALIDA = 45"),
    ("la base de los casos incluye magnitudes nulas", "replay/casos.py", 'con_magnitud = [f for f in features if f["properties"].get("mag") is not None]', "con_magnitud = list(features)"),
    ("los casos reutilizan el id del evento real", "replay/casos.py", 'PREFIJO_CASO = "replay-ctl-"', 'PREFIJO_CASO = ""'),
    ("el duplicado se envía una sola vez", "replay/casos.py", "return [primero, deepcopy(primero)]", "return [primero]"),
    ("el instante de reproducción es el del evento", "replay/casos.py", '"ingested_at": ingested_at_ms', '"ingested_at": m.evento["properties"]["time"]'),
    ("la selección ordena de más reciente a más antiguo", "replay/seleccion.py", "ORDER BY event_time ASC, event_id ASC", "ORDER BY event_time DESC, event_id ASC"),
    ("el empate de días lo gana el más tardío", "replay/seleccion.py", "ORDER BY n DESC, dia ASC", "ORDER BY n DESC, dia DESC"),
    ("el día incluye el instante 00:00 del siguiente", "replay/seleccion.py", "event_time < %(hasta)s", "event_time <= %(hasta)s"),
    ("la velocidad cuenta un mensaje de más", "replay/reproducir.py", "((n_mensajes - 1) * intervalo_s)", "(n_mensajes * intervalo_s)"),
    ("el productor no espera entre mensajes", "replay/reproducir.py", "            await dormir(intervalo_s)", "            await dormir(0)"),
    ("repetir una ejecución con otra selección la sobrescribe", "replay/reproducir.py", "WHERE replay.ejecucion.dia IS NOT DISTINCT FROM EXCLUDED.dia AND replay.ejecucion.tamano = EXCLUDED.tamano AND replay.ejecucion.mensajes = EXCLUDED.mensajes", "WHERE TRUE"),
    ("la ejecución terminada no guarda su fin", "replay/reproducir.py", "CASE WHEN %(estado)s = 'terminada' THEN now() ELSE NULL END", "NULL"),
]

# Esquema: (descripción, original, mutante) sobre una copia de sql/004_esquema_f6.sql
MUTACIONES_SQL = [
    ("sin CHECK de modo en replay", "CHECK (mode = 'replay')", ""),
    ("sin CHECK de fuente en replay", "CHECK (source = 'replay-historico')", ""),
    ("la cuarentena es única solo por huella", "UNIQUE (run_id, huella)", "UNIQUE (huella)"),
    ("el estado actual no incluye el run en la clave", "PRIMARY KEY (run_id, event_id),", "PRIMARY KEY (event_id),"),
    ("se admite cualquier caso", "CHECK (caso IS NULL OR caso IN ('duplicado', 'revision', 'antigua', 'magnitud_nula', 'coordenadas_invalidas', 'maritimo'))", ""),
]


def ejecutar(entorno_extra=None) -> tuple[int, str]:
    entorno = {**os.environ, **(entorno_extra or {})}
    try:  # un mutante puede dejar un bucle sin fin (p. ej. «espera sin límite»): se corta y cuenta como detectado
        p = subprocess.run([sys.executable, "-m", "pytest", "-q", "-x", "-p", "no:cacheprovider", *PRUEBAS], cwd="/app", capture_output=True, text=True, env=entorno, timeout=TIEMPO_MAXIMO_S)
    except subprocess.TimeoutExpired:
        return 1, f"TIMEOUT de {TIEMPO_MAXIMO_S} s: el mutante cuelga las pruebas"
    resumen = [l for l in p.stdout.splitlines() if l.startswith(("FAILED", "ERROR")) or " passed" in l or " failed" in l]
    return p.returncode, (resumen[0] if resumen else "")


base_rc, base_txt = ejecutar()
print(f"# 6.1 T013 - mutaciones del paso 6.1\nBase sin mutar: {'OK' if base_rc == 0 else 'FALLA'} ({base_txt})\n")
if base_rc:
    raise SystemExit("la base ya falla: no se puede evaluar ninguna mutación")
supervivientes, total = [], 0
for descripcion, archivo, original, mutante in MUTACIONES:
    total += 1
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

sql_original = (SQL_ORIGINAL / "004_esquema_f6.sql").read_text(encoding="utf-8")
for descripcion, original, mutante in MUTACIONES_SQL:
    total += 1
    if sql_original.count(original) < 1:
        print(f"  ?? {descripcion}: el original no aparece")
        supervivientes.append(descripcion + " (no aplicable)")
        continue
    shutil.rmtree(SQL_COPIA, ignore_errors=True)
    shutil.copytree(SQL_ORIGINAL, SQL_COPIA)
    (SQL_COPIA / "004_esquema_f6.sql").write_text(sql_original.replace(original, mutante), encoding="utf-8")
    rc, txt = ejecutar({"SQL_DIR": str(SQL_COPIA)})
    shutil.rmtree(SQL_COPIA, ignore_errors=True)
    if rc == 0:
        supervivientes.append(descripcion)
    print(f"  {'DETECTADA' if rc else 'SOBREVIVE':10} [esquema] {descripcion}  [{txt[:100]}]")

final_rc, final_txt = ejecutar()
print(f"\nRestaurado: {'OK' if final_rc == 0 else 'FALLA'} ({final_txt})")
print(f"Mutaciones: {total} | detectadas: {total - len(supervivientes)} | supervivientes: {supervivientes or 'ninguna'}")
raise SystemExit(1 if supervivientes or final_rc else 0)
