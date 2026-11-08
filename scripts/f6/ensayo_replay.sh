#!/usr/bin/env bash
# Ensayos del replay contra Kafka y PostgreSQL REALES (F6, T017; autorización PA-4). Solo escribe en el esquema `replay` y en el topic `terremotos.replay`.
#   bash scripts/f6/ensayo_replay.sh repetir   <RUN_ID>   # vuelve a publicar la MISMA ejecución: los recuentos no deben cambiar
#   bash scripts/f6/ensayo_replay.sh interrumpir <RUN_ID> # mata el consumidor EFÍMERO de replay a mitad de la reproducción y lo reanuda: sin duplicados ni pérdidas
# Solo se mata el contenedor efímero `observatorio-consumer-run-*` (consumidor de replay); NUNCA el servicio `consumer` en vivo (`observatorio-consumer-1`).
# Los servicios reales no se paran ni se recrean. Uso de PA-4 documentado en specs/005-replay-despliegue-final/plan.md.
set -uo pipefail
cd "$(dirname "$0")/../.."
export MSYS_NO_PATHCONV=1
modo="${1:?repetir|interrumpir}"; run="${2:?indica el RUN_ID}"
[[ "$run" =~ ^r-f6-[A-Za-z0-9._-]{1,50}$ ]] || { echo "el RUN_ID debe empezar por r-f6- (ejecuciones de prueba de F6)"; exit 2; }
consumidor() { docker compose run --rm --no-deps consumer python -m observatorio.consumer.main --destino replay; }
productor() { docker compose run --rm --no-deps producer python -m observatorio.replay.reproducir "$@"; }
recuentos() { set -a; . ./.env; set +a; docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
  "SELECT (SELECT count(*) FROM replay.evento_actual WHERE run_id='$run')||' / '||(SELECT count(*) FROM replay.evento_version WHERE run_id='$run')||' / '||(SELECT count(*) FROM replay.cuarentena WHERE run_id='$run')||' (actuales / versiones / cuarentena); offsets distintos en versiones='||(SELECT count(DISTINCT kafka_offset) FROM replay.evento_version WHERE run_id='$run')||' de '||(SELECT count(*) FROM replay.evento_version WHERE run_id='$run')" | tr -d '\r'; }

echo "== $modo $run $(date -u +%FT%TZ)"
echo "recuentos antes: $(recuentos)"
case "$modo" in
  repetir)
    consumidor > "/tmp/consumidor-$run.log" 2>&1 &
    sleep 8
    productor --reanudar "$run" --intervalo 0.2 2>&1 | grep -E '"(run_id|mensajes|publicados|estado)"'
    wait
    ;;
  interrumpir)
    consumidor > "/tmp/consumidor-$run-1.log" 2>&1 &
    sleep 8
    productor --run "$run" --intervalo 0.5 2>&1 | grep -E '"(run_id|mensajes|publicados|estado)"' &
    sleep 9
    echo "-- matando el consumidor efímero de replay a mitad de la reproducción"
    docker ps --filter "name=observatorio-consumer-run-" -q | xargs -r docker kill
    sleep 1
    echo "recuentos tras matar el consumidor (parcial): $(recuentos)"
    wait
    docker compose run --rm --no-deps consumer python -m observatorio.consumer.main --destino replay > "/tmp/consumidor-$run-2.log" 2>&1
    ;;
  *) echo "modo desconocido"; exit 2 ;;
esac
echo "recuentos después: $(recuentos)"
echo "lag del grupo consumidor-replay: $(docker compose exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group consumidor-replay 2>/dev/null | tr -d '\r' | awk '$1=="consumidor-replay"{print "offset/final/lag="$4"/"$5"/"$6}')"
