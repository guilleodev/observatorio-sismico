"""Segunda fuente en vivo (F8): EMSC (Centro Sismológico Europeo-Mediterráneo), servicio FDSN `event` en JSON. Datos CC BY 4.0.

Este módulo NO conoce Kafka ni PostgreSQL. Hace dos cosas:
  · `construir_url`: la consulta INCREMENTAL (`updatedafter`: solo lo creado o revisado desde la última consulta) o, la primera vez, las últimas horas (`start`);
  · `adaptar`: traduce un evento de EMSC a la MISMA forma que el feed de USGS, de modo que el consumidor existente lo valida, versiona y localiza sin cambios.

Diferencias entre los dos formatos que se resuelven aquí (medidas con datos reales, docs/evidencias/f8/):
  · identificador: el de EMSC puede coincidir en forma con otros → se prefija `emsc:` (la clave del evento es única entre fuentes);
  · profundidad: EMSC da `coordinates[2]` NEGATIVA (−7 = 7 km); el contrato usa profundidad positiva en km → se toma `properties.depth`;
  · hora: texto ISO 8601 UTC (`time`, `lastupdate`), no milisegundos Unix → se convierte;
  · tipo: `evtype` (`ke` = terremoto conocido); todo lo demás se publica con ese tipo y el consumidor lo pone en cuarentena como «no sísmico» (nunca se descarta en silencio);
  · lugar: `flynn_region` en MAYÚSCULAS → se presenta como título.
El evento original de EMSC viaja íntegro en `emsc_original` (el consumidor guarda el mensaje completo en `raw`).
"""

import json
from datetime import datetime, timedelta, timezone

from observatorio.producer import usgs
from observatorio.producer.usgs import ErrorUsgs, Respuesta

ErrorEmsc = ErrorUsgs  # mismo manejo de errores HTTP (reintentos, 429, 5xx, tiempo agotado)
TIPO_TERREMOTO_EMSC = "ke"  # «known earthquake». `ue` (desconocido) y el resto no se tratan como terremoto
PREFIJO_ID = "emsc:"
VACIO = b'{"type":"FeatureCollection","features":[]}'
_FORMATO_FECHA = "%Y-%m-%dT%H:%M:%S"
_EPOCA = datetime(1970, 1, 1, tzinfo=timezone.utc)


def _fecha_fdsn(instante: datetime) -> str:
    return instante.astimezone(timezone.utc).strftime(_FORMATO_FECHA)


def construir_url(base: str, *, mag_min: float, limite: int, desde_actualizacion: datetime | None = None,
                  desde_evento: datetime | None = None) -> tuple[str, str]:
    """(URL, descripción del parámetro de ventana). Exactamente uno de `desde_actualizacion` o `desde_evento`."""
    if (desde_actualizacion is None) == (desde_evento is None):
        raise ValueError("hay que indicar exactamente uno de desde_actualizacion o desde_evento")
    if desde_actualizacion is not None:
        ventana = f"updatedafter={_fecha_fdsn(desde_actualizacion)}"
    else:
        ventana = f"start={_fecha_fdsn(desde_evento)}"
    return f"{base}?format=json&minmag={mag_min:g}&limit={limite}&orderby=time&{ventana}", ventana


def ventana_consulta(marca: datetime | None, ahora: datetime, *, ventana_inicial_h: int, ventana_max_dias: int,
                     margen_s: int) -> dict:
    """Qué pedir: sin marca previa, las últimas `ventana_inicial_h` horas por hora del evento; con marca, lo actualizado desde `marca − margen`.

    La marca nunca se retrasa más de `ventana_max_dias` (tras una parada larga se recupera como mucho ese periodo; lo anterior habría que pedirlo a mano).
    """
    if marca is None:
        return {"desde_evento": ahora - timedelta(hours=ventana_inicial_h)}
    return {"desde_actualizacion": max(marca - timedelta(seconds=margen_s), ahora - timedelta(days=ventana_max_dias))}


def _ms(texto) -> int | None:
    """ISO 8601 UTC (con `Z` y fracciones de segundo de longitud variable) → milisegundos Unix; None si no se puede interpretar."""
    if not isinstance(texto, str):
        return None
    try:
        instante = datetime.fromisoformat(texto.strip())
    except ValueError:
        return None
    if instante.tzinfo is None:
        instante = instante.replace(tzinfo=timezone.utc)
    return (instante - _EPOCA) // timedelta(milliseconds=1)  # aritmética ENTERA: con `timestamp() * 1000` un ms puede perderse por el redondeo de coma flotante


def _numero(valor):
    return valor if isinstance(valor, (int, float)) and not isinstance(valor, bool) else None


def adaptar(feature) -> dict:
    """Evento de EMSC → evento con la forma del feed de USGS. Lo que no se puede interpretar se deja como llega para que el consumidor lo ponga en
    cuarentena con motivo (nunca se inventa un valor ni se descarta en silencio)."""
    if not isinstance(feature, dict) or not isinstance(feature.get("properties"), dict):
        return {"type": "Feature", "id": None, "geometry": None, "properties": None, "emsc_original": feature}
    p = feature["properties"]
    unid = p.get("unid") if isinstance(p.get("unid"), str) and p.get("unid") else feature.get("id")
    geometria = feature.get("geometry") if isinstance(feature.get("geometry"), dict) else {}
    coordenadas = geometria.get("coordinates") if isinstance(geometria.get("coordinates"), list) else []
    lon = coordenadas[0] if len(coordenadas) > 0 else p.get("lon")
    lat = coordenadas[1] if len(coordenadas) > 1 else p.get("lat")
    profundidad = _numero(p.get("depth"))  # km positivos; la tercera coordenada de EMSC es negativa
    region = p.get("flynn_region")
    tipo = p.get("evtype")
    return {
        "type": "Feature",
        "id": f"{PREFIJO_ID}{unid}" if isinstance(unid, str) and unid else None,
        "geometry": {"type": "Point", "coordinates": [lon, lat, profundidad]},
        "properties": {
            "mag": _numero(p.get("mag")),
            "magType": p["magtype"].lower() if isinstance(p.get("magtype"), str) else None,
            "place": region.title() if isinstance(region, str) else None,
            "time": _ms(p.get("time")),
            "updated": _ms(p.get("lastupdate")),
            "type": "earthquake" if tipo == TIPO_TERREMOTO_EMSC else (tipo if isinstance(tipo, str) and tipo else "unknown"),
            "net": p.get("auth") if isinstance(p.get("auth"), str) else None,  # agencia que informó el evento (INGV, AFAD, JMA, …)
        },
        "emsc_original": feature,
    }


def _obtener_emsc(url: str, timeout_s: float) -> tuple[int, bytes]:
    """GET con el mismo manejo de errores que USGS; el 204 de FDSN («sin datos») es una respuesta correcta y vacía, no un error."""
    estado, cuerpo = usgs._obtener_una_vez(url, timeout_s)
    if estado == 204 or not cuerpo.strip():
        return estado, VACIO
    return estado, cuerpo


async def consultar(url: str, timeout_s: float, max_reintentos: int, **kwargs) -> Respuesta:
    return await usgs.consultar(url, timeout_s, max_reintentos, obtener=kwargs.pop("obtener", _obtener_emsc), **kwargs)


def features_adaptadas(resp: Respuesta) -> list[dict]:
    return [adaptar(f) for f in resp.datos["features"]]


def a_json(valor) -> bytes:
    return json.dumps(valor, ensure_ascii=False).encode("utf-8")
