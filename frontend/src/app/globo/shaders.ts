// Globo 3D (F7, 4.ª iteración): shaders de los elementos AMBIENTALES nuevos (anillos de eventos nuevos y estrellas). Son solo cadenas de texto GLSL: este módulo no importa three
// y se carga dentro del chunk de la escena. Se separan de escena.ts para que éste siga siendo manejable; los shaders del planeta y de los marcadores siguen en escena.ts.
import { DURACION_ONDA_MS } from './ondas';

// ---------- ANILLOS DE EVENTOS NUEVOS (ondas.ts) ----------------------------------------------------------------------------------------------------
// Un único InstancedMesh pequeño (MAX_ONDAS instancias) con UN uniform de tiempo (uAhora, en segundos de la escena) y UN atributo por instancia (aInicio: cuándo nació el anillo, en
// los mismos segundos; −1e6 = libre). Todo el movimiento se calcula aquí: p = progreso 0–1. Fuera de [0, 1] el anillo no existe (se descarta el vértice). Como los marcadores, se
// descarta el anillo cuyo centro queda por detrás del horizonte (cara oculta). Se dibuja DETRÁS de los marcadores (renderOrder 6 < 10), sin escribir profundidad.
export const VERTICE_ONDA = `
  attribute float aInicio;
  uniform float uAhora;
  varying vec2 vPos;
  varying float vP;
  void main() {
    vP = (uAhora - aInicio) / ${(DURACION_ONDA_MS / 1000).toFixed(3)};
    vPos = position.xy;
    vec3 centro = instanceMatrix[3].xyz;
    if (vP < 0.0 || vP > 1.0 || dot(normalize(centro), cameraPosition) <= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }`;
export const FRAGMENTO_ONDA = `
  uniform vec3 uColor;
  varying vec2 vPos;
  varying float vP;
  void main() {
    float r = length(vPos);
    float aa = max(fwidth(r), 0.0005);
    float e = 1.0 - (1.0 - vP) * (1.0 - vP);               // el anillo se frena al expandirse (ease-out)
    float radio = mix(0.1, 0.9, e);
    float anillo = 1.0 - smoothstep(0.05 - aa, 0.05 + aa, abs(r - radio));
    float borde = 1.0 - smoothstep(0.93, 1.0, r);          // el polígono de 48 lados nunca recorta el anillo
    gl_FragColor = vec4(uColor, anillo * borde * (1.0 - vP) * 0.85);
    #include <colorspace_fragment>
  }`;

// ---------- ESTRELLAS (estrellas.ts) --------------------------------------------------------------------------------------------------------------------
// Un único Points. aEstrella = [tamaño px CSS, brillo, fase del parpadeo (−1 = no parpadea)]; uPx = pixelRatio actual (el tamaño visual no cambia con la calidad adaptativa).
// F8: unas pocas estrellas parpadean con el uniform común uAhora (segundos de la escena) y uParpadeo (1 = activo, 0 = movimiento reducido). No piden fotogramas: solo se mueven mientras
// el bucle ya corre por otro motivo (rotación, pulso, anillos); con todo en reposo el bucle sigue parado.
export const VERTICE_ESTRELLAS = `
  attribute vec3 aEstrella;
  uniform float uPx;
  uniform float uAhora;
  uniform float uParpadeo;
  varying float vBrillo;
  void main() {
    float tw = aEstrella.z < 0.0 ? 1.0 : mix(1.0, 0.55 + 0.45 * sin(uAhora * (0.9 + 1.6 * aEstrella.z) + 40.0 * aEstrella.z), uParpadeo);
    vBrillo = aEstrella.y * tw;
    gl_PointSize = aEstrella.x * uPx;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
export const FRAGMENTO_ESTRELLAS = `
  uniform vec3 uColor;
  varying float vBrillo;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    gl_FragColor = vec4(uColor, (1.0 - smoothstep(0.35, 1.0, d)) * vBrillo);
    #include <colorspace_fragment>
  }`;
