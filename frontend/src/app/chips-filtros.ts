// Partición del resumen de filtros en «chips» (F7, ronda 3 «Mission Control»). Función PURA y autocontenida.
// `resumen()` (filtros.ts) une las partes con « · » (periodo, magnitud ≥ N, país X). Aquí solo se vuelve a separar para PRESENTARLAS como chips; no se interpreta ni se cambia su texto.
// Si el texto no contiene el separador (o es ambiguo), queda un único chip; vacío → [] (el componente muestra «sin consulta»).

const SEPARADOR = ' · ';

export function partirResumen(resumen: string | null | undefined): string[] {
  if (typeof resumen !== 'string') return [];
  const texto = resumen.trim();
  if (texto === '') return [];
  const partes = texto.split(SEPARADOR).map((p) => p.trim());
  // Robustez: una parte vacía o con un «·» suelto (separador doble o al borde) indica un texto que no sigue el formato esperado → un único chip con el texto íntegro.
  return partes.some((p) => p === '' || p.includes('·')) ? [texto] : partes;
}
