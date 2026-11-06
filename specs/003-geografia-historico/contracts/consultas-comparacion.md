# Consultas de referencia: comparación entre ventanas equivalentes (F4 → F5)

No son endpoints. Se validan en 4.6 contra un recuento independiente y F5 las convierte en API. Parámetros: ámbito explícito `:ambito` (`global` | `pais` | `sin_pais`) y `:pais` (solo con `pais`), `:min_mag` (≥ 4), ventana reciente `[:desde, :hasta)` UTC. Siempre tipo `earthquake` y tiempo del **evento**. Cada sesión ejecuta antes `SET TIME ZONE 'UTC'`, y la precondición es `SELECT count(*) FROM live.evento_actual WHERE geo_resultado IS NULL` = 0.

```sql
-- Media diaria de 2025 con días de cero eventos en el denominador
SELECT count(*)::numeric / 365 AS media_diaria
FROM historico.evento
WHERE event_time >= '2025-01-01Z' AND event_time < '2026-01-01Z'
  AND mag >= :min_mag
  AND (:ambito = 'global' OR (:ambito = 'pais' AND country_id = :pais) OR (:ambito = 'sin_pais' AND geo_resultado = 'sin_pais'));

-- Serie diaria completa (los días sin eventos aportan 0)
SELECT d::date AS dia, count(e.event_id) AS eventos
FROM generate_series('2025-01-01'::date, '2025-12-31'::date, '1 day') d
LEFT JOIN historico.evento e ON e.event_time >= d::timestamptz AND e.event_time < (d + 1)::timestamptz AND e.mag >= :min_mag
     AND (:ambito = 'global' OR (:ambito = 'pais' AND e.country_id = :pais) OR (:ambito = 'sin_pais' AND e.geo_resultado = 'sin_pais'))
GROUP BY d ORDER BY d;

-- Recuento reciente con el mismo filtro (estado actual, sin retirados)
SELECT count(*) FROM live.evento_actual
WHERE NOT retirado AND event_time >= :desde AND event_time < :hasta
  AND mag >= :min_mag
  AND (:ambito = 'global' OR (:ambito = 'pais' AND country_id = :pais) OR (:ambito = 'sin_pais' AND geo_resultado = 'sin_pais'));

-- Mediana diaria (complemento: la media está inflada por réplicas)
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY eventos) FROM (/* serie diaria completa */) s;

-- Hueco pendiente que intersecta la ventana reciente (marca de la comparación)
SELECT EXISTS (SELECT 1 FROM live.hueco WHERE estado = 'pendiente' AND inicio < :hasta AND fin > :desde);

-- Magnitud nula: no cumple el umbral y se cuenta aparte
SELECT count(*) FROM live.evento_actual WHERE NOT retirado AND mag IS NULL AND event_time >= :desde AND event_time < :hasta;
```

Reglas: variación = (reciente − media) / media, «no definida» si la media es 0; `:min_mag` menor que 4 se eleva a 4 en ambos periodos y se indica;
ventana horaria: media = total / 8 760; los días del periodo se derivan del intervalo (365 en 2025); el periodo reciente puede estar incompleto (`periodo_reciente_incompleto`). El SQL es orientativo: la forma final se fija en 4.6 como archivo de referencia `sql/consultas/comparacion.sql`, sin módulo de producción (F5 lo convierte en API).
