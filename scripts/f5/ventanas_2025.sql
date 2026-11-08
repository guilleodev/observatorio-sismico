-- Complemento de la conclusión 2 (SOLO LECTURA, no es API): distribución del número de terremotos de M >= 4,5 en ventanas de 49 h (≈ 2,04 días, como el periodo reciente)
-- que empiezan cada hora a lo largo de 2025, para saber si 22 terremotos en una ventana así es raro o no en el histórico.
WITH ventanas AS (
  SELECT g AS inicio, (SELECT count(*) FROM historico.evento e
                        WHERE e.event_time >= g AND e.event_time < g + interval '49 hours' AND e.mag >= 4.5 AND e.raw -> 'properties' ->> 'type' = 'earthquake') AS n
  FROM generate_series(timestamptz '2025-01-01 00:00+00', timestamptz '2025-12-30 00:00+00' - interval '49 hours', interval '1 hour') g)
SELECT count(*) AS ventanas, min(n) AS min, percentile_cont(0.05) WITHIN GROUP (ORDER BY n) AS p5, percentile_cont(0.25) WITHIN GROUP (ORDER BY n) AS p25,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY n) AS mediana, percentile_cont(0.75) WITHIN GROUP (ORDER BY n) AS p75, percentile_cont(0.95) WITHIN GROUP (ORDER BY n) AS p95, max(n) AS max,
       round(100.0 * count(*) FILTER (WHERE n <= 22) / count(*), 1) AS pct_ventanas_con_22_o_menos,
       round(100.0 * count(*) FILTER (WHERE n <= 10) / count(*), 1) AS pct_ventanas_con_10_o_menos
FROM ventanas;
