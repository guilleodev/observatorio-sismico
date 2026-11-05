# Guía de validación: Ingesta real y calidad (F3)

Guía de ejecución y comprobación; los detalles de diseño están en [data-model.md](data-model.md), [research.md](research.md) y
[contracts/](contracts/). Las salidas reales se guardan en `docs/evidencias/f3/`. Comandos desde la raíz, con Docker Desktop en marcha.

## Requisitos previos

Servicios arrancados (`docker compose up --build -d --wait`) y migración aplicada al volumen existente (no destructiva):

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/002_esquema_f3.sql'
```

## 1. Ingesta periódica en modo seco (3.2)
Con `INGESTA_PUBLICAR=false`, esperar 3–5 minutos. **Esperado**: filas nuevas en `live.consulta_extraccion` (una por ciclo, ≈60 s entre inicios), `resultado = 'ok'`,
`eventos` ≈ 200–250; copias en `live.respuesta_original` solo cuando cambia el contenido; **ningún mensaje en Kafka** y 0 filas de eventos en `live`. Medir y anotar tamaño y latencia.

## 2. Activación y solo versiones nuevas (tras 3.5)
Con el consumidor definitivo desplegado y las tablas de eventos vacías, activar `INGESTA_PUBLICAR=true` y comparar el recuento de `live.version_publicada` entre ciclos. **Esperado**: no crece con las versiones ya publicadas; `evento_actual`
tiene una fila por evento y `evento_version` una por `(id, updated)`.

## 3. Historial y revisiones (3.3)
Pruebas de integración en transacción revertida: nuevo, repetido, posterior, antiguo. **Esperado**: `evento_actual` = posterior;
`evento_version` = las tres; sin duplicados.

## 4. Calidad y cuarentena (3.5)
Casos preparados (explosión, coordenadas inválidas, JSON ilegible, `mag` nula, `mag = 0`, profundidad negativa, reclasificación),
en transacción revertida. **Esperado**: ver tabla de aceptación en [spec.md](spec.md) (historia 3); `live.cuarentena` solo recibe lo
que corresponde y nada de lo ficticio queda en las tablas definitivas.

## 5. Estado de ingesta (3.6)
`GET /api/salud` y `/api/eventos`. **Esperado**: `last_ingestion` coincide con la última consulta correcta; si se corta la red de USGS
(o se prueba con el servidor simulado) no avanza; vuelve a avanzar al recuperarse.
Retención: `kafka-configs.sh --describe` (24 h / 100 MiB / 6 h) y purga: respuestas con más de 3 días y consultas con más de 30 días
no existen tras un ciclo.

## 6. Fallos y recuperación (3.7)
Reiniciar `consumer`, `producer`, `kafka` y `postgres` por separado (sin `down -v`). **Esperado**: sin duplicados ni versiones perdidas;
lag del grupo vuelve a 0; el productor reanuda sin republicar lo ya publicado; con la base parada, el consumidor no confirma y
guarda al volver.

## Consulta de reconciliación
Versiones publicadas sin versión guardada ni cuarentena (**debe devolver 0 filas** tras cada prueba de recuperación y antes de recrear Kafka):

```sql
SELECT p.event_id, p.updated_ms FROM live.version_publicada p
WHERE NOT EXISTS (SELECT 1 FROM live.evento_version v WHERE v.event_id = p.event_id AND v.updated_at = to_timestamp(p.updated_ms / 1000.0))
  AND NOT EXISTS (SELECT 1 FROM live.cuarentena c WHERE c.event_id = p.event_id AND c.updated_ms = p.updated_ms);
```

## 7. Aislamiento
**Esperado**: 0 filas con `mode` distinto de `live`; 0 referencias al esquema `sintetico` en el código; el esquema `sintetico` conserva
sus 18 filas del MVP.

## 8. Conservación tras 24 h (SC-010, pendiente de observación)
Con el sistema activo más de 24 h, contar los eventos anteriores a 24 h que siguen almacenados. **Esperado**: ninguno borrado. Hasta entonces, SC-010 figura como pendiente.

## Hueco superior a 24 h
Documentar (no ejecutar): si el productor estuvo parado más de 24 h faltan los eventos que salieron de la ventana; se recuperan con el
catálogo histórico de USGS (F4).
