"""Ensayo de interrupción y reanudación de la carga histórica (F4, paso 4.4, T036).

Crea una BASE TEMPORAL (`obs_ensayo_f4`; nunca toca la base real), aplica el esquema y el catálogo real, arranca el servidor FDSN simulado
con datos sintéticos de 2031 y lanza la carga como proceso aparte. La MATA (SIGKILL) a mitad, varias veces, y la reanuda hasta terminar.
Comprueba: ningún tramo a medias, ningún duplicado, ningún evento perdido y, tras terminar, una nueva ejecución con 0 peticiones.
Al final borra solo la base temporal. Uso (en el contenedor de pruebas, con /app, /sql, /scripts y /datos montados):
    python -X utf8 /scripts/ensayo_interrupcion.py
"""

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import psycopg

sys.path.insert(0, "/app/tests")
sys.path.insert(0, "/app/src")
from fixtures.fdsn_simulado import ServidorFdsn, crear_feature, ms  # noqa: E402
from observatorio.config import ConfigPostgres  # noqa: E402
from observatorio.geo.catalogo import leer_catalogo, volcar  # noqa: E402

TEMPORAL = "obs_ensayo_f4"
ANIO = 2031
N_EVENTOS = 240
real = ConfigPostgres.desde_entorno()
conninfo_real = real.conninfo()
conninfo_temp = conninfo_real.replace(f"dbname={real.base}", f"dbname={TEMPORAL}")
assert TEMPORAL != real.base


def linea(texto=""):
    print(texto, flush=True)


# --- datos sintéticos: 240 eventos repartidos por los 12 meses de 2031, en cuatro zonas del mundo (alguna en el mar)
zonas = [(-100.0, 40.0), (139.7, 35.7), (-3.7, 40.4), (-150.0, 0.0)]
entradas = []
for i in range(N_EVENTOS):
    mes = i % 12 + 1
    dia = 1 + (i // 12) % 27
    tiempo = ms(f"{ANIO}-{mes:02d}-{dia:02d}T{(i * 7) % 24:02d}:{(i * 13) % 60:02d}:00")
    lon, lat = zonas[i % 4]
    entradas.append((tiempo, crear_feature(f"prueba-e{i:03d}", tiempo, mag=4.0 + (i % 30) / 10, lon=lon, lat=lat, updated_ms=tiempo + 1)))

linea(f"# 4.4 T036 - ensayo de interrupción {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}")
linea(f"base temporal: {TEMPORAL} (la base real {real.base} no se toca) | servidor FDSN simulado | {N_EVENTOS} eventos sintéticos de {ANIO}")

with psycopg.connect(conninfo_real, autocommit=True) as c:
    c.execute(f'DROP DATABASE IF EXISTS "{TEMPORAL}"')  # solo la base temporal de un ensayo anterior
    c.execute(f'CREATE DATABASE "{TEMPORAL}"')
try:
    with psycopg.connect(conninfo_temp, autocommit=True) as c:
        for nombre in ("001_esquema_live.sql", "002_esquema_f3.sql", "003_esquema_f4.sql"):
            c.execute((Path("/sql") / nombre).read_text(encoding="utf-8"))
        r = volcar(c, leer_catalogo(Path("/datos/paises.geojson")))
        linea(f"esquema aplicado y catálogo cargado en la base temporal: {r}")

    exportacion = Path("/tmp/exportacion_ensayo")
    shutil.rmtree(exportacion, ignore_errors=True)
    exportacion.mkdir()

    def consultar(sql):
        with psycopg.connect(conninfo_temp) as c:
            return c.execute(sql).fetchall()

    with ServidorFdsn(entradas) as servidor:
        servidor.retraso_s = 0.4
        entorno = dict(os.environ, POSTGRES_DB=TEMPORAL, HISTORICO_URL=servidor.url, HISTORICO_ANIO=str(ANIO), HISTORICO_MAX_REINTENTOS="0",
                       CATALOGO_PATH="/datos/paises.geojson", HISTORICO_EXPORT_DIR=str(exportacion), PYTHONPATH="/app/src")
        orden = [sys.executable, "-m", "observatorio.historico.cargar"]
        linea("\n## Ciclos: lanzar la carga, matarla (SIGKILL) tras N consultas `query`, comprobar el estado y reanudar")
        muertes = 0
        for objetivo in (2, 5, 9):
            proceso = subprocess.Popen(orden, env=entorno, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            while servidor.contar_peticiones("query") < objetivo and proceso.poll() is None:
                time.sleep(0.05)
            if proceso.poll() is None:
                proceso.kill()
                proceso.wait()
                muertes += 1
                estado = "MATADA"
            else:
                estado = "terminó antes de poder matarla"
            tramos_ok = consultar("SELECT count(*) FROM historico.consulta WHERE resultado = 'ok'")[0][0]
            huerfanos = consultar("SELECT count(*) FROM historico.evento e LEFT JOIN historico.consulta c ON c.id = e.consulta_id "
                                  "WHERE c.id IS NULL OR c.resultado <> 'ok'")[0][0]
            sin_archivo = consultar("SELECT count(*) FROM historico.consulta c LEFT JOIN historico.archivo a ON a.consulta_id = c.id "
                                    "WHERE c.resultado = 'ok' AND c.esperado > 0 AND a.consulta_id IS NULL")[0][0]
            eventos = consultar("SELECT count(*) FROM historico.evento")[0][0]
            linea(f"  tras {objetivo} consultas: carga {estado} | tramos ok={tramos_ok}/12 | eventos={eventos} | "
                  f"eventos de tramos no completos={huerfanos} | tramos ok sin archivo={sin_archivo}")
            assert huerfanos == 0 and sin_archivo == 0, "la interrupción dejó un tramo a medias"
        assert muertes >= 2, "el ensayo no llegó a interrumpir la carga"

        linea("\n## Reanudación final (sin matar)")
        antes = servidor.contar_peticiones("query")
        proceso = subprocess.run(orden, env=entorno, capture_output=True, text=True)
        linea("  código de salida: " + str(proceso.returncode))
        resumen = [x for x in proceso.stdout.splitlines() if x.startswith("RESUMEN")][-1]
        linea("  " + resumen[:400])
        pedidas = servidor.contar_peticiones("query") - antes
        linea(f"  consultas `query` de la reanudación: {pedidas} (solo los tramos que faltaban)")

        ids = [r[0] for r in consultar("SELECT event_id FROM historico.evento ORDER BY 1")]
        esperados = sorted(f["id"] for _, f in entradas)
        tramos = consultar("SELECT resultado, count(*) FROM historico.consulta GROUP BY 1")
        cuadre = consultar("SELECT coalesce(sum(obtenidos),0) - coalesce(sum(duplicados),0) - coalesce(sum(fuera_de_tramo),0) FROM historico.consulta")[0][0]
        cuar = consultar("SELECT count(*) FROM historico.cuarentena")[0][0]
        linea(f"  eventos cargados={len(ids)} esperados={len(esperados)} | distintos={len(set(ids))} | tramos={tramos} | cuadre Σobtenidos-Σduplic-Σfuera={cuadre} = eventos+cuarentena={len(ids) + cuar}")
        assert proceso.returncode == 0 and ids == esperados and len(set(ids)) == len(ids), "faltan o sobran eventos tras reanudar"
        assert cuadre == len(ids) + cuar
        sin_pais = consultar("SELECT count(*) FROM historico.evento WHERE geo_resultado = 'sin_pais'")[0][0]
        linea(f"  países asignados: {len(ids) - sin_pais} con país, {sin_pais} sin país (zona en el mar)")
        n_archivos = len(list(exportacion.glob('*.geojson.gz')))
        linea(f"  archivos exportados: {n_archivos} + SHA256SUMS={'sí' if (exportacion / 'SHA256SUMS').exists() else 'no'}")

        linea("\n## Una ejecución más: debe reutilizarlo todo")
        antes = len(servidor.peticiones)
        otra = subprocess.run(orden, env=entorno, capture_output=True, text=True)
        resumen2 = json.loads([x for x in otra.stdout.splitlines() if x.startswith("RESUMEN")][-1][8:])
        linea(f"  peticiones al servidor: {len(servidor.peticiones) - antes} | peticiones_http del resumen: {resumen2['peticiones_http']} | "
              f"reutilizados: {resumen2['tramos_reutilizados']} | eventos nuevos: {resumen2['eventos_nuevos']}")
        assert len(servidor.peticiones) == antes and resumen2["peticiones_http"] == 0 and resumen2["eventos_nuevos"] == 0
    linea("\nRESULTADO: OK - interrumpida y reanudada sin duplicados, sin tramos perdidos y sin consultas repetidas")
finally:
    with psycopg.connect(conninfo_real, autocommit=True) as c:
        c.execute(f'DROP DATABASE IF EXISTS "{TEMPORAL}"')
    linea(f"base temporal {TEMPORAL} eliminada")
