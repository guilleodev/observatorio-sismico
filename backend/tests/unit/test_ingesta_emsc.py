"""F8: un ciclo de ingesta de EMSC con repositorio, publicador y consulta simulados, y el bucle que lo repite (aislamiento de errores)."""

import asyncio
import json
from datetime import datetime, timezone

import pytest

from observatorio.config import ConfigEmsc
from observatorio.producer.emsc import ErrorEmsc
from observatorio.producer.ingesta_emsc import bucle_emsc, ejecutar_ciclo_emsc
from observatorio.producer.usgs import Respuesta

AHORA = 1_794_848_400_000  # 2026-11-16T17:00:00Z


def feature(unid="20261116_0000233", lastupdate="2026-11-16T16:59:00Z", **extra):
    p = {"lastupdate": lastupdate, "time": "2026-11-16T16:56:18Z", "flynn_region": "CENTRAL TURKEY", "lat": 40.8, "lon": 34.7, "depth": 7,
         "evtype": "ke", "auth": "AFAD", "mag": 2.3, "magtype": "ml", "unid": unid}
    p.update(extra)
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [34.7, 40.8, -7]}, "id": unid, "properties": p}


def respuesta(features):
    cuerpo = json.dumps({"type": "FeatureCollection", "features": features}).encode()
    return Respuesta(cuerpo=cuerpo, http_status=200, duracion_ms=300, bytes=len(cuerpo), intentos=1, datos=json.loads(cuerpo))


def config(**cambios):
    base = dict(activo=True, url="https://www.seismicportal.eu/fdsnws/event/1/query", intervalo_s=60, timeout_s=20, max_reintentos=3, mag_min=2.0,
                ventana_inicial_h=24, ventana_max_dias=7, margen_s=120, limite=20000)
    base.update(cambios)
    return ConfigEmsc(**base)


class RepoFalso:
    def __init__(self, marca=None, publicadas=None):
        self._marca = marca
        self.publicadas = dict(publicadas or {})
        self.marcadas, self.consultas, self.errores, self.errores_publicacion, self.conteos = [], [], [], [], []

    async def marca(self):
        return self._marca

    async def maximos_publicados(self, ids):
        return {i: self.publicadas[i] for i in ids if i in self.publicadas}

    async def marcar_publicada(self, event_id, updated_ms, particion, offset):
        self.marcadas.append((event_id, updated_ms))
        self.publicadas[event_id] = max(updated_ms, self.publicadas.get(event_id, 0))

    async def registrar_ok(self, iniciada_ms, resp, n_eventos, ventana, nueva_marca):
        self.consultas.append({"iniciada": iniciada_ms, "n": n_eventos, "ventana": ventana, "marca": nueva_marca})
        if nueva_marca is not None:
            self._marca = nueva_marca
        return len(self.consultas)

    async def registrar_error(self, iniciada_ms, error, ventana=None):
        self.errores.append((iniciada_ms, str(error), ventana))

    async def registrar_error_publicacion(self, mensaje):
        self.errores_publicacion.append(mensaje)

    async def actualizar_conteos(self, consulta_id, publicadas, omitidas):
        self.conteos.append((consulta_id, publicadas, omitidas))


class Publicador:
    def __init__(self, falla_en=None):
        self.mensajes, self.falla_en = [], falla_en

    async def __call__(self, clave, valor):
        if self.falla_en is not None and len(self.mensajes) >= self.falla_en:
            raise ConnectionError("Kafka caído")
        self.mensajes.append((clave, json.loads(valor)))
        return 0, len(self.mensajes) - 1


def consulta_que_devuelve(features, urls):
    async def consultar(url, timeout_s, max_reintentos):
        urls.append(url)
        return respuesta(features)
    return consultar


def ciclo(repo, features, publicador, urls=None, cfg=None):
    return asyncio.run(ejecutar_ciclo_emsc(repo, cfg or config(), publicador, consulta_que_devuelve(features, [] if urls is None else urls), lambda: AHORA))


def test_primer_ciclo_pide_las_ultimas_horas_publica_con_source_emsc_y_fija_la_marca():
    repo, pub, urls = RepoFalso(), Publicador(), []
    r = ciclo(repo, [feature("a"), feature("b")], pub, urls)
    assert (r.resultado, r.eventos, r.publicadas, r.omitidas) == ("ok", 2, 2, 0)
    assert "start=2026-11-15T17:00:00" in urls[0] and "updatedafter" not in urls[0] and "minmag=2" in urls[0]
    assert [clave for clave, _ in pub.mensajes] == [b"emsc:a", b"emsc:b"]                       # la clave de Kafka es el id con prefijo
    cuerpo = pub.mensajes[0][1]
    assert cuerpo["source"] == "emsc-fdsn" and cuerpo["mode"] == "live" and cuerpo["event"]["properties"]["type"] == "earthquake"
    assert repo.consultas[0]["marca"] == datetime(2026, 11, 16, 17, 0, 0, tzinfo=timezone.utc)   # la marca es el INICIO de la consulta
    assert repo.conteos == [(1, 2, 0)]


def test_el_ciclo_siguiente_es_incremental_y_omite_lo_ya_publicado():
    repo, pub, urls = RepoFalso(), Publicador(), []
    ciclo(repo, [feature("a")], pub, urls)
    ciclo(repo, [feature("a"), feature("b")], pub, urls)                                         # «a» ya publicado con el mismo `lastupdate`: se omite
    assert "updatedafter=2026-11-16T16:58:00" in urls[1] and "start=" not in urls[1]              # marca (17:00) − 120 s
    assert [clave for clave, _ in pub.mensajes] == [b"emsc:a", b"emsc:b"] and repo.conteos[-1] == (2, 1, 1)


def test_una_revision_posterior_del_mismo_evento_si_se_publica():
    repo, pub = RepoFalso(), Publicador()
    ciclo(repo, [feature("a", lastupdate="2026-11-16T16:59:00Z")], pub)
    ciclo(repo, [feature("a", lastupdate="2026-11-16T17:10:00Z", mag=2.6)], pub)
    assert len(pub.mensajes) == 2 and pub.mensajes[1][1]["event"]["properties"]["mag"] == 2.6
    ciclo(repo, [feature("a", lastupdate="2026-11-16T16:50:00Z")], pub)                           # una versión ANTIGUA no se publica
    assert len(pub.mensajes) == 2


def test_si_kafka_falla_a_mitad_la_marca_no_avanza_y_el_ciclo_siguiente_repite_la_ventana():
    repo = RepoFalso(marca=datetime(2026, 11, 16, 16, 0, 0, tzinfo=timezone.utc))
    pub = Publicador(falla_en=1)
    r = ciclo(repo, [feature("a"), feature("b"), feature("c")], pub)
    assert (r.publicadas, r.omitidas) == (1, 0) and repo.consultas[0]["marca"] is None            # NO avanza
    assert repo._marca == datetime(2026, 11, 16, 16, 0, 0, tzinfo=timezone.utc) and "Kafka caído" in repo.errores_publicacion[0]
    sano, urls = Publicador(), []
    r2 = ciclo(repo, [feature("a"), feature("b"), feature("c")], sano, urls)                       # reintento: «a» se omite, «b» y «c» se publican
    assert (r2.publicadas, r2.omitidas) == (2, 1) and "updatedafter=2026-11-16T15:58:00" in urls[0]
    assert repo._marca == datetime(2026, 11, 16, 17, 0, 0, tzinfo=timezone.utc)


def test_un_fallo_de_consulta_se_registra_sin_tocar_la_marca_ni_publicar():
    repo, pub = RepoFalso(marca=datetime(2026, 11, 16, 16, 0, 0, tzinfo=timezone.utc)), Publicador()

    async def consulta_caida(url, timeout_s, max_reintentos):
        raise ErrorEmsc("HTTP 503", http_status=503, intentos=4)

    r = asyncio.run(ejecutar_ciclo_emsc(repo, config(), pub, consulta_caida, lambda: AHORA))
    assert r.resultado == "error" and "503" in r.error and pub.mensajes == [] and repo.consultas == []
    assert repo.errores[0][1] == "HTTP 503" and "updatedafter=" in repo.errores[0][2] and repo._marca == datetime(2026, 11, 16, 16, 0, 0, tzinfo=timezone.utc)


def test_sin_eventos_nuevos_es_un_ciclo_correcto_y_la_marca_avanza():
    repo, pub = RepoFalso(), Publicador()
    r = ciclo(repo, [], pub)
    assert (r.resultado, r.eventos, r.publicadas) == ("ok", 0, 0) and repo._marca is not None


def test_un_evento_no_terremoto_se_publica_igualmente_para_que_el_consumidor_lo_ponga_en_cuarentena():
    pub = Publicador()
    ciclo(RepoFalso(), [feature("x", evtype="km")], pub)
    assert pub.mensajes[0][1]["event"]["properties"]["type"] == "km"


# --- el bucle ---------------------------------------------------------------------------------------------------------------

class ConexionFalsa:
    def __init__(self):
        self.cerrada = False

    async def close(self):
        self.cerrada = True


def test_el_bucle_nunca_propaga_un_fallo_inesperado_y_sigue_con_el_ciclo_siguiente(monkeypatch):
    llamadas = []

    async def ciclo_roto(repo, cfg, publicador):
        llamadas.append(1)
        raise RuntimeError("fallo inesperado")

    monkeypatch.setattr("observatorio.producer.ingesta_emsc.ejecutar_ciclo_emsc", ciclo_roto)
    conexion = ConexionFalsa()

    async def conectar():
        return conexion

    async def dormir(_s):
        if len(llamadas) >= 3:
            raise asyncio.CancelledError  # fin de la prueba

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(bucle_emsc(conectar, config(), 30, Publicador(), dormir=dormir))
    assert len(llamadas) == 3 and conexion.cerrada                                                 # siguió tras cada fallo y cerró la conexión al terminar


def test_el_bucle_reconecta_si_postgresql_falla(monkeypatch):
    import psycopg
    llamadas, conexiones = [], []

    async def ciclo_roto(repo, cfg, publicador):
        llamadas.append(1)
        raise psycopg.OperationalError("caída")

    monkeypatch.setattr("observatorio.producer.ingesta_emsc.ejecutar_ciclo_emsc", ciclo_roto)

    async def conectar():
        c = ConexionFalsa()
        conexiones.append(c)
        return c

    async def dormir(_s):
        if len(llamadas) >= 2:
            raise asyncio.CancelledError

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(bucle_emsc(conectar, config(), 30, Publicador(), dormir=dormir))
    assert len(conexiones) >= 3 and conexiones[0].cerrada and conexiones[1].cerrada               # cada fallo cierra la rota y abre una nueva
