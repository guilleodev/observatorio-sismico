"""Matriz del paso 5.3 contra la API REAL desplegada (F5, T022): serie horaria UTC y comparación con 2025. SOLO LECTURA.

Oráculos independientes de la API: (a) Python sobre las filas de `live.evento_actual` y `historico.evento` leídas con SELECT; (b) la implementación de referencia de F4
(`scripts/f4/comparacion.py` + `sql/consultas/comparacion.sql`). Las ventanas «completas» terminan en un instante FIJO anterior al último evento.
Uso (contenedor de pruebas):  python /scripts5/matriz_53.py [http://api:8000]
"""

import json
import os
import statistics
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import psycopg

sys.path.insert(0, "/scripts")
from comparacion import comparar  # noqa: E402  (referencia de F4)

API = (sys.argv[1] if len(sys.argv) > 1 else "http://api:8000").rstrip("/")
UTC = timezone.utc
H = 3_600_000
H_DESDE, H_HASTA = datetime(2025, 1, 1, tzinfo=UTC), datetime(2026, 1, 1, tzinfo=UTC)
fallos = []


def comprobar(cond, texto):
    print(("  OK    " if cond else "  FALLA ") + texto)
    if not cond:
        fallos.append(texto)


def get(ruta, **params):
    url = f"{API}{ruta}" + (("?" + urllib.parse.urlencode(params)) if params else "")
    try:
        with urllib.request.urlopen(urllib.request.Request(url), timeout=60) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read())


conn = psycopg.connect(f"host={os.environ['POSTGRES_HOST']} dbname={os.environ['POSTGRES_DB']} user={os.environ['POSTGRES_USER']} password={os.environ['POSTGRES_PASSWORD']}", autocommit=True)
conn.execute("SET TIME ZONE 'UTC'")
vivo = conn.execute("SELECT event_id, event_time, mag, country_id, geo_resultado, retirado, ingested_at FROM live.evento_actual").fetchall()
historico = conn.execute("SELECT event_time, mag, country_id, geo_resultado, raw->'properties'->>'type' FROM historico.evento").fetchall()
ultima_ok = conn.execute("SELECT ultima_consulta_ok_at FROM live.estado_ingesta").fetchone()[0]
huecos = conn.execute("SELECT count(*) FROM live.hueco WHERE estado = 'pendiente'").fetchone()[0]
t_max = max(f[1] for f in vivo)
fin = (t_max - timedelta(hours=1)).replace(microsecond=0)
iso = lambda d: d.isoformat().replace("+00:00", "Z")
ms = lambda d: int(d.timestamp() * 1000)
print(f"# 5.3 T022 - matriz contra la API real {datetime.now(UTC):%Y-%m-%dT%H:%M:%SZ}  ({API})")
print(f"live.evento_actual: {len(vivo)} filas | historico.evento: {len(historico)} | huecos pendientes: {huecos} | última lectura correcta: {ultima_ok:%Y-%m-%d %H:%M:%S}Z | ventana fija termina en {iso(fin)}\n")


def ambito_ok(pais, resultado, c):
    return c is None or (resultado == "sin_pais" if c == "sin_pais" else pais == c)


print("== 1. Serie por hora UTC frente al oráculo (cuentas con división entera de milisegundos) ==")
paises = {}
for f in vivo:
    if f[3]:
        paises[f[3]] = paises.get(f[3], 0) + 1
top = max(paises, key=paises.get)
casos_h = [
    ("36 h", fin - timedelta(hours=36), fin, {}),
    (f"36 h país {top}", fin - timedelta(hours=36), fin, {"country_id": top}),
    ("36 h sin_pais", fin - timedelta(hours=36), fin, {"country_id": "sin_pais"}),
    ("36 h min_mag 3", fin - timedelta(hours=36), fin, {"min_mag": "3"}),
    ("6 h parcial (mitad de hora)", fin - timedelta(hours=6, minutes=17), fin, {}),
    ("1 hora", fin - timedelta(hours=1), fin, {}),
    ("periodo sin eventos", datetime(2020, 1, 1, tzinfo=UTC), datetime(2020, 1, 1, 5, 30, tzinfo=UTC), {}),
]
for nombre, a, b, filtros in casos_h:
    st, r = get("/api/estadisticas", start=iso(a), end=iso(b), **filtros)
    ambito_pedido = filtros.get("country_id")
    umbral = float(filtros["min_mag"]) if "min_mag" in filtros else None
    sel = [f for f in vivo if not f[5] and a <= f[1] < b and ambito_ok(f[3], f[4], ambito_pedido)
           and (umbral is None or (f[2] is not None and float(f[2]) >= umbral))]
    primera = ms(a) - ms(a) % H
    n = -(-(ms(b) - primera) // H)
    cuentas = {primera + i * H: 0 for i in range(n)}
    for f in sel:
        cuentas[ms(f[1]) - ms(f[1]) % H] += 1
    esperado = [{"hour": h, "count": c} for h, c in cuentas.items()]
    comprobar(st == 200 and r["por_hora"]["items"] == esperado and sum(i["count"] for i in esperado) == r["total"] == len(sel),
              f"{nombre}: {len(esperado)} casillas ({sum(1 for i in esperado if i['count'] == 0)} a cero), Σ = total = {r['total']} = oráculo {len(sel)}")
st, r = get("/api/estadisticas")
comprobar(len(r["por_hora"]["items"]) == 25 and r["por_hora"]["items"][-1]["hour"] == r["generated"] - r["generated"] % H, "periodo por defecto: 25 casillas, la última es la hora UTC en curso")

print("\n== 2. Límite de 744 casillas: se omite SOLO la serie ==")
fin_h = fin.replace(minute=0, second=0)
st, r = get("/api/estadisticas", start=iso(fin_h - timedelta(hours=744)), end=iso(fin_h))
comprobar(st == 200 and len(r["por_hora"]["items"]) == 744, "744 casillas justas: serie completa")
st, r2 = get("/api/estadisticas", start=iso(fin_h - timedelta(hours=744)), end=iso(fin_h + timedelta(seconds=1)))
comprobar(st == 200 and r2["por_hora"] == {"unit": "events/hour UTC", "sin_valor": 0, "items": None, "motivo": "ventana_demasiado_amplia", "max_casillas": 744}, "745 casillas (un segundo más): serie omitida con motivo")
comprobar(r2["total"] >= r["total"] and sum(i["count"] for i in r2["por_pais"]["items"]) + r2["por_pais"]["sin_valor"] == r2["total"] and "comparacion" in r2 and len(r2["magnitud"]["items"]) == 10,
          f"el resto de bloques sigue válido (total={r2['total']}, por_pais, magnitud, profundidad, comparación)")

print("\n== 3. Comparación con 2025 frente a un oráculo independiente y a la implementación de F4 ==")


def media_h(c, minimo):
    sel = [h for h in historico if h[4] == "earthquake" and H_DESDE <= h[0] < H_HASTA and h[1] is not None and float(h[1]) >= minimo and ambito_ok(h[2], h[3], c)]
    serie = [0] * 365
    for h in sel:
        serie[(h[0] - H_DESDE).days] += 1
    return len(sel), statistics.median(serie)


sin_historico = [r[0] for r in conn.execute("SELECT p.country_id FROM geo.pais p WHERE NOT EXISTS (SELECT 1 FROM historico.evento e WHERE e.country_id = p.country_id) ORDER BY 1 LIMIT 1")]
casos_c = [
    ("global", None, {}), (top, top, {"country_id": top}), ("sin_pais", "sin_pais", {"country_id": "sin_pais"}),
    ("global min_mag 2 (se eleva a 4)", None, {"min_mag": "2"}), ("global min_mag 5", None, {"min_mag": "5"}),
    (f"{sin_historico[0]} (sin eventos en 2025)", sin_historico[0], {"country_id": sin_historico[0]}),
]
for dias in (1, 3):
    a = fin - timedelta(days=dias)
    for nombre, c, filtros in casos_c:
        st, r = get("/api/estadisticas", start=iso(a), end=iso(fin), **filtros)
        cmp_ = r["comparacion"]
        minimo = max(float(filtros.get("min_mag", 4)), 4.0)
        total, mediana = media_h(c, minimo)
        recientes = [f for f in vivo if not f[5] and a <= f[1] < fin and f[2] is not None and float(f[2]) >= minimo and ambito_ok(f[3], f[4], c)]
        esperado = total / 365 * dias
        ambito = "global" if c is None else ("sin_pais" if c == "sin_pais" else "pais")
        f4 = comparar(conn, ambito, c if ambito == "pais" else None, float(filtros.get("min_mag", 4)), a, fin, H_DESDE, H_HASTA)
        ok = (st == 200 and cmp_["historico"]["total"] == total == f4.total_historico and abs(cmp_["historico"]["media_diaria"] - total / 365) < 1e-12
              and abs(cmp_["historico"]["mediana_diaria"] - mediana) < 1e-9 and cmp_["reciente"]["count"] == len(recientes) == (f4.reciente if dias == 1 else len(recientes))
              and abs(cmp_["historico"]["esperado_para_ventana"] - esperado) < 1e-9 and cmp_["min_mag_efectiva"] == minimo
              and ((cmp_["variacion"] is None) == (esperado == 0)) and cmp_["historico"]["source"] == "historico" and cmp_["reciente"]["source"] == "live")
        if cmp_["variacion"] is not None:
            ok = ok and abs(cmp_["variacion"] - (len(recientes) - esperado) / esperado) < 1e-9
            if dias == 1:
                ok = ok and f4.variacion is not None and abs(cmp_["variacion"] - f4.variacion) < 1e-9
        comprobar(ok, f"{dias} d · {nombre}: reciente={cmp_['reciente']['count']} (nulos {cmp_['reciente']['sin_magnitud']}), 2025={total} → media {total / 365:.4f}/día, esperado {esperado:.4f}, mediana {mediana:g}, "
                       f"variación {'no definida' if cmp_['variacion'] is None else format(cmp_['variacion'], '+.2f')}, incompleto={cmp_['periodo_reciente_incompleto']} {cmp_['motivos_incompleto']}")

print("\n== 4. Periodo reciente incompleto con datos reales ==")
st, r = get("/api/estadisticas", start=iso(fin - timedelta(days=1)), end=iso(fin))
comprobar(r["comparacion"]["periodo_reciente_incompleto"] is False and r["comparacion"]["motivos_incompleto"] == [], "ventana de 24 h que termina 1 h antes del último evento: completa (sin huecos, dentro de la cobertura, anterior a la última lectura)")
st, r = get("/api/estadisticas")
comprobar(r["comparacion"]["periodo_reciente_incompleto"] is True and "hasta_ahora" in r["comparacion"]["motivos_incompleto"], f"ventana por defecto (hasta generated): incompleta {r['comparacion']['motivos_incompleto']}")
cobertura = conn.execute("SELECT min(ingested_at) - interval '24 hours' FROM live.evento_actual").fetchone()[0]
st, r = get("/api/estadisticas", start=iso(cobertura - timedelta(hours=2)), end=iso(fin))
comprobar("antes_de_cobertura" in r["comparacion"]["motivos_incompleto"], f"ventana que empieza 2 h antes de la cobertura ({cobertura:%Y-%m-%d %H:%M}Z): {r['comparacion']['motivos_incompleto']}")
comprobar(huecos == 0, "no hay huecos pendientes reales: el motivo hueco_pendiente se verifica en la base temporal (test_api_comparacion.py)")

print("\n== 5. Contrato y errores ==")
st, r = get("/api/estadisticas")
comprobar(set(r) == {"generated", "period", "filters", "total", "sin_magnitud", "por_pais", "magnitud", "profundidad", "por_hora", "comparacion"}, f"claves: {sorted(r)}")
texto = json.dumps(r)
comprobar("NaN" not in texto and "Infinity" not in texto and "synthetic" not in texto.lower(), "sin NaN/Infinity ni sintético")
for params in (dict(country_id="ATLANTIDA"), dict(min_mag="abc"), dict(limit="5")):
    st, c = get("/api/estadisticas", **params)
    comprobar(st == 422 and "total" not in c, f"{params} -> {st}")

print("\nRESULTADO:", "OK" if not fallos else f"FALLAN {len(fallos)}: {fallos}")
raise SystemExit(1 if fallos else 0)
