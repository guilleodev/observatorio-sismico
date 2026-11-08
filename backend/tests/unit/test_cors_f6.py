"""Exposición pública de la API por el túnel (F6, 6.6, T042/T044; FR-027, FR-028): CORS exacto, sin comodines, rutas de documentación y compresión HTTP.
Unitarias con un repositorio simulado: no abren ningún puerto ni tocan la base de datos."""
import pytest
from fastapi.testclient import TestClient

from observatorio.api.main import crear_app, validar_origenes
from observatorio.api.repositorio import EstadoSalud, PaginaEventos
from observatorio.config import ConfigApi

NETLIFY = "https://sitio-de-prueba.netlify.app"
LOCAL = "http://localhost:4200"
AHORA = 1_793_113_140_000
CONFIG = ConfigApi(max_eventos=5000, max_ventana_horas=744, obsoleta_s=300, statement_timeout_s=10, margen_publicacion_s=900)
SIN_DOCS = ConfigApi(5000, 744, 300, 10, 900, docs_habilitadas=False)


class RepoFalso:
    def __init__(self, n=0):
        self.n = n

    async def abrir(self): ...
    async def cerrar(self): ...

    async def estado_salud(self):
        return EstadoSalud(AHORA - 5_000, AHORA - 86_400_000, 0)

    async def pagina_eventos(self, filtros, limit, offset):
        ev = [{"id": f"us{i:06d}", "lon": 10.5 + i / 100, "lat": 20.25, "depth": 10.0, "mag": 4.5, "mag_type": "mb", "place": f"Lugar de prueba número {i}", "time": AHORA - i * 1000,
               "updated": AHORA - i * 500, "country_id": "ZA1", "country_name": "Pais ZA1"} for i in range(self.n)]
        return PaginaEventos(ev, self.n, 0, AHORA - 5_000, AHORA - 86_400_000)


def cliente(config=CONFIG, n=0, origenes=(NETLIFY, LOCAL)):
    return TestClient(crear_app(RepoFalso(n), list(origenes), reloj=lambda: AHORA, config=config))


def preflight(c, origen, metodo="GET", cabeceras="ngrok-skip-browser-warning"):
    return c.options("/api/eventos", headers={"Origin": origen, "Access-Control-Request-Method": metodo, "Access-Control-Request-Headers": cabeceras})


# --- CORS exacto -------------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("origen", [NETLIFY, LOCAL])
def test_el_preflight_acepta_exactamente_los_dos_origenes(origen):
    r = preflight(cliente(), origen)
    assert r.status_code == 200 and r.headers["access-control-allow-origin"] == origen          # el origen exacto, nunca «*»
    assert "ngrok-skip-browser-warning" in r.headers["access-control-allow-headers"].lower()
    assert set(m.strip() for m in r.headers["access-control-allow-methods"].split(",")) == {"GET", "OPTIONS"}
    assert "access-control-allow-credentials" not in r.headers


@pytest.mark.parametrize("origen", ["https://otro.netlify.app", "http://localhost:4201", "https://sitio-de-prueba.netlify.app.malo.com", "http://sitio-de-prueba.netlify.app",
                                    "https://SITIO-DE-PRUEBA.netlify.app/", "null", "https://127.0.0.1:4200"])
def test_el_preflight_rechaza_cualquier_otro_origen(origen):
    r = preflight(cliente(), origen)
    assert r.status_code == 400 and "access-control-allow-origin" not in r.headers


@pytest.mark.parametrize("metodo", ["POST", "PUT", "DELETE", "PATCH"])
def test_el_preflight_rechaza_los_metodos_que_no_son_de_lectura(metodo):
    assert preflight(cliente(), NETLIFY, metodo).status_code == 400


def test_el_preflight_rechaza_cabeceras_no_declaradas():
    assert preflight(cliente(), NETLIFY, cabeceras="authorization").status_code == 400


def test_la_respuesta_real_lleva_el_origen_exacto_y_un_origen_ajeno_no_recibe_cabecera():
    c = cliente()
    assert c.get("/api/salud", headers={"Origin": NETLIFY}).headers["access-control-allow-origin"] == NETLIFY
    assert "access-control-allow-origin" not in c.get("/api/salud", headers={"Origin": "https://otro.netlify.app"}).headers


@pytest.mark.parametrize("malo", ["*", "https://*.netlify.app", "https://sitio.netlify.app/", "https://sitio.netlify.app/ruta", "ftp://sitio.netlify.app", "sitio.netlify.app", "", " ",
                                  "https://sitio.netlify.app,*", "http://", "https://a b.netlify.app"])
def test_los_comodines_y_origenes_mal_formados_se_rechazan(malo):
    with pytest.raises(ValueError, match="origen"):
        validar_origenes([NETLIFY, malo])
    with pytest.raises(ValueError, match="origen"):
        crear_app(RepoFalso(), [malo], config=CONFIG)


def test_sin_origenes_no_hay_cors_abierto():
    with pytest.raises(ValueError, match="origen"):
        validar_origenes([])
    assert validar_origenes([NETLIFY, LOCAL]) == [NETLIFY, LOCAL]


def test_solo_get_y_options_en_las_rutas_publicas():
    c = cliente()
    for ruta in ("/api/eventos", "/api/estadisticas", "/api/salud"):
        assert c.post(ruta).status_code == 405 and c.put(ruta).status_code == 405 and c.delete(ruta).status_code == 405


# --- rutas de documentación -------------------------------------------------------------------------------------------

@pytest.mark.parametrize("ruta", ["/docs", "/redoc", "/openapi.json"])
def test_las_rutas_de_documentacion_siguen_como_en_f5_por_defecto(ruta):
    assert cliente().get(ruta).status_code == 200


@pytest.mark.parametrize("ruta", ["/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"])
def test_con_la_documentacion_deshabilitada_las_cuatro_rutas_dan_404_y_la_api_sigue(ruta):
    c = cliente(SIN_DOCS)
    assert c.get(ruta).status_code == 404
    assert c.get("/api/salud").status_code == 200 and c.get("/api/eventos").status_code == 200


def test_las_unicas_rutas_publicas_son_las_tres_de_la_api_mas_la_documentacion():
    habilitadas = {r.path for r in crear_app(RepoFalso(), [LOCAL], config=CONFIG).routes}
    assert {p for p in habilitadas if p.startswith("/api")} == {"/api/eventos", "/api/estadisticas", "/api/salud"}
    assert habilitadas - {"/api/eventos", "/api/estadisticas", "/api/salud"} == {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}
    assert {r.path for r in crear_app(RepoFalso(), [LOCAL], config=SIN_DOCS).routes} == {"/api/eventos", "/api/estadisticas", "/api/salud"}


# --- compresión HTTP -------------------------------------------------------------------------------------------------

def test_las_respuestas_grandes_se_comprimen_cuando_el_cliente_lo_pide_y_el_contenido_no_cambia():
    c = cliente(n=300)
    plano = c.get("/api/eventos", headers={"Accept-Encoding": "identity"})
    comp = c.get("/api/eventos", headers={"Accept-Encoding": "gzip"})
    assert "content-encoding" not in plano.headers and comp.headers["content-encoding"] == "gzip" and "accept-encoding" in comp.headers["vary"].lower()
    assert comp.json() == plano.json() and len(plano.content) > 20_000          # httpx descomprime: mismo JSON
    assert int(comp.headers["content-length"]) < int(plano.headers["content-length"]) / 3      # bytes realmente enviados: ≥ 3 veces menos (con datos reales, 57 KB → ≈ 10 KB)


def test_las_respuestas_pequenas_no_se_comprimen():
    r = cliente().get("/api/salud", headers={"Accept-Encoding": "gzip"})
    assert "content-encoding" not in r.headers and r.status_code == 200


def test_la_compresion_no_quita_las_cabeceras_cors():
    r = cliente(n=300).get("/api/eventos", headers={"Accept-Encoding": "gzip", "Origin": NETLIFY})
    assert r.headers["content-encoding"] == "gzip" and r.headers["access-control-allow-origin"] == NETLIFY


# --- configuración ----------------------------------------------------------------------------------------------------

def test_la_documentacion_se_controla_con_una_variable_de_entorno(monkeypatch):
    assert ConfigApi.desde_entorno().docs_habilitadas is True
    for valor, esperado in (("false", False), ("0", False), ("true", True), ("1", True)):
        monkeypatch.setenv("API_DOCS", valor)
        assert ConfigApi.desde_entorno().docs_habilitadas is esperado
    monkeypatch.setenv("API_DOCS", "quizas")
    with pytest.raises(Exception):
        ConfigApi.desde_entorno()
