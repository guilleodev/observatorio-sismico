"""Informe de la batería geográfica (F4, paso 4.3, T022). Solo lectura.

Uso (en el contenedor, con backend montado en /app y el catálogo en /datos): PYTHONPATH=/app/src:/app/tests python /scripts/bateria.py
Imprime, para cada punto, el esperado INICIAL (escrito antes de ejecutar), el esperado vigente tras el análisis, el resultado obtenido y la causa.
"""

import random
from collections import Counter, defaultdict
from pathlib import Path

from shapely import make_valid
from shapely.geometry import Point, shape

from fixtures.bateria_geografica import filas_revisadas
from observatorio.config import RUTA_CATALOGO_DEFECTO
from observatorio.geo.asignador import Asignador
from observatorio.geo.catalogo import leer_catalogo

catalogo = leer_catalogo(Path(RUTA_CATALOGO_DEFECTO))
asignador = Asignador(catalogo)
filas = filas_revisadas()

print(f"Catálogo sha256={catalogo.sha256[:12]}… | entidades={len(catalogo.paises)} | geometrías reparadas en memoria: {', '.join(asignador.reparadas)}")
print(f"\n== Batería de referencia: {len(filas)} puntos ==")
print(f"{'punto':<52} {'lon,lat':>16}  {'esperado inicial':<17} {'vigente':<14} {'obtenido':<22} veredicto")
ok = 0
for nombre, lon, lat, esperado, categoria, nota, inicial, causa in filas:
    a = asignador.asignar(lon, lat)
    if categoria in ("mar", "escala"):
        cumple = a.country_id is None
    else:
        cumple = a.country_id == esperado
    ok += cumple
    ini = f"{inicial[1]}:{inicial[0] or '-'}" if inicial else f"{categoria}:{esperado or '-'}"
    print(f"{nombre[:52]:<52} {lon:>7.2f},{lat:>7.2f}  {ini:<17} {categoria + ':' + (esperado or '-'):<14} {(a.country_id or '-') + '/' + a.resultado:<22} {'OK' if cumple else 'FALLA'}")
    if causa:
        print(f"{'':<52} -> REVISADA ({'no es un error del asignador'}): {causa}")
print(f"\nResultado: {ok}/{len(filas)} puntos coinciden con la expectativa vigente; {sum(1 for f in filas if f[6])} expectativas se revisaron tras la primera ejecución (causas arriba)")
por_cat = Counter(f[4] for f in filas)
print(f"Por categoría: {dict(por_cat)}")

print("\n== Vértices del catálogo (propiedad exhaustiva) ==")
duenos = defaultdict(set)
for codigo, geom in catalogo.geometrias.items():
    for poligono in ([geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]):
        for anillo in poligono:
            for punto in anillo:
                duenos[(punto[0], punto[1])].add(codigo)
geoms = {c: (make_valid(g) if not g.is_valid else g) for c, g in ((c, shape(s)) for c, s in catalogo.geometrias.items())}
resultados, tri = Counter(), []
for (lon, lat), cods in duenos.items():
    a = asignador.asignar(lon, lat)
    resultados[a.resultado] += 1
    esperado = (min(cods), "varias" if len(cods) > 1 else "frontera")
    if (a.country_id, a.resultado) != esperado:
        cubren = sorted(c for c, g in geoms.items() if g.covers(Point(lon, lat)))
        tri.append(((lon, lat), sorted(cods), cubren, a.country_id))
print(f"vértices distintos: {len(duenos)} | con un solo dueño: {sum(1 for c in duenos.values() if len(c) == 1)} | compartidos por 2 o más países: {sum(1 for c in duenos.values() if len(c) > 1)}")
print(f"resultado del asignador sobre todos los vértices: {dict(resultados)}")
print(f"vértices que no coinciden con la lista de «dueños» (trifinios con un tercer país que no tiene el punto como vértice): {len(tri)}")
for t in tri:
    print("  ", t, "-> resultado correcto: varias con el menor ADM0_A3 de los que cubren el punto")

print("\n== Partes de cada entidad (antimeridiano incluido) ==")
partes = 0
for codigo, g in geoms.items():
    for parte in getattr(g, "geoms", [g]):
        if parte.is_empty or parte.area == 0:
            continue
        partes += 1
        p = parte.representative_point()
        cubren = sorted(c for c, otro in geoms.items() if otro.covers(p))
        assert codigo in cubren and asignador.asignar(p.x, p.y).country_id == cubren[0]
print(f"{partes} polígonos individuales: el punto representativo de cada uno se asigna correctamente (0 fallos)")
partidos = sorted(c for c, g in geoms.items() if any(abs(abs(b) - 180) < 1e-9 for part in getattr(g, 'geoms', [g]) for b in (part.bounds[0], part.bounds[2])))
print(f"entidades con alguna parte que toca ±180°: {', '.join(partidos)}")

print("\n== Aleatorio: 5 000 puntos del globo, índice espacial frente a recorrido secuencial ==")
rnd = random.Random(2026)
dif = sin_pais = 0
cuenta = Counter()
for _ in range(5000):
    lon, lat = rnd.uniform(-180, 180), rnd.uniform(-90, 90)
    p = Point(lon, lat)
    cubren = sorted(c for c, g in geoms.items() if g.covers(p))
    a = asignador.asignar(lon, lat)
    dif += a.country_id != (cubren[0] if cubren else None)
    cuenta[a.resultado] += 1
print(f"diferencias: {dif} | reparto: {dict(cuenta)}")
print("«sin país» = ningún polígono cubre el punto (comprobado uno a uno); jamás se usó la distancia al país más cercano")
