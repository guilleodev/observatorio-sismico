"""Lectura de la configuración desde variables de entorno (sin valores por defecto ocultos)."""

import os
import re
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
SOURCE_RECUPERACION = "usgs-fdsn-recuperacion"  # solo lo publica la orden de recuperación de huecos (F4, paso 4.5)
SOURCES_ADMITIDOS = (SOURCE_ADMITIDO, SOURCE_RECUPERACION)
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
    hueco_margen_s: int = 21600  # margen de la detección de huecos (F4): se aplica por ambos lados del intervalo; 6 h por defecto

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
            hueco_margen_s=_entero("HUECO_MARGEN_S", 21600, minimo=0),
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


URL_FDSN_DEFECTO = "https://earthquake.usgs.gov/fdsnws/event/1/"
EXPORTACION_DEFECTO = "/exportacion"
LIMITE_FDSN = 20000  # máximo de resultados por consulta que admite el catálogo de USGS


def _decimal(nombre: str, defecto: float, minimo: float, maximo: float) -> float:
    texto = os.environ.get(nombre, "").strip()
    if not texto:
        return defecto
    try:
        valor = float(texto)
    except ValueError:
        raise ConfigError(f"{nombre} debe ser un número, no {texto!r}") from None
    if not minimo <= valor <= maximo:
        raise ConfigError(f"{nombre} debe estar entre {minimo:g} y {maximo:g}, no {valor:g}")
    return valor


@dataclass(frozen=True)
class ConfigHistorico:
    """Carga histórica de USGS (F4). Todas las variables son opcionales; los valores por defecto son los del enunciado."""

    anio: int
    mag_min: float
    limite: int
    url_base: str
    timeout_s: int
    max_reintentos: int
    exportacion: Path  # carpeta donde se exporta cada archivo original (se monta con -v; ignorada por Git)

    @classmethod
    def desde_entorno(cls) -> "ConfigHistorico":
        url = os.environ.get("HISTORICO_URL", "").strip() or URL_FDSN_DEFECTO
        if not url.startswith(("http://", "https://")):
            raise ConfigError(f"HISTORICO_URL debe empezar por http:// o https://, no {url!r}")
        limite = _entero("HISTORICO_LIMITE", LIMITE_FDSN, minimo=2)
        if limite > LIMITE_FDSN:
            raise ConfigError(f"HISTORICO_LIMITE no puede superar {LIMITE_FDSN} (máximo del catálogo de USGS), no {limite}")
        anio = _entero("HISTORICO_ANIO", 2025, minimo=1900)
        if anio > 2100:
            raise ConfigError(f"HISTORICO_ANIO fuera de rango razonable: {anio}")
        return cls(
            anio=anio,
            mag_min=_decimal("HISTORICO_MAG_MIN", 4.0, 0.0, 10.0),
            limite=limite,
            url_base=url if url.endswith("/") else url + "/",
            timeout_s=_entero("HISTORICO_TIMEOUT_S", 60),
            max_reintentos=_entero("HISTORICO_MAX_REINTENTOS", 3, minimo=0),
            exportacion=Path(os.environ.get("HISTORICO_EXPORT_DIR", "").strip() or EXPORTACION_DEFECTO),
        )


@dataclass(frozen=True)
class ConfigApi:
    """Límites y umbrales de la API de consulta (F5). Todas las variables son opcionales; los valores por defecto son los aprobados en DF3/DF4/DF7."""

    max_eventos: int  # máximo de eventos por respuesta de /api/eventos (DF3, DF7)
    max_ventana_horas: int  # máximo de casillas de la serie horaria de /api/estadisticas (31 días)
    obsoleta_s: int  # antigüedad de la última ingesta a partir de la cual /api/salud marca stale (DF4)
    statement_timeout_s: int  # tiempo máximo de cada consulta; al superarlo la API responde 503
    margen_publicacion_s: int  # margen del motivo «hasta_ahora» de la comparación (a confirmar con medidas reales)

    @classmethod
    def desde_entorno(cls) -> "ConfigApi":
        return cls(
            max_eventos=_entero("API_MAX_EVENTOS", 5000),
            max_ventana_horas=_entero("API_MAX_VENTANA_HORAS", 744),
            obsoleta_s=_entero("INGESTA_OBSOLETA_S", 300),
            statement_timeout_s=_entero("API_STATEMENT_TIMEOUT_S", 10),
            margen_publicacion_s=_entero("API_MARGEN_PUBLICACION_S", 900, minimo=0),
        )


NOMBRE_KAFKA = re.compile(r"[A-Za-z0-9._-]{1,200}")


def _nombre_kafka(nombre: str, defecto: str) -> str:
    """Nombre de topic o de grupo de consumidores: solo letras, números, punto, guion y guion bajo (nada que pueda alterar una orden)."""
    valor = os.environ.get(nombre, "").strip() or defecto
    if not NOMBRE_KAFKA.fullmatch(valor):
        raise ConfigError(f"{nombre} solo admite letras, números, '.', '-' y '_' (hasta 200 caracteres), no {valor!r}")
    return valor


@dataclass(frozen=True)
class ConfigReplay:
    """Reproducción histórica aislada (F6, DG1/DG3). Todas las variables son opcionales; los valores por defecto son los del SDD.

    El topic y el grupo del replay NUNCA pueden coincidir con los del flujo en vivo (constitución III): se comprueba aquí.
    """

    topic: str
    grupo: str
    eventos: int  # eventos reales de la selección (los casos controlados se añaden aparte)
    intervalo_s: float  # segundos entre mensajes
    espera_final_s: int  # inactividad, tras el primer mensaje procesado, con la que termina el consumidor de replay
    espera_max_s: int  # tope de espera si no llega ningún mensaje

    @classmethod
    def desde_entorno(cls) -> "ConfigReplay":
        topic = _nombre_kafka("KAFKA_TOPIC_REPLAY", "terremotos.replay")
        grupo = _nombre_kafka("KAFKA_CONSUMER_GROUP_REPLAY", "consumidor-replay")
        if topic == os.environ.get("KAFKA_TOPIC", "").strip():
            raise ConfigError("KAFKA_TOPIC_REPLAY no puede ser el mismo topic que KAFKA_TOPIC (el replay no se mezcla con lo real)")
        if grupo == os.environ.get("KAFKA_CONSUMER_GROUP", "").strip():
            raise ConfigError("KAFKA_CONSUMER_GROUP_REPLAY no puede ser el mismo grupo que KAFKA_CONSUMER_GROUP (el replay no confirma offsets reales)")
        eventos = _entero("REPLAY_EVENTOS", 30)
        if eventos > 1000:
            raise ConfigError(f"REPLAY_EVENTOS no puede superar 1000, no {eventos}")
        espera_final = _entero("REPLAY_ESPERA_FINAL_S", 10)
        espera_max = _entero("REPLAY_ESPERA_MAX_S", 120)
        if espera_max < espera_final:
            raise ConfigError(f"REPLAY_ESPERA_MAX_S ({espera_max}) no puede ser menor que REPLAY_ESPERA_FINAL_S ({espera_final})")
        return cls(topic=topic, grupo=grupo, eventos=eventos, intervalo_s=_decimal("REPLAY_INTERVALO_S", 2.0, 0.01, 3600.0),
                   espera_final_s=espera_final, espera_max_s=espera_max)
