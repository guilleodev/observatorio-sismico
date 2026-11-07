# Tareas: Geografía e histórico (F4)

**Entrada**: documentos de `specs/003-geografia-historico/` (spec, plan, research, data-model, contracts, quickstart)
**Requisitos previos**: `plan.md`, `spec.md`. Fase **F4** de `docs/HOJA-DE-RUTA.md` (pasos 4.1 a 4.6). Commit previsto: **`[F4]`**.
**Pruebas**: se escriben antes de implementar (deben fallar) y se ejecutan con resultado real guardado en `docs/evidencias/f4/`.

## Formato: `[ID] [P?] [Historia] [Decisión] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias)
- **[Historia]**: US1 a US5 de la especificación (sin etiqueta en preparación y cierre)
- **[D1]–[D4]**: decisión principal de la que depende la tarea; la tabla siguiente es la referencia completa. D1–D4 se aprueban juntas en T001
- Las rutas son relativas a la raíz del repositorio

## Reglas transversales (aplican a todas las tareas)

- No hacer commits ni push: el commit de cierre **`[F4]`** lo realiza manualmente la persona estudiante desde VS Code.
- No marcar una verificación como superada sin ejecutarla; guardar la salida real en `docs/evidencias/f4/`. Tiempos y recuentos se anotan
  tal como se observan; los umbrales de rendimiento están **pendientes de medición** (SC-011): se proponen tras medir y los confirma la persona estudiante.
- **Datos**: no insertar eventos ficticios ni dañados en tablas definitivas (`live.*`, `geo.*`, `historico.*`); las pruebas con PostgreSQL
  usan una transacción que se revierte y, para interrupciones, una base/topic/grupo temporales. El histórico real se descarga de USGS.
  **No borrar volúmenes ni datos** (sin `down -v`, sin recrear Kafka ni PostgreSQL, salvo la prueba opcional de T040 con tu autorización expresa); una operación destructiva se consulta antes.
- **Despliegue (aprendizaje de F3)**: antes de reconstruir `consumer` o `producer`, comprobar lag 0 y la consulta de reconciliación vacía
  (`specs/002-ingesta-real-calidad/quickstart.md`); recrear solo esos contenedores (`up -d --no-deps`); `INGESTA_PUBLICAR=true` sigue en el `.env` local.
- No modificar `docs/referencias/`, `specs/001-mvp-evento-sintetico/`, `specs/002-ingesta-real-calidad/` ni los archivos de Angular. El catálogo
  `frontend/public/datos/paises.geojson` solo se lee.
- Al cerrar cada paso: resumir archivos, explicar el código por bloques, justificar decisiones y proponer una pregunta de defensa (`CLAUDE.md`).
- Python 3.13; la única dependencia nueva posible es Shapely (D1). Pruebas en `backend/tests/unit/` (las de integración con PostgreSQL también, como en F3).
- Terminología: «estado actual» = `live.evento_actual`; «sin país» = `country_id` nulo con `geo_resultado = 'sin_pais'`; `*_at` = `timestamptz`.

## Aprobaciones previas (decisiones de `plan.md`)

| Decisión | Afecta a | Si no se aprueba |
|---|---|---|
| **D1** Shapely para punto-en-polígono | T010–T016, T022–T025, T034 | Implementación propia (R-001): rediseñar T010 y T012 antes del paso 4.2 |
| **D2** esquemas `geo` e `historico` separados de `live` | T005–T008, T013, T029, T043 | Rediseñar el modelo de datos antes del paso 4.1 |
| **D3** carga de lote directa a PostgreSQL, originales en la base y exportados | T028–T041 | Definir otro canal (Kafka) o un volumen de archivos antes del paso 4.4 |
| **D4** recuperación a demanda por el canal real con `source` propio | T046–T052 (la detección T043–T045 no depende de D4); el cliente T032 lo comparten D3 y D4 | Dejar la recuperación solo documentada (`procedimiento-hueco.md`) |

Además de D1–D4, T001 ratifica por escrito las decisiones del modo autónomo: regla de frontera por menor `ADM0_A3` (R-002), margen de huecos de 6 h (R-009),
recuperación sin filtro de magnitud ni de tipo y los umbrales de rendimiento de SC-011 como pendientes de medición.

## Correspondencia con los pasos de la hoja de ruta

| Paso | Tareas | Hito técnico |
|---|---|---|
| 4.1 Explorar polígonos y códigos de país | T001–T009 | Catálogo validado y dimensión `geo.pais` |
| 4.2 Asignación punto-en-polígono | T010–T021 | Terremotos con país (tiempo real y ya almacenados) |
| 4.3 Océanos, fronteras y eventos sin país | T022–T027 | Casos límite medidos |
| 4.4 Carga histórica de 2025 | T028–T042 | Histórico reproducible y aislado |
| 4.5 Recuperación tras interrupciones > 24 h | T043–T053 | Huecos detectados y recuperables |
| 4.6 Validar histórico, trazabilidad y comparaciones | T054–T060 | Comparaciones preparadas y validadas |
| Cierre de F4 | T061–T066 | Resultados, revisión y cierre |

Cada tarea tiene un único paso principal. Los pasos son secuenciales; el 4.4 y el 4.5 dependen del asignador del 4.2.

---

## Bloque 1: Catálogo geográfico — paso 4.1

**Propósito**: conocer y validar el catálogo, y tener la dimensión `geo.pais` cargada sin tocar el flujo.

- [x] T001 Comprobar el entorno: cinco servicios `healthy`, lag 0, reconciliación de F3 vacía, `INGESTA_PUBLICAR=true`, `git status`, suite de 205 pruebas en
  verde (contenedor temporal), esquema `sintetico` con 18 filas; **confirmar por escrito la aprobación de D1 a D4** (las tareas condicionadas no empiezan sin ella);
  guardar en `docs/evidencias/f4/4.1-entorno.txt` Tomar también el recuento de filas de `live.*`, `geo.*` e `historico.*` y `docker volume ls` (referencia de SC-012); ratificar la lista del párrafo anterior.
- [x] T002 [P] [US1] Informe del catálogo con solo la biblioteca estándar (lectura): nº de entidades, unicidad y vacíos de `ADM0_A3`, tipos de geometría, CRS,
  entidades con `ISO_A3 = -99`, valores de `TYPE`, atributos usados (`NAME_ES`, `ADMIN`, `CONTINENT`, `SUBREGION`); guardar en `docs/evidencias/f4/4.1-catalogo.txt`
  (la validez geométrica se comprueba en T012, que necesita D1) **Resultado real:** `scripts/f4/explorar_catalogo.py` (solo biblioteca estándar); 177 entidades, `ADM0_A3` único, 148 `Polygon` + 29 `MultiPolygon`, CRS84, 5 con `ISO_A3 = -99` y 8 con `ADM0_A3` distinto de `ISO_A3`.
- [x] T003 [P] Ampliar `backend/src/observatorio/config.py` con `ConfigGeo` (`CATALOGO_PATH`, por defecto `/datos/paises.geojson`) con error claro si falta o no existe, y su prueba en `backend/tests/unit/test_config.py`
- [x] T004 [P] Actualizar `compose.yaml`, `.env.example` y `.gitignore`: montar `./frontend/public/datos/paises.geojson` como `/datos/paises.geojson:ro` **solo en `consumer`** (la carga de lote lo pasa con `-v`), e ignorar `data/historico/` y `data/respaldo/`; validar con
  `docker compose config`; probar el montaje con la ruta que contiene tildes y que escribir en él falla; no reiniciar aún los contenedores
- [x] T005 [D2] Crear `sql/003_esquema_f4.sql` (parte `geo`), idempotente, **exactamente según `data-model.md`**: `geo.pais` con `country_id text PRIMARY KEY CHECK (country_id <> '')`,
  `nombre_es`, `nombre_en`, `continente`, `subregion`, `tipo`, `iso_a3` nulo; `geo.catalogo` con `sha256` PK, `archivo`, `entidades`, `cargado_at`
- [x] T006 [D2] Aplicar `sql/003_esquema_f4.sql` al volumen existente con `psql -f` (comando como en el `README.md` de F3), re-aplicarlo, comprobar con `\d` y que
  `sintetico` (18 filas, misma huella) y los recuentos de `live.*` no cambian; guardar en `docs/evidencias/f4/4.1-migracion.txt`
- [x] T007 [US1] [D2] Pruebas (primero fallan) en `backend/tests/unit/test_catalogo.py`: `ADM0_A3` repetido o vacío, entidad sin geometría y archivo ilegible se rechazan
  con mensaje claro; el `sha256` es estable; el volcado a `geo.pais` es idempotente (PostgreSQL en transacción revertida)
- [x] T008 [US1] [D2] Crear `backend/src/observatorio/geo/__init__.py` y `catalogo.py`: lectura y validación del catálogo, `sha256` como versión, volcado idempotente (upsert) a
  `geo.pais` y `geo.catalogo`, y orden `python -m observatorio.geo.catalogo`; ejecutarla dos veces en el contenedor: 177 filas y segunda ejecución sin cambios;
  guardar en `docs/evidencias/f4/4.1-carga-catalogo.txt` **Resultado real:** 177 países y 1 versión de catálogo cargados; segunda ejecución con 177 sin cambios; datos de F3 y contenedores intactos.
- [x] T009 Resumir el paso 4.1 y proponer pregunta de defensa **Resultado real:** 4.1 no necesitó ninguna dependencia nueva (Shapely/NumPy se añaden en T010, paso 4.2); suite 223 pruebas pasan.

**Punto de control del paso 4.1.** Explicar el catálogo, por qué `ADM0_A3` y no ISO, y la versión por huella; pregunta de defensa; aprobar el paso 4.2 (D1).

---

## Bloque 2: Asignación punto-en-polígono — paso 4.2

**Propósito**: cada versión válida lleva su país dentro de la transacción y los eventos ya almacenados reciben el suyo.

- [x] T010 [D1] Añadir Shapely (y NumPy) a `backend/requirements.txt` con versión fijada tras comprobar que instala en `python:3.13-slim-trixie`; `docker compose build` y
  `python -c "import shapely"` en la imagen; si no instala, **detenerse** y consultar la alternativa de R-001; guardar en `docs/evidencias/f4/4.2-dependencia.txt` **Resultado real:** Shapely 2.2.0 (GEOS 3.14.1) y NumPy 2.5.4 fijados en `requirements.txt` y `requirements-dev.txt`; instalan e importan en `python:3.13-slim-trixie`.
- [x] T011 [P] [US1] Pruebas (primero fallan) en `backend/tests/unit/test_asignador.py` con polígonos de juguete construidos en la propia prueba (dos cuadrados adyacentes, uno con hueco):
  interior → `interior`; borde → `frontera`; esquina o borde compartido → `varias` con el menor `ADM0_A3`; hueco y exterior → `sin_pais`; mismo resultado en cada llamada Añadir: una geometría inválida (anillo auto-intersecado, como `USA` y `SDN` en el catálogo real) se **repara solo en memoria** con `make_valid` y se informa de ellas (política aprobada en 4.2); si no se puede reparar, aborta; y el borde se verifica con `STRtree.query` por `intersects` y confirmación con `covers`.
- [x] T012 [US1] [D1] Crear `backend/src/observatorio/geo/asignador.py`: carga los polígonos del catálogo, informa de geometrías inválidas antes de asignar, índice `STRtree`,
  `asignar(longitud, latitud) → Asignacion(country_id, nombre, resultado)` con la regla de R-002 (`covers`, menor `ADM0_A3`), sin usar `place` y con la huella del catálogo Guardar la comprobación de validez del catálogo real en `docs/evidencias/f4/4.2-validez-geometrias.txt` (SC-001). **Resultado real:** 2 de 177 geometrías inválidas (`USA`, `SDN`); reparadas en memoria por decisión aprobada; sin cambios de área ni de resultado.
- [x] T013 [P] [US1] [D2] Ampliar `sql/003_esquema_f4.sql` (parte `live`), idempotente: en `live.evento_actual` añadir `geo_resultado text CHECK (geo_resultado IN
  ('interior','frontera','varias','sin_pais'))`, `geo_catalogo text`, una restricción «`country_id` nulo ⇔ `geo_resultado = 'sin_pais'` cuando `geo_resultado` no es nulo» y
  `country_id` como clave foránea de `geo.pais`; aplicarlo a mano dos veces y guardar en `docs/evidencias/f4/4.2-migracion.txt`
- [x] T014 [US1] Pruebas (primero fallan) en `backend/tests/unit/test_consumidor_pais.py` (PostgreSQL revertido): un evento nuevo guarda país, nombre, `geo_resultado` y `geo_catalogo`; un mensaje
  repetido no cambia nada; una revisión con otras coordenadas actualiza el país; una versión antigua tardía no lo modifica; sin país se guarda como nulo Añadir: coordenadas límite (±180, ±90) sin error de procesamiento (FR-011); «sin país» **no** va a cuarentena (FR-006); un fallo forzado del asignador o del SQL no deja estado parcial ni confirma el offset (FR-007); y una violación de la clave foránea de país **no** se manda a cuarentena como «error permanente de persistencia» (hallazgo de revisión).
- [x] T015 [US1] Modificar `backend/src/observatorio/consumer/repositorio.py` (SQL del estado actual con los campos geográficos, solo cuando la versión gana) y
  `consumer/main.py` (cargar y validar catálogo y asignador al arrancar; si el catálogo no es válido o falta, **no procesar a ciegas**: el contenedor no pasa a `healthy`, no consume y registra el motivo; los mensajes esperan en el transporte); `evento_version` no cambia Al arrancar comprobar además que el `sha256` del archivo coincide con `geo.catalogo` y que todos los `ADM0_A3` del asignador existen en `geo.pais`; si no, no consume. Excluir la violación de la clave foránea de país de `ERRORES_PERMANENTES` (se trata como fallo de configuración). **Resultado real:** el consumidor espera sin consumir ni declararse sano si falta el catálogo o no coincide con la base (ensayo con recursos temporales); se recupera solo al corregirlo.
- [x] T016 [P] [US1] Crear `backend/src/observatorio/geo/retroactivo.py` y su orden `python -m observatorio.geo.retroactivo`: asigna donde `geo_resultado` es nulo o la huella del catálogo difiere,
  por lotes, incluidos los retirados, sin borrar ni duplicar; pruebas (PostgreSQL revertido): segunda ejecución con 0 filas cambiadas Cada `UPDATE` se condiciona a `updated_at` igual al valor leído (el consumidor sigue activo); prueba de la carrera: si entre la lectura y la escritura llega una versión más nueva, el país de ésta no se sobrescribe. **Resultado real:** 234 asignados, 2ª pasada 0 cambios, 0 discrepancias frente al recálculo independiente; prueba de carrera con mutación detectada.
- [x] T017 [US1] Comprobar que `GET /api/eventos` devuelve `country_id` y `country_name` reales o `null` sin cambiar el resto (`contracts/api-f4.md`), ampliando `backend/tests/unit/test_api_eventos.py`
- [x] T018 [US1] Ejecutar la suite completa en contenedor temporal (205 de F3 + nuevas); guardar en `docs/evidencias/f4/4.2-pruebas.txt`
- [x] T019 [US1] Desplegar: con lag 0 y reconciliación vacía, reconstruir y recrear **solo** `consumer` (`docker compose up -d --no-deps consumer`); comprobar `healthy`, lag 0,
  catálogo cargado en el arranque; guardar en `docs/evidencias/f4/4.2-despliegue.txt` **Antes de desplegar**, ensayo con un consumidor temporal y `CATALOGO_PATH` inexistente o corrupto: no pasa a `healthy`, no consume (el lag se mantiene) y no guarda ningún «sin país»; guardar en `docs/evidencias/f4/4.2-catalogo-ausente.txt`.
- [x] T020 [US1] Ejecutar la asignación retroactiva real dos veces: recuentos antes/después (ninguna fila borrada), todas con `geo_resultado`, segunda ejecución sin cambios;
  guardar en `docs/evidencias/f4/4.2-retroactivo.txt` Antes de ejecutarla, respaldo lógico de las columnas afectadas (`COPY` de `event_id, country_id, country_name` a `data/respaldo/`, ignorada por Git).
- [x] T021 [US1] Con eventos reales nuevos del feed comprobar país en `live.evento_actual` y en `/api/eventos`, reconciliación vacía y lag 0 (una revisión real, si ocurre, o su prueba); guardar en `docs/evidencias/f4/4.2-eventos-reales.txt` **Resultado real:** 4 eventos y 4 revisiones reales procesados con país; API con `country_id`/`country_name` reales o `null`; reconciliación 0, lag 0.

**Punto de control del paso 4.2.** Explicar la regla y la transacción; pregunta de defensa («¿por qué no el país más cercano?»); aprobar el paso 4.3.

---

## Bloque 3: Océanos, fronteras y eventos sin país — paso 4.3

**Propósito**: demostrar con una batería y con datos reales que los casos límite se tratan según la regla, y medirlos.

- [x] T022 [P] [US2] Batería de ≥ 20 puntos en `backend/tests/unit/test_asignador_limites.py` y su tabla de esperados, escrita **antes de ejecutar** a partir de conocimiento geográfico y de
  vértices compartidos del catálogo: países claros (p. ej. España, Japón, Chile, Alaska), mar abierto (Atlántico, Pacífico), borde exacto entre dos países, antimeridiano (Fiyi, Rusia
  en ±180°), polos, (0, 0), isla pequeña ausente, entidad dependiente o disputada; ejecutar y guardar en `docs/evidencias/f4/4.3-bateria.txt` (SC-003) Incluir un punto marino muy cercano a una costa (devuelve «sin país», no el país vecino: el asignador solo usa pertenencia, SC-002). **Resultado real:** 46 puntos (no 20) + los 7 536 vértices del catálogo + 290 polígonos + 5 000 aleatorios; 46/46 con la expectativa vigente. 3 esperados iniciales se revisaron (Nome, Taveuni, Sáhara Occidental) y ninguno era un error del asignador. Evidencia en `4.3-bateria.txt` y 52 pruebas en `test_asignador_limites.py`.
- [x] T023 [US2] Medir con los eventos reales de `live.evento_actual` la proporción de `interior`, `frontera`, `varias` y `sin_pais`, y listar 20 eventos «sin país» con su `place` para
  clasificarlos como mar o isla ausente; guardar en `docs/evidencias/f4/4.3-proporciones.txt` (sin fijar un porcentaje esperado, A-02) **Resultado real:** 38 eventos «sin país» (36 al empezar; el feed añadió 2): 32 en el mar o costa afuera, 4 en tierra o costa que el catálogo no recoge, 2 junto a islas de Vanuatu ausentes; 0 errores de lógica; 15,9 % de los eventos.
- [x] T024 [P] [US2] Contraste con `place` (solo como control) de ≥ 100 eventos con país: script `scripts/f4/contraste_place.py` ejecutado en contenedor, que toma el sufijo de `place` tras la última coma, lo normaliza y lo compara con `nombre_en`/`nombre_es` y una tabla de alias documentada (p. ej. estados de EE. UU.); registrar el porcentaje de coincidencia; listar discrepancias y su causa;
  guardar en `docs/evidencias/f4/4.3-contraste-place.txt` (SC-005) Cada discrepancia lleva una causa asignada (0 sin causa). **Resultado real:** 201 eventos con país, 200 con criterio, 199 coincidencias (99,5 %), 1 discrepancia con causa (referencia en la India, epicentro en el polígono de China); 196 de 201 son de EE. UU.: la diversidad internacional se recontrastará con el histórico en 4.6.
- [x] T025 [P] [US2] Medir en `scripts/f4/medir_asignacion.py` el tiempo por evento con `STRtree` frente a recorrido secuencial de los polígonos (puntos de los eventos reales y una rejilla de
  puntos solo de medición, sin guardarla); guardar en `docs/evidencias/f4/4.3-rendimiento.txt` **Resultado real:** ~10 µs por asignación; arranque ~25 ms; STRtree 2,6× el recorrido secuencial; sobrecoste medido en el guardado ~75 µs (incluye claves foráneas y la fila más ancha). **Umbrales de SC-011 siguen pendientes**: nada se declara cumplido.
- [x] T026 [US2] Documentar en `docs/evidencias/f4/regla-geografica.md` la regla de frontera y varias coincidencias, la escala 1:110 millones, el significado de «Sin país asignado» y los límites
  conocidos (islas, costa), con ejemplos de las mediciones anteriores **Resultado real:** `docs/evidencias/f4/regla-geografica.md`.
- [x] T027 Resumir el paso 4.3 y proponer pregunta de defensa **Resultado real:** suite de 316 pruebas pasa; sin datos de prueba en las tablas definitivas; invariantes de F3 intactos; contenedores sin cambios.

**Punto de control del paso 4.3.** Explicar la batería, las proporciones y la limitación de escala; pregunta de defensa; aprobar el paso 4.4 (D3).

---

## Bloque 4: Carga histórica de 2025 — paso 4.4

**Propósito**: histórico descargado una vez, reproducible, trazable y aislado.

- [x] T028 [P] [D3] Ampliar `config.py` con `ConfigHistorico` (`HISTORICO_ANIO`=2025, `HISTORICO_MAG_MIN`=4, `HISTORICO_LIMITE`=20000 configurable, URL base del catálogo FDSN) con errores claros y su
  prueba en `backend/tests/unit/test_config.py`; reflejarlas en `.env.example`
- [x] T029 [P] [US3] [D2] Ampliar `sql/003_esquema_f4.sql` (parte `historico`), idempotente, **exactamente según `data-model.md`**: `historico.consulta` (`UNIQUE (inicio, fin, filtros)`,
  `resultado` ∈ `ok`/`error`/`subdividido`), `historico.archivo` (`consulta_id` PK y FK, `contenido_gz bytea NOT NULL`, `sha256`), `historico.evento` (`event_id` PK, mismos rangos de
  coordenadas que `live`, `country_id` FK, `raw jsonb NOT NULL`), `historico.cuarentena` (`huella text NOT NULL UNIQUE`); aplicar a mano dos veces; guardar en `docs/evidencias/f4/4.4-migracion.txt`
- [x] T030 [P] [US3] Refactor sin cambio de comportamiento: extraer de `backend/src/observatorio/consumer/mensaje.py` la validación de un *Feature* para reutilizarla en el histórico; las pruebas de F3
  (`test_mensaje_calidad.py`, `test_cuarentena.py`, `test_errores_permanentes.py`) pasan **sin modificarlas**
- [x] T031 [P] [US3] [D3] Pruebas (primero fallan) del cliente en `backend/tests/unit/test_fdsn.py` con servidor HTTP local simulado: `count` y `query`, 429 con `Retry-After`, 5xx, tiempo agotado, JSON
  inválido, y recuento igual al límite que fuerza la subdivisión Añadir: tramo con 0 resultados (correcto, `obtenidos = 0`, sin reintentos) y tramo que ya no se puede subdividir (cota mínima, se registra el error sin recursión infinita).
- [x] T032 [US3] [D3] Crear `backend/src/observatorio/historico/__init__.py` y `fdsn.py` (cliente con `urllib`, reintentos como en F3, parámetros reproducibles en la URL) El cliente cuenta las peticiones HTTP realizadas (`peticiones_http`) y ofrece un modo de solo recuento (`count`).
- [x] T033 [P] [US3] [D3] Pruebas (primero fallan) del cargador en `backend/tests/unit/test_cargador.py`: 12 tramos mensuales UTC de 2025, subdivisión recursiva con límite pequeño, deduplicación de un extremo
  compartido (conserva el mayor `updated`), cuadre `Σ obtenidos − Σ duplicados = eventos + cuarentena`, reutilización de archivos (0 consultas), reanudación tras un tramo incompleto, inválidos a cuarentena Añadir: evento con `time` ≥ fin del tramo (extremo inclusivo, p. ej. 2026-01-01T00:00:00Z) descartado y contado como `fuera_de_tramo`, y tramo padre `subdividido` solo tras completar los hijos.
- [x] T034 [US3] [D3] Crear `backend/src/observatorio/historico/repositorio.py`, `cargador.py` y `main.py` (el punto de entrada es el propio módulo `cargar.py`, que hace de `main.py`): una transacción por tramo (consulta + archivo comprimido con `sha256` + eventos con país),
  clave del tramo para reanudar, orden `python -m observatorio.historico.cargar`; ejecutada con `docker compose run --rm --no-deps producer ...`, sin Kafka ni servicio nuevo Antes de ejecutar, `docker compose build` (sin recrear contenedores en marcha). Pasa el catálogo y la carpeta de exportación con `-v` (`/datos/paises.geojson:ro` y `/exportacion`); cada archivo se exporta además a `data/historico/` con su `sha256` (R-007).
- [x] T035 [US3] Ejecutar la suite completa en contenedor temporal; guardar en `docs/evidencias/f4/4.4-pruebas.txt` Precedida de `docker compose build`.
- [x] T036 [US3] Ensayo en base temporal contra el servidor simulado: matar la carga a mitad y reanudarla (sin duplicados ni tramos perdidos); guardar en `docs/evidencias/f4/4.4-interrupcion.txt`
- [x] T037 [US3] Con USGS real, con el cliente de T032 en modo solo recuento (**solo `count`**, sin descargar datos): recuento por mes y anual frente a lo esperado, y comportamiento de `endtime` en el límite; guardar en `docs/evidencias/f4/4.4-recuentos-usgs.txt`
- [x] T038 [US3] Repetir el `count` mensual justo antes y ejecutar la **carga real** de 2025 una vez; guardar log, recuentos por mes frente a `count` (SC-006), total, duplicados, cuarentena, tamaño de los archivos y tiempo en `docs/evidencias/f4/4.4-carga-real.txt` Comparar por mes de `event_time`: eventos + cuarentena del mes = `count` del mes; registrar y explicar cualquier diferencia por revisiones posteriores de USGS.
- [x] T039 [US3] Repetir la carga: 0 consultas a USGS y recuentos idénticos (SC-007); guardar en `docs/evidencias/f4/4.4-repeticion.txt` La prueba es `peticiones_http = 0` en el resumen de la ejecución.
- [x] T040 [US3] Persistencia sin borrar nada: `docker compose restart postgres`, `docker compose stop` + `start` de todo el stack y, **opcional y solo con tu autorización expresa** (excepción a la regla de no recrear; lección de F3), `docker compose down` + `up -d` **sin `-v`** para probar la recreación (precondiciones: lag 0 y reconciliación vacía; si no se autoriza, queda como no probada y se justifica con la persistencia de volúmenes ya verificada); comprobar histórico y archivos íntegros y los cinco — La recreación opcional (`down` + `up -d` sin `-v`) NO se probó: requiere autorización expresa y no se pidió; queda justificada con la persistencia de volúmenes ya verificada (restart y stop/start sin pérdida).
  servicios `healthy`; guardar en `docs/evidencias/f4/4.4-persistencia.txt` Recalcular el `sha256` de cada fila de `historico.archivo` y de los archivos exportados y compararlo con el anterior.
- [x] T041 [US3] Aislamiento: 0 filas de `historico` en `live` y en `/api/eventos`, 0 filas de `live` en `historico`, `sintetico` intacto; guardar en `docs/evidencias/f4/4.4-aislamiento.txt` (SC-008)
- [x] T042 Resumir el paso 4.4 y proponer pregunta de defensa

**Punto de control del paso 4.4.** Explicar tramos, deduplicación, archivos y reanudación; pregunta de defensa; aprobar el paso 4.5 (D4).

---

## Bloque 5: Recuperación tras interrupciones superiores a 24 h — paso 4.5

**Propósito**: huecos detectados automáticamente y recuperables a demanda por el canal real.

- [x] T043 [P] [US4] [D4] Ampliar `sql/003_esquema_f4.sql` con `live.hueco` (`id bigserial` PK, `inicio`, `fin` con `CHECK (fin > inicio)`, `detectado_at`, `estado` ∈ `pendiente`/`recuperado`,
  `recuperado_at`, `eventos_publicados`), idempotente; aplicar a mano dos veces; guardar en `docs/evidencias/f4/4.5-migracion.txt`
- [x] T044 [P] [US4] Pruebas (primero fallan) de detección en `backend/tests/unit/test_huecos.py` (PostgreSQL revertido): > 24 h anota `inicio = anterior − 1 h` y `fin = ahora − 24 h`; ≤ 24 h no anota; repetir no
  duplica; sin consulta previa no hay hueco Añadir: intervalo exactamente igual al umbral (`24 h − margen`), margen 0 (`CHECK (fin > inicio)`), segundo intento con el mismo `(inicio, fin)` (`UNIQUE`) y ningún hueco en modo seco.
- [x] T045 [US4] Modificar `backend/src/observatorio/producer/repositorio.py` e `ingesta.py`: detectar el hueco al registrar una consulta correcta, antes de actualizar `estado_ingesta`; el margen (6 h por defecto, aplicado por ambos lados) es la variable `HUECO_MARGEN_S` de `ConfigIngesta`, documentada en `.env.example`; el hueco se anota en la misma transacción de `registrar_ok`, con advertencia en el registro y sin anotar en modo seco
- [x] T046 [P] [US4] [D4] (en `test_source_recuperacion.py`, para no modificar las pruebas de F3) Pruebas (primero fallan): el consumidor admite `usgs-fdsn-recuperacion` y descarta cualquier otro `source`, conservándolo en `evento_version`/`evento_actual` (ampliar `backend/tests/unit/test_mensaje_calidad.py`)
- [x] T047 [US4] [D4] Modificar `backend/src/observatorio/config.py` y `consumer/mensaje.py` para admitir ambos `source` (`contracts/mensaje-kafka.md`) sin cambiar el resto de reglas
- [x] T048 [P] [US4] [D4] Pruebas (primero fallan) en `backend/tests/unit/test_recuperacion.py` con catálogo simulado: consulta del hueco sin filtro de magnitud, subdivisión, omisión de lo ya publicado con el mismo
  `updated`, publicación de lo desconocido o revisado, hueco marcado `recuperado`, repetición sin cambios, interrupción a mitad La omisión se decide contra lo **guardado** (`evento_version`/`cuarentena`), no contra `version_publicada`: se reenvía lo publicado que nunca se guardó; la consulta al catálogo no lleva `eventtype` ni `minmagnitude`.
- [x] T049 [US4] [D4] Crear `backend/src/observatorio/recuperacion/__init__.py` y `recuperar.py`: orden a demanda `python -m observatorio.recuperacion.recuperar`, reutiliza la publicación del productor y el cliente del
  paso 4.4; ejecutable con `docker compose run --rm --no-deps producer ...` Incluye `--listar` (huecos pendientes). Precedida de `docker compose build`.
- [x] T050 [US4] Ensayo extremo a extremo en recursos temporales (base, topic, grupo y consumidor aparte, como en F3): simular una última ingesta correcta de más de 24 h, comprobar el hueco, recuperar, repetir;
  eventos una vez y con su `source`, otro hueco < 24 h sin recuperación; guardar en `docs/evidencias/f4/4.5-recuperacion.txt` (SC-009) El catálogo es simulado; la recuperación contra USGS real solo se ejecutará ante un hueco real.
- [x] T051 [US4] Desplegar `producer` y `consumer` (precondiciones del despliegue; solo esos contenedores); observar ≥ 10 ciclos: 0 huecos anotados en funcionamiento normal, lag 0, reconciliación vacía; guardar en `docs/evidencias/f4/4.5-despliegue.txt`
- [x] T052 [P] [US4] Documentar en `docs/evidencias/f4/procedimiento-hueco.md` el procedimiento real (detectar, recuperar, verificar) con los comandos probados, y los límites (hueco > 24 h solo hasta lo que conserve el catálogo; sin reconciliar eliminaciones, FR-022 de F3) Documentar también los límites: consumidor parado más de 24 h (los mensajes se pierden con la retención y se recuperan comprobando lo guardado) y Kafka caído con USGS accesible (el hueco no se detecta).
- [x] T053 Resumir el paso 4.5 y proponer pregunta de defensa

**Punto de control del paso 4.5.** Explicar detección frente a recuperación y por qué se recupera por el canal real; pregunta de defensa; aprobar el paso 4.6.

---

## Bloque 6: Validación de histórico, trazabilidad y comparaciones — paso 4.6

**Propósito**: comparar ventanas equivalentes con números comprobados y cerrar la calidad, el rendimiento y la trazabilidad.

- [x] T054 [P] [US5] (el ayudante `scripts/f4/comparacion.py` calcula la variación; no es un módulo de producción) Pruebas (primero fallan) en `backend/tests/unit/test_comparacion.py` (en una **base temporal** con el esquema aplicado y sin datos reales, para que los ficticios no se mezclen con los 18 302 reales): media = total / 365 con días de cero eventos, ámbito de un
  país y «sin país», magnitud nula aparte, media cero → «no definida», umbral < 4 elevado a 4 en ambos periodos, ventana horaria (total / 8 760) Incluir: ventana con intersección de un hueco pendiente, `periodo_reciente_incompleto`, mediana diaria, días derivados del intervalo (no fijos en 365) y sesión con zona horaria distinta de UTC.
- [x] T055 [US5] Crear `sql/consultas/comparacion.sql` con las consultas de referencia de [contracts/consultas-comparacion.md](contracts/consultas-comparacion.md) (sin módulo de producción ni endpoints: son de F5; la prueba T054 lee este archivo) y el cálculo de la variación en la prueba; el resultado incluye `periodo_reciente_incompleto = true` (FR-021) y la variación «no definida» cuando la media es 0
- [x] T056 [US5] Ejecutar con datos reales (global, el país con más eventos y «sin país») y contrastar con un recuento independiente calculado en Python directamente sobre los archivos de `historico.archivo`;
  guardar en `docs/evidencias/f4/4.6-comparaciones.txt` (SC-010), con la advertencia de periodo reciente incompleto y los sesgos de R-010 Precondición: `geo_resultado IS NULL` = 0 filas; «sin país» se mide con `geo_resultado = 'sin_pais'`.
- [x] T057 [US5] Cuadres de trazabilidad (R-011): evento → consulta → archivo con `sha256` recalculado, recuentos por mes frente a `count`, total anual, `geo_catalogo` vigente, ningún evento sin `geo_resultado`; guardar en `docs/evidencias/f4/4.6-trazabilidad.txt`
- [x] T058 [US5] Calidad del histórico con las seis dimensiones usadas en F3 (completitud, unicidad, validez, consistencia, actualidad, exactitud) y proporción de «sin país» histórica; guardar en `docs/evidencias/f4/4.6-calidad.txt`
- [x] T059 [US5] Rendimiento e índices: tiempo medio por evento de la asignación, de la asignación retroactiva y de la carga completa **desde archivos locales** (en una base temporal, sin red) y `EXPLAIN ANALYZE` con y
  sin los índices de `historico.evento`; proponer los umbrales de SC-011 a partir de lo medido (el criterio queda «medido, umbral pendiente» hasta que los confirmes); retirar el índice que no aporte con `DROP INDEX IF EXISTS` en `sql/003_esquema_f4.sql`; guardar en `docs/evidencias/f4/4.6-rendimiento.txt` (SC-011)
- [x] T060 [US5] Suite completa en contenedor temporal más las comprobaciones de F3 (reconciliación vacía, lag 0, 0 duplicados); guardar en `docs/evidencias/f4/4.6-pruebas.txt` (SC-012) Comparar los recuentos de `live.*`, `geo.*` e `historico.*` y `docker volume ls` con los de T001, explicando la actividad legítima del consumidor (SC-012).

**Punto de control del paso 4.6.** Explicar la comparación, la media con ceros y los sesgos; pregunta de defensa.

---

## Bloque 7: Cierre y pulido — hito «Geografía e histórico»

- [x] T061 Registrar en `docs/evidencias/f4/resultados.md` el resultado **observado** de SC-001 a SC-012, con los incumplidos y las limitaciones
- [x] T062 [P] Actualizar `README.md` (catálogo, carga histórica reproducible, recuperación de huecos, variables nuevas, migración manual de `003`) y marcar los pasos 4.1 a 4.6 en `docs/HOJA-DE-RUTA.md` solo si las pruebas son satisfactorias
- [x] T063 Comprobar el aislamiento final: 0 filas de modo distinto de `live` en `live.*`, ninguna mención de `synthetic`/`sintetico` en `backend/src`, Kafka y PostgreSQL sin puertos publicados, `sintetico` intacto (18 filas, misma huella),
  `docs/referencias/`, `specs/001` y `specs/002` sin cambios, catálogo de países sin modificar; guardar en `docs/evidencias/f4/4.6-aislamiento.txt` Comprobar que `docker compose config --services` lista exactamente 5 servicios (FR-025).
- [x] T064 Revisión final: **Architect** y **QA Engineer** (independientes); corregir solo hallazgos dentro del alcance y repetir las pruebas afectadas
- [x] T065 `git status`, `git diff --check`, comprobación contra la constitución, contraste con `ENUNCIADO.md` y `CONTRATO-API.md`; preparar la explicación por bloques y tres preguntas de defensa con respuestas esperadas
- [x] T066 Dejar anotado en `resultados.md` lo pendiente de otras fases (SC-010 de F3 en F6; endpoints, filtros y panel en F5)

**Punto de control del hito «Geografía e histórico» (cierre de F4)**: **detenerse**; revisión humana y commit manual **`[F4]`**.

---

## Dependencias y orden de ejecución

- **Bloque 1** → **2** → **3** → **4** → **5** → **6** → **7**.
- Bloque 1: T001 primero; T002, T003, T004 y T005 en paralelo; T006 tras T005; T007 tras T006 y antes de T008; T008 tras T003, T005 y T006; T013 tras T006 (la clave foránea necesita `geo.pais`).
- Bloque 2: T010 y T011 antes de T012; T013 independiente de T012; T014 tras T012 y T013; T015 tras T014; T016 tras T012 y T013; T018 tras T015–T017; T019 tras T018; T020 tras T019; T021 tras T020.
- Bloque 3: T022 y T025 en paralelo tras T012; T023 y T024 requieren T020; T026 tras T022–T025.
- Bloque 4: T028, T029, T030 y T031 en paralelo; T032 tras T031; T033 tras T029 y T030; T034 tras T032 y T033; T035–T036 tras T034; T037 tras T032 (usa su modo de solo recuento); T038 tras T035–T037; T039–T041 tras T038.
- Bloque 5: T043, T044, T046 y T048 en paralelo; T045 tras T043 y T044; T047 tras T046; T049 tras T034, T047 y T048; T050 tras T045 y T049; T051 tras T050; T052 tras T050.
- Bloque 6: T054 sin esperar a la carga; T058 tras T038; T055 tras T054; T056–T057 tras T038 y T055; T059 tras T038; T060 al final del bloque.
- Bloque 7: T062 tras T060; T063 tras T060; T061 tras T060 y T063; T064 tras T061–T063; T065 y T066 tras T064.

### Oportunidades de paralelismo

- T002, T003, T004 y T005; T022 y T025; T028–T031; T043, T044, T046 y T048.

## Estrategia de implementación

1. **Mínimo defendible (4.1–4.2)**: catálogo validado y país en el tiempo real y en lo ya almacenado; es el núcleo de «¿dónde hay actividad?».
2. **Añadir 4.3** para medir y defender los casos límite, y **4.4** para tener la línea base de 2025 (necesaria para la comparación de F5).
3. **Añadir 4.5** (recuperación) y **4.6** (comparaciones y cierre). Cada paso termina con punto de control y explicación; las decisiones D1–D4 se aprueban justo antes del paso que bloquean.
