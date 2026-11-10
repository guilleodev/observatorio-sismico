// Globo 3D (F7): generador PURO y determinista de eventos SINTÉTICOS para pruebas de carga y de selección. NO lo importa ningún código de la aplicación
// (lo comprueba tests/globo.test.ts): no hay ningún hook global en producción. Son datos ficticios (ids «prueba-N»); nunca deben mezclarse con datos reales.
import type { Evento } from '../modelos';

/** PRNG mulberry32: misma semilla, misma secuencia. */
function aleatorio(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `n` eventos sintéticos repartidos por el globo (latitud con densidad uniforme en la esfera), con magnitud 0–8 y profundidad 0–600 km. */
export function generarEventosSinteticos(n: number, semilla = 1): Evento[] {
  const r = aleatorio(semilla);
  const salida: Evento[] = [];
  for (let i = 0; i < n; i++) {
    const lon = r() * 360 - 180;
    const lat = (Math.asin(r() * 2 - 1) * 180) / Math.PI;
    salida.push({
      type: 'Feature', id: `prueba-${i}`,
      geometry: { type: 'Point', coordinates: [lon, lat, r() * 600] },
      properties: { mag: Math.round(r() * 80) / 10, magType: 'ml', place: `Evento sintético ${i}`, time: 1_790_000_000_000 + i * 1000, updated: 1_790_000_000_000 + i * 1000, country_name: null },
    });
  }
  return salida;
}
