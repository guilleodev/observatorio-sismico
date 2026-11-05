-- Esquema definitivo de la fase F3 (ingesta real y calidad). Modelo: specs/002-ingesta-real-calidad/data-model.md.
-- Idempotente: se puede aplicar a mano sobre el volumen existente sin borrar datos (psql -f). En un volumen nuevo
-- lo ejecuta PostgreSQL despues de 001_esquema_live.sql.

-- Estado actual: se amplia con la marca de retirada (reclasificacion a no sismico, D2)
ALTER TABLE live.evento_actual ADD COLUMN IF NOT EXISTS retirado boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_live_evento_actual_vigente
    ON live.evento_actual (event_time) WHERE NOT retirado;

-- Historial: una fila por version distinta (event_id, updated_at); el evento original se conserva en raw
CREATE TABLE IF NOT EXISTS live.evento_version (
    event_id        text NOT NULL CHECK (event_id <> ''),
    updated_at      timestamptz NOT NULL,
    event_time      timestamptz NOT NULL,
    mag             numeric,
    mag_type        text,
    depth_km        numeric,
    longitude       double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    latitude        double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    place           text,
    source          text NOT NULL,
    mode            text NOT NULL CHECK (mode = 'live'),
    ingested_at     timestamptz NOT NULL,
    kafka_topic     text NOT NULL,
    kafka_partition integer NOT NULL,
    kafka_offset    bigint NOT NULL,
    raw             jsonb NOT NULL,
    stored_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, updated_at)
);

-- Versiones que Kafka ya confirmo (la escribe el productor)
CREATE TABLE IF NOT EXISTS live.version_publicada (
    event_id        text NOT NULL,
    updated_ms      bigint NOT NULL,
    published_at    timestamptz NOT NULL DEFAULT now(),
    kafka_partition integer,
    kafka_offset    bigint,
    PRIMARY KEY (event_id, updated_ms)
);

-- Registro de consultas a USGS
CREATE TABLE IF NOT EXISTS live.consulta_extraccion (
    id          bigserial PRIMARY KEY,
    iniciada_at timestamptz NOT NULL,
    duracion_ms integer,
    resultado   text NOT NULL CHECK (resultado IN ('ok', 'error')),
    http_status integer,
    error       text,
    bytes       integer,
    eventos     integer,
    intentos    integer,
    publicadas  integer,
    omitidas    integer
);

CREATE INDEX IF NOT EXISTS idx_consulta_extraccion_iniciada
    ON live.consulta_extraccion (iniciada_at);

-- Copia completa comprimida de la respuesta, solo cuando cambia el contenido
CREATE TABLE IF NOT EXISTS live.respuesta_original (
    consulta_id   bigint PRIMARY KEY REFERENCES live.consulta_extraccion (id) ON DELETE CASCADE,
    hash_features text NOT NULL,
    contenido_gz  bytea NOT NULL,
    tamano_bytes  integer,
    creada_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_respuesta_original_creada
    ON live.respuesta_original (creada_at);

-- Eventos excluidos (no sismicos) o invalidos, con motivo y referencia al original
CREATE TABLE IF NOT EXISTS live.cuarentena (
    id              bigserial PRIMARY KEY,
    categoria       text NOT NULL CHECK (categoria IN ('excluido', 'invalido')),
    motivo          text NOT NULL,
    event_id        text,
    updated_ms      bigint,
    kafka_topic     text,
    kafka_partition integer,
    kafka_offset    bigint,
    clave           text,
    payload         bytea NOT NULL,
    huella          text NOT NULL UNIQUE,
    registrado_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cuarentena_categoria_motivo ON live.cuarentena (categoria, motivo);
CREATE INDEX IF NOT EXISTS idx_cuarentena_evento ON live.cuarentena (event_id, updated_ms);

-- Estado de ingesta: una sola fila
CREATE TABLE IF NOT EXISTS live.estado_ingesta (
    id                   smallint PRIMARY KEY CHECK (id = 1),
    ultima_consulta_ok_at timestamptz,
    ultimo_error_at      timestamptz,
    ultimo_error         text,
    ultimo_hash_features text,
    consultas_ok         bigint NOT NULL DEFAULT 0,
    consultas_error      bigint NOT NULL DEFAULT 0
);

INSERT INTO live.estado_ingesta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
