# Tareas: Documentación, entrega académica y vídeo (F8)

**Entrada**: [spec.md](spec.md), [plan.md](plan.md). Fase **F8** de `docs/HOJA-DE-RUTA.md`. Commit previsto: `[F8]` (manual).
**Estado**: planificación inicial. **Nada ejecutado.** Las tareas se refinarán al cerrar 8.1 (cuando se conozcan los requisitos reales del vídeo). Convención: igual que `specs/005-…/tasks.md`; `[PA-n]` = punto de autorización; `(FR/SC)` = requisito o criterio que cubre.

## Preparación (reorganización, 2026-11-09)
- [x] T001 Crear `specs/007-documentacion-entrega-video/` (`spec.md`, `plan.md`, `tasks.md`) y `specs/INDICE.md`; reflejar F8 en la hoja de ruta
- [ ] T002 Revisión humana de la planificación de F8 y confirmación de las aclaraciones pendientes (CA-01…CA-07)

## 8.1 Requisitos y fuentes (US1)
- [ ] T003 Recopilar de la persona estudiante el texto literal del profesor sobre el vídeo, fechas y canal de entrega (CA-01, CA-02, CA-03, CA-06); archivarlo como cita con fecha en `docs/entrega/requisitos-fuente.md` (FR-001, FR-002)
- [ ] T004 Revisión literal de rúbrica y guía: tabla requisito ↔ archivo y apartado (ENUNCIADO §9–§13, Guía 1–3 y lista final, FAQ H, CONTRATO-API) en `docs/entrega/requisitos-fuente.md`; marcar lo no cubierto como aclaración (FR-001, SC-001)
- [ ] T005 Confirmar con el profesor (o con su texto) CA-04, CA-05 y CA-07: rúbrica del vídeo, usuario a invitar al repositorio, formato de la memoria (FR-002)

## 8.2 Matriz de trazabilidad (US2)
- [ ] T006 Esqueleto de `docs/entrega/matriz-trazabilidad.md`: cinco criterios de la rúbrica + 13 puntos de la lista final + pruebas de aceptación (§11) con columnas requisito → implementación → evidencia → minuto de vídeo → estado (FR-003)
- [ ] T007 Rellenar implementación y evidencia reutilizando `docs/evidencias/f3`–`f6` y `lista-final.md` (sin reescribirlas) (FR-003, FR-005, SC-002)

## 8.3 Memoria o notebook (US3)
- [ ] T008 Estructura de la memoria según Guía 2.1–2.9 y formato de CA-07; enlazar evidencias en lugar de duplicarlas (FR-004)
- [ ] T009 Arquitectura y diagramas del flujo completo (productor → Kafka → consumidor → PostgreSQL → API → panel) y de despliegue (Compose, ngrok, Netlify) (FR-006)
- [ ] T010 Modelo conceptual/lógico/físico con SQL e índices justificados (fuentes: `sql/001`–`004`, `specs/*/data-model.md`, `f5/5.7-explain.txt`) y diccionario de datos con unidades, procedencia y registro de consultas (FR-006)
- [ ] T011 Calidad (resultados antes/después, decisiones), pruebas y resultados, conclusiones con filtros y capturas (reutiliza `f3/3.5-*`, `f4/4.6-calidad.txt`, `f5/conclusiones.md`, `f6/resultados.md`) (FR-006)
- [ ] T012 Complejidad, mediciones con tres tamaños, costes y mejoras (reutiliza `f6/6.4`, `6.5`, `complejidad-costes.md`); la persona estudiante aporta los datos `[PENDIENTE]` de costes (FR-006)
- [ ] T013 Revisión humana de la memoria y de lo que no se pueda afirmar; reservas honestas (SC-003)

## 8.4 README final (US3)
- [ ] T014 README final profesional (presentación, requisitos, arranque, demostración, pruebas, estructura, evidencias, estado y reservas) **con capturas reales y enlaces internos a evidencias**, sobre el README actual; no sustituye a la memoria (FR-004, FR-014)
- [ ] T014b Plan de evidencias visuales: lista de capturas del frontend (Live, Replay, filtros, tabla, gráficas, estado, móvil), fragmentos de código relevantes, resultados de pruebas y demostraciones, con su ubicación en `docs/evidencias/f8/` y el enlace desde la matriz y la memoria; capturas reales, sin claves ni datos sensibles (FR-013)
- [ ] T015 Verificarlo en un proyecto Compose paralelo e independiente con los pasos tal cual (como `6.9-entorno-limpio.txt`); los volúmenes temporales solo se eliminan con **[PA-11]** por nombre exacto (SC-003)

## 8.5 SC-010 de F3 (US4)
- [ ] T016 [PA-10] Preparar y ejecutar con autorización expresa las consultas de solo lectura de T075–T077 (`specs/005-…`): eventos con `event_time` anterior a 24 h desde la activación (2026-11-06 16:54 UTC) y reconciliación vacía; guardar `docs/evidencias/f3/sc-010-observacion-24h.txt` anotando interrupciones (incluido el reinicio del 2026-11-08) (FR-007, SC-004)
- [ ] T017 Anexar el resultado real a `docs/evidencias/f3/resultados.md` (solo la línea de SC-010) y a la memoria; si no se respalda, constará como no cumplido (FR-007)

## 8.6 Guion y recorrido (US5)
- [ ] T018 `docs/entrega/guion-video.md`: recorrido **por criterios de la rúbrica (requisito → funcionalidad → evidencia → demostración)**, orden, duración y formato (CA-03, pendientes de confirmación formal), qué se enseña por criterio de la rúbrica (extracción, calidad, modelado, análisis, reflexión), Live y Replay, Kafka/PostgreSQL/FastAPI/Angular, pruebas de aceptación, reproducibilidad, privacidad (FR-008, FR-009)
- [ ] T019 Completar la columna «minuto de vídeo» de la matriz con el guion (FR-003)

## 8.7 Entorno de grabación (US5)
- [ ] T020 `docs/entrega/checklist-grabacion.md`: Docker sano, cinco servicios `healthy`, datos y panel en estado conocido, sin claves/`.env`/URLs sensibles en pantalla, terminal y ventanas preparadas (FR-009)
- [ ] T020b Toma de las capturas reales del plan T014b sobre la versión a entregar (local; Netlify no se actualiza sin autorización expresa) (FR-013)
- [ ] T021 Ensayo en seco completo del recorrido sin abrir nada no autorizado; ngrok o Netlify **solo con autorización expresa** en cada ocasión (SC-005)
- [ ] T022 Congelar la versión a entregar (fin de las mejoras de F7 que se incluyan) y confirmar que README, capturas y matriz la reflejan

## 8.8 Grabación y revisión (US6; persona estudiante)
- [ ] T023 Grabación por la persona estudiante; revisión contra matriz y requisitos de CA-03 (duración, formato, contenido); se rehace lo que falte (SC-006)

## 8.9 Revisión final (US6)
- [ ] T024 Revisión final de entregables: lista de 13 puntos, matriz, README, memoria, vídeo; `git status`, `git diff --check`, escaneo de secretos (`scripts/f6/escaneo_secretos.sh`); Architect/QA acotados solo si la persona estudiante lo pide (FR-010, FR-012)

## 8.10 Acceso y entrega (US7; persona estudiante)
- [ ] T025 Dar acceso del profesor al repositorio privado (CA-05) y comprobarlo; commit/push manuales de `[F8]` (FR-011, SC-007)
- [ ] T026 Entregar por el canal y en la fecha indicados (CA-02) y registrar la confirmación (SC-007)

**Reservas que F8 no reabre**: T063 (down/up) sigue no ejecutada por decisión de la persona estudiante; la recuperación de un hueco real de USGS sigue sin observar salvo que se produzca; F6.10/T075–T077 se ejecutan aquí (T016–T017) y no se duplican.
