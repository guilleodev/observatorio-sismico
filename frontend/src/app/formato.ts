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

/**
 * F7 (mapa): estilo del mapa base. «oscuro» es el predeterminado; «claro» es el aspecto original de OpenStreetMap. La elección vive solo en memoria.
 * IMPORTANTE: cambiar de estilo modifica ÚNICAMENTE el color del borde de los círculos (y el de las fronteras); relleno por profundidad, tamaño y opacidad no cambian.
 */
export type EstiloMapa = 'oscuro' | 'claro';
export const ESTILO_MAPA_INICIAL: EstiloMapa = 'oscuro';
/** Fondo del contenedor del mapa (visible si se apaga la base). Deben coincidir con --mapa-fondo-oscuro / --mapa-fondo-claro de styles.css (lo comprueba tests/mapa.test.ts). */
export const FONDO_MAPA: Record<EstiloMapa, string> = { oscuro: '#12151a', claro: '#dceaf1' };
/** Borde claro de los círculos sobre base oscura: el borde #1f2937 se perdería (contraste < 3:1). */
export const BORDE_MAPA_OSCURO = '#e2e8f0';
/** Color de la selección (el grosor pasa de 1,5 a 4 px en ambos estilos); en oscuro, cian del sistema de diseño. */
export const SELECCION_MAPA: Record<EstiloMapa, string> = { claro: '#111827', oscuro: '#67e8f9' };
/** Color de las fronteras (mismo grosor y geometría): en oscuro se aclara para que no se pierda. */
export const BORDE_FRONTERA: Record<EstiloMapa, string> = { claro: '#334155', oscuro: '#8fa3bf' };

/** Borde normal de los círculos según el estilo del mapa. */
export function bordeMapa(estilo: EstiloMapa): string {
  return estilo === 'oscuro' ? BORDE_MAPA_OSCURO : BORDE_MAPA;
}

/** Estilo de un círculo del mapa: relleno por profundidad (sin cambios), mismo tamaño y borde de 1,5 px (oscuro por defecto; claro sobre base oscura). */
export function estiloCirculo(color: string, radio: number, borde: string = BORDE_MAPA) {
  return { radius: radio, color: borde, fillColor: color, fillOpacity: 0.75, weight: 1.5 };
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

/** Radio máximo de `radioMagnitud` (px del mapa). */
export const RADIO_MAXIMO_MAPA = 18;
/** Diámetro máximo (px) del punto de magnitud de la tabla: 16 px, el tope de la vista Eventos. */
export const DIAMETRO_MAXIMO_PUNTO = 16;

/**
 * CAMBIO (ronda 4 Mission Control, Eventos): diámetro (px) del punto de refuerzo visual junto a la magnitud en la tabla. NO es una escala nueva: es la de `radioMagnitud` del mapa
 * (radio 3–18 px) reducida proporcionalmente para que el radio máximo (18) dé el diámetro máximo (16 px): diámetro = radio × 16/18 (= 2 × radio × 16/36). Sin tope aparte: el tope
 * lo da ya el radio máximo. Sin magnitud (null, NaN, texto…) devuelve `null`: la tabla no dibuja punto (el texto «sin valor» ya lo dice; nunca se inventa un tamaño).
 */
export function diametroPuntoMagnitud(magnitud: unknown): number | null {
  if (numeroFinito(magnitud) === null) return null;
  return Math.round((radioMagnitud(magnitud) * DIAMETRO_MAXIMO_PUNTO / RADIO_MAXIMO_MAPA) * 10) / 10;
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

export interface FilaFicha { etiqueta: string; valor: string }
/** `insignia` = «Magnitud 4.8» (texto completo: popup del mapa 2D y lectores de pantalla); `magnitud` = «M 4.8» (forma corta y grande de la ficha del globo 3D). */
export interface FichaEvento { lugar: string; insignia: string; magnitud: string; filas: FilaFicha[] }

/**
 * Magnitud en forma corta, «M 4.8» (el valor tal cual llega, sin redondear: igual que la insignia y la etiqueta del globo, que dice «lugar · M 4.8»); «M ND» si falta o no es un número
 * finito. Un cero real se conserva («M 0»); nunca se confunde con la profundidad (esa lleva «km»).
 */
export function textoMagnitud(mag: unknown): string {
  return `M ${numeroFinito(mag) ?? 'ND'}`;
}

/**
 * F7 (mapa): la misma información que `textoFicha`, estructurada para la ventana emergente (título, insignia de magnitud y filas etiqueta/valor).
 * Los textos son equivalentes a los de `textoFicha`; el componente los inserta con textContent (nunca HTML).
 */
export function filasFicha(propiedades: { place?: string | null; mag?: unknown; magType?: string | null; time?: unknown; updated?: unknown; country_name?: string | null }, profundidad: unknown, id: unknown): FichaEvento {
  const mag = numeroFinito(propiedades.mag);
  const prof = numeroFinito(profundidad);
  return {
    lugar: propiedades.place ?? 'Sin descripción',
    insignia: `Magnitud ${mag ?? 'ND'}`,
    magnitud: textoMagnitud(propiedades.mag),
    filas: [
      { etiqueta: 'Tipo de magnitud', valor: propiedades.magType ?? 'ND' },
      { etiqueta: 'Profundidad', valor: prof !== null ? Math.round(prof * 100) / 100 + ' km' : 'ND' },   // CAMBIO (cierre F7): sin ruido de coma flotante («5.23000001907349 km» → «5.23 km»)
      { etiqueta: 'Fecha UTC', valor: fechaUtc(propiedades.time) },
      { etiqueta: 'Actualizado UTC', valor: fechaUtc(propiedades.updated) },
      { etiqueta: 'País', valor: propiedades.country_name ?? 'Sin país asignado' },
      { etiqueta: 'ID', valor: String(id ?? 'ND') },
    ],
  };
}

/** «sin valor» para un dato nulo; nunca se muestra 0 en su lugar. Con `decimales` redondea solo la PRESENTACIÓN (6.15000009536743 → 6.15); el valor ordenado y buscado no cambia. */
export function textoOSinValor(valor: unknown, unidad = '', decimales?: number): string {
  const n = numeroFinito(valor);
  if (n === null) return 'sin valor';
  return `${decimales === undefined ? n : Number(n.toFixed(decimales))}${unidad}`;
}
