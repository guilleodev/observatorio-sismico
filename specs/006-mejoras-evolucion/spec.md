# Especificación del marco: Mejoras y evolución del Observatorio Sísmico (F7)

**Rama de la funcionalidad**: `006-mejoras-evolucion` (el proyecto trabaja en `main`; no se crea rama)

**Creada**: 2026-11-09

**Estado**: Marco aprobado en su planificación el 2026-11-09 por la persona estudiante. **Ninguna mejora está aprobada para implementarse**: cada una pasa por su propia aprobación (ver «Ciclo de una mejora»).

**Entrada**: «Dedicar la F7 a mejorar progresivamente la aplicación ya construida: visual y rediseño del frontend Angular, experiencia de usuario y accesibilidad, filtros, navegación, mapas, estadísticas y gráficas, optimización y pequeños ajustes técnicos, nuevas funcionalidades propuestas y aprobadas por la persona estudiante y comodidad del entorno de desarrollo local. Fase flexible: las mejoras se descubren mientras se usa y estudia el proyecto.»

**F7 es una fase ABIERTA (decisión de la persona estudiante, 2026-11-09)**: no hay secuencia obligatoria de pasos, ni número previsto de ellos, ni paso de cierre definido. Se trabaja **experimentando, implementando y viendo resultados en `localhost:4200`**, con la mínima documentación necesaria. Las candidatas (`C-nn`) son un **cajón de ideas** que se puede ampliar, modificar, posponer o descartar libremente; **ninguna es una subfase** ni se aprueba automáticamente. Un número `F7.n` se asigna **solo cuando la persona estudiante decide empezar un trabajo concreto**, y ese `F7.n` puede **agrupar varias mejoras relacionadas** y tener un alcance amplio.

**Qué es esta especificación**: un **marco** (no una funcionalidad concreta). Define alcance, reglas, ciclo de trabajo y criterios comunes. Cada mejora aprobada tendrá su propia mini-especificación en `mejoras/F7.n-<nombre>/` (plantilla en `plantilla-mejora.md`), de modo que la fase se puede ampliar **sin reescribir esta planificación**.

**Relación con las fases anteriores**: F0–F6 son historial completado y **no se reabren** (F6 cerrada técnicamente, commit `fd9e1a7`). Lo que F6 y las fases anteriores llamaban «F7 — memoria y defensa» pasa a ser la **F8** (`specs/007-documentacion-entrega-video/`); ver `specs/INDICE.md`. Las reservas de F6 (SC-010 de F3, T063, recuperación de un hueco real de USGS, etc.) **no pertenecen a F7**: están asignadas a F8 o siguen como reservas documentadas.

## Aclaraciones

### Sesión 2026-11-09

- Q: ¿Se implementa ya alguna mejora? → A: **no**. Solo se reorganiza la planificación. Las dos candidatas iniciales (C-01, C-02 en `backlog.md`) están **sin aprobar**.
- Q: ¿Cómo se numeran los trabajos? → A: `F7.n` se asigna **cuando la persona estudiante decide empezar un trabajo concreto**, que puede agrupar varias candidatas relacionadas y tener un alcance amplio. No existe una secuencia `7.1…7.7` predefinida. Mientras no se decide empezar, las ideas son `C-nn` (candidata) o `I-nn` (idea).
- Q: ¿Una mejora puede cambiar la arquitectura obligatoria o el contrato del profesor? → A: **no**. Cinco servicios, tecnologías cerradas y contrato de la API prevalecen (constitución I y II). Una mejora que parezca necesitar un cambio así se detiene y se consulta.
- Q: ¿Se publica en Netlify o se abre ngrok durante F7? → A: **no** por defecto: Netlify sigue con la versión de F6, sin despliegues automáticos ni publicación de las mejoras; ngrok y cualquier despliegue público solo con autorización expresa por separado.
- Q: ¿Cuál es el foco inicial de F7? → A (2026-11-09): **rediseño visual completo del dashboard** con estilo oscuro, moderno y tecnológico, manteniendo la funcionalidad actual y mejorando jerarquía y claridad, y **estudio** de un segundo modo de mapa (globo 3D). Auditoría, visión y hoja de ruta en [`propuesta-rediseno-dashboard.md`](propuesta-rediseno-dashboard.md); sigue sin implementarse nada ni aprobarse ninguna candidata.
- Q: ¿Las notas de clase del profesor son requisitos? → A: **no necesariamente**. Notas de clase del 2026-11-09 recogidas por la persona estudiante: **orientaciones comentadas por el profesor, no requisitos obligatorios** ni parte de los materiales oficiales. Se anotan como candidatas o ideas en el backlog, sin aprobar.

## Ciclo de un trabajo F7.n (SDD ligero: más experimentar, menos papel)

1. **Idea o candidata** en `backlog.md` (una línea basta; se puede añadir, cambiar, posponer o descartar cuando se quiera). Sin código.
2. **Decisión de empezar** (la persona estudiante) → se asigna `F7.n` y se acota **qué agrupa** y qué queda fuera.
3. **Encargo breve** (media página, `plantilla-mejora.md`): objetivo, alcance, qué NO se toca, criterios de aceptación observables y qué pruebas se ejecutan. Solo se profundiza (riesgos, alternativas) cuando el cambio toca seguridad, arquitectura o datos.
4. **Implementación iterativa en `localhost:4200`**: se prueba y se ve el resultado; el encargo se ajusta sobre la marcha (se anotan los cambios de alcance en una línea). Pruebas nuevas antes cuando haya lógica; para cambios visuales basta la comprobación visual y `node --test`/build.
5. **Verificación proporcional** y, si procede, evidencia breve en `docs/evidencias/f7/` (capturas «antes/después» valen: sirven también a F8).
6. **Revisión humana** y **commit manual** `[F7.n]` (la persona estudiante; Claude no hace commit ni push).

Un trabajo **no** se da por cerrado sin evidencia real; lo no verificado consta como reserva. No se exige documentación más allá de lo anterior.

## Política de trabajo durante F7 (decidida por la persona estudiante, 2026-11-09)

1. Las mejoras se **desarrollan y prueban en `localhost:4200`**.
2. Los **commits y push son manuales** (la persona estudiante), al repositorio privado de GitHub.
3. **Netlify se mantiene con la versión publicada en F6**: no se conectan despliegues automáticos ni se publican las mejoras de F7. Publicar requiere autorización expresa por separado.
4. **No se abre ngrok ni se hacen despliegues públicos** sin autorización expresa.
5. **Sin secretos** en Git ni en los bundles de Angular.
6. **No se instalan skills, agentes, MCP ni dependencias** (incluida la exploración con `npx skills find`) sin aprobación expresa; antes de instalar una skill se revisa su procedencia y contenido (ver C-04 en el backlog).

Consecuencia: durante F7 el sitio público y la aplicación local pueden **diferir**. F8 debe congelar la versión que se entrega y decidir entonces, con autorización expresa, si se publica (ver F8, paso 8.7).

## Alcance

**Dentro** (siempre mediante una mejora aprobada): mejoras visuales y rediseño de Angular; UX y accesibilidad; filtros, navegación, mapas, estadísticas y gráficas; optimización y ajustes técnicos pequeños; funcionalidades nuevas propuestas y aprobadas; comodidad del entorno de desarrollo local.

**Fuera de alcance** (salvo autorización expresa para una mejora concreta): Spark, Flink, Kubernetes, aprendizaje automático, servicios nuevos permanentes, cambios del contrato de la API del profesor, mezclar datos de `live`, `historico`, `sintetico` y `replay`, debilitar la protección de FastAPI/Netlify, operaciones destructivas sobre datos, contenedores o volúmenes, y la memoria/entrega/vídeo (F8).

## Requisitos del marco

- **FR-001**: Todo trabajo MUST empezar por decisión expresa de la persona estudiante y tener un encargo breve con alcance y criterios de aceptación observables (no se exige una especificación extensa salvo que toque seguridad, arquitectura o datos).
- **FR-002**: Toda mejora MUST declarar su **riesgo de regresión** y qué pruebas ejecuta (nuevas + regresión proporcional: backend con `scripts/f6/ejecutar.sh`, frontend con `node --test` y `npm run build`, aislamiento con `scripts/f6/aislamiento_final.sh`, según lo que toque).
- **FR-003**: Ninguna mejora MUST modificar los documentos originales del profesor, `specs/001`–`005` ni las evidencias de F3–F6 (se citan, no se reescriben; correcciones posteriores se documentan en `docs/evidencias/f7/`).
- **FR-004**: Las mejoras MUST respetar la seguridad vigente: clave de acceso de la API, CORS con orígenes exactos, `API_DOCS=false` publicado, sin secretos en Git y Kafka/PostgreSQL sin puertos publicados.
- **FR-005**: Los cambios que afecten a la interfaz publicada MUST distinguir «verificado en local» de «publicado»; publicar exige autorización expresa.
- **FR-006**: El estado de cada mejora (candidata, aprobada, en curso, verificada, con reservas, descartada) MUST constar en `backlog.md`; las descartadas se conservan con su motivo.
- **FR-008**: La política de trabajo de F7 (arriba) MUST cumplirse en todas las mejoras: desarrollo local, sin publicar, sin ngrok ni despliegues sin autorización expresa, sin secretos en Git ni en bundles.
- **FR-009**: Ningún agente, skill, servidor MCP ni dependencia MUST instalarse o crearse sin aprobación expresa; las skills de terceros se revisan (procedencia y contenido) antes de instalarse.
- **FR-007**: La documentación de F7 MUST poder consumirla F8 (qué cambió, qué evidencia hay y qué quedó pendiente) sin reconstruirla.

## Criterios de éxito del marco

- **SC-001**: Cada mejora implementada tiene mini-especificación aprobada, pruebas y evidencia en `docs/evidencias/f7/`; 0 mejoras implementadas sin aprobación.
- **SC-002**: Tras cada mejora, las suites proporcionales pasan y `git status` solo muestra los archivos previstos.
- **SC-003**: Cuando F7 se dé por terminada (sin fecha fijada), F8 puede reutilizar el estado real de la aplicación sin contradecir la documentación (README, capturas, evidencias).

## Supuestos

- La persona estudiante usa y estudia el proyecto durante F7 y propone las mejoras; Claude puede **sugerirlas** pero no implementarlas sin aprobación.
- F7 no tiene número previsto de pasos ni **paso de cierre definido**: se decidirá más adelante, cuando la persona estudiante quiera. F8 (documentación y vídeo) necesitará una versión estable de la aplicación; la fecha límite de entrega (F8, aclaración CA-02, pendiente) será lo que condicione cuándo.
- Las observaciones heredadas de F6 que son de interfaz (p. ej. `6.9-revision-humana.md`, punto f) se registran como candidatas, no como tareas.
