#!/usr/bin/env bash
# Ejecuta un comando en el contenedor temporal de pruebas (--rm, red de Compose, PostgreSQL real). No toca los servicios en marcha ni los volúmenes.
# Uso: scripts/f5/ejecutar.sh <comando...>      (montados: /app backend, /sql, /scripts = scripts/f4 (solo lectura), /scripts5 = scripts/f5, catálogo)
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a
export MSYS_NO_PATHCONV=1
docker run --rm --network observatorio_observatorio \
  -e POSTGRES_HOST=postgres -e POSTGRES_DB -e POSTGRES_USER -e POSTGRES_PASSWORD \
  -e CATALOGO_PATH=/datos/paises.geojson -e PYTHONIOENCODING=utf-8 \
  -v "$PWD/backend:/app" -v "$PWD/sql:/sql:ro" -v "$PWD/scripts/f4:/scripts:ro" -v "$PWD/scripts/f5:/scripts5:ro" \
  -v "$PWD/frontend/public/datos/paises.geojson:/datos/paises.geojson:ro" \
  -w /app python:3.13-slim-trixie bash -c "pip install -q --no-cache-dir -r requirements-dev.txt >/dev/null 2>&1 && $*"
