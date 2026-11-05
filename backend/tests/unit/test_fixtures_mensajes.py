import json

import pytest

from fixtures.mensajes import construir_evento, construir_mensaje, serializar

AHORA = 1_793_113_140_000


def test_evento_de_prueba_tiene_la_forma_del_feed():
    ev = construir_evento(ahora=AHORA)
    assert ev["type"] == "Feature" and ev["id"] == "prueba-001"
    lon, lat, prof = ev["geometry"]["coordinates"]  # orden: longitud, latitud, profundidad
    assert -180 <= lon <= 180 and -90 <= lat <= 90 and prof >= 0
    assert ev["properties"]["time"] == ev["properties"]["updated"] == AHORA - 600_000


def test_secuencia_y_minutos_atras():
    ev = construir_evento(secuencia=2, minutos_atras=1500, ahora=AHORA)
    assert ev["id"] == "prueba-002" and ev["properties"]["time"] == AHORA - 1500 * 60_000


@pytest.mark.parametrize("kwargs", [{"secuencia": 0}, {"minutos_atras": -1}])
def test_argumentos_invalidos(kwargs):
    with pytest.raises(ValueError):
        construir_evento(**kwargs)


def test_mensaje_por_defecto_es_live_y_serializa_con_clave_y_utf8():
    msg = construir_mensaje(construir_evento(ahora=AHORA), ahora=AHORA)
    assert set(msg) == {"source", "ingested_at", "mode", "event"} and msg["mode"] == "live"
    clave, valor = serializar(msg)
    assert clave == b"prueba-001" and json.loads(valor.decode("utf-8")) == msg
