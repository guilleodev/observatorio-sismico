# Índice de especificaciones y fases

Mapa entre **fases** (`docs/HOJA-DE-RUTA.md`) y **carpetas SDD** (`specs/`). Se mantiene para conservar la trazabilidad histórica tras la reorganización del 2026-11-09.

| Fase | Carpeta | Estado |
|---|---|---|
| F2 (MVP) | `001-mvp-evento-sintetico/` | Histórica (solo lectura) |
| F3 | `002-ingesta-real-calidad/` | Cerrada; SC-010 de F3 (>24 h) pendiente → ahora en **F8** |
| F4 | `003-geografia-historico/` | Cerrada |
| F5 | `004-api-dashboard/` | Cerrada |
| F6 | `005-replay-despliegue-final/` | Cerrada técnicamente (commit `fd9e1a7`); F6.10 (SC-010 de F3) pendiente → **F8** |
| **F7 — Mejoras y evolución** | `006-mejoras-evolucion/` | Marco creado 2026-11-09; **ninguna mejora aprobada** |
| **F8 — Documentación, entrega y vídeo** | `007-documentacion-entrega-video/` | Planificación inicial; sin ejecutar |

## Nota sobre `.specify/feature.json`
Es el **puntero local de Spec Kit** a la funcionalidad activa (`feature_directory`); los scripts de `.specify/scripts/` lo leen para saber con qué carpeta de `specs/` trabajan. Está **ignorado a propósito** por `.specify/.gitignore` (línea `feature.json`): es estado de cada copia de trabajo, no se versiona ni forma parte de la entrega. Apunta ahora a `specs/006-mejoras-evolucion` (F7); no condiciona el contenido del repositorio.

## Renumeración del 2026-11-09 (léase antes de interpretar un «F7» antiguo)

Hasta el 2026-11-09 la planificación llamaba **F7** a «Memoria y defensa». Tras la reorganización:

- **«F7 — Memoria y defensa» (antigua) = F8 (actual).**
- La nueva **F7** es la fase evolutiva de mejoras (no existía antes).

Los documentos históricos **no se reescriben**: cualquier «F7» en `specs/001`–`005` (p. ej. «Fuera de alcance: la memoria final y la demostración (F7)»), en `docs/evidencias/f3`–`f6` (p. ej. «Pendientes de F7» en `docs/evidencias/f6/resultados.md`, `lista-final.md` y `procedimiento-defensa.md`) y en `docs/FASE-1-FUENTES-Y-FRONTEND.md` debe leerse como **F8**.
