# Resultados de la fase F3 por criterio de éxito (T045)

> **Nota del 2026-11-17**: este documento recoge el estado de la fase en su fecha. Lo que figura aquí como pendiente o abierto se resolvió después o consta como reserva en el [Anexo C de la memoria](../../entrega/memoria.md#anexo-c--reservas-de-esta-memoria) y en la [matriz de trazabilidad](../../entrega/matriz-trazabilidad.md).

Resultado **observado** de cada criterio de `specs/002-ingesta-real-calidad/spec.md`. Solo se marca «cumplido» lo comprobado con evidencia.

| SC | Criterio | Resultado | Evidencia |
|----|----------|-----------|-----------|
| SC-001 | 28 de 30 consultas en 30 min | **Cumplido**: 30/30 correctas, separación 60,0 s | `3.7-ejecucion-continua.txt` |
| SC-002 | Evento nuevo visible en la API ≤ 2 min | **Cumplido con reserva**: 3 eventos reales, peor caso 2,9 s medido desde que el productor los ingiere; el retraso hasta la siguiente consulta (≤ 60 s) se suma y el total sigue < 2 min, pero la métrica no parte de la aparición en el feed y la muestra es pequeña | `sc-002-sondeo-api.txt`, `3.4-idempotencia.txt` |
| SC-003 | Reenviar 5 veces una versión no cambia recuentos | **Cumplido** (mensaje válido y no sísmico reales ×5) | `3.4-idempotencia.txt` |
| SC-004 | nuevo → posterior → antigua | **Cumplido** (pruebas y revisiones reales) | `3.3-versiones.txt`, `3.4-idempotencia.txt` |
| SC-005 | Coordenadas inválidas: 0 puntos y 1 cuarentena | **Cumplido** (transacciones revertidas) | `3.5-calidad.txt`, `3.5-pruebas.txt` |
| SC-006 | No `earthquake` excluido y fuera de la API | **Cumplido**: 8 en cuarentena, 0 en la API | `3.5-activacion.txt`, `3.5-calidad-datos-reales.txt` |
| SC-007 | Reinicio del consumidor: 0 duplicados, 0 perdidas, desfase a 0 | **Cumplido por reinicio real + pruebas de atomicidad**: el kill real se hizo entre mensajes (desfase 1 → 0, invariante cumplido); NO se capturó un kill en mitad de una transacción. La atomicidad guardar+offset se acredita con las pruebas transaccionales y `3.4-atomicidad-real.txt` (fallo de la 2.ª sentencia, no SIGKILL) | `verificacion-f3.txt` (T037), `3.4-atomicidad-real.txt`, `test_consumidor_transaccional.py` |
| SC-008 | Fallo del origen: estado conservado y recuperación ≤ 3 ciclos | **Cumplido** con un fallo **inyectado** (redirección en `/etc/hosts`, «connection refused»): recuperación en 1 ciclo. Las ramas HTTP 429/`Retry-After`, 5xx y timeout solo están cubiertas por pruebas unitarias (`test_usgs.py`, `test_ingesta.py`) | `3.6-estado-ingesta.txt` |
| SC-009 | `last_ingestion` = última consulta correcta | **Cumplido** (con el fallo inyectado anterior: no avanzó; recuperación: avanzó; `null` antes de la primera consulta, por pruebas) | `3.6-estado-ingesta.txt` |
| SC-010 | Conservación tras 24 h | **OBSERVADO el 2026-11-17** (solo lectura, desde F8): 1 905 eventos y 2 695 versiones con más de 24 h conservados (el más antiguo, del 2026-11-05), reconciliación 0; 4 huecos de ingesta recuperados anotados (ver T044) | `sc-010-observacion-24h.txt` |
| SC-011 | Retención de Kafka = política documentada | **Cumplido** (24 h / 100 MiB / 6 h) | `3.6-indices-y-retencion.txt` |
| SC-012 | 0 filas de modo ≠ `live` y 0 escrituras de pruebas | **Cumplido** | `3.7-aislamiento.txt` |

## Pruebas de fallos de 3.7 (T037–T040, `verificacion-f3.txt`)

Invariante tras cada prueba: publicadas = versiones guardadas + cuarentena (235 → 241 publicadas), reconciliación 0, 0 offsets duplicados, estado actual = versión más reciente, lag 0.

- **T037 consumidor** (`kill`): lag 1 con el consumidor caído → 0 al arrancar; invariante cumplido.
- **T038 productor** (`restart`): ciclos reanudados; 0 versiones nuevas publicadas y 0 mensajes nuevos en el topic (nada republicado).
- **T039 PostgreSQL parado ~3 min**: el consumidor no confirmó (offset 247 constante, lag 1); el productor no publicó (final del topic constante, error registrado); la API quedó `unhealthy` mientras no hubo base; todo se recuperó solo al volver.
- **T040 Kafka parado ~3 min**: «Fallo al publicar» real, publicadas sin cambio (240); al volver se reenvió 1 versión (final 250 → 251) y el offset del grupo se conservó.

## Revisión final T048 (independiente)

- **Architect: APTO CON RESERVAS** (sin hallazgos de severidad alta). **QA Engineer: APTO CON RESERVAS.** QA reejecutó la suite (193 pasan entonces) y comprobó la reconciliación (publicadas 248 = versiones 238 + cuarentena 10), 0 duplicados, lag 0 y 5 servicios `healthy`.
- **Hallazgo común y relevante (corregido): un registro con error PERMANENTE al guardar bloqueaba la partición** (`procesar_con_reintentos` reintentaba siempre). Corrección:
  1. `mensaje.py`: se rechazan como `invalido` los instantes fuera de rango (año 9999), los NUL y los sustitutos Unicode sueltos (`MAX_MS`, `_texto_almacenable`); un `updated` fuera de rango no se usa como referencia de cuarentena.
  2. `consumer/main.py`: `DataError`, `IntegrityError` y `UnicodeError` se tratan como permanentes → `aislar_error_permanente` (cuarentena `invalido` con motivo «error permanente de persistencia: <tipo>», original en `payload`, y offset confirmado). Si ni siquiera se puede aislar, se trata como transitorio. `OperationalError`/`InterfaceError` y los errores de Kafka siguen reintentándose.
  3. `repositorio.py`: la cuarentena elimina NUL del `event_id` y la clave (el original íntegro queda en `payload`).
  4. 12 pruebas nuevas en `test_errores_permanentes.py` (una con PostgreSQL real revertido). La primera ejecución cazó un fallo de mi propia validación del NUL (`json.dumps` lo escapa) y se corrigió. Suite completa: **205 pasan** (`3.7-pruebas.txt`). Consumidor reconstruido y recreado sin tocar volúmenes (`3.7-despliegue-correccion.txt`).
- **Matices aceptados** (documentados arriba): SC-002, SC-007, SC-008 y SC-009.
- **Riesgo residual de pérdida (Architect, media)**: `version_publicada` es una promesa: si Kafka perdiera mensajes publicados y aún no consumidos (consumidor parado > 24 h, o broker recreado sin volumen), el productor no los reenvía aunque el feed aún los tenga. Se detecta con la consulta de reconciliación; el procedimiento manual de recuperación está en `hueco-24h.md`. Con retención de 24 h, un consumidor parado más de 24 h pierde mensajes: límite conocido.
- **Reserva de QA sobre Kafka**: la mitigación de 3.6 se demostró con `down`/`up` (sin `-v`) sobre un tema temporal con `KAFKA_LOG_DIRS` ya aplicado (`3.6-kafka-persistencia.txt`) y con `stop`/`start` real en 3.7; no se recreó el contenedor de Kafka con el tema real para no arriesgar datos.
- **Evidencia canónica de 3.5**: `3.5-activacion.txt` (T026), `3.5-calidad-datos-reales.txt` (T029, datos reales), `3.5-calidad.txt` y `3.5-calidad-real.txt` (pruebas con recursos temporales), `3.5-pruebas.txt` (suite).

## Preguntas de defensa (T048)

1. **Si un mensaje falla siempre al guardarse (p. ej. un NUL en `place`), ¿qué hace el consumidor y por qué no lo salta sin más?**
   *Esperada:* distingue errores. Los transitorios (PostgreSQL o Kafka caídos) se reintentan sin saltar el registro y sin confirmar el offset, para no perder versiones. Los permanentes (`DataError`, `IntegrityError`, codificación) no se arreglan reintentando: se aíslan en cuarentena con motivo y el original, y se confirma el offset para no bloquear la partición. Además el clasificador rechaza de antemano NUL, sustitutos y fechas fuera de rango.
2. **¿Cómo garantizas que un reinicio del consumidor a mitad de procesamiento no pierde ni duplica versiones?**
   *Esperada:* guardar historial y estado actual va en una sola transacción y el offset se confirma solo después. Si muere antes del commit, PostgreSQL revierte y Kafka reentrega; si muere entre el commit y el offset, la reentrega encuentra la versión (`ON CONFLICT DO NOTHING`, «duplicada») y confirma. El estado actual solo avanza con `updated` mayor. Matiz honesto: el kill real no cayó en mitad de una transacción; la atomicidad se probó con fallo de SQL y con pruebas transaccionales.
3. **Kafka perdió mensajes en 3.6: ¿qué falló, cómo lo detectas y cómo se recuperaría un caso así?**
   *Esperada:* el broker escribía en `/tmp/kafka-logs` y no en el volumen (faltaba `KAFKA_LOG_DIRS`), así que recrear el contenedor borró los mensajes ya procesados; no se perdieron datos reales (`version_publicada` = 0 y PostgreSQL ya los tenía). Se corrigió con `KAFKA_LOG_DIRS` + volumen `kafkadata`. Se detecta con la consulta de reconciliación (publicadas sin versión ni cuarentena); si hubiera pérdida real y el hueco es < 24 h, se borran esas marcas de `version_publicada` y el productor las republica desde el feed; si es > 24 h, catálogo histórico (F4). Lección: verificar dónde escribe realmente el servicio antes de manipular su almacenamiento.

## Incidencias y limitaciones

1. **Primer intento de T039 inválido** (`verificacion-f3-intento1.txt`): `docker compose start consumer` arranca también sus dependencias y reinició PostgreSQL medio segundo después de pararlo, por lo que no hubo corte real. Defecto del script, no del sistema; corregido con `docker start` y repetido (la ejecución válida es `verificacion-f3.txt`). Sin pérdida de datos.
2. **T037 no capturó el kill «a mitad» de una transacción**: el consumidor ya había terminado (lag 0 al matarlo); el desfase se produjo con la siguiente publicación. La atomicidad guardar+offset se cubre con las pruebas transaccionales (`3.4-atomicidad*.txt`).
3. **T039**: el consumidor arrancó con la base parada y esperó a la conexión (9 avisos «no disponible») en lugar de fallar al guardar; el reintento del mismo registro tras un fallo al guardar está cubierto por pruebas unitarias (`test_consumidor_reintentos`).
4. **Incidencia de 3.6**: se perdieron mensajes ya procesados de pruebas y del MVP al recrear Kafka porque no escribía en el volumen (`3.6-kafka-persistencia.txt`). Corregido con `KAFKA_LOG_DIRS`; en 3.7 Kafka se paró y arrancó sin pérdida.
5. Los eventos que USGS elimina o fusiona fuera del feed no se detectan (FR-022); hueco > 24 h: `hueco-24h.md` (no ejecutado).
6. **SC-010 y T044** requieren funcionamiento real continuo de más de 24 h desde la activación (T026, 2026-11-06 16:54 UTC; la primera comprobación posible es a partir del 2026-11-07 16:55 UTC, con el sistema sin interrupciones prolongadas); se comprobó el 2026-11-17 (T044, desde F8) con `scripts/f8/sc010_f3.sql` y se anotó en `sc-010-observacion-24h.txt`; el sistema tuvo interrupciones (4 huecos recuperados), anotadas allí.
