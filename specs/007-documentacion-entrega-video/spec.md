# Especificación de la funcionalidad: Documentación, entrega académica y vídeo (F8)

**Rama de la funcionalidad**: `007-documentacion-entrega-video` (el proyecto trabaja en `main`; no se crea rama)

**Creada**: 2026-11-09

**Estado**: Planificación **definitiva en 5 pasos (8.1–8.5)** con **criterio temporal [E]/[D] y calendario** (2026-11-11), aprobada por la persona estudiante el 2026-11-11 con todas las decisiones acumuladas (formato de evaluación, memoria en Markdown, ventana de evaluación, publicación segura de F7). Los requisitos y entregables originales no cambian. **Varios requisitos de entrega siguen pendientes de confirmar** (ver «Aclaraciones requeridas»). **No se ha ejecutado ningún paso de F8** (8.1 requiere una autorización explícita nueva).

**Entrada**: «El profesor ha aclarado que la evaluación no consistirá en una exposición oral con preguntas, sino en un **vídeo grabado** que enseñe el funcionamiento del Observatorio Sísmico y demuestre el cumplimiento de los puntos de la rúbrica. Incluir: revisar literalmente la rúbrica y la guía de entregables; README final profesional; memoria técnica o documentos adicionales **si realmente son obligatorios**; consolidar arquitectura, diagramas, modelo y diccionario de datos, calidad, pruebas, resultados y evidencias; la observación de más de 24 h (SC-010 de F3); matriz de trazabilidad rúbrica → implementación → evidencia → demostración en vídeo; guion y recorrido de la grabación; entorno verificado para grabar Live, Replay, Kafka, PostgreSQL, FastAPI, Angular y demás requisitos; revisión del vídeo y de los entregables; acceso del profesor al repositorio privado.»

**Esta fase sustituye a la antigua «F7 — Memoria y defensa»** de la planificación anterior. Las referencias a «F7» en `specs/001`–`005` y en las evidencias de F3–F6 son históricas y significan lo que ahora es F8; el mapa está en `specs/INDICE.md`. Esos archivos no se modifican.

**Requisitos de origen** (solo lectura, no se modifican): `docs/referencias/ENUNCIADO.md` (§12 Entregables, §13 Evaluación, §9 y §11), `Guia-entregables-observatorio-sismico.md`, `FAQ-ALUMNADO.md` (H: preguntas 31–35), `CONTRATO-API.md`, `FUENTES-Y-LICENCIAS.md`, `VALIDACION.md`.

**Relación con F6/F7**: F6 cerrada (commit `fd9e1a7`; reservas en `docs/evidencias/f6/resultados.md` §5). **F7 cerrada** con el commit `9008772` (`[F7]` rediseño Mission Control: Panel · Análisis · Eventos, globo 3D con alternativa 2D, vista previa 3D, acceso local seguro; estado técnico en `specs/006-mejoras-evolucion/estado-tecnico-f7.md`). Esa es la **versión congelada** que F8 documenta, captura y graba; **F8 documenta el estado final real de la aplicación**.

## Actualización del 2026-11-11: simplificación a 5 pasos y nuevo formato de evaluación

**Decisión de la persona estudiante**: F8 pasa de 10 a **5 pasos** agrupando tareas relacionadas, **sin eliminar ningún requisito ni entregable**. Se conservan las tareas T001–T026 (correspondencia en `tasks.md`); se añaden T027–T031 (obligaciones antes implícitas) y T032 en adelante (publicación de F7, credenciales y disponibilidad) sin renumerar.

**Nuevo formato de evaluación (comunicado en clase; la fuente literal está pendiente de archivar, CA-01)**: ya no hay defensa presencial, presentación oral ni preguntas del profesor. La entrega se centra en **(1) un vídeo explicativo grabado personalmente con OBS** y **(2) un README muy completo con la correspondencia con la rúbrica**. Los documentos originales (`ENUNCIADO.md` §12, Guía 3, FAQ 31–35) siguen mencionando la defensa y **no se modifican**: F8 conserva **todos los requisitos técnicos, académicos y documentales** y **adapta la explicación y la demostración al vídeo** (lo que antes se explicaba en la defensa se explica y muestra en el vídeo).

**Se mantiene como entregable independiente la memoria técnica en Markdown (`docs/entrega/memoria.md`, CA-07)** (no la sustituye el README). Se comprobará su cobertura exacta contra el enunciado y la Guía 2.1–2.9. El README es además el documento de portfolio y contiene la sección de cumplimiento de la rúbrica; **no duplica** el contenido técnico de la memoria (enlaza a ella).

**Los cinco pasos** (detalle en `plan.md`): **8.1** Auditoría de requisitos y rúbrica · **8.2** Memoria técnica y README definitivo · **8.3** Evidencias y validación técnica final · **8.4** Guion, preparación y grabación del vídeo · **8.5** Auditoría final y entrega.

**Reglas de ejecución**: no se avanza automáticamente de un paso al siguiente (cada paso termina con revisión y aprobación de la persona estudiante); trabajo directo del agente principal, sin subagentes, salvo petición expresa; se reutilizan documentos y evidencias de F3–F7 y no se repiten pruebas costosas sin justificación y autorización; **PA-10** (SC-010) y **PA-11** (volúmenes temporales) se conservan; Netlify permanece en la versión de F6 salvo autorización expresa; sin ngrok sin permiso expreso; sin exponer claves ni cambiar configuraciones de seguridad; commits y push **solo manuales**, uno por fase (`[F8]`, mensajes en español).

## Formato de evaluación definitivo y publicación de F7 (decisiones aprobadas el 2026-11-11)

**Tres vías complementarias**: (A) **vídeo** explicativo grabado por la persona estudiante con OBS; (B) **revisión autónoma de la aplicación web publicada** durante la ventana de evaluación; (C) **revisión autónoma del repositorio privado de GitHub**. Para (C) el repositorio debe ofrecer código completo y organizado, README definitivo, memoria independiente (`docs/entrega/memoria.md`), arquitectura y decisiones, pruebas y resultados, evidencias verificables, instrucciones, correspondencia con la rúbrica y limitaciones explicadas.

**Tres entregables principales**: memoria técnica independiente en Markdown (cumple todos los apartados del enunciado y la Guía; puede enlazar notebooks, SQL y evidencias), **README definitivo** (puerta de entrada al repositorio y al cumplimiento de la rúbrica; enlaza a la memoria sin duplicarla) y **vídeo** (lo graba la persona estudiante; Claude solo prepara guion con «Qué decir» y «Qué mostrar», OBS, checklist y ensayo).

**Publicación de F7 (asunto pendiente de F8)**: la versión local es **F7 (Mission Control, commit `9008772`)** y la publicada en Netlify sigue siendo **F6**. Hasta la entrega hay que **definir, aprobar, autorizar, ejecutar y verificar** la publicación segura de F7 (FR-021). Riesgos a comprobar entonces: CORS, pantalla de clave, carga perezosa de Three.js, mapa 2D y vista previa desde la URL pública, URL cambiante del túnel y vuelta atrás al despliegue F6. **Nada se despliega ni se abre en la planificación.**

**Ventana de evaluación (CA-06)**: ~2 días con el PC encendido y los servicios operativos (ver FR-023 y US8). La actividad visible para el profesor se apoya también en REPRODUCCIÓN (FAQ 32) cuando no haya terremotos nuevos.

## Calendario y criterio temporal (2026-11-11; fechas sin confirmar)

**Calendario previsto** (CA-02 y CA-06, ambos **pendientes de confirmación definitiva**): hoy 2026-11-11 (miércoles); **entrega el jueves 19 o el viernes 20 de noviembre**; **evaluación previsiblemente el sábado 21 y el domingo 22**, con la posibilidad de que la ventana empiece en la entrega.

**Los datos sísmicos de USGS seguirán cambiando hasta la entrega**, de modo que F8 distingue:

| Clase | Qué es | Ejemplos | Cuándo se cierra |
|---|---|---|---|
| **[E] Estable** | Contenido que no depende de los terremotos recientes | Arquitectura, tecnologías y flujo; diccionario, procedencia y modelo SQL; reglas de calidad y decisiones; análisis históricos ya realizados **con sus fechas y filtros**; pruebas y evidencias anteriores con su fecha y alcance; estructura y contenido técnico de memoria y README; capturas de REPRODUCCIÓN (datos fijos de 2025) y de periodos fijos | **Ahora** (8.2–8.4) |
| **[D] Dinámica** | Depende de los datos recientes o del estado en el momento de la entrega | Capturas del modo EN VIVO; cifras actuales de eventos, magnitudes y estadísticas; estado de la última ingesta; evidencias que requieren datos recientes; comprobaciones finales de conectividad y acceso externo; grabación definitiva con OBS y su coincidencia con la web publicada | **Cerca de la entrega** (tarea **T040**) |

**Reglas para memoria y README**: conservar los resultados históricos con su fecha de referencia (las conclusiones de F5 **no se actualizan** porque lleguen nuevos terremotos); distinguir cifras históricas de estadísticas dinámicas; no escribir cifras de EN VIVO como permanentes (llevan fecha y la marca `[ACTUALIZAR EN CIERRE]`); mantener un anexo con los apartados y capturas que se actualizan al final; no inventar datos futuros ni resultados de pruebas; **no retrasar la redacción** por los datos dinámicos.

**Orden recomendado de cierre**: **publicación de F7 → congelación → capturas → vídeo → auditoría final → entrega.** El vídeo definitivo se graba **después** de publicar y verificar F7, sobre la versión congelada, para que coincida con la web que verá el profesor.

## Aclaraciones requeridas (NO se inventan; se resuelven con el profesor o con su texto literal)

Contraste entre la instrucción de la persona estudiante y los materiales oficiales del repositorio (consultados el 2026-11-09):

| Id | Asunto | Lo que dicen los materiales del repositorio | Lo que se afirma ahora | Qué hace falta |
|---|---|---|---|---|
| CA-01 | **Vídeo en lugar de defensa oral** | Los materiales hablan de «defensa» y de una **explicación individual oral** (`ENUNCIADO.md` §12; Guía 3.2 y 3.3; FAQ 31). **No mencionan ningún vídeo** (sin resultados de «vídeo/grabación» en `docs/referencias/`). | **Confirmado** por el profesor en clase: sin defensa presencial, presentación oral ni preguntas; evaluación por vídeo + web publicada + repositorio. | **Resuelta en lo práctico.** Queda **archivar una fuente escrita, si está disponible** (texto, medio y fecha) en `requisitos-fuente.md`. Los materiales originales no se modifican. |
| CA-02 | Fecha límite de entrega y canal | No consta ninguna fecha ni canal. | **Entrega prevista: jueves 19 o viernes 20 de noviembre de 2026** (comunicado por la persona estudiante; la fecha exacta **no está confirmada**). | **Pendiente de confirmación definitiva**: día exacto, hora y vía (plataforma, correo, repositorio). Fija el calendario de F8 (ver «Calendario y criterio temporal»). |
| CA-03 | Requisitos del vídeo | No consta duración, formato, resolución, idioma, si aparece la persona estudiante, si es una sola toma, dónde se sube ni si se entrega el archivo o un enlace. | «Enseñar el funcionamiento y demostrar la rúbrica». Se graba con OBS. | **Pendiente de confirmar**: duración, formato/resolución, idioma, cámara o solo pantalla, plataforma y archivo o enlace. No se inventan condiciones; el guion es modular (bloques recortables). |
| CA-04 | Rúbrica específica del vídeo | La rúbrica es la de `ENUNCIADO.md` §13 (cinco criterios: extracción, calidad, modelado, análisis, reflexión) más las pruebas de aceptación y la reproducción histórica (§11–§12). | «Los puntos de la rúbrica». | **Pendiente**: se desconoce si habrá una rúbrica distinta de la técnica original; mientras tanto se usa la original. |
| CA-05 | Acceso del profesor al **repositorio privado** | La lista final de la Guía pide «el profesor puede acceder al repositorio». El remoto es `origin` (GitHub); su visibilidad y las invitaciones no se pueden comprobar desde el entorno. | El profesor revisará el repositorio por su cuenta. | **Pendiente**: usuario o correo del profesor a invitar y **verificación de permisos antes de entregar** (sin modificar permisos ni hacer público el repositorio sin tu decisión expresa). |
| CA-06 | **Acceso del profesor a la web publicada y ventana de evaluación** | `ENUNCIADO.md` §12: «URL del panel y procedimiento para activar el backend/túnel durante la defensa»; FAQ: la entrega no exige 24/7 pero sí un procedimiento de activación. | **Parcialmente resuelta.** El profesor **sí** accederá por su cuenta a la aplicación publicada y al repositorio. **Evaluación prevista durante el fin de semana del 21 y 22 de noviembre de 2026**; hay que mantener el PC, Docker y los servicios operativos. **La ventana podría comenzar antes** (desde la entrega, 19/20), con lo que podrían ser entre ~2 y ~4 días. Arquitectura sin cambios (API, Kafka y PostgreSQL en el PC + túnel ngrok + Netlify); sin 24/7 indefinida ni nube. | **Pendiente**: fechas exactas de inicio y fin de la ventana (con CA-02); **URL definitiva** y condiciones de acceso; **estrategia segura de publicación de F7** (hoy Netlify sirve F6, local es F7); **entrega privada de credenciales**; checklist de disponibilidad (incluida la política ante actualizaciones y reinicios de Windows). |
| CA-07 | Formato de la memoria | `ENUNCIADO.md` §12 y la Guía bloque 2 exigen una **memoria o notebook**. | **Resuelta** por la persona estudiante: **`docs/entrega/memoria.md`** (Markdown, independiente; el README no la sustituye). Se puede enlazar a notebooks, SQL y evidencias existentes. | **Resuelta.** Solo quedaría confirmar con el profesor si desea otro formato (no bloquea). |
| CA-08 | Qué sustituye a la «explicación individual» (Guía 3.3, FAQ, lista final punto 13) | Piden explicar individualmente el flujo completo y una decisión técnica propia. | Sin defensa presencial ni preguntas: **la explicación técnica se incorpora al vídeo** (bloque del guion). | **Resuelta en lo práctico.** Pendiente solo cualquier confirmación formal adicional. |

## Notas de clase (2026-11-09) sobre la evidencia y la grabación
Notas de clase del 2026-11-09 recogidas por la persona estudiante: **orientaciones comentadas por el profesor, no requisitos obligatorios** ni parte de los materiales oficiales. Se incorporan a la planificación como criterio de trabajo; no sustituyen a la rúbrica ni a la Guía.
- Reforzar las **evidencias visuales**: capturas reales del frontend, fragmentos relevantes de código, resultados de pruebas y demostraciones del funcionamiento.
- La grabación se organiza como **recorrido por los criterios de la rúbrica**: requisito → funcionalidad → evidencia → demostración.
- **README profesional con capturas y enlaces internos a evidencias**, además de la memoria o notebook obligatoria (el README no la sustituye).
- El formato exacto del vídeo **sigue pendiente de confirmación formal** (CA-01/CA-03). Desde el 2026-11-11 se asume, como comunicado en clase, que **no hay defensa oral ni preguntas** y que la entrega es vídeo + README.
- Durante F7 Netlify no se actualiza (política de F7): las capturas y la grabación se hacen sobre la aplicación que se entrega (local salvo que se autorice publicar, paso 8.7).

## Requisitos de entrega CONFIRMADOS por los materiales oficiales (literales, resumidos)

- **Repositorio** (`ENUNCIADO.md` §12, Guía 1): código de los componentes, Dockerfile(s), `compose.yaml` con los cinco servicios obligatorios, dependencias, `.env.example` sin credenciales e **instrucciones reproducibles en `README.md`**; sin `node_modules`, credenciales, volúmenes binarios ni grandes conjuntos descargables; datos originales con procedimiento de regeneración.
- **Memoria o notebook** (Guía 2; `ENUNCIADO.md` §12): **obligatoria en una de las dos formas**; **el README no la sustituye** (la Guía la define como bloque 2 con objetivo y funcionamiento, diccionario de datos, procedencia y registro de consultas, apartado de calidad, modelo conceptual/lógico/físico con SQL e índices, análisis con ≥ 3 conclusiones y capturas de filtros, complejidad/mediciones con ≥ 3 tamaños/costes/mejoras, evidencias de pruebas y reproducción histórica). La Guía admite «una memoria clara con enlaces a varios archivos bien organizados».
- **Panel y defensa** (Guía 3; `ENUNCIADO.md` §12): URL publicada en Netlify, comprobada desde otro dispositivo; procedimiento breve para activar el sistema; explicación individual del flujo y de una decisión técnica propia (en el nuevo formato, esa explicación se traslada al vídeo: CA-01 y CA-08, pendientes de confirmar).
- **Evaluación** (`ENUNCIADO.md` §13): rúbrica de cinco criterios con cuatro niveles; evidencias concretas por criterio. «Se valora que el sistema funcione, que las evidencias sean comprobables y que puedas justificar las decisiones; no la cantidad de documentos» (Guía, final).
- **Lista final de comprobación** (Guía; FAQ 35): 13 puntos; el estado actual está en `docs/evidencias/f6/lista-final.md`.

## Historias de usuario

### US1 — Alinear la entrega con las fuentes oficiales (P1)
Quien entrega dispone de una lista literal y verificable de qué exige el profesor, con lo confirmado separado de lo pendiente de aclaración.
**Prueba independiente**: la matriz de requisitos cita archivo y apartado para cada exigencia y marca CA-01…CA-08 como aclarada o pendiente. **Escenarios**: dada una exigencia, existe su fuente literal; dado un asunto sin fuente, consta como aclaración.

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

### US7 — Acceso y entrega (P1; acciones de la persona estudiante)
El profesor puede (a) ver el vídeo, (b) abrir **por su cuenta** la aplicación publicada durante la ventana de evaluación y usarla con los datos reales, y (c) acceder al repositorio privado; la entrega llega por el canal indicado. **Prueba**: confirmación de cada acceso (repositorio verificado, panel publicado comprobado desde otro dispositivo con la versión que se entrega) y de la entrega.

### US8 — Disponibilidad durante la ventana de evaluación (P1; con autorizaciones expresas)
El sistema permanece operativo ~2 días: PC encendido sin suspensión, Docker, Kafka, PostgreSQL, productor, consumidor y API sanos, túnel ngrok activo, frontend publicado y credenciales entregadas de forma privada. **Prueba**: checklist de activación previa y de acceso del profesor (8.5) y comprobación de funcionamiento continuado, conectividad y recuperación (8.3). No es la prueba SC-010.

## Requisitos funcionales

- **FR-001**: F8 MUST revisar literalmente `ENUNCIADO.md`, `Guia-entregables-observatorio-sismico.md`, `FAQ-ALUMNADO.md` y `CONTRATO-API.md` y registrar la fuente de cada requisito (archivo y apartado); MUST NOT inventar requisitos del profesor.
- **FR-002**: Lo no cubierto por los materiales (CA-01…CA-08) MUST constar como aclaración pendiente hasta tener la fuente del profesor; F8 MUST NOT darlas por resueltas.
- **FR-003**: MUST existir una matriz de trazabilidad requisito de la rúbrica → implementación → evidencia → demostración en vídeo (y estado: verificado / con reservas / pendiente).
- **FR-004**: MUST existir una memoria o notebook que cubra la Guía 2.1–2.9 y enlace a las evidencias; el README MUST ser final, profesional y reproducible, **sin sustituir a la memoria**.
- **FR-005**: La documentación MUST reutilizar y enlazar las evidencias de F3–F6 (sin reescribirlas) y registrar con fecha cualquier corrección posterior.
- **FR-006**: MUST incluir arquitectura con diagramas, modelo conceptual/lógico/físico con SQL e índices justificados, diccionario de datos, procedencia y registro de consultas, calidad con resultados antes/después, ≥ 3 conclusiones con filtros y capturas, complejidad/mediciones/costes/mejoras (datos de costes propios de la persona estudiante marcados como supuestos hasta que los aporte).
- **FR-007**: SC-010 de F3 MUST ejecutarse solo con autorización expresa (PA-10), con consultas de solo lectura y resultado real; si no se cumple, se documenta como no cumplido.
- **FR-008**: MUST existir un guion y recorrido de grabación, y un entorno verificado en ensayo en seco; las pruebas con ngrok o Netlify requieren autorización expresa en cada ocasión.
- **FR-009**: El vídeo MUST mostrar únicamente datos reales o claramente etiquetados (Live / REPRODUCCIÓN / sintético), sin exponer credenciales, claves ni el `.env`.
- **FR-010**: MUST realizarse una revisión final de entregables (lista de 13 puntos + matriz + requisitos del vídeo), con revisión acotada de Architect y QA Engineer solo si la persona estudiante lo pide.
- **FR-011**: La gestión del acceso del profesor al repositorio y la entrega MUST quedar registradas como acciones de la persona estudiante, con fecha y confirmación. No se modifican permisos ni se hace público el repositorio sin decisión expresa.
- **FR-013**: MUST planificarse un conjunto de **evidencias visuales reales**: capturas del frontend (Live, Replay, filtros, estado, móvil si procede), fragmentos de código relevantes, resultados de pruebas y demostraciones; cada una enlazada desde la matriz y la memoria, sin datos ni claves sensibles visibles ni material inventado.
- **FR-014**: La grabación MUST estructurarse por criterios de la rúbrica con el recorrido *requisito → funcionalidad → evidencia → demostración*; el README final MUST incluir capturas y enlaces internos a evidencias.
- **FR-015** (2026-11-11): La documentación y la demostración MUST adaptarse al formato **vídeo + README**: **ninguna obligación original se elimina** por el cambio de formato; MUST NOT prepararse contenido para una defensa oral tradicional (preguntas y respuestas del profesor).
- **FR-016**: El README MUST incluir una **sección de cumplimiento de la rúbrica** que enlace cada criterio con implementación, evidencia, memoria y bloque del vídeo, sin duplicar el contenido técnico de la memoria; MUST documentar el proyecto real (objetivos, tecnologías, arquitectura, estructura, ejecución segura, Panel · Análisis · Eventos, globo 3D y 2D, EN VIVO y REPRODUCCIÓN, calidad, huecos, modelo, análisis, pruebas, capturas, limitaciones) y servir como portfolio.
- **FR-017**: La memoria MUST comprobarse apartado a apartado contra `ENUNCIADO.md` §12 y la Guía 2.1–2.9 (cobertura exacta, con tabla de comprobación).
- **FR-018**: El guion MUST organizarse **por bloques siguiendo la rúbrica** y cada escena MUST tener dos apartados: **«Qué decir»** (narración natural) y **«Qué mostrar»** (pantalla, comandos, ventanas); MUST cubrir arquitectura, Kafka, PostgreSQL, API, Panel · Análisis · Eventos, EN VIVO y REPRODUCCIÓN, calidad, análisis, pruebas y recuperación de huecos, y la explicación del flujo y de una decisión técnica (CA-08). La persona estudiante graba con OBS; Claude **no** genera ni edita el vídeo.
- **FR-019**: MUST prepararse la configuración de OBS (escenas, fuentes, audio, resolución propuesta mientras CA-03 esté abierta) y una checklist de privacidad (claves, `.env`, URLs de ngrok, notificaciones, rutas personales) y un ensayo en seco.
- **FR-026** (2026-11-11): La documentación MUST separar contenido **estable [E]** y **dinámico [D]** (ver «Calendario y criterio temporal»); las cifras de EN VIVO MUST llevar fecha y la marca `[ACTUALIZAR EN CIERRE]`; las conclusiones históricas MUST conservarse sin recalcularse por la llegada de nuevos datos.
- **FR-027**: El **vídeo definitivo** MUST grabarse después de **publicar y verificar F7 y congelar la versión**, y MUST coincidir con la web publicada; el **cierre dinámico (T040)** MUST completarse antes de la entrega.
- **FR-028** (2026-11-11): La web pública MUST poder usarse **sin que el visitante introduzca ninguna clave** (Panel, Análisis, Eventos, globo 3D, EN VIVO y REPRODUCCIÓN). La clave de FastAPI MUST permanecer **solo** en una variable privada de Netlify y en el servidor (nunca en JavaScript, HTML, respuestas, cabeceras ni registros); una **Netlify Function** MUST ser un intermediario de **solo lectura** con rutas, métodos y parámetros cerrados y destino fijo; FastAPI MUST seguir exigiendo la clave y `localhost:4200` MUST conservar su proxy local; el refresco público MUST seguir siendo de 60 s (ENUNCIADO §9) (T042–T043)
- **FR-020**: Ningún paso de F8 comienza ni avanza automáticamente al siguiente: cada paso termina con un resumen y la aprobación expresa de la persona estudiante.
- **FR-021**: **Publicación de F7** (diferencia local F7 ↔ Netlify F6): MUST registrarse como asunto pendiente y resolverse en este orden: (1) definir la estrategia segura, (2) **aprobarla por escrito**, (3) ejecutarla **solo con autorización expresa** (Netlify y, si hace falta, ngrok), (4) verificarla desde otro dispositivo con la API real, con vía de vuelta al despliegue F6. Sin exponer el proxy local de desarrollo, sin desactivar controles de seguridad y sin publicar claves.
- **FR-022**: La **credencial de acceso del profesor** MUST entregarse por un canal privado elegido por la persona estudiante; MUST NOT figurar en el repositorio, el README, la memoria, el vídeo, las capturas ni los logs; el repositorio solo documenta el **procedimiento**.
- **FR-023**: MUST prepararse una **checklist de disponibilidad** para la ventana de evaluación: arranque ordenado de servicios, estado sano, conectividad externa (túnel y panel publicado), PC sin suspensión automática (se comprueba y documenta; cambiar ajustes de Windows lo decide la persona estudiante), riesgos de reinicio (actualizaciones, Docker, URL del túnel), recuperación ante fallos (huecos con el procedimiento de recuperación) y regla de no cambiar código ni servicios durante la ventana.
- **FR-024**: **SC-010 de F3** MUST seguir siendo una prueba **independiente** (consultas de solo lectura, >24 h desde la activación) pendiente de **PA-10**; mantener el PC encendido durante la corrección **no** equivale a superarla. Lo observado en la ventana puede citarse como evidencia de disponibilidad, no como cumplimiento de SC-010.
- **FR-025**: La matriz de trazabilidad MUST incluir, por cada requisito: fuente y requisito exacto, implementación real, archivos/componentes/servicios, pruebas y evidencias disponibles, estado, apartado de la memoria, apartado del README, escena/minuto del vídeo y pendientes/limitaciones; MUST contemplar la revisión autónoma de la web publicada y del repositorio; y un requisito **no se da por verificado solo por existir código**.
- **FR-012**: F8 MUST NOT modificar los documentos del profesor, `specs/001`–`005` ni las evidencias de F3–F6; MUST NOT realizar operaciones destructivas sobre datos, contenedores o volúmenes; commits y push solo manuales.

## Criterios de éxito

- **SC-001**: 100 % de los requisitos de entrega tienen fuente literal; 0 requisitos del profesor inventados; CA-01…CA-08 resueltas o visibles como pendientes.
- **SC-002**: La matriz cubre los cinco criterios de la rúbrica y los 13 puntos de la lista final, con enlace a evidencia comprobable o estado «pendiente».
- **SC-003**: La memoria/notebook cubre la Guía 2.1–2.9 (o consta cada reserva) y el README arranca el sistema en un entorno limpio paralelo.
- **SC-004**: SC-010 de F3 queda **cumplido con evidencia real** o **documentado como no cumplido**; nunca declarado sin respaldo.
- **SC-005**: El ensayo en seco de la grabación se completa sin errores y la checklist previa está marcada.
- **SC-006**: El vídeo cumple los requisitos aclarados en CA-03 y cada fila «en vídeo» de la matriz aparece en él.
- **SC-007**: Acceso del profesor al repositorio y a la web publicada, y entrega, confirmados por la persona estudiante (web comprobada desde otro dispositivo con la versión que se entrega).
- **SC-008**: La checklist de disponibilidad de la ventana de evaluación está completa y marcada antes de que comience; la publicación de F7 está aprobada, ejecutada con autorización y verificada, o consta como pendiente.
- **SC-009**: Al entregar, las capturas y cifras [D] están actualizadas con fecha, el vídeo corresponde a la versión publicada y T040 está completada (o sus excepciones constan como pendientes).

## Fuera de alcance
Nuevas funcionalidades o rediseños (F7), cambios de arquitectura, Spark/Flink/Kubernetes/ML, la segunda versión con Codex, y reabrir F0–F6.

## Supuestos
- La persona estudiante graba y sube el vídeo; Claude prepara guion, entorno, matriz y revisión, pero **no puede grabar ni entregar**.
- El estado de la aplicación al grabar será el de la versión que se entrega (incluidas las mejoras de F7 que se hayan hecho).
- La ventana de evaluación (fin de semana 21–22 de noviembre, posiblemente desde la entrega del 19/20; fechas pendientes) exige PC y servicios operativos; no hay disponibilidad 24/7 indefinida ni migración del backend a la nube.
- La observación de 24 h requiere que el sistema siga en marcha y autorización expresa; ya han transcurrido más de 24 h desde la activación (2026-11-06 16:54 UTC), pero SC-010 aún no se ha ejecutado ni evaluado.
