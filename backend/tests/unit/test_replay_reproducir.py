"""F6, T011: el productor de replay (velocidad, publicación en orden, registro de la ejecución). Sin Kafka real: productor y reloj simulados; la ejecución se registra en una base TEMPORAL."""

import asyncio
import json
import re
from datetime import datetime, timezone

import psycopg
import pytest

from fixtures.base_replay import base_temporal_replay, hay_entorno
from fixtures.replay_datos import seleccion_ficticia
from observatorio.consumer.destino import DESTINO_REPLAY
from observatorio.consumer.mensaje import EventoRecibido
from observatorio.consumer.repositorio import RepositorioEventos
from observatorio.replay import casos
from observatorio.replay import reproducir as r


class ProductorSimulado:
    def __init__(self):
        self.enviados = []

    async def send_and_wait(self, topic, value=None, key=None):
        self.enviados.append((topic, key, json.loads(value)))


def publicar(secuencia, intervalo_s=2.0, velocidad=1200.0):
    productor, pausas, reloj = ProductorSimulado(), [], iter(range(1_000, 10**6, 7))

    async def dormir(s):
        pausas.append(s)

    n = asyncio.run(r.publicar(productor, "terremotos.replay", secuencia, "r-1", velocidad, intervalo_s, ahora=lambda: next(reloj), dormir=dormir))
    return n, productor.enviados, pausas


def test_publica_todo_en_orden_con_la_clave_el_topic_y_el_instante_de_reproduccion():
    secuencia = casos.construir_secuencia(seleccion_ficticia(30))
    n, enviados, _ = publicar(secuencia)
    assert n == 39 and len(enviados) == 39
    assert all(topic == "terremotos.replay" for topic, _, _ in enviados)
    assert [msg["replay"]["seq"] for _, _, msg in enviados] == list(range(39))
    assert [clave for _, clave, _ in enviados] == [m.evento["id"].encode() for m in secuencia]
    reproduccion = [msg["ingested_at"] for _, _, msg in enviados]
    assert reproduccion == sorted(set(reproduccion))  # el instante de reproducción crece y no se repite
    for (_, _, msg), m in zip(enviados, secuencia):
        assert msg["event"] == m.evento and msg["mode"] == "replay" and msg["source"] == "replay-historico"  # el tiempo del evento va intacto
        assert msg["replay"] == {"run_id": "r-1", "seq": m.seq, "caso": m.caso, "velocidad": 1200.0}


def test_espera_el_intervalo_entre_mensajes_y_no_despues_del_ultimo():
    _, _, pausas = publicar(casos.construir_secuencia(seleccion_ficticia(30)), intervalo_s=2.5)
    assert pausas == [2.5] * 38


def test_una_secuencia_vacia_no_publica_nada():
    assert publicar([])[0:3:2] == (0, [])


def test_la_velocidad_es_el_tiempo_cubierto_entre_la_duracion_de_la_reproduccion():
    features = seleccion_ficticia(30)  # un evento por minuto: cubren 29 minutos = 1740 s
    assert r.velocidad_prevista(features, 39, 2.0) == round(1740 / (38 * 2.0), 3)
    assert r.velocidad_prevista(features, 39, 4.0) == round(1740 / (38 * 4.0), 3)  # el doble de lento, la mitad de aceleración
    assert r.velocidad_prevista(features[:1], 1, 2.0) is None  # un solo evento: no hay tiempo que acelerar
    iguales = seleccion_ficticia(3)
    for f in iguales:
        f["properties"]["time"] = 1_735_689_600_000
    assert r.velocidad_prevista(iguales, 3, 2.0) is None  # todos al mismo instante


def test_el_identificador_de_ejecucion_por_defecto_es_la_hora_utc_y_cumple_el_formato():
    run = r.nuevo_run_id(datetime(2026, 11, 8, 10, 30, 5, tzinfo=timezone.utc))
    assert run == "r-20261108T103005Z" and r.RUN_ID.fullmatch(run)
    assert re.fullmatch(r"r-\d{8}T\d{6}Z", r.nuevo_run_id())


@pytest.mark.skipif(not hay_entorno(), reason="sin PostgreSQL o sin sql/004_esquema_f6.sql")
def test_registrar_la_ejecucion_es_idempotente_y_no_admite_otra_seleccion_con_el_mismo_run():
    features = seleccion_ficticia(30)
    secuencia = casos.construir_secuencia(features)
    from datetime import date

    with base_temporal_replay("obs_f6_reproducir") as info:
        with psycopg.connect(info, autocommit=True) as c:
            r.registrar_ejecucion(c, "r-1", date(2025, 1, 1), features, secuencia, 2.0, 22.895)
            fila = c.execute("SELECT dia, tamano, mensajes, estado, intervalo_s, velocidad, intervalo_desde, intervalo_hasta, terminada_at FROM replay.ejecucion").fetchone()
            assert fila[0] == date(2025, 1, 1) and fila[1:4] == (30, 39, "en_curso") and float(fila[4]) == 2.0 and float(fila[5]) == 22.895 and fila[8] is None
            assert (fila[7] - fila[6]).total_seconds() == 29 * 60  # tiempo ORIGINAL cubierto
            r.marcar_estado(c, "r-1", "terminada")
            assert c.execute("SELECT estado, terminada_at IS NOT NULL FROM replay.ejecucion").fetchone() == ("terminada", True)
            r.registrar_ejecucion(c, "r-1", date(2025, 1, 1), features, secuencia, 2.0, 22.895)  # repetir la misma: la reabre
            assert c.execute("SELECT estado, terminada_at FROM replay.ejecucion").fetchone() == ("en_curso", None)
            assert c.execute("SELECT count(*) FROM replay.ejecucion").fetchone()[0] == 1
            with pytest.raises(SystemExit, match="otra selección"):
                r.registrar_ejecucion(c, "r-1", date(2025, 1, 1), features[:20], casos.construir_secuencia(features[:20]), 2.0, 22.895)
            with pytest.raises(SystemExit, match="otra selección"):
                r.registrar_ejecucion(c, "r-1", date(2025, 1, 2), features, secuencia, 2.0, 22.895)
            r.marcar_estado(c, "r-1", "interrumpida")
            assert c.execute("SELECT estado, terminada_at FROM replay.ejecucion").fetchone() == ("interrumpida", None)


def evento_replay(run_id="r-1", modo="replay"):
    return EventoRecibido(event_id="x", event_time_ms=1, updated_ms=1, mag=None, mag_type=None, depth_km=None, longitude=0, latitude=0, place=None,
                          source="replay-historico", mode=modo, ingested_at_ms=1, raw={}, run_id=run_id)


def test_el_repositorio_de_replay_rechaza_un_evento_sin_run_o_de_otro_modo_antes_de_tocar_la_base():
    repo = RepositorioEventos(None, None, DESTINO_REPLAY)  # sin conexión: debe fallar antes de usarla
    for evento in (evento_replay(run_id=None), evento_replay(run_id=""), evento_replay(modo="live")):
        with pytest.raises(ValueError, match="run_id"):
            asyncio.run(repo.guardar_version(evento, "t", 0, 0))
    with pytest.raises(ValueError, match="run_id"):
        asyncio.run(repo.retirar_evento("x", 1, None))


class ConexionFalsa:
    """Conexión que no debe usarse: si el código llega a la base sin run_id, la prueba falla."""

    def transaction(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *excepcion):
        return False

    async def execute(self, *args, **kwargs):
        raise AssertionError("no debe llegar a la base sin run_id")


def test_la_cuarentena_de_replay_exige_run_id_antes_de_escribir():
    from observatorio.consumer.mensaje import Clasificacion
    from observatorio.consumer.repositorio import ReferenciaMensaje

    repo = RepositorioEventos(ConexionFalsa(), None, DESTINO_REPLAY)
    ref = ReferenciaMensaje("terremotos.replay", 0, 0, b"k", b"{}")
    for run_id in (None, ""):
        with pytest.raises(ValueError, match="run_id"):
            asyncio.run(repo.poner_en_cuarentena(Clasificacion("invalido", motivo="x", base_huella=b"x", run_id=run_id), ref))
