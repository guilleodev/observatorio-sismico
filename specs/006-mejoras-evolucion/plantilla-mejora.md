# Plantilla de mini-especificación de una mejora (F7.n)

Copiar a `specs/006-mejoras-evolucion/mejoras/F7.n-<nombre>/spec.md` **solo tras la aprobación** de la persona estudiante. Añadir después `plan.md` y `tasks.md` breves. Mantener corto y proporcional al cambio.

```markdown
# Mejora F7.n — <título>

**Candidata de origen**: C-nn · **Aprobada**: AAAA-MM-DD por la persona estudiante · **Estado**: en curso | verificada | con reservas
**Riesgo**: bajo | medio | alto (justificar: seguridad, arquitectura, regresión de interfaz o de datos)

## Problema y valor
(Qué se quiere mejorar, quién lo nota y por qué merece el cambio.)

## Alcance
- Dentro:
- Fuera de alcance (incluye lo que NO se toca: FastAPI, Kafka, PostgreSQL, Compose, contrato, etc., si procede):

## Requisitos (FR-nnn) y criterios de aceptación (SC-nnn)
(Observables y medibles. Incluir comportamiento ante errores y accesibilidad si hay interfaz.)

## Decisiones y alternativas
(Opciones evaluadas con ventajas, riesgos y la elegida —o «pendiente de decidir»—. Las que cambien seguridad o arquitectura requieren aprobación aparte.)

## Seguridad y arquitectura (comprobación del marco, FR-004)
(Clave de acceso, CORS, secretos, puertos, aislamiento de fuentes, tecnologías cerradas.)

## Pruebas proporcionales
- Nuevas (escritas antes, deben fallar):
- Regresión que se ejecuta y por qué (backend / `node --test` / build / aislamiento):
- Comprobación manual o visual:
- No se ejecuta (y por qué):

## Evidencias y cierre
- `docs/evidencias/f7/7.n-*`
- Reservas:
- Commit manual: `[F7.n]`
```
