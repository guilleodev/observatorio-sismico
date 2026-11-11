// Componente de filtros (F5, paso 5.4): periodo (UTC), magnitud mínima y país, incluido «Sin país asignado». Solo EDITA un borrador y emite el estado
// al pulsar «Aplicar»; toda la lógica (validación, conversión a parámetros de la API) está en `filtros.ts`, compartida con mapa, tabla y gráficas.
import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { AVISO_COBERTURA, NOMBRE_SIN_PAIS, SIN_PAIS, aCampoFecha, estadoInicial, validar } from '../filtros';
import { AVISO_FILTROS_REPLAY } from '../modo';
import type { FiltrosEstado, PaisCatalogo, Preajuste, Ventana } from '../modelos';

@Component({
  selector: 'app-filtros',
  standalone: true,
  template: `
    <form class="filtros" (submit)="aplicar($event)" aria-labelledby="filtros-titulo" novalidate>
      <h2 id="filtros-titulo">Filtros</h2>
      <div class="campos">
        <label>Periodo
          <select [value]="borrador().preajuste" (change)="cambiarPreajuste($event)">
            <option value="ultimas-24h">{{ replay() ? 'Toda la ejecución' : 'Últimas 24 horas' }}</option>
            @if (!replay()) { <option value="ultimos-7d">Últimos 7 días</option> }
            <option value="personalizado">Personalizado (UTC)</option>
          </select>
        </label>
        <!-- CAMBIO (ronda 2): Desde/Hasta solo se muestran con «Personalizado» (antes aparecían deshabilitados y vacíos, ~120 px de altura inútil). El borrador conserva sus valores; la lógica no cambia. -->
        @if (personalizado()) {
          <label>Desde (UTC)
            <input type="datetime-local" step="60" [value]="borrador().desde" (input)="cambiar('desde', $event)" />
          </label>
          <label>Hasta (UTC, excl.)
            <input type="datetime-local" step="60" [value]="borrador().hasta" (input)="cambiar('hasta', $event)" />
          </label>
        }
        <label>Magnitud mínima
          <input type="text" inputmode="decimal" autocomplete="off" placeholder="sin mínimo" aria-describedby="ayuda-magnitud" [value]="borrador().magMin" (input)="cambiar('magMin', $event)" />
        </label>
        <label>País
          <select [value]="borrador().pais" (change)="cambiar('pais', $event)">
            <option value="">Todos los países</option>
            <option [value]="sinPais">{{ nombreSinPais }}</option>
            @for (p of paises(); track p.id) {
              <option [value]="p.id">{{ p.nombre }}</option>
            }
          </select>
        </label>
        <!-- F7: los botones van en la MISMA fila de campos (rejilla): en escritorio todo cabe en una línea y en móvil se ajusta -->
        <div class="acciones">
          <button type="submit" [disabled]="errores().length > 0">Aplicar filtros</button>
          <button type="button" (click)="restablecer()">Restablecer</button>
        </div>
      </div>
      <!-- F7: los errores de validación van pegados a los campos (justo debajo); la ayuda y el aviso pasan a ser notas discretas -->
      @if (errores().length > 0) {
        <ul class="errores" role="alert">
          @for (e of errores(); track e) {
            <li>{{ e }}</li>
          }
        </ul>
      }
      <!-- CAMBIO (ronda 2): aviso breve de una línea + desplegable «Ayuda de los filtros» con el texto COMPLETO (ayuda de la magnitud y aviso metodológico). El campo de magnitud sigue apuntando a #ayuda-magnitud (aria-describedby funciona aunque el <details> esté cerrado). -->
      <p class="aviso-breve" role="note">{{ replay() ? 'REPRODUCCIÓN: periodo y filtros de la ejecución (ver ayuda).' : 'Cobertura distinta del histórico de 2025 (ver ayuda).' }}</p>
      <details class="ayuda-filtros">
        <summary>Ayuda de los filtros</summary>
        <p id="ayuda-magnitud" class="ayuda">Opcional: vacío = todas. Un evento sin magnitud no cumple ningún mínimo (se cuenta aparte, nunca como 0). Los periodos son [desde, hasta) en UTC.</p>
        <p class="aviso" role="note">{{ replay() ? avisoReplay : aviso }}</p>
      </details>
    </form>
  `,
  styles: `
    :host { display: block; min-width: 0; container-type: inline-size; }
    /* CAMBIO (ronda 2 Mission Control): el formulario ya no es una caja propia: lo envuelve el panel «Filtros» de la página (HUD flotante, rejilla de tablet o barra de móvil), que pone el fondo, la línea y el título visible.
       El h2 sigue en el DOM (nombra el formulario con aria-labelledby) pero queda visualmente oculto para no repetir «Filtros». */
    .filtros { margin: 0; padding: 0; }
    h2 { position: absolute; width: 1px; height: 1px; margin: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    /* CAMBIO (rediseño dashboard): por defecto UNA columna (la barra lateral de ~300 px del escritorio: periodo, desde, hasta, magnitud, país y botones apilados). Con ancho de CONTENEDOR
       (tablet, móvil ancho) pasa a rejilla que se ajusta: la columna mínima nunca supera el 100 % del contenedor (sin desbordar a 320 px). Mismo componente, sin duplicar lógica. */
    .campos { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--esp-2); align-items: end; }
    @container (min-width: 460px) { .campos { grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); } }
    .acciones button { flex: 1 1 auto; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: var(--t-s); font-weight: 600; color: var(--texto-2); min-width: 0; }
    input, select { min-width: 0; width: 100%; }
    input, select { font: inherit; font-size: .92rem; font-weight: 400; padding: 5px 10px; min-height: 36px; border: 1px solid var(--borde-control); border-radius: var(--radio-s); background-color: var(--fondo); color: var(--texto); }
    input:hover:not(:disabled), select:hover { border-color: var(--texto-2); }
    /* fechas deshabilitadas (periodo no personalizado): borde discontinuo y fondo apagado; el texto sigue legible */
    input:disabled { background-color: var(--superficie-2); color: var(--texto-2); border: 1px dashed var(--borde); cursor: not-allowed; }
    .acciones { display: flex; flex-wrap: wrap; gap: var(--esp-2); }
    button { font: inherit; font-weight: 700; padding: 6px 14px; min-height: 36px; border-radius: var(--radio-s); border: 1px solid var(--acento); background: var(--acento); color: var(--sobre-acento); cursor: pointer; }
    button:hover:not(:disabled) { background: var(--acento-texto); border-color: var(--acento-texto); }
    button[type="button"] { background: transparent; color: var(--texto); border-color: var(--borde-control); font-weight: 600; }
    button[type="button"]:hover { background: var(--superficie-2); border-color: var(--texto-2); }
    button:disabled { background: var(--superficie-3); color: var(--texto-2); border-color: var(--borde-control); cursor: not-allowed; }
    .errores { margin: var(--esp-3) 0 0; padding: 8px 12px 8px 30px; color: var(--error-texto); background: var(--error-fondo); border: 1px solid var(--error); border-radius: var(--radio-s); font-size: var(--t-m); font-weight: 600; }
    /* CAMBIO (ronda 2): aviso breve de una línea (recortado con puntos suspensivos; el texto completo está en la ayuda) y desplegable de ayuda con objetivo de >= 36 px */
    .aviso-breve { margin: var(--esp-2) 0 0; font-size: var(--t-xs); color: var(--aviso-texto); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ayuda-filtros { margin-top: var(--esp-1); font-size: var(--t-s); }
    .ayuda-filtros summary { display: flex; align-items: center; min-height: 36px; cursor: pointer; color: var(--acento-texto); }
    .ayuda-filtros p { margin-top: var(--esp-2); }
    @container (max-width: 459px) { .ayuda, .aviso { font-size: var(--t-xs); } }
    .ayuda { font-size: var(--t-s); color: var(--texto-2); margin: 0; }
    .aviso { font-size: var(--t-s); background: var(--aviso-fondo); border-left: 3px solid var(--aviso); margin: 0; padding: 4px 10px; color: var(--aviso-texto); border-radius: 0 var(--radio-s) var(--radio-s) 0; }
  `,
})
export class FiltrosComponent {
  /** Países del catálogo que entrega el frontend (datos/paises.geojson). */
  readonly paises = input<PaisCatalogo[]>([]);
  /** Último periodo consultado: sirve para rellenar «Desde/Hasta» al elegir «Personalizado». */
  readonly referencia = input<Ventana | null>(null);
  /** F6: en reproducción el periodo por defecto es la ejecución (no «últimas 24 h») y no hay «últimos 7 días». */
  readonly replay = input<boolean>(false);
  readonly aplicado = output<FiltrosEstado>();
  /** Aditivo (rediseño dashboard): `true` mientras el borrador tiene errores de validación. El panel plegable de móvil lo usa para abrirse y que los errores nunca queden ocultos. */
  readonly invalido = output<boolean>();

  readonly borrador = signal<FiltrosEstado>(estadoInicial());
  readonly personalizado = computed(() => this.borrador().preajuste === 'personalizado');
  readonly errores = computed(() => validar(this.borrador()));

  constructor() {
    effect(() => { const hay = this.errores().length > 0; untracked(() => this.invalido.emit(hay)); });
  }
  readonly aviso = AVISO_COBERTURA;
  readonly avisoReplay = AVISO_FILTROS_REPLAY;
  readonly sinPais = SIN_PAIS;
  readonly nombreSinPais = NOMBRE_SIN_PAIS;

  cambiar(campo: 'desde' | 'hasta' | 'magMin' | 'pais', evento: Event): void {
    const valor = (evento.target as HTMLInputElement | HTMLSelectElement).value;
    this.borrador.update((b) => ({ ...b, [campo]: valor }));
  }

  cambiarPreajuste(evento: Event): void {
    const preajuste = (evento.target as HTMLSelectElement).value as Preajuste;
    this.borrador.update((b) => {
      const ref = this.referencia();
      const rellenar = preajuste === 'personalizado' && ref !== null && b.desde === '' && b.hasta === '';
      return { ...b, preajuste, desde: rellenar ? aCampoFecha(ref.startMs) : b.desde, hasta: rellenar ? aCampoFecha(ref.endMs) : b.hasta };
    });
  }

  aplicar(evento: Event): void {
    evento.preventDefault();
    if (this.errores().length === 0) this.aplicado.emit(this.borrador());
  }

  restablecer(): void {
    this.borrador.set(estadoInicial());
    this.aplicado.emit(estadoInicial());
  }
}
