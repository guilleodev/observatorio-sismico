// Bloque «Información y estado de los datos» (F7). Componente PRESENTACIONAL: recibe todo por inputs y no calcula datos propios;
// `estadoGeneral` (estado.ts) decide si los datos están al día y `estado-datos.ts` solo lo traduce a icono + texto + tono.
// Accesibilidad: UNA región viva (aria-live polite) con el mensaje de la lectura y la etiqueta REPRODUCCIÓN (cambian por evento, no por segundo).
// «Última lectura del frontend» cambia cada segundo y por eso queda FUERA de la región viva.
import { Component, computed, input } from '@angular/core';
import { estadoGeneral } from '../estado';
import type { EntradaEstado } from '../estado';
import { indicadorConexion, indicadorDatos, textoCobertura } from './estado-datos';

@Component({
  selector: 'app-estado-datos',
  standalone: true,
  template: `
    <section class="datos" aria-labelledby="datos-titulo">
      <div class="cab">
        <h2 id="datos-titulo">Información y estado de los datos</h2>
        <p class="modo-chip" [class.replay]="enReplay()"><span class="k">Modo</span><strong>{{ modo() }}</strong></p>
      </div>
      <div class="lectura" aria-live="polite">
        @if (etiquetaVista(); as e) { <p class="etiqueta-replay-info"><strong>{{ e }}</strong></p> }
        <p class="mensaje"><span class="k">Estado</span><span>{{ estado() }}</span></p>
      </div>
      <div class="grupos">
        @if (esApi()) {
          <div class="grupo">
            <h3>Conexión y vigencia</h3>
            <ul class="kpis">
              <li class="kpi" [attr.data-tono]="conexion().tono"><span class="k">Conexión</span><span class="v"><span class="ico" aria-hidden="true">{{ conexion().icono }}</span>{{ conexion().texto }}</span></li>
              <li class="kpi" [attr.data-tono]="datos().tono"><span class="k">Datos</span><span class="v"><span class="ico" aria-hidden="true">{{ datos().icono }}</span>{{ datos().texto }}</span></li>
            </ul>
          </div>
        }
        <div class="grupo">
          <h3>Cobertura</h3>
          <ul class="kpis">
            <li class="kpi" data-tono="neutro"><span class="k">Terremotos visualizados</span><span class="v grande">{{ conteo() }}</span><span class="sub">{{ cobertura() }}</span></li>
            <li class="kpi" data-tono="neutro"><span class="k">Países</span><span class="v">{{ paises() }}</span></li>
          </ul>
        </div>
        @if (esApi()) {
          <div class="grupo">
            <h3>Frescura</h3>
            <ul class="kpis">
              <li class="kpi" data-tono="neutro"><span class="k">Última lectura del frontend</span><span class="v">{{ lecturaFrontend() }}</span><span class="sub">refresco de este panel</span></li>
              <li class="kpi" data-tono="neutro"><span class="k">{{ enReplay() ? 'Última ingesta USGS en vivo' : 'Última ingesta USGS' }}</span><span class="v">{{ ingesta() }}</span><span class="sub">medida por la API</span></li>
            </ul>
          </div>
        }
      </div>
      <details class="detalles">
        <summary>Detalles de la lectura</summary>
        <dl class="det">
          <div><dt>Última lectura UTC</dt><dd>{{ ultimaLectura() }}</dd></div>
          <div><dt>Generación de la respuesta UTC</dt><dd>{{ generada() }}</dd></div>
          @if (esApi()) {
            <div><dt>Filtros activos</dt><dd>{{ filtros() }}</dd></div>
            <div><dt>Periodo consultado (UTC)</dt><dd>{{ periodo() }}</dd></div>
            <div><dt>Dibujados sobre el total</dt><dd>{{ conteo() }} de {{ total() ?? 'ND' }} eventos dibujados</dd></div>
          }
        </dl>
      </details>
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .datos { background: var(--superficie-1); border: 1px solid var(--borde); border-radius: var(--radio); box-shadow: var(--sombra); padding: var(--esp-3) var(--esp-4) var(--esp-2); }
    .cab { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--esp-2) var(--esp-4); }
    h2 { margin: 0; font-size: 1rem; letter-spacing: .01em; text-wrap: balance; }
    h3 { margin: 0 0 var(--esp-2); font-size: var(--t-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--texto-2); text-wrap: balance; }
    .k { color: var(--texto-2); font-size: var(--t-xs); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
    .modo-chip { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 6px; min-width: 0; margin: 0; padding: 3px 12px; background: var(--superficie-2); border: 1px solid var(--acento); border-radius: 999px; font-size: .85rem; overflow-wrap: anywhere; }
    .modo-chip.replay { border-color: var(--replay); background: var(--replay-fondo); color: var(--replay-texto); }
    .modo-chip.replay .k { color: var(--replay-texto); }
    .lectura { margin: var(--esp-3) 0; display: grid; gap: var(--esp-2); }
    .lectura p { margin: 0; }
    .mensaje { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--esp-3); font-size: .92rem; overflow-wrap: anywhere; }
    .etiqueta-replay-info { background: var(--replay-fondo); border: 1px solid var(--replay); border-left: 4px solid var(--replay); border-radius: var(--radio-s); padding: 6px 10px; color: var(--replay-texto); }
    .grupos { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: var(--esp-3) var(--esp-4); }
    .grupo { min-width: 0; }
    .kpis { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(130px, 100%), 1fr)); gap: var(--esp-2); }
    .kpi { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 8px 12px; background: var(--superficie-2); border: 1px solid var(--borde); border-left: 3px solid var(--borde-control); border-radius: var(--radio-s); font-variant-numeric: tabular-nums; }
    .kpi[data-tono='ok'] { border-left-color: var(--ok); }
    .kpi[data-tono='aviso'] { border-left-color: var(--aviso); }
    .kpi[data-tono='error'] { border-left-color: var(--error); }
    .kpi[data-tono='replay'] { border-left-color: var(--replay); }
    .v { font-size: .95rem; font-weight: 600; overflow-wrap: anywhere; }
    .v.grande { font-size: var(--t-xl); line-height: 1.1; }
    .ico { display: inline-block; min-width: 1.2em; margin-right: 4px; font-weight: 700; }
    .kpi[data-tono='ok'] .ico { color: var(--ok); }
    .kpi[data-tono='aviso'] .ico { color: var(--aviso); }
    .kpi[data-tono='error'] .ico { color: var(--error); }
    .kpi[data-tono='replay'] .ico { color: var(--replay); }
    .sub { color: var(--texto-2); font-size: var(--t-s); overflow-wrap: anywhere; }
    .detalles { margin-top: var(--esp-3); border-top: 1px solid var(--borde); font-size: .85rem; color: var(--texto-2); }
    .detalles summary { min-height: 24px; padding: 8px 0; cursor: pointer; color: var(--acento-texto); }
    .det { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: var(--esp-2) var(--esp-4); margin: 0 0 var(--esp-3); }
    .det div { min-width: 0; }
    dt { font-weight: 700; } dd { margin: 0; color: var(--texto); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  `,
})
export class EstadoDatosComponent {
  readonly esApi = input<boolean>(false);
  /** Entrada que ya usa `app-estado`: de ella salen la conexión y, con `estadoGeneral`, la vigencia de los datos. */
  readonly entrada = input.required<EntradaEstado>();
  readonly modo = input.required<string>();
  readonly estado = input.required<string>();
  readonly paises = input.required<string>();
  readonly conteo = input.required<number>();
  readonly omitidos = input.required<number>();
  readonly total = input<number | null>(null);
  readonly ultimaLectura = input.required<string>();
  readonly generada = input.required<string>();
  readonly filtros = input<string>('');
  readonly periodo = input<string>('');
  readonly etiquetaVista = input<string | null>(null);
  /** «hace 12 s» desde el último refresco correcto del FRONTEND (cambia cada segundo: fuera de la región viva). */
  readonly lecturaFrontend = input<string>('');
  /** Última ingesta de USGS medida por la API (texto ya calculado por `textoIngestaCompacto`). */
  readonly ingesta = input<string>('');
  readonly enReplay = input<boolean>(false);

  readonly conexion = computed(() => indicadorConexion(this.entrada()));
  readonly datos = computed(() => indicadorDatos(estadoGeneral(this.entrada()), this.enReplay()));
  readonly cobertura = computed(() => textoCobertura(this.esApi() ? this.total() : null, this.omitidos()));
}
