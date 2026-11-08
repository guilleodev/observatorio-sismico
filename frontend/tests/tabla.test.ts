// Tabla consultable (F5, paso 5.5, T032): filas, orden, búsqueda, paginación y selección. `node --test tests/*.test.ts`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNAS, ORDEN_INICIAL, buscar, claseProfundidad, filaDe, idDe, normalizar, ordenar, paginaDe, paginar, siguienteOrden } from '../src/app/tabla.ts';

function evento(id: string | undefined, mag: number | null, prof: number | null, extra: Record<string, unknown> = {}, time = 1000) {
  return { type: 'Feature', ...(id === undefined ? {} : { id }), geometry: { type: 'Point', coordinates: [-70.5, -33.4, prof] }, properties: { mag, magType: 'ml', place: 'Lugar', time, updated: time + 5, country_id: 'CHL', country_name: 'Chile', ...extra } } as never;
}
const filas = (...evs: unknown[]) => evs.map((e, i) => filaDe(e as never, i));

test('las columnas son los campos del contrato: propiedades, coordenadas e id', () => {
  assert.deepEqual(COLUMNAS.map((c) => c.clave), ['time', 'mag', 'magTipo', 'profundidad', 'clase', 'lugar', 'pais', 'lon', 'lat', 'actualizado', 'id']);
  assert.deepEqual(ORDEN_INICIAL, { clave: 'time', direccion: 'desc' });
});

test('filaDe normaliza: nulos como null (nunca 0), país nulo como «Sin país asignado», clase de profundidad en texto', () => {
  const f = filaDe(evento('a1', 4.5, 12, { country_id: null, country_name: null, magType: null }), 0);
  assert.deepEqual([f.id, f.mag, f.profundidad, f.clase, f.pais, f.paisId, f.magTipo, f.lon, f.lat], ['a1', 4.5, 12, 'Menos de 70 km', 'Sin país asignado', null, null, -70.5, -33.4]);
  const n = filaDe(evento('a2', null, null, { place: '' }), 1);
  assert.deepEqual([n.mag, n.profundidad, n.clase, n.lugar], [null, null, 'sin valor', 'Sin descripción']);
  const raro = filaDe({ type: 'Feature', geometry: null, properties: { mag: NaN, place: 'x', time: Infinity, updated: 1 } } as never, 2);
  assert.deepEqual([raro.mag, raro.tiempo, raro.lon, raro.lat, raro.profundidad], [null, null, null, null, null]); // NaN e Infinity nunca llegan a la tabla
});

test('clase de profundidad con los mismos cortes que la leyenda del mapa', () => {
  assert.deepEqual([0, -3, 69.99, 70, 299.99, 300, 700].map(claseProfundidad), ['Menos de 70 km', 'Menos de 70 km', 'Menos de 70 km', '70–299,99 km', '70–299,99 km', '300 km o más', '300 km o más']);
  assert.equal(claseProfundidad(null), 'sin valor');
});

test('identificador del evento: el de la API o uno derivado de la posición, igual para mapa y tabla', () => {
  assert.equal(idDe(evento('us1', 1, 1), 5), 'us1');
  assert.equal(idDe(evento(undefined, 1, 1), 5), 'sin-id-5');
  assert.equal(idDe({ id: 0, properties: {} } as never, 2), '0');
});

test('ordenar: numérico, texto y los nulos SIEMPRE al final en ambos sentidos; la entrada no se modifica', () => {
  const f = filas(evento('a', 3, 10, {}, 300), evento('b', null, 20, {}, 100), evento('c', 5, null, {}, 200), evento('d', 4, 30, {}, 400));
  const original = f.map((x) => x.id);
  assert.deepEqual(ordenar(f, { clave: 'mag', direccion: 'asc' }).map((x) => x.id), ['a', 'd', 'c', 'b']); // 3, 4, 5, null
  assert.deepEqual(ordenar(f, { clave: 'mag', direccion: 'desc' }).map((x) => x.id), ['c', 'd', 'a', 'b']); // 5, 4, 3, null: el nulo sigue al final
  assert.deepEqual(ordenar(f, { clave: 'profundidad', direccion: 'desc' }).map((x) => x.id), ['d', 'b', 'a', 'c']);
  assert.deepEqual(ordenar(f, { clave: 'time', direccion: 'desc' }).map((x) => x.id), ['d', 'a', 'c', 'b']);
  assert.deepEqual(f.map((x) => x.id), original);
});

test('ordenar texto con tildes y números, y desempate estable por id', () => {
  const f = filas(evento('b2', 1, 1, { place: 'Ñuble' }), evento('c3', 1, 1, { place: 'arica' }), evento('a1', 1, 1, { place: 'Arica' }), evento('d4', 1, 1, { place: 'Zárate' }));
  assert.deepEqual(ordenar(f, { clave: 'lugar', direccion: 'asc' }).map((x) => x.id), ['a1', 'c3', 'b2', 'd4']); // «Arica» = «arica» (empate por id), luego Ñuble, Zárate
  const ids = filas(evento('us10', 1, 1), evento('us9', 1, 1), evento('us100', 1, 1));
  assert.deepEqual(ordenar(ids, { clave: 'id', direccion: 'asc' }).map((x) => x.id), ['us9', 'us10', 'us100']); // orden natural
});

test('siguienteOrden: la misma columna invierte; una nueva empieza por lo más reciente o mayor', () => {
  assert.deepEqual(siguienteOrden({ clave: 'time', direccion: 'desc' }, 'time'), { clave: 'time', direccion: 'asc' });
  assert.deepEqual(siguienteOrden({ clave: 'time', direccion: 'asc' }, 'time'), { clave: 'time', direccion: 'desc' });
  assert.deepEqual(siguienteOrden(ORDEN_INICIAL, 'mag'), { clave: 'mag', direccion: 'desc' });
  assert.deepEqual(siguienteOrden(ORDEN_INICIAL, 'lugar'), { clave: 'lugar', direccion: 'asc' });
});

test('buscar: sin tildes ni mayúsculas, todas las palabras, por lugar, país, id, tipo y «sin magnitud»', () => {
  const f = filas(evento('a1', 4.5, 10, { place: '10 km al N de Lima', country_name: 'Perú' }), evento('b2', null, 10, { place: 'Costa afuera', country_id: null, country_name: null }), evento('c3', 2.1, 200, { place: 'Tokio', country_name: 'Japón', magType: 'mb' }));
  assert.equal(normalizar('  Perú  '), 'peru');
  assert.deepEqual(buscar(f, 'peru').map((x) => x.id), ['a1']);
  assert.deepEqual(buscar(f, 'LIMA perú').map((x) => x.id), ['a1']);
  assert.deepEqual(buscar(f, 'lima japon').map((x) => x.id), []); // todas las palabras deben aparecer
  assert.deepEqual(buscar(f, 'sin pais').map((x) => x.id), ['b2']);
  assert.deepEqual(buscar(f, 'sin magnitud').map((x) => x.id), ['b2']);
  assert.deepEqual(buscar(f, 'mb').map((x) => x.id), ['c3']);
  assert.deepEqual(buscar(f, 'c3').map((x) => x.id), ['c3']);
  assert.equal(buscar(f, '   ').length, 3); // búsqueda vacía = todo
  assert.equal(buscar(f, 'zzz').length, 0);
});

test('paginar: tamaño, rango válido y página vacía coherente', () => {
  const f = filas(...Array.from({ length: 53 }, (_, i) => evento(`e${String(i).padStart(2, '0')}`, 1, 1)));
  const p1 = paginar(f, 1, 25);
  assert.deepEqual([p1.filas.length, p1.pagina, p1.paginas, p1.desde, p1.hasta, p1.total], [25, 1, 3, 1, 25, 53]);
  const p3 = paginar(f, 3, 25);
  assert.deepEqual([p3.filas.length, p3.desde, p3.hasta], [3, 51, 53]);
  assert.equal(paginar(f, 99, 25).pagina, 3); // se ajusta al rango, no queda una página inexistente
  assert.equal(paginar(f, 0, 25).pagina, 1);
  assert.equal(paginar(f, NaN, 25).pagina, 1);
  const vacia = paginar([], 1, 25);
  assert.deepEqual([vacia.filas.length, vacia.pagina, vacia.paginas, vacia.desde, vacia.hasta, vacia.total], [0, 1, 1, 0, 0, 0]);
});

test('paginaDe mantiene visible la selección: devuelve la página del evento o null si no está', () => {
  const f = filas(...Array.from({ length: 60 }, (_, i) => evento(`e${i}`, 1, 1)));
  assert.equal(paginaDe(f, 'e0', 25), 1);
  assert.equal(paginaDe(f, 'e24', 25), 1);
  assert.equal(paginaDe(f, 'e25', 25), 2);
  assert.equal(paginaDe(f, 'e59', 25), 3);
  assert.equal(paginaDe(f, 'no-existe', 25), null);
});

test('un texto con HTML se conserva tal cual como dato (el componente lo muestra con interpolación de Angular, que lo escapa)', () => {
  const f = filaDe(evento('x', 1, 1, { place: '<script>alert(1)</script>', country_name: '<img src=x onerror=1>' }), 0);
  assert.equal(f.lugar, '<script>alert(1)</script>');
  assert.equal(f.pais, '<img src=x onerror=1>');
  assert.deepEqual(buscar([f], 'script').map((x) => x.id), ['x']); // se puede buscar como texto, sin interpretarse
});

test('con muchos empates (regresión de rendimiento de 5.7) el orden es determinista y completo: 20 000 filas con la misma magnitud salen por id', () => {
  const f = filas(...Array.from({ length: 20000 }, (_, i) => evento(`e${String((i * 7919) % 20000).padStart(5, '0')}`, 4.5, 10)));
  const orden = ordenar(f, { clave: 'mag', direccion: 'desc' }).map((x) => x.id);
  assert.equal(orden.length, 20000);
  assert.deepEqual(orden, [...orden].sort()); // todos empatan en magnitud: el desempate por id da el orden alfabético
  assert.equal(new Set(orden).size, 20000);
});
