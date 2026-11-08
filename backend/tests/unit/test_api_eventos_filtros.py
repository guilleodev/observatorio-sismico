"""Filtros de /api/eventos contra PostgreSQL real (F5, paso 5.1, T005; SC-002).

Se ejecuta en una BASE TEMPORAL (`obs_api_f5_filtros`, esquema real aplicado y sin datos reales). La API se prueba por HTTP con su pool de producción
(`crear_repositorio`) y las expectativas se calculan en Python con el conjunto de eventos de la prueba, no con el mismo SQL.
"""

import pytest
from fastapi.testclient import TestClient

from fixtures.base_api import base_temporal, hay_entorno, insertar_evento, ms
from observatorio.api.filtros import desde_ms
from observatorio.api.main import crear_app, crear_repositorio
from observatorio.config import ConfigApi

pytestmark = pytest.mark.skipif(not hay_entorno(), reason="sin PostgreSQL o sin /sql montado")

AHORA = 1_793_113_140_000
H = 3_600_000
CONFIG = ConfigApi(max_eventos=5000, max_ventana_horas=744, obsoleta_s=300, statement_timeout_s=10, margen_publicacion_s=900)
ORIGEN = "http://localhost:4200"

# (id, desplazamiento respecto a AHORA en ms, magnitud, país, resultado geográfico, retirado)
EVENTOS = [
    ("e00", -1 * H, 4.5, "ZA1", "auto", False),          # mismo instante que e01: desempata el id
    ("e01", -1 * H, 4.5, "ZA1", "auto", False),
    ("e02", -2 * H, 3.0, "ZA1", "auto", False),
    ("e03", -3 * H, None, "ZA1", "auto", False),          # magnitud nula
    ("e04", -4 * H, 5.5, "ZB1", "auto", False),
    ("e05", -5 * H, 4.0, None, "auto", False),            # sin país
    ("e06", -6 * H, None, None, "auto", False),           # sin país y sin magnitud
    ("e07", -7 * H, 6.1, "ZA1", "auto", True),            # retirado: nunca aparece
    ("e08", -24 * H, 4.2, "ZB1", "auto", False),          # justo en start (inclusivo)
    ("e09", -24 * H - 1, 4.2, "ZB1", "auto", False),      # 1 ms antes de start: fuera
    ("e10", 0, 4.0, "ZA1", "auto", False),                # justo en end (exclusivo): fuera
    ("e11", -30 * 24 * H, 4.0, "ZA1", "auto", False),     # hace 30 días: fuera de la ventana por defecto
    ("e12", -8 * H, 4.1, None, None, False),              # aún sin asignar (geo_resultado nulo): no es «sin país»
    ("e13", -10 * H, 7.0, "ZB1", "auto", False),
]


@pytest.fixture(scope="module")
def cliente():
    import psycopg
    from fixtures.base_api import conninfo
    with base_temporal("obs_api_f5_filtros") as info:
        with psycopg.connect(conninfo("obs_api_f5_filtros"), autocommit=True) as c:
            for i, d, mag, pais, res, retirado in EVENTOS:
                insertar_evento(c, i, AHORA + d, mag, pais, res if res != "auto" else "auto", retirado=retirado)
            c.execute("UPDATE live.evento_actual SET geo_resultado = NULL WHERE event_id = 'e12'")
        app = crear_app(crear_repositorio(info, CONFIG), [ORIGEN], reloj=lambda: AHORA, config=CONFIG)
        with TestClient(app) as tc:
            yield tc


def iso(ms_valor):
    return desde_ms(ms_valor).isoformat().replace("+00:00", "Z")


def todas(cliente, **parametros):
    """Recorre todas las páginas (limit 4) y devuelve (ids en orden, metadata de la primera página, número de páginas)."""
    ids, primera, paginas, offset = [], None, 0, 0
    while True:
        r = cliente.get("/api/eventos", params={**parametros, "limit": 4, "offset": offset})
        assert r.status_code == 200, r.text
        cuerpo = r.json()
        primera = primera or cuerpo["metadata"]
        ids += [f["id"] for f in cuerpo["features"]]
        paginas += 1
        if cuerpo["metadata"]["next_offset"] is None:
            return ids, primera, paginas
        offset = cuerpo["metadata"]["next_offset"]


def esperado(start=AHORA - 24 * H, end=AHORA, min_mag=None, pais=None):
    """Oráculo independiente: filtra el conjunto de la prueba con Python puro."""
    def en_ambito(e):
        return pais is None or (e[4] == "sin_pais" if pais == "sin_pais" else e[3] == pais)

    def resultado(e):
        return "sin_pais" if (e[3] is None and e[4] == "auto") else None

    base = [e for e in EVENTOS if not e[5] and start <= AHORA + e[1] < end
            and (pais is None or (resultado(e) == "sin_pais" if pais == "sin_pais" else e[3] == pais))]
    con = [e for e in base if min_mag is None or (e[2] is not None and e[2] >= min_mag)]
    orden = sorted(con, key=lambda e: (-(AHORA + e[1]), e[0]))
    return [e[0] for e in orden], sum(1 for e in base if e[2] is None)


COMBINACIONES = [
    ("defecto", {}, {}),
    ("min_mag 4", {"min_mag": "4"}, {"min_mag": 4}),
    ("min_mag 4.5 inclusivo", {"min_mag": "4.5"}, {"min_mag": 4.5}),
    ("min_mag 10 sin resultados", {"min_mag": "10"}, {"min_mag": 10}),
    ("min_mag negativo incluye todo con magnitud", {"min_mag": "-5"}, {"min_mag": -5}),
    ("país ZA1", {"country_id": "ZA1"}, {"pais": "ZA1"}),
    ("país en minúsculas", {"country_id": "zb1"}, {"pais": "ZB1"}),
    ("país válido sin eventos (ZC1)", {"country_id": "ZC1"}, {"pais": "ZC1"}),
    ("sin_pais", {"country_id": "sin_pais"}, {"pais": "sin_pais"}),
    ("sin_pais con min_mag 4", {"country_id": "sin_pais", "min_mag": "4"}, {"pais": "sin_pais", "min_mag": 4}),
    ("ZA1 con min_mag 4", {"country_id": "ZA1", "min_mag": "4"}, {"pais": "ZA1", "min_mag": 4}),
    ("ventana estrecha", {"start": iso(AHORA - 5 * H), "end": iso(AHORA - 2 * H)}, {"start": AHORA - 5 * H, "end": AHORA - 2 * H}),
    ("start inclusivo exacto", {"start": iso(AHORA - 1 * H), "end": iso(AHORA)}, {"start": AHORA - 1 * H, "end": AHORA}),
    ("end exclusivo exacto", {"start": iso(AHORA - 3 * H), "end": iso(AHORA - 1 * H)}, {"start": AHORA - 3 * H, "end": AHORA - 1 * H}),
    ("ventana larga con el evento de hace 30 días", {"start": iso(AHORA - 31 * 24 * H), "end": iso(AHORA + H)}, {"start": AHORA - 31 * 24 * H, "end": AHORA + H}),
    ("solo end (start = end − 24 h)", {"end": iso(AHORA - 6 * H)}, {"start": AHORA - 30 * H, "end": AHORA - 6 * H}),
    ("periodo sin eventos (pasado)", {"start": "2020-01-01T00:00:00Z", "end": "2020-01-02T00:00:00Z"}, {"start": 1577836800000, "end": 1577923200000}),
    ("periodo futuro", {"start": "2030-01-01", "end": "2030-01-02"}, {"start": 1893456000000, "end": 1893542400000}),
]


@pytest.mark.parametrize("nombre,parametros,filtro", COMBINACIONES, ids=[c[0] for c in COMBINACIONES])
def test_el_recuento_paginado_coincide_con_el_oraculo_independiente(cliente, nombre, parametros, filtro):
    ids_esperados, nulos_esperados = esperado(**filtro)
    ids, meta, _ = todas(cliente, **parametros)
    assert ids == ids_esperados, nombre                       # mismos eventos y mismo orden (time DESC, id ASC)
    assert meta["total"] == len(ids_esperados)                 # total = todas las páginas
    assert meta["sin_magnitud"] == nulos_esperados             # nulos que cumplen el resto de filtros, con o sin min_mag
    assert len(set(ids)) == len(ids)                           # una sola versión vigente por evento


def test_los_limites_del_periodo_son_start_inclusivo_y_end_exclusivo(cliente):
    ids, _, _ = todas(cliente)
    assert "e08" in ids and "e09" not in ids and "e10" not in ids and "e07" not in ids and "e11" not in ids


def test_desempate_por_id_con_el_mismo_instante(cliente):
    assert todas(cliente)[0][:2] == ["e00", "e01"]


def test_la_magnitud_nula_no_cumple_min_mag_y_se_cuenta_aparte(cliente):
    sin_umbral = cliente.get("/api/eventos").json()["metadata"]
    con_umbral = cliente.get("/api/eventos", params={"min_mag": "0"}).json()
    assert sin_umbral["sin_magnitud"] == 2 and con_umbral["metadata"]["sin_magnitud"] == 2  # e03 y e06 en ambos casos
    ids = {f["id"] for f in con_umbral["features"]}
    assert "e03" not in ids and "e06" not in ids               # excluidos por el umbral...
    assert "e03" in {f["id"] for f in cliente.get("/api/eventos").json()["features"]}  # ...pero presentes sin él
    assert all(f["properties"]["mag"] is not None for f in con_umbral["features"])


def test_el_evento_sin_asignar_no_es_sin_pais_pero_si_cuenta_sin_filtro_de_pais(cliente):
    assert "e12" in {f["id"] for f in cliente.get("/api/eventos").json()["features"]}
    assert "e12" not in {f["id"] for f in cliente.get("/api/eventos", params={"country_id": "sin_pais"}).json()["features"]}


def test_pais_desconocido_es_422_y_no_una_lista_vacia(cliente):
    r = cliente.get("/api/eventos", params={"country_id": "ATLANTIDA"})
    assert r.status_code == 422 and r.json()["error"] == "parametro_invalido" and "ATLANTIDA" in r.json()["detail"]


def test_sin_parametros_el_resultado_es_el_de_las_ultimas_24h_y_el_periodo_va_en_metadata(cliente):
    r = cliente.get("/api/eventos").json()
    assert r["metadata"]["period"] == {"start": AHORA - 24 * H, "end": AHORA}
    assert r["metadata"]["mode"] == "live" and r["type"] == "FeatureCollection"
    assert set(r["features"][0]["properties"]) == {"mag", "magType", "place", "time", "updated", "country_id", "country_name"}  # contrato previo intacto


def test_cobertura_es_la_primera_ingesta_menos_24h_y_last_ingestion_es_nulo_sin_consultas(cliente):
    m = cliente.get("/api/eventos").json()["metadata"]
    assert m["coverage"]["live_since"] == int(ms(0).replace(year=2026, month=10, day=26).timestamp() * 1000) - 24 * H
    assert m["last_ingestion"] is None


def test_la_respuesta_no_contiene_nan_ni_infinity_ni_historico_ni_sintetico(cliente):
    texto = cliente.get("/api/eventos", params={"start": iso(AHORA - 31 * 24 * H)}).text
    assert "NaN" not in texto and "Infinity" not in texto and "historico" not in texto.lower() and "synthetic" not in texto.lower()


def test_idempotencia_la_misma_consulta_devuelve_lo_mismo(cliente):
    a, b = cliente.get("/api/eventos", params={"min_mag": "4"}).json(), cliente.get("/api/eventos", params={"min_mag": "4"}).json()
    assert a == b
