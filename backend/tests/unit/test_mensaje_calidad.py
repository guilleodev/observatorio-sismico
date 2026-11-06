"""Clasificación de mensajes (paso 3.5, sin base de datos): válido, excluido, inválido o descartado."""

import json

import pytest

from fixtures.mensajes import construir_evento, construir_mensaje
from observatorio.consumer.mensaje import clasificar_mensaje

AHORA = 1_793_113_140_000


def mensaje(mutar=None, modo="live", source=None) -> bytes:
    msg = construir_mensaje(construir_evento(ahora=AHORA), ahora=AHORA, modo=modo)
    if source is not None:
        msg["source"] = source
    if mutar:
        mutar(msg)
    return json.dumps(msg, ensure_ascii=False).encode("utf-8")  # NaN e Infinity se escriben como literales


def evento(mutar):
    """Aplica `mutar` al Feature (el evento original) del mensaje."""
    return lambda msg: mutar(msg["event"])


def props(**cambios):
    return evento(lambda ev: ev["properties"].update(cambios))


def coords(valor):
    return evento(lambda ev: ev["geometry"].update(coordinates=valor))


# --- válidos -----------------------------------------------------------------------------------------------------

def test_terremoto_integro_es_valido():
    c = clasificar_mensaje(mensaje())
    assert c.estado == "valido" and c.motivo is None
    assert c.evento.event_id == "prueba-001" and c.event_id == "prueba-001" and c.updated_ms == c.evento.updated_ms


@pytest.mark.parametrize("mutar, comprobar", [
    (props(mag=None), lambda e: e.mag is None),  # nulo: se conserva como nulo, nunca 0
    (props(mag=0), lambda e: e.mag == 0.0),  # valor poco habitual pero válido (FAQ 16)
    (props(mag=-1.2), lambda e: e.mag == -1.2),  # magnitud negativa: no es un error
    (coords([-3.7, 40.4, -2.6]), lambda e: e.depth_km == -2.6),  # profundidad negativa: anomalía, no error
    (coords([-3.7, 40.4, None]), lambda e: e.depth_km is None),
    (props(place=None), lambda e: e.place is None),
])
def test_valores_poco_habituales_pero_validos_se_conservan(mutar, comprobar):
    c = clasificar_mensaje(mensaje(mutar))
    assert c.estado == "valido" and comprobar(c.evento)


def test_un_id_de_usgs_es_valido():
    assert clasificar_mensaje(mensaje(evento(lambda ev: ev.update(id="ci41572064")))).estado == "valido"


# --- excluidos (no son terremotos) ---------------------------------------------------------------------------------

@pytest.mark.parametrize("tipo", ["explosion", "quarry blast", "ice quake", "other event"])
def test_los_eventos_no_sismicos_se_excluyen_con_el_motivo(tipo):
    c = clasificar_mensaje(mensaje(props(type=tipo)))
    assert c.estado == "excluido" and tipo in c.motivo
    assert c.evento is None and c.event_id == "prueba-001" and c.updated_ms is not None  # referencias para retirarlo


def test_un_no_sismico_con_otros_campos_malos_se_excluye_por_su_tipo():
    c = clasificar_mensaje(mensaje(lambda m: (m["event"]["properties"].update(type="explosion"), m["event"]["geometry"].update(coordinates=[0, 999, 1]))))
    assert c.estado == "excluido"


def test_un_no_sismico_sin_updated_valido_se_excluye_sin_updated():
    c = clasificar_mensaje(mensaje(props(type="explosion", updated="ayer")))
    assert c.estado == "excluido" and c.updated_ms is None


# --- inválidos ------------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("mutar, motivo", [
    (coords([-3.7, 145, 10]), "fuera de rango"),  # latitud 145° (FAQ)
    (coords([190, 40, 10]), "fuera de rango"),
    (coords([float("nan"), 40, 10]), "no finit"),
    (coords([-3.7, float("inf"), 10]), "no finit"),
    (coords([-3.7, 40.4, float("-inf")]), "no finit"),
    (coords([-3.7, 40.4]), "tres valores"),
    (coords([-3.7, 40.4, 10, 5]), "tres valores"),
    (coords(["a", 40, 10]), "numéric"),
    (coords("no es una lista"), "tres valores"),
    (evento(lambda ev: ev["geometry"].update(type="LineString")), "Point"),
    (evento(lambda ev: ev.pop("geometry")), "Point"),
    (props(time="ayer"), "time"),
    (props(time=None), "time"),
    (props(updated=None), "updated"),
    (props(updated=1.5), "updated"),
    (props(mag=float("nan")), "mag"),
    (props(mag="3.2"), "mag"),
    (evento(lambda ev: ev["properties"].pop("type")), "tipo"),
    (evento(lambda ev: ev.pop("id")), "id"),
    (evento(lambda ev: ev.update(id="")), "id"),
    (evento(lambda ev: ev.update(id=123)), "id"),
])
def test_registros_no_tratables_son_invalidos_con_motivo(mutar, motivo):
    c = clasificar_mensaje(mensaje(mutar))
    assert c.estado == "invalido" and motivo in c.motivo
    assert c.evento is None


@pytest.mark.parametrize("basura", [b"no es json", b"\xff\xfe", b"", b"[1, 2]", b'"texto"', b"null"])
def test_mensajes_ilegibles_son_invalidos(basura):
    c = clasificar_mensaje(basura)
    assert c.estado == "invalido" and c.motivo and c.event_id is None


def test_event_ausente_o_no_es_objeto_es_invalido():
    assert clasificar_mensaje(mensaje(lambda m: m.pop("event"))).estado == "invalido"
    assert clasificar_mensaje(mensaje(lambda m: m.update(event=[1]))).estado == "invalido"


def test_un_invalido_conserva_las_referencias_legibles():
    c = clasificar_mensaje(mensaje(coords([0, 145, 1])))
    assert c.event_id == "prueba-001" and c.updated_ms is not None


# --- descartados (fuera del contrato de este consumidor; no son datos de USGS live) ---------------------------------

@pytest.mark.parametrize("modo", ["synthetic", "replay", "otro", ""])
def test_los_modos_no_live_se_descartan(modo):
    c = clasificar_mensaje(mensaje(modo=modo))
    assert c.estado == "descartado" and "mode" in c.motivo


@pytest.mark.parametrize("source", ["otra-fuente", "prueba-manual", ""])
def test_una_fuente_no_admitida_se_descarta(source):
    c = clasificar_mensaje(mensaje(source=source))
    assert c.estado == "descartado" and "source" in c.motivo


def test_sin_source_se_descarta():
    assert clasificar_mensaje(mensaje(lambda m: m.pop("source"))).estado == "descartado"


# --- identidad de la versión para la huella de cuarentena ------------------------------------------------------------

def test_la_huella_no_depende_de_ingested_at_ni_del_orden_de_las_claves():
    a = clasificar_mensaje(mensaje(coords([0, 145, 1])))
    msg = json.loads(mensaje(coords([0, 145, 1])))
    msg["ingested_at"] += 5000
    b = clasificar_mensaje(json.dumps(dict(reversed(list(msg.items())))).encode())
    assert a.base_huella == b.base_huella


def test_una_version_distinta_tiene_otra_base_de_huella():
    a = clasificar_mensaje(mensaje(props(type="explosion", updated=1000)))
    b = clasificar_mensaje(mensaje(props(type="explosion", updated=2000)))
    assert a.base_huella != b.base_huella
