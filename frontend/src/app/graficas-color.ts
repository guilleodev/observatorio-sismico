// Color de las barras de la gráfica de PROFUNDIDAD (F7, ronda 3 «Mission Control»). Funciones PURAS y autocontenidas (sin imports en ejecución, R-011).
// Los hex y los cortes (70 y 300 km) ESPEJAN a `colorProfundidad` (formato.ts) y a la leyenda del mapa; tests/ronda3-analisis.test.ts comprueba la equivalencia.
// Verificación (backend/src/observatorio/api/estadisticas.py): BORDES_PROFUNDIDAD = (10, 30, 70, 150, 300, 500) → intervalos <10, 10–30, 30–70, 70–150, 150–300, 300–500, ≥500.
// Los bordes INCLUYEN los cortes 70 y 300, así que ningún intervalo atraviesa un corte y se puede colorear por la leyenda. Aun así la clasificación es defensiva:
// si un intervalo cruzara un corte (p. ej. [50, 100)) NO se colorea por la leyenda, sino con el neutro (no se inventa una clase para él).

export const COLOR_SOMERA = '#e8a317';
export const COLOR_MEDIA = '#e35b37';
export const COLOR_PROFUNDA = '#7b3fb6';
export const COLOR_NEUTRO = '#64748b';
export const CORTE_MEDIA_KM = 70;
export const CORTE_PROFUNDA_KM = 300;

/** Mismos rangos y textos que la leyenda del mapa (app.component.html, «Menos de 70 km» …). */
export const LEYENDA_PROFUNDIDAD: ReadonlyArray<{ texto: string; color: string }> = [
  { texto: 'Menos de 70 km', color: COLOR_SOMERA },
  { texto: '70–299,99 km', color: COLOR_MEDIA },
  { texto: '300 km o más', color: COLOR_PROFUNDA },
];

const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Color de UNA profundidad (copia de colorProfundidad): <70, <300, ≥300; gris si no es un número finito. */
export function colorDeProfundidad(p: unknown): string {
  return !esNumero(p) ? COLOR_NEUTRO : p < CORTE_MEDIA_KM ? COLOR_SOMERA : p < CORTE_PROFUNDA_KM ? COLOR_MEDIA : COLOR_PROFUNDA;
}

/** Rango (0 somera, 1 media, 2 profunda) del LÍMITE SUPERIOR EXCLUSIVO de un intervalo [desde, hasta): el mayor valor posible es justo por debajo de `hasta`. */
function rangoSuperior(hasta: number): number {
  return hasta <= CORTE_MEDIA_KM ? 0 : hasta <= CORTE_PROFUNDA_KM ? 1 : 2;
}

/**
 * Color de un intervalo de profundidad [desde, hasta) (extremo `null` = abierto). Se usa el LÍMITE INFERIOR con colorDeProfundidad, pero SOLO si el intervalo
 * completo cae dentro de un mismo rango de la leyenda; si cruza un corte, o los extremos no son válidos (NaN, texto, ambos abiertos), devuelve el neutro.
 */
export function colorIntervaloProfundidad(desde: unknown, hasta: unknown): string {
  if (desde !== null && !esNumero(desde)) return COLOR_NEUTRO;
  if (hasta !== null && !esNumero(hasta)) return COLOR_NEUTRO;
  if (desde === null && hasta === null) return COLOR_NEUTRO;
  const inferior = desde === null ? 0 : desde < CORTE_MEDIA_KM ? 0 : desde < CORTE_PROFUNDA_KM ? 1 : 2;   // abierto por debajo = somera
  const superior = hasta === null ? 2 : rangoSuperior(hasta);                                              // abierto por arriba = profunda
  if (inferior !== superior) return COLOR_NEUTRO;
  return colorDeProfundidad(desde === null ? (hasta as number) - 1 : desde);
}

/** Nombre del rango de la leyenda al que corresponde el color de una barra; null si es el neutro (el intervalo cruza un corte) o un color desconocido. Lo usa el tooltip. */
export function rangoDeColor(color: string | null | undefined): string | null {
  if (!color || color === COLOR_NEUTRO) return null;
  return LEYENDA_PROFUNDIDAD.find((l) => l.color === color)?.texto ?? null;
}

/** Leyenda en línea: los rangos de la leyenda del mapa, y «Sin clasificar» solo si alguna barra quedó en neutro. Sin colores por rango → [] (no hay leyenda). */
export function leyendaDeColores(colores: readonly string[] | null): Array<{ texto: string; color: string }> {
  if (!colores || colores.length === 0) return [];
  const hayRango = colores.some((c) => c !== COLOR_NEUTRO);
  if (!hayRango) return [];
  const leyenda = LEYENDA_PROFUNDIDAD.map((l) => ({ ...l }));
  if (colores.includes(COLOR_NEUTRO)) leyenda.push({ texto: 'Intervalo que cruza un corte', color: COLOR_NEUTRO });
  return leyenda;
}
