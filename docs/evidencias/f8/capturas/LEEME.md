# Capturas de la web publicada (F8 · 2026-11-17)

**Cómo se tomaron.** Con Chrome en modo *headless* (ventana de 1440 × 900 px, perfil nuevo y sin sesión, sin clave) abriendo la **web publicada** `https://observatorio-sismico.netlify.app` a través de la función de Netlify y el túnel real, entre las 22:43 y las 22:52 UTC del 2026-11-17 (la hora UTC se ve en el propio globo o en las tablas). No se ha retocado ninguna imagen. Las capturas solo contienen la página: no aparecen la clave, la URL del túnel, rutas personales ni notificaciones. La firma del autor del pie y la insignia «Powered by Netlify» sí aparecen porque forman parte de la aplicación publicada.

| Id | Archivo | Qué muestra |
|---|---|---|
| C-01 | `C-01-panel-globo-en-vivo.png` | Panel con globo 3D, EN VIVO, filtros por defecto (últimas 24 h, USGS + EMSC) |
| C-02 | `C-02-panel-evento-seleccionado.png` | Un evento seleccionado con ficha (incluye «Fuente») y leyenda de profundidad |
| C-03 | `C-03-panel-mapa-2d.png` | Alternativa Leaflet 2D con leyenda |
| C-03b | `C-03b-sin-webgl-mapa-2d.png` | Fallback sin WebGL: aviso «Globo 3D no disponible» y mapa 2D (Chrome con `--disable-3d-apis --disable-gpu`) |
| C-04 | `C-04-analisis-completo.png` | Vista Análisis completa (cuatro gráficas y comparación con 2025) |
| C-05a / C-05b | `C-05a-conclusion1-m45-global.png`, `C-05b-conclusion1-m45-sin-pais.png` | Conclusión 1: periodo `2026-11-05T17:00Z → 2026-11-07T18:00Z`, M ≥ 4,5, global y «Sin país asignado» |
| C-06 | `C-06-conclusion2-comparacion-m45.png` | Conclusión 2: comparación con 2025 a M ≥ 4,5 en el mismo periodo |
| C-07a | `C-07a-conclusion3-comparacion-m4.png` | Conclusión 3: comparación a M ≥ 4 (la de M ≥ 4,5 es C-06) |
| C-08 | `C-08-eventos-tabla-vista-previa.png` | Vista Eventos: tabla con una fila seleccionada y vista previa 3D al pasar el ratón (incluye eventos de EMSC) |
| C-09 | `C-09-reproduccion-panel.png` | REPRODUCCIÓN en el Panel (etiqueta violeta, ejecución `r-f6-estab-11082023`) |
| C-10a / C-10b | `C-10a-reproduccion-analisis.png`, `C-10b-reproduccion-eventos.png` | REPRODUCCIÓN en Análisis y en Eventos |
| C-11 | `C-11-reproduccion-evento-magnitud-nd.png` | Caso controlado con magnitud «sin valor» (ND) |
| C-12 | `C-12-tunel-cerrado-sin-conexion.png` | Túnel de ngrok cerrado: «Sin conexión con la API», se conservan los últimos datos |
| C-12b | `C-12b-tunel-reabierto-conexion-recuperada.png` | Túnel reabierto: la web vuelve a «Correcto · Datos al día» (el aviso transitorio «Conexión recuperada» ya no se ve en la imagen) |
| C-13a / C-13b | `C-13a-movil-emulado-panel.png`, `C-13b-movil-emulado-analisis.png` | Panel y Análisis en una pantalla de 412 × 915 px **emulada** |
| C-14 | `C-14-web-publicada-sin-clave-perfil-nuevo.png` | La web publicada cargando sin formulario de clave en un navegador con perfil nuevo |
| C-15 | `C-15-docker-compose-ps.txt` | **Texto** de `docker compose ps`: cinco servicios `healthy` y solo la API publicada |
| C-16 | `C-16-cuarentena-y-recuentos.txt` | **Texto** de consultas de solo lectura: cuarentena por motivo y recuentos |
| GIF | `demo-observatorio.gif` | Recorrido animado de la web publicada (globo, ficha, mapa 2D, filtro EMSC, análisis, eventos y REPRODUCCIÓN) que abre el README; 19 fotogramas reducidos a 960 px, 2026-11-17 |
| C-18 / C-20 | `C-18-emsc-filtro-fuente-y-ficha.png`, `C-20-pie-atribucion-usgs-emsc.png` | Segunda fuente: filtro «Fuente = EMSC» con una ficha «Fuente: EMSC», y pie con la atribución de USGS y EMSC (CC BY 4.0). C-19 no existe: lo cubre C-18 |

## Reservas (no se ocultan)
- **C-13 es una emulación**, no un Google Pixel real. La persona estudiante comprobó la web en un móvil real y confirmó que se ve correcta, pero **esa prueba no tiene captura**.
- **C-14** se tomó en el mismo equipo con un perfil nuevo: demuestra que no hay formulario de clave, pero **no es otro dispositivo**.
- **C-12 y C-12b** se tomaron cerrando y reabriendo realmente el túnel (≈ 2 min). La web quedó otra vez operativa y la API respondió `ok`.
- **C-05, C-06 y C-07 muestran cifras actuales del periodo fijo, no las del 2026-11-07**: el panel da **23** terremotos de M ≥ 4,5 (18 «Sin país asignado») y **33** de M ≥ 4, frente a los **22** (17 «Sin país») y **31** documentados en las conclusiones. Se comprobó en la base: **22** y **31** de esos eventos ya estaban guardados antes de las 19:00 UTC del 2026-11-07 (17 «Sin país» en M ≥ 4,5 y 9 en la banda 4,0–4,5, como en el documento), y el resto llegó después al feed (p. ej. `us7000twsy`, M 4,5, ocurrido a las 16:01 UTC y guardado por primera vez a las 19:54 UTC). Las cifras de las conclusiones **no se recalculan**: siguen siendo las del cálculo del 2026-11-07 (`docs/evidencias/f5/conclusiones.md`).
- **C-17** (contador de ngrok) no se incluye como imagen: la persona estudiante lo leyó y las cifras constan en texto (4,12 MB de 1 GB el 2026-11-16 y 5,18 MB el 2026-11-17; 867 peticiones el 2026-11-16).
- Las capturas EN VIVO cambian cada minuto: su fecha es la de este documento.
