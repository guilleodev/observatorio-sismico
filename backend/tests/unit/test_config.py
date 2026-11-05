import pytest

from observatorio.config import ConfigError, ConfigKafka, ConfigPostgres


def test_config_kafka_desde_entorno(monkeypatch):
    monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    monkeypatch.setenv("KAFKA_TOPIC", "terremotos.live")
    assert ConfigKafka.desde_entorno() == ConfigKafka("kafka:9092", "terremotos.live")


def test_config_kafka_falta_variable(monkeypatch):
    monkeypatch.delenv("KAFKA_TOPIC", raising=False)
    monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    with pytest.raises(ConfigError, match="KAFKA_TOPIC"):
        ConfigKafka.desde_entorno()


def test_config_postgres_falta_variable(monkeypatch):
    for nombre in ("POSTGRES_HOST", "POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD"):
        monkeypatch.setenv(nombre, "x")
    monkeypatch.delenv("POSTGRES_PASSWORD")
    with pytest.raises(ConfigError, match="POSTGRES_PASSWORD"):
        ConfigPostgres.desde_entorno()


def test_config_ingesta_por_defecto(monkeypatch):
    from observatorio.config import ConfigIngesta, SOURCE_ADMITIDO, URL_USGS

    for nombre in ("USGS_URL", "USGS_INTERVAL_S", "USGS_TIMEOUT_S", "USGS_MAX_REINTENTOS",
                   "RETENCION_RESPUESTAS_DIAS", "RETENCION_CONSULTAS_DIAS", "INGESTA_PUBLICAR"):
        monkeypatch.delenv(nombre, raising=False)
    cfg = ConfigIngesta.desde_entorno()
    assert cfg == ConfigIngesta(URL_USGS, 60, 20, 3, 3, 30, False)  # por defecto: modo seco
    assert SOURCE_ADMITIDO == "usgs-all-day"


def test_config_ingesta_valores_validos(monkeypatch):
    from observatorio.config import ConfigIngesta

    monkeypatch.setenv("USGS_URL", "http://localhost:9/feed")
    monkeypatch.setenv("USGS_INTERVAL_S", "30")
    monkeypatch.setenv("USGS_MAX_REINTENTOS", "0")
    monkeypatch.setenv("INGESTA_PUBLICAR", "TRUE")
    cfg = ConfigIngesta.desde_entorno()
    assert (cfg.usgs_url, cfg.intervalo_s, cfg.max_reintentos, cfg.publicar) == ("http://localhost:9/feed", 30, 0, True)


@pytest.mark.parametrize("nombre, valor", [
    ("USGS_INTERVAL_S", "abc"), ("USGS_INTERVAL_S", "0"), ("USGS_TIMEOUT_S", "-5"),
    ("INGESTA_PUBLICAR", "quizá"), ("USGS_URL", "ftp://x"), ("USGS_MAX_REINTENTOS", "-1"),
])
def test_config_ingesta_valores_invalidos(monkeypatch, nombre, valor):
    from observatorio.config import ConfigIngesta

    monkeypatch.setenv(nombre, valor)
    with pytest.raises(ConfigError, match=nombre):
        ConfigIngesta.desde_entorno()
