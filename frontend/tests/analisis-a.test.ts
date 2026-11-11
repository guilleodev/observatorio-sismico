// F7, vista Análisis, ITERACIÓN A: tooltips interactivos, eje temporal de «por hora UTC» y rejilla equilibrada. `node --test tests/*.test.ts`
// Lógica pura (posicionarTooltip, indiceSiguiente, contenidoTooltip, ticksEjeTemporal, rangoDeColor) + estructura de la plantilla y del CSS de barras.component.ts y app.component.css.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contenidoTooltip, indiceSiguiente, parsearIntervalo, posicionarTooltip, rangoHoraCompleto } from '../src/app/graficas-tooltip.ts';
import { MESES_ES, SEPARACION_MIN, fechaCorta, periodoUtc, ticksEjeTemporal } from '../src/app/graficas-eje.ts';
import { COLOR_MEDIA, COLOR_NEUTRO, COLOR_PROFUNDA, COLOR_SOMERA, rangoDeColor } from '../src/app/graficas-color.ts';
import { razonContraste } from '../src/app/formato.ts';

const app = (r: string) => readFileSync(new URL(`../src/app/${r}`, import.meta.url), 'utf8');
const global = () => readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const barras = () => app('graficas/barras.component.ts');
const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
const token = (n: string): string => new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`).exec(global())?.[1] ?? '';
const serie = (inicioISO: string, n: number) => Array.from({ length: n }, (_, i) => ({ detalle: new Date(Date.parse(inicioISO) + i * 3600_000).toISOString() }));

// ---------- posicionarTooltip ----------
const CONT = { ancho: 400, alto: 200 };
const TAM = { ancho: 100, alto: 60 };

test('posicionarTooltip: centrado sobre la barra y por ENCIMA si cabe', () => {
  assert.deepEqual(posicionarTooltip({ x: 200, y: 100, ancho: 20, alto: 0 }, TAM, CONT, 8), { x: 160, y: 32, lado: 'arriba' });
});

test('posicionarTooltip: extremos izquierdo y derecho se acotan (primera/última barra, borde de la ventana)', () => {
  assert.equal(posicionarTooltip({ x: 0, y: 100, ancho: 10, alto: 0 }, TAM, CONT, 8).x, 0);
  assert.equal(posicionarTooltip({ x: 390, y: 100, ancho: 10, alto: 0 }, TAM, CONT, 8).x, 300);   // 400 − 100
});

test('posicionarTooltip: sin sitio arriba va DEBAJO; si tampoco cabe, arriba acotado a 0 (nunca coordenadas negativas)', () => {
  assert.deepEqual(posicionarTooltip({ x: 200, y: 20, ancho: 20, alto: 0 }, TAM, CONT, 8), { x: 160, y: 28, lado: 'abajo' });
  const p = posicionarTooltip({ x: 200, y: 30, ancho: 20, alto: 0 }, TAM, { ancho: 400, alto: 80 }, 8);
  assert.equal(p.y, 0); assert.equal(p.lado, 'arriba');
});

test('posicionarTooltip: tooltip más ancho/alto que el contenedor o contenedor diminuto (320 px) → alineado a 0, sin negativos', () => {
  assert.equal(posicionarTooltip({ x: 150, y: 100, ancho: 20, alto: 0 }, { ancho: 500, alto: 60 }, CONT, 8).x, 0);
  assert.deepEqual(posicionarTooltip({ x: 10, y: 10, ancho: 5, alto: 0 }, TAM, { ancho: 50, alto: 30 }, 8), { x: 0, y: 0, lado: 'arriba' });
});

test('posicionarTooltip: preferencia «derecha» (barras horizontales): a la derecha, si no a la izquierda, y si no cabe ninguno cae a arriba/abajo', () => {
  assert.deepEqual(posicionarTooltip({ x: 100, y: 50, ancho: 40, alto: 20 }, TAM, CONT, 8, 'derecha'), { x: 148, y: 30, lado: 'derecha' });
  assert.deepEqual(posicionarTooltip({ x: 340, y: 50, ancho: 40, alto: 20 }, TAM, CONT, 8, 'derecha'), { x: 232, y: 30, lado: 'izquierda' });
  const p = posicionarTooltip({ x: 40, y: 100, ancho: 60, alto: 20 }, TAM, { ancho: 150, alto: 200 }, 8, 'derecha');
  assert.ok(p.lado === 'arriba' || p.lado === 'abajo');
});

test('posicionarTooltip: barrido de anclas — el resultado nunca sale del contenedor cuando el tooltip cabe en él', () => {
  for (const pref of ['arriba', 'derecha'] as const) {
    for (let x = -20; x <= 420; x += 20) for (let y = -10; y <= 210; y += 20) {
      const p = posicionarTooltip({ x, y, ancho: 12, alto: pref === 'derecha' ? 18 : 0 }, TAM, CONT, 8, pref);
      assert.ok(p.x >= 0 && p.y >= 0 && p.x + TAM.ancho <= CONT.ancho && p.y + TAM.alto <= CONT.alto, `${pref} ${x},${y} → ${p.x},${p.y}`);
    }
  }
});

// ---------- teclado ----------
test('indiceSiguiente: ← → en vertical, ↑ ↓ en horizontal, Inicio/Fin, límites sin vuelta y vacío', () => {
  assert.equal(indiceSiguiente(3, 10, 'ArrowRight', false), 4); assert.equal(indiceSiguiente(3, 10, 'ArrowLeft', false), 2);
  assert.equal(indiceSiguiente(3, 10, 'ArrowDown', true), 4); assert.equal(indiceSiguiente(3, 10, 'ArrowUp', true), 2);
  assert.equal(indiceSiguiente(3, 10, 'ArrowDown', false), null); assert.equal(indiceSiguiente(3, 10, 'ArrowRight', true), null);   // la otra pareja no navega
  assert.equal(indiceSiguiente(9, 10, 'ArrowRight', false), 9); assert.equal(indiceSiguiente(0, 10, 'ArrowLeft', false), 0);
  assert.equal(indiceSiguiente(5, 10, 'Home', false), 0); assert.equal(indiceSiguiente(5, 10, 'End', true), 9);
  assert.equal(indiceSiguiente(null, 10, 'ArrowRight', false), 1); assert.equal(indiceSiguiente(2, 0, 'Home', false), null);
  assert.equal(indiceSiguiente(2, 10, 'a', false), null); assert.equal(indiceSiguiente(2, 10, 'Tab', false), null);
  assert.equal(indiceSiguiente(99, 10, 'ArrowLeft', false), 8);                                                                   // índice obsoleto: se acota
});

// ---------- contenido por gráfica ----------
test('contenidoTooltip «hora»: fecha y rango completos en UTC + % derivable del total contado', () => {
  const c = contenidoTooltip('hora', { etiqueta: '10/11 09h', valor: 27, detalle: '2026-11-10T09:00:00.000Z' }, { total: 100 });
  // CAMBIO (análisis B): el titular ya no es la etiqueta antigua «10/11 09h» sino «10 nov · 09:00–10:00 UTC»; la línea de contexto lleva el día completo con año (sin repetir el rango).
  assert.equal(c.categoria, '10 nov · 09:00–10:00 UTC'); assert.equal(c.valor, '27'); assert.equal(c.unidad, 'eventos');
  assert.equal(c.contexto[0], 'Fecha UTC: 10/11/2026');
  assert.equal(c.contexto[1], '27,0 % del total contado en esta gráfica');
  assert.match(c.texto, /^10 nov · 09:00–10:00 UTC: 27 eventos\. Fecha UTC: 10\/11\/2026\. 27,0 %/);
  assert.doesNotMatch(c.texto, /09h/);
  assert.equal(contenidoTooltip('hora', { etiqueta: '10/11 09h', valor: 1, detalle: 'no es fecha' }).categoria, '10/11 09h');   // sin ISO válido se conserva la etiqueta
  assert.equal(rangoHoraCompleto('2026-12-31T23:00:00.000Z'), '31/12/2026 · 23:00–00:00 UTC');          // la ventana de las 23 termina a las 00:00
});

test('contenidoTooltip: ND si falta el dato (etiqueta, valor, fecha) y sin porcentaje si el total no sirve', () => {
  const c = contenidoTooltip('hora', { etiqueta: '', valor: NaN }, { total: 0 });
  assert.equal(c.categoria, 'ND'); assert.equal(c.valor, 'ND'); assert.equal(c.contexto[0], 'Fecha y hora UTC: ND'); assert.equal(c.contexto.length, 1);
  assert.equal(rangoHoraCompleto(undefined), null); assert.equal(rangoHoraCompleto('no es una fecha'), null);
});

test('contenidoTooltip «país»: nombre y eventos; «Sin país asignado» y «Otros» con su nota; el resto, su código', () => {
  const sin = contenidoTooltip('pais', { etiqueta: 'Sin país asignado', valor: 5, detalle: 'sin_pais' });
  assert.equal(sin.categoria, 'Sin país asignado'); assert.match(sin.contexto[0], /mar o sin polígono/);
  assert.match(contenidoTooltip('pais', { etiqueta: 'Otros (4 países)', valor: 9 }).contexto[0], /Suma de los países/);
  assert.equal(contenidoTooltip('pais', { etiqueta: 'Chile', valor: 12, detalle: 'CL' }).contexto[0], 'Código de país: CL');
  assert.equal(contenidoTooltip('pais', { etiqueta: 'Chile', valor: 12 }).contexto.length, 0);
});

test('contenidoTooltip «magnitud»: intervalo con la notación de etiquetaIntervalo y extremos abiertos', () => {
  assert.deepEqual(contenidoTooltip('magnitud', { etiqueta: '2–3', valor: 4 }).contexto, ['Intervalo [2 – 3)']);
  assert.equal(contenidoTooltip('magnitud', { etiqueta: '2–3', valor: 4 }).categoria, 'Magnitud 2–3');
  assert.deepEqual(contenidoTooltip('magnitud', { etiqueta: '< 2', valor: 4 }).contexto, ['Menos de 2']);
  assert.deepEqual(contenidoTooltip('magnitud', { etiqueta: '≥ 7', valor: 1 }).contexto, ['7 o más']);
  assert.deepEqual(contenidoTooltip('magnitud', { etiqueta: 'raro', valor: 1 }).contexto, ['Intervalo: ND']);   // no se adivina
});

test('contenidoTooltip «profundidad»: intervalo en km, rango de la leyenda y punto de color; si cruza un corte, sin rango', () => {
  const s = contenidoTooltip('profundidad', { etiqueta: '10–30', valor: 8 }, { color: COLOR_SOMERA, rango: rangoDeColor(COLOR_SOMERA) });
  assert.equal(s.categoria, 'Profundidad 10–30 km'); assert.deepEqual(s.contexto.slice(0, 2), ['Intervalo [10 – 30) km', 'Rango: Menos de 70 km']); assert.equal(s.color, COLOR_SOMERA);
  assert.equal(contenidoTooltip('profundidad', { etiqueta: '≥ 500', valor: 1 }, { color: COLOR_PROFUNDA, rango: rangoDeColor(COLOR_PROFUNDA) }).contexto[0], '500 km o más');
  const n = contenidoTooltip('profundidad', { etiqueta: '50–100', valor: 1 }, { color: COLOR_NEUTRO, rango: rangoDeColor(COLOR_NEUTRO) });
  assert.match(n.contexto[1], /cruza un corte/); assert.equal(n.color, COLOR_NEUTRO);
  assert.equal(rangoDeColor(COLOR_MEDIA), '70–299,99 km'); assert.equal(rangoDeColor(null), null); assert.equal(rangoDeColor('#123456'), null);
});

test('parsearIntervalo: lee las tres formas de etiquetaIntervalo (con coma decimal y negativos) y rechaza lo demás', () => {
  assert.deepEqual(parsearIntervalo('< 10'), { desde: null, hasta: '10' }); assert.deepEqual(parsearIntervalo('≥ 500'), { desde: '500', hasta: null });
  assert.deepEqual(parsearIntervalo('2,5–3'), { desde: '2,5', hasta: '3' }); assert.deepEqual(parsearIntervalo('-1–0'), { desde: '-1', hasta: '0' });
  assert.equal(parsearIntervalo('todos'), null); assert.equal(parsearIntervalo(''), null);
});

// ---------- eje temporal ----------
const ANCHO_UTIL = 750;   // hero: 720 − 40 − 10 … (el componente pasa ancho − 50); aquí un valor representativo para los cálculos

test('eje: meses abreviados en español, fechas UTC y periodos (mismo día, mismo año, cambio de año)', () => {
  assert.deepEqual([...MESES_ES], ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']);
  assert.equal(fechaCorta(Date.UTC(2026, 10, 11)), '11 nov'); assert.equal(fechaCorta(Date.UTC(2025, 6, 30), true), '30 jul 2025');
  assert.equal(periodoUtc(Date.UTC(2026, 10, 10, 9), Date.UTC(2026, 10, 10, 20)), '10 nov 2026 · UTC');
  assert.equal(periodoUtc(Date.UTC(2026, 10, 10, 9), Date.UTC(2026, 10, 11, 8)), '10 nov – 11 nov 2026 · UTC');
  assert.equal(periodoUtc(Date.UTC(2026, 11, 31, 22), Date.UTC(2027, 0, 1, 3)), '31 dic 2026 – 1 ene 2027 · UTC');
  assert.equal(fechaCorta(Date.UTC(2026, 10, 10, 23, 59)), '10 nov');                                   // UTC, no la zona local
});

test('eje: 24 barras → una etiqueta cada 3 h alineada al reloj UTC (09:00, 12:00…), título «Hora UTC» y periodo rotulado UTC', () => {
  const e = ticksEjeTemporal(serie('2026-11-10T09:00:00Z', 24), ANCHO_UTIL);
  assert.ok(e.valido); assert.equal(e.paso, 3); assert.equal(e.eje, 'Hora UTC'); assert.equal(e.periodo, '10 nov – 11 nov 2026 · UTC');
  assert.deepEqual(e.horas.map((h) => h.texto), ['09:00', '12:00', '15:00', '18:00', '21:00', '00:00', '03:00', '06:00']);
  assert.equal(e.horas[0].indice, 0); assert.equal(e.horas[0].x, 0.5 * ANCHO_UTIL / 24);                // centrada en su barra
});

test('eje: cambio de día → separador en la barra de las 00:00 y fecha (en una fila aparte de las horas); también la fecha del primer tramo', () => {
  const e = ticksEjeTemporal(serie('2026-11-10T09:00:00Z', 24), ANCHO_UTIL);
  assert.deepEqual(e.dias.map((d) => [d.indice, d.separador, d.texto]), [[0, false, '10 nov'], [15, true, '11 nov']]);
  assert.equal(e.dias[1].x, 15 * ANCHO_UTIL / 24);                                                      // el separador cae en el borde izquierdo de la barra de las 00:00
  assert.ok(e.horas.every((h) => /^\d\d:00$/.test(h.texto)));                                           // la fila de horas no mezcla fechas
  const empieza00 = ticksEjeTemporal(serie('2026-11-10T00:00:00Z', 24), ANCHO_UTIL);
  assert.deepEqual(empieza00.dias.map((d) => [d.separador, d.texto]), [[false, '10 nov']]);             // empieza en 00:00: fecha sin separador
});

test('eje: pasos por nº de barras — ≤24 → 3 h; ≤48 → 6 h; ≤96 → 12 h; más → solo medianoches (sin fila de horas)', () => {
  const p = (n: number) => ticksEjeTemporal(serie('2026-11-10T00:00:00Z', n), ANCHO_UTIL);
  assert.equal(p(24).paso, 3); assert.equal(p(48).paso, 6); assert.equal(p(96).paso, 12);
  assert.deepEqual(p(48).horas.map((h) => h.texto), ['00:00', '06:00', '12:00', '18:00', '00:00', '06:00', '12:00', '18:00']);
  assert.deepEqual(p(96).horas.map((h) => h.texto), ['00:00', '12:00', '00:00', '12:00', '00:00', '12:00', '00:00', '12:00']);
  const largo = p(168);
  assert.equal(largo.paso, 0); assert.equal(largo.horas.length, 0); assert.equal(largo.dias.filter((d) => d.separador).length, 6);
  assert.deepEqual(largo.dias.slice(0, 2).map((d) => d.texto), ['10 nov', '11 nov']);
});

test('eje: un único tramo (REPRODUCCIÓN) muestra su hora y la fecha completa con el año, rotulada UTC', () => {
  const e = ticksEjeTemporal(serie('2025-07-30T00:00:00Z', 1), ANCHO_UTIL);
  assert.deepEqual(e.horas.map((h) => h.texto), ['00:00']); assert.deepEqual(e.dias.map((d) => [d.separador, d.texto]), [[false, '30 jul 2025']]); assert.equal(e.periodo, '30 jul 2025 · UTC');
});

test('eje: paso de mes y de año (la fecha del 1 ene lleva el año; el cambio de mes no)', () => {
  const anio = ticksEjeTemporal(serie('2026-12-31T22:00:00Z', 6), ANCHO_UTIL);
  assert.deepEqual(anio.dias.map((d) => d.texto), ['31 dic', '1 ene 2027']); assert.equal(anio.periodo, '31 dic 2026 – 1 ene 2027 · UTC');
  const mes = ticksEjeTemporal(serie('2026-10-31T23:00:00Z', 3), ANCHO_UTIL);
  assert.deepEqual(mes.dias.map((d) => d.texto), ['31 oct', '1 nov']); assert.equal(mes.periodo, '31 oct – 1 nov 2026 · UTC');
});

test('eje: sin solapes — etiquetas de hora a ≥ SEPARACION_MIN, etiquetas de fecha sin pisarse y dentro del área, para 1…744 barras y anchos distintos', () => {
  for (const ancho of [750, 500, 300]) {
    for (const n of [1, 6, 24, 25, 48, 96, 97, 168, 700, 744]) {
      for (const ini of ['2026-11-10T00:00:00Z', '2026-11-10T09:00:00Z', '2026-11-10T23:00:00Z']) {
        const e = ticksEjeTemporal(serie(ini, n), ancho);
        const etq = `ancho ${ancho}, n ${n}, ${ini}`;
        e.horas.forEach((h, k) => { if (k > 0) assert.ok(h.x - e.horas[k - 1].x >= SEPARACION_MIN, `horas ${etq}`); assert.ok(h.x >= 0 && h.x <= ancho, etq); });
        const conTexto = e.dias.filter((d) => d.texto !== null);
        conTexto.forEach((d, k) => {
          if (k > 0) { const a = conTexto[k - 1]; assert.ok(d.x + 4 >= a.x + 4 + (a.texto as string).length * 7.2, `fechas ${etq}`); }
          assert.ok(d.x + 4 + (d.texto as string).length * 7.2 <= ancho + 10, `fecha dentro ${etq}`);
        });
      }
    }
  }
});

test('eje: si 3 h no caben (área estrecha) sube a 6 h; sin instante válido en alguna barra → valido=false (se conservan las etiquetas antiguas)', () => {
  assert.equal(ticksEjeTemporal(serie('2026-11-10T00:00:00Z', 24), 300).paso, 6);
  assert.equal(ticksEjeTemporal([{ detalle: undefined }], 750).valido, false);
  assert.equal(ticksEjeTemporal([{ detalle: '2026-11-10T00:00:00Z' }, { detalle: 'xx' }], 750).valido, false);
  assert.equal(ticksEjeTemporal([], 750).valido, false); assert.equal(ticksEjeTemporal(serie('2026-11-10T00:00:00Z', 3), 0).valido, false);
});

test('eje: si la fecha del tramo parcial choca con la de la primera medianoche, manda la medianoche (el separador se mantiene)', () => {
  const e = ticksEjeTemporal(serie('2026-11-10T23:00:00Z', 3), 60);
  assert.equal(e.dias[0].texto, null); assert.equal(e.dias[1].texto, '11 nov'); assert.equal(e.dias[1].separador, true);
});

// ---------- plantilla: tooltip, foco, táctil, delegación ----------
test('tooltip: UN elemento reutilizado, HTML (no solo <title>), pointer-events none, oculto a lectores, no es región viva y queda fuera del lienzo con scroll', () => {
  const b = barras();
  assert.equal((b.match(/class="tip"/g) ?? []).length, 1);
  assert.match(b, /<div class="tip" #tip aria-hidden="true" \[class\.vis\]="tipVisible\(\)">/);
  const regla = /\.tip \{[^}]*\}/.exec(b)?.[0] ?? '';
  for (const r of [/position: absolute/, /pointer-events: none/, /var\(--panel-vidrio\)/, /var\(--linea\)/, /var\(--radio-s\)/, /var\(--elev-2\)/, /z-index: \d+;/]) assert.match(regla, r);
  assert.ok(Number(/z-index: (\d+)/.exec(regla)?.[1]) < 1000);                                       // por debajo de la cabecera sticky (> 1000, tests/ronda1-visual)
  assert.match(b, /\.tip::before \{[^}]*var\(--filo\)/);
  assert.doesNotMatch(b, /aria-live|role="status" aria-live/);
  const zona = /<div class="zona" #zona>([\s\S]*?)<div class="tip"/.exec(b)?.[1] ?? '';
  assert.match(zona, /<div class="lienzo"/); assert.match(zona, /<\/div>\s*<!--[^>]*-->\s*$/);        // el tooltip es hermano del lienzo, no su hijo (el overflow no lo recorta)
  assert.match(b, /tip\.style\.transform = `translate\(\$\{p\.x\}px, \$\{p\.y\}px\)`/);              // posicionado con transform, no con left/top
  assert.match(b, /posicionarTooltip\(ancla,/); assert.match(b, /afterNextRender\(\(\) => this\.posicionar\(i\)/);   // se mide una vez, con el texto ya pintado
  assert.match(b, /\.tip-valor \.n \{[^}]*font-family: var\(--fuente-mono\)/);                       // el valor, grande y en mono
});

test('tooltip: el contenido sale de contenidoTooltip y cada barra conserva un nombre accesible con el MISMO texto (aria-label; el <title> por barra desaparece)', () => {
  const b = barras();
  assert.match(b, /contenidoTooltip\(this\.tipo\(\), it, \{ unidad: this\.unidad\(\), total, color, rango: rangoDeColor\(color\) \}\)/);
  assert.match(b, /\[attr\.aria-label\]="contenidos\(\)\[i\]\.texto"/);
  assert.doesNotMatch(b, /<title>\{\{ items\(\)\[i\]/);
  assert.match(b, /readonly tipo = input<TipoGrafica>\('generico'\)/);
  const h = app('app.component.html');
  for (const t of ['hora', 'pais', 'magnitud', 'profundidad']) assert.ok(h.includes(`tipo="${t}"`), t);
});

test('teclado: roving tabindex — un solo tab stop (la barra activa), svg role=group, flechas/Inicio/Fin vía indiceSiguiente, Escape oculta y el anillo de foco es visible', () => {
  const b = barras();
  assert.match(b, /\[attr\.tabindex\]="i === indiceRodante\(\) \? 0 : -1"/);
  assert.equal((sinComentarios(b).match(/tabindex="0"/g) ?? []).length, 0);                           // ningún tab stop fijo: ni el lienzo ni las barras
  assert.match(b, /<svg #svg [^>]*role="group"/);
  assert.match(b, /\(keydown\)="alTeclear\(\$event\)"/); assert.match(b, /indiceSiguiente\(this\.indiceDe\(e\) \?\? this\.indiceRodante\(\), this\.items\(\)\.length, k\.key, this\.horizontal\(\)\)/);
  assert.match(b, /k\.key === 'Escape'\) \{ this\.ocultar\(\)/); assert.match(b, /k\.preventDefault\(\)/);
  assert.match(b, /\.focus\(\)/); assert.match(b, /\(focusin\)="alEnfocar\(\$event\)"/);                // al enfocar: tooltip
  assert.match(b, /\.hit:focus-visible \{[^}]*stroke: var\(--foco\)/); assert.match(b, /\.hit:focus \{ outline: none; \}/);   // el outline se sustituye por el trazo de foco
  const g = readFileSync(new URL('../src/app/graficas-tooltip.ts', import.meta.url), 'utf8');
  for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']) assert.ok(g.includes(`'${k}'`), k);
});

test('táctil: touch-action pan-x pan-y, toque ≠ arrastre (umbral), el tooltip táctil espera a un toque fuera y mouseleave simulado no lo oculta', () => {
  const b = barras();
  assert.match(b, /touch-action: pan-x pan-y/);
  assert.match(b, /UMBRAL_TOQUE = 8/); assert.match(b, /Math\.hypot\(p\.clientX - ini\.x, p\.clientY - ini\.y\) > UMBRAL_TOQUE\) return/);
  assert.match(b, /alSalir\(e: Event\): void \{ if \(\(e as PointerEvent\)\.pointerType !== 'touch'\) this\.ocultar\(\); \}/);
  assert.match(b, /alMover\(e: Event\): void \{\s*if \(\(e as PointerEvent\)\.pointerType === 'touch'\) return;/);
  assert.match(b, /@HostListener\('document:pointerdown', \['\$event'\]\)/); assert.match(b, /!this\.zona\(\)\?\.nativeElement\.contains\(e\.target as Node\)\) this\.ocultar\(\)/);
  assert.equal((sinComentarios(b).match(/preventDefault/g) ?? []).length, 1);                           // solo en las flechas del teclado: el toque no se secuestra y el scroll sigue funcionando
});

test('rendimiento: eventos delegados en el <svg> (sin listeners por barra), índice por data-i, zonas de impacto calculadas una vez por cambio de datos', () => {
  const b = barras();
  const hit = /<rect class="hit"[^>]*\/>/.exec(b)?.[0] ?? '';
  assert.ok(hit.includes('data-i')); assert.doesNotMatch(hit, /\(\w+\)=/);                              // la barra no lleva ningún manejador
  const barra = /<rect [^>]*class="barra"[^>]*\/>/.exec(b)?.[0] ?? '';
  assert.doesNotMatch(barra, /\(\w+\)=/);
  for (const ev of ['pointermove', 'pointerleave', 'pointerdown', 'pointerup', 'focusin', 'focusout', 'keydown']) assert.equal((b.match(new RegExp(`\\(${ev}\\)=`, 'g')) ?? []).length, 1, ev);
  assert.match(b, /closest\?\.\('\[data-i\]'\)/); assert.match(b, /readonly golpes = computed/);
  assert.match(b, /if \(i !== null && i !== this\.activo\(\)\) this\.mostrar\(i\)/);                      // solo se recalcula al cambiar de barra
  assert.equal((b.match(/getBoundingClientRect/g) ?? []).length, 2);                                     // dos lecturas (zona y svg) por cambio de barra, ninguna en bucle
});

test('resaltado: aclarado + borde fino claro, resto al 0,7; transiciones SOLO bajo no-preference, de opacity/filter, ≤ 120 ms; sin transition: all', () => {
  const b = barras();
  assert.match(b, /\.barra\.sel \{ filter: brightness\(1\.22\); stroke: var\(--punto-borde\)/); assert.match(b, /\.hay-activo \.barra:not\(\.sel\) \{ opacity: \.7; \}/);
  assert.doesNotMatch(b, /transition:\s*all/);
  const media = /@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n    \}/.exec(b)?.[1] ?? '';
  assert.equal((media.match(/transition:/g) ?? []).length, (b.match(/transition:/g) ?? []).length); assert.ok(media.length > 0);   // todas las transiciones están dentro del media
  for (const m of b.matchAll(/transition: ([^;]+);/g)) { assert.match(m[1], /^(opacity|filter)/); for (const ms of m[1].matchAll(/(\d+)ms/g)) assert.ok(Number(ms[1]) <= 120, m[1]); }
  assert.doesNotMatch(b, /backdrop-filter|animation|@keyframes/);
});

test('eje en la plantilla: horas en mono, fechas en negrita con separador discontinuo --linea, título «Hora UTC» y periodo; etiquetas antiguas solo como alternativa', () => {
  const b = barras();
  assert.match(b, /\.hora-eje \{ font: 12px var\(--fuente-mono\); fill: var\(--texto-2\); \}/); assert.match(b, /\.fecha \{ font-size: 12px; font-weight: 700; fill: var\(--texto\); \}/);
  assert.match(b, /\.sep-dia \{ stroke: var\(--linea\); stroke-width: 1; stroke-dasharray: 3 3; \}/);
  assert.match(b, /ticksEjeTemporal\(this\.items\(\), this\.ancho\(\) - 50\)/); assert.match(b, /\{\{ eje\(\)\.eje \}\}/); assert.match(b, /\{\{ eje\(\)\.periodo \}\}/);
  assert.match(b, /@if \(!eje\(\)\.valido && i % paso\(\) === 0\)/);
  assert.match(b, /<g aria-hidden="true">/);
  const e = app('graficas-eje.ts'); assert.ok(e.includes("'Hora UTC'")); assert.ok(e.includes('· UTC'));
  // los datos y las etiquetas de la tabla alternativa no cambian: la tabla sigue usando items().etiqueta
  assert.match(b, /<th scope="row">\{\{ i\.etiqueta \}\}<\/th><td>\{\{ i\.valor \}\}<\/td>/);
  assert.match(b, /disenoBarras\(valores, this\.ancho\(\), this\.alto\(\), this\.margen\(\)\)/);
});

// ---------- rejilla equilibrada ----------
test('rejilla: <1100 px una columna; ≥1100 px 10 pistas (hora 6 | país 4 · magnitud 5 | profundidad 5), sin grid-row, DOM = orden de foco', () => {
  const css = app('app.component.css');
  assert.match(css, /\.graficas \{ display: grid; grid-template-columns: minmax\(0, 1fr\); gap: var\(--esp-2\) var\(--esp-5\); \}/);
  const bloque = /@container \(min-width: 1100px\) \{\s*\.graficas[\s\S]*?\n\}/.exec(css)?.[0] ?? '';
  assert.match(bloque, /repeat\(10, minmax\(0, 1fr\)\)/); assert.match(bloque, /\.g-hero \{ grid-column: span 6; \}/); assert.match(bloque, /\.g-pais \{ grid-column: span 4; \}/); assert.match(bloque, /\.g-mag, \.g-prof \{ grid-column: span 5; \}/);
  assert.doesNotMatch(bloque, /grid-row/); assert.doesNotMatch(css, /5fr/);
  const h = app('app.component.html');
  const orden = ['idBase="g-hora"', 'idBase="g-pais"', 'idBase="g-mag"', 'idBase="g-prof"'].map((s) => h.indexOf(s));
  assert.deepEqual([...orden].sort((a, b) => a - b), orden);
  assert.match(css, /\.analisis \{[^}]*container-type: inline-size/);
});

test('rejilla: modelo de alturas — a 1440, 1280 y 1100 px de contenedor ninguna gráfica deja > 80 px de hueco frente a su vecina de fila (estimación, no medición) y nadie baja del ancho mínimo', () => {
  const b = barras();
  const m = /const ANCHO: Record<Formato, number> = \{ estandar: (\d+), hero: (\d+), columna: (\d+) \};\s*const MIN_ANCHO: Record<Formato, number> = \{ estandar: (\d+), hero: (\d+), columna: (\d+) \};/.exec(b)!;
  const [anE, anH, anC, miE, miH, miC] = m.slice(1).map(Number);
  const altoHero = Number(/formato\(\) === 'hero' \? (\d+) : (\d+)/.exec(b)?.[1]), altoEst = Number(/formato\(\) === 'hero' \? \d+ : (\d+)/.exec(b)?.[1]);
  const altoPais = 10 * 30 + 40;                                            // 10 países × 30 + 40 (columna)
  const SOBRE = 140, LEYENDA = 30, G = 24;                                  // estimación de la cabecera + «sin valor» + «ver tabla» + paddings, y de la leyenda de profundidad
  for (const W of [1440, 1280, 1100]) {
    const t = (W - 9 * G) / 10;
    const wHero = 6 * t + 5 * G, wPais = 4 * t + 3 * G, wMitad = 5 * t + 4 * G;
    assert.ok(wHero >= miH && wPais >= miC && wMitad >= miE, `anchos mínimos a ${W}`);
    const hHero = wHero * altoHero / anH + SOBRE + 10, hPais = wPais * altoPais / anC + SOBRE;
    const hMag = wMitad * altoEst / anE + SOBRE, hProf = hMag + LEYENDA;
    assert.ok(Math.abs(hHero - hPais) <= 80, `fila 1 a ${W}: ${Math.round(hHero)} vs ${Math.round(hPais)}`);
    assert.ok(Math.abs(hMag - hProf) <= 80, `fila 2 a ${W}`);
  }
});

// ---------- transversales ----------
test('tokens y contraste: el tooltip usa solo tokens existentes y su texto se lee sobre la superficie; foco y borde claro visibles; sin hex sueltos', () => {
  const b = barras();
  assert.doesNotMatch(sinComentarios(b), /#[0-9a-fA-F]{3,6}\b/);
  for (const n of ['panel-vidrio', 'linea', 'filo', 'elev-2', 'fuente-mono', 'punto-borde', 'foco']) assert.ok(new RegExp(`--${n}:`).test(global()), n);
  for (const n of ['texto', 'texto-2']) assert.ok(razonContraste(token(n), token('superficie-1')) >= 4.5, `${n} sobre la superficie del tooltip`);
  assert.ok(razonContraste(token('foco'), token('fondo')) >= 3); assert.ok(razonContraste(token('punto-borde'), token('fondo')) >= 3);
});

test('sin almacenamiento del navegador, sin innerHTML ni recursos externos en los módulos y el componente de esta iteración', () => {
  for (const r of ['graficas/barras.component.ts', 'graficas-tooltip.ts', 'graficas-eje.ts', 'graficas-color.ts']) {
    assert.doesNotMatch(app(r), /localStorage|sessionStorage|document\.cookie|indexedDB|innerHTML|https?:\/\/|\bimport\(/, r);
  }
  for (const r of ['graficas-tooltip.ts', 'graficas-eje.ts']) assert.doesNotMatch(app(r), /^import /m, r);      // módulos puros autocontenidos (R-011)
});

test('lo que NO cambia: graficas.ts sigue sin importar los módulos nuevos y conserva sus funciones de cálculo', () => {
  const g = app('graficas.ts');
  for (const f of ['export function itemsHora', 'export function itemsPais', 'export function itemsIntervalos', 'export function disenoBarras']) assert.ok(g.includes(f), f);
  assert.doesNotMatch(g, /graficas-eje|graficas-tooltip/);
});
