import json

import pytest

from observatorio.consumer.mensaje import MensajeInvalido, interpretar_mensaje
from fixtures.mensajes import construir_evento, construir_mensaje

AHORA = 1_793_113_140_000


def valor(mutar=None) -> bytes:
    msg = construir_mensaje(construir_evento(ahora=AHORA), ahora=AHORA)
    if mutar:
        mutar(msg)
    return json.dumps(msg, ensure_ascii=False).encode("utf-8")


def test_mensaje_valido():
    e = interpretar_mensaje(valor())
    assert e.event_id == "prueba-001"
    assert (e.longitude, e.latitude, e.depth_km) == (-3.7, 40.4, 12.0)
    assert e.event_time_ms == e.updated_ms == AHORA - 600_000
    assert e.ingested_at_ms == AHORA and e.mode == "live"
    assert e.raw["id"] == "prueba-001"


def test_nulos_se_conservan_como_none():
    def quitar(msg):
        msg["event"]["properties"]["mag"] = None
        msg["event"]["geometry"]["coordinates"] = [-3.7, 40.4, None]

    e = interpretar_mensaje(valor(quitar))
    assert e.mag is None and e.depth_km is None


@pytest.mark.parametrize("mutar, motivo", [
    (lambda m: m.update(mode="synthetic"), "no contractual"),
    (lambda m: m.update(mode="otro"), "no contractual"),
    (lambda m: m.update(mode="replay"), "solo procesa live"),
    (lambda m: m["event"].update(id=""), "id de evento"),
    (lambda m: m["event"]["geometry"].update(coordinates=[-3.7, 95, 1]), "rango"),
    (lambda m: m["event"]["properties"].update(time="ayer"), "time"),
    (lambda m: m.pop("event"), "event"),
])
def test_mensaje_invalido_con_motivo(mutar, motivo):
    with pytest.raises(MensajeInvalido, match=motivo):
        interpretar_mensaje(valor(mutar))


@pytest.mark.parametrize("basura", [b"no es json", b"\xff\xfe", b"[1, 2]"])
def test_json_invalido(basura):
    with pytest.raises(MensajeInvalido):
        interpretar_mensaje(basura)


def test_un_id_de_usgs_sin_prefijo_es_valido():
    def usgs(msg):
        msg["event"]["id"] = "us7000abcd"

    assert interpretar_mensaje(valor(usgs)).event_id == "us7000abcd"
