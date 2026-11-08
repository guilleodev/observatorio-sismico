"""Pruebas de aceptación de §11 con resultado OBSERVADO (F6, 6.3, T031). SOLO LECTURA (SELECT y GET). Genera el informe en Markdown por la salida estándar.
Uso: bash scripts/f6/ejecutar.sh python /scripts6/aceptacion_63.py > docs/evidencias/f6/6.3-aceptacion.md
Las filas de replay se observan sobre las ejecuciones ya existentes (r-f6-prueba-a y r-f6-prueba-b), que no se tocan. Las de live solo se OBSERVAN (no se inyecta nada)."""
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import psycopg

API = os.environ.get("API_URL", "http://api:8000")
RUN = os.environ.get("RUN", "r-f6-prueba-b")
c = psycopg.connect(host=os.environ["POSTGRES_HOST"], dbname=os.environ["POSTGRES_DB"], user=os.environ["POSTGRES_USER"], password=os.environ["POSTGRES_PASSWORD"], autocommit=True)
c.execute("SET default_transaction_read_only = on")


def q(s, p=()):
    return c.execute(s, p).fetchall()


def one(s, p=()):
    return q(s, p)[0][0]


def get(ruta, **p):
    with urllib.request.urlopen(f"{API}{ruta}?{urllib.parse.urlencode(p)}", timeout=20) as r:
        return json.load(r)


filas = []


def seccion(n, titulo, procedimiento, comando, esperado, observado, ok):
    filas.append((titulo, ok))
    print(f"\n## {n}. {titulo}\n\n- **Procedimiento**: {procedimiento}\n- **Comando**: `{comando}`\n- **Esperado**: {esperado}\n- **Observado**:")
    for o in observado:
        print(f"  - {o}")
    print(f"- **Resultado**: {'SUPERADA' if ok else 'FALLA'}")


R = get("/api/eventos", mode="replay", run=RUN, limit="5000")
S = get("/api/estadisticas", mode="replay", run=RUN)
feat = {f["id"]: f for f in R["features"]}
meta = R["metadata"]
ej = meta["replay"]
mensajes = one("SELECT mensajes FROM replay.ejecucion WHERE run_id=%s", (RUN,))
print(f"# 6.3 T031 - Pruebas de aceptación de §11 (ocho de once filas) · {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%MZ')}")
print(f"\nEjecución observada: **{RUN}** ({ej['estado']}, velocidad ×{ej['velocidad']}, {ej['tamano']} eventos reales + 5 casos controlados, {mensajes} mensajes publicados). "
      "Todo se consulta con SELECT y GET; nada se inyecta en `live`.")
print("Las filas «Reiniciar consumidor», «Cerrar el túnel» y «Reabrir el túnel» no se ejecutan aquí: van a 6.8 (T057) y 6.6 (T047), como indica `research.md` R-008.")

# 1. Evento nuevo
v1 = q("SELECT event_id, event_time, ingested_at, kafka_offset FROM replay.evento_version WHERE run_id=%s AND caso IS NULL ORDER BY kafka_offset LIMIT 1", (RUN,))[0]
live_nuevo = q("SELECT event_id, ingested_at FROM live.evento_actual WHERE NOT retirado ORDER BY ingested_at DESC LIMIT 1")[0]
ap = [f for f in get("/api/eventos", limit="5000")["features"] if f["id"] == live_nuevo[0]]
seccion(1, "Evento nuevo", "Un evento que no existe se publica, se guarda y aparece en la API. En live se observa el más reciente; en replay, el primer evento reproducido.",
        "python scripts/f6/rastro_evento.py (ver 6.3-rastro.txt) · GET /api/eventos · GET /api/eventos?mode=replay&run=" + RUN,
        "Una versión guardada con su offset, una fila actual y una aparición en /api/eventos; en replay `time` es el original y `ingested_at` el de reproducción.",
        [f"live: el evento ingerido más recientemente ({live_nuevo[0]}, ingested_at {live_nuevo[1].isoformat()}) aparece {len(ap)} vez en /api/eventos; el rastro completo de otro evento real está en `6.3-rastro.txt` "
         "(consulta → mensaje → versión → fila → API → estadísticas: RASTRO COMPLETO)",
         f"replay: primer evento {v1[0]} en el offset {v1[3]}, time original {v1[1].isoformat()} frente a ingested_at de reproducción {v1[2].isoformat()}; aparece en la API de replay: {v1[0] in feat}"],
        v1[0] in feat and len(ap) == 1)

# 2. Reenvío de la misma versión
nv = one("SELECT count(*) FROM replay.evento_version WHERE run_id=%s AND event_id='replay-ctl-duplicado'", (RUN,))
na = one("SELECT count(*) FROM replay.evento_actual WHERE run_id=%s AND event_id='replay-ctl-duplicado'", (RUN,))
vers = one("SELECT count(*) FROM replay.evento_version WHERE run_id=%s", (RUN,))
cuar = one("SELECT count(*) FROM replay.cuarentena WHERE run_id=%s", (RUN,))
live_consultas = one("SELECT count(*) FROM live.consulta_extraccion WHERE resultado='ok'")
live_vers = one("SELECT count(*) FROM live.evento_version")
live_act = one("SELECT count(*) FROM live.evento_actual")
seccion(2, "Reenviar la misma versión", "El caso `duplicado` publica dos veces exactamente el mismo mensaje; en live se observa que el feed repite eventos cada minuto.",
        "SELECT count(*) FROM replay.evento_version WHERE event_id='replay-ctl-duplicado' · balance de mensajes",
        "Una sola versión y una sola fila actual para el duplicado; mensajes publicados = versiones + cuarentena + reenvío descartado; el número de terremotos no aumenta.",
        [f"replay: `replay-ctl-duplicado` tiene {nv} versión y {na} fila actual; {mensajes} mensajes = {vers} versiones + {cuar} en cuarentena + {mensajes - vers - cuar} reenvío descartado; "
         f"terremotos de la ejecución en la API: {meta['total']} (= {ej['tamano']} reales + 5 casos; el duplicado cuenta una vez)",
         f"live: {live_consultas} consultas correctas a USGS devolvieron cada una ~200 eventos ya conocidos y solo hay {live_act} eventos actuales y {live_vers} versiones (versión nueva solo si cambia `updated`); "
         "el evento de `6.3-rastro.txt` estuvo en 23 consultas posteriores sin crear versiones que no fueran revisiones reales"],
        nv == 1 and na == 1 and mensajes - vers - cuar == 1)

# 3. Versión posterior
vs = q("SELECT updated_at, mag FROM replay.evento_version WHERE run_id=%s AND event_id='replay-ctl-revision' ORDER BY kafka_offset", (RUN,))
act = q("SELECT updated_at, mag FROM replay.evento_actual WHERE run_id=%s AND event_id='replay-ctl-revision'", (RUN,))[0]
fr = feat["replay-ctl-revision"]["properties"]
multi = one("SELECT count(*) FROM (SELECT event_id FROM live.evento_version GROUP BY 1 HAVING count(*) > 1) s")
seccion(3, "Versión posterior", "El caso `revision` publica una versión con `updated` posterior y magnitud distinta.",
        "SELECT updated_at, mag FROM replay.evento_version WHERE event_id='replay-ctl-revision' ORDER BY kafka_offset",
        "Dos versiones en el historial; la fila actual y la API muestran la posterior; el evento sigue contando una vez.",
        [f"replay: versiones {[(u.isoformat(), float(m)) for u, m in vs]}; fila actual {act[0].isoformat()} mag {float(act[1])}; API mag {fr['mag']} updated {fr['updated']}; total de la ejecución sigue en {meta['total']}",
         f"live: {multi} eventos reales tienen más de una versión (revisiones reales de USGS observadas, p. ej. el de `6.3-rastro.txt`)"],
        len(vs) == 2 and act[0] == vs[1][0] and fr["mag"] == float(vs[1][1]))

# 4. Versión antigua
va = q("SELECT updated_at, mag, kafka_offset FROM replay.evento_version WHERE run_id=%s AND event_id='replay-ctl-antigua' ORDER BY kafka_offset", (RUN,))
aa = q("SELECT updated_at, mag FROM replay.evento_actual WHERE run_id=%s AND event_id='replay-ctl-antigua'", (RUN,))[0]
fa = feat["replay-ctl-antigua"]["properties"]
desorden = one("SELECT count(DISTINCT a.event_id) FROM live.evento_version a JOIN live.evento_version b ON a.event_id=b.event_id AND a.kafka_offset > b.kafka_offset AND a.updated_at < b.updated_at")
atras = one("SELECT count(*) FROM live.evento_actual a WHERE a.updated_at < (SELECT max(updated_at) FROM live.evento_version v WHERE v.event_id=a.event_id)")
seccion(4, "Versión antigua", "El caso `antigua` publica primero la versión nueva y después una anterior.",
        "SELECT updated_at, mag, kafka_offset FROM replay.evento_version WHERE event_id='replay-ctl-antigua' ORDER BY kafka_offset",
        "Las dos quedan en el historial; la fila actual conserva la más reciente (la antigua no la sustituye).",
        [f"replay: historial {[(u.isoformat(), float(m), o) for u, m, o in va]}; actual {aa[0].isoformat()} mag {float(aa[1])}; API updated {fa['updated']} mag {fa['mag']}",
         f"live: {desorden} eventos reales tienen una versión publicada después de otra más reciente; filas actuales por detrás de su última versión: {atras}"],
        len(va) == 2 and va[0][0] > va[1][0] and aa[0] == va[0][0] and atras == 0)

# 5. Magnitud nula
fn = feat["replay-ctl-magnitud_nula"]["properties"]
nulos_live = one("SELECT count(*) FROM live.evento_actual WHERE mag IS NULL AND NOT retirado")
seccion(5, "Magnitud nula", "El caso `magnitud_nula` conserva el evento sin magnitud.",
        "GET /api/eventos?mode=replay&run=" + RUN + " · GET /api/estadisticas?mode=replay&run=" + RUN,
        "El evento existe, `mag` es null (no 0), se cuenta en `sin_magnitud` y en `magnitud.sin_valor`, y el panel lo muestra como ND / «sin valor».",
        [f"replay: `mag` = {fn['mag']!r}; metadata.sin_magnitud = {meta['sin_magnitud']}; estadísticas: sin_magnitud = {S['sin_magnitud']}, magnitud.sin_valor = {S['magnitud']['sin_valor']}",
         "panel: la ficha usa «Magnitud: ND» y la tabla «sin valor» (`textoFicha`, `textoOSinValor`, probadas en `formato.test.ts`); ninguna barra de magnitud lo cuenta",
         f"live: {nulos_live} eventos actuales sin magnitud, tratados igual"],
        fn["mag"] is None and meta["sin_magnitud"] == 1 == S["magnitud"]["sin_valor"])

# 6. Coordenadas inválidas
cu = q("SELECT categoria, motivo, event_id FROM replay.cuarentena WHERE run_id=%s", (RUN,))
en = (one("SELECT count(*) FROM replay.evento_actual WHERE run_id=%s AND event_id='replay-ctl-coordenadas_invalidas'", (RUN,))
      + one("SELECT count(*) FROM replay.evento_version WHERE run_id=%s AND event_id='replay-ctl-coordenadas_invalidas'", (RUN,)))
mots = q("SELECT categoria, motivo, count(*) FROM live.cuarentena GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 4")
seccion(6, "Coordenadas inválidas", "El caso `coordenadas_invalidas` trae una latitud fuera de rango.",
        "SELECT categoria, motivo, event_id FROM replay.cuarentena WHERE run_id='" + RUN + "'",
        "Va a cuarentena con motivo, no crea versión ni fila actual y no aparece como punto en la API ni en el mapa.",
        [f"replay: cuarentena {[tuple(x) for x in cu]}; filas del evento en actual+versión: {en}; en la API de replay: {'replay-ctl-coordenadas_invalidas' in feat}; total {meta['total']} (35, no 36)",
         f"live: cuarentena de live por motivo (muestra): {[tuple(x) for x in mots]}"],
        len(cu) == 1 and cu[0][1] == "coordenadas fuera de rango" and en == 0 and "replay-ctl-coordenadas_invalidas" not in feat)

# 7. Marítimo
fm = feat["replay-ctl-maritimo"]
sp = [i for i in S["por_pais"]["items"] if i["country_id"] is None]
seccion(7, "Evento marítimo", "El caso `maritimo` cae en el Pacífico ecuatorial (−140, 0), fuera de todo polígono.",
        "GET /api/eventos?mode=replay&run=" + RUN + " · GET /api/estadisticas?mode=replay&run=" + RUN,
        "`country_id` nulo → «Sin país asignado» (nunca el país más cercano); el evento se dibuja y cuenta en el análisis.",
        [f"replay: coordenadas {fm['geometry']['coordinates'][:2]}, country_id={fm['properties']['country_id']!r}, country_name={fm['properties']['country_name']!r}",
         f"estadísticas: grupo «Sin país asignado» = {[(i['country_name'], i['count']) for i in sp]} (incluye el marítimo); `sin_valor` (aún sin asignar) = {S['por_pais']['sin_valor']}"],
        fm["properties"]["country_id"] is None and bool(sp) and sp[0]["count"] >= 1)

# 8. Reproducción histórica
act_n = one("SELECT count(*) FROM replay.evento_actual WHERE run_id=%s", (RUN,))
aisl = one("SELECT count(*) FROM live.evento_actual l JOIN replay.evento_actual r USING (event_id)")
seccion(8, "Reproducción histórica", "Se reproduce una selección real de 2025 con el panel en modo REPRODUCCIÓN (ejecuciones de 6.1, verificadas en el panel en 6.2).",
        "scripts/f6/ensayo_replay.sh (6.1) · panel: selector «REPRODUCCIÓN» (6.2) · GET /api/eventos?mode=replay",
        "La ejecución termina; sus eventos aparecen en la API y el panel con la etiqueta; mapa = tabla = gráficas; nada llega a `live`; la velocidad medida coincide con la registrada.",
        [f"ejecución {RUN}: estado {ej['estado']}, {act_n} eventos actuales; mapa/tabla/estadísticas/API = {meta['total']} (`6.2-panel.txt`); velocidad registrada ×{ej['velocidad']} y duración observada ×1,003 de la prevista (`6.2-velocidad-identidad.txt`)",
         f"separación: {aisl} ids de replay en live.evento_actual; reanudación e idempotencia verificadas en `6.1-replay-ensayos.txt` (sin duplicados)"],
        act_n == 35 and aisl == 0 and ej["estado"] == "terminada")

print("\n## Resumen\n\n| Fila | Resultado |\n|---|---|")
for t, ok in filas:
    print(f"| {t} | {'SUPERADA' if ok else 'FALLA'} |")
print(f"\n**{sum(ok for _, ok in filas)} de {len(filas)} filas superadas.**")
raise SystemExit(0 if all(ok for _, ok in filas) else 1)
