# Verificación de F7 publicada en Netlify (F8 · T036)

**Fecha**: 2026-11-11 (tarde) · **Sitio**: `https://observatorio-sismico.netlify.app` · **Despliegue**: `6af4a52d30a824e6ef9dead2` («F7 Mission Control») · **Túnel**: dominio ngrok estático → `127.0.0.1:8000`, abierto solo durante la prueba y cerrado al terminar · **Navegador**: el navegador integrado de la aplicación de escritorio (Chromium/Chrome 152) sobre el propio equipo; **no es otro dispositivo** (ver «Pendiente»).

> **Nota del 2026-11-17**: el contador de ngrok se leyó después (4,12 MB de 1 GB el 2026-11-16 y 5,18 MB el 2026-11-17) y el despliegue vigente es `6afb5599ce45e13699c428b8` (2026-11-16, con EMSC). Lo que sigue es el estado del 2026-11-11.

Etiquetas: **[MEDIDO]** observado en esta sesión; **[ESTIMADO]** aritmética sobre lo medido; **[HIPÓTESIS]** sin comprobar; **[NO PROBADO]** pendiente.

**Privacidad de la evidencia**: la clave real la escribió la persona estudiante en el navegador; no se ha leído, impreso ni guardado. De las peticiones solo se han usado método, ruta (sin parámetros), estado, instante y producto del navegador; ni cabeceras sensibles ni cuerpos. Antes de la clave real se probó un valor incorrecto de ejemplo, no una credencial.

> **Nota (T042, 2026-11-11)**: esta verificación corresponde al despliegue `6af4a52d…` (el visitante escribe la clave y el navegador llama al túnel). La variante con función de Netlify (sin clave para el visitante y **3 peticiones por ciclo, sin OPTIONS**, medidas en local) se **publicó el 2026-11-11** (despliegue `6af4b81f…`); su verificación en producción está en `verificacion-funcion-netlify.md` (T043).

## 1. Resultado resumido
**F7 funciona de extremo a extremo desde Netlify con la API real a través del túnel**: carga estática, autenticación, tres vistas, globo 3D, mapa 2D, filtro, EN VIVO, REPRODUCCIÓN, actualización automática, pausa simulada con pestaña oculta y recuperación automática tras cerrar y reabrir el túnel. **No se ha encontrado ningún fallo bloqueante.** Hay **una decisión importante** (cuota de ngrok con 60 s) y varias incidencias leves.

## 2. Comprobaciones superadas

| # | Comprobación | Resultado |
|---|---|---|
| 1 | Carga estática desde Netlify | `GET /` 200; 15 archivos servidos con el mismo SHA-256 que el build local (T035); MIME correctos; `config.json` publicado: URL del túnel, 60 000 ms, `pausarSiOculta` |
| 2 | Sin clave | Aparece «Acceso restringido a la API» con el formulario; la API contesta 401 sin datos; la página hace 1 `OPTIONS` + 1 `GET` y **no entra en bucle** |
| 3 | Clave incorrecta | «La clave no es correcta. Inténtalo de nuevo.», sin datos |
| 4 | Clave correcta (escrita por la persona estudiante) | «Acceso concedido: datos actualizados»; 205 eventos, coincidentes con los 205 de la API medidos antes |
| 5 | **Panel**: globo 3D (Three.js) | Se renderiza, gira, y «Evento siguiente» selecciona un terremoto con su detalle (M 5,2, profundidad, fecha UTC, país, ID) y leyenda |
| 6 | **Mapa 2D (Leaflet)** | Se muestra con teselas de OpenStreetMap, marcadores y atribución; coherente con el globo (203–206 eventos) |
| 7 | **Análisis** | Gráficas por hora y por país, distribución, **comparación con el histórico de 2025** (20 eventos frente a 50,1 esperados, −60 %) y estado del sistema («Datos al día», última ingesta hace 27 s, 0 huecos pendientes) |
| 8 | **Eventos** | Tabla paginada de 206 eventos con orden, densidad y «Ver en el mapa» |
| 9 | **Filtro** (magnitud mínima 4,5) | 14 eventos; coincide con el recuento «≥ M4.5» de 14 mostrado sin filtro; mapa, tarjetas y estadísticas coherentes |
| 10 | **REPRODUCCIÓN** | Ejecución `r-f6-estab-11082023`, ×31,9, terminada, **35 eventos** (dato de F6 reutilizado), etiquetada «datos históricos reproducidos, no actividad actual»; separada de EN VIVO. Al volver a EN VIVO regresan los 206 eventos |
| 11 | Actualización automática | Ciclos cada 60–62 s [MEDIDO, ver 4]; los datos se actualizaron solos (205 → 206 → 203 al moverse la ventana de 24 h) |
| 12 | Pausa con la pestaña oculta | **[Simulada con `visibilitychange`, no con una pestaña real en segundo plano]**: aparece «Actualización automática en pausa: la pestaña no está visible», **0 peticiones del panel durante 170 s**, y al volver a ser visible hay una consulta inmediata |
| 13 | **Túnel cerrado** | Tras «Actualizar ahora»: «Sin conexión con la API. Se conservan los últimos datos válidos y se reintenta automáticamente», estado «Sin conexión», datos conservados (203) marcados como posiblemente desactualizados, nunca como actuales |
| 14 | **Túnel reabierto** | **Recuperación automática en ≈ 7–11 s** tras volver a estar disponible, con «Conexión recuperada» y sin tocar el panel |
| 15 | Servidor y túnel | A través del túnel solo se sirve la API; `/`, `/index.html`, `/config.json`, `/docs`, `/redoc` y `/openapi.json` dan 404 (comprobación previa, T036-previo) |
| 16 | Sin exposición del frontend local | El túnel apuntaba solo a `127.0.0.1:8000`; el inspector mostró un único túnel hacia `:8000` |
| 17 | Clave en lo publicado | 0 coincidencias en los 15 archivos servidos (T035) |

## 3. Incidencias y observaciones por gravedad

**Alta / bloqueante**: ninguna.

**Media**
- **M1 · Cuota de ngrok con 60 s.** Cada ciclo hace **6 peticiones** (3 GET + 3 OPTIONS) y el preflight **no se reutiliza** (ver 4). Con 60 s y una pestaña visible serían ≈ 8 640 peticiones al día. **Requiere decisión** (sección 5).
- **M2 · Insignia «Powered by Netlify»** inyectada por Netlify (ver 5): visible en **todas** las capturas y en el vídeo. No se puede quitar desde el código sin tocar el despliegue; hay que decidir si es aceptable.

**Baja**
- **B1 · Errores 400 en la consola** al mostrar el mapa 2D: 8 teselas de OpenStreetMap de 24 fallan (los `Failed to load resource: 400`), previsiblemente las que quedan fuera del mundo en una ventana ancha; el mapa se ve correctamente. Cosmético; mismo código de Leaflet que en F5/F6. **[HIPÓTESIS sobre la causa]**: no se ha comprobado qué coordenadas piden.
- **B2 · Estado transitorio al cambiar a REPRODUCCIÓN**: durante unos 3–6 s se vio «REPRODUCCIÓN · sin ejecuciones», «ND» y «Sin lectura todavía» antes de aparecer los 35 eventos. Parece una pantalla de carga, pero podría confundir.
- **B3 · Dos `401` esperados** en la consola al cargar sin clave.

**Observaciones**
- **O1** Otro cliente (**Firefox**) con el mismo origen y sin clave hizo `OPTIONS` + `GET 401` cada varios minutos durante la sesión: parece otra pestaña abierta por la persona estudiante. No es una intrusión probada.
- **O2** La búsqueda de texto de la tabla de Eventos **no quedó comprobada** entonces: el valor introducido por automatización no filtró; se comprobó después a mano (`verificacion-funcion-netlify.md` §8 bis).
- **O3** El indicador «Actualización automática cada 1 min» no se localizó en el texto extraído; sí el aviso de pausa. Comprobar a mano.

## 4. Autenticación, conexión con FastAPI y peticiones reales

**Autenticación**: sin clave → 401 y formulario; clave incorrecta → mensaje y olvido; clave correcta → datos; la clave vive solo en memoria del navegador (hay que escribirla al recargar). Ninguna petición con la clave se registró ni se guardó.

**Conexión con FastAPI [MEDIDO]**: salud, eventos y estadísticas responden 200 por el túnel; el preflight responde 200 y `Access-Control-Max-Age: 600`; un origen ajeno recibe 400 (T036-previo).

**Peticiones al túnel (inspector de ngrok, solo método/ruta/estado; navegador integrado Chrome 152)**

| Situación | Peticiones |
|---|---|
| Carga sin clave | 1 OPTIONS + 1 GET (`/api/salud`, 401) |
| Primera carga con clave | 3 GET + 3 OPTIONS = **6** |
| **Ciclo automático en reposo** (7 ciclos consecutivos, cada 60–62 s) | **6 en cada uno** (42 en 7 ciclos): 3 GET + 3 OPTIONS (`salud`, `eventos`, `estadisticas`) |
| Aplicar un filtro | 6 |
| Cambiar a REPRODUCCIÓN / volver a EN VIVO | 6 cada cambio |
| Pestaña oculta (simulada) 170 s | 0 del panel |
| Recuperación tras reabrir el túnel | 6 |
| Cambiar de vista (Panel · Análisis · Eventos), 2D/3D, seleccionar evento | 0 (todo en el cliente) |

**Qué se concluye [MEDIDO]**: cada GET va precedido de un `OPTIONS`, **incluso `/api/salud`, cuya URL no cambia**, a pesar de `Access-Control-Max-Age: 600`. La hipótesis previa de que solo se repetirían dos preflights (URLs con parámetros variables) **queda descartada**: son **6 por ciclo**. **[HIPÓTESIS sobre la causa]**: el cliente usa `cache: 'no-store'` en `fetch`, y Chromium no reutiliza la caché de preflight con esa modalidad; no se ha comprobado y no se modifica nada por ello.

**Proyección [ESTIMADO, ver limitaciones]** para **una pestaña visible**, `U = 6`:

| Intervalo | Por día | En 4 días |
|---|---|---|
| 60 s | 8 640 | 34 560 (1,7× la cuota de 20 000) |
| 5 min | 1 728 | 6 912 (35 %) |
| 10 min | 864 | 3 456 (17 %) |

Si el contador de ngrok **no** cuenta los `OPTIONS` (no verificado), `U = 3`: 60 s serían 4 320 al día y 17 280 en 4 días (86 % de la cuota).
**Consumo de esta sesión [ESTIMADO]**: del orden de 100 peticiones en T036 (el inspector se reinicia al reabrir el túnel, así que no hay un total fiable) más ≈ 55 de la verificación anterior de la API. **El contador real está en el panel de ngrok y no se ha leído.**

**Limitaciones de la medición**: un solo navegador (Chrome 152 integrado); los ciclos medidos son 7 y la ventana fue breve (≈ 7,5 min más pruebas); el comportamiento puede variar en Firefox, Safari o móvil; el inspector cuenta lo que llega al túnel, no lo que contabiliza ngrok; no se ha confirmado si ngrok cuenta los `OPTIONS` ni el periodo de reinicio de la cuota; la prueba no refleja varias pestañas o personas.

## 5. Three.js, Leaflet y script de Netlify (HUD)

- **Three.js**: carga por `import()` los fragmentos `chunk-TDZIZU43.js` y `chunk-E323JB47.js` (200); globo con sus controles visibles (zoom, restablecer, pausar rotación, región, evento anterior/siguiente) y selección de evento (probada con «Evento siguiente»; el clic directo sobre el globo en rotación no se verificó). Sin errores en la consola propios de Three.js.
- **Leaflet**: renderiza con teselas de OpenStreetMap, marcadores y atribución (ver B1). **El caso sin WebGL no se ha probado** aquí [NO PROBADO].
- **HUD de Netlify**: Netlify inyecta en `index.html` un comentario y `<script async src="/.netlify/scripts/hud?variant=public">` (35 855 B, 200, JavaScript de Netlify). Muestra un **iframe fijo «Powered by Netlify»** de 197×64 px en la esquina inferior derecha con `z-index` máximo. **Errores atribuibles al script: ninguno** en la consola. **Interferencia**: a 1280×800 solo cubre el lienzo del mapa; a 375×812 no cubrió ningún control táctil en las tres posiciones de scroll comprobadas (no exhaustivo). El despliegue F6 (`6af0cbc3…`) **no** lleva esa inyección; apareció con el despliegue de F7 (hecho con la CLI 23.15.1; ver T035). **[HIPÓTESIS]** sobre la causa: no se ha determinado si depende de la versión de la CLI, de la cuenta o de una función del plan.

## 6. Qué debe comprobar la persona estudiante desde su móvil (datos móviles, no el Wi-Fi)
Con ngrok abierto y Docker sano, y **escribiendo ella la clave**:
1. Abrir `https://observatorio-sismico.netlify.app`: carga, formulario de clave, acceso y «Datos al día».
2. Panel: el globo 3D carga (puede ir lento), se puede girar con el dedo y tocar un evento; cambiar a «Mapa 2D».
3. Análisis y Eventos: scroll, gráficas legibles, tabla y «Ver en el mapa».
4. Filtro (p. ej. magnitud mínima) y «Restablecer».
5. EN VIVO ↔ REPRODUCCIÓN (35 eventos, etiquetado).
6. Poner la pestaña en segundo plano ≥ 2 min y volver: aviso de pausa y actualización al volver.
7. Girar el móvil (horizontal/vertical) y comprobar que la insignia «Powered by Netlify» no tapa controles.
8. Cerrar ngrok (con tu autorización) y comprobar «Sin conexión»; reabrir y ver la recuperación.
9. Apuntar el navegador, el sistema y cualquier fallo; **no** hacer capturas con la clave visible.

## 7. Comprobaciones planteadas para dar F7 por preparada (estado a 2026-11-17)
1. ~~Decidir el intervalo~~ **Cerrado: 60 s** (sección 8 ter). El contador de ngrok se leyó el 2026-11-16 y el 2026-11-17 (5,18 MB de 1 GB); no se comprobó si cuenta los `OPTIONS` (con la función de Netlify no los hay).
2. **Insignia «Powered by Netlify»**: se acepta (la inyecta Netlify).
3. Prueba desde un **móvil real con datos móviles**: hecha por el autor (2026-11-11 y 2026-11-17, sin captura); otro navegador distinto de Chrome: no realizada.
4. **Fallback 2D sin WebGL**: hecho, con evidencia archivada (`capturas/C-03b`, 2026-11-17).
5. **Pausa con una pestaña realmente oculta**: cubierta solo por la prueba en móvil real (sin evidencia archivada).
6. Búsqueda de la tabla, filtro por país, 7 días y periodo personalizado, y detalle de evento: comprobados a mano después (`verificacion-funcion-netlify.md` §8 bis).
7. **Capturas definitivas** (EN VIVO, 2D, globo, REPRODUCCIÓN): hechas el 2026-11-17 (`capturas/`); los marcadores de cierre están resueltos.
8. Continuidad y suspensión del PC: suspensión comprobada (2026-11-16) y 24 h continuas en local (2026-11-16/17); la ventana de evaluación no se ha medido; no se necesita credencial (función de Netlify).
9. Créditos y condiciones de Netlify y ngrok: el consumo de ngrok se leyó; los créditos de Netlify no se consultaron.
10. Secretos e historial de Git, y pruebas: hechos (pruebas repetidas el 2026-11-16 y el 2026-11-17).
11. Mantenimiento (T041): opcional; no bloquea.

## 8 ter. Decisión sobre el refresco público (2026-11-11)
**Decisión definitiva: se mantiene 60 s** (requisito explícito del enunciado §9; FAQ 21 «aproximadamente cada 60 segundos»; principio I de la constitución). La web ya publicada (`6af4a52d…`) lleva 60 s con pausa si la pestaña está oculta: **no se recompila ni se redespliega**. Lo **medido** es 6 peticiones por ciclo; las proyecciones (8 640 al día por pestaña visible) son **estimaciones**, y **no se conoce el consumo real de la cuenta** porque el contador de ngrok no se ha leído. Si la cuota se agotara, el panel muestra «Sin conexión» con los últimos datos válidos (comprobado en la prueba del túnel cerrado), situación que el enunciado dice evaluar. Plan B no activo: ver `estrategia-publicacion-f7.md`.

## 8 bis. Investigación posterior de los asuntos pendientes (2026-11-11, solo lectura)

**Qué se hizo**: lectura de documentación pública de ngrok y Netlify; **no** se abrió ngrok, no se inició sesión en Netlify, no se cambió ninguna configuración ni se hizo ningún despliegue.

### Cuota de ngrok
- **[DOCUMENTADO, ngrok.com/docs, consultado el 2026-11-11]** Plan gratuito: **20 000 peticiones HTTP/S al mes**, 1 GB/mes de salida, límite de **4 000 peticiones por minuto**, hasta 3 endpoints en línea; las cuotas «se reinician al comienzo de cada ciclo de facturación mensual». **«Los endpoints gratuitos no tienen límite de tiempo»**: queda resuelta la duda sobre la duración de la sesión del túnel. El dominio usado es el **dominio de desarrollo** único de la cuenta gratuita y no cambia al reiniciar.
- **¿Cuentan los `OPTIONS`? [NO CONFIRMADO]**: la documentación define la métrica como «HTTP/S requests to your account's endpoints per month» y **no menciona ninguna exclusión**, por lo que lo prudente es **suponer que sí cuentan**. Ninguna página consultada lo afirma ni lo niega. La confirmación solo puede hacerse comparando el contador del panel de ngrok (página **Usage**) antes y después de enviar un número conocido de `OPTIONS`.
- **Límites reales de nuestra cuenta [NO LEÍDOS]**: no se pueden consultar sin iniciar sesión en el panel de ngrok (o usar una clave de la API de ngrok, que no se ha usado ni solicitado). Lo documentado es el plan gratuito; el uso actual, la fecha de reinicio del ciclo y el tipo de plan hay que leerlos en la página Usage.
- **Evaluación con las mediciones [ESTIMADO, `U = 6`]** para **una pestaña visible durante 4 días**: 60 s → 34 560 (1,7× la cuota); **5 min → 6 912 (35 %)**; **10 min → 3 456 (17 %)**. Con tres pestañas visibles 24/7 a 5 min se superaría la cuota (20 736); a 10 min quedaría al 52 %. Esas pestañas en paralelo son un escenario extremo, no una previsión.
- **Qué pasa si se agota**: el túnel deja de responder hasta el siguiente ciclo y el panel muestra «Sin conexión» con los últimos datos: sería lo peor que podría ver el profesor.

### Insignia «Powered by Netlify»
- **[DOCUMENTADO, docs.netlify.com «Powered by Netlify badge», consultado el 2026-11-11]** Netlify la muestra en la esquina inferior derecha de los **proyectos públicos nuevos de planes gratuitos creados desde el 2026-08-19** (nuestro sitio se creó el 2026-11-08); se despliega de forma gradual, lo que explica que no estuviera en el despliegue F6. Se **inyecta en el borde de Netlify**, sin tocar el código, la compilación ni las dependencias; se renderiza en un iframe aislado y el script **no hace peticiones de red, ni analítica, ni cookies**. Es el mismo script que muestra la «barra previa al lanzamiento» en proyectos privados.
- **Manera oficial de ocultarla, sin redespliegue ni coste [DOCUMENTADA, no ejecutada]**: en la interfaz de Netlify, **Project configuration → General → Powered by Netlify badge → desactivar → guardar**. El ajuste es **por proyecto** (no afecta a los otros proyectos de la cuenta), **«surte efecto en la siguiente petición»** y es reversible. Los visitantes pueden ocultarla solo en su propio navegador (almacenamiento local, no permanente en Safari/iOS).
- **No se recomienda** bloquearla con CSS o con una política CSP: la documentación no describe esos caminos como soportados y tocarían la aplicación.
- **No se ha cambiado ningún ajuste.** La opción puede no estar visible aún en el panel por el despliegue gradual **[VERIFICAR]**.

### Prueba en móvil
La prueba en un móvil real se hizo después (2026-11-11 y 2026-11-17), sin captura.

### Estado de las incidencias de T036
| Incidencia | Estado |
|---|---|
| M1 · Cuota con 60 s (6 peticiones por ciclo) | **Demostrada** (6 por ciclo medidas); **decisión cerrada: 60 s**; el consumo de la cuenta se leyó después (5,18 MB de 1 GB el 2026-11-17) |
| M2 · Insignia de Netlify | **Causa documentada**; ocultarla requiere un ajuste manual en el panel de Netlify, **no realizado** |
| B1 · Teselas OSM 400 en 2D | Observada; causa sin comprobar; cosmética |
| B2 · Estado transitorio al cambiar a REPRODUCCIÓN | Observada; baja |
| O1 · Otro cliente (Firefox) sin clave | Observada; probablemente una pestaña de la persona estudiante |
| O2/O3 · Búsqueda de la tabla e indicador de intervalo | Comprobadas a mano después |
| Prueba en móvil real, fallback sin WebGL, pausa con pestaña realmente oculta, contador de ngrok y OPTIONS | Móvil real y fallback sin WebGL: hechos después; contador de ngrok: leído; pausa con pestaña oculta y `OPTIONS`: no verificados |

## 8. Estado al terminar
ngrok cerrado (solo el proceso abierto para esta prueba; el túnel público responde 404 de ngrok); Docker con los cinco servicios `healthy`; la web sigue publicada con F7; no se ha cambiado código, configuración, Netlify ni backend; sin commit ni push.
