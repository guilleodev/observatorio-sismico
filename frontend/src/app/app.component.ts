import { Component, OnDestroy, computed, signal } from '@angular/core';
import { LeafletDirective } from '@bluehalo/ngx-leaflet';
import * as L from 'leaflet';
import type { FeatureCollection } from 'geojson';
import { ApiService, ErrorApi, UltimaPeticion } from './api.service';
import { BarrasComponent } from './graficas/barras.component';
import { ComparacionComponent } from './comparacion/comparacion.component';
import { EstadoComponent } from './estado/estado.component';
import { FiltrosComponent } from './filtros/filtros.component';
import { TablaComponent } from './tabla/tabla.component';
import { SelectorModoComponent } from './selector-modo/selector-modo.component';
import { itemsHora as itemsDeHora, itemsIntervalos, itemsPais } from './graficas';
import { idDe } from './tabla';
import { edadLecturaMs, retardoSiguiente } from './estado';
import type { EntradaEstado, ErrorPanel } from './estado';
import { estadoInicial, paisesDelCatalogo, parametros, resolverVentana, resumen } from './filtros';
import { colorProfundidad, fechaUtc, numeroFinito, radioMagnitud, textoFicha } from './formato';
import { AVISO_COMPARACION_NO_APLICA, MODO_INICIAL, conEtiqueta, etiquetaReplay, fichaReplay, lecturaVacia, parametrosModo, resumenReplay, ventanaReplay } from './modo';
import type { Comparacion, Config, EjecucionReplay, Estadisticas, Evento, FiltrosEstado, ModoVista, PaisCatalogo, Salud, Ventana } from './modelos';

// Frontend proporcionado + F5 (paso 5.4): el mapa, las capas y la lectura robusta son los entregados; se añaden un servicio de API (`api.service.ts`),
// un único estado de filtros (`filtros.ts`) y el componente de filtros. En modo `demo` no se llama a la API. Las funciones de formato se extrajeron
// de este archivo sin cambiar su comportamiento (`formato.ts`). Mapa, tabla y gráficas (5.5) leerán el mismo estado de filtros.
type DatosDemo = FeatureCollection & { metadata?: { generated?: number } };

@Component({
  selector: 'app-root', standalone: true, imports: [LeafletDirective, SelectorModoComponent, EstadoComponent, FiltrosComponent, BarrasComponent, ComparacionComponent, TablaComponent],
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
  readonly entradaEstado = computed<EntradaEstado>(() => ({
    error: this.errorPanel(), salud: this.salud(), hayLectura: this.lecturaPerf() !== null, edadLecturaMs: edadLecturaMs(this.ahoraPerf(), this.lecturaPerf()),
    cargados: this.eventos().length, total: this.estadisticas() ? this.estadisticas()!.total : null, siguiente: this.siguienteOffset(), recuperadoEn: this.recuperadoEn(),
    modo: this.modoVista(), sinEjecuciones: this.sinEjecuciones(),
  }));
  readonly ventana = signal<Ventana | null>(null);
  // F6 (6.2): modo de vista. En reproducción TODO (mapa, tabla, ficha, gráficas, estado) lleva la etiqueta y la lectura anterior se descarta al cambiar de modo.
  readonly modoVista = signal<ModoVista>(MODO_INICIAL);
  readonly ejecucion = signal<EjecucionReplay | null>(null);
  readonly sinEjecuciones = signal(false);
  readonly anuncioModo = signal('');
  readonly esReplay = computed(() => this.modoVista() === 'replay');
  readonly etiquetaVista = computed(() => (this.esReplay() ? etiquetaReplay(this.ejecucion()) : null));
  readonly avisoNoAplica = AVISO_COMPARACION_NO_APLICA;
  readonly comparacionVivo = computed<Comparacion | null>(() => { const c = this.estadisticas()?.comparacion; return c && 'reciente' in c ? c : null; });
  readonly rotular = (titulo: string): string => conEtiqueta(titulo, this.esReplay());
  // F5 (5.5): UNA sola respuesta del periodo resuelto alimenta mapa, tabla, gráficas y comparación; y UN solo evento seleccionado compartido por mapa y tabla
  readonly eventos = signal<Evento[]>([]);
  readonly estadisticas = signal<Estadisticas | null>(null);
  readonly seleccionado = signal<string | null>(null);
  readonly avisoSeleccion = signal('');
  readonly nombrePaisActual = signal<string | undefined>(undefined);
  readonly itemsHora = computed(() => { const e = this.estadisticas(); return e ? itemsDeHora(e.por_hora) : []; });
  readonly itemsPaises = computed(() => { const e = this.estadisticas(); return e ? itemsPais(e.por_pais, 10) : []; });
  readonly itemsMagnitud = computed(() => { const e = this.estadisticas(); return e ? itemsIntervalos(e.magnitud) : []; });
  readonly itemsProfundidad = computed(() => { const e = this.estadisticas(); return e ? itemsIntervalos(e.profundidad) : []; });
  readonly omitidoHora = computed(() => {
    const h = this.estadisticas()?.por_hora;
    return h && h.items === null
      ? `Serie por hora omitida: ${h.motivo === 'ventana_demasiado_amplia' ? `la ventana necesita más de ${h.max_casillas ?? 744} horas` : (h.motivo ?? 'motivo no indicado')}. Acorta el periodo para verla; el resto de estadísticas es válido.`
      : null;
  });
  readonly options: L.MapOptions = { center: L.latLng(18, 0), zoom: 2, minZoom: 2, maxZoom: 8, preferCanvas: true, worldCopyJump: false };
  private map?: L.Map;
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
  private readonly alVolverRed = (): void => { if (this.config?.mode === 'api' && this.huboError) { clearTimeout(this.timer); void this.refresh(this.config); } };
  private ultimosFiltros: FiltrosEstado = estadoInicial(); // filtros de la última lectura CORRECTA (los que describen lo que hay en el mapa)

  async onMapReady(map: L.Map): Promise<void> {
    this.map = map;
    const base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, noWrap: true, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    const borders = L.geoJSON(undefined, { style: { color: '#334155', weight: 1, fill: false },
      onEachFeature: (feature, layer) => {
        const name = document.createElement('span');
        name.textContent = feature.properties?.NAME_ES ?? feature.properties?.ADMIN ?? 'Sin nombre';
        layer.bindTooltip(name);
      }
    }).addTo(map);
    this.events.addTo(map);
    L.control.layers({ 'OpenStreetMap': base }, { 'Países (Natural Earth)': borders, 'Terremotos': this.events }).addTo(map);
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
      if (config.mode === 'api') { this.relojEstado = setInterval(() => this.ahoraPerf.set(performance.now()), 1000); window.addEventListener('online', this.alVolverRed); }
      if (config.mode === 'api') this.api = new ApiService(config.apiUrl, { omitirAvisoNgrok: config.skipNgrokWarning });
      this.mode.set(config.mode === 'demo' ? 'DEMOSTRACIÓN · datos ficticios' : 'API · datos del backend');
      await this.refresh(config);
    } catch { this.status.set('Error: revisa public/config.json'); }
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
    this.paramsVigentes = null; this.huboError = false; this.versionLectura++;
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
      params = { ...parametros(filtros, ventana), ...parametrosModo('replay', ejec.run_id) };
      const panel = await this.api!.panel(params, externa, 1);
      if (this.destroyed || !this.ultima.vigente(id)) return;
      eventos = panel.eventos.features; est = panel.estadisticas; total = panel.eventos.metadata.total; siguiente = panel.eventos.siguiente;
      periodo = `${fechaUtc(panel.eventos.metadata.period.start)} → ${fechaUtc(panel.eventos.metadata.period.end)} (fin exclusivo; fechas originales de los eventos)`;
      generado = fechaUtc(panel.eventos.metadata.generated);
    }
    this.ejecucion.set(ejec); // antes de dibujar: las fichas llevan la identidad de la ejecución
    this.sinEjecuciones.set(ejec === null);
    this.dibujar(eventos);
    this.eventos.set(eventos); this.estadisticas.set(est); this.total.set(total); this.siguienteOffset.set(siguiente); this.ventana.set(ventana); this.periodo.set(periodo);
    this.ultimosFiltros = filtros; this.resumenFiltros.set(resumenReplay(filtros, resumen(filtros, this.nombresPais)));
    this.nombrePaisActual.set(this.nombresPais[filtros.pais.trim().toUpperCase()]);
    this.paramsVigentes = params; this.versionLectura++;
    this.salud.set(salud); this.ultimoAcceso.set(new Date().toISOString()); this.lecturaPerf.set(performance.now());
    this.recuperadoEn.set(this.huboError ? new Date().toISOString().slice(11, 19) : null); this.huboError = false; this.errorPanel.set(null);
    this.generated.set(generado);
    this.status.set(ejec === null ? 'Todavía no hay ninguna reproducción guardada.' : `${etiquetaReplay(ejec)} · consulta completada. Datos históricos reproducidos, no actividad actual.`);
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
    let correcto = false;
    try {
      if (config.mode === 'demo' || !this.api) {
        const data = await this.readJson<DatosDemo>('datos/terremotos-demo.geojson');
        if (this.destroyed || !this.ultima.vigente(id)) return;
        if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Se esperaba FeatureCollection');
        this.dibujar(data.features as unknown as Evento[]);
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
      this.dibujar(datos.features);
      this.eventos.set(datos.features);
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
      correcto = true;
      this.generated.set(fechaUtc(datos.metadata.generated));
      this.status.set(datos.incompleta ? `Resultados truncados: se muestran ${datos.features.length} de ${datos.metadata.total} eventos.` : 'API accesible · consulta completada');
    } catch (e) {
      if (this.destroyed || !this.ultima.vigente(id) || (e instanceof ErrorApi && e.tipo === 'cancelado')) return;
      const error: ErrorPanel = e instanceof ErrorApi ? { tipo: e.tipo, mensaje: e.message, detalle: e.detalle } : { tipo: 'red', mensaje: 'Error inesperado al actualizar.' };
      this.errorPanel.set(error); // los últimos datos válidos se conservan en pantalla; el panel de estado indica su antigüedad
      if (error.tipo === 'validacion') {
        this.status.set('Filtros rechazados por la API: se conserva la última lectura válida.');
        this.filtros.set(this.ultimosFiltros); // la actualización automática sigue con los últimos filtros válidos, no reintenta los rechazados
      } else {
        this.huboError = true;
        this.status.set(`No se pudo actualizar: ${error.mensaje} Se conserva la última lectura. Revisa API, túnel y CORS.`);
      }
    } finally {
      if (!this.destroyed && this.ultima.vigente(id)) {
        this.cargando.set(false);
        if (config.mode === 'api') this.timer = setTimeout(() => void this.refresh(config), retardoSiguiente(correcto, config.refreshMs)); // tras un fallo se reintenta pronto: recuperación automática
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
      this.eventos.set(todos);
      this.dibujar(todos);
      this.siguienteOffset.set(resto.siguiente);
    } catch (e) {
      if (this.destroyed || (e instanceof ErrorApi && e.tipo === 'cancelado')) return;
      this.errorPanel.set(e instanceof ErrorApi ? { tipo: e.tipo, mensaje: e.message, detalle: e.detalle } : { tipo: 'red', mensaje: 'Error inesperado al cargar el resto.' });
      this.huboError = true;
    } finally {
      this.cargandoResto.set(false);
    }
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
      const popup = document.createElement('div');
      popup.textContent = fichaReplay(p, this.ejecucion(), this.esReplay()) + textoFicha(p, depth, feature.id);
      const id = idDe(feature, indice); // el mismo identificador que usa la tabla
      const estilo: L.PathOptions & { radius: number } = { radius: radioMagnitud(numeroFinito(p.mag)), color, fillColor: color, fillOpacity: .75, weight: 1 };
      const marcador = L.circleMarker([lat, lon], estilo).bindPopup(popup).on('click', () => this.elegir(id, 'mapa')).addTo(next);
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
    this.quitarResalte(actual);
    this.seleccionado.set(destino);
    this.avisoSeleccion.set('');
    if (destino === null) { this.map?.closePopup(); return; }
    const marcador = this.marcadores.get(destino);
    if (!marcador) { this.avisoSeleccion.set('Este evento no tiene coordenadas válidas y no se dibuja en el mapa; se conserva en la tabla.'); return; }
    this.resaltar(destino);
    if (origen === 'tabla') { this.map?.panTo(marcador.getLatLng()); marcador.openPopup(); }
  }

  private resaltar(id: string): void {
    const marcador = this.marcadores.get(id);
    marcador?.setStyle({ weight: 4, color: '#111827', fillOpacity: .95 });
    marcador?.bringToFront();
  }

  private quitarResalte(id: string | null): void {
    const estilo = id === null ? undefined : this.estilos.get(id);
    if (id !== null && estilo) this.marcadores.get(id)?.setStyle(estilo);
  }

  ngOnDestroy(): void { this.destroyed = true; clearTimeout(this.timer); clearInterval(this.relojEstado); window.removeEventListener('online', this.alVolverRed); this.ultima.cancelar(); this.controller.abort(); }
}
