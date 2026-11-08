-- Esquema `replay` (F6, paso 6.1; specs/005-replay-despliegue-final/data-model.md).
-- Reproducción histórica ACELERADA y AISLADA: eventos reales de 2025 (leídos de historico.evento) más seis casos controlados, procesados por el mismo código
-- del consumidor pero escritos solo aquí. NADA de este esquema se une por clave foránea con `live` ni con `historico`, y los CHECK de modo y fuente impiden
-- a nivel de base de datos mezclar un dato de replay con uno en vivo (los de `live` exigen mode = 'live').
-- Aditivo e idempotente: se puede aplicar a mano sobre el volumen existente sin borrar nada (psql -f); en un volumen nuevo lo ejecuta PostgreSQL
-- después de 001–003. Constitución v1.0.4: los casos controlados (columna `caso`, ids `replay-ctl-…`) solo pueden existir en este esquema.

CREATE SCHEMA IF NOT EXISTS replay;

-- Una fila por reproducción. Nada se borra: cada ejecución conserva sus eventos, versiones y cuarentena.
CREATE TABLE IF NOT EXISTS replay.ejecucion (
    run_id          text PRIMARY KEY CHECK (run_id ~ '^[A-Za-z0-9._-]{1,64}$'),
    dia             date,                                   -- día UTC de 2025 elegido para la selección
    tamano          integer NOT NULL CHECK (tamano >= 0),   -- eventos reales de la selección
    mensajes        integer NOT NULL CHECK (mensajes >= 0), -- mensajes totales (reales + casos controlados)
    criterio        text NOT NULL,                          -- cómo se eligió la selección
    intervalo_desde timestamptz,                            -- tiempo ORIGINAL del primer evento de la selección
    intervalo_hasta timestamptz,                            -- tiempo ORIGINAL del último evento de la selección
    intervalo_s     numeric NOT NULL CHECK (intervalo_s > 0),   -- segundos entre mensajes
    velocidad       numeric CHECK (velocidad IS NULL OR velocidad > 0),  -- aceleración: tiempo real cubierto / duración de la reproducción
    iniciada_at     timestamptz NOT NULL DEFAULT now(),
    terminada_at    timestamptz,
    estado          text NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso', 'terminada', 'interrumpida'))
);

-- Estado actual: una fila por (ejecución, evento). Mismas columnas que live.evento_actual más run_id y caso.
-- Sin clave foránea a `ejecucion`: un mensaje de una ejecución desconocida no debe bloquear el consumidor en un reintento eterno
-- (el productor siempre registra la ejecución antes de publicar).
CREATE TABLE IF NOT EXISTS replay.evento_actual (
    run_id          text NOT NULL,
    event_id        text NOT NULL CHECK (event_id <> ''),
    event_time      timestamptz NOT NULL,                   -- tiempo ORIGINAL del evento
    updated_at      timestamptz NOT NULL,
    mag             numeric,
    mag_type        text,
    depth_km        numeric,
    longitude       double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    latitude        double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    place           text,
    country_id      text REFERENCES geo.pais (country_id),
    country_name    text,
    geo_resultado   text CHECK (geo_resultado IN ('interior', 'frontera', 'varias', 'sin_pais')),
    geo_catalogo    text REFERENCES geo.catalogo (sha256),
    source          text NOT NULL CHECK (source = 'replay-historico'),
    mode            text NOT NULL CHECK (mode = 'replay'),
    ingested_at     timestamptz NOT NULL,                   -- instante de REPRODUCCIÓN (no el del evento)
    kafka_topic     text NOT NULL,
    kafka_partition integer NOT NULL,
    kafka_offset    bigint NOT NULL,
    raw             jsonb NOT NULL,
    retirado        boolean NOT NULL DEFAULT false,
    caso            text CHECK (caso IS NULL OR caso IN ('duplicado', 'revision', 'antigua', 'magnitud_nula', 'coordenadas_invalidas', 'maritimo')),
    stored_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (run_id, event_id),
    CHECK (geo_resultado IS NULL OR ((country_id IS NULL) = (geo_resultado = 'sin_pais')))
);
CREATE INDEX IF NOT EXISTS idx_replay_evento_actual_run_time ON replay.evento_actual (run_id, event_time);

-- Historial: una fila por versión distinta de cada evento en cada ejecución.
CREATE TABLE IF NOT EXISTS replay.evento_version (
    run_id          text NOT NULL,
    event_id        text NOT NULL CHECK (event_id <> ''),
    updated_at      timestamptz NOT NULL,
    event_time      timestamptz NOT NULL,
    mag             numeric,
    mag_type        text,
    depth_km        numeric,
    longitude       double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    latitude        double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    place           text,
    source          text NOT NULL CHECK (source = 'replay-historico'),
    mode            text NOT NULL CHECK (mode = 'replay'),
    ingested_at     timestamptz NOT NULL,
    kafka_topic     text NOT NULL,
    kafka_partition integer NOT NULL,
    kafka_offset    bigint NOT NULL,
    raw             jsonb NOT NULL,
    caso            text CHECK (caso IS NULL OR caso IN ('duplicado', 'revision', 'antigua', 'magnitud_nula', 'coordenadas_invalidas', 'maritimo')),
    stored_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (run_id, event_id, updated_at)
);

-- Cuarentena por ejecución. La huella de F3 no incluye el run (identifica categoría, motivo y versión), así que la unicidad es (run_id, huella):
-- cada ejecución conserva su propio registro y un reenvío dentro de la misma no crece.
CREATE TABLE IF NOT EXISTS replay.cuarentena (
    id              bigserial PRIMARY KEY,
    run_id          text NOT NULL,
    categoria       text NOT NULL CHECK (categoria IN ('excluido', 'invalido')),
    motivo          text NOT NULL,
    event_id        text,
    updated_ms      bigint,
    kafka_topic     text,
    kafka_partition integer,
    kafka_offset    bigint,
    clave           text,
    payload         bytea NOT NULL,
    huella          text NOT NULL,
    registrado_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, huella)
);
CREATE INDEX IF NOT EXISTS idx_replay_cuarentena_run ON replay.cuarentena (run_id, categoria);
