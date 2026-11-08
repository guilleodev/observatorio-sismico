// Política de actualización y configuración pública (F6, 6.6, T042). `node --test tests/*.test.ts`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REFRESCO_PUBLICO_MS, debeRefrescarAlVolver, erroresDeConfig, formatoIntervalo, pausada, textoActualizacion } from '../src/app/actualizacion.ts';

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('en local (sin la opción) nunca se pausa: el refresco es el de F5, con la pestaña visible u oculta', () => {
  assert.equal(pausada(true, {}), false);
  assert.equal(pausada(true, { pausarSiOculta: false }), false);
  assert.equal(pausada(true, undefined), false);
  assert.equal(pausada(false, { pausarSiOculta: true }), false);
});

test('en el despliegue público se pausa solo con la pestaña oculta', () => {
  assert.equal(pausada(true, { pausarSiOculta: true }), true);
  assert.equal(pausada(false, { pausarSiOculta: true }), false);
});

test('al volver a la pestaña se consulta si nunca hubo lectura o si pasó el intervalo; si no, no se gasta una petición', () => {
  assert.equal(debeRefrescarAlVolver(5_000, null, REFRESCO_PUBLICO_MS), true);
  assert.equal(debeRefrescarAlVolver(700_000, 100_000, REFRESCO_PUBLICO_MS), true);   // 600 s exactos
  assert.equal(debeRefrescarAlVolver(699_999, 100_000, REFRESCO_PUBLICO_MS), false);
  assert.equal(debeRefrescarAlVolver(150_000, 100_000, REFRESCO_PUBLICO_MS), false);
});

test('el intervalo público es de 10 minutos y se muestra en texto claro', () => {
  assert.equal(REFRESCO_PUBLICO_MS, 10 * 60 * 1000);
  assert.deepEqual([30_000, 60_000, 600_000, 300_000, 7_200_000].map(formatoIntervalo), ['30 s', '60 s', '10 min', '5 min', '2 h']);
  assert.equal(formatoIntervalo(0), 'intervalo no válido');
  assert.equal(formatoIntervalo(NaN), 'intervalo no válido');
});

test('el texto de actualización menciona el intervalo, la pausa (solo si aplica) y la actualización manual', () => {
  const publico = textoActualizacion({ refreshMs: 600_000, pausarSiOculta: true });
  assert.match(publico, /cada 10 min/);
  assert.match(publico, /se suspende mientras la pestaña no está visible/);
  assert.match(publico, /Actualizar ahora/);
  const local = textoActualizacion({ refreshMs: 60_000 });
  assert.match(local, /cada 60 s/);
  assert.doesNotMatch(local, /suspende/);
});

test('el config.json del repositorio es válido, apunta a localhost y no contiene secretos ni la URL del túnel', () => {
  const texto = leer('../public/config.json');
  const c = JSON.parse(texto);
  assert.deepEqual(erroresDeConfig(c), []);
  assert.equal(c.apiUrl, 'http://127.0.0.1:8000');
  assert.equal(c.refreshMs, 60000);                       // desarrollo local: el refresco actual no cambia
  assert.equal(c.pausarSiOculta, undefined);
  assert.doesNotMatch(texto, /ngrok-free|ngrok\.app|ngrok\.io|netlify|authtoken|token|secret|password|https:/i);
});

test('la validación rechaza secretos, rutas, intervalos demasiado cortos y claves desconocidas', () => {
  const ok = { mode: 'api', apiUrl: 'https://abc.ngrok-free.app', refreshMs: 600000, skipNgrokWarning: true, pausarSiOculta: true };
  assert.deepEqual(erroresDeConfig(ok), []);
  assert.ok(erroresDeConfig({ ...ok, authtoken: 'x' }).some((m) => /secreto/.test(m)));
  assert.ok(erroresDeConfig({ ...ok, apiUrl: 'https://abc.ngrok-free.app/' }).length > 0);
  assert.ok(erroresDeConfig({ ...ok, apiUrl: 'https://abc.ngrok-free.app/api' }).length > 0);
  assert.ok(erroresDeConfig({ ...ok, refreshMs: 1000 }).length > 0);
  assert.ok(erroresDeConfig({ ...ok, mode: 'otro' }).length > 0);
  assert.ok(erroresDeConfig({ ...ok, pausarSiOculta: 'si' }).length > 0);
  assert.ok(erroresDeConfig({ ...ok, extra: 1 }).some((m) => /desconocida/.test(m)));
  assert.ok(erroresDeConfig(null).length > 0);
});

test('la aplicación aplica la política: pausa con la pestaña oculta, reanuda al volver, botón manual y retirada del oyente', () => {
  const ts = leer('../src/app/app.component.ts');
  assert.match(ts, /pausada\(document\.hidden, config\)/);
  assert.match(ts, /document\.addEventListener\('visibilitychange', this\.alCambiarVisibilidad\)/);
  assert.match(ts, /document\.removeEventListener\('visibilitychange', this\.alCambiarVisibilidad\)/);
  assert.match(ts, /debeRefrescarAlVolver\(performance\.now\(\), this\.lecturaPerf\(\), config\.refreshMs\)/);
  assert.match(ts, /actualizarAhora\(\): void/);
  const html = leer('../src/app/app.component.html');
  assert.match(html, /\(click\)="actualizarAhora\(\)"/);
  assert.match(html, /textoAct\(\)/);
});
