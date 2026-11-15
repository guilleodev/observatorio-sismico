// Globo 3D (F8 · mejoras visuales, Bloque A): «vida» de los marcadores. Módulo PURO: sin three, sin DOM, sin imports en ejecución (se prueba con `node --test`).
// Tres efectos, todos calculados en el shader con UNOS POCOS uniforms comunes (nada por evento en JavaScript ni por fotograma salvo uEdadExtra y uEntrada):
//  1. FRESCURA: cada marcador sabe su edad (horas). Lo reciente se ve a opacidad plena y lo antiguo baja hasta ALFA_MIN_ANTIGUO. NUNCA se toca el color (la profundidad) ni el tamaño (la
//     magnitud): solo la opacidad, y con un suelo alto para que el contraste del marcador siga siendo legible (invariante 3 del proyecto: marcadores ≥ 3:1).
//  2. RESPLANDOR: los eventos muy recientes llevan un halo estático tenue (en reposo, sin animación; no depende del movimiento reducido).
//  3. ENTRADA: al cargar los primeros datos los marcadores aparecen escalonados durante DURACION_ENTRADA_MS (movimiento reducido: sin animación).
// La frescura y el resplandor solo tienen sentido con datos EN VIVO: con REPRODUCCIÓN (hora histórica) o con un periodo histórico todos los eventos son «antiguos» y el efecto sería atenuar
// todo por igual sin aportar información; por eso se desactivan (uVivo = 0) salvo que haya al menos un evento de las últimas HORAS_VENTANA_VIVO horas.

/** Constante de tiempo de la frescura (horas): frescura = exp(−edad / HORAS_FRESCURA). A 10 h ≈ 0,37; a 24 h ≈ 0,09. */
export const HORAS_FRESCURA = 10;
/** Opacidad mínima de un marcador antiguo (0–1). Alta a propósito: no se esconde nada, solo se jerarquiza. */
export const ALFA_MIN_ANTIGUO = 0.72;
/** Frescura a partir de la cual empieza el resplandor y frescura a la que llega a su máximo (smoothstep). 0,7 ≈ 3,6 h; 0,95 ≈ 0,5 h. */
export const FRESCURA_RESPLANDOR_DESDE = 0.7;
export const FRESCURA_RESPLANDOR_HASTA = 0.95;
/** Opacidad máxima del resplandor y anchura (en «radios de disco», dentro del polígono ampliado ESCALA_QUAD = 1,15 de pulso.ts). */
export const ALFA_RESPLANDOR = 0.22;
export const ANCHO_RESPLANDOR = 0.12;
/** Horas: la frescura se activa si hay algún evento con menos de esta edad (el feed en vivo cubre 24 h; margen para el retraso de publicación). */
export const HORAS_VENTANA_VIVO = 26;
/** Duración de la entrada escalonada (ms) y fracción del tiempo que se reparte entre marcadores (el resto es la duración de cada aparición). */
export const DURACION_ENTRADA_MS = 1200;
export const REPARTO_ENTRADA = 0.55;
/** Escala mínima con la que empieza a aparecer un marcador (se agranda hasta 1 mientras gana opacidad). */
export const ESCALA_ENTRADA_MIN = 0.6;
/**
 * «Respiración» (animación leve de todos los marcadores): con la MISMA fase global y el mismo hash por instancia que el pulso de los M ≥ 5 (pulso.ts) y el mismo uniform de amplitud
 * (uAmp = 0 con movimiento reducido). El tamaño oscila ±RESPIRACION_ESCALA (±4 %: la magnitud sigue leyéndose igual) y el resplandor de lo reciente entre RESPIRACION_RESPLANDOR_MIN y 1.
 */
export const RESPIRACION_ESCALA = 0.04;
export const RESPIRACION_RESPLANDOR_MIN = 0.55;

/** Valor de `aEdad` para un evento sin hora válida: el shader no le aplica frescura ni resplandor. */
export const EDAD_DESCONOCIDA = -1;

const MS_POR_HORA = 3_600_000;

/** Edad en horas de un evento (≥ 0) o EDAD_DESCONOCIDA si no hay hora válida. `ahoraMs` y `tiempoMs` en milisegundos Unix. */
export function edadEnHoras(ahoraMs: number, tiempoMs: number): number {
  if (!Number.isFinite(ahoraMs) || !Number.isFinite(tiempoMs)) return EDAD_DESCONOCIDA;
  return Math.max(0, (ahoraMs - tiempoMs) / MS_POR_HORA);
}

/** Frescura 0–1 (1 = recién llegado). Espejo en JS del shader (para las pruebas). */
export function frescura(edadHoras: number): number {
  if (!(edadHoras >= 0)) return 0;
  return Math.exp(-edadHoras / HORAS_FRESCURA);
}

/** Factor de opacidad por antigüedad (ALFA_MIN_ANTIGUO … 1). Espejo del shader. */
export function factorOpacidad(edadHoras: number): number {
  if (!(edadHoras >= 0)) return 1;                                  // sin hora: sin cambio
  return ALFA_MIN_ANTIGUO + (1 - ALFA_MIN_ANTIGUO) * frescura(edadHoras);
}

/** Intensidad 0–1 del resplandor según la edad (smoothstep entre las dos frescuras). Espejo del shader. */
export function intensidadResplandor(edadHoras: number): number {
  if (!(edadHoras >= 0)) return 0;
  const x = Math.min(1, Math.max(0, (frescura(edadHoras) - FRESCURA_RESPLANDOR_DESDE) / (FRESCURA_RESPLANDOR_HASTA - FRESCURA_RESPLANDOR_DESDE)));
  return x * x * (3 - 2 * x);
}

/** ¿Hay algún evento de las últimas HORAS_VENTANA_VIVO horas? Decide si se aplican la frescura y el resplandor (datos en vivo). */
export function hayDatosEnVivo(tiempos: ArrayLike<number> | undefined, n: number, ahoraMs: number): boolean {
  if (!tiempos) return false;
  const limite = ahoraMs - HORAS_VENTANA_VIVO * MS_POR_HORA;
  for (let i = 0; i < n; i++) { const t = tiempos[i]; if (Number.isFinite(t) && t >= limite) return true; }
  return false;
}

/** Progreso 0–1 de la entrada a los `transcurridoMs` desde que llegaron los primeros datos. Con movimiento reducido no hay animación (siempre 1). */
export function progresoEntrada(transcurridoMs: number, movimientoReducido: boolean): number {
  if (movimientoReducido || !(transcurridoMs >= 0)) return 1;
  return Math.min(1, transcurridoMs / DURACION_ENTRADA_MS);
}

/** Aparición 0–1 de un marcador con `hash` 0–1 (su orden escalonado) para un progreso global dado. Espejo del shader: smoothstep(hash·R, hash·R + (1 − R), progreso). */
export function aparicionMarcador(progreso: number, hash: number): number {
  const a = hash * REPARTO_ENTRADA; const b = a + (1 - REPARTO_ENTRADA);
  const x = Math.min(1, Math.max(0, (progreso - a) / (b - a)));
  return x * x * (3 - 2 * x);
}
