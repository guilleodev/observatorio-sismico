// Indicador de actualización (F7): estado del refresco, texto relativo, cuenta atrás, ingesta del backend y desplazamiento de la rueda sobre el mapa.
// `node --test tests/*.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ETIQUETAS_ESTADO, anuncioRefresco, detalleEstado, estadoRefresco, formatoDuracion, restanteMs, textoIngestaCompacto, textoSiguienteIntento, textoUltimoRefresco,
} from '../src/app/refresco.ts';

const leer = (ruta: string) => readFileSync(new URL(`../src/app/${ruta}`, import.meta.url), 'utf8');
const BASE = { cargando: false, hayError: false, hayLectura: true, enPausa: false, pideClave: false };

test('estadoRefresco: correcto solo con lectura y sin error; nunca éxito tras un fallo', () => {
  assert.equal(estadoRefresco(BASE), 'correcto');
  assert.equal(estadoRefresco({ ...BASE, hayError: true }), 'error');          // hay lectura antigua pero la última petición falló
  assert.equal(estadoRefresco({ ...BASE, hayLectura: false }), 'sin-lectura');
  assert.equal(estadoRefresco({ ...BASE, hayLectura: false, hayError: true }), 'error');
});

test('estadoRefresco: prioridad clave > cargando > error > pausa', () => {
  assert.equal(estadoRefresco({ ...BASE, cargando: true, hayError: true }), 'actualizando');
  assert.equal(estadoRefresco({ ...BASE, enPausa: true }), 'pausa');
  assert.equal(estadoRefresco({ ...BASE, enPausa: true, hayError: true }), 'error');
  assert.equal(estadoRefresco({ ...BASE, pideClave: true, cargando: true, hayError: true }), 'acceso');
});

test('estadoRefresco: filtros rechazados (validación) es un aviso propio, no «error»; un fallo real sigue siendo «error»; la clave sigue mandando', () => {
  assert.equal(estadoRefresco({ ...BASE, filtrosRechazados: true }), 'filtros-rechazados');
  assert.notEqual(estadoRefresco({ ...BASE, filtrosRechazados: true }), 'error');
  assert.equal(estadoRefresco({ ...BASE, hayError: true }), 'error');
  assert.equal(estadoRefresco({ ...BASE, hayError: true, filtrosRechazados: true }), 'error');   // un fallo real de red prevalece
  assert.equal(estadoRefresco({ ...BASE, cargando: true, filtrosRechazados: true }), 'actualizando');
  assert.equal(estadoRefresco({ ...BASE, filtrosRechazados: true, enPausa: true }), 'filtros-rechazados');
  assert.equal(estadoRefresco({ ...BASE, pideClave: true, filtrosRechazados: true }), 'acceso');
  assert.equal(estadoRefresco({ ...BASE, pideClave: true }), 'acceso');
  assert.equal(ETIQUETAS_ESTADO['filtros-rechazados'], 'Filtros rechazados');
  assert.match(detalleEstado('filtros-rechazados') ?? '', /se conserva la última lectura válida/);
  assert.equal(detalleEstado('error'), null);
});

test('app.component.ts: «error» del indicador sale de una señal propia del refresco, no de errorPanel (que también recoge «cargar el resto»)', () => {
  const ts = leer('app.component.ts');
  assert.match(ts, /hayError: this\.falloRefresco\(\)/);
  assert.doesNotMatch(ts, /hayError: this\.errorPanel\(\)/);
  assert.match(ts, /this\.falloRefresco\.set\(true\)/);
  assert.match(ts, /this\.filtrosRechazados\.set\(true\)/);
  const resto = /async cargarResto\(\)[\s\S]*?\n  \}\n/.exec(ts)?.[0] ?? '';
  assert.ok(resto.length > 0);
  assert.doesNotMatch(resto, /falloRefresco|filtrosRechazados/);
});

test('anuncioRefresco: solo cambios relevantes de conexión; un refresco normal no anuncia nada', () => {
  assert.equal(anuncioRefresco('correcto', 'actualizando'), null);
  assert.equal(anuncioRefresco('correcto', 'correcto'), null);        // refresco periódico normal
  assert.equal(anuncioRefresco(null, 'correcto'), null);              // primera carga
  assert.equal(anuncioRefresco(null, 'sin-lectura'), null);
  assert.equal(anuncioRefresco('filtros-rechazados', 'correcto'), null);
  assert.match(anuncioRefresco('correcto', 'error') ?? '', /No se pudo actualizar/);
  assert.equal(anuncioRefresco('error', 'error'), null);              // reintento fallido: no se repite
  assert.equal(anuncioRefresco('error', 'correcto'), 'Conexión recuperada: datos actualizados');
  assert.match(anuncioRefresco('correcto', 'acceso') ?? '', /clave/);
  assert.match(anuncioRefresco('correcto', 'pausa') ?? '', /en pausa/);
  assert.match(anuncioRefresco('pausa', 'correcto') ?? '', /reanudada/);
  assert.match(anuncioRefresco('correcto', 'filtros-rechazados') ?? '', /Filtros rechazados.*última lectura válida/);
});

test('anuncioRefresco: secuencia con «Actualizando…» intercalado (el componente ignora ese estado): la recuperación se anuncia una sola vez', () => {
  const secuencia: Array<'correcto' | 'actualizando' | 'error'> = ['correcto', 'actualizando', 'correcto', 'actualizando', 'error', 'actualizando', 'error', 'actualizando', 'correcto', 'actualizando', 'correcto'];
  let anterior: ReturnType<typeof estadoRefresco> | null = null;
  const anuncios: string[] = [];
  for (const actual of secuencia) {
    if (actual === 'actualizando') continue;
    const texto = anuncioRefresco(anterior, actual);
    anterior = actual;
    if (texto !== null) anuncios.push(texto);
  }
  assert.equal(anuncios.length, 2);
  assert.match(anuncios[0], /No se pudo actualizar/);
  assert.match(anuncios[1], /Conexión recuperada/);
});

test('etiquetas visibles en español', () => {
  assert.equal(ETIQUETAS_ESTADO.correcto, 'Correcto');
  assert.equal(ETIQUETAS_ESTADO.actualizando, 'Actualizando…');
  assert.equal(ETIQUETAS_ESTADO.error, 'Error');
  assert.equal(ETIQUETAS_ESTADO.pausa, 'En pausa');
  assert.equal(ETIQUETAS_ESTADO['sin-lectura'], 'Sin lectura');
  assert.equal(ETIQUETAS_ESTADO.acceso, 'Acceso restringido');
});

test('formatoDuracion y textoUltimoRefresco: tiempo relativo desde el último refresco correcto', () => {
  assert.equal(formatoDuracion(45_000), '45 s');
  assert.equal(formatoDuracion(185_000), '3 min 05 s');
  assert.equal(formatoDuracion(-1), 'ND');
  assert.equal(textoUltimoRefresco(null), 'sin lectura correcta todavía');
  assert.equal(textoUltimoRefresco(400), 'ahora mismo');
  assert.equal(textoUltimoRefresco(12_000), 'hace 12 s');
});

test('restanteMs: cuenta atrás con reloj monotónico; null sin intento programado; nunca negativa', () => {
  assert.equal(restanteMs(1000, null), null);
  assert.equal(restanteMs(1000, 31_000), 30_000);
  assert.equal(restanteMs(40_000, 31_000), 0);
});

test('textoSiguienteIntento: cuenta atrás real o el motivo, nunca una cuenta inventada', () => {
  assert.equal(textoSiguienteIntento(BASE, 42_300), 'en 43 s');
  assert.equal(textoSiguienteIntento(BASE, 0), 'en breve');
  assert.equal(textoSiguienteIntento(BASE, 125_000), 'en 2 min 05 s');
  assert.equal(textoSiguienteIntento({ ...BASE, hayError: true }, 30_000), 'en 30 s (reintento tras el error)');   // tras un error: 30 s
  assert.match(textoSiguienteIntento({ ...BASE, enPausa: true }, null), /en pausa: la pestaña no está visible/);
  assert.match(textoSiguienteIntento({ ...BASE, enPausa: true, hayError: true }, null), /en pausa/);
  assert.match(textoSiguienteIntento({ ...BASE, pideClave: true }, null), /clave de acceso/);
  assert.match(textoSiguienteIntento({ ...BASE, cargando: true }, null), /consultando/);
  assert.equal(textoSiguienteIntento(BASE, null), 'sin intento programado');
  assert.doesNotMatch(textoSiguienteIntento({ ...BASE, enPausa: true }, 5000), /\d+ s/);   // en pausa no se muestra cuenta atrás aunque hubiera un valor residual
});

test('textoIngestaCompacto: dato del backend, o «sin dato»', () => {
  assert.equal(textoIngestaCompacto(null), 'sin dato');
  assert.equal(textoIngestaCompacto({ last_ingestion: null }), 'sin dato');
  assert.equal(textoIngestaCompacto({ last_ingestion: 1_700_000_000_000, ingestion_age_s: 12 }), 'hace 12 s al consultar');
  assert.equal(textoIngestaCompacto({ last_ingestion: Date.UTC(2025, 6, 30, 5, 7), ingestion_age_s: null }), '2025-07-30 05:07 UTC');
});

test('el mapa NO hace zoom con la rueda (la rueda desplaza la página) y conserva el resto de interacciones', () => {
  const ts = leer('app.component.ts');
  assert.match(ts, /readonly options: L\.MapOptions = \{[^}]*scrollWheelZoom:\s*false/);
  assert.doesNotMatch(ts, /scrollWheelZoom:\s*true/);
  assert.doesNotMatch(ts, /(dragging|doubleClickZoom|keyboard|touchZoom|zoomControl):\s*false/);   // arrastre, doble clic, teclado, táctil y botones +/− siguen activos
});

test('la plantilla: indicador solo en modo API, filtros antes del mapa, y la cuenta atrás fuera de regiones aria-live', () => {
  const html = leer('app.component.html');
  assert.match(html, /@if \(esApi\(\)\) \{ <app-indicador-refresco /);
  assert.ok(html.indexOf('<app-filtros') < html.indexOf('class="mapa-envoltorio"'), 'filtros antes del mapa');
  const componente = leer('indicador-refresco/indicador-refresco.component.ts');
  // F7 (iteración): la etiqueta visible ya NO es región viva; hay UNA región aria-live oculta con el último anuncio relevante
  assert.doesNotMatch(componente, /role="status"/);
  assert.equal((componente.match(/aria-live="polite"/g) ?? []).length, 1);
  assert.match(componente, /<strong class="estado">\{\{ etiqueta\(\) \}\}<\/strong>/);
  assert.match(componente, /<span class="oculto" aria-live="polite"[^>]*>\{\{ anuncio\(\) \}\}<\/span>/);
  assert.match(componente, /\.oculto \{[^}]*clip-path/);
  assert.doesNotMatch(componente, /aria-live[^<]*\{\{ (siguiente|ultimo|etiqueta)\(\)/);                    // ni la cuenta atrás, ni la antigüedad, ni la etiqueta
  assert.doesNotMatch(componente, /anuncio\.set\(''\)/);                                                    // el anuncio no se borra en cada tick
  assert.match(componente, /Refresco del panel/);
  // F7 (rediseño): la ingesta de USGS es un dato del BACKEND y ya NO vive en el indicador (se muestra en app-estado-datos, ver estado-datos.test.ts); aquí solo el refresco del frontend
  assert.doesNotMatch(componente, /ingesta/i);
  assert.match(componente, /Último correcto/);
  assert.match(componente, /Siguiente intento/);
});

test('F7: UN solo botón «Actualizar ahora» en toda la aplicación y sin el bloque de actualización antiguo', () => {
  const dir = fileURLToPath(new URL('../src/app/', import.meta.url));
  const fuentes = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => /\.(html|ts)$/.test(f));
  const todos = fuentes.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  assert.equal((todos.match(/class="actualizar"/g) ?? []).length, 1);                  // exactamente uno en todo frontend/src/app
  assert.equal((todos.match(/>\s*Actualizar ahora\s*</g) ?? []).length, 1);            // y el texto del botón no está duplicado
  const html = leer('app.component.html');
  assert.doesNotMatch(html, /class="actualizacion"/);
  assert.doesNotMatch(html, /textoAct\(\)/);
  assert.doesNotMatch(html, /Actualizar ahora/);
  assert.doesNotMatch(html, /class="pausa"|En pausa/);
  assert.doesNotMatch(leer('app.component.ts'), /textoAct\b/);
  const ind = leer('indicador-refresco/indicador-refresco.component.ts');
  assert.match(ind, /<button type="button" class="actualizar"/);
  assert.match(ind, /\(click\)="actualizar\.emit\(\)"/);
  assert.match(ind, /\[disabled\]="cargando\(\)"/);
  assert.match(ind, /readonly actualizar = output<void>\(\)/);
});

test('F7: el indicador muestra el intervalo y el aviso de pausa, y ambos quedan FUERA de regiones aria-live', () => {
  const ind = leer('indicador-refresco/indicador-refresco.component.ts');
  assert.match(ind, /Actualización automática: \{\{ intervalo\(\) \}\}/);
  assert.match(ind, /@if \(avisoPausa\(\); as a\) \{ <p class="aviso-pausa">\{\{ a \}\}<\/p> \}/);
  assert.doesNotMatch(ind, /aria-live[^<]*\{\{ (intervalo|avisoPausa|a)\(?\)? ?\}\}/);
  assert.equal((ind.match(/aria-live="polite"/g) ?? []).length, 1);                     // sigue habiendo UNA sola región viva
  const ts = leer('app.component.ts');
  assert.match(ts, /this\.intervaloRef\.set\(textoIntervalo\(config\)\)/);
  assert.match(ts, /this\.avisoPausaRef\.set\(avisoPausaOculta\(config\)\)/);
});

test('la animación del destello usa solo opacity/transform, no usa transition: all y se desactiva con movimiento reducido', () => {
  const css = leer('indicador-refresco/indicador-refresco.component.ts');
  const kf = /@keyframes destello \{([\s\S]*?)\} \}/.exec(css)?.[1] ?? '';
  assert.match(kf, /opacity/);
  assert.match(kf, /transform/);
  assert.doesNotMatch(kf, /(width|height|top|left|margin|background)/);
  assert.doesNotMatch(css, /transition:\s*all/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.destello \{ animation: none/);
});

test('app.component.ts: la cuenta atrás se registra en programar() y se anula durante la carga y al dispararse el temporizador', () => {
  const ts = leer('app.component.ts');
  assert.match(ts, /this\.proximoPerf\.set\(this\.ahoraPerf\(\) \+ espera\)/);
  assert.match(ts, /const espera = retardoSiguiente\(correcto, config\.refreshMs\)/);
  assert.ok((ts.match(/this\.proximoPerf\.set\(null\)/g) ?? []).length >= 2);
});
