// Globo 3D (F7): TODO el código three vive aquí. Este módulo se carga con import() dinámico solo la primera vez que se muestra el globo (chunk aparte): quien
// nunca abre la vista 3D no descarga three. La lógica de geometría, selección, textura y rotación es PURA y está en geometria.ts, textura.ts y rotacion.ts
// (probadas con node --test); aquí solo se dibuja y se orquesta.
//
// Render BAJO DEMANDA con UN solo bucle requestAnimationFrame (id único, con guarda). Solo se encadena otro fotograma mientras haya algo que mover: una transición de
// cámara (camara.ts: selección, región, recuperación de la vista; cada fotograma), la inercia de OrbitControls, la rotación automática (rotacion.ts) o la pulsación ambiental
// de los marcadores (pulso.ts; ≈ 25 fps). Con todo en reposo (rotación pausada, sin pulsación o con movimiento reducido) el bucle se PARA: cero trabajo.
// Pausa total con la vista 3D oculta, la pestaña oculta o el globo fuera de pantalla. Rotación, transición y pulsación se coordinan en el MISMO fotograma: ver `fotograma`.
//
// Orden de dibujo (renderOrder): estrellas (−10, detrás de todo) → planeta (opaco) → fronteras → atmósfera → halo de selección → anillos de eventos nuevos (6) → marcadores (10).
// Los marcadores van los últimos y SIN prueba de profundidad (la cara oculta del planeta se descarta en su shader), de modo que el orden de las instancias decide quién queda
// encima (ver ordenarPorCapas).
//
// 4.ª iteración (mejoras 1–6), todo dentro del MISMO bucle y los mismos estados, sin bucles ni reinicios nuevos:
//  · Día/noche (sol.ts): uniform uSol del planeta; el Sol se recalcula con UN temporizador de 60 s (o al reanudar) y solo pide UN fotograma si se movió > 0,05°. Los marcadores,
//    halos y anillos NO reciben el factor noche (materiales distintos): conservan color y contraste de noche. En REPRODUCCIÓN el reloj sigue siendo el UTC real actual.
//  · Anillos (ondas.ts): pool fijo de MAX_ONDAS instancias; el bucle solo se mantiene mientras haya anillos vivos (`finOndas`).
//  · Estrellas (estrellas.ts): un Points estático; no piden fotogramas. · Leyenda: atributo aRango por instancia + uniform uMascara (cambia solo con los datos o el filtro).
//  · Calidad (calidad.ts): mide el coste de render y ajusta el pixelRatio sin recrear nada. · Carga (carga.ts): `alFase` avisa de las fases reales.
import {
  AdditiveBlending, BackSide, BufferGeometry, CanvasTexture, CircleGeometry, Color, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4,
  Mesh, PerspectiveCamera, Points, Quaternion, Raycaster, SRGBColorSpace, Scene, ShaderMaterial, SphereGeometry, Spherical, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  DISTANCIA_INICIAL, DISTANCIA_MAX, DISTANCIA_MIN, ELEVACION_PUNTO, FOV_GLOBO, LAT_INICIAL, LON_INICIAL, RADIO_ESFERA, desplazamientoCentroPx, distanciaTrasZoom,
  esClic, latLonAXyz, ordenarPorCapas, segmentosFronteras, seleccionarPorRayo,
} from './geometria';
import type { PaletaGlobo, PuntosGlobo, Seleccion } from './geometria';
import { DURACION_TRANSICION_MS, TransicionCamara, UP_VERTICAL, ZOOM_SIN_SESION, esTransicionNula, planificarRecuperacion, planificarZoomSeleccion, poseDeLatLon, poseDeNormal, regionPorId, suavizar } from './camara';
import type { EstadoZoom, PoseCamara } from './camara';
import { ALFA_HALO, AMPLITUD_HALO, ESCALA_QUAD, INTERVALO_PULSO_MS, UMBRAL_MAG_PULSO, contarPulsantes, faseGlobal, hayPulso } from './pulso';
import { INTERVALO_TOOLTIP_MS, esperaTooltipMs, posicionarTooltip, tooltipPermitido } from './tooltip';
import type { ContextoTooltip } from './tooltip';
import { MaquinaRotacion } from './rotacion';
import { ROTACION_Y_TEXTURA, dibujarTierra, tamanoTextura } from './textura';
import { INTERVALO_SOL_MS, OSCURECIMIENTO_NOCHE, SEN_CREPUSCULO, TINTE_TERMINADOR, UMBRAL_CAMBIO_SOLAR_GRADOS, cambioAngularGrados, posicionSolar, vectorSolar } from './sol';
import type { Vec3 } from './sol';
import { INICIO_INACTIVO, MAX_ONDAS, DURACION_ONDA_MS, SeguimientoOndas, radioMaxOnda, ranurasLibres } from './ondas';
import { generarEstrellas } from './estrellas';
import { MaquinaCalidad } from './calidad';
import { ALFA_ATENUADO, MASCARA_TODOS, codificarRangos, filtrarPuntos, mascaraDeRango } from './leyenda';
import { FRAGMENTO_ESTRELLAS, FRAGMENTO_ONDA, VERTICE_ESTRELLAS, VERTICE_ONDA } from './shaders';
import type { FaseCarga } from './carga';

export interface OpcionesEscena {
  paleta: PaletaGlobo;
  /** Clic o toque (no arrastre) sobre un evento de la cara visible. */
  alSeleccionar(id: string): void;
  /** Clic o toque (no arrastre) en una zona VACÍA con un terremoto seleccionado: equivale al botón «Cerrar» (el componente emite `cerrar` → `elegir(null, ...)`). Sin selección no se llama. */
  alDeseleccionar(): void;
  alPerderContexto(): void;
  alRestaurarContexto(): void;
  /** Píxeles de la derecha ocupados por el panel de detalle flotante (0 si no hay panel o es móvil): la cámara desplaza el centro, el canvas NO cambia de tamaño. */
  reservaDerecha(): number;
  /** La rotación se apagó sola (movimiento reducido activado): el botón debe reflejarlo. */
  alCambiarRotacion(activa: boolean): void;
  /** Elemento HTML de la etiqueta flotante (hijo del contenedor; pointer-events: none). La escena solo le cambia el textContent, `hidden` y el transform. */
  tooltip: HTMLElement;
  /** Texto «lugar · M magnitud» del evento (por id) o null si no se conoce. */
  textoTooltip(id: string): string | null;
  /** Fase real de la carga (carga.ts): la escena avisa de «inicializando» (al empezar a crear el renderer) y de «textura» (al dibujar la textura). El componente decide el resto. */
  alFase?(fase: FaseCarga): void;
}

const SEGMENTOS_PUNTO = 32;
const Z = new Vector3(0, 0, 1);
/** Mientras SOLO se gira solo, se dibuja como mucho cada 30 ms (≈ 30 fps): a 2,4 °/s el desplazamiento es < 1 px por fotograma y no compensa el coste de 60 fps. */
const INTERVALO_ROTACION_MS = 30;
/** Margen (ms) al despertar tras el retardo de inactividad: absorbe la deriva del temporizador. */
const MARGEN_DESPERTAR_MS = 20;
/** Tras un zoom (rueda con Ctrl o botones) no se calcula la etiqueta durante este tiempo (ms): el zoom se considera «en curso». */
const ZOOM_EN_CURSO_MS = 250;

// ---------- Planeta -------------------------------------------------------------------------------------------------------------------------------
// Textura equirectangular (océano + continentes + costas + retícula, dibujada en 2D) con sombreado suave: luz fija RESPECTO A LA CÁMARA (el sombreado no cambia al
// girar), oscurecimiento hacia el limbo y un reborde fresnel cian muy tenue. Sin la textura (fallo del GeoJSON) es una esfera lisa del color del océano.
//
// DÍA/NOCHE (sol.ts) — cómo se combina con la luz fija de cámara: son DOS factores independientes que se MULTIPLICAN.
//  · `luz` (fija respecto a la cámara, 0,78–1,06) da el volumen y no cambia al girar. Se mantiene tal cual.
//  · `velo` (día/noche) depende solo de la posición del Sol respecto a la geografía del fragmento (vW = normal en el sistema del MUNDO, el mismo en que se colocan los
//    marcadores; no gira con la cámara): 1 de día, 1 − OSCURECIMIENTO_NOCHE de noche, con un smoothstep suave de ±10° en el terminador. Solo escala la luminosidad de la textura
//    (continentes, costas y retícula siguen visibles). El reborde fresnel del limbo no se oscurece. Un tinte cálido muy tenue (multiplicativo) marca el crepúsculo.
// Los marcadores, halos y anillos usan OTROS materiales sin este factor: no se oscurecen de noche.
const VERTICE_PLANETA = `
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAGMENTO_PLANETA = `
  uniform sampler2D uMapa;
  uniform float uTieneMapa;
  uniform vec3 uOceano;
  uniform vec3 uRim;
  uniform vec3 uLuz;
  uniform vec3 uSol;
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    vec3 base = uTieneMapa > 0.5 ? texture2D(uMapa, vUv).rgb : uOceano;
    float luz = mix(0.78, 1.06, smoothstep(-0.3, 0.9, dot(n, normalize(uLuz))));
    float cara = clamp(dot(n, v), 0.0, 1.0);
    float limbo = mix(0.6, 1.0, smoothstep(0.0, 0.55, cara));
    float noche = 1.0 - smoothstep(-${SEN_CREPUSCULO.toFixed(4)}, ${SEN_CREPUSCULO.toFixed(4)}, dot(normalize(vW), uSol));
    float velo = 1.0 - ${OSCURECIMIENTO_NOCHE.toFixed(3)} * noche;
    vec3 c = base * luz * limbo * velo;
    c *= mix(vec3(1.0), vec3(1.3, 1.0, 0.75), ${TINTE_TERMINADOR.toFixed(3)} * 4.0 * noche * (1.0 - noche));
    c += uRim * pow(1.0 - cara, 3.0) * 0.2;
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

// ---------- Marcadores ----------------------------------------------------------------------------------------------------------------------------
// Disco con borde claro fino: el color por profundidad llega por instancia (instanceColor) y el borde (--punto-borde) es un uniforme. El borde mide el 7 % del radio
// (nunca menos de ≈ 0,8 px: en los círculos pequeños un 7 % sería invisible y se perdería el contraste WCAG 1.4.11, que se mide en tests/globo.test.ts sobre océano
// y continente) y se suaviza con fwidth. El seleccionado (uSel = su índice de instancia) se agranda un 20 %, con borde cian algo más grueso.
// Sin prueba de profundidad: la cara oculta se descarta aquí (centro del disco por detrás del horizonte: n·cámara <= 1) y el orden de instancias decide el solape.
//
// PULSACIÓN (pulso.ts): un halo EXTERIOR tenue que respira, calculado aquí con UN uniform de fase común (uFase) — ni animaciones por evento ni buffers por fotograma. El polígono
// se amplía a ESCALA_QUAD y vPos se mide en «radios de disco» (el disco sigue ocupando r <= 1, es decir, mismo tamaño y mismo borde que antes); el halo ocupa 1 < r <= 1 + AMPLITUD_HALO.
// Solo pulsan las primeras uNPulso instancias (las de mayor magnitud: están al principio por ordenarPorCapas); la fase de cada una sale de un hash de su índice; uAmp = 0 la apaga
// (movimiento reducido). El seleccionado no pulsa (ya lleva su anillo). El relleno (color por profundidad) y el radio (por magnitud) no se tocan.
//
// LEYENDA INTERACTIVA (leyenda.ts): `aRango` (0–3, atributo por instancia, escrito solo al cambiar los datos) y `uMascara` (bits de los rangos visibles, uniform que solo cambia al
// pulsar la leyenda; 15 = todos). Un marcador de un rango no activo se dibuja con opacidad ALFA_ATENUADO y no pulsa; el seleccionado se dibuja siempre a opacidad plena. Sin
// lógica por evento en JavaScript ni trabajo por fotograma. Estos marcadores NO reciben el factor día/noche del planeta.
const VERTICE_PUNTO = `
  attribute float aRango;
  uniform float uSel;
  uniform float uFase;
  uniform float uAmp;
  uniform float uNPulso;
  uniform float uMascara;
  varying vec3 vColor;
  varying vec2 vPos;
  varying float vSel;
  varying float vPulso;
  varying float vDim;
  void main() {
    vPos = position.xy * ${ESCALA_QUAD.toFixed(4)};
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #else
      vColor = vec3(1.0);
    #endif
    vSel = float(gl_InstanceID) == uSel ? 1.0 : 0.0;
    float hash = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);
    vPulso = uAmp * step(float(gl_InstanceID) + 0.5, uNPulso) * (0.5 + 0.5 * sin(uFase + 6.2831853 * hash)) * (1.0 - vSel);
    float visible = max(vSel, mod(floor(uMascara / exp2(aRango)), 2.0));
    vPulso *= visible;
    vDim = mix(${ALFA_ATENUADO.toFixed(3)}, 1.0, visible);
    vec3 centro = instanceMatrix[3].xyz;
    if (dot(normalize(centro), cameraPosition) <= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec3 p = vec3(position.xy * ${ESCALA_QUAD.toFixed(4)} * (1.0 + 0.2 * vSel), position.z);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  }`;
const FRAGMENTO_PUNTO = `
  uniform vec3 uBorde;
  uniform vec3 uSeleccion;
  varying vec3 vColor;
  varying vec2 vPos;
  varying float vSel;
  varying float vPulso;
  varying float vDim;
  void main() {
    float r = length(vPos);
    float aa = max(fwidth(r), 0.0005);
    float grosor = clamp(max(0.07, 0.8 * aa), 0.07, 0.5) * (1.0 + 0.8 * vSel);
    float t = smoothstep(1.0 - grosor - 0.5 * aa, 1.0 - grosor + 0.5 * aa, r);
    vec3 c = mix(vColor, mix(uBorde, uSeleccion, vSel), t);
    float disco = 1.0 - smoothstep(1.0 - aa, 1.0, r);
    float halo = (1.0 - smoothstep(1.0, 1.0 + max(${AMPLITUD_HALO.toFixed(3)} * vPulso, 0.002), r)) * ${ALFA_HALO.toFixed(3)} * vPulso;
    float a = disco + (1.0 - disco) * halo;
    gl_FragColor = vec4(mix(uBorde, c, disco / max(a, 0.0001)), a * vDim);
    #include <colorspace_fragment>
  }`;
// Halo de selección: disco translúcido con un anillo, algo mayor que el marcador. Se dibuja DETRÁS de los marcadores (renderOrder menor), sin escribir profundidad
// (depthWrite = false) y con el planeta como única oclusión, así que no tapa a los vecinos.
const VERTICE_HALO_SEL = `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const FRAGMENTO_HALO_SEL = `
  uniform vec3 uColor;
  varying vec2 vPos;
  void main() {
    float r = length(vPos);
    float aa = max(fwidth(r), 0.0005);
    float relleno = (1.0 - smoothstep(0.4, 1.0, r)) * 0.18;
    float anillo = smoothstep(0.82 - aa, 0.82 + aa, r) * (1.0 - smoothstep(0.95 - aa, 0.95 + aa, r)) * 0.5;
    gl_FragColor = vec4(uColor, max(relleno, anillo) * (1.0 - smoothstep(1.0 - aa, 1.0, r)));
    #include <colorspace_fragment>
  }`;
// Atmósfera: esfera algo mayor, vista por dentro, con brillo que se desvanece hacia fuera (cian muy discreto, sin texturas).
const VERTICE_ATMOSFERA = `
  varying vec3 vN;
  void main() {
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const FRAGMENTO_ATMOSFERA = `
  uniform vec3 uColor;
  varying vec3 vN;
  void main() {
    float k = clamp(-vN.z / 0.42, 0.0, 1.0);
    gl_FragColor = vec4(uColor, pow(k, 2.0) * 0.28);
    #include <colorspace_fragment>
  }`;

export class EscenaGlobo {
  private canvas!: HTMLCanvasElement;
  private contenedor!: HTMLElement;
  private opciones!: OpcionesEscena;
  private renderer!: WebGLRenderer;
  private escena!: Scene;
  private camara!: PerspectiveCamera;
  private controles!: OrbitControls;
  private geomPunto!: CircleGeometry;
  private matPunto!: ShaderMaterial;
  private matPlaneta!: ShaderMaterial;
  private texturaTierra: CanvasTexture | null = null;
  private malla: InstancedMesh | null = null; // UN único InstancedMesh para todos los eventos
  private capacidad = 0;
  private haloSel!: Mesh;
  private readonly propios: { dispose(): void }[] = []; // geometrías y materiales que hay que liberar
  private fronteras: LineSegments | null = null;
  private indice: PuntosGlobo | null = null; // eventos EN EL ORDEN DE LAS INSTANCIAS (ordenarPorCapas): su índice es el de la instancia
  private idSeleccion: string | null = null;
  private readonly colores = new Map<string, Color>();
  private readonly rayo = new Raycaster();
  // reutilizados en el bucle de colocación: no se crean objetos por evento
  private readonly v = new Vector3(); private readonly q = new Quaternion(); private readonly e = new Vector3(); private readonly m = new Matrix4();
  private readonly esf = new Spherical();
  private rotacion!: MaquinaRotacion;
  private rafId = 0; private idTemporizador = 0;
  private sucio = false; private tRender = 0; private enFotograma = false;
  private destruida = false;
  private pausadoPorVista = false; private fueraDePantalla = false; private pestanaOculta = false; private contextoPerdido = false;
  private ancho = 0; private alto = 0;
  // desplazamiento del centro por el panel lateral (setViewOffset): `desplazamiento` = px aplicados AHORA (intermedios durante la animación de cierre), `metaDesplazamiento` = los que pide el panel
  private desplazamiento = 0; private metaDesplazamiento = 0;
  private animDesplazamiento: { desde: number; hasta: number; t0: number | null } | null = null;
  private readonly posicionGuardada = new Vector3();   // posición de la cámara mientras se drena la inercia de OrbitControls (ver drenarInercia)
  private observadorTamano?: ResizeObserver; private observadorVisibilidad?: IntersectionObserver; private mqMovimiento?: MediaQueryList;
  // detección de clic frente a arrastre
  private abajo: { x: number; y: number } | null = null; private punteros = new Set<number>(); private multitoque = false;
  // transición de cámara (camara.ts): UNA sola; el tipo distingue la de selección, la de región y la de recuperación de la vista (al completarse esta última se reanuda la rotación)
  private readonly transicion = new TransicionCamara();
  private tipoTransicion: 'seleccion' | 'recuperar' | 'region' | null = null;
  private zoomSel: EstadoZoom = ZOOM_SIN_SESION;     // zoom aplicado al seleccionar (acercar ×0,8) y si la persona lo cambió después; se reinicia al recuperar la vista
  // Evento sobre el que ya se centró la cámara (seleccionar el mismo no repite). Es también la BANDERA que evita la doble recuperación: recuperarVista() lo pone a null, así que el
  // posterior fijarSeleccion(null) (efecto del componente tras `cerrar`) ve null y no inicia otra recuperación.
  private idCentrado: string | null = null;
  private hastaZoomMs = 0;                           // instante hasta el que se considera «zoom en curso» (para la etiqueta)
  // pulsación de los marcadores (pulso.ts): cuántas instancias pulsan (las primeras, ordenadas por radio)
  private nPulso = 0;
  // día/noche (sol.ts): vector unitario del Sol vigente (convención de latLonAXyz) y temporizador único de actualización
  private vectorSol: Vec3 = [0, 0, 1]; private idTemporizadorSol = 0;
  // anillos de eventos nuevos (ondas.ts): pool fijo, base de ids y fin del último anillo vivo (ms de performance.now); `epoca` = origen del reloj del shader
  private matOnda!: ShaderMaterial; private ondas!: InstancedMesh; private inicioOnda!: InstancedBufferAttribute;
  private readonly finRanuras = new Float64Array(MAX_ONDAS); private finOndas = 0; private epoca = 0;
  private readonly seguimiento = new SeguimientoOndas();
  // leyenda interactiva (leyenda.ts): geometría PROPIA de los marcadores con el atributo aRango, rango por instancia, rango activo, índice de la instancia seleccionada y subconjunto seleccionable
  private geomMarcas: CircleGeometry | null = null; private atributoRango: InstancedBufferAttribute | null = null;
  private rangoInst = new Uint8Array(0); private rangoActivo: number | null = null; private iSel = -1; private indicePick: PuntosGlobo | null = null;
  // estrellas y calidad adaptativa
  private matEstrellas!: ShaderMaterial; private calidad!: MaquinaCalidad;
  // etiqueta flotante (hover con ratón)
  private tooltip!: HTMLElement; private textoCursor = ''; private tamTooltip = { w: 0, h: 0 }; private rectLienzo: DOMRect | null = null;
  private hoverFino = false; private dentro = false; private hayHover = false;
  private ultimoPuntero: { x: number; y: number } | null = null; private ultimoCalculoTooltip = -Infinity; private idTemporizadorTooltip = 0;

  /** Crea renderer, cámara, controles y la escena estática (planeta, atmósfera, halo de selección). El canvas lo aporta la plantilla del componente. */
  iniciar(canvas: HTMLCanvasElement, contenedor: HTMLElement, opciones: OpcionesEscena): void {
    this.canvas = canvas; this.contenedor = contenedor; this.opciones = opciones; this.tooltip = opciones.tooltip;
    opciones.alFase?.('inicializando');                                                         // fase real: empieza la creación del renderer y la escena
    this.hoverFino = window.matchMedia('(hover: hover) and (pointer: fine)').matches; // etiqueta solo con ratón
    const paleta = opciones.paleta;
    const renderer = this.renderer = new WebGLRenderer({ canvas, antialias: true });
    // limitado a 2: en pantallas 3× el coste de relleno no compensa. Ese tope es el nivel MÁXIMO de la calidad adaptativa (calidad.ts), que solo puede bajar de él y volver a subir hasta él.
    const topePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.calidad = new MaquinaCalidad(topePixelRatio);
    this.epoca = performance.now();
    renderer.setPixelRatio(this.calidad.pixelRatio);
    renderer.setClearColor(new Color(paleta.fondo), 1);
    this.escena = new Scene();
    this.camara = new PerspectiveCamera(FOV_GLOBO, 1, 0.1, 20);
    this.colocarCamara(LAT_INICIAL, LON_INICIAL, DISTANCIA_INICIAL);

    const controles = this.controles = new OrbitControls(this.camara, canvas); // fija touch-action: none solo en el canvas
    controles.enablePan = false; controles.minDistance = DISTANCIA_MIN; controles.maxDistance = DISTANCIA_MAX; controles.dampingFactor = 0.08;
    this.mqMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.rotacion = new MaquinaRotacion(this.mqMovimiento.matches); // con movimiento reducido NO arranca sola
    this.aplicarMovimiento();
    this.mqMovimiento.addEventListener('change', this.aplicarMovimiento);
    controles.addEventListener('change', this.alCambiarCamara);

    this.construirEscenaEstatica(paleta);
    this.crearMalla(1024);

    canvas.addEventListener('pointerdown', this.alBajar);
    canvas.addEventListener('pointerup', this.alSubir);
    canvas.addEventListener('pointercancel', this.alSubir);
    canvas.addEventListener('pointermove', this.alMoverPuntero);
    canvas.addEventListener('pointerleave', this.alSalirPuntero);
    canvas.addEventListener('webglcontextlost', this.alPerderContexto);
    canvas.addEventListener('webglcontextrestored', this.alRestaurarContexto);
    // La rueda solo actúa con Ctrl/⌘ pulsado: sin él se corta en captura y la página sigue desplazándose (la rueda no secuestra el scroll).
    contenedor.addEventListener('wheel', this.alRueda, { capture: true, passive: true });
    document.addEventListener('visibilitychange', this.alCambiarVisibilidad);
    this.pestanaOculta = document.hidden;
    if (typeof ResizeObserver !== 'undefined') { this.observadorTamano = new ResizeObserver(this.ajustarTamano); this.observadorTamano.observe(contenedor); }
    if (typeof IntersectionObserver !== 'undefined') {
      this.observadorVisibilidad = new IntersectionObserver((entradas) => { this.fueraDePantalla = !entradas[entradas.length - 1].isIntersecting; this.actualizarPausa(); });
      this.observadorVisibilidad.observe(contenedor);
    }
    this.rotacion.fijarEntorno(!this.pausadoPorVista, !this.pestanaOculta, !this.fueraDePantalla);
    this.ajustarTamano();
    this.programarSol();
    this.pedirFotograma();
  }

  private construirEscenaEstatica(paleta: PaletaGlobo): void {
    const esfera = new SphereGeometry(RADIO_ESFERA, 64, 48);
    this.vectorSol = vectorSolar(posicionSolar(Date.now()));   // reloj UTC real, también en REPRODUCCIÓN (el terminador es ambiental, no la hora de los eventos)
    this.matPlaneta = new ShaderMaterial({
      uniforms: { uMapa: { value: null }, uTieneMapa: { value: 0 }, uOceano: { value: new Color(paleta.esfera) }, uRim: { value: new Color(paleta.halo) }, uLuz: { value: new Vector3(-0.45, 0.55, 0.7) },
        uSol: { value: new Vector3(...this.vectorSol) } },
      vertexShader: VERTICE_PLANETA, fragmentShader: FRAGMENTO_PLANETA,
    });
    const planeta = new Mesh(esfera, this.matPlaneta);
    planeta.rotation.y = ROTACION_Y_TEXTURA; // alinea la columna u de la imagen con su longitud (la esfera de three pone u = 0 en lon −90°)
    this.escena.add(planeta);
    const atmosfera = new SphereGeometry(RADIO_ESFERA * 1.1, 48, 32);
    const matAtmosfera = new ShaderMaterial({ uniforms: { uColor: { value: new Color(paleta.halo) } }, vertexShader: VERTICE_ATMOSFERA, fragmentShader: FRAGMENTO_ATMOSFERA,
      side: BackSide, transparent: true, depthWrite: false, blending: AdditiveBlending });
    const malla = new Mesh(atmosfera, matAtmosfera);
    malla.renderOrder = 2;
    this.escena.add(malla);
    this.geomPunto = new CircleGeometry(1, SEGMENTOS_PUNTO);
    this.matPunto = new ShaderMaterial({
      uniforms: { uBorde: { value: new Color(paleta.borde) }, uSeleccion: { value: new Color(paleta.seleccion) }, uSel: { value: -1 }, uFase: { value: 0 }, uAmp: { value: 0 }, uNPulso: { value: 0 },
        uMascara: { value: MASCARA_TODOS } },
      vertexShader: VERTICE_PUNTO, fragmentShader: FRAGMENTO_PUNTO, transparent: true, depthTest: false, depthWrite: false,
    });
    const matHalo = new ShaderMaterial({ uniforms: { uColor: { value: new Color(paleta.seleccion) } }, vertexShader: VERTICE_HALO_SEL, fragmentShader: FRAGMENTO_HALO_SEL,
      transparent: true, depthWrite: false });
    this.haloSel = new Mesh(this.geomPunto, matHalo);
    this.haloSel.renderOrder = 5;
    this.haloSel.visible = false;
    this.escena.add(this.haloSel);
    this.propios.push(esfera, this.matPlaneta, atmosfera, matAtmosfera, this.geomPunto, this.matPunto, matHalo);
    this.construirAmbiente(paleta);
  }

  /**
   * Elementos ambientales de la 4.ª iteración, creados UNA vez: estrellas (un Points estático, detrás de todo) y el pool de anillos de eventos nuevos (un InstancedMesh pequeño aparte,
   * con su propio material: nada de esto toca el material de los marcadores). Se liberan en destruir() mediante `propios`.
   */
  private construirAmbiente(paleta: PaletaGlobo): void {
    const e = generarEstrellas();
    const geomEstrellas = new BufferGeometry();
    geomEstrellas.setAttribute('position', new Float32BufferAttribute(e.posiciones, 3));
    geomEstrellas.setAttribute('aEstrella', new Float32BufferAttribute(e.propiedades, 2));
    this.matEstrellas = new ShaderMaterial({ uniforms: { uColor: { value: new Color(paleta.estrellas) }, uPx: { value: this.renderer.getPixelRatio() } },
      vertexShader: VERTICE_ESTRELLAS, fragmentShader: FRAGMENTO_ESTRELLAS, transparent: true, depthWrite: false });   // depthTest activo: el planeta las tapa; no escriben profundidad
    const estrellas = new Points(geomEstrellas, this.matEstrellas);
    estrellas.renderOrder = -10; estrellas.frustumCulled = false;
    this.escena.add(estrellas);

    const geomOnda = new CircleGeometry(1, 48);
    this.inicioOnda = new InstancedBufferAttribute(new Float32Array(MAX_ONDAS).fill(INICIO_INACTIVO), 1);
    geomOnda.setAttribute('aInicio', this.inicioOnda);
    this.matOnda = new ShaderMaterial({ uniforms: { uColor: { value: new Color(paleta.halo) }, uAhora: { value: 0 } }, vertexShader: VERTICE_ONDA, fragmentShader: FRAGMENTO_ONDA, transparent: true, depthWrite: false });
    this.ondas = new InstancedMesh(geomOnda, this.matOnda, MAX_ONDAS);
    this.ondas.frustumCulled = false; this.ondas.renderOrder = 6; this.ondas.visible = false;   // detrás de los marcadores (10) y delante del halo de selección (5)
    this.escena.add(this.ondas);
    this.propios.push(geomEstrellas, this.matEstrellas, geomOnda, this.matOnda);
  }

  /**
   * Datos de datos/paises.geojson: (1) fronteras 3D como UN LineSegments (nítidas al acercar) y (2) la textura del planeta, dibujada en 2D UNA sola vez.
   * Se pueden fijar una vez; si se repite, se sustituyen las anteriores (con su dispose).
   */
  fijarFronteras(geojson: unknown, paleta: PaletaGlobo): void {
    if (this.destruida) return;
    if (this.fronteras) { this.escena.remove(this.fronteras); this.fronteras.geometry.dispose(); (this.fronteras.material as LineBasicMaterial).dispose(); }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(segmentosFronteras(geojson, RADIO_ESFERA * 1.0008), 3));
    this.fronteras = new LineSegments(g, new LineBasicMaterial({ color: new Color(paleta.fronteras), transparent: true, opacity: 0.85 }));
    this.fronteras.renderOrder = 1;
    this.escena.add(this.fronteras);
    this.fijarTextura(geojson, paleta);
    this.pedirFotograma();
  }

  /** Textura del planeta: lienzo 2D 4096×2048 (2048×1024 en móvil o si la GPU admite menos), mipmaps, anisotropía moderada y espacio de color sRGB. */
  private fijarTextura(geojson: unknown, paleta: PaletaGlobo): void {
    this.opciones.alFase?.('textura');                // fase real: se dibuja la textura (el componente ya la habrá anunciado al empezar a pedir los datos; repetirla no hace nada)
    const { ancho, alto } = tamanoTextura(this.renderer.capabilities.maxTextureSize, window.matchMedia('(max-width: 700px), (pointer: coarse)').matches);
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho; lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D no disponible');
    dibujarTierra(ctx, geojson, ancho, alto, { oceano: paleta.esfera, continente: paleta.continente, reticula: paleta.reticula, costas: paleta.fronteras });
    const textura = new CanvasTexture(lienzo);       // generateMipmaps y minFilter con mipmaps por defecto
    textura.colorSpace = SRGBColorSpace;             // se dibujó en sRGB: la GPU la decodifica a lineal al muestrear
    textura.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.texturaTierra?.dispose();
    this.texturaTierra = textura;
    this.matPlaneta.uniforms['uMapa'].value = textura;
    this.matPlaneta.uniforms['uTieneMapa'].value = 1;
  }

  private crearMalla(capacidad: number): void {
    if (this.malla) { this.escena.remove(this.malla); this.malla.dispose(); }
    this.geomMarcas?.dispose();
    // Geometría PROPIA de los marcadores (copia del disco compartido): lleva el atributo por instancia `aRango`, del tamaño de la capacidad. El halo de selección sigue usando geomPunto.
    const geom = this.geomMarcas = this.geomPunto.clone();
    this.rangoInst = new Uint8Array(capacidad);
    this.atributoRango = new InstancedBufferAttribute(new Float32Array(capacidad), 1);
    geom.setAttribute('aRango', this.atributoRango);
    const malla = new InstancedMesh(geom, this.matPunto, capacidad);
    malla.setColorAt(0, new Color(0xffffff)); // crea instanceColor ya: el shader se compila una vez con USE_INSTANCING_COLOR
    malla.count = 0;
    malla.frustumCulled = false; // la esfera envolvente de las instancias no se recalcula al cambiar los datos
    malla.renderOrder = 10;      // los marcadores se dibujan los últimos (encima del planeta, las fronteras y el halo de selección)
    this.malla = malla; this.capacidad = capacidad;
    this.escena.add(malla);
  }

  /**
   * Sustituye los eventos. Se ordenan por capas (grandes primero, pequeños encima: ordenarPorCapas, O(n log n) solo aquí). Si caben, se REUTILIZAN los buffers (solo se
   * reescriben y se marcan needsUpdate); si no, se recrea el InstancedMesh con un 25 % de margen. El material, la cámara, los controles y la rotación NO se tocan:
   * un refresco de datos no cambia la orientación ni el estado de giro.
   */
  fijarEventos(puntos: PuntosGlobo): void {
    if (this.destruida) return;
    const orden = ordenarPorCapas(puntos);
    this.indice = orden;
    if (orden.n > this.capacidad) this.crearMalla(Math.max(1024, Math.ceil(orden.n * 1.25)));
    const malla = this.malla!;
    const r0 = RADIO_ESFERA + ELEVACION_PUNTO; // un poco por encima de la superficie
    for (let i = 0; i < orden.n; i++) {
      const o = i * 3;
      this.v.set(orden.normales[o], orden.normales[o + 1], orden.normales[o + 2]);
      this.q.setFromUnitVectors(Z, this.v);          // el disco (en el plano XY) queda tangente a la esfera, mirando hacia fuera
      this.v.multiplyScalar(r0);
      const r = orden.radios[i];
      this.e.set(r, r, 1);
      this.m.compose(this.v, this.q, this.e);
      malla.setMatrixAt(i, this.m);
      malla.setColorAt(i, this.color(orden.colores[i]));
    }
    malla.count = orden.n;
    malla.instanceMatrix.needsUpdate = true;
    if (malla.instanceColor) malla.instanceColor.needsUpdate = true;
    this.cargarRangos(orden);                    // rango de profundidad por instancia (leyenda): una pasada O(n) por cambio de datos
    this.nPulso = contarPulsantes(orden.magnitudes, orden.n, UMBRAL_MAG_PULSO); // una vez por cambio de datos; el shader solo compara el índice de instancia con este número
    this.matPunto.uniforms['uNPulso'].value = this.nPulso;
    this.fijarSeleccion(this.idSeleccion, false); // un refresco de datos no debe mover la cámara
    this.lanzarOndasNuevas(orden);               // anillos solo para ids recién llegados (ondas.ts); el primer lote y los cambios de conjunto solo fijan la base
    this.pedirFotograma();
  }

  /** Copia el rango de cada instancia (deducido de su color de profundidad) al atributo `aRango`. Solo al cambiar los datos; el uniform uMascara decide qué se atenúa. */
  private cargarRangos(orden: PuntosGlobo): void {
    codificarRangos(orden.colores, orden.n, this.rangoInst);
    const a = this.atributoRango!;
    for (let i = 0; i < orden.n; i++) a.setX(i, this.rangoInst[i]);
    a.needsUpdate = true;
  }

  /**
   * Leyenda interactiva: `indice` (0–3) = rango resaltado; null = todos. Solo actualiza un uniform y el subconjunto seleccionable (clic y etiqueta ignoran los atenuados, salvo el
   * evento seleccionado) y pide UN fotograma; no toca cámara, selección ni rotación. Se puede llamar antes de que lleguen los datos.
   */
  fijarRangoLeyenda(indice: number | null): void {
    if (this.destruida) return;
    this.rangoActivo = indice;
    this.matPunto.uniforms['uMascara'].value = mascaraDeRango(indice);
    this.reconstruirPick();
    this.ocultarTooltip();                       // el evento que había bajo el cursor pudo quedar atenuado
    this.pedirFotograma();
  }

  /** Puntos que se pueden seleccionar con el puntero: todos sin filtro; con filtro, los del rango activo más el seleccionado (que se dibuja a opacidad plena). O(n) solo al cambiar filtro, datos o selección. */
  private reconstruirPick(): void {
    this.indicePick = this.indice === null || this.rangoActivo === null ? null : filtrarPuntos(this.indice, this.rangoInst, mascaraDeRango(this.rangoActivo), this.iSel);
  }

  // ---------- anillos de eventos nuevos (ondas.ts) -------------------------------------------------------------------------------------------------
  /** El modo (En vivo ↔ REPRODUCCIÓN), la ejecución o los filtros cambiaron: el siguiente lote no vacío solo fija la base de ids (sin anillos). Lo llama el componente. */
  reiniciarBaseOndas(): void { if (!this.destruida) this.seguimiento.reiniciarBase(); }

  /** Color de los anillos: cian de acento en vivo, violeta (--replay) en REPRODUCCIÓN, para no confundirlos con la selección ni con actividad actual. */
  fijarReplay(replay: boolean): void {
    if (this.destruida) return;
    (this.matOnda.uniforms['uColor'].value as Color).set(replay ? this.opciones.paleta.replay : this.opciones.paleta.halo);
  }

  /**
   * Decide con ondas.ts qué eventos de esta lectura son «recién incorporados» y lanza un anillo por cada uno en las ranuras LIBRES del pool (máx. MAX_ONDAS a la vez, por magnitud
   * descendente; el resto se descarta sin cola). La base de ids se actualiza SIEMPRE (incluso con la vista oculta o con movimiento reducido), pero esos dos casos no dibujan anillos:
   * al volver a mostrar el globo no aparecen anillos «atrasados». Solo escribe el pool (8 matrices y 8 inicios) y pide UN fotograma; el fotograma mantiene el bucle mientras vivan.
   */
  private lanzarOndasNuevas(orden: PuntosGlobo): void {
    const nuevos = this.seguimiento.procesar(orden.ids, orden.magnitudes, orden.n);
    if (nuevos.length === 0 || this.enPausa || (this.mqMovimiento?.matches ?? false)) return;
    const ahora = performance.now();
    const libres = ranurasLibres(this.finRanuras, ahora, nuevos.length);
    if (libres.length === 0) return;
    const r0 = RADIO_ESFERA + ELEVACION_PUNTO + 0.001;     // justo por encima de la capa de marcadores
    for (let k = 0; k < libres.length; k++) {
      const i = nuevos[k]; const s = libres[k]; const o = i * 3;
      this.v.set(orden.normales[o], orden.normales[o + 1], orden.normales[o + 2]);
      this.q.setFromUnitVectors(Z, this.v);
      this.v.multiplyScalar(r0);
      const r = radioMaxOnda(orden.radios[i]);
      this.e.set(r, r, 1);
      this.m.compose(this.v, this.q, this.e);
      this.ondas.setMatrixAt(s, this.m);
      this.inicioOnda.setX(s, (ahora - this.epoca) / 1000);
      this.finRanuras[s] = ahora + DURACION_ONDA_MS;
    }
    this.ondas.instanceMatrix.needsUpdate = true; this.inicioOnda.needsUpdate = true;
    this.finOndas = ahora + DURACION_ONDA_MS;
    this.ondas.visible = true;
    this.pedirFotograma();
  }

  // ---------- día/noche (sol.ts) -------------------------------------------------------------------------------------------------------------------
  /** Recalcula el Sol con el reloj UTC REAL (Date.now(), también en REPRODUCCIÓN). Solo si se movió más de 0,05° actualiza el uniform y pide UN fotograma (con la rotación pausada no hay render continuo). */
  private actualizarSol(): void {
    const nuevo = vectorSolar(posicionSolar(Date.now()));
    if (cambioAngularGrados(this.vectorSol, nuevo) <= UMBRAL_CAMBIO_SOLAR_GRADOS) return;
    this.vectorSol = nuevo;
    (this.matPlaneta.uniforms['uSol'].value as Vector3).set(nuevo[0], nuevo[1], nuevo[2]);
    this.pedirFotograma();
  }

  /** UN único temporizador encadenado (cada 60 s) que despierta la comprobación del Sol; no hay temporizador con la vista oculta, la pestaña oculta o fuera de pantalla. */
  private programarSol(): void {
    if (this.idTemporizadorSol !== 0) { clearTimeout(this.idTemporizadorSol); this.idTemporizadorSol = 0; }
    if (this.enPausa) return;
    this.idTemporizadorSol = window.setTimeout(() => { this.idTemporizadorSol = 0; this.actualizarSol(); this.programarSol(); }, INTERVALO_SOL_MS);
  }

  private color(hex: string): Color {
    let c = this.colores.get(hex);
    if (!c) { c = new Color(hex); this.colores.set(hex, c); } // solo hay 4 colores de profundidad
    return c;
  }

  /**
   * Resalta el evento seleccionado: marcador algo mayor con borde cian (uniforme uSel = índice de instancia) y halo translúcido por detrás. Si el evento está en la cara
   * oculta (p. ej. elegido desde la tabla), la cámara gira por el camino más corto. Con `centrar` (cambio real de selección) la cámara hace una transición suave que centra el
   * evento y lo acerca (encuadrarSeleccion); al cerrar la selección por cualquier camino que no haya iniciado ya la recuperación (p. ej. deseleccionar desde la tabla) se llama a
   * recuperarVista(), la misma que usan «Restablecer», «Cerrar» y el clic en vacío. Seleccionar el mismo evento no repite la transición, y un refresco de datos (centrar = false) no
   * mueve la cámara. Con un evento seleccionado la rotación automática no gira.
   */
  fijarSeleccion(id: string | null, centrar = true): void {
    if (this.destruida) return;
    this.idSeleccion = id;
    const i = id === null || this.indice === null ? -1 : this.indice.ids.indexOf(id); // índice en el orden de las instancias (O(n), solo al seleccionar)
    this.matPunto.uniforms['uSel'].value = i;
    this.iSel = i; this.reconstruirPick();       // con un rango de leyenda activo, el seleccionado sigue siendo seleccionable aunque sea de otro rango
    this.rotacion.fijarSeleccion(i >= 0, performance.now());
    if (i < 0 || this.indice === null) {
      this.haloSel.visible = false;
      if (this.idCentrado !== null) this.recuperarVista();   // se cerró (o desapareció) la selección y nadie había recuperado ya la vista (recuperarVista pone idCentrado a null: no se repite)
      this.pedirFotograma();
      return;
    }
    const o = i * 3; const n = this.indice.normales;
    this.v.set(n[o], n[o + 1], n[o + 2]);
    this.q.setFromUnitVectors(Z, this.v);
    this.haloSel.quaternion.copy(this.q);
    this.haloSel.position.copy(this.v).multiplyScalar(RADIO_ESFERA + ELEVACION_PUNTO);
    const s = Math.max(this.indice.radios[i] * 2.4, 0.04);
    this.haloSel.scale.set(s, s, 1);
    this.haloSel.visible = true;
    if (centrar && id !== this.idCentrado) { this.idCentrado = id; this.encuadrarSeleccion(n[o], n[o + 1], n[o + 2]); }
    this.pedirFotograma();
  }

  // ---------- cámara -------------------------------------------------------------------------------------------------------------------------------
  private colocarCamara(lat: number, lon: number, distancia: number): void {
    const [x, y, z] = latLonAXyz(lat, lon, distancia);
    this.camara.position.set(x, y, z);
    this.camara.lookAt(0, 0, 0);
  }

  /** Pose esférica actual de la cámara (θ azimut, φ ángulo polar, distancia). */
  private poseActual(): PoseCamara {
    this.esf.setFromVector3(this.camara.position);
    return { theta: this.esf.theta, phi: this.esf.phi, distancia: this.esf.radius };
  }

  private aplicarPose(p: PoseCamara): void {
    this.esf.set(p.distancia, p.phi, p.theta);
    this.camara.position.setFromSpherical(this.esf);
    this.camara.lookAt(0, 0, 0);
  }

  /**
   * Lleva la cámara a `hasta`. Con movimiento reducido, o con la vista oculta (no hay nadie mirando), el cambio es DIRECTO (sin animación); si no, arranca la transición única
   * (la nueva sustituye a cualquier otra desde la pose actual: sin saltos). La rotación automática ya está bloqueada por la selección o por la interacción que la provocó.
   */
  private iniciarTransicion(hasta: PoseCamara, tipo: 'seleccion' | 'recuperar' | 'region'): void {
    const desde = this.poseActual();
    this.cancelarTransicion();
    if (esTransicionNula(desde, hasta)) return;
    this.ocultarTooltip();
    if (this.mqMovimiento?.matches || this.enPausa) { this.aplicarPose(hasta); this.controles.update(); this.pedirFotograma(); return; }
    this.tipoTransicion = tipo;
    this.transicion.iniciar(desde, hasta);
    this.pedirFotograma();
  }

  /** Cualquier interacción manual (puntero, rueda con Ctrl, botones, teclado, otra transición) la cancela: la cámara se queda donde esté, sin saltos ni reinicios. */
  private cancelarTransicion(): void {
    this.transicion.cancelar();
    this.tipoTransicion = null;
  }

  /** ¿Hay una transición de selección en curso? Entonces la distancia actual es intermedia y NO cuenta como zoom manual. */
  private get transicionDeSeleccion(): boolean { return this.transicion.activa && this.tipoTransicion === 'seleccion'; }

  /** Fin de la transición en curso (lo llama el fotograma): si era una recuperación de la vista, se cierra con terminarRecuperacion. Una transición cancelada NUNCA llega aquí. */
  private alTerminarTransicion(): void {
    const tipo = this.tipoTransicion;
    this.tipoTransicion = null;
    if (tipo === 'recuperar') this.terminarRecuperacion();
  }

  /** Centra el evento (normal unitaria) por el camino más corto y acerca la cámara (×0,8, sin alejar; no se acumula en «siguiente/anterior»). */
  private encuadrarSeleccion(nx: number, ny: number, nz: number): void {
    const actual = this.poseActual();
    const plan = planificarZoomSeleccion(this.zoomSel, actual.distancia, this.transicionDeSeleccion, DISTANCIA_MIN, DISTANCIA_MAX);
    this.zoomSel = plan.estado;
    this.iniciarTransicion(poseDeNormal(nx, ny, nz, plan.destino, actual.theta), 'seleccion');
  }

  /**
   * ÚNICA recuperación de la vista: la usan «Restablecer» (y la tecla Inicio), «Cerrar» (botón de la ficha), el clic en una zona vacía y el cierre de la selección por otros caminos
   * (fijarSeleccion(null)). Con o sin selección, desde cualquier zoom y región. Reglas (camara.ts · planificarRecuperacion):
   *  · zoom suave a la distancia PREDETERMINADA (DISTANCIA_INICIAL), no al zoom previo; se conserva la región mirada (azimut y polar) y solo se acota un polar casi cenital;
   *  · `up` = (0,1,0) y lookAt (roll cero por construcción): el eje vertical queda vertical en pantalla.
   * No compite con OrbitControls: (1) cancela cualquier transición anterior y arranca desde la pose ACTUAL (iniciarTransicion), (2) drena la inercia pendiente (drenarInercia) para que
   * controles.update() no sume movimiento residual a la pose de la transición, y (3) la rotación no gira mientras dura (el fotograma excluye la rotación si hay transición). Cualquier
   * interacción manual la cancela como a las demás transiciones. Al COMPLETARSE (terminarRecuperacion) la rotación se reanuda ya, con su rampa, salvo pausa manual o movimiento reducido.
   * Anti-bucle: pone idCentrado a null y cierra la sesión de zoom ANTES de nada; el fijarSeleccion(null) que llegue después (efecto del componente) no repetirá la recuperación.
   */
  recuperarVista(): void {
    if (this.destruida) return;
    this.idCentrado = null; this.zoomSel = ZOOM_SIN_SESION;
    this.rotacion.interactuar(performance.now());   // se detiene ya; si la recuperación se cancela, rige el retardo normal de 3 s
    this.drenarInercia();
    this.camara.up.set(...UP_VERTICAL);             // normaliza `up` a (0,1,0) (camara.ts; es el valor por defecto que OrbitControls y lookAt asumen); el roll queda en cero porque la orientación sale de lookAt
    const plan = planificarRecuperacion(this.poseActual(), DISTANCIA_INICIAL);
    this.iniciarTransicion(plan.destino, 'recuperar');
    if (!this.transicion.activa) this.terminarRecuperacion();   // movimiento reducido, vista oculta o ya en la pose: no hay animación que esperar
  }

  /** Cierre de la recuperación (animada o directa): la rotación automática se reanuda ya (rotacion.reanudarYa respeta pausa manual y movimiento reducido). */
  private terminarRecuperacion(): void {
    this.rotacion.reanudarYa();
    this.pedirFotograma();
  }

  /**
   * Anula la inercia (damping) y el zoom pendientes de OrbitControls SIN reset global (no toca target, estado guardado ni límites): con enableDamping apagado, update() consume y pone
   * a cero el delta esférico y la escala acumulados; después se restaura la posición exacta y el valor de enableDamping, así que no hay salto visible (todo ocurre dentro del mismo turno,
   * antes de dibujar). Así la pose que aplica la transición no recibe movimiento residual encima.
   */
  private drenarInercia(): void {
    const damping = this.controles.enableDamping;
    this.posicionGuardada.copy(this.camara.position);
    this.controles.enableDamping = false;
    this.controles.update();
    this.controles.enableDamping = damping;
    this.camara.position.copy(this.posicionGuardada);
    this.camara.lookAt(0, 0, 0);
  }

  /** Atajo geográfico «Ir a región»: misma transición suave y camino más corto. Cuenta como interacción manual (cancela la anterior y retrasa la rotación). No toca filtros, datos ni selección. */
  irARegion(id: string): void {
    if (this.destruida) return;
    const r = regionPorId(id);
    if (r === null) return;
    this.rotacion.interactuar(performance.now());
    this.iniciarTransicion(poseDeLatLon(r.lat, r.lon, r.distancia), 'region');
  }

  /** +1 acerca, −1 aleja. Sin animación (válido también con movimiento reducido). Cuenta como interacción: la rotación se detiene. «Restablecer» ya no pasa por aquí: usa recuperarVista(). */
  zoom(sentido: 1 | -1): void {
    if (this.destruida) return;
    this.rotacion.interactuar(performance.now());
    this.cancelarTransicion(); this.hastaZoomMs = performance.now() + ZOOM_EN_CURSO_MS; this.ocultarTooltip();
    this.camara.position.setLength(distanciaTrasZoom(this.camara.position.length(), sentido));
    this.controles.update();
    this.pedirFotograma();
  }

  /** Giro por teclado. dx = −1 (flecha izquierda), +1 (derecha); dy = −1 (arriba), +1 (abajo). El paso es menor cuanto más cerca está la cámara. */
  girar(dx: -1 | 0 | 1, dy: -1 | 0 | 1): void {
    if (this.destruida) return;
    this.rotacion.interactuar(performance.now());
    this.cancelarTransicion(); this.ocultarTooltip();
    const paso = Math.max(0.05, Math.min(0.25, (this.camara.position.length() - 1) * 0.12));
    this.esf.setFromVector3(this.camara.position);
    this.esf.theta -= dx * paso;                                       // flecha izquierda: el contenido se desplaza hacia la izquierda (la cámara va hacia el este)
    this.esf.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.esf.phi - dy * paso));
    this.camara.position.setFromSpherical(this.esf);
    this.camara.lookAt(0, 0, 0);
    this.controles.update();
    this.pedirFotograma();
  }

  /** Rotación automática: gira el AZIMUT de la cámara alrededor del eje Y (visualmente idéntico a girar el globo). theta decrece ⇒ la cámara va hacia el oeste ⇒ la superficie se mueve hacia el este. */
  private aplicarGiro(radianes: number): void {
    this.esf.setFromVector3(this.camara.position);
    this.esf.theta -= radianes;
    this.camara.position.setFromSpherical(this.esf);
    this.camara.lookAt(0, 0, 0);
  }

  /** Botón «Pausar / Reanudar rotación». Devuelve si queda activa. La pausa manual se respeta: no se reanuda sola. */
  alternarRotacion(): boolean {
    if (this.destruida) return false;
    const activa = this.rotacion.alternar();
    this.pedirFotograma();
    return activa;
  }

  rotacionActiva(): boolean { return this.rotacion.estaActiva; }

  /** El panel de detalle apareció o desapareció (o cambió el ancho de la ventana): recalcula el desplazamiento del centro. No redimensiona el canvas. */
  actualizarReserva(): void { if (!this.destruida && this.ancho > 0) this.aplicarReserva(false); }

  /**
   * Calcula el desplazamiento que pide el panel. Al ABRIR (o crecer) se aplica al instante: el globo debe apartarse ya del panel. Al CERRAR (el desplazamiento baja) se anima en el mismo
   * bucle de fotogramas, con la duración y el easing de la transición de cámara, para que la recuperación de la vista y el retorno del centro no produzcan un salto visual; con movimiento
   * reducido, la vista oculta o un redimensionado (forzar) es directo. El offset solo mueve el encuadre: no inclina la cámara.
   */
  private aplicarReserva(forzar: boolean): void {
    const px = desplazamientoCentroPx(this.ancho, this.alto, this.opciones.reservaDerecha());
    if (!forzar && px === this.metaDesplazamiento) return;
    this.metaDesplazamiento = px;
    if (!forzar && px < this.desplazamiento && !(this.mqMovimiento?.matches ?? false) && !this.enPausa) {
      this.animDesplazamiento = { desde: this.desplazamiento, hasta: px, t0: null };
      this.pedirFotograma();
      return;
    }
    this.animDesplazamiento = null;
    this.fijarDesplazamiento(px);
  }

  private fijarDesplazamiento(px: number): void {
    this.desplazamiento = px;
    if (px > 0) this.camara.setViewOffset(this.ancho, this.alto, px, 0, this.ancho, this.alto); // el contenido se desplaza px hacia la izquierda
    else this.camara.clearViewOffset();
    this.pedirFotograma();
  }

  /** Un fotograma de la animación del desplazamiento (solo al cerrar el panel). Mientras no termine pide el siguiente fotograma; al terminar deja exactamente la meta. */
  private avanzarDesplazamiento(t: number): void {
    const a = this.animDesplazamiento;
    if (a === null) return;
    if (a.t0 === null) a.t0 = t;                                   // el primer fotograma no se mueve: sin salto al arrancar
    const p = Math.min(1, Math.max(0, (t - a.t0) / DURACION_TRANSICION_MS));
    this.fijarDesplazamiento(p >= 1 ? a.hasta : a.desde + (a.hasta - a.desde) * suavizar(p));
    if (p >= 1) this.animDesplazamiento = null;
  }

  private readonly alCambiarCamara = (): void => {
    // velocidad de giro proporcional a la distancia a la superficie: cerca, un arrastre de 1 px mueve menos
    this.controles.rotateSpeed = Math.max(0.15, Math.min(1, (this.camara.position.length() - 1) * 0.35));
    if (!this.enFotograma) this.pedirFotograma(); // dentro del fotograma ya se va a dibujar; fuera, hay que pedirlo
  };

  private readonly aplicarMovimiento = (): void => {
    this.controles.enableDamping = !(this.mqMovimiento?.matches ?? false); // movimiento reducido: sin inercia
    if (this.mqMovimiento?.matches) { this.rotacion.fijarMovimientoReducido(true); this.opciones.alCambiarRotacion(false); } // ... y sin rotación automática ni pulsación
    this.pedirFotograma(); // un cambio de preferencia en caliente se refleja ya (apaga la pulsación y, si no hay nada más, el bucle se para)
  };

  // ---------- render bajo demanda ------------------------------------------------------------------------------------------------------------------
  private get enPausa(): boolean { return this.destruida || this.pausadoPorVista || this.fueraDePantalla || this.pestanaOculta || this.contextoPerdido; }

  /** Pide un fotograma que SÍ debe dibujarse (cambió algo visible). */
  private pedirFotograma(): void {
    this.sucio = true;
    this.encolar();
  }

  /** Único punto que llama a requestAnimationFrame: con guarda (id único), nunca hay dos bucles. */
  private encolar(): void {
    if (this.enPausa || this.rafId !== 0) return;
    this.rafId = requestAnimationFrame(this.fotograma);
  }

  private readonly fotograma = (t: number): void => {
    this.rafId = 0;
    if (this.enPausa) return;
    // Sin cambios pendientes solo se anima la rotación (≈ 30 fps) o la pulsación (≈ 25 fps): no hace falta dibujar a 60 fps.
    if (!this.sucio && t - this.tRender < (this.rotacion.girando ? INTERVALO_ROTACION_MS : INTERVALO_PULSO_MS)) { this.encolar(); return; }
    this.sucio = false;
    // Prioridad dentro del MISMO fotograma: la transición de cámara manda; mientras dura NO se gira solo (nunca se mezclan dos movimientos sobre el mismo azimut).
    const paso = this.transicion.avanzar(t);   // pose según el tiempo real (dt con tope); null si no hay transición
    let giro = 0;
    // CAMBIO (ajuste 3/4): al terminar, alTerminarTransicion() cierra la recuperación de la vista (reanuda la rotación ya); antes solo ponía tipoTransicion = null
    if (paso !== null) { this.aplicarPose(paso.pose); if (paso.fin) this.alTerminarTransicion(); }
    else { giro = this.rotacion.avanzar(t); if (giro > 0) this.aplicarGiro(giro); } // radianes según el tiempo real transcurrido (con tope), no por fotograma
    this.avanzarDesplazamiento(t);                                                   // retorno suave del centro al cerrar el panel lateral (no hace nada si no hay animación)
    const pulsa = this.pulsoActivo;
    this.matPunto.uniforms['uFase'].value = faseGlobal(t); // un único uniform de tiempo para TODOS los marcadores
    this.matPunto.uniforms['uAmp'].value = pulsa ? 1 : 0;
    const ondas = t < this.finOndas;                                                  // ¿hay algún anillo de evento nuevo vivo? (sin bucles: un único instante de fin)
    this.ondas.visible = ondas;                                                       // sin anillos vivos no se dibuja ni la draw call
    this.matOnda.uniforms['uAhora'].value = (t - this.epoca) / 1000;                  // un único uniform de tiempo para todos los anillos
    if (giro > 0 && this.hayHover && esperaTooltipMs(performance.now(), this.ultimoCalculoTooltip) === 0) this.calcularTooltip(); // el globo se mueve bajo un cursor quieto: se revalida la etiqueta (throttled)
    this.enFotograma = true;
    const movimiento = this.controles.update(); // con giro automático devuelve true porque la cámara se movió, no por inercia
    this.enFotograma = false;
    const t0 = performance.now();
    this.renderer.render(this.escena, this.camara);
    const nuevoPixelRatio = this.calidad.registrar(performance.now() - t0, t);   // coste de CPU del render (calidad.ts); con el bucle parado no hay muestras
    if (nuevoPixelRatio !== null) this.cambiarPixelRatio(nuevoPixelRatio);
    this.tRender = t;
    if (ondas) this.sucio = true;                                         // anillos vivos: fotogramas completos (≈ 2 s) para que la expansión sea fluida
    if (this.transicion.activa) { this.sucio = true; this.encolar(); }       // transición en curso: un fotograma completo tras otro hasta que termine
    else if (movimiento && giro === 0 && paso === null) { this.sucio = true; this.encolar(); } // inercia del arrastre: seguir a fotograma completo
    else if (this.rotacion.girando) this.encolar();                     // rotación en curso (o en rampa)
    else if (pulsa || ondas) this.encolar();                             // pulsación ambiental (tasa baja) o anillos vivos: solo mientras existan, sin movimiento reducido y vista activa
    else this.programarReanudacion();                                    // nada que mover: el bucle se PARA (cero trabajo)
  };

  /**
   * Cambia la resolución del canvas (calidad.ts). `setPixelRatio` redimensiona el búfer de dibujo con el tamaño ya fijado (sin recrear escena, cámara, controles ni selección;
   * el tamaño visible lo sigue fijando el CSS). Como el búfer se vacía al cambiar de tamaño, se vuelve a dibujar en el acto (mismo turno, antes de componer): sin parpadeo.
   */
  private cambiarPixelRatio(pr: number): void {
    this.renderer.setPixelRatio(pr);
    this.matEstrellas.uniforms['uPx'].value = pr;      // el tamaño visual de las estrellas no depende de la calidad
    this.renderer.render(this.escena, this.camara);
  }

  /** ¿Hay que mantener el bucle solo por la pulsación? (pulso.ts: hay pulsantes, sin movimiento reducido, vista activa y, si así se configura, rotación no pausada). */
  private get pulsoActivo(): boolean {
    return hayPulso({ movimientoReducido: this.mqMovimiento?.matches ?? false, nPulsantes: this.nPulso, enPausa: this.enPausa, rotacionActiva: this.rotacion.estaActiva });
  }

  /** Si la rotación solo espera el retardo de inactividad, un único temporizador despierta el bucle; si está bloqueada (pausa, selección, 2D…) no hay nada que esperar. */
  private programarReanudacion(): void {
    if (this.idTemporizador !== 0) { clearTimeout(this.idTemporizador); this.idTemporizador = 0; }
    const espera = this.rotacion.esperaMs(performance.now());
    if (espera === null || this.enPausa) return;
    this.idTemporizador = window.setTimeout(() => { this.idTemporizador = 0; this.encolar(); }, espera + MARGEN_DESPERTAR_MS);
  }

  private actualizarPausa(): void {
    this.rotacion.fijarEntorno(!this.pausadoPorVista, !this.pestanaOculta, !this.fueraDePantalla);
    if (this.enPausa) {
      if (this.rafId !== 0) { cancelAnimationFrame(this.rafId); this.rafId = 0; }
      if (this.idTemporizador !== 0) { clearTimeout(this.idTemporizador); this.idTemporizador = 0; }
      if (this.idTemporizadorSol !== 0) { clearTimeout(this.idTemporizadorSol); this.idTemporizadorSol = 0; }
      this.calidad?.reiniciarMedicion();   // con el bucle parado no se mide: lo anterior no describe el ritmo al volver
      return;
    }
    this.actualizarSol();                  // al reanudar, el Sol se pone al día con el reloj real (puede haber pasado mucho tiempo)
    this.programarSol();
    this.ajustarTamano();
    this.pedirFotograma();
  }

  /** La vista 3D se oculta (o vuelve a mostrarse). Al ocultarla se cancela la transición de cámara (donde esté) y se oculta la etiqueta. */
  pausar(): void { this.cancelarTransicion(); this.ocultarTooltip(); this.pausadoPorVista = true; this.actualizarPausa(); }
  reanudar(): void { this.pausadoPorVista = false; this.actualizarPausa(); }

  private readonly alCambiarVisibilidad = (): void => { this.pestanaOculta = document.hidden; this.actualizarPausa(); };

  private readonly ajustarTamano = (): void => {
    if (this.destruida) return;
    const w = this.contenedor.clientWidth; const h = this.contenedor.clientHeight;
    if (w === 0 || h === 0 || (w === this.ancho && h === this.alto)) return;
    this.ancho = w; this.alto = h;
    this.renderer.setSize(w, h, false); // el tamaño visible lo fija el CSS
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
    this.aplicarReserva(true);          // el desplazamiento depende del tamaño: se recalcula aquí (y vuelve a pedir fotograma)
    this.pedirFotograma();
  };

  private readonly alPerderContexto = (ev: Event): void => { ev.preventDefault(); this.contextoPerdido = true; this.actualizarPausa(); this.opciones.alPerderContexto(); };
  private readonly alRestaurarContexto = (): void => { this.contextoPerdido = false; this.actualizarPausa(); this.opciones.alRestaurarContexto(); };

  // ---------- puntero: clic frente a arrastre -------------------------------------------------------------------------------------------------------
  private readonly alRueda = (ev: WheelEvent): void => {
    if (!(ev.ctrlKey || ev.metaKey)) ev.stopPropagation();
    else {
      this.rotacion.interactuar(performance.now()); // zoom con la rueda: interacción
      this.cancelarTransicion(); this.hastaZoomMs = performance.now() + ZOOM_EN_CURSO_MS; this.ocultarTooltip();
    }
  };

  private readonly alBajar = (ev: PointerEvent): void => {
    this.punteros.add(ev.pointerId);
    this.cancelarTransicion(); this.ocultarTooltip();    // tocar el globo cancela la transición en curso: la cámara se queda donde esté
    this.rotacion.fijarPuntero(true, performance.now()); // arrastre o pellizco: la rotación se detiene
    if (this.punteros.size > 1) { this.multitoque = true; this.abajo = null; return; } // pellizco: nunca es una selección
    this.multitoque = false;
    this.abajo = ev.button === 0 ? { x: ev.clientX, y: ev.clientY } : null;
  };

  private readonly alSubir = (ev: PointerEvent): void => {
    this.punteros.delete(ev.pointerId);
    const a = this.abajo;
    if (ev.type === 'pointerup' && a !== null && !this.multitoque && this.punteros.size === 0 && esClic(ev.clientX - a.x, ev.clientY - a.y)) this.seleccionarEn(ev.clientX, ev.clientY);
    if (this.punteros.size === 0) {
      this.abajo = null; this.multitoque = false;
      this.rotacion.fijarPuntero(false, performance.now()); // el retardo de reanudación cuenta desde que se suelta
      this.pedirFotograma();                                // al terminar el fotograma se programa el despertar
    }
  };

  /**
   * Clic (no arrastre: esClic con el umbral de 6 px; el pellizco y el botón secundario ni llegan aquí) sobre el lienzo.
   *  · Sobre un evento: lo selecciona.
   *  · CAMBIO (F7, ajuste 2): en vacío (buscarBajo = null: sin evento cerca, esfera sin evento o rayo que no corta la esfera) CON un terremoto seleccionado y dibujado, cierra la ficha igual
   *    que el botón «Cerrar» (recuperarVista + alDeseleccionar → `cerrar` → elegir(null, ...)). Antes, un clic en vacío no deseleccionaba nunca (como el mapa 2D); ese comportamiento
   *    solo cambia cuando hay selección: sin selección el clic en vacío sigue sin hacer nada.
   * El listener está en el CANVAS: los botones, el selector, la tarjeta, la ayuda y el panel de información son elementos HTML aparte (y la etiqueta y las pistas tienen
   * pointer-events: none), así que sus pulsaciones no llegan aquí.
   */
  private seleccionarEn(clientX: number, clientY: number): void {
    const sel = this.buscarBajo(clientX, clientY);
    if (sel !== null) { this.opciones.alSeleccionar(sel.id); return; }
    if (this.haloSel.visible) { this.recuperarVista(); this.opciones.alDeseleccionar(); }   // haloSel.visible = hay un terremoto seleccionado Y dibujado en el globo
  }

  /**
   * Rayo desde la cámara por el punto → seleccionarPorRayo (función pura): corte con la esfera, cara visible (sin eventos de la cara oculta), umbral según el zoom y evento más
   * cercano. Lo comparten el clic y la etiqueta: misma función y mismo umbral. Una lectura de layout (getBoundingClientRect) por llamada: el clic es puntual y la etiqueta
   * está limitada por throttle (≤ 1 cada INTERVALO_TOOLTIP_MS), nunca por fotograma.
   */
  private buscarBajo(clientX: number, clientY: number): Seleccion | null {
    const candidatos = this.indicePick ?? this.indice;   // con un rango de leyenda activo, solo los visibles (y el seleccionado): los atenuados no se eligen
    if (candidatos === null || candidatos.n === 0) return null;
    const r = this.canvas.getBoundingClientRect();
    this.rectLienzo = r;
    if (r.width === 0 || r.height === 0) return null;
    this.camara.updateMatrixWorld();
    this.rayo.setFromCamera(new Vector2(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1)), this.camara);
    const o = this.rayo.ray.origin; const d = this.rayo.ray.direction;
    return seleccionarPorRayo(candidatos, [o.x, o.y, o.z], [d.x, d.y, d.z], { alturaPx: r.height, fovGrados: this.camara.fov });
  }

  // ---------- etiqueta flotante (hover con ratón) --------------------------------------------------------------------------------------------------
  // Un elemento HTML (hijo del contenedor) con pointer-events: none y aria-hidden: no captura eventos ni se anuncia (el equivalente accesible es la tarjeta de detalle, la tabla y
  // «Evento anterior/siguiente»). Sin render extra de la escena: solo textContent y transform. Throttle de entrada (leading + trailing con UN temporizador) y nada de trabajo
  // con el puntero fuera, pulsado, táctil, durante el zoom o una transición (tooltip.ts decide).
  private contextoTooltip(tipoPuntero: string): ContextoTooltip {
    return { tipoPuntero, hoverFino: this.hoverFino, punteroAbajo: this.punteros.size > 0, transicionActiva: this.transicion.activa, zoomEnCurso: performance.now() < this.hastaZoomMs, dentro: this.dentro, enPausa: this.enPausa };
  }

  private readonly alMoverPuntero = (ev: PointerEvent): void => {
    this.dentro = true;
    if (!tooltipPermitido(this.contextoTooltip(ev.pointerType))) { this.ocultarTooltip(); return; }
    this.ultimoPuntero = { x: ev.clientX, y: ev.clientY };
    const espera = esperaTooltipMs(performance.now(), this.ultimoCalculoTooltip, INTERVALO_TOOLTIP_MS);
    if (espera === 0) this.calcularTooltip();
    else if (this.idTemporizadorTooltip === 0) this.idTemporizadorTooltip = window.setTimeout(() => { this.idTemporizadorTooltip = 0; this.calcularTooltip(); }, espera); // cálculo final con el último punto
  };

  private readonly alSalirPuntero = (): void => { this.dentro = false; this.ocultarTooltip(); };

  private calcularTooltip(): void {
    this.ultimoCalculoTooltip = performance.now();
    const p = this.ultimoPuntero;
    if (p === null || !tooltipPermitido(this.contextoTooltip('mouse'))) { this.ocultarTooltip(); return; }
    const sel = this.buscarBajo(p.x, p.y);
    const texto = sel === null ? null : this.opciones.textoTooltip(sel.id);
    if (texto === null || this.rectLienzo === null) { this.ocultarTooltip(); return; }
    const t = this.tooltip;
    if (texto !== this.textoCursor) {                                   // solo al cambiar de evento: se reescribe el texto y se mide (una lectura de layout)
      t.textContent = texto; this.textoCursor = texto; t.hidden = false;
      const b = t.getBoundingClientRect(); this.tamTooltip = { w: b.width, h: b.height };
    } else if (t.hidden) t.hidden = false;
    const r = this.rectLienzo;
    const pos = posicionarTooltip(p.x - r.left, p.y - r.top, r.width, r.height, this.tamTooltip.w, this.tamTooltip.h);
    t.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
    if (!this.hayHover) { this.hayHover = true; this.canvas.style.cursor = 'pointer'; } // el cursor solo cambia al entrar o salir de un evento, no en cada movimiento
  }

  private ocultarTooltip(): void {
    if (this.idTemporizadorTooltip !== 0) { clearTimeout(this.idTemporizadorTooltip); this.idTemporizadorTooltip = 0; }
    if (this.tooltip && !this.tooltip.hidden) this.tooltip.hidden = true;
    if (this.hayHover) { this.hayHover = false; this.canvas.style.cursor = ''; }
  }

  // ---------- liberación ---------------------------------------------------------------------------------------------------------------------------
  destruir(): void {
    if (this.destruida) return;
    this.destruida = true;
    if (this.rafId !== 0) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    if (this.idTemporizador !== 0) clearTimeout(this.idTemporizador);
    this.idTemporizador = 0;
    if (this.idTemporizadorSol !== 0) clearTimeout(this.idTemporizadorSol);
    this.idTemporizadorSol = 0;                           // sin temporizador del Sol tras destruir
    this.cancelarTransicion(); this.ocultarTooltip();   // sin transición viva ni temporizador de etiqueta tras destruir
    this.observadorTamano?.disconnect(); this.observadorVisibilidad?.disconnect();
    this.mqMovimiento?.removeEventListener('change', this.aplicarMovimiento);
    document.removeEventListener('visibilitychange', this.alCambiarVisibilidad);
    this.contenedor.removeEventListener('wheel', this.alRueda, { capture: true });
    this.canvas.removeEventListener('pointerdown', this.alBajar);
    this.canvas.removeEventListener('pointerup', this.alSubir);
    this.canvas.removeEventListener('pointercancel', this.alSubir);
    this.canvas.removeEventListener('pointermove', this.alMoverPuntero);
    this.canvas.removeEventListener('pointerleave', this.alSalirPuntero);
    this.canvas.removeEventListener('webglcontextlost', this.alPerderContexto);
    this.canvas.removeEventListener('webglcontextrestored', this.alRestaurarContexto);
    this.controles.removeEventListener('change', this.alCambiarCamara);
    this.controles.dispose();
    if (this.malla) { this.escena.remove(this.malla); this.malla.dispose(); this.malla = null; }
    this.geomMarcas?.dispose(); this.geomMarcas = null; this.atributoRango = null;   // geometría propia de los marcadores (aRango)
    if (this.ondas) { this.escena.remove(this.ondas); this.ondas.dispose(); }         // pool de anillos (su geometría y su material están en `propios`)
    if (this.fronteras) { this.fronteras.geometry.dispose(); (this.fronteras.material as LineBasicMaterial).dispose(); this.fronteras = null; }
    this.texturaTierra?.dispose(); this.texturaTierra = null;
    for (const recurso of this.propios) recurso.dispose();
    this.propios.length = 0;
    this.renderer.dispose();
    this.renderer.forceContextLoss(); // libera el contexto WebGL ya: los navegadores limitan los contextos simultáneos
    this.indice = null; this.indicePick = null;
  }
}
