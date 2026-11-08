# Tareas: Replay, integración, despliegue y pruebas finales (F6)

**Entrada**: documentos de `specs/005-replay-despliegue-final/` (spec, plan, research, data-model, contracts, quickstart)
**Requisitos previos**: `plan.md`, `spec.md`. Fase **F6** de `docs/HOJA-DE-RUTA.md` (pasos 6.1 a 6.10, ampliada por DG9). Commit previsto: **`[F6]`**.
**Pruebas**: se escriben antes de implementar (deben fallar) y se ejecutan con resultado real guardado en `docs/evidencias/f6/`.

## Formato: `[ID] [P?] [Historia] [Decisión] [Autorización] Descripción (requisitos y criterios)`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias)
- **[Historia]**: US1 a US11 de la especificación (sin etiqueta en preparación y cierre)
- **[DG1]–[DG9]**: decisión de la que depende la tarea; se aprueban juntas en T001
- **[PA-n]**: punto de autorización de `plan.md`; la tarea **no se ejecuta** sin el visto bueno expreso, dado en ese momento
- Entre paréntesis, los **FR/SC** que cubre la tarea. Las rutas son relativas a la raíz del repositorio

## Reglas transversales (aplican a todas las tareas)

- No hacer commits ni push: el commit de cierre **`[F6]`** lo realiza manualmente la persona estudiante desde VS Code.
- No marcar una verificación como superada sin ejecutarla; guardar la salida real en `docs/evidencias/f6/`. Lo que no se pueda ejecutar (cuentas, lector de pantalla,
  dispositivos, 24 h de SC-010 de F3) consta como **«pendiente de la persona estudiante»**, nunca como cumplido. Los umbrales nuevos se proponen tras medir y los confirma ella.
- **Datos**: ningún dato de prueba en `live.*`, `geo.*` ni `historico.*`; las pruebas usan el esquema `replay`, una base temporal o transacciones revertidas. Las réplicas de
  escala son sintéticas, viven en bases temporales y se eliminan al terminar. Los recursos temporales (contenedores `*-f6-*`, bases `obs_*`, topics, grupos) se comprueban al cerrar cada paso.
- **Prohibido siempre**: `docker compose down -v`, borrar volúmenes o datos, recrear Kafka o PostgreSQL, `docker system prune`. **Condición de DG7**: eliminar volúmenes, incluso los temporales del proyecto paralelo, exige una autorización específica (PA-11) por nombre exacto, tras listarlos y comprobar `docker compose -p observatorio_limpio ps` y `config` (el `compose.yaml` fija `name: observatorio`, así que **todo comando del proyecto paralelo lleva `-p`**). Una operación que pare servicios reales requiere su PA y `scripts/f6/invariantes.sh` antes y después (lag 0, reconciliación vacía, 0 offsets duplicados, huellas del histórico y de `sintetico`, ids de contenedores y de volúmenes). El topic `terremotos.replay` y el grupo `consumidor-replay` son permanentes (A-13) y no cuentan como recursos temporales.
- **Datos**: ningún dato de prueba en `live.*`, `geo.*` ni `historico.*`; los scripts de `scripts/f6/` pasan `scripts/f6/verificar_seguridad.sh` (sin órdenes destructivas ni que paren o recreen servicios, salvo excepciones aprobadas en `scripts/f6/excepciones_seguridad.txt`).
- **Despliegue**: solo se recrea el servicio que cambia (`docker compose up -d --build --no-deps <servicio>`), de uno en uno y con PA-3, **etiquetando antes la imagen anterior** para poder volver atrás. Tras editar `compose.yaml` (T002) **no se ejecuta `docker compose up -d` sin nombre de servicio** (recrearía consumidor, productor y API a la vez). Nada se publica, no se abre ningún túnel ni se crean cuentas sin PA-8; Claude **nunca** introduce ni ve el authtoken de ngrok.
- No modificar `docs/referencias/`, `specs/001-…` a `specs/004-…`, `frontend/public/datos/paises.geojson` ni `terremotos-demo.geojson`. El contrato solo crece de forma aditiva. Del frontend
  solo se tocan `frontend/src/app/`, `frontend/tests/` y, sin secretos, `frontend/public/config.json` (que conserva `http://127.0.0.1:8000`).
- Al cerrar cada paso: resumir archivos, explicar el código por bloques, justificar decisiones y proponer una pregunta de defensa (`CLAUDE.md`).
- Sin dependencias nuevas en el repositorio. Pruebas de backend en `backend/tests/unit/`; del frontend en `frontend/tests/`; scripts en `scripts/f6/`.
- Cuando se cita «SC-010(F3)» se habla de la conservación tras 24 h de F3; «SC-010» sin sufijo es el criterio de mediciones de esta fase. T040, T067 y T073 son borradores que alimentan F7 (A-14).
- Terminología: «estado actual» = `live.evento_actual` sin retirados; «replay» = esquema `replay`; `*_at` = `timestamptz`; fechas del contrato en ms UTC.

## Aprobaciones previas (decisiones de `plan.md`)

| Decisión | Afecta a | Si no se aprueba |
|---|---|---|
| **DG1** consumidor reutilizado con destino parametrizado, sin servicio nuevo | T005, T006, T009, T011, T012 | Replantear 6.1 antes de empezar |
| **DG2** parámetro `mode` y `run` en la API | T019–T021, T023 | Rediseñar a rutas `/api/replay/*` antes de 6.2 |
| **DG3** 30 reales de un día, 1 mensaje/2 s, ejecuciones sin borrar | T003, T007, T008, T010, T011 | Fijar otra selección o política antes de 6.1 |
| **DG4** ngrok como agente del equipo (preferencia propia; §9 admite contenedor) | T044, T046, T047 | Replantear 6.6 (sexto servicio) |
| **DG5** dominio estático de ngrok | T046, T047 | Documentar la URL cambiante y el redespliegue |
| **DG6** Netlify con despliegue manual del build local y `apiUrl` escrita antes de compilar (restaurando el original) | T043, T046, T047 | Replantear 6.6 (copia de `dist` o Git y push) |
| **DG7** proyecto Compose independiente con imagen propia; eliminar volúmenes, incluso temporales, exige PA-11 | T002, T065 | Sustituir 6.9 por revisión documental |
| **DG8** ensayos sobre servicios reales con PA por ensayo | T056–T063 | Limitar 6.8 a recursos temporales |
| **DG10** casos controlados con ids propios, aprobada (opción A) solo en `replay.*` como sintética y sin mezclar; constitución v1.0.4 aplicada | T004, T010, T017, T023 | Opción C: solo duplicado y revisión en el replay |
| **DG9** ampliar la hoja con 6.7–6.10 | T001, T071 | Absorber los pasos en 6.3 y 6.6 |

## Preparación

- [x] T001 [DG1–DG10] [PA-1] Pedir la aprobación de DG1–DG10; ampliar `docs/HOJA-DE-RUTA.md` con las filas 6.7–6.10 y renombrar 6.2 a «Replay en la API y el panel; comprobar velocidad, identidad y separación» (sin marcar nada); crear
  `scripts/f6/invariantes.sh` (solo lectura: lag, reconciliación, offsets duplicados, huellas, ids de contenedores y de volúmenes, recursos temporales con el topic y el grupo de replay exentos) y `scripts/f6/ejecutar.sh` (como el de F5, montando además
  `scripts/f6` en `/scripts6`); anotar los ids de las imágenes actuales y etiquetar la anterior (`docker tag <id> observatorio-backend:previo-f6`) como vuelta atrás de PA-3; capturar la línea base de la API en vivo (ventana pasada fija, sin `generated` ni
  `ingestion_age_s`) en `docs/evidencias/f6/6.1-linea-base-api.json`; y tomar la línea base en `docs/evidencias/f6/6.1-entorno.txt`: cinco servicios `healthy` con sus ids, lag 0, reconciliación 0, 661 + 88 pruebas, huellas del histórico (`057f8f4e…`) y
  de `sintetico` (`5b9d041e…`), volúmenes, `git status` y recursos temporales (FR-040, SC-007, SC-019)
  **Resultado real (2026-11-08):** DG1–DG9 aprobadas con las condiciones de DG6 (`public/config.json` solo en T043 y restaurado), DG7 (entorno independiente; eliminar volúmenes, incluso temporales, exige PA-11), DG8 (PA por ensayo) y DG9 (hoja hasta 6.10); DG10 aprobada solo en `replay.*`, como sintética y sin mezclar, **condicionada** a la constitución →
  `specs/005-…/propuesta-enmienda-constitucion.md` (PATCH v1.0.4; **aprobada con la opción A y aplicada** el 2026-11-08). Hoja ampliada. Scripts en `scripts/f6/`: `invariantes.sh`, `ejecutar.sh`, `linea_base_api.py`, `verificar_seguridad.sh` (detectó 3/3 líneas peligrosas de un archivo de prueba y pasa limpio: `6.1-seguridad-scripts.txt`),
  `etiquetar_imagenes.sh` y `verificar_imagen_equivalente.sh`. **Hallazgo:** la imagen de `consumer` y `producer` (`sha256:af47…`) ya no existe en el almacén de Docker; `observatorio-backend:previo-f6-{api,consumer,producer}` apuntan a `latest` (`d1a568b553a7`), verificada **idéntica a HEAD** archivo a archivo (31 de 31): es la vuelta atrás disponible (`6.1-imagenes.txt`).
  Línea base (`6.1-entorno.txt`, `6.1-pruebas-base.txt`): 5 servicios `healthy` con los mismos ids, lag 819/819/0, reconciliación 0, 0 offsets duplicados, histórico 18 302 (md5 `057f8f4e…`), `sintetico` 18 (md5 `5b9d041e…`), volúmenes `pgdata` y `kafkadata` con su fecha de creación, 550 eventos en `live` (0 de prueba), 0 recursos temporales, solo la API publicada,
  **683 pruebas de backend** (661 + 22 nuevas) y 88 de frontend, aislamiento de F5 en OK. Línea base de la API: ventana 2026-11-06, 7 consultas con huella y oráculo SQL (203 eventos); una segunda captura coincide (`OK`)
- [x] T002 [P] [DG3] [DG7] Pruebas primero en `backend/tests/unit/test_config.py` y después `ConfigReplay` en `backend/src/observatorio/config.py`; variables `KAFKA_TOPIC_REPLAY`, `KAFKA_CONSUMER_GROUP_REPLAY`, `REPLAY_EVENTOS` (30), `REPLAY_INTERVALO_S` (2),
  `REPLAY_ESPERA_FINAL_S` (10), `REPLAY_ESPERA_MAX_S` (120), `BACKEND_IMAGE` y `API_PUERTO` (8000) en `.env.example` y `compose.yaml` (puerto `127.0.0.1:${API_PUERTO:-8000}:8000`, `image: ${BACKEND_IMAGE:-observatorio-backend}` en los tres servicios Python, sin servicio
  nuevo); `docker compose config` las resuelve. Hasta PA-3 el `compose.yaml` en disco y lo que corre difieren (FR-035, FR-038)
  **Resultado real (2026-11-08):** 22 pruebas nuevas (valores por defecto, válidos, 16 inválidos con el nombre de la variable, espera máxima ≥ final y, sobre todo, **el topic y el grupo de replay nunca pueden coincidir con los del flujo en vivo**); **fallaron las 22 antes de implementar** (`6.1-config-fallan-primero.txt`) y con `ConfigReplay` pasan (62 en `test_config.py`; 683 en total, `6.1-pruebas-base.txt`).
  `.env.example` y `compose.yaml` actualizados (variables `REPLAY_*` en `producer` y `consumer`, `BACKEND_IMAGE` en los tres servicios Python, `API_PUERTO`); `docker compose config` las resuelve y un proyecto paralelo **simulado** (solo `config`, sin levantar nada) usa red y volúmenes propios `observatorio_limpio_*` y puerto 8100, sin tocar los reales (`6.1-compose-config.txt`).
  **No se recreó ningún contenedor**: siguen los mismos ids; el `compose.yaml` en disco difiere de lo que corre hasta PA-3

## Paso 6.1 — Replay aislado (backend) · Historia 1 y 2

**Objetivo**: reproducir por Kafka una selección real de `historico` con topic y esquema propios y casos controlados, procesada por el mismo código del consumidor.
**Prueba independiente**: tras una reproducción, el esquema `replay` tiene 35 filas actuales, 37 versiones y 1 en cuarentena y `live`, `historico` y `sintetico` no cambian.

- [x] T003 [P] [US1] [DG3] Pruebas (primero fallan) `backend/tests/unit/test_replay_seleccion.py`: elige el día UTC de 2025 con más eventos (o `--dia`), toma los N primeros por
  `(event_time, event_id)`, orden estable, N mayor que lo disponible → devuelve los que hay e informa, intervalo vacío → 0 y mensaje, nunca inventa eventos (FR-002, SC-001)
  **Resultado real (2026-11-08):** `test_replay_seleccion.py`, 8 pruebas sobre una base temporal con un histórico ficticio (día con más eventos y empate, N primeros por fecha e id con empate de instante, menos eventos de los pedidos y día vacío sin inventar nada, `raw` sin alterar, día en UTC, huella del histórico intacta y el código solo contiene `SELECT`). Fallaron antes de implementar (`6.1-pruebas-fallan-primero.txt`: 7 módulos sin importar) y pasan.
- [x] T004 [P] [US2] [DG3] [DG10] Pruebas `backend/tests/unit/test_replay_casos.py`: los seis casos con su definición exacta de `research.md` R-004 (ids propios `replay-ctl-<caso>` copiados de los seis primeros eventos de la selección con magnitud no nula; `duplicado` = el mismo mensaje dos veces;
  `revision` = v1 copia y v2 con `updated` + 60 000 ms y `mag` + 0,1 a 1 decimal; `antigua` = versión nueva y después otra con `updated` − 3 600 000 ms y `mag` − 0,1; `magnitud_nula`; `coordenadas_invalidas` con latitud 123; `maritimo` en un punto del Pacífico que la prueba
  comprueba que **ningún** polígono del catálogo cubre), `time` igual al del evento base (dentro del intervalo), 9 mensajes de casos en total, y los eventos reales idénticos a `historico.evento.raw` (FR-003, FR-004, SC-003)
  **Resultado real (2026-11-08):** `test_replay_casos.py`, 14 pruebas: 39 mensajes (30 reales idénticos y 9 de casos), ids propios `replay-ctl-<caso>` sin reutilizar ninguno real, base = seis primeros con magnitud no nula (también con nulos al principio), casos justo tras su base y tiempo no decreciente, duplicado idéntico, revisión (+60 s y +0,1), antigua tras la nueva (−1 h), nula, latitud 123, marítimo en (−140, 0) y **comprobado contra el catálogo real que ningún polígono lo cubre**, entrada sin modificar, insuficiente → error, vacío → vacío y envoltorio Kafka del contrato.
- [x] T005 [P] [US1] [DG1] Pruebas `backend/tests/unit/test_replay_mensaje.py`: el destino `replay` solo admite `mode = "replay"` y `source = "replay-historico"`; el destino `live` descarta
  `replay` con motivo (comportamiento actual) y el de replay descarta `live`; el bloque `replay` (`run_id`, `seq`, `caso`, `velocidad`) se valida; `ingested_at` no sustituye al tiempo del evento (FR-001, FR-006)
  **Resultado real (2026-11-08):** `test_replay_mensaje.py`, 35 pruebas: el destino replay acepta solo `mode=replay` y `source=replay-historico`; el destino live descarta replay con el motivo de siempre (y el de replay descarta live); modo no contractual descartado en los dos; sin `run_id` legible → descartado (no hay ejecución); bloque malformado (`caso`, `seq`, `velocidad`) → cuarentena con su `run_id`; tiempo del evento y de reproducción conservados y distintos; magnitud nula válida; coordenadas inválidas y no sísmicos con `run_id`.
- [x] T006 [P] [US1] [DG1] Prueba de identidad `backend/tests/unit/test_destino_sql.py`: el SQL que genera el destino `live` es **idéntico carácter a carácter** a una **copia congelada del literal actual** pegada en el propio test (no se lee del módulo que T009 modifica); el nombre del
  esquema se valida contra la lista cerrada `{live, replay}` (cualquier otro → error, sin inyección); el destino `replay` apunta a `replay.*` con clave `(run_id, event_id)` y `(run_id, event_id, updated_at)` (FR-005)
  **Resultado real (2026-11-08):** `test_destino_sql.py`, 20 pruebas con la copia congelada `sql_live_congelado.py` (generada con `scripts/f6/generar_sql_congelado.py` a partir del código de [F5], antes de tocarlo): el SQL del destino `live` es **idéntico carácter a carácter** a las cuatro sentencias, las constantes del módulo también, lista cerrada de esquemas (10 valores peligrosos rechazados), el SQL de replay solo menciona `replay.` con `(run_id, …)` en las claves y el de live no menciona `run_id`, `replay` ni `caso`.
- [x] T007 [US1] [DG3] Pruebas de integración `backend/tests/unit/test_replay_integracion.py` sobre una base temporal con `sql/004_esquema_f6.sql`: 39 mensajes → 35 filas en `evento_actual`, 37 en `evento_version`, 1 en cuarentena con motivo y el duplicado descartado; repetir el mismo `run_id` no cambia
  nada; un `run_id` nuevo crea un conjunto aparte (con su propia fila de cuarentena, porque la unicidad es `(run_id, huella)`) sin tocar el anterior; reanudar tras interrumpir no duplica; un consumidor arrancado antes que un productor lento no termina antes de tiempo; el `CHECK (mode = 'replay')` y el de
  `source` rechazan un `live`; `live`, `historico` y `sintetico` conservan sus huellas (FR-001, FR-006, FR-007, SC-001, SC-003)
  **Resultado real (2026-11-08):** `test_replay_integracion.py` (9) y `test_replay_kafka.py` (1, con Kafka real y topic y grupo temporales `test-f6-*`), más `test_consumidor_replay_bucle.py` (6, reloj simulado): 39 mensajes → **35 / 37 / 1** con el duplicado descartado, cada caso como exige §11 (revisión aplicada, antigua solo en el historial, nulo como NULL, inválidas en cuarentena con su motivo, marítimo `sin_pais`), repetir el run no cambia nada, un run nuevo crea su conjunto y su propia fila de cuarentena, interrumpir y reanudar no duplica, los `CHECK` rechazan mezclas, `live`/`historico`/`geo` conservan su huella y el consumidor en vivo descarta los mensajes de replay; el bucle termina solo ni antes ni sin fin. El de Kafka publica 39 mensajes por un broker real y los consume con el bucle de producción: 35 / 37 / 1.
- [x] T008 [US1] [DG3] `sql/004_esquema_f6.sql` (aditivo e idempotente): esquema `replay` con `ejecucion`, `evento_actual`, `evento_version` y `cuarentena` según `data-model.md` (mismas columnas que `live` más `run_id` y `caso`; `mode` y `source` con `CHECK`; `country_id` → `geo.pais`; índice `(run_id, event_time)`;
  `UNIQUE (run_id, huella)` en la cuarentena); se aplica solo a la base temporal de las pruebas (FR-001)
  **Resultado real (2026-11-08):** `sql/004_esquema_f6.sql` (esquema `replay`: `ejecucion`, `evento_actual`, `evento_version`, `cuarentena`; `CHECK` de `mode`, `source` y `caso`; clave `(run_id, event_id)`; `UNIQUE (run_id, huella)`; sin claves foráneas hacia `live` ni `historico` y sin clave foránea a `ejecucion` para que una ejecución desconocida no bloquee al consumidor). Idempotente: aplicada dos veces en la base real sin error.
- [x] T009 [US1] [DG1] Destino parametrizado del consumidor: (a) `consumer/mensaje.py`: el clasificador recibe el modo y la fuente que admite el destino y `EventoRecibido` gana `run_id` y `caso`; (b) `consumer/repositorio.py`: plantillas de SQL con esquema validado y `run_id` solo en replay (`ON CONFLICT` por `(run_id, event_id)`, retirada y
  cuarentena incluidas); (c) `consumer/main.py`: opción `--destino replay` con topic y grupo de `ConfigReplay`, bucle con `getmany(timeout)` que termina tras `REPLAY_ESPERA_FINAL_S` de inactividad **desde el primer mensaje procesado** (o `REPLAY_ESPERA_MAX_S` sin ninguno) y confirma el offset después de escribir.
  El destino `live` es el de hoy, sin cambios de comportamiento (FR-005, FR-006)
  **Resultado real (2026-11-08):** `consumer/destino.py` (nuevo: `Destino`, lista cerrada de esquemas, generadores de SQL), `mensaje.py` (modo y fuente que admite el destino, `run_id` y `caso`, validación del bloque `replay`), `repositorio.py` (SQL por destino; el de live lee las constantes del módulo en cada llamada, así que las pruebas que las parchean siguen funcionando; guardas de `run_id`) y `main.py` (`--destino replay`, `consumir_hasta_inactividad` con `getmany`, topic y grupo de `ConfigReplay`, cuarentena de errores permanentes atribuida a su ejecución). Las 683 pruebas anteriores siguen pasando sin tocarlas.
- [x] T010 [P] [US1] [DG3] Paquete nuevo `backend/src/observatorio/replay/` (`seleccion.py`, `casos.py`): selección de solo lectura sobre `historico.evento` y construcción de los seis casos y de los
  mensajes (a partir de `raw`), sin mencionarse desde `consumer/` ni `producer/` (FR-002, FR-004)
  **Resultado real (2026-11-08):** `replay/casos.py` (secuencia pura y determinista: casos intercalados tras su base, envoltorio Kafka) y `replay/seleccion.py` (solo `SELECT` en una transacción de solo lectura), en un paquete propio: `consumer/` y `producer/` no mencionan el esquema `historico`.
- [x] T011 [US1] [DG1] [DG3] `backend/src/observatorio/replay/reproducir.py` (bajo demanda): crea la ejecución (`run_id`, intervalo, tamaño, criterio, día, velocidad), publica un mensaje cada `REPLAY_INTERVALO_S` en `terremotos.replay` con la clave `event_id`, confirma con Kafka antes de dar la versión por publicada, escribe el estado
  (`en_curso` → `terminada`) y admite `--reanudar <run_id>` (marca `interrumpida` y republica la selección completa con el mismo `run_id`) (FR-003, FR-007)
  **Resultado real (2026-11-08):** `replay/reproducir.py` (bajo demanda; `--dia`, `--run`, `--reanudar`, `--eventos`, `--intervalo`, `--solo-plan`): velocidad = tiempo real cubierto / duración, publicación en orden con confirmación de Kafka y espera solo entre mensajes, registro de la ejecución (misma selección o error, nunca se sobrescribe) y estado `en_curso` → `terminada`; `test_replay_reproducir.py` (8 pruebas con productor y reloj simulados y base temporal).
- [x] T012 [US1] Adaptar `backend/tests/unit/test_aislamiento.py` (`test_consultas_solo_sobre_el_esquema_live`) para exigir «solo `live` en el destino `live` y solo `replay` en el de `replay`» y que `consumer/` y `producer/` no mencionen `historico`, sin debilitar nada; ejecutar `test_aislamiento.py` completo
  (su comprobación de `SQL_EVENTOS` de la API sigue vigente y se amplía en T020) (FR-006, FR-040)
  **Resultado real (2026-11-08):** `test_aislamiento.py` conserva sus dos pruebas de F3 sin tocarlas y gana cuatro: el destino live solo toca `live` y el de replay solo `replay`, consumidor y productor no mencionan el esquema `historico.`, el paquete `replay` no menciona `live.` ni `sintetico` ni escribe en el histórico y solo `replay`, `consumer` y `api` conocen el esquema (`6.1-aislamiento-pruebas.txt`, 19 pruebas con las de la API). Una de ellas falló la primera vez porque cuenta la etiqueta `replay-historico` como mención; se afinó a `historico.`.
- [x] T013 [US1] Mutaciones temporales `scripts/f6/mutaciones_61.py` (al menos 15: quitar el `CHECK`, aceptar `live` en replay, alterar `time`, no confirmar tras escribir, duplicar el duplicado,
  ordenar mal, dejar pasar un esquema no permitido…); todas deben detectarse; salida en `docs/evidencias/f6/6.1-mutaciones.txt`; un superviviente refuerza las pruebas (SC-001, SC-003)
  **Resultado real (2026-11-08):** `scripts/f6/mutaciones_61.py`: **39 mutaciones (34 de código y 5 del esquema sobre una copia de `sql/`), 39 detectadas, 0 supervivientes** (`6.1-mutaciones.txt`). La primera vez sobrevivió una (la cuarentena de replay sin `run_id`): se añadió su prueba. Incidencia: el mutante «espera sin límite» provocó un bucle infinito que dejó el contenedor colgado y `consumer/main.py` mutado en disco; se mató el contenedor efímero, se restauró la línea a mano, se comprobó que no quedaba ningún `if False` en `backend/src` y se añadió un **tiempo máximo por mutante** (60 s, cuenta como detectado).
- [x] T014 [US1] Suite completa de backend con `scripts/f6/ejecutar.sh` → `docs/evidencias/f6/6.1-pruebas.txt`: las 661 anteriores + las nuevas, 0 saltadas (SC-007)
  **Resultado real (2026-11-08):** Suite completa de backend con `scripts/f6/ejecutar.sh` y Kafka real temporal: **788 pasan, 0 saltadas** (683 anteriores + 105 nuevas: 101 de replay/destino y 4 de aislamiento); frontend 88 pasan; los topics y grupos `test-f6-*` se eliminan después con `scripts/f6/limpiar_temporales_kafka.sh` (`6.1-pruebas.txt`, `6.1-cierre.txt`).
- [x] T015 [US1] [PA-2] Con las invariantes comprobadas, aplicar `sql/004_esquema_f6.sql` a PostgreSQL real; comprobar que solo se crea el esquema `replay` y que `live`, `geo`, `historico` y
  `sintetico` conservan sus huellas → `docs/evidencias/f6/6.1-migracion.txt` (FR-001, SC-019)
  **Resultado real (2026-11-08):** Con las invariantes comprobadas antes y después (lag 0, reconciliación 0, huellas del histórico y `sintetico` iguales, mismos volúmenes) se aplicó `sql/004_esquema_f6.sql` a PostgreSQL real: solo se crea el esquema `replay` (4 tablas, `CHECK` de modo y fuente en ambas tablas de eventos, 0 claves foráneas hacia `live`/`historico`); segunda aplicación idempotente (`6.1-migracion.txt`).
- [x] T016 [US1] [DG1] [PA-3] Recrear `consumer` y luego `producer` con la imagen nueva (`up -d --build --no-deps <servicio>`), de uno en uno, con la imagen anterior ya etiquetada (T001) y `scripts/f6/invariantes.sh` antes y después (lag 0, reconciliación 0, Kafka y PostgreSQL con los mismos ids); si un servicio no queda
  `healthy`, volver a la imagen etiquetada → `docs/evidencias/f6/6.1-despliegue.txt` (FR-015, SC-008)
  **Resultado real (2026-11-08):** Imagen construida con el mismo nombre y recreados `consumer` y luego `producer` **de uno en uno** (`up -d --no-deps`), con la imagen anterior ya etiquetada; Kafka, PostgreSQL y la API conservan sus ids y volúmenes; tras cada uno, cinco servicios `healthy`, lag 0 y reconciliación 0; el productor ingirió y el consumidor guardó nuevas versiones (807 → 810) sin hueco (`6.1-despliegue.txt`). La API (`api`) NO se recreó: es de 6.2.
- [x] T017 [US1] [US2] [DG3] [PA-4] Reproducción real: comprobar con `kafka-topics --describe` el topic creado (1 partición, retención), lanzar el consumidor de replay y el productor (`docker compose run --rm --no-deps …`), contrastar 39 mensajes → 35 / 37 / 1 en `replay`, repetir con el mismo `run_id` (sin cambios),
  interrumpir (`docker kill` del contenedor efímero) y reanudar (sin duplicados) y una ejecución nueva; comprobar con consultas que `live`, `historico` y `sintetico` no cambian y que `live` no recibió mensajes de replay → `docs/evidencias/f6/6.1-replay-real.txt` y `6.1-aislamiento.txt` (FR-006, FR-007, SC-001, SC-003)
  **Resultado real (2026-11-08):** Ejecución real **r-f6-prueba-a** (2025-07-30, el día con más eventos del histórico): 39 mensajes en 78 s (velocidad 31,9×; separación entre mensajes 2,11 s de media, 2,00 mín y 4,01 máx), consumidor de replay terminado solo, **35 filas actuales / 37 versiones / 1 en cuarentena** con cada caso como se esperaba, los 30 reales idénticos a `historico.evento` (time y updated) y con el instante de reproducción 466 días posterior al del evento; topic `terremotos.replay` (1 partición, retención de 100 MiB), lag 0; `live` (558 eventos), `historico` y `sintetico` con las mismas huellas y 0 mensajes de replay en `live`. Ensayos (`6.1-replay-ensayos.txt`): **repetir la misma ejecución** deja 35 / 37 / 1 (offsets distintos 37 de 37) y **matar el consumidor efímero a mitad** (r-f6-prueba-b: 14 / 16 / 1 parcial) y reanudar deja 35 / 37 / 1 sin duplicados. Quedan dos ejecuciones de prueba (a y b) en `replay`, sin borrar nada (`6.1-replay-real.txt`, `6.1-replay-plan.txt`).
- [x] T018 [US1] Resumir el paso 6.1 (archivos, bloques, decisiones, pruebas) y proponer la pregunta de defensa: «¿Por qué el replay no mezcla con `live` aunque use el mismo código del consumidor?»
  **Resultado real (2026-11-08):** Resumen del paso 6.1 en la respuesta final. Pregunta de defensa: «¿Qué impide, a nivel de base de datos y no solo de código, que un mensaje con `mode=replay` entre en `live.evento_actual`?» — el `CHECK (mode = 'live')` de `live`, el `CHECK (mode = 'replay')` y el de la fuente de `replay`, el topic y el grupo distintos (comprobados en `ConfigReplay`) y la lista cerrada de esquemas. **Incidencias:** (1) la imagen de `consumer`/`producer` ya no existía (vuelta atrás = `latest` verificada idéntica a HEAD); (2) bucle infinito de un mutante (arriba); (3) `scripts/f5/aislamiento_final.sh` da un falso fallo («consumidor y productor mencionan historico») porque cuenta la etiqueta `replay-historico` de `consumer/destino.py`; el control fino ya está en `test_aislamiento.py` y la versión de F6 de ese script se crea en T033 (6.3).

**Punto de control del paso 6.1.** Revisar con la persona estudiante antes de continuar con 6.2.

## Paso 6.2 — Replay en la API y el panel · Historia 3

**Objetivo**: `mode=live|replay` en la API y un selector con la etiqueta «REPRODUCCIÓN» en el panel.
**Prueba independiente**: con una reproducción hecha, el panel en modo replay muestra periodo, etiqueta y cifras coherentes y, al volver a vivo, no queda nada de replay.

- [x] T019 [US3] [DG2] Pruebas (primero fallan) `backend/tests/unit/test_api_replay.py` según `contracts/f6.md`: `mode` y `run` validados (422 para valores desconocidos, `run` inexistente o con `mode=live`);
  `replay` lee solo `replay.*`; periodo por defecto = intervalo de la ejecución; `metadata.replay`, `properties.caso` y `replayed_at`; `comparacion_disponible: false` con motivo `no_aplica_en_reproduccion`;
  `/api/salud?mode=replay` con bloque `replay` y `last_ingestion` en vivo; sin ejecuciones → 200 vacío con `metadata.replay: null`; 503; y **sin `mode` las respuestas son idénticas a las de F5** (FR-008, FR-009, SC-004)
- [x] T020 [US3] Ampliar `backend/tests/unit/test_aislamiento_api.py`: solo el camino `replay` menciona `replay.*` y el de `live` nunca (incluidos `SQL_EVENTOS`, `estadisticas.py` y `comparacion.py`); `comparacion.py` sigue siendo el único módulo que lee `historico`; nada escribe ni menciona `sintetico` (FR-006, FR-039)
- [x] T021 [US3] [DG2] `backend/src/observatorio/api/` (`main.py`, `filtros.py`, `repositorio.py`, `estadisticas.py`, `comparacion.py`): parámetros `mode` y `run`; el esquema (`live.evento_actual` está fijo en ~10 sitios) sale de un único selector validado; `Filtros.donde` añade el filtro por `run`; periodo por defecto de la ejecución;
  `metadata.replay`; estadísticas con la comparación omitida (se salta `comparacion.py` y su cobertura de `live`); `/api/salud` ampliado; el comportamiento sin `mode` no cambia (FR-008, FR-009)
- [x] T022 [P] [US3] Pruebas del frontend (primero fallan) `frontend/tests/modo.test.ts` y ajustes de `api.service.test.ts`, `filtros.test.ts`, `estado.test.ts`: estado `modoVista` (inicial `live`), parámetros con `mode`,
  periodo por defecto desde `metadata.replay`, descarte de la lectura y cancelación de la petición al cambiar de modo, texto de la etiqueta y del aviso de «no aplica», sin ejecuciones → mensaje de cómo lanzarla
  y no «sin conexión» (FR-010, SC-005)
- [x] T023 [US3] [DG10] Frontend en `frontend/src/app/` (`modelos.ts`, `filtros.ts`, `api.service.ts`, `app.component.*`, componente del selector y ajustes de `estado/`, `tabla/`, `graficas/` y `comparacion/`): selector visible, «REPRODUCCIÓN» en mapa, tabla, ficha, gráficas y estado, distintivo «caso controlado / sintético» en ficha y tabla,
  tarjeta de comparación oculta con aviso, `aria-live` para el cambio de modo, sin recalcular estadísticas; `package.json`, `tsconfig*` y `config.json` intactos (FR-010, FR-026)
- [x] T024 [US3] Mutaciones temporales `scripts/f6/mutaciones_62.py` (backend y frontend; al menos 15: `mode` ignorado, lectura de `live` en replay, periodo de 24 h en replay, etiqueta ausente en una vista,
  datos del modo anterior conservados…) → `docs/evidencias/f6/6.2-mutaciones.txt`; todas detectadas
- [x] T025 [US3] Suite de backend, `node --test`, `npm run build` y `sha256` de lo que no debe cambiar → `docs/evidencias/f6/6.2-pruebas.txt` (SC-007)
- [x] T026 [US3] [PA-3] Recrear `api` (`up -d --build --no-deps api`) con la imagen anterior etiquetada e invariantes antes y después; matriz contra la API real: **las respuestas en vivo coinciden con la línea base de T001** (misma ventana pasada fija, sin `generated` ni `ingestion_age_s`) y las de replay cumplen el contrato, incluidos los 422
  → `docs/evidencias/f6/6.2-api-real.txt` (FR-008, SC-004)
- [x] T027 [US3] [PA-4] Panel en el navegador integrado con una reproducción real: cambio de modo, periodo por defecto, etiqueta en todas las vistas, mapa = tabla = gráficas, comparación «no aplica», vuelta
  a vivo sin restos, ausencia de ejecuciones, API caída en modo replay (aviso de «sin conexión» sin presentar la reproducción como actual), modo `demo` intacto → `docs/evidencias/f6/6.2-panel.txt` (FR-010, SC-005)
- [x] T028 [US3] [PA-4] Verificar velocidad, identidad y separación: cadencia observada de `ingested_at` frente a la configurada (se registra y se propone la tolerancia tras medir), `time` y `updated` de los **eventos reales** idénticos a `historico.evento` en el 100 % (los casos se comparan contra su evento base), `event_id` y `run_id`
  coherentes, 0 ids de replay en `/api/eventos` en vivo → `docs/evidencias/f6/6.2-velocidad-identidad.txt` (FR-003, FR-006, SC-002)
- [x] T029 [US3] Resumir el paso 6.2 y proponer la pregunta de defensa: «Si reproduces 2025 y la API filtra por defecto las últimas 24 horas, ¿por qué el panel de replay sí muestra los puntos?»

**Punto de control del paso 6.2.** Revisar con la persona estudiante antes de continuar con 6.3.

## Paso 6.3 — Integración extremo a extremo, aceptación y regresión · Historia 4 y 10

**Objetivo**: demostrar con evidencia real el recorrido de un evento y las pruebas de aceptación de §11, y dejar la regresión en verde.
**Prueba independiente**: seguir el guion y comparar lo observado con lo esperado de cada fila.

- [x] T030 [US4] `scripts/f6/rastro_evento.py` (solo lectura): dado un `event_id` real reciente, mostrar su consulta a USGS (`live.consulta_extraccion`), el mensaje (`version_publicada`), la versión
  (`evento_version`), la fila actual, su aparición en `/api/eventos` y en `/api/estadisticas`, y su punto en el panel (navegador) → `docs/evidencias/f6/6.3-rastro.txt` (FR-012)
- [x] T031 [US4] [PA-4] Ejecutar con resultado observado ocho filas de §11 (las que no dependen del túnel ni del reinicio del consumidor), según la tabla de `research.md` R-008 (evento nuevo, reenvío, versión posterior, antigua, magnitud nula,
  coordenadas inválidas, marítimo y reproducción por el replay; reenvíos y revisiones reales solo observados en `live`; la fila «Reiniciar consumidor» se ensaya en T057 y las dos del túnel en T047): una sección por fila con procedimiento,
  comando, esperado y observado → `docs/evidencias/f6/6.3-aceptacion.md` (FR-011, FR-013, SC-003, SC-006)
- [x] T032 [P] [US10] Actualizar `scripts/f5/matriz_51.py` (claves de `/api/salud`) y `scripts/f5/matriz_52.py` (claves de `/api/estadisticas` y ausencia del texto «historico») al contrato vigente, sin tocar el resto, y dejar en la cabecera de cada script una nota con la fecha; ejecutarlas hasta OK con `scripts/f6/ejecutar.sh`; introducir temporalmente una regresión y comprobar que las
  detectan; si no fuera viable, marcarlas como evidencia histórica → `docs/evidencias/f6/6.3-matrices.txt` (la evidencia de `docs/evidencias/f5/` no se reescribe) (FR-036, SC-017)
- [x] T033 [US4] Regresión completa: backend con `scripts/f6/ejecutar.sh`, `node --test`, `npm run build`, `scripts/f5/aislamiento_final.sh`, y crear `scripts/f6/aislamiento_final.sh` (como el de F5 más: `replay` no referenciado desde `live`, mensajes de replay solo en su topic, recursos temporales a 0 con el topic y el grupo de replay exentos)
  → `docs/evidencias/f6/6.3-regresion.txt` (FR-014, SC-007)
- [x] T034 [US4] Resumir el paso 6.3 y proponer la pregunta de defensa: «¿Cómo demuestras que reenviar la misma versión no aumenta el número de terremotos si en `live` no puedes inyectar duplicados?»

**Punto de control del paso 6.3.** Revisar con la persona estudiante antes de continuar.

## Paso 6.4 — Mediciones de tiempo y memoria · Historia 6 · (en paralelo con 6.1)

**Objetivo**: medir tres operaciones a tres tamaños con tiempo y memoria.
**Prueba independiente**: repetir el procedimiento y obtener las mismas tablas de orden de magnitud.

- [x] T035 [P] [US6] Pruebas `scripts/f6/test_bench_datos.py` (con `pytest` mediante `scripts/f6/ejecutar.sh`, que monta `scripts/f6`): el generador produce exactamente N filas de forma determinista, **marcadas como sintéticas**, solo en el contenedor PostgreSQL temporal, sin tocar `live`/`historico`; tamaños 1 000, 10 000 y 100 000 (FR-019, FR-020)
- [x] T036 [P] [US6] `scripts/f6/bench_datos.py` y `scripts/f6/bench_medidas.py`: en un **contenedor PostgreSQL temporal propio** (nunca `CREATE DATABASE` en el servidor real) y un contenedor de medida, medir con reloj monotónico (mediana y p95 de repeticiones) y memoria (pico de `tracemalloc` y máximo residente, un proceso por tamaño) (a) la búsqueda de
  versiones por `event_id`, (b) la integración geográfica con el asignador del catálogo y (c) la agregación por ventanas de 1 h (Python y SQL), con equipo, estado y procedimiento anotados; eliminar los contenedores → `docs/evidencias/f6/6.4-mediciones.txt` (FR-019, FR-020, SC-010)
- [x] T037 [US6] Resumir las mediciones, **proponer** umbrales (si procede) y pedir su confirmación; sin declararlos cumplidos antes → anexo en `6.4-mediciones.txt` (FR-023)

**Punto de control del paso 6.4.** Revisar las medidas y los umbrales propuestos con la persona estudiante.

## Paso 6.5 — Comparaciones, 100 millones de registros y costes · Historia 6 · (en paralelo con 6.1)

- [x] T038 [P] [US6] `scripts/f6/bench_comparaciones.py`: búsqueda secuencial frente a diccionario (Python) y consulta sin índice (tabla de prueba sin clave) frente a con índice/clave, a los tres tamaños, tiempo
  y memoria; coste medio y peor caso observados → `docs/evidencias/f6/6.5-comparaciones.txt` (FR-021, SC-010)
- [x] T039 [P] [US6] Razonamiento para 100 millones de registros (memoria y disco por fila medidos, tamaño del índice, particionado por tiempo, archivado, límites de una sola máquina) con la proyección calculada a partir de las medidas, y una **propuesta de escalado y de mejoras** (§10, §12), en
  `docs/evidencias/f6/complejidad-costes.md` (borrador para F7, A-14) (FR-021, SC-011)
- [x] T040 [US6] Informe de costes en `docs/evidencias/f6/complejidad-costes.md`: hardware (equipo medido), electricidad, almacenamiento (tamaños reales de las bases), transferencia (tamaño real del feed por
  día y cuotas de ngrok y Netlify consultadas en sus páginas oficiales con fecha), mantenimiento y tiempo de desarrollo; **pedir a la persona estudiante** la tarifa eléctrica, la potencia y las horas, o marcarlos
  como supuesto; sin beneficios inventados (FR-022, SC-011)
- [x] T041 [US6] Resumir el paso 6.5 y proponer la pregunta de defensa: «¿Qué cambiaría en el diseño si hubiera 100 millones de registros en vez de unos miles?»

**Punto de control del paso 6.5.** Revisar el informe con la persona estudiante.

## Paso 6.6 — ngrok y Netlify · Historia 8 · (la preparación local puede ir tras 6.2; la publicación espera a PA-8)

**Objetivo**: dejar todo verificado en local y, con autorización, publicar y probar el túnel.
**Prueba independiente**: con el túnel activo, la URL de Netlify abre desde otro dispositivo y muestra datos reales.

- [ ] T042 [P] [US8] [DG4] Pruebas (primero fallan) `backend/tests/unit/test_cors_f6.py`: con `API_CORS_ORIGINS` = origen de Netlify + `http://localhost:4200`, el preflight acepta exactamente esos orígenes, rechaza otros y
  comodines, permite `GET`/`OPTIONS` y `ngrok-skip-browser-warning`; `frontend/tests/config.test.ts`: el `config.json` del repositorio no contiene secretos ni la URL del túnel (FR-027, FR-028)
- [ ] T043 [US8] [DG6] `scripts/f6/preparar-netlify.sh` (o `.ps1`), **después de T054**: guardar el hash de `frontend/public/config.json`, escribir la URL HTTPS de ngrok **antes de compilar**, con `skipNgrokWarning: true`, ejecutar `npm run build`, restaurar el original y comprobar que el hash coincide y que el build lleva la URL →
  `docs/evidencias/f6/6.6-build.txt` (FR-029, FR-030)
- [ ] T044 [US8] [DG4] Verificación local previa a publicar: preflight con `Origin` simulado contra una API temporal (no la real), solo la API publicada en `127.0.0.1` (`docker compose ps` y `ss`/`netstat`: Kafka y PostgreSQL sin puertos publicados), y enumerar las rutas que saldrían por el túnel, incluidas
  `/docs`, `/redoc` y `/openapi.json`, para decidir cuáles quedan → `docs/evidencias/f6/6.6-cors-local.txt` (FR-027, FR-028)
- [ ] T045 [P] [US8] `scripts/f6/escaneo_secretos.sh`: buscar el authtoken de ngrok, contraseñas, `.env` y claves en el repositorio, el historial reciente, `dist/` y las evidencias (sin imprimir valores) →
  `docs/evidencias/f6/6.6-secretos.txt` (FR-027, SC-014)
- [ ] T046 [US8] [DG4] [DG5] [DG6] `docs/evidencias/f6/procedimiento-ngrok-netlify.md`: guion para la persona estudiante (cuentas, authtoken en la configuración de ngrok, dominio estático si lo ofrece, crear
  el sitio de Netlify para conocer el origen exacto, fijar `API_CORS_ORIGINS` en el `.env` local, `ngrok http 8000`, `preparar-netlify`, publicar, cerrar y reabrir el túnel, qué hacer si la URL cambia) (FR-029, FR-031)
- [ ] T047 [US8] [DG4–DG6] [PA-8] [PA-3] **Se detiene hasta que la persona estudiante autorice y realice los pasos de cuenta, token y publicación; requiere T054 hecho.** Con su autorización: recrear `api` con el CORS definitivo (PA-3), comprobar la URL de Netlify desde otro dispositivo (datos, filtros, estado), el preflight real, que Kafka y PostgreSQL no son alcanzables por el
  túnel, y las filas «cerrar el túnel» (aviso y última lectura) y «volver a abrirlo» (recuperación automática) de §11 → `docs/evidencias/f6/6.6-publicacion.txt` y `6.6-tunel.md` (FR-011, FR-030, FR-031, SC-006, SC-014). Si no se autoriza, consta como **pendiente de la persona estudiante**
- [ ] T048 [US8] Resumir el paso 6.6 y proponer la pregunta de defensa: «¿Por qué CORS no es autenticación y qué ve el visitante si apagas el túnel?»

**Punto de control del paso 6.6.** Revisar con la persona estudiante; lo no autorizado queda pendiente.

## Paso 6.7 — Accesibilidad, diseño responsive y compatibilidad · Historia 7 · (en paralelo con 6.1)

- [ ] T049 [P] [US7] Redactar `docs/evidencias/f6/guion-accesibilidad.md`: recorrido con teclado y lector de pantalla (NVDA o Narrador) de filtros, selector de modo, estado, tabla, gráficas, comparación y mapa, con el
  resultado esperado de cada paso (FR-024)
- [ ] T050 [P] [US7] Comprobación scripteada `scripts/f6/a11y_dom.js`, reconstruida a partir de los criterios de `docs/evidencias/f5/5.7-escenarios.md` (§3): a 320, 375, 768, 1024 y 1440 px y con zoom del 200 %, sin desborde de la página, sin pérdida de contenido, objetivos ≥ 24 px, nombres accesibles y contraste →
  `docs/evidencias/f6/6.7-responsive.txt` (FR-024, FR-025, SC-012, SC-013)
- [ ] T051 [P] [US7] Contraste de la capa del mapa: muestrear los píxeles del teselado bajo los círculos, la leyenda y las fronteras, calcular las razones y documentar el resultado y la alternativa textual (la tabla)
  → `docs/evidencias/f6/6.7-contraste-mapa.txt` (FR-024, SC-012)
- [ ] T052 [P] [US7] [PA-9] Compatibilidad: Chromium del panel, Chrome real (Claude in Chrome, con permiso de la persona estudiante) y Edge o Firefox si existen; móvil emulado; lo no verificable (Firefox, Safari, dispositivo físico) como reserva por escrito (los tres primeros comparten motor) →
  `docs/evidencias/f6/6.7-compatibilidad.md` (FR-025, SC-013)
- [ ] T053 [US7] [PA-9] **La persona estudiante** ejecuta el guion con un lector de pantalla real (y Firefox o un móvil si puede) y anota el resultado en `docs/evidencias/f6/6.7-lector.md`; si no lo hace, la reserva
  permanece y consta como pendiente (FR-024, SC-012)
- [ ] T054 [US7] Corregir los hallazgos de T050–T053 en `frontend/src/app/` con su prueba primero en `frontend/tests/`; repetir `node --test` y el build; lo no corregible se documenta → `docs/evidencias/f6/6.7-correcciones.txt`
  (FR-026)
- [ ] T055 [US7] Resumir el paso 6.7 y proponer la pregunta de defensa: «¿Qué información del mapa solo está en el color y dónde está también en texto?»

**Punto de control del paso 6.7.** Revisar los hallazgos con la persona estudiante.

## Paso 6.8 — Estabilidad, recuperación y persistencia · Historia 5 · (tras 6.3)

**Objetivo**: comprobar que cada componente sobrevive a una parada y a un reinicio sin perder ni duplicar datos y sin operaciones destructivas.
**Prueba independiente**: con los invariantes iguales antes y después de cada ensayo.

- [ ] T056 [US5] [DG8] Línea base previa a los ensayos con `scripts/f6/invariantes.sh` (creado en T001) → `docs/evidencias/f6/6.8-linea-base.txt` (FR-015)
- [ ] T057 [US5] [DG8] [PA-5] Parar y arrancar el **consumidor en vivo** (`stop` / `start`) mientras el productor sigue ingiriendo: los mensajes esperan en Kafka y al arrancar el lag se drena sin duplicados, con lag 0 y reconciliación 0 (es la fila «Reiniciar consumidor» de §11); aparte, [PA-4] matar con `docker kill` el consumidor efímero de
  una reproducción en curso y repetirla sin duplicados → `docs/evidencias/f6/6.8-consumidor.txt` (FR-011, FR-015, FR-016, SC-008)
- [ ] T058 [US5] [DG8] [PA-5] Parar y arrancar el **productor** y la **API** (cada uno con su autorización): el productor retoma la ingesta sin huecos ni duplicados; la API vuelve `healthy` y el panel se recupera
  solo → `docs/evidencias/f6/6.8-productor-api.txt` (FR-015, FR-016, SC-008)
- [ ] T059 [US5] [DG8] [PA-5] `stop` y `start` de **Kafka** y de **PostgreSQL** (uno por ensayo, con autorización expresa cada vez): mensajes, offsets y datos conservados, mismos volúmenes →
  `docs/evidencias/f6/6.8-kafka-postgres.txt` (FR-015, FR-016, SC-008, SC-009)
- [ ] T060 [US5] [PA-6] **La persona estudiante** reinicia Docker Desktop o el equipo; Claude comprueba que los cinco servicios regresan `healthy` con los mismos contenedores y volúmenes →
  `docs/evidencias/f6/6.8-reinicio.txt` (el reinicio natural del 2026-11-08 queda citado como antecedente) (FR-015, SC-008, SC-009)
- [ ] T061 [US5] [DG8] [PA-5] [PA-4] Ejecución de estabilidad de **60 minutos como máximo** con la ingesta real y una reproducción: errores, reinicios y memoria de los contenedores con `docker stats` → `docs/evidencias/f6/6.8-estabilidad.txt` (FR-017, SC-008)
- [ ] T062 [P] [US5] Solo lectura: `recuperar --listar` y `--simular` y revisión de `docs/evidencias/f4/procedimiento-hueco.md`; documentar que la recuperación de un hueco real de USGS sigue siendo reserva →
  `docs/evidencias/f6/6.8-huecos.txt` (FR-018)
- [ ] T063 [US5] [PA-6] (Opcional) `docker compose down` **sin `-v`** seguido de `up -d`, solo con autorización expresa por separado: **recrea los contenedores de Kafka y PostgreSQL** (excepción acotada: el invariante es que volúmenes y datos son los mismos y los ids de contenedor cambian, no que se conserven);
  comprobar volúmenes y datos → `docs/evidencias/f6/6.8-down-up.txt`; si no se autoriza, consta como no realizado (FR-016, SC-009)
- [ ] T064 [US5] Resumir el paso 6.8 y proponer la pregunta de defensa: «¿Por qué reiniciar el consumidor no duplica nada y qué pasa con los mensajes que llegan mientras está parado?»

**Punto de control del paso 6.8.** Revisar con la persona estudiante antes del cierre.

## Paso 6.9 — Entregables, reproducibilidad y cierre · Historia 9

**Objetivo**: comprobar que el repositorio se arranca desde cero, tener el procedimiento de la defensa y cerrar F6 sin esperar a 6.10.
**Prueba independiente**: seguir el README en un proyecto paralelo y recorrer la lista de la Guía.

- [ ] T065 [US9] [DG7] [PA-7] **Después de T066.** Levantar un proyecto Compose paralelo e independiente (`-p observatorio_limpio` en todos los comandos, `API_PUERTO` distinto, `BACKEND_IMAGE` propia, volúmenes y red propios, `INGESTA_PUBLICAR=false`) siguiendo el README actualizado tal cual (esquemas, catálogo, carga histórica); medir el tiempo hasta `healthy`; comprobar `-p … ps` y `config`;
  bajar **solo ese proyecto sin `-v`**; comprobar que los servicios, imágenes y volúmenes reales no cambiaron. **Eliminar sus volúmenes (aunque sean temporales) exige [PA-11] específico**, por nombre exacto `observatorio_limpio_*`; sin él se conservan → `docs/evidencias/f6/6.9-entorno-limpio.txt` (FR-032, SC-015)
- [ ] T066 [P] [US9] Actualizar `README.md` (replay, comandos, variables, despliegue, pruebas, estructura de evidencias, estado de F6) y `.env.example` (todas las variables, sin credenciales reales); dependencias y
  Dockerfile ya fijados (FR-032, FR-035)
- [ ] T067 [US9] `docs/evidencias/f6/procedimiento-defensa.md` (borrador para F7): los cinco pasos de la Guía 3.2 (Compose y servicios, base e ingesta, ngrok y URL, panel, replay) y su ensayo en seco hasta donde no se publique → `docs/evidencias/f6/6.9-defensa-seco.txt`; y `docs/evidencias/f6/reproduccion-historica.md` (Guía 2.9: selección y cómo se obtuvo,
  cómo iniciarla y a qué velocidad, cómo se separa de lo actual, cómo se identifica «REPRODUCCIÓN», esperado y observado) (FR-033)
- [ ] T068 [US9] Recorrer los 13 puntos de la lista final de la Guía con estado y evidencia en `docs/evidencias/f6/lista-final.md`; los que dependen de F7 o de acciones de la persona estudiante constan como
  pendientes (FR-034, SC-016)
- [ ] T069 [US9] Ejecutar `scripts/f6/aislamiento_final.sh` (creado en T033) e invariantes finales → `docs/evidencias/f6/aislamiento.txt` (solo `live`/`historico`/`sintetico`/`replay` sin mezcla, solo la API publicada, 0 recursos temporales con el topic y el grupo de replay exentos, `docs/referencias`, `specs/001`–`004` y catálogo sin cambios,
  ningún `.env` ni secreto versionado) (FR-038, FR-039, SC-019)
- [ ] T070 [US9] Elaborar `docs/evidencias/f6/resultados.md`: cada SC-001 a SC-019 como «cumplido / medido / cumplido con reservas / pendiente de la persona estudiante» con su evidencia, FR por bloques, métricas, DG1–DG10,
  incidencias, limitaciones (cobertura USGS, recuperación de huecos sin hueco real, mediciones de una sola máquina, lector de pantalla, publicación, **SC-010 de F3 pendiente de observación**) y mapa de evidencias (FR-040, SC-018)
- [ ] T071 [US9] [DG9] Actualizar `docs/HOJA-DE-RUTA.md`: marcar 6.1–6.9 solo si las comprobaciones pasaron (lo condicionado o pendiente, con su texto) y 6.10 como pendiente, con 6.2 ya renombrado en T001; sin cambios en documentos del profesor ni en SDD anteriores
- [ ] T072 [US9] Revisión final independiente con los subagentes **Architect** (contraste con enunciado, contrato y constitución) y **QA Engineer** (reejecución de pruebas y de la matriz de escenarios); corregir los
  hallazgos relevantes dentro del alcance y documentar el dictamen y las reservas en `resultados.md`
- [ ] T073 [US9] Redactar en `resultados.md` las preguntas de defensa de F6 con sus respuestas esperadas (destino parametrizado, aislamiento del replay, casos controlados, `mode` en la API, conservar las fechas
  originales, ngrok y CORS, persistencia de Kafka, 100 millones, reproducibilidad)
- [ ] T074 [US9] Reejecutar al final la regresión completa (backend con `scripts/f6/ejecutar.sh`, `node --test`, `npm run build`), revisar `git status`, `git diff --check`, el escaneo de secretos y la lista de archivos que entrarán en el commit `[F6]`; comprobar que no hay credenciales ni `.env`; **no hacer commit ni push** → `docs/evidencias/f6/6.9-regresion-final.txt` (SC-007, SC-019)

**Punto de control de cierre.** La persona estudiante revisa el panel y los resultados y hace el commit `[F6]` manualmente. F6 se cierra técnicamente **sin esperar a 6.10** (A-11).

## Paso 6.10 — SC-010 de F3 (condicionado, fuera de la ruta crítica) · Historia 11

**No se ejecuta ni se inicia ninguna medición sin PA-10.** Mientras tanto, SC-010 de F3 sigue «pendiente de observación».

- [ ] T075 [US11] Preparar (sin ejecutar sobre la base real) `scripts/f6/sc010_f3.sql` (solo lectura): eventos con `event_time` anterior a 24 h de la activación (2026-11-06 16:54 UTC) en `evento_actual` y `evento_version`
  (> 0) y consulta de reconciliación vacía, con la sintaxis comprobada en una base temporal (FR-037, SC-018)
- [ ] T076 [US11] [PA-10] Con la autorización expresa y más de 24 h de funcionamiento, ejecutar las consultas y guardar la salida en `docs/evidencias/f3/sc-010-observacion-24h.txt`, anotando interrupciones
  (incluido el reinicio del 2026-11-08); no se declara cumplido si la comprobación no lo respalda (FR-037, SC-018)
- [ ] T077 [US11] Anexar el resultado a `docs/evidencias/f6/resultados.md` y a `docs/evidencias/f3/resultados.md` (solo la línea de SC-010) y actualizar la hoja; sin commit ni push

**Punto de control de 6.10.** Anexo posterior al cierre de F6.

---

## Cobertura de requisitos y criterios

| Requisito | Tareas | Criterios |
|---|---|---|
| FR-001 topic, esquema y `mode` | T005, T007, T008 | SC-001 |
| FR-002 selección | T003, T010 | SC-001 |
| FR-003 velocidad y tiempos | T004, T011, T028 | SC-002 |
| FR-004 casos controlados | T004, T010 | SC-003 |
| FR-005 reutilizar el consumidor | T006, T009 | SC-001 |
| FR-006 aislamiento | T005, T007, T012, T017, T020, T028 | SC-001, SC-019 |
| FR-007 repetible | T007, T011, T017 | SC-001 |
| FR-008, FR-009 API `mode` | T019, T021, T026 | SC-004 |
| FR-010 panel | T022, T023, T027 | SC-005 |
| FR-011 once pruebas de §11 (8 + 1 + 2) | T031, T057, T047 | SC-006 |
| FR-012 rastro | T030 | SC-006 |
| FR-013 sin datos ficticios en tablas definitivas | T007, T031 | SC-019 |
| FR-014 regresión | T014, T025, T033 | SC-007 |
| FR-015, FR-016 recuperación sin destruir | T016, T056–T060, T063 | SC-008, SC-009 |
| FR-017 estabilidad | T061 | SC-008 |
| FR-018 huecos | T062 | — (reserva) |
| FR-019, FR-020 mediciones | T035, T036 | SC-010 |
| FR-021 comparaciones y 10⁸ | T038, T039 | SC-010, SC-011 |
| FR-022 costes | T040 | SC-011 |
| FR-023 umbrales | T037 | SC-010 |
| FR-024, FR-025 accesibilidad y compatibilidad | T049–T053 | SC-012, SC-013 |
| FR-026 límites del frontend | T023, T054 | SC-007 |
| FR-027, FR-028 ngrok y CORS | T042, T044, T045, T047 | SC-014 |
| FR-029, FR-030 `config.json` y Netlify | T043, T046, T047 | SC-014 |
| FR-031 nada público sin autorización | T046, T047 | SC-014 |
| FR-032 reproducibilidad | T065, T066 | SC-015 |
| FR-033 procedimiento de defensa | T067 | SC-016 |
| FR-034 lista final | T068 | SC-016 |
| FR-035 `.env.example` y dependencias | T002, T066 | SC-015 |
| FR-036 matrices de F5 | T032 | SC-017 |
| FR-037 SC-010 de F3 | T075–T077 | SC-018 |
| FR-038, FR-039 cinco servicios y aislamiento | T002, T069 | SC-019 |
| FR-040 evidencias | T001, T070 | SC-016, SC-019 |

## Dependencias y orden

- **Preparación**: T001 → T002 (T002 puede ir en paralelo con T001 una vez aprobadas las decisiones); T001 crea `invariantes.sh` y `ejecutar.sh`, que usan T014, T016, T026, T035 y 6.8.
- **Ruta crítica del código**: 6.1 → 6.2 → 6.3. Dentro de 6.1: T003–T007 (pruebas) → T008 → T009/T010 → T011 → T012–T014 → T015 (PA-2) → T016 (PA-3) → T017 (PA-4). Dentro de 6.2: T019–T022 → T021/T023 → T024–T025 → T026 → T027–T028.
- **En paralelo con 6.1** (no dependen del replay): 6.4 (T035–T037), 6.5 (T038–T041) y 6.7 salvo T054 (T049–T053; T054 espera a T023 porque ambos tocan el frontend, y T043 y T047 esperan a T054 para no publicar un build sin las correcciones); la preparación local de 6.6 (T042–T046) puede empezar tras T021 y T023; la publicación (T047) espera a PA-8.
- **6.8** empieza tras 6.3 (T056 → T057–T063; T062 puede ir en paralelo). **6.9** empieza tras 6.3 (T066 antes de T065) y se completa cuando 6.4–6.8 han terminado o constan como pendientes.
- **6.10** no bloquea nada: T075 puede hacerse en cualquier momento; T076 solo con PA-10.
- Ejecutar con el sistema real únicamente lo marcado con PA; el resto usa bases, contenedores y APIs temporales.

## Estrategia de implementación

1. Aprobar DG1–DG10 (T001) y preparar la configuración (T002).
2. **MVP**: 6.1 y 6.2 (el replay visible en el panel). A su lado, y sin esperar, 6.4, 6.5 y 6.7.
3. 6.3 cierra la integración y la aceptación; 6.6 deja todo verificado en local; 6.8 ensaya la recuperación; 6.9 cierra con revisión independiente.
4. Lo que depende de la persona estudiante (PA-8, PA-9, PA-6, PA-10) se organiza como guion y consta como pendiente si no se ejecuta; no retrasa el cierre técnico.
