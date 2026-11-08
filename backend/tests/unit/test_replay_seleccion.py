"""F6, T003: selección de solo lectura del histórico para el replay. Base TEMPORAL con un histórico ficticio."""

import re
from datetime import date
from pathlib import Path

import psycopg
import pytest

from fixtures.base_replay import base_temporal_replay, hay_entorno, huella_tabla, insertar_historico
from fixtures.replay_datos import T0, feature
from observatorio.replay import seleccion

pytestmark = pytest.mark.skipif(not hay_entorno(), reason="sin PostgreSQL o sin sql/004_esquema_f6.sql")
DIA = 86_400_000


def historico_ficticio():
    """3 eventos el 2025-01-01, 5 el 2025-01-02 (dos con el mismo instante), 5 el 2025-01-03 y uno de 2025-01-04."""
    eventos = [feature(i, tiempo_ms=T0 + i * 1000) for i in range(1, 4)]
    eventos += [feature(10 + i, tiempo_ms=T0 + DIA + i * 1000) for i in range(0, 5)]
    eventos[-1]["properties"]["time"] = eventos[-2]["properties"]["time"]  # empate de instante: manda event_id
    eventos += [feature(20 + i, tiempo_ms=T0 + 2 * DIA + i * 1000) for i in range(0, 5)]
    eventos += [feature(30, tiempo_ms=T0 + 3 * DIA)]
    return eventos


def con_base(prueba):
    with base_temporal_replay("obs_f6_seleccion") as info:
        with psycopg.connect(info, autocommit=True) as c:
            insertar_historico(c, historico_ficticio())
            prueba(c)


def test_elige_el_dia_con_mas_eventos_y_en_empate_el_primero():
    def prueba(c):
        assert seleccion.elegir_dia(c) == date(2025, 1, 2)  # 5 eventos el 02 y el 03: gana el más temprano

    con_base(prueba)


def test_sin_historico_no_hay_dia():
    with base_temporal_replay("obs_f6_seleccion_vacia") as info:
        with psycopg.connect(info, autocommit=True) as c:
            assert seleccion.elegir_dia(c) is None


def test_toma_los_n_primeros_por_fecha_y_id_del_dia_elegido():
    def prueba(c):
        elegidos = seleccion.seleccionar(c, date(2025, 1, 2), 3)
        assert [f["id"] for f in elegidos] == ["us-hist-010", "us-hist-011", "us-hist-012"]
        todos = seleccion.seleccionar(c, date(2025, 1, 2), 100)
        tiempos = [(f["properties"]["time"], f["id"]) for f in todos]
        assert tiempos == sorted(tiempos) and len(todos) == 5  # el empate de instante se resuelve por id

    con_base(prueba)


def test_pedir_mas_de_los_que_hay_devuelve_los_que_hay_sin_inventar():
    def prueba(c):
        assert len(seleccion.seleccionar(c, date(2025, 1, 4), 30)) == 1
        assert seleccion.seleccionar(c, date(2025, 6, 1), 30) == []  # día sin eventos: nada

    con_base(prueba)


def test_devuelve_el_raw_original_sin_alterarlo():
    def prueba(c):
        original = {f["id"]: f for f in historico_ficticio()}
        for f in seleccion.seleccionar(c, date(2025, 1, 3), 5):
            assert f == original[f["id"]]

    con_base(prueba)


def test_el_dia_se_cuenta_en_utc():
    def prueba(c):
        # un evento a las 23:59:59.999 UTC del 04 y otro a las 00:00:00.000 del 05 no se mezclan
        c.execute("DELETE FROM historico.evento")
        insertar_historico(c, [feature(50, tiempo_ms=T0 + 4 * DIA - 1), feature(51, tiempo_ms=T0 + 4 * DIA)])
        assert [f["id"] for f in seleccion.seleccionar(c, date(2025, 1, 4), 10)] == ["us-hist-050"]
        assert [f["id"] for f in seleccion.seleccionar(c, date(2025, 1, 5), 10)] == ["us-hist-051"]

    con_base(prueba)


def test_la_seleccion_no_cambia_el_historico():
    def prueba(c):
        antes = huella_tabla(c, "historico.evento", "event_id")
        seleccion.elegir_dia(c)
        seleccion.seleccionar(c, date(2025, 1, 2), 3)
        assert huella_tabla(c, "historico.evento", "event_id") == antes

    con_base(prueba)


def test_el_codigo_de_seleccion_solo_contiene_select():
    fuente = (Path(seleccion.__file__)).read_text(encoding="utf-8")
    for orden in ("INSERT", "UPDATE", "DELETE", "DROP", "TRUNCATE", "ALTER", "CREATE"):
        assert not re.search(rf"\b{orden}\b", fuente), orden
    assert "live." not in fuente and "sintetico" not in fuente
