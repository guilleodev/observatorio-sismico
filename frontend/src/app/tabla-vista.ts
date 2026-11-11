// Vista Eventos (F7, ronda 4 «Mission Control»): lógica PURA de la presentación de la tabla. Solo `import type` (se prueba con `node --test`); no cambia datos, columnas ni orden (eso es tabla.ts).
import type { ClaveColumna } from './tabla';

/** Columnas PRINCIPALES (texto normal, más peso): Fecha como ancla temporal, Magnitud, Profundidad y Lugar. El resto son SECUNDARIAS (atenuadas, más pequeñas): siguen presentes. */
export const CLAVES_PRINCIPALES: readonly ClaveColumna[] = ['time', 'mag', 'profundidad', 'lugar'];
export function esColumnaPrincipal(clave: ClaveColumna): boolean { return CLAVES_PRINCIPALES.includes(clave); }

/** Densidad de las filas: solo cambia alturas, rellenos y tamaño de letra (nunca los datos). Vive en una señal en memoria: sin almacenamiento del navegador. */
export type Densidad = 'comoda' | 'compacta';
export const DENSIDAD_INICIAL: Densidad = 'comoda';
export const DENSIDADES: readonly { valor: Densidad; etiqueta: string }[] = [
  { valor: 'comoda', etiqueta: 'Cómoda' },
  { valor: 'compacta', etiqueta: 'Compacta' },
];
/** Altura mínima (px) de la fila: cómoda ≥ 44 (táctil); compacta ≥ 28 (la zona clicable de la fila es el botón del lugar, que ocupa toda la altura). */
export const ALTURA_FILA: Record<Densidad, number> = { comoda: 44, compacta: 30 };
export function densidadValida(valor: unknown): Densidad { return valor === 'compacta' ? 'compacta' : 'comoda'; }

/** Parte una fecha ISO en dos líneas visuales («2026-11-11» / «T10:25:31.800Z»): concatenadas dan EXACTAMENTE el texto original (lectores y búsqueda ven el ISO íntegro). «ND» → una sola línea. */
export function partirFecha(iso: string): [string, string] {
  const i = iso.indexOf('T');
  return i < 0 ? [iso, ''] : [iso.slice(0, i), iso.slice(i)];
}

/** Partición del contador «226 eventos cargados de 1.200 del periodo» en la cifra principal (se pinta grande, en mono) y el resto del texto (misma información). */
export function partirContador(texto: string): { cifra: string; resto: string } {
  const m = /^(\d[\d.  ]*)\s(.*)$/s.exec(texto);
  return m ? { cifra: m[1], resto: m[2] } : { cifra: '', resto: texto };
}

// ---------- Pulido final (F7): fechas legibles, alturas coherentes y vista previa ----------
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];   // misma lista que graficas-eje.ts (los módulos puros no se importan entre sí)

/**
 * Fecha UTC legible en dos líneas SIN perder información: «11 nov 2026» / «10:25:31.800 UTC». Se pinta dentro de un `<time datetime="ISO">`, así que el ISO completo sigue siendo el
 * valor semántico. Si el texto no es un ISO válido («ND», «sin valor»…) se devuelve tal cual en una sola línea.
 */
export function fechaLegible(iso: string): { dia: string; hora: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)Z$/.exec(iso);
  if (!m) return { dia: iso, hora: '' };
  const mes = Number(m[2]);
  if (!(mes >= 1 && mes <= 12)) return { dia: iso, hora: '' };
  return { dia: `${Number(m[3])} ${MESES[mes - 1]} ${m[1]}`, hora: `${m[4]} UTC` };
}

/** Filas completas visibles a la vez en el contenedor de la tabla (la altura del contenedor es un número ENTERO de filas, para que la última no quede cortada). */
export const FILAS_VISIBLES: Record<Densidad, number> = { comoda: 11, compacta: 16 };
/** Alto (px) de la cabecera sticky de la tabla (debe coincidir con `thead th { height }`). */
export const ALTURA_CABECERA_TABLA = 44;
/** Altura máxima del contenedor: cabecera + filas enteras (+1 px de la línea inferior). */
export function alturaContenedor(densidad: Densidad): number { return ALTURA_CABECERA_TABLA + FILAS_VISIBLES[densidad] * ALTURA_FILA[densidad] + 1; }

/** Vista previa: tamaño fijo del popover (px) y retardos de aparición y cierre (evitan parpadeos al cruzar filas). */
export const PREVIA = { ancho: 300, alto: 156, separacion: 8, retardoAbrirMs: 220, retardoCerrarMs: 170 } as const;

/** ¿El clic nació en un control interior (botón, enlace, campo…)? Entonces NO debe seleccionar la fila (ya lo gestiona ese control): evita acciones duplicadas. */
export const SELECTOR_CONTROLES = 'button, a, input, select, textarea, label, summary, [role="button"]';

/** Texto de la línea de datos de la vista previa («M 5.6 · 35 km»); ND si falta algo, nunca un 0 inventado. */
export function textoDatosPrevia(mag: number | null, profundidad: number | null): string {
  const dos = (v: number): number => Number(v.toFixed(2));   // mismo redondeo de lectura que la tabla (2 decimales): quita el ruido de coma flotante de la API (1,53999996 → 1,54)
  const m = typeof mag === 'number' && Number.isFinite(mag) ? `M ${dos(mag)}` : 'M ND';
  const p = typeof profundidad === 'number' && Number.isFinite(profundidad) ? `${dos(profundidad)} km` : 'profundidad ND';
  return `${m} · ${p}`;
}

/** ¿Hay coordenadas válidas para dibujar el punto en la vista previa? (mismo criterio que el mapa: finitas y dentro de rango). */
export function coordenadasValidas(lat: number | null, lon: number | null): boolean {
  return typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}
