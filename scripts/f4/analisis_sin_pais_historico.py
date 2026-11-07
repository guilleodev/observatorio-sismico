"""Análisis del 78 % de eventos históricos «sin país» y contraste de las asignaciones (F4, paso 4.6). Solo lectura.

1. Comprobación EXHAUSTIVA e independiente (shapely vectorizado, sin el índice del asignador): ¿algún evento «sin país» cae dentro de un polígono?
2. Distancia de cada evento «sin país» al polígono más cercano (solo ANÁLISIS: la asignación nunca usa distancias) y clasificación orientativa.
3. Pistas de USGS en `place` (distancia a la localidad de referencia), SOLO como control: nunca sustituyen a las coordenadas.
4. Contraste de los eventos CON país con el sufijo de `place` (≥ 100 eventos; SC-005): % de coincidencia y causa de cada discrepancia.
Uso (contenedor del producer con /scripts y el catálogo montados):  python -X utf8 /scripts/analisis_sin_pais_historico.py
"""

import json
import os
import statistics
from collections import Counter

import numpy as np
import psycopg
import shapely
from shapely import STRtree, make_valid
from shapely.geometry import Point, shape

from lugares import distancia_a, distancia_citada_km, indicio_de_mar, pais_sugerido, sufijo

conn = psycopg.connect(f"host={os.environ['POSTGRES_HOST']} dbname={os.environ['POSTGRES_DB']} user={os.environ['POSTGRES_USER']} password={os.environ['POSTGRES_PASSWORD']}", autocommit=True)
catalogo = json.load(open(os.environ.get("CATALOGO_PATH", "/datos/paises.geojson"), encoding="utf-8"))
codigos, geoms, nombre_a_codigo = [], [], {}
for f in sorted(catalogo["features"], key=lambda f: f["properties"]["ADM0_A3"]):
    g = shape(f["geometry"])
    codigos.append(f["properties"]["ADM0_A3"])
    geoms.append(make_valid(g) if not g.is_valid else g)
    nombre_a_codigo[f["properties"]["ADMIN"].lower()] = f["properties"]["ADM0_A3"]
    nombre_a_codigo[f["properties"]["NAME_ES"].lower()] = f["properties"]["ADM0_A3"]
arbol = STRtree(geoms)
fallos = []


def comprobar(cond, texto):
    print(("  OK    " if cond else "  FALLA ") + texto)
    if not cond:
        fallos.append(texto)


filas = conn.execute("SELECT event_id, longitude, latitude, mag, place, country_id, geo_resultado FROM historico.evento ORDER BY event_id").fetchall()
n = len(filas)
sin = [f for f in filas if f[6] == "sin_pais"]
con = [f for f in filas if f[5] is not None]
print(f"eventos históricos: {n} | con país: {len(con)} ({100 * len(con) / n:.1f} %) | sin país: {len(sin)} ({100 * len(sin) / n:.1f} %)\n")

print("== 1. Comprobación exhaustiva e independiente de la cobertura (todos los eventos, shapely vectorizado) ==")
puntos = shapely.points(np.array([f[1] for f in filas]), np.array([f[2] for f in filas]))
cubiertos = np.zeros(n, dtype=bool)
primer = [None] * n
for codigo, g in zip(codigos, geoms):  # orden alfabético: el primero que cubre es el menor ADM0_A3
    shapely.prepare(g)
    cubre = shapely.covers(g, puntos)
    for i in np.flatnonzero(cubre & ~cubiertos):
        primer[i] = codigo
    cubiertos |= cubre
discrepan = [filas[i][0] for i in range(n) if primer[i] != filas[i][5]]
comprobar(not discrepan, f"el país de los {n} eventos coincide con el recálculo vectorizado (diferencias: {len(discrepan)})")
dentro = [f[0] for f, c in zip(filas, cubiertos) if f[6] == "sin_pais" and c]
comprobar(not dentro, f"ningún evento «sin país» cae dentro de un polígono del catálogo (encontrados: {len(dentro)})")
multi = sum(1 for i in range(n) if filas[i][6] == "varias")
print(f"  eventos con varias coincidencias/frontera: {multi + sum(1 for f in filas if f[6] == 'frontera')}")

print("\n== 2. Distancia de los eventos «sin país» al polígono más cercano ==")
dist = []
for f in sin:
    p = Point(f[1], f[2])
    candidatos = arbol.query_nearest(p, all_matches=False)
    dist.append(min(distancia_a(p, geoms[int(i)]) for i in candidatos))
d = np.array(dist)
cat = Counter("costa/escala (≤ 5 km)" if x <= 5 else "costa afuera (5-50 km)" if x <= 50 else "mar abierto (> 50 km)" for x in dist)
for k in ("costa/escala (≤ 5 km)", "costa afuera (5-50 km)", "mar abierto (> 50 km)"):
    print(f"  {k:<26}{cat[k]:>7}  ({100 * cat[k] / len(sin):.1f} % de los sin país; {100 * cat[k] / n:.1f} % del total)")
print(f"  distancia al polígono más cercano: mediana {np.median(d):.0f} km | p90 {np.percentile(d, 90):.0f} km | máxima {d.max():.0f} km")

print("\n== 3. Pistas de USGS en `place` (solo control; no sustituyen a las coordenadas) ==")
con_cita = [(f, distancia_citada_km(f[4]), x) for f, x in zip(sin, dist) if distancia_citada_km(f[4]) is not None]
print(f"  sin país con distancia citada a una localidad de referencia: {len(con_cita)} de {len(sin)} ({100 * len(con_cita) / len(sin):.1f} %)")
cercanas = [(f, c, x) for f, c, x in con_cita if c <= 10]
print(f"  citan una localidad a ≤ 10 km (el epicentro estaría casi en la localidad): {len(cercanas)}")
isla_o_costa = [(f, c, x) for f, c, x in cercanas if x <= 25]
print(f"  · de ellos a ≤ 25 km de un polígono (costa o escala del catálogo 1:110 M): {len(isla_o_costa)}")
lejos = [(f, c, x) for f, c, x in cercanas if x > 25]
print(f"  · de ellos a > 25 km de cualquier polígono (isla ausente del catálogo, o nombre de localidad en el mar): {len(lejos)}")
for f, c, x in sorted(lejos, key=lambda t: -t[2])[:10]:
    print(f"      {f[0]} «{f[4]}» → polígono más cercano a {x:.0f} km")
regiones = Counter((sufijo(f[4]) or f[4] or "(sin place)") for f in sin if indicio_de_mar(f[4]) or sufijo(f[4]) is None)
print(f"  sin país con indicio de mar/región en `place` (región, dorsal, golfo, «east of…»): {sum(regiones.values())}")
print("  sufijos más frecuentes de los sin país:", Counter((sufijo(f[4]) or "(sin coma)") for f in sin).most_common(12))
sugeridos = Counter()
for f in sin:
    s, _ = pais_sugerido(f[4], nombre_a_codigo)
    if s:
        sugeridos[s] += 1
print("  país que sugiere `place` para los sin país (más frecuentes):", sugeridos.most_common(10))
print("  Lectura: los terremotos se concentran en zonas de subducción y dorsales, casi todas mar adentro: con un catálogo sin aguas territoriales, que un")
print("  78 % caiga fuera de todo polígono es coherente con la geología, no una anomalía. Distribución observada arriba; no se declara «correcto» sin esta evidencia.")

print("\n== 4. Contraste de los eventos CON país con el sufijo de `place` (control; SC-005) ==")
coincide = sin_criterio = 0
disc = []
for f in con:
    s, motivo = pais_sugerido(f[4], nombre_a_codigo)
    if s is None:
        sin_criterio += 1
    elif s == f[5]:
        coincide += 1
    else:
        disc.append((f, s, motivo))
comparables = coincide + len(disc)
print(f"  con país: {len(con)} | con criterio en `place`: {comparables} | sin criterio (sin coma o sufijo no reconocido): {sin_criterio}")
print(f"  COINCIDEN: {coincide} de {comparables} ({100 * coincide / comparables:.1f} %) | discrepancias: {len(disc)}")
idx = {c: g for c, g in zip(codigos, geoms)}
causas = Counter()
detalle = []
for f, sug, motivo in disc:
    p = Point(f[1], f[2])
    d_asig = distancia_a(p, idx[f[5]])
    d_sug = distancia_a(p, idx[sug]) if sug in idx else None
    if d_sug is None:
        causa = "país sugerido ausente del catálogo (escala 1:110 M)"
    elif d_sug <= 50:
        causa = "epicentro a ≤ 50 km del país sugerido (frontera, costa o localidad de referencia en el país vecino)"
    elif distancia_citada_km(f[4]) is not None and d_sug <= 1.1 * distancia_citada_km(f[4]) + 5:
        # USGS dice que la localidad de referencia está a X km; si el país sugerido queda a ≤ X km, la localidad está al otro lado de la frontera
        causa = "localidad de referencia en el país vecino a la distancia que cita USGS (el epicentro está a menos km del polígono sugerido que los citados)"
    elif f[5] == "USA" or sug == "USA":
        causa = "territorio no contiguo o dependencia (p. ej. Alaska, Hawái, Puerto Rico) frente al nombre de USGS"
    else:
        causa = "epicentro a > 50 km del país sugerido: revisar"
    causas[causa] += 1
    detalle.append((f[0], f[4], f[5], sug, d_sug, causa))
for causa, k in causas.most_common():
    print(f"    {k:>4}  {causa}")
sin_causa = sum(1 for *_, causa in detalle if causa.endswith("revisar"))
print(f"  discrepancias que quedan «a revisar»: {sin_causa}")
for eid, place, asig, sug, d_sug, causa in [x for x in detalle if x[5].endswith("revisar")][:15]:
    print(f"      {eid} «{place}» asignado {asig} / sugerido {sug} a {d_sug:.0f} km")
comprobar(comparables >= 100, f"≥ 100 eventos con país comparables con `place` ({comparables})")
print("  nota: toda discrepancia tiene una causa asignada salvo las listadas «a revisar» (se reportan, no se ocultan).")
print("\nRESULTADO:", "OK" if not fallos else f"FALLAN {len(fallos)}")
raise SystemExit(1 if fallos else 0)
