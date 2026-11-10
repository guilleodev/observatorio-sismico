// Bloque «Información y estado de los datos» (F7) y estructura de los cuatro bloques superiores. `node --test tests/*.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { indicadorConexion, indicadorDatos, textoCobertura } from '../src/app/estado-datos/estado-datos.ts';
import { estadoGeneral } from '../src/app/estado.ts';
import { razonContraste } from '../src/app/formato.ts';

const leer = (ruta: string) => readFileSync(new URL(`../src/app/${ruta}`, import.meta.url), 'utf8');
const css = (ruta: string) => readFileSync(new URL(`../src/${ruta}`, import.meta.url), 'utf8');

const BASE = { error: null, salud: null, hayLectura: true, edadLecturaMs: 1000, cargados: 5, total: 5, siguiente: null, recuperadoEn: null };

test('indicadorConexion: API accesible, sin lectura, sin conexión y clave que falta (no es una caída)', () => {
  assert.deepEqual(indicadorConexion({ error: null, hayLectura: true }), { tono: 'ok', icono: '✓', texto: 'API accesible' });
  assert.equal(indicadorConexion({ error: null, hayLectura: false }).tono, 'neutro');
  assert.equal(indicadorConexion({ error: { tipo: 'red', mensaje: 'x' }, hayLectura: true }).tono, 'error');
  assert.equal(indicadorConexion({ error: { tipo: 'autorizacion', mensaje: 'x' }, hayLectura: false }).tono, 'aviso');
  assert.match(indicadorConexion({ error: { tipo: 'autorizacion', mensaje: 'x' }, hayLectura: false }).texto, /clave/);
  assert.equal(indicadorConexion({ error: { tipo: 'validacion', mensaje: 'x' }, hayLectura: true }).tono, 'ok');   // filtros rechazados: la API responde
});

test('indicadorDatos traduce estadoGeneral sin reimplementarlo: al día, desactualizado, sin conexión y reproducción en violeta', () => {
  const alDia = indicadorDatos(estadoGeneral(BASE), false);
  assert.deepEqual(alDia, { tono: 'ok', icono: '✓', texto: 'Datos al día' });
  const viejo = indicadorDatos(estadoGeneral({ ...BASE, salud: { status: 'ok', database: 'ok', last_ingestion: 1, stale: true } }), false);
  assert.equal(viejo.tono, 'aviso');
  assert.equal(viejo.texto, 'Datos desactualizados');
  const caido = indicadorDatos(estadoGeneral({ ...BASE, error: { tipo: 'red', mensaje: 'x' } }), false);
  assert.equal(caido.tono, 'error');
  const replay = indicadorDatos(estadoGeneral({ ...BASE, modo: 'replay' }), true);
  assert.equal(replay.tono, 'replay');
  assert.match(replay.texto, /no es actividad actual/);
  // el estado nunca va solo en color: cada tono lleva un icono propio
  assert.equal(new Set([alDia.icono, viejo.icono, caido.icono, replay.icono]).size, 4);
});

test('textoCobertura: «de N» solo si se conoce el total, singular/plural de omitidos y miles en español', () => {
  assert.equal(textoCobertura(null, 0), '0 omitidos por coordenadas inválidas');
  assert.equal(textoCobertura(123, 1), 'de 123 en el periodo · 1 omitido por coordenadas inválidas');
  assert.equal(textoCobertura(123, 2), 'de 123 en el periodo · 2 omitidos por coordenadas inválidas');
  assert.match(textoCobertura(12345, 0), /^de 12\.345 en el periodo/);
});

test('la plantilla distingue «Última lectura del frontend», «Última ingesta USGS» y «Conexión», y conserva todos los datos de la lectura', () => {
  const c = leer('estado-datos/estado-datos.component.ts');
  for (const t of ['Última lectura del frontend', 'Última ingesta USGS', 'Última ingesta USGS en vivo', 'medida por la API', 'Conexión', 'Terremotos visualizados', 'Países',
    'Detalles de la lectura', 'Última lectura UTC', 'Generación de la respuesta UTC', 'Filtros activos', 'Periodo consultado (UTC)', 'eventos dibujados']) assert.ok(c.includes(t), t);
  assert.match(c, /\{\{ conteo\(\) \}\} de \{\{ total\(\) \?\? 'ND' \}\}/);
  assert.match(c, /class="etiqueta-replay-info"/);                                  // etiqueta REPRODUCCIÓN visible (invariante 8)
  assert.match(c, /estadoGeneral\(this\.entrada\(\)\)/);                            // se usa estadoGeneral tal cual
});

test('región viva: UNA sola en el bloque de información y la antigüedad (cambia cada segundo) queda fuera', () => {
  const c = leer('estado-datos/estado-datos.component.ts');
  assert.equal((c.match(/aria-live="polite"/g) ?? []).length, 1);
  const viva = /<div class="lectura" aria-live="polite">([\s\S]*?)<\/div>\s*<div class="grupos">/.exec(c)?.[1] ?? '';
  assert.ok(viva.length > 0);
  assert.doesNotMatch(viva, /lecturaFrontend|ingesta|ultimaLectura/);
  assert.match(viva, /estado\(\)/);
});

test('app.component.html: orden DOM cabecera → refresco → modo → información → acceso → filtros → mapa, y la ingesta ya no está en el indicador', () => {
  const html = leer('app.component.html');
  const orden = ['<header class="cabecera"', '<app-indicador-refresco', '<app-selector-modo', '<app-estado-datos', '<app-acceso', '<app-filtros', 'class="mapa-envoltorio"'].map((s) => html.indexOf(s));
  assert.ok(orden.every((i) => i >= 0), String(orden));
  assert.deepEqual([...orden].sort((a, b) => a - b), orden);
  assert.doesNotMatch(/<app-indicador-refresco[^>]*>/.exec(html)?.[0] ?? '', /ingesta/);
  assert.match(html, /<app-estado-datos [^>]*\[ingesta\]="ingestaRef\(\)"/);
  assert.doesNotMatch(html, /class="chips"|class="info"/);
});

test('selector de modo: radios reales en un radiogroup, marca ✓ con texto «Activo» (no solo color) y etiquetas conservadas', () => {
  const s = leer('selector-modo/selector-modo.component.ts');
  assert.equal((s.match(/<input type="radio"/g) ?? []).length, 2);   // solo los radios de la plantilla (no los selectores CSS `input[type="radio"]`)
  assert.match(s, /role="radiogroup"/);
  assert.match(s, /En vivo \(USGS\)/);
  assert.match(s, /REPRODUCCIÓN \(histórico acelerado\)/);
  assert.equal((s.match(/✓ Activo/g) ?? []).length, 2);
  assert.match(s, /label:has\(input:focus-visible\)/);
  assert.match(s, /\(cambio\)|readonly cambio = output<ModoVista>\(\)/);
});

test('filtros: columnas con minmax(min(…px, 100%)) para no desbordar a 320 px; errores con role=alert; botones y campos >= 24 px', () => {
  const f = leer('filtros/filtros.component.ts');
  assert.match(f, /minmax\(min\(150px, 100%\), 1fr\)/);
  assert.match(f, /minmax\(min\(320px, 100%\), 1fr\)/);
  assert.match(f, /<ul class="errores" role="alert">/);
  assert.ok(f.indexOf('class="errores"') < f.indexOf('id="ayuda-magnitud"'), 'errores pegados a los campos, antes de las notas');
  for (const p of ['input, select', 'button']) assert.match(f, new RegExp(`${p} \\{[^}]*min-height: 38px`));
  assert.match(f, /type="submit"[\s\S]*?>Aplicar filtros</);
  assert.match(f, /Restablecer/);
});

test('sin transition: all ni almacenamiento del navegador en los bloques rediseñados; animaciones solo con transform/opacity', () => {
  for (const r of ['estado-datos/estado-datos.component.ts', 'selector-modo/selector-modo.component.ts', 'filtros/filtros.component.ts', 'indicador-refresco/indicador-refresco.component.ts']) {
    const t = leer(r);
    assert.doesNotMatch(t, /transition:\s*all|localStorage|sessionStorage|document\.cookie|indexedDB/, r);
  }
});

test('contraste AA de los colores nuevos (tokens de styles.css medidos con razonContraste)', () => {
  const tokens = css('styles.css');
  const t = (n: string) => new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens)?.[1] ?? '';
  const s1 = t('superficie-1'), s2 = t('superficie-2'), fondo = t('fondo'), acentoFondo = t('acento-fondo');
  assert.ok(acentoFondo !== '');
  assert.ok(razonContraste(t('texto'), acentoFondo) >= 4.5);                // texto sobre «En vivo» seleccionado
  assert.ok(razonContraste(t('acento-texto'), acentoFondo) >= 4.5);         // «✓ Activo» sobre ese fondo
  assert.ok(razonContraste(t('replay-texto'), t('replay-fondo')) >= 4.5);   // REPRODUCCIÓN seleccionada
  assert.ok(razonContraste(t('texto-2'), s2) >= 4.5);                       // etiquetas pequeñas sobre las tarjetas KPI
  assert.ok(razonContraste(t('sobre-acento'), t('acento')) >= 4.5);         // botones principales
  for (const icono of ['ok', 'aviso', 'error', 'replay']) assert.ok(razonContraste(t(icono), s2) >= 3, icono);   // iconos de estado sobre la tarjeta
  assert.ok(razonContraste(t('borde-control'), fondo) >= 3);                // borde de los campos de filtros
  assert.ok(razonContraste(t('borde-control'), s1) >= 3);
});
