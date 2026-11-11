// Presentación de la comparación con 2025 (F7, análisis B). Funciones PURAS y autocontenidas (solo `import type`): NO calculan nada nuevo.
// Solo dan FORMATO a cifras que ya calcula la API (recuento, esperado, diferencia, histórico) y deciden si el gráfico comparativo es HONESTO.
// Un gráfico es honesto si compara lo mismo con lo mismo: eventos del periodo con la misma magnitud mínima, mismo eje desde 0 y valores válidos.
import type { Comparacion } from './modelos';

/** Nota fija junto al gráfico: lo que la comparación es y lo que no es. */
export const NOTA_GRAFICO = 'Comparación de recuentos con la misma magnitud mínima; no mide evolución real de la actividad.';

const entero = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });
const esNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Entero en español (miles con punto desde 5 cifras, como el resto de la interfaz); «ND» si no es un número. */
export function formatoEntero(n: unknown): string { return esNum(n) ? entero.format(n) : 'ND'; }

/** Decimal en español con `d` decimales fijos y coma decimal; «ND» si no es un número. */
export function formatoDecimal(n: unknown, d = 1): string {
  return esNum(n) ? new Intl.NumberFormat('es', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n) : 'ND';
}

/** «4,5» / «4»: la magnitud mínima efectiva, igual que en la tabla. */
export function textoMagnitud(c: Comparacion): string { return formatoDecimal(c.min_mag_efectiva, c.min_mag_efectiva % 1 === 0 ? 0 : 1); }

/** «7 días», «1 día», «0,5 días» (el dato de la API; 2 decimales si no es entero). */
export function textoDuracion(dias: number): string {
  if (!esNum(dias)) return 'ND';
  const t = formatoDecimal(dias, dias % 1 === 0 ? 0 : 2);
  return `${t} ${dias === 1 ? 'día' : 'días'}`;
}

export type Sentido = 'por-encima' | 'por-debajo' | 'igual' | 'nd';
export type Diferencia = { texto: string | null; sentido: Sentido; glifo: string; etiqueta: string };

/**
 * Diferencia del recuento frente a lo esperado (variación de la API, SIN recalcular), con el mismo formato que `textoVariacion` de comparacion.ts.
 * Sin base (variación no definida, ND o esperado ≤ 0) NO se muestra ningún porcentaje: `texto` es null.
 */
export function diferencia(c: Comparacion): Diferencia {
  const base = c.historico !== null && esNum(c.historico.esperado_para_ventana) && c.historico.esperado_para_ventana > 0;
  if (!base || !c.variacion_definida || !esNum(c.variacion)) return { texto: null, sentido: 'nd', glifo: '–', etiqueta: 'No definida: la media de 2025 para este filtro es 0 o no hay histórico' };
  const pct = c.variacion * 100;
  const d = Math.abs(pct) >= 10 ? 0 : 1;
  const cifra = new Intl.NumberFormat('es', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false }).format(Math.abs(pct));
  const texto = `${pct >= 0 ? '+' : '−'}${cifra} %`;
  if (pct > 0) return { texto, sentido: 'por-encima', glifo: '▲', etiqueta: 'por encima de lo esperado según 2025' };
  if (pct < 0) return { texto, sentido: 'por-debajo', glifo: '▼', etiqueta: 'por debajo de lo esperado según 2025' };
  return { texto, sentido: 'igual', glifo: '＝', etiqueta: 'igual a lo esperado según 2025' };
}

export type Indicador = {
  id: 'reciente' | 'esperado' | 'diferencia' | 'historico';
  titulo: string;
  cifra: string;
  unidad: string;
  detalle: string;
  /** Origen de la cifra: el color de la insignia nunca va solo, siempre lleva `etiquetaFuente`. */
  fuente: 'vivo' | 'historico' | 'api';
  etiquetaFuente: string;
  glifo: string | null;
};

/** Cifras destacadas. Sin histórico (comparación no disponible) solo queda el recuento reciente: no se inventa nada. */
export function indicadores(c: Comparacion): Indicador[] {
  const lista: Indicador[] = [{
    id: 'reciente', titulo: 'Periodo reciente', cifra: formatoEntero(c.reciente.count), unidad: 'eventos',
    detalle: `Magnitud ≥ ${textoMagnitud(c)} · ${textoDuracion(c.reciente.dias)}`, fuente: 'vivo', etiquetaFuente: 'Feed en vivo (USGS)', glifo: null,
  }];
  const h = c.historico;
  if (h === null) return lista;
  const dif = diferencia(c);
  lista.push(
    { id: 'esperado', titulo: 'Esperado según 2025', cifra: formatoDecimal(h.esperado_para_ventana, 1), unidad: 'eventos',
      detalle: 'Expectativa (media diaria × días), no una medida', fuente: 'historico', etiquetaFuente: 'Histórico 2025 (catálogo FDSN)', glifo: null },
    { id: 'diferencia', titulo: 'Diferencia frente a lo esperado', cifra: dif.texto ?? 'No definida', unidad: '',
      detalle: dif.etiqueta, fuente: 'api', etiquetaFuente: 'Calculado por la API', glifo: dif.texto === null ? null : dif.glifo },
    { id: 'historico', titulo: 'Tamaño del histórico', cifra: formatoEntero(h.total), unidad: 'eventos',
      detalle: `en ${formatoEntero(h.dias)} días (todo 2025)`, fuente: 'historico', etiquetaFuente: 'Histórico 2025 (catálogo FDSN)', glifo: null },
  );
  return lista;
}

export type VistaGrafico = {
  mostrar: boolean;
  /** «No se muestra gráfico: …» cuando `mostrar` es false. */
  sinGrafico: string | null;
  reciente: number; esperado: number;
  /** Máximo del eje compartido (el eje va de 0 a este valor; nunca truncado). */
  maximo: number;
  pctReciente: number; pctEsperado: number;
  incompleto: boolean;
  textoReciente: string; textoEsperado: string; textoMaximo: string;
  aria: string;
};

const SIN: VistaGrafico = { mostrar: false, sinGrafico: null, reciente: 0, esperado: 0, maximo: 0, pctReciente: 0, pctEsperado: 0, incompleto: false, textoReciente: 'ND', textoEsperado: 'ND', textoMaximo: 'ND', aria: '' };
const sin = (motivo: string): VistaGrafico => ({ ...SIN, sinGrafico: `No se muestra gráfico: ${motivo}.` });

/**
 * ¿Hay gráfico honesto? Solo si hay histórico, el esperado es un número > 0 (hay base), el recuento reciente es válido (0 sí vale) y el periodo dura ≥ 1 día
 * (con menos, el «esperado» es una fracción de evento y la comparación engaña). Escala: un solo eje de 0 al mayor de los dos valores, en eventos.
 * Un periodo reciente marcado como incompleto se dibuja rayado y con borde discontinuo; la barra NO se alarga ni se «corrige».
 */
export function graficoComparativo(c: Comparacion): VistaGrafico {
  const h = c.historico;
  if (!c.comparacion_disponible || h === null) return sin('no hay histórico de 2025 cargado con el que comparar');
  if (!esNum(h.esperado_para_ventana)) return sin('el valor esperado según 2025 no está disponible (ND)');
  if (h.esperado_para_ventana <= 0) return sin('el esperado según 2025 es 0 para este filtro y no hay base para comparar');
  if (!esNum(c.reciente.count) || c.reciente.count < 0) return sin('el recuento del periodo reciente no está disponible (ND)');
  if (!esNum(c.reciente.dias) || c.reciente.dias < 1) return sin('el periodo dura menos de un día y lo esperado es una fracción de evento, poco comparable');
  const reciente = c.reciente.count;
  const esperado = h.esperado_para_ventana;
  const maximo = Math.max(reciente, esperado);
  const pct = (v: number) => Math.round(v / maximo * 10000) / 100;
  const incompleto = c.periodo_reciente_incompleto === true;
  const textoReciente = formatoEntero(reciente);
  const textoEsperado = formatoDecimal(esperado, 1);
  const aria = `Barras horizontales con el mismo eje desde 0, en eventos del periodo. Periodo reciente: ${textoReciente} eventos`
    + `${incompleto ? ' (posiblemente incompleto: el recuento podría subir)' : ''}. Esperado según 2025: ${textoEsperado} eventos (media diaria por días: una expectativa, no una medida). `
    + `Magnitud mínima ${textoMagnitud(c)} en ambos periodos. ${NOTA_GRAFICO}`;
  return { mostrar: true, sinGrafico: null, reciente, esperado, maximo, pctReciente: pct(reciente), pctEsperado: pct(esperado), incompleto, textoReciente, textoEsperado, textoMaximo: formatoDecimal(maximo, maximo % 1 === 0 ? 0 : 1), aria };
}
