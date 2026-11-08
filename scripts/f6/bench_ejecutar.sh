#!/usr/bin/env bash
# Mediciones de 6.4 (F6, T036) en RECURSOS TEMPORALES: una red propia, un PostgreSQL propio (bench-f6-pg, datos en tmpfs, sin puertos publicados ni volúmenes) y un contenedor de medida.
# No se conecta al PostgreSQL ni a Kafka reales; el servicio real solo se CONSULTA antes y después para demostrar que sus datos no cambian. Todo lo creado se elimina al terminar.
# Uso: bash scripts/f6/bench_ejecutar.sh [bench_medidas.py | bench_comparaciones.py]   (por defecto las mediciones de 6.4; con el segundo, las comparaciones de 6.5)
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a
export MSYS_NO_PATHCONV=1
SCRIPT=${1:-bench_medidas.py}
RED=bench-f6-net PG=bench-f6-pg MED=bench-f6-med
q() { docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1" | tr -d '\r'; }
huella() {
  echo "live: actuales=$(q "select count(*) from live.evento_actual") versiones=$(q "select count(*) from live.evento_version") (la ingesta real sigue y puede crecer)"
  echo "historico: md5=$(q "select md5(string_agg(event_id||updated_at::text||coalesce(country_id,'-'), '|' order by event_id)) from historico.evento")"
  echo "sintetico: $(q "select count(*)||' '||md5(string_agg(t::text,'|' order by t::text)) from sintetico.evento_actual t")"
  echo "replay: $(q "select count(*) from replay.ejecucion") ejecuciones, $(q "select count(*) from replay.evento_actual") actuales, md5=$(q "select md5(string_agg(t::text,'|' order by run_id, event_id)) from replay.evento_actual t")"
  echo "esquemas: $(q "select string_agg(schema_name, ',' order by schema_name) from information_schema.schemata where schema_name in ('bench','live','geo','historico','sintetico','replay')") | bases obs_*/bench: $(q "select count(*) from pg_database where left(datname, 4) = 'obs_' or datname = 'bench'")"
}
limpiar() { docker rm -f "$MED" "$PG" >/dev/null 2>&1; docker network rm "$RED" >/dev/null 2>&1; }
trap limpiar EXIT
VOL_ANTES=$(docker volume ls -q | wc -l)
limpiar

echo "# 6.4/6.5 - $SCRIPT: mediciones de tiempo y memoria $(date -u +%FT%TZ)"
echo; echo "## Equipo y estado"
echo "docker: $(docker info --format 'CPUs={{.NCPU}} memoria={{.MemTotal}} B SO={{.OperatingSystem}} núcleo={{.KernelVersion}} Docker={{.ServerVersion}}')"
echo "anfitrión: $(powershell -NoProfile -Command "(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name) + ' | ' + [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB,1) + ' GB RAM | ' + (Get-CimInstance Win32_OperatingSystem).Caption" 2>/dev/null | tr -d '\r')"
echo "servicios reales en marcha durante la medición (ingesta real activa, no se detienen): $(docker compose ps --format '{{.Service}}={{.Health}}' | tr '\n' ' ')"
echo "carga instantánea de los contenedores reales:"; docker stats --no-stream --format '  {{.Name}} CPU={{.CPUPerc}} MEM={{.MemUsage}}' | grep -E 'observatorio-'
echo; echo "## Datos reales ANTES"; huella > /tmp/bench_antes.txt; cat /tmp/bench_antes.txt

docker network create "$RED" >/dev/null
docker run -d --name "$PG" --network "$RED" --tmpfs /var/lib/postgresql/data:rw,size=1g -e POSTGRES_PASSWORD=bench -e POSTGRES_DB=bench postgres:17.11 >/dev/null
for i in $(seq 1 40); do docker exec "$PG" pg_isready -U postgres -d bench >/dev/null 2>&1 && break; sleep 1; done
echo; echo "## Recursos temporales: $(docker ps --format '{{.Names}}={{.Image}}' | grep bench-f6 | tr '\n' ' ') | volúmenes anónimos del temporal: $(docker inspect -f '{{len .Mounts}}' "$PG") montajes (tmpfs)"
echo "PostgreSQL temporal: $(docker exec "$PG" psql -U postgres -d bench -tAc 'select version()' | cut -c1-60) | shared_buffers=$(docker exec "$PG" psql -U postgres -d bench -tAc 'show shared_buffers')"

docker run --name "$MED" --network "$RED" \
  -e BENCH_PG_HOST="$PG" -e BENCH_PG_DB=bench -e BENCH_PG_PASSWORD=bench -e CATALOGO_PATH=/datos/paises.geojson -e PYTHONIOENCODING=utf-8 \
  -v "$PWD/backend:/app:ro" -v "$PWD/scripts/f6:/scripts6:ro" -v "$PWD/frontend/public/datos/paises.geojson:/datos/paises.geojson:ro" \
  -e SCRIPT="$SCRIPT" -w /app python:3.13-slim-trixie bash -c '
    pip install -q --no-cache-dir -r requirements-dev.txt >/dev/null 2>&1
    echo; echo "## Versiones: Python $(python -V | cut -d" " -f2), shapely $(python -c "import shapely;print(shapely.__version__)"), psycopg $(python -c "import psycopg;print(psycopg.__version__)"), GEOS $(python -c "import shapely;print(shapely.geos_version_string)")"
    echo; echo "## Pruebas del generador (con la base temporal)"
    python -m pytest -q -p no:cacheprovider /scripts6/test_bench_datos.py 2>&1 | tail -2
    echo; echo "## Mediciones (un proceso por tamaño)"
    python -X utf8 /scripts6/$SCRIPT --todos'
rc=$?

echo; echo "## Datos reales DESPUÉS"; huella > /tmp/bench_despues.txt; cat /tmp/bench_despues.txt
echo; echo "## Comparación (las líneas de live pueden crecer por la ingesta real; el resto debe ser idéntico)"
diff <(grep -v '^live:' /tmp/bench_antes.txt) <(grep -v '^live:' /tmp/bench_despues.txt) && echo "historico, sintetico, replay y esquemas: IDÉNTICOS antes y después"
limpiar
trap - EXIT
echo; echo "## Recursos temporales tras eliminar: contenedores=$(docker ps -a --format '{{.Names}}' | grep -c bench-f6) redes=$(docker network ls --format '{{.Name}}' | grep -c bench-f6) volúmenes totales ahora/antes=$(docker volume ls -q | wc -l)/$VOL_ANTES | servicios reales: $(docker compose ps --format '{{.Service}}={{.Health}}' | tr '\n' ' ')"
exit $rc
