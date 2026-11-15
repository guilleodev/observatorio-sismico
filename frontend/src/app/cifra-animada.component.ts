// F8 · Bloque D: cifra con cuenta animada (KPI). El texto FINAL va siempre en el DOM para los lectores de pantalla (visualmente oculto) y la cifra que cuenta es aria-hidden:
// los lectores nunca oyen valores intermedios. Con movimiento reducido, con la pestaña oculta o con texto que no es un entero sencillo, se muestra el valor al instante.
import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { enteroAnimable, progresoCifra, valorIntermedio } from './cifra-animada';

@Component({
  selector: 'app-cifra',
  standalone: true,
  template: `<span class="oculto">{{ final() }}</span><span aria-hidden="true">{{ visible() }}</span>`,
  styles: `.oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }`,
})
export class CifraAnimadaComponent {
  readonly valor = input<string | number | null>(null);
  protected readonly final = computed(() => String(this.valor() ?? ''));
  protected readonly visible = signal('');
  private actual = 0; private raf = 0;

  constructor() {
    effect(() => { const v = this.final(); untracked(() => this.mostrar(v)); });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.raf));
  }

  private mostrar(texto: string): void {
    cancelAnimationFrame(this.raf);
    const meta = enteroAnimable(texto);
    const reducido = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (meta === null || reducido || document.hidden || meta === this.actual) { this.visible.set(texto); if (meta !== null) this.actual = meta; return; }
    const desde = this.actual; const t0 = performance.now();
    this.visible.set(String(desde));                       // nunca queda vacío mientras se espera el primer fotograma
    const paso = (t: number): void => {
      const p = progresoCifra(t - t0);
      this.actual = valorIntermedio(desde, meta, p);
      this.visible.set(p < 1 ? String(this.actual) : texto);
      if (p < 1) this.raf = requestAnimationFrame(paso);
    };
    this.raf = requestAnimationFrame(paso);
  }
}
