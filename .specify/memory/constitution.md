# Constitución del Observatorio Sísmico

## Principios fundamentales

### I. Los requisitos del profesor prevalecen
El enunciado (`docs/referencias/ENUNCIADO.md`) y el contrato de la API
(`docs/referencias/CONTRATO-API.md`) son las fuentes de requisitos principales. La FAQ y la guía
de entregables los aclaran, pero no añaden requisitos. La hoja de ruta (`docs/HOJA-DE-RUTA.md`),
Spec Kit, las fases F0–F7 y los subagentes son decisiones propias del proyecto: si chocan con el
enunciado, gana el enunciado. Los documentos originales del profesor MUST NOT modificarse.
*Motivo:* la evaluación se hace con la rúbrica del profesor, no con nuestra planificación.

### II. Arquitectura obligatoria y tecnologías cerradas
El backend MUST ejecutarse como cinco servicios separados de Docker Compose: productor Python
(aiokafka), Apache Kafka, consumidor Python (aiokafka), PostgreSQL y API FastAPI. Angular +
Leaflet se publica en Netlify y consulta la API mediante ngrok (HTTPS). El panel MUST consultar
nuestra API, nunca USGS directamente. Spark, Flink, Kubernetes y aprendizaje automático MUST NOT
introducirse sin autorización expresa. Las ventanas y agregaciones se calculan con Python y SQL.
*Motivo:* es la arquitectura exigida y lo que se evalúa en la defensa.

### III. Datos honestos y fuentes aisladas
Los datos reales (feed live), históricos, de replay y sintéticos MUST mantenerse separados
(topic, tablas o esquema, y etiqueta visible). Todo dato sintético MUST estar identificado como
tal y MUST NOT mezclarse con el análisis de sismicidad real. No se inventan datos, mediciones ni
resultados de pruebas. Un nulo no se sustituye por cero. Un evento sin polígono se conserva como
«Sin país asignado», sin atribuirlo al país más cercano. Los tiempos se convierten a UTC
conservando el valor original; el tiempo del evento se distingue del de procesamiento.
*Motivo:* el enunciado penaliza mezclar fuentes y presentar datos ficticios como reales.

### IV. Procesamiento idempotente y versionado
El consumo es al menos una vez con escritura idempotente. El estado actual de un evento
(`event_id`) solo se actualiza si la versión recibida (`updated`) es más reciente; cada versión
distinta se conserva sin sobrescribir una posterior. La escritura en PostgreSQL se hace en una
transacción y el offset de Kafka se confirma después. Un mensaje repetido MUST NOT cambiar los
recuentos. Los registros que no se pueden tratar van a cuarentena con motivo y referencia al
original; nunca se pierden en silencio ni bloquean la cola.
*Motivo:* es el núcleo técnico evaluado (pruebas de duplicados, revisiones y reinicios).

### V. Verificación antes de dar algo por terminado
Una tarea solo se declara terminada tras ejecutar las pruebas pertinentes y comprobar sus
criterios de aceptación. Una prueba de aceptación MUST NOT marcarse como superada porque el
comportamiento esté programado: se ejecuta y se registra el resultado observado. Las evidencias
(logs, consultas, capturas) se guardan para la memoria.
*Motivo:* la guía de entregables exige evidencias comprobables, no afirmaciones.

### VI. Seguridad y secretos
No se versionan credenciales, `.env` reales, authtokens de ngrok ni `.claude/settings.local.json`.
Solo se versiona `.env.example` sin valores reales. Kafka y PostgreSQL MUST NOT exponerse
públicamente ni por el túnel; solo la API de consulta, con CORS limitado al origen exacto de
Netlify y al de desarrollo. No se exponen rutas de administración ni secretos en la API ni en
`config.json`.
*Motivo:* requisito del enunciado (§9) y regla básica de seguridad.

### VII. Simplicidad y entrega incremental
Se construye primero un MVP funcional (un evento sintético recorre todo el circuito) y después se
amplía por fases verificables. No se implementan fases no autorizadas ni se añade complejidad
innecesaria: el enunciado no premia más infraestructura. Las tareas grandes se dividen en
módulos pequeños y verificables. Toda complejidad añadida MUST justificarse por escrito.
*Motivo:* el trabajo se defiende individualmente y debe poder explicarse por completo.

### VIII. Aprendizaje y defensa
La persona estudiante MUST poder comprender y defender todo el código. Al terminar cada tarea se
resumen los archivos modificados, se explica el código por bloques funcionales, se justifican las
decisiones técnicas, se indican las pruebas ejecutadas con su resultado y se propone una pregunta
de defensa. Las explicaciones se dan en español, de forma clara y progresiva.
*Motivo:* la defensa individual del flujo completo y de una decisión propia es un entregable.

## Restricciones técnicas y de datos

- **Contrato API:** `GET /api/eventos` devuelve un `FeatureCollection` GeoJSON con una sola
  versión actual por evento; coordenadas `[longitud, latitud, profundidad_km]`; fechas en
  milisegundos Unix UTC; `null` (nunca NaN/Infinity) para valores desconocidos. Se implementan
  también `/api/salud` y `/api/estadisticas` y los filtros `start`, `end`, `min_mag` y
  `country_id`. Si la base falla, la API devuelve un error explícito, no cero eventos.
- **Valores de `mode`:** el contrato del profesor solo admite `live` y `replay`; la API definitiva
  MUST NOT exponer ningún otro. El valor `synthetic` es una excepción temporal, limitada al circuito
  aislado del MVP (topic y esquema propios); se retira o aísla por completo como máximo al cerrar
  F3.1 (preferiblemente antes de la ingesta real), según
  `specs/001-mvp-evento-sintetico/research.md` (R-001).
- **Kafka:** la clave del mensaje es el id del evento; el mensaje incluye `source`,
  `ingested_at`, `mode` (`live` o `replay`) y el evento original. El productor confirma con Kafka
  antes de marcar una versión como publicada.
- **Integración geográfica:** punto-en-polígono sobre el catálogo Natural Earth entregado (WGS84),
  identificado por `ADM0_A3`; nunca se extrae el país del texto de `place`.
- **Python:** 3.13 es la versión candidata para las imágenes Docker; se fija definitivamente tras
  comprobar la compatibilidad de las dependencias, que se fijan con versión exacta.
- **Contenedores:** healthchecks y reintentos en los servicios; los contenedores usan los nombres
  de servicio de Compose, no `localhost`.

## Flujo de desarrollo y revisión

- **SDD con Spec Kit:** constitución → especificación → plan → tareas → implementación →
  verificación → revisión humana. No se implementa una funcionalidad sin especificación aprobada.
- **Fases:** F0–F7 según `docs/HOJA-DE-RUTA.md`; el cierre de cada fase exige requisitos
  cubiertos, pruebas ejecutadas, evidencias, código comprendido y revisión de cambios.
- **Git:** los commits son manuales, en español, agrupados por hitos con identificador
  (`F0.1`, `F2.1`…). Claude Code MUST NOT crear commits ni hacer push sin autorización expresa, ni
  modificar ramas remotas.
- **Alcance:** no se modifican archivos ajenos a la tarea sin justificación, y se presenta un plan
  antes de los cambios importantes.
- **Subagentes y skills:** se incorporan progresivamente y se versionan; no se invocan por rutina.

## Gobierno

Esta constitución prevalece sobre las demás prácticas del proyecto, salvo sobre el enunciado y el
contrato API del profesor, que siempre prevalecen (principio I). Toda enmienda requiere
documentarse, ser aprobada por la persona estudiante y actualizar la versión: MAJOR si elimina o
redefine un principio de forma incompatible, MINOR si añade un principio o amplía de forma
material una guía, PATCH para aclaraciones. Cada especificación, plan y revisión de fase debe
comprobar el cumplimiento de estos principios; cualquier desviación se justifica por escrito.
La guía operativa diaria está en `CLAUDE.md` y `docs/HOJA-DE-RUTA.md`.

**Versión**: 1.0.2 | **Ratificada**: 2026-11-03 | **Última enmienda**: 2026-11-03
