// Formato y codificación visual (F5, paso 5.4, T027): mismos valores que el componente proporcionado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorProfundidad, fechaUtc, numeroFinito, radioMagnitud, textoFicha, textoOSinValor } from '../src/app/formato.ts';

test('fecha UTC ISO o ND', () => {
  assert.equal(fechaUtc(0), '1970-01-01T00:00:00.000Z');
  assert.equal(fechaUtc(1793113140000), '2026-10-27T14:59:00.000Z');
  for (const mal of [null, undefined, NaN, Infinity, '1', {}, 8.64e15 + 1]) assert.equal(fechaUtc(mal), 'ND');
});

test('color por profundidad con los cortes del mapa (70 y 300 km) y gris sin dato', () => {
  assert.equal(colorProfundidad(0), '#e8a317');
  assert.equal(colorProfundidad(-3), '#e8a317');
  assert.equal(colorProfundidad(69.99), '#e8a317');
  assert.equal(colorProfundidad(70), '#e35b37');
  assert.equal(colorProfundidad(299.99), '#e35b37');
  assert.equal(colorProfundidad(300), '#7b3fb6');
  for (const nulo of [null, undefined, NaN, '12']) assert.equal(colorProfundidad(nulo), '#64748b');
});

test('radio por magnitud: creciente, acotado entre 3 y 18 y 4 sin magnitud (el nulo no es 0)', () => {
  assert.equal(radioMagnitud(null), 4);
  assert.equal(radioMagnitud(NaN), 4);
  assert.equal(radioMagnitud(0), 5);
  assert.equal(radioMagnitud(-1), 3);
  assert.equal(radioMagnitud(-5), 3);
  assert.equal(radioMagnitud(4), 13);
  assert.equal(radioMagnitud(9), 18);
  assert.ok(radioMagnitud(5) > radioMagnitud(4) && radioMagnitud(4) > radioMagnitud(3));
  assert.notEqual(radioMagnitud(null), radioMagnitud(0)); // sin magnitud ≠ magnitud 0
});

test('ficha del evento como texto, con ND y «Sin país asignado»', () => {
  // F5 amplía la ficha entregada con el tipo de magnitud y la fecha de actualización; las líneas originales no cambian
  const t = textoFicha({ place: 'Lugar', mag: 4.5, magType: 'mb', time: 1793113140000, updated: 1793113200000, country_name: 'España' }, 12, 'us1');
  assert.equal(t, 'Lugar\nMagnitud: 4.5\nTipo de magnitud: mb\nProfundidad: 12 km\nFecha UTC: 2026-10-27T14:59:00.000Z\nActualizado UTC: 2026-10-27T15:00:00.000Z\nPaís: España\nID: us1');
  const nulo = textoFicha({ place: null, mag: null, time: null, country_name: null }, null, undefined);
  assert.equal(nulo, 'Sin descripción\nMagnitud: ND\nTipo de magnitud: ND\nProfundidad: ND\nFecha UTC: ND\nActualizado UTC: ND\nPaís: Sin país asignado\nID: ND');
  assert.match(textoFicha({ place: '<img src=x onerror=alert(1)>', mag: 1, time: 0 }, 1, 'x'), /^<img src=x onerror=alert\(1\)>\n/); // se devuelve como texto: el componente lo asigna con textContent
});

test('numeroFinito y texto «sin valor»', () => {
  assert.equal(numeroFinito(0), 0);
  assert.equal(numeroFinito(null), null);
  assert.equal(numeroFinito(Infinity), null);
  assert.equal(textoOSinValor(null), 'sin valor');
  assert.equal(textoOSinValor(0, ' km'), '0 km'); // un cero real no es «sin valor»
  assert.equal(textoOSinValor(12.5, ' km'), '12.5 km');
  assert.equal(textoOSinValor(6.15000009536743, '', 2), '6.15'); // solo se redondea la presentación
  assert.equal(textoOSinValor(34.2513333333333, '', 3), '34.251');
  assert.equal(textoOSinValor(10, '', 2), '10'); // sin ceros sobrantes
  assert.equal(textoOSinValor(0, '', 2), '0'); // un cero real sigue siendo 0
  assert.equal(textoOSinValor(null, '', 2), 'sin valor');
});
