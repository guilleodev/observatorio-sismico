# Especificación de la funcionalidad: API y dashboard analítico (F5)

**Rama de la funcionalidad**: `004-api-dashboard` (el proyecto trabaja en `main`; no se crea rama)

**Creada**: 2026-11-07

**Estado**: Borrador (pendiente de aprobar DF1–DF7)

**Entrada**: «Completar la API FastAPI (filtros `start`, `end`, `min_mag`, `country_id`, paginación, estadísticas, ventanas fijas de
1 h UTC, comparación con 2025 y estado de ingesta) y el panel Angular/Leaflet (filtros coherentes, mapa, tabla, gráficas, estado y
errores), respetando el frontend proporcionado.» Corresponde a la fase F5 de `docs/HOJA-DE-RUTA.md` (pasos 5.1 a 5.7; commit
previsto `[F5]`). Requisitos de origen: `ENUNCIADO.md` §8 (panel, puntos 1–7) y §11; `CONTRATO-API.md` (filtros, `truncated`,
`/api/salud`, `/api/estadisticas`, CORS); `FAQ-ALUMNADO.md` (preguntas 20–23); `Guia-entregables-observatorio-sismico.md` (análisis).

**Contexto reutilizado** (no se repite aquí): constitución v1.0.3 (principios II, III, V, VI y VII); F3 (`specs/002-…`, solo lectura):
estado actual `live.evento_actual` con versiones, `retirado`, `estado_ingesta`, error 503 explícito, CORS limitado; F4
(`specs/003-…`, solo lectura): `country_id`/`country_name` reales, `geo.pais`, `historico.evento` (18 302 terremotos de 2025),
`live.hueco`, y las consultas de comparación validadas en `sql/consultas/comparacion.sql` (la «forma» que F5 convierte en API).
`specs/001-…` es solo histórico. **Fuera de alcance**: replay (F6), ngrok, Netlify y despliegue público (F6–F7), la memoria final
(F7; aquí solo el borrador de conclusiones con cifras), agrupación por subregión, autenticación y cualquier servicio nuevo.

## Aclaraciones

### Sesión 2026-11-07 (modo autónomo: se elige la opción más conservadora; las marcadas «requiere aprobación» no se implementan sin ella)

- Q: ¿Los filtros de `/api/eventos` pueden abarcar 2025? → A: **no**. La API de eventos y las estadísticas por hora, país y
  distribución leen solo `live`; fuera de la cobertura real devuelven vacío y la respuesta indica desde cuándo hay datos. El
  histórico solo interviene como línea base agregada de la comparación (FR-013, FR-014); nunca aparece en mapa ni tabla.
- Q: ¿Cómo se filtra «Sin país asignado»? → A: `country_id=sin_pais` (valor reservado, no puede coincidir con un `ADM0_A3`). Un
  código que no existe en el catálogo es un error de parámetro, no una consulta vacía (FR-002, FR-003).
- Q: ¿Qué zona horaria tienen `start` y `end`? → A: UTC. Una fecha sin zona se interpreta como UTC y se documenta; `start` es
  inclusivo y `end` exclusivo; `start ≥ end` es error. Sin ninguno, el periodo es «últimas 24 h» (comportamiento de F3/F4 intacto).
- Q: ¿Qué hace `min_mag` con las magnitudes nulas? → A: no cumplen el umbral y se cuentan aparte (`sin_magnitud`); sin `min_mag`
  se incluyen (FR-004). Un nulo no se sustituye por cero.
- Q: ¿Cuál es el límite de puntos y cómo se pagina? → A: máximo documentado de **5 000** eventos por respuesta (configurable),
  paginación por `limit`/`offset` con orden determinista; `truncated`, `total` y el siguiente `offset` en `metadata` (DF3). Un
  `limit` superior al máximo es error de parámetro, no se recorta en silencio.
- Q: ¿Qué tamaño máximo tiene la serie por hora? → A: 744 casillas (31 días); si se supera, la serie horaria se omite con su motivo y el resto de bloques sigue siendo válido (no se invalida toda la estadística). La serie incluye las
  horas sin eventos con 0 (FR-009).
- Q: ¿Con qué se compara una ventana que no dura 24 h? → A: con la media diaria de 2025 multiplicada por la duración en días de la
  ventana seleccionada (en 24 h, la media diaria). Se aplica el mismo ámbito (global, un país o «sin país») y la magnitud mínima
  efectiva es siempre ≥ 4 en ambos periodos, indicándose si se elevó (FR-013).
- Q: ¿Se filtra por subregión? → A: no; el enunciado dice «país o subregión» y el contrato define `country_id`. La subregión
  existe en `geo.pais` si hiciera falta en el futuro.
- Q: ¿Qué hace el panel con el modo `demo` del frontend proporcionado? → A: se conserva tal cual (mapa estático con aviso); el panel
  analítico solo funciona en modo `api` (FR-016).
- Q: ¿De dónde sale la lista de países del filtro? → A: del catálogo `paises.geojson` que ya entrega el frontend, más «Sin país
  asignado»; sin endpoint nuevo (el contrato solo define tres rutas).
- Q: ¿Qué es «último acceso correcto a la API»? → A: el instante (UTC) de la última respuesta correcta recibida por el navegador;
  «última ingesta» es `last_ingestion` de la API (FR-020).

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia 1 — Consultar eventos con filtros y paginación coherentes (Prioridad: P1)

Quien consulta la API obtiene los terremotos reales de un periodo, con magnitud mínima y país opcionales, sin truncados
silenciosos ni errores disfrazados de «cero eventos».

**Por qué esta prioridad**: sin filtros fiables no hay mapa, tabla ni gráficas coherentes (todo lo demás se apoya en esto).

**Prueba independiente**: con eventos de prueba en una transacción revertida y con la API real, pedir cada filtro y sus
combinaciones y contrastar el recuento con una consulta SQL independiente; recorrer todas las páginas con un límite pequeño.

**Escenarios de aceptación**:

1. **Dado** `start` y `end` ISO 8601, **cuando** se consulta, **entonces** devuelve los eventos con `start ≤ time < end`, una sola
   versión vigente por evento, `mode: "live"` y sin eventos retirados.
2. **Dado** `min_mag=4` y eventos con magnitud nula, **cuando** se consulta, **entonces** los nulos no aparecen y su número consta en
   `metadata` como `sin_magnitud`.
3. **Dado** `country_id=ESP`, `country_id=sin_pais` o un código inexistente, **cuando** se consulta, **entonces** devuelve los
   eventos de ese país, los «sin país» o un error 422 explícito, respectivamente.
4. **Dado** más eventos que el límite, **cuando** se consulta, **entonces** `truncated` es `true`, `total` es el recuento completo y
   recorrer las páginas devuelve cada evento exactamente una vez.
5. **Dado** un parámetro inválido (fecha, orden de fechas, magnitud no numérica, `limit` fuera de rango), **cuando** se consulta,
   **entonces** responde 422 con `{error, detail}`; nunca ignora el filtro ni devuelve una lista vacía como éxito.
6. **Dado** que PostgreSQL falla, **cuando** se consulta, **entonces** responde 503 explícito (comportamiento de F3 intacto).

---

### Historia 2 — Estadísticas coherentes con los mismos filtros (Prioridad: P1)

`/api/estadisticas` devuelve, para exactamente los mismos filtros, los recuentos por hora UTC y por país (incluido «Sin país
asignado») y las distribuciones de magnitud y profundidad, indicando periodo, filtros, unidad y registros sin valor.

**Por qué esta prioridad**: son las visualizaciones centrales del enunciado (§8, puntos 2 y 3).

**Prueba independiente**: para varias combinaciones de filtros, comprobar que la suma de cada bloque coincide con el `total` de
`/api/eventos` y con una consulta SQL independiente, también cuando el listado está truncado.

**Escenarios de aceptación**:

1. **Dado** un periodo con eventos, **cuando** se piden estadísticas, **entonces** cada bloque trae periodo, filtros aplicados,
   unidad y número de registros sin valor, y las sumas coinciden con el recuento de eventos del mismo filtro.
2. **Dado** una ventana de varias horas con horas sin eventos, **cuando** se pide la serie horaria, **entonces** incluye esas
   horas con 0 y asigna cada evento a la hora UTC de su tiempo de **evento**, no del de ingesta.
3. **Dado** una revisión que cambia la hora, la magnitud o el país de un evento, **cuando** se vuelve a calcular, **entonces** las
   cifras reflejan la versión vigente sin contar el evento dos veces (se calculan desde el estado actual, no con contadores).
4. **Dado** un listado truncado por el límite, **cuando** se piden estadísticas, **entonces** se calculan sobre todos los eventos
   que cumplen el filtro, no sobre la página devuelta.
5. **Dado** eventos sin profundidad o sin magnitud, **cuando** se calculan las distribuciones, **entonces** se cuentan en
   «sin valor» y no en el intervalo cero.

---

### Historia 3 — Comparación con el histórico de 2025 (Prioridad: P2)

El panel compara el recuento del periodo seleccionado con lo esperado según la media diaria de 2025 bajo los mismos filtros de
ámbito y de magnitud, y advierte de que el último periodo puede estar incompleto.

**Por qué esta prioridad**: es la comparación que pide el enunciado (§8, punto 4); depende de las historias 1 y 2.

**Prueba independiente**: contrastar el resultado para el filtro global, para un país y para «sin país» con las consultas de
referencia de F4 y con un recuento independiente (total de 2025 entre 365).

**Escenarios de aceptación**:

1. **Dado** magnitud mínima ≥ 4 y ámbito global, **cuando** se compara las últimas 24 h, **entonces** el valor de referencia es el
   total de 2025 entre 365 (días de cero eventos incluidos) y se informa de la variación.
2. **Dado** un país o «sin país», **cuando** se compara, **entonces** el mismo ámbito se aplica al periodo reciente y al histórico.
3. **Dado** un umbral inferior a 4, **cuando** se compara, **entonces** se compara a ≥ 4 en ambos periodos y la respuesta lo indica.
4. **Dado** una media histórica de 0, **cuando** se calcula la variación, **entonces** queda «no definida».
5. **Dado** un hueco de ingesta pendiente, una ventana que empieza antes de la cobertura real o que llega hasta «ahora», **cuando**
   se compara, **entonces** el periodo reciente se marca como posiblemente incompleto y se indica el motivo.
6. **Dado** la comparación, **cuando** se consulta, **entonces** el histórico no se mezcla con el recuento reciente: cada cifra
   indica su fuente (`live` o `historico`).

---

### Historia 4 — El panel aplica los filtros a mapa, tabla y gráficas a la vez (Prioridad: P1)

Quien usa el panel elige periodo, magnitud mínima y país, y el mapa, la tabla, las gráficas y la comparación muestran el mismo
conjunto de datos y las mismas cifras. Se construye sobre el frontend proporcionado.

**Por qué esta prioridad**: es el producto visible que se evalúa (§8, puntos 1, 5 y 7).

**Prueba independiente**: con la API real, aplicar al menos cinco combinaciones de filtros y comprobar que el recuento del mapa, el
de la tabla y el total de las gráficas coinciden; seleccionar un evento en la tabla y verlo resaltado en el mapa.

**Escenarios de aceptación**:

1. **Dado** el panel abierto, **cuando** se cambia un filtro, **entonces** mapa, tabla, gráficas y comparación se actualizan con la
   misma ventana y los mismos filtros, y se muestra qué filtros están activos.
2. **Dado** un evento sin magnitud o sin profundidad, **cuando** se muestra, **entonces** el mapa lo dibuja con tratamiento visible
   de nulo (leyenda) y la tabla escribe «sin valor».
3. **Dado** la tabla de eventos, **cuando** se ordena, busca o pagina, **entonces** es utilizable por teclado y ofrece la misma
   información que el mapa sin depender del color.
4. **Dado** un evento seleccionado en la tabla o en el mapa, **cuando** se elige, **entonces** el otro componente lo resalta.
5. **Dado** el modo `demo` de `config.json`, **cuando** se abre el panel, **entonces** se comporta como el frontend proporcionado
   (mapa estático con aviso) y no intenta consultar la API.

---

### Historia 5 — Estado del sistema, errores y ausencia de datos visibles (Prioridad: P2)

El panel muestra el último acceso correcto a la API, la última ingesta de USGS, el periodo consultado y distingue «no hay datos»,
«datos desactualizados», «truncado» y «no puedo hablar con el backend».

**Por qué esta prioridad**: evita presentar silencio como normalidad (§8, punto 6; contrato: error explícito).

**Prueba independiente**: simular un reloj desfasado, un filtro sin eventos, un listado truncado, un tiempo de espera agotado y un
503, y comprobar el aviso de cada caso.

**Escenarios de aceptación**:

1. **Dado** una ingesta más antigua que el umbral configurado, **cuando** se consulta `/api/salud`, **entonces** `stale` es
   `true`, indica la antigüedad y el panel muestra el aviso; al reanudarse la ingesta, desaparece.
2. **Dado** un filtro sin eventos, **cuando** el panel recibe `features: []`, **entonces** muestra «sin eventos para estos filtros»,
   no un error.
3. **Dado** un 503, un fallo de red o el tiempo de espera agotado, **cuando** el panel intenta actualizar, **entonces** muestra un
   aviso de «sin conexión con el backend», conserva la última lectura con su antigüedad y no la presenta como actual.
4. **Dado** un listado truncado, **cuando** se muestra, **entonces** el panel lo indica, ofrece cargar el resto y las estadísticas
   siguen siendo completas.
5. **Dado** un hueco de ingesta pendiente (F4), **cuando** se consulta el estado, **entonces** consta en `/api/salud` y en el panel.

---

### Historia 6 — Consultas medidas y conclusiones con cifras (Prioridad: P3)

Las consultas se miden con y sin índice, se registran los tiempos de respuesta reales y se redactan al menos tres conclusiones
fundamentadas con cifras, filtros y periodo.

**Por qué esta prioridad**: respalda la defensa (§10–§11) y la memoria de F7; no bloquea las demás historias.

**Prueba independiente**: repetir las mediciones con un volumen real mayor (histórico copiado a una base temporal) y regenerar las
conclusiones a partir de la API con los mismos filtros.

**Escenarios de aceptación**:

1. **Dado** las consultas de la API, **cuando** se ejecutan con `EXPLAIN ANALYZE` con y sin índice, **entonces** se registra el plan
   y el tiempo, y solo se añade un índice si mejora de forma apreciable.
2. **Dado** el panel en uso real, **cuando** se mide el tiempo de respuesta de cada endpoint, **entonces** se registra con la
   mediana y el percentil 95; los umbrales se proponen tras medir y los confirma la persona estudiante.
3. **Dado** los datos reales, **cuando** se redactan las conclusiones, **entonces** cada una cita cifra, filtro, periodo y la
   cautela de que no es una predicción ni una evaluación de riesgo.

### Casos límite

- Evento en el límite exacto de una hora (`hh:00:00.000`): pertenece a la ventana que empieza en esa hora; el fin es exclusivo.
- `start` o `end` en el futuro, o un periodo anterior a la primera ingesta: respuesta vacía válida con la cobertura indicada, no error.
- Un país con eventos en el feed pero sin entrada en el selector, o un código en minúsculas: se acepta sin distinguir mayúsculas; nunca se ignora.
- Una revisión de USGS mueve el evento de una hora o de un país a otro mientras el panel lo muestra: la siguiente actualización lo
  refleja sin duplicarlo; entre dos peticiones separadas puede haber un desfase inevitable, por eso el panel envía la **misma**
  ventana explícita a las peticiones de un mismo refresco.
- Respuesta de eventos con 5 000 puntos: el mapa sigue siendo fluido (dibujo en canvas del frontend proporcionado) y la tabla
  pagina en el navegador.
- Magnitudes negativas o profundidades negativas válidas del feed: se aceptan y se clasifican en el primer intervalo.
- Varias pestañas o refrescos solapados: una respuesta tardía de una petición anterior no pisa a la más reciente.
- Reloj del navegador desajustado: los avisos de antigüedad se basan en `generated` de la API, no en el reloj del navegador; la ventana de los filtros también se calcula con ese instante.
- Texto de `place` o de la API con caracteres especiales: nunca se inserta como HTML.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Eventos y filtros (paso 5.1)**

- **FR-001**: `GET /api/eventos` MUST seguir cumpliendo `CONTRATO-API.md` (FeatureCollection, una versión vigente por evento,
  milisegundos UTC, coordenadas `[lon, lat, profundidad]`, `null` y nunca NaN/Infinity, `features: []` sin eventos) y, sin
  parámetros, devolver las últimas 24 h; los campos previos de la respuesta conservan nombre y significado (se añaden otros).
- **FR-002**: La API MUST admitir los filtros `start` (inclusivo), `end` (exclusivo), `min_mag` y `country_id` (`ADM0_A3` del
  catálogo o `sin_pais`), combinables entre sí (conjunción) y con idéntica semántica en `/api/eventos` y `/api/estadisticas`.
- **FR-003**: La API MUST validar los parámetros y responder 422 con `{error, detail}` ante fechas ilegibles, `start ≥ end`,
  magnitud no numérica o no finita, código de país inexistente o `limit`/`offset` fuera de rango; MUST NOT ignorarlos ni
  sustituirlos en silencio. Una fecha sin zona se interpreta como UTC.
- **FR-004**: Un evento con magnitud nula MUST NOT cumplir un `min_mag` y MUST contarse aparte (`sin_magnitud`) en la respuesta.
- **FR-005**: `/api/eventos` MUST aplicar un máximo documentado de eventos por respuesta; si trunca, MUST indicar `truncated: true`,
  el `total` completo y el mecanismo de paginación (`limit`, `offset` y siguiente `offset`) con orden determinista, de modo que
  recorrer las páginas devuelva cada evento una vez.
- **FR-006**: `/api/eventos` MUST leer solo datos `live` no retirados, con `mode: "live"`; los datos históricos, sintéticos o de
  replay MUST NOT aparecer en él.
- **FR-007**: Si PostgreSQL falla o una consulta supera su tiempo máximo, todo endpoint de datos MUST responder un error explícito
  (503), nunca una lista o estadística vacía como si fuera un resultado válido.

**Estadísticas (pasos 5.2 y 5.3)**

- **FR-008**: `GET /api/estadisticas` MUST aceptar los mismos filtros y devolver el periodo y los filtros aplicados y, en cada bloque, la unidad y el número de registros sin valor.
- **FR-009**: Debe incluir recuentos por **ventana fija de una hora UTC** usando el tiempo del evento, con las horas sin eventos
  presentes con 0, y, si la ventana necesita más de 744 casillas (31 días), omitir solo ese bloque con el motivo `ventana_demasiado_amplia` sin invalidar los demás.
- **FR-010**: Debe incluir recuentos por país, con «Sin país asignado» como categoría propia (`country_id` nulo, nunca el país más
  cercano), y su nombre.
- **FR-011**: Debe incluir las distribuciones de magnitud y de profundidad con intervalos fijos y documentados, y el número de
  registros sin valor de cada una.
- **FR-012**: Todas las cifras MUST calcularse en el momento desde el estado actual (`live.evento_actual`, sin retirados), no con
  contadores por mensaje; MUST calcularse sobre todos los eventos del filtro y MUST NOT derivarse de una página truncada.
- **FR-013**: Debe incluir la comparación del periodo seleccionado con la media diaria de 2025 (histórico) bajo el mismo ámbito y
  la misma magnitud mínima efectiva (≥ 4, indicada si se elevó), tipo `earthquake` y tiempo del evento en UTC, con los días de cero
  eventos en el denominador, la variación «no definida» si la media es 0, el valor esperado para la duración de la ventana y la
  fuente de cada cifra.
- **FR-014**: La comparación MUST marcar `periodo_reciente_incompleto` con su motivo (hueco de ingesta pendiente, ventana que
  empieza antes de la cobertura real o que llega hasta el instante actual) y la respuesta MUST indicar desde cuándo hay datos en
  tiempo real.

**Estado (paso 5.6, parte del backend)**

- **FR-015**: `GET /api/salud` MUST conservar `status`, `database` y `last_ingestion` y añadir, sin credenciales ni rutas internas,
  `generated`, la antigüedad de la última ingesta, un indicador `stale` con umbral configurable (DF4) y el número de huecos de
  ingesta pendientes.

**Panel (pasos 5.4 a 5.6)**

- **FR-016**: El panel MUST construirse sobre el frontend proporcionado (mantiene el mapa con sus capas, la lectura robusta con
  tiempo de espera y la cabecera `ngrok-skip-browser-warning`, `config.json` y el modo `demo`), consultar solo nuestra API, nunca
  USGS, y no incluir secretos en `config.json` ni en el código.
- **FR-017**: Los filtros de fecha, magnitud y país MUST definirse en un único lugar y aplicarse a la vez al mapa, la tabla, las
  gráficas y la comparación, usando la misma ventana explícita en todas las peticiones de un refresco, calculada con el instante `generated` de la API (`/api/salud`), no con el reloj del navegador.
- **FR-018**: El mapa MUST mantener círculos con tamaño por magnitud, color por profundidad, leyenda, ficha del evento y
  tratamiento visible de nulos; una **tabla consultable** (ordenar, buscar, paginar) MUST ofrecer los mismos eventos como
  alternativa al mapa y al color, con selección sincronizada con el mapa.
- **FR-019**: Las gráficas MUST mostrar recuentos por hora UTC, por país (incluido «Sin país asignado»), distribuciones de
  magnitud y profundidad con sus «sin valor» y la comparación con 2025 con el aviso de periodo incompleto; todo número MUST venir
  de `/api/estadisticas` y MUST NOT calcularse en el navegador a partir de las features.
- **FR-020**: El panel MUST mostrar el último acceso correcto a la API, la última ingesta de USGS, el periodo consultado y los
  filtros activos, y avisar cuando los datos estén desactualizados, estén truncados, no haya eventos para el filtro o el backend no
  responda, conservando la última lectura con su antigüedad.
- **FR-021**: El panel MUST ser accesible: la información codificada por color o tamaño también está en texto, toda la
  funcionalidad es operable con teclado, los estados usan regiones `aria-live` y ningún texto de la API se inserta como HTML.
- **FR-022**: Una petición tardía MUST NOT sustituir a una más reciente, y la actualización automática MUST conservar los filtros
  activos.

**Transversales**

- **FR-023**: Se mantienen los cinco servicios de Docker Compose; F5 modifica solo el servicio `api` y el frontend, no añade
  servicios, no recrea Kafka ni PostgreSQL y no cambia CORS (hoy solo el origen de desarrollo; el de Netlify se añade en F6–F7). No se
  exponen rutas de administración ni secretos; la API solo lee, nunca escribe.
- **FR-024**: Cada consulta de la API MUST medirse con `EXPLAIN ANALYZE` y el tiempo de respuesta de cada endpoint MUST registrarse
  con datos reales; un índice nuevo solo se añade si la medición lo justifica.
- **FR-025**: Cada comportamiento MUST tener una prueba ejecutada con resultado real en `docs/evidencias/f5/`. Las pruebas con
  PostgreSQL usan transacciones que se revierten o una base temporal; MUST NOT escribir en tablas definitivas ni borrar datos.
- **FR-026**: Las conclusiones (al menos tres) MUST citar cifra, filtros y periodo obtenidos de la API real, y MUST NOT
  presentarse como predicción de terremotos ni como evaluación de riesgo.

### Entidades clave

- **Filtros**: periodo `[start, end)` UTC, magnitud mínima y ámbito geográfico (un país o «sin país»); idénticos para eventos,
  estadísticas y panel.
- **Página de eventos**: eventos de un filtro más `total`, `truncated`, `limit`, `offset` y `sin_magnitud`.
- **Estadísticas**: bloques por hora, por país y distribuciones de magnitud y profundidad, cada uno con periodo, filtros, unidad y
  «sin valor».
- **Comparación**: recuento del periodo seleccionado, valor esperado según 2025, variación o «no definida», magnitud efectiva,
  fuente de cada cifra y marca de periodo incompleto.
- **Estado del sistema**: última ingesta, antigüedad, `stale`, huecos pendientes y cobertura real de datos en tiempo real.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: Las respuestas de los tres endpoints cumplen la forma documentada en `contracts/api-f5.md` y `CONTRATO-API.md`
  (comprobada con pruebas de estructura), con 0 valores NaN/Infinity y 0 respuestas vacías ante un fallo de base de datos.
- **SC-002**: En al menos 12 combinaciones de filtros (periodo, magnitud, país, «sin país», magnitud nula, sin eventos), el
  recuento de `/api/eventos` (todas las páginas), el `total` de `/api/estadisticas` y una consulta SQL independiente coinciden en
  el 100 %.
- **SC-003**: Con un límite pequeño, recorrer las páginas devuelve cada evento una vez (0 duplicados, 0 omitidos), `truncated` y
  `total` son correctos, y las estadísticas con y sin truncado son idénticas.
- **SC-004**: La suma de la serie horaria, de los países y de cada distribución más «sin valor» es igual al total del filtro en
  el 100 % de las combinaciones de SC-002; un evento en el límite de una hora y una revisión que cambia la hora o el país se
  asignan a la ventana y al país correctos sin duplicarse.
- **SC-005**: La comparación coincide con el recuento independiente de F4 (total de 2025 entre 365) para el filtro global, un país y
  «sin país»; la variación es «no definida» con media 0; el umbral inferior a 4 se eleva y se indica; y cada motivo de periodo
  incompleto (hueco, antes de la cobertura, hasta ahora) se prueba.
- **SC-006**: Con la base de datos inalcanzable (recurso temporal, no el servicio real), los tres endpoints responden un error
  explícito y el panel muestra «sin conexión con el backend» conservando la última lectura con su antigüedad.
- **SC-007**: El aviso de datos desactualizados aparece cuando la última ingesta supera el umbral (probado con un reloj simulado)
  y desaparece al reanudarse; un filtro sin eventos muestra «sin eventos», distinto del aviso de error.
- **SC-008**: En el navegador, con datos reales y al menos cinco combinaciones de filtros, el recuento del mapa, el de la tabla y
  el total de las gráficas coinciden; seleccionar un evento lo resalta en el otro componente; el modo `demo` sigue funcionando.
- **SC-009**: La tabla es operable con teclado y toda la información de color y tamaño está también en texto (comprobación
  manual registrada con capturas); ningún texto externo se inserta como HTML.
- **SC-010**: Se registran, con datos reales, la mediana y el p95 del tiempo de respuesta de cada endpoint y los planes
  `EXPLAIN ANALYZE` con y sin índice de las consultas de la API. Los umbrales se proponen tras medir y los confirma la persona
  estudiante; hasta entonces el criterio figura como «medido, umbral pendiente».
  **Umbrales confirmados el 2026-11-08, DESPUÉS de las mediciones de 5.7** (no son predicciones previas; se fijaron a la vista de los p95 medidos en esta máquina):
  `/api/salud` p95 ≤ 50 ms, `/api/eventos` p95 ≤ 100 ms, `/api/estadisticas` p95 ≤ 250 ms y, en la prueba a gran escala (≈ 183 000 filas), p95 ≤ 500 ms.
  Criterio para incorporar índices nuevos: mejora mínima de 2× y de al menos 1 ms.
- **SC-011**: Al menos tres conclusiones con cifra, filtro y periodo se reproducen desde la API con los mismos filtros.
- **SC-012**: 0 filas históricas en `/api/eventos`; 0 escrituras de pruebas en tablas definitivas; 0 volúmenes o datos borrados;
  cinco servicios `healthy` con lag 0 y reconciliación vacía; los documentos del profesor, `specs/001`–`003` y el catálogo de
  países sin cambios; y la suite anterior (419 pruebas) pasa, con las únicas adaptaciones justificadas y listadas (`test_api_eventos.py`, `test_last_ingestion.py` y sus dobles, por los campos nuevos de `metadata` y de `/api/salud`).

## Supuestos

Decisiones conservadoras tomadas al especificar (a revisar en el plan; ninguna cambia requisitos del profesor):

- **A-01**: La cobertura real de `live` empieza con la primera ingesta real menos las 24 h que ya traía el feed (`min(ingested_at) − 24 h`, como en F4) menos las 24 h que ya traía el feed (`min(ingested_at) − 24 h`, como en F4) (hoy 2026-11-05 16:56 UTC, 376 eventos); no se
  inventan datos anteriores y la API lo indica. Las comparaciones se hacen dentro de esa cobertura.
- **A-02**: El histórico de 2025 (magnitud ≥ 4, solo `earthquake`) es una instantánea; el reciente es preliminar y puede cambiar.
  La media anual está inflada por réplicas (se muestra también la mediana diaria como complemento, F4).
- **A-03**: La API solo lee. Lee `live` para eventos y estadísticas, y `historico.evento` y `geo.pais` solo para la comparación y
  los nombres de país; nunca `sintetico`.
- **A-04**: Las agregaciones son SQL parametrizado sobre PostgreSQL 17, sin PostGIS, sin Spark ni caché nueva; el volumen en vivo
  es de cientos a pocos miles de filas, así que no se presupone ningún índice hasta medirlo.
- **A-05**: El frontend se extiende con componentes y servicios propios sin sustituir el componente proporcionado (DF1); las
  gráficas no añaden dependencias (DF2).
- **A-06**: `GET` y `OPTIONS` son los únicos métodos; las funciones de documentación automática de FastAPI no exponen secretos.
- **A-07**: Las pruebas del frontend se limitan a la lógica pura y a la comprobación en el navegador integrado (DF5).
- **A-08**: La publicación en Netlify y el túnel ngrok son de F6–F7; F5 se valida en local contra `http://127.0.0.1:8000`.

## Decisiones que requieren aprobación

Se aprueban **juntas, una sola vez, en T001** (cada punto de control solo pide autorización para seguir); la tabla resumen y lo que bloquea cada una están en
[plan.md](plan.md). DF6 y DF7 se piden por separado porque cambian el alcance de lectura de la API y las convenciones del contrato.

- **DF1 — Frontend**: extender el frontend proporcionado (conservar el componente del mapa, `config.json` y el modo `demo`; añadir
  componentes y un servicio de API) o sustituirlo por una aplicación nueva. *Recomendada*: extender. Levanta la restricción de F4
  de «no tocar Angular» solo para los archivos de `frontend/src/app/` y `frontend/public/config.json` (sin tocar el catálogo).
- **DF2 — Gráficas**: dibujarlas con SVG/HTML propios en Angular, sin dependencia nueva, o añadir una biblioteca (p. ej. Chart.js).
  *Recomendada*: propias, por simplicidad, accesibilidad y por poder explicar cada línea en la defensa.
- **DF3 — Contrato ampliado**: extensiones **aditivas** compatibles con el contrato: parámetros `limit` y `offset`, y `total`,
  `limit`, `offset`, `next_offset`, `sin_magnitud` y `coverage` en `metadata`; `/api/salud` y `/api/estadisticas` con la estructura de
  `contracts/api-f5.md`. *Recomendada*: sí; alternativa: paginación por cursor (más robusta ante inserciones, más compleja).
- **DF4 — Datos desactualizados**: umbral de 300 s (cinco ciclos de 60 s del productor) configurable con `INGESTA_OBSOLETA_S`.
  *Recomendada*: 300 s; alternativa: 600 s. Se confirma con la medición del ciclo real en 5.6.
- **DF5 — Pruebas del frontend**: lógica pura probada con `node --test` (Node 24, sin dependencias nuevas) y comprobación del panel
  en el navegador integrado con capturas; alternativa: Karma/Jasmine (devDependencies pesadas y navegador de pruebas).
  *Recomendada*: `node --test` más navegador.
- **DF6 — Lectura del histórico por la API**: `api/comparacion.py` lee `historico.evento` (solo `SELECT` agregado) con el mismo rol de PostgreSQL que el resto de la API,
  porque el enunciado (§8.4) exige la comparación con 2025. *Recomendada*: sí, con una prueba que limita esa lectura a ese módulo; alternativa: rol de solo lectura
  distinto (más seguro, cambio de base de datos fuera de F5) o materializar la media en `live` (mezcla almacenes). *Bloquea*: 5.3.
- **DF7 — Convenciones propias del contrato** (aprobación en bloque, 'sí/no' por cada una): (a) `country_id=sin_pais` como valor reservado para «Sin país asignado»;
  (b) 422 y no recorte silencioso ante un `limit` excesivo o parámetros inválidos; (c) máximo de 5 000 eventos por respuesta; (d) serie horaria omitida con motivo si
  supera 744 casillas; (e) esperado de una ventana = media diaria de 2025 × duración en días. *Recomendadas*: todas.
- **DF6 — Lectura del histórico por la API**: `api/comparacion.py` lee `historico.evento` (solo `SELECT` agregado) con el mismo rol de PostgreSQL que el resto de la API,
  porque el enunciado (§8.4) exige la comparación con 2025. *Recomendada*: sí, con una prueba que limita esa lectura a ese módulo; alternativa: rol de solo lectura
  distinto (más seguro, cambio de base de datos fuera de F5) o materializar la media en `live` (mezcla almacenes). *Bloquea*: 5.3.
- **DF7 — Convenciones propias del contrato** (aprobación en bloque, 'sí/no' por cada una): (a) `country_id=sin_pais` como valor reservado para «Sin país asignado»;
  (b) 422 y no recorte silencioso ante un `limit` excesivo o parámetros inválidos; (c) máximo de 5 000 eventos por respuesta; (d) serie horaria omitida con motivo si
  supera 744 casillas; (e) esperado de una ventana = media diaria de 2025 × duración en días. *Recomendadas*: todas.
