// Globo 3D (F7): detección de WebGL SIN cargar three. Se ejecuta antes del import() dinámico de escena.ts: si no hay WebGL, ni siquiera se descarga el chunk.
export const MENSAJE_SIN_WEBGL = 'Tu navegador o dispositivo no ofrece WebGL: usa el mapa 2D o la tabla.';
export const MENSAJE_FALLO_CARGA = 'No se pudo cargar el globo 3D: usa el mapa 2D o la tabla.';

/** Crea un canvas auxiliar, pide un contexto webgl2 o webgl y lo libera de inmediato (no se reutiliza: three crea el suyo en el canvas de la plantilla). */
export function hayWebgl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}
