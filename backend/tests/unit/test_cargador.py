"""Cargador histórico (F4, paso 4.4, T033): servidor FDSN simulado + PostgreSQL real, siempre dentro de una transacción REVERTIDA.

Se usa el año 2031 y ids `prueba-`: no chocan con los meses reales de 2025 ni con ningún dato guardado. Catálogo de juguete (Z??) sembrado
dentro de la transacción. El servidor simulado reproduce `endtime` inclusivo, el límite de resultados y el 204 sin cuerpo.
"""

import gzip
import hashlib
import json
import os
from dataclasses import replace
from datetime import datetime, timezone

import psycopg
import pytest

from fixtures.fdsn_simulado import ServidorFdsn, crear_feature, ms
from fixtures.geo import escribir_catalogo
from observatorio.config import ConfigHistorico, ConfigPostgres
from observatorio.geo.asignador import Asignador
from observatorio.geo.catalogo import leer_catalogo
from observatorio.historico.cargador import Cargador, ErrorExportacion, Exportador, nombre_archivo, tramos_mensuales
from observatorio.historico.fdsn import ClienteFdsn
from observatorio.historico.repositorio import RepositorioHistorico

pytestmark = pytest.mark.skipif(not os.environ.get("POSTGRES_HOST"), reason="sin PostgreSQL")
ANIO = 2031
ZA1 = (5.0, 5.0)  # dentro del país de juguete ZA1
MAR = (25.0, 5.0)  # fuera de todo país de juguete: sin país


def t(texto):
    return ms(texto)


def ev(identificador, tiempo, updated=None, coord=ZA1, **kw):
    """Entrada del servidor simulado: (tiempo_ms, feature)."""
    tiempo_ms = t(tiempo) if isinstance(tiempo, str) else tiempo
    return tiempo_ms, crear_feature(identificador, tiempo_ms, lon=coord[0], lat=coord[1], updated_ms=updated, **kw)


class Escenario:
    def __init__(self, conn, repo, asignador, catalogo, tmp_path):
        self.conn, self.repo, self.asignador, self.catalogo, self.tmp_path = conn, repo, asignador, catalogo, tmp_path

    def config(self, servidor, **kw):
        base = ConfigHistorico(anio=ANIO, mag_min=4.0, limite=20000, url_base=servidor.url, timeout_s=5, max_reintentos=0,
                               exportacion=self.tmp_path / "exportacion")
        return replace(base, **kw)

    def cargador(self, servidor, exportar=False, **kw):
        config = self.config(servidor, **kw)
        cliente = ClienteFdsn(config.url_base, config.timeout_s, config.max_reintentos, dormir=lambda s: None)
        exportador = Exportador(config.exportacion if exportar else None)
        return Cargador(self.repo, cliente, self.asignador, config, exportador)

    def filas(self, sql, *args):
        return self.conn.execute(sql, args).fetchall()

    def eventos(self):
        return self.filas("SELECT event_id, country_id, geo_resultado, origen, consulta_id, "
                          "(extract(epoch FROM updated_at)*1000)::bigint FROM historico.evento WHERE event_id LIKE 'prueba-%%' ORDER BY event_id")

    def consultas(self):
        return self.filas("SELECT inicio, fin, resultado, esperado, obtenidos, duplicados, fuera_de_tramo, tramo_padre, id "
                          "FROM historico.consulta WHERE inicio >= '2031-01-01' ORDER BY inicio, fin")


@pytest.fixture
def escenario(tmp_path):
    catalogo = leer_catalogo(escribir_catalogo(tmp_path / "juguete.geojson"))
    with psycopg.connect(ConfigPostgres.desde_entorno().conninfo()) as conn:
        with conn.transaction(force_rollback=True):
            conn.execute("INSERT INTO geo.catalogo (sha256, archivo, entidades) VALUES (%s, %s, %s)", (catalogo.sha256, catalogo.archivo, len(catalogo.paises)))
            for p in catalogo.paises:
                conn.execute("INSERT INTO geo.pais (country_id, nombre_es, nombre_en) VALUES (%s, %s, %s)", (p.country_id, p.nombre_es, p.nombre_en))
            yield Escenario(conn, RepositorioHistorico(conn), Asignador(catalogo), catalogo, tmp_path)


def cuadra(escenario, resumen):
    """Σ obtenidos − Σ duplicados − Σ fuera_de_tramo = |evento| + |cuarentena| (solo filas de la prueba)."""
    n_eventos = escenario.filas("SELECT count(*) FROM historico.evento WHERE event_id LIKE 'prueba-%%'")[0][0]
    n_cuarentena = escenario.filas("SELECT count(*) FROM historico.cuarentena c JOIN historico.consulta q ON q.id = c.consulta_id WHERE q.inicio >= '2031-01-01'")[0][0]
    return resumen.obtenidos - resumen.duplicados - resumen.fuera_de_tramo == n_eventos + n_cuarentena


# ---------------------------------------------------------------------------------------------------------------- tramos
def test_doce_tramos_mensuales_utc_contiguos():
    tramos = tramos_mensuales(2025)
    assert len(tramos) == 12
    assert tramos[0][0] == datetime(2025, 1, 1, tzinfo=timezone.utc) and tramos[-1][1] == datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert all(a[1] == b[0] for a, b in zip(tramos, tramos[1:]))
    assert (tramos[1][1] - tramos[1][0]).days == 28  # febrero de 2025


# ---------------------------------------------------------------------------------------------------------------- carga
def test_carga_completa_asigna_pais_guarda_archivos_y_cuadra(escenario):
    entradas = [ev("prueba-a1", "2031-01-05T10:00:00"), ev("prueba-a2", "2031-01-20T10:00:00", coord=MAR),
                ev("prueba-b1", "2031-03-02T00:00:00"), ev("prueba-c1", "2031-12-31T23:59:59")]
    with ServidorFdsn(entradas) as s:
        resumen = escenario.cargador(s).cargar()
        assert resumen.tramos_con_error == 0 and resumen.eventos_nuevos == 4 and resumen.obtenidos == 4
        assert resumen.peticiones_http == s.contar_peticiones()
    filas = {f[0]: f for f in escenario.eventos()}
    assert filas["prueba-a1"][1:4] == ("ZA1", "interior", "historico-usgs-fdsn")
    assert filas["prueba-a2"][1:3] == (None, "sin_pais")  # mar: sin país, nunca el más cercano
    consultas = escenario.consultas()
    assert len(consultas) == 12 and all(c[2] == "ok" for c in consultas)
    assert filas["prueba-a1"][4] == consultas[0][8]  # cada evento enlaza con su consulta
    assert cuadra(escenario, resumen)
    # el archivo original se conserva comprimido y su huella coincide con el contenido
    sha, gz = escenario.filas("SELECT a.sha256, a.contenido_gz FROM historico.archivo a WHERE a.consulta_id = %s", consultas[0][8])[0]
    assert hashlib.sha256(bytes(gz)).hexdigest() == sha and [f["id"] for f in json.loads(gzip.decompress(bytes(gz)))["features"]] == ["prueba-a1", "prueba-a2"]
    assert escenario.filas("SELECT count(*) FROM historico.archivo a JOIN historico.consulta c ON c.id = a.consulta_id WHERE c.inicio >= '2031-01-01'")[0][0] == 3


def test_el_evento_conserva_el_original_sin_transformar(escenario):
    entradas = [ev("prueba-r1", "2031-02-02T02:02:02", mag=4.7)]
    with ServidorFdsn(entradas) as s:
        escenario.cargador(s).cargar()
    raw, mag = escenario.filas("SELECT raw, mag FROM historico.evento WHERE event_id = 'prueba-r1'")[0]
    assert raw == entradas[0][1] and float(mag) == 4.7


def test_tramo_sin_resultados_es_correcto_sin_archivo_ni_query(escenario):
    with ServidorFdsn([ev("prueba-solo-enero", "2031-01-05T10:00:00")]) as s:
        resumen = escenario.cargador(s).cargar()
        assert s.contar_peticiones("query") == 1  # solo enero se descarga: los otros 11 meses tienen count = 0
    febrero = [c for c in escenario.consultas() if c[0].month == 2][0]
    assert febrero[2:5] == ("ok", 0, 0)
    assert escenario.filas("SELECT count(*) FROM historico.archivo WHERE consulta_id = %s", febrero[8])[0][0] == 0
    assert resumen.tramos_con_error == 0 and cuadra(escenario, resumen)


# ---------------------------------------------------------------------------------------------------------------- subdivisión
def test_un_tramo_que_alcanza_el_limite_se_subdivide_recursivamente(escenario):
    horas = [ev(f"prueba-h{i:02d}", t("2031-01-01T00:30:00") + i * 3_600_000 * 20) for i in range(36)]  # 36 eventos repartidos en enero
    medio = ev("prueba-medio", "2031-01-16T12:00:00")  # exactamente en el punto medio de enero: pertenece SOLO al segundo hijo
    with ServidorFdsn(horas + [medio]) as s:
        resumen = escenario.cargador(s, limite=8).cargar()
    enero = [c for c in escenario.consultas() if c[0] < datetime(2031, 2, 1, tzinfo=timezone.utc)]
    padre = [c for c in enero if c[0] == datetime(2031, 1, 1, tzinfo=timezone.utc) and c[1] == datetime(2031, 2, 1, tzinfo=timezone.utc)][0]
    assert padre[2] == "subdividido" and len(enero) > 3
    hijos = [c for c in enero if c[7] == padre[8]]
    assert len(hijos) == 2 and hijos[0][1] == hijos[1][0]  # dos mitades contiguas
    assert len(escenario.eventos()) == 37 and len({e[0] for e in escenario.eventos()}) == 37  # ninguno perdido ni repetido
    assert resumen.tramos_con_error == 0 and resumen.tramos_subdivididos >= 1 and cuadra(escenario, resumen)
    assert resumen.fuera_de_tramo >= 1  # el evento del punto medio llegó también en la respuesta del primer hijo (endtime inclusivo)


def test_el_padre_solo_pasa_a_subdividido_cuando_los_hijos_estan_completos(escenario):
    entradas = [ev(f"prueba-p{i}", f"2031-01-{d:02d}T10:00:00") for i, d in enumerate((2, 3, 4, 20, 21, 22))]
    with ServidorFdsn(entradas) as s:
        s.caer_tras = 1  # el primer hijo se descarga; el segundo falla
        resumen = escenario.cargador(s, limite=4).cargar()
        enero = escenario.filas("SELECT resultado, error FROM historico.consulta WHERE inicio = '2031-01-01' AND fin = '2031-02-01'")[0]
        assert enero[0] == "error" and resumen.tramos_con_error >= 1
        s.caer_tras = None
        resumen2 = escenario.cargador(s, limite=4).cargar()
    assert escenario.filas("SELECT resultado FROM historico.consulta WHERE inicio = '2031-01-01' AND fin = '2031-02-01'")[0][0] == "subdividido"
    assert resumen2.tramos_con_error == 0 and len(escenario.eventos()) == 6


def test_un_tramo_que_no_se_puede_partir_mas_registra_el_error_sin_recursion_infinita(escenario):
    mismo_segundo = [ev(f"prueba-s{i}", "2031-06-15T08:00:00") for i in range(3)]
    with ServidorFdsn(mismo_segundo) as s:
        resumen = escenario.cargador(s, limite=2).cargar()
        assert s.contar_peticiones() < 150  # cota: ~22 niveles de partición, no una recursión sin fin
    assert resumen.tramos_con_error >= 1 and any("no se puede subdividir" in e for e in resumen.errores)
    assert escenario.eventos() == []  # nada cargado de un tramo que no se pudo completar


# ---------------------------------------------------------------------------------------------------------------- duplicados
@pytest.mark.parametrize("updated_antes,updated_despues,ganador", [(100, 200, 200), (300, 200, 300)])
def test_un_id_en_dos_tramos_se_carga_una_vez_y_conserva_el_mayor_updated(escenario, updated_antes, updated_despues, ganador):
    entradas = [ev("prueba-dup", "2031-01-31T23:59:00", updated=updated_antes), ev("prueba-dup", "2031-02-01T00:01:00", updated=updated_despues)]
    with ServidorFdsn(entradas) as s:
        resumen = escenario.cargador(s).cargar()
    assert [(e[0], e[5]) for e in escenario.eventos()] == [("prueba-dup", ganador)]
    assert resumen.duplicados == 1 and resumen.eventos_nuevos == 1 and cuadra(escenario, resumen)
    assert sum(c[5] for c in escenario.consultas()) == 1  # la repetición queda anotada en la consulta que la trajo


def test_ids_repetidos_dentro_de_una_misma_respuesta(escenario):
    entradas = [ev("prueba-in", "2031-04-01T01:00:00", updated=1), ev("prueba-in", "2031-04-01T02:00:00", updated=5)]
    with ServidorFdsn(entradas) as s:
        resumen = escenario.cargador(s).cargar()
    assert [(e[0], e[5]) for e in escenario.eventos()] == [("prueba-in", 5)] and resumen.duplicados == 1 and cuadra(escenario, resumen)


def test_evento_en_el_extremo_final_se_descarta_como_fuera_de_tramo(escenario):
    limite = "2032-01-01T00:00:00"  # 00:00 de enero del año siguiente: USGS lo devuelve en el tramo de diciembre (endtime inclusivo)
    entradas = [ev("prueba-dic", "2031-12-31T23:00:00"), ev("prueba-limite", limite)]
    with ServidorFdsn(entradas) as s:
        resumen = escenario.cargador(s).cargar()
    diciembre = [c for c in escenario.consultas() if c[0].month == 12][0]
    assert diciembre[3] == 2 and diciembre[4] == 2 and diciembre[6] == 1  # esperado 2, obtenidos 2, uno fuera de tramo
    assert [e[0] for e in escenario.eventos()] == ["prueba-dic"] and resumen.fuera_de_tramo == 1 and cuadra(escenario, resumen)


# ---------------------------------------------------------------------------------------------------------------- calidad
def test_los_invalidos_y_no_sismicos_van_a_cuarentena_con_motivo_y_referencia(escenario):
    sin_geometria = ev("prueba-sin-geo", "2031-05-05T05:00:00")
    sin_geometria[1].pop("geometry")
    fuera_rango = ev("prueba-rango", "2031-05-05T06:00:00", coord=(200.0, 5.0))
    no_sismico = ev("prueba-cantera", "2031-05-05T07:00:00", tipo="quarry blast")
    bueno = ev("prueba-bueno", "2031-05-05T08:00:00")
    with ServidorFdsn([sin_geometria, fuera_rango, no_sismico, bueno]) as s:
        resumen = escenario.cargador(s).cargar()
    q = {f[0]: f for f in escenario.filas(
        "SELECT c.event_id, c.categoria, c.motivo, c.consulta_id, c.payload FROM historico.cuarentena c "
        "JOIN historico.consulta q ON q.id = c.consulta_id WHERE q.inicio >= '2031-01-01'")}
    assert set(q) == {"prueba-sin-geo", "prueba-rango", "prueba-cantera"}
    assert q["prueba-sin-geo"][1] == "invalido" and "geometría" in q["prueba-sin-geo"][2]
    assert q["prueba-rango"][1] == "invalido" and "fuera de rango" in q["prueba-rango"][2]
    assert q["prueba-cantera"][1] == "excluido" and "no sísmico" in q["prueba-cantera"][2]
    assert b"prueba-cantera" in bytes(q["prueba-cantera"][4]) and q["prueba-cantera"][3] is not None
    assert [e[0] for e in escenario.eventos()] == ["prueba-bueno"]
    assert resumen.cuarentena_nueva == 3 and cuadra(escenario, resumen)


def test_la_misma_regla_geografica_que_el_tiempo_real(escenario):
    puntos = {"prueba-borde": (10.0, 5.0), "prueba-solape": (67.0, 5.0), "prueba-lago": (40.0, 10.0), "prueba-interior": (2.0, 2.0)}
    entradas = [ev(i, f"2031-07-0{n + 1}T00:00:00", coord=c) for n, (i, c) in enumerate(puntos.items())]
    with ServidorFdsn(entradas) as s:
        escenario.cargador(s).cargar()
    obtenido = {e[0]: (e[1], e[2]) for e in escenario.eventos()}
    for identificador, (lon, lat) in puntos.items():
        a = escenario.asignador.asignar(lon, lat)
        assert obtenido[identificador] == (a.country_id, a.resultado)
    assert obtenido["prueba-borde"] == ("ZA1", "varias") and obtenido["prueba-solape"] == ("ZE1", "varias") and obtenido["prueba-lago"] == (None, "sin_pais")


# ---------------------------------------------------------------------------------------------------------------- idempotencia
def test_repetir_la_carga_hace_0_peticiones_y_no_cambia_nada(escenario):
    entradas = [ev("prueba-i1", "2031-01-05T10:00:00"), ev("prueba-i2", "2031-08-05T10:00:00")]
    with ServidorFdsn(entradas) as s:
        escenario.cargador(s).cargar()
        antes = (escenario.eventos(), escenario.consultas())
        segunda = escenario.cargador(s).cargar()
        assert segunda.peticiones_http == 0 and segunda.tramos_reutilizados == 12 and segunda.tramos_nuevos == 0
    assert (escenario.eventos(), escenario.consultas()) == antes


def test_reanudar_tras_un_tramo_incompleto_solo_descarga_lo_que_faltaba(escenario):
    entradas = [ev(f"prueba-m{m:02d}", f"2031-{m:02d}-10T10:00:00") for m in (1, 2, 3, 4)]
    with ServidorFdsn(entradas) as s:
        s.caer_tras = 2  # los dos primeros meses se descargan; marzo y abril fallan con 503
        primera = escenario.cargador(s).cargar()
        assert primera.tramos_con_error == 2 and len(escenario.eventos()) == 2
        s.caer_tras = None
        antes = s.contar_peticiones()
        segunda = escenario.cargador(s).cargar()
        nuevas = s.peticiones[antes:]
    assert segunda.tramos_con_error == 0 and segunda.tramos_nuevos == 2 and segunda.tramos_reutilizados == 10
    assert sum("/query?" in p for p in nuevas) == 2  # solo marzo y abril se piden de nuevo
    assert len(escenario.eventos()) == 4 and all(c[2] == "ok" for c in escenario.consultas())
    assert primera.eventos_nuevos + segunda.eventos_nuevos == 4


# ---------------------------------------------------------------------------------------------------------------- exportación
def test_los_archivos_se_exportan_con_su_huella_y_no_se_sobrescriben(escenario):
    with ServidorFdsn([ev("prueba-x1", "2031-02-10T10:00:00")]) as s:
        resumen = escenario.cargador(s, exportar=True).cargar()
        carpeta = escenario.tmp_path / "exportacion"
        archivo = carpeta / nombre_archivo(datetime(2031, 2, 1, tzinfo=timezone.utc), datetime(2031, 3, 1, tzinfo=timezone.utc), 4.0)
        sha = escenario.filas("SELECT a.sha256 FROM historico.archivo a JOIN historico.consulta c ON c.id = a.consulta_id WHERE c.inicio = '2031-02-01'")[0][0]
        assert resumen.archivos_exportados == 1 and hashlib.sha256(archivo.read_bytes()).hexdigest() == sha
        assert (carpeta / "SHA256SUMS").read_text().strip() == f"{sha}  {archivo.name}"
        # si el archivo exportado desaparece, la siguiente ejecución lo recupera de la base con 0 peticiones
        archivo.unlink()
        again = escenario.cargador(s, exportar=True).cargar()
        assert again.peticiones_http == 0 and again.archivos_exportados == 1 and hashlib.sha256(archivo.read_bytes()).hexdigest() == sha
        # un archivo distinto con el mismo nombre NO se pisa: se informa
        archivo.write_bytes(b"otro contenido")
        tercera = escenario.cargador(s, exportar=True).cargar()
        assert tercera.tramos_con_error == 1 and archivo.read_bytes() == b"otro contenido" and "no se sobrescribe" in tercera.errores[0]


def test_exportador_sin_carpeta_no_hace_nada_y_no_sobrescribe(tmp_path):
    assert Exportador(None).exportar("a.gz", b"x", "0" * 64) is False
    e = Exportador(tmp_path / "nueva")
    sha = hashlib.sha256(b"abc").hexdigest()
    assert e.exportar("a.gz", b"abc", sha) is True and e.exportar("a.gz", b"abc", sha) is False
    with pytest.raises(ErrorExportacion):
        e.exportar("a.gz", b"distinto", hashlib.sha256(b"distinto").hexdigest())


# ---------------------------------------------------------------------------------------------------------------- aislamiento
def test_la_carga_no_escribe_en_live_ni_en_sintetico(escenario):
    def foto():
        return (escenario.filas("SELECT count(*), coalesce(max(updated_at), 'epoch') FROM live.evento_actual")[0],
                escenario.filas("SELECT count(*) FROM live.evento_version")[0], escenario.filas("SELECT count(*) FROM live.cuarentena")[0],
                escenario.filas("SELECT count(*) FROM sintetico.evento_actual")[0])

    antes = foto()
    with ServidorFdsn([ev("prueba-aislado", "2031-09-09T09:09:09")]) as s:
        escenario.cargador(s).cargar()
    assert foto() == antes
