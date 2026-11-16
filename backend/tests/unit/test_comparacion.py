"""Comparación entre ventanas equivalentes (F4, paso 4.6, T054/T055).

Se ejecuta en una BASE TEMPORAL (`obs_cmp_f4_test`, con el esquema aplicado y sin datos reales) para que los eventos ficticios no se mezclen con
los 18 302 reales ni con el estado en vivo; se elimina al terminar. Las expectativas se calculan en Python, no con el mismo SQL.
Lee `sql/consultas/comparacion.sql` (montado en /sql) y el ayudante `scripts/f4/comparacion.py` (montado en /scripts).
"""

import os
import statistics
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg
import pytest
from psycopg.types.json import Jsonb

from observatorio.config import ConfigPostgres

SQL_DIR, SCRIPTS = Path(os.environ.get("SQL_DIR", "/sql")), Path(os.environ.get("SCRIPTS_DIR", "/scripts"))
pytestmark = pytest.mark.skipif(not (os.environ.get("POSTGRES_HOST") and (SQL_DIR / "consultas" / "comparacion.sql").is_file() and SCRIPTS.is_dir()),
                                reason="sin PostgreSQL o sin /sql y /scripts montados")
sys.path.insert(0, str(SCRIPTS))

BASE = "obs_cmp_f4_test"
UTC = timezone.utc
H_DESDE, H_HASTA = datetime(2025, 1, 1, tzinfo=UTC), datetime(2026, 1, 1, tzinfo=UTC)
DESDE, HASTA = datetime(2026, 11, 1, tzinfo=UTC), datetime(2026, 11, 8, tzinfo=UTC)
SHA = "a" * 64


def dt(texto):
    return datetime.fromisoformat(texto).replace(tzinfo=UTC)


# (id, instante, mag, país, resultado) — histórico de 2025 y fronteras del periodo
HISTORICO = [
    ("h1", "2025-01-01T00:00:00", 4.0, "ZA1", "interior"), ("h2", "2025-01-01T12:00:00", 4.5, "ZA1", "interior"), ("h3", "2025-01-01T23:59:59", 6.0, "ZA1", "frontera"),
    ("h4", "2025-01-03T08:00:00", 5.0, "ZA1", "interior"), ("h5", "2025-01-03T09:00:00", 4.2, "ZA1", "interior"),
    ("h6", "2025-06-15T10:00:00", 4.6, None, "sin_pais"), ("h7", "2025-12-31T23:59:59", 4.1, "ZB1", "interior"),
    ("h8", "2025-01-01T05:00:00", 3.9, "ZA1", "interior"),  # bajo el umbral
    ("h9", "2026-01-01T00:00:00", 5.5, "ZA1", "interior"), ("h10", "2024-12-31T23:59:59", 5.5, "ZA1", "interior"),  # fuera del periodo
    ("h11", "2025-03-01T00:00:00", None, "ZA1", "interior"),  # magnitud nula: no cumple el umbral
]
# live.evento_actual: (id, instante, mag, país, resultado, retirado)
LIVE = [
    ("l1", "2026-11-02T10:00:00", 4.3, "ZA1", "interior", False), ("l2", "2026-11-03T10:00:00", 5.0, "ZA1", "interior", False),
    ("l3", "2026-11-04T10:00:00", 4.4, None, "sin_pais", False), ("l4", "2026-11-04T11:00:00", 4.0, "ZB1", "interior", False),
    ("l5", "2026-11-05T11:00:00", 6.0, "ZA1", "interior", True),  # retirado (reclasificado a no sísmico)
    ("l6", "2026-11-05T12:00:00", 3.5, "ZA1", "interior", False),  # bajo el umbral
    ("l7", "2026-11-06T12:00:00", None, "ZA1", "interior", False),  # magnitud nula
    ("l8", "2026-10-31T23:59:59", 5.0, "ZA1", "interior", False), ("l9", "2026-11-08T00:00:00", 5.0, "ZA1", "interior", False),  # fuera de la ventana
]


def conninfo(base):
    r = ConfigPostgres.desde_entorno()
    return r.conninfo().replace(f"dbname={r.base}", f"dbname={base}")


@pytest.fixture(scope="module")
def conn():
    with psycopg.connect(ConfigPostgres.desde_entorno().conninfo(), autocommit=True) as admin:
        admin.execute(f'DROP DATABASE IF EXISTS "{BASE}"')  # solo la base temporal de esta prueba
        admin.execute(f'CREATE DATABASE "{BASE}"')
    try:
        with psycopg.connect(conninfo(BASE), autocommit=True) as c:
            for nombre in ("001_esquema_live.sql", "002_esquema_f3.sql", "003_esquema_f4.sql", "005_fuente_emsc.sql"):
                c.execute((SQL_DIR / nombre).read_text(encoding="utf-8"))
            c.execute("CREATE SCHEMA sintetico")
            c.execute("CREATE TABLE sintetico.evento_actual (LIKE live.evento_actual INCLUDING ALL)")
            c.execute("INSERT INTO geo.catalogo (sha256, archivo, entidades) VALUES (%s, 'toy', 3)", (SHA,))
            for p in ("ZA1", "ZB1", "ZC1"):
                c.execute("INSERT INTO geo.pais (country_id, nombre_es) VALUES (%s, %s)", (p, p))
            cid = c.execute("INSERT INTO historico.consulta (inicio, fin, filtros, url, resultado) VALUES ('2025-01-01', '2026-01-01', '{}', 'x', 'ok') RETURNING id").fetchone()[0]
            for i, t, mag, pais, res in HISTORICO:
                c.execute("INSERT INTO historico.evento (event_id, event_time, updated_at, mag, longitude, latitude, country_id, geo_resultado, geo_catalogo, origen, consulta_id, raw) "
                          "VALUES (%s, %s, %s, %s, 0, 0, %s, %s, %s, 'historico-usgs-fdsn', %s, %s)",
                          (i, dt(t), dt(t), mag, pais, res, SHA, cid, Jsonb({"properties": {"type": "earthquake"}})))
            insertar_live(c, "live.evento_actual", LIVE)
            # eventos del esquema sintético en las MISMAS fechas (en ambos periodos): no deben contarse nunca
            insertar_live(c, "sintetico.evento_actual", [(f"s{i}", t, 5.0, "ZA1", "interior", False) for i, t in enumerate(("2025-01-01T10:00:00", "2026-11-03T10:00:00", "2026-11-04T10:00:00"))])
            c.execute("UPDATE live.estado_ingesta SET ultima_consulta_ok_at = %s WHERE id = 1", (dt("2026-11-08T12:00:00"),))
        with psycopg.connect(conninfo(BASE), autocommit=True) as c:
            yield c
    finally:
        with psycopg.connect(ConfigPostgres.desde_entorno().conninfo(), autocommit=True) as admin:
            admin.execute(f'DROP DATABASE IF EXISTS "{BASE}"')


def insertar_live(c, tabla, filas):
    for i, t, mag, pais, res, retirado in filas:
        c.execute(f"INSERT INTO {tabla} (event_id, event_time, updated_at, mag, longitude, latitude, source, mode, ingested_at, kafka_topic, kafka_partition, "
                  "kafka_offset, raw, country_id, geo_resultado, geo_catalogo, retirado) VALUES (%s, %s, %s, %s, 0, 0, 'usgs-all-day', 'live', %s, 't', 0, %s, '{}'::jsonb, "
                  "%s, %s, %s, %s)", (i, dt(t), dt(t), mag, dt("2026-10-30T00:00:00") if i == "l8" else dt("2026-11-01T12:00:00"), abs(hash(i)) % 10**9,
                                      pais, res, SHA, retirado))


@pytest.fixture
def comparar(conn):
    from comparacion import comparar as f
    return lambda ambito="global", pais=None, min_mag=4.0, desde=DESDE, hasta=HASTA, h_desde=H_DESDE, h_hasta=H_HASTA: f(conn, ambito, pais, min_mag, desde, hasta, h_desde, h_hasta)


def serie(conn, ambito="global", pais=None, min_mag=4.0, h_desde=H_DESDE, h_hasta=H_HASTA):
    from comparacion import cargar_consultas
    p = {"ambito": ambito, "pais": pais, "min_mag": min_mag, "h_desde": h_desde, "h_hasta": h_hasta}
    return [f[1] for f in conn.execute(cargar_consultas()["historico_serie_diaria"], p).fetchall()]


def esperado_historico(ambito="global", pais=None, min_mag=4.0):
    """Recuento independiente en Python sobre la lista de datos de la prueba."""
    return [i for i, t, mag, p, res in HISTORICO
            if H_DESDE <= dt(t) < H_HASTA and mag is not None and mag >= max(min_mag, 4.0)
            and (ambito == "global" or (ambito == "pais" and p == pais) or (ambito == "sin_pais" and res == "sin_pais"))]


# ----------------------------------------------------------------------------------------------------------------------------------
def test_media_diaria_global_es_total_entre_365_incluyendo_los_dias_de_cero(comparar, conn):
    c = comparar()
    esperados = esperado_historico()
    assert c.total_historico == len(esperados) == 7 and c.dias_historico == 365
    assert c.media_diaria == pytest.approx(7 / 365)
    s = serie(conn)
    assert len(s) == 365 and sum(s) == 7 and s.count(0) == 365 - 4  # 4 días con eventos; los 361 restantes aportan 0 al denominador
    assert c.media_diaria != pytest.approx(7 / 4)  # sin ceros la media estaría inflada


@pytest.mark.parametrize("ambito,pais", [("pais", "ZA1"), ("pais", "ZB1"), ("sin_pais", None), ("pais", "ZC1")])
def test_ambito_de_un_pais_y_sin_pais(comparar, ambito, pais):
    c = comparar(ambito, pais)
    assert c.total_historico == len(esperado_historico(ambito, pais))
    assert c.media_diaria == pytest.approx(len(esperado_historico(ambito, pais)) / 365)


def test_el_ambito_sin_pais_usa_geo_resultado_y_no_country_id_nulo(comparar, conn):
    conn.execute("INSERT INTO live.evento_actual (event_id, event_time, updated_at, mag, longitude, latitude, source, mode, ingested_at, kafka_topic, kafka_partition, kafka_offset, raw) "
                 "VALUES ('sinasignar', '2026-11-03', '2026-11-03', 5, 0, 0, 'usgs-all-day', 'live', now(), 't', 0, 1, '{}'::jsonb)")  # país nulo y geo_resultado nulo
    try:
        from comparacion import ComparacionNoValida
        with pytest.raises(ComparacionNoValida, match="sin geo_resultado"):  # precondición: geo_resultado IS NULL = 0 filas
            comparar("sin_pais")
    finally:
        conn.execute("DELETE FROM live.evento_actual WHERE event_id = 'sinasignar'")
    assert comparar("sin_pais").reciente == 1  # solo l3 (geo_resultado = 'sin_pais')


def test_la_magnitud_nula_no_cumple_el_umbral_y_se_cuenta_aparte(comparar):
    c = comparar()
    assert c.reciente_mag_nula == 1  # l7
    assert c.total_historico == 7  # h11 (mag nula) no entra en el total histórico
    assert c.reciente == 4  # l1, l2, l3, l4: sin retirado (l5), sin <4 (l6), sin nula (l7) ni fuera de la ventana (l8, l9)


def test_el_reciente_excluye_retirados_y_otros_esquemas(comparar):
    c = comparar()
    assert c.reciente == 4  # el sintético (s1, s2) tiene fechas de la ventana y NO se cuenta; el retirado l5 tampoco
    assert comparar("pais", "ZA1").reciente == 2 and comparar("pais", "ZB1").reciente == 1


def test_variacion_es_reciente_menos_media_entre_media_y_no_definida_si_la_media_es_cero(comparar):
    c = comparar()
    assert c.variacion == pytest.approx((4 - 7 / 365) / (7 / 365))
    assert c.texto_variacion().startswith("+")
    vacio = comparar("pais", "ZC1")  # ZC1 no tiene eventos en 2025: media 0
    assert vacio.media_diaria == 0 and vacio.variacion is None and vacio.variacion_horaria is None and vacio.texto_variacion() == "no definida"


def test_un_umbral_menor_que_4_se_eleva_a_4_en_ambos_periodos_y_se_indica(comparar):
    base, bajo, alto = comparar(), comparar(min_mag=2.0), comparar(min_mag=5.0)
    assert bajo.min_mag_elevada and bajo.min_mag_aplicada == 4.0 and not base.min_mag_elevada
    assert (bajo.total_historico, bajo.reciente) == (base.total_historico, base.reciente)  # h8 (3.9) y l6 (3.5) siguen fuera
    assert alto.min_mag_aplicada == 5.0 and alto.total_historico == len(esperado_historico(min_mag=5.0)) == 2  # h3 (6.0) y h4 (5.0)
    assert alto.reciente == 1  # solo l2 (5.0)


def test_ventana_horaria_media_es_total_entre_8760_horas(comparar):
    c = comparar()
    assert c.media_horaria == pytest.approx(7 / 8760)
    horas = (HASTA - DESDE).total_seconds() / 3600  # 168 h
    assert c.variacion_horaria == pytest.approx((4 - 7 / 8760 * horas) / (7 / 8760 * horas))


def test_los_dias_se_derivan_del_intervalo_y_no_son_fijos_365_y_la_mediana_se_calcula_con_los_ceros(comparar, conn):
    c = comparar(h_desde=dt("2025-01-01T00:00:00"), h_hasta=dt("2025-01-04T00:00:00"))  # 3 días: 3 + 0 + 2 eventos
    assert c.dias_historico == 3 and c.total_historico == 5
    assert c.media_diaria == pytest.approx(5 / 3) and c.media_horaria == pytest.approx(5 / 72)
    assert serie(conn, h_desde=dt("2025-01-01T00:00:00"), h_hasta=dt("2025-01-04T00:00:00")) == [3, 0, 2]
    assert c.mediana_diaria == statistics.median([3, 0, 2]) == 2
    anual = comparar()
    assert anual.mediana_diaria == statistics.median(serie(conn)) == 0 and anual.media_diaria > anual.mediana_diaria  # la media supera a la mediana


def test_un_periodo_historico_que_no_es_un_numero_entero_de_dias_se_rechaza(comparar):
    from comparacion import ComparacionNoValida
    with pytest.raises(ComparacionNoValida, match="entero de días"):
        comparar(h_desde=dt("2025-01-01T00:00:00"), h_hasta=dt("2025-01-02T12:00:00"))
    with pytest.raises(ComparacionNoValida):
        comparar(desde=HASTA, hasta=DESDE)


def test_ventana_que_intersecta_un_hueco_pendiente_se_marca_incompleta_y_si_esta_recuperado_no(comparar, conn):
    base = comparar()
    assert not any("hueco" in m for m in base.motivos_incompleto)
    cid = conn.execute("INSERT INTO live.hueco (inicio, fin) VALUES (%s, %s) RETURNING id", (dt("2026-11-03T00:00:00"), dt("2026-11-03T12:00:00"))).fetchone()[0]
    try:
        c = comparar()
        assert c.periodo_reciente_incompleto and any("hueco" in m for m in c.motivos_incompleto)
        assert not any("hueco" in m for m in comparar(desde=dt("2026-11-04T00:00:00")).motivos_incompleto)  # ventana posterior al hueco
        conn.execute("UPDATE live.hueco SET estado = 'recuperado' WHERE id = %s", (cid,))
        assert not any("hueco" in m for m in comparar().motivos_incompleto)
    finally:
        conn.execute("DELETE FROM live.hueco WHERE id = %s", (cid,))


def test_periodo_reciente_incompleto_por_cobertura_y_por_ventana_aun_abierta(comparar):
    completa = comparar(desde=dt("2026-11-02T00:00:00"), hasta=dt("2026-11-07T00:00:00"))  # cobertura desde 2026-10-30 12:00; última lectura 11-08 12:00
    assert not completa.periodo_reciente_incompleto and completa.motivos_incompleto == []
    antes = comparar(desde=dt("2026-10-01T00:00:00"), hasta=dt("2026-11-07T00:00:00"))
    assert antes.periodo_reciente_incompleto and any("cobertura" in m for m in antes.motivos_incompleto)
    abierta = comparar(desde=dt("2026-11-07T00:00:00"), hasta=dt("2026-11-09T00:00:00"))
    assert abierta.periodo_reciente_incompleto and any("última lectura" in m for m in abierta.motivos_incompleto)


def test_una_sesion_con_otra_zona_horaria_da_el_mismo_resultado_porque_se_fuerza_utc(comparar, conn):
    esperado = comparar()
    conn.execute("SET TIME ZONE 'Asia/Tokyo'")
    otra = comparar()
    assert (otra.total_historico, otra.reciente, otra.media_diaria, otra.mediana_diaria) == (esperado.total_historico, esperado.reciente, esperado.media_diaria, esperado.mediana_diaria)
    assert conn.execute("SHOW TIME ZONE").fetchone()[0] == "UTC"
    # el evento h3 (2025-01-01T23:59:59Z) sería del 2 de enero en Tokio: la serie diaria lo cuenta el 1 (UTC)
    assert serie(conn)[0] == 3


def test_no_mezcla_esquemas_historico_live_y_sintetico(comparar, conn):
    from comparacion import cargar_consultas
    consultas = cargar_consultas()
    for nombre, sql in consultas.items():
        assert "sintetico" not in sql.lower(), nombre
        usa_historico, usa_live = "historico.evento" in sql, "live." in sql
        assert not (usa_historico and usa_live), f"{nombre} mezcla historico y live"
    # un evento histórico con fecha reciente NO aumenta el recuento reciente; uno en vivo con fecha de 2025 NO aumenta el histórico
    base = comparar()
    conn.execute("INSERT INTO historico.evento (event_id, event_time, updated_at, mag, longitude, latitude, country_id, geo_resultado, geo_catalogo, origen, consulta_id, raw) "
                 "SELECT 'hx', '2026-11-03', '2026-11-03', 6, 0, 0, 'ZA1', 'interior', %s, 'historico-usgs-fdsn', min(id), '{\"properties\":{\"type\":\"earthquake\"}}'::jsonb FROM historico.consulta", (SHA,))
    insertar_live(conn, "live.evento_actual", [("lx", "2025-02-02T10:00:00", 6.0, "ZA1", "interior", False)])
    try:
        mezcla = comparar()
        assert mezcla.reciente == base.reciente and mezcla.total_historico == base.total_historico
    finally:
        conn.execute("DELETE FROM historico.evento WHERE event_id = 'hx'")
        conn.execute("DELETE FROM live.evento_actual WHERE event_id = 'lx'")
    assert comparar().reciente == base.reciente


def test_el_archivo_sql_define_todas_las_consultas_del_contrato():
    from comparacion import cargar_consultas
    assert set(cargar_consultas()) == {"precondicion_sin_asignar", "historico_total", "historico_serie_diaria", "historico_mediana_diaria",
                                       "reciente_total", "reciente_mag_nula", "hueco_pendiente", "cobertura_live"}
