# Especificación de la funcionalidad: Replay, integración, despliegue y pruebas finales (F6)

**Rama de la funcionalidad**: `005-replay-despliegue-final` (el proyecto trabaja en `main`; no se crea rama)

**Creada**: 2026-11-08

**Estado**: Aprobado el 2026-11-08 (DG1–DG10; DG10 con la opción A: casos controlados solo en `replay.*`, como sintéticos y sin mezclar, mediante la enmienda v1.0.4 de la constitución, ya aplicada)

**Entrada**: «Replay histórico aislado por Kafka, integración extremo a extremo y pruebas de aceptación, estabilidad, recuperación,
regresión, rendimiento y aislamiento, mediciones y costes, accesibilidad/responsive/compatibilidad, ngrok y Netlify, y validación
de entregables y reproducibilidad.» Corresponde a la fase F6 de `docs/HOJA-DE-RUTA.md` (pasos 6.1 a 6.6, ampliados con 6.7 a 6.10 por
decisión de la persona estudiante; commit previsto `[F6]`). Requisitos de origen: `ENUNCIADO.md` §9 (despliegue), §10 (complejidad y
costes), §11 (pruebas de aceptación y replay) y §12 (entregables); `CONTRATO-API.md` (`mode`, CORS, ngrok); `FAQ-ALUMNADO.md`
(preguntas 28–32 y 35); `Guia-entregables-observatorio-sismico.md` (2.9, 3.1, 3.2 y la lista final).

**Contexto reutilizado** (no se repite aquí): constitución v1.0.3 (principios II a VII); F3 (`specs/002-…`, solo lectura): consumo
al menos una vez con escritura idempotente, versionado, cuarentena, offset tras escritura, retención de Kafka y volúmenes; F4
(`specs/003-…`): histórico de 2025 (`historico.evento`, 18 302 terremotos), geografía, huecos y recuperación; F5 (`specs/004-…`):
API de eventos, estadísticas y salud, panel Angular, umbrales de rendimiento confirmados y reservas (`docs/evidencias/f5/resultados.md`).
`specs/001-…` es solo histórico. **Estado de partida**: cinco servicios `healthy`, 661 pruebas de backend y 88 de frontend.
**Fuera de alcance**: la memoria final y la demostración (F7), Spark, Flink, Kubernetes y aprendizaje automático, autenticación,
servicios nuevos permanentes, y cualquier operación destructiva (`down -v`, borrado de volúmenes o datos, recrear Kafka o PostgreSQL).

## Aclaraciones

### Sesión 2026-11-08 (modo autónomo: se elige la opción más conservadora; las marcadas «requiere aprobación» no se implementan sin ella)

- Q: ¿La lista de la persona estudiante incluye el replay? → A: **sí**. No lo menciona de forma explícita, pero `ENUNCIADO.md` §9 y §11, la
  hoja (6.1 y 6.2) y la Guía (2.9) lo exigen; es la historia de mayor prioridad de F6.
- Q: ¿Qué procesa los mensajes de replay y se añade un sexto servicio? → A: **no se añade ningún servicio**. El replay se publica con un
  proceso bajo demanda y lo procesa **el mismo código del consumidor** con otro topic, otro grupo y otro esquema (DG1).
- Q: ¿Cómo distingue la API los datos de replay? → A: con el valor `mode` del contrato (`live` por defecto o `replay`); el modo
  `replay` lee solo el esquema de replay y su periodo por defecto es el de la propia reproducción, no «últimas 24 h» (DG2).
- Q: ¿Se pueden probar duplicados, revisiones, nulos y coordenadas inválidas sin ensuciar `live`? → A: **sí, por el camino del replay**
  (mismo procesamiento, esquema aislado, casos marcados como controlados) y con una base temporal para las pruebas unitarias; en `live`
  solo se observan duplicados y revisiones reales del feed. No se inserta ningún dato de prueba en las tablas definitivas.
- Q: ¿Qué pasa con la comparación con 2025 en la vista de replay? → A: no aplica (los eventos reproducidos ya son de 2025); la respuesta
  la omite con un motivo explícito en vez de comparar el histórico consigo mismo.
- Q: ¿Quién crea cuentas, introduce el authtoken de ngrok o publica en Netlify? → A: **la persona estudiante**, o Claude solo con su
  autorización expresa y sin ver nunca el token. En este SDD no se publica nada y el SDD organiza esos pasos detrás de un punto de autorización.
- Q: ¿Se puede probar «apagado y reinicio del equipo»? → A: la persona estudiante apaga o reinicia el equipo; Claude comprueba el estado
  antes y después. Ya se observó un reinicio natural el 2026-11-08 (los mismos contenedores volvieron a arrancar con volúmenes intactos).
- Q: ¿Cómo se prueba el arranque «desde un entorno limpio» sin borrar nada? → A: con un **proyecto Compose paralelo** (otro nombre,
  otros volúmenes, sin tocar los reales) en modo seco de ingesta; el real no se detiene (DG7).
- Q: ¿Se ejecuta ahora SC-010 de F3? → A: **no**. Queda como bloque condicionado (6.10) a la autorización expresa de la persona
  estudiante; permanece «pendiente de observación» y no bloquea el cierre del resto de F6.
- Q: ¿Qué pruebas manuales no puede hacer Claude? → A: lector de pantalla real, Firefox/Safari/dispositivos físicos y las acciones sobre
  cuentas de ngrok o Netlify. Se redactan guiones para la persona estudiante y, si no se ejecutan, la reserva permanece y se documenta.

### Sesión 2026-11-08 (`speckit-clarify`, modo autónomo: opción más conservadora; lo que cambia arquitectura o depende de cuentas sigue en DG1–DG10)

- Q: ¿Qué tres tamaños de entrada se miden en 6.4 y 6.5? → A: **1 000, 10 000 y 100 000 elementos como mínimo** en cada operación (el plan puede añadir ≈ 183 000, como en F5); los datos por encima del histórico real son réplicas sintéticas en una base temporal (FR-019, FR-020).
- Q: ¿Cuánto dura como máximo la ejecución de estabilidad? → A: **60 minutos**, con ingesta real y replay a la vez; cualquier observación de más duración queda fuera de F6 salvo SC-010 de F3 con autorización (FR-017).
- Q: ¿Qué tamaño y velocidad tiene el replay por defecto? → A: **30 eventos reales de un mismo día de 2025 más 6 casos controlados con ids propios (9 mensajes, 39 en total), uno cada 2 s** (unos 78 s); valores configurables; el plan fija la forma de elegir el día (DG3, DG10).
- Q: ¿Cómo se cambia entre vivo y reproducción en el panel publicado? → A: con un **selector visible en el propio panel** (el modo inicial es `live`), sin recompilar ni volver a publicar; `config.json` no cambia de modo (FR-010).
- Q: ¿Qué pendientes manuales o de autorización impiden el cierre técnico de F6? → A: **ninguno lo impide**. El cierre técnico exige todo lo automatizable; los pendientes (lector de pantalla real, publicación en ngrok/Netlify, SC-010 de F3, navegadores o dispositivos no disponibles) constan en `resultados.md` como «pendiente de la persona estudiante» con su guion, no se declaran cumplidos y se cierran con un anexo posterior (SC-012, SC-014, SC-018).

### Decisión de privacidad de la publicación (2026-11-08, persona estudiante)
- Q: ¿Quién puede ver el panel publicado antes de la defensa? → A: la persona estudiante quería el sitio de Netlify (`https://observatorio-sismico.netlify.app/`, cuenta existente, proyecto independiente del portfolio) **privado**, pero **su cuenta gratuita no ofrece privacidad ni contraseña** («Password Protection → Upgrade to unlock»; decisión del usuario: no contratar ni cambiar de plan, no investigar más). **El sitio de Netlify es PÚBLICO** (la página provisional se sirve con HTTP 200 a cualquiera). Decisión resultante: **el dashboard real NO se sube a Netlify hasta una autorización expresa**, y los **datos** se protegen en la API con una clave de acceso (FR-041).
- Q: ¿Basta CORS para proteger la API del túnel (`grandpa-bunkbed-spree.ngrok-free.dev`)? → A: **no**: CORS no es autenticación. Se aprueba la **opción A**: clave de acceso obligatoria en la API (cabecera `X-Observatorio-Clave`, 401 sin ella), generada de forma segura, solo en el `.env` local; el panel la pide y la guarda solo en memoria. Planes de pago: ninguno.

### Revisión de Architect y QA (2026-11-08)

- «SC-010(F3)» designa siempre la conservación tras 24 h de la fase F3; «SC-010» sin sufijo, el criterio de mediciones de esta especificación.
- La fila 6.2 de la hoja («comprobar velocidad, identidad y separación») se amplía a «Replay en la API y el panel; comprobar velocidad, identidad y separación» (T001, T071).
- Los casos controlados usan ids propios porque cambiar la magnitud o el `updated` de un evento real fabricaría datos bajo un id real (DG10); los eventos reales del replay quedan intactos.
- El topic y el grupo de replay son permanentes (A-13) y no cuentan como recursos temporales sin eliminar.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia 1 — Reproducir una selección histórica por el pipeline sin mezclarla con lo real (Prioridad: P1)

Quien hace la demostración lanza una reproducción acelerada de eventos reales de 2025 y los ve recorrer Kafka, el procesamiento y
PostgreSQL, en almacenes propios, sin tocar `live`, `historico` ni `sintetico`.

**Por qué esta prioridad**: es el único modo de demostrar actividad sin esperar sismos nuevos y es un requisito explícito (§9, §11).

**Prueba independiente**: con la base y los topics reales, reproducir una selección pequeña y contrastar los recuentos del esquema de
replay con la selección, y comprobar con consultas que `live`, `historico` y `sintetico` conservan sus huellas.

**Escenarios de aceptación**:

1. **Dado** un intervalo de 2025 y un tamaño de selección, **cuando** se lanza la reproducción, **entonces** se publican los eventos
   reales de `historico` ordenados por su fecha, a la velocidad indicada, conservando `time` y `updated` originales y añadiendo el instante de reproducción.
2. **Dado** la reproducción en curso, **cuando** se consulta el almacén de replay, **entonces** sus filas llevan `mode = replay`, la
   identificación de la ejecución y la marca de caso controlado cuando corresponda; `live`, `historico` y `sintetico` no cambian.
3. **Dado** que se repite la misma reproducción, **cuando** termina, **entonces** el recuento de eventos del replay no aumenta
   (escritura idempotente) y la nueva ejecución queda identificada.
4. **Dado** que el proceso de replay se interrumpe a mitad, **cuando** se reanuda, **entonces** no hay duplicados ni pérdidas en el replay.
5. **Dado** el consumidor en vivo, **cuando** llegan mensajes de replay a su topic, **entonces** no los procesa; y el replay no lee el topic en vivo.

---

### Historia 2 — Casos controlados de duplicado, revisión y datos defectuosos (Prioridad: P1)

Quien demuestra el sistema puede mostrar, con la reproducción, cómo se comporta ante un reenvío, una revisión, una versión antigua,
una magnitud nula, unas coordenadas inválidas y un evento marítimo.

**Por qué esta prioridad**: son las pruebas de aceptación del núcleo técnico (§11) y no se pueden provocar en `live` sin ensuciarlo.

**Prueba independiente**: reproducir un conjunto controlado y comparar antes y después en las tablas de replay.

**Escenarios de aceptación**:

1. **Dado** un duplicado exacto, **cuando** se procesa, **entonces** el recuento de eventos no aumenta.
2. **Dado** una revisión posterior (`updated` mayor), **cuando** se procesa, **entonces** cambian los datos actuales y las agregaciones afectadas y se conserva la versión anterior.
3. **Dado** una versión antigua que llega después de la posterior, **cuando** se procesa, **entonces** se guarda en el historial pero no sustituye a la vigente.
4. **Dado** una magnitud nula, **cuando** se procesa, **entonces** se conserva y el panel la muestra como «ND» (nunca 0).
5. **Dado** coordenadas inválidas, **cuando** se procesa, **entonces** va a cuarentena con su motivo y no aparece ningún punto.
6. **Dado** un evento marítimo, **cuando** se procesa, **entonces** queda «Sin país asignado» y sigue en el análisis.

---

### Historia 3 — Ver la reproducción en el panel claramente etiquetada (Prioridad: P1)

Quien mira el panel puede pasar a la vista de reproducción, que consulta el intervalo de 2025 correspondiente, muestra «REPRODUCCIÓN» en
todas sus vistas y nunca se confunde con datos actuales.

**Por qué esta prioridad**: sin etiqueta visible y sin el intervalo correcto la demostración no se ve o se confunde con actualidad (FAQ 32).

**Prueba independiente**: con una reproducción hecha, abrir el panel en cada modo y contrastar mapa, tabla, gráficas y etiqueta.

**Escenarios de aceptación**:

1. **Dado** una reproducción disponible, **cuando** se elige el modo reproducción, **entonces** el periodo por defecto es el de la reproducción (no 24 h), se ve «REPRODUCCIÓN» en el mapa, la tabla, la ficha y el estado, y el recuento de mapa, tabla y gráficas coincide.
2. **Dado** el modo reproducción, **cuando** se vuelve al modo en vivo, **entonces** desaparecen los datos y avisos de la reproducción y se recupera el periodo de 24 h.
3. **Dado** el modo reproducción, **cuando** se consulta la comparación con 2025, **entonces** se indica que no aplica, sin cifras.
4. **Dado** que no hay ninguna reproducción, **cuando** se elige el modo, **entonces** se explica cómo lanzarla y no se muestra «sin conexión».

---

### Historia 4 — Demostrar las pruebas de aceptación extremo a extremo (Prioridad: P1)

Quien evalúa puede comprobar, con evidencia real, que un evento recorre USGS → Kafka → PostgreSQL → FastAPI → Angular y que las once
pruebas del enunciado (§11) se cumplen.

**Por qué esta prioridad**: es lo que se evalúa en la defensa y la constitución exige ejecutar, no suponer (principio V).

**Prueba independiente**: seguir el guion de aceptación y comparar lo observado con lo esperado de cada fila.

**Escenarios de aceptación**:

1. **Dado** un evento real del feed, **cuando** se sigue su rastro, **entonces** se identifican su consulta a USGS, su mensaje, su versión, su fila actual, su respuesta de la API y su punto en el panel.
2. **Dado** cada una de las filas de §11 salvo las dos del túnel, **cuando** se ejecuta, **entonces** se registra el procedimiento, el comando y el resultado observado, que coincide con el esperado.
3. **Dado** que se reinicia el consumidor, **cuando** reanuda, **entonces** no duplica los efectos ya persistidos (lag y reconciliación a 0).
4. **Dado** que se cierra el túnel (paso de publicación), **cuando** el panel intenta actualizar, **entonces** muestra el fallo y conserva e identifica la última lectura; **y** al reabrirlo recupera las consultas solo.

---

### Historia 5 — Estabilidad, recuperación y persistencia sin operaciones destructivas (Prioridad: P2)

Quien opera el sistema comprueba que sobrevive a paradas y reinicios de cada componente y del equipo, sin perder ni duplicar datos.

**Por qué esta prioridad**: es el tratamiento de errores que se evalúa (§9, §11) y la base de la defensa.

**Prueba independiente**: parar y arrancar un componente cada vez, con los invariantes comprobados antes y después.

**Escenarios de aceptación**:

1. **Dado** el productor, el consumidor o la API parados y arrancados, **cuando** reanudan, **entonces** los invariantes (lag 0, reconciliación 0, 0 offsets duplicados, huellas del histórico y de `sintetico`) se mantienen.
2. **Dado** Kafka o PostgreSQL parados con `stop` y arrancados con `start`, **cuando** reanudan, **entonces** conservan mensajes, offsets y datos con los mismos volúmenes.
3. **Dado** el apagado o reinicio del equipo, **cuando** vuelve Docker Desktop, **entonces** los cinco servicios regresan `healthy` con los mismos contenedores y volúmenes.
4. **Dado** una ejecución acotada con ingesta real y replay a la vez, **cuando** termina, **entonces** hay 0 errores no explicados y la memoria no crece sin control.

---

### Historia 6 — Medir, razonar la complejidad y estimar costes (Prioridad: P2)

Quien defiende el trabajo puede justificar con medidas propias el coste de buscar versiones, asignar países y agregar por ventanas.

**Por qué esta prioridad**: el enunciado (§10) exige al menos tres operaciones, tres tamaños, tiempo y memoria, comparaciones y costes.

**Prueba independiente**: ejecutar el procedimiento de medida y comprobar que las tablas de resultados se reproducen.

**Escenarios de aceptación**:

1. **Dado** tres tamaños de entrada por operación, **cuando** se mide, **entonces** se registran tiempo y memoria con equipo y procedimiento.
2. **Dado** una réplica de datos para escala, **cuando** se usa, **entonces** está marcada como sintética y fuera del análisis real.
3. **Dado** la búsqueda secuencial frente a diccionario y la consulta sin y con índice, **cuando** se comparan, **entonces** se razona qué ocurriría con 100 millones de registros.
4. **Dado** el informe de costes, **cuando** se revisa, **entonces** cubre hardware, electricidad, almacenamiento, transferencia, mantenimiento y desarrollo, con supuestos y sin beneficios inventados.

---

### Historia 7 — Accesibilidad, diseño responsive y compatibilidad del panel (Prioridad: P2)

Quien usa el panel con teclado, lector de pantalla, zoom o un móvil puede completar las mismas tareas.

**Por qué esta prioridad**: son las reservas abiertas de F5 (lectores reales, zoom 200 %, contraste del mapa, un solo navegador).

**Prueba independiente**: ejecutar el guion de pruebas con cada herramienta y anotar el resultado.

**Escenarios de aceptación**:

1. **Dado** un lector de pantalla real, **cuando** se recorren filtros, estado, tabla, gráficas y comparación, **entonces** todo es anunciable y operable, y los hallazgos se corrigen o se documentan.
2. **Dado** un zoom del 200 % y un ancho equivalente a 320 px, **cuando** se usa el panel, **entonces** no hay pérdida de contenido ni desplazamiento horizontal de la página.
3. **Dado** varios anchos y navegadores, **cuando** se abre el panel, **entonces** funciona igual y lo no verificable consta como reserva.
4. **Dado** la capa del mapa, **cuando** se mide su contraste, **entonces** se documenta el resultado y la alternativa textual (la tabla).

---

### Historia 8 — Publicar el panel con ngrok y Netlify (Prioridad: P2, tras autorización)

Quien evalúa abre el panel desde otro dispositivo en una URL HTTPS de Netlify que consulta la API local a través de ngrok.

**Por qué esta prioridad**: es el despliegue obligatorio (§9), pero depende de cuentas y tokens de la persona estudiante.

**Prueba independiente**: con el túnel activo, abrir la URL de Netlify en otro dispositivo y comprobar datos, filtros y estado.

**Escenarios de aceptación**:

1. **Dado** el túnel activo y el origen exacto de Netlify autorizado, **cuando** el navegador consulta la API, **entonces** el preflight `OPTIONS` y las respuestas son correctas y el panel muestra datos.
2. **Dado** el túnel, **cuando** se inspecciona lo expuesto, **entonces** solo responde la API y no hay acceso a Kafka ni a PostgreSQL.
3. **Dado** el repositorio y el build, **cuando** se buscan secretos, **entonces** no aparecen el authtoken ni credenciales.
4. **Dado** el túnel cerrado y reabierto, **cuando** el panel actualiza, **entonces** avisa del fallo, conserva la última lectura y se recupera solo.

---

### Historia 9 — Entregables, reproducibilidad e instrucciones de ejecución (Prioridad: P2)

Quien recibe el repositorio puede arrancar el sistema siguiendo el README y activar la demostración con un procedimiento breve.

**Por qué esta prioridad**: la entrega se valida por reproducibilidad y evidencias comprobables (Guía, lista final).

**Prueba independiente**: seguir el README en un proyecto paralelo y recorrer la lista final de la Guía.

**Escenarios de aceptación**:

1. **Dado** un entorno limpio paralelo, **cuando** se sigue el README con `docker compose up --build -d`, **entonces** los cinco servicios llegan a `healthy` sin pasos no documentados.
2. **Dado** la lista final de la Guía (13 puntos), **cuando** se revisa, **entonces** cada punto tiene estado y evidencia, y los que dependen de F7 o de acciones de la persona estudiante constan como pendientes.
3. **Dado** el procedimiento de activación para la defensa, **cuando** se ensaya en seco, **entonces** los cinco pasos de la Guía funcionan en orden.

---

### Historia 10 — Saneamiento de los scripts históricos de F5 (Prioridad: P3)

Quien reejecuta las matrices de F5 no obtiene fallos por aserciones obsoletas que parecen regresiones.

**Por qué esta prioridad**: QA lo marcó en F5; es una deuda pequeña pero engañosa.

**Prueba independiente**: reejecutar `matriz_51.py` y `matriz_52.py` contra la API actual.

**Escenarios de aceptación**:

1. **Dado** la API actual, **cuando** se reejecutan las matrices, **entonces** terminan en OK, o quedan marcadas explícitamente como evidencia histórica no reejecutable.
2. **Dado** una aserción actualizada, **cuando** se introduce una regresión, **entonces** la matriz la detecta.

---

### Historia 11 — SC-010 de F3: conservación tras más de 24 horas (Prioridad: P3, condicionada)

La persona estudiante decide cuándo comprobar que los eventos que salieron de la ventana de 24 h siguen almacenados.

**Por qué esta prioridad**: sigue pendiente de F3, pero exige tiempo real y no debe retrasar el resto de F6.

**Prueba independiente**: con la autorización expresa, ejecutar las consultas de solo lectura de T044 de F3.

**Escenarios de aceptación**:

1. **Dado** que no hay autorización, **cuando** se cierra F6, **entonces** SC-010 de F3 consta como «pendiente de observación» y nada se ha medido.
2. **Dado** la autorización y más de 24 h de funcionamiento, **cuando** se ejecutan las consultas, **entonces** hay eventos anteriores a 24 h en `evento_actual` y `evento_version` y la reconciliación está vacía, con evidencia en `docs/evidencias/f3/sc-010-observacion-24h.txt`.

---

### Casos límite

- La reproducción pide más eventos de los que hay en el intervalo, o el intervalo no contiene ninguno: se informa del número real y no se inventan eventos.
- Se lanzan dos reproducciones a la vez o una se repite: cada ejecución queda identificada y la API muestra por defecto la más reciente.
- Un mensaje de `live` llega al topic de replay (o al revés): el consumidor correspondiente lo descarta con motivo.
- Kafka o el consumidor están parados durante la reproducción: los mensajes esperan dentro de la retención y se procesan al reanudar.
- El panel está en modo reproducción y se cae la API: se muestra «sin conexión» sin presentar la reproducción como actual.
- La URL gratuita de ngrok cambia al reiniciar el agente: el panel publicado apunta a una URL muerta y debe mostrarlo con claridad.
- El origen de Netlify no coincide exactamente (esquema, subdominio): el navegador bloquea la lectura y el panel debe indicar el problema.
- El equipo se apaga a mitad de una prueba: los ensayos son reanudables y no dejan datos de prueba en tablas definitivas.
- Dos recursos temporales de pruebas (contenedores, bases, topics) quedan sin eliminar: la comprobación final los detecta.
- Los datos replicados para escala se confunden con datos reales: se marcan como sintéticos y viven en una base temporal.
- Una medición depende de otra carga del equipo: se anota el estado del equipo y se repite.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Replay (6.1–6.2)**

- **FR-001**: El replay MUST usar un topic y un esquema de PostgreSQL propios, y todo mensaje o fila de replay MUST llevar `mode = "replay"`; el contrato solo admite `live` y `replay`.
- **FR-002**: La selección MUST salir de `historico.evento` (solo lectura), en un intervalo de 2025 y con un tamaño configurables, ordenada por fecha del evento; se registran el intervalo, el tamaño y el criterio.
- **FR-003**: La velocidad MUST ser configurable. Los tiempos originales (`time`, `updated`) de los eventos reales MUST conservarse sin alterar y MUST añadirse el instante de reproducción y la identificación de la ejecución.
- **FR-004**: La reproducción MUST incluir seis casos controlados (duplicado exacto, revisión posterior, versión antigua tardía, magnitud nula, coordenadas inválidas y evento marítimo) con **ids propios `replay-ctl-…`** copiados de eventos reales —nunca se altera un evento real—, con su `time` dentro del intervalo de la ejecución, marcados como tales y existentes solo en el almacén de replay (DG10).
- **FR-005**: El procesamiento de replay MUST reutilizar el del consumidor (validación, versionado, país, cuarentena, idempotencia y confirmación del offset tras escribir) con otra configuración, sin duplicar su lógica (DG1).
- **FR-006**: El replay MUST NOT leer ni escribir en `live`, `historico` (salvo la lectura de la selección) ni `sintetico`, y el consumo en vivo MUST NOT procesar mensajes de replay; se comprueba con huellas antes y después.
- **FR-007**: Repetir una reproducción MUST NOT aumentar los recuentos y cada ejecución MUST quedar identificada sin borrar las anteriores.
- **FR-008**: Los tres endpoints MUST aceptar `mode` (`live` por defecto, `replay`; otro valor da 422); `replay` lee solo el esquema de replay, su periodo por defecto es el de la reproducción y se indica; `metadata.mode` refleja el modo (DG2).
- **FR-009**: En modo `replay`, la comparación con 2025 MUST omitirse con un motivo explícito y `/api/salud` MUST seguir describiendo la ingesta en vivo.
- **FR-010**: El panel MUST permitir elegir el modo con un selector visible (inicial `live`, sin recompilar ni republicar), mostrar «REPRODUCCIÓN» de forma visible en el mapa, la tabla, la ficha, las gráficas y el estado, aplicar los filtros del periodo de la reproducción y no mezclar datos de ambos modos. Los casos controlados MUST llevar además un distintivo visible «caso controlado / sintético» en la ficha y la tabla.

**Integración y aceptación (6.3)**

- **FR-011**: Las once pruebas de aceptación de `ENUNCIADO.md` §11 MUST ejecutarse con procedimiento, comando y resultado observado en `docs/evidencias/f6/`; la del túnel, tras el despliegue.
- **FR-012**: Un evento real MUST poder rastrearse de extremo a extremo (consulta a USGS, mensaje, versión, fila actual, API y panel) y el rastro MUST guardarse.
- **FR-013**: Ninguna prueba MUST insertar datos ficticios o dañados en tablas definitivas; se usan el esquema de replay, una base temporal o transacciones revertidas.
- **FR-014**: La regresión MUST reejecutar las suites de backend (661) y de frontend (88) más las nuevas, con la salida guardada.

**Estabilidad y recuperación (6.8)**

- **FR-015**: Cada ensayo de parada o reinicio (consumidor, productor, API, Kafka, PostgreSQL, Docker Desktop y equipo) MUST comprobar los invariantes antes y después y MUST NOT usar `down -v`, borrar volúmenes ni recrear Kafka o PostgreSQL.
- **FR-016**: Los ensayos que paran servicios reales MUST pedir autorización expresa antes de cada uno, y `down` seguido de `up` sin `-v` es opcional y exige autorización.
- **FR-017**: La ejecución de estabilidad MUST durar como máximo 60 minutos y MUST registrar errores, reinicios y memoria.
- **FR-018**: La recuperación de huecos MUST seguir documentada y, mientras no ocurra un hueco real de USGS, MUST permanecer como reserva.

**Rendimiento, complejidad y costes (6.4–6.5)**

- **FR-019**: Se MUST medir tiempo y memoria con al menos tres tamaños (1 000, 10 000 y 100 000 elementos como mínimo) en: búsqueda de versiones por identificador, integración geográfica y agregación por ventanas; se documentan equipo, procedimiento y resultados.
- **FR-020**: Los datos replicados para escala MUST marcarse como sintéticos, vivir en una base temporal eliminada al terminar y quedar fuera del análisis real.
- **FR-021**: MUST compararse la búsqueda secuencial con el diccionario y una consulta sin y con índice, y razonarse el caso de 100 millones de registros (memoria, disco, índices, particiones). El informe incluye una propuesta de escalado y de mejoras (§10 y §12).
- **FR-022**: El informe MUST cubrir hardware, electricidad, almacenamiento, transferencia, mantenimiento y tiempo de desarrollo con supuestos explícitos; una cuota gratuita no equivale a coste cero y no se inventan beneficios.
- **FR-023**: Los umbrales de rendimiento nuevos se proponen tras medir y los confirma la persona estudiante; no se presentan como predicciones.

**Accesibilidad, responsive y compatibilidad (6.7)**

- **FR-024**: MUST ejecutarse un guion con lector de pantalla real, teclado completo y zoom del 200 % / ancho equivalente a 320 px, y medirse el contraste de la capa del mapa; los hallazgos se corrigen o se documentan.
- **FR-025**: MUST registrarse una matriz de anchos (al menos 320, 375, 768, 1024 y 1440 px) y de navegadores; lo que no pueda verificarse consta como reserva.
- **FR-026**: Los cambios de frontend MUST mantenerse dentro de `frontend/src/app/`, `frontend/tests/` y `frontend/public/config.json` sin secretos, sin dependencias nuevas salvo aprobación.

**Despliegue (6.6)**

- **FR-027**: ngrok MUST exponer solo la API (HTTPS); Kafka y PostgreSQL MUST NOT alcanzarse por el túnel ni publicarse; el authtoken MUST NOT estar en Git, `.env.example`, Angular, registros ni evidencias (DG4). Las rutas que expone el túnel se enumeran (incluidas `/docs`, `/redoc` y `/openapi.json` de FastAPI) y se decide cuáles salen.
- **FR-028**: CORS MUST autorizar el origen exacto de Netlify y el de desarrollo, atender `OPTIONS` y permitir `ngrok-skip-browser-warning`, sin comodines.
- **FR-029**: `config.json` MUST llevar la URL HTTPS del túnel **antes de compilar** y ningún secreto: un paso de build la escribe en `public/config.json`, compila y restaura el original, de modo que el repositorio conserva `http://127.0.0.1:8000`; el procedimiento MUST cubrir el cambio de URL (DG5, DG6).
- **FR-030**: Netlify MUST servir el build de Angular y el panel MUST abrirse desde otro dispositivo (DG6).
- **FR-031**: Nada MUST publicarse, ni abrirse un túnel, ni crearse cuentas o introducirse tokens sin autorización expresa; el SDD y los pasos previos solo preparan y verifican en local.

**Entregables y reproducibilidad (6.9)**

- **FR-032**: El README MUST permitir arrancar los cinco servicios desde un entorno limpio con `docker compose up --build -d`, verificado en un proyecto Compose paralelo sin tocar los volúmenes reales (DG7).
- **FR-033**: MUST existir un procedimiento breve de activación para la defensa (los cinco pasos de la Guía 3.2), ensayado en seco. Se redacta además el documento de la reproducción histórica (selección, velocidad, separación, etiqueta, esperado y observado; Guía 2.9).
- **FR-034**: La lista final de la Guía MUST recorrerse con estado y evidencia por punto, sin marcar nada sin ejecutarlo; lo que dependa de F7 consta como pendiente.
- **FR-035**: `.env.example` y las dependencias MUST estar completas y fijadas, sin credenciales reales.

**Deuda de F5 y SC-010 de F3 (6.7–6.10)**

- **FR-036**: `scripts/f5/matriz_51.py` y `matriz_52.py` MUST actualizarse a la API vigente (y seguir detectando regresiones) o marcarse como evidencia histórica no reejecutable.
- **FR-037**: SC-010 de F3 MUST planificarse como bloque condicionado a una autorización expresa, con consultas de solo lectura y evidencia en `docs/evidencias/f3/`; MUST NOT iniciarse sin ella ni bloquear el cierre del resto de F6.

**Transversales**

- **FR-038**: Se mantienen los cinco servicios; solo la API se publica (127.0.0.1:8000); no se añade ningún servicio permanente (DG1, DG4).
- **FR-039**: Los datos reales, históricos, de replay y sintéticos MUST permanecer aislados y etiquetados; un nulo nunca es 0 y «Sin país asignado» nunca es el país más cercano.
- **FR-041**: Los endpoints de datos de la API expuesta por el túnel MUST rechazar con HTTP 401 toda petición sin la clave de acceso o con una incorrecta (antes de validar parámetros, en live y en replay), aceptándola solo por cabecera (`X-Observatorio-Clave`), comparada en tiempo constante; el preflight CORS MUST funcionar sin clave y sin dar datos; la clave (>= 32 caracteres aleatorios) MUST NOT estar en Git, registros, URLs, `config.json` ni el build, y el panel MUST pedirla y conservarla solo en memoria (sin localStorage, sessionStorage ni cookies). Sin `API_CLAVE_ACCESO` la API local se comporta como antes. Como el sitio de Netlify es público (cuenta gratuita sin privacidad), el dashboard real NO se publica hasta autorización expresa de la persona estudiante, y el túnel permanece cerrado hasta que se verifique la protección en la API recreada.
- **FR-040**: Cada comportamiento MUST tener una prueba o comprobación ejecutada con resultado real en `docs/evidencias/f6/`; no se modifican `docs/referencias/` ni `specs/001`–`004`.

### Entidades clave

- **Ejecución de replay**: una reproducción identificada (intervalo, tamaño, velocidad, inicio, fin, estado) que agrupa los eventos reproducidos.
- **Evento reproducido**: un evento real de 2025 con sus tiempos originales, el instante de reproducción, la ejecución y la marca de caso controlado.
- **Caso controlado**: un evento con id propio `replay-ctl-…`, copiado de un evento real, con una finalidad de demostración (duplicado, revisión, antigua, nula, inválida, marítimo), que solo existe en el replay y se muestra como sintético.
- **Prueba de aceptación**: una fila de §11 con procedimiento, comando, resultado esperado y observado, y evidencia.
- **Medida de rendimiento**: operación, tamaño, tiempo, memoria, equipo y procedimiento.
- **Punto de autorización**: una acción (parar servicios reales, abrir túnel, publicar, observar 24 h) que requiere el visto bueno expreso de la persona estudiante.
- **Entrega verificable**: un punto de la lista final de la Guía con su estado y su evidencia.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: Tras una reproducción de N eventos, el esquema de replay contiene exactamente los esperados (selección más casos controlados, sin duplicados) y `live`, `historico` y `sintetico` conservan sus huellas.
- **SC-002**: La cadencia observada de publicación y el instante de reproducción de cada evento se registran junto a la velocidad configurada, con el tiempo original intacto en el 100 % de los eventos reales; la tolerancia se propone tras medir y la confirma la persona estudiante.
- **SC-003**: Los seis casos controlados producen el resultado esperado en el 100 % de los casos (duplicado sin aumento, revisión aplicada, antigua sin sustituir, nulo conservado, inválidas en cuarentena con motivo, marítimo «sin país»).
- **SC-004**: `mode=replay` devuelve solo eventos de replay y `mode=live` solo los reales, sin intersección; un modo desconocido da 422 y el periodo por defecto de replay es el de la reproducción.
- **SC-005**: En el panel, «REPRODUCCIÓN» es visible en el 100 % de las vistas del modo replay; el recuento de mapa, tabla y gráficas coincide; al volver al modo en vivo no queda ningún dato de replay.
- **SC-006**: Las once pruebas de §11 tienen procedimiento, resultado observado y evidencia (ocho en 6.3, la del reinicio del consumidor en 6.8 y las dos del túnel tras el despliegue), sin marcar ninguna por estar programada.
- **SC-007**: Las suites de regresión (661 + 88 más las nuevas) pasan con la salida guardada y el aislamiento de F4 y F5 sigue en OK.
- **SC-008**: Tras cada ensayo de parada o reinicio, el lag es 0, la reconciliación está vacía, hay 0 offsets duplicados y las huellas no cambian.
- **SC-009**: Los volúmenes de Kafka y PostgreSQL conservan su identidad y contenido tras los ensayos, con 0 operaciones destructivas.
- **SC-010**: Cada operación medida tiene tres tamaños con tiempo y memoria, equipo y procedimiento, y las comparaciones secuencial/diccionario y sin/con índice con su razonamiento a 100 millones de registros; los umbrales que se propongan los confirma la persona estudiante.
- **SC-011**: El informe de complejidad y costes cubre al menos tres estructuras u operaciones con coste medio y peor caso y las seis categorías de coste con supuestos.
- **SC-012**: El guion de accesibilidad se completa con lector de pantalla real, teclado, zoom del 200 % y contraste del mapa, con cada hallazgo corregido o documentado; si no se ejecuta, la reserva permanece.
- **SC-013**: La matriz de anchos (≥ 5) y de navegadores (≥ 3, el resto como reserva) no muestra desborde de página ni pérdida de función.
- **SC-014** (tras autorización): la URL de Netlify abre desde otro dispositivo y muestra datos reales de la API a través de ngrok; el preflight es correcto; Kafka y PostgreSQL no son alcanzables por el túnel; el túnel cerrado y reabierto se comporta como §11; 0 secretos en el repositorio y en el build.
- **SC-015**: Desde un proyecto Compose paralelo, el README lleva los cinco servicios a `healthy` sin pasos no documentados.
- **SC-016**: Los 13 puntos de la lista final de la Guía tienen estado y evidencia; ninguno figura como superado sin ejecutarse.
- **SC-017**: Las matrices de F5 terminan en OK o constan como históricas, y detectan una regresión introducida.
- **SC-018**: SC-010 de F3 permanece «pendiente de observación» con 0 mediciones prolongadas iniciadas sin autorización, y el cierre del resto de F6 no depende de él.
- **SC-019**: 0 volúmenes o datos borrados, 0 recursos temporales sin eliminar, 0 secretos versionados, solo la API publicada, y los documentos del profesor y `specs/001`–`004` sin cambios.

## Supuestos

- **A-01**: El histórico de 2025 (18 302 eventos) está cargado y es la fuente de las selecciones de replay; el replay lo lee, nunca lo modifica.
- **A-02**: El feed en vivo cubre pocos días y su cobertura de M 4,0–4,5 fuera de EE. UU. es menor que la del histórico; las comparaciones recientes frente a 2025 conservan esa reserva y el panel la advierte.
- **A-03**: Los umbrales de F5 (p95 de 50, 100, 250 y 500 ms) se mantienen como regresión; los nuevos se proponen tras medir.
- **A-04**: Las mediciones se hacen en una sola máquina (Windows 11, Docker Desktop, PostgreSQL local) y no se extrapolan; es una reserva heredada.
- **A-05**: La recuperación de huecos solo se ha ensayado con catálogo simulado; hasta que ocurra un hueco real de USGS, la reserva permanece.
- **A-06**: La persona estudiante dispone de (o creará ella misma) las cuentas de ngrok y Netlify; Claude no crea cuentas, no introduce tokens y no abre túneles públicos sin su autorización.
- **A-07**: La URL gratuita de ngrok puede cambiar; si la cuenta ofrece dominio estático se usa (DG5).
- **A-08**: Las pruebas con lector de pantalla, Firefox, Safari y dispositivos físicos las realiza la persona estudiante con un guion; la herramienta no puede operarlos.
- **A-09**: Node 24 local para pruebas; `netlify.toml` declara Node 22 y se revisa en 6.6 (se compila en local y se publica el resultado).
- **A-10**: El commit `[F6]` lo hace manualmente la persona estudiante; este SDD no hace commit ni push.
- **A-11**: El cierre técnico de F6 no espera a los pendientes manuales o de autorización (lector de pantalla real, publicación pública, SC-010 de F3, navegadores o dispositivos no disponibles): constan como «pendiente de la persona estudiante» y se cierran con un anexo.
- **A-12**: Las mediciones de escala usan un contenedor PostgreSQL temporal propio (como en F5), nunca `CREATE DATABASE` en el servidor real, para no competir con la ingesta.
- **A-13**: El topic `terremotos.replay` y el grupo `consumidor-replay` son permanentes y esperados (no son recursos temporales); la comprobación final los lista como tales.
- **A-14**: El informe de costes (T040), el procedimiento de defensa (T067) y las preguntas de defensa (T073) son borradores que alimentan la memoria y la defensa de F7 (pasos 7.2 y 7.3), no las sustituyen.

## Decisiones que requieren aprobación

Se aprueban **juntas, una sola vez, en T001** (cada punto de control solo pide autorización para seguir); la tabla resumen y lo que bloquea cada una están en [plan.md](plan.md).

- **DG1 — Procesamiento del replay**: el mismo código del consumidor, ejecutado bajo demanda con su propio topic (`terremotos.replay`), grupo y esquema, sin sexto servicio. *Recomendada*: sí; alternativas: suscribir el consumidor en vivo a ambos topics (mezcla riesgo en el camino crítico) o un sexto servicio (contradice los cinco servicios). *Bloquea*: 6.1.
- **DG2 — Exposición en la API**: parámetro `mode` (`live` por defecto, `replay`) en los tres endpoints, con el periodo de la reproducción por defecto en replay. *Recomendada*: sí; alternativa: rutas `/api/replay/*`. *Bloquea*: 6.2.
- **DG3 — Selección y velocidad del replay**: 30 eventos reales de un mismo día de 2025 (por defecto el de más eventos), orden por fecha, un mensaje cada 2 s (configurable) y ejecuciones identificadas que no se borran. Los casos controlados van aparte (DG10). *Recomendada*: sí; alternativa: limpiar el esquema entre ejecuciones (operación destructiva sobre datos de prueba). *Bloquea*: 6.1.
- **DG4 — ngrok**: agente en el equipo (`ngrok http 8000`) sobre el puerto ya publicado en 127.0.0.1, con el authtoken en la configuración propia de ngrok. *Recomendada* por simplicidad (el token queda fuera de Compose; es preferencia propia: `ENUNCIADO.md` §9 admite también un contenedor en la misma red); alternativa: contenedor (`ngrok http http://api:8000`, token en el entorno de Compose y un servicio más). *Bloquea*: 6.6.
- **DG5 — URL del túnel**: dominio estático gratuito de ngrok si la cuenta lo permite; si no, URL cambiante con nueva compilación y despliegue en cada sesión. *Recomendada*: dominio estático. *Bloquea*: 6.6.
- **DG6 — Netlify y `config.json`**: despliegue manual del build local (arrastrar o CLI), sin push; la URL de ngrok se escribe en `public/config.json` **antes de compilar** (como pide §9) y el original se restaura tras el build. **Condición aprobada**: esa modificación solo se hace cuando corresponda preparar el despliegue (T043) y se restaura y verifica (hash) en el mismo paso. *Recomendada*: sí; alternativas: escribirla solo en la copia de `dist` (se aparta de la letra de §9) o despliegue conectado a Git (exige push y Node 22 en `netlify.toml`). *Bloquea*: 6.6.
- **DG7 — Entorno limpio**: proyecto Compose **independiente** (`-p observatorio_limpio`, puerto de API alternativo, etiqueta de imagen propia `BACKEND_IMAGE`, volúmenes y red propios, ingesta en modo seco) sin detener ni tocar el sistema real. **Condición aprobada**: cualquier eliminación de volúmenes, incluso de los temporales de ese proyecto, requiere una autorización específica (PA-11), tras listarlos y comprobar `-p … ps` y `-p … config`, por nombre exacto y nunca con `down -v`; sin esa autorización el proyecto queda parado y sus volúmenes se conservan. *Recomendada*: sí; alternativa: revisión documental sin ejecutar. *Bloquea*: 6.9.
- **DG8 — Alcance de los ensayos sobre servicios reales**: parada y arranque de consumidor, productor y API (autorización al inicio del paso), de Kafka y PostgreSQL solo con `stop`/`start` y autorización expresa por ensayo, reinicio de Docker Desktop y del equipo por la persona estudiante; `down` sin `-v` opcional. *Recomendada*: sí; alternativa: solo recursos temporales (menos evidencia real). *Bloquea*: 6.8.
- **DG9 — Numeración de la hoja**: ampliar F6 en `docs/HOJA-DE-RUTA.md` con 6.7 (accesibilidad, responsive y compatibilidad), 6.8 (estabilidad, recuperación y persistencia), 6.9 (entregables, reproducibilidad y cierre) y 6.10 (SC-010 de F3, condicionado). *Recomendada*: sí; alternativa: incluirlos dentro de 6.3 y 6.6 (pasos demasiado grandes). *Bloquea*: T001.
- **DG10 — Casos controlados del replay**: seis casos con ids propios `replay-ctl-…` (copiados de eventos reales, que no se alteran) como **datos de demostración etiquetados** (`caso` en la base y distintivo «caso controlado / sintético» en el panel), solo en `replay.*`. Es una interpretación del principio III y de la restricción «un dato de prueba MUST NOT insertarse en las tablas definitivas»: `ENUNCIADO.md` §11 exige duplicado y revisión controlados (los otros cuatro casos son iniciativa propia) y nunca tocan `live`, `geo` ni `historico`. **Estado**: aprobada (opción A) el 2026-11-08 y aplicada: la constitución pasa a v1.0.4 con la excepción acotada de `propuesta-enmienda-constitucion.md`. Alternativa descartada: limitar el replay a duplicado y revisión. *Bloquea*: 6.1 (ya desbloqueado).
