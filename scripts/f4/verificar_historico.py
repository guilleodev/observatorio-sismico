"""Verificación del histórico cargado (F4, paso 4.4, T038/T039/T041). Solo lectura: no escribe en ninguna tabla.

Comprueba: recuentos por mes (por `event_time`, UTC) frente al recuento de USGS guardado al cargar; cuadre del total; integridad de campos;
trazabilidad (archivo -> consulta -> evento, con huella recalculada y archivos exportados); asignación de país idéntica al recálculo con el
catálogo; y aislamiento respecto de `live` y `sintetico`.
Uso (en el contenedor, con backend en /app y el catálogo y la exportación montados):
    PYTHONPATH=/app/src python -X utf8 /scripts/verificar_historico.py [--exportacion /exportacion]
"""

import argparse
import gzip
import hashlib
import json
import os
import random
from collections import Counter
from pathlib import Path

import psycopg
from shapely import make_valid
from shapely.geometry import Point, shape

from observatorio.geo.asignador import Asignador
from observatorio.geo.catalogo import leer_catalogo

ap = argparse.ArgumentParser()
ap.add_argument("--exportacion", default=None)
ap.add_argument("--catalogo", default=os.environ.get("CATALOGO_PATH", "/datos/paises.geojson"))
args = ap.parse_args()
fallos = []


def comprobar(condicion, texto):
    print(("  OK   " if condicion else "  FALLA ") + texto)
    if not condicion:
        fallos.append(texto)


conninfo = f"host={os.environ['POSTGRES_HOST']} dbname={os.environ['POSTGRES_DB']} user={os.environ['POSTGRES_USER']} password={os.environ['POSTGRES_PASSWORD']}"
conn = psycopg.connect(conninfo)
conn.execute("SET TIME ZONE 'UTC'")
q = lambda sql, *a: conn.execute(sql, a).fetchall()

print("== 1. Recuentos por mes (por tiempo del evento, UTC) frente al recuento de USGS ==")
print(f"{'mes':<8}{'esperado(count)':>16}{'obtenidos':>10}{'eventos':>9}{'cuarent.':>9}{'duplic.':>8}{'fuera':>6}   eventos+cuarentena  diferencia con count")
meses = q("""
WITH tramo AS (  -- cada consulta hoja ('ok') con su mes de inicio; las subdivididas no tienen datos propios
  SELECT id, date_trunc('month', inicio) AS mes, esperado, obtenidos, duplicados, fuera_de_tramo FROM historico.consulta WHERE resultado = 'ok'),
ev AS (SELECT date_trunc('month', event_time) AS mes, count(*) n FROM historico.evento GROUP BY 1),
cu AS (SELECT t.mes, count(*) n FROM historico.cuarentena c JOIN tramo t ON t.id = c.consulta_id GROUP BY 1)
SELECT to_char(t.mes, 'YYYY-MM'), sum(t.esperado), sum(t.obtenidos), coalesce(max(ev.n), 0), coalesce(max(cu.n), 0), sum(t.duplicados), sum(t.fuera_de_tramo)
FROM tramo t LEFT JOIN ev ON ev.mes = t.mes LEFT JOIN cu ON cu.mes = t.mes GROUP BY t.mes ORDER BY t.mes""")
tot = Counter()
for mes, esp, obt, ev, cu, dup, fuera in meses:
    dif = (ev + cu) - esp
    print(f"{mes:<8}{esp:>16}{obt:>10}{ev:>9}{cu:>9}{dup:>8}{fuera:>6}   {ev + cu:>18}  {dif:+d}" + ("" if dif == 0 else "  <- explicar"))
    tot.update(esp=esp, obt=obt, ev=ev, cu=cu, dup=dup, fuera=fuera)
print(f"{'TOTAL':<8}{tot['esp']:>16}{tot['obt']:>10}{tot['ev']:>9}{tot['cu']:>9}{tot['dup']:>8}{tot['fuera']:>6}   {tot['ev'] + tot['cu']:>18}  {tot['ev'] + tot['cu'] - tot['esp']:+d}")
comprobar(len(meses) == 12, "12 meses cargados")
comprobar(all(ev + cu == esp for _, esp, _, ev, cu, _, _ in meses), "cada mes: eventos + cuarentena = count de USGS guardado al cargar (SC-006)")
comprobar(tot["obt"] - tot["dup"] - tot["fuera"] == tot["ev"] + tot["cu"], "cuadre: Σobtenidos − Σduplicados − Σfuera_de_tramo = |evento| + |cuarentena|")
fuera_rango = q("SELECT count(*) FROM historico.evento WHERE event_time < '2025-01-01' OR event_time >= '2026-01-01'")[0][0]
comprobar(fuera_rango == 0, f"0 eventos fuera de 2025 (UTC): {fuera_rango}")
print("\nConsultas:", q("SELECT resultado, count(*), sum(peticiones_http) FROM historico.consulta GROUP BY 1 ORDER BY 1"), "(resultado, tramos, peticiones HTTP)")

print("\n== 2. Integridad de los campos ==")
filas = q("""SELECT count(*), count(DISTINCT event_id), count(*) FILTER (WHERE mag IS NULL), min(mag), max(mag),
   count(*) FILTER (WHERE longitude NOT BETWEEN -180 AND 180 OR latitude NOT BETWEEN -90 AND 90),
   count(*) FILTER (WHERE origen <> 'historico-usgs-fdsn'), count(*) FILTER (WHERE raw->'properties'->>'type' <> 'earthquake'),
   count(*) FILTER (WHERE consulta_id IS NULL), count(*) FILTER (WHERE geo_resultado = 'sin_pais'), count(*) FILTER (WHERE (country_id IS NULL) <> (geo_resultado = 'sin_pais')),
   min(event_time), max(event_time), count(*) FILTER (WHERE depth_km IS NULL), count(*) FILTER (WHERE place IS NULL) FROM historico.evento""")[0]
n, distintos, sin_mag, mag_min, mag_max, coord_mal, origen_mal, tipo_mal, sin_consulta, sin_pais, incoherentes, t_min, t_max, sin_prof, sin_place = filas
print(f"  eventos={n} distintos={distintos} | mag {mag_min}..{mag_max} (nulas: {sin_mag}) | primer evento {t_min:%Y-%m-%d %H:%M:%S} | último {t_max:%Y-%m-%d %H:%M:%S} | profundidad nula: {sin_prof} | place nulo: {sin_place}")
comprobar(n == distintos, "event_id único (sin duplicados)")
comprobar(coord_mal == 0 and origen_mal == 0 and tipo_mal == 0 and sin_consulta == 0, f"coordenadas en rango, origen visible, solo earthquake, todos con consulta (fallos: {coord_mal},{origen_mal},{tipo_mal},{sin_consulta})")
comprobar(mag_min is None or float(mag_min) >= 4, f"magnitud mínima {mag_min} >= 4 (filtro de la consulta)")
comprobar(incoherentes == 0, "country_id nulo <=> geo_resultado = 'sin_pais'")
print("  reparto geográfico:", q("SELECT geo_resultado, count(*) FROM historico.evento GROUP BY 1 ORDER BY 2 DESC"), "| países distintos:", q("SELECT count(DISTINCT country_id) FROM historico.evento")[0][0])
print("  cuarentena:", q("SELECT categoria, motivo, count(*) FROM historico.cuarentena GROUP BY 1, 2 ORDER BY 3 DESC"))
print("  top países:", q("SELECT country_id, count(*) FROM historico.evento WHERE country_id IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 8"))

print("\n== 3. Trazabilidad: archivo -> consulta -> evento ==")
archivos = q("SELECT a.consulta_id, c.inicio, c.fin, a.sha256, a.contenido_gz, a.tamano_bytes, c.obtenidos FROM historico.archivo a JOIN historico.consulta c ON c.id = a.consulta_id ORDER BY c.inicio")
ids_en_archivos, valid_en_archivos, bytes_totales, malos = set(), 0, 0, 0
raw_por_id = {r[0]: r[1] for r in q("SELECT event_id, raw FROM historico.evento")}
discrepancia_raw = 0
for cid, ini, fin, sha, gz, tam, obt in archivos:
    gz = bytes(gz)
    bytes_totales += len(gz)
    if hashlib.sha256(gz).hexdigest() != sha or len(gz) != tam:
        malos += 1
    feats = json.loads(gzip.decompress(gz))["features"]
    if len(feats) != obt:
        malos += 1
    for f in feats:
        ids_en_archivos.add(f["id"])
        if f["id"] in raw_por_id and raw_por_id[f["id"]] != f:
            discrepancia_raw += 1
descomprimido = sum(len(gzip.decompress(bytes(a[4]))) for a in archivos)
print(f"  archivos en la base: {len(archivos)} | comprimidos {bytes_totales / 1e6:.2f} MB (sin comprimir {descomprimido / 1e6:.2f} MB) | tamaño de la tabla historico.archivo: {q(chr(83) + 'ELECT pg_size_pretty(pg_total_relation_size($$historico.archivo$$))')[0][0]}")
comprobar(malos == 0, "huella sha256 y tamaño recalculados coinciden con lo guardado; nº de features = obtenidos")
comprobar(set(raw_por_id) <= ids_en_archivos, "todo evento cargado está en alguno de los archivos originales")
comprobar(discrepancia_raw == 0, "el `raw` de cada evento es idéntico al feature del archivo original")
if args.exportacion:
    carpeta = Path(args.exportacion)
    sumas = dict(l.split("  ", 1)[::-1] for l in (carpeta / "SHA256SUMS").read_text().splitlines())
    ok = sum(1 for nombre, sha in sumas.items() if (carpeta / nombre).exists() and hashlib.sha256((carpeta / nombre).read_bytes()).hexdigest() == sha)
    en_base = {a[3] for a in archivos}
    comprobar(len(sumas) == len(archivos) == ok and {s for s in sumas.values()} == en_base, f"{ok}/{len(sumas)} archivos exportados recalculan su sha256 y coinciden con la base ({len(archivos)} archivos)")
    print("  exportados:", sorted(p.name for p in carpeta.glob("*.geojson.gz"))[:2], "…", f"({len(list(carpeta.glob('*.geojson.gz')))} archivos, {sum(p.stat().st_size for p in carpeta.glob('*.geojson.gz')) / 1e6:.2f} MB)")

print("\n== 4. Asignación de país: recálculo independiente con el catálogo ==")
catalogo = leer_catalogo(Path(args.catalogo))
asignador = Asignador(catalogo)
filas = q("SELECT event_id, longitude, latitude, country_id, geo_resultado, geo_catalogo FROM historico.evento")
dif = sum(1 for _, lon, lat, cid, res, cat in filas if (lambda a: (a.country_id, a.resultado, a.catalogo) != (cid, res, cat))(asignador.asignar(lon, lat)))
comprobar(dif == 0 and all(f[5] == catalogo.sha256 for f in filas), f"los {len(filas)} eventos coinciden con la asignación recalculada (diferencias: {dif}); catálogo {catalogo.sha256[:12]}…")
geoms = sorted((c, make_valid(g) if not g.is_valid else g) for c, g in ((c, shape(s)) for c, s in catalogo.geometrias.items()))
muestra = random.Random(7).sample(filas, 3000)
desacuerdo = 0
for _, lon, lat, cid, res, _ in muestra:  # recorrido secuencial de los 177 polígonos: no comparte código con el índice espacial
    p = Point(lon, lat)
    dueños = [c for c, g in geoms if g.covers(p)]
    esperado = dueños[0] if dueños else None
    if esperado != cid or (len(dueños) > 1) != (res == "varias"):
        desacuerdo += 1
comprobar(desacuerdo == 0, f"muestra de {len(muestra)} eventos contra el recorrido secuencial (sin índice): desacuerdos {desacuerdo}")

print("\n== 5. Aislamiento ==")
comprobar(q("SELECT count(*) FROM live.evento_actual l JOIN historico.evento h USING (event_id)")[0][0] == 0, "0 eventos de historico en live.evento_actual (por id)")
comprobar(q("SELECT count(*) FROM live.evento_version l JOIN historico.evento h USING (event_id)")[0][0] == 0, "0 eventos de historico en live.evento_version")
comprobar(q("SELECT count(*) FROM live.evento_actual WHERE source <> 'usgs-all-day' OR mode <> 'live'")[0][0] == 0, "live solo contiene source usgs-all-day / mode live")
comprobar(q("SELECT count(*) FROM historico.evento WHERE origen <> 'historico-usgs-fdsn'")[0][0] == 0, "0 filas de live en historico (todas con origen histórico)")
print("  tablas por esquema:", q("SELECT table_schema, count(*) FROM information_schema.tables WHERE table_schema IN ('live','historico','sintetico','geo') GROUP BY 1 ORDER BY 1"))
print("  sintetico md5:", q("SELECT md5(string_agg(t::text, '|' ORDER BY t::text)) FROM sintetico.evento_actual t")[0][0], "| filas:", q("SELECT count(*) FROM sintetico.evento_actual")[0][0])

print("\nRESULTADO:", "OK - todas las comprobaciones pasan" if not fallos else f"FALLAN {len(fallos)}: {fallos}")
raise SystemExit(0 if not fallos else 1)
