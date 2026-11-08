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


def test_config_geo_lee_la_ruta_y_exige_que_el_archivo_exista(monkeypatch, tmp_path):
    from observatorio.config import ConfigGeo

    archivo = tmp_path / "paises.geojson"
    archivo.write_text("{}", encoding="utf-8")
    monkeypatch.setenv("CATALOGO_PATH", str(archivo))
    assert ConfigGeo.desde_entorno().catalogo_path == archivo


def test_config_geo_por_defecto_apunta_al_montaje_del_contenedor(monkeypatch):
    from pathlib import Path

    from observatorio.config import ConfigGeo, RUTA_CATALOGO_DEFECTO

    monkeypatch.delenv("CATALOGO_PATH", raising=False)
    assert RUTA_CATALOGO_DEFECTO == "/datos/paises.geojson"
    if not Path(RUTA_CATALOGO_DEFECTO).is_file():  # fuera del contenedor no existe: error claro, no un valor inventado
        with pytest.raises(ConfigError, match="CATALOGO_PATH"):
            ConfigGeo.desde_entorno()


@pytest.mark.parametrize("hacer_archivo", [False, True])
def test_config_geo_falla_si_no_hay_archivo_o_es_un_directorio(monkeypatch, tmp_path, hacer_archivo):
    from observatorio.config import ConfigGeo

    ruta = tmp_path / "no-existe.geojson"
    if hacer_archivo:  # un directorio no es un catalogo
        ruta = tmp_path
    monkeypatch.setenv("CATALOGO_PATH", str(ruta))
    with pytest.raises(ConfigError, match="CATALOGO_PATH"):
        ConfigGeo.desde_entorno()


HISTORICO_VARIABLES = ("HISTORICO_ANIO", "HISTORICO_MAG_MIN", "HISTORICO_LIMITE", "HISTORICO_URL", "HISTORICO_TIMEOUT_S",
                       "HISTORICO_MAX_REINTENTOS", "HISTORICO_EXPORT_DIR")


def test_config_historico_por_defecto_es_la_del_enunciado(monkeypatch):
    from pathlib import Path
    from observatorio.config import ConfigHistorico

    for nombre in HISTORICO_VARIABLES:
        monkeypatch.delenv(nombre, raising=False)
    c = ConfigHistorico.desde_entorno()
    assert (c.anio, c.mag_min, c.limite) == (2025, 4.0, 20000)
    assert c.url_base == "https://earthquake.usgs.gov/fdsnws/event/1/"
    assert (c.timeout_s, c.max_reintentos, c.exportacion) == (60, 3, Path("/exportacion"))


def test_config_historico_valores_validos(monkeypatch):
    from observatorio.config import ConfigHistorico

    monkeypatch.setenv("HISTORICO_ANIO", "2024")
    monkeypatch.setenv("HISTORICO_MAG_MIN", "5.5")
    monkeypatch.setenv("HISTORICO_LIMITE", "50")
    monkeypatch.setenv("HISTORICO_URL", "http://localhost:9999/fdsn")  # sin barra final: se añade
    c = ConfigHistorico.desde_entorno()
    assert (c.anio, c.mag_min, c.limite, c.url_base) == (2024, 5.5, 50, "http://localhost:9999/fdsn/")


@pytest.mark.parametrize("nombre,valor", [
    ("HISTORICO_ANIO", "abc"), ("HISTORICO_ANIO", "1800"), ("HISTORICO_ANIO", "3000"),
    ("HISTORICO_MAG_MIN", "x"), ("HISTORICO_MAG_MIN", "-1"), ("HISTORICO_MAG_MIN", "11"), ("HISTORICO_MAG_MIN", "nan"),
    ("HISTORICO_LIMITE", "1"), ("HISTORICO_LIMITE", "20001"), ("HISTORICO_LIMITE", "mucho"),
    ("HISTORICO_URL", "ftp://usgs"), ("HISTORICO_TIMEOUT_S", "0"), ("HISTORICO_MAX_REINTENTOS", "-1"),
])
def test_config_historico_valores_invalidos_dan_error_claro(monkeypatch, nombre, valor):
    from observatorio.config import ConfigHistorico

    for n in HISTORICO_VARIABLES:
        monkeypatch.delenv(n, raising=False)
    monkeypatch.setenv(nombre, valor)
    with pytest.raises(ConfigError, match=nombre):
        ConfigHistorico.desde_entorno()


# --- ConfigApi (F5, paso 5.1) ----------------------------------------------------------------------------------------

API_VARIABLES = ("API_MAX_EVENTOS", "API_MAX_VENTANA_HORAS", "INGESTA_OBSOLETA_S", "API_STATEMENT_TIMEOUT_S", "API_MARGEN_PUBLICACION_S")


def test_config_api_por_defecto_son_los_valores_aprobados(monkeypatch):
    from observatorio.config import ConfigApi

    for nombre in API_VARIABLES:
        monkeypatch.delenv(nombre, raising=False)
    assert ConfigApi.desde_entorno() == ConfigApi(max_eventos=5000, max_ventana_horas=744, obsoleta_s=300, statement_timeout_s=10, margen_publicacion_s=900)


def test_config_api_valores_validos(monkeypatch):
    from observatorio.config import ConfigApi

    for nombre, valor in zip(API_VARIABLES, ("100", "48", "600", "3", "0")):
        monkeypatch.setenv(nombre, valor)
    assert ConfigApi.desde_entorno() == ConfigApi(100, 48, 600, 3, 0)  # el margen de publicación admite 0


@pytest.mark.parametrize("nombre,valor", [("API_MAX_EVENTOS", "0"), ("API_MAX_EVENTOS", "-5"), ("API_MAX_EVENTOS", "mucho"), ("API_MAX_EVENTOS", "5.5"),
                                          ("API_MAX_VENTANA_HORAS", "0"), ("INGESTA_OBSOLETA_S", "0"), ("API_STATEMENT_TIMEOUT_S", "0"), ("API_MARGEN_PUBLICACION_S", "-1")])
def test_config_api_rechaza_valores_invalidos_con_el_nombre_de_la_variable(monkeypatch, nombre, valor):
    from observatorio.config import ConfigApi

    for n in API_VARIABLES:
        monkeypatch.delenv(n, raising=False)
    monkeypatch.setenv(nombre, valor)
    with pytest.raises(ConfigError, match=nombre):
        ConfigApi.desde_entorno()


# --- ConfigReplay (F6, paso 6.1; tarea T002) ------------------------------------------------------------------------------

REPLAY_VARIABLES = ("KAFKA_TOPIC", "KAFKA_CONSUMER_GROUP", "KAFKA_TOPIC_REPLAY", "KAFKA_CONSUMER_GROUP_REPLAY", "REPLAY_EVENTOS", "REPLAY_INTERVALO_S",
                    "REPLAY_ESPERA_FINAL_S", "REPLAY_ESPERA_MAX_S")


def _limpiar_replay(monkeypatch):
    for nombre in REPLAY_VARIABLES:
        monkeypatch.delenv(nombre, raising=False)


def test_config_replay_por_defecto_son_los_valores_del_sdd(monkeypatch):
    from observatorio.config import ConfigReplay

    _limpiar_replay(monkeypatch)
    assert ConfigReplay.desde_entorno() == ConfigReplay(topic="terremotos.replay", grupo="consumidor-replay", eventos=30, intervalo_s=2.0,
                                                        espera_final_s=10, espera_max_s=120)


def test_config_replay_valores_validos(monkeypatch):
    from observatorio.config import ConfigReplay

    _limpiar_replay(monkeypatch)
    for nombre, valor in zip(REPLAY_VARIABLES[2:], ("demo.replay", "grupo-demo", "5", "0.5", "3", "60")):
        monkeypatch.setenv(nombre, valor)
    assert ConfigReplay.desde_entorno() == ConfigReplay("demo.replay", "grupo-demo", 5, 0.5, 3, 60)


@pytest.mark.parametrize("nombre,valor", [("REPLAY_EVENTOS", "0"), ("REPLAY_EVENTOS", "-3"), ("REPLAY_EVENTOS", "muchos"), ("REPLAY_EVENTOS", "2.5"), ("REPLAY_EVENTOS", "1001"),
                                          ("REPLAY_INTERVALO_S", "0"), ("REPLAY_INTERVALO_S", "-1"), ("REPLAY_INTERVALO_S", "rapido"), ("REPLAY_INTERVALO_S", "nan"),
                                          ("REPLAY_INTERVALO_S", "inf"), ("REPLAY_INTERVALO_S", "3601"),
                                          ("REPLAY_ESPERA_FINAL_S", "0"), ("REPLAY_ESPERA_MAX_S", "0"),
                                          ("KAFKA_TOPIC_REPLAY", "con espacios"), ("KAFKA_TOPIC_REPLAY", "../etc"), ("KAFKA_CONSUMER_GROUP_REPLAY", "a b")])
def test_config_replay_rechaza_valores_invalidos_con_el_nombre_de_la_variable(monkeypatch, nombre, valor):
    from observatorio.config import ConfigReplay

    _limpiar_replay(monkeypatch)
    monkeypatch.setenv(nombre, valor)
    with pytest.raises(ConfigError, match=nombre):
        ConfigReplay.desde_entorno()


def test_config_replay_la_espera_maxima_no_puede_ser_menor_que_la_final(monkeypatch):
    from observatorio.config import ConfigReplay

    _limpiar_replay(monkeypatch)
    monkeypatch.setenv("REPLAY_ESPERA_FINAL_S", "30")
    monkeypatch.setenv("REPLAY_ESPERA_MAX_S", "10")
    with pytest.raises(ConfigError, match="REPLAY_ESPERA_MAX_S"):
        ConfigReplay.desde_entorno()


@pytest.mark.parametrize("vivo,replay,esperado", [("KAFKA_TOPIC", "KAFKA_TOPIC_REPLAY", "KAFKA_TOPIC_REPLAY"),
                                                  ("KAFKA_CONSUMER_GROUP", "KAFKA_CONSUMER_GROUP_REPLAY", "KAFKA_CONSUMER_GROUP_REPLAY")])
def test_config_replay_nunca_comparte_topic_ni_grupo_con_el_flujo_en_vivo(monkeypatch, vivo, replay, esperado):
    """Aislamiento (constitución III): el replay no puede leer ni confirmar offsets en el topic o el grupo reales."""
    from observatorio.config import ConfigReplay

    _limpiar_replay(monkeypatch)
    monkeypatch.setenv(vivo, "terremotos.live" if vivo == "KAFKA_TOPIC" else "consumidor-live")
    monkeypatch.setenv(replay, "terremotos.live" if vivo == "KAFKA_TOPIC" else "consumidor-live")
    with pytest.raises(ConfigError, match=esperado):
        ConfigReplay.desde_entorno()


def test_config_replay_por_defecto_no_coincide_con_los_valores_en_vivo_del_env_example(monkeypatch):
    from observatorio.config import ConfigReplay

    _limpiar_replay(monkeypatch)
    monkeypatch.setenv("KAFKA_TOPIC", "terremotos.live")
    monkeypatch.setenv("KAFKA_CONSUMER_GROUP", "consumidor-live")
    cfg = ConfigReplay.desde_entorno()
    assert cfg.topic != "terremotos.live" and cfg.grupo != "consumidor-live"
