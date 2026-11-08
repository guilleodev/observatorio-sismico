# Resultados de la fase F5 — API y dashboard (T054)

Resultado **observado** de cada criterio de `specs/004-api-dashboard/spec.md`. Solo se marca «cumplido» lo comprobado con evidencia guardada en esta carpeta
(`docs/evidencias/f5/`); las reservas figuran junto a cada criterio. Estado al cerrar (2026-11-08): cinco servicios `healthy` con los mismos contenedores que en 5.6,
lag 0, reconciliación 0 (`aislamiento.txt`, 2026-11-08), **661 pruebas de backend** (`5.7-regresion.txt`, 2026-11-07; el código no ha cambiado desde entonces) y **88 de frontend** (`5.7-pruebas-frontend.txt`, 2026-11-08) pasan. No hay commit ni push: el commit `[F5]` lo hace la persona estudiante.

## 1. Criterios de éxito

| SC | Criterio | Resultado | Evidencia |
|----|----------|-----------|-----------|
| SC-001 | Forma de las respuestas según `contracts/api-f5.md` y `CONTRATO-API.md`; 0 NaN/Infinity; 0 respuestas vacías ante un fallo de base | **Cumplido**: pruebas de estructura de los tres endpoints (`test_api_eventos*.py`, `test_api_estadisticas.py`, `test_api_salud.py`), 422 con `{error, detail}` en 14 entradas inválidas reales y 503 (nunca lista vacía) con la base caída | `5.1-pruebas.txt`, `5.1-api-real.txt`, `5.2-estadisticas-real.txt`, `5.6-fallos.txt` |
| SC-002 | ≥ 12 combinaciones de filtros: `/api/eventos` (todas las páginas) = `total` de estadísticas = SQL independiente, al 100 % | **Cumplido**: 13 filtros reales en 5.1, 15 combinaciones sobre los eventos reales en 5.2 y 14 en la prueba de equivalencia (92 eventos reproducibles, oráculo en Python); incluye `sin_pais`, país sin eventos, magnitud nula y periodo vacío | `5.1-api-real.txt`, `5.2-estadisticas-real.txt`, `5.2-pruebas.txt` |
| SC-003 | Con un límite pequeño: 0 duplicados y 0 omitidos, `truncated`/`total` correctos, estadísticas idénticas con y sin truncado | **Cumplido**: páginas de 4, 5 y 7 sobre conjuntos de 14, 23 y 92 eventos, páginas de 25 sobre datos reales y truncado forzado (`API_MAX_EVENTOS=20`, 166 eventos tras «Cargar el resto», 0 duplicados); la instantánea `REPEATABLE READ` se probó con su «prueba de la prueba» (sin ella, 23 frente a 24) | `5.1-pruebas.txt`, `5.2-pruebas.txt`, `5.6-fallos.txt` |
| SC-004 | Σ serie horaria = Σ países = Σ distribuciones + «sin valor» = total; bordes de hora y revisiones sin duplicar | **Cumplido**: invariante comprobada en todas las combinaciones de SC-002, bordes `hh:00:00.000`/`hh:59:59.999`, fin exclusivo, revisión que mueve el evento de hora o de país, 744/745 casillas y, en el navegador, 10 combinaciones con mapa = tabla = estadísticas = API = gráficas | `5.3-pruebas.txt`, `5.3-comparacion-real.txt`, `5.7-escenarios.md` |
| SC-005 | Comparación = recuento independiente de F4 (total 2025 / 365) para global, un país y «sin país»; media 0 → «no definida»; umbral < 4 elevado e indicado; cada motivo de periodo incompleto probado | **Cumplido con reserva**: 12 comparaciones reales = oráculo independiente = implementación de F4; los cuatro motivos (`hueco_pendiente`, `antes_de_cobertura`, `hasta_ahora`, `despues_de_ultima_lectura`) por separado y combinados y la media 0 están probados. **Reserva:** la variación a M ≥ 4 mezcla coberturas distintas (§6), por eso el panel la advierte siempre | `5.3-comparacion-real.txt`, `5.3-pruebas.txt`, `5.7-explain.txt` |
| SC-006 | Base inalcanzable (recurso temporal): los tres endpoints dan error explícito y el panel muestra «sin conexión con el backend» conservando la última lectura con su antigüedad | **Cumplido**: 503 en los tres endpoints con un contenedor `api-f5-temp` apuntando a un host inexistente; el panel conserva la lectura y su antigüedad crece con `performance.now()` (6 s → 10 s) | `5.6-fallos.txt`, `5.6-concurrencia.txt` |
| SC-007 | Aviso de datos desactualizados con reloj simulado; desaparece al reanudarse; «sin eventos» ≠ error | **Cumplido**: `stale` en 299,999 / 300,000 / 300,999 / 301,000 s con reloj simulado; con la base real se vio aparecer y desaparecer; un filtro vacío muestra «Sin eventos» y no el aviso de error | `5.6-pruebas.txt`, `5.6-fallos.txt`, `5.6-estado-real.txt` |
| SC-008 | En el navegador, ≥ 5 combinaciones con datos reales: mapa = tabla = total de gráficas; selección sincronizada; el modo `demo` sigue funcionando | **Cumplido**: 7 combinaciones en 5.5 y 17 comprobaciones sin fallos en 5.7 (10 combinaciones, selección en ambos sentidos, errores y recuperación); `demo`: 4 eventos, 0 componentes nuevos y 0 llamadas a la API | `5.5-panel.txt`, `5.7-escenarios.md` |
| SC-009 | Tabla operable con teclado; la información de color y tamaño también en texto; ningún texto externo como HTML | **Cumplido con reservas**: Intro ordena, Tab recorre las filas, Intro selecciona; profundidad y magnitud en texto; todo texto como `textContent` o interpolación de Angular. **Reservas:** comprobación manual con el navegador integrado y reglas WCAG medidas con script; **no se guardan capturas** en el repositorio ni se probó con lectores de pantalla reales (§6) | `5.5-panel.txt`, `5.7-escenarios.md` |
| SC-010 | Mediana y p95 de cada endpoint con datos reales y planes `EXPLAIN ANALYZE` con y sin índice; umbrales propuestos tras medir y confirmados por la persona estudiante | **Cumplido frente a los umbrales confirmados el 2026-11-08, fijados DESPUÉS de las mediciones (no son predicciones previas)**: p95 ≤ 50 / 100 / 250 ms (salud / eventos / estadísticas) y ≤ 500 ms a gran escala. Medido (mediana / p95): 1,6 / 1,8 ms, 5,4 / 6,2 ms (eventos de 24 h; 9,9 / 10,6 ms con la cobertura completa) y 23,4 / 26,4 ms (estadísticas de 24 h; 24,2 / 26,8 ms con la cobertura completa), p95 máximo 28,0 ms (45,8 con 4 clientes concurrentes) y 380,5 ms a ≈ 183 000 filas. Índices: criterio de 2× y 1 ms; no hace falta ninguno nuevo. **Reserva:** mediciones de esta máquina | `5.7-explain.txt`, `5.7-tiempos.txt`, `5.7-tiempos-escala.txt` |
| SC-011 | ≥ 3 conclusiones con cifra, filtro y periodo reproducibles desde la API | **Cumplido**: tres conclusiones (un hallazgo real, una diferencia no concluyente y una diferencia de cobertura) reproducidas dos veces con salida idéntica | `conclusiones.md`, `scripts/f5/conclusiones_57.py` |
| SC-012 | 0 filas históricas en `/api/eventos`; 0 escrituras de pruebas en tablas definitivas; 0 volúmenes o datos borrados; cinco servicios `healthy`, lag 0, reconciliación 0; documentos del profesor, `specs/001`–`003` y catálogo intactos; la suite anterior (419) pasa | **Cumplido**: 30 comprobaciones de aislamiento sin fallos, huellas del histórico (`057f8f4e…`) y de `sintetico` (`5b9d041e…`) idénticas a la línea base de 5.1, lag 803/803, reconciliación 0; las 419 pruebas previas están dentro de las 661 (únicas adaptaciones: `test_api_eventos.py`, `test_last_ingestion.py` y `test_config.py`, sin quitar comprobaciones; `test_aislamiento.py` no se modificó) | `aislamiento.txt`, `5.7-regresion.txt` |

## 2. Requisitos funcionales

| Bloque | FR | Estado | Dónde |
|---|---|---|---|
| Contrato y filtros | FR-001 a FR-007 | Implementados y probados | `api/filtros.py`, `api/repositorio.py`, `api/main.py` |
| Estadísticas | FR-008 a FR-012 | Implementados y probados | `api/estadisticas.py` (agregación en SQL sobre el estado actual) |
| Comparación | FR-013 y FR-014 | Implementados y probados | `api/comparacion.py` (único módulo que lee `historico`, solo `SELECT` agregado) |
| Estado del sistema | FR-015 | Implementado y probado | `/api/salud` ampliado; `test_api_salud.py` (18 casos) |
| Dashboard | FR-016 a FR-022 | Implementados y probados (lógica pura con `node --test`; panel en el navegador) | `frontend/src/app/` (`filtros`, `api.service`, `tabla`, `graficas`, `comparacion`, `estado` y sus componentes) |
| Transversales | FR-023 a FR-026 | Cumplidos (cinco servicios, EXPLAIN y tiempos, evidencias, conclusiones) | `aislamiento.txt`, `5.7-*`, `conclusiones.md` |

## 3. Métricas observadas

- **Suite:** 419 (F4) → 542 (5.1) → 580 (5.2) → 643 (5.3) → 661 (5.6) pruebas de backend; frontend 33 (5.4) → 65 (5.5) → 87 (5.6) → 88 (5.7, `5.7-pruebas-frontend.txt`) con `node --test`. **135 mutaciones temporales, todas detectadas** (21 + 15 + 22 + 22 + 29 + 10 + 16; `5.x-mutaciones*.txt`); varias aparecieron como supervivientes en la primera ejecución por un caso de prueba mal construido y se corrigieron (§5).
- **Planes (volumen real, ≈ 400 filas en `live`):** todas las consultas de `live` tardan 0,05–0,3 ms y las de comparación sobre `historico` 9–15 ms; ningún índice nuevo mejora ≥ 2× y ≥ 1 ms. Con 18 702 filas el índice de F3 sobre `event_time` mejora 47 de 64 consultas; `min(ingested_at)` pasaría de 12,7 a 0,02 ms con 183 000 filas.
- **Tiempos HTTP (p95, ≥ 120 peticiones por caso, 0 errores):** `/api/salud` 1,8 ms; `/api/eventos` 2,6–10,6 ms; `/api/estadisticas` 19,8–28,0 ms; 4 clientes concurrentes: 17,0 y 45,8 ms; ≈ 183 000 filas: hasta 380,5 ms.
- **Navegador con 5 000 eventos:** carga de 0,5 a 1,5 s; desplazamiento del mapa 5,6 ms por fotograma; selección 22 ms; ordenar y buscar ≈ 11 ms (antes 2 006 y 1 439 ms).
- **Accesibilidad medible (375 / 768 / 1300 px):** 0 desbordes de página, 0 objetivos < 24 px, 0 controles sin nombre accesible, contraste mínimo 6,23:1, foco visible.
- **Ciclo del productor:** 60,0 s medidos; umbral `stale` de 300 s (DF4) confirmado.
- **Estado del sistema al cerrar:** `live` 541 eventos (446 con país, 95 sin país), histórico 18 302, `sintetico` 18; cuarentena 16.

## 4. Decisiones arquitectónicas

| Decisión | Contenido | Motivo |
|---|---|---|
| DF1 | Extender el frontend entregado sin reescribirlo | Mantiene mapa, capas, `config.json` y modo `demo`; solo cambian `src/app/` |
| DF2 | Gráficas SVG propias, sin biblioteca | Accesibilidad, ninguna dependencia nueva y cada línea explicable en la defensa |
| DF3 | Contrato ampliado de forma aditiva (`limit`, `offset`, `total`, `next_offset`, `truncated`, `sin_magnitud`, `coverage`, `/api/estadisticas`) | Compatible con `CONTRATO-API.md` |
| DF4 | `stale` a 300 s (cinco ciclos), configurable con `INGESTA_OBSOLETA_S` | Confirmado con el ciclo medido de 60,0 s |
| DF5 | `node --test` (Node 24) para la lógica pura más comprobación en el navegador integrado | Sin devDependencies nuevas ni cambios de `tsconfig` |
| DF6 | `api/comparacion.py` lee `historico.evento` con el rol de la API, solo `SELECT` agregado, con una prueba que limita esa lectura a ese módulo | El enunciado (§8.4) exige la comparación con 2025; sin materializar la media en `live` |
| DF7 | `sin_pais` reservado; 422 en vez de recorte silencioso; máximo 5 000 eventos; serie horaria omitida con motivo si supera 744 casillas; esperado = media × días | Los límites siguen el contrato y nunca se recortan en silencio |
| Complementarias | Una transacción `REPEATABLE READ` de solo lectura por petición; filtros definidos en un único lugar; ventana resuelta con el reloj de la API; una sola lectura alimenta mapa, tabla, gráficas y comparación; criterio de índices ≥ 2× y ≥ 1 ms | Coherencia entre componentes y paginación estable |

## 5. Incidencias y su resolución

1. **5.1–5.2:** casos de prueba mal construidos (parámetro repetido con fechas posteriores a `AHORA`; hora de `AHORA` equivocada; intruso duplicado en la prueba de instantánea) → corregidos; mutaciones 21/21.
2. **5.4:** `/api/salud` no traía `generated` (se añadió el respaldo con `/api/eventos?limit=1` hasta 5.6); «Filtros activos» describía lo solicitado y no lo dibujado → corregido; una mutación superviviente (magnitud desbordada) → caso añadido.
3. **5.5:** números con 15 decimales (redondeo solo de la presentación); textos duplicados en la tarjeta de comparación; mutaciones supervivientes en el desempate por id y en la validación de `comparacion` → pruebas reforzadas.
4. **5.6:** una expectativa propia errónea sobre el 422 con `sin-eventos` → corregida.
5. **5.7:** ordenar y buscar 5 000 filas tardaba ≈ 2 s → un único `Intl.Collator` y texto de búsqueda normalizado una vez (≈ 11 ms); objetivos táctiles de 18–22 px → ≥ 24 px; gráficas ilegibles en móvil y página ensanchada a 556 px → ancho mínimo dentro de una región desplazable y `minmax(0, 1fr)`; la ventana de las conclusiones empezaba antes de la cobertura → se fijó dentro de ella.
6. **Cierre:** al reanudar la sesión Docker Desktop no estaba en marcha (el equipo se había reiniciado); se arrancó y volvió a levantar los mismos contenedores sin recrearlos (ids idénticos, volúmenes intactos, sin hueco pendiente). Dos fallos de mi propio script de aislamiento (el `_` de `LIKE` coincidía con la base real y el CORS devuelve el origen configurado, no `*`) se corrigieron antes de guardar la evidencia.

## 6. Limitaciones y reservas

- **Diferencias de cobertura entre USGS reciente e histórico.** El feed `all_day` no cubre M 4,0–4,5 fuera de EE. UU. como el catálogo histórico (4,4 frente a 26,7 eventos/día). Una variación a M ≥ 4 no demuestra un cambio real de actividad; el panel lo advierte siempre y recomienda M ≥ 4,5. El histórico es la instantánea revisada y lo reciente es preliminar.
- **Cobertura corta de `live`** (≈ 2 días): las ventanas largas se marcan incompletas y las conclusiones 1–3 se apoyan en una muestra mínima (22 eventos de M ≥ 4,5); la conclusión 2 es no concluyente.
- **Accesibilidad no probada con lectores de pantalla reales** (VoiceOver o NVDA): solo estructura ARIA y reglas WCAG medibles con script; no se midió el contraste de la capa del mapa ni el zoom de texto al 200 %. No se guardan capturas en el repositorio.
- **Recuperación de huecos no probada contra un hueco real de USGS** (solo catálogo simulado y recursos temporales en F4); en F5 `gaps_pending` solo se verificó con huecos creados en bases temporales.
- **SC-010 de F3 (conservación tras 24 h) sigue pendiente de observación real**; no depende de F5.
- **Rendimiento medido en una sola máquina** (Windows 11, Docker Desktop, PostgreSQL local, un solo navegador); la escala de 183 000 filas es una réplica de datos reales usada como sintética y ya eliminada. No se extrapola a Netlify/ngrok (F6–F7).
- **Margen de publicación (`API_MARGEN_PUBLICACION_S=900`) no medido:** es una propuesta conservadora (15 min) para decidir cuándo una ventana reciente puede estar aún incompleta por el retraso de publicación de USGS; no se midió la latencia real de USGS y puede ajustarse sin tocar código.
- **Decisiones propias del contrato (no contradicen `CONTRATO-API.md`, que no las prevé):** un parámetro desconocido o repetido da 422 (un cliente con un parámetro extra, p. ej. un cache-buster, lo recibiría) y un `country_id` ausente de `geo.pais` da 422 en vez de `features: []`; ambas siguen la regla de no ignorar nada en silencio. Un país del catálogo sin eventos devuelve 200 con lista vacía.
- **Revisión humana del panel y commit `[F5]` pendientes** (el cierre es técnico, no definitivo hasta entonces).
- **Matrices de 5.1 y 5.2 no reejecutables tal cual:** `scripts/f5/matriz_51.py` y `matriz_52.py` conservan aserciones de su subpaso (tres claves en `/api/salud`; lista exacta de claves de `/api/estadisticas`) que ya no valen tras las ampliaciones aditivas de 5.3 y 5.6. Se conservan como evidencia histórica.
- **La cifra de 661 pruebas solo es válida con `scripts/f5/ejecutar.sh`** (PostgreSQL real en un contenedor temporal); sin `POSTGRES_HOST` las pruebas de base de datos se saltan y la suite sale parcial.
- **Validaciones sin contrato:** `min_mag` negativo se acepta y `start`/`end` solo admiten ISO 8601.
- **Otros:** la comparación usa 365 días fijos para 2025; los eventos que USGS elimina o fusiona no se reconcilian (F3); con Kafka caído y USGS accesible el hueco no se detecta (F4).

## 7. Pendiente de otras fases

- **F6:** replay con topic y esquema propios, ngrok, pruebas de aceptación del enunciado §11, y la observación real de más de 24 h de SC-010 de F3.
- **F7:** Netlify, memoria y defensa.
- Salvo la revisión humana del panel y el commit `[F5]`, no queda nada de F5 abierto.

## 8. Mapa de evidencias

`5.1-*` endpoints y filtros (entorno, pruebas, mutaciones, API real, aislamiento) · `5.2-*` estadísticas · `5.3-*` serie horaria y comparación · `5.4-*` filtros del frontend (línea base, pruebas, backend, mutaciones) ·
`5.5-*` panel (pruebas, mutaciones, navegador) · `5.6-*` estado y avisos (pruebas de backend y frontend, mutaciones, fallos, concurrencia, estado real) · `5.7-explain.txt`, `5.7-tiempos*.txt`, `5.7-escenarios.md`, `5.7-regresion.txt`, `conclusiones.md` ·
`aislamiento.txt` (cierre). Scripts reproducibles en `scripts/f5/` (`ejecutar.sh`, `escala_57.py`, `tiempos_57.py`, `conclusiones_57.py`, `aislamiento_final.sh`, mutaciones y matrices).

## 9. Revisión final independiente (T057)

Dos revisiones independientes (subagentes sin contexto previo), 2026-11-08. Ninguna encontró incumplimientos de los requisitos del profesor ni defectos de severidad alta.

- **Architect: APTO CON RESERVAS.** Contrato, filtros, estadísticas, comparación, arquitectura, aislamiento, dependencias, secretos y alcance conformes (no se adelantó F6). Hallazgos y resolución:
  1. *(corregido)* La fila 5.7 de la hoja de ruta seguía diciendo «umbrales propuestos pendientes de confirmar» → reescrita: confirmados el 2026-11-08, fijados tras medir.
  2. *(corregido)* Las 88 pruebas de frontend no tenían ejecución guardada (solo había 87) → `5.7-pruebas-frontend.txt` (88 pasan, 0 fallos).
  3. *(corregido)* Se precisaron las fechas de cada cifra (661 del 2026-11-07; estado del sistema del 2026-11-08).
  4. *(corregido)* SC-010 solo citaba el p95 → se añadió la mediana.
  5. *(corregido)* Margen de 900 s no medido y 422 por parámetro desconocido o `country_id` fuera del catálogo → declarados en §6 como decisiones propias; dos preguntas de defensa nuevas (§10, 11 y 12).
  6. *(en curso)* §9 y las marcas de T054–T059 se completan con este cierre.
- **QA Engineer: APTO CON RESERVAS.** Reejecutó: cinco servicios `healthy`; backend **661 pasan** (0 saltadas, 48,8 s); frontend **88 pasan** y `npm run build` sin errores (380,18 kB, solo el aviso de `leaflet` ya existente); `aislamiento_final.sh` OK (30/30); invariantes (lag 803/803/0, reconciliación 0, huellas del histórico y de `sintetico` iguales); `matriz_53.py` OK; 10 entradas inválidas con 422 y `{error, detail}`, POST/DELETE 405, `sin_pais` (33 eventos, todos sin país) y una paginación de 469 eventos con 469 ids únicos que coincide con `total` y con la suma de países y de horas de `/api/estadisticas`. Hallazgos:
  1. *(documentado)* `matriz_51.py` (1 fallo) y `matriz_52.py` (2 fallos) llevan aserciones de su subpaso que quedaron obsoletas al ampliar el contrato de forma aditiva en 5.3 y 5.6 (`/api/salud` ya no tiene tres claves; `/api/estadisticas` incluye `por_hora` y `comparacion`, que menciona «historico»). **No son regresiones de la API**; las evidencias guardadas son las del momento de su ejecución y la cobertura vigente está en `test_api_salud.py` y `test_api_estadisticas.py`. Se dejan sin tocar como evidencia histórica de cada subpaso.
  2. *(documentado)* `min_mag=-1` se acepta (200); el contrato no lo prohíbe. `start`/`end` solo admiten ISO 8601 aunque `metadata.period` devuelva milisegundos.
  3. *(corregido)* Estados no alineados entre hoja, `tasks.md` y §7 → alineados al cerrar T057 y T059.
  4. *(documentado)* Las pruebas con PostgreSQL se saltan sin `POSTGRES_HOST`: la cifra de 661 solo es válida con `scripts/f5/ejecutar.sh`.
  5. *(informativo)* SC-008 y SC-009 se apoyan en comprobación manual en un solo navegador, sin capturas ni lectores de pantalla (ya declarado).

## 10. Preguntas de defensa

1. **Si el consumidor inserta un evento mientras el panel pide la página 2 de 3, ¿por qué no se duplica ni se pierde ninguno?**
   *Esperada:* cada petición se ejecuta en una transacción `REPEATABLE READ` de solo lectura (instantánea) y el panel reutiliza el `period` resuelto (`start`/`end` explícitos) en todas las páginas, con orden estable por tiempo e id. Hay una «prueba de la prueba»: sin la instantánea, 23 frente a 24.
2. **¿Por qué hay un único lugar donde se definen los filtros y por qué mapa, tabla, gráficas y comparación piden el mismo periodo resuelto?**
   *Esperada:* para que describan el mismo conjunto; en la API, `Filtros.donde` se comparte entre `/api/eventos` y `/api/estadisticas` (equivalencia al 100 % en 14 combinaciones), y en el panel una sola lectura alimenta todos los componentes. La ventana sale de `generated` de la API, no del reloj del navegador.
3. **¿Por qué 422 y 503 y no un recorte silencioso o una lista vacía?**
   *Esperada:* un `limit` excesivo o una fecha ilegible es un error del cliente (422 con `{error, detail}`); una base caída o una consulta de más de 10 s es un fallo del servidor (503). Devolver `[]` haría pasar un fallo por «sin terremotos». El panel distingue «sin eventos» (resultado válido) de «sin conexión».
4. **¿Por qué se agrega en SQL con el estado actual y no con contadores o con la página recibida?**
   *Esperada:* una revisión cambia la fila vigente, no suma otro evento, y las cifras deben cubrir todo el filtro, no una muestra truncada. El navegador no calcula estadísticas: solo dibuja lo que devuelve `/api/estadisticas`.
5. **¿Por qué el denominador de la media de 2025 es 365 y por qué el periodo reciente puede estar incompleto?**
   *Esperada:* los días sin eventos también son observaciones (si no, la media se infla). El reciente puede tener un hueco de ingesta pendiente, caer fuera de la cobertura de `live`, no haber terminado o ser posterior a la última lectura; la respuesta lo marca con su motivo y el panel lo muestra.
6. **¿Cómo se garantiza que la API no mezcla `live` con el histórico y qué pasa con `sintetico`?**
   *Esperada:* `/api/eventos` y las estadísticas solo leen `live.evento_actual`; solo `comparacion.py` lee `historico.evento` (solo `SELECT` agregado, con una prueba que lo exige) y ningún módulo menciona `sintetico`; `aislamiento.txt` comprueba huellas, ids cruzados y que el modo presente sea solo `live`.
7. **El feed reciente da un −54 % frente a 2025 en M ≥ 4,5. ¿Es un descenso de la actividad sísmica?**
   *Esperada:* no se puede afirmar: son 2 días de muestra, el 1 % de las ventanas de 49 h de 2025 también tuvo 22 o menos, la media está inflada por réplicas y lo reciente es preliminar. Es una diferencia observada, no una tendencia ni una predicción. A M 4,0–4,5 la diferencia es de cobertura del feed.
8. **¿Por qué no se añadió ningún índice y cuándo se añadiría?**
   *Esperada:* con 400 filas el planificador recorre la tabla en décimas de milisegundo; el criterio aprobado es una mejora de al menos 2× y 1 ms. El índice de F3 sobre `event_time` ya compensa desde ≈ 18 000 filas; se reevaluaría con `escala_57.py` cerca de 183 000 filas (`min(ingested_at)` pasaría de 12,7 a 0,02 ms).
9. **¿Por qué los umbrales de SC-010 se confirmaron después de medir y qué valor tienen?**
   *Esperada:* para no presentar como predicción lo que se fijó viendo los datos; sirven como regresión (si un cambio futuro los supera, se investiga), no como garantía en otro equipo ni a través de ngrok/Netlify.
10. **¿Por qué «sin datos» no es «sin conexión» y de dónde sale la hora del aviso de datos desactualizados?**
    *Esperada:* un filtro vacío es un resultado válido; un fallo de red o un 503 es un error. `stale` lo calcula la API con su propio reloj (`ingestion_age_s > stale_after_s`); el navegador solo muestra el campo y mide la antigüedad de su lectura con un reloj monotónico.
11. **¿Por qué un `country_id` que no está en el catálogo da 422 y no `features: []`? ¿Cómo se distingue de un país sin eventos?**
    *Esperada:* se valida contra `geo.pais`: un código inexistente es un error del cliente (probablemente una errata), mientras que un país del catálogo sin eventos en el periodo es un resultado válido (200 con lista vacía y recuentos a 0). Es una decisión propia que sigue la regla de no ignorar nada en silencio.
12. **¿Por qué `/api/salud` y `/api/estadisticas` usan el reloj de la API y no el del navegador, y qué pasa si difieren?**
    *Esperada:* `stale`, la ventana resuelta y la edad de la ingesta se calculan en la API (`generated`); un reloj de cliente adelantado o atrasado desplazaría la ventana y falsearía el aviso (probado con un reloj adelantado 5 días y atrasado más de un año). El navegador solo mide la antigüedad de su lectura con un reloj monotónico.

Trazabilidad de las respuestas 1 y 7: la prueba de la instantánea (23 frente a 24 sin la sesión de producción) está en `backend/tests/unit/test_api_paginacion.py` y forma parte de la suite de `5.7-regresion.txt` y las cifras de la conclusión 2 (22 eventos, −54 %, 1 % de las ventanas) en `conclusiones.md`.
