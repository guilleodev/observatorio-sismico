# Hoja de ruta — Observatorio Sísmico

> **Plan de referencia · Noviembre de 2026**  
> **Primera implementación:** Claude Code  
> **Segunda implementación:** Codex (una vez finalizada la primera)  
> **Metodología:** GitHub Spec Kit (SDD) + MVP + agentes + pruebas + aprendizaje

## 1. Objetivo y estrategia

Construir un **Observatorio de Actividad Sísmica** que cumpla el enunciado del profesor, analice terremotos recientes e históricos y permita explicar y defender técnicamente cada componente.

Orden de trabajo:

1. Estudiar los requisitos y entender la arquitectura.
2. Desarrollar el proyecto completo con **Claude Code** mediante SDD, empezando por un MVP.
3. Revisar el código por bloques, ejecutar pruebas y reunir evidencias durante todas las fases.
4. Preparar la memoria y la defensa individual.
5. Desarrollar una **segunda versión independiente con Codex**, partiendo del mismo material inicial y sin copiar el código generado por Claude.

**Principios:** no programar el proyecto entero en un único prompt; trabajar por hitos verificables; distinguir los requisitos obligatorios de las recomendaciones técnicas; evitar complejidad innecesaria.

## 2. Arquitectura obligatoria

```text
USGS (feed reciente e histórico) + Natural Earth
                 |
                 v
      Productor Python (aiokafka)
                 |
                 v
            Apache Kafka
                 |
                 v
      Consumidor Python (aiokafka)
          |              |
          |     Integración geográfica
          v
           PostgreSQL
                 |
                 v
              FastAPI
                 |
                 v
           ngrok (HTTPS)
                 |
                 v
       Angular + Leaflet (Netlify)
```

**Cinco servicios obligatorios de Docker Compose:** productor, Kafka, consumidor, PostgreSQL y API. El frontend se publica por separado en Netlify. La API se expone mediante ngrok; Kafka y PostgreSQL no deben exponerse públicamente.

## 3. Fases de desarrollo

| Fase | Objetivo | Entregable o criterio de cierre |
|---|---|---|
| **0 — Preparación IA + SDD** | Configurar GitHub Spec Kit, constitución, `CLAUDE.md`, primeros subagentes y skills; delimitar el MVP. | Entorno de trabajo y especificaciones iniciales preparados. |
| **1 — Fuentes y frontend inicial** | Ejecutar Angular en demo; explorar USGS, GeoJSON, campos, unidades y nulos. | Mapa inicial comprobado y fuentes documentadas. |
| **2 — MVP funcional** | Conectar productor Python → Kafka → consumidor → PostgreSQL → FastAPI → Angular. | Un evento sintético identificado completa el recorrido y aparece en el mapa. |
| **3 — Calidad y persistencia** | Extracción real de USGS cada 60 segundos; retención de Kafka (política base ya fijada en el MVP; aquí se ajusta con la ingesta real) y del GeoJSON original; versiones, idempotencia y transacciones; validaciones y cuarentena; modelo SQL; estado de ingesta (`last_ingestion`). | Ingesta real periódica sin duplicados; reenvíos y revisiones tratados correctamente, con pruebas. |
| **4 — Geografía e histórico** | Integrar países mediante punto-en-polígono; cargar un año histórico (propuesta inicial: 2025, magnitud ≥ 4); recuperar el hueco tras interrupciones superiores a 24 horas mediante el catálogo histórico. | Eventos enriquecidos, histórico reutilizable y procedimiento de recuperación documentado. |
| **5 — API y dashboard completo** | Desarrollar filtros, tablas, estadísticas, distribuciones, ventanas horarias y comparaciones históricas; panel de estado del sistema; primeras pruebas de rendimiento (agregación por ventanas y consultas con y sin índice). | Observatorio analítico funcional, filtros coherentes y mediciones iniciales. |
| **6 — Replay, pruebas y despliegue** | Reproducción histórica aislada, pruebas de aceptación, ngrok y Netlify; pruebas de complejidad con tres tamaños de datos (búsqueda secuencial frente a diccionario e integración geográfica). | Demostración reproducible desde otro dispositivo y mediciones completas. |
| **7 — Memoria y defensa** | Consolidar calidad, modelos, rendimiento, costes, conclusiones y evidencias. | Entrega completa y explicación individual preparada. |

> **Nota:** la documentación, las pruebas y el estudio del código se hacen **durante todas las fases**; no se posponen hasta la fase 7. Esta división en fases es nuestra propuesta, no una exigencia literal del profesor.

### MVP inicial

El MVP consiste en un **recorrido completo de un solo evento de prueba**: publicación por el productor, transporte en Kafka, procesamiento por el consumidor, almacenamiento en PostgreSQL, consulta desde FastAPI y representación en Angular.

Es un **hito intermedio, no la entrega final**. Después se incorporarán extracción real periódica, histórico, versiones, calidad, geografía, análisis, replay y despliegue.

## 4. Plan de commits numerados por fase

**Reglas acordadas:** commits **manuales**, mensajes **en español**, agrupados por fases o hitos importantes. Claude Code no crea commits ni hace `push` sin autorización expresa.

### Convención de nombres

Usaremos `F<fase>.<número de commit dentro de esa fase>` para identificar el hito. Por ejemplo, `F2.1` es el primer commit de la fase 2 y `F2.2`, el segundo. El número **no identifica una versión del software**: sirve para organizar el historial del proyecto.

Los mensajes mantendrán los prefijos habituales de Git (`chore`, `feat`, `fix`, `docs`), con la descripción **en español**.

| Fase | ID | Mensaje de commit orientativo | Hito para confirmarlo |
|---|---|---|---|
| **0 — Preparación IA + SDD** | **F0.1** | `chore: [F0.1] configurar Claude Code y metodología SDD` | Spec Kit, instrucciones y primeros agentes/skills preparados. |
| **1 — Fuentes y frontend** | **F1.1** | `chore: [F1.1] validar frontend y documentar fuentes sísmicas` | Demo verificada y exploración de USGS documentada. |
| **2 — MVP funcional** | **F2.1** | `feat: [F2.1] preparar infraestructura y servicios del MVP` | Docker, Kafka y PostgreSQL arrancan y se verifican. |
| | **F2.2** | `feat: [F2.2] conectar pipeline con API y mapa Angular` | Un evento de prueba recorre el circuito y aparece en el mapa. |
| **3 — Calidad y persistencia** | **F3.1** | `feat: [F3.1] implementar extracción real, versiones e idempotencia` | Extracción real cada 60 s con retención configurada; duplicados y revisiones pasan sus pruebas. **Criterio obligatorio de cierre:** retirada o aislamiento completo de `synthetic` (excepción temporal del MVP), completado como máximo al cerrar F3.1 y preferiblemente antes de conectar la ingesta real de USGS: la API definitiva solo admite `mode` = `live` o `replay`, ninguna respuesta contiene `synthetic` y ninguna consulta de la API referencia el esquema `sintetico` (ver `specs/001-mvp-evento-sintetico/research.md`, R-001). |
| | **F3.2** | `feat: [F3.2] incorporar validación, cuarentena y estado de ingesta` | Reglas de calidad, rechazos y `last_ingestion` comprobados. |
| **4 — Geografía e histórico** | **F4.1** | `feat: [F4.1] integrar catálogo geográfico` | Países asignados por punto-en-polígono, incluido «Sin país asignado». |
| | **F4.2** | `feat: [F4.2] cargar histórico y procedimiento de recuperación` | Histórico 2025 reproducible y recuperación tras una parada superior a 24 h documentada. |
| **5 — API y dashboard** | **F5.1** | `feat: [F5.1] ampliar API con filtros y estadísticas` | Endpoints y filtros probados. |
| | **F5.2** | `feat: [F5.2] completar dashboard y comparación histórica` | Mapa, tabla y gráficos sincronizados; mediciones de agregación y de consultas con y sin índice. |
| **6 — Replay y despliegue** | **F6.1** | `feat: [F6.1] implementar reproducción y pruebas de aceptación` | Replay aislado y pruebas ejecutadas; mediciones con tres tamaños de datos sintéticos aislados. |
| | **F6.2** | `feat: [F6.2] publicar observatorio mediante ngrok y Netlify` | Aplicación accesible y errores de conexión comprobados. |
| **7 — Memoria y defensa** | **F7.1** | `docs: [F7.1] completar memoria técnica y evidencias` | Documentación final y defensa preparadas. |

### Estimación

- **2 commits iniciales ya realizados:** creación y reorganización del repositorio; no los renumeraremos.
- **13 commits adicionales previstos** en esta hoja de ruta.
- **15 commits totales estimados** para la versión Claude Code.

Es una planificación flexible: podemos fusionar hitos si los cambios son pequeños o añadir un commit correctivo si aparece un error importante. Por ejemplo, `fix: [F3.3] corregir gestión de revisiones antiguas` solo se utilizaría si resulta necesario.

**Regla práctica:** antes de cada commit, revisar `git status`, el diff y los resultados de las pruebas. El estudiante confirma manualmente el hito y realiza el `push` cuando corresponda.

## 5. Equipo de subagentes de Claude Code

**Agente principal — Claude Code:** coordina las tareas, trabaja con Spec Kit, decide cuándo delegar e integra los resultados.

| Subagente | Responsabilidad | Uso previsto |
|---|---|---|
| **Architect** | Revisar arquitectura, requisitos, especificaciones y contratos. | Fases 0–2 |
| **Data Engineer** | Kafka, productor/consumidor, PostgreSQL, calidad, geografía e histórico. | Fases 2–4 |
| **Frontend Engineer** | Angular, Leaflet, filtros, panel y visualización. | Fases 1 y 5–6 |
| **QA Engineer** | Tests, idempotencia, recuperación de fallos y criterios de aceptación. | Fases 0–7 |
| **Technical Reviewer** | Explicación del código, decisiones técnicas, documentación y preguntas de defensa. | Fases 2–7 |

**Orden de incorporación:** comenzar con **Architect** y **QA Engineer**; añadir los otros cuando haya tareas especializadas. No invocar subagentes por rutina, para controlar el consumo de Claude Pro.

## 6. Skills y MCP

Una **skill** es un procedimiento reutilizable con instrucciones y, cuando corresponde, recursos. No es lo mismo que un subagente.

| Skill prevista | Finalidad |
|---|---|
| **Spec Kit / SDD** | Generar y mantener especificaciones, planes y tareas. |
| `requirements-review` | Contrastar cambios con el enunciado y el contrato API. |
| `kafka-pipeline-review` | Revisar mensajes, offsets, duplicados, revisiones y errores. |
| `quality-evidence` | Preparar comprobaciones y evidencias de calidad. |
| `learning-explainer` | Explicar código por bloques y preparar preguntas técnicas. |

Estas son **skills previstas**, no todas están creadas. Evitaremos duplicar funciones que ya cubra Spec Kit.

Los subagentes y las skills creados para el proyecto **se versionan** en el repositorio. La configuración local de Claude (`.claude/settings.local.json`) **no se versiona** y está excluida en `.gitignore`.

**MCP:** incorporar conexiones externas solamente cuando aporten una necesidad real. No instalar servidores MCP solo para aumentar el número de herramientas.

## 7. Flujo SDD por funcionalidad

1. **Constitution:** principios generales del proyecto (calidad, seguridad, aprendizaje, cumplimiento del enunciado).
2. **Specify:** qué debe hacer la funcionalidad y cuáles son sus criterios de aceptación.
3. **Plan:** cómo se implementará técnicamente.
4. **Tasks:** dividir el trabajo en tareas concretas y verificables.
5. **Implement:** desarrollar y ejecutar pruebas con Claude Code.
6. **Verify:** contrastar código, tests y comportamiento con la especificación y el enunciado.
7. **Revisión humana:** comprender el código y aprobar el hito antes del commit manual.

Spec Kit y la metodología SDD son **decisiones nuestras de desarrollo**, no requisitos del profesor.

## 8. Criterios para cerrar una fase

- [ ] Requisitos y criterios de aceptación cubiertos.
- [ ] Código implementado y pruebas pertinentes ejecutadas.
- [ ] Evidencias y decisiones técnicas documentadas.
- [ ] Código comprendido y explicable por bloques.
- [ ] Cambios revisados; commit manual del hito cuando corresponda.

**Método de aprendizaje:** explicación por bloques de código, ejercicios cortos y preguntas de defensa. No marcar pruebas como superadas si no se han ejecutado; no inventar mediciones o resultados.

## 9. Documentación y evaluación

La entrega del profesor se organiza en **tres bloques**:

1. **Repositorio reproducible:** código, Docker Compose, dependencias, SQL, configuración de ejemplo, instrucciones y pruebas.
2. **Memoria o notebook:** procedencia de datos, dimensiones de calidad, modelado conceptual/lógico/físico, análisis, tres conclusiones fundamentadas, complejidad, medidas de rendimiento y costes.
3. **Panel y defensa:** Angular publicado, procedimiento para levantar backend y ngrok, replay y explicación individual del flujo completo y de una decisión técnica propia.

La rúbrica contempla **extracción, calidad, modelado, análisis y reflexión**. Para una buena entrega son prioritarias las pruebas de duplicados y revisiones, integración geográfica, filtros coherentes y conclusiones con cifras y periodos identificables.

## 10. Estado actual y próximo paso

### Estado actual
- Repositorios GitHub creados y conectados.
- Material del profesor organizado en docs/referencias/.
- CLAUDE.md configurado.
- Primera inspección del proyecto completada.
- Hoja de ruta revisada contra el enunciado y ajustada (extracción real, retención, estado de ingesta, recuperación y mediciones asignadas a fases).
- Codex queda aparcado hasta terminar la versión Claude.

### Decisiones técnicas
- **Python 3.13** es la versión candidata para las imágenes Docker. No se fija definitivamente hasta comprobar la compatibilidad con las dependencias del proyecto.
- `.claude/settings.local.json` no se versiona; los subagentes y skills del proyecto sí.

### Próximos pasos
1. Integrar GitHub Spec Kit (SDD).
2. Preparar la constitución del proyecto.
3. Definir el alcance y los criterios de aceptación del MVP.
4. Configurar los primeros subagentes: Architect y QA Engineer.
5. Preparar las skills necesarias.
6. Validar la configuración antes de iniciar el desarrollo.

### Reglas
- No implementar funcionalidades sin una especificación aprobada.
- Trabajar por fases y verificar los resultados.
- No crear commits ni hacer push sin autorización.
- Explicar las decisiones técnicas para facilitar el aprendizaje.
- Priorizar los requisitos del profesor frente a esta planificación.
