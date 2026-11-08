// Tarjeta de comparación con la media de 2025 (F5, paso 5.5). Las cifras las calcula la API; aquí solo se muestran, cada una con su fuente, y con los avisos:
// periodo reciente posiblemente incompleto (con sus motivos) y, SIEMPRE, la advertencia de que la cobertura del feed en vivo y la del histórico pueden diferir,
// por lo que la diferencia no demuestra por sí sola un cambio real de actividad (hallazgo de 5.3).
import { Component, computed, input } from '@angular/core';
import { advertencias, filasComparacion, textoAmbito } from '../comparacion';
import { AVISO_COBERTURA } from '../filtros';
import type { Comparacion } from '../modelos';

@Component({
  selector: 'app-comparacion',
  standalone: true,
  template: `
    <section class="tarjeta" aria-labelledby="cmp-titulo">
      <h2 id="cmp-titulo">Comparación con el histórico de 2025</h2>
      <p class="ambito">Ámbito: {{ ambito() }} · Magnitud mínima efectiva: {{ datos().min_mag_efectiva }} · Mismo ámbito y misma magnitud en ambos periodos</p>
      @if (avisos().noDisponible) {
        <p class="aviso malo" role="status">{{ avisos().noDisponible }}</p>
      }
      <table>
        <caption class="oculto">Cifras de la comparación con su fuente</caption>
        <thead><tr><th scope="col">Concepto</th><th scope="col">Valor</th><th scope="col">Fuente</th></tr></thead>
        <tbody>
          @for (f of filas(); track f.concepto) {
            <tr><th scope="row">{{ f.concepto }}</th><td>{{ f.valor }}</td><td>{{ f.fuente }}</td></tr>
          }
        </tbody>
      </table>
      @if (avisos().magnitudElevada) {
        <p class="aviso" role="note">{{ avisos().magnitudElevada }}</p>
      }
      @if (avisos().incompleto) {
        <div class="aviso incompleto" role="status">
          <p><strong>Periodo reciente posiblemente incompleto.</strong> {{ avisos().incompleto }}</p>
          <ul>
            @for (m of avisos().motivos; track m) {
              <li>{{ m }}</li>
            }
          </ul>
        </div>
      }
      <div class="aviso cobertura" role="note">
        <p><strong>Esta diferencia no demuestra por sí sola un cambio real de actividad.</strong></p>
        <p>{{ aviso }}</p>
        @if (avisos().coberturaBaja) {
          <p>{{ avisos().coberturaBaja }}</p>
        }
        <p>El histórico de 2025 es una instantánea revisada y la media anual está inflada por las réplicas (por eso se muestra también la mediana); el periodo reciente es preliminar. No es una predicción ni una evaluación de riesgo.</p>
      </div>
    </section>
  `,
  styles: `
    .tarjeta { background: white; border-left: 4px solid #176b70; padding: 14px 16px; margin: 20px 0; }
    h2 { margin: 0 0 6px; font-size: 1.1rem; }
    .ambito { font-size: .85rem; color: #42596b; margin: 0 0 10px; }
    table { border-collapse: collapse; font-size: .9rem; width: 100%; }
    th, td { border: 1px solid #c3d0da; padding: 5px 9px; text-align: left; vertical-align: top; }
    td:nth-child(2) { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    tbody th { font-weight: 400; }
    .oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    .aviso { font-size: .85rem; margin: 10px 0 0; padding: 8px 10px; background: #fff7e0; border-left: 3px solid #e8a317; color: #4a3b0a; }
    .aviso p { margin: 4px 0; }
    .aviso ul { margin: 4px 0 4px 18px; padding: 0; }
    .aviso.malo { background: #fdecec; border-color: #b91c1c; color: #7f1d1d; }
    .aviso.incompleto { background: #fff1d6; border-color: #c2410c; }
    .aviso.cobertura { background: #e9f1fb; border-color: #1d4ed8; color: #17325c; }
  `,
})
export class ComparacionComponent {
  readonly datos = input.required<Comparacion>();
  readonly nombrePais = input<string | undefined>(undefined);
  readonly aviso = AVISO_COBERTURA;
  readonly filas = computed(() => filasComparacion(this.datos()));
  readonly avisos = computed(() => advertencias(this.datos()));
  readonly ambito = computed(() => textoAmbito(this.datos(), this.nombrePais()));
}
