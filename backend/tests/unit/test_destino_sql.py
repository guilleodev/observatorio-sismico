"""F6, T006: el destino parametrizado del consumidor NO cambia el SQL del flujo en vivo y no deja pasar otro esquema.

`sql_live_congelado.py` es una copia congelada del SQL de `consumer/repositorio.py` antes de parametrizar (commit [F5]).
"""

import pytest

import sql_live_congelado as congelado
from observatorio.consumer import destino as d
from observatorio.consumer import repositorio as repo


@pytest.mark.parametrize("nombre,generar", [("SQL_VERSION", d.sql_version), ("SQL_ACTUAL", d.sql_actual), ("SQL_RETIRAR", d.sql_retirar), ("SQL_CUARENTENA", d.sql_cuarentena)])
def test_el_sql_del_destino_live_es_identico_al_congelado(nombre, generar):
    esperado = getattr(congelado, nombre)
    assert generar(d.DESTINO_LIVE) == esperado  # carácter a carácter
    assert getattr(repo, nombre) == esperado  # y las constantes del módulo (que otras pruebas parchean) siguen siendo esas


def test_el_destino_live_es_el_unico_valor_por_defecto():
    assert d.destino_por_nombre("live") is d.DESTINO_LIVE
    assert d.DESTINO_LIVE.esquema == "live" and d.DESTINO_LIVE.modo == "live" and not d.DESTINO_LIVE.con_run
    assert d.DESTINO_REPLAY.esquema == "replay" and d.DESTINO_REPLAY.modo == "replay" and d.DESTINO_REPLAY.con_run


@pytest.mark.parametrize("malo", ["sintetico", "historico", "geo", "public", "", "LIVE", "live; DROP SCHEMA live CASCADE", "replay ", "live.evento_actual", None, 3])
def test_solo_se_admiten_los_esquemas_de_la_lista_cerrada(malo):
    with pytest.raises(ValueError):
        d.destino_por_nombre(malo)


def test_no_se_puede_construir_un_destino_con_otro_esquema():
    with pytest.raises(ValueError):
        d.Destino(nombre="x", esquema="historico", modo="live", fuentes=("a",), con_run=False)


def _replay_sql():
    return {"version": d.sql_version(d.DESTINO_REPLAY), "actual": d.sql_actual(d.DESTINO_REPLAY), "retirar": d.sql_retirar(d.DESTINO_REPLAY),
            "cuarentena": d.sql_cuarentena(d.DESTINO_REPLAY)}


def test_el_sql_del_destino_replay_solo_toca_replay_y_nunca_live():
    for nombre, sql in _replay_sql().items():
        assert "live." not in sql, nombre
        assert "historico." not in sql and "sintetico." not in sql and "geo." not in sql, nombre
        assert "replay." in sql, nombre


def test_el_sql_del_destino_replay_usa_run_id_en_las_claves():
    sql = _replay_sql()
    assert "ON CONFLICT (run_id, event_id, updated_at) DO NOTHING" in sql["version"]
    assert "ON CONFLICT (run_id, event_id) DO UPDATE" in sql["actual"]
    assert "WHERE EXCLUDED.updated_at > replay.evento_actual.updated_at" in sql["actual"]
    assert "run_id = %(run_id)s" in sql["retirar"]
    assert "ON CONFLICT (run_id, huella) DO NOTHING" in sql["cuarentena"]
    for nombre in ("version", "actual"):
        assert "%(caso)s" in sql[nombre] and "%(run_id)s" in sql[nombre], nombre


def test_el_sql_del_destino_live_no_menciona_run_ni_replay():
    for generar in (d.sql_version, d.sql_actual, d.sql_retirar, d.sql_cuarentena):
        sql = generar(d.DESTINO_LIVE)
        assert "run_id" not in sql and "replay" not in sql and "caso" not in sql
