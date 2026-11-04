import json

import pytest

from observatorio.config import ConfigError, ConfigKafka
from observatorio.producer.emitir_sintetico import leer_argumentos
from observatorio.sintetico import (
    MODO_MVP,
    SOURCE,
    construir_evento,
    construir_mensaje,
    serializar,
)

AHORA = 1_793_113_140_000


def test_evento_por_defecto_cumple_el_contrato():
    ev = construir_evento(ahora=AHORA)
    assert ev["type"] == "Feature"
    assert ev["id"] == "synthetic-mvp-001"
    assert ev["geometry"]["type"] == "Point"
    lon, lat, prof = ev["geometry"]["coordinates"]  # orden: longitud, latitud, profundidad
    assert -180 <= lon <= 180 and -90 <= lat <= 90 and prof >= 0
    assert ev["properties"]["type"] == "earthquake"
    assert ev["properties"]["place"].startswith("SINTÉTICO:")
    assert ev["properties"]["time"] == ev["properties"]["updated"] == AHORA - 10 * 60_000


def test_secuencia_cambia_el_id():
    assert construir_evento(secuencia=2, ahora=AHORA)["id"] == "synthetic-mvp-002"


def test_minutos_atras_fija_la_hora_del_evento_en_ms_utc():
    ev = construir_evento(minutos_atras=1500, ahora=AHORA)
    assert ev["properties"]["time"] == AHORA - 1500 * 60_000
    assert isinstance(ev["properties"]["time"], int)


def test_es_determinista_con_la_misma_hora_de_referencia():
    assert construir_evento(ahora=AHORA) == construir_evento(ahora=AHORA)


@pytest.mark.parametrize("kwargs", [{"secuencia": 0}, {"minutos_atras": -1}])
def test_argumentos_invalidos_se_rechazan(kwargs):
    with pytest.raises(ValueError):
        construir_evento(**kwargs)


def test_mensaje_y_serializacion():
    msg = construir_mensaje(construir_evento(ahora=AHORA), ahora=AHORA)
    assert set(msg) == {"source", "ingested_at", "mode", "event"}
    assert msg["source"] == SOURCE == "synthetic-generator"
    assert msg["mode"] == MODO_MVP == "synthetic"
    assert msg["ingested_at"] == AHORA

    clave, valor = serializar(msg)
    assert clave == b"synthetic-mvp-001"
    assert json.loads(valor.decode("utf-8")) == msg
    assert "SINTÉTICO".encode("utf-8") in valor  # UTF-8 real, no escapes


def test_reenvio_identico_produce_los_mismos_bytes():
    msg = construir_mensaje(construir_evento(ahora=AHORA), ahora=AHORA)
    assert serializar(msg) == serializar(msg)


def test_argumentos_del_comando():
    a = leer_argumentos([])
    assert (a.repeat, a.secuencia, a.minutos_atras) == (1, 1, 10)
    a = leer_argumentos(["--repeat", "5", "--secuencia", "2", "--minutos-atras", "1500"])
    assert (a.repeat, a.secuencia, a.minutos_atras) == (5, 2, 1500)
    with pytest.raises(SystemExit):
        leer_argumentos(["--repeat", "0"])


def test_config_kafka_desde_entorno(monkeypatch):
    monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    monkeypatch.setenv("KAFKA_TOPIC", "terremotos.sintetico")
    assert ConfigKafka.desde_entorno() == ConfigKafka("kafka:9092", "terremotos.sintetico")


def test_config_kafka_falta_variable(monkeypatch):
    monkeypatch.delenv("KAFKA_TOPIC", raising=False)
    monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    with pytest.raises(ConfigError, match="KAFKA_TOPIC"):
        ConfigKafka.desde_entorno()
