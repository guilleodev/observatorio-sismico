# Capturas y evidencias de la entrega

**Estado a 2026-11-17**: las capturas de la **web publicada** se tomaron el 2026-11-17 y están en `docs/evidencias/f8/capturas/` (cómo se hicieron y sus reservas: [`LEEME.md`](../evidencias/f8/capturas/LEEME.md)). Las evidencias de texto de F3–F8 están enlazadas. **No se inventa ninguna captura ni cifra.** Sin captura: la prueba en un móvil real y el contador de ngrok.

**Columna «Se usa en»**: las letras A–G son las escenas del vídeo de 5 min (A Apertura, B Extracción, C Calidad, D Modelado, E Análisis, F Reflexión, G Cierre; ver [matriz](matriz-trazabilidad.md)). Con 5 min no hacen falta todas: se usan las de B a F.

**Dónde están**: `docs/evidencias/f8/capturas/`, con nombre `C-XX-descripcion.png`. **Criterios aplicados**: ninguna muestra la clave, el `.env`, la URL de ngrok, el inspector `127.0.0.1:4040`, el panel de Netlify con variables, notificaciones ni rutas personales; todas son del 2026-11-17 y las de datos en vivo llevan la hora UTC en la propia imagen.

**Clases**: **[E] estable** (datos fijos: REPRODUCCIÓN, periodo 5–7 nov 2026, documentos) y **[D] dinámica** (EN VIVO, web publicada, contadores), que cambia cada minuto y lleva la fecha de la captura.

## 1. Capturas de imagen
| Id | Qué muestra | Clase | Estado |
|---|---|---|---|
| C-01 | Panel con globo 3D, EN VIVO | [D] | Hecha (2026-11-17) |
| C-02 | Panel con un evento seleccionado (ficha y leyenda) | [D] | Hecha |
| C-03 | Mapa 2D de Leaflet con leyenda | [D] | Hecha |
| C-03b | Fallback sin WebGL: «Globo 3D no disponible…» con el mapa 2D | [E] | Hecha (Chrome con `--disable-3d-apis --disable-gpu`) |
| C-04 | Análisis completo | [D] | Hecha |
| C-05 | Conclusión 1: M ≥ 4,5, 5–7 nov 2026, global y «Sin país asignado» | [E] | Hecha (C-05a/b); cifras actuales del periodo fijo: 23 y 18 «Sin país» frente a 22 y 17 documentados (ver LEEME) |
| C-06 | Conclusión 2: comparación a M ≥ 4,5 | [E] | Hecha (misma reserva) |
| C-07 | Conclusión 3: M ≥ 4 (la de M ≥ 4,5 es C-06) | [E] | Hecha (33 eventos frente a 31 documentados; ver LEEME) |
| C-08 | Eventos: tabla con selección y vista previa 3D | [D] | Hecha |
| C-09 | REPRODUCCIÓN en Panel | [E] | Hecha (ejecución `r-f6-estab-11082023`) |
| C-10 | REPRODUCCIÓN en Análisis y en Eventos | [E] | Hecha (C-10a/b) |
| C-11 | Evento con magnitud «ND» (caso controlado) | [E] | Hecha |
| C-12 / C-12b | Túnel cerrado: «Sin conexión con la API» y túnel reabierto | [D] | Hecha cerrando y reabriendo el túnel real (≈ 2 min); en C-12b se ve el estado recuperado, no el aviso transitorio |
| C-13 | Panel y Análisis en móvil | [D] | **Solo emulación** de 412 px (C-13a/b); la prueba en un Pixel o móvil real la hizo el autor **sin captura** |
| C-14 | La web publicada sin formulario de clave | [D] | Hecha con un navegador de perfil nuevo **del mismo equipo**, no otro dispositivo |
| C-15 | `docker compose ps` con los cinco servicios `healthy` | [D] | Hecha como **texto** (`C-15-docker-compose-ps.txt`) |
| C-16 | Cuarentena por motivo y recuentos | [D] | Hecha como **texto** (`C-16-cuarentena-y-recuentos.txt`) |
| C-17 | Contador de ngrok (*Usage*) | [D] | **Sin imagen**: el autor lo leyó; cifras en texto (4,12 MB el 2026-11-16 y 5,18 MB de 1 GB el 2026-11-17; 867 peticiones el 2026-11-16) |
| C-18 / C-20 | EMSC: filtro «Fuente = EMSC» con ficha «Fuente: EMSC», y pie con la atribución | [D] | Hechas (C-19 lo cubre C-18) |

## 2. Evidencias que no son imágenes (texto, resultados)
| Id | Evidencia | Estado | Clase |
|---|---|---|---|
| E-01 | Salida de `bash scripts/f6/invariantes.sh <etiqueta>` | Hecho el 2026-11-17 (reconciliación 0, offsets duplicados 0, lag 0, 0 huecos pendientes, cinco `healthy`; resumen en `emsc-segunda-fuente.md` §9) | [D] |
| E-02 | Resultado final de `escaneo_secretos.sh` y de la búsqueda del valor de la clave (0 coincidencias) | Hecho el 2026-11-11 (`8.3-seguridad-secretos.md`) y repetido el 2026-11-17 (0 avisos) | [D] |
| E-03 | Pruebas del frontend (`node --test`): **528** pasan y backend **1 046** (ambos el 2026-11-16 y repetidos el 2026-11-17) | Hecho | [E] |
| E-04 | Verificación de la web pública con la función (`verificacion-funcion-netlify.md`) | Hecho (con reservas) | [D] |
| E-05 | Registros de la función de Netlify y consumo de invocaciones | No realizada: requiere el panel de Netlify | [D] |
| E-06 | Comprobación en Netlify de que `API_CLAVE_ACCESO` aparece oculta | No realizada: requiere el panel de Netlify | [D] |
| E-07 | `docs/evidencias/f8/auditoria-final.md` | Hecho (con nota del 2026-11-17) | [D] |
| E-08 | **SC-010** (`docs/evidencias/f3/sc-010-observacion-24h.txt`) | **Hecho el 2026-11-17** (solo lectura): conservación observada y reconciliación 0 | [D] |
| E-09 | **README en entorno limpio** (`docs/evidencias/f8/`) | **Hecho el 2026-11-17**: cinco `healthy`, 18 302 eventos históricos, API 200; el sistema real no cambió (`docs/evidencias/f8/entorno-limpio-readme-final.txt`) | [D] |
| E-10 | El **vídeo** (archivo o enlace) | Se entrega aparte; no forma parte del repositorio | [D] |

## 3. Evidencias ya existentes (se reutilizan; no se repiten)
- **Extracción**: `f3/3.2-ingesta.txt`, `f3/3.7-ejecucion-continua.txt`, `f4/4.4-carga-real.txt`, `f4/4.1-catalogo.txt`.
- **Calidad**: `f4/4.6-calidad.txt`, `f3/3.5-calidad-datos-reales.txt` y `3.5-activacion.txt` (discrepancia 197/198 documentada).
- **Modelado e índices**: `sql/001`–`005`, `f5/5.7-explain.txt`.
- **Análisis**: `f5/conclusiones.md`, `f5/5.2-estadisticas-real.txt`, `f5/5.3-comparacion-real.txt`.
- **Pruebas y replay**: `f6/6.3-aceptacion.md`, `f6/6.8-consumidor.txt`, `f6/6.6-tunel.md`, `f4/recuperacion-hueco-475.md`, `f3/3.4-atomicidad*.txt`, `f3/3.4-idempotencia.txt`.
- **Mediciones y costes**: `f6/6.4-mediciones.txt`, `f6/6.5-comparaciones.txt`, `f6/complejidad-costes.md`.
- **Despliegue y seguridad**: `f6/6.6-*.txt`, `f8/estrategia-publicacion-f7.md`, `f8/verificacion-publicacion-f7.md`, `f8/verificacion-funcion-netlify.md`, `f8/8.3-seguridad-secretos.md`, `f8/8.3-continuidad-ventana.md`, `f8/8.3-aislamiento-invariantes.txt`.

(Las rutas `fN/…` son relativas a `docs/evidencias/`.)

## 4. Estado de las capturas (2026-11-17)
Todas las capturas de la web publicada (C-01 a C-14, C-18 y C-20) y los textos C-15 y C-16 están hechos; solo se rehacen si se vuelve a publicar la web.

### Evidencias de EMSC (segunda fuente, final de F8)
- **Documento**: `docs/evidencias/f8/emsc-segunda-fuente.md` (arquitectura, regla de no duplicación, cifras reales del 2026-11-16, prueba de 24 h, pruebas de fallo, cómo revertir) — **existe**.
- **Capturas** (2026-11-17): `C-18-emsc-filtro-fuente-y-ficha.png` (filtro «Fuente = EMSC» y ficha «Fuente: EMSC») y `C-20-pie-atribucion-usgs-emsc.png` (atribución CC BY 4.0). No se incluyen la tabla de `live.estado_fuente` ni la consulta de los ocultos como duplicado.

## 5. Qué NO puede presentarse como evidencia
Nada lo confirmado solo de palabra: la **prueba en un móvil real** (2026-11-11 y 2026-11-17) consta como **comprobada sin captura**; C-13 es una emulación. El túnel cerrado y reabierto y el fallback sin WebGL ya tienen captura (2026-11-17). El entorno limpio y SC-010 se verificaron el 2026-11-17 con las reservas indicadas en sus evidencias (una sola máquina; el entorno limpio sin el paso del panel Angular).
