// Globo 3D (F7, 4.ª iteración · mejora 1): posición del Sol y constantes del sombreado día/noche. Módulo PURO: sin three, sin DOM, sin imports en ejecución (se prueba con
// `node --test`). El sombreado en sí se calcula en el shader del planeta (escena.ts); aquí solo se decide DÓNDE está el Sol y cuánto oscurece la noche.
//
// Modelo: Spencer (1971), la serie de Fourier que usa la calculadora solar de la NOAA:
//   γ = 2π/N · (día_del_año − 1 + (hora_UTC − 12)/24)            (N = 365 o 366 días)
//   declinación δ = 0,006918 − 0,399912·cosγ + 0,070257·sinγ − 0,006758·cos2γ + 0,000907·sin2γ − 0,002697·cos3γ + 0,00148·sin3γ      (rad)
//   ecuación del tiempo E (min) = 229,18·(0,000075 + 0,001868·cosγ − 0,032077·sinγ − 0,014615·cos2γ − 0,040849·sin2γ)
//   punto subsolar: latitud = δ,  longitud = −15°·(hora_UTC − 12) − E/4   (15°/h; E en minutos de tiempo = E/4 grados)
// Precisión: el error de δ es < 0,001 rad (≈ 0,06°) y el de E < 1 min (≈ 0,25° de longitud); sin contar la refracción ni la nutación. Para un terminador SUAVE de ±10° sobra:
// el error total es muy inferior a 1°.
//
// IMPORTANTE (REPRODUCCIÓN): el reloj es SIEMPRE el UTC real actual (Date.now()), también en el modo REPRODUCCIÓN. El terminador es AMBIENTAL: no representa el instante de los
// eventos (que pueden ser de otra fecha). El texto de ayuda lo dice.

export type Vec3 = [number, number, number];
export interface PosicionSolar {
  /** Latitud del punto subsolar (grados, = declinación solar). */
  latitud: number;
  /** Longitud del punto subsolar (grados, en [−180, 180]; este positivo). */
  longitud: number;
  /** Ecuación del tiempo (minutos): aparente − media. Solo informativa (pruebas y documentación). */
  ecuacionTiempoMin: number;
}

/** Ancho del crepúsculo a cada lado del terminador (grados de elevación solar): la transición día→noche es un smoothstep de −10° a +10°. */
export const CREPUSCULO_GRADOS = 10;
/**
 * Oscurecimiento máximo de la noche (fracción multiplicativa en espacio LINEAL de color): 0,5 = el lado nocturno recibe el 50 % de la luminosidad de la textura. Es un valor
 * moderado a propósito: continentes, costas y la retícula (que va en la textura) siguen legibles; no es negro. Las fronteras 3D (LineSegments) no se oscurecen.
 */
export const OSCURECIMIENTO_NOCHE = 0.5;
/** Seno del ancho del crepúsculo: el shader hace smoothstep(−SEN, +SEN, elevación solar), con elevación = producto escalar normal·Sol. */
export const SEN_CREPUSCULO = Math.sin((CREPUSCULO_GRADOS * Math.PI) / 180);
/**
 * Tinte cálido muy discreto en el centro de la banda del crepúsculo: mezcla máxima (0–1) hacia el multiplicador (1,3; 1; 0,75), es decir ≈ +10 % de rojo y −9 % de azul en el
 * punto más intenso. Es multiplicativo (no suma luz): no aclara ni oculta nada. 0 lo apaga.
 */
export const TINTE_TERMINADOR = 0.35;
/** El Sol se recalcula como mucho cada 60 s (a 15°/h se mueve 0,25° por minuto). */
export const INTERVALO_SOL_MS = 60_000;
/** Solo se vuelve a dibujar si el Sol se movió más de esto (grados). */
export const UMBRAL_CAMBIO_SOLAR_GRADOS = 0.05;

const RAD = Math.PI / 180;
const MS_DIA = 86_400_000;

function esBisiesto(a: number): boolean { return (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0; }

/** Normaliza una longitud a [−180, 180). */
export function normalizarLongitud(grados: number): number { return ((((grados + 180) % 360) + 360) % 360) - 180; }

/** Posición del Sol para un instante UTC (milisegundos desde la época o `Date`). Un instante no válido devuelve el punto (0°, 0°) en lugar de NaN. */
export function posicionSolar(fechaUtc: number | Date): PosicionSolar {
  const ms = typeof fechaUtc === 'number' ? fechaUtc : fechaUtc.getTime();
  if (!Number.isFinite(ms)) return { latitud: 0, longitud: 0, ecuacionTiempoMin: 0 };
  const anio = new Date(ms).getUTCFullYear();
  const dias = (ms - Date.UTC(anio, 0, 1)) / MS_DIA;                     // 0 = 1 de enero 00:00 UTC; la parte entera es (día del año − 1)
  const g = ((2 * Math.PI) / (esBisiesto(anio) ? 366 : 365)) * (dias - 0.5); // día − 1 + (hora − 12)/24 = dias − 0,5
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ecuacion = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const horasUtc = (dias - Math.floor(dias)) * 24;
  return { latitud: decl / RAD, longitud: normalizarLongitud(-15 * (horasUtc - 12) - ecuacion / 4), ecuacionTiempoMin: ecuacion };
}

/**
 * Vector unitario del Sol en la convención de coordenadas del globo (geometria.ts · latLonAXyz: Y = norte, (lat 0, lon 0) = +Z, este = +X). Es la misma fórmula, repetida aquí
 * porque este módulo no puede importar a sus vecinos (node --test); una prueba comprueba que coincide con latLonAXyz. El shader la compara con la normal GEOGRÁFICA de cada
 * fragmento (la de la esfera en el sistema del mundo, no la de la vista): por eso el día/noche NO gira con la cámara, solo con el Sol.
 */
export function vectorSolar(p: Pick<PosicionSolar, 'latitud' | 'longitud'>): Vec3 {
  const phi = p.latitud * RAD; const lam = p.longitud * RAD; const c = Math.cos(phi);
  return [c * Math.sin(lam), Math.sin(phi), c * Math.cos(lam)];
}

/** Ángulo (grados) entre dos vectores unitarios. */
export function cambioAngularGrados(a: Vec3, b: Vec3): number {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.max(-1, Math.min(1, d))) / RAD;
}

/**
 * Espejo en JS del sombreado del shader (para las pruebas): factor de luminosidad (1 = día pleno, 1 − OSCURECIMIENTO_NOCHE = noche plena) de un punto cuya normal geográfica forma
 * con el Sol un ángulo cuyo coseno es `cosSol` (= elevación solar: sen(elevación)).
 */
export function factorNoche(cosSol: number): number {
  const a = -SEN_CREPUSCULO; const b = SEN_CREPUSCULO;
  const t = Math.max(0, Math.min(1, (cosSol - a) / (b - a)));
  const noche = 1 - t * t * (3 - 2 * t);
  return 1 - OSCURECIMIENTO_NOCHE * noche;
}
