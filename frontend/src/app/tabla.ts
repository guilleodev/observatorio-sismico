// Lógica de la tabla consultable de eventos (F5, paso 5.5). Funciones PURAS y autocontenidas (solo `import type`): se prueban con `node --test`.
// La tabla es la alternativa al mapa y al color (ENUNCIADO §8.7): toda la información del mapa está también en texto. Un dato desconocido es `null`
// («sin valor»), nunca 0, y se ordena siempre al final.
import type { Evento, FilaTabla } from './modelos';

export type ClaveColumna = 'time' | 'mag' | 'magTipo' | 'profundidad' | 'clase' | 'lugar' | 'pais' | 'lon' | 'lat' | 'actualizado' | 'id';
export type Orden = { clave: ClaveColumna; direccion: 'asc' | 'desc' };
export type Columna = { clave: ClaveColumna; etiqueta: string; numerica: boolean };

/** Columnas = campos del contrato de /api/eventos: propiedades (`time`, `mag`, `magType`, `place`, `updated`, `country_*`), coordenadas e id. */
export const COLUMNAS: Columna[] = [
  { clave: 'time', etiqueta: 'Fecha (UTC)', numerica: true },
  { clave: 'mag', etiqueta: 'Magnitud', numerica: true },
  { clave: 'magTipo', etiqueta: 'Tipo de magnitud', numerica: false },
  { clave: 'profundidad', etiqueta: 'Profundidad (km)', numerica: true },
  { clave: 'clase', etiqueta: 'Clase de profundidad', numerica: false },
  { clave: 'lugar', etiqueta: 'Lugar', numerica: false },
  { clave: 'pais', etiqueta: 'País', numerica: false },
  { clave: 'lon', etiqueta: 'Longitud', numerica: true },
  { clave: 'lat', etiqueta: 'Latitud', numerica: true },
  { clave: 'actualizado', etiqueta: 'Actualizado (UTC)', numerica: true },
  { clave: 'id', etiqueta: 'ID', numerica: false },
];
const DESCENDENTE_PRIMERO: ClaveColumna[] = ['time', 'mag', 'profundidad', 'actualizado'];
export const ORDEN_INICIAL: Orden = { clave: 'time', direccion: 'desc' };
export const TAMANO_PAGINA = 25;
export const SIN_PAIS_TEXTO = 'Sin país asignado';

// Un único Intl.Collator reutilizado: `localeCompare` con opciones crea uno nuevo en CADA comparación (con 5 000 filas y muchos empates tardaba ~2 s; medido en 5.7).
const COLACION = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const porId = (a: FilaTabla, b: FilaTabla): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const finito = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Clase de profundidad en TEXTO (la misma que el color de la leyenda del mapa): la tabla no depende del color. */
export function claseProfundidad(profundidad: number | null): string {
  return profundidad === null ? 'sin valor' : profundidad < 70 ? 'Menos de 70 km' : profundidad < 300 ? '70–299,99 km' : '300 km o más';
}

/** Identificador estable de un evento: el id de la API; si faltara, uno derivado de su posición (el mismo en mapa y tabla). */
export function idDe(evento: Evento, indice: number): string {
  return evento.id !== undefined && evento.id !== null && String(evento.id) !== '' ? String(evento.id) : `sin-id-${indice}`;
}

export function filaDe(evento: Evento, indice: number): FilaTabla {
  const p = evento.properties;
  const c = evento.geometry?.type === 'Point' ? evento.geometry.coordinates : [];
  const profundidad = finito(c[2]);
  return {
    id: idDe(evento, indice), tiempo: finito(p?.time), mag: finito(p?.mag), magTipo: typeof p?.magType === 'string' && p.magType !== '' ? p.magType : null,
    profundidad, clase: claseProfundidad(profundidad), lugar: typeof p?.place === 'string' && p.place !== '' ? p.place : 'Sin descripción',
    pais: p?.country_name ?? SIN_PAIS_TEXTO, paisId: p?.country_id ?? null, lon: finito(c[0]), lat: finito(c[1]), actualizado: finito(p?.updated),
  };
}

function valor(fila: FilaTabla, clave: ClaveColumna): number | string | null {
  switch (clave) {
    case 'time': return fila.tiempo;
    case 'mag': return fila.mag;
    case 'magTipo': return fila.magTipo;
    case 'profundidad': return fila.profundidad;
    case 'clase': return fila.profundidad === null ? null : fila.profundidad;
    case 'lugar': return fila.lugar;
    case 'pais': return fila.pais;
    case 'lon': return fila.lon;
    case 'lat': return fila.lat;
    case 'actualizado': return fila.actualizado;
    case 'id': return fila.id;
  }
}

/** Ordena sin modificar la entrada. Los valores `null` van SIEMPRE al final (en ascendente y en descendente); el empate se desempata por id. */
export function ordenar(filas: FilaTabla[], orden: Orden): FilaTabla[] {
  const signo = orden.direccion === 'asc' ? 1 : -1;
  return [...filas].sort((a, b) => {
    const x = valor(a, orden.clave);
    const y = valor(b, orden.clave);
    if (x === null && y === null) return porId(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : COLACION.compare(String(x), String(y));
    return c !== 0 ? signo * c : porId(a, b);
  });
}

/** Siguiente orden al pulsar una columna: la misma columna invierte; una columna nueva empieza en el sentido más útil (lo más reciente / mayor primero). */
export function siguienteOrden(actual: Orden, clave: ClaveColumna): Orden {
  if (actual.clave === clave) return { clave, direccion: actual.direccion === 'asc' ? 'desc' : 'asc' };
  return { clave, direccion: DESCENDENTE_PRIMERO.includes(clave) ? 'desc' : 'asc' };
}

/** Minúsculas y sin tildes, para buscar «peru» y encontrar «Perú». */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Texto buscable de cada fila, normalizado UNA vez (no en cada pulsación de tecla).
const PAJARES = new WeakMap<FilaTabla, string>();
function pajar(f: FilaTabla): string {
  let t = PAJARES.get(f);
  if (t === undefined) {
    t = normalizar([f.lugar, f.pais, f.id, f.magTipo ?? '', f.clase, f.mag === null ? 'sin magnitud' : String(f.mag)].join(' '));
    PAJARES.set(f, t);
  }
  return t;
}

/** Filtra por texto: todas las palabras deben aparecer en el lugar, el país, el id, el tipo de magnitud, la clase de profundidad o la magnitud. */
export function buscar(filas: FilaTabla[], texto: string): FilaTabla[] {
  const palabras = normalizar(texto).split(/\s+/).filter((p) => p !== '');
  if (palabras.length === 0) return filas;
  return filas.filter((f) => palabras.every((p) => pajar(f).includes(p)));
}

export type Pagina = { filas: FilaTabla[]; pagina: number; paginas: number; desde: number; hasta: number; total: number };

/** Página `pagina` (1..n, ajustada al rango válido) de `tamano` filas. Con 0 filas: una página vacía (desde = hasta = 0). */
export function paginar(filas: FilaTabla[], pagina: number, tamano: number = TAMANO_PAGINA): Pagina {
  const paginas = Math.max(1, Math.ceil(filas.length / tamano));
  const actual = Math.min(Math.max(1, Math.trunc(pagina) || 1), paginas);
  const inicio = (actual - 1) * tamano;
  const trozo = filas.slice(inicio, inicio + tamano);
  return { filas: trozo, pagina: actual, paginas, desde: trozo.length === 0 ? 0 : inicio + 1, hasta: inicio + trozo.length, total: filas.length };
}

/** Página (1..n) que contiene el evento `id` en la lista ya ordenada/filtrada, o `null` si no está (para mantener visible la selección). */
export function paginaDe(filas: FilaTabla[], id: string, tamano: number = TAMANO_PAGINA): number | null {
  const i = filas.findIndex((f) => f.id === id);
  return i < 0 ? null : Math.floor(i / tamano) + 1;
}
