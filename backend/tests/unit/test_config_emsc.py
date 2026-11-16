"""F8: configuración de EMSC y arranque de su tarea. EMSC es opcional y NUNCA puede impedir ni detener la ingesta de USGS."""

import asyncio

import pytest

from observatorio.config import ConfigEmsc, ConfigError, ConfigIngesta, ConfigPostgres, SOURCE_EMSC
from observatorio.producer import main as productor


@pytest.fixture(autouse=True)
def entorno_limpio(monkeypatch):
    for nombre in ("EMSC_ACTIVO", "EMSC_URL", "EMSC_INTERVAL_S", "EMSC_TIMEOUT_S", "EMSC_MAX_REINTENTOS", "EMSC_MAG_MIN", "EMSC_VENTANA_INICIAL_H",
                   "EMSC_VENTANA_MAX_DIAS", "EMSC_MARGEN_S", "EMSC_LIMITE"):
        monkeypatch.delenv(nombre, raising=False)


def test_por_defecto_esta_apagada_y_los_valores_son_los_documentados():
    c = ConfigEmsc.desde_entorno()
    assert c.activo is False and c.url == "https://www.seismicportal.eu/fdsnws/event/1/query"
    assert (c.intervalo_s, c.timeout_s, c.max_reintentos, c.mag_min) == (60, 20, 3, 2.0)
    assert (c.ventana_inicial_h, c.ventana_max_dias, c.margen_s, c.limite) == (24, 7, 120, 20000)
    assert SOURCE_EMSC == "emsc-fdsn"


def test_se_activa_y_se_ajusta_por_entorno(monkeypatch):
    monkeypatch.setenv("EMSC_ACTIVO", "true"); monkeypatch.setenv("EMSC_MAG_MIN", "2.5"); monkeypatch.setenv("EMSC_INTERVAL_S", "120")
    c = ConfigEmsc.desde_entorno()
    assert c.activo is True and c.mag_min == 2.5 and c.intervalo_s == 120


@pytest.mark.parametrize("nombre, valor", [("EMSC_URL", "http://inseguro.example/q"), ("EMSC_URL", "ftp://x"), ("EMSC_ACTIVO", "quizá"), ("EMSC_MAG_MIN", "-1"),
                                           ("EMSC_MAG_MIN", "11"), ("EMSC_MAG_MIN", "abc"), ("EMSC_INTERVAL_S", "0"), ("EMSC_VENTANA_MAX_DIAS", "0")])
def test_valores_no_validos_se_rechazan_con_un_error_claro(monkeypatch, nombre, valor):
    monkeypatch.setenv(nombre, valor)
    with pytest.raises(ConfigError):
        ConfigEmsc.desde_entorno()


PG = ConfigPostgres(host="h", base="b", usuario="u", password="p")
INGESTA = ConfigIngesta(usgs_url="https://x", intervalo_s=60, timeout_s=20, max_reintentos=3, retencion_respuestas_dias=3, retencion_consultas_dias=30, publicar=True)


def test_apagada_no_lanza_ninguna_tarea():
    assert productor.iniciar_emsc(PG, INGESTA, publicador=object()) is None


def test_sin_publicacion_real_no_se_consulta_aunque_este_activa(monkeypatch):
    monkeypatch.setenv("EMSC_ACTIVO", "true")
    assert productor.iniciar_emsc(PG, INGESTA, publicador=None) is None


def test_una_configuracion_no_valida_no_impide_arrancar_usgs(monkeypatch):
    monkeypatch.setenv("EMSC_ACTIVO", "true"); monkeypatch.setenv("EMSC_URL", "http://inseguro")
    assert productor.iniciar_emsc(PG, INGESTA, publicador=object()) is None          # se registra el error y se sigue solo con USGS


def test_activa_con_publicacion_lanza_una_tarea_cancelable(monkeypatch):
    monkeypatch.setenv("EMSC_ACTIVO", "true")
    lanzado = []

    async def bucle_falso(conectar, cfg, retencion, publicador, **kw):
        lanzado.append((cfg.activo, retencion))
        await asyncio.sleep(3600)

    monkeypatch.setattr(productor, "bucle_emsc", bucle_falso)

    async def prueba():
        tarea = productor.iniciar_emsc(PG, INGESTA, publicador=object())
        assert tarea is not None and tarea.get_name() == "emsc"
        await asyncio.sleep(0)
        tarea.cancel()
        await asyncio.gather(tarea, return_exceptions=True)
        return tarea.cancelled()

    assert asyncio.run(prueba()) is True and lanzado == [(True, 30)]
