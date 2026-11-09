# Plan de implementación: Documentación, entrega académica y vídeo (F8)

**Especificación**: [spec.md](spec.md) · **Fecha**: 2026-11-09 · Commits previstos: `[F8]` (y `[F8-WIP]` intermedios si hace falta, como en F6), siempre manuales.

## Resumen
Pasar de «sistema construido y verificado» a «entrega comprobable por el profesor»: fijar qué se exige (literal), reunir la memoria y el README, observar SC-010 de F3, trazar la rúbrica hasta el vídeo, preparar y verificar el entorno de grabación, y gestionar acceso y entrega. Reutiliza evidencias de F3–F6; no repite baterías.

## Comprobación de la constitución (v1.0.5)
I (el profesor prevalece): cada requisito con fuente literal; lo no confirmado queda como aclaración (FR-001/FR-002). ✔ · II/III: no cambia arquitectura ni mezcla fuentes; el vídeo etiqueta Live/REPRODUCCIÓN. ✔ · V: nada se declara cumplido sin evidencia (SC-010 de F3 incluido). ✔ · VI: el vídeo y la memoria no muestran claves ni `.env`; ngrok/Netlify solo con autorización. ✔ · VII: pasos pequeños y commit manual. ✔ · VIII (aprendizaje y defensa): se conserva la preparación de la explicación individual hasta resolver CA-01. ✔ (ver discrepancia anotada en la hoja de ruta).

## Pasos de F8 (en orden de dependencia; se pueden solapar los marcados ∥)
| Paso | Contenido | Quién | Autorización |
|---|---|---|---|
| **8.1** | Revisión literal de rúbrica, guía, FAQ, enunciado y contrato → `docs/entrega/requisitos-fuente.md` (requisito ↔ fuente literal; CA-01…CA-07). Obtener del profesor el texto sobre el vídeo y las fechas. | Claude + persona estudiante | — |
| **8.2** | Matriz de trazabilidad (rúbrica y 13 puntos → implementación → evidencia → minuto de vídeo) → `docs/entrega/matriz-trazabilidad.md` (esqueleto desde 8.1; se completa al terminar 8.3 y 8.6) | Claude | — |
| **8.3** | Memoria o notebook **obligatoria** (el README no la sustituye) con evidencias visuales (capturas reales del frontend, fragmentos de código, resultados de pruebas) (Guía 2.1–2.9): arquitectura y diagramas, modelo conceptual/lógico/físico, diccionario, procedencia, calidad, pruebas, resultados, complejidad/costes, conclusiones, evidencias. Formato según CA-07 | Claude redacta; persona estudiante revisa y aporta datos de costes | — |
| **8.4** | README final profesional **con capturas reales y enlaces internos a evidencias** (sobre el de F6) y verificación en un entorno limpio paralelo | Claude | PA-11 para eliminar volúmenes temporales |
| **8.5 ∥** | **Observación de >24 h (SC-010 de F3)**: consultas de solo lectura (T075–T077 de `specs/005-…`), resultado real en `docs/evidencias/f3/sc-010-observacion-24h.txt` y anexos | Claude | **PA-10** expresa |
| **8.6** | Guion y recorrido de grabación **por criterios de la rúbrica** (requisito → funcionalidad → evidencia → demostración): Live, Replay, Kafka, PostgreSQL, FastAPI, Angular, pruebas, reproducibilidad; duración y formato según CA-03 (pendientes de confirmación formal) | Claude + persona estudiante | — |
| **8.7** | Entorno de grabación: ensayo en seco, checklist previa, estado de datos y panel, Docker sano, sin secretos visibles; **toma de capturas reales del frontend**. Netlify sigue con la versión de F6 salvo autorización expresa para publicar la versión final | Claude + persona estudiante | ngrok/Netlify solo con autorización expresa |
| **8.8** | Grabación y revisión del vídeo frente a la matriz | **Persona estudiante** (Claude revisa guion/matriz) | — |
| **8.9** | Revisión final de entregables (lista de 13 + matriz + CA-03); Architect/QA acotados **solo si se piden** | Claude | — |
| **8.10** | Acceso del profesor al repositorio privado y entrega | **Persona estudiante** | commit/push manuales |

## Estructura prevista (se crea al ejecutar cada paso, no antes)
```text
docs/entrega/                       # requisitos-fuente.md, matriz-trazabilidad.md, guion-video.md, checklist-grabacion.md, memoria.md o notebooks/memoria.ipynb (según CA-07)
docs/evidencias/f8/                 # ensayos en seco, verificaciones y revisión final
docs/evidencias/f3/sc-010-observacion-24h.txt   # solo con PA-10 (ruta ya prevista en F6/T076)
```

## Dependencias y orden
8.1 primero (aclara qué se pide). 8.5 puede empezar en cuanto se autorice, para acumular datos mientras se escribe la memoria. 8.2 → 8.3 y 8.6 la completan. 8.7 requiere la aplicación congelada (fin de las mejoras de F7 que se vayan a entregar). 8.8 requiere 8.6 y 8.7. 8.10 es lo último.

## Riesgos
- **Requisitos del vídeo sin confirmar** (CA-01/CA-03): se mitiga con 8.1 y manteniendo preparada también la explicación individual.
- **Grabar sobre una versión distinta a la entregada**: congelar F7 antes de 8.7.
- **Backend/túnel en la evaluación** (CA-06): si el profesor abre el panel publicado, el túnel debe estar activo; se documenta el procedimiento y se pregunta.
- **SC-010 no cumplido**: se documenta con honestidad; no bloquea el resto (como acordó F6).
- **Exponer secretos en el vídeo**: checklist previa (clave, `.env`, terminales, URLs de ngrok).
