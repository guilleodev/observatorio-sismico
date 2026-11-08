"""Filtros y paginación de la API (F5, paso 5.1, T003): análisis, validación 422 y valores por defecto. Sin base de datos."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from observatorio.api.filtros import SIN_PAIS, ErrorParametro, Filtros, a_ms, paginacion
from observatorio.api.main import crear_app
from observatorio.api.repositorio import BaseDatosNoDisponible, PaginaEventos
from observatorio.config import ConfigApi

UTC = timezone.utc
AHORA = 1_793_113_140_000  # 2026-10-27T14:19:00Z
ORIGEN = "http://localhost:4200"
CONFIG = ConfigApi(max_eventos=5000, max_ventana_horas=744, obsoleta_s=300, statement_timeout_s=10, margen_publicacion_s=900)


def f(**kw):
    return Filtros.desde_parametros(AHORA, **kw)


# --- análisis de fechas ---------------------------------------------------------------------------------------------

@pytest.mark.parametrize("texto", ["2026-11-01T00:00:00Z", "2026-11-01T00:00:00", "2026-11-01T01:00:00+01:00", "2026-11-01", "2026-11-01T00:00:00.000Z",
                                   "2026-11-01 00:00:00", "2026-10-31T19:00:00-05:00"])
def test_fecha_con_zona_sin_zona_o_solo_fecha_es_el_mismo_instante_utc(texto):
    assert f(start=texto, end="2026-12-01T00:00:00Z").start == datetime(2026, 11, 1, tzinfo=UTC)


def test_fracciones_de_segundo_se_conservan_para_la_consulta_y_el_periodo_se_trunca_a_milisegundos():
    r = f(start="2026-11-01T00:00:00.1234567Z", end="2026-11-02T00:00:00Z")
    assert r.start.microsecond == 123456  # Python admite microsegundos; el límite se compara con < y >= sobre timestamptz
    assert r.periodo["start"] == a_ms(datetime(2026, 11, 1, tzinfo=UTC)) + 123


@pytest.mark.parametrize("texto", ["", "  ", "ayer", "2026-13-01", "2026-11-01T25:00:00Z", "2026-11-01T00:00:00 02:00", "1969-12-31T23:59:59Z", "2101-01-01", "0001-01-01", "NaN"])
def test_fecha_ilegible_vacia_o_absurda_es_422_explicito(texto):
    with pytest.raises(ErrorParametro, match="start"):
        f(start=texto, end="2026-12-01T00:00:00Z")


def test_un_mas_sin_codificar_llega_como_espacio_y_es_error_explicito():
    # en una URL, «+02:00» sin codificar se recibe como « 02:00»
    with pytest.raises(ErrorParametro, match="%2B"):
        f(start="2026-11-01T00:00:00 02:00")


def test_defecto_sin_parametros_es_las_ultimas_24h_hasta_generated():
    r = f()
    assert a_ms(r.end) == AHORA and a_ms(r.start) == AHORA - 24 * 3600 * 1000
    assert r.periodo == {"start": AHORA - 86_400_000, "end": AHORA}


def test_solo_end_resuelve_start_como_end_menos_24h_y_solo_start_llega_hasta_generated():
    r = f(end="2026-01-10T00:00:00Z")  # mucho antes de generated − 24 h: no es start >= end
    assert r.end - r.start == timedelta(hours=24)
    r = f(start="2026-10-27T00:00:00Z")
    assert a_ms(r.end) == AHORA


@pytest.mark.parametrize("start,end", [("2026-11-02T00:00:00Z", "2026-11-01T00:00:00Z"), ("2026-11-01T00:00:00Z", "2026-11-01T00:00:00Z")])
def test_start_igual_o_posterior_a_end_es_error(start, end):
    with pytest.raises(ErrorParametro, match="anterior"):
        f(start=start, end=end)


# --- magnitud y país -------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("texto", ["", "abc", "NaN", "nan", "inf", "-Infinity", "1e999", "4,5", "4.5.1"])
def test_min_mag_no_numerica_o_no_finita_es_error(texto):
    with pytest.raises(ErrorParametro, match="min_mag"):
        f(min_mag=texto)


@pytest.mark.parametrize("texto,esperado", [("4", "4"), ("4.5", "4.5"), ("-1.2", "-1.2"), ("0", "0"), (" 3 ", "3")])
def test_min_mag_valida_se_conserva_exacta_como_decimal(texto, esperado):
    assert str(f(min_mag=texto).min_mag) == esperado


@pytest.mark.parametrize("texto,esperado", [("esp", "ESP"), ("ESP", "ESP"), ("sin_pais", SIN_PAIS), ("SIN_PAIS", SIN_PAIS), (" Sin_Pais ", SIN_PAIS)])
def test_country_id_se_normaliza_y_sin_pais_es_un_valor_reservado(texto, esperado):
    assert f(country_id=texto).country_id == esperado


def test_country_id_vacio_es_error():
    with pytest.raises(ErrorParametro, match="country_id"):
        f(country_id="  ")


# --- cláusula SQL compartida ------------------------------------------------------------------------------------------

def test_donde_solo_usa_marcadores_y_nunca_concatena_valores():
    donde, params = f(min_mag="4.5", country_id="esp", start="2026-11-01T00:00:00Z", end="2026-11-02T00:00:00Z").donde()
    assert "4.5" not in donde and "ESP" not in donde and "2026" not in donde
    assert set(params) == {"f_start", "f_end", "f_min_mag", "f_country"}
    assert "NOT retirado" in donde and "event_time >= %(f_start)s" in donde and "event_time < %(f_end)s" in donde


def test_donde_sin_pais_usa_geo_resultado_y_no_country_id_nulo():
    donde, params = f(country_id="sin_pais").donde()
    assert "geo_resultado = 'sin_pais'" in donde and "country_id" not in donde and "f_country" not in params


def test_donde_sin_umbral_omite_solo_la_magnitud():
    con, _ = f(min_mag="4", country_id="ESP").donde()
    sin, params = f(min_mag="4", country_id="ESP").donde(con_magnitud=False)
    assert "mag >=" in con and "mag >=" not in sin and "f_min_mag" not in params and "country_id" in sin


def test_pais_con_comillas_o_sql_no_cambia_la_consulta():
    donde, params = f(country_id="x'; DROP TABLE live.evento_actual;--").donde()
    assert "DROP" not in donde and params["f_country"] == "X'; DROP TABLE LIVE.EVENTO_ACTUAL;--"


# --- paginación -------------------------------------------------------------------------------------------------------

def test_paginacion_por_defecto_es_el_maximo_y_desde_cero():
    assert paginacion(None, None, 5000) == (5000, 0)
    assert paginacion("50", "100", 5000) == (50, 100)
    assert paginacion("5000", "0", 5000) == (5000, 0)


@pytest.mark.parametrize("limit,offset,texto", [("0", None, "limit"), ("-1", None, "limit"), ("5001", None, "limit"), ("10.5", None, "limit"), ("abc", None, "limit"),
                                                 ("", None, "limit"), (None, "-1", "offset"), (None, "x", "offset"), (None, "2000000001", "offset")])
def test_limit_u_offset_fuera_de_rango_es_error_y_nunca_se_recorta(limit, offset, texto):
    with pytest.raises(ErrorParametro, match=texto):
        paginacion(limit, offset, 5000)


# --- HTTP: 422 con {error, detail}; nada se ignora ---------------------------------------------------------------------

class RepoFalso:
    def __init__(self, falla=False, paises=("ESP",)):
        self.falla, self.paises, self.llamadas = falla, paises, []

    async def abrir(self): ...
    async def cerrar(self): ...
    async def comprobar_base(self): ...
    async def ultima_ingestion(self): return None

    async def pagina_eventos(self, filtros, limit, offset):
        self.llamadas.append((filtros, limit, offset))
        if self.falla:
            raise BaseDatosNoDisponible("OperationalError")
        if filtros.country_id not in (None, SIN_PAIS) and filtros.country_id not in self.paises:
            raise ErrorParametro(f"country_id desconocido: {filtros.country_id!r}")
        return PaginaEventos([], 0, 0, None, None)


def cliente(repo=None):
    return TestClient(crear_app(repo or RepoFalso(), [ORIGEN], reloj=lambda: AHORA, config=CONFIG))


@pytest.mark.parametrize("consulta", [
    "start=ayer", "end=", "start=2026-11-02T00:00:00Z&end=2026-11-01T00:00:00Z", "min_mag=abc", "min_mag=NaN", "min_mag=inf", "country_id=ATLANTIDA",
    "limit=5001", "limit=0", "limit=x", "offset=-1", "offset=x", "min_magnitud=4", "start=2026-10-01&start=2026-10-02", "min_mag=4&min_mag=5", "start=2026-11-01T00:00:00+02:00",
])
def test_parametro_invalido_responde_422_con_error_y_detalle_sin_features(consulta):
    r = cliente().get(f"/api/eventos?{consulta}")
    assert r.status_code == 422, consulta
    cuerpo = r.json()
    assert cuerpo["error"] == "parametro_invalido" and cuerpo["detail"] and "features" not in cuerpo


def test_parametros_validos_se_pasan_al_repositorio_resueltos():
    repo = RepoFalso()
    r = cliente(repo).get("/api/eventos?start=2026-10-26T00:00:00Z&end=2026-10-27T00:00:00Z&min_mag=4.5&country_id=esp&limit=10&offset=20")
    assert r.status_code == 200
    filtros, limit, offset = repo.llamadas[0]
    assert (filtros.country_id, str(filtros.min_mag), limit, offset) == ("ESP", "4.5", 10, 20)


def test_sin_parametros_el_periodo_es_el_resuelto_y_se_devuelve_en_metadata():
    r = cliente().get("/api/eventos")
    m = r.json()["metadata"]
    assert m["period"] == {"start": AHORA - 86_400_000, "end": AHORA}
    assert m["limit"] == 5000 and m["offset"] == 0 and m["total"] == 0 and m["truncated"] is False and m["next_offset"] is None


def test_422_y_503_son_distintos_y_la_base_caida_sigue_siendo_503():
    assert cliente(RepoFalso(falla=True)).get("/api/eventos").status_code == 503
    assert cliente(RepoFalso(falla=True)).get("/api/eventos?min_mag=abc").status_code == 422  # la validación va antes que la base


def test_los_metodos_de_escritura_no_existen():
    for metodo in ("post", "put", "delete", "patch"):
        assert getattr(cliente(), metodo)("/api/eventos").status_code == 405
