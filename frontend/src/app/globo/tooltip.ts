// Globo 3D (F7, 3.ª iteración): lógica PURA de la etiqueta flotante («tooltip») al pasar el ratón sobre un terremoto. Sin three, sin DOM, sin imports en ejecución.
// La búsqueda del evento NO se reimplementa: escena.ts reutiliza seleccionarPorRayo (misma función y umbral que el clic, y sin eventos de la cara oculta).
// Aquí solo se decide: el texto, CUÁNDO se puede calcular (ratón fino, sin arrastre ni zoom ni transición) y CUÁNTO se espera entre cálculos (throttle).

/** Intervalo mínimo entre dos cálculos de búsqueda (ms): como mucho ≈ 16 por segundo (nunca más de uno por fotograma). */
export const INTERVALO_TOOLTIP_MS = 60;
/** Separación (px) entre el cursor y la etiqueta. */
export const SEPARACION_TOOLTIP_PX = 14;

/** Texto de la etiqueta: «lugar · M magnitud», con «ND» si falta alguno (lugar vacío/no texto o magnitud no numérica). Se asigna siempre con textContent. */
export function textoTooltip(lugar: unknown, magnitud: unknown): string {
  const l = typeof lugar === 'string' && lugar.trim() !== '' ? lugar.trim() : 'ND';
  const m = typeof magnitud === 'number' && Number.isFinite(magnitud) ? String(magnitud) : 'ND';
  return `${l} · M ${m}`;
}

export interface ContextoTooltip {
  /** PointerEvent.pointerType: solo 'mouse' muestra etiqueta (táctil y lápiz no tienen «pasar por encima»). */
  tipoPuntero: string;
  /** `(hover: hover) and (pointer: fine)` en el dispositivo. */
  hoverFino: boolean;
  /** Hay un puntero pulsado (arrastre o pellizco). */
  punteroAbajo: boolean;
  /** La cámara está en transición (selección, región, restauración). */
  transicionActiva: boolean;
  /** Zoom en curso (rueda con Ctrl o botones, durante un instante). */
  zoomEnCurso: boolean;
  /** El puntero está dentro del lienzo. */
  dentro: boolean;
  /** Vista 3D oculta, pestaña oculta o fuera de pantalla. */
  enPausa: boolean;
}

/** ¿Se puede calcular (y mostrar) la etiqueta ahora? Falso en táctil, con arrastre, zoom, transición, fuera del lienzo o en pausa: entonces no se hace ningún trabajo. */
export function tooltipPermitido(c: ContextoTooltip): boolean {
  return c.tipoPuntero === 'mouse' && c.hoverFino && c.dentro && !c.punteroAbajo && !c.transicionActiva && !c.zoomEnCurso && !c.enPausa;
}

/** Throttle con cálculo final: ms que faltan para poder calcular (0 = ya se puede). Con ultimoMs = -Infinity siempre es 0. */
export function esperaTooltipMs(ahora: number, ultimoMs: number, intervalo: number = INTERVALO_TOOLTIP_MS): number {
  return Math.max(0, intervalo - (ahora - ultimoMs));
}

/**
 * Posición (px, relativa al lienzo) de la esquina de la etiqueta: a la derecha y debajo del cursor; si no cabe se voltea al otro lado y, en último caso, se acota para que
 * NUNCA se salga del escenario (si es más grande que el escenario se pega a la esquina superior izquierda). Todas las medidas en píxeles.
 */
export function posicionarTooltip(cursorX: number, cursorY: number, ancho: number, alto: number, anchoTip: number, altoTip: number, separacion: number = SEPARACION_TOOLTIP_PX): { x: number; y: number } {
  let x = cursorX + separacion;
  if (x + anchoTip > ancho) x = cursorX - separacion - anchoTip;
  let y = cursorY + separacion;
  if (y + altoTip > alto) y = cursorY - separacion - altoTip;
  return { x: Math.max(0, Math.min(x, ancho - anchoTip)), y: Math.max(0, Math.min(y, alto - altoTip)) };
}
