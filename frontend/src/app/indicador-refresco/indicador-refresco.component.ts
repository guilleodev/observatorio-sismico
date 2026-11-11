// Indicador compacto de actualización (F7). Solo PRESENTA textos que calcula `refresco.ts` (lógica pura con pruebas); no hace peticiones ni toca el temporizador.
// Accesibilidad: la etiqueta visible NO es región viva (cambia en cada refresco). Una región viva (aria-live, nivel polite) visualmente oculta repite solo los CAMBIOS RELEVANTES de conexión
// (decide `anuncioRefresco`, función pura); la antigüedad y la cuenta atrás cambian cada segundo y están FUERA de cualquier región viva. El estado nunca va solo en color: icono (decorativo) y texto.
// CAMBIO (ronda 1 Mission Control): variante `cabecera` (input): el estado esencial (icono + texto), el botón «Actualizar ahora» y el botón de detalles están SIEMPRE visibles en la fila de la cabecera;
// «Refresco del panel», «Último correcto», «Siguiente intento», intervalo y aviso de pausa viven en un DESPLEGABLE (disclosure con aria-expanded/aria-controls) cerrado por defecto. Misma lógica, mismos
// inputs/outputs, MISMA y ÚNICA región viva. El estado abierto/cerrado es una señal en memoria (nada persistente).
import { Component, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { ETIQUETAS_ESTADO, anuncioRefresco, detalleEstado, esEstadoDeAviso, microAviso } from '../refresco';
import type { EstadoRefresco } from '../refresco';
import { IconoComponent } from '../icono/icono.component';
import type { NombreIcono } from '../icono/icono.component';

const ICONOS: Record<EstadoRefresco, string> = { correcto: '✓', actualizando: '⟳', error: '!', pausa: '⏸', 'sin-lectura': '–', acceso: '🔒', 'filtros-rechazados': '⚠' };
/** Iconos SVG propios de cada estado (solo en la variante de cabecera; decorativos, el texto del estado va al lado o en el aria-label). */
const ICONOS_SVG: Record<EstadoRefresco, NombreIcono> = { correcto: 'check', actualizando: 'refrescar', error: 'aviso', pausa: 'pausa', 'sin-lectura': 'guion', acceso: 'candado', 'filtros-rechazados': 'aviso' };

@Component({
  selector: 'app-indicador-refresco',
  standalone: true,
  imports: [IconoComponent],
  host: {
    '[class.modo-cab]': 'cabecera()',
    '(document:keydown.escape)': 'alEscape()',
    '(document:click)': 'alClicFuera($event)',
    '(focusout)': 'alPerderFoco($event)',
  },
  template: `
    <section class="refresco" [class.compacto]="compacto()" [class.en-cab]="cabecera()" [attr.data-estado]="estado()" aria-label="Actualización de los datos">
      <div class="estado-fila">
        <span class="marca" aria-hidden="true">@if (cabecera()) { <app-icono [nombre]="iconoSvg()" /> } @else { <span class="icono">{{ icono() }}</span> }@for (m of marcas(); track m) { <span class="destello"></span> }</span>
        <div class="estado-txt">
          <strong class="estado">{{ etiqueta() }}</strong>
          @if (detalle(); as d) { <span class="dato">{{ d }}</span> }
        </div>
        @if (cabecera()) { @if (micro(); as m) { <span class="micro">{{ m }}</span> } @else { <span class="tiempo mono" [attr.title]="ultimo()">{{ ultimo() }}</span> } }
        <span class="oculto" aria-live="polite" aria-atomic="true">{{ anuncio() }}</span>
      </div>
      <button type="button" class="actualizar" (click)="actualizar.emit()" [disabled]="cargando()" [attr.title]="cabecera() ? 'Actualizar ahora' : null"><app-icono nombre="refrescar" /><span class="actualizar-txt">Actualizar ahora</span></button>
      @if (cabecera()) {
        <button type="button" #boton class="disclosure" [attr.aria-expanded]="abierto()" aria-controls="detalles-refresco" [attr.aria-label]="'Detalles del refresco: ' + etiqueta()" title="Detalles del refresco" [attr.data-alerta]="alerta() ? '' : null" (click)="alternar()"><span class="disc-ico" aria-hidden="true"><app-icono [nombre]="iconoSvg()" /></span><app-icono class="chevron" nombre="chevron" /></button>
      }
      <div id="detalles-refresco" class="detalles" role="group" aria-label="Detalles del refresco" [hidden]="cabecera() && !abierto()">
        <div class="cab">
          <span class="k">Refresco del panel</span>
          <span class="dato intervalo">Actualización automática: {{ intervalo() }}</span>
        </div>
        @if (cabecera()) { @if (detalle(); as d) { <p class="detalle-estado">{{ d }}</p> } }
        <dl class="metricas">
          <div><dt>Último correcto</dt><dd>{{ ultimo() }}</dd></div>
          <div><dt>Siguiente intento</dt><dd>{{ siguiente() }}</dd></div>
        </dl>
        @if (avisoPausa(); as a) { <p class="aviso-pausa">{{ a }}</p> }
      </div>
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
    /* VARIANTE COMPACTA (cabecera del dashboard, input «compacto»): mismos datos y misma lógica, menos altura. Los anchos los decide el contenedor (el host), no el viewport:
       con ancho suficiente, estado · métricas · botón en UNA fila y cabecera/aviso debajo; en estrecho se apila. Botón >= 36 px. */
    :host { container-type: inline-size; }
    /* CAMBIO (móvil): estado + botón en UNA fila, métricas en 2 columnas pequeñas, la etiqueta «Refresco del panel» solo visual-oculta (sigue en el árbol de accesibilidad) y el intervalo en una línea mínima */
    .refresco.compacto { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'estado accion' 'metricas metricas' 'cab cab' 'aviso aviso'; gap: 4px var(--esp-3); padding: 6px 10px; border-top-width: 2px; box-shadow: none; }
    .compacto .cab .k { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .compacto .cab .intervalo { font-size: var(--t-xs); }
    .compacto .metricas dt { font-size: .65rem; }
    .compacto .marca { width: 28px; height: 28px; font-size: .95rem; }
    .compacto .estado { font-size: var(--t-m); }
    .compacto .metricas { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--esp-1) var(--esp-2); }
    .compacto .metricas div { padding: 2px 8px; }
    .compacto .metricas dd { font-size: var(--t-m); }
    .compacto .actualizar { min-height: 36px; padding: 6px 14px; width: auto; }
    .compacto .cab { font-size: var(--t-xs); }
    @container (min-width: 520px) {
      .refresco.compacto { grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: 'estado metricas accion' 'cab cab cab' 'aviso aviso aviso'; align-items: center; }
    }

    /* ===== VARIANTE DE CABECERA (input «cabecera», ronda 1 Mission Control) =====
       El host deja de ser un contenedor de tamaño (container-type: inline-size colapsaría su ancho dentro de la rejilla de la cabecera) y pasa a ser el ANCLA del desplegable (position: relative). */
    :host(.modo-cab) { position: relative; display: block; height: auto; container-type: normal; }
    .detalles { display: contents; }           /* fuera de la cabecera el bloque no existe como caja: la rejilla de siempre sigue mandando */
    .detalles[hidden] { display: none; }
    .actualizar app-icono, .disclosure, .micro, .tiempo { display: none; }
    .en-cab { --tono: var(--texto-2); }
    .en-cab[data-estado='correcto'] { --tono: var(--ok); }
    .en-cab[data-estado='actualizando'] { --tono: var(--acento-texto); }
    .en-cab[data-estado='error'] { --tono: var(--error-texto); }
    .en-cab[data-estado='pausa'], .en-cab[data-estado='acceso'], .en-cab[data-estado='filtros-rechazados'] { --tono: var(--aviso); }
    .refresco.en-cab { display: flex; align-items: center; gap: var(--esp-1); height: auto; padding: 0; background: none; border: 0; border-radius: 0; box-shadow: none; }
    .en-cab .estado-fila { gap: var(--esp-2); }
    .en-cab .marca { display: none; width: 26px; height: 26px; --ico: 15px; }
    .en-cab .estado { font-size: var(--t-s); white-space: nowrap; }
    .en-cab .marca, .en-cab .estado, .en-cab .disc-ico { color: var(--tono); }
    .en-cab .estado-txt .dato { display: none; }   /* el texto de apoyo («se conserva la última lectura válida») va en el desplegable */
    /* < 1100 px (móvil y tablet): fila MÍNIMA = [icono de estado + chevron] + [refrescar]; el texto del estado sigue en el árbol de accesibilidad (visualmente oculto) y en el aria-label del botón de detalles */
    .en-cab .estado-txt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .en-cab .actualizar { display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: 36px; min-height: 36px; padding: 0; background: transparent; color: var(--texto); border: 1px solid var(--borde-control); border-radius: var(--radio-control); --ico: 18px; }
    .en-cab .actualizar app-icono { display: inline-flex; }
    .en-cab .actualizar-txt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .en-cab .actualizar:hover:not(:disabled) { background: var(--acento-fondo); color: var(--acento-texto); border-color: var(--acento); }
    .en-cab .actualizar:disabled { background: transparent; color: var(--texto-2); border-color: var(--borde-control); }
    .en-cab .disclosure { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 2px; min-width: 36px; min-height: 36px; padding: 0 6px; background: transparent; color: var(--texto-2); border: 1px solid transparent; border-radius: var(--radio-control); cursor: pointer; touch-action: manipulation; --ico: 16px; }
    .en-cab .disclosure:hover { color: var(--texto); border-color: var(--borde-control); }
    .en-cab .disclosure[aria-expanded='true'] { background: var(--superficie-2); color: var(--texto); border-color: var(--borde-control); }
    .en-cab .disclosure:focus-visible { outline: 3px solid var(--foco); outline-offset: 2px; }
    .en-cab .disclosure[aria-expanded='true'] .chevron { transform: rotate(180deg); }
    /* aviso con el desplegable CERRADO: punto en el botón de detalles (ámbar; rojo si es un error) + el icono de estado cambia de forma (triángulo, pausa, candado); el texto va en el aria-label */
    .en-cab .disclosure[data-alerta]::after { content: ''; position: absolute; top: 3px; right: 3px; width: 8px; height: 8px; border-radius: 50%; background: var(--aviso); border: 1px solid var(--escenario); }
    .en-cab[data-estado='error'] .disclosure[data-alerta]::after { background: var(--error); }
    .en-cab .disc-ico { display: inline-flex; --ico: 18px; }
    .en-cab .micro { padding: 1px 8px; border: 1px solid currentColor; border-radius: 999px; color: var(--tono); font-size: var(--t-2xs); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; white-space: nowrap; }
    .en-cab .tiempo { max-width: 16ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--texto-2); font-size: var(--t-xs); }
    /* el DESPLEGABLE: anclado bajo la zona de estado, a la derecha; casi opaco (sin backdrop-filter); ancho acotado para no desbordar a 320 px */
    .en-cab .detalles { position: absolute; top: calc(100% + 10px); right: 0; z-index: 5; display: grid; gap: var(--esp-2); width: min(360px, calc(100vw - 24px)); padding: var(--esp-3); background: var(--superficie-1); border: 1px solid var(--borde-control); border-radius: var(--radio-panel); box-shadow: var(--elev-3); text-align: left; }
    .en-cab .detalles[hidden] { display: none; }
    .en-cab .cab, .en-cab .metricas, .en-cab .aviso-pausa { grid-area: auto; }
    .en-cab .metricas { grid-template-columns: minmax(0, 1fr); }
    .en-cab .detalle-estado { margin: 0; color: var(--texto-2); font-size: var(--t-s); }
    /* >= 1280 px: el estado se ve con icono y TEXTO en la propia fila (antes, solo icono + detalles; cálculo de anchos en app.component.css) */
    @media (min-width: 1280px) {
      .en-cab .marca { display: inline-flex; }
      .en-cab .estado-txt { position: static; width: auto; height: auto; overflow: visible; clip-path: none; white-space: normal; }
      .en-cab .disc-ico { display: none; }
      .en-cab .estado-fila { margin-right: var(--esp-1); }
    }
    /* >= 1440 px: el botón de refresco muestra también su texto «Actualizar ahora» */
    @media (min-width: 1440px) {
      .en-cab .actualizar { width: auto; padding: 0 14px; }
      .en-cab .actualizar-txt { position: static; width: auto; height: auto; overflow: visible; clip-path: none; font-size: var(--t-s); font-weight: 700; }
    }
    /* >= 1600 px: tiempo corto («hace 7 s») o, si hay aviso (error, pausa, acceso), la micro-etiqueta de aviso en su lugar */
    @media (min-width: 1600px) { .en-cab .tiempo, .en-cab .micro { display: inline-block; } }
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
  /** Variante compacta para la cabecera del dashboard (solo cambia la presentación). */
  readonly compacto = input(false);
  /** Variante de la cabecera sticky: estado esencial siempre visible y detalles en un desplegable (solo cambia la presentación). */
  readonly cabecera = input(false);
  /** ¿Hay una consulta en curso? Deshabilita el botón. */
  readonly cargando = input<boolean>(false);
  /** Petición de actualización inmediata: la atiende app.component (`actualizarAhora()`). */
  readonly actualizar = output<void>();

  readonly etiqueta = computed(() => ETIQUETAS_ESTADO[this.estado()]);
  readonly icono = computed(() => ICONOS[this.estado()]);
  readonly iconoSvg = computed(() => ICONOS_SVG[this.estado()]);
  readonly detalle = computed(() => detalleEstado(this.estado()));
  readonly micro = computed(() => microAviso(this.estado()));
  readonly alerta = computed(() => esEstadoDeAviso(this.estado()));
  // Último anuncio: solo se reemplaza cuando `anuncioRefresco` devuelve texto distinto; nunca se borra a '' en cada tick.
  readonly anuncio = signal('');
  private anterior: EstadoRefresco | null = null; // último estado ESTABLE (distinto de «actualizando»)

  /** Desplegable de detalles (solo variante de cabecera): estado de interfaz EN MEMORIA, cerrado por defecto. */
  readonly abierto = signal(false);
  private readonly boton = viewChild<ElementRef<HTMLButtonElement>>('boton');
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

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

  alternar(): void { this.abierto.update((a) => !a); }
  /** Escape cierra el desplegable y DEVUELVE el foco al botón de detalles (sin trampas de foco: nada se queda atrapado dentro). */
  alEscape(): void {
    if (!this.abierto()) return;
    this.abierto.set(false);
    this.boton()?.nativeElement.focus();
  }
  /** Clic fuera de la zona de refresco: se cierra (un clic dentro, incluido el propio botón, no lo cierra). */
  alClicFuera(ev: Event): void {
    if (this.abierto() && !this.el.nativeElement.contains(ev.target as Node | null)) this.abierto.set(false);
  }
  /** El foco sale hacia fuera de la zona (Tab, Mays+Tab…): se cierra sin mover el foco. */
  alPerderFoco(ev: FocusEvent): void {
    const destino = ev.relatedTarget as Node | null;
    if (this.abierto() && destino !== null && !this.el.nativeElement.contains(destino)) this.abierto.set(false);
  }
}
