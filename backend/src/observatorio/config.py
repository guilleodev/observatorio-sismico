"""Lectura de la configuración desde variables de entorno (sin valores por defecto ocultos)."""

import os
from dataclasses import dataclass
from pathlib import Path


class ConfigError(RuntimeError):
    """Falta una variable de entorno obligatoria."""


def leer_obligatoria(nombre: str) -> str:
    valor = os.environ.get(nombre, "").strip()
    if not valor:
        raise ConfigError(f"Falta la variable de entorno obligatoria {nombre}")
    return valor


@dataclass(frozen=True)
class ConfigKafka:
    bootstrap_servers: str
    topic: str

    @classmethod
    def desde_entorno(cls) -> "ConfigKafka":
        return cls(
            bootstrap_servers=leer_obligatoria("KAFKA_BOOTSTRAP_SERVERS"),
            topic=leer_obligatoria("KAFKA_TOPIC"),
        )


@dataclass(frozen=True)
class ConfigPostgres:
    host: str
    base: str
    usuario: str
    password: str

    @classmethod
    def desde_entorno(cls) -> "ConfigPostgres":
        return cls(
            host=leer_obligatoria("POSTGRES_HOST"),
            base=leer_obligatoria("POSTGRES_DB"),
            usuario=leer_obligatoria("POSTGRES_USER"),
            password=leer_obligatoria("POSTGRES_PASSWORD"),
        )

    def conninfo(self) -> str:
        return f"host={self.host} dbname={self.base} user={self.usuario} password={self.password}"


SOURCE_ADMITIDO = "usgs-all-day"
URL_USGS = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"


def _entero(nombre: str, defecto: int, minimo: int = 1) -> int:
    texto = os.environ.get(nombre, "").strip()
    if not texto:
        return defecto
    try:
        valor = int(texto)
    except ValueError:
        raise ConfigError(f"{nombre} debe ser un entero, no {texto!r}") from None
    if valor < minimo:
        raise ConfigError(f"{nombre} debe ser >= {minimo}, no {valor}")
    return valor


def _booleano(nombre: str, defecto: bool) -> bool:
    texto = os.environ.get(nombre, "").strip().lower()
    if not texto:
        return defecto
    if texto in ("true", "1", "si", "sí", "yes"):
        return True
    if texto in ("false", "0", "no"):
        return False
    raise ConfigError(f"{nombre} debe ser true o false, no {texto!r}")


@dataclass(frozen=True)
class ConfigIngesta:
    """Ingesta de USGS. Las variables son opcionales: si faltan se usan los valores por defecto documentados."""

    usgs_url: str
    intervalo_s: int
    timeout_s: int
    max_reintentos: int
    retencion_respuestas_dias: int
    retencion_consultas_dias: int
    publicar: bool  # False = modo seco: consulta y registra, pero no publica ni marca versiones (R-015)

    @classmethod
    def desde_entorno(cls) -> "ConfigIngesta":
        url = os.environ.get("USGS_URL", "").strip() or URL_USGS
        if not url.startswith(("http://", "https://")):
            raise ConfigError(f"USGS_URL debe empezar por http:// o https://, no {url!r}")
        return cls(
            usgs_url=url,
            intervalo_s=_entero("USGS_INTERVAL_S", 60),
            timeout_s=_entero("USGS_TIMEOUT_S", 20),
            max_reintentos=_entero("USGS_MAX_REINTENTOS", 3, minimo=0),
            retencion_respuestas_dias=_entero("RETENCION_RESPUESTAS_DIAS", 3),
            retencion_consultas_dias=_entero("RETENCION_CONSULTAS_DIAS", 30),
            publicar=_booleano("INGESTA_PUBLICAR", False),
        )


RUTA_CATALOGO_DEFECTO = "/datos/paises.geojson"


@dataclass(frozen=True)
class ConfigGeo:
    """Catálogo geográfico (Natural Earth entregado). Se monta de solo lectura; nunca se copia ni se modifica."""

    catalogo_path: Path

    @classmethod
    def desde_entorno(cls) -> "ConfigGeo":
        ruta = Path(os.environ.get("CATALOGO_PATH", "").strip() or RUTA_CATALOGO_DEFECTO)
        if not ruta.is_file():
            raise ConfigError(f"CATALOGO_PATH debe ser un archivo existente (catálogo de países), no {str(ruta)!r}")
        return cls(catalogo_path=ruta)
