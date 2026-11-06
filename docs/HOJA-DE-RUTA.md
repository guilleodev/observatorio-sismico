# Hoja de ruta — Observatorio Sísmico

> **Plan de referencia · Noviembre de 2026**  
> **Primera implementación:** Claude Code  
> **Segunda implementación:** Codex (una vez finalizada la primera)  
> **Metodología:** GitHub Spec Kit (SDD) + MVP + agentes + pruebas + aprendizaje

Esta hoja es **orientativa**: no sustituye a los requisitos del profesor (`docs/referencias/ENUNCIADO.md`, `CONTRATO-API.md`, `FAQ-ALUMNADO.md`, `Guia-entregables-observatorio-sismico.md`). Si hay conflicto, **gana el profesor**. Las fases, los pasos, Spec Kit y los subagentes son decisiones nuestras de desarrollo. La nomenclatura de fases, pasos y commits se reorganizó el 3 de noviembre de 2026 (sección 3).

## 1. Objetivo y estrategia

Construir un **Observatorio de Actividad Sísmica** que cumpla el enunciado del profesor, analice terremotos recientes e históricos y permita explicar y defender técnicamente cada componente.

Orden de trabajo:

1. Estudiar los requisitos y entender la arquitectura.
2. Desarrollar el proyecto completo con **Claude Code** mediante SDD, empezando por un MVP.
3. Revisar el código por bloques, ejecutar pruebas y reunir evidencias durante todas las fases.
4. Preparar la memoria y la defensa individual.
5. Desarrollar una **segunda versión independiente con Codex**, partiendo del mismo material inicial y sin copiar el código generado por Claude.

**Principios:** no programar el proyecto entero en un único prompt; trabajar por hitos verificables; distinguir los requisitos obligatorios de las recomendaciones técnicas; evitar complejidad innecesaria.

## 2. Arquitectura obligatoria

```text
USGS (feed reciente e histórico) + Natural Earth
                 |
                 v
      Productor Python (aiokafka)
                 |
                 v
            Apache Kafka
                 |
                 v
      Consumidor Python (aiokafka)
          |              |
          |     Integración geográfica
          v
           PostgreSQL
                 |
                 v
              FastAPI
                 |
                 v
           ngrok (HTTPS)
                 |
                 v
       Angular + Leaflet (Netlify)
```

**Cinco servicios obligatorios de Docker Compose:** productor, Kafka, consumidor, PostgreSQL y API. El frontend se publica por separado en Netlify. La API se expone mediante ngrok; Kafka y PostgreSQL no deben exponerse públicamente.

## 3. Nomenclatura y fases

- **Fases:** F0, F1, F2, F3, F4, F5, F6 y F7.
- **Pasos:** `1.1`, `1.2`…; `2.1`, `2.2`…; etc. El primer número es la fase. Un paso es una unidad de trabajo revisable y validable antes de continuar.
- **Commits:** `[F1]`, `[F2]`, `[F3]`…, con prefijo Git apropiado (`docs:`, `feat:`, `chore:`). Un número entre corchetes identifica la **fase que se cierra**, no una versión del software.

> **Nota sobre `F0.1`:** el commit histórico `chore: [F0.1] configurar Claude Code y metodología SDD` ya existe y **no se reescribe**. Es el único commit con ese formato antiguo; no debe confundirse con el paso `0.1`.

| Fase | Objetivo | Criterio de cierre |
|---|---|---|
| **F0 — Configuración de IA y metodología SDD** | Preparar Claude Code, GitHub Spec Kit, constitución, especificación y plan del MVP, tareas SDD y subagentes. | Entorno de trabajo y especificaciones iniciales preparados. |
| **F1 — Fuentes y frontend inicial** | Ejecutar Angular en demo; explorar USGS, GeoJSON, campos, unidades y nulos. | Mapa inicial comprobado y fuentes documentadas. |
| **F2 — MVP funcional** | Conectar productor Python → Kafka → consumidor → PostgreSQL → FastAPI → Angular. | Un evento sintético identificado completa el recorrido y aparece en el mapa. |
| **F3 — Ingesta real y calidad** | Extracción real de USGS cada 60 s, versiones, idempotencia, validación, cuarentena y estado de ingesta. | Ingesta real periódica sin duplicados; reenvíos y revisiones tratados correctamente, con pruebas; `synthetic` retirado o aislado. |
| **F4 — Geografía e histórico** | Integrar países mediante punto-en-polígono y cargar el histórico de 2025. | Eventos enriquecidos, histórico reutilizable y recuperación tras paradas documentada. |
| **F5 — API y dashboard** | Filtros, estadísticas, ventanas, comparaciones y panel completo. | Observatorio analítico funcional, filtros coherentes y estado visible. |
| **F6 — Replay, pruebas y despliegue** | Replay aislado, pruebas de aceptación, mediciones, ngrok y Netlify. | Demostración reproducible desde otro dispositivo y mediciones completas. |
| **F7 — Memoria y defensa** | Consolidar documentación, benchmarks, costes, conclusiones y evidencias. | Entrega completa y explicación individual preparada. |

> **Nota:** la documentación, las pruebas y el estudio del código se hacen **durante todas las fases**; no se posponen hasta F7.

### MVP inicial

El MVP consiste en un **recorrido completo de un solo evento sintético**: publicación por el productor, transporte en Kafka, procesamiento por el consumidor, almacenamiento en PostgreSQL, consulta desde FastAPI y representación en Angular. Es un **hito intermedio, no la entrega final**. Su especificación está en `specs/001-mvp-evento-sintetico/`.

## 4. Pasos por fase

Estado: ✅ completado con evidencia · ⏸ aplazado · ⬜ pendiente.

### F0 — Configuración de IA y metodología SDD · ✅ completada (commit `[F0.1]` realizado)

Pasos originales de la hoja, conservados:

| Paso | Qué haremos | Estado |
|---|---|---|
| 0.1 | Integrar GitHub Spec Kit (SDD) | ✅ Spec Kit v1.2.6 inicializado (`.specify/`, `.claude/skills/speckit-*`) |
| 0.2 | Preparar la constitución del proyecto | ✅ `.specify/memory/constitution.md` (v1.0.2) |
| 0.3 | Definir el alcance y los criterios de aceptación del MVP | ✅ `specs/001-mvp-evento-sintetico/` (spec, plan, research, data-model, contracts, quickstart, tasks) |
| 0.4 | Configurar los primeros subagentes: Architect y QA Engineer | ✅ `.claude/agents/architect.md` y `qa-engineer.md` |
| 0.5 | Preparar las skills necesarias | ⏸ Las skills propias **no se han creado**; se crearán cuando hagan falta (ver sección 7) |
| 0.6 | Validar la configuración antes de iniciar el desarrollo | ✅ Revisión final con Architect y QA Engineer |

### F1 — Fuentes y frontend inicial · ✅ completada (commit `[F1]` realizado)

| Paso | Qué haremos | Estado |
|---|---|---|
| 1.1 | Ejecutar el frontend Angular proporcionado por el profesor | ✅ `docs/FASE-1-FUENTES-Y-FRONTEND.md` §1 |
| 1.2 | Explorar la estructura del frontend y entender Leaflet | ✅ ídem §2 |
| 1.3 | Consultar USGS y estudiar los datos GeoJSON | ✅ ídem §3 y §4 |
| 1.4 | Analizar campos, coordenadas, valores nulos y calidad | ✅ ídem §5 y §6 |
| 1.5 | Documentar resultados, verificar requisitos y preparar commit | ✅ ídem; incidencia de formato del frontend resuelta (§9) |

### F2 — MVP funcional · ✅ pasos completados · ⬜ commit `[F2]` pendiente

| Paso | Qué haremos | Estado |
|---|---|---|
| 2.1 | Revisar SDD y preparar estructura del backend | ✅ |
| 2.2 | Configurar Docker Compose con los cinco servicios | ✅ (`postgres` y `kafka` verificados `healthy`; `producer`, `consumer` y `api` aún no pueden arrancar por falta de puntos de entrada; T015 configurada, validación final en 2.8) |
| 2.3 | Crear productor Python de eventos sintéticos | ✅ |
| 2.4 | Configurar Kafka y verificar la publicación de mensajes | ✅ |
| 2.5 | Crear consumidor y persistencia PostgreSQL | ✅ |
| 2.6 | Implementar API mínima con FastAPI | ✅ |
| 2.7 | Conectar Angular y visualizar el terremoto | ✅ |
| 2.8 | Ejecutar pruebas de extremo a extremo y cerrar MVP | ✅ |

*Correspondencia orientativa con `specs/001-mvp-evento-sintetico/tasks.md` (por revisar al empezar F2).* Cada tarea tiene **un único paso principal**; las dependencias entre pasos se indican aparte y no duplican la asignación:

| Paso | Tareas asignadas | Dependencias de otros pasos |
|---|---|---|
| 2.1 | T002 | — |
| 2.2 | T001, T003–T008, T010, T015 | T015 está escrita en `compose.yaml`, pero su validación final (arranque de los tres servicios Python) se hace en 2.8 con T016 |
| 2.3 | T009, T012, T018, T022, T023 | — |
| 2.4 | T011 | Requiere T008 y T010 (2.2). La retención ya se comprobó en el broker (`kafka-configs.sh`); la tarea se cierra en este paso. La publicación de mensajes se evidencia con T023 (2.3) y con los pasos 1–5 del quickstart de T031 (2.7) |
| 2.5 | T013, T019, T020, T024, T025 | Requiere T006 y T007 (2.2) y T022 (2.3) |
| 2.6 | T014, T021, T026, T027 | Requiere T006 y T007 (2.2) |
| 2.7 | T028, T029, T031 | T031 requiere T022–T027 (2.3, 2.5 y 2.6) |
| 2.8 | T016, T017, T030, T032–T047 | T016 y T017 validan los cinco servicios y los reintentos (pueden hacerse comprobaciones parciales antes); T030 requiere T018–T027 (2.3, 2.5 y 2.6); T038–T041 requieren el bloque US1 completo |

Total: las 47 tareas T001–T047, cada una asignada a un solo paso.

**Se mantiene además (SDD del MVP):** datos sintéticos aislados (topic y esquema propios) y etiquetados; `mode = "synthetic"` solo como excepción temporal; healthchecks y reintentos; retención base de Kafka (research R-004); CORS desde el origen de desarrollo; criterios SC-001 a SC-010 con evidencias reales.

### F3 — Ingesta real y calidad · 🔄 en curso (cierre técnico: 3.1 a 3.7 y T048 completados; SC-010/T044 pendientes de observación >24 h; publicación real ACTIVA; falta revisión humana y commit `[F3]`)

| Paso | Qué haremos | Estado |
|---|---|---|
| 3.1 | Retirar o aislar el modo temporal `synthetic` | ✅ |
| 3.2 | Implementar consultas periódicas a USGS cada 60 segundos | ✅ (modo seco; la publicación real se activa en T026) |
| 3.3 | Detectar duplicados y versiones actualizadas | ✅ (verificado con PostgreSQL real en transacciones revertidas; con datos reales tras T026) |
| 3.4 | Implementar transacciones, offsets e idempotencia | ✅ (verificado con PostgreSQL y Kafka reales en recursos temporales; con datos reales tras T026) |
| 3.5 | Validar coordenadas, campos y gestionar cuarentena | ✅ (clasificación, cuarentena, retirada y API; publicación real activada en T026 y verificada con datos reales en T027–T029) |
| 3.6 | Registrar estado de ingesta y comprobar retención | ✅ (estado de ingesta, `last_ingestion`, purga, retención de Kafka y volumen persistente; incidencia con Kafka documentada) |
| 3.7 | Probar fallos, reinicios y recuperación sin duplicados | ✅ (SC-001 30/30; consumidor, productor, PostgreSQL y Kafka recuperados sin pérdidas ni duplicados; revisión T048 de Architect y QA: APTO CON RESERVAS, corregido el bloqueo por errores permanentes, 205 pruebas; **SC-010 y T044 pendientes de observación >24 h**) |

*Correspondencia con `specs/002-ingesta-real-calidad/tasks.md` (SDD de F3, 48 tareas; cada tarea con un único paso principal):*

| Paso | Tareas | Notas |
|---|---|---|
| 3.2 | T001–T013 | Ingesta en **modo seco** (`INGESTA_PUBLICAR=false`): consulta, registra y conserva, sin publicar |
| 3.3 | T014–T016 | Historial de versiones y estado actual |
| 3.4 | T017–T018 | Transacción atómica y offset tras guardar |
| 3.5 | T019–T029 | Calidad y cuarentena; **T026 activa la publicación real** y T027–T028 verifican con datos reales los pasos 3.3 y 3.4 |
| 3.6 | T030–T036 | Estado de ingesta, retención; T036 (volumen de Kafka) condicionada a la decisión D4 |
| 3.7 | T037–T048 | Fallos y recuperación; SC-010 (24 h) pendiente de observación real |


**Criterio obligatorio del paso 3.1:** retirada o aislamiento completo de `synthetic`, completado como máximo al cerrar el paso 3.1, es decir, **antes de conectar la ingesta real (paso 3.2)**. La API definitiva solo admite `mode` = `live` o `replay`; ninguna respuesta contiene `synthetic` y ninguna consulta de la API referencia el esquema `sintetico` (`specs/001-mvp-evento-sintetico/research.md`, R-001).

**Se mantiene además** (`ENUNCIADO.md` §5, §6, §7, §11): conservar el GeoJSON original y los metadatos de extracción con política de retención y registro de consultas; gestión de timeout, HTTP 429/5xx y errores de JSON con reintentos de espera progresiva sin borrar el estado válido anterior; marcar una versión como publicada solo tras la confirmación de Kafka; `last_ingestion` con su significado definitivo (última consulta correcta a USGS); modelo conceptual, lógico y físico con SQL e índices justificados (`evento_actual`, `evento_version`, cuarentena y estado de ingesta); pruebas de aceptación de evento nuevo, reenvío, versión posterior, versión antigua, magnitud nula, coordenadas inválidas y reinicio del consumidor.

### F4 — Geografía e histórico · ⬜ pendiente

| Paso | Qué haremos | Estado |
|---|---|---|
| 4.1 | Explorar polígonos de Natural Earth y códigos de país | ⬜ |
| 4.2 | Implementar asignación de países con punto-en-polígono | ⬜ |
| 4.3 | Comprobar océanos, fronteras y eventos sin país | ⬜ |
| 4.4 | Diseñar y ejecutar carga histórica de 2025 | ⬜ |
| 4.5 | Preparar recuperación tras interrupciones superiores a 24 h | ⬜ |
| 4.6 | Validar histórico, trazabilidad y comparaciones temporales | ⬜ |

**Se mantiene además** (`ENUNCIADO.md` §4.2, §4.3, §5): comprobar la unicidad de `ADM0_A3`, usar WGS84 y documentar la regla para puntos en frontera o con varias coincidencias; conservar «Sin país asignado» sin atribuirlo al país más cercano; propuesta de histórico: 2025, ámbito mundial, magnitud ≥ 4, tipo `earthquake`, dividido por meses, subdividiendo si una consulta supera 20 000 resultados, deduplicando los extremos compartidos y guardando consultas, fecha de extracción y número de registros; descargar una vez y reutilizar los archivos.

### F5 — API y dashboard · ⬜ pendiente

| Paso | Qué haremos | Estado |
|---|---|---|
| 5.1 | Completar endpoints y filtros de FastAPI | ⬜ |
| 5.2 | Implementar estadísticas y distribuciones | ⬜ |
| 5.3 | Añadir ventanas UTC de 1 h y comparativas históricas | ⬜ |
| 5.4 | Conectar filtros del frontend con la API | ⬜ |
| 5.5 | Completar mapa, gráficas y tablas sincronizadas | ⬜ |
| 5.6 | Mostrar errores, ausencia de datos y estado de ingesta | ⬜ |
| 5.7 | Validar consultas, índices y comportamiento del dashboard | ⬜ |

**Se mantiene además** (`ENUNCIADO.md` §8, `CONTRATO-API.md`): filtros `start`, `end`, `min_mag` y `country_id` coherentes entre mapa y gráficos; la magnitud nula no cumple `min_mag` y se cuenta aparte; `truncated` con paginación y sin estadísticas globales sobre una muestra truncada; estadísticas con periodo, filtros, unidad y registros sin valor; comparación histórica con el mismo filtro y días con cero eventos en el denominador; agregaciones calculadas desde el estado actual, no con contadores por mensaje; error explícito si la base falla; panel de estado con último acceso a la API, última ingesta y aviso de datos desactualizados; tabla consultable como alternativa al mapa; primeras mediciones de consultas con y sin índice.

### F6 — Replay, pruebas y despliegue · ⬜ pendiente

| Paso | Qué haremos | Estado |
|---|---|---|
| 6.1 | Implementar replay histórico aislado | ⬜ |
| 6.2 | Comprobar velocidad, identidad y separación de eventos reproducidos | ⬜ |
| 6.3 | Ejecutar pruebas integradas y de aceptación del profesor | ⬜ |
| 6.4 | Medir tiempo y memoria con tres tamaños de datos | ⬜ |
| 6.5 | Comparar búsqueda secuencial/diccionario y SQL con/sin índice | ⬜ |
| 6.6 | Configurar ngrok, desplegar Angular en Netlify y verificar acceso | ⬜ |

**Se mantiene además** (`ENUNCIADO.md` §9, §10, §11): replay por Kafka con topic y tablas separados, tiempo original y de reproducción, etiqueta «REPRODUCCIÓN» y casos controlados de duplicado y revisión; las pruebas de aceptación del enunciado §11 (incluido cerrar y reabrir el túnel); mediciones también de la integración geográfica y de la agregación por ventanas, con datos sintéticos marcados y fuera del análisis real, y razonamiento para 100 millones de registros; CORS con el origen exacto de Netlify; authtoken de ngrok fuera de Git y de Angular; solo la API expuesta.

### F7 — Memoria y defensa · ⬜ pendiente

| Paso | Qué haremos | Estado |
|---|---|---|
| 7.1 | Consolidar arquitectura, modelos de datos, decisiones y calidad | ⬜ |
| 7.2 | Documentar benchmarks, costes y tres conclusiones | ⬜ |
| 7.3 | Preparar demostración, evidencias y preguntas de defensa | ⬜ |

**Se mantiene además** (`ENUNCIADO.md` §12, `Guia-entregables`): diccionario de datos, procedencia y registro de consultas, apartado de calidad con resultados antes y después, modelo conceptual/lógico/físico con SQL e índices, análisis con al menos tres conclusiones y capturas de los filtros, informe de complejidad y costes (hardware, electricidad, almacenamiento, transferencia, mantenimiento y desarrollo), evidencias de las pruebas y del replay, `README.md` reproducible, URL del panel, procedimiento para activar el sistema en la defensa y explicación individual del flujo completo y de una decisión técnica propia.

## 5. Plan de commits

**Reglas acordadas:**
- Los commits se realizan **manualmente desde VS Code**, nunca automáticamente por Claude Code. Claude Code no hace `push` ni commits sin autorización expresa.
- Mensajes **en español**, con **título y descripción** (título corto en la primera línea, línea en blanco y descripción debajo).
- Prefijos Git habituales: `docs:`, `feat:`, `chore:` (y `fix:` si hace falta).
- Preferimos **un único commit al cerrar cada fase**, siempre que sea razonable. Se permiten commits intermedios si son necesarios; en ese caso conservan el identificador de la fase, por ejemplo `[F2]` con una descripción distinta.
- No se reescribe el commit histórico `[F0.1]`.

| Fase | Título orientativo | Hito para confirmarlo |
|---|---|---|
| **F0** | `chore: [F0.1] configurar Claude Code y metodología SDD` (**ya realizado**) | Spec Kit, constitución, SDD del MVP y subagentes preparados. |
| **F1** | `docs: [F1] documentar fuentes de datos y validar frontend inicial` | Demo verificada, USGS explorado y calidad analizada. |
| **F2** | `feat: [F2] implementar MVP del circuito con evento sintético` | Un evento sintético recorre el circuito y aparece en el mapa. |
| **F3** | `feat: [F3] incorporar ingesta real de USGS con calidad e idempotencia` | Ingesta real sin duplicados; `synthetic` retirado o aislado. |
| **F4** | `feat: [F4] integrar geografía y carga histórica de 2025` | Países asignados e histórico reproducible. |
| **F5** | `feat: [F5] completar API y dashboard analítico` | Endpoints, filtros y panel probados. |
| **F6** | `feat: [F6] añadir replay, pruebas de aceptación y despliegue` | Replay aislado, pruebas ejecutadas y acceso desde otro dispositivo. |
| **F7** | `docs: [F7] completar memoria técnica y evidencias` | Documentación final y defensa preparadas. |

Ejemplo de mensaje completo (orientativo, para F1):

```text
docs: [F1] documentar fuentes de datos y validar frontend inicial

Valida el frontend Angular en modo demostración, documenta el feed
all_day.geojson de USGS y analiza la calidad de los datos.
- Añade docs/FASE-1-FUENTES-Y-FRONTEND.md.
- Reorganiza la hoja de ruta en fases y pasos.
```

**Estimación:** 2 commits iniciales (repositorio y documentación de referencia) + `[F0.1]` ya realizados; **7 commits previstos** (`[F1]` a `[F7]`) y los intermedios que hagan falta. Es una planificación flexible: se puede añadir un commit correctivo si aparece un error importante, por ejemplo `fix: [F3] corregir gestión de revisiones antiguas`.

**Regla práctica:** antes de cada commit, revisar `git status`, `git diff --check`, el diff y los resultados de las pruebas. El estudiante confirma el hito y realiza el `push` cuando corresponda.

## 6. Equipo de subagentes de Claude Code

**Agente principal — Claude Code:** coordina las tareas, trabaja con Spec Kit, decide cuándo delegar e integra los resultados.

| Subagente | Responsabilidad | Uso previsto |
|---|---|---|
| **Architect** (creado) | Revisar arquitectura, requisitos, especificaciones y contratos. | F0–F2 |
| **Data Engineer** | Kafka, productor/consumidor, PostgreSQL, calidad, geografía e histórico. | F2–F4 |
| **Frontend Engineer** | Angular, Leaflet, filtros, panel y visualización. | F1 y F5–F6 |
| **QA Engineer** (creado) | Tests, idempotencia, recuperación de fallos y criterios de aceptación. | F0–F7 |
| **Technical Reviewer** | Explicación del código, decisiones técnicas, documentación y preguntas de defensa. | F2–F7 |

**Orden de incorporación:** Architect y QA Engineer ya existen en `.claude/agents/`; los demás se añaden cuando haya tareas especializadas. No invocar subagentes por rutina, para controlar el consumo de Claude Pro.

## 7. Skills y MCP

Una **skill** es un procedimiento reutilizable con instrucciones y, cuando corresponde, recursos. No es lo mismo que un subagente.

| Skill prevista | Finalidad |
|---|---|
| **Spec Kit / SDD** (instalada) | Generar y mantener especificaciones, planes y tareas (`/speckit-*`). |
| `requirements-review` | Contrastar cambios con el enunciado y el contrato API. |
| `kafka-pipeline-review` | Revisar mensajes, offsets, duplicados, revisiones y errores. |
| `quality-evidence` | Preparar comprobaciones y evidencias de calidad. |
| `learning-explainer` | Explicar código por bloques y preparar preguntas técnicas. |

Salvo las de Spec Kit, **las skills propias aún no están creadas**. Evitaremos duplicar funciones que ya cubra Spec Kit. Los subagentes y las skills del proyecto **se versionan**; la configuración local de Claude (`.claude/settings.local.json`) **no se versiona** y está excluida en `.gitignore`.

**MCP:** incorporar conexiones externas solamente cuando aporten una necesidad real. No instalar servidores MCP solo para aumentar el número de herramientas.

## 8. Flujo SDD por funcionalidad

1. **Constitution:** principios generales del proyecto (calidad, seguridad, aprendizaje, cumplimiento del enunciado).
2. **Specify:** qué debe hacer la funcionalidad y cuáles son sus criterios de aceptación.
3. **Plan:** cómo se implementará técnicamente.
4. **Tasks:** dividir el trabajo en tareas concretas y verificables.
5. **Implement:** desarrollar y ejecutar pruebas con Claude Code.
6. **Verify:** contrastar código, tests y comportamiento con la especificación y el enunciado.
7. **Revisión humana:** comprender el código y aprobar el hito antes del commit manual.

Spec Kit y la metodología SDD son **decisiones nuestras de desarrollo**, no requisitos del profesor.

## 9. Criterios para cerrar una fase

- [ ] Requisitos y criterios de aceptación cubiertos.
- [ ] Código implementado y pruebas pertinentes ejecutadas.
- [ ] Evidencias y decisiones técnicas documentadas.
- [ ] Código comprendido y explicable por bloques.
- [ ] Cambios revisados (`git status`, `git diff --check`); commit manual `[F<n>]` del hito.

**Método de aprendizaje:** explicación por bloques de código, ejercicios cortos y preguntas de defensa. No marcar pruebas ni pasos como superados si no se han ejecutado o no hay evidencia; no inventar mediciones o resultados.

## 10. Documentación y evaluación

La entrega del profesor se organiza en **tres bloques**:

1. **Repositorio reproducible:** código, Docker Compose, dependencias, SQL, configuración de ejemplo, instrucciones y pruebas.
2. **Memoria o notebook:** procedencia de datos, dimensiones de calidad, modelado conceptual/lógico/físico, análisis, tres conclusiones fundamentadas, complejidad, medidas de rendimiento y costes.
3. **Panel y defensa:** Angular publicado, procedimiento para levantar backend y ngrok, replay y explicación individual del flujo completo y de una decisión técnica propia.

La rúbrica contempla **extracción, calidad, modelado, análisis y reflexión**. Para una buena entrega son prioritarias las pruebas de duplicados y revisiones, integración geográfica, filtros coherentes y conclusiones con cifras y periodos identificables.

**Documentos de referencia del proyecto**
- Profesor: `docs/referencias/ENUNCIADO.md`, `CONTRATO-API.md`, `FAQ-ALUMNADO.md`, `Guia-entregables-observatorio-sismico.md`, `FUENTES-Y-LICENCIAS.md`.
- Reglas del proyecto: `CLAUDE.md` y `.specify/memory/constitution.md`.
- SDD del MVP: `specs/001-mvp-evento-sintetico/` (`spec.md`, `plan.md`, `research.md`, `tasks.md`, `quickstart.md`).
- Documentación de fases: `docs/FASE-1-FUENTES-Y-FRONTEND.md`.

## 11. Estado actual y próximo paso

### Estado actual
- Repositorios GitHub creados y conectados. Material del profesor en `docs/referencias/`. `CLAUDE.md` configurado.
- **F0 completada** (commit `[F0.1]` realizado), con el paso 0.5 (skills propias) aplazado.
- **F1 completada** (3 de noviembre de 2026): pasos 1.1 a 1.5 con evidencia en `docs/FASE-1-FUENTES-Y-FRONTEND.md`; la incidencia del formateo accidental de cuatro archivos del frontend está **resuelta**. **Pendiente: commit manual `[F1]`.**
- F2 a F7: pendientes, sin cambios de estado.
- Codex queda aparcado hasta terminar la versión Claude.

### Decisiones técnicas
- **Python 3.13** es la versión candidata para las imágenes Docker. No se fija definitivamente hasta comprobar la compatibilidad con las dependencias del proyecto.
- `.claude/settings.local.json` no se versiona; los subagentes y skills del proyecto sí.
- `mode = "synthetic"` es una excepción temporal del MVP, que se retira o aísla en el paso 3.1.

### Próximos pasos
1. Con autorización expresa, continuar F3 en el paso 3.2 (consulta periódica a USGS), con especificación propia en Spec Kit (`specs/002-ingesta-real-calidad/`).
2. El commit `[F3]` se realiza manualmente al cerrar la fase (evidencias en `docs/evidencias/f3/`).
3. Crear las skills propias (`requirements-review`, `learning-explainer`, etc.) cuando haga falta.

### Reglas
- No implementar funcionalidades sin una especificación aprobada.
- Trabajar por fases y verificar los resultados; cada paso se revisa antes de continuar.
- No crear commits ni hacer push sin autorización expresa.
- Explicar las decisiones técnicas para facilitar el aprendizaje.
- Priorizar los requisitos del profesor frente a esta planificación.
