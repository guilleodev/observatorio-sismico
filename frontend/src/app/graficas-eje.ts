// Eje temporal de «Terremotos por hora UTC» (F7, vista Análisis, iteración A). Funciones PURAS y autocontenidas (sin imports en ejecución, R-011).
// NO cambia los valores ni el orden de `itemsHora`: solo decide QUÉ etiquetas y separadores de día se dibujan bajo las barras.
// El instante de cada barra sale de `item.detalle` (el ISO UTC que ya pone `itemsHora`); si alguna barra no lo trae o no es una fecha, `valido` es false y el componente conserva las etiquetas antiguas.
// Todas las coordenadas `x` están en unidades del viewBox, relativas al borde izquierdo del área de barras (el componente suma el margen).

export type TickHora = { indice: number; x: number; texto: string };
/** `x` es el borde IZQUIERDO de la barra (donde cae el separador de día); `texto` es null si la etiqueta se omite para no solaparse con otra. */
export type MarcaDia = { indice: number; x: number; separador: boolean; texto: string | null };
export type EjeTemporal = {
  valido: boolean;
  /** Paso de las etiquetas de hora en horas (3, 6, 12, 24); 0 = no hay fila de horas (solo fechas). */
  paso: number;
  horas: TickHora[];
  dias: MarcaDia[];
  /** Título del eje. */
  eje: string;
  /** «10 nov – 11 nov 2026 · UTC». */
  periodo: string;
};

export const MESES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;
/** Separación mínima entre CENTROS de etiquetas de hora (≈ 5 caracteres mono de 12 px = 36 + 8 de aire) y entre etiqueta de fecha y la siguiente. */
export const SEPARACION_MIN = 44;
const ANCHO_CARACTER = 7.2;   // 12 px, tipografía mono; las fechas (negrita proporcional) se estiman igual, por exceso
const AIRE = 8;

const dos = (n: number) => String(n).padStart(2, '0');
const anchoTexto = (t: string) => t.length * ANCHO_CARACTER;

/** «11 nov» o, con año, «11 nov 2026» (mes abreviado en español, siempre en UTC). */
export function fechaCorta(ms: number, conAnio = false): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MESES_ES[d.getUTCMonth()]}${conAnio ? ` ${d.getUTCFullYear()}` : ''}`;
}

/** «HH:00» UTC de un instante. */
export function textoHora(ms: number): string { return `${dos(new Date(ms).getUTCHours())}:00`; }

const INVALIDO: EjeTemporal = { valido: false, paso: 0, horas: [], dias: [], eje: 'Hora UTC', periodo: '' };

/** «30 jul 2025 · UTC», «10 nov 2026 · UTC», «10 nov – 11 nov 2026 · UTC» o «31 dic 2026 – 1 ene 2027 · UTC». */
export function periodoUtc(primero: number, ultimo: number): string {
  const a = new Date(primero), b = new Date(ultimo);
  const mismoDia = a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
  if (mismoDia) return `${fechaCorta(primero, true)} · UTC`;
  if (a.getUTCFullYear() === b.getUTCFullYear()) return `${fechaCorta(primero)} – ${fechaCorta(ultimo)} ${b.getUTCFullYear()} · UTC`;
  return `${fechaCorta(primero, true)} – ${fechaCorta(ultimo, true)} · UTC`;
}

/**
 * Ticks del eje temporal. `ancho` = ancho útil (unidades del viewBox) del área de barras.
 * Paso de las etiquetas de hora por número de barras: ≤ 24 → cada 3 h; ≤ 48 → 6 h; ≤ 96 → 12 h; más → solo medianoches (fecha, sin fila de horas).
 * Las horas se alinean al reloj UTC (múltiplos del paso: 09:00, 12:00…), no al índice. Si aun así dos etiquetas quedarían a menos de SEPARACION_MIN, se sube al paso siguiente.
 * Un único tramo (p. ej. REPRODUCCIÓN) muestra su hora y la fecha completa.
 */
export function ticksEjeTemporal(items: ReadonlyArray<{ detalle?: string }>, ancho: number): EjeTemporal {
  const n = items.length;
  if (n === 0 || !(ancho > 0)) return INVALIDO;
  const ms = items.map((i) => (i.detalle === undefined ? NaN : Date.parse(i.detalle)));
  if (ms.some((v) => !Number.isFinite(v))) return INVALIDO;
  const paso = ancho / n;                                   // ancho de una barra
  const periodo = periodoUtc(ms[0], ms[n - 1]);
  const horaDe = (i: number) => new Date(ms[i]).getUTCHours();

  // --- fila de horas ---
  let horas: TickHora[] = [];
  let pasoH = 0;
  if (n === 1) {
    horas = [{ indice: 0, x: paso / 2, texto: textoHora(ms[0]) }];
    pasoH = 24;
  } else if (n <= 96) {
    const niveles = n <= 24 ? [3, 6, 12] : n <= 48 ? [6, 12] : [12];
    for (const p of niveles) {
      const cand = ms.map((_, i) => i).filter((i) => horaDe(i) % p === 0);
      const x = cand.map((i) => (i + 0.5) * paso);
      const holgado = x.every((v, k) => k === 0 || v - x[k - 1] >= SEPARACION_MIN);
      if (holgado || p === niveles[niveles.length - 1]) {
        // en el último nivel, si aún no cabe, se descartan las que se pisan (de izquierda a derecha)
        let ultimo = -Infinity;
        for (const i of cand) { const xi = (i + 0.5) * paso; if (xi - ultimo >= SEPARACION_MIN) { horas.push({ indice: i, x: xi, texto: textoHora(ms[i]) }); ultimo = xi; } }
        pasoH = p;
        break;
      }
    }
  }

  // --- fechas: primer tramo (si no es 00:00) y cada medianoche; separador en cada 00:00 que no sea la primera barra ---
  const marcas: MarcaDia[] = [];
  for (let i = 0; i < n; i++) {
    const medianoche = horaDe(i) === 0;
    if (!medianoche && i !== 0) continue;
    const cambiaAnio = i > 0 && new Date(ms[i]).getUTCFullYear() !== new Date(ms[i - 1]).getUTCFullYear();
    marcas.push({ indice: i, x: i * paso, separador: medianoche && i > 0, texto: fechaCorta(ms[i], i === 0 && n === 1 ? true : cambiaAnio) });
  }
  // Se omiten las etiquetas que se pisarían con la anterior; si la primera (tramo parcial) choca con la primera medianoche, manda la medianoche.
  const dias: MarcaDia[] = [];
  let finUltima = -Infinity;
  let indiceUltima = -1;
  for (const m of marcas) {
    const w = anchoTexto(m.texto ?? '');
    const cabeDerecha = m.x + 4 + w <= ancho + 10;          // no sale del área (el margen derecho es de 10)
    const cabe = m.x + 4 >= finUltima + AIRE && cabeDerecha;
    if (cabe) { dias.push(m); finUltima = m.x + 4 + w; indiceUltima = dias.length - 1; continue; }
    if (indiceUltima === 0 && dias.length === 1 && dias[0].indice === 0 && horaDe(0) !== 0 && cabeDerecha) {
      dias[0] = { ...dias[0], texto: null };                // sustituye la fecha del tramo parcial por la de la medianoche
      dias.push(m); finUltima = m.x + 4 + w; indiceUltima = dias.length - 1; continue;
    }
    dias.push({ ...m, texto: null });                       // el separador se dibuja igualmente; solo se omite el texto
  }
  return { valido: true, paso: pasoH, horas, dias, eje: 'Hora UTC', periodo };
}
