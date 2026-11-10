// Clave de acceso de la API (F6, 6.6, FR-041). Solo EMITE lo escrito; AppComponent la entrega al servicio, que la conserva ÚNICAMENTE en memoria (sin almacenamiento del navegador ni cookies):
// al recargar la página hay que volver a escribirla. El campo es de tipo contraseña y se vacía al enviar para no dejarla en el DOM.
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-acceso',
  standalone: true,
  template: `
    <section class="acceso" aria-labelledby="acceso-titulo">
      <h2 id="acceso-titulo">Acceso restringido a la API</h2>
      <p>La API de este panel exige una clave de acceso. Se guarda solo en la memoria de esta pestaña: no se almacena en el navegador y hay que escribirla de nuevo al recargar.</p>
      @if (rechazada()) { <p class="error" role="alert">La clave no es correcta. Inténtalo de nuevo.</p> }
      <form (submit)="enviarClave($event, campo)" novalidate>
        <label for="clave-api">Clave de acceso</label>
        <input #campo id="clave-api" type="password" autocomplete="off" spellcheck="false" autocapitalize="off" required />
        <button type="submit">Acceder</button>
      </form>
    </section>
  `,
  styles: `
    .acceso { background: var(--superficie-2); border: 1px solid var(--borde); border-left: 4px solid var(--aviso); border-radius: var(--radio); box-shadow: var(--sombra); padding: 14px 16px; margin: 0; }
    h2 { margin: 0 0 8px; font-size: 1.1rem; } p { margin: 0 0 10px; font-size: .9rem; color: var(--texto-2); }
    .error { color: var(--error-texto); background: var(--error-fondo); border-left: 3px solid var(--error); padding: 6px 10px; font-weight: 700; }
    form { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: end; }
    label { font-weight: 600; font-size: .85rem; width: 100%; }
    input { font: inherit; padding: 6px 8px; border: 1px solid var(--borde-control); border-radius: var(--radio-s); background-color: var(--fondo); color: var(--texto); min-height: 36px; min-width: min(320px, 100%); }
    button { font: inherit; font-weight: 600; padding: 6px 16px; min-height: 36px; border: 1px solid var(--acento); border-radius: var(--radio-s); background: var(--acento); color: var(--sobre-acento); cursor: pointer; }
  `,
})
export class AccesoComponent {
  readonly rechazada = input<boolean>(false);
  readonly enviar = output<string>();

  enviarClave(evento: Event, campo: HTMLInputElement): void {
    evento.preventDefault();
    const valor = campo.value.trim();
    campo.value = ''; // no queda en el campo
    if (valor !== '') this.enviar.emit(valor);
  }
}
