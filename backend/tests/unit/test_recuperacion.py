"""Recuperación de huecos (F4, paso 4.5, T048): catálogo FDSN simulado + PostgreSQL real en transacción REVERTIDA + publicador falso.

Nada se publica en Kafka real. Los ids empiezan por `prueba-rec-` y las fechas son de 2031. El «consumidor» se simula insertando en
`evento_version` lo que el publicador falso recibió, para comprobar la omisión contra lo GUARDADO.
"""

import asyncio
import json
import os
from datetime import datetime, timezone

import psycopg
import pytest

from fixtures.fdsn_simulado import ServidorFdsn, crear_feature, ms
from observatorio.config import SOURCE_RECUPERACION, ConfigPostgres
from observatorio.historico.fdsn import ClienteFdsn, ErrorFdsn
from observatorio.producer.repositorio import RepositorioProductor
from observatorio.recuperacion.recuperar import Hueco, RepositorioRecuperacion, ampliar_a_segundos, recuperar_hueco

pytestmark = pytest.mark.skipif(not os.environ.get("POSTGRES_HOST"), reason="sin PostgreSQL")
INI = datetime(2031, 3, 1, tzinfo=timezone.utc)
FIN = datetime(2031, 3, 2, tzinfo=timezone.utc)
T0 = ms("2031-03-01T00:00:00")
HORA = 3_600_000


def ev(n, hora, updated=None, mag=2.0, **kw):
    tiempo = T0 + hora * HORA
    return tiempo, crear_feature(f"prueba-rec-{n}", tiempo, mag=mag, updated_ms=updated if updated is not None else tiempo + 1000, **kw)


class Publicador:
    def __init__(self, falla_tras=None):
        self.mensajes, self.falla_tras = [], falla_tras

    async def __call__(self, clave, valor):
        if self.falla_tras is not None and len(self.mensajes) >= self.falla_tras:
            raise ConnectionError("Kafka caído (simulado)")
        self.mensajes.append((clave.decode(), json.loads(valor)))
        return 0, len(self.mensajes)

    def versiones(self):
        return [(k, m["event"]["properties"]["updated"]) for k, m in self.mensajes]


class Escenario:
    def __init__(self, conn):
        self.conn, self.rec, self.prod = conn, RepositorioRecuperacion(conn), RepositorioProductor(conn)

    async def crear_hueco(self):
        cur = await self.conn.execute("INSERT INTO live.hueco (inicio, fin) VALUES (%s, %s) RETURNING id", (INI, FIN))
        return Hueco((await cur.fetchone())[0], INI, FIN, "pendiente")

    async def guardar_version(self, event_id, updated_ms):
        await self.conn.execute(
            "INSERT INTO live.evento_version (event_id, updated_at, event_time, longitude, latitude, source, mode, ingested_at, kafka_topic, "
            "kafka_partition, kafka_offset, raw) VALUES (%s, to_timestamp(%s / 1000.0), now(), 0, 0, 'usgs-all-day', 'live', now(), 't', 0, %s, '{}'::jsonb)",
            (event_id, updated_ms, abs(hash((event_id, updated_ms))) % 10**9))

    async def guardar_cuarentena(self, event_id, updated_ms):
        await self.conn.execute(
            "INSERT INTO live.cuarentena (categoria, motivo, event_id, updated_ms, payload, huella) VALUES ('excluido', 'x', %s, %s, '\\x00'::bytea, %s)",
            (event_id, updated_ms, f"prueba-rec-{event_id}-{updated_ms}"))

    async def simular_consumidor(self, publicador):
        for clave, updated in publicador.versiones():
            await self.guardar_version(clave, updated)

    async def recuperar(self, servidor, hueco, publicador, limite=20000, **kw):
        cliente = ClienteFdsn(servidor.url, 5, 0, dormir=lambda s: None)
        r = await recuperar_hueco(self.rec, self.prod, cliente, publicador, hueco, limite, **kw)
        return r, cliente

    async def estado(self, hueco):
        cur = await self.conn.execute("SELECT estado, eventos_publicados FROM live.hueco WHERE id = %s", (hueco.id,))
        return await cur.fetchone()


def ejecutar(prueba):
    async def interior():
        async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
            async with conn.transaction(force_rollback=True):
                await prueba(Escenario(conn))

    asyncio.run(interior())


# ------------------------------------------------------------------------------------------------------------------------
def test_ampliar_a_segundos_nunca_pierde_un_evento_del_borde():
    a, b = ampliar_a_segundos(datetime(2031, 1, 1, 0, 0, 5, 900_000, tzinfo=timezone.utc), datetime(2031, 1, 2, 0, 0, 5, 100_000, tzinfo=timezone.utc))
    assert (a, b) == (datetime(2031, 1, 1, 0, 0, 5, tzinfo=timezone.utc), datetime(2031, 1, 2, 0, 0, 6, tzinfo=timezone.utc))


def test_consulta_el_hueco_sin_filtro_de_magnitud_ni_de_tipo_y_publica_todo_lo_desconocido_con_su_source():
    async def prueba(e):
        hueco = await e.crear_hueco()
        entradas = [ev(1, 1, mag=0.3), ev(2, 2, mag=None), ev(3, 3, tipo="quarry blast"), ev(4, 4, mag=6.1)]
        with ServidorFdsn(entradas) as s:
            pub = Publicador()
            r, _ = await e.recuperar(s, hueco, pub)
            consultas = [p for p in s.peticiones]
        assert all("minmagnitude" not in p and "eventtype" not in p for p in consultas) and any("/count?" in p for p in consultas)
        assert r.encontrados == 4 and r.publicados == 4 and r.recuperado
        assert {m["source"] for _, m in pub.mensajes} == {SOURCE_RECUPERACION} and {m["mode"] for _, m in pub.mensajes} == {"live"}
        assert [k for k, _ in pub.mensajes] == ["prueba-rec-1", "prueba-rec-2", "prueba-rec-3", "prueba-rec-4"]  # orden temporal; clave = id
        assert await e.estado(hueco) == ("recuperado", 4)

    ejecutar(prueba)


def test_omite_lo_ya_guardado_con_el_mismo_updated_y_publica_lo_revisado_o_desconocido():
    async def prueba(e):
        hueco = await e.crear_hueco()
        guardado, revisado, nuevo = ev(1, 1), ev(2, 2, updated=T0 + 5000), ev(3, 3)
        await e.guardar_version("prueba-rec-1", guardado[1]["properties"]["updated"])  # idéntico: se omite
        await e.guardar_version("prueba-rec-2", T0 + 2000)  # misma id, versión anterior guardada: la nueva (5000) es una revisión
        with ServidorFdsn([guardado, revisado, nuevo]) as s:
            pub = Publicador()
            r, _ = await e.recuperar(s, hueco, pub)
        assert (r.encontrados, r.ya_guardados, r.publicados) == (3, 1, 2)
        assert pub.versiones() == [("prueba-rec-2", T0 + 5000), ("prueba-rec-3", nuevo[1]["properties"]["updated"])]

    ejecutar(prueba)


def test_la_omision_se_decide_contra_lo_guardado_incluida_la_cuarentena_y_no_contra_version_publicada():
    async def prueba(e):
        hueco = await e.crear_hueco()
        en_cuarentena, publicado_no_guardado, ya_guardado = ev(1, 1, tipo="quarry blast"), ev(2, 2), ev(3, 3)
        await e.guardar_cuarentena("prueba-rec-1", en_cuarentena[1]["properties"]["updated"])
        await e.prod.marcar_publicada("prueba-rec-2", publicado_no_guardado[1]["properties"]["updated"], 0, 1)  # publicado, pero nunca guardado
        await e.guardar_version("prueba-rec-3", ya_guardado[1]["properties"]["updated"])
        with ServidorFdsn([en_cuarentena, publicado_no_guardado, ya_guardado]) as s:
            pub = Publicador()
            r, _ = await e.recuperar(s, hueco, pub)
        assert r.ya_guardados == 2 and [k for k, _ in pub.versiones()] == ["prueba-rec-2"]  # se reenvía lo que Kafka pudo perder

    ejecutar(prueba)


def test_datos_fuera_de_orden_una_version_anterior_no_guardada_se_publica_y_el_consumidor_decide():
    async def prueba(e):
        hueco = await e.crear_hueco()
        await e.guardar_version("prueba-rec-1", T0 + 9000)  # ya se guardó la versión más reciente
        with ServidorFdsn([ev(1, 1, updated=T0 + 3000), ev(2, 2)]) as s:  # el catálogo devuelve una versión ANTERIOR del evento 1
            pub = Publicador()
            r, _ = await e.recuperar(s, hueco, pub)
        assert ("prueba-rec-1", T0 + 3000) in pub.versiones()  # la recuperación no decide el orden: lo hace el consumidor por `updated`
        assert r.publicados == 2

    ejecutar(prueba)


def test_subdivide_el_intervalo_si_el_recuento_alcanza_el_limite_sin_perder_ni_repetir():
    async def prueba(e):
        hueco = await e.crear_hueco()
        entradas = [ev(i, i % 24 + 0.5 * (i // 24), updated=T0 + i) for i in range(1, 41)] + [ev(99, 12)]
        with ServidorFdsn(entradas) as s:
            pub = Publicador()
            r, _ = await e.recuperar(s, hueco, pub, limite=10)
            assert s.contar_peticiones("count") > 1  # hubo subdivisión
        claves = pub.versiones()
        assert len(claves) == len(set(claves)) == 41 and r.encontrados == 41

    ejecutar(prueba)


def test_repetir_la_recuperacion_no_publica_nada_nuevo_una_vez_guardado():
    async def prueba(e):
        hueco = await e.crear_hueco()
        with ServidorFdsn([ev(1, 1), ev(2, 2), ev(3, 3)]) as s:
            pub = Publicador()
            primera, _ = await e.recuperar(s, hueco, pub)
            await e.simular_consumidor(pub)  # el consumidor guarda lo publicado
            segunda, _ = await e.recuperar(s, hueco, pub)  # misma orden otra vez (como --hueco ID)
        assert primera.publicados == 3 and segunda.publicados == 0 and segunda.ya_guardados == 3 and len(pub.mensajes) == 3
        assert await e.estado(hueco) == ("recuperado", 0)

    ejecutar(prueba)


def test_una_interrupcion_a_mitad_deja_el_hueco_pendiente_y_reanudar_completa_sin_perder_nada():
    async def prueba(e):
        hueco = await e.crear_hueco()
        entradas = [ev(i, i) for i in range(1, 7)]
        with ServidorFdsn(entradas) as s:
            caido = Publicador(falla_tras=3)
            with pytest.raises(ConnectionError):
                await e.recuperar(s, hueco, caido)
            assert await e.estado(hueco) == ("pendiente", None) and len(caido.mensajes) == 3
            marcadas = (await (await e.conn.execute("SELECT count(*) FROM live.version_publicada WHERE event_id LIKE 'prueba-rec-%'")).fetchone())[0]
            assert marcadas == 3  # solo las confirmadas por Kafka
            await e.simular_consumidor(caido)  # el consumidor guardó las 3 publicadas
            pub = Publicador()
            r, _ = await e.recuperar(s, hueco, pub)  # reanudación
        assert r.publicados == 3 and r.ya_guardados == 3
        assert sorted({k for k, _ in caido.versiones() + pub.versiones()}) == [f"prueba-rec-{i}" for i in range(1, 7)]
        assert await e.estado(hueco) == ("recuperado", 3)

    ejecutar(prueba)


def test_lo_publicado_y_no_guardado_se_reenvia_sin_duplicar_versiones_publicadas():
    async def prueba(e):
        hueco = await e.crear_hueco()
        with ServidorFdsn([ev(1, 1)]) as s:
            for _ in range(2):  # el consumidor nunca guarda: se reenvía, pero version_publicada no se duplica
                await e.recuperar(s, hueco, Publicador())
        n = (await (await e.conn.execute("SELECT count(*) FROM live.version_publicada WHERE event_id = 'prueba-rec-1'")).fetchone())[0]
        assert n == 1

    ejecutar(prueba)


def test_modo_simular_cuenta_sin_publicar_ni_marcar_nada():
    async def prueba(e):
        hueco = await e.crear_hueco()
        with ServidorFdsn([ev(1, 1), ev(2, 2)]) as s:
            pub = Publicador()
            r, _ = await e.recuperar(s, hueco, pub, simular=True)
        assert r.publicados == 2 and not r.recuperado and pub.mensajes == []
        assert await e.estado(hueco) == ("pendiente", None)

    ejecutar(prueba)


def test_un_fallo_del_catalogo_deja_el_hueco_pendiente():
    async def prueba(e):
        hueco = await e.crear_hueco()
        with ServidorFdsn([ev(1, 1)]) as s:
            s.guion = [(503, {}, b"")]
            with pytest.raises(ErrorFdsn):
                await e.recuperar(s, hueco, Publicador())
        assert await e.estado(hueco) == ("pendiente", None)

    ejecutar(prueba)


def test_un_hueco_sin_eventos_en_el_catalogo_se_marca_recuperado_con_cero():
    async def prueba(e):
        hueco = await e.crear_hueco()
        with ServidorFdsn([]) as s:
            r, _ = await e.recuperar(s, hueco, Publicador())
        assert (r.encontrados, r.publicados, r.recuperado) == (0, 0, True) and await e.estado(hueco) == ("recuperado", 0)

    ejecutar(prueba)
