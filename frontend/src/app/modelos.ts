// Tipos compartidos del panel (F5, paso 5.4). Solo tipos: se borran al compilar, así que los módulos puros pueden importarlos con `import type`
// sin que Node (pruebas con `node --test`) ni Angular tengan que resolver nada en tiempo de ejecución.

export type Config = { mode: 'demo' | 'api'; apiUrl: string; refreshMs: number; skipNgrokWarning: boolean;
  /** F6: solo en el despliegue público; suspende la consulta automática mientras la pestaña no es visible. Ausente = false (como en F5). */
  pausarSiOculta?: boolean };

/** Propiedades de cada evento según CONTRATO-API.md (+ país de F4). `null` = desconocido; nunca NaN. */
export type Propiedades = {
  mag: number | null; magType?: string | null; place: string; time: number; updated: number;
  country_id?: string | null; country_name?: string | null;
  /** F6: solo en reproducción. `caso` = caso controlado (sintético); nulo en los eventos reales. */
  caso?: string | null; replayed_at?: number;
};
export type Punto = { type: 'Point'; coordinates: (number | null)[] };
export type Evento = { type: 'Feature'; id?: string | number; geometry: Punto | null; properties: Propiedades };

/** `metadata` de /api/eventos con los campos que añade F5 (contracts/api-f5.md). */
export type Metadatos = {
  generated: number; last_ingestion: number | null; mode: string; count: number; truncated: boolean;
  total: number; limit: number; offset: number; next_offset: number | null; sin_magnitud: number;
  period: { start: number; end: number }; coverage: { live_since?: number | null; desde?: number | null; hasta?: number | null };
  /** F6: solo con mode=replay; null si todavía no hay ejecuciones. */
  replay?: EjecucionReplay | null;
};
export type RespuestaEventos = { type: 'FeatureCollection'; metadata: Metadatos; features: Evento[] };
/** /api/salud (F5, 5.6): estado de la ingesta medido por el reloj de la API. Los campos nuevos son opcionales para tolerar una API anterior. */
export type Salud = {
  status: string; database: string; last_ingestion: number | null; generated?: number; ingestion_age_s?: number | null; stale?: boolean;
  stale_after_s?: number; gaps_pending?: number; live_since?: number | null;
  /** F6: solo con mode=replay. `last_ingestion` sigue siendo la ingesta EN VIVO. */
  replay?: EjecucionReplay | null;
};

/** Páginas leídas de un mismo periodo: `incompleta` si quedan eventos sin cargar (por la guarda de páginas) y `siguiente` es el `offset` de la página que falta (o null). */
export type EventosCompletos = { features: Evento[]; metadata: Metadatos; paginas: number; incompleta: boolean; siguiente: number | null };

/** F6 (contracts/f6.md §2): ejecución de replay tal como la devuelve la API (fechas en ms Unix UTC). */
export type EjecucionReplay = {
  run_id: string; estado: string; tamano: number; velocidad: number | null; intervalo: { desde: number | null; hasta: number | null };
  iniciada_at: number; terminada_at: number | null;
};
export type ModoVista = 'live' | 'replay';

export type Preajuste = 'ultimas-24h' | 'ultimos-7d' | 'personalizado';

/** Estado de los filtros tal como lo edita la persona usuaria (cadenas de los campos del formulario). Fechas «YYYY-MM-DDTHH:mm» en UTC. */
export type FiltrosEstado = { preajuste: Preajuste; desde: string; hasta: string; magMin: string; pais: string };

/** Periodo resuelto en milisegundos Unix UTC a partir del instante `generated` de la API. */
export type Ventana = { startMs: number; endMs: number };

export type TipoError = 'autorizacion' | 'validacion' | 'servidor' | 'red' | 'tiempo' | 'formato' | 'cancelado';
export type PaisCatalogo = { id: string; nombre: string };

// --- F5, paso 5.5: estadísticas (contracts/api-f5.md) y datos de la tabla y las gráficas ---------------------------------------------------------------

export type ItemHora = { hour: number; count: number };
/** `items: null` cuando la ventana necesita más de `max_casillas` horas: se omite SOLO la serie y se indica el motivo. */
export type BloqueHora = { unit: string; sin_valor: number; items: ItemHora[] | null; motivo?: string; max_casillas?: number };
export type ItemPais = { country_id: string | null; country_name: string; count: number };
export type BloquePais = { unit: string; sin_valor: number; items: ItemPais[] };
/** Intervalo [from, to): un extremo abierto es `null` (nunca Infinity). */
export type Intervalo = { from: number | null; to: number | null; count: number };
export type BloqueIntervalos = { unit: string; sin_valor: number; items: Intervalo[] };

export type Comparacion = {
  unit: string; comparacion_disponible: boolean; ambito: 'global' | 'pais' | 'sin_pais'; country_id: string | null;
  min_mag_solicitada: number | null; min_mag_efectiva: number; min_mag_elevada: boolean;
  reciente: { source: string; count: number; sin_magnitud: number; desde: number; hasta: number; dias: number };
  historico: { source: string; periodo: { desde: string; hasta: string }; dias: number; total: number; media_diaria: number; mediana_diaria: number; esperado_para_ventana: number } | null;
  variacion: number | null; variacion_definida: boolean; periodo_reciente_incompleto: boolean; motivos_incompleto: string[];
};

/** Comparación de una reproducción: no aplica (la API no calcula nada). */
export type ComparacionNoAplica = { unit: string; comparacion_disponible: false; motivo: string; historico: null; variacion: null };

export type Estadisticas = {
  generated: number; period: { start: number; end: number }; filters: { min_mag: number | null; country_id: string | null };
  total: number; sin_magnitud: number; por_hora: BloqueHora; por_pais: BloquePais; magnitud: BloqueIntervalos; profundidad: BloqueIntervalos; comparacion: Comparacion | ComparacionNoAplica;
  mode?: string; replay?: EjecucionReplay | null;
};

/** Una fila de la tabla de eventos (valores ya normalizados: `null` = sin valor, nunca 0). */
export type FilaTabla = {
  id: string; tiempo: number | null; mag: number | null; magTipo: string | null; profundidad: number | null; clase: string; lugar: string;
  pais: string; paisId: string | null; lon: number | null; lat: number | null; actualizado: number | null;
  caso: string | null;
};
export type ItemGrafica = { etiqueta: string; valor: number; detalle?: string };

/** Todo lo que describe la lectura en pantalla; al cambiar de modo se reinicia por completo (F6). */
export type Lectura = {
  eventos: Evento[]; estadisticas: Estadisticas | null; ejecucion: EjecucionReplay | null; total: number | null; siguiente: number | null;
  ventana: Ventana | null; salud: Salud | null; periodo: string; resumen: string;
};
