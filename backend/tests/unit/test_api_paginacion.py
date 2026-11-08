"""Paginación, instantánea consistente y sesión de solo lectura de la API (F5, paso 5.1, T007; SC-001, SC-003).

Base TEMPORAL (`obs_api_f5_pagina`): el escritor concurrente de la prueba de instantánea inserta filas confirmadas, por eso nunca se usa la base real.
"""

import asyncio
import re
from contextlib import asynccontextmanager

import psycopg
import pytest
from psycopg_pool import AsyncConnectionPool

from fixtures.base_api import base_temporal, conninfo, hay_entorno, insertar_evento
from observatorio.api.filtros import ErrorParametro, Filtros
from observatorio.api.main import crear_app, crear_repositorio
from observatorio.api.repositorio import BaseDatosNoDisponible, RepositorioApi, opciones_conexion
from observatorio.config import ConfigApi
from fastapi.testclient import TestClient

pytestmark = pytest.mark.skipif(not hay_entorno(), reason="sin PostgreSQL o sin /sql montado")

AHORA = 1_793_113_140_000
H = 3_600_000
BASE = "obs_api_f5_pagina"
CONFIG = ConfigApi(max_eventos=5000, max_ventana_horas=744, obsoleta_s=300, statement_timeout_s=10, margen_publicacion_s=900)
PEQUENA = ConfigApi(max_eventos=7, max_ventana_horas=744, obsoleta_s=300, statement_timeout_s=10, margen_publicacion_s=900)


@pytest.fixture
def base():
    with base_temporal(BASE) as info:
        with psycopg.connect(info, autocommit=True) as c:
            for i in range(23):  # 23 eventos, tres de ellos en el mismo instante
                insertar_evento(c, f"p{i:02d}", AHORA - (1 + min(i, 20)) * 600_000, 4.0 + (i % 5) / 10, "ZA1" if i % 2 else None)
        yield info


def cliente(info, config=CONFIG, reloj=lambda: AHORA):
    return TestClient(crear_app(crear_repositorio(info, config), ["http://localhost:4200"], reloj=reloj, config=config))


def test_recorrer_las_paginas_devuelve_cada_evento_una_vez_y_los_metadatos_son_exactos(base):
    with cliente(base) as c:
        completo = [f["id"] for f in c.get("/api/eventos").json()["features"]]
        assert len(completo) == 23 and len(set(completo)) == 23
        vistos, offset, paginas = [], 0, []
        while True:
            m_f = c.get("/api/eventos", params={"limit": 5, "offset": offset}).json()
            m, feats = m_f["metadata"], m_f["features"]
            paginas.append((m["count"], m["truncated"], m["next_offset"], m["total"], m["limit"], m["offset"]))
            vistos += [f["id"] for f in feats]
            if m["next_offset"] is None:
                break
            offset = m["next_offset"]
        assert vistos == completo                                   # 0 duplicados, 0 omitidos y mismo orden
        assert paginas == [(5, True, 5, 23, 5, 0), (5, True, 10, 23, 5, 5), (5, True, 15, 23, 5, 10), (5, True, 20, 23, 5, 15), (3, False, None, 23, 5, 20)]


def test_pagina_exacta_sin_truncado_y_fuera_de_rango(base):
    with cliente(base) as c:
        m = c.get("/api/eventos", params={"limit": 23}).json()["metadata"]
        assert (m["count"], m["truncated"], m["next_offset"]) == (23, False, None)            # límite = total: no hay truncado
        m = c.get("/api/eventos", params={"limit": 22}).json()["metadata"]
        assert (m["count"], m["truncated"], m["next_offset"]) == (22, True, 22)
        r = c.get("/api/eventos", params={"offset": 99}).json()                              # fuera de rango: página vacía válida
        assert r["features"] == [] and r["metadata"]["total"] == 23 and r["metadata"]["truncated"] is False and r["metadata"]["next_offset"] is None


def test_el_limite_maximo_se_aplica_sin_recortar_en_silencio(base):
    with cliente(base, PEQUENA) as c:
        r = c.get("/api/eventos").json()                                                    # por defecto: el máximo configurado (7)
        assert r["metadata"]["count"] == 7 and r["metadata"]["truncated"] is True and r["metadata"]["total"] == 23 and r["metadata"]["limit"] == 7
        e = c.get("/api/eventos", params={"limit": 8})                                       # más que el máximo: 422, no 7 en silencio
        assert e.status_code == 422 and "7" in e.json()["detail"]


def test_paginar_sin_end_con_el_periodo_resuelto_no_duplica_ni_omite_aunque_entren_eventos_nuevos(base):
    reloj = {"t": AHORA}
    with cliente(base, reloj=lambda: reloj["t"]) as c:
        primera = c.get("/api/eventos", params={"limit": 10}).json()
        periodo = primera["metadata"]["period"]
        ids = [f["id"] for f in primera["features"]]
        with psycopg.connect(conninfo(BASE), autocommit=True) as w:                          # llega un terremoto nuevo (más reciente que end) entre páginas
            insertar_evento(w, "nuevo", AHORA + 30_000, 5.0, "ZA1")
        reloj["t"] = AHORA + 60_000                                                          # y el reloj avanza
        offset = primera["metadata"]["next_offset"]
        while offset is not None:
            from observatorio.api.filtros import desde_ms
            r = c.get("/api/eventos", params={"limit": 10, "offset": offset, "start": desde_ms(periodo["start"]).isoformat(),
                                              "end": desde_ms(periodo["end"]).isoformat()}).json()
            ids += [f["id"] for f in r["features"]]
            assert r["metadata"]["period"] == periodo and r["metadata"]["total"] == 23
            offset = r["metadata"]["next_offset"]
        assert len(ids) == 23 and len(set(ids)) == 23 and "nuevo" not in ids


# --- instantánea consistente (REPEATABLE READ) -------------------------------------------------------------------

class ConexionConEscritorConcurrente:
    """Envuelve una conexión del pool y, tras la PRIMERA consulta de la petición, inserta un evento confirmado desde otra conexión."""

    def __init__(self, conn, escribir):
        self._conn, self._escribir, self._n = conn, escribir, 0

    async def execute(self, *args, **kwargs):
        resultado = await self._conn.execute(*args, **kwargs)
        self._n += 1
        if self._n == 1:
            await self._escribir()
        return resultado


async def _pagina_con_escritura_intercalada(info, opciones):
    kwargs = {"options": opciones} if opciones else {}
    pool = AsyncConnectionPool(info, kwargs=kwargs, min_size=1, max_size=2, open=False)
    await pool.open()
    try:
        async def escribir():
            async with await psycopg.AsyncConnection.connect(info, autocommit=True) as w:
                from fixtures.base_api import ms, SHA, INGESTA
                await w.execute(
                    "INSERT INTO live.evento_actual (event_id, event_time, updated_at, mag, longitude, latitude, source, mode, ingested_at, kafka_topic, kafka_partition, "
                    "kafka_offset, raw, geo_resultado, geo_catalogo) VALUES ('intruso', %s, %s, 5, 0, 0, 'usgs-all-day', 'live', %s, 't', 0, 999999, '{}'::jsonb, 'sin_pais', %s)",
                    (ms(AHORA - 60_000), ms(AHORA - 60_000), INGESTA, SHA))

        @asynccontextmanager
        async def conexion():
            async with pool.connection() as conn:
                yield ConexionConEscritorConcurrente(conn, escribir)

        return await RepositorioApi(conexion).pagina_eventos(Filtros.desde_parametros(AHORA), 5000, 0)
    finally:
        await pool.close()


def test_con_la_sesion_de_produccion_total_y_eventos_salen_del_mismo_estado(base):
    pagina = asyncio.run(_pagina_con_escritura_intercalada(base, opciones_conexion(10)))
    assert pagina.total == 23 and len(pagina.eventos) == 23           # el intruso, confirmado entre consultas, no se ve


def test_control_sin_instantanea_la_misma_prueba_detecta_la_incoherencia(base):
    """Prueba de la prueba: con READ COMMITTED (sin las opciones de producción) el total y los eventos divergen; así se demuestra que la anterior discrimina."""
    pagina = asyncio.run(_pagina_con_escritura_intercalada(base, None))
    assert (pagina.total, len(pagina.eventos)) == (23, 24)


# --- sesión de solo lectura, UTC y tiempo máximo ------------------------------------------------------------------------

def test_la_sesion_de_la_api_es_repeatable_read_solo_lectura_utc_y_con_tiempo_maximo(base):
    async def prueba():
        pool = AsyncConnectionPool(base, kwargs={"options": opciones_conexion(7)}, min_size=1, max_size=1, open=False)
        await pool.open()
        try:
            async with pool.connection() as conn:
                valores = {}
                for ajuste in ("transaction_isolation", "transaction_read_only", "timezone", "statement_timeout"):
                    valores[ajuste] = (await (await conn.execute(f"SHOW {ajuste}")).fetchone())[0]
                with pytest.raises(psycopg.errors.ReadOnlySqlTransaction):
                    await conn.execute("DELETE FROM live.evento_actual")                       # la API no puede escribir ni por error
                return valores
        finally:
            await pool.close()

    assert asyncio.run(prueba()) == {"transaction_isolation": "repeatable read", "transaction_read_only": "on", "timezone": "UTC", "statement_timeout": "7s"}


def test_una_consulta_que_supera_el_tiempo_maximo_es_503_y_no_una_lista_vacia(base):
    config = ConfigApi(max_eventos=5000, max_ventana_horas=744, obsoleta_s=300, statement_timeout_s=1, margen_publicacion_s=900)

    async def prueba():
        repo = crear_repositorio(base, config)
        await repo.abrir()
        try:
            with pytest.raises(BaseDatosNoDisponible):
                await repo._consultar("SELECT pg_sleep(3)")
        finally:
            await repo.cerrar()

    asyncio.run(prueba())


def test_la_base_inalcanzable_es_503_explicito_por_http(base):
    config = CONFIG
    inalcanzable = re.sub(r"host=\S+", "host=servidor-inexistente-f5", base, count=1)
    assert inalcanzable != base
    with TestClient(crear_app(crear_repositorio(inalcanzable, config), ["http://localhost:4200"], reloj=lambda: AHORA, config=config)) as c:
        r = c.get("/api/eventos")
        assert r.status_code == 503 and r.json()["error"] == "base_de_datos_no_disponible" and "features" not in r.json()
        assert c.get("/api/eventos", params={"min_mag": "x"}).status_code == 422
