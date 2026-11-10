---
name: observatorio-design
description: Criterios de diseño, UX y accesibilidad del dashboard Angular del Observatorio Sísmico (invariantes del proyecto y lista de revisión de interfaz adaptada a Angular). Úsala al diseñar, modificar o revisar cualquier archivo de frontend/src (plantillas, estilos, componentes, mapa Leaflet, gráficas, tabla). No fija paleta ni layout.
argument-hint: "[archivo o descripción del cambio a revisar]"
user-invocable: true
disable-model-invocation: false
---

# Diseño y revisión de interfaz del Observatorio

Skill **propia, local y versionada** (sin scripts, hooks, descargas ni dependencias). Nace en F7 (candidata C-04) y es deliberadamente breve. **No decide todavía la paleta ni el diseño completo**: eso se concreta al trabajar cada mejora de F7.

Las reglas generales de la sección 2 están adaptadas de las *Web Interface Guidelines* de Vercel (licencia MIT), copia revisada el 2026-11-09 y recortada a lo útil para Angular; no se consulta ninguna fuente externa al usarla.

## 1. Invariantes del proyecto (no se negocian; un rediseño no los rompe)
1. **Funcionalidad intacta**: filtros, modos En vivo / REPRODUCCIÓN, refresco, estado de datos, comparación con 2025, tabla y gráficas siguen funcionando igual. Rediseñar es cambiar presentación, no comportamiento.
2. **Mapa Leaflet** (exigido por el profesor: Angular + Leaflet): se conserva el mapa plano con fondo, fronteras, círculos con **tamaño por magnitud** y **color por profundidad**, leyenda y tratamiento visible de nulos. Cualquier mapa 3D sería un modo **adicional**.
3. **Contraste de los marcadores**: la regla de F6 (WCAG 1.4.11, ≥ 3:1) exige borde oscuro de 1,5 px en los círculos; si cambia el mapa base o el tema, el contraste **se vuelve a medir**, no se hereda.
4. **Accesibilidad AA**: nada se transmite solo con color; la tabla es la alternativa al mapa; foco visible; objetivos táctiles ≥ 24 px; texto y controles con contraste suficiente en cualquier tema.
5. **`prefers-reduced-motion`**: toda animación o transición tiene variante reducida o se desactiva con esa preferencia.
6. **Sin almacenamiento del navegador**: prohibido `localStorage`, `sessionStorage`, cookies e IndexedDB en `frontend/src/app` (la clave de la API vive solo en memoria; lo comprueba `tests/acceso.test.ts`). Un conmutador de tema usa `prefers-color-scheme` o memoria, nunca almacenamiento.
7. **Sin secretos ni dependencias nuevas** en el bundle; `config.json` y `public/datos/` no se tocan.
8. **«REPRODUCCIÓN» siempre visible** en el modo replay (mapa, tabla, gráficas y estado) y nunca confundible con actividad actual.
9. **Español** en toda la interfaz; lógica pura con pruebas (`node --test`) cuando se añade o cambia.

## 2. Lista de revisión de interfaz (adaptada a Angular)
- **Accesibilidad**: botones de solo icono con `aria-label`; controles de formulario con `<label>` o `aria-label`; acciones en `<button>` y navegación en `<a>` (no `<div (click)>`); `alt` en imágenes (vacío si son decorativas) y `aria-hidden="true"` en iconos decorativos; actualizaciones asíncronas en una región `aria-live="polite"` sin saturar; HTML semántico antes que ARIA; jerarquía `h1`–`h6` y enlace de salto al contenido.
- **Foco**: foco siempre visible con `:focus-visible`; nunca `outline: none` sin sustituto; cabeceras o capas fijas no deben tapar el elemento enfocado.
- **Formularios**: `type` e `inputmode` correctos, `autocomplete`/`name` con sentido (`autocomplete="off"` en campos no de acceso), sin bloquear el pegado, `spellcheck="false"` en códigos, errores junto al campo y foco en el primero, etiqueta clicable.
- **Animación**: solo `transform` y `opacity`; nunca `transition: all` (listar propiedades); interrumpible; movimiento de más de 5 s con control de pausa; bucles decorativos se detienen con movimiento reducido.
- **Tipografía**: `…` y comillas tipográficas; espacios duros en cifras con unidad (`10 MB`); `font-variant-numeric: tabular-nums` en cifras comparables; `text-wrap: balance` en títulos.
- **Contenido y estados**: textos largos con truncado o salto de línea (`min-width: 0` en hijos flex); **estados vacío, carga y error** siempre diseñados; etiquetas de botón específicas; mensajes de error con la siguiente acción.
- **Rendimiento**: listas largas (> 50 filas) con paginación o `content-visibility: auto` (la tabla ya pagina); sin lecturas de layout (`getBoundingClientRect`, `offsetHeight`) en bucles; `@for` con `track`; carga diferida (`@defer`) para piezas pesadas.
- **Estado y navegación**: los controles de estado (filtros, modo) deben ser reproducibles y claros; confirmación en acciones destructivas.
- **Táctil**: `touch-action: manipulation`; `overscroll-behavior: contain` en paneles desplazables; alternativas de clic y teclado a cualquier gesto.
- **Tema oscuro**: `color-scheme: dark` en `html` (barras de desplazamiento y controles nativos), `<meta name="theme-color">` acorde al fondo, `background-color` y `color` explícitos en `<select>` nativos.
- **Idioma**: fechas y números con `Intl.DateTimeFormat` / `Intl.NumberFormat` en `es` (y UTC donde el dato es UTC); nombres propios y códigos con `translate="no"`.
- **Anti-patrones a señalar**: `user-scalable=no`, `<div>`/`<span>` con manejadores de clic, imágenes sin dimensiones, GIF animados, controles sin etiqueta, formatos de fecha o número fijos, gestos sin alternativa.

## 3. Cómo usarla
- **A mano**: `/observatorio-design <archivo o descripción>`.
- **Automática**: Claude puede cargarla al trabajar en `frontend/src` por su descripción.
- **En el agente**: el subagente `frontend-engineer` la precarga al arrancar.
- **Salida de una revisión**: agrupar por archivo, hallazgos breves en formato `archivo:línea — problema (regla o invariante)`, separando **violaciones de invariantes** (bloqueantes) de **mejoras de la lista** (recomendadas). No inventar hallazgos ni dar por cumplido lo que no se ha leído.
