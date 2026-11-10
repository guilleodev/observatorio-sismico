// Globo 3D (F7, 3.ª iteración): constantes y lógica PURA de la «pulsación» de los marcadores (un halo tenue que respira alrededor del disco). Sin three, sin DOM, sin
// imports en ejecución. El efecto se calcula ENTERO en el shader de los marcadores con un uniform de fase común (`uFase`); aquí solo se decide cuánto, cuándo y a quién.
//
// Política (decisiones):
//  · Qué pulsa: los terremotos de magnitud >= UMBRAL_MAG_PULSO (los significativos). Se eligió la magnitud y no la antigüedad porque no necesita datos ni atributos nuevos
//    (la magnitud ya está en PuntosGlobo) y porque en REPRODUCCIÓN «reciente» no tendría sentido. Como las instancias se ordenan de mayor a menor radio (monótono con la magnitud),
//    los que pulsan son las PRIMERAS `nPulsantes` instancias: el shader solo compara su índice con un uniform (`uNPulso`); no hay atributo, ni buffer, ni trabajo por evento en JS.
//  · Cuánto: el disco relleno NO cambia (ni tamaño ni color); solo un halo EXTERIOR de hasta AMPLITUD_HALO del radio (12 %) y opacidad máxima ALFA_HALO. Periodo lento (3,5 s).
//  · Fase: por instancia, derivada de un hash de su índice en el shader (se ven «latir» a ritmos distintos, no todos a la vez, lo que resulta más natural y menos llamativo).
//  · Cuándo: `prefers-reduced-motion` la desactiva (amplitud 0). El botón «Pausar rotación» NO la detiene por defecto (es ambiental y casi imperceptible; la persona controla el
//    movimiento principal), salvo que PULSO_SIGUE_PAUSA_ROTACION = true. Sin vista 3D, con la pestaña oculta o fuera de pantalla, escena.ts no dibuja nada (pausa total).
//  · Coste: con pulsación activa escena.ts dibuja a ≈ 25 fps (INTERVALO_PULSO_MS); sin pulsación y en reposo el bucle se PARA (cero trabajo).

/** Magnitud mínima de los terremotos que pulsan. */
export const UMBRAL_MAG_PULSO = 5;
/** Periodo de la pulsación (s): lento. */
export const PERIODO_PULSO_S = 3.5;
/** Extensión máxima del halo respecto al radio del disco (fracción: 0,12 = 12 %). Dentro del 10–15 % pedido. */
export const AMPLITUD_HALO = 0.12;
/** Opacidad máxima del halo (en el pico de la pulsación). El halo se pinta con el color del borde (--punto-borde); aun en su pico, y con dos halos superpuestos, el borde del disco conserva >= 3:1 frente a lo que lo rodea (ver pruebas). */
export const ALFA_HALO = 0.22;
/**
 * El polígono del marcador (CircleGeometry de 32 segmentos, radio 1) se amplía a este factor para que quepa el halo SIN cambiar el tamaño del disco (el shader reescala
 * el radio). Debe cumplir ESCALA_QUAD·cos(π/32) > 1 + AMPLITUD_HALO (el borde del polígono no recorta el halo): 1,15·0,9952 = 1,1445 > 1,12.
 */
export const ESCALA_QUAD = 1.15;
/** Mientras solo se anima la pulsación se dibuja como mucho cada 40 ms (≈ 25 fps): el cambio es lentísimo y no compensa el coste de 60 fps. */
export const INTERVALO_PULSO_MS = 40;
/** Si es true, «Pausar rotación» también detiene la pulsación (WCAG 2.2.2: contenido que se mueve más de 5 s debería poder pausarse). Por defecto false (ver política). */
export const PULSO_SIGUE_PAUSA_ROTACION = false;

const DOS_PI = 2 * Math.PI;

/** Fase global (rad, en [0, 2π)) del instante `tMs`: el uniform `uFase`. Se reduce módulo el periodo para que la precisión no se degrade con sesiones largas y no haya saltos. */
export function faseGlobal(tMs: number, periodoS: number = PERIODO_PULSO_S): number {
  if (!Number.isFinite(tMs) || !(periodoS > 0)) return 0;
  const ms = periodoS * 1000;
  return ((((tMs % ms) + ms) % ms) / ms) * DOS_PI;
}

/** Factor de pulsación (0–1) de una instancia: espejo en JS del shader, 0,5 + 0,5·sin(fase + 2π·hash). `hash` en [0, 1). */
export function factorPulso(fase: number, hash: number): number { return 0.5 + 0.5 * Math.sin(fase + DOS_PI * hash); }

/** Amplitud efectiva: 0 con movimiento reducido o sin eventos pulsantes; 1 en otro caso. Es lo que recibe el shader (`uAmp`). */
export function amplitudPulso(movimientoReducido: boolean, nPulsantes: number): 0 | 1 { return movimientoReducido || !(nPulsantes > 0) ? 0 : 1; }

/** Cuántas instancias pulsan: las que, desde el principio de la lista ya ordenada por radio, cumplen magnitud >= umbral (se cuenta hasta el primer fallo; NaN no cumple). */
export function contarPulsantes(magnitudes: ArrayLike<number>, n: number, umbral: number = UMBRAL_MAG_PULSO): number {
  let k = 0;
  while (k < n && magnitudes[k] >= umbral) k++;
  return k;
}

export interface EntornoPulso { movimientoReducido: boolean; nPulsantes: number; enPausa: boolean; rotacionActiva: boolean }

/** ¿Hay que mantener el bucle de fotogramas por la pulsación? Solo si hay pulsantes, no hay movimiento reducido, la vista está activa y (opcionalmente) la rotación no está pausada. */
export function hayPulso(e: EntornoPulso): boolean {
  if (e.enPausa || amplitudPulso(e.movimientoReducido, e.nPulsantes) === 0) return false;
  return !PULSO_SIGUE_PAUSA_ROTACION || e.rotacionActiva;
}

// ---------- contraste del borde con el halo (WCAG 1.4.11) ----------------------------------------------------------------------------------------------
/** Mezcla en sRGB (la mezcla del framebuffer se hace sobre valores ya codificados) de `frente` sobre `fondo` con opacidad `alfa`. Devuelve #rrggbb. */
export function mezclarSrgb(fondo: string, frente: string, alfa: number): string {
  const c = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  const canal = (i: number) => Math.round(c(fondo, i) * (1 - alfa) + c(frente, i) * alfa).toString(16).padStart(2, '0');
  return `#${canal(0)}${canal(1)}${canal(2)}`;
}

/** Opacidad acumulada de `k` halos superpuestos (marcadores vecinos): 1 − (1 − α)^k. */
export function alfaAcumulada(k: number, alfa: number = ALFA_HALO): number { return 1 - Math.pow(1 - alfa, k); }
