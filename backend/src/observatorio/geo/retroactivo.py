"""Asignación retroactiva de país a los eventos ya almacenados (paso 4.2, FR-009).

Idempotente: solo toca los eventos sin asignar o asignados con otra versión del catálogo; no borra ni duplica filas y no necesita
reprocesar Kafka. Es segura frente al consumidor activo: cada UPDATE exige que `updated_at` siga siendo el que se leyó, de modo que si
mientras tanto llegó una versión más nueva (con su propio país) no se sobrescribe (research R-004).
"""

import sys
from collections import Counter
from dataclasses import dataclass, field

import psycopg

from observatorio.config import ConfigError, ConfigGeo, ConfigPostgres
from observatorio.geo.asignador import Asignador, GeometriaIrreparable
from observatorio.geo.catalogo import CatalogoInvalido, leer_catalogo

SQL_PENDIENTES = """
SELECT event_id, updated_at, longitude, latitude FROM live.evento_actual
WHERE (geo_resultado IS NULL OR geo_catalogo IS DISTINCT FROM %(catalogo)s) AND event_id > %(ultimo)s
  AND starts_with(event_id, %(prefijo)s)
ORDER BY event_id LIMIT %(lote)s
"""

# Condicionado a la versión leída: si el consumidor ya guardó otra más nueva, rowcount = 0 y no se pisa.
SQL_ASIGNAR = """
UPDATE live.evento_actual SET country_id = %s, country_name = %s, geo_resultado = %s, geo_catalogo = %s
WHERE event_id = %s AND updated_at = %s
"""


@dataclass
class ResultadoRetroactivo:
    leidos: int = 0
    asignados: int = 0
    omitidos_por_carrera: int = 0
    por_resultado: Counter = field(default_factory=Counter)


def asignar_existentes(conexion: psycopg.Connection, asignador: Asignador, lote: int = 500, prefijo_id: str = "") -> ResultadoRetroactivo:
    """Asigna país a los eventos pendientes por lotes. Debe llamarse con una conexión en autocommit o dentro de una transacción.

    `prefijo_id` limita la pasada a los eventos cuyo identificador empieza así (las pruebas lo usan para no tocar eventos reales).
    """
    r = ResultadoRetroactivo()
    ultimo = ""
    while True:
        filas = conexion.execute(SQL_PENDIENTES, {"catalogo": asignador.catalogo_sha256, "ultimo": ultimo, "lote": lote, "prefijo": prefijo_id}).fetchall()
        if not filas:
            return r
        for event_id, updated_at, longitud, latitud in filas:
            r.leidos += 1
            a = asignador.asignar(longitud, latitud)
            if conexion.execute(SQL_ASIGNAR, (a.country_id, a.nombre, a.resultado, a.catalogo, event_id, updated_at)).rowcount == 1:
                r.asignados += 1
                r.por_resultado[a.resultado] += 1
            else:
                r.omitidos_por_carrera += 1
        ultimo = filas[-1][0]


def main() -> int:
    """`python -m observatorio.geo.retroactivo`: asigna país a los eventos de `live.evento_actual` que aún no lo tienen."""
    try:
        catalogo = leer_catalogo(ConfigGeo.desde_entorno().catalogo_path)
        asignador = Asignador(catalogo)
        postgres = ConfigPostgres.desde_entorno()
    except (ConfigError, CatalogoInvalido, GeometriaIrreparable) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    with psycopg.connect(postgres.conninfo(), autocommit=True) as conexion:
        if conexion.execute("SELECT 1 FROM geo.catalogo WHERE sha256 = %s", (catalogo.sha256,)).fetchone() is None:
            print("ERROR: la versión del catálogo no está en geo.catalogo: ejecutar antes python -m observatorio.geo.catalogo", file=sys.stderr)
            return 2
        antes = conexion.execute("SELECT count(*) FROM live.evento_actual").fetchone()[0]
        r = asignar_existentes(conexion, asignador)
        despues = conexion.execute("SELECT count(*) FROM live.evento_actual").fetchone()[0]
    print(f"Catálogo sha256={catalogo.sha256[:12]}… | geometrías reparadas en memoria: {', '.join(asignador.reparadas) or 'ninguna'}")
    print(f"evento_actual: filas antes={antes} después={despues} (no se borra ni se crea ninguna)")
    print(f"leídos={r.leidos} asignados={r.asignados} omitidos_por_carrera={r.omitidos_por_carrera}")
    print(f"por resultado: {dict(r.por_resultado)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
