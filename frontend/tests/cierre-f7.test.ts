// Cierre de F7: correcciones visuales acotadas (barra única, etiquetas largas, ficha sin ruido de coma flotante, leyenda del HUD). `node --test tests/*.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { disenoBarras, etiquetaRecortada } from '../src/app/graficas.ts';
import { filasFicha } from '../src/app/formato.ts';

const leer = (ruta: string) => readFileSync(new URL(`../src/app/${ruta}`, import.meta.url), 'utf8');
const margen = { izq: 40, der: 10, arr: 16, aba: 30 };

test('barras verticales: una sola barra no se ensancha a todo el lienzo y queda centrada; con muchas barras la geometría no cambia', () => {
  const una = disenoBarras([35], 826, 320, margen).barras[0];
  assert.ok(una.ancho <= 96);
  assert.ok(Math.abs(una.x + una.ancho / 2 - (margen.izq + (826 - margen.izq - margen.der) / 2)) < 1e-6);   // centrada en su hueco
  const muchas = disenoBarras(Array(24).fill(3), 826, 320, margen);
  const paso = muchas.anchoUtil / 24;
  assert.ok(Math.abs(muchas.barras[1].ancho - paso * 0.8) < 1e-9);
  assert.ok(Math.abs(muchas.barras[1].x - (margen.izq + paso + paso * 0.1)) < 1e-9);
});

test('etiquetaRecortada: recorta con «…» solo lo que no cabe', () => {
  assert.equal(etiquetaRecortada('Chile', 154), 'Chile');
  const largo = 'Bolivia (Plurinational State of)';
  const r = etiquetaRecortada(largo, 154);
  assert.ok(r.length < largo.length && r.endsWith('…'));
  assert.ok(r.length <= Math.floor(154 / 6.4));
});

test('ficha: la profundidad se muestra sin ruido de coma flotante', () => {
  const f = (p: number) => filasFicha({ place: 'x', mag: 1 }, p, 'id').filas.find((x) => x.etiqueta === 'Profundidad')?.valor;
  assert.equal(f(5.23000001907349), '5.23 km');
  assert.equal(f(35), '35 km');
  assert.equal(filasFicha({ place: 'x' }, null, 'id').filas.find((x) => x.etiqueta === 'Profundidad')?.valor, 'ND');
});

test('HUD derecho: la leyenda queda fija abajo si la pila hace scroll, y el detalle usa filas en línea', () => {
  const css = leer('app.component.css');
  assert.match(css, /\.pila-cuerpo > \.o-leyenda \{ position: sticky; bottom: 0;/);
  assert.match(css, /\.hud-pila \.leyenda-lista \{ display: grid; grid-template-columns: repeat\(2,/);
  assert.match(leer('detalle-evento/detalle-evento.component.ts'), /:host-context\(\.hud-pila\) \.det-filas > div \{ grid-template-columns: auto minmax\(0, 1fr\)/);
});

test('anuncio de refresco: tras «filtros rechazados», el correcto anuncia el cambio (no deja el aviso obsoleto)', async () => {
  const { anuncioRefresco } = await import('../src/app/refresco.ts');
  assert.match(anuncioRefresco('filtros-rechazados', 'correcto') ?? '', /ya no se rechazan/);
  assert.equal(anuncioRefresco('correcto', 'correcto'), null);
  assert.equal(anuncioRefresco(null, 'correcto'), null);
});
