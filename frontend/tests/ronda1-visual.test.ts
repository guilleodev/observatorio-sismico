// Ronda 1 del rediseño «Mission Control» (F7): sistema visual compartido (tokens, tipografía, iconos, fondo) y cabecera sticky con nav centrada y refresco en desplegable.
// Los componentes no se ejecutan con `node --test`: se comprueba el FUENTE (como el resto de pruebas de plantillas) y la lógica pura. `node --test tests/*.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { colorProfundidad, razonContraste } from '../src/app/formato.ts';
import { ETIQUETAS_ESTADO, esEstadoDeAviso, microAviso } from '../src/app/refresco.ts';
import type { EstadoRefresco } from '../src/app/refresco.ts';

const src = (r: string) => readFileSync(new URL(`../src/${r}`, import.meta.url), 'utf8');
const app = (r: string) => src(`app/${r}`);
const global = () => src('styles.css');
const html = () => app('app.component.html');
const cssApp = () => app('app.component.css');
const ind = () => app('indicador-refresco/indicador-refresco.component.ts');
const icono = () => app('icono/icono.component.ts');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Cuerpo de la primera regla `selector { … }` de una hoja (sin anidar). */
const regla = (css: string, selector: string) => new RegExp(`${esc(selector)} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
const token = (css: string, n: string) => new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1] ?? '';
/** Todos los archivos .ts/.html/.css de frontend/src. */
const fuentes = () => {
  const dir = fileURLToPath(new URL('../src/', import.meta.url));
  return readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => /\.(ts|html|css)$/.test(f)).map((f) => ({ f, t: readFileSync(join(dir, f), 'utf8') }));
};

// ---------- lógica pura ----------
test('microAviso y esEstadoDeAviso: error, pausa y acceso llevan micro-etiqueta; filtros rechazados es aviso sin micro; correcto/actualizando/sin lectura, nada', () => {
  assert.equal(microAviso('error'), 'Datos sin actualizar');
  assert.equal(microAviso('pausa'), 'Auto en pausa');
  assert.equal(microAviso('acceso'), 'Falta la clave');
  for (const e of ['correcto', 'actualizando', 'sin-lectura', 'filtros-rechazados'] as EstadoRefresco[]) assert.equal(microAviso(e), null, e);
  for (const e of ['error', 'pausa', 'acceso', 'filtros-rechazados'] as EstadoRefresco[]) assert.equal(esEstadoDeAviso(e), true, e);
  for (const e of ['correcto', 'actualizando', 'sin-lectura'] as EstadoRefresco[]) assert.equal(esEstadoDeAviso(e), false, e);
  // el estado esencial se dice con TEXTO (no solo color): todos los estados tienen etiqueta visible
  for (const e of Object.keys(ETIQUETAS_ESTADO) as EstadoRefresco[]) assert.ok(ETIQUETAS_ESTADO[e].length > 0, e);
});

// ---------- cabecera sticky ----------
test('cabecera: position sticky, top 0, z-index por encima de Leaflet (> 1000), altura --alto-cabecera y rejilla 1fr auto 1fr con nav centrada', () => {
  const c = cssApp(); const cab = regla(c, '.cabecera');
  assert.match(cab, /position: sticky/); assert.match(cab, /top: 0/); assert.match(cab, /height: var\(--alto-cabecera\)/);
  assert.match(cab, /grid-template-columns: 1fr auto 1fr/);
  assert.ok(Number(/z-index: (\d+)/.exec(cab)?.[1]) > 1001, 'por encima de los controles de Leaflet (1000) y de la etiqueta REPRODUCCIÓN del mapa (1001)');
  assert.match(regla(c, '.nav-vistas'), /justify-self: center/);              // centrada respecto a la cabecera, no al espacio restante
  const g = global();
  // Fase 1: en móvil la cabecera tiene dos filas (48 + 52 px) para que la nav tenga objetivos táctiles de 44 px
  assert.match(g, /--alto-cabecera: 56px/); assert.match(g, /@media \(max-width: 767px\) \{ :root \{ --alto-cabecera: 100px; \} \}/);
  assert.match(g, /scroll-padding-top: calc\(var\(--alto-cabecera\)/);        // WCAG 2.4.11: foco no oculto por la cabecera
  assert.match(g, /scroll-margin-top: calc\(var\(--alto-cabecera\)/);
  assert.doesNotMatch(g, /scroll-margin-top: 56px/);
});

test('condensación con IntersectionObserver sobre un centinela: sin listener de scroll y con disconnect en ngOnDestroy', () => {
  const h = html(); const ts = app('app.component.ts');
  assert.match(h, /<div class="centinela" #centinela aria-hidden="true"><\/div>/);
  assert.ok(h.indexOf('class="centinela"') < h.indexOf('<header class="cabecera"'));
  assert.match(h, /<header class="cabecera" \[class\.condensada\]="condensada\(\)"/);
  assert.match(ts, /new IntersectionObserver\(\(\[e\]\) => this\.condensada\.set\(!e\.isIntersecting\)\)/);
  assert.match(ts, /this\.observadorCabecera\.observe\(el\)/);
  assert.match(/ngOnDestroy\(\): void \{([^\n]*)/.exec(ts)?.[1] ?? '', /this\.observadorCabecera\?\.disconnect\(\)/);
  assert.doesNotMatch(ts + h + ind(), /addEventListener\('scroll'|\(window:scroll\)|\(document:scroll\)|@HostListener\('window:scroll|onscroll/);
  const c = cssApp();
  assert.match(regla(c, '.cabecera.condensada'), /box-shadow: var\(--elev-3\)/);       // sombra más marcada…
  assert.match(regla(c, '.cabecera.condensada .cab-sub'), /display: none/);            // …y sin subtítulo
});

test('una sola <nav aria-label="Vistas"> con tres enlaces reales, aria-current, objetivos >= 36 px y sin tablist; el eyebrow se conserva (en el pie)', () => {
  const h = html();
  assert.equal((h.match(/<nav /g) ?? []).length, 1); assert.equal((h.match(/aria-label="Vistas"/g) ?? []).length, 1);
  const nav = /<nav class="nav-vistas" aria-label="Vistas">([\s\S]*?)<\/nav>/.exec(h)?.[1] ?? '';
  assert.equal((nav.match(/<a href="#\//g) ?? []).length, 3);
  assert.equal((nav.match(/\[attr\.aria-current\]="vista\(\) === '\w+' \? 'page' : null"/g) ?? []).length, 3);
  assert.doesNotMatch(h, /role="tablist"|role="tab"/);
  assert.match(regla(cssApp(), '.nav-vistas a'), /min-height: 36px/);
  assert.match(cssApp(), /\.nav-vistas a:focus-visible \{ outline: 3px solid var\(--foco\)/);
  assert.match(cssApp(), /\.nav-vistas a:hover \{/);
  assert.match(regla(cssApp(), '.nav-vistas a[aria-current="page"]'), /background: var\(--nav-activa-fondo\)/);
  assert.match(h, /<footer class="o-pie">[\s\S]*?<p class="eyebrow">BIG DATA · PROYECTO DE AULA<\/p>/);   // Fase 2: el eyebrow sigue en el pie (dentro de .pie-firma)
  // las zonas: identidad antes que la nav, y la nav antes que el estado (orden de foco)
  assert.ok(h.indexOf('class="cab-id"') < h.indexOf('<nav class="nav-vistas"') && h.indexOf('<nav class="nav-vistas"') < h.indexOf('class="cab-estado"'));
});

// ---------- refresco en desplegable ----------
test('indicador: UNA región viva, estado esencial y botón «Actualizar ahora» FUERA del desplegable, detalles dentro y cerrado por defecto', () => {
  const t = ind();
  assert.equal((t.match(/aria-live="polite"/g) ?? []).length, 1);
  assert.doesNotMatch(t, /role="status"|role="alert"/);
  const iDet = t.indexOf('id="detalles-refresco"');
  assert.ok(iDet > 0);
  for (const visible of ['<strong class="estado">{{ etiqueta() }}</strong>', 'class="actualizar"', 'class="disclosure"']) { const i = t.indexOf(visible); assert.ok(i > 0 && i < iDet, `${visible} debe estar antes (fuera) del desplegable`); }
  for (const dentro of ['Último correcto', 'Siguiente intento', 'Actualización automática: {{ intervalo() }}', '<p class="aviso-pausa">{{ a }}</p>']) assert.ok(t.indexOf(dentro, iDet) > iDet, `${dentro} dentro del desplegable`);
  assert.match(t, /readonly abierto = signal\(false\)/);                                  // cerrado por defecto, en memoria
  assert.match(t, /\[hidden\]="cabecera\(\) && !abierto\(\)"/);
  assert.match(t, /@if \(cabecera\(\)\) \{ @if \(micro\(\); as m\) \{ <span class="micro">\{\{ m \}\}<\/span> \}/);   // micro-etiqueta de aviso en la fila
  assert.match(app('app.component.html'), /<app-indicador-refresco class="cab-refresco" \[cabecera\]="true"/);
  assert.doesNotMatch(app('app.component.html'), /\[compacto\]="true"/);
});

test('disclosure: aria-expanded + aria-controls, Escape (y foco de vuelta al botón), clic fuera y pérdida de foco; sin almacenamiento', () => {
  const t = ind();
  assert.match(t, /<button type="button" #boton class="disclosure" \[attr\.aria-expanded\]="abierto\(\)" aria-controls="detalles-refresco"/);
  assert.match(t, /\[attr\.aria-label\]="'Detalles del refresco: ' \+ etiqueta\(\)"/);
  assert.match(t, /'\(document:keydown\.escape\)': 'alEscape\(\)'/); assert.match(t, /'\(document:click\)': 'alClicFuera\(\$event\)'/); assert.match(t, /'\(focusout\)': 'alPerderFoco\(\$event\)'/);
  const esc1 = /alEscape\(\): void \{([\s\S]*?)\n  \}/.exec(t)?.[1] ?? '';
  assert.match(esc1, /this\.abierto\.set\(false\)/); assert.match(esc1, /this\.boton\(\)\?\.nativeElement\.focus\(\)/);   // el foco vuelve al botón
  assert.match(/alClicFuera\(ev: Event\): void \{([\s\S]*?)\n  \}/.exec(t)?.[1] ?? '', /contains\(ev\.target/);
  assert.match(/alPerderFoco\(ev: FocusEvent\): void \{([\s\S]*?)\n  \}/.exec(t)?.[1] ?? '', /relatedTarget/);
  assert.doesNotMatch(t, /tabindex|focus-trap|cdk|localStorage|sessionStorage|document\.cookie|indexedDB/);                  // sin trampas de foco ni persistencia
  assert.match(t, /\.en-cab \.detalles \{[^}]*position: absolute[^}]*width: min\(360px, calc\(100vw - 24px\)\)/);          // anclado y sin desbordar a 320 px
});

test('botón «Actualizar ahora» accesible: texto (visible u oculto visualmente) + title, icono decorativo y objetivo >= 36 px en cabecera', () => {
  const t = ind();
  assert.match(t, /<button type="button" class="actualizar" \(click\)="actualizar\.emit\(\)" \[disabled\]="cargando\(\)" \[attr\.title\]="cabecera\(\) \? 'Actualizar ahora' : null"><app-icono nombre="refrescar" \/><span class="actualizar-txt">Actualizar ahora<\/span><\/button>/);
  assert.match(t, /\.en-cab \.actualizar \{[^}]*min-height: 36px/); assert.match(t, /\.en-cab \.disclosure \{[^}]*min-height: 36px/);
  assert.match(t, /\.en-cab \.actualizar-txt \{ position: absolute;[^}]*clip-path: inset\(50%\)/);   // oculto visualmente pero accesible (no display: none)
});

test('REPRODUCCIÓN visible en móvil: banda violeta bajo la cabecera con texto (< 1280 px), glifo distinto (▶ vs ●) y texto largo para lectores', () => {
  const h = html(); const c = cssApp();
  assert.match(h, /@if \(esApi\(\) && esReplay\(\)\) \{ <p class="banda-replay" aria-hidden="true">REPRODUCCIÓN · datos históricos<\/p> \}/);
  assert.match(h, /\{\{ esReplay\(\) \? '▶' : '●' \}\}/); assert.match(h, /<span class="oculto">\{\{ distintivoModo\(\) \}\}<\/span>/);
  assert.match(regla(c, '.banda-replay'), /height: 20px/); assert.match(regla(c, '.banda-replay'), /background: var\(--replay-fondo\)/);
  assert.doesNotMatch(regla(c, '.banda-replay'), /display: none/);                                       // visible por defecto (móvil y tablet)…
  assert.match(c, /@media \(min-width: 1280px\) \{[^@]*\.banda-replay \{ display: none; \}/);             // …y solo se oculta cuando el distintivo ya muestra el texto
  assert.match(c, /\.distintivo-texto \{ display: inline; \}/);
  assert.match(app('app.component.ts'), /distintivoCorto = computed\(\(\) => \(!this\.esApi\(\) \? this\.mode\(\) : this\.esReplay\(\) \? 'REPRODUCCIÓN' : 'En vivo'\)\)/);
  assert.ok(razonContraste(token(global(), 'replay-texto'), token(global(), 'replay-fondo')) >= 4.5);      // texto de la banda y del distintivo
});

test('móvil (Fase 1): cabecera de dos filas (48 + 52 px), logo y título visibles como enlace al Panel, nav a todo el ancho con objetivos de 44 px y sin truncar el texto', () => {
  const c = cssApp();
  assert.match(c, /@media \(max-width: 767px\) \{[\s\S]*?\.cabecera \{ grid-template-columns: auto minmax\(0, 1fr\) auto; grid-template-rows: 48px 52px;/);
  assert.doesNotMatch(c, /\.identidad \{ position: absolute/);                                           // el título ya no se oculta en móvil: es parte del enlace al Panel
  assert.doesNotMatch(c, /\.nav-vistas app-icono \{ display: none; \}/);                                 // los iconos de la nav se ven siempre (hay sitio: la nav ocupa su propia fila)
  assert.match(c, /\.nav-vistas \{ grid-row: 2; grid-column: 1 \/ -1;[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(c, /\.nav-vistas a \{ min-height: 44px;/);                                                // objetivo táctil ≥ 44 px en móvil (WCAG 2.5.5 AAA; el mínimo AA es 24 px)
  assert.doesNotMatch(regla(c, '.nav-vistas a'), /text-overflow|overflow: hidden/);                      // el texto de la nav no se recorta
  assert.match(c, /\.cab-id \{[^}]*min-height: 44px/);                                                   // el logo/título también es un objetivo táctil de 44 px
});

// ---------- iconos ----------
test('iconos: componente standalone con SVG inline, aria-hidden, focusable=false, trazo 1,75, currentColor y sin dependencias', () => {
  const t = icono();
  assert.match(t, /selector: 'app-icono'/); assert.match(t, /standalone: true/);
  assert.match(t, /aria-hidden="true" focusable="false"/); assert.match(t, /stroke-width="1\.75"/); assert.match(t, /stroke="currentColor"/);
  assert.deepEqual([...t.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]), ['@angular/core']);   // única importación: Angular
  assert.doesNotMatch(t, /https?:|<img|url\(|xlink|innerHTML/);
  const nombres = [...(/export type NombreIcono = ([^;]+);/.exec(t)?.[1] ?? '').matchAll(/'(\w+)'/g)].map((m) => m[1]);
  for (const n of ['marca', 'panel', 'analisis', 'eventos', 'refrescar', 'aviso', 'chevron', 'check']) assert.ok(nombres.includes(n), n);
  // CAMBIO (ronda 4 Mission Control): el set pasa de 12 a 15 iconos propios (se añaden 'buscar', 'globo' y 'limpiar' para la vista Eventos); el límite superior sube de 13 a 15, sigue siendo un set mínimo.
  assert.ok(nombres.length >= 8 && nombres.length <= 15);
  for (const n of nombres) assert.match(t, new RegExp(`\\n  ${n}: '`), `trazo de ${n}`);                    // cada nombre del tipo tiene su trazo
  // en la cabecera todos los iconos son decorativos: el texto o el aria-label los acompaña
  assert.ok((html().match(/<app-icono /g) ?? []).length >= 4);
  assert.match(ind(), /<span class="disc-ico" aria-hidden="true"><app-icono/); assert.match(ind(), /<span class="marca" aria-hidden="true">/);
});

// ---------- tokens, tipografía y contraste ----------
test('tokens nuevos definidos en :root (con respaldo en var(--x, …) donde se usan sin definir), escala tipográfica y fuente mono sin fuentes externas', () => {
  const g = global(); const raiz = /:root \{([\s\S]*?)\n\}/.exec(g)?.[1] ?? '';
  for (const n of ['escenario', 'panel-vidrio', 'cab-fondo', 'linea', 'filo', 'filo-replay', 'elev-1', 'elev-2', 'elev-3', 'radio-stage', 'radio-panel', 'radio-control', 'nav-fondo', 'nav-activa-fondo', 'fuente-mono', 't-2xs', 't-display', 'alto-cabecera'])
    assert.match(raiz, new RegExp(`--${n}:`), n);
  assert.match(raiz, /--radio-stage: 16px/); assert.match(raiz, /--radio-panel: var\(--radio\)/); assert.match(raiz, /--radio-control: var\(--radio-s\)/);
  assert.match(raiz, /--fuente-mono: ui-monospace, "Cascadia Mono", "SF Mono", Consolas, "Liberation Mono", monospace;/);
  const alfa = Number(/--panel-vidrio: rgba\(\d+, \d+, \d+, ([\d.]+)\)/.exec(raiz)?.[1]); assert.ok(alfa >= 0.86, 'panel de vidrio casi opaco');
  // los tokens conservados no cambian de valor
  for (const [n, v] of [['fondo', '#0f1114'], ['superficie-1', '#16191e'], ['acento', '#22d3ee'], ['replay', '#a78bfa'], ['radio', '10px'], ['radio-s', '6px']]) assert.match(raiz, new RegExp(`--${n}: ${v};`), n);
  // cada var(--x) sin respaldo que usan las hojas nuevas está definida en :root o localmente (--ico, --tono, --alto-visor…)
  const locales = new Set(['ico', 'tono', 'alto-visor']);
  for (const t of [cssApp(), ind(), icono(), g]) for (const m of t.matchAll(/var\(--([a-z0-9-]+)\)/g)) assert.ok(new RegExp(`--${m[1]}:`).test(g + cssApp() + ind()) || locales.has(m[1]), `--${m[1]} sin definir`);
  assert.match(g, /\.num, \.mono \{ font-variant-numeric: tabular-nums; \}/); assert.match(g, /\.mono \{ font-family: var\(--fuente-mono\); \}/);
  const et = regla(g, '.etiqueta-ui'); assert.match(et, /text-transform: uppercase/);
  const ls = Number(/letter-spacing: ([\d.]+)em/.exec(et)?.[1]); assert.ok(ls >= 0.08 && ls <= 0.12, 'tracking .08–.12em');
  const tam = Number(/--t-2xs: ([\d.]+)rem/.exec(raiz)?.[1]); assert.ok(tam >= 0.68 && tam <= 0.72);
});

test('contraste AA de los colores nuevos: texto de la nav (inactiva y activa), estados del indicador sobre la cabecera y controles ≥ 3:1', () => {
  const g = global(); const t = (n: string) => token(g, n);
  const navFondo = t('nav-fondo'), activa = t('nav-activa-fondo'), fondo = t('fondo');
  for (const x of [navFondo, activa, fondo]) assert.notEqual(x, '');
  assert.ok(razonContraste(t('texto-2'), navFondo) >= 4.5, 'enlace inactivo');
  assert.ok(razonContraste(t('texto'), navFondo) >= 4.5, 'enlace en hover');
  assert.ok(razonContraste(t('texto'), activa) >= 4.5, 'enlace activo');
  assert.ok(razonContraste(t('acento-texto'), activa) >= 4.5, 'icono del enlace activo');
  for (const e of ['ok', 'aviso', 'error-texto', 'acento-texto', 'texto-2', 'texto']) assert.ok(razonContraste(t(e), fondo) >= 4.5, `estado ${e} sobre la cabecera`);
  assert.ok(razonContraste(t('borde-control'), fondo) >= 3, 'borde de los botones de la cabecera');
  assert.ok(razonContraste(t('error'), fondo) >= 3 && razonContraste(t('aviso'), fondo) >= 3, 'punto de aviso del botón de detalles');
  assert.ok(razonContraste(t('acento-texto'), t('acento-fondo')) >= 4.5 && razonContraste(t('replay-texto'), t('replay-fondo')) >= 4.5, 'distintivo de modo');
});

// ---------- fondo, movimiento, almacenamiento y recursos externos ----------
test('fondo estático: body::before fijo, sin eventos de puntero, detrás de todo, sin animación, sin filtros y sin backdrop-filter en ninguna hoja', () => {
  const g = global(); const b = /body::before \{([\s\S]*?)\}\s*\n/.exec(g)?.[1] ?? '';
  assert.match(b, /position: fixed/); assert.match(b, /inset: 0/); assert.match(b, /z-index: -1/); assert.match(b, /pointer-events: none/);
  assert.ok((b.match(/radial-gradient\(/g) ?? []).length >= 8, 'campo de estrellas con varios degradados');
  assert.doesNotMatch(b, /animation|transition|filter|blur|url\(/);
  assert.match(g, /body \{[^}]*background: transparent/);                                  // si no, el fondo de body taparía las estrellas
  for (const { f, t } of fuentes()) assert.doesNotMatch(t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), /backdrop-filter/, f);
});

test('movimiento: sin `transition: all`; las transiciones y animaciones nuevas solo bajo prefers-reduced-motion: no-preference; la hoja de la app no las usa', () => {
  for (const { f, t } of fuentes()) assert.doesNotMatch(t, /transition:\s*all/, f);
  const g = global();
  const reducido = /@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/g;
  const dentro = [...g.matchAll(reducido)].map((m) => m[1]).join('\n');
  assert.match(dentro, /\.nav-vistas a \{ transition: background-color \.15s ease, box-shadow \.15s ease, color \.15s ease; \}/);   // ≤ 150 ms y propiedades listadas
  const fuera = g.replace(reducido, '');
  assert.doesNotMatch(fuera, /transition:\s*(?!none)|animation:/);                      // fuera de no-preference no queda ninguna transición ni animación (salvo `transition: none` del bloque «reduce»)
  assert.doesNotMatch(cssApp() + html(), /transition|animation|@keyframes/);
  assert.match(g, /@media \(prefers-reduced-motion: reduce\)/);
  // el popover y el chevron no animan (cambio instantáneo)
  assert.doesNotMatch(ind().slice(ind().indexOf('VARIANTE DE CABECERA')), /transition|animation/);
});

test('sin almacenamiento, sin fuentes ni recursos externos (nada de @import, Google Fonts, CDN, <link> ni imágenes remotas) en lo nuevo', () => {
  const nuevos = [global(), cssApp(), html(), ind(), icono(), app('app.component.ts')].join('\n');
  assert.doesNotMatch(nuevos, /localStorage|sessionStorage|document\.cookie|indexedDB/);
  assert.doesNotMatch([global(), cssApp(), html(), ind(), icono()].join('\n'), /@import|@font-face|fonts\.googleapis|fonts\.gstatic|cdn\.|unpkg|jsdelivr|<link |<img[^>]*src="(?!img\/)|url\(/i);   // Fase 2: solo imágenes LOCALES de `public/img/` (el pie); (app.component.ts usa `new URL(` legítimamente: no entra en esta comprobación)
  assert.doesNotMatch(global() + cssApp() + ind() + icono(), /https?:\/\//);
  assert.doesNotMatch(src('index.html'), /<link[^>]+rel="stylesheet"|fonts\.googleapis|https?:\/\/(?!www\.w3\.org)/);
  assert.match(global(), /--fuente: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;/);                // pila de sistema
});

test('los hex de profundidad y de la leyenda siguen intactos (colorProfundidad y .punto-*)', () => {
  assert.equal(colorProfundidad(0), '#e8a317'); assert.equal(colorProfundidad(100), '#e35b37'); assert.equal(colorProfundidad(300), '#7b3fb6'); assert.equal(colorProfundidad(null), '#64748b');
  const c = cssApp();
  for (const [clase, hex] of [['punto-somera', '#e8a317'], ['punto-media', '#e35b37'], ['punto-profunda', '#7b3fb6'], ['punto-nd', '#64748b']]) assert.match(c, new RegExp(`\\.${clase} \\{ background: ${hex}; \\}`), clase);
});
