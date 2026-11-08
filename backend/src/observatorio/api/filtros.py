"""Filtros de la API (F5, paso 5.1): análisis, validación y cláusula SQL parametrizada COMPARTIDA.

`/api/eventos` y `/api/estadisticas` usan exactamente este módulo, de modo que sus filtros no pueden desviarse (R-001). Todo error de
parámetro es `ErrorParametro` (la API responde 422); nada se ignora ni se recorta en silencio.
"""

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

SIN_PAIS = "sin_pais"  # valor reservado de country_id (DF7a): no puede coincidir con un ADM0_A3
VENTANA_DEFECTO = timedelta(hours=24)
PARAMETROS_FILTRO = ("start", "end", "min_mag", "country_id")
_EPOCA = datetime(1970, 1, 1, tzinfo=timezone.utc)
_ANIO_MIN, _ANIO_MAX = 1970, 2100
_OFFSET_MAX = 2_000_000_000


class ErrorParametro(ValueError):
    """Un parámetro de la petición no es válido: 422 con `{error, detail}`."""


def a_ms(instante: datetime) -> int:
    """Milisegundos Unix UTC (truncado), como exige el contrato."""
    return (instante - _EPOCA) // timedelta(milliseconds=1)


def desde_ms(ms: int) -> datetime:
    return _EPOCA + timedelta(milliseconds=ms)


def _fecha(nombre: str, texto: str) -> datetime:
    if not texto.strip():
        raise ErrorParametro(f"{nombre} no puede estar vacío")
    try:
        instante = datetime.fromisoformat(texto.strip())
    except ValueError:
        raise ErrorParametro(
            f"{nombre} debe ser una fecha ISO 8601 (p. ej. 2026-11-01T00:00:00Z); recibido {texto!r}. "
            "Si lleva un desplazamiento horario con «+», codifíquelo como %2B") from None
    if instante.tzinfo is None:
        instante = instante.replace(tzinfo=timezone.utc)  # sin zona = UTC (documentado)
    instante = instante.astimezone(timezone.utc)
    if not _ANIO_MIN <= instante.year <= _ANIO_MAX:
        raise ErrorParametro(f"{nombre} fuera de rango razonable ({_ANIO_MIN}-{_ANIO_MAX}): {texto!r}")
    return instante


def _magnitud(texto: str) -> Decimal:
    try:
        valor = Decimal(texto.strip())
    except InvalidOperation:
        raise ErrorParametro(f"min_mag debe ser un número finito, no {texto!r}") from None
    if not valor.is_finite() or not math.isfinite(float(valor)):
        raise ErrorParametro(f"min_mag debe ser un número finito, no {texto!r}")
    return valor


def _pais(texto: str) -> str:
    codigo = texto.strip()
    if not codigo:
        raise ErrorParametro("country_id no puede estar vacío")
    return SIN_PAIS if codigo.lower() == SIN_PAIS else codigo.upper()


@dataclass(frozen=True)
class Filtros:
    """Periodo `[start, end)` UTC ya resuelto, magnitud mínima y ámbito geográfico (`ADM0_A3` o `sin_pais`)."""

    start: datetime
    end: datetime
    min_mag: Decimal | None = None
    country_id: str | None = None

    @classmethod
    def desde_parametros(cls, generado_ms: int, start: str | None = None, end: str | None = None,
                         min_mag: str | None = None, country_id: str | None = None) -> "Filtros":
        """Resuelve los valores por defecto con el instante `generated` de la API: `end = generated`, `start = end − 24 h`."""
        fin = _fecha("end", end) if end is not None else desde_ms(generado_ms)
        inicio = _fecha("start", start) if start is not None else fin - VENTANA_DEFECTO
        if inicio >= fin:
            raise ErrorParametro(f"start debe ser anterior a end (start={inicio.isoformat()}, end={fin.isoformat()})")
        return cls(
            start=inicio, end=fin,
            min_mag=_magnitud(min_mag) if min_mag is not None else None,
            country_id=_pais(country_id) if country_id is not None else None,
        )

    @property
    def periodo(self) -> dict:
        return {"start": a_ms(self.start), "end": a_ms(self.end)}

    def donde(self, con_magnitud: bool = True) -> tuple[str, dict]:
        """Cláusula WHERE sobre `live.evento_actual` (sin retirados) y sus parámetros con nombre. Ningún valor se concatena."""
        condiciones = ["event_time >= %(f_start)s", "event_time < %(f_end)s", "NOT retirado"]
        parametros: dict = {"f_start": self.start, "f_end": self.end}
        if con_magnitud and self.min_mag is not None:
            condiciones.append("mag >= %(f_min_mag)s")  # la magnitud nula no cumple el umbral (NULL >= x no es verdadero)
            parametros["f_min_mag"] = self.min_mag
        if self.country_id == SIN_PAIS:
            condiciones.append("geo_resultado = 'sin_pais'")  # no basta country_id IS NULL: incluiría eventos aún sin asignar
        elif self.country_id is not None:
            condiciones.append("country_id = %(f_country)s")
            parametros["f_country"] = self.country_id
        return " AND ".join(condiciones), parametros


def paginacion(limit: str | None, offset: str | None, maximo: int) -> tuple[int, int]:
    """`limit` (1..maximo, por defecto el máximo) y `offset` (>= 0). Fuera de rango es un error, nunca se recorta."""
    def entero(nombre: str, texto: str) -> int:
        try:
            return int(texto.strip())
        except ValueError:
            raise ErrorParametro(f"{nombre} debe ser un entero, no {texto!r}") from None

    lim = maximo if limit is None else entero("limit", limit)
    if not 1 <= lim <= maximo:
        raise ErrorParametro(f"limit debe estar entre 1 y {maximo} (máximo documentado de la API), no {lim}")
    desplazamiento = 0 if offset is None else entero("offset", offset)
    if not 0 <= desplazamiento <= _OFFSET_MAX:
        raise ErrorParametro(f"offset debe estar entre 0 y {_OFFSET_MAX}, no {desplazamiento}")
    return lim, desplazamiento
