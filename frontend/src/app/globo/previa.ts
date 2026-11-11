// Vista previa 3D de un terremoto para la vista Eventos (F7, pulido final). UNA sola instancia reutilizable: un único WebGLRenderer pequeño con una esfera con la textura de la Tierra
// (la misma `dibujarTierra` del globo principal, a 1024×512) y un marcador. NO hay bucle de animación: `mostrar()` coloca la cámara sobre el punto y dibuja UN fotograma.
// La carga de Three.js es perezosa (el componente de la tabla la importa con import() la primera vez que se pide una vista previa) y comparte chunk con el globo principal.
import { BackSide, CanvasTexture, Color, Mesh, MeshBasicMaterial, PerspectiveCamera, SRGBColorSpace, Scene, SphereGeometry, WebGLRenderer } from 'three';
import { FOV_GLOBO, RADIO_ESFERA, latLonAXyz } from './geometria';
import type { PaletaGlobo } from './geometria';
import { ROTACION_Y_TEXTURA, dibujarTierra } from './textura';

/** Lado (px CSS y de dibujo) del lienzo de la vista previa. */
export const LADO_PREVIA = 128;
/** Distancia de la cámara al centro de la esfera (la esfera tiene radio 1). */
const DISTANCIA_PREVIA = 3.1;
/** Latitud máxima usada para colocar la cámara (evita el polo exacto, donde «arriba» queda indefinido). */
const LAT_MAX_CAMARA = 82;

export class PreviaGlobo {
  private readonly renderer: WebGLRenderer;
  private readonly escena = new Scene();
  private readonly camara = new PerspectiveCamera(FOV_GLOBO, 1, 0.1, 20);
  private readonly tierra: Mesh;
  private readonly marcador: Mesh;
  private readonly halo: Mesh;
  private readonly atmosfera: Mesh;
  private textura: CanvasTexture | null = null;
  private perdido = false;
  private destruida = false;

  constructor(lienzo: HTMLCanvasElement, paleta: PaletaGlobo) {
    const renderer = this.renderer = new WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(LADO_PREVIA, LADO_PREVIA, false);
    renderer.setClearColor(0x000000, 0);
    lienzo.addEventListener('webglcontextlost', this.alPerderContexto);

    this.tierra = new Mesh(new SphereGeometry(RADIO_ESFERA, 48, 32), new MeshBasicMaterial({ color: new Color(paleta.esfera) }));
    this.tierra.rotation.y = ROTACION_Y_TEXTURA;   // misma orientación de la textura que el globo principal
    this.atmosfera = new Mesh(new SphereGeometry(RADIO_ESFERA * 1.07, 32, 24), new MeshBasicMaterial({ color: new Color(paleta.halo), transparent: true, opacity: 0.16, side: BackSide, depthWrite: false }));
    this.marcador = new Mesh(new SphereGeometry(0.045, 16, 12), new MeshBasicMaterial({ color: new Color(paleta.borde) }));
    this.halo = new Mesh(new SphereGeometry(0.095, 16, 12), new MeshBasicMaterial({ color: new Color(paleta.seleccion), transparent: true, opacity: 0.38, depthWrite: false }));
    this.escena.add(this.tierra, this.atmosfera, this.halo, this.marcador);
  }

  private readonly alPerderContexto = (e: Event): void => { e.preventDefault(); this.perdido = true; };

  /** True si el contexto WebGL se perdió (el componente muestra entonces solo el texto). */
  get inutilizable(): boolean { return this.perdido || this.destruida; }

  /** Dibuja UNA vez la textura de la Tierra a partir del GeoJSON de países (el mismo que usa el globo principal). Se llama una sola vez por instancia. */
  fijarTierra(geojson: unknown, paleta: PaletaGlobo): void {
    if (this.destruida) return;
    const lienzo = document.createElement('canvas');
    lienzo.width = 1024; lienzo.height = 512;
    const ctx = lienzo.getContext('2d');
    if (!ctx) return;
    dibujarTierra(ctx, geojson, 1024, 512, { oceano: paleta.esfera, continente: paleta.continente, reticula: paleta.reticula, costas: paleta.fronteras });
    const textura = new CanvasTexture(lienzo);
    textura.colorSpace = SRGBColorSpace;
    this.textura?.dispose();
    this.textura = textura;
    const mat = this.tierra.material as MeshBasicMaterial;
    mat.map = textura; mat.color.set(0xffffff); mat.needsUpdate = true;
  }

  /** Centra la cámara sobre (lat, lon), pone el marcador del color indicado y dibuja UN fotograma. */
  mostrar(lat: number, lon: number, colorMarcador: string): boolean {
    if (this.inutilizable) return false;
    const p = latLonAXyz(lat, lon, RADIO_ESFERA * 1.012);
    this.marcador.position.set(p[0], p[1], p[2]);
    this.halo.position.set(p[0], p[1], p[2]);
    (this.marcador.material as MeshBasicMaterial).color.set(colorMarcador);
    const c = latLonAXyz(Math.max(-LAT_MAX_CAMARA, Math.min(LAT_MAX_CAMARA, lat)), lon, DISTANCIA_PREVIA);
    this.camara.position.set(c[0], c[1], c[2]);
    this.camara.up.set(0, 1, 0);
    this.camara.lookAt(0, 0, 0);
    this.renderer.render(this.escena, this.camara);
    return true;
  }

  destruir(): void {
    if (this.destruida) return;
    this.destruida = true;
    this.renderer.domElement.removeEventListener('webglcontextlost', this.alPerderContexto);
    this.textura?.dispose(); this.textura = null;
    for (const m of [this.tierra, this.atmosfera, this.marcador, this.halo]) { m.geometry.dispose(); (m.material as MeshBasicMaterial).dispose(); }
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
