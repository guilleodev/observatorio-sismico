"""Pruebas del generador de datos de escala (F6, 6.4, T035; FR-019, FR-020).
Uso: bash scripts/f6/ejecutar.sh python -m pytest -q /scripts6/test_bench_datos.py   (la parte con base de datos se omite si no hay BENCH_PG_HOST; la ejecuta bench_ejecutar.sh)."""
import os
import re
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import bench_datos as bd  # noqa: E402

hay_pg = pytest.mark.skipif(os.environ.get("BENCH_PG_HOST") != bd.HOST_PERMITIDO, reason="sin el PostgreSQL temporal de las mediciones")


@pytest.mark.parametrize("n", bd.TAMANOS)
def test_exactamente_n_filas_con_ids_y_claves_validas(n):
    filas = bd.generar(n)
    assert len(filas) == n
    assert len({(f[0], f[1]) for f in filas}) == n                      # clave primaria (event_id, updated_at) sin repetidos
    assert all(re.fullmatch(r"bench-\d{7}", f[0]) for f in filas)       # nunca un id con aspecto de USGS
    assert all(-180 <= f[5] <= 180 and -90 <= f[6] <= 90 for f in filas)
    assert all(f[1] > f[2] for f in filas)                              # updated posterior al tiempo del evento


@pytest.mark.parametrize("n", (1_000, 10_000))
def test_determinista_y_dependiente_de_la_semilla(n):
    assert bd.generar(n) == bd.generar(n)
    assert bd.generar(n, semilla=1) != bd.generar(n)


def test_el_tamano_menor_es_prefijo_del_mayor_para_comparar_escalas():
    assert bd.generar(10_000)[:1_000] == bd.generar(1_000)


def test_todas_las_filas_estan_marcadas_como_sinteticas_y_en_2025():
    filas = bd.generar(5_000)
    assert {f[8] for f in filas} == {"sintetico-bench"}
    assert all(f[2].year == 2025 for f in filas) and any(f[3] is None for f in filas)   # incluye magnitudes nulas, no se rellenan con 0
    ids = {f[0] for f in filas}
    assert 0.55 < len(ids) / len(filas) < 0.8                                            # ~1,5 versiones por evento


def test_n_invalido_se_rechaza():
    with pytest.raises(ValueError):
        bd.generar(0)


@pytest.mark.parametrize("host,base", [("postgres", "bench"), ("bench-f6-pg", "observatorio"), ("localhost", "bench"), ("", "bench"), ("kafka", "bench")])
def test_se_niega_a_conectar_con_el_servidor_real_o_con_otra_base(monkeypatch, host, base):
    monkeypatch.setenv("BENCH_PG_HOST", host)
    monkeypatch.setenv("BENCH_PG_DB", base)
    with pytest.raises(RuntimeError, match="destino no permitido"):
        bd.conninfo_permitido()


def test_el_sql_solo_toca_el_esquema_bench():
    texto = bd.DDL + bd.INSERT
    assert not re.search(r"\b(live|historico|sintetico|replay|geo|public)\.", texto)
    assert set(re.findall(r"\b(?:TABLE|SCHEMA|INTO)\s+(?:IF EXISTS\s+)?(\w+)", texto)) <= {"bench"}


@hay_pg
def test_la_carga_inserta_n_filas_marcadas_solo_en_el_esquema_bench():
    import psycopg

    with psycopg.connect(bd.conninfo_permitido(), autocommit=True) as c:
        assert bd.cargar(1_000, c) == 1_000
        assert c.execute("SELECT count(*) FROM bench.evento_version WHERE origen <> 'sintetico-bench'").fetchone()[0] == 0
        assert c.execute("SELECT count(*) FROM information_schema.schemata WHERE schema_name IN ('live','historico','sintetico','replay')").fetchone()[0] == 0
        with pytest.raises(psycopg.errors.CheckViolation):
            c.execute("INSERT INTO bench.evento_version VALUES ('x', now(), now(), 1, 1, 0, 0, 'x', 'real')")
