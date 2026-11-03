# Tareas: MVP — recorrido completo de un evento sintético

**Entrada**: documentos de diseño en `specs/001-mvp-evento-sintetico/`

**Requisitos previos**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Pruebas**: se incluyen porque la constitución (principio V) exige verificar antes de dar algo por
terminado. Las pruebas unitarias se escriben **antes** que el código que comprueban y deben fallar
primero. Las comprobaciones de integración usan el sistema real en Docker y siguen los pasos del
quickstart.

**Organización**: por historia de usuario. La Historia 3 (arranque reproducible) aporta la
infraestructura que necesitan las demás, por lo que su parte principal está en la Fase 2.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias)
- **[Historia]**: US1, US2 o US3 de la especificación
- Las rutas son relativas a la raíz del repositorio

## Reglas transversales (aplican a todas las tareas)

- No hacer commits ni push: los commits **F2.1** y **F2.2** los realiza la persona estudiante.
- No marcar una verificación como superada sin ejecutarla; guardar la salida real en
  `docs/evidencias/mvp/`. Los tiempos y recuentos se anotan tal como se observan, aunque no cumplan
  el objetivo.
- Al cerrar cada fase: resumir archivos, explicar el código por bloques, justificar decisiones y
  proponer una pregunta de defensa (`CLAUDE.md`).

---

## Fase 1: Preparación (Setup) — hito F2.1

**Propósito**: estructura y configuración base.

- [ ] T001 Arrancar Docker Desktop y comprobar con `docker info`. La decisión R-001
  (`mode = "synthetic"`, excepción temporal) ya está aceptada provisionalmente (2026-11-03)
- [ ] T002 Crear la estructura de directorios y los `__init__.py` según `plan.md`:
  `backend/src/observatorio/{producer,consumer,api}/`, `backend/tests/unit/`, `sql/`, `scripts/`,
  `docs/evidencias/mvp/`
- [ ] T003 [P] Generar `backend/requirements.txt` completamente fijado (`uv pip compile` con
  `--python-version 3.13` desde las dependencias directas del plan) y `backend/requirements-dev.txt`
- [ ] T004 [P] Crear `.env.example` con las variables del plan, sin secretos reales
  (`POSTGRES_PASSWORD=CAMBIAR_EN_LOCAL`); comprobar que `.env` sigue ignorado en `.gitignore`
- [ ] T005 [P] Crear `backend/Dockerfile` (`python:3.13-slim-trixie`, usuario no root, dependencias
  desde `requirements.txt`, código desde `backend/src`)

---

## Fase 2: Base bloqueante (Foundational) — hito F2.1 · incluye la parte principal de US3

**Propósito**: infraestructura que DEBE existir antes de cualquier historia.

**⚠️ CRÍTICO**: ninguna historia de usuario puede empezar hasta terminar esta fase.

- [ ] T006 [US3] Crear `sql/001_esquema_sintetico.sql`: esquema `sintetico`, tabla `evento_actual`,
  restricciones (`PK`, `CHECK` de prefijo, modo y rango de coordenadas) e índice por `event_time`,
  según `data-model.md`
- [ ] T007 [US3] Crear `compose.yaml` con el servicio `postgres`: imagen `postgres:17.11`, volumen
  con nombre, `sql/` montado en `docker-entrypoint-initdb.d`, healthcheck `pg_isready`, sin puertos
  en el host
- [ ] T008 [US3] Añadir a `compose.yaml` el servicio `kafka`: `apache/kafka:4.3.2` en KRaft de un
  nodo, listener interno `kafka:9092`, healthcheck con `kafka-broker-api-versions.sh`, sin puertos
  en el host, y la **retención limitada** de la política R-004 (`KAFKA_LOG_RETENTION_HOURS=24`,
  `KAFKA_LOG_RETENTION_BYTES=104857600`, `KAFKA_LOG_ROLL_HOURS=6`)
- [ ] T009 [P] Crear `backend/src/observatorio/config.py`: lectura de variables de entorno con
  errores claros si falta alguna obligatoria
- [ ] T010 [US3] Verificar `postgres` y `kafka` en estado `healthy` y la tabla creada
  (`\d sintetico.evento_actual`); probar con SQL que las restricciones rechazan un `event_id` sin
  prefijo y una latitud fuera de rango (guardar salida real)
- [ ] T011 [US3] Comprobar la retención efectiva de Kafka (quickstart paso 13, SC-010) con
  `kafka-configs.sh --describe`; si el mapeo de variables no se aplicó, anotarlo y corregir la
  configuración. Guardar la salida real
- [ ] T012 [P] [US3] Crear `producer/main.py`: conexión a Kafka con reintentos y espera progresiva,
  marca de salud (`/tmp/healthy`) tras conectar y espera sin terminar
- [ ] T013 [P] [US3] Crear esqueleto de `consumer/main.py`: conexión a Kafka y a PostgreSQL con
  reintentos y marca de salud (sin consumir aún)
- [ ] T014 [P] [US3] Crear esqueleto de `api/main.py` con `GET /api/salud` (estado de la API y de la
  base; `503` si la base falla)
- [ ] T015 [US3] Añadir a `compose.yaml` los servicios `producer`, `consumer` y `api` (misma imagen,
  `command` propio, `depends_on` con `condition: service_healthy`, healthchecks, `restart`); la API
  publica solo `127.0.0.1:8000:8000`
- [ ] T016 [US3] Ejecutar `docker compose up --build -d` **midiendo el tiempo hasta que los cinco
  servicios estén `healthy`** (SC-001; indicar si las imágenes estaban en caché); confirmar la
  versión de Python dentro del contenedor y que `aiokafka` y `psycopg` se importan (confirma R-002);
  guardar `docker compose ps` y el tiempo medido en `docs/evidencias/mvp/`
- [ ] T017 [US3] Probar reintentos: detener `kafka` y `postgres`, arrancar los servicios Python y
  luego los dos primeros; comprobar que los Python no terminan y se recuperan (escenario US3-2)

**Punto de control F2.1**: infraestructura sana y reproducible. Explicar por bloques
`compose.yaml`, el SQL, los healthchecks y la retención de Kafka; pregunta de defensa.
**Detenerse: commit F2.1 manual.**

---

## Fase 3: Historia 1 — El evento recorre el circuito y aparece en el mapa (P1) 🎯 MVP — hito F2.2

**Objetivo**: un evento sintético llega desde el productor hasta el mapa.

**Prueba independiente**: quickstart pasos 1–5.

### Pruebas de la Historia 1 (escribir primero; deben fallar)

- [ ] T018 [P] [US1] `backend/tests/unit/test_sintetico.py`: el evento y el mensaje cumplen
  `contracts/mensaje-kafka.md` (prefijo, `mode`, `source`, ms UTC, orden de coordenadas, clave) y
  las opciones `secuencia` (id `synthetic-mvp-00N`) y `minutos_atras` (hora del evento)
- [ ] T019 [P] [US1] `backend/tests/unit/test_consumidor_mensaje.py`: se acepta un mensaje válido y se
  rechaza con motivo un `mode` distinto, un id sin prefijo o un JSON inválido
- [ ] T020 [P] [US1] `backend/tests/unit/test_consumidor_flujo.py` (con repositorio y consumidor
  simulados): el offset se confirma **solo después** de guardar; si el guardado falla, **no** se
  confirma; un mensaje repetido se guarda una vez y se confirma (FR-004)
- [ ] T021 [P] [US1] `backend/tests/unit/test_api_eventos.py` (con `TestClient`): estructura según
  `contracts/api-mvp.md`; nulos como `null`; `features: []` sin eventos; `count` y `truncated`;
  `last_ingestion` `null` sin eventos y con valor tras un mensaje; **un evento de más de 24 h queda
  excluido y uno reciente incluido**; `503` si falla la base; CORS: origen permitido con cabecera,
  `OPTIONS` con `ngrok-skip-browser-warning`, y origen no autorizado **sin** cabecera de acceso

### Implementación de la Historia 1

- [ ] T022 [US1] `backend/src/observatorio/sintetico.py`: construir el evento y el mensaje (id
  `synthetic-mvp-00N`, hora `ahora − M min`)
- [ ] T023 [US1] `producer/emitir_sintetico.py`: emitir con `--repeat N`, `--secuencia N` y
  `--minutos-atras M`; esperar la confirmación de Kafka antes de dar el mensaje por publicado; si
  Kafka no responde, terminar con error visible y **código de salida distinto de cero**
- [ ] T024 [US1] `consumer/repositorio.py`: inserción `ON CONFLICT (event_id) DO NOTHING` en una
  transacción
- [ ] T025 [US1] `consumer/main.py`: bucle de consumo; confirmar el offset **después** del commit de
  la base y no confirmarlo si falla; registrar recepción, guardado y descartes
- [ ] T026 [US1] `api/repositorio.py`: consulta de la ventana de 24 h, conversión a GeoJSON y
  `last_ingestion` (significado provisional del MVP: `max(ingested_at)` o `null`); el literal
  `"synthetic"` se define **una sola vez** como constante `MODO_MVP` (R-001) con un comentario
  `TEMPORAL: retirar o aislar como máximo al cerrar F3.1`
- [ ] T027 [US1] `api/main.py`: `GET /api/eventos`, manejo de errores (`503`) y CORS (`GET`,
  `OPTIONS`, cabecera `ngrok-skip-browser-warning`, origen leído de `API_CORS_ORIGINS`)
- [ ] T028 [US1] `frontend/public/config.json` a `mode: "api"` y `apiUrl: "http://localhost:8000"`
- [ ] T029 [US1] `frontend/src/app/app.component.ts` y `.html`: leer `metadata.mode` y mostrar la
  insignia «DATOS SINTÉTICOS» y «SINTÉTICO» en la ficha (sin otros cambios)
- [ ] T030 [US1] Ejecutar `pytest` de `backend/tests/unit` en un entorno Python 3.13; guardar el
  resultado real
- [ ] T031 [US1] Ejecutar `quickstart.md` pasos 1–5 **anotando el instante de emisión y el de
  aparición en el mapa** (SC-002); guardar evidencias (logs, SQL, JSON, captura del mapa)

**Punto de control**: US1 funciona por sí sola.

---

## Fase 4: Historia 2 — Aislamiento de los datos sintéticos (P2)

**Objetivo**: demostrar que lo sintético no se mezcla con lo real.

**Prueba independiente**: quickstart paso 14 y las comprobaciones siguientes.

- [ ] T032 [US2] Verificar aislamiento: esquema/tabla/topic propios, restricciones `CHECK`, ausencia
  de la URL de USGS en el código y puertos publicados (`docker compose ps`); guardar salida
- [ ] T033 [US2] Prueba negativa: publicar con `kafka-console-producer` un mensaje con `mode: live`
  y comprobar que el consumidor lo descarta de forma visible y no inserta nada
- [ ] T034 [US2] Revisar en el navegador la insignia y la ficha «SINTÉTICO»; guardar captura

---

## Fase 5: Historia 3 — Idempotencia, reinicio, errores y ventana temporal (P3)

**Objetivo**: completar la reproducibilidad y la tolerancia a fallos del MVP.

**Prueba independiente**: quickstart pasos 6–13 y 15.

- [ ] T035 [US3] Reenvío: `--repeat 5` deja 1 fila y 1 Feature (SC-004; quickstart paso 6); guardar
  SQL y JSON
- [ ] T036 [US3] Reinicio: `docker compose restart`; el evento sigue (1 de 1) y sin duplicados
  (SC-005; paso 7)
- [ ] T037 [US3] Fallo de la base al consultar: con `postgres` detenido la API devuelve `503` y no
  una colección vacía; al arrancar de nuevo se recupera (paso 8)
- [ ] T038 [US3] **Kafka caído al emitir**: la emisión falla con error visible y código de salida
  distinto de cero, no se registra «publicado» y el evento no llega al almacén (paso 9)
- [ ] T039 [US3] **Offset tras el guardado**: con `postgres` detenido, emitir un evento; el consumidor
  no confirma; al recuperar la base queda guardado una sola vez y el `LAG` del grupo vuelve a 0
  (paso 10; complementa la prueba unitaria T020)
- [ ] T040 [US3] **Caducidad de 24 h**: emitir `--secuencia 2 --minutos-atras 1500`; el evento está en
  la base y no aparece en la API ni en el mapa (SC-009; paso 11)
- [ ] T041 [US3] **CORS desde otro origen**: origen permitido con cabecera, preflight correcto y
  origen no autorizado sin cabecera de acceso (paso 12; el navegador real queda cubierto por T031)
- [ ] T042 [US3] `docker compose down` y `up` conservan el volumen; `down -v` permite repetir desde
  cero (paso 15). Comprobar y documentar el procedimiento «Repetir la demostración» del quickstart

---

## Fase 6: Cierre y pulido — hito F2.2

- [ ] T043 [P] `scripts/verificar-mvp.ps1`: encadena los pasos del quickstart y guarda la salida
  real en `docs/evidencias/mvp/`
- [ ] T044 [P] Crear `README.md` raíz con los pasos de arranque del MVP (requisitos, `.env`,
  `docker compose up --build -d`, emisión, repetir la demostración, mapa, parada)
- [ ] T045 Registrar en `docs/evidencias/mvp/resultados.md` el resultado **observado** de cada
  criterio de éxito (SC-001 a SC-010), con los tiempos medidos de SC-001 y SC-002, incluidos los
  incumplidos si los hay
- [ ] T046 Dejar preparada la retirada de la excepción `synthetic` (R-001): comprobar con una
  búsqueda que `"synthetic"` aparece solo en `MODO_MVP`, en el generador del evento y en las
  pruebas; registrar en `docs/evidencias/mvp/resultados.md` la lista de salida que se aplicará
  (plazo: como máximo al cerrar F3.1, preferiblemente antes de la ingesta real; plan en
  `research.md`), sin ejecutarla todavía
- [ ] T047 Revisión final: `git status` y diff, comprobación contra la constitución, contraste con
  `ENUNCIADO.md` y `CONTRATO-API.md`; preparar la explicación por bloques y tres preguntas de
  defensa

**Punto de control F2.2**: **detenerse; commit F2.2 manual** y revisión antes de la Fase 3 de la
hoja de ruta.

---

## Dependencias y orden de ejecución

- **Fase 1** → **Fase 2** (bloquea todo) → **Fase 3 (US1)** → **Fase 4 (US2)** y **Fase 5 (US3)**
  (pueden hacerse en cualquier orden tras US1) → **Fase 6**.
- Dentro de la Fase 2: T006–T008 antes de T010–T011; T012–T014 dependen de T009; T015 depende de
  T012–T014 y T007–T008; T016–T017 al final.
- Dentro de la Fase 3: T018–T021 antes de T022–T027; T022 antes de T023 y T025; T024 antes de T025;
  T026 antes de T027; T028–T029 son independientes del backend; T030 tras T022–T027; T031 al final.
- Fase 5: T038–T041 requieren la Fase 3 completa; T040 usa `--minutos-atras` (T023).

### Oportunidades de paralelismo

- T003, T004 y T005; T009, T012, T013 y T014; T018, T019, T020 y T021; T043 y T044.

## Estrategia de implementación

1. Completar Fases 1–2 y cerrar F2.1 (infraestructura verificada).
2. Completar la Fase 3 (US1) y **validar**: es el MVP funcional.
3. Añadir US2 y US3, y cerrar con la Fase 6.
4. No avanzar a la Fase 3 de la hoja de ruta (calidad y persistencia) sin autorización.

## Notas

- `[P]` = archivos distintos y sin dependencias.
- Cada tarea cita su ruta; si una tarea exige tocar otro archivo, justificarlo.
- La complejidad añadida (por ejemplo, más servicios o dependencias) requiere justificación por
  escrito en `plan.md`.
