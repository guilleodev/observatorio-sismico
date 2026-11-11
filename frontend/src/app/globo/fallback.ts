// Globo 3D por defecto + retirada automática al mapa 2D. Constantes y textos PUROS (sin DOM ni three), probados con `node --test`.
// El visor arranca en 3D; si el globo no puede mostrarse (sin WebGL, fallo del import()/renderer, o se queda sin iniciar), AppComponent pasa solo al mapa 2D y lo explica con un aviso visible.

/** Tiempo máximo desde que empieza la carga del globo hasta tener la escena creada. Pasado este plazo se abandona (y se ignora cualquier resultado tardío). */
export const LIMITE_CARGA_MS = 12000;
/** Motivo mostrado cuando salta el temporizador de seguridad. */
export const MENSAJE_TIEMPO_AGOTADO = 'El globo 3D tarda demasiado en iniciar (más de 12 s)';
/** Leaflet pudo arrancar oculto (tamaño 0): tras el fallback se recalcula en el siguiente fotograma y, otra vez, pasado este tiempo. */
export const REINTENTO_INVALIDAR_MS = 250;

/**
 * Aviso persistente del fallback: «Globo 3D no disponible: <motivo>. Se muestra el mapa 2D.». Los motivos existentes terminan en «…: usa el mapa 2D o la tabla.»;
 * esa coletilla y el punto final se quitan para no repetir la idea ni duplicar puntos.
 */
export function textoAvisoFallback(motivo: string): string {
  const limpio = motivo.trim().replace(/[:,;]?\s*usa el mapa 2D o la tabla\.?$/i, '').replace(/[.\s]+$/, '');
  return `Globo 3D no disponible: ${limpio || 'motivo no indicado'}. Se muestra el mapa 2D.`;
}
