# Modelo de datos: replay, integración y despliegue (F6)

Solo lo que cambia. `live`, `geo` e `historico` (F3 y F4) no se modifican; `historico.evento` se lee para elegir la selección.

## Esquema `replay` (nuevo, `sql/004_esquema_f6.sql`, aditivo e idempotente)

| Tabla | Grano y clave | Notas |
|---|---|---|
| `replay.ejecucion` | una por reproducción; `run_id` (PK) | `intervalo_desde`, `intervalo_hasta` (tiempo original de la selección), `tamano`, `criterio`, `dia`, `intervalo_s`, `velocidad` (aceleración), `iniciada_at`, `terminada_at`, `estado` (`en_curso`, `terminada`, `interrumpida`) |
| `replay.evento_actual` | una por `(run_id, event_id)` | Columnas de `live.evento_actual` (incluidos `country_id`, `country_name`, `geo_resultado`, `geo_catalogo`, `retirado`) más `run_id` (FK a `ejecucion`) y `caso` (nulo en eventos reales). `mode` con `CHECK (mode = 'replay')`; `source` con `CHECK (source = 'replay-historico')`; `country_id` referencia `geo.pais` |
| `replay.evento_version` | `(run_id, event_id, updated_at)` | Historial de versiones; mismas reglas |
| `replay.cuarentena` | `(run_id, huella)` única | Como `live.cuarentena` más `run_id`; la huella actual no incluye el run, por eso la unicidad es por ejecución y cada una conserva su registro |

- **Índices**: `(run_id, event_time)` en `evento_actual` para el filtro de periodo; los demás, los de las claves. Se medirán en 6.4–6.5 antes de añadir ninguno más.
- **Identidad y borrado**: nada se borra; cada ejecución conserva sus filas. La API muestra por defecto la más reciente.
- **Aislamiento**: ninguna clave foránea ni vista une `replay` con `live` o `historico`. El `CHECK` de `mode` impide a nivel de base mezclar con `live` (cuyo `CHECK` exige `live`).
- **Casos controlados** (`caso`): `duplicado` (su segundo mensaje se descarta como duplicada), `revision`, `antigua`, `magnitud_nula`, `coordenadas_invalidas` (va a cuarentena) y `maritimo`. Los seis tienen id propio `replay-ctl-<caso>`, copiado de un evento real que no se altera (R-004); son datos de demostración etiquetados (DG10).

## Transiciones de una ejecución

`en_curso` → `terminada`: lo escribe el **productor** al publicar y confirmar el último mensaje. Si se interrumpe, la ejecución queda `en_curso`; `--reanudar <run_id>` la marca
`interrumpida` y vuelve a publicar la selección completa con el mismo `run_id`; repetir mensajes ya procesados no cambia los recuentos.

## Esperado de una ejecución con 30 eventos y 6 casos

39 mensajes publicados (30 reales + 9 de los casos), 35 filas en `evento_actual`, 37 en `evento_version`, 1 en cuarentena y 1 duplicado descartado. Es el oráculo de SC-001.

## Respuesta de la API (aditiva; detalle en [contracts/f6.md](contracts/f6.md))

- `metadata.mode` = `replay` y `metadata.replay` = `{run_id, estado, tamano, velocidad, intervalo:{desde,hasta}, iniciada_at, terminada_at}`.
- `properties.caso` (nulo en reales) y `properties.replayed_at` (ms) en cada evento de replay; el panel muestra «caso controlado / sintético» cuando `caso` no es nulo.
- `comparacion` no aplicable (`comparacion_disponible: false`, motivo `no_aplica_en_reproduccion`).

## Configuración nueva (sin secretos; `.env.example`)

| Variable | Valor por defecto | Uso |
|---|---|---|
| `KAFKA_TOPIC_REPLAY` | `terremotos.replay` | topic del replay |
| `KAFKA_CONSUMER_GROUP_REPLAY` | `consumidor-replay` | grupo del consumidor de replay |
| `REPLAY_EVENTOS` | `30` | tamaño de la selección |
| `REPLAY_INTERVALO_S` | `2` | segundos entre mensajes |
| `REPLAY_ESPERA_FINAL_S` | `10` | inactividad, tras el primer mensaje procesado, tras la cual el consumidor de replay termina |
| `REPLAY_ESPERA_MAX_S` | `120` | tope de espera si no llega ningún mensaje |
| `BACKEND_IMAGE` | `observatorio-backend` | etiqueta de la imagen; el proyecto paralelo usa otra |
| `API_PUERTO` | `8000` | puerto del equipo donde se publica la API (solo `127.0.0.1`); permite el proyecto paralelo |
| `API_CORS_ORIGINS` | `http://localhost:4200` | ya existe: se amplía con el origen exacto de Netlify en `.env` local, sin comodines |

El authtoken de ngrok **no** es una variable de este proyecto: lo guarda la configuración de ngrok del equipo.

## Entidades de evidencia (no son tablas)

Prueba de aceptación, medida de rendimiento, punto de autorización y entrega verificable (ver [spec.md](spec.md)) viven en `docs/evidencias/f6/` como texto con la salida real.

## Estado en el navegador (no persistente)

`modoVista` (`live` o `replay`), `run` elegido y la lectura vigente de ese modo; al cambiar de modo se descarta la anterior.
