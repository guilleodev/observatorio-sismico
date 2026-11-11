-- Calidad de los datos EN VIVO (feed de USGS): las seis comprobaciones de la memoria §4 (F8 · R5). SOLO LECTURA: únicamente SELECT sobre `live`.
-- Archiva el SQL LITERAL que faltaba (la salida de 2026-11-06 está en docs/evidencias/f3/3.5-calidad-datos-reales.txt, sin las consultas). Cada ejecución es una MUESTRA NUEVA
-- con su fecha: sus cifras NO sustituyen a las de 2026-11-06 de la memoria §4.4. Denominador: filas de live.evento_actual no retiradas.
-- Uso:  docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < scripts/f8/calidad_live.sql
\echo '## 0. Instante de la muestra y entrada'
SELECT now() AT TIME ZONE 'utc' AS muestra_utc,
       (SELECT count(*) FROM live.version_publicada) AS publicadas,
       (SELECT count(*) FROM live.evento_version)    AS versiones_validas,
       (SELECT count(*) FROM live.evento_actual)     AS estado_actual,
       (SELECT count(*) FROM live.cuarentena)        AS cuarentena;

\echo '## Cuarentena por categoría y motivo'
SELECT categoria, motivo, count(*) AS n FROM live.cuarentena GROUP BY 1,2 ORDER BY 3 DESC;

\echo '## 1. Completitud (% con valor, sobre evento_actual no retirado)'
SELECT count(*) AS eventos,
       round(100.0*count(mag)/count(*),1)      AS pct_mag,
       round(100.0*count(mag_type)/count(*),1) AS pct_magtype,
       round(100.0*count(depth_km)/count(*),1) AS pct_profundidad,
       round(100.0*count(place)/count(*),1)    AS pct_place
FROM live.evento_actual WHERE NOT retirado;

\echo '## 2. Unicidad'
SELECT (SELECT count(*) FROM live.evento_actual WHERE NOT retirado)                  AS filas_actual,
       (SELECT count(DISTINCT event_id) FROM live.evento_actual WHERE NOT retirado)  AS ids_distintos,
       (SELECT count(*) - count(DISTINCT (event_id, updated_at)) FROM live.evento_version) AS versiones_duplicadas,
       (SELECT count(*) FROM (SELECT event_id FROM live.evento_version GROUP BY event_id HAVING count(*) > 1) r) AS eventos_con_revisiones;

\echo '## 3. Validez (coordenadas en rango, geometría Point, tres valores y tipo earthquake en el original)'
SELECT count(*) FILTER (WHERE longitude BETWEEN -180 AND 180 AND latitude BETWEEN -90 AND 90) AS coordenadas_en_rango,
       count(*) FILTER (WHERE raw->'geometry'->>'type' = 'Point')                             AS geometria_point,
       count(*) FILTER (WHERE jsonb_array_length(raw->'geometry'->'coordinates') = 3)         AS tres_valores,
       count(*) FILTER (WHERE raw->'properties'->>'type' = 'earthquake')                      AS tipo_terremoto,
       count(*)                                                                               AS total
FROM live.evento_actual WHERE NOT retirado;

\echo '## 4. Consistencia (updated >= time; rangos físicos)'
SELECT count(*) FILTER (WHERE updated_at >= event_time)            AS updated_posterior_o_igual_a_time,
       count(*) FILTER (WHERE updated_at <  event_time)            AS incoherentes,
       min(depth_km) AS prof_min_km, max(depth_km) AS prof_max_km, min(mag) AS mag_min, max(mag) AS mag_max
FROM live.evento_actual WHERE NOT retirado;

\echo '## 5. Actualidad (minutos entre la ocurrencia y la ingesta, y entre la actualización de USGS y la ingesta)'
SELECT round(avg(extract(epoch FROM ingested_at - event_time)/60)::numeric,1) AS min_medios_ocurrencia_a_ingesta,
       round(max(extract(epoch FROM ingested_at - event_time)/60)::numeric,1) AS max_ocurrencia_a_ingesta,
       round(avg(extract(epoch FROM ingested_at - updated_at)/60)::numeric,1) AS min_medios_actualizacion_a_ingesta
FROM live.evento_actual WHERE NOT retirado;

\echo '5b. Actualidad por origen (usgs-fdsn-recuperacion = eventos recuperados de un hueco de ingesta: su ingesta es posterior a las 24 h por construcción)'
SELECT source, count(*) AS n, round(max(extract(epoch FROM ingested_at - event_time)/60)::numeric,1) AS max_min_ocurrencia_a_ingesta
FROM live.evento_actual WHERE NOT retirado GROUP BY 1 ORDER BY 2 DESC;

\echo '## 6. Exactitud y límites (valores que no se rechazan ni se rellenan)'
SELECT count(*) FILTER (WHERE mag = 0)        AS mag_cero_conservadas,
       count(*) FILTER (WHERE mag < 0)        AS mag_negativas,
       count(*) FILTER (WHERE depth_km < 0)   AS profundidad_negativa,
       count(*) FILTER (WHERE mag IS NULL)    AS mag_nulas
FROM live.evento_actual WHERE NOT retirado;

\echo 'magType (no se mezclan escalas sin avisar):'
SELECT mag_type, count(*) AS n FROM live.evento_actual WHERE NOT retirado GROUP BY 1 ORDER BY 2 DESC;

\echo '## 7. Integración geográfica (resultado y catálogo)'
SELECT geo_resultado, count(*) AS n FROM live.evento_actual WHERE NOT retirado GROUP BY 1 ORDER BY 2 DESC;
