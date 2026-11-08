// Estado y avisos (F5, paso 5.6, T041): clasificación y textos. `node --test tests/*.test.ts`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisos, edadLecturaMs, estadoGeneral, formatoEdad, retardoSiguiente, textoIngesta } from '../src/app/estado.ts';

const SALUD_OK = { status: 'ok', database: 'ok', last_ingestion: Date.UTC(2026, 10, 7, 17, 29, 48), generated: Date.UTC(2026, 10, 7, 17, 30, 0), ingestion_age_s: 12, stale: false, stale_after_s: 300, gaps_pending: 0, live_since: 1 };
const SALUD_VIEJA = { ...SALUD_OK, last_ingestion: Date.UTC(2026, 10, 7, 17, 20, 0), ingestion_age_s: 600, stale: true };

function entrada(extra: Record<string, unknown> = {}) {
  return { error: null, salud: SALUD_OK, hayLectura: true, edadLecturaMs: 5000, cargados: 169, total: 169, siguiente: null, recuperadoEn: null, ...extra } as never;
}
const codigos = (e: unknown) => (avisos(e as never) as { codigo: string }[]).map((a) => a.codigo);

test('formatoEdad: segundos, minutos, horas y días', () => {
  assert.deepEqual([0, 999, 12_000, 59_999, 60_000, 185_000, 3_599_000, 3_600_000, 7_800_000, 86_400_000, 100_800_000].map(formatoEdad),
    ['0 s', '0 s', '12 s', '59 s', '1 min 00 s', '3 min 05 s', '59 min 59 s', '1 h 00 min', '2 h 10 min', '1 d 0 h', '1 d 4 h']);
  assert.equal(formatoEdad(-1), 'ND');
  assert.equal(formatoEdad(NaN), 'ND');
});

test('la antigüedad de la lectura se mide con un reloj monotónico, nunca con la hora del navegador', () => {
  const real = Date.now;
  try {
    Date.now = () => 0; // hora del sistema absurda: no influye
    assert.equal(edadLecturaMs(10_500, 10_000), 500);
    Date.now = () => 9e15;
    assert.equal(edadLecturaMs(10_500, 10_000), 500);
  } finally { Date.now = real; }
  assert.equal(edadLecturaMs(5, null), null);
  assert.equal(edadLecturaMs(5, 10), 0); // nunca negativa
});

test('reintento: tras un fallo en el mínimo permitido; tras un éxito, cada refreshMs (con mínimo)', () => {
  assert.equal(retardoSiguiente(false, 120_000), 30_000);
  assert.equal(retardoSiguiente(true, 120_000), 120_000);
  assert.equal(retardoSiguiente(true, 5_000), 30_000);
  assert.equal(retardoSiguiente(true, 0), 60_000);
  assert.equal(retardoSiguiente(true, NaN), 60_000);
  assert.equal(retardoSiguiente(false, 5_000), 30_000);
});

test('todo en orden: ningún aviso y estado «Datos al día»', () => {
  assert.deepEqual(codigos(entrada()), []);
  assert.deepEqual(estadoGeneral(entrada()), { nivel: 'ok', texto: 'Datos al día' });
});

test('red, tiempo agotado, 503 y formato son «sin conexión» y conservan la última lectura indicando su antigüedad', () => {
  const casos = [
    [{ tipo: 'red', mensaje: 'No se pudo conectar con la API (red, túnel o CORS).' }, /No se puede conectar con la API/],
    [{ tipo: 'tiempo', mensaje: 'La API no respondió en 15 s.' }, /no respondió a tiempo/],
    [{ tipo: 'servidor', mensaje: 'La API no puede consultar su base de datos (503).' }, /base de datos \(503\)/],
    [{ tipo: 'formato', mensaje: 'La respuesta de la API no es JSON válido.' }, /no es JSON válido/],
  ] as const;
  for (const [error, patron] of casos) {
    const a = avisos(entrada({ error, edadLecturaMs: 185_000 }));
    assert.equal(a[0].codigo, 'sin-conexion');
    assert.equal(a[0].severidad, 'error');
    assert.equal(a[0].rol, 'alert');
    assert.match(a[0].texto, patron);
    assert.match(a[0].texto, /últimos datos válidos, leídos hace 3 min 05 s/);
    assert.match(a[0].texto, /pueden estar desactualizados/);
    assert.match(a[0].texto, /reintenta automáticamente/);
    assert.deepEqual(estadoGeneral(entrada({ error })), { nivel: 'sin-conexion', texto: 'Sin conexión con el backend' });
  }
});

test('sin ninguna lectura previa el aviso lo dice y no inventa datos', () => {
  const a = avisos(entrada({ error: { tipo: 'red', mensaje: 'x' }, hayLectura: false, edadLecturaMs: null, cargados: 0, total: null, salud: null }));
  assert.equal(a[0].codigo, 'sin-conexion');
  assert.match(a[0].texto, /Todavía no hay ninguna lectura válida/);
  assert.ok(!codigos(entrada({ error: { tipo: 'red', mensaje: 'x' }, hayLectura: false, edadLecturaMs: null, cargados: 0, total: null, salud: null })).includes('sin-eventos'));
});

test('un 422 es «filtros rechazados», NO sin conexión', () => {
  const e = entrada({ error: { tipo: 'validacion', mensaje: 'x', detalle: 'country_id desconocido: ATLANTIDA' } });
  const a = avisos(e);
  assert.equal(a[0].codigo, 'filtros-rechazados');
  assert.match(a[0].texto, /country_id desconocido: ATLANTIDA/);
  assert.match(a[0].texto, /última lectura válida/);
  assert.ok(!codigos(e).includes('sin-conexion'));
  assert.equal(estadoGeneral(e).nivel, 'ok'); // la conexión funciona
});

test('datos desactualizados: según stale de la API (su reloj), con la antigüedad y el umbral', () => {
  const e = entrada({ salud: SALUD_VIEJA });
  const a = avisos(e);
  assert.deepEqual(a.map((x) => x.codigo), ['datos-desactualizados']);
  assert.match(a[0].texto, /hace 10 min 00 s/);
  assert.match(a[0].texto, /umbral: 300 s/);
  assert.equal(a[0].rol, 'status');
  assert.deepEqual(estadoGeneral(e), { nivel: 'desactualizado', texto: 'Datos desactualizados' });
  // justo en el borde la API decide: stale false → sin aviso
  assert.deepEqual(codigos(entrada({ salud: { ...SALUD_OK, ingestion_age_s: 300, stale: false } })), []);
});

test('nunca hubo ingesta correcta: desactualizado con su propio texto', () => {
  const a = avisos(entrada({ salud: { ...SALUD_OK, last_ingestion: null, ingestion_age_s: null, stale: true } }));
  assert.equal(a[0].codigo, 'datos-desactualizados');
  assert.match(a[0].texto, /todavía no hay ninguna ingesta correcta/);
});

test('no se muestra «desactualizado» mientras hay error de conexión (no se sabe el estado actual)', () => {
  assert.deepEqual(codigos(entrada({ salud: SALUD_VIEJA, error: { tipo: 'red', mensaje: 'x' } })), ['sin-conexion']);
});

test('ausencia de eventos es información, distinta de un error y de la desactualización', () => {
  const vacio = entrada({ cargados: 0, total: 0 });
  const a = avisos(vacio);
  assert.deepEqual(a.map((x) => x.codigo), ['sin-eventos']);
  assert.equal(a[0].severidad, 'info');
  assert.match(a[0].texto, /no es un error ni una pérdida de conexión/);
  assert.equal(estadoGeneral(vacio).nivel, 'ok');
  assert.deepEqual(codigos(entrada({ cargados: 0, total: 0, salud: SALUD_VIEJA })), ['datos-desactualizados', 'sin-eventos']); // ambos, y por separado
  assert.deepEqual(codigos(entrada({ cargados: 0, total: 0, hayLectura: false })), []); // antes de la primera lectura no se afirma nada
});

test('resultados truncados: cuántos se muestran de cuántos y qué usa todos los eventos', () => {
  const a = avisos(entrada({ cargados: 5000, total: 12000, siguiente: 5000 }));
  assert.deepEqual(a.map((x) => x.codigo), ['truncado']);
  assert.match(a[0].texto, /5000 de 12000 eventos/);
  assert.match(a[0].texto, /estadísticas, las gráficas y la comparación usan TODOS/);
  assert.deepEqual(codigos(entrada({ cargados: 12000, total: 12000 })), []); // completo: sin aviso
});

test('huecos de ingesta pendientes', () => {
  assert.deepEqual(codigos(entrada({ salud: { ...SALUD_OK, gaps_pending: 2 } })), ['huecos']);
  assert.match(avisos(entrada({ salud: { ...SALUD_OK, gaps_pending: 1 } }))[0].texto, /1 hueco de ingesta/);
  assert.match(avisos(entrada({ salud: { ...SALUD_OK, gaps_pending: 2 } }))[0].texto, /2 huecos de ingesta/);
  assert.deepEqual(codigos(entrada({ salud: { status: 'ok', database: 'ok', last_ingestion: 1 } })), []); // una API anterior sin el campo no rompe el panel
});

test('conexión recuperada: aviso informativo y datos al día', () => {
  const a = avisos(entrada({ recuperadoEn: '17:31:05' }));
  assert.deepEqual(a.map((x) => x.codigo), ['recuperado']);
  assert.match(a[0].texto, /17:31:05 UTC/);
  assert.deepEqual(codigos(entrada({ recuperadoEn: '17:31:05', error: { tipo: 'red', mensaje: 'x' } })), ['sin-conexion']); // con error vigente no se anuncia recuperación
});

test('orden de gravedad: error primero, luego desactualizado, sin eventos/truncado y huecos', () => {
  const todo = entrada({ salud: { ...SALUD_VIEJA, gaps_pending: 1 }, cargados: 0, total: 0 });
  assert.deepEqual(codigos(todo), ['datos-desactualizados', 'sin-eventos', 'huecos']);
});

test('textoIngesta', () => {
  assert.match(textoIngesta(SALUD_OK), /2026-11-07T17:29:48.000Z \(hace 12 s según el reloj de la API\)/);
  assert.equal(textoIngesta({ ...SALUD_OK, last_ingestion: null }), 'todavía no hay ninguna ingesta correcta registrada');
  assert.equal(textoIngesta(null), 'sin lectura de /api/salud');
  assert.match(textoIngesta({ status: 'ok', database: 'ok', last_ingestion: 1_000 }), /antigüedad no disponible/);
});

test('con un error de conexión y la última lectura sin eventos NO se dice «sin eventos»: ahora no se sabe (no hay que confundir sin datos con sin conexión)', () => {
  assert.deepEqual(codigos(entrada({ error: { tipo: 'red', mensaje: 'x' }, cargados: 0, total: 0 })), ['sin-conexion']);
  assert.deepEqual(codigos(entrada({ error: { tipo: 'validacion', mensaje: 'x', detalle: 'y' }, cargados: 0, total: 0 })), ['filtros-rechazados']);
});

test('el aviso de recuperación no se confunde con ningún otro estado', () => {
  assert.equal(estadoGeneral(entrada({ recuperadoEn: '17:31:05' })).nivel, 'ok');
});
