// Cliente de la API del Observatorio (F5, paso 5.4). Clase sencilla, sin Angular y sin importaciones en ejecución: se prueba con `node --test`.
// Conserva el comportamiento de `readJson` del frontend proporcionado (fetch sin caché, tiempo de espera de 15 s, señal de cancelación,
// cabecera `ngrok-skip-browser-warning`) y añade errores tipados, carga de todas las páginas de un periodo y descarte de respuestas tardías.
import type { Estadisticas, EventosCompletos, RespuestaEventos, Salud, TipoError } from './modelos';

export class ErrorApi extends Error {
  tipo: TipoError;
  estado?: number;
  detalle?: string;

  constructor(tipo: TipoError, mensaje: string, estado?: number, detalle?: string) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.tipo = tipo;
    this.estado = estado;
    this.detalle = detalle;
  }
}

export type OpcionesApi = { omitirAvisoNgrok?: boolean; timeoutMs?: number; fetchFn?: typeof fetch; maxPaginas?: number };

export class ApiService {
  private readonly base: string;
  private readonly omitirAvisoNgrok: boolean;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly maxPaginas: number;
  private generadoEnSalud?: boolean; // undefined = aún no sondeado

  constructor(apiUrl: string, opciones: OpcionesApi = {}) {
    this.base = apiUrl.replace(/\/$/, '');
    this.omitirAvisoNgrok = opciones.omitirAvisoNgrok ?? false;
    this.timeoutMs = opciones.timeoutMs ?? 15000;
    this.fetchFn = opciones.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.maxPaginas = opciones.maxPaginas ?? 20;
  }

  /** GET de una ruta de la API con parámetros; devuelve el JSON o lanza `ErrorApi` (422 → validacion, 5xx/4xx → servidor, sin respuesta → red/tiempo). */
  async obtener<T>(ruta: string, params: Record<string, string> = {}, externa?: AbortSignal): Promise<T> {
    const consulta = new URLSearchParams(params).toString();
    const url = `${this.base}${ruta}${consulta ? `?${consulta}` : ''}`;
    const headers: Record<string, string> = {};
    if (this.omitirAvisoNgrok) headers['ngrok-skip-browser-warning'] = '1';
    const señales = [AbortSignal.timeout(this.timeoutMs)];
    if (externa) señales.push(externa);
    let respuesta: Response;
    try {
      respuesta = await this.fetchFn(url, { headers, cache: 'no-store', signal: AbortSignal.any(señales) });
    } catch (e) {
      throw this.traducir(e, externa);
    }
    if (!respuesta.ok) throw await this.errorHttp(respuesta);
    try {
      return (await respuesta.json()) as T;
    } catch (e) {
      throw this.traducir(e, externa, true);
    }
  }

  salud(externa?: AbortSignal): Promise<Salud> {
    return this.obtener<Salud>('/api/salud', {}, externa);
  }

  /**
   * Referencia temporal de la API: su `generated` (ms Unix UTC), para no depender del reloj del navegador, y el estado de ingesta de /api/salud cuando lo trae.
   * Primero `/api/salud`; si esa API aún no incluye `generated` (versión anterior a 5.6), `/api/eventos?limit=1`, cuyo `metadata.generated` es el mismo reloj.
   * Se recuerda qué fuente sirve para no repetir la sonda en cada refresco.
   */
  async referencia(externa?: AbortSignal): Promise<{ generado: number; salud: Salud | null }> {
    if (this.generadoEnSalud !== false) {
      const salud = await this.salud(externa);
      this.generadoEnSalud = typeof salud.generated === 'number';
      if (typeof salud.generated === 'number') return { generado: salud.generated, salud };
    }
    return { generado: (await this.eventos({ limit: '1' }, externa)).metadata.generated, salud: null };
  }

  async instanteApi(externa?: AbortSignal): Promise<number> {
    return (await this.referencia(externa)).generado;
  }

  /** Una página de /api/eventos; comprueba que sea un FeatureCollection con `metadata`. */
  async eventos(params: Record<string, string>, externa?: AbortSignal): Promise<RespuestaEventos> {
    const datos = await this.obtener<RespuestaEventos>('/api/eventos', params, externa);
    if (datos?.type !== 'FeatureCollection' || !Array.isArray(datos.features) || typeof datos.metadata?.total !== 'number') {
      throw new ErrorApi('formato', 'La respuesta de /api/eventos no tiene la forma esperada (FeatureCollection con metadata).');
    }
    return datos;
  }

  /**
   * Páginas de UN MISMO periodo: `params` lleva `start` y `end` explícitos y no cambian entre páginas, de modo que la paginación por `offset` no se desplaza aunque
   * entren eventos nuevos. Se detiene tras `maxPaginas` (por defecto el del servicio) marcando `incompleta` y devolviendo en `siguiente` el offset que falta:
   * nunca finge que está completo.
   */
  async todasLasPaginas(params: Record<string, string>, externa?: AbortSignal, maxPaginas?: number, desde = 0): Promise<EventosCompletos> {
    const limite = maxPaginas ?? this.maxPaginas;
    const features: RespuestaEventos['features'] = [];
    let primera: RespuestaEventos | undefined;
    let offset = desde;
    let paginas = 0;
    for (;;) {
      const pagina = await this.eventos(offset > 0 ? { ...params, offset: String(offset) } : params, externa);
      primera ??= pagina;
      features.push(...pagina.features);
      paginas++;
      const siguiente = pagina.metadata.next_offset;
      if (siguiente === null || siguiente === undefined) return { features, metadata: primera.metadata, paginas, incompleta: false, siguiente: null };
      if (paginas >= limite) return { features, metadata: primera.metadata, paginas, incompleta: true, siguiente };
      offset = siguiente;
    }
  }

  /** /api/estadisticas con los MISMOS parámetros que /api/eventos (mismo periodo resuelto y mismos filtros); comprueba la forma de la respuesta. */
  async estadisticas(params: Record<string, string>, externa?: AbortSignal): Promise<Estadisticas> {
    const d = await this.obtener<Estadisticas>('/api/estadisticas', params, externa);
    if (typeof d?.total !== 'number' || !d.por_hora || !Array.isArray(d.por_pais?.items) || !Array.isArray(d.magnitud?.items) || !Array.isArray(d.profundidad?.items) || !d.comparacion?.reciente) {
      throw new ErrorApi('formato', 'La respuesta de /api/estadisticas no tiene la forma esperada.');
    }
    return d;
  }

  /** Eventos (todas las páginas) y estadísticas del mismo periodo y filtros, pedidos a la vez. Si falla cualquiera, falla todo: mapa, tabla y gráficas nunca describen periodos distintos. */
  async panel(params: Record<string, string>, externa?: AbortSignal, maxPaginas?: number): Promise<{ eventos: EventosCompletos; estadisticas: Estadisticas }> {
    const [eventos, estadisticas] = await Promise.all([this.todasLasPaginas(params, externa, maxPaginas), this.estadisticas(params, externa)]);
    return { eventos, estadisticas };
  }

  private async errorHttp(respuesta: Response): Promise<ErrorApi> {
    let detalle: string | undefined;
    try {
      const cuerpo = await respuesta.json();
      detalle = typeof cuerpo?.detail === 'string' ? cuerpo.detail : undefined;
    } catch { /* cuerpo no JSON: se informa solo del código */ }
    if (respuesta.status === 422) return new ErrorApi('validacion', detalle ?? 'La API rechazó los filtros (422).', 422, detalle);
    return new ErrorApi('servidor', respuesta.status === 503 ? 'La API no puede consultar su base de datos (503).' : `Error HTTP ${respuesta.status} de la API.`, respuesta.status, detalle);
  }

  private traducir(e: unknown, externa?: AbortSignal, respuestaMalformada = false): ErrorApi {
    if (externa?.aborted) return new ErrorApi('cancelado', 'Petición cancelada.');
    const nombre = (e as { name?: string } | null)?.name;
    if (nombre === 'TimeoutError') return new ErrorApi('tiempo', `La API no respondió en ${this.timeoutMs / 1000} s.`);
    if (nombre === 'AbortError') return new ErrorApi('cancelado', 'Petición cancelada.');
    if (respuestaMalformada) return new ErrorApi('formato', 'La respuesta de la API no es JSON válido.');
    return new ErrorApi('red', 'No se pudo conectar con la API (red, túnel o CORS).');
  }
}

/** Descarta las respuestas tardías: solo la petición más reciente puede actualizar la pantalla (FR-022). */
export class UltimaPeticion {
  private id = 0;
  private control?: AbortController;

  /** Empieza una petición nueva: cancela la anterior y devuelve su identificador y su señal. */
  nueva(): { id: number; señal: AbortSignal } {
    this.control?.abort();
    this.control = new AbortController();
    return { id: ++this.id, señal: this.control.signal };
  }

  vigente(id: number): boolean {
    return id === this.id;
  }

  cancelar(): void {
    this.control?.abort();
  }
}
