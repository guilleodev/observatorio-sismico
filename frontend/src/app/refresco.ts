// Indicador de actualización (F7). Funciones PURAS y autocontenidas (solo `import type`): se prueban con `node --test`.
// Distingue DOS conceptos que no deben confundirse:
//  - «Refresco del panel»: cuándo el FRONTEND leyó la API por última vez con éxito (reloj monotónico local, `performance.now()`).
//  - «Última ingesta de USGS»: dato del BACKEND (`salud.last_ingestion` / `ingestion_age_s`), medido con el reloj de la API.
// El estado se deriva de señales reales (cargando, error, lectura, pausa, clave): nunca se muestra «Correcto» si la última petición falló.
import type { Salud } from './modelos';

export type EstadoRefresco = 'correcto' | 'actualizando' | 'error' | 'pausa' | 'sin-lectura' | 'acceso' | 'filtros-rechazados';

export type EntradaRefresco = {
  /** ¿Hay una petición en curso? */
  cargando: boolean;
  /** ¿Falló DE VERDAD la última consulta de refresco (red, tiempo, servidor o formato)? No incluye filtros rechazados, falta de clave ni fallos de «cargar el resto». */
  hayError: boolean;
  /** La API rechazó los filtros (validación): es un aviso, no un fallo de refresco; se conserva la última lectura válida. Opcional (por defecto, false). */
  filtrosRechazados?: boolean;
  /** ¿Existe alguna lectura correcta en pantalla? */
  hayLectura: boolean;
  /** Consulta automática suspendida porque la pestaña está oculta. */
  enPausa: boolean;
  /** La API exige clave y todavía no hay una aceptada. */
  pideClave: boolean;
};

/** Texto visible de cada estado (en español). */
export const ETIQUETAS_ESTADO: Record<EstadoRefresco, string> = {
  correcto: 'Correcto',
  actualizando: 'Actualizando…',
  error: 'Error',
  pausa: 'En pausa',
  'sin-lectura': 'Sin lectura',
  acceso: 'Acceso restringido',
  'filtros-rechazados': 'Filtros rechazados',
};

/** Texto de apoyo visible solo en los estados que lo necesitan (null = ninguno). */
export function detalleEstado(estado: EstadoRefresco): string | null {
  return estado === 'filtros-rechazados' ? 'se conserva la última lectura válida' : null;
}

/**
 * Micro-etiqueta de aviso para la cabecera (ronda 1 Mission Control): texto corto que acompaña al estado cuando el desplegable está CERRADO y el estado exige atención
 * (error, pausa, acceso). null = no hay aviso. Es un refuerzo visual: el estado ya se dice con icono + texto y la región viva del indicador lo anuncia aparte.
 */
export function microAviso(estado: EstadoRefresco): string | null {
  switch (estado) {
    case 'error': return 'Datos sin actualizar';
    case 'pausa': return 'Auto en pausa';
    case 'acceso': return 'Falta la clave';
    default: return null;
  }
}

/** ¿El estado merece llamar la atención en la cabecera (tono ámbar/rojo + marca en el botón de detalles)? */
export function esEstadoDeAviso(estado: EstadoRefresco): boolean {
  return estado === 'error' || estado === 'pausa' || estado === 'acceso' || estado === 'filtros-rechazados';
}

/** Prioridad: clave > petición en curso > error real > filtros rechazados > pausa > lectura correcta. «Correcto» solo si hay lectura y la última petición no falló. */
export function estadoRefresco(e: EntradaRefresco): EstadoRefresco {
  if (e.pideClave) return 'acceso';
  if (e.cargando) return 'actualizando';
  if (e.hayError) return 'error';
  if (e.filtrosRechazados) return 'filtros-rechazados';
  if (e.enPausa) return 'pausa';
  return e.hayLectura ? 'correcto' : 'sin-lectura';
}

/**
 * Anuncio para lector de pantalla al pasar del estado ESTABLE anterior al actual (null = no anunciar nada).
 * `anterior` es el último estado distinto de «actualizando» (el componente lo mantiene). Solo se anuncian cambios relevantes de conexión:
 * un refresco normal («Actualizando…» → «Correcto») no dice nada; un correcto tras un error sí, una vez.
 */
export function anuncioRefresco(anterior: EstadoRefresco | null, actual: EstadoRefresco): string | null {
  if (actual === 'actualizando' || actual === anterior) return null;
  switch (actual) {
    case 'error': return 'No se pudo actualizar: se conserva la última lectura.';
    case 'acceso': return 'Acceso restringido: se necesita la clave de acceso.';
    case 'pausa': return 'Actualización automática en pausa: la pestaña no está visible.';
    case 'filtros-rechazados': return 'Filtros rechazados por la API: se conserva la última lectura válida.';
    case 'correcto':
      if (anterior === 'error') return 'Conexión recuperada: datos actualizados';
      if (anterior === 'pausa') return 'Actualización automática reanudada.';
      if (anterior === 'acceso') return 'Acceso concedido: datos actualizados.';
      if (anterior === 'filtros-rechazados') return 'Datos actualizados: los filtros ya no se rechazan.';   // CAMBIO (cierre F7): sin esto el aviso «Filtros rechazados…» quedaba obsoleto en la región viva
      return null;
    default: return null; // «sin-lectura»
  }
}

/** «45 s», «3 min 05 s», «2 h 10 min», «1 d 4 h» (misma salida que `formatoEdad` de estado.ts; copia local para que este archivo sea autocontenido). */
export function formatoDuracion(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'ND';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${String(m % 60).padStart(2, '0')} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** Tiempo desde el último refresco CORRECTO (edad medida con reloj monotónico); null = nunca hubo uno. */
export function textoUltimoRefresco(edadMs: number | null): string {
  if (edadMs === null || !Number.isFinite(edadMs)) return 'sin lectura correcta todavía';
  if (edadMs < 1000) return 'ahora mismo';
  return `hace ${formatoDuracion(edadMs)}`;
}

/** Milisegundos que faltan para el siguiente intento automático (>= 0), o null si no hay ninguno programado. */
export function restanteMs(ahoraMonotonico: number, proximoMonotonico: number | null): number | null {
  return proximoMonotonico === null ? null : Math.max(0, proximoMonotonico - ahoraMonotonico);
}

/** Siguiente intento: la cuenta atrás real o, si no hay intento programado, el MOTIVO (nunca una cuenta atrás inventada). */
export function textoSiguienteIntento(e: EntradaRefresco, restante: number | null): string {
  if (e.pideClave) return 'detenido hasta que se escriba la clave de acceso';
  if (e.enPausa) return 'en pausa: la pestaña no está visible; se reanuda al volver';
  if (e.cargando) return 'consultando ahora…';
  if (restante === null) return 'sin intento programado';
  const cuenta = restante <= 0 ? 'en breve' : `en ${formatoDuracion(Math.ceil(restante / 1000) * 1000)}`;
  return e.hayError ? `${cuenta} (reintento tras el error)` : cuenta;
}

/** Última ingesta de USGS según el BACKEND: compacta, o «sin dato». `ingestion_age_s` se midió al leer /api/salud (con el reloj de la API). */
export function textoIngestaCompacto(salud: Pick<Salud, 'last_ingestion' | 'ingestion_age_s'> | null): string {
  if (!salud || salud.last_ingestion === null || salud.last_ingestion === undefined) return 'sin dato';
  if (typeof salud.ingestion_age_s === 'number' && Number.isFinite(salud.ingestion_age_s) && salud.ingestion_age_s >= 0) {
    return `hace ${formatoDuracion(salud.ingestion_age_s * 1000)} al consultar`;
  }
  const f = new Date(salud.last_ingestion);
  return Number.isNaN(f.getTime()) ? 'sin dato' : `${f.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
