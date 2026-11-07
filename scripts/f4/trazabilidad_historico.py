"""Cuadres de trazabilidad del histórico (F4, paso 4.6, T057; research R-011). Solo lectura (más 13 consultas `count` a USGS, sin descargar datos).

Cadena: evento -> consulta (tramo, parámetros, fecha de extracción) -> archivo (sha256, tamaño) -> original; asignación -> geo_catalogo (huella del
catálogo vigente) y geo_resultado; origen -> `origen`. Compara además los recuentos por mes con un `count` NUEVO de USGS (revisiones posteriores).
Uso (contenedor del producer con /scripts y el catálogo montados):  python -X utf8 /scripts/trazabilidad_historico.py
"""

import gzip
import hashlib
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import psycopg

from observatorio.geo.catalogo import leer_catalogo
from pathlib import Path

fallos = []


def comprobar(cond, texto):
    print(("  OK    " if cond else "  FALLA ") + texto)
    if not cond:
        fallos.append(texto)


conn = psycopg.connect(f"host={os.environ['POSTGRES_HOST']} dbname={os.environ['POSTGRES_DB']} user={os.environ['POSTGRES_USER']} password={os.environ['POSTGRES_PASSWORD']}", autocommit=True)
conn.execute("SET TIME ZONE 'UTC'")
q = lambda sql, *a: conn.execute(sql, a).fetchall()
catalogo = leer_catalogo(Path(os.environ.get("CATALOGO_PATH", "/datos/paises.geojson")))

print("== 1. Cadena evento -> consulta -> archivo -> original ==")
n = q("SELECT count(*) FROM historico.evento")[0][0]
comprobar(q("SELECT count(*) FROM historico.evento e JOIN historico.consulta c ON c.id = e.consulta_id WHERE c.resultado = 'ok'")[0][0] == n, f"los {n} eventos enlazan con una consulta completa (resultado ok)")
comprobar(q("SELECT count(*) FROM historico.evento e JOIN historico.archivo a ON a.consulta_id = e.consulta_id")[0][0] == n, f"los {n} eventos enlazan con un archivo original")
archivos = q("SELECT a.consulta_id, a.sha256, a.tamano_bytes, a.contenido_gz, c.url, c.extraida_at, c.inicio, c.fin, c.obtenidos, c.esperado, c.filtros FROM historico.archivo a "
             "JOIN historico.consulta c ON c.id = a.consulta_id ORDER BY c.inicio")
malos_sha = sum(1 for a in archivos if hashlib.sha256(bytes(a[3])).hexdigest() != a[1] or len(bytes(a[3])) != a[2])
comprobar(malos_sha == 0, f"{len(archivos)} archivos: sha256 y tamaño recalculados desde el contenido comprimido coinciden con lo guardado ({malos_sha} diferencias)")
por_consulta = {a[0]: {f["id"]: f for f in json.loads(gzip.decompress(bytes(a[3])))["features"]} for a in archivos}
raws = q("SELECT event_id, consulta_id, raw FROM historico.evento")
fuera_de_archivo = sum(1 for eid, cid, raw in raws if por_consulta.get(cid, {}).get(eid) != raw)
comprobar(fuera_de_archivo == 0, f"el `raw` de cada evento es idéntico al feature de SU archivo original (diferencias: {fuera_de_archivo})")
sin_param = sum(1 for a in archivos if "starttime=" not in a[4] or "endtime=" not in a[4] or "minmagnitude=4" not in a[4] or "eventtype=earthquake" not in a[4])
comprobar(sin_param == 0, "cada consulta guarda la URL reproducible con starttime, endtime, minmagnitude=4 y eventtype=earthquake")
extracciones = sorted(a[5] for a in archivos)
print(f"  fecha de extracción: {extracciones[0]:%Y-%m-%d %H:%M:%S} .. {extracciones[-1]:%Y-%m-%d %H:%M:%S} UTC | ejemplo: {archivos[0][4]}")
print(f"  archivos exportados (si se montó /exportacion): {len(list(Path('/exportacion').glob('*.gz'))) if Path('/exportacion').is_dir() else 'no montado'}")

print("\n== 2. Recuentos por mes: lo guardado al cargar frente a un `count` NUEVO de USGS ==")
print(f"{'mes':<8}{'count al cargar':>16}{'eventos+cuar.':>14}{'count ahora':>12}  diferencia ahora-cargar")
tramos = q("""SELECT to_char(c.inicio, 'YYYY-MM'), c.inicio, c.fin, c.esperado,
              (SELECT count(*) FROM historico.evento e WHERE e.event_time >= c.inicio AND e.event_time < c.fin)
            + (SELECT count(*) FROM historico.cuarentena z WHERE z.consulta_id = c.id)
              FROM historico.consulta c WHERE c.resultado = 'ok' ORDER BY c.inicio""")
dif_total, hay_dif = 0, False
for mes, ini, fin, esperado, cargado in tramos:
    url = "https://earthquake.usgs.gov/fdsnws/event/1/count?" + urllib.parse.urlencode([
        ("format", "geojson"), ("starttime", f"{ini:%Y-%m-%dT%H:%M:%S}"), ("endtime", f"{fin:%Y-%m-%dT%H:%M:%S}"), ("minmagnitude", "4"), ("eventtype", "earthquake")])
    ahora = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "observatorio-sismico/1.0 (proyecto academico)"}), timeout=60).read())["count"]
    dif_total += ahora - esperado
    hay_dif = hay_dif or ahora != esperado
    print(f"{mes:<8}{esperado:>16}{cargado:>14}{ahora:>12}  {ahora - esperado:+d}")
    comprobar(esperado == cargado, f"{mes}: eventos + cuarentena ({cargado}) = count guardado al cargar ({esperado})")
print(f"  diferencia total de USGS desde la carga: {dif_total:+d} " + ("(USGS revisó o añadió eventos del pasado: se registra, no es un error de la carga)" if hay_dif else "(ninguna: el catálogo no ha cambiado desde la carga)"))
tot = q("SELECT sum(obtenidos), sum(duplicados), sum(fuera_de_tramo) FROM historico.consulta WHERE resultado = 'ok'")[0]
cuar = q("SELECT count(*) FROM historico.cuarentena")[0][0]
comprobar(tot[0] - tot[1] - tot[2] == n + cuar, f"total anual: Σobtenidos ({tot[0]}) − Σduplicados ({tot[1]}) − Σfuera_de_tramo ({tot[2]}) = eventos ({n}) + cuarentena ({cuar})")

print("\n== 3. Asignación geográfica: versión del catálogo y resultado ==")
comprobar(q("SELECT count(*) FROM historico.evento WHERE geo_resultado IS NULL OR geo_catalogo IS NULL")[0][0] == 0, "ningún evento sin geo_resultado ni geo_catalogo")
vers = q("SELECT geo_catalogo, count(*) FROM historico.evento GROUP BY 1")
comprobar(vers == [(catalogo.sha256, n)], f"todos los eventos asignados con el catálogo vigente {catalogo.sha256[:12]}… ({vers[0][1] if vers else 0} de {n})")
comprobar(q("SELECT count(*) FROM geo.catalogo WHERE sha256 = %s", catalogo.sha256)[0][0] == 1, "esa versión está registrada en geo.catalogo")
print("  reparto:", q("SELECT geo_resultado, count(*) FROM historico.evento GROUP BY 1 ORDER BY 2 DESC"))
print("  origen:", q("SELECT origen, count(*) FROM historico.evento GROUP BY 1"))

print("\n== 4. Separación de datos ==")
comprobar(q("SELECT count(*) FROM historico.evento h JOIN live.evento_actual l USING (event_id)")[0][0] == 0, "0 eventos de historico en live.evento_actual")
comprobar(q("SELECT count(*) FROM live.evento_actual WHERE mode <> 'live' OR source NOT IN ('usgs-all-day', 'usgs-fdsn-recuperacion')")[0][0] == 0, "live.evento_actual solo con mode=live y source del canal real")
comprobar(q("SELECT count(*) FROM live.evento_version WHERE source LIKE 'historico%%'")[0][0] == 0, "ningún source histórico en live.evento_version")

print("\nRESULTADO:", "OK - cadena evento→consulta→archivo→original verificada" if not fallos else f"FALLAN {len(fallos)}: {fallos}")
raise SystemExit(1 if fallos else 0)
