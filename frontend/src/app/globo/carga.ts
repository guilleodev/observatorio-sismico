// Globo 3D (F7, 4.ª iteración · mejora 6): fases REALES de la carga del globo y política de visibilidad del indicador. Módulo PURO: sin three, sin DOM, sin temporizadores propios,
// sin imports en ejecución (se prueba con `node --test` y tiempo simulado). El componente avanza la máquina cuando las promesas reales terminan (nada se simula con temporizadores)
// y la escena avisa de sus fases con el callback `alFase`.
//
// Fases (en el orden en que ocurren de verdad en globo.component.ts):
//   idle → descargando (import() dinámico del chunk con three) → inicializando (renderer WebGL, escena, buffers) → textura (datos de países + textura del planeta) → listo
//   cualquier fase no terminal → error. `listo` y `error` son terminales: no se sale de ellas (un reintento crearía otra máquina).
// DESVIACIÓN respecto al orden «descargando → textura → inicializando» del encargo: la textura necesita el renderer (MAX_TEXTURE_SIZE) y los datos de países llegan por fetch
// DESPUÉS de crear la escena, así que lo real es inicializando → textura. Se muestra lo que de verdad está pasando.
// El fallo de las fronteras NO es un error de carga: la esfera lisa funciona y el componente avanza igualmente a `listo`.

export type FaseCarga = 'idle' | 'descargando' | 'inicializando' | 'textura' | 'listo' | 'error';

export const TRANSICIONES_CARGA: Readonly<Record<FaseCarga, readonly FaseCarga[]>> = {
  idle: ['descargando', 'error'],
  descargando: ['inicializando', 'error'],
  inicializando: ['textura', 'listo', 'error'],
  textura: ['listo', 'error'],
  listo: [],
  error: [],
};

/** Texto visible (y anunciado) de cada fase de trabajo; null en las que no muestran indicador. Sin porcentajes: no se conoce el progreso real. */
export const TEXTO_FASE: Readonly<Record<FaseCarga, string | null>> = {
  idle: null,
  descargando: 'Descargando el motor 3D…',
  inicializando: 'Iniciando WebGL…',
  textura: 'Preparando el planeta…',
  listo: null,
  error: null,
};

/** Retardo antes de mostrar el indicador: una carga rápida no produce un parpadeo. */
export const DEMORA_MOSTRAR_MS = 180;
/** Una vez mostrado, permanece al menos esto (sin destello de «aparece y desaparece»). */
export const MIN_PERMANENCIA_MS = 300;

export function esFaseTerminal(f: FaseCarga): boolean { return f === 'listo' || f === 'error'; }
/** ¿Está trabajando? (descargando, inicializando o textura): es lo que pone aria-busy. */
export function estaCargando(f: FaseCarga): boolean { return f === 'descargando' || f === 'inicializando' || f === 'textura'; }
export function transicionValida(desde: FaseCarga, hasta: FaseCarga): boolean { return TRANSICIONES_CARGA[desde].includes(hasta); }

export class MaquinaCarga {
  private actual: FaseCarga = 'idle';
  get fase(): FaseCarga { return this.actual; }
  /** Intenta pasar a `hasta`. Devuelve true si la transición era válida y se aplicó; si no (repetida, hacia atrás o desde un estado terminal) no hace nada y devuelve false. */
  avanzar(hasta: FaseCarga): boolean {
    if (!transicionValida(this.actual, hasta)) return false;
    this.actual = hasta;
    return true;
  }
}

/**
 * ¿Debe verse el indicador en el instante `ahora`? `inicio` = cuándo empezó la carga (null = no ha empezado), `fin` = cuándo terminó (null = sigue). Todo en ms de un mismo reloj.
 *  · Antes de inicio + DEMORA_MOSTRAR_MS no se muestra.
 *  · Si la carga terminó antes de ese instante, NUNCA se muestra (sin destello).
 *  · Si se mostró, permanece hasta max(fin, momento en que se mostró + MIN_PERMANENCIA_MS).
 */
export function indicadorVisible(ahora: number, inicio: number | null, fin: number | null): boolean {
  if (inicio === null) return false;
  const desde = inicio + DEMORA_MOSTRAR_MS;
  if (ahora < desde) return false;
  if (fin === null) return true;
  if (fin <= desde) return false;
  return ahora < Math.max(fin, desde + MIN_PERMANENCIA_MS);
}

/** Milisegundos hasta el próximo cambio de visibilidad (para programar UN temporizador), o null si ya no cambiará (o aún no se sabe: falta `fin`). */
export function proximoCambioIndicador(ahora: number, inicio: number | null, fin: number | null): number | null {
  if (inicio === null) return null;
  const desde = inicio + DEMORA_MOSTRAR_MS;
  if (ahora < desde) return fin !== null && fin <= desde ? null : desde - ahora;
  if (fin === null || fin <= desde) return null;
  const oculta = Math.max(fin, desde + MIN_PERMANENCIA_MS);
  return ahora < oculta ? oculta - ahora : null;
}
