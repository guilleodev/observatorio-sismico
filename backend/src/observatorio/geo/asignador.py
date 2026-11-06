"""Asignación de país por punto-en-polígono (paso 4.2; research R-001 y R-002).

Regla (determinista y documentada):
- Se buscan los polígonos que CUBREN el epicentro (el borde cuenta como pertenencia).
- Ninguno -> `sin_pais`: `country_id` nulo («Sin país asignado»). NUNCA se asigna el país más cercano.
- Uno solo, con el punto estrictamente dentro -> `interior`; con el punto en su borde -> `frontera`.
- Más de uno (borde compartido o solapamiento) -> `varias`: gana el menor `ADM0_A3` en orden alfabético.
Solo se usan las coordenadas, nunca el texto de `place`.
"""

import math
from dataclasses import dataclass

from shapely import STRtree, make_valid
from shapely.geometry import Point, shape

from observatorio.geo.catalogo import Catalogo

INTERIOR, FRONTERA, VARIAS, SIN_PAIS = "interior", "frontera", "varias", "sin_pais"


class GeometriaIrreparable(Exception):
    """Una geometría del catálogo es inválida y la reparación en memoria no da un polígono utilizable."""


@dataclass(frozen=True)
class Asignacion:
    country_id: str | None  # ADM0_A3; nulo = «Sin país asignado»
    nombre: str | None  # NAME_ES del catálogo; nulo si no hay país
    resultado: str  # interior | frontera | varias | sin_pais
    catalogo: str  # sha256 de la versión del catálogo que asignó


class Asignador:
    """Índice espacial del catálogo. Se construye una vez (arranque) y se consulta por evento."""

    def __init__(self, catalogo: Catalogo):
        self.catalogo_sha256 = catalogo.sha256
        # Orden alfabético por ADM0_A3: el índice de cada geometría ya refleja el desempate de R-002.
        paises = sorted(catalogo.paises, key=lambda p: p.country_id)
        self._paises = paises
        geometrias, reparadas = [], []
        for p in paises:
            g = shape(catalogo.geometrias[p.country_id])
            if not g.is_valid:
                # Reparación SOLO en memoria (el archivo del profesor no se toca). En el catálogo real afecta a EE. UU. y Sudán
                # (auto-intersección); está medido que no cambia el área ni el resultado (docs/evidencias/f4/4.2-validez-geometrias.txt).
                g = make_valid(g)
                reparadas.append(p.country_id)
                if g.is_empty or not g.is_valid or g.area == 0:
                    raise GeometriaIrreparable(f"la geometría de {p.country_id} es inválida y no se puede reparar")
            geometrias.append(g)
        self._geometrias = geometrias
        self._arbol = STRtree(geometrias)
        self.reparadas = tuple(reparadas)

    def asignar(self, longitud: float, latitud: float) -> Asignacion:
        if not (math.isfinite(longitud) and math.isfinite(latitud)) or not (-180 <= longitud <= 180 and -90 <= latitud <= 90):
            raise ValueError(f"coordenadas imposibles para asignar país: ({longitud}, {latitud})")
        punto = Point(longitud, latitud)
        # El árbol filtra por caja envolvente; `covers` confirma con el predicado exacto (el borde cuenta).
        cubren = sorted(int(i) for i in self._arbol.query(punto, predicate="intersects") if self._geometrias[int(i)].covers(punto))
        if not cubren:
            return Asignacion(None, None, SIN_PAIS, self.catalogo_sha256)
        elegido = cubren[0]
        if len(cubren) > 1:
            resultado = VARIAS
        elif self._geometrias[elegido].contains(punto):  # `contains` excluye el borde
            resultado = INTERIOR
        else:
            resultado = FRONTERA
        pais = self._paises[elegido]
        return Asignacion(pais.country_id, pais.nombre_es, resultado, self.catalogo_sha256)
