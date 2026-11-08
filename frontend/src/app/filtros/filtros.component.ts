// Componente de filtros (F5, paso 5.4): periodo (UTC), magnitud mínima y país, incluido «Sin país asignado». Solo EDITA un borrador y emite el estado
// al pulsar «Aplicar»; toda la lógica (validación, conversión a parámetros de la API) está en `filtros.ts`, compartida con mapa, tabla y gráficas.
import { Component, computed, input, output, signal } from '@angular/core';
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
        <label>Desde (UTC)
          <input type="datetime-local" step="60" [value]="borrador().desde" [disabled]="!personalizado()" (input)="cambiar('desde', $event)" />
        </label>
        <label>Hasta (UTC, exclusivo)
          <input type="datetime-local" step="60" [value]="borrador().hasta" [disabled]="!personalizado()" (input)="cambiar('hasta', $event)" />
        </label>
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
      </div>
      <p id="ayuda-magnitud" class="ayuda">Opcional: vacío = todas. Un evento sin magnitud no cumple ningún mínimo (se cuenta aparte, nunca como 0). Los periodos son [desde, hasta) en UTC.</p>
      @if (errores().length > 0) {
        <ul class="errores" role="alert">
          @for (e of errores(); track e) {
            <li>{{ e }}</li>
          }
        </ul>
      }
      <div class="acciones">
        <button type="submit" [disabled]="errores().length > 0">Aplicar filtros</button>
        <button type="button" (click)="restablecer()">Restablecer</button>
      </div>
      <p class="aviso" role="note">{{ replay() ? avisoReplay : aviso }}</p>
    </form>
  `,
  styles: `
    .filtros { background: white; border-left: 4px solid #176b70; padding: 16px; margin: 0 0 20px; }
    h2 { margin: 0 0 12px; font-size: 1.1rem; }
    .campos { display: flex; flex-wrap: wrap; gap: 12px 16px; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: .85rem; font-weight: 600; min-width: 170px; }
    input, select { font: inherit; font-weight: 400; padding: 6px 8px; border: 1px solid #9fb3c0; border-radius: 4px; background: white; }
    input:disabled { background: #eef3f6; color: #6b7f8f; }
    .ayuda { font-size: .8rem; color: #42596b; margin: 10px 0 0; }
    .errores { margin: 10px 0 0; padding-left: 20px; color: #9b1c1c; font-size: .9rem; }
    .acciones { display: flex; gap: 10px; margin-top: 12px; }
    button { font: inherit; padding: 7px 14px; border-radius: 4px; border: 1px solid #176b70; background: #176b70; color: white; cursor: pointer; }
    button[type="button"] { background: white; color: #176b70; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .aviso { font-size: .85rem; background: #fff7e0; border-left: 3px solid #e8a317; margin: 14px 0 0; padding: 8px 10px; color: #4a3b0a; }
    :focus-visible { outline: 3px solid #1d4ed8; outline-offset: 2px; }
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

  readonly borrador = signal<FiltrosEstado>(estadoInicial());
  readonly personalizado = computed(() => this.borrador().preajuste === 'personalizado');
  readonly errores = computed(() => validar(this.borrador()));
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
