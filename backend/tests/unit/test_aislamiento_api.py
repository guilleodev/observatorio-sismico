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


def test_el_sql_de_comparacion_sobre_el_historico_es_un_select_agregado():
    from observatorio.api import comparacion

    constantes = {n: v for n, v in vars(comparacion).items() if n.startswith("SQL_HISTORICO_")}
    assert set(constantes) == {"SQL_HISTORICO_DISPONIBLE", "SQL_HISTORICO_TOTAL", "SQL_HISTORICO_MEDIANA"}
    for nombre, sql in constantes.items():
        assert re.match(r"\s*SELECT\s+(count\(|percentile_cont)", sql), nombre   # solo agregados: nunca filas individuales del histórico
