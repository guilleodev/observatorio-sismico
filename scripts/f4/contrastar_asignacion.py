"""Contraste independiente de la asignación de país (F4, paso 4.2): solo lectura.

Recalcula el país de CADA evento de live.evento_actual recorriendo uno a uno los 177 polígonos (sin índice espacial ni el código del
asignador) y lo compara con lo guardado en la base. Sirve para comprobar que el índice `STRtree` y la regla de R-002 no cambian el
resultado. Uso (en el contenedor): python /scripts/contrastar_asignacion.py
"""

import json
import os
import sys

import psycopg
from shapely import make_valid
from shapely.geometry import Point, shape

RUTA = os.environ.get("CATALOGO_PATH", "/datos/paises.geojson")

catalogo = json.load(open(RUTA, encoding="utf-8"))
geometrias = []
for f in catalogo["features"]:
    g = shape(f["geometry"])
    geometrias.append((f["properties"]["ADM0_A3"], make_valid(g) if not g.is_valid else g))
geometrias.sort()  # orden alfabético por ADM0_A3: el desempate de R-002

conninfo = f"host={os.environ['POSTGRES_HOST']} dbname={os.environ['POSTGRES_DB']} user={os.environ['POSTGRES_USER']} password={os.environ['POSTGRES_PASSWORD']}"
with psycopg.connect(conninfo) as conn:
    filas = conn.execute("SELECT event_id, longitude, latitude, country_id, geo_resultado FROM live.evento_actual ORDER BY event_id").fetchall()

discrepancias, sin_asignar, por_resultado = [], 0, {}
for event_id, lon, lat, pais_bd, resultado_bd in filas:
    if resultado_bd is None:
        sin_asignar += 1
        continue
    p = Point(lon, lat)
    cubren = [codigo for codigo, g in geometrias if g.covers(p)]
    pais = cubren[0] if cubren else None
    resultado = "sin_pais" if not cubren else "varias" if len(cubren) > 1 else ("interior" if dict(geometrias)[pais].contains(p) else "frontera")
    por_resultado[resultado] = por_resultado.get(resultado, 0) + 1
    if (pais, resultado) != (pais_bd, resultado_bd):
        discrepancias.append((event_id, lon, lat, (pais_bd, resultado_bd), (pais, resultado)))

print(f"eventos leídos: {len(filas)} | sin asignar (omitidos): {sin_asignar} | contrastados: {len(filas) - sin_asignar}")
print(f"resultado independiente (recorrido secuencial): {por_resultado}")
print(f"DISCREPANCIAS con lo guardado: {len(discrepancias)}")
for d in discrepancias[:20]:
    print("  ", d)
sys.exit(1 if discrepancias else 0)
