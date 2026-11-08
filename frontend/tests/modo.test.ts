// Modo EN VIVO / REPRODUCCIÓN (F6, paso 6.2, T022): parámetros, periodo, etiquetas, avisos y descarte de la lectura. `node --test tests/*.test.ts`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiService, ErrorApi, UltimaPeticion } from '../src/app/api.service.ts';
import { avisos, estadoGeneral } from '../src/app/estado.ts';
import { estadoInicial, resolverVentana } from '../src/app/filtros.ts';
import { filaDe } from '../src/app/tabla.ts';
import {
  AVISO_COMPARACION_NO_APLICA, DISTINTIVO_CASO, ETIQUETA_REPLAY, MODO_INICIAL, conEtiqueta, esCasoControlado, etiquetaReplay, fichaReplay, lecturaVacia, parametrosModo,
  textoVelocidad, ventanaDeEjecucion, ventanaReplay,
} from '../src/app/modo.ts';

const D = Date.UTC(2025, 6, 30, 0, 5, 0);
const EJEC = { run_id: 'r-f6-prueba-a', estado: 'terminada', tamano: 30, velocidad: 31.903, intervalo: { desde: D, hasta: D + 20 * 3_600_000 }, iniciada_at: 1, terminada_at: 2 };
const PROPS = { mag: 4.5, place: 'X', time: D, updated: D, caso: null, replayed_at: 5 };

test('el modo inicial es en vivo y en vivo no envía ningún parámetro nuevo (la petición es la de F5)', () => {
  assert.equal(MODO_INICIAL, 'live');
  assert.deepEqual(parametrosModo('live'), {});
  assert.deepEqual(parametrosModo('live', 'r-a'), {}); // un run residual jamás viaja con mode=live (la API lo rechazaría)
});

test('en replay se envía mode=replay y, si se conoce, run', () => {
  assert.deepEqual(parametrosModo('replay'), { mode: 'replay' });
  assert.deepEqual(parametrosModo('replay', 'r-f6-prueba-a'), { mode: 'replay', run: 'r-f6-prueba-a' });
});

test('el periodo por defecto de una reproducción es el intervalo de la ejecución [desde, hasta+1 ms), no las últimas 24 horas', () => {
  assert.deepEqual(ventanaDeEjecucion(EJEC), { startMs: D, endMs: D + 20 * 3_600_000 + 1 });
  assert.deepEqual(ventanaReplay(estadoInicial(), EJEC, resolverVentana), { startMs: D, endMs: D + 20 * 3_600_000 + 1 });
  assert.equal(ventanaDeEjecucion(null), null);
  assert.equal(ventanaDeEjecucion({ ...EJEC, intervalo: { desde: null, hasta: null } }), null);
});

test('un periodo personalizado en replay se resuelve respecto al fin de la ejecución, no al reloj del navegador', () => {
  const v = ventanaReplay({ ...estadoInicial(), preajuste: 'personalizado', desde: '2025-07-30T02:00', hasta: '2025-07-30T04:00' }, EJEC, resolverVentana);
  assert.deepEqual(v, { startMs: Date.UTC(2025, 6, 30, 2), endMs: Date.UTC(2025, 6, 30, 4) });
  const soloDesde = ventanaReplay({ ...estadoInicial(), preajuste: 'personalizado', desde: '2025-07-30T02:00' }, EJEC, resolverVentana)!;
  assert.equal(soloDesde.endMs, D + 20 * 3_600_000 + 1);
});

test('la etiqueta identifica la ejecución, la velocidad y el estado; sin ejecuciones lo dice', () => {
  assert.equal(ETIQUETA_REPLAY, 'REPRODUCCIÓN');
  const t = etiquetaReplay(EJEC);
  assert.match(t, /^REPRODUCCIÓN · ejecución r-f6-prueba-a · ×31,9 · terminada$/);
  assert.match(etiquetaReplay({ ...EJEC, estado: 'en_curso' }), /en curso$/);
  assert.match(etiquetaReplay(null), /REPRODUCCIÓN · sin ejecuciones/);
  assert.equal(textoVelocidad(null), 'velocidad no indicada');
  assert.equal(textoVelocidad(0), 'velocidad no indicada');
  assert.equal(textoVelocidad(1200), '×1200');
});

test('toda vista de reproducción lleva la etiqueta en su título y en vivo los títulos no cambian', () => {
  assert.equal(conEtiqueta('Terremotos por hora UTC', true), 'Terremotos por hora UTC · REPRODUCCIÓN');
  assert.equal(conEtiqueta('Terremotos por hora UTC', false), 'Terremotos por hora UTC');
});

test('la ficha de un evento reproducido lleva etiqueta y, si es un caso controlado, el distintivo; en vivo no añade nada', () => {
  assert.equal(fichaReplay(PROPS as never, EJEC, false), '');
  assert.equal(fichaReplay({ ...PROPS, caso: 'duplicado' } as never, EJEC, false), '');
  assert.match(fichaReplay(PROPS as never, EJEC, true), /^REPRODUCCIÓN · ejecución r-f6-prueba-a/);
  assert.doesNotMatch(fichaReplay(PROPS as never, EJEC, true), /controlado/);
  assert.match(fichaReplay({ ...PROPS, caso: 'revision' } as never, EJEC, true), /caso controlado \/ sintético: revision/);
  assert.equal(DISTINTIVO_CASO, 'caso controlado / sintético');
  assert.equal(esCasoControlado({ caso: 'maritimo' }), true);
  assert.equal(esCasoControlado({ caso: null }), false);
  assert.equal(esCasoControlado({}), false);
  assert.equal(esCasoControlado(undefined), false);
});

test('la tabla conserva el caso controlado de cada fila (null en eventos reales y en vivo)', () => {
  const ev = (caso?: string | null) => ({ type: 'Feature', id: 'a', geometry: { type: 'Point', coordinates: [1, 2, 3] }, properties: { mag: 4, place: 'x', time: 1, updated: 1, ...(caso === undefined ? {} : { caso }) } });
  assert.equal(filaDe(ev('duplicado') as never, 0).caso, 'duplicado');
  assert.equal(filaDe(ev(null) as never, 0).caso, null);
  assert.equal(filaDe(ev() as never, 0).caso, null);
});

test('al cambiar de modo la lectura queda totalmente vacía: no sobrevive nada del modo anterior', () => {
  const v = lecturaVacia();
  assert.deepEqual(v.eventos, []);
  assert.equal(v.estadisticas, null);
  assert.equal(v.ejecucion, null);
  assert.equal(v.total, null);
  assert.equal(v.siguiente, null);
  assert.equal(v.ventana, null);
  assert.equal(v.salud, null);
  assert.equal(v.periodo, 'Sin consulta');
  assert.equal(v.resumen, '');
  assert.notEqual(lecturaVacia().eventos, v.eventos); // cada llamada devuelve una lectura nueva: nada compartido que mutar
});

test('la petición al cambiar de modo se cancela y la lectura tardía se descarta', () => {
  const ultima = new UltimaPeticion();
  const vieja = ultima.nueva();
  const nueva = ultima.nueva(); // el cambio de modo lanza otra lectura
  assert.equal(vieja.señal.aborted, true);
  assert.equal(ultima.vigente(vieja.id), false);
  assert.equal(ultima.vigente(nueva.id), true);
  ultima.cancelar();
  assert.equal(nueva.señal.aborted, true);
});

test('los avisos de estado: reproducción nunca se presenta como actividad actual', () => {
  const base = { error: null, salud: null, hayLectura: true, edadLecturaMs: 4000, cargados: 30, total: 30, siguiente: null, recuperadoEn: null };
  assert.deepEqual(estadoGeneral({ ...base, modo: 'replay' } as never), { nivel: 'ok', texto: 'Reproducción histórica (no es actividad actual)' });
  assert.equal(estadoGeneral(base as never).texto, 'Datos al día'); // en vivo no cambia
  const caida = avisos({ ...base, modo: 'replay', error: { tipo: 'red', mensaje: 'x' } } as never);
  assert.equal(caida[0].codigo, 'sin-conexion');
  assert.match(caida[0].texto, /reproducción histórica, no actividad actual/);
  assert.doesNotMatch(avisos({ ...base, error: { tipo: 'red', mensaje: 'x' } } as never)[0].texto, /reproducción/);
  assert.equal(estadoGeneral({ ...base, modo: 'replay', error: { tipo: 'red', mensaje: 'x' } } as never).nivel, 'sin-conexion');
});

test('sin ejecuciones explica cómo lanzar una reproducción y no es «sin conexión» ni «sin eventos»', () => {
  const e = { error: null, salud: null, hayLectura: true, edadLecturaMs: 0, cargados: 0, total: null, siguiente: null, recuperadoEn: null, modo: 'replay', sinEjecuciones: true };
  const lista = avisos(e as never);
  assert.deepEqual(lista.map((a) => a.codigo), ['sin-ejecuciones']);
  assert.match(lista[0].texto, /ensayo_replay\.sh/);
  assert.match(lista[0].texto, /no es un fallo de conexión/);
  assert.equal(estadoGeneral(e as never).nivel, 'ok');
  assert.equal(avisos({ ...e, modo: 'live', sinEjecuciones: false } as never).some((a) => a.codigo === 'sin-ejecuciones'), false);
});

test('el aviso de «no aplica» explica por qué se oculta la comparación', () => {
  assert.match(AVISO_COMPARACION_NO_APLICA, /no aplica/);
  assert.match(AVISO_COMPARACION_NO_APLICA, /EN VIVO/);
});

// --- cliente de la API -----------------------------------------------------------------------------------------------

function cliente(respuestas: Record<string, unknown>) {
  const urls: string[] = [];
  const fetchFn = (async (url: string) => {
    urls.push(String(url));
    const ruta = new URL(String(url)).pathname;
    return { ok: true, status: 200, json: async () => respuestas[ruta] } as Response;
  }) as unknown as typeof fetch;
  return { api: new ApiService('http://api.test', { fetchFn }), urls };
}

const ESTAD_REPLAY = {
  total: 3, sin_magnitud: 0, por_hora: { unit: 'h', sin_valor: 0, items: [] }, por_pais: { unit: 'events', sin_valor: 0, items: [] },
  magnitud: { unit: 'magnitude', sin_valor: 0, items: [] }, profundidad: { unit: 'km', sin_valor: 0, items: [] }, mode: 'replay', replay: EJEC,
  comparacion: { unit: 'events', comparacion_disponible: false, motivo: 'no_aplica_en_reproduccion', historico: null, variacion: null },
};

test('el servicio acepta las estadísticas de una reproducción (comparación «no aplica») y sigue exigiendo la forma en vivo', async () => {
  const { api } = cliente({ '/api/estadisticas': ESTAD_REPLAY });
  assert.equal((await api.estadisticas({ mode: 'replay' })).comparacion.comparacion_disponible, false);
  const { api: malo } = cliente({ '/api/estadisticas': { ...ESTAD_REPLAY, comparacion: {} } });
  await assert.rejects(() => malo.estadisticas({}), (e: unknown) => e instanceof ErrorApi && e.tipo === 'formato');
  const { api: vivo } = cliente({ '/api/estadisticas': { ...ESTAD_REPLAY, comparacion: { reciente: { count: 1 } } } });
  assert.equal((await vivo.estadisticas({})).total, 3);
});

test('salud(mode=replay) envía el parámetro y sin él la URL es la de F5', async () => {
  const { api, urls } = cliente({ '/api/salud': { status: 'ok', database: 'ok', last_ingestion: 1, replay: EJEC } });
  await api.salud();
  const r = await api.salud(undefined, parametrosModo('replay'));
  assert.equal(urls[0], 'http://api.test/api/salud');
  assert.equal(urls[1], 'http://api.test/api/salud?mode=replay');
  assert.equal(r.replay?.run_id, 'r-f6-prueba-a');
});

test('los eventos de una reproducción viajan con mode y run en TODAS las páginas y en las estadísticas (mismo periodo, misma ejecución)', async () => {
  const pagina = { type: 'FeatureCollection', metadata: { total: 3, next_offset: null, generated: 1 }, features: [] };
  const { api, urls } = cliente({ '/api/eventos': pagina, '/api/estadisticas': ESTAD_REPLAY });
  await api.panel({ ...parametrosModo('replay', 'r-f6-prueba-a'), start: 'a', end: 'b' }, undefined, 1);
  assert.equal(urls.length, 2);
  for (const u of urls) assert.match(new URL(u).search, /mode=replay.*run=r-f6-prueba-a|run=r-f6-prueba-a.*mode=replay/);
});

test('el resumen de filtros en replay dice «toda la ejecución» y no «últimas 24 h»', async () => {
  const { resumenReplay, AVISO_FILTROS_REPLAY } = await import('../src/app/modo.ts');
  assert.equal(resumenReplay(estadoInicial(), 'últimas 24 h · magnitud ≥ 4'), 'toda la ejecución · magnitud ≥ 4');
  assert.equal(resumenReplay({ ...estadoInicial(), preajuste: 'ultimos-7d' }, 'últimos 7 días'), 'toda la ejecución');
  assert.equal(resumenReplay({ ...estadoInicial(), preajuste: 'personalizado' }, 'periodo personalizado (UTC)'), 'periodo personalizado (UTC)');
  assert.match(AVISO_FILTROS_REPLAY, /no las últimas 24 horas/);
});

// --- plantillas: ninguna vista de la reproducción puede quedarse sin su etiqueta (los componentes no se ejecutan con node --test: se comprueba el fuente) ---
import { readFileSync } from 'node:fs';
const fuente = (ruta: string) => readFileSync(new URL(`../src/app/${ruta}`, import.meta.url), 'utf8');

test('la plantilla etiqueta mapa, tabla, gráficas, estado y ficha, y oculta la comparación con aviso', () => {
  const html = fuente('app.component.html');
  assert.match(html, /<app-selector-modo \[modo\]="modoVista\(\)" \[ejecucion\]="ejecucion\(\)" \(cambio\)="cambiarModo\(\$event\)"/);
  assert.match(html, /class="etiqueta-mapa"[^>]*>\{\{ e \}\}/);                                  // mapa
  assert.match(html, /<app-tabla \[etiqueta\]="etiquetaVista\(\)"/);                              // tabla
  assert.equal((html.match(/\[titulo\]="rotular\('/g) ?? []).length, 4);                          // las cuatro gráficas
  assert.match(html, /<app-estado [^>]*\[ejecucion\]="ejecucion\(\)"/);                           // estado
  assert.match(html, /@if \(comparacionVivo\(\); as cmp\)/);                                      // la tarjeta solo con cifras en vivo
  assert.match(html, /@else if \(esReplay\(\)\)[^\n]*avisoNoAplica/);                             // y en replay, el aviso de «no aplica»
  assert.match(html, /aria-live="polite">\{\{ anuncioModo\(\) \}\}/);                             // el cambio de modo se anuncia
  assert.match(html, /\[replay\]="true"/);                                                         // filtros de reproducción
  assert.match(fuente('app.component.ts'), /popup\.textContent = fichaReplay\(/);                  // ficha
});

test('cambiar de modo cancela, descarta la lectura, reinicia los filtros y consulta de nuevo', () => {
  const ts = fuente('app.component.ts');
  const cuerpo = /cambiarModo\(modo: ModoVista\): void \{([\s\S]*?)\n  \}/.exec(ts)?.[1] ?? '';
  assert.match(cuerpo, /Modo REPRODUCCIÓN: datos históricos reproducidos, no actividad actual.*Modo en vivo/s); // el anuncio accesible dice en qué modo se está
  for (const paso of ['this.ultima.cancelar()', 'this.modoVista.set(modo)', 'this.descartarLectura()', 'this.anuncioModo.set(', 'void this.refresh(this.config)']) assert.ok(cuerpo.includes(paso), paso);
  const descarte = /private descartarLectura\(\): void \{([\s\S]*?)\n  \}/.exec(ts)?.[1] ?? '';
  for (const paso of ['lecturaVacia()', 'this.filtros.set(estadoInicial())', 'this.dibujar([])', 'this.seleccionado.set(null)']) assert.ok(descarte.includes(paso), paso);
});

test('la reproducción consulta la ejecución en /api/salud y pide eventos y estadísticas con el mismo run y periodo', () => {
  const ts = fuente('app.component.ts');
  assert.match(ts, /this\.api!\.salud\(externa, parametrosModo\('replay'\)\)/);
  assert.match(ts, /\.\.\.parametros\(filtros, ventana\), \.\.\.parametrosModo\('replay', ejec\.run_id\)/);
});
