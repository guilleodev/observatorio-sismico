// F7, vista Análisis, ITERACIÓN B: rediseño de la comparación con 2025, legibilidad y pie. `node --test tests/*.test.ts`
// Lógica pura (comparacion-vista.ts) + estructura de la plantilla y del CSS de comparacion.component.ts y del pie de app.component.html/css.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NOTA_GRAFICO, diferencia, formatoDecimal, formatoEntero, graficoComparativo, indicadores, textoDuracion, textoMagnitud } from '../src/app/comparacion-vista.ts';
import { filasComparacion, textoVariacion } from '../src/app/comparacion.ts';
import { contenidoTooltip } from '../src/app/graficas-tooltip.ts';
import { razonContraste } from '../src/app/formato.ts';

const app = (r: string) => readFileSync(new URL(`../src/app/${r}`, import.meta.url), 'utf8');
const global = () => readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const comp = () => app('comparacion/comparacion.component.ts');
const plantilla = () => { const c = comp(); return c.slice(c.indexOf('template: `'), c.indexOf('styles: `')); };
const estilos = () => comp().slice(comp().indexOf('styles: `'));
const html = () => app('app.component.html');
const css = () => app('app.component.css');
const token = (n: string): string => new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`).exec(global())?.[1] ?? '';
const sinDetails = (t: string) => t.replace(/<details[\s\S]*?<\/details>/g, '');

const cmp = (o: Record<string, unknown> = {}, h: Record<string, unknown> | null = {}): never => ({
  unit: 'events', comparacion_disponible: true, ambito: 'global', country_id: null, min_mag_solicitada: 4.5, min_mag_efectiva: 4.5, min_mag_elevada: false,
  reciente: { source: 'live', count: 120, sin_magnitud: 0, desde: 0, hasta: 1, dias: 7 },
  historico: h === null ? null : { source: 'historico', periodo: { desde: '2025-01-01', hasta: '2025-12-31' }, dias: 365, total: 18302, media_diaria: 50.14, mediana_diaria: 40, esperado_para_ventana: 351, ...h },
  variacion: -0.658, variacion_definida: true, periodo_reciente_incompleto: false, motivos_incompleto: [], ...o,
}) as never;

// ---------- formato en español ----------
test('formato: miles con punto desde 5 cifras (como el resto de la interfaz), coma decimal, «ND» si no es número; duración y magnitud', () => {
  assert.equal(formatoEntero(18302), '18.302'); assert.equal(formatoEntero(120), '120'); assert.equal(formatoEntero(0), '0');
  assert.equal(formatoEntero(NaN), 'ND'); assert.equal(formatoEntero(undefined), 'ND'); assert.equal(formatoEntero(null), 'ND');
  assert.equal(formatoDecimal(2.5), '2,5'); assert.equal(formatoDecimal(351, 1), '351,0'); assert.equal(formatoDecimal(0.3333, 2), '0,33'); assert.equal(formatoDecimal('x'), 'ND');
  assert.equal(textoDuracion(7), '7 días'); assert.equal(textoDuracion(1), '1 día'); assert.equal(textoDuracion(0.5), '0,50 días'); assert.equal(textoDuracion(NaN), 'ND');
  assert.equal(textoMagnitud(cmp()), '4,5'); assert.equal(textoMagnitud(cmp({ min_mag_efectiva: 4 })), '4');
});

// ---------- diferencia: mismo formato que la API/tabla, nunca un porcentaje sin base ----------
test('diferencia: mismo texto que textoVariacion (comparacion.ts) con signo y sentido en palabras; sin base NO hay porcentaje', () => {
  for (const v of [-0.68, -0.658, 0.034, 0.5, -0.05, 1.2]) {
    const c = cmp({ variacion: v });
    assert.equal(diferencia(c).texto, textoVariacion(c), String(v));
  }
  assert.equal(diferencia(cmp({ variacion: -0.68 })).texto, '−68 %');
  assert.equal(diferencia(cmp({ variacion: -0.68 })).sentido, 'por-debajo'); assert.match(diferencia(cmp({ variacion: -0.68 })).etiqueta, /por debajo de lo esperado/);
  assert.equal(diferencia(cmp({ variacion: 0.5 })).sentido, 'por-encima'); assert.equal(diferencia(cmp({ variacion: 0 })).sentido, 'igual');
  for (const sinBase of [cmp({ variacion: null, variacion_definida: false }), cmp({ variacion_definida: false }), cmp({}, { esperado_para_ventana: 0 }), cmp({}, null), cmp({ variacion: NaN })]) {
    const d = diferencia(sinBase);
    assert.equal(d.texto, null); assert.equal(d.sentido, 'nd'); assert.doesNotMatch(d.etiqueta, /%/);
  }
});

// ---------- indicadores ----------
test('indicadores: reciente · esperado · diferencia · histórico, solo con cifras existentes; cada uno con su fuente en TEXTO; sin histórico solo queda el reciente', () => {
  const l = indicadores(cmp());
  assert.deepEqual(l.map((i) => i.id), ['reciente', 'esperado', 'diferencia', 'historico']);
  const por = Object.fromEntries(l.map((i) => [i.id, i]));
  assert.equal(por.reciente.cifra, '120'); assert.match(por.reciente.detalle, /^Magnitud ≥ 4,5 · 7 días$/);
  assert.equal(por.esperado.cifra, '351,0'); assert.match(por.esperado.detalle, /Expectativa .* no una medida/);
  assert.equal(por.diferencia.cifra, '−66 %'); assert.equal(por.diferencia.glifo, '▼'); assert.match(por.diferencia.detalle, /por debajo de lo esperado/);   // icono + texto, no solo color
  assert.equal(por.historico.cifra, '18.302'); assert.equal(por.historico.detalle, 'en 365 días (todo 2025)');
  assert.equal(por.reciente.etiquetaFuente, 'Feed en vivo (USGS)'); assert.equal(por.esperado.etiquetaFuente, 'Histórico 2025 (catálogo FDSN)'); assert.equal(por.historico.etiquetaFuente, 'Histórico 2025 (catálogo FDSN)');
  assert.ok(l.every((i) => i.etiquetaFuente.length > 0));
  assert.deepEqual(indicadores(cmp({ comparacion_disponible: false }, null)).map((i) => i.id), ['reciente']);
  const nd = Object.fromEntries(indicadores(cmp({ variacion: null, variacion_definida: false })).map((i) => [i.id, i]));
  assert.equal(nd.diferencia.cifra, 'No definida'); assert.equal(nd.diferencia.glifo, null); assert.doesNotMatch(nd.diferencia.cifra + nd.diferencia.detalle, /%/);
});

// ---------- ¿gráfico honesto? ----------
test('gráfico comparativo: valores normales → eje común de 0 al máximo, anchos proporcionales (sin escala truncada), nota fija y etiqueta accesible completa', () => {
  const g = graficoComparativo(cmp());
  assert.equal(g.mostrar, true); assert.equal(g.sinGrafico, null);
  assert.equal(g.maximo, 351); assert.equal(g.pctEsperado, 100);
  assert.ok(Math.abs(g.pctReciente - (120 / 351) * 100) < 0.01);                                      // misma escala: proporcional a los valores
  assert.ok(Math.abs(g.pctReciente / g.pctEsperado - g.reciente / g.esperado) < 0.001);
  assert.equal(g.textoReciente, '120'); assert.equal(g.textoEsperado, '351,0'); assert.equal(g.textoMaximo, '351');
  assert.match(g.aria, /mismo eje desde 0/); assert.match(g.aria, /Periodo reciente: 120 eventos/); assert.match(g.aria, /Esperado según 2025: 351,0 eventos/);
  assert.match(g.aria, /Magnitud mínima 4,5 en ambos periodos/); assert.ok(g.aria.includes(NOTA_GRAFICO));
  assert.equal(NOTA_GRAFICO, 'Comparación de recuentos con la misma magnitud mínima; no mide evolución real de la actividad.');
  assert.equal(g.incompleto, false); assert.doesNotMatch(g.aria, /incompleto/);
});

test('gráfico comparativo: el reciente mayor que el esperado también escala desde 0; reciente 0 SÍ se dibuja (barra vacía con su cifra); la magnitud mínima va en la etiqueta', () => {
  const alto = graficoComparativo(cmp({ reciente: { source: 'live', count: 702, sin_magnitud: 0, desde: 0, hasta: 1, dias: 7 } }));
  assert.equal(alto.pctReciente, 100); assert.equal(alto.maximo, 702); assert.ok(alto.pctEsperado < 100 && alto.pctEsperado > 0);
  const cero = graficoComparativo(cmp({ reciente: { source: 'live', count: 0, sin_magnitud: 0, desde: 0, hasta: 1, dias: 7 } }));
  assert.equal(cero.mostrar, true); assert.equal(cero.pctReciente, 0); assert.equal(cero.pctEsperado, 100); assert.equal(cero.textoReciente, '0');
  assert.match(graficoComparativo(cmp({ min_mag_efectiva: 4, min_mag_elevada: true })).aria, /Magnitud mínima 4 en ambos periodos/);
});

test('gráfico comparativo: periodo incompleto → barra marcada (la longitud NO se corrige); aviso en la etiqueta accesible', () => {
  const normal = graficoComparativo(cmp());
  const inc = graficoComparativo(cmp({ periodo_reciente_incompleto: true, motivos_incompleto: ['hasta_ahora'] }));
  assert.equal(inc.incompleto, true); assert.match(inc.aria, /posiblemente incompleto/);
  assert.equal(inc.pctReciente, normal.pctReciente); assert.equal(inc.reciente, normal.reciente);       // no se «completa» el recuento
});

test('gráfico comparativo: SIN gráfico (con el porqué) si falta el histórico, el esperado es ND o 0, el reciente es inválido o el periodo dura < 1 día', () => {
  const casos: Array<[string, never, RegExp]> = [
    ['sin histórico', cmp({ comparacion_disponible: false }, null), /no hay histórico de 2025/],
    ['esperado ND', cmp({}, { esperado_para_ventana: NaN }), /no está disponible \(ND\)/],
    ['esperado 0', cmp({}, { esperado_para_ventana: 0 }), /es 0 para este filtro y no hay base/],
    ['reciente ND', cmp({ reciente: { source: 'live', count: NaN, sin_magnitud: 0, desde: 0, hasta: 1, dias: 7 } }), /recuento del periodo reciente no está disponible/],
    ['periodo corto', cmp({ reciente: { source: 'live', count: 3, sin_magnitud: 0, desde: 0, hasta: 1, dias: 0.5 } }), /menos de un día/],
  ];
  for (const [nombre, c, motivo] of casos) {
    const g = graficoComparativo(c);
    assert.equal(g.mostrar, false, nombre); assert.match(g.sinGrafico ?? '', /^No se muestra gráfico: /, nombre); assert.match(g.sinGrafico ?? '', motivo, nombre);
    assert.equal(g.aria, '', nombre);
  }
  assert.equal(graficoComparativo(cmp({ reciente: { source: 'live', count: 3, sin_magnitud: 0, desde: 0, hasta: 1, dias: 1 } })).mostrar, true);   // 1 día exacto: ya vale
});

// ---------- plantilla: se conserva TODO lo anterior ----------
test('plantilla: todas las filas, columnas, avisos y textos obligatorios de la versión anterior siguen en la comparación', () => {
  const t = plantilla();
  for (const x of ['id="cmp-titulo"', 'Comparación con el histórico de 2025', 'Ámbito: {{ ambito() }} · Magnitud mínima efectiva: {{ datos().min_mag_efectiva }}', 'Mismo ámbito y misma magnitud en ambos periodos',
    '<caption class="oculto">Cifras de la comparación con su fuente</caption>', '<th scope="col">Concepto</th><th scope="col">Valor</th><th scope="col">Fuente</th>', '@for (f of filas(); track f.concepto)',
    '<th scope="row">{{ f.concepto }}</th><td>{{ f.valor }}</td><td>{{ f.fuente }}</td>', 'avisos().noDisponible', 'avisos().magnitudElevada', 'avisos().coberturaBaja', 'avisos().incompleto',
    'Periodo reciente posiblemente incompleto.', '@for (m of avisos().motivos; track m)', 'Esta diferencia no demuestra por sí sola un cambio real de actividad.', '{{ aviso }}',
    'El histórico de 2025 es una instantánea revisada y la media anual está inflada por las réplicas (por eso se muestra también la mediana); el periodo reciente es preliminar.', 'No es una predicción ni una evaluación de riesgo.']) assert.ok(t.includes(x), x);
  // las filas salen del mismo módulo de cálculo (comparacion.ts) y no se tocan: 8 conceptos con histórico, 3 sin él
  assert.equal(filasComparacion(cmp()).length, 8); assert.equal(filasComparacion(cmp({}, null)).length, 3);
  assert.match(comp(), /readonly filas = computed\(\(\) => filasComparacion\(this\.datos\(\)\)\)/); assert.match(comp(), /readonly avisos = computed\(\(\) => advertencias\(this\.datos\(\)\)\)/);
  // mismas entradas que antes
  assert.match(comp(), /readonly datos = input\.required<Comparacion>\(\)/); assert.match(comp(), /readonly nombrePais = input<string \| undefined>\(undefined\)/);
  assert.equal((comp().match(/input[.<(]/g) ?? []).length, 2);
});

test('la tabla completa vive en un <details> cerrado por defecto con su texto de resumen; «Cómo leer esta comparación» también, con el texto de cobertura COMPLETO', () => {
  const t = plantilla();
  const detalles = t.match(/<details[^>]*>[\s\S]*?<\/details>/g) ?? [];
  assert.equal(detalles.length, 2);
  assert.ok(detalles.every((d) => !/<details[^>]*\bopen\b/.test(d)));                                  // cerrados por defecto
  const tabla = detalles.find((d) => d.includes('<table>')) ?? '';
  assert.match(tabla, /<summary>Ver la tabla completa de conceptos, valores y fuentes<\/summary>/); assert.match(tabla, /<caption class="oculto">/); assert.match(tabla, /<th scope="col">/);
  const como = detalles.find((d) => d.includes('Cómo leer')) ?? '';
  assert.match(como, /<summary>Cómo leer esta comparación<\/summary>/); assert.match(como, /<p>\{\{ aviso \}\}<\/p>/); assert.match(como, /instantánea revisada/);
  assert.match(estilos(), /\.plegable > summary \{[^}]*text-decoration: underline/); assert.match(estilos(), /\.plegable > summary:focus-visible \{ outline: 3px solid var\(--foco\)/);
});

test('el aviso principal («no demuestra un cambio real») y los motivos de periodo incompleto están FUERA de los desplegables, con icono y texto (Fase 2: una sola nota neutra, sin amarillo)', () => {
  const fuera = sinDetails(plantilla());
  assert.match(fuera, /<div class="nota-lectura" role="note">\s*<app-icono nombre="info" class="nota-ico" \/>/);
  assert.doesNotMatch(comp(), /--aviso-fondo|--aviso-texto|var\(--aviso\)/);                         // ya no hay fondos ni textos amarillos en la comparación
  assert.ok(fuera.includes('Esta diferencia no demuestra por sí sola un cambio real de actividad.')); assert.ok(fuera.includes('No es una predicción ni una evaluación de riesgo.'));
  assert.ok(fuera.includes('@for (m of avisos().motivos; track m)')); assert.ok(fuera.includes('avisos().magnitudElevada')); assert.ok(fuera.includes('avisos().coberturaBaja'));
  assert.ok(!fuera.includes('{{ aviso }}'));                                                          // el texto largo de cobertura sí va plegado
  assert.match(estilos(), /\.nota-lectura \{[^}]*border-left: 2px solid var\(--borde-control\)[^}]*color: var\(--texto-2\)/);
  assert.ok(razonContraste(token('texto-2'), token('banda-fondo')) >= 4.5);                         // la nota se lee sobre la banda de la comparación
});

test('insignias de fuente con TEXTO («Feed en vivo (USGS)», «Histórico 2025 (catálogo FDSN)») y sin violeta (reservado a REPRODUCCIÓN) en la comparación viva', () => {
  const t = plantilla();
  assert.match(t, /<span class="insignia vivo">Feed en vivo \(USGS\)<\/span>/); assert.match(t, /<span class="insignia hist">Histórico 2025 \(catálogo FDSN\)<\/span>/);
  assert.match(t, /\{\{ i\.etiquetaFuente \}\}/);
  assert.doesNotMatch(comp(), /replay|--filo-replay|#a78bfa|#7c3aed|#241a4d|#ddd6fe/i);
  assert.match(estilos(), /\.insignia\.vivo, \.origen\.o-vivo \{[^}]*var\(--acento-fondo\)[^}]*var\(--acento-texto\)/);
});

test('gráfico en la plantilla: role="img" con aria-label completo, barras con ancho proporcional, rayado + borde discontinuo si es incompleto, nota fija y alternativa «No se muestra gráfico»', () => {
  const t = plantilla();
  assert.match(t, /<div class="barras" role="img" \[attr\.aria-label\]="g\.aria">/);
  assert.match(t, /\[style\.width\.%\]="g\.pctReciente"/); assert.match(t, /\[style\.width\.%\]="g\.pctEsperado"/); assert.match(t, /\[class\.incompleta\]="g\.incompleto"/);
  assert.match(t, /<span>0<\/span><span>\{\{ g\.textoMaximo \}\}<\/span>/);                           // eje visible de 0 al máximo
  assert.match(t, /<figcaption class="nota">\s*\{\{ nota \}\}/); assert.match(t, /\{\{ g\.sinGrafico \}\}/); assert.match(comp(), /readonly nota = NOTA_GRAFICO/);
  assert.match(estilos(), /\.b-reciente\.incompleta \{[^}]*repeating-linear-gradient[^}]*border: 2px dashed/);
  assert.doesNotMatch(plantilla(), /tabindex/);                                                       // el gráfico no es un tab stop: la tabla es la alternativa
});

test('regiones vivas, sin transiciones ni animaciones, sin almacenamiento ni recursos externos en la comparación; dos columnas ≥ 1100 px con container query', () => {
  const c = comp();
  assert.equal((c.match(/role="status"/g) ?? []).length, 2); assert.equal((c.match(/aria-live/g) ?? []).length, 0);
  assert.doesNotMatch(c, /transition|animation|@keyframes|backdrop-filter|localStorage|sessionStorage|document\.cookie|indexedDB|innerHTML|https?:\/\//);
  assert.match(estilos(), /@container \(min-width: 1100px\) \{ \.cuerpo \{ grid-template-columns: minmax\(0, 1\.3fr\) minmax\(0, 1fr\); \} \}/);
  assert.doesNotMatch(/\.banda \{[^}]*\}/.exec(c)?.[0] ?? '', /border-radius|border-left/);            // banda sin cajas anidadas
  assert.doesNotMatch(app('comparacion-vista.ts'), /^import (?!type)/m);                              // módulo puro: solo `import type`
  assert.doesNotMatch(app('comparacion.ts') + app('graficas.ts'), /comparacion-vista|comparacion\.component/);   // los módulos de cálculo no dependen de la presentación
});

test('REPRODUCCIÓN: la comparación viva no se muestra y el bloque «no aplica» conserva su tratamiento violeta y su mensaje en una región status', () => {
  const a = html();
  assert.match(a, /@if \(comparacionVivo\(\); as cmp\) \{ <app-comparacion \[datos\]="cmp" \[nombrePais\]="nombrePaisActual\(\)" \/> \}/);
  assert.match(a, /@else if \(esReplay\(\)\) \{ <section class="no-aplica banda-replay" aria-label="Comparación con el histórico de 2025"><h2>Comparación con el histórico de 2025<\/h2><p role="status">\{\{ avisoNoAplica \}\}<\/p><\/section> \}/);
  assert.match(/\.no-aplica \{[^}]*\}/.exec(css())?.[0] ?? '', /background: var\(--replay-fondo\)[^}]*color: var\(--replay-texto\)/);
});

// ---------- legibilidad ----------
test('contraste AA del texto secundario: --texto-2 (y el de avisos) sobre --fondo, --superficie-1/2, --banda-fondo y --escenario (base de --panel-vidrio)', () => {
  for (const f of ['fondo', 'superficie-1', 'superficie-2', 'banda-fondo', 'escenario']) {
    assert.ok(razonContraste(token('texto-2'), token(f)) >= 4.5, `texto-2 sobre ${f}`);
    assert.ok(razonContraste(token('texto'), token(f)) >= 4.5, `texto sobre ${f}`);
    assert.ok(razonContraste(token('acento-texto'), token(f)) >= 4.5, `acento-texto sobre ${f}`);
  }
  assert.ok(razonContraste(token('aviso-texto'), token('aviso-fondo')) >= 4.5); assert.ok(razonContraste(token('error-texto'), token('error-fondo')) >= 4.5);
  assert.ok(razonContraste(token('texto'), token('superficie-3')) >= 4.5);                            // texto de la insignia del histórico
  // marcas gráficas ≥ 3:1 sobre la banda (WCAG 1.4.11): barra reciente, barra esperada y eje
  for (const n of ['acento', 'borde-control', 'texto-2']) assert.ok(razonContraste(token(n), token('banda-fondo')) >= 3, `${n} sobre la banda`);
});

test('legibilidad de la comparación: sin tamaños literales < .75rem (solo tokens ≥ --t-xs), interlineado 1.4–1.5 en notas, líneas de 70–80ch y enlaces/resúmenes subrayados', () => {
  const e = estilos();
  assert.doesNotMatch(e, /--t-2xs/);
  for (const m of e.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)) assert.ok(m[2] === 'rem' ? Number(m[1]) >= 0.75 : Number(m[1]) >= 12, `tamaño literal ${m[0]}`);
  const t = global();
  const tk = (n: string) => Number(new RegExp(`--${n}:\\s*([\\d.]+)rem`).exec(t)?.[1]);
  assert.ok(tk('t-xs') >= 0.7 && tk('t-s') >= 0.8);
  for (const sel of ['\\.nota', '\\.detalle', '\\.como-cuerpo p', '\\.aviso']) {
    const lh = Number(new RegExp(`${sel} \\{[^}]*line-height: ([\\d.]+)`).exec(e)?.[1]);
    assert.ok(lh >= 1.4 && lh <= 1.5, `${sel} interlineado ${lh}`);
  }
  for (const sel of ['\\.nota', '\\.como-cuerpo p', '\\.ambito']) {
    const ch = Number(new RegExp(`${sel} \\{[^}]*max-width: (\\d+)ch`).exec(e)?.[1]);
    assert.ok(ch >= 70 && ch <= 80, `${sel} ancho ${ch}ch`);
  }
  // Análisis (hoja de la app y gráficas): línea de alcance acotada, «Cómo se calcula» subrayado, versalitas ≥ .7rem
  assert.match(css(), /\.calculo \{[^}]*line-height: 1\.45; max-width: 80ch/);
  assert.match(app('graficas/barras.component.ts'), /\.como summary \{[^}]*text-decoration: underline/); assert.match(app('graficas/barras.component.ts'), /\.tabla-alt summary \{[^}]*text-decoration: underline/);
  assert.match(css(), /\.metodo-notas dt \{ font-size: var\(--t-xs\)/); assert.match(css(), /\.eyebrow \{[^}]*font-size: \.7rem/);
});

// ---------- tooltip (ajuste de la parte A) ----------
test('tooltip de «por hora UTC»: titular limpio («11 nov · 10:00–11:00 UTC»), «N eventos» con espacio duro entre cifra y unidad y la etiqueta antigua ya no se ve', () => {
  const c = contenidoTooltip('hora', { etiqueta: '11/11 10h', valor: 5, detalle: '2026-11-11T10:00:00.000Z' }, { total: 20 });
  assert.equal(c.categoria, '11 nov · 10:00–11:00 UTC'); assert.deepEqual(c.contexto, ['Fecha UTC: 11/11/2026', '25,0 % del total contado en esta gráfica']);
  assert.ok(!c.texto.includes('10h')); assert.match(c.texto, /^11 nov · 10:00–11:00 UTC: 5 eventos\./);
  assert.match(app('graficas/barras.component.ts'), /<span class="n">\{\{ c\.valor \}\}<\/span>&nbsp;<span class="u">\{\{ c\.unidad \}\}<\/span>/);
});

// ---------- pie ----------
test('pie: ya no aparece «Base proporcionada…»; sí el proyecto y las atribuciones (USGS, Natural Earth, OpenStreetMap); un solo eyebrow; sin enlaces ni URLs', () => {
  const h = html();
  assert.doesNotMatch(h, /Base proporcionada|conclusiones para completar el proyecto/);
  const pie = /<footer[^>]*>([\s\S]*?)<\/footer>/.exec(h)?.[1] ?? '';
  assert.match(pie, /Observatorio Sísmico · Proyecto académico de Big Data \(Máster en IA y Big Data\)/);
  assert.match(pie, /Datos: USGS \(feed en vivo y catálogo FDSN\) · Fronteras: Natural Earth · Cartografía: © OpenStreetMap contributors/);
  assert.equal((pie.match(/BIG DATA · PROYECTO DE AULA/g) ?? []).length, 1);                            // el eyebrow no se duplica en el pie
  assert.equal((h.match(/<footer/g) ?? []).length, 1);
  assert.doesNotMatch(pie, /<a |https?:\/\/|\d{4}-\d{2}-\d{2}|v\d+\.\d+/);                              // sin enlaces, fechas ni versiones inventadas
  assert.match(h, /<footer class="o-pie">[\s\S]*?<p class="eyebrow">BIG DATA · PROYECTO DE AULA<\/p>/);
  // Fase 2: firma de la persona autora y logos LOCALES (public/img), con texto alternativo y tamaño fijo; sin enlaces
  assert.match(pie, /<img class="logo-autor" src="img\/guilleodev\.png" alt="guilleodev" width="123" height="26"/);
  assert.match(pie, /<img class="logo-centro" src="img\/alan-turing.png" alt="Alan Turing, Centro Público Integrado de Formación Profesional" width="120" height="44"/);
  assert.match(pie, /<p class="pie-autor" translate="no">Guillermo Redondo Camacho<\/p>/);
  assert.equal((pie.match(/<img /g) ?? []).length, 2);
  assert.ok(h.indexOf('<footer') > h.indexOf('id="eventos"') && h.indexOf('<footer') < h.indexOf('</main>'));   // último elemento del contenido
});

test('pie: discreto (línea fina, sin caja), se parte en varias líneas en móvil, texto ≥ .8rem con --texto-2 AA sobre el fondo y sin desbordes', () => {
  const c = css();
  assert.match(c, /\nfooter \{[^}]*border-top: 1px solid var\(--linea\)[^}]*display: grid; grid-template-columns: auto minmax\(0, 1fr\) auto/); assert.doesNotMatch(/\nfooter \{[^}]*\}/.exec(c)?.[0] ?? '', /border-radius|box-shadow/);
  assert.match(c, /footer p \{[^}]*font-size: var\(--t-s\)[^}]*line-height: 1\.5[^}]*color: var\(--texto-2\)[^}]*overflow-wrap: anywhere/);
  assert.match(c, /footer \.pie-datos \{ grid-column: 1 \/ -1;/);
  assert.match(c, /@media \(max-width: 767px\) \{\s*footer \{ grid-template-columns: minmax\(0, 1fr\) auto;/);          // móvil: logos en la primera fila y texto debajo
  assert.match(c, /\.logo-centro \{[^}]*width: 120px; height: 44px;[^}]*filter: brightness\(1\.35\) saturate\(1\.1\)/);   // el logo conserva sus colores; solo se aviva un poco para leerse sobre el grafito
  assert.doesNotMatch(/\.logo-centro \{[^}]*\}/.exec(c)?.[0] ?? '', /invert|opacity/);                                  // sin monocromo ni transparencia
  assert.ok(razonContraste(token('texto-2'), token('fondo')) >= 4.5);
  assert.ok(razonContraste(token('acento-texto'), token('fondo')) >= 4.5);                            // el eyebrow
});
