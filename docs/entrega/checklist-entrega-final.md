# Checklist final de entrega (F8 · 8.5 · T024/T025/T039/T040)

**Estado a 2026-11-11 (noche).** Entrega prevista **jue 19 o vie 20 de noviembre**; evaluación prevista **sáb 21 y dom 22** (sin confirmar: CA-02/CA-06). Este documento reparte lo que queda. `checklist-ventana-evaluacion.md` detalla el arranque y la ventana; `checklist-grabacion.md` y `capturas-y-evidencias.md` cubren el vídeo y las capturas. **Nada de lo marcado «pendiente» está hecho.**

## A. Ya terminado (no hace falta repetirlo salvo en T040)
- [x] Memoria técnica (`docs/entrega/memoria.md`) y README definitivo redactados; **160 enlaces** y rutas comprobados; afirmaciones contrastadas con las evidencias (`auditoria-final.md`).
- [x] Matriz de trazabilidad y requisitos fuente actualizados a la situación real.
- [x] F7 publicada con una función de Netlify (sin clave para el visitante) y verificada **con reservas** (`verificacion-funcion-netlify.md`); respaldos `6af4a52d…` y F6 conservados.
- [x] Refresco público de **60 s** (ENUNCIADO §9); 3 peticiones por ciclo a ngrok medidas.
- [x] Escaneo de secretos: 0 hallazgos en el árbol y en 17 commits; 0 coincidencias de la clave. Frontend **521** pruebas pasan (2026-11-15); el frontend **difiere de `9008772`** por las mejoras de `8.6-mejoras-interfaz.md`.
- [x] Guion del vídeo (**5 min, orden de la rúbrica; material personal fuera de Git**), checklist de OBS y lista de capturas **preparados** (no hay vídeo ni capturas).
- [x] R5 (SQL de calidad archivado y muestra del 2026-11-11), R6 (explicación probable), R9 (diagramas válidos en Mermaid 11) mejoradas.
- [x] Repositorio **listo para el commit manual** (`preparacion-commit.md`).

## B. Acciones que debes hacer tú **antes de entregar** (en este orden recomendado)
**B1. Esta semana (días de margen)**
- [ ] **Ajustes del PC**: enchufado; «Suspender: nunca» con corriente; tapa «No hacer nada» (si es portátil); **pausar las actualizaciones de Windows** durante la ventana; decidir cómo se inicia sesión tras un reinicio (`8.3-continuidad-ventana.md`).
- [ ] **ngrok → Usage**: anota las peticiones del mes, la fecha de reinicio del ciclo y el plan; (opcional) prueba si cuentan los `OPTIONS` (`checklist-prueba-movil-pixel.md` §5).
- [ ] **Netlify**: comprobar que el valor de `API_CLAVE_ACCESO` aparece **oculto**; revisar **Logs → Functions → api** (¿algo sensible? ¿errores?); decidir si se apaga la **insignia «Powered by Netlify»** (Project configuration → General) y qué valor ficticio ponen los contextos *dev/branch/preview* de la clave.
- [ ] **Confirmar con el profesor** (CA-02/CA-03): fecha y canal de entrega, duración/formato del vídeo, si debes salir en cámara, dónde se sube y tamaño máximo, y **cuándo empieza la ventana**.
- [ ] **GitHub**: dar al profesor acceso de lectura al repositorio **privado** (sin hacerlo público); comprobar que ve el README y la memoria (CA-05).
- [ ] **Datos de costes** (opcional): precio del equipo, potencia medida, tarifa y horas reales para sustituir los `[SUPUESTO]` de la memoria §7.4 (R7).
- [ ] **Commit manual** de lo pendiente en 4 grupos (`preparacion-commit.md`) y **push**; después, mirar el README en GitHub (Mermaid y enlaces).

**B2. Capturas y vídeo**
- [ ] Tomar las **capturas estables [E]** (C-05 a C-07, C-09 a C-11, C-03b) y, al congelar la versión, las **dinámicas [D]** (`capturas-y-evidencias.md`); archivar la prueba del **Pixel** (C-13/C-14) y la del túnel cerrado (C-12/C-12b) si quieres que sean evidencia.
- [ ] **Ensayar** el guion completo (T021), incluidos los dos comandos con contenedor efímero.
- [ ] **Grabar con OBS** (T023) siguiendo `checklist-grabacion.md`; revisar el vídeo contra la matriz; anotar los minutos reales (T019).

**B3. Decisiones que dependen de ti**
- [ ] **PA-10** (observar SC-010 más de 24 h): solo si quieres intentar cerrar SC-010; si no, consta como pendiente.
- [ ] **PA-11** (entorno limpio en un proyecto Compose paralelo): solo si quieres repetir la verificación de F6 con el README final; si no, vale la evidencia de F6.
- [ ] Decidir si se **rota la clave de FastAPI** al terminar la evaluación (`procedimiento-credenciales-profesor.md`).

## C. Justo antes de entregar (T040(b), T024, T025)
- [ ] **Publicar y verificar las mejoras de interfaz (8.6)**: pruebas, `npm run build`, escaneo de secretos, `preparar-netlify-funcion.sh`, despliegue (prueba o producción, con autorización expresa) y comprobación de la web, la función y la ausencia de la clave en el *bundle*; mirar el **móvil real** (Pixel), la vista Eventos y el pie con los dos logos; actualizar las marcas `[ACTUALIZAR EN CIERRE]`.
- [ ] **Resolver las marcas `[ACTUALIZAR EN CIERRE]`** del README (10) y de la memoria (6): versión publicada, fecha, estado del sistema, capturas.
- [ ] Sistema real sano: `docker compose ps` (cinco `healthy`), `bash scripts/f6/invariantes.sh <etiqueta>`, ingesta «hace < 60 s», **0 huecos** (`recuperar --listar`).
- [ ] **EMSC**: `/api/salud` → `fuentes.emsc.activa = true` y edad < 120 s; `live.estado_fuente` sin errores recientes; en el panel, «Fuente = EMSC» devuelve eventos y la atribución CC BY 4.0 está en el pie. Si se decide no usarla: `EMSC_ACTIVO=false` y recrear el productor.
- [ ] **ngrok abierto** y la web pública cargando **sin clave** desde **otro dispositivo**; la versión publicada es `6afa2ccf…` (2026-11-15, mejoras 8.6; no mantenimiento ni la anterior `6af4b81f…`).
- [ ] **El vídeo coincide con la web publicada** y no muestra nada prohibido (clave, URL de ngrok, notificaciones).
- [ ] Repetir `bash scripts/f6/escaneo_secretos.sh` y la búsqueda del valor de la clave; `git status` limpio tras el commit; `git diff --check`.
- [ ] Verificar que el README en GitHub renderiza los diagramas y que los enlaces a la memoria funcionan.
- [ ] Revisar las **condiciones vigentes** de entrega (fecha, canal, formato) y entregar **archivo o enlace** del vídeo, URL de la web y acceso al repositorio; **anotar la confirmación** (T026).
- [ ] Mensaje de commit final `[F8]` y **push** (manuales).

## D. Durante la ventana de evaluación (del 19/20 al 22)
- [ ] **PC enchufado y despierto**, Docker sano, **ngrok abierto** (ventana visible) y la web en F7 (no mantenimiento).
- [ ] **No tocar nada**: ni código, ni servicios, ni scripts que paren o recreen contenedores, ni la clave, ni Netlify; sin modo mantenimiento salvo incidencia (avisar al profesor).
- [ ] **Cerrar pestañas** de F7 innecesarias (cada pestaña visible consume ≈ 180 peticiones/h a ngrok); revisar el contador de ngrok 1–2 veces al día.
- [ ] Si el PC se reinicia o se suspende: repetir el orden de arranque (`checklist-ventana-evaluacion.md` §B) y recuperar huecos si hubo parada larga.
- [ ] Si la cuota de ngrok o de invocaciones se agotara: la web muestra «Sin conexión» con los últimos datos (tratamiento del error previsto); decidir con calma (Plan B de `estrategia-publicacion-f7.md`, mantenimiento, F6).
- [ ] **Al terminar**: cerrar ngrok, decidir la rotación de la clave y restablecer los ajustes de Windows.

## E. Lo que no se puede declarar cumplido
SC-010 (sin observar), README en entorno limpio (sin repetir en F8), reinicio del consumidor en directo (solo evidencia), Pixel y túnel con F7 (confirmados sin capturas), contadores de ngrok y de Netlify (sin leer), backend 964 (no repetido), costes (hipotéticos) y render de Mermaid en GitHub (sin comprobar).
