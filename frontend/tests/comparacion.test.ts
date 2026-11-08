// Tarjeta de comparación con 2025 (F5, paso 5.5, T035): redacción neutral, fuentes separadas y avisos. `node --test tests/*.test.ts`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advertencias, etiquetaMotivo, filasComparacion, textoAmbito, textoVariacion } from '../src/app/comparacion.ts';

function comparacion(extra: Record<string, unknown> = {}, historico: Record<string, unknown> | null | undefined = undefined) {
  return {
    unit: 'events', comparacion_disponible: true, ambito: 'global', country_id: null, min_mag_solicitada: null, min_mag_efectiva: 4, min_mag_elevada: true,
    reciente: { source: 'live', count: 15, sin_magnitud: 1, desde: 0, hasta: 86_400_000, dias: 1 },
    historico: historico === null ? null : { source: 'historico', periodo: { desde: '2025-01-01', hasta: '2026-01-01' }, dias: 365, total: 18302, media_diaria: 50.1425, mediana_diaria: 43, esperado_para_ventana: 50.1425, ...historico },
    variacion: -0.7009, variacion_definida: true, periodo_reciente_incompleto: false, motivos_incompleto: [], ...extra,
  } as never;
}

test('variación: porcentaje con signo y sin lenguaje de «descenso» o «aumento»', () => {
  assert.equal(textoVariacion(comparacion({ variacion: -0.7009 })), '−70 %');
  assert.equal(textoVariacion(comparacion({ variacion: 0.0543 })), '+5,4 %');
  assert.equal(textoVariacion(comparacion({ variacion: 7.43 })), '+743 %');
  assert.equal(textoVariacion(comparacion({ variacion: 0 })), '+0,0 %');
  for (const v of [-0.7, 0.3, 0]) assert.doesNotMatch(textoVariacion(comparacion({ variacion: v })), /descenso|aumento|desciende|sube|baja/i);
});

test('con media 0 la variación es «no definida», nunca 0 ni infinito', () => {
  const c = comparacion({ variacion: null, variacion_definida: false }, { total: 0, media_diaria: 0, mediana_diaria: 0, esperado_para_ventana: 0 });
  assert.match(textoVariacion(c), /^no definida/);
  assert.doesNotMatch(textoVariacion(c), /%|Infinity|NaN/);
});

test('las filas llevan SIEMPRE su fuente y no mezclan el recuento reciente con el histórico', () => {
  const filas = filasComparacion(comparacion());
  const reciente = filas.filter((f) => f.fuente.includes('(live)'));
  const historico = filas.filter((f) => f.fuente.includes('(historico)'));
  assert.equal(reciente.length, 2);
  assert.equal(historico.length, 4);
  assert.ok(filas.every((f) => f.fuente !== ''));
  assert.deepEqual(filas[0], { concepto: 'Terremotos del periodo con magnitud ≥ 4', valor: '15', fuente: 'Feed en vivo (live)' });
  assert.equal(filas.find((f) => f.concepto.startsWith('Terremotos de 2025'))?.valor, '18302');
  assert.equal(filas.find((f) => f.concepto.startsWith('Media diaria'))?.valor, '50,14');
  assert.equal(filas.find((f) => f.concepto.startsWith('Esperado'))?.valor, '50,1');
  assert.equal(filas.find((f) => f.concepto.startsWith('Eventos del periodo sin magnitud'))?.valor, '1'); // los nulos van aparte
  assert.equal(filas.at(-1)?.valor, '−70 %');
});

test('sin histórico cargado no hay filas de 2025 ni valores inventados, y se avisa', () => {
  const c = comparacion({ comparacion_disponible: false, variacion: null, variacion_definida: false }, null);
  const filas = filasComparacion(c);
  assert.equal(filas.filter((f) => f.fuente.includes('(historico)')).length, 0);
  assert.equal(filas.length, 3);
  assert.match(advertencias(c).noDisponible ?? '', /no hay histórico/);
  assert.equal(advertencias(comparacion()).noDisponible, null);
});

test('la magnitud elevada a 4 se indica y la efectiva por debajo de 4,5 avisa de cobertura menor', () => {
  const a = advertencias(comparacion());
  assert.match(a.magnitudElevada ?? '', /magnitud ≥ 4/);
  assert.match(a.coberturaBaja ?? '', /cobertura del feed en vivo es menor/);
  assert.match(a.coberturaBaja ?? '', /no a un cambio real/);
  const b = advertencias(comparacion({ min_mag_elevada: false, min_mag_efectiva: 4.5 }));
  assert.equal(b.magnitudElevada, null);
  assert.equal(b.coberturaBaja, null);
  assert.equal(filasComparacion(comparacion({ min_mag_efectiva: 4.5 }))[0].concepto, 'Terremotos del periodo con magnitud ≥ 4,5');
});

test('periodo reciente incompleto: aviso y un motivo legible por cada código de la API', () => {
  const c = comparacion({ periodo_reciente_incompleto: true, motivos_incompleto: ['hueco_pendiente', 'antes_de_cobertura', 'hasta_ahora', 'despues_de_ultima_lectura'] });
  const a = advertencias(c);
  assert.match(a.incompleto ?? '', /puede estar incompleto/);
  assert.equal(a.motivos.length, 4);
  assert.match(a.motivos[0], /hueco de ingesta/);
  assert.match(a.motivos[1], /antes de la cobertura/);
  assert.match(a.motivos[2], /retraso/);
  assert.match(a.motivos[3], /última lectura/);
  assert.equal(etiquetaMotivo('motivo_desconocido'), 'motivo_desconocido'); // un código nuevo no rompe el panel
  const completo = advertencias(comparacion());
  assert.equal(completo.incompleto, null);
  assert.deepEqual(completo.motivos, []);
});

test('ámbito legible', () => {
  assert.equal(textoAmbito(comparacion()), 'todo el mundo');
  assert.equal(textoAmbito(comparacion({ ambito: 'sin_pais' })), 'Sin país asignado');
  assert.equal(textoAmbito(comparacion({ ambito: 'pais', country_id: 'ESP' }), 'España'), 'país España');
  assert.equal(textoAmbito(comparacion({ ambito: 'pais', country_id: 'ESP' })), 'país ESP');
});
