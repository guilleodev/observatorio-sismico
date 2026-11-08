// Texto de la comparación con 2025 (F5, paso 5.5). Funciones PURAS y autocontenidas. Las cifras las calcula la API (/api/estadisticas → `comparacion`):
// aquí solo se redactan. REGLA DE REDACCIÓN (hallazgo de 5.3): una diferencia frente a 2025 NO se presenta como «descenso» o «aumento» real demostrado,
// porque el feed en vivo y el histórico no tienen la misma cobertura de detección por debajo de M4,5 fuera de EE. UU.
import type { Comparacion } from './modelos';

const num = (n: number, decimales = 0): string => n.toFixed(decimales).replace('.', ',');
const MAG_COBERTURA_COMPLETA = 4.5;

const MOTIVOS: Record<string, string> = {
  hueco_pendiente: 'hay un hueco de ingesta pendiente dentro del periodo (faltan datos que aún no se han recuperado)',
  antes_de_cobertura: 'el periodo empieza antes de la cobertura real de los datos en vivo (el sistema aún no los recogía)',
  hasta_ahora: 'el periodo llega hasta el momento actual y USGS publica y revisa los terremotos con retraso',
  despues_de_ultima_lectura: 'el periodo termina después de la última lectura correcta del feed de USGS',
};

export function etiquetaMotivo(motivo: string): string {
  return MOTIVOS[motivo] ?? motivo;
}

/** Diferencia relativa frente a lo esperado, en porcentaje con signo (neutral: no dice «descenso»); «no definida» si la media de 2025 es 0. */
export function textoVariacion(c: Comparacion): string {
  if (!c.variacion_definida || c.variacion === null) return 'no definida (la media de 2025 para este filtro es 0)';
  const pct = c.variacion * 100;
  const decimales = Math.abs(pct) >= 10 ? 0 : 1;
  return `${pct >= 0 ? '+' : '−'}${num(Math.abs(pct), decimales)} %`;
}

export function textoAmbito(c: Comparacion, nombrePais?: string): string {
  return c.ambito === 'global' ? 'todo el mundo' : c.ambito === 'sin_pais' ? 'Sin país asignado' : `país ${nombrePais ?? c.country_id ?? ''}`.trim();
}

export type FilaComparacion = { concepto: string; valor: string; fuente: string };

/** Filas de la tarjeta: cada cifra con su fuente (`live` o `historico`: nunca mezcladas). */
export function filasComparacion(c: Comparacion): FilaComparacion[] {
  const filas: FilaComparacion[] = [
    { concepto: `Terremotos del periodo con magnitud ≥ ${num(c.min_mag_efectiva, c.min_mag_efectiva % 1 === 0 ? 0 : 1)}`, valor: String(c.reciente.count), fuente: 'Feed en vivo (live)' },
    { concepto: 'Eventos del periodo sin magnitud (aparte: no cumplen ningún mínimo)', valor: String(c.reciente.sin_magnitud), fuente: 'Feed en vivo (live)' },
    { concepto: 'Duración del periodo (días)', valor: num(c.reciente.dias, c.reciente.dias % 1 === 0 ? 0 : 2), fuente: 'Filtros aplicados' },
  ];
  if (c.historico) {
    const h = c.historico;
    filas.push(
      { concepto: `Terremotos de 2025 (${h.dias} días)`, valor: String(h.total), fuente: 'Histórico de 2025 (historico)' },
      { concepto: 'Media diaria de 2025 (total ÷ 365; los días sin eventos también cuentan)', valor: num(h.media_diaria, 2), fuente: 'Histórico de 2025 (historico)' },
      { concepto: 'Mediana diaria de 2025 (la media se infla con las réplicas)', valor: num(h.mediana_diaria, 1), fuente: 'Histórico de 2025 (historico)' },
      { concepto: 'Esperado para este periodo según 2025 (media diaria × días)', valor: num(h.esperado_para_ventana, 1), fuente: 'Histórico de 2025 (historico)' },
      { concepto: 'Diferencia del recuento frente a lo esperado', valor: textoVariacion(c), fuente: 'Calculado por la API' },
    );
  }
  return filas;
}

export type Advertencias = { magnitudElevada: string | null; coberturaBaja: string | null; incompleto: string | null; motivos: string[]; noDisponible: string | null };

/** Avisos de la tarjeta: magnitud elevada a 4, cobertura por debajo de M4,5, periodo posiblemente incompleto (con sus motivos) y comparación no disponible. */
export function advertencias(c: Comparacion): Advertencias {
  return {
    magnitudElevada: c.min_mag_elevada ? 'La comparación se hace con magnitud ≥ 4 porque el histórico de 2025 solo contiene terremotos de M4 o más (en ambos periodos).' : null,
    coberturaBaja: c.min_mag_efectiva < MAG_COBERTURA_COMPLETA
      ? `Con magnitud mínima ${num(c.min_mag_efectiva, c.min_mag_efectiva % 1 === 0 ? 0 : 1)} la cobertura del feed en vivo es menor que la del histórico: la diferencia puede deberse a detecciones no publicadas y no a un cambio real de actividad.`
      : null,
    incompleto: c.periodo_reciente_incompleto
      ? 'El recuento reciente podría subir cuando USGS publique o revise más datos (el periodo puede estar incompleto).'
      : null,
    motivos: c.motivos_incompleto.map(etiquetaMotivo),
    noDisponible: c.comparacion_disponible ? null : 'Comparación no disponible: no hay histórico de 2025 cargado. No se muestran valores inventados.',
  };
}
