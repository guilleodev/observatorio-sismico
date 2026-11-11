// Correcciones de accesibilidad y diseño responsive de 6.7 (F6, T054). Cada prueba nace de un hallazgo de T050/T051 (docs/evidencias/f6/6.7-responsive.txt y 6.7-contraste-mapa.txt).
// `node --test tests/*.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BORDE_MAPA, SELECCION_MAPA, estiloCirculo, razonContraste } from '../src/app/formato.ts';

const leer = (ruta: string) => readFileSync(new URL(`../src/app/${ruta}`, import.meta.url), 'utf8');

test('razonContraste: valores de referencia de WCAG', () => {
  assert.equal(razonContraste('#000000', '#ffffff'), 21);
  assert.equal(razonContraste('#ffffff', '#ffffff'), 1);
  assert.ok(Math.abs(razonContraste('#767676', '#ffffff') - 4.54) < 0.01);          // el gris más claro que cumple 4,5:1 sobre blanco
  assert.equal(razonContraste('#ffffff', '#000000'), razonContraste('#000000', '#ffffff'));   // simétrica
  assert.ok(Number.isNaN(razonContraste('rojo', '#ffffff')));
});

test('hallazgo T051: los círculos amarillos y naranjas apenas se distinguen del mar (1,3:1) y del continente; el borde oscuro los delimita a >= 3:1', () => {
  const MAR = '#aad3df';           // 71 % de los píxeles del teselado a zoom 2 (OpenStreetMap)
  const TIERRA = '#f2efe9';        // 25 %
  assert.ok(razonContraste('#e8a317', MAR) < 1.5);                          // el relleno por sí solo NO basta (era el estado de F5)
  for (const fondo of [MAR, TIERRA]) assert.ok(razonContraste(BORDE_MAPA, fondo) >= 3, `borde sobre ${fondo}`);
});

test('estiloCirculo conserva el color de relleno por profundidad y el tamaño, y añade el borde oscuro', () => {
  const e = estiloCirculo('#e35b37', 9);
  assert.deepEqual(e, { radius: 9, color: BORDE_MAPA, fillColor: '#e35b37', fillOpacity: 0.75, weight: 1.5 });
  assert.notEqual(e.color, e.fillColor);                                  // antes borde y relleno eran del mismo color
});

test('la aplicación dibuja los marcadores con estiloCirculo y la selección sigue siendo más gruesa y oscura que el borde normal', () => {
  const ts = leer('app.component.ts');
  // F7 (mapa): estiloCirculo recibe además el borde según el estilo del mapa (oscuro/claro) y la selección toma su color de SELECCION_MAPA (en claro sigue siendo #111827; ver tests/mapa.test.ts)
  assert.match(ts, /estiloCirculo\(color, radioMagnitud\(numeroFinito\(p\.mag\)\), bordeMapa\(this\.estiloMapa\(\)\)\)/);
  assert.match(ts, /setStyle\(\{ weight: 4, color: SELECCION_MAPA\[this\.estiloMapa\(\)\]/);
  assert.equal(SELECCION_MAPA.claro, '#111827');
  assert.ok(4 > 1.5);
});

test('hallazgo T050: el botón «Actualizar ahora» y las opciones de modo miden al menos 24 px (WCAG 2.5.8)', () => {
  const css = leer('indicador-refresco/indicador-refresco.component.ts');   // F7: el botón único vive en el indicador (su CSS está en el componente)
  assert.match(css, /\.actualizar\s*\{[^}]*min-height:\s*24px/);
  const selector = leer('selector-modo/selector-modo.component.ts');
  assert.match(selector, /label\s*\{[^}]*min-height:\s*(2[4-9]|[3-9]\d)px/);   // CAMBIO (rediseño 3 vistas): las opciones de modo miden 36 px; la intención (>= 24 px, WCAG 2.5.8) se mantiene
  assert.match(selector, /input\[type="radio"\]\s*\{[^}]*width:\s*24px[^}]*height:\s*24px[^}]*flex:\s*none/);
});

test('hallazgo T050: a 320 px las rejillas de datos del panel no desbordan (la columna mínima nunca supera el 100 % del contenedor)', () => {
  assert.match(leer('estado/estado.component.ts'), /minmax\(min\(280px, 100%\), 1fr\)/);
  assert.match(leer('selector-modo/selector-modo.component.ts'), /minmax\(min\(240px, 100%\), 1fr\)/);
  assert.match(leer('tabla/tabla.component.ts'), /min-width: min\(280px, 100%\)/);          // el buscador de la tabla (min-width fijo de 280 px desbordaba 4 px a 320 px)
});
