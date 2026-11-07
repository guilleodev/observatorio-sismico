"""Servidor HTTP local que imita el catálogo FDSN de USGS (`count` y `query`) para las pruebas del histórico (F4).

Reproduce lo relevante del servicio real: `endtime` INCLUSIVO, filtro por magnitud mínima, límite de resultados (400 si se supera),
204 sin cuerpo cuando no hay resultados y `count` en JSON. Permite programar fallos (429, 5xx, JSON roto) para las siguientes peticiones
y registra todas las peticiones recibidas. Los ids empiezan por `prueba-` y no se escribe nada fuera de memoria.
"""

import json
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

LIMITE_REAL = 20000


def crear_feature(identificador, tiempo_ms, mag=4.5, lon=-3.7, lat=40.4, prof=10.0, updated_ms=None, tipo="earthquake"):
    return {
        "type": "Feature", "id": identificador,
        "geometry": {"type": "Point", "coordinates": [lon, lat, prof]},
        "properties": {"type": tipo, "mag": mag, "magType": "mb", "place": f"lugar de {identificador}",
                       "time": tiempo_ms, "updated": tiempo_ms if updated_ms is None else updated_ms},
    }


def ms(texto: str) -> int:
    """Texto ISO sin zona (p. ej. 2025-03-01T00:00:00), interpretado en UTC -> ms Unix."""
    return int(datetime.fromisoformat(texto).replace(tzinfo=timezone.utc).timestamp() * 1000)


class ServidorFdsn:
    def __init__(self, entradas, maximo=LIMITE_REAL):
        """`entradas`: lista de (tiempo_ms, feature). El tiempo se separa del feature para poder servir features rotos."""
        self.entradas = list(entradas)
        self.maximo = maximo
        self.peticiones = []  # rutas completas recibidas
        self.guion = []  # fallos programados: (estado, cabeceras, cuerpo) para las siguientes peticiones
        self.cuerpo_roto = None
        self.retraso_s = 0.0  # espera antes de responder a cada `query` (permite interrumpir la carga a mitad en los ensayos)
        self.caer_tras = None  # si es un entero, tras ese número de consultas `query` las siguientes devuelven 503 (simula una caída)
        self._servidor = ThreadingHTTPServer(("127.0.0.1", 0), self._manejador())
        self._hilo = threading.Thread(target=self._servidor.serve_forever, daemon=True)

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self._servidor.server_address[1]}/fdsnws/event/1/"

    def __enter__(self):
        self._hilo.start()
        return self

    def __exit__(self, *exc):
        self._servidor.shutdown()
        self._servidor.server_close()

    def contar_peticiones(self, operacion=None) -> int:
        return sum(1 for p in self.peticiones if operacion is None or f"/{operacion}?" in p)

    def _seleccionar(self, consulta):
        desde, hasta = ms(consulta["starttime"][0]), ms(consulta["endtime"][0])
        minimo = float(consulta["minmagnitude"][0]) if "minmagnitude" in consulta else None  # sin parámetro = sin filtro de magnitud
        elegidos = [(t, f) for t, f in self.entradas if desde <= t <= hasta  # endtime inclusivo, como USGS
                    and (minimo is None or f.get("properties", {}).get("mag") is None or f["properties"]["mag"] >= minimo)]
        return [f for _, f in sorted(elegidos, key=lambda x: x[0])]

    def _manejador(self):
        servidor = self

        class Manejador(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _responder(self, estado, cuerpo=b"", cabeceras=None):
                self.send_response(estado)
                for k, v in (cabeceras or {}).items():
                    self.send_header(k, v)
                self.send_header("Content-Length", str(len(cuerpo)))
                self.end_headers()
                self.wfile.write(cuerpo)

            def do_GET(self):
                servidor.peticiones.append(self.path)
                if servidor.guion:
                    estado, cabeceras, cuerpo = servidor.guion.pop(0)
                    return self._responder(estado, cuerpo, cabeceras)
                url = urlparse(self.path)
                consulta = parse_qs(url.query)
                elegidos = servidor._seleccionar(consulta)
                if url.path.endswith("/count"):
                    return self._responder(200, json.dumps({"count": len(elegidos), "maxAllowed": servidor.maximo}).encode())
                if servidor.retraso_s:
                    time.sleep(servidor.retraso_s)
                if servidor.caer_tras is not None and servidor.contar_peticiones("query") > servidor.caer_tras:
                    return self._responder(503)
                if len(elegidos) > servidor.maximo:
                    return self._responder(400, b"Error 400: exceeds search limit")
                if not elegidos:
                    return self._responder(204)
                if servidor.cuerpo_roto is not None:
                    return self._responder(200, servidor.cuerpo_roto)
                cuerpo = json.dumps({"type": "FeatureCollection", "metadata": {"count": len(elegidos)}, "features": elegidos}).encode()
                self._responder(200, cuerpo)

        return Manejador
