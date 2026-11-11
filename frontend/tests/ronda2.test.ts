// Rediseño en tres vistas, RONDA 2 (Panel centro de control, Análisis y Eventos con búsqueda y paginación): lógica pura y estructura de las plantillas. `node --test tests/*.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estadoUnico, incidencias, notaCargadosPeriodo, textoEstadoIngesta } from '../src/app/estado-datos/estado-datos.ts';
import type { AvisoEntrada, Indicador } from '../src/app/estado-datos/estado-datos.ts';
import { TAMANOS_PAGINA, TAMANO_PAGINA_INICIAL, botonesPagina, clasificarSeleccion, etiquetaBusqueda, notaHayMasEnPeriodo, paginaTrasCambioTamano, tamanoPaginaValido, textoCargadosDelPeriodo, textoResumenTabla } from '../src/app/tabla-filtro.ts';
import { buscar, filaDe, normalizar, paginaDe, paginar } from '../src/app/tabla.ts';

const app = (r: string) => readFileSync(new URL(`../src/app/${r}`, import.meta.url), 'utf8');
const html = () => app('app.component.html');

// ---------- incidencias y estado único ----------
const aviso = (codigo: string, severidad: AvisoEntrada['severidad'] = 'aviso', texto = 'x'): AvisoEntrada => ({ codigo, severidad, titulo: codigo, texto });

test('incidencias(): solo acceso, conexión, filtros rechazados, datos desactualizados y huecos; el resto de avisos se queda en Metodología', () => {
  const lista = incidencias([aviso('sin-ejecuciones', 'info'), aviso('sin-conexion', 'error'), aviso('recuperado', 'info'), aviso('truncado'), aviso('sin-eventos', 'info'), aviso('huecos', 'aviso', 'Hay 2 huecos de ingesta sin recuperar.')]);
  assert.deepEqual(lista.map((i) => i.codigo), ['sin-conexion', 'huecos']);              // conserva el orden (de más a menos grave)
  assert.equal(lista[0].severidad, 'error');
  assert.equal(lista[1].texto, 'Hay 2 huecos de ingesta sin recuperar.');               // los huecos conservan el recuento del aviso
  assert.deepEqual(incidencias([]), []);                                                // sin incidencias no hay banda
  for (const c of ['acceso-denegado', 'sin-conexion', 'filtros-rechazados', 'datos-desactualizados', 'huecos']) assert.equal(incidencias([aviso(c)]).length, 1, c);
});

test('incidencias(): cada una lleva icono + título + texto (nunca solo color) y la severidad es error solo para «sin conexión»', () => {
  const todas = incidencias(['acceso-denegado', 'sin-conexion', 'filtros-rechazados', 'datos-desactualizados', 'huecos'].map((c) => aviso(c, 'aviso', 'Hay 1 hueco de ingesta sin recuperar.')));
  for (const i of todas) { assert.ok(i.icono !== ''); assert.ok(i.titulo.length > 3); assert.ok(i.texto.length > 3); }
  assert.deepEqual(todas.filter((i) => i.severidad === 'error').map((i) => i.codigo), ['sin-conexion']);
  assert.match(todas.find((i) => i.codigo === 'acceso-denegado')!.texto, /clave/);
});

test('estadoUnico(): lo más grave manda y, con todo bien, junta conexión + datos; en reproducción conserva el tono violeta', () => {
  const ok = (t: string): Indicador => ({ tono: 'ok', icono: '✓', texto: t });
  const err: Indicador = { tono: 'error', icono: '✕', texto: 'Sin conexión con la API' };
  const aviso1: Indicador = { tono: 'aviso', icono: '⚠', texto: 'Datos desactualizados' };
  assert.deepEqual(estadoUnico(err, aviso1), err);
  assert.deepEqual(estadoUnico(ok('API accesible'), aviso1), aviso1);
  assert.equal(estadoUnico(ok('API accesible'), ok('Datos al día')).texto, 'API accesible · Datos al día');
  assert.equal(estadoUnico({ tono: 'neutro', icono: '–', texto: 'Sin lectura todavía' }, ok('Sin lectura todavía')).tono, 'neutro');
  assert.equal(estadoUnico(ok('API accesible'), { tono: 'replay', icono: '▶', texto: 'Reproducción histórica' }).tono, 'replay');
  assert.ok(estadoUnico(ok('a'), ok('b')).icono !== '');
});

test('textos cortos del KPI: ingesta USGS (en REPRODUCCIÓN es la EN VIVO, distinta de la última lectura del frontend) y «N cargados»', () => {
  assert.equal(textoEstadoIngesta('hace 12 s al consultar', false), 'Ingesta USGS: hace 12 s al consultar');
  assert.equal(textoEstadoIngesta('sin dato', true), 'Ingesta USGS en vivo: sin dato');
  assert.equal(notaCargadosPeriodo(12345), '12.345 cargados');         // miles en español (es-ES no agrupa los de 4 cifras)
  assert.doesNotMatch(textoEstadoIngesta('x', false), /frontend/);
});

test('KPI en la plantilla: 5 principales en .kpis y todo lo demás en el desplegable «Más detalles de la lectura»; UNA región viva', () => {
  const c = app('estado-datos/estado-datos.component.ts');
  const kpis = /<ul class="kpis">([\s\S]*?)<\/ul>/.exec(c)?.[1] ?? '';
  const detalles = /<details class="detalles">([\s\S]*?)<\/details>/.exec(c)?.[1] ?? '';
  assert.ok(kpis.length > 0 && detalles.length > 0);
  for (const t of ['Terremotos en el periodo', 'Magnitud máxima', 'Eventos ≥ M4.5', 'Países con eventos', 'Visualizados', '>Estado<']) assert.ok(kpis.includes(t), t);
  assert.match(kpis, /\{\{ total\(\) \?\? 'ND' \}\}/);                                           // total de la API; «N cargados» como nota
  assert.match(kpis, /\{\{ notaPeriodo\(\) \}\}/);
  assert.match(kpis, /\{\{ estadoKpi\(\)\.icono \}\}[\s\S]*\{\{ estadoKpi\(\)\.texto \}\}/);        // icono + texto
  assert.match(kpis, /\{\{ ingestaCorta\(\) \}\}/);
  assert.equal((kpis.match(/<li class="kpi/g) ?? []).length, 6);                                 // 6 en el código = 5 visibles (Países con eventos y Visualizados son excluyentes por @if/@else)
  assert.match(kpis, /@if \(nPaisesPeriodo\(\) !== null\)[\s\S]*\} @else \{/);
  for (const t of ['Última lectura del frontend', 'Última ingesta USGS', 'Conexión', 'Datos', 'Países (catálogo)', 'Terremotos visualizados', 'Última lectura UTC', 'Generación de la respuesta UTC', 'Filtros activos', 'Periodo consultado (UTC)']) {
    assert.ok(detalles.includes(t), t);
    assert.ok(!kpis.includes(`>${t}<`), `${t} no es una tarjeta principal`);
  }
  assert.match(detalles, /readonly|\{\{ lecturaFrontend\(\) \}\}/);
  assert.equal((c.match(/aria-live="polite"/g) ?? []).length, 1);
  assert.match(c, /@container \(min-width: 900px\) \{ \.kpis \{ grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
});

test('banda de incidencias: en el marco común (antes de las vistas), sin región viva ni role alert/status, con enlace a Metodología y sin duplicar mensajes', () => {
  const h = html();
  const ini = h.indexOf('<section class="incidencias o-incidencias"');
  assert.ok(ini > h.indexOf('<app-acceso') && ini < h.indexOf('id="vista-panel"'));              // marco común: tras el acceso, antes del Panel (visible en las tres vistas)
  const banda = /<section class="incidencias o-incidencias"[^>]*>([\s\S]*?)<\/section>/.exec(h)?.[0] ?? '';
  assert.ok(banda.length > 0);
  assert.doesNotMatch(banda, /aria-live|role="(status|alert)"/);                                  // la región viva ya existe en el indicador de refresco y en el estado del Panel
  assert.match(banda, /\{\{ i\.icono \}\}[\s\S]*\{\{ i\.titulo \}\}[\s\S]*\{\{ i\.texto \}\}/);
  assert.match(banda, /\(click\)="\$event\.preventDefault\(\); verMetodologia\(\)"/);
  assert.match(h, /@if \(incidenciasPanel\(\)\.length > 0\)/);                                    // solo cuando aplica
  const ts = app('app.component.ts');
  assert.match(ts, /incidenciasPanel = computed\(\(\) => \(this\.esApi\(\) \? incidencias\(avisos\(this\.entradaEstado\(\)\)\) : \[\]\)\)/);
  // CAMBIO (ronda 3 Mission Control): la metodología es ahora un <details> plegable; «Ir a Cargar el resto» la reabre antes de enfocar el título (si no, el botón quedaría oculto).
  assert.match(ts, /verMetodologia\(\): void \{ this\.metodologiaAbierta\.set\(true\); this\.irAVista\('analisis', 'metodologia-titulo'\); \}/);
  assert.match(h, /<h2 id="metodologia-titulo"[^>]*tabindex="-1"[^>]*>Metodología y estado del sistema<\/h2>/);
  // regiones vivas de la página completa: cabecera, leyenda, KPI, indicador, detalle: no se ha añadido ninguna
  assert.equal((h.match(/aria-live="polite"/g) ?? []).length, 2);                                // anuncio de vista/modo y anuncio de la leyenda (las demás viven dentro de sus componentes)
});

test('Panel: filtros con «Ayuda de los filtros» (texto completo conservado), aviso breve y Desde/Hasta solo con «Personalizado»', () => {
  const f = app('filtros/filtros.component.ts');
  const ayuda = /<details class="ayuda-filtros">([\s\S]*?)<\/details>/.exec(f)?.[1] ?? '';
  assert.match(ayuda, /Opcional: vacío = todas\. Un evento sin magnitud no cumple ningún mínimo/);
  assert.match(ayuda, /\{\{ replay\(\) \? avisoReplay : aviso \}\}/);                           // el aviso metodológico completo (AVISO_COBERTURA / AVISO_FILTROS_REPLAY)
  assert.match(f, /<p class="aviso-breve" role="note">/);
  assert.match(f, /<h2 id="filtros-titulo">Filtros<\/h2>/);
  assert.match(f, /@if \(personalizado\(\)\) \{\s*<label>Desde \(UTC\)/);
  assert.match(f, /aria-describedby="ayuda-magnitud"/);
  assert.doesNotMatch(f, /localStorage|sessionStorage|transition:\s*all/);
});

// ---------- Análisis ----------
test('Análisis: franja de filtros activos reutilizada en Análisis y Eventos, Metodología con app-estado completo y gráficas 2×2 por container query', () => {
  const h = html();
  assert.equal((h.match(/<app-filtros-activos /g) ?? []).length, 2);                              // el MISMO componente en las dos vistas
  const ana = /<section id="analisis"[\s\S]*?<section id="eventos"/.exec(h)?.[0] ?? '';
  const eve = /<section id="eventos"[\s\S]*?<footer/.exec(h)?.[0] ?? '';
  assert.match(ana, /<app-filtros-activos \[resumen\]="resumenFiltros\(\)" \[periodo\]="periodo\(\)" \[etiqueta\]="etiquetaVista\(\)" \(cambiar\)="cambiarFiltros\(\)"/);
  assert.match(eve, /<app-filtros-activos \[resumen\]="resumenFiltros\(\)" \[periodo\]="periodo\(\)" \[etiqueta\]="etiquetaVista\(\)" \(cambiar\)="cambiarFiltros\(\)"/);
  assert.ok(ana.indexOf('<app-filtros-activos') < ana.indexOf('<div class="graficas">'));          // franja arriba, luego gráficas, luego comparación y metodología
  assert.ok(ana.indexOf('<app-comparacion') < ana.indexOf('id="metodologia"'));
  assert.ok(ana.indexOf('id="metodologia"') < ana.indexOf('<app-estado '));
  assert.ok(ana.indexOf('<app-estado ') < ana.indexOf('Contador cruzado del periodo consultado'));
  assert.match(ana, /\[ejecucion\]="ejecucion\(\)" \(cargarResto\)="cargarResto\(\)"/);           // app-estado conserva TODAS sus entradas y salidas
  const fa = app('filtros-activos/filtros-activos.component.ts');
  assert.match(fa, /<a href="#\/panel" class="enlace" \(click\)="\$event\.preventDefault\(\); cambiar\.emit\(\)">Cambiar filtros<\/a>/);
  assert.match(fa, /min-height: 36px/); assert.doesNotMatch(fa, /innerHTML|localStorage|aria-live/);
  assert.match(app('app.component.ts'), /cambiarFiltros\(\): void \{ this\.filtrosAbiertos\.set\(true\); this\.irAVista\('panel', 'filtros'\); \}/);
  const css = app('app.component.css');
  assert.match(css, /\.analisis \{[^}]*container-type: inline-size/);                             // el contenedor consultado NO es .graficas (un elemento no se consulta a sí mismo)
  // CAMBIO (ronda 3 Mission Control): la rejilla 2×2 de 1000 px pasa a la composición asimétrica (hero · país 5/12 | magnitud + profundidad 7/12) desde 1100 px; sigue siendo container query. Detalle en tests/ronda3-analisis.test.ts.
  // CAMBIO (análisis A): ya no hay 5fr/7fr; la rejilla de ≥ 1100 px pasa a 10 pistas (hora 6 | país 4 · magnitud 5 | profundidad 5) para igualar alturas. Sigue siendo container query. Detalle en tests/analisis-a.test.ts.
  assert.match(css, /@container \(min-width: 1100px\) \{\s*\.graficas \{ grid-template-columns: repeat\(10, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /\.graficas \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
});

test('gráficas: explicación en «Cómo se calcula» (texto conservado y referenciado por el SVG), ancho responsive y cálculos intactos', () => {
  const b = app('graficas/barras.component.ts');
  // CAMBIO (ronda 3 Mission Control): el summary lleva un icono de información delante del MISMO texto «Cómo se calcula»; el <span class="desc"> con el texto completo y su id no cambian.
  assert.match(b, /<details class="como">\s*<summary><app-icono nombre="info" class="ico" \/> Cómo se calcula<\/summary>\s*<span class="desc" \[id\]="idBase\(\) \+ '-d'">\{\{ descripcion\(\) \}\}<\/span>/);
  assert.match(b, /\[attr\.aria-labelledby\]="idBase\(\) \+ '-t ' \+ idBase\(\) \+ '-d'"/);          // el SVG sigue nombrado por título + descripción
  // CAMBIO (ronda 3 Mission Control): el ancho mínimo ya no es fijo (440 px) sino por formato y en línea (`[style.min-width.px]="minAncho()"`: 560 estándar, 700 hero, 440 columna) para que el texto del SVG no baje de ≈ 10,5 px efectivos; sigue escalando con el viewBox.
  // CAMBIO (análisis A): a la regla del svg se añade `touch-action: pan-x pan-y` (el toque sobre una barra no bloquea el scroll); ancho/alto/display no cambian.
  assert.match(b, /svg \{ width: 100%; height: auto; display: block; touch-action: pan-x pan-y; \}/); assert.match(b, /\[style\.min-width\.px\]="minAncho\(\)"/);
  assert.match(b, /\[attr\.viewBox\]="'0 0 ' \+ ancho\(\) \+ ' ' \+ alto\(\)"/); assert.match(b, /preserveAspectRatio="xMidYMid meet"/);
  // CAMBIO (análisis A): el lienzo deja de ser un tab stop propio (tabindex 0 + role=region). Sigue siendo la caja con scroll horizontal, pero el único tab stop es la barra activa (roving tabindex) y el navegador la desplaza a la vista.
  assert.match(b, /<div class="lienzo" \(scroll\)="ocultar\(\)">/); assert.doesNotMatch(b, /class="lienzo" tabindex/);
  assert.match(b, /disenoBarras\(valores, this\.ancho\(\), this\.alto\(\), this\.margen\(\)\)/);  // los cálculos siguen en graficas.ts, sin cambios (CAMBIO ronda 3: el ancho es un computed por formato, no la constante ANCHO)
  assert.doesNotMatch(b, /innerHTML|localStorage|transition:\s*all/);
});

// ---------- tabla-filtro.ts (lógica pura) ----------
test('normalización y búsqueda: sin mayúsculas ni acentos, por lugar, país, id y tipo de magnitud', () => {
  assert.equal(normalizar('  PERÚ Ñandú '), 'peru nandu');
  const ev = (id: string, place: string, pais: string, magType: string) => ({ id, properties: { place, country_name: pais, magType, mag: 5, time: 1 }, geometry: { type: 'Point', coordinates: [0, 0, 10] } }) as never;
  const filas = [filaDe(ev('us1', 'Lima, Perú', 'Perú', 'mww'), 0), filaDe(ev('us2', 'Tokio', 'Japón', 'mb'), 1), filaDe(ev('ci3', 'Hawái', 'Estados Unidos', 'ml'), 2)];
  assert.deepEqual(buscar(filas, 'PERU').map((f) => f.id), ['us1']);
  assert.deepEqual(buscar(filas, 'japon').map((f) => f.id), ['us2']);
  assert.deepEqual(buscar(filas, 'ci3').map((f) => f.id), ['ci3']);                              // por ID
  assert.deepEqual(buscar(filas, 'mww').map((f) => f.id), ['us1']);                              // por tipo de magnitud
  assert.equal(buscar(filas, 'zzz').length, 0);                                                  // 0 resultados
  assert.equal(buscar(filas, '   ').length, 3);                                                  // vacío = todo
});

test('paginación: tamaños 25/50/100 (inicial 25), valores inválidos vuelven a 25, páginas y límites', () => {
  assert.deepEqual([...TAMANOS_PAGINA], [25, 50, 100]); assert.equal(TAMANO_PAGINA_INICIAL, 25);
  assert.equal(tamanoPaginaValido('50'), 50); assert.equal(tamanoPaginaValido(100), 100);
  for (const malo of ['', 'x', 0, -5, 30, null, undefined, NaN]) assert.equal(tamanoPaginaValido(malo), 25, String(malo));
  const filas = Array.from({ length: 101 }, (_, i) => ({ id: `e${i}` })) as never[];
  assert.equal(paginar(filas, 1, 25).paginas, 5);                                                 // 101 / 25 → 5 páginas
  assert.equal(paginar(filas, 99, 25).pagina, 5);                                                 // por encima del final: última
  assert.equal(paginar(filas, 0, 25).pagina, 1);                                                  // por debajo: primera
  assert.equal(paginar(filas, 5, 25).filas.length, 1);
  assert.equal(paginar(filas, 1, 100).paginas, 2);
  assert.deepEqual(paginar([], 1, 25), { filas: [], pagina: 1, paginas: 1, desde: 0, hasta: 0, total: 0 });   // 0 eventos: una página vacía
  assert.deepEqual(botonesPagina(1, 5), { primera: false, anterior: false, siguiente: true, ultima: true });
  assert.deepEqual(botonesPagina(5, 5), { primera: true, anterior: true, siguiente: false, ultima: false });
  assert.deepEqual(botonesPagina(1, 1), { primera: false, anterior: false, siguiente: false, ultima: false });
  assert.deepEqual(botonesPagina(3, 5), { primera: true, anterior: true, siguiente: true, ultima: true });
});

test('al cambiar el tamaño de página se conserva la primera fila visible', () => {
  assert.equal(paginaTrasCambioTamano(3, 25, 50), 2);          // filas 50–74 → con 50 por página empieza en la fila 50: página 2
  assert.equal(paginaTrasCambioTamano(2, 50, 25), 3);          // fila 50 → página 3 de 25
  assert.equal(paginaTrasCambioTamano(1, 25, 100), 1);
  assert.equal(paginaTrasCambioTamano(7, 25, 100), 2);
  assert.equal(paginaTrasCambioTamano(0, 25, 50), 1); assert.equal(paginaTrasCambioTamano(NaN, 25, 50), 1);
  assert.equal(paginaTrasCambioTamano(3, 0, 50), 1);
});

test('localizar el seleccionado: página que lo contiene, oculto por la búsqueda, no cargado, sin selección', () => {
  const todas = Array.from({ length: 60 }, (_, i) => ({ id: `e${i}` }));
  assert.deepEqual(clasificarSeleccion(todas, todas, 'e0', 25), { estado: 'visible', pagina: 1 });
  assert.deepEqual(clasificarSeleccion(todas, todas, 'e24', 25), { estado: 'visible', pagina: 1 });   // último de la página 1
  assert.deepEqual(clasificarSeleccion(todas, todas, 'e25', 25), { estado: 'visible', pagina: 2 });   // primero de la 2
  assert.deepEqual(clasificarSeleccion(todas, todas, 'e59', 25), { estado: 'visible', pagina: 3 });
  assert.deepEqual(clasificarSeleccion(todas, todas, 'e59', 100), { estado: 'visible', pagina: 1 });
  const filtradas = todas.filter((f) => f.id.endsWith('7'));                                           // la búsqueda deja 6 eventos
  assert.deepEqual(clasificarSeleccion(todas, filtradas, 'e5', 25), { estado: 'oculta-por-busqueda', pagina: null });   // cargado, pero la búsqueda lo oculta
  assert.deepEqual(clasificarSeleccion(todas, filtradas, 'e17', 25), { estado: 'visible', pagina: 1 });
  assert.deepEqual(clasificarSeleccion(todas, [], 'e5', 25), { estado: 'oculta-por-busqueda', pagina: null });            // 0 resultados
  assert.deepEqual(clasificarSeleccion(todas, todas, 'otro', 25), { estado: 'no-cargada', pagina: null });
  assert.deepEqual(clasificarSeleccion(todas, todas, null, 25), { estado: 'ninguna', pagina: null });
  // coherente con la función ya existente de tabla.ts
  assert.equal(paginaDe(todas as never[], 'e30', 25), clasificarSeleccion(todas, todas, 'e30', 25).pagina);
});

test('textos: alcance «cargados» en la etiqueta de búsqueda, el resumen y el contador del periodo', () => {
  assert.equal(etiquetaBusqueda(12345), 'Buscar en los 12.345 eventos cargados');
  assert.equal(textoCargadosDelPeriodo(100, 250), '100 eventos cargados de 250 del periodo');
  assert.equal(textoCargadosDelPeriodo(1, 1), '1 evento cargado de 1 del periodo');
  assert.equal(textoCargadosDelPeriodo(7, null), '7 eventos cargados');
  assert.match(notaHayMasEnPeriodo(100, 250) ?? '', /«Cargar el resto»/);
  assert.equal(notaHayMasEnPeriodo(250, 250), null); assert.equal(notaHayMasEnPeriodo(5, null), null);
  assert.equal(textoResumenTabla(0, 0, 0, 0), 'Sin eventos cargados.');
  assert.equal(textoResumenTabla(100, 0, 0, 0), '0 de 100 cargados.');
  assert.equal(textoResumenTabla(100, 40, 1, 25), '40 de 100 cargados · mostrando 1–25');
});

// ---------- tabla (plantilla) ----------
test('tabla: input type=search con label visible, nav de paginación etiquetada, botones >= 36 px, select etiquetado, salida compartida y semántica intacta', () => {
  const t = app('tabla/tabla.component.ts');
  assert.match(t, /<label class="buscar">\{\{ textoEtiquetaBusqueda\(\) \}\}\s*<input type="search"/);
  assert.match(t, /<nav class="paginas" aria-label="Paginación de la tabla">/);
  for (const b of ['Primera', 'Anterior', 'Siguiente', 'Última']) assert.match(t, new RegExp(`\\[disabled\\]="![^"]*"[^>]*>${b}<`), b);   // deshabilitados con `disabled` + texto
  assert.match(t, /Página \{\{ pagina\(\)\.pagina \}\} de \{\{ pagina\(\)\.paginas \}\}/);
  assert.match(t, /\.paginas button, \.accion \{[^}]*min-height: 36px/);
  assert.match(t, /<label class="tamano">Filas por página\s*<select/);
  assert.match(t, /@if \(busqueda\(\)\) \{ <button type="button" class="accion" \(click\)="limpiarBusqueda\(\)">Limpiar<\/button> \}/);   // «Limpiar» solo con texto
  assert.match(t, /El evento seleccionado no coincide con la búsqueda\./); assert.match(t, />Limpiar búsqueda<\/button>/);
  assert.match(t, /Ningún evento cargado coincide con la búsqueda\./); assert.match(t, /No hay eventos cargados para estos filtros/);
  assert.match(t, /readonly seleccionar = output<string>\(\)/); assert.match(t, /elegir\(id: string\): void \{ this\.seleccionar\.emit\(id\); \}/);
  // CAMBIO (ronda 4 Mission Control): el <th> añade clases de jerarquía (versalitas, secundaria, alineación) antes de aria-sort; sigue siendo th scope="col" con aria-sort por columna.
  assert.match(t, /<th scope="col" class="etiqueta-ui" \[class\.sec\]="!principal\(c\.clave\)" \[class\.der\]="derecha\(c\.clave\)" \[attr\.aria-sort\]="ariaSort\(c\.clave\)">/); assert.match(t, /<caption class="oculto">/);
  assert.match(t, /\[attr\.aria-pressed\]="f\.id === seleccionado\(\)"/);
  assert.match(t, /class="desplazable" role="region" aria-label="Tabla de terremotos, desplazable horizontalmente" tabindex="0"/);
  assert.match(t, /<span #etiquetaPagina class="pagina-actual" tabindex="-1">/);                  // el foco no se pierde si el botón pulsado queda deshabilitado
  assert.match(t, /orden = signal<Orden>\(ORDEN_INICIAL\)/);                                      // el orden actual no cambia
  assert.doesNotMatch(t, /innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|document\.cookie|indexedDB|transition:\s*all|scrollTo\(|behavior: 'smooth'/);
  assert.match(t, /min-width: min\(280px, 100%\)/);
});

test('tabla: la búsqueda ya NO borra sola el texto cuando oculta la selección; salta a la página del seleccionado y expone «Ir al evento seleccionado»', () => {
  const t = app('tabla/tabla.component.ts');
  assert.doesNotMatch(t, /this\.busqueda\.set\(''\);\s*\n?\s*const pagina|paginaDe\(this\.visibles\(\), id, TAMANO_PAGINA\) === null\) this\.busqueda\.set/);
  assert.match(t, /s\.estado === 'visible' && s\.pagina !== null\) this\.paginaActual\.set\(s\.pagina\)/);
  assert.match(t, /irAlSeleccionado\(\): void/);
  const h = html();
  assert.match(h, /<button type="button" class="enlace-accion" \(click\)="irAlSeleccionado\(\)">Ir al evento seleccionado<\/button>/);
  assert.match(h, /<a href="#\/panel" class="enlace-accion" \(click\)="\$event\.preventDefault\(\); verEnVisor\(\)">/);   // «Ver en el globo/mapa» se conserva
  // CAMBIO (ronda 4 Mission Control): el contador «N eventos cargados de M del periodo» se pinta con la cifra grande en mono (`cargadosPartes()` = el MISMO textoCargados() partido en cifra y resto);
  // la información y el texto son los mismos, solo cambia la presentación.
  assert.match(h, /<strong class="cifra mono">\{\{ cargadosPartes\(\)\.cifra \}\}<\/strong> \{\{ cargadosPartes\(\)\.resto \}\}\./);
  assert.match(app('app.component.ts'), /cargadosPartes = computed\(\(\) => partirContador\(this\.textoCargados\(\)\)\)/);
  assert.match(h, /@if \(notaHayMas\(\); as nota\)/);
  assert.match(app('app.component.ts'), /textoCargadosDelPeriodo\(this\.eventos\(\)\.length, this\.total\(\)\)/);
  assert.match(app('app.component.ts'), /irAlSeleccionado\(\): void \{ this\.tabla\(\)\?\.irAlSeleccionado\(\); \}/);
});

test('sin almacenamiento del navegador, sin transition: all, sin animaciones nuevas ni innerHTML en los archivos de la ronda 2', () => {
  for (const r of ['tabla-filtro.ts', 'tabla/tabla.component.ts', 'filtros-activos/filtros-activos.component.ts', 'estado-datos/estado-datos.ts', 'estado-datos/estado-datos.component.ts', 'filtros/filtros.component.ts', 'graficas/barras.component.ts', 'app.component.html', 'app.component.css']) {
    assert.doesNotMatch(app(r), /localStorage|sessionStorage|document\.cookie|indexedDB|transition:\s*all|@keyframes|innerHTML/, r);
  }
});

test('Panel: leyenda compacta, columnas sin scroll interno, orden móvil coherente con el foco y «Notas del mapa» tras la leyenda', () => {
  const css = app('app.component.css');
  assert.match(css, /\.leyenda \.panel-titulo \{ flex: 0 0 auto;/);                              // título y rangos en la misma fila cuando caben
  assert.doesNotMatch(css, /\.col-(izq|der|centro) \{[^}]*overflow(-y)?: (auto|scroll)/);          // sin contenedores con scroll interno en las columnas
  const orden = ['o-acceso', 'o-incidencias', 'o-filtros', 'o-visor', 'o-detalle', 'o-modo', 'o-leyenda', 'o-notas', 'o-kpi'].map((c) => Number(new RegExp(`\\.${c} \\{ order: (\\d+); \\}`).exec(css)?.[1]));
  assert.ok(orden.every((n) => Number.isFinite(n)), String(orden));
  assert.deepEqual([...orden].sort((a, b) => a - b), orden);                                       // móvil: acceso → incidencias → filtros → visor → detalle → modo → leyenda → notas → KPI
  // CAMBIO (ronda 1 Mission Control): la cabecera ya no es `display: contents` en móvil; es una fila sticky (--alto-cabecera) en todos los anchos y la nav va dentro de ella.
  assert.match(css, /\.cabecera \{[^}]*position: sticky/);                                         // la cabecera (con la nav) sigue fija
  assert.doesNotMatch(html(), /<p class="subtitulo"/);                                              // subtítulo largo fuera de la cabecera
});
