"""Cliente del catálogo FDSN de USGS (F4, paso 4.4; research R-006). Solo biblioteca estándar; no conoce PostgreSQL.

Cada consulta lleva todos sus parámetros en la URL (y en el mismo orden), así que la misma consulta produce la misma URL y queda registrada
tal cual. Los reintentos son los de F3: 429 con `Retry-After`, 5xx y errores de red con espera progresiva; un 4xx distinto de 429 no se reintenta.
El cliente cuenta las peticiones HTTP realmente enviadas (`peticiones_http`): es la prueba de que una segunda carga no consulta a USGS (SC-007).
"""

import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlencode

from observatorio.producer.usgs import ESPERAS_S, RETRY_AFTER_MAX_S, ErrorUsgs, _obtener_una_vez

ErrorFdsn = ErrorUsgs  # misma clase de error que el feed en vivo: mensaje, http_status, intentos, reintentable, retry_after


@dataclass(frozen=True)
class Descarga:
    cuerpo: bytes  # respuesta original, sin transformar
    datos: dict  # FeatureCollection ya interpretada
    url: str
    http_status: int
    intentos: int


def _iso(instante: datetime) -> str:
    return instante.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")  # USGS interpreta la hora sin zona como UTC


class ClienteFdsn:
    def __init__(self, url_base: str, timeout_s: float = 60, max_reintentos: int = 3, esperas=ESPERAS_S,
                 dormir=time.sleep, obtener=_obtener_una_vez):
        self.url_base = url_base if url_base.endswith("/") else url_base + "/"
        self.timeout_s = timeout_s
        self.max_reintentos = max_reintentos
        self.esperas = esperas
        self._dormir = dormir
        self._obtener = obtener
        self.peticiones_http = 0

    def url(self, operacion: str, inicio: datetime, fin: datetime, mag_min: float | None) -> str:
        """`operacion`: 'count' o 'query'. `fin` es inclusivo en el servicio; el cargador lo tiene en cuenta.

        `mag_min=None` consulta SIN filtro de magnitud ni de tipo (la recuperación de huecos iguala así al feed, que no filtra)."""
        parametros = [("format", "geojson"), ("starttime", _iso(inicio)), ("endtime", _iso(fin))]
        if mag_min is not None:
            parametros += [("minmagnitude", f"{mag_min:g}"), ("eventtype", "earthquake")]
        if operacion == "query":
            parametros.append(("orderby", "time-asc"))
        return f"{self.url_base}{operacion}?{urlencode(parametros)}"

    def _pedir(self, url: str) -> tuple[int, bytes, int]:
        """Hasta `1 + max_reintentos` intentos. Devuelve (estado, cuerpo, intentos)."""
        intentos = 0
        while True:
            intentos += 1
            self.peticiones_http += 1
            try:
                estado, cuerpo = self._obtener(url, self.timeout_s)
                return estado, cuerpo, intentos
            except ErrorFdsn as exc:
                error = exc
            error.intentos = intentos
            if not error.reintentable or intentos > self.max_reintentos:
                raise error
            espera = error.retry_after if error.retry_after is not None else self.esperas[min(intentos - 1, len(self.esperas) - 1)]
            self._dormir(min(espera, RETRY_AFTER_MAX_S))

    def contar(self, inicio: datetime, fin: datetime, mag_min: float | None) -> int:
        """Recuento de eventos del tramo según USGS (modo de solo recuento: no descarga datos)."""
        estado, cuerpo, intentos = self._pedir(self.url("count", inicio, fin, mag_min))
        try:
            datos = json.loads(cuerpo)
            cuenta = datos["count"]
        except (ValueError, KeyError, TypeError):
            raise ErrorFdsn("la respuesta de count no es un JSON con el campo count", http_status=estado, intentos=intentos) from None
        if isinstance(cuenta, bool) or not isinstance(cuenta, int) or cuenta < 0:
            raise ErrorFdsn(f"count no es un entero no negativo: {cuenta!r}", http_status=estado, intentos=intentos)
        return cuenta

    def descargar(self, inicio: datetime, fin: datetime, mag_min: float | None) -> Descarga:
        url = self.url("query", inicio, fin, mag_min)
        estado, cuerpo, intentos = self._pedir(url)
        try:
            datos = json.loads(cuerpo)
        except ValueError:
            raise ErrorFdsn("el cuerpo no es JSON válido", http_status=estado, intentos=intentos) from None
        if not isinstance(datos, dict) or datos.get("type") != "FeatureCollection" or not isinstance(datos.get("features"), list):
            raise ErrorFdsn("JSON sin FeatureCollection con lista de features", http_status=estado, intentos=intentos)
        return Descarga(cuerpo=cuerpo, datos=datos, url=url, http_status=estado, intentos=intentos)
