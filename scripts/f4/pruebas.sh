#!/usr/bin/env bash
# Ejecuta las pruebas del backend en un contenedor temporal (--rm) en la red de Compose, con PostgreSQL real y el catalogo montado.
# Uso: scripts/f4/pruebas.sh [argumentos de pytest]    (no toca contenedores en marcha ni volumenes)
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a
export MSYS_NO_PATHCONV=1
docker run --rm --network observatorio_observatorio \
  -e POSTGRES_HOST=postgres -e POSTGRES_DB -e POSTGRES_USER -e POSTGRES_PASSWORD \
  -e CATALOGO_PATH=/datos/paises.geojson \
  -v "$PWD/backend:/app" -v "$PWD/sql:/sql:ro" -v "$PWD/scripts/f4:/scripts:ro" -v "$PWD/frontend/public/datos/paises.geojson:/datos/paises.geojson:ro" \
  -w /app python:3.13-slim-trixie bash -c "pip install -q --no-cache-dir -r requirements-dev.txt >/dev/null 2>&1 && python -m pytest -q -p no:cacheprovider $*"
