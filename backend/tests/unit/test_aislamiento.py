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


# --- F6 (T012): el destino parametrizado no debilita el aislamiento; se AÑADEN garantías, no se quita ninguna ------------------------------

def test_el_destino_live_solo_toca_el_esquema_live_y_el_de_replay_solo_replay():
    from observatorio.consumer import destino as d

    for generar in (d.sql_version, d.sql_actual, d.sql_retirar, d.sql_cuarentena):
        sql_live, sql_replay = generar(d.DESTINO_LIVE), generar(d.DESTINO_REPLAY)
        assert "live." in sql_live and "replay" not in sql_live and "sintetico" not in sql_live and "historico" not in sql_live
        assert "replay." in sql_replay and "live." not in sql_replay and "sintetico" not in sql_replay and "historico" not in sql_replay
    assert repo_consumidor.SQL_CUARENTENA == d.sql_cuarentena(d.DESTINO_LIVE) and "live.cuarentena" in repo_consumidor.SQL_CUARENTENA


def test_consumidor_y_productor_no_leen_ni_escriben_el_historico():
    for carpeta in ("consumer", "producer"):
        ofensores = [p.name for p in (SRC / "observatorio" / carpeta).glob("*.py") if "historico." in p.read_text(encoding="utf-8").lower()]  # el esquema (`historico.evento`), no la etiqueta «replay-historico»
        assert ofensores == [], carpeta


def test_el_paquete_replay_no_toca_live_ni_sintetico_y_solo_lee_el_historico():
    for p in (SRC / "observatorio" / "replay").glob("*.py"):
        texto = p.read_text(encoding="utf-8")
        assert "live." not in texto and "sintetico" not in texto.lower(), p.name
        for orden in ("INSERT INTO historico", "UPDATE historico", "DELETE FROM historico"):
            assert orden not in texto, p.name


def test_solo_el_paquete_replay_y_el_consumidor_conocen_el_esquema_replay():
    permitidos = {"replay", "consumer", "api"}  # la API lo lee en 6.2; hoy ningún módulo de api/ lo menciona
    for p in SRC.rglob("*.py"):
        if "replay." in p.read_text(encoding="utf-8") and p.relative_to(SRC).parts[1] not in permitidos:
            raise AssertionError(f"{p.relative_to(SRC)} menciona el esquema replay")
