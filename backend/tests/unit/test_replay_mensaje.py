"""F6, T005: qué mensajes admite cada destino. El flujo en vivo y el replay no se aceptan mutuamente (constitución III)."""

import json

import pytest

from fixtures.mensajes import construir_evento
from observatorio.consumer.destino import DESTINO_LIVE, DESTINO_REPLAY
from observatorio.consumer.mensaje import clasificar_mensaje

T_EVENTO = 1_742_000_000_000
T_REPRODUCCION = 1_794_300_000_000


def mensaje_replay(*, run_id="r-20261108T100000Z", caso=None, seq=0, velocidad=1200.0, mutar=None, source="replay-historico", modo="replay"):
    ev = construir_evento(1, ahora=T_EVENTO + 600_000)
    ev["id"] = "us-hist-001"
    ev["properties"].update(time=T_EVENTO, updated=T_EVENTO + 3_600_000)
    msg = {"source": source, "mode": modo, "ingested_at": T_REPRODUCCION, "event": ev, "replay": {"run_id": run_id, "seq": seq, "caso": caso, "velocidad": velocidad}}
    if mutar:
        mutar(msg)
    return msg


def bytes_(msg):
    return json.dumps(msg, ensure_ascii=False).encode("utf-8")


def clasificar(msg, destino=DESTINO_REPLAY):
    return clasificar_mensaje(bytes_(msg), destino)


def test_el_destino_replay_acepta_un_mensaje_de_replay_valido():
    c = clasificar(mensaje_replay(caso=None))
    assert c.estado == "valido" and c.run_id == "r-20261108T100000Z"
    e = c.evento
    assert e.mode == "replay" and e.source == "replay-historico" and e.run_id == "r-20261108T100000Z" and e.caso is None
    # el tiempo del evento y el de la reproducción son distintos y se conservan los dos
    assert e.event_time_ms == T_EVENTO and e.updated_ms == T_EVENTO + 3_600_000 and e.ingested_at_ms == T_REPRODUCCION


@pytest.mark.parametrize("caso", ["duplicado", "revision", "antigua", "magnitud_nula", "coordenadas_invalidas", "maritimo"])
def test_el_destino_replay_conserva_el_caso_controlado(caso):
    c = clasificar(mensaje_replay(caso=caso))
    assert c.estado == "valido" and c.evento.caso == caso


def test_el_destino_live_descarta_un_mensaje_de_replay_con_el_motivo_de_siempre():
    c = clasificar(mensaje_replay(), DESTINO_LIVE)
    assert c.estado == "descartado" and "mode replay" in c.motivo
    assert clasificar_mensaje(bytes_(mensaje_replay())).estado == "descartado"  # y sin indicar destino (valor por defecto = live)


def test_el_destino_replay_descarta_un_mensaje_live():
    msg = mensaje_replay(source="usgs-all-day", modo="live")
    msg.pop("replay")
    c = clasificar(msg)
    assert c.estado == "descartado" and "live" in c.motivo


@pytest.mark.parametrize("source", ["usgs-all-day", "usgs-fdsn-recuperacion", "otra", None])
def test_el_destino_replay_solo_admite_su_fuente(source):
    c = clasificar(mensaje_replay(source=source))
    assert c.estado == "descartado" and "source" in c.motivo


def test_el_destino_live_sigue_aceptando_sus_fuentes_y_no_lleva_run():
    msg = mensaje_replay(source="usgs-all-day", modo="live")
    c = clasificar(msg, DESTINO_LIVE)  # el bloque «replay» de un mensaje live se ignora
    assert c.estado == "valido" and c.evento.run_id is None and c.evento.caso is None and c.run_id is None


def test_un_modo_no_contractual_se_descarta_en_los_dos_destinos():
    for destino in (DESTINO_LIVE, DESTINO_REPLAY):
        assert clasificar(mensaje_replay(modo="synthetic"), destino).estado == "descartado"


@pytest.mark.parametrize("malo", ["a b", "", "x" * 65, "../etc", "r;DROP", 7, None])
def test_sin_un_run_id_legible_se_descarta_porque_no_hay_ejecucion_a_la_que_atribuirlo(malo):
    c = clasificar(mensaje_replay(run_id=malo))
    assert c.estado == "descartado" and "run_id" in c.motivo


def test_sin_bloque_replay_se_descarta():
    msg = mensaje_replay()
    msg.pop("replay")
    assert clasificar(msg).estado == "descartado"
    msg["replay"] = "no es un objeto"
    assert clasificar(msg).estado == "descartado"


@pytest.mark.parametrize("campo,valor", [("caso", "inventado"), ("caso", 3), ("seq", -1), ("seq", "1"), ("seq", True), ("velocidad", 0), ("velocidad", -5), ("velocidad", "rápido"),
                                         ("velocidad", float("inf"))])
def test_un_bloque_replay_malformado_va_a_cuarentena_con_su_run_id(campo, valor):
    msg = mensaje_replay()
    msg["replay"][campo] = valor
    c = clasificar(msg)
    assert c.estado == "invalido" and campo in c.motivo and c.run_id == "r-20261108T100000Z"


def test_la_velocidad_puede_ser_nula():
    assert clasificar(mensaje_replay(velocidad=None)).estado == "valido"


def test_coordenadas_invalidas_y_no_sismicos_conservan_el_run_para_la_cuarentena():
    def fuera(msg):
        msg["event"]["geometry"]["coordinates"][1] = 123

    c = clasificar(mensaje_replay(caso="coordenadas_invalidas", mutar=fuera))
    assert c.estado == "invalido" and "coordenadas fuera de rango" in c.motivo and c.run_id == "r-20261108T100000Z"

    def explosion(msg):
        msg["event"]["properties"]["type"] = "explosion"

    c = clasificar(mensaje_replay(mutar=explosion))
    assert c.estado == "excluido" and c.run_id == "r-20261108T100000Z"


def test_la_magnitud_nula_es_valida_y_sigue_siendo_nula():
    def nula(msg):
        msg["event"]["properties"]["mag"] = None

    c = clasificar(mensaje_replay(caso="magnitud_nula", mutar=nula))
    assert c.estado == "valido" and c.evento.mag is None
