"""Un ciclo de ingesta con repositorio, publicador y consulta simulados."""

import asyncio
import gzip
import json

import pytest

from observatorio.config import ConfigIngesta
from observatorio.producer.ingesta import ejecutar_ciclo, hash_features
from observatorio.producer.usgs import ErrorUsgs, Respuesta

AHORA = 1_793_113_140_000


def feature(id_="ev1", updated=1000, tipo="earthquake"):
    return {"type": "Feature", "id": id_, "geometry": {"type": "Point", "coordinates": [0, 0, 1]},
            "properties": {"time": 900, "updated": updated, "type": tipo, "mag": 2.0}}


def respuesta(features):
    cuerpo = json.dumps({"type": "FeatureCollection", "features": features}).encode()
    return Respuesta(cuerpo=cuerpo, http_status=200, duracion_ms=120, bytes=len(cuerpo), intentos=1,
                     datos=json.loads(cuerpo))


class RepoFalso:
    def __init__(self, publicadas=None, ultimo_hash=None):
        self.publicadas = dict(publicadas or {})  # event_id -> max updated_ms
        self.marcadas, self.consultas, self.copias, self.conteos = [], [], [], []
        self.errores, self.errores_estado, self.hash = [], [], ultimo_hash
        self.llamadas = []

    async def ultimo_hash(self):
        return self.hash

    async def registrar_ok(self, iniciada_ms, resp, n_eventos, hash_, contenido_gz):
        self.llamadas.append("registrar_ok")
        self.consultas.append((iniciada_ms, resp.http_status, n_eventos))
        if contenido_gz is not None:
            self.copias.append((hash_, contenido_gz))
        self.hash = hash_
        return len(self.consultas)

    async def registrar_error(self, iniciada_ms, error):
        self.errores.append(str(error))

    async def maximos_publicados(self, ids):
        return {i: self.publicadas[i] for i in ids if i in self.publicadas}

    async def marcar_publicada(self, event_id, updated_ms, particion, offset):
        self.llamadas.append("marcar")
        self.marcadas.append((event_id, updated_ms))
        self.publicadas[event_id] = max(self.publicadas.get(event_id, 0), updated_ms)

    async def actualizar_conteos(self, consulta_id, publicadas, omitidas):
        self.conteos.append((consulta_id, publicadas, omitidas))

    async def registrar_error_publicacion(self, mensaje):
        self.errores_estado.append(mensaje)


class PublicadorFalso:
    def __init__(self, falla_en=None, registro=None):
        self.enviados, self.falla_en, self.registro = [], falla_en, registro

    async def __call__(self, clave, valor):
        if self.falla_en is not None and len(self.enviados) == self.falla_en:
            raise ConnectionError("Kafka caído")
        self.enviados.append((clave, json.loads(valor)))
        if self.registro is not None:
            self.registro.append("publicar")
        return 0, len(self.enviados) - 1


def config(publicar=True):
    return ConfigIngesta("http://x", 60, 20, 3, 3, 30, publicar)


def ciclo(repo, features, publicador=None, publicar=True, hash_igual=False):
    async def consultar(*args, **kwargs):
        return respuesta(features)

    return asyncio.run(ejecutar_ciclo(repo, config(publicar), publicador, consultar=consultar, ahora=lambda: AHORA))


def test_modo_seco_registra_y_conserva_pero_no_publica_ni_marca():
    repo, pub = RepoFalso(), PublicadorFalso()
    res = ciclo(repo, [feature("a"), feature("b")], pub, publicar=False)
    assert res.resultado == "ok" and res.eventos == 2 and res.publicadas == 0
    assert pub.enviados == [] and repo.marcadas == []
    assert len(repo.consultas) == 1 and len(repo.copias) == 1  # consulta registrada y copia conservada


def test_publica_eventos_desconocidos_con_el_mensaje_del_contrato():
    repo, pub = RepoFalso(), PublicadorFalso()
    ciclo(repo, [feature("a", 1000)], pub)
    (clave, mensaje), = pub.enviados
    assert clave == b"a"
    assert mensaje["source"] == "usgs-all-day" and mensaje["mode"] == "live" and mensaje["ingested_at"] == AHORA + 120  # instante de recepción (inicio + duración)
    assert mensaje["event"]["id"] == "a" and mensaje["event"]["properties"]["updated"] == 1000  # original sin transformar


def test_misma_version_y_version_anterior_no_se_publican_y_la_posterior_si():
    repo, pub = RepoFalso(publicadas={"a": 1000, "b": 1000, "c": 1000}), PublicadorFalso()
    res = ciclo(repo, [feature("a", 1000), feature("b", 900), feature("c", 2000), feature("d", 5)], pub)
    assert [m["event"]["id"] for _, m in pub.enviados] == ["c", "d"]
    assert res.publicadas == 2 and res.omitidas == 2


def test_se_marca_publicada_solo_despues_de_la_confirmacion():
    orden = []
    repo, pub = RepoFalso(), PublicadorFalso(registro=orden)
    repo.llamadas = orden
    ciclo(repo, [feature("a")], pub)
    assert orden == ["registrar_ok", "publicar", "marcar"]


def test_si_publicar_falla_no_se_marca_y_se_conserva_el_estado():
    repo, pub = RepoFalso(), PublicadorFalso(falla_en=1)
    res = ciclo(repo, [feature("a"), feature("b"), feature("c")], pub)
    assert repo.marcadas == [("a", 1000)]  # b no se confirmó: no se marca ni c se intenta
    assert res.resultado == "ok" and res.publicadas == 1 and "Kafka" in repo.errores_estado[0]


def test_la_copia_solo_se_guarda_si_cambia_el_contenido():
    features = [feature("a")]
    repo = RepoFalso(ultimo_hash=hash_features(features))
    ciclo(repo, features, publicar=False)
    assert repo.copias == [] and len(repo.consultas) == 1  # consulta registrada, sin copia idéntica
    ciclo(repo, [feature("a", 2000)], publicar=False)
    assert len(repo.copias) == 1
    assert json.loads(gzip.decompress(repo.copias[0][1]))["features"][0]["properties"]["updated"] == 2000


def test_un_error_de_usgs_se_registra_y_no_se_publica_ni_se_toca_el_estado_valido():
    repo, pub = RepoFalso(ultimo_hash="viejo"), PublicadorFalso()

    async def consultar(*args, **kwargs):
        raise ErrorUsgs("HTTP 503", http_status=503, intentos=4)

    res = asyncio.run(ejecutar_ciclo(repo, config(), pub, consultar=consultar, ahora=lambda: AHORA))
    assert res.resultado == "error" and "503" in repo.errores[0]
    assert pub.enviados == [] and repo.consultas == [] and repo.hash == "viejo"


def test_dos_veces_el_mismo_id_en_una_respuesta_se_publica_la_version_mayor_una_vez():
    repo, pub = RepoFalso(), PublicadorFalso()
    ciclo(repo, [feature("a", 1000), feature("a", 2000)], pub)
    assert [(m["event"]["properties"]["updated"]) for _, m in pub.enviados] == [1000, 2000]
    assert repo.publicadas["a"] == 2000


def test_un_evento_sin_id_o_sin_updated_se_publica_una_sola_vez_para_que_el_consumidor_lo_ponga_en_cuarentena():
    malo = {"type": "Feature", "properties": {"type": "earthquake"}}
    repo, pub = RepoFalso(), PublicadorFalso()
    ciclo(repo, [malo], pub)
    ciclo(repo, [malo], pub)  # el mismo contenido no se vuelve a publicar
    assert len(pub.enviados) == 1
    assert pub.enviados[0][0].startswith(b"sin-id-")


def test_hash_features_es_estable_y_cambia_con_el_contenido():
    assert hash_features([feature("a")]) == hash_features([feature("a")])
    assert hash_features([feature("a")]) != hash_features([feature("a", 2)])
