-- SC-010 de F3 (conservación de eventos que ya salieron de la ventana móvil de 24 h). F8 · T016 / specs/005 T075.
-- SOLO LECTURA (únicamente SELECT). PREPARADO, NO EJECUTADO: su ejecución sobre la base real requiere la autorización PA-10 (no concedida).
-- Sintaxis NO comprobada en una base temporal (requeriría crear un contenedor/volumen: PA-11 tampoco concedida); solo revisión estática contra sql/001 y sql/002.
-- Uso previsto (con PA-10): docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /dev/stdin < scripts/f8/sc010_f3.sql
--   y guardar la salida en docs/evidencias/f3/sc-010-observacion-24h.txt anotando interrupciones (reinicio del 2026-11-08; parada del PC de ~19,6 h y hueco #475).
-- Activación de la ingesta real: 2026-11-06 16:54 UTC (docs/evidencias/f3/3.5-activacion.txt).

\echo '## 0. Instante de la observación y cobertura'
SELECT now() AT TIME ZONE 'utc'                       AS observacion_utc,
       timestamptz '2026-11-06 16:54:00+00'          AS activacion_utc,
       now() - timestamptz '2026-11-06 16:54:00+00'  AS desde_activacion;

\echo '## 1. Eventos del feed en vivo con event_time anterior a 24 h desde AHORA (esperado: > 0 si se conservan; 0 = no se pueden demostrar o se borraron)'
-- Se excluyen las filas recuperadas de huecos (source = usgs-fdsn-recuperacion), que traen eventos antiguos por otra vía y falsearían la prueba.
SELECT count(*) AS eventos_actual_anteriores_a_24h
FROM live.evento_actual
WHERE source = 'usgs-all-day' AND event_time < now() - interval '24 hours';

SELECT count(*) AS versiones_anteriores_a_24h
FROM live.evento_version
WHERE source = 'usgs-all-day' AND event_time < now() - interval '24 hours';

\echo '## 2. Evento más antiguo conservado del feed en vivo (debe ser anterior a ahora - 24 h) y ya conservados desde la activación'
SELECT min(event_time) AT TIME ZONE 'utc' AS evento_mas_antiguo_utc,
       max(event_time) AT TIME ZONE 'utc' AS evento_mas_reciente_utc,
       count(*)                           AS total_eventos_feed
FROM live.evento_actual WHERE source = 'usgs-all-day';

\echo '## 3. Eventos conservados que ya habían salido de la ventana en el momento de guardarse el siguiente ciclo (stored_at - event_time > 24 h)'
SELECT count(*) AS guardados_con_antiguedad_mayor_24h
FROM live.evento_actual
WHERE source = 'usgs-all-day' AND stored_at - event_time > interval '24 hours';

\echo '## 4. Reconciliación (esperado: 0 filas): versiones publicadas sin versión guardada ni cuarentena'
SELECT p.event_id, p.updated_ms FROM live.version_publicada p
WHERE NOT EXISTS (SELECT 1 FROM live.evento_version v WHERE v.event_id = p.event_id AND v.updated_at = to_timestamp(p.updated_ms / 1000.0))
  AND NOT EXISTS (SELECT 1 FROM live.cuarentena c WHERE c.event_id = p.event_id AND c.updated_ms = p.updated_ms);

\echo '## 5. Interrupciones a anotar: huecos de ingesta registrados'
SELECT id, inicio AT TIME ZONE 'utc' AS inicio_utc, fin AT TIME ZONE 'utc' AS fin_utc, estado, eventos_publicados FROM live.hueco ORDER BY inicio;

\echo '## 6. Cobertura de consultas (para razonar interrupciones): primera y última consulta registrada y su número (ok y error)'
SELECT min(iniciada_at) AT TIME ZONE 'utc' AS primera, max(iniciada_at) AT TIME ZONE 'utc' AS ultima, count(*) AS consultas
FROM live.consulta_extraccion;
