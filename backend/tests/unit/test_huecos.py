"""Detección de huecos de ingesta (F4, paso 4.5, T044): función pura y PostgreSQL real dentro de una transacción REVERTIDA.

Las fechas son de 2031: no se mezclan con la ingesta real. El hueco real (si lo hubiera) no se toca: solo se comparan diferencias.
"""

import asyncio
import os
from datetime import datetime, timedelta, timezone

import psycopg
import pytest

from observatorio.config import ConfigIngesta, ConfigPostgres
from observatorio.producer.repositorio import RepositorioProductor, calcular_hueco
from observatorio.producer.usgs import Respuesta

H = timedelta(hours=1)
AHORA = datetime(2031, 6, 15, 12, 0, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------------------------------------- regla pura
@pytest.mark.parametrize("espera_h,hueco", [(30, True), (25, True), (23.0001, True), (23, False), (22, False), (1, False)])
def test_con_margen_de_1_h_el_umbral_es_24_h_menos_el_margen_y_exactamente_el_umbral_no_anota(espera_h, hueco):
    anterior = AHORA - timedelta(hours=espera_h)
    resultado = calcular_hueco(anterior, AHORA, 3600)
    assert (resultado is not None) is hueco
    if hueco:  # (anterior − margen, ahora − 24 h + margen)
        assert resultado == (anterior - H, AHORA - 23 * H)


def test_interrupcion_de_mas_de_24_h_anota_el_intervalo_con_el_margen_por_ambos_lados():
    anterior = AHORA - 30 * H
    assert calcular_hueco(anterior, AHORA, 6 * 3600) == (anterior - 6 * H, AHORA - 18 * H)


def test_margen_cero_exige_mas_de_24_h_y_el_intervalo_no_es_vacio():
    assert calcular_hueco(AHORA - 24 * H, AHORA, 0) is None  # exactamente 24 h: sin hueco
    inicio, fin = calcular_hueco(AHORA - 24 * H - timedelta(seconds=1), AHORA, 0)
    assert fin > inicio and fin == AHORA - 24 * H


def test_el_intervalo_siempre_cumple_fin_mayor_que_inicio_si_se_anota():
    for margen_h in (0, 1, 6, 12, 23):
        for espera_h in (1, 10, 18.5, 23.5, 24.5, 50, 200):
            r = calcular_hueco(AHORA - timedelta(hours=espera_h), AHORA, margen_h * 3600)
            assert r is None or r[1] > r[0]


# ---------------------------------------------------------------------------------------------------------- PostgreSQL
pg = pytest.mark.skipif(not os.environ.get("POSTGRES_HOST"), reason="sin PostgreSQL")


def respuesta():
    return Respuesta(cuerpo=b"{}", http_status=200, duracion_ms=100, bytes=2, intentos=1, datos={"features": []})


async def _escenario(prueba):
    async with await psycopg.AsyncConnection.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
        async with conn.transaction(force_rollback=True):
            await prueba(conn)


def ejecutar(prueba):
    asyncio.run(_escenario(prueba))


async def fijar_ultima(conn, instante):
    await conn.execute("UPDATE live.estado_ingesta SET ultima_consulta_ok_at = %s WHERE id = 1", (instante,))


async def huecos_2031(conn):
    cur = await conn.execute("SELECT inicio, fin, estado FROM live.hueco WHERE inicio >= '2031-01-01' AND inicio < '2032-01-01' ORDER BY inicio")
    return await cur.fetchall()


async def registrar(conn, margen, ahora=AHORA):
    ms = int(ahora.timestamp() * 1000) - 100  # la consulta "termina" en `ahora`
    await RepositorioProductor(conn, margen).registrar_ok(ms, respuesta(), 0, "h", None)


@pg
def test_mas_de_24_h_sin_consulta_anota_el_hueco_y_actualiza_el_estado():
    async def prueba(conn):
        await fijar_ultima(conn, AHORA - 30 * H)
        await registrar(conn, 3600)
        assert await huecos_2031(conn) == [(AHORA - 31 * H, AHORA - 23 * H, "pendiente")]
        ultima = (await (await conn.execute("SELECT ultima_consulta_ok_at FROM live.estado_ingesta WHERE id = 1")).fetchone())[0]
        assert ultima == AHORA  # el estado se actualiza después de detectar

    ejecutar(prueba)


@pg
def test_hasta_el_umbral_no_se_anota_nada_y_tampoco_en_la_siguiente_consulta_normal():
    async def prueba(conn):
        await fijar_ultima(conn, AHORA - 23 * H)  # exactamente 24 h − margen
        await registrar(conn, 3600)
        assert await huecos_2031(conn) == []
        await registrar(conn, 3600, AHORA + timedelta(minutes=1))  # funcionamiento normal: ciclos de 60 s
        assert await huecos_2031(conn) == []

    ejecutar(prueba)


@pg
def test_repetir_el_mismo_intervalo_no_duplica_el_hueco():
    async def prueba(conn):
        repo = RepositorioProductor(conn, 3600)
        await fijar_ultima(conn, AHORA - 30 * H)
        await repo._anotar_hueco(AHORA)
        await repo._anotar_hueco(AHORA)  # mismo (inicio, fin): UNIQUE + ON CONFLICT DO NOTHING
        assert len(await huecos_2031(conn)) == 1

    ejecutar(prueba)


@pg
def test_sin_consulta_correcta_previa_no_hay_hueco():
    async def prueba(conn):
        await fijar_ultima(conn, None)
        await registrar(conn, 3600)
        assert await huecos_2031(conn) == []

    ejecutar(prueba)


@pg
def test_en_modo_seco_no_se_anota_ningun_hueco():
    async def prueba(conn):
        await fijar_ultima(conn, AHORA - 100 * H)
        await registrar(conn, None)  # margen None = detección desactivada (modo seco)
        assert await huecos_2031(conn) == []

    ejecutar(prueba)


@pg
def test_margen_cero_en_la_base_respeta_el_check_fin_mayor_que_inicio():
    async def prueba(conn):
        await fijar_ultima(conn, AHORA - 24 * H - timedelta(seconds=1))
        await registrar(conn, 0)
        assert await huecos_2031(conn) == [(AHORA - 24 * H - timedelta(seconds=1), AHORA - 24 * H, "pendiente")]

    ejecutar(prueba)


@pg
def test_la_base_rechaza_un_intervalo_vacio_o_un_estado_invalido():
    async def prueba(conn):
        for sql in ("INSERT INTO live.hueco (inicio, fin) VALUES ('2031-01-02', '2031-01-02')",
                    "INSERT INTO live.hueco (inicio, fin, estado) VALUES ('2031-01-01', '2031-01-02', 'otro')"):
            with pytest.raises(psycopg.errors.CheckViolation):
                async with conn.transaction():  # el punto de guardado se revierte al fallar y la transacción de la prueba sigue viva
                    await conn.execute(sql)

    ejecutar(prueba)


def test_el_margen_se_lee_de_la_configuracion(monkeypatch):
    monkeypatch.delenv("HUECO_MARGEN_S", raising=False)
    assert ConfigIngesta.desde_entorno().hueco_margen_s == 21600  # 6 h por defecto
    monkeypatch.setenv("HUECO_MARGEN_S", "0")
    assert ConfigIngesta.desde_entorno().hueco_margen_s == 0
    monkeypatch.setenv("HUECO_MARGEN_S", "-5")
    with pytest.raises(Exception, match="HUECO_MARGEN_S"):
        ConfigIngesta.desde_entorno()
