// Netlify Function «api»: intermediario de SOLO LECTURA entre el panel público (Netlify) y la API del Observatorio (FastAPI detrás de ngrok). F8 · T042.
//
// Por qué existe: la web pública no debe pedir la clave de la API al visitante. La clave vive SOLO en variables de entorno privadas de Netlify
// (`API_CLAVE_ACCESO`, «Contains secret values») y esta función la añade en el servidor. El navegador nunca la ve: no está en el JavaScript, el HTML, las
// respuestas ni los registros. FastAPI sigue exigiéndola (no se toca): quien llame directamente al túnel sin clave recibe 401.
//
// Qué NO es: un proxy abierto. Solo atiende `GET` de TRES rutas exactas, con los parámetros que acepta la API, validados y acotados; el destino es
// FIJO (variable `API_UPSTREAM_URL`, https, sin ruta) y nunca depende de lo que envíe el visitante; no reenvía cabeceras, cookies ni redirecciones del cliente.
//
// Variables de entorno (se configuran en la interfaz de Netlify, nunca en el repositorio ni en `netlify.toml`, que no llega a las funciones):
//   API_UPSTREAM_URL   origen https de la API, p. ej. https://<dominio>.ngrok-free.dev   (sin barra final ni ruta)
//   API_CLAVE_ACCESO   la misma clave que exige FastAPI (>= 32 caracteres [A-Za-z0-9_-])

const RUTAS = Object.freeze({
  '/api/eventos': Object.freeze(['start', 'end', 'min_mag', 'country_id', 'fuente', 'limit', 'offset', 'mode', 'run']),
  '/api/estadisticas': Object.freeze(['start', 'end', 'min_mag', 'country_id', 'fuente', 'mode', 'run']),
  '/api/salud': Object.freeze(['mode', 'run']),
});
const MAX_VALOR = 64;                 // caracteres por valor de parámetro (las fechas ISO miden 24)
const MAX_CONSULTA = 600;             // caracteres de la cadena de consulta completa
const VALOR_VALIDO = /^[A-Za-z0-9_.:+-]+$/;
const MAX_RESPUESTA = 5 * 1024 * 1024; // 5 MB: por debajo del límite de 6 MB de las funciones de Netlify
const TIMEOUT_MS = 8000;               // el panel usa 15 s; la función responde antes y deja un margen
const ORIGEN_VALIDO = /^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$/;
const CLAVE_VALIDA = /^[A-Za-z0-9_-]{32,}$/;

/** Cabeceras de TODAS las respuestas de la función: sin caché de navegador, sin CORS (solo mismo origen), sin adivinar tipos. */
function cabeceras(extra = {}) {
  return {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extra,
  };
}

function json(estado, cuerpo, extra = {}) {
  return new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), {
    status: estado,
    headers: cabeceras({ 'Content-Type': 'application/json; charset=utf-8', ...extra }),
  });
}

/** Error genérico: nunca incluye la URL de destino, la clave ni detalles internos. */
function error(estado, codigo, extra = {}) {
  return json(estado, { error: codigo }, extra);
}

/**
 * Valida y reconstruye la consulta: solo parámetros de la lista de la ruta, sin repetir, valores acotados y de caracteres seguros.
 * Devuelve `URLSearchParams` o `null` si algo no es válido.
 */
function consultaValida(url, permitidos) {
  if (url.search.length > MAX_CONSULTA) return null;
  const vistos = new Set();
  const limpia = new URLSearchParams();
  for (const [nombre, valor] of url.searchParams) {
    if (!permitidos.includes(nombre) || vistos.has(nombre)) return null;
    if (valor.length < 1 || valor.length > MAX_VALOR || !VALOR_VALIDO.test(valor)) return null;
    vistos.add(nombre);
    limpia.append(nombre, valor);
  }
  return limpia;
}

/** Destino y clave del servidor, o `null` si la configuración falta o no es válida (la función responde 503 sin dar detalles). */
function configuracion(leerEnv) {
  const origen = String(leerEnv('API_UPSTREAM_URL') ?? '').trim();
  const clave = String(leerEnv('API_CLAVE_ACCESO') ?? '').trim();
  if (!ORIGEN_VALIDO.test(origen) || !CLAVE_VALIDA.test(clave)) return null;
  return { origen, clave };
}

/**
 * Crea el manejador. `leerEnv` y `fetchFn` se inyectan para poder probarlo sin red; en producción son las variables de Netlify y `fetch`.
 */
export function crearManejador({ leerEnv, fetchFn = (...a) => fetch(...a), timeoutMs = TIMEOUT_MS } = {}) {
  return async function manejador(peticion) {
    if (peticion.method !== 'GET') return error(405, 'metodo_no_permitido', { Allow: 'GET' });
    let url;
    try { url = new URL(peticion.url); } catch { return error(400, 'peticion_no_valida'); }
    const permitidos = Object.hasOwn(RUTAS, url.pathname) ? RUTAS[url.pathname] : null;
    if (permitidos === null) return error(404, 'ruta_no_encontrada');
    const consulta = consultaValida(url, permitidos);
    if (consulta === null) return error(400, 'parametros_no_validos');
    const cfg = configuracion(leerEnv);
    if (cfg === null) return error(503, 'servicio_no_configurado');

    const destino = `${cfg.origen}${url.pathname}${consulta.size > 0 ? `?${consulta}` : ''}`;
    let respuesta;
    try {
      respuesta = await fetchFn(destino, {
        method: 'GET',
        redirect: 'manual',                  // nunca se sigue una redirección del origen
        signal: AbortSignal.timeout(timeoutMs),
        headers: {                           // SOLO estas cabeceras: nada del visitante (cookies, Authorization, Origin, Referer, X-Forwarded-*…)
          'X-Observatorio-Clave': cfg.clave,
          'ngrok-skip-browser-warning': '1',
          'Accept': 'application/json',
          'User-Agent': 'observatorio-netlify-function',
        },
      });
    } catch {
      return error(504, 'api_no_disponible');
    }

    const tipo = String(respuesta.headers.get('content-type') ?? '').toLowerCase();
    const declarado = Number(respuesta.headers.get('content-length') ?? 0);
    if (declarado > MAX_RESPUESTA) return error(502, 'respuesta_no_valida');
    let cuerpo;
    try { cuerpo = await respuesta.text(); } catch { return error(504, 'api_no_disponible'); }
    if (cuerpo.length > MAX_RESPUESTA) return error(502, 'respuesta_no_valida');
    const esJson = tipo.includes('application/json');

    if (respuesta.status === 200 && esJson) return json(200, cuerpo);
    // 422 y 503 de la API (parámetros inválidos, base no disponible) llevan un JSON propio de la API sin secretos y el panel sabe mostrarlos.
    if ((respuesta.status === 422 || respuesta.status === 503) && esJson) return json(respuesta.status, cuerpo);
    // 401/403: la clave del servidor no es aceptada → no se devuelve 401 (el panel pediría una clave al visitante); es un fallo del servidor.
    if (respuesta.status === 401 || respuesta.status === 403) { console.error('api: el origen rechazó la clave del servidor'); return error(502, 'acceso_al_origen_rechazado'); }
    // 404 HTML de ngrok («endpoint offline»), 3xx, 5xx, tipos inesperados…
    return error(502, 'api_no_disponible');
  };
}

const leerEntorno = (nombre) => globalThis.Netlify?.env?.get?.(nombre) ?? process.env[nombre];
export default crearManejador({ leerEnv: leerEntorno });

/**
 * Rutas, método y límite de uso por visitante. El límite de Netlify en planes gratuitos cuenta por dominio e IP (no es un tope global).
 * IMPORTANTE: este objeto debe ser un LITERAL (sin `Object.keys(...)` ni variables): la CLI de Netlify lo lee por análisis estático al empaquetar la función;
 * si no puede leerlo, ignora `path` y la función queda sin ruta pública (comprobado en la primera publicación de T043). Un test comprueba que coincide con RUTAS.
 */
export const config = {
  path: ['/api/eventos', '/api/estadisticas', '/api/salud'],
  method: ['GET'],
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
