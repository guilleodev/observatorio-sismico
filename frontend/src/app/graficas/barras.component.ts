// Gráfica de barras en SVG propio (F5, paso 5.5; DF2: sin biblioteca). Solo DIBUJA los recuentos que ya calculó la API: no suma, no agrupa por su cuenta
// (la agrupación de países y las etiquetas están en `graficas.ts`). Cada gráfica lleva título, descripción, el número de registros sin valor y una tabla de texto equivalente.
// F7 ronda 3 «Mission Control»: sin caja de tarjeta (solo una línea fina superior), título en versalitas + subtítulo, tres formatos de lienzo (hero panorámico, columna alta y estándar),
// barras con degradado sutil (cian, o neutro-cian para magnitud) y, solo si el padre pasa `colores`, una barra por color de rango con leyenda en línea. Los cálculos NO cambian.
// F7 Análisis, iteración A: tooltip HTML interactivo (hover, foco y toque; contenido en graficas-tooltip.ts), eje temporal con horas y fechas separadas para «por hora» (graficas-eje.ts) y
// teclado con roving tabindex (UN solo tab stop por gráfica). Los eventos se delegan en el <svg> (data-i): no hay listeners por barra.
import { Component, ElementRef, HostListener, Injector, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { disenoBarras, disenoBarrasHorizontales, etiquetaRecortada, pasoEtiquetas, sumaItems } from '../graficas';
import { leyendaDeColores, rangoDeColor } from '../graficas-color';
import { ticksEjeTemporal } from '../graficas-eje';
import { contenidoTooltip, indiceSiguiente, posicionarTooltip, type TipoGrafica } from '../graficas-tooltip';
import { IconoComponent } from '../icono/icono.component';
import type { ItemGrafica } from '../modelos';

type Formato = 'estandar' | 'hero' | 'columna';
/** Ancho del viewBox por formato. El texto del SVG mide 12 px a escala 1; `MIN_ANCHO` evita bajar de ≈ 10,5 px efectivos (por debajo, el lienzo se desplaza dentro de su región). */
const ANCHO: Record<Formato, number> = { estandar: 600, hero: 720, columna: 440 };
const MIN_ANCHO: Record<Formato, number> = { estandar: 530, hero: 640, columna: 400 };
/** Separación (px) entre la barra y el tooltip, y umbral (px) que distingue un toque de un arrastre de scroll. */
const SEPARACION_TIP = 8;
const UMBRAL_TOQUE = 8;

@Component({
  selector: 'app-barras',
  standalone: true,
  imports: [IconoComponent],
  template: `
    <figure class="grafica" [class.hero]="formato() === 'hero'">
      <figcaption>
        <div class="cab">
          <strong class="titulo etiqueta-ui" [id]="idBase() + '-t'">{{ titulo() }}</strong>
          @if (cifra() !== null) { <span class="cifra"><span class="n mono">{{ cifra() }}</span> {{ cifraEtiqueta() }}</span> }
        </div>
        @if (subtitulo()) { <span class="sub">{{ subtitulo() }}</span> }
        <!-- CAMBIO (ronda 3): «Cómo se calcula» sigue siendo un <details> nativo (accesible por teclado, cerrado por defecto) con icono de información. El texto completo sigue en el DOM y el <svg> lo referencia con aria-labelledby (también si está cerrado). -->
        <details class="como">
          <summary><app-icono nombre="info" class="ico" /> Cómo se calcula</summary>
          <span class="desc" [id]="idBase() + '-d'">{{ descripcion() }}</span>
        </details>
      </figcaption>
      @if (omitido()) {
        <p class="vacio" role="status">{{ omitido() }}</p>
      } @else if (total() === 0) {
        <p class="vacio" role="status">Sin eventos para estos filtros.</p>
      } @else {
        <!-- CAMBIO (análisis A): la zona es el contenedor de posicionamiento del tooltip (fuera del lienzo con scroll, para que no lo recorte su overflow). El lienzo ya NO es un tab stop propio:
             el único tab stop es la barra activa (roving tabindex) y, al moverse, el navegador desplaza el lienzo para mostrarla. -->
        <div class="zona" #zona>
          <div class="lienzo" (scroll)="ocultar()">
          <svg #svg [attr.viewBox]="'0 0 ' + ancho() + ' ' + alto()" role="group" [attr.aria-labelledby]="idBase() + '-t ' + idBase() + '-d'" preserveAspectRatio="xMidYMid meet" [class.tono-mag]="tono() === 'magnitud'" [class.hay-activo]="activo() !== null" [style.min-width.px]="minAncho()"
               (pointermove)="alMover($event)" (pointerleave)="alSalir($event)" (pointerdown)="alPulsar($event)" (pointerup)="alSoltar($event)" (focusin)="alEnfocar($event)" (focusout)="alDesenfocar($event)" (keydown)="alTeclear($event)">
            <title>{{ titulo() }}</title>
            <desc>{{ descripcion() }}</desc>
            <defs>
              <linearGradient [id]="idBase() + '-g'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g-a" /><stop offset="1" class="g-b" /></linearGradient>
            </defs>
            @for (m of diseno().marcas; track m) {
              @if (horizontal()) {
                <line [attr.x1]="margen().izq + m / diseno().maximo * diseno().anchoUtil" [attr.x2]="margen().izq + m / diseno().maximo * diseno().anchoUtil" [attr.y1]="margen().arr" [attr.y2]="alto() - margen().aba" class="rejilla" />
                <text [attr.x]="margen().izq + m / diseno().maximo * diseno().anchoUtil" [attr.y]="alto() - margen().aba + 14" text-anchor="middle" class="eje num">{{ m }}</text>
              } @else {
                <line [attr.x1]="margen().izq" [attr.x2]="ancho() - margen().der" [attr.y1]="margen().arr + diseno().altoUtil - m / diseno().maximo * diseno().altoUtil" [attr.y2]="margen().arr + diseno().altoUtil - m / diseno().maximo * diseno().altoUtil" class="rejilla" />
                <text [attr.x]="margen().izq - 6" [attr.y]="margen().arr + diseno().altoUtil - m / diseno().maximo * diseno().altoUtil + 4" text-anchor="end" class="eje num">{{ m }}</text>
              }
            }
            <!-- CAMBIO (análisis A): eje temporal en dos filas (horas en mono; fechas en negrita con separador discontinuo en cada 00:00) y título «Hora UTC» + periodo. Solo decorativo para lectores: cada barra ya dice su fecha y hora. -->
            @if (eje().valido) {
              <g aria-hidden="true">
                @for (d of eje().dias; track d.indice) {
                  @if (d.separador) { <line class="sep-dia" [attr.x1]="margen().izq + d.x" [attr.x2]="margen().izq + d.x" [attr.y1]="margen().arr" [attr.y2]="alto() - margen().aba + 34" /> }
                  @if (d.texto) { <text class="fecha" [attr.x]="margen().izq + d.x + 4" [attr.y]="alto() - margen().aba + 30">{{ d.texto }}</text> }
                }
                @for (h of eje().horas; track h.indice) { <text class="hora-eje" text-anchor="middle" [attr.x]="margen().izq + h.x" [attr.y]="alto() - margen().aba + 14">{{ h.texto }}</text> }
                <text class="eje-titulo" [attr.x]="margen().izq" [attr.y]="alto() - margen().aba + 46">{{ eje().eje }}</text>
                <text class="eje-titulo" text-anchor="end" [attr.x]="ancho() - margen().der" [attr.y]="alto() - margen().aba + 46">{{ eje().periodo }}</text>
              </g>
            }
            @for (b of diseno().barras; track $index; let i = $index) {
              <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.ancho" [attr.height]="b.alto" class="barra" [class.barra-rango]="!!colores()" [class.sel]="activo() === i" [attr.fill]="relleno(i)" />
              @if (horizontal()) {
                <text [attr.x]="margen().izq - 6" [attr.y]="b.y + b.alto / 2 + 4" text-anchor="end" class="etiqueta">{{ recortar(items()[i].etiqueta) }}</text>
                <text [attr.x]="b.x + b.ancho + 5" [attr.y]="b.y + b.alto / 2 + 4" class="valor num">{{ items()[i].valor }}</text>
              } @else {
                @if (!eje().valido && i % paso() === 0) {
                  <text [attr.x]="b.x + b.ancho / 2" [attr.y]="alto() - margen().aba + 14" text-anchor="middle" class="etiqueta num">{{ items()[i].etiqueta }}</text>
                }
                @if (items().length <= 12 && items()[i].valor > 0) {
                  <text [attr.x]="b.x + b.ancho / 2" [attr.y]="b.y - 3" text-anchor="middle" class="valor num">{{ items()[i].valor }}</text>
                }
              }
            }
            <!-- Zonas de impacto transparentes (una por columna o fila, a todo el alto/ancho del área): reciben hover, toque y foco. Cada una lleva el texto del tooltip como aria-label (reemplaza al <title> por barra). Roving tabindex: solo la activa tiene tabindex 0. -->
            @for (g of golpes(); track $index; let i = $index) {
              <rect class="hit" role="img" [attr.data-i]="i" [attr.x]="g.x" [attr.y]="g.y" [attr.width]="g.ancho" [attr.height]="g.alto" [attr.tabindex]="i === indiceRodante() ? 0 : -1" [attr.aria-label]="contenidos()[i].texto" />
            }
          </svg>
          </div>
          <!-- Tooltip único y reutilizado: HTML posicionado con transform, sin eventos de puntero y OCULTO a lectores (la etiqueta de cada barra ya lleva el mismo texto); no es región viva. -->
          <div class="tip" #tip aria-hidden="true" [class.vis]="tipVisible()">
            @if (contenido(); as c) {
              <span class="tip-cat">@if (c.color) { <span class="tip-punto" [style.background]="c.color"></span> }{{ c.categoria }}</span>
              <span class="tip-valor"><span class="n">{{ c.valor }}</span>&nbsp;<span class="u">{{ c.unidad }}</span></span>
              @for (l of c.contexto; track $index) { <span class="tip-ctx">{{ l }}</span> }
            }
          </div>
        </div>
        @if (leyenda().length > 0) {
          <ul class="leyenda-linea" aria-label="Leyenda de colores de la gráfica">
            @for (l of leyenda(); track l.texto) { <li><span class="sw" [style.background]="l.color" aria-hidden="true"></span>{{ l.texto }}</li> }
          </ul>
        }
      }
      @if (sinValor() !== null) {
        <p class="sinvalor">Registros sin valor (no se cuentan en las barras): <strong class="num">{{ sinValor() }}</strong></p>
      }
      @if (!omitido() && items().length > 0) {
        <details class="tabla-alt">
          <summary>Ver los datos como tabla</summary>
          <table>
            <caption>{{ titulo() }}</caption>
            <thead><tr><th scope="col">Categoría</th><th scope="col">{{ unidad() }}</th></tr></thead>
            <tbody>
              @for (i of items(); track $index) {
                <tr><th scope="row">{{ i.etiqueta }}</th><td>{{ i.valor }}</td></tr>
              }
            </tbody>
          </table>
        </details>
      }
    </figure>
  `,
  styles: `
    :host { display: block; min-width: 0; } /* un elemento de rejilla con contenido ancho no debe ensanchar la página */
    /* Barras: cian (acento) con degradado vertical sutil; magnitud usa un tono neutro-cian DISTINTO (mera escala visual, sin leyenda). Contrastes medidos en tests/ronda3-analisis.test.ts */
    :host { --barra-a: var(--acento); --barra-b: var(--barra-cian-b); }
    .tono-mag { --barra-a: var(--barra-mag-a); --barra-b: var(--barra-mag-b); }
    .g-a { stop-color: var(--barra-a); } .g-b { stop-color: var(--barra-b); }
    /* CAMBIO (ronda 3): sin caja (borde, fondo, sombra); solo una línea fina superior que separa las gráficas entre sí */
    .grafica { margin: 0; padding: var(--esp-3) 0 var(--esp-2); border-top: 1px solid var(--linea); }
    .grafica.hero { border-top: 0; padding-top: var(--esp-1); }
    figcaption { display: flex; flex-direction: column; gap: 2px; margin-bottom: var(--esp-2); }
    .cab { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--esp-1) var(--esp-4); }
    .titulo { overflow-wrap: anywhere; }
    .cifra { font-size: var(--t-s); color: var(--texto-2); }
    .cifra .n { color: var(--texto); font-size: var(--t-l); font-weight: 700; }
    .sub { font-size: var(--t-s); color: var(--texto-2); }
    /* CAMBIO (análisis B, legibilidad): interlineado 1.45 y línea acotada (75ch) en la descripción; «Cómo se calcula» pasa a .85rem y se subraya (se lee como enlace, igual que «Ver los datos como tabla») */
    .desc { display: block; margin-top: var(--esp-1); font-size: var(--t-s); line-height: 1.45; max-width: 75ch; color: var(--texto-2); }
    .como { font-size: .85rem; line-height: 1.45; }
    .como summary { display: inline-flex; align-items: center; gap: var(--esp-1); min-height: 24px; padding: 2px 0; cursor: pointer; color: var(--acento-texto); text-decoration: underline; text-underline-offset: 3px; }
    .ico { --ico: 1em; }
    /* El SVG escala con su viewBox; su ancho mínimo (inline según el formato) garantiza texto ≥ ≈ 10,5 px efectivos. Por debajo, el lienzo se desplaza horizontalmente dentro de su caja
       (se llega con el teclado moviendo la barra activa: el navegador la desplaza a la vista); la tabla de texto equivalente siempre está debajo. */
    .zona { position: relative; }
    .lienzo { overflow-x: auto; }
    svg { width: 100%; height: auto; display: block; touch-action: pan-x pan-y; }   /* el toque sobre una barra no impide el scroll del lienzo ni de la página */
    .barra { pointer-events: none; }
    .barra.sel { filter: brightness(1.22); stroke: var(--punto-borde); stroke-width: 1px; }   /* resaltado sutil: más claro y filo fino; el color base y su significado no cambian */
    .hay-activo .barra:not(.sel) { opacity: .7; }
    .barra-rango { stroke: var(--punto-borde); stroke-width: 1px; }   /* borde claro: el violeta de «profunda» tiene < 3:1 frente al fondo; la forma se distingue por el borde */
    .hit { fill: transparent; pointer-events: all; cursor: default; }
    .hit:hover { fill: var(--linea); }
    .hit:focus { outline: none; }                                          /* sustituido por el trazo de :focus-visible */
    .hit:focus-visible { stroke: var(--foco); stroke-width: 2px; fill: var(--linea); }
    .rejilla { stroke: var(--linea); stroke-width: 1; }
    .sep-dia { stroke: var(--linea); stroke-width: 1; stroke-dasharray: 3 3; }
    .eje, .etiqueta, .valor { font-size: 12px; fill: var(--texto); }
    .eje { fill: var(--texto-2); }
    .hora-eje { font: 12px var(--fuente-mono); fill: var(--texto-2); }
    .fecha { font-size: 12px; font-weight: 700; fill: var(--texto); }
    .eje-titulo { font-size: 12px; fill: var(--texto-2); }
    .valor { font-weight: 700; }
    /* Tooltip: panel de cristal casi opaco con línea fina, filo de luz y elevación; sin eventos de puntero, por encima de la gráfica y por debajo de la cabecera sticky (z-index > 1000) */
    .tip { position: absolute; left: 0; top: 0; z-index: 5; box-sizing: border-box; width: max-content; max-width: min(280px, 100%); display: flex; flex-direction: column; gap: 2px; padding: var(--esp-2) var(--esp-3);
      background: var(--panel-vidrio); color: var(--texto); border: 1px solid var(--linea); border-radius: var(--radio-s); box-shadow: var(--elev-2); font-size: var(--t-s); pointer-events: none; opacity: 0; visibility: hidden; }
    .tip::before { content: ''; position: absolute; top: -1px; left: 8px; right: 8px; height: 1px; background: var(--filo); }
    .tip.vis { opacity: 1; visibility: visible; }
    .tip-cat { display: flex; align-items: center; gap: var(--esp-2); font-weight: 700; overflow-wrap: anywhere; }
    .tip-punto { flex: none; width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid var(--punto-borde); }
    .tip-valor .n { font-family: var(--fuente-mono); font-size: var(--t-l); font-weight: 700; font-variant-numeric: tabular-nums; }
    .tip-valor .u { color: var(--texto-2); }
    .tip-ctx { color: var(--texto-2); overflow-wrap: anywhere; }
    @media (prefers-reduced-motion: no-preference) {
      .barra { transition: opacity 120ms ease-out, filter 120ms ease-out; }
      .tip.vis { transition: opacity 100ms ease-out; }
    }
    .leyenda-linea { display: flex; flex-wrap: wrap; gap: var(--esp-1) var(--esp-4); margin: var(--esp-2) 0 0; padding: 0; list-style: none; font-size: var(--t-s); color: var(--texto-2); }
    .leyenda-linea li { display: inline-flex; align-items: center; gap: var(--esp-2); }
    .sw { flex: none; width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid var(--punto-borde); }
    .vacio { margin: 8px 0; padding: 10px; background: var(--superficie-2); border-radius: var(--radio-s); font-size: .9rem; }
    .sinvalor { font-size: var(--t-s); margin: 6px 0 0; color: var(--texto-2); }
    .tabla-alt { margin-top: var(--esp-2); font-size: .85rem; }
    .tabla-alt summary { min-height: 24px; padding: 4px 0; cursor: pointer; color: var(--acento-texto); text-decoration: underline; text-underline-offset: 3px; } /* enlace discreto; objetivo táctil >= 24 px */
    table { border-collapse: collapse; margin-top: 6px; font-size: .85rem; }
    caption { text-align: left; font-weight: 600; padding-bottom: 4px; }
    th, td { border: 1px solid var(--linea); padding: 3px 8px; text-align: left; }
    td { text-align: right; font-variant-numeric: tabular-nums; font-family: var(--fuente-mono); }
  `,
})
export class BarrasComponent {
  readonly titulo = input.required<string>();
  readonly descripcion = input<string>('');
  readonly items = input<ItemGrafica[]>([]);
  readonly orientacion = input<'vertical' | 'horizontal'>('vertical');
  readonly unidad = input<string>('eventos');
  /** Registros sin valor que la API contó aparte (nunca como 0). `null` = el bloque no los define. */
  readonly sinValor = input<number | null>(null);
  /** Si no es nulo, la serie se omitió (p. ej. ventana demasiado amplia): se muestra este motivo en vez de las barras. */
  readonly omitido = input<string | null>(null);
  readonly idBase = input.required<string>();
  /** Lienzo: «hero» (panorámico), «columna» (alto, para barras horizontales en una columna estrecha) o «estandar». */
  readonly formato = input<Formato>('estandar');
  /** Subtítulo pequeño bajo el título. */
  readonly subtitulo = input<string>('');
  /** Cifra de resumen discreta (p. ej. el total del periodo que ya entrega la API); null = no se muestra. */
  readonly cifra = input<number | null>(null);
  readonly cifraEtiqueta = input<string>('eventos en el periodo');
  /** Tono del degradado: cian (acento) o neutro-cian (magnitud). */
  readonly tono = input<'cian' | 'magnitud'>('cian');
  /** Un color por barra (mismo orden que `items`), o null = degradado único. Si se pasa, se muestra una leyenda en línea. */
  readonly colores = input<readonly string[] | null>(null);
  /** Qué gráfica es: decide el contenido del tooltip y, para «hora», el eje temporal. */
  readonly tipo = input<TipoGrafica>('generico');

  private readonly anfitrion = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly tip = viewChild<ElementRef<HTMLElement>>('tip');
  private readonly zona = viewChild<ElementRef<HTMLElement>>('zona');
  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('svg');

  /** Barra resaltada / con tooltip (null = ninguna). */
  readonly activo = signal<number | null>(null);
  /** Barra que tiene tabindex 0 (roving tabindex): la última enfocada. */
  readonly indiceRodante = signal(0);
  readonly tipVisible = signal(false);
  private inicioToque: { x: number; y: number } | null = null;

  readonly ancho = computed(() => ANCHO[this.formato()]);
  readonly minAncho = computed(() => MIN_ANCHO[this.formato()]);
  readonly horizontal = computed(() => this.orientacion() === 'horizontal');
  readonly total = computed(() => sumaItems(this.items()));
  /** Eje temporal (solo «hora»): sus ticks salen de `detalle` (ISO UTC) de cada barra. `valido` = false → se usan las etiquetas de siempre. */
  readonly eje = computed(() => (this.tipo() === 'hora' && !this.horizontal() ? ticksEjeTemporal(this.items(), this.ancho() - 50) : ticksEjeTemporal([], 0)));
  readonly alto = computed(() => (this.horizontal() ? Math.max(120, this.items().length * (this.formato() === 'columna' ? 30 : 26) + 40) : this.formato() === 'hero' ? 320 : 230));
  readonly margen = computed(() => (this.horizontal() ? (this.formato() === 'columna' ? { izq: 164, der: 36, arr: 6, aba: 24 } : { izq: 200, der: 44, arr: 6, aba: 24 }) : { izq: 40, der: 10, arr: 16, aba: this.eje().valido ? 56 : 30 }));
  /** Etiqueta de fila recortada al margen izquierdo (el nombre completo sigue en el tooltip y en la etiqueta accesible). */
  recortar(texto: string): string { return etiquetaRecortada(texto, this.margen().izq - 10); }
  readonly diseno = computed(() => {
    const valores = this.items().map((i) => i.valor);
    return this.horizontal() ? disenoBarrasHorizontales(valores, this.ancho(), this.alto(), this.margen()) : disenoBarras(valores, this.ancho(), this.alto(), this.margen());
  });
  readonly paso = computed(() => pasoEtiquetas(this.items().length, 12));
  readonly leyenda = computed(() => leyendaDeColores(this.colores()));
  /** Contenido (y etiqueta accesible) de cada barra; se recalcula solo si cambian los datos. */
  readonly contenidos = computed(() => {
    const total = this.total();
    const colores = this.colores();
    return this.items().map((it, i) => {
      const color = colores?.[i] ?? null;
      return contenidoTooltip(this.tipo(), it, { unidad: this.unidad(), total, color, rango: rangoDeColor(color) });
    });
  });
  readonly contenido = computed(() => { const a = this.activo(); return a === null ? null : (this.contenidos()[a] ?? null); });
  /** Zona de impacto de cada barra: columna completa (vertical) o fila completa (horizontal). Una sola vez por cambio de datos, no por movimiento. */
  readonly golpes = computed(() => {
    const n = this.items().length;
    const m = this.margen();
    const d = this.diseno();
    if (n === 0) return [];
    if (this.horizontal()) { const p = d.altoUtil / n; return Array.from({ length: n }, (_, i) => ({ x: 0, y: m.arr + i * p, ancho: this.ancho(), alto: p })); }
    const p = d.anchoUtil / n;
    return Array.from({ length: n }, (_, i) => ({ x: m.izq + i * p, y: m.arr, ancho: p, alto: d.altoUtil }));
  });

  constructor() {
    // Si llegan datos nuevos (refresco, otros filtros), el tooltip y el resaltado antiguos ya no valen.
    effect(() => { this.items(); untracked(() => { this.ocultar(); if (this.indiceRodante() >= this.items().length) this.indiceRodante.set(0); }); });
  }

  /** Relleno de la barra i: su color de rango si lo hay; si no, el degradado de este gráfico. */
  relleno(i: number): string { return this.colores()?.[i] ?? `url(#${this.idBase()}-g)`; }

  // ---------- eventos delegados (un único listener en el <svg>; el índice sale de data-i) ----------
  private indiceDe(e: Event): number | null {
    const el = (e.target as Element | null)?.closest?.('[data-i]');
    const v = el ? Number(el.getAttribute('data-i')) : NaN;
    return Number.isInteger(v) ? v : null;
  }
  alMover(e: Event): void {
    if ((e as PointerEvent).pointerType === 'touch') return;      // en táctil manda el toque, no el movimiento simulado
    const i = this.indiceDe(e);
    if (i !== null && i !== this.activo()) this.mostrar(i);        // solo si cambia de barra: sin recalcular nada en cada movimiento
  }
  alSalir(e: Event): void { if ((e as PointerEvent).pointerType !== 'touch') this.ocultar(); }   // el tooltip táctil espera a un toque fuera
  alPulsar(e: Event): void { const p = e as PointerEvent; this.inicioToque = p.pointerType === 'touch' ? { x: p.clientX, y: p.clientY } : null; }
  alSoltar(e: Event): void {
    const p = e as PointerEvent;
    const ini = this.inicioToque;
    this.inicioToque = null;
    if (p.pointerType !== 'touch' || !ini) return;
    if (Math.hypot(p.clientX - ini.x, p.clientY - ini.y) > UMBRAL_TOQUE) return;   // fue un arrastre (scroll), no un toque
    const i = this.indiceDe(e);
    if (i === null) return;
    if (i === this.activo() && this.tipVisible()) this.ocultar(); else this.mostrar(i);
  }
  alEnfocar(e: Event): void {
    const i = this.indiceDe(e);
    if (i === null) return;
    this.indiceRodante.set(i);
    this.mostrar(i);
  }
  alDesenfocar(e: Event): void {
    const sig = (e as FocusEvent).relatedTarget as Node | null;
    if (!sig || !this.svg()?.nativeElement.contains(sig)) this.ocultar();
  }
  alTeclear(e: Event): void {
    const k = e as KeyboardEvent;
    if (k.key === 'Escape') { this.ocultar(); return; }
    const nuevo = indiceSiguiente(this.indiceDe(e) ?? this.indiceRodante(), this.items().length, k.key, this.horizontal());
    if (nuevo === null) return;
    k.preventDefault();                                            // las flechas no deben desplazar la página
    this.indiceRodante.set(nuevo);
    (this.anfitrion.nativeElement.querySelector(`[data-i="${nuevo}"]`) as SVGElement | null)?.focus();   // el foco dispara alEnfocar → tooltip
  }
  /** Un toque fuera de la zona de la gráfica (en cualquier parte de la página) oculta el tooltip táctil. */
  @HostListener('document:pointerdown', ['$event'])
  alPulsarFuera(e: Event): void { if (this.tipVisible() && !this.zona()?.nativeElement.contains(e.target as Node)) this.ocultar(); }
  @HostListener('window:resize')
  alRedimensionar(): void { this.ocultar(); }

  // ---------- tooltip ----------
  mostrar(i: number): void {
    this.activo.set(i);
    // Se mide UNA vez, cuando ya se pintó el texto nuevo; solo cambia al cambiar de barra.
    afterNextRender(() => this.posicionar(i), { injector: this.injector });
  }
  ocultar(): void { this.activo.set(null); this.tipVisible.set(false); }
  private posicionar(i: number): void {
    const tip = this.tip()?.nativeElement, zona = this.zona()?.nativeElement, svg = this.svg()?.nativeElement;
    const b = this.diseno().barras[i];
    if (this.activo() !== i || !tip || !zona || !svg || !b) return;
    const z = zona.getBoundingClientRect(), s = svg.getBoundingClientRect();   // lecturas únicas por cambio de barra (no en bucle)
    const k = s.width / this.ancho();                                          // px por unidad del viewBox
    const dx = s.left - z.left, dy = s.top - z.top;                            // el desplazamiento del lienzo ya está en s.left
    const ancla = this.horizontal()
      ? { x: dx + b.x * k, y: dy + b.y * k, ancho: b.ancho * k, alto: b.alto * k }
      : { x: dx + b.x * k, y: dy + b.y * k, ancho: b.ancho * k, alto: 0 };     // vertical: el tooltip cuelga de la punta de la barra
    const p = posicionarTooltip(ancla, { ancho: tip.offsetWidth, alto: tip.offsetHeight }, { ancho: zona.clientWidth, alto: zona.clientHeight }, SEPARACION_TIP, this.horizontal() ? 'derecha' : 'arriba');
    tip.style.transform = `translate(${p.x}px, ${p.y}px)`;
    this.tipVisible.set(true);
  }
}
