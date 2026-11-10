// Proxy EXCLUSIVO de desarrollo local (F7). Solo lo carga `ng serve --configuration local` (npm run start:local); no forma parte del build ni de Netlify.
// El navegador habla con http://localhost:4200 y este proxy reenvía a la API local (127.0.0.1) añadiendo la cabecera de clave EN EL SERVIDOR:
// la clave nunca llega al JavaScript, a config.json, a los logs ni al almacenamiento del navegador. FastAPI sigue exigiendo la clave (sin excepciones).
//
// Defensa por listas cerradas (no depende solo de la cabecera Host):
//   · destino FIJO: http://127.0.0.1:<puerto>; la clave solo viaja a ese destino (el puerto sale de API_PUERTO, validado como entero).
//   · rutas FIJAS: solo GET/HEAD de /api/eventos, /api/estadisticas y /api/salud (sin `%`, `..`, barras dobles ni otras rutas).
//   · cualquier otra ruta o método → 404 sin llegar a la API; peticiones con rastro de túnel/proxy inverso o `Sec-Fetch-Site` cruzado → 403.
//   · la cabecera de clave que envíe el cliente se descarta y se sustituye por la del servidor.
import { readFileSync } from 'node:fs';

const CABECERA_CLAVE = 'X-Observatorio-Clave';
const RUTAS = /^\/api\/(eventos|estadisticas|salud)$/;
const METODOS = new Set(['GET', 'HEAD']);
const HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Lee `NOMBRE` del entorno o del .env privado de la raíz (ignorado por git). Nunca se muestra su valor. */
function leerPrivado(nombre) {
  if (process.env[nombre]) return process.env[nombre];
  try {
    const texto = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    for (const linea of texto.split(/\r?\n/)) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[1] === nombre) return m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch { /* sin .env: el formulario de clave seguirá funcionando */ }
  return '';
}

const clave = leerPrivado('API_CLAVE_ACCESO');
const puertoTexto = leerPrivado('API_PUERTO') || '8000';
const puerto = /^\d{2,5}$/.test(puertoTexto) && +puertoTexto >= 1024 && +puertoTexto <= 65535 ? +puertoTexto : 8000;
const DESTINO = `http://127.0.0.1:${puerto}`;

console.log(clave
  ? `[proxy local] activo: /api → ${DESTINO} con la clave del servidor (no se muestra ni se envía al navegador).`
  : '[proxy local] AVISO: no hay API_CLAVE_ACCESO en el entorno ni en .env; la API pedirá la clave en el formulario.');

/** Devuelve true si la petición se puede reenviar; si no, responde y devuelve false. */
function permitida(req, res) {
  const url = req.url ?? '';
  const ruta = url.split('?')[0];
  if (!METODOS.has(req.method ?? '') || !RUTAS.test(ruta)) { res.statusCode = 404; res.end(); return false; }
  const h = req.headers;
  const host = String(h.host ?? '').replace(/:\d+$/, '');
  const rastroDeTunel = ['x-forwarded-for', 'x-forwarded-host', 'forwarded', 'via', 'ngrok-trace-id', 'x-original-host'].some((n) => n in h);
  const cruzada = h['sec-fetch-site'] !== undefined && !['same-origin', 'none'].includes(String(h['sec-fetch-site']));
  if (!HOSTS.has(host) || rastroDeTunel || cruzada) { res.statusCode = 403; res.end(); return false; }
  return true;
}

export default {
  '/api': {
    target: DESTINO,
    changeOrigin: false,
    secure: false,
    bypass: (req, res) => (permitida(req, res) ? undefined : false),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        for (const n of ['x-observatorio-clave', 'cookie', 'authorization', 'origin', 'referer']) proxyReq.removeHeader(n);
        if (clave) proxyReq.setHeader(CABECERA_CLAVE, clave);
      });
      proxy.on('error', (err, _req, res) => { // sin cabeceras ni valores: solo el código del error
        console.error(`[proxy local] la API local no responde (${err.code ?? 'error'}).`);
        if (res && 'writeHead' in res && !res.headersSent) { res.writeHead(502); res.end(); }
      });
    },
  },
};
