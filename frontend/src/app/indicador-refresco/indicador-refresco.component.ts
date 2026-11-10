// Indicador compacto de actualización (F7). Solo PRESENTA textos que calcula `refresco.ts` (lógica pura con pruebas); no hace peticiones ni toca el temporizador.
// Accesibilidad: la etiqueta visible NO es región viva (cambia en cada refresco). Una región viva (aria-live, nivel polite) visualmente oculta repite solo los CAMBIOS RELEVANTES de conexión
// (decide `anuncioRefresco`, función pura); la antigüedad y la cuenta atrás cambian cada segundo y están FUERA de cualquier región viva. El estado nunca va solo en color: icono (decorativo) y texto.
import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { ETIQUETAS_ESTADO, anuncioRefresco, detalleEstado } from '../refresco';
import type { EstadoRefresco } from '../refresco';

const ICONOS: Record<EstadoRefresco, string> = { correcto: '✓', actualizando: '⟳', error: '!', pausa: '⏸', 'sin-lectura': '–', acceso: '🔒', 'filtros-rechazados': '⚠' };

@Component({
  selector: 'app-indicador-refresco',
  standalone: true,
  template: `
    <section class="refresco" [attr.data-estado]="estado()" aria-label="Actualización de los datos">
      <div class="cab">
        <span class="k">Refresco del panel</span>
        <span class="dato intervalo">Actualización automática: {{ intervalo() }}</span>
      </div>
      <div class="estado-fila">
        <span class="marca" aria-hidden="true"><span class="icono">{{ icono() }}</span>@for (m of marcas(); track m) { <span class="destello"></span> }</span>
        <div class="estado-txt">
          <strong class="estado">{{ etiqueta() }}</strong>
          @if (detalle(); as d) { <span class="dato">{{ d }}</span> }
        </div>
        <span class="oculto" aria-live="polite" aria-atomic="true">{{ anuncio() }}</span>
      </div>
      <button type="button" class="actualizar" (click)="actualizar.emit()" [disabled]="cargando()">Actualizar ahora</button>
      <dl class="metricas">
        <div><dt>Último correcto</dt><dd>{{ ultimo() }}</dd></div>
        <div><dt>Siguiente intento</dt><dd>{{ siguiente() }}</dd></div>
      </dl>
      @if (avisoPausa(); as a) { <p class="aviso-pausa">{{ a }}</p> }
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; height: 100%; }
    /* rejilla: cabecera / estado + botón / métricas / aviso. En móvil todo se apila (el botón ocupa el ancho). La franja superior de color refuerza el estado; el texto y el icono lo dicen sin color. */
    .refresco { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'cab cab' 'estado accion' 'metricas metricas' 'aviso aviso'; align-content: start; gap: var(--esp-3) var(--esp-4); height: 100%; padding: var(--esp-3) var(--esp-4); background: var(--superficie-1); border: 1px solid var(--borde); border-top: 3px solid var(--borde-control); border-radius: var(--radio); box-shadow: var(--sombra); font-variant-numeric: tabular-nums; }
    .cab { grid-area: cab; display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px var(--esp-3); min-width: 0; }
    .estado-fila { grid-area: estado; display: flex; align-items: center; gap: var(--esp-3); min-width: 0; }
    .estado-txt { display: flex; flex-direction: column; min-width: 0; }
    .metricas { grid-area: metricas; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr)); gap: var(--esp-2); margin: 0; }
    .metricas div { min-width: 0; padding: 8px 12px; background: var(--superficie-2); border: 1px solid var(--borde); border-radius: var(--radio-s); }
    .metricas dt { color: var(--texto-2); font-size: var(--t-xs); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
    .metricas dd { margin: 2px 0 0; font-size: 1.05rem; font-weight: 600; overflow-wrap: anywhere; }
    .k { color: var(--texto-2); font-size: var(--t-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
    .dato { min-width: 0; overflow-wrap: anywhere; font-size: var(--t-s); color: var(--texto-2); }
    .marca { position: relative; flex: none; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; border: 2px solid currentColor; font-size: 1.1rem; line-height: 1; }
    .estado { font-size: var(--t-l); font-weight: 700; line-height: 1.2; }
    .destello { position: absolute; inset: -3px; border-radius: 50%; border: 2px solid var(--ok); opacity: 0; pointer-events: none; animation: destello 1s ease-out; }
    @keyframes destello { 0% { opacity: .9; transform: scale(.8); } 100% { opacity: 0; transform: scale(1.8); } }
    /* el color refuerza, no sustituye: cada estado ya tiene icono y texto distintos */
    [data-estado='correcto'] .marca, [data-estado='correcto'] .estado { color: var(--ok); }
    [data-estado='actualizando'] .marca, [data-estado='actualizando'] .estado { color: var(--acento-texto); }
    [data-estado='error'] .marca, [data-estado='error'] .estado { color: var(--error-texto); }
    [data-estado='pausa'] .marca, [data-estado='pausa'] .estado, [data-estado='acceso'] .marca, [data-estado='acceso'] .estado,
    [data-estado='filtros-rechazados'] .marca, [data-estado='filtros-rechazados'] .estado { color: var(--aviso); }
    /* región viva visualmente oculta (sigue en el árbol de accesibilidad) */
    .oculto { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
    .refresco[data-estado='correcto'] { border-top-color: var(--ok); }
    .refresco[data-estado='actualizando'] { border-top-color: var(--acento); }
    .refresco[data-estado='error'] { border-top-color: var(--error); }
    .refresco[data-estado='pausa'], .refresco[data-estado='acceso'], .refresco[data-estado='filtros-rechazados'] { border-top-color: var(--aviso); }
    .aviso-pausa { grid-area: aviso; margin: 0; min-width: 0; padding: 6px 10px; background: var(--superficie-2); border-left: 3px solid var(--aviso); border-radius: 0 var(--radio-s) var(--radio-s) 0; color: var(--texto-2); font-size: var(--t-s); }
    /* acción principal del bloque; objetivo >= 24 px (WCAG 2.5.8): con el relleno mide ≈ 42 px */
    .actualizar { grid-area: accion; align-self: center; min-height: 24px; padding: 10px 18px; font: inherit; font-weight: 700; cursor: pointer; touch-action: manipulation; background: var(--acento); color: var(--sobre-acento); border: 1px solid var(--acento); border-radius: var(--radio-s); }
    .actualizar:hover:not(:disabled) { background: var(--acento-texto); border-color: var(--acento-texto); }
    /* deshabilitado = consulta en curso: aspecto apagado y cursor de espera (el estado «Actualizando…» ya lo dice en texto) */
    .actualizar:disabled { background: var(--superficie-3); color: var(--texto-2); border-color: var(--borde-control); cursor: progress; }
    .actualizar:focus-visible { outline: 3px solid var(--foco); outline-offset: 2px; }
    @media (max-width: 440px) {
      .refresco { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'cab' 'estado' 'accion' 'metricas' 'aviso'; }
      .actualizar { width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) { .destello { animation: none; display: none; } }
  `,
})
export class IndicadorRefrescoComponent {
  readonly estado = input.required<EstadoRefresco>();
  readonly ultimo = input.required<string>();
  readonly siguiente = input.required<string>();
  /** Instante (monotónico) del último refresco CORRECTO: cambia solo con una lectura realmente correcta y dispara el destello. */
  readonly marca = input<number | null>(null);
  /** Intervalo de actualización automática ya formateado («cada 60 s»); lo calcula app.component a partir de config. */
  readonly intervalo = input<string>('');
  /** Aviso de suspensión con la pestaña oculta (solo con pausarSiOculta); null = no aplica. */
  readonly avisoPausa = input<string | null>(null);
  /** ¿Hay una consulta en curso? Deshabilita el botón. */
  readonly cargando = input<boolean>(false);
  /** Petición de actualización inmediata: la atiende app.component (`actualizarAhora()`). */
  readonly actualizar = output<void>();

  readonly etiqueta = computed(() => ETIQUETAS_ESTADO[this.estado()]);
  readonly icono = computed(() => ICONOS[this.estado()]);
  readonly detalle = computed(() => detalleEstado(this.estado()));
  // Último anuncio: solo se reemplaza cuando `anuncioRefresco` devuelve texto distinto; nunca se borra a '' en cada tick.
  readonly anuncio = signal('');
  private anterior: EstadoRefresco | null = null; // último estado ESTABLE (distinto de «actualizando»)

  constructor() {
    effect(() => {
      const actual = this.estado();
      if (actual === 'actualizando') return;
      const texto = anuncioRefresco(this.anterior, actual);
      this.anterior = actual;
      if (texto !== null && texto !== untracked(this.anuncio)) this.anuncio.set(texto);
    });
  }
  // Un elemento nuevo por cada lectura correcta: al crearse, su animación CSS se reproduce una vez (≈ 1 s, solo opacity/transform).
  readonly marcas = computed(() => (this.marca() === null ? [] : [this.marca()]));
}
