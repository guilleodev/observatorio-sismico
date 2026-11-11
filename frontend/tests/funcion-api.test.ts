// Netlify Function «api» (F8 · T042): intermediario de solo lectura con la clave en el servidor. `node --test tests/*.test.ts`. Sin red: `fetch` y las variables se inyectan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearManejador, config } from '../netlify/functions/api.mjs';
import { erroresDeConfig } from '../src/app/actualizacion.ts';

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8');
const SITIO = 'https://observatorio-sismico.netlify.app';
const ORIGEN = 'https://ejemplo-de-prueba.ngrok-free.dev';
const CLAVE = 'K'.repeat(8) + 'abcdefghijklmnopqrstuvwxyz_-0123456789'; // valor FALSO de prueba, de 46 caracteres

type Llamada = { url: string; init: RequestInit & { headers: Record<string, string> } };
function banco(respuesta: () => Response | Promise<Response> = () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
  env: Record<string, string | undefined> = { API_UPSTREAM_URL: ORIGEN, API_CLAVE_ACCESO: CLAVE }) {
  const llamadas: Llamada[] = [];
  const fetchFn = async (url: string, init: Llamada['init']) => { llamadas.push({ url, init }); return respuesta(); };
  const manejador = crearManejador({ leerEnv: (n: string) => env[n], fetchFn: fetchFn as unknown as typeof fetch, timeoutMs: 50 });
  const pedir = (ruta: string, init: RequestInit = {}) => manejador(new Request(SITIO + ruta, init));
  return { llamadas, pedir };
}
const texto = async (r: Response) => await r.text();

test('GET de las tres rutas permitidas: la función añade la clave y el destino es el origen configurado', async () => {
  for (const ruta of ['/api/eventos', '/api/estadisticas', '/api/salud']) {
    const b = banco();
    const r = await b.pedir(ruta);
    assert.equal(r.status, 200, ruta);
    assert.equal(b.llamadas.length, 1);
    assert.equal(b.llamadas[0].url, ORIGEN + ruta);
    assert.equal(b.llamadas[0].init.headers['X-Observatorio-Clave'], CLAVE);
    assert.equal(b.llamadas[0].init.method, 'GET');
    assert.equal(b.llamadas[0].init.redirect, 'manual');
  }
});

test('la consulta del panel (periodo, magnitud, país, paginación y modo) se reenvía íntegra y validada', async () => {
  const b = banco();
  const q = 'start=2026-11-10T17%3A31%3A47.477Z&end=2026-11-11T17%3A31%3A47.477Z&min_mag=4.5&country_id=USA&limit=1000&offset=0&mode=replay&run=r-f6-estab-11082023';
  const r = await b.pedir('/api/eventos?' + q);
  assert.equal(r.status, 200);
  const enviado = new URL(b.llamadas[0].url);
  assert.equal(enviado.origin, ORIGEN);
  assert.equal(enviado.pathname, '/api/eventos');
  assert.equal(enviado.searchParams.get('start'), '2026-11-10T17:31:47.477Z');
  assert.equal(enviado.searchParams.get('country_id'), 'USA');
  assert.equal(enviado.searchParams.get('run'), 'r-f6-estab-11082023');
  assert.equal([...enviado.searchParams].length, 8);
});

test('rutas no permitidas: 404 sin llamar a la API (otras rutas, barra final, /docs, /.env, recorridos de directorio, ruta absoluta)', async () => {
  for (const ruta of ['/api', '/api/', '/api/eventos/', '/api/otro', '/docs', '/openapi.json', '/.env', '/admin', '/api/../.env','/api/eventos%2F..%2Fsalud', '//evil.example/api/salud', '/']) {
    const b = banco();
    const r = await b.pedir(ruta);
    assert.ok([404].includes(r.status), `${ruta} → ${r.status}`);
    assert.equal(b.llamadas.length, 0, ruta);
  }
});

test('solo se acepta GET: POST, PUT, PATCH, DELETE, OPTIONS y HEAD dan 405 sin llamar a la API', async () => {
  for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
    const b = banco();
    const r = await b.pedir('/api/salud', { method: metodo });
    assert.equal(r.status, 405, metodo);
    assert.equal(r.headers.get('allow'), 'GET');
    assert.equal(b.llamadas.length, 0);
  }
});

test('parámetros: los desconocidos, repetidos, vacíos, demasiado largos o con caracteres raros se rechazan (400) sin llamar a la API', async () => {
  const malos = [
    '/api/salud?x=1', '/api/salud?mode=replay&mode=live', '/api/salud?mode=', '/api/eventos?url=https://evil.example', '/api/eventos?host=evil.example',
    '/api/estadisticas?limit=10', '/api/salud?run=' + 'a'.repeat(65), '/api/eventos?min_mag=4.5;DROP', '/api/eventos?country_id=US%20A', '/api/eventos?start=%3Cscript%3E',
    '/api/eventos?run=../../etc/passwd', '/api/eventos?start=' + 'x'.repeat(700), '/api/eventos?mode=replay%0d%0aX-Evil:1', '/api/eventos?__proto__=1', '/api/eventos?constructor=1',
  ];
  for (const ruta of malos) {
    const b = banco();
    const r = await b.pedir(ruta);
    assert.equal(r.status, 400, ruta);
    assert.equal(b.llamadas.length, 0, ruta);
  }
});

test('el destino nunca lo decide el visitante: ni Host, ni X-Forwarded-Host, ni cabeceras ni parámetros cambian el origen', async () => {
  const b = banco();
  await b.pedir('/api/salud?mode=replay', { headers: { Host: 'evil.example', 'X-Forwarded-Host': 'evil.example', 'X-Original-URL': 'https://evil.example/x', Origin: 'https://evil.example', Referer: 'https://evil.example/' } });
  assert.equal(b.llamadas.length, 1);
  assert.ok(b.llamadas[0].url.startsWith(ORIGEN + '/api/salud'));
  assert.equal(new URL(b.llamadas[0].url).host, new URL(ORIGEN).host);
});

test('no se reenvía nada del visitante: la clave que envíe, cookies y Authorization se descartan; solo salen las cabeceras fijas de la función', async () => {
  const b = banco();
  await b.pedir('/api/salud', { headers: { 'X-Observatorio-Clave': 'clave-del-visitante', Cookie: 'sesion=1', Authorization: 'Bearer abc', 'X-Forwarded-For': '1.2.3.4' } });
  const h = b.llamadas[0].init.headers;
  assert.deepEqual(Object.keys(h).sort(), ['Accept', 'User-Agent', 'X-Observatorio-Clave', 'ngrok-skip-browser-warning']);
  assert.equal(h['X-Observatorio-Clave'], CLAVE);
});

test('la clave NO aparece en la respuesta (cuerpo ni cabeceras) aunque la API la devolviera en el cuerpo o en una cabecera', async () => {
  const b = banco(() => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json', 'X-Observatorio-Clave': CLAVE, 'Set-Cookie': 'a=1', Server: 'uvicorn' } }));
  const r = await b.pedir('/api/salud');
  assert.equal(r.status, 200);
  assert.ok(!(await texto(r)).includes(CLAVE));
  for (const [k, v] of r.headers) assert.ok(!k.toLowerCase().includes('clave') && !v.includes(CLAVE) && k.toLowerCase() !== 'set-cookie' && k.toLowerCase() !== 'server', k);
});

test('la clave no se escribe en los registros (console.log/error/warn) ni en los errores', async () => {
  const guardados: unknown[][] = [];
  const originales = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  console.log = console.error = console.warn = console.info = (...a: unknown[]) => { guardados.push(a); };
  try {
    for (const estado of [401, 403, 404, 500, 502]) { const b = banco(() => new Response('x', { status: estado })); await b.pedir('/api/salud'); }
    const b = banco(() => { throw new Error(`fallo con ${CLAVE}`); });
    const r = await b.pedir('/api/salud');
    assert.ok(!(await texto(r)).includes(CLAVE));
  } finally { Object.assign(console, originales); }
  assert.ok(!JSON.stringify(guardados).includes(CLAVE));
});

test('respuestas de la API: 200 JSON se reenvía; 422 y 503 JSON con su estado; 401/403 → 502 (nunca 401 al visitante); 404 HTML de ngrok, 3xx, 5xx y tipos inesperados → 502', async () => {
  const j = (estado: number, c = '{"x":1}') => () => new Response(c, { status: estado, headers: { 'content-type': 'application/json' } });
  const casos: [() => Response, number, string?][] = [
    [j(200), 200, '{"x":1}'], [j(422, '{"error":"validacion"}'), 422], [j(503, '{"error":"no disponible"}'), 503],
    [j(401), 502], [j(403), 502], [j(500), 502], [j(404), 502],
    [() => new Response('<html>ERR_NGROK_3200</html>', { status: 404, headers: { 'content-type': 'text/html' } }), 502],
    [() => new Response('', { status: 302, headers: { location: 'https://evil.example/' } }), 502],
    [() => new Response('<html>hola</html>', { status: 200, headers: { 'content-type': 'text/html' } }), 502],
    [() => new Response('x'.repeat(10), { status: 200, headers: { 'content-type': 'application/json', 'content-length': String(6 * 1024 * 1024) } }), 502],
  ];
  for (const [resp, esperado, cuerpo] of casos) {
    const b = banco(resp);
    const r = await b.pedir('/api/estadisticas');
    assert.equal(r.status, esperado);
    if (cuerpo) assert.equal(await texto(r), cuerpo);
    if (esperado === 502) assert.match(await texto(r), /"error":"(api_no_disponible|acceso_al_origen_rechazado|respuesta_no_valida)"/);
  }
});

test('fallo de red y tiempo de espera agotado → 504 con un código genérico (sin URL ni detalles)', async () => {
  const caida = banco(() => { throw new TypeError(`fetch failed ${ORIGEN}`); });
  const r1 = await caida.pedir('/api/salud');
  assert.equal(r1.status, 504);
  assert.equal(await texto(r1), '{"error":"api_no_disponible"}');
  const manejador = crearManejador({ leerEnv: (n: string) => ({ API_UPSTREAM_URL: ORIGEN, API_CLAVE_ACCESO: CLAVE } as Record<string, string>)[n], fetchFn: ((_u: string, init: RequestInit) => new Promise((_ok, ko) => init.signal!.addEventListener('abort', () => ko(new Error('abort'))))) as unknown as typeof fetch, timeoutMs: 30 });
  const r2 = await manejador(new Request(SITIO + '/api/salud'));
  assert.equal(r2.status, 504);
});

test('configuración inválida o ausente → 503 genérico y sin llamar a la API (origen no https, con ruta, local; clave corta o con caracteres raros)', async () => {
  const entornos: Record<string, string | undefined>[] = [
    {}, { API_UPSTREAM_URL: ORIGEN }, { API_CLAVE_ACCESO: CLAVE },
    { API_UPSTREAM_URL: 'http://ejemplo.ngrok-free.dev', API_CLAVE_ACCESO: CLAVE },
    { API_UPSTREAM_URL: ORIGEN + '/api', API_CLAVE_ACCESO: CLAVE }, { API_UPSTREAM_URL: ORIGEN + '/', API_CLAVE_ACCESO: CLAVE },
    { API_UPSTREAM_URL: 'https://user@evil.example', API_CLAVE_ACCESO: CLAVE }, { API_UPSTREAM_URL: 'https://localhost:8000', API_CLAVE_ACCESO: CLAVE + '!' },
    { API_UPSTREAM_URL: ORIGEN, API_CLAVE_ACCESO: 'corta' }, { API_UPSTREAM_URL: ORIGEN, API_CLAVE_ACCESO: CLAVE + ' ;x' },
  ];
  for (const env of entornos) {
    const b = banco(undefined, env);
    const r = await b.pedir('/api/salud');
    assert.equal(r.status, 503, JSON.stringify(Object.keys(env)));
    assert.equal(await texto(r), '{"error":"servicio_no_configurado"}');
    assert.equal(b.llamadas.length, 0);
  }
});

test('todas las respuestas llevan no-store, nosniff y sin cabeceras CORS (solo mismo origen)', async () => {
  for (const ruta of ['/api/salud', '/api/otro', '/api/salud?x=1']) {
    const r = await banco().pedir(ruta);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  }
});

test('configuración de la función: solo esas tres rutas, solo GET y límite por visitante', () => {
  assert.deepEqual([...config.path].sort(), ['/api/estadisticas', '/api/eventos', '/api/salud']);
  assert.deepEqual(config.method, ['GET']);
  assert.ok(config.rateLimit.windowLimit >= 30 && config.rateLimit.windowLimit <= 120);
  assert.ok(config.rateLimit.windowSize <= 180);
  assert.deepEqual(config.rateLimit.aggregateBy, ['ip', 'domain']);
});

test('`config` es un literal estático (la CLI de Netlify lo lee por análisis estático): path, method y rateLimit sin expresiones y coherentes con las rutas permitidas', () => {
  const fuente = leer('../netlify/functions/api.mjs').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const bloque = fuente.slice(fuente.indexOf('export const config'));
  assert.match(bloque, /path: \['\/api\/eventos', '\/api\/estadisticas', '\/api\/salud'\]/);
  assert.match(bloque, /method: \['GET'\]/);
  assert.match(bloque, /rateLimit: \{ windowLimit: \d+, windowSize: \d+, aggregateBy: \['ip', 'domain'\] \}/);
  assert.ok(!/Object\.|\.\.\.|\(/.test(bloque), 'sin llamadas ni propagaciones dentro de config');
  const rutas = [...fuente.matchAll(/'(\/api\/[a-z]+)': Object\.freeze/g)].map((m) => m[1]).sort();
  assert.deepEqual(rutas, [...config.path].sort());
});

test('el código fuente de la función no contiene dominios, claves ni lecturas de archivos y solo usa las dos variables previstas', () => {
  const fuente = leer('../netlify/functions/api.mjs');
  assert.ok(!/ngrok-free\.(dev|app)|netlify\.app|grandpa|127\.0\.0\.1|localhost/.test(fuente.replace(/\/\/.*$/gm, '').replace(/'ngrok-skip-browser-warning'/g, '')), 'sin dominios fijos');
  assert.ok(!/[A-Za-z0-9_-]{40,}/.test(fuente.replace(/\/\/.*$/gm, '')), 'sin cadenas largas que parezcan secretos');
  assert.ok(!/readFile|\bfs\b|require\(|dotenv/.test(fuente.replace(/\/\/.*$/gm, '')), 'no lee archivos');
  assert.deepEqual([...new Set([...fuente.matchAll(/'(API_[A-Z_]+)'/g)].map((m) => m[1]))].sort(), ['API_CLAVE_ACCESO', 'API_UPSTREAM_URL']);
  assert.match(fuente, /redirect: 'manual'/);
  assert.match(fuente, /AbortSignal\.timeout/);
  assert.ok(!/console\.(log|info|debug)\(/.test(fuente), 'sin registros informativos');
  assert.ok(!/\bAccess-Control-Allow/i.test(fuente.replace(/\/\/.*$/gm, '')), 'sin CORS');
});

test('el config.json público de la versión con función (mismo origen, 60 s, sin clave) es válido para el panel y no contiene la URL del túnel', () => {
  const publico = { mode: 'api', apiUrl: SITIO, refreshMs: 60000, skipNgrokWarning: false, pausarSiOculta: true };
  assert.deepEqual(erroresDeConfig(publico), []);
  assert.ok(!JSON.stringify(publico).includes('ngrok'));
  assert.ok(erroresDeConfig({ ...publico, clave: 'x' }).length > 0, 'una clave en config.json sigue prohibida');
});

test('script de preparación de la versión con función: no publica, no abre túneles, comprueba clave y túnel fuera de los artefactos y restaura config.json', () => {
  const s = leer('../../scripts/f8/preparar-netlify-funcion.sh');
  assert.match(s, /NO publica/);
  assert.ok(!/netlify (deploy|login)|ngrok http|docker compose (up|down|restart|stop)/.test(s.replace(/^\s*#.*$/gm, '').replace(/printf[^\n]*\n/g, '').replace(/echo[^\n]*\n/g, '')), 'no ejecuta despliegues ni túneles ni Docker');
  assert.match(s, /"refreshMs": 60000|REFRESH_MS=60000/);
  assert.match(s, /API_CLAVE_ACCESO/);
  assert.match(s, /trap restaurar EXIT/);
  assert.match(s, /sha256sum/);
});
