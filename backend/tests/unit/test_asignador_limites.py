"""Paso 4.3: casos geográficos especiales con el CATÁLOGO REAL (océanos, fronteras, vértices, solapamientos, antimeridiano, polos).

Se omite si el catálogo no está montado en /datos/paises.geojson. Los esperados de la batería están en fixtures/bateria_geografica.py y se
escribieron antes de ejecutar. Las propiedades sobre vértices se derivan de los datos crudos del catálogo (no del asignador).
"""

import json
import random
from collections import defaultdict
from pathlib import Path

import pytest
from shapely import make_valid
from shapely.geometry import Point, shape

from fixtures.bateria_geografica import BATERIA, filas_revisadas
from observatorio.config import RUTA_CATALOGO_DEFECTO
from observatorio.geo.asignador import Asignador
from observatorio.geo.catalogo import leer_catalogo

pytestmark = pytest.mark.skipif(not Path(RUTA_CATALOGO_DEFECTO).is_file(), reason="catálogo real no montado en /datos")


@pytest.fixture(scope="module")
def catalogo():
    return leer_catalogo(Path(RUTA_CATALOGO_DEFECTO))


@pytest.fixture(scope="module")
def asignador(catalogo):
    return Asignador(catalogo)


def test_la_bateria_tiene_al_menos_20_puntos_y_cubre_todas_las_categorias():
    assert len(BATERIA) >= 20
    assert {c for *_, c, _ in BATERIA} == {"pais", "mar", "escala", "especial"}


@pytest.mark.parametrize("nombre, lon, lat, esperado, categoria, nota, inicial, causa", filas_revisadas(), ids=[b[0] for b in filas_revisadas()])
def test_bateria_de_referencia(asignador, nombre, lon, lat, esperado, categoria, nota, inicial, causa):
    a = asignador.asignar(lon, lat)
    if categoria in ("mar", "escala"):
        assert (a.country_id, a.resultado) == (None, "sin_pais"), f"{nombre}: se esperaba sin país y salió {a.country_id}"
    else:
        assert a.country_id == esperado, f"{nombre}: se esperaba {esperado} y salió {a.country_id} ({a.resultado})"
        assert a.resultado in ("interior", "frontera", "varias")


# --- propiedades exhaustivas derivadas de los datos crudos del catálogo ---------------------------------------------------

def _vertices_por_pais(catalogo):
    """(lon, lat) -> {ADM0_A3 que tienen ese punto como vértice de algún anillo}. Independiente del asignador."""
    duenos = defaultdict(set)
    for codigo, geom in catalogo.geometrias.items():
        poligonos = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
        for poligono in poligonos:
            for anillo in poligono:
                for punto in anillo:
                    duenos[(punto[0], punto[1])].add(codigo)
    return duenos


def test_todos_los_vertices_del_catalogo_se_asignan_segun_la_regla(asignador, catalogo):
    """Un vértice está en el borde: un solo dueño -> frontera; varios dueños -> varias con el menor ADM0_A3.

    La lista de «dueños» sale de los vértices crudos y puede quedarse corta en un trifinio (otro país cuyo borde pasa exactamente por el
    punto sin tenerlo como vértice). Esos casos se verifican por recorrido secuencial de los 177 polígonos y se exige que los dueños
    estén entre los que cubren el punto.
    """
    duenos = _vertices_por_pais(catalogo)
    geoms = {c: (make_valid(g) if not g.is_valid else g) for c, g in ((c, shape(s)) for c, s in catalogo.geometrias.items())}
    trifinios, fallos = [], []
    for (lon, lat), codigos in duenos.items():
        a = asignador.asignar(lon, lat)
        if (a.country_id, a.resultado) == (min(codigos), "varias" if len(codigos) > 1 else "frontera"):
            continue
        p = Point(lon, lat)
        cubren = sorted(c for c, g in geoms.items() if g.covers(p))
        if codigos <= set(cubren) and (a.country_id, a.resultado) == (cubren[0], "varias"):
            trifinios.append(((lon, lat), sorted(codigos), cubren, a.country_id))
        else:
            fallos.append(((lon, lat), sorted(codigos), cubren, (a.country_id, a.resultado)))
    assert not fallos, f"{len(fallos)} vértices no cumplen la regla; primeros: {fallos[:5]}"
    assert len(duenos) > 7000  # vértices distintos del catálogo (hay ~10 600 contando los cierres de anillo)
    assert len(trifinios) <= 5  # trifinios con un tercer país que no tiene el punto como vértice (p. ej. Sudán-Sudán del Sur-Etiopía)


def test_hay_vertices_compartidos_entre_paises_y_ganan_el_menor_adm0_a3(asignador, catalogo):
    compartidos = {p: c for p, c in _vertices_por_pais(catalogo).items() if len(c) > 1}
    assert len(compartidos) > 100  # el catálogo es topológicamente consistente: las fronteras comparten vértices
    for (lon, lat), codigos in list(compartidos.items())[:300]:
        a = asignador.asignar(lon, lat)
        assert a.resultado == "varias" and a.country_id == min(codigos)


def test_el_resultado_no_depende_del_orden_del_catalogo(catalogo, asignador, tmp_path):
    ordenado_inverso = type(catalogo)(catalogo.sha256, catalogo.archivo, tuple(reversed(catalogo.paises)), dict(reversed(list(catalogo.geometrias.items()))))
    otro = Asignador(ordenado_inverso)
    rnd = random.Random(7)
    puntos = [(rnd.uniform(-180, 180), rnd.uniform(-90, 90)) for _ in range(1500)] + list(_vertices_por_pais(catalogo))[:1500]
    assert all(asignador.asignar(*p) == otro.asignar(*p) for p in puntos)


def test_el_indice_espacial_coincide_con_el_recorrido_secuencial_y_nunca_asigna_el_mas_cercano(asignador, catalogo):
    """5 000 puntos aleatorios del globo: STRtree == recorrido de los 177 polígonos; los «sin país» no están cubiertos por NINGUNO."""
    geoms = sorted((c, make_valid(g) if not g.is_valid else g) for c, g in ((c, shape(s)) for c, s in catalogo.geometrias.items()))
    rnd = random.Random(2026)
    sin_pais = 0
    for _ in range(5000):
        lon, lat = rnd.uniform(-180, 180), rnd.uniform(-90, 90)
        p = Point(lon, lat)
        cubren = [c for c, g in geoms if g.covers(p)]
        a = asignador.asignar(lon, lat)
        assert a.country_id == (cubren[0] if cubren else None)
        if not cubren:
            sin_pais += 1
            assert a.country_id is None and a.resultado == "sin_pais"
    assert sin_pais > 1000  # la mayor parte del globo es mar: el caso se ejerce de verdad


def test_cada_parte_de_cada_pais_se_asigna_a_ese_pais_incluidas_las_partidas_en_el_antimeridiano(asignador, catalogo):
    """Para CADA polígono de cada entidad (también las partes de Fiyi, Rusia o EE. UU. en ±180°), su punto interior representativo
    queda cubierto por esa entidad, y el país asignado es el menor ADM0_A3 de los que lo cubren (comprobado por recorrido secuencial)."""
    geoms = {c: (make_valid(g) if not g.is_valid else g) for c, g in ((c, shape(s)) for c, s in catalogo.geometrias.items())}
    partes = 0
    for codigo, g in geoms.items():
        for parte in getattr(g, "geoms", [g]):
            if parte.is_empty or parte.area == 0:
                continue
            partes += 1
            p = parte.representative_point()
            cubren = sorted(c for c, otro in geoms.items() if otro.covers(p))
            assert codigo in cubren
            assert asignador.asignar(p.x, p.y).country_id == cubren[0]
    assert partes > 177
