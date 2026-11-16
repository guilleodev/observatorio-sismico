import { Component, ElementRef, Injector, OnDestroy, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { LeafletDirective } from '@bluehalo/ngx-leaflet';
import * as L from 'leaflet';
import type { FeatureCollection } from 'geojson';
import { ApiService, ErrorApi, UltimaPeticion } from './api.service';
import { BarrasComponent } from './graficas/barras.component';
import { ComparacionComponent } from './comparacion/comparacion.component';
import { EstadoComponent } from './estado/estado.component';
import { FiltrosComponent } from './filtros/filtros.component';
import { TablaComponent } from './tabla/tabla.component';
import { GloboComponent } from './globo/globo.component';
import { DetalleEventoComponent } from './detalle-evento/detalle-evento.component';
import { RANGOS_LEYENDA, alternarRango, nombreBotonRango, textoAnuncioRango } from './globo/leyenda';
import type { ConteosRangos, DefRango, RangoProfundidad } from './globo/leyenda';
import { hudPorDefecto } from './hud';
import { ID_ENCABEZADO, SincronizadorHash, anuncioVista, tituloDocumento, vistaDesdeHash } from './navegacion';
import type { Vista } from './navegacion';
import { REINTENTO_INVALIDAR_MS, textoAvisoFallback } from './globo/fallback';
import { SelectorModoComponent } from './selector-modo/selector-modo.component';
import { AccesoComponent } from './acceso/acceso.component';
import { IndicadorRefrescoComponent } from './indicador-refresco/indicador-refresco.component';
import { IconoComponent } from './icono/icono.component';
import { EstadoDatosComponent } from './estado-datos/estado-datos.component';
import { FiltrosActivosComponent } from './filtros-activos/filtros-activos.component';
import { incidencias } from './estado-datos/estado-datos';
import { notaHayMasEnPeriodo, textoCargadosDelPeriodo } from './tabla-filtro';
import { partirContador } from './tabla-vista';
import { estadoRefresco, restanteMs, textoIngestaCompacto, textoSiguienteIntento, textoUltimoRefresco } from './refresco';
import type { EntradaRefresco } from './refresco';
import { itemsHora as itemsDeHora, itemsIntervalos, itemsPais } from './graficas';
import { colorIntervaloProfundidad } from './graficas-color';
import { idDe } from './tabla';
import { avisos, edadLecturaMs, retardoSiguiente } from './estado';
import { avisoPausaOculta, debeRefrescarAlVolver, pausada, textoIntervalo } from './actualizacion';
import type { EntradaEstado, ErrorPanel } from './estado';
import { estadoInicial, paisesDelCatalogo, parametros, resolverVentana, resumen } from './filtros';
import { BORDE_FRONTERA, ESTILO_MAPA_INICIAL, SELECCION_MAPA, bordeMapa, colorProfundidad, estiloCirculo, fechaUtc, filasFicha, numeroFinito, radioMagnitud } from './formato';
import type { EstiloMapa } from './formato';
import { AVISO_COMPARACION_NO_APLICA, MODO_INICIAL, conEtiqueta, etiquetaReplay, fichaReplay, lecturaVacia, parametrosModo, resumenReplay, ventanaReplay } from './modo';
import type { Comparacion, Config, EjecucionReplay, Estadisticas, Evento, FiltrosEstado, ModoVista, PaisCatalogo, Propiedades, Salud, Ventana } from './modelos';

// Frontend proporcionado + F5 (paso 5.4): el mapa, las capas y la lectura robusta son los entregados; se añaden un servicio de API (`api.service.ts`),
// un único estado de filtros (`filtros.ts`) y el componente de filtros. En modo `demo` no se llama a la API. Las funciones de formato se extrajeron
// de este archivo sin cambiar su comportamiento (`formato.ts`). Mapa, tabla y gráficas (5.5) leerán el mismo estado de filtros.
type DatosDemo = FeatureCollection & { metadata?: { generated?: number } };

@Component({
  selector: 'app-root', standalone: true, imports: [LeafletDirective, SelectorModoComponent, AccesoComponent, IndicadorRefrescoComponent, IconoComponent, EstadoDatosComponent, FiltrosActivosComponent, EstadoComponent, FiltrosComponent, BarrasComponent, ComparacionComponent, TablaComponent, GloboComponent, DetalleEventoComponent],
  templateUrl: './app.component.html', styleUrl: './app.component.css'
})
export class AppComponent implements OnDestroy {
  readonly mode = signal('Cargando configuración');
  readonly status = signal('Preparando el mapa…');
  readonly lastRead = signal('Sin lectura');
  readonly generated = signal('Sin información');
  readonly count = signal(0);
  readonly omitted = signal(0);
  readonly countriesStatus = signal('Cargando catálogo');
  // F5 (5.4): filtros, periodo consultado y estado de carga
  readonly esApi = signal(false);
  readonly paises = signal<PaisCatalogo[]>([]);
  readonly filtros = signal<FiltrosEstado>(estadoInicial());
  readonly resumenFiltros = signal('');
  readonly periodo = signal('Sin consulta');
  readonly total = signal<number | null>(null);
  readonly cargando = signal(false);
  // F5 (5.6): estado del sistema. La antigüedad de lo que se ve se mide con un reloj MONOTÓNICO (performance.now), no con la hora del navegador.
  readonly salud = signal<Salud | null>(null);
  readonly errorPanel = signal<ErrorPanel | null>(null);
  readonly ultimoAcceso = signal<string | null>(null);
  readonly recuperadoEn = signal<string | null>(null);
  readonly siguienteOffset = signal<number | null>(null);
  readonly cargandoResto = signal(false);
  private readonly lecturaPerf = signal<number | null>(null);
  private readonly ahoraPerf = signal(performance.now());
  // F7: instante (monotónico) previsto del siguiente intento automático; null si no hay ninguno programado (durante la carga, en pausa, sin clave).
  private readonly proximoPerf = signal<number | null>(null);
  // F7: «fallo de refresco» (red/tiempo/servidor/formato en refresh()) y «filtros rechazados» (validación) se separan de `errorPanel`, que también recoge fallos de «cargar el resto».
  private readonly falloRefresco = signal(false);
  private readonly filtrosRechazados = signal(false);
  readonly marcaRefresco = computed(() => this.lecturaPerf()); // cambia solo con una lectura correcta: dispara el destello del indicador
  readonly entradaRefresco = computed<EntradaRefresco>(() => ({
    cargando: this.cargando(), hayError: this.falloRefresco(), filtrosRechazados: this.filtrosRechazados(), hayLectura: this.lecturaPerf() !== null, enPausa: this.enPausa(), pideClave: this.pideClave(),
  }));
  readonly estadoRef = computed(() => estadoRefresco(this.entradaRefresco()));
  readonly ultimoRef = computed(() => textoUltimoRefresco(edadLecturaMs(this.ahoraPerf(), this.lecturaPerf())));
  readonly siguienteRef = computed(() => textoSiguienteIntento(this.entradaRefresco(), restanteMs(this.ahoraPerf(), this.proximoPerf())));
  readonly ingestaRef = computed(() => textoIngestaCompacto(this.salud()));
  readonly entradaEstado = computed<EntradaEstado>(() => ({
    error: this.errorPanel(), salud: this.salud(), hayLectura: this.lecturaPerf() !== null, edadLecturaMs: edadLecturaMs(this.ahoraPerf(), this.lecturaPerf()),
    cargados: this.eventos().length, total: this.estadisticas() ? this.estadisticas()!.total : null, siguiente: this.siguienteOffset(), recuperadoEn: this.recuperadoEn(),
    modo: this.modoVista(), sinEjecuciones: this.sinEjecuciones(),
  }));
  /**
   * CAMBIO (rediseño 3 vistas, ronda 2): incidencias importantes (acceso, conexión/fallo de refresco, filtros rechazados, datos desactualizados, huecos de ingesta). Salen de la MISMA función pura `avisos()` que
   * usa «Metodología y estado del sistema» (una sola fuente de verdad) filtrada por `incidencias()`. La banda del marco común es visible en las tres vistas y NO es una región viva: los mismos mensajes ya los anuncian
   * el indicador de refresco de la cabecera y el estado del Panel; así no hay doble anuncio.
   */
  readonly incidenciasPanel = computed(() => (this.esApi() ? incidencias(avisos(this.entradaEstado())) : []));
  /** Contador de la vista Eventos: «N eventos cargados de M del periodo» (M = total de la API) y la nota si hay más en el periodo. */
  readonly textoCargados = computed(() => textoCargadosDelPeriodo(this.eventos().length, this.total()));
  /** Ronda 4: el mismo texto partido en cifra (grande, mono) y resto, solo para la presentación del encabezado de Eventos. */
  readonly cargadosPartes = computed(() => partirContador(this.textoCargados()));
  readonly notaHayMas = computed(() => notaHayMasEnPeriodo(this.eventos().length, this.total()));
  readonly ventana = signal<Ventana | null>(null);
  // F6 (6.2): modo de vista. En reproducción TODO (mapa, tabla, ficha, gráficas, estado) lleva la etiqueta y la lectura anterior se descarta al cambiar de modo.
  readonly modoVista = signal<ModoVista>(MODO_INICIAL);
  readonly ejecucion = signal<EjecucionReplay | null>(null);
  readonly sinEjecuciones = signal(false);
  readonly anuncioModo = signal('');
  readonly esReplay = computed(() => this.modoVista() === 'replay');
  readonly etiquetaVista = computed(() => (this.esReplay() ? (this.pideClave() ? 'REPRODUCCIÓN · acceso restringido (falta la clave)' : etiquetaReplay(this.ejecucion())) : null)); // sin clave no se sabe si hay ejecuciones: no se dice «sin ejecuciones»
  /** Texto del distintivo de la cabecera: modo de datos con palabras (no solo color). Antes de leer la configuración muestra el estado de carga. */
  readonly distintivoModo = computed(() => (!this.esApi() ? this.mode() : this.esReplay() ? 'REPRODUCCIÓN · histórico acelerado' : 'En vivo · USGS'));
  /** Texto CORTO del distintivo para la cabecera sticky («En vivo» / «REPRODUCCIÓN»); el largo (`distintivoModo`) lo leen los lectores de pantalla. */
  readonly distintivoCorto = computed(() => (!this.esApi() ? this.mode() : this.esReplay() ? 'REPRODUCCIÓN' : 'En vivo'));
  /** Cabecera «condensada» (más sombra, sin subtítulo) cuando el centinela del inicio del documento sale de la vista. Estado de interfaz en memoria. */
  readonly condensada = signal(false);
  private readonly centinela = viewChild<ElementRef<HTMLElement>>('centinela');
  private observadorCabecera?: IntersectionObserver;
  readonly avisoNoAplica = AVISO_COMPARACION_NO_APLICA;
  readonly comparacionVivo = computed<Comparacion | null>(() => { const c = this.estadisticas()?.comparacion; return c && 'reciente' in c ? c : null; });
  readonly rotular = (titulo: string): string => conEtiqueta(titulo, this.esReplay());
  // F5 (5.5): UNA sola respuesta del periodo resuelto alimenta mapa, tabla, gráficas y comparación; y UN solo evento seleccionado compartido por mapa y tabla
  readonly eventos = signal<Evento[]>([]);
  readonly estadisticas = signal<Estadisticas | null>(null);
  readonly seleccionado = signal<string | null>(null);
  readonly avisoSeleccion = signal('');
  /** Evento seleccionado (objeto) para el panel «Evento seleccionado»: se deriva de `seleccionado()` y `eventos()` con el mismo idDe que usan tabla, mapa y globo. null si no hay selección o ya no está cargado. */
  readonly eventoSeleccionado = computed<Evento | null>(() => {
    const id = this.seleccionado();
    if (id === null) return null;
    for (const [i, e] of this.eventos().entries()) if (idDe(e, i) === id) return e;
    return null;
  });
  // CAMBIO (ronda 2 Mission Control): los filtros son plegables en móvil (barra-resumen) y en escritorio ≥ 1100 px (HUD flotante: píldora); en tablet el CSS los muestra siempre. Estado de UI en memoria (nada de almacenamiento).
  // Valor inicial según el ancho de la ventana (hud.ts, pura): abiertos desde 1440 px; colapsados por debajo (y en móvil, plegados como antes). Solo se evalúa al crear la página.
  private readonly hudInicial = hudPorDefecto(window.innerWidth);
  readonly filtrosAbiertos = signal(this.hudInicial.filtros);
  readonly filtrosInvalidos = signal(false);   // lo emite app-filtros: con errores de validación el panel se abre y los errores nunca quedan ocultos
  readonly filtrosVisibles = computed(() => this.filtrosAbiertos() || this.filtrosInvalidos());
  alternarFiltros(): void { this.filtrosAbiertos.update((a) => !a); }
  /** HUD derecho (modo · evento · leyenda): abierto/colapsado, solo en memoria. Colapsado deja la cabecera y el modo de datos; el detalle y la leyenda se ocultan por CSS (no se destruyen). */
  readonly hudDerAbierto = signal(this.hudInicial.derecha);
  readonly hudDerVisible = computed(() => this.hudDerAbierto());
  alternarHudDer(): void { this.hudDerAbierto.update((a) => !a); }
  // CAMBIO (vistas internas): la barra de anclas (Mapa · Filtros · Análisis · Tabla) y su método `irA` desaparecen. Ahora hay TRES vistas (Panel · Análisis · Eventos) con enlaces <a href="#/…">
  // reales; la lógica de hash vive en navegacion.ts (pura). Las tres secciones están siempre montadas (solo `hidden`): filtros, modo, selección, cámara del globo y mapa no se reinician al navegar.
  /** Vista activa. Se lee del hash AL CREAR el componente: un enlace directo (p. ej. #/analisis) abre la vista correcta sin parpadeo. */
  readonly vista = signal<Vista>(vistaDesdeHash(window.location.hash));
  private readonly navegacion = new SincronizadorHash(window, (v) => this.mostrarVista(v));
  private focoDestino: string | null = null;   // destino de foco pedido por la interfaz («Ver en el globo», «Ver este evento en la tabla»); null = el encabezado de la vista
  private timerMapa?: ReturnType<typeof setTimeout>;

  constructor() {
    this.navegacion.iniciar();                  // registra hashchange + popstate; la carga inicial NO mueve el foco (no se roba al abrir la página)
    document.title = tituloDocumento(this.vista());
    // Al elegir un evento (mapa, globo, tabla o anterior/siguiente) la pila derecha se abre sola si estaba colapsada: así el detalle y su anuncio (región viva) no quedan ocultos. No toca `elegir()`: solo LEE la selección.
    effect(() => { if (this.seleccionado() !== null) untracked(() => this.hudDerAbierto.set(true)); });
    // Cabecera sticky: un IntersectionObserver sobre el centinela (NO se escucha `scroll`); se desconecta en ngOnDestroy. Sin soporte del navegador, la cabecera simplemente no se condensa.
    afterNextRender(() => {
      const el = this.centinela()?.nativeElement;
      if (!el || typeof IntersectionObserver === 'undefined') return;
      this.observadorCabecera = new IntersectionObserver(([e]) => this.condensada.set(!e.isIntersecting));
      this.observadorCabecera.observe(el);
    }, { injector: this.injector });
  }

  /** Cambio de vista (clic en la nav, Atrás/Adelante o enlace directo → hash): título, anuncio breve en la región viva existente y foco al encabezado. */
  private mostrarVista(v: Vista): void {
    this.vista.set(v);
    document.title = tituloDocumento(v);
    this.anuncioModo.set(anuncioVista(v));      // única región viva polite de la cabecera (la misma del cambio de modo): evita duplicar regiones
    this.enfocarVista(v);
  }

  /** Cuando el DOM ya muestra la vista: scroll arriba (instantáneo, sin animación: sirve también con prefers-reduced-motion), foco al destino y, en el Panel, recalcular Leaflet. */
  private enfocarVista(v: Vista): void {
    const pedido = this.focoDestino; this.focoDestino = null;
    afterNextRender(() => {
      const destino = (pedido !== null ? document.getElementById(pedido) : null) ?? document.getElementById(ID_ENCABEZADO[v]);
      if (pedido !== null && destino && destino.id === pedido) destino.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
      if (destino) { if (!destino.hasAttribute('tabindex')) destino.tabIndex = -1; destino.focus({ preventScroll: true }); }
      if (v === 'panel') this.alMostrarPanel();
    }, { injector: this.injector });
  }

  /** Cambio de vista pedido por un control de la página (no por un <a> de la nav): fija el hash (historial) y, si ya estaba en esa vista, solo lleva el foco. */
  irAVista(v: Vista, foco: string | null = null): void {
    this.focoDestino = foco;
    if (!this.navegacion.navegar(v)) this.enfocarVista(v);
  }
  /** «Ver este evento en la tabla» (panel de detalle): vista Eventos y foco al título de la tabla. */
  verEnTabla(): void { this.irAVista('eventos', 'tabla-titulo'); }
  /** «Ver en el globo/mapa» (vista Eventos): vuelve al Panel y enfoca el visor; el evento seleccionado ya está centrado (la selección es compartida). */
  verEnVisor(): void { this.irAVista('panel', 'mapa'); }
  /** «Ver detalle» de la banda de incidencias y enlaces de la vista Eventos: vista Análisis y foco al bloque «Metodología y estado del sistema». */
  verMetodologia(): void { this.metodologiaAbierta.set(true); this.irAVista('analisis', 'metodologia-titulo'); }
  /** «Cambiar filtros» (franja de filtros activos de Análisis y Eventos): vuelve al Panel, abre el formulario (móvil) y enfoca #filtros. */
  cambiarFiltros(): void { this.filtrosAbiertos.set(true); this.irAVista('panel', 'filtros'); }
  /** Logo y título de la cabecera: llevan al Panel (arriba del todo) y actualizan los datos, como el logo de cualquier web. Fuera del modo API no hay nada que actualizar. */
  irAlInicio(): void { this.irAVista('panel'); this.actualizarAhora(); }

  /** El Panel vuelve a verse: si el visor es el mapa 2D, Leaflet recupera su tamaño (estuvo oculto). El globo no necesita nada: `visible` lo reanuda. */
  alMostrarPanel(): void { if (this.visor() === '2d') this.map?.invalidateSize(); }
  readonly nombrePaisActual = signal<string | undefined>(undefined);
  readonly itemsHora = computed(() => { const e = this.estadisticas(); return e ? itemsDeHora(e.por_hora) : []; });
  readonly itemsPaises = computed(() => { const e = this.estadisticas(); return e ? itemsPais(e.por_pais, 10) : []; });
  readonly itemsMagnitud = computed(() => { const e = this.estadisticas(); return e ? itemsIntervalos(e.magnitud) : []; });
  readonly itemsProfundidad = computed(() => { const e = this.estadisticas(); return e ? itemsIntervalos(e.profundidad) : []; });
  /** Ronda 3: color de cada barra de profundidad (mismo orden que `itemsProfundidad`). Solo colorea por la leyenda si el intervalo completo cae dentro de un rango; si cruza un corte, neutro. */
  readonly coloresProfundidad = computed(() => { const e = this.estadisticas(); return e ? e.profundidad.items.map((i) => colorIntervaloProfundidad(i.from, i.to)) : null; });
  /** Sección «Metodología y estado del sistema»: contraída por defecto (Fase 1: la vista Análisis arranca más limpia; estado solo en memoria). «Ver detalle» e «Ir a Cargar el resto» la abren. */
  readonly metodologiaAbierta = signal(false);
  readonly omitidoHora = computed(() => {
    const h = this.estadisticas()?.por_hora;
    return h && h.items === null
      ? `Serie por hora omitida: ${h.motivo === 'ventana_demasiado_amplia' ? `la ventana necesita más de ${h.max_casillas ?? 744} horas` : (h.motivo ?? 'motivo no indicado')}. Acorta el periodo para verla; el resto de estadísticas es válido.`
      : null;
  });
  readonly options: L.MapOptions = { center: L.latLng(18, 0), zoom: 2, minZoom: 2, maxZoom: 8, preferCanvas: true, worldCopyJump: false,
    scrollWheelZoom: false }; // F7: la rueda sobre el mapa desplaza la PÁGINA; el zoom sigue con botones +/−, doble clic, teclado y gestos táctiles
  private map?: L.Map;
  // F7 (globo 3D): vista alternativa al mapa. Leaflet sigue montado y solo se oculta (hidden); todo lo del globo vive en ./globo y se carga bajo demanda.
  // CAMBIO (vistas internas): la señal del visor 2D/3D se llamaba `vista`; pasa a `visor` (y `cambiarVista` → `cambiarVisor`) porque `vista` es ahora Panel/Análisis/Eventos.
  // CAMBIO (globo por defecto): arranca en '3d' (solo en memoria: no se recuerda entre visitas). Three.js se descarga cuando el globo se muestra por primera vez (Panel + visor 3D).
  readonly visor = signal<'2d' | '3d'>('3d');
  readonly globoNoDisponible = signal<string | null>(null); // motivo si el navegador no puede dibujarlo, no se pudo cargar o tardó demasiado: «Globo 3D» queda desactivado
  readonly avisoFallback = textoAvisoFallback;               // «Globo 3D no disponible: <motivo>. Se muestra el mapa 2D.»
  private readonly injector = inject(Injector);
  cambiarVisor(visor: '2d' | '3d'): void {
    if (visor === '3d' && this.globoNoDisponible() !== null) return;
    this.visor.set(visor);
    // al volver al 2D el contenedor de Leaflet recupera su tamaño: se recalcula cuando el DOM ya lo muestra
    if (visor === '2d') afterNextRender(() => this.map?.invalidateSize(), { injector: this.injector });
  }
  /**
   * Fallback automático al mapa 2D (sin soporte gráfico, fallo del import()/renderer o temporizador de seguridad): se marca el globo como no disponible (el aviso persistente sale del motivo)
   * y se pasa al 2D. Leaflet pudo arrancar OCULTO (tamaño 0): invalidateSize en el siguiente fotograma y otra vez a los 250 ms por si el diseño aún se estaba asentando.
   */
  globoSinSoporte(motivo: string): void {
    this.globoNoDisponible.set(motivo);
    this.cambiarVisor('2d');
    clearTimeout(this.timerMapa);
    this.timerMapa = setTimeout(() => this.map?.invalidateSize(), REINTENTO_INVALIDAR_MS);
  }
  // F7 (leyenda interactiva, solo con la vista 3D): rango de profundidad resaltado en el globo. Solo en memoria; se conserva al volver al 2D pero allí no se aplica (la leyenda vuelve a ser estática).
  readonly rangoLeyenda = signal<RangoProfundidad | null>(null);
  readonly conteosRangos = signal<ConteosRangos | null>(null);   // lo emite el globo con los eventos dibujados
  readonly rangosLeyenda = RANGOS_LEYENDA;
  private readonly nfLeyenda = new Intl.NumberFormat('es-ES');
  cuentaRango(id: RangoProfundidad): string { return this.nfLeyenda.format(this.conteosRangos()?.[id] ?? 0); }
  nombreBoton(r: DefRango): string { return nombreBotonRango(r, this.cuentaRango(r.id)); }
  alternarRango(r: RangoProfundidad): void { this.rangoLeyenda.update((a) => alternarRango(a, r)); }
  /** «Mostrar todos»: el botón desaparece, así que el foco vuelve al botón del rango que estaba activo. */
  mostrarTodosRangos(): void {
    const previo = this.rangoLeyenda();
    this.rangoLeyenda.set(null);
    if (previo !== null) afterNextRender(() => document.getElementById('leyenda-rango-' + previo)?.focus(), { injector: this.injector });
  }
  readonly anuncioLeyenda = computed(() => {
    const r = this.rangoLeyenda(); const c = this.conteosRangos();
    return this.visor() === '3d' && r !== null && c ? textoAnuncioRango(r, c[r], c.total, (n) => this.nfLeyenda.format(n)) : '';
  });
  // F7 (mapa): estilo del mapa base. Solo en memoria (señal): no se guarda en el navegador y vuelve a «oscuro» al recargar.
  readonly estiloMapa = signal<EstiloMapa>(ESTILO_MAPA_INICIAL);
  private fronteras?: L.GeoJSON;
  private controlEstilo?: L.Control;
  private cajaEstilo?: HTMLElement;
  private events = L.layerGroup();
  private timer?: ReturnType<typeof setTimeout>;
  private controller = new AbortController();
  private destroyed = false;
  private config?: Config;
  private api?: ApiService;
  private readonly ultima = new UltimaPeticion();
  private nombresPais: Record<string, string> = {};
  private marcadores = new Map<string, L.CircleMarker>();
  private estilos = new Map<string, L.PathOptions>();
  private paramsVigentes: Record<string, string> | null = null; // parámetros de la última lectura correcta (para «cargar el resto» con el MISMO periodo)
  private versionLectura = 0;
  private huboError = false;
  private relojEstado?: ReturnType<typeof setInterval>;
  // F6 (6.6): en el despliegue público (config.pausarSiOculta) la consulta automática se suspende con la pestaña oculta y se reanuda al volver; siempre hay actualización manual.
  // F6 (FR-041): clave de acceso de la API publicada; vive solo en ApiService (memoria)
  readonly pideClave = signal(false);
  readonly claveRechazada = signal(false);
  readonly intervaloRef = signal(''); // F7: «cada 60 s», para el indicador (sale de config.refreshMs)
  readonly avisoPausaRef = signal<string | null>(null); // F7: aviso de suspensión con pestaña oculta (solo si config.pausarSiOculta)
  readonly enPausa = signal(false);
  private readonly alCambiarVisibilidad = (): void => {
    const config = this.config;
    if (!config || config.mode !== 'api' || document.hidden || !this.enPausa()) return;
    this.enPausa.set(false);
    if (debeRefrescarAlVolver(performance.now(), this.lecturaPerf(), config.refreshMs)) { clearTimeout(this.timer); void this.refresh(config); }
    else this.programar(config, true);
  };
  private readonly alVolverRed = (): void => { if (this.config?.mode === 'api' && this.huboError) { clearTimeout(this.timer); void this.refresh(this.config); } };
  private ultimosFiltros: FiltrosEstado = estadoInicial(); // filtros de la última lectura CORRECTA (los que describen lo que hay en el mapa)

  async onMapReady(map: L.Map): Promise<void> {
    this.map = map;
    map.getContainer().classList.add(`mapa-${this.estiloMapa()}`); // el fondo y el filtro de las teselas dependen de esta clase (styles.css)
    // UNA sola capa base (OpenStreetMap, misma URL y atribución). El estilo oscuro es un filtro CSS sobre sus teselas (clase `teselas-mapa`), no otro proveedor.
    const base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, noWrap: true, className: 'teselas-mapa', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    const borders = this.fronteras = L.geoJSON(undefined, { style: this.estiloFrontera,
      onEachFeature: (feature, layer) => {
        const name = document.createElement('span');
        name.textContent = feature.properties?.NAME_ES ?? feature.properties?.ADMIN ?? 'Sin nombre';
        layer.bindTooltip(name);
      }
    }).addTo(map);
    this.events.addTo(map);
    L.control.layers({ 'OpenStreetMap': base }, { 'Países (Natural Earth)': borders, 'Terremotos': this.events }).addTo(map);
    this.controlEstilo = this.crearControlEstilo().addTo(map);
    map.attributionControl.addAttribution('Fronteras: Natural Earth · Datos reales: USGS');
    try {
      const catalogo = await this.readJson<FeatureCollection>('datos/paises.geojson');
      borders.addData(catalogo);
      const paises = paisesDelCatalogo(catalogo); // la lista del filtro de país sale del mismo catálogo entregado
      this.paises.set(paises);
      this.nombresPais = Object.fromEntries(paises.map((p) => [p.id, p.nombre]));
      this.countriesStatus.set('Catálogo de países cargado');
    } catch { this.countriesStatus.set('No se pudo cargar el catálogo de países'); }
    if (this.destroyed) return;
    try {
      const config = await this.readJson<Config>('config.json');
      if (!['demo', 'api'].includes(config.mode)) throw new Error('Modo inválido');
      this.config = config;
      this.esApi.set(config.mode === 'api');
      if (config.mode === 'api') { this.relojEstado = setInterval(() => this.ahoraPerf.set(performance.now()), 1000); window.addEventListener('online', this.alVolverRed); document.addEventListener('visibilitychange', this.alCambiarVisibilidad); this.intervaloRef.set(textoIntervalo(config)); this.avisoPausaRef.set(avisoPausaOculta(config)); }
      if (config.mode === 'api') this.api = new ApiService(config.apiUrl, { omitirAvisoNgrok: config.skipNgrokWarning });
      this.mode.set(config.mode === 'demo' ? 'DEMOSTRACIÓN · datos ficticios' : 'API · datos del backend');
      await this.refresh(config);
    } catch { this.status.set('Error: revisa public/config.json'); }
  }

  /** Trazado de las fronteras: mismo grosor y geometría en ambos estilos; solo el color se aclara en oscuro para que no se pierda. */
  private readonly estiloFrontera = (): L.PathOptions => ({ color: BORDE_FRONTERA[this.estiloMapa()], weight: 1, fill: false });

  /** Control propio de Leaflet (arriba a la derecha, bajo el de capas): dos botones con aria-pressed para elegir «Oscuro» o «Claro». */
  private crearControlEstilo(): L.Control {
    const control = new L.Control({ position: 'topright' });
    control.onAdd = (): HTMLElement => {
      const caja = L.DomUtil.create('div', 'leaflet-control selector-estilo');
      caja.setAttribute('role', 'group');
      caja.setAttribute('aria-label', 'Estilo del mapa base');
      for (const [valor, texto] of [['oscuro', 'Oscuro'], ['claro', 'Claro']] as const) {
        const boton = L.DomUtil.create('button', '', caja) as HTMLButtonElement;
        boton.type = 'button';
        boton.textContent = texto;
        boton.dataset['estilo'] = valor;
        boton.setAttribute('aria-pressed', String(valor === this.estiloMapa()));
        L.DomEvent.on(boton, 'click', () => this.cambiarEstilo(valor));
      }
      L.DomEvent.disableClickPropagation(caja); // pulsar o arrastrar sobre el control no mueve ni hace zoom en el mapa
      L.DomEvent.disableScrollPropagation(caja);
      this.cajaEstilo = caja;
      return caja;
    };
    return control;
  }

  /**
   * Cambia el estilo del mapa base. Solo cambia el BORDE de los círculos (relleno por profundidad, tamaño y opacidad no se tocan) y el color de las fronteras;
   * la selección conserva su resalte (más grueso y con su propio color en cada estilo).
   */
  private cambiarEstilo(estilo: EstiloMapa): void {
    if (estilo === this.estiloMapa()) return;
    this.estiloMapa.set(estilo);
    const contenedor = this.map?.getContainer();
    contenedor?.classList.remove('mapa-oscuro', 'mapa-claro');
    contenedor?.classList.add(`mapa-${estilo}`);
    this.cajaEstilo?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset['estilo'] === estilo)));
    this.fronteras?.setStyle(this.estiloFrontera);
    const borde = bordeMapa(estilo);
    const seleccionado = this.seleccionado();
    for (const [id, estiloBase] of this.estilos) {
      const nuevo: L.PathOptions = { ...estiloBase, color: borde }; // el estilo guardado sirve para restaurar el marcador al deseleccionarlo
      this.estilos.set(id, nuevo);
      if (id === seleccionado) this.resaltar(id); else this.marcadores.get(id)?.setStyle(nuevo);
    }
  }

  /** Contenido de la ventana emergente creado con el DOM y textContent (nunca HTML): [REPRODUCCIÓN] · lugar · insignia de magnitud · filas etiqueta/valor. */
  private construirFicha(p: Propiedades, profundidad: unknown, id: unknown): HTMLElement {
    const ficha = filasFicha(p, profundidad, id);
    const raiz = document.createElement('div');
    raiz.className = 'ficha';
    if (this.esReplay()) { // en reproducción la etiqueta (y el distintivo de caso controlado, si lo es) encabeza la ficha
      const replay = document.createElement('p');
      replay.className = 'ficha-replay';
      replay.textContent = fichaReplay(p, this.ejecucion(), true).trim();
      raiz.appendChild(replay);
    }
    const titulo = document.createElement('p');
    titulo.className = 'ficha-titulo';
    titulo.textContent = ficha.lugar;
    const insignia = document.createElement('p');
    insignia.className = 'ficha-magnitud';
    insignia.textContent = ficha.insignia; // texto, no solo color
    const lista = document.createElement('dl');
    lista.className = 'ficha-filas';
    for (const fila of ficha.filas) {
      const grupo = document.createElement('div');
      const etiqueta = document.createElement('dt');
      etiqueta.textContent = fila.etiqueta;
      const valor = document.createElement('dd');
      valor.textContent = fila.valor;
      grupo.append(etiqueta, valor);
      lista.appendChild(grupo);
    }
    raiz.append(titulo, insignia, lista);
    return raiz;
  }

  /** «Aplicar filtros»: un único estado para mapa, tabla y gráficas; la consulta se repite ya, con los filtros nuevos y la ventana desde `generated` de la API. */
  aplicarFiltros(filtros: FiltrosEstado): void {
    if (!this.config || this.config.mode !== 'api') return;
    this.filtros.set(filtros);
    clearTimeout(this.timer);
    void this.refresh(this.config);
  }

  /**
   * Cambio de modo (F6): se cancela la petición en curso y se DESCARTA toda la lectura del modo anterior (eventos, estadísticas, ejecución, periodo, selección y filtros)
   * antes de consultar el nuevo; así nunca se ve una mezcla ni una reproducción presentada como actividad en vivo.
   */
  cambiarModo(modo: ModoVista): void {
    if (!this.config || this.config.mode !== 'api' || modo === this.modoVista()) return;
    clearTimeout(this.timer);
    this.ultima.cancelar();
    this.modoVista.set(modo);
    this.descartarLectura();
    this.anuncioModo.set(modo === 'replay' ? 'Modo REPRODUCCIÓN: datos históricos reproducidos, no actividad actual.' : 'Modo en vivo: datos actuales de USGS.');
    void this.refresh(this.config);
  }

  private descartarLectura(): void {
    const v = lecturaVacia();
    this.eventos.set(v.eventos); this.estadisticas.set(v.estadisticas); this.ejecucion.set(v.ejecucion); this.total.set(v.total);
    this.siguienteOffset.set(v.siguiente); this.ventana.set(v.ventana); this.salud.set(v.salud); this.periodo.set(v.periodo); this.resumenFiltros.set(v.resumen);
    this.sinEjecuciones.set(false); this.errorPanel.set(null); this.recuperadoEn.set(null); this.lecturaPerf.set(null); this.ultimoAcceso.set(null);
    this.seleccionado.set(null); this.avisoSeleccion.set(''); this.nombrePaisActual.set(undefined);
    this.filtros.set(estadoInicial()); this.ultimosFiltros = estadoInicial();
    this.paramsVigentes = null; this.huboError = false; this.falloRefresco.set(false); this.filtrosRechazados.set(false); this.versionLectura++;
    this.map?.closePopup();
    this.dibujar([]);
    this.status.set(this.esReplay() ? 'Cargando la reproducción…' : 'Cargando datos en vivo…');
    this.mode.set(this.esReplay() ? 'REPRODUCCIÓN · eventos históricos reproducidos, no actividad actual' : 'API · datos del backend');
  }

  /** Modo REPRODUCCIÓN: la ejecución (la más reciente) viene de /api/salud?mode=replay; con ella, eventos y estadísticas del MISMO periodo y de la MISMA ejecución. */
  private async leerReplay(id: number, externa: AbortSignal): Promise<void> {
    const salud = await this.api!.salud(externa, parametrosModo('replay'));
    const ejec = salud.replay ?? null;
    if (this.destroyed || !this.ultima.vigente(id)) return;
    const filtros = this.filtros();
    const ventana = ejec === null ? null : ventanaReplay(filtros, ejec, resolverVentana);
    let eventos: Evento[] = []; let est: Estadisticas | null = null; let total: number | null = 0; let siguiente: number | null = null;
    let params: Record<string, string> | null = null; let periodo = 'Sin consulta'; let generado = fechaUtc(salud.generated);
    if (ejec !== null && ventana !== null) {
      const { fuente: _sinFuente, ...paramsBase } = parametros(filtros, ventana); // F8: la API rechaza `fuente` en reproducción (histórico de USGS)
      params = { ...paramsBase, ...parametrosModo('replay', ejec.run_id) };
      const panel = await this.api!.panel(params, externa, 1);
      if (this.destroyed || !this.ultima.vigente(id)) return;
      eventos = panel.eventos.features; est = panel.estadisticas; total = panel.eventos.metadata.total; siguiente = panel.eventos.siguiente;
      periodo = `${fechaUtc(panel.eventos.metadata.period.start)} → ${fechaUtc(panel.eventos.metadata.period.end)} (fin exclusivo; fechas originales de los eventos)`;
      generado = fechaUtc(panel.eventos.metadata.generated);
    }
    this.ejecucion.set(ejec); // antes de dibujar: las fichas llevan la identidad de la ejecución
    this.sinEjecuciones.set(ejec === null);
    this.aplicarEventos(eventos);
    this.estadisticas.set(est); this.total.set(total); this.siguienteOffset.set(siguiente); this.ventana.set(ventana); this.periodo.set(periodo);
    this.ultimosFiltros = filtros; this.resumenFiltros.set(resumenReplay(filtros, resumen({ ...filtros, fuente: '' }, this.nombresPais)));
    this.nombrePaisActual.set(this.nombresPais[filtros.pais.trim().toUpperCase()]);
    this.paramsVigentes = params; this.versionLectura++;
    this.salud.set(salud); this.ultimoAcceso.set(new Date().toISOString()); this.lecturaPerf.set(performance.now());
    this.recuperadoEn.set(this.huboError ? new Date().toISOString().slice(11, 19) : null); this.huboError = false; this.errorPanel.set(null); this.falloRefresco.set(false); this.filtrosRechazados.set(false);
    this.generated.set(generado);
    this.status.set(ejec === null ? 'Todavía no hay ninguna reproducción guardada.' : `${etiquetaReplay(ejec)} · consulta completada. Datos históricos reproducidos, no actividad actual.`);
  }

  /** Siguiente consulta automática. Con la pestaña oculta y `pausarSiOculta`, no se consulta: queda en pausa hasta que vuelva a ser visible. */
  private programar(config: Config, correcto: boolean): void {
    clearTimeout(this.timer);
    const espera = retardoSiguiente(correcto, config.refreshMs);
    this.ahoraPerf.set(performance.now()); // sincroniza el reloj de lectura para que la cuenta atrás parta del valor real
    this.proximoPerf.set(this.ahoraPerf() + espera); // F7: solo lectura para el indicador (cuenta atrás real)
    this.timer = setTimeout(() => {
      this.proximoPerf.set(null);
      if (pausada(document.hidden, config)) { this.enPausa.set(true); return; }
      void this.refresh(config);
    }, espera);
  }

  /** Recibe la clave escrita en el panel: la entrega al servicio (solo memoria) y consulta de nuevo. */
  enviarClave(clave: string): void {
    if (!this.api || !this.config || this.config.mode !== 'api') return;
    this.api.establecerClave(clave);
    this.pideClave.set(false);
    this.claveRechazada.set(false);
    clearTimeout(this.timer);
    void this.refresh(this.config);
  }

  /** «Actualizar ahora»: consulta inmediata (cancela la espera y la lectura en curso, como «Aplicar filtros»). */
  actualizarAhora(): void {
    if (!this.config || this.config.mode !== 'api') return;
    clearTimeout(this.timer);
    this.enPausa.set(false);
    void this.refresh(this.config);
  }

  private async readJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    const response = await fetch(url, { headers, cache: 'no-store',
      signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(15000)]) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }

  private async refresh(config: Config): Promise<void> {
    const { id, señal } = this.ultima.nueva(); // cancela la petición anterior: una respuesta tardía no pisa a la más reciente
    this.cargando.set(true);
    this.proximoPerf.set(null); // F7: durante la consulta no hay intento programado (se fija de nuevo en `programar`)
    let correcto = false;
    try {
      if (config.mode === 'demo' || !this.api) {
        const data = await this.readJson<DatosDemo>('datos/terremotos-demo.geojson');
        if (this.destroyed || !this.ultima.vigente(id)) return;
        if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Se esperaba FeatureCollection');
        this.aplicarEventos(data.features as unknown as Evento[]); // F7: el globo 3D lee `eventos()` también en demostración (la tabla y las estadísticas no existen sin API)
        this.generated.set(fechaUtc(data.metadata?.generated));
        this.status.set('Ejemplo estático: no representa actividad real');
        return;
      }
      if (this.modoVista() === 'replay') { // F6: la reproducción no usa el reloj ni la ventana de «últimas 24 h» del modo en vivo
        await this.leerReplay(id, AbortSignal.any([this.controller.signal, señal]));
        if (this.destroyed || !this.ultima.vigente(id)) return;
        correcto = true;
        return;
      }
      // Modo API: primero el instante `generated` de la API (`instanteApi`: no el reloj del navegador) y con él UNA ventana explícita para todas las peticiones del refresco.
      const externa = AbortSignal.any([this.controller.signal, señal]);
      const referencia = await this.api.referencia(externa);
      const generado = referencia.generado;
      const filtros = this.filtros();
      const ventana = resolverVentana(filtros, generado);
      const parametrosPanel = parametros(filtros, ventana);
      // Eventos (solo la primera página: si el periodo tiene más, el panel lo avisa y ofrece cargar el resto) y estadísticas COMPLETAS con el MISMO periodo y filtros
      const panel = await this.api.panel(parametrosPanel, externa, 1);
      const datos = panel.eventos;
      if (this.destroyed || !this.ultima.vigente(id)) return;
      this.aplicarEventos(datos.features);
      this.estadisticas.set(panel.estadisticas);
      this.nombrePaisActual.set(this.nombresPais[filtros.pais.trim().toUpperCase()]);
      this.ultimosFiltros = filtros;
      this.resumenFiltros.set(resumen(filtros, this.nombresPais)); // describe lo que hay dibujado, no lo último solicitado
      this.ventana.set(ventana);
      this.total.set(datos.metadata.total);
      this.periodo.set(`${fechaUtc(datos.metadata.period.start)} → ${fechaUtc(datos.metadata.period.end)} (fin exclusivo)`);
      this.paramsVigentes = parametrosPanel;
      this.versionLectura++;
      this.siguienteOffset.set(datos.siguiente);
      this.salud.set(referencia.salud ?? this.salud());
      this.ultimoAcceso.set(new Date().toISOString());
      this.lecturaPerf.set(performance.now());
      this.recuperadoEn.set(this.huboError ? new Date().toISOString().slice(11, 19) : null); // «conexión recuperada» solo tras un fallo
      this.huboError = false;
      this.errorPanel.set(null);
      this.falloRefresco.set(false); this.filtrosRechazados.set(false);
      correcto = true;
      this.generated.set(fechaUtc(datos.metadata.generated));
      this.status.set(datos.incompleta ? `Resultados truncados: se muestran ${datos.features.length} de ${datos.metadata.total} eventos.` : 'API accesible · consulta completada');
    } catch (e) {
      if (this.destroyed || !this.ultima.vigente(id) || (e instanceof ErrorApi && e.tipo === 'cancelado')) return;
      const error: ErrorPanel = e instanceof ErrorApi ? { tipo: e.tipo, mensaje: e.message, detalle: e.detalle } : { tipo: 'red', mensaje: 'Error inesperado al actualizar.' };
      this.errorPanel.set(error); // los últimos datos válidos se conservan en pantalla; el panel de estado indica su antigüedad
      this.falloRefresco.set(false); this.filtrosRechazados.set(false);
      if (error.tipo === 'autorizacion') {
        this.claveRechazada.set(this.api?.tieneClave() ?? false); // con clave enviada = incorrecta; sin ella = falta
        this.api?.establecerClave(null); // la clave rechazada se olvida
        this.pideClave.set(true);
        this.status.set('Acceso restringido: la API exige una clave de acceso.');
      } else if (error.tipo === 'validacion') {
        this.filtrosRechazados.set(true); // aviso propio del indicador: la API respondió, no es un fallo de refresco
        this.status.set('Filtros rechazados por la API: se conserva la última lectura válida.');
        this.filtros.set(this.ultimosFiltros); // la actualización automática sigue con los últimos filtros válidos, no reintenta los rechazados
      } else {
        this.huboError = true;
        this.falloRefresco.set(true); // fallo real de la consulta de refresco (red, tiempo, servidor o formato)
        this.status.set(`No se pudo actualizar: ${error.mensaje} Se conserva la última lectura. Revisa API, túnel y CORS.`);
      }
    } finally {
      if (!this.destroyed && this.ultima.vigente(id)) {
        this.cargando.set(false);
        if (config.mode === 'api' && !this.pideClave()) this.programar(config, correcto); // sin clave no se reintenta en bucle: se espera a que la persona la escriba // tras un fallo se reintenta pronto: recuperación automática
      }
    }
  }

  /** «Cargar el resto»: las páginas que faltan del MISMO periodo (parámetros de la última lectura correcta). Las estadísticas ya eran completas. */
  async cargarResto(): Promise<void> {
    const desde = this.siguienteOffset();
    if (!this.api || !this.paramsVigentes || desde === null || this.cargandoResto()) return;
    const version = this.versionLectura;
    this.cargandoResto.set(true);
    try {
      const resto = await this.api.todasLasPaginas(this.paramsVigentes, this.controller.signal, undefined, desde);
      if (this.destroyed || version !== this.versionLectura) return; // una actualización posterior ya sustituyó la lectura: se descarta
      const todos = [...this.eventos(), ...resto.features];
      this.aplicarEventos(todos);
      this.siguienteOffset.set(resto.siguiente);
    } catch (e) {
      if (this.destroyed || (e instanceof ErrorApi && e.tipo === 'cancelado')) return;
      this.errorPanel.set(e instanceof ErrorApi ? { tipo: e.tipo, mensaje: e.message, detalle: e.detalle } : { tipo: 'red', mensaje: 'Error inesperado al cargar el resto.' });
      this.huboError = true;
    } finally {
      this.cargandoResto.set(false);
    }
  }

  /**
   * ÚNICO camino por el que una lectura llega a la vista: el mapa 2D (dibujar) y el globo 3D (señal `eventos`, que lee la tabla y el globo) reciben SIEMPRE la misma lista
   * (misma referencia), así que nunca pueden diferir. (descartarLectura vacía ambos con listas vacías: `dibujar([])` y `lecturaVacia().eventos`.)
   */
  private aplicarEventos(features: Evento[]): void {
    this.dibujar(features);
    this.eventos.set(features);
  }

  /** Dibujo de eventos del frontend proporcionado (sin cambios de comportamiento): círculos por magnitud, color por profundidad, ficha como texto. */
  private dibujar(features: Evento[]): void {
    // Construir primero la nueva capa: si falla, conservar la anterior.
    const next = L.layerGroup(); let omitted = 0; let count = 0;
    const marcadores = new Map<string, L.CircleMarker>(); const estilos = new Map<string, L.PathOptions>();
    for (const [indice, feature] of features.entries()) {
      const p = feature.properties;
      const c = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : [];
      const [lon, lat, depth] = c;
      if (!p || typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) { omitted++; continue; }
      const color = colorProfundidad(depth);
      const popup = this.construirFicha(p, depth, feature.id);
      const id = idDe(feature, indice); // el mismo identificador que usa la tabla
      const estilo: L.PathOptions & { radius: number } = estiloCirculo(color, radioMagnitud(numeroFinito(p.mag)), bordeMapa(this.estiloMapa()));
      const marcador = L.circleMarker([lat, lon], estilo).bindPopup(popup, { className: 'popup-sismico', maxWidth: 320, minWidth: 240, autoPanPaddingTopLeft: L.point(10, 96) }).on('click', () => this.elegir(id, 'mapa')).addTo(next);
      marcadores.set(id, marcador); estilos.set(id, estilo);
      count++;
    }
    this.events.clearLayers(); this.events.addLayer(next);
    this.marcadores = marcadores; this.estilos = estilos;
    this.count.set(count); this.omitted.set(omitted);
    this.lastRead.set(new Date().toISOString());
    // La selección sobrevive a la actualización si el evento sigue en el periodo; si no, se limpia (nunca queda una selección fantasma).
    const sel = this.seleccionado();
    if (sel !== null) { if (marcadores.has(sel)) this.resaltar(sel); else { this.seleccionado.set(null); this.avisoSeleccion.set(''); } }
  }

  /**
   * UN solo evento seleccionado, compartido por mapa y tabla. Desde la tabla, pulsar de nuevo la fila seleccionada la deselecciona; el mapa se centra en el
   * evento y abre su ficha. Un evento sin coordenadas válidas se puede seleccionar en la tabla pero no existe en el mapa: se avisa.
   */
  elegir(id: string | null, origen: 'mapa' | 'tabla'): void {
    const actual = this.seleccionado();
    const destino = origen === 'tabla' && id === actual ? null : id;
    // Con el visor 3D activo, o con otra vista distinta del Panel (p. ej. Eventos), Leaflet está oculto: no se centra ni se abre ninguna ventana emergente (el detalle lo da el panel
    // «Evento seleccionado»). Solo se cierra la que pudiera quedar abierta de antes, para que al volver al 2D no aparezca un popup que no corresponde a la selección. La selección
    // compartida y el resalte del marcador 2D se conservan (al volver al Panel en 2D el evento se ve resaltado, sin popup; en 3D el globo ya está centrado en él).
    const sinMapa = this.visor() === '3d' || this.vista() !== 'panel';
    this.quitarResalte(actual);
    this.seleccionado.set(destino);
    this.avisoSeleccion.set('');
    if (sinMapa) this.map?.closePopup();
    if (destino === null) { this.map?.closePopup(); return; }
    this.mostrarFichaEnMovil();
    const marcador = this.marcadores.get(destino);
    if (!marcador) { this.avisoSeleccion.set('Este evento no tiene coordenadas válidas y no se dibuja en el mapa; se conserva en la tabla.'); return; }
    this.resaltar(destino);
    if (origen === 'tabla' && !sinMapa) { this.map?.panTo(marcador.getLatLng()); marcador.openPopup(); }
  }

  /**
   * Fase 1 (móvil, < 768 px): en el Panel la ficha del evento queda DEBAJO del visor y no se sabe que hay que bajar. Al elegir un evento se desplaza suavemente hasta ella,
   * solo si aún no se ve su parte alta (no se mueve si ya estaba a la vista, p. ej. con «anterior/siguiente» desde la propia ficha) y sin animación con «reducir movimiento».
   * No mueve el foco (la región viva de la ficha ya anuncia la selección). En otras vistas o en pantallas anchas no hace nada.
   */
  private mostrarFichaEnMovil(): void {
    if (this.vista() !== 'panel' || !window.matchMedia('(max-width: 767px)').matches) return;
    afterNextRender(() => {
      // la ficha cambia de tamaño al llenarse y el visor se recoloca: se mide un instante después (150 ms), ya con el diseño asentado, para que el destino sea el correcto
      setTimeout(() => {
        const ficha = document.querySelector<HTMLElement>('app-detalle-evento.o-detalle');
        if (!ficha || this.destroyed || ficha.getBoundingClientRect().top < window.innerHeight * 0.6) return;
        const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        ficha.scrollIntoView({ block: 'start', behavior: reducir ? 'auto' : 'smooth' });
      }, 150);
    }, { injector: this.injector });
  }

  private resaltar(id: string): void {
    const marcador = this.marcadores.get(id);
    marcador?.setStyle({ weight: 4, color: SELECCION_MAPA[this.estiloMapa()], fillOpacity: .95 });
    marcador?.bringToFront();
  }

  private quitarResalte(id: string | null): void {
    const estilo = id === null ? undefined : this.estilos.get(id);
    if (id !== null && estilo) this.marcadores.get(id)?.setStyle(estilo);
  }

  ngOnDestroy(): void { this.navegacion.detener(); this.observadorCabecera?.disconnect();clearTimeout(this.timerMapa); this.controlEstilo?.remove(); this.destroyed = true; clearTimeout(this.timer); clearInterval(this.relojEstado); window.removeEventListener('online', this.alVolverRed); document.removeEventListener('visibilitychange', this.alCambiarVisibilidad); this.ultima.cancelar(); this.controller.abort(); }
}
