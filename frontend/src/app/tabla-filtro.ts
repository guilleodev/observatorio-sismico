// Lógica PURA de la búsqueda y la paginación de la vista Eventos (rediseño en 3 vistas, ronda 2). Autocontenida (sin importaciones): se prueba con `node --test`.
// Todo es del lado cliente y solo sobre los eventos CARGADOS (los que ya están en memoria): no cambia filtros, consultas, estadísticas ni los datos que muestra la tabla.
// La normalización, la coincidencia por texto, `paginar` y `paginaDe` siguen en `tabla.ts` (ya probadas); aquí van el tamaño de página, el estado de los botones y la localización del evento seleccionado.

const NUMERO = new Intl.NumberFormat('es-ES');

/** Tamaños de página ofrecidos (el primero es el inicial). */
export const TAMANOS_PAGINA: readonly number[] = [25, 50, 100];
export const TAMANO_PAGINA_INICIAL = 25;

/** Valor de un <select> → tamaño válido; cualquier otra cosa vuelve al inicial (nunca 0, negativo ni NaN). */
export function tamanoPaginaValido(valor: unknown): number {
  const n = Number(valor);
  return TAMANOS_PAGINA.includes(n) ? n : TAMANO_PAGINA_INICIAL;
}

/** Al cambiar el tamaño, la página nueva contiene la MISMA primera fila que se estaba viendo (no se «salta» a otro sitio). Páginas 1..n. */
export function paginaTrasCambioTamano(pagina: number, tamanoAnterior: number, tamanoNuevo: number): number {
  if (!(tamanoAnterior > 0) || !(tamanoNuevo > 0)) return 1;
  const primeraFila = (Math.max(1, Math.trunc(pagina) || 1) - 1) * tamanoAnterior; // índice base 0 de la primera fila visible
  return Math.floor(primeraFila / tamanoNuevo) + 1;
}

export type BotonesPagina = { primera: boolean; anterior: boolean; siguiente: boolean; ultima: boolean };

/** Qué botones están ACTIVOS: en los extremos, «Primera/Anterior» (página 1) o «Siguiente/Última» (última página) se deshabilitan. */
export function botonesPagina(pagina: number, paginas: number): BotonesPagina {
  const hayAntes = pagina > 1; const hayDespues = pagina < paginas;
  return { primera: hayAntes, anterior: hayAntes, siguiente: hayDespues, ultima: hayDespues };
}

export const etiquetaBusqueda = (cargados: number): string => `Buscar en los ${NUMERO.format(cargados)} eventos cargados`;

/** «N eventos cargados de M del periodo» (M = total de la API); sin total conocido, solo «N eventos cargados». */
export function textoCargadosDelPeriodo(cargados: number, total: number | null): string {
  const base = `${NUMERO.format(cargados)} ${cargados === 1 ? 'evento cargado' : 'eventos cargados'}`;
  return total === null ? base : `${base} de ${NUMERO.format(total)} del periodo`;
}

/** Nota cuando la API tiene más eventos en el periodo que los cargados; null si están todos (o no se conoce el total). */
export function notaHayMasEnPeriodo(cargados: number, total: number | null): string | null {
  return total !== null && cargados < total ? 'Hay más eventos en el periodo: usa «Cargar el resto» (en «Metodología y estado del sistema», vista Análisis).' : null;
}

/** Línea de resultado de la búsqueda: «X de N cargados» (con rango mostrado si hay resultados). */
export function textoResumenTabla(cargados: number, coinciden: number, desde: number, hasta: number): string {
  if (cargados === 0) return 'Sin eventos cargados.';
  const x = `${NUMERO.format(coinciden)} de ${NUMERO.format(cargados)} cargados`;
  return coinciden === 0 ? `${x}.` : `${x} · mostrando ${NUMERO.format(desde)}–${NUMERO.format(hasta)}`;
}

export type SeleccionEnTabla = 'ninguna' | 'visible' | 'oculta-por-busqueda' | 'no-cargada';

/**
 * Dónde está el evento seleccionado respecto a la tabla (orden y búsqueda actuales):
 *  · 'visible': está en el resultado; `pagina` es la que lo contiene (la tabla salta a ella);
 *  · 'oculta-por-busqueda': está cargado pero la búsqueda lo excluye (se avisa y se ofrece «Limpiar búsqueda»);
 *  · 'no-cargada': ya no está entre los cargados; · 'ninguna': no hay selección.
 */
export function clasificarSeleccion(todas: readonly { id: string }[], visibles: readonly { id: string }[], id: string | null, tamano: number): { estado: SeleccionEnTabla; pagina: number | null } {
  if (id === null) return { estado: 'ninguna', pagina: null };
  const i = visibles.findIndex((f) => f.id === id);
  if (i >= 0) return { estado: 'visible', pagina: Math.floor(i / (tamano > 0 ? tamano : TAMANO_PAGINA_INICIAL)) + 1 };
  return { estado: todas.some((f) => f.id === id) ? 'oculta-por-busqueda' : 'no-cargada', pagina: null };
}
