// Rediseño del mapa (F7): estilo oscuro/claro sobre la MISMA capa OpenStreetMap, selector accesible, ventanas emergentes estructuradas y leyenda bajo el mapa.
// Los componentes no se ejecutan con `node --test`: se lee el código fuente con expresiones regulares y se prueban las funciones puras de formato.ts.
// `node --test tests/*.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BORDE_FRONTERA, BORDE_MAPA, BORDE_MAPA_OSCURO, ESTILO_MAPA_INICIAL, FONDO_MAPA, SELECCION_MAPA,
  bordeMapa, colorProfundidad, estiloCirculo, filasFicha, radioMagnitud, razonContraste, textoFicha,
} from '../src/app/formato.ts';

const app = (ruta: string) => readFileSync(new URL(`../src/app/${ruta}`, import.meta.url), 'utf8');
const global = () => readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const ts = () => app('app.component.ts');
const html = () => app('app.component.html');
const css = () => app('app.component.css');

// --- capa base: una sola, OpenStreetMap, sin proveedores nuevos ---
test('una sola tileLayer, con la URL y la atribución de OpenStreetMap, y ningún proveedor nuevo (el oscuro es un filtro CSS)', () => {
  const codigo = ts();
  assert.equal((codigo.match(/L\.tileLayer\(/g) ?? []).length, 1);
  assert.match(codigo, /L\.tileLayer\('https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png'/);
  assert.match(codigo, /attribution: '&copy; <a href="https:\/\/www\.openstreetmap\.org\/copyright">OpenStreetMap<\/a> contributors'/);
  assert.match(codigo, /className: 'teselas-mapa'/);
  assert.doesNotMatch(codigo + global(), /cartocdn|carto\.com|stadiamaps|mapbox|maptiler|thunderforest|arcgisonline/i);
  // el control de capas sigue igual: una base y dos superpuestas
  assert.match(codigo, /L\.control\.layers\(\{ 'OpenStreetMap': base \}, \{ 'Países \(Natural Earth\)': borders, 'Terremotos': this\.events \}\)/);
  // el filtro solo se aplica a las teselas y solo en oscuro
  const g = global();
  assert.match(g, /\.leaflet-container\.mapa-oscuro \.teselas-mapa \{ filter: var\(--filtro-teselas-oscuro\); \}/);
  assert.match(g, /--filtro-teselas-oscuro: invert\(1\) hue-rotate\(180deg\)/);
  assert.doesNotMatch(g, /\.mapa-claro \.teselas-mapa/);
});

test('el estilo del mapa es oscuro por defecto y vive solo en memoria (señal)', () => {
  assert.equal(ESTILO_MAPA_INICIAL, 'oscuro');
  assert.match(ts(), /readonly estiloMapa = signal<EstiloMapa>\(ESTILO_MAPA_INICIAL\)/);
  assert.match(ts(), /classList\.add\(`mapa-\$\{this\.estiloMapa\(\)\}`\)/);
});

test('el fondo del contenedor usa tokens de styles.css, coherentes con formato.ts, y sigue al estilo elegido', () => {
  const g = global();
  assert.match(g, new RegExp(`--mapa-fondo-oscuro: ${FONDO_MAPA.oscuro};`));
  assert.match(g, new RegExp(`--mapa-fondo-claro: ${FONDO_MAPA.claro};`));
  assert.equal(FONDO_MAPA.claro, '#dceaf1');                                        // el claro es el de siempre
  assert.match(g, /\.leaflet-container\.mapa-oscuro \{ background: var\(--mapa-fondo-oscuro\); \}/);
  assert.match(g, /\.leaflet-container\.mapa-claro \{ background: var\(--mapa-fondo-claro\); \}/);
  assert.doesNotMatch(css(), /\.map \{[^}]*background/);                           // el fondo ya no está fijado en el componente
});

// --- selector claro/oscuro ---
test('el selector de estilo es un control de Leaflet accesible, con foco visible y objetivo táctil de 36 px', () => {
  const codigo = ts();
  assert.match(codigo, /new L\.Control\(\{ position: 'topright' \}\)/);
  assert.match(codigo, /setAttribute\('role', 'group'\)/);
  assert.match(codigo, /setAttribute\('aria-label', 'Estilo del mapa base'\)/);
  assert.match(codigo, /\['oscuro', 'Oscuro'\], \['claro', 'Claro'\]/);
  assert.match(codigo, /boton\.type = 'button'/);
  assert.match(codigo, /setAttribute\('aria-pressed', String\(valor === this\.estiloMapa\(\)\)\)/);
  assert.match(codigo, /L\.DomEvent\.disableClickPropagation\(caja\)/);
  assert.match(codigo, /L\.DomEvent\.disableScrollPropagation\(caja\)/);
  assert.match(codigo, /this\.controlEstilo\?\.remove\(\)/);                        // se limpia al destruir
  const g = global();
  assert.match(g, /\.selector-estilo button \{[^}]*min-height: 36px/);
  assert.match(g, /\.selector-estilo button:focus-visible \{ outline: 3px solid var\(--foco\)/);
  assert.match(g, /\.selector-estilo button\[aria-pressed="true"\] \{[^}]*font-weight: 700/);   // el botón activo no se distingue solo por color
});

test('al cambiar de estilo se actualizan fondo, fronteras y bordes SIN tocar relleno, tamaño ni la selección', () => {
  const cuerpo = /private cambiarEstilo\(estilo: EstiloMapa\): void \{([\s\S]*?)\n  \}/.exec(ts())?.[1] ?? '';
  for (const paso of ["classList.remove('mapa-oscuro', 'mapa-claro')", 'this.fronteras?.setStyle(this.estiloFrontera)', '{ ...estiloBase, color: borde }', 'this.estilos.set(id, nuevo)', 'this.resaltar(id)', 'setStyle(nuevo)']) assert.ok(cuerpo.includes(paso), paso);
  assert.doesNotMatch(cuerpo, /fillColor|fillOpacity|radius/);                      // solo cambia el borde
  assert.match(ts(), /private readonly estiloFrontera = \(\): L\.PathOptions => \(\{ color: BORDE_FRONTERA\[this\.estiloMapa\(\)\], weight: 1, fill: false \}\)/);
});

// --- marcadores: contraste del borde y selección ---
test('estiloCirculo: el borde es el único parámetro nuevo; relleno, tamaño, opacidad y grosor no cambian', () => {
  const claro = estiloCirculo('#e35b37', 9);
  const oscuro = estiloCirculo('#e35b37', 9, bordeMapa('oscuro'));
  assert.equal(claro.color, BORDE_MAPA);                                            // por defecto, el borde de siempre
  assert.equal(oscuro.color, BORDE_MAPA_OSCURO);
  assert.deepEqual({ ...oscuro, color: claro.color }, claro);
  assert.equal(bordeMapa('claro'), BORDE_MAPA);
  assert.equal(estiloCirculo('#64748b', radioMagnitud(null), BORDE_MAPA_OSCURO).radius, 4);
});

test('contraste >= 3:1 (WCAG 1.4.11): borde claro sobre fondo oscuro, borde oscuro sobre fondo claro, selección y fronteras en cada estilo', () => {
  const MAR = '#aad3df'; const TIERRA = '#f2efe9';                                  // medidas de F6 sobre las teselas claras de OSM
  assert.ok(razonContraste(BORDE_MAPA_OSCURO, FONDO_MAPA.oscuro) >= 3);
  assert.ok(razonContraste(BORDE_MAPA, FONDO_MAPA.claro) >= 3);
  for (const fondo of [MAR, TIERRA]) assert.ok(razonContraste(BORDE_MAPA, fondo) >= 3, fondo);
  assert.ok(razonContraste(SELECCION_MAPA.oscuro, FONDO_MAPA.oscuro) >= 3);
  assert.ok(razonContraste(SELECCION_MAPA.claro, FONDO_MAPA.claro) >= 3);
  assert.ok(razonContraste(BORDE_FRONTERA.oscuro, FONDO_MAPA.oscuro) >= 3);
  assert.ok(razonContraste(BORDE_FRONTERA.claro, FONDO_MAPA.claro) >= 3);
  // el borde oscuro NO sirve sobre el fondo oscuro: de ahí el cambio de color solo del borde
  assert.ok(razonContraste(BORDE_MAPA, FONDO_MAPA.oscuro) < 3);
  // la selección se distingue del borde normal en ambos estilos (color distinto o, en claro, el grosor 4 frente a 1,5)
  assert.notEqual(SELECCION_MAPA.oscuro, BORDE_MAPA_OSCURO);
});

// --- ventanas emergentes ---
test('las ventanas emergentes se construyen con DOM y textContent (nunca HTML), con clase propia y ancho adaptado', () => {
  const codigo = ts();
  assert.doesNotMatch(codigo, /innerHTML|outerHTML|insertAdjacentHTML|\.bindPopup\(`|\.bindPopup\('/);
  assert.match(codigo, /\.bindPopup\(popup, \{ className: 'popup-sismico', maxWidth: 320, minWidth: 240, autoPanPaddingTopLeft: L\.point\(10, 96\) \}\)/);
  for (const campo of ['ficha.lugar', 'ficha.insignia', 'fila.etiqueta', 'fila.valor']) assert.match(codigo, new RegExp(`\\.textContent = ${campo.replace('.', '\\.')}`));
  assert.match(codigo, /replay\.textContent = fichaReplay\(p, this\.ejecucion\(\), true\)\.trim\(\)/);   // REPRODUCCIÓN, antes que el resto
  assert.ok(codigo.indexOf("replay.className = 'ficha-replay'") < codigo.indexOf("titulo.className = 'ficha-titulo'"));
  const g = global();
  assert.match(g, /\.popup-sismico \.leaflet-popup-content \{[^}]*max-width: calc\(100vw - 96px\)/);
  assert.match(g, /a\.leaflet-popup-close-button \{[^}]*width: 32px; height: 32px/);
  assert.match(g, /a\.leaflet-popup-close-button:focus-visible/);
  assert.match(g, /\.ficha-replay \{[^}]*var\(--replay-fondo\)/);
});

test('filasFicha: todos los datos de textoFicha (lugar, magnitud y filas) con el mismo texto', () => {
  const p = { place: 'Lugar', mag: 4.5, magType: 'mb', time: 1793113140000, updated: 1793113200000, country_name: 'España' };
  const f = filasFicha(p, 12, 'us1');
  assert.equal(f.lugar, 'Lugar');
  assert.equal(f.insignia, 'Magnitud 4.5');                                          // la insignia lleva texto, no solo color
  assert.deepEqual(f.filas.map((x) => x.etiqueta), ['Tipo de magnitud', 'Profundidad', 'Fecha UTC', 'Actualizado UTC', 'País', 'ID']);
  const texto = textoFicha(p, 12, 'us1');
  assert.ok(texto.startsWith(f.lugar + '\n'));
  assert.ok(texto.includes(f.insignia.replace('Magnitud ', 'Magnitud: ')));
  for (const fila of f.filas) assert.ok(texto.includes(`${fila.etiqueta}: ${fila.valor}`), fila.etiqueta);
  assert.deepEqual(f.filas.map((x) => x.valor), ['mb', '12 km', '2026-10-27T14:59:00.000Z', '2026-10-27T15:00:00.000Z', 'España', 'us1']);
});

test('filasFicha: ND y «Sin país asignado» cuando falta un dato (el nulo no es 0)', () => {
  const f = filasFicha({ place: null, mag: null, time: null, country_name: null }, null, undefined);
  assert.equal(f.lugar, 'Sin descripción');
  assert.equal(f.insignia, 'Magnitud ND');
  assert.deepEqual(f.filas.map((x) => x.valor), ['ND', 'ND', 'ND', 'ND', 'Sin país asignado', 'ND']);
  assert.equal(filasFicha({ place: 'x', mag: 0 }, 0, 0).insignia, 'Magnitud 0');     // un cero real se conserva
  assert.equal(filasFicha({ place: 'x', mag: 0 }, 0, 0).filas[1].valor, '0 km');
  const hostil = filasFicha({ place: '<img src=x onerror=alert(1)>' }, 1, 'x');
  assert.equal(hostil.lugar, '<img src=x onerror=alert(1)>');                         // se devuelve como texto: el componente lo asigna con textContent
});

// --- leyenda ---
test('la leyenda de profundidad está junto al mapa (no en el pie), con los 4 rangos y los mismos colores que colorProfundidad', () => {
  const h = html();
  // CAMBIO (rediseño dashboard): la leyenda ya no es la franja bajo el mapa (dentro de .mapa-envoltorio) sino un panel de la columna derecha (.col-der), después del visor en el DOM.
  // CAMBIO (rediseño dashboard, 2.ª ronda): «Estado del sistema» salió de la columna derecha, así que tras .col-der y .principal viene ahora el @if del app-estado (la columna derecha solo lleva modo, detalle y leyenda).
  // CAMBIO (vistas internas): la zona principal está ahora dentro de <section id="vista-panel">, con 2 espacios más de sangría: .col-der termina en `      </div>`, .principal en `    </div>` y la sección en `  </section>`.
  // CAMBIO (ronda 2 Mission Control): `.col-der` → `.hud-der` (HUD derecho del escenario); el cierre (pila, escenario y sección) conserva la sangría.
  const envoltorio = /<div class="hud-der">([\s\S]*?)\n      <\/div>\n    <\/div>\n  <\/section>/.exec(h)?.[1] ?? '';
  assert.ok(envoltorio.length > 0);
  assert.match(envoltorio, /class="leyenda panel-ui o-leyenda" role="group" aria-labelledby="leyenda-profundidad"/);
  assert.match(envoltorio, /<strong id="leyenda-profundidad"[^>]*>Profundidad<\/strong>/);
  assert.match(envoltorio, /<ul class="leyenda-lista">/);
  assert.ok(h.indexOf('class="map"') < h.indexOf('class="leyenda panel-ui'));          // la leyenda va después del visor
  const rangos: [string, string, unknown][] = [['punto-somera', 'Menos de 70 km', 0], ['punto-media', '70–299,99 km', 100], ['punto-profunda', '300 km o más', 300], ['punto-nd', 'No disponible', null]];
  for (const [clase, texto, profundidad] of rangos) {
    assert.match(envoltorio, new RegExp(`<li><span class="punto ${clase}" aria-hidden="true"></span>${texto}</li>`), texto);
    const hex = new RegExp(`\\.${clase} \\{ background: (#[0-9a-f]{6}); \\}`, 'i').exec(css())?.[1];
    assert.equal(hex, colorProfundidad(profundidad), clase);
  }
  assert.match(css(), /\.punto \{[^}]*border: 1\.5px solid var\(--punto-borde\)/);        // borde claro: el punto gris se ve sobre fondo oscuro
  assert.match(css(), /\.leyenda \{[^}]*flex-wrap: wrap/);                                   // se parte en filas a 320 px
  assert.match(css(), /\.leyenda-lista \{[^}]*flex-wrap: wrap/);
});

// CAMBIO (rediseño 3 vistas, ronda 2): las notas de tamaño y de mapa base ya no son texto permanente del pie: están en el desplegable «Notas del mapa», bajo la leyenda (mismo texto, sin perder nada).
// El pie sigue sin llevar la leyenda (CAMBIO análisis B: ya no lleva «Base proporcionada…»).
test('las notas de tamaño y mapa base están en «Notas del mapa» (bajo la leyenda) y el pie ya no lleva «Base proporcionada», sin la leyenda', () => {
  const notas = /<details class="notas-mapa o-notas">([\s\S]*?)<\/details>/.exec(html())?.[1] ?? '';
  assert.match(notas, /<summary>Notas del mapa<\/summary>/);
  assert.match(notas, /Tamaño: escala visual creciente con la magnitud; no representa energía ni área afectada\. Sin magnitud: radio mínimo\./);
  assert.match(notas, /selector de capas/);
  assert.match(notas, /Estilo del mapa base/);
  assert.ok(html().indexOf('class="leyenda panel-ui') < html().indexOf('class="notas-mapa'));   // después de la leyenda
  const pie = /<footer[^>]*>([\s\S]*?)<\/footer>/.exec(html())?.[1] ?? '';
  assert.doesNotMatch(pie, /Tamaño: escala|selector de capas/);
  // CAMBIO (análisis B): el texto de plantilla «Base proporcionada: …» desaparece del pie; el pie lleva ahora el proyecto y las atribuciones (la prueba equivalente nueva está en tests/analisis-b.test.ts).
  assert.doesNotMatch(pie, /Base proporcionada/);
  assert.match(pie, /Observatorio Sísmico · Proyecto académico de Big Data/);
  assert.doesNotMatch(pie, /Menos de 70 km|<strong>Profundidad/);
});

// --- mapa protagonista, movimiento y almacenamiento ---
test('mapa protagonista: 70vh con mínimo de 420 px, y en pantallas estrechas no queda aplastado y la etiqueta REPRODUCCIÓN no tapa los controles', () => {
  const c = css();
  // CAMBIO (rediseño dashboard): antes `.map { height: 70vh; min-height: 420px; }` y, en ≤ 700 px, `.map { height: 65vh; height: 65svh; min-height: 380px; }`. Ahora el mapa usa la variable de altura
  // compartida con el globo (--alto-visor): móvil max(380px, 65svh) (mismo valor que antes), tablet clamp(480px, 62vh, 760px) y escritorio clamp(560px, calc(100vh - 230px), 880px). La etiqueta sigue pasando a franja.
  assert.match(c, /\.map \{ height: var\(--alto-visor\); \}/);
  assert.match(c, /@media \(max-width: 700px\) \{\s*\.etiqueta-mapa \{ position: static;/);
  assert.match(c, /--alto-visor: max\(380px, 65vh\)/); assert.match(c, /--alto-visor: max\(380px, 65svh\)/);
  // CAMBIO (2.ª ronda): escritorio calc(100vh - 230px) → calc(100vh - 250px): cabecera y KPI más finas, el visor cabe casi entero en 900 px de alto
  // CAMBIO (ronda 2 del rediseño en 3 vistas): el globo/mapa es el protagonista del Panel: calc(100vh - 250px) con mínimo 560 y máximo 880 → clamp(620px, calc(100vh - 190px), 960px)
  // CAMBIO (ronda 2 Mission Control): escenario inmersivo desde 1100 px (antes 1280): clamp(620px, calc(100vh - 190px), 960px) → clamp(560px, calc(100vh - var(--alto-cabecera) - 124px), 980px), con `dvh` si existe (ver tests/ronda2-panel.test.ts).
  assert.match(c, /--alto-visor: clamp\(560px, calc\(100vh - var\(--alto-cabecera\) - 124px\), 980px\)/);
  assert.match(html(), /class="etiqueta-mapa" role="note">\{\{ e \}\}/);
});

test('sin almacenamiento del navegador, sin transition: all y con movimiento reducido en el mapa', () => {
  const todo = [ts(), html(), css(), global(), app('formato.ts')].join('\n');
  assert.doesNotMatch(todo, /localStorage|sessionStorage|document\.cookie|indexedDB|caches\./);
  assert.doesNotMatch(global() + css(), /transition:\s*all/);
  assert.match(global(), /@media \(prefers-reduced-motion: reduce\)/);
});
