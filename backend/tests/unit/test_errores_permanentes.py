"""T048: errores permanentes de persistencia. Un registro que SIEMPRE falla al guardarse no debe bloquear la partición (FR-014)."""

import asyncio
import json
import os
from types import SimpleNamespace

import psycopg
import pytest

from fixtures.mensajes import construir_evento, construir_mensaje
from observatorio.config import ConfigPostgres
from observatorio.consumer.main import procesar_con_reintentos
from observatorio.consumer.mensaje import MAX_MS, clasificar_mensaje
from observatorio.consumer.repositorio import ReferenciaMensaje, RepositorioEventos
from observatorio.consumer.mensaje import Clasificacion

AHORA = 1_793_113_140_000


def cuerpo(mutar, ensure_ascii=False) -> bytes:
    msg = construir_mensaje(construir_evento(ahora=AHORA), ahora=AHORA)
    mutar(msg["event"])
    return json.dumps(msg, ensure_ascii=ensure_ascii).encode("utf-8")


# --- el clasificador rechaza de antemano lo que la base no puede almacenar --------------------------------------------

def test_un_nul_en_el_texto_es_invalido_y_no_llega_a_la_base():
    c = clasificar_mensaje(cuerpo(lambda ev: ev["properties"].update(place="a\x00b")))
    assert c.estado == "invalido" and "almacenar" in c.motivo


def test_un_sustituto_unicode_suelto_es_invalido():
    c = clasificar_mensaje(cuerpo(lambda ev: ev["properties"].update(place="x\ud800y"), ensure_ascii=True))
    assert c.estado == "invalido"


@pytest.mark.parametrize("campo", ["time", "updated"])
def test_un_instante_fuera_de_rango_es_invalido(campo):
    c = clasificar_mensaje(cuerpo(lambda ev: ev["properties"].update({campo: MAX_MS + 1})))
    assert c.estado == "invalido" and "rango" in c.motivo


def test_un_updated_enorme_no_se_usa_como_referencia_de_cuarentena():
    c = clasificar_mensaje(cuerpo(lambda ev: ev["properties"].update(updated=10**30)))
    assert c.estado == "invalido" and c.updated_ms is None  # no cabe en bigint: la cuarentena tampoco fallaría por él


# --- el consumidor distingue permanente de transitorio -----------------------------------------------------------------

class ConsumidorFalso:
    def __init__(self):
        self.confirmados = []

    async def commit(self, offsets):
        self.confirmados.extend(offsets.values())


class RepositorioConError:
    """guardar_version falla siempre con `error`; poner_en_cuarentena falla `fallos_cuarentena` veces y luego funciona."""

    def __init__(self, error, fallos_cuarentena=0):
        self.error, self.fallos_cuarentena, self.cuarentenas = error, fallos_cuarentena, []

    async def guardar_version(self, *args):
        raise self.error

    async def poner_en_cuarentena(self, clasificacion, ref):
        if self.fallos_cuarentena > 0:
            self.fallos_cuarentena -= 1
            raise ConnectionError("PostgreSQL no responde")
        self.cuarentenas.append((clasificacion, ref))
        return True


def correr(consumidor, repo, offset=7):
    esperas = []

    async def dormir(s):
        esperas.append(s)

    async def asegurar():
        pass

    reg = SimpleNamespace(topic="t", partition=0, offset=offset, key=b"k", value=cuerpo(lambda ev: None))
    res = asyncio.run(procesar_con_reintentos(consumidor, reg, lambda: repo, asegurar, dormir))
    return res, esperas


@pytest.mark.parametrize("error", [
    psycopg.errors.UntranslatableCharacter("unsupported Unicode escape sequence"),
    psycopg.errors.DatetimeFieldOverflow("timestamp out of range"),
    psycopg.errors.CheckViolation("viola un CHECK"),
    UnicodeEncodeError("utf-8", "\ud800", 0, 1, "surrogates not allowed"),
])
def test_un_error_permanente_va_a_cuarentena_confirma_y_no_reintenta(error):
    consumidor, repo = ConsumidorFalso(), RepositorioConError(error)
    res, esperas = correr(consumidor, repo, offset=7)
    assert res == "cuarentena" and esperas == []  # sin esperas: no se reintenta
    assert consumidor.confirmados == [8]  # el offset avanza: la partición no se bloquea
    (clasificacion, ref), = repo.cuarentenas
    assert clasificacion.estado == "invalido" and "error permanente" in clasificacion.motivo and type(error).__name__ in clasificacion.motivo
    assert ref.offset == 7 and ref.contenido  # se conserva el original


def test_si_ni_siquiera_se_puede_aislar_se_trata_como_transitorio_y_no_se_confirma():
    consumidor = ConsumidorFalso()
    repo = RepositorioConError(psycopg.errors.DataError("dato"), fallos_cuarentena=2)
    res, esperas = correr(consumidor, repo)
    assert res == "cuarentena" and esperas == [1, 2]  # reintenta hasta poder aislarlo
    assert consumidor.confirmados == [8]  # y solo confirma una vez, al final


def test_un_error_de_conexion_sigue_siendo_transitorio_y_no_va_a_cuarentena():
    class Repo(RepositorioConError):
        async def guardar_version(self, *args):
            if self.fallos_cuarentena < 2:  # reutiliza el contador como «fallos restantes de guardado»
                self.fallos_cuarentena += 1
                raise psycopg.OperationalError("conexión cerrada")
            return "guardada"

    consumidor, repo = ConsumidorFalso(), Repo(None)
    res, esperas = correr(consumidor, repo)
    assert res == "guardada" and esperas == [1, 2]
    assert repo.cuarentenas == [] and consumidor.confirmados == [8]


# --- con PostgreSQL real (transacción revertida) ----------------------------------------------------------------------

@pytest.mark.skipif(not os.environ.get("POSTGRES_HOST"), reason="sin PostgreSQL")
def test_la_cuarentena_admite_un_nul_en_la_clave_y_en_el_id_y_conserva_el_original():
    contenido = b'{"x": "a\\u0000b"}'

    async def prueba():
        async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
            async with conn.transaction(force_rollback=True):
                c = Clasificacion("invalido", motivo="error permanente de persistencia: DataError", event_id="a\x00b",
                                  base_huella=contenido)
                ref = ReferenciaMensaje("terremotos.live", 0, 1, b"k\x00z", contenido)
                assert await RepositorioEventos(conn).poner_en_cuarentena(c, ref) is True
                cur = await conn.execute("SELECT event_id, clave, payload FROM live.cuarentena WHERE motivo = %s",
                                         ("error permanente de persistencia: DataError",))
                fila = await cur.fetchone()
                assert fila[0] == "ab" and fila[1] == "kz" and bytes(fila[2]) == contenido

    asyncio.run(prueba())
