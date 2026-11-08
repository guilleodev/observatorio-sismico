// Cliente de la API (F5, paso 5.4, T026): URL y cabeceras, errores tipados, paginación con periodo fijo y descarte de respuestas tardías.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiService, ErrorApi, UltimaPeticion } from '../src/app/api.service.ts';

type Llamada = { url: string; headers: Record<string, string>; signal: AbortSignal };

function evento(id: string) {
  return { type: 'Feature', id, geometry: { type: 'Point', coordinates: [0, 0, 10] }, properties: { mag: 4, place: 'x', time: 1, updated: 1 } };
}

function pagina(ids: string[], next: number | null, total: number, offset = 0) {
  return { type: 'FeatureCollection', metadata: { generated: 5, last_ingestion: 4, mode: 'live', count: ids.length, truncated: next !== null, total, limit: 2, offset, next_offset: next, sin_magnitud: 0, period: { start: 1, end: 2 }, coverage: { live_since: null } }, features: ids.map(evento) };
}

function respuesta(cuerpo: unknown, status = 200): Response {
  return new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });
}

function servicio(manejador: (llamada: Llamada) => Promise<Response> | Response, extra: object = {}) {
  const llamadas: Llamada[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    const l = { url, headers: (init.headers ?? {}) as Record<string, string>, signal: init.signal as AbortSignal };
    llamadas.push(l);
    return manejador(l);
  }) as unknown as typeof fetch;
  return { api: new ApiService('http://api.test/', { fetchFn, omitirAvisoNgrok: true, ...extra }), llamadas };
}

test('construye la URL sin barra doble, codifica los parámetros y envía la cabecera de ngrok', async () => {
  const { api, llamadas } = servicio(() => respuesta(pagina([], null, 0)));
  await api.eventos({ start: '2026-11-06T17:30:00.000Z', end: '2026-11-07T17:30:00.000Z', min_mag: '4.5', country_id: 'sin_pais' });
  assert.equal(llamadas[0].url, 'http://api.test/api/eventos?start=2026-11-06T17%3A30%3A00.000Z&end=2026-11-07T17%3A30%3A00.000Z&min_mag=4.5&country_id=sin_pais');
  assert.equal(llamadas[0].headers['ngrok-skip-browser-warning'], '1');
});

test('sin omitirAvisoNgrok no se envía la cabecera y /api/salud no lleva parámetros', async () => {
  const llamadas: Llamada[] = [];
  const api = new ApiService('http://api.test', { fetchFn: (async (url: string, init: RequestInit) => { llamadas.push({ url, headers: init.headers as Record<string, string>, signal: init.signal as AbortSignal }); return respuesta({ status: 'ok', database: 'ok', last_ingestion: 1, generated: 99 }); }) as unknown as typeof fetch });
  assert.equal((await api.salud()).generated, 99);
  assert.equal(llamadas[0].url, 'http://api.test/api/salud');
  assert.deepEqual(llamadas[0].headers, {});
});

test('un 422 es un error de validación con el detalle de la API', async () => {
  const { api } = servicio(() => respuesta({ error: 'parametro_invalido', detail: 'min_mag debe ser un número finito, no abc' }, 422));
  await assert.rejects(api.eventos({ min_mag: 'abc' }), (e: ErrorApi) => e instanceof ErrorApi && e.tipo === 'validacion' && e.estado === 422 && /min_mag/.test(e.detalle ?? ''));
});

test('un 503 y otros códigos HTTP son errores de servidor; nunca se tratan como cero eventos', async () => {
  for (const estado of [503, 500, 404]) {
    const { api } = servicio(() => respuesta({ error: 'base_de_datos_no_disponible' }, estado));
    await assert.rejects(api.eventos({}), (e: ErrorApi) => e.tipo === 'servidor' && e.estado === estado);
  }
  const { api } = servicio(() => respuesta('<html>no json</html>', 502));
  await assert.rejects(api.eventos({}), (e: ErrorApi) => e.tipo === 'servidor' && e.estado === 502);
});

test('fallo de red, tiempo agotado y petición cancelada se distinguen', async () => {
  const red = servicio(() => { throw new TypeError('fetch failed'); });
  await assert.rejects(red.api.salud(), (e: ErrorApi) => e.tipo === 'red');
  const tiempo = servicio(() => { throw new DOMException('timeout', 'TimeoutError'); });
  await assert.rejects(tiempo.api.salud(), (e: ErrorApi) => e.tipo === 'tiempo');
  const control = new AbortController();
  const cancel = servicio(() => { control.abort(); throw new DOMException('abort', 'AbortError'); });
  await assert.rejects(cancel.api.salud(control.signal), (e: ErrorApi) => e.tipo === 'cancelado');
});

test('el tiempo de espera es el configurado (15 s por defecto) y expira de verdad', async () => {
  const lento = servicio((l) => new Promise<Response>((_, rechazar) => l.signal.addEventListener('abort', () => rechazar(l.signal.reason))), { timeoutMs: 30 });
  await assert.rejects(lento.api.salud(), (e: ErrorApi) => e.tipo === 'tiempo' && e.message.includes('0.03'));
});

test('JSON inválido o forma inesperada es un error de formato', async () => {
  const roto = servicio(() => respuesta('esto no es JSON'));
  await assert.rejects(roto.api.salud(), (e: ErrorApi) => e.tipo === 'formato');
  const forma = servicio(() => respuesta({ type: 'Otra', features: [] }));
  await assert.rejects(forma.api.eventos({}), (e: ErrorApi) => e.tipo === 'formato');
  const sinMeta = servicio(() => respuesta({ type: 'FeatureCollection', features: [] }));
  await assert.rejects(sinMeta.api.eventos({}), (e: ErrorApi) => e.tipo === 'formato');
});

test('todasLasPaginas sigue next_offset con el MISMO periodo y no repite eventos', async () => {
  const paginas: Record<string, unknown> = { '': pagina(['a', 'b'], 2, 5), '2': pagina(['c', 'd'], 4, 5, 2), '4': pagina(['e'], null, 5, 4) };
  const { api, llamadas } = servicio((l) => respuesta(paginas[new URL(l.url).searchParams.get('offset') ?? '']));
  const r = await api.todasLasPaginas({ start: 'S', end: 'E', min_mag: '4' });
  assert.deepEqual(r.features.map((f) => f.id), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(r.paginas, 3);
  assert.equal(r.incompleta, false);
  assert.equal(r.metadata.total, 5);
  assert.deepEqual(llamadas.map((l) => new URL(l.url).searchParams.get('offset')), [null, '2', '4']); // la primera página no lleva offset
  for (const l of llamadas) {
    const q = new URL(l.url).searchParams;
    assert.equal(q.get('start'), 'S'); assert.equal(q.get('end'), 'E'); assert.equal(q.get('min_mag'), '4'); // periodo y filtros idénticos en todas las páginas
  }
});

test('la guarda de páginas marca el resultado como incompleto y nunca finge que está completo', async () => {
  const { api } = servicio((l) => { const o = Number(new URL(l.url).searchParams.get('offset') ?? 0); return respuesta(pagina([`p${o}`], o + 1, 999, o)); }, { maxPaginas: 3 });
  const r = await api.todasLasPaginas({ start: 'S', end: 'E' });
  assert.equal(r.paginas, 3);
  assert.equal(r.incompleta, true);
  assert.equal(r.features.length, 3);
});

test('un error en una página posterior se propaga (no se devuelve un resultado parcial como completo)', async () => {
  const { api } = servicio((l) => (new URL(l.url).searchParams.get('offset') === '2' ? respuesta({ error: 'base_de_datos_no_disponible' }, 503) : respuesta(pagina(['a', 'b'], 2, 5))));
  await assert.rejects(api.todasLasPaginas({ start: 'S', end: 'E' }), (e: ErrorApi) => e.tipo === 'servidor');
});

test('una respuesta sin eventos es válida (features vacío), no un error', async () => {
  const { api } = servicio(() => respuesta(pagina([], null, 0)));
  const r = await api.todasLasPaginas({ start: 'S', end: 'E' });
  assert.deepEqual([r.features.length, r.paginas, r.incompleta], [0, 1, false]);
});

test('UltimaPeticion: la nueva cancela a la anterior y la respuesta tardía deja de ser vigente', () => {
  const guarda = new UltimaPeticion();
  const a = guarda.nueva();
  assert.equal(guarda.vigente(a.id), true);
  const b = guarda.nueva();
  assert.equal(a.señal.aborted, true); // la anterior se cancela
  assert.equal(b.señal.aborted, false);
  assert.equal(guarda.vigente(a.id), false); // si la respuesta de A llega tarde, se descarta
  assert.equal(guarda.vigente(b.id), true);
  guarda.cancelar();
  assert.equal(b.señal.aborted, true);
});

test('simulación de respuestas fuera de orden: solo la última actualiza el estado', async () => {
  const guarda = new UltimaPeticion();
  let estado = '';
  const lanzar = async (nombre: string, retrasoMs: number) => {
    const { id } = guarda.nueva();
    await new Promise((r) => setTimeout(r, retrasoMs));
    if (guarda.vigente(id)) estado = nombre;
  };
  await Promise.all([lanzar('lenta', 40), lanzar('rápida', 5)]); // la segunda se lanza después y termina antes; la primera llega tarde
  assert.equal(estado, 'rápida');
});

test('instanteApi usa generated de /api/salud cuando existe (una sola petición por refresco)', async () => {
  const { api, llamadas } = servicio(() => respuesta({ status: 'ok', database: 'ok', last_ingestion: 1, generated: 1793113140000 }));
  assert.equal(await api.instanteApi(), 1793113140000);
  assert.equal(await api.instanteApi(), 1793113140000);
  assert.deepEqual(llamadas.map((l) => new URL(l.url).pathname), ['/api/salud', '/api/salud']);
});

test('instanteApi recurre a metadata.generated de /api/eventos?limit=1 si /api/salud aún no lo trae, y no repite la sonda', async () => {
  const { api, llamadas } = servicio((l) => (new URL(l.url).pathname === '/api/salud' ? respuesta({ status: 'ok', database: 'ok', last_ingestion: 1 }) : respuesta(pagina([], null, 0))));
  assert.equal(await api.instanteApi(), 5); // pagina() fija generated = 5 en su metadata
  assert.equal(await api.instanteApi(), 5);
  assert.deepEqual(llamadas.map((l) => new URL(l.url).pathname + new URL(l.url).search), ['/api/salud', '/api/eventos?limit=1', '/api/eventos?limit=1']);
});

test('instanteApi propaga los errores de la API (un 503 no se disfraza de reloj local)', async () => {
  const { api } = servicio(() => respuesta({ error: 'base_de_datos_no_disponible' }, 503));
  await assert.rejects(api.instanteApi(), (e: ErrorApi) => e.tipo === 'servidor' && e.estado === 503);
});

function estadisticas(total = 3) {
  return { generated: 5, period: { start: 1, end: 2 }, filters: { min_mag: null, country_id: null }, total, sin_magnitud: 0,
    por_hora: { unit: 'events/hour UTC', sin_valor: 0, items: [] }, por_pais: { unit: 'events', sin_valor: 0, items: [] },
    magnitud: { unit: 'magnitude', sin_valor: 0, items: [] }, profundidad: { unit: 'km', sin_valor: 0, items: [] }, comparacion: { reciente: { count: 0 } } };
}

test('estadisticas pide /api/estadisticas con los mismos parámetros y valida la forma', async () => {
  const { api, llamadas } = servicio(() => respuesta(estadisticas()));
  const r = await api.estadisticas({ start: 'S', end: 'E', min_mag: '4' });
  assert.equal(r.total, 3);
  assert.equal(llamadas[0].url, 'http://api.test/api/estadisticas?start=S&end=E&min_mag=4');
  const mal = servicio(() => respuesta({ total: 1 }));
  await assert.rejects(mal.api.estadisticas({}), (e: ErrorApi) => e.tipo === 'formato');
  const e422 = servicio(() => respuesta({ error: 'parametro_invalido', detail: 'x' }, 422));
  await assert.rejects(e422.api.estadisticas({}), (e: ErrorApi) => e.tipo === 'validacion');
});

test('panel: eventos y estadísticas con EXACTAMENTE el mismo periodo y filtros; si falla uno, falla todo', async () => {
  const { api, llamadas } = servicio((l) => respuesta(new URL(l.url).pathname === '/api/estadisticas' ? estadisticas(1) : pagina(['a'], null, 1)));
  const r = await api.panel({ start: 'S', end: 'E', country_id: 'ESP' });
  assert.equal(r.eventos.features.length, 1);
  assert.equal(r.estadisticas.total, 1);
  assert.deepEqual(llamadas.map((l) => new URL(l.url).pathname).sort(), ['/api/estadisticas', '/api/eventos']);
  for (const l of llamadas) {
    const q = new URL(l.url).searchParams;
    assert.deepEqual([q.get('start'), q.get('end'), q.get('country_id')], ['S', 'E', 'ESP']);
  }
  const roto = servicio((l) => (new URL(l.url).pathname === '/api/estadisticas' ? respuesta({ error: 'base_de_datos_no_disponible' }, 503) : respuesta(pagina(['a'], null, 1))));
  await assert.rejects(roto.api.panel({ start: 'S', end: 'E' }), (e: ErrorApi) => e.tipo === 'servidor' && e.estado === 503);
});

test('estadisticas exige TODOS los bloques, también la comparación (una respuesta incompleta es un error de formato)', async () => {
  const sinComparacion = { ...estadisticas() } as Record<string, unknown>;
  delete sinComparacion['comparacion'];
  await assert.rejects(servicio(() => respuesta(sinComparacion)).api.estadisticas({}), (e: ErrorApi) => e.tipo === 'formato');
  for (const bloque of ['por_hora', 'por_pais', 'magnitud', 'profundidad']) {
    const incompleta = { ...estadisticas() } as Record<string, unknown>;
    delete incompleta[bloque];
    await assert.rejects(servicio(() => respuesta(incompleta)).api.estadisticas({}), (e: ErrorApi) => e.tipo === 'formato', bloque);
  }
});

test('referencia devuelve generated Y el estado de /api/salud cuando la API ya lo incluye', async () => {
  const salud = { status: 'ok', database: 'ok', last_ingestion: 1, generated: 1793113140000, ingestion_age_s: 12, stale: false, stale_after_s: 300, gaps_pending: 0, live_since: 5 };
  const { api, llamadas } = servicio(() => respuesta(salud));
  const r = await api.referencia();
  assert.equal(r.generado, 1793113140000);
  assert.deepEqual(r.salud, salud);
  assert.equal(llamadas.length, 1);
});

test('referencia con una API anterior (sin generated en /api/salud) usa /api/eventos?limit=1 y devuelve salud null', async () => {
  const { api } = servicio((l) => (new URL(l.url).pathname === '/api/salud' ? respuesta({ status: 'ok', database: 'ok', last_ingestion: 1 }) : respuesta(pagina([], null, 0))));
  assert.deepEqual(await api.referencia(), { generado: 5, salud: null });
});

test('la carga inicial puede limitarse a UNA página y devuelve siguiente para «cargar el resto» con el mismo periodo', async () => {
  const paginas: Record<string, unknown> = { '': pagina(['a', 'b'], 2, 5), '2': pagina(['c', 'd'], 4, 5, 2), '4': pagina(['e'], null, 5, 4) };
  const { api, llamadas } = servicio((l) => respuesta(paginas[new URL(l.url).searchParams.get('offset') ?? '']));
  const primera = await api.todasLasPaginas({ start: 'S', end: 'E' }, undefined, 1);
  assert.deepEqual([primera.features.map((f) => f.id), primera.paginas, primera.incompleta, primera.siguiente], [['a', 'b'], 1, true, 2]);
  assert.equal(llamadas.length, 1);
  const resto = await api.todasLasPaginas({ start: 'S', end: 'E' }, undefined, undefined, primera.siguiente ?? 0);
  assert.deepEqual([resto.features.map((f) => f.id), resto.incompleta, resto.siguiente], [['c', 'd', 'e'], false, null]);
  assert.deepEqual(llamadas.map((l) => new URL(l.url).searchParams.get('offset')), [null, '2', '4']);
  for (const l of llamadas) assert.deepEqual([new URL(l.url).searchParams.get('start'), new URL(l.url).searchParams.get('end')], ['S', 'E']);
  // juntas son exactamente todas, sin duplicados ni omisiones
  assert.deepEqual([...primera.features, ...resto.features].map((f) => f.id), ['a', 'b', 'c', 'd', 'e']);
});

test('panel(…, 1) pide solo la primera página de eventos y las estadísticas completas', async () => {
  const { api, llamadas } = servicio((l) => respuesta(new URL(l.url).pathname === '/api/estadisticas' ? estadisticas(12000) : pagina(['a'], 1, 12000)));
  const r = await api.panel({ start: 'S', end: 'E' }, undefined, 1);
  assert.equal(r.eventos.incompleta, true);
  assert.equal(r.eventos.siguiente, 1);
  assert.equal(r.estadisticas.total, 12000);
  assert.equal(llamadas.filter((l) => new URL(l.url).pathname === '/api/eventos').length, 1);
});
