// Presentación del bloque «Información y estado de los datos» (F7). Funciones PURAS y autocontenidas (solo `import type`): se prueban con `node --test`.
// No deciden si los datos están al día: eso lo hace `estadoGeneral` (estado.ts), cuyo resultado llega ya calculado. Aquí solo se traduce a icono + texto + tono
// (el estado nunca va solo en color: cada tono lleva un icono y un texto distintos).
import type { EntradaEstado, EstadoGeneral } from '../estado';

export type Tono = 'ok' | 'aviso' | 'error' | 'replay' | 'neutro';
export type Indicador = { tono: Tono; icono: string; texto: string };

/** «Conexión» con la API, según el último error del panel y si hay alguna lectura. Una clave que falta NO es una caída: la API responde. */
export function indicadorConexion(e: Pick<EntradaEstado, 'error' | 'hayLectura'>): Indicador {
  if (e.error?.tipo === 'autorizacion') return { tono: 'aviso', icono: '!', texto: 'Acceso restringido (falta la clave)' };
  if (e.error && e.error.tipo !== 'validacion') return { tono: 'error', icono: '✕', texto: 'Sin conexión con la API' };
  if (!e.hayLectura) return { tono: 'neutro', icono: '–', texto: 'Sin lectura todavía' };
  return { tono: 'ok', icono: '✓', texto: 'API accesible' };
}

/** «Datos al día»: traduce el resultado de `estadoGeneral`. En reproducción el tono es violeta (nunca se confunde con actividad actual). */
export function indicadorDatos(g: EstadoGeneral, enReplay: boolean): Indicador {
  if (g.nivel === 'sin-conexion') return { tono: 'error', icono: '✕', texto: g.texto };
  if (g.nivel === 'desactualizado') return { tono: 'aviso', icono: '⚠', texto: g.texto };
  return enReplay ? { tono: 'replay', icono: '▶', texto: g.texto } : { tono: 'ok', icono: '✓', texto: g.texto };
}

const NUMERO = new Intl.NumberFormat('es-ES');

// ---------- CAMBIO (rediseño 3 vistas, ronda 2): KPI «Estado» único e incidencias del marco común ----------
/**
 * Tarjeta «Estado» ÚNICA: combina «Conexión» y «Datos» eligiendo lo MÁS GRAVE (error/aviso de conexión > datos desactualizados o sin conexión > sin lectura > todo bien).
 * Con todo bien junta ambos textos («API accesible · Datos al día»). Mantiene icono + texto + tono del indicador elegido (nunca solo color); el tono es violeta en reproducción porque `indicadorDatos` ya lo decide.
 */
export function estadoUnico(conexion: Indicador, datos: Indicador): Indicador {
  if (conexion.tono === 'error' || conexion.tono === 'aviso') return conexion;
  if (datos.tono === 'error' || datos.tono === 'aviso') return datos;
  if (conexion.tono === 'neutro') return conexion;
  return { tono: datos.tono, icono: datos.icono, texto: `${conexion.texto} · ${datos.texto}` };
}

/** Línea corta bajo el estado: la ingesta de USGS la mide la API (no es la «última lectura del frontend»). En REPRODUCCIÓN aclara que es la ingesta EN VIVO. */
export function textoEstadoIngesta(ingesta: string, enReplay: boolean): string {
  return `${enReplay ? 'Ingesta USGS en vivo' : 'Ingesta USGS'}: ${ingesta}`;
}

/** Nota del KPI «Terremotos en el periodo» (total de la API): cuántos hay CARGADOS en el cliente. */
export function notaCargadosPeriodo(cargados: number): string { return `${NUMERO.format(cargados)} cargados`; }

/** Tipos mínimos de `avisos()` (estado.ts): este módulo sigue sin importar nada en tiempo de ejecución. */
export type AvisoEntrada = { codigo: string; severidad: 'error' | 'aviso' | 'info'; titulo: string; texto: string };
export type Incidencia = { codigo: string; severidad: 'error' | 'aviso'; icono: string; titulo: string; texto: string };

// Incidencias importantes: las que la persona debe ver SIEMPRE, también en Análisis y Eventos. «Fallo de refresco» = `sin-conexion` (red, tiempo, servidor o formato) y «filtros rechazados» = `filtros-rechazados`.
const INCIDENCIAS: Record<string, { icono: string; severidad: 'error' | 'aviso'; titulo: string; texto: string | null }> = {
  'acceso-denegado': { icono: '!', severidad: 'aviso', titulo: 'Acceso restringido', texto: 'falta la clave de acceso o no se ha aceptado.' },
  'sin-conexion': { icono: '✕', severidad: 'error', titulo: 'Sin conexión con la API', texto: 'se conservan los últimos datos válidos y se reintenta automáticamente.' },
  'filtros-rechazados': { icono: '!', severidad: 'aviso', titulo: 'La API rechazó los filtros', texto: 'se conserva la última lectura válida.' },
  'datos-desactualizados': { icono: '⚠', severidad: 'aviso', titulo: 'Datos desactualizados', texto: 'pueden faltar los eventos más recientes.' },
  'huecos': { icono: '⚠', severidad: 'aviso', titulo: 'Huecos de ingesta pendientes', texto: null },   // null: se usa el texto del aviso (lleva el recuento)
};

/** Filtra la lista de `avisos()` a las incidencias importantes y las resume en una línea (conserva el orden: de más a menos grave). Los demás avisos siguen en «Metodología y estado del sistema». */
export function incidencias(avisos: readonly AvisoEntrada[]): Incidencia[] {
  const salida: Incidencia[] = [];
  for (const a of avisos) {
    const d = INCIDENCIAS[a.codigo];
    if (d) salida.push({ codigo: a.codigo, severidad: d.severidad, icono: d.icono, titulo: d.titulo, texto: d.texto ?? a.texto });
  }
  return salida;
}

// ---------- KPI calculados SOLO sobre los eventos CARGADOS (rediseño del dashboard) ----------
// Ojo con el alcance: la API puede tener más eventos en el periodo que los cargados (primera página). Estos números describen lo que hay en el cliente y así se etiquetan
// (`notaCargados`); NO son estadísticas completas del periodo. Tipos mínimos estructurales: el módulo sigue siendo autocontenido (sin importar nada en tiempo de ejecución).
type ConMagnitud = { properties?: { mag?: unknown } | null };

/** Umbral del KPI «Eventos ≥ M4.5»: comparación exacta (>=), sin redondeos. */
export const UMBRAL_MAGNITUD_KPI = 4.5;

function magnitudFinita(e: ConMagnitud): number | null {
  const m = e.properties?.mag;
  return typeof m === 'number' && Number.isFinite(m) ? m : null;
}

/** Magnitud máxima de los eventos cargados, ignorando null, NaN y no finitos; null si no hay ninguna magnitud válida. */
export function magnitudMaxima(eventos: readonly ConMagnitud[]): number | null {
  let max: number | null = null;
  for (const e of eventos) { const m = magnitudFinita(e); if (m !== null && (max === null || m > max)) max = m; }
  return max;
}

/** «M 7.3» (solo el valor numérico, sin mezclar tipos de magnitud) o «ND» si no hay ninguna magnitud válida. */
export function textoMagnitudMaxima(eventos: readonly ConMagnitud[]): string {
  const m = magnitudMaxima(eventos);
  return m === null ? 'ND' : `M ${m}`;
}

/** Cuántos eventos cargados tienen magnitud >= umbral; null si no hay eventos cargados (el texto será «ND»). Un evento sin magnitud nunca cuenta. */
export function contarMagnitudDesde(eventos: readonly ConMagnitud[], umbral: number = UMBRAL_MAGNITUD_KPI): number | null {
  if (eventos.length === 0) return null;
  let n = 0;
  for (const e of eventos) { const m = magnitudFinita(e); if (m !== null && m >= umbral) n++; }
  return n;
}

/** Texto del KPI «Eventos ≥ M4.5»: «ND» sin eventos cargados; «0» si hay eventos pero ninguno llega al umbral. */
export function textoEventosMayores(eventos: readonly ConMagnitud[], umbral: number = UMBRAL_MAGNITUD_KPI): string {
  const n = contarMagnitudDesde(eventos, umbral);
  return n === null ? 'ND' : NUMERO.format(n);
}

/** Nota de alcance de los KPI de magnitud: deja claro que NO son del total del periodo cuando se han cargado menos eventos que los que da la API. */
export function notaCargados(cargados: number, total: number | null): string {
  if (cargados === 0) return 'sin eventos cargados';
  if (total !== null && cargados < total) return `sobre los ${NUMERO.format(cargados)} cargados, no sobre el total del periodo`;
  return `en los ${NUMERO.format(cargados)} eventos cargados`;
}

/**
 * Países con eventos en el periodo, a partir de `estadisticas.por_pais` (que es COMPLETO para el periodo, no solo lo cargado): categorías con país asignado y recuento > 0.
 * «Sin país asignado» (country_id nulo) es una categoría propia y NO cuenta como país. null si no hay bloque (sin estadísticas: la tarjeta se omite, no se inventa).
 */
export function paisesConEventos(bloque: { items: readonly { country_id: string | null; count: number }[] } | null | undefined): number | null {
  if (!bloque || !Array.isArray(bloque.items)) return null;
  return bloque.items.filter((i) => i.country_id !== null && i.country_id !== '' && Number.isFinite(i.count) && i.count > 0).length;
}

/** Complemento del contador de terremotos: «de N en el periodo · M omitidos por coordenadas inválidas» (sin «de N» si el total no se conoce). */
export function textoCobertura(total: number | null, omitidos: number): string {
  const omit = `${NUMERO.format(omitidos)} ${omitidos === 1 ? 'omitido' : 'omitidos'} por coordenadas inválidas`;
  return total === null ? omit : `de ${NUMERO.format(total)} en el periodo · ${omit}`;
}
