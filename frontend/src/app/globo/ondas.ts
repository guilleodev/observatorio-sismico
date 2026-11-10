// Globo 3D (F7, 4.ª iteración · mejora 2): lógica PURA de las «ondas» de eventos nuevos (un anillo breve que se expande UNA sola vez). Sin three, sin DOM, sin imports en
// ejecución (se prueba con `node --test`). El anillo se dibuja en escena.ts (un InstancedMesh pequeño de MAX_ONDAS instancias + un uniform de tiempo); aquí solo se decide
// QUÉ ids lo disparan y cuántos a la vez.
//
// NO es una onda sísmica física ni tiene pretensión científica: es una señal visual de «ha llegado un evento».
//
// DEFINICIÓN EXACTA de «recién incorporado»: un id que
//   (1) NO estaba en el conjunto de ids de la lectura ANTERIOR de esta vista (se guarda el conjunto de la última llamada a `procesar`), y
//   (2) existe una lectura previa NO VACÍA (la primera lectura tras iniciar la escena, o tras `reiniciarBase()`, solo fija la base: no dispara nada), y
//   (3) no ha disparado ya antes (Set `ondeados`, acotado a MAX_IDS_ONDEADOS: un id «revisado» que sale y vuelve a entrar no repite), y
//   (4) la lectura NO es un cambio de conjunto «grande»: se comparte al menos MIN_FRACCION_COMUN (50 %) de los ids anteriores y los ids nuevos son como mucho MAX_NUEVOS_LOTE.
//
// REINICIO al cambiar de modo (En vivo ↔ REPRODUCCIÓN), de ejecución o de filtros: el componente del globo ya recibe `replay`, `etiqueta` y `filtros`; cuando cambia cualquiera
// de ellos llama a `reiniciarBase()` (escena.reiniciarBaseOndas) ANTES de que lleguen los datos nuevos, y el siguiente lote solo fija la base. La heurística (4) es la red de
// seguridad por si el cambio llegara sin esa señal (p. ej. «cargar el resto» trae muchos eventos de golpe: es un lote grande, no «llegada»).
// Un lote vacío nunca fija la base (lo que llega entre el vaciado de la lectura y los datos nuevos no cuenta como «lectura anterior»).

/** Anillos simultáneos como máximo (tamaño del pool de la escena). Si llegan más, se priorizan por magnitud y el resto se descarta SIN cola. */
export const MAX_ONDAS = 8;
/** Duración de cada anillo (ms). */
export const DURACION_ONDA_MS = 2200;
/** Fracción mínima de los ids anteriores que debe seguir presente para considerar la lectura una continuación (y no un cambio de conjunto). */
export const MIN_FRACCION_COMUN = 0.5;
/** Más ids nuevos que esto en una sola lectura = carga masiva (cambio de periodo, «cargar el resto»…), no «llegada de eventos». */
export const MAX_NUEVOS_LOTE = 50;
/** Tope del Set de ids que ya dispararon (los más antiguos se olvidan): la memoria no crece sin fin en sesiones largas. */
export const MAX_IDS_ONDEADOS = 5000;
/** Valor de `aInicio` de una instancia libre: el anillo queda «caducado» desde siempre y el shader lo descarta. */
export const INICIO_INACTIVO = -1e6;

export type MotivoOndas = 'base' | 'reinicio' | 'lote-grande' | 'ok';
export interface DecisionOndas {
  motivo: MotivoOndas;
  /** Índices (en el orden recibido) de los eventos que disparan anillo, por magnitud descendente y como máximo `max`. */
  disparan: number[];
  /** Cuántos ids nuevos hubo (antes de limitar). */
  nuevos: number;
}

export interface EntradaOndas {
  /** Ids de la lectura ANTERIOR; null = no hay base (primera lectura o reinicio explícito). */
  anterior: ReadonlySet<string> | null;
  ids: ArrayLike<string>;
  /** Magnitud por id (NaN = sin magnitud: va al final). */
  magnitudes: ArrayLike<number>;
  n: number;
  ondeados: ReadonlySet<string>;
  max?: number;
  minFraccion?: number;
  maxNuevos?: number;
}

/** Función pura: decide qué eventos de la lectura actual disparan anillo. No modifica ningún conjunto. */
export function decidirOndas(e: EntradaOndas): DecisionOndas {
  const max = e.max ?? MAX_ONDAS; const minFraccion = e.minFraccion ?? MIN_FRACCION_COMUN; const maxNuevos = e.maxNuevos ?? MAX_NUEVOS_LOTE;
  if (e.anterior === null) return { motivo: 'base', disparan: [], nuevos: 0 };
  if (e.anterior.size === 0) return { motivo: 'reinicio', disparan: [], nuevos: 0 };            // lo anterior estaba vacío: lo que llega es una carga, no una llegada
  let comunes = 0; const nuevos: number[] = [];
  for (let i = 0; i < e.n; i++) {
    const id = e.ids[i];
    if (e.anterior.has(id)) comunes++;
    else if (!e.ondeados.has(id)) nuevos.push(i);
  }
  if (comunes / e.anterior.size < minFraccion) return { motivo: 'reinicio', disparan: [], nuevos: nuevos.length };   // otro conjunto (modo, filtros, periodo)
  if (nuevos.length > maxNuevos) return { motivo: 'lote-grande', disparan: [], nuevos: nuevos.length };
  const mag = (i: number): number => (Number.isNaN(e.magnitudes[i]) ? -Infinity : e.magnitudes[i]);
  // magnitud descendente; a igualdad, id menor (determinista, independiente del orden de entrada)
  nuevos.sort((a, b) => (mag(b) - mag(a) || 0) || (e.ids[a] < e.ids[b] ? -1 : e.ids[a] > e.ids[b] ? 1 : 0));
  return { motivo: 'ok', disparan: nuevos.slice(0, Math.max(0, max)), nuevos: nuevos.length };
}

/** Estado entre lecturas: la base de ids y los ids que ya dispararon. Una instancia por escena. */
export class SeguimientoOndas {
  private anterior: Set<string> | null = null;
  private readonly ondeados = new Set<string>();

  /** Descarta la base: el siguiente lote NO vacío solo la fija (sin ondas). Los ids ya «ondeados» se conservan (a lo sumo una vez por vida de la vista). */
  reiniciarBase(): void { this.anterior = null; }

  get tamanoOndeados(): number { return this.ondeados.size; }
  get hayBase(): boolean { return this.anterior !== null; }

  /** Procesa una lectura (ids + magnitudes en el MISMO orden) y devuelve los índices que deben disparar anillo (por magnitud descendente, máx. MAX_ONDAS). */
  procesar(ids: ArrayLike<string>, magnitudes: ArrayLike<number>, n: number): number[] {
    const actual = new Set<string>();
    for (let i = 0; i < n; i++) actual.add(ids[i]);
    if (this.anterior === null && n === 0) return [];                                     // un lote vacío no fija la base
    const d = decidirOndas({ anterior: this.anterior, ids, magnitudes, n, ondeados: this.ondeados });
    if (d.motivo === 'ok' && d.nuevos > 0) this.registrarOndeados(ids, n);
    this.anterior = actual;
    return d.disparan;
  }

  /** Marca como «ondeados» TODOS los ids nuevos de la lectura (también los descartados por el límite: no se acumulan en cola ni disparan más tarde). Se llama ANTES de renovar la base. */
  private registrarOndeados(ids: ArrayLike<string>, n: number): void {
    for (let i = 0; i < n; i++) if (!this.anterior!.has(ids[i])) this.ondeados.add(ids[i]);
    while (this.ondeados.size > MAX_IDS_ONDEADOS) { const mas = this.ondeados.values().next(); if (mas.done) break; this.ondeados.delete(mas.value); }
  }
}

/** Índices de las instancias libres (su anillo ya caducó) del pool, hasta `cuantas`. `finMs[i]` = instante en que acaba el anillo de la instancia i (0 = libre). */
export function ranurasLibres(finMs: ArrayLike<number>, ahoraMs: number, cuantas: number): number[] {
  const libres: number[] = [];
  for (let i = 0; i < finMs.length && libres.length < cuantas; i++) if (!(finMs[i] > ahoraMs)) libres.push(i);
  return libres;
}

/** Radio máximo del anillo (unidades de esfera) según el radio visual del marcador: algo mayor que el marcador, acotado para que sea discreto. */
export function radioMaxOnda(radioMarcador: number): number {
  const r = Number.isFinite(radioMarcador) ? radioMarcador : 0.012;
  return Math.max(0.05, Math.min(0.14, 0.03 + 2.5 * r));
}
