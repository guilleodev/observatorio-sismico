// F8 · mejoras de interfaz, FASE 1 (2026-11-15): metodología contraída, franja del seleccionado retirada, cabecera móvil de dos filas, logo/título como enlace al Panel,
// globo más lejano en visores verticales y bajada a la ficha en móvil. Lógica pura (distanciaInicialPara) y comprobaciones de lectura de código. `node --test tests/*.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DISTANCIA_INICIAL, DISTANCIA_MAX, FOV_GLOBO, OCUPACION_ANCHO_VERTICAL, RADIO_ESFERA, distanciaInicialPara, radioEsferaPx,
} from '../src/app/globo/geometria.ts';

const app = (r: string) => readFileSync(new URL(`../src/app/${r}`, import.meta.url), 'utf8');
const ts = () => app('app.component.ts');
const html = () => app('app.component.html');
const css = () => app('app.component.css');

// ---------- globo: distancia inicial según la proporción del visor ----------
test('distanciaInicialPara: escritorio y visores horizontales NO cambian (3,2); en vertical se aleja, de forma monótona y con tope', () => {
  for (const a of [1, 1.2, 1.78, 2.4, 5]) assert.equal(distanciaInicialPara(a), DISTANCIA_INICIAL);
  for (const malo of [0, -1, NaN, Infinity, -Infinity]) assert.equal(distanciaInicialPara(malo), DISTANCIA_INICIAL);
  let anterior = DISTANCIA_INICIAL;
  for (const a of [0.95, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]) {                       // cada vez más estrecho → nunca más cerca
    const d = distanciaInicialPara(a);
    assert.ok(d >= anterior - 1e-12 && d >= DISTANCIA_INICIAL && d <= DISTANCIA_MAX - 0.5 + 1e-12, `aspecto ${a} → ${d}`);
    anterior = d;
  }
  assert.equal(distanciaInicialPara(0.01), DISTANCIA_MAX - 0.5);                          // tope: no se sale del rango de los controles
});

test('distanciaInicialPara: en un móvil vertical (375 × 530) la esfera cabe en el ancho con margen y antes quedaba recortada', () => {
  const ancho = 375, alto = 530, aspecto = ancho / alto;
  const radioAntes = radioEsferaPx(alto, FOV_GLOBO, DISTANCIA_INICIAL);                   // radio vertical a 3,2 (px)
  assert.ok(radioAntes > ancho / 2, 'con la distancia antigua la esfera era más ancha que la pantalla (recorte lateral)');
  // radio horizontal aparente: tan(asin(R/d)) / (tan(fov/2) · aspecto) · ancho/2
  const radioHoriz = (d: number) => (Math.tan(Math.asin(RADIO_ESFERA / d)) / (Math.tan((FOV_GLOBO * Math.PI) / 360) * aspecto)) * (ancho / 2);
  assert.ok(radioHoriz(DISTANCIA_INICIAL) > ancho / 2);
  const d = distanciaInicialPara(aspecto);
  assert.ok(d > DISTANCIA_INICIAL && d < DISTANCIA_MAX);
  assert.ok(Math.abs(radioHoriz(d) - OCUPACION_ANCHO_VERTICAL * (ancho / 2)) < 0.5, `ocupa ${(radioHoriz(d) / (ancho / 2)).toFixed(3)} del ancho`);
});

test('escena: la distancia predeterminada sale de la primera medida válida del visor y la usa «Restablecer» (recuperarVista); no se toca el zoom de selección', () => {
  const e = readFileSync(new URL('../src/app/globo/escena.ts', import.meta.url), 'utf8');
  assert.match(e, /this\.distanciaPred = distanciaInicialPara\(w \/ h\);/);
  assert.match(e, /if \(!this\.medidaInicialHecha\) \{ this\.medidaInicialHecha = true; this\.colocarCamara\(LAT_INICIAL, LON_INICIAL, this\.distanciaPred\); \}/);
  assert.match(e, /planificarRecuperacion\(this\.poseActual\(\), this\.distanciaPred\)/);
  assert.doesNotMatch(e, /planificarRecuperacion\(this\.poseActual\(\), DISTANCIA_INICIAL\)/);
  const orden = e.indexOf('if (w === 0 || h === 0'); assert.ok(orden > 0 && orden < e.indexOf('this.distanciaPred = distanciaInicialPara'));   // solo con medida válida (≠ 0)
});

// ---------- metodología contraída ----------
test('Análisis: «Metodología y estado del sistema» arranca contraída y se abre desde «Ver detalle» y «Cargar el resto»', () => {
  assert.match(ts(), /readonly metodologiaAbierta = signal\(false\);/);
  assert.match(ts(), /verMetodologia\(\): void \{ this\.metodologiaAbierta\.set\(true\); this\.irAVista\('analisis', 'metodologia-titulo'\); \}/);
  assert.match(html(), /<details class="metodo" \[open\]="metodologiaAbierta\(\)"/);
});

// ---------- cabecera: logo y título como enlace al Panel ----------
test('cabecera: logo y título son UN enlace real a #/panel que vuelve arriba y actualiza los datos', () => {
  const h = html();
  assert.match(h, /<a class="cab-id" href="#\/panel" title="Ir al Panel y actualizar los datos" \(click\)="\$event\.preventDefault\(\); irAlInicio\(\)">/);
  const cab = h.slice(h.indexOf('<a class="cab-id"'), h.indexOf('</a>', h.indexOf('<a class="cab-id"')));
  assert.match(cab, /<app-icono nombre="marca" \/>/); assert.match(cab, /<h1>/);               // marca y h1 dentro del enlace
  assert.ok(h.indexOf('<a class="cab-id"') < h.indexOf('<nav class="nav-vistas"'));             // el orden de foco no cambia: identidad → nav → estado
  assert.match(ts(), /irAlInicio\(\): void \{ this\.irAVista\('panel'\); this\.actualizarAhora\(\); \}/);
  assert.match(ts(), /actualizarAhora\(\): void \{\s*\n\s*if \(!this\.config \|\| this\.config\.mode !== 'api'\) return;/);   // sin modo API no hace nada
  assert.match(css(), /\.cab-id:focus-visible \{ outline: 3px solid var\(--foco\)/);          // foco visible
});

// ---------- Eventos: franja retirada ----------
test('Eventos: sin franja «Evento seleccionado» ni botón «Ir al evento seleccionado»; «Ver en el globo/mapa» sigue en la tabla', () => {
  assert.doesNotMatch(html(), /franja-seleccion|Ir al evento seleccionado|lugarSeleccionado/);
  assert.doesNotMatch(css(), /\.franja-(seleccion|texto|acciones)/);
  assert.match(html(), /\(verVisor\)="verEnVisor\(\)"/);
});

// ---------- móvil: bajar a la ficha al seleccionar ----------
test('móvil: al elegir un evento en el Panel se baja suavemente a la ficha solo si no se ve, sin animación con «reducir movimiento» y sin mover el foco', () => {
  const t = ts();
  assert.match(t, /if \(destino === null\) \{ this\.map\?\.closePopup\(\); return; \}\s*\n\s*this\.mostrarFichaEnMovil\(\);/);
  const f = /private mostrarFichaEnMovil\(\): void \{([\s\S]*?)\n  \}/.exec(t)?.[1] ?? '';
  assert.match(f, /this\.vista\(\) !== 'panel' \|\| !window\.matchMedia\('\(max-width: 767px\)'\)\.matches\) return;/);   // solo Panel y móvil
  assert.match(f, /afterNextRender\(/);                                                                                    // cuando la ficha ya está pintada…
  assert.match(f, /setTimeout\(\(\) => \{[\s\S]*?\}, 150\);/);                                                            // …y con el diseño asentado (150 ms)
  assert.match(f, /getBoundingClientRect\(\)\.top < window\.innerHeight \* 0\.6\) return;/);                              // si ya se ve, no se mueve
  assert.match(f, /prefers-reduced-motion: reduce/); assert.match(f, /behavior: reducir \? 'auto' : 'smooth'/);
  assert.doesNotMatch(f, /\.focus\(/);
  const g = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(g, /scroll-padding-top: calc\(var\(--alto-cabecera\) \+ var\(--esp-3\)\)/);                                  // la ficha no queda bajo la cabecera sticky (padding global; NO se suma otro margen)
  assert.doesNotMatch(css(), /\.o-detalle \{ scroll-margin-top/);
});

// ---------- móvil: cabecera de dos filas y objetivos táctiles ----------
test('móvil: la nav ocupa su propia fila con tres objetivos de 44 px y --alto-cabecera cubre las dos filas (48 + 52)', () => {
  const c = css(); const g = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(g, /@media \(max-width: 767px\) \{ :root \{ --alto-cabecera: 100px; \} \}/);
  assert.match(c, /grid-template-rows: 48px 52px;/);
  assert.match(c, /\.nav-vistas a \{ min-height: 44px;/);
  assert.match(c, /\.cab-id \{ grid-row: 1; grid-column: 1 \/ 3;/);
  assert.match(c, /\.cab-estado \{ grid-row: 1; grid-column: 3;/);
});
