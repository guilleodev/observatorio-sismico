"""Utilidades de CONTROL (no de producción) para leer el texto `place` de USGS y la distancia a los polígonos (F4, paso 4.3).

El país NUNCA se obtiene de `place`: estas funciones solo sirven para contrastar (T023, T024). Solo lectura.
"""

import math
import re

from shapely.ops import nearest_points

# Siglas y nombres de estados de EE. UU. que USGS usa como sufijo de `place` («5 km SSW of Banning, CA»)
ESTADOS_SIGLAS = set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split())
ESTADOS_NOMBRES = {"Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
                   "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
                   "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
                   "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
                   "Washington", "West Virginia", "Wisconsin", "Wyoming"}
# Nombres que USGS escribe distinto del campo ADMIN del catálogo
ALIAS = {"Türkiye": "TUR", "Turkey": "TUR", "Russia": "RUS", "Russian Federation": "RUS", "South Korea": "KOR", "North Korea": "PRK", "Myanmar": "MMR",
         "Burma": "MMR", "Czech Republic": "CZE", "Czechia": "CZE", "Macedonia": "MKD", "North Macedonia": "MKD", "Ivory Coast": "CIV", "Cote d'Ivoire": "CIV",
         "Democratic Republic of the Congo": "COD", "Republic of the Congo": "COG", "Tanzania": "TZA", "Serbia": "SRB", "East Timor": "TLS", "Timor-Leste": "TLS",
         "United States": "USA", "Puerto Rico": "PRI", "Eswatini": "SWZ", "Syria": "SYR", "Laos": "LAO", "Vietnam": "VNM", "Brunei": "BRN", "Bolivia": "BOL",
         "Venezuela": "VEN", "Iran": "IRN", "Moldova": "MDA", "Palestine": "PSX", "Kosovo": "KOS", "Taiwan": "TWN", "Bahamas": "BHS", "The Bahamas": "BHS",
         "Falkland Islands": "FLK", "Cabo Verde": "CPV", "Cape Verde": "CPV"}
INDICIOS_MAR = ("region", "ridge", "sea", "ocean", "gulf", "strait", "off the coast", "off ", "rise", "trench", "basin", "channel", "bay", "islands region")


def haversine_km(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def mas_cercano(punto, geometrias):
    """(ADM0_A3, km) del polígono más cercano al punto. Solo para ANÁLISIS: la asignación jamás usa distancias."""
    mejor = None
    for codigo, g in geometrias.items():
        q = nearest_points(punto, g)[1]
        d = haversine_km(punto.x, punto.y, q.x, q.y)
        if mejor is None or d < mejor[1]:
            mejor = (codigo, d)
    return mejor


def distancia_a(punto, geometria):
    q = nearest_points(punto, geometria)[1]
    return haversine_km(punto.x, punto.y, q.x, q.y)


def sufijo(place):
    """Texto tras la última coma de `place` («5 km SSW of Banning, CA» -> «CA»), o None si no hay coma."""
    if not place or "," not in place:
        return None
    return place.rsplit(",", 1)[1].strip()


def pais_sugerido(place, nombre_a_codigo):
    """(ADM0_A3 | None, motivo) según el sufijo de `place`. Es una pista de control, no una fuente."""
    s = sufijo(place)
    if s is None:
        return None, "sin_sufijo"
    if s in ESTADOS_SIGLAS or s in ESTADOS_NOMBRES:
        return "USA", f"estado de EE. UU. ({s})"
    if s in ALIAS:
        return ALIAS[s], f"alias ({s})"
    codigo = nombre_a_codigo.get(s.lower())
    if codigo:
        return codigo, f"nombre del catálogo ({s})"
    return None, f"sufijo no reconocido ({s})"


def indicio_de_mar(place):
    t = (place or "").lower()
    return any(i in t for i in INDICIOS_MAR)


def distancia_citada_km(place):
    """Distancia a la localidad de referencia que cita USGS («14 km N of Warner Springs, CA» -> 14), o None."""
    m = re.match(r"\s*(\d+(?:\.\d+)?)\s*km\b", place or "")
    return float(m.group(1)) if m else None
