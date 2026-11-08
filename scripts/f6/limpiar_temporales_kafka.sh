#!/usr/bin/env bash
# Elimina SOLO los topics y los grupos TEMPORALES que crean las pruebas con Kafka real de F6 (nombres que empiezan por `test-f6-`).
# NUNCA toca `terremotos.live`, `terremotos.replay`, `__consumer_offsets`, `consumidor-live` ni `consumidor-replay`: cada nombre se compara con el prefijo antes de borrarlo.
# Es la única orden de borrado de scripts/f6 y figura como excepción aprobada en scripts/f6/excepciones_seguridad.txt (recursos temporales de pruebas, no datos).
# Uso: bash scripts/f6/limpiar_temporales_kafka.sh
cd "$(dirname "$0")/../.."
export MSYS_NO_PATHCONV=1
KAFKA="docker compose exec -T kafka /opt/kafka/bin"
echo "# limpieza de topics y grupos temporales de pruebas (prefijo test-f6-) $(date -u +%FT%TZ)"
for topic in $($KAFKA/kafka-topics.sh --bootstrap-server localhost:9092 --list 2>/dev/null | tr -d '\r'); do
  case "$topic" in
    test-f6-*) $KAFKA/kafka-topics.sh --bootstrap-server localhost:9092 --delete --topic "$topic" 2>&1 | tr -d '\r'; echo "topic eliminado: $topic" ;;
  esac
done
for grupo in $($KAFKA/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list 2>/dev/null | tr -d '\r'); do
  case "$grupo" in
    test-f6-*) $KAFKA/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --delete --group "$grupo" 2>&1 | tr -d '\r' | tail -1; echo "grupo eliminado: $grupo" ;;
  esac
done
echo "topics que quedan: $($KAFKA/kafka-topics.sh --bootstrap-server localhost:9092 --list 2>/dev/null | tr -d '\r' | sort | tr '\n' ' ')"
echo "grupos que quedan: $($KAFKA/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list 2>/dev/null | tr -d '\r' | sort | tr '\n' ' ')"
