// Política de actualización del panel (F6, paso 6.6). Funciones PURAS y autocontenidas (solo `import type`): se prueban con `node --test`.
// En local (config.json del repositorio) todo sigue como en F5: refresco cada `refreshMs` y sin pausa. En el despliegue público el paso de build escribe
// `refreshMs: 600000` y `pausarSiOculta: true`: la cuota gratuita de ngrok (20 000 peticiones al mes) se agotaría en ≈ 4,6 días con UNA pestaña a 60 s (6.5).
import type { Config } from './modelos';

export const REFRESCO_PUBLICO_MS = 600_000; // 10 minutos
export const REFRESCO_MINIMO_MS = 30_000;
const CLAVES_SOSPECHOSAS = /token|secret|password|passwd|clave|apikey|api_key|authorization|credential/i;

/** ¿Debe suspenderse la consulta automática? Solo si la configuración lo pide (despliegue público) y la pestaña no es visible. */
export function pausada(oculta: boolean, config: Pick<Config, 'pausarSiOculta'> | undefined): boolean {
  return oculta && config?.pausarSiOculta === true;
}

/** Al volver a ver la pestaña: ¿hay que consultar ya? Sí si nunca hubo lectura, o si la última tiene al menos `refreshMs` (la actualización automática estaba en pausa). */
export function debeRefrescarAlVolver(ahoraMonotonicoMs: number, lecturaMonotonicaMs: number | null, refreshMs: number): boolean {
  return lecturaMonotonicaMs === null || ahoraMonotonicoMs - lecturaMonotonicaMs >= refreshMs;
}

export function formatoIntervalo(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'intervalo no válido';
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m} min` : `${Math.round(m / 60)} h`;
}

/** Frase única (compartida) sobre la suspensión con la pestaña oculta. */
const FRASE_PAUSA_OCULTA = 'La actualización automática se suspende mientras la pestaña no está visible.';

/** Texto visible sobre la actualización: intervalo, si se pausa con la pestaña oculta y que existe la actualización manual. */
export function textoActualizacion(config: Pick<Config, 'refreshMs' | 'pausarSiOculta'>): string {
  const pausa = config.pausarSiOculta === true ? ` ${FRASE_PAUSA_OCULTA}` : '';
  return `Actualización automática cada ${formatoIntervalo(config.refreshMs)}.${pausa} Puedes actualizar a mano con «Actualizar ahora».`;
}

/** F7: intervalo para el indicador compacto («cada 60 s»); con un intervalo no válido, no se inventa nada. */
export function textoIntervalo(config: Pick<Config, 'refreshMs'>): string {
  const f = formatoIntervalo(config.refreshMs);
  return f === 'intervalo no válido' ? f : `cada ${f}`;
}

/** F7: aviso de suspensión con la pestaña oculta para el indicador; null si la configuración no la activa (p. ej. en local). */
export function avisoPausaOculta(config: Pick<Config, 'pausarSiOculta'>): string | null {
  return config.pausarSiOculta === true ? FRASE_PAUSA_OCULTA : null;
}

/** Errores de un `config.json` (vacío = válido). No acepta claves que parezcan secretos ni un intervalo por debajo del mínimo que usa la aplicación. */
export function erroresDeConfig(c: unknown): string[] {
  const e: string[] = [];
  const o = (c ?? {}) as Record<string, unknown>;
  if (typeof c !== 'object' || c === null || Array.isArray(c)) return ['config.json debe ser un objeto'];
  if (o['mode'] !== 'demo' && o['mode'] !== 'api') e.push('mode debe ser «demo» o «api»');
  if (typeof o['apiUrl'] !== 'string' || !/^https?:\/\/[^\s/?#]+$/.test(o['apiUrl'])) e.push('apiUrl debe ser un origen http(s) sin ruta ni barra final');
  if (typeof o['refreshMs'] !== 'number' || !Number.isFinite(o['refreshMs']) || o['refreshMs'] < REFRESCO_MINIMO_MS) e.push(`refreshMs debe ser un número >= ${REFRESCO_MINIMO_MS}`);
  if (typeof o['skipNgrokWarning'] !== 'boolean') e.push('skipNgrokWarning debe ser booleano');
  if (o['pausarSiOculta'] !== undefined && typeof o['pausarSiOculta'] !== 'boolean') e.push('pausarSiOculta debe ser booleano');
  for (const k of Object.keys(o)) {
    if (!['mode', 'apiUrl', 'refreshMs', 'skipNgrokWarning', 'pausarSiOculta'].includes(k)) e.push(`clave desconocida: ${k}`);
    if (CLAVES_SOSPECHOSAS.test(k)) e.push(`la clave ${k} parece un secreto`);
  }
  return e;
}
