# Evidencia: primera recuperación real de un hueco de ingesta (hueco #475)

Fecha de ejecución: 2026-11-10, 23:07 UTC (00:07 del 11-11, hora española). Procedimiento: [`procedimiento-hueco.md`](procedimiento-hueco.md). Hasta ahora la recuperación solo se había probado con un catálogo simulado; este es el primer hueco real.

## 1. El hueco

| Campo | Valor |
|---|---|
| id | 475 |
| Intervalo (UTC) | 2026-11-09 16:10:31.516 → 2026-11-09 23:49:21.966 (7 h 38 min 50 s) |
| Detectado | 2026-11-10 17:49:21.972 UTC, por el productor (`HUECO de ingesta anotado…`) |
| Estado antes | `pendiente` |

**Cómo se detectó.** Última consulta correcta antes de la parada: 2026-11-09 22:10:31 UTC. Primera tras ella: 2026-11-10 17:49:21 UTC. Separación de 19 h 38 min 50 s, mayor que 24 h − `HUECO_MARGEN_S` (6 h) = 18 h. Intervalo = (anterior − 6 h, ahora − 24 h + 6 h).

**Causa.** El equipo estuvo apagado (confirmado por la persona usuaria y contrastado con los registros): sin consultas, ni siquiera con error, entre esas dos horas; último consulta correcta a las 23:10 hora española del 9-11; último arranque de Windows a las 18:24 y arranque de los contenedores a las 18:49 hora española del 10-11. No fue un fallo de USGS (los únicos 3 errores de la historia son del 6-11, «Connection refused»).

## 2. Comprobaciones previas (todas correctas)

- `api`, `consumer`, `kafka`, `postgres` y `producer`: `healthy`.
- Lag de Kafka: `offset/final/lag = 1644/1644/0`.
- Hueco #475 `pendiente` (`--listar`).
- `scripts/f4/invariantes.sh antes-de-recuperar`: reconciliación 0, offsets duplicados 0, estado actual desfasado 0.
- Idempotencia (revisión de `consumer/destino.py`): las versiones se insertan con `ON CONFLICT (event_id, updated_at) DO NOTHING` y `evento_actual` solo avanza con `WHERE EXCLUDED.updated_at > evento_actual.updated_at`; la recuperación además omite lo ya guardado en `evento_version` o `cuarentena`.
- Aislamiento de REPRODUCCIÓN: la recuperación publica con `mode = live` en el topic en vivo; el destino `replay` usa topic, grupo y esquema propios y rechaza cualquier mensaje que no sea `mode = replay` con `run_id`.

## 3. Simulación (`--simular`, sin publicar ni modificar nada)

`hueco #475: encontrados=68 ya_guardados=59 a_publicar=9 … recuperado=False peticiones_http=2`

Las 9 versiones pertenecen a 8 eventos: 4 eventos nuevos (`uw714136791`, `uu80163871`, `uu80163876`, `us7000tx9s`) y 5 con una versión posterior (`uw714136731`, `ci41360263`, `ci41360255`, `ci41360279`, `ci41360335`). Los de Utah se publicaron en USGS con retraso mientras el equipo estaba apagado; `ci41360279`, `us7000tx9s` y `ci41360335` se revisaron o publicaron cuando ya tenían más de 24 h, fuera de la ventana del feed.

## 4. Ejecución real (una sola vez)

```bash
docker compose run --rm --no-deps producer python -m observatorio.recuperacion.recuperar
```

`hueco #475: encontrados=68 ya_guardados=59 publicados=9 sin_guardar_tras_espera=0 recuperado=True peticiones_http=2` (código de salida 0; 3 s).

## 5. Resultados reales

| Medida | Antes | Después | Diferencia |
|---|---|---|---|
| `live.version_publicada` | 1634 | 1643 | +9 (todas las de la recuperación) |
| `live.evento_version` | 1612 | 1620 | +8 |
| `live.cuarentena` | 22 | 23 | +1 |
| `live.evento_actual` | 1113 | 1116 | +3 (los 3 eventos nuevos sísmicos) |
| Offset / final / lag de Kafka | 1644 / 1644 / 0 | 1654 / 1654 / 0 (medido 1 min después, ver nota; los 9 mensajes de la recuperación ocupan los offsets 1644–1652) | lag 0 |
| `replay.evento_version` / `replay.evento_actual` | 111 / 105 | 111 / 105 | sin cambios |

Las cifras «después» son de una instantánea tomada justo tras la ejecución. Un minuto después, `invariantes.sh` ya mostraba una fila más (1644 publicadas, 1621 versiones, offset 1654, `evento_actual` +1 en el reparto geográfico) porque el productor en vivo siguió ingiriendo el feed con normalidad; no pertenece a la recuperación.

- **Publicadas = 9; guardadas = 8 + 1 en cuarentena.** `sin_guardar_tras_espera=0`. La novena versión (`uw714136791`, actualizada 2026-11-09 22:35:28 UTC) es de tipo `explosion` y, como cualquier evento no sísmico del feed, el consumidor la excluye: `live.cuarentena`, categoría `excluido`, motivo «tipo de evento no sísmico: 'explosion'».
- **Origen de lo recuperado:** `live.evento_version` tiene 8 filas con `source = usgs-fdsn-recuperacion` y `mode = live` (offsets Kafka 1644–1652, partición 0) y el resto `usgs-all-day`.
- **`evento_actual` cambió, solo adelantando versiones:** 3 eventos nuevos (`uu80163871`, `uu80163876`, `us7000tx9s`) y 5 eventos que avanzaron a su versión más reciente (`ci41360255` mag 0,86 → 0,95; `ci41360263` 1,82 → 0,58; `ci41360279` 1,36 → 1,07; `ci41360335` 0,39 → 0,36; `uw714136731` 1,35, versión de 22:18:37 a 22:18:44). Ninguna versión antigua sobrescribió a otra más reciente (`actual desfasado = 0`).
- **Hueco #475:** `estado = recuperado`, `recuperado_at = 2026-11-10 23:07:18.26 UTC`, `eventos_publicados = 9`. Pasó a `recuperado` en la misma ejecución, tras publicar las 9 versiones y confirmarse su guardado.

## 6. Invariantes tras la recuperación

`scripts/f4/invariantes.sh despues-de-recuperar` (2026-11-10T23:09:11Z):

- reconciliación = 0; offsets duplicados = 0; actual desfasado = 0; lag = 0.
- geo: incoherentes = 0.
- histórico (huellas md5 y sha256) y sintético: idénticos a «antes».
- servicios: los cinco `healthy`.

## 7. API y dashboard

- `GET /api/salud`: `status ok`, `database ok`, `stale false`, **`gaps_pending: 0`**.
- `GET /api/eventos`, `GET /api/estadisticas` y el dashboard: HTTP 200.
- En el dashboard desapareció la banda «Huecos de ingesta pendientes» y el estado muestra «Datos al día».

## 8. Limitaciones

- Solo se ha recuperado este hueco real; la detección usa un margen conservador de 6 h por lado, por lo que el intervalo (7 h 38 min) es más amplio que la parada real del equipo.
- La recuperación añadió versiones como histórico; no sustituyó ni borró ninguna fila.
- Hubo dos interrupciones anteriores de unas 19 h 51 min (5→6 nov) y 16 h 37 min (8→9 nov) y la secuencia `live.hueco_id_seq` está en 475 con una sola fila; no se ha investigado por qué no hay huecos anteriores registrados.
- Un evento (`uw714136791`) es una explosión y no cuenta como sísmico por diseño; los 8 restantes sí.
