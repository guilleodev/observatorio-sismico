# Plan del marco: Mejoras y evolución (F7)

**Especificación**: [spec.md](spec.md) · **Backlog**: [backlog.md](backlog.md) · **Fecha**: 2026-11-09

## Resumen
F7 es evolutiva: no hay una lista cerrada de funcionalidades. El plan fija **cómo** se trabaja (ciclo, reglas, pruebas proporcionales, evidencias y commits) y deja el **qué** en el backlog. Añadir una idea = añadir una fila al backlog. Cuando la persona estudiante decide empezar un trabajo concreto se le asigna `F7.n` (puede agrupar varias candidatas) y, si hace falta, una carpeta `mejoras/F7.n-<nombre>/` con su encargo breve. No se reescribe este plan y no hay secuencia predefinida.

## Comprobación de la constitución (v1.0.5)
- I (requisitos del profesor prevalecen): las mejoras no cambian arquitectura, contrato ni rúbrica. ✔ regla FR-003/FR-004 del marco.
- II (arquitectura y tecnologías cerradas): sin Spark/Flink/Kubernetes/ML ni servicios nuevos. ✔ fuera de alcance.
- III (datos honestos y aislados): ninguna mejora mezcla fuentes. ✔ `aislamiento_final.sh` como comprobación cuando se toque la API o los datos.
- V (verificación antes de dar algo por terminado) y VI (seguridad y secretos): pruebas y evidencia por mejora; clave/CORS/secretos intactos. ✔ FR-002 y FR-004.
- VII (simplicidad y entrega incremental): pasos pequeños `7.n`, un commit manual por paso. ✔
- VIII (aprendizaje): cada mejora termina con explicación por bloques y una pregunta de comprensión. ✔ ver tareas.

## Estructura
```text
specs/006-mejoras-evolucion/
  spec.md  plan.md  tasks.md  backlog.md  plantilla-mejora.md
  mejoras/F7.n-<nombre>/{spec.md,plan.md,tasks.md}     # se crean al aprobar cada mejora
docs/evidencias/f7/7.n-*                                # evidencias de cada mejora (se crea al empezar la primera)
```

## Pruebas proporcionales (guía, no cerrada)
| Tipo de cambio | Mínimo recomendado |
|---|---|
| Solo estilo/maquetación Angular | `node --test` + `npm run build` + comprobación visual (anchos y teclado) |
| Lógica del panel (filtros, estado, gráficas) | pruebas nuevas de lógica pura + `node --test` completo + build + navegador |
| Accesibilidad | pruebas de lógica + comprobación con teclado/zoom/contraste (guion de F6 `guion-accesibilidad.md`) |
| API/FastAPI (solo si una mejora aprobada lo exige) | pruebas nuevas + `scripts/f6/ejecutar.sh` (backend) + `aislamiento_final.sh` + contrato |
| Seguridad/acceso | todo lo anterior + `acceso.test.ts`, `verificar_acceso_api.py`, `mutaciones_clave.py`, `escaneo_secretos.sh` |
| Entorno local de desarrollo | comprobación manual descrita + `git status` sin secretos |
Cada mejora justifica qué batería ejecuta y cuál no; no se repiten baterías completas sin motivo.

## Política de trabajo (ver `spec.md`)
Desarrollo y pruebas en `localhost:4200`; commits y push manuales; Netlify congelado en la versión de F6 (sin despliegues automáticos ni publicación de F7); ngrok y despliegues públicos solo con autorización expresa; sin secretos en Git ni en bundles; nada se instala (skills, agentes, MCP, dependencias) sin aprobación y revisión previa de procedencia y contenido.

## Cómo avanza F7 (sin hitos fijos)
- **No hay secuencia ni número de pasos.** Los `F7.n` se numeran en el orden en que la persona estudiante decide empezar trabajos; cada uno puede agrupar varias mejoras y ser amplio.
- **No hay paso de cierre definido.** Se decidirá más adelante; la fecha límite de entrega (F8, CA-02, pendiente) será el factor que lo condicione.
- El orden en que aparecen las ideas en `propuesta-rediseno-dashboard.md` es **orientativo y no vinculante**.

## Riesgos
- **Regresión de seguridad** al tocar el acceso (C-01): mitigada por FR-004 y por las pruebas de F6 que se conservan.
- **Deriva del diseño original** del profesor: toda mejora visual justifica por qué y qué se conserva.
- **Crecimiento sin fin**: asumido a propósito (fase abierta); se acotará con la fecha de entrega y con que F8 no se bloquee por F7.
- **Publicar sin querer**: la publicación en Netlify y ngrok requieren autorización expresa en cada ocasión.
