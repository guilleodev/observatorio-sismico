#!/usr/bin/env bash
# Aislamiento e invariantes finales de F5 (T056, SC-012, FR-023). SOLO LECTURA. Uso: scripts/f5/aislamiento_final.sh
# Adaptado de scripts/f4/aislamiento_final.sh: en F5 SÍ cambian el frontend (src/app) y el servicio api, así que se comprueban otras cosas.
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a
export MSYS_NO_PATHCONV=1
q() { docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1" | tr -d '\r'; }
ok() { if [ "$1" = "$2" ]; then echo "  OK    $3 ($1)"; else echo "  FALLA $3: obtenido '$1', esperado '$2'"; FALLOS=$((FALLOS+1)); fi; }
FALLOS=0
echo "# 5 T056 - aislamiento e invariantes finales $(date -u +%FT%TZ)"
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
API=$(curl -s http://127.0.0.1:8000/api/eventos)
ok "$(echo "$API" | grep -o '"mode":"[a-z]*"' | sort -u | tr '\n' ' ')" '"mode":"live" ' "modos presentes en /api/eventos"
IDS=$(echo "$API" | grep -o '"id":"[^"]*"' | sed 's/"id":"//; s/"$//' | sed "s/.*/'&'/" | paste -sd, -)
ok "$(q "select count(*) from historico.evento where event_id in ($IDS)")" 0 "eventos de /api/eventos que están en historico"
echo "## Código (la API solo lee; solo comparacion.py toca historico)"
ok "$(grep -rliE --include='*.py' 'synthetic|sintetico' backend/src | wc -l)" 0 "archivos de backend/src que mencionan synthetic o sintetico"
ok "$(grep -rli --include='*.py' 'historico' backend/src/observatorio/api | tr '\n' ' ')" "backend/src/observatorio/api/comparacion.py " "módulos de la API que mencionan historico"
ok "$(grep -rli --include='*.py' 'historico' backend/src/observatorio/consumer backend/src/observatorio/producer | wc -l)" 0 "consumidor y productor que mencionan historico"
ok "$(grep -rliE '\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)\b' backend/src/observatorio/api | wc -l)" 0 "módulos de la API con sentencias de escritura o DDL"
echo "## Servicios y puertos"
ok "$(docker compose config --services | sort | tr '\n' ' ')" "api consumer kafka postgres producer " "servicios de compose.yaml (FR-023)"
ok "$(docker compose ps --format '{{.Service}}={{.Ports}}' | grep -- '->' | tr -d '\n')" "api=127.0.0.1:8000->8000/tcp" "puerto publicado y dirección (solo la API, solo 127.0.0.1)"
ok "$(docker compose ps --format '{{.Health}}' | grep -c '^healthy$')" 5 "servicios healthy"
ok "$(docker ps -a --format '{{.Names}}' | grep -c 'api-f5')" 0 "contenedores temporales de F5 sin eliminar"
ok "$(docker volume ls --format '{{.Name}}' | grep observatorio | tr '\n' ' ')" "observatorio_kafkadata observatorio_pgdata " "volúmenes (sin borrar ni añadir)"
ok "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8000/api/eventos)" 405 "POST a /api/eventos rechazado"
ok "$(curl -s -D - -o /dev/null -H 'Origin: http://localhost:4200' http://127.0.0.1:8000/api/salud | tr -d '\r' | grep -ci '^access-control-allow-origin: http://localhost:4200$')" 1 "CORS limitado a los orígenes configurados (API_CORS_ORIGINS)"
echo "## Archivos que no deben cambiar"
ok "$(git status --short -- docs/referencias specs/001-* specs/002-* specs/003-* | wc -l)" 0 "cambios en docs/referencias, specs/001, specs/002 y specs/003"
ok "$(sha256sum frontend/public/datos/paises.geojson | cut -d' ' -f1)" d2aec98bfd1ffda2d8adea42b7ec473365eef38defc48e83afb7d58ae60bfe7c "huella del catálogo de países entregado"
ok "$(git status --short -- frontend/public frontend/package.json frontend/package-lock.json frontend/angular.json frontend/tsconfig.json frontend/tsconfig.app.json | wc -l)" 0 "config.json, catálogo, package*.json, angular.json y tsconfig sin cambios"
ok "$(git ls-files | grep -cE '(^|/)\.env$')" 0 ".env real versionado"
ok "$(git status --short | awk '{print $2}' | grep -cE '(^|/)\.env$')" 0 ".env real entre los cambios pendientes"
ok "$(git check-ignore data/historico | wc -l)" 1 "data/historico ignorado por Git"
ok "$(git ls-files | grep -c '^data/')" 0 "archivos de data/ versionados"
echo; if [ "$FALLOS" = 0 ]; then echo "RESULTADO: OK - aislamiento verificado"; else echo "RESULTADO: $FALLOS FALLOS"; fi
