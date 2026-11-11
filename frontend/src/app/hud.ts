// Lógica PURA de los paneles flotantes (HUD) del Panel (F7, ronda 2 «Mission Control»). Sin DOM ni almacenamiento: solo números y decisiones, para poder probarla con `node --test`.
// El CSS (app.component.css) usa los mismos puntos de corte y anchos; las pruebas (tests/ronda2-panel.test.ts) comprueban que ambos lados coinciden.

/** Por debajo de este ancho de ventana NO hay HUD flotante: el Panel se apila (tablet y móvil). */
export const ANCHO_MIN_HUD = 1100;
/** Desde este ancho los paneles flotantes arrancan ABIERTOS; entre ANCHO_MIN_HUD y este valor arrancan colapsados para no tapar la esfera. */
export const ANCHO_HUD_ABIERTO = 1440;
/** Reserva lateral (px) de cada HUD ABIERTO medida desde el borde del escenario: margen 12 + panel 280 (izquierdo) y margen 12 + pila 308 (derecho). */
export const RESERVA_HUD_IZQ = 292;
export const RESERVA_HUD_DER = 320;
/** Relación entre el diámetro aproximado de la esfera y el alto del escenario (la escena la encuadra con margen: ≈ 0,78 del alto). */
export const FACTOR_ESFERA = 0.78;

export interface HudAbierto { filtros: boolean; derecha: boolean }

/** ¿Hay HUD flotante con este ancho de ventana (px)? */
export function hayHudFlotante(ancho: number): boolean {
  return Number.isFinite(ancho) && ancho >= ANCHO_MIN_HUD;
}

/**
 * Estado inicial (abierto/colapsado) de los dos HUD según el ancho de la ventana: abiertos desde 1440 px; colapsados por debajo (en < 1100 px el HUD no existe y el estado solo
 * decide si la barra-resumen de filtros de móvil empieza plegada: sí). Solo se evalúa al crear la página: el estado posterior es de la persona (señal en memoria).
 */
export function hudPorDefecto(ancho: number): HudAbierto {
  const abiertos = Number.isFinite(ancho) && ancho >= ANCHO_HUD_ABIERTO;
  return { filtros: abiertos, derecha: abiertos };
}

/** Ancho libre (px) entre los dos HUD abiertos dentro de un escenario de `anchoEscenario` px. Nunca negativo. */
export function anchoLibreCentral(anchoEscenario: number, izqAbierto = true, derAbierto = true): number {
  const reservado = (izqAbierto ? RESERVA_HUD_IZQ : 0) + (derAbierto ? RESERVA_HUD_DER : 0);
  return Math.max(0, anchoEscenario - reservado);
}

/** Diámetro aproximado de la esfera para un escenario de `altoEscenario` px de alto. */
export function diametroEsfera(altoEscenario: number): number {
  return Math.round(FACTOR_ESFERA * Math.max(0, altoEscenario));
}

/** Criterio de «no tapar la esfera»: el hueco central es ≥ 62 % del ancho del escenario O el diámetro de la esfera cabe en él. */
export function esferaDespejada(anchoEscenario: number, altoEscenario: number, izqAbierto = true, derAbierto = true): boolean {
  const libre = anchoLibreCentral(anchoEscenario, izqAbierto, derAbierto);
  return libre >= 0.62 * anchoEscenario || diametroEsfera(altoEscenario) <= libre;
}
