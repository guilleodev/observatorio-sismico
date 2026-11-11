// Rediseño global del dashboard (F7): KPI sobre eventos cargados, nav de anclas, orden DOM, panel «Evento seleccionado», leyenda en la columna derecha, filtros plegables, container queries y tokens.
// `node --test tests/*.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contarMagnitudDesde, magnitudMaxima, notaCargados, paisesConEventos, textoEventosMayores, textoMagnitudMaxima } from '../src/app/estado-datos/estado-datos.ts';
import { colorProfundidad, razonContraste } from '../src/app/formato.ts';

const app = (r: string) => readFileSync(new URL(`../src/app/${r}`, import.meta.url), 'utf8');
const global = () => readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const ev = (mag: unknown) => ({ properties: { mag } });

// ---------- KPI puros ----------
test('KPI: magnitud máxima ignora null, NaN y no finitos; «ND» sin ninguna; solo el valor numérico', () => {
  assert.equal(magnitudMaxima([ev(3.2), ev(7.3), ev(null), ev(NaN), ev(Infinity), ev('9')]), 7.3);
  assert.equal(textoMagnitudMaxima([ev(3.2), ev(7.3)]), 'M 7.3');
  assert.equal(textoMagnitudMaxima([ev(null), ev(NaN), ev(undefined)]), 'ND');
  assert.equal(textoMagnitudMaxima([]), 'ND');
  assert.equal(textoMagnitudMaxima([ev(0)]), 'M 0');                       // un cero real no es «ND»
  assert.equal(textoMagnitudMaxima([ev(-0.5), ev(-1)]), 'M -0.5');
});

test('KPI: eventos ≥ 4,5 con comparación exacta; «0» si hay eventos pero ninguno; «ND» sin eventos cargados', () => {
  assert.equal(contarMagnitudDesde([ev(4.5), ev(4.49999), ev(5), ev(null), ev(NaN)]), 2);
  assert.equal(textoEventosMayores([ev(4.5), ev(6)]), '2');
  assert.equal(textoEventosMayores([ev(1), ev(null)]), '0');
  assert.equal(textoEventosMayores([]), 'ND');
  assert.equal(textoEventosMayores([ev(1200)]), '1');
  assert.equal(textoEventosMayores(Array.from({ length: 15000 }, () => ev(5))), '15.000');   // miles en español (es-ES no agrupa los de 4 cifras)
});

test('KPI: la nota deja claro que es sobre los CARGADOS y no sobre el total del periodo', () => {
  assert.equal(notaCargados(100, 100), 'en los 100 eventos cargados');
  assert.equal(notaCargados(100, null), 'en los 100 eventos cargados');
  assert.equal(notaCargados(12345, 25000), 'sobre los 12.345 cargados, no sobre el total del periodo');
  assert.equal(notaCargados(0, 10), 'sin eventos cargados');
});

test('KPI: países con eventos del periodo no cuenta «Sin país asignado» ni países con recuento 0; null si no hay bloque', () => {
  const b = { items: [{ country_id: 'JP', count: 5 }, { country_id: 'CL', count: 2 }, { country_id: null, count: 9 }, { country_id: 'ES', count: 0 }] };
  assert.equal(paisesConEventos(b), 2);
  assert.equal(paisesConEventos({ items: [{ country_id: null, count: 3 }] }), 0);
  assert.equal(paisesConEventos(null), null);
  assert.equal(paisesConEventos(undefined), null);
});

test('KPI en la plantilla: total de la API (no el cargado), cargados, máx y ≥4.5 sobre eventos(), países solo con estadísticas, REPRODUCCIÓN en violeta, una región viva', () => {
  const c = app('estado-datos/estado-datos.component.ts');
  // CAMBIO (rediseño 3 vistas, ronda 2): ya no son 10 tarjetas sino 5 principales («Terremotos en el periodo», «Magnitud máxima», «Eventos ≥ M4.5», «Países con eventos» o su sustituta «Visualizados», y «Estado»);
  // «Terremotos visualizados», «Última lectura del frontend», «Última ingesta USGS», «Países (catálogo)», etc. pasan al desplegable «Más detalles de la lectura» (no se pierde ningún dato). La etiqueta
  // «Terremotos en el periodo (API)» pasa a «Terremotos en el periodo» (la nota «N cargados» sustituye al subtítulo largo).
  for (const t of ['Terremotos en el periodo', 'Terremotos visualizados', 'Magnitud máxima', 'Eventos ≥ M4.5', 'Países con eventos', 'Última lectura del frontend', 'Última ingesta USGS', 'Más detalles de la lectura', 'Visualizados']) assert.ok(c.includes(t), t);
  assert.match(c, /\{\{ total\(\) \?\? 'ND' \}\}/);
  assert.match(c, /textoMagnitudMaxima\(this\.eventos\(\)\)/); assert.match(c, /textoEventosMayores\(this\.eventos\(\)\)/);
  assert.match(c, /@if \(nPaisesPeriodo\(\) !== null\)/);                          // sin dato fiable, la tarjeta se omite
  assert.match(c, /enReplay\(\) \? 'replay' : 'neutro'/);
  assert.match(c, /@container \(min-width: 640px\)/); assert.match(c, /minmax\(0, 1fr\)/);
  assert.equal((c.match(/aria-live="polite"/g) ?? []).length, 1);
  const h = app('app.component.html');
  assert.match(h, /\[eventos\]="eventos\(\)" \[porPais\]="estadisticas\(\)\?\.por_pais \?\? null"/);
});

// ---------- nav de vistas ----------
// CAMBIO (vistas internas): la «nav de anclas» (Mapa · Filtros · Análisis · Tabla, con `irA`, scroll suave y foco al destino) se sustituye por la nav de TRES vistas (Panel · Análisis · Eventos) con enlaces
// <a href="#/…">; el scroll suave desaparece (el cambio de vista hace scrollTo(0, 0) instantáneo). Los destinos con data-ancla (#mapa, #filtros, #tabla) siguen existiendo como destinos de foco. La prueba
// detallada de la navegación está en tests/navegacion.test.ts.
test('nav de vistas: aria-label, 3 enlaces reales a #/panel, #/analisis y #/eventos, destinos de foco con tabindex=-1 y scroll-margin, 36 px y sticky en móvil', () => {
  const h = app('app.component.html');
  assert.match(h, /<nav class="nav-vistas" aria-label="Vistas">/);
  const hrefs = [...h.matchAll(/<a href="#\/(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs.slice(0, 3), ['panel', 'analisis', 'eventos']);
  for (const id of ['mapa', 'filtros', 'tabla']) assert.match(h, new RegExp(`id="${id}"[^>]*data-ancla tabindex="-1"`), id);
  assert.match(global(), /\[data-ancla\][^{]*\{ scroll-margin-top/);
  const ts = app('app.component.ts');
  assert.doesNotMatch(ts, /irA\(ev: Event|scrollIntoView\(\{ behavior/);          // sin la lógica de anclas ni scroll suave
  const css = app('app.component.css');
  // CAMBIO (ronda 1 Mission Control): ya no es la nav la que es sticky en móvil, sino la CABECERA completa (en todos los anchos). Se conserva la comprobación de 36 px y se sustituye `.nav-vistas { position: sticky }` por `.cabecera { position: sticky }`.
  assert.match(css, /\.nav-vistas a \{[^}]*min-height: 36px/); assert.match(css, /\.cabecera \{[^}]*position: sticky/);
  assert.doesNotMatch(h, /<button[^>]*>\s*(Notificaciones|Usuario|API)/);   // nada de botones decorativos
});

// ---------- panel de detalle ----------
test('panel de detalle: compacto sin selección, completo con ella, sin innerHTML, formato.ts/modo.ts, Cerrar, tabla y UNA región viva', () => {
  const c = app('detalle-evento/detalle-evento.component.ts');
  assert.doesNotMatch(c, /innerHTML|outerHTML|insertAdjacentHTML|bypassSecurityTrust/);
  assert.match(c, /filasFicha\(e\.properties, prof, e\.id\)/); assert.match(c, /fichaReplay\(e\.properties, this\.ejecucion\(\), true\)\.trim\(\)/);
  assert.match(c, /Pulsa un terremoto en el mapa o el globo, o elige una fila de la tabla/);
  assert.match(c, /@if \(ficha\(\); as f\) \{[\s\S]*\} @else \{/);
  for (const t of ['{{ f.magnitud }}', '{{ f.lugar }}', '{{ f.insignia }}', '{{ fila.etiqueta }}', '{{ fila.valor }}', '{{ r }}']) assert.ok(c.includes(t), t);
  assert.match(c, /\(click\)="cerrar\.emit\(\)">Cerrar</); assert.match(c, /Ver este evento en la tabla/);
  // CAMBIO (vistas internas): la tabla está en la vista Eventos (oculta mientras se ve el Panel), así que el panel ya no enfoca #tabla-titulo: emite `verTabla` y AppComponent cambia de vista y enfoca ese título
  assert.match(c, /readonly verTabla = output<void>\(\)/); assert.match(c, /verEnTabla\(\): void \{ this\.verTabla\.emit\(\); \}/);
  assert.match(app('app.component.ts'), /verEnTabla\(\): void \{ this\.irAVista\('eventos', 'tabla-titulo'\); \}/);
  assert.equal((c.match(/aria-live="polite"/g) ?? []).length, 1);
  assert.match(c, /`Seleccionado: \$\{f\.lugar\}\. \$\{f\.insignia\}\.`/);
  const h = app('app.component.html');
  assert.match(h, /<app-detalle-evento [^>]*\[evento\]="eventoSeleccionado\(\)"[^>]*\(cerrar\)="elegir\(null, 'mapa'\)"/);
  assert.match(app('app.component.ts'), /readonly eventoSeleccionado = computed<Evento \| null>/);
  // el globo no duplica la tarjeta ni la región viva
  const g = app('globo/globo.component.ts');
  assert.doesNotMatch(g, /<aside|aria-live|Ver este evento en la tabla/);
  assert.match(g, /reservaDerecha: \(\) => 0,/);
});

// ---------- leyenda ----------
test('leyenda en la columna derecha con los mismos hex que colorProfundidad y la lógica interactiva intacta', () => {
  const h = app('app.component.html'); const css = app('app.component.css');
  // CAMBIO (ronda 2 Mission Control): la «columna derecha» (.col-der) es ahora el HUD derecho (.hud-der) del escenario; la leyenda sigue después del visor y dentro de esa pila.
  assert.ok(h.indexOf('<div class="hud-der">') < h.indexOf('class="leyenda panel-ui'));
  assert.ok(h.indexOf('class="leyenda panel-ui') < h.indexOf('id="analisis"'));
  for (const [clase, p] of [['punto-somera', 0], ['punto-media', 100], ['punto-profunda', 300], ['punto-nd', null]] as const)
    assert.equal(new RegExp(`\\.${clase} \\{ background: (#[0-9a-f]{6}); \\}`, 'i').exec(css)?.[1], colorProfundidad(p), clase);
  for (const t of ['aria-pressed', 'Mostrar todos', 'cuentaRango(r.id)', 'anuncioLeyenda()', 'Leyenda · ']) assert.ok(h.includes(t), t);
});

// ---------- filtros plegables ----------
test('filtros: barra-resumen con aria-expanded/aria-controls, plegado solo por CSS en móvil (no destruye campos) y abre con errores', () => {
  const h = app('app.component.html'); const css = app('app.component.css'); const ts = app('app.component.ts');
  assert.match(h, /\[attr\.aria-expanded\]="filtrosVisibles\(\)" aria-controls="filtros-cuerpo"/);
  assert.match(h, /id="filtros-cuerpo" class="filtros-cuerpo" \[class\.plegado\]="!filtrosVisibles\(\)"/);
  assert.doesNotMatch(h, /@if \(filtrosVisibles\(\)\)/);                       // el formulario no se destruye
  assert.match(h, /resumenFiltros\(\)/);
  assert.match(h, /\(invalido\)="filtrosInvalidos\.set\(\$event\)"/);
  assert.match(ts, /filtrosVisibles = computed\(\(\) => this\.filtrosAbiertos\(\) \|\| this\.filtrosInvalidos\(\)\)/);
  // CAMBIO (ronda 2 Mission Control): el estado inicial sale de hudPorDefecto(window.innerWidth) (abierto desde 1440 px; en móvil sigue plegado: < 1440 → false), ya no es el literal `false`.
  assert.match(ts, /readonly filtrosAbiertos = signal\(this\.hudInicial\.filtros\)/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.filtros-cuerpo\.plegado \{ display: none; \}/);
  // CAMBIO (ronda 2 Mission Control): la barra ya no «no existe» en tablet y escritorio: es la cabecera del panel de Filtros (título + resumen). Lo que se oculta fuera de móvil y escritorio ≥ 1100 px es su BOTÓN de plegar (el formulario siempre visible en tablet).
  assert.match(css, /\.filtros-toggle \{ display: none;/);
  assert.match(app('filtros/filtros.component.ts'), /readonly invalido = output<boolean>\(\)/);
});

// ---------- layout, container queries y tokens ----------
test('layout: tres columnas en escritorio, orden móvil con order, container queries y minmax contra desbordes', () => {
  const css = app('app.component.css');
  // CAMBIO (rediseño 3 vistas, ronda 2): columnas laterales más estrechas para que el globo reciba el mayor ancho: antes 280–300 / 1fr / 320–360 (≥ 1280) y 320 / 1fr / 380 (≥ 1600); ahora 260–280 / 1fr / 300–330 y 300 / 1fr / 340.
  // CAMBIO (ronda 2 Mission Control): ya no hay tres columnas (.principal) sino un ESCENARIO con HUD flotantes de 280 px (filtros) y 308 px (pila derecha) desde 1100 px; en tablet, rejilla de 2 columnas. Ver tests/ronda2-panel.test.ts.
  assert.match(css, /\.hud-izq \{ left: 12px; width: 280px; \}/); assert.match(css, /\.hud-der \{ right: 12px; width: 308px; \}/);
  assert.match(css, /\.escenario \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  // CAMBIO (vistas internas): `o-estado` y `o-analisis` ya no tienen `order` (están dentro de la vista Análisis, que conserva su orden DOM); el orden móvil de acceso → filtros → visor → detalle → modo → leyenda → KPI se conserva
  const orden = ['o-acceso', 'o-filtros', 'o-visor', 'o-detalle', 'o-modo', 'o-leyenda', 'o-kpi'].map((c) => Number(new RegExp(`\\.${c} \\{ order: (\\d+); \\}`).exec(css)?.[1]));
  assert.deepEqual([...orden].sort((a, b) => a - b), orden);
  assert.ok(orden.every((n) => Number.isFinite(n)));
  assert.match(app('filtros/filtros.component.ts'), /container-type: inline-size/); assert.match(app('filtros/filtros.component.ts'), /@container \(min-width: 460px\)/);
  assert.match(app('selector-modo/selector-modo.component.ts'), /@container \(max-width: 459px\)/);
  assert.match(app('indicador-refresco/indicador-refresco.component.ts'), /readonly compacto = input\(false\)/);
  assert.match(css, /\.graficas \{[^}]*minmax\(0, 1fr\)/);
});

// ---------- 2.ª ronda: densidad (cabecera, KPI, estado, refresco móvil) ----------
test('2.ª ronda: nav dentro de la cabecera, «Estado del sistema» fuera de la columna derecha, KPI densos con texto completo accesible y refresco móvil compacto', () => {
  const h = app('app.component.html'); const css = app('app.component.css');
  // CAMBIO (ronda 1 Mission Control): el <header> lleva ahora clases dinámicas (`condensada`, `replay`), así que se busca `<header class="cabecera"` con atributos; y `display: contents` en móvil desaparece:
  // la cabecera es una única fila sticky de 48 px en móvil (ver tests/ronda1-visual.test.ts). Se mantiene que nav e indicador están DENTRO de la cabecera.
  const cab = /<header class="cabecera"[^>]*>([\s\S]*?)<\/header>/.exec(h)?.[1] ?? '';
  assert.match(cab, /<nav class="nav-vistas"/); assert.match(cab, /<app-indicador-refresco/);   // CAMBIO (vistas internas): la nav de vistas sustituye a la de anclas
  assert.doesNotMatch(css, /\.cabecera \{ display: contents; \}/);                // ya no se «disuelve» la cabecera en móvil
  assert.match(css, /\.cabecera \{[^}]*position: sticky/);                         // sticky en todos los anchos
  // CAMBIO (vistas internas): la columna derecha está ahora dentro de <section id="vista-panel"> (+2 espacios de sangría): termina en `      </div>` y la zona principal en `    </div>`
  // CAMBIO (ronda 2 Mission Control): `.col-der` → `.hud-der` (misma sangría de cierre: pila, escenario y sección)
  const der = /<div class="hud-der">([\s\S]*?)\n      <\/div>\n    <\/div>\n  <\/section>/.exec(h)?.[1] ?? '';
  assert.ok(der.length > 0);
  assert.doesNotMatch(der, /<app-estado /); assert.match(h, /@if \(esApi\(\)\) \{ <app-estado class="o-estado"/);
  assert.ok(h.indexOf('id="analisis"') < h.indexOf('<app-estado '));            // primer panel de la vista Análisis (antes: de la zona de análisis, que empezaba después)
  const k = app('estado-datos/estado-datos.component.ts');
  assert.match(k, /\.v\.grande \{ font-size: 1\.4rem/);
  assert.match(k, /\.sub \{[^}]*white-space: nowrap[^}]*text-overflow: ellipsis/);
  assert.match(k, /<span class="sub" \[attr\.title\]="notaAlcance\(\)">\{\{ notaAlcance\(\) \}\}<\/span>/);   // el texto completo sigue en el DOM y en title
  assert.equal((k.match(/aria-live="polite"/g) ?? []).length, 1);
  const r = app('indicador-refresco/indicador-refresco.component.ts');
  assert.match(r, /\.compacto \.cab \.k \{ position: absolute;/); assert.match(r, /Refresco del panel/);   // oculta visualmente, sigue accesible
  assert.match(r, /grid-template-areas: 'estado accion' 'metricas metricas' 'cab cab' 'aviso aviso'/);
});

test('sin almacenamiento, sin transition: all ni animaciones nuevas en el rediseño; tokens de contraste AA de los paneles nuevos', () => {
  for (const r of ['app.component.html', 'app.component.css', 'app.component.ts', 'detalle-evento/detalle-evento.component.ts']) {
    const t = app(r);
    assert.doesNotMatch(t, /localStorage|sessionStorage|document\.cookie|indexedDB|transition:\s*all|@keyframes/, r);
  }
  const tok = global(); const t = (n: string) => new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`).exec(tok)?.[1] ?? '';
  assert.ok(razonContraste(t('acento-texto'), t('acento-fondo')) >= 4.5);      // distintivo En vivo
  assert.ok(razonContraste(t('replay-texto'), t('replay-fondo')) >= 4.5);      // distintivo REPRODUCCIÓN
  assert.ok(razonContraste(t('texto'), t('superficie-1')) >= 4.5);             // enlaces de la nav sobre superficie-1
  assert.ok(razonContraste(t('texto-2'), t('superficie-1')) >= 4.5);           // títulos de panel
  assert.ok(razonContraste(t('acento-texto'), t('superficie-1')) >= 4.5);      // icono y «M x» del panel
  // CAMBIO (ronda 1 Mission Control): `.panel-ui` ya no lleva borde completo + franja superior de 2 px cian, sino línea fina (--linea) y «filo de luz» de 1 px (::before con --filo). Se comprueba la nueva forma.
  assert.match(tok, /\.panel-ui \{[^}]*border: 1px solid var\(--linea\)/); assert.match(tok, /\.panel-ui::before \{[^}]*background: var\(--filo\)/);
  assert.match(tok, /\.panel-ui\.replay::before \{[^}]*var\(--filo-replay\)/);
});
