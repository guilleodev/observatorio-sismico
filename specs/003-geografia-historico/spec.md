# Especificación de la funcionalidad: Geografía e histórico (F4)

**Rama de la funcionalidad**: `003-geografia-historico` (el proyecto trabaja en `main`; no se crea rama)

**Creada**: 2026-11-06

**Estado**: Borrador

**Entrada**: «Asignar país a cada terremoto con punto-en-polígono sobre el catálogo Natural Earth (océanos, fronteras y
eventos sin país); cargar de forma reproducible el histórico USGS de 2025 (mundial, magnitud ≥ 4, tipo `earthquake`);
preparar la recuperación tras interrupciones de más de 24 h con el catálogo histórico; dejar preparadas las comparaciones
entre ventanas temporales equivalentes; calidad, rendimiento, pruebas de integración y trazabilidad.» Corresponde a la
fase F4 de `docs/HOJA-DE-RUTA.md` (pasos 4.1 a 4.6; commit previsto `[F4]`).
Requisitos de origen: `ENUNCIADO.md` §4.2, §4.3, §5, §7 y §8 (comparación histórica); `CONTRATO-API.md` (`country_id`,
`country_name`); `FAQ-ALUMNADO.md` (preguntas 18, 19, 21–23); `Guia-entregables-observatorio-sismico.md` (§ de fuentes y calidad).

**Contexto reutilizado** (no se repite aquí): constitución v1.0.3 (principios III y IV); F3 cerrada
(`specs/002-ingesta-real-calidad/`, solo lectura): esquema `live`, versionado `(event_id, updated)`, cuarentena con huella,
`estado_ingesta`, productor con `INGESTA_PUBLICAR`, consumidor con offset tras guardar y errores permanentes a cuarentena,
modos contractuales `live`/`replay`, `source` admitido `usgs-all-day`; `evento_actual` ya tiene `country_id` y `country_name`
(nulos desde el MVP). `specs/001-mvp-evento-sintetico/` es solo histórico. **Fuera de alcance**: endpoints de estadísticas y
filtros `country_id`/`start`/`end`/`min_mag`, gráficas y panel (F5); reproducción `replay` (F6); ngrok y Netlify (F6–F7);
la observación de más de 24 h de SC-010 de F3 (pendiente, F6); reconciliación de eventos eliminados por USGS.

## Aclaraciones

### Sesión 2026-11-06 (modo autónomo: se elige la opción más conservadora; las marcadas «requiere aprobación» no se implementan sin ella)

- Q: ¿Qué hace el sistema con un punto exactamente sobre una frontera o con varias coincidencias? → A: regla determinista y
  documentada: la frontera cuenta como pertenencia y, si hay varias coincidencias, gana el identificador `ADM0_A3` de menor
  orden alfabético; el resultado queda registrado como «frontera» o «varias coincidencias» para poder medirlo (FR-004, FR-005).
- Q: ¿Se asigna el país más cercano a un evento marítimo? → A: **no** (`ENUNCIADO.md` §4.3): `country_id` queda nulo, se muestra
  como «Sin país asignado» y el evento permanece en el análisis (FR-006).
- Q: ¿Se recalcula el país cuando una revisión cambia las coordenadas? → A: sí, el país del estado actual se deriva de la
  versión vigente; una versión antigua que llega tarde no lo modifica (FR-008).
- Q: ¿Los eventos históricos pasan por Kafka? → A: **decisión que requiere aprobación (D3)**: carga por lote directa a la base,
  sin Kafka, en un esquema propio separado de `live` y de `replay`; la reproducción de F6 leerá de ese histórico.
- Q: ¿Cómo se comparan ventanas si el histórico solo tiene magnitud ≥ 4? → A: la comparación solo es válida con magnitud
  mínima ≥ 4 aplicada a **ambos** periodos; con un umbral menor se compara igualmente a ≥ 4 y se indica (FR-020).
- Q: ¿La recuperación de un hueco > 24 h es automática? → A: **decisión que requiere aprobación (D4)**: se ejecuta a demanda
  y los eventos recuperados entran por el mismo canal de la ingesta real con un origen propio y trazable.
- Q: ¿Se añade una librería de geometría? → A: **decisión que requiere aprobación (D1)**: la geometría de polígonos necesita
  una biblioteca Python (el enunciado cita Shapely/GeoPandas) o una implementación propia; sin ella no se implementa 4.2.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia 1 — Cada terremoto tiene país (Prioridad: P1)

Cada terremoto nuevo del feed recibe el país en cuyo polígono del catálogo geográfico cae su epicentro, y los terremotos ya
almacenados reciben el suyo sin perder datos. La asignación usa solo las coordenadas, nunca el texto de `place`.

**Por qué esta prioridad**: la pregunta central del proyecto es «¿dónde hay actividad?»; sin país no hay recuentos por país
ni comparaciones geográficas (F5).

**Prueba independiente**: procesar eventos con coordenadas conocidas (p. ej. `(-3.7, 40.4)` → `ESP`) y comprobar el país en
el estado actual y en `/api/eventos`; después aplicar la asignación a los eventos ya almacenados y comparar recuentos.

**Escenarios de aceptación**:

1. **Dado** un terremoto nuevo cuyo epicentro está dentro de un polígono, **cuando** se procesa, **entonces** el estado actual
   guarda el identificador y el nombre de ese país.
2. **Dado** los eventos ya almacenados sin país, **cuando** se aplica la asignación retroactiva, **entonces** todos quedan
   con país o con «sin país», no se borra ni duplica ninguna fila y repetirla no cambia nada.
3. **Dado** una revisión con coordenadas distintas que cambia de país, **cuando** se procesa, **entonces** el estado actual
   muestra el país de la versión vigente; **dado** una versión antigua tardía, **entonces** no lo modifica.
4. **Dado** un catálogo con identificadores repetidos o geometría inválida, **cuando** se carga, **entonces** se detecta y se
   informa antes de asignar nada.
5. **Dado** la API existente, **cuando** se consulta `/api/eventos`, **entonces** `country_id` y `country_name` llevan el valor
   asignado (o `null`) sin cambiar el resto del contrato.

---

### Historia 2 — Océanos, fronteras y eventos sin país se tratan con una regla y se miden (Prioridad: P2)

Los casos límite geográficos (mar abierto, costa simplificada, punto sobre una frontera, varias coincidencias, territorios
sin polígono propio) se resuelven con una regla documentada, y se mide cuántos eventos caen en cada caso.

**Por qué esta prioridad**: evita atribuciones falsas y permite defender la calidad geográfica; depende de la Historia 1.

**Prueba independiente**: ejecutar una batería de puntos (océano, frontera exacta, isla pequeña, polo, antimeridiano,
varias coincidencias) y comparar el resultado con el esperado documentado.

**Escenarios de aceptación**:

1. **Dado** un epicentro en mar abierto, **cuando** se asigna, **entonces** `country_id` es nulo y no se usa el país más cercano.
2. **Dado** un punto exactamente sobre una frontera o con varias coincidencias, **cuando** se asigna, **entonces** el resultado
   es siempre el mismo (determinista) y queda marcado como caso de frontera.
3. **Dado** un epicentro en una isla ausente del catálogo (escala 1:110 millones), **cuando** se asigna, **entonces** queda
   «sin país» y se documenta como limitación de cobertura, no como error.
4. **Dado** longitudes cerca del antimeridiano (±180°) o latitudes extremas, **cuando** se asigna, **entonces** el resultado
   es correcto o queda como «sin país», nunca un error de procesamiento.
5. **Dado** una muestra de eventos con país asignado, **cuando** se contrasta con el texto de `place` como control (no como
   fuente), **entonces** las discrepancias se listan y se explican.

---

### Historia 3 — El histórico de 2025 se carga una vez, de forma reproducible y aislada (Prioridad: P1)

El sistema obtiene del catálogo de USGS los terremotos de 2025 (mundo, magnitud ≥ 4, tipo `earthquake`) por meses,
conserva las consultas y los archivos, y los guarda en un almacén histórico separado del tiempo real, con país asignado y
trazabilidad de su origen.

**Por qué esta prioridad**: es la línea base de la comparación histórica y la fuente del replay; sin él no hay comparación.

**Prueba independiente**: ejecutar la carga completa, comprobar recuentos por mes frente a los de USGS, repetirla sin
descargar de nuevo y comprobar que no cambia nada; reiniciar los contenedores y comprobar que el histórico sigue.

**Escenarios de aceptación**:

1. **Dado** el año 2025, **cuando** se carga, **entonces** se consulta por meses (UTC), y si una consulta alcanza el límite de
   20 000 resultados se subdivide hasta que cada tramo quede por debajo.
2. **Dado** tramos que comparten un extremo, **cuando** se unen, **entonces** los eventos duplicados se eliminan por
   identificador y el total coincide con la suma menos las repeticiones.
3. **Dado** que cada tramo se ha descargado, **cuando** se vuelve a ejecutar la carga, **entonces** se reutilizan los archivos
   guardados y no se consulta a USGS.
4. **Dado** cada consulta, **cuando** termina, **entonces** queda registrada con sus parámetros, fecha de extracción, número
   de registros y resultado; cada evento histórico se puede rastrear hasta su consulta y archivo.
5. **Dado** un evento histórico no válido (coordenadas fuera de rango, tipo distinto de `earthquake`), **cuando** se carga,
   **entonces** va a cuarentena con motivo y no se mezcla con los datos válidos.
6. **Dado** una carga interrumpida a medias, **cuando** se reanuda, **entonces** completa lo que falta sin duplicar.
7. **Dado** el histórico cargado, **cuando** se consulta el tiempo real, **entonces** ninguna fila histórica aparece en
   `live` ni en `/api/eventos`, y viceversa.

---

### Historia 4 — Tras una parada de más de 24 h se puede recuperar el hueco (Prioridad: P2)

Si el sistema estuvo parado más de 24 h, el feed ya no contiene lo ocurrido al principio del hueco. El sistema detecta el
hueco y permite recuperarlo con el catálogo histórico de USGS, sin duplicar y con los eventos identificados como recuperados.

**Por qué esta prioridad**: `ENUNCIADO.md` §5 solo pide *explicar* cómo recuperar el hueco; implementarlo es una decisión propia (D4) que se defiende por la constitución VII; se acepta que sea a demanda y no automático.

**Prueba independiente**: simular un hueco con recursos temporales (sin tocar los datos reales), ejecutar la recuperación y
comprobar que los eventos aparecen una sola vez, con su origen, y que repetirla no cambia nada.

**Escenarios de aceptación**:

1. **Dado** una última ingesta correcta anterior en más de 24 h menos un margen de seguridad (6 h por defecto), **cuando** se
   reanuda la ingesta, **entonces** se registra el hueco (inicio, fin y duración) con una advertencia en el registro, y una orden
   permite listar los huecos pendientes; no se anota en modo seco.
2. **Dado** un hueco, **cuando** se ejecuta la recuperación, **entonces** se consultan los tramos necesarios del catálogo sin filtro
   de magnitud ni de tipo (como el feed, que no filtra) y se procesan con las mismas reglas (versiones, calidad, cuarentena, país).
3. **Dado** eventos que el feed ya había aportado y que ya están guardados, **cuando** se recuperan, **entonces** no se duplican; los
   publicados que nunca llegaron a guardarse sí se reenvían.
4. **Dado** un intervalo sin ingesta de hasta 24 h menos el margen, **cuando** se reanuda el productor, **entonces** el feed lo cubre y
   no hace falta recuperar.
5. **Dado** que la recuperación se interrumpe, **cuando** se repite, **entonces** continúa sin duplicados.

---

### Historia 5 — Las comparaciones entre ventanas equivalentes quedan preparadas y validadas (Prioridad: P2)

Con el histórico y el país asignado, el sistema puede calcular el recuento de un periodo reciente y la media diaria (o por
hora) de 2025 bajo exactamente los mismos filtros de ámbito, magnitud y tipo, incluyendo los días con cero eventos.

**Por qué esta prioridad**: prepara el resultado principal de F5 («¿cómo se compara con un periodo histórico equivalente?»);
se valida aquí con consultas de referencia, sin exponer aún endpoints nuevos.

**Prueba independiente**: calcular con consultas de referencia la media diaria de 2025 (global y de un país) y el recuento de
las últimas 24 h con los mismos filtros, y comprobar los números contra un recuento independiente.

**Escenarios de aceptación**:

1. **Dado** el filtro global con magnitud ≥ 4, **cuando** se calcula la media diaria de 2025, **entonces** es el total de
   eventos entre 365 días (todos los días, también los de cero eventos).
2. **Dado** un país o «sin país» como ámbito, **cuando** se calcula, **entonces** se aplica el mismo ámbito al periodo reciente
   y al histórico.
3. **Dado** una media histórica igual a cero, **cuando** se calcula la variación, **entonces** queda «no definida».
4. **Dado** un umbral de magnitud inferior a 4, **cuando** se pide comparar, **entonces** se compara a ≥ 4 en ambos periodos y
   se indica.
5. **Dado** eventos reales con magnitud nula, **cuando** se aplica un umbral, **entonces** no cumplen el filtro y se cuentan aparte.
6. **Dado** el periodo reciente, **cuando** se presenta, **entonces** se advierte de que puede estar incompleto por retrasos de publicación.

### Casos límite

- El catálogo geográfico falta, no se puede leer o cambia de versión: el consumidor no procesa a ciegas: no arranca como sano ni consume
  hasta tener un catálogo válido y coherente con la dimensión de países, e informa del motivo. Los mensajes esperan en el transporte
  mientras dure su retención (24 h); pasado ese plazo se pierden, por eso la recuperación comprueba lo realmente guardado. Nunca se guarda un «sin país» falso.
- Evento con coordenadas válidas pero polígono con anillos huecos (lagos, enclaves): solo cuenta el interior del polígono.
- Territorios en disputa o dependientes: se usa el identificador del catálogo tal cual; no se reinterpreta políticamente.
- Un `ADM0_A3` coincide con un código no ISO (p. ej. entidades sin ISO propio): se usa como identificador del catálogo, no como ISO.
- USGS devuelve más de 20 000 resultados, cero resultados o un error en un tramo del histórico: se subdivide, se registra o se
  reintenta sin dar por completo un tramo incompleto.
- El histórico y el feed comparten eventos de 2025 o un hueco recuperado se solapa con el feed: se deduplica por identificador
  y versión.
- Un evento histórico trae `updated` posterior a la fecha de extracción de otro tramo: se conserva la instantánea más reciente
  y se registra (el histórico es una instantánea, no el registro de todas las revisiones).
- 2025 no es bisiesto (365 días); el cálculo usa los días reales del periodo UTC `[2025-01-01, 2026-01-01)`.
- Las horas y días se cuentan siempre en UTC con el tiempo del evento, no el de ingesta.
- Reiniciar o recrear contenedores no pierde el histórico ni los archivos descargados (sin borrar volúmenes).

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Catálogo geográfico y asignación de país (pasos 4.1 a 4.3)**

- **FR-001**: El sistema MUST cargar el catálogo de países entregado (WGS84), comprobar la unicidad de `ADM0_A3` y la validez
  de cada geometría antes de usarlo, y registrar el archivo, su huella y el número de entidades.
- **FR-002**: El sistema MUST conservar los atributos del catálogo necesarios para el análisis (identificador, nombre en español,
  nombre en inglés, continente, subregión y tipo de entidad) como dimensión consultable, usando `ADM0_A3` como `country_id`.
- **FR-003**: El sistema MUST asignar el país mediante la pertenencia del epicentro (longitud, latitud) a un polígono, sin usar
  el texto de `place`, y MUST NOT usar el país más cercano.
- **FR-004**: El sistema MUST aplicar una regla determinista y documentada para puntos sobre una frontera o con varias
  coincidencias, con el mismo resultado ante la misma entrada.
- **FR-005**: El sistema MUST registrar, para cada asignación, su resultado (interior, frontera, varias coincidencias o sin
  país) y la versión del catálogo usada, de modo que se pueda medir y reprocesar.
- **FR-006**: Un epicentro sin polígono MUST conservarse con `country_id` nulo («Sin país asignado») y permanecer en el análisis;
  no se clasifica como error ni como cuarentena.
- **FR-007**: El consumidor MUST asignar el país a cada versión válida antes de guardar el estado actual, dentro de la misma
  transacción, sin cambiar el resultado de la idempotencia (un mensaje repetido no cambia recuentos ni país).
- **FR-008**: El país del estado actual MUST derivarse de la versión vigente: una revisión con otras coordenadas lo recalcula y
  una versión antigua tardía no lo modifica.
- **FR-009**: El sistema MUST ofrecer una asignación retroactiva idempotente de los eventos ya almacenados, sin borrar ni
  duplicar filas, y sin necesitar reprocesar el transporte.
- **FR-010**: `GET /api/eventos` MUST devolver `country_id` y `country_name` reales (o `null`) sin cambiar el resto del contrato
  ni la ventana de 24 h. Los filtros por país pertenecen a F5.
- **FR-011**: El sistema MUST resistir coordenadas límite (antimeridiano, polos, ceros) sin error de procesamiento.

**Histórico de 2025 (paso 4.4)**

- **FR-012**: El sistema MUST obtener del catálogo de USGS los terremotos de 2025 (mundo, magnitud ≥ 4, tipo `earthquake`)
  en tramos mensuales UTC, y subdividir cualquier tramo que alcance 20 000 resultados.
- **FR-013**: El sistema MUST deduplicar por identificador los eventos de extremos compartidos y comprobar que el total
  coincide con la suma de los tramos menos las repeticiones.
- **FR-014**: El sistema MUST guardar el archivo original de cada tramo, y MUST reutilizarlo en ejecuciones posteriores sin
  volver a consultar a USGS; los archivos MUST sobrevivir a reinicios, paradas y recreaciones de contenedores (la recreación con `down` sin `-v` es una prueba opcional que requiere tu autorización).
- **FR-015**: El sistema MUST registrar cada consulta histórica (parámetros, instante de extracción, resultado, recuento esperado
  y obtenido, huella del archivo) y enlazar cada evento histórico con su consulta.
- **FR-016**: El histórico MUST almacenarse separado de los datos de tiempo real y de reproducción (esquema o tablas propios,
  columna de origen visible); MUST NOT aparecer en `/api/eventos` ni escribir en `live`.
- **FR-017**: El histórico MUST aplicar las mismas reglas de calidad que el tiempo real (tipo, coordenadas, nulos) con
  cuarentena propia con motivo y referencia al original, y asignar el país con la misma lógica que el tiempo real.
- **FR-018**: La carga MUST ser idempotente y reanudable: repetirla o reanudarla tras una interrupción no duplica ni pierde eventos.

**Recuperación de huecos (paso 4.5)**

- **FR-019**: El sistema MUST detectar y registrar un hueco de ingesta superior a lo cubierto por el feed (inicio, fin, duración; advertencia en el registro y
  orden para listarlos; no en modo seco) y MUST ofrecer a demanda su recuperación con el catálogo histórico, aplicando las mismas reglas
  de calidad, versiones, cuarentena y país, sin duplicar lo ya guardado, y reenviando lo publicado que nunca se guardó, e identificando
  los eventos recuperados por su origen.

**Comparaciones y trazabilidad (paso 4.6)**

- **FR-020**: El sistema MUST permitir calcular el recuento de un periodo reciente y la media histórica por día (y por hora) de
  2025 con los mismos filtros de ámbito geográfico (incluido «sin país»), magnitud mínima y tipo, usando el tiempo del evento en
  UTC, contando los días de cero eventos en el denominador y comparando solo con magnitud mínima ≥ 4 en ambos periodos.
- **FR-021**: La variación respecto a la media MUST quedar «no definida» si la media es cero; los eventos con magnitud nula MUST NOT
  cumplir un umbral de magnitud y se cuentan aparte; el periodo reciente MUST señalarse como posiblemente incompleto.
- **FR-022**: Cada evento MUST ser rastreable hasta su origen (feed, histórico o recuperación), la versión del catálogo geográfico
  usada y, en el histórico, su consulta y archivo; en tiempo real, por `source`, coordenadas del transporte y evento original (las
  consultas de `live` se purgan a los 30 días). Cada recuento de las comparaciones MUST indicar ámbito, filtros y periodo.

**Transversales**

- **FR-023**: Los datos reales, históricos, recuperados y de pruebas MUST permanecer separados; las pruebas MUST NOT escribir en
  las tablas definitivas (transacciones revertidas o recursos temporales) y MUST NOT borrar volúmenes ni datos.
- **FR-024**: Cada comportamiento MUST tener una prueba ejecutada con resultado real guardado como evidencia, y el rendimiento
  de la asignación y de la carga MUST medirse y registrarse (no se declara ningún tiempo sin medirlo).
- **FR-025**: La configuración (rutas del catálogo y de los archivos, año, magnitud mínima, límites de consulta) MUST gestionarse
  con variables de entorno y `.env.example` sin secretos; Kafka y PostgreSQL siguen sin publicarse, y no se añade un sexto
  servicio permanente.

### Entidades clave

- **País (catálogo)**: entidad del catálogo geográfico (`country_id` = `ADM0_A3`, nombres, continente, subregión, tipo) y la versión del catálogo.
- **Asignación geográfica**: resultado de situar un epicentro (país o «sin país», y si fue interior, frontera o varias coincidencias).
- **Evento actual**: versión vigente de un terremoto en tiempo real, ahora con país.
- **Consulta histórica**: un tramo de tiempo consultado al catálogo de USGS (parámetros, extracción, recuento esperado y obtenido, huella).
- **Archivo histórico**: copia original de una respuesta de un tramo, reutilizable.
- **Evento histórico**: terremoto de 2025 en el almacén histórico, con país, origen y consulta.
- **Cuarentena histórica**: registro histórico no tratable, con motivo y referencia al original.
- **Hueco de ingesta**: intervalo sin ingesta correcta cuyo inicio ya salió del feed.
- **Comparación de ventanas**: recuento reciente y media histórica con los mismos filtros, y variación o «no definida».

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: El catálogo se carga con 0 identificadores `ADM0_A3` repetidos y 0 geometrías inválidas sin tratar, o el problema
  se informa antes de asignar.
- **SC-002**: El 100 % de los eventos de tiempo real y del histórico queda con exactamente un país o «sin país», y la asignación
  usa solo pertenencia al polígono (una prueba con un punto marino cercano a la costa devuelve «sin país»).
- **SC-003**: Una batería de al menos 20 puntos de referencia (países, océano, frontera, antimeridiano, polos, isla ausente)
  da el 100 % del resultado documentado como esperado.
- **SC-004**: La asignación retroactiva y la reinserción de un mensaje repetido dejan 0 filas duplicadas y 0 cambios en una
  segunda ejecución.
- **SC-005**: Para al menos 100 eventos con país asignado, el contraste con el sufijo de `place` (solo control, con tabla de alias
  documentada) registra el porcentaje de coincidencia y lista cada discrepancia con su causa: 0 discrepancias sin causa asignada.
- **SC-006**: Para cada mes (por tiempo del evento), eventos + cuarentena del histórico coinciden con el recuento de USGS tomado
  inmediatamente antes de la carga; el total anual cuadra con la suma mensual menos las repeticiones. Una diferencia por revisiones
  posteriores de USGS se registra y explica.
- **SC-007**: Una segunda ejecución de la carga histórica realiza 0 peticiones HTTP a USGS (contador del propio proceso) y deja los
  recuentos idénticos; tras reiniciar los contenedores los recuentos y la huella `sha256` de cada archivo coinciden con los anteriores.
- **SC-008**: 0 filas históricas en `live` ni en `/api/eventos`, y 0 filas de `live` en el histórico.
- **SC-009**: Un hueco simulado de más de 24 h se recupera con 0 duplicados y 100 % de los eventos del hueco identificados con su
  origen; repetir la recuperación no cambia nada.
- **SC-010**: La media diaria de 2025 coincide con un recuento independiente (total / 365) para el filtro global, para al menos
  un país y para «sin país»; con media cero la variación es «no definida».
- **SC-011**: Se mide y registra el tiempo de asignación por evento y el de la carga completa desde archivos locales. Los umbrales
  de rendimiento están **pendientes de medición**: se propondrán con las primeras mediciones (referencia: el intervalo de 60 s del
  productor) y la persona estudiante los confirma; hasta entonces el criterio figura como «medido, umbral pendiente», no como cumplido.
- **SC-012**: 0 escrituras de pruebas en tablas definitivas, 0 volúmenes o datos borrados durante las pruebas de F4, y la suite
  anterior (205 pruebas) sigue pasando.

## Supuestos

Decisiones conservadoras tomadas al especificar (a revisar en el plan; ninguna cambia requisitos del profesor):

- **A-01**: El catálogo entregado (`frontend/public/datos/paises.geojson`, escala 1:110 millones) es la única fuente geográfica y
  no se modifica; el backend lo lee en modo solo lectura. Contiene 177 entidades, `ADM0_A3` sin repeticiones, y geometrías
  `Polygon` y `MultiPolygon` (comprobado al especificar; se vuelve a comprobar en el paso 4.1).
- **A-02**: La escala del catálogo deja sin polígono las islas pequeñas y la costa muy detallada; «sin país» es un resultado
  esperado, y su proporción se mide y se explica en lugar de fijarse de antemano.
- **A-03**: El país no se guarda en `evento_version`: se deriva de las coordenadas de cada versión y solo se almacena en el
  estado actual y en el histórico (evita redundancia; la versión conserva el original completo).
- **A-04**: El histórico es una instantánea del catálogo en la fecha de extracción (`ENUNCIADO.md` §4.2): una fila por
  evento, sin historial de revisiones.
- **A-05**: La línea base de comparación es 2025 completo con magnitud ≥ 4: 365 días UTC.
- **A-06**: La recuperación del hueco es a demanda; un hueco menor de 24 h lo cubre el feed sin intervención.
- **A-07**: Los eventos históricos no se publican en Kafka en F4; F6 los usará para el replay con su propio tema y esquema.
- **A-08**: Los endpoints de estadísticas, los filtros por país y el panel quedan para F5; F4 deja consultas de referencia
  validadas sobre las que F5 construirá.
- **A-09**: No se añaden PostGIS, Spark, Flink ni otras tecnologías; la única posible dependencia nueva es una biblioteca Python
  de geometría (decisión D1, requiere aprobación).
- **A-10**: Las pruebas con datos ficticios o dañados usan transacciones revertidas o recursos temporales; el histórico real de
  2025 se descarga de USGS y no se simula.

## Decisiones que requieren aprobación

Se aprueban **juntas, una sola vez, en T001** (cada punto de control solo pide autorización para seguir). Con ellas se ratifican las
decisiones tomadas en modo autónomo: regla de frontera por menor `ADM0_A3` (R-002), margen de huecos de 6 h (R-009), recuperación sin
filtro de magnitud ni de tipo, y el tratamiento de los umbrales de rendimiento de SC-011 como pendientes de medición.

- **D1 — Geometría**: usar la biblioteca Shapely (sin GeoPandas) para el punto-en-polígono, o una implementación propia en
  Python con prefiltrado por caja envolvente. *Recomendada*: Shapely, por exactitud en fronteras y rendimiento.
- **D2 — Almacenamiento**: esquema `geo` para el catálogo y esquema `historico` para el histórico, separados de `live` y de
  `replay`. *Recomendada*: sí.
- **D3 — Carga del histórico**: proceso de lote de una sola ejecución con la imagen existente (no un sexto servicio), directo a
  PostgreSQL (sin Kafka), con las respuestas originales comprimidas guardadas en la base **y exportadas a una carpeta local ignorada
  por Git** con su `sha256` (alternativa: solo volumen de archivos).
  *Recomendada*: sí.
- **D4 — Recuperación de huecos**: a demanda y por el mismo canal de la ingesta real (Kafka y consumidor), con un `source` propio
  admitido por el consumidor para distinguir lo recuperado. *Recomendada*: sí.
