"""Informe de solo lectura del catalogo de paises (F4, paso 4.1, T002). Solo biblioteca estandar.

Uso: py -3.13 scripts/f4/explorar_catalogo.py [ruta]   (por defecto frontend/public/datos/paises.geojson)
No modifica el archivo. La validez geometrica (auto-intersecciones) necesita Shapely y se comprueba en el paso 4.2.
"""

import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

RUTA = Path(sys.argv[1] if len(sys.argv) > 1 else "frontend/public/datos/paises.geojson")
ATRIBUTOS_USADOS = ("ADM0_A3", "NAME_ES", "ADMIN", "CONTINENT", "SUBREGION", "TYPE", "ISO_A3")


def anillos(geom):
    if geom["type"] == "Polygon":
        return list(geom["coordinates"])
    if geom["type"] == "MultiPolygon":
        return [anillo for poligono in geom["coordinates"] for anillo in poligono]
    return []


def main() -> None:
    crudo = RUTA.read_bytes()
    datos = json.loads(crudo)
    entidades = datos["features"]
    print(f"Archivo: {RUTA} | tamano: {len(crudo)} bytes | sha256: {hashlib.sha256(crudo).hexdigest()}")
    print(f"Tipo: {datos.get('type')} | CRS declarado: {datos.get('crs')} | entidades: {len(entidades)}")

    propiedades = [e.get("properties") or {} for e in entidades]
    print(f"Atributos por entidad: {len(propiedades[0])} (muestra de claves: {sorted(propiedades[0])[:6]} ...)")
    for nombre in ATRIBUTOS_USADOS:
        ausentes = sum(1 for p in propiedades if nombre not in p)
        nulos = sum(1 for p in propiedades if nombre in p and p[nombre] in (None, ""))
        print(f"  atributo {nombre}: ausente en {ausentes}, vacio en {nulos}")

    codigos = [p.get("ADM0_A3") for p in propiedades]
    repetidos = sorted(k for k, v in Counter(codigos).items() if v > 1)
    vacios = sum(1 for c in codigos if not c)
    formato = [c for c in codigos if c and not re.fullmatch(r"[A-Z0-9]{3}", c)]
    print(f"\nADM0_A3: {len(set(codigos))} distintos | repetidos: {repetidos or 'ninguno'} | vacios: {vacios} | formato distinto de 3 caracteres A-Z/0-9: {formato or 'ninguno'}")
    solo_iso = [(p["ADM0_A3"], p.get("ADMIN")) for p in propiedades if p.get("ADM0_A3") != p.get("ISO_A3")]
    print(f"ADM0_A3 distinto de ISO_A3 en {len(solo_iso)} entidades (por eso no se presupone ISO):")
    for codigo, nombre in solo_iso:
        iso = next(p.get("ISO_A3") for p in propiedades if p["ADM0_A3"] == codigo)
        print(f"  {codigo:>4}  ISO_A3={iso!s:>4}  {nombre}")

    print(f"\nTipos de geometria: {dict(Counter((e.get('geometry') or {}).get('type') for e in entidades))}")
    sin_geom = [p.get('ADM0_A3') for e, p in zip(entidades, propiedades) if not e.get("geometry")]
    print(f"Entidades sin geometria: {sin_geom or 'ninguna'}")

    fuera, abiertos, pocos, vertices = 0, 0, 0, 0
    for e in entidades:
        for anillo in anillos(e["geometry"]):
            vertices += len(anillo)
            if anillo[0] != anillo[-1]:
                abiertos += 1
            if len(anillo) < 4:
                pocos += 1
            for punto in anillo:
                lon, lat = punto[0], punto[1]
                if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                    fuera += 1
    print(f"Anillos: total de vertices {vertices} | anillos no cerrados: {abiertos} | anillos con menos de 4 puntos: {pocos} | vertices fuera de rango lon/lat: {fuera}")

    print(f"\nTYPE: {dict(Counter(p.get('TYPE') for p in propiedades))}")
    print(f"CONTINENT: {dict(Counter(p.get('CONTINENT') for p in propiedades))}")
    nombres_es = Counter(p.get("NAME_ES") for p in propiedades)
    print(f"NAME_ES repetidos: {[k for k, v in nombres_es.items() if v > 1] or 'ninguno'}")
    for codigo in ("ESP", "FRA", "NOR", "PSX", "SOL", "CYP", "USA", "RUS", "FJI"):
        fila = next((p for p in propiedades if p["ADM0_A3"] == codigo), None)
        print(f"  muestra {codigo}: {None if fila is None else (fila['NAME_ES'], fila['ADMIN'], fila['TYPE'], fila['SUBREGION'])}")


main()
