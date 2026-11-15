# Requisitos de origen — Observatorio Sísmico (F8.1)

**Fecha de la auditoría**: 2026-11-11 · **Paso**: F8.1 (tareas T003–T005 y T032 de `specs/007-documentacion-entrega-video/tasks.md`) · **Estado**: documento de trabajo, pendiente de revisión por la persona estudiante.

Este documento recoge **qué exigen las fuentes**, con documento y apartado exactos. **No** dice si se cumple: eso está en [`matriz-trazabilidad.md`](matriz-trazabilidad.md). No se han modificado los materiales del profesor.

## 0. Fuentes y convenciones

| Fuente | Archivo | Versión / observación |
|---|---|---|
| Enunciado | `docs/referencias/ENUNCIADO.md` | «27 de octubre de 2026 · revisión 2 (Docker, HTTPS y evidencias de calidad)». Documento normativo principal. |
| Guía de entregables | `docs/referencias/Guia-entregables-observatorio-sismico.md` | «Complementa el enunciado y las FAQ: no añade nuevas tareas ni modifica la rúbrica» (Guía, introducción). |
| FAQ del alumnado | `docs/referencias/FAQ-ALUMNADO.md` | 35 preguntas. `FAQ-observatorio-sismico .md` es **idéntico** (comprobado con `diff`). |
| Contrato de la API | `docs/referencias/CONTRATO-API.md` | «Contrato mínimo». |
| Fuentes y licencias | `docs/referencias/FUENTES-Y-LICENCIAS.md` | Procedencia del catálogo geográfico (apoyo a procedencia). |
| Validación del material base | `docs/referencias/VALIDACION.md` | Describe el material de partida; no impone requisitos al alumnado. Su comprobación manual (6 pasos) coincide con las pruebas de túnel y Netlify. |
| Reglas del proyecto | `CLAUDE.md`, `.specify/memory/constitution.md` (v1.0.5) | Reglas propias del proyecto (no del profesor). |
| **Comunicado en clase** | — (sin fuente escrita en el repositorio) | Nuevo formato de evaluación y ventana de evaluación (§1). |

**Tipos de requisito** (para no confundir recomendaciones con exigencias):

| Marca | Significado | Cómo se detecta en la fuente |
|---|---|---|
| **[E]** | Exigencia | «debe», «es obligatorio», «MUST», lista de entregables (§12), filas de §11, criterios de §13 |
| **[R]** | Recomendación u orientación | «considera», «puedes», «ejemplo», «propuesta de partida», «orientativo» |
| **[A]** | Ampliación opcional, **no exigida** | «es una ampliación», «no se exige», «opcional» |
| **[D]** | Derivado | No literal: se deduce del comunicado en clase o de una combinación de fuentes (marcado para no atribuirlo al profesor) |

Los identificadores (`ARQ-01`, `EXT-03`, …) son propios de esta auditoría y los usa la matriz. **Estados** usados en la matriz: **VERIFICADO** (evidencia guardada), **IMPLEMENTADO, PENDIENTE DE COMPROBACIÓN**, **CON RESERVAS**, **PENDIENTE / NO CUMPLIDO**.

## 1. Formato de evaluación vigente y adaptación de la defensa

### 1.1 Lo comunicado (en clase; sin fuente escrita archivada — CA-01)
- Sin defensa presencial, presentación oral ni preguntas del profesor.
- Evaluación por **tres vías**: (A) **vídeo** explicativo que grabará la persona estudiante con OBS; (B) **aplicación web publicada**, que el profesor revisará por su cuenta; (C) **repositorio privado de GitHub**, que también revisará por su cuenta.
- El profesor pedirá mantener los ordenadores **encendidos unos dos días** («ventana de evaluación», fechas sin confirmar) para corregir cuando tenga disponibilidad.
- Entregables: memoria técnica independiente (`docs/entrega/memoria.md`), README definitivo y vídeo.

### 1.2 Cómo se adapta cada mención a la defensa (los materiales originales siguen diciendo «defensa»)

| Mención original | Fuente | Adaptación | Estado |
|---|---|---|---|
| «URL del panel y procedimiento para activar el backend/túnel durante la defensa» [E] | ENUNCIADO §12 | Procedimiento de activación documentado + **checklist de la ventana de evaluación** (T039). La URL la usa el profesor por su cuenta. | Pendiente de URL definitiva y publicación segura de F7 (CA-06) |
| «Explicación individual del flujo completo y de una decisión técnica propia» [E] | ENUNCIADO §12; Guía 3.3 («explicación oral»); lista final punto 13; FAQ 35 último punto | Bloque del **vídeo** (escena G): recorrido de un evento desde USGS hasta el panel y una decisión técnica propia. | Resuelta en lo práctico (CA-08) |
| «La URL de Netlify funciona y sé activar el backend y el túnel durante la defensa» [E] | Guía, lista final punto 12 | Ídem: URL funcional, abierta desde otro dispositivo, y procedimiento/checklist de activación. | Verificado con reservas: F7 publicada con función de Netlify y comprobada en un navegador del propio equipo y en un Pixel (confirmación sin evidencia archivada) |
| «Demostrar actividad si no aparece un nuevo terremoto durante la defensa» [E] | FAQ 32; Guía 2.9 | REPRODUCCIÓN: debe haber una ejecución de replay almacenada y visible cuando el túnel esté activo; escena propia del vídeo. | Implementado y verificado (F6); asegurar su presencia en la ventana |
| «Procedimiento para activar el sistema durante la defensa» (5 pasos) [E] | Guía 3.2 | Se convierte en la checklist de activación previa a la ventana y en la escena de arranque del vídeo. | Pendiente (T039, T020) |
| «Equipo, contenedores y túnel deben permanecer activos durante la demostración» [E] | ENUNCIADO §9 (último párrafo) | La «demostración» pasa a ser la ventana de evaluación (~2 días) y la grabación del vídeo. | Pendiente de fechas (CA-06/CA-02) |

## 2. Requisitos técnicos y de entrega por apartado

### 2.1 Arquitectura y despliegue (ENUNCIADO §2 y §9; Guía 1.2; CONTRATO «Transporte»)
| ID | Tipo | Fuente | Exigencia |
|---|---|---|---|
| ARQ-01 | E | §2 | Cinco servicios separados de Docker Compose en el equipo del alumno: productor Python (aiokafka), Kafka, consumidor Python (aiokafka), PostgreSQL y API FastAPI; arranque conjunto con `docker compose up --build -d`. |
| ARQ-02 | E | §2 | Cada servicio Python con imagen reproducible; comprobaciones de salud y reintentos (el orden de arranque por sí solo no basta). |
| ARQ-03 | E | §2 | Túnel ngrok con HTTPS a la API; panel Angular + Leaflet publicado en Netlify (SPA); Kafka y PostgreSQL **no** se publican por el túnel. |
| ARQ-04 | E | §2 | Productor y consumidor siguen trabajando aunque el panel esté cerrado. |
| ARQ-05 | N | §2 | **No** se exige Spark, Flink, Kubernetes, ML ni servidor cloud permanente (y `CLAUDE.md` los prohíbe sin autorización). |
| DES-01 | E | §9; Guía 1.2–1.3 | `compose.yaml`, dependencias fijadas, inicialización de la base y `.env.example` sin credenciales. |
| DES-02 | E | §9 | Volúmenes persistentes para los datos; retención limitada de Kafka; nombres de servicio dentro de Compose (no `localhost`); listeners de Kafka documentados si se accede desde el host. |
| DES-03 | E | §9 | Exponer solo la API de consulta (`127.0.0.1:8000:8000` + `ngrok http 8000`, o ngrok en contenedor); Uvicorn en `0.0.0.0:8000`; no exponer rutas de administración, secretos, BD ni broker; authtoken de ngrok fuera de Angular y de Git. |
| DES-04 | E | §9 | Angular en Netlify con la URL HTTPS de ngrok en `public/config.json` antes de compilar; CORS con el origen exacto de Netlify y el de desarrollo, `OPTIONS` atendido y `ngrok-skip-browser-warning` si se usa. |
| DES-05 | E | §9 | El mapa consulta la API cada 60 s; el productor consulta USGS cada 60 s. |
| DES-06 | E | §9 (último párrafo); FAQ 31 | Se evalúa la **limitación** (sin equipo/túnel no hay datos nuevos) y el **tratamiento del error**, no la disponibilidad 24/7. Distinguir última consulta del panel, generación de la respuesta y última ingesta de USGS (FAQ 31). |

### 2.2 Extracción e ingesta (ENUNCIADO §4 y §5; FAQ 8–15)
| ID | Tipo | Fuente | Exigencia |
|---|---|---|---|
| EXT-01 | E | §4.1 | Feed `all_day.geojson` por HTTP GET cada ~60 s; identificar `id`, `time`, `updated`, `mag`, `magType`, `type`, `place`, `coordinates` (lon, lat, profundidad km; tiempos en ms Unix). |
| EXT-02 | E | §4.1 | Documentar respuesta, tipos, unidades, campos opcionales, frecuencia, errores y latencia. |
| EXT-03 | E | §4.1 | Filtrar `type == "earthquake"` y **conservar el motivo de exclusión**. |
| EXT-04 | E | §4.2 | Histórico de un año completo mediante la API del catálogo; por meses; subdividir si supera 20 000; sin truncar en silencio; deduplicar extremos; guardar consultas, fecha de extracción y nº de registros; descargar una vez y reutilizar. *(Alcance 2025 / mundial / M ≥ 4 / earthquake: **[R]** «propuesta de partida».)* |
| EXT-05 | E | §4.3 | Integrar cada terremoto con el catálogo Natural Earth mediante **punto dentro de polígono** (no por el texto de `place`); WGS84/EPSG:4326; regla documentada para fronteras o varias coincidencias; `ADM0_A3` tras comprobar unicidad; categoría «Sin país asignado» (no se atribuye al país más cercano). |
| EXT-06 | E | §5.1–5.6 | Productor: variables de entorno; conservar el GeoJSON original y metadatos antes de transformar (retención y registro de consultas); comparar `id` y `updated` con el estado persistente; clave Kafka = id del evento; mensaje con `source`, `ingested_at`, `mode` (`live`/`replay`) y evento original; confirmación de Kafka antes de marcar como publicada; timeout, 429/5xx y errores de JSON con reintentos de espera progresiva sin borrar el estado válido. |
| EXT-07 | E | §5 (último párrafo) | No confundir «sale de la ventana» con «eliminado»; mantener el histórico; **documentar** la limitación de la reconciliación de eventos eliminados/fusionados; **explicar cómo recuperar el hueco** tras una parada > 24 h con el catálogo histórico. *(La reconciliación exhaustiva es **[A]**.)* |

### 2.3 Calidad y transformación (ENUNCIADO §6; Guía 2.4; FAQ 16–17)
| ID | Tipo | Fuente | Exigencia |
|---|---|---|---|
| CAL-01 | E | §6 | El consumidor aplica reglas explícitas de validación y transformación. |
| CAL-02 | E | §6; §12; Guía 2.4 | Análisis de calidad **en la memoria o en un notebook**: código o consultas, resultados antes/después, decisiones y registros de ejemplo; denominador indicado (mensajes, versiones o terremotos actuales); sin sumar incidencias solapadas (Guía 2.4). |
| CAL-03 | R | §6 (tabla) | Considerar las dimensiones completitud, unicidad, validez, consistencia, actualidad y exactitud; si alguna no se puede verificar, justificar la limitación. *(La rúbrica valora **4+ dimensiones** para notable y «completo + acciones» para sobresaliente: §13.)* |
| CAL-04 | E | §6 | No rellenar nulos con cero; magnitud o profundidad negativas no son automáticamente errores; anomalías señaladas y justificadas; registros no tratables a **cuarentena** con motivo y referencia al original; casos dañados artificialmente, separados e identificados. |
| CAL-05 | E | §6 | Fechas a UTC con unidades conservadas; separar tiempo de ocurrencia y de procesamiento; registrar qué transformaciones cambian datos y a cuántos registros. |
| CAL-06 | A | §6; Guía 2.4; FAQ 17 | Generar informes automáticamente, un archivo de calidad separado o un panel de calidad en Angular: **no se exige**. |

### 2.4 Integración y modelado (ENUNCIADO §7; Guía 2.2, 2.3, 2.5; FAQ 12–14, 18–20)
| ID | Tipo | Fuente | Exigencia |
|---|---|---|---|
| MOD-01 | E | §7; §12; Guía 2.5 | Modelo **conceptual, lógico y físico**; explicar grano, claves, relaciones e índices; SQL de creación en el repositorio; índices justificados por las consultas y con medición. *(La estructura hecho/dimensiones/historial/estado es **[R]**.)* |
| MOD-02 | E | §7 | La integración une terremotos con atributos del catálogo geográfico (segunda fuente). |
| MOD-03 | E | §7 | Revisión: actualizar el estado actual solo si es más reciente; conservar la versión recibida sin sobrescribir una posterior; guardado transaccional; offset confirmado después de la escritura; repetición tras fallo sin aumentar el recuento (restricciones únicas + upsert); procesamiento al menos una vez con escritura idempotente (no se exige transacción distribuida). |
| MOD-04 | E | §12; Guía 2.2 | **Diccionario de datos** con significado, tipo/unidad y tratamiento de ausencias de los campos realmente usados. |
| MOD-05 | E | §12; Guía 2.3 | **Procedencia y registro de consultas**: conjunto, fuente, periodo y filtros, extracción (URLs/parámetros, nº de registros, fecha). |

### 2.5 Análisis y panel (ENUNCIADO §8; CONTRATO-API; FAQ 22–27)
| ID | Tipo | Fuente | Exigencia |
|---|---|---|---|
| ANA-01 | E | §8.1 | Mapa interactivo con fondo, fronteras, círculos y ficha; tamaño por magnitud, color por profundidad, leyenda y nulos visibles. |
| ANA-02 | E | §8.2 | Recuentos por país/subregión y por **ventanas fijas de una hora UTC** (tiempo del evento), con «Sin país asignado». |
| ANA-03 | E | §8.3 | Distribuciones de magnitud y profundidad indicando registros sin valor. |
| ANA-04 | E | §8.4 | **Comparación histórica** con los mismos filtros geográficos y de tipo; el denominador incluye días con cero eventos; aviso de periodo reciente incompleto. |
| ANA-05 | E | §8.5 | Filtros de fecha, magnitud y país/región, coherentes entre mapa y gráficos. |
| ANA-06 | E | §8.6 | Estado del sistema: último acceso correcto a la API, última ingesta correcta de USGS, periodo consultado, aviso de datos desactualizados o backend sin respuesta. |
| ANA-07 | E | §8.7 | Tabla consultable de eventos como alternativa al mapa y al color. |
| ANA-08 | E | §8 (revisiones) | Las revisiones recalculan las agregaciones (o se calculan desde el estado actual); no se incrementa un contador por mensaje. |
| ANA-09 | E | §8; §12; Guía 2.6 | **≥ 3 conclusiones fundamentadas** con cifras, filtros, periodo, ámbito y denominador, sobre muestras equivalentes, con capturas donde se reconozcan los filtros; sin presentarlas como predicción ni riesgo. |
| ANA-10 | E | §8 (inicio) | El panel consulta **la API**, no USGS directamente (FAQ 25). |

### 2.6 Contrato de la API (CONTRATO-API.md)
| ID | Tipo | Exigencia |
|---|---|---|
| API-01 | E | `GET /api/eventos`: HTTP 200 JSON `FeatureCollection`; sin eventos `features: []`; cada evento una vez con su versión actual; por defecto últimas 24 h; `metadata` con `generated`, `last_ingestion`, `mode`, `count`, `truncated`; coordenadas lon-lat-profundidad; fechas en ms UTC; `null` (nunca NaN/Infinity). |
| API-02 | E | Filtros `start` (inclusive), `end` (exclusivo), `min_mag`, `country_id`; magnitud nula no cumple `min_mag` y se cuenta aparte; truncado con `truncated: true`, total y paginación; el panel muestra el truncado y no calcula estadísticas globales sobre una muestra. |
| API-03 | E | `GET /api/salud` (estado y última ingesta, sin credenciales) y `GET /api/estadisticas` (recuentos por hora/país, distribuciones y comparación) con filtros equivalentes a los del mapa; cada resultado indica periodo, filtros, unidad y registros sin valor; si la BD falla, **error explícito** (no cero eventos). |
| API-04 | E | CORS en FastAPI (origen exacto de la web y `http://localhost:4200`; GET y OPTIONS; `ngrok-skip-browser-warning`); timeout y manejo de errores en el frontend; sin secretos en `config.json`. |

### 2.7 Complejidad, rendimiento y costes (ENUNCIADO §10; Guía 2.7; FAQ 33)
| ID | Tipo | Fuente | Exigencia |
|---|---|---|---|
| CPX-01 | E | §10 | Justificar **≥ 3 estructuras u operaciones** (búsqueda de versiones por id, integración geográfica, agregación por ventanas), distinguiendo coste medio y peor caso. |
| CPX-02 | E | §10 | Medir tiempo y memoria con **≥ 3 tamaños de entrada** (equipo, procedimiento, unidades); datos replicados marcados como sintéticos y fuera del análisis real; comparar búsqueda secuencial vs diccionario o consulta sin/con índice; razonar qué ocurriría con 100 millones de registros. |
| CPX-03 | E | §10 | Costes: hardware, electricidad, almacenamiento, transferencia, mantenimiento y tiempo de desarrollo; supuestos y propuesta de escalado; medidos vs supuestos (Guía 2.7). *(ROI: **[A]**; no inventar beneficios.)* |
| CPX-04 | E | Guía 2.7 | **Mejoras** ligadas a problemas concretos y a la situación en que se aplicarían. |

### 2.8 Pruebas de aceptación y reproducción histórica (ENUNCIADO §11; Guía 2.8–2.9; FAQ 32)
| ID | Tipo | Prueba (resultado esperado) |
|---|---|---|
| ACE-01 | E | Recibir un evento nuevo → una fila actual, visible en API, mapa y análisis. |
| ACE-02 | E | Reenviar la misma versión → no aumenta el número de terremotos. |
| ACE-03 | E | Recibir una versión posterior → cambian los datos actuales y las agregaciones afectadas. |
| ACE-04 | E | Recibir después una versión antigua → no sustituye a la más reciente. |
| ACE-05 | E | Magnitud nula → se conserva con tratamiento documentado y se visualiza como ND. |
| ACE-06 | E | Coordenadas inválidas → cuarentena y motivo; no aparecen puntos inventados. |
| ACE-07 | E | Evento marítimo → «Sin país asignado»; permanece en el análisis. |
| ACE-08 | E | Reiniciar el consumidor → reanuda sin duplicar efectos persistidos. |
| ACE-09 | E | Cerrar el túnel → el panel muestra el fallo y conserva/identifica la última lectura. |
| ACE-10 | E | Volver a abrir el túnel → se recuperan las consultas automáticamente. |
| ACE-11 | E | Reproducción histórica → procesa por Kafka sin mezclarla con datos live. |
| REP-01 | E | §11 (último párrafo); FAQ 32; Guía 2.9: reproducción **acelerada** de una selección histórica ordenada por fecha; tiempo original + tiempo de reproducción; topic y esquema/tablas separados (o aislamiento equivalente); etiqueta **«REPRODUCCIÓN» obligatoria**; reutiliza el procesamiento del consumidor; casos controlados de duplicado y revisión; en el panel, consultar el intervalo histórico correspondiente (sin alterar fechas). |
| REP-02 | E | Guía 2.9: documentar la selección y cómo se obtuvo, cómo iniciarla y a qué velocidad, cómo se separa de lo actual, cómo se identifica en el panel, qué resultados se esperan y qué ocurrió al probarlo. |
| ACE-00 | E | Guía 2.8: cada prueba con resultado esperado, **observado** y evidencia; «no marques una prueba como superada porque el comportamiento esté programado: ejecútala y registra lo que ocurre»; cómo repetirla. |

### 2.9 Entregables (ENUNCIADO §12; Guía 1–3 y «Organización sugerida»)
| ID | Tipo | Entregable | Observación |
|---|---|---|---|
| ENT-01 | E | **Repositorio** con código de productor, consumidor, API y frontend (+ cargas histórica y replay), Dockerfile(s), `compose.yaml` con los cinco servicios, dependencias (`requirements*.txt`; `package.json` con lock), `.env.example`, SQL, instrucciones reproducibles. | Guía 1.1–1.3. Distinguir material reutilizado del desarrollado (Guía 1.1). |
| ENT-02 | E | **README reproducible** (Guía 1.4): requisitos y versiones; crear configuración desde `.env.example`; construir y arrancar; crear tablas y cargar histórico; estado y logs; frontend en desarrollo y publicación; activar ngrok y configurar la URL; ejecutar pruebas y replay; detener y qué datos se conservan. | La Guía llama «README.md» a este bloque; la organización sugerida lo describe como «presentación, enlaces y pasos para ejecutar y demostrar». |
| ENT-03 | E | Sin `node_modules`, credenciales, volúmenes binarios ni grandes descargas en Git; datos originales en ubicación documentada con **procedimiento para regenerarlos**. | §12 (último párrafo); Guía 1.4. |
| ENT-04 | E | **Memoria o notebook** (Guía 2.1–2.9): objetivo y funcionamiento y decisiones de alcance (2.1); diccionario (2.2); procedencia y consultas (2.3); calidad (2.4); modelo y SQL/índices (2.5); análisis y ≥ 3 conclusiones con capturas (2.6); complejidad, mediciones, costes y mejoras (2.7); evidencias de pruebas (2.8); reproducción histórica (2.9). | Decisión: **`docs/entrega/memoria.md`** (CA-07, resuelta). Puede enlazar diagramas, SQL, capturas y evidencias. |
| ENT-05 | E | **URL del panel** en Netlify, comprobada desde otro dispositivo; el frontend usa la API (HTTPS de ngrok), no USGS. | Guía 3.1; lista final 12. |
| ENT-06 | E | **Procedimiento para activar el sistema** (5 pasos de Guía 3.2). | Ver §1.2. |
| ENT-07 | E | **Explicación individual** del flujo completo y de una decisión técnica propia. | Ver §1.2 (vídeo). |
| ENT-08 | R | Evidencias en `docs/evidencias/`, `sql/`, README con indicación de dónde está cada evidencia; «preferible una memoria clara con enlaces a repetir contenido». | Guía, organización sugerida. |
| ENT-09 | E | **Acceso del profesor al repositorio** (privado). | Guía 1 (primera línea) y lista final 1. |

## 3. Rúbrica de evaluación (ENUNCIADO §13; FAQ 34)

| Criterio | Insuficiente (0–4) | Suficiente (5–6) | Notable (7–8) | Sobresaliente (9–10) | Evidencias concretas (§13 / FAQ 34) |
|---|---|---|---|---|---|
| **EVA-1 Extracción** | No carga datos | Carga básica | Carga + exploración | Carga + análisis de tipos | Histórico, feed y catálogo; tipos, unidades, límites y automatización / archivos descargados, consulta usada, tabla de tipos y unidades |
| **EVA-2 Calidad** | No analiza | Análisis parcial | 4+ dimensiones | Completo + acciones | Apartado en memoria o notebook con comprobaciones de las dimensiones, antes/después, acciones justificadas y limitaciones; **no** se exige automatizar el informe |
| **EVA-3 Modelado** | No combina | Join básico | Modelo correcto | Modelo optimizado | Integración geográfica, grano y claves, revisiones, idempotencia y optimización / diagrama, claves, integración por país y prueba de revisión sin duplicar |
| **EVA-4 Análisis** | No realiza | 1–2 análisis | 3+ análisis | Análisis + insights | Ventanas, distribuciones, comparación equivalente y conclusiones / resultados por ventanas, distribuciones, comparación y tres conclusiones |
| **EVA-5 Reflexión** | No reflexiona | Reflexión básica | Buena reflexión | Excelente + propuestas | Complejidad, memoria, escalado, costes, limitaciones y mejoras / mediciones, complejidad, costes, limitaciones y mejoras |

Observaciones normativas (§13): «El uso del mapa entregado no sustituye las evidencias anteriores. No se exige desarrollar un motor cartográfico desde cero ni obtener mejores calificaciones mediante más complejidad de infraestructura.» Los porcentajes generales (test 30 %, ejercicio práctico 50 %, mini-ETL 20 %) no se modifican (§1). La Guía (final): «Se valora que el sistema funcione, que las evidencias sean comprobables y que puedas justificar las decisiones; no la cantidad de documentos ni su extensión.»

## 4. Lista final de comprobación (Guía, «Lista final de comprobación»; 13 puntos)

| ID | Punto literal | Notas de adaptación |
|---|---|---|
| LF-01 | El profesor puede acceder al repositorio. | Repositorio privado; ver CA-05. |
| LF-02 | El README permite arrancar el sistema desde un entorno limpio con los requisitos indicados. | — |
| LF-03 | Los cinco servicios obligatorios están definidos en Docker Compose. | — |
| LF-04 | He incluido dependencias, Dockerfile(s), SQL y `.env.example` sin credenciales reales. | — |
| LF-05 | He documentado campos, unidades, fuentes, filtros y consultas de extracción. | Diccionario y procedencia (MOD-04/05). |
| LF-06 | El apartado de calidad contiene código o consultas, resultados y decisiones justificadas. | — |
| LF-07 | El modelo explica entidades, tablas, claves, tipos e índices. | — |
| LF-08 | Presento al menos tres conclusiones con resultados y filtros identificables. | — |
| LF-09 | Incluyo mediciones con tres tamaños, análisis de complejidad, costes y mejoras. | — |
| LF-10 | He ejecutado las pruebas de aceptación y guardado evidencias. | — |
| LF-11 | Puedo activar la reproducción histórica sin mezclarla con datos actuales. | — |
| LF-12 | La URL de Netlify funciona y sé activar el backend y el túnel durante la defensa. | «Defensa» → ventana de evaluación y vídeo (§1.2). |
| LF-13 | Puedo explicar individualmente el flujo completo y una decisión técnica propia. | «Explicación oral» → bloque del vídeo (§1.2). |

**FAQ 35** repite una lista de 13 comprobaciones previas a la entrega; añade a la Guía estos puntos propios: datos reales con procedencia y originales conservados (FQ-02); la base conserva los datos al reiniciar (FQ-04); registros sin país y nulos tratados de forma justificada (FQ-05); la API consulta PostgreSQL y Angular consulta esa API (FQ-06); mapa, tabla y estadísticas con filtros coherentes (FQ-07); comparación con los mismos filtros y periodos comparables (FQ-08); panel abierto desde otro dispositivo con el túnel activo (FQ-09); si la API falla, el panel lo indica y no presenta datos antiguos como recién obtenidos (FQ-10); la reproducción está aislada y etiquetada (FQ-11); apartado de calidad, modelo, análisis, mediciones y costes (FQ-12); explicar un evento de principio a fin y una decisión propia (FQ-13). El resto (FQ-01 cinco servicios con Compose; FQ-03 repetir mensaje/revisión antigua) coincide con puntos de la Guía.

## 5. Revisión autónoma de la web y del repositorio (requisitos derivados [D])

No figuran en los materiales; se derivan de lo comunicado en clase y de Guía 1 y 3.1. Se registran como requisitos de esta fase:

| ID | Tipo | Requisito |
|---|---|---|
| WEB-01 | D | El profesor puede abrir la **aplicación publicada** desde el enlace de entrega, navegar por las secciones, usar las funcionalidades, ver datos y resultados y comprobar que funciona **sin depender del ordenador del alumno más allá de la API y el túnel** (arquitectura obligatoria §2/§9). |
| WEB-02 | D | La web publicada debe corresponder a la **versión que se entrega** (hoy: local = Netlify = F7 + mejoras 8.6 del 2026-11-15, despliegue `6afa2ccf…`, commit `2616aec`). |
| WEB-03 | D | **Ventana de evaluación** (~2 días): PC encendido y sin suspensión, Docker, Kafka, PostgreSQL, productor, consumidor y API operativos, túnel activo, frontend publicado y **credencial** entregada al profesor por un canal privado (T037–T039). Mantener el PC encendido **no** equivale a SC-010. |
| WEB-04 | E+D | La API publicada debe tratar el fallo de conexión con claridad (ACE-09/10, FAQ 31/35). |
| REPO-01 | D | El profesor revisa el **repositorio privado** por su cuenta: código completo y organizado, README definitivo, memoria independiente, arquitectura y decisiones técnicas, pruebas y resultados, evidencias verificables, instrucciones, correspondencia con la rúbrica y limitaciones explicadas. |
| REPO-02 | E+D | Sin secretos ni `.env` en el repositorio ni en su historial (ENT-03; reglas de seguridad de `CLAUDE.md`); permisos del profesor verificados **antes** de entregar, sin modificarlos ni hacer público el repositorio sin decisión expresa (CA-05). |

## 6. Obligaciones que NO son exigencias (para no sobrecumplir ni confundir)

Según los propios textos: informe de calidad automático, archivo de calidad separado o panel de calidad en Angular (§6; Guía 2.4; FAQ 17); reconciliación exhaustiva de eventos eliminados o revisados fuera del feed (§5); ROI (§10); Spark/Flink/Kubernetes/ML o servidor cloud permanente (§2); disponibilidad 24/7 (§9; FAQ 31); motor cartográfico propio y «más complejidad de infraestructura» (§13); el número o la extensión de los documentos (Guía, final). El alcance 2025 / mundial / M ≥ 4 del histórico es **propuesta de partida**, no obligación (§4.2).

## 7. Reglas propias del proyecto que condicionan la entrega (no son del profesor)

`CLAUDE.md`: tecnologías obligatorias (Python, aiokafka, Kafka, PostgreSQL, FastAPI, Angular, Leaflet, Docker Compose, ngrok, Netlify); sin Spark/Flink/Kubernetes/ML; datos reales/históricos/replay separados; no inventar datos ni resultados; commits y push **solo con autorización**; no exponer Kafka ni PostgreSQL; no subir credenciales. Autorizaciones vigentes de F8: **PA-10** (SC-010), **PA-11** (volúmenes temporales), Netlify y ngrok solo con permiso expreso. El proyecto añadió el modo local seguro (proxy de desarrollo con clave en servidor), que no forma parte de los requisitos del profesor.

## 8. Aclaraciones CA-01 a CA-08 (estado a 2026-11-11)

| CA | Asunto | Estado | Qué falta |
|---|---|---|---|
| CA-01 | Formato: vídeo + web + repositorio, sin defensa ni preguntas | **Confirmada en clase** | Archivar una fuente escrita si existe (texto, medio y fecha). Los documentos originales siguen mencionando la defensa. |
| CA-02 | Fecha límite y canal de entrega | **Pendiente** | Fecha, hora y vía. |
| CA-03 | Requisitos del vídeo (duración, formato, resolución, idioma, cámara/pantalla, plataforma, archivo/enlace) | **Parcial**: el profesor indicó (apuntes de la persona estudiante, sin confirmar por escrito) **máximo 5 min**, siguiendo el orden de la rúbrica y mostrando evidencias del nivel más alto; resto pendiente (formato, cámara, plataforma) | Confirmación; el guion es personal y no asume cifras. |
| CA-04 | Rúbrica específica del vídeo | **Pendiente** | Mientras tanto se usa la rúbrica de ENUNCIADO §13. |
| CA-05 | Acceso al repositorio privado | **Pendiente** | Usuario/correo del profesor y verificación de permisos antes de entregar. |
| CA-06 | Acceso a la web y ventana de evaluación | **Parcialmente resuelta** | Fechas de la ventana, URL definitiva, estrategia segura de publicación de F7, entrega privada de credenciales. |
| CA-07 | Formato de la memoria | **Resuelta**: `docs/entrega/memoria.md` | — |
| CA-08 | Sustituto de la explicación individual | **Resuelta en lo práctico**: bloque del vídeo | Solo confirmación formal adicional. |

## 9. Observaciones de la auditoría de fuentes
1. **La Guía llama «README.md» al bloque de instrucciones reproducibles** (1.4), mientras la «organización sugerida» lo define como presentación y pasos; el README definitivo cubre ambos y **enlaza** a la memoria para el detalle técnico (sin duplicar).
2. **Fecha de las fuentes**: ENUNCIADO rev. 2 (27 oct 2026). Las fuentes originales no se han modificado desde la reorganización inicial (`git log` de `docs/referencias`: dos commits `chore`).
3. **Menciones a «defensa»** dispersas (ENUNCIADO §12; Guía 3.2, 3.3, lista final 12–13; FAQ 31, 32, 35, «Documentos de referencia»): se tratan según §1.2; no se editan.
4. **Documentos de F3–F6** hablan de «defensa» y de «F7 (memoria)»: son históricos (`specs/INDICE.md`); no se reescriben.
