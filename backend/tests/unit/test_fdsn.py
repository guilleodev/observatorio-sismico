"""Cliente del catálogo FDSN de USGS (F4, paso 4.4, T031): contra un servidor HTTP local simulado, sin red real."""

from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

import pytest

from fixtures.fdsn_simulado import ServidorFdsn, crear_feature, ms
from observatorio.historico.fdsn import ClienteFdsn, ErrorFdsn

INI = datetime(2025, 3, 1, tzinfo=timezone.utc)
FIN = datetime(2025, 4, 1, tzinfo=timezone.utc)
T = ms("2025-03-10T12:00:00")
ESPERAS = []


def cliente(servidor, **kw):
    kw.setdefault("timeout_s", 5)
    kw.setdefault("max_reintentos", 3)
    kw.setdefault("dormir", ESPERAS.append)  # no se espera de verdad: se anotan las esperas pedidas
    return ClienteFdsn(servidor.url, **kw)


@pytest.fixture(autouse=True)
def _limpiar():
    ESPERAS.clear()


def entradas(n):
    return [(T + i * 1000, crear_feature(f"prueba-{i:03d}", T + i * 1000)) for i in range(n)]


def test_contar_devuelve_el_recuento_y_cuenta_la_peticion():
    with ServidorFdsn(entradas(7)) as s:
        c = cliente(s)
        assert c.contar(INI, FIN, 4.0) == 7
        assert c.peticiones_http == 1 and s.contar_peticiones("count") == 1


def test_la_url_de_consulta_es_reproducible_y_lleva_todos_los_parametros():
    with ServidorFdsn([]) as s:
        c = cliente(s)
        url = c.url("query", INI, FIN, 4.0)
        assert url == c.url("query", INI, FIN, 4.0)
        q = {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}
        assert urlparse(url).path.endswith("/query")
        assert q == {"format": "geojson", "starttime": "2025-03-01T00:00:00", "endtime": "2025-04-01T00:00:00",
                     "minmagnitude": "4", "eventtype": "earthquake", "orderby": "time-asc"}


def test_descargar_devuelve_el_cuerpo_original_y_los_datos():
    with ServidorFdsn(entradas(5)) as s:
        d = cliente(s).descargar(INI, FIN, 4.0)
        assert len(d.datos["features"]) == 5 and d.intentos == 1 and d.http_status == 200
        assert d.cuerpo.startswith(b"{") and "query?" in d.url


def test_429_con_retry_after_se_respeta_y_se_reintenta():
    with ServidorFdsn(entradas(3)) as s:
        s.guion = [(429, {"Retry-After": "7"}, b"")]
        c = cliente(s)
        assert c.contar(INI, FIN, 4.0) == 3
        assert ESPERAS == [7] and c.peticiones_http == 2


def test_5xx_se_reintenta_con_espera_progresiva_y_acaba_en_error_si_persiste():
    with ServidorFdsn(entradas(3)) as s:
        s.guion = [(503, {}, b"")] * 10
        c = cliente(s, max_reintentos=2, esperas=(1, 2, 4))
        with pytest.raises(ErrorFdsn) as e:
            c.contar(INI, FIN, 4.0)
        assert e.value.http_status == 503 and e.value.intentos == 3
        assert ESPERAS == [1, 2] and c.peticiones_http == 3


def test_un_4xx_distinto_de_429_no_se_reintenta():
    with ServidorFdsn(entradas(3)) as s:
        s.guion = [(400, {}, b"mal")]
        c = cliente(s)
        with pytest.raises(ErrorFdsn) as e:
            c.contar(INI, FIN, 4.0)
        assert e.value.http_status == 400 and c.peticiones_http == 1 and ESPERAS == []


def test_tiempo_agotado_se_reintenta_y_se_informa():
    llamadas = []

    def lento(url, timeout_s):
        llamadas.append(url)
        raise ErrorFdsn("tiempo agotado")

    with ServidorFdsn([]) as s:
        c = cliente(s, max_reintentos=1, obtener=lento)
        with pytest.raises(ErrorFdsn, match="tiempo agotado") as e:
            c.contar(INI, FIN, 4.0)
        assert len(llamadas) == 2 and e.value.intentos == 2


def test_json_invalido_da_error():
    with ServidorFdsn(entradas(3)) as s:
        s.cuerpo_roto = b"{no es json"
        with pytest.raises(ErrorFdsn, match="JSON"):
            cliente(s, max_reintentos=0).descargar(INI, FIN, 4.0)


def test_respuesta_sin_featurecollection_da_error():
    with ServidorFdsn(entradas(3)) as s:
        s.cuerpo_roto = b'{"type": "Otra", "features": []}'
        with pytest.raises(ErrorFdsn, match="FeatureCollection"):
            cliente(s, max_reintentos=0).descargar(INI, FIN, 4.0)


def test_un_count_que_no_es_un_entero_no_negativo_da_error():
    with ServidorFdsn([]) as s:
        s.guion = [(200, {}, b'{"count": "muchos"}')]
        with pytest.raises(ErrorFdsn, match="count"):
            cliente(s, max_reintentos=0).contar(INI, FIN, 4.0)


def test_recuento_cero_es_correcto_y_no_reintenta():
    with ServidorFdsn([]) as s:
        c = cliente(s)
        assert c.contar(INI, FIN, 4.0) == 0
        assert c.peticiones_http == 1 and ESPERAS == []


def test_el_endtime_es_inclusivo_en_el_servicio_simulado():
    """Documenta el comportamiento de USGS del que depende la deduplicación: un evento exactamente en `fin` se devuelve."""
    en_el_limite = [(ms("2025-04-01T00:00:00"), crear_feature("prueba-limite", ms("2025-04-01T00:00:00")))]
    with ServidorFdsn(en_el_limite) as s:
        assert cliente(s).contar(INI, FIN, 4.0) == 1


def test_un_recuento_igual_al_limite_se_informa_tal_cual():
    with ServidorFdsn(entradas(10), maximo=10) as s:
        assert cliente(s).contar(INI, FIN, 4.0) == 10  # la decisión de subdividir es del cargador; el cliente solo informa el número
