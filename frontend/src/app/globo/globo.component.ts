// Globo 3D (F7): vista ALTERNATIVA al mapa Leaflet, en el mismo panel. El componente solo orquesta: detecta WebGL, carga `escena.ts` (todo el código three) con
// import() dinámico la primera vez que se muestra, le pasa los eventos y la selección y pinta la tarjeta de detalle, los controles y los avisos en HTML.
// No tiene estado propio de filtros, modo ni selección: recibe los de AppComponent (la selección se comparte con el mapa y la tabla).
//
// Maquetación (rediseño del dashboard): el globo llena el visor central (altura compartida con el mapa 2D: variable CSS --alto-visor). El detalle del evento seleccionado YA NO vive aquí:
// es el panel «Evento seleccionado» de la columna derecha (app-detalle-evento), común a las dos vistas. Con el panel fuera del canvas no hay nada que tape la esfera, así que el
// desplazamiento de centro es siempre 0 (`reservaDerecha: () => 0`; la lógica pura desplazamientoCentroPx sigue en geometria.ts, probada y sin uso en la UI).
import { Component, ElementRef, NgZone, OnDestroy, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { colorProfundidad, radioMagnitud } from '../formato';
import { idDe } from '../tabla';
import { idsPorMagnitud, prepararPuntos, resolverPaleta, vecinoEnLista } from './geometria';
import type { Codificacion, PaletaGlobo, ResultadoPuntos } from './geometria';
import { REGIONES } from './camara';
import { textoTooltip } from './tooltip';
import { MENSAJE_FALLO_CARGA, MENSAJE_SIN_WEBGL, hayWebgl } from './webgl';
import { LIMITE_CARGA_MS, MENSAJE_TIEMPO_AGOTADO } from './fallback';
import { MaquinaCarga, TEXTO_FASE, esFaseTerminal, estaCargando, indicadorVisible, proximoCambioIndicador } from './carga';
import type { FaseCarga } from './carga';
import { RANGOS_LEYENDA, contarRangos, idsDeRango, indiceDeRango, textoRecuento } from './leyenda';
import type { ConteosRangos, RangoProfundidad } from './leyenda';
import type { EscenaGlobo } from './escena'; // solo el TIPO: no arrastra three al paquete principal (el módulo real se carga con import() más abajo)
import type { EjecucionReplay, Evento } from '../modelos';

/** La misma codificación visual que el mapa 2D: tamaño por magnitud, color por profundidad e identificador de la tabla. */
const CODIFICACION: Codificacion = { radio: radioMagnitud, color: colorProfundidad, id: idDe };
const MENSAJE_FALLO_INICIO = 'No se pudo iniciar el globo 3D (WebGL desactivado o sin memoria gráfica): usa el mapa 2D o la tabla.';
const VACIO: ResultadoPuntos = prepararPuntos([], CODIFICACION);

type EstadoGlobo = 'inactivo' | 'cargando' | 'listo' | 'contexto' | 'error';

@Component({
  selector: 'app-globo',
  standalone: true,
  host: { '[hidden]': '!visible()' },
  template: `
    <div class="escenario">
      <div class="lienzo-caja">
        <!-- aria-busy mientras se descarga el motor 3D, se inicia WebGL o se prepara el planeta (carga.ts) -->
        <div class="stage" [attr.aria-busy]="ocupado() ? 'true' : null">
          <!-- Contenedor enfocable con la pista visible (debajo, en .pistas); el canvas es solo la imagen: role="img" con descripción. -->
          <div class="vista" #caja tabindex="0" role="group" aria-label="Globo terráqueo 3D interactivo" aria-describedby="globo-pista" (keydown)="alTecla($event)">
            <canvas #lienzo role="img" [attr.aria-label]="descripcion()" [hidden]="estado() === 'error'"></canvas>
            <!-- Etiqueta al pasar el ratón sobre un terremoto: solo ayuda visual con ratón (aria-hidden: el equivalente accesible es la tarjeta de detalle, la tabla y «Evento anterior/siguiente»). La escena le pone el texto con textContent. -->
            <div #etiqueta class="etiqueta" aria-hidden="true" hidden></div>
          </div>
          <!-- Indicador de carga: texto de la fase REAL (sin porcentajes inventados), visible sin depender del color y con pointer-events: none. Región de estado persistente (role="status" =
               anuncio cortés implícito): el cambio de fase se anuncia una vez. No aparece si la carga dura menos de ≈ 180 ms y, si aparece, permanece ≥ 300 ms (carga.ts). -->
          <div class="carga" role="status" [hidden]="!indicadorMostrado() || estado() === 'error'"><span class="carga-spinner" aria-hidden="true"></span><span class="carga-texto">{{ textoCarga() }}</span></div>
          @if (estado() === 'contexto') { <p class="mensaje" role="status">Se perdió el contexto gráfico; el globo se restablecerá cuando el navegador lo recupere.</p> }
          @if (estado() === 'error') {
            <div class="mensaje error" role="alert">
              <p>{{ mensaje() }}</p>
              <div class="acciones"><button type="button" (click)="volverAlMapa()">Volver al mapa 2D</button></div>
            </div>
          }
          @if (estado() === 'listo') {
            <div class="pistas">
              <p id="globo-pista" class="pista"><span class="fino">Arrastra para girar · Ctrl + rueda para acercar</span><span class="tactil">Arrastra para girar · pellizca para acercar</span></p>
              @if (seleccionado() === null) { <p class="pista"><span class="fino">Pulsa un terremoto para ver su detalle</span><span class="tactil">Toca un terremoto</span></p> }
            </div>
            <div class="controles" role="group" aria-label="Controles del globo">
              <button type="button" aria-label="Acercar el globo" (click)="zoom(1)">+</button>
              <button type="button" aria-label="Alejar el globo" (click)="zoom(-1)">−</button>
              <button type="button" class="texto" aria-label="Restablecer la vista del globo" (click)="restablecer()">Restablecer</button>
              <button type="button" class="texto" [attr.aria-label]="rotando() ? 'Pausar rotación' : 'Reanudar rotación'" (click)="alternarRotacion()">{{ rotando() ? 'Pausar rotación' : 'Reanudar rotación' }}</button>
              <!-- Atajo geográfico: un único <select> compacto (también en móvil). Tras elegir vuelve a «Región» para poder repetir; el texto visible está contenido en el nombre accesible. -->
              <select class="region" aria-label="Ir a región" (change)="irARegion($event)">
                <option value="" selected>Región</option>
                @for (r of regiones; track r.id) { <option [value]="r.id">{{ r.nombre }}</option> }
              </select>
            </div>
          }
        </div>
      </div>
      <div class="pie">
        <div class="fila">
          <p class="recuento" role="status">{{ recuento() }}@if (resultado().omitidos > 0) { · {{ omitidosTexto() }} }</p>
          <div class="navegacion" role="group" aria-label="Recorrer los terremotos por magnitud">
            <button type="button" (click)="vecino(-1)" [disabled]="sinNavegables()">Evento anterior</button>
            <button type="button" (click)="vecino(1)" [disabled]="sinNavegables()">Evento siguiente</button>
          </div>
        </div>
        @if (resultado().recortados > 0) { <p class="aviso" role="status">{{ recortadosTexto() }}</p> }
        @if (fronterasFallidas()) { <p class="aviso" role="status">No se pudieron cargar las fronteras de países; los terremotos se dibujan igualmente.</p> }
        <details class="ayuda">
          <summary>Ayuda del globo</summary>
          <ul>
            <li>Ratón o pantalla táctil: arrastra para girar; Ctrl + rueda o pellizco para acercar.</li>
            <li>Teclado, con el globo enfocado: flechas para girar, + y − (o AvPág y RePág) para el zoom, Inicio para restablecer la vista.</li>
            <li>«Evento anterior» y «Evento siguiente» recorren los terremotos de mayor a menor magnitud.</li>
            <li>También puedes consultar y seleccionar cada terremoto en la tabla.</li>
            <li>La Tierra gira sola muy despacio hacia el este (una vuelta cada 2 min 30 s). Se detiene al interactuar y mientras haya un terremoto seleccionado, y se reanuda tras 3 s sin tocar nada. «Pausar rotación» la detiene hasta que pulses «Reanudar rotación»; con movimiento reducido no arranca sola.</li>
            <li>Al seleccionar un terremoto, la cámara se centra en él y se acerca con suavidad por el camino más corto. Para cerrar el detalle usa «Cerrar», pulsa en una zona vacía del globo (sin arrastrar) o «Restablecer»: la cámara vuelve con suavidad al zoom predeterminado, enderezada y mirando la misma región, y la Tierra reanuda su giro. Con movimiento reducido el cambio es directo.</li>
            <li>«Región» lleva la cámara a una zona del mundo (Pacífico, Japón, Indonesia, Mediterráneo, Andes, Norteamérica); son encuadres aproximados y no cambian los filtros, los datos ni la selección.</li>
            <li>Con ratón, al pasar sobre un terremoto aparece su lugar y su magnitud. Los de magnitud 5 o más laten de forma muy sutil; con movimiento reducido no laten.</li>
            <li>Sombra día/noche según la hora UTC actual; no indica la hora de los eventos (tampoco en REPRODUCCIÓN). Es solo ambiental: los terremotos no se oscurecen de noche.</li>
            <li>Anillo breve al llegar un evento nuevo; es solo una señal visual (no es una onda sísmica real). No aparece con el primer lote de datos, al cambiar de modo o de filtros, ni con movimiento reducido.</li>
            <li>Las estrellas del fondo son decorativas y no se pueden seleccionar.</li>
            <li>Con la vista 3D, la leyenda de profundidad (panel de la derecha) resalta un solo rango y atenúa el resto; los atenuados no se seleccionan con el puntero y «Evento anterior» y «Evento siguiente» recorren solo los visibles. No cambia los filtros, la tabla ni el mapa 2D. Pulsa de nuevo el rango o «Mostrar todos» para quitarlo.</li>
          </ul>
        </details>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; position: relative; min-width: 0; background: var(--fondo); }
    :host([hidden]) { display: none; }
    .escenario { display: grid; grid-template-columns: minmax(0, 1fr); }
    .lienzo-caja { position: relative; min-width: 0; background: var(--fondo); }
    .stage { position: relative; }
    /* CAMBIO (rediseño dashboard): la altura es la del visor, compartida con el mapa 2D (variable --alto-visor, la define app.component.css; el respaldo solo se usa si el globo se monta fuera de la página) */
    .vista { position: relative; height: var(--alto-visor, 560px); }
    .vista:focus-visible { outline: 3px solid var(--foco); outline-offset: -3px; }
    canvas { display: block; width: 100%; height: 100%; }
    canvas[hidden] { display: none; }
    /* móvil: margen lateral SIN touch-action: none, para poder seguir desplazando la página con el dedo fuera del canvas (la altura ya viene de --alto-visor: 65svh, mínimo 380 px) */
    @media (max-width: 700px) { .vista { margin-inline: var(--esp-3); } }
    .mensaje { position: absolute; top: 56px; left: calc(var(--hud-izq, 0px) + var(--esp-3)); right: calc(var(--hud-der, 0px) + var(--esp-3)); margin: 0; padding: var(--esp-2) var(--esp-3); background: var(--info-fondo); color: var(--info-texto); border: 1px solid var(--info); border-radius: var(--radio-s); font-size: var(--t-m); }
    .mensaje.error { background: var(--error-fondo); color: var(--error-texto); border-color: var(--error); }
    .mensaje p { margin: 0; }
    /* indicador de carga: centrado sobre el escenario, no captura el puntero; el giro del spinner vive en styles.css (con movimiento reducido queda estático) */
    .carga { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; align-items: center; gap: var(--esp-2); max-width: calc(100% - 2 * var(--esp-3)); padding: var(--esp-2) var(--esp-4); background: var(--superficie-2); color: var(--texto); border: 1px solid var(--borde-control); border-radius: var(--radio); font-size: var(--t-m); pointer-events: none; }
    .carga[hidden] { display: none; }
    /* pistas: una línea corta arriba a la izquierda; el texto depende del puntero (ratón fino: Ctrl + rueda; táctil: pellizco; nada de teclado ni Ctrl en móvil) */
    /* CAMBIO (ronda 2 Mission Control): las pistas bajan a la fila «B» (56 px, bajo el selector de vista flotante) y, con el escenario inmersivo, se apartan del HUD izquierdo (--hud-izq la define app.component.css; sin ella, 0).
       Con REPRODUCCIÓN (clase es-replay del escenario, ≥ 701 px) la etiqueta ocupa la fila B y las pistas bajan a la «C» (100 px). */
    .pistas { position: absolute; top: 56px; left: calc(var(--hud-izq, 0px) + var(--esp-3)); max-width: calc(100% - var(--hud-izq, 0px) - var(--hud-der, 0px) - 2 * var(--esp-3)); display: grid; gap: 4px; justify-items: start; pointer-events: none; }
    @media (min-width: 701px) { :host-context(.es-replay) .pistas { top: 100px; } }
    .pista { margin: 0; padding: 2px 10px; background: rgba(10, 17, 32, .82); color: var(--texto-2); border: 1px solid var(--borde); border-radius: 999px; font-size: var(--t-s); }
    .pista .fino { display: none; }
    @media (hover: hover) and (pointer: fine) { .pista .fino { display: inline; } .pista .tactil { display: none; } }
    /* grupo único de controles: píldora compacta abajo al centro */
    .controles { position: absolute; left: var(--esp-3); right: var(--esp-3); bottom: var(--esp-3); margin-inline: auto; width: fit-content; display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; padding: 4px; max-width: calc(100% - 2 * var(--esp-3)); background: var(--superficie-2); border: 1px solid var(--borde-control); border-radius: var(--radio-s); box-shadow: var(--sombra-s); }
    button { min-width: 36px; min-height: 36px; padding: 0 10px; font: 600 var(--t-m) var(--fuente); background: var(--superficie-1); color: var(--texto); border: 1px solid var(--borde-control); border-radius: var(--radio-s); cursor: pointer; touch-action: manipulation; }
    button.texto { font-size: var(--t-s); }
    button:hover:not(:disabled) { border-color: var(--acento); color: var(--acento-texto); }
    button:disabled { opacity: .5; cursor: not-allowed; }
    button:focus-visible { outline: 3px solid var(--foco); outline-offset: 1px; }
    /* selector de región: misma altura que los botones; color y fondo explícitos (tema oscuro) y ancho contenido para no añadir filas en móvil */
    select.region { min-height: 36px; max-width: 7.5rem; padding: 0 6px; font: 600 var(--t-s) var(--fuente); background-color: var(--superficie-1); color: var(--texto); border: 1px solid var(--borde-control); border-radius: var(--radio-s); cursor: pointer; touch-action: manipulation; }
    select.region:hover { border-color: var(--acento); }
    select.region:focus-visible { outline: 3px solid var(--foco); outline-offset: 1px; }
    @media (max-width: 700px) { .controles button.texto { padding: 0 8px; } }
    /* etiqueta del hover: no captura eventos (el clic, el arrastre y el táctil llegan al canvas), se mueve solo con transform y cabe en el escenario */
    .etiqueta { position: absolute; left: 0; top: 0; max-width: min(320px, 90%); padding: 3px 8px; background: rgba(10, 17, 32, .94); color: var(--texto); border: 1px solid var(--borde-control); border-radius: var(--radio-s); font-size: var(--t-s); line-height: 1.3; overflow-wrap: anywhere; pointer-events: none; }
    .etiqueta[hidden] { display: none; }
    /* CAMBIO (rediseño dashboard): la tarjeta de detalle y su ficha (antes aquí) pasaron al panel app-detalle-evento de la columna derecha. */
    .pie { min-width: 0; display: grid; gap: var(--esp-2); padding: var(--esp-3) var(--esp-4); background: var(--superficie-1); border-top: 1px solid var(--borde); }
    .fila { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--esp-2) var(--esp-4); }
    .recuento { margin: 0; min-width: 0; font-size: var(--t-m); font-variant-numeric: tabular-nums; }
    .aviso { margin: 0; padding: var(--esp-2) var(--esp-3); background: var(--aviso-fondo); color: var(--aviso-texto); border: 1px solid var(--aviso); border-radius: var(--radio-s); font-size: var(--t-m); }
    .navegacion { display: flex; flex-wrap: wrap; align-items: center; gap: var(--esp-2); }
    .navegacion button { font-size: var(--t-s); }
    .ayuda { font-size: var(--t-s); color: var(--texto-2); }
    .ayuda summary { cursor: pointer; min-height: 24px; padding: 4px 0; color: var(--texto); font-weight: 600; }
    .ayuda ul { margin: var(--esp-2) 0 0; padding-left: 1.2rem; display: grid; gap: var(--esp-1); }
    .acciones { display: flex; flex-wrap: wrap; gap: var(--esp-2); margin-top: var(--esp-3); }
    /* CAMBIO (ronda 2 Mission Control): con el ESCENARIO inmersivo (≥ 1100 px, el globo vive dentro de .escenario de la página) el globo llena el 100 % del visor; el pie (recuento, anterior/siguiente, ayuda) pasa a una barra
       fina abajo (≈ 48 px) y el texto de «Ayuda del globo» se abre como panel flotante SOBRE ella (no encoge el lienzo). El pie queda por encima de los HUD (z-index), que terminan 68 px antes del borde inferior. */
    @media (min-width: 1100px) {
      :host-context(.escenario) { height: 100%; }
      :host-context(.escenario) .escenario { height: 100%; grid-template-rows: minmax(0, 1fr) auto; }
      :host-context(.escenario) .lienzo-caja, :host-context(.escenario) .stage, :host-context(.escenario) .vista { height: 100%; min-height: 0; }
      :host-context(.escenario) .pie { position: relative; z-index: 1105; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--esp-1) var(--esp-4); padding: 4px 12px; background: var(--panel-vidrio); border-top: 1px solid var(--linea); }
      :host-context(.escenario) .fila { flex: 1 1 auto; flex-wrap: nowrap; }
      :host-context(.escenario) .ayuda { position: static; }
      :host-context(.escenario) .ayuda[open] ul { position: absolute; left: 12px; bottom: calc(100% + 8px); width: min(560px, calc(100% - 24px)); max-height: 55vh; margin: 0; padding: var(--esp-3) var(--esp-3) var(--esp-3) 2rem; overflow: auto; overscroll-behavior: contain; background: var(--panel-vidrio); border: 1px solid var(--borde-control); border-radius: var(--radio-panel); box-shadow: var(--elev-3); }
    }
  `,
})
export class GloboComponent implements OnDestroy {
  readonly eventos = input<Evento[]>([]);
  /** Identificador del ÚNICO evento seleccionado (compartido con el mapa 2D y la tabla). */
  readonly seleccionado = input<string | null>(null);
  /** Se oculta (hidden) cuando la vista activa es el mapa 2D: la escena queda en pausa total. */
  readonly visible = input(false);
  /** Modo REPRODUCCIÓN: la tarjeta lleva su bloque violeta y la descripción accesible lo dice. */
  readonly replay = input(false);
  readonly ejecucion = input<EjecucionReplay | null>(null);
  readonly etiqueta = input<string | null>(null);
  /** Resumen de los filtros de la lectura (para la descripción accesible). */
  readonly filtros = input('');
  /** Rango de la leyenda de profundidad activo (estado en memoria de AppComponent); null = todos. Solo atenúa marcadores en el globo. */
  readonly rangoLeyenda = input<RangoProfundidad | null>(null);
  /** Conteos por rango de los eventos dibujados (para los botones de la leyenda). */
  readonly conteosRangos = output<ConteosRangos>();
  readonly seleccionar = output<string>();
  readonly cerrar = output<void>();
  /** WebGL no existe o el globo no pudo iniciarse: el selector de vista desactiva «Globo 3D» y explica el motivo. */
  readonly noDisponible = output<string>();

  private readonly zona = inject(NgZone);
  private readonly lienzo = viewChild.required<ElementRef<HTMLCanvasElement>>('lienzo');
  private readonly caja = viewChild.required<ElementRef<HTMLElement>>('caja');
  private readonly elTooltip = viewChild.required<ElementRef<HTMLElement>>('etiqueta');   // el input `etiqueta` es el texto de REPRODUCCIÓN: esta referencia es otra cosa
  /** Regiones del selector «Ir a región» (camara.ts: coordenadas aproximadas, solo de visualización). */
  readonly regiones = REGIONES;
  readonly estado = signal<EstadoGlobo>('inactivo');
  readonly mensaje = signal('');
  readonly fronterasFallidas = signal(false);
  /** ¿La rotación automática está encendida? Solo en memoria (sin almacenamiento): refleja el estado de la máquina de rotacion.ts para el texto del botón. */
  readonly rotando = signal(false);
  private readonly activado = signal(false);
  private escena: EscenaGlobo | null = null;
  private destruido = false;
  // Temporizador de seguridad (fallback.ts): si la escena no está creada en LIMITE_CARGA_MS se abandona el globo y se ignora cualquier resultado tardío (`abandonado`).
  private idLimite = 0;
  private abandonado = false;
  private readonly aborto = new AbortController();
  // carga (carga.ts): fases reales, indicador con retardo y permanencia mínima (un único temporizador)
  private readonly carga = new MaquinaCarga();
  readonly fase = signal<FaseCarga>('idle');
  readonly indicadorMostrado = signal(false);
  readonly textoCarga = computed(() => TEXTO_FASE[this.fase()] ?? '');
  readonly ocupado = computed(() => estaCargando(this.fase()));
  private inicioCargaMs: number | null = null; private finCargaMs: number | null = null; private idTemporizadorCarga = 0;
  /** Clave de la lectura (modo, etiqueta de ejecución, filtros): si cambia, los anillos de eventos nuevos reinician su base de ids. */
  private readonly claveLectura = computed(() => `${this.replay()}|${this.etiqueta() ?? ''}|${this.filtros()}`);
  private readonly nf = new Intl.NumberFormat('es-ES');

  /** Eventos con coordenadas válidas (mismo criterio que el mapa 2D). Solo se calcula tras mostrar el globo por primera vez. */
  readonly resultado = computed(() => (this.activado() ? prepararPuntos(this.eventos(), CODIFICACION) : VACIO));
  /** Conteos por rango, una sola vez por cambio de datos. */
  readonly conteos = computed(() => { const p = this.resultado().puntos; return contarRangos(p.colores, p.n); });
  /** Con un rango activo, anterior/siguiente recorren solo los visibles (el seleccionado de otro rango no está en la lista: se empieza por el primero/último). */
  private readonly porMagnitud = computed(() => { // perezoso: solo se evalúa al recorrer con los botones
    const p = this.resultado().puntos; const todos = idsPorMagnitud(p); const r = this.rangoLeyenda();
    if (r === null) return todos;
    const ok = idsDeRango(p, indiceDeRango(r));
    return todos.filter((id) => ok.has(id));
  });
  readonly sinNavegables = computed(() => { const r = this.rangoLeyenda(); return this.resultado().dibujados === 0 || (r !== null && this.conteos()[r] === 0); });
  /** Evento por id (misma clave que la tabla) para la etiqueta del hover. Perezoso: se construye al primer hover con ratón y se invalida al cambiar los eventos. */
  private readonly porId = computed(() => { const m = new Map<string, Evento>(); for (const [i, e] of this.eventos().entries()) m.set(idDe(e, i), e); return m; });
  readonly recuento = computed(() => {
    const d = this.resultado().dibujados; const r = this.rangoLeyenda();
    if (r !== null) return textoRecuento(d, this.conteos()[r], r, (n) => this.nf.format(n)); // «N eventos cargados · M visibles (rango: …)»
    return `${this.nf.format(d)} ${d === 1 ? 'evento dibujado' : 'eventos dibujados'}`;
  });
  readonly omitidosTexto = computed(() => `${this.nf.format(this.resultado().omitidos)} sin coordenadas válidas (solo aparecen en la tabla)`);
  readonly recortadosTexto = computed(() => {
    const r = this.resultado();
    return `Aviso: el globo tiene un tope técnico de ${this.nf.format(r.tope)} eventos. Se dibujan ${this.nf.format(r.dibujados)} y faltan ${this.nf.format(r.recortados)}: NO es el total del periodo (la tabla los conserva).`;
  });
  readonly descripcion = computed(() => {
    const r = this.resultado();
    const partes = [`Globo terráqueo 3D con ${this.nf.format(r.dibujados)} terremotos dibujados`];
    if (this.replay()) partes.push(this.etiqueta() ?? 'REPRODUCCIÓN: datos históricos reproducidos, no actividad actual');
    if (this.filtros()) partes.push(`Filtros: ${this.filtros()}`);
    const rango = this.rangoLeyenda();
    if (rango !== null) partes.push(`Leyenda: solo se resaltan los eventos de ${RANGOS_LEYENDA[indiceDeRango(rango)].anuncio}`);
    partes.push('La alternativa accesible es la tabla de terremotos');
    return partes.join('. ') + '.';
  });

  // CAMBIO (rediseño dashboard): los calculados del detalle y del anuncio desaparecen: la ficha y el anuncio de la selección los da app-detalle-evento (una única región viva para ambas vistas).

  constructor() {
    effect(() => { const v = this.visible(); untracked(() => this.alCambiarVisible(v)); });
    // Cambio de modo/ejecución/filtros: reinicia la base de ids de los anillos y el color (violeta en REPRODUCCIÓN). Va ANTES del efecto de datos.
    effect(() => { this.claveLectura(); const rep = this.replay(); untracked(() => this.fuera(() => { this.escena?.reiniciarBaseOndas(); this.escena?.fijarReplay(rep); })); });
    effect(() => { const r = this.rangoLeyenda(); untracked(() => this.fuera(() => this.escena?.fijarRangoLeyenda(r === null ? null : indiceDeRango(r)))); });
    effect(() => { const c = this.conteos(); untracked(() => this.conteosRangos.emit(c)); });
    // Datos y selección solo ACTUALIZAN buffers de la escena existente (fijarEventos / fijarSeleccion): no se recrea nada, ni se toca la orientación ni la rotación.
    effect(() => { const r = this.resultado(); untracked(() => this.fuera(() => this.escena?.fijarEventos(r.puntos))); });
    effect(() => { const id = this.seleccionado(); untracked(() => this.fuera(() => this.escena?.fijarSeleccion(id))); });
  }

  /** La escena trabaja FUERA de la zona de Angular: sus fotogramas y eventos de puntero no disparan detección de cambios. */
  private fuera(f: () => void): void { this.zona.runOutsideAngular(f); }

  private alCambiarVisible(visible: boolean): void {
    if (visible) {
      this.activado.set(true);
      if (this.escena) this.fuera(() => this.escena?.reanudar());
      else if (this.estado() === 'inactivo') void this.iniciar();
    } else if (this.escena) this.fuera(() => this.escena?.pausar());
  }

  private armarLimite(): void {
    this.cancelarLimite();
    this.idLimite = window.setTimeout(() => this.alAgotarseLimite(), LIMITE_CARGA_MS);
  }

  private cancelarLimite(): void {
    if (this.idLimite !== 0) clearTimeout(this.idLimite);
    this.idLimite = 0;
  }

  /** Pasó el plazo sin escena: se marca como abandonado (el import() o el inicio tardíos no crean nada) y se avisa por la misma salida `noDisponible` que cualquier fallo. */
  private alAgotarseLimite(): void {
    this.idLimite = 0;
    if (this.destruido || this.abandonado || this.estado() !== 'cargando') return;
    this.abandonado = true;
    this.fallar(MENSAJE_TIEMPO_AGOTADO);
  }

  private fallar(mensaje: string): void {
    this.cancelarLimite();
    this.avanzarFase('error');
    this.estado.set('error'); this.mensaje.set(mensaje);
    this.noDisponible.emit(mensaje);
  }

  /** Botón «Volver al mapa 2D» del error: el mismo camino que el fallo (`noDisponible` → el selector pasa al 2D y desactiva «Globo 3D»), sin recargar la página. */
  volverAlMapa(): void { this.noDisponible.emit(this.mensaje()); }

  /** Avanza la máquina de fases (solo transiciones válidas) y reevalúa el indicador. Se puede llamar desde la escena (fuera de la zona). */
  private avanzarFase(f: FaseCarga): void {
    if (!this.carga.avanzar(f)) return;
    const ahora = performance.now();
    if (f === 'descargando') this.inicioCargaMs = ahora;
    if (esFaseTerminal(f)) this.finCargaMs = ahora;
    this.zona.run(() => { this.fase.set(f); this.reevaluarIndicador(); });
  }

  private reevaluarIndicador(): void {
    if (this.idTemporizadorCarga !== 0) { clearTimeout(this.idTemporizadorCarga); this.idTemporizadorCarga = 0; }
    const ahora = performance.now();
    this.indicadorMostrado.set(indicadorVisible(ahora, this.inicioCargaMs, this.finCargaMs));
    const espera = proximoCambioIndicador(ahora, this.inicioCargaMs, this.finCargaMs);
    if (espera !== null && !this.destruido) this.idTemporizadorCarga = window.setTimeout(() => { this.idTemporizadorCarga = 0; this.reevaluarIndicador(); }, espera + 1);
  }

  /** Cede un fotograma al navegador para que pinte el texto de la fase antes del trabajo síncrono de WebGL (con red de seguridad de 150 ms por si la pestaña no pinta). */
  private esperarPintado(): Promise<void> {
    return new Promise((resolver) => {
      const seguridad = window.setTimeout(resolver, 150);
      requestAnimationFrame(() => window.setTimeout(() => { clearTimeout(seguridad); resolver(); }, 0));
    });
  }

  private async iniciar(): Promise<void> {
    this.estado.set('cargando');
    this.avanzarFase('descargando');
    this.armarLimite();
    await Promise.resolve(); // sale de la detección de cambios en curso: emitir `noDisponible` al padre dentro de ella provocaría NG0100
    if (this.destruido || this.abandonado) return;
    if (!hayWebgl()) { this.fallar(MENSAJE_SIN_WEBGL); return; }   // sin WebGL ni se descarga three
    let fase: 'carga' | 'inicio' = 'carga';
    let escena: EscenaGlobo | null = null;
    try {
      const modulo = await import('./escena');                    // chunk aparte: three solo se descarga aquí
      if (this.destruido || this.abandonado) return;               // llegó tarde: no se crea nada (sin escena no hay bucle de fotogramas)
      fase = 'inicio';
      this.avanzarFase('inicializando');
      if (this.indicadorMostrado()) await this.esperarPintado();   // solo si hay indicador visible que pintar
      if (this.destruido || this.abandonado) return;
      const paleta = resolverPaleta((t) => getComputedStyle(document.documentElement).getPropertyValue(t));
      escena = new modulo.EscenaGlobo();
      const nueva = escena;
      this.fuera(() => nueva.iniciar(this.lienzo().nativeElement, this.caja().nativeElement, {
        paleta,
        alSeleccionar: (id) => this.zona.run(() => this.seleccionar.emit(id)),
        alDeseleccionar: () => this.zona.run(() => this.cerrar.emit()),   // clic en vacío con selección: la misma salida que el botón «Cerrar» → elegir(null, 'mapa')
        alPerderContexto: () => this.zona.run(() => this.estado.set('contexto')),
        alRestaurarContexto: () => this.zona.run(() => this.estado.set('listo')),
        reservaDerecha: () => 0,   // CAMBIO (rediseño dashboard): el detalle ya no flota sobre el canvas: no hay panel que esquivar
        alCambiarRotacion: (activa) => this.zona.run(() => this.rotando.set(activa)),
        tooltip: this.elTooltip().nativeElement,
        textoTooltip: (id) => { const e = this.porId().get(id); return e ? textoTooltip(e.properties?.place, e.properties?.mag) : null; },
        alFase: (f) => this.avanzarFase(f),
      }));
      this.escena = nueva;
      this.rotando.set(nueva.rotacionActiva());                  // con movimiento reducido arranca apagada
      const r = this.rangoLeyenda();
      this.fuera(() => { nueva.fijarReplay(this.replay()); nueva.fijarRangoLeyenda(r === null ? null : indiceDeRango(r)); nueva.fijarEventos(this.resultado().puntos); nueva.fijarSeleccion(this.seleccionado()); });
      this.avanzarFase('textura');                               // lo que sigue es pedir los datos de países y dibujar la textura
      this.estado.set('listo');
      this.cancelarLimite();                                     // escena creada: el temporizador de seguridad ya no hace falta
      if (!this.visible()) this.fuera(() => nueva.pausar());
      void this.cargarFronteras(nueva, paleta);
    } catch {
      escena?.destruir();
      this.escena = null;
      if (this.abandonado) return;                               // el temporizador ya avisó del fallo: no se emite otro
      this.fallar(fase === 'carga' ? MENSAJE_FALLO_CARGA : MENSAJE_FALLO_INICIO);
    }
  }

  /** Fronteras y textura del planeta: un fetch relativo propio (el mapa 2D no conserva el catálogo). Si falla, el globo queda como esfera lisa, funciona igual y lo dice. */
  private async cargarFronteras(escena: EscenaGlobo, paleta: PaletaGlobo): Promise<void> {
    try {
      const respuesta = await fetch('datos/paises.geojson', { signal: AbortSignal.any([this.aborto.signal, AbortSignal.timeout(15000)]) });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const datos: unknown = await respuesta.json();
      if (!this.destruido) this.fuera(() => escena.fijarFronteras(datos, paleta));
    } catch { if (!this.destruido) this.fronterasFallidas.set(true); }   // no bloquea: esfera lisa y aviso
    finally { if (!this.destruido) this.avanzarFase('listo'); }
  }

  zoom(sentido: 1 | -1): void { this.fuera(() => this.escena?.zoom(sentido)); }

  /**
   * «Restablecer» (y la tecla Inicio): UNA sola recuperación de la vista (escena.recuperarVista: zoom predeterminado, región conservada, eje vertical enderezado, rotación reanudada al
   * completarse). Si hay un terremoto seleccionado, también cierra la ficha por la salida existente (`cerrar` → elegir(null, 'mapa')). Orden: primero se inicia la recuperación y después se
   * emite `cerrar`; el fijarSeleccion(null) que llega luego no la repite (recuperarVista pone idCentrado a null).
   */
  restablecer(): void {
    this.fuera(() => this.escena?.recuperarVista());
    if (this.seleccionado() !== null) this.cerrar.emit();
  }

  // CAMBIO (rediseño dashboard): el cierre de la ficha desaparece de este componente. «Cerrar» está ahora en el panel externo y solo pone seleccionado = null; la recuperación de la vista la hace UNA vez
  // escena.fijarSeleccion(null) (efecto de abajo) porque idCentrado !== null; Restablecer y el clic en vacío siguen llamando a recuperarVista, que pone idCentrado a null y evita la repetición.

  /** «Ir a región»: la escena hace la transición suave. Después el <select> vuelve a «Región» (así se puede elegir otra vez la misma). No anuncia nada: el cambio es visual. */
  irARegion(ev: Event): void {
    const selector = ev.target as HTMLSelectElement;
    const id = selector.value;
    selector.value = '';
    if (id !== '') this.fuera(() => this.escena?.irARegion(id));
  }

  /** Botón «Pausar / Reanudar rotación»: la escena devuelve el nuevo estado y el texto del botón lo refleja (el texto basta: no hay región viva que hable cada vez). */
  alternarRotacion(): void {
    let activa = false;
    this.fuera(() => { activa = this.escena?.alternarRotacion() ?? false; });
    this.rotando.set(activa);
  }

  /** Teclado con el contenedor enfocado: flechas giran, + / − (o AvPág / RePág) acercan y alejan, Inicio restablece (igual que el botón). */
  alTecla(ev: KeyboardEvent): void {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    switch (ev.key) {
      case 'ArrowLeft': this.fuera(() => this.escena?.girar(-1, 0)); break;
      case 'ArrowRight': this.fuera(() => this.escena?.girar(1, 0)); break;
      case 'ArrowUp': this.fuera(() => this.escena?.girar(0, -1)); break;
      case 'ArrowDown': this.fuera(() => this.escena?.girar(0, 1)); break;
      case '+': case '=': case 'PageUp': this.zoom(1); break;
      case '-': case '_': case 'PageDown': this.zoom(-1); break;
      case 'Home': this.restablecer(); break;
      default: return;
    }
    ev.preventDefault();
  }

  /** Anterior / siguiente evento sobre la lista ordenada por magnitud: alternativa al puntero. Emite la misma salida que un clic. */
  vecino(delta: 1 | -1): void {
    const id = vecinoEnLista(this.porMagnitud(), this.seleccionado(), delta);
    if (id !== null) this.seleccionar.emit(id);
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.cancelarLimite();
    this.aborto.abort();
    if (this.idTemporizadorCarga !== 0) clearTimeout(this.idTemporizadorCarga);
    this.idTemporizadorCarga = 0;
    this.escena?.destruir();
    this.escena = null;
  }
}
