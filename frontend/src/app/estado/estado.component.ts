// Panel de estado del sistema (F5, paso 5.6; ENUNCIADO §8.6): último acceso correcto a la API, última ingesta correcta de USGS, periodo consultado, filtros activos,
// huecos pendientes y los avisos (sin conexión, datos desactualizados, sin eventos, truncado). Solo PRESENTA lo que clasifica `estado.ts`. Cada aviso va en una región
// accesible: los errores con role=alert (se anuncian al instante) y el resto con role=status (se anuncian sin interrumpir).
import { Component, computed, input, output } from '@angular/core';
import { avisos, estadoGeneral, formatoEdad, textoIngesta } from '../estado';
import type { EntradaEstado } from '../estado';
import { etiquetaReplay } from '../modo';
import type { EjecucionReplay } from '../modelos';

@Component({
  selector: 'app-estado',
  standalone: true,
  template: `
    <section class="estado" aria-labelledby="estado-titulo">
      <h2 id="estado-titulo">Estado del sistema</h2>
      <p class="general" [class.ok]="general().nivel === 'ok'" [class.desact]="general().nivel === 'desactualizado'" [class.sin]="general().nivel === 'sin-conexion'" role="status">
        <span class="punto" aria-hidden="true"></span><strong>{{ general().texto }}</strong>
        @if (general().nivel === 'sin-conexion' && entrada().edadLecturaMs !== null) { <span> · última lectura válida hace {{ edad() }}</span> }
      </p>
      <dl>
        @if (entrada().modo === 'replay') { <div class="replay"><dt>Modo</dt><dd><strong>{{ etiquetaReplayTexto() }}</strong></dd></div> }
        <div><dt>Último acceso correcto a la API (UTC)</dt><dd>{{ ultimoAcceso() ?? 'ninguno todavía' }}</dd></div>
        <div><dt>{{ entrada().modo === 'replay' ? 'Última ingesta correcta de USGS (EN VIVO, no de la reproducción)' : 'Última ingesta correcta de USGS' }}</dt><dd>{{ ingesta() }}</dd></div>
        <div><dt>Periodo consultado (UTC)</dt><dd>{{ periodo() }}</dd></div>
        <div><dt>Filtros activos</dt><dd>{{ filtros() }}</dd></div>
        @if (entrada().salud; as s) {
          <div><dt>Cobertura de datos en vivo desde (UTC)</dt><dd>{{ cobertura() }}</dd></div>
          <div><dt>Huecos de ingesta pendientes</dt><dd>{{ s.gaps_pending ?? 'ND' }}</dd></div>
          <div><dt>Umbral de «datos desactualizados»</dt><dd>{{ s.stale_after_s !== undefined ? s.stale_after_s + ' s (medido con el reloj de la API)' : 'ND' }}</dd></div>
        }
      </dl>
      @for (a of lista(); track a.codigo) {
        <div class="aviso" [class.error]="a.severidad === 'error'" [class.info]="a.severidad === 'info'" [attr.role]="a.rol">
          <strong>{{ a.titulo }}.</strong> {{ a.texto }}
          @if (a.codigo === 'truncado' && entrada().siguiente !== null) {
            <button type="button" (click)="cargarResto.emit()" [disabled]="cargandoResto()">{{ cargandoResto() ? 'Cargando…' : 'Cargar el resto de eventos' }}</button>
          }
        </div>
      }
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    /* CAMBIO (ronda 3): sin caja (vive dentro de la sección «Metodología y estado del sistema», que ya es una zona con líneas finas); mismos datos y avisos */
    .estado { margin: 0; padding: 0; }
    h2 { margin: 0 0 8px; font-size: var(--t-m); font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--texto-2); }
    .general { margin: 0 0 10px; font-size: .95rem; display: flex; align-items: center; gap: 8px; }
    .punto { width: 12px; height: 12px; border-radius: 50%; background: var(--texto-2); display: inline-block; flex: none; } /* el texto del estado acompaña siempre al punto: el color no es el único canal */
    .ok .punto { background: var(--ok); } .desact .punto { background: var(--aviso); } .sin .punto { background: var(--error); }
    dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 6px 18px; margin: 0; font-size: .85rem; }
    dl div { display: flex; flex-direction: column; }
    dt { font-weight: 700; color: var(--texto-2); } dd { margin: 0; overflow-wrap: anywhere; }
    .aviso { margin: 10px 0 0; padding: 8px 10px; font-size: .88rem; background: var(--aviso-fondo); border-left: 3px solid var(--aviso); color: var(--aviso-texto); border-radius: 0 var(--radio-s) var(--radio-s) 0; }
    .aviso.error { background: var(--error-fondo); border-color: var(--error); color: var(--error-texto); }
    .replay dd { color: var(--replay-texto); }
    .replay dd strong { background: var(--replay-fondo); border: 1px solid var(--replay); border-radius: var(--radio-s); padding: 2px 8px; display: inline-block; }
    .aviso.info { background: var(--info-fondo); border-color: var(--info); color: var(--info-texto); }
    button { font: inherit; font-weight: 600; margin-left: 10px; padding: 4px 12px; min-height: 24px; border: 1px solid var(--acento); border-radius: var(--radio-s); background: var(--acento); color: var(--sobre-acento); cursor: pointer; }
    button:disabled { opacity: .6; cursor: progress; }
  `,
})
export class EstadoComponent {
  readonly entrada = input.required<EntradaEstado>();
  readonly ultimoAcceso = input<string | null>(null);
  readonly periodo = input<string>('sin consulta');
  readonly filtros = input<string>('');
  readonly cargandoResto = input<boolean>(false);
  /** F6: ejecución mostrada (solo en reproducción). */
  readonly ejecucion = input<EjecucionReplay | null>(null);
  readonly cargarResto = output<void>();

  readonly etiquetaReplayTexto = computed(() => etiquetaReplay(this.ejecucion()));
  readonly general = computed(() => estadoGeneral(this.entrada()));
  readonly lista = computed(() => avisos(this.entrada()));
  readonly edad = computed(() => formatoEdad(this.entrada().edadLecturaMs ?? 0));
  readonly ingesta = computed(() => textoIngesta(this.entrada().salud));
  readonly cobertura = computed(() => { const v = this.entrada().salud?.live_since; return typeof v === 'number' ? new Date(v).toISOString() : 'sin datos en vivo'; });
}
