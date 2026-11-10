// Globo 3D (F7, 4.ª iteración · mejora 5): calidad ADAPTATIVA del renderer. Máquina de estados PURA (sin three, sin DOM, sin imports en ejecución; se prueba con `node --test`
// y tiempo simulado). Decide el pixelRatio (resolución del canvas) a partir del COSTE medido de cada fotograma; escena.ts solo le pasa las muestras y aplica el nivel que devuelve.
//
// Qué se mide (y sus LÍMITES): el tiempo de CPU de `renderer.render(...)` (performance.now() antes y después). NO mide la GPU real: el trabajo de la tarjeta gráfica es asíncrono y
// no lo ve JavaScript; solo se refleja de forma indirecta (cuando la cola de comandos se llena, `render` tarda más). Es una heurística, no una garantía. Como el coste de CPU no
// depende de cuántos fotogramas se pidan, los modos deliberados de 25–30 fps (rotación, pulsación) no distorsionan la medida. Las muestras absurdas (> COSTE_MAX_MS: compilación de
// shaders, subida de texturas, pausas del recolector de basura) se descartan; un hueco > HUECO_MAX_MS entre muestras (bucle parado, pestaña oculta, vista oculta) reinicia la ventana.
//
// Reglas (todas ajustables aquí):
//  · Niveles discretos de pixelRatio: [tope, 1,5, 1,25, 1] acotados por el tope (min(dpr, 2)); nunca por debajo de 1 salvo que el propio dpr sea < 1; nunca por encima del tope.
//  · BAJAR un nivel si el percentil 90 de la ventana (últimas VENTANA muestras) supera UMBRAL_BAJAR_MS durante ≥ SOSTENIDO_BAJAR_MS.
//  · SUBIR un nivel solo si va holgado: p90 < UMBRAL_SUBIR_MS durante ≥ SOSTENIDO_SUBIR_MS (mucho más tiempo). Histéresis asimétrica: bajar es rápido, subir es lento.
//  · Tiempo mínimo entre cambios (MIN_ENTRE_CAMBIOS_MS) y la ventana se vacía tras cada cambio: no oscila.
//  · No reduce eventos ni toca la selección: el picking es geométrico (no depende de la resolución).

export interface ConfigCalidad {
  niveles: readonly number[]; minimo: number; ventana: number; minMuestras: number;
  umbralBajarMs: number; sostenidoBajarMs: number; umbralSubirMs: number; sostenidoSubirMs: number;
  minEntreCambiosMs: number; huecoMaxMs: number; costeMaxMs: number;
}

export const CALIDAD: Readonly<ConfigCalidad> = {
  /** Candidatos de pixelRatio (el primero es el tope real, que se sustituye por min(dpr, 2)). */
  niveles: [2, 1.5, 1.25, 1],
  minimo: 1,
  /** Muestras de la ventana deslizante (~1 s a 60 fps). */
  ventana: 60,
  /** No se decide hasta tener al menos estas muestras. */
  minMuestras: 30,
  umbralBajarMs: 20, sostenidoBajarMs: 2000,
  umbralSubirMs: 8, sostenidoSubirMs: 8000,
  minEntreCambiosMs: 5000,
  /** Un hueco mayor entre dos muestras reinicia la medición (pausa, vista oculta, bucle parado). */
  huecoMaxMs: 250,
  /** Una muestra mayor que esto es un valor atípico (compilación, subida de textura, GC): se descarta. */
  costeMaxMs: 250,
};

/** Niveles de pixelRatio disponibles para un tope dado, de mayor a menor, sin repetidos. Con tope ≤ 1 hay un solo nivel (no hay nada que bajar). */
export function nivelesPixelRatio(tope: number, base: readonly number[] = CALIDAD.niveles, minimo: number = CALIDAD.minimo): number[] {
  const t = Number.isFinite(tope) && tope > 0 ? tope : 1;
  const salida: number[] = [t];
  for (const n of base) if (n >= minimo && n < salida[salida.length - 1] - 1e-9) salida.push(n);
  return salida;
}

/** Percentil `p` (0–1) por rango más cercano de los primeros `n` valores de `v` (se ordena una copia en `scratch`). */
export function percentil(v: ArrayLike<number>, n: number, p: number, scratch?: Float64Array): number {
  if (n <= 0) return 0;
  const copia = scratch && scratch.length >= n ? scratch : new Float64Array(n);
  for (let i = 0; i < n; i++) copia[i] = v[i];
  const vista = copia.subarray(0, n); vista.sort();
  return vista[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))];
}

export class MaquinaCalidad {
  private readonly niveles: number[];
  private readonly cfg: ConfigCalidad;
  private indice = 0;
  private readonly muestras: Float64Array;
  private readonly scratch: Float64Array;
  private escritas = 0;
  private ultimoMs: number | null = null;
  private ultimoCambioMs: number | null = null;
  private desdeMalo: number | null = null;
  private desdeBueno: number | null = null;

  constructor(tope: number, cfg: Partial<ConfigCalidad> = {}) {
    this.cfg = { ...CALIDAD, ...cfg };
    this.niveles = nivelesPixelRatio(tope, this.cfg.niveles, this.cfg.minimo);
    this.muestras = new Float64Array(this.cfg.ventana);
    this.scratch = new Float64Array(this.cfg.ventana);
  }

  /** pixelRatio del nivel actual. */
  get pixelRatio(): number { return this.niveles[this.indice]; }
  get nivel(): number { return this.indice; }
  get totalNiveles(): number { return this.niveles.length; }

  /** Vacía la ventana y los cronómetros (pausa, vista oculta, bucle parado). No cambia de nivel. */
  reiniciarMedicion(): void { this.escritas = 0; this.desdeMalo = null; this.desdeBueno = null; this.ultimoMs = null; }

  /**
   * Registra el coste (ms) de un fotograma renderizado en el instante `ahoraMs` (marca de tiempo del fotograma). Devuelve el NUEVO pixelRatio si hay que cambiar de nivel, o null.
   * Con un solo nivel (dpr ≤ 1) nunca devuelve nada.
   */
  registrar(costeMs: number, ahoraMs: number): number | null {
    if (!Number.isFinite(costeMs) || !Number.isFinite(ahoraMs) || costeMs < 0) return null;
    if (this.ultimoMs !== null && ahoraMs - this.ultimoMs > this.cfg.huecoMaxMs) this.reiniciarMedicion();   // hueco largo: lo anterior ya no describe el ritmo actual
    this.ultimoMs = ahoraMs;
    if (costeMs > this.cfg.costeMaxMs) return null;
    this.muestras[this.escritas % this.cfg.ventana] = costeMs; this.escritas++;
    const n = Math.min(this.escritas, this.cfg.ventana);
    if (n < this.cfg.minMuestras || this.niveles.length < 2) return null;
    const p90 = percentil(this.muestras, n, 0.9, this.scratch);
    if (p90 > this.cfg.umbralBajarMs) this.desdeMalo ??= ahoraMs; else this.desdeMalo = null;
    if (p90 < this.cfg.umbralSubirMs) this.desdeBueno ??= ahoraMs; else this.desdeBueno = null;
    if (this.ultimoCambioMs !== null && ahoraMs - this.ultimoCambioMs < this.cfg.minEntreCambiosMs) return null;
    if (this.desdeMalo !== null && ahoraMs - this.desdeMalo >= this.cfg.sostenidoBajarMs && this.indice < this.niveles.length - 1) return this.cambiar(this.indice + 1, ahoraMs);
    if (this.desdeBueno !== null && ahoraMs - this.desdeBueno >= this.cfg.sostenidoSubirMs && this.indice > 0) return this.cambiar(this.indice - 1, ahoraMs);
    return null;
  }

  private cambiar(indice: number, ahoraMs: number): number {
    this.indice = indice; this.ultimoCambioMs = ahoraMs;
    this.escritas = 0; this.desdeMalo = null; this.desdeBueno = null;   // el nuevo nivel se mide desde cero
    return this.niveles[indice];
  }
}
