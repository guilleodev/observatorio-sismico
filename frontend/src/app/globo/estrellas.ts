// Globo 3D (F7, 4.ª iteración · mejora 3): estrellas tenues de fondo. Módulo PURO: sin three, sin DOM, sin imports en ejecución (se prueba con `node --test`).
// Genera, con un PRNG determinista de semilla fija, las posiciones, el tamaño y el brillo de unas pocas estrellas sobre una esfera grande. escena.ts las dibuja con UN solo
// THREE.Points (una draw call, creado una vez, sin animación: no pide fotogramas y no necesita rama de movimiento reducido).
//
// Decisiones:
//  · Cantidad baja (450): se ven como un polvo muy sutil, no como un cielo cargado.
//  · Radio 10 (el planeta mide 1; la cámara orbita entre 1,25 y 6): ninguna estrella puede quedar entre la cámara y el planeta, y el far plane (20) las cubre siempre (10 + 6 < 20).
//    Con depthTest activo el planeta las tapa; con depthWrite desactivado no tapan nada (ni atmósfera, ni marcadores, ni anillos).
//  · Brillo bajo (0,12–0,42 de opacidad, color --texto-2 del tema) y tamaño de 1 a 2 px: contraste muy bajo, no compiten con los marcadores ni con el texto HTML superpuesto.
//  · NO se atenúan «cerca del centro»: las estrellas están fijas en el mundo y la cámara gira, así que no hay un «centro» estable; la baja densidad y el brillo bajo bastan.
//  · No forman parte del índice de selección (seleccionarPorRayo solo recibe los eventos): no interfieren con el clic, el tooltip ni la selección.

export const CANTIDAD_ESTRELLAS = 450;
export const SEMILLA_ESTRELLAS = 20_261_110;
export const RADIO_ESTRELLAS = 10;
export const BRILLO_MIN = 0.12;
export const BRILLO_MAX = 0.42;
export const TAMANO_MIN_PX = 1;
export const TAMANO_MAX_PX = 2;

export interface DatosEstrellas {
  /** 3 floats por estrella: posición sobre la esfera de radio `radio`. */
  posiciones: Float32Array;
  /** 2 floats por estrella: [tamaño en px CSS, brillo (opacidad 0–1)]. */
  propiedades: Float32Array;
  cantidad: number;
}

/** PRNG mulberry32: determinista, rápido y suficiente para un fondo decorativo. Devuelve valores en [0, 1). */
export function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Estrellas repartidas de forma UNIFORME sobre la esfera (z uniforme en [−1, 1] y azimut uniforme: sin acumulación en los polos). La misma semilla da siempre el mismo resultado. */
export function generarEstrellas(cantidad: number = CANTIDAD_ESTRELLAS, semilla: number = SEMILLA_ESTRELLAS, radio: number = RADIO_ESTRELLAS): DatosEstrellas {
  const n = Math.max(0, Math.floor(cantidad));
  const rnd = mulberry32(semilla);
  const posiciones = new Float32Array(n * 3); const propiedades = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const z = 2 * rnd() - 1; const fi = 2 * Math.PI * rnd(); const r = Math.sqrt(1 - z * z);
    posiciones[3 * i] = radio * r * Math.cos(fi); posiciones[3 * i + 1] = radio * z; posiciones[3 * i + 2] = radio * r * Math.sin(fi);
    const u = rnd(); const v = rnd();
    propiedades[2 * i] = TAMANO_MIN_PX + (TAMANO_MAX_PX - TAMANO_MIN_PX) * v;
    propiedades[2 * i + 1] = BRILLO_MIN + (BRILLO_MAX - BRILLO_MIN) * u * u;     // u² : pocas más brillantes, la mayoría muy tenues
  }
  return { posiciones, propiedades, cantidad: n };
}
