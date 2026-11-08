"""F6, T007/T009: el bucle del consumidor de replay termina SOLO, ni antes ni sin fin (research R-005). Con un consumidor y un reloj simulados."""

import asyncio
from types import SimpleNamespace

from observatorio.config import ConfigReplay
from observatorio.consumer.main import consumir_hasta_inactividad

CFG = ConfigReplay(topic="terremotos.replay", grupo="consumidor-replay", eventos=30, intervalo_s=2.0, espera_final_s=10, espera_max_s=120)


class Reloj:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


class ConsumidorSimulado:
    """Cada `getmany` consume 1 s de reloj y devuelve el siguiente lote programado (o nada)."""

    def __init__(self, reloj, lotes):
        self.reloj, self.lotes, self.llamadas = reloj, dict(lotes), 0

    async def getmany(self, timeout_ms=0, max_records=None):
        self.llamadas += 1
        self.reloj.t += 1.0
        lote = self.lotes.pop(self.llamadas, None)
        return {"tp": lote} if lote else {}


def correr(lotes, cfg=CFG):
    reloj = Reloj()
    procesados = []

    async def procesar(registro):
        procesados.append(registro)

    consumidor = ConsumidorSimulado(reloj, lotes)
    n = asyncio.run(consumir_hasta_inactividad(consumidor, procesar, cfg, reloj=reloj))
    return n, procesados, reloj.t, consumidor.llamadas


def test_termina_tras_la_espera_final_desde_el_ultimo_mensaje_procesado():
    n, procesados, t, _ = correr({3: ["a", "b"], 5: ["c"]})
    assert n == 3 and procesados == ["a", "b", "c"]
    assert t == 5 + 10  # el último mensaje llegó en t=5; tras 10 s de inactividad termina


def test_no_termina_antes_de_tiempo_aunque_el_productor_sea_lento():
    # el primer mensaje llega a los 100 s (más que espera_final_s): el consumidor sigue esperando hasta espera_max_s
    n, procesados, t, _ = correr({100: ["a"], 108: ["b"]})
    assert procesados == ["a", "b"] and n == 2
    assert t == 108 + 10


def test_si_nunca_llega_nada_termina_en_el_tope_y_devuelve_cero():
    n, procesados, t, _ = correr({})
    assert n == 0 and procesados == [] and t == CFG.espera_max_s


def test_un_mensaje_tardio_despues_del_tope_no_se_espera():
    n, _, t, _ = correr({130: ["tarde"]})
    assert n == 0 and t == CFG.espera_max_s


def test_cada_registro_se_procesa_en_orden_y_antes_de_la_siguiente_lectura():
    orden = []
    reloj = Reloj()

    class C(ConsumidorSimulado):
        async def getmany(self, timeout_ms=0, max_records=None):
            orden.append("leer")
            return await super().getmany(timeout_ms, max_records)

    async def procesar(registro):
        orden.append(registro)

    asyncio.run(consumir_hasta_inactividad(C(reloj, {1: ["a", "b"], 2: ["c"]}), procesar, CFG, reloj=reloj))
    assert orden[:5] == ["leer", "a", "b", "leer", "c"]


def test_si_procesar_falla_el_error_sube_y_no_se_traga():
    reloj = Reloj()

    async def procesar(registro):
        raise RuntimeError("fallo al guardar")

    try:
        asyncio.run(consumir_hasta_inactividad(ConsumidorSimulado(reloj, {1: ["a"]}), procesar, CFG, reloj=reloj))
    except RuntimeError as exc:
        assert "fallo al guardar" in str(exc)
    else:
        raise AssertionError("debía propagar el error")
