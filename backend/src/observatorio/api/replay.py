"""Lectura de la reproducción (F6, paso 6.2; contracts/f6.md §2): ejecuciones y eventos de `replay.*`, solo con SELECT.

Es, junto al selector `filtros.para_modo`, el único código de la API que menciona el esquema `replay`. Nunca lee `live` ni `historico`.
"""

MOTIVO_NO_APLICA = "no_aplica_en_reproduccion"
# La comparación con la media de 2025 compara el periodo EN VIVO con el histórico: en una reproducción no tiene sentido (FR-009).
COMPARACION_NO_APLICA = {"unit": "events", "comparacion_disponible": False, "motivo": MOTIVO_NO_APLICA, "historico": None, "variacion": None}

_COLUMNAS_EJECUCION = """run_id, estado, tamano, velocidad,
       (extract(epoch FROM intervalo_desde) * 1000)::bigint, (extract(epoch FROM intervalo_hasta) * 1000)::bigint,
       (extract(epoch FROM iniciada_at) * 1000)::bigint, (extract(epoch FROM terminada_at) * 1000)::bigint"""
# Por defecto, la ejecución más reciente (incluida una en curso); desempate por run_id para que el resultado sea determinista.
SQL_EJECUCION_ULTIMA = f"SELECT {_COLUMNAS_EJECUCION} FROM replay.ejecucion ORDER BY iniciada_at DESC, run_id DESC LIMIT 1"
SQL_EJECUCION_POR_ID = f"SELECT {_COLUMNAS_EJECUCION} FROM replay.ejecucion WHERE run_id = %s"

# Como SQL_EVENTOS de repositorio.py, más el caso controlado y el instante de reproducción. {donde} lo construye Filtros.donde().
SQL_EVENTOS_REPLAY = """
SELECT event_id, longitude, latitude, depth_km, mag, mag_type, place,
       (extract(epoch FROM event_time) * 1000)::bigint,
       (extract(epoch FROM updated_at) * 1000)::bigint,
       country_id, country_name, caso, (extract(epoch FROM ingested_at) * 1000)::bigint
FROM replay.evento_actual
WHERE {donde}
ORDER BY event_time DESC, event_id ASC
LIMIT %(p_limit)s OFFSET %(p_offset)s
"""


def a_ejecucion(fila: tuple) -> dict:
    """Fila de `replay.ejecucion` -> `metadata.replay` del contrato (fechas en ms Unix UTC; velocidad como número)."""
    run_id, estado, tamano, velocidad, desde, hasta, iniciada, terminada = fila
    return {"run_id": run_id, "estado": estado, "tamano": tamano, "velocidad": None if velocidad is None else float(velocidad),
            "intervalo": {"desde": desde, "hasta": hasta}, "iniciada_at": iniciada, "terminada_at": terminada}
