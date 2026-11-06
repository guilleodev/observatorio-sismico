"""Catálogo de países (Natural Earth entregado): lectura, validación y volcado idempotente a `geo.pais` (paso 4.1).

El archivo es de solo lectura: nunca se modifica. Su huella `sha256` identifica la versión del catálogo (research R-003).
Aquí solo se comprueba lo estructural (unicidad de `ADM0_A3`, atributos, geometrías poligonales con anillos cerrados y
coordenadas en rango). La validez topológica (auto-intersecciones) necesita Shapely y se comprueba en el paso 4.2.
"""

import hashlib
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path

import psycopg

from observatorio.config import ConfigError, ConfigGeo, ConfigPostgres

TIPOS_GEOMETRIA = ("Polygon", "MultiPolygon")


class CatalogoInvalido(Exception):
    """El catálogo no se puede usar; el mensaje lista TODOS los problemas encontrados."""


@dataclass(frozen=True)
class Pais:
    country_id: str  # ADM0_A3: identificador del catálogo; no se presupone que sea un código ISO
    nombre_es: str
    nombre_en: str
    continente: str | None
    subregion: str | None
    tipo: str | None
    iso_a3: str | None  # nulo cuando el catálogo trae «-99»


@dataclass(frozen=True)
class Catalogo:
    sha256: str
    archivo: str
    paises: tuple[Pais, ...]
    geometrias: dict  # country_id -> geometría GeoJSON original (para el asignador del paso 4.2)


@dataclass(frozen=True)
class ResultadoVolcado:
    paises_nuevos: int
    paises_actualizados: int
    paises_sin_cambios: int
    catalogo_nuevo: bool
    obsoletos: tuple[str, ...]  # presentes en la base pero ausentes del catálogo: se informan, no se borran


def _texto(valor) -> str | None:
    if isinstance(valor, str) and valor.strip():
        return valor.strip()
    return None


def _problemas_de_anillos(coordenadas, tipo: str) -> list[str]:
    poligonos = [coordenadas] if tipo == "Polygon" else coordenadas
    problemas = []
    if not isinstance(poligonos, list) or not poligonos:
        return ["sin coordenadas"]
    for poligono in poligonos:
        if not isinstance(poligono, list) or not poligono:
            problemas.append("polígono sin anillos")
            continue
        for anillo in poligono:
            if not isinstance(anillo, list) or len(anillo) < 4:
                problemas.append("anillo con menos de 4 puntos")
                continue
            if anillo[0] != anillo[-1]:
                problemas.append("anillo no cerrado")
            for punto in anillo:
                valido = (isinstance(punto, list) and len(punto) >= 2
                          and all(isinstance(c, (int, float)) and not isinstance(c, bool) and math.isfinite(c) for c in punto[:2]))
                if not valido:
                    problemas.append("coordenada no numérica o no finita")
                    break
                if not (-180 <= punto[0] <= 180 and -90 <= punto[1] <= 90):
                    problemas.append("coordenadas fuera de rango (longitud ±180, latitud ±90)")
                    break
    return sorted(set(problemas))


def leer_catalogo(ruta: Path) -> Catalogo:
    """Lee y valida el catálogo. Lanza `CatalogoInvalido` con todos los problemas; no modifica el archivo."""
    ruta = Path(ruta)
    try:
        crudo = ruta.read_bytes()
    except FileNotFoundError:
        raise CatalogoInvalido(f"el archivo no existe: {ruta}") from None
    except OSError as exc:
        raise CatalogoInvalido(f"no se puede leer el catálogo {ruta}: {exc}") from None
    try:
        datos = json.loads(crudo)
    except ValueError as exc:
        raise CatalogoInvalido(f"JSON ilegible en {ruta.name}: {exc}") from None
    if not isinstance(datos, dict) or datos.get("type") != "FeatureCollection":
        raise CatalogoInvalido(f"{ruta.name} no es una FeatureCollection")
    entidades = datos.get("features")
    if not isinstance(entidades, list) or not entidades:
        raise CatalogoInvalido(f"{ruta.name} no tiene entidades (catálogo sin entidades)")

    problemas: list[str] = []
    paises: list[Pais] = []
    geometrias: dict = {}
    vistos: dict[str, int] = {}
    for i, entidad in enumerate(entidades):
        propiedades = entidad.get("properties") if isinstance(entidad, dict) else None
        if not isinstance(propiedades, dict):
            problemas.append(f"entidad #{i}: sin propiedades")
            continue
        codigo = _texto(propiedades.get("ADM0_A3"))
        nombre = codigo or f"entidad #{i}"
        if codigo is None:
            problemas.append(f"entidad #{i}: falta ADM0_A3 (ausente o vacío)")
        elif codigo in vistos:
            problemas.append(f"ADM0_A3 repetido: {codigo} (entidades #{vistos[codigo]} y #{i})")
        else:
            vistos[codigo] = i
        nombre_es, nombre_en = _texto(propiedades.get("NAME_ES")), _texto(propiedades.get("ADMIN"))
        if nombre_es is None:
            problemas.append(f"{nombre}: NAME_ES ausente o vacío")
        if nombre_en is None:
            problemas.append(f"{nombre}: ADMIN ausente o vacío")
        geometria = entidad.get("geometry")
        if not isinstance(geometria, dict) or geometria.get("type") not in TIPOS_GEOMETRIA:
            tipo = geometria.get("type") if isinstance(geometria, dict) else None
            problemas.append(f"{nombre}: la geometría falta o no es Polygon/MultiPolygon (es {tipo!r})")
        else:
            for p in _problemas_de_anillos(geometria.get("coordinates"), geometria["type"]):
                problemas.append(f"{nombre}: {p}")
        if codigo is not None and codigo in vistos and vistos[codigo] == i and nombre_es and nombre_en:
            iso = _texto(propiedades.get("ISO_A3"))
            paises.append(Pais(codigo, nombre_es, nombre_en, _texto(propiedades.get("CONTINENT")),
                               _texto(propiedades.get("SUBREGION")), _texto(propiedades.get("TYPE")),
                               None if iso in (None, "-99") else iso))
            if isinstance(geometria, dict):
                geometrias[codigo] = geometria
    if problemas:
        raise CatalogoInvalido(f"catálogo inválido ({len(problemas)} problemas):\n  - " + "\n  - ".join(problemas))
    return Catalogo(hashlib.sha256(crudo).hexdigest(), ruta.name, tuple(paises), geometrias)


SQL_CATALOGO = "INSERT INTO geo.catalogo (sha256, archivo, entidades) VALUES (%s, %s, %s) ON CONFLICT (sha256) DO NOTHING"

# Inserta o actualiza SOLO si algo cambió (IS DISTINCT FROM); `xmax = 0` distingue una inserción de una actualización.
SQL_PAIS = """
INSERT INTO geo.pais AS p (country_id, nombre_es, nombre_en, continente, subregion, tipo, iso_a3)
VALUES (%s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (country_id) DO UPDATE SET
    nombre_es = EXCLUDED.nombre_es, nombre_en = EXCLUDED.nombre_en, continente = EXCLUDED.continente,
    subregion = EXCLUDED.subregion, tipo = EXCLUDED.tipo, iso_a3 = EXCLUDED.iso_a3
WHERE (p.nombre_es, p.nombre_en, p.continente, p.subregion, p.tipo, p.iso_a3)
      IS DISTINCT FROM (EXCLUDED.nombre_es, EXCLUDED.nombre_en, EXCLUDED.continente, EXCLUDED.subregion, EXCLUDED.tipo, EXCLUDED.iso_a3)
RETURNING (xmax = 0) AS insertado
"""


def volcar(conexion: psycopg.Connection, catalogo: Catalogo) -> ResultadoVolcado:
    """Vuelca la dimensión de forma idempotente. Debe ejecutarse dentro de una transacción del llamador."""
    catalogo_nuevo = conexion.execute(SQL_CATALOGO, (catalogo.sha256, catalogo.archivo, len(catalogo.paises))).rowcount == 1
    nuevos = actualizados = 0
    for p in catalogo.paises:
        fila = conexion.execute(SQL_PAIS, (p.country_id, p.nombre_es, p.nombre_en, p.continente, p.subregion, p.tipo, p.iso_a3)).fetchone()
        if fila is not None:
            nuevos, actualizados = (nuevos + 1, actualizados) if fila[0] else (nuevos, actualizados + 1)
    ids = [p.country_id for p in catalogo.paises]
    obsoletos = tuple(r[0] for r in conexion.execute(
        "SELECT country_id FROM geo.pais WHERE country_id <> ALL(%s) ORDER BY country_id", (ids,)).fetchall())
    return ResultadoVolcado(nuevos, actualizados, len(ids) - nuevos - actualizados, catalogo_nuevo, obsoletos)


def main() -> int:
    """`python -m observatorio.geo.catalogo`: valida el catálogo montado y vuelca `geo.pais` (idempotente)."""
    try:
        ruta = ConfigGeo.desde_entorno().catalogo_path
        postgres = ConfigPostgres.desde_entorno()
        catalogo = leer_catalogo(ruta)
    except (ConfigError, CatalogoInvalido) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    with psycopg.connect(postgres.conninfo()) as conexion:
        with conexion.transaction():
            r = volcar(conexion, catalogo)
    print(f"Catálogo {catalogo.archivo} sha256={catalogo.sha256} entidades={len(catalogo.paises)}")
    print(f"geo.catalogo: {'versión nueva registrada' if r.catalogo_nuevo else 'versión ya registrada'}")
    print(f"geo.pais: nuevos={r.paises_nuevos} actualizados={r.paises_actualizados} sin_cambios={r.paises_sin_cambios}")
    if r.obsoletos:
        print(f"AVISO: {len(r.obsoletos)} países en la base ausentes de este catálogo (no se borran): {', '.join(r.obsoletos)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
