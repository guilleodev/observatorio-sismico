// Globo 3D (F8 · mejoras visuales): etiquetas «M x,x» junto a los terremotos MÁS FUERTES. Módulo PURO: sin three, sin DOM, sin imports en ejecución (se prueba con `node --test`).
// Decisiones:
//  · Solo los de magnitud ≥ UMBRAL_ETIQUETA (5) y como mucho MAX_ETIQUETAS (3): dan contexto sin llenar el globo. Con menos de 3 eventos de esa magnitud hay menos etiquetas (y ninguna si no hay).
//  · Es una ayuda VISUAL redundante: la misma información (lugar y magnitud) está en la etiqueta al pasar el ratón, en el panel de detalle y en la tabla; las etiquetas del globo son decorativas.
//  · Solo la magnitud (no el lugar): el texto largo taparía el globo.

export const UMBRAL_ETIQUETA = 5;
export const MAX_ETIQUETAS = 3;

/** Separación angular mínima (radianes ≈ 8°) entre dos etiquetas: en zonas con varios eventos fuertes seguidos (p. ej. Fiji–Tonga) se etiqueta solo el mayor, para que los textos no se superpongan. */
export const SEPARACION_ETIQUETAS_RAD = 0.14;

/**
 * Índices de los eventos a etiquetar: los de mayor magnitud (≥ umbral), como mucho `max`, de mayor a menor (desempate: índice menor). `magnitudes` puede traer NaN (sin magnitud: nunca se etiqueta).
 * Si se pasan las `normales` (3 floats por evento, vectores unitarios), se descartan los que quedarían a menos de `separacion` radianes de uno ya elegido (el mayor de cada zona gana).
 * Coste: O(n) para filtrar + O(k log k) con k = eventos ≥ umbral (decenas) por cambio de datos, nunca por fotograma.
 */
export function elegirEtiquetados(magnitudes: ArrayLike<number>, n: number, max: number = MAX_ETIQUETAS, umbral: number = UMBRAL_ETIQUETA,
  normales?: ArrayLike<number>, separacion: number = SEPARACION_ETIQUETAS_RAD): number[] {
  const limite = Math.max(0, Math.floor(max));
  const elegidos: number[] = [];
  if (limite === 0) return elegidos;
  const candidatos: number[] = [];
  for (let i = 0; i < n; i++) { const m = magnitudes[i]; if (Number.isFinite(m) && m >= umbral) candidatos.push(i); }
  candidatos.sort((a, b) => (magnitudes[b] - magnitudes[a]) || (a - b));
  const cosMin = Math.cos(separacion);
  for (const i of candidatos) {
    if (elegidos.length >= limite) break;
    if (normales && elegidos.some((j) => normales[3 * i] * normales[3 * j] + normales[3 * i + 1] * normales[3 * j + 1] + normales[3 * i + 2] * normales[3 * j + 2] > cosMin)) continue;
    elegidos.push(i);
  }
  return elegidos;
}

/** Texto de la etiqueta: «M 5,5» (coma decimal, una cifra). Magnitud no válida → cadena vacía (no se etiqueta). */
export function textoEtiqueta(magnitud: number): string {
  if (!Number.isFinite(magnitud)) return '';
  return `M ${magnitud.toFixed(1).replace('.', ',')}`;
}

/**
 * Anchura (unidades de mundo) de una etiqueta a la `distancia` de cámara dada: crece de forma lineal con la distancia para que su tamaño EN PANTALLA no cambie con el zoom
 * (a la distancia inicial vale ANCHO_ETIQUETA_BASE). Siempre positiva y finita.
 */
export const ANCHO_ETIQUETA_BASE = 0.4;   // ≈ 115 px de lienzo a la distancia inicial en un visor de 674 px de alto: letra de ≈ 15 px
export const DISTANCIA_REFERENCIA_ETIQUETA = 3.2;
export function anchoEtiqueta(distancia: number): number {
  if (!Number.isFinite(distancia) || distancia <= 0) return ANCHO_ETIQUETA_BASE;
  return ANCHO_ETIQUETA_BASE * (distancia / DISTANCIA_REFERENCIA_ETIQUETA);
}
