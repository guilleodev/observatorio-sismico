#!/usr/bin/env bash
# Ensayo de parada y arranque de UN servicio real (F6, 6.8, T057-T059; FR-015, FR-016, SC-008, SC-009). Usa SOLO `docker compose stop` y `docker compose start`: el contenedor y los volúmenes
# son los mismos antes y después (nada se recrea, nada se borra; nunca down, -v, prune ni up). Comprueba los invariantes antes, durante (si es posible) y después.
# Uso:  CONFIRMO_ENSAYO=<servicio> bash scripts/f6/ensayo_parada.sh <consumer|producer|api|kafka|postgres> [segundos_parado=120]
# La guarda CONFIRMO_ENSAYO debe coincidir con el servicio: solo se ejecuta con la autorización expresa de la persona estudiante para ESE servicio.
# Vuelta atrás: `docker compose start <servicio>` (el script lo hace solo si algo falla). Sin tocar la clave de la API ni Netlify; ngrok no se abre.
cd "$(dirname "$0")/../.."
export MSYS_NO_PATHCONV=1
svc="${1:?servicio}"; espera="${2:-120}"
case "$svc" in consumer|producer|api|kafka|postgres) ;; *) echo "servicio no permitido: $svc"; exit 2;; esac
[ "${CONFIRMO_ENSAYO:-}" = "$svc" ] || { echo "Falta CONFIRMO_ENSAYO=$svc: no se para nada."; exit 2; }
[[ "$espera" =~ ^[0-9]+$ ]] && [ "$espera" -le 600 ] || { echo "segundos_parado debe ser un entero <= 600"; exit 2; }
set -a; . ./.env; set +a
FALLOS=0
ok() { if [ "$1" = "$2" ]; then echo "  OK    $3"; else echo "  FALLA $3 (obtenido '$1', esperado '$2')"; FALLOS=$((FALLOS+1)); fi; }
inv() { bash scripts/f6/invariantes.sh "$1" 2>&1 | grep -E "^F3:|^historico huellas|^sintetico:|^replay:|^servicios:|^contenedores|^volúmenes|^live:" | cut -c1-250; }
campo() { echo "$1" | grep -oE "$2" | head -1; }
idsvc() { docker compose ps -q "$svc" | cut -c1-12; }
healthy() { [ "$(docker compose ps --format '{{.Health}}' "$svc" 2>/dev/null | tr -d '\r')" = "healthy" ]; }
q() { docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1" 2>/dev/null | tr -d '\r'; }

echo "# Ensayo de parada/arranque de '$svc' · $(date -u +%FT%TZ) · parado ≈ ${espera} s"
ID0="$(idsvc)"; INICIO0="$(docker inspect -f '{{.State.StartedAt}}' "$(docker compose ps -q "$svc")")"
VOL0="$(docker volume ls --format '{{.Name}}' | grep -E '^observatorio_(pgdata|kafkadata)$' | xargs docker volume inspect -f '{{.Name}}={{.CreatedAt}}' | sort | tr '\n' ' ')"
echo "## ANTES"; ANTES="$(inv "antes-$svc")"; echo "$ANTES"
V0="$(q "select count(*) from live.evento_version")"; P0="$(q "select count(*) from live.version_publicada")"; E0="$(q "select count(*) from live.evento_actual")"
echo "versiones=$V0 publicadas=$P0 actuales=$E0 · contenedor $svc=$ID0 (arrancado $INICIO0)"
# condiciones previas (si fallan, NO se para nada): cinco servicios healthy, lag 0, reconciliación 0, 0 duplicados, API protegida
LA="$(echo "$ANTES" | grep '^F3:')"
PREVIO="$(docker compose ps --format '{{.Service}}={{.Health}}' | sort | tr '\n' ' ')|$(campo "$LA" 'reconciliacion=[0-9]+')|$(campo "$LA" 'offsets duplicados=[0-9]+')|$(campo "$LA" 'offset/final/lag=[0-9]+/[0-9]+/[0-9]+' | awk -F/ '{print $NF}')"
[ "$PREVIO" = "api=healthy consumer=healthy kafka=healthy postgres=healthy producer=healthy |reconciliacion=0|offsets duplicados=0|0" ] || { echo "CONDICIONES PREVIAS NO CUMPLIDAS ($PREVIO): no se para nada."; exit 3; }
echo "  OK    condiciones previas: cinco servicios healthy, lag 0, reconciliación 0, 0 offsets duplicados"
echo "## PARADA ($(date -u +%T))"
docker compose stop "$svc" 2>&1 | tail -1
echo "estado: $(docker compose ps -a --format '{{.Service}}={{.State}}' "$svc" | tr -d '\r')"
fin=$(( $(date +%s) + espera )); n=0
while [ "$(date +%s)" -lt "$fin" ]; do
  sleep 20; n=$((n+1))
  case "$svc" in kafka|postgres) echo "  [$(date -u +%T)] $svc parado; resto: $(docker compose ps --format '{{.Service}}={{.Health}}' | grep -v "^$svc" | sort | tr '\n' ' ')";;
    *) echo "  [$(date -u +%T)] $(inv "durante-$svc" | grep '^F3:' | grep -oE 'publicadas=[0-9]+ versiones=[0-9]+|offset/final/lag=[0-9/]+' | tr '\n' ' ') · API sin clave: HTTP $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8000/api/salud)";;
  esac
done
case "$svc" in kafka|postgres) ;; *) echo "## DURANTE (última muestra)"; inv "durante-$svc" | grep '^F3:' ;; esac
echo "## ARRANQUE ($(date -u +%T))"
docker compose start "$svc" 2>&1 | tail -1
for i in $(seq 1 60); do healthy && break; sleep 5; done
if ! healthy; then echo "  FALLA $svc no recupera healthy en 5 min → segundo 'start' (vuelta atrás)"; docker compose start "$svc" >/dev/null 2>&1; for i in $(seq 1 30); do healthy && break; sleep 5; done; FALLOS=$((FALLOS+1)); fi
echo "  $svc healthy tras $((i*5)) s aprox. · $(docker compose ps --format '{{.Service}}={{.Health}}' | sort | tr '\n' ' ')"
echo "## DRENADO del lag"
for i in $(seq 1 60); do
  L="$(bash scripts/f6/invariantes.sh drenado 2>&1 | grep '^F3:')"
  [ "$(campo "$L" 'offset/final/lag=[0-9]+/[0-9]+/[0-9]+' | awk -F/ '{print $NF}')" = "0" ] && [ "$(campo "$L" 'reconciliacion=[0-9]+')" = "reconciliacion=0" ] && break
  sleep 10
done
echo "  lag 0 y reconciliación 0 tras ≈ $((i*10)) s: $(campo "$L" 'offset/final/lag=[0-9]+/[0-9]+/[0-9]+')"
sleep 70   # un ciclo completo del productor (60 s): el sistema vuelve al régimen normal
echo "## DESPUÉS"; DESPUES="$(inv "despues-$svc")"; echo "$DESPUES"
V1="$(q "select count(*) from live.evento_version")"; P1="$(q "select count(*) from live.version_publicada")"; E1="$(q "select count(*) from live.evento_actual")"
echo "versiones=$V1 publicadas=$P1 actuales=$E1 (antes $V0 / $P0 / $E0)"
echo "## COMPROBACIONES"
LD="$(echo "$DESPUES" | grep '^F3:')"
ok "$(campo "$LD" 'reconciliacion=[0-9]+')" "reconciliacion=0" "reconciliación 0"
ok "$(campo "$LD" 'offsets duplicados=[0-9]+')" "offsets duplicados=0" "0 offsets duplicados"
ok "$(campo "$LD" 'actual desfasado=[0-9]+')" "actual desfasado=0" "0 filas actuales desfasadas"
ok "$(campo "$LD" 'offset/final/lag=[0-9]+/[0-9]+/[0-9]+' | awk -F/ '{print $NF}')" 0 "lag 0"
ok "$(idsvc)" "$ID0" "el contenedor de $svc es el mismo (no se recreó)"
ok "$(docker volume ls --format '{{.Name}}' | grep -E '^observatorio_(pgdata|kafkadata)$' | xargs docker volume inspect -f '{{.Name}}={{.CreatedAt}}' | sort | tr '\n' ' ')" "$VOL0" "volúmenes de Kafka y PostgreSQL: mismos (nombre y fecha de creación)"
ok "$(echo "$DESPUES" | grep -E '^historico huellas|^sintetico:' | md5sum)" "$(echo "$ANTES" | grep -E '^historico huellas|^sintetico:' | md5sum)" "huellas de historico y sintetico idénticas"
ok "$(echo "$DESPUES" | grep '^replay:')" "$(echo "$ANTES" | grep '^replay:')" "esquema replay sin cambios"
ok "$([ "$V1" -ge "$V0" ] && [ "$P1" -ge "$P0" ] && [ "$E1" -ge "$E0" ] && echo si || echo no)" si "live no pierde versiones, publicaciones ni eventos (solo puede crecer)"
ok "$([ "$(( P1 - V1 ))" -le "$(( P0 - V0 + 2 ))" ] && echo si || echo no)" si "no quedan mensajes publicados sin guardar (publicadas − versiones no crece)"
ok "$(docker compose ps --format '{{.Service}}={{.Health}}' | sort | tr '\n' ' ')" "api=healthy consumer=healthy kafka=healthy postgres=healthy producer=healthy " "los cinco servicios healthy"
ok "$(docker compose ps -q | xargs docker inspect -f '{{.RestartCount}}' | sort -u | tr '\n' ' ')" "0 " "ningún contenedor se reinició solo (RestartCount 0)"
ok "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/salud)" 401 "la API sigue protegida (sin clave: 401)"
echo; [ "$FALLOS" = 0 ] && echo "RESULTADO: OK" || echo "RESULTADO: $FALLOS FALLOS"
exit $FALLOS
