// Globo 3D (F7, 3.ª iteración): lógica PURA de la cámara. Sin three, sin DOM, sin imports en ejecución: recibe el tiempo (`ahora`, ms) y los límites de zoom como
// parámetros, así que se prueba con `node --test` (tests/globo.test.ts). escena.ts solo la consulta en cada fotograma y aplica la pose que devuelve.
//
// Convención (la misma que geometria.ts y la Spherical de three): la cámara está en  x = d·sin(φ)·sin(θ),  y = d·cos(φ),  z = d·sin(φ)·cos(θ)  y mira al origen.
// Comparando con latLonAXyz (x = cos(lat)·sin(lon), y = sin(lat), z = cos(lat)·cos(lon)):  θ = lon  y  φ = 90° − lat.  Por eso «centrar un evento» es colocar la
// cámara en la dirección de su normal, y la rotación automática (θ decrece) es el mismo eje que usa esta transición.
//
// Recuperación de la vista (Restablecer, Cerrar ficha, clic en vacío): UNA sola función, planificarRecuperacion (más abajo). Resumen: zoom a la distancia predeterminada; se conserva la región
// mirada (azimut y polar); el eje vertical queda vertical (up = (0,1,0), sin roll; aquí el roll no puede acumularse) y solo se corrige un polar casi cenital (fuera de 35°–145°).
const RAD = Math.PI / 180;
const DOS_PI = 2 * Math.PI;

/** Duración de la transición de cámara (ms). Dentro de 700–900 ms: se nota como movimiento suave sin hacer esperar. */
export const DURACION_TRANSICION_MS = 800;
/** Al seleccionar, la distancia de la cámara se multiplica por este factor (acerca un 20 %; NUNCA aleja). */
export const FACTOR_ACERCAR_SELECCION = 0.8;
/** Tope del intervalo entre dos fotogramas (ms) al avanzar la transición: tras una suspensión no da un salto, como en rotacion.ts. */
export const DT_MAX_TRANSICION_MS = 100;
/** Límites polares (rad): la cámara nunca se coloca exactamente sobre un polo (lookAt degenera); coinciden con el tope del giro por teclado. */
export const PHI_MIN = 0.05;
export const PHI_MAX = Math.PI - 0.05;
/** Tolerancia (unidades de distancia) para decidir si la persona ha cambiado el zoom durante una selección: los pasos de zoom manual son de un 20 %, muy por encima. */
export const TOLERANCIA_ZOOM = 0.01;

export interface PoseCamara { theta: number; phi: number; distancia: number }

// ---------- ángulos y easing -----------------------------------------------------------------------------------------------------------------------
/** Diferencia angular normalizada a (−π, π]: el camino MÁS CORTO. De 170° a −170° es +20°, no −340°; media vuelta exacta (π) se resuelve en +π. */
export function normalizarDiferenciaAngulo(d: number): number {
  if (!Number.isFinite(d)) return 0;
  let r = d % DOS_PI;                  // el resto conserva el signo del dividendo: queda en (−2π, 2π)
  if (r > Math.PI) r -= DOS_PI;
  else if (r <= -Math.PI) r += DOS_PI;
  return r === 0 ? 0 : r;              // evita −0
}

/** Easing ease-in-out cúbico: arranca y termina suave (velocidad 0 en los extremos). t se acota a [0, 1]; f(0) = 0, f(0,5) = 0,5, f(1) = 1. */
export function suavizar(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function acotarPhi(phi: number): number { return Math.min(PHI_MAX, Math.max(PHI_MIN, phi)); }

// ---------- encuadre de un punto de la esfera -------------------------------------------------------------------------------------------------------
/** Pose que deja en el centro de la vista el punto (lat, lon) en grados, a la `distancia` indicada. φ se acota para no llegar al polo. */
export function poseDeLatLon(lat: number, lon: number, distancia: number): PoseCamara {
  return { theta: lon * RAD, phi: acotarPhi(Math.PI / 2 - lat * RAD), distancia };
}

/**
 * Pose que centra el evento de normal unitaria (nx, ny, nz): θ = atan2(x, z) y φ = acos(y) (coherente con latLonAXyz). En un polo exacto el azimut no está definido:
 * se conserva `thetaActual` para no girar sin motivo. A menos de ≈ 2,9° de un polo el acotado de φ deja el evento algo descentrado (aceptable: no es un caso real de la red sísmica).
 */
export function poseDeNormal(nx: number, ny: number, nz: number, distancia: number, thetaActual = 0): PoseCamara {
  const theta = Math.hypot(nx, nz) < 1e-9 ? thetaActual : Math.atan2(nx, nz);
  return { theta, phi: acotarPhi(Math.acos(Math.min(1, Math.max(-1, ny)))), distancia };
}

/** ¿Origen y destino coinciden (dentro de la tolerancia)? Entonces no hay nada que animar y el bucle no se activa. */
export function esTransicionNula(a: PoseCamara, b: PoseCamara, tol = 1e-3): boolean {
  return Math.abs(normalizarDiferenciaAngulo(b.theta - a.theta)) < tol && Math.abs(b.phi - a.phi) < tol && Math.abs(b.distancia - a.distancia) < tol;
}

// ---------- transición -----------------------------------------------------------------------------------------------------------------------------
/**
 * Transición de cámara con easing y tiempo REAL (dt acumulado con tope, no «X por fotograma»). Estado mínimo y sin efectos: `avanzar` devuelve la pose de ese instante
 * y escena.ts la aplica. Al CANCELAR no devuelve nada más: la cámara se queda exactamente donde estaba (sin saltar al destino ni volver al origen).
 *  · θ: gira el camino más corto (diferencia normalizada). φ y distancia: interpolación lineal (φ nunca cruza un polo: va de un valor en [0, π] a otro en [0, π]).
 *  · El primer fotograma tiene dt = 0 y devuelve la pose de origen: arrancar no produce ningún salto.
 */
export class TransicionCamara {
  private desde: PoseCamara = { theta: 0, phi: Math.PI / 2, distancia: 1 };
  private dTheta = 0; private dPhi = 0; private dDist = 0;
  private duracion = 0; private transcurrido = 0; private ultimoMs: number | null = null;
  private enCurso = false;

  get activa(): boolean { return this.enCurso; }
  /** Fracción (0–1) del tiempo transcurrido (sin easing). */
  get progreso(): number { return this.duracion > 0 ? Math.min(1, this.transcurrido / this.duracion) : 1; }

  iniciar(desde: PoseCamara, hasta: PoseCamara, duracionMs: number = DURACION_TRANSICION_MS): void {
    this.desde = { ...desde };
    this.dTheta = normalizarDiferenciaAngulo(hasta.theta - desde.theta);
    this.dPhi = hasta.phi - desde.phi;
    this.dDist = hasta.distancia - desde.distancia;
    this.duracion = Math.max(0, duracionMs);
    this.transcurrido = 0; this.ultimoMs = null; this.enCurso = true;
  }

  /** Un fotograma: pose actual y si ha terminado (`fin`). null si no hay transición en curso. */
  avanzar(ahora: number): { pose: PoseCamara; fin: boolean } | null {
    if (!this.enCurso) return null;
    const dt = this.ultimoMs === null ? 0 : Math.min(Math.max(ahora - this.ultimoMs, 0), DT_MAX_TRANSICION_MS);
    this.ultimoMs = ahora;
    this.transcurrido += dt;
    const p = this.progreso; const e = suavizar(p);
    const fin = p >= 1;
    if (fin) this.enCurso = false;
    return { pose: { theta: this.desde.theta + this.dTheta * e, phi: this.desde.phi + this.dPhi * e, distancia: this.desde.distancia + this.dDist * e }, fin };
  }

  /** Detiene la transición donde esté (interacción manual, vista oculta, destrucción). No devuelve pose: quien llama no mueve la cámara. */
  cancelar(): void { this.enCurso = false; this.ultimoMs = null; }
}

// ---------- zoom al seleccionar -------------------------------------------------------------------------------------------------------------------
/** Distancia tras acercar un 20 % respecto a la actual, dentro de [mín, máx] y NUNCA mayor que la actual (si ya está más cerca, no se aleja). */
export function distanciaAcercada(actual: number, min: number, max: number): number {
  const d = Math.max(min, Math.min(max, actual * FACTOR_ACERCAR_SELECCION));
  return Math.min(d, actual);
}

/**
 * Memoria del zoom de una «sesión de selección» (desde que se selecciona un evento hasta que se cierra):
 *  · aplicado: distancia a la que dejó la cámara la selección (null = no hay sesión);
 *  · manual: la persona cambió el zoom durante la sesión (rueda, botones, pellizco…): ya no se toca.
 * CAMBIO (F7, ajuste 3/4): desaparece `previo` y con él la «restauración del zoom previo»: al cerrar, el zoom lo decide planificarRecuperacion (distancia predeterminada).
 */
export interface EstadoZoom { aplicado: number | null; manual: boolean }
export const ZOOM_SIN_SESION: EstadoZoom = { aplicado: null, manual: false };

/**
 * Zoom destino al seleccionar un evento. `propia` = hay una transición de selección en curso (la distancia actual es intermedia, no un cambio manual).
 *  · Primera selección de la sesión: acerca (×0,8, sin alejar).
 *  · Cambio de evento con la sesión abierta: mantiene el zoom aplicado (no se acerca más a cada «siguiente»), salvo que la persona lo haya cambiado: entonces se respeta el suyo.
 */
export function planificarZoomSeleccion(estado: EstadoZoom, actual: number, propia: boolean, min: number, max: number): { destino: number; estado: EstadoZoom } {
  if (estado.aplicado === null) {
    const destino = distanciaAcercada(actual, min, max);
    return { destino, estado: { aplicado: destino, manual: false } };
  }
  if (!estado.manual && (propia || Math.abs(actual - estado.aplicado) <= TOLERANCIA_ZOOM)) return { destino: estado.aplicado, estado };
  return { destino: actual, estado: { ...estado, manual: true } };
}

// ---------- recuperación de la vista (Restablecer, Cerrar ficha y clic en vacío comparten esto) ----------------------------------------------------------
/**
 * Una SOLA regla de recuperación de cámara. Qué significa «enderezar» en ESTA arquitectura:
 *  · La cámara es esférica (θ azimut, φ polar, distancia) y SIEMPRE mira al origen con `up` = (0,1,0): el eje terrestre (Y de la escena) se proyecta vertical en pantalla. OrbitControls
 *    conserva `up` y solo trabaja con azimut/polar (sin roll); aplicarPose usa lookAt con ese `up`; setViewOffset solo desplaza el encuadre (no inclina) y el planeta solo gira sobre Y
 *    (ROTACION_Y_TEXTURA, fija). Por tanto NO existe roll acumulable: lo que se percibe como «inclinado» es un polar alejado del ecuador (globo visto casi desde un polo).
 *  · Decisión: se CONSERVA la región mirada (azimut = longitud central, y polar = latitud central) y solo se corrige el polar si queda fuera de [PHI_ENDEREZADO_MIN, PHI_ENDEREZADO_MAX]
 *    (35°–145°, es decir, latitud central entre ≈ +55° y −55°): ahí se lleva al límite más cercano. NO se vuelve a la orientación inicial (Europa/África).
 *  · Por si algún día algo inclinara la cámara, el plan devuelve además `up` = (0,1,0) y roll = 0, y escena.ts los aplica (camera.up y lookAt, que fija el roll a cero por construcción).
 *  · Zoom: siempre a la distancia PREDETERMINADA (parámetro; escena.ts pasa DISTANCIA_INICIAL), venga de donde venga (alejado o ya cercano): NO es «el zoom anterior a la selección».
 * Es una función pura: el destino sale de la pose ACTUAL; el recorrido lo hace TransicionCamara (azimut por el camino más corto, polar lineal sin cruzar polos, sin saltos).
 */
export const PHI_ENDEREZADO_MIN = 35 * RAD;
export const PHI_ENDEREZADO_MAX = 145 * RAD;
export const UP_VERTICAL: readonly [number, number, number] = [0, 1, 0];

export interface PlanRecuperacion { destino: PoseCamara; up: readonly [number, number, number]; roll: 0 }

/** Polar acotado al rango «enderezado»; un valor no finito se lleva al ecuador (π/2). */
export function acotarPhiEnderezado(phi: number): number {
  if (!Number.isFinite(phi)) return Math.PI / 2;
  return Math.min(PHI_ENDEREZADO_MAX, Math.max(PHI_ENDEREZADO_MIN, phi));
}

export function planificarRecuperacion(actual: PoseCamara, distanciaPredeterminada: number): PlanRecuperacion {
  const theta = Number.isFinite(actual.theta) ? actual.theta : 0;   // se conserva tal cual (sin normalizar): la diferencia con el origen es exactamente 0
  return { destino: { theta, phi: acotarPhiEnderezado(actual.phi), distancia: distanciaPredeterminada }, up: UP_VERTICAL, roll: 0 };
}

// ---------- atajos geográficos ---------------------------------------------------------------------------------------------------------------------
export interface Region { id: string; nombre: string; lat: number; lon: number; distancia: number }

/**
 * Regiones del selector «Ir a región». Coordenadas y distancias APROXIMADAS, solo para VISUALIZAR (encuadre de la cámara): no son límites administrativos ni
 * geofiltros, no tocan los filtros ni los datos. Distancia = lejos para las zonas extensas (Pacífico) y más cerca para las compactas (Japón); todas dentro de
 * [DISTANCIA_MIN, DISTANCIA_MAX] de geometria.ts (lo comprueba tests/globo.test.ts: este módulo no importa nada).
 */
export const REGIONES: readonly Region[] = [
  { id: 'pacifico', nombre: 'Pacífico', lat: 5, lon: -170, distancia: 4.4 },
  { id: 'japon', nombre: 'Japón', lat: 36, lon: 138, distancia: 2.1 },
  { id: 'indonesia', nombre: 'Indonesia', lat: -2, lon: 118, distancia: 2.4 },
  { id: 'mediterraneo', nombre: 'Mediterráneo', lat: 38, lon: 18, distancia: 2.4 },
  { id: 'andes', nombre: 'Andes', lat: -20, lon: -68, distancia: 2.4 },
  { id: 'norteamerica', nombre: 'Norteamérica', lat: 40, lon: -110, distancia: 2.8 },
];

export function regionPorId(id: string): Region | null { return REGIONES.find((r) => r.id === id) ?? null; }
