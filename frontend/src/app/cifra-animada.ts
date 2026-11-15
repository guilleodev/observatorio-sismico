// F8 · mejoras visuales, Bloque D: lógica PURA del contador animado de los KPI y del reloj UTC. Sin imports en ejecución (se prueba con `node --test`).
// El contador solo anima ENTEROS sencillos («185», «8»): cualquier otro texto («ND», «M 5.5», «1.234») se muestra tal cual, al instante. Con movimiento reducido no hay animación.

/** Duración de la cuenta (ms). Corta: el dato real ya está en el DOM (texto oculto para lectores); la animación es solo visual. */
export const DURACION_CIFRA_MS = 700;
/** Tope de los enteros que se animan (más grandes se muestran directos: no tiene sentido «contar» millones). */
export const MAX_ENTERO_ANIMADO = 100_000;

/** Devuelve el entero si `texto` es un entero decimal sin separadores (0 … MAX_ENTERO_ANIMADO); si no, null. */
export function enteroAnimable(texto: string | number | null | undefined): number | null {
  const t = typeof texto === 'number' ? (Number.isInteger(texto) ? String(texto) : '') : (texto ?? '');
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = Number(t);
  return n <= MAX_ENTERO_ANIMADO ? n : null;
}

/** Progreso 0–1 con ease-out cúbico a los `transcurridoMs`. Valores no válidos → 1 (se muestra el final). */
export function progresoCifra(transcurridoMs: number): number {
  if (!(transcurridoMs >= 0)) return 1;
  const p = Math.min(1, transcurridoMs / DURACION_CIFRA_MS);
  return 1 - Math.pow(1 - p, 3);
}

/** Valor entero intermedio entre `desde` y `hasta` para un progreso 0–1 (siempre dentro del intervalo y llega exactamente a `hasta` con p = 1). */
export function valorIntermedio(desde: number, hasta: number, p: number): number {
  if (!(p < 1)) return hasta;
  if (!(p > 0)) return desde;
  return Math.round(desde + (hasta - desde) * p);
}

/** Hora UTC como «HH:MM» (24 h) de un instante en ms Unix; entrada no válida → «--:--». */
export function formatearHoraUtc(ms: number): string {
  if (!Number.isFinite(ms)) return '--:--';
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
