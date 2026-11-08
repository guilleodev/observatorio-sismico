// Geometría y etiquetas de las gráficas SVG (F5, paso 5.5; DF2: sin biblioteca de gráficos). Funciones PURAS y autocontenidas (solo `import type`).
// IMPORTANTE: aquí NO se calculan estadísticas: todas las cifras vienen de /api/estadisticas; estas funciones solo las convierten en barras y etiquetas.
import type { BloqueHora, BloqueIntervalos, BloquePais, ItemGrafica } from './modelos';

// Copia mínima del formato numérico español (coma decimal): los módulos puros no se importan entre sí en ejecución (R-011).
const num = (n: number, decimales = 0): string => n.toFixed(decimales).replace('.', ',');

export type Margen = { izq: number; der: number; arr: number; aba: number };
export type Barra = { x: number; y: number; ancho: number; alto: number };
export type Diseno = { barras: Barra[]; maximo: number; marcas: number[]; anchoUtil: number; altoUtil: number };

/** Máximo «redondo» (1, 2, 5 × 10^k) ≥ `m`, para que el eje no acabe en una cifra rara. Con 0 devuelve 1 (eje 0–1) en vez de dividir por cero. */
export function maximoRedondo(m: number): number {
  if (!(m > 0)) return 1;
  const potencia = 10 ** Math.floor(Math.log10(m));
  const f = m / potencia;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * potencia;
}

/** Marcas del eje de valores: 0 y el máximo, y la mitad si es un entero (los recuentos son enteros: nunca 0,5). */
export function marcasEje(maximo: number): number[] {
  return Number.isInteger(maximo / 2) && maximo >= 2 ? [0, maximo / 2, maximo] : [0, maximo];
}

/** Barras verticales: una por valor, dentro del área útil; la altura es proporcional y un 0 mide 0 (sin barra) — nunca se inventa una altura mínima. */
export function disenoBarras(valores: number[], ancho: number, alto: number, margen: Margen): Diseno {
  const anchoUtil = Math.max(0, ancho - margen.izq - margen.der);
  const altoUtil = Math.max(0, alto - margen.arr - margen.aba);
  const maximo = maximoRedondo(Math.max(0, ...valores));
  const paso = valores.length > 0 ? anchoUtil / valores.length : 0;
  const barras = valores.map((v, i) => {
    const h = Math.max(0, v) / maximo * altoUtil;
    return { x: margen.izq + i * paso + paso * 0.1, y: margen.arr + altoUtil - h, ancho: paso * 0.8, alto: h };
  });
  return { barras, maximo, marcas: marcasEje(maximo), anchoUtil, altoUtil };
}

/** Barras horizontales (países): lo mismo con los ejes intercambiados; `anchoUtil` es el largo máximo de una barra. */
export function disenoBarrasHorizontales(valores: number[], ancho: number, alto: number, margen: Margen): Diseno {
  const anchoUtil = Math.max(0, ancho - margen.izq - margen.der);
  const altoUtil = Math.max(0, alto - margen.arr - margen.aba);
  const maximo = maximoRedondo(Math.max(0, ...valores));
  const paso = valores.length > 0 ? altoUtil / valores.length : 0;
  const barras = valores.map((v, i) => ({ x: margen.izq, y: margen.arr + i * paso + paso * 0.1, ancho: Math.max(0, v) / maximo * anchoUtil, alto: paso * 0.8 }));
  return { barras, maximo, marcas: marcasEje(maximo), anchoUtil, altoUtil };
}

/** Cada cuántas etiquetas se escribe una, para no solaparlas (como máximo `maxEtiquetas` visibles). */
export function pasoEtiquetas(n: number, maxEtiquetas: number): number {
  return n <= maxEtiquetas ? 1 : Math.ceil(n / maxEtiquetas);
}

/** «dd/mm HHh» en UTC de una hora (ms Unix); «ND» si no es válida. */
export function etiquetaHora(ms: number): string {
  if (!Number.isFinite(ms)) return 'ND';
  const d = new Date(ms);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)} ${dos(d.getUTCHours())}h`;
}

/** Etiqueta de un intervalo [desde, hasta): «< 10», «10–30», «≥ 500»; un extremo `null` es abierto (no Infinity). */
export function etiquetaIntervalo(desde: number | null, hasta: number | null): string {
  if (desde === null && hasta === null) return 'todos';
  if (desde === null) return `< ${num(hasta as number)}`;
  if (hasta === null) return `≥ ${num(desde)}`;
  return `${num(desde)}–${num(hasta)}`;
}

export function itemsHora(bloque: BloqueHora): ItemGrafica[] {
  return (bloque.items ?? []).map((i) => ({ etiqueta: etiquetaHora(i.hour), valor: i.count, detalle: new Date(i.hour).toISOString() }));
}

export function itemsIntervalos(bloque: BloqueIntervalos): ItemGrafica[] {
  return bloque.items.map((i) => ({ etiqueta: etiquetaIntervalo(i.from, i.to), valor: i.count }));
}

/**
 * Países para el gráfico: los `max` primeros por recuento y el resto agrupado en «Otros (k países)». «Sin país asignado» (country_id nulo) se conserva
 * SIEMPRE como barra propia: es una categoría del enunciado, no «otros». El orden es el de la API (recuento descendente).
 */
export function itemsPais(bloque: BloquePais, max = 10): ItemGrafica[] {
  const conPais = bloque.items.filter((i) => i.country_id !== null);
  const sinPais = bloque.items.find((i) => i.country_id === null);
  const visibles = conPais.slice(0, Math.max(0, max - (sinPais ? 1 : 0)));
  const resto = conPais.slice(visibles.length);
  const items: ItemGrafica[] = visibles.map((i) => ({ etiqueta: i.country_name, valor: i.count, detalle: i.country_id ?? undefined }));
  if (resto.length > 0) items.push({ etiqueta: `Otros (${resto.length} países)`, valor: resto.reduce((s, i) => s + i.count, 0) });
  if (sinPais) items.push({ etiqueta: sinPais.country_name, valor: sinPais.count, detalle: 'sin_pais' });
  return items;
}

export function sumaItems(items: ItemGrafica[]): number {
  return items.reduce((s, i) => s + i.valor, 0);
}
