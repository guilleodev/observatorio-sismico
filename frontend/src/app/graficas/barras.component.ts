// Gráfica de barras en SVG propio (F5, paso 5.5; DF2: sin biblioteca). Solo DIBUJA los recuentos que ya calculó la API: no suma, no agrupa por su cuenta
// (la agrupación de países y las etiquetas están en `graficas.ts`). Cada gráfica lleva título, descripción, el número de registros sin valor y una tabla de texto equivalente.
import { Component, computed, input } from '@angular/core';
import { disenoBarras, disenoBarrasHorizontales, pasoEtiquetas, sumaItems } from '../graficas';
import type { ItemGrafica } from '../modelos';

const ANCHO = 640;

@Component({
  selector: 'app-barras',
  standalone: true,
  template: `
    <figure class="grafica">
      <figcaption>
        <strong [id]="idBase() + '-t'">{{ titulo() }}</strong>
        <span class="desc" [id]="idBase() + '-d'">{{ descripcion() }}</span>
      </figcaption>
      @if (omitido()) {
        <p class="vacio" role="status">{{ omitido() }}</p>
      } @else if (total() === 0) {
        <p class="vacio" role="status">Sin eventos para estos filtros.</p>
      } @else {
        <div class="lienzo" tabindex="0" role="region" [attr.aria-label]="'Gráfico ' + titulo() + ' (se desplaza horizontalmente en pantallas estrechas)'">
        <svg [attr.viewBox]="'0 0 ' + ancho + ' ' + alto()" role="img" [attr.aria-labelledby]="idBase() + '-t ' + idBase() + '-d'" preserveAspectRatio="xMidYMid meet">
          <title>{{ titulo() }}</title>
          <desc>{{ descripcion() }}</desc>
          @for (m of diseno().marcas; track m) {
            @if (horizontal()) {
              <line [attr.x1]="margen().izq + m / diseno().maximo * diseno().anchoUtil" [attr.x2]="margen().izq + m / diseno().maximo * diseno().anchoUtil" [attr.y1]="margen().arr" [attr.y2]="alto() - margen().aba" class="rejilla" />
              <text [attr.x]="margen().izq + m / diseno().maximo * diseno().anchoUtil" [attr.y]="alto() - margen().aba + 14" text-anchor="middle" class="eje">{{ m }}</text>
            } @else {
              <line [attr.x1]="margen().izq" [attr.x2]="ancho - margen().der" [attr.y1]="margen().arr + diseno().altoUtil - m / diseno().maximo * diseno().altoUtil" [attr.y2]="margen().arr + diseno().altoUtil - m / diseno().maximo * diseno().altoUtil" class="rejilla" />
              <text [attr.x]="margen().izq - 6" [attr.y]="margen().arr + diseno().altoUtil - m / diseno().maximo * diseno().altoUtil + 4" text-anchor="end" class="eje">{{ m }}</text>
            }
          }
          @for (b of diseno().barras; track $index; let i = $index) {
            <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.ancho" [attr.height]="b.alto" class="barra"><title>{{ items()[i].etiqueta }}: {{ items()[i].valor }} {{ unidad() }}</title></rect>
            @if (horizontal()) {
              <text [attr.x]="margen().izq - 6" [attr.y]="b.y + b.alto / 2 + 4" text-anchor="end" class="etiqueta">{{ items()[i].etiqueta }}</text>
              <text [attr.x]="b.x + b.ancho + 5" [attr.y]="b.y + b.alto / 2 + 4" class="valor">{{ items()[i].valor }}</text>
            } @else {
              @if (i % paso() === 0) {
                <text [attr.x]="b.x + b.ancho / 2" [attr.y]="alto() - margen().aba + 14" text-anchor="middle" class="etiqueta">{{ items()[i].etiqueta }}</text>
              }
              @if (items().length <= 12 && items()[i].valor > 0) {
                <text [attr.x]="b.x + b.ancho / 2" [attr.y]="b.y - 3" text-anchor="middle" class="valor">{{ items()[i].valor }}</text>
              }
            }
          }
        </svg>
        </div>
      }
      @if (sinValor() !== null) {
        <p class="sinvalor">Registros sin valor (no se cuentan en las barras): <strong>{{ sinValor() }}</strong></p>
      }
      @if (!omitido() && items().length > 0) {
        <details>
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
    .grafica { margin: 0; background: white; padding: 12px 14px; border-left: 4px solid #176b70; }
    figcaption { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
    .desc { font-size: .8rem; color: #42596b; }
    /* en pantallas estrechas el gráfico conserva un tamaño legible y se desplaza dentro de su región (la tabla de texto equivalente siempre está debajo) */
    .lienzo { overflow-x: auto; }
    svg { width: 100%; min-width: 500px; height: auto; display: block; }
    .barra { fill: #176b70; }
    .rejilla { stroke: #d5dee5; stroke-width: 1; }
    .eje, .etiqueta, .valor { font-size: 12px; fill: #334155; }
    .valor { font-weight: 700; }
    .vacio { margin: 8px 0; padding: 10px; background: #eef3f6; font-size: .9rem; }
    .sinvalor { font-size: .8rem; margin: 6px 0 0; }
    details { margin-top: 8px; font-size: .85rem; }
    summary { min-height: 24px; padding: 4px 0; cursor: pointer; } /* objetivo táctil >= 24 px */
    table { border-collapse: collapse; margin-top: 6px; font-size: .85rem; }
    caption { text-align: left; font-weight: 600; padding-bottom: 4px; }
    th, td { border: 1px solid #c3d0da; padding: 3px 8px; text-align: left; }
    td { text-align: right; }
    :focus-visible { outline: 3px solid #1d4ed8; outline-offset: 2px; }
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

  readonly ancho = ANCHO;
  readonly horizontal = computed(() => this.orientacion() === 'horizontal');
  readonly total = computed(() => sumaItems(this.items()));
  readonly alto = computed(() => (this.horizontal() ? Math.max(120, this.items().length * 26 + 40) : 230));
  readonly margen = computed(() => (this.horizontal() ? { izq: 200, der: 44, arr: 6, aba: 24 } : { izq: 40, der: 10, arr: 16, aba: 30 }));
  readonly diseno = computed(() => {
    const valores = this.items().map((i) => i.valor);
    return this.horizontal() ? disenoBarrasHorizontales(valores, ANCHO, this.alto(), this.margen()) : disenoBarras(valores, ANCHO, this.alto(), this.margen());
  });
  readonly paso = computed(() => pasoEtiquetas(this.items().length, 12));
}
