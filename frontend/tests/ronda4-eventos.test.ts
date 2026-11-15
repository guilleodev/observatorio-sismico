// F7, RONDA 4 «Mission Control»: vista EVENTOS (explorador de datos). Lógica pura (punto de magnitud, punto de profundidad, columnas, densidad, contador) y estructura de la plantilla/estilos. `node --test tests/*.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIAMETRO_MAXIMO_PUNTO, RADIO_MAXIMO_MAPA, colorProfundidad, diametroPuntoMagnitud, radioMagnitud, razonContraste } from '../src/app/formato.ts';
import { COLUMNAS } from '../src/app/tabla.ts';
import { ALTURA_FILA, CLAVES_PRINCIPALES, DENSIDADES, DENSIDAD_INICIAL, densidadValida, esColumnaPrincipal, partirContador, partirFecha } from '../src/app/tabla-vista.ts';

const app = (r: string) => readFileSync(new URL(`../src/app/${r}`, import.meta.url), 'utf8');
const tabla = () => app('tabla/tabla.component.ts');
const html = () => app('app.component.html');
const eventos = () => /<section id="eventos"[\s\S]*?<\/section>\s*<!-- CAMBIO \(ronda 1\)/.exec(html())?.[0] ?? '';
const tokens = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const t = (n: string) => new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens)?.[1] ?? '';

// ---------- punto de magnitud: la escala del mapa (radioMagnitud) reducida, no una escala nueva ----------
test('diametroPuntoMagnitud: proporcional a radioMagnitud, monótona, con tope de 16 px y sin punto si no hay magnitud', () => {
  assert.equal(RADIO_MAXIMO_MAPA, 18); assert.equal(radioMagnitud(99), RADIO_MAXIMO_MAPA);          // el máximo documentado es el real de la escala del mapa
  assert.equal(DIAMETRO_MAXIMO_PUNTO, 16);
  let anterior = 0;
  for (let m = -1; m <= 10; m += 0.5) {
    const d = diametroPuntoMagnitud(m)!;
    assert.ok(d >= anterior, `monótona en M${m}`); anterior = d;
    assert.ok(d <= 16, `tope en M${m}`);
    assert.ok(Math.abs(d - radioMagnitud(m) * 16 / 18) <= 0.051, `proporcional a radioMagnitud en M${m}`);   // redondeo a 0,1 px
  }
  assert.equal(diametroPuntoMagnitud(7), 16); assert.equal(diametroPuntoMagnitud(9.5), 16);          // tope
  assert.equal(diametroPuntoMagnitud(5), 13.3);                                                       // radio 15 → 15 × 16/18
  assert.ok(diametroPuntoMagnitud(2)! < diametroPuntoMagnitud(5)!);
  for (const sin of [null, undefined, NaN, Infinity, '4.5', {}]) assert.equal(diametroPuntoMagnitud(sin), null, String(sin));   // nunca se inventa un tamaño
});

// ---------- punto de profundidad: los mismos hex que la leyenda ----------
test('punto de profundidad: usa colorProfundidad (mismos hex que la leyenda) y sus límites 0 · 69,99 · 70 · 299,99 · 300 · null', () => {
  const esperado: [number | null, string][] = [[0, '#e8a317'], [69.99, '#e8a317'], [70, '#e35b37'], [299.99, '#e35b37'], [300, '#7b3fb6'], [null, '#64748b']];
  for (const [p, hex] of esperado) assert.equal(colorProfundidad(p), hex, String(p));
  const c = tabla();
  assert.match(c, /color\(profundidad: number \| null\): string \{ return colorProfundidad\(profundidad\); \}/);   // sin hex propios en el componente
  assert.match(c, /\[style\.background-color\]="color\(f\.profundidad\)"/);
  assert.doesNotMatch(c, /#e8a317|#e35b37|#7b3fb6/);
  assert.match(c, /diametro\(mag: number \| null\): number \| null \{ return diametroPuntoMagnitud\(mag\); \}/);
  assert.match(c, /\.punto \{[^}]*border: 1px solid var\(--punto-borde\)/);                        // borde fino donde el contraste lo requiere
  assert.match(c, /<span class="slot" aria-hidden="true">/);                                         // los puntos son decorativos: el valor y la clase están en texto
  assert.match(c, /<td class="clase sec">\{\{ f\.clase \}\}<\/td>/);   // CAMBIO (ronda 4, anchos): clase «clase» para poder envolver el texto
                                      // «Clase de profundidad» sigue como texto
});

// ---------- columnas y jerarquía ----------
test('conserva TODAS las columnas (mismas que tabla.ts, en el mismo orden) y marca principales y secundarias', () => {
  const c = tabla();
  assert.equal(COLUMNAS.length, 11);
  assert.match(c, /@for \(c of columnas; track c\.clave\)/); assert.match(c, /readonly columnas = COLUMNAS;/);
  const cuerpo = /@for \(f of pagina\(\)\.filas; track f\.id\) \{([\s\S]*?)\} @empty/.exec(c)?.[1] ?? '';
  assert.equal((cuerpo.match(/<td\b/g) ?? []).length, COLUMNAS.length);                              // una celda por columna: ninguna eliminada
  // CAMBIO (ronda 4, ajuste de anchos): las dos fechas pasan por fechaPartes (misma cadena ISO partida en dos líneas visuales).
  for (const dato of ['fechaLegible(f.tiempo)','sinValor(f.mag, 2)', 'f.magTipo ?? \'sin valor\'', 'sinValor(f.profundidad, 2)', 'f.clase', 'f.lugar', 'f.pais', 'sinValor(f.lon, 3)', 'sinValor(f.lat, 3)', 'fechaLegible(f.actualizado)', 'f.id']) assert.ok(cuerpo.includes(dato), dato);   // CAMBIO (pulido Eventos): las fechas pasan de fechaPartes a fechaLegible («11 nov 2026» / «10:25:31.800 UTC» dentro de <time datetime=ISO>); la información es la misma
  assert.deepEqual([...CLAVES_PRINCIPALES], ['time', 'mag', 'profundidad', 'lugar']);
  const secundarias = COLUMNAS.filter((x) => !esColumnaPrincipal(x.clave)).map((x) => x.clave);
  assert.deepEqual(secundarias, ['magTipo', 'clase', 'pais', 'lon', 'lat', 'actualizado', 'id']);
  assert.match(c, /\[class\.sec\]="!principal\(c\.clave\)"/);
  assert.match(c, /td\.sec, th\.sec \.orden \{ color: var\(--texto-2\); font-size: \.78rem; \}/);   // secundarias atenuadas y más pequeñas
  // CAMBIO (ronda 4, ajuste de anchos): Lugar acotada a 18 rem (min 12 rem) con elipsis; Clase y País envuelven; fecha en dos líneas; relleno de celda de 8 px.
  assert.match(c, /td\.lugar \{ min-width: 12rem; \}/); assert.match(c, /\.celda-lugar \{[^}]*max-width: 18rem/); assert.match(c, /\.fila \{[^}]*max-width: 18rem/);
  assert.match(c, /td\.pais, td\.clase \{ white-space: normal; \}/); assert.match(c, /\.f-d, \.f-h \{ display: block; \}/);
  assert.match(c, /th, td \{[^}]*padding: 0 var\(--esp-2\)/); assert.match(c, /thead th \{ white-space: normal;/); assert.match(c, /\.fila \{[^}]*font-weight: 600[^}]*text-overflow: ellipsis/);   // Lugar elástica con elipsis y peso 600
  assert.match(c, /\[attr\.title\]="f\.lugar"/);
  assert.match(c, /<th scope="col" class="etiqueta-ui"/);                                             // cabeceras en versalitas
  assert.doesNotMatch(c, /nth-child\(odd\)|nth-child\(even\)|nth-of-type/);                           // sin cebra
});

test('Magnitud: cifra en mono negrita + punto; «sin valor» si falta (el texto existente); números en mono', () => {
  const c = tabla();
  assert.match(c, /<strong class="mono">\{\{ sinValor\(f\.mag, 2\) \}\}<\/strong>/);
  assert.match(c, /td\.mag strong \{ font-weight: 800; \}/);
  assert.match(c, /\.punto-mag \{ background: var\(--acento\); \}/);                                 // cian neutro, no semántico
  assert.match(c, /@if \(diametro\(f\.mag\); as d\)/);                                                // sin magnitud → sin punto
  for (const col of ['lon', 'lat']) assert.match(c, new RegExp(`class="num sec mono">\\{\\{ sinValor\\(f\\.${col}, 3\\) \\}\\}`));
});

// ---------- densidad ----------
test('selector de densidad: Cómoda | Compacta, aria-pressed, estado en memoria (señal), alturas táctiles y sin almacenamiento', () => {
  assert.deepEqual(DENSIDADES.map((d) => d.etiqueta), ['Cómoda', 'Compacta']);
  assert.equal(DENSIDAD_INICIAL, 'comoda');
  assert.ok(ALTURA_FILA.comoda >= 44); assert.ok(ALTURA_FILA.compacta >= 28); assert.ok(ALTURA_FILA.compacta < ALTURA_FILA.comoda);
  assert.equal(densidadValida('compacta'), 'compacta'); assert.equal(densidadValida('otra'), 'comoda'); assert.equal(densidadValida(undefined), 'comoda');
  const c = tabla();
  assert.match(c, /readonly densidad = signal<Densidad>\(DENSIDAD_INICIAL\)/);
  assert.match(c, /<div class="densidad" role="group" aria-label="Densidad de las filas">/);
  assert.match(c, /<button type="button" class="seg" \[attr\.aria-pressed\]="densidad\(\) === d\.valor" \(click\)="densidad\.set\(d\.valor\)">\{\{ d\.etiqueta \}\}<\/button>/);
  assert.match(c, /\[style\.--alto-fila\]="alturaFila\(\) \+ 'px'"/);
  assert.match(c, /\.seg \{[^}]*min-height: 38px/);
  assert.doesNotMatch(c, /localStorage|sessionStorage|document\.cookie|indexedDB/);
});

// ---------- fila seleccionada y acción ----------
test('fila seleccionada: aria-current, aria-pressed, marcador textual «Seleccionado», barra de acento de 3 px (violeta en REPRODUCCIÓN) y «Ver en el globo/mapa» con el handler existente', () => {
  const c = tabla();
  assert.match(c, /<tr \[class\.seleccionada\]="f\.id === seleccionado\(\)" \[attr\.aria-current\]="f\.id === seleccionado\(\) \? 'true' : null" \(click\)="pulsarFila\(\$event, f\.id\)">/);   // CAMBIO (pulido Eventos): la fila entera es seleccionable con el ratón
  assert.match(c, /\[attr\.aria-pressed\]="f\.id === seleccionado\(\)"/);
  assert.match(c, /<span class="oculto">Seleccionado\. <\/span>/);
  assert.match(c, /tbody tr\.seleccionada td:first-child \{ box-shadow: inset 3px 0 0 var\(--acento\); \}/);
  assert.match(c, /tbody tr\.seleccionada td \{ background: var\(--acento-fondo\)/);
  assert.match(c, /\.tabla\.replay tbody tr\.seleccionada td:first-child \{ box-shadow: inset 3px 0 0 var\(--replay\); \}/);
  assert.match(c, /@if \(f\.id === seleccionado\(\)\) \{ <button type="button" class="accion ver-visor" \(click\)="verVisor\.emit\(\)">/);   // solo en la fila seleccionada
  assert.match(c, /readonly verVisor = output<void>\(\)/); assert.match(c, /readonly textoVisor = input<string>/);
  const h = html();
  assert.match(h, /\(verVisor\)="verEnVisor\(\)"/);                                                   // «Ver en el globo/mapa» de la fila → verEnVisor (Fase 1: la franja del seleccionado ya no existe)
  assert.match(h, /\[textoVisor\]="visor\(\) === '3d' \? 'Ver en el globo' : 'Ver en el mapa'"/);
  assert.doesNotMatch(h, /Ir al evento seleccionado|franja-seleccion/);
  assert.match(app('app.component.ts'), /verEnVisor\(\): void \{ this\.irAVista\('panel', 'mapa'\); \}/);
  assert.match(c, /querySelector<HTMLElement>\('tr\.seleccionada \.fila'\)/);                         // el método de la tabla sigue encontrando el botón de la fila
});

// ---------- estados ----------
test('estados: sin eventos (con «Cambiar filtros»), sin resultados («Limpiar búsqueda»), no coincide, aviso de selección y demo, con icono, título y acción', () => {
  const c = tabla();
  assert.match(c, /Sin eventos cargados<\/p>/); assert.match(c, /No hay eventos cargados para estos filtros y este periodo\./);
  assert.match(c, /<a href="#\/panel" class="accion" \(click\)="\$event\.preventDefault\(\); cambiarFiltros\.emit\(\)">Cambiar filtros<\/a>/);
  assert.match(c, /Sin resultados<\/p>/); assert.match(c, /Ningún evento cargado coincide con la búsqueda\. Texto buscado: «\{\{ busqueda\(\) \}\}»\./);
  assert.match(c, /<button type="button" class="accion" \(click\)="limpiarBusqueda\(\)">Limpiar búsqueda<\/button>/);
  assert.match(c, /El evento seleccionado no coincide con la búsqueda\. <button type="button" class="accion" \(click\)="limpiarBusqueda\(\)">Limpiar búsqueda<\/button>/);
  assert.equal((c.match(/<app-icono nombre="(info|buscar)" class="estado-ico" \/>/g) ?? []).length, 2);
  const h = html();
  assert.match(h, /@if \(avisoSeleccion\(\)\) \{ <p role="alert" class="aviso-seleccion"><app-icono nombre="aviso" \/><span>\{\{ avisoSeleccion\(\) \}\}<\/span><\/p> \}/);
  assert.match(app('app.component.ts'), /Este evento no tiene coordenadas válidas y no se dibuja en el mapa; se conserva en la tabla\./);
  assert.match(h, /Todavía no hay eventos para listar\. La tabla necesita el modo API y una lectura correcta\./);   // demo / sin API
  assert.match(app('app.component.ts'), /cambiarFiltros\(\): void \{ this\.filtrosAbiertos\.set\(true\); this\.irAVista\('panel', 'filtros'\); \}/);
});

// ---------- búsqueda, paginación y accesibilidad ----------
test('búsqueda type=search con label visible, paginación etiquetada y botones >= 36 px, contenedor con scroll focusable y una sola región viva', () => {
  const c = tabla();
  assert.match(c, /<label class="buscar">\{\{ textoEtiquetaBusqueda\(\) \}\}\s*<input type="search"/);
  assert.match(c, /<app-icono nombre="buscar" class="ico-buscar" \/>/);
  assert.match(c, /@if \(busqueda\(\)\) \{ <button type="button" class="accion" \(click\)="limpiarBusqueda\(\)">Limpiar<\/button> \}/);
  assert.match(c, /<nav class="paginas" aria-label="Paginación de la tabla">/);
  assert.match(c, /\.paginas button, \.accion \{[^}]*min-height: 36px/);
  assert.match(c, /Página \{\{ pagina\(\)\.pagina \}\} de \{\{ pagina\(\)\.paginas \}\}/);
  assert.match(c, /<div class="desplazable" role="region" aria-label="Tabla de terremotos, desplazable horizontalmente" tabindex="0"/);
  assert.match(c, /\.desplazable:focus-visible \{ outline: 3px solid var\(--foco\)/);
  assert.equal((c.match(/aria-live=/g) ?? []).length, 1); assert.equal((c.match(/role="status"/g) ?? []).length, 1);   // la única región viva es el resumen «X de N cargados · mostrando a–b»
  assert.match(c, /<p class="resumen" role="status" aria-live="polite">\{\{ resumen\(\) \}\}<\/p>/);
  assert.match(c, /\.resumen \{[^}]*font-family: var\(--fuente-mono\)/);
  // el orden del DOM es el del foco: barra de herramientas → tabla → paginación
  assert.ok(c.indexOf('class="barra"') < c.indexOf('class="desplazable"') && c.indexOf('class="desplazable"') < c.indexOf('class="paginas"'));
  // el sticky de la cabecera vive DENTRO del contenedor que desplaza en ambos ejes (robusto); la barra de herramientas no es sticky
  assert.match(c, /thead th \{[^}]*position: sticky; top: 0/); assert.match(c, /\.desplazable \{[^}]*overflow: auto/);
  assert.doesNotMatch(/\.barra \{[^}]*\}/.exec(c)?.[0] ?? '', /sticky/);
});

test('encabezado de Eventos: h2 destino de foco, contador grande en mono con el mismo texto, nota «hay más» discreta y chips antes de la tabla (sin franja del seleccionado: Fase 1)', () => {
  const e = eventos();
  assert.match(e, /<h2 id="eventos-titulo" class="seccion-titulo encabezado-vista" tabindex="-1">Eventos del periodo consultado<\/h2>/);
  assert.match(e, /@if \(notaHayMas\(\); as nota\) \{ <span class="nota-mas">\{\{ nota \}\} <a href="#\/analisis" class="enlace-discreto"/);
  assert.match(e, /Ir a «Cargar el resto»/);
  const i = (s: string) => e.indexOf(s);
  assert.ok(i('eventos-titulo') < i('<app-filtros-activos') && i('<app-filtros-activos') < i('<app-tabla'));
  assert.match(app('app.component.css'), /\.contador-vista \.cifra \{ font-size: var\(--t-xl\);/);
  assert.doesNotMatch(e, /franja-seleccion/);                                                        // Fase 1: la franja se retiró (HTML y CSS)
  assert.doesNotMatch(app('app.component.css'), /\.franja-(seleccion|texto|acciones)/);
});

test('partirContador: cifra principal + resto, sin cambiar el texto («226 eventos cargados de 1.200 del periodo»)', () => {
  assert.deepEqual(partirContador('226 eventos cargados de 1.200 del periodo'), { cifra: '226', resto: 'eventos cargados de 1.200 del periodo' });
  assert.deepEqual(partirContador('1.234 eventos cargados'), { cifra: '1.234', resto: 'eventos cargados' });
  assert.deepEqual(partirContador('1 evento cargado de 1 del periodo'), { cifra: '1', resto: 'evento cargado de 1 del periodo' });
  assert.deepEqual(partirContador('sin cifra'), { cifra: '', resto: 'sin cifra' });
});

test('partirFecha: las dos líneas concatenadas son EXACTAMENTE el ISO original; «ND» queda en una línea', () => {
  assert.deepEqual(partirFecha('2026-11-11T10:25:31.800Z'), ['2026-11-11', 'T10:25:31.800Z']);
  assert.equal(partirFecha('2026-11-11T10:25:31.800Z').join(''), '2026-11-11T10:25:31.800Z');
  assert.deepEqual(partirFecha('ND'), ['ND', '']);
});

test('iconos nuevos de la ronda 4 (buscar, globo, limpiar): trazos propios inline', () => {
  const f = app('icono/icono.component.ts');                       // se lee como texto: el componente lleva decoradores y no se importa en node
  assert.match(f, /export type NombreIcono = [^;]*'buscar' \| 'globo' \| 'limpiar';/);
  for (const n of ['buscar', 'globo', 'limpiar']) assert.match(f, new RegExp(`\\n  ${n}: 'M[^']+',`), n);
  assert.doesNotMatch(f, /https?:\/\/|<image|href=/);
});

// ---------- contraste y estilo ----------
test('contraste AA (>= 4.5) de los textos de la tabla sobre sus fondos: normal y secundario sobre fondo/superficies, y sobre la fila seleccionada (cian y violeta)', () => {
  const fondos = { fondo: t('fondo'), s1: t('superficie-1'), s2: t('superficie-2'), sel: t('acento-fondo'), selReplay: t('replay-fondo'), aviso: t('aviso-fondo') };
  for (const [n, f] of Object.entries(fondos)) assert.ok(f !== '', n);
  for (const f of ['fondo', 'superficie-1', 'superficie-2', 'acento-fondo', 'replay-fondo']) {
    assert.ok(razonContraste(t('texto-2'), t(f)) >= 4.5, `texto-2 sobre ${f}`);                      // columnas secundarias
    assert.ok(razonContraste(t('texto'), t(f)) >= 4.5, `texto sobre ${f}`);                          // columnas principales
  }
  assert.ok(razonContraste(t('acento-texto'), fondos.sel) >= 4.5);                                  // Lugar seleccionado y segmento activo
  assert.ok(razonContraste(t('replay-texto'), fondos.selReplay) >= 4.5);
  assert.ok(razonContraste(t('acento-texto'), fondos.s2) >= 4.5);                                   // botones «Ver en el globo», paginación
  assert.ok(razonContraste(t('aviso-texto'), fondos.aviso) >= 4.5);
  assert.ok(razonContraste(t('acento'), fondos.sel) >= 3);                                          // barra de acento y punto (no texto: 1.4.11)
  assert.ok(razonContraste(t('replay'), fondos.selReplay) >= 3);
  assert.ok(razonContraste(t('punto-borde'), fondos.s1) >= 3);                                      // borde fino de los puntos
});

test('estilo: sin transition: all, sin animaciones nuevas, sin backdrop-filter, sin almacenamiento ni innerHTML; textos >= .75rem; sin tablas convertidas en bloques', () => {
  for (const r of ['tabla/tabla.component.ts', 'tabla-vista.ts', 'app.component.html', 'app.component.css']) {
    assert.doesNotMatch(app(r), /transition:\s*all|@keyframes|backdrop-filter|localStorage|sessionStorage|document\.cookie|indexedDB|innerHTML|outerHTML/, r);
  }
  const c = tabla();
  assert.doesNotMatch(c, /font-size: \.(6\d?|70|71|72|73|74)rem/);                                  // ningún texto por debajo de .75rem
  assert.doesNotMatch(c, /\b(tr|td|th|tbody|thead|table)\s*\{[^}]*display:/);                         // móvil: tabla real con scroll horizontal, sin romper la semántica (nada de display en tr/td)
  assert.match(c, /@media \(max-width: 767px\)/);
  assert.match(c, /<caption class="oculto">/); assert.match(c, /<th scope="col"/);
  assert.match(c, /overscroll-behavior: contain/);
});
