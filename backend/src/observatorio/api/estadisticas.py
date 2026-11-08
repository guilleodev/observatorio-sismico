"""Estadísticas agregadas de /api/estadisticas (F5, paso 5.2): recuentos por país y distribuciones de magnitud y profundidad.

Todas las consultas usan la MISMA cláusula WHERE que /api/eventos (`Filtros.donde`) sobre `live.evento_actual` sin retirados, y se ejecutan en la misma
transacción de lectura que el resto de la petición: el conjunto lógico de eventos es el mismo y no se calcula nada sobre una página truncada.
Los intervalos son fijos (no dependen de los datos) para que dos consultas sean comparables. Un nulo nunca se convierte en 0: va a `sin_valor`.
"""

from datetime import timedelta

from observatorio.api import comparacion
from observatorio.api.filtros import SIN_PAIS, Filtros, a_ms, para_modo
from observatorio.api.replay import COMPARACION_NO_APLICA
from observatorio.modos import MODO_REPLAY

NOMBRE_SIN_PAIS = "Sin país asignado"
# Bordes de los intervalos [from, to): el primero y el último están abiertos (null). Los negativos válidos del feed caen en el primero.
BORDES_MAGNITUD = (0, 1, 2, 3, 4, 5, 6, 7, 8)
BORDES_PROFUNDIDAD = (10, 30, 70, 150, 300, 500)  # incluyen los cortes de color del mapa proporcionado (70 y 300 km)

SQL_POR_PAIS = """
SELECT s.country_id, p.nombre_es, s.geo_resultado, s.n
FROM (SELECT country_id, geo_resultado, count(*) AS n FROM live.evento_actual WHERE {donde} GROUP BY country_id, geo_resultado) s
LEFT JOIN geo.pais p ON p.country_id = s.country_id
"""


HORA_MS = 3_600_000
# Hora UTC del EVENTO (no la de ingesta) como milisegundos Unix: aritmética pura, independiente de la zona horaria de la sesión.
SQL_POR_HORA = ("SELECT (floor(extract(epoch FROM event_time) / 3600) * 3600000)::bigint AS hora, count(*) "
                "FROM live.evento_actual WHERE {donde} GROUP BY 1")


def casillas_horarias(filtros: Filtros) -> tuple[int, int]:
    """(inicio en ms de la primera hora UTC, nº de casillas) de la ventana [start, end): una por hora que toca el periodo; el fin es exclusivo."""
    primera = filtros.start.replace(minute=0, second=0, microsecond=0)
    n = -(-(filtros.end - primera) // timedelta(hours=1))  # techo: con end justo en hh:00 no hay casilla extra
    return a_ms(primera), n


def bloque_por_hora(filtros: Filtros, recuentos: dict[int, int] | None, max_casillas: int) -> dict:
    """Serie por hora UTC con las horas sin eventos a 0. Si la ventana necesita más de `max_casillas`, se omite SOLO la serie, con su motivo."""
    primera, n = casillas_horarias(filtros)
    unidad = "events/hour UTC"
    if n > max_casillas:
        return {"unit": unidad, "sin_valor": 0, "items": None, "motivo": "ventana_demasiado_amplia", "max_casillas": max_casillas}
    return {"unit": unidad, "sin_valor": 0, "items": [{"hour": primera + i * HORA_MS, "count": (recuentos or {}).get(primera + i * HORA_MS, 0)} for i in range(n)]}


def _sql_distribucion(columna: str, bordes: tuple) -> str:
    """Índice del intervalo de cada evento (0 = abierto por la izquierda); NULL para los valores ausentes. Los bordes son constantes del código."""
    casos = " ".join(f"WHEN {columna} < {b} THEN {i}" for i, b in enumerate(bordes))
    return (f"SELECT CASE WHEN {columna} IS NULL THEN NULL {casos} ELSE {len(bordes)} END AS intervalo, count(*) "
            "FROM live.evento_actual WHERE {donde} GROUP BY 1")


SQL_MAGNITUD = _sql_distribucion("mag", BORDES_MAGNITUD)
SQL_PROFUNDIDAD = _sql_distribucion("depth_km", BORDES_PROFUNDIDAD)


def intervalos(bordes: tuple, recuentos: dict[int, int]) -> list[dict]:
    """Todos los intervalos, también los vacíos (con 0)."""
    limites = (None, *bordes, None)
    return [{"from": limites[i], "to": limites[i + 1], "count": recuentos.get(i, 0)} for i in range(len(bordes) + 1)]


def bloque_por_pais(filas: list[tuple]) -> dict:
    """Agrupa por país (interior/frontera/varias suman), aparte «Sin país asignado» (solo `sin_pais`) y, en `sin_valor`, lo aún sin asignar."""
    por_pais: dict[str, list] = {}
    sin_pais = sin_asignar = 0
    for country_id, nombre, resultado, n in filas:
        if resultado is None:
            sin_asignar += n  # geo_resultado nulo: aún sin asignar, no es «sin país»
        elif resultado == SIN_PAIS:
            sin_pais += n
        else:
            actual = por_pais.setdefault(country_id, [nombre, 0])
            actual[1] += n
    items = [{"country_id": c, "country_name": v[0], "count": v[1]} for c, v in por_pais.items()]
    if sin_pais:
        items.append({"country_id": None, "country_name": NOMBRE_SIN_PAIS, "count": sin_pais})
    items.sort(key=lambda i: (-i["count"], i["country_id"] or ""))
    return {"unit": "events", "sin_valor": sin_asignar, "items": items}


async def calcular(conn, filtros: Filtros, generado_ms: int, max_casillas: int, margen_publicacion_s: int) -> dict:
    """Bloques de estadísticas para los filtros dados, sobre la conexión (y la instantánea) de la petición."""
    donde, parametros = filtros.donde()
    sin_umbral, parametros_sin_umbral = filtros.donde(con_magnitud=False)

    async def filas(sql, donde_, params_):
        return await (await conn.execute(para_modo(sql, filtros.modo).format(donde=donde_), params_)).fetchall()

    total = (await filas("SELECT count(*) FROM live.evento_actual WHERE {donde}", donde, parametros))[0][0]
    sin_magnitud = (await filas("SELECT count(*) FROM live.evento_actual WHERE {donde} AND mag IS NULL", sin_umbral, parametros_sin_umbral))[0][0]
    pais = bloque_por_pais(await filas(SQL_POR_PAIS, donde, parametros))
    resultado = {"total": total, "sin_magnitud": sin_magnitud, "por_pais": pais}
    for nombre, sql, bordes, unidad in (("magnitud", SQL_MAGNITUD, BORDES_MAGNITUD, "magnitude"), ("profundidad", SQL_PROFUNDIDAD, BORDES_PROFUNDIDAD, "km")):
        recuentos = {i: n for i, n in await filas(sql, donde, parametros)}
        resultado[nombre] = {"unit": unidad, "sin_valor": recuentos.pop(None, 0), "items": intervalos(bordes, recuentos)}
    _, casillas = casillas_horarias(filtros)
    recuentos_hora = None if casillas > max_casillas else {h: n for h, n in await filas(SQL_POR_HORA, donde, parametros)}
    resultado["por_hora"] = bloque_por_hora(filtros, recuentos_hora, max_casillas)
    # La comparación mide el periodo EN VIVO contra el histórico de 2025: en una reproducción no aplica y no se consulta ni live ni el histórico.
    resultado["comparacion"] = (dict(COMPARACION_NO_APLICA) if filtros.modo == MODO_REPLAY
                                else await comparacion.calcular(conn, filtros, generado_ms, margen_publicacion_s))
    return resultado
