// Modo de vista del panel: EN VIVO o REPRODUCCIÓN (F6, paso 6.2; contracts/f6.md §2). Funciones PURAS y autocontenidas (solo `import type`): se prueban con `node --test`.
// La reproducción es una ejecución histórica acelerada y AISLADA; nunca debe presentarse como actividad actual. Por eso toda vista lleva su etiqueta,
// el cambio de modo descarta la lectura anterior y la comparación con 2025 (que mide el periodo EN VIVO) se oculta con un aviso.
import type { EjecucionReplay, Estadisticas, Evento, FiltrosEstado, Lectura, ModoVista, Propiedades, Ventana } from './modelos';

export const MODO_INICIAL: ModoVista = 'live';
export const ETIQUETA_REPLAY = 'REPRODUCCIÓN';
export const DISTINTIVO_CASO = 'caso controlado / sintético';
export const AVISO_COMPARACION_NO_APLICA =
  'La comparación con la media diaria de 2025 no aplica en una reproducción: compara actividad EN VIVO con el histórico y aquí los eventos son una ejecución histórica reproducida.';

/** Parámetros de modo para /api/eventos, /api/estadisticas y /api/salud. En vivo NO se envía nada: la petición es la de F5 (SC-004). */
export function parametrosModo(modo: ModoVista, run: string | null = null): Record<string, string> {
  if (modo !== 'replay') return {};
  return run === null ? { mode: 'replay' } : { mode: 'replay', run };
}

/** Periodo por defecto de una reproducción: el intervalo de la ejecución `[desde, hasta + 1 ms)`, NO «últimas 24 h». null si la ejecución aún no tiene eventos. */
export function ventanaDeEjecucion(e: EjecucionReplay | null): Ventana | null {
  const d = e?.intervalo?.desde;
  const h = e?.intervalo?.hasta;
  return typeof d === 'number' && typeof h === 'number' && h >= d ? { startMs: d, endMs: h + 1 } : null;
}

/** Periodo de la consulta en replay: toda la ejecución, salvo que la persona elija un periodo personalizado (que se resuelve respecto al fin de la ejecución). */
export function ventanaReplay(filtros: FiltrosEstado, e: EjecucionReplay, resolver: (f: FiltrosEstado, generadoMs: number) => Ventana): Ventana | null {
  const base = ventanaDeEjecucion(e);
  if (base === null) return null;
  return filtros.preajuste === 'personalizado' ? resolver(filtros, base.endMs) : base;
}

export function textoVelocidad(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 'velocidad no indicada';
  return `×${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(v)}`;
}

const ESTADOS: Record<string, string> = { en_curso: 'en curso', terminada: 'terminada', interrumpida: 'interrumpida' };

/** «REPRODUCCIÓN · ejecución r-… · ×31,9 · terminada»: la misma identidad en el mapa, la tabla, la ficha, las gráficas y el estado. */
export function etiquetaReplay(e: EjecucionReplay | null): string {
  if (e === null) return `${ETIQUETA_REPLAY} · sin ejecuciones`;
  return `${ETIQUETA_REPLAY} · ejecución ${e.run_id} · ${textoVelocidad(e.velocidad)} · ${ESTADOS[e.estado] ?? e.estado}`;
}

/** Título de una vista con su etiqueta cuando es una reproducción (el título no cambia en vivo). */
export function conEtiqueta(titulo: string, replay: boolean): string {
  return replay ? `${titulo} · ${ETIQUETA_REPLAY}` : titulo;
}

export function esCasoControlado(p: Pick<Propiedades, 'caso'> | null | undefined): boolean {
  return typeof p?.caso === 'string' && p.caso !== '';
}

/** Texto añadido a la ficha de un evento reproducido (vacío en vivo): etiqueta, ejecución y, si lo es, el distintivo del caso controlado. */
export function fichaReplay(p: Propiedades, e: EjecucionReplay | null, replay: boolean): string {
  if (!replay) return '';
  const caso = esCasoControlado(p) ? `\n${DISTINTIVO_CASO}: ${p.caso}` : '';
  return `${etiquetaReplay(e)}${caso}\n`;
}

/** Lectura vacía: al cambiar de modo no queda NADA del modo anterior (ni eventos, ni estadísticas, ni ejecución, ni periodo). */
export function lecturaVacia(): Lectura {
  return { eventos: [] as Evento[], estadisticas: null as Estadisticas | null, ejecucion: null, total: null, siguiente: null, ventana: null, salud: null, periodo: 'Sin consulta', resumen: '' };
}

export const AVISO_FILTROS_REPLAY =
  'Reproducción: los filtros actúan solo sobre la ejecución mostrada y el periodo por defecto es el intervalo de esa ejecución (no las últimas 24 horas). Las fechas son las ORIGINALES de los eventos.';

/** Resumen de filtros en replay: «toda la ejecución» sustituye a «últimas 24 h» / «últimos 7 días», que no tienen sentido aquí. */
export function resumenReplay(estado: FiltrosEstado, resumenVivo: string): string {
  return estado.preajuste === 'personalizado' ? resumenVivo : resumenVivo.replace(/^(últimas 24 h|últimos 7 días)/, 'toda la ejecución');
}
