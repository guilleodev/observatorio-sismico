"""Paso 4.3: un evento NUEVO, una REVISIÓN y la asignación RETROACTIVA llegan al mismo país con el catálogo real.

Catálogo real montado en /datos y PostgreSQL real; todo se REVIERTE (prefijo `prueba-c`). Los países salen de la dimensión real `geo.pais`.
"""

import asyncio
import json
import os
import random
from pathlib import Path

import psycopg
import pytest

from fixtures.bateria_geografica import BATERIA
from fixtures.mensajes import construir_evento, construir_mensaje
from observatorio.config import ConfigPostgres, RUTA_CATALOGO_DEFECTO
from observatorio.consumer.mensaje import clasificar_mensaje
from observatorio.consumer.repositorio import RepositorioEventos
from observatorio.geo.asignador import Asignador
from observatorio.geo.catalogo import leer_catalogo
from observatorio.geo.retroactivo import asignar_existentes

pytestmark = pytest.mark.skipif(not (Path(RUTA_CATALOGO_DEFECTO).is_file() and os.environ.get("POSTGRES_HOST")),
                                reason="sin catálogo real montado o sin PostgreSQL")

T_EVENTO, T_INGESTA = 1_793_000_000_000, 1_793_100_000_000
SQL_INSERTAR = """
INSERT INTO live.evento_actual (event_id, event_time, updated_at, mag, longitude, latitude, source, mode, ingested_at,
                                kafka_topic, kafka_partition, kafka_offset, raw)
VALUES (%s, now(), now(), 3.1, %s, %s, 'usgs-all-day', 'live', now(), 't', 0, %s, '{}'::jsonb)
"""


def evento(id_, lon, lat, updated_ms):
    ev = construir_evento(1, ahora=T_EVENTO + 600_000)
    ev["id"] = id_
    ev["properties"].update(updated=updated_ms, type="earthquake", mag=3.2)
    ev["geometry"]["coordinates"] = [lon, lat, 10.0]
    return clasificar_mensaje(json.dumps(construir_mensaje(ev, ahora=T_INGESTA)).encode()).evento


def puntos_de_prueba():
    rnd = random.Random(11)
    globo = [(rnd.uniform(-180, 180), rnd.uniform(-90, 90)) for _ in range(60)]
    return globo + [(lon, lat) for _, lon, lat, *_ in BATERIA]


@pytest.fixture(scope="module")
def asignador():
    return Asignador(leer_catalogo(Path(RUTA_CATALOGO_DEFECTO)))


def test_un_evento_nuevo_y_una_revision_dan_el_mismo_pais_que_la_asignacion_directa(asignador):
    puntos = puntos_de_prueba()

    async def prueba():
        async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
            hay = await (await conn.execute("SELECT count(*) FROM geo.catalogo WHERE sha256 = %s", (asignador.catalogo_sha256,))).fetchone()
            assert hay[0] == 1, "ejecutar antes python -m observatorio.geo.catalogo"
            async with conn.transaction(force_rollback=True):
                repo = RepositorioEventos(conn, asignador)
                for i, (lon, lat) in enumerate(puntos):
                    # evento nuevo
                    await repo.guardar_version(evento(f"prueba-c{i:03d}-n", lon, lat, 1000), "t", 0, i)
                    # revisión: primero en Madrid, luego con las coordenadas de prueba (updated mayor), y una versión antigua tardía en Tokio
                    await repo.guardar_version(evento(f"prueba-c{i:03d}-v", -3.7, 40.4, 1000), "t", 0, 1000 + i)
                    await repo.guardar_version(evento(f"prueba-c{i:03d}-v", lon, lat, 2000), "t", 0, 2000 + i)
                    await repo.guardar_version(evento(f"prueba-c{i:03d}-v", 139.7, 35.7, 500), "t", 0, 3000 + i)  # no debe cambiar nada
                for sufijo in ("n", "v"):
                    cur = await conn.execute("SELECT event_id, country_id, geo_resultado FROM live.evento_actual WHERE event_id LIKE %s", (f"prueba-c___-{sufijo}",))
                    filas = {r[0]: (r[1], r[2]) for r in await cur.fetchall()}
                    assert len(filas) == len(puntos)
                    for i, (lon, lat) in enumerate(puntos):
                        a = asignador.asignar(lon, lat)
                        assert filas[f"prueba-c{i:03d}-{sufijo}"] == (a.country_id, a.resultado), f"{'nuevo' if sufijo == 'n' else 'revisado'} {(lon, lat)}"

    asyncio.run(prueba())


def test_la_asignacion_retroactiva_da_el_mismo_pais_que_la_asignacion_directa(asignador):
    puntos = puntos_de_prueba()
    with psycopg.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
        with conn.transaction(force_rollback=True):
            for i, (lon, lat) in enumerate(puntos):
                conn.execute(SQL_INSERTAR, (f"prueba-c{i:03d}-r", lon, lat, 4000 + i))
            r = asignar_existentes(conn, asignador, prefijo_id="prueba-c")  # solo los de prueba: no toca eventos reales
            assert (r.leidos, r.asignados, r.omitidos_por_carrera) == (len(puntos), len(puntos), 0)
            filas = {x[0]: (x[1], x[2]) for x in conn.execute(
                "SELECT event_id, country_id, geo_resultado FROM live.evento_actual WHERE event_id LIKE 'prueba-c___-r'").fetchall()}
            for i, (lon, lat) in enumerate(puntos):
                a = asignador.asignar(lon, lat)
                assert filas[f"prueba-c{i:03d}-r"] == (a.country_id, a.resultado), f"retroactivo {(lon, lat)}"
            assert asignar_existentes(conn, asignador, prefijo_id="prueba-c").leidos == 0  # idempotente
