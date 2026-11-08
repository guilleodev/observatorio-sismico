// Estado y avisos del sistema (F5, paso 5.6). Funciones PURAS y autocontenidas (solo `import type`): clasifican lo que ve la persona usuaria y redactan los avisos.
// Regla central: «no hay datos» NO es «no hay conexión». Un filtro sin eventos es un resultado válido; un fallo de red o un 503 es un error y los últimos datos
// válidos se conservan, indicando su antigüedad y que pueden estar desactualizados. Las antigüedades se miden con el reloj de la API (`generated`, `ingestion_age_s`)
// o con un reloj MONOTÓNICO local (duración transcurrida), nunca comparando con la hora del navegador, que puede estar desajustada.
import type { ModoVista, Salud, TipoError } from './modelos';

// F6: sin ejecuciones guardadas no es un fallo de conexión; el texto explica cómo lanzar una (solo `import type` en este archivo: se prueba con node --test).
export const AVISO_SIN_EJECUCIONES =
  'Todavía no hay ninguna reproducción guardada: no es un fallo de conexión. Lánzala con «bash scripts/f6/ensayo_replay.sh» o con el productor de replay ' +
  '(docker compose run --rm --no-deps producer python -m observatorio.replay.reproducir) y vuelve a pulsar «Reproducción».';

export type CodigoAviso = 'acceso-denegado' | 'sin-ejecuciones' | 'sin-conexion' | 'filtros-rechazados' | 'datos-desactualizados' | 'sin-eventos' | 'truncado' | 'huecos' | 'recuperado';
export type Aviso = { codigo: CodigoAviso; severidad: 'error' | 'aviso' | 'info'; rol: 'alert' | 'status'; titulo: string; texto: string };
export type ErrorPanel = { tipo: TipoError; mensaje: string; detalle?: string };

export type EntradaEstado = {
  /** Último error de la actualización más reciente (null si la última salió bien). `cancelado` nunca llega aquí. */
  error: ErrorPanel | null;
  /** Último estado de ingesta leído de /api/salud (de la última lectura correcta). */
  salud: Salud | null;
  /** ¿Hay una lectura válida en pantalla? */
  hayLectura: boolean;
  /** Tiempo transcurrido desde esa lectura, medido con un reloj monotónico local; null si no hay lectura. */
  edadLecturaMs: number | null;
  /** Eventos cargados en pantalla y total del periodo según la API. */
  cargados: number;
  total: number | null;
  /** `offset` de la página que falta cargar, o null si están todas. */
  siguiente: number | null;
  /** Instante (UTC, ISO) en que se recuperó la conexión tras un fallo, o null. */
  recuperadoEn: string | null;
  /** F6: modo de la vista (por defecto `live`) y si la reproducción todavía no tiene ninguna ejecución. */
  modo?: ModoVista;
  sinEjecuciones?: boolean;
};

/** «45 s», «3 min 05 s», «2 h 10 min», «1 d 4 h». */
export function formatoEdad(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'ND';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${String(m % 60).padStart(2, '0')} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** Duración desde una lectura con un reloj monotónico (p. ej. `performance.now()`): inmune a un reloj del sistema desajustado. */
export function edadLecturaMs(ahoraMonotonico: number, lecturaMonotonica: number | null): number | null {
  return lecturaMonotonica === null ? null : Math.max(0, ahoraMonotonico - lecturaMonotonica);
}

/** Tiempo hasta el siguiente intento: tras un fallo se reintenta en el mínimo permitido (recuperación pronta); tras un éxito, cada `refreshMs`. */
export function retardoSiguiente(correcto: boolean, refreshMs: number, minimoMs = 30000): number {
  return correcto ? Math.max(minimoMs, Number(refreshMs) || 60000) : minimoMs;
}

/** Ingesta según la API: «hace 12 s (medido por la API el …)», o que no hay ninguna ingesta correcta. */
export function textoIngesta(salud: Salud | null): string {
  if (!salud) return 'sin lectura de /api/salud';
  if (salud.last_ingestion === null || salud.last_ingestion === undefined) return 'todavía no hay ninguna ingesta correcta registrada';
  const iso = new Date(salud.last_ingestion).toISOString();
  const edad = typeof salud.ingestion_age_s === 'number' ? `hace ${formatoEdad(salud.ingestion_age_s * 1000)} según el reloj de la API` : 'antigüedad no disponible';
  return `${iso} (${edad})`;
}

const TITULO_CONEXION: Record<string, string> = { red: 'Sin conexión con el backend', tiempo: 'Sin conexión con el backend', servidor: 'Sin conexión con el backend', formato: 'Sin conexión válida con el backend' };

/** Avisos visibles, de más a menos grave. */
export function avisos(e: EntradaEstado): Aviso[] {
  const lista: Aviso[] = [];
  if (e.modo === 'replay' && e.sinEjecuciones && !e.error) {
    lista.push({ codigo: 'sin-ejecuciones', severidad: 'info', rol: 'status', titulo: 'Sin reproducciones', texto: AVISO_SIN_EJECUCIONES });
  }
  const conLectura = e.hayLectura && e.edadLecturaMs !== null
    ? `Se muestran los últimos datos válidos, leídos hace ${formatoEdad(e.edadLecturaMs)}: pueden estar desactualizados y no son la situación actual.` + (e.modo === 'replay' ? ' Son una reproducción histórica, no actividad actual.' : '')
    : 'Todavía no hay ninguna lectura válida que mostrar.';
  if (e.error && e.error.tipo === 'autorizacion') {
    lista.push({ codigo: 'acceso-denegado', severidad: 'aviso', rol: 'alert', titulo: 'Acceso restringido',
      texto: 'La API exige una clave de acceso y no se ha aceptado la enviada (o falta). Escríbela en el campo «Clave de acceso»: solo se guarda en la memoria de esta pestaña.' });
  } else if (e.error && e.error.tipo === 'validacion') {
    lista.push({ codigo: 'filtros-rechazados', severidad: 'aviso', rol: 'alert', titulo: 'La API rechazó los filtros',
      texto: `${e.error.detalle ?? e.error.mensaje} Se conserva la última lectura válida y los filtros anteriores.` });
  } else if (e.error) {
    const causa = e.error.tipo === 'red' ? 'No se puede conectar con la API (red, túnel o CORS).'
      : e.error.tipo === 'tiempo' ? 'La API no respondió a tiempo.'
      : e.error.mensaje;
    lista.push({ codigo: 'sin-conexion', severidad: 'error', rol: 'alert', titulo: TITULO_CONEXION[e.error.tipo] ?? 'Sin conexión con el backend', texto: `${causa} ${conLectura} Se reintenta automáticamente.` });
  }
  if (!e.error && e.recuperadoEn) {
    lista.push({ codigo: 'recuperado', severidad: 'info', rol: 'status', titulo: 'Conexión recuperada', texto: `La conexión con el backend se recuperó (${e.recuperadoEn} UTC) y los datos están actualizados.` });
  }
  if (!e.error && e.salud && e.salud.stale === true) {
    const umbral = typeof e.salud.stale_after_s === 'number' ? ` (umbral: ${e.salud.stale_after_s} s)` : '';
    const edad = e.salud.last_ingestion === null || e.salud.last_ingestion === undefined || typeof e.salud.ingestion_age_s !== 'number'
      ? 'todavía no hay ninguna ingesta correcta registrada'
      : `la última ingesta correcta de USGS fue hace ${formatoEdad(e.salud.ingestion_age_s * 1000)}${umbral}`;
    lista.push({ codigo: 'datos-desactualizados', severidad: 'aviso', rol: 'status', titulo: 'Datos desactualizados',
      texto: `El backend responde, pero ${edad}. Los eventos más recientes pueden faltar.` });
  }
  if (!e.error && !e.sinEjecuciones && e.hayLectura && e.cargados === 0 && (e.total === 0 || e.total === null)) {
    lista.push({ codigo: 'sin-eventos', severidad: 'info', rol: 'status', titulo: 'Sin eventos para estos filtros',
      texto: 'La consulta funcionó y no hay terremotos que cumplan los filtros en este periodo: no es un error ni una pérdida de conexión.' });
  }
  if (e.hayLectura && e.total !== null && e.cargados < e.total) {
    lista.push({ codigo: 'truncado', severidad: 'aviso', rol: 'status', titulo: 'Resultados truncados',
      texto: `Se muestran ${e.cargados} de ${e.total} eventos (la API limita cada respuesta). Las estadísticas, las gráficas y la comparación usan TODOS los eventos del periodo; la tabla y el mapa solo los cargados.` });
  }
  if (e.salud && typeof e.salud.gaps_pending === 'number' && e.salud.gaps_pending > 0) {
    lista.push({ codigo: 'huecos', severidad: 'aviso', rol: 'status', titulo: 'Huecos de ingesta pendientes',
      texto: `Hay ${e.salud.gaps_pending} ${e.salud.gaps_pending === 1 ? 'hueco' : 'huecos'} de ingesta sin recuperar: puede faltar actividad en esos intervalos.` });
  }
  return lista;
}

export type EstadoGeneral = { nivel: 'ok' | 'desactualizado' | 'sin-conexion'; texto: string };

/** Resumen de una línea: sin conexión > datos desactualizados > al día. */
export function estadoGeneral(e: EntradaEstado): EstadoGeneral {
  if (e.error && e.error.tipo === 'autorizacion') return { nivel: 'sin-conexion', texto: 'Acceso restringido: falta la clave de acceso' };
  if (e.error && e.error.tipo !== 'validacion') return { nivel: 'sin-conexion', texto: 'Sin conexión con el backend' };
  if (e.salud && e.salud.stale === true) return { nivel: 'desactualizado', texto: 'Datos desactualizados' };
  if (e.modo === 'replay') return { nivel: 'ok', texto: e.sinEjecuciones ? 'Reproducción: sin ejecuciones' : 'Reproducción histórica (no es actividad actual)' };
  return { nivel: 'ok', texto: e.hayLectura ? 'Datos al día' : 'Sin lectura todavía' };
}
