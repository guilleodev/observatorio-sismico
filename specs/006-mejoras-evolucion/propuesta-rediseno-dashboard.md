# Propuesta de F7: rediseño visual del dashboard, mapa 2D y estudio del globo 3D

**Fecha**: 2026-11-09 · **Estado**: **MATERIAL DE REFERENCIA** (auditoría, visión e ideas), no un plan cerrado. Nada está aprobado ni implementado; no se ha tocado código, backend, pipeline, Netlify ni ngrok. **F7 es una fase abierta**: no hay secuencia `F7.1…F7.7`, ni número de pasos, ni paso de cierre; un `F7.n` se asigna solo cuando decides empezar un trabajo concreto, y ese trabajo puede agrupar varias de las candidatas de abajo (marco: [spec.md](spec.md)). Lo que sigue son objetivos e ideas de evolución, no tareas obligatorias.

**Foco acordado para F7 (2026-11-09)**: rediseño visual completo del dashboard con estilo **oscuro, moderno y tecnológico**, **manteniendo la funcionalidad actual**, mejorando jerarquía visual, claridad y experiencia de uso; estudio futuro de un segundo modo de mapa (**globo 3D**). Todo se desarrolla y prueba en `localhost:4200`; Netlify sigue con la versión de F6.

## 1. Auditoría del frontend actual (solo lectura, a partir de F6)

**Pila y tamaño**: Angular 20.3 (componentes standalone con *signals*), Leaflet 1.9.4 + ngx-leaflet, sin librería de gráficas ni de UI. ≈ 2 100 líneas de código en `src/app` (8 componentes y módulos de lógica pura: `modo`, `filtros`, `estado`, `graficas`, `tabla`, `comparacion`, `formato`, `actualizacion`) y ≈ 1 300 de pruebas (**130** pruebas con `node --test`). El bundle publicado es `main-V2B7K4H6.js`.

**Estructura de la pantalla** (`app.component.html`, una sola columna `main` de 1 200 px): cabecera → bloque de información/estado en texto (4–5 líneas) → selector de modo → aviso de clave → panel de estado → filtros → **mapa** → contador cruzado → comparación con 2025 → 4 gráficas SVG propias → tabla → leyenda.

**Hallazgos (lo que condiciona el rediseño)**
| # | Hallazgo | Consecuencia |
|---|---|---|
| A1 | **Sin sistema de diseño**: ≈ 100 colores hexadecimales dispersos en 9 archivos, `styles.css` casi vacío (1 línea), estilos en línea por componente, sin variables CSS, sin tema, sin `prefers-color-scheme` ni `prefers-reduced-motion`. | Un tema oscuro exige **primero** centralizar colores y espaciados en *tokens* CSS; si no, el cambio es frágil. |
| A2 | **Jerarquía débil**: el mapa (lo más valioso) aparece tras 5 bloques de texto; el «contador cruzado» (mapa/tabla/estadísticas/API) y frases técnicas ocupan sitio de primer nivel. | Reordenar: barra superior compacta + mapa protagonista; mover el detalle técnico a un desplegable «Detalles de los datos» (se conserva, es útil para la explicación). |
| A3 | **El mapa vive dentro de `AppComponent`** (412 líneas: estado, refresco, selección y mapa a la vez). | Para mejorar el mapa 2D y estudiar el 3D conviene extraer un componente de mapa; es refactor de riesgo medio, no hay que hacerlo en el primer paso. |
| A4 | **Mapa base claro** (teselas de OpenStreetMap) con círculos coloreados por profundidad; en F6 se midió el contraste (WCAG 1.4.11) **contra ese fondo claro** y se añadió un borde oscuro (`6.7-contraste-mapa.txt`). | Con un mapa oscuro hay que **volver a medir** el contraste de marcadores y fronteras; no se hereda. |
| A5 | **Información solo por color** mitigada en F6 (tabla alternativa, `aria-live`, objetivos ≥ 24 px, teclado); la leyenda usa emojis (🟡🟠🟣⚪) que no son exactamente los colores del mapa (#e8a317, #e35b37, #7b3fb6, #64748b). | La leyenda debe integrarse en el mapa con los mismos colores reales. |
| A6 | **Pruebas y reglas que el rediseño debe respetar**: `acceso.test.ts` **prohíbe** `localStorage`, `sessionStorage`, cookies e IndexedDB en todo `src/app` (la clave solo vive en memoria); `accesibilidad.test.ts` y `formato.test.ts` contienen 18 líneas con colores literales. | Un conmutador de tema **no puede persistirse** en esos almacenes: usar `prefers-color-scheme` (o solo memoria). Los tests de color se actualizan **a propósito**, con su justificación. |
| A7 | **Reglas oficiales** (ENUNCIADO §8 y §12): «Angular + Leaflet»; mapa con fondo, fronteras, círculos con tamaño por magnitud y color por profundidad, leyenda y tratamiento de nulos; tabla alternativa; filtros coherentes. Decisión de F5: se **extiende** el frontend entregado, sin sustituir su estructura (`config.json`, `paises.geojson` sin modificar, capas independientes). | El rediseño es de **presentación**: se conservan funciones y capas. El globo 3D solo puede ser un **modo adicional opcional**; Leaflet sigue siendo el mapa principal. |
| A8 | `scripts/f6/aislamiento_final.sh` comprueba que `frontend/public`, `package.json`, `angular.json` y `tsconfig*` no cambian. | Si una mejora aprobada añade dependencias (p. ej. el globo), se crea una **variante F7 del script** con la justificación; el de F6 no se edita (F6 es historial). |
| A9 | `ng serve` recarga la página en cambios de TypeScript y la clave está solo en memoria: **cada recarga completa vuelve a pedir la clave**. | Ralentiza mucho la iteración visual. Atenuantes: los cambios solo de CSS se aplican en caliente sin recargar; la candidata **C-01** (acceso local cómodo) tendría aquí valor real, pero es de riesgo alto (seguridad) y se decide aparte. |

## 2. Visión del rediseño global («centro de mando» oscuro)

- **Tema**: fondo azul-grafito muy oscuro, superficies en 2–3 niveles de elevación, texto de alto contraste, un acento principal (cian/turquesa, evolución del #176b70 actual), un color propio e inconfundible para **REPRODUCCIÓN** (violeta, ya existente) y colores de estado (correcto / aviso / error) que nunca dependen solo del color (icono + texto).
- **Estructura**: barra superior fija y compacta (nombre, selector **En vivo / REPRODUCCIÓN**, estado de los datos con indicador de actualización —cierra **C-02**—, «Actualizar ahora»); **tarjetas de resumen** (eventos del periodo, magnitud máxima, profundidad media, última ingesta) calculadas con datos ya cargados, sin nuevas peticiones; **filtros** en una barra o panel lateral plegable; **mapa a gran tamaño** con leyenda integrada; debajo, gráficas en rejilla y tabla; texto técnico en «Detalles de los datos».
- **Interacción**: selección sincronizada mapa ↔ tabla visible con claridad, estados de carga (esqueletos) y vacío/error coherentes, transiciones suaves **desactivadas con `prefers-reduced-motion`**.
- **Tipografía y espacio**: escala tipográfica y de espaciado única (tokens), cifras tabulares en tablas y KPIs.
- **Accesibilidad como requisito, no como extra**: contrastes AA recalculados en oscuro, foco visible, objetivos ≥ 24 px, orden de tabulación lógico, `aria-live` sin saturar; se repite el guion de F6 (`guion-accesibilidad.md`, `a11y_dom.js`) al cierre.
- **No cambia**: filtros, modos, API, refresco (60 s en local / 10 min publicado), clave en memoria, textos de aviso funcionales, contrato.

## 3. Candidatas (cajón de ideas; sin orden ni número de paso obligatorios)

Las candidatas **C-01…C-04** ya estaban en el backlog. Se añaden **C-05…C-11** (todas **sin aprobar**). Se pueden agrupar, reordenar, posponer o descartar libremente; el `F7.n` se asigna al empezar un trabajo concreto.

| Candidata | Contenido | Riesgo | Esfuerzo | Sugerencia (no vinculante) |
|---|---|---|---|---|
| **C-05 Fundación visual** | Capturas «antes» (también sirven de evidencia para F8) y **tokens de diseño** (CSS variables: color, tipografía, espacio, radio, elevación); paleta oscura con contrastes AA medidos; sin cambiar lógica ni estructura | **Bajo** | S–M | buen punto de partida |
| **C-02 Señal de actualización** (ya existente) | Indicador visible y accesible de «actualizando / actualizado a las hh:mm:ss / error» | Bajo | S | encaja con C-06 |
| **C-06 Layout y jerarquía** | Barra superior compacta, mapa protagonista, tarjetas de resumen, filtros plegables, texto técnico en «Detalles»; solo plantilla y CSS | **Bajo–medio** | M | tras o con C-05 |
| **C-07 Rediseño de componentes** | Selector de modo, filtros, estado, comparación, acceso, gráficas SVG y tabla con el nuevo sistema; actualización consciente de tests con colores literales | Medio | M–L | candidato a usar Frontend Engineer |
| **C-08 Mapa 2D mejorado** | Capa base oscura (opciones abajo), marcadores con halo y realce de lo reciente, leyenda integrada con los colores reales, popups y control de capas con el estilo nuevo; **re-medir contraste WCAG 1.4.11** | Medio | M | tras el tema |
| **C-09 Cierre de accesibilidad y responsive** | Guion de F6 repetido (teclado, zoom 200 %, anchos, lector de pantalla), `prefers-reduced-motion`, revisión humana | Bajo | S–M | al terminar cambios visuales |
| **C-10 Estudio del globo 3D** (*spike*) | Comparar librerías y viabilidad (abajo); prototipo **desechable** fuera del código del panel; informe y decisión *go / no-go* | Bajo (no integra nada) | M | independiente; cuando apetezca |
| **C-11 Globo 3D como segundo modo** | Solo si C-10 es *go*: modo opcional «Mapa plano / Globo 3D» con carga diferida | **Alto** | L | solo si C-10 sale bien |
| C-01, C-03, C-04, I-01…I-04 | Como en el backlog | — | — | cuando se decida |

**Qué sugeriría para empezar (riesgo bajo; no vinculante)**: C-05 y C-06 con C-02. Cambian presentación, no lógica; se verifican con `node --test` (sin regresiones) y comprobación visual, y entregan de inmediato un cambio visible. **Avanzado**: C-08 (mapa oscuro), C-10/C-11 (globo). C-07 es el grueso del trabajo.

**Opciones para la capa base oscura (decisión de C-08, no ahora)**
1. *Filtro CSS sobre las teselas de OpenStreetMap*: sin proveedor nuevo, pero se ven imperfecciones y hay que re-medir el contraste.
2. *Teselas oscuras de un proveedor gratuito* (p. ej. CARTO «Dark Matter»): mejor aspecto; **dependencia externa nueva** (términos de uso y atribución a revisar; hoy solo se usa OpenStreetMap).
3. *Mantener OSM claro con el resto oscuro y ofrecer ambas capas en el control de capas existente* (la opción de menor riesgo).
Recomendación: probar 1 y 3 en un prototipo local y elegir con datos; la 2 solo con tu aprobación explícita.

## 4. Estudio del globo 3D (C-10): qué se evaluaría
- **Compatibilidad con la regla oficial**: el panel exige Angular + Leaflet → el globo sería un **modo adicional** (carga diferida, `import()`), con el mapa plano por defecto. Hay que citar en el estudio el apartado que lo permite o pedir confirmación si hay duda.
- **Candidatas** (a medir, no a elegir hoy): un envoltorio de three.js tipo *globe.gl*; el modo globo de **MapLibre GL JS**; **CesiumJS** (más pesado); *deck.gl* con vista de globo.
- **Criterios**: tamaño añadido al bundle (se medirá; no se asume), licencia, rendimiento con hasta 5 000 puntos (`API_MAX_EVENTOS`), WebGL en móvil, **alternativa accesible** (la tabla ya existe; el globo no puede ser la única vía), textura/imagen de la Tierra (origen y licencia; evitar depender de un CDN externo en ejecución), mantenimiento y dependencias fijadas con bloqueo.
- **Entregable**: informe con una matriz de decisión, prototipo desechable y recomendación; **no se instala nada** hasta aprobar C-10 y revisar cada dependencia (procedencia, licencia, versión, tamaño).

## 5. ¿Crear o activar un subagente Frontend Engineer? (C-03)
**Sí tiene sentido, pero no al principio.** Cada invocación arranca en frío (relee contexto y consume tokens), así que compensa en trabajo **grande y separable**, no en microcambios.
- **Cuándo**: C-05 y C-06 son pocos archivos y de contexto compartido: los hace el agente principal. **C-07** (varios componentes independientes) y **C-08/C-10** (estudio técnico) son donde un especialista rinde.
- **Cómo lo usaríamos**: modo *implementador acotado* (`frontend/src/**` y `frontend/tests/**`), con la mini-especificación como encargo y entrega de un resumen del diff; el agente principal verifica (`git status`, `node --test`, build, comprobación visual) antes de dar nada por hecho. *Architect* y *QA Engineer* (ya existentes) siguen revisando al cerrar cada mejora importante.
- **Herramientas propuestas** (a decidir en C-03): lectura, búsqueda, edición y `Bash` limitado en la práctica a `node --test`, `npm run build` y servidor local; **sin** acceso a la red ni a Docker por instrucción. Aviso honesto: el entorno no restringe por ruta, así que el límite se impone por instrucciones y se **comprueba** con `git status` en cada entrega.
- **Modelo**: intermedio (no el más caro) y con tope de turnos; no se invoca por rutina.
- **Qué hay que definir en su mini-especificación**: límites (no toca FastAPI, Kafka, PostgreSQL, Compose, documentos del profesor ni secretos), criterios de calidad (tokens, AA, tests) y cómo se mide su aportación.

## 6. ¿Skills o MCP para ayudar al rediseño? (C-04, sin instalar nada)
- **Skills**: valor **moderado**. Una skill de diseño o de buenas prácticas de Angular aporta listas de comprobación y criterios, pero (a) su contenido se carga en el contexto (coste), (b) puede ser genérica y empujar a un estilo que no encaja y (c) es **código e instrucciones de terceros**: riesgo de cadena de suministro. Nuestras necesidades están muy acotadas (tokens oscuros, AA, rejilla), por lo que **crear una skill propia y corta del proyecto** (reglas de diseño y accesibilidad de este dashboard) suele ser más seguro y útil que instalar una externa. Si se explora `npx skills find`: solo **leer** resultados, revisar procedencia, mantenimiento y el contenido completo (incluidos scripts) **antes** de instalar; instalar de una en una, a nivel de proyecto y con versión conocida; descartar cualquiera que ejecute comandos o pida acceso a red/secretos sin justificación.
- **MCP**: hoy **no hace falta**. El navegador integrado ya permite abrir el panel, redimensionar, leer la página y hacer capturas (suficiente para comprobar lo visual), y F6 dejó herramientas propias de accesibilidad (`a11y_dom.js`). Un MCP de pruebas de navegador (tipo Playwright) o de accesibilidad solo se reconsideraría si las regresiones visuales se volvieran un problema repetido; Figma no aplica (no hay diseños en Figma).
- **Dependencias de UI** (Tailwind, Angular Material…): **no recomendadas** ahora; mantener CSS propio con tokens evita un cambio grande de pila y mantiene la compatibilidad con el frontend entregado.
- **Decisión**: **no instalar nada**; si quieres explorar, se aprueba C-04 como exploración de solo lectura.

## 7. Cómo podría agruparse (ejemplos, no un plan)
- **Un F7.n «tema oscuro y estructura»** podría agrupar C-05, C-06 y C-02 y, según cómo vaya, parte de C-07: se experimenta en `localhost:4200` y se ve el resultado.
- **Otro F7.n «mapa»** podría agrupar C-08 y C-09, o dividirse si conviene.
- **Un F7.n «estudio del globo»** (C-10) puede hacerse en cualquier momento, independiente del resto; C-11 solo si el estudio sale bien.
- Cada `F7.n` verifica de forma proporcional (`node --test`, build, comprobación visual en el navegador, contraste/teclado si procede) y se commitea a mano. Las capturas «antes/después» sirven de evidencia para F8.

## 8. Riesgos y mitigaciones
- **Regresión funcional** en un rediseño «completo» → cambios por capas (tokens → layout → componentes → mapa), `node --test` en cada paso, nada de lógica de datos salvo necesidad justificada.
- **Pérdida de accesibilidad ganada en F6** → AA y guion de F6 como criterio de cierre, no como extra.
- **Deriva respecto al frontend entregado / rúbrica** → se conservan funciones, capas, tabla, leyenda y `config.json`; el rediseño es de presentación.
- **Alcance sin fin** → pasos cerrados con criterios; el globo 3D solo tras el estudio; F7 se acota por la fecha de entrega (CA-02 de F8, pendiente).
- **Divergencia local/publicado** → durante F7 Netlify sigue en la versión de F6; F8 decide qué se publica y cuándo, con autorización expresa.
- **Consumo** → pasos pequeños, un agente especialista solo donde compensa, sin repetir baterías completas.

## 9. Decisiones abiertas (cuando quieras, sin orden)
1. Qué trabajo `F7.n` empezar primero y qué agrupa.
2. Si se crea el subagente **Frontend Engineer** (C-03) y cuándo: ver la propuesta de configuración en la conversación; al aprobarse se documentará aquí.
3. Capa base del mapa oscuro: solo opciones sin proveedor nuevo, o también uno externo.
4. Si se explora el catálogo de skills (C-04, solo lectura).
