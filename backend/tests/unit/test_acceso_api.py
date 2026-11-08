"""Clave de acceso de la API publicada por el túnel (F6, 6.6, FR-041). Sin la clave, 401; con ella, el comportamiento de siempre.
Unitarias con un repositorio simulado: no abren puertos ni tocan la base. La clave de las pruebas es ficticia y aleatoria de cada ejecución; nunca la real."""
import logging
import secrets

import pytest
from fastapi.testclient import TestClient

from observatorio.api.main import CABECERA_CLAVE, crear_app
from observatorio.api.repositorio import EstadoSalud, PaginaEventos
from observatorio.config import ConfigApi, ConfigError

NETLIFY = "https://observatorio-sismico.netlify.app"
LOCAL = "http://localhost:4200"
AHORA = 1_793_113_140_000
CLAVE = secrets.token_urlsafe(32)
RUTAS = ["/api/eventos", "/api/estadisticas", "/api/salud"]


def config(clave=CLAVE, docs=True):
    return ConfigApi(5000, 744, 300, 10, 900, docs_habilitadas=docs, clave_acceso=clave)


class RepoFalso:
    async def abrir(self): ...
    async def cerrar(self): ...

    async def estado_salud(self):
        return EstadoSalud(AHORA - 5_000, AHORA - 86_400_000, 0)

    async def ejecucion(self, run_id):
        return None

    async def pagina_eventos(self, filtros, limit, offset):
        return PaginaEventos([], 0, 0, AHORA - 5_000, AHORA - 86_400_000)

    async def estadisticas(self, filtros, generado, max_casillas, margen):
        return {"total": 0, "sin_magnitud": 0, "por_pais": {"unit": "events", "sin_valor": 0, "items": []}, "magnitud": {"unit": "magnitude", "sin_valor": 0, "items": []},
                "profundidad": {"unit": "km", "sin_valor": 0, "items": []}, "por_hora": {"unit": "events/hour UTC", "sin_valor": 0, "items": []},
                "comparacion": {"unit": "events", "comparacion_disponible": False, "motivo": "no_aplica_en_reproduccion", "historico": None, "variacion": None}}


def cliente(cfg=None):
    return TestClient(crear_app(RepoFalso(), [NETLIFY, LOCAL], reloj=lambda: AHORA, config=cfg or config()))


# --- denegado ---------------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("ruta", RUTAS)
def test_sin_clave_es_401_en_los_tres_endpoints_y_la_respuesta_no_trae_datos(ruta):
    r = cliente().get(ruta)
    assert r.status_code == 401 and r.json()["error"] == "no_autorizado"
    assert set(r.json()) == {"error", "detail"} and CLAVE not in r.text
    assert "features" not in r.json() and "total" not in r.json()


@pytest.mark.parametrize("mala", ["", " ", CLAVE[:-1], CLAVE + "x", CLAVE.upper(), CLAVE.lower(), " " + CLAVE, CLAVE + " ", "x" * len(CLAVE), "Bearer " + CLAVE])
@pytest.mark.parametrize("ruta", RUTAS)
def test_una_clave_incorrecta_es_401(ruta, mala):
    r = cliente().get(ruta, headers={CABECERA_CLAVE: mala})
    assert r.status_code == 401 and r.json()["error"] == "no_autorizado"


def test_la_clave_solo_se_acepta_por_cabecera_nunca_por_la_url_ni_otras_cabeceras():
    c = cliente()
    assert c.get("/api/salud", params={"clave": CLAVE, "key": CLAVE, "api_key": CLAVE, "x-observatorio-clave": CLAVE}).status_code == 401
    assert c.get("/api/salud", headers={"Authorization": CLAVE, "X-Api-Key": CLAVE, "Cookie": f"clave={CLAVE}"}).status_code == 401


@pytest.mark.parametrize("metodo", ["post", "put", "delete", "patch"])
def test_los_metodos_que_no_son_de_lectura_tambien_exigen_la_clave_antes_de_dar_405(metodo):
    c = cliente()
    assert getattr(c, metodo)("/api/eventos").status_code == 401
    assert getattr(c, metodo)("/api/eventos", headers={CABECERA_CLAVE: CLAVE}).status_code == 405


# --- autorizado ---------------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("ruta", RUTAS)
def test_con_la_clave_correcta_funciona_igual_que_sin_proteccion(ruta):
    protegido = cliente().get(ruta, headers={CABECERA_CLAVE: CLAVE})
    libre = cliente(config(clave=None)).get(ruta)
    assert protegido.status_code == libre.status_code == 200 and protegido.json() == libre.json()


def test_sin_clave_configurada_la_api_local_se_comporta_como_antes():
    c = cliente(config(clave=None))
    for ruta in RUTAS:
        assert c.get(ruta).status_code == 200
    assert c.get("/api/salud", headers={CABECERA_CLAVE: "lo-que-sea"}).status_code == 200      # sin clave configurada, la cabecera se ignora


# --- aislamiento Live / Replay -------------------------------------------------------------------------------------------

@pytest.mark.parametrize("consulta", ["mode=live", "mode=replay", "mode=replay&run=r-a", "mode=otro", "run=r-a", "mode=live&run=r-a"])
@pytest.mark.parametrize("ruta", RUTAS)
def test_la_autenticacion_va_antes_que_la_validacion_y_cubre_live_y_replay(ruta, consulta):
    c = cliente()
    assert c.get(f"{ruta}?{consulta}").status_code == 401          # un parámetro inválido sin clave NO devuelve 422: no se filtra información del contrato
    assert c.get(f"{ruta}?{consulta}", headers={CABECERA_CLAVE: "mala"}).status_code == 401


def test_con_la_clave_cada_modo_responde_lo_suyo():
    c, h = cliente(), {CABECERA_CLAVE: CLAVE}
    assert c.get("/api/eventos?mode=live", headers=h).json()["metadata"]["mode"] == "live"
    j = c.get("/api/eventos?mode=replay", headers=h).json()
    assert j["metadata"]["mode"] == "replay" and j["metadata"]["replay"] is None
    assert c.get("/api/estadisticas?mode=replay", headers=h).json()["comparacion"]["comparacion_disponible"] is False
    assert c.get("/api/eventos?mode=otro", headers=h).status_code == 422
    assert "replay" not in c.get("/api/salud", headers=h).json()
    assert "replay" in c.get("/api/salud?mode=replay", headers=h).json()


# --- CORS: preflight sin datos, 401 legible por el navegador ---------------------------------------------------------------

@pytest.mark.parametrize("origen", [NETLIFY, LOCAL])
def test_el_preflight_funciona_sin_clave_y_anuncia_la_cabecera_pero_no_da_datos(origen):
    r = cliente().options("/api/eventos", headers={"Origin": origen, "Access-Control-Request-Method": "GET",
                                                    "Access-Control-Request-Headers": f"{CABECERA_CLAVE},ngrok-skip-browser-warning"})
    assert r.status_code == 200 and r.headers["access-control-allow-origin"] == origen
    allow = r.headers["access-control-allow-headers"].lower()
    assert CABECERA_CLAVE.lower() in allow and "ngrok-skip-browser-warning" in allow
    assert r.text in ("OK", "") and "features" not in r.text and "metadata" not in r.text


def test_el_preflight_desde_un_origen_ajeno_sigue_rechazado():
    r = cliente().options("/api/eventos", headers={"Origin": "https://otro.netlify.app", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": CABECERA_CLAVE})
    assert r.status_code == 400 and "access-control-allow-origin" not in r.headers


def test_el_401_lleva_las_cabeceras_cors_del_origen_permitido_para_que_el_panel_pueda_leerlo():
    r = cliente().get("/api/eventos", headers={"Origin": NETLIFY})
    assert r.status_code == 401 and r.headers["access-control-allow-origin"] == NETLIFY
    r2 = cliente().get("/api/eventos", headers={"Origin": "https://otro.netlify.app"})
    assert r2.status_code == 401 and "access-control-allow-origin" not in r2.headers


def test_con_gzip_y_clave_se_comprime_y_se_autoriza():
    r = cliente().get("/api/estadisticas", headers={CABECERA_CLAVE: CLAVE, "Accept-Encoding": "gzip", "Origin": NETLIFY})
    assert r.status_code == 200 and r.headers["access-control-allow-origin"] == NETLIFY


# --- la clave no se filtra -------------------------------------------------------------------------------------------------

def test_la_clave_no_aparece_en_los_registros_ni_en_las_respuestas(caplog):
    caplog.set_level(logging.DEBUG)
    c = cliente()
    respuestas = [c.get(r, headers={CABECERA_CLAVE: m}) for r in RUTAS for m in (CLAVE, "mala-" + CLAVE[:8], "")] + [c.get(r) for r in RUTAS]
    assert CLAVE not in caplog.text and CLAVE[:8] not in caplog.text
    for r in respuestas:
        assert CLAVE not in r.text and CLAVE not in str(dict(r.headers))


def test_la_documentacion_y_el_esquema_no_contienen_la_clave_y_se_ocultan_con_api_docs_false():
    assert CLAVE not in cliente().get("/openapi.json").text
    c = cliente(config(docs=False))
    assert [c.get(r).status_code for r in ("/docs", "/redoc", "/openapi.json")] == [404, 404, 404]


def test_la_comparacion_de_la_clave_es_en_tiempo_constante():
    import inspect
    import observatorio.api.main as m

    fuente = inspect.getsource(m)
    assert "hmac.compare_digest" in fuente and "!= clave" not in fuente and "== clave" not in fuente


# --- configuración ---------------------------------------------------------------------------------------------------------

def test_la_clave_se_lee_del_entorno_se_ignora_vacia_y_no_sale_en_repr(monkeypatch):
    monkeypatch.delenv("API_CLAVE_ACCESO", raising=False)
    assert ConfigApi.desde_entorno().clave_acceso is None
    monkeypatch.setenv("API_CLAVE_ACCESO", "   ")
    assert ConfigApi.desde_entorno().clave_acceso is None
    monkeypatch.setenv("API_CLAVE_ACCESO", CLAVE)
    cfg = ConfigApi.desde_entorno()
    assert cfg.clave_acceso == CLAVE and CLAVE not in repr(cfg) and CLAVE not in str(cfg)


@pytest.mark.parametrize("mala", ["corta", "a" * 31, "con espacios dentro de la clave de acceso larga", "ñ" * 40, "a" * 40 + "\n" + "b", "a;b" + "c" * 40])
def test_una_clave_debil_o_con_caracteres_raros_impide_arrancar(monkeypatch, mala):
    monkeypatch.setenv("API_CLAVE_ACCESO", mala)
    with pytest.raises(ConfigError) as e:
        ConfigApi.desde_entorno()
    assert mala not in str(e.value)                                  # el error tampoco repite el valor
