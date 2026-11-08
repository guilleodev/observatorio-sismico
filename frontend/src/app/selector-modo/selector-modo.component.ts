// Selector de modo (F6, paso 6.2): EN VIVO o REPRODUCCIÓN. Solo EMITE la elección; el descarte de la lectura anterior y la nueva consulta los hace `AppComponent`.
// En reproducción muestra la identidad y la velocidad de la ejecución y avisa de que son datos históricos acelerados, no actividad actual.
import { Component, computed, input, output } from '@angular/core';
import { etiquetaReplay, textoVelocidad } from '../modo';
import type { EjecucionReplay, ModoVista } from '../modelos';

@Component({
  selector: 'app-selector-modo',
  standalone: true,
  template: `
    <section class="modo" aria-labelledby="modo-titulo">
      <h2 id="modo-titulo">Modo de datos</h2>
      <div class="opciones" role="radiogroup" aria-labelledby="modo-titulo">
        <label><input type="radio" name="modo-datos" value="live" [checked]="modo() === 'live'" (change)="elegir('live')" /> En vivo (USGS)</label>
        <label><input type="radio" name="modo-datos" value="replay" [checked]="modo() === 'replay'" (change)="elegir('replay')" /> REPRODUCCIÓN (histórico acelerado)</label>
      </div>
      @if (modo() === 'replay') {
        <p class="insignia" role="note"><strong>{{ etiqueta() }}</strong></p>
        @if (ejecucion(); as e) {
          <dl>
            <div><dt>Ejecución</dt><dd>{{ e.run_id }}</dd></div>
            <div><dt>Velocidad</dt><dd>{{ velocidad() }} (tiempo real cubierto / duración de la reproducción)</dd></div>
            <div><dt>Estado</dt><dd>{{ e.estado }} · {{ e.tamano }} eventos reales seleccionados</dd></div>
          </dl>
        }
        <p class="aviso">Son eventos históricos reproducidos de forma acelerada y aislada de los datos en vivo: no representan actividad actual.</p>
      }
    </section>
  `,
  styles: `
    .modo { background: white; border-left: 4px solid #176b70; padding: 14px 16px; margin: 0 0 20px; }
    h2 { margin: 0 0 8px; font-size: 1.1rem; }
    .opciones { display: flex; flex-wrap: wrap; gap: 8px 24px; }
    label { font-size: .95rem; font-weight: 600; display: flex; align-items: center; gap: 6px; cursor: pointer; }
    .insignia { margin: 12px 0 6px; padding: 6px 10px; background: #5b21b6; color: white; display: inline-block; border-radius: 4px; }
    dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 6px 18px; margin: 6px 0 0; font-size: .85rem; }
    dl div { display: flex; flex-direction: column; }
    dt { font-weight: 700; color: #42596b; } dd { margin: 0; overflow-wrap: anywhere; }
    .aviso { font-size: .85rem; background: #f3e8ff; border-left: 3px solid #5b21b6; margin: 10px 0 0; padding: 8px 10px; color: #3b0764; }
    :focus-visible { outline: 3px solid #1d4ed8; outline-offset: 2px; }
  `,
})
export class SelectorModoComponent {
  readonly modo = input<ModoVista>('live');
  readonly ejecucion = input<EjecucionReplay | null>(null);
  readonly cambio = output<ModoVista>();

  readonly etiqueta = computed(() => etiquetaReplay(this.ejecucion()));
  readonly velocidad = computed(() => textoVelocidad(this.ejecucion()?.velocidad));

  elegir(modo: ModoVista): void {
    if (modo !== this.modo()) this.cambio.emit(modo);
  }
}
