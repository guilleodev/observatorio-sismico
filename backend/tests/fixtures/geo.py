"""Catálogo de juguete para las pruebas geográficas (paso 4.2). Códigos Z?? con dígito: no existen en el catálogo real.

Mapa (longitud, latitud):
  ZA1 [0,10]x[0,10]  y  ZB1 [10,20]x[0,10]   comparten el borde x = 10
  ZC1 [30,50]x[0,20] con un hueco [35,45]x[5,15] (un «lago»: sin país)
  ZE1 [60,70]x[0,10] y  ZF1 [65,75]x[0,10]   se solapan en x entre 65 y 70
  ZG1 «corbata»: dos triángulos unidos en (85, 5); es una geometría INVÁLIDA (auto-intersección) como EE. UU. y Sudán en el catálogo real
"""

import json

CODIGOS = ("ZA1", "ZB1", "ZC1", "ZE1", "ZF1", "ZG1")


def _cuadrado(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]


def _entidad(codigo, nombre_es, nombre_en, anillos):
    return {"type": "Feature",
            "properties": {"ADM0_A3": codigo, "NAME_ES": nombre_es, "ADMIN": nombre_en, "CONTINENT": "Europe",
                           "SUBREGION": "Test", "TYPE": "Sovereign country", "ISO_A3": "-99"},
            "geometry": {"type": "Polygon", "coordinates": anillos}}


def entidades_de_juguete():
    return [
        _entidad("ZA1", "Alfa", "Alpha", [_cuadrado(0, 0, 10, 10)]),
        _entidad("ZB1", "Beta", "Beta", [_cuadrado(10, 0, 20, 10)]),
        _entidad("ZC1", "Ceta", "Zeta", [_cuadrado(30, 0, 50, 20), _cuadrado(35, 5, 45, 15)]),
        _entidad("ZE1", "Épsilon", "Epsilon", [_cuadrado(60, 0, 70, 10)]),
        _entidad("ZF1", "Fi", "Phi", [_cuadrado(65, 0, 75, 10)]),
        _entidad("ZG1", "Gamma", "Gamma", [[[80, 0], [90, 10], [90, 0], [80, 10], [80, 0]]]),
    ]


def escribir_catalogo(ruta, entidades=None):
    ruta.write_text(json.dumps({"type": "FeatureCollection", "features": entidades or entidades_de_juguete()}), encoding="utf-8")
    return ruta
