// Filtros del panel (F5, paso 5.4, T025). `node --test tests/*.test.ts` (Node 24 ejecuta TypeScript sin dependencias).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AVISO_COBERTURA, SIN_PAIS, aCampoFecha, analizarFechaUtc, analizarMagnitud, estadoInicial, paisesDelCatalogo, parametros, resolverVentana, resumen, validar,
} from '../src/app/filtros.ts';

const GENERATED = Date.UTC(2026, 10, 7, 17, 30, 0); // 2026-11-07T17:30:00Z según la API
const DIA = 86_400_000;

test('el estado inicial son las últimas 24 h sin magnitud ni país', () => {
  assert.deepEqual(estadoInicial(), { preajuste: 'ultimas-24h', desde: '', hasta: '', magMin: '', pais: '' });
  assert.deepEqual(validar(estadoInicial()), []);
});

test('las últimas 24 h y los últimos 7 días se resuelven desde generated con start y end explícitos', () => {
  assert.deepEqual(resolverVentana(estadoInicial(), GENERATED), { startMs: GENERATED - DIA, endMs: GENERATED });
  assert.deepEqual(resolverVentana({ ...estadoInicial(), preajuste: 'ultimos-7d' }, GENERATED), { startMs: GENERATED - 7 * DIA, endMs: GENERATED });
  const p = parametros(estadoInicial(), resolverVentana(estadoInicial(), GENERATED));
  assert.deepEqual(p, { start: '2026-11-06T17:30:00.000Z', end: '2026-11-07T17:30:00.000Z' });
});

test('con un reloj de cliente desfasado la ventana no se desplaza: solo cuenta generated de la API', () => {
  const real = Date.now;
  try {
    Date.now = () => GENERATED + 5 * DIA; // navegador adelantado 5 días
    const adelantado = parametros(estadoInicial(), resolverVentana(estadoInicial(), GENERATED));
    Date.now = () => GENERATED - 400 * DIA; // y atrasado más de un año
    const atrasado = parametros(estadoInicial(), resolverVentana(estadoInicial(), GENERATED));
    assert.deepEqual(adelantado, atrasado);
    assert.equal(adelantado['end'], '2026-11-07T17:30:00.000Z');
  } finally {
    Date.now = real;
  }
});

test('periodo personalizado: fechas UTC, fin exclusivo y reglas de la API para los extremos que faltan', () => {
  const e = { ...estadoInicial(), preajuste: 'personalizado' as const, desde: '2026-11-05T00:00', hasta: '2026-11-06T12:30' };
  assert.deepEqual(resolverVentana(e, GENERATED), { startMs: Date.UTC(2026, 10, 5), endMs: Date.UTC(2026, 10, 6, 12, 30) });
  assert.deepEqual(resolverVentana({ ...e, hasta: '' }, GENERATED), { startMs: Date.UTC(2026, 10, 5), endMs: GENERATED }); // sin «Hasta»: hasta generated
  const soloHasta = resolverVentana({ ...e, desde: '' }, GENERATED);
  assert.equal(soloHasta.endMs - soloHasta.startMs, DIA); // sin «Desde»: fin − 24 h
});

test('validación: periodo personalizado incompleto, ilegible o invertido', () => {
  const base = { ...estadoInicial(), preajuste: 'personalizado' as const };
  assert.equal(validar(base).length, 1); // ninguna de las dos fechas
  assert.match(validar({ ...base, desde: 'ayer' })[0], /Desde/);
  assert.match(validar({ ...base, desde: '2026-02-31T00:00' })[0], /Desde/); // 31 de febrero no existe
  assert.match(validar({ ...base, hasta: '2026-13-01T00:00' })[0], /Hasta/);
  assert.match(validar({ ...base, desde: '2026-11-06T00:00', hasta: '2026-11-05T00:00' })[0], /anterior/);
  assert.match(validar({ ...base, desde: '2026-11-06T00:00', hasta: '2026-11-06T00:00' })[0], /anterior/); // inicio = fin también es inválido
  assert.deepEqual(validar({ ...base, desde: '2026-11-05T00:00', hasta: '2026-11-06T00:00' }), []);
  assert.deepEqual(validar({ ...estadoInicial(), desde: 'basura' }), []); // fuera de «personalizado» las fechas se ignoran
});

test('validación de la magnitud mínima', () => {
  for (const mal of ['abc', 'NaN', 'inf', '1e999', '4.5.1', '4 5', '9'.repeat(400)]) assert.equal(validar({ ...estadoInicial(), magMin: mal }).length, 1, mal);
  for (const bien of ['', ' ', '4', '4.5', '4,5', '-1', '0', '.5']) assert.deepEqual(validar({ ...estadoInicial(), magMin: bien }), [], bien);
});

test('analizarMagnitud y analizarFechaUtc', () => {
  assert.equal(analizarMagnitud(''), undefined);
  assert.equal(analizarMagnitud('4,5'), 4.5);
  assert.equal(analizarMagnitud('x'), null);
  assert.equal(analizarFechaUtc('2026-11-07T17:30'), Date.UTC(2026, 10, 7, 17, 30));
  assert.equal(analizarFechaUtc('2026-11-07T17:30:15'), Date.UTC(2026, 10, 7, 17, 30, 15));
  for (const mal of ['', '2026-11-07', '07/11/2026', '2026-11-07 17:30', '2026-11-07T25:00', '1969-12-31T23:59', '2101-01-01T00:00']) assert.ok(Number.isNaN(analizarFechaUtc(mal)), mal);
});

test('parámetros: min_mag, country_id normalizado y sin_pais reservado', () => {
  const v = resolverVentana(estadoInicial(), GENERATED);
  assert.deepEqual(parametros({ ...estadoInicial(), magMin: '4,5', pais: 'esp' }, v), { start: '2026-11-06T17:30:00.000Z', end: '2026-11-07T17:30:00.000Z', min_mag: '4.5', country_id: 'ESP' });
  assert.equal(parametros({ ...estadoInicial(), pais: 'SIN_PAIS' }, v)['country_id'], SIN_PAIS);
  assert.equal(parametros({ ...estadoInicial(), pais: SIN_PAIS }, v)['country_id'], 'sin_pais');
  const sin = parametros(estadoInicial(), v);
  assert.ok(!('min_mag' in sin) && !('country_id' in sin)); // vacío = sin filtro: no se envía
  assert.ok(!('min_mag' in parametros({ ...estadoInicial(), magMin: 'x' }, v))); // una magnitud inválida nunca viaja
});

test('los mismos filtros dan los mismos parámetros para eventos y estadísticas (un único estado)', () => {
  const e = { ...estadoInicial(), magMin: '4', pais: 'USA' };
  const v = resolverVentana(e, GENERATED);
  assert.deepEqual(parametros(e, v), parametros({ ...e }, { ...v })); // una sola función construye ambas peticiones
});

test('resumen de los filtros activos y aviso de cobertura', () => {
  assert.equal(resumen(estadoInicial()), 'últimas 24 h');
  assert.equal(resumen({ ...estadoInicial(), preajuste: 'ultimos-7d', magMin: '4.5', pais: 'sin_pais' }), 'últimos 7 días · magnitud ≥ 4.5 · Sin país asignado');
  assert.equal(resumen({ ...estadoInicial(), pais: 'esp' }, { ESP: 'España' }), 'últimas 24 h · país España');
  assert.match(AVISO_COBERTURA, /no demuestra un descenso real/);
  assert.match(AVISO_COBERTURA, /4,5/);
});

test('aCampoFecha rellena los campos de fecha en UTC', () => {
  assert.equal(aCampoFecha(GENERATED), '2026-11-07T17:30');
});

test('la lista de países sale del catálogo entregado, sin duplicados ni identificadores vacíos y ordenada por nombre', () => {
  const catalogo = { features: [
    { properties: { ADM0_A3: 'ESP', NAME_ES: 'España', ADMIN: 'Spain' } }, { properties: { ADM0_A3: 'AGO', NAME_ES: 'Angola' } },
    { properties: { ADM0_A3: 'ESP', NAME_ES: 'duplicado' } }, { properties: { ADM0_A3: '', NAME_ES: 'sin id' } }, { properties: { NAME_ES: 'sin codigo' } },
    { properties: { ADM0_A3: 'XYZ', ADMIN: 'Solo inglés' } }, { properties: { ADM0_A3: 'ZZZ' } }, null,
  ] };
  assert.deepEqual(paisesDelCatalogo(catalogo), [{ id: 'AGO', nombre: 'Angola' }, { id: 'ESP', nombre: 'España' }, { id: 'XYZ', nombre: 'Solo inglés' }, { id: 'ZZZ', nombre: 'ZZZ' }]);
  assert.deepEqual(paisesDelCatalogo(null), []);
  assert.deepEqual(paisesDelCatalogo({ features: 3 }), []);
});
