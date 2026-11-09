# Hoja de ruta — Observatorio Sísmico

> **Plan de referencia · Noviembre de 2026**  
> **Primera implementación:** Claude Code  
> **Segunda implementación:** Codex (una vez finalizada la primera)  
> **Metodología:** GitHub Spec Kit (SDD) + MVP + agentes + pruebas + aprendizaje

> **Reorganización del 2026-11-09:** F0–F6 son historial completado. La antigua «F7 — Memoria y defensa» pasa a ser **F8 — Documentación, entrega académica y vídeo**, y la nueva **F7** es una fase flexible de **mejoras y evolución**. Mapa de fases y carpetas SDD en [`specs/INDICE.md`](../specs/INDICE.md). Los documentos históricos no se reescriben: un «F7» antiguo debe leerse como F8.

Esta hoja es **orientativa**: no sustituye a los requisitos del profesor (`docs/referencias/ENUNCIADO.md`, `CONTRATO-API.md`, `FAQ-ALUMNADO.md`, `Guia-entregables-observatorio-sismico.md`). Si hay conflicto, **gana el profesor**. Las fases, los pasos, Spec Kit y los subagentes son decisiones nuestras de desarrollo. La nomenclatura de fases, pasos y commits se reorganizó el 3 de noviembre de 2026 (sección 3).

## 1. Objetivo y estrategia

Construir un **Observatorio de Actividad Sísmica** que cumpla el enunciado del profesor, analice terremotos recientes e históricos y permita explicar y defender técnicamente cada componente.

Orden de trabajo:

1. Estudiar los requisitos y entender la arquitectura.
2. Desarrollar el proyecto completo con **Claude Code** mediante SDD, empezando por un MVP.
3. Revisar el código por bloques, ejecutar pruebas y reunir evidencias durante todas las fases.
4. Mejorar progresivamente la aplicación (F7) y preparar la documentación, la entrega y el vídeo de demostración (F8); la explicación individual se mantiene preparada hasta aclarar el formato de evaluación.
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

- **Fases:** F0, F1, F2, F3, F4, F5, F6, F7 y F8.
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
| **F7 — Mejoras y evolución** | Mejorar de forma progresiva la aplicación ya construida (diseño, UX, accesibilidad, filtros, mapas, gráficas, ajustes técnicos, comodidad de desarrollo) con mejoras que la persona estudiante propone y aprueba una a una. | Cada mejora aprobada verificada con evidencia; fase ampliable sin reescribir la planificación; se cierra cuando lo decide la persona estudiante. |
| **F8 — Documentación, entrega académica y vídeo** | Revisar literalmente la rúbrica y la guía, README final, memoria o notebook si es obligatoria, matriz de trazabilidad, observación de >24 h (SC-010 de F3), guion, entorno y vídeo de demostración, y acceso del profesor al repositorio. | Entrega completa y comprobable; vídeo grabado y revisado; acceso concedido. |

> **Nota:** la documentación, las pruebas y el estudio del código se hacen **durante todas las fases**; no se posponen hasta F8.

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

### F4 — Geografía e histórico · ✅ cerrada técnicamente (4.1–4.6 y cierre T061–T066; commit `[F4]` realizado; D1–D4 aprobadas)

| Paso | Qué haremos | Estado |
|---|---|---|
| 4.1 | Explorar polígonos de Natural Earth y códigos de país | ✅ (catálogo validado, esquema `geo` y `geo.pais` con 177 países cargados de forma idempotente; evidencias en `docs/evidencias/f4/`) |
| 4.2 | Implementar asignación de países con punto-en-polígono | ✅ (Shapely+NumPy; asignador con regla de frontera por menor `ADM0_A3`; país en la transacción del consumidor; arranque seguro sin catálogo; 236 eventos asignados con 0 discrepancias; 262 pruebas) |
| 4.3 | Comprobar océanos, fronteras y eventos sin país | ✅ (batería de 46 puntos, 7 536 vértices y 5 000 aleatorios; 38 eventos «sin país» analizados sin errores de lógica; regla documentada; rendimiento medido sin umbrales; 316 pruebas) |
| 4.4 | Diseñar y ejecutar carga histórica de 2025 | ✅ (18 302 eventos de 2025 en 12 tramos mensuales, cuadran con el `count` de USGS mes a mes; 0 cuarentena, 0 duplicados; originales comprimidos en la base y exportados con `sha256`; carga repetida con 0 peticiones; aislada de `live`; 362 pruebas; 16 s con descarga y 2,3 s desde archivos locales) |
| 4.5 | Preparar recuperación tras interrupciones superiores a 24 h | ✅ (detección automática en `live.hueco` con margen de 6 h; recuperación a demanda por el canal real con `source` `usgs-fdsn-recuperacion`; ensayo extremo a extremo en recursos temporales; idempotente y reanudable; productor y consumidor desplegados, 11 ciclos sin huecos, lag 0; 401 pruebas) |
| 4.6 | Validar histórico, trazabilidad y comparaciones temporales | ✅ (consultas de comparación en `sql/consultas/comparacion.sql` validadas contra un recuento independiente, con ventana reciente marcada como incompleta cuando procede; trazabilidad evento→consulta→archivo→original verificada; 78,4 % «sin país» analizado: 0 errores de cobertura; calidad en seis dimensiones; umbrales de SC-011 verificados; 419 pruebas) |

**Se mantiene además** (`ENUNCIADO.md` §4.2, §4.3, §5): comprobar la unicidad de `ADM0_A3`, usar WGS84 y documentar la regla para puntos en frontera o con varias coincidencias; conservar «Sin país asignado» sin atribuirlo al país más cercano; propuesta de histórico: 2025, ámbito mundial, magnitud ≥ 4, tipo `earthquake`, dividido por meses, subdividiendo si una consulta supera 20 000 resultados, deduplicando los extremos compartidos y guardando consultas, fecha de extracción y número de registros; descargar una vez y reutilizar los archivos.

### F5 — API y dashboard · ✅ cerrada técnicamente (5.1–5.7 y cierre T054–T059; pendiente la revisión humana del panel y el commit `[F5]`; DF1–DF7 aprobadas, umbrales de SC-010 confirmados el 2026-11-08 tras medir)

| Paso | Qué haremos | Estado |
|---|---|---|
| 5.1 | Completar endpoints y filtros de FastAPI | ✅ (`GET /api/eventos` con `start`, `end`, `min_mag`, `country_id` y `sin_pais`, 422 explícito, paginación `limit`/`offset` con máximo de 5 000, metadatos `total`/`next_offset`/`truncated`/`period`/`coverage`, instantánea `REPEATABLE READ` y sesión de solo lectura; coincide con un oráculo independiente en las pruebas y en la API real; solo `api` redesplegada; 542 pruebas) |
| 5.2 | Implementar estadísticas y distribuciones | ✅ (`GET /api/estadisticas` con los mismos filtros: recuentos por país con «Sin país asignado» y sin asignar aparte, distribuciones de magnitud y profundidad con intervalos fijos y nulos en `sin_valor`; coincide al 100 % con `/api/eventos` y con un cálculo independiente en 14 combinaciones y en la API real; solo `api` redesplegada; 580 pruebas) |
| 5.3 | Añadir ventanas UTC de 1 h y comparativas históricas | ✅ (`por_hora` con horas a cero y límite de 744 casillas que omite solo la serie; `comparacion` con la media de 2025 (total/365), mismo ámbito y magnitud efectiva ≥ 4, variación «no definida» con media 0 y motivos de periodo incompleto; coincide con un oráculo y con la implementación de F4 en pruebas y en la API real; la API solo lee el histórico y no lo modifica; 643 pruebas; observación: el feed en vivo no cubre M4,0–4,5 fuera de EE. UU. como el histórico) |
| 5.4 | Conectar filtros del frontend con la API | ✅ (frontend proporcionado extendido sin reescribirlo: servicio de API con errores tipados, un único estado de filtros —periodo UTC, magnitud mínima, país y `sin_pais`— y su componente; ventana resuelta con `generated` de la API y enviada a todas las páginas; 422/503/red/respuestas tardías gestionados; modo `demo` intacto; aviso de cobertura permanente; 33 pruebas `node --test` y 22 mutaciones; sin tocar `tsconfig.json`; navegador integrado con la API real) |
| 5.5 | Completar mapa, gráficas y tablas sincronizadas | ✅ (tabla consultable accesible, cuatro gráficas SVG propias sin biblioteca —hora UTC, país con «Sin país asignado», magnitud y profundidad con «sin valor»— y tarjeta de comparación con 2025 con fuentes separadas, periodo incompleto y advertencia permanente de cobertura distinta; un solo evento seleccionado compartido por mapa y tabla; mismo periodo y filtros para todo; mapa Leaflet, leyenda y modo `demo` intactos; 65 pruebas `node --test` y 29 mutaciones; contador cruzado en 7 combinaciones con la API real) |
| 5.6 | Mostrar errores, ausencia de datos y estado de ingesta | ✅ (`/api/salud` con `generated`, edad de la ingesta, `stale` con umbral de 300 s configurable y reloj de la API, huecos pendientes y cobertura; panel de estado con avisos de sin conexión, datos desactualizados, sin eventos, truncado con «Cargar el resto», huecos y conexión recuperada; última lectura conservada con su antigüedad (reloj monotónico), recuperación automática sin recargar y respuestas tardías descartadas; ciclo real del productor 60 s; 661 pruebas de backend, 87 de frontend y 26 mutaciones; fallos controlados con contenedores temporales) |
| 5.7 | Validar consultas, índices y comportamiento del dashboard | ✅ (EXPLAIN con y sin índices a tres escalas: sin índices nuevos —el de F3 basta—; tiempos HTTP reales p95 ≤ 28 ms a volumen actual y ≤ 380 ms a ≈ 183 000 filas, **umbrales de SC-010 confirmados el 2026-11-08, fijados después de las mediciones (no son predicciones previas)**; 17 comprobaciones de integración en el navegador con coherencia de recuentos entre componentes; 5 000 eventos en el mapa; revisión responsiva y de accesibilidad a 375/768/1300 px con tres correcciones y un cuello de botella resuelto en la tabla; tres conclusiones con cifras reproducibles; regresión: 661 pruebas de backend, 88 de frontend, invariantes y aislamiento intactos) |

**Se mantiene además** (`ENUNCIADO.md` §8, `CONTRATO-API.md`): filtros `start`, `end`, `min_mag` y `country_id` coherentes entre mapa y gráficos; la magnitud nula no cumple `min_mag` y se cuenta aparte; `truncated` con paginación y sin estadísticas globales sobre una muestra truncada; estadísticas con periodo, filtros, unidad y registros sin valor; comparación histórica con el mismo filtro y días con cero eventos en el denominador; agregaciones calculadas desde el estado actual, no con contadores por mensaje; error explícito si la base falla; panel de estado con último acceso a la API, última ingesta y aviso de datos desactualizados; tabla consultable como alternativa al mapa; primeras mediciones de consultas con y sin índice.

### F6 — Replay, pruebas y despliegue · ✅ cerrada técnicamente el 2026-11-09 (6.1–6.9; revisión humana del panel, prueba desde móvil, pestaña oculta y limpieza PA-11 hechas el 2026-11-09; pendientes: commit `[F6]`, 6.10/SC-010 de F3 (>24 h), T063 y F7) · SDD aprobado el 2026-11-08 (`specs/005-replay-despliegue-final/`); preparación T001–T002 hecha; DG10 aprobada y constitución v1.0.4 aplicada; 6.1, 6.2 y 6.3 hechos (6.3 aprobada); 6.4 aprobada; 6.5 hecha (a falta de la revisión humana y de los datos de costes); 6.6 hecha (publicada y verificada; ngrok cerrado); 6.7 hecha (T053 superada con limitaciones: Narrador en Edge 157, 14 pasos; Chrome real informado)

| Paso | Qué haremos | Estado |
|---|---|---|
| 6.1 | Implementar replay histórico aislado | ✅ (esquema `replay` con `CHECK` de modo y fuente y clave `(run_id, event_id)`; topic `terremotos.replay`; consumidor reutilizado con destino parametrizado —SQL de `live` idéntico carácter a carácter—; productor bajo demanda con seis casos controlados `replay-ctl-…`; 105 pruebas nuevas, 39/39 mutaciones detectadas; replay real: 39 mensajes → 35 filas / 37 versiones / 1 en cuarentena, repetible e interrumpible sin duplicados; `live`, `historico` y `sintetico` intactos) |
| 6.2 | Replay en la API y el panel; comprobar velocidad, identidad y separación de eventos reproducidos | ✅ (revisión humana del panel confirmada el 2026-11-09) |
| 6.3 | Ejecutar pruebas integradas y de aceptación del profesor | ✅ (a falta de la revisión humana) |
| 6.4 | Medir tiempo y memoria con tres tamaños de datos | ✅ mediciones hechas; umbrales propuestos pendientes de confirmar |
| 6.5 | Comparar búsqueda secuencial/diccionario y SQL con/sin índice | ✅ análisis hecho; datos de costes pendientes de la persona estudiante |
| 6.6 | Configurar ngrok, desplegar Angular en Netlify y verificar acceso (preparación local primero; publicar solo tras autorización) | ✅ publicado y verificado (Netlify + ngrok + clave de acceso); ngrok cerrado; probado desde un móvil Android con datos móviles el 2026-11-09 (`6.9-movil.md`) |
| 6.7 | Accesibilidad, diseño responsive y compatibilidad del panel | ✅ hecho y corregido; T053 superada con limitaciones (Narrador+Edge, 14 pasos; Chrome real informado) |
| 6.8 | Estabilidad, recuperación y persistencia sin operaciones destructivas | ✅ (T060 con reinicio natural del PC, no controlado de Docker Desktop; T063 down/up no realizada por decisión; SC-010 >24 h aplazada) |
| 6.9 | Entregables, reproducibilidad y cierre de F6 | ✅ cerrada técnicamente (entorno limpio verificado tras corregir el README; regresión 964 + 130; aislamiento OK; Architect y QA «aprobado con reservas»); reservas en `docs/evidencias/f6/resultados.md` |
| 6.10 | SC-010 de F3: conservación tras más de 24 h (condicionado a autorización expresa; fuera de la ruta crítica) | ⬜ pendiente (no se ejecutó en F6; **se realiza en F8, paso 8.5**, con PA-10 expresa; T075–T077 de `specs/005-…` se reutilizan allí) |

**Se mantiene además** (`ENUNCIADO.md` §9, §10, §11): replay por Kafka con topic y tablas separados, tiempo original y de reproducción, etiqueta «REPRODUCCIÓN» y casos controlados de duplicado y revisión; las pruebas de aceptación del enunciado §11 (incluido cerrar y reabrir el túnel); mediciones también de la integración geográfica y de la agregación por ventanas, con datos sintéticos marcados y fuera del análisis real, y razonamiento para 100 millones de registros; CORS con el origen exacto de Netlify; authtoken de ngrok fuera de Git y de Angular; solo la API expuesta.

### F7 — Mejoras y evolución · 🟡 marco creado el 2026-11-09 (`specs/006-mejoras-evolucion/`); ninguna mejora aprobada

Fase **flexible**: las mejoras se descubren mientras se usa y estudia el proyecto y se implementan **solo cuando la persona estudiante las aprueba**, en pasos pequeños `7.1`, `7.2`… con su propia mini-especificación (requisitos, alcance, criterios de aceptación y pruebas proporcionales) y commit manual `[F7.n]`. Reglas: no se cambia la arquitectura obligatoria ni el contrato del profesor, no se debilita la seguridad (clave, CORS), no se tocan F0–F6 ni sus evidencias, y publicar en Netlify o abrir ngrok requiere autorización expresa.

| Paso | Qué haremos | Estado |
|---|---|---|
| 7.0 | Marco SDD: spec, plan, tareas, backlog y plantilla de mejora | ✅ creado (pendiente de la revisión humana y del commit de la reorganización) |
| C-01 | *(candidata)* Entrar en `localhost:4200` sin teclear la clave de la API cada vez, sin debilitar FastAPI ni Netlify | ⬜ candidata, **sin aprobar** |
| C-02 | *(candidata)* Mostrar de forma más perceptible cuándo el dashboard se ha actualizado correctamente (observación f de `docs/evidencias/f6/6.9-revision-humana.md`) | ⬜ candidata, **sin aprobar** |
| C-03 | *(candidata)* Crear un subagente **Frontend Engineer** (Angular, TypeScript, diseño, accesibilidad y responsive) | ⬜ candidata, **sin aprobar** |
| C-04 | *(candidata)* Explorar skills con `npx skills find`, revisando procedencia y contenido **antes** de instalar; estudiar su aplicación al frontend | ⬜ candidata, **sin aprobar** (no se instala nada) |
| I-01…I-04 | *(ideas)* Data Engineer y MCP como posibilidades futuras solo si aportan valor concreto; investigar APIs sísmicas regionales y valorar Streamlit (opcionales, solo si aportan algo distinto al dashboard Angular) | 💡 anotadas, sin plan |
| 7.n | Nuevas mejoras: se añaden al backlog (`specs/006-mejoras-evolucion/backlog.md`) y reciben número al aprobarse | — |

**Política de trabajo de F7:** se desarrolla y prueba en `localhost:4200`; commits y push manuales al repositorio privado; **Netlify se mantiene con la versión de F6** (sin despliegues automáticos ni publicación de las mejoras); sin ngrok ni despliegues públicos sin autorización expresa; sin secretos en Git ni en bundles; **no se instalan skills, agentes, MCP ni dependencias** sin aprobación (las skills se revisan antes: procedencia y contenido). Las notas de clase del 2026-11-09 son orientaciones del profesor, **no requisitos obligatorios**.

**Alcance posible** (cada punto, solo mediante una mejora aprobada): mejoras visuales y rediseño de Angular; experiencia de usuario y accesibilidad; filtros, navegación, mapas, estadísticas y gráficas; optimización y ajustes técnicos pequeños; funcionalidades nuevas propuestas por la persona estudiante; comodidad del entorno de desarrollo local.

### F8 — Documentación, entrega académica y vídeo · ⬜ planificada el 2026-11-09 (`specs/007-documentacion-entrega-video/`); sin ejecutar

Sustituye a la antigua «F7 — Memoria y defensa». El profesor ha indicado que la evaluación será mediante un **vídeo grabado** que muestre el funcionamiento y demuestre la rúbrica. **Ese requisito no consta en los materiales del repositorio** (`docs/referencias/`, que hablan de defensa y explicación individual y no mencionan vídeo): hasta tener la fuente literal del profesor, F8 mantiene preparada también la explicación individual y trata fechas, formato, plataforma, acceso al repositorio y formato de la memoria como **aclaraciones pendientes** (CA-01…CA-07 en la especificación). Los materiales oficiales **sí confirman** que se exige una memoria o notebook (el README no la sustituye). El formato exacto del vídeo está **pendiente de confirmación formal** (lo indicó el profesor en clase; no figura en los materiales). Refuerzos acordados el 2026-11-09 (orientaciones, no requisitos): evidencias visuales reales (capturas del frontend, fragmentos de código, resultados de pruebas y demostraciones), grabación como recorrido por la rúbrica (**requisito → funcionalidad → evidencia → demostración**) y README profesional con capturas y enlaces internos a las evidencias, además de la memoria o notebook.

| Paso | Qué haremos | Estado |
|---|---|---|
| 8.1 | Revisión literal de rúbrica, guía, FAQ, enunciado y contrato; aclarar CA-01…CA-07 | ⬜ |
| 8.2 | Matriz de trazabilidad: rúbrica → implementación → evidencia → minuto de vídeo | ⬜ |
| 8.3 | Memoria o notebook: arquitectura y diagramas, modelo, diccionario, procedencia, calidad, pruebas, resultados, complejidad/costes, conclusiones | ⬜ |
| 8.4 | README final profesional, verificado en un entorno limpio paralelo | ⬜ |
| 8.5 | Observación de >24 h (SC-010 de F3, antes 6.10), con PA-10 expresa y resultado real | ⬜ |
| 8.6 | Guion y recorrido de la grabación | ⬜ |
| 8.7 | Entorno de grabación verificado (ensayo en seco, checklist) | ⬜ |
| 8.8 | Grabación y revisión del vídeo (la graba la persona estudiante) | ⬜ |
| 8.9 | Revisión final de los entregables | ⬜ |
| 8.10 | Acceso del profesor al repositorio privado y entrega (persona estudiante) | ⬜ |

**Se mantiene además** (`ENUNCIADO.md` §12, `Guia-entregables`): diccionario de datos, procedencia y registro de consultas, apartado de calidad con resultados antes y después, modelo conceptual/lógico/físico con SQL e índices, análisis con al menos tres conclusiones y capturas de los filtros, informe de complejidad y costes (hardware, electricidad, almacenamiento, transferencia, mantenimiento y desarrollo), evidencias de las pruebas y del replay, `README.md` reproducible, URL del panel, procedimiento para activar el sistema y explicación individual del flujo completo y de una decisión técnica propia (pendiente de aclarar su forma con el vídeo).

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
| **F7** | `feat: [F7.n] <mejora>` (un commit manual por mejora aprobada; `[F7.n]` identifica el paso de mejora) | Mejora verificada con evidencia y revisión humana. |
| **F8** | `docs: [F8] completar documentación, entrega y vídeo` (y `[F8-WIP]` intermedios si hacen falta) | Entregables completos, vídeo revisado y acceso del profesor gestionado. |

Ejemplo de mensaje completo (orientativo, para F1):

```text
docs: [F1] documentar fuentes de datos y validar frontend inicial

Valida el frontend Angular en modo demostración, documenta el feed
all_day.geojson de USGS y analiza la calidad de los datos.
- Añade docs/FASE-1-FUENTES-Y-FRONTEND.md.
- Reorganiza la hoja de ruta en fases y pasos.
```

**Estimación:** 2 commits iniciales (repositorio y documentación de referencia) + `[F0.1]` ya realizados; **commits previstos** `[F1]` a `[F6]` (ya realizados), uno por cada mejora aprobada de F7 (`[F7.n]`, número variable) y `[F8]`, más los intermedios que hagan falta; la reorganización del 2026-11-09 se confirma con un commit propio de documentación. Es una planificación flexible: se puede añadir un commit correctivo si aparece un error importante, por ejemplo `fix: [F3] corregir gestión de revisiones antiguas`.

**Regla práctica:** antes de cada commit, revisar `git status`, `git diff --check`, el diff y los resultados de las pruebas. El estudiante confirma el hito y realiza el `push` cuando corresponda.

## 6. Equipo de subagentes de Claude Code

**Agente principal — Claude Code:** coordina las tareas, trabaja con Spec Kit, decide cuándo delegar e integra los resultados.

| Subagente | Responsabilidad | Uso previsto |
|---|---|---|
| **Architect** (creado) | Revisar arquitectura, requisitos, especificaciones y contratos. | F0–F2 |
| **Data Engineer** | Kafka, productor/consumidor, PostgreSQL, calidad, geografía e histórico. | F2–F4 |
| **Frontend Engineer** | Angular, Leaflet, filtros, panel y visualización. | F1 y F5–F6; creación como especialista de Angular/TypeScript/diseño/accesibilidad/responsive = candidata C-03 de F7, **sin aprobar** |
| **QA Engineer** (creado) | Tests, idempotencia, recuperación de fallos y criterios de aceptación. | F0–F8 |
| **Technical Reviewer** | Explicación del código, decisiones técnicas, documentación y preguntas de defensa. | F2–F8 |

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
3. **Panel y defensa** (según los materiales del repositorio; el formato definitivo —defensa o vídeo— se aclara en F8): Angular publicado, procedimiento para levantar backend y ngrok, replay y explicación individual del flujo completo y de una decisión técnica propia.

> **Nota (2026-11-09):** los materiales del repositorio describen una defensa con explicación individual; el profesor ha indicado después que la evaluación será por **vídeo grabado**. La fuente literal de ese cambio no está en `docs/referencias/` y se pide en F8 (paso 8.1). Hasta entonces se mantienen ambos formatos preparados. La memoria o notebook **sí** está exigida por los materiales oficiales.

La rúbrica contempla **extracción, calidad, modelado, análisis y reflexión**. Para una buena entrega son prioritarias las pruebas de duplicados y revisiones, integración geográfica, filtros coherentes y conclusiones con cifras y periodos identificables.

**Documentos de referencia del proyecto**
- Profesor: `docs/referencias/ENUNCIADO.md`, `CONTRATO-API.md`, `FAQ-ALUMNADO.md`, `Guia-entregables-observatorio-sismico.md`, `FUENTES-Y-LICENCIAS.md`.
- Reglas del proyecto: `CLAUDE.md` y `.specify/memory/constitution.md`.
- SDD del MVP: `specs/001-mvp-evento-sintetico/` (`spec.md`, `plan.md`, `research.md`, `tasks.md`, `quickstart.md`).
- Documentación de fases: `docs/FASE-1-FUENTES-Y-FRONTEND.md`.

## 11. Estado actual y próximo paso

### Estado actual (2026-11-09)
- **F0–F6 completadas** (commits `[F0.1]`, `[F1]`…`[F6]`; el último, `fd9e1a7`). Detalle por fase en sus `specs/` y `docs/evidencias/`. F6 cerrada técnicamente con reservas documentadas (`docs/evidencias/f6/resultados.md` §5): SC-010 de F3 (>24 h, 6.10), T063 (no autorizada), recuperación de un hueco real de USGS, otros navegadores y lector de pantalla, mediciones de una sola máquina.
- **F7 — Mejoras y evolución**: marco creado (`specs/006-mejoras-evolucion/`); candidatas C-01 y C-02 **sin aprobar**; nada implementado.
- **F8 — Documentación, entrega y vídeo**: planificada (`specs/007-documentacion-entrega-video/`); requisitos del vídeo y fechas pendientes de aclarar con el profesor.
- Codex queda aparcado hasta terminar la versión Claude.

### Decisiones técnicas
- **Python 3.13** en las imágenes Docker; `.claude/settings.local.json` no se versiona; los subagentes y skills del proyecto sí.
- `mode = "synthetic"` fue una excepción temporal del MVP, retirada en el paso 3.1 (esquema `sintetico` archivado).
- Reorganización 2026-11-09: antigua F7 (memoria y defensa) → F8; nueva F7 evolutiva. Constitución v1.0.5 (PATCH: fases F0–F8).

### Próximos pasos
1. Revisión humana y commit manual de la reorganización (documentación únicamente).
2. **F7**: la persona estudiante decide qué candidata (C-01, C-02) u otra mejora aprobar; se redacta su mini-especificación antes de implementar. Primer paso sugerido: aprobar y especificar C-02 (riesgo bajo).
3. **F8**: empezar por el paso 8.1 (obtener el texto literal del profesor sobre el vídeo, fecha y canal) y valorar autorizar cuanto antes la observación de >24 h (PA-10), que no depende de las mejoras.

### Reglas
- No implementar funcionalidades sin una especificación aprobada.
- Trabajar por fases y verificar los resultados; cada paso se revisa antes de continuar.
- No crear commits ni hacer push sin autorización expresa.
- Explicar las decisiones técnicas para facilitar el aprendizaje.
- Priorizar los requisitos del profesor frente a esta planificación.
