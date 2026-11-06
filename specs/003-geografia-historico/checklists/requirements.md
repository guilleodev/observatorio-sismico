# Lista de calidad de la especificación: Geografía e histórico (F4)

**Propósito**: validar que la especificación está completa antes de planificar
**Creada**: 2026-11-06
**Funcionalidad**: [spec.md](../spec.md)

## Calidad del contenido

- [x] Sin detalles de implementación en requisitos ni criterios (las bibliotecas y esquemas solo aparecen en «Decisiones que requieren aprobación»)
- [x] Centrada en el valor para el usuario (responder «¿dónde hay actividad y cómo se compara con 2025?»)
- [x] Legible para quien evalúa el proyecto (sin código)
- [x] Secciones obligatorias completas

## Completitud de los requisitos

- [x] Sin marcadores [NEEDS CLARIFICATION]: las dudas se resolvieron en «Aclaraciones» (modo autónomo, opción conservadora)
- [x] Requisitos comprobables y sin ambigüedad (FR-001 a FR-025)
- [x] Criterios de éxito medibles (SC-001 a SC-012); los umbrales de rendimiento (SC-011) quedan pendientes de medición y los confirma la persona estudiante
- [x] Criterios de éxito sin tecnología concreta, salvo referencias al propio proyecto (`/api/eventos`, `live`)
- [x] Escenarios de aceptación definidos en las 5 historias
- [x] Casos límite identificados
- [x] Alcance acotado (fuera de alcance: F5, F6, F7, SC-010 de F3, reconciliación de eliminaciones)
- [x] Dependencias y supuestos identificados (A-01 a A-10)

## Preparación de la funcionalidad

- [x] Cada requisito funcional tiene criterio de aceptación en alguna historia o criterio de éxito
- [x] Las historias cubren los flujos principales y los pasos 4.1 a 4.6 de la hoja de ruta
- [x] Coherente con `ENUNCIADO.md` §4.2, §4.3, §7 y §8 y con `CONTRATO-API.md`
- [x] Sin detalles de implementación en la especificación

## Notas

- Cuatro decisiones (D1 a D4) requieren aprobación antes de implementar los pasos correspondientes; D1 bloquea 4.2, D3 bloquea 4.4 y D4 bloquea 4.5.
- Hecho comprobado al especificar: el catálogo entregado tiene 177 entidades, `ADM0_A3` sin repeticiones y geometrías `Polygon`/`MultiPolygon`; se repite en 4.1.
