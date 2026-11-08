"""Comparación del periodo seleccionado con la media diaria de 2025 (F5, paso 5.3; ENUNCIADO §8.4).

Es el ÚNICO módulo de la API que lee `historico.evento` (DF6), solo con SELECT agregado y dentro de la misma transacción de lectura de la petición.
La semántica es la validada en F4 (`sql/consultas/comparacion.sql`, `scripts/f4/comparacion.py`): media = total / 365 con los días de cero eventos en el
denominador, mismo ámbito (global, un país o «sin país») y misma magnitud mínima en ambos periodos (siempre ≥ 4, porque el histórico solo la contiene), tipo
`earthquake`, tiempo del EVENTO en UTC. `test_api_comparacion.py` exige que ambos den el mismo resultado sobre los mismos datos.
El histórico es una instantánea revisada y el periodo reciente es preliminar: el panel lo advierte con `periodo_reciente_incompleto` y sus motivos.
"""

from dataclasses import replace
from datetime import datetime, timezone
from decimal import Decimal

from observatorio.api.filtros import SIN_PAIS, Filtros

MAG_MINIMA = 4  # el histórico de 2025 solo contiene magnitud >= 4
H_DESDE = datetime(2025, 1, 1, tzinfo=timezone.utc)
H_HASTA = datetime(2026, 1, 1, tzinfo=timezone.utc)
DIAS_HISTORICO = (H_HASTA - H_DESDE).days  # 365: 2025 no es bisiesto
MOTIVOS = ("hueco_pendiente", "antes_de_cobertura", "hasta_ahora", "despues_de_ultima_lectura")

# Ámbito del histórico: los mismos tres casos que el filtro de país (misma regla que Filtros.donde).
AMBITO = ("(%(ambito)s::text = 'global' OR (%(ambito)s::text = 'pais' AND country_id = %(pais)s::text) "
          "OR (%(ambito)s::text = 'sin_pais' AND geo_resultado = 'sin_pais'))")
HISTORICO_DONDE = ("event_time >= %(h_desde)s AND event_time < %(h_hasta)s AND raw -> 'properties' ->> 'type' = 'earthquake' "
                   "AND mag >= %(min_mag)s AND " + AMBITO)
SQL_HISTORICO_DISPONIBLE = "SELECT count(*) FROM historico.evento WHERE event_time >= %(h_desde)s AND event_time < %(h_hasta)s"
SQL_HISTORICO_TOTAL = "SELECT count(*) FROM historico.evento WHERE " + HISTORICO_DONDE
# Serie diaria completa: los días sin eventos aportan 0 (van al denominador de la mediana); se agrupa primero y después se rellena.
SQL_HISTORICO_MEDIANA = """
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY eventos)
FROM (
  SELECT coalesce(c.eventos, 0) AS eventos
  FROM generate_series(0, %(dias)s - 1) n
  LEFT JOIN (
    SELECT floor(extract(epoch FROM event_time - %(h_desde)s) / 86400)::int AS n, count(*) AS eventos
    FROM historico.evento WHERE """ + HISTORICO_DONDE + """
    GROUP BY 1
  ) c USING (n)
) s
"""
SQL_HUECOS_PENDIENTES = "SELECT count(*) FROM live.hueco WHERE estado = 'pendiente'"  # para /api/salud (mismo origen que el motivo hueco_pendiente)
SQL_HUECO_PENDIENTE = "SELECT EXISTS (SELECT 1 FROM live.hueco WHERE estado = 'pendiente' AND inicio < %(f_end)s AND fin > %(f_start)s)"
# Inicio de la cobertura real de live (definición de F4): primera ingesta menos las 24 h que cubre el feed.
SQL_COBERTURA = "SELECT (extract(epoch FROM min(ingested_at) - interval '24 hours') * 1000)::bigint FROM live.evento_actual"
SQL_ULTIMA_INGESTION = "SELECT (extract(epoch FROM ultima_consulta_ok_at) * 1000)::bigint FROM live.estado_ingesta WHERE id = 1"


def _ambito(filtros: Filtros) -> tuple[str, str | None]:
    if filtros.country_id is None:
        return "global", None
    return ("sin_pais", None) if filtros.country_id == SIN_PAIS else ("pais", filtros.country_id)


async def calcular(conn, filtros: Filtros, generado_ms: int, margen_publicacion_s: int) -> dict:
    """Bloque `comparacion` de /api/estadisticas para el periodo y el ámbito de `filtros`."""
    ambito, pais = _ambito(filtros)
    efectiva = max(filtros.min_mag if filtros.min_mag is not None else Decimal(MAG_MINIMA), Decimal(MAG_MINIMA))
    reciente = replace(filtros, min_mag=efectiva)  # mismo periodo y ámbito, umbral efectivo (>= 4)
    donde, parametros = reciente.donde()
    sin_umbral, parametros_sin_umbral = reciente.donde(con_magnitud=False)
    dias_ventana = (filtros.end - filtros.start).total_seconds() / 86400

    async def uno(sql, params):
        return (await (await conn.execute(sql, params)).fetchone())[0]

    cuenta = await uno(f"SELECT count(*) FROM live.evento_actual WHERE {donde}", parametros)
    nulos = await uno(f"SELECT count(*) FROM live.evento_actual WHERE {sin_umbral} AND mag IS NULL", parametros_sin_umbral)

    # Motivos por los que el periodo reciente puede estar incompleto (reglas de cobertura y huecos de F4 + retraso de publicación de USGS).
    inicio_ms, fin_ms = filtros.periodo["start"], filtros.periodo["end"]
    cobertura = await uno(SQL_COBERTURA, ())
    fila_ultima = await (await conn.execute(SQL_ULTIMA_INGESTION)).fetchone()
    ultima = fila_ultima[0] if fila_ultima else None
    motivos = []
    if await uno(SQL_HUECO_PENDIENTE, {"f_start": filtros.start, "f_end": filtros.end}):
        motivos.append("hueco_pendiente")
    if cobertura is None or inicio_ms < cobertura:
        motivos.append("antes_de_cobertura")
    if fin_ms > generado_ms - margen_publicacion_s * 1000:
        motivos.append("hasta_ahora")
    if ultima is None or fin_ms > ultima:
        motivos.append("despues_de_ultima_lectura")

    resultado = {
        "unit": "events", "comparacion_disponible": False, "ambito": ambito, "country_id": pais,
        "min_mag_solicitada": None if filtros.min_mag is None else float(filtros.min_mag),
        "min_mag_efectiva": float(efectiva),
        "min_mag_elevada": filtros.min_mag is None or filtros.min_mag < MAG_MINIMA,
        "reciente": {"source": "live", "count": cuenta, "sin_magnitud": nulos, "desde": inicio_ms, "hasta": fin_ms, "dias": dias_ventana},
        "historico": None, "variacion": None, "variacion_definida": False,
        "periodo_reciente_incompleto": bool(motivos), "motivos_incompleto": motivos,
    }
    h = {"h_desde": H_DESDE, "h_hasta": H_HASTA, "min_mag": efectiva, "ambito": ambito, "pais": pais, "dias": DIAS_HISTORICO}
    if not await uno(SQL_HISTORICO_DISPONIBLE, h):  # sin histórico cargado nunca se inventan ceros
        return resultado
    total = await uno(SQL_HISTORICO_TOTAL, h)
    media = total / DIAS_HISTORICO
    esperado = media * dias_ventana
    resultado["comparacion_disponible"] = True
    resultado["historico"] = {
        "source": "historico", "periodo": {"desde": H_DESDE.date().isoformat(), "hasta": H_HASTA.date().isoformat()}, "dias": DIAS_HISTORICO,
        "total": total, "media_diaria": media, "mediana_diaria": float(await uno(SQL_HISTORICO_MEDIANA, h)), "esperado_para_ventana": esperado}
    if esperado > 0:  # media 0: la variación queda «no definida» (null), nunca 0 ni infinito
        resultado["variacion"] = (cuenta - esperado) / esperado
        resultado["variacion_definida"] = True
    return resultado
