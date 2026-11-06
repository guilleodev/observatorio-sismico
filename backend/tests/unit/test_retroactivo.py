"""Paso 4.2: asignación retroactiva idempotente y segura frente al consumidor activo. PostgreSQL real; cada prueba se REVIERTE.

Los eventos de prueba (`prueba-r..`) y el catálogo de juguete se crean dentro de la transacción revertida y la pasada se limita a ese
prefijo: los eventos reales de `live.evento_actual` no se leen ni se modifican.
"""

import os

import psycopg
import pytest

from fixtures.geo import escribir_catalogo, entidades_de_juguete
from observatorio.config import ConfigPostgres
from observatorio.geo.asignador import Asignacion, Asignador
from observatorio.geo.catalogo import leer_catalogo
from observatorio.geo.retroactivo import asignar_existentes

pytestmark = pytest.mark.skipif(not os.environ.get("POSTGRES_HOST"), reason="sin PostgreSQL")

PREFIJO = "prueba-r"
SQL_INSERTAR = """
INSERT INTO live.evento_actual (event_id, event_time, updated_at, mag, longitude, latitude, source, mode, ingested_at,
                                kafka_topic, kafka_partition, kafka_offset, raw)
VALUES (%s, now(), now(), 3.1, %s, %s, 'usgs-all-day', 'live', now(), 't', 0, %s, '{}'::jsonb)
"""


def sembrar(conn, catalogo):
    conn.execute("INSERT INTO geo.catalogo (sha256, archivo, entidades) VALUES (%s, %s, %s)", (catalogo.sha256, catalogo.archivo, len(catalogo.paises)))
    for p in catalogo.paises:
        conn.execute("INSERT INTO geo.pais (country_id, nombre_es, nombre_en) VALUES (%s, %s, %s)", (p.country_id, p.nombre_es, p.nombre_en))


def sembrar_eventos(conn):
    for i, (lon, lat) in enumerate([(5, 5), (100, 50), (10, 5)], start=1):  # ZA1 interior, sin país, ZA1/ZB1 varias
        conn.execute(SQL_INSERTAR, (f"{PREFIJO}{i:02d}", lon, lat, i))


def fila(conn, id_):
    return conn.execute("SELECT country_id, country_name, geo_resultado, geo_catalogo, updated_at FROM live.evento_actual WHERE event_id = %s", (id_,)).fetchone()


@pytest.fixture()
def entorno(tmp_path):
    catalogo = leer_catalogo(escribir_catalogo(tmp_path / "v1.geojson"))
    with psycopg.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
        with conn.transaction(force_rollback=True):
            sembrar(conn, catalogo)
            sembrar_eventos(conn)
            yield conn, catalogo, Asignador(catalogo)


def test_asigna_a_los_pendientes_y_cuenta_por_resultado(entorno):
    conn, cat, asignador = entorno
    total_antes = conn.execute("SELECT count(*) FROM live.evento_actual").fetchone()[0]
    r = asignar_existentes(conn, asignador, prefijo_id=PREFIJO)
    assert (r.leidos, r.asignados, r.omitidos_por_carrera) == (3, 3, 0)
    assert dict(r.por_resultado) == {"interior": 1, "sin_pais": 1, "varias": 1}
    assert fila(conn, f"{PREFIJO}01")[:4] == ("ZA1", "Alfa", "interior", cat.sha256)
    assert fila(conn, f"{PREFIJO}02")[:4] == (None, None, "sin_pais", cat.sha256)
    assert fila(conn, f"{PREFIJO}03")[:4] == ("ZA1", "Alfa", "varias", cat.sha256)
    assert conn.execute("SELECT count(*) FROM live.evento_actual").fetchone()[0] == total_antes  # no se crea ni se borra ninguna fila


def test_es_idempotente_la_segunda_pasada_no_cambia_nada(entorno):
    conn, cat, asignador = entorno
    asignar_existentes(conn, asignador, prefijo_id=PREFIJO)
    antes = [fila(conn, f"{PREFIJO}0{i}") for i in (1, 2, 3)]
    r = asignar_existentes(conn, asignador, prefijo_id=PREFIJO)
    assert (r.leidos, r.asignados) == (0, 0)
    assert antes == [fila(conn, f"{PREFIJO}0{i}") for i in (1, 2, 3)]


def test_una_nueva_version_del_catalogo_reasigna_lo_ya_asignado(entorno, tmp_path):
    conn, cat1, asignador1 = entorno
    asignar_existentes(conn, asignador1, prefijo_id=PREFIJO)
    cambiada = entidades_de_juguete()
    cambiada[0]["properties"]["NAME_ES"] = "Alfa renombrada"
    cat2 = leer_catalogo(escribir_catalogo(tmp_path / "v2.geojson", cambiada))
    conn.execute("INSERT INTO geo.catalogo (sha256, archivo, entidades) VALUES (%s, %s, %s)", (cat2.sha256, cat2.archivo, len(cat2.paises)))
    conn.execute("UPDATE geo.pais SET nombre_es = 'Alfa renombrada' WHERE country_id = 'ZA1'")
    r = asignar_existentes(conn, Asignador(cat2), prefijo_id=PREFIJO)
    assert r.asignados == 3
    assert fila(conn, f"{PREFIJO}01")[:4] == ("ZA1", "Alfa renombrada", "interior", cat2.sha256)


def test_si_llega_una_version_mas_nueva_mientras_se_asigna_no_se_pisa(entorno):
    """Carrera con el consumidor: entre leer el evento y escribir su país, el consumidor guarda una versión posterior."""
    conn, cat, real = entorno

    class AsignadorConCarrera:
        catalogo_sha256 = cat.sha256

        def __init__(self):
            self.llamadas = 0

        def asignar(self, lon, lat):
            self.llamadas += 1
            if self.llamadas == 1:  # el «consumidor» guarda ahora una versión nueva del primer evento, ya con su país (ZB1)
                conn.execute("UPDATE live.evento_actual SET updated_at = updated_at + interval '1 minute', country_id = 'ZB1', country_name = 'Beta', "
                             "geo_resultado = 'interior', geo_catalogo = %s WHERE event_id = %s", (cat.sha256, f"{PREFIJO}01"))
            return real.asignar(lon, lat)

    r = asignar_existentes(conn, AsignadorConCarrera(), prefijo_id=PREFIJO)
    assert r.omitidos_por_carrera == 1 and r.asignados == 2
    pais, nombre, resultado, _, _ = fila(conn, f"{PREFIJO}01")
    assert (pais, nombre, resultado) == ("ZB1", "Beta", "interior")  # la versión nueva conserva SU país; la asignación vieja no la pisó
