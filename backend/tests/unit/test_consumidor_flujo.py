import asyncio
from types import SimpleNamespace

import pytest

from observatorio.consumer.main import procesar_registro
from observatorio.sintetico import construir_evento, construir_mensaje, serializar

AHORA = 1_793_113_140_000


class ConsumidorFalso:
    def __init__(self, eventos):
        self.eventos = eventos

    async def commit(self, offsets):
        self.eventos.append(("commit", {tp.partition: o for tp, o in offsets.items()}))


class RepositorioFalso:
    """Simula la tabla: una fila por event_id (DO NOTHING). Puede fallar a voluntad."""

    def __init__(self, eventos, falla=False):
        self.eventos, self.falla, self.filas = eventos, falla, {}

    async def guardar(self, evento, topic, partition, offset):
        if self.falla:
            raise ConnectionError("PostgreSQL caído")
        self.eventos.append(("guardar", offset))
        if evento.event_id in self.filas:
            return False
        self.filas[evento.event_id] = evento
        return True


def registro(offset=0, valor=None):
    if valor is None:
        valor = serializar(construir_mensaje(construir_evento(ahora=AHORA), ahora=AHORA))[1]
    return SimpleNamespace(topic="t", partition=0, offset=offset, key=b"k", value=valor)


def ejecutar(coro):
    return asyncio.run(coro)


def test_el_offset_se_confirma_solo_despues_de_guardar():
    eventos = []
    res = ejecutar(procesar_registro(ConsumidorFalso(eventos), registro(4), RepositorioFalso(eventos)))
    assert res == "guardado"
    assert eventos == [("guardar", 4), ("commit", {0: 5})]  # guardar ANTES de commit; offset siguiente


def test_si_guardar_falla_no_se_confirma():
    eventos = []
    with pytest.raises(ConnectionError):
        ejecutar(procesar_registro(ConsumidorFalso(eventos), registro(), RepositorioFalso(eventos, falla=True)))
    assert eventos == []  # ni guardado ni commit


def test_mensaje_repetido_se_guarda_una_vez_y_se_confirma():
    eventos = []
    consumidor, repo = ConsumidorFalso(eventos), RepositorioFalso(eventos)
    resultados = [ejecutar(procesar_registro(consumidor, registro(o), repo)) for o in range(3)]
    assert resultados == ["guardado", "duplicado", "duplicado"]
    assert len(repo.filas) == 1
    assert [e for e in eventos if e[0] == "commit"] == [("commit", {0: 1}), ("commit", {0: 2}), ("commit", {0: 3})]


def test_revision_posterior_no_sobrescribe_en_el_mvp():
    """MVP (research R-006): DO NOTHING. La comparación por `updated` es de F3."""
    eventos = []
    consumidor, repo = ConsumidorFalso(eventos), RepositorioFalso(eventos)
    ejecutar(procesar_registro(consumidor, registro(0), repo))
    v2 = serializar(construir_mensaje(construir_evento(ahora=AHORA + 60_000), ahora=AHORA + 60_000))[1]
    assert ejecutar(procesar_registro(consumidor, registro(1, v2), repo)) == "duplicado"
    assert repo.filas["synthetic-mvp-001"].updated_ms == AHORA - 600_000


def test_mensaje_invalido_se_descarta_con_commit_sin_guardar():
    eventos = []
    res = ejecutar(procesar_registro(ConsumidorFalso(eventos), registro(2, b"basura"), RepositorioFalso(eventos)))
    assert res == "descartado"
    assert eventos == [("commit", {0: 3})]  # no bloquea la cola
