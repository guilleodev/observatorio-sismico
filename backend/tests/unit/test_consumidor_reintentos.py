"""Paso 3.4: confirmación del offset, versiones fuera de orden y reintentos seguros (sin base de datos real)."""

import asyncio
from types import SimpleNamespace

from fixtures.mensajes import construir_evento, construir_mensaje, serializar
from observatorio.consumer.main import procesar_con_reintentos, procesar_registro

AHORA = 1_793_113_140_000


class ConsumidorFalso:
    """Registra los eventos en orden. `fallos` = confirmaciones que Kafka rechaza antes de funcionar."""

    def __init__(self, eventos, fallos=0):
        self.eventos, self.fallos = eventos, fallos

    async def commit(self, offsets):
        if self.fallos > 0:
            self.fallos -= 1
            self.eventos.append(("commit_fallido", None))
            raise ConnectionError("Kafka no responde")
        self.eventos.append(("commit", {tp.partition: o for tp, o in offsets.items()}))


class RepositorioFalso:
    """Simula versiones y estado actual. `fallos` = veces que PostgreSQL falla antes de funcionar."""

    def __init__(self, eventos, fallos=0):
        self.eventos, self.fallos, self.versiones, self.filas = eventos, fallos, set(), {}

    async def guardar_version(self, evento, topic, partition, offset):
        if self.fallos > 0:
            self.fallos -= 1
            self.eventos.append(("fallo_sql", offset))
            raise ConnectionError("PostgreSQL no responde")
        self.eventos.append(("guardar", offset))
        clave = (evento.event_id, evento.updated_ms)
        if clave in self.versiones:
            return "duplicada"
        self.versiones.add(clave)
        actual = self.filas.get(evento.event_id)
        if actual is None or evento.updated_ms > actual.updated_ms:
            self.filas[evento.event_id] = evento
            return "guardada"
        return "antigua"


def registro(offset, updated_extra_ms=0):
    """Versión del evento `prueba-001` cuyo `updated` es `updated_extra_ms` posterior a la base."""
    ev = construir_evento(ahora=AHORA)
    ev["properties"]["updated"] += updated_extra_ms
    valor = serializar(construir_mensaje(ev, ahora=AHORA))[1]
    return SimpleNamespace(topic="t", partition=0, offset=offset, key=b"k", value=valor)


class Reloj:
    """Sustituye a asyncio.sleep: anota las esperas sin esperar."""

    def __init__(self):
        self.esperas = []

    async def dormir(self, segundos):
        self.esperas.append(segundos)


def reintentar(consumidor, reg, repo, eventos, reloj=None):
    reloj = reloj or Reloj()

    async def asegurar():
        eventos.append(("asegurar", None))

    return asyncio.run(procesar_con_reintentos(consumidor, reg, lambda: repo, asegurar, reloj.dormir)), reloj


def test_una_version_antigua_tambien_confirma_el_offset():
    eventos = []
    consumidor, repo = ConsumidorFalso(eventos), RepositorioFalso(eventos)
    asyncio.run(procesar_registro(consumidor, registro(0, 60_000), repo))
    res = asyncio.run(procesar_registro(consumidor, registro(1, 0), repo))
    assert res == "antigua"
    assert eventos[-2:] == [("guardar", 1), ("commit", {0: 2})]  # queda en el historial y se confirma, sin sustituir la actual


def test_versiones_fuera_de_orden_dejan_la_mas_reciente_y_confirman_en_orden():
    eventos = []
    consumidor, repo = ConsumidorFalso(eventos), RepositorioFalso(eventos)
    resultados = [asyncio.run(procesar_registro(consumidor, registro(o, u), repo)) for o, u in enumerate([120_000, 0, 60_000])]
    assert resultados == ["guardada", "antigua", "antigua"]
    assert repo.filas["prueba-001"].updated_ms == AHORA - 600_000 + 120_000
    assert [e[1] for e in eventos if e[0] == "commit"] == [{0: 1}, {0: 2}, {0: 3}]


def test_si_falla_la_confirmacion_tras_guardar_el_reintento_no_duplica():
    eventos = []
    consumidor, repo = ConsumidorFalso(eventos, fallos=1), RepositorioFalso(eventos)
    res, reloj = reintentar(consumidor, registro(5), repo, eventos)
    assert res == "duplicada"  # la primera vez se guardó y falló la confirmación; el reintento reconoce la versión
    assert len(repo.versiones) == 1 and reloj.esperas == [1]
    assert [e[0] for e in eventos] == ["guardar", "commit_fallido", "asegurar", "guardar", "commit"]
    assert eventos[-1] == ("commit", {0: 6})


def test_si_falla_postgres_se_reintenta_el_mismo_registro_sin_confirmar_hasta_guardar():
    eventos = []
    consumidor, repo = ConsumidorFalso(eventos), RepositorioFalso(eventos, fallos=3)
    res, reloj = reintentar(consumidor, registro(9), repo, eventos)
    nombres = [e[0] for e in eventos]
    assert res == "guardada" and reloj.esperas == [1, 2, 4]  # espera progresiva
    assert nombres.count("commit") == 1 and nombres.index("guardar") < nombres.index("commit")  # confirma solo tras guardar
    assert "commit" not in nombres[:nombres.index("guardar")]  # ningún commit durante los fallos
    assert nombres.count("asegurar") == 3  # tras cada fallo se comprueba o reabre la conexión
    assert len(repo.versiones) == 1


def test_la_espera_entre_reintentos_tiene_tope():
    eventos = []
    consumidor, repo = ConsumidorFalso(eventos), RepositorioFalso(eventos, fallos=8)
    _, reloj = reintentar(consumidor, registro(1), repo, eventos)
    assert reloj.esperas == [1, 2, 4, 8, 16, 30, 30, 30]


def test_un_registro_con_fallos_no_deja_pasar_al_siguiente():
    """Se procesa de uno en uno: mientras el registro 0 falla, el 1 no se toca y su offset no se confirma."""
    eventos = []
    consumidor, repo = ConsumidorFalso(eventos), RepositorioFalso(eventos, fallos=2)

    async def secuencia():
        reloj = Reloj()

        async def asegurar():
            pass

        for offset in (0, 1):
            await procesar_con_reintentos(consumidor, registro(offset, offset * 60_000), lambda: repo, asegurar, reloj.dormir)

    asyncio.run(secuencia())
    assert [e for e in eventos if e[0] == "fallo_sql"] == [("fallo_sql", 0), ("fallo_sql", 0)]
    assert [e[1] for e in eventos if e[0] == "commit"] == [{0: 1}, {0: 2}]
