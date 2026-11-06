"""Contraste de CONTROL del país asignado con el sufijo de `place` (F4, paso 4.3, T024). Solo lectura.

`place` NO es la fuente del país (la asignación usa solo las coordenadas); aquí solo se comprueba que ambas informaciones no se contradicen.
Algoritmo: sufijo tras la última coma de `place` -> estado de EE. UU. / alias documentado / nombre del catálogo (ADMIN o NAME_ES) -> ADM0_A3 sugerido.
Resultados por evento con país asignado:
  coincide        el país asignado es el sugerido
  sin criterio    `place` no permite sugerir un país (sin coma o sufijo no reconocido): no cuenta ni a favor ni en contra
  discrepancia    el país asignado difiere del sugerido: se lista con las distancias al polígono de cada uno y se asigna una causa
Uso (en el contenedor): python -X utf8 /scripts/contraste_place.py
"""

import json
import os
from collections import Counter

import psycopg
from shapely import make_valid
from shapely.geometry import Point, shape

from lugares import distancia_a, pais_sugerido, sufijo

RUTA = os.environ.get("CATALOGO_PATH", "/datos/paises.geojson")
catalogo = json.load(open(RUTA, encoding="utf-8"))
geoms, nombre_a_codigo, nombre_de = {}, {}, {}
for f in catalogo["features"]:
    g = shape(f["geometry"])
    c = f["properties"]["ADM0_A3"]
    geoms[c] = make_valid(g) if not g.is_valid else g
    nombre_a_codigo[f["properties"]["ADMIN"].lower()] = c
    nombre_a_codigo[f["properties"]["NAME_ES"].lower()] = c
    nombre_de[c] = f["properties"]["ADMIN"]

conninfo = f"host={os.environ['POSTGRES_HOST']} dbname={os.environ['POSTGRES_DB']} user={os.environ['POSTGRES_USER']} password={os.environ['POSTGRES_PASSWORD']}"
with psycopg.connect(conninfo) as conn:
    filas = conn.execute("SELECT event_id, longitude, latitude, country_id, place FROM live.evento_actual WHERE country_id IS NOT NULL ORDER BY event_id").fetchall()

coincide, sin_criterio, discrepancias = 0, 0, []
por_pais = Counter()
for event_id, lon, lat, asignado, place in filas:
    por_pais[asignado] += 1
    sugerido, motivo = pais_sugerido(place, nombre_a_codigo)
    if sugerido is None:
        sin_criterio += 1
    elif sugerido == asignado:
        coincide += 1
    else:
        p = Point(lon, lat)
        discrepancias.append((event_id, place, asignado, sugerido, motivo, distancia_a(p, geoms[asignado]) if asignado in geoms else None,
                              distancia_a(p, geoms[sugerido]) if sugerido in geoms else None))

comparables = coincide + len(discrepancias)
print(f"eventos con país asignado: {len(filas)} (de {len(por_pais)} países distintos: {dict(por_pais.most_common(8))})")
print(f"con criterio en `place`: {comparables} | sin criterio (sin coma o sufijo no reconocido): {sin_criterio}")
print(f"COINCIDEN: {coincide} de {comparables} ({100 * coincide / comparables:.1f} %) | DISCREPANCIAS: {len(discrepancias)}")
for event_id, place, asignado, sugerido, motivo, d_asig, d_sug in discrepancias:
    print(f"  {event_id}: «{place}» -> asignado {asignado} (a {d_asig:.0f} km del polígono) / sugerido {sugerido} [{motivo}] (a {d_sug if d_sug is None else round(d_sug)} km)")
if not discrepancias:
    print("  (ninguna)")
print("\nSufijos sin criterio:", dict(Counter(sufijo(p) or '(sin coma)' for _, _, _, c, p in filas if pais_sugerido(p, nombre_a_codigo)[0] is None)))
