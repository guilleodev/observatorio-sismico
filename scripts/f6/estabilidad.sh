#!/usr/bin/env bash
# Ejecución de estabilidad de 60 minutos COMO MÁXIMO (F6, 6.8, T061; FR-017, SC-008): la ingesta real sigue funcionando y, a mitad, se lanza UNA reproducción (replay) con el
# consumidor efímero de replay. No para ni recrea ningún servicio. Cada 5 minutos registra memoria (docker stats), reinicios, errores en los registros, lag, reconciliación y la edad de la ingesta.
# Escribe solo en el esquema `replay` y en el topic `terremotos.replay` (ejecución r-f6-estab-<fecha>), como en 6.1.
# Uso:  CONFIRMO_ESTABILIDAD=si bash scripts/f6/estabilidad.sh [minutos=60]   (máximo 60; se ejecuta en segundo plano y deja el resultado en la salida estándar)
cd "$(dirname "$0")/../.."
export MSYS_NO_PATHCONV=1
[ "${CONFIRMO_ESTABILIDAD:-}" = "si" ] || { echo "Falta CONFIRMO_ESTABILIDAD=si: no se hace nada."; exit 2; }
MIN="${1:-60}"; [[ "$MIN" =~ ^[0-9]+$ ]] && [ "$MIN" -ge 5 ] && [ "$MIN" -le 60 ] || { echo "los minutos deben estar entre 5 y 60"; exit 2; }
set -a; . ./.env; set +a
RUN="r-f6-estab-$(date -u +%m%d%H%M)"
q() { docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1" 2>/dev/null | tr -d '\r'; }
inv() { bash scripts/f6/invariantes.sh "$1" 2>&1 | grep -E "^F3:|^historico huellas|^sintetico:|^replay:|^servicios:|^contenedores|^volúmenes|^live:" | cut -c1-250; }
muestra() {
  local etiqueta="$1" mem lag errs
  mem="$(docker stats --no-stream --format '{{.Name}}={{.MemUsage}}' | grep observatorio- | sed 's#observatorio-##; s#-1=#=#; s# / [0-9.]*GiB##' | tr '\n' ' ')"
  lag="$(bash scripts/f6/invariantes.sh m 2>&1 | grep '^F3:' | grep -oE 'reconciliacion=[0-9]+|offsets duplicados=[0-9]+|offset/final/lag=[0-9/]+' | tr '\n' ' ')"
  errs="$(for s in api consumer producer postgres kafka; do printf '%s=%s ' "$s" "$(docker compose logs --since "$T0" "$s" 2>&1 | grep -ciE 'traceback|exception|critical|\bFATAL\b|\bERROR\b')"; done)"
  echo "[$etiqueta · $(date -u +%T)] mem(MiB): $mem"
  echo "     $lag · reinicios Docker: $(docker compose ps -q | xargs docker inspect -f '{{.RestartCount}}' | awk '{s+=$1} END{print s+0}') · ingesta hace $(q "select round(extract(epoch from now()-ultima_consulta_ok_at)) from live.estado_ingesta")s · API sin clave HTTP $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8000/api/salud) · líneas de error desde el inicio: $errs"
}
echo "# Estabilidad de $MIN min · $(date -u +%FT%TZ) · reproducción prevista: $RUN a los $((MIN/4)) min"
T0="$(date -u +%FT%TZ)"
echo "## INICIO"; INI="$(inv inicio-estabilidad)"; echo "$INI"
echo "contenedores al inicio (id, arranque): $(docker compose ps -q | xargs docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}={{.Id}}@{{.State.StartedAt}}' | cut -c1-60 | sort | tr '\n' ' ')"
V0="$(q "select count(*) from live.evento_version")"
fin=$(( $(date +%s) + MIN*60 )); replay_hecho=0; k=0
muestra "t=0"
while [ "$(date +%s)" -lt "$fin" ]; do
  sleep 300; k=$((k+1))
  if [ $replay_hecho = 0 ] && [ $((k*5)) -ge $((MIN/4)) ]; then
    replay_hecho=1; echo "-- lanzando la reproducción $RUN ($(date -u +%T)): consumidor efímero de replay + productor bajo demanda (intervalo 2 s ≈ 76 s)"
    docker compose run --rm --no-deps consumer python -m observatorio.consumer.main --destino replay > "/tmp/estab-consumidor-$RUN.log" 2>&1 &
    sleep 8
    docker compose run --rm --no-deps producer python -m observatorio.replay.reproducir --run "$RUN" 2>&1 | grep -E '"(run_id|mensajes|publicados|estado|velocidad)"' | tr -d '\n'; echo
    wait
    echo "-- reproducción terminada ($(date -u +%T)): recuentos de $RUN (actuales / versiones / cuarentena) = $(q "select (select count(*) from replay.evento_actual where run_id='$RUN')||' / '||(select count(*) from replay.evento_version where run_id='$RUN')||' / '||(select count(*) from replay.cuarentena where run_id='$RUN')")"
  fi
  muestra "t=$((k*5)) min"
done
echo "## FINAL"; FIN="$(inv final-estabilidad)"; echo "$FIN"
V1="$(q "select count(*) from live.evento_version")"
echo "versiones de live: $V0 → $V1 (crece por la ingesta real) · contenedores al final (id, arranque): $(docker compose ps -q | xargs docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}={{.Id}}@{{.State.StartedAt}}' | cut -c1-60 | sort | tr '\n' ' ')"
echo "contenedores temporales sin eliminar: $(docker ps -a --format '{{.Names}}' | grep -cE 'consumer-run|producer-run')"
echo "## Resumen"; echo "reproducción $RUN: $(q "select estado||' · '||mensajes||' mensajes' from replay.ejecucion where run_id='$RUN'")"
echo "historico/sintetico iguales: $([ "$(echo "$INI" | grep -E '^historico huellas|^sintetico:' | md5sum)" = "$(echo "$FIN" | grep -E '^historico huellas|^sintetico:' | md5sum)" ] && echo sí || echo NO)"
echo "FIN $(date -u +%FT%TZ)"
