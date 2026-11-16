-- F8: segunda fuente de terremotos en vivo (EMSC, Centro Sismológico Europeo-Mediterráneo; datos CC BY 4.0). Migración ADITIVA e idempotente:
--  · no modifica ninguna tabla ni columna existente (live.evento_actual, live.evento_version, live.estado_ingesta… quedan tal cual);
--  · crea el registro de consultas y el estado PROPIOS de cada fuente adicional (el estado del feed de USGS es de UNA sola fuente: live.estado_ingesta tiene una fila);
--  · crea dos funciones para NO DUPLICAR: si el mismo terremoto lo informan USGS y EMSC, se muestra una sola vez (el de USGS).
-- PostgreSQL solo ejecuta este script al crear el volumen por primera vez; en un volumen existente se aplica a mano:
--   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < sql/005_fuente_emsc.sql

-- Registro de consultas a una fuente adicional (misma idea que live.consulta_extraccion, que es solo de USGS).
CREATE TABLE IF NOT EXISTS live.consulta_fuente (
    id          bigserial PRIMARY KEY,
    fuente      text NOT NULL CHECK (fuente <> ''),
    iniciada_at timestamptz NOT NULL,
    duracion_ms integer,
    resultado   text NOT NULL CHECK (resultado IN ('ok', 'error')),
    http_status integer,
    error       text,
    bytes       integer,
    eventos     integer,
    intentos    integer,
    publicadas  integer,
    omitidas    integer,
    parametro   text            -- «start=…» o «updatedafter=…»: qué ventana se pidió (trazabilidad de la consulta incremental)
);
CREATE INDEX IF NOT EXISTS idx_consulta_fuente_iniciada ON live.consulta_fuente (fuente, iniciada_at);

-- Estado por fuente: última consulta correcta, último error y MARCA de actualización (`updatedafter` de la siguiente consulta incremental).
CREATE TABLE IF NOT EXISTS live.estado_fuente (
    fuente                text PRIMARY KEY CHECK (fuente <> ''),
    ultima_consulta_ok_at timestamptz,
    ultimo_error_at       timestamptz,
    ultimo_error          text,
    marca_actualizacion   timestamptz,
    consultas_ok          bigint NOT NULL DEFAULT 0,
    consultas_error       bigint NOT NULL DEFAULT 0
);

-- Distancia entre dos puntos (km, haversine con radio medio 6371 km). IMMUTABLE: depende solo de los argumentos.
CREATE OR REPLACE FUNCTION live.distancia_km(lon1 double precision, lat1 double precision, lon2 double precision, lat2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT 12742.0 * asin(sqrt(least(1.0, sin(radians(lat2 - lat1) / 2.0) ^ 2
                                          + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lon2 - lon1) / 2.0) ^ 2)))
$$;

-- ¿Es este evento de EMSC el MISMO terremoto que uno ya informado por otra fuente (USGS)? Se evalúa AL LEER (el orden de llegada no importa: si USGS publica
-- más tarde que EMSC, el duplicado deja de verse sin reescribir nada). Regla validada con 7 días de datos reales (docs/evidencias/f8/):
--   · general:      diferencia de hora ≤ 90 s y distancia ≤ 100 km;
--   · M ≥ 4,5 (la localización de los sismos fuertes y remotos varía más entre agencias): ≤ 300 s, ≤ 300 km y diferencia de magnitud ≤ 0,6.
-- Los eventos que no son de EMSC nunca son «duplicado». Un evento retirado (reclasificado a no sísmico) no cuenta como pareja.
CREATE OR REPLACE FUNCTION live.emsc_duplicado(p_source text, p_time timestamptz, p_lon double precision, p_lat double precision, p_mag numeric)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT p_source = 'emsc-fdsn' AND EXISTS (
        SELECT 1 FROM live.evento_actual u
        WHERE u.source <> 'emsc-fdsn' AND NOT u.retirado
          AND (
                (u.event_time BETWEEN p_time - interval '90 seconds' AND p_time + interval '90 seconds'
                 AND live.distancia_km(u.longitude, u.latitude, p_lon, p_lat) <= 100)
             OR (p_mag >= 4.5 AND u.mag IS NOT NULL AND abs(u.mag - p_mag) <= 0.6
                 AND u.event_time BETWEEN p_time - interval '300 seconds' AND p_time + interval '300 seconds'
                 AND live.distancia_km(u.longitude, u.latitude, p_lon, p_lat) <= 300)
          )
    )
$$;
