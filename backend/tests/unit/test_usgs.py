"""Consulta a USGS: reintentos y errores, contra un servidor HTTP local (sin Kafka ni PostgreSQL)."""

import asyncio
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from observatorio.producer.usgs import ErrorUsgs, consultar

FEED = {"type": "FeatureCollection", "metadata": {"generated": 1}, "features": [{"id": "a", "properties": {}}]}


class ServidorSimulado:
    """Responde en orden a las peticiones según un guion de (estado, cuerpo, cabeceras, retraso_s)."""

    def __init__(self, guion):
        self.guion, self.peticiones = list(guion), 0
        guion_ref, servidor = self.guion, self

        class Manejador(BaseHTTPRequestHandler):
            def do_GET(self):
                servidor.peticiones += 1
                estado, cuerpo, cabeceras, retraso = guion_ref[min(servidor.peticiones, len(guion_ref)) - 1]
                if retraso:
                    threading.Event().wait(retraso)
                try:
                    self.send_response(estado)
                    for clave, valor in cabeceras.items():
                        self.send_header(clave, valor)
                    self.send_header("Content-Length", str(len(cuerpo)))
                    self.end_headers()
                    self.wfile.write(cuerpo)
                except OSError:  # el cliente ya cerró (tiempo agotado)
                    pass

            def log_message(self, *args):
                pass

        self.http = ThreadingHTTPServer(("127.0.0.1", 0), Manejador)
        self.url = f"http://127.0.0.1:{self.http.server_port}/feed"
        threading.Thread(target=self.http.serve_forever, daemon=True).start()

    def cerrar(self):
        self.http.shutdown()
        self.http.server_close()


@pytest.fixture
def servidor():
    creados = []

    def crear(guion):
        s = ServidorSimulado(guion)
        creados.append(s)
        return s

    yield crear
    for s in creados:
        s.cerrar()


def ok():
    return (200, json.dumps(FEED).encode(), {"Content-Type": "application/json"}, 0)


async def consultar_con_esperas(url, **kwargs):
    esperas = []

    async def dormir(segundos):
        esperas.append(segundos)

    kwargs.setdefault("timeout_s", 2)
    resp = await consultar(url, max_reintentos=3, dormir=dormir, **kwargs)
    return resp, esperas


def ejecutar(url, **kwargs):
    return asyncio.run(consultar_con_esperas(url, **kwargs))


def ejecutar_error(url, **kwargs):
    async def rutina():
        esperas = []

        async def dormir(segundos):
            esperas.append(segundos)

        with pytest.raises(ErrorUsgs) as info:
            await consultar(url, timeout_s=kwargs.pop("timeout_s", 2), max_reintentos=3, dormir=dormir, **kwargs)
        return info.value, esperas

    return asyncio.run(rutina())


def test_respuesta_correcta(servidor):
    s = servidor([ok()])
    resp, esperas = ejecutar(s.url)
    assert resp.http_status == 200 and resp.intentos == 1 and esperas == []
    assert resp.datos["features"][0]["id"] == "a" and resp.bytes == len(resp.cuerpo) > 0
    assert resp.duracion_ms >= 0


def test_503_se_reintenta_con_espera_progresiva_y_se_recupera(servidor):
    s = servidor([(503, b"x", {}, 0), (503, b"x", {}, 0), ok()])
    resp, esperas = ejecutar(s.url)
    assert resp.intentos == 3 and esperas == [5, 10] and s.peticiones == 3


def test_503_persistente_agota_los_reintentos(servidor):
    s = servidor([(503, b"x", {}, 0)])
    error, esperas = ejecutar_error(s.url)
    assert error.http_status == 503 and error.intentos == 4  # 1 + 3 reintentos
    assert esperas == [5, 10, 20] and s.peticiones == 4


def test_429_respeta_retry_after_con_tope_de_60_s(servidor):
    s = servidor([(429, b"x", {"Retry-After": "7"}, 0), (429, b"x", {"Retry-After": "500"}, 0), ok()])
    resp, esperas = ejecutar(s.url)
    assert resp.intentos == 3 and esperas == [7, 60]


def test_429_sin_retry_after_usa_la_espera_progresiva(servidor):
    s = servidor([(429, b"x", {}, 0), ok()])
    _, esperas = ejecutar(s.url)
    assert esperas == [5]


def test_4xx_distinto_de_429_no_se_reintenta(servidor):
    s = servidor([(404, b"no", {}, 0)])
    error, esperas = ejecutar_error(s.url)
    assert error.http_status == 404 and error.intentos == 1 and esperas == [] and s.peticiones == 1


@pytest.mark.parametrize("cuerpo", [b"esto no es json", b"[1, 2]", b'{"type": "Otra"}',
                                    b'{"type": "FeatureCollection"}', b'{"type": "FeatureCollection", "features": 3}'])
def test_cuerpo_invalido_se_reintenta_y_falla_con_motivo(servidor, cuerpo):
    s = servidor([(200, cuerpo, {}, 0)])
    error, esperas = ejecutar_error(s.url)
    assert error.intentos == 4 and esperas == [5, 10, 20] and error.http_status == 200
    assert "JSON" in str(error) or "FeatureCollection" in str(error)


def test_json_invalido_y_luego_correcto(servidor):
    s = servidor([(200, b"<html>", {}, 0), ok()])
    resp, esperas = ejecutar(s.url)
    assert resp.intentos == 2 and esperas == [5]


def test_tiempo_agotado(servidor):
    s = servidor([(200, b"{}", {}, 1.5)])
    error, esperas = ejecutar_error(s.url, timeout_s=0.3)
    assert "tiempo" in str(error).lower() and error.http_status is None and error.intentos == 4


def test_conexion_rechazada(servidor):
    s = servidor([ok()])
    url = s.url
    s.cerrar()  # el puerto ya no escucha
    error, esperas = ejecutar_error(url)
    assert error.http_status is None and error.intentos == 4 and esperas == [5, 10, 20]


def test_sin_reintentos_configurados(servidor):
    s = servidor([(503, b"x", {}, 0)])

    async def rutina():
        esperas = []

        async def dormir(segundos):
            esperas.append(segundos)

        with pytest.raises(ErrorUsgs) as info:
            await consultar(s.url, timeout_s=2, max_reintentos=0, dormir=dormir)
        return info.value, esperas

    error, esperas = asyncio.run(rutina())
    assert error.intentos == 1 and esperas == []
