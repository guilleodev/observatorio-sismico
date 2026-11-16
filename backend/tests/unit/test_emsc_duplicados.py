"""F8: NO duplicar. Un terremoto que informan USGS y EMSC se ve UNA vez (el de USGS), en /api/eventos, /api/estadisticas y en la comparación.

Con PostgreSQL REAL en una base temporal (esquema `sql/001..003` + `005`). Los eventos son ficticios y nunca tocan las tablas definitivas.
Las cifras de la regla (90 s / 100 km; M ≥ 4,5: 300 s / 300 km y ΔM ≤ 0,6) salen de la validación con 7 días de datos reales (docs/evidencias/f8/).
"""

import os
from datetime import datetime, timezone

import psycopg
import pytest
from fastapi.testclient import TestClient

from fixtures.base_api import SHA, INGESTA, base_temporal, hay_entorno
from observatorio.api.main import crear_app, crear_repositorio
from observatorio.config import ConfigApi

pytestmark = pytest.mark.skipif(not hay_entorno(), reason="sin PostgreSQL")

AHORA = int(datetime(2026, 10, 26, 12, 0, tzinfo=timezone.utc).timestamp() * 1000)
H = 3_600_000
CONFIG = ConfigApi(max_eventos=5000, max_ventana_horas=744, obsoleta_s=300, statement_timeout_s=10, margen_publicacion_s=900, docs_habilitadas=True)


def ms(valor):
    return datetime.fromtimestamp(valor / 1000, tz=timezone.utc)


def poner(c, id_, t_ms, mag, lon, lat, source, retirado=False, pais="ZA1"):
    c.execute(
        "INSERT INTO live.evento_actual (event_id, event_time, updated_at, mag, mag_type, depth_km, longitude, latitude, place, source, mode, ingested_at, "
        "kafka_topic, kafka_partition, kafka_offset, raw, country_id, country_name, geo_resultado, geo_catalogo, retirado) "
        "VALUES (%s, %s, %s, %s, 'ml', 10, %s, %s, 'Lugar', %s, 'live', %s, 't', 0, %s, '{}'::jsonb, %s, 'Pais', 'interior', %s, %s)",
        (id_, ms(t_ms), ms(t_ms), mag, lon, lat, source, INGESTA, abs(hash(id_)) % 10**9, pais, SHA, retirado))


def duplicado(c, source, t_ms, mag, lon, lat):
    return c.execute("SELECT live.emsc_duplicado(%s, %s, %s, %s, %s::numeric)", (source, ms(t_ms), lon, lat, mag)).fetchone()[0]


@pytest.fixture(scope="module")
def base():
    with base_temporal("obs_emsc_duplicados") as info:
        yield info


@pytest.fixture()
def c(base):
    with psycopg.connect(base, autocommit=False) as conn:
        yield conn
        conn.rollback()                       # cada prueba deja la base como estaba


# --- la función de duplicados -----------------------------------------------------------------------------------------------

def test_mismo_terremoto_en_las_dos_fuentes_el_de_emsc_es_duplicado_y_el_de_usgs_no(c):
    poner(c, "us1", AHORA - H, 3.0, 10.0, 40.0, "usgs-all-day")
    assert duplicado(c, "emsc-fdsn", AHORA - H + 20_000, 3.1, 10.01, 40.01) is True                 # 20 s y ~1,4 km
    assert duplicado(c, "usgs-all-day", AHORA - H + 20_000, 3.1, 10.01, 40.01) is False              # solo EMSC puede ser el duplicado
    assert duplicado(c, "usgs-fdsn-recuperacion", AHORA - H, 3.0, 10.0, 40.0) is False


@pytest.mark.parametrize("dt_s, grados_lon, esperado", [
    (0, 0.0, True), (90, 0.0, True), (91, 0.0, False),            # el límite de tiempo es de 90 s (inclusivo)
    (0, 1.0, True), (0, 1.2, False),                                # ~100 km = ~1,3° de longitud a 40° N: 1,0° (≈ 85 km) sí, 1,2° (≈ 102 km) no
])
def test_los_limites_de_tiempo_y_distancia_de_la_regla_general(c, dt_s, grados_lon, esperado):
    poner(c, "us1", AHORA, 3.0, 10.0, 40.0, "usgs-all-day")
    assert duplicado(c, "emsc-fdsn", AHORA + dt_s * 1000, 3.0, 10.0 + grados_lon, 40.0) is esperado


def test_un_evento_cercano_en_el_espacio_pero_lejano_en_el_tiempo_no_es_el_mismo(c):
    poner(c, "us1", AHORA, 3.0, 10.0, 40.0, "usgs-all-day")
    assert duplicado(c, "emsc-fdsn", AHORA + 600_000, 3.0, 10.0, 40.0) is False                       # 10 min después, mismo sitio: otra réplica


def test_los_sismos_fuertes_admiten_mas_diferencia_de_localizacion_y_hora(c):
    poner(c, "us1", AHORA, 4.8, 160.0, 52.0, "usgs-all-day")                                          # remoto, fuerte
    # 210 s y ~120 km de diferencia entre agencias: caso real (Kamchatka) que la regla general NO captura
    assert duplicado(c, "emsc-fdsn", AHORA + 210_000, 4.9, 161.8, 52.0) is True
    assert duplicado(c, "emsc-fdsn", AHORA + 210_000, 4.9, 165.0, 52.0) is False                      # ~340 km: fuera de la regla ampliada (≤ 300 km)
    assert duplicado(c, "emsc-fdsn", AHORA + 400_000, 4.9, 160.0, 52.0) is False                      # > 300 s
    assert duplicado(c, "emsc-fdsn", AHORA + 210_000, 5.6, 161.8, 52.0) is False                      # diferencia de magnitud 0,8 > 0,6


def test_la_regla_ampliada_solo_se_aplica_a_magnitud_4_5_o_mas(c):
    poner(c, "us1", AHORA, 3.0, 10.0, 40.0, "usgs-all-day")
    assert duplicado(c, "emsc-fdsn", AHORA + 210_000, 3.1, 11.8, 40.0) is False                       # pequeño: solo la regla estricta
    poner(c, "us2", AHORA, None, 20.0, 40.0, "usgs-all-day")                                           # pareja sin magnitud: la regla ampliada no puede comparar
    assert duplicado(c, "emsc-fdsn", AHORA + 210_000, 4.9, 21.8, 40.0) is False


def test_un_evento_retirado_de_usgs_no_cuenta_como_pareja(c):
    poner(c, "us1", AHORA, 3.0, 10.0, 40.0, "usgs-all-day", retirado=True)
    assert duplicado(c, "emsc-fdsn", AHORA, 3.0, 10.0, 40.0) is False


def test_dos_eventos_de_emsc_entre_si_nunca_son_duplicados(c):
    poner(c, "emsc:1", AHORA, 3.0, 10.0, 40.0, "emsc-fdsn")
    assert duplicado(c, "emsc-fdsn", AHORA, 3.0, 10.0, 40.0) is False


def test_el_orden_de_llegada_no_importa_si_usgs_llega_despues_el_duplicado_deja_de_verse(c):
    poner(c, "emsc:1", AHORA - H, 3.0, 10.0, 40.0, "emsc-fdsn")
    assert duplicado(c, "emsc-fdsn", AHORA - H, 3.0, 10.0, 40.0) is False                              # todavía no hay pareja: se ve
    poner(c, "us1", AHORA - H, 3.0, 10.0, 40.0, "usgs-all-day")                                       # USGS publica más tarde
    assert duplicado(c, "emsc-fdsn", AHORA - H, 3.0, 10.0, 40.0) is True                               # ahora se oculta, sin reescribir nada


def test_la_distancia_haversine_es_correcta(c):
    d = c.execute("SELECT live.distancia_km(0, 0, 0, 1), live.distancia_km(0, 0, 90, 0), live.distancia_km(10, 40, 10, 40)").fetchone()
    assert abs(d[0] - 111.19) < 0.05 and abs(d[1] - 10007.5) < 1 and d[2] == 0


# --- a través de la API: una sola vez en eventos, estadísticas y comparación ------------------------------------------------

@pytest.fixture()
def api(base):
    with psycopg.connect(base, autocommit=True) as conn:
        conn.execute("TRUNCATE live.evento_actual")
        poner(conn, "us1", AHORA - 2 * H, 3.0, 10.0, 40.0, "usgs-all-day")                           # el mismo terremoto…
        poner(conn, "emsc:1", AHORA - 2 * H + 15_000, 3.1, 10.02, 40.01, "emsc-fdsn")                 # …informado también por EMSC (duplicado)
        poner(conn, "emsc:2", AHORA - H, 2.5, 20.0, 41.0, "emsc-fdsn")                                 # solo EMSC (se ve)
        poner(conn, "us2", AHORA - 3 * H, 4.2, 30.0, 10.0, "usgs-all-day")                           # solo USGS, M ≥ 4
        poner(conn, "emsc:3", AHORA - 4 * H, 4.6, 40.0, 5.0, "emsc-fdsn")                             # solo EMSC, M ≥ 4 (NO entra en la comparación con 2025)
    app = crear_app(crear_repositorio(base, CONFIG), ["http://localhost:4200"], reloj=lambda: AHORA, config=CONFIG)
    with TestClient(app) as tc:
        yield tc


def ids(r):
    return sorted(f["id"] for f in r.json()["features"])


def test_eventos_sin_filtro_muestra_cada_terremoto_una_vez_con_su_fuente(api):
    r = api.get("/api/eventos")
    assert r.status_code == 200
    assert ids(r) == ["emsc:2", "emsc:3", "us1", "us2"] and r.json()["metadata"]["total"] == 4       # «emsc:1» es el duplicado de «us1»
    fuentes = {f["id"]: f["properties"]["source"] for f in r.json()["features"]}
    assert fuentes == {"emsc:2": "emsc-fdsn", "emsc:3": "emsc-fdsn", "us1": "usgs-all-day", "us2": "usgs-all-day"}


def test_el_filtro_fuente_separa_y_el_duplicado_de_emsc_sigue_oculto_incluso_pidiendo_emsc(api):
    assert ids(api.get("/api/eventos", params={"fuente": "usgs"})) == ["us1", "us2"]
    assert ids(api.get("/api/eventos", params={"fuente": "emsc"})) == ["emsc:2", "emsc:3"]           # NO aparece «emsc:1»
    assert api.get("/api/eventos", params={"fuente": "otra"}).status_code == 422
    assert api.get("/api/eventos", params={"fuente": "EMSC"}).status_code == 200                      # sin distinguir mayúsculas


def test_eventos_y_estadisticas_cuentan_lo_mismo_sin_duplicados(api):
    total_eventos = api.get("/api/eventos").json()["metadata"]["total"]
    e = api.get("/api/estadisticas").json()
    assert total_eventos == e["total"] == 4
    assert api.get("/api/estadisticas", params={"fuente": "emsc"}).json()["total"] == 2
    assert api.get("/api/estadisticas", params={"fuente": "usgs"}).json()["total"] == 2
    assert e["filters"]["fuente"] is None and api.get("/api/estadisticas", params={"fuente": "emsc"}).json()["filters"]["fuente"] == "emsc"


def test_la_comparacion_con_2025_es_solo_de_usgs_aunque_haya_eventos_de_emsc_de_magnitud_4(api):
    for params in ({}, {"fuente": "emsc"}):                                                             # incluso pidiendo solo EMSC: la comparación sigue siendo de USGS
        c = api.get("/api/estadisticas", params=params).json()["comparacion"]
        assert c["fuente"] == "usgs" and c["reciente"]["count"] == 1                                    # solo «us2» (M 4,2); «emsc:3» (M 4,6) NO cuenta


def test_la_cobertura_y_la_ultima_ingesta_siguen_siendo_las_de_usgs(api):
    s = api.get("/api/salud").json()
    assert "last_ingestion" in s and s["fuentes"]["emsc"] == {"activa": False, "last_ingestion": None, "ingestion_age_s": None}
