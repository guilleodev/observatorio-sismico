# Tareas: Documentación, entrega académica y vídeo (F8)

**Entrada**: [spec.md](spec.md), [plan.md](plan.md). Fase **F8** de `docs/HOJA-DE-RUTA.md`. Commit previsto: `[F8]` (manual).
**Estado (2026-11-11)**: planificación **definitiva en 5 pasos, aprobada**. **Nada de F8 ejecutado**; 8.1 requiere una autorización explícita nueva. Se conservan los identificadores **T001–T026** de la planificación del 2026-11-09 (solo cambia el paso al que pertenecen; T014b y T020b se mantienen), se añaden **T027–T031** (obligaciones antes implícitas) y **T032–T039** (diferencia F7/F6 y publicación segura, ventana de evaluación, credenciales y disponibilidad). Ninguna tarea se renumera. Convención: igual que `specs/005-…/tasks.md`; `[PA-n]` = punto de autorización; `(FR/SC)` = requisito o criterio que cubre. **No se avanza de un paso al siguiente sin aprobación expresa.**

## Correspondencia antiguos pasos (10) → nuevos pasos (5)

| Antiguo paso (2026-11-09) | Tareas | Nuevo paso |
|---|---|---|
| Preparación | T001, T002 | **8.1** (T002 se cumple con la aprobación de esta planificación) |
| 8.1 Requisitos y fuentes | T003, T004, T005 | **8.1** |
| 8.2 Matriz de trazabilidad | T006, T007 | **8.1** (la columna «minuto de vídeo» se completa en 8.4, T019) |
| 8.3 Memoria o notebook | T008–T013 | **8.2** |
| 8.4 README final | T014, T014b | **8.2** |
| 8.4 README: verificación en entorno limpio | T015 | **8.3** (necesita Docker y PA-11) |
| 8.7 Toma de capturas y congelación | T020b, T022 | **8.2** (la versión ya está congelada en `9008772`) |
| 8.5 SC-010 de F3 | T016, T017 | **8.3** (PA-10) |
| 8.6 Guion y recorrido | T018, T019 | **8.4** |
| 8.7 Entorno de grabación | T020, T021 | **8.4** |
| 8.8 Grabación y revisión | T023 | **8.4** (graba la persona estudiante) |
| 8.9 Revisión final | T024 | **8.5** |
| 8.10 Acceso y entrega | T025, T026 | **8.5** |
| *(nuevas, 2026-11-11)* | T027 y T032 (8.1); T028 y T029 (8.2); T030, T031 y T033–T038 (8.3); T039 (8.5) | según su paso |

## 8.1 — Auditoría de requisitos y rúbrica (US1, US2)
- [x] T001 Crear `specs/007-documentacion-entrega-video/` (`spec.md`, `plan.md`, `tasks.md`) y `specs/INDICE.md`; reflejar F8 en la hoja de ruta (2026-11-09)
- [ ] T002 Revisión humana de la planificación de F8 (5 pasos) y confirmación de las aclaraciones pendientes (CA-01…CA-08)
- [ ] T003 Archivar con fecha lo comunicado por el profesor en clase (evaluación por **vídeo + web publicada + repositorio**; sin defensa ni preguntas; ventana de ~2 días con los ordenadores encendidos), y una **fuente escrita si existe** (CA-01); fechas, canal y condiciones del vídeo (CA-02, CA-03, CA-04) quedan **pendientes de confirmar**; todo en `docs/entrega/requisitos-fuente.md` (FR-001, FR-002)
- [ ] T004 Revisión literal de rúbrica y guía: tabla requisito ↔ archivo y apartado (ENUNCIADO §9–§13, Guía 1–3 y lista final, FAQ H, CONTRATO-API) en `docs/entrega/requisitos-fuente.md`; marcar lo no cubierto como aclaración y cómo se **adapta** al vídeo lo que menciona la defensa (FR-001, FR-015, SC-001)
- [ ] T005 Registrar el estado de CA-01…CA-08: **CA-07 resuelta** (`docs/entrega/memoria.md`), **CA-08 resuelta en lo práctico** (explicación en el vídeo), CA-06 parcial y CA-02/03/04/05 pendientes; ninguna bloquea el avance (FR-002)
- [ ] T006 Esqueleto de `docs/entrega/matriz-trazabilidad.md`: cinco criterios de la rúbrica + 13 puntos de la lista final + pruebas de aceptación (§11) con columnas requisito → implementación → evidencia → memoria → README → bloque/minuto de vídeo → estado (FR-003)
- [ ] T007 Rellenar implementación y evidencia reutilizando `docs/evidencias/f3`–`f6`, `lista-final.md` y la documentación de F7 (sin reescribirlas) (FR-003, FR-005, SC-002)
- [ ] T032 *(nueva)* Registrar como **asuntos pendientes de F8** en `requisitos-fuente.md` y en la matriz: (a) la **diferencia F7 local ↔ F6 publicada en Netlify**, (b) la **ventana de evaluación de ~2 días** (fechas pendientes, CA-06/CA-02), (c) la **entrega privada de credenciales** y (d) los accesos del profesor a la web y al repositorio como filas de verificación propias (FR-021, FR-022, FR-025)
- [ ] T027 *(nueva)* Contrastar cada requisito con la **implementación real** (versión F7 congelada, `9008772`) y listar las evidencias **disponibles** y las **pendientes** (en la matriz), incluida la lista de lo que 8.3 debe completar (FR-003, FR-005)

## 8.2 — Memoria técnica y README definitivo (US3)
- [ ] T022 Confirmar la **versión congelada** (F7 cerrada, commit `9008772`, árbol limpio) como la que reflejan README, capturas, memoria y vídeo; cualquier cambio posterior reabre este paso (SC-005)
- [ ] T008 Estructura de `docs/entrega/memoria.md` (CA-07 resuelta) según Guía 2.1–2.9; puede enlazar notebooks, SQL y evidencias existentes; enlazar evidencias en lugar de duplicarlas (FR-004)
- [ ] T009 Arquitectura y diagramas del flujo completo (productor → Kafka → consumidor → PostgreSQL → API → panel) y de despliegue (Compose, ngrok, Netlify) (FR-006)
- [ ] T010 Modelo conceptual/lógico/físico con SQL e índices justificados (fuentes: `sql/001`–`004`, `specs/*/data-model.md`, `f5/5.7-explain.txt`) y diccionario de datos con unidades, procedencia y registro de consultas (FR-006)
- [ ] T011 Calidad (resultados antes/después, decisiones), pruebas y resultados, conclusiones con filtros y capturas (reutiliza `f3/3.5-*`, `f4/4.6-calidad.txt`, `f5/conclusiones.md`, `f6/resultados.md`) y recuperación de huecos y reproducción histórica (FR-006)
- [ ] T012 Complejidad, mediciones con tres tamaños, costes y mejoras (reutiliza `f6/6.4`, `6.5`, `complejidad-costes.md`); la persona estudiante aporta los datos `[PENDIENTE]` de costes (FR-006)
- [ ] T013 Revisión humana de la memoria y de lo que no se pueda afirmar; reservas honestas (SC-003)
- [ ] T028 *(nueva)* **Tabla de cobertura exacta** de la memoria contra `ENUNCIADO.md` §12 y Guía 2.1–2.9 (cada exigencia → sección de la memoria → evidencia), con las carencias a la vista (FR-017)
- [ ] T014 README definitivo (objetivos, funcionalidades, tecnologías; arquitectura y flujo; estructura del repositorio; instalación, configuración y ejecución segura; Docker, USGS, Kafka, PostgreSQL y API; frontend Mission Control: Panel · Análisis · Eventos, globo 3D y 2D, EN VIVO y REPRODUCCIÓN; calidad, huecos y modelo; análisis, filtros, estadísticas y comparación; pruebas, resultados, capturas y evidencias; limitaciones) **sin sustituir a la memoria** ni duplicar su contenido (FR-004, FR-016)
- [ ] T014b Plan de evidencias visuales: lista de capturas del frontend final (Panel, Análisis, Eventos, globo 3D y 2D, EN VIVO, REPRODUCCIÓN, filtros, estados, móvil), fragmentos de código relevantes y resultados de pruebas, en `docs/evidencias/f8/capturas/`, enlazadas desde matriz, memoria y README; sin claves ni datos sensibles (FR-013)
- [ ] T020b Toma de las capturas reales del plan T014b sobre la versión congelada (local; Netlify no se actualiza sin autorización) (FR-013)
- [ ] T029 *(nueva)* Sección **«Cumplimiento de la rúbrica»** del README (criterio → implementación → evidencia → memoria → bloque del vídeo) integrada con la matriz, y comprobación **estática** de enlaces internos, comandos e instrucciones (FR-016, SC-002)

## 8.3 — Evidencias y validación técnica final (US3, US4)
- [ ] T030 *(nueva)* Validación técnica final reutilizando lo existente: pruebas automatizadas del backend y del frontend (476 en frontend al cierre de F7) y criterios de aceptación; estado de Docker, Kafka, PostgreSQL, API y dashboard; EN VIVO y REPRODUCCIÓN; consolidar evidencias de calidad, índices, mediciones y costes y la recuperación real del hueco #475 (`f4/recuperacion-hueco-475.md`); completar las evidencias pendientes de la matriz en `docs/evidencias/f8/`. **No se repiten pruebas costosas sin justificación y autorización** (SC-002, SC-005)
- [ ] T015 Verificar el README definitivo en un proyecto Compose paralelo e independiente con los pasos tal cual (como `6.9-entorno-limpio.txt`); los volúmenes temporales solo se eliminan con **[PA-11]** por nombre exacto (SC-003)
- [ ] T016 [PA-10 **aún no concedida**] **Preparar** (como prueba **independiente** de la ventana de evaluación: FR-024) y, solo con autorización expresa, ejecutar las consultas de solo lectura de T075–T077 (`specs/005-…`): eventos con `event_time` anterior a 24 h desde la activación (2026-11-06 16:54 UTC) y reconciliación vacía; guardar `docs/evidencias/f3/sc-010-observacion-24h.txt` anotando interrupciones (incluido el reinicio del 2026-11-08 y la parada de ~19,6 h del PC con el hueco #475) (FR-007, SC-004)
- [ ] T017 Anexar el resultado real a `docs/evidencias/f3/resultados.md` (solo la línea de SC-010), a la memoria y a la matriz; si no se respalda, constará como **no cumplido** (FR-007)
- [ ] T031 *(nueva)* Revisión de secretos y seguridad (`scripts/f6/escaneo_secretos.sh`, `.env`/`.env.example`, **historial de Git**, proxy local, capturas y logs que irán al README, al vídeo y a la web) sin modificar configuraciones de seguridad (FR-009, FR-012)
- [ ] T033 *(nueva)* **Revisión del acceso autónomo del profesor a la web publicada**: qué ve y qué puede hacer hoy con la versión publicada (F6) y con la API real, e **identificar toda diferencia funcional** respecto al entorno local F7; solo lectura, sin abrir ngrok ni tocar Netlify (FR-021, SC-007)
- [ ] T034 *(nueva)* **Definir la estrategia segura de publicación de F7** en `docs/evidencias/f8/estrategia-publicacion-f7.md` (build, `config.json` público, CORS, clave solo en memoria del navegador, URL del túnel, orden de arranque, vuelta atrás a F6, riesgos) y **someterla a tu aprobación por escrito**; sin ejecutar nada (FR-021)
- [ ] T035 *(nueva)* **[autorización expresa Netlify y, si procede, ngrok; requiere T034 aprobada]** Ejecutar la publicación de F7 según la estrategia aprobada, con vía de vuelta al despliegue F6; sin exponer el proxy local de desarrollo ni debilitar controles (FR-021)
- [ ] T036 *(nueva)* Verificar la web publicada con F7 **desde otro dispositivo** y con la API real a través del túnel: carga, las tres vistas, globo 3D y 2D, filtros, EN VIVO y REPRODUCCIÓN, pantalla de clave, estados de error al cerrar el túnel y recuperación al reabrirlo, sin depender del PC más allá de la API y el túnel (FR-021, SC-007)
- [ ] T037 *(nueva)* Comprobación de **funcionamiento continuado**, conectividad externa, recuperación ante fallos y **ausencia de suspensión automática del PC** (solo se comprueba y documenta; cambiar ajustes de Windows o reiniciar servicios solo con tu autorización); **independiente de SC-010**, que no se da por superada por mantener el PC encendido (FR-023, FR-024)
- [ ] T038 *(nueva)* Definir el **procedimiento de entrega privada de credenciales** al profesor (canal elegido por ti, rotación o revocación posterior, qué se documenta y qué nunca): solo el procedimiento queda en el repositorio, jamás la clave (FR-022)

## 8.4 — Guion, preparación y grabación del vídeo (US5, US6; graba la persona estudiante)
- [ ] T018 `docs/entrega/guion-video.md`: **bloques siguiendo la rúbrica** (extracción, calidad, modelado, análisis, reflexión) más arquitectura, Kafka, PostgreSQL, API, Panel · Análisis · Eventos, EN VIVO y REPRODUCCIÓN, pruebas, recuperación de huecos y reproducibilidad, y la explicación del flujo y de una decisión técnica (CA-08); **cada escena con «Qué decir» y «Qué mostrar»**; modular y sin asumir duración ni formato (CA-03 pendiente) (FR-008, FR-009, FR-014, FR-018)
- [ ] T019 Completar la columna «minuto de vídeo» de la matriz con el guion (FR-003)
- [ ] T020 `docs/entrega/checklist-grabacion.md`: configuración de OBS (escenas, fuentes, audio, resolución propuesta), Docker sano, cinco servicios `healthy`, datos y panel en estado conocido, orden de pruebas y escenas técnicas, sin claves/`.env`/URLs de ngrok/notificaciones/rutas personales en pantalla (FR-009, FR-019)
- [ ] T021 Ensayo en seco completo del recorrido sin abrir nada no autorizado; ngrok o Netlify **solo con autorización expresa** en cada ocasión (SC-005)
- [ ] T023 **Grabación por la persona estudiante con OBS**; revisión del vídeo contra la matriz y los criterios de la rúbrica (y CA-03 cuando se conozca); se rehace lo que falte (SC-006). Claude no genera, edita ni graba el vídeo

## 8.5 — Auditoría final y entrega (US6, US7)
- [ ] T024 Auditoría final: todos los requisitos originales, matriz cerrada (ningún criterio sin justificar), memoria, README, evidencias y vídeo; comprobación de enlaces, instalación, ejecución y ausencia de secretos; `git status`, `git diff --check`, escaneo de secretos; Architect/QA acotados solo si la persona estudiante lo pide; resultado en `docs/evidencias/f8/auditoria-final.md` (FR-010, FR-012)
- [ ] T039 *(nueva)* **Checklist de activación previa a la ventana de evaluación** y de comprobación del acceso del profesor (`docs/entrega/checklist-ventana-evaluacion.md`, preparada desde 8.3): arranque ordenado de Docker y servicios, Kafka/PostgreSQL/productor/consumidor/API sanos, túnel y URL vigentes, panel publicado, datos y REPRODUCCIÓN visibles, PC sin suspensión, riesgos de reinicio y recuperación de huecos, credencial entregada por canal privado, y regla de no cambiar código ni servicios durante la ventana (FR-023, SC-008)
- [ ] T025 Revisar las condiciones vigentes de entrega (CA-02, CA-03), **comprobar los permisos de acceso al repositorio privado** (CA-05; sin modificarlos ni hacerlo público) y el acceso del profesor a la web (CA-06); dejar la entrega lista y el mensaje de commit `[F8]` preparado para que la persona estudiante haga **commit, push, entrega de credenciales y envío** manualmente (FR-011, SC-007)
- [ ] T026 Entrega por el canal y en la fecha indicados (CA-02) y registro de la confirmación, **por la persona estudiante** (SC-007)

**Reservas que F8 no reabre**: T063 (down/up) sigue no ejecutada por decisión de la persona estudiante; F6.10/T075–T077 se ejecutan aquí (T016–T017) y no se duplican. La recuperación de un hueco real de USGS **ya se observó** (#475, `docs/evidencias/f4/recuperacion-hueco-475.md`) y se reutiliza.
