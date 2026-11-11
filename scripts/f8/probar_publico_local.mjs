// Prueba LOCAL de la arquitectura pública (F8 · T042): sirve el build público con la MISMA función de Netlify y la conecta con la API LOCAL (127.0.0.1:8000),
// sin Netlify ni ngrok. Solo lectura: la función solo hace GET de tres rutas; no escribe datos ni toca Docker.
// La clave se lee del .env EN MEMORIA, solo para la función (como haría la variable privada de Netlify); no se imprime, no se escribe en ningún archivo.
// Uso:   node scripts/f8/probar_publico_local.mjs --autotest              (comprobaciones automáticas y salida)
//        node scripts/f8/probar_publico_local.mjs [--puerto 8789]       (sirve http://127.0.0.1:8789 hasta Ctrl+C, para abrirlo en un navegador)
//        --dir <carpeta>  build a servir (por defecto frontend/dist/publico-netlify-f7-funcion; se genera con scripts/f8/preparar-netlify-funcion.sh)
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const AUTOTEST = process.argv.includes('--autotest');
const PUERTO = Number(arg('--puerto', '8789'));
const DIR = resolve(RAIZ, arg('--dir', 'frontend/dist/publico-netlify-f7-funcion'));
if (!Number.isInteger(PUERTO) || PUERTO < 1024 || PUERTO > 65535) { console.error('puerto no válido'); process.exit(2); }
if (!existsSync(join(DIR, 'index.html'))) { console.error('No hay build en ' + DIR + ' (ejecuta scripts/f8/preparar-netlify-funcion.sh)'); process.exit(2); }

const env = readFileSync(join(RAIZ, '.env'), 'utf8');
const leer = (n) => (env.match(new RegExp('^' + n + '=(.*)$', 'm')) ?? [])[1]?.trim().replace(/^['"]|['"]$/g, '');
const CLAVE = leer('API_CLAVE_ACCESO');
const PUERTO_API = Number(leer('API_PUERTO') || 8000);
if (!CLAVE) { console.error('No hay API_CLAVE_ACCESO en el .env'); process.exit(2); }
const PLACEHOLDER = 'https://api-local-de-prueba.ngrok-free.dev'; // solo para pasar la validación de la función; el fetch se redirige a la API local

const cuentas = {};      // peticiones a la API por ruta (para medir cuántas hace la función por ciclo)
let sinClaveEnviada = 0;
const fetchLocal = async (url, init) => {
  const u = new URL(url);
  if (u.origin !== PLACEHOLDER) throw new Error('destino inesperado'); // la función solo debe llamar a su origen configurado
  cuentas[u.pathname] = (cuentas[u.pathname] ?? 0) + 1;
  if (!init.headers?.['X-Observatorio-Clave']) sinClaveEnviada++;
  return fetch(`http://127.0.0.1:${PUERTO_API}${u.pathname}${u.search}`, init);
};
const { crearManejador } = await import(pathToFileURL(join(RAIZ, 'frontend/netlify/functions/api.mjs')).href);
const funcion = crearManejador({ leerEnv: (n) => ({ API_UPSTREAM_URL: PLACEHOLDER, API_CLAVE_ACCESO: CLAVE })[n], fetchFn: fetchLocal });

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.geojson': 'application/geo+json', '.png': 'image/png' };
const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${PUERTO}`);
    if (url.pathname.startsWith('/api/')) {                       // = lo que hace Netlify con la función (config.path)
      const r = await funcion(new Request(url, { method: req.method, headers: { host: req.headers.host ?? '' } }));
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
      if (!AUTOTEST) console.log(`${req.method} ${url.pathname} → ${r.status}`);
      return;
    }
    if (url.pathname === '/config.json') {                         // el config público de Netlify apunta a su propio origen; aquí, al servidor local
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ mode: 'api', apiUrl: `http://127.0.0.1:${PUERTO}`, refreshMs: 60000, skipNgrokWarning: false, pausarSiOculta: true }));
      return;
    }
    let ruta = join(DIR, decodeURIComponent(url.pathname));
    if (!ruta.startsWith(DIR) || !existsSync(ruta) || !statSync(ruta).isFile()) ruta = join(DIR, 'index.html'); // SPA, como _redirects
    res.writeHead(200, { 'Content-Type': TIPOS[extname(ruta)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(ruta));
  } catch { res.writeHead(500); res.end(); }
});

await new Promise((ok) => servidor.listen(PUERTO, '127.0.0.1', ok));
const base = `http://127.0.0.1:${PUERTO}`;
console.log(`Servidor local de la versión pública en ${base} (solo 127.0.0.1). Función → API local :${PUERTO_API}. Clave: leída del .env (no se muestra).`);

if (!AUTOTEST) { console.log('Ctrl+C para cerrar. Recuento de peticiones a la API por ruta (cada 60 s):'); setInterval(() => console.log(' ', JSON.stringify(cuentas)), 60000); }
else {
  let fallos = 0;
  const ok = (n, c, d = '') => { console.log(`  ${c ? 'OK   ' : 'FALLA'} ${n} ${d}`); if (!c) fallos++; };
  const pide = async (ruta, init = {}) => { const r = await fetch(base + ruta, init); const t = await r.text(); return { r, t }; };
  const sinClave = (x) => !x.t.includes(CLAVE) && ![...x.r.headers].some(([k, v]) => v.includes(CLAVE) || /clave/i.test(k));
  const config = await pide('/config.json');
  ok('config.json público: mismo origen, 60 s y sin clave ni URL de túnel', !config.t.includes(CLAVE) && JSON.parse(config.t).refreshMs === 60000 && !/ngrok/.test(config.t));
  const index = await pide('/');
  ok('la página principal se sirve sin la clave', index.r.status === 200 && index.t.includes('<app-root') && sinClave(index));
  const js = await pide((index.t.match(/src="(main-[A-Z0-9]+\.js)"/) ?? [])[1] ? '/' + index.t.match(/src="(main-[A-Z0-9]+\.js)"/)[1] : '/main.js');
  ok('el JavaScript principal no contiene la clave', js.r.status === 200 && !js.t.includes(CLAVE));
  const salud = await pide('/api/salud'); ok('GET /api/salud sin clave del visitante → 200 status ok', salud.r.status === 200 && JSON.parse(salud.t).status === 'ok' && sinClave(salud), `(${salud.r.status})`);
  const ev = await pide('/api/eventos?limit=3'); ok('GET /api/eventos → FeatureCollection live', ev.r.status === 200 && JSON.parse(ev.t).type === 'FeatureCollection' && sinClave(ev), `(${ev.r.status})`);
  const est = await pide('/api/estadisticas'); ok('GET /api/estadisticas → 200', est.r.status === 200 && sinClave(est), `(${est.r.status})`);
  const rep = await pide('/api/eventos?mode=replay&limit=2'); ok('REPRODUCCIÓN: mode=replay → 200 y modo replay', rep.r.status === 200 && JSON.parse(rep.t).metadata?.mode === 'replay');
  const mal = await pide('/api/eventos?mode=otro'); ok('parámetro inválido: la API responde 422 y la función lo reenvía', mal.r.status === 422 && sinClave(mal), `(${mal.r.status})`);
  ok('POST /api/eventos → 405', (await pide('/api/eventos', { method: 'POST' })).r.status === 405);
  ok('ruta no permitida /api/otro → 404', (await pide('/api/otro')).r.status === 404);
  ok('parámetro desconocido → 400 (no llega a la API)', (await pide('/api/salud?x=1')).r.status === 400);
  ok('la clave que envíe el visitante se ignora (se usa la del servidor)', (await pide('/api/salud', { headers: { 'X-Observatorio-Clave': 'incorrecta-del-visitante' } })).r.status === 200);
  ok('las respuestas no llevan CORS (solo mismo origen)', salud.r.headers.get('access-control-allow-origin') === null);
  const directa = await fetch(`http://127.0.0.1:${PUERTO_API}/api/salud`);
  ok('FastAPI sigue exigiendo la clave: la API sin clave → 401', directa.status === 401, `(${directa.status})`);
  ok('la función envió siempre la clave del servidor a la API', sinClaveEnviada === 0);
  console.log('\nPeticiones que la función hizo a la API (por ruta):', JSON.stringify(cuentas), '| sin OPTIONS: la función las hace del lado del servidor');
  console.log(`\nRESULTADO: ${fallos === 0 ? 'OK' : fallos + ' FALLOS'}`);
  servidor.close(); process.exit(fallos === 0 ? 0 : 1);
}
