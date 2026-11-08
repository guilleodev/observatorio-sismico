"""F6, T007: el replay pasa por el MISMO procesamiento del consumidor (procesar_registro) en una base TEMPORAL con el esquema `replay` real.

Oráculo (research R-004): 30 eventos reales + 9 mensajes de casos = 39 mensajes -> 35 filas actuales, 37 versiones, 1 en cuarentena y 1 duplicado descartado.
"""

import asyncio
import os
import pathlib
from types import SimpleNamespace

import psycopg
import pytest

from fixtures.base_replay import base_temporal_replay, hay_entorno, huella_tabla, insertar_historico
from fixtures.geo import escribir_catalogo
from fixtures.replay_datos import seleccion_ficticia
from observatorio.consumer.destino import DESTINO_LIVE, DESTINO_REPLAY
from observatorio.consumer.main import procesar_registro
from observatorio.consumer.mensaje import clasificar_mensaje
from observatorio.consumer.repositorio import RepositorioEventos
from observatorio.geo.asignador import Asignador
from observatorio.geo.catalogo import leer_catalogo
from observatorio.replay import casos

pytestmark = pytest.mark.skipif(not hay_entorno(), reason="sin PostgreSQL o sin sql/004_esquema_f6.sql")
RUN = "r-20261108T100000Z"
AHORA = 1_794_300_000_000


class Consumidor:
    def __init__(self):
        self.confirmados = []

    async def commit(self, offsets):
        self.confirmados.extend(offsets.values())


def registros(run_id=RUN, desde=0, n=None, topic="terremotos.replay"):
    """Los 39 mensajes del replay como los vería el consumidor (offsets consecutivos desde `desde`)."""
    secuencia = casos.construir_secuencia(seleccion_ficticia(30))
    salida = []
    for k, m in enumerate(secuencia[:n]):
        clave, valor = casos.serializar(casos.a_mensaje_kafka(m, run_id, 1200.0, AHORA + k * 2000))
        salida.append(SimpleNamespace(topic=topic, partition=0, offset=desde + k, key=clave, value=valor))
    return salida


def registrar_ejecucion(c, run_id=RUN):
    c.execute("INSERT INTO replay.ejecucion (run_id, tamano, mensajes, criterio, intervalo_s, velocidad) VALUES (%s, 30, 39, 'prueba', 2, 1200) "
              "ON CONFLICT (run_id) DO NOTHING", (run_id,))


def procesar(info, tmp_path, lotes, destino=DESTINO_REPLAY):
    """Procesa los lotes de registros contra la base temporal y devuelve los resultados de `procesar_registro`."""
    catalogo = leer_catalogo(escribir_catalogo(tmp_path / "juguete.geojson"))

    async def interior():
        async with await psycopg.AsyncConnection.connect(info, autocommit=True) as conn:
            await conn.execute("INSERT INTO geo.catalogo (sha256, archivo, entidades) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                               (catalogo.sha256, catalogo.archivo, len(catalogo.paises)))  # el catálogo de juguete, en la base temporal
            repo = RepositorioEventos(conn, Asignador(catalogo), destino=destino)
            consumidor, resultados = Consumidor(), []
            for lote in lotes:
                for r in lote:
                    resultados.append(await procesar_registro(consumidor, r, repo))
            return resultados, consumidor.confirmados

    return asyncio.run(interior())


def contar(info, run_id=RUN):
    with psycopg.connect(info, autocommit=True) as c:
        q = lambda sql, *a: c.execute(sql, a).fetchone()[0]  # noqa: E731
        return (q("SELECT count(*) FROM replay.evento_actual WHERE run_id=%s", run_id), q("SELECT count(*) FROM replay.evento_version WHERE run_id=%s", run_id),
                q("SELECT count(*) FROM replay.cuarentena WHERE run_id=%s", run_id))


def test_una_ejecucion_completa_da_35_filas_37_versiones_y_1_en_cuarentena(tmp_path):
    with base_temporal_replay("obs_f6_integracion") as info:
        with psycopg.connect(info, autocommit=True) as c:
            registrar_ejecucion(c)
        resultados, confirmados = procesar(info, tmp_path, [registros()])
        assert contar(info) == (35, 37, 1)
        assert len(confirmados) == 39  # un offset confirmado por mensaje, después de escribir
        assert resultados.count("duplicada") == 1 and resultados.count("antigua") == 1 and resultados.count("cuarentena") == 1
        assert resultados.count("guardada") == 36  # 30 reales + 6 casos que crean o actualizan el estado actual (revisión incluida)


def test_cada_caso_se_comporta_como_exige_el_enunciado(tmp_path):
    with base_temporal_replay("obs_f6_integracion") as info:
        with psycopg.connect(info, autocommit=True) as c:
            registrar_ejecucion(c)
            procesar(info, tmp_path, [registros()])
            fila = lambda id_: c.execute("SELECT mag, caso, geo_resultado, country_id, updated_at FROM replay.evento_actual WHERE run_id=%s AND event_id=%s", (RUN, id_)).fetchone()  # noqa: E731
            versiones = lambda id_: c.execute("SELECT count(*) FROM replay.evento_version WHERE run_id=%s AND event_id=%s", (RUN, id_)).fetchone()[0]  # noqa: E731
            # duplicado: una fila y una versión
            assert versiones("replay-ctl-duplicado") == 1 and fila("replay-ctl-duplicado")[1] == "duplicado"
            # revisión: dos versiones y el estado actual es la posterior (mag + 0,1)
            v1 = c.execute("SELECT mag FROM replay.evento_version WHERE run_id=%s AND event_id='replay-ctl-revision' ORDER BY updated_at", (RUN,)).fetchall()
            assert versiones("replay-ctl-revision") == 2 and float(fila("replay-ctl-revision")[0]) == float(v1[1][0]) and float(v1[1][0]) == round(float(v1[0][0]) + 0.1, 1)
            # antigua: dos versiones pero el estado actual NO es la vieja
            hist = c.execute("SELECT mag FROM replay.evento_version WHERE run_id=%s AND event_id='replay-ctl-antigua' ORDER BY updated_at", (RUN,)).fetchall()
            assert versiones("replay-ctl-antigua") == 2 and float(fila("replay-ctl-antigua")[0]) == float(hist[1][0]) and float(hist[0][0]) < float(hist[1][0])
            # magnitud nula: se conserva como NULL (nunca 0)
            assert fila("replay-ctl-magnitud_nula")[0] is None
            # coordenadas inválidas: ni fila ni versión, y un registro en cuarentena con su motivo
            assert fila("replay-ctl-coordenadas_invalidas") is None and versiones("replay-ctl-coordenadas_invalidas") == 0
            motivo = c.execute("SELECT categoria, motivo, event_id FROM replay.cuarentena WHERE run_id=%s", (RUN,)).fetchone()
            assert motivo == ("invalido", "coordenadas fuera de rango", "replay-ctl-coordenadas_invalidas")
            # marítimo: sin país y presente en el estado actual
            assert fila("replay-ctl-maritimo")[2:4] == ("sin_pais", None)
            # los reales conservan país (ZA1/ZB1 del catálogo de juguete) y no llevan caso
            assert c.execute("SELECT count(*) FROM replay.evento_actual WHERE run_id=%s AND caso IS NULL AND country_id IN ('ZA1','ZB1')", (RUN,)).fetchone()[0] == 30


def test_repetir_la_misma_ejecucion_no_cambia_nada(tmp_path):
    with base_temporal_replay("obs_f6_integracion") as info:
        with psycopg.connect(info, autocommit=True) as c:
            registrar_ejecucion(c)
        procesar(info, tmp_path, [registros()])
        antes = contar(info)
        resultados, _ = procesar(info, tmp_path, [registros(desde=1000)])  # mismo run, otros offsets
        assert contar(info) == antes == (35, 37, 1)
        assert set(resultados) <= {"duplicada", "cuarentena"}  # todo lo ya guardado es duplicado; la cuarentena también se reenvía sin crecer


def test_un_run_nuevo_crea_un_conjunto_aparte_sin_tocar_el_anterior(tmp_path):
    with base_temporal_replay("obs_f6_integracion") as info:
        with psycopg.connect(info, autocommit=True) as c:
            registrar_ejecucion(c)
            registrar_ejecucion(c, "r-20261108T110000Z")
        procesar(info, tmp_path, [registros()])
        primero = contar(info)
        procesar(info, tmp_path, [registros(run_id="r-20261108T110000Z", desde=1000)])
        assert contar(info) == primero and contar(info, "r-20261108T110000Z") == (35, 37, 1)  # incluida su propia fila de cuarentena
        with psycopg.connect(info, autocommit=True) as c:
            assert c.execute("SELECT count(*) FROM replay.cuarentena").fetchone()[0] == 2


def test_interrumpir_y_reanudar_no_duplica_ni_pierde(tmp_path):
    with base_temporal_replay("obs_f6_integracion") as info:
        with psycopg.connect(info, autocommit=True) as c:
            registrar_ejecucion(c)
        procesar(info, tmp_path, [registros(n=20)])  # se interrumpe tras 20 mensajes
        parcial = contar(info)
        assert parcial[0] < 35
        procesar(info, tmp_path, [registros(desde=500)])  # reanudar = volver a publicar la selección completa
        assert contar(info) == (35, 37, 1)


def test_las_restricciones_de_la_base_impiden_mezclar_replay_y_live():
    with base_temporal_replay("obs_f6_integracion") as info:
        with psycopg.connect(info, autocommit=True) as c:
            registrar_ejecucion(c)
            columnas = ("INSERT INTO replay.evento_actual (run_id, event_id, event_time, updated_at, longitude, latitude, source, mode, ingested_at, kafka_topic, "
                        "kafka_partition, kafka_offset, raw) VALUES ")
            comunes = "now(), now(), 0, 0, %s, %s, now(), 't', 0, 0, '{}'"
            for source, modo in (("replay-historico", "live"), ("usgs-all-day", "replay"), ("usgs-all-day", "live"), ("replay-historico", "synthetic")):
                with pytest.raises(psycopg.errors.CheckViolation):
                    c.execute(columnas + f"(%s, 'x', {comunes})", (RUN, source, modo))
            with pytest.raises(psycopg.errors.CheckViolation):  # un caso inventado no se admite
                c.execute("INSERT INTO replay.evento_version (run_id, event_id, event_time, updated_at, longitude, latitude, source, mode, ingested_at, kafka_topic, "
                          "kafka_partition, kafka_offset, raw, caso) VALUES (%s, 'x', now(), now(), 0, 0, 'replay-historico', 'replay', now(), 't', 0, 0, '{}', 'inventado')", (RUN,))
            # y live sigue rechazando replay (CHECK de F3)
            with pytest.raises(psycopg.errors.CheckViolation):
                c.execute("INSERT INTO live.evento_actual(event_id,event_time,updated_at,longitude,latitude,source,mode,ingested_at,kafka_topic,kafka_partition,kafka_offset,raw) "
                          "VALUES ('x',now(),now(),0,0,'replay-historico','replay',now(),'t',0,0,'{}')")


def test_el_replay_no_toca_live_ni_historico_y_el_consumidor_live_lo_descarta(tmp_path):
    with base_temporal_replay("obs_f6_integracion") as info:
        with psycopg.connect(info, autocommit=True) as c:
            insertar_historico(c, seleccion_ficticia(30))
            registrar_ejecucion(c)
            tablas = [("live.evento_actual", "event_id"), ("live.evento_version", "event_id, updated_at"), ("live.cuarentena", "id"),
                      ("historico.evento", "event_id"), ("geo.pais", "country_id")]
            antes = {t: huella_tabla(c, t, o) for t, o in tablas}
            procesar(info, tmp_path, [registros()])
            assert {t: huella_tabla(c, t, o) for t, o in tablas} == antes
            # el consumidor en vivo (destino por defecto) descarta estos mensajes sin escribir nada
            resultados, _ = procesar(info, tmp_path, [registros(desde=900)], destino=DESTINO_LIVE)
            assert set(resultados) == {"descartado"}
            assert {t: huella_tabla(c, t, o) for t, o in tablas} == antes
            assert contar(info) == (35, 37, 1)


def test_el_consumidor_de_replay_descarta_un_mensaje_en_vivo(tmp_path):
    from fixtures.mensajes import construir_evento, construir_mensaje, serializar

    with base_temporal_replay("obs_f6_integracion") as info:
        clave, valor = serializar(construir_mensaje(construir_evento(1, ahora=AHORA), ahora=AHORA))
        resultados, _ = procesar(info, tmp_path, [[SimpleNamespace(topic="terremotos.live", partition=0, offset=0, key=clave, value=valor)]])
        assert resultados == ["descartado"]
        with psycopg.connect(info, autocommit=True) as c:
            assert c.execute("SELECT count(*) FROM replay.evento_actual").fetchone()[0] == 0
            assert c.execute("SELECT count(*) FROM live.evento_actual").fetchone()[0] == 0


def test_el_catalogo_real_asigna_sin_pais_al_punto_maritimo_del_replay():
    ruta = pathlib.Path(os.environ.get("CATALOGO_PATH", "/datos/paises.geojson"))
    if not ruta.is_file():
        pytest.skip("sin catálogo real")
    assert Asignador(leer_catalogo(ruta)).asignar(*casos.PUNTO_MARITIMO).resultado == "sin_pais"
