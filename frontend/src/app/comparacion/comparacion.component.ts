// Banda de comparación con la media de 2025 (F5, paso 5.5; rediseño F7, análisis B). Las cifras las calcula la API; aquí solo se muestran, cada una con su fuente, y con los avisos:
// periodo reciente posiblemente incompleto (con sus motivos) y, SIEMPRE, la advertencia de que la cobertura del feed en vivo y la del histórico pueden diferir,
// por lo que la diferencia no demuestra por sí sola un cambio real de actividad (hallazgo de 5.3).
// CAMBIO (análisis B): solo PRESENTACIÓN. Mismas entradas y mismos cálculos (comparacion.ts). Jerarquía: encabezado con insignias de fuente → cifras destacadas + gráfico comparativo (solo si es honesto)
// con los avisos importantes al lado → explicaciones largas plegadas («Cómo leer esta comparación») → TABLA COMPLETA plegada (todas las filas y fuentes, como alternativa accesible).
import { Component, computed, input } from '@angular/core';
import { advertencias, filasComparacion, textoAmbito } from '../comparacion';
import { graficoComparativo, indicadores, NOTA_GRAFICO } from '../comparacion-vista';
import { AVISO_COBERTURA } from '../filtros';
import { IconoComponent } from '../icono/icono.component';
import type { Comparacion } from '../modelos';

@Component({
  selector: 'app-comparacion',
  standalone: true,
  imports: [IconoComponent],
  template: `
    <section class="banda" aria-labelledby="cmp-titulo">
      <header class="cab">
        <h2 id="cmp-titulo">Comparación con el histórico de 2025</h2>
        <p class="ambito">Ámbito: {{ ambito() }} · Magnitud mínima efectiva: {{ datos().min_mag_efectiva }} · Mismo ámbito y misma magnitud en ambos periodos · Solo datos de USGS (EMSC no entra en esta comparación)</p>
        <p class="fuentes">
          <span class="insignia vivo">Feed en vivo (USGS)</span>
          @if (datos().historico) { <span class="insignia hist">Histórico 2025 (catálogo FDSN)</span> }
        </p>
      </header>
      <div class="cuerpo">
        <div class="col-cifras">
          @if (avisos().noDisponible) {
            <p class="aviso malo" role="status">{{ avisos().noDisponible }}</p>
          }
          <dl class="indicadores">
            @for (i of cifras(); track i.id) {
              <div class="ind">
                <dt class="etiqueta-ui">{{ i.titulo }}</dt>
                <dd>
                  <span class="linea-cifra"><span class="cifra mono">@if (i.glifo) { <span class="glifo" aria-hidden="true">{{ i.glifo }}</span> }{{ i.cifra }}</span>@if (i.unidad) { <span class="unidad">&nbsp;{{ i.unidad }}</span> }</span>
                  <span class="detalle">{{ i.detalle }}</span>
                  <span class="origen" [class.o-vivo]="i.fuente === 'vivo'" [class.o-hist]="i.fuente === 'historico'">{{ i.etiquetaFuente }}</span>
                </dd>
              </div>
            }
          </dl>
          @if (grafico(); as g) {
            @if (g.mostrar) {
              <figure class="grafico">
                <p class="etiqueta-ui">Reciente frente a esperado según 2025 · eventos en el periodo</p>
                <div class="barras" role="img" [attr.aria-label]="g.aria">
                  <div class="fila">
                    <span class="fila-et">Reciente</span>
                    <span class="pista"><span class="barra b-reciente" [class.incompleta]="g.incompleto" [style.width.%]="g.pctReciente"></span></span>
                    <span class="fila-val mono">{{ g.textoReciente }}</span>
                  </div>
                  <div class="fila">
                    <span class="fila-et">Esperado (2025)</span>
                    <span class="pista"><span class="barra b-esperado" [style.width.%]="g.pctEsperado"></span></span>
                    <span class="fila-val mono">{{ g.textoEsperado }}</span>
                  </div>
                  <div class="fila eje-fila"><span></span><span class="eje mono"><span>0</span><span>{{ g.textoMaximo }}</span></span><span></span></div>
                </div>
                <figcaption class="nota">
                  {{ nota }}
                  @if (g.incompleto) { <span class="leyenda-incompleto"><strong>Barra rayada:</strong> periodo reciente posiblemente incompleto; el recuento podría subir.</span> }
                </figcaption>
              </figure>
            } @else {
              <p class="nota sin-grafico">{{ g.sinGrafico }}</p>
            }
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
        </div>
        <div class="col-avisos">
          <!-- Fase 2: UNA sola nota de lectura, neutra (icono de información, sin fondos amarillos): el aviso principal y los matices de magnitud y cobertura juntos y siempre visibles (mismo texto de antes) -->
          <div class="nota-lectura" role="note">
            <app-icono nombre="info" class="nota-ico" />
            <div class="nota-cuerpo">
              <p class="nota-principal"><strong>Esta diferencia no demuestra por sí sola un cambio real de actividad.</strong> No es una predicción ni una evaluación de riesgo.</p>
              @if (avisos().magnitudElevada || avisos().coberturaBaja) {
                <ul class="matices">
                  @if (avisos().magnitudElevada) { <li>{{ avisos().magnitudElevada }}</li> }
                  @if (avisos().coberturaBaja) { <li>{{ avisos().coberturaBaja }}</li> }
                </ul>
              }
            </div>
          </div>
          <details class="plegable como">
            <summary>Cómo leer esta comparación</summary>
            <div class="como-cuerpo">
              <p>{{ aviso }}</p>
              <p>El histórico de 2025 es una instantánea revisada y la media anual está inflada por las réplicas (por eso se muestra también la mediana); el periodo reciente es preliminar.</p>
            </div>
          </details>
        </div>
      </div>
      <details class="plegable tabla-detalle">
        <summary>Ver la tabla completa de conceptos, valores y fuentes</summary>
        <table>
          <caption class="oculto">Cifras de la comparación con su fuente</caption>
          <thead><tr><th scope="col">Concepto</th><th scope="col">Valor</th><th scope="col">Fuente</th></tr></thead>
          <tbody>
            @for (f of filas(); track f.concepto) {
              <tr><th scope="row">{{ f.concepto }}</th><td>{{ f.valor }}</td><td>{{ f.fuente }}</td></tr>
            }
          </tbody>
        </table>
      </details>
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    /* Banda de ancho completo con fondo propio (--banda-fondo), filo de luz superior y línea fina inferior. Sin cajas anidadas: la jerarquía la dan las líneas finas, los títulos en versalitas y las cifras mono. */
    .banda { position: relative; background: var(--banda-fondo); border-top: 1px solid var(--linea); border-bottom: 1px solid var(--linea); padding: var(--esp-4); margin: 0; overflow-x: auto; }
    .banda::before { content: ''; position: absolute; top: -1px; left: 0; right: 0; height: 1px; background: var(--filo); pointer-events: none; }
    h2 { margin: 0 0 var(--esp-1); font-size: var(--t-l); }
    .ambito { font-size: var(--t-s); line-height: 1.45; color: var(--texto-2); margin: 0 0 var(--esp-2); max-width: 80ch; }
    /* Insignias de fuente: SIEMPRE con texto. Cian = feed en vivo; azul-gris (borde de control) = histórico. El violeta es de REPRODUCCIÓN y no se usa aquí. */
    .fuentes { display: flex; flex-wrap: wrap; gap: var(--esp-2); margin: 0 0 var(--esp-4); }
    .insignia, .origen { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: var(--t-s); font-weight: 600; line-height: 1.4; border: 1px solid var(--borde-control); background: var(--superficie-3); color: var(--texto); }
    .insignia.vivo, .origen.o-vivo { background: var(--acento-fondo); border-color: var(--acento); color: var(--acento-texto); }
    .cuerpo { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--esp-4) var(--esp-5); min-width: 0; }
    .col-cifras, .col-avisos { min-width: 0; display: grid; gap: var(--esp-3); align-content: start; }
    /* Cifras destacadas: título en versalitas, cifra mono grande, detalle y origen (texto). Separadas por líneas finas. */
    .indicadores { margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr)); gap: var(--esp-3) var(--esp-4); }
    .ind { min-width: 0; border-top: 1px solid var(--linea); padding-top: var(--esp-2); }
    .ind dt, .grafico .etiqueta-ui { font-size: var(--t-xs); }   /* versalitas ≥ .72rem (legibilidad análisis B) */
    .ind dd { margin: var(--esp-1) 0 0; display: grid; gap: 2px; justify-items: start; }
    .cifra { font-size: var(--t-xl); font-weight: 700; line-height: 1.1; color: var(--texto); font-variant-numeric: tabular-nums; }
    .glifo { font-size: var(--t-m); margin-right: 6px; color: var(--acento-texto); vertical-align: .2em; }
    .unidad { font-size: var(--t-m); color: var(--texto-2); }
    .detalle { font-size: var(--t-s); line-height: 1.45; color: var(--texto-2); }
    .origen { font-size: var(--t-xs); padding: 0 8px; }
    /* Gráfico comparativo: un solo eje de 0 al máximo, mismas unidades; sin escalas truncadas. */
    .grafico { margin: 0; min-width: 0; }
    .grafico .etiqueta-ui { margin: 0 0 var(--esp-2); }
    .barras { display: grid; gap: var(--esp-2); }
    .fila { display: grid; grid-template-columns: 6.5rem minmax(0, 1fr) 5.5rem; align-items: center; gap: var(--esp-3); }
    .fila-et { font-size: var(--t-s); color: var(--texto); }
    .fila-val { font-size: var(--t-m); font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
    .pista { display: block; height: 22px; border-left: 2px solid var(--texto-2); background: var(--linea); }
    .barra { display: block; height: 100%; }
    .b-reciente { background: var(--acento); }
    .b-esperado { background: var(--borde-control); }
    /* periodo reciente incompleto: rayado y borde discontinuo (no solo color); la longitud NO se corrige */
    .b-reciente.incompleta { background: repeating-linear-gradient(135deg, var(--acento) 0 5px, var(--banda-fondo) 5px 9px); border: 2px dashed var(--acento); border-left: 0; }
    .eje-fila { margin-top: -2px; }
    .eje { display: flex; justify-content: space-between; font-size: var(--t-s); color: var(--texto-2); }
    .nota { margin: var(--esp-2) 0 0; font-size: var(--t-s); line-height: 1.5; color: var(--texto-2); max-width: 75ch; }
    .nota .leyenda-incompleto { display: block; margin-top: 2px; color: var(--texto); }   /* Fase 2: sin amarillo (el rayado y el borde discontinuo ya lo distinguen) */
    .sin-grafico { margin: 0; }
    /* Avisos (Fase 2: tono calmado). Las notas de lectura son informativas, no alarmas: una sola nota con icono de información, línea fina a la izquierda y texto en --texto-2 (la frase clave en --texto).
       El AMARILLO queda reservado a avisos de verdad en la banda de incidencias; aquí solo el estado «no disponible» (error) conserva su color. Mismo texto y mismo orden que antes; nada se pliega. */
    .nota-lectura { display: flex; align-items: flex-start; gap: var(--esp-3); padding: var(--esp-1) 0 var(--esp-1) var(--esp-3); border-left: 2px solid var(--borde-control); color: var(--texto-2); }
    .nota-ico { --ico: 1.2rem; flex: none; color: var(--acento-texto); margin-top: 2px; }
    .nota-cuerpo { min-width: 0; display: grid; gap: var(--esp-2); }
    .nota-principal { margin: 0; font-size: var(--t-m); line-height: 1.5; }
    .nota-principal strong, .aviso strong { color: var(--texto); font-weight: 650; }
    .matices { margin: 0; padding: 0 0 0 1.1rem; display: grid; gap: 4px; font-size: var(--t-s); line-height: 1.5; }
    .aviso { font-size: var(--t-s); line-height: 1.5; margin: 0; padding: 2px 0 2px var(--esp-3); border-left: 2px solid var(--borde-control); color: var(--texto-2); }
    .aviso p { margin: 4px 0; }
    .aviso ul { margin: 4px 0 4px 18px; padding: 0; }
    .aviso.malo { background: var(--error-fondo); border-color: var(--error); color: var(--error-texto); padding: 8px 10px; border-left-width: 3px; border-radius: 0 var(--radio-s) var(--radio-s) 0; }
    /* Desplegables (cerrados por defecto): el resumen se distingue como control por el subrayado y el peso; foco visible. */
    .plegable > summary { cursor: pointer; min-height: 36px; display: flex; align-items: center; font-size: var(--t-m); font-weight: 600; color: var(--acento-texto); text-decoration: underline; text-underline-offset: 3px; }
    .plegable > summary:focus-visible { outline: 3px solid var(--foco); outline-offset: 2px; }
    .como { border-top: 1px solid var(--linea); }
    .como-cuerpo p { margin: var(--esp-2) 0; font-size: var(--t-m); line-height: 1.5; max-width: 75ch; }
    .tabla-detalle { margin-top: var(--esp-4); border-top: 1px solid var(--linea); }
    .tabla-detalle > table { margin-top: var(--esp-2); }
    table { border-collapse: collapse; font-size: var(--t-m); width: 100%; }
    th, td { border: 0; border-bottom: 1px solid var(--linea); padding: 6px 10px 6px 0; text-align: left; vertical-align: baseline; }
    thead th { font-size: var(--t-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--texto-2); }
    td:nth-child(2) { text-align: right; white-space: nowrap; font-family: var(--fuente-mono); font-variant-numeric: tabular-nums; font-size: 1.1rem; font-weight: 700; color: var(--texto); padding-right: var(--esp-4); }
    td:nth-child(3) { font-size: var(--t-s); color: var(--texto-2); }
    tbody th { font-weight: 400; }
    .oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    /* ≥ 1100 px de la vista: dos columnas (cifras y gráfico | avisos y notas). Debajo, una columna. */
    @container (min-width: 1100px) { .cuerpo { grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); } }
    @media (max-width: 480px) { .fila { grid-template-columns: 5rem minmax(0, 1fr) 4.5rem; gap: var(--esp-2); } }
  `,
})
export class ComparacionComponent {
  readonly datos = input.required<Comparacion>();
  readonly nombrePais = input<string | undefined>(undefined);
  readonly aviso = AVISO_COBERTURA;
  readonly nota = NOTA_GRAFICO;
  readonly filas = computed(() => filasComparacion(this.datos()));
  readonly avisos = computed(() => advertencias(this.datos()));
  readonly ambito = computed(() => textoAmbito(this.datos(), this.nombrePais()));
  readonly cifras = computed(() => indicadores(this.datos()));
  readonly grafico = computed(() => graficoComparativo(this.datos()));
}
