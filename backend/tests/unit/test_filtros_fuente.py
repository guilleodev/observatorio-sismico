"""F8: el filtro `fuente` y la condición de «no duplicado» en la cláusula WHERE COMPARTIDA (Filtros.donde), que usan eventos, estadísticas y comparación."""

import pytest

from observatorio.api.filtros import FUENTES, ErrorParametro, Filtros

AHORA = 1_793_113_200_000
CONDICION = "NOT live.emsc_duplicado(source, event_time, longitude, latitude, mag)"


def filtros(**kw):
    return Filtros.desde_parametros(AHORA, **kw)


def test_las_fuentes_admitidas_son_usgs_y_emsc():
    assert FUENTES == ("usgs", "emsc")


@pytest.mark.parametrize("texto, esperado", [("usgs", "usgs"), ("EMSC", "emsc"), (" Usgs ", "usgs")])
def test_la_fuente_se_normaliza(texto, esperado):
    assert filtros(fuente=texto).fuente == esperado


@pytest.mark.parametrize("malo", ["", "todas", "usgs,emsc", "geonet", "'; DROP TABLE live.evento_actual; --"])
def test_una_fuente_desconocida_es_un_error_de_parametro_nunca_se_ignora(malo):
    with pytest.raises(ErrorParametro):
        filtros(fuente=malo)


def test_fuente_no_se_admite_con_replay():
    with pytest.raises(ErrorParametro, match="replay"):
        filtros(fuente="usgs", modo="replay")


def test_sin_fuente_se_ven_todas_sin_duplicados():
    donde, parametros = filtros().donde()
    assert CONDICION in donde and "usgs" not in donde and "emsc-fdsn'" not in donde.replace("emsc_duplicado", "")
    assert set(parametros) == {"f_start", "f_end"}


def test_fuente_usgs_y_emsc_anaden_su_condicion_sin_valores_concatenados():
    d_usgs, p1 = filtros(fuente="usgs").donde()
    d_emsc, p2 = filtros(fuente="emsc").donde()
    assert CONDICION in d_usgs and "left(source, 4) = 'usgs'" in d_usgs and "%" not in d_usgs.replace("%(f_", "")   # sin «%» suelto (psycopg lo leería como parámetro)
    assert CONDICION in d_emsc and "source = 'emsc-fdsn'" in d_emsc
    assert set(p1) == set(p2) == {"f_start", "f_end"}                                                               # el valor de `fuente` nunca va al SQL ni a los parámetros


def test_en_replay_no_hay_condicion_de_duplicados_ni_de_fuente():
    donde, _ = filtros(modo="replay", run_id="r1").donde()
    assert "emsc" not in donde and "source" not in donde and "run_id = %(f_run)s" in donde


def test_la_condicion_de_duplicados_es_unica_para_eventos_y_estadisticas():
    """Los dos usan la MISMA cláusula (R-001): no puede haber una cuenta que oculte duplicados y otra que no."""
    assert filtros(min_mag="2").donde()[0].count(CONDICION) == 1
    assert filtros(min_mag="2").donde(con_magnitud=False)[0].count(CONDICION) == 1
