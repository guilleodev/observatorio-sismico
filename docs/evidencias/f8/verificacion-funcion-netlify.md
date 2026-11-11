# T043 · Publicación y verificación de la función de Netlify (F8 · FR-028)

**Fecha**: 2026-11-11 (tarde-noche). **Sitio**: `https://observatorio-sismico.netlify.app`. **Despliegue vigente**: `6af4b81fa1d0a00d0cb33c59` («F7 con funcion (config literal)»), hecho con la CLI de Netlify (`--no-build --functions`), sin conectar GitHub ni compilar en Netlify. **Navegador**: el integrado de la aplicación de escritorio (Chrome 152) en el propio equipo; **no es otro dispositivo**. ngrok abierto solo para la prueba y cerrado al terminar; sesión de la CLI cerrada.

Etiquetas: **[MEDIDO]** observado en esta sesión; **[ESTIMADO]** aritmética sobre lo medido; **[NO PROBADO]**; **[VERIFICAR]**.

**Privacidad**: no se ha leído, impreso ni guardado ningún valor secreto. De las variables de Netlify solo se consultaron metadatos (nombre, ámbito, si es secreta). La clave local se comparó **en memoria** con lo servido para buscar coincidencias; solo se imprimieron recuentos.

## 1. Resultado resumido
**La web pública funciona sin que el visitante introduzca ninguna clave**: Panel, Análisis, Eventos, globo 3D, mapa 2D, EN VIVO y REPRODUCCIÓN con datos reales a través de la función y el túnel; el refresco es de 60 s. FastAPI sigue exigiendo la clave (401 sin ella y con una falsa). **No se ha encontrado la clave en ningún archivo, respuesta ni cabecera.** Hubo **una incidencia importante resuelta durante la publicación** (sección 4) y limitaciones documentadas del límite por IP (sección 6).

## 2. Variables privadas (solo metadatos)
| Aspecto | Resultado |
|---|---|
| Sitio | `observatorio-sismico`, sin repositorio conectado, despliegue anterior `6af4a52d…` |
| `API_UPSTREAM_URL` | Existe; su valor tiene el formato esperado (`https://…`, sin ruta); ámbitos que incluyen Functions y runtime |
| `API_CLAVE_ACCESO` | Existe y **está marcada como secreta** (`is_secret: true`) tras corregirlo la persona estudiante; ámbitos *builds*, *functions* y *runtime* |
| Primera comprobación | Estaba **sin marcar** (`is_secret: false`) → **se detuvo la publicación** hasta que se marcó (2026-11-11) |
| Función en producción | Recibe ambas variables: con ngrok abierto responde 200 con la clave correcta; sin variables válidas habría respondido 503 (no ocurrió) |
| **Reserva** | La API de Netlify seguía devolviendo un valor no vacío para algunos contextos de la clave. La documentación dice que los valores secretos son «solo escritura»; puede tratarse de una máscara, pero **no se ha comprobado** (comparar ese valor con la clave real se descartó por materializar la credencial). **La persona estudiante debe comprobar en la interfaz de Netlify que el valor aparece oculto**, y valorar poner un valor ficticio en los contextos *dev*/*branch*/*preview*, que no se usan |

## 3. Comprobaciones superadas en producción
| # | Comprobación | Resultado |
|---|---|---|
| 1 | Despliegue | `ready`; función `api` incluida; respaldos conservados: F7 con clave `6af4a52d…` y F6 `6af0cbc3…` (más copias locales); el sitio no tiene GitHub |
| 2 | Archivos estáticos | 15 archivos idénticos (SHA-256) al build local; `config.json`: mismo origen, `refreshMs 60000`, `pausarSiOculta`, **sin URL de túnel ni clave** |
| 3 | Enrutado de `/api/*` | `/api/salud`, `/api/eventos`, `/api/estadisticas` van a la función (JSON); `/api/otro` y `/.netlify/functions/api` los atiende el sitio estático (HTML); `/api/eventos/` → 404 JSON de la función; `POST` → 400 de Netlify y `OPTIONS` → 404 (no llegan a la función) |
| 4 | Respuestas de la API | 200 en salud, eventos live, estadísticas, eventos replay y salud replay, **sin clave del visitante**; `mode` inválido → 422 reenviado; parámetro desconocido → 400 sin llegar a la API |
| 5 | Cabeceras | `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`; **sin `Access-Control-Allow-Origin`** (tampoco con `Origin` ajeno); la clave del visitante se ignora |
| 6 | **Ausencia de la clave** | **0 coincidencias** en los 15 archivos públicos y en todas las respuestas y cabeceras de la función; la página no tiene cookies, `localStorage` ni `sessionStorage`; el panel solo llama a su **mismo origen** (`/api/salud`, `/api/eventos`, `/api/estadisticas`) |
| 7 | **Panel sin formulario de clave** | «Correcto», 201 eventos, globo 3D (3 lienzos), tarjetas y estado «API accesible · Datos al día» |
| 8 | Vistas | **Análisis** (45 gráficas, comparación con el histórico de 2025), **Eventos** (tabla), **Panel**; **mapa 2D** (Leaflet con teselas de OSM) y **globo 3D** |
| 9 | **REPRODUCCIÓN** | Ejecución `r-f6-estab-11082023`, ×31,9, terminada, **35 eventos**, sin formulario |
| 10 | **Refresco de 60 s** | 4 ciclos automáticos consecutivos cada **62–63 s** [MEDIDO] |
| 11 | **Túnel cerrado** | Pulsar «Actualizar ahora»: «Sin conexión con la API» (Error HTTP 502), datos conservados (201) marcados como desactualizados, **sin pedir clave** |
| 12 | **Túnel reabierto** | Recuperación automática en ≈ 20 s (reintento mínimo de 30 s tras el fallo), «Conexión recuperada» |
| 13 | **FastAPI** | A través del túnel: sin clave → **401**; con clave falsa → **401** (la autenticación no se ha tocado) |
| 14 | Docker | Cinco servicios `healthy` antes y después; nada reiniciado |

## 4. Incidencia importante encontrada y resuelta
**La primera publicación (`6af4b7d3…`, ≈ 3–4 min en producción) no enrutaba `/api/*` a la función**: devolvía el `index.html` del sitio. Causa: `export const config = { path: Object.keys(RUTAS) … }`; la CLI de Netlify lee `config` por **análisis estático** y no pudo evaluar la expresión, así que ignoró `path` (la función quedó solo en su URL por defecto). **Corrección**: `config.path` pasa a ser un **literal** (`['/api/eventos', '/api/estadisticas', '/api/salud']`) y una prueba nueva comprueba que `config` es estático y coherente con las rutas permitidas (**18 pruebas** de la función; **494** en el frontend). Segundo despliegue `6af4b81f…`: enrutado correcto. **Efecto**: durante esos minutos los visitantes habrían visto un error de formato en el panel (sin datos); no se detectó ningún acceso. Lección: no se puede dar por válida una función de Netlify sin probar su enrutado en producción (la prueba local no lo detecta).

## 5. Peticiones y consumo observado
- **ngrok [MEDIDO]**: cada ciclo del panel hace **3 GET y 0 OPTIONS** (UA `observatorio-netlify-function`), frente a **6 (3 GET + 3 OPTIONS)** con la llamada directa desde el navegador (T036). Las 70 peticiones del inspector de la segunda sesión incluyen ≈ 63 de la prueba de ráfaga; **un cliente Firefox** (otra pestaña con la versión anterior) siguió llamando al túnel directamente (1 `OPTIONS`, 1 `GET` con 401).
- **Invocaciones de la función [ESTIMADO]**: ≈ 250–300 en esta verificación (cada ciclo = 3). Con 60 s y **una pestaña visible**: **4 320 al día** (17 280 en 4 días) frente a las **125 000/mes** incluidas en la cuenta (leído de su API el 2026-11-11); **[VERIFICAR]** qué ocurre al superarlas.
- **Cuota de ngrok [ESTIMADO]**: ≈ 4 320 peticiones al día por pestaña visible (la mitad que antes); la cuota de 20 000 al mes se agotaría con **una** pestaña visible ininterrumpida en ≈ 4,6 días. **No se conoce el consumo real de la cuenta de ngrok (contador sin leer)**.
- Consumo de esta sesión de pruebas: del orden de 150–250 peticiones a ngrok [ESTIMADO].

## 6. Protección contra abuso y limitaciones reales
- **Qué hace la función**: solo tres rutas, solo `GET`, parámetros validados (los inválidos no llegan a ngrok), destino fijo, sin CORS, tiempo de espera de 8 s, código genérico de error.
- **Límite por visitante [MEDIDO]**: `rateLimit` de 60 peticiones por minuto, agregado por **IP y dominio**. Una ráfaga de 100 GET en 21,5 s desde esta IP: **63 respondieron 200 y 37 devolvieron 429** (cuerpo vacío, **sin cabecera `Retry-After`**); 70 s después volvió a responder 200.
- **Lo que NO garantiza**: no es un tope global. En planes gratuitos Netlify cuenta **por IP**, así que un atacante con muchas IP, o varias personas tras direcciones distintas, **no queda limitado en conjunto**; no limita la cuota total de ngrok (20 000/mes) ni las invocaciones (125 000/mes). Una IP compartida (red de la universidad) comparte el límite. El 429 no distingue a un visitante legítimo de un abusador. No hay base de datos de contadores ni servicios externos (se rechazó esa arquitectura).
- **Medidas operativas si hubiera abuso**: cerrar ngrok; quitar o cambiar `API_UPSTREAM_URL` y redesplegar; volver a publicar `6af4a52d…` (con formulario de clave) o F6; publicar la pantalla de mantenimiento (T041); rotar la clave.
- **Compromiso asumido**: los datos de lectura son públicos a través de la función; la clave solo protege el acceso directo a ngrok.

## 7. Incidencias menores y observaciones
- **Insignia «Powered by Netlify»** sigue inyectada (ver `verificacion-publicacion-f7.md`).
- **8 errores 400 de teselas de OSM** en el mapa 2D (cosmético, ya conocido).
- El aviso de error dice «Revisa API, túnel y CORS» aunque ya no hay CORS entre navegador y túnel (texto genérico del panel).
- **Pestañas antiguas**: una pestaña abierta con el despliegue anterior seguirá llamando al túnel directamente y pidiendo clave hasta que se recargue.
- Los **registros de la función** en Netlify no se han revisado (la función no escribe valores; solo «el origen rechazó la clave» ante un 401/403): **[VERIFICAR]** en Netlify → Logs → Functions.
- El `OPTIONS` y el `POST` a `/api/*` no llegan a la función (Netlify responde 404/400): sin consecuencias.

## 8 bis. Sesión de validación final (2026-11-11, noche)
ngrok abierto solo para esta sesión (cerrado al terminar; sesión de la CLI de Netlify no abierta). Despliegue vigente sin cambios (`6af4b81f…`).

| Comprobación | Resultado |
|---|---|
| Producción sin clave, repetida (`prod_check.js`: archivos, rutas, errores, cabeceras, ausencia de la clave) | **OK**; la clave: 0 coincidencias; FastAPI sin clave → 401 |
| **Búsqueda de la tabla** (escrita con teclado real) | «Alaska» → **59 de 201** eventos; las 25 filas de la primera página contienen «Alaska» |
| **Filtros** (periodo y país) | 7 días → 1 290 eventos; 7 días + Estados Unidos → 1 002; Estados Unidos 24 h → 162; «Restablecer» → 202 (coherentes entre sí) |
| **Errores 400 de teselas de OSM en el mapa 2D** | **Causa confirmada [MEDIDO]**: las 8 teselas rotas de 24 están todas **fuera del mundo** (a zoom 2, x = −1 o x = 4); el mapa se ve bien; cosmético |
| **Sin WebGL** (copia temporal local del build con WebGL desactivado y la misma función; no es un dispositivo real) | «Globo 3D no disponible: Tu navegador o dispositivo no ofrece WebGL. Se muestra el mapa 2D.», botón «Globo 3D» deshabilitado, mapa 2D de Leaflet con teselas y 201 eventos, sin formulario de clave. **No se archivó captura** (el navegador integrado agotó el tiempo al capturar) |
| **Pestaña realmente oculta** | **No reproducible en el navegador integrado**: las pestañas en segundo plano siguen reportando `visibilityState: visible`. Solo constaba la simulación con `visibilitychange` de T036; el punto 7 de la prueba del Pixel (cambiar de app o bloquear la pantalla) lo cubre |
| **Prueba en el Google Pixel con datos móviles** | **«Todo correcto» según la persona estudiante** (8 puntos: carga sin clave, globo 3D, mapa 2D, Análisis, Eventos con búsqueda, filtros, REPRODUCCIÓN y volver a EN VIVO, segundo plano con aviso de pausa y actualización, rotación). **Es una confirmación verbal: no hay capturas ni detalle archivados** (modelo de móvil, versión de Chrome y datos concretos no registrados) |
| Lo que llegó a ngrok en la sesión [MEDIDO, inspector] | **76 peticiones, todas `GET`, 0 `OPTIONS`**, todas del cliente `observatorio-netlify-function` (ni el navegador ni el móvil llamaron directamente al túnel) |
| Registros de la función y contadores | **No revisados**: la persona estudiante los **dejó pendientes** (no se usó la CLI para no enlazar el proyecto) |

## 8. Pendiente
1. Comprobar en la interfaz de Netlify que `API_CLAVE_ACCESO` aparece **oculta** (y decidir los contextos *dev/branch/preview*).
2. ~~Prueba desde otro dispositivo~~ **Hecha**: Pixel con datos móviles, «todo correcto» según la persona estudiante (sección 8 bis); **no** se probó el cierre del túnel desde el móvil ni otro navegador distinto de Chrome.
3. **Persona estudiante**: revisar los registros de la función en Netlify (¿algo sensible?), el número de invocaciones y, en el panel de ngrok (*Usage*), el consumo real, la fecha de reinicio y el plan; **siguen pendientes**.
4. ~~Fallback sin WebGL y búsqueda de la tabla~~ **Comprobados** (sección 8 bis). La pausa con una pestaña realmente oculta solo se cubre con el Pixel.
5. Capturas definitivas (C-01…), actualización de README y memoria con el estado final, insignia de Netlify.
6. Si se **rota la clave** de FastAPI: actualizar también la variable de Netlify y redesplegar **[VERIFICAR]** si hace falta.

## 9. Vuelta atrás disponible
`6af4a52d30a824e6ef9dead2` (F7 con formulario de clave; carpeta `frontend/dist/publico-netlify-f7/`) y `6af0cbc3bee7002e941af403` (F6; `data/respaldo/f6-publico-netlify-2026-11-08/`). Se restauran desde Netlify → Deploys → «Publish deploy» o con la CLI; no hace falta tocar credenciales.
