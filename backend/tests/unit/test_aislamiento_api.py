"""Aislamiento del código de la API (F5, paso 5.3, T021; DF6): solo lee, solo lee `live`/`geo` salvo la comparación, que es el único módulo que toca `historico`.

No sustituye a `test_aislamiento.py` (F3, sin modificar); lo completa con las lecturas nuevas de F5. Se analiza el texto de los módulos de producción.
"""

import re
from pathlib import Path

import pytest

API = Path(__file__).resolve().parents[2] / "src" / "observatorio" / "api"
MODULOS = sorted(p for p in API.glob("*.py") if p.name != "__init__.py")
ESQUEMAS = r"(?:live|geo|historico|sintetico|mvp|public|pg_catalog|information_schema)"
LECTURAS = re.compile(rf"\b(?:FROM|JOIN)\s+({ESQUEMAS}\.[a-z_]+)", re.IGNORECASE)  # solo SQL: los imports de Python (from observatorio.x) no coinciden
ESCRITURAS = re.compile(r"\b(INSERT INTO|UPDATE [a-z_]+\.|DELETE FROM|TRUNCATE\b|DROP |ALTER |CREATE |GRANT |COPY )")  # el SQL del proyecto va en mayúsculas
BASE = {"live.evento_actual", "live.estado_ingesta", "geo.pais"}
PERMITIDAS = {"comparacion.py": BASE | {"historico.evento", "live.hueco"}}  # DF6: única lectura del histórico, agregada y de solo lectura


def test_hay_modulos_que_analizar():
    assert {p.name for p in MODULOS} >= {"main.py", "repositorio.py", "filtros.py", "estadisticas.py", "comparacion.py"}


@pytest.mark.parametrize("modulo", MODULOS, ids=lambda p: p.name)
def test_cada_modulo_solo_lee_las_tablas_que_le_corresponden(modulo):
    leidas = {t.lower() for t in LECTURAS.findall(modulo.read_text(encoding="utf-8"))}
    assert leidas <= PERMITIDAS.get(modulo.name, BASE), f"{modulo.name} lee {sorted(leidas - PERMITIDAS.get(modulo.name, BASE))}"


def test_solo_comparacion_lee_el_historico_y_nadie_lee_otros_esquemas():
    lectores = {m.name for m in MODULOS if "historico." in m.read_text(encoding="utf-8").lower()}
    assert lectores == {"comparacion.py"}
    for m in MODULOS:
        assert not re.search(r"\b(sintetico|synthetic|mvp)\b", m.read_text(encoding="utf-8"), re.IGNORECASE), m.name


@pytest.mark.parametrize("modulo", MODULOS, ids=lambda p: p.name)
def test_ningun_modulo_escribe_ni_cambia_el_esquema(modulo):
    assert ESCRITURAS.findall(modulo.read_text(encoding="utf-8")) == []


# --- F6 (T020): el camino de replay solo toca replay.* y el de live nunca lo menciona -------------------------------------------------------

def test_solo_el_camino_replay_menciona_el_esquema_replay():
    mencionan = {m.name for m in MODULOS if re.search(r"\breplay\.[a-z_]+", m.read_text(encoding="utf-8"))}
    assert mencionan == {"replay.py", "filtros.py"}      # el SQL de replay y el selector único; ningún otro módulo (ni comparacion.py) lo nombra


def test_ni_comparacion_ni_el_sql_en_vivo_mencionan_replay():
    from observatorio.api import comparacion, repositorio

    assert "replay" not in (API / "comparacion.py").read_text(encoding="utf-8").lower()
    for sql in (repositorio.SQL_EVENTOS, repositorio.SQL_TOTAL, repositorio.SQL_SIN_MAGNITUD, comparacion.SQL_COBERTURA, comparacion.SQL_ULTIMA_INGESTION):
        assert "replay" not in sql and "live." in sql


def test_el_selector_de_esquema_es_unico_y_cierra_el_acceso_a_otros_esquemas():
    from observatorio.api import estadisticas, repositorio
    from observatorio.api.filtros import para_modo
    from observatorio.api.replay import SQL_EVENTOS_REPLAY

    consultas = [repositorio.SQL_EVENTOS, repositorio.SQL_TOTAL, repositorio.SQL_SIN_MAGNITUD, estadisticas.SQL_POR_PAIS, estadisticas.SQL_POR_HORA,
                 estadisticas.SQL_MAGNITUD, estadisticas.SQL_PROFUNDIDAD]
    for sql in consultas:
        en_replay = para_modo(sql, "replay")
        assert "live.evento_actual" not in en_replay and "replay.evento_actual" in en_replay and "historico" not in en_replay and "sintetico" not in en_replay
        assert para_modo(sql, "live") == sql                                   # live no se transforma: el SQL de F5 queda tal cual
    assert "live." not in SQL_EVENTOS_REPLAY and "historico" not in SQL_EVENTOS_REPLAY and "sintetico" not in SQL_EVENTOS_REPLAY
    for malo in ("historico", "sintetico", "REPLAY", "", "live; DROP", None):
        with pytest.raises(ValueError):
            para_modo(consultas[0], malo)


def test_el_sql_de_replay_es_de_solo_lectura():
    from observatorio.api import replay

    for nombre in ("SQL_EJECUCION_ULTIMA", "SQL_EJECUCION_POR_ID", "SQL_EVENTOS_REPLAY"):
        sql = getattr(replay, nombre)
        assert re.match(r"\s*SELECT\b", sql) and ESCRITURAS.findall(sql) == [], nombre


def test_el_sql_de_comparacion_sobre_el_historico_es_un_select_agregado():
    from observatorio.api import comparacion

    constantes = {n: v for n, v in vars(comparacion).items() if n.startswith("SQL_HISTORICO_")}
    assert set(constantes) == {"SQL_HISTORICO_DISPONIBLE", "SQL_HISTORICO_TOTAL", "SQL_HISTORICO_MEDIANA"}
    for nombre, sql in constantes.items():
        assert re.match(r"\s*SELECT\s+(count\(|percentile_cont)", sql), nombre   # solo agregados: nunca filas individuales del histórico
