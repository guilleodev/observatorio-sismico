// F8 · mejoras visuales del globo, Bloque A: «vida» de los marcadores (src/app/globo/vida.ts) y su integración en la escena. Lógica pura y lectura de código. `node --test tests/*.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALFA_MIN_ANTIGUO, DURACION_ENTRADA_MS, EDAD_DESCONOCIDA, HORAS_FRESCURA, HORAS_VENTANA_VIVO, RESPIRACION_ESCALA, aparicionMarcador, edadEnHoras, factorOpacidad, frescura,
  hayDatosEnVivo, intensidadResplandor, progresoEntrada,
} from '../src/app/globo/vida.ts';
import { ordenarPorCapas, prepararPuntos } from '../src/app/globo/geometria.ts';
import type { PuntosGlobo } from '../src/app/globo/geometria.ts';

const leer = (r: string) => readFileSync(new URL(`../src/app/${r}`, import.meta.url), 'utf8');
const cerca = (a: number, b: number, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} ≠ ${b}`);
const H = 3_600_000;

test('edadEnHoras: horas desde el evento, nunca negativa; sin hora válida → EDAD_DESCONOCIDA', () => {
  const ahora = 1_800_000_000_000;
  cerca(edadEnHoras(ahora, ahora - 2 * H), 2); cerca(edadEnHoras(ahora, ahora), 0); cerca(edadEnHoras(ahora, ahora + H), 0);   // un evento «del futuro» (reloj adelantado) no da edad negativa
  for (const malo of [NaN, Infinity, -Infinity]) assert.equal(edadEnHoras(ahora, malo), EDAD_DESCONOCIDA);
  assert.equal(edadEnHoras(NaN, ahora), EDAD_DESCONOCIDA);
});

test('frescura y opacidad: 1 al nacer, decrece de forma monótona y la opacidad NUNCA baja de ALFA_MIN_ANTIGUO (el contraste del marcador se conserva)', () => {
  cerca(frescura(0), 1); cerca(frescura(HORAS_FRESCURA), Math.exp(-1)); assert.equal(frescura(-1), 0); assert.equal(frescura(NaN), 0);
  let anterior = 2;
  for (const h of [0, 0.5, 1, 3, 6, 12, 24, 48, 1000]) { const f = factorOpacidad(h); assert.ok(f <= anterior && f >= ALFA_MIN_ANTIGUO && f <= 1, `${h} h → ${f}`); anterior = f; }
  cerca(factorOpacidad(0), 1); assert.ok(factorOpacidad(1e9) < ALFA_MIN_ANTIGUO + 1e-6);
  assert.equal(factorOpacidad(EDAD_DESCONOCIDA), 1);                                  // sin hora: sin cambio
  assert.ok(ALFA_MIN_ANTIGUO >= 0.7);                                                 // suelo alto: se jerarquiza, no se esconde nada
});

test('resplandor: máximo en lo recién llegado, nulo en lo antiguo, monótono y sin resplandor sin hora', () => {
  cerca(intensidadResplandor(0), 1); assert.equal(intensidadResplandor(6), 0); assert.equal(intensidadResplandor(24), 0); assert.equal(intensidadResplandor(EDAD_DESCONOCIDA), 0);
  let anterior = 2;
  for (const h of [0, 0.25, 0.5, 1, 2, 3, 3.6, 5, 10]) { const r = intensidadResplandor(h); assert.ok(r <= anterior + 1e-12 && r >= 0 && r <= 1); anterior = r; }
});

test('hayDatosEnVivo: solo si algún evento es de las últimas HORAS_VENTANA_VIVO horas (REPRODUCCIÓN o periodos históricos → sin frescura)', () => {
  const ahora = 1_800_000_000_000;
  assert.equal(hayDatosEnVivo(Float64Array.from([ahora - 2 * H, ahora - 40 * H]), 2, ahora), true);
  assert.equal(hayDatosEnVivo(Float64Array.from([ahora - (HORAS_VENTANA_VIVO + 1) * H, ahora - 400 * H]), 2, ahora), false);
  assert.equal(hayDatosEnVivo(Float64Array.from([NaN, NaN]), 2, ahora), false);
  assert.equal(hayDatosEnVivo(undefined, 5, ahora), false); assert.equal(hayDatosEnVivo(new Float64Array(0), 0, ahora), false);
});

test('entrada escalonada: progreso 0→1 en DURACION_ENTRADA_MS, sin animación con movimiento reducido y cada marcador aparece en su turno', () => {
  assert.equal(progresoEntrada(0, false), 0); cerca(progresoEntrada(DURACION_ENTRADA_MS / 2, false), 0.5); assert.equal(progresoEntrada(DURACION_ENTRADA_MS * 3, false), 1);
  assert.equal(progresoEntrada(100, true), 1); assert.equal(progresoEntrada(-5, false), 1);
  for (const hash of [0, 0.3, 0.7, 1]) {
    assert.equal(aparicionMarcador(0, hash), hash === 0 ? 0 : 0); assert.equal(aparicionMarcador(1, hash), 1);                 // todos acaban visibles
    let anterior = -1; for (let p = 0; p <= 1; p += 0.05) { const a = aparicionMarcador(p, hash); assert.ok(a >= anterior - 1e-12); anterior = a; }
  }
  assert.ok(aparicionMarcador(0.3, 0.0) > aparicionMarcador(0.3, 1.0));                                                      // los de hash bajo entran antes
});

test('puntos: prepararPuntos y ordenarPorCapas llevan la hora de cada evento (NaN si no es válida) en el mismo orden que los ids', () => {
  const ev = (id: string, lon: number, lat: number, mag: number, time: unknown) => ({ id, geometry: { type: 'Point', coordinates: [lon, lat, 10] }, properties: { mag, place: id, time } }) as never;
  const cod = { radio: (m: unknown) => (typeof m === 'number' ? m : 1), color: () => '#fff', id: (e: { id: string }) => e.id };
  const r = prepararPuntos([ev('a', 0, 0, 2, 1000), ev('b', 10, 10, 6, 2000), ev('c', 20, 20, 4, 'mal')], cod as never);
  assert.deepEqual(Array.from(r.puntos.tiempos ?? []).map((t) => (Number.isNaN(t) ? 'NaN' : t)), [1000, 2000, 'NaN']);
  const o = ordenarPorCapas(r.puntos);                                                                                          // el de mayor radio (b) primero
  assert.deepEqual(o.ids, ['b', 'c', 'a']); assert.deepEqual(Array.from(o.tiempos ?? []).map((t) => (Number.isNaN(t) ? 'NaN' : t)), [2000, 'NaN', 1000]);
  const sin: PuntosGlobo = { ...r.puntos }; delete (sin as { tiempos?: Float64Array }).tiempos;
  assert.equal(ordenarPorCapas(sin).tiempos, undefined);                                                                       // los puntos hechos a mano (sin tiempos) siguen funcionando
});

test('escena: aEdad/uEdadExtra/uVivo/uEntrada en el shader; la edad se escribe SOLO al cambiar los datos y el fotograma solo actualiza uniforms', () => {
  const e = leer('globo/escena.ts');
  const vertice = /const VERTICE_PUNTO = `([\s\S]*?)`;/.exec(e)?.[1] ?? ''; const fragmento = /const FRAGMENTO_PUNTO = `([\s\S]*?)`;/.exec(e)?.[1] ?? '';
  for (const u of ['attribute float aEdad;', 'uniform float uEdadExtra;', 'uniform float uEntrada;', 'uniform float uVivo;']) assert.ok(vertice.includes(u), u);
  assert.match(vertice, /float efecto = uVivo \* step\(0\.0, aEdad\) \* \(1\.0 - vSel\);/);                                    // el seleccionado nunca se atenúa; sin hora, sin efecto
  assert.match(vertice, /smoothstep\(hash \* /);                                                                              // entrada escalonada por el hash de la instancia
  assert.doesNotMatch(vertice, /instanceColor\s*=|vColor\s*=\s*[^i]*fresco/);                                                  // el COLOR (profundidad) no se toca
  assert.match(fragmento, /varying float vGlow;/); assert.match(fragmento, /\* vGlow;/);
  assert.match(/private cargarEdades\(orden: PuntosGlobo\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /a\.needsUpdate = true;/);
  assert.match(/fijarEventos\(puntos: PuntosGlobo\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /this\.cargarEdades\(orden\);[\s\S]*this\.iniciarEntrada\(orden\.n\);/);
  const fot = /private readonly fotograma = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '';
  assert.match(fot, /uniforms\['uEdadExtra'\]\.value = \(Date\.now\(\) - this\.refEdadMs\) \/ 3_600_000;/);
  assert.match(fot, /const entrando = t < this\.finEntrada;/); assert.match(fot, /progresoEntrada\(t - this\.t0Entrada, false\)/);
  assert.doesNotMatch(fot, /atributoEdad|cargarEdades|setX\(/);                                                                // nada por evento en el fotograma
  assert.match(e, /private aplicarVivo\(\): void \{ this\.matPunto\.uniforms\['uVivo'\]\.value = this\.hayVivo && !this\.modoReplay \? 1 : 0; \}/);
  assert.match(/fijarReplay\(replay: boolean\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /this\.modoReplay = replay; this\.aplicarVivo\(\)/);   // REPRODUCCIÓN: sin frescura
  const entrada = /private iniciarEntrada\(n: number\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '';
  assert.match(entrada, /if \(!this\.entradaPendiente \|\| n === 0\) return;/); assert.match(entrada, /\(this\.mqMovimiento\?\.matches \?\? false\) \|\| this\.enPausa\) return;/);   // una vez; sin animación con movimiento reducido o en pausa
});

test('planeta: reborde atmosférico algo más marcado y SIN reflejo del Sol (se retiró: parecía un foco)', () => {
  const e = leer('globo/escena.ts');
  const planeta = /const FRAGMENTO_PLANETA = `([\s\S]*?)`;/.exec(e)?.[1] ?? '';
  assert.match(planeta, /uRim \* pow\(1\.0 - cara, 3\.0\) \* 0\.28/);
  assert.doesNotMatch(planeta, /viewMatrix|reflejo|oceano|vColor|uBorde/);
});

test('respiración: todos los marcadores (tamaño ±4 % y resplandor) con la fase global y el hash por instancia; uAmp = 0 con movimiento reducido; el bucle de baja tasa sigue mientras haya marcadores', () => {
  const e = leer('globo/escena.ts');
  const vertice = /const VERTICE_PUNTO = `([\s\S]*?)`;/.exec(e)?.[1] ?? '';
  assert.match(vertice, /float respira = 0\.5 \+ 0\.5 \* sin\(uFase \+ 6\.2831853 \* hash\);/);                                   // MISMA fase global y mismo hash que el pulso
  assert.match(vertice, /float escalaRespira = 1\.0 \+ \$\{RESPIRACION_ESCALA\.toFixed\(3\)\} \* uAmp \* \(2\.0 \* respira - 1\.0\) \* \(1\.0 - vSel\);/);   // ±4 %, apagada por uAmp y sin tocar al seleccionado
  assert.match(vertice, /mix\(1\.0, \$\{RESPIRACION_RESPLANDOR_MIN\.toFixed\(2\)\} \+ \$\{\(1 - RESPIRACION_RESPLANDOR_MIN\)\.toFixed\(2\)\} \* respira, uAmp\)/);
  assert.equal(RESPIRACION_ESCALA, 0.04); assert.ok(RESPIRACION_ESCALA <= 0.05);                                                  // la magnitud sigue leyéndose igual
  assert.match(e, /nPulsantes: Math\.max\(this\.nPulso, this\.malla\?\.count \?\? 0\)/);
});

// ---------- Bloque D: contador animado y reloj UTC ----------
import { DURACION_CIFRA_MS, enteroAnimable, formatearHoraUtc, progresoCifra, valorIntermedio } from '../src/app/cifra-animada.ts';

test('enteroAnimable: solo enteros sencillos (sin separadores ni decimales); «ND», «M 5.5» o «1.234» se muestran tal cual', () => {
  assert.equal(enteroAnimable('185'), 185); assert.equal(enteroAnimable(8), 8); assert.equal(enteroAnimable('0'), 0);
  for (const no of ['ND', 'M 5.5', '1.234', '', '12a', '-3', 3.5, null, undefined, '1000000', 1e9]) assert.equal(enteroAnimable(no as never), null, String(no));
});

test('progresoCifra y valorIntermedio: de desde a hasta sin salirse del intervalo, monótonos y exactos al final; entradas no válidas → valor final', () => {
  assert.equal(progresoCifra(0), 0); assert.equal(progresoCifra(DURACION_CIFRA_MS), 1); assert.equal(progresoCifra(DURACION_CIFRA_MS * 5), 1); assert.equal(progresoCifra(-1), 1); assert.equal(progresoCifra(NaN), 1);
  let anterior = -1; for (let t = 0; t <= DURACION_CIFRA_MS; t += 50) { const p = progresoCifra(t); assert.ok(p >= anterior); anterior = p; }
  assert.equal(valorIntermedio(0, 185, 0), 0); assert.equal(valorIntermedio(0, 185, 1), 185); assert.equal(valorIntermedio(100, 20, 1), 20);
  for (let p = 0; p <= 1; p += 0.1) { const v = valorIntermedio(10, 200, p); assert.ok(Number.isInteger(v) && v >= 10 && v <= 200); }
  assert.equal(valorIntermedio(5, 9, NaN), 9);
});

test('formatearHoraUtc: HH:MM en UTC con ceros a la izquierda; instante no válido → «--:--»', () => {
  assert.equal(formatearHoraUtc(Date.UTC(2026, 10, 15, 18, 5)), '18:05'); assert.equal(formatearHoraUtc(Date.UTC(2026, 0, 1, 0, 0)), '00:00'); assert.equal(formatearHoraUtc(Date.UTC(2026, 5, 1, 23, 59, 59)), '23:59');
  assert.equal(formatearHoraUtc(NaN), '--:--'); assert.equal(formatearHoraUtc(Infinity), '--:--');
});

test('componente de la cifra: texto final accesible y oculto, cifra que cuenta aria-hidden, sin animación con movimiento reducido o pestaña oculta y rAF cancelado al destruir', () => {
  const c = leer('cifra-animada.component.ts');
  assert.match(c, /template: `<span class="oculto">\{\{ final\(\) \}\}<\/span><span aria-hidden="true">\{\{ visible\(\) \}\}<\/span>`/);
  assert.match(c, /prefers-reduced-motion: reduce/); assert.match(c, /document\.hidden/); assert.match(c, /cancelAnimationFrame\(this\.raf\)/);
  assert.match(c, /inject\(DestroyRef\)\.onDestroy\(/);
  assert.doesNotMatch(c, /localStorage|sessionStorage|setInterval|setTimeout|aria-live/);
  const k = leer('estado-datos/estado-datos.component.ts');
  assert.equal((k.match(/<app-cifra \[valor\]=/g) ?? []).length, 4);                                                           // total, eventos ≥ M4.5, países y visualizados; la magnitud máxima («M 5.5») no se anima
  assert.match(k, /imports: \[CifraAnimadaComponent\]/);
});

test('reloj UTC del globo: un solo temporizador de 30 s liberado en ngOnDestroy; el texto aclara que no es la hora de los eventos', () => {
  const g = leer('globo/globo.component.ts');
  assert.match(g, /private readonly idReloj = setInterval\(\(\) => this\.reloj\.set\(formatearHoraUtc\(Date\.now\(\)\)\), 30_000\);/);
  assert.match(/ngOnDestroy\(\): void \{[\s\S]*?\n  \}/.exec(g)?.[0] ?? '', /clearInterval\(this\.idReloj\);/);
  assert.match(g, /<p class="reloj-utc" translate="no" title="Hora UTC actual: la que usa la sombra día\/noche del globo \(no es la hora de los eventos\)"><time>\{\{ reloj\(\) \}\} ?<\/time> UTC<\/p>|<time>\{\{ reloj\(\) \}\}<\/time> UTC/);
  assert.equal((g.match(/setInterval\(/g) ?? []).length, 1);
});

// ---------- etiquetas de los mayores, escala de tamaños y transición entre vistas ----------
import { ANCHO_ETIQUETA_BASE, MAX_ETIQUETAS, SEPARACION_ETIQUETAS_RAD, UMBRAL_ETIQUETA, anchoEtiqueta, elegirEtiquetados, textoEtiqueta } from '../src/app/globo/etiquetas.ts';
import { diametroPuntoMagnitud } from '../src/app/formato.ts';

test('elegirEtiquetados: los 3 mayores con M ≥ 5, de mayor a menor; sin M ≥ 5 no hay etiquetas; NaN nunca; desempate estable', () => {
  const m = Float64Array.from([2, 5.5, NaN, 6.1, 4.9, 5, 5.5, 7, 5.2]);
  assert.deepEqual(elegirEtiquetados(m, m.length), [7, 3, 1]);                            // 7,0 · 6,1 · 5,5 (el primero de los dos 5,5)
  assert.deepEqual(elegirEtiquetados(Float64Array.from([4.9, 3, NaN]), 3), []);
  assert.deepEqual(elegirEtiquetados(Float64Array.from([5, 5, 5, 5]), 4), [0, 1, 2]);      // empates: índices menores primero
  assert.deepEqual(elegirEtiquetados(m, m.length, 0), []); assert.deepEqual(elegirEtiquetados(m, 0), []);
  assert.deepEqual(elegirEtiquetados(m, m.length, 5, 6), [7, 3]);                          // umbral y máximo parametrizables
  assert.equal(MAX_ETIQUETAS, 3); assert.equal(UMBRAL_ETIQUETA, 5);
  // separación: tres eventos fuertes pegados (misma zona) → solo el mayor; los lejanos sí
  const v = (lat: number, lon: number) => { const a = (lat * Math.PI) / 180, o = (lon * Math.PI) / 180; return [Math.cos(a) * Math.cos(o), Math.sin(a), Math.cos(a) * Math.sin(o)]; };
  const pts = [v(-21, -175), v(-21.5, -175.2), v(-20, -174.5), v(35, 140), v(-33, -70)];
  const normales = Float64Array.from(pts.flat()); const mags = Float64Array.from([5.5, 6.1, 5.2, 5.8, 5.0]);
  assert.deepEqual(elegirEtiquetados(mags, 5, 3, 5, normales), [1, 3, 4]);                   // 6,1 (Tonga) · 5,8 (Japón) · 5,0 (Chile); 5,5 y 5,2 quedan junto al de 6,1
  assert.deepEqual(elegirEtiquetados(mags, 5, 3, 5), [1, 3, 0]);                             // sin normales no hay separación (compatibilidad)
  assert.equal(SEPARACION_ETIQUETAS_RAD, 0.14);
});

test('textoEtiqueta y anchoEtiqueta: «M 5,5» con coma decimal; el tamaño en pantalla se mantiene (la anchura de mundo crece con la distancia) y la entrada no válida no rompe', () => {
  assert.equal(textoEtiqueta(5.5), 'M 5,5'); assert.equal(textoEtiqueta(7), 'M 7,0'); assert.equal(textoEtiqueta(5.04), 'M 5,0'); assert.equal(textoEtiqueta(NaN), '');
  cerca(anchoEtiqueta(3.2), ANCHO_ETIQUETA_BASE); cerca(anchoEtiqueta(6.4), 2 * ANCHO_ETIQUETA_BASE); cerca(anchoEtiqueta(1.6), ANCHO_ETIQUETA_BASE / 2);
  for (const mal of [0, -1, NaN, Infinity]) cerca(anchoEtiqueta(mal), ANCHO_ETIQUETA_BASE);
});

test('escena: etiquetas como Sprites con profundidad, recreadas solo al cambiar los datos, escaladas con el zoom y liberadas al destruir; decorativas (fuera de la selección)', () => {
  const e = leer('globo/escena.ts');
  assert.match(/fijarEventos\(puntos: PuntosGlobo\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /this\.actualizarEtiquetas\(orden\);/);
  const act = /private actualizarEtiquetas\(orden: PuntosGlobo\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '';
  assert.match(act, /this\.limpiarEtiquetas\(\);/); assert.match(act, /elegirEtiquetados\(orden\.magnitudes, orden\.n, undefined, undefined, orden\.normales\)/);   // con las normales: una etiqueta por zona (sin superposición) assert.match(act, /transparent: true, depthWrite: false/);
  assert.doesNotMatch(act, /depthTest: false/);                                                                  // el planeta las oculta en la cara posterior
  assert.match(/private limpiarEtiquetas\(\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /s\.material\.map\?\.dispose\(\); s\.material\.dispose\(\);/);
  assert.match(/private readonly alCambiarCamara = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '', /this\.escalarEtiquetas\(\);/);
  assert.match(/destruir\(\): void \{[\s\S]*?\n  \}\n\}/.exec(e)?.[0] ?? '', /this\.limpiarEtiquetas\(\);/);
  assert.doesNotMatch(/private buscarBajo[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /etiquetas/);                         // no entran en la selección ni en la etiqueta al pasar el ratón
  const fot = /private readonly fotograma = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '';
  assert.doesNotMatch(fot, /actualizarEtiquetas|texturaEtiqueta/);                                                // nada de esto por fotograma
});

test('leyenda de tamaños: M 2 / M 4 / M 6 con los diámetros de la escala real de la tabla y del mapa (radioMagnitud × 16/18); círculos huecos y sin cambiar el significado del color', () => {
  const css = leer('app.component.css'); const html = leer('app.component.html');
  assert.match(html, /<div class="leyenda-tamano" role="group" aria-label="Tamaño según la magnitud: M 2 pequeño, M 4 mediano, M 6 o más grande">/);
  for (const [clase, m] of [['t2', 2], ['t4', 4], ['t6', 6]] as const) {
    const d = diametroPuntoMagnitud(m) as number;
    assert.match(css, new RegExp(`\.circulo-tamano\.${clase} \{ width: ${d.toFixed(1).replace(/\.0$/, '')}px; height: ${d.toFixed(1).replace(/\.0$/, '')}px; \}`), `${clase} → ${d} px`);
  }
  assert.match(css, /\.circulo-tamano \{[^}]*border: 1\.5px solid var\(--texto-2\)[^}]*border-radius: 50%/);        // hueco: el relleno es de la profundidad
  assert.doesNotMatch(/\.circulo-tamano \{[^}]*\}/.exec(css)?.[0] ?? '', /background/);
});

test('transición entre vistas: fundido de opacidad de 180 ms definido en styles.css y solo con movimiento permitido (no en la hoja de la app)', () => {
  const g = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8'); const app = leer('app.component.css');
  assert.match(g, /@media \(prefers-reduced-motion: no-preference\) \{\s*@keyframes entrada-vista \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}\s*\.vista-seccion:not\(\[hidden\]\) \{ animation: entrada-vista \.18s ease-out; \}/);
  assert.doesNotMatch(g.slice(g.indexOf('entrada-vista') - 5, g.indexOf('entrada-vista') + 260), /transform/);   // solo opacidad
  assert.doesNotMatch(app, /@keyframes|animation\s*:/);
});
