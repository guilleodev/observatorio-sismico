#!/usr/bin/env bash
# Aislamiento final de F4 (T063, SC-008, SC-012, FR-025). SOLO LECTURA. Uso: scripts/f4/aislamiento_final.sh
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a
export MSYS_NO_PATHCONV=1
q() { docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1" | tr -d '\r'; }
ok() { if [ "$1" = "$2" ]; then echo "  OK    $3 ($1)"; else echo "  FALLA $3: obtenido '$1', esperado '$2'"; FALLOS=$((FALLOS+1)); fi; }
FALLOS=0
echo "# 4.6 T063 - aislamiento final $(date -u +%FT%TZ)"
echo "## Datos: live / historico / sintetico"
ok "$(q "select count(*) from live.evento_actual where mode <> 'live'")" 0 "live.evento_actual con mode distinto de live"
ok "$(q "select count(*) from live.evento_version where mode <> 'live'")" 0 "live.evento_version con mode distinto de live"
ok "$(q "select count(*) from live.evento_actual where source not in ('usgs-all-day','usgs-fdsn-recuperacion')")" 0 "live.evento_actual con source fuera del contrato"
ok "$(q "select count(*) from live.evento_version where source not in ('usgs-all-day','usgs-fdsn-recuperacion')")" 0 "live.evento_version con source fuera del contrato"
ok "$(q "select count(*) from historico.evento h join live.evento_actual l using (event_id)")" 0 "ids de historico en live.evento_actual"
ok "$(q "select count(*) from historico.evento h join live.evento_version l using (event_id)")" 0 "ids de historico en live.evento_version"
ok "$(q "select count(*) from historico.evento where origen <> 'historico-usgs-fdsn'")" 0 "filas de historico con origen distinto del histórico"
ok "$(q "select count(*) from live.evento_actual where source like 'historico%' or source like 'sint%'")" 0 "filas históricas o sintéticas en live"
ok "$(q "select count(*) from information_schema.table_constraints c join information_schema.constraint_column_usage u using (constraint_name, constraint_schema) where c.constraint_type='FOREIGN KEY' and ((c.table_schema='historico' and u.table_schema in ('live','sintetico')) or (c.table_schema='live' and u.table_schema in ('historico','sintetico')))")" 0 "claves foráneas entre live, historico y sintetico"
ok "$(q "select count(*)||' '||md5(string_agg(t::text,'|' order by t::text)) from sintetico.evento_actual t")" "18 5b9d041e8ff21ee9822d336b53ee8aff" "sintetico.evento_actual intacto (filas y md5)"
API=$(curl -s http://127.0.0.1:8000/api/eventos)
ok "$(echo "$API" | grep -o '"mode":"[a-z]*"' | sort -u | tr '\n' ' ')" '"mode":"live" ' "modos presentes en /api/eventos"
IDS=$(echo "$API" | grep -o '"id":"[^"]*"' | sed 's/"id":"//; s/"$//' | sed "s/.*/'&'/" | paste -sd, -)
ok "$(q "select count(*) from historico.evento where event_id in ($IDS)")" 0 "eventos de /api/eventos que están en historico"
echo "## Código"
ok "$(grep -rliE 'synthetic|sintetico' backend/src | wc -l)" 0 "archivos de backend/src que mencionan synthetic o sintetico"
ok "$(grep -rli 'historico' backend/src/observatorio/api backend/src/observatorio/consumer backend/src/observatorio/producer | wc -l)" 0 "API, consumidor y productor que leen o escriben el esquema histórico"
echo "## Servicios y puertos"
ok "$(docker compose config --services | sort | tr '\n' ' ')" "api consumer kafka postgres producer " "servicios de compose.yaml (FR-025)"
ok "$(docker compose ps --format '{{.Ports}}' | grep -c -- '->')" 1 "puertos publicados en el equipo (solo la API)"
ok "$(docker compose ps --format '{{.Service}}={{.Ports}}' | grep -- '->' | tr -d '\n')" "api=127.0.0.1:8000->8000/tcp" "puerto publicado y dirección (solo 127.0.0.1)"
ok "$(docker compose ps --format '{{.Health}}' | grep -c '^healthy$')" 5 "servicios healthy"
ok "$(docker volume ls --format '{{.Name}}' | grep observatorio | tr '\n' ' ')" "observatorio_kafkadata observatorio_pgdata " "volúmenes (sin borrar ni añadir)"
echo "## Archivos que no deben cambiar"
ok "$(git status --short -- docs/referencias specs/001-* specs/002-* frontend | wc -l)" 0 "cambios en docs/referencias, specs/001, specs/002 y frontend"
ok "$(sha256sum frontend/public/datos/paises.geojson | cut -d' ' -f1)" d2aec98bfd1ffda2d8adea42b7ec473365eef38defc48e83afb7d58ae60bfe7c "huella del catálogo de países entregado"
ok "$(git ls-files | grep -c '^\.env$')" 0 ".env real versionado"
ok "$(git check-ignore data/historico | wc -l)" 1 "data/historico ignorado por Git"
ok "$(git ls-files | grep -c '^data/')" 0 "archivos de data/ versionados"
echo; if [ "$FALLOS" = 0 ]; then echo "RESULTADO: OK - aislamiento verificado"; else echo "RESULTADO: $FALLOS FALLOS"; fi
