#!/usr/bin/env bash
# Despliegue de F4 4.5 (T051): reconstruye la imagen y recrea SOLO consumer y producer (nunca kafka ni postgres; sin down ni -v).
# Orden: primero el consumidor (admite ya los dos source), luego el productor. Observa >= 10 ciclos del productor.
cd "$(dirname "$0")/../.."
export MSYS_NO_PATHCONV=1
set -a; . ./.env; set +a
esperar() { for i in $(seq 1 60); do [ "$(docker compose ps --format '{{.Health}}' | grep -c '^healthy$')" = 5 ] && return 0; sleep 3; done; return 1; }
echo "# 4.5 T051 - despliegue de producer y consumer $(date -u +%FT%TZ)"
echo "ids de contenedor antes: $(docker compose ps --format '{{.Service}}={{.ID}}' | sort | tr '\n' ' ')"
echo "## precondiciones"; scripts/f4/invariantes.sh "antes del despliegue" | sed -n 2,3p
echo "## build"; docker compose build 2>&1 | grep -E "Built|ERROR" | sort -u
echo "## recrear consumer y luego producer (solo esos dos)"
docker compose up -d --no-deps consumer 2>&1 | grep -v "^$"; sleep 8
docker compose up -d --no-deps producer 2>&1 | grep -v "^$"
esperar && echo "5 servicios healthy" || echo "TIEMPO AGOTADO esperando healthy"
echo "ids de contenedor despues: $(docker compose ps --format '{{.Service}}={{.ID}}' | sort | tr '\n' ' ')"
echo "margen de huecos en el productor: $(docker compose exec -T producer printenv HUECO_MARGEN_S)"
inicio=$(date -u +%FT%TZ)
echo "## observación: >= 10 ciclos del productor desde $inicio"
for i in $(seq 1 240); do n=$(docker compose logs --since "$inicio" producer 2>&1 | grep -c "Consulta ok"); [ "$n" -ge 11 ] && break; sleep 5; done
echo "ciclos observados: $n"
docker compose logs --since "$inicio" producer 2>&1 | grep -E "Consulta|HUECO|ERROR|WARNING" | cut -c1-200 | tail -14
echo "huecos anotados en funcionamiento normal: $(docker compose exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -tAc 'select count(*) from live.hueco')"
echo "errores del consumidor desde el despliegue: $(docker compose logs --since "$inicio" consumer 2>&1 | grep -ci error)"
scripts/f4/invariantes.sh "tras el despliegue"
