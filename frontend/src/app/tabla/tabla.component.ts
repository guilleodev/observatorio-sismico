// Tabla consultable de terremotos (F5, paso 5.5): la alternativa al mapa y al color (ENUNCIADO §8.7). Muestra los MISMOS eventos que el mapa, con los datos del
// contrato en texto (la clase de profundidad se escribe, no depende del color). Operable con teclado: encabezados que ordenan, búsqueda, paginación y un botón
// por fila para seleccionar el evento (una sola selección, compartida con el mapa). Un dato nulo se muestra como «sin valor», nunca como 0.
// CAMBIO (rediseño 3 vistas, ronda 2): búsqueda y paginación son SOLO del lado cliente sobre los eventos cargados. Se añaden: etiqueta «Buscar en los N eventos cargados», botón «Limpiar»,
// tamaño de página (25/50/100), «Primera/Anterior/Siguiente/Última», localización del evento seleccionado en otra página y aviso si la búsqueda lo oculta (ya NO se borra la búsqueda sola).
// CAMBIO (ronda 4 Mission Control, vista Eventos): SOLO presentación. Barra de herramientas sin caja (búsqueda con icono, filas por página, densidad), tabla con jerarquía (columnas principales
// destacadas y secundarias atenuadas), puntos de refuerzo visual en Magnitud (escala de radioMagnitud) y Profundidad (colorProfundidad), fila seleccionada con barra de acento y «Ver en el globo/mapa»,
// y estados vacíos diseñados. Los datos, las columnas, el orden, la búsqueda y la paginación son los de siempre.
import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { colorProfundidad, diametroPuntoMagnitud, fechaUtc, textoOSinValor } from '../formato';
import { COLUMNAS, ORDEN_INICIAL, buscar, filaDe, ordenar, paginar, siguienteOrden } from '../tabla';
import { TAMANOS_PAGINA, TAMANO_PAGINA_INICIAL, botonesPagina, clasificarSeleccion, etiquetaBusqueda, paginaTrasCambioTamano, tamanoPaginaValido, textoResumenTabla } from '../tabla-filtro';
import { ALTURA_FILA, DENSIDADES, DENSIDAD_INICIAL, PREVIA, SELECTOR_CONTROLES, alturaContenedor, coordenadasValidas, esColumnaPrincipal, fechaLegible as fechaLegibleDe, partirFecha, textoDatosPrevia } from '../tabla-vista';
import { posicionarTooltip } from '../graficas-tooltip';
import { resolverPaleta } from '../globo/geometria';
import { hayWebgl } from '../globo/webgl';
import type { PreviaGlobo } from '../globo/previa';
import type { ClaveColumna, Orden } from '../tabla';
import type { Densidad } from '../tabla-vista';
import type { Evento, FilaTabla } from '../modelos';
import { DISTINTIVO_CASO } from '../modo';
import { IconoComponent } from '../icono/icono.component';

/** Datos de la vista previa abierta (un único popover para toda la tabla). */
type DatosPrevia = { id: string; lugar: string; datos: string; coords: boolean; teclado: boolean };

/** Columnas numéricas que se alinean a la derecha (cifras comparables en vertical). */
const A_LA_DERECHA: readonly ClaveColumna[] = ['mag', 'profundidad', 'lon', 'lat'];

@Component({
  selector: 'app-tabla',
  standalone: true,
  imports: [IconoComponent],
  host: { '(document:keydown.escape)': 'cerrarPrevia()', '(document:pointerdown)': 'alPulsarFuera($event)' },
  template: `
    <section class="tabla" [class.replay]="!!etiqueta()" aria-labelledby="tabla-titulo">
      <h2 id="tabla-titulo" class="etiqueta-ui">Tabla de terremotos@if (etiqueta()) { <span class="etiqueta-replay"> · {{ etiqueta() }}</span> }</h2>
      <div class="barra">
        <label class="buscar">{{ textoEtiquetaBusqueda() }}
          <input type="search" autocomplete="off" spellcheck="false" placeholder="lugar, país, ID, tipo…" [value]="busqueda()" (input)="buscarTexto($event)" />
          <app-icono nombre="buscar" class="ico-buscar" />
        </label>
        @if (busqueda()) { <button type="button" class="accion" (click)="limpiarBusqueda()">Limpiar</button> }
        <label class="tamano">Filas por página
          <select [value]="tamano()" (change)="cambiarTamano($event)">
            @for (t of tamanos; track t) { <option [value]="t" [selected]="t === tamano()">{{ t }}</option> }
          </select>
        </label>
        <div class="densidad" role="group" aria-label="Densidad de las filas">
          <span class="etiqueta-ui" aria-hidden="true">Densidad</span>
          <span class="segmentos">
            @for (d of densidades; track d.valor) {
              <button type="button" class="seg" [attr.aria-pressed]="densidad() === d.valor" (click)="densidad.set(d.valor)">{{ d.etiqueta }}</button>
            }
          </span>
        </div>
        <p class="resumen" role="status" aria-live="polite">{{ resumen() }}</p>
      </div>
      @if (seleccion().estado === 'oculta-por-busqueda') {
        <p class="nota" role="note"><app-icono nombre="aviso" /><span>El evento seleccionado no coincide con la búsqueda. <button type="button" class="accion" (click)="limpiarBusqueda()">Limpiar búsqueda</button></span></p>
      }
      <p class="pista">Desliza la tabla hacia los lados para ver todas las columnas.</p>
      <div class="desplazable" role="region" aria-label="Tabla de terremotos, desplazable horizontalmente" tabindex="0" [class.compacta]="densidad() === 'compacta'" [style.--alto-fila]="alturaFila() + 'px'" [style.--alto-max]="alturaMax() + 'px'">
        <table>
          <caption class="oculto">@if (etiqueta()) { {{ etiqueta() }}. } Terremotos del periodo con los filtros aplicados, ordenados por {{ etiquetaOrden() }}</caption>
          <thead>
            <tr>
              @for (c of columnas; track c.clave) {
                <th scope="col" class="etiqueta-ui" [class.sec]="!principal(c.clave)" [class.der]="derecha(c.clave)" [attr.aria-sort]="ariaSort(c.clave)">
                  <button type="button" class="orden" (click)="ordenarPor(c.clave)">{{ c.etiqueta }}<span aria-hidden="true"> {{ flecha(c.clave) }}</span></button>
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (f of pagina().filas; track f.id) {
              <tr [class.seleccionada]="f.id === seleccionado()" [attr.aria-current]="f.id === seleccionado() ? 'true' : null" (click)="pulsarFila($event, f.id)">
                <td class="fecha mono">@if (f.id === seleccionado()) { <span class="oculto">Seleccionado. </span> }@let ft = fechaLegible(f.tiempo); <time class="tiempo" [attr.datetime]="isoONulo(f.tiempo)"><span class="f-d">{{ ft.dia }}</span><span class="f-h">{{ ft.hora }}</span></time></td>
                <td class="num mag"><span class="celda-punto"><strong class="mono">{{ sinValor(f.mag, 2) }}</strong><span class="slot" aria-hidden="true">@if (diametro(f.mag); as d) { <span class="punto punto-mag" [style.width.px]="d" [style.height.px]="d"></span> }</span></span></td>
                <td class="sec">{{ f.magTipo ?? 'sin valor' }}</td>
                <td class="num prof"><span class="celda-punto"><strong class="mono">{{ sinValor(f.profundidad, 2) }}</strong><span class="slot" aria-hidden="true"><span class="punto punto-prof" [style.background-color]="color(f.profundidad)"></span></span></span></td>
                <td class="clase sec">{{ f.clase }}</td>
                <td class="lugar"><div class="celda-lugar">
                  <button type="button" class="fila" [attr.aria-pressed]="f.id === seleccionado()" [attr.title]="f.lugar" (click)="elegir(f.id)"
                    (pointerenter)="alEntrarLugar(f, $event)" (pointerleave)="alSalirLugar($event)" (focus)="alEnfocarLugar(f, $event)" (blur)="alPerderFocoLugar()" (keydown)="alTeclaLugar(f, $event)">{{ f.lugar }}</button>@if (f.caso) { <span class="caso"> {{ distintivo }}: {{ f.caso }}</span> }
                  <button type="button" class="previa-abrir" [attr.aria-label]="'Vista previa en el globo: ' + f.lugar" [attr.aria-expanded]="previa()?.id === f.id" (click)="alternarPreviaToque(f, $event)"><app-icono nombre="globo" /></button>
                  @if (f.id === seleccionado()) { <button type="button" class="accion ver-visor" (click)="verVisor.emit()"><app-icono nombre="globo" />{{ textoVisor() }}</button> }
                </div></td>
                <td class="pais sec">{{ f.pais }}</td>
                <td class="num sec mono">{{ sinValor(f.lon, 3) }}</td>
                <td class="num sec mono">{{ sinValor(f.lat, 3) }}</td>
                <td class="fecha sec mono">@let fa = fechaLegible(f.actualizado); <time class="tiempo" [attr.datetime]="isoONulo(f.actualizado)"><span class="f-d">{{ fa.dia }}</span><span class="f-h">{{ fa.hora }}</span></time></td>
                <td class="id sec mono">{{ f.id }}</td>
              </tr>
            } @empty {
              <tr><td [attr.colspan]="columnas.length" class="vacio">
                <div class="estado">
                  @if (filas().length === 0) {
                    <app-icono nombre="info" class="estado-ico" />
                    <p class="estado-titulo">Sin eventos cargados</p>
                    <p class="estado-texto">No hay eventos cargados para estos filtros y este periodo. Prueba con otro periodo o una magnitud mínima menor; también puede que aún no haya una lectura correcta de la API.</p>
                    <a href="#/panel" class="accion" (click)="$event.preventDefault(); cambiarFiltros.emit()">Cambiar filtros</a>
                  } @else {
                    <app-icono nombre="buscar" class="estado-ico" />
                    <p class="estado-titulo">Sin resultados</p>
                    <p class="estado-texto">Ningún evento cargado coincide con la búsqueda. Texto buscado: «{{ busqueda() }}». Prueba con otras palabras o con menos.</p>
                    <button type="button" class="accion" (click)="limpiarBusqueda()">Limpiar búsqueda</button>
                  }
                </div>
              </td></tr>
            }
          </tbody>
        </table>
      </div>
      <!-- Vista previa 3D: UN único popover y UN único lienzo para toda la tabla (el renderer se crea al pedir la primera vista previa). Posición fija en la ventana: no desplaza la tabla. -->
      <div #popoverPrevia class="previa" [class.abierta]="previa() !== null" role="group" aria-label="Vista previa del terremoto" [attr.aria-hidden]="previa() === null ? 'true' : null"
        [style.left.px]="posicionPrevia().x" [style.top.px]="posicionPrevia().y" (pointerenter)="mantenerPrevia()" (pointerleave)="cerrarPreviaTras()">
        <button #botonPrevia type="button" class="previa-cuerpo" tabindex="-1" (click)="irDesdePrevia()" (keydown.escape)="cerrarPrevia()">
          <span class="previa-mundo" [class.sin-mundo]="!previaConMundo()"><canvas #lienzoPrevia class="previa-lienzo" width="128" height="128" aria-hidden="true"></canvas></span>
          <span class="previa-datos">
            <strong class="previa-lugar">{{ previa()?.lugar }}</strong>
            <span class="previa-valores mono">{{ previa()?.datos }}</span>
            @if (previa(); as p) { @if (!p.coords) { <span class="previa-nota">Sin coordenadas válidas: no se dibuja en el globo.</span> } @else if (previaSinWebgl()) { <span class="previa-nota">Globo 3D no disponible en este navegador.</span> } }
            <span class="previa-pista">{{ previa()?.teclado ? 'Mayús + Intro: verlo en el Panel' : 'Pulsa para verlo en el Panel' }}</span>
          </span>
        </button>
      </div>
      <nav class="paginas" aria-label="Paginación de la tabla">
        <button type="button" (click)="irA(1, $event)" [disabled]="!botones().primera">Primera</button>
        <button type="button" (click)="irA(pagina().pagina - 1, $event)" [disabled]="!botones().anterior">Anterior</button>
        <span #etiquetaPagina class="pagina-actual" tabindex="-1">Página {{ pagina().pagina }} de {{ pagina().paginas }}</span>
        <button type="button" (click)="irA(pagina().pagina + 1, $event)" [disabled]="!botones().siguiente">Siguiente</button>
        <button type="button" (click)="irA(pagina().paginas, $event)" [disabled]="!botones().ultima">Última</button>
      </nav>
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .etiqueta-replay { color: var(--replay-texto); background: var(--replay-fondo); border: 1px solid var(--replay); border-radius: var(--radio-s); padding: 0 8px; font-size: .85rem; text-transform: none; letter-spacing: 0; }
    .caso { display: inline-block; margin-left: 6px; padding: 1px 6px; font-size: .75rem; font-weight: 700; background: var(--replay-fondo); color: var(--replay-texto); border: 1px solid var(--replay); border-radius: 3px; }
    /* CAMBIO (ronda 4): sin tarjeta; el bloque se separa por líneas finas (--linea). En REPRODUCCIÓN, marca violeta a la izquierda. */
    .tabla { margin: 0; min-width: 0; }
    .tabla.replay { border-left: 3px solid var(--replay); padding-left: var(--esp-3); }
    h2 { margin: 0 0 var(--esp-2); font-size: .75rem; }
    .barra { display: flex; flex-wrap: wrap; gap: var(--esp-3) var(--esp-4); align-items: end; padding: var(--esp-3) 0; border-top: 1px solid var(--linea); border-bottom: 1px solid var(--linea); }
    label { display: flex; flex-direction: column; gap: 4px; font-size: .85rem; font-weight: 600; color: var(--texto-2); min-width: min(280px, 100%); }
    label.buscar { position: relative; flex: 1 1 320px; }
    label.tamano { min-width: 0; }
    input, select { font: inherit; font-weight: 400; padding: 6px 8px; min-height: 40px; border: 1px solid var(--borde-control); border-radius: var(--radio-s); background-color: var(--fondo); color: var(--texto); min-width: 0; }
    input[type="search"] { padding-left: 34px; font-size: 1rem; }
    .ico-buscar { position: absolute; left: 10px; bottom: 11px; --ico: 1.1rem; color: var(--texto-2); pointer-events: none; }
    .densidad { display: flex; flex-direction: column; gap: 4px; }
    .segmentos { display: inline-flex; border: 1px solid var(--borde-control); border-radius: var(--radio-s); overflow: hidden; }
    .seg { min-height: 38px; min-width: 36px; padding: 0 14px; border: 0; background: var(--superficie-2); color: var(--texto); font-weight: 600; }
    .seg + .seg { border-left: 1px solid var(--borde-control); }
    .seg[aria-pressed="true"] { background: var(--acento-fondo); color: var(--acento-texto); box-shadow: inset 0 -3px 0 var(--acento); }
    .tabla.replay .seg[aria-pressed="true"] { background: var(--replay-fondo); color: var(--replay-texto); box-shadow: inset 0 -3px 0 var(--replay); }
    .resumen { margin: 0 0 0 auto; align-self: center; font-size: .85rem; color: var(--texto-2); font-variant-numeric: tabular-nums; font-family: var(--fuente-mono); }
    .nota { display: flex; align-items: flex-start; gap: var(--esp-2); margin: var(--esp-3) 0 0; padding: 8px 12px; background: var(--aviso-fondo); border-left: 3px solid var(--aviso); border-radius: 0 var(--radio-s) var(--radio-s) 0; color: var(--aviso-texto); font-size: .88rem; }
    .pista { display: none; margin: var(--esp-2) 0 0; font-size: .78rem; color: var(--texto-2); }
    /* El contenedor es el ÚNICO que desplaza (en ambos ejes): por eso la cabecera sticky de la tabla funciona de forma robusta dentro de él. Sin caja: solo línea inferior. */
    /* PULIDO FINAL: la altura máxima del contenedor es la cabecera + un número ENTERO de filas (--alto-max, desde alturaContenedor()), así que la última fila visible nunca queda cortada a medias. */
    .desplazable { --alto-fila: 44px; --alto-max: 640px; overflow: auto; max-height: var(--alto-max); overscroll-behavior: contain; border-bottom: 1px solid var(--linea); }
    .desplazable:focus-visible { outline: 3px solid var(--foco); outline-offset: -3px; }
    table { border-collapse: separate; border-spacing: 0; font-size: .88rem; width: 100%; }
    /* CAMBIO (ronda 4, anchos): relleno horizontal de 8 px, cabeceras que envuelven, fecha en dos líneas, Clase/País envuelven y Lugar acotada (18 rem) para que las 11 columnas quepan a ≥ 1400 px */
    th, td { box-sizing: border-box; border-bottom: 1px solid var(--linea); padding: 0 var(--esp-2); text-align: left; vertical-align: middle; white-space: nowrap; }
    td { height: calc(var(--alto-fila) - 1px); }
    thead th { white-space: normal; letter-spacing: .06em; font-size: .75rem; position: sticky; top: 0; z-index: 1; background: var(--superficie-1); border-bottom: 1px solid var(--borde); height: 44px; }
    thead th:not(.sec) { color: var(--texto); }
    th.der, td.num { text-align: right; }
    th.der .orden { text-align: right; }
    .oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    .num { font-variant-numeric: tabular-nums; }
    td.fecha { position: relative; }
    /* jerarquía: principales con el texto normal; secundarias atenuadas (--texto-2, contraste AA medido en pruebas) y más pequeñas */
    td.sec, th.sec .orden { color: var(--texto-2); font-size: .78rem; }
    th.sec .orden { font-weight: 600; }
    td.mono, td .mono { font-family: var(--fuente-mono); }
    td.fecha:not(.sec) { font-size: .8rem; }
    td.mag strong, td.prof strong { font-size: .95rem; }
    td.mag strong { font-weight: 800; }
    td.prof strong { font-weight: 600; }
    td.pais, td.clase { white-space: normal; }
    td.pais { min-width: 5.5rem; }
    .f-d, .f-h { display: block; }
    td.id { font-size: .75rem; }
    .celda-punto { display: inline-flex; align-items: center; justify-content: flex-end; gap: var(--esp-2); }
    .slot { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; }
    /* punto de refuerzo visual REDUNDANTE: el valor siempre está en texto; magnitud en cian neutro (no semántico), profundidad con el hex de colorProfundidad */
    .punto { display: inline-block; border-radius: 50%; box-sizing: border-box; border: 1px solid var(--punto-borde); }
    .punto-mag { background: var(--acento); }
    .punto-prof { width: 12px; height: 12px; }
    /* PULIDO FINAL: la celda del lugar NO envuelve (la fila seleccionada no crece): el nombre se recorta con elipsis y el botón «Ver en el globo» ocupa como mucho la altura de la fila. */
    .celda-lugar { display: flex; flex-wrap: nowrap; align-items: center; gap: 0 var(--esp-2); min-width: 0; max-width: 18rem; height: calc(var(--alto-fila) - 1px); }
    .celda-lugar .fila { flex: 1 1 auto; min-width: 0; max-width: 100%; }
    .ver-visor { flex: none; min-height: 0; height: calc(var(--alto-fila) - 6px); max-height: 36px; padding: 0 10px; }
    td.lugar { min-width: 12rem; }
    .tiempo { display: block; }
    .tiempo .f-h { color: var(--texto-2); font-size: .75rem; }
    /* la fila entera es seleccionable con el ratón: cursor y hover más claros (el botón del lugar sigue siendo el control accesible por teclado) */
    tbody tr { cursor: pointer; }
    .previa-abrir { display: none; flex: none; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 1px solid var(--borde-control); border-radius: 50%; background: var(--superficie-2); color: var(--acento-texto); }
    @media (hover: none) { .previa-abrir { display: inline-flex; } }
    /* Vista previa: popover fijo en la ventana (no mueve la tabla), un solo lienzo; aparece con un fundido corto solo si no hay movimiento reducido */
    .previa { position: fixed; z-index: 1150; width: 300px; max-width: calc(100vw - 16px); height: 156px; visibility: hidden; opacity: 0; pointer-events: none; background: var(--panel-vidrio); border: 1px solid var(--borde-control); border-top-color: var(--acento); border-radius: var(--radio-panel, 10px); box-shadow: var(--elev-3, 0 12px 32px rgba(0,0,0,.55)); overflow: hidden; }
    .previa.abierta { visibility: visible; opacity: 1; pointer-events: auto; }
    .tabla.replay .previa { border-top-color: var(--replay); }
    .previa-cuerpo { display: flex; align-items: center; gap: var(--esp-3); width: 100%; height: 100%; padding: 12px; background: none; border: 0; color: var(--texto); text-align: left; cursor: pointer; }
    .previa-cuerpo:hover .previa-pista, .previa-cuerpo:focus-visible .previa-pista { color: var(--acento-texto); text-decoration: underline; }
    .previa-mundo { flex: none; display: inline-flex; width: 128px; height: 128px; border-radius: 50%; }
    .previa-mundo.sin-mundo { display: none; }   /* CAMBIO (cierre F7): sin WebGL o sin coordenadas la vista previa es solo texto, sin hueco vacío de 128 px (el lienzo sigue en el DOM) */
    .previa-lienzo { width: 128px; height: 128px; display: block; }
    .previa-datos { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .previa-lugar { font-size: .92rem; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
    .previa-valores { font-size: .82rem; color: var(--acento-texto); }
    .previa-nota { font-size: .75rem; color: var(--texto-2); }
    .previa-pista { margin-top: 4px; font-size: .75rem; color: var(--texto-2); }
    @media (prefers-reduced-motion: no-preference) { .previa { transition: opacity .12s ease; } }
    .vacio { white-space: normal; height: auto; padding: var(--esp-5) 0; }
    .estado { position: sticky; left: 0; display: flex; flex-direction: column; align-items: flex-start; gap: var(--esp-2); inline-size: min(36rem, calc(100vw - 3rem)); padding: 0 var(--esp-3); color: var(--texto-2); }
    .estado-ico { --ico: 1.6rem; color: var(--acento-texto); }
    .estado-titulo { margin: 0; font-size: 1rem; font-weight: 700; color: var(--texto); }
    .estado-texto { margin: 0; font-size: .9rem; overflow-wrap: anywhere; }
    button { font: inherit; cursor: pointer; touch-action: manipulation; }
    /* objetivos táctiles de al menos 24×24 px (WCAG 2.2, criterio 2.5.8); los de paginación y de acción, de 36 px; el botón del lugar ocupa TODA la altura de la fila (44 px cómoda, 30 px compacta) */
    .orden { background: none; border: 0; font: inherit; font-weight: 700; letter-spacing: inherit; text-transform: inherit; padding: 3px 4px; min-height: 24px; min-width: 24px; text-align: left; color: inherit; }
    .fila { display: block; max-width: 18rem; min-height: calc(var(--alto-fila) - 1px); padding: 0; background: none; border: 0; text-align: left; font-weight: 600; color: var(--texto); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    @media (hover: hover) {
      tbody tr:hover td { background: var(--superficie-2); }
      tbody tr:hover td:first-child { box-shadow: inset 2px 0 0 var(--borde-control); }
      tbody tr.seleccionada:hover td:first-child { box-shadow: inset 3px 0 0 var(--acento); }
      .tabla.replay tbody tr.seleccionada:hover td:first-child { box-shadow: inset 3px 0 0 var(--replay); }
      tbody tr:hover .fila { color: var(--acento-texto); }
      .fila:hover { text-decoration: underline; }
    }
    /* fila seleccionada: barra de acento de 3 px a la izquierda + fondo tintado + texto reforzado + marcador textual «Seleccionado» (oculto) y aria-current; nunca solo color */
    tbody tr.seleccionada td { background: var(--acento-fondo); color: var(--texto); }
    tbody tr.seleccionada td:first-child { box-shadow: inset 3px 0 0 var(--acento); }
    tbody tr.seleccionada .fila { font-weight: 800; color: var(--acento-texto); }
    .tabla.replay tbody tr.seleccionada td { background: var(--replay-fondo); }
    .tabla.replay tbody tr.seleccionada td:first-child { box-shadow: inset 3px 0 0 var(--replay); }
    .tabla.replay tbody tr.seleccionada .fila { color: var(--replay-texto); }
    /* densidad compacta: la altura de fila (--alto-fila: 30 px) la fija el estilo en línea desde ALTURA_FILA; aquí solo la letra */
    .compacta table { font-size: .82rem; }
    .compacta td { line-height: 1.15; }
    .compacta .tiempo { line-height: 1.1; }   /* las dos líneas de la fecha caben en los 30 px de la fila compacta */
    .compacta td.sec { font-size: .75rem; }
    .paginas { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin-top: var(--esp-3); font-size: .9rem; }
    .paginas button, .accion { padding: 4px 14px; min-height: 36px; min-width: 36px; border: 1px solid var(--borde-control); border-radius: var(--radio-s); background: var(--superficie-2); color: var(--acento-texto); }
    .accion { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; text-decoration: none; white-space: nowrap; }
    .accion:hover { border-color: var(--acento); }
    .paginas button:disabled { opacity: .45; cursor: not-allowed; }
    .pagina-actual { font-family: var(--fuente-mono); font-variant-numeric: tabular-nums; padding: 0 4px; }
    button:focus-visible, .accion:focus-visible, .pagina-actual:focus-visible { outline: 3px solid var(--foco); outline-offset: 2px; }
    /* móvil: la tabla real con scroll horizontal DENTRO de su contenedor (sin scroll de página); las fechas se parten para que Magnitud y Lugar queden más cerca */
    @media (max-width: 767px) {
      .pista { display: block; }
      td.lugar { min-width: 13rem; }
      .resumen { margin-left: 0; flex-basis: 100%; }
    }
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
  /** Ronda 4: texto de la acción de la fila seleccionada («Ver en el globo» / «Ver en el mapa», según el visor) y sus salidas; la lógica sigue en AppComponent (verEnVisor, cambiarFiltros). */
  readonly textoVisor = input<string>('Ver en el mapa');
  readonly verVisor = output<void>();
  readonly cambiarFiltros = output<void>();

  readonly columnas = COLUMNAS;
  readonly tamanos = TAMANOS_PAGINA;
  readonly densidades = DENSIDADES;
  readonly orden = signal<Orden>(ORDEN_INICIAL);
  readonly busqueda = signal('');           // solo memoria (señal): nada de almacenamiento del navegador
  readonly densidad = signal<Densidad>(DENSIDAD_INICIAL);   // ídem: en memoria, «Cómoda» por defecto
  readonly alturaFila = computed(() => ALTURA_FILA[this.densidad()]);
  /** Altura del contenedor = cabecera + filas ENTERAS (la última fila visible nunca queda cortada). */
  readonly alturaMax = computed(() => alturaContenedor(this.densidad()));
  readonly paginaActual = signal(1);
  readonly tamano = signal(TAMANO_PAGINA_INICIAL);

  private readonly injector = inject(Injector);
  private readonly anfitrion = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly etiquetaPagina = viewChild<ElementRef<HTMLElement>>('etiquetaPagina');
  private readonly popoverPrevia = viewChild<ElementRef<HTMLElement>>('popoverPrevia');
  private readonly lienzoPrevia = viewChild<ElementRef<HTMLCanvasElement>>('lienzoPrevia');

  // ---- Vista previa 3D (pulido final): UN solo popover, UN solo lienzo y UNA sola instancia de Three.js para toda la tabla, creada al pedir la primera vista previa ----
  readonly previa = signal<DatosPrevia | null>(null);
  readonly posicionPrevia = signal({ x: 0, y: 0 });
  readonly previaSinWebgl = signal(false);
  readonly previaConMundo = computed(() => { const p = this.previa(); return !!p && p.coords && !this.previaSinWebgl(); });
  private motor: PreviaGlobo | null = null;
  private promesaMotor: Promise<PreviaGlobo | null> | null = null;
  private temporizadorAbrir?: ReturnType<typeof setTimeout>;
  private temporizadorCerrar?: ReturnType<typeof setTimeout>;
  private destruido = false;

  readonly filas = computed<FilaTabla[]>(() => this.eventos().map((e, i) => filaDe(e, i)));
  private readonly visibles = computed(() => ordenar(buscar(this.filas(), this.busqueda()), this.orden()));
  readonly pagina = computed(() => paginar(this.visibles(), this.paginaActual(), this.tamano()));
  readonly botones = computed(() => botonesPagina(this.pagina().pagina, this.pagina().paginas));
  /** Dónde está el evento seleccionado respecto a la búsqueda y el orden actuales (visible / oculto por la búsqueda / no cargado). */
  readonly seleccion = computed(() => clasificarSeleccion(this.filas(), this.visibles(), this.seleccionado(), this.tamano()));
  readonly textoEtiquetaBusqueda = computed(() => etiquetaBusqueda(this.filas().length));
  readonly resumen = computed(() => { const p = this.pagina(); return textoResumenTabla(this.filas().length, p.total, p.desde, p.hasta); });
  readonly etiquetaOrden = computed(() => `${COLUMNAS.find((c) => c.clave === this.orden().clave)?.etiqueta ?? ''} (${this.orden().direccion === 'asc' ? 'ascendente' : 'descendente'})`);

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.destruido = true; clearTimeout(this.temporizadorAbrir); clearTimeout(this.temporizadorCerrar); this.motor?.destruir(); this.motor = null; });
    // Una selección que viene de FUERA (mapa, globo, anterior/siguiente) debe poder LOCALIZARSE: si está en el resultado actual, la tabla salta a su página.
    // Si la búsqueda la oculta NO se borra la búsqueda (decisión de la persona): se muestra la nota con «Limpiar búsqueda».
    effect(() => {
      const id = this.seleccionado();
      if (id === null) return;
      untracked(() => { const s = this.seleccion(); if (s.estado === 'visible' && s.pagina !== null) this.paginaActual.set(s.pagina); });
    });
    // Si cambian los datos (otro filtro), la página vuelve al rango válido.
    effect(() => {
      this.eventos();
      untracked(() => this.paginaActual.update((p) => paginar(this.visibles(), p, this.tamano()).pagina));
    });
  }

  fecha(ms: number | null): string { return fechaUtc(ms); }
  /** PULIDO FINAL: fecha UTC legible en dos líneas («11 nov 2026» / «10:25:31.800 UTC»); el <time datetime> conserva el ISO completo. */
  fechaLegible(ms: number | null): { dia: string; hora: string } { return fechaLegibleDe(this.fecha(ms)); }
  isoONulo(ms: number | null): string | null { const s = this.fecha(ms); return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s : null; }
  /** CAMBIO (ronda 4, ajuste de anchos): la fecha ISO en dos líneas (día / hora) para que las 11 columnas quepan a ≥ 1400 px; el texto íntegro no cambia. */
  fechaPartes(ms: number | null): [string, string] { return partirFecha(this.fecha(ms)); }
  sinValor(v: number | null, decimales: number): string { return textoOSinValor(v, '', decimales); }
  /** Diámetro (px) del punto de magnitud (escala de radioMagnitud del mapa) o null si no hay magnitud (no se dibuja). */
  diametro(mag: number | null): number | null { return diametroPuntoMagnitud(mag); }
  /** Color del punto de profundidad: los mismos hex que la leyenda del mapa (gris si no hay dato). */
  color(profundidad: number | null): string { return colorProfundidad(profundidad); }
  principal(clave: ClaveColumna): boolean { return esColumnaPrincipal(clave); }
  derecha(clave: ClaveColumna): boolean { return A_LA_DERECHA.includes(clave); }
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

  /** «Limpiar» / «Limpiar búsqueda»: vacía el texto; si había un evento seleccionado, la tabla vuelve a su página. */
  limpiarBusqueda(): void {
    this.busqueda.set('');
    const s = this.seleccion();
    this.paginaActual.set(s.estado === 'visible' && s.pagina !== null ? s.pagina : 1);
  }

  cambiarTamano(evento: Event): void {
    const nuevo = tamanoPaginaValido((evento.target as HTMLSelectElement).value);
    this.paginaActual.set(paginaTrasCambioTamano(this.paginaActual(), this.tamano(), nuevo));
    this.tamano.set(nuevo);
  }

  /**
   * Cambia de página SIN mover el scroll de la página. El foco se queda en el botón pulsado; si ese botón acaba deshabilitado (extremo de la serie), un botón deshabilitado
   * pierde el foco, así que pasa al texto «Página X de Y» (nunca se cae al <body>).
   */
  irA(pagina: number, evento?: Event): void {
    this.paginaActual.set(paginar(this.visibles(), pagina, this.tamano()).pagina);
    const boton = evento?.currentTarget as HTMLButtonElement | null | undefined;
    if (boton) afterNextRender(() => { if (boton.disabled) this.etiquetaPagina()?.nativeElement.focus({ preventScroll: true }); }, { injector: this.injector });
  }

  /** «Ir al evento seleccionado» (lo llama la franja de la vista Eventos): quita la búsqueda si lo oculta, salta a su página y lleva el foco a su fila. */
  irAlSeleccionado(): void {
    if (this.seleccion().estado === 'oculta-por-busqueda') this.busqueda.set('');
    const s = this.seleccion();
    if (s.pagina !== null) this.paginaActual.set(s.pagina);
    afterNextRender(() => {
      const boton = this.anfitrion.nativeElement.querySelector<HTMLElement>('tr.seleccionada .fila');
      boton?.focus({ preventScroll: true });
      boton?.scrollIntoView({ block: 'nearest' });
    }, { injector: this.injector });
  }

  elegir(id: string): void { this.seleccionar.emit(id); }

  /**
   * Clic en CUALQUIER parte de la fila: selecciona igual que el botón del lugar. Si el clic nació en un control interior (botón, enlace…) NO hace nada: ese control ya lo gestiona y así no hay
   * acciones duplicadas. Tampoco si la persona está seleccionando texto con el ratón. Por teclado se sigue usando el botón del lugar (Intro o Espacio).
   */
  pulsarFila(evento: MouseEvent, id: string): void {
    const destino = evento.target as HTMLElement | null;
    if (destino?.closest(SELECTOR_CONTROLES)) return;
    if (window.getSelection()?.toString()) return;
    this.elegir(id);
  }

  // ---------- vista previa ----------
  alEntrarLugar(f: FilaTabla, e: PointerEvent): void { if (e.pointerType === 'mouse') this.programarPrevia(f, e.currentTarget as HTMLElement, false, PREVIA.retardoAbrirMs); }
  alSalirLugar(e: PointerEvent): void { if (e.pointerType === 'mouse') this.cerrarPreviaTras(); }
  /** Foco por teclado (no por clic): muestra la vista previa al instante. */
  alEnfocarLugar(f: FilaTabla, e: FocusEvent): void { const el = e.currentTarget as HTMLElement; if (el.matches(':focus-visible')) this.programarPrevia(f, el, true, 0); }
  /** Al perder el foco se cierra, salvo que el puntero esté sobre el popover (se está a punto de pulsarlo). */
  alPerderFocoLugar(): void { if (!this.popoverPrevia()?.nativeElement.matches(':hover')) this.cerrarPreviaTras(); }
  /** Mayús + Intro sobre el lugar: selecciona y va al Panel (lo mismo que pulsar la vista previa). Escape la cierra. */
  alTeclaLugar(f: FilaTabla, e: KeyboardEvent): void {
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); this.irAlPanelCon(f.id); this.cerrarPrevia(); }
  }
  /** Táctil: no hay hover; el botón con el icono del globo abre o cierra la vista previa. No interfiere con el scroll (solo reacciona al clic). */
  alternarPreviaToque(f: FilaTabla, e: Event): void {
    e.stopPropagation();
    if (this.previa()?.id === f.id) { this.cerrarPrevia(); return; }
    this.abrirPrevia(f, e.currentTarget as HTMLElement, false);
  }
  alPulsarFuera(e: Event): void {
    if (this.previa() === null) return;
    const objetivo = e.target as HTMLElement | null;
    if (this.popoverPrevia()?.nativeElement.contains(objetivo) || objetivo?.closest?.('.previa-abrir, .fila')) return;
    this.cerrarPrevia();
  }
  mantenerPrevia(): void { clearTimeout(this.temporizadorCerrar); }
  cerrarPreviaTras(): void {
    clearTimeout(this.temporizadorAbrir); clearTimeout(this.temporizadorCerrar);
    this.temporizadorCerrar = setTimeout(() => this.cerrarPrevia(), PREVIA.retardoCerrarMs);
  }
  cerrarPrevia(): void { clearTimeout(this.temporizadorAbrir); clearTimeout(this.temporizadorCerrar); if (this.previa() !== null) this.previa.set(null); }
  /** Clic en la vista previa: selecciona ese terremoto (si no lo estaba) y va al Panel, igual que «Ver en el globo». */
  irDesdePrevia(): void { const p = this.previa(); if (!p) return; this.irAlPanelCon(p.id); this.cerrarPrevia(); }
  private irAlPanelCon(id: string): void {
    if (id !== this.seleccionado()) this.seleccionar.emit(id);   // elegir() desde la tabla alterna: no se vuelve a emitir si ya era el seleccionado
    this.verVisor.emit();
  }
  private programarPrevia(f: FilaTabla, ancla: HTMLElement, teclado: boolean, retardo: number): void {
    clearTimeout(this.temporizadorCerrar);
    if (this.previa()?.id === f.id) return;
    clearTimeout(this.temporizadorAbrir);
    if (retardo <= 0) this.abrirPrevia(f, ancla, teclado);
    else this.temporizadorAbrir = setTimeout(() => this.abrirPrevia(f, ancla, teclado), retardo);
  }
  private abrirPrevia(f: FilaTabla, ancla: HTMLElement, teclado: boolean): void {
    if (this.destruido) return;
    const coords = coordenadasValidas(f.lat, f.lon);
    this.previa.set({ id: f.id, lugar: f.lugar, datos: textoDatosPrevia(f.mag, f.profundidad), coords, teclado });
    // posición fija en la ventana, junto al lugar, acotada para no salirse de la pantalla ni quedar bajo la cabecera sticky (la función es la misma de los tooltips de las gráficas)
    const r = ancla.getBoundingClientRect();
    const cab = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--alto-cabecera')) || 56;
    const ancho = Math.min(PREVIA.ancho, window.innerWidth - 16);
    const pos = posicionarTooltip({ x: r.left, y: r.top - cab, ancho: r.width, alto: r.height }, { ancho, alto: PREVIA.alto }, { ancho: window.innerWidth, alto: window.innerHeight - cab }, PREVIA.separacion, 'arriba');
    const deseado = { x: pos.x, y: pos.y + cab };
    this.posicionPrevia.set(deseado);
    afterNextRender(() => {
      // si algún ancestro hace de bloque contenedor del position: fixed (contain/transform), se corrige la diferencia medida
      const caja = this.popoverPrevia()?.nativeElement.getBoundingClientRect();
      if (caja && (Math.abs(caja.left - deseado.x) > 1 || Math.abs(caja.top - deseado.y) > 1)) this.posicionPrevia.set({ x: deseado.x + (deseado.x - caja.left), y: deseado.y + (deseado.y - caja.top) });
    }, { injector: this.injector });
    if (coords) void this.dibujarPrevia(f);
  }
  private async dibujarPrevia(f: FilaTabla): Promise<void> {
    const motor = await this.obtenerMotor();
    if (!motor || this.destruido || this.previa()?.id !== f.id || f.lat === null || f.lon === null) return;
    motor.mostrar(f.lat, f.lon, colorProfundidad(f.profundidad));
  }
  /** Crea UNA sola vez el motor 3D (import dinámico de Three.js + GeoJSON de países). Sin WebGL o si falla, la vista previa se queda en texto. */
  private obtenerMotor(): Promise<PreviaGlobo | null> {
    if (this.promesaMotor) return this.promesaMotor;
    this.promesaMotor = (async () => {
      const lienzo = this.lienzoPrevia()?.nativeElement;
      if (!lienzo || !hayWebgl()) { this.previaSinWebgl.set(true); return null; }
      try {
        const [modulo, geojson] = await Promise.all([import('../globo/previa'), fetch('datos/paises.geojson').then((r) => r.json()).catch(() => null)]);
        if (this.destruido) return null;
        const paleta = resolverPaleta((t) => getComputedStyle(document.documentElement).getPropertyValue(t));
        const motor = new modulo.PreviaGlobo(lienzo, paleta);
        if (geojson) motor.fijarTierra(geojson, paleta);
        this.motor = motor;
        return motor;
      } catch { this.previaSinWebgl.set(true); return null; }
    })();
    return this.promesaMotor;
  }
}
