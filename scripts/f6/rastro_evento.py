"""Rastro de un evento real de extremo a extremo (F6, 6.3, T030; FR-012). SOLO LECTURA: únicamente SELECT y GET.

Muestra: la consulta a USGS que lo trajo (live.consulta_extraccion, la última que empezó antes de su ingesta), el mensaje publicado (live.version_publicada),
la versión guardada (live.evento_version), la fila actual (live.evento_actual), su aparición en /api/eventos y en /api/estadisticas y cuántas veces más lo
trajo el feed sin crear versiones nuevas (reenvíos naturales). El punto en el panel se comprueba aparte en el navegador.
Uso (contenedor de pruebas):  bash scripts/f6/ejecutar.sh python /scripts6/rastro_evento.py [event_id]
"""
import json, os, sys, urllib.parse, urllib.request
import psycopg

API = os.environ.get("API_URL", "http://api:8000")
conn = psycopg.connect(host=os.environ["POSTGRES_HOST"], dbname=os.environ["POSTGRES_DB"], user=os.environ["POSTGRES_USER"], password=os.environ["POSTGRES_PASSWORD"], autocommit=True)
conn.execute("SET default_transaction_read_only = on")
q = lambda sql, p=(): conn.execute(sql, p).fetchall()

def get(ruta, **p):
    with urllib.request.urlopen(f"{API}{ruta}?{urllib.parse.urlencode(p)}", timeout=20) as r:
        return json.load(r)

event_id = sys.argv[1] if len(sys.argv) > 1 else q(
    "SELECT event_id FROM live.evento_actual a WHERE NOT retirado AND mag >= 4 AND ingested_at < now() - interval '30 minutes' AND country_id IS NOT NULL "
    "AND ingested_at > now() - interval '20 hours' ORDER BY ingested_at DESC LIMIT 1")[0][0]
print(f"# 6.3 T030 - rastro del evento {event_id}")
act = q("SELECT event_id, event_time, updated_at, mag, mag_type, place, country_id, country_name, geo_resultado, source, mode, ingested_at, kafka_topic, kafka_partition, kafka_offset, retirado, longitude, latitude FROM live.evento_actual WHERE event_id = %s", (event_id,))[0]
tiempo_ev, ingestado = act[1], act[11]
print("\n## 1. Fila actual (live.evento_actual)")
print(f"  event_time={tiempo_ev.isoformat()} updated_at={act[2].isoformat()} mag={act[3]} {act[4]} place={act[5]!r}")
print(f"  país={act[6]} ({act[7]}) geo_resultado={act[8]} source={act[9]} mode={act[10]} retirado={act[15]} coords=({act[16]}, {act[17]})")
print(f"  ingested_at={ingestado.isoformat()} kafka={act[12]}[{act[13]}]@{act[14]}")

print("\n## 2. Consulta a USGS que lo trajo (live.consulta_extraccion: la última iniciada antes de su ingesta)")
c = q("SELECT id, iniciada_at, duracion_ms, resultado, http_status, bytes, eventos, publicadas, omitidas FROM live.consulta_extraccion WHERE iniciada_at <= %s ORDER BY iniciada_at DESC LIMIT 1", (ingestado,))[0]
print(f"  consulta #{c[0]} iniciada_at={c[1].isoformat()} duración={c[2]} ms resultado={c[3]} http={c[4]} bytes={c[5]} eventos_en_respuesta={c[6]} publicadas={c[7]} omitidas={c[8]}")
print(f"  retraso entre la consulta y la ingesta del evento: {(ingestado - c[1]).total_seconds():.2f} s")

print("\n## 3. Mensaje publicado (live.version_publicada) y 4. versión guardada (live.evento_version)")
for v in q("SELECT updated_ms, published_at, kafka_partition, kafka_offset FROM live.version_publicada WHERE event_id = %s ORDER BY updated_ms", (event_id,)):
    print(f"  publicada: updated_ms={v[0]} published_at={v[1].isoformat()} kafka=[{v[2]}]@{v[3]}")
vs = q("SELECT updated_at, mag, ingested_at, kafka_topic, kafka_partition, kafka_offset FROM live.evento_version WHERE event_id = %s ORDER BY updated_at", (event_id,))
for v in vs:
    print(f"  versión: updated_at={v[0].isoformat()} mag={v[1]} ingested_at={v[2].isoformat()} kafka={v[3]}[{v[4]}]@{v[5]}")
publicadas = q("SELECT count(*) FROM live.version_publicada WHERE event_id = %s", (event_id,))[0][0]
print(f"  coherencia: versiones={len(vs)} publicadas={publicadas} offset de la fila actual == offset de la última versión: {vs[-1][5] == act[14]}")

print("\n## 5. Reenvíos naturales: el feed vuelve a traer el evento en cada consulta, pero no crea versiones nuevas")
n = q("SELECT count(*) FROM live.consulta_extraccion WHERE iniciada_at > %s AND resultado = 'ok'", (ingestado,))[0][0]
print(f"  consultas correctas posteriores a su ingesta: {n} (el evento sigue en el feed de 24 h) -> versiones del evento: {len(vs)}")

print("\n## 6. API: /api/eventos y /api/estadisticas con una ventana que lo contiene")
ini, fin = (tiempo_ev.timestamp() - 3600), (tiempo_ev.timestamp() + 3600)
iso = lambda t: __import__("datetime").datetime.fromtimestamp(t, __import__("datetime").timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
p = dict(start=iso(ini), end=iso(fin), limit="5000")
ev = get("/api/eventos", **p)
f = [x for x in ev["features"] if x["id"] == event_id]
print(f"  /api/eventos: {ev['metadata']['total']} eventos en la ventana; el evento aparece {len(f)} vez/veces")
if f:
    pr = f[0]["properties"]; print(f"  properties: mag={pr['mag']} time={pr['time']} updated={pr['updated']} country_id={pr['country_id']}; coords={f[0]['geometry']['coordinates']}")
st = get("/api/estadisticas", start=p["start"], end=p["end"])
print(f"  /api/estadisticas: total={st['total']} (= /api/eventos: {st['total'] == ev['metadata']['total']}); su país ({act[6]}) cuenta {[i['count'] for i in st['por_pais']['items'] if i['country_id'] == act[6]]}")
hora = (int(tiempo_ev.timestamp()) // 3600) * 3600000
print(f"  por_hora: la hora UTC {hora} cuenta {[i['count'] for i in st['por_hora']['items'] if i['hour'] == hora]}")
ok = len(f) == 1 and st["total"] == ev["metadata"]["total"] and len(vs) == publicadas and vs[-1][5] == act[14] and ev["metadata"]["mode"] == "live"
print(f"\nRASTRO {'COMPLETO' if ok else 'INCOMPLETO'}")
sys.exit(0 if ok else 1)
