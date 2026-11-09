# Backlog de mejoras de F7

Estado: ⬜ candidata (sin aprobar) · ✅ aprobada (recibe `7.n`) · 🔄 en curso · ☑ verificada · ◐ con reservas · ✖ descartada.
**Nada de este archivo autoriza implementar, instalar ni crear agentes, skills, MCP o dependencias.** Notas de clase del 2026-11-09 recogidas por la persona estudiante: **orientaciones comentadas por el profesor, no requisitos obligatorios** ni parte de los materiales oficiales.

Solo la persona estudiante aprueba, mejora a mejora. Se amplía sin reescribir lo anterior.

| Id | Título | Origen | Estado | Paso |
|---|---|---|---|---|
| C-01 | Entrar en `localhost:4200` sin escribir la clave de la API cada vez, sin debilitar FastAPI ni Netlify | Petición de la persona estudiante (2026-11-09) | ⬜ candidata | — |
| C-02 | Mostrar de forma más perceptible cuándo el dashboard se ha actualizado correctamente | Observación f de la revisión humana (`docs/evidencias/f6/6.9-revision-humana.md`) | ⬜ candidata | — |
| C-03 | Crear un subagente **Frontend Engineer** (Angular, TypeScript, diseño, accesibilidad y responsive) | Notas de clase 2026-11-09 | ⬜ candidata, sin aprobar | — |
| C-04 | Explorar skills con `npx skills find`, revisar procedencia y contenido **antes** de instalar y estudiar su aplicación práctica al frontend | Notas de clase 2026-11-09 | ⬜ exploración candidata, sin aprobar (no se instala nada) | — |
| I-01 | *(futura)* Subagente **Data Engineer**, solo si aporta valor concreto | Notas de clase 2026-11-09 | 💡 posibilidad futura | — |
| I-02 | *(futura)* Herramientas **MCP**, solo si aportan valor concreto | Notas de clase 2026-11-09 | 💡 posibilidad futura | — |
| I-03 | *(idea opcional)* Investigar **APIs sísmicas regionales** como fuente adicional o de contraste | Notas de clase 2026-11-09 | 💡 idea opcional | — |
| I-04 | *(idea opcional)* Valorar **Streamlit** solo si tuviera una utilidad distinta a la del dashboard Angular | Notas de clase 2026-11-09 | 💡 idea opcional | — |

## Notas de cada candidata (para la futura mini-especificación; no son decisiones)

### C-01 · Acceso local cómodo sin tocar la seguridad
- **Contexto vigente**: la API exige la cabecera `X-Observatorio-Clave` (≥ 32 caracteres, `hmac.compare_digest`, 401 antes de validar); el panel la pide y **solo la guarda en memoria**: no hay `localStorage`, `sessionStorage`, cookies ni IndexedDB (decisión FR-041 de F6, comprobada por pruebas). La clave nunca va en la URL, en `config.json` ni en el build público.
- **Qué deberá resolver la mini-especificación**: opciones para que **solo el desarrollo local** (`localhost:4200`) evite teclearla, **sin** que el build público (Netlify) ni la API publicada pierdan protección. Debe evaluar y comparar opciones con sus riesgos (por ejemplo, dónde vive la clave en local, cómo se garantiza que no entra en el bundle publicado, qué pasa si un archivo local se filtra) antes de elegir. **No se prejuzga ninguna.**
- **Restricciones**: FR-004 del marco (seguridad vigente); sin secretos en Git; las pruebas de F6 (`acceso.test.ts`, `verificar_acceso_api.py`, `mutaciones_clave.py`) MUST seguir pasando o actualizarse con justificación explícita.
- **Riesgo**: alto (seguridad). Pruebas proporcionales: nuevas de acceso + las de F6 relacionadas + escaneo de secretos + comprobación de que el build público no contiene la clave.

### C-02 · Señal perceptible de actualización
- **Contexto vigente**: el panel ya muestra «Datos al día», la hora de la última lectura y de la última ingesta, y un aviso al recuperar la conexión; la persona estudiante señaló que **la actualización se percibe poco** salvo fijándose en los segundos.
- **Qué deberá resolver**: una indicación visible y accesible de «actualizado correctamente» (y de «actualizando…» / error), sin ruido continuo y sin información solo por color o animación.
- **Restricciones**: accesibilidad (WCAG; `prefers-reduced-motion`; lectores de pantalla con `aria-live` sin saturar), no cambiar el diseño original del profesor sin justificarlo, no aumentar la frecuencia de consultas (cuota de ngrok).
- **Riesgo**: bajo-medio. Pruebas proporcionales: lógica pura (`node --test`), build, comprobación visual y de accesibilidad en el navegador.

### C-03 · Subagente Frontend Engineer
- **Qué**: un agente de proyecto en `.claude/agents/` especializado en Angular, TypeScript, diseño, accesibilidad y responsive (ya figura como previsto, sin crear, en `docs/HOJA-DE-RUTA.md` §6).
- **Qué deberá resolver la mini-especificación**: responsabilidades y límites (qué puede leer/ejecutar, qué NO puede tocar: FastAPI, Kafka, PostgreSQL, Compose, documentos del profesor, secretos), herramientas que se le conceden, criterios de uso (no invocarlo por rutina, control de consumo) y cómo se verifica que aporta valor (p. ej. una mejora concreta de C-02).
- **Restricción**: el agente es una decisión propia del proyecto; no puede prevalecer sobre el enunciado (constitución I). No se crea hasta la aprobación.

### C-04 · Exploración de skills (`npx skills find`)
- **Qué**: explorar el catálogo con `npx skills find` para localizar skills útiles al frontend (Angular, accesibilidad, diseño) y estudiar su aplicación práctica.
- **Reglas previas a cualquier instalación**: revisar **procedencia** (autoría, repositorio, mantenimiento), **contenido completo** (instrucciones, scripts y comandos que ejecuta o pide ejecutar), **permisos** y riesgos (acceso a archivos, red, secretos); preferir leer sin instalar; instalar solo con aprobación expresa y de una en una, en el proyecto (no globales) y con versión conocida.
- **Esta planificación NO instala ni ejecuta nada**: ni `npx skills find` ni skills, agentes, MCP o dependencias. La exploración es una candidata que se aprueba aparte. Resultado esperado de una futura exploración: una lista razonada (qué se descarta y por qué) en `docs/evidencias/f7/`.

### Ideas futuras u opcionales (I-01 a I-04)
Se anotan para no perderlas, **sin plan ni compromiso**. Data Engineer y MCP solo si se identifica un valor concreto que hoy no cubre el equipo de trabajo. La investigación de APIs sísmicas regionales y Streamlit son opcionales: cualquier fuente nueva respetaría la constitución (III, datos honestos y fuentes aisladas; el panel sigue consultando solo nuestra API) y Streamlit se valoraría únicamente si ofreciera una utilidad distinta a la del dashboard Angular (no se sustituye ni se duplica la arquitectura obligatoria sin autorización expresa; constitución II).

## Reservas heredadas de F6 (informativo; NO son tareas de F7)
Siguen documentadas en `docs/evidencias/f6/resultados.md` §5: SC-010 de F3 (>24 h) → **F8**; T063 (no autorizada); recuperación de un hueco real de USGS; lector de pantalla real solo Narrador+Edge; Firefox/Safari; mediciones de una sola máquina; memoria de Kafka creciente en 60 min.
