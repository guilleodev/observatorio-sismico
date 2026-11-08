// Gráficas SVG (F5, paso 5.5, T034): geometría y etiquetas, sin calcular estadísticas. `node --test tests/*.test.ts`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  disenoBarras, disenoBarrasHorizontales, etiquetaHora, etiquetaIntervalo, itemsHora, itemsIntervalos, itemsPais, marcasEje, maximoRedondo, pasoEtiquetas, sumaItems,
} from '../src/app/graficas.ts';

const MARGEN = { izq: 40, der: 10, arr: 10, aba: 30 };

test('maximoRedondo: 1, 2, 5 × 10^k y nunca divide por cero', () => {
  assert.deepEqual([0, -3, 1, 1.2, 2, 3, 5, 6, 10, 11, 47, 130, 999].map(maximoRedondo), [1, 1, 1, 2, 2, 5, 5, 10, 10, 20, 50, 200, 1000]);
});

test('marcasEje: enteros (los recuentos son enteros)', () => {
  assert.deepEqual(marcasEje(1), [0, 1]);
  assert.deepEqual(marcasEje(2), [0, 1, 2]);
  assert.deepEqual(marcasEje(5), [0, 5]);
  assert.deepEqual(marcasEje(50), [0, 25, 50]);
});

test('disenoBarras: altura proporcional, un 0 mide 0 y todas las barras caben en el área útil', () => {
  const d = disenoBarras([0, 5, 10, 2], 400, 200, MARGEN);
  assert.equal(d.maximo, 10);
  assert.equal(d.anchoUtil, 350);
  assert.equal(d.altoUtil, 160);
  assert.deepEqual(d.barras.map((b) => b.alto), [0, 80, 160, 32]);
  for (const b of d.barras) {
    assert.ok(b.x >= MARGEN.izq && b.x + b.ancho <= MARGEN.izq + d.anchoUtil + 1e-9);
    assert.ok(b.y >= MARGEN.arr - 1e-9 && b.y + b.alto <= MARGEN.arr + d.altoUtil + 1e-9);
    assert.ok(Math.abs(b.y + b.alto - (MARGEN.arr + d.altoUtil)) < 1e-9); // todas descansan sobre el eje
  }
  assert.ok(d.barras[2].x > d.barras[1].x); // en orden de izquierda a derecha
});

test('disenoBarras con todo a cero o sin datos: sin NaN y eje 0–1', () => {
  for (const valores of [[0, 0, 0], []]) {
    const d = disenoBarras(valores, 400, 200, MARGEN);
    assert.equal(d.maximo, 1);
    assert.ok(d.barras.every((b) => b.alto === 0 && Number.isFinite(b.x) && Number.isFinite(b.y)));
  }
});

test('disenoBarras no inventa alturas mínimas: un 1 entre 1000 es una barra muy baja, no una barra visible falsa', () => {
  const d = disenoBarras([1, 1000], 400, 200, MARGEN);
  assert.ok(d.barras[0].alto > 0 && d.barras[0].alto < 0.5);
  assert.equal(d.barras[1].alto, d.altoUtil);
});

test('disenoBarrasHorizontales: longitud proporcional y filas en orden', () => {
  const d = disenoBarrasHorizontales([30, 10, 0], 400, 120, { izq: 100, der: 20, arr: 6, aba: 20 });
  assert.equal(d.maximo, 50);
  assert.deepEqual(d.barras.map((b) => Math.round(b.ancho)), [168, 56, 0]);
  assert.ok(d.barras[1].y > d.barras[0].y && d.barras[2].y > d.barras[1].y);
  assert.ok(d.barras.every((b) => b.x === 100));
});

test('pasoEtiquetas: ninguna etiqueta si caben, una de cada n si no', () => {
  assert.deepEqual([pasoEtiquetas(10, 12), pasoEtiquetas(25, 12), pasoEtiquetas(744, 12), pasoEtiquetas(0, 12)], [1, 3, 62, 1]);
});

test('etiquetaHora en UTC y etiquetaIntervalo con extremos abiertos (null, nunca Infinity)', () => {
  assert.equal(etiquetaHora(Date.UTC(2026, 10, 7, 5)), '07/11 05h');
  assert.equal(etiquetaHora(Date.UTC(2026, 0, 1, 23)), '01/01 23h');
  assert.equal(etiquetaHora(NaN), 'ND');
  assert.equal(etiquetaIntervalo(null, 0), '< 0');
  assert.equal(etiquetaIntervalo(0, 1), '0–1');
  assert.equal(etiquetaIntervalo(8, null), '≥ 8');
  assert.equal(etiquetaIntervalo(null, 10), '< 10');
  assert.equal(etiquetaIntervalo(500, null), '≥ 500');
  assert.equal(etiquetaIntervalo(null, null), 'todos');
});

test('itemsHora e itemsIntervalos conservan los recuentos de la API (incluidos los ceros) sin recalcular', () => {
  const horas = itemsHora({ unit: 'events/hour UTC', sin_valor: 0, items: [{ hour: Date.UTC(2026, 10, 7, 0), count: 3 }, { hour: Date.UTC(2026, 10, 7, 1), count: 0 }] });
  assert.deepEqual(horas.map((i) => [i.etiqueta, i.valor]), [['07/11 00h', 3], ['07/11 01h', 0]]);
  assert.equal(horas[0].detalle, '2026-11-07T00:00:00.000Z');
  assert.deepEqual(itemsHora({ unit: 'x', sin_valor: 0, items: null, motivo: 'ventana_demasiado_amplia', max_casillas: 744 }), []); // serie omitida: sin barras
  const mag = itemsIntervalos({ unit: 'magnitude', sin_valor: 2, items: [{ from: null, to: 0, count: 1 }, { from: 0, to: 1, count: 0 }, { from: 8, to: null, count: 4 }] });
  assert.deepEqual(mag.map((i) => [i.etiqueta, i.valor]), [['< 0', 1], ['0–1', 0], ['≥ 8', 4]]);
});

const PAISES = { unit: 'events', sin_valor: 1, items: [
  { country_id: 'USA', country_name: 'Estados Unidos', count: 50 }, { country_id: null, country_name: 'Sin país asignado', count: 30 },
  { country_id: 'CHL', country_name: 'Chile', count: 8 }, { country_id: 'JPN', country_name: 'Japón', count: 5 }, { country_id: 'IDN', country_name: 'Indonesia', count: 3 }, { country_id: 'PER', country_name: 'Perú', count: 1 },
] };

test('itemsPais: «Sin país asignado» siempre como barra propia y el resto agrupado en «Otros» sin perder recuento', () => {
  const todos = itemsPais(PAISES, 10);
  assert.deepEqual(todos.map((i) => i.etiqueta), ['Estados Unidos', 'Chile', 'Japón', 'Indonesia', 'Perú', 'Sin país asignado']);
  assert.equal(sumaItems(todos), 97);
  const corto = itemsPais(PAISES, 3); // 3 barras: 2 países + «Otros» + sin país
  assert.deepEqual(corto.map((i) => i.etiqueta), ['Estados Unidos', 'Chile', 'Otros (3 países)', 'Sin país asignado']);
  assert.equal(corto[2].valor, 9);
  assert.equal(sumaItems(corto), 97); // agrupar no cambia el total
  assert.equal(corto.at(-1)?.detalle, 'sin_pais');
});

test('itemsPais sin eventos o sin «Sin país»: listas coherentes', () => {
  assert.deepEqual(itemsPais({ unit: 'events', sin_valor: 0, items: [] }), []);
  assert.deepEqual(itemsPais({ unit: 'events', sin_valor: 0, items: [{ country_id: 'ESP', country_name: 'España', count: 2 }] }).map((i) => i.etiqueta), ['España']);
});
