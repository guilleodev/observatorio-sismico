"""Ensayo extremo a extremo de la recuperación de huecos (F4, paso 4.5, T050; SC-009) en RECURSOS TEMPORALES.

Crea una base temporal (`obs_rec_f4`), un topic temporal (`terremotos.rec_f4`) y un grupo temporal (`ensayo-rec-f4`), arranca un consumidor
aparte contra ellos y usa un catálogo FDSN SIMULADO. No toca la base, el topic ni el consumidor reales. Al terminar borra solo lo temporal.
Pasos: (1) última ingesta correcta simulada hace 30 h -> el productor anota el hueco; una interrupción de 10 h no anota nada; (2) se publican
por el canal real versiones previas (guardadas, revisión pendiente, versión más reciente); (3) se recupera el hueco; (4) se repite;
(5) se comprueba origen, versiones, país, cuarentena, orden, reconciliación y lag. Uso (contenedor de pruebas en la red de Compose):
    python -X utf8 /scripts/ensayo_recuperacion.py
"""

import asyncio
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer, TopicPartition
from aiokafka.admin import AIOKafkaAdminClient, NewTopic

sys.path.insert(0, "/app/tests")
sys.path.insert(0, "/app/src")
from fixtures.fdsn_simulado import ServidorFdsn, crear_feature  # noqa: E402
from observatorio.config import ConfigIngesta, ConfigPostgres  # noqa: E402
from observatorio.geo.catalogo import leer_catalogo, volcar  # noqa: E402
from observatorio.producer.ingesta import ejecutar_ciclo, mensaje_kafka  # noqa: E402
from observatorio.producer.repositorio import RepositorioProductor  # noqa: E402
from observatorio.producer.usgs import Respuesta  # noqa: E402

BASE, TOPIC, GRUPO = "obs_rec_f4", "terremotos.rec_f4", "ensayo-rec-f4"
BOOTSTRAP = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
real = ConfigPostgres.desde_entorno()
conninfo_real = real.conninfo()
conninfo_temp = conninfo_real.replace(f"dbname={real.base}", f"dbname={BASE}")
assert BASE != real.base and TOPIC != os.environ.get("KAFKA_TOPIC", "terremotos.live")


def linea(texto=""):
    print(texto, flush=True)


def comprobar(condicion, texto):
    linea(("  OK    " if condicion else "  FALLA ") + texto)
    if not condicion:
        raise SystemExit(f"FALLA: {texto}")


def q(sql, *args):
    with psycopg.connect(conninfo_temp) as c:
        return c.execute(sql, args).fetchall()


async def lag() -> tuple[int, int]:
    """(offset confirmado del grupo, final del topic) del topic temporal."""
    admin = AIOKafkaAdminClient(bootstrap_servers=BOOTSTRAP)
    await admin.start()
    try:
        offsets = await admin.list_consumer_group_offsets(GRUPO)
    finally:
        await admin.close()
    tp = TopicPartition(TOPIC, 0)
    c = AIOKafkaConsumer(bootstrap_servers=BOOTSTRAP)
    await c.start()
    try:
        fin = (await c.end_offsets([tp]))[tp]
    finally:
        await c.stop()
    return (offsets[tp].offset if tp in offsets else 0), fin


async def esperar_lag0(maximo_s=60):
    limite = time.monotonic() + maximo_s
    while time.monotonic() < limite:
        actual, fin = await lag()
        if actual == fin and fin > 0:
            return actual, fin
        await asyncio.sleep(1)
    return await lag()


async def publicar_previas(mensajes):
    p = AIOKafkaProducer(bootstrap_servers=BOOTSTRAP)
    await p.start()
    try:
        for clave, valor in mensajes:
            await p.send_and_wait(TOPIC, key=clave.encode(), value=json.dumps(valor).encode())
    finally:
        await p.stop()


async def ciclo_productor(ultima: datetime, ahora: datetime, margen_s: int):
    """Un ciclo real del productor (ejecutar_ciclo + registrar_ok) con la última consulta correcta en `ultima`."""
    async with await psycopg.AsyncConnection.connect(conninfo_temp, autocommit=True) as conn:
        await conn.execute("UPDATE live.estado_ingesta SET ultima_consulta_ok_at = %s WHERE id = 1", (ultima,))
        cuerpo = b'{"type":"FeatureCollection","features":[]}'
        resp = Respuesta(cuerpo=cuerpo, http_status=200, duracion_ms=100, bytes=len(cuerpo), intentos=1, datos=json.loads(cuerpo))

        async def consultar(url, timeout_s, max_reintentos):
            return resp

        config = ConfigIngesta("http://simulado", 60, 20, 3, 3, 30, False, margen_s)
        ms_ahora = int(ahora.timestamp() * 1000) - 100
        await ejecutar_ciclo(RepositorioProductor(conn, margen_s), config, None, consultar=consultar, ahora=lambda: ms_ahora)


def ejecutar(orden, entorno, **kw):
    return subprocess.run([sys.executable, "-m", *orden], env=entorno, capture_output=True, text=True, **kw)


async def principal():
    ahora = datetime.now(timezone.utc).replace(microsecond=0)
    linea(f"# 4.5 T050 - ensayo de recuperación de huecos (recursos temporales) {ahora:%Y-%m-%dT%H:%M:%SZ}")
    linea(f"base temporal {BASE} | topic temporal {TOPIC} | grupo temporal {GRUPO} | catálogo FDSN simulado (reales: {real.base}, terremotos.live, consumidor-live: NO se tocan)")

    with psycopg.connect(conninfo_real, autocommit=True) as c:
        c.execute(f'DROP DATABASE IF EXISTS "{BASE}"')  # solo la base temporal de un ensayo anterior
        c.execute(f'CREATE DATABASE "{BASE}"')
    consumidor = None
    try:
        with psycopg.connect(conninfo_temp, autocommit=True) as c:
            for nombre in ("001_esquema_live.sql", "002_esquema_f3.sql", "003_esquema_f4.sql"):
                c.execute((Path("/sql") / nombre).read_text(encoding="utf-8"))
            volcar(c, leer_catalogo(Path("/datos/paises.geojson")))
        admin = AIOKafkaAdminClient(bootstrap_servers=BOOTSTRAP)
        await admin.start()
        try:
            await admin.create_topics([NewTopic(TOPIC, 1, 1)])
        finally:
            await admin.close()

        entorno = dict(os.environ, POSTGRES_DB=BASE, KAFKA_TOPIC=TOPIC, KAFKA_CONSUMER_GROUP=GRUPO, KAFKA_BOOTSTRAP_SERVERS=BOOTSTRAP,
                       CATALOGO_PATH="/datos/paises.geojson", PYTHONPATH="/app/src")
        consumidor = subprocess.Popen([sys.executable, "-m", "observatorio.consumer.main"], env=entorno,
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        linea("consumidor temporal arrancado")

        linea("\n## 1. Detección: interrupciones simuladas (margen 6 h)")
        await ciclo_productor(ahora - timedelta(hours=10), ahora, 21600)
        comprobar(q("SELECT count(*) FROM live.hueco")[0][0] == 0, "interrupción de 10 h (< 24 h − 6 h): 0 huecos anotados")
        await ciclo_productor(ahora - timedelta(hours=30), ahora, 21600)
        huecos = q("SELECT id, inicio, fin, estado FROM live.hueco")
        comprobar(len(huecos) == 1 and huecos[0][3] == "pendiente", f"última ingesta correcta hace 30 h: 1 hueco pendiente {huecos[0][1]:%Y-%m-%d %H:%M} .. {huecos[0][2]:%Y-%m-%d %H:%M}")
        await ciclo_productor(ahora - timedelta(hours=30), ahora, 21600)
        comprobar(q("SELECT count(*) FROM live.hueco")[0][0] == 1, "repetir la detección con el mismo intervalo no duplica el hueco")
        inicio, fin = huecos[0][1], huecos[0][2]
        listado = ejecutar(["observatorio.recuperacion.recuperar", "--listar"], entorno)
        linea("  --listar: " + " | ".join(listado.stdout.strip().splitlines()))

        def t(horas_tras_inicio):
            return int((inicio + timedelta(hours=horas_tras_inicio)).timestamp() * 1000)

        def evento(n, horas, updated_extra=0, **kw):
            tiempo = t(horas)
            return tiempo, crear_feature(f"prueba-rec-{n}", tiempo, updated_ms=tiempo + 1000 + updated_extra, **kw)

        # catálogo simulado del hueco (sin filtro de magnitud ni de tipo)
        e_guardado = evento(1, 1, lon=-100.0, lat=40.0, mag=3.1)  # ya publicado y guardado con el mismo updated
        e_revisado = evento(2, 2, updated_extra=5000, lon=139.7, lat=35.7, mag=4.2)  # el catálogo trae una REVISIÓN (updated mayor)
        e_orden = evento(3, 3, updated_extra=-500, lon=-3.7, lat=40.4, mag=2.5)  # el catálogo trae una versión ANTERIOR a la guardada
        e_nuevo_tierra = evento(4, 4, lon=-3.7, lat=40.4, mag=0.8)  # desconocido, magnitud < 1: el feed no filtra
        e_nuevo_mar = evento(5, 5, lon=-150.0, lat=0.0, mag=5.5)  # desconocido, en el mar
        e_cantera = evento(6, 6, tipo="quarry blast", lon=-100.0, lat=40.0, mag=1.2)  # no sísmico -> cuarentena
        e_roto = evento(7, 7)
        e_roto[1].pop("geometry")  # inválido -> cuarentena
        e_sin_mag = evento(8, 8, mag=None, lon=-100.0, lat=40.0)
        entradas = [e_guardado, e_revisado, e_orden, e_nuevo_tierra, e_nuevo_mar, e_cantera, e_roto, e_sin_mag]

        linea("\n## 2. Estado previo: versiones ya publicadas por el canal real (source usgs-all-day) y guardadas")
        def previa(entrada, updated):
            f = json.loads(json.dumps(entrada[1]))
            f["properties"]["updated"] = updated
            return f["id"], mensaje_kafka(f, int(time.time() * 1000))
        previas = [previa(e_guardado, e_guardado[1]["properties"]["updated"]),
                   previa(e_revisado, e_revisado[1]["properties"]["updated"] - 5000),  # la versión antigua (la revisión llegará por recuperación)
                   previa(e_orden, e_orden[1]["properties"]["updated"] + 500)]  # ya hay una versión MÁS reciente que la del catálogo
        await publicar_previas(previas)
        actual, fin_topic = await esperar_lag0()
        comprobar(actual == fin_topic == 3, f"3 versiones previas consumidas (offset {actual}/{fin_topic})")
        comprobar(q("SELECT count(*) FROM live.evento_version WHERE source = 'usgs-all-day'")[0][0] == 3, "evento_version: 3 versiones con source usgs-all-day")

        linea("\n## 3. Recuperación del hueco (catálogo simulado, canal real temporal)")
        with ServidorFdsn(entradas) as servidor:
            entorno_rec = dict(entorno, HISTORICO_URL=servidor.url, HISTORICO_MAX_REINTENTOS="0")
            simulada = ejecutar(["observatorio.recuperacion.recuperar", "--simular"], entorno_rec)
            linea("  --simular: " + simulada.stdout.strip())
            comprobar(q("SELECT estado FROM live.hueco")[0][0] == "pendiente" and q("SELECT count(*) FROM live.evento_version")[0][0] == 3,
                      "--simular no publica ni cambia el hueco")
            r1 = ejecutar(["observatorio.recuperacion.recuperar", "--espera-s", "30"], entorno_rec)
            linea("  " + r1.stdout.strip().splitlines()[-1])
            comprobar(r1.returncode == 0, f"código de salida 0 {r1.stderr[-200:] if r1.returncode else ''}")
            consultas = [p for p in servidor.peticiones]
            comprobar(all("minmagnitude" not in p and "eventtype" not in p for p in consultas), "la consulta al catálogo no lleva eventtype ni minmagnitude")
            actual, fin_topic = await esperar_lag0()
            comprobar(actual == fin_topic, f"lag 0 tras recuperar (offset {actual}/{fin_topic})")

            estado = q("SELECT estado, eventos_publicados FROM live.hueco")[0]
            comprobar(estado == ("recuperado", 7), f"hueco marcado recuperado con 7 publicados (8 del catálogo − 1 ya guardado con el mismo updated): {estado}")
            por_source = dict(q("SELECT source, count(*) FROM live.evento_version GROUP BY 1"))
            linea(f"  evento_version por source: {por_source}")
            comprobar(por_source.get("usgs-fdsn-recuperacion", 0) >= 4 and por_source.get("usgs-all-day") == 3,
                      "lo recuperado queda identificado con source usgs-fdsn-recuperacion; lo previo conserva usgs-all-day")
            ids_recuperados = {f[0] for f in q("SELECT DISTINCT event_id FROM live.evento_version WHERE source = 'usgs-fdsn-recuperacion'")}
            comprobar({"prueba-rec-4", "prueba-rec-5", "prueba-rec-8"} <= ids_recuperados, "los eventos desconocidos (incluida M<1 y sin magnitud) se recuperaron")
            comprobar("prueba-rec-1" not in ids_recuperados, "la versión ya guardada con el mismo updated se omitió")
            rev = q("SELECT count(*) FROM live.evento_version WHERE event_id = 'prueba-rec-2'")[0][0]
            comprobar(rev == 2, "evento 2: versión antigua + revisión recuperada (2 versiones)")
            actual2 = q("SELECT (extract(epoch FROM updated_at)*1000)::bigint FROM live.evento_actual WHERE event_id = 'prueba-rec-2'")[0][0]
            comprobar(actual2 == e_revisado[1]["properties"]["updated"], "evento 2: el estado actual es la revisión")
            hist3 = q("SELECT count(*) FROM live.evento_version WHERE event_id = 'prueba-rec-3'")[0][0]
            act3 = q("SELECT (extract(epoch FROM updated_at)*1000)::bigint FROM live.evento_actual WHERE event_id = 'prueba-rec-3'")[0][0]
            comprobar(hist3 == 2 and act3 == e_orden[1]["properties"]["updated"] + 500,
                      "fuera de orden: la versión anterior entra al historial (2 versiones) pero NO sobrescribe el estado actual más reciente")
            paises = dict(q("SELECT event_id, country_id FROM live.evento_actual WHERE event_id LIKE 'prueba-rec-%%'"))
            comprobar(paises.get("prueba-rec-4") == "ESP" and paises.get("prueba-rec-5") is None and paises.get("prueba-rec-8") == "USA",
                      f"país asignado por el consumidor (ESP / mar sin país / USA): {paises.get('prueba-rec-4')}, {paises.get('prueba-rec-5')}, {paises.get('prueba-rec-8')}")
            cuar = dict(q("SELECT event_id, categoria FROM live.cuarentena"))
            comprobar(cuar.get("prueba-rec-6") == "excluido" and cuar.get("prueba-rec-7") == "invalido", f"no sísmico e inválido en cuarentena con motivo: {cuar}")

            linea("\n## 4. Repetición: la misma recuperación otra vez (--hueco 1) y sin argumentos")
            antes = (q("SELECT count(*) FROM live.evento_version")[0][0], q("SELECT count(*) FROM live.cuarentena")[0][0],
                     q("SELECT md5(string_agg(event_id || updated_at::text || coalesce(country_id,'-'), '|' ORDER BY event_id)) FROM live.evento_actual")[0][0])
            r2 = ejecutar(["observatorio.recuperacion.recuperar", "--hueco", "1", "--espera-s", "10"], entorno_rec)
            linea("  " + r2.stdout.strip().splitlines()[-1])
            await esperar_lag0(10)
            despues = (q("SELECT count(*) FROM live.evento_version")[0][0], q("SELECT count(*) FROM live.cuarentena")[0][0],
                       q("SELECT md5(string_agg(event_id || updated_at::text || coalesce(country_id,'-'), '|' ORDER BY event_id)) FROM live.evento_actual")[0][0])
            comprobar("publicados=0" in r2.stdout and antes == despues, f"repetida: 0 publicados y base idéntica (versiones, cuarentena, estado actual): {antes} == {despues}")
            r3 = ejecutar(["observatorio.recuperacion.recuperar"], entorno_rec)
            comprobar("sin huecos pendientes" in r3.stdout, "sin argumentos: «sin huecos pendientes»")

        linea("\n## 5. Invariantes de la base temporal")
        rec = q("SELECT count(*) FROM live.version_publicada p WHERE NOT EXISTS (SELECT 1 FROM live.evento_version v WHERE v.event_id = p.event_id "
                "AND v.updated_at = to_timestamp(p.updated_ms / 1000.0)) AND NOT EXISTS (SELECT 1 FROM live.cuarentena c WHERE c.event_id = p.event_id AND c.updated_ms = p.updated_ms)")[0][0]
        dup = q("SELECT count(*) FROM (SELECT kafka_offset FROM live.evento_version GROUP BY kafka_offset HAVING count(*) > 1) s")[0][0]
        desf = q("SELECT count(*) FROM live.evento_actual a WHERE NOT a.retirado AND a.updated_at <> (SELECT max(v.updated_at) FROM live.evento_version v WHERE v.event_id = a.event_id)")[0][0]
        actual, fin_topic = await lag()
        linea(f"  reconciliación={rec} | offsets duplicados={dup} | estado actual desfasado={desf} | lag={fin_topic - actual} (offset {actual}/{fin_topic})")
        comprobar(rec == 0 and dup == 0 and desf == 0 and actual == fin_topic, "reconciliación vacía, sin duplicados, sin desfases y lag 0")
        pub = q("SELECT count(*) FROM live.version_publicada")[0][0]
        linea(f"  version_publicada={pub} (solo las publicadas por la recuperación; las 3 previas se publicaron sin marcar) | versiones={q('SELECT count(*) FROM live.evento_version')[0][0]} | cuarentena={q('SELECT count(*) FROM live.cuarentena')[0][0]}")
        linea("\nRESULTADO: OK - hueco detectado, recuperado una vez, repetición sin cambios; reglas del consumidor aplicadas (versiones, país, cuarentena, orden)")
    finally:
        if consumidor is not None:
            consumidor.terminate()
            try:
                consumidor.wait(timeout=15)
            except subprocess.TimeoutExpired:
                consumidor.kill()
        try:  # limpieza SOLO de los recursos temporales
            admin = AIOKafkaAdminClient(bootstrap_servers=BOOTSTRAP)
            await admin.start()
            try:
                await admin.delete_consumer_groups([GRUPO])  # no existe en esta versión de aiokafka: se borra con kafka-consumer-groups.sh (ver evidencia)
            except Exception as exc:
                linea(f"(grupo temporal: {exc})")
            try:
                await admin.delete_topics([TOPIC])
            except Exception as exc:
                linea(f"(topic temporal: {exc})")
            await admin.close()
        finally:
            with psycopg.connect(conninfo_real, autocommit=True) as c:
                c.execute(f'DROP DATABASE IF EXISTS "{BASE}"')
            linea(f"recursos temporales eliminados: base {BASE}, topic {TOPIC}, grupo {GRUPO}")


asyncio.run(principal())
