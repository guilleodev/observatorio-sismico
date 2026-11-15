// Rediseño «Mission Control», RONDA 3: vista Análisis (cabecera con chips, composición asimétrica, gráficas sin caja, color de profundidad, banda de comparación, metodología a dos columnas).
// Lógica pura (chips, color por intervalo de profundidad) + estructura de las plantillas y CSS. `node --test tests/*.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { partirResumen } from '../src/app/chips-filtros.ts';
import { resumen } from '../src/app/filtros.ts';
import { COLOR_NEUTRO, COLOR_PROFUNDA, COLOR_SOMERA, COLOR_MEDIA, LEYENDA_PROFUNDIDAD, colorDeProfundidad, colorIntervaloProfundidad, leyendaDeColores } from '../src/app/graficas-color.ts';
import { colorProfundidad, razonContraste } from '../src/app/formato.ts';

const app = (r: string) => readFileSync(new URL(`../src/app/${r}`, import.meta.url), 'utf8');
const global = () => readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const html = () => app('app.component.html');
const css = () => app('app.component.css');
const token = (n: string): string => new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`).exec(global())?.[1] ?? '';
const analisis = () => /<section id="analisis"[\s\S]*?<section id="eventos"/.exec(html())?.[0] ?? '';
const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

// ---------- lógica pura: chips ----------
test('partirResumen: separa por « · » (el formato de resumen() de filtros.ts), recorta y no inventa nada', () => {
  assert.deepEqual(partirResumen('últimas 24 h · magnitud ≥ 4.5 · país Chile'), ['últimas 24 h', 'magnitud ≥ 4.5', 'país Chile']);
  assert.deepEqual(partirResumen('últimas 24 h'), ['últimas 24 h']);                              // sin separador: un único chip
  assert.deepEqual(partirResumen('  toda la ejecución  '), ['toda la ejecución']);
  const real = resumen({ preajuste: 'ultimos-7d', magMin: '5', pais: 'cl' } as never, { CL: 'Chile' });   // la salida real de filtros.ts se parte en sus partes
  assert.deepEqual(partirResumen(real), real.split(' · '));
});

test('partirResumen: vacío, nulo o con partes vacías → [] o un único chip con el texto íntegro (no fiable)', () => {
  for (const v of ['', '   ', null, undefined]) assert.deepEqual(partirResumen(v), [], String(v));
  assert.deepEqual(partirResumen('a ·  · b'), ['a ·  · b']);
  assert.deepEqual(partirResumen('a · b ·'), ['a · b ·']);
});

test('filtros-activos: misma API (entradas y salida `cambiar`), chips, periodo en mono, enlace real «Cambiar filtros» ≥ 36 px y marca violeta en REPRODUCCIÓN', () => {
  const f = app('filtros-activos/filtros-activos.component.ts');
  assert.match(f, /readonly resumen = input<string>\(''\)/); assert.match(f, /readonly periodo = input<string>\('Sin consulta'\)/); assert.match(f, /readonly etiqueta = input<string \| null>\(null\)/);
  assert.match(f, /readonly cambiar = output<void>\(\)/);
  assert.match(f, /<a href="#\/panel" class="enlace" \(click\)="\$event\.preventDefault\(\); cambiar\.emit\(\)">Cambiar filtros<\/a>/);
  assert.match(f, /partirResumen\(this\.resumen\(\)\)/); assert.match(f, /@for \(c of chips\(\); track \$index\)/); assert.match(f, /sin consulta/);
  assert.match(f, /<span class="periodo mono">\{\{ periodo\(\) \}\}<\/span>/);
  assert.match(f, /\.enlace \{[^}]*min-height: 36px/);
  assert.match(f, /\.franja\.replay \{ border-left: 3px solid var\(--replay\)/); assert.match(f, /<strong class="etiqueta-replay">\{\{ e \}\}<\/strong>/);
  assert.doesNotMatch(f, /aria-live|role="status"|transition|localStorage|innerHTML/);
});

// ---------- lógica pura: color de profundidad por intervalo ----------
test('colorIntervaloProfundidad: usa el límite inferior y colorea SOLO si el intervalo completo cae en un rango (mismos hex que colorProfundidad)', () => {
  assert.equal(colorIntervaloProfundidad(0, 10), COLOR_SOMERA);
  assert.equal(colorIntervaloProfundidad(null, 10), COLOR_SOMERA);                // «< 10»: abierto por debajo
  assert.equal(colorIntervaloProfundidad(30, 70), COLOR_SOMERA);                  // llega justo al corte (70 es exclusivo): sigue siendo somera
  assert.equal(colorIntervaloProfundidad(50, 100), COLOR_NEUTRO);                 // atraviesa el corte de 70 → neutro, no se inventa clase
  assert.equal(colorIntervaloProfundidad(70, 100), COLOR_MEDIA);
  assert.equal(colorIntervaloProfundidad(70, 150), COLOR_MEDIA);
  assert.equal(colorIntervaloProfundidad(150, 300), COLOR_MEDIA);                 // llega justo al corte de 300 (exclusivo)
  assert.equal(colorIntervaloProfundidad(250, 400), COLOR_NEUTRO);                // atraviesa 300
  assert.equal(colorIntervaloProfundidad(300, 500), COLOR_PROFUNDA);
  assert.equal(colorIntervaloProfundidad(500, null), COLOR_PROFUNDA);             // «≥ 500»
  assert.equal(colorIntervaloProfundidad(70, null), COLOR_NEUTRO);                // abierto por arriba desde 70: cruza 300
  for (const malo of [[NaN, 10], [0, NaN], [Infinity, 10], ['a', 10], [undefined, 10], [null, null]] as const) assert.equal(colorIntervaloProfundidad(malo[0], malo[1]), COLOR_NEUTRO, String(malo));
});

test('los intervalos reales del backend (BORDES_PROFUNDIDAD 10, 30, 70, 150, 300, 500) se alinean con los cortes: ninguno queda en neutro', () => {
  const be = readFileSync(new URL('../../backend/src/observatorio/api/estadisticas.py', import.meta.url), 'utf8');
  assert.match(be, /BORDES_PROFUNDIDAD = \(10, 30, 70, 150, 300, 500\)/);          // si el backend cambia los bordes, este test avisa de que hay que revisar el color
  const bordes = [10, 30, 70, 150, 300, 500];
  const intervalos: Array<[number | null, number | null]> = [[null, 10], ...bordes.slice(0, -1).map((b, i) => [b, bordes[i + 1]] as [number, number]), [500, null]];
  assert.deepEqual(intervalos.map(([d, h]) => colorIntervaloProfundidad(d, h)), [COLOR_SOMERA, COLOR_SOMERA, COLOR_SOMERA, COLOR_MEDIA, COLOR_MEDIA, COLOR_PROFUNDA, COLOR_PROFUNDA]);
});

test('colorDeProfundidad y los hex de la leyenda coinciden con colorProfundidad (formato.ts) y con la leyenda del mapa', () => {
  for (const p of [-5, 0, 10, 69.99, 70, 150, 299.99, 300, 700, null, undefined, NaN, Infinity, 'x']) assert.equal(colorDeProfundidad(p), colorProfundidad(p), String(p));
  assert.deepEqual(LEYENDA_PROFUNDIDAD.map((l) => l.texto), ['Menos de 70 km', '70–299,99 km', '300 km o más']);
  for (const t of LEYENDA_PROFUNDIDAD.map((l) => l.texto)) assert.ok(html().includes(t), t);                // mismos textos que la leyenda del mapa
  for (const c of [COLOR_SOMERA, COLOR_MEDIA, COLOR_PROFUNDA]) assert.ok(css().includes(c));              // y mismos hex que los puntos de la leyenda
});

test('leyendaDeColores: solo hay leyenda con colores por rango; «Sin clasificar» solo si alguna barra quedó neutra', () => {
  assert.deepEqual(leyendaDeColores(null), []); assert.deepEqual(leyendaDeColores([]), []);
  assert.deepEqual(leyendaDeColores([COLOR_NEUTRO, COLOR_NEUTRO]), []);                                     // todo neutro: nada que explicar
  assert.equal(leyendaDeColores([COLOR_SOMERA, COLOR_MEDIA, COLOR_PROFUNDA]).length, 3);
  const con = leyendaDeColores([COLOR_SOMERA, COLOR_NEUTRO]);
  assert.equal(con.length, 4); assert.equal(con[3].color, COLOR_NEUTRO); assert.match(con[3].texto, /cruza un corte/);
});

// ---------- plantilla: cabecera, composición y orden ----------
test('Análisis: orden DOM resumen → hero → país → magnitud → profundidad → comparación → metodología; #analisis, h2 con foco y aria-labelledby intactos', () => {
  const a = analisis();
  assert.match(a, /<section id="analisis" class="vista-seccion analisis" aria-labelledby="analisis-titulo" \[hidden\]="vista\(\) !== 'analisis'">/);
  assert.match(a, /<h2 id="analisis-titulo" class="seccion-titulo encabezado-vista" tabindex="-1">Análisis del periodo consultado<\/h2>/);
  const i = (s: string) => a.indexOf(s);
  const orden = ['id="analisis-titulo"', '<div class="resumen-analisis">', '<app-filtros-activos', 'class="calculo"', '<div class="graficas">', 'idBase="g-hora"', 'idBase="g-pais"', 'idBase="g-mag"', 'idBase="g-prof"', '<app-comparacion', 'id="metodologia"'].map(i);
  assert.ok(orden.every((n) => n >= 0), String(orden)); assert.deepEqual([...orden].sort((x, y) => x - y), orden);
  assert.match(a, /<app-filtros-activos \[resumen\]="resumenFiltros\(\)" \[periodo\]="periodo\(\)" \[etiqueta\]="etiquetaVista\(\)" \(cambiar\)="cambiarFiltros\(\)" \/>/);   // misma API
});

test('línea de alcance: dice con exactitud que las gráficas las calcula la API sobre el periodo completo y solo usa datos ya disponibles (est.total, textoCargados)', () => {
  const a = analisis();
  assert.match(a, /<p class="calculo">Las gráficas las calcula la API sobre el periodo completo \(<span class="mono">\{\{ est\.total \}\}<\/span> eventos\), no solo sobre los cargados\. En este navegador: \{\{ textoCargados\(\) \}\}\.<\/p>/);
  assert.match(app('app.component.ts'), /textoCargados = computed\(\(\) => textoCargadosDelPeriodo\(this\.eventos\(\)\.length, this\.total\(\)\)\)/);
});

test('composición: una columna <1100 px de contenedor; ≥1100 hero a ancho completo, país 5/12 en dos filas y magnitud sobre profundidad 7/12 (container query de .analisis)', () => {
  const c = css();
  assert.match(c, /\.analisis \{[^}]*container-type: inline-size/);
  assert.match(c, /\.graficas \{ display: grid; grid-template-columns: minmax\(0, 1fr\);/);
  const bloque = /@container \(min-width: 1100px\) \{\s*\.graficas[\s\S]*?\n\}/.exec(c)?.[0] ?? '';
  // CAMBIO (análisis A): 5fr/7fr con país a dos filas → 10 pistas: hora 6 | país 4 (fila 1) y magnitud 5 | profundidad 5 (fila 2). Misma intención (container query de 1100 px), alturas equilibradas; sin grid-row.
  assert.match(bloque, /\.graficas \{ grid-template-columns: repeat\(10, minmax\(0, 1fr\)\); \}/);
  assert.match(bloque, /\.g-hero \{ grid-column: span 6; \}/); assert.match(bloque, /\.g-pais \{ grid-column: span 4; \}/);
  assert.match(bloque, /\.g-mag, \.g-prof \{ grid-column: span 5; \}/); assert.doesNotMatch(bloque, /grid-row/);
  const a = analisis();
  for (const [clase, id, formato] of [['g-hero', 'g-hora', 'hero'], ['g-pais', 'g-pais', 'columna'], ['g-mag', 'g-mag', ''], ['g-prof', 'g-prof', '']]) {
    assert.match(a, new RegExp(`<app-barras class="${clase}" idBase="${id}"${formato ? ` formato="${formato}"` : ''}`), clase);
  }
  assert.match(a, /\[cifra\]="est\.total"/);                                                                  // cifra discreta del hero: dato que ya existe
  assert.match(a, /tono="magnitud"/); assert.match(a, /\[colores\]="coloresProfundidad\(\)"/);
  assert.match(app('app.component.ts'), /coloresProfundidad = computed\(\(\) => \{ const e = this\.estadisticas\(\); return e \? e\.profundidad\.items\.map\(\(i\) => colorIntervaloProfundidad\(i\.from, i\.to\)\) : null; \}\);/);
  assert.match(c, /\.graficas \{[^}]*min-width|min-width: 0/);                                               // los hijos de la rejilla no la ensanchan
});

test('las cuatro gráficas conservan título, descripción, nulos, omisión por ventana y su tabla alternativa', () => {
  const a = analisis();
  for (const t of ["rotular('Terremotos por hora UTC')", "rotular('Terremotos por país')", "rotular('Distribución de la magnitud')", "rotular('Distribución de la profundidad (km)')"]) assert.ok(a.includes(t), t);
  for (const d of ['las horas sin eventos valen 0', '«Sin país asignado» es una categoría propia', 'Los eventos sin magnitud se cuentan aparte', 'Los eventos sin profundidad se cuentan aparte']) assert.ok(a.includes(d), d);
  for (const s of ['est.por_hora.sin_valor', 'est.por_pais.sin_valor', 'est.magnitud.sin_valor', 'est.profundidad.sin_valor', '[omitido]="omitidoHora()"']) assert.ok(a.includes(s), s);
  const b = app('graficas/barras.component.ts');
  assert.match(b, /Registros sin valor \(no se cuentan en las barras\)/); assert.match(b, /<summary>Ver los datos como tabla<\/summary>/); assert.match(b, /<th scope="col">Categoría<\/th>/);
  assert.match(b, /@else if \(total\(\) === 0\)/); assert.match(b, /Sin eventos para estos filtros\./);
  assert.match(b, /\[attr\.aria-labelledby\]="idBase\(\) \+ '-t ' \+ idBase\(\) \+ '-d'"/);
});

// ---------- gráficas sin caja, descripción accesible, color y leyenda ----------
test('gráficas SIN caja: ni borde completo, ni fondo, ni sombra, ni .panel-ui; solo una línea fina superior (--linea)', () => {
  const b = app('graficas/barras.component.ts');
  const regla = /\.grafica \{[^}]*\}/.exec(b)?.[0] ?? '';
  assert.match(regla, /border-top: 1px solid var\(--linea\)/);
  assert.doesNotMatch(regla, /background|box-shadow|border-left|border-radius|border: /);
  assert.doesNotMatch(b, /panel-ui/);
  assert.match(b, /class="titulo etiqueta-ui"/);                                                              // título en versalitas + subtítulo pequeño
  assert.match(b, /<span class="sub">\{\{ subtitulo\(\) \}\}<\/span>/);
});

test('«Cómo se calcula»: <details> nativo cerrado por defecto, con icono de información, texto completo en el DOM y SVG asociado por aria-labelledby', () => {
  const b = app('graficas/barras.component.ts');
  const det = /<details class="como">[\s\S]*?<\/details>/.exec(b)?.[0] ?? '';
  assert.doesNotMatch(det, /\bopen\b/);                                                                       // cerrado por defecto
  assert.match(det, /<app-icono nombre="info" class="ico" \/> Cómo se calcula/);
  assert.match(det, /<span class="desc" \[id\]="idBase\(\) \+ '-d'">\{\{ descripcion\(\) \}\}<\/span>/);      // el texto completo sigue ahí
  assert.match(b, /<desc>\{\{ descripcion\(\) \}\}<\/desc>/);
  assert.match(b, /\.como summary \{[^}]*min-height: 24px/);
});

test('color de las barras: tokens (sin hex sueltos), degradado vertical por gradiente SVG, magnitud en otro tono; la profundidad usa colores por rango y borde claro', () => {
  const b = app('graficas/barras.component.ts');
  assert.doesNotMatch(sinComentarios(b), /#[0-9a-fA-F]{3,6}\b/);                                            // ningún hex suelto: todo viene de tokens o de graficas-color.ts
  assert.match(b, /<linearGradient \[id\]="idBase\(\) \+ '-g'" x1="0" y1="0" x2="0" y2="1">/);
  assert.match(b, /:host \{ --barra-a: var\(--acento\); --barra-b: var\(--barra-cian-b\); \}/);
  assert.match(b, /\.tono-mag \{ --barra-a: var\(--barra-mag-a\); --barra-b: var\(--barra-mag-b\); \}/);
  assert.match(b, /\[attr\.fill\]="relleno\(i\)"/); assert.match(b, /relleno\(i: number\): string \{ return this\.colores\(\)\?\.\[i\] \?\? `url\(#\$\{this\.idBase\(\)\}-g\)`; \}/);
  assert.match(b, /\.barra-rango \{ stroke: var\(--punto-borde\)/);
  assert.notEqual(token('barra-mag-a'), token('acento'));
});

test('leyenda en línea: solo si hay colores por rango (@if leyenda().length > 0), con texto y punto decorativo (el color no es el único canal)', () => {
  const b = app('graficas/barras.component.ts');
  assert.match(b, /@if \(leyenda\(\)\.length > 0\) \{\s*<ul class="leyenda-linea" aria-label="Leyenda de colores de la gráfica">/);
  assert.match(b, /<span class="sw" \[style\.background\]="l\.color" aria-hidden="true"><\/span>\{\{ l\.texto \}\}/);
  assert.match(b, /leyenda = computed\(\(\) => leyendaDeColores\(this\.colores\(\)\)\)/);
  const a = analisis();
  assert.equal((a.match(/\[colores\]=/g) ?? []).length, 1);                                                   // solo la profundidad pasa colores
});

test('legibilidad: texto del SVG de 12 px con ancho mínimo por formato (≥ 10,5 px efectivos) y números tabulares', () => {
  const b = app('graficas/barras.component.ts');
  const m = /const ANCHO: Record<Formato, number> = \{ estandar: (\d+), hero: (\d+), columna: (\d+) \};\s*const MIN_ANCHO: Record<Formato, number> = \{ estandar: (\d+), hero: (\d+), columna: (\d+) \};/.exec(b);
  assert.ok(m);
  const [anE, anH, anC, miE, miH, miC] = m!.slice(1).map(Number);
  for (const [an, mi] of [[anE, miE], [anH, miH], [anC, miC]]) assert.ok(12 * mi / an >= 10.5, `${an}/${mi}`);
  assert.match(b, /class="eje num"/); assert.match(b, /class="valor num"/);
  // CAMBIO (análisis A): con 10 pistas y hueco de 24 px, a 1100 px caben sin desplazamiento: hora (6 pistas), país (4) y magnitud/profundidad (5 pistas cada una)
  const pista = (1100 - 9 * 24) / 10;
  assert.ok(6 * pista + 5 * 24 >= miH); assert.ok(4 * pista + 3 * 24 >= miC); assert.ok(5 * pista + 4 * 24 >= miE);
  // CAMBIO (análisis A): el lienzo ya no es tab stop (tabindex 0 + role=region): el tab stop es la barra activa; el scroll horizontal sigue SOLO dentro del lienzo.
  assert.match(b, /\.lienzo \{ overflow-x: auto; \}/); assert.doesNotMatch(b, /class="lienzo" tabindex/);
});

// ---------- comparación como banda ----------
test('comparación: banda de ancho completo con fondo propio (--banda-fondo) y filo superior; datos, tabla y avisos obligatorios intactos', () => {
  const c = app('comparacion/comparacion.component.ts');
  assert.match(c, /<section class="banda" aria-labelledby="cmp-titulo">/); assert.match(c, /<h2 id="cmp-titulo">Comparación con el histórico de 2025<\/h2>/);
  assert.match(c, /\.banda \{[^}]*background: var\(--banda-fondo\)/); assert.match(c, /\.banda::before \{[^}]*background: var\(--filo\)/);
  assert.doesNotMatch(/\.banda \{[^}]*\}/.exec(c)?.[0] ?? '', /border-radius|border-left/);
  for (const t of ['Ámbito: {{ ambito() }} · Magnitud mínima efectiva: {{ datos().min_mag_efectiva }}', '<caption class="oculto">Cifras de la comparación con su fuente</caption>', '@for (f of filas(); track f.concepto)', '{{ f.valor }}', '{{ f.fuente }}',
    'Periodo reciente posiblemente incompleto.', '@for (m of avisos().motivos; track m)', 'Esta diferencia no demuestra por sí sola un cambio real de actividad.', '{{ aviso }}', 'avisos().coberturaBaja', 'avisos().magnitudElevada', 'avisos().noDisponible', 'No es una predicción ni una evaluación de riesgo.']) assert.ok(c.includes(t), t);
  assert.match(c, /td:nth-child\(2\) \{[^}]*font-family: var\(--fuente-mono\)/);                              // cifras en mono
  assert.match(c, /readonly filas = computed\(\(\) => filasComparacion\(this\.datos\(\)\)\)/);                // cálculos y entradas sin cambios
  assert.match(c, /readonly datos = input\.required<Comparacion>\(\)/); assert.match(c, /readonly nombrePais = input<string \| undefined>\(undefined\)/);
  assert.doesNotMatch(c, /transition|localStorage|innerHTML|aria-live/);
  // el fondo de la banda se distingue de la superficie y del fondo de página, y el texto se lee sobre él
  const banda = token('banda-fondo');
  assert.ok(banda !== '' && banda.toLowerCase() !== token('superficie-1').toLowerCase() && banda.toLowerCase() !== token('fondo').toLowerCase());
  for (const n of ['texto', 'texto-2', 'acento-texto']) assert.ok(razonContraste(token(n), banda) >= 4.5, `${n} sobre la banda`);
});

test('comparación en REPRODUCCIÓN: «no aplica» como banda del mismo ancho, con el tratamiento violeta y su aviso en una región status', () => {
  const a = analisis();
  assert.match(a, /\} @else if \(esReplay\(\)\) \{ <section class="no-aplica banda-replay" aria-label="Comparación con el histórico de 2025"><h2>Comparación con el histórico de 2025<\/h2><p role="status">\{\{ avisoNoAplica \}\}<\/p><\/section> \}|@else if \(esReplay\(\)\) \{ <section class="no-aplica banda-replay"/);
  const regla = /\.no-aplica \{[^}]*\}/.exec(css())?.[0] ?? '';
  assert.match(regla, /background: var\(--replay-fondo\)/); assert.match(regla, /border-top: 1px solid var\(--replay\)/); assert.doesNotMatch(regla, /border-radius/);
  assert.match(css(), /\.no-aplica::before \{[^}]*var\(--filo-replay\)/);
  assert.match(analisis(), /@if \(comparacionVivo\(\); as cmp\) \{ <app-comparacion \[datos\]="cmp" \[nombrePais\]="nombrePaisActual\(\)" \/> \}/);
});

// ---------- metodología y estado ----------
test('metodología: <details> CONTRAÍDO por defecto (señal en memoria; Fase 1), h2 #metodologia-titulo dentro del summary, app-estado completo y notas en <dl>', () => {
  const a = analisis();
  assert.match(a, /<section id="metodologia" class="metodologia" aria-labelledby="metodologia-titulo">/);
  assert.match(a, /<details class="metodo" \[open\]="metodologiaAbierta\(\)" \(toggle\)="metodologiaAbierta\.set\(\$any\(\$event\.target\)\.open\)">/);
  assert.match(app('app.component.ts'), /readonly metodologiaAbierta = signal\(false\);/);                     // contraído por defecto (Fase 1), sin almacenamiento; «Ver detalle» y «Cargar el resto» la abren
  assert.match(a, /<summary class="metodo-resumen">\s*<h2 id="metodologia-titulo" class="subseccion-titulo" tabindex="-1" data-ancla>Metodología y estado del sistema<\/h2>/);
  assert.match(a, /<app-icono nombre="chevron" class="metodo-chevron" \/>/);
  assert.match(a, /@if \(esApi\(\)\) \{ <app-estado class="o-estado" \[entrada\]="entradaEstado\(\)" \[ultimoAcceso\]="ultimoAcceso\(\)" \[periodo\]="periodo\(\)" \[filtros\]="resumenFiltros\(\)" \[cargandoResto\]="cargandoResto\(\)" \[ejecucion\]="ejecucion\(\)" \(cargarResto\)="cargarResto\(\)" \/> \}/);
  assert.match(a, /<dl class="metodo-notas">/); assert.match(a, /<dt>Contador cruzado del periodo consultado<\/dt>/);
  for (const t of ['dibujados', 'tabla: {{ eventos().length }}', 'estadísticas: {{ est.total }}', "total de la API: {{ total() ?? 'ND' }}", 'Difieren porque llegaron o se revisaron eventos', 'sin coordenadas válidas solo aparecen en la tabla']) assert.ok(a.includes(t), t);
  assert.ok(a.indexOf('<app-estado ') < a.indexOf('<dl class="metodo-notas">'));                              // estado primero, notas después (orden de lectura)
  assert.match(app('app.component.ts'), /verMetodologia\(\): void \{ this\.metodologiaAbierta\.set\(true\);/);   // «Ir a Cargar el resto» reabre la sección
});

test('metodología a dos columnas desde 1100 px (container query), sin cajas anidadas y con el chevron girado solo con transform (sin animación)', () => {
  const c = css();
  assert.match(c, /\.metodo-cuerpo \{ display: grid; grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(c, /@container \(min-width: 1100px\) \{ \.metodo-cuerpo \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\); \} \}/);
  assert.match(c, /\.metodo-resumen \{[^}]*min-height: 36px/); assert.match(c, /\.metodo-resumen:focus-visible \{ outline: 3px solid var\(--foco\)/);
  assert.match(c, /\.metodo\[open\] \.metodo-chevron \{ transform: rotate\(180deg\); \}/);
  assert.doesNotMatch(/\.metodologia \{[^}]*\}/.exec(c)?.[0] ?? '', /background|box-shadow|border-radius|border: /);
  assert.doesNotMatch(/\.metodo-notas > div \{[^}]*\}/.exec(c)?.[0] ?? '', /background|box-shadow|border-radius/);
  const e = app('estado/estado.component.ts');
  assert.doesNotMatch(/\.estado \{[^}]*\}/.exec(e)?.[0] ?? '', /background|border|box-shadow/);                 // app-estado ya no es otra caja dentro de la sección
  assert.match(e, /minmax\(min\(280px, 100%\), 1fr\)/); assert.match(e, /Cargar el resto de eventos/);       // sus datos y su botón siguen
});

// ---------- transversales ----------
test('una sola región viva por componente: sin aria-live nuevos; los role="status" de barras y comparación son los de antes (ramas excluyentes)', () => {
  assert.equal((app('graficas/barras.component.ts').match(/aria-live/g) ?? []).length, 0);
  assert.equal((app('graficas/barras.component.ts').match(/role="status"/g) ?? []).length, 2);                // «omitida/ventana» o «sin eventos»: nunca a la vez
  assert.equal((app('comparacion/comparacion.component.ts').match(/aria-live/g) ?? []).length, 0);
  assert.equal((app('comparacion/comparacion.component.ts').match(/role="status"/g) ?? []).length, 2);
  assert.equal((app('filtros-activos/filtros-activos.component.ts').match(/aria-live|role="status"/g) ?? []).length, 0);
  assert.equal((html().match(/aria-live="polite"/g) ?? []).length, 2);                                        // anuncio de modo/vista y de leyenda, como en la ronda 2
});

test('sin `transition`, animaciones ni almacenamiento en lo tocado; sin backdrop-filter; sin recursos externos', () => {
  // CAMBIO (análisis A): barras.component.ts sale de este bucle porque ahora SÍ tiene `transition` (resaltado de barra y fundido del tooltip), pero solo bajo `prefers-reduced-motion: no-preference`; el resto de prohibiciones se mantienen para él (ver tests/analisis-a.test.ts).
  assert.doesNotMatch(app('graficas/barras.component.ts'), /animation|@keyframes|backdrop-filter|localStorage|sessionStorage|document\.cookie|indexedDB|innerHTML|https?:\/\//);
  for (const r of ['app.component.html', 'app.component.css', 'comparacion/comparacion.component.ts', 'filtros-activos/filtros-activos.component.ts', 'estado/estado.component.ts', 'graficas-color.ts', 'chips-filtros.ts']) {
    const t = app(r);
    assert.doesNotMatch(t, /transition|animation|@keyframes|backdrop-filter|localStorage|sessionStorage|document\.cookie|indexedDB|innerHTML|https?:\/\//, r);
  }
});

test('tokens nuevos: las barras tienen contraste ≥ 3:1 (WCAG 1.4.11) frente al fondo y al escenario; el gris neutro y el borde claro también', () => {
  for (const n of ['acento', 'barra-cian-b', 'barra-mag-a', 'barra-mag-b']) {
    assert.ok(razonContraste(token(n), token('fondo')) >= 3, `${n} sobre --fondo`);
    assert.ok(razonContraste(token(n), token('escenario')) >= 3, `${n} sobre --escenario`);
  }
  assert.ok(razonContraste(token('punto-borde'), token('fondo')) >= 3);                                      // borde claro de las barras por rango
  assert.ok(razonContraste(COLOR_NEUTRO, token('fondo')) >= 3);
  assert.notEqual(token('barra-mag-a').toLowerCase(), token('acento').toLowerCase());
});

test('estilo: la hoja del Análisis usa tokens existentes, líneas finas y títulos con scroll-margin (global); etiquetas ≥ 11 px salvo versalitas --t-2xs', () => {
  const c = css();
  assert.match(c, /\.analisis > \.encabezado-vista \{[^}]*font-size: var\(--t-xl\)/);
  assert.match(global(), /:target, \[data-ancla\], #tabla-titulo, \.encabezado-vista \{ scroll-margin-top: calc\(var\(--alto-cabecera\) \+ var\(--esp-3\)\); \}/);
  assert.doesNotMatch(/\.graficas \{[^}]*\}/.exec(c)?.[0] ?? '', /border|background/);
  assert.match(c, /\.metodologia \{[^}]*border-top: 1px solid var\(--linea\)/);
});
