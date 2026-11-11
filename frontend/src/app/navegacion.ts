// Navegación entre las TRES vistas internas del dashboard (Panel · Análisis · Eventos). Módulo PURO: sin Angular y sin tocar `window` directamente (recibe un objeto con la forma
// mínima de la ventana), así se prueba con `node --test`. La URL (`location.hash`) es la ÚNICA fuente de verdad: un enlace directo abre la vista correcta, Atrás/Adelante funcionan
// (cada cambio de hash crea una entrada de historial) y no hay estado fuera de la URL. No se guarda nada en el navegador (ni almacenamiento ni cookies) y no se usa el enrutador de Angular.
// El hash es solo del cliente: nunca llega al servidor, así que no afecta al proxy local ni a config.json.

export type Vista = 'panel' | 'analisis' | 'eventos';

/** Orden de la navegación (y del DOM): lo primero que se ve es el Panel. */
export const VISTAS: readonly Vista[] = ['panel', 'analisis', 'eventos'];
export const VISTA_INICIAL: Vista = 'panel';

/** Texto visible de cada enlace de la navegación y del encabezado de cada vista. */
export const NOMBRE_VISTA: Readonly<Record<Vista, string>> = { panel: 'Panel', analisis: 'Análisis', eventos: 'Eventos' };
/** Identificador del encabezado (h2) de cada vista: el foco se mueve ahí al cambiar de vista. */
export const ID_ENCABEZADO: Readonly<Record<Vista, string>> = { panel: 'panel-titulo', analisis: 'analisis-titulo', eventos: 'eventos-titulo' };

/** «#/panel», «#/analisis», «#/eventos». */
export function hashDeVista(v: Vista): string { return `#/${v}`; }

/** Vista de un hash. Vacío, `#`, desconocido o con mayúsculas/barra final raras → Panel (nunca falla). Admite «#/analisis», «#/analisis/» y «#/Analisis». */
export function vistaDesdeHash(hash: string | null | undefined): Vista {
  const limpio = (hash ?? '').trim().replace(/^#\/?/, '').replace(/\/+$/, '').toLowerCase();
  return (VISTAS as readonly string[]).includes(limpio) ? (limpio as Vista) : VISTA_INICIAL;
}

/** Título de la pestaña: «Análisis · Observatorio sísmico». */
export function tituloDocumento(v: Vista): string { return `${NOMBRE_VISTA[v]} · Observatorio sísmico`; }

/** Texto breve para la región viva (polite): «Vista: Análisis». */
export function anuncioVista(v: Vista): string { return `Vista: ${NOMBRE_VISTA[v]}`; }

/** Forma mínima de `window` que necesita el sincronizador (permite probarlo con un doble sin DOM). */
export interface VentanaHash {
  location: { hash: string };
  addEventListener(tipo: string, f: () => void): void;
  removeEventListener(tipo: string, f: () => void): void;
}

/**
 * Sincroniza la vista con `location.hash`. Registra `hashchange` Y `popstate` (Atrás/Adelante dispara uno u otro según el navegador, o ambos): `alCambiar` solo se llama
 * cuando la vista CAMBIA de verdad, así que el doble evento no provoca doble foco ni doble anuncio. `detener()` retira los dos listeners (ngOnDestroy).
 */
export class SincronizadorHash {
  private actual: Vista = VISTA_INICIAL;
  private activo = false;
  private readonly ventana: VentanaHash;
  private readonly alCambiar: (v: Vista) => void;
  private readonly escuchar = (): void => {
    const nueva = vistaDesdeHash(this.ventana.location.hash);
    if (nueva === this.actual) return;
    this.actual = nueva;
    this.alCambiar(nueva);
  };

  // (sin «parameter properties»: `node --test` ejecuta el .ts quitando tipos y esa sintaxis no se admite)
  constructor(ventana: VentanaHash, alCambiar: (v: Vista) => void) { this.ventana = ventana; this.alCambiar = alCambiar; }

  /** Registra los listeners y devuelve la vista del hash actual (NO llama a `alCambiar`: la carga inicial no roba el foco). */
  iniciar(): Vista {
    this.actual = vistaDesdeHash(this.ventana.location.hash);
    if (!this.activo) {
      this.activo = true;
      this.ventana.addEventListener('hashchange', this.escuchar);
      this.ventana.addEventListener('popstate', this.escuchar);
    }
    return this.actual;
  }

  /**
   * Cambio pedido por la interfaz: fija el hash (nueva entrada de historial). Devuelve `true` si cambió la vista (el evento `hashchange` llegará después y
   * `alCambiar` se llamará una vez); `false` si ya estaba en esa vista, y entonces no ocurre nada.
   */
  navegar(v: Vista): boolean {
    if (v === this.actual) return false;
    this.ventana.location.hash = hashDeVista(v);
    return true;
  }

  detener(): void {
    if (!this.activo) return;
    this.activo = false;
    this.ventana.removeEventListener('hashchange', this.escuchar);
    this.ventana.removeEventListener('popstate', this.escuchar);
  }
}
