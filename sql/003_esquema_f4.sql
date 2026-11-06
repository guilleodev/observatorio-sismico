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
