# Guion del vídeo de demostración (F8 · 8.4 · T018)

**Estado**: guion **listo para ensayar y grabar** (preparado el 2026-11-11). **El vídeo no está grabado**: lo graba la persona estudiante con OBS. Este guion **no contiene ninguna cifra en vivo ni resultado inventado**: lo que se cita está fechado y enlazado a su evidencia; lo dinámico se **lee en pantalla** en el momento de grabar.

**Lo que NO se conoce todavía (CA-03)**: duración máxima, formato, resolución, idioma, si debe aparecer la persona estudiante, si se entrega archivo o enlace y la fecha/canal exactos. Por eso el guion es **modular**: una versión completa (≈ 29 min) y una **versión corta (≈ 18 min)** con las escenas marcadas **★**. Se ajusta cuando el profesor confirme requisitos.

**Códigos**: V0–V10 son los bloques de la matriz (`matriz-trazabilidad.md`); R = apartado del README; M = apartado de `memoria.md`. «Rúbrica» = `ENUNCIADO.md` §13; «Pruebas» = §11; «Entregables» = §12.

---

## 0. Cómo usar este guion

1. **Lee primero** las secciones 1 y 2 (qué se demuestra y qué se deja en la documentación) y la 7 (reservas que **no** debes presentar como superadas).
2. **Ensaya** cada escena en voz alta con el panel y el terminal abiertos (los comandos del guion se han comprobado en solo lectura el 2026-11-11, ver sección 8).
3. **Graba por escenas** (una toma por escena, con pausa entre ellas): si falla una, se repite solo esa. Nombra cada archivo `V1-arquitectura.mkv`, `V2-extraccion.mkv`…
4. **Habla con tus palabras**: «Qué explicar» son ideas, no un texto para leer. «Datos que puedes citar» son hechos comprobados con su fuente; no los apliques a lo que ves en directo.
5. **No muestres**: la clave de la API, el contenido de `.env`, el authtoken o la URL de ngrok, el inspector `127.0.0.1:4040`, el panel de Netlify con variables, notificaciones, tu usuario o rutas personales (`checklist-grabacion.md`).
6. Si algo falla en directo, **no lo ocultes**: explícalo y continúa; el tratamiento del error es parte de lo que se evalúa (`ENUNCIADO.md` §9).

## 1. Qué se demuestra visualmente y qué se justifica con documentación

| Criterio / requisito | Se **demuestra en pantalla** (escenas) | Se **justifica** con código, pruebas o documentación (enlace) |
|---|---|---|
| **Extracción** (rúbrica) | V2: consultas del feed cada 60 s en `live.consulta_extraccion`, recuentos del histórico (18 302) y del catálogo, tipos y unidades | M2 (diccionario), M3 (procedencia), `f3/3.2-ingesta.txt`, `f4/4.4-carga-real.txt` |
| **Calidad** (rúbrica) | V3: cuarentena con motivo, nulos conservados («ND»), reglas | M4 (seis dimensiones, antes/después, código y consultas, registros), `f4/4.6-calidad.txt` |
| **Modelado** (rúbrica) | V4: esquema, claves, versión y estado actual, aislamiento, integración geográfica | M5, `sql/001`–`004`, `f5/5.7-explain.txt` (índices) |
| **Análisis** (rúbrica) | V5: Análisis, filtros, comparación con 2025 y las tres conclusiones | M6, `f5/conclusiones.md` |
| **Reflexión** (rúbrica) | V8: complejidad, mediciones con tres tamaños, costes, mejoras | M7, `f6/6.4-mediciones.txt`, `f6/complejidad-costes.md` |
| **Panel** (`ENUNCIADO.md` §8, 7 elementos) | V5: mapa (globo 3D y 2D) con fichas, tamaño/color/leyenda y «ND»; recuentos por país y por hora UTC; distribuciones; comparación histórica; filtros; estado del sistema; tabla | R5, M1.4 |
| **Pruebas de aceptación** (§11, 11 filas) | V6 y V7: REPRODUCCIÓN (duplicado, versión posterior, versión antigua, magnitud nula, coordenadas inválidas, marítimo), cerrar y reabrir el túnel | M8 y `f6/6.3-aceptacion.md`; **reiniciar consumidor** y huecos: evidencia (no se mata el consumidor en directo) |
| **Reproducción histórica** (§11) | V6: etiqueta «REPRODUCCIÓN», ejecución, aislamiento | M9, `f6/6.3-aceptacion.md` §8 |
| **Arquitectura y despliegue** (§2, §9) | V1: cinco servicios `healthy`, solo la API publicada, flujo, túnel y Netlify | `compose.yaml`, R4, `f6/aislamiento.txt` |
| **Explicación del flujo y de una decisión propia** (Guía 3.3, CA-08) | V9 | M10.1 |
| Dockerfile(s), dependencias, `.env.example`, README reproducible | V10 (se señala dónde está) | README, `backend/Dockerfile`, `.env.example`; **entorno limpio sin repetir en F8** (sección 7) |

## 2. Mapa de escenas y tiempos

| Escena | Bloque | Qué es | Min. | Acum. | Versión corta |
|---|---|---|---:|---:|:---:|
| 1 | **V0** | Introducción y qué se evalúa | 1,0 | 1,0 | ★ (0,5) |
| 2 | **V1** | Arquitectura y flujo | 2,5 | 3,5 | ★ (1,5) |
| 3 | **V2** | Extracción: feed, histórico, catálogo | 2,5 | 6,0 | ★ (1,5) |
| 4 | **V3** | Calidad de datos | 3,0 | 9,0 | ★ (2,0) |
| 5 | **V4** | Modelado, versiones e idempotencia | 3,0 | 12,0 | ★ (2,0) |
| 6 | **V5** | Recorrido del panel (Panel · Análisis · Eventos) | 3,5 | 15,5 | ★ (3,0) |
| 7 | **V6** | EN VIVO y REPRODUCCIÓN | 2,5 | 18,0 | ★ (1,5) |
| 8 | **V7** | Pruebas de aceptación y recuperación de fallos | 4,0 | 22,0 | ★ (2,5) |
| 9 | **V8** | Complejidad, costes y reflexión | 3,0 | 25,0 | ★ (1,5) |
| 10 | **V9** | Flujo completo y decisión técnica propia | 2,5 | 27,5 | ★ (1,5) |
| 11 | **V10** | Cierre: acceso, web, repositorio y límites | 1,5 | 29,0 | ★ (1,0) |
| | | **Total** | **29,0** | | **≈ 18,5** |

Los tiempos son **orientativos**; cuando se grabe, se anotarán los minutos reales en la matriz (T019).

---

## 3. Preparación común (una vez, antes de empezar)
- **Ventanas** (cada una capturable por separado en OBS): ① **Navegador** con la web pública `https://observatorio-sismico.netlify.app` (zoom 100–110 %); ② **Terminal** en la raíz del proyecto con letra grande y prompt corto; ③ **Documentos** (README y `memoria.md` visualizados, no en bruto); ④ ngrok y el panel de Netlify **fuera de captura**.
- **Estado del sistema**: cinco servicios `healthy`, ingesta al día («hace < 60 s»), 0 huecos pendientes, túnel abierto, la web sirve F7 (no mantenimiento) y carga sin pedir clave. Detalle en `checklist-grabacion.md`.
- **Orden de comandos** (todos de **solo lectura**, comprobados): en la sección 8.

---

## 4. Escenas

### Escena 1 · V0 — Introducción y qué se evalúa · ≈ 1,0 min ★
- **Rúbrica/requisito**: contexto (`ENUNCIADO.md` §1) y orientación del evaluador.
- **Pantalla**: README (arriba: título y estado) y la tabla «Cumplimiento de la rúbrica» (R9, README §16).
- **Acciones**: mostrar el título; desplazarse a la tabla de criterios → memoria → vídeo.
- **Qué explicar**: quién eres y qué es el proyecto (observatorio de actividad sísmica que combina el histórico de 2025, el feed reciente de USGS y un catálogo geográfico); que el vídeo sigue los **cinco criterios** (extracción, calidad, modelado, análisis, reflexión) y las **pruebas de aceptación y la reproducción histórica**; que **las cifras en vivo cambian** y que lo fijo está en la memoria.
- **Datos que puedes citar**: ninguno en vivo.
- **Si falla**: usar `memoria.md` §1 en lugar del README.

### Escena 2 · V1 — Arquitectura y flujo · ≈ 2,5 min ★
- **Rúbrica/requisito**: arquitectura obligatoria (`ENUNCIADO.md` §2) y despliegue (§9); Guía 1.2 (cinco servicios).
- **Pantalla**: diagrama de arquitectura (README §3 o `memoria.md` §1.3) → `compose.yaml` → terminal.
- **Acciones**: 1) mostrar el diagrama; 2) abrir `compose.yaml` y señalar los cinco servicios; 3) en el terminal `docker compose ps`; 4) señalar el puerto de la API.
- **Qué explicar**: el recorrido **USGS → productor (aiokafka) → Kafka → consumidor → PostgreSQL → API (FastAPI) → panel (Angular)**; qué hace cada pieza en una frase; por qué Kafka (desacopla, reintenta, conserva el offset); que **solo la API se publica** (`127.0.0.1:8000`) y por ngrok; que Netlify sirve el panel y **una función de Netlify añade la clave en el servidor**, de modo que el visitante no la escribe y FastAPI sigue exigiéndola.
- **Datos que puedes citar**: cinco servicios con `healthcheck` y `restart: unless-stopped`; Kafka y PostgreSQL sin puertos en el equipo (`f6/aislamiento.txt`); retención de Kafka 24 h/100 MiB por partición.
- **Comando**: `docker compose ps`.
- **Si falla**: si el diagrama Mermaid no se renderiza (R9), usar la figura de la memoria o explicar sobre `compose.yaml`.

### Escena 3 · V2 — Extracción: feed, histórico y catálogo · ≈ 2,5 min ★
- **Rúbrica/requisito**: **Extracción** (carga + exploración + análisis de tipos); `ENUNCIADO.md` §4–§5; Guía 2.2–2.3.
- **Pantalla**: `memoria.md` §2.1 (campos, tipos y unidades) y §3.1 (tres conjuntos) → terminal con consultas de la sección 8.
- **Acciones**: 1) mostrar la tabla de campos del feed (id, `time` y `updated` en ms Unix UTC, magnitud, `magType`, `type`, `place`, longitud/latitud/profundidad); 2) en el terminal, las **últimas consultas** de `live.consulta_extraccion`; 3) los **recuentos** del histórico y del catálogo.
- **Qué explicar**: **tres fuentes**: el feed `all_day` (ventana móvil de 24 h, una consulta cada 60 s con reintentos y registro de cada intento), el **histórico de 2025** (M ≥ 4, cargado por meses y verificado con el `count` de USGS) y el **catálogo Natural Earth**; que cada consulta guarda duración, estado HTTP y cuántas versiones **publicó o descartó** (`publicadas`/`omitidas`); que el histórico se carga **sin Kafka** (es una instantánea) y la reproducción **sí** pasa por Kafka; unidades y conversiones (ms → UTC; coordenadas lon, lat, profundidad en km).
- **Datos que puedes citar (con fuente)**: histórico 2025: **18 302 eventos**, 12 de 12 meses coinciden con el `count` de USGS, 24 peticiones, 0 duplicados (`f4/4.4-carga-real.txt`, 2026-11-07); ejecución continua: 30/30 consultas con separación de 60,0 s (`f3/3.7-ejecucion-continua.txt`).
- **Cifras en vivo**: lee de la pantalla las últimas consultas y los recuentos; **no** uses números de este guion.
- **Si falla**: mostrar `f4/4.4-carga-real.txt` y `f3/3.2-ingesta.txt`.

### Escena 4 · V3 — Calidad de los datos · ≈ 3,0 min ★
- **Rúbrica/requisito**: **Calidad** (4+ dimensiones, acciones justificadas); `ENUNCIADO.md` §6; Guía 2.4.
- **Pantalla**: `memoria.md` §4 (reglas, seis dimensiones, antes/después) → terminal → panel con una magnitud «ND».
- **Acciones**: 1) mostrar las **reglas del consumidor** (§4.2) y la tabla antes/después (§4.5); 2) en el terminal, la **cuarentena por motivo** y el recuento de magnitudes nulas; 3) (opcional) en REPRODUCCIÓN, el caso controlado con magnitud nula mostrado como «ND».
- **Qué explicar**: las **seis dimensiones** (completitud, unicidad, validez, consistencia, actualidad, exactitud) evaluadas sobre el histórico; las **reglas** y por qué: solo `earthquake` pasa; **explosiones y canteras van a cuarentena con motivo** (no se borran); coordenadas fuera de rango → cuarentena y **no se inventan puntos**; una **magnitud nula se conserva** (no se rellena con cero) y se muestra «ND»; fechas a UTC separando tiempo del evento y tiempo de ingesta; limitaciones (USGS, mapa simplificado).
- **Datos que puedes citar**: denominador del histórico 18 302; exactitud 40/40 comprobada (`f4/4.6-calidad.txt`); muestra del feed del 2026-11-06 (198 eventos); **discrepancia 197/198** documentada sin causa atribuida (sección 7).
- **Si falla**: usar las tablas de la memoria; no improvisar cifras.

### Escena 5 · V4 — Modelado, versiones e idempotencia · ≈ 3,0 min ★
- **Rúbrica/requisito**: **Modelado** (integración geográfica, grano y claves, revisiones, idempotencia, optimización); `ENUNCIADO.md` §7; Guía 2.5.
- **Pantalla**: figura conceptual/lógica de `memoria.md` §5 → terminal (`\dt` y `\d live.evento_actual`) → ficheros `sql/`.
- **Acciones**: 1) mostrar el modelo y las claves; 2) listar las tablas de `live`; 3) describir `live.evento_actual`; 4) señalar un índice y la justificación (§5.5).
- **Qué explicar**: **una versión por fila** en `evento_version` (clave `(event_id, updated_at)`) y **el estado actual** en `evento_actual` (clave `event_id`), que solo avanza si llega un `updated` mayor; versión y estado se guardan **en una sola transacción**; esquemas **aislados** (`live`, `historico`, `replay`, `geo`) **sin claves foráneas entre datos** y con `CHECK` de modo; asignación de país por **punto en polígono** con Natural Earth y categoría «**Sin país asignado**» (nunca el país más cercano); índices elegidos y su efecto medido.
- **Datos que puedes citar**: `f5/5.7-explain.txt` (planes con y sin índice); `f4/regla-geografica.md`.
- **Si falla**: mostrar los scripts `sql/001_esquema_live.sql` y `002_esquema_f3.sql`.

### Escena 6 · V5 — Recorrido del panel · ≈ 3,5 min ★
- **Rúbrica/requisito**: **Análisis**; `ENUNCIADO.md` §8 (los **7 elementos** del panel) y las tres conclusiones; Guía 2.6.
- **Pantalla**: navegador en la web pública, **sin clave**.
- **Acciones** (en este orden): 1) **Panel**: tarjetas y estado; **globo 3D** (girar, seleccionar un evento y leer su ficha; leyenda de profundidad y tamaño por magnitud); botón **«Mapa 2D»** (Leaflet) y volver; 2) **filtros**: «Mostrar filtros» → magnitud mínima 4,5 → Aplicar; cambiar a 7 días; elegir un país; **«Restablecer»**; fijarse en que **mapa, tabla y estadísticas coinciden**; 3) **Análisis**: eventos por hora UTC, por país (con «Sin país asignado»), distribuciones de magnitud y profundidad con «sin valor», **comparación con la media diaria de 2025** y estado del sistema; 4) **Eventos**: buscar («Alaska»), ordenar, abrir un evento, «Ver en el mapa».
- **Qué explicar**: que **el panel consulta nuestra API, no USGS**; que las gráficas las calcula la API sobre **el periodo completo**, no solo lo cargado; la comparación usa **mismo ámbito y misma magnitud** y avisa de que el periodo reciente puede estar incompleto; que **el refresco automático es de 60 s** (indicador del panel) y hay actualización manual.
- **Las tres conclusiones** (del periodo fijo 5–7 nov 2026; `f5/conclusiones.md`; **no se recalculan** con terremotos nuevos): ① **17 de 22 (77,3 %)** de los M ≥ 4,5 recientes son «Sin país asignado» (82,7 % en 2025; diferencia no concluyente); ② **22** terremotos de M ≥ 4,5 en ≈ 2,04 días (10,8/día) frente a **23,45** de media diaria de 2025: el recuento reciente es bajo pero **no demuestra un descenso real** (muestra de ≈ 2 días, réplicas); ③ por debajo de M 4,5 el feed recoge **menos** que el histórico (banda 4,0–4,5: 29,0 % frente a 53,2 %): **diferencia de cobertura**, no de actividad. Muéstralas con sus filtros (capturas C-05 a C-07). **No son predicción ni evaluación de riesgo.**
- **Cifras en vivo**: las que veas en pantalla; no las ligues a las conclusiones.
- **Si falla**: usar capturas C-05 a C-07 o el modo REPRODUCCIÓN (datos fijos).

### Escena 7 · V6 — EN VIVO y REPRODUCCIÓN · ≈ 2,5 min ★
- **Rúbrica/requisito**: **Reproducción histórica** y actividad para la demostración (`ENUNCIADO.md` §11; FAQ 32).
- **Pantalla**: navegador, selector de modo del Panel.
- **Acciones**: 1) en **EN VIVO**, señalar la etiqueta y el estado; 2) cambiar a **REPRODUCCIÓN** (etiqueta violeta, ejecución, velocidad); 3) ver los **casos controlados** (identificados como «caso controlado / sintético»); 4) abrir Análisis y Eventos en este modo; 5) volver a EN VIVO.
- **Qué explicar**: la reproducción es una **selección histórica ordenada por fecha** que circula por **Kafka** con **topic y esquema propios**, con tiempo original y tiempo de reproducción; **no se mezcla con EN VIVO** (los recuentos cambian al cambiar de modo y el panel avisa de que «no es actividad actual»); en este modo la comparación con 2025 «no aplica».
- **Datos que puedes citar**: ejecución `r-f6-estab-11082023` (×31,9, **35** eventos); la ejecución de pruebas `r-f6-prueba-b`: **39 mensajes → 35 eventos actuales, 37 versiones, 1 cuarentena y 1 reenvío descartado** (`f6/6.3-aceptacion.md`, 2026-11-08).
- **Opcional (genera una ejecución nueva y persistente en el esquema `replay`; solo si decides hacerlo)**: `docker compose run --rm --no-deps producer python -m observatorio.replay.reproducir --solo-plan` (muestra el plan, **no** publica). Lanzar una ejecución nueva dura ≈ 76 s (`memoria.md` §9.2).
- **Si falla**: usar una ejecución ya existente; no hace falta lanzar otra.

### Escena 8 · V7 — Pruebas de aceptación y recuperación de fallos · ≈ 4,0 min ★
- **Rúbrica/requisito**: las **11 pruebas** de `ENUNCIADO.md` §11; Guía 2.8; FAQ 31.
- **Pantalla**: tabla de `memoria.md` §8 → panel en REPRODUCCIÓN (casos) → terminal → panel con el túnel.
- **Acciones**:
  1. **Tabla de pruebas** (§8): recorrer las filas y decir, para cada una, qué se espera y dónde está la evidencia.
  2. **Casos controlados en el panel** (REPRODUCCIÓN): duplicado (no suma), versión posterior (4,7 → 4,8), versión antigua (conserva 5,2), magnitud nula («ND»), coordenadas inválidas (**no aparece en el mapa**; está en cuarentena con motivo), evento marítimo («Sin país asignado», cuenta en el análisis).
  3. **Cerrar el túnel** (**fuera de captura**, en la ventana de ngrok con `Ctrl+C`) → en el panel pulsa **«Actualizar ahora»**: aparece «**Sin conexión con la API**», se **conservan los últimos datos** marcados como posiblemente desactualizados y **no se piden claves**. **Reabrir el túnel** (fuera de captura): el panel **se recupera solo** («Conexión recuperada») en menos de ≈ 30 s con la pestaña visible.
  4. **Huecos de ingesta** (opcional): `docker compose run --rm --no-deps producer python -m observatorio.recuperacion.recuperar --listar` (solo lista); explicar el **caso real #475** (el equipo estuvo apagado ≈ 19,6 h; 9 versiones publicadas, 8 guardadas y 1 explosión en cuarentena; `f4/recuperacion-hueco-475.md`).
  5. **Reiniciar consumidor**: **no se mata el consumidor en directo**; mostrar la **evidencia** (lag 0 → 7 → 0 en ≈ 10 s sin duplicados, `f6/6.8-consumidor.txt`) y las pruebas de atomicidad, y **decir la reserva** (sección 7).
- **Qué explicar**: que el sistema **tolera la caída del túnel, del consumidor y de la fuente** y lo muestra con claridad; que **recuperar un hueco** usa el catálogo histórico de USGS y omite lo ya guardado.
- **Si falla**: si el panel no se recupera, esperar el siguiente reintento (≈ 30 s) y, si no, abrir `f6/6.6-tunel.md`.

### Escena 9 · V8 — Complejidad, costes y reflexión · ≈ 3,0 min ★
- **Rúbrica/requisito**: **Reflexión** (complejidad, escalado, costes, limitaciones, mejoras); `ENUNCIADO.md` §10; Guía 2.7; FAQ 33.
- **Pantalla**: `memoria.md` §7 (tablas de complejidad, mediciones, proyección, costes y mejoras).
- **Acciones**: mostrar §7.1 (tres operaciones: búsqueda por id, integración geográfica, agregación por ventanas, con coste medio y peor caso), §7.2 (tabla con 1 000, 10 000 y 100 000), §7.3 (proyección), §7.4 (costes) y §7.5 (mejoras).
- **Qué explicar**: la búsqueda por identificador es **O(log n)** con índice y **O(n)** sin él; la integración geográfica crece **linealmente** con el lote; la medición se hizo en **una sola máquina**; la **proyección a 10⁸ registros es un modelo calibrado, no una medición**; los **costes son hipotéticos** (precio, vatios y tarifa son supuestos etiquetados `[SUPUESTO]`; el euro/hora del estudiante no se monetiza); las **mejoras** propuestas están ligadas a problemas concretos (paginación por clave, compresión de respuestas, etc.).
- **Datos que puedes citar**: búsqueda por id ≈ 0,13 ms con 10³, 10⁴ y 10⁵ filas (con índice); geografía ≈ 9–10 ms, 91 ms y ≈ 910 ms para lotes de 10³, 10⁴ y 10⁵ **[MEDIDO]** (`f6/6.4-mediciones.txt`, 2026-11-08, equipo descrito en la memoria).
- **Si falla**: leer los datos de la memoria; no dar cifras de memoria sin mirarlas.

### Escena 10 · V9 — Flujo completo y decisión técnica propia · ≈ 2,5 min ★
- **Rúbrica/requisito**: explicación individual (Guía 3.3; `ENUNCIADO.md` §12; CA-08).
- **Pantalla**: el diagrama de la escena 2 o un evento real en el panel con su ficha; luego `memoria.md` §10.1.
- **Acciones**: seguir **un evento** desde USGS hasta el panel: aparece en el feed → el productor lo compara con `live.version_publicada` y lo publica en Kafka → el consumidor lo valida, asigna país y guarda **versión y estado actual en una transacción** → confirma el offset **después** de guardar → la API lo sirve → el panel lo dibuja y lo cuenta.
- **Qué explicar** (con tus palabras; **tu decisión propia**, sugerida por el proyecto, cámbiala si prefieres otra): **«confirmamos el offset después de guardar en PostgreSQL»**. Si el proceso se interrumpe y Kafka vuelve a entregar el mensaje, las restricciones únicas y la escritura idempotente (`ON CONFLICT`) evitan duplicar; el coste es entrega «al menos una vez» en vez de «exactamente una» (sin transacción distribuida). Otras decisiones válidas: aislar replay/histórico/live con esquemas sin claves foráneas; errores permanentes a cuarentena y transitorios con reintento.
- **Datos que puedes citar**: `f3/3.4-atomicidad*.txt`, `f3/3.4-idempotencia.txt`.
- **Si falla**: apoyarte en `memoria.md` §10.1.

### Escena 11 · V10 — Cierre: acceso, web publicada y límites · ≈ 1,5 min ★
- **Rúbrica/requisito**: entregables §12; Guía 3.1–3.2 (URL y procedimiento de activación).
- **Pantalla**: README (§15 «Cómo usar y demostrar» y §14 «Seguridad y límites») y, si quieres, el panel.
- **Acciones**: mostrar la URL de la web, el procedimiento de activación (cinco pasos), el árbol del repositorio y el mapa de evidencias.
- **Qué explicar**: el profesor puede abrir la web **sin clave** mientras el equipo, Docker y el túnel estén activos; el repositorio es privado y tiene el README (cómo ejecutarlo), la memoria (datos, calidad, modelo, análisis, costes) y las evidencias; **qué queda como limitación honesta** (sección 7): SC-010 sin observar, el README sin repetir en entorno limpio en esta fase, el reinicio del consumidor probado por evidencia y no en directo, y los datos de coste que son hipotéticos.
- **Datos que puedes citar**: pruebas automáticas: backend **964** (2026-11-09) y frontend **494** (2026-11-11); en su mayoría de lógica y de lectura del código, no de renderizado.
- **Si falla**: ninguno; es solo lectura.

---

## 5. Correspondencia con la rúbrica (resumen)
| Criterio de `ENUNCIADO.md` §13 | Escenas | Nivel que se persigue | Evidencia comprobable |
|---|---|---|---|
| Extracción | V2 | Carga + análisis de tipos | M2, M3, `f4/4.4-carga-real.txt` |
| Calidad | V3 | Completo + acciones (seis dimensiones) | M4, `f4/4.6-calidad.txt` |
| Modelado | V4 | Modelo optimizado (índices medidos) | M5, `sql/`, `f5/5.7-explain.txt` |
| Análisis | V5 (+ V6) | Análisis + insights (tres conclusiones) | M6, `f5/conclusiones.md` |
| Reflexión | V8 (+ V9) | Excelente + propuestas | M7, M10, `f6/6.4-mediciones.txt` |
| Pruebas §11 | V6, V7 | Las 11 pruebas | M8, M9, `f6/6.3-aceptacion.md` |
| Entregables §12 | V1, V9, V10 | Repositorio, URL, procedimiento, explicación | README, `compose.yaml` |

Los niveles son **objetivos**, no una autoevaluación: la nota la decide el profesor y la matriz recoge las reservas.

## 6. Qué grabar en directo y qué enseñar ya preparado
| Debe verse **en directo** | Se puede enseñar **ya preparado** (documento o captura) |
|---|---|
| Web publicada sin clave; Panel, Análisis y Eventos con datos vigentes | Las tres conclusiones (periodo fijo): capturas C-05 a C-07 y `conclusiones.md` |
| Estado de los servicios (`docker compose ps`) y consultas de solo lectura | Mediciones y costes (memoria) |
| Cierre y reapertura del túnel | Reinicio del consumidor, huecos, atomicidad (evidencias) |
| REPRODUCCIÓN con los casos controlados | Histórico de 2025 y carga (evidencia de F4) |

## 7. Reservas que NO pueden presentarse como superadas
Dilas con naturalidad en V10 o donde corresponda; **no las ocultes ni las presentes como cumplidas**:
1. **SC-010** (conservación de eventos tras 24 h en ventana móvil): **sin observar**; PA-10 no concedida; el SQL está preparado (`scripts/f8/sc010_f3.sql`) y no se ha ejecutado. Mantener el PC encendido **no** equivale a SC-010.
2. **README en entorno limpio**: la última verificación completa es de F6 (`6.9-entorno-limpio.txt`); **no se repitió en F8** (requiere PA-11).
3. **Reiniciar consumidor (ACE-08)**: no se capturó un *kill* en mitad de una transacción; se acredita con evidencia (lag 0 → 7 → 0) y pruebas de atomicidad.
4. **Prueba en el Pixel**: la persona estudiante confirmó que funcionó, **sin capturas ni datos del dispositivo archivados**; C-13 y C-14 siguen pendientes.
5. **Cuota y contadores**: no se conoce el consumo real de la cuenta de ngrok; los registros de la función de Netlify y la visibilidad del secreto en la interfaz de Netlify **no se han revisado**; solo se probó en Chrome.
6. **Pruebas automáticas**: el backend (964) es de 2026-11-09 y **no se repitió** (el código no cambió); el frontend (494) pasa, pero son sobre todo pruebas de lógica y de forma del código.
7. **Calidad**: el SQL literal de las comprobaciones en vivo no está archivado (R5) y hay una **discrepancia 197/198** sin causa atribuida (R6).
8. **Costes**: importes **hipotéticos** (supuestos etiquetados); la proyección a 10⁸ **no es una medición**; mediciones en una sola máquina.
9. **Diagramas Mermaid**: el render en GitHub no está comprobado (R9).
10. **Interrupciones**: dos paradas anteriores sin hueco registrado y sin investigar (R10).
11. **Ventana de evaluación**: depende de que el PC no se suspenda ni se reinicie y de que ngrok esté abierto (T037); la insignia «Powered by Netlify» es visible.
12. **Conclusiones**: son del periodo 5–7 nov 2026, **no concluyentes** y no se actualizan con terremotos nuevos.

## 8. Comandos del vídeo (comprobados en solo lectura el 2026-11-11; la salida real la verás tú)
Ejecútalos desde la raíz del proyecto en Git Bash (las variables se resuelven **dentro del contenedor**: no aparecen la clave ni `.env`).
```bash
docker compose ps                                                  # V1: cinco servicios healthy; solo la API publica puerto
bash scripts/f6/invariantes.sh demo                                # V3/V7 (opcional): lag 0, 0 duplicados, huecos, volúmenes (solo lectura)
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt live.*"'                  # V4
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d live.evento_actual"'       # V4
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, iniciada_at, duracion_ms, resultado, http_status, eventos, publicadas, omitidas FROM live.consulta_extraccion ORDER BY id DESC LIMIT 3"'   # V2
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT categoria, motivo, count(*) FROM live.cuarentena GROUP BY 1,2 ORDER BY 3 DESC LIMIT 6"'                                              # V3
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT (SELECT count(*) FROM historico.evento) AS historico_2025, (SELECT count(*) FROM geo.pais) AS paises, (SELECT count(*) FROM live.evento_actual) AS actuales, (SELECT count(*) FROM live.evento_version) AS versiones, (SELECT count(*) FROM live.evento_actual WHERE mag IS NULL) AS mag_nula"'  # V2/V3
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT run_id, tamano, mensajes, velocidad, estado FROM replay.ejecucion ORDER BY iniciada_at DESC"'   # V6 (sustituye la consulta si cambia el esquema)
docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic terremotos.live          # V1/V4: topic y retención
docker compose exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group consumidor-live   # V4/V7: lag 0
```
- **No comprobados en seco** (crean un contenedor efímero; ensáyalos tú antes): `docker compose run --rm --no-deps producer python -m observatorio.recuperacion.recuperar --listar` y `… observatorio.replay.reproducir --solo-plan`.
- **Nunca** en el vídeo: `docker compose down`, `down -v`, `docker volume rm`, scripts que paren o recreen servicios, ni `cat .env`.
- La consulta de `replay.ejecucion` usa las columnas `run_id`, `tamano`, `mensajes`, `velocidad` y `estado` de `sql/004_esquema_f6.sql`.

## 9. Después de grabar (T023) y antes de entregar (T040)
Ver `checklist-grabacion.md` §6–§7: revisar el vídeo contra la matriz, anotar los **minutos reales** (T019), actualizar capturas y cifras [D] y comprobar que **el vídeo coincide con la web publicada**.
