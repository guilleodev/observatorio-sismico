// Tooltip interactivo de las gráficas de barras (F7, vista Análisis, iteración A). Funciones PURAS y autocontenidas (sin imports en ejecución, R-011):
// (1) contenido del tooltip por tipo de gráfica, (2) posicionamiento con «clamp» y (3) navegación por teclado (roving tabindex).
// IMPORTANTE: aquí NO se calcula ninguna estadística nueva. Solo se REDACTA lo que ya está en las barras (etiqueta, valor, ISO de la hora, color de rango).
// El único número derivado es «% del total contado en esta gráfica» = valor / suma de las barras visibles, rotulado así.

export type TipoGrafica = 'hora' | 'pais' | 'magnitud' | 'profundidad' | 'generico';
export type ItemTip = { etiqueta: string; valor: number; detalle?: string };
export type ExtraTip = {
  unidad?: string;
  /** Suma de las barras visibles de ESTA gráfica (para el porcentaje); si falta o es 0, no se muestra. */
  total?: number;
  /** Color de la barra de profundidad (punto del tooltip); null/undefined = sin punto. */
  color?: string | null;
  /** Nombre del rango de la leyenda al que pertenece el intervalo de profundidad (null = cruza un corte → sin rango). */
  rango?: string | null;
};
export type ContenidoTooltip = {
  categoria: string;
  valor: string;
  unidad: string;
  contexto: string[];
  color: string | null;
  /** Texto plano equivalente: es el `aria-label` de la barra (mismo contenido que el tooltip visual). */
  texto: string;
};

const esNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const dos = (n: number) => String(n).padStart(2, '0');
const formatoNum = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });
const formatoPct = new Intl.NumberFormat('es', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** «10/11/2026 · 09:00–10:00 UTC» a partir del ISO de la hora; null si no es una fecha válida. */
export function rangoHoraCompleto(iso: string | undefined): string | null {
  const ms = iso === undefined ? NaN : Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const h = d.getUTCHours();
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} · ${dos(h)}:00–${dos((h + 1) % 24)}:00 UTC`;
}

// Meses abreviados (mismos que MESES_ES de graficas-eje.ts; se repiten aquí porque este módulo es autocontenido, R-011: sin imports).
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Titular limpio de la barra de hora: «11 nov · 10:00–11:00 UTC»; null si el ISO no es una fecha válida (entonces se conserva la etiqueta de la barra). */
export function titularHora(iso: string | undefined): string | null {
  const ms = iso === undefined ? NaN : Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const h = d.getUTCHours();
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} · ${dos(h)}:00–${dos((h + 1) % 24)}:00 UTC`;
}

/** «11/11/2026» (día completo UTC con año, que el titular no lleva); null si el ISO no es válido. */
export function fechaCompletaUtc(iso: string | undefined): string | null {
  const ms = iso === undefined ? NaN : Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** Interpreta la etiqueta de `etiquetaIntervalo` («< 10», «10–30», «≥ 500», «2,5–3»); null si no encaja (no se adivina nada). */
export function parsearIntervalo(etiqueta: string): { desde: string | null; hasta: string | null } | null {
  const t = etiqueta.trim();
  let m = /^<\s*(-?\d+(?:,\d+)?)$/.exec(t);
  if (m) return { desde: null, hasta: m[1] };
  m = /^≥\s*(-?\d+(?:,\d+)?)$/.exec(t);
  if (m) return { desde: m[1], hasta: null };
  m = /^(-?\d+(?:,\d+)?)\s*[–-]\s*(-?\d+(?:,\d+)?)$/.exec(t);
  if (m) return { desde: m[1], hasta: m[2] };
  return null;
}

/** «Intervalo [2 – 3)» / «Menos de 2» / «7 o más», con unidad opcional («km»). */
function textoIntervalo(etiqueta: string, unidad: string): string | null {
  const p = parsearIntervalo(etiqueta);
  if (!p) return null;
  const u = unidad ? ` ${unidad}` : '';
  if (p.desde === null) return `Menos de ${p.hasta}${u}`;
  if (p.hasta === null) return `${p.desde}${u} o más`;
  return `Intervalo [${p.desde} – ${p.hasta})${u}`;
}

/** Contenido del tooltip (y de la etiqueta accesible) de UNA barra. Un dato que falte se escribe «ND»: nunca se inventa. */
export function contenidoTooltip(tipo: TipoGrafica, item: ItemTip, extra: ExtraTip = {}): ContenidoTooltip {
  const unidad = extra.unidad ?? 'eventos';
  const etiqueta = item.etiqueta?.trim() ? item.etiqueta : 'ND';
  const valor = esNum(item.valor) ? formatoNum.format(item.valor) : 'ND';
  let categoria = etiqueta;
  const contexto: string[] = [];
  let color: string | null = null;

  if (tipo === 'hora') {
    // CAMBIO (análisis B): el titular es el formato limpio (sin la etiqueta antigua «11/11 10h»); la línea de contexto aporta solo lo que el titular no dice (día completo con año).
    const titular = titularHora(item.detalle);
    if (titular !== null) categoria = titular;
    const fecha = fechaCompletaUtc(item.detalle);
    contexto.push(fecha !== null ? `Fecha UTC: ${fecha}` : 'Fecha y hora UTC: ND');
  } else if (tipo === 'pais') {
    if (item.detalle === 'sin_pais') contexto.push('Eventos en el mar o sin polígono de país; no se asigna el país más cercano.');
    else if (/^Otros \(/.test(etiqueta)) contexto.push('Suma de los países que no caben como barra propia.');
    else if (item.detalle) contexto.push(`Código de país: ${item.detalle}`);
  } else if (tipo === 'magnitud') {
    categoria = `Magnitud ${etiqueta}`;
    contexto.push(textoIntervalo(etiqueta, '') ?? 'Intervalo: ND');
  } else if (tipo === 'profundidad') {
    categoria = `Profundidad ${etiqueta} km`;
    contexto.push(textoIntervalo(etiqueta, 'km') ?? 'Intervalo: ND');
    contexto.push(extra.rango ? `Rango: ${extra.rango}` : 'Sin rango de la leyenda (el intervalo cruza un corte)');
    color = extra.color ?? null;
  }
  if (esNum(item.valor) && esNum(extra.total) && extra.total > 0) contexto.push(`${formatoPct.format(item.valor / extra.total * 100)} % del total contado en esta gráfica`);
  const texto = `${categoria}: ${valor} ${unidad}. ${contexto.join('. ')}`.replace(/\.\s*$/, '.');
  return { categoria, valor, unidad, contexto, color, texto };
}

// ---------- posicionamiento ----------
export type Caja = { x: number; y: number; ancho: number; alto: number };
export type Tam = { ancho: number; alto: number };
export type PosicionTooltip = { x: number; y: number; lado: 'arriba' | 'abajo' | 'derecha' | 'izquierda' };

const acotar = (v: number, min: number, max: number) => Math.max(min, Math.min(v, Math.max(min, max)));

/**
 * Coloca el tooltip junto al ancla (coordenadas relativas al contenedor, en px). `arriba`: centrado sobre el ancla; si no cabe, debajo; si tampoco, arriba acotado.
 * `derecha`: a la derecha del ancla (centrado en vertical); si no cabe, a la izquierda; si tampoco, cae a la lógica de `arriba`.
 * Siempre se acota a [0, contenedor − tamaño] en cada eje; si el tooltip es mayor que el contenedor, queda alineado a 0 (nunca coordenadas negativas).
 */
export function posicionarTooltip(ancla: Caja, tam: Tam, cont: Tam, separacion: number, preferencia: 'arriba' | 'derecha' = 'arriba'): PosicionTooltip {
  // Acotado final por si el ancla cae fuera del contenedor (p. ej. barra desplazada fuera de vista por el scroll del lienzo).
  const redondear = (p: PosicionTooltip): PosicionTooltip => ({ ...p, x: Math.round(acotar(p.x, 0, cont.ancho - tam.ancho)), y: Math.round(acotar(p.y, 0, cont.alto - tam.alto)) });
  if (preferencia === 'derecha') {
    const y = acotar(ancla.y + ancla.alto / 2 - tam.alto / 2, 0, cont.alto - tam.alto);
    const xDer = ancla.x + ancla.ancho + separacion;
    if (xDer + tam.ancho <= cont.ancho) return redondear({ x: xDer, y, lado: 'derecha' });
    const xIzq = ancla.x - separacion - tam.ancho;
    if (xIzq >= 0) return redondear({ x: xIzq, y, lado: 'izquierda' });
  }
  const x = acotar(ancla.x + ancla.ancho / 2 - tam.ancho / 2, 0, cont.ancho - tam.ancho);
  const yArriba = ancla.y - separacion - tam.alto;
  if (yArriba >= 0) return redondear({ x, y: yArriba, lado: 'arriba' });
  const yAbajo = ancla.y + ancla.alto + separacion;
  if (yAbajo + tam.alto <= cont.alto) return redondear({ x, y: yAbajo, lado: 'abajo' });
  return redondear({ x, y: acotar(yArriba, 0, cont.alto - tam.alto), lado: 'arriba' });
}

// ---------- teclado (roving tabindex) ----------
/**
 * Índice de la barra activa tras pulsar `tecla`; null si la tecla no navega (no hay que impedir su comportamiento) o no hay barras.
 * Gráfica vertical: ← →; horizontal (países): ↑ ↓; Inicio/Fin en ambas. Sin vuelta al principio: en los extremos se queda donde está.
 */
export function indiceSiguiente(actual: number | null, n: number, tecla: string, horizontal: boolean): number | null {
  if (!(n > 0)) return null;
  const base = actual === null || !Number.isInteger(actual) ? 0 : Math.max(0, Math.min(actual, n - 1));
  if (tecla === 'Home') return 0;
  if (tecla === 'End') return n - 1;
  const [ant, sig] = horizontal ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
  if (tecla === ant) return Math.max(0, base - 1);
  if (tecla === sig) return Math.min(n - 1, base + 1);
  return null;
}
