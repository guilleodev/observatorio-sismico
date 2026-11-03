# Modelo de datos: MVP — evento sintético

Este modelo es **provisional y mínimo**: solo sirve al MVP. El modelo conceptual/lógico/físico
definitivo (`evento_actual`, `evento_version`, `pais`, `fecha`, `cuarentena`, estado de ingesta) se
diseña en F3. Todo vive en el esquema `sintetico`, aislado de los datos reales.

## Entidades

### Evento sintético (origen del mensaje)
Feature GeoJSON con la forma del feed de USGS, para que el consumidor reutilice después el mismo
análisis con los datos reales.

| Campo | Valor en el MVP |
|---|---|
| `id` | `synthetic-mvp-001` (prefijo reservado `synthetic-`) |
| `geometry` | `Point` con `[longitud, latitud, profundidad_km]` válidos |
| `properties.type` | `earthquake` |
| `properties.mag` / `magType` | número / `"ml"` |
| `properties.place` | texto que empieza por «SINTÉTICO:» |
| `properties.time` / `updated` | milisegundos Unix UTC |

### Mensaje de evento (transporte)
Ver [contracts/mensaje-kafka.md](contracts/mensaje-kafka.md): clave = `id`; valor JSON con `source`,
`ingested_at`, `mode` y `event` (el Feature original).

### Evento actual (almacenamiento) — `sintetico.evento_actual`
**Una fila = la versión actual de un evento sintético.** Grano: un `event_id`.

| Columna | Tipo | Nulo | Notas |
|---|---|---|---|
| `event_id` | `text` | no | **PK**; `CHECK (event_id LIKE 'synthetic-%')` |
| `event_time` | `timestamptz` | no | Instante de ocurrencia (UTC), desde `properties.time` |
| `updated_at` | `timestamptz` | no | Instante de actualización de la versión, desde `properties.updated` |
| `mag` | `numeric` | sí | Magnitud; `null` si desconocida (nunca 0) |
| `mag_type` | `text` | sí | |
| `depth_km` | `numeric` | sí | Profundidad en km |
| `longitude` | `double precision` | no | `CHECK` entre −180 y 180 |
| `latitude` | `double precision` | no | `CHECK` entre −90 y 90 |
| `place` | `text` | sí | |
| `country_id` | `text` | sí | Siempre `null` en el MVP (geografía en F4) |
| `country_name` | `text` | sí | Siempre `null` en el MVP |
| `source` | `text` | no | `synthetic-generator` |
| `mode` | `text` | no | `CHECK (mode = 'synthetic')`; valor temporal solo en el esquema `sintetico` (R-001); las tablas de datos reales usarán `live`/`replay` |
| `ingested_at` | `timestamptz` | no | Cuándo se produjo el mensaje (tiempo de procesamiento ≠ de ocurrencia) |
| `kafka_topic`, `kafka_partition`, `kafka_offset` | `text`, `int`, `bigint` | no | Trazabilidad al mensaje original |
| `raw` | `jsonb` | no | Feature original, conservado sin transformar |
| `stored_at` | `timestamptz` | no | `DEFAULT now()`; instante de la escritura |

**Índice**: `evento_actual (event_time)` — la API filtra por intervalo temporal (ventana por defecto
de 24 h). Con una fila no aporta rendimiento medible; se crea porque la consulta lo usará desde
F5 y su justificación y medición pertenecen a la memoria (no se afirma mejora sin medir).

## Reglas

- **Unicidad**: `event_id` es PK. `INSERT ... ON CONFLICT (event_id) DO NOTHING`.
- **Conversión de tiempo**: `time`/`updated` (ms Unix) → `timestamptz` UTC; el valor original se
  conserva en `raw`.
- **Nulos**: `mag`, `mag_type`, `depth_km`, `place` admiten `null`; nunca se sustituyen por 0.
- **Aislamiento**: el esquema `sintetico` no se consulta desde ningún componente de datos reales y
  la API del MVP solo lee de él.
- **Transición de estado**: no hay (una fila nunca cambia en el MVP). Las revisiones llegan en F3.

## Respuesta de la API (vista, no tabla)

Se construye en `api/repositorio.py` con una fila por Feature. Ver
[contracts/api-mvp.md](contracts/api-mvp.md).
