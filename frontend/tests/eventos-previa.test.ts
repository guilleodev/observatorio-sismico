// Pulido final de la vista Eventos (F7): fila completa seleccionable, vista previa 3D con UNA sola instancia de Three.js, fechas legibles, alturas coherentes. `node --test tests/*.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALTURA_CABECERA_TABLA, ALTURA_FILA, FILAS_VISIBLES, PREVIA, SELECTOR_CONTROLES, alturaContenedor, coordenadasValidas, fechaLegible, partirFecha, textoDatosPrevia } from '../src/app/tabla-vista.ts';
import { posicionarTooltip } from '../src/app/graficas-tooltip.ts';

const leer = (ruta: string) => readFileSync(new URL(`../src/app/${ruta}`, import.meta.url), 'utf8');
const tabla = () => leer('tabla/tabla.component.ts');

test('fechaLegible: «11 nov 2026» / «10:25:31.800 UTC» sin perder información; ND y textos no ISO quedan tal cual', () => {
  assert.deepEqual(fechaLegible('2026-11-11T10:25:31.800Z'), { dia: '11 nov 2026', hora: '10:25:31.800 UTC' });
  assert.deepEqual(fechaLegible('2025-01-05T00:00:00Z'), { dia: '5 ene 2025', hora: '00:00:00 UTC' });
  assert.deepEqual(fechaLegible('2026-12-31T23:59:59.999Z'), { dia: '31 dic 2026', hora: '23:59:59.999 UTC' });
  assert.deepEqual(fechaLegible('ND'), { dia: 'ND', hora: '' });
  assert.deepEqual(fechaLegible('2026-13-01T00:00:00Z'), { dia: '2026-13-01T00:00:00Z', hora: '' });
  // la partición ISO anterior sigue existiendo y sigue siendo exacta (búsqueda y lectores)
  const [a, b] = partirFecha('2026-11-11T10:25:31.800Z'); assert.equal(a + b, '2026-11-11T10:25:31.800Z');
});

test('alturas coherentes: el contenedor mide cabecera + filas ENTERAS (la última fila visible no queda cortada)', () => {
  for (const d of ['comoda', 'compacta'] as const) {
    assert.equal(alturaContenedor(d), ALTURA_CABECERA_TABLA + FILAS_VISIBLES[d] * ALTURA_FILA[d] + 1);
    assert.ok(Number.isInteger(FILAS_VISIBLES[d]));
  }
  const c = tabla();
  assert.match(c, /max-height: var\(--alto-max\)/); assert.match(c, /\[style\.--alto-max\]="alturaMax\(\) \+ 'px'"/);
  assert.match(c, /readonly alturaMax = computed\(\(\) => alturaContenedor\(this\.densidad\(\)\)\)/);
  assert.match(c, /thead th \{[^}]*height: 44px/);                                   // la cabecera sticky mide lo que supone alturaContenedor
  // la fila seleccionada no crece: la celda del lugar no envuelve y el botón cabe en la altura de la fila
  assert.match(c, /\.celda-lugar \{[^}]*flex-wrap: nowrap[^}]*height: calc\(var\(--alto-fila\) - 1px\)/);   // 1 px menos: la altura de la celda incluye su línea inferior
  assert.match(c, /\.ver-visor \{[^}]*height: calc\(var\(--alto-fila\) - 6px\)/);   // 24 px en la fila compacta (objetivo táctil mínimo) y 36 px como máximo
  assert.match(c, /th, td \{ box-sizing: border-box;/);                                                      // la altura de celda INCLUYE la línea inferior: fila = --alto-fila exacta (44 / 30 px)
});

test('fila completa: el clic en cualquier parte de la fila selecciona; los controles interiores no la disparan dos veces', () => {
  const c = tabla();
  assert.match(c, /<tr [^>]*\(click\)="pulsarFila\(\$event, f\.id\)"/);
  const m = /pulsarFila\(evento: MouseEvent, id: string\): void \{([\s\S]*?)\n  \}/.exec(c)?.[1] ?? '';
  assert.match(m, /closest\(SELECTOR_CONTROLES\)/); assert.match(m, /return;/); assert.match(m, /getSelection\(\)\?\.toString\(\)/); assert.match(m, /this\.elegir\(id\)/);
  for (const t of ['button', 'a', 'input', 'select', 'summary']) assert.ok(SELECTOR_CONTROLES.split(', ').includes(t), t);
  // el botón del lugar sigue siendo el control accesible por teclado (Intro/Espacio) y conserva su handler
  assert.match(c, /<button type="button" class="fila"[^>]*\(click\)="elegir\(f\.id\)"/);
  assert.match(c, /tbody tr \{ cursor: pointer; \}/); assert.match(c, /tbody tr:hover \.fila \{ color: var\(--acento-texto\); \}/);
});

test('vista previa: lógica pura (datos con ND, coordenadas válidas, tamaños y retardos)', () => {
  assert.equal(textoDatosPrevia(5.6, 35), 'M 5.6 · 35 km');
  assert.equal(textoDatosPrevia(null, null), 'M ND · profundidad ND');
  assert.equal(textoDatosPrevia(0.52, 1.53999996185303), 'M 0.52 · 1.54 km');   // sin ruido de coma flotante
  assert.equal(textoDatosPrevia(0, 0), 'M 0 · 0 km');          // un 0 real se muestra; solo lo ausente es ND
  assert.ok(coordenadasValidas(10, 20)); assert.ok(!coordenadasValidas(null, 20)); assert.ok(!coordenadasValidas(91, 0)); assert.ok(!coordenadasValidas(0, 181)); assert.ok(!coordenadasValidas(NaN, 0));
  assert.ok(PREVIA.retardoAbrirMs >= 150 && PREVIA.retardoCerrarMs >= 100);
  // el popover no se sale de la ventana ni queda bajo la cabecera: se coloca con la misma función que los tooltips de las gráficas
  const cont = { ancho: 1000, alto: 700 };
  const arriba = posicionarTooltip({ x: 400, y: 300, ancho: 120, alto: 20 }, { ancho: PREVIA.ancho, alto: PREVIA.alto }, cont, PREVIA.separacion, 'arriba');
  assert.equal(arriba.lado, 'arriba'); assert.ok(arriba.y + PREVIA.alto <= 300);
  const borde = posicionarTooltip({ x: 940, y: 5, ancho: 60, alto: 20 }, { ancho: PREVIA.ancho, alto: PREVIA.alto }, cont, PREVIA.separacion, 'arriba');
  assert.ok(borde.x >= 0 && borde.x + PREVIA.ancho <= cont.ancho && borde.y >= 0 && borde.lado === 'abajo');
});

test('vista previa: UNA sola instancia de Three.js para toda la tabla, carga perezosa, sin bucle de animación y con limpieza', () => {
  const c = tabla(); const p = leer('globo/previa.ts');
  // la tabla no importa three ni crea renderers: solo importa el módulo previa con import() dinámico y su tipo
  assert.doesNotMatch(c, /from 'three'|new WebGLRenderer|requestAnimationFrame/);
  assert.equal((c.match(/import\('\.\.\/globo\/previa'\)/g) ?? []).length, 1);
  assert.equal((c.match(/new modulo\.PreviaGlobo\(/g) ?? []).length, 1);
  assert.match(c, /import type \{ PreviaGlobo \} from '\.\.\/globo\/previa'/);
  assert.match(c, /private promesaMotor: Promise<PreviaGlobo \| null> \| null = null/);
  assert.match(c, /if \(this\.promesaMotor\) return this\.promesaMotor/);               // la creación se comparte: nunca una instancia por fila ni por apertura
  assert.equal((c.match(/<canvas /g) ?? []).length, 1);                                  // un único lienzo en toda la plantilla
  // fallback sin WebGL: solo texto
  assert.match(c, /hayWebgl\(\)/); assert.match(c, /previaSinWebgl\.set\(true\)/); assert.match(c, /Globo 3D no disponible en este navegador/);
  // limpieza
  assert.match(c, /onDestroy\(\(\) => \{[^}]*this\.motor\?\.destruir\(\)/);
  assert.match(p, /destruir\(\): void \{[\s\S]*this\.renderer\.dispose\(\)[\s\S]*forceContextLoss\(\)/); assert.match(p, /textura\?\.dispose\(\)/);
  // UN fotograma por apertura: sin bucle
  assert.doesNotMatch(p, /requestAnimationFrame|setAnimationLoop/);
  assert.equal((p.match(/this\.renderer\.render\(/g) ?? []).length, 1);
  assert.match(p, /dibujarTierra\(ctx, geojson, 1024, 512/);                              // reutiliza la misma textura de la Tierra del globo principal, a 1024×512
  assert.equal((p.match(/new WebGLRenderer\(/g) ?? []).length, 1);
});

test('vista previa: hover con retardo, foco por teclado, táctil con botón propio, Escape, clic = «Ver en el globo» sin duplicar la selección', () => {
  const c = tabla();
  assert.match(c, /\(pointerenter\)="alEntrarLugar\(f, \$event\)"/); assert.match(c, /\(pointerleave\)="alSalirLugar\(\$event\)"/);
  assert.match(c, /\(focus\)="alEnfocarLugar\(f, \$event\)"/); assert.match(c, /matches\(':focus-visible'\)/);                      // el clic con ratón no «enfoca» una segunda vista previa
  assert.match(c, /pointerType === 'mouse'/);                                                                                          // el hover solo con ratón
  assert.match(c, /\.previa-abrir \{ display: none;/); assert.match(c, /@media \(hover: none\) \{ \.previa-abrir \{ display: inline-flex; \} \}/);   // acceso táctil sin hover
  assert.match(c, /class="previa-abrir" \[attr\.aria-label\]="'Vista previa en el globo: ' \+ f\.lugar" \[attr\.aria-expanded\]/);
  assert.match(c, /'\(document:keydown\.escape\)': 'cerrarPrevia\(\)'/);                                                              // se cierra con Escape (WCAG 1.4.13)
  assert.match(c, /e\.key === 'Enter' && e\.shiftKey/);                                                                               // vía de teclado hacia el Panel
  assert.match(c, /if \(id !== this\.seleccionado\(\)\) this\.seleccionar\.emit\(id\);[^\n]*\n\s*this\.verVisor\.emit\(\);/);          // elegir() desde la tabla alterna: no se vuelve a emitir si ya estaba seleccionado
  assert.match(c, /\(pointerenter\)="mantenerPrevia\(\)"/);                                                                            // el popover es «hoverable»: se puede pasar el ratón sobre él
  assert.match(c, /\.previa \{ position: fixed;[^}]*visibility: hidden;[^}]*pointer-events: none;/);                                  // fijo: no desplaza la tabla; oculto sin parpadeo
  assert.match(c, /\.previa\.abierta \{ visibility: visible; opacity: 1; pointer-events: auto; \}/);
  assert.match(c, /@media \(prefers-reduced-motion: no-preference\) \{ \.previa \{ transition: opacity \.12s ease; \} \}/);             // sin movimiento reducido: sin fundido
  assert.match(c, /posicionarTooltip\(/); assert.match(c, /--alto-cabecera/);                                                           // acotada y por debajo de la cabecera sticky
  assert.doesNotMatch(c, /transition: all|localStorage|sessionStorage|innerHTML|backdrop-filter/);
});

test('REPRODUCCIÓN: la vista previa y la selección usan el tratamiento violeta; la fecha mantiene el ISO completo en <time datetime>', () => {
  const c = tabla();
  assert.match(c, /\.tabla\.replay \.previa \{ border-top-color: var\(--replay\); \}/);
  assert.match(c, /<time class="tiempo" \[attr\.datetime\]="isoONulo\(f\.tiempo\)">/); assert.match(c, /<time class="tiempo" \[attr\.datetime\]="isoONulo\(f\.actualizado\)">/);
  assert.match(c, /\.tiempo \.f-h \{[^}]*font-size: \.75rem/);                          // texto secundario ≥ .75rem
});
