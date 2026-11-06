# Tareas: Ingesta real y calidad de datos (F3)

**Entrada**: documentos de `specs/002-ingesta-real-calidad/` (spec, plan, research, data-model, contracts, quickstart)
**Requisitos previos**: `plan.md`, `spec.md`. Fase **F3** de `docs/HOJA-DE-RUTA.md` (pasos 3.2 a 3.7). Commit previsto: **`[F3]`**.
**Pruebas**: se escriben antes de implementar (deben fallar) y se ejecutan con resultado real guardado en `docs/evidencias/f3/`.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias)
- **[Historia]**: US1 a US5 de la especificación
- Las rutas son relativas a la raíz del repositorio

## Reglas transversales (aplican a todas las tareas)

- No hacer commits ni push: el commit de cierre **`[F3]`** lo realiza manualmente la persona estudiante desde VS Code.
- No marcar una verificación como superada sin ejecutarla; guardar la salida real en `docs/evidencias/f3/`. Los tiempos y recuentos se
  anotan tal como se observan, aunque no cumplan el objetivo.
- **Datos**: no insertar eventos ficticios ni dañados en las tablas definitivas (`live.*`); las pruebas con PostgreSQL usan una
  transacción que se revierte. No borrar volúmenes ni datos (sin `down -v`); una operación destructiva se consulta antes.
- **Orden de activación (R-015)**: hasta que el consumidor definitivo (clasificación, versiones y cuarentena) esté desplegado, el productor
  trabaja en **modo seco** (`INGESTA_PUBLICAR=false`): consulta, registra y conserva, pero **no publica en Kafka ni marca versiones como
  publicadas**. Así ningún evento real se procesa a medias ni se pierde por la retención del transporte. La publicación real se activa en T026.
- No modificar `docs/referencias/`, `specs/001-mvp-evento-sintetico/` ni los archivos de Angular.
- Al cerrar cada paso: resumir archivos, explicar el código por bloques, justificar decisiones y proponer una pregunta de defensa (`CLAUDE.md`).
- Python 3.13; sin dependencias nuevas (R-002); tests en `backend/tests/unit/` (importan `fixtures.mensajes` solo para formar mensajes de prueba).
- Terminología: «estado actual» = la tabla `evento_actual` (una fila por evento); `*_ms` = milisegundos Unix UTC; `*_at` = `timestamptz`.

## Aprobaciones previas (decisiones de `plan.md`)

| Decisión | Afecta a | Si no se aprueba |
|---|---|---|
| **D1** el productor accede a PostgreSQL | T005, T008, T010–T012 | Rediseñar el estado de publicación antes de empezar el paso 3.2 |
| **D2** reclasificación → `retirado` | T002, T020, T022 | El evento reclasificado no se retira (documentar la limitación) |
| **D3** solo `source = usgs-all-day`; dañados solo en transacciones revertidas | T019, T021, T025 | Definir un canal de pruebas aparte |
| **D4** volumen persistente de Kafka | T036 | Dejar el volumen anónimo y documentar la trazabilidad no única |

## Correspondencia con los pasos de la hoja de ruta

| Paso | Tareas | Hito técnico |
|---|---|---|
| 3.2 Consultas periódicas a USGS (modo seco) | T001–T013 | Ingesta en modo seco |
| 3.3 Duplicados y versiones | T014–T016 | Historial y estado actual |
| 3.4 Transacciones, offsets e idempotencia | T017–T018 | Historial y estado actual |
| 3.5 Validación y cuarentena (incluye la activación de la publicación real y las verificaciones con datos reales de 3.3 y 3.4) | T019–T029 | Calidad y cuarentena |
| 3.6 Estado de ingesta y retención | T030–T036 | Estado y retención |
| 3.7 Fallos, reinicios y recuperación (y cierre) | T037–T048 | Resiliencia |

Cada tarea tiene un único paso principal; las dependencias entre pasos se indican en la sección «Dependencias». Los pasos 3.3 y 3.4 se
validan primero con pruebas en transacciones revertidas; sus comprobaciones con datos reales (T027 y T028) solo pueden hacerse tras la activación (T026).

---

## Bloque 1: Preparación y base de datos — paso 3.2

**Propósito**: entorno comprobado, migración aplicada y configuración lista.

- [x] T001 Comprobar el entorno: Docker Desktop, `docker compose ps` con los cinco servicios `healthy`, `git status`; confirmar por escrito la
  aprobación de D1 a D4 (las tareas condicionadas no empiezan sin ella)
- [x] T002 [P] Crear `sql/002_esquema_f3.sql`, idempotente (`CREATE … IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, fila inicial de
  `estado_ingesta` con `ON CONFLICT DO NOTHING`), exactamente según `data-model.md`: `live.evento_actual` + `retirado boolean NOT NULL
  DEFAULT false`; `live.evento_version` con **PK `(event_id, updated_at)`**, `raw jsonb NOT NULL`, mismos rangos de coordenadas;
  `live.version_publicada` con **PK `(event_id, updated_ms)`**; `live.consulta_extraccion` con `resultado text CHECK IN ('ok','error')`;
  `live.respuesta_original` con `consulta_id` PK y FK, `contenido_gz bytea NOT NULL`; `live.cuarentena` con `categoria text CHECK IN
  ('excluido','invalido')`, `payload bytea NOT NULL`, `huella text NOT NULL UNIQUE`; `live.estado_ingesta` con `id smallint
  PRIMARY KEY CHECK (id = 1)`; e índices `(iniciada_at)`, `(creada_at)`, `(categoria, motivo)` y el parcial `(event_time) WHERE NOT retirado`
- [x] T003 Aplicar `sql/002_esquema_f3.sql` al volumen existente con `psql -f` (comando del `quickstart.md`); comprobar con `\d` cada tabla y sus
  restricciones, re-aplicarlo (idempotente), y que `sintetico.evento_actual` sigue con 18 filas (misma huella md5) y `live.evento_actual` con 0;
  guardar salida en `docs/evidencias/f3/3.2-migracion.txt`
- [x] T004 [P] Ampliar `backend/src/observatorio/config.py` con `ConfigIngesta` (`USGS_URL`, `USGS_INTERVAL_S`=60, `USGS_TIMEOUT_S`=20,
  `USGS_MAX_REINTENTOS`=3, `RETENCION_RESPUESTAS_DIAS`=3, `RETENCION_CONSULTAS_DIAS`=30 y **`INGESTA_PUBLICAR`** booleana, por defecto `false`) con errores
  claros si falta o es inválida una variable, y su prueba en `backend/tests/unit/test_config.py`; añadir también la constante `SOURCE_ADMITIDO = "usgs-all-day"` (la dirección de Kafka y el topic ya los lee `ConfigKafka`, FR-001)
- [x] T005 [P] Actualizar `.env.example` y `compose.yaml`: variables nuevas, URL real de USGS por defecto, **`INGESTA_PUBLICAR=false`**, y el servicio `producer` con
  `POSTGRES_*` y `depends_on` de `postgres` con `condition: service_healthy` (D1); validar con `docker compose --env-file .env.example config`

---

## Bloque 2: Historia 1 — Consulta periódica a USGS en modo seco (US1, P1) 🎯 — paso 3.2

**Objetivo**: el productor consulta cada 60 s, registra y conserva el original; la publicación real se activa más tarde (T026).

**Prueba independiente**: quickstart paso 1.

### Pruebas de la Historia 1 (escribir primero; deben fallar)

- [x] T006 [P] [US1] `backend/tests/unit/test_usgs.py` con un servidor HTTP local en un hilo: respuesta correcta, tiempo agotado, `429` con
  `Retry-After` (espera máxima de 60 s), `503`, cuerpo que no es JSON, JSON sin `FeatureCollection`/`features`; hasta 3 reintentos con esperas 5/10/20 s (el tiempo
  de espera se inyecta en la prueba), un `4xx` distinto de `429` no se reintenta
- [x] T007 [P] [US1] `backend/tests/unit/test_ingesta.py` con repositorio y publicador simulados: **en modo seco no se publica ni se marca nada** pero la consulta se registra y la copia se
  conserva; en modo de publicación solo se publican eventos desconocidos y revisiones con `updated` mayor que el máximo publicado (ni igual ni anterior, FAQ 10) y se marcan **solo tras la confirmación**; si publicar falla no se marca y el estado válido anterior se conserva;
  la copia de la respuesta se guarda solo si cambia el hash de `features`; la consulta se registra con resultado `ok` o `error`
- [x] T008 [P] [US1] `backend/tests/unit/test_productor_repositorio.py` (PostgreSQL real, transacción revertida): consultar el máximo `updated_ms` publicado por evento con
  `event_id = ANY(...)`, insertar publicadas de forma idempotente, registrar consulta, guardar respuesta comprimida, actualizar `estado_ingesta`

### Implementación de la Historia 1

- [x] T009 [US1] `backend/src/observatorio/producer/usgs.py`: consulta con `urllib` en `asyncio.to_thread`, tiempo máximo de `USGS_TIMEOUT_S`, reintentos y
  clasificación de errores según R-003; devuelve el cuerpo y metadatos (HTTP, duración, bytes) o un error tipado
- [x] T010 [US1] `backend/src/observatorio/producer/repositorio.py` (D1): acceso a `version_publicada`, `consulta_extraccion`, `respuesta_original` (gzip,
  hash de `features`) y `estado_ingesta`, con psycopg y transacciones cortas
- [x] T011 [US1] `backend/src/observatorio/producer/ingesta.py`: un ciclo completo (consultar → registrar → conservar si cambió → **si `INGESTA_PUBLICAR`**: publicar los eventos desconocidos y las revisiones con `updated` **mayor que el máximo ya publicado** del evento
  —ni la misma versión ni una anterior—, con confirmación, y marcar publicadas), con el mensaje de `contracts/mensaje-kafka.md` (`source = usgs-all-day`, `mode = live`, `ingested_at`)
- [x] T012 [US1] `backend/src/observatorio/producer/main.py`: bucle con intervalo de 60 s entre inicios sin solapar, conexión a Kafka y PostgreSQL con
  reintentos, marca de salud, parada limpia y errores registrados sin matar el servicio; registra al arrancar si trabaja en modo seco
- [x] T013 [US1] Reconstruir y reiniciar solo `producer` **en modo seco**; dejarlo 5 min; **medir y anotar el tamaño y la latencia reales de la respuesta de USGS** (pendiente de F1),
  las filas de `consulta_extraccion` (≈ 60 s entre inicios) y las copias de `respuesta_original`; **comprobar que no se publica nada** (`terremotos.live` sin mensajes nuevos,
  `version_publicada` y los datos de eventos de `live` en 0 filas); anotar que en modo seco `last_ingestion` avanza con consultas correctas aunque la API devuelva 0 eventos (válido según el contrato, pero aún no hay datos); guardar en `docs/evidencias/f3/3.2-ingesta.txt`

**Punto de control del paso 3.2.** Explicar `usgs.py`, `ingesta.py` y el modo seco; pregunta de defensa. **Detenerse para la revisión humana.**

---

## Bloque 3: Historia 2 — Historial de versiones y estado actual sin duplicados (US2, P1) — pasos 3.3 y 3.4

**Objetivo**: cada evento tiene una versión actual, el historial se conserva y los reenvíos no cambian los recuentos.

**Prueba independiente**: quickstart pasos 3 y 6 (con datos reales, tras T026).

### Paso 3.3 — duplicados y versiones

- [x] T014 [P] [US2] `backend/tests/unit/test_consumidor_version.py` (PostgreSQL real, transacción revertida): nuevo, repetido, posterior, antiguo tardío y mismo
  `updated`; **retirada por reclasificación y reactivación (D2) a nivel de repositorio** (adelantada desde T022 a petición expresa de la persona estudiante); recuentos de `evento_actual` y `evento_version` en cada caso (§11 del enunciado); **`event_time`, `updated_at` e `ingested_at` se guardan
  separados, en UTC y coinciden con los milisegundos recibidos, y `raw` conserva el original sin transformar (FR-003, FR-011)**
- [x] T015 [US2] `backend/src/observatorio/consumer/repositorio.py`: `guardar_version` en una transacción: `INSERT … ON CONFLICT (event_id, updated_at) DO NOTHING`
  en `evento_version` y, si la versión era nueva, `INSERT … ON CONFLICT (event_id) DO UPDATE … WHERE EXCLUDED.updated_at > live.evento_actual.updated_at`
  con `retirado = false`; devuelve «guardada», «antigua» o «duplicada»; incluye `retirar_evento` (`UPDATE … SET retirado = true` solo si el `updated` recibido es mayor)
- [x] T016 [US2] `backend/src/observatorio/consumer/main.py`: `procesar_registro` usa `guardar_version` y registra los resultados; el offset sigue confirmándose solo después; ejecutar T014 y las
  pruebas existentes del consumidor y guardar el resultado en `docs/evidencias/f3/3.3-versiones.txt`

### Paso 3.4 — transacciones, offsets e idempotencia

- [x] T017 [P] [US2] `backend/tests/unit/test_consumidor_reintentos.py` (casos nuevos; las pruebas de offset tras guardar, fallo sin confirmar y repetido ya están en `test_consumidor_flujo.py`): «antigua» y «duplicada» confirman el offset; versiones fuera de orden;
  fallo de PostgreSQL o de Kafka (confirmación) con reintento del MISMO registro, espera progresiva con tope y sin saltar offsets. Implementación: `procesar_con_reintentos` y `ConexionPostgres` en `consumer/main.py`
- [x] T018 [US2] Prueba de atomicidad con PostgreSQL real (transacción revertida) en `backend/tests/unit/test_consumidor_transaccional.py`: forzar un error en la segunda sentencia de `guardar_version` y comprobar que no
  queda la versión huérfana en `evento_version`; reentrega, desorden y fallo de confirmación; **además** verificación con Kafka y PostgreSQL reales en una base, un tema y un grupo temporales (rollback, offset sin confirmar, reentrega);
  guardar en `docs/evidencias/f3/3.4-atomicidad.txt` y `3.4-atomicidad-real.txt`

**Punto de control de los pasos 3.3 y 3.4.** Explicar `guardar_version`, la comparación por `updated` y la confirmación del offset; pregunta de defensa. Las comprobaciones con datos reales
quedan en T027 y T028 (tras la activación).

---

## Bloque 4: Historia 3 — Calidad, cuarentena y activación de la publicación real (US3, P2) — paso 3.5

**Objetivo**: lo no sísmico y lo no tratable no contamina los datos; solo entonces se activa la publicación real.

**Prueba independiente**: quickstart pasos 4 y 2.

### Pruebas de la Historia 3 (escribir primero; deben fallar)

- [x] T019 [P] [US3] `backend/tests/unit/test_mensaje_calidad.py` (sin base de datos): clasificación **válido / excluido / inválido**: `explosion` → excluido con motivo;
  latitud 145, no finita, geometría que no es `Point`, dos valores, `time`/`updated` no enteros, `id` ausente, JSON ilegible y `source` distinto de `usgs-all-day` (D3)
  → inválido con motivo (salvo `source`, `mode` no `live` y `replay`, que se **descartan** sin cuarentena: no son datos de USGS live, R-009); `NaN`/`Infinity`, `properties.type` ausente y propiedades de texto con otro tipo → inválido; `mag` nula, `mag = 0` y profundidad negativa → válido; nunca se rellena un nulo con 0
- [x] T020 [P] [US3] `backend/tests/unit/test_cuarentena.py` (PostgreSQL real, transacción revertida): excluido e inválido → `cuarentena` con categoría, motivo, referencia y
  copia del contenido; reenvío del mismo evento y versión, **aunque cambie `ingested_at`** = una sola fila (`huella` única, R-007); flujo `procesar_registro` con simulados: el offset se confirma tras cuarentena y exclusión y un JSON ilegible no bloquea la cola (FR-014) en `backend/tests/unit/test_consumidor_flujo.py`; una versión inválida no sustituye a la actual; coordenadas 145° → 0 puntos; reclasificación a no sísmico →
  `retirado = true` y una versión posterior `earthquake` lo reactiva (D2)

### Implementación de la Historia 3

- [x] T021 [US3] `backend/src/observatorio/consumer/mensaje.py`: función de clasificación con las reglas de R-005 (válido/excluido/inválido, motivo, `event_id` y `updated_ms` si
  se pudieron leer) y comprobación de `source` con `SOURCE_ADMITIDO` de `config.py` (D3)
- [x] T022 [US3] `backend/src/observatorio/consumer/repositorio.py`: `registrar_cuarentena` (`ON CONFLICT (huella) DO NOTHING`; la huella se calcula según R-007) y la conexión de `retirar_evento` (ya implementado en T015) a la clasificación «excluido»; ambos en la misma transacción (D2)
- [x] T023 [US3] `backend/src/observatorio/consumer/main.py`: las tres salidas (guardar, excluir, cuarentena) con confirmación del offset después y registro claro de cada una
- [x] T024 [US3] `backend/src/observatorio/api/repositorio.py` y `backend/tests/unit/test_api_eventos.py`: la consulta excluye `retirado = true`; prueba de que un evento retirado no
  aparece en `/api/eventos` y de que una magnitud nula se devuelve como `null` (el «ND» del mapa)
- [x] T025 [US3] Casos preparados (explosión, coordenadas inválidas, JSON ilegible, `mag` nula, `mag = 0`, profundidad negativa, reclasificación) ejecutados con el código del consumidor en
  una transacción revertida; documentar resultados **antes/después** y que los dañados quedan **separados e identificados** (ids `prueba-*`, con la misma fuente que el feed real; no se escriben en tablas definitivas; la verificación con Kafka y PostgreSQL reales usa una base, un tema y un grupo temporales) en `docs/evidencias/f3/3.5-calidad.txt`
- [x] T026 [US3] **Activar la publicación real (R-015).** Precondiciones: T014–T025 superadas y `live.evento_actual`, `evento_version` y `version_publicada` en 0 filas. Reconstruir `consumer` y `api` y comprobar
  que ejecutan la imagen nueva; relanzar `producer` con `INGESTA_PUBLICAR=true`. Comprobar en el primer ciclo: mensajes en `terremotos.live` con la clave y el JSON de `contracts/mensaje-kafka.md`; el consumidor
  clasifica (guarda terremotos, excluye lo no sísmico); 0 eventos no sísmicos o inválidos en `evento_actual`; lag 0; a partir del segundo ciclo solo se publican versiones nuevas. Guardar en `docs/evidencias/f3/3.5-activacion.txt`
- [x] T027 [US3] Verificación con datos reales de los pasos 3.3 y 3.4: comparar `evento_actual`, `evento_version` y `version_publicada` (una fila actual por evento, sin duplicados de `(event_id, updated_at)`, invariante
  versiones publicadas = guardadas + cuarentena con la **consulta de reconciliación** de `quickstart.md`, lag 0; si USGS no publica revisiones durante la ventana, la versión posterior y la antigua quedan cubiertas por T014); **medir SC-002**: instante `ingested_at` de un evento nuevo del feed frente a su primera aparición en `/api/eventos` (≤ 2 min); guardar en `docs/evidencias/f3/3.4-idempotencia.txt`
- [x] T028 [US3] Reenvío real: tomar un mensaje **ya presente en el topic** (no fabricado), republicarlo **5 veces** (SC-003) con `kafka-console-producer` (con `parse.key` y el id como clave) y comprobar que los recuentos no cambian y el lag vuelve a 0; guardar la salida
- [x] T029 [US3] Con datos reales: recuentos de `cuarentena` por categoría y motivo (explosiones y canteras reales del feed) y 0 de ellos en la API; **consultas de ejemplo de las seis dimensiones de calidad**
  (completitud por campo, unicidad, validez, consistencia, actualidad y exactitud con sus límites, FR-017); guardar en `docs/evidencias/f3/3.5-calidad-datos-reales.txt` (`3.5-calidad-real.txt` es la verificación con recursos temporales)

**Punto de control del paso 3.5.** Explicar las reglas de calidad, la cuarentena y el orden de activación; pregunta de defensa.

---

## Bloque 5: Historia 4 — Estado de ingesta y retención (US4, P2) — paso 3.6

**Objetivo**: saber cuándo fue la última ingesta correcta y mantener acotado lo que se retiene.

**Prueba independiente**: quickstart paso 5.

### Pruebas de la Historia 4 (escribir primero; deben fallar)

- [x] T030 [P] [US4] `backend/tests/unit/test_retencion.py` (PostgreSQL real, transacción revertida): se insertan filas antiguas de prueba, y la purga elimina respuestas
  originales con más de 3 días y consultas con más de 30 días, sin tocar versiones, estado actual ni cuarentena
- [x] T031 [P] [US4] Ampliar `backend/tests/unit/test_api_eventos.py`: `last_ingestion` es `null` sin consultas, toma el valor de `estado_ingesta` tras una consulta correcta y no
  avanza con consultas fallidas; `/api/salud` con el mismo valor y `503` si falla la base

### Implementación de la Historia 4

- [x] T032 [US4] `backend/src/observatorio/producer/repositorio.py` e `ingesta.py`: purga de `respuesta_original` y `consulta_extraccion` en cada ciclo según
  `RETENCION_RESPUESTAS_DIAS` y `RETENCION_CONSULTAS_DIAS`
- [x] T033 [US4] `backend/src/observatorio/api/repositorio.py`: `ultima_ingestion` lee `live.estado_ingesta` (milisegundos Unix UTC o `None`); sin datos provisionales
- [x] T034 [US4] Verificación real: `/api/salud` coincide con la última consulta `ok` de `consulta_extraccion`; provocar una caída REAL de USGS sin reiniciar el productor (añadiendo `earthquake.usgs.gov -> 127.0.0.1` al `/etc/hosts` del contenedor con `docker exec` como root y restaurándolo después; sin tocar datos), comprobar que `last_ingestion` no avanza y que `ultimo_error` se registra; restaurar el archivo y **contar los ciclos hasta la primera consulta correcta (SC-008: ≤ 3)**;
  guardar en `docs/evidencias/f3/3.6-estado-ingesta.txt`
- [x] T035 [US4] Comprobar la retención efectiva de Kafka (`kafka-configs.sh --describe`: 24 h, 100 MiB, segmento de 6 h) en `terremotos.live`; la purga de 3 y 30 días se verifica con T030 (en tiempo real solo se comprueba que el ciclo la ejecuta sin error); **medir con `EXPLAIN` el índice parcial
  `(event_time) WHERE NOT retirado`** frente a la consulta sin él y, si no aporta, retirarlo con un `DROP INDEX IF EXISTS` explícito añadido a `sql/002_esquema_f3.sql` y aplicado al volumen; guardar la salida
- [x] T036 [US4] **Condicionada a D4.** Si se aprueba: volumen con nombre `kafkadata` en `/var/lib/kafka/data` **y `KAFKA_LOG_DIRS=/var/lib/kafka/data`** en `compose.yaml` (sin esa variable el broker escribe en `/tmp/kafka-logs`, dentro del contenedor). **Consultar antes de ejecutar**: la primera
  recreación del contenedor pierde los mensajes del volumen anónimo. Precondición: **lag 0** y la consulta de reconciliación vacía (nada publicado sin guardar ni en cuarentena); si no, no se ejecuta. Después, `docker compose down` (sin `-v`) y `up`: los mensajes y los offsets del grupo se conservan;
  documentar el resultado. Si no se aprueba: documentar la limitación en `docs/evidencias/f3/3.6-estado-ingesta.txt`. **Resultado real (D4 aprobada):** se aplicó, pero la primera recreación del contenedor perdió los mensajes de prueba y del MVP ya procesados porque el broker no escribía en el volumen (incidencia en `3.6-kafka-persistencia.txt`); tras corregir `KAFKA_LOG_DIRS`, `docker compose down` y `up` conservan mensajes y offsets

**Punto de control del paso 3.6.** Explicar `estado_ingesta`, `last_ingestion` y las retenciones; pregunta de defensa.

---

## Bloque 6: Historia 5 — Fallos, reinicios y recuperación (US5, P3) — paso 3.7

**Objetivo**: demostrar la tolerancia a fallos sin duplicar ni perder versiones.

**Prueba independiente**: quickstart paso 6. **Invariante a comprobar tras cada prueba**: versiones publicadas = versiones guardadas + cuarentena, sin duplicados y con lag 0.

- [x] T037 [US5] Reinicio del consumidor **a mitad de procesamiento** (SC-007): `docker compose kill consumer` durante un ciclo que publica versiones, y `docker compose start consumer` (otra variante: `stop`, esperar versiones nuevas y `start`); **esperado**: el desfase pasa de > 0 a 0, sin duplicados **Resultado real (T048):** reinicio real entre mensajes (el kill no cayó en mitad de una transacción); la atomicidad guardar+offset se acredita con T018 y `3.4-atomicidad-real.txt`.
  ni versiones perdidas (invariante); guardar en `docs/evidencias/f3/3.7-recuperacion.txt`
- [x] T038 [US5] Reinicio del productor: `docker compose restart producer`; **esperado**: no republica versiones ya publicadas y los ciclos se reanudan
- [x] T039 [US5] PostgreSQL parado: **esperado** (R-014) el productor no publica sin conocer el estado, registra el error y reanuda al volver; el consumidor no confirma y guarda al
  recuperarse la base; sin duplicados
- [x] T040 [US5] Kafka parado: **esperado**: las versiones no se marcan publicadas, se reenvían al volver y el consumidor las tolera; sin pérdidas ni duplicados
- [x] T041 [P] [US5] Documentar en `docs/evidencias/f3/hueco-24h.md` (sin ejecutar) el procedimiento para un hueco superior a 24 h con el catálogo histórico (F4) y la limitación de las
  eliminaciones o fusiones fuera del feed (FR-022)
- [x] T042 [US5] Ejecución continua de 30 minutos (SC-001) **en una ventana sin paradas ni inyecciones de fallos** (se ejecuta antes de T037 o en un periodo posterior sin incidencias): al menos 28 de las 30 consultas esperadas registradas; guardar el recuento real
- [x] T043 [US5] `scripts/verificar-f3.ps1` (solo ASCII, repetible, sin `down -v`): encadena las comprobaciones de T037 a T040 y el invariante, y guarda la salida en
  `docs/evidencias/f3/verificacion-f3.txt`; ejecutarlo completo
- [ ] T044 [US5] **SC-010 — pendiente de observación real.** Con el sistema activo **más de 24 horas seguidas**, registrar el instante de activación (T026) como referencia y, pasadas 24 h, comprobar que hay eventos con `event_time` anterior a 24 h en `evento_actual` y `evento_version` (> 0) y que la
  consulta de reconciliación sigue vacía (ninguna versión publicada desapareció por salir de la ventana); las pruebas de fallos T034–T040 no borran datos y respetan ese reloj; guardar en `docs/evidencias/f3/sc-010-observacion-24h.txt`. **Hasta ejecutarla, SC-010 figura como «pendiente de
  observación» y no se declara cumplido**; el commit `[F3]` puede hacerse con esa anotación

---

## Bloque 7: Cierre y pulido — hito técnico «Resiliencia» (paso 3.7)

- [x] T045 [P] Registrar en `docs/evidencias/f3/resultados.md` el resultado **observado** de cada criterio de éxito (SC-001 a SC-012), con los incumplidos, las limitaciones y **SC-010 como pendiente
  mientras T044 no se haya ejecutado**
- [x] T046 [P] Actualizar `README.md` (ingesta real, modo seco, variables, migración manual de `002`) y marcar los pasos 3.2 a 3.7 en `docs/HOJA-DE-RUTA.md` solo si las pruebas son satisfactorias
- [x] T047 Comprobar el aislamiento final: 0 filas de modo distinto de `live` ni de `source` distinto de `usgs-all-day` en `live.*`, ninguna mención de `synthetic`/`sintetico` en `backend/src`, Kafka y PostgreSQL sin puertos publicados y el
  esquema `sintetico` intacto (18 filas, misma huella md5); guardar la salida
- [x] T048 Revisión final: Architect y QA Engineer, `git status` y `git diff --check`, comprobación contra la constitución, contraste con `ENUNCIADO.md` y `CONTRATO-API.md`; preparar la explicación
  por bloques y tres preguntas de defensa

**Punto de control del hito «Resiliencia» (cierre de F3)**: **detenerse**; revisión humana y commit manual **`[F3]`**.

---

## Dependencias y orden de ejecución

- **Bloque 1** → **Bloque 2** → **Bloque 3** → **Bloque 4** → **Bloque 5** → **Bloque 6** → **Bloque 7**.
- **La publicación real (T026) exige el consumidor definitivo**: T014–T025 antes de T026; T027–T029 tras T026. Hasta T026 el productor permanece en modo seco.
- Dentro del Bloque 1: T002 antes de T003; T004 y T005 en paralelo.
- Bloque 2: T006–T008 antes de T009–T012; T009 y T010 antes de T011; T011 antes de T012; T013 al final.
- Bloque 3: T014 antes de T015; T015 antes de T016; T017 independiente de T014; T018 tras T015.
- Bloque 4: T019 y T020 antes de T021 y T022; T024 depende de T002 (`retirado`); T025 tras T023; T026 tras T025; T027–T029 tras T026.
- Bloque 5: T030 y T031 antes de T032 y T033; T036 espera a la aprobación de D4.
- Bloque 6: T037–T040 requieren los Bloques 2–5 completos; T043 tras T037–T040; T042 puede ejecutarse antes de T037; T044 requiere ≥ 24 h de funcionamiento real desde T026.

### Oportunidades de paralelismo

- T002, T004 y T005; T006, T007 y T008; T014 y T017; T019 y T020; T030 y T031; T041; T045 y T046.

## Estrategia de implementación

1. Completar los Bloques 1–2 (paso 3.2) **en modo seco** y medir USGS real sin publicar.
2. Añadir versiones (3.3–3.4) y calidad (3.5) validados con transacciones revertidas; **activar la publicación real solo en T026** y verificar con datos reales.
3. Cerrar con el estado de ingesta (3.6) y la resiliencia (3.7); un commit `[F3]` al final de la fase, con SC-010 pendiente de observación si aún no han pasado 24 h.
4. No avanzar a F4 (geografía e histórico) sin autorización.

## Notas

- `[P]` = archivos distintos y sin dependencias.
- Cada tarea cita su ruta; si exige tocar otro archivo, justificarlo.
- La complejidad añadida (servicios o dependencias nuevas) requiere justificación por escrito en `plan.md`.
