"""El camino de producción no contiene el modo temporal del MVP ni referencia el esquema antiguo."""

from pathlib import Path

from observatorio.api import repositorio as repo_api
from observatorio.consumer import repositorio as repo_consumidor

SRC = Path(__file__).resolve().parents[2] / "src"


def test_el_codigo_de_produccion_no_menciona_synthetic_ni_el_esquema_sintetico():
    ofensores = [
        str(p.relative_to(SRC))
        for p in SRC.rglob("*.py")
        if any(palabra in p.read_text(encoding="utf-8").lower() for palabra in ("synthetic", "sintetico"))
    ]
    assert ofensores == []


def test_consultas_solo_sobre_el_esquema_live():
    for sql in (repo_api.SQL_EVENTOS, repo_consumidor.SQL_VERSION, repo_consumidor.SQL_ACTUAL, repo_consumidor.SQL_RETIRAR):
        assert "live.evento_" in sql and "sintetico" not in sql
