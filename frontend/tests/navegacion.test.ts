// Vistas internas (Panel · Análisis · Eventos) con navegación por hash, globo 3D por defecto y fallback automático al mapa 2D (F7, ronda 1).
// Lógica pura (navegacion.ts, globo/fallback.ts) con dobles de `window`, y comprobaciones sobre el código fuente (los componentes no se ejecutan con `node --test`: sin DOM ni WebGL).
// `node --test tests/*.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ID_ENCABEZADO, NOMBRE_VISTA, SincronizadorHash, VISTAS, VISTA_INICIAL, anuncioVista, hashDeVista, tituloDocumento, vistaDesdeHash } from '../src/app/navegacion.ts';
import type { Vista, VentanaHash } from '../src/app/navegacion.ts';
import { LIMITE_CARGA_MS, MENSAJE_TIEMPO_AGOTADO, REINTENTO_INVALIDAR_MS, textoAvisoFallback } from '../src/app/globo/fallback.ts';

const leer = (r: string) => readFileSync(new URL(`../src/app/${r}`, import.meta.url), 'utf8');
const html = () => leer('app.component.html');
const ts = () => leer('app.component.ts');

// ---------- lógica pura: hash ↔ vista ----------
test('vistaDesdeHash: #/panel, #/analisis y #/eventos; vacío, «#», desconocido o nulo → Panel', () => {
  assert.equal(vistaDesdeHash('#/panel'), 'panel');
  assert.equal(vistaDesdeHash('#/analisis'), 'analisis');
  assert.equal(vistaDesdeHash('#/eventos'), 'eventos');
  for (const raro of ['', '#', '#/', '#/otra', '#/panel/extra', '#analisis-no', '#/analisis2', 'analisis-sin-almohadilla-valida?', null, undefined]) assert.equal(vistaDesdeHash(raro), 'panel', String(raro));
  assert.equal(VISTA_INICIAL, 'panel');
});

test('vistaDesdeHash tolera barra final, mayúsculas y espacios; admite #analisis sin barra', () => {
  assert.equal(vistaDesdeHash('#/analisis/'), 'analisis');
  assert.equal(vistaDesdeHash('#/Eventos'), 'eventos');
  assert.equal(vistaDesdeHash('  #/eventos  '), 'eventos');
  assert.equal(vistaDesdeHash('#eventos'), 'eventos');
});

test('hashDeVista y vistaDesdeHash son inversas para las tres vistas', () => {
  assert.deepEqual([...VISTAS], ['panel', 'analisis', 'eventos']);
  for (const v of VISTAS) { assert.equal(hashDeVista(v), `#/${v}`); assert.equal(vistaDesdeHash(hashDeVista(v)), v); }
});

test('títulos, anuncio breve y encabezados por vista', () => {
  assert.equal(tituloDocumento('panel'), 'Panel · Observatorio sísmico');
  assert.equal(tituloDocumento('analisis'), 'Análisis · Observatorio sísmico');
  assert.equal(tituloDocumento('eventos'), 'Eventos · Observatorio sísmico');
  assert.equal(anuncioVista('analisis'), 'Vista: Análisis');
  assert.deepEqual(VISTAS.map((v) => NOMBRE_VISTA[v]), ['Panel', 'Análisis', 'Eventos']);
  assert.deepEqual(VISTAS.map((v) => ID_ENCABEZADO[v]), ['panel-titulo', 'analisis-titulo', 'eventos-titulo']);
});

// ---------- SincronizadorHash con un doble de window ----------
function ventanaFalsa(hashInicial = '') {
  const oyentes = new Map<string, Set<() => void>>();
  const v = {
    location: { hash: hashInicial },
    addEventListener(t: string, f: () => void) { (oyentes.get(t) ?? oyentes.set(t, new Set()).get(t)!).add(f); },
    removeEventListener(t: string, f: () => void) { oyentes.get(t)?.delete(f); },
  };
  const disparar = (t: string) => oyentes.get(t)?.forEach((f) => f());
  const total = () => [...oyentes.values()].reduce((s, c) => s + c.size, 0);
  return { v: v as VentanaHash, oyentes, disparar, total };
}

test('iniciar: devuelve la vista del hash (enlace directo), registra hashchange y popstate y NO llama a alCambiar (la carga inicial no roba el foco)', () => {
  const w = ventanaFalsa('#/analisis'); const avisos: Vista[] = [];
  const s = new SincronizadorHash(w.v, (v) => avisos.push(v));
  assert.equal(s.iniciar(), 'analisis');
  assert.equal(w.oyentes.get('hashchange')?.size, 1); assert.equal(w.oyentes.get('popstate')?.size, 1);
  assert.deepEqual(avisos, []);
  s.iniciar();                                                  // idempotente: no duplica listeners
  assert.equal(w.total(), 2);
});

test('Atrás/Adelante: el cambio de hash avisa UNA vez aunque lleguen hashchange y popstate; un hash desconocido vuelve al Panel', () => {
  const w = ventanaFalsa(''); const avisos: Vista[] = [];
  const s = new SincronizadorHash(w.v, (v) => avisos.push(v)); s.iniciar();
  w.v.location.hash = '#/eventos'; w.disparar('popstate'); w.disparar('hashchange');
  assert.deepEqual(avisos, ['eventos']);
  w.v.location.hash = '#/analisis'; w.disparar('hashchange'); w.disparar('popstate');
  assert.deepEqual(avisos, ['eventos', 'analisis']);
  w.v.location.hash = '#/nada'; w.disparar('hashchange');
  assert.deepEqual(avisos, ['eventos', 'analisis', 'panel']);
  w.v.location.hash = '#/panel'; w.disparar('hashchange');   // sigue siendo Panel: sin aviso repetido
  assert.equal(avisos.length, 3);
});

test('navegar: fija el hash (entrada de historial) y devuelve true; si ya está en esa vista no toca nada y devuelve false', () => {
  const w = ventanaFalsa('#/analisis'); const s = new SincronizadorHash(w.v, () => {}); s.iniciar();
  assert.equal(s.navegar('analisis'), false); assert.equal(w.v.location.hash, '#/analisis');
  assert.equal(s.navegar('eventos'), true); assert.equal(w.v.location.hash, '#/eventos');
});

test('detener retira los dos listeners y deja de avisar (ngOnDestroy)', () => {
  const w = ventanaFalsa(''); const avisos: Vista[] = [];
  const s = new SincronizadorHash(w.v, (v) => avisos.push(v)); s.iniciar();
  s.detener();
  assert.equal(w.total(), 0);
  w.v.location.hash = '#/eventos'; w.disparar('hashchange'); w.disparar('popstate');
  assert.deepEqual(avisos, []);
  s.detener();                                                   // idempotente
});

// ---------- plantilla: nav y secciones ----------
test('nav real «Vistas»: tres <a href="#/…"> con texto Panel · Análisis · Eventos, aria-current en la activa y sin roles de pestaña ni iconos', () => {
  const h = html();
  const nav = /<nav class="nav-vistas" aria-label="Vistas">([\s\S]*?)<\/nav>/.exec(h)?.[1] ?? '';
  assert.ok(nav.length > 0);
  // CAMBIO (ronda 1 Mission Control): cada enlace lleva ahora un icono SVG decorativo (`<app-icono>`) y el texto en un <span>; el href, aria-current y el texto no cambian. Sigue sin haber botones, <img> ni <svg> sueltos ni roles de pestaña.
  const enlaces = [...nav.matchAll(/<a href="#\/(\w+)" \[attr\.aria-current\]="vista\(\) === '(\w+)' \? 'page' : null"><app-icono nombre="\w+" \/><span>([^<]+)<\/span><\/a>/g)].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(enlaces, [['panel', 'panel', 'Panel'], ['analisis', 'analisis', 'Análisis'], ['eventos', 'eventos', 'Eventos']]);
  assert.doesNotMatch(nav, /role="tab|<button|<img|<svg|<i /);
  assert.match(h.slice(h.indexOf('<header class="cabecera"'), h.indexOf('</header>')), /<nav class="nav-vistas"/);   // en la cabecera
  assert.doesNotMatch(h, /class="anclas"|irA\(/);                                                                    // la nav de anclas ya no existe
  const css = leer('app.component.css');
  assert.match(css, /\.nav-vistas a \{[^}]*min-height: 36px/); assert.match(css, /\.nav-vistas a\[aria-current="page"\]/);
});

test('tres <section> siempre montadas con [hidden] y aria-labelledby; ningún @if destruye una vista', () => {
  const h = html();
  for (const [id, vista, titulo] of [['vista-panel', 'panel', 'panel-titulo'], ['analisis', 'analisis', 'analisis-titulo'], ['eventos', 'eventos', 'eventos-titulo']])
    assert.match(h, new RegExp(`<section id="${id}" class="[^"]*" aria-labelledby="${titulo}" \\[hidden\\]="vista\\(\\) !== '${vista}'">`), id);
  for (const t of ['panel-titulo', 'analisis-titulo', 'eventos-titulo']) assert.match(h, new RegExp(`<h2 id="${t}" class="[^"]*" tabindex="-1">`), t);   // destino del foco
  assert.doesNotMatch(h, /@if \(vista\(\)|@switch \(vista\(\)/);                                                          // nada de @if/@switch por vista
  assert.match(leer('app.component.css'), /\.vista-seccion\[hidden\] \{ display: none; \}/);                                // `hidden` no lo anula el display: grid
  // DOM = orden lógico: Panel → Análisis → Eventos, y los componentes existentes cada uno en su vista
  const i = (s: string) => h.indexOf(s);
  assert.ok(i('id="vista-panel"') < i('<app-estado-datos') && i('<app-estado-datos') < i('<app-globo'));
  assert.ok(i('id="vista-panel"') < i('id="analisis"') && i('id="analisis"') < i('<app-barras') && i('<app-barras') < i('<app-estado ') && i('<app-estado ') < i('id="eventos"') && i('id="eventos"') < i('<app-tabla'));
  assert.ok(i('<app-acceso') < i('id="vista-panel"'));                                                                     // acceso por clave: marco común
  assert.equal((h.match(/<app-globo /g) ?? []).length, 1); assert.equal((h.match(/<app-tabla /g) ?? []).length, 1); assert.equal((h.match(/leaflet /g) ?? []).length, 1);   // sin duplicar componentes
  assert.doesNotMatch(leer('app.component.css'), /\.zona-tabla \{[^}]*order|\.vista-seccion \{[^}]*order: [^3]/);          // nada de `order` que contradiga el foco en las vistas
});

test('región viva única: «Vista: …» reutiliza anuncioModo (no se añade otra región aria-live en la cabecera)', () => {
  const h = html(); const t = ts();
  assert.equal((h.match(/\{\{ anuncioModo\(\) \}\}/g) ?? []).length, 1);
  assert.match(t, /this\.anuncioModo\.set\(anuncioVista\(v\)\)/);
  assert.doesNotMatch(h, /anuncioVista\(\)|anuncioNavegacion/);
});

// ---------- AppComponent: hash, foco, título, limpieza ----------
test('AppComponent: la vista sale del hash al crearse, se sincroniza con navegacion.ts y se limpia en ngOnDestroy', () => {
  const t = ts();
  assert.match(t, /readonly vista = signal<Vista>\(vistaDesdeHash\(window\.location\.hash\)\)/);
  assert.match(t, /private readonly navegacion = new SincronizadorHash\(window, \(v\) => this\.mostrarVista\(v\)\)/);
  const ctor = /constructor\(\) \{([\s\S]*?)\n  \}/.exec(t)?.[1] ?? '';
  assert.match(ctor, /this\.navegacion\.iniciar\(\)/); assert.match(ctor, /document\.title = tituloDocumento\(this\.vista\(\)\)/);
  assert.doesNotMatch(ctor, /focus|mostrarVista|anuncioModo/);                                  // la carga inicial no mueve el foco ni anuncia
  const destruir = /ngOnDestroy\(\): void \{([^\n]*)/.exec(t)?.[1] ?? '';
  assert.match(destruir, /this\.navegacion\.detener\(\)/); assert.match(destruir, /clearTimeout\(this\.timerMapa\)/);
  const nav = leer('navegacion.ts');
  assert.match(nav, /addEventListener\('hashchange', this\.escuchar\)/); assert.match(nav, /addEventListener\('popstate', this\.escuchar\)/);
  assert.match(nav, /removeEventListener\('hashchange', this\.escuchar\)/); assert.match(nav, /removeEventListener\('popstate', this\.escuchar\)/);
});

test('AppComponent: al cambiar de vista actualiza el título, anuncia, mueve el foco al encabezado, sube al inicio sin animación y recalcula Leaflet en el Panel', () => {
  const t = ts();
  const mostrar = /private mostrarVista\(v: Vista\): void \{([\s\S]*?)\n  \}/.exec(t)?.[1] ?? '';
  for (const p of ['this.vista.set(v)', 'document.title = tituloDocumento(v)', 'this.anuncioModo.set(anuncioVista(v))', 'this.enfocarVista(v)']) assert.ok(mostrar.includes(p), p);
  const enfocar = /private enfocarVista\(v: Vista\): void \{([\s\S]*?)\n  \}/.exec(t)?.[1] ?? '';
  assert.match(enfocar, /afterNextRender\(/);                                                  // cuando el DOM ya muestra la vista
  assert.match(enfocar, /ID_ENCABEZADO\[v\]/); assert.match(enfocar, /destino\.focus\(\{ preventScroll: true \}\)/);
  assert.match(enfocar, /window\.scrollTo\(0, 0\)/); assert.doesNotMatch(enfocar, /smooth/);   // instantáneo: sirve igual con prefers-reduced-motion
  assert.match(enfocar, /if \(v === 'panel'\) this\.alMostrarPanel\(\)/);
  assert.match(t, /alMostrarPanel\(\): void \{ if \(this\.visor\(\) === '2d'\) this\.map\?\.invalidateSize\(\); \}/);
  // «Ver este evento en la tabla» y «Ver en el globo» navegan de verdad (cambian el hash) y llevan el foco
  assert.match(t, /verEnTabla\(\): void \{ this\.irAVista\('eventos', 'tabla-titulo'\); \}/);
  assert.match(t, /verEnVisor\(\): void \{ this\.irAVista\('panel', 'mapa'\); \}/);
  assert.match(t, /if \(!this\.navegacion\.navegar\(v\)\) this\.enfocarVista\(v\)/);
  const h = html();
  // Fase 1: la franja «Evento seleccionado» de la vista Eventos se retiró; «Ver en el globo/mapa» sigue en la tabla (mismo handler)
  assert.match(h, /\(verVisor\)="verEnVisor\(\)"/); assert.doesNotMatch(h, /franja-seleccion|Ir al evento seleccionado/);
  assert.match(h, /\(verTabla\)="verEnTabla\(\)"/);
  assert.match(h, /@if \(avisoSeleccion\(\)\) \{ <p role="alert"/);                             // el aviso vive en Eventos, donde se produce
});

test('el estado se conserva al navegar: nada se reinicia al cambiar la vista (mismas señales, sin destruir componentes) y el globo solo se ve con Panel + visor 3D', () => {
  const t = ts(); const mostrar = /private mostrarVista\(v: Vista\): void \{([\s\S]*?)\n  \}/.exec(t)?.[1] ?? '';
  assert.doesNotMatch(mostrar, /filtros\.set|modoVista\.set|seleccionado\.set|descartarLectura|eventos\.set|refresh\(/);
  assert.match(html(), /<app-globo \[visible\]="vista\(\) === 'panel' && visor\(\) === '3d'"/);
  assert.match(html(), /\[hidden\]="visor\(\) === '3d'" aria-label="Mapa interactivo de terremotos"/);   // Leaflet sigue montado
  const cuerpo = /elegir\(id: string \| null, origen: 'mapa' \| 'tabla'\): void \{([\s\S]*?)\n  \}\n/.exec(t)?.[1] ?? '';
  assert.match(cuerpo, /const sinMapa = this\.visor\(\) === '3d' \|\| this\.vista\(\) !== 'panel';/);   // sin panTo/popup con el mapa 2D oculto
  assert.match(cuerpo, /if \(origen === 'tabla' && !sinMapa\)/);
});

test('sin @angular/router, sin almacenamiento del navegador en la navegación, y el hash es solo del cliente', () => {
  for (const f of ['navegacion.ts', 'app.component.ts', 'app.component.html', 'globo/fallback.ts', 'globo/globo.component.ts']) {
    const c = leer(f);
    assert.doesNotMatch(c, /@angular\/router|provideRouter|RouterLink|RouterOutlet/, f);
    assert.doesNotMatch(c, /localStorage|sessionStorage|document\.cookie|indexedDB/, f);
  }
  const pkg = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  assert.doesNotMatch(pkg, /@angular\/router/);
  assert.doesNotMatch(leer('navegacion.ts'), /fetch\(|XMLHttpRequest|history\.(push|replace)State/);   // solo location.hash: no toca rutas ni peticiones
});

// ---------- globo por defecto y fallback ----------
test('el visor arranca en 3D (solo en memoria) y three se descarga con import() dinámico solo cuando el globo se muestra', () => {
  assert.match(ts(), /readonly visor = signal<'2d' \| '3d'>\('3d'\)/);
  assert.doesNotMatch(ts(), /visor\.set\(.*(localStorage|sessionStorage)/);
  const g = leer('globo/globo.component.ts');
  assert.equal((g.match(/import\('\.\/escena'\)/g) ?? []).length, 1);                              // único import dinámico, dentro de iniciar()
  assert.match(g, /effect\(\(\) => \{ const v = this\.visible\(\); untracked\(\(\) => this\.alCambiarVisible\(v\)\); \}\);/);
  const vis = /private alCambiarVisible\(visible: boolean\): void \{([\s\S]*?)\n  \}/.exec(g)?.[1] ?? '';
  assert.match(vis, /else if \(this\.estado\(\) === 'inactivo'\) void this\.iniciar\(\)/);          // se inicia SOLO al ser visible por primera vez
  assert.match(vis, /this\.escena\?\.reanudar\(\)/); assert.match(vis, /this\.escena\?\.pausar\(\)/);   // después solo se pausa/reanuda
  assert.doesNotMatch(g, /from 'three'/);
});

test('fallback: sin WebGL no se descarga three; el aviso sale del motivo, es role="status" y deja «Globo 3D» deshabilitado', () => {
  const g = leer('globo/globo.component.ts');
  const iniciar = /private async iniciar\(\): Promise<void> \{([\s\S]*?)\n  \}\n/.exec(g)?.[1] ?? '';
  assert.ok(iniciar.indexOf('hayWebgl()') < iniciar.indexOf("import('./escena')"));
  assert.match(html(), /@if \(globoNoDisponible\(\); as motivo\) \{ <p class="vista-aviso" role="status">\{\{ avisoFallback\(motivo\) \}\}<\/p> \}/);
  assert.match(html(), /\[disabled\]="globoNoDisponible\(\) !== null"/);
  assert.equal(textoAvisoFallback('Tu navegador o dispositivo no ofrece WebGL: usa el mapa 2D o la tabla.'), 'Globo 3D no disponible: Tu navegador o dispositivo no ofrece WebGL. Se muestra el mapa 2D.');
  assert.equal(textoAvisoFallback('No se pudo iniciar el globo 3D (WebGL desactivado o sin memoria gráfica): usa el mapa 2D o la tabla.'), 'Globo 3D no disponible: No se pudo iniciar el globo 3D (WebGL desactivado o sin memoria gráfica). Se muestra el mapa 2D.');
  assert.equal(textoAvisoFallback(MENSAJE_TIEMPO_AGOTADO), 'Globo 3D no disponible: El globo 3D tarda demasiado en iniciar (más de 12 s). Se muestra el mapa 2D.');
  assert.equal(textoAvisoFallback('  '), 'Globo 3D no disponible: motivo no indicado. Se muestra el mapa 2D.');
});

test('fallback automático: pasa a 2D y llama a invalidateSize en el siguiente fotograma y otra vez a los 250 ms', () => {
  assert.equal(REINTENTO_INVALIDAR_MS, 250);
  const t = ts();
  const f = /globoSinSoporte\(motivo: string\): void \{([\s\S]*?)\n  \}/.exec(t)?.[1] ?? '';
  assert.match(f, /this\.globoNoDisponible\.set\(motivo\)/); assert.match(f, /this\.cambiarVisor\('2d'\)/);
  assert.match(f, /setTimeout\(\(\) => this\.map\?\.invalidateSize\(\), REINTENTO_INVALIDAR_MS\)/);
  assert.match(/cambiarVisor\(visor: '2d' \| '3d'\): void \{([\s\S]*?)\n  \}/.exec(t)?.[1] ?? '', /afterNextRender\(\(\) => this\.map\?\.invalidateSize\(\), \{ injector: this\.injector \}\)/);
  assert.match(t, /\(noDisponible\)|globoSinSoporte/);
  assert.match(html(), /\(noDisponible\)="globoSinSoporte\(\$event\)"/);
});

test('temporizador de seguridad: 12 s, se limpia al llegar a listo, al fallar y al destruir; un resultado tardío se ignora y no hay doble aviso', () => {
  assert.equal(LIMITE_CARGA_MS, 12000);
  const g = leer('globo/globo.component.ts');
  assert.match(g, /window\.setTimeout\(\(\) => this\.alAgotarseLimite\(\), LIMITE_CARGA_MS\)/);
  const iniciar = /private async iniciar\(\): Promise<void> \{([\s\S]*?)\n  \}\n/.exec(g)?.[1] ?? '';
  assert.match(iniciar, /this\.armarLimite\(\)/);                                                    // arranca con la carga
  assert.equal((iniciar.match(/this\.destruido \|\| this\.abandonado/g) ?? []).length, 3);           // tras CADA await se ignora el resultado tardío
  assert.match(iniciar, /this\.estado\.set\('listo'\);\s*this\.cancelarLimite\(\)/);                 // listo → limpia
  assert.match(iniciar, /if \(this\.abandonado\) return;\s*\/\/[^\n]*\n\s*this\.fallar\(/);          // el catch no emite un segundo aviso
  assert.match(/private fallar\(mensaje: string\): void \{([\s\S]*?)\n  \}/.exec(g)?.[1] ?? '', /^\s*this\.cancelarLimite\(\);/);   // error → limpia
  assert.match(/ngOnDestroy\(\): void \{([\s\S]*?)\n  \}/.exec(g)?.[1] ?? '', /this\.cancelarLimite\(\)/);                          // destruir → limpia
  const agotado = /private alAgotarseLimite\(\): void \{([\s\S]*?)\n  \}/.exec(g)?.[1] ?? '';
  assert.match(agotado, /this\.estado\(\) !== 'cargando'/);                                           // solo actúa si sigue cargando
  assert.match(agotado, /this\.abandonado = true;\s*this\.fallar\(MENSAJE_TIEMPO_AGOTADO\)/);          // la misma salida `noDisponible` que cualquier fallo
  assert.match(/private cancelarLimite\(\): void \{([\s\S]*?)\n  \}/.exec(g)?.[1] ?? '', /clearTimeout\(this\.idLimite\)/);
});

test('Leaflet arranca oculto sin romper: onMapReady no depende de la visibilidad y el mapa se recalcula al mostrarse (selector 2D, fallback y vuelta al Panel)', () => {
  const t = ts();
  const ready = /async onMapReady\(map: L\.Map\): Promise<void> \{([\s\S]*?)\n  \}\n/.exec(t)?.[1] ?? '';
  assert.doesNotMatch(ready, /getSize|offsetWidth|offsetHeight|getBoundingClientRect|visor\(\)|vista\(\)/);   // nada que dependa del tamaño ni de la vista
  assert.equal((t.match(/invalidateSize\(\)/g) ?? []).length, 3);                                    // cambiarVisor, globoSinSoporte (reintento a los 250 ms) y alMostrarPanel
});
