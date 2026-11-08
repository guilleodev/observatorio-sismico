/* Comprobación scripteada de accesibilidad y diseño responsive (F6, 6.7, T050). Reconstruida a partir de los criterios de docs/evidencias/f5/5.7-escenarios.md §3.
 * SOLO LECTURA: no modifica el DOM. (El zoom del 200 % / 400 % no se emula con CSS `zoom`, que no cambia el ancho de reflujo: se prueba con un viewport de 640 / 320 px CSS.) Se inyecta en el navegador del panel (la página ya cargada) con:
 *     const s = document.createElement('script'); s.src = 'http://localhost:4201/a11y_dom.js'; document.head.append(s);   // servidor estático temporal de scripts/f6
 *   y se invoca  window.__a11y()  → objeto JSON. No entra en el repositorio de la aplicación ni se publica.
 * Criterios (WCAG 2.2): 1.4.10 reflow (sin desbordamiento horizontal de la página; el desplazamiento permitido solo dentro de regiones propias), 2.5.8 objetivos >= 24 px,
 * 4.1.2 nombre accesible, 1.4.3 contraste de texto (4,5:1; 3:1 si es grande), 2.1.1 regiones desplazables alcanzables con teclado, 1.3.1 estructura (h1, encabezados, tablas, SVG). */
(function () {
  const vis = (el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') return false;
    for (let p = el.parentElement; p; p = p.parentElement) { if (p.tagName === 'DETAILS' && !p.open && !(el.tagName === 'SUMMARY' && el.parentElement === p)) return false; }
    return true;
  };
  const sel = (el) => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; else if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.'); return s; };
  const nombre = (el) => {
    const t = (v) => (v || '').replace(/\s+/g, ' ').trim();
    if (el.getAttribute('aria-label')) return t(el.getAttribute('aria-label'));
    const lb = el.getAttribute('aria-labelledby'); if (lb) return t(lb.split(/\s+/).map((i) => document.getElementById(i)?.textContent).join(' '));
    if (el.labels && el.labels.length) return t([...el.labels].map((l) => l.textContent).join(' '));
    if (el.alt) return t(el.alt);
    const own = t(el.innerText || el.textContent); if (own) return own;
    return t(el.getAttribute('title'));
  };
  const rgba = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const mezcla = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const fondo = (el) => { // primer fondo opaco hacia arriba (mezclando translúcidos); null si hay imagen de fondo o es el mapa
    const pila = [];
    for (let p = el; p; p = p.parentElement) {
      if (p.classList && p.classList.contains('leaflet-container')) return null;
      const cs = getComputedStyle(p); if (cs.backgroundImage !== 'none') return null;
      const c = rgba(cs.backgroundColor); if (c && c.a > 0) { pila.push(c); if (c.a === 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 }; for (let i = pila.length - 1; i >= 0; i--) base = mezcla(pila[i], base); return base;
  };

  window.__a11y = function () {
    const out = { ancho: innerWidth, anchoDocumento: document.documentElement.clientWidth, zoomCss: getComputedStyle(document.documentElement).zoom, url: location.href };
    const doc = document.documentElement;
    out.pagina = {
      lang: doc.lang, viewportMeta: !!document.querySelector('meta[name=viewport]'), titulo: document.title, h1: document.querySelectorAll('h1').length,
      desbordeHorizontal: doc.scrollWidth > doc.clientWidth + 1, scrollWidth: doc.scrollWidth,
    };
    const niveles = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(vis).map((h) => +h.tagName[1]);
    out.pagina.saltosDeEncabezado = niveles.filter((n, i) => i > 0 && n > niveles[i - 1] + 1).length;
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id); out.pagina.idsDuplicados = ids.filter((x, i) => ids.indexOf(x) !== i).length;
    // elementos que sobresalen de la página sin estar dentro de una región desplazable propia
    out.desbordantes = [...document.body.querySelectorAll('*')].filter((e) => {
      if (!vis(e) || e.closest('.leaflet-container')) return false;
      const r = e.getBoundingClientRect(); if (r.right <= doc.clientWidth + 1) return false;
      for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll' || o === 'hidden') && p !== document.body && p !== doc) return false; }
      return true;
    }).slice(0, 8).map((e) => sel(e) + ' right=' + Math.round(e.getBoundingClientRect().right));
    // regiones desplazables: deben poder enfocarse con el teclado
    const desplazables = [...document.body.querySelectorAll('*')].filter((e) => vis(e) && !e.closest('.leaflet-container') && ['auto', 'scroll'].includes(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 1);
    out.regionesDesplazables = { total: desplazables.length, sinTeclado: desplazables.filter((e) => e.tabIndex < 0 && !e.querySelector('a,button,input,select,textarea,summary,[tabindex="0"]')).map(sel).slice(0, 8) };
    out.recortados = [...document.body.querySelectorAll('*')].filter((e) => vis(e) && !e.closest('.leaflet-container,.oculto') && getComputedStyle(e).overflow === 'hidden' && e.scrollWidth > e.clientWidth + 2 && e.children.length === 0 && (e.textContent || '').trim()).slice(0, 8).map(sel);
    // controles
    const ctl = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[tabindex]:not([tabindex="-1"])')].filter(vis);
    out.controles = { visibles: ctl.length };
    out.controles.sinNombre = ctl.filter((e) => !nombre(e)).map(sel).slice(0, 8);
    out.controles.pequenos = ctl.filter((e) => { const r = e.getBoundingClientRect(); const enLinea = e.tagName === 'A' && e.closest('p,small,li,span,footer,.leaflet-control-attribution'); return !enLinea && !e.disabled && Math.min(r.width, r.height) < 23.5; })
      .map((e) => { const r = e.getBoundingClientRect(); return sel(e) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); }).slice(0, 12);
    out.controles.tabindexPositivo = ctl.filter((e) => e.tabIndex > 0).length;
    out.controles.sinFocoVisible = 'no medible por script: comprobar con el teclado (ver guion-accesibilidad.md)';
    // contraste de texto
    const textos = [...document.body.querySelectorAll('*')].filter((e) => vis(e) && !e.closest('.leaflet-container,svg,script,style') && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    let minimo = 99; const fallos = []; let medidos = 0;
    for (const e of textos) {
      if (e.disabled || e.closest('[disabled]')) continue;
      const cs = getComputedStyle(e); const f = rgba(cs.color); const b = fondo(e); if (!f || !b) continue;
      const fg = mezcla(f, b); const r = ratio(fg, b); const px = parseFloat(cs.fontSize); const grande = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
      medidos++; minimo = Math.min(minimo, r);
      if (r < (grande ? 3 : 4.5)) fallos.push(sel(e) + ' ' + r.toFixed(2) + ':1 "' + e.textContent.trim().slice(0, 30) + '"');
    }
    out.contraste = { textosMedidos: medidos, minimo: +minimo.toFixed(2), fallos: fallos.slice(0, 12), totalFallos: fallos.length };
    // estructura
    out.estructura = {
      regionesVivas: document.querySelectorAll('[aria-live],[role=status],[role=alert]').length,
      svgSinNombre: [...document.querySelectorAll('svg')].filter((s) => vis(s) && !s.closest('.leaflet-container,.leaflet-control') && !(s.getAttribute('aria-label') || s.getAttribute('aria-labelledby') || s.querySelector('title')) && s.getAttribute('aria-hidden') !== 'true').length,
      tablasSinCaption: [...document.querySelectorAll('table')].filter((t) => !t.caption && !t.getAttribute('aria-label') && !t.getAttribute('aria-labelledby')).length,
      thSinScope: [...document.querySelectorAll('th')].filter((t) => !t.getAttribute('scope')).length,
      imagenesSinAlt: [...document.querySelectorAll('img')].filter((i) => i.getAttribute('alt') === null && !i.closest('.leaflet-container')).length,
      mapaConEtiqueta: !!document.querySelector('[aria-label*="apa"],[aria-labelledby]') && !!document.querySelector('.leaflet-container'),
      etiquetaReplay: [...document.querySelectorAll('.etiqueta-mapa')].map((e) => e.textContent.trim()),
    };
    return out;
  };

  /** T051: contraste de la capa del mapa. Descarga (con fetch CORS, los mismos teselados que ya muestra el mapa) los teselados visibles, muestrea sus píxeles y calcula la razón de
   *  contraste de cada color de la leyenda (círculo con relleno al 75 % y borde de 1 px) y de las fronteras (#334155) frente a ellos. WCAG 1.4.11 pide 3:1 para elementos gráficos. */
  window.__contrasteMapa = async function () {
    const FG = { 'menos de 70 km (#e8a317)': '#e8a317', '70-299 km (#e35b37)': '#e35b37', '300 km o más (#7b3fb6)': '#7b3fb6', 'sin profundidad (#64748b)': '#64748b', 'fronteras (#334155)': '#334155', 'selección (#111827)': '#111827', 'borde de círculo desde 6.7 (#1f2937)': '#1f2937' };
    const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), a: 1 });
    const cont = document.querySelector('.leaflet-container').getBoundingClientRect();
    const tiles = [...document.querySelectorAll('img.leaflet-tile')].filter((i) => { const r = i.getBoundingClientRect(); return r.right > cont.left && r.left < cont.right && r.bottom > cont.top && r.top < cont.bottom && i.complete && i.naturalWidth > 0; });
    const px = []; let fallidos = 0;
    for (const img of tiles) {
      let bmp; try { bmp = await createImageBitmap(await (await fetch(img.src, { mode: 'cors' })).blob()); } catch (e) { fallidos++; continue; }
      const cv = new OffscreenCanvas(bmp.width, bmp.height); const cx = cv.getContext('2d'); cx.drawImage(bmp, 0, 0);
      const d = cx.getImageData(0, 0, bmp.width, bmp.height).data;
      for (let i = 0; i < d.length; i += 4 * 7) px.push({ r: d[i], g: d[i + 1], b: d[i + 2], a: 1 });
    }
    const fondos = new Map(); for (const p of px) { const k = p.r + ',' + p.g + ',' + p.b; fondos.set(k, (fondos.get(k) || { p, n: 0 })); fondos.get(k).n++; }
    const res = { teselados: tiles.length, teseladosNoDescargados: fallidos, pixelesMuestreados: px.length, coloresDistintos: fondos.size, resultados: {} };
    const dominantes = [...fondos.values()].sort((a, b) => b.n - a.n).slice(0, 4).map((f) => ({ rgb: f.p.r + ',' + f.p.g + ',' + f.p.b, pct: +(100 * f.n / px.length).toFixed(1) }));
    res.fondosDominantes = dominantes;
    for (const [nombre, h] of Object.entries(FG)) {
      const fg = hex(h); const esCirculo = nombre.includes('km') || nombre.startsWith('sin prof');
      const rs = px.map((b) => { const rel = esCirculo ? mezcla({ ...fg, a: 0.75 }, b) : fg; return { relleno: ratio(rel, b), borde: ratio(fg, b) }; });
      const ord = (k) => rs.map((x) => x[k]).sort((a, b) => a - b); const q = (a, p) => a[Math.floor(p * (a.length - 1))];
      const r1 = ord('relleno'), r2 = ord('borde');
      res.resultados[nombre] = { relleno: { min: +r1[0].toFixed(2), p5: +q(r1, 0.05).toFixed(2), mediana: +q(r1, 0.5).toFixed(2), pctBajo3: +(100 * r1.filter((x) => x < 3).length / r1.length).toFixed(1) },
        borde: { min: +r2[0].toFixed(2), p5: +q(r2, 0.05).toFixed(2), mediana: +q(r2, 0.5).toFixed(2), pctBajo3: +(100 * r2.filter((x) => x < 3).length / r2.length).toFixed(1) } };
    }
    return res;
  };
})();
