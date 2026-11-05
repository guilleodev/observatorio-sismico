# Especificación de la funcionalidad: Ingesta real y calidad de datos (F3)

**Rama de la funcionalidad**: `002-ingesta-real-calidad` (el proyecto trabaja en `main`; no se crea rama)

**Creada**: 2026-11-05

**Estado**: Borrador

**Entrada**: «Sustituir el esqueleto del servicio productor por la ingesta real del feed `all_day.geojson` de USGS cada
60 s; conservar el original y los metadatos de extracción; publicar a Kafka versiones nuevas y revisiones; persistir con
transacción y offset tras el commit; detectar duplicados y versiones; validar calidad con cuarentena; registrar el estado
de ingesta; comprobar la retención; probar fallos, reinicios y recuperación.» Corresponde a la fase F3 de
`docs/HOJA-DE-RUTA.md` (pasos 3.2 a 3.7; el paso 3.1 ya está completado; commit previsto `[F3]`).
Requisitos de origen: `ENUNCIADO.md` §4.1, §5, §6, §7, §9 y §11; `CONTRATO-API.md`; `FAQ-ALUMNADO.md` (preguntas sobre
versiones, cuarentena y estado de ingesta); `docs/FASE-1-FUENTES-Y-FRONTEND.md` (reglas de calidad observadas).

**Contexto reutilizado** (no se repite aquí): constitución v1.0.3 (en especial los principios III y IV);
`specs/001-mvp-evento-sintetico/` solo como histórico del MVP (no se modifica); modos contractuales `live`/`replay`;
esquema `live` provisional del paso 3.1; consumidor con offset confirmado tras guardar; `/api/eventos` y `/api/salud`
ya existentes. **Fuera de alcance**: geografía y países (F4), histórico 2025 y recuperación de huecos de más de 24 h con
el catálogo histórico (F4; aquí solo se documenta), estadísticas, filtros y panel (F5), reproducción `replay` (F6),
ngrok y Netlify (F6–F7).

## Aclaraciones

### Sesión 2026-11-05 (modo autónomo: se elige la opción más conservadora)

- Q: ¿Cómo se mide el ciclo de 60 s? → A: entre inicios de consulta, sin solapar consultas; si una consulta dura más de
  60 s, la siguiente empieza al terminar (FR-001, SC-001).
- Q: ¿Qué reintentos se hacen dentro de un ciclo? → A: hasta 3 reintentos con espera progresiva (5, 10 y 20 s) y, si
  USGS envía `Retry-After` en un 429, se respeta; agotados, se espera al ciclo siguiente sin bloquearlo (FR-007, SC-008).
- Q: ¿Qué pasa si la versión más reciente de un evento es inválida? → A: va a cuarentena y el estado actual conserva la
  última versión válida; una versión posterior válida se procesa con normalidad y la cuarentena se conserva (FR-009, FR-014).
- Q: ¿Qué pasa si una revisión reclasifica un terremoto como no sísmico? → A: **decisión de tratamiento de datos que
  requiere aprobación**: el evento deja el estado actual (no se muestra como terremoto), se conserva todo su historial y se
  registra la exclusión con motivo (FR-012). Conservadora respecto a no mostrar como terremoto algo que USGS ya no lo es.
- Q: ¿Cómo se evita procesar eventos reales a medias durante el desarrollo? → A: modo seco del productor hasta tener el
  consumidor definitivo (A-11, R-015).
- Q: ¿Qué es la «referencia al original» de la cuarentena? → A: la clave y el `(topic, partición, offset)` del mensaje
  **más** una copia del contenido recibido (los offsets no son únicos si se recrea el transporte) (FR-014).

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia 1 — El sistema consulta USGS cada minuto y publica solo lo nuevo (Prioridad: P1)

Cada 60 segundos el sistema obtiene la ventana móvil de 24 h de terremotos de USGS. Conserva la respuesta original y los
datos de la consulta, y envía al transporte únicamente los eventos nuevos y las revisiones posteriores; omite las
versiones ya publicadas.

**Por qué esta prioridad**: sin ingesta real no hay datos que analizar; es el primer paso del circuito y el objetivo de F3.

**Prueba independiente**: con el sistema en marcha durante varios ciclos, comprobar que cada ciclo queda registrado, que
solo se publican versiones nuevas y que un fallo del origen no borra lo ya válido (también sin consumidor ni API).

**Escenarios de aceptación**:

1. **Dado** un evento que no se había visto, **cuando** aparece en la respuesta de USGS, **entonces** se publica una
   versión con su identificador como clave y `mode = live`, y solo tras la confirmación del transporte se marca como publicada.
2. **Dado** una versión ya publicada, **cuando** vuelve a aparecer idéntica en la ventana siguiente, **entonces** no se
   vuelve a publicar.
3. **Dado** un evento ya publicado, **cuando** su `updated` es posterior, **entonces** se publica la revisión.
4. **Dado** un fallo del origen (tiempo agotado, HTTP 429 o 5xx, JSON inválido), **cuando** ocurre una consulta, **entonces**
   se registra el error, se reintenta con espera progresiva y el estado anterior válido no se borra.
5. **Dado** que cada consulta se registra, **cuando** pasan los ciclos, **entonces** la respuesta original completa se
   conserva solo mientras dura su plazo de retención y no se acumulan copias idénticas indefinidamente.

---

### Historia 2 — Cada evento tiene una única versión actual y se conserva el historial (Prioridad: P1)

El sistema guarda, por cada evento, su versión actual y el historial de versiones recibidas. Una revisión más reciente
actualiza el estado actual; una versión antigua que llega tarde no lo sustituye; un mensaje repetido no cambia los recuentos.

**Por qué esta prioridad**: es el núcleo técnico evaluado (duplicados, revisiones y reinicios); sin esto los datos no son fiables.

**Prueba independiente**: enviar al transporte secuencias controladas (nuevo, repetido, posterior, antiguo) y comprobar
las filas del estado actual y del historial.

**Escenarios de aceptación**:

1. **Dado** un evento nuevo, **cuando** se procesa, **entonces** hay una fila de estado actual y una de historial.
2. **Dado** la misma versión, **cuando** se procesa otra vez, **entonces** los recuentos no cambian.
3. **Dado** una versión con `updated` posterior, **cuando** se procesa, **entonces** el estado actual cambia y el historial
   conserva ambas versiones.
4. **Dado** que ya existe una versión posterior, **cuando** llega una versión con `updated` anterior, **entonces** se
   guarda en el historial pero no sustituye al estado actual.
5. **Dado** que la escritura falla, **cuando** el consumidor reintenta, **entonces** el consumo no se confirma hasta guardar
   y el resultado final no tiene duplicados.

---

### Historia 3 — Los registros dudosos o no sísmicos no contaminan los datos (Prioridad: P2)

El sistema valida cada evento con reglas explícitas. Los eventos que no son terremotos se excluyen conservando el motivo;
los registros que no se pueden tratar van a cuarentena con su motivo y referencia al original; los valores poco habituales
pero válidos se conservan.

**Por qué esta prioridad**: protege la calidad y evita puntos inventados, pero depende de que ya exista el flujo de la
Historia 2.

**Prueba independiente**: procesar eventos preparados (explosión, coordenadas inválidas, magnitud nula, magnitud 0,
profundidad negativa) y comprobar dónde queda cada uno.

**Escenarios de aceptación**:

1. **Dado** un evento con tipo distinto de `earthquake`, **cuando** se procesa, **entonces** no entra en el estado actual y
   queda registrado con el motivo de exclusión.
2. **Dado** coordenadas fuera de rango, no finitas o geometría que no es un punto, **cuando** se procesa, **entonces** va a
   cuarentena con motivo y referencia al original, y no aparece ningún punto.
3. **Dado** una magnitud nula, **cuando** se procesa, **entonces** se conserva como nula (nunca como 0).
4. **Dado** una magnitud 0 o una profundidad negativa, **cuando** se procesa, **entonces** se conservan como válidas.
5. **Dado** un mensaje ilegible, **cuando** se procesa, **entonces** va a cuarentena sin bloquear el resto de la cola.
6. **Dado** un caso de prueba artificialmente dañado, **cuando** se almacena, **entonces** queda identificado como de prueba
   y separado de los datos reales.

---

### Historia 4 — Se sabe cuándo fue la última ingesta correcta y qué se retiene (Prioridad: P2)

El sistema registra cada consulta y su resultado, y la API informa del instante de la última consulta correcta a USGS. Se
comprueba que la retención del transporte es la prevista.

**Por qué esta prioridad**: permite distinguir «la API responde» de «los datos están al día» (`CONTRATO-API.md`).

**Prueba independiente**: provocar fallos de consulta y comprobar que `last_ingestion` no avanza; recuperar y comprobar que sí.

**Escenarios de aceptación**:

1. **Dado** que aún no hubo ninguna consulta correcta, **cuando** se consulta la API, **entonces** `last_ingestion` es `null`.
2. **Dado** una consulta correcta, **cuando** se consulta la API, **entonces** `last_ingestion` es el instante de esa consulta.
3. **Dado** consultas fallidas posteriores, **cuando** se consulta la API, **entonces** `last_ingestion` conserva el de la última correcta.
4. **Dado** la política de retención del transporte, **cuando** se comprueba la configuración efectiva, **entonces** coincide con
   la documentada.

---

### Historia 5 — El sistema se recupera de fallos y reinicios sin duplicar (Prioridad: P3)

Tras la parada de cualquier servicio, el sistema se recupera sin perder eventos ni duplicar efectos ya guardados.

**Por qué esta prioridad**: cierra la fase demostrando la tolerancia a fallos exigida en la demostración.

**Prueba independiente**: reiniciar el productor, el consumidor, el transporte y la base, y comprobar recuentos y desfase.

**Escenarios de aceptación**:

1. **Dado** un reinicio del consumidor, **cuando** vuelve, **entonces** reanuda sin duplicar lo ya guardado ni saltar nada.
2. **Dado** que el productor cae entre la confirmación del transporte y el marcado como publicada, **cuando** vuelve,
   **entonces** puede reenviar esa versión y el consumidor la tolera.
3. **Dado** que el transporte o la base están caídos, **cuando** se recuperan, **entonces** el flujo se reanuda solo.
4. **Dado** que el productor estuvo parado más de 24 h, **cuando** vuelve, **entonces** el hueco se documenta como pendiente
   de recuperar con el catálogo histórico (fase F4).

### Casos límite

- La respuesta tiene cero eventos o falta `features`: no es un error de ingesta; se registra el recuento.
- Un identificador aparece dos veces en una misma respuesta: se trata la versión de `updated` mayor y se registra la anomalía.
- Faltan `id`, `updated` o `time` en un evento: a cuarentena con motivo.
- Un evento sale de la ventana de 24 h: **no** se borra ni se considera eliminado por USGS (limitación documentada: la
  reconciliación de eventos eliminados o fusionados fuera del feed no se implementa).
- Llega una versión antigua tras una posterior: se conserva en el historial sin sustituir a la actual.
- USGS responde lento, con `429` o `5xx`, o con JSON inválido: se reintenta con espera progresiva y no se pierde el estado.
- El transporte no confirma la publicación: la versión no se marca como publicada y se reintenta.
- La base no está disponible al consumir: no se confirma el consumo; al volver se reprocesa sin duplicados.
- Una respuesta idéntica a la anterior (mismos eventos): se registra la consulta, pero no se acumula otra copia completa.
- El reloj o la hora del evento están en el futuro respecto a la ingesta: se conserva el valor original y se señala.
- Un mensaje con modo distinto de `live` llega al topic de ingesta real: se descarta con motivo (ya cubierto en el paso 3.1).
- La versión más reciente de un evento es inválida: va a cuarentena y el estado actual conserva la última versión válida.
- Una revisión reclasifica un terremoto como evento no sísmico: sale del estado actual, se conserva el historial y se
  registra la exclusión (ver Aclaraciones).

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Extracción y publicación (pasos 3.2 y 3.4)**

- **FR-001**: El sistema MUST consultar el feed de USGS de la ventana de 24 h aproximadamente cada 60 s (intervalo entre
  inicios de consulta, sin solapar), con la frecuencia, el topic y la dirección del transporte configurables por variables de entorno.
- **FR-002**: El sistema MUST registrar cada consulta (instante, resultado, código HTTP o error, duración, tamaño y número de
  eventos) y conservar la respuesta original completa solo durante un plazo definido, sin acumular copias idénticas.
- **FR-003**: El sistema MUST conservar el evento original recibido de cada versión sin transformarlo.
- **FR-004**: El sistema MUST publicar solo eventos nuevos y revisiones con `updated` posterior al estado persistente, y
  omitir las versiones ya publicadas y las anteriores a la conocida; el estado de publicación MUST sobrevivir a reinicios.
- **FR-005**: Cada mensaje MUST llevar el identificador del evento como clave y los campos `source`, `ingested_at`,
  `mode = live` y el evento original.
- **FR-006**: El sistema MUST marcar una versión como publicada solo tras la confirmación del transporte.
- **FR-007**: El sistema MUST gestionar tiempo agotado, HTTP 429 y 5xx y JSON inválido con hasta 3 reintentos de espera
  progresiva por ciclo (respetando `Retry-After` si existe, con una espera máxima de 60 s), registrar el error y no borrar el último estado válido.

**Persistencia, duplicados y versiones (pasos 3.3 y 3.4)**

- **FR-008**: El sistema MUST mantener una fila de estado actual por evento y una fila de historial por cada versión
  distinta `(id, updated)` **de terremoto válido**; las versiones excluidas o inválidas quedan en la cuarentena con su original,
  que forma parte de la secuencia de revisiones.
- **FR-009**: El estado actual MUST actualizarse solo si la versión recibida es más reciente; una versión antigua MUST
  guardarse en el historial sin sobrescribir a una posterior.
- **FR-010**: La escritura MUST hacerse en una transacción y el consumo MUST confirmarse solo después de guardar; el
  procesamiento es al menos una vez con escritura idempotente, de modo que un mensaje repetido no cambia los recuentos.
- **FR-011**: El tiempo del evento, el de actualización de USGS y el de ingesta MUST guardarse separados, en UTC y
  conservando el valor original.

**Calidad y cuarentena (paso 3.5)**

- **FR-012**: El sistema MUST aceptar como terremoto solo los eventos de tipo `earthquake`; los demás MUST excluirse
  conservando el motivo. Si la versión más reciente de un evento deja de ser `earthquake`, el evento MUST salir del estado
  actual conservando su historial.
- **FR-013**: El sistema MUST validar identificador, fechas, geometría (punto con tres valores), coordenadas finitas y en rango.
- **FR-014**: Los registros que no se puedan tratar MUST ir a cuarentena con motivo y referencia al original (clave, posición
  en el transporte y copia del contenido), sin bloquear la cola ni perderse en silencio; una versión inválida no sustituye a
  la última versión válida del estado actual.
- **FR-015**: Un valor nulo MUST conservarse como nulo; la magnitud 0 y la profundidad negativa MUST conservarse como
  válidas (anomalías señaladas, no errores).
- **FR-016**: Los datos de prueba dañados a propósito MUST quedar identificados y separados de los reales.
- **FR-017**: El sistema MUST conservar lo necesario para calcular completitud, unicidad, validez, consistencia, actualidad
  y exactitud (el informe automático no se exige; el análisis va en la memoria).

**Estado de ingesta y retención (paso 3.6)**

- **FR-018**: El sistema MUST registrar el estado de ingesta; `last_ingestion` MUST ser el instante de la última consulta
  correcta a USGS (`null` si no hubo ninguna) y no avanzar con consultas fallidas.
- **FR-019**: `GET /api/eventos` y `GET /api/salud` MUST informar de `last_ingestion`, y la API MUST seguir leyendo solo
  datos `live`, un evento una sola vez con su versión actual, sin alterar el contrato.
- **FR-020**: El transporte MUST mantener una retención limitada y su configuración efectiva MUST comprobarse.

**Fallos y recuperación (paso 3.7)**

- **FR-021**: El sistema MUST recuperarse tras reinicios y caídas del productor, el consumidor, el transporte y la base sin
  duplicar efectos ya guardados ni perder versiones.
- **FR-022**: El sistema MUST documentar que no distingue «salió de la ventana» de «eliminado por USGS» (reconciliación
  fuera del alcance) y cómo recuperar un hueco superior a 24 h con el catálogo histórico.

**Transversales**

- **FR-023**: Los datos reales, de prueba y de reproducción MUST permanecer separados; la ingesta real MUST NOT escribir
  ningún modo distinto de `live`.
- **FR-024**: Cada comportamiento MUST tener una prueba ejecutada con resultado real guardado como evidencia; las pruebas
  con datos dañados o ficticios MUST NOT escribir en las tablas definitivas de datos reales.
- **FR-025**: La configuración MUST gestionarse con variables de entorno y `.env.example` sin secretos; no se exponen
  Kafka ni PostgreSQL.

### Entidades clave

- **Consulta de extracción**: un intento de obtener la ventana de USGS (instante, resultado, error, duración, tamaño, recuento).
- **Respuesta original**: copia completa de una respuesta, con plazo de retención.
- **Evento actual**: la versión vigente de un terremoto (una fila por identificador).
- **Versión del evento**: cada versión distinta `(id, updated)` con el original; nunca se sobrescribe.
- **Versión publicada**: registro de que una versión ya fue confirmada por el transporte.
- **Registro de cuarentena / exclusión**: evento no tratado, con categoría, motivo y referencia al original.
- **Estado de ingesta**: última consulta correcta y último error.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: En una ejecución continua de 30 minutos, al menos 28 de las 30 consultas esperadas quedan registradas.
- **SC-002**: Un evento nuevo de USGS es visible en la API como máximo 2 minutos después de aparecer en el feed.
- **SC-003**: Reenviar una misma versión 5 veces deja los recuentos del estado actual y del historial sin cambios.
- **SC-004**: Con una secuencia nuevo → posterior → antigua, el estado actual tiene la versión posterior y el historial las tres.
- **SC-005**: Un evento con coordenadas inválidas genera 0 puntos y exactamente 1 registro de cuarentena con motivo y referencia.
- **SC-006**: El 100 % de los eventos no `earthquake` queda excluido con su motivo, y 0 aparecen en la API.
- **SC-007**: Tras reiniciar el consumidor a mitad de procesamiento, hay 0 duplicados, 0 versiones perdidas y el desfase vuelve a 0.
- **SC-008**: Ante un fallo del origen, el estado válido anterior se conserva íntegro y, al recuperarse el origen, la ingesta
  se reanuda sola en como máximo 3 ciclos.
- **SC-009**: `last_ingestion` es `null` antes de la primera consulta correcta, coincide con la última consulta correcta
  (±1 ciclo) y no avanza con consultas fallidas.
- **SC-010**: Tras 24 h de ventana móvil, los eventos que salieron del feed siguen almacenados (0 borrados por salir de la ventana).
  Solo puede verificarse con **más de 24 h de funcionamiento real**; hasta entonces figura como pendiente de observación.
- **SC-011**: La configuración efectiva de retención del transporte coincide con la política documentada.
- **SC-012**: 0 filas de modos distintos de `live` en las tablas de datos reales y 0 escrituras de pruebas dañadas en ellas.

## Supuestos

Decisiones conservadoras tomadas al especificar (a revisar en el plan; ninguna cambia requisitos del profesor):

- **A-01**: La validación y el filtro por tipo se aplican en el **consumidor**; el productor publica toda versión nueva o
  revisada. Así el motivo de exclusión se conserva en el mismo sitio que la cuarentena.
- **A-02**: Una sola estructura de cuarentena con categoría (`excluido` frente a `invalido`) sirve también para los eventos no
  sísmicos, en lugar de una tabla aparte.
- **A-03**: Se guarda el evento original completo de cada versión; no se guardan columnas extra del feed (`felt`, `cdi`, `mmi`…).
- **A-04**: Retención de la respuesta original completa: 3 días y solo cuando cambia el contenido respecto a la última copia
  guardada; el registro de consultas se conserva 30 días. Valores ajustables tras medir el volumen real en el paso 3.2.
- **A-05**: El estado de publicación vive en PostgreSQL, accesible al productor; no se añade ningún servicio nuevo.
- **A-06**: Frente a un mismo `updated`, la versión ya almacenada prevalece y la repetida se ignora.
- **A-07**: `mag = 0` y las profundidades negativas se conservan y se señalan como anomalías para el análisis de calidad.
- **A-08**: El producto sigue sin país asignado hasta la fase F4; `country_id` y `country_name` permanecen nulos.
- **A-09**: No se mide el tamaño ni la latencia hasta ejecutar el paso 3.2; se medirán y registrarán entonces (pendiente de F1).
- **A-10**: El modelo definitivo (conceptual, lógico y físico) reemplaza la estructura provisional de `live.evento_actual`
  mediante un script nuevo y aplicable a mano sobre el volumen existente, sin borrar datos.
- **A-11**: La publicación real a Kafka se activa solo cuando el consumidor definitivo (clasificación, versiones y cuarentena) está
  desplegado; mientras tanto el productor trabaja en **modo seco** (consulta, registra y conserva, sin publicar ni marcar versiones
  como publicadas) para no procesar eventos reales a medias ni perderlos por la retención del transporte (R-015).
