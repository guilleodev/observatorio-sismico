// Set mínimo de iconos SVG PROPIOS (F7, ronda 1 «Mission Control»): inline, sin dependencias, sin recursos externos.
// Trazo de 1,75 px y `currentColor` (heredan el color del texto). Son decorativos: el SVG lleva aria-hidden="true" y focusable="false"; el significado lo da SIEMPRE el texto o el aria-label del botón que los contiene.
// Tamaño: 1,15 em por defecto (sigue al texto) o el que fije la variable CSS --ico en el elemento o en un ancestro.
import { Component, computed, input } from '@angular/core';

export type NombreIcono = 'marca' | 'panel' | 'analisis' | 'eventos' | 'refrescar' | 'check' | 'aviso' | 'pausa' | 'candado' | 'chevron' | 'guion' | 'info' | 'buscar' | 'globo' | 'limpiar';

/** Trazos en una rejilla de 24 × 24 (atributo `d` de un único <path>); sin relleno. */
export const TRAZOS_ICONO: Record<NombreIcono, string> = {
  marca: 'M2 12h4.5l2.5-6 4 13 3-9 1.5 2H22',                                               // onda sísmica estilizada
  panel: 'M4 4h7v7H4z M13 4h7v4h-7z M13 11h7v9h-7z M4 14h7v6H4z',                           // cuadrícula de paneles
  analisis: 'M3 20h18 M6 20v-7 M12 20V5 M18 20V9',                                          // barras
  eventos: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',                        // lista
  refrescar: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  check: 'M5 12.5l4.5 4.5L19 7',
  aviso: 'M12 3.5L2.5 20h19z M12 10v4.5 M12 17.5h.01',                                      // triángulo de aviso
  pausa: 'M8 5v14 M16 5v14',
  candado: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  chevron: 'M6 9l6 6 6-6',
  guion: 'M6 12h12',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v5 M12 8h.01',
  // CAMBIO (ronda 4 Mission Control, vista Eventos): lupa, globo (círculo con meridiano y ecuador) y cruz de «limpiar»
  buscar: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z M16 16l5 5',
  globo: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  limpiar: 'M6 6l12 12 M18 6L6 18',
};

@Component({
  selector: 'app-icono',
  standalone: true,
  template: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path [attr.d]="trazo()" /></svg>`,
  styles: `
    :host { display: inline-flex; flex: none; width: var(--ico, 1.15em); height: var(--ico, 1.15em); vertical-align: -.2em; }
    svg { display: block; }
  `,
})
export class IconoComponent {
  readonly nombre = input.required<NombreIcono>();
  readonly trazo = computed(() => TRAZOS_ICONO[this.nombre()]);
}
