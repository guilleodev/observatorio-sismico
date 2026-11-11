# Estado técnico del panel al cierre de F7

Documento mínimo y técnico. **No** es el README definitivo, la memoria ni el guion del vídeo (eso es F8). Describe cómo funciona hoy el panel en `frontend/` y qué se ha comprobado de verdad.

## 1. Estructura del panel: tres vistas

| Vista | Hash | Contenido |
|---|---|---|
| Panel | `#panel` | Escenario inmersivo: globo 3D (por defecto) o mapa Leaflet 2D, con HUD flotante (filtros a la izquierda; modo · evento seleccionado · leyenda a la derecha) y fila de KPI |
| Análisis | `#analisis` | Gráficas SVG propias (hora UTC, país, magnitud, profundidad), comparación con 2025, metodología y estado del sistema |
| Eventos | `#eventos` | Tabla con búsqueda, orden, paginación, densidad, fila completa seleccionable y vista previa 3D al pasar el ratón / enfocar el lugar |

- **Navegación por hash sin `@angular/router`** (`navegacion.ts`, `SincronizadorHash`): las tres vistas están siempre montadas y se ocultan con `[hidden]`, así que el estado (filtros, selección, globo) no se pierde al cambiar de vista.
- **Selección única**: el evento elegido en el globo, el mapa 2D o la tabla es el mismo (`seleccionar`); «Ver en el globo» y la vista previa vuelven al Panel.
- **Modos**: *En vivo (USGS)* y *REPRODUCCIÓN* (violeta, etiqueta visible, datos históricos aislados). En modo demostración (`config.json` con `mode: "demo"`) solo funciona el Panel con 4 eventos de ejemplo; Análisis y Eventos muestran un estado vacío explicando que necesitan el modo API (no se inventan datos).
- **Globo 3D** (`globo/`): Three.js 0.187 cargado de forma perezosa; sin WebGL (o si falla/tarda) se cae al mapa 2D con un aviso. La vista previa de Eventos (`globo/previa.ts`) es **una única instancia** de renderer para toda la tabla, un fotograma por apertura; sin WebGL o sin coordenadas válidas muestra solo texto.

## 2. Acceso local seguro

`npm run start:local` (ver README): el servidor de desarrollo de Angular reenvía `/api` a `http://127.0.0.1:8000` y añade la cabecera `X-Observatorio-Clave` **en el servidor** (`frontend/proxy.conf.mjs`). La clave no llega al navegador, a `config.json` ni a los bundles; la API sigue exigiéndola. `npm start` y `npm run build` (Netlify) no usan el proxy. No se debe exponer el puerto 4200 con ngrok.

## 3. Cambios de cierre (F7)

Correcciones pequeñas y localizadas; sin tocar API, contrato, backend ni lógica de negocio.

- Panel: la pila derecha del HUD cabe mejor con un evento seleccionado (filas del detalle en línea, leyenda en rejilla 2×2, altura máxima del HUD +16 px) y, si falta altura, la **leyenda queda fija abajo** y el detalle es lo que desplaza.
- Ficha de evento: la profundidad ya no muestra ruido de coma flotante (`5.23 km`, no `5.23000001907349 km`).
- Análisis: una sola barra (p. ej. REPRODUCCIÓN con una hora) ya no ocupa todo el ancho (máximo 96 unidades, centrada); las etiquetas largas de país se recortan con «…» (el nombre completo sigue en el tooltip y en la etiqueta accesible).
- Eventos: la vista previa sin WebGL / sin coordenadas no deja un hueco vacío de 128 px.
- Accesibilidad: al volver de «filtros rechazados» a «correcto» la región viva anuncia el cambio (antes conservaba el aviso obsoleto).

## 4. Pruebas

`cd frontend && node --test tests/*.test.ts` y `npm run build`. Las pruebas son de lógica pura y de lectura del código fuente (expresiones regulares), no de renderizado: sirven como red contra regresiones, **no** sustituyen a la revisión visual. Resultados del cierre: ver el informe de la sesión (476 pruebas) y `comprobaciones-manuales-f7.md` para lo confirmado por la persona estudiante.
