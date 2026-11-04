"""Lectura de la configuración desde variables de entorno (sin valores por defecto ocultos)."""

import os
from dataclasses import dataclass


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
