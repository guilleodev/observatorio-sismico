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

/** Complemento del contador de terremotos: «de N en el periodo · M omitidos por coordenadas inválidas» (sin «de N» si el total no se conoce). */
export function textoCobertura(total: number | null, omitidos: number): string {
  const omit = `${NUMERO.format(omitidos)} ${omitidos === 1 ? 'omitido' : 'omitidos'} por coordenadas inválidas`;
  return total === null ? omit : `de ${NUMERO.format(total)} en el periodo · ${omit}`;
}
