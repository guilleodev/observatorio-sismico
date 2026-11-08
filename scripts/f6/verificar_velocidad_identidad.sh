#!/usr/bin/env bash
# T028 (F6, 6.2) - velocidad, identidad y separación de las ejecuciones de replay existentes. SOLO LECTURA: únicamente SELECT (psql dentro del contenedor de PostgreSQL).
# Uso: bash scripts/f6/verificar_velocidad_identidad.sh
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a
export MSYS_NO_PATHCONV=1
q() { docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off -c "$1" | tr -d '\r'; }
echo "# T028 - velocidad, identidad y separación $(date -u +%FT%TZ)"
echo; echo "## 1. cadencia: duración observada (ingested_at de las versiones guardadas) frente a la configurada, y velocidad observada frente a la registrada"
q "WITH t AS (SELECT run_id, min(ingested_at) AS i0, max(ingested_at) AS i1, count(*) AS n FROM replay.evento_version GROUP BY run_id)
   SELECT e.run_id, e.mensajes, e.intervalo_s AS intervalo_configurado_s, t.n AS versiones_guardadas,
          round(((e.mensajes - 1) * e.intervalo_s)::numeric, 1) AS duracion_prevista_s,
          round(extract(epoch FROM t.i1 - t.i0)::numeric, 1) AS duracion_observada_s,
          round((extract(epoch FROM t.i1 - t.i0) / ((e.mensajes - 1) * e.intervalo_s))::numeric, 3) AS observada_sobre_prevista,
          e.velocidad AS velocidad_registrada,
          round((extract(epoch FROM e.intervalo_hasta - e.intervalo_desde) / extract(epoch FROM t.i1 - t.i0))::numeric, 3) AS velocidad_observada
   FROM replay.ejecucion e JOIN t USING (run_id) ORDER BY e.iniciada_at"
echo; echo "## 1b. separación entre mensajes consecutivos (s) por ejecución: debe ser un múltiplo del intervalo (los saltos mayores son mensajes a cuarentena o duplicados)"
q "SELECT run_id, round(min(d)::numeric, 2) AS min_s, round(percentile_cont(0.5) WITHIN GROUP (ORDER BY d)::numeric, 2) AS mediana_s, round(max(d)::numeric, 2) AS max_s
   FROM (SELECT run_id, extract(epoch FROM ingested_at - lag(ingested_at) OVER (PARTITION BY run_id ORDER BY ingested_at)) AS d FROM replay.evento_version) s WHERE d IS NOT NULL GROUP BY run_id ORDER BY run_id"
echo; echo "## 2. identidad: time y updated de los eventos REALES de replay frente a historico.evento (100 % esperado)"
q "SELECT r.run_id, count(*) AS reales, count(h.event_id) AS en_historico,
          count(*) FILTER (WHERE r.event_time = h.event_time) AS time_identico, count(*) FILTER (WHERE r.updated_at = h.updated_at) AS updated_identico,
          count(*) FILTER (WHERE r.event_time = h.event_time AND r.updated_at = h.updated_at AND r.mag IS NOT DISTINCT FROM h.mag AND r.longitude = h.longitude AND r.latitude = h.latitude) AS todo_identico
   FROM replay.evento_actual r LEFT JOIN historico.evento h USING (event_id) WHERE r.caso IS NULL GROUP BY r.run_id ORDER BY r.run_id"
echo; echo "## 2b. casos controlados: ids propios (replay-ctl-…), ausentes de historico y de live; y su evento base (el id que indica «copiado de …» en el lugar) existe entre los reales con el mismo tiempo original"
q "SELECT r.run_id, r.caso, r.event_id, (r.event_id LIKE 'replay-ctl-%') AS id_propio, EXISTS (SELECT 1 FROM historico.evento h WHERE h.event_id = r.event_id) AS en_historico,
          EXISTS (SELECT 1 FROM live.evento_actual l WHERE l.event_id = r.event_id) AS en_live,
          EXISTS (SELECT 1 FROM replay.evento_actual b WHERE b.run_id = r.run_id AND b.caso IS NULL AND b.event_id = substring(r.place from 'copiado de (.*)[)]$') AND b.event_time = r.event_time) AS base_real_mismo_tiempo
   FROM replay.evento_actual r WHERE r.caso IS NOT NULL ORDER BY r.run_id, r.caso"
echo; echo "## 3. coherencia de event_id y run_id con el mensaje guardado (raw), con la fuente y el modo"
q "SELECT run_id, count(*) AS filas, count(*) FILTER (WHERE raw ->> 'id' = event_id) AS id_igual_a_raw, count(*) FILTER (WHERE source = 'replay-historico' AND mode = 'replay') AS fuente_y_modo_ok,
          count(*) FILTER (WHERE kafka_topic = 'terremotos.replay') AS topic_replay, count(DISTINCT event_id) AS ids_distintos
   FROM replay.evento_actual GROUP BY run_id ORDER BY run_id"
echo; echo "## 4. separación: ids de replay presentes en live (esperado 0), mensajes de replay en live (0) y datos live en replay (0)"
q "SELECT (SELECT count(*) FROM live.evento_actual l JOIN replay.evento_actual r USING (event_id)) AS ids_replay_en_live_actual,
          (SELECT count(*) FROM live.evento_version l JOIN replay.evento_version r USING (event_id)) AS ids_replay_en_live_version,
          (SELECT count(*) FROM live.evento_actual WHERE mode <> 'live' OR source = 'replay-historico' OR event_id LIKE 'replay-ctl-%') AS filas_replay_en_live,
          (SELECT count(*) FROM replay.evento_actual WHERE mode <> 'replay' OR source <> 'replay-historico') AS filas_live_en_replay"
