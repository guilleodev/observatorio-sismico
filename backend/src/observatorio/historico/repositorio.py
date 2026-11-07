"""Acceso a PostgreSQL del histórico (esquema `historico`; F4, paso 4.4). Síncrono: la carga es un proceso por lotes, sin Kafka.

Solo escribe en el esquema `historico` (nunca en `live` ni en los datos de pruebas). Cada tramo se guarda en UNA transacción (consulta + archivo + eventos + cuarentena), de modo que
una interrupción deja el tramo entero o nada, y la clave del tramo (inicio, fin, filtros) permite reanudar.
"""

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from psycopg.types.json import Jsonb

ORIGEN = "historico-usgs-fdsn"
EPOCA = datetime(1970, 1, 1, tzinfo=timezone.utc)


def instante(ms: int) -> datetime:
    """ms Unix -> datetime UTC exacto (sin pasar por coma flotante)."""
    return EPOCA + timedelta(milliseconds=ms)


@dataclass(frozen=True)
class FilaConsulta:
    id: int
    resultado: str
    esperado: int | None
    obtenidos: int | None
    tiene_archivo: bool


@dataclass(frozen=True)
class EventoHistorico:
    """Fila lista para `historico.evento` (país ya asignado)."""

    event_id: str
    event_time_ms: int
    updated_ms: int
    mag: float | None
    mag_type: str | None
    depth_km: float | None
    longitude: float
    latitude: float
    place: str | None
    country_id: str | None
    geo_resultado: str
    geo_catalogo: str
    raw: dict


@dataclass(frozen=True)
class RegistroCuarentena:
    categoria: str
    motivo: str
    event_id: str | None
    updated_ms: int | None
    payload: bytes
    huella: str


SQL_BUSCAR = """
SELECT c.id, c.resultado, c.esperado, c.obtenidos, a.consulta_id IS NOT NULL
FROM historico.consulta c LEFT JOIN historico.archivo a ON a.consulta_id = c.id
WHERE c.inicio = %s AND c.fin = %s AND c.filtros = %s
"""

# Alta o reintento de un tramo. Si ya existe (p. ej. quedó en 'error') se reutiliza su fila y su id.
SQL_ABRIR = """
INSERT INTO historico.consulta (inicio, fin, filtros, tramo_padre, url, resultado, error, esperado, extraida_at)
VALUES (%(inicio)s, %(fin)s, %(filtros)s, %(padre)s, %(url)s, %(resultado)s, %(error)s, %(esperado)s, now())
ON CONFLICT (inicio, fin, filtros) DO UPDATE SET
    tramo_padre = EXCLUDED.tramo_padre, url = EXCLUDED.url, resultado = EXCLUDED.resultado, error = EXCLUDED.error,
    esperado = EXCLUDED.esperado, extraida_at = now()
RETURNING id
"""

SQL_CERRAR = """
UPDATE historico.consulta SET resultado = %(resultado)s, error = %(error)s, http_status = %(http_status)s, intentos = %(intentos)s,
    obtenidos = %(obtenidos)s, duplicados = %(duplicados)s, fuera_de_tramo = %(fuera)s, peticiones_http = %(peticiones)s,
    extraida_at = now()
WHERE id = %(id)s
"""

SQL_EVENTO = """
INSERT INTO historico.evento (event_id, event_time, updated_at, mag, mag_type, depth_km, longitude, latitude, place,
                              country_id, geo_resultado, geo_catalogo, origen, consulta_id, raw)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (event_id) DO UPDATE SET
    event_time = EXCLUDED.event_time, updated_at = EXCLUDED.updated_at, mag = EXCLUDED.mag, mag_type = EXCLUDED.mag_type,
    depth_km = EXCLUDED.depth_km, longitude = EXCLUDED.longitude, latitude = EXCLUDED.latitude, place = EXCLUDED.place,
    country_id = EXCLUDED.country_id, geo_resultado = EXCLUDED.geo_resultado, geo_catalogo = EXCLUDED.geo_catalogo,
    consulta_id = EXCLUDED.consulta_id, raw = EXCLUDED.raw, cargado_at = now()
WHERE EXCLUDED.updated_at > historico.evento.updated_at
"""

SQL_CUARENTENA = """
INSERT INTO historico.cuarentena (categoria, motivo, event_id, updated_ms, consulta_id, payload, huella)
VALUES (%s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (huella) DO NOTHING
"""


def _sin_nul(texto: str | None) -> str | None:
    return texto.replace("\x00", "") if texto is not None else None


class RepositorioHistorico:
    def __init__(self, conexion):
        self._c = conexion

    # ---- catálogo geográfico (la asignación del histórico exige la misma versión que la dimensión de la base)
    def catalogo_registrado(self, sha256: str) -> bool:
        return self._c.execute("SELECT 1 FROM geo.catalogo WHERE sha256 = %s", (sha256,)).fetchone() is not None

    def paises_registrados(self) -> set[str]:
        return {f[0] for f in self._c.execute("SELECT country_id FROM geo.pais").fetchall()}

    # ---- consultas (tramos)
    def buscar(self, inicio: datetime, fin: datetime, filtros: dict) -> FilaConsulta | None:
        fila = self._c.execute(SQL_BUSCAR, (inicio, fin, Jsonb(filtros))).fetchone()
        return FilaConsulta(*fila) if fila else None

    def abrir(self, inicio, fin, filtros, url, padre, esperado, resultado="error", error="en curso") -> int:
        """Crea (o reabre) la fila del tramo. 'error' + 'en curso' = aún no completo; solo se cierra al terminar."""
        return self._c.execute(SQL_ABRIR, {"inicio": inicio, "fin": fin, "filtros": Jsonb(filtros), "padre": padre, "url": url,
                                           "resultado": resultado, "error": error, "esperado": esperado}).fetchone()[0]

    def cerrar(self, consulta_id: int, resultado: str, error: str | None = None, http_status: int | None = None, intentos: int | None = None,
               obtenidos: int | None = None, duplicados: int = 0, fuera: int = 0, peticiones: int = 0) -> None:
        self._c.execute(SQL_CERRAR, {"id": consulta_id, "resultado": resultado, "error": error, "http_status": http_status,
                                     "intentos": intentos, "obtenidos": obtenidos, "duplicados": duplicados, "fuera": fuera,
                                     "peticiones": peticiones})

    def guardar_archivo(self, consulta_id: int, contenido_gz: bytes, sha256: str) -> None:
        self._c.execute("INSERT INTO historico.archivo (consulta_id, contenido_gz, sha256, tamano_bytes) VALUES (%s, %s, %s, %s) "
                        "ON CONFLICT (consulta_id) DO NOTHING", (consulta_id, contenido_gz, sha256, len(contenido_gz)))

    def transaccion(self):
        """Una transacción (o un punto de guardado si ya hay una abierta): todo lo de un tramo entra junto o no entra."""
        return self._c.transaction()

    def archivo(self, consulta_id: int) -> tuple[str, bytes]:
        sha, contenido = self._c.execute("SELECT sha256, contenido_gz FROM historico.archivo WHERE consulta_id = %s", (consulta_id,)).fetchone()
        return sha, bytes(contenido)

    def huellas_de_archivos(self, desde: datetime, hasta: datetime, filtros: dict) -> list[tuple[int, datetime, datetime, str]]:
        """(consulta_id, inicio, fin, sha256) de los archivos del periodo y los filtros indicados, sin descargar su contenido."""
        return self._c.execute("SELECT a.consulta_id, c.inicio, c.fin, a.sha256 FROM historico.archivo a JOIN historico.consulta c ON c.id = a.consulta_id "
                               "WHERE c.inicio >= %s AND c.fin <= %s AND c.filtros = %s ORDER BY c.inicio, c.fin", (desde, hasta, Jsonb(filtros))).fetchall()

    # ---- eventos
    def actualizados_existentes(self, ids: list[str]) -> dict[str, int]:
        """event_id -> `updated` (ms) de los ids que ya están cargados."""
        if not ids:
            return {}
        filas = self._c.execute("SELECT event_id, (extract(epoch FROM updated_at) * 1000)::bigint FROM historico.evento "
                                "WHERE event_id = ANY(%s)", (ids,)).fetchall()
        return {f[0]: int(f[1]) for f in filas}

    def guardar_eventos(self, consulta_id: int, eventos: list[EventoHistorico]) -> None:
        with self._c.cursor() as cur:
            cur.executemany(SQL_EVENTO, [
                (e.event_id, instante(e.event_time_ms), instante(e.updated_ms), e.mag, e.mag_type, e.depth_km, e.longitude, e.latitude,
                 e.place, e.country_id, e.geo_resultado, e.geo_catalogo, ORIGEN, consulta_id, Jsonb(e.raw)) for e in eventos])

    def guardar_cuarentena(self, consulta_id: int, registros: list[RegistroCuarentena]) -> int:
        """Devuelve cuántos registros eran nuevos (los que ya estaban por su huella no se repiten)."""
        nuevos = 0
        with self._c.cursor() as cur:
            for r in registros:
                cur.execute(SQL_CUARENTENA, (r.categoria, _sin_nul(r.motivo), r.event_id, r.updated_ms, consulta_id, r.payload, r.huella))
                nuevos += cur.rowcount
        return nuevos


def canonico(valor) -> bytes:
    return json.dumps(valor, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8", errors="replace")
