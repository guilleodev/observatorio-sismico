// Selector de modo (F6, paso 6.2): EN VIVO o REPRODUCCIÓN. Solo EMITE la elección; el descarte de la lectura anterior y la nueva consulta los hace `AppComponent`.
// En reproducción muestra la identidad y la velocidad de la ejecución y avisa de que son datos históricos acelerados, no actividad actual.
import { Component, computed, input, output } from '@angular/core';
import { etiquetaReplay, textoVelocidad } from '../modo';
import type { EjecucionReplay, ModoVista } from '../modelos';

@Component({
  selector: 'app-selector-modo',
  standalone: true,
  template: `
    <section class="modo" [class.replay]="modo() === 'replay'" aria-labelledby="modo-titulo">
      <h2 id="modo-titulo">Modo de datos</h2>
      <!-- radios REALES (flechas del teclado y lectores de pantalla): cada etiqueta es una tarjeta; la elegida lleva fondo, borde, marca ✓ y texto «Activo» (no solo color) -->
      <div class="opciones" role="radiogroup" aria-labelledby="modo-titulo">
        <label class="live" [class.activa]="modo() === 'live'"><input type="radio" name="modo-datos" value="live" [checked]="modo() === 'live'" (change)="elegir('live')" /><span class="texto">En vivo (USGS)</span>@if (modo() === 'live') { <span class="sel" aria-hidden="true">✓ Activo</span> }</label>
        <label class="repro" [class.activa]="modo() === 'replay'"><input type="radio" name="modo-datos" value="replay" [checked]="modo() === 'replay'" (change)="elegir('replay')" /><span class="texto">REPRODUCCIÓN (histórico acelerado)</span>@if (modo() === 'replay') { <span class="sel" aria-hidden="true">✓ Activo</span> }</label>
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
    :host { display: block; min-width: 0; }
    :host { height: 100%; }
    .modo { height: 100%; background: var(--superficie-1); border: 1px solid var(--borde); border-top: 3px solid var(--acento); border-radius: var(--radio); box-shadow: var(--sombra); padding: var(--esp-3) var(--esp-4); margin: 0; }
    .modo.replay { border-top-color: var(--replay); }
    h2 { margin: 0 0 var(--esp-3); font-size: var(--t-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--texto-2); }
    /* control segmentado: dos tarjetas iguales; en pantallas estrechas se apilan */
    .opciones { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--esp-2); }
    label { font-size: .95rem; font-weight: 600; display: flex; align-items: center; gap: 10px; cursor: pointer; min-height: 24px; min-width: 0; padding: 12px 14px; background: var(--superficie-2); border: 1px solid var(--borde); border-radius: var(--radio-s); }
    label:hover { border-color: var(--borde-control); }
    label.activa { border-width: 2px; padding: 11px 13px; }
    label.live.activa { background: var(--acento-fondo); border-color: var(--acento); }
    label.repro.activa { background: var(--replay-fondo); border-color: var(--replay); color: var(--replay-texto); }
    label:has(input:focus-visible) { outline: 3px solid var(--foco); outline-offset: 2px; }
    input[type="radio"] { width: 24px; height: 24px; flex: none; margin: 0; accent-color: var(--acento); }
    label.repro input[type="radio"] { accent-color: var(--replay); }
    .texto { min-width: 0; overflow-wrap: anywhere; line-height: 1.25; }
    .sel { margin-left: auto; flex: none; font-size: var(--t-s); font-weight: 700; white-space: nowrap; }
    label.live .sel { color: var(--acento-texto); }
    label.repro .sel { color: var(--replay-texto); }
    @media (max-width: 520px) { .opciones { grid-template-columns: minmax(0, 1fr); } }
    .insignia { margin: 12px 0 6px; padding: 6px 10px; background: var(--replay-fuerte); color: #fff; border: 1px solid var(--replay-texto); display: inline-block; border-radius: var(--radio-s); }
    dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 6px 18px; margin: 6px 0 0; font-size: .85rem; }
    dl div { display: flex; flex-direction: column; }
    dt { font-weight: 700; color: var(--texto-2); } dd { margin: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
    .aviso { font-size: .85rem; background: var(--replay-fondo); border-left: 3px solid var(--replay); margin: 10px 0 0; padding: 8px 10px; color: var(--replay-texto); border-radius: 0 var(--radio-s) var(--radio-s) 0; }
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
