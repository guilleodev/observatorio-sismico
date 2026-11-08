#!/usr/bin/env bash
# Ejecuta un comando en un contenedor TEMPORAL de pruebas (--rm, red de Compose, PostgreSQL real). No toca los servicios en marcha ni los volúmenes.
# Uso: scripts/f6/ejecutar.sh <comando...>          (con F6_KAFKA=1 se pasa también KAFKA_BOOTSTRAP_SERVERS=kafka:9092)
# Montados: /app = backend, /sql = sql (solo lectura), /scripts = scripts/f4 (solo lectura), /scripts5 = scripts/f5 (solo lectura),
#           /scripts6 = scripts/f6 (solo lectura) y el catálogo de países (solo lectura). Idéntico a scripts/f5/ejecutar.sh más /scripts6.
# Las pruebas con PostgreSQL usan transacciones que se revierten o una base temporal que ellas mismas eliminan; nada de esto escribe en las tablas definitivas.
# Las pruebas con Kafka real (F6_KAFKA=1) usan topics y grupos TEMPORALES `test-f6-*`: se limpian después con scripts/f6/limpiar_temporales_kafka.sh.
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a
export MSYS_NO_PATHCONV=1
docker run --rm --network observatorio_observatorio \
  -e POSTGRES_HOST=postgres -e POSTGRES_DB -e POSTGRES_USER -e POSTGRES_PASSWORD \
  -e CATALOGO_PATH=/datos/paises.geojson -e PYTHONIOENCODING=utf-8 ${F6_KAFKA:+-e KAFKA_BOOTSTRAP_SERVERS=kafka:9092} \
  -v "$PWD/backend:/app" -v "$PWD/sql:/sql:ro" -v "$PWD/scripts/f4:/scripts:ro" -v "$PWD/scripts/f5:/scripts5:ro" -v "$PWD/scripts/f6:/scripts6:ro" \
  -v "$PWD/frontend/public/datos/paises.geojson:/datos/paises.geojson:ro" \
  -w /app python:3.13-slim-trixie bash -c "pip install -q --no-cache-dir -r requirements-dev.txt >/dev/null 2>&1 && $*"
