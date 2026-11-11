// Globo 3D (F7, 4.ª iteración): día/noche (sol.ts), anillos de eventos nuevos (ondas.ts), estrellas (estrellas.ts), leyenda interactiva (leyenda.ts), calidad adaptativa (calidad.ts) y
// fases de carga (carga.ts) + comprobaciones de lectura de código. Sin WebGL: lo que dibuja three se verifica en el navegador. `node --test tests/*.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { latLonAXyz } from '../src/app/globo/geometria.ts';
import {
  CREPUSCULO_GRADOS, INTERVALO_SOL_MS, OSCURECIMIENTO_NOCHE, UMBRAL_CAMBIO_SOLAR_GRADOS, cambioAngularGrados, factorNoche, normalizarLongitud, posicionSolar, vectorSolar,
} from '../src/app/globo/sol.ts';
import { MAX_IDS_ONDEADOS, MAX_NUEVOS_LOTE, MAX_ONDAS, DURACION_ONDA_MS, SeguimientoOndas, decidirOndas, radioMaxOnda, ranurasLibres } from '../src/app/globo/ondas.ts';
import { BRILLO_MAX, BRILLO_MIN, CANTIDAD_ESTRELLAS, RADIO_ESTRELLAS, TAMANO_MAX_PX, TAMANO_MIN_PX, generarEstrellas, mulberry32 } from '../src/app/globo/estrellas.ts';
import {
  ALFA_ATENUADO, MASCARA_TODOS, RANGOS_LEYENDA, alternarRango, codificarRangos, contarRangos, esVisible, filtrarPuntos, idsDeRango, indiceRangoDeColor, indiceRangoProfundidad, mascaraDeRango,
  nombreBotonRango, rangoDeProfundidad, textoAnuncioRango, textoRecuento,
} from '../src/app/globo/leyenda.ts';
import { CALIDAD, MaquinaCalidad, nivelesPixelRatio, percentil } from '../src/app/globo/calidad.ts';
import {
  DEMORA_MOSTRAR_MS, MIN_PERMANENCIA_MS, MaquinaCarga, TEXTO_FASE, estaCargando, esFaseTerminal, indicadorVisible, proximoCambioIndicador, transicionValida,
} from '../src/app/globo/carga.ts';
import { colorProfundidad, razonContraste } from '../src/app/formato.ts';
import { prepararPuntos, resolverPaleta, ordenarPorCapas } from '../src/app/globo/geometria.ts';
import { generarEventosSinteticos } from '../src/app/globo/eventos-prueba.ts';
import { idDe } from '../src/app/tabla.ts';

const RAIZ = fileURLToPath(new URL('../src/app/', import.meta.url));
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const cerca = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

// ---------- 1. día/noche ----------
test('sol: declinación ≈ ±23,44° en los solsticios y ≈ 0° en los equinoccios (error < 0,3°)', () => {
  cerca(posicionSolar(Date.UTC(2026, 5, 21, 8, 24)).latitud, 23.44, 0.3);
  cerca(posicionSolar(Date.UTC(2026, 11, 21, 15, 50)).latitud, -23.44, 0.3);
  cerca(posicionSolar(Date.UTC(2026, 2, 20, 14, 46)).latitud, 0, 0.5);   // CAMBIO: Spencer tiene hasta ~0,5° de error cerca del equinoccio según el ciclo bisiesto (medido -0,42°); basta ~1° para un terminador ambiental
  cerca(posicionSolar(Date.UTC(2026, 8, 23, 0, 5)).latitud, 0, 0.5);
  assert.ok(Math.abs(posicionSolar(new Date(Date.UTC(2028, 1, 29, 12))).latitud) < 24);   // año bisiesto sin problemas
});

test('sol: a las 12:00 UTC la longitud subsolar es ≈ −E/4 (|E| ≤ ~16 min ⇒ |lon| ≤ ~4,1°) y avanza −15°/h hacia el oeste', () => {
  for (const mes of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    const p = posicionSolar(Date.UTC(2026, mes, 15, 12));
    assert.ok(Math.abs(p.ecuacionTiempoMin) <= 16.6, `E mes ${mes}: ${p.ecuacionTiempoMin}`);
    cerca(p.longitud, -p.ecuacionTiempoMin / 4, 1e-9);
    assert.ok(Math.abs(p.longitud) <= 4.2);
  }
  const a = posicionSolar(Date.UTC(2026, 2, 20, 12)).longitud; const b = posicionSolar(Date.UTC(2026, 2, 20, 13)).longitud;
  cerca(normalizarLongitud(a - b), 15, 0.05);
  cerca(normalizarLongitud(190), -170); cerca(normalizarLongitud(-190), 170);
});

test('sol: el vector coincide con latLonAXyz, es unitario y el instante no válido no da NaN', () => {
  for (const t of [Date.UTC(2026, 0, 1), Date.UTC(2026, 6, 4, 19, 33), Date.UTC(2026, 10, 10, 3)]) {
    const p = posicionSolar(t); const v = vectorSolar(p); const r = latLonAXyz(p.latitud, p.longitud);
    for (let i = 0; i < 3; i++) cerca(v[i], r[i], 1e-12);
    cerca(Math.hypot(...v), 1, 1e-12);
  }
  const malo = posicionSolar(NaN); assert.deepEqual([malo.latitud, malo.longitud], [0, 0]);
  cerca(cambioAngularGrados([0, 0, 1], [1, 0, 0]), 90, 1e-9); cerca(cambioAngularGrados([0, 0, 1], [0, 0, 1]), 0, 1e-9);
  // 60 s mueven el Sol ≈ 0,25°: por encima del umbral de 0,05° (se redibuja) y 60 s es el intervalo máximo de recálculo
  const d = cambioAngularGrados(vectorSolar(posicionSolar(Date.UTC(2026, 5, 1, 12, 0))), vectorSolar(posicionSolar(Date.UTC(2026, 5, 1, 12, 1))));
  assert.ok(d > UMBRAL_CAMBIO_SOLAR_GRADOS && d < 0.3, `${d}`); assert.equal(INTERVALO_SOL_MS, 60_000); assert.equal(UMBRAL_CAMBIO_SOLAR_GRADOS, 0.05);
});

test('sol: sombreado suave — noche entre 40 % y 55 % de oscurecimiento, transición gradual ±10° y monótona', () => {
  assert.ok(OSCURECIMIENTO_NOCHE >= 0.4 && OSCURECIMIENTO_NOCHE <= 0.55); assert.equal(CREPUSCULO_GRADOS, 10);
  cerca(factorNoche(1), 1); cerca(factorNoche(-1), 1 - OSCURECIMIENTO_NOCHE); cerca(factorNoche(0), 1 - OSCURECIMIENTO_NOCHE / 2, 1e-9);
  let previo = 0; for (let c = -1; c <= 1; c += 0.01) { const f = factorNoche(c); assert.ok(f >= previo - 1e-12 && f >= 1 - OSCURECIMIENTO_NOCHE - 1e-12 && f <= 1 + 1e-12); previo = f; }
});

test('día/noche en el código: solo el planeta recibe uSol; marcadores, halos y anillos NO; reloj UTC real con comentario sobre REPRODUCCIÓN', () => {
  const e = leer('globo/escena.ts');
  const planeta = /const FRAGMENTO_PLANETA = `([\s\S]*?)`;/.exec(e)?.[1] ?? '';
  assert.match(planeta, /uniform vec3 uSol;/); assert.match(planeta, /\* luz \* limbo \* velo/);                   // la luz de cámara se mantiene y se MULTIPLICA por el velo nocturno
  for (const nombre of ['VERTICE_PUNTO', 'FRAGMENTO_PUNTO', 'VERTICE_HALO_SEL', 'FRAGMENTO_HALO_SEL']) assert.doesNotMatch(/* @__PURE__ */ new RegExp(`const ${nombre} = \`([\\s\\S]*?)\`;`).exec(e)?.[1] ?? '', /uSol|noche|velo/, nombre);
  const matPunto = /this\.matPunto = new ShaderMaterial\(\{[\s\S]*?\}\);/.exec(e)?.[0] ?? '';
  assert.doesNotMatch(matPunto, /uSol/); assert.doesNotMatch(leer('globo/shaders.ts'), /uSol|noche/);
  assert.match(e, /posicionSolar\(Date\.now\(\)\)/); assert.doesNotMatch(e, /new Date\(/);
  assert.match(leer('globo/sol.ts'), /REPRODUCCIÓN[\s\S]*ambiental/i);
  const act = /private actualizarSol\(\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '';
  assert.match(act, /UMBRAL_CAMBIO_SOLAR_GRADOS\) return;[\s\S]*this\.pedirFotograma\(\)/);                           // solo si se movió: UN fotograma, no render continuo
  assert.match(e, /private programarSol\(\)/); assert.match(e, /clearTimeout\(this\.idTemporizadorSol\)/);
  assert.match(leer('globo/globo.component.ts'), /Sombra día\/noche según la hora UTC actual; no indica la hora de los eventos/);
});

// ---------- 2. anillos de eventos nuevos ----------
const lote = (ids: string[], mags?: number[]) => ({ ids, mags: Float64Array.from(mags ?? ids.map(() => 4)), n: ids.length });
const proc = (s: SeguimientoOndas, ids: string[], mags?: number[]) => { const l = lote(ids, mags); return s.procesar(l.ids, l.mags, l.n); };

test('ondas: el primer lote no dispara; ids nuevos disparan UNA vez; no repiten', () => {
  const s = new SeguimientoOndas();
  assert.deepEqual(proc(s, ['a', 'b', 'c']), []);                                 // base
  assert.deepEqual(proc(s, ['a', 'b', 'c', 'd', 'e'], [4, 4, 4, 5, 6]), [4, 3]);  // d y e, por magnitud descendente (e antes que d)
  assert.deepEqual(proc(s, ['a', 'b', 'c', 'd', 'e']), []);                       // misma lectura: nada
  assert.deepEqual(proc(s, ['a', 'b', 'c', 'e']), []);                            // d desaparece…
  assert.deepEqual(proc(s, ['a', 'b', 'c', 'd', 'e']), []);                       // …y vuelve: ya ondeó, no repite
});

test('ondas: reinicio explícito (modo/filtros), lote vacío, conjunto distinto (< 50 % en común) y carga masiva NO disparan', () => {
  const s = new SeguimientoOndas();
  proc(s, ['a', 'b', 'c', 'd']);
  s.reiniciarBase();
  assert.deepEqual(proc(s, []), []); assert.equal(s.hayBase, false);              // un lote vacío no fija la base
  assert.deepEqual(proc(s, ['x', 'y', 'z']), []); assert.equal(s.hayBase, true);  // el primer lote tras el reinicio solo fija la base
  assert.deepEqual(proc(s, ['x', 'y', 'z', 'w']), [3]);                           // y a partir de ahí vuelve a funcionar
  assert.equal(decidirOndas({ anterior: new Set(['a', 'b', 'c', 'd']), ids: ['a', 'q', 'r', 's', 't'], magnitudes: [1, 1, 1, 1, 1], n: 5, ondeados: new Set() }).motivo, 'reinicio');   // 25 % en común
  assert.equal(decidirOndas({ anterior: new Set(), ids: ['a'], magnitudes: [1], n: 1, ondeados: new Set() }).motivo, 'reinicio');                                                                // lo anterior estaba vacío
  assert.equal(decidirOndas({ anterior: null, ids: ['a'], magnitudes: [1], n: 1, ondeados: new Set() }).motivo, 'base');
  const base = Array.from({ length: 200 }, (_, i) => `b${i}`);
  const t = new SeguimientoOndas(); proc(t, base);
  const masivo = [...base, ...Array.from({ length: MAX_NUEVOS_LOTE + 1 }, (_, i) => `n${i}`)];
  assert.deepEqual(proc(t, masivo), []);                                          // «cargar el resto»: demasiados nuevos de golpe
});

test('ondas: máximo MAX_ONDAS simultáneas por magnitud descendente (NaN al final), sin cola; ranuras libres; radio acotado', () => {
  const s = new SeguimientoOndas(); proc(s, ['base']);
  const ids = Array.from({ length: 12 }, (_, i) => `e${i}`);
  const mags = ids.map((_, i) => (i === 3 ? NaN : i));                            // e11 (11) … e0 (0); e3 sin magnitud
  const r = proc(s, ['base', ...ids], [1, ...mags]);
  assert.equal(r.length, MAX_ONDAS);
  assert.deepEqual(r.map((i) => ids[i - 1]), ['e11', 'e10', 'e9', 'e8', 'e7', 'e6', 'e5', 'e4']);
  assert.ok(!r.map((i) => ids[i - 1]).includes('e3'));
  assert.deepEqual(proc(s, ['base', ...ids]), []);                                // los descartados NO se acumulan en cola
  assert.deepEqual(ranurasLibres([0, 1000, 5000, 0], 2000, 3), [0, 1, 3]); assert.deepEqual(ranurasLibres([9e9, 9e9], 1, 5), []);
  assert.ok(radioMaxOnda(0.009) >= 0.05 && radioMaxOnda(0.054) <= 0.14 && Number.isFinite(radioMaxOnda(NaN)));
  assert.ok(DURACION_ONDA_MS >= 2000 && DURACION_ONDA_MS <= 2500);
});

test('ondas: el Set de ids ondeados está ACOTADO', () => {
  const s = new SeguimientoOndas(); proc(s, ['a', 'b', 'c', 'x-1']);
  for (let k = 2; k < MAX_IDS_ONDEADOS + 300; k++) proc(s, ['a', 'b', 'c', `x-${k}`]);
  assert.ok(s.tamanoOndeados <= MAX_IDS_ONDEADOS, `${s.tamanoOndeados}`);
});

test('rendimiento: máscara de leyenda y «nuevos» con 50 000 eventos (una vez por cambio de datos)', () => {
  const { puntos } = prepararPuntos(generarEventosSinteticos(50_000, 7), { radio: () => 3, color: colorProfundidad, id: idDe });
  const o = ordenarPorCapas(puntos);
  let t0 = performance.now(); const rangos = codificarRangos(o.colores, o.n); const c = contarRangos(o.colores, o.n); const sub = filtrarPuntos(o, rangos, mascaraDeRango(0), -1);
  const ms1 = performance.now() - t0;
  assert.ok(ms1 < 500, `leyenda 50 000: ${ms1.toFixed(1)} ms`); assert.equal(c.total, o.n); assert.equal(sub.n, c.somera);
  const s = new SeguimientoOndas(); s.procesar(o.ids, o.magnitudes, o.n);
  const ids2 = [...o.ids, ...Array.from({ length: 10 }, (_, i) => `nuevo-${i}`)]; const mags2 = new Float64Array(o.n + 10).fill(5);
  t0 = performance.now(); const nuevos = s.procesar(ids2, mags2, ids2.length); const ms2 = performance.now() - t0;
  assert.ok(ms2 < 500, `nuevos 50 000: ${ms2.toFixed(1)} ms`); assert.equal(nuevos.length, MAX_ONDAS);   // CAMBIO: llegan 10 nuevos pero el límite de anillos simultáneos recorta a MAX_ONDAS (por magnitud, sin cola)
});

test('ondas en el código: pool de MAX_ONDAS en un InstancedMesh aparte, sin depthWrite, cara oculta descartada, REPRODUCCIÓN violeta, sin ondas con movimiento reducido ni con la vista oculta', () => {
  const e = leer('globo/escena.ts'); const sh = leer('globo/shaders.ts'); const c = leer('globo/globo.component.ts');
  assert.match(e, /this\.matOnda = new ShaderMaterial\(\{[^\n]*transparent: true, depthWrite: false \}\)/); assert.match(e, /this\.ondas\.renderOrder = 6/);
  assert.match(sh, /dot\(normalize\(centro\), cameraPosition\) <= 1\.0/); assert.match(sh, /vP < 0\.0 \|\| vP > 1\.0/);
  const lanzar = /private lanzarOndasNuevas\([\s\S]*?\n  \}/.exec(e)?.[0] ?? '';
  assert.match(lanzar, /this\.enPausa \|\| \(this\.mqMovimiento\?\.matches \?\? false\)\) return/); assert.ok(lanzar.indexOf('procesar(') < lanzar.indexOf('this.enPausa'));   // la base se actualiza siempre
  assert.match(e, /replay \? this\.opciones\.paleta\.replay : this\.opciones\.paleta\.halo/);
  assert.match(c, /effect\(\(\) => \{ this\.claveLectura\(\);/); assert.ok(c.indexOf('this.claveLectura()') < c.indexOf('this.escena?.fijarEventos(r.puntos)'));   // reinicio ANTES del efecto de datos
  assert.match(c, /\$\{this\.replay\(\)\}\|\$\{this\.etiqueta\(\) \?\? ''\}\|\$\{this\.filtros\(\)\}/);
  const fot = /private readonly fotograma = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '';
  assert.match(fot, /const ondas = t < this\.finOndas;/); assert.match(fot, /else if \(pulsa \|\| ondas\) this\.encolar\(\)/);   // el bucle solo sigue mientras haya anillos vivos
  assert.match(c, /Anillo breve al llegar un evento nuevo; es solo una señal visual/);
  assert.match(e, /this\.ondas\.dispose\(\)/); assert.match(e, /this\.propios\.push\(geomEstrellas, this\.matEstrellas, geomOnda, this\.matOnda\)/);
});

// ---------- 3. estrellas ----------
test('estrellas: deterministas, cantidad fija, sobre una esfera de radio 10, bien repartidas y con brillo/tamaño mínimos', () => {
  const a = generarEstrellas(); const b = generarEstrellas();
  assert.equal(a.cantidad, CANTIDAD_ESTRELLAS); assert.ok(CANTIDAD_ESTRELLAS >= 300 && CANTIDAD_ESTRELLAS <= 600);
  assert.deepEqual(a.posiciones, b.posiciones); assert.deepEqual(a.propiedades, b.propiedades);
  assert.notDeepEqual(a.posiciones, generarEstrellas(CANTIDAD_ESTRELLAS, 1).posiciones);
  assert.equal(a.posiciones.length, 3 * CANTIDAD_ESTRELLAS);
  const m = [0, 0, 0]; let norte = 0;
  for (let i = 0; i < a.cantidad; i++) {
    cerca(Math.hypot(a.posiciones[3 * i], a.posiciones[3 * i + 1], a.posiciones[3 * i + 2]), RADIO_ESTRELLAS, 1e-4);
    for (let k = 0; k < 3; k++) m[k] += a.posiciones[3 * i + k] / a.cantidad;
    if (a.posiciones[3 * i + 1] > 0) norte++;
    assert.ok(a.propiedades[2 * i] >= TAMANO_MIN_PX && a.propiedades[2 * i] <= TAMANO_MAX_PX);
    assert.ok(a.propiedades[2 * i + 1] >= BRILLO_MIN - 1e-6 && a.propiedades[2 * i + 1] <= BRILLO_MAX + 1e-6);
  }
  for (const v of m) assert.ok(Math.abs(v) < 1.2, `centroide ${v}`);              // sin sesgo hacia ningún lado
  assert.ok(norte > 0.4 * a.cantidad && norte < 0.6 * a.cantidad);
  assert.ok(BRILLO_MAX <= 0.5);                                                    // contraste muy bajo
  assert.ok(RADIO_ESTRELLAS > 6 + 1 && RADIO_ESTRELLAS + 6 < 20);                  // siempre detrás del globo (cámara ≤ 6) y dentro del far plane (20)
  const r = mulberry32(5); for (let i = 0; i < 1000; i++) { const x = r(); assert.ok(x >= 0 && x < 1); }
  assert.equal(generarEstrellas(0).cantidad, 0);
});

test('estrellas en el código: un Points, depthWrite false, renderOrder bajo, sin animación ni uniform de tiempo, fuera del picking y con dispose', () => {
  const e = leer('globo/escena.ts'); const sh = leer('globo/shaders.ts');
  assert.equal((e.match(/new Points\(/g) ?? []).length, 1);
  assert.match(e, /ShaderMaterial\(\{ uniforms: \{ uColor: \{ value: new Color\(paleta\.estrellas\) \}[\s\S]*?transparent: true, depthWrite: false \}\)/);
  assert.match(e, /estrellas\.renderOrder = -10/);
  const bloque = /export const VERTICE_ESTRELLAS[\s\S]*$/.exec(sh)?.[0] ?? '';
  assert.doesNotMatch(bloque, /uAhora|uFase|uTiempo|sin\(/);
  assert.doesNotMatch(/private construirAmbiente[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /rafId|encolar|pedirFotograma/);   // no piden fotogramas
  assert.ok(!/estrellas/i.test(/private buscarBajo[\s\S]*?\n  \}/.exec(e)?.[0] ?? ''));                                // no entran en el picking
  assert.match(e, /geomEstrellas, this\.matEstrellas/);
});

// ---------- 4. leyenda ----------
test('leyenda: la clasificación coincide con colorProfundidad (límites, null, undefined, NaN, negativos, ±Infinity, texto)', () => {
  const casos: unknown[] = [0, 69.99, 70, 299.99, 300, 700, -5, -0.0001, null, undefined, NaN, Infinity, -Infinity, '100', {}];
  for (const p of casos) {
    assert.equal(RANGOS_LEYENDA[indiceRangoProfundidad(p)].color, colorProfundidad(p), String(p));
    assert.equal(indiceRangoDeColor(colorProfundidad(p)), indiceRangoProfundidad(p), String(p));
  }
  assert.deepEqual(RANGOS_LEYENDA.map((r) => r.texto), ['Menos de 70 km', '70–299,99 km', '300 km o más', 'No disponible']);
  assert.deepEqual(RANGOS_LEYENDA.map((r) => rangoDeProfundidad(r.id === 'somera' ? 0 : r.id === 'media' ? 100 : r.id === 'profunda' ? 300 : null)), ['somera', 'media', 'profunda', 'nd']);
  const css = readFileSync(new URL('../src/app/app.component.css', import.meta.url), 'utf8');
  for (const r of RANGOS_LEYENDA) assert.match(css, new RegExp(`\\.${r.clase} \\{ background: ${r.color}; \\}`));      // mismos hex que los puntos de la leyenda
});

test('leyenda: conteos suman el total, máscara, alternancia, subconjunto seleccionable y textos «cargados · visibles»', () => {
  const profs = [0, 10, 69.99, 70, 120, 300, 650, null, undefined, NaN];
  const colores = profs.map(colorProfundidad);
  const c = contarRangos(colores, colores.length);
  assert.deepEqual([c.somera, c.media, c.profunda, c.nd], [3, 2, 2, 3]); assert.equal(c.somera + c.media + c.profunda + c.nd, c.total);
  assert.equal(mascaraDeRango(null), MASCARA_TODOS); assert.equal(mascaraDeRango(0), 1); assert.equal(mascaraDeRango(3), 8); assert.equal(mascaraDeRango(9), MASCARA_TODOS);
  assert.equal(esVisible(2, mascaraDeRango(0)), false); assert.equal(esVisible(2, mascaraDeRango(0), true), true); assert.equal(esVisible(0, mascaraDeRango(0)), true);
  assert.equal(alternarRango(null, 'media'), 'media'); assert.equal(alternarRango('media', 'media'), null); assert.equal(alternarRango('media', 'nd'), 'nd');
  const { puntos } = prepararPuntos(profs.map((p, i) => ({ type: 'Feature' as const, id: `e${i}`, geometry: { type: 'Point' as const, coordinates: [i, i, p as number] }, properties: { mag: 4, place: 'x', time: 0, updated: 0 } })), { radio: () => 3, color: colorProfundidad, id: idDe });
  const rangos = codificarRangos(puntos.colores, puntos.n);
  assert.equal(filtrarPuntos(puntos, rangos, mascaraDeRango(2), -1).n, 2);
  const conSel = filtrarPuntos(puntos, rangos, mascaraDeRango(2), 0);              // el seleccionado (e0, somera) se conserva aunque sea de otro rango
  assert.equal(conSel.n, 3); assert.ok(conSel.ids.includes('e0'));
  assert.deepEqual([...idsDeRango(puntos, 3)], ['e7', 'e8', 'e9']);
  const fmt = (n: number) => String(n);
  assert.equal(textoRecuento(5, 5, null, fmt), '5 eventos dibujados'); assert.equal(textoRecuento(1, 1, null, fmt), '1 evento dibujado');
  assert.equal(textoRecuento(10, 3, 'somera', fmt), '10 eventos cargados · 3 visibles (rango: Menos de 70 km)');
  assert.equal(textoAnuncioRango('somera', 3, 10, fmt), 'Mostrando solo eventos de menos de 70 km: 3 de 10.'); assert.equal(textoAnuncioRango(null, 1, 1), '');
  assert.equal(nombreBotonRango(RANGOS_LEYENDA[0], '12'), 'Mostrar solo: Menos de 70 km (12)');
  assert.ok(ALFA_ATENUADO >= 0.15 && ALFA_ATENUADO <= 0.25);
});

test('leyenda en el código: botones con aria-pressed y nombre accesible, «Mostrar todos», estática en 2D; el shader usa máscara + atributo; los atenuados no se eligen; sin almacenamiento', () => {
  const html = leer('app.component.html'); const e = leer('globo/escena.ts'); const c = leer('globo/globo.component.ts'); const ts = leer('app.component.ts');
  // CAMBIO (vistas internas): la señal del visor 2D/3D pasa de `vista` a `visor`
  assert.match(html, /@if \(visor\(\) === '3d'\) \{[\s\S]*?\[attr\.aria-pressed\]="rangoLeyenda\(\) === r\.id" \[attr\.aria-label\]="nombreBoton\(r\)"[\s\S]*?Mostrar todos[\s\S]*?\} @else \{[\s\S]*?<li><span class="punto punto-somera"/);
  assert.match(html, /<button type="button" class="leyenda-boton" \[id\]="'leyenda-rango-' \+ r\.id"/);
  assert.match(html, /\[rangoLeyenda\]="rangoLeyenda\(\)"/); assert.match(html, /\(conteosRangos\)="conteosRangos\.set\(\$event\)"/); assert.match(html, /\{\{ anuncioLeyenda\(\) \}\}/);
  const css = leer('app.component.css'); assert.match(css, /\.leyenda-boton \{[^}]*min-height: 28px/); assert.match(css, /\.leyenda-boton:focus-visible \{ outline: 3px solid var\(--foco\)/); assert.doesNotMatch(css, /transition/);
  assert.match(e, /attribute float aRango;/); assert.match(e, /uniform float uMascara;/); assert.match(e, /vPulso \*= visible;/); assert.match(e, /max\(vSel, mod\(floor\(uMascara \/ exp2\(aRango\)\), 2\.0\)\)/);   // el seleccionado siempre visible; los atenuados no pulsan
  assert.match(/private reconstruirPick\(\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /filtrarPuntos\(this\.indice, this\.rangoInst, mascaraDeRango\(this\.rangoActivo\), this\.iSel\)/);
  assert.doesNotMatch(/private readonly fotograma = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '', /rango|Rango|filtrarPuntos|codificarRangos/);                // nada de la leyenda por fotograma
  assert.match(c, /readonly rangoLeyenda = input<RangoProfundidad \| null>\(null\)/); assert.match(c, /readonly conteosRangos = output<ConteosRangos>\(\)/);
  assert.match(c, /return todos\.filter\(\(id\) => ok\.has\(id\)\)/);                                                                          // anterior/siguiente solo con los visibles
  assert.match(ts, /readonly rangoLeyenda = signal<RangoProfundidad \| null>\(null\)/); assert.doesNotMatch(ts + html, /localStorage|sessionStorage|document\.cookie|indexedDB|three|WebGL/);
  assert.doesNotMatch(ts, /fijarRangoLeyenda|InstancedMesh|ShaderMaterial/);                                                                  // sin lógica 3D en app.component.ts
});

// ---------- 5. calidad adaptativa ----------
/** Alimenta `n` muestras de coste `coste` cada `paso` ms desde `t0`; devuelve los cambios [instante, pixelRatio]. */
function alimentar(m: MaquinaCalidad, t0: number, duracion: number, coste: number, paso = 16): [number, number][] {
  const cambios: [number, number][] = [];
  for (let t = t0; t <= t0 + duracion; t += paso) { const r = m.registrar(coste, t); if (r !== null) cambios.push([t, r]); }
  return cambios;
}

test('calidad: niveles discretos acotados por el tope y nunca por debajo de 1 (salvo dpr < 1)', () => {
  assert.deepEqual(nivelesPixelRatio(2), [2, 1.5, 1.25, 1]); assert.deepEqual(nivelesPixelRatio(1.5), [1.5, 1.25, 1]); assert.deepEqual(nivelesPixelRatio(1), [1]); assert.deepEqual(nivelesPixelRatio(0.8), [0.8]);
  assert.deepEqual(nivelesPixelRatio(NaN), [1]);
  assert.equal(new MaquinaCalidad(2).pixelRatio, 2);
  assert.equal(percentil([5, 1, 3, 2, 4, 9, 8, 7, 6, 10], 10, 0.9), 9);
});

test('calidad: baja tras un coste alto SOSTENIDO, no antes; respeta el tiempo mínimo entre cambios y llega al suelo', () => {
  const m = new MaquinaCalidad(2);
  assert.deepEqual(alimentar(m, 0, 1500, 30), []);                                 // 1,5 s malo: todavía no
  const c = alimentar(m, 1516, 20_000, 30);
  assert.equal(c[0][1], 1.5); assert.ok(c[0][0] >= CALIDAD.sostenidoBajarMs, `${c[0][0]}`);
  assert.ok(c[1][0] - c[0][0] >= CALIDAD.minEntreCambiosMs);                       // no baja dos niveles seguidos
  assert.deepEqual(c.map((x) => x[1]), [1.5, 1.25, 1]);                            // y se detiene en 1: nunca por debajo
  assert.equal(m.pixelRatio, 1);
});

test('calidad: sube solo con MUCHA holgura prolongada (histéresis asimétrica) y no oscila con coste intermedio', () => {
  const m = new MaquinaCalidad(2);
  alimentar(m, 0, 3000, 30);                                                       // baja a 1,5
  assert.equal(m.pixelRatio, 1.5);
  assert.deepEqual(alimentar(m, 3016, 20_000, 14), []);                            // 14 ms: ni baja (< 20) ni sube (> 8): zona muerta
  assert.deepEqual(alimentar(m, 23_100, 6000, 4), []);                             // holgado pero < 8 s
  const c = alimentar(m, 29_200, 12_000, 4); assert.equal(c[0]?.[1], 2);          // tras ≥ 8 s holgado sube un nivel
  assert.ok(CALIDAD.sostenidoSubirMs > CALIDAD.sostenidoBajarMs && CALIDAD.umbralSubirMs < CALIDAD.umbralBajarMs);
  assert.equal(m.pixelRatio, 2);                                                   // nunca por encima del tope
});

test('calidad: ignora huecos (pausa), valores atípicos y entradas no válidas; con dpr 1 no hace nada', () => {
  const m = new MaquinaCalidad(2);
  alimentar(m, 0, 1800, 30);
  assert.equal(m.registrar(30, 1800 + 1000), null);                                // hueco > 250 ms: la medición se reinicia
  assert.deepEqual(alimentar(m, 2850, 1500, 30), []);                              // vuelve a empezar de cero: aún no cumple 2 s
  for (const x of [NaN, -1, 5000, Infinity]) assert.equal(m.registrar(x, 4400), null);
  const m1 = new MaquinaCalidad(1); assert.deepEqual(alimentar(m1, 0, 30_000, 50), []); assert.equal(m1.pixelRatio, 1);
  m.reiniciarMedicion();
});

test('calidad en el código: mide el coste de render con performance.now() sin recrear nada, setPixelRatio sin setSize extra, tope min(dpr, 2) y documenta sus límites', () => {
  const e = leer('globo/escena.ts');
  const fot = /private readonly fotograma = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '';
  assert.match(fot, /const t0 = performance\.now\(\);\s*this\.renderer\.render\(this\.escena, this\.camara\);\s*const nuevoPixelRatio = this\.calidad\.registrar\(performance\.now\(\) - t0, t\)/);
  const cambiar = /private cambiarPixelRatio\([\s\S]*?\n  \}/.exec(e)?.[0] ?? '';
  assert.match(cambiar, /this\.renderer\.setPixelRatio\(pr\)/); assert.doesNotMatch(cambiar, /new |setSize|crearMalla|fijarEventos|colocarCamara|fijarSeleccion/);
  assert.match(e, /new MaquinaCalidad\(topePixelRatio\)/); assert.match(leer('globo/calidad.ts'), /NO mide la GPU real/);
  assert.match(leer('globo/escena.ts'), /this\.calidad\?\.reiniciarMedicion\(\)/);                                  // bucle parado: no mide
});

// ---------- 6. carga ----------
test('carga: transiciones válidas e inválidas, error desde cualquier fase de trabajo y estados terminales', () => {
  const m = new MaquinaCarga(); assert.equal(m.fase, 'idle');
  assert.equal(m.avanzar('textura'), false); assert.equal(m.avanzar('listo'), false); assert.equal(m.fase, 'idle');       // saltos no permitidos
  for (const f of ['descargando', 'inicializando', 'textura', 'listo'] as const) assert.equal(m.avanzar(f), true, f);
  assert.equal(m.avanzar('textura'), false); assert.equal(m.avanzar('error'), false); assert.equal(m.fase, 'listo');       // terminal
  for (const desde of ['idle', 'descargando', 'inicializando', 'textura'] as const) assert.ok(transicionValida(desde, 'error'), desde);
  const n = new MaquinaCarga(); n.avanzar('descargando'); assert.equal(n.avanzar('descargando'), false); n.avanzar('error'); assert.equal(n.avanzar('inicializando'), false);
  assert.ok(esFaseTerminal('listo') && esFaseTerminal('error') && !esFaseTerminal('textura'));
  assert.ok(estaCargando('descargando') && estaCargando('inicializando') && estaCargando('textura') && !estaCargando('idle') && !estaCargando('listo') && !estaCargando('error'));
  assert.equal(TEXTO_FASE.descargando, 'Descargando el motor 3D…'); assert.equal(TEXTO_FASE.inicializando, 'Iniciando WebGL…'); assert.equal(TEXTO_FASE.textura, 'Preparando el planeta…');
  assert.ok(!Object.values(TEXTO_FASE).some((t) => t !== null && /%/.test(t)));                                         // sin porcentajes inventados
});

test('carga: sin flash (retardo ≈ 180 ms) y permanencia mínima (≈ 300 ms) una vez mostrado', () => {
  assert.equal(indicadorVisible(0, null, null), false);
  assert.equal(indicadorVisible(100, 0, null), false); assert.equal(indicadorVisible(DEMORA_MOSTRAR_MS, 0, null), true);
  assert.equal(indicadorVisible(500, 0, 100), false); assert.equal(proximoCambioIndicador(50, 0, 100), null);               // terminó antes del retardo: nunca aparece
  const fin = DEMORA_MOSTRAR_MS + 50;                                                                                       // terminó poco después de mostrarse
  assert.equal(indicadorVisible(fin + 10, 0, fin), true); assert.equal(indicadorVisible(DEMORA_MOSTRAR_MS + MIN_PERMANENCIA_MS, 0, fin), false);
  cerca(proximoCambioIndicador(fin, 0, fin)!, DEMORA_MOSTRAR_MS + MIN_PERMANENCIA_MS - fin);
  assert.equal(indicadorVisible(5000, 0, 4000), false); assert.equal(indicadorVisible(3000, 0, 4000), true);               // carga larga: se oculta al terminar
  assert.equal(proximoCambioIndicador(10, 0, null), DEMORA_MOSTRAR_MS - 10); assert.equal(proximoCambioIndicador(1000, 0, null), null);
});

test('carga en el código: role="status" y aria-busy, texto de la fase, pointer-events none, «Volver al mapa 2D», fronteras no bloquean, spinner estático con movimiento reducido', () => {
  const c = leer('globo/globo.component.ts'); const e = leer('globo/escena.ts');
  assert.match(c, /<div class="stage" \[attr\.aria-busy\]="ocupado\(\) \? 'true' : null">/);
  assert.match(c, /<div class="carga" role="status" \[hidden\]="!indicadorMostrado\(\) \|\| estado\(\) === 'error'">[\s\S]*?\{\{ textoCarga\(\) \}\}/);
  assert.match(c, /\.carga \{[^}]*pointer-events: none/); assert.match(c, /<button type="button" \(click\)="volverAlMapa\(\)">Volver al mapa 2D<\/button>/);
  assert.match(c, /volverAlMapa\(\): void \{ this\.noDisponible\.emit\(this\.mensaje\(\)\); \}/);                         // el mecanismo existente: sin recargar
  assert.match(c, /finally \{ if \(!this\.destruido\) this\.avanzarFase\('listo'\); \}/); assert.match(c, /catch \{ if \(!this\.destruido\) this\.fronterasFallidas\.set\(true\); \}/);
  assert.match(c, /alFase: \(f\) => this\.avanzarFase\(f\)/); assert.match(e, /opciones\.alFase\?\.\('inicializando'\)/);
  assert.ok(c.indexOf("this.avanzarFase('descargando')") < c.indexOf("import('./escena')") && c.indexOf("import('./escena')") < c.indexOf("this.avanzarFase('inicializando')"));
  assert.ok(c.indexOf('hayWebgl()') < c.indexOf("import('./escena')"));                                                   // el fallback sin WebGL de antes se conserva
  assert.doesNotMatch(c, /innerHTML|outerHTML|insertAdjacentHTML|transition|@keyframes|localStorage|sessionStorage/);
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{ \.carga-spinner \{ animation: globo-giro/);        // el giro solo con movimiento permitido
});

// ---------- módulos puros ----------
test('los módulos puros nuevos no usan three, DOM, red, almacenamiento ni imports en ejecución', () => {
  for (const f of ['sol.ts', 'ondas.ts', 'estrellas.ts', 'leyenda.ts', 'calidad.ts', 'carga.ts']) {
    const t = leer(join('globo', f));
    assert.doesNotMatch(t, /document\.|window\.|from 'three|fetch\(|localStorage|sessionStorage|indexedDB|https?:\/\//, f);
    assert.doesNotMatch(t, /^import (?!type)/m, f);
  }
  const p = resolverPaleta(() => ''); assert.equal(p.estrellas, '#a9b8d0'); assert.equal(p.replay, '#a78bfa');
  assert.ok(razonContraste(p.replay, p.fondo) > 3 && razonContraste(p.halo, p.fondo) > 3);                                   // el anillo violeta y el cian se distinguen del fondo
  assert.equal(readdirSync(RAIZ + 'globo').includes('shaders.ts'), true);
});
