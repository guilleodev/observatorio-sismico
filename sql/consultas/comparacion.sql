-- Consultas de referencia: comparacion entre ventanas equivalentes (F4, paso 4.6, T055). Contrato: specs/003-geografia-historico/contracts/consultas-comparacion.md
-- NO son endpoints ni un modulo de produccion: F5 las convertira en API. La prueba test_comparacion.py y scripts/f4/comparacion.py leen este archivo.
-- Cada bloque empieza por «-- name: <nombre>». Parametros con nombre (psycopg): %(ambito)s ('global' | 'pais' | 'sin_pais'), %(pais)s (solo con 'pais'),
-- %(min_mag)s (la magnitud minima ya elevada a >= 4 por el llamador), %(h_desde)s/%(h_hasta)s (periodo historico [desde, hasta) UTC),
-- %(desde)s/%(hasta)s (ventana reciente [desde, hasta) UTC). Cada sesion ejecuta antes SET TIME ZONE 'UTC'. Siempre tipo earthquake y tiempo del EVENTO.
-- Tipo en el reciente: live.evento_actual SOLO contiene terremotos (el consumidor manda lo no sismico a cuarentena y marca como retirado el reclasificado, que
-- estas consultas excluyen con NOT retirado; comprobado: 0 filas no earthquake y no retiradas), asi que el filtro de tipo es equivalente en ambos periodos.
-- Los dias son dias UTC de 24 h exactas desde %(h_desde)s (sin ajuste por zona horaria).
-- «sin pais» = geo_resultado = 'sin_pais' (no basta country_id IS NULL: incluiria eventos aun sin asignar).
-- Solo leen historico.evento (periodo historico) y live.evento_actual / live.hueco / live.estado_ingesta (reciente). Nunca otros esquemas.

-- name: precondicion_sin_asignar
SELECT count(*) AS sin_asignar FROM live.evento_actual WHERE geo_resultado IS NULL AND NOT retirado;

-- name: historico_total
SELECT count(*) AS total
FROM historico.evento
WHERE event_time >= %(h_desde)s::timestamptz AND event_time < %(h_hasta)s::timestamptz
  AND raw -> 'properties' ->> 'type' = 'earthquake'
  AND mag >= %(min_mag)s::numeric
  AND (%(ambito)s::text = 'global' OR (%(ambito)s::text = 'pais' AND country_id = %(pais)s::text) OR (%(ambito)s::text = 'sin_pais' AND geo_resultado = 'sin_pais'));

-- name: historico_serie_diaria
-- Serie diaria completa: los dias sin eventos aportan 0 (van al denominador de la media). Se agrupa primero (una pasada) y despues se rellena la serie.
SELECT (%(h_desde)s::timestamptz + n * interval '1 day')::date AS dia, coalesce(c.eventos, 0) AS eventos
FROM generate_series(0, (extract(epoch FROM %(h_hasta)s::timestamptz - %(h_desde)s::timestamptz) / 86400)::int - 1) n
LEFT JOIN (
  SELECT floor(extract(epoch FROM event_time - %(h_desde)s::timestamptz) / 86400)::int AS n, count(*) AS eventos
  FROM historico.evento
  WHERE event_time >= %(h_desde)s::timestamptz AND event_time < %(h_hasta)s::timestamptz
    AND raw -> 'properties' ->> 'type' = 'earthquake'
    AND mag >= %(min_mag)s::numeric
    AND (%(ambito)s::text = 'global' OR (%(ambito)s::text = 'pais' AND country_id = %(pais)s::text) OR (%(ambito)s::text = 'sin_pais' AND geo_resultado = 'sin_pais'))
  GROUP BY 1
) c USING (n)
ORDER BY n;

-- name: historico_mediana_diaria
-- Complemento: la media esta inflada por secuencias de replicas
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY eventos) AS mediana
FROM (
  SELECT coalesce(c.eventos, 0) AS eventos
  FROM generate_series(0, (extract(epoch FROM %(h_hasta)s::timestamptz - %(h_desde)s::timestamptz) / 86400)::int - 1) n
  LEFT JOIN (
    SELECT floor(extract(epoch FROM event_time - %(h_desde)s::timestamptz) / 86400)::int AS n, count(*) AS eventos
    FROM historico.evento
    WHERE event_time >= %(h_desde)s::timestamptz AND event_time < %(h_hasta)s::timestamptz
      AND raw -> 'properties' ->> 'type' = 'earthquake'
      AND mag >= %(min_mag)s::numeric
      AND (%(ambito)s::text = 'global' OR (%(ambito)s::text = 'pais' AND country_id = %(pais)s::text) OR (%(ambito)s::text = 'sin_pais' AND geo_resultado = 'sin_pais'))
    GROUP BY 1
  ) c USING (n)
) s;

-- name: reciente_total
-- Estado actual, sin eventos retirados (reclasificados a no sismico)
SELECT count(*) AS total
FROM live.evento_actual
WHERE NOT retirado
  AND event_time >= %(desde)s::timestamptz AND event_time < %(hasta)s::timestamptz
  AND mag >= %(min_mag)s::numeric
  AND (%(ambito)s::text = 'global' OR (%(ambito)s::text = 'pais' AND country_id = %(pais)s::text) OR (%(ambito)s::text = 'sin_pais' AND geo_resultado = 'sin_pais'));

-- name: reciente_mag_nula
-- Magnitud nula: no cumple ningun umbral y se cuenta aparte (mismo ambito)
SELECT count(*) AS total
FROM live.evento_actual
WHERE NOT retirado AND mag IS NULL
  AND event_time >= %(desde)s::timestamptz AND event_time < %(hasta)s::timestamptz
  AND (%(ambito)s::text = 'global' OR (%(ambito)s::text = 'pais' AND country_id = %(pais)s::text) OR (%(ambito)s::text = 'sin_pais' AND geo_resultado = 'sin_pais'));

-- name: hueco_pendiente
-- Un hueco pendiente que intersecta la ventana reciente la marca como incompleta
SELECT EXISTS (SELECT 1 FROM live.hueco WHERE estado = 'pendiente' AND inicio < %(hasta)s::timestamptz AND fin > %(desde)s::timestamptz) AS intersecta;

-- name: cobertura_live
-- Desde cuando hay datos en vivo (primera ingesta menos las 24 h que cubre el feed) y hasta cuando se leyo el feed por ultima vez
SELECT (SELECT min(ingested_at) - interval '24 hours' FROM live.evento_actual) AS cobertura_desde,
       (SELECT ultima_consulta_ok_at FROM live.estado_ingesta WHERE id = 1) AS ultima_consulta_ok;
