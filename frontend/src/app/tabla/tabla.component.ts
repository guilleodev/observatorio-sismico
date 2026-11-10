// Tabla consultable de terremotos (F5, paso 5.5): la alternativa al mapa y al color (ENUNCIADO §8.7). Muestra los MISMOS eventos que el mapa, con los datos del
// contrato en texto (la clase de profundidad se escribe, no depende del color). Operable con teclado: encabezados que ordenan, búsqueda, paginación y un botón
// por fila para seleccionar el evento (una sola selección, compartida con el mapa). Un dato nulo se muestra como «sin valor», nunca como 0.
import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { fechaUtc, textoOSinValor } from '../formato';
import { COLUMNAS, ORDEN_INICIAL, TAMANO_PAGINA, buscar, filaDe, ordenar, paginaDe, paginar, siguienteOrden } from '../tabla';
import type { ClaveColumna, Orden } from '../tabla';
import type { Evento, FilaTabla } from '../modelos';
import { DISTINTIVO_CASO } from '../modo';

@Component({
  selector: 'app-tabla',
  standalone: true,
  template: `
    <section class="tabla" aria-labelledby="tabla-titulo">
      <h2 id="tabla-titulo">Tabla de terremotos@if (etiqueta()) { <span class="etiqueta-replay"> · {{ etiqueta() }}</span> }</h2>
      <div class="barra">
        <label>Buscar en la tabla
          <input type="search" autocomplete="off" placeholder="lugar, país, id, tipo de magnitud…" [value]="busqueda()" (input)="buscarTexto($event)" />
        </label>
        <p class="resumen" role="status" aria-live="polite">{{ resumen() }}</p>
      </div>
      <div class="desplazable" role="region" aria-label="Tabla de terremotos, desplazable horizontalmente" tabindex="0">
        <table>
          <caption class="oculto">@if (etiqueta()) { {{ etiqueta() }}. } Terremotos del periodo con los filtros aplicados, ordenados por {{ etiquetaOrden() }}</caption>
          <thead>
            <tr>
              @for (c of columnas; track c.clave) {
                <th scope="col" [attr.aria-sort]="ariaSort(c.clave)">
                  <button type="button" class="orden" (click)="ordenarPor(c.clave)">{{ c.etiqueta }}<span aria-hidden="true"> {{ flecha(c.clave) }}</span></button>
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (f of pagina().filas; track f.id) {
              <tr [class.seleccionada]="f.id === seleccionado()">
                <td class="fecha">{{ fecha(f.tiempo) }}</td>
                <td class="num">{{ sinValor(f.mag, 2) }}</td>
                <td>{{ f.magTipo ?? 'sin valor' }}</td>
                <td class="num">{{ sinValor(f.profundidad, 2) }}</td>
                <td>{{ f.clase }}</td>
                <td><button type="button" class="fila" [attr.aria-pressed]="f.id === seleccionado()" title="Seleccionar y ver en el mapa" (click)="elegir(f.id)">{{ f.lugar }}</button>@if (f.caso) { <span class="caso"> {{ distintivo }}: {{ f.caso }}</span> }</td>
                <td>{{ f.pais }}</td>
                <td class="num">{{ sinValor(f.lon, 3) }}</td>
                <td class="num">{{ sinValor(f.lat, 3) }}</td>
                <td class="fecha">{{ fecha(f.actualizado) }}</td>
                <td class="id">{{ f.id }}</td>
              </tr>
            } @empty {
              <tr><td [attr.colspan]="columnas.length" class="vacio">{{ busqueda() ? 'Ningún evento coincide con la búsqueda.' : 'Sin eventos para estos filtros.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <nav class="paginas" aria-label="Paginación de la tabla">
        <button type="button" (click)="irA(pagina().pagina - 1)" [disabled]="pagina().pagina <= 1">Anterior</button>
        <span>Página {{ pagina().pagina }} de {{ pagina().paginas }}</span>
        <button type="button" (click)="irA(pagina().pagina + 1)" [disabled]="pagina().pagina >= pagina().paginas">Siguiente</button>
      </nav>
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .etiqueta-replay { color: var(--replay-texto); background: var(--replay-fondo); border: 1px solid var(--replay); border-radius: var(--radio-s); padding: 0 8px; font-size: .85rem; }
    .caso { display: inline-block; margin-left: 6px; padding: 1px 6px; font-size: .75rem; font-weight: 700; background: var(--replay-fondo); color: var(--replay-texto); border: 1px solid var(--replay); border-radius: 3px; }
    .tabla { background: var(--superficie-1); border: 1px solid var(--borde); border-left: 4px solid var(--acento); border-radius: var(--radio); box-shadow: var(--sombra); padding: 14px 16px; margin: 0; }
    h2 { margin: 0 0 10px; font-size: 1.1rem; }
    .barra { display: flex; flex-wrap: wrap; gap: 10px 20px; align-items: end; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: .85rem; font-weight: 600; min-width: min(280px, 100%); }
    input { font: inherit; font-weight: 400; padding: 6px 8px; min-height: 32px; border: 1px solid var(--borde-control); border-radius: var(--radio-s); background-color: var(--fondo); color: var(--texto); }
    .resumen { margin: 0; font-size: .85rem; color: var(--texto-2); }
    .desplazable { overflow: auto; max-height: 520px; margin-top: 10px; border: 1px solid var(--borde); border-radius: var(--radio-s); overscroll-behavior: contain; }
    table { border-collapse: collapse; font-size: .82rem; width: 100%; }
    th, td { border-bottom: 1px solid var(--borde); padding: 4px 8px; text-align: left; vertical-align: top; }
    thead th { position: sticky; top: 0; background: var(--superficie-3); z-index: 1; }
    .oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .fecha, .id { white-space: nowrap; }
    .vacio { text-align: center; padding: 18px; background: var(--superficie-2); color: var(--texto-2); }
    button { font: inherit; cursor: pointer; }
    /* objetivos táctiles de al menos 24×24 px (WCAG 2.2, criterio 2.5.8) */
    .orden { background: none; border: 0; font-weight: 700; padding: 3px 4px; min-height: 24px; min-width: 24px; text-align: left; color: var(--texto); }
    .fila { background: none; border: 0; padding: 3px 0; min-height: 24px; text-align: left; color: var(--acento-texto); text-decoration: underline; }
    tr.seleccionada td { background: #3a3413; } /* ámbar oscuro: la fila seleccionada se distingue también por el texto en negrita y aria-pressed */
    tr.seleccionada .fila { font-weight: 700; }
    .paginas { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; margin-top: 10px; font-size: .9rem; }
    .paginas button { padding: 5px 12px; min-height: 28px; border: 1px solid var(--borde-control); border-radius: var(--radio-s); background: var(--superficie-2); color: var(--acento-texto); }
    .paginas button:disabled { opacity: .45; cursor: not-allowed; }
  `,
})
export class TablaComponent {
  readonly eventos = input<Evento[]>([]);
  /** Identificador del ÚNICO evento seleccionado (compartido con el mapa), o `null`. */
  /** F6: etiqueta de la reproducción («REPRODUCCIÓN · ejecución …»); null en vivo. */
  readonly etiqueta = input<string | null>(null);
  readonly distintivo = DISTINTIVO_CASO;
  readonly seleccionado = input<string | null>(null);
  readonly seleccionar = output<string>();

  readonly columnas = COLUMNAS;
  readonly orden = signal<Orden>(ORDEN_INICIAL);
  readonly busqueda = signal('');
  readonly paginaActual = signal(1);

  private readonly filas = computed<FilaTabla[]>(() => this.eventos().map((e, i) => filaDe(e, i)));
  private readonly visibles = computed(() => ordenar(buscar(this.filas(), this.busqueda()), this.orden()));
  readonly pagina = computed(() => paginar(this.visibles(), this.paginaActual(), TAMANO_PAGINA));
  readonly resumen = computed(() => {
    const p = this.pagina();
    const total = this.filas().length;
    if (total === 0) return 'Sin eventos en el periodo.';
    const filtrado = p.total !== total ? ` (${total} en el periodo)` : '';
    return p.total === 0 ? `0 de ${total} eventos coinciden con la búsqueda.` : `Mostrando ${p.desde}–${p.hasta} de ${p.total} eventos${filtrado}.`;
  });
  readonly etiquetaOrden = computed(() => `${COLUMNAS.find((c) => c.clave === this.orden().clave)?.etiqueta ?? ''} (${this.orden().direccion === 'asc' ? 'ascendente' : 'descendente'})`);

  constructor() {
    // Una selección que viene de FUERA (el mapa) debe quedar visible: se quita la búsqueda que la oculte y se va a su página.
    effect(() => {
      const id = this.seleccionado();
      if (id === null) return;
      untracked(() => {
        if (paginaDe(this.visibles(), id, TAMANO_PAGINA) === null) this.busqueda.set('');
        const pagina = paginaDe(this.visibles(), id, TAMANO_PAGINA);
        if (pagina !== null) this.paginaActual.set(pagina);
      });
    });
    // Si cambian los datos (otro filtro), la página vuelve al rango válido.
    effect(() => {
      this.eventos();
      untracked(() => this.paginaActual.update((p) => paginar(this.visibles(), p, TAMANO_PAGINA).pagina));
    });
  }

  fecha(ms: number | null): string { return fechaUtc(ms); }
  sinValor(v: number | null, decimales: number): string { return textoOSinValor(v, '', decimales); }
  ariaSort(clave: ClaveColumna): 'ascending' | 'descending' | 'none' { const o = this.orden(); return o.clave !== clave ? 'none' : o.direccion === 'asc' ? 'ascending' : 'descending'; }
  flecha(clave: ClaveColumna): string { const o = this.orden(); return o.clave !== clave ? '' : o.direccion === 'asc' ? '▲' : '▼'; }

  ordenarPor(clave: ClaveColumna): void {
    this.orden.update((o) => siguienteOrden(o, clave));
    this.paginaActual.set(1);
  }

  buscarTexto(evento: Event): void {
    this.busqueda.set((evento.target as HTMLInputElement).value);
    this.paginaActual.set(1);
  }

  irA(pagina: number): void { this.paginaActual.set(paginar(this.visibles(), pagina, TAMANO_PAGINA).pagina); }
  elegir(id: string): void { this.seleccionar.emit(id); }
}
