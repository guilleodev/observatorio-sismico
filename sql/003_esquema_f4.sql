-- Esquema de la fase F4 (geografia e historico). Modelo: specs/003-geografia-historico/data-model.md.
-- Idempotente: se puede aplicar a mano sobre el volumen existente sin borrar datos (psql -f). En un volumen nuevo
-- lo ejecuta PostgreSQL despues de 002_esquema_f3.sql. Se amplia por pasos: 4.1 (geo), 4.2 (columnas de live),
-- 4.4 (historico) y 4.5 (live.hueco).

-- ---------------------------------------------------------------- Paso 4.1: dimension geografica compartida
CREATE SCHEMA IF NOT EXISTS geo;

-- Versiones del catalogo usadas: la huella sha256 del archivo identifica la version (R-003).
CREATE TABLE IF NOT EXISTS geo.catalogo (
    sha256     text PRIMARY KEY CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    archivo    text NOT NULL,
    entidades  integer NOT NULL CHECK (entidades > 0),
    cargado_at timestamptz NOT NULL DEFAULT now()
);

-- Una fila por entidad del catalogo. country_id = ADM0_A3 (no se presupone ISO: ver geo.pais.iso_a3).
CREATE TABLE IF NOT EXISTS geo.pais (
    country_id text PRIMARY KEY CHECK (country_id <> ''),
    nombre_es  text,
    nombre_en  text,
    continente text,
    subregion  text,
    tipo       text,
    iso_a3     text   -- nulo cuando el catalogo trae -99 (entidades sin ISO propio)
);

-- ---------------------------------------------------------------- Paso 4.2: pais en el estado actual
-- live.evento_actual ya tenia country_id y country_name (nulos desde el MVP). Se anade el resultado de la asignacion y la
-- version del catalogo que la hizo. geo_resultado nulo = aun sin asignar (lo recoge la asignacion retroactiva).
ALTER TABLE live.evento_actual ADD COLUMN IF NOT EXISTS geo_resultado text;
ALTER TABLE live.evento_actual ADD COLUMN IF NOT EXISTS geo_catalogo  text;

-- ADD CONSTRAINT no es idempotente en PostgreSQL: cada restriccion se crea solo si falta.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'live.evento_actual'::regclass AND conname = 'evento_actual_geo_resultado_check') THEN
        ALTER TABLE live.evento_actual ADD CONSTRAINT evento_actual_geo_resultado_check
            CHECK (geo_resultado IN ('interior', 'frontera', 'varias', 'sin_pais'));
    END IF;
    -- country_id nulo <=> sin_pais (cuando ya se asigno)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'live.evento_actual'::regclass AND conname = 'evento_actual_geo_coherente_check') THEN
        ALTER TABLE live.evento_actual ADD CONSTRAINT evento_actual_geo_coherente_check
            CHECK (geo_resultado IS NULL OR ((country_id IS NULL) = (geo_resultado = 'sin_pais')));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'live.evento_actual'::regclass AND conname = 'evento_actual_country_id_fkey') THEN
        ALTER TABLE live.evento_actual ADD CONSTRAINT evento_actual_country_id_fkey
            FOREIGN KEY (country_id) REFERENCES geo.pais (country_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'live.evento_actual'::regclass AND conname = 'evento_actual_geo_catalogo_fkey') THEN
        ALTER TABLE live.evento_actual ADD CONSTRAINT evento_actual_geo_catalogo_fkey
            FOREIGN KEY (geo_catalogo) REFERENCES geo.catalogo (sha256);
    END IF;
END $$;

-- ---------------------------------------------------------------- Paso 4.4: historico de 2025 (aislado de live)
-- Instantanea de USGS 2025 (M>=4): nada de lo que hay aqui entra en live ni en /api/eventos (FR-016). La carga la hace
-- python -m observatorio.historico.cargar directamente en PostgreSQL, sin Kafka (decision D3).
CREATE SCHEMA IF NOT EXISTS historico;

-- Un tramo consultado (mes o subtramo). El padre de una subdivision solo pasa a 'subdividido' cuando sus hijos estan completos.
CREATE TABLE IF NOT EXISTS historico.consulta (
    id             bigserial PRIMARY KEY,
    inicio         timestamptz NOT NULL,
    fin            timestamptz NOT NULL,
    filtros        jsonb NOT NULL,
    tramo_padre    bigint REFERENCES historico.consulta (id),
    url            text NOT NULL,
    extraida_at    timestamptz NOT NULL DEFAULT now(),
    resultado      text NOT NULL CHECK (resultado IN ('ok', 'error', 'subdividido')),
    http_status    integer,
    intentos       integer,
    error          text,
    esperado       integer,
    obtenidos      integer,
    duplicados     integer NOT NULL DEFAULT 0,
    fuera_de_tramo integer NOT NULL DEFAULT 0,
    peticiones_http integer NOT NULL DEFAULT 0,
    CHECK (fin > inicio),
    UNIQUE (inicio, fin, filtros)
);

-- Respuesta original del tramo, comprimida (gzip) y con su huella; tambien se exporta a data/historico/ (R-007).
-- Un tramo sin resultados (esperado = 0) no tiene archivo: USGS no devuelve cuerpo y no se inventa uno.
CREATE TABLE IF NOT EXISTS historico.archivo (
    consulta_id   bigint PRIMARY KEY REFERENCES historico.consulta (id),
    contenido_gz  bytea NOT NULL,
    sha256        text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    tamano_bytes  integer NOT NULL,
    creada_at     timestamptz NOT NULL DEFAULT now()
);

-- Terremoto de 2025: instantanea (una fila por id; si USGS lo devuelve en dos tramos se conserva el de mayor `updated`).
CREATE TABLE IF NOT EXISTS historico.evento (
    event_id      text PRIMARY KEY CHECK (event_id <> ''),
    event_time    timestamptz NOT NULL,
    updated_at    timestamptz NOT NULL,
    mag           numeric,
    mag_type      text,
    depth_km      numeric,
    longitude     double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    latitude      double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    place         text,
    country_id    text REFERENCES geo.pais (country_id),
    geo_resultado text NOT NULL CHECK (geo_resultado IN ('interior', 'frontera', 'varias', 'sin_pais')),
    geo_catalogo  text NOT NULL REFERENCES geo.catalogo (sha256),
    origen        text NOT NULL CHECK (origen = 'historico-usgs-fdsn'),
    consulta_id   bigint NOT NULL REFERENCES historico.consulta (id),
    raw           jsonb NOT NULL,
    cargado_at    timestamptz NOT NULL DEFAULT now(),
    CHECK ((country_id IS NULL) = (geo_resultado = 'sin_pais'))
);

CREATE INDEX IF NOT EXISTS idx_historico_evento_time ON historico.evento (event_time);
CREATE INDEX IF NOT EXISTS idx_historico_evento_pais ON historico.evento (country_id, event_time);

-- Eventos excluidos (no sismicos) o invalidos del historico, con motivo y referencia al original (misma estructura que live.cuarentena)
CREATE TABLE IF NOT EXISTS historico.cuarentena (
    id            bigserial PRIMARY KEY,
    categoria     text NOT NULL CHECK (categoria IN ('excluido', 'invalido')),
    motivo        text NOT NULL,
    event_id      text,
    updated_ms    bigint,
    consulta_id   bigint NOT NULL REFERENCES historico.consulta (id),
    payload       bytea NOT NULL,
    huella        text NOT NULL UNIQUE,
    registrado_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- Paso 4.5: huecos de ingesta (live.hueco)
-- Intervalos sin cobertura del feed (consumidor o productor parado mas de 24 h). Los anota el productor al registrar una consulta
-- correcta; los recupera a demanda python -m observatorio.recuperacion.recuperar (no hay recuperacion automatica).
CREATE TABLE IF NOT EXISTS live.hueco (
    id                 bigserial PRIMARY KEY,
    inicio             timestamptz NOT NULL,
    fin                timestamptz NOT NULL,
    detectado_at       timestamptz NOT NULL DEFAULT now(),
    estado             text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'recuperado')),
    recuperado_at      timestamptz,
    eventos_publicados integer,
    CHECK (fin > inicio),
    UNIQUE (inicio, fin)
);
