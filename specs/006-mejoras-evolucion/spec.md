# Especificación del marco: Mejoras y evolución del Observatorio Sísmico (F7)

**Rama de la funcionalidad**: `006-mejoras-evolucion` (el proyecto trabaja en `main`; no se crea rama)

**Creada**: 2026-11-09

**Estado**: Marco aprobado en su planificación el 2026-11-09 por la persona estudiante. **Ninguna mejora está aprobada para implementarse**: cada una pasa por su propia aprobación (ver «Ciclo de una mejora»).

**Entrada**: «Dedicar la F7 a mejorar progresivamente la aplicación ya construida: visual y rediseño del frontend Angular, experiencia de usuario y accesibilidad, filtros, navegación, mapas, estadísticas y gráficas, optimización y pequeños ajustes técnicos, nuevas funcionalidades propuestas y aprobadas por la persona estudiante y comodidad del entorno de desarrollo local. Fase flexible: las mejoras se descubren mientras se usa y estudia el proyecto.»

**Qué es esta especificación**: un **marco** (no una funcionalidad concreta). Define alcance, reglas, ciclo de trabajo y criterios comunes. Cada mejora aprobada tendrá su propia mini-especificación en `mejoras/F7.n-<nombre>/` (plantilla en `plantilla-mejora.md`), de modo que la fase se puede ampliar **sin reescribir esta planificación**.

**Relación con las fases anteriores**: F0–F6 son historial completado y **no se reabren** (F6 cerrada técnicamente, commit `fd9e1a7`). Lo que F6 y las fases anteriores llamaban «F7 — memoria y defensa» pasa a ser la **F8** (`specs/007-documentacion-entrega-video/`); ver `specs/INDICE.md`. Las reservas de F6 (SC-010 de F3, T063, recuperación de un hueco real de USGS, etc.) **no pertenecen a F7**: están asignadas a F8 o siguen como reservas documentadas.

## Aclaraciones

### Sesión 2026-11-09

- Q: ¿Se implementa ya alguna mejora? → A: **no**. Solo se reorganiza la planificación. Las dos candidatas iniciales (C-01, C-02 en `backlog.md`) están **sin aprobar**.
- Q: ¿Cómo se numeran las mejoras? → A: como pasos `7.1`, `7.2`… **en el momento de aprobarlas**, no antes. Mientras no estén aprobadas se llaman `C-nn` (candidata).
- Q: ¿Una mejora puede cambiar la arquitectura obligatoria o el contrato del profesor? → A: **no**. Cinco servicios, tecnologías cerradas y contrato de la API prevalecen (constitución I y II). Una mejora que parezca necesitar un cambio así se detiene y se consulta.
- Q: ¿Se publica en Netlify o se abre ngrok durante F7? → A: **no** por defecto: Netlify sigue con la versión de F6, sin despliegues automáticos ni publicación de las mejoras; ngrok y cualquier despliegue público solo con autorización expresa por separado.
- Q: ¿Las notas de clase del profesor son requisitos? → A: **no necesariamente**. Notas de clase del 2026-11-09 recogidas por la persona estudiante: **orientaciones comentadas por el profesor, no requisitos obligatorios** ni parte de los materiales oficiales. Se anotan como candidatas o ideas en el backlog, sin aprobar.

## Ciclo de una mejora (SDD proporcional)

1. **Propuesta** → entra en `backlog.md` como `C-nn` con motivo, valor y riesgos. Sin código.
2. **Aprobación** de la persona estudiante (explícita, por mejora) → recibe número `7.n`.
3. **Mini-especificación** (`plantilla-mejora.md`): problema, alcance y fuera de alcance, requisitos (FR), criterios de aceptación medibles (SC), riesgos de seguridad/arquitectura, y **pruebas proporcionales** (qué batería y por qué).
4. **Plan y tareas** breves (`plan.md` y `tasks.md` de la mejora); las pruebas nuevas se escriben antes y deben fallar.
5. **Implementación** en un paso pequeño, con presentación previa del plan si el cambio es importante (CLAUDE.md, regla 10).
6. **Verificación**: pruebas nuevas + regresión proporcional + comprobación visual/manual si es de interfaz; evidencias en `docs/evidencias/f7/`.
7. **Revisión humana** y **commit manual** `[F7.n]` (la persona estudiante lo hace; Claude no hace commit ni push).

Una mejora **no** se da por cerrada sin evidencia real; lo no verificado consta como reserva.

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

- **FR-001**: Toda mejora MUST tener aprobación explícita antes de implementarse y su propia mini-especificación con alcance, FR y SC.
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
- **SC-003**: Al cerrar F7, F8 puede reutilizar el estado real de la aplicación sin contradecir la documentación (README, capturas, evidencias).

## Supuestos

- La persona estudiante usa y estudia el proyecto durante F7 y propone las mejoras; Claude puede **sugerirlas** pero no implementarlas sin aprobación.
- F7 no tiene un número fijo de pasos ni una fecha de cierre propia: se cierra cuando la persona estudiante lo decide, de modo que F8 (documentación y vídeo) pueda empezar con una aplicación estable. **Requiere confirmar la fecha límite de entrega** (ver F8, aclaración CA-02) para fijar cuándo congelar F7.
- Las observaciones heredadas de F6 que son de interfaz (p. ej. `6.9-revision-humana.md`, punto f) se registran como candidatas, no como tareas.
