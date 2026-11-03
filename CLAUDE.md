
# CLAUDE.md — Observatorio Sísmico

## Contexto del proyecto

Proyecto académico de Sistemas de Big Data.

Documentación de referencia:
- docs/referencias/ENUNCIADO.md
- docs/referencias/CONTRATO-API.md
- docs/referencias/FAQ-ALUMNADO.md
- docs/referencias/Guia-entregables-observatorio-sismico.md

El enunciado y el contrato API son las fuentes de requisitos principales. No modificar los documentos originales del profesor.

## Tecnologías obligatorias

Python, aiokafka, Apache Kafka, PostgreSQL, FastAPI,
Angular, Leaflet, Docker Compose, ngrok y Netlify.

No introducir Spark, Flink, Kubernetes ni Machine Learning sin autorización.

## Reglas de desarrollo

1. Leer los requisitos correspondientes antes de implementar.
2. Dividir las tareas grandes en módulos pequeños y verificables.
3. Respetar el contrato API proporcionado.
4. Escribir código claro, modular y mantenible.
5. Controlar duplicados, revisiones y fallos de procesamiento.
6. Mantener separados los datos reales, históricos y de replay según su finalidad.
7. No inventar datos, mediciones ni resultados de pruebas.
8. Ejecutar las pruebas pertinentes antes de declarar una tarea terminada.
9. No modificar archivos ajenos a la tarea sin justificación.
10. Antes de cambios importantes, presentar un plan.

## Aprendizaje y defensa

El estudiante debe comprender y defender todo el código.

Al terminar cada tarea:
- Resumir los archivos modificados.
- Explicar el código por bloques funcionales.
- Justificar las principales decisiones técnicas.
- Indicar las pruebas ejecutadas y sus resultados.
- Formular una posible pregunta de defensa.

Responder en español de forma clara y progresiva.

## Git

- Mensajes de commit en español.
- Agrupar commits por fases o hitos significativos.
- No crear commits sin autorización expresa.
- No hacer push sin autorización expresa.
- No modificar ramas remotas sin autorización.

## Seguridad

- No subir credenciales ni archivos .env reales.
- No exponer Kafka ni PostgreSQL públicamente.
- Mantener aislados los datos sintéticos y de reproducción.

## Límites

- No implementar fases no autorizadas.
- No añadir complejidad innecesaria.
- Detenerse al terminar la tarea solicitada.