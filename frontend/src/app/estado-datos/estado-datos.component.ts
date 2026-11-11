// Bloque «Información y estado de los datos» (F7). Componente PRESENTACIONAL: recibe todo por inputs y no calcula datos propios;
// `estadoGeneral` (estado.ts) decide si los datos están al día y `estado-datos.ts` solo lo traduce a icono + texto + tono.
// Accesibilidad: UNA región viva (aria-live polite) con el mensaje de la lectura y la etiqueta REPRODUCCIÓN (cambian por evento, no por segundo).
// «Última lectura del frontend» cambia cada segundo y por eso queda FUERA de la región viva.
import { Component, computed, input } from '@angular/core';
import { estadoGeneral } from '../estado';
import type { EntradaEstado } from '../estado';
import type { BloquePais, Evento } from '../modelos';
import { estadoUnico, indicadorConexion, indicadorDatos, notaCargados, notaCargadosPeriodo, paisesConEventos, textoCobertura, textoEstadoIngesta, textoEventosMayores, textoMagnitudMaxima } from './estado-datos';

@Component({
  selector: 'app-estado-datos',
  standalone: true,
  template: `
    <section class="datos" [class.replay]="enReplay()" aria-labelledby="datos-titulo">
      <div class="cab">
        <h2 id="datos-titulo">Información y estado de los datos</h2>
        <p class="modo-chip" [class.replay]="enReplay()"><span class="k">Modo</span><strong>{{ modo() }}</strong></p>
      </div>
      <div class="lectura" aria-live="polite">
        @if (etiquetaVista(); as e) { <p class="etiqueta-replay-info"><strong>{{ e }}</strong></p> }
        <p class="mensaje"><span class="k">Lectura</span><span>{{ estado() }}</span></p>
      </div>
      <!-- CAMBIO (rediseño 3 vistas, ronda 2): SOLO 5 tarjetas principales en una fila fina (container queries del host: 2 columnas en móvil, 3 en tablet, 5 desde 900 px de contenedor).
           1 Terremotos en el periodo (total de la API; «N cargados» como nota) · 2 Magnitud máxima y 3 Eventos ≥ M4.5 (SOLO sobre los cargados, rotuladas) ·
           4 Países con eventos (periodo; sin estadísticas se sustituye por «Visualizados», dato real) · 5 Estado ÚNICO (conexión + datos + ingesta USGS corta; icono + texto).
           Todo lo demás está en el desplegable «Más detalles de la lectura». -->
      <div class="grupos">
        <!-- Marca visible de REPRODUCCIÓN en la franja (decorativa para lectores: la etiqueta con el texto completo ya está en la región viva de arriba). Invariante 8. -->
        @if (enReplay()) { <span class="replay-marca" aria-hidden="true">▶ REPRODUCCIÓN</span> }
        <ul class="kpis">
          @if (esApi()) {
            <li class="kpi" [attr.data-tono]="tonoNeutro()"><span class="k etiqueta-ui">Terremotos en el periodo</span><span class="v grande num mono">{{ total() ?? 'ND' }}</span><span class="sub" [attr.title]="'total que informa la API · ' + notaPeriodo()">{{ notaPeriodo() }}</span></li>
          }
          <li class="kpi" [attr.data-tono]="tonoNeutro()"><span class="k etiqueta-ui">Magnitud máxima</span><span class="v grande num mono">{{ magMaxima() }}</span><span class="sub" [attr.title]="notaAlcance()">{{ notaAlcance() }}</span></li>
          <li class="kpi" [attr.data-tono]="tonoNeutro()"><span class="k etiqueta-ui">Eventos ≥ M4.5</span><span class="v grande num mono">{{ mayores() }}</span><span class="sub" [attr.title]="notaAlcance()">{{ notaAlcance() }}</span></li>
          @if (nPaisesPeriodo() !== null) {
            <li class="kpi" [attr.data-tono]="tonoNeutro()"><span class="k etiqueta-ui">Países con eventos</span><span class="v grande num mono">{{ nPaisesPeriodo() }}</span><span class="sub" title="en el periodo (sin contar «Sin país asignado»)">en el periodo</span></li>
          } @else {
            <li class="kpi" [attr.data-tono]="tonoNeutro()"><span class="k etiqueta-ui">Visualizados</span><span class="v grande num mono">{{ conteo() }}</span><span class="sub" [attr.title]="cobertura()">{{ cobertura() }}</span></li>
          }
          @if (esApi()) {
            <li class="kpi kpi-estado" [attr.data-tono]="estadoKpi().tono"><span class="k etiqueta-ui">Estado</span><span class="v"><span class="ico" aria-hidden="true">{{ estadoKpi().icono }}</span>{{ estadoKpi().texto }}</span><span class="sub" [attr.title]="ingestaCorta()">{{ ingestaCorta() }}</span></li>
          }
        </ul>
      </div>
      <details class="detalles">
        <summary>Más detalles de la lectura</summary>
        <dl class="det">
          @if (esApi()) {
            <div><dt>Conexión</dt><dd><span class="ico" aria-hidden="true">{{ conexion().icono }}</span>{{ conexion().texto }}</dd></div>
            <div><dt>Datos</dt><dd><span class="ico" aria-hidden="true">{{ datos().icono }}</span>{{ datos().texto }}</dd></div>
            <div><dt>Última lectura del frontend</dt><dd>{{ lecturaFrontend() }} <span class="nota">(refresco de este panel)</span></dd></div>
            <div><dt>{{ enReplay() ? 'Última ingesta USGS en vivo' : 'Última ingesta USGS' }}</dt><dd>{{ ingesta() }} <span class="nota">(medida por la API)</span></dd></div>
          }
          <div><dt>Terremotos visualizados</dt><dd>{{ conteo() }} · {{ cobertura() }}</dd></div>
          <div><dt>Países (catálogo)</dt><dd>{{ paises() }}</dd></div>
          @if (nPaisesPeriodo() !== null) { <div><dt>Países con eventos</dt><dd>{{ nPaisesPeriodo() }} en el periodo (sin contar «Sin país asignado»)</dd></div> }
          <div><dt>Última lectura UTC</dt><dd class="mono">{{ ultimaLectura() }}</dd></div>
          <div><dt>Generación de la respuesta UTC</dt><dd class="mono">{{ generada() }}</dd></div>
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
    :host { display: block; min-width: 0; container-type: inline-size; }
    /* CAMBIO (ronda 2 Mission Control): FRANJA DE TELEMETRÍA. Una sola fila fina (≈ 56–64 px) sin cajas por KPI: cifras mono, etiqueta en versalitas, nota de alcance en una línea y separadores finos (--linea).
       Lo que antes eran el h2, el chip de modo y la línea «Lectura» queda VISUALMENTE oculto (sigue en el DOM: el h2 nombra la sección y la línea «Lectura» es la ÚNICA región viva). «Más detalles de la lectura» va a la derecha. */
    .datos { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px var(--esp-3); align-items: center; min-height: 60px; background: var(--panel-vidrio); border: 1px solid var(--linea); border-radius: var(--radio-panel); box-shadow: var(--elev-1); padding: 4px 12px; }
    .datos::before { content: ''; position: absolute; top: -1px; left: 12px; right: 12px; height: 1px; background: var(--filo); pointer-events: none; }
    .datos.replay::before { background: var(--filo-replay); }
    .cab, .lectura { position: absolute; width: 1px; height: 1px; margin: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    h2 { margin: 0; font-size: var(--t-xs); }
    @container (min-width: 640px) {
      .datos { grid-template-columns: minmax(0, 1fr) auto; }
      .detalles { grid-column: 2; grid-row: 1; }
    }
    h3 { margin: 0 0 var(--esp-2); font-size: var(--t-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--texto-2); text-wrap: balance; }
    .k { color: var(--texto-2); }
    .modo-chip { margin: 0; }
    .lectura p { margin: 0; }
    .grupos { display: flex; align-items: center; gap: var(--esp-3); min-width: 0; }
    /* marca visible de REPRODUCCIÓN (violeta, con glifo ▶ y texto: no solo color) */
    .replay-marca { flex: none; padding: 1px 8px; background: var(--replay-fondo); color: var(--replay-texto); border: 1px solid var(--replay); border-radius: 999px; font-size: var(--t-2xs); font-weight: 700; letter-spacing: .08em; white-space: nowrap; }
    /* rejilla por container queries (el host es el contenedor): 2 columnas por defecto (móvil, minmax(0,1fr) = sin desbordes a 320 px, sin cajas), 3 desde 640 px, 5 desde 900 px con separadores verticales finos */
    .kpis { flex: 1 1 auto; min-width: 0; list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--esp-1) var(--esp-2); }
    @container (min-width: 640px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @container (min-width: 900px) { .kpis { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0; } .kpi + .kpi { border-left: 1px solid var(--linea); padding-left: 14px; } }
    .nota { color: var(--texto-2); font-size: var(--t-s); }
    .kpi { display: flex; flex-direction: column; gap: 0; min-width: 0; padding: 2px 0; font-variant-numeric: tabular-nums; }
    .k { font-size: var(--t-2xs); line-height: 1.3; }
    .v { font-size: var(--t-m); font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; }
    .v.grande { font-size: 1.4rem; line-height: 1.1; white-space: nowrap; }
    .ico { display: inline-block; min-width: 1.2em; margin-right: 4px; font-weight: 700; }
    .kpi[data-tono='ok'] .ico { color: var(--ok); }
    .kpi[data-tono='aviso'] .ico { color: var(--aviso); }
    .kpi[data-tono='error'] .ico { color: var(--error); }
    .kpi[data-tono='replay'] .ico, .kpi[data-tono='replay'] .k, .kpi[data-tono='replay'] .v.grande { color: var(--replay-texto); }
    /* nota de alcance: una línea pequeña; si es larga se recorta SOLO visualmente (el texto completo sigue en el DOM y en el atributo title) */
    .sub { display: block; min-width: 0; color: var(--texto-2); font-size: .68rem; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .detalles { position: relative; font-size: .85rem; color: var(--texto-2); }
    .detalles summary { display: flex; align-items: center; min-height: 36px; padding: 0 12px; cursor: pointer; color: var(--acento-texto); white-space: nowrap; border: 1px solid var(--linea); border-radius: var(--radio-control); }
    .detalles summary:focus-visible { outline: 3px solid var(--foco); outline-offset: 2px; }
    @container (min-width: 640px) {
      /* desplegable flotante bajo la franja, a la derecha: queda POR ENCIMA del escenario (el host lleva z-index: ver .o-kpi en app.component.css), no empuja el visor y no se sale de la franja (ancho ≤ 90 % del contenedor) */
      .detalles .det { position: absolute; right: 0; top: 100%; z-index: 30; width: min(560px, 90cqw); margin: 4px 0 0; padding: var(--esp-3); background: var(--panel-vidrio); border: 1px solid var(--borde-control); border-radius: var(--radio-panel); box-shadow: var(--elev-3); }
    }
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
  /** Eventos CARGADOS (los mismos que la tabla): de ellos salen «Magnitud máxima» y «Eventos ≥ M4.5» (nunca del total del periodo). */
  readonly eventos = input<readonly Evento[]>([]);
  /** `estadisticas.por_pais` (completo para el periodo): de él sale «Países con eventos»; null = sin estadísticas, la tarjeta se omite. */
  readonly porPais = input<BloquePais | null>(null);

  readonly tonoNeutro = computed(() => (this.enReplay() ? 'replay' : 'neutro')); // en REPRODUCCIÓN las tarjetas llevan el borde violeta
  readonly magMaxima = computed(() => textoMagnitudMaxima(this.eventos()));
  readonly mayores = computed(() => textoEventosMayores(this.eventos()));
  readonly notaAlcance = computed(() => notaCargados(this.eventos().length, this.esApi() ? this.total() : null));
  readonly nPaisesPeriodo = computed(() => (this.esApi() ? paisesConEventos(this.porPais()) : null));

  readonly conexion = computed(() => indicadorConexion(this.entrada()));
  readonly datos = computed(() => indicadorDatos(estadoGeneral(this.entrada()), this.enReplay()));
  readonly cobertura = computed(() => textoCobertura(this.esApi() ? this.total() : null, this.omitidos()));
  // CAMBIO (rediseño 3 vistas, ronda 2): tarjeta «Estado» única y nota «N cargados» del recuento del periodo (funciones puras de estado-datos.ts)
  readonly estadoKpi = computed(() => estadoUnico(this.conexion(), this.datos()));
  readonly ingestaCorta = computed(() => textoEstadoIngesta(this.ingesta(), this.enReplay()));
  readonly notaPeriodo = computed(() => notaCargadosPeriodo(this.eventos().length));
}
