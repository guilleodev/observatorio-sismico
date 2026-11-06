# Investigación y decisiones: Ingesta real y calidad de datos (F3)

Cada decisión indica el requisito del profesor **[P]** o la recomendación propia **[R]**. Las marcadas **(aprobación)** requieren
la conformidad de la persona estudiante (ver [plan.md](plan.md)).

## R-001 — Estado de publicación en PostgreSQL (aprobación D1)

- **Requisito [P]**: `ENUNCIADO.md` §5.3 pide comparar `id` y `updated` «con el estado persistente», omitir versiones ya publicadas
  y (§5.5) marcar una versión como publicada solo tras la confirmación de Kafka.
- **Decisión**: el productor consulta y escribe en PostgreSQL la tabla `live.version_publicada` `(event_id, updated_ms)`. Por
  cada respuesta carga de una vez el **máximo `updated_ms` publicado** de los ids recibidos y publica el evento si es desconocido o si su
  `updated` es **mayor** (FAQ 10: ni la misma versión ni una anterior); tras la confirmación de cada mensaje inserta la versión. Si el proceso cae entre ambas operaciones se reenvía y el consumidor lo tolera (§5.5).
- **Por qué**: sobrevive a reinicios y no añade servicios. **Coste**: el productor depende de la base.
- **Alternativas**: archivo local (se pierde sin volumen y no es consultable); estado en memoria (incumple «persistente»);
  que el consumidor devuelva un acuse por Kafka (más piezas y bucles).

## R-002 — Consulta HTTP sin dependencias nuevas

- **Decisión**: `urllib.request` dentro de `asyncio.to_thread`, con tiempo máximo de 20 s, cabecera `User-Agent` genérica y
  `Accept: application/json`. `gzip` y `hashlib` de la biblioteca estándar para comprimir y comparar.
- **Por qué [R]**: simplicidad (principio VII); no se necesita HTTP asíncrono para una consulta por minuto.
- **Alternativas**: `httpx`/`aiohttp` (dependencia nueva sin necesidad).

## R-003 — Ciclo y reintentos [P] §5.6

- **Decisión**: intervalo de 60 s entre **inicios** de ciclo, sin solapar (si un ciclo dura más, el siguiente empieza al
  terminar). Dentro de un ciclo, hasta 3 reintentos con esperas de 5, 10 y 20 s; con `429` se respeta `Retry-After`
  (máximo 60 s). Agotados, se registra el error, se mantiene el estado y se espera al ciclo siguiente.
- **Errores tratados**: tiempo agotado, errores de red, `429`, `5xx`, cuerpo que no es JSON, JSON sin `FeatureCollection`
  o sin `features` de lista. Un `4xx` distinto de `429` no se reintenta.
- **Por qué**: cumple espera progresiva sin retrasar indefinidamente el siguiente ciclo ni insistir a un origen caído.

## R-004 — Conservar el original y registrar las consultas [P] §5.2

- **Decisión**: cada ciclo inserta una fila en `consulta_extraccion` (resultado, HTTP, duración, bytes, recuento). La respuesta
  completa se guarda **comprimida** en `respuesta_original` solo si el hash del contenido de `features` cambió respecto a la
  última copia (el hash se mantiene en `estado_ingesta`). Retención: 3 días para las copias y 30 días para el registro de
  consultas, con purga en cada ciclo. El **evento original de cada versión** se conserva siempre en `evento_version.raw`.
- **Por qué**: evita copias idénticas indefinidas y deja la trazabilidad completa. Estimación: el feed cambia varias veces por
  hora; comprimido ≈ decenas de KB por copia → del orden de decenas de MB en 3 días (se mide en el paso 3.2 y se ajusta).
- **Alternativas**: guardar cada respuesta (centenares de MB/día); no guardar la respuesta (incumple §5.2).

## R-005 — Filtro y validación en el consumidor [P] §4.1, §6

- **Decisión**: el productor publica toda versión nueva o revisada, sea cual sea su tipo; el consumidor clasifica cada mensaje:
  **válido** (terremoto íntegro), **excluido** (`type != earthquake`) o **inválido** (no tratable). Reglas de validez: JSON legible,
  `mode = live`, `source` admitido, `id` textual, `properties.time` y `updated` enteros (ms UTC), geometría `Point` con tres
  valores numéricos finitos, longitud en [−180, 180], latitud en [−90, 90]; `mag` ausente o numérica (nunca rellena con 0).
  `mag = 0` y profundidad negativa son válidas.
- **Por qué**: así el motivo de exclusión queda junto a la cuarentena y el productor se mantiene simple.

## R-006 — Versiones, estado actual y reclasificación (aprobación D2)

- **Requisito [P]**: §7: actualizar el estado actual «solo si es más reciente»; conservar la versión recibida sin sobrescribir
  una posterior; transacción y offset después de escribir.
- **Decisión**: en una transacción: (1) `INSERT … ON CONFLICT (event_id, updated_at) DO NOTHING` en `evento_version`; (2) si
  la versión era nueva, `INSERT … ON CONFLICT (event_id) DO UPDATE … WHERE EXCLUDED.updated_at > live.evento_actual.updated_at`.
  Mismo `updated` → gana lo almacenado.
- **Reclasificación**: si la versión más reciente es no sísmica, `evento_actual` pasa a `retirado = true` con ese `updated_at`
  (no se borra, para que una versión antigua tardía no lo reviva) y la API no lo devuelve. Una versión posterior de tipo
  `earthquake` lo reactiva. El historial y la exclusión se conservan.
- **Detalle**: al retirar, `evento_actual` toma el `updated_at` de la versión no sísmica y conserva el resto de columnas de la última versión válida; un evento no
  sísmico **nunca visto** no crea fila (solo cuarentena). La secuencia de revisiones de un evento es `evento_version` más sus registros de cuarentena.
- **Alternativa**: borrar de `evento_actual` (permitiría que una versión antigua tardía lo reinserte); ignorar el cambio
  de tipo (mostraría como terremoto lo que USGS ya no lo es).

## R-007 — Cuarentena única con categoría [R]

- **Decisión**: una tabla `cuarentena` con `categoria` (`excluido` | `invalido`), motivo, referencia al original (clave,
  `(topic, partición, offset)` y copia del contenido) y una `huella` única, idempotente ante reenvíos: `sha256` de categoría, motivo e identidad de la versión (`event_id|updated_ms`
  si son legibles; si no, del evento canónico o, si ni eso se lee, del contenido completo). Así un reenvío con otro
  `ingested_at` no crea otra fila (§7: el recuento no aumenta).
- **Por qué**: FAQ (cuarentena duradera con motivo y original) y simplicidad; los offsets no son únicos si se recrea Kafka,
  por eso se guarda también el contenido.
- **Alternativa**: dos tablas (más SQL y consultas para el mismo contenido).

## R-008 — `last_ingestion` y estado de ingesta [P] contrato API

- **Decisión**: una fila `estado_ingesta` (id = 1) con el instante de la última consulta **correcta** (respuesta recibida y
  `FeatureCollection` válida), el último error y los contadores. La API lo devuelve como `last_ingestion` en milisegundos
  (`null` si no hay). No avanza con consultas fallidas. Que la respuesta esté vacía de eventos sigue siendo una consulta correcta.
- **Por qué**: distingue «la API responde» de «los datos están al día»; el valor se calcula al terminar de recibir la respuesta,
  antes de publicar (los fallos de publicación se ven en `ultimo_error`).

## R-009 — Origen admitido y datos dañados de prueba (aprobación D3)

- **Requisito [P]**: §6: los casos de prueba artificialmente dañados se separan e identifican; §11: coordenadas inválidas →
  cuarentena.
- **Decisión**: el consumidor solo procesa `source = usgs-all-day`; cualquier otro origen se descarta con motivo. Los casos
  dañados se ejecutan con el código del consumidor sobre una conexión cuya transacción se revierte (pruebas de integración) y se
  documentan con resultados antes/después en las evidencias, sin publicarlos en el topic real ni escribirlos en tablas definitivas.
- **Por qué**: coherente con «no insertar datos ficticios en las tablas definitivas» (principio III).
- **Alternativa**: topic y esquema de pruebas paralelos (infraestructura adicional); publicar con `source = prueba` en el
  topic real (riesgo de mezcla).

## R-010 — Volumen persistente para Kafka (aprobación D4)

- **Observado**: tras `docker compose down` el contenedor de Kafka se recrea y se pierden mensajes y offsets del grupo; los offsets
  vuelven a 0 (incidencia del MVP). **Causa real (comprobada en el paso 3.6)**: el broker escribía en `/tmp/kafka-logs`, dentro del contenedor y
  fuera de cualquier volumen; el volumen anónimo de `/var/lib/kafka/data` que declara la imagen estaba vacío.
- **Decisión (aprobada y aplicada)**: volumen con nombre `kafkadata` en `/var/lib/kafka/data` **más `KAFKA_LOG_DIRS=/var/lib/kafka/data`** (sin la variable el volumen no se usa). **Efecto**: se conservan mensajes (dentro de
  la retención de 24 h/100 MiB) y offsets entre paradas; los datos del volumen anónimo antiguo no se migran (ya están en PostgreSQL).
- **Por qué [P]**: `ENUNCIADO.md` §9 pide «volúmenes persistentes para los datos y una retención limitada de Kafka».
- **Alternativa**: dejarlo como está y documentar que la terna `(topic, partición, offset)` no es única entre recreaciones.

## R-016 — Reconciliación y riesgo de pérdida por retención de Kafka

- **Riesgo**: una vez activa la publicación, si el consumidor está parado más de 24 h (o se recrea Kafka sin volumen persistente) los mensajes expiran o se pierden mientras
  `version_publicada` ya los da por publicados.
- **Decisión**: una **consulta de reconciliación** (en `quickstart.md`) lista las versiones publicadas sin versión guardada ni cuarentena; debe estar vacía tras cada prueba de
  recuperación y antes de recrear Kafka (T036). Si no lo está, se recupera con el catálogo histórico (F4), como el hueco de más de 24 h (R-013).

## R-011 — Migración aplicable a mano sin borrar datos [R]

- **Decisión**: `sql/002_esquema_f3.sql` con `CREATE … IF NOT EXISTS` y `ADD COLUMN IF NOT EXISTS`, idempotente. En un volumen
  nuevo lo ejecuta PostgreSQL después de `001`; en el existente se aplica con `psql -f`. `001_esquema_live.sql` no se reescribe.
- **Por qué**: el MVP enseñó que los scripts de `sql/` solo se ejecutan al crear el volumen.

## R-012 — Reproducibilidad y pruebas de fallos

- **Decisión**: la URL de USGS es configurable (`USGS_URL`, por defecto la real). Los fallos de USGS (timeout, 429, 5xx, JSON
  inválido) se prueban con un servidor HTTP local dentro de `pytest`, sin Kafka ni PostgreSQL. Las pruebas extremo a extremo
  usan el feed real y caídas reales de servicios; no se publican eventos ficticios en el topic real.
- **Por qué**: las pruebas de resiliencia no necesitan datos falsos y se mantiene `live` limpio.

## R-013 — Limitaciones declaradas [P] §5

- **Eliminaciones**: salir de la ventana de 24 h no equivale a eliminación; no se implementa la reconciliación de eventos
  eliminados o fusionados fuera del feed (ampliación; se documenta).
- **Hueco > 24 h**: se recupera con el catálogo histórico (F4); aquí solo se documenta el procedimiento.
- **Un usuario de base de datos** para todos los servicios (roles separados en F6).

## R-015 — Modo seco del productor hasta tener el consumidor definitivo (aprobada en la revisión de coherencia)

- **Problema**: al publicar en `terremotos.live` durante el paso 3.2, el consumidor del paso 3.1 guardaría en `evento_actual` explosiones y registros
  inválidos sin historial, y, si estuviera parado más de 24 h, la retención de Kafka (24 h) borraría mensajes que `version_publicada` ya da por publicados.
- **Decisión**: variable `INGESTA_PUBLICAR` (por defecto `false`). En modo seco el productor consulta, registra y conserva la respuesta, pero **no publica ni marca versiones
  como publicadas**. Se activa (`true`) en la tarea T026, cuando el consumidor definitivo está desplegado y las tablas de eventos están vacías.
- **Por qué**: ningún evento real se procesa a medias y no se pierden versiones; permite medir tamaño y latencia reales de USGS desde el paso 3.2.
- **Alternativas**: parar el consumidor (no protege de la pérdida por retención); publicar a otro topic (marcaría versiones como publicadas sin consumirlas).

## R-014 — Comportamiento del productor sin PostgreSQL o sin Kafka [R]

- **Decisión**: sin PostgreSQL el productor **no publica** (no puede conocer qué versiones ya están publicadas), registra el error en el
  log y reintenta en el ciclo siguiente. Sin Kafka, las versiones **no se marcan publicadas** y se reenvían cuando vuelve; el consumidor
  tolera los reenvíos (§5.5). En ambos casos el último estado válido no se borra.
- **Por qué**: evita republicar toda la ventana a ciegas y mantiene la regla «publicada solo tras confirmación».
- **Alternativa**: publicar sin estado (un aluvión de reenvíos tolerados, pero innecesario).

## Trazabilidad con el enunciado

| Requisito | Dónde se cubre |
|---|---|
| §4.1 filtro `earthquake`, motivo de exclusión | R-005, R-007, FR-012 |
| §5.1 variables de entorno | R-002, R-003, [plan.md](plan.md) |
| §5.2 original, metadatos, retención, registro | R-004 |
| §5.3–5.5 estado persistente, clave, confirmación | R-001 |
| §5.6 timeouts, 429/5xx, JSON, reintentos | R-003 |
| §6 calidad, cuarentena, nulos, separación de pruebas | R-005, R-007, R-009 |
| §7 versiones y transacción | R-006 |
| §9 volúmenes y retención de Kafka | R-010 |
| §11 pruebas de aceptación | [quickstart.md](quickstart.md) |
