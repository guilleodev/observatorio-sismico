#!/usr/bin/env bash
# Carga historica real de USGS 2025 (F4, 4.4, T038). Primero repite el count mensual (referencia de SC-006) y despues carga una sola vez.
# No recrea contenedores ni borra nada: usa `docker compose run --rm --no-deps` (contenedor temporal) y un montaje de exportacion.
set -uo pipefail
cd "$(dirname "$0")/../.."
export MSYS_NO_PATHCONV=1
echo "# 4.4 T038 - carga real de USGS 2025 (M>=4, earthquake) $(date -u +%FT%TZ)"
echo "## count mensual justo antes de la carga (referencia de SC-006)"
docker compose run --rm --no-deps producer python -m observatorio.historico.cargar --solo-recuento 2>&1 | grep -v "^ Container"
echo "## carga"
t0=$(date +%s)
docker compose run --rm --no-deps \
  -v "$PWD/frontend/public/datos/paises.geojson:/datos/paises.geojson:ro" -v "$PWD/data/historico:/exportacion" \
  -e CATALOGO_PATH=/datos/paises.geojson producer python -m observatorio.historico.cargar 2>&1 | grep -v "^ Container"
echo "codigo_de_salida=${PIPESTATUS[0]}"
echo "duracion_total_reloj_s=$(( $(date +%s) - t0 )) (incluye el arranque del contenedor)"
