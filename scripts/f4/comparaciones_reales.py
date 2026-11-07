"""Comparaciones con DATOS REALES y contraste con un recuento independiente (F4, paso 4.6, T056; SC-010). Solo lectura.

Las consultas de sql/consultas/comparacion.sql se ejecutan sobre `historico.evento` y `live.evento_actual`. El recuento independiente NO usa esas
tablas para el histórico: descomprime los archivos originales de `historico.archivo`, cuenta los terremotos de 2025 con magnitud >= 4 y asigna el
país con un recorrido secuencial de los 177 polígonos (sin el índice espacial del asignador). Uso (contenedor del producer con /scripts, /sql y el
catálogo montados):  python -X utf8 /scripts/comparaciones_reales.py
"""

import gzip
import json
import os
import statistics
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import psycopg
from shapely import make_valid
from shapely.geometry import Point, shape

from comparacion import ComparacionNoValida, comparar

UTC = timezone.utc
H_DESDE, H_HASTA = datetime(2025, 1, 1, tzinfo=UTC), datetime(2026, 1, 1, tzinfo=UTC)
conn = psycopg.connect(f"host={os.environ['POSTGRES_HOST']} dbname={os.environ['POSTGRES_DB']} user={os.environ['POSTGRES_USER']} password={os.environ['POSTGRES_PASSWORD']}", autocommit=True)
fallos = []


def comprobar(cond, texto):
    print(("  OK    " if cond else "  FALLA ") + texto)
    if not cond:
        fallos.append(texto)


print("== Precondición ==")
sin_asignar = conn.execute("SELECT count(*) FROM live.evento_actual WHERE geo_resultado IS NULL").fetchone()[0]
comprobar(sin_asignar == 0, f"live.evento_actual con geo_resultado IS NULL = {sin_asignar} (debe ser 0)")

print("\n== Recuento independiente del histórico (archivos originales + polígonos, sin tocar historico.evento) ==")
catalogo = json.load(open(os.environ.get("CATALOGO_PATH", "/datos/paises.geojson"), encoding="utf-8"))
geoms = sorted((f["properties"]["ADM0_A3"], make_valid(g) if not g.is_valid else g) for f in catalogo["features"] for g in [shape(f["geometry"])])
indep = []  # (instante UTC, mag, país o None)
for gz, in conn.execute("SELECT a.contenido_gz FROM historico.archivo a JOIN historico.consulta c ON c.id = a.consulta_id ORDER BY c.inicio").fetchall():
    for f in json.loads(gzip.decompress(bytes(gz)))["features"]:
        p = f["properties"]
        if p.get("type") != "earthquake" or p.get("mag") is None or p["mag"] < 4:
            continue
        t = datetime.fromtimestamp(p["time"] / 1000, tz=UTC)
        if not H_DESDE <= t < H_HASTA:
            continue
        lon, lat = f["geometry"]["coordinates"][:2]
        punto = Point(lon, lat)
        dueño = next((c for c, g in geoms if g.covers(punto)), None)  # menor ADM0_A3 que cubra el punto
        indep.append((t, p["mag"], dueño))
print(f"terremotos de 2025 con magnitud >= 4 en los archivos: {len(indep)}")


def indep_ambito(ambito, pais):
    return [e for e in indep if ambito == "global" or (ambito == "pais" and e[2] == pais) or (ambito == "sin_pais" and e[2] is None)]


top = Counter(e[2] for e in indep if e[2]).most_common(1)[0][0]
print(f"país con más eventos: {top}\n")
ambitos = [("global", None), ("pais", top), ("sin_pais", None), ("pais", "CHL")]

print("== Histórico: SQL frente a recuento independiente (media diaria = total / 365, con días de cero) ==")
print(f"{'ámbito':<14}{'total SQL':>10}{'total indep.':>13}{'media/día':>11}{'mediana/día':>12}{'días con 0':>11}")
for ambito, pais in ambitos:
    c = comparar(conn, ambito, pais, 4.0, datetime(2026, 11, 6, tzinfo=UTC), datetime(2026, 11, 7, tzinfo=UTC), H_DESDE, H_HASTA)
    ev = indep_ambito(ambito, pais)
    por_dia = Counter(e[0].date() for e in ev)
    serie = [por_dia.get(date(2025, 1, 1) + timedelta(days=i), 0) for i in range(365)]
    etiqueta = ambito if ambito != "pais" else f"país {pais}"
    print(f"{etiqueta:<14}{c.total_historico:>10}{len(ev):>13}{c.media_diaria:>11.3f}{c.mediana_diaria:>12.1f}{serie.count(0):>11}")
    comprobar(c.total_historico == len(ev), f"{etiqueta}: total SQL = recuento independiente ({len(ev)})")
    comprobar(abs(c.media_diaria - len(ev) / 365) < 1e-12, f"{etiqueta}: media diaria = {len(ev)} / 365 = {len(ev) / 365:.4f}")
    comprobar(c.mediana_diaria == statistics.median(serie), f"{etiqueta}: mediana diaria SQL = mediana independiente ({statistics.median(serie)})")
    comprobar(abs(c.media_horaria - len(ev) / 8760) < 1e-12, f"{etiqueta}: media horaria = {len(ev)} / 8760")

print("\n== Comparación con la actividad reciente (live.evento_actual, sin retirados) ==")
cobertura = conn.execute("SELECT min(ingested_at) - interval '24 hours', max(event_time), (SELECT ultima_consulta_ok_at FROM live.estado_ingesta) FROM live.evento_actual").fetchone()
print(f"cobertura en vivo: desde {cobertura[0]:%Y-%m-%d %H:%M} UTC; evento más reciente {cobertura[1]:%Y-%m-%d %H:%M}; última lectura del feed {cobertura[2]:%Y-%m-%d %H:%M} UTC")
hoy = cobertura[2].replace(hour=0, minute=0, second=0, microsecond=0)
ventanas = [("día UTC completo anterior", hoy - timedelta(days=1), hoy), ("últimos 7 días", hoy - timedelta(days=6), hoy + timedelta(days=1))]
filas_live = conn.execute("SELECT event_time, mag, country_id, geo_resultado FROM live.evento_actual WHERE NOT retirado").fetchall()
print(f"{'ventana':<26}{'ámbito':<12}{'reciente':>9}{'indep.':>7}{'media/día':>10}{'variación':>12}  incompleta")
for nombre, desde, hasta in ventanas:
    for ambito, pais in ambitos[:3]:
        c = comparar(conn, ambito, pais, 4.0, desde, hasta, H_DESDE, H_HASTA)
        n = sum(1 for t, mag, cp, res in filas_live if desde <= t < hasta and mag is not None and mag >= 4
                and (ambito == "global" or (ambito == "pais" and cp == pais) or (ambito == "sin_pais" and res == "sin_pais")))
        etiqueta = ambito if ambito != "pais" else f"país {pais}"
        print(f"{nombre:<26}{etiqueta:<12}{c.reciente:>9}{n:>7}{c.media_diaria:>10.3f}{c.texto_variacion():>12}  {'SÍ' if c.periodo_reciente_incompleto else 'no'}")
        comprobar(c.reciente == n, f"{nombre} / {etiqueta}: reciente SQL = recuento independiente ({n})")
        if c.periodo_reciente_incompleto:
            for m in c.motivos_incompleto:
                print(f"{'':<38}· {m}")
print("\n== Magnitud nula y umbral < 4 ==")
c2 = comparar(conn, "global", None, 2.0, hoy - timedelta(days=1), hoy, H_DESDE, H_HASTA)
comprobar(c2.min_mag_elevada and c2.min_mag_aplicada == 4.0, "un umbral pedido de 2,0 se eleva a 4,0 en ambos periodos y se indica")
print(f"  eventos recientes con magnitud nula en esa ventana: {c2.reciente_mag_nula} (no se incluyen en ningún umbral)")

print("\nSESGOS (R-010): el histórico es la instantánea REVISADA del catálogo y el reciente son datos preliminares que pueden revisarse;")
print("la media anual está inflada por secuencias de réplicas (julio de 2025: 2 684 eventos frente a ~1 300 en otros meses), por eso se da también la mediana;")
print("con medias casi nulas (países pequeños, ventana horaria) la variación porcentual es inestable; la cobertura en vivo es de ~1-2 días, así que")
print("las ventanas largas son incompletas; y el reparto por país depende de la escala 1:110 M del catálogo (78 % de los eventos históricos sin país).")
print("\nRESULTADO:", "OK" if not fallos else f"FALLAN {len(fallos)}")
raise SystemExit(1 if fallos else 0)
