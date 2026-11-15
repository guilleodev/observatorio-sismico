// Ronda 2 del rediseño «Mission Control» (F7): PANEL INMERSIVO. Franja de telemetría (sin cajas por KPI), escenario con visor a todo el ancho y HUD flotantes (filtros a la izquierda; modo · evento · leyenda a la derecha),
// controles de Leaflet y del globo apartados de los HUD, apilado sin HUD en tablet y móvil. Los componentes no se ejecutan con `node --test`: se comprueba el FUENTE (como el resto de pruebas de plantillas) y la lógica pura de hud.ts.
// `node --test tests/*.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { colorProfundidad, razonContraste } from '../src/app/formato.ts';
import { RANGOS_LEYENDA } from '../src/app/globo/leyenda.ts';
import { ANCHO_HUD_ABIERTO, ANCHO_MIN_HUD, RESERVA_HUD_DER, RESERVA_HUD_IZQ, anchoLibreCentral, diametroEsfera, esferaDespejada, hayHudFlotante, hudPorDefecto } from '../src/app/hud.ts';

const src = (r: string) => readFileSync(new URL(`../src/${r}`, import.meta.url), 'utf8');
const app = (r: string) => src(`app/${r}`);
const html = () => app('app.component.html');
const css = () => app('app.component.css');
const global = () => src('styles.css');
const kpi = () => app('estado-datos/estado-datos.component.ts');
const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
/** Cuerpo del bloque `@media (min-width: 1100px) { … }` de la hoja de la app (hasta la primera llave de cierre en columna 0). */
const bloqueHud = () => /@media \(min-width: 1100px\) \{\n([\s\S]*?)\n\}/.exec(css())?.[1] ?? '';

// ---------- lógica pura (hud.ts) ----------
test('hudPorDefecto: abiertos desde 1440 px; por debajo (1100–1439 y móvil) colapsados; entradas raras no rompen', () => {
  assert.equal(ANCHO_HUD_ABIERTO, 1440); assert.equal(ANCHO_MIN_HUD, 1100);
  assert.deepEqual(hudPorDefecto(1440), { filtros: true, derecha: true });
  assert.deepEqual(hudPorDefecto(1920), { filtros: true, derecha: true });
  assert.deepEqual(hudPorDefecto(1439), { filtros: false, derecha: false });
  assert.deepEqual(hudPorDefecto(1280), { filtros: false, derecha: false });
  assert.deepEqual(hudPorDefecto(1100), { filtros: false, derecha: false });
  assert.deepEqual(hudPorDefecto(375), { filtros: false, derecha: false });       // móvil: la barra-resumen empieza plegada, como antes
  assert.deepEqual(hudPorDefecto(NaN), { filtros: false, derecha: false });
});

test('hayHudFlotante: solo desde 1100 px (tablet y móvil se apilan)', () => {
  assert.equal(hayHudFlotante(1099), false); assert.equal(hayHudFlotante(1100), true); assert.equal(hayHudFlotante(768), false); assert.equal(hayHudFlotante(NaN), false);
});

test('espacio libre central: cálculo documentado a 1280 / 1440 / 1600 y razón de los colapsos por defecto', () => {
  assert.equal(RESERVA_HUD_IZQ, 12 + 280); assert.equal(RESERVA_HUD_DER, 12 + 308);   // los mismos anchos que fija el CSS (se comprueba abajo)
  // ancho del escenario ≈ ancho de ventana − 32 px de relleno de <main>; alto del escenario con 900 px de ventana: clamp(560, 900 − 56 − 124, 980) = 720
  assert.equal(anchoLibreCentral(1248), 636);       // 1280 px
  assert.equal(anchoLibreCentral(1408), 796);       // 1440 px: 56,5 % del escenario (< 62 %), pero la esfera (≈ 562 px) cabe
  assert.equal(anchoLibreCentral(1568), 956);       // 1600 px: 61 %
  assert.equal(diametroEsfera(720), 562);
  for (const w of [1248, 1408, 1568]) assert.equal(esferaDespejada(w, 720), true, String(w));
  assert.equal(esferaDespejada(1568, 560), true);   // con el alto mínimo (560) la esfera mide ≈ 437 px
  // a 1100 px con ambos HUD abiertos NO cabe (escenario 1068 − 612 = 456 < esfera de 484 px con 800 px de ventana) → por eso arrancan colapsados
  assert.equal(esferaDespejada(1068, 620), false);
  assert.equal(esferaDespejada(1068, 620, false, false), true);
  assert.equal(anchoLibreCentral(300), 0);          // nunca negativo
});

test('las reservas de hud.ts coinciden con los anchos del CSS (HUD izquierdo 280 px y pila derecha 308 px, a 12 px del borde)', () => {
  const c = css();
  assert.match(c, /\.hud-izq \{ left: 12px; width: 280px; \}/); assert.match(c, /\.hud-der \{ right: 12px; width: 308px; \}/);
  assert.match(c, /\.escenario\.hud-izq-abierto \{ --hud-izq: 304px; \}/); assert.match(c, /\.escenario\.hud-der-abierto \{ --hud-der: 332px; \}/);   // 12 + 280 + 12 y 12 + 308 + 12
  assert.match(c, /--hud-izq: 276px; --hud-der: 284px;/);                                                                                            // colapsados: píldora ≤ 264 px y pila de 260 px
});

// ---------- franja de telemetría ----------
test('telemetría: 5 KPI sin cajas (sin fondo ni borde propios), separadores finos, cifras mono y etiquetas en versalitas', () => {
  const c = kpi();
  const regla = /^\s*\.kpi \{([^}]*)\}/m.exec(c)?.[1] ?? '';
  assert.ok(regla.length > 0);
  assert.doesNotMatch(regla, /border|background|box-shadow/);                                         // CAMBIO (ronda 2 Mission Control): antes cada KPI era una tarjeta con fondo y borde
  assert.match(c, /\.kpi \+ \.kpi \{ border-left: 1px solid var\(--linea\); padding-left: 14px; \}/);   // separador vertical fino, no borde de tarjeta
  assert.equal((c.match(/<span class="v grande num mono">/g) ?? []).length, 5);                      // las cifras (periodo, magnitud, ≥ M4.5, países, visualizados) en monoespaciada tabular; Países y Visualizados son excluyentes → 4 visibles
  assert.equal((c.match(/<span class="k etiqueta-ui">/g) ?? []).length, 5 + 1);                      // 5 KPI visibles; 6 en el código (Países con eventos y Visualizados son excluyentes)
  assert.match(c, /\.v\.grande \{ font-size: 1\.4rem;/);                                              // 1,35–1,6 rem
  assert.match(c, /\.datos \{[^}]*min-height: 60px/);                                                 // una fila fina (≈ 56–64 px)
  assert.match(c, /\.sub \{[^}]*white-space: nowrap[^}]*text-overflow: ellipsis/);                    // la nota larga se recorta SOLO visualmente…
  assert.match(c, /<span class="sub" \[attr\.title\]="notaAlcance\(\)">\{\{ notaAlcance\(\) \}\}<\/span>/);   // …y el texto completo sigue en el DOM y en title
  assert.match(c, /\{\{ estadoKpi\(\)\.icono \}\}[\s\S]*\{\{ estadoKpi\(\)\.texto \}\}/);            // Estado: icono + texto, con su tono (ok/aviso/error/replay) sin caja
  for (const t of ['ok', 'aviso', 'error', 'replay']) assert.match(c, new RegExp(`\\.kpi\\[data-tono='${t}'\\] \\.ico`));
  assert.match(c, /@container \(min-width: 900px\) \{ \.kpis \{ grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(c, /@container \(min-width: 640px\) \{ \.kpis \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \} \}/);   // móvil/tablet: 2–3 columnas compactas, sin desbordar
});

test('telemetría: UNA región viva, línea «Lectura» y h2 visualmente ocultos pero en el DOM, «Más detalles de la lectura» a la derecha y por encima del escenario, REPRODUCCIÓN visible en violeta', () => {
  const c = kpi();
  assert.equal((c.match(/aria-live="polite"/g) ?? []).length, 1);
  assert.match(c, /<div class="lectura" aria-live="polite">[\s\S]*<span>\{\{ estado\(\) \}\}<\/span>/);
  assert.match(c, /\.cab, \.lectura \{ position: absolute; width: 1px; height: 1px;[^}]*clip-path: inset\(50%\)/);
  assert.match(c, /<h2 id="datos-titulo">Información y estado de los datos<\/h2>/);
  assert.match(c, /<summary>Más detalles de la lectura<\/summary>/);
  assert.match(c, /\.detalles \{ grid-column: 2; grid-row: 1; \}|\.detalles \{ grid-column: 2/);     // a la derecha de la franja
  assert.match(c, /\.detalles \.det \{ position: absolute; right: 0; top: 100%; z-index: 30;/);
  assert.match(css(), /\.o-kpi \{ position: relative; z-index: 20; \}/);                             // el host crea el contexto de apilado por encima del escenario (z-index 0/auto)
  for (const t of ['Última lectura del frontend', 'Última ingesta USGS', 'Última lectura UTC']) assert.ok(c.includes(t), t);   // la diferencia frontend / USGS sigue en el desplegable
  assert.match(c, /<dt>Última lectura UTC<\/dt><dd class="mono">/);
  assert.match(c, /@if \(enReplay\(\)\) \{ <span class="replay-marca" aria-hidden="true">▶ REPRODUCCIÓN<\/span> \}/);
  assert.match(c, /\.replay-marca \{[^}]*var\(--replay-fondo\)[^}]*var\(--replay-texto\)[^}]*var\(--replay\)/);
  assert.match(c, /\.kpi\[data-tono='replay'\] \.ico, \.kpi\[data-tono='replay'\] \.k, \.kpi\[data-tono='replay'\] \.v\.grande \{ color: var\(--replay-texto\)/);
  assert.match(c, /enReplay\(\) \? 'replay' : 'neutro'/);
  // «cargados» frente al total de la API: las funciones puras y las notas no cambian
  assert.match(c, /notaCargadosPeriodo\(this\.eventos\(\)\.length\)/); assert.match(c, /\{\{ total\(\) \?\? 'ND' \}\}/);
  assert.match(html(), /<h2 id="panel-titulo" class="encabezado-vista" tabindex="-1">Panel<\/h2>/);   // destino del foco: sigue en el DOM
  assert.match(css(), /#vista-panel > \.encabezado-vista \{ position: absolute;[^}]*clip-path: inset\(50%\)/);
  // F8: solo con foco de TECLADO (:focus-visible) se ve (anillo visible, WCAG 2.4.7), y bajo la cabecera; con ratón o toque (foco programático tras un clic) se queda oculto y no tapa el contenido
  assert.match(css(), /#vista-panel > \.encabezado-vista:focus-visible \{[^}]*clip-path: none/);
  assert.doesNotMatch(css(), /#vista-panel > \.encabezado-vista:focus \{/);
  assert.match(css(), /#vista-panel > \.encabezado-vista \{ position: absolute; top: var\(--alto-cabecera\);/);
});

// ---------- escenario ----------
test('escenario ≥ 1100 px: relative, radio-stage, línea fina (sin borde grueso), viñeteado solo con el globo, altura con dvh y respaldo vh, visor al 100 %', () => {
  const b = bloqueHud(); assert.ok(b.length > 0);
  assert.match(b, /\.escenario \{ position: relative; isolation: isolate; display: block; height: var\(--alto-visor\);[^}]*border: 1px solid var\(--linea\); border-radius: var\(--radio-stage\);[^}]*overflow: hidden; \}/);
  assert.match(b, /main \{ --alto-visor: clamp\(560px, calc\(100vh - var\(--alto-cabecera\) - 124px\), 980px\);/);                         // respaldo vh
  assert.match(b, /@supports \(height: 100dvh\) \{ main \{ --alto-visor: clamp\(560px, calc\(100dvh - var\(--alto-cabecera\) - 124px\), 980px\); \} \}/);
  assert.match(b, /\.escenario:not\(\.visor-2d\)::after \{[^}]*box-shadow: inset 0 0 90px[^}]*pointer-events: none/);                       // viñeteado: solo con el globo; no tapa el puntero
  assert.match(b, /\.visor \{ position: absolute; inset: 0; \}/); assert.match(b, /\.mapa-envoltorio \{ height: 100%;/); assert.match(b, /\.map \{ height: 100%; \}/);
  assert.match(css(), /\.map \{ height: var\(--alto-visor\); \}/);                                                                          // tablet y móvil conservan su altura
  assert.match(css(), /main \{ --alto-visor: clamp\(480px, 62vh, 760px\);/);                                                                // tablet
  assert.match(css(), /--alto-visor: max\(380px, 65vh\)/); assert.match(css(), /--alto-visor: max\(380px, 65svh\)/);                        // móvil
  assert.match(css(), /main \{ --alto-visor: clamp\(480px, 62vh, 760px\); max-width: 1760px;|max-width: 1760px/);                           // hasta 1760 px de ancho
  assert.match(global(), /--radio-stage: 16px/);
  assert.match(css(), /\.mapa-envoltorio \{[^}]*border-radius: var\(--radio-stage\)/);                                                       // esquinas redondeadas también apilado
});

test('HUD: contenedores y escenario sin puntero (pointer-events: none); solo los paneles lo capturan; sin backdrop-filter; foco visible; colapsados no capturan la rueda', () => {
  const b = bloqueHud();
  assert.match(b, /\.hud-izq, \.hud-der \{[^}]*pointer-events: none;/);
  assert.match(b, /\.hud-panel, \.hud-pila \{[^}]*pointer-events: auto;/);
  assert.doesNotMatch(b, /\.escenario \{[^}]*pointer-events: auto/);
  assert.match(b, /\.hud-panel\.colapsado \{ width: fit-content; max-width: 264px; border-radius: 999px; \}/);                              // píldora: no ocupa más que ella
  assert.match(b, /\.pila-cuerpo\.plegado \{ display: none; \}/); assert.match(b, /\.filtros-cuerpo\.plegado \{ display: none; \}/);          // plegado = display none (no se destruye)
  assert.match(b, /overscroll-behavior: contain/);                                                                                          // el scroll interno de último recurso no arrastra la página
  assert.match(css(), /\.filtros-toggle:focus-visible, \.pila-toggle:focus-visible \{ outline: 3px solid var\(--foco\)/);
  assert.match(b, /\.hud-izq, \.hud-der \{[^}]*z-index: 1100/);                                                                             // por encima de Leaflet (≤ 1050 selector, 1001 etiqueta) y por debajo de la cabecera (1200)
  assert.match(css(), /\.cabecera \{ position: sticky; top: 0; z-index: 1200;/);
  for (const t of [css(), kpi(), app('globo/globo.component.ts'), global()]) assert.doesNotMatch(sinComentarios(t), /backdrop-filter/);
  const panel = global(); assert.match(panel, /--panel-vidrio: rgba\(22, 25, 30, \.92\)/);   // F8: grafito neutro (antes azul marino)                                                    // alfa ≥ .88
  assert.ok(Number(/--panel-vidrio: rgba\(\d+, \d+, \d+, ([\d.]+)\)/.exec(panel)?.[1]) >= 0.88);
});

test('HUD izquierdo: panel «Filtros» colapsable con aria-expanded/aria-controls, estado en memoria, formulario NO destruido y apertura automática con errores', () => {
  const h = html(); const ts = app('app.component.ts');
  assert.match(h, /<div id="filtros" class="hud-izq o-filtros" data-ancla tabindex="-1">/);
  assert.match(h, /<div class="hud-panel panel-ui" \[class\.replay\]="esReplay\(\)" \[class\.colapsado\]="!filtrosVisibles\(\)">/);
  assert.match(h, /\[attr\.aria-expanded\]="filtrosVisibles\(\)" aria-controls="filtros-cuerpo"/);
  assert.match(h, /id="filtros-cuerpo" class="filtros-cuerpo" \[class\.plegado\]="!filtrosVisibles\(\)"/);
  assert.doesNotMatch(h, /@if \(filtrosVisibles\(\)\)|@if \(filtrosAbiertos\(\)\)/);                                                          // jamás se destruye el formulario
  assert.match(h, /<span class="filtros-etiqueta etiqueta-ui">Filtros<\/span><span class="filtros-texto"[^>]*>\{\{ resumenFiltros\(\) \|\| 'sin consulta' \}\}<\/span>/);   // «Filtros · últimas 24 h»
  assert.match(css(), /\.filtros-etiqueta::after \{ content: ' · '; \}/);
  assert.match(ts, /private readonly hudInicial = hudPorDefecto\(window\.innerWidth\);/);
  assert.match(ts, /readonly filtrosAbiertos = signal\(this\.hudInicial\.filtros\);/);
  assert.match(ts, /readonly filtrosVisibles = computed\(\(\) => this\.filtrosAbiertos\(\) \|\| this\.filtrosInvalidos\(\)\);/);   // con errores de validación se abre solo
  assert.match(h, /\(invalido\)="filtrosInvalidos\.set\(\$event\)"/);
  assert.match(ts, /cambiarFiltros\(\): void \{ this\.filtrosAbiertos\.set\(true\); this\.irAVista\('panel', 'filtros'\); \}/);
  assert.match(app('filtros/filtros.component.ts'), /readonly invalido = output<boolean>\(\)/);                                              // API de app-filtros intacta
  assert.match(app('filtros/filtros.component.ts'), /<h2 id="filtros-titulo">Filtros<\/h2>/);
});

test('HUD derecho: UNA pila (cabecera con botón colapsar, modo siempre visible, cuerpo plegable con evento, leyenda y notas), selección abre la pila, estado en memoria', () => {
  const h = html(); const ts = app('app.component.ts');
  const pila = /<div class="hud-der">([\s\S]*?)\n      <\/div>\n    <\/div>\n  <\/section>/.exec(h)?.[1] ?? '';
  assert.ok(pila.length > 0);
  assert.equal((h.match(/<div class="hud-pila /g) ?? []).length, 1);                                                                        // una sola pila, no tres cajas
  assert.match(pila, /<span class="pila-titulo etiqueta-ui">Panel de evento<\/span>/);
  assert.match(pila, /\[attr\.aria-expanded\]="hudDerVisible\(\)" aria-controls="pila-cuerpo"/); assert.match(pila, /\[attr\.aria-label\]="hudDerVisible\(\) \? 'Ocultar el panel de evento y la leyenda' : 'Mostrar el panel de evento y la leyenda'"/);
  assert.match(pila, /id="pila-cuerpo" class="pila-cuerpo" \[class\.plegado\]="!hudDerVisible\(\)"/);
  assert.doesNotMatch(h, /@if \(hudDerVisible\(\)\)|@if \(hudDerAbierto\(\)\)/);                                                              // no se destruye (la región viva del detalle sigue montada)
  assert.ok(pila.indexOf('<app-selector-modo') < pila.indexOf('id="pila-cuerpo"'));                                                          // el modo queda fuera del cuerpo plegable: siempre accesible
  assert.ok(pila.indexOf('id="pila-cuerpo"') < pila.indexOf('<app-detalle-evento') && pila.indexOf('<app-detalle-evento') < pila.indexOf('class="leyenda panel-ui') && pila.indexOf('class="leyenda panel-ui') < pila.indexOf('class="notas-mapa'));
  assert.match(ts, /readonly hudDerAbierto = signal\(this\.hudInicial\.derecha\);/);
  assert.match(ts, /alternarHudDer\(\): void \{ this\.hudDerAbierto\.update\(\(a\) => !a\); \}/);
  assert.match(ts, /effect\(\(\) => \{ if \(this\.seleccionado\(\) !== null\) untracked\(\(\) => this\.hudDerAbierto\.set\(true\)\); \}\);/);   // elegir un evento abre la pila (sin tocar `elegir`)
  assert.match(ts, /elegir\(id: string \| null, origen: 'mapa' \| 'tabla'\): void \{/);                                                       // la selección compartida sigue igual
  assert.match(h, /\[class\.hud-izq-abierto\]="filtrosVisibles\(\)" \[class\.hud-der-abierto\]="hudDerVisible\(\)" \[class\.visor-2d\]="visor\(\) === '2d'" \[class\.es-replay\]="esReplay\(\)"/);
  for (const t of [h, ts, app('hud.ts')]) assert.doesNotMatch(t, /localStorage|sessionStorage|document\.cookie|indexedDB/);
});

test('leyenda en el HUD: mismos rangos, textos y hex; interactiva en 3D (aria-pressed, «Mostrar todos») y estática en 2D; Notas del mapa junto a ella', () => {
  const h = html(); const c = css();
  for (const [clase, hex] of [['punto-somera', colorProfundidad(0)], ['punto-media', colorProfundidad(100)], ['punto-profunda', colorProfundidad(300)], ['punto-nd', colorProfundidad(null)]])
    assert.match(c, new RegExp(`\\.${clase} \\{ background: ${hex}; \\}`, 'i'), clase);
  assert.deepEqual(RANGOS_LEYENDA.map((r) => r.texto), ['Menos de 70 km', '70–299,99 km', '300 km o más', 'No disponible']);
  for (const r of RANGOS_LEYENDA) assert.match(h, new RegExp(`<li><span class="punto ${r.clase}" aria-hidden="true"></span>${r.texto}</li>`), r.texto);   // rama estática (2D)
  assert.match(h, /@if \(visor\(\) === '3d'\) \{[\s\S]*?\[attr\.aria-pressed\]="rangoLeyenda\(\) === r\.id"[\s\S]*?Mostrar todos[\s\S]*?\} @else \{/);
  assert.match(h, /<details class="notas-mapa o-notas">\s*<summary>Notas del mapa<\/summary>/);
  assert.match(bloqueHud(), /\.hud-pila \.leyenda \{ background: none; border: 0;/);                                                         // sin caja propia dentro de la pila
  assert.equal((h.match(/aria-live="polite"/g) ?? []).length, 2);                                                                           // no se añaden regiones vivas (anuncio de modo/vista y de leyenda)
});

// ---------- selector de vista flotante y colisiones ----------
test('selector Mapa 2D | Globo 3D: UNO, segmentado, flotante arriba al centro dentro del visor, con aria-pressed, disabled y aviso role=status; REPRODUCCIÓN no lo solapa', () => {
  const h = html(); const c = css();
  assert.equal((h.match(/class="vista-selector"/g) ?? []).length, 1);
  assert.equal((h.match(/\[attr\.aria-pressed\]="visor\(\) === '(2d|3d)'"/g) ?? []).length, 2);
  assert.match(h, /\[disabled\]="globoNoDisponible\(\) !== null"/); assert.match(h, /<p class="vista-aviso" role="status">\{\{ avisoFallback\(motivo\) \}\}<\/p>/);
  const visor = /<div id="mapa" class="visor o-visor"[\s\S]*?<div class="mapa-envoltorio">/.exec(h)?.[0] ?? '';
  assert.ok(visor.includes('class="vista-selector"'));                                                                                      // hijo del visor: flota sobre él también en móvil
  assert.match(c, /\.vista-selector \{ position: absolute; top: 10px; left: 0; right: 0; z-index: 1050; width: fit-content;[^}]*margin-inline: auto;[^}]*border-radius: 999px;/);
  assert.match(c, /\.vista-aviso \{ position: absolute; top: calc\(100% \+ 6px\);/);
  assert.match(c, /\.etiqueta-mapa \{ position: absolute; top: 56px;/);                                                                      // fila B (el selector ocupa la fila A: y = 10–46 px)
  assert.match(bloqueHud(), /\.escenario\.visor-2d \.etiqueta-mapa \{ top: 108px; \}/);                                                      // con Leaflet baja a la fila C (bajo capas y «Estilo del mapa base»)
  assert.match(c, /@media \(max-width: 700px\) \{\s*\.etiqueta-mapa \{ position: static;[^}]*margin: 48px 0 0;/);                              // móvil: franja bajo los 48 px del selector
  assert.match(c, /\.vista-selector button\[aria-pressed="true"\] \{[^}]*font-weight: 700/);                                                // no solo color: negrita (y la marca ✓ de la plantilla)
  assert.match(h, /@if \(visor\(\) === '2d'\) \{ <span aria-hidden="true">✓ <\/span> \}Mapa 2D/);
});

test('Leaflet con HUD: variables --hud-izq/--hud-der y reglas globales que apartan zoom, capas, estilo del mapa y atribución; el código de Leaflet no cambia', () => {
  const g = global();
  assert.match(g, /\.leaflet-top\.leaflet-left, \.leaflet-bottom\.leaflet-left \{ margin-left: var\(--hud-izq, 0px\); \}/);
  assert.match(g, /\.leaflet-top\.leaflet-right, \.leaflet-bottom\.leaflet-right \{ margin-right: var\(--hud-der, 0px\); \}/);                   // el selector «Estilo del mapa base» (topright) y las capas comparten el contenedor
  assert.match(css(), /\.escenario:not\(:has\(> \.hud-izq\)\) \{ --hud-izq: 0px; \}/);                                                          // sin filtros (demostración) no se reserva nada
  const ts = app('app.component.ts');
  assert.match(ts, /async onMapReady\(map: L\.Map\): Promise<void> \{/); assert.match(ts, /new L\.Control\(\{ position: 'topright' \}\)/);       // controles de Leaflet: sin cambios
  const globo = app('globo/globo.component.ts');
  assert.match(globo, /\.pistas \{ position: absolute; top: 56px; left: calc\(var\(--hud-izq, 0px\) \+ var\(--esp-3\)\);/);                    // hints apartados del HUD izquierdo y bajo el selector
  assert.match(globo, /:host-context\(\.es-replay\) \.pistas \{ top: 100px; \}/);                                                              // con REPRODUCCIÓN, bajo la etiqueta
  assert.match(globo, /\.controles \{ position: absolute; left: var\(--esp-3\); right: var\(--esp-3\); bottom: var\(--esp-3\); margin-inline: auto; width: fit-content;/);   // controles abajo al centro, intactos
  assert.match(globo, /@media \(min-width: 1100px\) \{\s*:host-context\(\.escenario\) \{ height: 100%; \}/);                                    // el globo llena el escenario; no toca escena.ts
  assert.match(globo, /:host-context\(\.escenario\) \.pie \{ position: relative; z-index: 1105;/);
});

test('orden DOM = orden de foco: telemetría → filtros → selector de vista → visor → controles del globo → HUD derecho (modo, evento, leyenda); sin `order` en escritorio', () => {
  const h = html();
  const orden = ['<app-estado-datos', 'id="filtros"', 'class="vista-selector"', 'class="mapa-envoltorio"', 'class="map"', '<app-globo', '<div class="hud-der"', '<app-selector-modo', '<app-detalle-evento', 'class="leyenda panel-ui', 'class="notas-mapa'].map((s) => h.indexOf(s));
  assert.ok(orden.every((i) => i >= 0), String(orden));
  assert.deepEqual([...orden].sort((a, b) => a - b), orden);
  assert.doesNotMatch(bloqueHud(), /\border:/);                                                                                              // nada de `order` en escritorio
  assert.doesNotMatch(css(), /\.hud-(izq|der) \{[^}]*order/);
  assert.match(css(), /\.o-filtros \{ order: 3; \}/);                                                                                       // el apilado móvil conserva su orden (probado también en dashboard.test.ts)
  assert.match(css(), /\.escenario \{ display: contents; \}/);                                                                              // móvil: sus hijos se ordenan dentro de la sección
});

// ---------- tablet y móvil ----------
test('< 1100 px sin HUD flotante: barra-resumen de filtros en móvil, rejilla en tablet, sin scroll horizontal (minmax(0, 1fr)) y cajas con línea fina', () => {
  const c = css();
  assert.match(c, /\.hud-der, \.hud-pila, \.pila-cuerpo \{ display: contents; \}/);                                                         // la pila deja de existir como caja: sus hijos entran en la rejilla
  assert.match(c, /\.pila-cabecera, \.hud-ico \{ display: none; \}/);
  assert.match(c, /\.o-leyenda, \.o-notas \{ grid-column: 1 \/ -1; \}/);
  assert.match(c, /@media \(max-width: 767px\)[\s\S]*\.filtros-toggle \{ display: inline-flex; align-items: center; \}/);                       // el botón de plegar solo en móvil y escritorio
  assert.match(c, /\.hud-panel \{ background: none; border: 0; border-radius: 0; box-shadow: none; padding: 0; \}/);                         // móvil: ni caja doble ni borde grueso
  assert.match(c, /\.filtros-barra \{ padding: var\(--esp-2\) var\(--esp-3\); background: var\(--panel-vidrio\); border: 1px solid var\(--linea\);/);   // F8: contorno fino cian tenue
  assert.match(c, /\.vista-titulo \{ position: absolute;/);                                                                                  // móvil: «Vista:» queda como nombre accesible (cabe a 320 px)
  assert.doesNotMatch(sinComentarios(c), /border-top: 3px|border-top: 2px solid var\(--acento\)/);                                           // fuera franjas gruesas
  assert.doesNotMatch(sinComentarios(c), /\.col-(izq|der|centro)|\.principal/);
});

// ---------- movimiento y almacenamiento ----------
test('sin `transition: all`, transiciones nuevas solo bajo no-preference (ninguna en la hoja de la app ni en los componentes), sin @keyframes, sin almacenamiento ni recursos externos', () => {
  for (const t of [css(), kpi(), app('globo/globo.component.ts'), app('detalle-evento/detalle-evento.component.ts'), app('selector-modo/selector-modo.component.ts'), app('filtros/filtros.component.ts'), app('hud.ts'), html()]) {
    const s = sinComentarios(t);
    assert.doesNotMatch(s, /transition:\s*all|transition\s*:|@keyframes|animation\s*:/);
    assert.doesNotMatch(s, /localStorage|sessionStorage|document\.cookie|indexedDB/);
  }
  for (const t of [css(), html()]) assert.doesNotMatch(sinComentarios(t), /@import|url\(|https?:\/\//);
  const g = global(); const fuera = g.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, '');
  assert.doesNotMatch(fuera, /transition:\s*(?!none)|animation:/);
  assert.match(g, /@media \(prefers-reduced-motion: reduce\)/);
});

test('contraste AA de los textos de los HUD sobre el panel de vidrio (aprox. superficie-1) y de REPRODUCCIÓN', () => {
  const g = global(); const t = (n: string) => new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`).exec(g)?.[1] ?? '';
  const s1 = t('superficie-1'); assert.notEqual(s1, '');
  for (const n of ['texto', 'texto-2', 'acento-texto', 'replay-texto']) assert.ok(razonContraste(t(n), s1) >= 4.5, `${n} sobre el panel`);
  assert.ok(razonContraste(t('replay-texto'), t('replay-fondo')) >= 4.5);                                                                    // marca ▶ REPRODUCCIÓN de la telemetría
  assert.ok(razonContraste('#ffffff', t('replay-fuerte')) >= 4.5);                                                                           // etiqueta REPRODUCCIÓN del visor
  assert.ok(razonContraste(t('acento-texto'), t('acento-fondo')) >= 4.5);                                                                    // botón del selector de vista pulsado
});
