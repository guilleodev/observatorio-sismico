// F8: segunda fuente en vivo (EMSC). Filtro `fuente`, fila «Fuente» de la ficha y permiso de la función de Netlify. `node --test tests/*.test.ts`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FUENTES, estadoInicial, fuenteValida, parametros, resolverVentana, resumen } from '../src/app/filtros.ts';
import { filasFicha, nombreFuente } from '../src/app/formato.ts';
import { crearManejador } from '../netlify/functions/api.mjs';

const GENERATED = Date.UTC(2026, 10, 16, 17, 0, 0);
const ventana = () => resolverVentana(estadoInicial(), GENERATED);

test('sin fuente elegida no se envía el parámetro (comportamiento anterior intacto)', () => {
  assert.equal('fuente' in parametros(estadoInicial(), ventana()), false);
  assert.equal('fuente' in parametros({ ...estadoInicial(), fuente: undefined }, ventana()), false);
});

test('la fuente elegida viaja como parámetro y se normaliza; un valor desconocido se ignora', () => {
  assert.equal(parametros({ ...estadoInicial(), fuente: 'emsc' }, ventana())['fuente'], 'emsc');
  assert.equal(parametros({ ...estadoInicial(), fuente: ' USGS ' }, ventana())['fuente'], 'usgs');
  assert.equal('fuente' in parametros({ ...estadoInicial(), fuente: 'otra' }, ventana()), false);
  assert.deepEqual(FUENTES.map((f) => f.id), ['usgs', 'emsc']);
  assert.equal(fuenteValida(undefined), '');
});

test('el resumen de filtros nombra la fuente solo si hay una elegida', () => {
  assert.equal(resumen(estadoInicial()), 'últimas 24 h');
  assert.equal(resumen({ ...estadoInicial(), fuente: 'emsc' }), 'últimas 24 h · fuente EMSC');
});

test('la ficha añade la fila «Fuente» solo cuando el evento trae su origen', () => {
  const base = { place: 'x', mag: 3, time: 0, updated: 0 };
  const con = filasFicha({ ...base, source: 'emsc-fdsn' }, 10, 'emsc:1').filas.map((f) => [f.etiqueta, f.valor]);
  assert.deepEqual(con.find((f) => f[0] === 'Fuente'), ['Fuente', 'EMSC']);
  assert.equal(filasFicha(base, 10, 'us1').filas.some((f) => f.etiqueta === 'Fuente'), false);
  assert.equal(nombreFuente('usgs-fdsn-recuperacion'), 'USGS');
  assert.equal(nombreFuente(null), 'ND');
});

test('la función de Netlify deja pasar «fuente» en eventos y estadísticas pero no en salud', async () => {
  const llamadas: string[] = [];
  const manejador = crearManejador({
    leerEnv: (n: string) => (n === 'API_UPSTREAM_URL' ? 'https://api.example.com' : 'a'.repeat(40)),
    fetchFn: async (url: string) => { llamadas.push(url); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }); },
  });
  for (const ruta of ['/api/eventos', '/api/estadisticas']) assert.equal((await manejador(new Request(`https://x.test${ruta}?fuente=emsc`))).status, 200);
  assert.equal((await manejador(new Request('https://x.test/api/salud?fuente=emsc'))).status, 400);
  assert.equal((await manejador(new Request('https://x.test/api/eventos?fuente=emsc;DROP'))).status, 400);
  assert.equal(llamadas.length, 2);
});

test('en reproducción no se envía «fuente» (la API la rechaza) y el selector no aparece', () => {
  const app = readFileSync(new URL('../src/app/app.component.ts', import.meta.url), 'utf8');
  assert.match(app, /fuente: _sinFuente, \.\.\.paramsBase\b/);
  const filtros = readFileSync(new URL('../src/app/filtros/filtros.component.ts', import.meta.url), 'utf8');
  assert.match(filtros, /@if \(!replay\(\)\) \{\s*<label>Fuente/);
});

test('la atribución a EMSC (CC BY 4.0) está en el pie y la comparación declara que es solo de USGS', () => {
  const html = readFileSync(new URL('../src/app/app.component.html', import.meta.url), 'utf8');
  assert.match(html, /EMSC, Centro Sismológico Euro-Mediterráneo \(feed en vivo, CC BY 4\.0\)/);
  assert.match(readFileSync(new URL('../src/app/comparacion/comparacion.component.ts', import.meta.url), 'utf8'), /Solo datos de USGS \(EMSC no entra en esta comparación\)/);
});
