"""F8: segunda fuente (EMSC). Adaptador puro: traducción al formato del feed de USGS, consulta incremental y manejo del «sin datos» de FDSN.

Los ejemplos reproducen la forma REAL de la respuesta de EMSC observada el 2026-11-16 (docs/evidencias/f8/): `coordinates[2]` negativa, `time` y `lastupdate` en texto ISO,
`evtype` `ke` (terremoto conocido) o `ue` (desconocido), `flynn_region` en mayúsculas.
"""

import asyncio
import json
from datetime import datetime, timedelta, timezone

import pytest

from observatorio.consumer.mensaje import clasificar_mensaje
from observatorio.producer import emsc
from observatorio.producer.emsc import PREFIJO_ID, VACIO, adaptar, construir_url, ventana_consulta
from observatorio.producer.ingesta import mensaje_kafka

BASE = "https://www.seismicportal.eu/fdsnws/event/1/query"


def emsc_feature(**cambios):
    propiedades = {"source_id": "2090703", "source_catalog": "EMSC-RTS", "lastupdate": "2026-11-16T17:07:42.804368Z", "time": "2026-11-16T16:56:18.22Z",
                   "flynn_region": "CENTRAL TURKEY", "lat": 40.8572, "lon": 34.761, "depth": 7, "evtype": "ke", "auth": "AFAD", "mag": 2.3, "magtype": "ML",
                   "unid": "20261116_0000233"}
    propiedades.update(cambios)
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [34.761, 40.8572, -7]}, "id": "20261116_0000233", "properties": propiedades}


# --- traducción -------------------------------------------------------------------------------------------------------------

def test_el_evento_adaptado_tiene_la_forma_del_feed_de_usgs():
    f = adaptar(emsc_feature())
    assert f["type"] == "Feature" and f["id"] == "emsc:20261116_0000233" and f["id"].startswith(PREFIJO_ID)
    assert f["geometry"] == {"type": "Point", "coordinates": [34.761, 40.8572, 7]}      # profundidad POSITIVA en km (EMSC da −7 en la tercera coordenada)
    p = f["properties"]
    assert p["mag"] == 2.3 and p["magType"] == "ml" and p["place"] == "Central Turkey" and p["type"] == "earthquake" and p["net"] == "AFAD"
    assert p["time"] == 1_794_848_178_220 and p["updated"] == 1_794_848_862_804           # texto ISO UTC → milisegundos Unix (fracciones de longitud variable)
    assert isinstance(p["time"], int) and isinstance(p["updated"], int)


def test_el_evento_original_viaja_integro_para_trazabilidad():
    original = emsc_feature()
    assert adaptar(original)["emsc_original"] == original


@pytest.mark.parametrize("tipo, esperado", [("ke", "earthquake"), ("ue", "ue"), ("km", "km"), (None, "unknown"), ("", "unknown")])
def test_solo_ke_es_terremoto_el_resto_conserva_su_tipo_para_que_el_consumidor_lo_excluya_con_motivo(tipo, esperado):
    assert adaptar(emsc_feature(evtype=tipo))["properties"]["type"] == esperado


def test_la_hora_en_distintos_formatos_iso():
    for texto, ms in (("2026-11-16T16:56:18Z", 1_794_848_178_000), ("2026-11-16T16:56:18.220000Z", 1_794_848_178_220), ("2026-11-16T16:56:18", 1_794_848_178_000)):
        assert adaptar(emsc_feature(time=texto))["properties"]["time"] == ms


@pytest.mark.parametrize("malo", [None, "no es una fecha", 12345, ""])
def test_una_hora_ilegible_queda_nula_no_se_inventa(malo):
    assert adaptar(emsc_feature(time=malo))["properties"]["time"] is None


def test_sin_profundidad_ni_magnitud_se_conservan_nulas():
    f = adaptar(emsc_feature(depth=None, mag=None, magtype=None))
    assert f["geometry"]["coordinates"][2] is None and f["properties"]["mag"] is None and f["properties"]["magType"] is None


def test_el_evento_sin_estructura_no_revienta_y_queda_para_cuarentena():
    for basura in (None, 5, "x", [], {"properties": None}, {"id": "a"}):
        f = adaptar(basura)
        assert f["id"] is None and f["properties"] is None and f["emsc_original"] == basura


def test_sin_unid_se_usa_el_id_del_feature_y_sin_ninguno_el_id_queda_nulo():
    assert adaptar(emsc_feature(unid=None))["id"] == "emsc:20261116_0000233"
    sin = emsc_feature(unid=None); sin["id"] = None
    assert adaptar(sin)["id"] is None


# --- el consumidor existente lo trata sin cambios ---------------------------------------------------------------------------

def mensaje(feature, source="emsc-fdsn"):
    return json.dumps(mensaje_kafka(adaptar(feature), 1_794_848_900_000, source), ensure_ascii=False).encode("utf-8")


def test_un_terremoto_de_emsc_es_valido_para_el_consumidor_y_conserva_su_source_y_su_original():
    c = clasificar_mensaje(mensaje(emsc_feature()))
    assert c.estado == "valido"
    e = c.evento
    assert (e.event_id, e.source, e.mode) == ("emsc:20261116_0000233", "emsc-fdsn", "live")
    assert (e.mag, e.mag_type, e.depth_km, e.longitude, e.latitude, e.place) == (2.3, "ml", 7.0, 34.761, 40.8572, "Central Turkey")
    assert e.raw["emsc_original"]["properties"]["unid"] == "20261116_0000233"           # el original queda en `raw`


def test_un_evento_que_no_es_terremoto_va_a_cuarentena_con_motivo_no_se_descarta_en_silencio():
    c = clasificar_mensaje(mensaje(emsc_feature(evtype="km")))
    assert c.estado == "excluido" and "no sísmico" in c.motivo and "km" in c.motivo


def test_coordenadas_o_hora_invalidas_van_a_cuarentena_invalido():
    assert clasificar_mensaje(mensaje(emsc_feature(time="???"))).estado == "invalido"
    malo = emsc_feature(); malo["geometry"]["coordinates"] = [999, 40, -7]
    assert clasificar_mensaje(mensaje(malo)).estado == "invalido"


def test_el_mismo_mensaje_con_otro_source_no_autorizado_se_descarta():
    assert clasificar_mensaje(mensaje(emsc_feature(), source="emsc")).estado == "descartado"


# --- consulta incremental ---------------------------------------------------------------------------------------------------

AHORA = datetime(2026, 11, 16, 18, 0, 0, tzinfo=timezone.utc)


def test_primera_consulta_sin_marca_pide_las_ultimas_horas_por_hora_del_evento():
    v = ventana_consulta(None, AHORA, ventana_inicial_h=24, ventana_max_dias=7, margen_s=120)
    assert v == {"desde_evento": AHORA - timedelta(hours=24)}
    url, descripcion = construir_url(BASE, mag_min=2.0, limite=20000, **v)
    assert url == f"{BASE}?format=json&minmag=2&limit=20000&orderby=time&start=2026-11-15T18:00:00" and descripcion == "start=2026-11-15T18:00:00"


def test_con_marca_pide_lo_actualizado_desde_la_marca_menos_el_margen():
    marca = AHORA - timedelta(minutes=1)
    v = ventana_consulta(marca, AHORA, ventana_inicial_h=24, ventana_max_dias=7, margen_s=120)
    assert v == {"desde_actualizacion": marca - timedelta(seconds=120)}
    url, descripcion = construir_url(BASE, mag_min=2.5, limite=100, **v)
    assert "updatedafter=2026-11-16T17:57:00" in url and "minmag=2.5" in url and descripcion == "updatedafter=2026-11-16T17:57:00"


def test_tras_una_parada_larga_la_marca_no_se_retrasa_mas_del_tope():
    marca = AHORA - timedelta(days=30)
    v = ventana_consulta(marca, AHORA, ventana_inicial_h=24, ventana_max_dias=7, margen_s=120)
    assert v == {"desde_actualizacion": AHORA - timedelta(days=7)}


def test_se_exige_exactamente_un_tipo_de_ventana():
    with pytest.raises(ValueError):
        construir_url(BASE, mag_min=2, limite=10)
    with pytest.raises(ValueError):
        construir_url(BASE, mag_min=2, limite=10, desde_actualizacion=AHORA, desde_evento=AHORA)


# --- «sin datos» de FDSN y errores ------------------------------------------------------------------------------------------

def test_el_204_sin_datos_es_una_respuesta_correcta_y_vacia_no_un_error():
    llamadas = []

    def obtener(url, timeout):
        llamadas.append(url)
        return 204, b""

    r = asyncio.run(emsc.consultar("https://ejemplo.invalido/q", 5, 3, obtener=lambda u, t: _como_emsc(obtener, u, t)))
    assert r.datos == {"type": "FeatureCollection", "features": []} and len(llamadas) == 1 and r.intentos == 1


def _como_emsc(obtener, url, timeout):
    estado, cuerpo = obtener(url, timeout)
    return (estado, VACIO) if estado == 204 or not cuerpo.strip() else (estado, cuerpo)


def test_obtener_emsc_convierte_el_204_en_coleccion_vacia(monkeypatch):
    monkeypatch.setattr(emsc.usgs, "_obtener_una_vez", lambda url, t: (204, b""))
    assert emsc._obtener_emsc("u", 5) == (204, VACIO)
    monkeypatch.setattr(emsc.usgs, "_obtener_una_vez", lambda url, t: (200, b"  "))
    assert emsc._obtener_emsc("u", 5) == (200, VACIO)
    monkeypatch.setattr(emsc.usgs, "_obtener_una_vez", lambda url, t: (200, b'{"type":"FeatureCollection","features":[1]}'))
    assert emsc._obtener_emsc("u", 5)[1] == b'{"type":"FeatureCollection","features":[1]}'


def test_un_error_http_se_reintenta_como_en_usgs_y_se_propaga_al_agotarse():
    intentos = []

    def obtener(url, timeout):
        intentos.append(1)
        raise emsc.ErrorEmsc("HTTP 503", http_status=503, reintentable=True)

    async def sin_espera(_s):
        return None

    with pytest.raises(emsc.ErrorEmsc) as e:
        asyncio.run(emsc.consultar("u", 5, 2, obtener=obtener, dormir=sin_espera))
    assert len(intentos) == 3 and e.value.http_status == 503
