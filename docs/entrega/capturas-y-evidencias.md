# Capturas y evidencias para la entrega (F8 · 8.4)

**Estado a 2026-11-11**: **no se ha archivado ninguna captura** ni ninguna evidencia nueva de imagen; todo lo marcado «pendiente» está sin hacer. Las evidencias de texto ya existentes (F3–F8.3) están enlazadas. **No se inventa ninguna captura ni cifra.**

**Dónde guardarlas**: `docs/evidencias/f8/capturas/` con nombre `C-XX-descripcion.png` (sin datos personales). **Reglas**: ninguna con la clave, `.env`, URL de ngrok, inspector `127.0.0.1:4040`, panel de Netlify con variables, notificaciones ni rutas personales (`checklist-grabacion.md` §1); cada captura con **fecha y hora**; si muestra datos en vivo, se indica «EN VIVO» y la fecha.

**Clases**: **[E] estable** (datos fijos: REPRODUCCIÓN, periodo 5–7 nov 2026, documentos) → se pueden tomar **ya**; **[D] dinámica** (EN VIVO, web publicada, dispositivos reales, contadores) → se toman **al final**, tras congelar la versión publicada (T040(a), antes de grabar) y se **repiten si algo cambia**.

## 1. Capturas de imagen
| Id | Qué mostrar | Clase | Estado | Cómo / quién | Se usa en |
|---|---|---|---|---|---|
| C-01 | Panel con globo 3D, EN VIVO, filtros por defecto | [D] | Pendiente | Navegador sobre la web publicada; persona estudiante o herramienta con autorización | memoria §1.4, README §18, V5 |
| C-02 | Panel con un evento seleccionado (ficha y leyenda) | [D] | Pendiente | ídem | memoria §1.4, V5 |
| C-03 | Mapa 2D de Leaflet con leyenda | [D] | Pendiente | ídem | memoria §1.4, V5 |
| C-03b | **Fallback sin WebGL**: «Globo 3D no disponible…» con el mapa 2D | [E] | Pendiente (comprobado el 2026-11-11 en una copia local con WebGL desactivado, **sin captura**) | Chrome con WebGL desactivado (`chrome://flags` → *Override software rendering list* desactivado y `--disable-gpu`) o la copia local; persona estudiante | R5, memoria §1.4 |
| C-04 | Análisis completo (gráficas y comparación con 2025) | [D] | Pendiente | navegador | memoria §6.1, V5 |
| C-05 | Filtros de la conclusión 1: `min_mag = 4,5`, 5–7 nov 2026, global y «Sin país asignado» | [E] | Pendiente | filtro **Personalizado (UTC)** con `2026-11-05T17:00` → `2026-11-07T18:00`; la persona estudiante valida | memoria §6.2–6.3, V5 |
| C-06 | Filtros de la conclusión 2: comparación a M ≥ 4,5, mismo periodo | [E] | Pendiente | ídem | memoria §6.2–6.3, V5 |
| C-07 | Filtros de la conclusión 3: `min_mag = 4` y `min_mag = 4,5` | [E] | Pendiente | ídem | memoria §6.2–6.3, V5 |
| C-08 | Eventos: tabla con selección y vista previa 3D | [D] | Pendiente | navegador | memoria §1.4, V5 |
| C-09 | REPRODUCCIÓN en Panel (etiqueta violeta y ejecución) | [E] | Pendiente | navegador, ejecución `r-f6-estab-11082023` | memoria §9.4, V6 |
| C-10 | REPRODUCCIÓN en Análisis («no aplica») y en Eventos | [E] | Pendiente | navegador | memoria §9.4, V6 |
| C-11 | Evento con magnitud «ND» (caso controlado de replay) | [E] | Pendiente | navegador | memoria §8, V3 |
| C-12 | **Túnel cerrado**: «Sin conexión con la API» (Error HTTP 502), datos conservados | [D] | Pendiente | persona estudiante (cierra ngrok **fuera de captura**); T036 ya lo comprobó **sin captura** | memoria §8, V7 |
| C-12b | **Túnel reabierto**: «Conexión recuperada» | [D] | Pendiente | ídem | memoria §8, V7 |
| C-13 | Panel y Análisis en el **Pixel** con datos móviles | [D] | **Pendiente** (la persona estudiante confirmó que funcionó, **sin captura**) | persona estudiante | memoria §1.4, V10 |
| C-14 | La web publicada **sin formulario de clave** desde otro dispositivo | [D] | Pendiente | persona estudiante | memoria §10.3 |
| C-15 | `docker compose ps` con los cinco servicios `healthy` y solo la API publicada | [D] | Pendiente | terminal, sin rutas personales | V1, README §6 |
| C-16 | Cuarentena por motivo y recuentos del histórico/catálogo (terminal) | [D] | Pendiente | terminal (consultas de `guion-video.md` §8) | V2–V3, memoria §4 |
| C-17 | Contador de ngrok (*Usage*) y fecha de reinicio del ciclo, **sin datos de cuenta** | [D] | Pendiente (la persona estudiante lo dejó pendiente) | persona estudiante | memoria §7.4, R8 |

## 2. Evidencias que no son imágenes (texto, resultados)
| Id | Evidencia | Estado | Clase |
|---|---|---|---|
| E-01 | Salida de `bash scripts/f6/invariantes.sh <etiqueta>` justo antes de entregar | Pendiente | [D] |
| E-02 | Resultado final de `escaneo_secretos.sh` y de la búsqueda del valor de la clave (0 coincidencias) | Hecho el 2026-11-11 (`8.3-seguridad-secretos.md`); **repetir** en la auditoría final | [D] |
| E-03 | Pruebas del frontend (`node --test`): **494** pasan (2026-11-11) y backend **964** (2026-11-09, reutilizado) | Hecho (con las reservas de `resultados.md`) | [E] |
| E-04 | Verificación de la web pública con la función (`verificacion-funcion-netlify.md`) | Hecho (con reservas) | [D] |
| E-05 | Logs de la función de Netlify (¿algo sensible?) y consumo de invocaciones | Pendiente | [D] |
| E-06 | Comprobación en Netlify de que `API_CLAVE_ACCESO` aparece oculta | Pendiente | [D] |
| E-07 | `docs/evidencias/f8/auditoria-final.md` (8.5) | Pendiente | [D] |
| E-08 | **SC-010** (`docs/evidencias/f3/sc-010-observacion-24h.txt`) | **No ejecutada** (PA-10 no concedida): consta como pendiente | — |
| E-09 | **README en entorno limpio** (`docs/evidencias/f8/`) | **No ejecutado** (PA-11 no concedida): vale la evidencia de F6 (`f6/6.9-entorno-limpio.txt`) | — |
| E-10 | El **vídeo** (archivo o enlace) | Pendiente (graba la persona estudiante) | [D] |

## 3. Evidencias ya existentes (se reutilizan; no se repiten)
- **Extracción**: `f3/3.2-ingesta.txt`, `f3/3.7-ejecucion-continua.txt`, `f4/4.4-carga-real.txt`, `f4/4.1-catalogo.txt`.
- **Calidad**: `f4/4.6-calidad.txt`, `f3/3.5-calidad-datos-reales.txt` y `3.5-activacion.txt` (discrepancia 197/198 documentada).
- **Modelado e índices**: `sql/001`–`004`, `f5/5.7-explain.txt`.
- **Análisis**: `f5/conclusiones.md`, `f5/5.2-estadisticas-real.txt`, `f5/5.3-comparacion-real.txt`.
- **Pruebas y replay**: `f6/6.3-aceptacion.md`, `f6/6.8-consumidor.txt`, `f6/6.6-tunel.md`, `f4/recuperacion-hueco-475.md`, `f3/3.4-atomicidad*.txt`, `f3/3.4-idempotencia.txt`.
- **Mediciones y costes**: `f6/6.4-mediciones.txt`, `f6/6.5-comparaciones.txt`, `f6/complejidad-costes.md`.
- **Despliegue y seguridad**: `f6/6.6-*.txt`, `f8/estrategia-publicacion-f7.md`, `f8/verificacion-publicacion-f7.md`, `f8/verificacion-funcion-netlify.md`, `f8/8.3-seguridad-secretos.md`, `f8/8.3-continuidad-ventana.md`, `f8/8.3-aislamiento-invariantes.txt`.

(Las rutas `fN/…` son relativas a `docs/evidencias/`.)

## 4. Orden de trabajo
1. **Ya (estables [E])**: C-05 a C-07, C-09 a C-11 y C-03b (no dependen del tiempo).
2. **Cuando la versión publicada esté congelada (T040(a), antes de grabar)**: C-01 a C-04, C-08, C-15 a C-17, y E-01, E-05, E-06.
3. **Con el sistema real y la persona estudiante**: C-12, C-12b, C-13, C-14.
4. **Antes de entregar (T040(b), T024)**: repetir lo que haya cambiado; E-02, E-07 y el vídeo (E-10); verificar que README y memoria enlazan solo capturas **existentes**.

## 5. Qué NO puede presentarse como evidencia
Nada de lo marcado «Pendiente» ni lo confirmado solo de palabra (**Pixel, túnel cerrado y reabierto en T036/T043, fallback sin WebGL**): consta como **comprobado sin captura**. SC-010 y el entorno limpio **no se declaran cumplidos** en F8.
