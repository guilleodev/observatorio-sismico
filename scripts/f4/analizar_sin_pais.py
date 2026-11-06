"""Análisis de los eventos reales clasificados «sin país» (F4, paso 4.3, T023). Solo lectura.

Para cada evento: distancia al polígono más cercano (solo análisis; la asignación nunca usa distancias), qué sugiere `place` (solo control), la
distancia al país sugerido y la distancia que CITA USGS a su localidad de referencia. Clasificación automática ORIENTATIVA:
  localidad/costa  el evento está en su localidad de referencia (cita <= 5 km) o a <= 5 km del polígono: tierra firme o costa que el catálogo 1:110 M
                   no recoge (limitación de escala, no un error de lógica)
  mar abierto      polígono más cercano a más de 50 km
  costa afuera     entre 5 y 50 km del polígono más cercano
  a revisar        la distancia al país sugerido supera en más de 100 km a la que cita USGS: coherente con una isla de referencia que el catálogo
                   no trae, pero se comprueba a mano (ver el bloque «a revisar»)
Uso (en el contenedor): python -X utf8 /scripts/analizar_sin_pais.py
"""

import json
import os
from collections import Counter

import psycopg
from shapely import make_valid
from shapely.geometry import Point, shape

from lugares import distancia_a, distancia_citada_km, indicio_de_mar, mas_cercano, pais_sugerido

RUTA = os.environ.get("CATALOGO_PATH", "/datos/paises.geojson")
catalogo = json.load(open(RUTA, encoding="utf-8"))
geoms, nombre_a_codigo = {}, {}
for f in catalogo["features"]:
    g = shape(f["geometry"])
    geoms[f["properties"]["ADM0_A3"]] = make_valid(g) if not g.is_valid else g
    nombre_a_codigo[f["properties"]["ADMIN"].lower()] = f["properties"]["ADM0_A3"]
    nombre_a_codigo[f["properties"]["NAME_ES"].lower()] = f["properties"]["ADM0_A3"]

conninfo = f"host={os.environ['POSTGRES_HOST']} dbname={os.environ['POSTGRES_DB']} user={os.environ['POSTGRES_USER']} password={os.environ['POSTGRES_PASSWORD']}"
with psycopg.connect(conninfo) as conn:
    total = conn.execute("SELECT count(*) FROM live.evento_actual").fetchone()[0]
    reparto = dict(conn.execute("SELECT geo_resultado, count(*) FROM live.evento_actual GROUP BY 1 ORDER BY 1").fetchall())
    filas = conn.execute("SELECT event_id, longitude, latitude, mag, place, to_char(event_time, 'MM-DD HH24:MI') FROM live.evento_actual "
                         "WHERE geo_resultado = 'sin_pais' ORDER BY latitude DESC, longitude").fetchall()

print(f"evento_actual: {total} filas | reparto por resultado: {reparto}")
print(f"eventos «sin país» analizados: {len(filas)}\n")
print(f"{'id':<14} {'lon':>9} {'lat':>8} {'mag':>4}  {'más cercano (km)':<16} {'texto sugiere':<22} {'dist. al sugerido':>17} {'cita':>5}  categoría | place")
cuenta = Counter()
detalle = []
for event_id, lon, lat, mag, place, hora in filas:
    p = Point(lon, lat)
    cercano, km = mas_cercano(p, geoms)
    sugerido, motivo = pais_sugerido(place, nombre_a_codigo)
    d_sug = distancia_a(p, geoms[sugerido]) if sugerido in geoms else None
    cita = distancia_citada_km(place)
    if sugerido and d_sug is not None and cita is not None and d_sug - cita > 100:
        cat = "a revisar"
    elif km <= 5 or (cita is not None and cita <= 5):
        cat = "localidad/costa"
    elif km > 50:
        cat = "mar abierto"
    else:
        cat = "costa afuera"
    cuenta[cat] += 1
    detalle.append((event_id, cat, km, sugerido, d_sug))
    print(f"{event_id:<14} {lon:>9.3f} {lat:>8.3f} {str(mag) if mag is not None else '-':>4}  {cercano + ' ' + format(km, '.1f'):<16} "
          f"{(sugerido or '-') + (' *' if indicio_de_mar(place) else ''):<22} {('%.0f km' % d_sug) if d_sug is not None else '-':>17} {('%g' % cita) if cita else '-':>5}  {cat} | {place}")
print(f"\nResumen por categoría orientativa: {dict(cuenta)}")
print("(* = el texto de place contiene un indicio de mar: región, dorsal, golfo, océano…)")
print(f"distancia mediana al polígono más cercano: {sorted(d[2] for d in detalle)[len(detalle) // 2]:.1f} km | máxima: {max(d[2] for d in detalle):.1f} km")

revisar = [d for d in detalle if d[1] == "a revisar"]
if revisar:
    print("\n== Bloque «a revisar» ==")
    for event_id, cat, km, sugerido, d_sug in revisar:
        partes = [tuple(round(x, 1) for x in parte.bounds) for parte in getattr(geoms[sugerido], "geoms", [geoms[sugerido]])]
        print(f"{event_id}: país sugerido {sugerido} a {d_sug:.0f} km; el catálogo tiene {len(partes)} polígono(s) de {sugerido} con cajas (lon0,lat0,lon1,lat1): {partes}")
