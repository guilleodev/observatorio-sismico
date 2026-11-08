"""Selección de los eventos del replay (F6, research R-004). SOLO LECTURA sobre `historico.evento`: únicamente consultas SELECT, dentro de una transacción de solo lectura.

Devuelve los Features originales (`raw`) tal como se guardaron en la carga histórica, sin modificarlos. Si no hay eventos, devuelve una lista vacía: no se inventa nada.
"""

from datetime import date, datetime, timedelta, timezone

# El día más cargado de 2025 en UTC; en un empate, el más temprano (determinista).
SQL_DIA = """
SELECT (event_time AT TIME ZONE 'UTC')::date AS dia, count(*) AS n
FROM historico.evento
GROUP BY 1
ORDER BY n DESC, dia ASC
LIMIT 1
"""

# Los N primeros del día por tiempo del evento y, en un empate de instante, por id.
SQL_EVENTOS = """
SELECT raw
FROM historico.evento
WHERE event_time >= %(desde)s AND event_time < %(hasta)s
ORDER BY event_time ASC, event_id ASC
LIMIT %(n)s
"""


def elegir_dia(conexion) -> date | None:
    """Día UTC con más eventos en el histórico (el más temprano si hay empate); None si el histórico está vacío."""
    with conexion.transaction():
        conexion.execute("SET TRANSACTION READ ONLY")
        fila = conexion.execute(SQL_DIA).fetchone()
    return fila[0] if fila else None


def seleccionar(conexion, dia: date, n: int) -> list[dict]:
    """Los `n` primeros eventos del día UTC (por fecha y id). Si hay menos, devuelve los que hay."""
    if n < 0:
        raise ValueError("n debe ser >= 0")
    desde = datetime(dia.year, dia.month, dia.day, tzinfo=timezone.utc)
    with conexion.transaction():
        conexion.execute("SET TRANSACTION READ ONLY")
        filas = conexion.execute(SQL_EVENTOS, {"desde": desde, "hasta": desde + timedelta(days=1), "n": n}).fetchall()
    return [fila[0] for fila in filas]
