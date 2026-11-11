// Panel «Evento seleccionado» (rediseño del dashboard). Antes la tarjeta de detalle vivía DENTRO del globo 3D; ahora es un panel de la columna derecha que sirve a las DOS vistas
// (mapa 2D y globo 3D) y a la selección desde la tabla. Es PRESENTACIONAL: recibe el evento seleccionado (lo deriva AppComponent de `seleccionado()` y `eventos()`) y solo emite `cerrar`.
// Texto siempre por interpolación (textContent): nunca HTML inyectado. Cifras y textos salen de formato.ts (`filasFicha`, `textoMagnitud`) y modo.ts (`fichaReplay`), los mismos que usan el popup 2D y la tabla.
// Accesibilidad: es la ÚNICA región viva de «Seleccionado: …» de la página (antes estaba en el globo); persistente y visualmente oculta. Sin selección muestra una indicación compacta.
import { Component, computed, input, output } from '@angular/core';
import { filasFicha } from '../formato';
import { fichaReplay } from '../modo';
import type { EjecucionReplay, Evento } from '../modelos';

@Component({
  selector: 'app-detalle-evento',
  standalone: true,
  template: `
    <section class="panel-ui detalle" [class.replay]="replay()" aria-labelledby="detalle-titulo">
      <h2 id="detalle-titulo" class="panel-titulo"><span class="ico-panel" aria-hidden="true">◎</span>Evento seleccionado</h2>
      @if (ficha(); as f) {
        <div class="ficha-det">
          @if (textoReplay(); as r) { <p class="det-replay">{{ r }}</p> }
          <div class="det-cabecera">
            <p class="det-mag"><span class="det-mag-valor" aria-hidden="true">{{ f.magnitud }}</span><span class="solo-lectores">{{ f.insignia }}</span></p>
            <p class="det-lugar">{{ f.lugar }}</p>
          </div>
          <dl class="det-filas">
            @for (fila of f.filas; track fila.etiqueta) { <div><dt>{{ fila.etiqueta }}</dt><dd>{{ fila.valor }}</dd></div> }
          </dl>
        </div>
        <div class="acciones">
          <button type="button" class="cerrar" (click)="cerrar.emit()">Cerrar</button>
          @if (hayTabla()) { <button type="button" class="ver-tabla" (click)="verEnTabla()">Ver este evento en la tabla</button> }
        </div>
      } @else {
        <p class="vacio">Pulsa un terremoto en el mapa o el globo, o elige una fila de la tabla.</p>
      }
      <p class="solo-lectores" role="status" aria-live="polite">{{ anuncio() }}</p>
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .detalle { container-type: inline-size; }
    /* CAMBIO (ronda 2 Mission Control): dentro del HUD derecho (≥ 1100 px) el panel deja de ser una caja (la pila pone fondo y separadores finos) y se compacta: título más pegado y filas más juntas.
       Sin selección es una sola indicación; con selección, «M x.x» grande + lugar + filas; si la pila no cabe en altura, la pila (no este panel) hace scroll interno. */
    @media (min-width: 1100px) {
      :host-context(.hud-pila) .detalle { background: none; border: 0; border-radius: 0; box-shadow: none; padding: 0; }
      :host-context(.hud-pila) .detalle::before { display: none; }
      :host-context(.hud-pila) .panel-titulo { margin-bottom: var(--esp-2); }
      :host-context(.hud-pila) .det-cabecera { margin-bottom: var(--esp-2); }
      /* CAMBIO (cierre F7): en el HUD (308 px) las seis filas van en línea «etiqueta · valor» (una por renglón): la pila cabe sin scroll interno y la leyenda no queda oculta */
      :host-context(.hud-pila) .det-filas { gap: 3px 0; grid-template-columns: minmax(0, 1fr); }
      :host-context(.hud-pila) .det-filas > div { grid-template-columns: auto minmax(0, 1fr); gap: 0 var(--esp-3); align-items: baseline; }
      :host-context(.hud-pila) .det-filas dd { text-align: right; font-size: var(--t-s); }
      :host-context(.hud-pila) .acciones { margin-top: var(--esp-2); }
    }
    .vacio { margin: 0; font-size: var(--t-m); color: var(--texto-2); }
    .det-replay { margin: 0 0 var(--esp-2); padding: 6px 10px; white-space: pre-line; background: var(--replay-fondo); color: var(--replay-texto); border: 1px solid var(--replay); border-left-width: 4px; border-radius: var(--radio-s); font-weight: 700; font-size: var(--t-s); }
    /* magnitud GRANDE («M 5.6») junto al lugar; --acento-texto sobre --superficie-1: contraste > 4,5:1 (lo mide tests/dashboard.test.ts). El lugar cede el espacio (min-width: 0) */
    .det-cabecera { display: flex; flex-wrap: wrap; align-items: center; gap: var(--esp-1) var(--esp-3); margin-bottom: var(--esp-3); }
    .det-mag { margin: 0; }
    .det-mag-valor { font-size: var(--t-xl); font-weight: 800; line-height: 1.1; color: var(--acento-texto); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .det-lugar { flex: 1 1 8rem; min-width: 0; margin: 0; font-weight: 700; overflow-wrap: anywhere; text-wrap: balance; }
    .det-filas { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px var(--esp-3); margin: 0; }
    .det-filas > div { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); }
    .det-filas dt { color: var(--texto-2); font-size: var(--t-s); }
    .det-filas dd { margin: 0; color: var(--texto); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
    /* con ancho (tablet: el panel ocupa media pantalla) los datos se reparten en dos columnas; en la columna estrecha del escritorio, una */
    @container (min-width: 420px) { .det-filas { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .acciones { display: flex; flex-wrap: wrap; gap: var(--esp-2); margin-top: var(--esp-3); }
    button { min-height: 36px; min-width: 36px; padding: 0 12px; font: 600 var(--t-m) var(--fuente); background: var(--superficie-2); color: var(--texto); border: 1px solid var(--borde-control); border-radius: var(--radio-s); cursor: pointer; touch-action: manipulation; }
    button:hover { border-color: var(--acento); color: var(--acento-texto); }
    button:focus-visible { outline: 3px solid var(--foco); outline-offset: 2px; }
    .solo-lectores { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; margin: 0; }
  `,
})
export class DetalleEventoComponent {
  /** Evento seleccionado (null = ninguno). Lo deriva AppComponent de `seleccionado()` + `eventos()`: sirve igual con la selección desde el mapa, el globo, la tabla o anterior/siguiente. */
  readonly evento = input<Evento | null>(null);
  /** Modo REPRODUCCIÓN: el panel lleva su bloque violeta (etiqueta y, si es un caso controlado, su distintivo). */
  readonly replay = input(false);
  readonly ejecucion = input<EjecucionReplay | null>(null);
  /** ¿Existe la tabla en la página? (solo con la API): habilita «Ver este evento en la tabla». */
  readonly hayTabla = input(false);
  /** «Cerrar»: AppComponent lo resuelve con elegir(null, 'mapa'); la cámara del globo se recupera sola al llegar seleccionado = null (escena.fijarSeleccion). */
  readonly cerrar = output<void>();

  readonly ficha = computed(() => {
    const e = this.evento();
    if (e === null) return null;
    const prof = e.geometry?.type === 'Point' ? e.geometry.coordinates[2] : null;
    return filasFicha(e.properties, prof, e.id);
  });
  readonly textoReplay = computed(() => {
    const e = this.evento();
    return e !== null && this.replay() ? fichaReplay(e.properties, this.ejecucion(), true).trim() : '';
  });
  /** Anuncio único de la página: cambia solo al seleccionar otro evento (o actualizarse sus datos), nunca cada segundo. */
  readonly anuncio = computed(() => { const f = this.ficha(); return f ? `Seleccionado: ${f.lugar}. ${f.insignia}.` : ''; });

  /** CAMBIO (vistas internas): la tabla vive ahora en la vista Eventos (oculta mientras se ve el Panel, donde está este panel), así que ya no se puede enfocar desde aquí: se pide a AppComponent
   *  que cambie de vista y lleve el foco al título de la tabla (#tabla-titulo, con la fila seleccionada ya en su página). */
  readonly verTabla = output<void>();
  verEnTabla(): void { this.verTabla.emit(); }
}
