// Estado y validación de los filtros del panel (F5, paso 5.4). Funciones PURAS: sin Angular, sin DOM y sin reloj del navegador.
// Un único estado de filtros alimenta mapa, tabla y gráficas (FR-017): aquí se convierte, siempre de la misma forma, en los parámetros de la API.
// Autocontenido a propósito (solo `import type`): se prueba con `node --test` y se compila con Angular sin tocar tsconfig.
import type { FiltrosEstado, PaisCatalogo, Ventana } from './modelos';

export const SIN_PAIS = 'sin_pais'; // valor reservado de country_id: «Sin país asignado» (nunca el país más cercano)
export const NOMBRE_SIN_PAIS = 'Sin país asignado';
/** F8: fuentes en vivo que se pueden filtrar. Un terremoto que informan ambas se muestra UNA sola vez (el de USGS). */
export const FUENTES = [{ id: 'usgs', nombre: 'USGS' }, { id: 'emsc', nombre: 'EMSC' }] as const;
export function fuenteValida(valor: string | undefined): 'usgs' | 'emsc' | '' {
  const v = (valor ?? '').trim().toLowerCase();
  return v === 'usgs' || v === 'emsc' ? v : '';
}
const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;

/** Aviso permanente (hallazgo de 5.3): el feed en vivo y el histórico de 2025 no tienen la misma cobertura por debajo de M4,5 fuera de EE. UU. */
export const AVISO_COBERTURA =
  'Cobertura distinta: el feed en vivo de USGS no es completo por debajo de M4,5 fuera de EE. UU., mientras que el histórico de 2025 sí incluye esas magnitudes. ' +
  'Por eso una diferencia con 2025 no demuestra un descenso real de la actividad; para comparar de forma más justa usa magnitud mínima 4,5.';

export function estadoInicial(): FiltrosEstado {
  return { preajuste: 'ultimas-24h', desde: '', hasta: '', magMin: '', pais: '', fuente: '' };
}

/** «YYYY-MM-DDTHH:mm[:ss]» interpretado como UTC → milisegundos, o NaN si no es una fecha válida (sin el análisis permisivo de Date). */
export function analizarFechaUtc(texto: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(texto.trim());
  if (!m) return NaN;
  const [anio, mes, dia, hora, min, seg] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number);
  const ms = Date.UTC(anio, mes - 1, dia, hora, min, seg);
  const d = new Date(ms);
  // Date.UTC normaliza (31 de febrero → marzo): se exige que la fecha vuelva a ser la escrita
  const coincide = d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia && d.getUTCHours() === hora && d.getUTCMinutes() === min;
  return coincide && anio >= 1970 && anio <= 2100 ? ms : NaN;
}

/** Magnitud mínima: cadena vacía = sin filtro; si no, un número finito (la coma decimal española se acepta). `null` = inválida. */
export function analizarMagnitud(texto: string): number | null | undefined {
  const t = texto.trim().replace(',', '.');
  if (t === '') return undefined;
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** Mensajes de validación (vacío = filtros válidos). */
export function validar(estado: FiltrosEstado): string[] {
  const errores: string[] = [];
  const desde = estado.desde.trim() === '' ? undefined : analizarFechaUtc(estado.desde);
  const hasta = estado.hasta.trim() === '' ? undefined : analizarFechaUtc(estado.hasta);
  if (estado.preajuste === 'personalizado') {
    if (Number.isNaN(desde)) errores.push('La fecha «Desde» no es válida (use AAAA-MM-DD y hora UTC).');
    if (Number.isNaN(hasta)) errores.push('La fecha «Hasta» no es válida (use AAAA-MM-DD y hora UTC).');
    if (desde === undefined && hasta === undefined) errores.push('Indique al menos una de las dos fechas (UTC) del periodo personalizado.');
    if (desde !== undefined && hasta !== undefined && !Number.isNaN(desde) && !Number.isNaN(hasta) && desde >= hasta) {
      errores.push('«Desde» debe ser anterior a «Hasta»: el periodo es [desde, hasta) en UTC.');
    }
  }
  if (analizarMagnitud(estado.magMin) === null) errores.push('La magnitud mínima debe ser un número (p. ej. 4 o 4,5).');
  return errores;
}

/**
 * Periodo [start, end) resuelto con el instante `generated` DE LA API, nunca con el reloj del navegador (`Date.now` no se usa aquí):
 * así un reloj de cliente desfasado no desplaza la ventana. Mismas reglas que la API: sin `desde` el inicio es fin − 24 h; sin `hasta` el fin es `generated`.
 */
export function resolverVentana(estado: FiltrosEstado, generadoMs: number): Ventana {
  if (estado.preajuste === 'ultimos-7d') return { startMs: generadoMs - 7 * DIA_MS, endMs: generadoMs };
  if (estado.preajuste === 'personalizado') {
    const hasta = estado.hasta.trim() === '' ? generadoMs : analizarFechaUtc(estado.hasta);
    const desde = estado.desde.trim() === '' ? hasta - DIA_MS : analizarFechaUtc(estado.desde);
    return { startMs: desde, endMs: hasta };
  }
  return { startMs: generadoMs - DIA_MS, endMs: generadoMs };
}

/** Parámetros de /api/eventos y /api/estadisticas: los MISMOS para ambos (FR-017), con `start` y `end` siempre explícitos en ISO 8601 UTC. */
export function parametros(estado: FiltrosEstado, ventana: Ventana): Record<string, string> {
  const p: Record<string, string> = { start: new Date(ventana.startMs).toISOString(), end: new Date(ventana.endMs).toISOString() };
  const mag = analizarMagnitud(estado.magMin);
  if (typeof mag === 'number') p['min_mag'] = String(mag);
  const pais = estado.pais.trim();
  if (pais !== '') p['country_id'] = pais.toLowerCase() === SIN_PAIS ? SIN_PAIS : pais.toUpperCase();
  const fuente = fuenteValida(estado.fuente);
  if (fuente !== '') p['fuente'] = fuente;
  return p;
}

/** Texto breve de los filtros activos (para el panel de estado y para accesibilidad). */
export function resumen(estado: FiltrosEstado, nombresPais: Record<string, string> = {}): string {
  const partes: string[] = [];
  partes.push(estado.preajuste === 'ultimos-7d' ? 'últimos 7 días' : estado.preajuste === 'personalizado' ? 'periodo personalizado (UTC)' : 'últimas 24 h');
  const mag = analizarMagnitud(estado.magMin);
  if (typeof mag === 'number') partes.push(`magnitud ≥ ${mag}`);
  const pais = estado.pais.trim();
  if (pais !== '') partes.push(pais.toLowerCase() === SIN_PAIS ? NOMBRE_SIN_PAIS : `país ${nombresPais[pais.toUpperCase()] ?? pais.toUpperCase()}`);
  const fuente = fuenteValida(estado.fuente);
  if (fuente !== '') partes.push(`fuente ${fuente.toUpperCase()}`);
  return partes.join(' · ');
}

/** Formato «AAAA-MM-DDTHH:mm» (UTC) de un instante, para rellenar los campos de fecha. */
export function aCampoFecha(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16);
}

/** Países del filtro a partir del catálogo `datos/paises.geojson` que entrega el frontend (identificador ADM0_A3 y nombre en español), ordenados por nombre. */
export function paisesDelCatalogo(coleccion: unknown): PaisCatalogo[] {
  const features = (coleccion as { features?: { properties?: Record<string, unknown> }[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const vistos = new Map<string, string>();
  for (const f of features) {
    const id = f?.properties?.['ADM0_A3'];
    const nombre = f?.properties?.['NAME_ES'] ?? f?.properties?.['ADMIN'];
    if (typeof id === 'string' && id.trim() !== '' && id !== '-99' && !vistos.has(id)) vistos.set(id, typeof nombre === 'string' && nombre !== '' ? nombre : id);
  }
  return [...vistos].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
