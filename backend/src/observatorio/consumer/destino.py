"""Destino de escritura del consumidor (F6, DG1): `live` (el flujo real) o `replay` (la reproducción histórica aislada).

El MISMO procesamiento (validación, versionado, país, cuarentena, offset después de escribir) sirve a los dos; lo único que cambia es a qué esquema escribe,
qué `mode` y `source` admite y si las filas llevan `run_id`/`caso`. El esquema se valida contra una LISTA CERRADA: ninguna cadena externa llega al SQL.

Para `live` el SQL generado es IDÉNTICO, carácter a carácter, al que tenía el consumidor antes de parametrizarlo
(`tests/unit/test_destino_sql.py` lo compara con una copia congelada).
"""

from dataclasses import dataclass

from observatorio.config import SOURCES_ADMITIDOS
from observatorio.modos import MODO_LIVE, MODO_REPLAY

SOURCE_REPLAY = "replay-historico"
ESQUEMAS_PERMITIDOS = ("live", "replay")


@dataclass(frozen=True)
class Destino:
    nombre: str
    esquema: str  # solo «live» o «replay»
    modo: str  # el único `mode` que admite
    fuentes: tuple[str, ...]  # las únicas `source` que admite
    con_run: bool  # las filas llevan run_id y caso (solo replay)

    def __post_init__(self):
        if self.esquema not in ESQUEMAS_PERMITIDOS:
            raise ValueError(f"esquema no permitido: {self.esquema!r} (solo {', '.join(ESQUEMAS_PERMITIDOS)})")


DESTINO_LIVE = Destino(nombre="live", esquema="live", modo=MODO_LIVE, fuentes=tuple(SOURCES_ADMITIDOS), con_run=False)
DESTINO_REPLAY = Destino(nombre="replay", esquema="replay", modo=MODO_REPLAY, fuentes=(SOURCE_REPLAY,), con_run=True)
_POR_NOMBRE = {"live": DESTINO_LIVE, "replay": DESTINO_REPLAY}


def destino_por_nombre(nombre) -> Destino:
    if not isinstance(nombre, str) or nombre not in _POR_NOMBRE:
        raise ValueError(f"destino desconocido: {nombre!r} (solo {', '.join(_POR_NOMBRE)})")
    return _POR_NOMBRE[nombre]


COLUMNAS = """event_id, event_time, updated_at, mag, mag_type, depth_km, longitude, latitude, place,
    source, mode, ingested_at, kafka_topic, kafka_partition, kafka_offset, raw"""
VALORES = """%(event_id)s, to_timestamp(%(event_time)s / 1000.0), to_timestamp(%(updated)s / 1000.0),
    %(mag)s, %(mag_type)s, %(depth_km)s, %(longitude)s, %(latitude)s, %(place)s,
    %(source)s, %(mode)s, to_timestamp(%(ingested_at)s / 1000.0),
    %(topic)s, %(partition)s, %(offset)s, %(raw)s"""


def _columnas(d: Destino) -> str:
    return f"run_id, {COLUMNAS}, caso" if d.con_run else COLUMNAS


def _valores(d: Destino) -> str:
    return f"%(run_id)s, {VALORES}, %(caso)s" if d.con_run else VALORES


def sql_version(d: Destino) -> str:
    """Historial: una fila por versión distinta. Si ya existe la misma versión no hace nada."""
    clave = "run_id, event_id, updated_at" if d.con_run else "event_id, updated_at"
    return f"""
INSERT INTO {d.esquema}.evento_version ({_columnas(d)})
VALUES ({_valores(d)})
ON CONFLICT ({clave}) DO NOTHING
"""


def sql_actual(d: Destino) -> str:
    """Estado actual: se crea o se actualiza SOLO si la versión recibida es más reciente (una antigua no lo sobrescribe)."""
    clave = "run_id, event_id" if d.con_run else "event_id"
    extra = ", caso = EXCLUDED.caso" if d.con_run else ""
    return f"""
INSERT INTO {d.esquema}.evento_actual ({_columnas(d)}, country_id, country_name, geo_resultado, geo_catalogo, retirado)
VALUES ({_valores(d)}, %(country_id)s, %(country_name)s, %(geo_resultado)s, %(geo_catalogo)s, false)
ON CONFLICT ({clave}) DO UPDATE SET
    event_time = EXCLUDED.event_time, updated_at = EXCLUDED.updated_at, mag = EXCLUDED.mag, mag_type = EXCLUDED.mag_type,
    depth_km = EXCLUDED.depth_km, longitude = EXCLUDED.longitude, latitude = EXCLUDED.latitude, place = EXCLUDED.place,
    source = EXCLUDED.source, mode = EXCLUDED.mode, ingested_at = EXCLUDED.ingested_at, kafka_topic = EXCLUDED.kafka_topic,
    kafka_partition = EXCLUDED.kafka_partition, kafka_offset = EXCLUDED.kafka_offset, raw = EXCLUDED.raw,
    country_id = EXCLUDED.country_id, country_name = EXCLUDED.country_name,
    geo_resultado = EXCLUDED.geo_resultado, geo_catalogo = EXCLUDED.geo_catalogo,
    retirado = false, stored_at = now(){extra}
WHERE EXCLUDED.updated_at > {d.esquema}.evento_actual.updated_at
"""


def sql_retirar(d: Destino) -> str:
    """Reclasificación a no sísmico: el evento sale del estado actual sin borrarse."""
    filtro_run = " AND run_id = %(run_id)s" if d.con_run else ""
    return f"""
UPDATE {d.esquema}.evento_actual SET retirado = true, updated_at = to_timestamp(%(updated)s / 1000.0), stored_at = now()
WHERE event_id = %(event_id)s{filtro_run} AND updated_at < to_timestamp(%(updated)s / 1000.0)
"""


def sql_cuarentena(d: Destino) -> str:
    """Cuarentena: excluidos (no sísmicos) e inválidos, con motivo y referencia al mensaje original."""
    columnas_run = "run_id, " if d.con_run else ""
    valores_run = "%(run_id)s, " if d.con_run else ""
    conflicto = "run_id, huella" if d.con_run else "huella"
    return f"""
INSERT INTO {d.esquema}.cuarentena ({columnas_run}categoria, motivo, event_id, updated_ms, kafka_topic, kafka_partition, kafka_offset, clave, payload, huella)
VALUES ({valores_run}%(categoria)s, %(motivo)s, %(event_id)s, %(updated_ms)s, %(topic)s, %(partition)s, %(offset)s, %(clave)s, %(payload)s, %(huella)s)
ON CONFLICT ({conflicto}) DO NOTHING
"""
