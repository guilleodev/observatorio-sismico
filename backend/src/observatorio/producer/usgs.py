"""Consulta HTTP al feed de USGS con reintentos de espera progresiva (research R-002 y R-003).

Solo usa la biblioteca estándar y no conoce Kafka ni PostgreSQL, de modo que se puede probar con un servidor local.
"""

import asyncio
import http.client
import json
import socket
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

USER_AGENT = "observatorio-sismico/1.0 (proyecto academico de Big Data)"
ESPERAS_S = (5, 10, 20)  # espera progresiva entre reintentos
RETRY_AFTER_MAX_S = 60


class ErrorUsgs(Exception):
    """La consulta no obtuvo una respuesta utilizable (después de los reintentos, si los hubo)."""

    def __init__(self, mensaje: str, http_status: int | None = None, intentos: int = 1,
                 reintentable: bool = True, retry_after: int | None = None):
        super().__init__(mensaje)
        self.http_status = http_status
        self.intentos = intentos
        self.reintentable = reintentable
        self.retry_after = retry_after


@dataclass(frozen=True)
class Respuesta:
    cuerpo: bytes
    http_status: int
    duracion_ms: int
    bytes: int
    intentos: int
    datos: dict


def _retry_after(valor: str | None) -> int | None:
    """Solo se admite la forma en segundos; una fecha HTTP se ignora y se usa la espera progresiva."""
    try:
        return max(0, int(valor)) if valor is not None else None
    except ValueError:
        return None


def _obtener_una_vez(url: str, timeout_s: float) -> tuple[int, bytes]:
    peticion = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(peticion, timeout=timeout_s) as respuesta:
            return respuesta.status, respuesta.read()
    except urllib.error.HTTPError as exc:
        raise ErrorUsgs(f"HTTP {exc.code}", http_status=exc.code,
                        reintentable=exc.code == 429 or exc.code >= 500,
                        retry_after=_retry_after(exc.headers.get("Retry-After"))) from None
    except (TimeoutError, socket.timeout):
        raise ErrorUsgs("tiempo agotado") from None
    except urllib.error.URLError as exc:
        if isinstance(exc.reason, (TimeoutError, socket.timeout)):
            raise ErrorUsgs("tiempo agotado") from None
        raise ErrorUsgs(f"error de red: {exc.reason}") from None
    except (OSError, http.client.HTTPException) as exc:
        raise ErrorUsgs(f"error de red: {exc}") from None


def _interpretar(cuerpo: bytes, estado: int) -> dict:
    try:
        datos = json.loads(cuerpo)
    except ValueError:  # JSONDecodeError y UnicodeDecodeError
        raise ErrorUsgs("el cuerpo no es JSON válido", http_status=estado) from None
    if not isinstance(datos, dict) or datos.get("type") != "FeatureCollection" or not isinstance(datos.get("features"), list):
        raise ErrorUsgs("JSON sin FeatureCollection con lista de features", http_status=estado)
    return datos


async def consultar(url: str, timeout_s: float, max_reintentos: int, esperas=ESPERAS_S,
                    dormir=asyncio.sleep, obtener=_obtener_una_vez) -> Respuesta:
    """Hasta `1 + max_reintentos` intentos. Un 4xx distinto de 429 no se reintenta; con 429 se respeta Retry-After."""
    inicio = time.monotonic()
    intentos = 0
    while True:
        intentos += 1
        try:
            estado, cuerpo = await asyncio.wait_for(asyncio.to_thread(obtener, url, timeout_s), timeout_s + 1)
            datos = _interpretar(cuerpo, estado)
            return Respuesta(cuerpo=cuerpo, http_status=estado, duracion_ms=int((time.monotonic() - inicio) * 1000),
                             bytes=len(cuerpo), intentos=intentos, datos=datos)
        except asyncio.TimeoutError:
            error = ErrorUsgs("tiempo agotado")
        except ErrorUsgs as exc:
            error = exc
        error.intentos = intentos
        if not error.reintentable or intentos > max_reintentos:
            raise error
        espera = error.retry_after if error.retry_after is not None else esperas[min(intentos - 1, len(esperas) - 1)]
        await dormir(min(espera, RETRY_AFTER_MAX_S))
