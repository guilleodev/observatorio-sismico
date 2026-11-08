#!/usr/bin/env bash
# Invariantes y estado del sistema (F6, T001). SOLO LECTURA: únicamente SELECT, `docker compose ps/exec` de consulta, `docker inspect` y `kafka-*.sh --list/--describe`.
# No para, arranca, recrea ni borra nada. Uso: scripts/f6/invariantes.sh [etiqueta]
# Incluye los invariantes de F3/F4 (scripts/f4/invariantes.sh) y añade: ids de contenedores, imágenes y volúmenes, puertos publicados,
# esquemas presentes, recursos temporales (el topic `terremotos.replay` y el grupo `consumidor-replay` son PERMANENTES y están exentos, A-13) y el contenido del esquema `replay` si existe.
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a
export MSYS_NO_PATHCONV=1
q() { docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1" 2>/dev/null | tr -d '\r'; }
kafka() { docker compose exec -T kafka /opt/kafka/bin/"$@" 2>/dev/null | tr -d '\r'; }

bash scripts/f4/invariantes.sh "${1:-}"

echo "== estado del sistema [${1:-}] $(date -u +%FT%TZ) =="
echo "contenedores (servicio=id): $(docker compose ps --format '{{.Service}}={{.ID}}' | sort | tr '\n' ' ')"
echo "imágenes en uso (contenedor=imagen): $(docker compose ps -q | xargs docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}={{.Image}}' | sort | tr '\n' ' ')"
echo "volúmenes (nombre=creado): $(docker volume ls --format '{{.Name}}' | grep -E '^observatorio_(pgdata|kafkadata)$' | sort | xargs docker volume inspect -f '{{.Name}}={{.CreatedAt}}' | tr '\n' ' ')"
echo "puertos publicados en el equipo: $(docker compose ps --format '{{.Service}}={{.Ports}}' | grep -- '->' | tr '\n' ' ')"
echo "esquemas presentes: $(q "SELECT string_agg(schema_name, ',' ORDER BY schema_name) FROM information_schema.schemata WHERE schema_name IN ('live','geo','historico','sintetico','replay')")"
echo "live: eventos actuales=$(q "SELECT count(*) FROM live.evento_actual") | versiones=$(q "SELECT count(*) FROM live.evento_version") | cuarentena=$(q "SELECT count(*) FROM live.cuarentena") | huecos pendientes=$(q "SELECT count(*) FROM live.hueco WHERE recuperado_at IS NULL" || echo n/d)"
echo "live: modos distintos de live=$(q "SELECT count(*) FROM live.evento_actual WHERE mode <> 'live'") | filas de prueba (prueba-%)=$(q "SELECT count(*) FROM live.evento_actual WHERE event_id LIKE 'prueba-%'")"

if [ "$(q "SELECT to_regclass('replay.evento_actual') IS NOT NULL")" = "t" ]; then
  echo "replay: ejecuciones=$(q "SELECT count(*) FROM replay.ejecucion") | actuales=$(q "SELECT count(*) FROM replay.evento_actual") | versiones=$(q "SELECT count(*) FROM replay.evento_version") | cuarentena=$(q "SELECT count(*) FROM replay.cuarentena")"
else
  echo "replay: el esquema todavía no existe (se crea en el paso 6.1 con autorización PA-2)"
fi

# Recursos temporales: deben ser 0. Exentos: topic terremotos.live/terremotos.replay, __consumer_offsets, grupos consumidor-live/consumidor-replay.
echo "bases temporales (obs_*): $(q "SELECT count(*) FROM pg_database WHERE left(datname, 4) = 'obs_'")"
echo "contenedores temporales (api-f5, *-f6-*, limpio): $(docker ps -a --format '{{.Names}}' | grep -cE 'api-f5|-f6-|limpio')"
echo "topics distintos de los permanentes: $(kafka kafka-topics.sh --bootstrap-server localhost:9092 --list | grep -vE '^(terremotos\.live|terremotos\.replay|__consumer_offsets)$' | tr '\n' ' ')"
echo "grupos distintos de los permanentes: $(kafka kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list | grep -vE '^(consumidor-live|consumidor-replay)$' | tr '\n' ' ')"
echo "topics presentes: $(kafka kafka-topics.sh --bootstrap-server localhost:9092 --list | sort | tr '\n' ' ')"
