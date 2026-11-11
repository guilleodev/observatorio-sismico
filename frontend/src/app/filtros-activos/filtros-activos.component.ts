// Franja «Filtros activos» (rediseño 3 vistas, ronda 2; ronda 3 «Mission Control»: presentación en CHIPS). Componente PRESENTACIONAL y reutilizable: lo usan las vistas Análisis y Eventos con las mismas entradas (sin duplicar lógica).
// Muestra el resumen de filtros (el mismo texto que ya calcula `resumen()` de filtros.ts, partido en chips por su separador « · » con `partirResumen`), el periodo consultado (UTC, en fuente mono) y, en REPRODUCCIÓN, su etiqueta violeta.
// «Cambiar filtros» es un enlace REAL a #/panel (estilizado como botón secundario discreto); el clic lo intercepta AppComponent (salida `cambiar`) para navegar al Panel y llevar el foco a #filtros. Sin región viva: son datos estáticos que cambian solo al aplicar filtros.
import { Component, computed, input, output } from '@angular/core';
import { partirResumen } from '../chips-filtros';

@Component({
  selector: 'app-filtros-activos',
  standalone: true,
  template: `
    <section class="franja" [class.replay]="!!etiqueta()" aria-label="Filtros activos">
      <div class="texto">
        @if (etiqueta(); as e) { <strong class="etiqueta-replay">{{ e }}</strong> }
        <span class="k etiqueta-ui">Filtros activos</span>
        <ul class="chips">
          @for (c of chips(); track $index) { <li class="chip">{{ c }}</li> }
          @empty { <li class="chip">sin consulta</li> }
        </ul>
        <span class="k etiqueta-ui">Periodo (UTC)</span>
        <span class="periodo mono">{{ periodo() }}</span>
      </div>
      <a href="#/panel" class="enlace" (click)="$event.preventDefault(); cambiar.emit()">Cambiar filtros</a>
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    /* CAMBIO (ronda 3): sin caja completa; una línea fina inferior (--linea) y, en REPRODUCCIÓN, una marca violeta a la izquierda además de la etiqueta */
    .franja { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--esp-2) var(--esp-4); padding: var(--esp-2) 0; border-bottom: 1px solid var(--linea); }
    .franja.replay { border-left: 3px solid var(--replay); padding-left: var(--esp-3); }
    .texto { flex: 1 1 320px; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--esp-2) var(--esp-3); font-size: var(--t-m); }
    .chips { display: flex; flex-wrap: wrap; gap: var(--esp-1) var(--esp-2); margin: 0; padding: 0; list-style: none; min-width: 0; }
    .chip { padding: 2px 10px; background: var(--superficie-2); border: 1px solid var(--linea); border-radius: 999px; color: var(--texto); font-size: var(--t-m); overflow-wrap: anywhere; }
    .periodo { color: var(--texto); font-size: var(--t-s); overflow-wrap: anywhere; min-width: 0; }
    .etiqueta-replay { display: inline-block; padding: 0 8px; background: var(--replay-fondo); color: var(--replay-texto); border: 1px solid var(--replay); border-radius: var(--radio-s); font-size: var(--t-s); }
    .enlace { display: inline-flex; align-items: center; min-height: 36px; padding: 0 14px; color: var(--acento-texto); background: transparent; border: 1px solid var(--borde-control); border-radius: var(--radio-s); font: 600 var(--t-m) var(--fuente); text-decoration: none; touch-action: manipulation; }
    .enlace:hover { border-color: var(--acento); background: var(--superficie-2); }
    .enlace:focus-visible { outline: 3px solid var(--foco); outline-offset: 2px; }
  `,
})
export class FiltrosActivosComponent {
  /** Texto de `resumenFiltros()` (filtros de la última lectura correcta). */
  readonly resumen = input<string>('');
  /** Texto de `periodo()`. */
  readonly periodo = input<string>('Sin consulta');
  /** Etiqueta de REPRODUCCIÓN (`etiquetaVista()`); null en vivo. */
  readonly etiqueta = input<string | null>(null);
  /** «Cambiar filtros»: AppComponent navega al Panel y enfoca #filtros. */
  readonly cambiar = output<void>();
  /** El resumen partido en chips (misma información, otra presentación). */
  readonly chips = computed(() => partirResumen(this.resumen()));
}
