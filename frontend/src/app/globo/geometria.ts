// Globo 3D (F7): geometría y selección PURAS. Sin three, sin DOM, sin imports en ejecución (solo `import type`): se prueban con `node --test` (tests/globo.test.ts).
// La codificación visual (radio por magnitud, color por profundidad, id) NO se duplica: llega como parámetro (`Codificacion`) y el componente le pasa
// radioMagnitud / colorProfundidad / idDe, las MISMAS funciones del mapa 2D.
//
// Lo que el globo NO traslada del mapa 2D (decisión de diseño, no omisión): control de capas, selector claro/oscuro (el globo es siempre oscuro),
// tooltips de fronteras, ventanas emergentes de Leaflet (las sustituye la tarjeta de detalle) y el zoom de Leaflet (el globo tiene el suyo).
import type { Evento } from '../modelos';

export type Xyz = [number, number, number];

// ---------- Convención de coordenadas -------------------------------------------------------------------------------------------------------------
// Esfera de radio 1 centrada en el origen. Eje Y = norte (polo norte = +Y). (lat 0, lon 0) = +Z (la cámara inicial mira hacia ahí) y lon +90° (este) = +X.
//   x = r·cos(lat)·sin(lon)    y = r·sin(lat)    z = r·cos(lat)·cos(lon)
// Sistema dextrógiro: visto desde fuera, mirando a lon 0, el este queda a la derecha (igual que en un mapa).

export const RADIO_ESFERA = 1;
/** Los puntos se dibujan un 0,3 % por encima de la superficie: evita el z-fighting con la esfera sin separarse visiblemente. */
export const ELEVACION_PUNTO = 0.003;
/**
 * Radio visual de un evento = radioMagnitud(mag) × FACTOR_RADIO (en unidades de la esfera de radio 1). radioMagnitud va de 3 a 18 (px en el mapa 2D), así que
 * los tamaños RELATIVOS son idénticos al 2D. Con la cámara inicial (≈ 225 px por unidad) un radio 3 mide ≈ 2 px y un radio 18 ≈ 12 px; al acercar, crece.
 */
export const FACTOR_RADIO = 0.003;
/** Tope técnico de seguridad (memoria y GPU). Si se supera, el componente lo AVISA y no presenta lo dibujado como el total. */
export const MAX_EVENTOS_GLOBO = 100_000;
/** Zona de captura mínima, en píxeles de pantalla (objetivo táctil razonable: ≈ 24 px de diámetro). */
export const MIN_PX_TACTIL = 12;
/** Un gesto que se mueve más de estos píxeles entre pulsar y soltar es un ARRASTRE (gira el globo), no una selección. */
export const UMBRAL_CLIC_PX = 6;
/** Dos candidatos cuyas distancias angulares difieren menos que esto (radianes) se consideran empatados. */
export const EPS_EMPATE = 1e-6;
/** Margen sobre el horizonte: un evento rozando el borde del disco visible no se selecciona (se vería de canto). */
export const MARGEN_CARA = 0.02;

const RAD = Math.PI / 180;

export function latLonAXyz(lat: number, lon: number, radio: number = RADIO_ESFERA): Xyz {
  const phi = lat * RAD; const lam = lon * RAD;
  const c = Math.cos(phi);
  return [radio * c * Math.sin(lam), radio * Math.sin(phi), radio * c * Math.cos(lam)];
}

export function normalizar(v: Xyz): Xyz {
  const n = Math.hypot(v[0], v[1], v[2]);
  return n === 0 ? [0, 0, 0] : [v[0] / n, v[1] / n, v[2] / n];
}

export function punto(a: Xyz, b: Xyz): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

// ---------- Paleta (tokens de styles.css) ---------------------------------------------------------------------------------------------------------
/** [nombre del token CSS, valor de respaldo]. Los respaldos deben coincidir con styles.css (lo comprueba tests/globo.test.ts). */
export const TOKENS_GLOBO = {
  fondo: ['--fondo', '#0a1120'],
  /** Océano: el cuerpo del planeta (y la esfera lisa si la textura no llega). */
  esfera: ['--superficie-2', '#15233b'],
  /** Tierra firme: algo más clara que el océano (relación ≈ 1,5:1; solo diferencia masas, la forma de los marcadores la da su borde). */
  continente: ['--globo-continente', '#264264'],
  reticula: ['--borde', '#2a3c5c'],
  fronteras: ['--borde-control', '#6b82a6'],
  halo: ['--acento', '#22d3ee'],
  borde: ['--punto-borde', '#e2e8f0'],
  seleccion: ['--acento-texto', '#67e8f9'],
  /** Estrellas de fondo (F7, 4.ª iteración): gris azulado del texto secundario, atenuado en el shader por su brillo (opacidad 0,12–0,42). */
  estrellas: ['--texto-2', '#a9b8d0'],
  /** Anillos de eventos nuevos en REPRODUCCIÓN: el violeta del modo replay (en vivo usan el cian de acento, `halo`). */
  replay: ['--replay', '#a78bfa'],
} as const;
export type PaletaGlobo = { -readonly [K in keyof typeof TOKENS_GLOBO]: string };

/** Lee cada token con `leer` (p. ej. getComputedStyle(...).getPropertyValue); si no es un `#rrggbb` válido usa el respaldo. */
export function resolverPaleta(leer: (token: string) => string): PaletaGlobo {
  const salida = {} as PaletaGlobo;
  for (const clave of Object.keys(TOKENS_GLOBO) as (keyof typeof TOKENS_GLOBO)[]) {
    const [token, respaldo] = TOKENS_GLOBO[clave];
    const valor = (leer(token) ?? '').trim().toLowerCase();
    salida[clave] = /^#[0-9a-f]{6}$/.test(valor) ? valor : respaldo;
  }
  return salida;
}

// ---------- Eventos -> puntos del globo -----------------------------------------------------------------------------------------------------------
export interface Codificacion {
  /** Radio del mapa 2D según la magnitud (radioMagnitud). */
  radio(magnitud: unknown): number;
  /** Color hex según la profundidad (colorProfundidad). */
  color(profundidad: unknown): string;
  /** Identificador del evento, el mismo de la tabla (idDe). */
  id(evento: Evento, indice: number): string;
}

/** Eventos con coordenadas válidas, en estructuras planas (rápidas de recorrer y de subir a la GPU). */
export interface PuntosGlobo {
  n: number;
  ids: string[];
  /** Normal (vector unitario) de cada evento: 3 floats por evento. */
  normales: Float32Array;
  /** Radio visual de cada evento (unidades de esfera = radianes de arco). */
  radios: Float32Array;
  /** Magnitud; NaN = sin magnitud. */
  magnitudes: Float64Array;
  colores: string[];
  radioMax: number;
}

export interface ResultadoPuntos {
  puntos: PuntosGlobo;
  /** Eventos que se dibujan (= puntos.n). */
  dibujados: number;
  /** Sin geometría Point o con lon/lat no válidos: no se dibujan (igual que en el mapa 2D). */
  omitidos: number;
  /** Válidos pero NO dibujados por superar el tope técnico. 0 en el caso normal. */
  recortados: number;
  tope: number;
}

/**
 * Mismo criterio que `dibujar()` del mapa 2D: hay propiedades, geometría Point, lon y lat numéricos y finitos, |lon| <= 180 y |lat| <= 90.
 * No hay muestreo: se dibujan TODOS los válidos salvo que superen `tope` (entonces `recortados` > 0 y la interfaz lo dice).
 */
export function prepararPuntos(eventos: readonly Evento[], cod: Codificacion, tope: number = MAX_EVENTOS_GLOBO): ResultadoPuntos {
  const ids: string[] = []; const colores: string[] = [];
  const normales: number[] = []; const radios: number[] = []; const mags: number[] = [];
  let omitidos = 0; let recortados = 0; let radioMax = 0;
  for (const [indice, e] of eventos.entries()) {
    const p = e.properties;
    const c = e.geometry?.type === 'Point' ? e.geometry.coordinates : [];
    const [lon, lat, prof] = c;
    if (!p || typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) { omitidos++; continue; }
    if (ids.length >= tope) { recortados++; continue; }
    const [x, y, z] = latLonAXyz(lat, lon, 1);
    const r = cod.radio(p.mag) * FACTOR_RADIO;
    normales.push(x, y, z); radios.push(r); if (r > radioMax) radioMax = r;
    mags.push(typeof p.mag === 'number' && Number.isFinite(p.mag) ? p.mag : NaN);
    ids.push(cod.id(e, indice)); colores.push(cod.color(prof));
  }
  const puntos: PuntosGlobo = { n: ids.length, ids, normales: Float32Array.from(normales), radios: Float32Array.from(radios), magnitudes: Float64Array.from(mags), colores, radioMax };
  return { puntos, dibujados: ids.length, omitidos, recortados, tope };
}

/**
 * Orden de CAPAS de los marcadores: copia de `p` con los eventos de MAYOR radio visual primero (índices bajos) y los pequeños al final. Es el orden de las instancias
 * del InstancedMesh, que la GPU dibuja en orden de índice; los marcadores se pintan sin prueba de profundidad (la cara oculta se descarta en el shader), así que el
 * último dibujado queda ENCIMA: un punto pequeño nunca queda tapado por uno grande vecino. Se ordena por radio (lo que determina el solapamiento; es monótono con la
 * magnitud, y el sin-magnitud usa su radio por defecto) y, a igualdad, por posición original (estable y determinista).
 * Coste: O(n log n) UNA vez por cambio de datos (no por fotograma). Devuelve las MISMAS estructuras reordenadas (ids, normales, radios, magnitudes, colores): quien use la
 * copia ordenada (selección, anillo, instancias) ve índices coherentes con los ids.
 */
export function ordenarPorCapas(p: PuntosGlobo): PuntosGlobo {
  const orden = new Uint32Array(p.n);
  for (let i = 0; i < p.n; i++) orden[i] = i;
  orden.sort((a, b) => (p.radios[b] - p.radios[a]) || (a - b));
  const ids: string[] = new Array(p.n); const colores: string[] = new Array(p.n);
  const normales = new Float32Array(p.n * 3); const radios = new Float32Array(p.n); const magnitudes = new Float64Array(p.n);
  for (let k = 0; k < p.n; k++) {
    const i = orden[k];
    ids[k] = p.ids[i]; colores[k] = p.colores[i]; radios[k] = p.radios[i]; magnitudes[k] = p.magnitudes[i];
    normales[3 * k] = p.normales[3 * i]; normales[3 * k + 1] = p.normales[3 * i + 1]; normales[3 * k + 2] = p.normales[3 * i + 2];
  }
  return { n: p.n, ids, normales, radios, magnitudes, colores, radioMax: p.radioMax };
}

// ---------- Selección por proximidad --------------------------------------------------------------------------------------------------------------
/**
 * Corte de un rayo con la esfera de radio `radio` centrada en el origen. Devuelve el punto MÁS CERCANO al origen del rayo (la cara visible) o null si no corta.
 * Se resuelve |o + t·d|² = R²: con b = o·d y c = |o|² − R², discriminante b² − c; t = −b − √(b² − c) (raíz menor). Si t < 0 con la cámara fuera, la esfera queda detrás.
 */
export function interseccionEsferaRayo(origen: Xyz, direccion: Xyz, radio: number = RADIO_ESFERA): { punto: Xyz; distancia: number } | null {
  const d = normalizar(direccion);
  const b = punto(origen, d);
  const c = punto(origen, origen) - radio * radio;
  const disc = b * b - c;
  if (disc < 0) return null;
  const raiz = Math.sqrt(disc);
  let t = -b - raiz;
  if (t < 0) t = -b + raiz; // origen dentro de la esfera: la única salida es la raíz mayor
  if (t < 0) return null;
  return { punto: [origen[0] + t * d[0], origen[1] + t * d[1], origen[2] + t * d[2]], distancia: t };
}

/** Píxeles de pantalla por unidad de longitud a `distancia` de la cámara (cámara en perspectiva): alturaPx / (2·d·tan(fov/2)). */
export function pxPorUnidad(alturaPx: number, fovGrados: number, distancia: number): number {
  return alturaPx / (2 * distancia * Math.tan((fovGrados * RAD) / 2));
}

/**
 * Umbral angular (radianes) de captura de un evento:  θ = max(r_visual, minPx / pxPorUnidad).
 *  · r_visual: su radio visual (el clic sobre el propio círculo siempre cuenta).
 *  · minPx / pxPorUnidad: la zona táctil mínima (12 px de radio) convertida a ángulo con el zoom ACTUAL. En una esfera de radio 1, una longitud de arco en
 *    unidades equivale a radianes. Al alejar, pxPorUnidad baja y el umbral crece (los puntos son diminutos); al acercar, el umbral se reduce y solo cuentan los círculos.
 * Aproximación: no corrige el escorzo cerca del borde del disco (allí los puntos se ven más juntos); lo resuelve la regla «gana el más cercano al impacto».
 */
export function umbralAngular(radioVisual: number, pxUnidad: number, minPx: number = MIN_PX_TACTIL): number {
  if (!(pxUnidad > 0)) return Math.PI;
  return Math.max(radioVisual, minPx / pxUnidad);
}

/** ¿El evento (normal unitaria) está en la cara visible? Condición de horizonte: n·u_cámara > R/|cámara| (+ margen). Con la cámara a 3,2 ⇒ n·u > 0,3125 + 0,02. */
export function esCaraVisible(nx: number, ny: number, nz: number, camara: Xyz, margen: number = MARGEN_CARA): boolean {
  const dist = Math.hypot(camara[0], camara[1], camara[2]);
  if (!(dist > RADIO_ESFERA)) return false;
  return (nx * camara[0] + ny * camara[1] + nz * camara[2]) / dist > RADIO_ESFERA / dist + margen;
}

export interface Seleccion { indice: number; id: string; angulo: number }
export interface OpcionesSeleccion { minPx?: number; margen?: number; eps?: number }

/**
 * Elige el evento más cercano (distancia angular) al punto de impacto, entre los que están en la cara visible y dentro de su umbral (`umbralAngular`).
 * Empate (diferencia < eps): mayor magnitud (sin magnitud = la menor) y después id menor por orden de código: determinista e independiente del orden de entrada.
 * Coste: un único bucle O(n) con un producto punto por evento. Para n <= 100 000 son ≈ 10⁶ operaciones (≈ 1–2 ms), sin estructuras que invalidar en cada
 * refresco; una rejilla esférica no compensa a esta escala. Un descarte previo por coseno (el del umbral máximo) evita casi todos los cálculos de ángulo.
 * `impacto` es el punto de la cara visible (cualquier norma); `camara`, su posición; `pxUnidad`, `pxPorUnidad(...)` en el impacto.
 */
export function seleccionarPorProximidad(puntos: PuntosGlobo, impacto: Xyz, camara: Xyz, pxUnidad: number, opciones: OpcionesSeleccion = {}): Seleccion | null {
  const minPx = opciones.minPx ?? MIN_PX_TACTIL; const margen = opciones.margen ?? MARGEN_CARA; const eps = opciones.eps ?? EPS_EMPATE;
  const h = normalizar(impacto);
  if (h[0] === 0 && h[1] === 0 && h[2] === 0) return null;
  const { n, normales, radios } = puntos;
  const umbralMax = Math.max(puntos.radioMax, umbralAngular(0, pxUnidad, minPx));
  const cosMin = umbralMax >= Math.PI ? -1 : Math.cos(umbralMax);
  const candidatos: number[] = []; const angulos: number[] = [];
  let mejor = Infinity;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const nx = normales[o]; const ny = normales[o + 1]; const nz = normales[o + 2];
    const d = nx * h[0] + ny * h[1] + nz * h[2];
    if (d < cosMin) continue;                                    // descarte barato: fuera incluso del umbral máximo
    if (!esCaraVisible(nx, ny, nz, camara, margen)) continue;    // cara oculta: nunca seleccionable
    // ángulo = atan2(|n × h|, n · h): a diferencia de acos(n · h), no pierde precisión para ángulos pequeños (acos(0,99985) amplifica 1e-7 de error a ≈ 6e-6 rad, más que el épsilon de empate)
    const cx = ny * h[2] - nz * h[1]; const cy = nz * h[0] - nx * h[2]; const cz = nx * h[1] - ny * h[0];
    const ang = Math.atan2(Math.hypot(cx, cy, cz), d);
    if (ang > umbralAngular(radios[i], pxUnidad, minPx)) continue;
    candidatos.push(i); angulos.push(ang);
    if (ang < mejor) mejor = ang;
  }
  let elegido = -1; let angElegido = 0;
  for (const [k, i] of candidatos.entries()) {
    if (angulos[k] > mejor + eps) continue;                      // solo el grupo empatado con el más cercano
    if (elegido < 0 || esMejor(puntos, i, elegido)) { elegido = i; angElegido = angulos[k]; }
  }
  return elegido < 0 ? null : { indice: elegido, id: puntos.ids[elegido], angulo: angElegido };
}

/** Desempate: mayor magnitud (NaN = menor que cualquiera) y luego id menor. */
function esMejor(p: PuntosGlobo, a: number, b: number): boolean {
  const ma = Number.isNaN(p.magnitudes[a]) ? -Infinity : p.magnitudes[a];
  const mb = Number.isNaN(p.magnitudes[b]) ? -Infinity : p.magnitudes[b];
  if (ma !== mb) return ma > mb;
  return p.ids[a] < p.ids[b];
}

export interface VistaSeleccion { alturaPx: number; fovGrados: number }

/** Selección completa a partir de un rayo (origen = cámara): corte con la esfera → impacto → umbral según el zoom → evento más cercano. null si el rayo no toca el globo o no hay candidato. */
export function seleccionarPorRayo(puntos: PuntosGlobo, origen: Xyz, direccion: Xyz, vista: VistaSeleccion, opciones: OpcionesSeleccion = {}): Seleccion | null {
  const corte = interseccionEsferaRayo(origen, direccion, RADIO_ESFERA);
  if (corte === null) return null;
  return seleccionarPorProximidad(puntos, corte.punto, origen, pxPorUnidad(vista.alturaPx, vista.fovGrados, corte.distancia), opciones);
}

/** ¿Clic o arrastre? Un desplazamiento (dx, dy) de hasta `umbral` píxeles entre pulsar y soltar es un clic. */
export function esClic(dx: number, dy: number, umbral: number = UMBRAL_CLIC_PX): boolean {
  return Math.hypot(dx, dy) <= umbral;
}

// ---------- Navegación por teclado entre eventos (alternativa al puntero) -------------------------------------------------------------------------
/** Ids ordenados por magnitud descendente (sin magnitud al final) y, a igualdad, por id. */
export function idsPorMagnitud(puntos: PuntosGlobo): string[] {
  const idx = Array.from({ length: puntos.n }, (_, i) => i);
  idx.sort((a, b) => (esMejor(puntos, a, b) ? -1 : esMejor(puntos, b, a) ? 1 : 0));
  return idx.map((i) => puntos.ids[i]);
}

/** Siguiente (+1) o anterior (−1) en la lista circular; sin selección (o con un id que ya no está) empieza por el primero / el último. */
export function vecinoEnLista(lista: readonly string[], actual: string | null, delta: 1 | -1): string | null {
  if (lista.length === 0) return null;
  const i = actual === null ? -1 : lista.indexOf(actual);
  if (i < 0) return delta === 1 ? lista[0] : lista[lista.length - 1];
  return lista[(i + delta + lista.length) % lista.length];
}

// ---------- Líneas: retícula y fronteras (pares de vértices para LineSegments) ---------------------------------------------------------------------
function empujarArco(salida: number[], a: Xyz, b: Xyz, radio: number, maxRad: number): void {
  const ang = Math.acos(Math.max(-1, Math.min(1, punto(a, b))));
  const trozos = Math.max(1, Math.ceil(ang / maxRad));
  let previo = a;
  for (let k = 1; k <= trozos; k++) {
    const t = k / trozos;
    // interpolación lineal + normalización: la cuerda entre dos puntos lejanos pasaría por dentro de la esfera y quedaría oculta
    const m = normalizar([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    salida.push(previo[0] * radio, previo[1] * radio, previo[2] * radio, m[0] * radio, m[1] * radio, m[2] * radio);
    previo = m;
  }
}

/** Retícula: paralelos y meridianos cada `paso` grados, muestreados cada `muestreo` grados. */
export function segmentosReticula(radio: number, paso = 30, muestreo = 3): Float32Array {
  const s: number[] = [];
  for (let lat = -90 + paso; lat < 90; lat += paso) for (let lon = -180; lon < 180; lon += muestreo) empujarArco(s, latLonAXyz(lat, lon, 1), latLonAXyz(lat, lon + muestreo, 1), radio, Math.PI);
  for (let lon = -180; lon < 180; lon += paso) for (let lat = -90; lat < 90; lat += muestreo) empujarArco(s, latLonAXyz(lat, lon, 1), latLonAXyz(lat + muestreo, lon, 1), radio, Math.PI);
  return Float32Array.from(s);
}

type Anillo = unknown;
function recorrerAnillos(geom: unknown, salida: Anillo[][]): void {
  if (typeof geom !== 'object' || geom === null) return;
  const g = geom as { type?: string; coordinates?: unknown; geometries?: unknown; geometry?: unknown; features?: unknown };
  const tipo = g.type; const c = g.coordinates;
  if (tipo === 'FeatureCollection' && Array.isArray(g.features)) for (const f of g.features) recorrerAnillos(f, salida);
  else if (tipo === 'Feature') recorrerAnillos(g.geometry, salida);
  else if (tipo === 'GeometryCollection' && Array.isArray(g.geometries)) for (const x of g.geometries) recorrerAnillos(x, salida);
  else if (tipo === 'LineString' && Array.isArray(c)) salida.push([c]);
  else if (tipo === 'MultiLineString' && Array.isArray(c)) salida.push(c);
  else if (tipo === 'Polygon' && Array.isArray(c)) salida.push(c);
  else if (tipo === 'MultiPolygon' && Array.isArray(c)) for (const poligono of c) if (Array.isArray(poligono)) salida.push(poligono);
}

/**
 * Fronteras como pares de vértices de un único LineSegments. Acepta FeatureCollection/Feature/Polygon/MultiPolygon/LineString/MultiLineString;
 * los puntos no válidos se saltan. Los tramos más largos que `maxGrados` se subdividen sobre la esfera.
 */
export function segmentosFronteras(geojson: unknown, radio: number, maxGrados = 2): Float32Array {
  const grupos: Anillo[][] = [];
  recorrerAnillos(geojson, grupos);
  const s: number[] = [];
  const maxRad = maxGrados * RAD;
  for (const grupo of grupos) for (const anillo of grupo) {
    if (!Array.isArray(anillo)) continue;
    let previo: Xyz | null = null;
    for (const par of anillo) {
      const lon = Array.isArray(par) ? par[0] : undefined; const lat = Array.isArray(par) ? par[1] : undefined;
      if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90) { previo = null; continue; }
      const actual = latLonAXyz(lat, lon, 1);
      if (previo !== null) empujarArco(s, previo, actual, radio, maxRad);
      previo = actual;
    }
  }
  return Float32Array.from(s);
}

// ---------- Cámara ---------------------------------------------------------------------------------------------------------------------------------
/** Campo de visión vertical de la cámara (grados). */
export const FOV_GLOBO = 40;
/** Panel de detalle flotante (escritorio): ancho y separación del borde, en píxeles CSS. Los usa el componente (CSS y reserva) y el desplazamiento de la cámara. */
export const ANCHO_PANEL_PX = 320;
export const MARGEN_PANEL_PX = 12;

/** Radio aparente (px) de la esfera de radio 1 vista desde `distancia`: tan(asin(1/d)) / tan(fov/2) · alto/2 (silueta, no el centro). */
export function radioEsferaPx(alturaPx: number, fovGrados: number, distancia: number): number {
  if (!(distancia > RADIO_ESFERA) || !(alturaPx > 0)) return 0;
  return (Math.tan(Math.asin(RADIO_ESFERA / distancia)) / Math.tan((fovGrados * RAD) / 2)) * (alturaPx / 2);
}

/**
 * Desplazamiento horizontal (px) del centro del globo hacia la IZQUIERDA para que la esfera no quede bajo el panel flotante de la derecha, SIN redimensionar el canvas
 * (se aplica con camera.setViewOffset). Solo se desplaza lo imprescindible: si la silueta (con `margen`) ya cabe a la izquierda del panel, es 0 y el globo no se mueve
 * al seleccionar. Nunca más de reserva/2 (centrar en el espacio libre) ni tanto que la esfera se salga por la izquierda. `reserva` = ancho del panel + su separación.
 */
export function desplazamientoCentroPx(ancho: number, alto: number, reserva: number, distancia: number = DISTANCIA_INICIAL, margen = 12): number {
  if (!(reserva > 0) || !(ancho > 0) || !(alto > 0)) return 0;
  const radio = radioEsferaPx(alto, FOV_GLOBO, distancia);
  const necesario = ancho / 2 + radio + margen - (ancho - reserva);
  return Math.max(0, Math.min(necesario, reserva / 2, ancho / 2 - radio));
}

export const DISTANCIA_INICIAL = 3.2;
export const DISTANCIA_MIN = 1.25;
export const DISTANCIA_MAX = 6;
/** Cámara inicial: el mismo centro que el mapa 2D (lat 18, lon 0). */
export const LAT_INICIAL = 18;
export const LON_INICIAL = 0;
/** Zoom con los botones y el teclado: acercar multiplica la distancia por 0,8 y alejar por 1,25 (inversos), siempre dentro de [mín, máx]. */
export function distanciaTrasZoom(distancia: number, sentido: 1 | -1): number {
  const d = sentido === 1 ? distancia * 0.8 : distancia * 1.25;
  return Math.max(DISTANCIA_MIN, Math.min(DISTANCIA_MAX, d));
}
