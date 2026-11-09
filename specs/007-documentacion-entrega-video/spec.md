# Especificación de la funcionalidad: Documentación, entrega académica y vídeo (F8)

**Rama de la funcionalidad**: `007-documentacion-entrega-video` (el proyecto trabaja en `main`; no se crea rama)

**Creada**: 2026-11-09

**Estado**: Borrador de planificación aprobado en su estructura el 2026-11-09; **varios requisitos de entrega requieren aclaración** del profesor (ver «Aclaraciones requeridas»). No se ha implementado nada.

**Entrada**: «El profesor ha aclarado que la evaluación no consistirá en una exposición oral con preguntas, sino en un **vídeo grabado** que enseñe el funcionamiento del Observatorio Sísmico y demuestre el cumplimiento de los puntos de la rúbrica. Incluir: revisar literalmente la rúbrica y la guía de entregables; README final profesional; memoria técnica o documentos adicionales **si realmente son obligatorios**; consolidar arquitectura, diagramas, modelo y diccionario de datos, calidad, pruebas, resultados y evidencias; la observación de más de 24 h (SC-010 de F3); matriz de trazabilidad rúbrica → implementación → evidencia → demostración en vídeo; guion y recorrido de la grabación; entorno verificado para grabar Live, Replay, Kafka, PostgreSQL, FastAPI, Angular y demás requisitos; revisión del vídeo y de los entregables; acceso del profesor al repositorio privado.»

**Esta fase sustituye a la antigua «F7 — Memoria y defensa»** de la planificación anterior. Las referencias a «F7» en `specs/001`–`005` y en las evidencias de F3–F6 son históricas y significan lo que ahora es F8; el mapa está en `specs/INDICE.md`. Esos archivos no se modifican.

**Requisitos de origen** (solo lectura, no se modifican): `docs/referencias/ENUNCIADO.md` (§12 Entregables, §13 Evaluación, §9 y §11), `Guia-entregables-observatorio-sismico.md`, `FAQ-ALUMNADO.md` (H: preguntas 31–35), `CONTRATO-API.md`, `FUENTES-Y-LICENCIAS.md`, `VALIDACION.md`.

**Relación con F6/F7**: F6 cerrada (commit `fd9e1a7`; reservas en `docs/evidencias/f6/resultados.md` §5). F7 (mejoras, `specs/006-mejoras-evolucion/`) puede seguir abierta mientras F8 se prepara, pero **F8 documenta el estado final real de la aplicación**: la grabación y las capturas deben hacerse sobre la versión que se entrega.

## Aclaraciones requeridas (NO se inventan; se resuelven con el profesor o con su texto literal)

Contraste entre la instrucción de la persona estudiante y los materiales oficiales del repositorio (consultados el 2026-11-09):

| Id | Asunto | Lo que dicen los materiales del repositorio | Lo que se afirma ahora | Qué hace falta |
|---|---|---|---|---|
| CA-01 | **Vídeo en lugar de exposición oral** | Los materiales hablan de «defensa» y de una **explicación individual oral** (`ENUNCIADO.md` §12; Guía 3.2 y 3.3; FAQ 31). **No mencionan ningún vídeo** (búsqueda literal de «vídeo/grabación» sin resultados en todo `docs/referencias/`). | El profesor lo indicó **en clase** (notas de la persona estudiante, 2026-11-09): se entrega un vídeo grabado. | **Confirmación formal** por escrito del profesor (texto literal, fuente y fecha), incluido el formato exacto. Hasta entonces F8 prepara el vídeo **y** mantiene preparada la explicación individual. **Pendiente de confirmación formal.** |
| CA-02 | Fecha límite de entrega y canal | No consta ninguna fecha ni canal. | — | Fecha, hora y vía (plataforma, correo, repositorio). |
| CA-03 | Requisitos del vídeo | No consta duración, formato, resolución, idioma, si aparece la persona estudiante, si es una sola toma, dónde se sube ni si se entrega el archivo o un enlace. | «Enseñar el funcionamiento y demostrar la rúbrica». | Duración máxima, formato, plataforma de entrega, y si debe incluir la explicación individual del flujo completo y de una decisión técnica. |
| CA-04 | Qué se demuestra en el vídeo | La rúbrica es la de `ENUNCIADO.md` §13 (cinco criterios: extracción, calidad, modelado, análisis, reflexión) más las pruebas de aceptación y la reproducción histórica (§11–§12). | «Los puntos de la rúbrica». | Confirmar que no existe una rúbrica distinta específica del vídeo. |
| CA-05 | Acceso del profesor al repositorio privado | La lista final de la Guía pide «el profesor puede acceder al repositorio». El remoto es `origin` (GitHub); su visibilidad y las invitaciones no se pueden comprobar desde el entorno. | Se gestionará cuando corresponda. | Usuario o correo del profesor a invitar y fecha límite. |
| CA-06 | URL del panel y backend durante la evaluación | `ENUNCIADO.md` §12: «URL del panel y procedimiento para activar el backend/túnel durante la defensa». Con vídeo grabado, no queda claro si el profesor abrirá la URL. | — | Si el profesor accederá al panel publicado (y por tanto el túnel debe estar activo) o solo evaluará el vídeo. |
| CA-07 | Formato de la memoria | `ENUNCIADO.md` §12 y la Guía bloque 2 exigen una **memoria o notebook**; los nombres son orientativos (`docs/memoria.md` o `notebooks/memoria.ipynb`). | — | Confirmar formato aceptado (Markdown en el repositorio, PDF, notebook) y si va dentro del repositorio. |

## Notas de clase (2026-11-09) sobre la evidencia y la grabación
Notas de clase del 2026-11-09 recogidas por la persona estudiante: **orientaciones comentadas por el profesor, no requisitos obligatorios** ni parte de los materiales oficiales. Se incorporan a la planificación como criterio de trabajo; no sustituyen a la rúbrica ni a la Guía.
- Reforzar las **evidencias visuales**: capturas reales del frontend, fragmentos relevantes de código, resultados de pruebas y demostraciones del funcionamiento.
- La grabación se organiza como **recorrido por los criterios de la rúbrica**: requisito → funcionalidad → evidencia → demostración.
- **README profesional con capturas y enlaces internos a evidencias**, además de la memoria o notebook obligatoria (el README no la sustituye).
- El formato exacto del vídeo **sigue pendiente de confirmación formal** (CA-01/CA-03).
- Durante F7 Netlify no se actualiza (política de F7): las capturas y la grabación se hacen sobre la aplicación que se entrega (local salvo que se autorice publicar, paso 8.7).

## Requisitos de entrega CONFIRMADOS por los materiales oficiales (literales, resumidos)

- **Repositorio** (`ENUNCIADO.md` §12, Guía 1): código de los componentes, Dockerfile(s), `compose.yaml` con los cinco servicios obligatorios, dependencias, `.env.example` sin credenciales e **instrucciones reproducibles en `README.md`**; sin `node_modules`, credenciales, volúmenes binarios ni grandes conjuntos descargables; datos originales con procedimiento de regeneración.
- **Memoria o notebook** (Guía 2; `ENUNCIADO.md` §12): **obligatoria en una de las dos formas**; **el README no la sustituye** (la Guía la define como bloque 2 con objetivo y funcionamiento, diccionario de datos, procedencia y registro de consultas, apartado de calidad, modelo conceptual/lógico/físico con SQL e índices, análisis con ≥ 3 conclusiones y capturas de filtros, complejidad/mediciones con ≥ 3 tamaños/costes/mejoras, evidencias de pruebas y reproducción histórica). La Guía admite «una memoria clara con enlaces a varios archivos bien organizados».
- **Panel y defensa** (Guía 3; `ENUNCIADO.md` §12): URL publicada en Netlify, comprobada desde otro dispositivo; procedimiento breve para activar el sistema; explicación individual del flujo y de una decisión técnica propia (esto último pendiente de CA-01).
- **Evaluación** (`ENUNCIADO.md` §13): rúbrica de cinco criterios con cuatro niveles; evidencias concretas por criterio. «Se valora que el sistema funcione, que las evidencias sean comprobables y que puedas justificar las decisiones; no la cantidad de documentos» (Guía, final).
- **Lista final de comprobación** (Guía; FAQ 35): 13 puntos; el estado actual está en `docs/evidencias/f6/lista-final.md`.

## Historias de usuario

### US1 — Alinear la entrega con las fuentes oficiales (P1)
Quien entrega dispone de una lista literal y verificable de qué exige el profesor, con lo confirmado separado de lo pendiente de aclaración.
**Prueba independiente**: la matriz de requisitos cita archivo y apartado para cada exigencia y marca CA-01…CA-07 como aclarada o pendiente. **Escenarios**: dada una exigencia, existe su fuente literal; dado un asunto sin fuente, consta como aclaración.

### US2 — Matriz de trazabilidad (P1)
Para cada punto de la rúbrica y de la lista final: requisito → implementación → evidencia → momento del vídeo. **Prueba**: 100 % de las filas con enlace a evidencia existente o marcadas como pendientes; ninguna fila «superada» sin evidencia.

### US3 — Memoria o notebook y README final (P1)
Una memoria (o notebook) que consolide arquitectura con diagramas, modelo conceptual/lógico/físico, diccionario de datos, procedencia, calidad, pruebas, resultados y evidencias, y un README final profesional que permita arrancar y demostrar. **Prueba**: cada apartado de la Guía 2.1–2.9 está cubierto o consta como reserva; el README se verifica en un entorno limpio paralelo (como en F6).

### US4 — Observación de más de 24 h (SC-010 de F3) (P2, requiere autorización PA-10)
Ejecutar las consultas de solo lectura previstas en F6 (T075–T077 de `specs/005-…`, aún sin hacer) y documentar el resultado real, incluidas las interrupciones (p. ej. reinicio del 2026-11-08). **No se declara cumplido si la comprobación no lo respalda.**

### US5 — Guion y entorno de grabación (P1)
Guion/recorrido que cubra Live, Replay, Kafka, PostgreSQL, FastAPI, Angular y los demás puntos de la rúbrica, y un entorno verificado (ensayo en seco) antes de grabar. **Prueba**: ensayo completo sin abrir nada no autorizado; checklist previa a la grabación.

### US6 — Vídeo y revisión final (P1; la grabación la realiza la persona estudiante)
Vídeo grabado y revisado frente a la matriz y a los requisitos de CA-03; revisión final de entregables. **Prueba**: cada fila de la matriz marcada «en vídeo» aparece en la grabación, con minuto.

### US7 — Acceso y entrega (P1; acción de la persona estudiante)
Acceso del profesor al repositorio privado y entrega por el canal indicado. **Prueba**: confirmación del acceso y de la entrega.

## Requisitos funcionales

- **FR-001**: F8 MUST revisar literalmente `ENUNCIADO.md`, `Guia-entregables-observatorio-sismico.md`, `FAQ-ALUMNADO.md` y `CONTRATO-API.md` y registrar la fuente de cada requisito (archivo y apartado); MUST NOT inventar requisitos del profesor.
- **FR-002**: Lo no cubierto por los materiales (CA-01…CA-07) MUST constar como aclaración pendiente hasta tener la fuente del profesor; F8 MUST NOT darlas por resueltas.
- **FR-003**: MUST existir una matriz de trazabilidad requisito de la rúbrica → implementación → evidencia → demostración en vídeo (y estado: verificado / con reservas / pendiente).
- **FR-004**: MUST existir una memoria o notebook que cubra la Guía 2.1–2.9 y enlace a las evidencias; el README MUST ser final, profesional y reproducible, **sin sustituir a la memoria**.
- **FR-005**: La documentación MUST reutilizar y enlazar las evidencias de F3–F6 (sin reescribirlas) y registrar con fecha cualquier corrección posterior.
- **FR-006**: MUST incluir arquitectura con diagramas, modelo conceptual/lógico/físico con SQL e índices justificados, diccionario de datos, procedencia y registro de consultas, calidad con resultados antes/después, ≥ 3 conclusiones con filtros y capturas, complejidad/mediciones/costes/mejoras (datos de costes propios de la persona estudiante marcados como supuestos hasta que los aporte).
- **FR-007**: SC-010 de F3 MUST ejecutarse solo con autorización expresa (PA-10), con consultas de solo lectura y resultado real; si no se cumple, se documenta como no cumplido.
- **FR-008**: MUST existir un guion y recorrido de grabación, y un entorno verificado en ensayo en seco; las pruebas con ngrok o Netlify requieren autorización expresa en cada ocasión.
- **FR-009**: El vídeo MUST mostrar únicamente datos reales o claramente etiquetados (Live / REPRODUCCIÓN / sintético), sin exponer credenciales, claves ni el `.env`.
- **FR-010**: MUST realizarse una revisión final de entregables (lista de 13 puntos + matriz + requisitos del vídeo), con revisión acotada de Architect y QA Engineer solo si la persona estudiante lo pide.
- **FR-011**: La gestión del acceso del profesor al repositorio y la entrega MUST quedar registradas como acciones de la persona estudiante, con fecha y confirmación.
- **FR-013**: MUST planificarse un conjunto de **evidencias visuales reales**: capturas del frontend (Live, Replay, filtros, estado, móvil si procede), fragmentos de código relevantes, resultados de pruebas y demostraciones; cada una enlazada desde la matriz y la memoria, sin datos ni claves sensibles visibles ni material inventado.
- **FR-014**: La grabación MUST estructurarse por criterios de la rúbrica con el recorrido *requisito → funcionalidad → evidencia → demostración*; el README final MUST incluir capturas y enlaces internos a evidencias.
- **FR-012**: F8 MUST NOT modificar los documentos del profesor, `specs/001`–`005` ni las evidencias de F3–F6; MUST NOT realizar operaciones destructivas sobre datos, contenedores o volúmenes; commits y push solo manuales.

## Criterios de éxito

- **SC-001**: 100 % de los requisitos de entrega tienen fuente literal; 0 requisitos del profesor inventados; CA-01…CA-07 resueltas o visibles como pendientes.
- **SC-002**: La matriz cubre los cinco criterios de la rúbrica y los 13 puntos de la lista final, con enlace a evidencia comprobable o estado «pendiente».
- **SC-003**: La memoria/notebook cubre la Guía 2.1–2.9 (o consta cada reserva) y el README arranca el sistema en un entorno limpio paralelo.
- **SC-004**: SC-010 de F3 queda **cumplido con evidencia real** o **documentado como no cumplido**; nunca declarado sin respaldo.
- **SC-005**: El ensayo en seco de la grabación se completa sin errores y la checklist previa está marcada.
- **SC-006**: El vídeo cumple los requisitos aclarados en CA-03 y cada fila «en vídeo» de la matriz aparece en él.
- **SC-007**: Acceso del profesor y entrega confirmados por la persona estudiante.

## Fuera de alcance
Nuevas funcionalidades o rediseños (F7), cambios de arquitectura, Spark/Flink/Kubernetes/ML, la segunda versión con Codex, y reabrir F0–F6.

## Supuestos
- La persona estudiante graba y sube el vídeo; Claude prepara guion, entorno, matriz y revisión, pero **no puede grabar ni entregar**.
- El estado de la aplicación al grabar será el de la versión que se entrega (incluidas las mejoras de F7 que se hayan hecho).
- La observación de 24 h requiere que el sistema siga en marcha y autorización expresa; ya han transcurrido más de 24 h desde la activación (2026-11-06 16:54 UTC), pero SC-010 aún no se ha ejecutado ni evaluado.
