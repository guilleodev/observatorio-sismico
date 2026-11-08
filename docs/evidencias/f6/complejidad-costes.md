# Complejidad, escalado y costes (borrador para la memoria de F7)

Borrador de F6 · paso 6.5 (T039–T040) · 2026-11-08. Responde a `ENUNCIADO.md` §10 y alimenta el paso 7.2; no lo sustituye.
Todo lo calculado sale de `scripts/f6/modelo_costes.py` (se regenera con `py -3.13 -X utf8 scripts/f6/modelo_costes.py`); las medidas, de `6.4-mediciones.txt` y `6.5-comparaciones.txt`.

**Cómo leer las cifras.** `[MEDIDO]` = medición de este proyecto en el equipo descrito en `6.4-mediciones.txt`. `[PUBLICADO]` = cuota de una página oficial en la fecha indicada. `[SUPUESTO]` = valor
hipotético de ejemplo. `[PENDIENTE]` = dato que solo conoce la persona estudiante; mientras no lo dé, es un supuesto (y los ejemplos numéricos de costes son **hipotéticos**, no reales).
**Las proyecciones a 10⁸ filas son un modelo lineal calibrado con 10⁵ filas sintéticas en una sola máquina: no son mediciones a esa escala ni una predicción.**

## 1. Tres operaciones: coste medio, peor caso y lo medido

| Operación | Estructura | Medio | Peor caso | Medido (10³ → 10⁴ → 10⁵ filas) |
|---|---|---|---|---|
| Búsqueda de versiones por `event_id` | índice B-tree (clave primaria `(event_id, updated_at)`) | O(log n) | O(log n) (árbol equilibrado) | 0,13 → 0,13 → 0,13 ms (p95 ≈ 0,18): constante dentro del ruido |
| …sin índice | recorrido secuencial | O(n) | O(n) | 0,16 → 0,49 → 4,0 ms |
| …en Python | lista recorrida / diccionario | O(n) / O(1) esperado | O(n) / O(n) por colisiones (teórico, no provocado) | lista 0,013 → 0,19 → 10,2 ms; diccionario 0,0001 → 0,0003 → 0,0006 ms |
| Integración geográfica | STRtree + `covers` exacto sobre 177 polígonos | O(log p + k) por punto (p polígonos, k candidatos) | O(p) si el punto toca la caja de muchos polígonos (fronteras complejas) | 7,5 µs por punto (p95 14 µs) en los tres tamaños; lote lineal: 9 → 91 → 908 ms |
| Agregación por ventanas de 1 h | `GROUP BY` en SQL / bucle en Python | O(n) | O(n) | SQL 0,6 → 4,9 → 35 ms; Python 1,2 → 12,5 → 119 ms |

Notas: (1) buscar **todas** las versiones de un id obliga a recorrer toda la lista aunque el id esté el primero, por eso «mejor», «media» y «peor» de la búsqueda secuencial coinciden (10,2 / 10,2 / 10,3 ms): el mejor caso solo existiría si se parara en la primera coincidencia.
(2) El peor caso de la búsqueda en B-tree es el de la profundidad, no el de una colisión: con ids ausentes cuesta lo mismo (0,12 ms). (3) En SQL la ventaja del índice crece con n: 1,3× a 10³, 3,3× a 10⁴, **27×** a 10⁵ (`6.5-comparaciones.txt`).
(4) Frente a la lista, el diccionario es ≈ 17 000× más rápido a 10⁵ filas, a cambio de construirlo (132 ms) y de ≈ 78 B de memoria extra por fila (7,8 MB); el B-tree de la base cuesta ≈ 41 B por fila en disco (3,9 MB a 10⁵) y sobrevive a los reinicios.

## 2. ¿Y con 100 millones de registros?

Tabla del modelo (`modelo_costes.py`, sección A), con la **fila real** de 1,29 KB (GeoJSON original incluido, medida en `historico.evento`) y la **fila compacta** de 177 B (medida en el benchmark, sin el JSON):

### A. Proyección (modelo lineal calibrado en 10^5; NO son mediciones a esa escala)

| N filas | disco con JSON original | disco compacto (sin JSON) | índice PK real | RAM de lista+dict (cota) | ¿cabe en RAM? | búsqueda secuencial Python | SQL sin índice (en caché / leyendo disco) | niveles B-tree | agregación SQL de toda la tabla (en caché) | asignación de país en lote (1 núcleo) |
|---|---|---|---|---|---|---|---|---|---|---|
| 100,000 | 132.1 MB | 17.7 MB | 10.8 MB | 102.4 MB | sí | 10.2 ms | 4.0 ms / 132.1 ms | 3 | 35.0 ms | 750.0 ms |
| 1,000,000 | 1.3 GB | 177.0 MB | 108.3 MB | 1.0 GB | sí | 102.0 ms | 40.0 ms / 1.3 s | 3 | 350.0 ms | 7.5 s |
| 10,000,000 | 13.2 GB | 1.8 GB | 1.1 GB | 10.2 GB | NO | 1.0 s | 400.0 ms / 13.2 s | 4 | 3.5 s | 75.0 s |
| 100,000,000 | 132.1 GB | 17.7 GB | 10.8 GB | 102.4 GB | NO | 10.2 s | 4.0 s / 2.2 min | 4 | 35.0 s | 12.5 min |

Tope de un diccionario en memoria con el 60 % de la RAM (15.15 GB): ≈ 8,876,953 filas (≈ 10^7). A 10^8 hace falta el índice de la base de datos.
Ritmo real de este proyecto: ≈ 315 versiones/día → 10^8 filas equivaldrían a ≈ 870 años de ingesta como la actual: solo se alcanzaría con otras fuentes (sensores, redes sísmicas completas).
Crecimiento de `live` por día [MEDIDO]: ≈ 3.4 MB (respuestas originales) + 0.41 MB (versiones) ≈ 3.8 MB/día → 1.3 GB/año.

Qué se concluye, recurso a recurso:

- **Memoria.** Guardar todo en una lista o un diccionario de Python (≈ 1 KB por fila, cota) deja de caber en ≈ 9·10⁶ filas con 15 GB; a 10⁸ serían ≈ 100 GB. La búsqueda por identificador no puede depender de estructuras en memoria del proceso: debe quedarse en el índice de la base, que además es persistente.
- **Disco.** Con el JSON original son ≈ 132 GB de tabla y ≈ 11 GB de índice de clave primaria; sin él (columnas tipadas) ≈ 18 GB. El JSON original es el 86 % del tamaño: es lo primero que conviene separar o comprimir.
- **Búsqueda por identificador.** Con índice sigue siendo O(log n): el B-tree pasa de 3 a 4 niveles (con ≈ 200 claves por página), es decir, **una página más** por búsqueda. En caché es del orden de microsegundos extra; en frío, una lectura de disco más. Sin índice, un recorrido de 132 GB leyendo disco a 1 GB/s (supuesto) son ≈ 2 min por búsqueda: inviable.
- **Integración geográfica.** El coste por evento no depende de n (7,5 µs); lo que escala es el reproceso masivo: 10⁸ asignaciones son ≈ 12,5 min en un núcleo y se dividen casi linealmente entre núcleos. No es un cuello de botella del flujo online (cientos de eventos al día).
- **Agregación por ventanas.** Recorrer toda la tabla son ≈ 35 s con los datos en caché (modelo) y minutos si hay que leer disco. Pero la API **no agrega toda la tabla**: agrega el periodo pedido. Con la tabla ordenada o particionada por `event_time`, el coste pasa a depender del tamaño de la ventana (24 h, 7 días), no del histórico.
- **Cuellos de botella, por orden de aparición:** (1) las estructuras en memoria (≈ 10⁷ filas); (2) el almacenamiento del JSON original y la presión sobre la caché del índice (≈ 10⁷–10⁸); (3) la **paginación por `OFFSET`** de `/api/eventos`, que recorre y descarta `offset` filas (O(offset); `offset` admite hasta 2·10⁹): con millones de filas la última página sería cara; (4) las consultas que no filtran por tiempo; (5) la sobrecarga constante por petición (≈ 0,12 ms de ida y vuelta), irrelevante hasta que el resto crezca.
- **Realismo del tamaño.** El ritmo real es ≈ 315 versiones/día (`live`, medido): 10⁸ filas serían ≈ 870 años de esta ingesta. Con USGS solo se llegaría a esa cifra con otras fuentes (redes sísmicas completas, sensores). Se razona porque lo pide §10, no porque el MVP la necesite.

### Propuesta de escalado y mejoras (por orden de beneficio/coste; todas dentro de PostgreSQL y Python, sin servicios nuevos)

1. **Mantener el índice B-tree por `(event_id, updated_at)`** y no añadir cachés propias en el proceso: ya cumple O(log n) a esta escala y a la siguiente.
2. **Separar o comprimir el JSON original** (`raw`): conservarlo en una tabla aparte o comprimido (como ya se hace con `respuesta_original`) y dejar en la tabla caliente solo las columnas tipadas: pasa de ≈ 1,3 KB a ≈ 0,2 KB por fila (÷ 7) y cabe mucha más tabla en caché.
3. **Particionado declarativo por tiempo** (mes de `event_time`) de `evento_version`: las consultas por periodo tocan solo sus particiones y los índices se mantienen pequeños; se puede archivar una partición antigua sin recorrer el resto.
4. **Archivado de lo antiguo:** exportar las particiones viejas a archivos comprimidos con huella SHA-256 (el mismo procedimiento que el histórico de 2025) y retirarlas de la base; con la política de retención de `respuesta_original` (hoy lo que más crece, 3,4 MB/día).
5. **Resúmenes precalculados por hora** (tabla de agregados actualizada al insertar o vista materializada refrescada): la agregación deja de ser O(filas del periodo).
6. **Paginación por clave (`event_time`, `event_id`) en lugar de `OFFSET`**, y compresión HTTP de las respuestas (hoy `/api/eventos` no se comprime: 57 KB; es también lo que más consume de la cuota de ngrok).
7. **Reproceso geográfico en lotes paralelos** (un proceso por núcleo) cuando cambie el catálogo.
8. **Más allá de una sola máquina** (réplicas de lectura, almacenamiento columnar) solo se menciona para señalar dónde está el límite; **no forma parte del MVP** ni se propone adoptarlo.

## 3. Costes

Equipo medido: AMD Ryzen 7 7700X (16 hilos), 31 GB de RAM (15 GB para Docker), Windows 11 / Docker Desktop / WSL2. Pila en marcha: ≈ 1,3 GiB de RAM en total (Kafka 1,0 GiB; PostgreSQL 0,12 GiB; API/consumidor/productor ≈ 40 MiB cada uno) con CPU < 1 %.
Almacenamiento real hoy: volumen de PostgreSQL 156 MB (base de datos 46 MB; el histórico de 2025 ocupa 23 MB), volumen de Kafka 1,12 GB, crecimiento de `live` ≈ 3,8 MB/día ≈ 1,3 GB/año.

### B. Costes anuales (EUR) de mantener la pila actual en el equipo propio; variables [PENDIENTE]/[SUPUESTO] editables arriba

| Categoría | A · 24 h/día (estabilidad) | B · 8 h/día (uso académico) | Base del cálculo |
|---|---|---|---|
| Hardware (amortización de la fracción del equipo) | 56.25 | 56.25 | 900 € / 4 años × 25% |
| Electricidad | 85.41 | 28.47 | 65 W × horas × 365 × 0.15 €/kWh |
| Almacenamiento (capacidad nueva de un año) | 0.11 | 0.11 | 1.3 GB/año × 0.08 €/GB |
| Transferencia (ngrok + Netlify, planes gratuitos) | 0.00 | 0.00 | 0 € marginales dentro de las cuotas; ver sección C: NO equivale a coste cero |
| Mantenimiento | 360.00 | 360.00 | 2.0 h/mes × 12 × 15.0 €/h |
| Desarrollo (una vez, no anual) | 1,800.00 | 1,800.00 | 120 h × 15.0 €/h |
| **Total del primer año** | **2,301.77** | **2,244.83** | suma de las seis categorías |
| Total de años siguientes (sin desarrollo) | 501.77 | 444.83 | |

Referencia hipotética, solo para comparar (no forma parte del MVP): una máquina virtual equivalente ≈ 720.81 €/año de infraestructura, sin contar el trabajo propio (60.0 €/mes + disco, ambos supuestos).
Con 65 W y 24 h/día el consumo sería ≈ 569 kWh/año; por cada 10 W de diferencia en la potencia real, ±13.1 €/año.

**Datos que pido a la persona estudiante** (hasta que los dé, los números de la tabla son los ejemplos hipotéticos marcados): precio de compra y años de uso del equipo; potencia media real con la pila en marcha (un vatímetro, o la ficha técnica del equipo); tarifa eléctrica (€/kWh) del contrato; horas de desarrollo y si se valoran (y a cuánto); horas de mantenimiento al mes; cuántas horas al día está encendido de verdad.
**Sin beneficios inventados:** el observatorio no genera ingresos medibles, así que no se calcula ROI (§10 lo permite solo con un beneficio medible y justificable). La cuota gratuita de ngrok/Netlify no equivale a coste cero: tiene límites y sustituye pago por dependencia (ver abajo).

### C. Transferencia y cuotas gratuitas (el panel con refresco de 60 s)

Por refresco del panel: 3 peticiones y 58.7 KB (sin compresión). Por pestaña abierta: 180 peticiones/h y 3.4 MB/h; 4,320 peticiones/día y 83 MB/día.

| Cuota gratuita (consultada 2026-11-08) | Límite mensual | Horas de UNA pestaña abierta que lo agotan | Días continuos |
|---|---|---|---|
| ngrok · peticiones HTTP | 20,000 | 111 h | 4.6 |
| ngrok · datos salientes | 1.0 GB | 298 h | 12.4 |
| Netlify · créditos (300; 20 por GB, 15 por despliegue) | 300 | ≈ 10,410 cargas completas del sitio (1.18 MB sin comprimir) con 4 despliegues al mes | — |

Límite que manda: las 20,000 peticiones de ngrok (una sola pestaña a 60 s las agota en ≈ 4.6 días). Con refresco de 5 min (Config.refreshMs = 300000) durarían ≈ 23 días por pestaña.
Transferencia entrante (USGS): 133 KB/consulta × 1440 consultas/día ≈ 187 MB/día ≈ 67 GB/año de bajada: sin coste marginal en una conexión de tarifa plana, pero no es cero.

**Consecuencia práctica para 6.6 (publicación):** el plan gratuito de ngrok se queda corto para un panel con refresco de 60 s si lo dejan abierto varias personas o durante días. Opciones sin contratar nada: subir `refreshMs` (p. ej. 300 000), abrirlo solo durante la defensa, y valorar la compresión HTTP (mejora 6). Es una decisión de la persona estudiante antes de publicar; aquí solo se cuantifica.

## 4. Limitaciones

- Una sola máquina, con el sistema real en marcha y datos en memoria (tmpfs) en las mediciones: sin latencia de disco, con todo en caché; las proyecciones a disco usan un rendimiento **supuesto** (1 GB/s).
- Las proyecciones son lineales, calibradas con 10⁵ filas **sintéticas** (uniformes, sin la forma de los datos reales). La caché, las cardinalidades reales, la fragmentación del índice y los planes de consulta a 10⁸ filas pueden cambiar los resultados un orden de magnitud.
- El tamaño por fila real procede de 18 302 eventos del histórico; las filas de `live` incluyen más texto (`raw` completo por versión) y su tamaño medio es ligeramente mayor (1,34 KB).
- Los costes dependen de variables **no medidas** (precio, vatios, tarifa, horas): sin ellos son ejemplos. Las cuotas de ngrok y Netlify se consultaron el 2026-11-08 y cambian a menudo; Netlify publica a la vez 10 y 20 créditos por GB en páginas distintas (se usó 20).
- No se midieron memoria ni tiempo a más de 10⁵ filas (el opcional ≈ 183 000 de F5 no se repitió); no se mide ninguna operación sobre 10⁸ filas.

## 5. Umbrales de 6.4: aprobados y verificados

Ver `6.4-mediciones.txt`, anexo «Decisión T037». Los umbrales son **objetivos aprobados para el entorno de benchmark** (hasta 10⁵ elementos); la columna «verificado» son las dos ejecuciones medidas, no una garantía en producción.

## 6. Pregunta de defensa

«¿Qué cambiaría en el diseño si hubiera 100 millones de registros en vez de unos miles?» → ver §2: mantener la búsqueda en el índice de la base (nunca en memoria del proceso), separar/comprimir el JSON original, particionar por tiempo y archivar, precalcular las agregaciones y paginar por clave; la asignación de país por evento no cambia (7,5 µs) y solo el reproceso masivo se paraleliza.
