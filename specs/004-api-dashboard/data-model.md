# Modelo de datos: API y dashboard (F5)

F5 **no crea tablas** ni cambia el almacenamiento de F3/F4. Define el contrato de las respuestas (ver [contracts/api-f5.md](contracts/api-f5.md)), los parámetros de
configuración y las lecturas permitidas. Un único índice (`sql/004_esquema_f5.sql`, idempotente) se añade **solo si** la medición de 5.7 lo justifica.

## Lecturas de la API (todas de solo lectura)

| Origen | Para qué | Quién |
|---|---|---|
| `live.evento_actual` (`NOT retirado`) | eventos, recuentos por hora y país, distribuciones, recuento reciente de la comparación | `repositorio`, `estadisticas`, `comparacion` |
| `live.estado_ingesta` | `last_ingestion`, edad, `stale` | `repositorio`, `/api/salud` |
| `live.hueco` (`estado = 'pendiente'`) | `gaps_pending`, motivo `hueco_pendiente` | `/api/salud`, `comparacion` |
| `geo.pais` | validar `country_id`, nombre del país | `filtros`, `estadisticas` |
| `historico.evento` | línea base de 2025 (total, serie diaria, mediana) | **solo** `comparacion` |

Nunca se lee `sintetico`, `historico.cuarentena` ni los archivos originales. Todas las sesiones ejecutan `SET TIME ZONE 'UTC'` y `statement_timeout`.

## Entidades (respuesta de la API)

| Entidad | Campos principales | Reglas |
|---|---|---|
| **Filtros** | `start` (ms, incl.), `end` (ms, excl., opcional), `min_mag` (opcional), `country_id` (`ADM0_A3` \| `sin_pais` \| nulo) | `start < end`; `country_id` ∈ `geo.pais` o `sin_pais`; `min_mag` finito |
| **Página de eventos** | `features[]` (≤ `limit`), `metadata`: `count`, `total`, `truncated`, `limit`, `offset`, `next_offset`, `sin_magnitud`, `period`, `coverage`, `generated`, `last_ingestion`, `mode = 'live'` | `truncated = offset + count < total`; orden `time DESC, id ASC`; `null` nunca NaN |
| **Bloque estadístico** | `unit`, `sin_valor`, `items[]` | `Σ items.count + sin_valor = total` |
| **Casilla horaria** | `hour` (ms, inicio de hora UTC), `count` | una por hora de `floor(start)` a `end`; ceros incluidos; ≤ 744 |
| **Intervalo de distribución** | `from`, `to`, `count` | límites fijos; los vacíos aparecen con 0 |
| **País (recuento)** | `country_id` (nulo = «Sin país asignado»), `country_name`, `count` | orden `count DESC, country_id` |
| **Comparación** | `ambito`, `country_id`, `min_mag_*`, `reciente`, `historico`, `variacion`, `variacion_definida`, `periodo_reciente_incompleto`, `motivos_incompleto` | `variacion` nula si `esperado = 0`; cada cifra con `source` |
| **Estado del sistema** | `status`, `database`, `last_ingestion`, `generated`, `ingestion_age_s`, `stale`, `stale_after_s`, `gaps_pending`, `live_since` (= `min(ingested_at) − 24 h`, como F4) | `stale` por el reloj de la API |

## Configuración nueva (variables del servicio `api`, sin secretos; `.env.example`)

| Variable | Por defecto | Uso |
|---|---|---|
| `API_MAX_EVENTOS` | `5000` | máximo de eventos por respuesta (DF3) |
| `API_MAX_VENTANA_HORAS` | `744` | máximo de casillas horarias (31 días); más → 422 |
| `INGESTA_OBSOLETA_S` | `300` | umbral de `stale` (DF4) |
| `API_STATEMENT_TIMEOUT_S` | `10` | tiempo máximo por consulta (503 si lo supera) |
| `API_MARGEN_PUBLICACION_S` | `900` | margen del motivo `hasta_ahora` de la comparación (propuesta a confirmar) |

## Estado en el navegador (no persistente)

`Filtros` (un único estado), última lectura correcta (instante UTC y respuesta), estado de carga/error por bloque, evento seleccionado y orden/página/búsqueda de la
tabla. No se guarda nada en `localStorage` ni se envía nada distinto de los parámetros de filtro.

## Índices candidatos (a medir en 5.7, sin presuponer)

`live.evento_actual (country_id, event_time)` y `(geo_resultado, event_time)` para el filtro por país; `idx_live_evento_actual_event_time` ya existe (F3).
Con ≈ 400 filas se espera `Seq Scan` con o sin índice (medido en F3); se mide también con 18 302 filas reales copiadas a una base temporal.
