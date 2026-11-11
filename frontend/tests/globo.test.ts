// Globo 3D (F7): geometría y selección PURAS (src/app/globo/geometria.ts) y comprobaciones de lectura de código de escena, componente y plantilla.
// No se puede usar WebGL con `node --test`: lo que dibuja three se verifica en el navegador; aquí se prueba lo que decide QUÉ se dibuja y QUÉ se selecciona.
// `node --test tests/*.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  ANCHO_PANEL_PX, DISTANCIA_INICIAL, DISTANCIA_MAX, DISTANCIA_MIN, ELEVACION_PUNTO, EPS_EMPATE, FACTOR_RADIO, FOV_GLOBO, LAT_INICIAL, MARGEN_CARA, MARGEN_PANEL_PX, MAX_EVENTOS_GLOBO, MIN_PX_TACTIL,
  TOKENS_GLOBO, UMBRAL_CLIC_PX, desplazamientoCentroPx, distanciaTrasZoom, esCaraVisible, esClic, idsPorMagnitud, interseccionEsferaRayo, latLonAXyz, ordenarPorCapas, prepararPuntos,
  pxPorUnidad, radioEsferaPx, resolverPaleta, segmentosFronteras, segmentosReticula, seleccionarPorProximidad, seleccionarPorRayo, umbralAngular, vecinoEnLista,
} from '../src/app/globo/geometria.ts';
import type { Xyz } from '../src/app/globo/geometria.ts';
import { DT_MAX_MS, MaquinaRotacion, RAMPA_MS, RETARDO_REANUDAR_MS, VELOCIDAD_GRADOS_S, VELOCIDAD_RAD_S } from '../src/app/globo/rotacion.ts';
import {
  DT_MAX_TRANSICION_MS, DURACION_TRANSICION_MS, FACTOR_ACERCAR_SELECCION, PHI_ENDEREZADO_MAX, PHI_ENDEREZADO_MIN, PHI_MAX, PHI_MIN, REGIONES, TOLERANCIA_ZOOM, TransicionCamara, UP_VERTICAL,
  ZOOM_SIN_SESION, acotarPhi, acotarPhiEnderezado, distanciaAcercada, esTransicionNula, normalizarDiferenciaAngulo, planificarRecuperacion, planificarZoomSeleccion, poseDeLatLon, poseDeNormal,
  regionPorId, suavizar,
} from '../src/app/globo/camara.ts';
import type { PoseCamara } from '../src/app/globo/camara.ts';
import {
  ALFA_HALO, AMPLITUD_HALO, ESCALA_QUAD, INTERVALO_PULSO_MS, PERIODO_PULSO_S, PULSO_SIGUE_PAUSA_ROTACION, UMBRAL_MAG_PULSO, alfaAcumulada, amplitudPulso, contarPulsantes, factorPulso, faseGlobal,
  hayPulso, mezclarSrgb,
} from '../src/app/globo/pulso.ts';
import { INTERVALO_TOOLTIP_MS, SEPARACION_TOOLTIP_PX, esperaTooltipMs, posicionarTooltip, textoTooltip, tooltipPermitido } from '../src/app/globo/tooltip.ts';
import type { ContextoTooltip } from '../src/app/globo/tooltip.ts';
import { ROTACION_Y_TEXTURA, desplazamientosVisibles, dibujarTierra, normalizarAnillo, poligonosDe, tamanoTextura } from '../src/app/globo/textura.ts';
import { generarEventosSinteticos } from '../src/app/globo/eventos-prueba.ts';
import { BORDE_MAPA_OSCURO, FONDO_MAPA, SELECCION_MAPA, colorProfundidad, filasFicha, radioMagnitud, razonContraste, textoMagnitud } from '../src/app/formato.ts';
import { idDe } from '../src/app/tabla.ts';
import type { Evento } from '../src/app/modelos.ts';

const RAIZ = fileURLToPath(new URL('../src/app/', import.meta.url));
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const estilos = () => readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const COD = { radio: radioMagnitud, color: colorProfundidad, id: idDe };
const cerca = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const norma = (v: Xyz) => Math.hypot(v[0], v[1], v[2]);

const ev = (id: string | undefined, lon: number, lat: number, mag: number | null = 4, prof: number | null = 10): Evento => ({
  type: 'Feature', ...(id === undefined ? {} : { id }), geometry: { type: 'Point', coordinates: [lon, lat, prof] }, properties: { mag, place: 'x', time: 0, updated: 0 },
});
const puntos = (...e: Evento[]) => prepararPuntos(e, COD).puntos;
const CAMARA: Xyz = [0, 0, DISTANCIA_INICIAL];
const PX = 226; // ≈ píxeles por unidad con la cámara inicial en un lienzo de 600 px de alto (fov 40°)

// ---------- convención de coordenadas ----------
test('latLonAXyz: (0,0) → +Z, polos → ±Y, (0,90) → +X, (0,−90) → −X, (0,180) → −Z; radio y norma', () => {
  const casos: [number, number, Xyz][] = [[0, 0, [0, 0, 1]], [90, 0, [0, 1, 0]], [-90, 33, [0, -1, 0]], [0, 90, [1, 0, 0]], [0, -90, [-1, 0, 0]], [0, 180, [0, 0, -1]]];
  for (const [lat, lon, esperado] of casos) { const r = latLonAXyz(lat, lon); for (let i = 0; i < 3; i++) cerca(r[i], esperado[i], 1e-12); }
  cerca(norma(latLonAXyz(37.5, -122.3, 2)), 2, 1e-12);                               // el radio se respeta
  const [x, y, z] = latLonAXyz(45, 45); cerca(y, Math.SQRT1_2, 1e-12); cerca(x, 0.5, 1e-12); cerca(z, 0.5, 1e-12);
});

// ---------- eventos → puntos: mismo criterio y la misma codificación que el 2D ----------
test('prepararPuntos: mismo criterio que dibujar() del 2D (Point, finitos, |lon| <= 180, |lat| <= 90) y recuento de omitidos', () => {
  const buenos = [ev('a', 0, 0), ev('b', 180, 90), ev('c', -180, -90), ev('d', 10.5, -20.25)];
  const malos: Evento[] = [
    { type: 'Feature', id: 'm1', geometry: null, properties: { mag: 1, place: 'x', time: 0, updated: 0 } },
    ev('m2', 180.0001, 0), ev('m3', 0, 90.5), ev('m4', NaN, 0), ev('m5', 0, Infinity),
    { type: 'Feature', id: 'm6', geometry: { type: 'Point', coordinates: ['1' as unknown as number, 2] }, properties: { mag: 1, place: 'x', time: 0, updated: 0 } },
    { type: 'Feature', id: 'm7', geometry: { type: 'Point', coordinates: [] }, properties: { mag: 1, place: 'x', time: 0, updated: 0 } },
    { type: 'Feature', id: 'm8', geometry: { type: 'Point', coordinates: [1, 2, 3] }, properties: undefined as never },
  ];
  const r = prepararPuntos([...malos.slice(0, 4), ...buenos, ...malos.slice(4)], COD);
  assert.equal(r.dibujados, 4); assert.equal(r.puntos.n, 4); assert.equal(r.omitidos, 8); assert.equal(r.recortados, 0);
  assert.deepEqual(r.puntos.ids, ['a', 'b', 'c', 'd']);
  // referencia: el criterio literal del 2D
  const criterio = (e: Evento) => { const c = e.geometry?.type === 'Point' ? e.geometry.coordinates : []; const [lon, lat] = c; return !(!e.properties || typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90); };
  const todos = [...malos, ...buenos];
  assert.equal(prepararPuntos(todos, COD).dibujados, todos.filter(criterio).length);
  // y el código del 2D y el del globo contienen la misma condición
  const condicion = "!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90";
  assert.ok(leer('app.component.ts').includes(condicion)); assert.ok(leer('globo/geometria.ts').includes(condicion));
});

test('prepararPuntos: radio por radioMagnitud (mismos tamaños relativos), color por colorProfundidad (mismos hex) y el mismo id que la tabla', () => {
  const lista = [ev('p1', 1, 1, 0, 5), ev('p2', 2, 2, 4.5, 100), ev('p3', 3, 3, 8, 350), ev('p4', 4, 4, null, null), ev(undefined, 5, 5, 2, 70)];
  const { puntos: p } = prepararPuntos(lista, COD);
  lista.forEach((e, i) => {
    cerca(p.radios[i], radioMagnitud(e.properties.mag) * FACTOR_RADIO, 1e-7);
    assert.equal(p.colores[i], colorProfundidad(e.geometry?.type === 'Point' ? e.geometry.coordinates[2] : undefined));
    assert.equal(p.ids[i], idDe(e, i));
  });
  assert.equal(p.ids[4], 'sin-id-4');                                               // sin id: la posición en la lista ORIGINAL, como en la tabla
  cerca(p.radios[2] / p.radios[0], radioMagnitud(8) / radioMagnitud(0), 1e-5);      // proporciones idénticas al 2D
  assert.ok(Number.isNaN(p.magnitudes[3]));                                         // sin magnitud: NaN, no 0
  assert.deepEqual(p.colores.slice(0, 4), ['#e8a317', '#e35b37', '#7b3fb6', '#64748b']);
  cerca(p.radioMax, radioMagnitud(8) * FACTOR_RADIO, 1e-7);
  for (let i = 0; i < p.n; i++) cerca(Math.hypot(p.normales[3 * i], p.normales[3 * i + 1], p.normales[3 * i + 2]), 1, 1e-6);
});

test('el tope técnico NUNCA es silencioso: recortados cuenta lo no dibujado y los omitidos siguen separados', () => {
  assert.equal(MAX_EVENTOS_GLOBO, 100_000);
  const lista = [ev('a', 0, 0), ev('b', 1, 1), ev('x', 999, 0), ev('c', 2, 2), ev('d', 3, 3), ev('e', 4, 4)];
  const r = prepararPuntos(lista, COD, 3);
  assert.deepEqual([r.dibujados, r.omitidos, r.recortados, r.tope], [3, 1, 2, 3]);
  assert.equal(r.dibujados + r.omitidos + r.recortados, lista.length);              // todo evento está contabilizado
  assert.equal(prepararPuntos(lista, COD).recortados, 0);                           // sin tope alcanzado, nada se recorta
});

// ---------- rayo y esfera ----------
test('interseccionEsferaRayo: cara visible, rayo fallido, esfera detrás y tangente', () => {
  const g = interseccionEsferaRayo([0, 0, 3.2], [0, 0, -1])!;
  cerca(g.distancia, 2.2); for (const [i, v] of [0, 0, 1].entries()) cerca(g.punto[i], v);
  assert.equal(interseccionEsferaRayo([0, 0, 3.2], [0, 1, 0]), null);               // no corta
  assert.equal(interseccionEsferaRayo([0, 0, 3.2], [0, 0, 1]), null);               // la esfera queda detrás
  assert.equal(interseccionEsferaRayo([0, 2, 3.2], [0, 0, -1]), null);
  const oblicuo = interseccionEsferaRayo([0, 0.5, 3.2], [0, 0, -1])!;                // más cerca de la cámara que el punto de salida
  assert.ok(oblicuo.punto[2] > 0); cerca(norma(oblicuo.punto), 1, 1e-12);
});

test('pxPorUnidad y umbralAngular: fórmula alturaPx / (2·d·tan(fov/2)) y θ = max(r_visual, minPx / pxPorUnidad)', () => {
  cerca(pxPorUnidad(600, 40, 2.2), 600 / (2 * 2.2 * Math.tan(Math.PI / 9)), 1e-9);
  assert.ok(pxPorUnidad(600, 40, 4.4) < pxPorUnidad(600, 40, 2.2));                  // más lejos, menos píxeles por unidad
  cerca(umbralAngular(0.009, 226), MIN_PX_TACTIL / 226, 1e-12);                       // evento pequeño: manda la zona táctil
  cerca(umbralAngular(0.054, 1000), 0.054, 1e-12);                                    // círculo grande y zoom alto: manda su radio
  assert.ok(umbralAngular(0.009, 100) > umbralAngular(0.009, 400));                   // el umbral crece al alejar
  assert.equal(umbralAngular(0.01, 0), Math.PI);                                      // sin escala válida: no se descarta nada
});

test('esCaraVisible: horizonte n·u > R/|cámara| (+ margen)', () => {
  const [x, y, z] = latLonAXyz(0, 60); assert.ok(esCaraVisible(x, y, z, CAMARA));      // cos 60° = 0,5 > 0,3325
  const [x2, y2, z2] = latLonAXyz(0, 71); assert.ok(!esCaraVisible(x2, y2, z2, CAMARA)); // cos 71° = 0,3256 < 0,3325 (margen incluido)
  const [x3, y3, z3] = latLonAXyz(0, 180); assert.ok(!esCaraVisible(x3, y3, z3, CAMARA));
  assert.ok(esCaraVisible(...latLonAXyz(0, 71), CAMARA, 0));                             // sin margen, 71° aún está dentro del disco (límite 71,8°)
  assert.equal(MARGEN_CARA, 0.02);
});

// ---------- selección por proximidad ----------
test('selección: elige el evento MÁS cercano al impacto, dentro del umbral (que depende del radio visual y del zoom)', () => {
  const p = puntos(ev('lejos', 3, 0, 8), ev('cerca', 1, 0, 1));
  const hit = latLonAXyz(0, 0.8);
  assert.equal(seleccionarPorProximidad(p, hit, CAMARA, PX)?.id, 'cerca');            // gana el más cercano aunque el otro tenga más magnitud
  assert.equal(seleccionarPorProximidad(p, latLonAXyz(0, 2.9), CAMARA, PX)?.id, 'lejos');
  // umbral: mag 4 → r = 13·0,003 = 0,039 rad; con 226 px/unidad la zona táctil (12 px) es 0,0531 rad (3,04°)
  const uno = puntos(ev('u', 0, 0, 4));
  assert.equal(seleccionarPorProximidad(uno, latLonAXyz(0, 2.5), CAMARA, PX)?.id, 'u');   // 2,5° = 0,0436 rad: dentro
  assert.equal(seleccionarPorProximidad(uno, latLonAXyz(0, 4), CAMARA, PX), null);         // 4° = 0,0698 rad: fuera
  assert.equal(seleccionarPorProximidad(uno, latLonAXyz(0, 2.5), CAMARA, 400), null);      // al acercar (más px/unidad) el umbral baja a 0,039 rad: ya no
  const grande = puntos(ev('g', 0, 0, 8));                                                 // r = 18·0,003 = 0,054 rad (3,09°) manda sobre la zona táctil con mucho zoom
  assert.equal(seleccionarPorProximidad(grande, latLonAXyz(0, 3), CAMARA, 1000)?.id, 'g');
  assert.equal(seleccionarPorProximidad(grande, latLonAXyz(0, 3.2), CAMARA, 1000), null);
});

test('selección: los eventos de la cara oculta NO se pueden seleccionar (aunque estén dentro del umbral del impacto)', () => {
  const trasera = puntos(ev('atras', 180, 0, 8));
  assert.equal(seleccionarPorProximidad(trasera, latLonAXyz(0, 180), CAMARA, PX), null);   // impacto en la cara oculta (imposible con un rayo, pero la función lo rechaza)
  // sobre el horizonte: impacto a 70,5° (visible), evento a 71° (pasado el horizonte con margen) y otro a 60°
  const p = puntos(ev('horizonte', 71, 0, 8), ev('visible', 60, 0, 1));
  assert.equal(seleccionarPorProximidad(p, latLonAXyz(0, 70.5), CAMARA, PX), null);
  assert.equal(seleccionarPorProximidad(p, latLonAXyz(0, 60.4), CAMARA, PX)?.id, 'visible');
  // por rayo: el rayo central entra por la cara visible; el evento del lado opuesto no se selecciona jamás
  const vista = { alturaPx: 600, fovGrados: 40 };
  assert.equal(seleccionarPorRayo(puntos(ev('opuesto', 180, 0, 8)), CAMARA, [0, 0, -1], vista), null);
  assert.equal(seleccionarPorRayo(puntos(ev('opuesto', 180, 0, 8), ev('centro', 0, 0, 1)), CAMARA, [0, 0, -1], vista)?.id, 'centro');
});

test('selección: empates deterministas (mayor magnitud, luego id menor), independientes del orden; solapados; vacío', () => {
  const dup = [ev('b', 10, 0, 6), ev('a', 10, 0, 6), ev('c', 10, 0, 5), ev('d', 10, 0, null)];
  const hit = latLonAXyz(0, 10);
  assert.equal(seleccionarPorProximidad(puntos(...dup), hit, CAMARA, PX)?.id, 'a');                 // misma posición y magnitud 6: id menor
  assert.equal(seleccionarPorProximidad(puntos(...[...dup].reverse()), hit, CAMARA, PX)?.id, 'a');  // el orden de entrada no importa
  assert.equal(seleccionarPorProximidad(puntos(ev('s', 10, 0, null), ev('m', 10, 0, 0.1)), hit, CAMARA, PX)?.id, 'm'); // sin magnitud pierde frente a cualquier valor
  // simétricos: lon 9 y 11 a la misma distancia del impacto (lon 10): empate dentro de EPS → gana la mayor magnitud
  assert.ok(EPS_EMPATE >= 1e-7 && EPS_EMPATE <= 1e-5);
  assert.equal(seleccionarPorProximidad(puntos(ev('izq', 9, 0, 3), ev('der', 11, 0, 5)), hit, CAMARA, PX)?.id, 'der');
  // solapados SIN empate: gana el realmente más cercano aunque tenga menos magnitud
  assert.equal(seleccionarPorProximidad(puntos(ev('izq', 9.5, 0, 8), ev('der', 10.3, 0, 1)), hit, CAMARA, PX)?.id, 'der');
  // vacío
  assert.equal(seleccionarPorProximidad(puntos(), hit, CAMARA, PX), null);
  assert.equal(seleccionarPorProximidad(puntos(ev('lejos', 40, 0)), hit, CAMARA, PX), null);
  assert.equal(seleccionarPorProximidad(puntos(ev('x', 10, 0)), [0, 0, 0], CAMARA, PX), null);
});

test('selección por rayo: el rayo hacia un evento lo selecciona; un rayo que no corta la esfera no selecciona nada', () => {
  const vista = { alturaPx: 600, fovGrados: 40 };
  const p = puntos(ev('e30', 30, 10, 5), ev('e0', 0, 0, 5));
  const objetivo = latLonAXyz(10, 30);
  const dir: Xyz = [objetivo[0] - CAMARA[0], objetivo[1] - CAMARA[1], objetivo[2] - CAMARA[2]];
  const r = seleccionarPorRayo(p, CAMARA, dir, vista)!;
  assert.equal(r.id, 'e30'); assert.equal(p.ids[r.indice], 'e30'); assert.ok(r.angulo < 1e-5);
  assert.equal(seleccionarPorRayo(p, CAMARA, [0, 1, 0], vista), null);
  assert.equal(seleccionarPorRayo(p, CAMARA, [0.6, 0, -1], vista), null);              // pasa de largo por el lado
});

test('rendimiento: selección con 20 000 eventos sintéticos muy por debajo de 50 ms (es un único bucle O(n))', () => {
  const { puntos: p, dibujados } = prepararPuntos(generarEventosSinteticos(20_000, 7), COD);
  assert.equal(dibujados, 20_000);
  const vista = { alturaPx: 600, fovGrados: 40 };
  const veces = 30; const t0 = performance.now(); let aciertos = 0;
  for (let k = 0; k < veces; k++) { const objetivo = latLonAXyz((k * 7) % 60 - 30, (k * 13) % 100 - 50); if (seleccionarPorRayo(p, CAMARA, [objetivo[0], objetivo[1], objetivo[2] - CAMARA[2]], vista) !== null) aciertos++; }
  const media = (performance.now() - t0) / veces;
  assert.ok(media < 50, `selección media ${media.toFixed(2)} ms`);
  assert.ok(aciertos > 0);                                                              // la prueba no es vacía: hay eventos cerca de los rayos
  assert.equal(prepararPuntos(generarEventosSinteticos(20_000, 7), COD).puntos.ids[123], 'prueba-123'); // el generador es determinista
});

test('esClic: un gesto de hasta 6 px es clic; más, arrastre', () => {
  assert.equal(UMBRAL_CLIC_PX, 6);
  assert.ok(esClic(0, 0)); assert.ok(esClic(3, 4)); assert.ok(esClic(-6, 0));
  assert.ok(!esClic(5, 5)); assert.ok(!esClic(0, 6.5)); assert.ok(!esClic(30, 0));
});

test('navegación por teclado: lista por magnitud descendente (sin magnitud al final) y vecino circular', () => {
  const p = puntos(ev('b', 0, 0, 4), ev('a', 1, 1, 4), ev('z', 2, 2, 7), ev('n', 3, 3, null));
  const lista = idsPorMagnitud(p);
  assert.deepEqual(lista, ['z', 'a', 'b', 'n']);
  assert.equal(vecinoEnLista(lista, null, 1), 'z'); assert.equal(vecinoEnLista(lista, null, -1), 'n');
  assert.equal(vecinoEnLista(lista, 'z', 1), 'a'); assert.equal(vecinoEnLista(lista, 'n', 1), 'z'); assert.equal(vecinoEnLista(lista, 'z', -1), 'n');
  assert.equal(vecinoEnLista(lista, 'desaparecido', 1), 'z'); assert.equal(vecinoEnLista([], 'z', 1), null);
});

// ---------- líneas, paleta y cámara ----------
test('retícula y fronteras: pares de vértices sobre la esfera, subdivididos y sin datos inválidos', () => {
  const r = segmentosReticula(1.0003);
  assert.equal(r.length % 6, 0); assert.ok(r.length > 0);
  for (let i = 0; i < r.length; i += 3) cerca(Math.hypot(r[i], r[i + 1], r[i + 2]), 1.0003, 1e-5);
  const cuadrado = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] };
  const f = segmentosFronteras(cuadrado, 1.0008, 3);
  assert.equal(f.length, 4 * 4 * 6);                                                   // 4 lados de ≈ 10° en tramos de <= 3°: 4 tramos cada uno
  for (let i = 0; i < f.length; i += 3) cerca(Math.hypot(f[i], f[i + 1], f[i + 2]), 1.0008, 1e-5);
  for (let i = 0; i < f.length; i += 6) { const a: Xyz = [f[i], f[i + 1], f[i + 2]]; const b: Xyz = [f[i + 3], f[i + 4], f[i + 5]]; assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= 3.01 * Math.PI / 180 * 1.0008); }
  const coleccion = { type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1]]], [[[5, 5], [6, 5], [6, 6]]]] } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } },
    { type: 'Feature', geometry: null }] };
  assert.equal(segmentosFronteras(coleccion, 1, 2).length, (2 + 2 + 1) * 6 + 0);       // 2 + 2 tramos de los polígonos + 1 de la línea (cada uno < 2°, aunque la diagonal mide 1,41°)
  assert.equal(segmentosFronteras({ type: 'Polygon', coordinates: [[[0, 0], [NaN, 1], [5, 5]]] }, 1).length, 0);   // el punto inválido corta el trazo
  assert.equal(segmentosFronteras(null, 1).length, 0); assert.equal(segmentosFronteras('x', 1).length, 0);
  // tramo que cruza el antimeridiano: mide 2° reales sobre la esfera (no 358° de diferencia de longitud), así que con 3 de máximo es UN solo segmento
  assert.equal(segmentosFronteras({ type: 'LineString', coordinates: [[179, 0], [-179, 0]] }, 1, 3).length, 6);
});

test('paleta: los respaldos coinciden con styles.css, cada token se lee si es un hex válido y el borde claro cumple 3:1 sobre la esfera', () => {
  const css = estilos();
  for (const [token, hex] of Object.values(TOKENS_GLOBO)) assert.match(css, new RegExp(`${token}: ${hex};`), token);
  assert.equal(TOKENS_GLOBO.seleccion[1], SELECCION_MAPA.oscuro); assert.equal(TOKENS_GLOBO.borde[1], BORDE_MAPA_OSCURO);
  const p = resolverPaleta((t) => (t === '--superficie-2' ? ' #ABCDEF ' : t === '--fondo' ? 'rojo' : ''));
  assert.equal(p.esfera, '#abcdef'); assert.equal(p.fondo, TOKENS_GLOBO.fondo[1]); assert.equal(p.reticula, TOKENS_GLOBO.reticula[1]);
  // contraste de los marcadores (WCAG 1.4.11): se mide para ESTE fondo, no se hereda del mapa 2D
  const defecto = resolverPaleta(() => '');
  assert.ok(razonContraste(defecto.borde, defecto.esfera) >= 3, 'borde sobre la esfera');
  assert.ok(razonContraste(defecto.borde, defecto.fondo) >= 3, 'borde sobre el fondo');
  assert.ok(razonContraste(defecto.seleccion, defecto.esfera) >= 3, 'anillo de selección sobre la esfera');
  assert.ok(razonContraste(colorProfundidad(300), defecto.esfera) < 3);                 // el relleno violeta solo NO basta: de ahí el borde claro del disco
  assert.ok(razonContraste(defecto.esfera, FONDO_MAPA.oscuro) < 1.3);                  // la esfera es un azul muy oscuro, de la misma familia que el fondo del mapa
});

test('zoom: factor 0,8 / 1,25 dentro de [mín, máx]', () => {
  cerca(distanciaTrasZoom(3.2, 1), 2.56); cerca(distanciaTrasZoom(3.2, -1), 4);
  assert.equal(distanciaTrasZoom(DISTANCIA_MIN, 1), DISTANCIA_MIN); assert.equal(distanciaTrasZoom(DISTANCIA_MAX, -1), DISTANCIA_MAX);
  assert.ok(DISTANCIA_MIN > 1 + ELEVACION_PUNTO * 2);                                    // la cámara nunca atraviesa la capa de puntos
  cerca(distanciaTrasZoom(distanciaTrasZoom(3.2, 1), -1), 3.2);
});

// ---------- lectura de código ----------
function fuentes(dir: string): string[] { return readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => /\.(ts|html)$/.test(f)); }

test('three vive SOLO en escena.ts y se carga con import() dinámico (chunk aparte); el componente solo importa su tipo', () => {
  for (const f of fuentes(RAIZ)) {
    const t = leer(f);
    if (f.replace(/\\/g, '/') === 'globo/escena.ts') continue;
    if (f.replace(/\\/g, '/') === 'globo/previa.ts') continue;   // CAMBIO (pulido Eventos): la vista previa 3D de la tabla también importa three, pero solo en este módulo y con import() dinámico desde la tabla (chunk aparte, comparte three con escena.ts)
    assert.doesNotMatch(t, /from 'three|require\('three|import\('three/, f);
  }
  const c = leer('globo/globo.component.ts');
  assert.equal((c.match(/import\('\.\/escena'\)/g) ?? []).length, 1);
  assert.match(c, /^import type \{ EscenaGlobo \} from '\.\/escena';/m);
  assert.doesNotMatch(c, /^import \{[^}]*\} from '\.\/escena'/m);
  assert.doesNotMatch(leer('app.component.ts') + leer('app.component.html'), /three|EscenaGlobo|WebGL/);
  assert.match(leer('globo/escena.ts'), /from 'three\/examples\/jsm\/controls\/OrbitControls\.js'/);
});

test('escena: UN único InstancedMesh con setMatrixAt/setColorAt, needsUpdate, buffers reutilizados y material no recreado por actualización', () => {
  const e = leer('globo/escena.ts');
  // CAMBIO (F7, 4.ª iteración): ahora hay DOS InstancedMesh: los marcadores (único, con buffers reutilizados) y el pool pequeño fijo de anillos de eventos nuevos (MAX_ONDAS instancias). Se comprueba cada uno.
  assert.equal((e.match(/new InstancedMesh\(/g) ?? []).length, 2);
  assert.equal((e.match(/new InstancedMesh\(geom, this\.matPunto, capacidad\)/g) ?? []).length, 1);          // los marcadores siguen siendo UNA sola malla
  assert.match(e, /new InstancedMesh\(geomOnda, this\.matOnda, MAX_ONDAS\)/);
  assert.match(e, /setMatrixAt\(i, this\.m\)/); assert.match(e, /setColorAt\(i, this\.color\(/);
  assert.match(e, /instanceMatrix\.needsUpdate = true/); assert.match(e, /instanceColor\.needsUpdate = true/);
  // CAMBIO (F7, 2.ª iteración): los eventos se ordenan por capas antes de colocarlos, así que la comprobación usa la copia ordenada (`orden`) en lugar de `puntos`; la regla es la misma
  assert.match(e, /if \(orden\.n > this\.capacidad\) this\.crearMalla\(Math\.max\(1024, Math\.ceil\(orden\.n \* 1\.25\)\)\)/);   // solo se recrea si crece la capacidad, con margen
  const fijar = /fijarEventos\(puntos: PuntosGlobo\): void \{([\s\S]*?)\n  \}/.exec(e)?.[1] ?? '';
  assert.doesNotMatch(fijar, /new ShaderMaterial|new MeshBasicMaterial|new Color\(/);   // el material (y los colores) no se recrean al actualizar
  assert.match(e, /this\.geomPunto = new CircleGeometry/);                                // una geometría de disco compartida por todas las instancias
  assert.match(e, /ELEVACION_PUNTO/);
});

test('escena: render bajo demanda, pausas, movimiento reducido, pixelRatio limitado y liberación completa', () => {
  const e = leer('globo/escena.ts');
  assert.equal((e.match(/requestAnimationFrame\(/g) ?? []).length, 1);                  // un único punto de petición, dentro de pedirFotograma()
  // CAMBIO (F7, 2.ª iteración): la guarda del único rAF pasa de pedirFotograma() a encolar() (pedirFotograma ahora marca además «sucio»: hay que dibujar); sigue habiendo UN solo punto con guarda de id
  assert.match(e, /private encolar\(\): void \{\s*if \(this\.enPausa \|\| this\.rafId !== 0\) return;\s*this\.rafId = requestAnimationFrame\(this\.fotograma\)/);
  assert.match(e, /private pedirFotograma\(\): void \{\s*this\.sucio = true;\s*this\.encolar\(\);/);
  // CAMBIO: antes `const sigue = ...update(); if (sigue) pedirFotograma()`. Ahora el bucle sigue por inercia (movimiento sin giro propio) o por rotación en curso, y si no, SE PARA
  assert.match(e, /const movimiento = this\.controles\.update\(\)/);
  // CAMBIO (F7, 3.ª iteración): la inercia solo se encadena si no hubo transición en este fotograma (`paso === null`); la transición tiene su propia rama antes
  assert.match(e, /else if \(movimiento && giro === 0 && paso === null\) \{ this\.sucio = true; this\.encolar\(\); \}/);
  assert.match(e, /else if \(this\.rotacion\.girando\) this\.encolar\(\);/);
  assert.match(e, /else this\.programarReanudacion\(\);/);
  assert.doesNotMatch(e, /setInterval|autoRotate\s*=\s*true/);
  for (const parte of ['visibilitychange', 'IntersectionObserver', 'prefers-reduced-motion', 'enableDamping = !', 'webglcontextlost', 'webglcontextrestored', 'ev.preventDefault()']) assert.ok(e.includes(parte), parte);
  assert.match(e, /Math\.min\(window\.devicePixelRatio \|\| 1, 2\)/);
  const destruir = /destruir\(\): void \{([\s\S]*?)\n  \}\n\}/.exec(e)?.[1] ?? '';
  for (const parte of ['cancelAnimationFrame', 'observadorTamano?.disconnect()', 'observadorVisibilidad?.disconnect()', "removeEventListener('visibilitychange'", "removeEventListener('wheel'", "removeEventListener('pointerdown'", "removeEventListener('webglcontextlost'",
    'this.controles.dispose()', 'this.malla.dispose()', 'recurso.dispose()', 'this.renderer.dispose()', 'this.renderer.forceContextLoss()']) assert.ok(destruir.includes(parte), parte);
  assert.match(e, /pausar\(\): void/); assert.match(e, /reanudar\(\): void/);
  // clic frente a arrastre y rueda solo con Ctrl/⌘
  assert.match(e, /esClic\(ev\.clientX - a\.x, ev\.clientY - a\.y\)/); assert.match(e, /!\(ev\.ctrlKey \|\| ev\.metaKey\)\) ev\.stopPropagation\(\)/);
  // CAMBIO (F7, ajuste 2): antes `if (sel !== null) this.opciones.alSeleccionar(sel.id)` y el clic en vacío no hacía nada (no deseleccionaba, como el 2D). Ahora, CON selección dibujada, el clic en
  // vacío cierra la ficha (recuperarVista + alDeseleccionar); sin selección sigue sin hacer nada. Los detalles están en la prueba «clic fuera» del final de este archivo.
  assert.match(e, /if \(sel !== null\) \{ this\.opciones\.alSeleccionar\(sel\.id\); return; \}/);
  assert.match(e, /seleccionarPorRayo\(/);
});

test('componente: detecta WebGL ANTES del import(), con mensaje claro y aviso al selector; fallo de carga con el mismo fallback', () => {
  const c = leer('globo/globo.component.ts');
  assert.ok(c.indexOf('hayWebgl()') < c.indexOf("import('./escena')"));
  assert.match(c, /this\.fallar\(MENSAJE_SIN_WEBGL\)/); assert.match(c, /this\.fallar\(fase === 'carga' \? MENSAJE_FALLO_CARGA : MENSAJE_FALLO_INICIO\)/);
  assert.match(c, /readonly noDisponible = output<string>\(\)/);
  const w = leer('globo/webgl.ts');
  assert.match(w, /getContext\('webgl2'\) \?\? canvas\.getContext\('webgl'\)/);
  assert.match(w, /Tu navegador o dispositivo no ofrece WebGL: usa el mapa 2D o la tabla/);
  assert.match(c, /effect\(\(\) => \{ const v = this\.visible\(\);/);                       // se carga cuando se muestra por primera vez
  assert.match(c, /this\.zona\.runOutsideAngular\(f\)/);                                   // el render no dispara detección de cambios de Angular
  assert.match(c, /ngOnDestroy\(\): void \{[\s\S]*this\.escena\?\.destruir\(\)/);
});

test('accesibilidad del globo: textContent (sin HTML dinámico), teclado y controles; la tarjeta de detalle YA NO está en el globo', () => {
  const c = leer('globo/globo.component.ts');
  assert.doesNotMatch(c, /innerHTML|outerHTML|insertAdjacentHTML|bypassSecurityTrust|DomSanitizer/);
  // CAMBIO (rediseño dashboard): antes se comprobaba aquí la tarjeta interna (filasFicha, fichaReplay, {{ d.ficha.* }}, «Cerrar» → cerrarFicha(), «Ver este evento en la tabla» y la región viva «Seleccionado: …»).
  // Esa UI se movió al panel app-detalle-evento (columna derecha, común a 2D y 3D): lo mismo se comprueba en tests/dashboard.test.ts sobre el nuevo componente. Aquí se exige que el globo no la duplique.
  assert.doesNotMatch(c, /<aside|class="tarjeta"|cerrarFicha|verEnTabla|filasFicha|fichaReplay|hayTabla|class="ficha|Ver este evento en la tabla|Seleccionado: /);
  assert.match(c, /<canvas #lienzo role="img" \[attr\.aria-label\]="descripcion\(\)"/);
  // CAMBIO: aria-describedby apunta ahora a la pista corta visible (globo-pista); el texto largo está en el <details> «Ayuda del globo» (ver prueba de controles e instrucciones)
  assert.match(c, /tabindex="0" role="group" aria-label="Globo terráqueo 3D interactivo" aria-describedby="globo-pista"/);
  assert.match(c, /También puedes consultar y seleccionar cada terremoto en la tabla/); assert.match(c, /Ctrl \+ rueda para acercar/);
  for (const etiqueta of ['Acercar el globo', 'Alejar el globo', 'Restablecer la vista del globo']) assert.ok(c.includes(`aria-label="${etiqueta}"`), etiqueta);
  for (const tecla of ["'ArrowLeft'", "'ArrowRight'", "'ArrowUp'", "'ArrowDown'", "'PageUp'", "'PageDown'", "'Home'", "'+'", "'-'"]) assert.ok(c.includes(`case ${tecla}`), tecla);
  assert.match(c, /\.recuento\b/); assert.match(c, /eventos dibujados/); assert.match(c, /sin coordenadas válidas/); assert.match(c, /tope técnico/);
  assert.match(c, /\{ radio: radioMagnitud, color: colorProfundidad, id: idDe \}/);        // la MISMA codificación que el mapa 2D
  assert.match(c, /button \{[^}]*min-height: 36px/); assert.match(c, /button:focus-visible \{ outline: 3px solid var\(--foco\)/);
  assert.match(c, /:host\(\[hidden\]\) \{ display: none; \}/);
  // CAMBIO (rediseño dashboard): antes el escenario fijaba `height: clamp(420px, min(78vh, 62vw), 900px)` y, en móvil, `65vh/65svh/380px`, y el detalle era un panel flotante de 320 px (media 900 px).
  // Ahora la altura sale de la variable compartida con el mapa 2D (--alto-visor, definida en app.component.css por tramos: móvil max(380px, 65svh), tablet y escritorio con clamp) y no hay panel flotante.
  assert.doesNotMatch(c, /@media \(min-width: 900px\)/); assert.doesNotMatch(c, /grid-template-columns: minmax\(0, 1fr\) 340px/);
  assert.match(c, /\.vista \{ position: relative; height: var\(--alto-visor, 560px\); \}/); assert.doesNotMatch(c, /clamp\(420px|min\(78vh, 62vw\)/);
  assert.match(c, /@media \(max-width: 700px\) \{ \.vista \{ margin-inline: var\(--esp-3\); \} \}/);
  assert.doesNotMatch(c, /transition:\s*all/);
});

test('app: selector de vista con aria-pressed encima del mapa, Leaflet SIEMPRE montado (solo hidden) y invalidateSize al volver al 2D', () => {
  const html = leer('app.component.html'); const ts = leer('app.component.ts'); const css = leer('app.component.css');
  // CAMBIO (rediseño dashboard): el selector de vista está ahora dentro de la columna central (#mapa), dos niveles más de sangría (6 espacios) en la plantilla
  // CAMBIO (vistas internas): el selector está ahora dentro de la sección del Panel: otros 2 espacios de sangría (8)
  const selector = /<div class="vista-selector"[^>]*>([\s\S]*?)\n        <\/div>/.exec(html)?.[1] ?? '';
  assert.equal((selector.match(/<button type="button" \[attr\.aria-pressed\]=/g) ?? []).length, 2);
  assert.match(selector, /Mapa 2D<\/button>/); assert.match(selector, /Globo 3D<\/button>/); assert.match(selector, /\[disabled\]="globoNoDisponible\(\) !== null"/);
  // CAMBIO (vistas internas + globo por defecto): la señal del visor es `visor` (antes `vista`, ahora Panel/Análisis/Eventos) y arranca en '3d' (antes '2d'); el aviso del fallback es `avisoFallback(motivo)`
  // («Globo 3D no disponible: <motivo>. Se muestra el mapa 2D.», ver fallback.ts) en lugar de «Globo 3D no disponible. {{ motivo }}»; el globo solo es visible con el Panel a la vista Y el visor 3D.
  assert.match(selector, /role="status">\{\{ avisoFallback\(motivo\) \}\}/);
  assert.ok(html.indexOf('class="vista-selector"') < html.indexOf('class="mapa-envoltorio"'));
  assert.ok(html.indexOf('<app-filtros') < html.indexOf('class="vista-selector"'));
  assert.match(html, /<div class="map" leaflet [^>]*\[hidden\]="visor\(\) === '3d'"/);   // se oculta, no se destruye
  assert.doesNotMatch(html, /@if \(visor\(\)[^{]*\{[^}]*leaflet/);
  assert.match(html, /<app-globo \[visible\]="vista\(\) === 'panel' && visor\(\) === '3d'" \[eventos\]="eventos\(\)" \[seleccionado\]="seleccionado\(\)"/);
  assert.match(html, /\(seleccionar\)="elegir\(\$event, 'mapa'\)" \(cerrar\)="elegir\(null, 'mapa'\)" \(noDisponible\)="globoSinSoporte\(\$event\)"/);
  assert.match(ts, /readonly visor = signal<'2d' \| '3d'>\('3d'\)/);
  assert.match(ts, /afterNextRender\(\(\) => this\.map\?\.invalidateSize\(\), \{ injector: this\.injector \}\)/);
  assert.match(ts, /if \(visor === '3d' && this\.globoNoDisponible\(\) !== null\) return;/);
  assert.match(css, /\.vista-selector button \{[^}]*min-height: 36px/); assert.match(css, /\.vista-selector button\[aria-pressed="true"\] \{[^}]*font-weight: 700/);
  assert.match(css, /\.vista-selector button:focus-visible \{ outline: 3px solid var\(--foco\)/);
  assert.match(css, /\.map\[hidden\] \{ display: none; \}/);
  // CAMBIO (rediseño dashboard): la leyenda sigue en ambas vistas, pero ahora es un panel de la columna derecha (clase panel-ui) y no la franja bajo el mapa
  assert.match(html, /class="leyenda panel-ui o-leyenda" role="group"/);
  // CAMBIO: antes la rama demo hacía `dibujar(x)` y `eventos.set(x)` por separado; ahora ambas pasan por aplicarEventos (ver prueba «único camino de aplicación de eventos»)
  assert.match(ts, /this\.aplicarEventos\(data\.features as unknown as Evento\[\]\)/);       // en demostración el globo también recibe los eventos
});

test('sin almacenamiento del navegador, sin transition: all y el generador de eventos de prueba no entra en la aplicación', () => {
  const todo = fuentes(join(RAIZ, 'globo')).map((f) => leer(join('globo', f))).join('\n');
  assert.doesNotMatch(todo, /localStorage|sessionStorage|document\.cookie|indexedDB|caches\./);
  assert.doesNotMatch(todo, /transition:\s*all/);
  for (const f of fuentes(RAIZ)) { if (f.includes('eventos-prueba')) continue; assert.doesNotMatch(leer(f), /eventos-prueba|generarEventosSinteticos/, f); }
  assert.doesNotMatch(todo, /window\.(?!devicePixelRatio|matchMedia)\w+\s*=/);               // ningún hook global
  assert.doesNotMatch(todo, /https?:\/\//);                                                  // nada externo: ni texturas, ni fuentes, ni CDN
});

// =====================================================================================================================================================
// F7, 2.ª iteración: rotación automática, orden de capas, textura, layout y controles
// =====================================================================================================================================================

// ---------- rotación automática (máquina de estados pura, con tiempo simulado) ----------
/** Llama a avanzar() en t = desde, desde + paso, … hasta `hasta` (ambos incluidos) y devuelve el ángulo acumulado (rad). */
function simular(m: MaquinaRotacion, desde: number, hasta: number, paso: number): number {
  let ang = 0;
  for (let k = 0; desde + k * paso <= hasta + 1e-9; k++) ang += m.avanzar(desde + k * paso);
  return ang;
}

test('rotación: velocidad angular fija y muy lenta (2,4 °/s = una vuelta en 2 min 30 s), retardo 3 s, rampa 1 s, tope de dt 50 ms', () => {
  assert.equal(VELOCIDAD_GRADOS_S, 2.4); cerca(VELOCIDAD_RAD_S, (2.4 * Math.PI) / 180, 1e-12);
  assert.ok(360 / VELOCIDAD_GRADOS_S >= 120 && 360 / VELOCIDAD_GRADOS_S <= 180);       // 360° en 2–3 minutos
  // CAMBIO (F7, 3.ª iteración): el retardo de reanudación pasa de 5 s a 3 s (encargo de la mejora 1); el resto de constantes no cambia
  assert.equal(RETARDO_REANUDAR_MS, 3000); assert.equal(RAMPA_MS, 1000); assert.equal(DT_MAX_MS, 50);
});

test('rotación: arranca sola con rampa suave (el primer fotograma no gira y la velocidad sube de 0 a 1 en 1 s) y siempre en el mismo sentido (ángulo >= 0)', () => {
  const m = new MaquinaRotacion();
  assert.ok(m.estaActiva); assert.ok(!m.girando);
  assert.equal(m.avanzar(0), 0); assert.ok(m.girando);                                  // dt = 0 en el primero: sin salto
  let acumulado = 0; let previo = 0;
  for (let t = 10; t <= 1000; t += 10) { const a = m.avanzar(t); assert.ok(a >= previo - 1e-15 && a >= 0); previo = a; acumulado += a; }   // cada paso gira algo más que el anterior
  cerca(acumulado, VELOCIDAD_RAD_S * 0.5, VELOCIDAD_RAD_S * 0.03);                      // ∫ rampa lineal 0→1 en 1 s = media velocidad × 1 s
  const pleno = m.avanzar(1016); cerca(pleno, VELOCIDAD_RAD_S * 0.016, 1e-12);          // tras la rampa: velocidad plena
});

test('rotación: prefers-reduced-motion NO arranca sola; el botón (alternar) puede activarla a mano', () => {
  const m = new MaquinaRotacion(true);
  assert.ok(!m.estaActiva);
  assert.equal(simular(m, 0, 60_000, 16), 0); assert.ok(!m.girando); assert.equal(m.esperaMs(60_000), null);
  assert.equal(m.alternar(), true);
  assert.ok(simular(m, 61_000, 65_000, 16) > 0);                                       // activada a mano: gira (con rampa), sin esperar el retardo
  const r = new MaquinaRotacion(false); r.fijarMovimientoReducido(true);               // si la preferencia se activa en caliente, se apaga
  assert.ok(!r.estaActiva); assert.equal(simular(r, 0, 10_000, 16), 0);
});

// CAMBIO (F7, 3.ª iteración): los instantes de esta prueba estaban escritos para un retardo de 5 s (3000+5000 = 8000…); ahora se expresan con RETARDO_REANUDAR_MS (3 s), así que la
// misma comprobación sirve para cualquier valor y el título habla de «3 s». La cobertura es la misma: espera exacta, ni un ms antes, sin saltos, rampa desde 0 y reinicio por otra interacción.
test('rotación: una interacción la detiene al instante y se reanuda sola, con rampa, tras 3 s de inactividad', () => {
  const R = RETARDO_REANUDAR_MS;
  const m = new MaquinaRotacion();
  assert.ok(simular(m, 0, 3000, 16) > 0);
  m.interactuar(3000);
  assert.equal(m.avanzar(3016), 0); assert.ok(!m.girando);
  assert.equal(m.esperaMs(3000), R); assert.equal(m.esperaMs(3000 + 2000), R - 2000);
  assert.ok(!m.puedeGirar(3000 + R - 1)); assert.ok(m.puedeGirar(3000 + R));
  assert.equal(simular(m, 3032, 3000 + R - 16, 16), 0);                                 // durante el retardo, nada
  assert.equal(m.avanzar(3000 + R), 0);                                                 // primer fotograma tras la espera: sin salto
  const a = m.avanzar(3000 + R + 16); assert.ok(a > 0 && a < VELOCIDAD_RAD_S * 0.001);  // y la velocidad vuelve a subir desde 0
  const t2 = 3000 + R + 100;
  m.interactuar(t2); assert.equal(m.avanzar(t2 + 16), 0);                               // otra interacción reinicia la espera
  assert.ok(!m.puedeGirar(t2 + R - 1)); assert.ok(m.puedeGirar(t2 + R));
});

test('rotación: arrastre con el puntero abajo bloquea sin límite y la espera cuenta desde que se suelta', () => {
  const m = new MaquinaRotacion();
  simular(m, 0, 2000, 16);
  m.fijarPuntero(true, 2000);
  assert.equal(simular(m, 2016, 62_000, 1000), 0); assert.equal(m.esperaMs(62_000), null);   // un minuto arrastrando: nada
  m.fijarPuntero(false, 62_000);
  assert.equal(m.esperaMs(62_000), RETARDO_REANUDAR_MS);
  // CAMBIO (F7, 3.ª iteración): 66_999 / 67_000 eran 62_000 + 5 s; ahora se calculan con la constante (3 s)
  assert.ok(!m.puedeGirar(62_000 + RETARDO_REANUDAR_MS - 1)); assert.ok(m.puedeGirar(62_000 + RETARDO_REANUDAR_MS));
});

test('rotación: con un terremoto seleccionado NO gira; al cerrar la selección se reanuda tras el retardo', () => {
  const m = new MaquinaRotacion();
  simular(m, 0, 2000, 16);
  m.fijarSeleccion(true, 2000);
  assert.equal(simular(m, 2016, 62_000, 1000), 0); assert.equal(m.esperaMs(62_000), null);
  m.fijarSeleccion(true, 63_000);                                                       // repetir el mismo estado no cambia nada
  m.fijarSeleccion(false, 70_000);
  assert.ok(!m.puedeGirar(70_000 + RETARDO_REANUDAR_MS - 1)); assert.ok(m.puedeGirar(70_000 + RETARDO_REANUDAR_MS));   // CAMBIO (3.ª iteración): 74_999 / 75_000 eran 70 000 + 5 s
  const nueva = new MaquinaRotacion(); nueva.fijarSeleccion(false, 5);                  // «deseleccionar» sin haber seleccionado no retrasa el arranque
  assert.ok(nueva.puedeGirar(5));
});

test('rotación: vista 2D, pestaña oculta o fuera de pantalla bloquean; al volver reanuda sin salto y sin esperar el retardo', () => {
  for (const [vista, pestana, pantalla] of [[false, true, true], [true, false, true], [true, true, false]] as const) {
    const m = new MaquinaRotacion();
    simular(m, 0, 3000, 16);
    m.fijarEntorno(vista, pestana, pantalla);
    assert.equal(simular(m, 3016, 600_000, 1000), 0); assert.equal(m.esperaMs(600_000), null); assert.ok(!m.girando);
    m.fijarEntorno(true, true, true);
    assert.equal(m.avanzar(700_000), 0);                                                // 100 s después: la referencia de tiempo se reinició, dt = 0
    const a = m.avanzar(700_016); assert.ok(a > 0 && a < VELOCIDAD_RAD_S * 0.001);     // y la rampa vuelve a empezar
  }
});

test('rotación: la pausa manual se RESPETA (no se reanuda sola ni por inactividad ni al interactuar) hasta pulsar «Reanudar»', () => {
  const m = new MaquinaRotacion();
  simular(m, 0, 3000, 16);
  assert.equal(m.alternar(), false); assert.ok(!m.estaActiva);
  assert.equal(m.avanzar(3016), 0);
  assert.equal(simular(m, 4000, 3_600_000, 1000), 0); assert.equal(m.esperaMs(3_600_000), null);   // una hora simulada: no se reanuda
  m.interactuar(3_600_000); m.fijarPuntero(false, 3_600_001); m.fijarSeleccion(false, 3_600_002);
  assert.equal(m.avanzar(3_700_000), 0);
  assert.equal(m.alternar(), true);
  assert.equal(m.avanzar(3_700_100), 0);                                                // primer fotograma: referencia nueva
  assert.ok(m.avanzar(3_700_116) > 0);                                                  // reanudar a mano arranca ya (con rampa), sin esperar el retardo
});

test('rotación: un hueco largo entre fotogramas (suspensión, caída de FPS) NO produce un salto: dt <= 50 ms', () => {
  const m = new MaquinaRotacion();
  simular(m, 0, 5000, 16);                                                              // velocidad plena
  const salto = m.avanzar(5000 + 10_000);                                               // 10 s sin fotogramas
  cerca(salto, (VELOCIDAD_RAD_S * DT_MAX_MS) / 1000, 1e-12);
  assert.ok(salto < (VELOCIDAD_RAD_S * 100) / 1000);                                    // nunca el equivalente a 10 s (que serían 24°)
  assert.equal(m.avanzar(5000 + 9000), 0);                                              // un reloj que retrocede tampoco gira hacia atrás
});

test('rotación: la velocidad es independiente de los FPS (16 ms × N = 32 ms × N/2 = 20 ms × … = 50 ms × …) y no depende del número de fotogramas', () => {
  const T = 20_000;
  const total = (paso: number) => simular(new MaquinaRotacion(), 0, T, paso);
  const [a16, a32, a20, a50] = [total(16), total(32), total(20), total(50)];
  for (const a of [a16, a32, a20, a50]) cerca(a, VELOCIDAD_RAD_S * (T / 1000 - 0.5), VELOCIDAD_RAD_S * 0.05);   // ≈ V × (T − rampa/2)
  cerca(a16, a32, VELOCIDAD_RAD_S * 0.02); cerca(a16, a50, VELOCIDAD_RAD_S * 0.05);
  // pasada la rampa la igualdad es exacta: ángulo entre t = 8 s y t = 20 s (ambos múltiplos de todos los pasos)
  const ventana = (paso: number) => { const m = new MaquinaRotacion(); let s = 0; for (let k = 0; k * paso <= T; k++) { const a = m.avanzar(k * paso); if (k * paso > 8000) s += a; } return s; };
  for (const paso of [16, 32, 20, 50, 40]) cerca(ventana(paso), VELOCIDAD_RAD_S * 12, 1e-9);
});

// ---------- orden de capas de los marcadores ----------
test('ordenarPorCapas: mayor radio primero (debajo) y los pequeños al final (encima); estable; mismos datos reordenados; no muta la entrada', () => {
  const lista = [ev('p', 0, 0, 2), ev('g', 1, 1, 7), ev('m', 2, 2, 4), ev('n', 3, 3, null), ev('g2', 4, 4, 7), ev('c', 5, 5, 0)];
  const original = puntos(...lista);
  const copiaIds = [...original.ids]; const copiaRadios = Array.from(original.radios);
  const o = ordenarPorCapas(original);
  assert.deepEqual(o.ids, ['g', 'g2', 'm', 'p', 'c', 'n']);                             // 18, 18 (estable), 13, 9, 5, 4 (sin magnitud = radio por defecto 4)
  for (let i = 1; i < o.n; i++) assert.ok(o.radios[i - 1] >= o.radios[i]);              // radios no crecientes
  assert.deepEqual(original.ids, copiaIds); assert.deepEqual(Array.from(original.radios), copiaRadios);   // la entrada queda intacta
  assert.equal(o.n, original.n); assert.equal(o.radioMax, original.radioMax);
  // cada evento conserva SU normal, radio, color y magnitud (el reordenado no mezcla columnas)
  for (const [k, id] of o.ids.entries()) {
    const i = original.ids.indexOf(id);
    for (let j = 0; j < 3; j++) assert.equal(o.normales[3 * k + j], original.normales[3 * i + j]);
    assert.equal(o.radios[k], original.radios[i]); assert.equal(o.colores[k], original.colores[i]);
    assert.ok(Object.is(o.magnitudes[k], original.magnitudes[i]));
  }
  assert.equal(ordenarPorCapas(puntos()).n, 0);
});

test('ordenarPorCapas: un punto pequeño siempre va DESPUÉS (encima) de un vecino grande, sea cual sea el orden de entrada; la selección usa índices coherentes', () => {
  const grande = ev('grande', 10, 0, 7); const pequeno = ev('pequeno', 10.4, 0, 1);
  for (const entrada of [[grande, pequeno], [pequeno, grande]]) {
    const o = ordenarPorCapas(puntos(...entrada));
    assert.ok(o.ids.indexOf('grande') < o.ids.indexOf('pequeno'));
  }
  const o = ordenarPorCapas(puntos(ev('p', 0, 0, 2), ev('g', 20, 0, 7), ev('m', 40, 0, 4)));
  const r = seleccionarPorProximidad(o, latLonAXyz(0, 40), CAMARA, PX)!;
  assert.equal(r.id, 'm'); assert.equal(o.ids[r.indice], 'm');                          // el índice devuelto es el de la instancia ORDENADA
  const normalDe = (id: string): Xyz => { const k = o.ids.indexOf(id); return [o.normales[3 * k], o.normales[3 * k + 1], o.normales[3 * k + 2]]; };
  for (const [id, lon] of [['p', 0], ['g', 20], ['m', 40]] as const) { const e = latLonAXyz(0, lon); const n = normalDe(id); for (let j = 0; j < 3; j++) cerca(n[j], e[j], 1e-6); }
  assert.deepEqual(idsPorMagnitud(o), idsPorMagnitud(puntos(ev('p', 0, 0, 2), ev('g', 20, 0, 7), ev('m', 40, 0, 4))));   // recorrer por magnitud no depende del orden de capas
});

test('rendimiento: ordenar 50 000 eventos sintéticos es una vez por cambio de datos y rápido; no se reordena por fotograma', () => {
  const { puntos: p } = prepararPuntos(generarEventosSinteticos(50_000, 3), COD);
  const t0 = performance.now(); const o = ordenarPorCapas(p); const ms = performance.now() - t0;
  assert.ok(ms < 1500, `ordenar 50 000 eventos: ${ms.toFixed(0)} ms`);
  for (let i = 1; i < o.n; i++) assert.ok(o.radios[i - 1] >= o.radios[i]);
  const e = leer('globo/escena.ts');
  assert.equal((e.match(/ordenarPorCapas\(/g) ?? []).length, 1);                        // una sola llamada…
  assert.match(/fijarEventos\(puntos: PuntosGlobo\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /ordenarPorCapas\(puntos\)/);   // …y está en fijarEventos (cambio de datos)
  assert.doesNotMatch(/private readonly fotograma = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '', /ordenarPorCapas|prepararPuntos|new Float32Array|\.sort\(/);   // jamás por fotograma
  assert.match(e, /malla\.renderOrder = 10/);                                           // los marcadores se dibujan los últimos
  assert.match(e, /this\.haloSel\.renderOrder = 5/);                                    // el halo de selección, antes (DETRÁS de los marcadores)
});

// ---------- marcadores: borde fino, colores y tamaños intactos, halo ----------
test('marcadores: borde fino (≈ 7 % del radio, mínimo ≈ 0,8 px) con fwidth; relleno y tamaños idénticos al 2D; descarte de la cara oculta; halo sin ocultar vecinos', () => {
  const e = leer('globo/escena.ts');
  assert.match(e, /float aa = max\(fwidth\(r\), 0\.0005\)/); assert.match(e, /clamp\(max\(0\.07, 0\.8 \* aa\), 0\.07, 0\.5\)/);
  assert.match(e, /vColor = instanceColor/);                                            // el relleno es el color de instancia (colorProfundidad), sin tocarlo
  assert.doesNotMatch(e, /#e8a317|#e35b37|#7b3fb6|#64748b|colorProfundidad|radioMagnitud|FACTOR_RADIO/);   // ni colores ni escala se reimplementan en la escena
  assert.match(e, /const r = orden\.radios\[i\];\s*this\.e\.set\(r, r, 1\)/);          // tamaño = radioMagnitud × FACTOR_RADIO tal cual (prepararPuntos), sin factor extra
  assert.match(e, /dot\(normalize\(centro\), cameraPosition\) <= 1\.0/);               // cara oculta descartada en el shader (los marcadores no usan prueba de profundidad)
  assert.match(e, /vSel = float\(gl_InstanceID\) == uSel/); assert.match(e, /uSel'\]\.value = i/);   // el seleccionado se resalta por su índice de instancia (ordenado)
  const matPunto = /this\.matPunto = new ShaderMaterial\(\{[\s\S]*?\}\);/.exec(e)?.[0] ?? '';
  assert.match(matPunto, /transparent: true, depthTest: false, depthWrite: false/);
  const matHalo = /const matHalo = new ShaderMaterial\(\{[\s\S]*?\}\);/.exec(e)?.[0] ?? '';
  assert.match(matHalo, /transparent: true, depthWrite: false/); assert.doesNotMatch(matHalo, /depthTest: false/);   // sin escribir profundidad y ocluido solo por el planeta
  assert.equal((e.match(/new InstancedMesh\(/g) ?? []).length, 2);                      // CAMBIO (4.ª iteración): marcadores + pool de anillos (ver prueba de InstancedMesh)
});

test('contraste de los marcadores (WCAG 1.4.11) medido sobre OCÉANO y CONTINENTE: el borde claro y el cian de selección superan 3:1 en ambos', () => {
  const p = resolverPaleta(() => '');
  for (const [nombre, superficie] of [['océano', p.esfera], ['continente', p.continente], ['fondo', p.fondo]] as const) {
    assert.ok(razonContraste(p.borde, superficie) >= 3, `borde sobre ${nombre}: ${razonContraste(p.borde, superficie).toFixed(2)}`);
    assert.ok(razonContraste(p.seleccion, superficie) >= 3, `selección sobre ${nombre}: ${razonContraste(p.seleccion, superficie).toFixed(2)}`);
  }
  // el continente es algo más claro que el océano (se distinguen) sin competir con el marcador
  const dif = razonContraste(p.continente, p.esfera);
  assert.ok(dif > 1.3 && dif < 3, `continente/océano ${dif.toFixed(2)}`);
  assert.ok(razonContraste(p.continente, p.fondo) > razonContraste(p.esfera, p.fondo));   // más claro, no más oscuro
  // sin el borde, ningún relleno basta por sí solo sobre el continente (de ahí el borde claro)
  assert.ok(razonContraste(colorProfundidad(300), p.continente) < 3);
  assert.equal(TOKENS_GLOBO.continente[0], '--globo-continente');
  assert.match(estilos(), /--globo-continente: #264264;/);
});

// ---------- textura del planeta ----------
type Llamada = { op: string; args: unknown[] };
function grabador() {
  const llamadas: Llamada[] = [];
  const ctx: Record<string, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '', globalAlpha: 1 };
  for (const op of ['fillRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke']) ctx[op] = (...args: unknown[]) => { llamadas.push({ op, args }); };
  /** Trazados cerrados por fill()/stroke(): cada uno con sus subtrazados (listas de puntos [x, y] y marca de moveTo/lineTo). */
  const trazados = () => {
    const salida: { tipo: 'fill' | 'stroke'; regla?: unknown; sub: { x: number; y: number; mover: boolean }[][] }[] = [];
    let sub: { x: number; y: number; mover: boolean }[][] = [];
    for (const l of llamadas) {
      if (l.op === 'beginPath') sub = [];
      else if (l.op === 'moveTo') sub.push([{ x: l.args[0] as number, y: l.args[1] as number, mover: true }]);
      else if (l.op === 'lineTo') (sub[sub.length - 1] ?? (sub[0] = [])).push({ x: l.args[0] as number, y: l.args[1] as number, mover: false });
      else if (l.op === 'fill' || l.op === 'stroke') salida.push({ tipo: l.op, regla: l.args[0], sub });
    }
    return salida;
  };
  return { ctx: ctx as unknown as Parameters<typeof dibujarTierra>[0], llamadas, trazados };
}
const COLORES_TEX = { oceano: '#15233b', continente: '#264264', reticula: '#2a3c5c', costas: '#6b82a6' };
const W = 4096; const H = 2048;

test('textura: tamaño 4096×2048 (2048×1024 en móvil o si MAX_TEXTURE_SIZE es menor), siempre potencia de 2 y relación 2:1', () => {
  assert.deepEqual(tamanoTextura(16384, false), { ancho: 4096, alto: 2048 });
  assert.deepEqual(tamanoTextura(16384, true), { ancho: 2048, alto: 1024 });
  assert.deepEqual(tamanoTextura(1024, false), { ancho: 1024, alto: 512 });
  assert.deepEqual(tamanoTextura(3000, false), { ancho: 2048, alto: 1024 });            // 3000 no es potencia de 2: se baja a 2048
  assert.deepEqual(tamanoTextura(NaN, false), { ancho: 2048, alto: 1024 });             // dato inválido: valor seguro
});

test('textura: un anillo que cruza el antimeridiano (Fiyi) se desenvuelve y se dibuja en dos copias, sin trazos de punta a punta', () => {
  const fiyi = [[177, -17], [-178, -17], [-178, -19], [177, -19], [177, -17]];
  const a = normalizarAnillo(fiyi)!;
  assert.deepEqual(a.lon, [177, 182, 182, 177, 177]); assert.equal(a.lat.length, 5);   // −178 → 182: longitud continua
  assert.deepEqual(desplazamientosVisibles(a), [-360, 0]);                              // la copia −360 trae el trozo del otro lado
  assert.deepEqual(desplazamientosVisibles(normalizarAnillo([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]])!), [0]);
  const { ctx, trazados } = grabador();
  dibujarTierra(ctx, { type: 'Polygon', coordinates: [fiyi] }, W, H, COLORES_TEX);
  const relleno = trazados().find((t) => t.tipo === 'fill')!;
  assert.equal(relleno.regla, 'evenodd'); assert.equal(relleno.sub.length, 2);
  for (const sub of relleno.sub) for (let i = 1; i < sub.length; i++) assert.ok(Math.abs(sub[i].x - sub[i - 1].x) < W * 0.05);   // ningún segmento atraviesa el mapa
  const xs = relleno.sub.flat().map((p) => p.x);
  assert.ok(xs.some((x) => x < W * 0.01), 'trozo en el borde izquierdo'); assert.ok(xs.some((x) => x > W * 0.99), 'trozo en el borde derecho');
});

test('textura: un anillo que rodea el polo (Antártida con costuras ±180 / −90) se cierra por el polo y las costuras no se trazan como costa', () => {
  const antartida = [[-180, -84.7], [-100, -70], [0, -72], [100, -67], [180, -84.7], [180, -90], [-180, -90], [-180, -84.7]];
  const a = normalizarAnillo(antartida)!;
  assert.equal(a.lon[0], -180); assert.equal(a.lon[a.lon.length - 3], 180);              // desenvuelto: de −180 a +180, sin retroceso
  assert.deepEqual(a.lat.slice(-2), [-90, -90]); assert.deepEqual(a.costura.slice(-2), [true, true]);   // dos puntos sintéticos en el polo sur
  assert.equal(a.costura[5], true);                                                      // (180,−90) → (−180,−90): recorre el polo
  const { ctx, trazados } = grabador();
  dibujarTierra(ctx, { type: 'Polygon', coordinates: [antartida] }, W, H, COLORES_TEX);
  const t = trazados();
  const relleno = t.find((x) => x.tipo === 'fill')!;
  assert.ok(relleno.sub.flat().some((p) => p.y === H));                                  // el relleno llega al borde inferior (el polo)
  const costas = t.filter((x) => x.tipo === 'stroke').pop()!;                            // el último trazo: costas
  assert.ok(costas.sub.flat().filter((p) => !p.mover).every((p) => p.y < H - 0.5));       // ningún lineTo llega al polo: las costuras son moveTo
  // anillo que rodea el polo sur cruzando el antimeridiano (sin puntos en ±180): también se cierra y dibuja en dos copias
  const polar = [[170, -70], [-170, -70], [-90, -70], [0, -70], [90, -70], [170, -70]];
  const p = normalizarAnillo(polar)!;
  assert.deepEqual(p.lon.slice(0, 6), [170, 190, 270, 360, 450, 530]); assert.deepEqual(p.lat.slice(-2), [-90, -90]);
  assert.deepEqual(desplazamientosVisibles(p), [-360, 0]);
});

test('textura: MultiPolygon (un relleno por polígono) y huecos (anillos interiores en el MISMO trazado, par-impar); líneas y datos inválidos no rompen', () => {
  const hueco = [[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]], [[5, 5], [5, 15], [15, 15], [15, 5], [5, 5]]];
  const g = { type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: hueco } },
    { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[[[30, 0], [40, 0], [40, 10], [30, 0]]], [[[50, 0], [60, 0], [60, 10], [50, 0]]]] } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }, { type: 'Feature', geometry: null }] };
  assert.equal(poligonosDe(g).length, 3);
  const { ctx, trazados } = grabador();
  dibujarTierra(ctx, g, W, H, COLORES_TEX);
  const rellenos = trazados().filter((t) => t.tipo === 'fill');
  assert.equal(rellenos.length, 3); assert.ok(rellenos.every((r) => r.regla === 'evenodd'));
  assert.equal(rellenos[0].sub.length, 2);                                               // contorno + hueco en un único trazado
  assert.equal(normalizarAnillo([[0, 0], [1, 1]]), null); assert.equal(normalizarAnillo('x'), null);
  assert.equal(normalizarAnillo([[0, 0], [NaN, 1], [5, 95], [1, 1]]), null);             // inválidos descartados: quedan < 3 puntos
  const vacio = grabador(); dibujarTierra(vacio.ctx, null, W, H, COLORES_TEX);           // sin datos: solo océano, retícula y trazo vacío
  assert.equal(vacio.trazados().filter((t) => t.tipo === 'fill').length, 0);
});

test('textura: orden y colores (océano → continentes → retícula cada 30° → costas); grosores según el tamaño; todo con los colores recibidos (tokens)', () => {
  const { ctx, llamadas } = grabador();
  const registro: string[] = [];
  const proxy = new Proxy(ctx as unknown as Record<string, unknown>, { set(t, k, v) { if (k === 'fillStyle' || k === 'strokeStyle') registro.push(String(v)); t[k as string] = v; return true; } });
  dibujarTierra(proxy as unknown as Parameters<typeof dibujarTierra>[0], { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] }, W, H, COLORES_TEX);
  assert.deepEqual(registro, [COLORES_TEX.oceano, COLORES_TEX.continente, COLORES_TEX.reticula, COLORES_TEX.costas]);
  assert.deepEqual(llamadas[0], { op: 'fillRect', args: [0, 0, W, H] });                 // lo primero, el océano a todo el lienzo
  const g = grabador(); dibujarTierra(g.ctx, null, W, H, COLORES_TEX);
  const reticula = g.trazados().find((t) => t.tipo === 'stroke')!;
  assert.equal(reticula.sub.length, 5 + 13);                                             // paralelos −60…60 cada 30° (5, sin los polos) y meridianos −180…180 cada 30° (13)
  assert.equal((g.ctx as unknown as { lineWidth: number }).lineWidth, 2);                // 4096 px de ancho → 2 px
  const peq = grabador(); dibujarTierra(peq.ctx, null, 2048, 1024, COLORES_TEX);
  assert.equal((peq.ctx as unknown as { lineWidth: number }).lineWidth, 1);              // 2048 → 1 px
});

test('textura: la columna u de la esfera de three cae en su longitud tras el giro ROTACION_Y_TEXTURA', () => {
  // vértices de SphereGeometry de three: x = −cos(2πu)·sin(πv), y = cos(πv), z = sin(2πu)·sin(πv); la fila v = (90 − lat)/180 de la imagen cae en esa fila de la esfera
  const geo = (u: number, v: number): Xyz => [-Math.cos(2 * Math.PI * u) * Math.sin(Math.PI * v), Math.cos(Math.PI * v), Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * v)];
  const a = ROTACION_Y_TEXTURA;
  const girarY = (p: Xyz): Xyz => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
  for (const [lat, lon] of [[0, 0], [0, 90], [0, -90], [0, 179], [30, -120], [-45, 60], [80, 10]] as const) {
    const p = girarY(geo((lon + 180) / 360, (90 - lat) / 180)); const e = latLonAXyz(lat, lon);
    for (let i = 0; i < 3; i++) cerca(p[i], e[i], 1e-9);
  }
});

// ---------- layout: panel flotante y desplazamiento del centro ----------
test('layout: la esfera no queda bajo el panel flotante a 900–1100 px (desplazamiento mínimo) y no se mueve si ya cabe', () => {
  assert.equal(ANCHO_PANEL_PX, 320); assert.equal(MARGEN_PANEL_PX, 12);
  cerca(radioEsferaPx(600, FOV_GLOBO, DISTANCIA_INICIAL), (Math.tan(Math.asin(1 / 3.2)) / Math.tan(Math.PI / 9)) * 300, 1e-9);
  assert.equal(radioEsferaPx(600, 40, 0.5), 0);
  const reserva = ANCHO_PANEL_PX + MARGEN_PANEL_PX;
  assert.equal(desplazamientoCentroPx(1000, 600, 0), 0);                                // sin panel: nada
  assert.equal(desplazamientoCentroPx(1448, 700, reserva), 0);                           // pantalla ancha: la esfera ya cabe a la izquierda, el globo NO salta al seleccionar
  for (const [ancho, alto] of [[900, 558], [1000, 620], [1100, 682]] as const) {
    const d = desplazamientoCentroPx(ancho, alto, reserva);
    const radio = radioEsferaPx(alto, FOV_GLOBO, DISTANCIA_INICIAL);
    assert.ok(d > 0 && d <= reserva / 2, `${ancho}: ${d}`);
    assert.ok(ancho / 2 - d + radio <= ancho - reserva - 12 + 1e-6, `a ${ancho} px la esfera (con margen) queda a la izquierda del panel`);
    assert.ok(ancho / 2 - d - radio >= 0, 'y no se sale por la izquierda');
  }
  assert.equal(desplazamientoCentroPx(0, 600, reserva), 0); assert.equal(desplazamientoCentroPx(900, 0, reserva), 0);
});

// CAMBIO (rediseño dashboard): antes este test exigía el panel flotante de 320 px (.tarjeta, media 900 px), su reserva (ANCHO_PANEL_PX + MARGEN_PANEL_PX, matchMedia) y el efecto que avisaba a la escena.
// Ahora el detalle es el panel externo: la reserva del globo es siempre 0 (`reservaDerecha: () => 0`), no hay tarjeta ni efecto de reserva, y la lógica pura desplazamientoCentroPx
// (probada arriba) queda en geometria.ts sin uso en la interfaz. Se conserva la cobertura de la escena (setViewOffset/clearViewOffset, un único setSize) y se añade que el globo no la duplica.
test('layout: globo sin panel flotante (reserva 0), canvas redimensionado solo por el ResizeObserver, sin tarjeta propia', () => {
  const c = leer('globo/globo.component.ts'); const e = leer('globo/escena.ts');
  assert.match(c, /reservaDerecha: \(\) => 0,/);
  assert.doesNotMatch(c, /\.tarjeta|ANCHO_PANEL_PX|MARGEN_PANEL_PX|matchMedia|hayDetalle|actualizarReserva|\bdetalle\(\)/);
  assert.match(e, /setViewOffset\(this\.ancho, this\.alto, px, 0, this\.ancho, this\.alto\)/); assert.match(e, /clearViewOffset\(\)/);
  assert.equal((e.match(/renderer\.setSize\(/g) ?? []).length, 1);                       // el tamaño del canvas solo lo cambia ajustarTamano (ResizeObserver)
  assert.match(e, /ResizeObserver/);
  assert.doesNotMatch(c, /transition|animation|@keyframes/);                             // sin transiciones ni animaciones CSS en el componente (movimiento reducido incluido)
});

// ---------- controles e instrucciones ----------
test('controles: UN grupo «Controles del globo» con +, −, Restablecer y Pausar/Reanudar rotación (>= 36 px, etiquetas dinámicas, sin aria-pressed ni región viva propia)', () => {
  const c = leer('globo/globo.component.ts');
  assert.equal((c.match(/role="group" aria-label="Controles del globo"/g) ?? []).length, 1);
  assert.doesNotMatch(c, /aria-label="Zoom del globo"/);                                 // el grupo anterior desaparece: un único grupo
  const grupo = /<div class="controles" role="group" aria-label="Controles del globo">([\s\S]*?)\n            <\/div>/.exec(c)?.[1] ?? '';
  assert.equal((grupo.match(/<button /g) ?? []).length, 4);
  for (const parte of ['aria-label="Acercar el globo"', 'aria-label="Alejar el globo"', 'aria-label="Restablecer la vista del globo"', '(click)="alternarRotacion()"']) assert.ok(grupo.includes(parte), parte);
  assert.match(grupo, /\[attr\.aria-label\]="rotando\(\) \? 'Pausar rotación' : 'Reanudar rotación'"/);
  assert.match(grupo, />\{\{ rotando\(\) \? 'Pausar rotación' : 'Reanudar rotación' \}\}<\/button>/);   // el texto visible coincide con el nombre accesible
  assert.doesNotMatch(c, /aria-pressed/);
  assert.match(c, /button \{[^}]*min-height: 36px[^}]*min-width: 36px|button \{[^}]*min-width: 36px[^}]*min-height: 36px/);
  assert.match(c, /\.controles \{ position: absolute; left: var\(--esp-3\); right: var\(--esp-3\); bottom: var\(--esp-3\); margin-inline: auto; width: fit-content;/);   // dentro del escenario, abajo al centro. CAMBIO: antes `left: 50%` + translateX limitaba el ancho disponible a la mitad y en móvil los botones se apilaban en 4 filas
  // CAMBIO (rediseño dashboard): antes había UNA región aria-live en el globo («Seleccionado: …»). Ahora esa región vive en el panel app-detalle-evento (una sola para las dos vistas) y el globo no tiene ninguna;
  // la rotación se anuncia por el texto del botón. El contador de eventos (role="status") es el recuento, no un anuncio de selección.
  assert.equal((c.match(/aria-live="polite"/g) ?? []).length, 0);
  assert.match(c, /readonly rotando = signal\(false\)/);
});

test('instrucciones: UNA línea corta por tipo de puntero y lo extenso (teclado, anterior/siguiente, tabla, rotación) en <details class="ayuda"> «Ayuda del globo»', () => {
  const c = leer('globo/globo.component.ts');
  const pista = /<p id="globo-pista" class="pista">([\s\S]*?)<\/p>/.exec(c)?.[1] ?? '';
  assert.match(pista, /<span class="fino">Arrastra para girar · Ctrl \+ rueda para acercar<\/span>/);
  assert.match(pista, /<span class="tactil">Arrastra para girar · pellizca para acercar<\/span>/);
  assert.doesNotMatch(pista, /flecha|teclado|Inicio/i);
  assert.match(c, /Pulsa un terremoto para ver su detalle/); assert.match(c, /<span class="tactil">Toca un terremoto<\/span>/);
  assert.match(c, /@media \(hover: hover\) and \(pointer: fine\) \{ \.pista \.fino \{ display: inline; \} \.pista \.tactil \{ display: none; \} \}/);
  assert.match(c, /\.pista \.fino \{ display: none; \}/);                                // por defecto (táctil): ni Ctrl ni teclado
  const ayuda = /<details class="ayuda">([\s\S]*?)<\/details>/.exec(c)?.[1] ?? '';
  assert.match(ayuda, /<summary>Ayuda del globo<\/summary>/);
  for (const parte of ['flechas para girar', 'Inicio para restablecer', '«Evento anterior» y «Evento siguiente»', 'seleccionar cada terremoto en la tabla', 'gira sola muy despacio', 'Pausar rotación', 'movimiento reducido']) assert.ok(ayuda.includes(parte), parte);
  // los botones Evento anterior / siguiente siguen existiendo (barra secundaria del pie) y la leyenda de profundidad sigue en la página
  assert.match(c, /<div class="navegacion" role="group" aria-label="Recorrer los terremotos por magnitud">/); assert.match(c, /Evento anterior<\/button>/); assert.match(c, /Evento siguiente<\/button>/);
  assert.match(c, /\{\{ recuento\(\) \}\}/); assert.match(leer('app.component.html'), /class="leyenda panel-ui o-leyenda" role="group"/);   // CAMBIO (rediseño dashboard): la leyenda es ahora un panel de la columna derecha
  assert.doesNotMatch(c, /id="globo-ayuda"|<p id="globo-ayuda"/);
});

// ---------- lectura de código: bucle único, rotación, textura, ciclo de vida ----------
test('escena: UN solo bucle rAF con guarda; en pausa o con la rotación pausada NO hay render continuo (el bucle se para y solo despierta un temporizador único)', () => {
  const e = leer('globo/escena.ts');
  assert.equal((e.match(/requestAnimationFrame\(/g) ?? []).length, 1);
  assert.equal((e.match(/new MaquinaRotacion\(/g) ?? []).length, 1);
  const fot = /private readonly fotograma = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '';
  // el bucle solo se encadena por transición de cámara, inercia, rotación en curso o pulsación ambiental; en cualquier otro caso programarReanudacion() y se acaba
  // CAMBIO (F7, 3.ª iteración): de 3 a 5 llamadas a encolar(): (1) recorte a 30/25 fps, (2) transición de cámara (NUEVO), (3) inercia, (4) rotación en curso, (5) pulsación (NUEVO).
  // Sigue habiendo UN solo requestAnimationFrame (guarda en encolar) y la rama final sigue siendo programarReanudacion: nada de render continuo en reposo.
  assert.equal((fot.match(/this\.encolar\(\)/g) ?? []).length, 5);
  assert.match(fot, /if \(this\.enPausa\) return;/);
  assert.doesNotMatch(fot, /setInterval|requestAnimationFrame/);
  const prog = /private programarReanudacion\(\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '';
  assert.match(prog, /if \(espera === null \|\| this\.enPausa\) return;/);              // bloqueada (pausa manual, selección, 2D…): sin temporizador
  assert.match(prog, /if \(this\.idTemporizador !== 0\) \{ clearTimeout\(this\.idTemporizador\); this\.idTemporizador = 0; \}/);   // un único temporizador
  // CAMBIO (F7, 4.ª iteración): 3 setTimeout en total: reanudación de la rotación, cálculo FINAL del throttle de la etiqueta y el temporizador único de 60 s del Sol (programarSol); ninguno en el fotograma
  assert.equal((e.match(/setTimeout\(/g) ?? []).length, 3);
  const pausa = /private actualizarPausa\(\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '';
  assert.match(pausa, /cancelAnimationFrame\(this\.rafId\)/); assert.match(pausa, /clearTimeout\(this\.idTemporizador\)/);
  assert.match(pausa, /this\.rotacion\.fijarEntorno\(!this\.pausadoPorVista, !this\.pestanaOculta, !this\.fueraDePantalla\)/);
  assert.match(e, /new MaquinaRotacion\(this\.mqMovimiento\.matches\)/);                // movimiento reducido: no arranca sola
  assert.match(e, /this\.esf\.theta -= radianes/);                                       // sentido fijo (este), nunca por fotograma: el ángulo viene de la máquina (tiempo real)
  assert.match(e, /this\.rotacion\.avanzar\(t\)/); assert.doesNotMatch(e, /autoRotate|rotateLeft|0\.0\d+\s*\*\s*\(?Math\.PI/);
});

test('escena: la interacción (puntero, rueda con Ctrl, zoom, teclado, restablecer) detiene la rotación; la selección la bloquea', () => {
  const e = leer('globo/escena.ts'); const c = leer('globo/globo.component.ts');
  assert.match(e, /this\.rotacion\.fijarPuntero\(true, performance\.now\(\)\)/); assert.match(e, /this\.rotacion\.fijarPuntero\(false, performance\.now\(\)\)/);
  assert.match(/private readonly alRueda = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '', /this\.rotacion\.interactuar\(performance\.now\(\)\)/);
  // CAMBIO (F7, ajuste 3/4): zoom() ya no admite 0 («Restablecer» pasa por recuperarVista, que también detiene la rotación con interactuar)
  assert.match(/recuperarVista\(\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /this\.rotacion\.interactuar\(performance\.now\(\)\)/);
  for (const metodo of ['zoom\\(sentido: 1 \\| -1\\): void', 'girar\\(dx: -1 \\| 0 \\| 1, dy: -1 \\| 0 \\| 1\\): void']) {
    assert.match(new RegExp(`${metodo} \\{[\\s\\S]*?\\n  \\}`).exec(e)?.[0] ?? '', /this\.rotacion\.interactuar\(performance\.now\(\)\)/, metodo);   // botones y teclado pasan por aquí
  }
  assert.match(/fijarSeleccion\(id: string \| null, centrar = true\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /this\.rotacion\.fijarSeleccion\(i >= 0, performance\.now\(\)\)/);
  assert.match(e, /alternarRotacion\(\): boolean \{[\s\S]*?this\.rotacion\.alternar\(\)/);
  assert.match(c, /alternarRotacion\(\): void \{\s*let activa = false;\s*this\.fuera\(\(\) => \{ activa = this\.escena\?\.alternarRotacion\(\) \?\? false; \}\);\s*this\.rotando\.set\(activa\);/);
});

test('refresco de datos: fijarEventos solo actualiza buffers (no recrea escena, cámara, controles, texturas ni toca la rotación) y los effects del componente no reinician nada', () => {
  const e = leer('globo/escena.ts'); const c = leer('globo/globo.component.ts');
  const fijar = /fijarEventos\(puntos: PuntosGlobo\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '';
  assert.doesNotMatch(fijar, /new (Scene|PerspectiveCamera|OrbitControls|WebGLRenderer|CanvasTexture|ShaderMaterial)|this\.rotacion\.|this\.camara|this\.controles|colocarCamara|centrarEn|alternar|fijarTextura/);
  assert.match(fijar, /this\.fijarSeleccion\(this\.idSeleccion, false\)/);              // la selección se mantiene si el id sigue (false = sin mover la cámara)
  assert.equal((e.match(/new (Scene|PerspectiveCamera|OrbitControls|WebGLRenderer)\(/g) ?? []).length, 4);   // una vez cada uno, en iniciar()
  assert.match(c, /effect\(\(\) => \{ const r = this\.resultado\(\); untracked\(\(\) => this\.fuera\(\(\) => this\.escena\?\.fijarEventos\(r\.puntos\)\)\); \}\);/);
  assert.match(c, /effect\(\(\) => \{ const id = this\.seleccionado\(\); untracked\(\(\) => this\.fuera\(\(\) => this\.escena\?\.fijarSeleccion\(id\)\)\); \}\);/);
  assert.doesNotMatch(c, /ngOnChanges|ngDoCheck/);
  assert.equal((c.match(/void this\.iniciar\(\)/g) ?? []).length, 1);                    // la escena solo se crea una vez (si el estado es «inactivo»)
  assert.match(c, /else if \(this\.estado\(\) === 'inactivo'\) void this\.iniciar\(\)/);
});

test('textura y ciclo de vida: la textura se genera UNA vez (con las fronteras), con mipmaps, anisotropía, sRGB y dispose; se libera todo al destruir', () => {
  const e = leer('globo/escena.ts');
  assert.equal((e.match(/new CanvasTexture\(/g) ?? []).length, 1);
  assert.equal((e.match(/this\.fijarTextura\(/g) ?? []).length, 1);                      // única llamada: dentro de fijarFronteras
  assert.match(/fijarFronteras\(geojson: unknown, paleta: PaletaGlobo\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /this\.fijarTextura\(geojson, paleta\)/);
  assert.match(e, /textura\.colorSpace = SRGBColorSpace/); assert.match(e, /textura\.anisotropy = Math\.min\(8, this\.renderer\.capabilities\.getMaxAnisotropy\(\)\)/);
  assert.match(e, /tamanoTextura\(this\.renderer\.capabilities\.maxTextureSize, window\.matchMedia\('\(max-width: 700px\), \(pointer: coarse\)'\)\.matches\)/);
  assert.doesNotMatch(e, /generateMipmaps = false|minFilter = (Nearest|Linear)Filter/);  // mipmaps por defecto (LinearMipmapLinear)
  assert.match(e, /this\.texturaTierra\?\.dispose\(\);\s*this\.texturaTierra = textura/);   // al sustituirla
  const destruir = /destruir\(\): void \{([\s\S]*?)\n  \}\n\}/.exec(e)?.[1] ?? '';
  for (const parte of ['this.texturaTierra?.dispose()', 'clearTimeout(this.idTemporizador)', 'cancelAnimationFrame(this.rafId)', 'this.malla.dispose()', 'recurso.dispose()', 'this.renderer.forceContextLoss()', 'this.controles.dispose()']) assert.ok(destruir.includes(parte), parte);
  assert.match(e, /this\.propios\.push\([^)]*this\.matPlaneta[^)]*this\.geomPunto[^)]*this\.matPunto[^)]*matHalo\)/);   // material del planeta, geometrías y materiales de marcador y halo
  // sin textura (fallo del GeoJSON): esfera lisa del color del océano y aviso (ya existente)
  assert.match(e, /uTieneMapa: \{ value: 0 \}/); assert.match(e, /uTieneMapa > 0\.5 \? texture2D\(uMapa, vUv\)\.rgb : uOceano/);
  assert.match(leer('globo/globo.component.ts'), /No se pudieron cargar las fronteras de países; los terremotos se dibujan igualmente/);
  // iluminación: luz fija respecto a la cámara (espacio de vista), limbo oscurecido y reborde fresnel, sin posprocesado ni texturas externas
  assert.match(e, /uLuz: \{ value: new Vector3\(-0\.45, 0\.55, 0\.7\) \}/); assert.match(e, /float limbo = /); assert.match(e, /pow\(1\.0 - cara, 3\.0\)/);
  assert.doesNotMatch(e, /EffectComposer|TextureLoader|ImageLoader|fetch\(/);
  const tex = leer('globo/textura.ts');
  assert.doesNotMatch(tex, /document\.|window\.|from 'three|fetch\(|new Image/);          // módulo puro: ni DOM ni red
});

test('app: elegir() NO centra el mapa ni abre popups con la vista 3D (Leaflet oculto) y conserva la selección compartida y el resalte', () => {
  const ts = leer('app.component.ts');
  const cuerpo = /elegir\(id: string \| null, origen: 'mapa' \| 'tabla'\): void \{([\s\S]*?)\n  \}\n/.exec(ts)?.[1] ?? '';
  // CAMBIO (vistas internas): la guarda `en3d` se amplía a `sinMapa` = visor 3D O vista distinta del Panel (Leaflet oculto en ambos casos); las únicas llamadas a panTo/openPopup siguen siendo UNA y solo con el mapa visible
  assert.match(cuerpo, /const sinMapa = this\.visor\(\) === '3d' \|\| this\.vista\(\) !== 'panel';/);
  assert.equal((cuerpo.match(/panTo\(/g) ?? []).length, 1); assert.equal((cuerpo.match(/openPopup\(/g) ?? []).length, 1);
  assert.match(cuerpo, /if \(origen === 'tabla' && !sinMapa\) \{ this\.map\?\.panTo\(marcador\.getLatLng\(\)\); marcador\.openPopup\(\); \}/);   // únicas llamadas, solo con el mapa 2D visible
  assert.match(cuerpo, /if \(sinMapa\) this\.map\?\.closePopup\(\);/);                     // solo cierra el que pudiera quedar abierto: al volver al 2D no hay popups colgados
  for (const parte of ['this.quitarResalte(actual)', 'this.seleccionado.set(destino)', 'this.resaltar(destino)', "no se dibuja en el mapa; se conserva en la tabla"]) assert.ok(cuerpo.includes(parte), parte);
  assert.match(cuerpo, /if \(destino === null\) \{ this\.map\?\.closePopup\(\); return; \}/);   // comportamiento 2D sin cambios
});

test('app: ÚNICO camino de aplicación de eventos: mapa 2D y globo 3D reciben SIEMPRE la misma lista (demo, en vivo, reproducción y «cargar el resto»)', () => {
  const ts = leer('app.component.ts');
  const aplicar = /private aplicarEventos\(features: Evento\[\]\): void \{([\s\S]*?)\n  \}/.exec(ts)?.[1] ?? '';
  assert.match(aplicar, /this\.dibujar\(features\);\s*this\.eventos\.set\(features\);/);   // misma referencia a las dos
  // fuera de aplicarEventos solo queda el vaciado de descartarLectura (listas vacías en ambos lados)
  assert.equal((ts.match(/this\.dibujar\(/g) ?? []).length, 2); assert.equal((ts.match(/this\.eventos\.set\(/g) ?? []).length, 2);
  assert.match(/private descartarLectura\(\): void \{[\s\S]*?\n  \}/.exec(ts)?.[0] ?? '', /this\.eventos\.set\(v\.eventos\)[\s\S]*this\.dibujar\(\[\]\)/);   // lecturaVacia().eventos = []
  assert.equal((ts.match(/this\.aplicarEventos\(/g) ?? []).length, 4);                   // demo, reproducción, en vivo y cargarResto
  assert.match(ts, /this\.aplicarEventos\(data\.features as unknown as Evento\[\]\)/);   // demo
  assert.match(/private async leerReplay[\s\S]*?\n  \}\n/.exec(ts)?.[0] ?? '', /this\.aplicarEventos\(eventos\);\s*this\.estadisticas\.set\(est\)/);
  assert.match(ts, /this\.aplicarEventos\(datos\.features\);\s*this\.estadisticas\.set\(panel\.estadisticas\)/);
  assert.match(/async cargarResto\(\)[\s\S]*?\n  \}\n/.exec(ts)?.[0] ?? '', /const todos = \[\.\.\.this\.eventos\(\), \.\.\.resto\.features\];\s*this\.aplicarEventos\(todos\)/);
  assert.deepEqual(leerLecturaVaciaEventos(), []);
});

function leerLecturaVaciaEventos(): unknown[] {
  const modo = leer('modo.ts');
  return /eventos: \[\] as Evento\[\]/.test(modo) ? [] : ['cambió lecturaVacia'];
}

// =====================================================================================================================================================
// F7, 3.ª iteración: transición de cámara, regiones, pulsación de marcadores y etiqueta del hover (lógica pura en camara.ts, pulso.ts y tooltip.ts)
// =====================================================================================================================================================
const GRAD = Math.PI / 180;
const POSE_A: PoseCamara = { theta: 170 * GRAD, phi: 1.2, distancia: 3.2 };
const POSE_B: PoseCamara = { theta: -170 * GRAD, phi: 0.8, distancia: 2.56 };
/** Avanza la transición con fotogramas de `paso` ms desde `t0` hasta que acaba (o `max` fotogramas) y devuelve las poses. */
function correr(tr: TransicionCamara, t0: number, paso: number, max = 1000): { poses: { pose: PoseCamara; fin: boolean }[] } {
  const poses: { pose: PoseCamara; fin: boolean }[] = [];
  for (let k = 0; k < max; k++) { const r = tr.avanzar(t0 + k * paso); if (r === null) break; poses.push(r); if (r.fin) break; }
  return { poses };
}

// ---------- rotación: el retardo de 3 s y su uso por los atajos de región ----------
test('rotación 3 s: una interacción (también «Ir a región») retrasa la rotación exactamente 3 s desde esa orientación; con selección no gira', () => {
  assert.equal(RETARDO_REANUDAR_MS, 3000);
  const m = new MaquinaRotacion();
  simular(m, 0, 2000, 16);
  m.interactuar(2000);                                                                   // lo que hace irARegion() (se comprueba más abajo en el código)
  assert.equal(m.esperaMs(2000), 3000); assert.ok(!m.puedeGirar(4999)); assert.ok(m.puedeGirar(5000));
  const s = new MaquinaRotacion(); s.fijarSeleccion(true, 0); s.interactuar(10);
  assert.equal(s.esperaMs(100_000), null); assert.ok(!s.puedeGirar(100_000));              // con un evento seleccionado no gira nunca (la región no cambia eso)
});

// ---------- ángulos, easing y estado de la transición ----------
test('camara: la diferencia angular es el camino MÁS CORTO en (−π, π] (cruzando ±π, media vuelta, múltiplos de 2π)', () => {
  const grados = (de: number, a: number) => normalizarDiferenciaAngulo((a - de) * GRAD) / GRAD;
  cerca(grados(170, -170), 20, 1e-9);                                                    // 20° hacia el este, no 340° hacia el oeste
  cerca(grados(-170, 170), -20, 1e-9);
  cerca(grados(10, 350), -20, 1e-9); cerca(grados(0, 90), 90, 1e-9); cerca(grados(0, -90), -90, 1e-9); cerca(grados(45, 45), 0, 1e-9);
  assert.equal(normalizarDiferenciaAngulo(Math.PI), Math.PI);                            // media vuelta: +π (el intervalo es abierto por abajo, cerrado por arriba)
  cerca(normalizarDiferenciaAngulo(-Math.PI), Math.PI, 1e-12);
  cerca(normalizarDiferenciaAngulo(3 * Math.PI), Math.PI, 1e-12); assert.equal(normalizarDiferenciaAngulo(4 * Math.PI), 0);
  assert.equal(normalizarDiferenciaAngulo(NaN), 0); assert.ok(Object.is(normalizarDiferenciaAngulo(0), 0));
  for (let d = -20; d <= 20; d += 0.37) {                                                // barrido: siempre en (−π, π] y equivalente módulo 2π
    const r = normalizarDiferenciaAngulo(d);
    assert.ok(r > -Math.PI - 1e-12 && r <= Math.PI + 1e-12, `${d} → ${r}`);
    cerca(Math.cos(r), Math.cos(d), 1e-9); cerca(Math.sin(r), Math.sin(d), 1e-9);
  }
});

test('camara: easing ease-in-out (0→0, 0,5→0,5, 1→1; monótono; velocidad nula en los extremos; acotado) y duración dentro de 700–900 ms', () => {
  assert.equal(suavizar(0), 0); assert.equal(suavizar(0.5), 0.5); assert.equal(suavizar(1), 1);
  assert.equal(suavizar(-3), 0); assert.equal(suavizar(7), 1);
  let previo = 0; for (let t = 0.01; t <= 1; t += 0.01) { const f = suavizar(t); assert.ok(f >= previo - 1e-12); previo = f; }
  assert.ok(suavizar(0.05) < 0.05 && suavizar(0.95) > 0.95);                             // arranca y frena despacio (ease-in-out)
  assert.ok(DURACION_TRANSICION_MS >= 700 && DURACION_TRANSICION_MS <= 900);
  assert.equal(FACTOR_ACERCAR_SELECCION, 0.8); assert.equal(DT_MAX_TRANSICION_MS, 100);
});

test('camara: transición — sin salto al arrancar, giro por el camino corto, progreso por tiempo real, fin exacto y fin de la actividad', () => {
  const tr = new TransicionCamara();
  assert.ok(!tr.activa); assert.equal(tr.avanzar(0), null);                              // sin transición no hay pose
  tr.iniciar(POSE_A, POSE_B);
  assert.ok(tr.activa);
  const { poses } = correr(tr, 1000, 16);
  const primero = poses[0].pose;
  cerca(primero.theta, POSE_A.theta); cerca(primero.phi, POSE_A.phi); cerca(primero.distancia, POSE_A.distancia);   // primer fotograma: dt = 0, sin salto
  // a los 400 ms (25 fotogramas de 16 ms; el primero no cuenta): p = 0,5 y el easing vale 0,5 → exactamente a mitad de camino
  const mitad = poses[25].pose;
  cerca(mitad.theta - POSE_A.theta, 10 * GRAD, 1e-9);                                    // 170° → −170°: la mitad de 20° (no de 340°)
  cerca(mitad.phi, (POSE_A.phi + POSE_B.phi) / 2, 1e-9); cerca(mitad.distancia, (POSE_A.distancia + POSE_B.distancia) / 2, 1e-9);
  for (let i = 1; i < poses.length; i++) assert.ok(poses[i].pose.theta >= poses[i - 1].pose.theta - 1e-12);   // siempre en el mismo sentido (+20°)
  const ultimo = poses[poses.length - 1];
  assert.ok(ultimo.fin); assert.ok(poses.slice(0, -1).every((p) => !p.fin)); assert.ok(!tr.activa); assert.equal(tr.avanzar(99_999), null);
  cerca(ultimo.pose.theta - POSE_A.theta, 20 * GRAD, 1e-9); cerca(ultimo.pose.phi, POSE_B.phi, 1e-9); cerca(ultimo.pose.distancia, POSE_B.distancia, 1e-9);
  assert.equal(poses.length, Math.ceil(DURACION_TRANSICION_MS / 16) + 1);                // 51 fotogramas: el de arranque más 50 de 16 ms
  // independiente de los FPS: a los 400 ms de tiempo real la pose es la misma con fotogramas de 16 ms que de 20 ms
  const otra = new TransicionCamara(); otra.iniciar(POSE_A, POSE_B);
  const p20 = correr(otra, 5000, 20).poses; cerca(p20[20].pose.theta, mitad.theta, 1e-9);
  // un hueco largo (suspensión) no salta: el dt se acota a DT_MAX_TRANSICION_MS
  const hueco = new TransicionCamara(); hueco.iniciar(POSE_A, POSE_B);
  hueco.avanzar(0); const salto = hueco.avanzar(60_000)!;
  assert.ok(!salto.fin); assert.ok(Math.abs(salto.pose.theta - POSE_A.theta) < 20 * GRAD * 0.2);
  // duración 0: el primer fotograma ya es el destino
  const cero = new TransicionCamara(); cero.iniciar(POSE_A, POSE_B, 0);
  const z = cero.avanzar(0)!; assert.ok(z.fin); cerca(z.pose.distancia, POSE_B.distancia);
  // φ nunca cruza un polo: va de un valor en [0, π] a otro en [0, π] por interpolación lineal (sin salir del intervalo)
  const polar = new TransicionCamara(); polar.iniciar({ theta: 0, phi: PHI_MIN, distancia: 3 }, { theta: 0, phi: PHI_MAX, distancia: 3 });
  for (const p of correr(polar, 0, 16).poses) assert.ok(p.pose.phi >= PHI_MIN - 1e-12 && p.pose.phi <= PHI_MAX + 1e-12);
});

test('camara: cancelar deja la cámara DONDE ESTÁ (no devuelve más poses: sin salto al destino ni vuelta al origen) y una transición nueva arranca desde la pose actual', () => {
  const tr = new TransicionCamara();
  tr.iniciar(POSE_A, POSE_B);
  const { poses } = correr(tr, 0, 16, 10);                                               // 10 fotogramas y se interrumpe
  const donde = poses[poses.length - 1].pose;
  assert.ok(tr.activa); tr.cancelar();
  assert.ok(!tr.activa); assert.equal(tr.avanzar(1000), null); assert.equal(tr.avanzar(2000), null);   // ya no se mueve nada: la escena no aplica ninguna pose
  tr.cancelar();                                                                         // cancelar dos veces es inocuo
  assert.ok(donde.theta > POSE_A.theta && donde.theta < POSE_A.theta + 20 * GRAD);       // la pose en que se quedó es intermedia, no el destino
  tr.iniciar(donde, POSE_A);                                                             // nueva transición desde donde se quedó
  const primera = tr.avanzar(5000)!.pose;
  cerca(primera.theta, donde.theta); cerca(primera.phi, donde.phi); cerca(primera.distancia, donde.distancia);   // sin reinicio ni salto
});

test('camara: esTransicionNula (mismo encuadre, también módulo 2π) y acotarPhi', () => {
  assert.ok(esTransicionNula(POSE_A, { ...POSE_A, theta: POSE_A.theta + 2 * Math.PI }));
  assert.ok(!esTransicionNula(POSE_A, POSE_B)); assert.ok(!esTransicionNula(POSE_A, { ...POSE_A, distancia: 2.5 }));
  assert.equal(acotarPhi(-1), PHI_MIN); assert.equal(acotarPhi(10), PHI_MAX); assert.equal(acotarPhi(1), 1);
  assert.equal(PHI_MIN, 0.05); assert.equal(PHI_MAX, Math.PI - 0.05);                    // el mismo tope que el giro por teclado de escena.ts
});

// ---------- encuadre de un evento ----------
test('camara: el encuadre de un evento deja la cámara EN LA DIRECCIÓN de su normal (θ = lon, φ = 90° − lat), coherente con latLonAXyz y con la rotación', () => {
  for (const [lat, lon] of [[0, 0], [18, 0], [35.6, 139.7], [-33, -70], [60, -150], [-20, 179], [10, -179], [-60, 90]] as const) {
    const d = 2.5; const p = poseDeLatLon(lat, lon, d);
    const camara: Xyz = [d * Math.sin(p.phi) * Math.sin(p.theta), d * Math.cos(p.phi), d * Math.sin(p.phi) * Math.cos(p.theta)];   // Spherical de three
    const esperado = latLonAXyz(lat, lon, d);
    for (let i = 0; i < 3; i++) cerca(camara[i], esperado[i], 1e-9);
    const n = latLonAXyz(lat, lon, 1); const q = poseDeNormal(n[0], n[1], n[2], d);      // desde la normal del evento: la misma pose
    cerca(q.phi, p.phi, 1e-9); cerca(Math.cos(q.theta), Math.cos(p.theta), 1e-9); cerca(Math.sin(q.theta), Math.sin(p.theta), 1e-9); assert.equal(q.distancia, d);
  }
  // la cámara inicial (lat 18, lon 0) es la pose θ = 0, φ = 72°: el mismo eje que usa la rotación automática (θ decrece ⇒ lon decrece)
  const ini = poseDeLatLon(LAT_INICIAL, 0, DISTANCIA_INICIAL); cerca(ini.theta, 0); cerca(ini.phi, 72 * GRAD, 1e-12);
  // clamp polar: nunca exactamente en un polo; en un polo exacto se conserva el azimut actual (no hay giro gratuito)
  assert.equal(poseDeLatLon(90, 0, 3).phi, PHI_MIN); assert.equal(poseDeLatLon(-90, 0, 3).phi, PHI_MAX);
  assert.equal(poseDeNormal(0, 1, 0, 3, 1.234).theta, 1.234); assert.equal(poseDeNormal(0, -1, 0, 3, -0.5).phi, PHI_MAX);
});

test('camara: el recorrido es el MÁS CORTO también hacia la cara oculta y cruzando el antimeridiano (nunca más de media vuelta)', () => {
  const tramo = (de: PoseCamara, a: PoseCamara) => { const tr = new TransicionCamara(); tr.iniciar(de, a); const { poses } = correr(tr, 0, 16); return poses[poses.length - 1].pose.theta - poses[0].pose.theta; };
  cerca(tramo(poseDeLatLon(0, 170, 3), poseDeLatLon(0, -170, 3)), 20 * GRAD, 1e-9);     // por el antimeridiano: +20°
  cerca(tramo(poseDeLatLon(0, -170, 3), poseDeLatLon(0, 170, 3)), -20 * GRAD, 1e-9);
  const oculto = tramo(poseDeLatLon(0, 0, 3), poseDeLatLon(10, 150, 3));               // cámara en lon 0, evento en la cara oculta (lon 150)
  cerca(oculto, 150 * GRAD, 1e-9); assert.ok(Math.abs(oculto) <= Math.PI + 1e-12);
  const opuesto = tramo(poseDeLatLon(0, 0, 3), poseDeLatLon(0, 180, 3));
  cerca(Math.abs(opuesto), Math.PI, 1e-9);                                               // el punto antípoda: media vuelta, el máximo posible
  for (let lon = -180; lon <= 180; lon += 17) assert.ok(Math.abs(tramo(poseDeLatLon(0, 0, 3), poseDeLatLon(0, lon, 3))) <= Math.PI + 1e-9, `lon ${lon}`);
});

// ---------- regla de zoom ----------
test('camara: al seleccionar se ACERCA ×0,8 dentro de los límites y NUNCA se aleja', () => {
  cerca(distanciaAcercada(3.2, DISTANCIA_MIN, DISTANCIA_MAX), 2.56);
  assert.equal(distanciaAcercada(DISTANCIA_MIN, DISTANCIA_MIN, DISTANCIA_MAX), DISTANCIA_MIN);   // ya al mínimo: se queda
  assert.equal(distanciaAcercada(1.4, DISTANCIA_MIN, DISTANCIA_MAX), DISTANCIA_MIN);             // 1,4 × 0,8 = 1,12 < mín: se acota al mínimo (1,25), que sigue siendo más cerca
  assert.equal(distanciaAcercada(1.0, DISTANCIA_MIN, DISTANCIA_MAX), 1.0);                       // más cerca que el mínimo (imposible con los controles): no se aleja hacia él
  for (let d = DISTANCIA_MIN; d <= DISTANCIA_MAX; d += 0.1) {
    const r = distanciaAcercada(d, DISTANCIA_MIN, DISTANCIA_MAX);
    assert.ok(r <= d + 1e-12 && r >= DISTANCIA_MIN - 1e-12, `${d} → ${r}`);
  }
  cerca(distanciaAcercada(DISTANCIA_MAX, DISTANCIA_MIN, DISTANCIA_MAX), DISTANCIA_MAX * 0.8);
});

// CAMBIO (F7, ajuste 3/4): antes esta prueba cubría también la «restauración del zoom previo» (planificarRestauracion y el campo `previo`). Esa regla desaparece: al cerrar, el zoom va a la
// distancia PREDETERMINADA (se prueba en «camara: planificarRecuperacion…»). Se conserva TODO lo demás: acercar ×0,8 en la primera selección, no acumular en siguiente/anterior, la transición propia
// no es zoom manual, el zoom manual se respeta y el mínimo no se rebasa. Solo cambia la forma del estado ({ aplicado, manual }, sin `previo`).
test('camara: la sesión de zoom de la selección — primera selección acerca, siguiente/anterior no acumula, la transición propia no es zoom manual y el zoom manual se respeta', () => {
  const [mn, mx] = [DISTANCIA_MIN, DISTANCIA_MAX];
  // 1) primera selección: acerca ×0,8 y memoriza la distancia aplicada
  const s1 = planificarZoomSeleccion(ZOOM_SIN_SESION, 3.2, false, mn, mx);
  cerca(s1.destino, 2.56); assert.deepEqual(s1.estado, { aplicado: s1.destino, manual: false });
  assert.deepEqual(ZOOM_SIN_SESION, { aplicado: null, manual: false });                               // el estado inicial no se muta
  assert.ok(!('previo' in s1.estado));                                                                 // ya no se guarda el zoom previo
  // 2) siguiente/anterior sin tocar el zoom: NO se acerca más (no se acumula ×0,8 en cada evento)
  const s2 = planificarZoomSeleccion(s1.estado, s1.destino, false, mn, mx);
  cerca(s2.destino, s1.destino); assert.equal(s2.estado.manual, false);
  assert.equal(planificarZoomSeleccion(s1.estado, s1.destino + TOLERANCIA_ZOOM / 2, false, mn, mx).estado.manual, false);   // la deriva numérica no cuenta como zoom manual
  // 3) cambio de evento con la transición anterior aún en curso (distancia intermedia): tampoco cuenta como zoom manual
  const s3 = planificarZoomSeleccion(s1.estado, 2.9, true, mn, mx);
  cerca(s3.destino, s1.destino); assert.equal(s3.estado.manual, false);
  // 4) la persona cambió el zoom (rueda, botones, pellizco): se respeta su zoom y la sesión queda «manual» (también si se alejó o si luego coincide con el aplicado)
  const s4 = planificarZoomSeleccion(s1.estado, 1.8, false, mn, mx);
  cerca(s4.destino, 1.8); assert.equal(s4.estado.manual, true);
  assert.equal(planificarZoomSeleccion(s4.estado, s1.destino, false, mn, mx).destino, s1.destino); assert.equal(planificarZoomSeleccion(s4.estado, s1.destino, false, mn, mx).estado.manual, true);
  cerca(planificarZoomSeleccion(s1.estado, 4.1, false, mn, mx).destino, 4.1);
  // 5) ya al mínimo: se queda (nunca se aleja)
  const alMin = planificarZoomSeleccion(ZOOM_SIN_SESION, mn, false, mn, mx);
  assert.equal(alMin.destino, mn);
});

// ---------- recuperación de la vista (ajuste 3/4: Restablecer, Cerrar y clic fuera) ----------
const CERCA = (a: PoseCamara, b: PoseCamara, tol = 1e-12) => { cerca(a.theta, b.theta, tol); cerca(a.phi, b.phi, tol); cerca(a.distancia, b.distancia, tol); };

test('camara: planificarRecuperacion — zoom a la distancia PREDETERMINADA desde cualquier zoom (alejado, cercano o ya en ella); NO el zoom previo a la selección', () => {
  for (const d of [DISTANCIA_MIN, 1.8, 2.56, DISTANCIA_INICIAL, 4.5, DISTANCIA_MAX]) {
    const plan = planificarRecuperacion({ theta: 0.4, phi: 1.3, distancia: d }, DISTANCIA_INICIAL);
    assert.equal(plan.destino.distancia, DISTANCIA_INICIAL, `desde ${d}`);
  }
  assert.equal(planificarRecuperacion({ theta: 0, phi: 1.3, distancia: 3 }, 2.7).destino.distancia, 2.7);   // la distancia es un parámetro (escena.ts pasa DISTANCIA_INICIAL)
  assert.ok(DISTANCIA_INICIAL >= DISTANCIA_MIN && DISTANCIA_INICIAL <= DISTANCIA_MAX);
});

test('camara: planificarRecuperacion — conserva el AZIMUT (la región mirada) y el polar dentro de 35°–145°; solo acota un polar casi cenital; sin volver a la orientación inicial', () => {
  cerca(PHI_ENDEREZADO_MIN, 35 * GRAD, 1e-12); cerca(PHI_ENDEREZADO_MAX, 145 * GRAD, 1e-12);
  assert.ok(PHI_ENDEREZADO_MIN > PHI_MIN && PHI_ENDEREZADO_MAX < PHI_MAX);                             // el rango es más estricto que el tope técnico de φ
  for (const theta of [-3, -Math.PI, -1, 0, 0.7, 2, Math.PI, 5.5, 9]) {                                  // el azimut es EXACTAMENTE el actual (sin normalizar): la diferencia con el origen es 0
    const p = planificarRecuperacion({ theta, phi: 1.1, distancia: 5 }, DISTANCIA_INICIAL).destino;
    assert.equal(p.theta, theta); assert.equal(normalizarDiferenciaAngulo(p.theta - theta), 0);
  }
  for (const grados of [35, 36, 60, 72, 90, 100, 144, 145]) {                                            // dentro del rango: se conserva el polar (la latitud central)
    const phi = grados * GRAD; assert.equal(planificarRecuperacion({ theta: 1, phi, distancia: 4 }, DISTANCIA_INICIAL).destino.phi, phi, `${grados}°`);
  }
  assert.equal(planificarRecuperacion({ theta: 1, phi: PHI_MIN, distancia: 4 }, DISTANCIA_INICIAL).destino.phi, PHI_ENDEREZADO_MIN);        // casi sobre el polo norte: al límite
  assert.equal(planificarRecuperacion({ theta: 1, phi: 10 * GRAD, distancia: 4 }, DISTANCIA_INICIAL).destino.phi, PHI_ENDEREZADO_MIN);
  assert.equal(planificarRecuperacion({ theta: 1, phi: PHI_MAX, distancia: 4 }, DISTANCIA_INICIAL).destino.phi, PHI_ENDEREZADO_MAX);        // casi sobre el polo sur
  assert.equal(acotarPhiEnderezado(NaN), Math.PI / 2); assert.equal(acotarPhiEnderezado(Infinity), Math.PI / 2);
  assert.equal(planificarRecuperacion({ theta: NaN, phi: 1.2, distancia: 3 }, DISTANCIA_INICIAL).destino.theta, 0);   // dato no finito: se normaliza, no se propaga
  // no vuelve a Europa/África: desde Japón, Andes y el Pacífico el azimut sigue siendo el suyo (distinto del inicial θ = 0)
  for (const id of ['japon', 'andes', 'pacifico']) {
    const r = regionPorId(id)!; const actual = poseDeLatLon(r.lat, r.lon, 2.4);
    const p = planificarRecuperacion(actual, DISTANCIA_INICIAL).destino;
    assert.equal(p.theta, actual.theta); assert.ok(Math.abs(p.theta) > 0.5);
  }
});

test('camara: planificarRecuperacion — `up` = (0,1,0) y roll = 0 SIEMPRE (también con datos extraños), independiente de la selección, la región y el zoom', () => {
  assert.deepEqual([...UP_VERTICAL], [0, 1, 0]);
  const entradas: PoseCamara[] = [{ theta: 0, phi: 1.2, distancia: 3.2 }, { theta: 2.5, phi: PHI_MIN, distancia: 1.25 }, { theta: -2, phi: PHI_MAX, distancia: 6 }, { theta: NaN, phi: NaN, distancia: NaN }];
  for (const e of entradas) {
    const plan = planificarRecuperacion(e, DISTANCIA_INICIAL);
    assert.deepEqual([...plan.up], [0, 1, 0]); assert.equal(plan.roll, 0);
    assert.ok(Number.isFinite(plan.destino.theta) && Number.isFinite(plan.destino.phi) && plan.destino.phi >= PHI_ENDEREZADO_MIN && plan.destino.phi <= PHI_ENDEREZADO_MAX);
  }
  // la función solo recibe la pose: no hay forma de que dependa de si hay selección (sin selección también recupera zoom y enderezado)
  assert.equal(planificarRecuperacion.length, 2);
  // idempotente: recuperar desde la pose ya recuperada no cambia nada (no hay transición que hacer)
  const una = planificarRecuperacion({ theta: 1.1, phi: 0.2, distancia: 5 }, DISTANCIA_INICIAL);
  assert.ok(esTransicionNula(una.destino, planificarRecuperacion(una.destino, DISTANCIA_INICIAL).destino));
});

test('camara: la recuperación PARTE de la pose actual (sin saltos), gira por el camino más corto, el polar no cruza polos y el zoom va suave a la distancia predeterminada', () => {
  for (const actual of [{ theta: 170 * GRAD, phi: 20 * GRAD, distancia: 1.5 }, { theta: -170 * GRAD, phi: 160 * GRAD, distancia: 5.5 }, { theta: 0.3, phi: 1.2, distancia: DISTANCIA_INICIAL }]) {
    const plan = planificarRecuperacion(actual, DISTANCIA_INICIAL);
    const tr = new TransicionCamara(); tr.iniciar(actual, plan.destino);
    const { poses } = correr(tr, 0, 16);
    CERCA(poses[0].pose, actual);                                                                        // primer fotograma: la pose actual, sin salto
    CERCA(poses[poses.length - 1].pose, plan.destino, 1e-9);                                             // y termina exactamente en el destino
    for (const p of poses) assert.ok(p.pose.phi >= PHI_MIN - 1e-12 && p.pose.phi <= PHI_MAX + 1e-12);   // φ nunca sale de (0, π): no cruza un polo
    for (let i = 1; i < poses.length; i++) assert.ok(Math.abs(poses[i].pose.theta - poses[i - 1].pose.theta) < Math.PI / 4);   // el azimut no da saltos (el destino conserva θ: no gira)
    const d = poses.map((p) => p.pose.distancia);
    for (let i = 1; i < d.length; i++) assert.ok((d[i] - d[i - 1]) * Math.sign(DISTANCIA_INICIAL - actual.distancia) >= -1e-12);   // zoom monótono hacia la predeterminada
  }
  // desde un transcurso a medias de OTRA transición (selección): la recuperación nace de la pose intermedia, no del destino de la selección ni del origen
  const sel = new TransicionCamara(); sel.iniciar(POSE_A, POSE_B);
  const intermedia = correr(sel, 0, 16, 10).poses.at(-1)!.pose; sel.cancelar();
  const rec = new TransicionCamara(); rec.iniciar(intermedia, planificarRecuperacion(intermedia, DISTANCIA_INICIAL).destino);
  CERCA(rec.avanzar(9999)!.pose, intermedia);
});

test('ajuste 1: formato de la magnitud — «M 4.8», «M 5», «M 0», «M ND»; coherente con filasFicha y con la etiqueta del globo; la profundidad lleva «km»', () => {
  assert.equal(textoMagnitud(4.8), 'M 4.8'); assert.equal(textoMagnitud(5), 'M 5'); assert.equal(textoMagnitud(0), 'M 0'); assert.equal(textoMagnitud(-0.3), 'M -0.3');
  for (const nd of [null, undefined, NaN, Infinity, '5', {}]) assert.equal(textoMagnitud(nd), 'M ND');     // el nulo no es 0 ni se inventa un valor
  const f = filasFicha({ place: 'Lugar', mag: 4.8, magType: 'mb', time: 0, updated: 0, country_name: 'X' }, 12, 'id1');
  assert.equal(f.magnitud, 'M 4.8'); assert.equal(f.insignia, 'Magnitud 4.8');                            // la insignia (popup 2D y lectores de pantalla) NO cambia
  assert.equal(filasFicha({ place: 'x', mag: 5 }, 1, 'a').magnitud, 'M 5');
  assert.equal(filasFicha({ place: 'x', mag: null }, null, 'a').magnitud, 'M ND'); assert.equal(filasFicha({ place: 'x' }, null, 'a').magnitud, 'M ND');
  assert.ok(textoTooltip('Lima', 4.8).endsWith(textoMagnitud(4.8))); assert.ok(textoTooltip('Lima', null).endsWith(textoMagnitud(null)));   // misma forma que «lugar · M x»
  assert.ok(!f.filas.some((x) => x.etiqueta === 'Profundidad' && x.valor.startsWith('M ')));
  assert.equal(f.filas.find((x) => x.etiqueta === 'Profundidad')?.valor, '12 km');                         // la profundidad se distingue por la etiqueta y por «km»
  assert.equal(f.filas.find((x) => x.etiqueta === 'Tipo de magnitud')?.valor, 'mb');                      // el resto de datos de la ficha siguen ahí
  assert.deepEqual(f.filas.map((x) => x.etiqueta), ['Tipo de magnitud', 'Profundidad', 'Fecha UTC', 'Actualizado UTC', 'País', 'ID']);
});

// CAMBIO (rediseño dashboard): la ficha con la magnitud grande ya no está en el globo sino en el panel app-detalle-evento (sus clases pasan de .ficha-* a .det-*; el valor sigue siendo textoMagnitud
// vía filasFicha). Se mantienen TODAS las comprobaciones (orden REPRODUCCIÓN → cabecera → filas, aria-hidden + texto completo para lectores, sin HTML, lugar sin desbordar, nada que recorte, contraste AA),
// ahora sobre el nuevo componente; la insignia del popup 2D (.ficha-magnitud global) sigue como estaba. Más pruebas del panel en tests/dashboard.test.ts.
test('ajuste 1: el panel de detalle muestra la magnitud grande junto al lugar, con contraste AA, sin HTML y con el texto completo para lectores', () => {
  const c = leer('detalle-evento/detalle-evento.component.ts');
  const ficha = /<div class="ficha-det">([\s\S]*?)<div class="acciones">/.exec(c)?.[1] ?? '';
  assert.match(ficha, /\{\{ f\.magnitud \}\}/); assert.match(ficha, /\{\{ f\.insignia \}\}/); assert.match(ficha, /\{\{ f\.lugar \}\}/);
  assert.ok(ficha.indexOf('class="det-replay"') < ficha.indexOf('class="det-cabecera"'));                // REPRODUCCIÓN sigue primero
  assert.ok(ficha.indexOf('class="det-cabecera"') < ficha.indexOf('class="det-filas"'));                  // la cabecera (magnitud + lugar) va antes de las filas
  assert.match(ficha, /<span class="det-mag-valor" aria-hidden="true">/); assert.match(ficha, /<span class="solo-lectores">\{\{ f\.insignia \}\}<\/span>/);
  assert.doesNotMatch(c, /innerHTML|\[innerHtml\]/);
  assert.match(c, /\.det-mag-valor \{[^}]*font-size: var\(--t-xl\)[^}]*color: var\(--acento-texto\)[^}]*font-variant-numeric: tabular-nums/);
  assert.match(c, /\.det-lugar \{[^}]*min-width: 0/);                                                    // el lugar largo no desborda
  assert.doesNotMatch(c.slice(c.indexOf('.det-cabecera {'), c.indexOf('.acciones {')), /overflow:\s*hidden|(?:^|[\s;{])(?:max-)?height:/m);   // nada que lo recorte
  const css = estilos(); const t = (n: string) => new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1] ?? '';
  assert.ok(razonContraste(t('acento-texto'), t('superficie-1')) >= 4.5, 'M 4.8 sobre el panel (superficie-1)');   // el panel usa --superficie-1 (antes la tarjeta usaba --superficie-2)
  assert.ok(razonContraste(t('acento-texto'), t('superficie-2')) >= 4.5, 'y sobre superficie-2');
  assert.ok(razonContraste(t('texto-2'), t('superficie-1')) >= 4.5, 'etiquetas del panel');
  assert.match(css, /\.ficha-magnitud \{ display: inline-block;/);                                       // la insignia pequeña del popup del mapa 2D sigue como estaba
});

test('rotación: reanudarYa — borra el retardo de 3 s (con rampa desde 0), respeta la pausa manual y el movimiento reducido y no levanta otros bloqueos', () => {
  const R = RETARDO_REANUDAR_MS;
  const m = new MaquinaRotacion();
  simular(m, 0, 2000, 16);
  m.interactuar(2000);                                                                                   // p. ej. el inicio de la recuperación
  assert.equal(m.esperaMs(2000), R);
  assert.equal(m.reanudarYa(), true);                                                                    // al COMPLETARSE la recuperación: sin esperar los 3 s
  assert.equal(m.esperaMs(2800), 0); assert.ok(m.puedeGirar(2800));
  assert.equal(m.avanzar(2800), 0); assert.ok(m.girando);                                                // primer fotograma: referencia nueva, sin salto
  const a = m.avanzar(2816); assert.ok(a > 0 && a < VELOCIDAD_RAD_S * 0.001);                           // la rampa vuelve a empezar desde 0 (arranque suave)
  // pausa manual: se respeta (ni reanuda ni cambia nada)
  const p = new MaquinaRotacion(); simular(p, 0, 1000, 16); p.alternar(); p.interactuar(1000);
  assert.equal(p.reanudarYa(), false); assert.ok(!p.puedeGirar(10_000_000)); assert.equal(p.esperaMs(1_000_000), null); assert.ok(!p.estaActiva);
  // movimiento reducido: no arranca; tampoco si se activó en caliente
  const r = new MaquinaRotacion(true); assert.equal(r.reanudarYa(), false); assert.equal(simular(r, 0, 10_000, 16), 0);
  const e = new MaquinaRotacion(); e.fijarMovimientoReducido(true); assert.equal(e.reanudarYa(), false); assert.ok(!e.puedeGirar(1e9));
  const manual = new MaquinaRotacion(true); manual.alternar(); manual.interactuar(0);                    // reducido, pero la persona la encendió a mano: rige el retardo normal
  assert.equal(manual.reanudarYa(), false); assert.ok(!manual.puedeGirar(R - 1)); assert.ok(manual.puedeGirar(R));
  const ya = new MaquinaRotacion(true); ya.fijarMovimientoReducido(false);                                // si la preferencia se desactiva en caliente, vuelve a valer la regla normal
  assert.equal(ya.reanudarYa(), false);                                                                  // …pero la máquina sigue apagada (activa = false): se enciende con el botón
  // no levanta bloqueos: con selección o con el puntero abajo sigue sin girar
  const s = new MaquinaRotacion(); s.fijarSeleccion(true, 0); assert.equal(s.reanudarYa(), true); assert.ok(!s.puedeGirar(1e9)); assert.equal(s.esperaMs(1e9), null);
  const d = new MaquinaRotacion(); d.fijarPuntero(true, 0); d.reanudarYa(); assert.ok(!d.puedeGirar(1e9));
  const v = new MaquinaRotacion(); v.fijarEntorno(false, true, true); v.reanudarYa(); assert.ok(!v.puedeGirar(1e9));
});

test('rotación: si el usuario interactúa durante la recuperación se cancela la reanudación inmediata y rige el retardo normal de 3 s', () => {
  const R = RETARDO_REANUDAR_MS;
  const m = new MaquinaRotacion();
  simular(m, 0, 2000, 16);
  m.interactuar(2000);                                                                                   // inicio de la recuperación (800 ms)
  m.fijarPuntero(true, 2300); m.fijarPuntero(false, 2600);                                               // la persona toca el globo a mitad: escena.ts cancela la transición y NO llama a reanudarYa
  assert.equal(m.esperaMs(2600), R); assert.ok(!m.puedeGirar(2600 + R - 1)); assert.ok(m.puedeGirar(2600 + R));
  // mientras la recuperación está en curso no gira (el retardo cuenta desde interactuar)
  const n = new MaquinaRotacion(); simular(n, 0, 2000, 16); n.interactuar(2000);
  assert.equal(simular(n, 2016, 2800, 16), 0);
});

test('ajuste 2: clic fuera — el listener está en el CANVAS, solo actúa con selección dibujada, reutiliza esClic y cierra por el mismo camino que «Cerrar»', () => {
  const e = leer('globo/escena.ts'); const c = leer('globo/globo.component.ts'); const app = leer('app.component.ts'); const html = leer('app.component.html');
  assert.match(e, /canvas\.addEventListener\('pointerup', this\.alSubir\)/); assert.doesNotMatch(e, /contenedor\.addEventListener\('(click|pointerup|pointerdown)'/);   // ni en el contenedor
  assert.doesNotMatch(e, /document\.addEventListener\('(click|pointerup|pointerdown)'|window\.addEventListener\('(click|pointerup|pointerdown)'/);   // ni global: no capta controles, tarjeta, ayuda ni panel
  const subir = /private readonly alSubir = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '';
  assert.match(subir, /ev\.type === 'pointerup' && a !== null && !this\.multitoque && this\.punteros\.size === 0 && esClic\(ev\.clientX - a\.x, ev\.clientY - a\.y\)/);   // clic (≤ 6 px), no arrastre ni pellizco
  assert.equal(UMBRAL_CLIC_PX, 6);
  const bajar = /private readonly alBajar = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '';
  assert.match(bajar, /if \(this\.punteros\.size > 1\) \{ this\.multitoque = true; this\.abajo = null; return; \}/);   // gestos multitáctiles: nunca clic
  assert.match(bajar, /ev\.button === 0 \? \{ x: ev\.clientX, y: ev\.clientY \} : null/);                                // solo botón principal
  const sel = /private seleccionarEn\(clientX: number, clientY: number\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '';
  assert.match(sel, /if \(sel !== null\) \{ this\.opciones\.alSeleccionar\(sel\.id\); return; \}/);                       // sobre un evento: selecciona (con su centrado)
  assert.match(sel, /if \(this\.haloSel\.visible\) \{ this\.recuperarVista\(\); this\.opciones\.alDeseleccionar\(\); \}/);  // SOLO con selección dibujada; sin ella, nada
  assert.equal((sel.match(/alDeseleccionar\(\)/g) ?? []).length, 1);
  assert.match(e, /alDeseleccionar\(\): void;/);
  assert.match(c, /alDeseleccionar: \(\) => this\.zona\.run\(\(\) => this\.cerrar\.emit\(\)\)/);                          // la MISMA salida `cerrar` que el botón
  assert.match(html, /\(cerrar\)="elegir\(null, 'mapa'\)"/);                                                               // …que app resuelve con elegir(null, 'mapa')
  assert.match(app, /elegir\(id: string \| null, origen: 'mapa' \| 'tabla'\): void \{/);
  // vacío = buscarBajo null: sin evento cerca (seleccionarPorProximidad) o rayo que no corta la esfera (seleccionarPorRayo → null); comprobado con funciones puras
  const nada = puntos(ev('a', 0, 0));
  assert.equal(seleccionarPorRayo(nada, [0, 0, 3], [0, 3, -1], { alturaPx: 600, fovGrados: 40 }), null);                  // el rayo no corta la esfera: espacio negro
  assert.equal(seleccionarPorRayo(nada, [0, 0, 3], [0.2, 0, -1], { alturaPx: 600, fovGrados: 40 })?.id ?? null, null);   // esfera sin evento cerca
  // el tooltip y las pistas no interceptan el puntero (el clic llega al canvas)
  assert.match(c, /\.etiqueta \{[^}]*pointer-events: none/); assert.match(c, /\.pistas \{[^}]*pointer-events: none/);
});

test('ajuste 3/4: Restablecer, Cerrar y clic fuera usan LA MISMA función (recuperarVista) y ningún camino alternativo duplica la recuperación', () => {
  const e = leer('globo/escena.ts'); const c = leer('globo/globo.component.ts');
  // puntos de entrada: componente (Cerrar y Restablecer), clic fuera (escena) y cierre por otros caminos (fijarSeleccion(null)); TODOS llaman a recuperarVista
  assert.match(/restablecer\(\): void \{[\s\S]*?\n  \}/.exec(c)?.[0] ?? '', /this\.escena\?\.recuperarVista\(\)/);
  // CAMBIO (rediseño dashboard): «Cerrar» vive ahora en el panel externo y ya no llama a recuperarVista desde el componente del globo: pone seleccionado = null y la recuperación la hace escena.fijarSeleccion(null)
  // UNA sola vez (idCentrado !== null). Por eso hay UNA llamada en el componente (restablecer) en lugar de dos, y se comprueba que el globo reacciona al cambio de selección.
  assert.doesNotMatch(c, /cerrarFicha/);
  assert.match(c, /effect\(\(\) => \{ const id = this\.seleccionado\(\); untracked\(\(\) => this\.fuera\(\(\) => this\.escena\?\.fijarSeleccion\(id\)\)\); \}\);/);
  assert.match(c, /case 'Home': this\.restablecer\(\)/); assert.match(c, /\(click\)="restablecer\(\)"/);
  assert.equal((c.match(/\.recuperarVista\(\)/g) ?? []).length, 1);                                                          // solo restablecer()
  assert.equal((e.match(/this\.recuperarVista\(\)/g) ?? []).length, 2);                                                       // seleccionarEn (clic fuera) y fijarSeleccion(null)
  assert.equal((e.match(/planificarRecuperacion\(/g) ?? []).length, 1);                                                       // una única planificación…
  assert.equal((e.match(/iniciarTransicion\(plan\.destino, 'recuperar'\)/g) ?? []).length, 1);                                // …y una única transición de ese tipo
  assert.doesNotMatch(c, /escena\?\.zoom\(0\)|zoom\(0\)/); assert.doesNotMatch(e, /sentido === 0/);                          // Restablecer ya no usa el camino antiguo (colocarCamara a la vista inicial)
  const colocar = e.match(/this\.colocarCamara\(/g) ?? []; assert.equal(colocar.length, 1);                                   // la única llamada `this.colocarCamara(`, en iniciar() (la definición no lleva `this.`)
  // anti-bucle: recuperarVista pone la bandera ANTES de nada y fijarSeleccion(null) solo recupera si la bandera sigue puesta
  const rec = /recuperarVista\(\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '';
  assert.match(rec, /this\.idCentrado = null; this\.zoomSel = ZOOM_SIN_SESION;/);
  assert.ok(rec.indexOf('this.idCentrado = null') < rec.indexOf('this.iniciarTransicion('));
  assert.match(/fijarSeleccion\(id: string \| null, centrar = true\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /if \(this\.idCentrado !== null\) this\.recuperarVista\(\);/);
  assert.match(c, /restablecer\(\): void \{\s*this\.fuera\(\(\) => this\.escena\?\.recuperarVista\(\)\);\s*if \(this\.seleccionado\(\) !== null\) this\.cerrar\.emit\(\);/);   // sin selección: recupera igual y no emite
  // up normalizado, plan único de camara.ts, destino por la transición única, sin competir con OrbitControls
  assert.match(rec, /this\.camara\.up\.set\(\.\.\.UP_VERTICAL\)/); assert.match(rec, /planificarRecuperacion\(this\.poseActual\(\), DISTANCIA_INICIAL\)/);
  assert.match(rec, /this\.iniciarTransicion\(plan\.destino, 'recuperar'\)/);
  assert.ok(rec.indexOf('this.drenarInercia()') < rec.indexOf('this.poseActual()'));                                           // la pose «actual» se lee tras drenar la inercia
  const drenar = /private drenarInercia\(\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '';
  assert.match(drenar, /this\.controles\.enableDamping = false;\s*this\.controles\.update\(\);\s*this\.controles\.enableDamping = damping;/);
  assert.match(drenar, /this\.camara\.position\.copy\(this\.posicionGuardada\)/); assert.doesNotMatch(drenar, /\.reset\(|saveState|dispose|new /);    // sin reset global de OrbitControls
  // la rotación se reanuda al COMPLETAR (no al empezar) y solo desde la ruta de fin de transición o desde el cierre directo (reducido/oculta/ya en la pose)
  assert.equal((e.match(/this\.rotacion\.reanudarYa\(\)/g) ?? []).length, 1);
  assert.match(/private terminarRecuperacion\(\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /this\.rotacion\.reanudarYa\(\);\s*this\.pedirFotograma\(\);/);
  assert.match(rec, /if \(!this\.transicion\.activa\) this\.terminarRecuperacion\(\);/);
  assert.match(/private alTerminarTransicion\(\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /if \(tipo === 'recuperar'\) this\.terminarRecuperacion\(\);/);
  assert.equal((e.match(/this\.terminarRecuperacion\(\)/g) ?? []).length, 2);                                                // fin animado + cierre directo; nunca al empezar una animación
  // cancelar (interacción manual) no pasa por alTerminarTransicion: no hay reanudación inmediata
  assert.doesNotMatch(/private cancelarTransicion\(\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /reanudarYa|terminarRecuperacion/);
  // sin HTML dinámico y un único rAF con guarda (se mantiene tras el cambio)
  assert.doesNotMatch(e, /innerHTML|outerHTML|insertAdjacentHTML/); assert.doesNotMatch(c, /innerHTML|outerHTML|insertAdjacentHTML|bypassSecurityTrust/);
  assert.equal((e.match(/requestAnimationFrame\(/g) ?? []).length, 1);
  assert.match(e, /private encolar\(\): void \{\s*if \(this\.enPausa \|\| this\.rafId !== 0\) return;\s*this\.rafId = requestAnimationFrame\(this\.fotograma\)/);
});

test('ajuste 3/4: el panel lateral no produce salto al cerrar — el desplazamiento baja animado (misma duración y easing), directo con movimiento reducido, al abrir o al redimensionar', () => {
  const e = leer('globo/escena.ts');
  const reserva = /private aplicarReserva\(forzar: boolean\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '';
  assert.match(reserva, /if \(!forzar && px === this\.metaDesplazamiento\) return;/);
  assert.match(reserva, /if \(!forzar && px < this\.desplazamiento && !\(this\.mqMovimiento\?\.matches \?\? false\) && !this\.enPausa\)/);   // solo al cerrar (baja), nunca al abrir
  assert.match(e, /private fijarDesplazamiento\(px: number\): void \{[\s\S]*?this\.camara\.setViewOffset\(this\.ancho, this\.alto, px, 0, this\.ancho, this\.alto\)[\s\S]*?this\.camara\.clearViewOffset\(\)/);
  const av = /private avanzarDesplazamiento\(t: number\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '';
  assert.match(av, /DURACION_TRANSICION_MS/); assert.match(av, /suavizar\(p\)/); assert.match(av, /if \(a\.t0 === null\) a\.t0 = t;/);   // el primer fotograma no se mueve
  assert.match(av, /p >= 1 \? a\.hasta : /);                                                                                // termina exactamente en la meta
  const fot = /private readonly fotograma = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '';
  assert.match(fot, /this\.avanzarDesplazamiento\(t\);/); assert.equal((fot.match(/this\.encolar\(\)/g) ?? []).length, 5);   // sin ramas nuevas: el bucle sigue siendo el mismo
  // el desplazamiento nunca inclina la cámara: setViewOffset solo desplaza el encuadre
  assert.doesNotMatch(e, /camara\.rotation\.|camara\.rotateZ|camara\.quaternion\.set|\.roll\b/);
});

test('ajuste 3/4: camara.ts documenta qué significa «enderezar» (cabecera y regla) y sigue siendo puro (sin three, DOM ni imports en ejecución)', () => {
  const t = leer('globo/camara.ts');
  assert.match(t, /Recuperación de la vista \(Restablecer, Cerrar ficha, clic en vacío\)/); assert.match(t, /Qué significa «enderezar»/);
  assert.match(t, /export function planificarRecuperacion\(/); assert.doesNotMatch(t, /planificarRestauracion/);
  assert.doesNotMatch(t, /document\.|window\.|from 'three|fetch\(|localStorage|sessionStorage|indexedDB/); assert.doesNotMatch(t, /^import (?!type)/m);
  assert.match(leer('globo/rotacion.ts'), /reanudarYa\(\): boolean \{/); assert.doesNotMatch(leer('globo/rotacion.ts'), /^import /m);
});

// ---------- regiones ----------
test('regiones: al menos Pacífico, Japón, Mediterráneo y Andes (máx. 6), ids únicos, lat/lon en rango, distancia dentro de los límites y cerca de su zona', () => {
  assert.ok(REGIONES.length >= 4 && REGIONES.length <= 6);
  for (const nombre of ['Pacífico', 'Japón', 'Mediterráneo', 'Andes']) assert.ok(REGIONES.some((r) => r.nombre === nombre), nombre);
  assert.equal(new Set(REGIONES.map((r) => r.id)).size, REGIONES.length);
  for (const r of REGIONES) {
    assert.match(r.id, /^[a-z]+$/); assert.ok(r.nombre.length > 0);
    assert.ok(r.lat >= -90 && r.lat <= 90 && r.lon >= -180 && r.lon <= 180, r.id);
    assert.ok(r.distancia >= DISTANCIA_MIN && r.distancia <= DISTANCIA_MAX, `${r.id}: ${r.distancia}`);
    const p = poseDeLatLon(r.lat, r.lon, r.distancia); assert.ok(p.phi >= PHI_MIN && p.phi <= PHI_MAX);
    assert.equal(regionPorId(r.id), r);
  }
  const caja = (id: string, lat: [number, number], lon: [number, number]) => { const r = regionPorId(id)!; assert.ok(r.lat >= lat[0] && r.lat <= lat[1] && r.lon >= lon[0] && r.lon <= lon[1], id); };
  caja('japon', [30, 46], [128, 146]); caja('mediterraneo', [30, 45], [0, 36]); caja('andes', [-56, 10], [-82, -60]); caja('indonesia', [-11, 6], [95, 141]); caja('norteamerica', [25, 60], [-135, -60]);
  assert.ok(Math.abs(regionPorId('pacifico')!.lon) > 150);                               // el Pacífico se centra cerca del antimeridiano
  assert.ok(regionPorId('pacifico')!.distancia > regionPorId('japon')!.distancia);       // la zona extensa se mira desde más lejos que la compacta
  assert.equal(regionPorId('no-existe'), null); assert.equal(regionPorId(''), null);
});

// ---------- pulsación ----------
test('pulsación: amplitud pequeña (≈ 12 % del radio), periodo lento (3–4 s), fase periódica y acotada, factor 0–1', () => {
  assert.ok(AMPLITUD_HALO > 0 && AMPLITUD_HALO <= 0.15); assert.ok(ALFA_HALO > 0 && ALFA_HALO <= 0.3);
  assert.ok(PERIODO_PULSO_S >= 3 && PERIODO_PULSO_S <= 4); assert.ok(INTERVALO_PULSO_MS >= 33 && INTERVALO_PULSO_MS <= 50);   // 20–30 fps
  assert.ok(ESCALA_QUAD * Math.cos(Math.PI / 32) > 1 + AMPLITUD_HALO);                   // el polígono de 32 lados no recorta el halo
  for (const t of [0, 1, 1234.5, 99_999]) {
    const f = faseGlobal(t); assert.ok(f >= 0 && f < 2 * Math.PI);
    cerca(faseGlobal(t + PERIODO_PULSO_S * 1000 * 7), f, 1e-6);                          // periódica: sin saltos ni deriva al cabo de muchos periodos
  }
  cerca(faseGlobal(PERIODO_PULSO_S * 500), Math.PI, 1e-9); assert.equal(faseGlobal(NaN), 0); assert.equal(faseGlobal(-1) >= 0, true);
  for (let i = 0; i < 200; i++) { const f = factorPulso(i * 0.37, (i * 0.618) % 1); assert.ok(f >= 0 && f <= 1); }
  cerca(factorPulso(Math.PI / 2, 0), 1, 1e-12); cerca(factorPulso(-Math.PI / 2, 0), 0, 1e-12);
});

test('pulsación: se desactiva con movimiento reducido o sin eventos que pulsen; el bucle de fotogramas solo se mantiene con vista activa', () => {
  assert.equal(amplitudPulso(false, 10), 1); assert.equal(amplitudPulso(true, 10), 0); assert.equal(amplitudPulso(false, 0), 0);
  const base = { movimientoReducido: false, nPulsantes: 3, enPausa: false, rotacionActiva: true };
  assert.equal(hayPulso(base), true);
  assert.equal(hayPulso({ ...base, movimientoReducido: true }), false);                  // prefers-reduced-motion: ni uniform ni bucle
  assert.equal(hayPulso({ ...base, nPulsantes: 0 }), false);                             // nada que pulse: el bucle se para en reposo
  assert.equal(hayPulso({ ...base, enPausa: true }), false);                             // vista 2D, pestaña oculta o fuera de pantalla
  // política documentada: «Pausar rotación» NO detiene la pulsación (es ambiental); el interruptor existe pero está apagado
  assert.equal(PULSO_SIGUE_PAUSA_ROTACION, false); assert.equal(hayPulso({ ...base, rotacionActiva: false }), true);
});

test('pulsación: solo pulsan los eventos de magnitud >= 5 (los primeros tras ordenar por radio); NaN y los menores no; sin trabajo por evento', () => {
  assert.equal(UMBRAL_MAG_PULSO, 5);
  const o = ordenarPorCapas(puntos(ev('a', 0, 0, 6.1), ev('b', 1, 1, 3), ev('c', 2, 2, 5), ev('d', 3, 3, null), ev('e', 4, 4, 4.9), ev('f', 5, 5, 7)));
  assert.deepEqual(o.ids.slice(0, 3), ['f', 'a', 'c']);                                  // mayor magnitud primero
  assert.equal(contarPulsantes(o.magnitudes, o.n), 3);                                   // f (7), a (6,1) y c (5): las primeras 3 instancias
  assert.equal(contarPulsantes(o.magnitudes, o.n, 6.5), 1); assert.equal(contarPulsantes(o.magnitudes, o.n, 99), 0);
  assert.equal(contarPulsantes(Float64Array.from([NaN, 6]), 2), 0);                      // un NaN al principio corta la cuenta (nunca cuenta mal las siguientes)
  assert.equal(contarPulsantes(puntos().magnitudes, 0), 0);
  const { puntos: grandes } = prepararPuntos(generarEventosSinteticos(50_000, 5), COD);
  const orden = ordenarPorCapas(grandes); const t0 = performance.now(); const k = contarPulsantes(orden.magnitudes, orden.n); const ms = performance.now() - t0;
  assert.ok(ms < 50, `contar pulsantes en 50 000 eventos: ${ms.toFixed(2)} ms`);        // O(n) una vez por cambio de datos
  for (let i = 0; i < orden.n; i++) assert.equal(orden.magnitudes[i] >= UMBRAL_MAG_PULSO, i < k, `instancia ${i}`);   // contiguos al principio: basta comparar el índice en el shader
});

test('pulsación: el contraste del borde (WCAG 1.4.11) se mantiene con el halo al MÁXIMO (y con dos halos superpuestos) sobre océano, continente y fondo', () => {
  const p = resolverPaleta(() => '');
  assert.equal(mezclarSrgb('#000000', '#ffffff', 0.5), '#808080'); assert.equal(mezclarSrgb('#102030', '#ffffff', 0), '#102030');
  cerca(alfaAcumulada(1), ALFA_HALO, 1e-12); cerca(alfaAcumulada(2), 1 - (1 - ALFA_HALO) ** 2, 1e-12);
  for (const [nombre, superficie] of [['océano', p.esfera], ['continente', p.continente], ['fondo', p.fondo]] as const) {
    for (const k of [0, 1, 2]) {                                                         // 0 = valor mínimo de la pulsación (sin halo), 1 = pico, 2 = dos vecinos en pico
      const alrededor = mezclarSrgb(superficie, p.borde, k === 0 ? 0 : alfaAcumulada(k));
      const r = razonContraste(p.borde, alrededor);
      assert.ok(r >= 3, `borde sobre ${nombre} con ${k} halo(s): ${r.toFixed(2)}`);
    }
  }
  // el relleno y el borde del disco NO se modulan: el shader solo toca el exterior (r > 1) y el color/radio vienen de colorProfundidad/radioMagnitud
  const e = leer('globo/escena.ts');
  assert.match(e, /float disco = 1\.0 - smoothstep\(1\.0 - aa, 1\.0, r\);/); assert.match(e, /smoothstep\(1\.0, 1\.0 \+ max\(/);
});

// ---------- etiqueta del hover ----------
test('tooltip: texto «lugar · M magnitud», «ND» si falta alguno y nunca HTML', () => {
  assert.equal(textoTooltip('43 km S of Puerto San José, Guatemala', 5.6), '43 km S of Puerto San José, Guatemala · M 5.6');
  assert.equal(textoTooltip('Tokio', 4), 'Tokio · M 4'); assert.equal(textoTooltip('  Lima ', 6.25), 'Lima · M 6.25');
  assert.equal(textoTooltip(null, 5.6), 'ND · M 5.6'); assert.equal(textoTooltip('', 5.6), 'ND · M 5.6'); assert.equal(textoTooltip(undefined, 1), 'ND · M 1'); assert.equal(textoTooltip(42, 1), 'ND · M 1');
  assert.equal(textoTooltip('Lima', null), 'Lima · M ND'); assert.equal(textoTooltip('Lima', NaN), 'Lima · M ND'); assert.equal(textoTooltip('Lima', '5'), 'Lima · M ND');
  assert.equal(textoTooltip(null, undefined), 'ND · M ND');
  assert.equal(textoTooltip('<img src=x onerror=1>', 3), '<img src=x onerror=1> · M 3');   // se devuelve tal cual: se asigna con textContent, que no interpreta HTML
});

test('tooltip: solo con ratón fino, sin arrastre, zoom ni transición, dentro del lienzo y con la vista activa (táctil y lápiz no hacen ningún trabajo)', () => {
  const ok: ContextoTooltip = { tipoPuntero: 'mouse', hoverFino: true, punteroAbajo: false, transicionActiva: false, zoomEnCurso: false, dentro: true, enPausa: false };
  assert.equal(tooltipPermitido(ok), true);
  for (const tipo of ['touch', 'pen', '']) assert.equal(tooltipPermitido({ ...ok, tipoPuntero: tipo }), false, tipo);
  for (const campo of ['punteroAbajo', 'transicionActiva', 'zoomEnCurso', 'enPausa'] as const) assert.equal(tooltipPermitido({ ...ok, [campo]: true }), false, campo);
  assert.equal(tooltipPermitido({ ...ok, hoverFino: false }), false); assert.equal(tooltipPermitido({ ...ok, dentro: false }), false);
});

test('tooltip: throttle (leading + trailing) — como mucho un cálculo cada 60 ms aunque lleguen 250 movimientos por segundo', () => {
  assert.equal(INTERVALO_TOOLTIP_MS, 60);
  assert.equal(esperaTooltipMs(0, -Infinity), 0); assert.equal(esperaTooltipMs(100, 90), 50); assert.equal(esperaTooltipMs(150, 90), 0); assert.equal(esperaTooltipMs(500, 90), 0);
  let ultimo = -Infinity; let calculos = 0; let previo = -Infinity;
  for (let t = 0; t <= 4000; t += 4) {                                                   // 250 pointermove/s durante 4 s
    if (esperaTooltipMs(t, ultimo) === 0) { calculos++; assert.ok(t - previo >= INTERVALO_TOOLTIP_MS); previo = t; ultimo = t; }
  }
  assert.ok(calculos <= Math.ceil(4000 / INTERVALO_TOOLTIP_MS) + 1 && calculos >= 40, `cálculos: ${calculos}`);   // ≈ 16 por segundo, no 250
});

test('tooltip: se reutiliza la selección por proximidad — mismo umbral que el clic y NUNCA un evento de la cara oculta', () => {
  const vista = { alturaPx: 600, fovGrados: 40 };
  const p = puntos(ev('delante', 0, 0, 5.6), ev('atras', 180, 0, 8));
  assert.equal(seleccionarPorRayo(p, CAMARA, [0, 0, -1], vista)?.id, 'delante');         // el rayo central encuentra el evento visible…
  assert.equal(seleccionarPorRayo(puntos(ev('atras', 180, 0, 8)), CAMARA, [0, 0, -1], vista), null);   // …y el de la cara oculta no sale jamás (ni en clic ni en hover)
  const e = leer('globo/escena.ts');
  assert.equal((e.match(/seleccionarPorRayo\(/g) ?? []).length, 1);                      // UNA sola búsqueda en la escena: la comparten clic y etiqueta
  const buscar = /private buscarBajo\([\s\S]*?\n  \}/.exec(e)?.[0] ?? '';
  assert.match(buscar, /seleccionarPorRayo\(candidatos/);                                 // CAMBIO (4.ª iteración): candidatos = indicePick ?? indice (con rango de leyenda, sin los atenuados)
  assert.match(buscar, /this\.indicePick \?\? this\.indice/);
  assert.match(/private seleccionarEn\([\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /this\.buscarBajo\(clientX, clientY\)/);
  assert.match(/private calcularTooltip\(\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /this\.buscarBajo\(p\.x, p\.y\)/);
});

test('tooltip: posición junto al cursor, volteada si no cabe y siempre dentro del escenario', () => {
  const sep = SEPARACION_TOOLTIP_PX;
  assert.deepEqual(posicionarTooltip(100, 100, 800, 600, 150, 30), { x: 100 + sep, y: 100 + sep });     // a la derecha y debajo
  assert.deepEqual(posicionarTooltip(750, 100, 800, 600, 150, 30), { x: 750 - sep - 150, y: 100 + sep });  // no cabe a la derecha: a la izquierda
  assert.deepEqual(posicionarTooltip(100, 590, 800, 600, 150, 30), { x: 100 + sep, y: 590 - sep - 30 });   // no cabe debajo: encima
  for (const [cx, cy] of [[0, 0], [800, 600], [799, 1], [1, 599], [400, 300]] as const) {
    const p = posicionarTooltip(cx, cy, 800, 600, 150, 30);
    assert.ok(p.x >= 0 && p.x + 150 <= 800 && p.y >= 0 && p.y + 30 <= 600, `${cx},${cy} → ${p.x},${p.y}`);
  }
  assert.deepEqual(posicionarTooltip(50, 50, 100, 40, 300, 80), { x: 0, y: 0 });         // más grande que el escenario: pegada a la esquina, sin valores negativos
});

// ---------- lectura de código: bucle único, pulsación en el shader, interrupciones, tooltip y selector de región ----------
test('escena (3.ª iteración): un único bucle coordina transición > rotación > pulsación > reposo, sin reinicios ni bucles nuevos', () => {
  const e = leer('globo/escena.ts');
  const fot = /private readonly fotograma = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '';
  assert.equal((e.match(/requestAnimationFrame\(/g) ?? []).length, 1);
  assert.equal((e.match(/new TransicionCamara\(/g) ?? []).length, 1);                    // una sola transición viva
  const iT = fot.indexOf('this.transicion.avanzar(t)'); const iR = fot.indexOf('this.rotacion.avanzar(t)');
  assert.ok(iT >= 0 && iR > iT);                                                         // la transición se resuelve ANTES que la rotación…
  // CAMBIO (F7, ajuste 3/4): al terminar la transición se llama a alTerminarTransicion() (que pone tipoTransicion a null y, si era una recuperación, reanuda la rotación); antes se ponía a null directamente
  assert.match(fot, /if \(paso !== null\) \{ this\.aplicarPose\(paso\.pose\); if \(paso\.fin\) this\.alTerminarTransicion\(\); \}\s*else \{ giro = this\.rotacion\.avanzar\(t\);/);   // …y la excluye en ese fotograma
  const ramas = ['if (this.transicion.activa)', 'else if (movimiento', 'else if (this.rotacion.girando)', 'else if (pulsa || ondas)', 'else this.programarReanudacion()'].map((s) => fot.indexOf(s));   // CAMBIO (4.ª iteración): la rama de pulsación también mantiene el bucle mientras vivan anillos de eventos nuevos; sigue habiendo 5 encolar()
  assert.ok(ramas.every((i) => i >= 0) && ramas.every((i, k) => k === 0 || i > ramas[k - 1]), `orden de ramas: ${ramas}`);
  assert.match(fot, /t - this\.tRender < \(this\.rotacion\.girando \? INTERVALO_ROTACION_MS : INTERVALO_PULSO_MS\)/);   // 30 fps girando, 25 fps solo pulsando
  assert.match(e, /private get pulsoActivo\(\): boolean \{\s*return hayPulso\(\{ movimientoReducido: this\.mqMovimiento\?\.matches \?\? false, nPulsantes: this\.nPulso, enPausa: this\.enPausa, rotacionActiva: this\.rotacion\.estaActiva \}\);/);
  assert.doesNotMatch(fot, /setInterval|setTimeout|requestAnimationFrame|getBoundingClientRect|buscarBajo/);   // el fotograma no abre bucles ni lee layout
  assert.match(e, /this\.aplicarMovimiento\(\);\s*this\.mqMovimiento\.addEventListener/);                        // la preferencia se lee al inicio y al cambiar
  assert.match(/private readonly aplicarMovimiento = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '', /this\.pedirFotograma\(\);/);
});

test('escena (3.ª iteración): cualquier interacción manual cancela la transición; reducido/oculta → cambio directo; el mismo evento no repite; destruir y ocultar la cancelan', () => {
  const e = leer('globo/escena.ts');
  const bloque = (patron: RegExp) => patron.exec(e)?.[0] ?? '';
  for (const [nombre, patron] of [['pointerdown', /private readonly alBajar = [\s\S]*?\n  \};/], ['rueda con Ctrl', /private readonly alRueda = [\s\S]*?\n  \};/],
    ['zoom', /zoom\(sentido: 1 \| -1\): void \{[\s\S]*?\n  \}/], ['teclado', /girar\(dx: -1 \| 0 \| 1, dy: -1 \| 0 \| 1\): void \{[\s\S]*?\n  \}/],
    ['ocultar vista', /pausar\(\): void \{[^\n]*\}/], ['destruir', /destruir\(\): void \{[\s\S]*?\n  \}\n\}/]] as const) assert.match(bloque(patron), /this\.cancelarTransicion\(\)/, nombre);
  assert.match(bloque(/private cancelarTransicion\(\): void \{[\s\S]*?\n  \}/), /this\.transicion\.cancelar\(\);\s*this\.tipoTransicion = null;/);   // solo cancela: NO aplica ninguna pose (sin saltos)
  assert.match(bloque(/private iniciarTransicion\([\s\S]*?\n  \}/), /const desde = this\.poseActual\(\);\s*this\.cancelarTransicion\(\);\s*if \(esTransicionNula\(desde, hasta\)\) return;/);   // la nueva parte de la pose actual
  assert.match(bloque(/private iniciarTransicion\([\s\S]*?\n  \}/), /if \(this\.mqMovimiento\?\.matches \|\| this\.enPausa\) \{ this\.aplicarPose\(hasta\);/);   // movimiento reducido o vista oculta: directo
  assert.match(e, /if \(centrar && id !== this\.idCentrado\) \{ this\.idCentrado = id; this\.encuadrarSeleccion\(/);   // el mismo evento no repite; un refresco (centrar = false) no mueve la cámara
  // CAMBIO (F7, ajuste 3/4): al cerrar la selección ya no se «restaura el zoom previo» (restaurarZoom/planificarRestauracion desaparecen): se llama a recuperarVista(), que pone idCentrado a null
  assert.match(bloque(/fijarSeleccion\(id: string \| null, centrar = true\): void \{[\s\S]*?\n  \}/), /if \(this\.idCentrado !== null\) this\.recuperarVista\(\);/);
  assert.match(e, /planificarZoomSeleccion\(this\.zoomSel, actual\.distancia, this\.transicionDeSeleccion, DISTANCIA_MIN, DISTANCIA_MAX\)/);
  assert.doesNotMatch(e, /planificarRestauracion|restaurarZoom|'restaurar'/);
  assert.match(bloque(/irARegion\(id: string\): void \{[\s\S]*?\n  \}/), /this\.rotacion\.interactuar\(performance\.now\(\)\);\s*this\.iniciarTransicion\(poseDeLatLon\(r\.lat, r\.lon, r\.distancia\), 'region'\)/);   // región = interacción manual: retrasa 3 s la rotación
  assert.doesNotMatch(bloque(/irARegion\(id: string\): void \{[\s\S]*?\n  \}/), /alSeleccionar|seleccionar\(|zoomSel/);   // no toca la selección ni la memoria de zoom
  assert.doesNotMatch(e, /centrarEn\(/);                                                 // el salto antiguo (sin animación) desaparece: todo pasa por la transición
  assert.match(e, /camara\.setViewOffset\(/);                                            // el desplazamiento del panel lateral sigue intacto (la transición solo mueve la posición de la cámara)
});

test('escena (3.ª iteración): pulsación en el SHADER con UN uniform de tiempo; sin atributos nuevos, sin buffers por fotograma ni trabajo por evento en JS', () => {
  const e = leer('globo/escena.ts');
  const vertice = /const VERTICE_PUNTO = `([\s\S]*?)`;/.exec(e)?.[1] ?? '';
  assert.equal((e.match(/uniform float uFase;/g) ?? []).length, 1);                      // un único uniform de tiempo
  assert.equal((e.match(/uniforms\['uFase'\]\.value =/g) ?? []).length, 1);              // asignado una vez por fotograma
  assert.match(vertice, /sin\(uFase \+ 6\.2831853 \* hash\)/); assert.match(vertice, /fract\(sin\(float\(gl_InstanceID\) \* 12\.9898\) \* 43758\.5453\)/);   // fase por instancia: hash de su índice
  assert.match(vertice, /step\(float\(gl_InstanceID\) \+ 0\.5, uNPulso\)/);              // solo las primeras uNPulso instancias (mayor magnitud)
  assert.match(vertice, /\* \(1\.0 - vSel\)/);                                           // el seleccionado no pulsa
  assert.match(vertice, /uAmp \*/);                                                      // uAmp = 0 la apaga (movimiento reducido)
  const fot = /private readonly fotograma = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '';
  assert.doesNotMatch(fot, /for \(|forEach|\.map\(|setMatrixAt|setColorAt|needsUpdate|new /);   // ni bucles por evento, ni buffers, ni asignaciones de objetos por fotograma
  // CAMBIO (4.ª iteración): ya existen DOS InstancedBufferAttribute, pero ajenos a la pulsación: aRango (leyenda, solo al cambiar datos) y aInicio (anillos, solo al nacer uno). La pulsación sigue sin atributos propios.
  assert.doesNotMatch(e, /InstancedBufferGeometry|setAttribute\('(fase|pulso)|Math\.sin|setInterval/);
  assert.equal((e.match(/new InstancedBufferAttribute\(/g) ?? []).length, 2);
  assert.equal((e.match(/contarPulsantes\(/g) ?? []).length, 1);                         // una vez por cambio de datos (fijarEventos)
  assert.match(/fijarEventos\(puntos: PuntosGlobo\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /contarPulsantes\(orden\.magnitudes, orden\.n, UMBRAL_MAG_PULSO\)/);
  assert.equal((e.match(/new InstancedMesh\(geom, this\.matPunto, capacidad\)/g) ?? []).length, 1);   // CAMBIO: sigue habiendo un único InstancedMesh de MARCADORES (el otro es el pool de anillos)
  assert.match(e, /\$\{ESCALA_QUAD\.toFixed\(4\)\}/); assert.match(e, /\$\{AMPLITUD_HALO\.toFixed\(3\)\}/); assert.match(e, /\$\{ALFA_HALO\.toFixed\(3\)\}/);   // una sola fuente de las constantes (pulso.ts)
});

test('escena (3.ª iteración): etiqueta del hover — textContent (sin HTML), solo ratón, throttle con UN temporizador, sin render extra, cursor solo al cambiar de estado', () => {
  const e = leer('globo/escena.ts');
  assert.doesNotMatch(e, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.match(e, /t\.textContent = texto/);
  assert.match(e, /\(hover: hover\) and \(pointer: fine\)/);
  assert.match(/private readonly alMoverPuntero = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '', /tooltipPermitido\(this\.contextoTooltip\(ev\.pointerType\)\)/);
  assert.match(/private readonly alMoverPuntero = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '', /esperaTooltipMs\(performance\.now\(\), this\.ultimoCalculoTooltip, INTERVALO_TOOLTIP_MS\)/);
  assert.match(/private readonly alMoverPuntero = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '', /else if \(this\.idTemporizadorTooltip === 0\) this\.idTemporizadorTooltip = window\.setTimeout\(/);   // trailing: un solo temporizador pendiente
  const calc = /private calcularTooltip\(\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '';
  assert.doesNotMatch(calc, /renderer\.render|pedirFotograma|encolar|requestAnimationFrame/);   // la etiqueta no dibuja la escena
  assert.match(calc, /if \(!this\.hayHover\) \{ this\.hayHover = true; this\.canvas\.style\.cursor = 'pointer'; \}/);   // cursor: solo al entrar en un evento
  assert.match(/private ocultarTooltip\(\): void \{[\s\S]*?\n  \}/.exec(e)?.[0] ?? '', /if \(this\.hayHover\) \{ this\.hayHover = false; this\.canvas\.style\.cursor = ''; \}/);
  assert.match(e, /'pointermove', this\.alMoverPuntero/); assert.match(e, /'pointerleave', this\.alSalirPuntero/);
  assert.match(e, /removeEventListener\('pointermove', this\.alMoverPuntero\)/); assert.match(e, /removeEventListener\('pointerleave', this\.alSalirPuntero\)/);
  assert.match(/private readonly alBajar = [\s\S]*?\n  \};/.exec(e)?.[0] ?? '', /this\.ocultarTooltip\(\)/);   // se oculta al pulsar/arrastrar
});

test('componente (3.ª iteración): etiqueta con pointer-events: none y aria-hidden; «Ir a región» como <select> con nombre accesible dentro del grupo de controles; ayuda con 3 s', () => {
  const c = leer('globo/globo.component.ts');
  assert.match(c, /<div #etiqueta class="etiqueta" aria-hidden="true" hidden><\/div>/);
  assert.ok(c.indexOf('class="vista"') < c.indexOf('<div #etiqueta') && c.indexOf('<div #etiqueta') < c.indexOf('class="carga"'));   // CAMBIO (4.ª iteración): el mensaje «Cargando el globo 3D…» pasa a ser el indicador de fases (class="carga")   // dentro de .vista, junto al lienzo
  assert.match(c, /\.etiqueta \{[^}]*pointer-events: none[^}]*\}/); assert.match(c, /\.etiqueta \{[^}]*position: absolute; left: 0; top: 0/);
  assert.match(c, /\.etiqueta\[hidden\] \{ display: none; \}/);
  assert.doesNotMatch(c, /role="tooltip"|innerHTML|\[innerHtml\]/);                      // aria-hidden: es solo una ayuda visual con ratón (equivalente: tarjeta, tabla y anterior/siguiente)
  const grupo = /<div class="controles" role="group" aria-label="Controles del globo">([\s\S]*?)\n            <\/div>/.exec(c)?.[1] ?? '';
  assert.equal((grupo.match(/<select /g) ?? []).length, 1);                              // un único selector, dentro del grupo existente (no añade otro bloque)
  assert.match(grupo, /<select class="region" aria-label="Ir a región" \(change\)="irARegion\(\$event\)">/);
  assert.match(grupo, /<option value="" selected>Región<\/option>/); assert.match(grupo, /@for \(r of regiones; track r\.id\) \{ <option \[value\]="r\.id">\{\{ r\.nombre \}\}<\/option> \}/);
  assert.equal((grupo.match(/<button /g) ?? []).length, 4);                              // los cuatro botones de antes siguen ahí
  assert.match(c, /select\.region \{[^}]*min-height: 36px[^}]*\}/); assert.match(c, /select\.region \{[^}]*background-color: var\(--superficie-1\); color: var\(--texto\)/);   // tema oscuro: color y fondo explícitos
  assert.match(c, /select\.region:focus-visible \{ outline: 3px solid var\(--foco\)/);
  assert.match(c, /readonly regiones = REGIONES/); assert.match(c, /import \{ REGIONES \} from '\.\/camara'/);
  const ayuda = /<details class="ayuda">([\s\S]*?)<\/details>/.exec(c)?.[1] ?? '';
  assert.match(ayuda, /se reanuda tras 3 s sin tocar nada/); assert.doesNotMatch(ayuda, /5 s/);
  // CAMBIO (F7, ajuste 3/4): la ayuda ya no dice «vuelve el zoom anterior»; ahora explica los tres modos de cerrar y que la cámara vuelve al zoom predeterminado, enderezada
  for (const parte of ['se centra en él y se acerca', 'zoom predeterminado', 'zona vacía del globo', '«Región»', 'no cambian los filtros', 'aparece su lugar y su magnitud', 'laten de forma muy sutil', 'movimiento reducido']) assert.ok(ayuda.includes(parte), parte);
  assert.doesNotMatch(c, /aria-live="polite"[\s\S]*aria-live="polite"/);                 // el selector de región no añade regiones vivas: no anuncia nada
  assert.match(c, /tooltip: this\.elTooltip\(\)\.nativeElement/); assert.match(c, /textoTooltip\(e\.properties\?\.place, e\.properties\?\.mag\)/);
});

test('globo (3.ª iteración): los módulos nuevos son puros (sin three, DOM, red, almacenamiento ni imports en ejecución) y el retardo de 3 s no queda con comentarios de 5 s', () => {
  for (const f of ['camara.ts', 'pulso.ts', 'tooltip.ts']) {
    const t = leer(join('globo', f));
    assert.doesNotMatch(t, /document\.|window\.|from 'three|fetch\(|localStorage|sessionStorage|indexedDB|https?:\/\//, f);
    assert.doesNotMatch(t, /^import (?!type)/m, f);                                      // se prueban con node --test: sin imports en ejecución
  }
  assert.doesNotMatch(leer('globo/rotacion.ts'), /RETARDO_REANUDAR_MS = 5000/);
  assert.match(leer('globo/rotacion.ts'), /export const RETARDO_REANUDAR_MS = 3000;/);
});
