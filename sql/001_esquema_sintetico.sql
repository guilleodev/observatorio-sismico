-- Esquema aislado del MVP (datos sintéticos). Ver specs/001-mvp-evento-sintetico/data-model.md.
-- PostgreSQL solo ejecuta este script al crear el volumen por primera vez.

CREATE SCHEMA IF NOT EXISTS sintetico;

CREATE TABLE IF NOT EXISTS sintetico.evento_actual (
    event_id        text PRIMARY KEY CHECK (event_id LIKE 'synthetic-%'),
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
    mode            text NOT NULL CHECK (mode = 'synthetic'),
    ingested_at     timestamptz NOT NULL,
    kafka_topic     text NOT NULL,
    kafka_partition integer NOT NULL,
    kafka_offset    bigint NOT NULL,
    raw             jsonb NOT NULL,
    stored_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evento_actual_event_time
    ON sintetico.evento_actual (event_time);
