# Contrato de la API en F3

Fuente de verdad: `docs/referencias/CONTRATO-API.md`. Este documento solo recoge **lo que cambia** respecto al MVP.

| Aspecto | F3 |
|---|---|
| Fuente de `GET /api/eventos` | `live.evento_actual` con `retirado = false` y `event_time` en las últimas 24 h; un evento una sola vez, con su versión actual |
| `metadata.mode` | `live` |
| `metadata.last_ingestion` | Instante (ms Unix UTC) de la **última consulta correcta a USGS** (`estado_ingesta`); `null` si todavía no hubo ninguna; **no avanza** con consultas fallidas |
| `metadata.generated`, `count`, `truncated` | Como en el MVP (`truncated` siempre `false`; la paginación es de F5) |
| `GET /api/salud` | `status`, `database` y `last_ingestion` con el mismo significado; `503` si la base falla |
| Fallo de base de datos | `503` con error explícito; nunca `features: []` |
| Filtros (`start`, `end`, `min_mag`, `country_id`), `/api/estadisticas` | **No implementados** (F5) |

No se añaden rutas ni campos. `country_id` y `country_name` siguen siendo `null` hasta F4.
