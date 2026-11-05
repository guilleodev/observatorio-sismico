# Lista de calidad de la especificación: Ingesta real y calidad de datos (F3)

**Propósito**: validar la completitud y calidad de la especificación antes de planificar
**Creada**: 2026-11-05
**Funcionalidad**: [spec.md](../spec.md)

## Calidad del contenido

- [x] Sin detalles de implementación (lenguajes, frameworks, bases de datos) — *Nota:* se citan solo términos que fija el
  profesor (`mode = live`, `updated`, HTTP 429/5xx, `last_ingestion`, `earthquake`); las tecnologías quedan para el plan.
- [x] Centrada en el valor para la persona usuaria y en las necesidades del proyecto
- [~] Redactada para personas no técnicas — *Nota:* el dominio (Big Data) es técnico; los escenarios se describen por
  comportamiento observable.
- [x] Todas las secciones obligatorias completadas

## Completitud de los requisitos

- [x] No quedan marcadores [NEEDS CLARIFICATION] — las decisiones menores están en Supuestos (A-01 a A-10)
- [x] Requisitos comprobables y sin ambigüedad
- [x] Criterios de éxito medibles
- [x] Criterios de éxito independientes de la tecnología
- [x] Escenarios de aceptación definidos
- [x] Casos límite identificados
- [x] Alcance claramente acotado (fuera de alcance en la cabecera)
- [x] Dependencias y supuestos identificados

## Preparación de la funcionalidad

- [x] Todos los requisitos funcionales tienen criterios de aceptación claros
- [x] Los escenarios de usuario cubren los flujos principales (pasos 3.2 a 3.7)
- [x] La funcionalidad cumple los resultados medibles definidos
- [x] Sin fugas de detalles de implementación en la especificación

## Notas

- Los umbrales numéricos de SC-001 a SC-010 son objetivos de trabajo propios, no requisitos del profesor.
- Las retenciones de A-04 (3 días y 30 días) son provisionales y se ajustan tras medir el volumen real.
