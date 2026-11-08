# Investigación y decisiones técnicas: API y dashboard (F5)

Formato: **Decisión · Motivo · Alternativas**. Las decisiones que cambian contrato, dependencias o alcance del frontend (DF1–DF7) están en
[plan.md](plan.md) y requieren aprobación. Se reutiliza lo aprobado en F3 y F4 sin repetirlo (versionado, 503 explícito, CORS, `geo`, `historico`).

## R-001 — Un solo filtro compartido por eventos y estadísticas
- **Decisión**: un módulo `api/filtros.py` convierte los parámetros en un objeto `Filtros` validado y produce **la misma cláusula `WHERE` parametrizada**
  (`event_time >= %s AND event_time < %s AND NOT retirado AND (mag >= %s) AND country…`) para `/api/eventos` y para cada bloque de `/api/estadisticas`.
- **Motivo**: «los filtros de estadísticas deben equivaler a los del mapa» (contrato). Una única fuente evita que se desincronicen y permite probar la
  equivalencia con una consulta independiente (SC-002).
- **Alternativas**: replicar el SQL en cada consulta (riesgo de deriva); ORM (innecesario).
- **Reglas fijadas**: `start` inclusivo, `end` exclusivo, UTC si no hay zona; `min_mag` finito; `country_id` ∈ `geo.pais` o `sin_pais` (se normaliza a mayúsculas
  y se rechaza lo desconocido con 422); `sin_pais` filtra `geo_resultado = 'sin_pais'` (no `country_id IS NULL`, que incluiría eventos aún no asignados — F4).
  La validez del código se comprueba contra `geo.pais` con una lectura pequeña por petición (o caché de arranque; se mide en 5.7).

## R-002 — Paginación y `truncated` (DF3)
- **Decisión recomendada**: `limit`/`offset` con orden `event_time DESC, event_id ASC`; máximo **5 000** (`API_MAX_EVENTOS`); `total` por `count(*)` sobre el mismo
  filtro; `truncated = offset + count < total`; `next_offset`. Un `limit` mayor que el máximo es 422.
- **Motivo**: el contrato exige `truncated: true`, total completo y un mecanismo de paginación; `limit`/`offset` es lo más simple de explicar y de consumir.
  Con ≈ 400 eventos en 24 h el truncado solo ocurre en ventanas largas o con un límite bajo, así que 5 000 cubre unos 25 días al ritmo actual (≈ 200/día).
- **Riesgo asumido**: si entran eventos nuevos entre dos páginas, un `offset` puede desplazarse; la ordenación por `event_time` hace que lo nuevo (más reciente) pueda
  desplazar filas. Se documenta y el panel usa `end` explícito para congelar la ventana durante la paginación.
- **Alternativas**: paginación por cursor `(event_time, event_id)` (estable ante inserciones, más compleja de explicar y de probar); recorte silencioso (prohibido).

## R-003 — `/api/estadisticas`: un endpoint, bloques calculados en SQL
- **Decisión**: una sola ruta (el contrato solo define tres) con los bloques `por_hora`, `por_pais`, `magnitud`, `profundidad` y `comparacion`, cada uno con
  consulta propia y parametrizada; todos con el mismo `Filtros` y `generated`.
- **Motivo**: simplicidad y coherencia (una sola instantánea de filtros); `GROUP BY` en PostgreSQL es la forma más barata y evita traer 5 000 filas al cliente
  (y evita estadísticas sobre una muestra truncada, FR-012).
- **Instantánea**: cada petición abre una transacción `READ ONLY ISOLATION LEVEL REPEATABLE READ` para que `total`, `features` y todos los bloques salgan del mismo estado aunque el consumidor siga escribiendo; se prueba con una escritura intercalada.
- **Detalle**: `por_hora` = `generate_series(date_trunc('hour', start), end - interval '1 microsecond', '1 hour')` (el fin es exclusivo; máximo 744 casillas) con `LEFT JOIN` a los recuentos agrupados por `date_trunc('hour', event_time AT TIME ZONE 'UTC')`
  (ceros incluidos); `por_pais` = `GROUP BY country_id` con `LEFT JOIN geo.pais` para el nombre y la categoría «Sin país asignado» para nulos; distribuciones con
  `width_bucket` o `CASE` sobre límites fijos; nulos en `sin_valor`. Cada sesión ejecuta `SET TIME ZONE 'UTC'`.
- **Alternativas**: un endpoint por bloque (rutas fuera del contrato, más peticiones); agregar en Python (traslada datos sin necesidad); vistas materializadas o tablas
  de recuentos (prohibidas por el enunciado: contadores por mensaje) — se calculan desde `evento_actual`.

## R-004 — Límites de intervalos de las distribuciones
- **Decisión**: magnitud en intervalos de 1 (`<0`, `[0,1)` … `[8,∞)`); profundidad con los bordes 10, 30, 70, 150, 300 y 500 km (`<10`, `[10,30)`, `[30,70)`,
  `[70,150)`, `[150,300)`, `[300,500)`, `≥500`), que incluyen los cortes de color del mapa proporcionado (70 y 300 km). El primer intervalo recoge los valores
  negativos válidos. Se confirman en 5.2 con los datos reales, se anotan en el contrato y los nulos van a `sin_valor`.
- **Motivo**: coinciden con la leyenda del mapa (menos sorpresas) y dan resolución donde se concentran los terremotos (profundidades someras); fijos para que dos consultas sean comparables.
- **Alternativas**: intervalos dinámicos por percentiles (no comparables entre filtros).

## R-005 — Comparación con 2025 y periodo incompleto
- **Decisión**: se reutiliza la **semántica** validada en F4 (`sql/consultas/comparacion.sql`: media = total/365, días de cero, `sin_pais`, mediana, motivos de
  periodo incompleto, magnitud efectiva ≥ 4). `api/comparacion.py` implementa las mismas consultas como constantes parametrizadas; una prueba contrasta que el
  resultado de la API coincide con el del archivo de F4 sobre los mismos datos (sin duplicar lógica sin control). El esperado para una ventana de `d` días es
  `media_diaria × d`; el reciente cuenta solo `mag ≥ efectiva` y las magnitudes nulas van aparte.
- **Motivo**: es lo que pide el enunciado (§8.4) y ya está verificado contra un recuento independiente; reescribirlo desde cero repetiría trabajo y riesgo.
- **Alternativas**: importar el `.sql` de `/sql` (no está en la imagen de la API; copiarlo al contexto de build añadiría acoplamiento); materializar la media en una
  tabla (ocultaría la reproducibilidad).
- **Motivos de incompleto**: `hueco_pendiente` (`live.hueco` pendiente que intersecta la ventana), `antes_de_cobertura` (`start < live_since`, con `live_since = min(ingested_at) − 24 h` como en F4, no `min(event_time)`), `hasta_ahora`
  (`end > generated − API_MARGEN_PUBLICACION_S`, 900 s por defecto, propuesta a confirmar con la latencia observada de USGS); el texto del panel recuerda que USGS publica con retraso (enunciado §8.4).

## R-006 — Estado de ingesta y obsolescencia (DF4)
- **Decisión recomendada**: `/api/salud` añade `generated`, `ingestion_age_s`, `stale` (edad > `INGESTA_OBSOLETA_S`, 300 s), `stale_after_s`, `gaps_pending` y `live_since`.
  La API calcula la edad con su propio reloj (`generated`), no con el del navegador; el panel también obtiene de ahí la ventana de sus filtros (primero `/api/salud`, luego el resto con `start`/`end` explícitos) para no depender del reloj del cliente.
- **Motivo**: el productor consulta cada 60 s; cinco ciclos sin respuesta correcta es una señal clara sin falsos avisos por un ciclo lento. 300 s es una propuesta que
  se confirma con la medición del ciclo real en 5.6 (si el intervalo medido lo desaconseja, se justifica otro valor).
- **Alternativas**: 600 s; umbral relativo al `INGESTA_INTERVALO_S`; estado en el frontend (el reloj del cliente puede estar mal).
- **Separación de conceptos** (enunciado §8.6): «último acceso correcto a la API» = última respuesta 200 en el navegador; «última ingesta» = `last_ingestion`;
  «periodo consultado» = `period` de la respuesta.

## R-007 — Aislamiento: la API lee `historico` solo para la comparación (DF6) (DF6)
- **Decisión**: `/api/eventos` y los bloques por hora, país y distribuciones leen solo `live` (+ `geo.pais` para nombres). Únicamente `api/comparacion.py` lee
  `historico.evento`, con `SELECT` agregado. La prueba de F3 `test_consultas_solo_sobre_el_esquema_live` (solo mira `SQL_EVENTOS` y las SQL del consumidor) **no se modifica**; se añade una prueba nueva que verifica que el SQL de `/api/eventos` no menciona `historico`, `sintetico` ni `geo_catalogo`.
- **Motivo**: la comparación del enunciado exige el histórico; la constitución (III) exige que no se mezclen con los eventos reales: se mantienen en bloques con `source`.
- **Alternativas**: mover la media a una tabla de `live` (mezcla almacenes); rol de solo lectura distinto en PostgreSQL (más seguro pero un cambio de base de datos que
  excede F5; queda como mejora anotada para F6–F7).

## R-008 — Errores y tiempos máximos
- **Decisión**: el manejador 503 existente cubre todos los endpoints; se añade un manejador de `RequestValidationError` → 422 `{error, detail}` en el mismo formato,
  y `statement_timeout` por conexión (`API_STATEMENT_TIMEOUT_S`, 10 s) para que una consulta lenta termine en 503 y no cuelgue la petición.
- **Motivo**: el contrato exige error explícito; el frontend ya tiene timeout de 15 s.
- **Alternativas**: dejar el 422 por defecto de FastAPI (formato distinto, el panel tendría dos formatos de error).

## R-009 — Cómo se respeta el frontend proporcionado (DF1)
- **Decisión recomendada**: se conserva `AppComponent` como contenedor y todo su comportamiento (capas OSM/países/terremotos, círculos y colores, lectura con
  `AbortController` y 15 s, cabecera de ngrok, `config.json` con `mode` `demo|api`, `refreshMs ≥ 30 s`, manejo de coordenadas inválidas, sin HTML inyectado); se extrae
  la lectura a un `ApiService` y se añaden componentes standalone (filtros, estado, tabla, gráficas, comparación) y funciones puras en `filtros.ts`/`formato.ts`.
  `paises.geojson` y `terremotos-demo.geojson` no se modifican; `config.json` solo podría ganar campos no secretos.
- **Motivo**: «respetando el frontend proporcionado»; menor riesgo de regresión del mapa y menos código que defender.
- **Alternativas**: reescribir (más libertad, pierde la base y la defensa de «lo entregado»).

## R-010 — Gráficas sin dependencia (DF2)
- **Decisión recomendada**: barras y líneas con SVG generado por Angular a partir de datos ya agregados por la API; cada gráfica lleva una tabla textual equivalente
  (accesibilidad) y un `<title>/<desc>`. Los números no se calculan en el cliente.
- **Motivo**: cuatro tipos de gráfica sencillos (barras horarias, barras por país, dos histogramas) no justifican una biblioteca; menos peso, sin licencias y todo explicable.
- **Alternativas**: Chart.js/ngx-charts (más rápido de dibujar, dependencia nueva a fijar, accesibilidad que hay que reforzar y más superficie de defensa).

## R-011 — Estrategia de pruebas del panel (DF5)
- **Decisión recomendada**: la lógica sin DOM (construcción de parámetros, validación de filtros, clasificación de estados, clases de profundidad/magnitud, formato UTC,
  ordenación y paginación de la tabla) vive en archivos `.ts` puros probados con `node --test` (Node 24 ejecuta TypeScript sin dependencias). El comportamiento visual se
  verifica en el navegador integrado con la API real, con capturas y lectura del árbol de accesibilidad como evidencia.
- **Motivo**: el proyecto de apoyo no incluye ningún marco de pruebas; añadir Karma/Jasmine implica navegador de pruebas y dependencias pesadas.
- **Alternativas**: Karma/Jasmine (estándar Angular), Playwright (más completo, instalación pesada). Verificado en Node 24.11: solo elimina tipos, no resuelve importaciones sin extensión ni admite `enum`; por eso los módulos puros serán autocontenidos, con `import type` y extensión `.ts`. Si Angular rechaza la extensión (haría falta `allowImportingTsExtensions` en `tsconfig.json`) o `node --test` no puede importarlos, se detiene la tarea y se consulta antes de añadir una dependencia.

## R-012 — Riesgos
| Riesgo | Mitigación |
|---|---|
| Cifras distintas entre mapa y gráficas por peticiones en momentos distintos | `start`/`end` explícitos y compartidos en un refresco; el contador cruzado se comprueba en SC-008 |
| Desplazamiento de `offset` si llegan eventos entre páginas | Ventana `end` fija en la paginación; documentado (R-002) |
| Comparación en una cobertura muy corta (2 días de datos) | `antes_de_cobertura`/`hasta_ahora` y texto explícito; sin conclusiones fuera de la cobertura |
| Media de 2025 inflada por réplicas | Se muestra también la mediana diaria; las conclusiones lo mencionan |
| 5 000 marcadores ralentizan el navegador | Canvas de Leaflet (ya configurado); se mide en 5.7 con el límite máximo |
| Cambios de la API rompen al frontend proporcionado | Cambios solo aditivos; el modo `demo` y `/api/eventos` sin parámetros se prueban en la regresión |
| Ensayos de fallo detienen servicios reales | Solo recursos temporales (API y base aparte); nunca `stop` de PostgreSQL ni del productor reales |
| `/docs` y `/openapi.json` de FastAPI quedan públicos por el túnel | No contienen secretos y la API es de solo lectura; se valora desactivarlos en F7 (fuera de F5) |
| Texto de `place` o de la API con HTML | Siempre `textContent` y plantillas de Angular; prueba con una cadena con `<script>` |
