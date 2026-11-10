// Globo 3D (F7): máquina de estados PURA de la rotación automática lenta. Sin three, sin DOM, sin temporizadores propios: recibe el tiempo (`ahora`, en ms) como
// parámetro, así que se prueba con tiempo simulado (tests/globo.test.ts). escena.ts solo la consulta en cada fotograma y aplica el ángulo que devuelve.
//
// Velocidad elegida: 2,4 °/s (una vuelta cada 150 s = 2 min 30 s). Es lo bastante lenta para no distraer ni marear y lo bastante rápida para notarse. Se expresa
// como velocidad ANGULAR (°/s) y se integra con el tiempo real transcurrido (dt), nunca «X grados por fotograma»: a 30, 60 o 144 Hz el globo gira igual.
export const VELOCIDAD_GRADOS_S = 2.4;
export const VELOCIDAD_RAD_S = (VELOCIDAD_GRADOS_S * Math.PI) / 180;
/** Inactividad (ms) necesaria tras una interacción, o tras cerrar la selección, para que la rotación se reanude sola. */
export const RETARDO_REANUDAR_MS = 3000; // F7 (3.ª iteración): antes 5 s; 3 s siguen dando margen para seguir interactuando sin que el globo se escape
/** Rampa de aceleración (ms): la velocidad sube linealmente de 0 al máximo, sin arranque brusco. */
export const RAMPA_MS = 1000;
/** Tope del intervalo entre dos fotogramas (ms): tras una suspensión o una caída de FPS el globo NO da un salto; como mucho avanza lo de 50 ms. */
export const DT_MAX_MS = 50;

export class MaquinaRotacion {
  /** Deseo de la persona: ¿la rotación está «encendida»? Con movimiento reducido arranca apagada; el botón la alterna. La pausa manual NO se levanta sola. */
  private activa: boolean;
  /** Fracción (0–1) de la velocidad máxima: la rampa de arranque. */
  private velocidad = 0;
  /** Instante del último fotograma en que se giró; null = no se está girando (el siguiente fotograma parte con dt = 0). */
  private ultimoMs: number | null = null;
  private ultimaInteraccionMs = -Infinity;
  private vista = true; private pestana = true; private enPantalla = true; private seleccion = false; private puntero = false;

  /** `prefers-reduced-motion: reduce` vigente. Solo lo consulta reanudarYa (la rotación automática inmediata no se concede con movimiento reducido). */
  private reducido: boolean;

  constructor(movimientoReducido = false) { this.activa = !movimientoReducido; this.reducido = movimientoReducido; }

  /** ¿Está encendida (no pausada por la persona)? Es lo que refleja el texto del botón. */
  get estaActiva(): boolean { return this.activa; }
  /** ¿Se está girando ahora mismo (o en rampa)? Mientras sea true, escena.ts mantiene el bucle de fotogramas. */
  get girando(): boolean { return this.ultimoMs !== null; }

  /** Vista 3D visible (no el mapa 2D), pestaña visible y globo dentro de la pantalla. Cualquier cambio reinicia la referencia de tiempo y la rampa (sin saltos al volver). */
  fijarEntorno(vista: boolean, pestana: boolean, enPantalla: boolean): void {
    if (vista === this.vista && pestana === this.pestana && enPantalla === this.enPantalla) return;
    this.vista = vista; this.pestana = pestana; this.enPantalla = enPantalla;
    this.reiniciar();
  }

  /** Hay un terremoto seleccionado: no se gira. Al soltarlo, el retardo de inactividad cuenta desde ese instante. */
  fijarSeleccion(haySeleccion: boolean, ahora: number): void {
    if (haySeleccion === this.seleccion) return;
    this.seleccion = haySeleccion;
    if (!haySeleccion) this.ultimaInteraccionMs = ahora;
    this.reiniciar();
  }

  /** Puntero pulsado (arrastre o pellizco en curso): bloquea. Al soltarlo cuenta como interacción. */
  fijarPuntero(abajo: boolean, ahora: number): void {
    this.puntero = abajo;
    this.ultimaInteraccionMs = ahora;
    this.reiniciar();
  }

  /** Cualquier otra interacción (rueda con Ctrl, botones de zoom, restablecer, teclado): se detiene ya y se reanuda tras el retardo. */
  interactuar(ahora: number): void {
    this.ultimaInteraccionMs = ahora;
    this.reiniciar();
  }

  /** `prefers-reduced-motion: reduce`: se apaga (la persona puede encenderla a mano con el botón). */
  fijarMovimientoReducido(reducido: boolean): void {
    this.reducido = reducido;
    if (!reducido) return;
    this.activa = false;
    this.reiniciar();
  }

  /** Botón «Pausar / Reanudar rotación». Al reanudar a mano, la rotación empieza ya (con rampa), sin esperar el retardo de inactividad. Devuelve el nuevo estado. */
  alternar(): boolean {
    this.activa = !this.activa;
    if (this.activa) this.ultimaInteraccionMs = -Infinity;
    this.reiniciar();
    return this.activa;
  }

  /**
   * Reanudación INMEDIATA (sin el retardo de 3 s): la usa escena.ts al COMPLETAR la recuperación de la vista (Restablecer, Cerrar ficha, clic en vacío). Solo borra la espera de
   * inactividad y reinicia la rampa (arranque suave desde 0). Devuelve true si la borró. NO levanta ningún bloqueo: se respeta la pausa manual (activa = false), el movimiento
   * reducido (no gira solo; si la persona lo encendió a mano con el botón, rige el retardo normal), y siguen mandando selección, puntero, vista 2D, pestaña oculta o fuera de pantalla.
   */
  reanudarYa(): boolean {
    if (!this.activa || this.reducido) return false;
    this.ultimaInteraccionMs = -Infinity;
    this.reiniciar();
    return true;
  }

  /** ¿Hay algo que impida girar (con independencia del retardo de inactividad)? */
  get bloqueada(): boolean { return !this.activa || !this.vista || !this.pestana || !this.enPantalla || this.seleccion || this.puntero; }

  puedeGirar(ahora: number): boolean { return !this.bloqueada && ahora - this.ultimaInteraccionMs >= RETARDO_REANUDAR_MS; }

  /** Milisegundos hasta poder girar: 0 si ya se puede; null si está bloqueada (pausa, 2D, pestaña oculta, fuera de pantalla, selección o puntero): no hay nada que esperar. */
  esperaMs(ahora: number): number | null {
    if (this.bloqueada) return null;
    return Math.max(0, RETARDO_REANUDAR_MS - (ahora - this.ultimaInteraccionMs));
  }

  /**
   * Un fotograma: devuelve el ángulo (radianes, siempre >= 0) que debe girar ahora el globo hacia el este.
   *  · dt = tiempo real desde el último fotograma, acotado a [0, DT_MAX_MS] (sin saltos). El primero tras una pausa tiene dt = 0 (se reinicia la referencia).
   *  · La velocidad sube de 0 a 1 en RAMPA_MS (arranque suave) y el ángulo es velocidad máxima × fracción × dt: independiente de la tasa de fotogramas.
   */
  avanzar(ahora: number): number {
    if (!this.puedeGirar(ahora)) { this.velocidad = 0; this.ultimoMs = null; return 0; }
    const dt = this.ultimoMs === null ? 0 : Math.min(Math.max(ahora - this.ultimoMs, 0), DT_MAX_MS);
    this.ultimoMs = ahora;
    this.velocidad = Math.min(1, this.velocidad + dt / RAMPA_MS);
    return (VELOCIDAD_RAD_S * this.velocidad * dt) / 1000;
  }

  private reiniciar(): void { this.velocidad = 0; this.ultimoMs = null; }
}
