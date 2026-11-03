# Contrato de la API en el MVP

Fuente de verdad: `docs/referencias/CONTRATO-API.md`. Este documento **no lo repite**: solo recoge
lo que el MVP implementa y sus diferencias.

## `GET /api/eventos`

Conforme al contrato del profesor: `200`, `application/json`, `FeatureCollection`, un elemento por
evento, `features: []` sin eventos, `null` (nunca NaN/Infinity), fechas en ms Unix UTC, coordenadas
`[longitud, latitud, profundidad_km]`. Por defecto, eventos con `event_time` en las últimas 24 h.

| Aspecto | MVP |
|---|---|
| Fuente de datos | Solo `sintetico.evento_actual` |
| `metadata.mode` | **`"synthetic"`** — **excepción temporal** solo en la API del MVP. El contrato del profesor admite únicamente `live` y `replay`; `synthetic` **no** es un valor válido de la API definitiva y se retira o aísla como máximo al cerrar el paso 3.1 de la hoja de ruta, antes de la ingesta real del paso 3.2 (ver research R-001) |
| `metadata.generated` | Instante de la respuesta (ms) |
| `metadata.last_ingestion` | **Significado provisional (solo MVP)**: `max(ingested_at)` del esquema sintético, o `null` si no hay eventos; es el «último mensaje sintético procesado», **no** una consulta a USGS. **Significado definitivo (desde la ingesta real de F3: pasos 3.2 y 3.6)**: según el contrato, instante de la última consulta correcta a USGS; en la API definitiva nunca se calcula con datos sintéticos |
| `metadata.count` | Número de Features |
| `metadata.truncated` | Siempre `false` (sin paginación en el MVP) |
| `properties` | `mag`, `magType`, `place`, `time`, `updated`, `country_id` (`null`), `country_name` (`null`) |
| Filtros (`start`, `end`, `min_mag`, `country_id`) | **No implementados** (Fase 5) |
| Fallo de base de datos | `503` con cuerpo JSON de error explícito; nunca `features: []` |

## `GET /api/salud` (mínimo)

Necesario como healthcheck de Compose. Devuelve `200` con `status`, estado de la base de datos y
`last_ingestion`; `503` si la base no responde. Sin credenciales ni datos internos.

## CORS

Origen permitido: `http://localhost:4200` (variable `API_CORS_ORIGINS`). Métodos `GET` y
`OPTIONS`; cabecera permitida `ngrok-skip-browser-warning`. Sin cookies. El origen de Netlify se
añade en F6.

## Fuera del MVP

`GET /api/estadisticas`, paginación, `truncated: true`.
