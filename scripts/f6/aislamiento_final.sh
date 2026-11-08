#!/usr/bin/env bash
# Aislamiento e invariantes finales de F6 (6.3, T033; FR-006, FR-014, SC-007). SOLO LECTURA. Uso: scripts/f6/aislamiento_final.sh
# Parte de scripts/f5/aislamiento_final.sh (sin debilitar nada) y añade el esquema `replay`: sin referencias cruzadas con live/historico, mensajes de replay solo en su topic y recursos temporales a 0.
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a
export MSYS_NO_PATHCONV=1
q() { docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1" | tr -d '\r'; }
ok() { if [ "$1" = "$2" ]; then echo "  OK    $3 ($1)"; else echo "  FALLA $3: obtenido '$1', esperado '$2'"; FALLOS=$((FALLOS+1)); fi; }
FALLOS=0
# F6 (FR-041): con la clave de acceso activa, las consultas a la API la llevan en cabecera (leída del .env, desde un archivo temporal; no se imprime)
CAB=""; if [ -f .env ] && grep -qE '^API_CLAVE_ACCESO=.+' .env; then CAB="$(cygpath -m "$(mktemp)")"; chmod 600 "$CAB"; printf 'X-Observatorio-Clave: %s\n' "$(grep -E '^API_CLAVE_ACCESO=' .env | cut -d= -f2- | tr -d '\r')" > "$CAB"; trap 'rm -f "$CAB"' EXIT; fi
apicurl() { if [ -n "$CAB" ]; then curl -H @"$CAB" "$@"; else curl "$@"; fi; }
echo "# 6.3 T033 - aislamiento e invariantes finales (F5 + replay) $(date -u +%FT%TZ)"
echo "## Datos: live / historico / sintetico"
ok "$(q "select count(*) from live.evento_actual where mode <> 'live'")" 0 "live.evento_actual con mode distinto de live"
ok "$(q "select count(*) from live.evento_actual where source not in ('usgs-all-day','usgs-fdsn-recuperacion')")" 0 "live.evento_actual con source fuera del contrato"
ok "$(q "select count(*) from historico.evento h join live.evento_actual l using (event_id)")" 0 "ids de historico en live.evento_actual"
ok "$(q "select count(*) from historico.evento h join live.evento_version l using (event_id)")" 0 "ids de historico en live.evento_version"
ok "$(q "select count(*) from live.evento_actual where source like 'historico%' or source like 'sint%' or event_id like 'prueba-%'")" 0 "filas históricas, sintéticas o de prueba en live"
ok "$(q "select count(*) from historico.evento where event_id like 'prueba-%'")" 0 "filas de prueba en historico"
ok "$(q "select count(*)||' '||md5(string_agg(t::text,'|' order by t::text)) from sintetico.evento_actual t")" "18 5b9d041e8ff21ee9822d336b53ee8aff" "sintetico.evento_actual intacto (filas y md5)"
ok "$(q "select md5(string_agg(event_id||updated_at::text||coalesce(country_id,'-'), '|' order by event_id)) from historico.evento")" 057f8f4ebaaf142ebe3eda20346c65f7 "historico.evento intacto (md5)"
ok "$(q "select count(*) from historico.evento")" 18302 "filas del histórico de 2025"
ok "$(q "select count(*) from pg_database where left(datname, 4) = 'obs_'")" 0 "bases temporales sin eliminar"
API=$(apicurl -s http://127.0.0.1:8000/api/eventos)
ok "$(echo "$API" | grep -o '"mode":"[a-z]*"' | sort -u | tr '\n' ' ')" '"mode":"live" ' "modos presentes en /api/eventos"
IDS=$(echo "$API" | grep -o '"id":"[^"]*"' | sed 's/"id":"//; s/"$//' | sed "s/.*/'&'/" | paste -sd, -)
ok "$(q "select count(*) from historico.evento where event_id in ($IDS)")" 0 "eventos de /api/eventos que están en historico"
echo "## Código (la API solo lee; solo comparacion.py toca historico)"
ok "$(grep -rliE --include='*.py' 'synthetic|sintetico' backend/src | wc -l)" 0 "archivos de backend/src que mencionan synthetic o sintetico"
ok "$(grep -rliE --include='*.py' '(FROM|JOIN) +historico\.' backend/src/observatorio/api | tr '
' ' ')" "backend/src/observatorio/api/comparacion.py " "módulos de la API que LEEN historico (replay.py solo cita la clave «historico: null» del contrato)"
ok "$(grep -rliE --include='*.py' '(FROM|JOIN|INTO|UPDATE) +historico\.' backend/src/observatorio/consumer backend/src/observatorio/producer | wc -l)" 0 "consumidor y productor que leen o escriben el esquema historico"
ok "$(grep -rliE --include='*.py' '(FROM|JOIN|INTO|UPDATE) +historico\.' backend/src/observatorio/replay | sed 's#.*/##' | tr '
' ' ')" "seleccion.py " "módulos del replay que leen historico (solo la selección, con SELECT)"
ok "$(grep -rliE --include='*.py' '(INSERT INTO|UPDATE|DELETE FROM) +historico\.' backend/src/observatorio/api backend/src/observatorio/consumer backend/src/observatorio/producer backend/src/observatorio/replay | wc -l)" 0 "API, consumidor, productor y replay que escriben en historico (solo lo escribe la carga de F4)"
ok "$(grep -rliE '\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)\b' backend/src/observatorio/api | wc -l)" 0 "módulos de la API con sentencias de escritura o DDL"
echo "## Servicios y puertos"
ok "$(docker compose config --services | sort | tr '\n' ' ')" "api consumer kafka postgres producer " "servicios de compose.yaml (FR-023)"
ok "$(docker compose ps --format '{{.Service}}={{.Ports}}' | grep -- '->' | tr -d '\n')" "api=127.0.0.1:8000->8000/tcp" "puerto publicado y dirección (solo la API, solo 127.0.0.1)"
ok "$(docker compose ps --format '{{.Health}}' | grep -c '^healthy$')" 5 "servicios healthy"
ok "$(docker ps -a --format '{{.Names}}' | grep -c 'api-f5')" 0 "contenedores temporales de F5 sin eliminar"
ok "$(docker volume ls --format '{{.Name}}' | grep observatorio | tr '\n' ' ')" "observatorio_kafkadata observatorio_pgdata " "volúmenes (sin borrar ni añadir)"
ok "$(apicurl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8000/api/eventos)" 405 "POST a /api/eventos rechazado"
ok "$(apicurl -s -D - -o /dev/null -H 'Origin: http://localhost:4200' http://127.0.0.1:8000/api/salud | tr -d '\r' | grep -ci '^access-control-allow-origin: http://localhost:4200$')" 1 "CORS limitado a los orígenes configurados (API_CORS_ORIGINS)"
echo "## Archivos que no deben cambiar"
ok "$(git status --short -- docs/referencias specs/001-* specs/002-* specs/003-* | wc -l)" 0 "cambios en docs/referencias, specs/001, specs/002 y specs/003"
ok "$(sha256sum frontend/public/datos/paises.geojson | cut -d' ' -f1)" d2aec98bfd1ffda2d8adea42b7ec473365eef38defc48e83afb7d58ae60bfe7c "huella del catálogo de países entregado"
ok "$(git status --short -- frontend/public frontend/package.json frontend/package-lock.json frontend/angular.json frontend/tsconfig.json frontend/tsconfig.app.json | wc -l)" 0 "config.json, catálogo, package*.json, angular.json y tsconfig sin cambios"
ok "$(git ls-files | grep -cE '(^|/)\.env$')" 0 ".env real versionado"
ok "$(git status --short | awk '{print $2}' | grep -cE '(^|/)\.env$')" 0 ".env real entre los cambios pendientes"
ok "$(git check-ignore data/historico | wc -l)" 1 "data/historico ignorado por Git"
ok "$(git ls-files | grep -c '^data/')" 0 "archivos de data/ versionados"
echo "## F6: esquema replay"
ok "$(q "select count(*) from replay.evento_actual where mode <> 'replay' or source <> 'replay-historico'")" 0 "replay.evento_actual con modo o fuente que no son de replay"
ok "$(q "select count(*) from replay.evento_version where mode <> 'replay' or source <> 'replay-historico'")" 0 "replay.evento_version con modo o fuente que no son de replay"
ok "$(q "select count(*) from replay.evento_actual r join live.evento_actual l using (event_id)")" 0 "ids de replay en live.evento_actual"
ok "$(q "select count(*) from replay.evento_version r join live.evento_version l using (event_id)")" 0 "ids de replay en live.evento_version"
ok "$(q "select count(*) from replay.evento_actual r join sintetico.evento_actual s using (event_id)")" 0 "ids de replay en sintetico.evento_actual"
ok "$(q "select count(*) from historico.evento h where h.event_id like 'replay-ctl-%'")" 0 "casos controlados en historico"
ok "$(q "select count(*) from replay.evento_actual where caso is not null and event_id not like 'replay-ctl-%'")" 0 "casos controlados sin id propio"
ok "$(q "select count(*) from replay.evento_actual where caso is null and event_id like 'replay-ctl-%'")" 0 "ids de caso controlado sin caso"
ok "$(q "select count(*) from live.evento_actual where event_id like 'replay-ctl-%' or kafka_topic <> 'terremotos.live'")" 0 "filas de live con id de caso o topic distinto del de live"
ok "$(q "select count(*) from live.evento_version where kafka_topic <> 'terremotos.live'")" 0 "versiones de live con topic distinto del de live"
ok "$(q "select count(*) from replay.evento_actual where kafka_topic <> 'terremotos.replay'")" 0 "filas de replay con topic distinto del de replay"
ok "$(q "select count(*) from live.cuarentena where convert_from(payload, 'UTF8') like '%replay-historico%'")" 0 "mensajes de replay llegados al topic de live (cuarentena de live)"
ok "$(q "select count(*) from pg_constraint c join pg_class a on a.oid = c.conrelid join pg_namespace na on na.oid = a.relnamespace join pg_class b on b.oid = c.confrelid join pg_namespace nb on nb.oid = b.relnamespace where c.contype = 'f' and ((na.nspname = 'replay' and nb.nspname in ('live','historico','sintetico')) or (na.nspname in ('live','historico','sintetico') and nb.nspname = 'replay'))")" 0 "claves foráneas entre replay y live/historico/sintetico (en ambos sentidos)"
ok "$(q "select count(*) from live.evento_actual where run_id is not null" 2>/dev/null | head -1)" "" "live.evento_actual no tiene columna run_id (error esperado = vacío)"
ok "$(grep -rlE --include='*.py' 'replay\.(evento_actual|evento_version|cuarentena|ejecucion)' backend/src/observatorio/consumer backend/src/observatorio/producer backend/src/observatorio/api | sed 's#.*/##' | sort | tr '
' ' ')" "filtros.py replay.py " "módulos que nombran tablas de replay con su nombre literal: solo el selector y el SQL de lectura de la API (el consumidor las compone con el destino parametrizado)"
ok "$(grep -c 'replay' backend/src/observatorio/api/comparacion.py)" 0 "comparacion.py (único lector de historico) sin menciones de replay"
ok "$(q "select count(*) from replay.ejecucion")" 2 "ejecuciones de replay conservadas (r-f6-prueba-a y r-f6-prueba-b)"
ok "$(q "select count(*) from replay.evento_actual where run_id in ('r-f6-prueba-a','r-f6-prueba-b')")" 70 "eventos actuales de las dos ejecuciones conservadas"
API_R=$(apicurl -s "http://127.0.0.1:8000/api/eventos?mode=replay&limit=5000")
IDS_R=$(echo "$API_R" | grep -o '"id":"[^"]*"' | sed 's/"id":"//; s/"$//' | sed "s/.*/'&'/" | paste -sd, -)
ok "$(q "select count(*) from live.evento_actual where event_id in ($IDS_R)")" 0 "eventos de /api/eventos?mode=replay que están en live"
ok "$(q "select count(*) from historico.evento where event_id like 'replay-ctl-%' or event_id in ($(echo "$IDS_R" | grep -o "'replay-ctl[^']*'" | paste -sd, - | sed 's/^$/'"''"'/'))")" 0 "casos controlados de la API de replay en historico"
echo "## F6: recursos temporales (el topic y el grupo de replay están exentos)"
ok "$(docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:9092 --list 2>/dev/null | tr -d '\r' | grep -v -E '^(__consumer_offsets|terremotos\.live|terremotos\.replay)$' | wc -l)" 0 "topics distintos de los permanentes"
ok "$(docker compose exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka:9092 --list 2>/dev/null | tr -d '\r' | grep -v -E '^(consumidor-live|consumidor-replay)$' | grep -c .)" 0 "grupos de consumidores distintos de los permanentes"
ok "$(docker ps -a --format '{{.Names}}' | grep -cE 'api-f5|-f6-|consumer-run|producer-run')" 0 "contenedores temporales sin eliminar"
ok "$(docker compose ps --format '{{.Service}}={{.Ports}}' | grep -E 'kafka|postgres' | grep -c -- '->')" 0 "Kafka y PostgreSQL sin puertos publicados"
echo; if [ "$FALLOS" = 0 ]; then echo "RESULTADO: OK - aislamiento verificado"; else echo "RESULTADO: $FALLOS FALLOS"; fi
