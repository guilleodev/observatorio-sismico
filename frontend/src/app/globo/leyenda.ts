// Globo 3D (F7, 4.ª iteración · mejora 4): leyenda de profundidad INTERACTIVA (solo con la vista 3D). Módulo PURO: sin three, sin DOM, sin imports en ejecución (solo `import type`).
// Define los 4 rangos, su clasificación, los conteos, la máscara que recibe el shader y los textos. No hay estado aquí: el estado (qué rango está activo) es una señal en
// memoria de AppComponent (la leyenda vive en app.component.html) que llega al globo como input; nada se guarda en el navegador.
//
// Clasificación: ESPEJA el criterio de `colorProfundidad` (formato.ts): finito y < 70 → somera; finito y < 300 → media; finito y ≥ 300 → profunda; cualquier otra cosa (null,
// undefined, NaN, ±Infinity, texto) → no disponible. Una profundidad negativa es finita y < 70: somera (igual que su color). tests/globo.test.ts lo verifica contra colorProfundidad.
// Los 4 colores se repiten aquí (mismos hex que formato.ts y que las clases .punto-* de app.component.css; una prueba comprueba que coinciden) porque los módulos puros no pueden
// importarse entre sí. En el globo el rango de cada marcador se deduce de SU COLOR (que ya sale de colorProfundidad): así no se vuelve a clasificar ni se duplican umbrales sobre
// los datos, y la escena no necesita conocer las profundidades.
//
// Semántica (decisiones):
//  · SELECCIÓN ÚNICA con alternancia: pulsar un rango lo activa (atenúa los demás); pulsar el mismo otra vez, o «Mostrar todos», lo limpia.
//  · Los marcadores atenuados siguen en el globo con opacidad ALFA_ATENUADO, no laten ni emiten ondas, y NO son seleccionables por clic ni por etiqueta (evita confusión);
//    el evento SELECCIONADO se dibuja siempre a opacidad plena aunque sea de otro rango, y se puede volver a pulsar.
//  · «Evento anterior/siguiente» recorren solo los visibles cuando hay un rango activo; la tabla, el mapa 2D, las estadísticas y los filtros de la API NO cambian.
import type { PuntosGlobo } from './geometria';

export type RangoProfundidad = 'somera' | 'media' | 'profunda' | 'nd';
export interface DefRango {
  id: RangoProfundidad;
  /** Índice 0–3 (bit de la máscara y valor del atributo por instancia). */
  indice: number;
  /** Texto de la leyenda (los mismos de siempre). */
  texto: string;
  /** Clase CSS del punto (app.component.css). */
  clase: string;
  /** Color hex: el mismo que devuelve colorProfundidad para este rango. */
  color: string;
  /** Fragmento para el anuncio hablado: «Mostrando solo eventos de {anuncio}». */
  anuncio: string;
}

export const RANGOS_LEYENDA: readonly DefRango[] = [
  { id: 'somera', indice: 0, texto: 'Menos de 70 km', clase: 'punto-somera', color: '#e8a317', anuncio: 'menos de 70 km' },
  { id: 'media', indice: 1, texto: '70–299,99 km', clase: 'punto-media', color: '#e35b37', anuncio: '70 a 299,99 km' },
  { id: 'profunda', indice: 2, texto: '300 km o más', clase: 'punto-profunda', color: '#7b3fb6', anuncio: '300 km o más' },
  { id: 'nd', indice: 3, texto: 'No disponible', clase: 'punto-nd', color: '#64748b', anuncio: 'profundidad no disponible' },
];

/** Opacidad de los marcadores atenuados (0,15–0,25 pedido). */
export const ALFA_ATENUADO = 0.18;
/** Máscara con todos los rangos visibles (sin filtro). */
export const MASCARA_TODOS = 0b1111;

export interface ConteosRangos { somera: number; media: number; profunda: number; nd: number; total: number }

/** Índice (0–3) del rango de una profundidad, con el MISMO criterio que colorProfundidad. */
export function indiceRangoProfundidad(profundidad: unknown): number {
  if (typeof profundidad !== 'number' || !Number.isFinite(profundidad)) return 3;
  return profundidad < 70 ? 0 : profundidad < 300 ? 1 : 2;
}

export function rangoDeProfundidad(profundidad: unknown): RangoProfundidad { return RANGOS_LEYENDA[indiceRangoProfundidad(profundidad)].id; }

export function indiceDeRango(r: RangoProfundidad): number { return RANGOS_LEYENDA.findIndex((d) => d.id === r); }

const INDICE_POR_COLOR = new Map<string, number>(RANGOS_LEYENDA.map((d): [string, number] => [d.color, d.indice]));
/** Índice del rango de un color de profundidad (el de colorProfundidad), o 3 («No disponible») si no es ninguno de los cuatro. */
export function indiceRangoDeColor(hex: string): number { return INDICE_POR_COLOR.get(hex) ?? 3; }

/** Rellena (o crea) el vector de rangos por instancia a partir de los colores: UNA pasada O(n), solo al cambiar los datos. */
export function codificarRangos(colores: ArrayLike<string>, n: number, salida: Uint8Array = new Uint8Array(n)): Uint8Array {
  for (let i = 0; i < n; i++) salida[i] = indiceRangoDeColor(colores[i]);
  return salida;
}

/** Conteos por rango de los primeros `n` colores. Los cuatro suman siempre `total`. */
export function contarRangos(colores: ArrayLike<string>, n: number): ConteosRangos {
  const c = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) c[indiceRangoDeColor(colores[i])]++;
  return { somera: c[0], media: c[1], profunda: c[2], nd: c[3], total: n };
}

/** Máscara de bits que recibe el shader: todos los rangos si no hay filtro; solo el bit del rango activo si lo hay. */
export function mascaraDeRango(indice: number | null): number {
  return indice === null || indice < 0 || indice > 3 ? MASCARA_TODOS : 1 << indice;
}

/** Selección única con alternancia: pulsar el rango ya activo lo desactiva. */
export function alternarRango(actual: RangoProfundidad | null, elegido: RangoProfundidad): RangoProfundidad | null { return actual === elegido ? null : elegido; }

/** ¿Está visible la instancia con rango `rango` bajo la máscara? (espejo del shader). `seleccionada` siempre se ve. */
export function esVisible(rango: number, mascara: number, seleccionada = false): boolean { return seleccionada || ((mascara >> rango) & 1) === 1; }

/**
 * Subconjunto de los puntos que se pueden SELECCIONAR (clic y etiqueta) bajo la máscara: los visibles y, además, el evento seleccionado (índice `conservar`, −1 = ninguno). Conserva el
 * orden y las estructuras de PuntosGlobo para reutilizar seleccionarPorRayo tal cual: el picking de los visibles no cambia. O(n), solo al cambiar el filtro, los datos o la selección.
 */
export function filtrarPuntos(p: PuntosGlobo, rangos: ArrayLike<number>, mascara: number, conservar = -1): PuntosGlobo {
  const idx: number[] = [];
  for (let i = 0; i < p.n; i++) if (i === conservar || esVisible(rangos[i], mascara)) idx.push(i);
  const m = idx.length;
  const ids: string[] = new Array(m); const colores: string[] = new Array(m);
  const normales = new Float32Array(m * 3); const radios = new Float32Array(m); const magnitudes = new Float64Array(m);
  let radioMax = 0;
  for (let k = 0; k < m; k++) {
    const i = idx[k];
    ids[k] = p.ids[i]; colores[k] = p.colores[i]; radios[k] = p.radios[i]; magnitudes[k] = p.magnitudes[i];
    normales[3 * k] = p.normales[3 * i]; normales[3 * k + 1] = p.normales[3 * i + 1]; normales[3 * k + 2] = p.normales[3 * i + 2];
    if (p.radios[i] > radioMax) radioMax = p.radios[i];
  }
  return { n: m, ids, normales, radios, magnitudes, colores, radioMax };
}

/** Ids de los eventos de un rango (para «anterior/siguiente»), en el orden de los puntos recibidos. */
export function idsDeRango(p: Pick<PuntosGlobo, 'n' | 'ids' | 'colores'>, indice: number): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i < p.n; i++) if (indiceRangoDeColor(p.colores[i]) === indice) s.add(p.ids[i]);
  return s;
}

/** Contador del pie del globo. Sin rango: «N eventos dibujados» (como siempre). Con rango: «N eventos cargados · M visibles (rango: …)». «Cargados» sigue significando lo mismo (los dibujados). */
export function textoRecuento(dibujados: number, visibles: number, rango: RangoProfundidad | null, fmt: (n: number) => string = String): string {
  if (rango === null) return `${fmt(dibujados)} ${dibujados === 1 ? 'evento dibujado' : 'eventos dibujados'}`;
  const def = RANGOS_LEYENDA[indiceDeRango(rango)];
  return `${fmt(dibujados)} ${dibujados === 1 ? 'evento cargado' : 'eventos cargados'} · ${fmt(visibles)} ${visibles === 1 ? 'visible' : 'visibles'} (rango: ${def.texto})`;
}

/** Anuncio hablado sobrio al activar un rango; cadena vacía sin rango. */
export function textoAnuncioRango(rango: RangoProfundidad | null, visibles: number, total: number, fmt: (n: number) => string = String): string {
  if (rango === null) return '';
  return `Mostrando solo eventos de ${RANGOS_LEYENDA[indiceDeRango(rango)].anuncio}: ${fmt(visibles)} de ${fmt(total)}.`;
}

/** Nombre accesible del botón de un rango: contiene el texto visible («Menos de 70 km (N)»). */
export function nombreBotonRango(rango: DefRango, cuenta: string): string { return `Mostrar solo: ${rango.texto} (${cuenta})`; }
