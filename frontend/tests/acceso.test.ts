// Clave de acceso de la API publicada (F6, 6.6, FR-041): el panel la pide, la guarda SOLO en memoria y la envía por cabecera. `node --test tests/*.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ApiService, ErrorApi, CABECERA_CLAVE } from '../src/app/api.service.ts';
import { avisos, estadoGeneral } from '../src/app/estado.ts';

const CLAVE = 'clave-de-prueba-ficticia-0123456789-abcdef';
const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

function cliente(estados: number[] = [200]) {
  const llamadas: { url: string; headers: Record<string, string> }[] = [];
  let i = 0;
  const fetchFn = (async (url: string, init: RequestInit) => {
    llamadas.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
    const estado = estados[Math.min(i++, estados.length - 1)];
    const cuerpo = estado === 401 ? { error: 'no_autorizado', detail: 'La API exige una clave de acceso válida.' } : { status: 'ok', database: 'ok', last_ingestion: 1 };
    return { ok: estado < 400, status: estado, json: async () => cuerpo } as Response;
  }) as unknown as typeof fetch;
  return { api: new ApiService('https://grandpa-bunkbed-spree.ngrok-free.dev', { fetchFn, omitirAvisoNgrok: true }), llamadas };
}

test('sin clave no se envía la cabecera; con clave se envía en TODAS las peticiones, también en reproducción', async () => {
  const { api, llamadas } = cliente();
  await api.salud();
  assert.equal(CABECERA_CLAVE in llamadas[0].headers, false);
  api.establecerClave(CLAVE);
  assert.equal(api.tieneClave(), true);
  await api.salud();
  await api.salud(undefined, { mode: 'replay' });
  await api.obtener('/api/eventos', { mode: 'replay', run: 'r-f6-prueba-b' });
  await api.obtener('/api/estadisticas', {});
  for (const l of llamadas.slice(1)) assert.equal(l.headers[CABECERA_CLAVE], CLAVE);
  assert.equal(llamadas.length, 5);
});

test('la clave NUNCA viaja en la URL', async () => {
  const { api, llamadas } = cliente();
  api.establecerClave(CLAVE);
  await api.salud(undefined, { mode: 'replay', run: 'r-a' });
  await api.obtener('/api/eventos', { start: 'a', end: 'b', min_mag: '4' });
  for (const l of llamadas) assert.equal(l.url.includes(CLAVE) || /clave|key/i.test(l.url), false);
});

test('establecerClave(null) la olvida: las peticiones siguientes salen sin cabecera', async () => {
  const { api, llamadas } = cliente();
  api.establecerClave(CLAVE);
  api.establecerClave(null);
  assert.equal(api.tieneClave(), false);
  await api.salud();
  assert.equal(CABECERA_CLAVE in llamadas[0].headers, false);
});

test('un 401 es un error propio de autorización (ni «sin conexión» ni «filtros rechazados»)', async () => {
  const { api } = cliente([401]);
  await assert.rejects(() => api.salud(), (e: unknown) => e instanceof ErrorApi && e.tipo === 'autorizacion' && e.estado === 401);
  const { api: otro } = cliente([403]);
  await assert.rejects(() => otro.salud(), (e: unknown) => e instanceof ErrorApi && e.tipo === 'servidor');
});

test('el panel explica que falta la clave y no la confunde con una caída', () => {
  const base = { error: { tipo: 'autorizacion', mensaje: 'x' }, salud: null, hayLectura: false, edadLecturaMs: null, cargados: 0, total: null, siguiente: null, recuperadoEn: null };
  const lista = avisos(base as never);
  assert.equal(lista[0].codigo, 'acceso-denegado');
  assert.equal(lista[0].rol, 'alert');
  assert.match(lista[0].texto, /clave de acceso/);
  assert.match(lista[0].texto, /memoria de esta pestaña/);
  assert.doesNotMatch(lista.map((a) => a.texto).join(' '), /Revisa API, túnel y CORS|Se reintenta automáticamente/);
  assert.match(estadoGeneral(base as never).texto, /Acceso restringido/);
  assert.equal(avisos({ ...base, error: { tipo: 'red', mensaje: 'x' } } as never)[0].codigo, 'sin-conexion');   // lo demás no cambia
});

// --- memoria solamente ------------------------------------------------------------------------------------------------------

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? fuentes(p) : /\.(ts|html)$/.test(n) ? [p] : []; });
}

test('ningún código de la aplicación usa localStorage, sessionStorage, cookies ni IndexedDB', () => {
  const dir = new URL('../src/app', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  for (const f of fuentes(decodeURIComponent(dir))) {
    const t = readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /localStorage|sessionStorage|document\.cookie|indexedDB|caches\./, f);
  }
});

test('la clave no se escribe en registros ni en la configuración, y el campo no la guarda el navegador', () => {
  const todo = fuentes(decodeURIComponent(new URL('../src/app', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))).map((f) => readFileSync(f, 'utf8')).join('\n');
  assert.doesNotMatch(todo, /console\.(log|info|warn|error|debug)\([^)]*clave/i);
  const acceso = leer('../src/app/acceso/acceso.component.ts');
  assert.match(acceso, /type="password"/);
  assert.match(acceso, /autocomplete="off"/);
  assert.match(acceso, /spellcheck="false"/);
  assert.doesNotMatch(leer('../public/config.json'), /clave|key|token/i);
});

test('la aplicación pide la clave ante un 401, no reintenta en bucle y olvida la rechazada', () => {
  const ts = leer('../src/app/app.component.ts');
  assert.match(ts, /\.tipo === 'autorizacion'/);
  assert.match(ts, /this\.api\??\.establecerClave\(null\)/);
  assert.match(ts, /enviarClave\(/);
  assert.match(ts, /if \(this\.pideClave\(\)\) return;|!this\.pideClave\(\)/);       // sin clave no se programa otra consulta automática
  assert.match(ts, /this\.pideClave\(\) \? 'REPRODUCCIÓN · acceso restringido/);   // en replay sin clave no se afirma «sin ejecuciones»
  const html = leer('../src/app/app.component.html');
  assert.match(html, /<app-acceso/);
  assert.match(html, /pideClave\(\)/);
});
