# Lista de calidad de la especificación: MVP — recorrido completo de un evento sintético

**Propósito**: validar la completitud y calidad de la especificación antes de planificar
**Creada**: 2026-11-03
**Funcionalidad**: [spec.md](../spec.md)

## Calidad del contenido

- [x] Sin detalles de implementación (lenguajes, frameworks, APIs) — *Nota:* se citan solo
  elementos que el profesor fija como contrato (`GET /api/eventos`, GeoJSON, `OPTIONS`, cabecera
  `ngrok-skip-browser-warning`, `localhost:4200`); las tecnologías concretas quedan para el plan.
- [x] Centrada en el valor para la persona usuaria y en las necesidades del proyecto
- [~] Redactada para personas no técnicas — *Nota:* el dominio (Big Data) es técnico; los
  escenarios se describen por comportamiento observable, pero se asume lectura técnica básica.
- [x] Todas las secciones obligatorias completadas

## Completitud de los requisitos

- [x] No quedan marcadores [NEEDS CLARIFICATION] — *Nota:* la decisión sobre el valor de
  `mode` para el dato sintético está registrada en Supuestos y aceptada provisionalmente (R-001).
- [x] Requisitos comprobables y sin ambigüedad
- [x] Criterios de éxito medibles
- [x] Criterios de éxito independientes de la tecnología
- [x] Escenarios de aceptación definidos
- [x] Casos límite identificados
- [x] Alcance claramente acotado (qué entra y qué queda fuera, en Supuestos)
- [x] Dependencias y supuestos identificados

## Preparación de la funcionalidad

- [x] Todos los requisitos funcionales tienen criterios de aceptación claros
- [x] Los escenarios de usuario cubren los flujos principales
- [x] La funcionalidad cumple los resultados medibles definidos
- [x] Sin fugas de detalles de implementación en la especificación

## Notas

- Los umbrales de tiempo de SC-001 y SC-002 son objetivos de trabajo propios, no requisitos del
  profesor; pueden ajustarse tras la primera ejecución real.
- Valor de `mode` para el dato sintético: aceptado provisionalmente por la persona estudiante el
  2026-11-03 como excepción temporal del MVP (research R-001), con retirada completada como máximo al cerrar F3.1.
