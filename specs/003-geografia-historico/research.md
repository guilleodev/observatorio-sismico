# Investigación y decisiones técnicas: Geografía e histórico (F4)

Formato: **Decisión · Motivo · Alternativas**. Las decisiones que cambian arquitectura o tratamiento de datos (D1–D4) están en
[plan.md](plan.md) y requieren aprobación. Se reutiliza lo aprobado en F3 (`specs/002-ingesta-real-calidad/`) sin repetirlo.

## R-001 — Biblioteca de punto-en-polígono (D1)
- **Decisión recomendada**: Shapely (sin GeoPandas): `Point`, `STRtree` para filtrar por caja envolvente y predicados exactos (`contains`,
  `covers`). El enunciado la cita expresamente (§4.3). Versión fijada en `requirements.txt` en el paso 4.2 tras comprobar que instala
  en la imagen `python:3.13-slim-trixie`. Arrastra NumPy como dependencia.
- **Motivo**: los puntos sobre una frontera exigen predicados geométricos robustos; reimplementarlos con coma flotante es la fuente
  típica de errores en bordes. Con 177 polígonos el coste es mínimo.
- **Alternativas**: implementación propia (rayos + caja envolvente) sin dependencias nuevas, más didáctica pero frágil en fronteras;
  GeoPandas (arrastra Pandas, GDAL/pyogrio: excesivo, descartado); PostGIS (fuera de las tecnologías aprobadas, descartado).
- **Medición prevista (paso 4.3)**: tiempo por evento con `STRtree` frente a recorrido secuencial de los 177 polígonos; sirve como
  justificación de estructura de datos del enunciado (§11) sin inventar cifras antes de medir.

## R-002 — Regla de frontera y varias coincidencias
- **Decisión**: se buscan los polígonos que **cubren** el punto (el borde cuenta). Un solo polígono con el punto estrictamente
  dentro → `interior`; un punto en el borde de un polígono → `frontera`; si hay más de una coincidencia gana el menor `ADM0_A3`
  en orden alfabético y el resultado es `varias`; ninguna → `sin_pais` (`country_id` nulo). El resultado se guarda con el evento.
- **Motivo**: determinista, explicable, medible y compatible con «no atribuir al país más cercano» (§4.3). En el catálogo 1:110 M las
  superposiciones son raras; la regla existe para no dejar el caso sin definir.
- **Alternativas**: elegir por área o por «tipo de entidad soberana» (introduce criterio político); marcar como cuarentena (el
  enunciado pide conservarlo como «Sin país asignado»).

## R-003 — Catálogo: lectura, validación, versión y acceso
- **Hechos comprobados al planificar** (se repiten en 4.1): 177 entidades; `ADM0_A3` único; 148 `Polygon` y 29 `MultiPolygon`; CRS
  declarado CRS84 (lon, lat; equivale a WGS84); 168 atributos; 5 entidades con `ISO_A3 = -99` (por eso `ADM0_A3` y no ISO);
  entidades como Palestina o Somalilandia con polígono propio; `TYPE` incluye soberanos, dependencias y disputados.
- **Decisión**: el archivo `frontend/public/datos/paises.geojson` se monta **solo lectura** en el consumidor (en compose) y, para la carga de lote, con `-v` en `docker compose run` (no en el productor permanente); no se
  copia ni se modifica. Su `sha256` identifica la **versión del catálogo** y se guarda con cada asignación. Se valida (unicidad de
  `ADM0_A3`, tipos de geometría, validez) antes de usarlo y se vuelca la dimensión `geo.pais` de forma idempotente (upsert). Al arrancar, el consumidor comprueba que el `sha256` coincide con `geo.catalogo` y que todos los `ADM0_A3` del asignador están en `geo.pais`; si no, no consume. **Política de geometrías inválidas (aprobada en 4.2)**: el catálogo real trae 2 entidades inválidas por auto-intersección (`USA` y `SDN`); abortar bloquearía el sistema, así que se **reparan solo en memoria** con `make_valid` (el archivo del profesor no se toca), se registran por nombre en cada arranque y, si una geometría no se puede reparar, se aborta. Está medido que la reparación no cambia el área ni el resultado (0 desacuerdos en 400 000 puntos; `docs/evidencias/f4/4.2-validez-geometrias.txt`).
- **Alternativas**: copiar el archivo a `backend/` (duplica un archivo del profesor; la imagen se construye con `./backend`).

## R-004 — Dónde se asigna y cómo se actualiza
- **Decisión**: en el **consumidor**, dentro de la transacción que guarda la versión (FAQ: «el consumidor asigna país»). El estado
  actual recibe país y nombre solo cuando la versión gana (`updated` mayor), con la misma sentencia que ya existe. `evento_version`
  no guarda país (A-03: derivable del original; evita redundancia). El nombre se guarda desnormalizado porque `country_name` ya es
  columna y campo del contrato.
- **Retroactivo**: orden de línea de comandos idempotente que recorre `evento_actual` y asigna donde falta o donde cambió la versión
  del catálogo; no reprocesa Kafka ni borra filas. Como el consumidor sigue activo, cada `UPDATE` se condiciona a `updated_at` igual al leído (si hubo una versión más nueva entre medias, no se toca). Una violación de la clave foránea de país **no** es un error permanente de datos: el consumidor no la manda a cuarentena (se trata como fallo de configuración y no consume).
- **Alternativa**: asignar en el productor (mezcla ingesta con enriquecimiento; el mensaje dejaría de ser el original sin transformar).

## R-005 — Esquemas y claves (D2)
- **Decisión recomendada**: `geo` (catálogo; compartido) e `historico` (datos de 2025), separados de `live` y del futuro `replay`
  (constitución III). `live.evento_actual.country_id` pasa a clave foránea de `geo.pais`. Sin PostGIS ni geometrías en la base.
- **Alternativas**: columnas de origen en `live` (mezcla datos); catálogo dentro de `live` (acopla geografía con tiempo real).

## R-006 — Cliente del catálogo histórico (FDSN)
- **Hechos comprobados con consultas reales de recuento** (2026-11-06): total 2025 con magnitud ≥ 4 y `eventtype=earthquake` =
  **18 302**; por mes 1 413, 1 394, 1 178, 1 316, 1 228, 1 156, **2 684** (máximo, julio), 2 222, 1 604, 1 509, 1 321 y 1 277 (la suma
  coincide con el total anual). Ningún mes se acerca a 20 000, así que la subdivisión no se activará en 2025 pero **debe implementarse
  y probarse** forzando un límite pequeño configurable.
- **Decisión**: por cada tramo, primero `count` (recuento esperado) y luego `query` (`format=geojson`, `orderby=time-asc`); si el
  recuento alcanza el límite se parte el tramo por la mitad, recursivamente. Reintentos y esperas como en F3 (`Retry-After`, 429/5xx,
  tiempo agotado). `endtime` se trata como inclusivo (documentación de USGS) y por eso se deduplica por `id`; además el cargador descarta (y cuenta como «fuera de tramo») los eventos con `time` ≥ fin del tramo, de modo que uno exactamente a 2026-01-01T00:00:00Z no entra en diciembre. Un tramo padre solo pasa a `subdividido` cuando sus hijos están completos, y la subdivisión tiene una cota mínima (un tramo que no se puede partir más se registra como error, sin recursión infinita). Un tramo con 0 resultados es correcto (`obtenidos = 0`). Se comprueba en 4.4.
- **Alternativa**: una sola descarga anual (incumple el límite de 20 000 en caso general y el enunciado pide meses).

## R-007 — Archivos originales y reutilización
- **Decisión recomendada**: guardar la respuesta original de cada tramo comprimida (`gzip`) en PostgreSQL (`historico.archivo`), con su
  `sha256`. Sobrevive a reinicios con el volumen existente, es transaccional con la consulta y no añade volumen ni servicio. Tamaño
  estimado de decenas de MB como mucho (18 302 eventos); se mide en 4.4. La **exportación a disco es obligatoria**: la carga también guarda cada archivo (`.geojson.gz`) en una carpeta local montada con `-v` en `docker compose run` e ignorada por Git (`data/historico/`), registrando su `sha256`, para que un borrado accidental del volumen no destruya a la vez datos y originales (`ENUNCIADO.md` §4.2: reutilizar los archivos; §12: ubicación documentada).
- **Motivo**: «descarga una vez y reutiliza» se cumple sin gestionar una carpeta aparte; la integridad se verifica por huella.
- **Alternativas**: volumen Docker con archivos `.geojson` (válido; segundo almacén que respaldar y hacer coincidir con la base);
  carpeta del repositorio (los datos no se versionan).

## R-008 — Carga histórica: proceso, idempotencia y calidad (D3)
- **Decisión recomendada**: orden de una sola ejecución con la imagen existente (`docker compose run --rm --no-deps producer python -m
  observatorio.historico.cargar`), sin Kafka, sin servicio nuevo. Una transacción por tramo (consulta + archivo + eventos); la clave del
  tramo (inicio, fin, filtros) permite reanudar: un tramo ya completo se salta y se reutiliza su archivo.
- **Eventos**: `historico.evento` una fila por `id` (instantánea, A-04). Si un `id` aparece en dos tramos (extremo compartido) se conserva
  la fila con `updated` mayor y se cuenta como duplicado en la consulta que lo repite. Cuadre: suma de obtenidos − duplicados = filas
  de `evento` + cuarentena.
- **Calidad**: se reutiliza la validación de F3 (tipo, coordenadas, nulos) extrayendo del clasificador la parte que valida un
  *Feature*, sin cambiar su comportamiento (las pruebas de F3 lo protegen); inválidos a `historico.cuarentena`.
- **Alternativa**: publicar el histórico por Kafka (más lento, mezcla con el transporte en tiempo real; el enunciado no lo exige).

## R-009 — Detección y recuperación de huecos (D4)
- **Detección**: al registrar una consulta correcta (en la misma transacción de `registrar_ok`), si pasó más de `24 h − margen` desde la
  anterior consulta correcta, el productor anota un **hueco** `(inicio = anterior − margen, fin = ahora − 24 h + margen)`, con
  `UNIQUE (inicio, fin)` y una advertencia en el registro. El margen (`HUECO_MARGEN_S`, 6 h por defecto) cubre los eventos publicados con retraso
  y se aplica por ambos lados; la deduplicación absorbe el solape. No se anota en modo seco. Límite documentado: no ve un Kafka caído con
  USGS accesible (la consulta es correcta aunque no se publique). Los huecos pendientes se listan con
  `python -m observatorio.recuperacion.recuperar --listar`; `/api/salud` queda para F5. La
  detección es automática; la recuperación no.
- **Recuperación**: orden a demanda que consulta el catálogo en ese intervalo **sin filtro de magnitud ni de tipo** (para igualar el feed, que
  no filtra; lo no sísmico va a la cuarentena y a la retirada de F3), con subdivisión, y publica por la lógica de publicación del productor con `source = usgs-fdsn-recuperacion`. Omite una versión solo si
  `(id, updated)` ya está **guardada** en `evento_version` o `cuarentena` (no basta `version_publicada`: un mensaje publicado y no
  consumido antes de 24 h se perdería con la retención de Kafka). El consumidor admite ese `source` además de
  `usgs-all-day`; pasa por las mismas reglas de versiones, calidad y país. Marca el hueco como recuperado al terminar.
- **Alternativas**: recuperación automática al arrancar (riesgo de cargas grandes inesperadas, sin supervisión); escribir directamente
  en `live` (se salta versionado y cuarentena).

## R-010 — Comparación entre ventanas equivalentes
- **Definición**: ámbito = global, un `country_id` o «sin país» (`geo_resultado = 'sin_pais'`); magnitud mínima ≥ 4 en **ambos** periodos; tipo
  `earthquake`; tiempo del evento en UTC. Reciente = recuento en `live.evento_actual` (no retirados) de la ventana; histórica = total
  de 2025 del ámbito dividido entre los 365 días (media diaria) o entre 8 760 horas (media horaria), incluyendo días y horas con cero
  eventos (serie completa con relleno de ceros). Variación = (reciente − media) / media; si la media es 0 → «no definida».
- **Ámbito y UTC**: «sin país» = `geo_resultado = 'sin_pais'` (no basta `country_id IS NULL`, que incluiría eventos aún sin asignar); precondición `geo_resultado IS NULL` = 0 filas; todas las consultas fuerzan UTC (`SET TIME ZONE 'UTC'`).
- **Sesgos a documentar**: el histórico es la instantánea revisada del catálogo y el reciente son datos preliminares; el último
  periodo puede estar incompleto; el reciente incluye revisiones posteriores; la media anual está inflada por secuencias de réplicas (julio de 2025: 2 684 eventos frente a ~1 300 en otros meses), por lo que se añade la mediana diaria (`percentile_cont`) como complemento; con medias casi nulas (países pequeños, ventana horaria) la variación porcentual es inestable; el `ingested_at` de lo recuperado distorsiona la dimensión «actualidad»; y la comparación se marca cuando la ventana reciente intersecta un hueco pendiente.
- **Alcance**: F4 deja las consultas de referencia en [contracts/consultas-comparacion.md](contracts/consultas-comparacion.md) y las
  prueba contra un recuento independiente; los endpoints son de F5.

## R-011 — Trazabilidad
- Cadena verificable: evento → `consulta_id` → archivo (`sha256`, tamaño, extracción) → parámetros de la consulta; asignación → `geo_catalogo`
  (huella) y `geo_resultado`; origen → `source`. Consultas de cuadre: recuentos por mes frente a `count`, total anual, ningún histórico
  en `live` y viceversa, ningún evento sin resultado geográfico. Sin tablas de auditoría adicionales.

## R-012 — Pruebas y rendimiento
- **Unitarias**: asignador con batería de ≥ 20 puntos (países, océano, frontera, antimeridiano, polos, isla ausente, ceros); cliente
  FDSN contra servidor HTTP local simulado (429/5xx/JSON inválido y subdivisión con límite pequeño).
- **Integración**: PostgreSQL real en transacciones que se revierten; recursos temporales (base, topic y grupo) para el hueco simulado y
  para probar interrupciones de la carga, como en F3; la carga real de 2025 se ejecuta una vez contra USGS y no se simula (A-10).
- **Medición**: tiempo de asignación por evento, tiempo de la carga completa desde archivos locales y de la asignación retroactiva;
  los umbrales de SC-011 están **pendientes de medición**: se proponen tras las primeras mediciones, se justifican por el intervalo de 60 s del productor y los confirma la persona estudiante.
- **Control semántico**: contraste de ≥ 100 países asignados con el sufijo de `place` tras la última coma, normalizado, con tabla de alias (p. ej. estados de EE. UU. → United States) y registro del porcentaje de coincidencia (solo control, no fuente).

## R-013 — Riesgos
| Riesgo | Mitigación |
|---|---|
| El catálogo 1:110 M deja islas sin país | Resultado esperado; se mide la proporción y se explica (A-02) |
| Antimeridiano: polígonos partidos o puntos en ±180 | Pruebas dedicadas; el catálogo trae polígonos ya partidos |
| Geometría inválida en el catálogo | Validación al cargar (R-003); se informa antes de asignar |
| USGS limita o falla durante la carga | Reintentos, tramos reanudables, archivos reutilizables |
| Shapely no instala en la imagen | Se comprueba en 4.2 antes de seguir; alternativa propia descrita en R-001 |
| Ruta del proyecto con tilde en el montaje | Se prueba el montaje en 4.1 |
| Rendimiento del consumidor tras añadir geometría | Se mide por evento; el volumen en vivo es ~1 evento por minuto |
| Predicado de Shapely | `STRtree.query` con `intersects` y confirmación con `covers`; la prueba de T011 verifica el borde |
| Migraciones repetibles | `ADD CONSTRAINT` no es idempotente: se usa un bloque `DO` con comprobación previa |
