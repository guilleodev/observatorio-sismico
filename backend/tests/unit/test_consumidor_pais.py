"""Paso 4.2: el país se asigna dentro de la transacción del consumidor. PostgreSQL real; cada prueba se REVIERTE.

El catálogo de juguete (Z??) se siembra DENTRO de la transacción revertida: no deja nada en `geo.*` ni en `live.*`.
"""

import asyncio
import json
import os
from types import SimpleNamespace

import psycopg
import pytest

from fixtures.geo import escribir_catalogo
from fixtures.mensajes import construir_evento, construir_mensaje
from observatorio.config import ConfigError, ConfigPostgres
from observatorio.consumer.main import procesar_con_reintentos, procesar_registro
from observatorio.consumer.mensaje import clasificar_mensaje
from observatorio.consumer.repositorio import RepositorioEventos
from observatorio.geo.arranque import CatalogoNoCoincide, esperar_asignador, preparar_asignador, verificar_dimension
from observatorio.geo.asignador import Asignacion, Asignador
from observatorio.geo.catalogo import leer_catalogo

pytestmark = pytest.mark.skipif(not os.environ.get("POSTGRES_HOST"), reason="sin PostgreSQL")

T_EVENTO = 1_793_000_000_000
T_INGESTA = 1_793_100_000_000


def mensaje(id_, lon, lat, updated_ms):
    ev = construir_evento(1, ahora=T_EVENTO + 600_000)
    ev["id"] = id_
    ev["properties"].update(updated=updated_ms, type="earthquake", mag=3.2)
    ev["geometry"]["coordinates"] = [lon, lat, 10.0]
    return json.dumps(construir_mensaje(ev, ahora=T_INGESTA), ensure_ascii=False).encode("utf-8")


def evento(id_, lon, lat, updated_ms):
    return clasificar_mensaje(mensaje(id_, lon, lat, updated_ms)).evento


class Consumidor:
    def __init__(self):
        self.confirmados = []

    async def commit(self, offsets):
        self.confirmados.extend(offsets.values())


def registro(offset, id_, lon, lat, updated_ms):
    return SimpleNamespace(topic="terremotos.live", partition=0, offset=offset, key=id_.encode(), value=mensaje(id_, lon, lat, updated_ms))


async def sembrar(conn, catalogo):
    """Siembra el catálogo de juguete en geo.catalogo y geo.pais (dentro de la transacción revertida)."""
    await conn.execute("INSERT INTO geo.catalogo (sha256, archivo, entidades) VALUES (%s, %s, %s)", (catalogo.sha256, catalogo.archivo, len(catalogo.paises)))
    for p in catalogo.paises:
        await conn.execute("INSERT INTO geo.pais (country_id, nombre_es, nombre_en) VALUES (%s, %s, %s)", (p.country_id, p.nombre_es, p.nombre_en))


def ejecutar(tmp_path, prueba):
    async def interior():
        catalogo = leer_catalogo(escribir_catalogo(tmp_path / "juguete.geojson"))
        asignador = Asignador(catalogo)
        async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
            async with conn.transaction(force_rollback=True):
                await sembrar(conn, catalogo)
                await prueba(conn, RepositorioEventos(conn, asignador), catalogo)

    asyncio.run(interior())


async def actual(conn, id_):
    cur = await conn.execute("SELECT country_id, country_name, geo_resultado, geo_catalogo FROM live.evento_actual WHERE event_id = %s", (id_,))
    return await cur.fetchone()


async def contar(conn, tabla, id_=None):
    if id_ is None:
        cur = await conn.execute(f"SELECT count(*) FROM {tabla}")
    else:
        cur = await conn.execute(f"SELECT count(*) FROM {tabla} WHERE event_id = %s", (id_,))
    return (await cur.fetchone())[0]


def test_un_evento_nuevo_guarda_pais_nombre_resultado_y_version_del_catalogo(tmp_path):
    async def prueba(conn, repo, cat):
        assert await repo.guardar_version(evento("prueba-p01", 5, 5, 1000), "t", 0, 1) == "guardada"
        assert await actual(conn, "prueba-p01") == ("ZA1", "Alfa", "interior", cat.sha256)
    ejecutar(tmp_path, prueba)


def test_un_mensaje_repetido_no_cambia_ni_recuentos_ni_pais(tmp_path):
    async def prueba(conn, repo, cat):
        e = evento("prueba-p02", 5, 5, 1000)
        await repo.guardar_version(e, "t", 0, 1)
        antes = (await actual(conn, "prueba-p02"), await contar(conn, "live.evento_actual", "prueba-p02"), await contar(conn, "live.evento_version", "prueba-p02"))
        for offset in range(2, 7):  # reenvío ×5 (SC-004)
            assert await repo.guardar_version(e, "t", 0, offset) == "duplicada"
        assert antes == (await actual(conn, "prueba-p02"), await contar(conn, "live.evento_actual", "prueba-p02"), await contar(conn, "live.evento_version", "prueba-p02"))
    ejecutar(tmp_path, prueba)


def test_una_revision_con_otras_coordenadas_cambia_el_pais_y_una_version_antigua_tardia_no(tmp_path):
    async def prueba(conn, repo, cat):
        await repo.guardar_version(evento("prueba-p03", 5, 5, 1000), "t", 0, 1)
        assert await repo.guardar_version(evento("prueba-p03", 15, 5, 2000), "t", 0, 2) == "guardada"  # revisión: ahora en ZB1
        assert (await actual(conn, "prueba-p03"))[:3] == ("ZB1", "Beta", "interior")
        assert await repo.guardar_version(evento("prueba-p03", 5, 5, 500), "t", 0, 3) == "antigua"  # llega tarde y vieja: no manda
        assert (await actual(conn, "prueba-p03"))[:3] == ("ZB1", "Beta", "interior")
        assert await contar(conn, "live.evento_version", "prueba-p03") == 3  # el historial las conserva todas
    ejecutar(tmp_path, prueba)


def test_sin_pais_se_guarda_con_pais_nulo_y_no_va_a_cuarentena(tmp_path):
    async def prueba(conn, repo, cat):
        cuarentena_antes = await contar(conn, "live.cuarentena")
        consumidor = Consumidor()
        assert await procesar_registro(consumidor, registro(7, "prueba-p04", 100, 50, 1000), repo) == "guardada"
        assert await actual(conn, "prueba-p04") == (None, None, "sin_pais", cat.sha256)
        assert await contar(conn, "live.cuarentena") == cuarentena_antes and consumidor.confirmados == [8]
    ejecutar(tmp_path, prueba)


@pytest.mark.parametrize("lon, lat", [(180, 0), (-180, 0), (0, 90), (0, -90), (10, 5)])
def test_las_coordenadas_limite_se_procesan_sin_error(tmp_path, lon, lat):
    async def prueba(conn, repo, cat):
        assert await repo.guardar_version(evento("prueba-p05", lon, lat, 1000), "t", 0, 1) == "guardada"
        assert (await actual(conn, "prueba-p05"))[2] in {"interior", "frontera", "varias", "sin_pais"}
    ejecutar(tmp_path, prueba)


def test_si_falla_la_asignacion_no_se_guarda_nada_ni_se_confirma_el_offset(tmp_path):
    class AsignadorRoto:
        catalogo_sha256 = "x"

        def asignar(self, lon, lat):
            raise RuntimeError("fallo del asignador")

    async def prueba(conn, repo, cat):
        roto = RepositorioEventos(conn, AsignadorRoto())
        consumidor = Consumidor()
        with pytest.raises(RuntimeError):
            await procesar_registro(consumidor, registro(3, "prueba-p06", 5, 5, 1000), roto)
        assert consumidor.confirmados == []
        assert await contar(conn, "live.evento_actual", "prueba-p06") == 0 and await contar(conn, "live.evento_version", "prueba-p06") == 0
    ejecutar(tmp_path, prueba)


class AsignadorInconsistente:
    """Devuelve un país que no existe en geo.pais: simula un catálogo desincronizado con la base."""
    catalogo_sha256 = "x"

    def asignar(self, lon, lat):
        return Asignacion("ZZZ", "Inexistente", "interior", "0" * 64)


def test_una_clave_foranea_de_pais_rota_es_atomica_y_no_manda_un_terremoto_valido_a_cuarentena(tmp_path):
    class Alto(Exception):
        pass

    async def prueba(conn, repo, cat):
        incoherente = RepositorioEventos(conn, AsignadorInconsistente())
        consumidor = Consumidor()
        cuarentena_antes = await contar(conn, "live.cuarentena")

        async def dormir(segundos):  # corta el bucle de reintentos tras el primer fallo
            raise Alto

        async def asegurar():
            pass

        with pytest.raises(Alto):
            await procesar_con_reintentos(consumidor, registro(9, "prueba-p07", 5, 5, 1000), lambda: incoherente, asegurar, dormir)
        assert consumidor.confirmados == []  # no se confirma
        assert await contar(conn, "live.cuarentena") == cuarentena_antes  # NO es cuarentena: es un fallo de configuración
        assert await contar(conn, "live.evento_actual", "prueba-p07") == 0 and await contar(conn, "live.evento_version", "prueba-p07") == 0
    ejecutar(tmp_path, prueba)


# --- arranque seguro ---------------------------------------------------------------------------------------------------

def test_verificar_dimension_exige_la_huella_y_todos_los_paises_en_la_base(tmp_path):
    async def interior():
        catalogo = leer_catalogo(escribir_catalogo(tmp_path / "juguete.geojson"))
        async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
            async with conn.transaction(force_rollback=True):
                with pytest.raises(CatalogoNoCoincide, match="geo.catalogo"):  # la huella aún no está en la base
                    await verificar_dimension(conn, catalogo)
                await sembrar(conn, catalogo)
                await verificar_dimension(conn, catalogo)  # ahora coincide
                await conn.execute("DELETE FROM geo.pais WHERE country_id = 'ZB1'")  # solo el país de juguete, dentro de la transacción revertida
                with pytest.raises(CatalogoNoCoincide, match="ZB1"):
                    await verificar_dimension(conn, catalogo)
    asyncio.run(interior())


def test_preparar_asignador_lee_el_catalogo_configurado_y_avisa_de_las_geometrias_reparadas(tmp_path, monkeypatch):
    async def interior():
        ruta = escribir_catalogo(tmp_path / "juguete.geojson")
        monkeypatch.setenv("CATALOGO_PATH", str(ruta))
        catalogo = leer_catalogo(ruta)
        async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
            async with conn.transaction(force_rollback=True):
                await sembrar(conn, catalogo)
                asignador = await preparar_asignador(conn)
                assert asignador.catalogo_sha256 == catalogo.sha256 and asignador.reparadas == ("ZG1",)
    asyncio.run(interior())


def test_sin_catalogo_no_se_prepara_nada(tmp_path, monkeypatch):
    async def interior():
        monkeypatch.setenv("CATALOGO_PATH", str(tmp_path / "no-existe.geojson"))
        async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
            with pytest.raises(ConfigError, match="CATALOGO_PATH"):
                await preparar_asignador(conn)
    asyncio.run(interior())


def test_esperar_asignador_reintenta_con_espera_progresiva_y_nunca_devuelve_uno_a_medias():
    intentos, esperas, aseguradas = [], [], []
    bueno = SimpleNamespace(reparadas=(), catalogo_sha256="a" * 64)

    async def preparar():
        intentos.append(1)
        if len(intentos) == 1:
            raise ConfigError("CATALOGO_PATH inexistente")
        if len(intentos) == 2:
            raise CatalogoNoCoincide("huella ausente")
        return bueno

    async def dormir(s):
        esperas.append(s)

    async def asegurar():
        aseguradas.append(1)

    assert asyncio.run(esperar_asignador(preparar, asegurar, dormir)) is bueno
    assert len(intentos) == 3 and esperas == [1, 2] and len(aseguradas) == 2
