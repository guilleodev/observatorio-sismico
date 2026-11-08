// Formato y codificación visual de los eventos (F5, paso 5.4). Extraído SIN cambios de comportamiento de `app.component.ts` (frontend proporcionado):
// mismos colores por profundidad, mismo radio por magnitud y mismo texto de la ficha. Funciones puras, autocontenidas (sin imports en ejecución).

/** Número finito o `null` (la API usa null, nunca NaN, para valores desconocidos). */
export function numeroFinito(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

/** Fecha ISO 8601 UTC de un instante en milisegundos, o «ND» si no es válido. */
export function fechaUtc(valor: unknown): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return 'ND';
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? 'ND' : d.toISOString();
}

/** Color por profundidad: <70 km, 70–299,99 km, ≥300 km; gris si no hay dato. */
export function colorProfundidad(profundidad: unknown): string {
  const p = numeroFinito(profundidad);
  return p === null ? '#64748b' : p < 70 ? '#e8a317' : p < 300 ? '#e35b37' : '#7b3fb6';
}

/** Borde oscuro de los círculos (F6, 6.7): el relleno amarillo/naranja por profundidad tenía 1,3:1 frente al mar y al continente de OpenStreetMap; con este borde la forma se distingue a >= 3:1 (WCAG 1.4.11). */
export const BORDE_MAPA = '#1f2937';

/** Estilo de un círculo del mapa: relleno por profundidad (sin cambios), mismo tamaño y borde oscuro de 1,5 px. */
export function estiloCirculo(color: string, radio: number) {
  return { radius: radio, color: BORDE_MAPA, fillColor: color, fillOpacity: 0.75, weight: 1.5 };
}

/** Razón de contraste WCAG entre dos colores `#rrggbb` (NaN si alguno no es válido). */
export function razonContraste(a: string, b: string): number {
  const luz = (h: string): number => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
    if (!m) return NaN;
    const [r, g, bl] = [m[1], m[2], m[3]].map((x) => { const v = parseInt(x, 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [luz(a), luz(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Radio del círculo: creciente con la magnitud (no representa energía ni área); sin magnitud, el mínimo visible (4). */
export function radioMagnitud(magnitud: unknown): number {
  const m = numeroFinito(magnitud);
  return m === null ? 4 : Math.max(3, Math.min(18, 3 + (m + 1) * 2));
}

/** Texto de la ficha del evento (se inserta siempre como texto, nunca como HTML). F5 amplía la ficha entregada con el tipo de magnitud y la fecha de actualización. */
export function textoFicha(propiedades: { place?: string | null; mag?: unknown; magType?: string | null; time?: unknown; updated?: unknown; country_name?: string | null }, profundidad: unknown, id: unknown): string {
  const mag = numeroFinito(propiedades.mag);
  const prof = numeroFinito(profundidad);
  return `${propiedades.place ?? 'Sin descripción'}
Magnitud: ${mag ?? 'ND'}
Tipo de magnitud: ${propiedades.magType ?? 'ND'}
Profundidad: ${prof !== null ? prof + ' km' : 'ND'}
` +
    `Fecha UTC: ${fechaUtc(propiedades.time)}
Actualizado UTC: ${fechaUtc(propiedades.updated)}
País: ${propiedades.country_name ?? 'Sin país asignado'}
ID: ${id ?? 'ND'}`;
}

/** «sin valor» para un dato nulo; nunca se muestra 0 en su lugar. Con `decimales` redondea solo la PRESENTACIÓN (6.15000009536743 → 6.15); el valor ordenado y buscado no cambia. */
export function textoOSinValor(valor: unknown, unidad = '', decimales?: number): string {
  const n = numeroFinito(valor);
  if (n === null) return 'sin valor';
  return `${decimales === undefined ? n : Number(n.toFixed(decimales))}${unidad}`;
}
