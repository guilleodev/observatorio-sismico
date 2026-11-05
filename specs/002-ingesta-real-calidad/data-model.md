# Modelo de datos: Ingesta real y calidad (F3)

Sustituye la estructura provisional del paso 3.1 (`live.evento_actual`) por el modelo definitivo de `ENUNCIADO.md` §7.
Todo vive en el esquema `live`; el esquema `sintetico` del MVP queda archivado y no se toca.

## 1. Modelo conceptual

| Entidad | Qué representa | Relación |
|---|---|---|
| Evento actual | Versión vigente de un terremoto | 1 por evento; deriva de sus versiones |
| Versión del evento | Cada `(id, updated)` distinto recibido, con el original | N por evento |
| Versión publicada | Confirmación de Kafka de una versión enviada | Por `(id, updated)`; la escribe el productor |
| Consulta de extracción | Un intento de leer la ventana de USGS | 1 por ciclo |
| Respuesta original | Copia completa comprimida de una respuesta | 0–1 por consulta (solo si cambia) |
| Cuarentena | Evento excluido o inválido con motivo y original | N |
| Estado de ingesta | Última consulta correcta, último error y contadores | 1 fila |

Terminología: «estado actual» es la tabla `evento_actual`; los sufijos `*_ms` son milisegundos Unix UTC y `*_at`, `timestamptz` (UTC).
Las dimensiones de fecha y país (§7) llegan en F4; hasta entonces `country_id`/`country_name` son nulos y el grano se
mantiene para poder enlazarlas sin rediseñar.

## 2. Modelo lógico

- **Grano de `evento_actual`**: un `event_id`. **Grano de `evento_version`**: un `(event_id, updated_at)`.
- **Tiempos** (§6): ocurrencia (`event_time`), actualización de USGS (`updated_at`) y procesamiento (`ingested_at`, `stored_at`)
  separados, en UTC; el original se conserva en `raw`.
- **Reglas**: una versión se inserta una sola vez; `evento_actual` solo avanza con un `updated_at` mayor; la reclasificación a no sísmico
  marca `retirado = true` sin borrar; las versiones antiguas tardías quedan solo en el historial.
- **Productor**: escribe `version_publicada`, `consulta_extraccion`, `respuesta_original`, `estado_ingesta`. **Consumidor**:
  escribe `evento_version`, `evento_actual`, `cuarentena`. **API**: lee `evento_actual` y `estado_ingesta`.

## 3. Modelo físico (esquema SQL lógico; el script real es `sql/002_esquema_f3.sql`)

### `live.evento_actual` (existe; se amplía)
Columnas actuales del paso 3.1 (`event_id` PK, `event_time`, `updated_at`, `mag`, `mag_type`, `depth_km`, `longitude`,
`latitude`, `place`, `country_id`, `country_name`, `source`, `mode` = `live`, `ingested_at`, `kafka_*`, `raw`, `stored_at`) y **nueva**:

| Columna | Tipo | Notas |
|---|---|---|
| `retirado` | `boolean NOT NULL DEFAULT false` | `true` si la última versión no es `earthquake`; la API lo excluye |

Índice `idx_live_evento_actual_event_time (event_time)` ya existe; **nuevo** índice parcial `(event_time) WHERE NOT retirado`
para la consulta de la ventana de 24 h (se mide con `EXPLAIN` en la tarea T035; si no aporta, se retira de `sql/002_esquema_f3.sql`).

### `live.evento_version`
| Columna | Tipo | Notas |
|---|---|---|
| `event_id` | `text` | **PK (event_id, updated_at)** |
| `updated_at` | `timestamptz` | Versión de USGS |
| `event_time`, `mag` (null), `mag_type`, `depth_km` (null), `longitude`, `latitude`, `place` | como en `evento_actual` | Mismas restricciones de rango |
| `source`, `mode` (`live`), `ingested_at`, `kafka_topic`, `kafka_partition`, `kafka_offset` | | Trazabilidad |
| `raw` | `jsonb NOT NULL` | Evento original sin transformar |
| `stored_at` | `timestamptz DEFAULT now()` | |

Índice: la PK sirve para «historial de un evento». Sin índices adicionales hasta medir.

### `live.version_publicada`
`event_id text`, `updated_ms bigint` (**PK (event_id, updated_ms)**), `published_at timestamptz DEFAULT now()`,
`kafka_partition int`, `kafka_offset bigint`. Se consulta por `event_id = ANY(...)` (la PK lo cubre).

### `live.consulta_extraccion`
`id bigserial PK`, `iniciada_at timestamptz NOT NULL`, `duracion_ms int`, `resultado text CHECK IN ('ok','error')`,
`http_status int NULL`, `error text NULL`, `bytes int NULL`, `eventos int NULL`, `intentos int`, `publicadas int`, `omitidas int`.
Índice `(iniciada_at)` para la purga a 30 días y para consultar el periodo.

### `live.respuesta_original`
`consulta_id bigint PK REFERENCES consulta_extraccion`, `hash_features text NOT NULL`, `contenido_gz bytea NOT NULL`,
`tamano_bytes int`, `creada_at timestamptz DEFAULT now()`. Índice `(creada_at)` para la purga a 3 días. Una fila por cambio de
contenido, no por consulta.

### `live.cuarentena`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | `bigserial PK` | |
| `categoria` | `text CHECK IN ('excluido','invalido')` | |
| `motivo` | `text NOT NULL` | Regla incumplida o tipo no sísmico |
| `event_id`, `updated_ms` | `text NULL`, `bigint NULL` | Si se pudieron leer |
| `kafka_topic`, `kafka_partition`, `kafka_offset`, `clave` | | Posición del mensaje |
| `payload` | `bytea NOT NULL` | Copia del contenido recibido |
| `huella` | `text NOT NULL UNIQUE` | Idempotencia ante reenvíos (R-007): `sha256` de `categoria|event_id|updated_ms|motivo`, o del contenido si es ilegible |
| `registrado_at` | `timestamptz DEFAULT now()` | |

Índices: `UNIQUE (huella)`, `(categoria, motivo)` para los recuentos del análisis de calidad.

### `live.estado_ingesta`
`id smallint PK CHECK (id = 1)`, `ultima_consulta_ok_at timestamptz NULL`, `ultimo_error_at timestamptz NULL`,
`ultimo_error text NULL`, `ultimo_hash_features text NULL`, `consultas_ok bigint DEFAULT 0`, `consultas_error bigint DEFAULT 0`.

## 4. Transiciones del estado actual

| Llega… | Estado actual | Historial |
|---|---|---|
| Evento nuevo válido | Se crea | +1 |
| Misma versión | Sin cambio | Sin cambio |
| Versión con `updated` mayor | Se actualiza (`retirado = false`) | +1 |
| Versión con `updated` menor | Sin cambio | +1 |
| Versión no sísmica más reciente | `retirado = true` y `updated_at` de esa versión (el resto de columnas se conserva); un evento nunca visto no crea fila | Sin cambio en `evento_version`; la exclusión queda en cuarentena y forma parte de la secuencia de revisiones |
| Versión inválida | Sin cambio | Sin cambio; registro en cuarentena |

## 5. Retención

Respuestas originales: 3 días. Consultas: 30 días. Versiones, estado actual, publicaciones y cuarentena: sin purga (se mantiene el
histórico, `ENUNCIADO.md` §5). Valores provisionales hasta medir en el paso 3.2.
