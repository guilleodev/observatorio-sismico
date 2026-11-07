"""El consumidor admite `usgs-fdsn-recuperacion` además de `usgs-all-day` (F4, 4.5, T046/T047) sin cambiar el resto de reglas."""

import json

import pytest

from fixtures.mensajes import construir_evento, construir_mensaje
from observatorio.config import SOURCE_ADMITIDO, SOURCE_RECUPERACION, SOURCES_ADMITIDOS
from observatorio.consumer.mensaje import clasificar_mensaje


def clasificar(source, **cambios):
    msg = construir_mensaje(construir_evento(1))
    msg["source"] = source
    msg.update(cambios)
    return clasificar_mensaje(json.dumps(msg).encode())


def test_los_dos_source_autorizados_son_exactamente_estos():
    assert SOURCES_ADMITIDOS == ("usgs-all-day", "usgs-fdsn-recuperacion") and SOURCE_ADMITIDO == "usgs-all-day"


@pytest.mark.parametrize("source", SOURCES_ADMITIDOS)
def test_un_evento_valido_con_cualquiera_de_los_source_autorizados_es_valido_y_conserva_su_source(source):
    c = clasificar(source)
    assert c.estado == "valido" and c.evento.source == source


@pytest.mark.parametrize("source", ["usgs-fdsn", "USGS-ALL-DAY", "", None, "synthetic", "usgs-fdsn-recuperacion "])
def test_cualquier_otro_source_se_descarta(source):
    c = clasificar(source)
    assert c.estado == "descartado" and "source no admitido" in c.motivo and "usgs-fdsn-recuperacion" in c.motivo


def test_las_demas_reglas_no_cambian_con_el_source_de_recuperacion():
    assert clasificar(SOURCE_RECUPERACION, mode="replay").estado == "descartado"
    assert clasificar(SOURCE_RECUPERACION, mode="otro").estado == "descartado"
    msg = construir_mensaje(construir_evento(1))
    msg["source"] = SOURCE_RECUPERACION
    msg["event"]["properties"]["type"] = "quarry blast"
    assert clasificar_mensaje(json.dumps(msg).encode()).estado == "excluido"
    msg["event"]["properties"]["type"] = "earthquake"
    msg["event"]["geometry"]["coordinates"] = [500, 0, 1]
    assert clasificar_mensaje(json.dumps(msg).encode()).estado == "invalido"
