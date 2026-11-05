-- Esquema de datos REALES (feed live de USGS). Estructura provisional: en el paso 3.3 se amplia con
-- evento_version, cuarentena y estado de ingesta; evento_actual conserva este nucleo.
-- PostgreSQL solo ejecuta este script al crear el volumen por primera vez; en un volumen existente se aplica a mano
-- (psql -f). El esquema del MVP esta archivado en sql/mvp/ y NO se ejecuta.

CREATE SCHEMA IF NOT EXISTS live;

CREATE TABLE IF NOT EXISTS live.evento_actual (
    event_id        text PRIMARY KEY CHECK (event_id <> ''),
    event_time      timestamptz NOT NULL,
    updated_at      timestamptz NOT NULL,
    mag             numeric,
    mag_type        text,
    depth_km        numeric,
    longitude       double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    latitude        double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    place           text,
    country_id      text,
    country_name    text,
    source          text NOT NULL,
    mode            text NOT NULL CHECK (mode = 'live'),
    ingested_at     timestamptz NOT NULL,
    kafka_topic     text NOT NULL,
    kafka_partition integer NOT NULL,
    kafka_offset    bigint NOT NULL,
    raw             jsonb NOT NULL,
    stored_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_evento_actual_event_time
    ON live.evento_actual (event_time);
