// Globo 3D (F7): textura equirectangular del planeta (océano, continentes, costas y retícula) dibujada UNA vez con Canvas 2D a partir de datos/paises.geojson.
// Módulo PURO: no usa three ni el DOM (recibe el contexto 2D como parámetro), así que se prueba con `node --test` (tests/globo.test.ts). El lienzo y el
// CanvasTexture los crea escena.ts. Todo lo que se dibuja sale del propio GeoJSON local y de la paleta (tokens): ningún recurso externo.
//
// Proyección equirectangular: x = (lon + 180) / 360 · ancho,  y = (90 − lat) / 180 · alto.
//
// Antimeridiano (lon ±180). Un anillo que lo cruza, p. ej. Fiyi [177, −178], aparece en el GeoJSON como un salto de ~355° de longitud; dibujado tal cual,
// el relleno cruzaría todo el mapa. Se resuelve así (normalizarAnillo): 1) se «desenvuelve» la longitud acumulando ±360° en cada salto > 180° (177 → 182 en lugar de
// −178); 2) el anillo se dibuja en tres copias desplazadas −360°, 0 y +360° y el lienzo recorta lo que cae fuera (así cada mitad aparece en su borde); 3) si tras
// desenvolver el anillo no se cierra (termina 360° más allá de donde empezó) es que rodea un polo (Antártida): se cierra por el polo con dos puntos sintéticos.
// Los huecos (anillos interiores) y los MultiPolygon se rellenan con la regla par-impar en un único trazado por polígono.

export type Contexto2D = Pick<CanvasRenderingContext2D, 'fillStyle' | 'strokeStyle' | 'lineWidth' | 'lineJoin' | 'globalAlpha' | 'fillRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'fill' | 'stroke'>;

export interface ColoresTextura { oceano: string; continente: string; reticula: string; costas: string }

/** Giro (rad) del mallado SphereGeometry de three para que la columna u de la imagen caiga en su longitud: la esfera de three pone u = 0 en −X (lon −90°), no en lon −180°. */
export const ROTACION_Y_TEXTURA = -Math.PI / 2;
/** Paso de la retícula dibujada en la textura (grados). */
export const PASO_RETICULA = 30;

/** Anillo ya «desenvuelto»: longitudes continuas (pueden salir de [−180, 180]) y, por segmento, si es una costura (no se traza). */
export interface AnilloPlano {
  lon: number[]; lat: number[];
  /** costura[i] = el segmento (i−1 → i) recorre el antimeridiano o un polo: forma parte del contorno del polígono pero no es una costa. */
  costura: boolean[];
}

/**
 * Tamaño de la textura: 4096×2048 en escritorio y 2048×1024 en móvil, sin superar MAX_TEXTURE_SIZE de la GPU; siempre potencia de 2 (mipmaps) y relación 2:1.
 */
export function tamanoTextura(maxTexturaGl: number, movil: boolean): { ancho: number; alto: number } {
  const objetivo = movil ? 2048 : 4096;
  const tope = Number.isFinite(maxTexturaGl) && maxTexturaGl >= 256 ? Math.floor(maxTexturaGl) : 2048;
  const ancho = 2 ** Math.floor(Math.log2(Math.min(objetivo, tope)));
  return { ancho, alto: ancho / 2 };
}

/** Desenvuelve la longitud de un anillo y lo cierra por el polo si lo rodea. Devuelve null si tiene menos de 3 puntos válidos. */
export function normalizarAnillo(anillo: unknown): AnilloPlano | null {
  if (!Array.isArray(anillo)) return null;
  const lon: number[] = []; const lat: number[] = []; const costura: boolean[] = [];
  let lonPrevia: number | null = null; let latPrevia = 0; let desplazo = 0;
  for (const par of anillo) {
    const l: unknown = Array.isArray(par) ? par[0] : undefined; const b: unknown = Array.isArray(par) ? par[1] : undefined;
    if (typeof l !== 'number' || typeof b !== 'number' || !Number.isFinite(l) || !Number.isFinite(b) || Math.abs(b) > 90) continue; // punto inválido: se salta
    if (lonPrevia === null) costura.push(false);
    else {
      const d = l - lonPrevia;
      if (d > 180) desplazo -= 360; else if (d < -180) desplazo += 360;
      costura.push((Math.abs(l) === 180 && l === lonPrevia) || (Math.abs(b) === 90 && Math.abs(latPrevia) === 90));
    }
    lon.push(l + desplazo); lat.push(b);
    lonPrevia = l; latPrevia = b;
  }
  const n = lon.length;
  if (n < 3) return null;
  if (Math.abs(lon[n - 1] - lon[0]) > 180) {       // no se cierra tras desenvolver: rodea un polo
    const polo = lat.reduce((s, v) => s + v, 0) / n < 0 ? -90 : 90;
    lon.push(lon[n - 1], lon[0]); lat.push(polo, polo); costura.push(true, true);
  }
  return { lon, lat, costura };
}

/** Desplazamientos de longitud (−360, 0, +360) cuya copia del anillo toca el rango visible [−180, 180]. */
export function desplazamientosVisibles(a: AnilloPlano): number[] {
  let min = Infinity; let max = -Infinity;
  for (const v of a.lon) { if (v < min) min = v; if (v > max) max = v; }
  return [-360, 0, 360].filter((k) => max + k > -180 && min + k < 180); // estricto: una copia que solo ROZA el borde no aporta nada
}

/** Polígonos (lista de anillos: el exterior y sus huecos) de cualquier GeoJSON; Polygon y MultiPolygon. Lo demás (líneas, puntos) no se rellena. */
export function poligonosDe(geojson: unknown): unknown[][] {
  const salida: unknown[][] = [];
  const visitar = (g: unknown): void => {
    if (typeof g !== 'object' || g === null) return;
    const o = g as { type?: string; coordinates?: unknown; geometries?: unknown; geometry?: unknown; features?: unknown };
    if (o.type === 'FeatureCollection' && Array.isArray(o.features)) o.features.forEach(visitar);
    else if (o.type === 'Feature') visitar(o.geometry);
    else if (o.type === 'GeometryCollection' && Array.isArray(o.geometries)) o.geometries.forEach(visitar);
    else if (o.type === 'Polygon' && Array.isArray(o.coordinates)) salida.push(o.coordinates);
    else if (o.type === 'MultiPolygon' && Array.isArray(o.coordinates)) for (const p of o.coordinates) if (Array.isArray(p)) salida.push(p);
  };
  visitar(geojson);
  return salida;
}

/** Añade al trazado actual una copia del anillo (desplazada `k` grados de longitud). `trazo`: los segmentos-costura se saltan (moveTo) para que no se dibujen como costa. */
function trazar(ctx: Contexto2D, a: AnilloPlano, k: number, ancho: number, alto: number, trazo: boolean): void {
  for (let i = 0; i < a.lon.length; i++) {
    const x = ((a.lon[i] + 180 + k) / 360) * ancho; const y = ((90 - a.lat[i]) / 180) * alto;
    if (i === 0 || (trazo && a.costura[i])) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  if (!trazo) ctx.closePath();
}

/**
 * Dibuja la textura completa: océano → continentes (par-impar, con huecos) → retícula cada 30° → costas y fronteras con trazo fino.
 * Los grosores escalan con el ancho (2 px a 4096; 1 px a 2048). Nada se dibuja fuera del lienzo: el recorte lo hace el propio canvas.
 */
export function dibujarTierra(ctx: Contexto2D, geojson: unknown, ancho: number, alto: number, colores: ColoresTextura): void {
  const grosor = Math.max(1, ancho / 2048);
  ctx.globalAlpha = 1; ctx.lineJoin = 'round';
  ctx.fillStyle = colores.oceano; ctx.fillRect(0, 0, ancho, alto);

  const poligonos = poligonosDe(geojson).map((anillos) => anillos.map(normalizarAnillo).filter((a): a is AnilloPlano => a !== null)).filter((anillos) => anillos.length > 0);
  ctx.fillStyle = colores.continente;
  for (const anillos of poligonos) {
    ctx.beginPath();
    for (const a of anillos) for (const k of desplazamientosVisibles(a)) trazar(ctx, a, k, ancho, alto, false);
    ctx.fill('evenodd');
  }

  ctx.strokeStyle = colores.reticula; ctx.lineWidth = grosor;
  ctx.beginPath();
  for (let lat = -90 + PASO_RETICULA; lat < 90; lat += PASO_RETICULA) { const y = ((90 - lat) / 180) * alto; ctx.moveTo(0, y); ctx.lineTo(ancho, y); }
  for (let lon = -180; lon <= 180; lon += PASO_RETICULA) { const x = ((lon + 180) / 360) * ancho; ctx.moveTo(x, 0); ctx.lineTo(x, alto); }
  ctx.stroke();

  ctx.strokeStyle = colores.costas; ctx.lineWidth = grosor; ctx.globalAlpha = 0.55;
  ctx.beginPath();
  for (const anillos of poligonos) for (const a of anillos) for (const k of desplazamientosVisibles(a)) trazar(ctx, a, k, ancho, alto, true);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
