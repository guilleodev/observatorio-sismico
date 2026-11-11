# Estrategia segura de publicación de F7 (F8 · T034)

**Estado**: BORRADOR para revisión y aprobación por escrito de la persona estudiante · **Redactado**: 2026-11-11 · **No se ha ejecutado nada**: ni build, ni Docker, ni ngrok, ni Netlify. Este documento **no concede ninguna autorización**: cada acción de la sección 10 se autoriza por separado y, para las que tocan servicios externos, **cada vez**.

Etiquetas: **[MEDIDO]** observado y archivado; **[ESTIMADO]** aritmética sobre datos medidos o documentados; **[HIPÓTESIS]** razonamiento sin medición; **[PROPUESTA]** decisión que corresponde a la persona estudiante; **[VERIFICAR]** dato que hay que confirmar al ejecutar; **[ACTUALIZAR EN CIERRE]** valor que puede cambiar hasta la entrega.

Decisiones ya tomadas por la persona estudiante (2026-11-11): refresco de 60 s con pausa si la pestaña está oculta, **provisional** y condicionado a medir la cuota; **no** se modifica backend ni CORS por una hipótesis sobre `OPTIONS`; **no** se cambia código ni configuración antes de aprobar esta estrategia; el profesor revisará la web durante la ventana prevista del **19/20 al 22 de noviembre** (fechas sin confirmar, CA-02/CA-06) con **PC, Docker y ngrok operativos**; el despliegue **F6 se mantiene disponible** como vía de recuperación.

**DECISIÓN DEFINITIVA (2026-11-11): el refresco público de F7 es 60 s** con pausa si la pestaña está oculta, por ser un requisito explícito del enunciado §9 («el mapa consultará la API cada 60 segundos»; FAQ 21: «aproximadamente cada 60 segundos»; constitución, principio I). F7 se publicó ya con 60 s (T035) y **no necesita otro despliegue**. La medición de T036 (**[MEDIDO]** 6 peticiones por ciclo: 3 GET + 3 OPTIONS, navegador integrado Chrome 152) y las proyecciones de cuota (**[ESTIMADO]**) no cambian la decisión. **Plan B (no activo)**: si antes de la ventana el contador de ngrok indicara un riesgo real, reconstruir con `--refresh-ms 300000` o `600000` y volver a desplegar, solo con autorización expresa y asumiendo la desviación del enunciado. **No se conoce el consumo real de la cuenta de ngrok: el contador no se ha leído.**

**CAMBIO DE ARQUITECTURA T042 (2026-11-11)**: el visitante no debe introducir ninguna clave. Se implementó y **se publicó el 2026-11-11 (T043; despliegue `6af4b81fa1d0a00d0cb33c59`)** una **Netlify Function de solo lectura** que añade la clave en el servidor; el panel público llama a su propio origen. Está descrito en la **sección 8 quater**. **Donde las secciones 2, 3, 4, 5 y 7 hablan de la URL del túnel en `config.json`, de la pantalla de clave y de los OPTIONS desde el navegador, describen el despliegue ya publicado (`6af4a52d…`); la variante con función los sustituye desde el despliegue `6af4b81f…`. Resultado de la verificación en producción, incidencias y límites reales: `docs/evidencias/f8/verificacion-funcion-netlify.md`.**

**Ampliación T041 (2026-11-11, aprobada)**: se añade un **modo mantenimiento** con **tres despliegues conservados** en el mismo sitio de Netlify (F6, F7 y una pantalla estática de mantenimiento), que se alternan **a mano** desde Netlify → Deploys → «Publish deploy». Está descrito en la **sección 8 bis**; no cambia los pasos 2 a 7 ni el backend. Los archivos de la pantalla están creados en `scripts/f8/mantenimiento/` pero **no se ha publicado ningún despliegue**.

---

## 1. Estado actual

| Elemento | F6 (publicada hoy) | F7 (local, commit `9008772`) |
|---|---|---|
| Frontend | Netlify `https://observatorio-sismico.netlify.app`, despliegue `6af0cbc3bee7002e941af403` del 2026-11-08, hecho con la CLI de Netlify y `--no-build` (`f6/6.6-publicacion.txt`) | `frontend/` compilable; **sin publicar** |
| Configuración pública | `apiUrl` = `https://grandpa-bunkbed-spree.ngrok-free.dev`, `refreshMs: 600000`, `pausarSiOculta: true`, `skipNgrokWarning: true` | Repositorio: `apiUrl` `http://127.0.0.1:8000`, `refreshMs: 60000`; local seguro: `frontend/config-local/config.json` + `proxy.conf.mjs` (solo `npm run start:local`) |
| Túnel | Dominio ngrok **estático** (la URL no cambia entre sesiones) | — |
| API | FastAPI en `127.0.0.1:8000`, clave `X-Observatorio-Clave`, CORS por origen exacto, `API_DOCS=false` y gzip (F6) | Sin cambios: backend, SQL, Compose y scripts idénticos a `fd9e1a7` (T033) |
| Presentación | Panel de F5/F6 | Mission Control: globo 3D (Three.js 0.187), mapa 2D Leaflet como alternativa, 3 vistas (Panel · Análisis · Eventos), indicador de refresco |
| Tamaño del build | `main` 353 KB | `main` 543 KB + fragmento de Three.js de 548 KB (carga perezosa) + `previa` 56 KB; ≈ 2 MB en total |

**Diferencias relevantes** (T033): la capa de red (`api.service.ts`, `modelos.ts`, `main.ts`) y el patrón de llamadas por refresco son **idénticos** a F6; F7 añade el globo, componentes nuevos y estilos; el proxy y `config-local` **no** forman parte del build público. **El camino entre orígenes (Netlify → ngrok) con F7 nunca se ha ejercitado**: en local, F7 va por un proxy del mismo origen.

**Artefacto de recuperación disponible** [MEDIDO 2026-11-11, solo lectura]: la carpeta local `frontend/dist/publico-netlify/` (ignorada por Git) contiene el build público de F6 de `2026-11-08 19:58` (`main-V2B7K4H6.js`, 352 958 B, el mismo fichero que se comprobó en la URL real). **Es la vía de vuelta atrás principal; no debe sobrescribirse** (ver sección 8).

## 2. Preparación del build de F7

### 2.1 Puertas previas (solo lectura; sin efectos)
1. `git diff --stat 9008772 HEAD -- frontend` vacío: el frontend es el congelado.
2. `git status --short frontend` sin cambios (en particular `frontend/public/config.json` intacto).
3. `bash scripts/f6/escaneo_secretos.sh` sin hallazgos (T031 lo repetirá sobre el historial completo).
4. Copia de seguridad de la vuelta atrás (sección 8) hecha **antes** de generar nada nuevo.

### 2.2 Comando previsto
```bash
bash scripts/f6/preparar-netlify.sh https://grandpa-bunkbed-spree.ngrok-free.dev --refresh-ms 60000 --salida frontend/dist/publico-netlify-f7
```
- `--refresh-ms 60000`: el script usa 600 000 por defecto; sin el parámetro saldría el valor de F6. [PROPUESTA provisional: ver la sección 5.]
- `--salida frontend/dist/publico-netlify-f7`: **directorio nuevo**. El script hace `rm -rf` del directorio de salida: **no** debe apuntar a `frontend/dist/publico-netlify` (copia de F6).
- No lleva `--restaurar-dist`: no hace falta recompilar con la configuración del repositorio (`dist/` está ignorado por Git). Se añadiría solo si se quisiera dejar `dist/` sin la URL del túnel.
- El script compila (`npm run build`, producción), escribe y **restaura** `frontend/public/config.json` comprobando su hash; no publica ni abre ningún túnel.

### 2.3 Qué debe comprobar el script y qué conviene añadir a mano
El script verifica: URL del túnel en el `config.json` del build, sin direcciones locales, refresco, `pausarSiOculta`, `skipNgrokWarning`, sin secretos en `config.json`, el nombre de la cabecera presente en un `.js`, la clave real ausente del build (si hay clave en `.env`), sin `localhost:4200`, hash restaurado, `git` sin cambios en `config.json`. Además, a mano y en lectura:
- `cat <salida>/config.json` (no contiene secretos): `refreshMs` 60000, `pausarSiOculta` true, URL del túnel.
- Existencia del fragmento de Three.js y de `datos/paises.geojson`, `_redirects` y `media/` en la salida.
- `grep -rlE "127\.0\.0\.1|localhost" <salida>` sin coincidencias en `config.json` (en el JS puede haber textos legítimos: revisar el contexto, no suponerlo).
- Que no aparezca `config-local`, `proxy.conf` ni nada de `.env` en la salida.

### 2.4 Posibles problemas del script con F7 [HIPÓTESIS hasta compilar]
1. **Cabecera en exactamente 1 archivo**: la comprobación espera `== 1` archivo `.js` con `X-Observatorio-Clave`. Con los fragmentos de F7 podría aparecer en 0 o 2: sería un falso fallo del script, no de la aplicación. Si ocurre, se **informa** y se decide; no se ajusta el script sin aprobación.
2. **Textos de «10 min»** en comentarios y mensajes del script: cosmético.
3. **Requiere** Git Bash, Node 22+ y `node_modules` (ya instalado); **no** se ejecuta `npm ci` (no hace falta y podría cambiar dependencias).
4. Si el script falla a mitad, el `trap` restaura `config.json`; se verifica igualmente el hash y `git status`.

## 3. Configuración pública

| Aspecto | Valor / regla |
|---|---|
| Origen del frontend | `https://observatorio-sismico.netlify.app` (mismo sitio que F6: **el CORS no cambia**) |
| API | `https://grandpa-bunkbed-spree.ngrok-free.dev` → `127.0.0.1:8000` (solo la API) |
| Rutas públicas | Solo `GET /api/eventos`, `/api/estadisticas`, `/api/salud`; `/docs`, `/redoc`, `/openapi.json` ocultas con `API_DOCS=false` |
| Autenticación | Cabecera `X-Observatorio-Clave`; sin ella, 401. El panel muestra el formulario de clave y la guarda **solo en memoria** (sin almacenamiento del navegador ni cookies); hay que reescribirla al recargar |
| CORS | `API_CORS_ORIGINS` del `.env` local debe contener `https://observatorio-sismico.netlify.app` (origen exacto, sin barra final ni comodines). **[VERIFICAR]**: no se sabe si la API en ejecución conserva ese valor desde las pruebas de F6; se comprueba con `verificar_publicacion.py` (preflight desde el sitio) antes de desplegar. Si no lo conserva, recrear `api` es una acción **aparte** que requiere autorización (sección 10) |
| Clave | La genera/guarda el `.env` local (ignorado por Git). **Nunca** en el repositorio, el build, `config.json`, la memoria, el README, capturas, vídeo, logs ni este chat. La entrega al profesor es por canal privado (T038) |
| Recursos estáticos | Todos propios del sitio (`datos/paises.geojson`, `media/`, fragmentos JS). **Única dependencia externa**: teselas `https://tile.openstreetmap.org` del mapa 2D (ya existía en F6) |
| Visibilidad de Netlify | Sitio **público** (el plan gratuito no ofrece contraseña, `f6/6.6-privacidad.txt`): lo que protege el dato es la clave de la API, no el sitio |

## 4. ngrok: arranque seguro y conectividad

**Dominio**: el estático ya usado en F6. Comando (como en F6, ngrok 3.39.13):
```bash
ngrok http --url=https://grandpa-bunkbed-spree.ngrok-free.dev 8000
```
Reglas:
- El túnel apunta **solo al puerto 8000 (API)**. **Nunca** al 4200 (servidor local de desarrollo con proxy que inyecta la clave) ni a ningún otro puerto. Antes de abrirlo, comprobar que `npm run start:local` no está en marcha (higiene: solo escucha en `127.0.0.1`, pero no debe coexistir con una exposición pública).
- El `authtoken` está en la configuración de ngrok del usuario, fuera del repositorio; no se toca ni se muestra.
- **El inspector `http://127.0.0.1:4040` muestra cabeceras de las peticiones, incluida la clave**: no se enseña en pantalla, vídeo ni capturas; los scripts de medida solo leen método, ruta y estado.
- Orden de arranque (cada paso comprueba el anterior): Docker Desktop → `docker compose` con los 5 servicios `healthy` (solo lectura: `docker compose ps`) → `GET /api/salud` local con la clave (sin imprimirla) → abrir ngrok → comprobar conectividad.

**Comprobación de conectividad** (solo lectura, la clave la lee el script del `.env` sin imprimirla):
```bash
py -3.13 scripts/f6/verificar_publicacion.py --api https://grandpa-bunkbed-spree.ngrok-free.dev --sitio https://observatorio-sismico.netlify.app --inspector http://127.0.0.1:4040
```
Debe confirmar: respuesta con clave, 401 sin ella, preflight 200 desde el sitio de Netlify y 400 desde otros orígenes, rutas ocultas, túnel hacia el puerto 8000 únicamente y gzip.

**[VERIFICAR] límites de sesión**: confirmar en la documentación vigente de ngrok si el plan gratuito limita la duración de una sesión de túnel o el número de sesiones simultáneas; condiciona la ventana de 2–4 días (T037/T039).

## 5. Consumo de cuota: medir GET y OPTIONS reales

**Datos de partida** (ngrok gratuito, consultado el 2026-11-08, `f6/6.6-cors-local.txt`) **[ACTUALIZAR EN CIERRE]**: 20 000 peticiones/mes, 1 GB/mes de salida, 4 000 peticiones/minuto. La cuota es **mensual y compartida** con las pruebas, el ensayo y la grabación. **[VERIFICAR]**: fecha de reinicio del ciclo en el panel de ngrok y si el contador cuenta peticiones `OPTIONS`.

**Corrección (2026-11-11, T036)**: una versión anterior de este párrafo decía que el `CORSMiddleware` «no fija `max_age`». **Es incorrecto.** El preflight de la API a través del túnel responde con `Access-Control-Max-Age: 600` (valor por defecto de Starlette) **[MEDIDO el 2026-11-11 con una petición `OPTIONS` real desde el origen de Netlify, sin tocar la configuración]**, además de `Access-Control-Allow-Methods: GET, OPTIONS` y `Access-Control-Allow-Headers` con `X-Observatorio-Clave` y `ngrok-skip-browser-warning`.

**Qué está medido y qué sigue siendo hipótesis**
- **[MEDIDO]** F6 contó 3 GET por refresco (salud, eventos, estadísticas). El servidor responde al preflight con `max-age` de 600 s. Una sesión de medición de F7 con un navegador real está descrita en 5.1 y sus resultados, cuando existan, constarán en `docs/evidencias/f8/verificacion-publicacion-f7.md`.
- **[MEDIDO el 2026-11-11, T036, navegador integrado Chrome 152]** Un ciclo automático de F7 a 60 s hace **6 peticiones: 3 GET + 3 OPTIONS**, en 7 ciclos consecutivos, y el preflight **no se reutiliza ni siquiera en `/api/salud`** (URL constante) a pesar de `max-age` 600. La hipótesis anterior (≈ 5 por ciclo) queda **descartada**. Detalle, limitaciones y proyección en `docs/evidencias/f8/verificacion-publicacion-f7.md`. Sigue sin saberse si ngrok **cuenta** los `OPTIONS` ni la causa exacta (**[HIPÓTESIS]**: `cache: 'no-store'` en `fetch`).
- **No se modifica backend ni CORS por esta hipótesis**: se mide primero.

### 5.1 Procedimiento (con ngrok abierto y F7 publicada; requiere autorización de la sección 10)
1. **Línea base**: anotar el contador de peticiones del mes en el panel de ngrok (fecha y hora; sin mostrar claves) y vaciar o anotar el inspector.
2. **M1 — carga en frío**: abrir el sitio en **una** pestaña visible, escribir la clave y esperar a «Datos al día»; contar peticiones (método, ruta, estado).
3. **M2 — régimen estable**: dejar la pestaña visible y contar durante **≥ 10 ciclos** (≈ 10 min a 60 s); calcular `U` = peticiones por ciclo, **separando GET y OPTIONS**.
4. **M3 — pestaña oculta**: ocultarla ≥ 5 min; esperado: 0 peticiones; al volver, una consulta inmediata (`debeRefrescarAlVolver`).
5. **M4 — «Actualizar ahora»** (1 pulsación) y **M5 — cambio a REPRODUCCIÓN** y vuelta a EN VIVO: contar peticiones de cada acción.
6. **Contraste con el contador de ngrok**: diferencia del panel de ngrok frente a la suma del inspector; si el panel suma más que los GET, los `OPTIONS` cuentan.
7. Registrar todo en `docs/evidencias/f8/medicion-cuota-ngrok.md` (fecha, versión, método) **sin inventar**: lo que no se pueda medir consta como no medido.

Recuento desde el inspector (solo método, ruta y estado; la estructura JSON se confirma al ejecutar **[VERIFICAR]**):
```bash
py -3.13 -c "import json,urllib.request,collections as c;d=json.load(urllib.request.urlopen('http://127.0.0.1:4040/api/requests/http?limit=200'));n=c.Counter((r['request']['method'],r['request']['uri'].split('?')[0],r['response']['status_code']) for r in d['requests']);[print(k,v) for k,v in sorted(n.items())]"
```

### 5.2 Proyección y criterio de decisión
Fórmula: `peticiones por pestaña-día = U × (86 400 / intervalo en s)`; a 60 s son `1 440 × U`.

| U medido | 60 s: día / 4 días | 5 min: día / 4 días | 10 min: día / 4 días |
|---|---|---|---|
| 3 [ESTIMADO] | 4 320 / 17 280 | 864 / 3 456 | 432 / 1 728 |
| 6 [ESTIMADO] | 8 640 / 34 560 | 1 728 / 6 912 | 864 / 3 456 |

Son **ejemplos aritméticos**, no resultados. **[PROPUESTA]** de criterio: mantener **60 s** (enunciado §9) si el consumo de **una pestaña visible durante toda la ventana** no supera la **mitad de la cuota restante** al comenzar la ventana (descontados pruebas, ensayo y grabación); si no, subir a **5 min**, y a **10 min** solo si tampoco cabe. Una pestaña visible 24 h es el peor caso razonable; varias pestañas o varias personas lo multiplican, y la pausa con la pestaña oculta solo ayuda con las ocultas. **La persona estudiante decide el umbral y el valor final.**

### 5.3 Qué se haría según el resultado (todo requiere aprobación; nada se cambia ahora)
- Cabe a 60 s: se mantiene y se anota la medición.
- No cabe y los `OPTIONS` son la causa: opciones, de menor a mayor impacto: (a) subir el intervalo (solo configuración, republicar); (b) fijar `max_age` en CORS (toca `backend/`, **reabre la congelación**, las pruebas y las capturas; decisión expresa); (c) aceptar el riesgo documentándolo.
- Un cambio de intervalo exige recompilar con `--refresh-ms` y **volver a desplegar** (15 créditos de Netlify por despliegue).

## 6. Netlify: publicación con la CLI

F6 demostró que el arrastre de carpeta falla («Failed during stage 'building site'», `hugo: command not found`): **se usa la CLI con `--no-build`**, como en F6.
1. **Obtener la CLI sin tocar el proyecto**: instalarla en una carpeta temporal **fuera** del repositorio, con la misma versión de F6 (27.16.2, **[VERIFICAR]** que sigue disponible); `package.json` y `package-lock.json` del proyecto no cambian. Descargar un paquete requiere autorización (sección 10).
2. **Sesión**: `netlify login` lo hace **la persona estudiante** en su navegador (ticket de un solo uso). Claude no ve credenciales.
3. **Sitio**: identificarlo por nombre y URL (`observatorio-sismico`, `https://observatorio-sismico.netlify.app`) y pasar su **ID** explícito; **no** tocar los demás sitios de la cuenta.
4. **(Opcional, recomendado) despliegue de borrador** sin `--prod`: `netlify deploy --dir frontend/dist/publico-netlify-f7 --site <ID> --no-build` genera una URL de borrador que permite comprobar en un móvil la carga del fragmento de Three.js, MIME y `_redirects` **sin tocar producción**. Su origen no está en `API_CORS_ORIGINS` (**no se añade**): la API fallará por CORS, lo esperado; solo se verifica lo estático. **[VERIFICAR]** si cuenta créditos.
5. **Producción**:
```bash
netlify deploy --prod --dir frontend/dist/publico-netlify-f7 --site <ID de observatorio-sismico> --no-build
```
6. Comprobar en la URL real: `GET /` 200 con `<app-root>`, `config.json` publicado con la URL del túnel, `refreshMs` 60000 y `pausarSiOculta` (se compara su sha256 con el de la salida del script), el `main-*.js` nuevo servido, y **ninguna coincidencia de la clave** en los archivos publicados.
7. **Cerrar la sesión siempre**: `netlify logout` (como en F6) y borrar la carpeta temporal de la CLI; anotar el ID del nuevo despliegue.
- Coste: 15 créditos por despliegue de producción (300/mes gratuitos, `f6/procedimiento-ngrok-netlify.md`, consultado el 2026-11-08 **[ACTUALIZAR EN CIERRE]**).

## 7. Verificación externa (otro dispositivo, datos móviles)

Con ngrok abierto y la API sana. **La clave la escribe la persona estudiante**; no se comparte ni se captura.

| Comprobación | Esperado |
|---|---|
| Carga | La URL de Netlify muestra el formulario de clave; tras escribirla, «Datos al día» |
| **Panel** | Globo 3D (Three.js) que carga, gira y permite seleccionar un evento con su detalle; leyenda y HUD legibles; en móvil, sin solapes |
| **Alternativa 2D (Leaflet)** | Mapa 2D con eventos y teselas de OSM; con WebGL no disponible o fallo del globo, cae al 2D con aviso. Es la **evidencia pendiente** (README §8, C-03): se archiva aquí |
| **Análisis** | Gráficas, comparaciones y conclusiones cargan con los datos reales |
| **Eventos** | Tabla con filtros, orden, detalle y vista previa del globo |
| **EN VIVO** | Datos de la última ingesta; mapa, tabla y estadísticas coherentes con la API (mismo total) |
| **REPRODUCCIÓN** | Ejecución de replay (la de F6 daba 35 eventos actuales) separada de EN VIVO y etiquetada |
| Indicador de refresco | «Actualización automática cada 1 min» y aviso de pausa con la pestaña oculta |
| Estados de error | Con el túnel cerrado: «Sin conexión…» con la última lectura válida, nunca como actual; al reabrirlo, recuperación sola (≈ ≤ 30 s con la pestaña visible, mínimo tras fallo) |
| Clave incorrecta | Mensaje de error y sin datos |
| Consola y red | Sin errores CORS ni 404 de fragmentos; ningún secreto en la URL ni en `localStorage`/cookies |

Evidencias: capturas **sin** claves, URLs con tokens ni el inspector de ngrok; resultado en `docs/evidencias/f8/verificacion-publicacion-f7.md` (T036).

## 8. Vuelta atrás a F6

**Disparadores**: el globo no carga en dispositivos reales, errores CORS o 401 inexplicables, cuota de ngrok comprometida, regresión grave de F7 o plazo agotado.

**Antes de publicar (obligatorio)**: copia de seguridad de la carpeta F6 fuera de la ruta que reescribe el script, p. ej. `cp -r frontend/dist/publico-netlify frontend/dist/publico-netlify-f6-respaldo` (ambas ignoradas por Git), y comprobar que `config.json` y `main-V2B7K4H6.js` coinciden con lo publicado el 2026-11-08.

**Opción A (principal)**: volver a desplegar el build F6 guardado, con la CLI y sesión nueva:
```bash
netlify deploy --prod --dir frontend/dist/publico-netlify-f6-respaldo --site <ID de observatorio-sismico> --no-build
```
y `netlify logout`. Es el mismo código y la misma API/túnel que ya funcionaron: no requiere tocar backend, CORS ni `.env`.

**Opción B**: en el panel de Netlify, «Deploys» → despliegue `6af0cbc3bee7002e941af403` → «Publish deploy». **[VERIFICAR]** que sigue en la lista y que Netlify permite restaurarlo con la política vigente.

**Opción C**: reconstruir F6 desde `fd9e1a7` en una copia temporal fuera del repositorio (`git archive`) con `--refresh-ms 600000`, solo si A y B no están disponibles.

**Consecuencias de volver a F6**: la web ya no coincide con el vídeo ni con el README (describen F7): se documenta como excepción y se adapta el vídeo (CA-06/FR-021); el intervalo vuelve a 10 min. Tras la vuelta atrás se repiten las comprobaciones de conectividad (sección 4) y las de F6 de `f6/6.6-publicacion.txt`.

## 8 bis. Modo mantenimiento y tres despliegues conservados (T041)

**Objetivo**: poder alternar varias veces al día la web pública entre **MISSION CONTROL** (F7 completa) y **MANTENIMIENTO** (solo una pantalla de «Observatorio temporalmente fuera de servicio»), sin reconstruir ni volver a subir la aplicación cada vez, sin conectar GitHub, sin tocar el backend ni el CORS y sin apagar Docker ni ngrok.

### 8 bis.1 Los tres despliegues

| Estado | Contenido | Origen | Cómo se crea | ID del despliegue |
|---|---|---|---|---|
| **F6** (respaldo) | Panel de F5/F6, refresco 10 min | Despliegue `6af0cbc3bee7002e941af403` (2026-11-08) y copia local `frontend/dist/publico-netlify/` | Ya existe | `6af0cbc3…` |
| **F7** (Mission Control) | Aplicación F7 completa | `frontend/dist/publico-netlify-f7/` (sección 2) | `netlify deploy --prod …` (sección 6) | _(a anotar)_ |
| **Mantenimiento** | Una página estática; **sin Angular, Three.js ni consultas a la API** | `scripts/f8/mantenimiento/` (`index.html` y `_redirects`; **no se compila nada**) | `netlify deploy …` sin build (8 bis.3) | _(a anotar)_ |

Mantenimiento **no es una vuelta atrás**: es un estado más. La vuelta atrás a F6 (sección 8) sigue siendo la opción de recuperación ante un fallo de F7.

### 8 bis.2 La pantalla de mantenimiento
`scripts/f8/mantenimiento/index.html`: un solo archivo con HTML y CSS en línea, **sin JavaScript, sin recursos externos y sin llamadas a ninguna API**; no contiene claves, enlaces privados, nombres de servicios ni datos de infraestructura, ni fechas ni promesas de reapertura.
- Fondo azul oscuro `#0a1120` con un degradado cian muy suave, panel central con borde superior cian y un emblema SVG en línea (globo con ondas) como detalle, coherente con Mission Control.
- Etiqueta «OBSERVATORIO SÍSMICO», título grande **«Observatorio temporalmente fuera de servicio»** y una línea secundaria: «El panel no está disponible temporalmente.».
- Accesible: `lang="es"`, `<main>`, un único `<h1>`, mensaje secundario con `role="status"`, emblema oculto a los lectores de pantalla, contraste alto (texto 16,0:1, secundario 9,4:1 y cian 13,0:1 sobre el fondo [MEDIDO con la fórmula WCAG]), tamaños fluidos (`clamp`) y animación que respeta `prefers-reduced-motion`. `noindex` (no es una protección).
- `scripts/f8/mantenimiento/_redirects` contiene `/* /index.html 200`: **todas las rutas** del sitio muestran la pantalla con **HTTP 200** (una pantalla informativa, no un error) cuando ese despliegue está activo. Para evitar la petición al icono, el HTML declara `<link rel="icon" href="data:,">`.

### 8 bis.3 Creación de los dos despliegues que faltan (con autorización, junto a T035)
Orden propuesto **[PROPUESTA][VERIFICAR]**:
1. **F7 a producción** (sección 6): `netlify deploy --prod --dir frontend/dist/publico-netlify-f7 --site <ID> --no-build --message "F7 Mission Control"`.
2. **Mantenimiento como despliegue de borrador** (sin `--prod`, de modo que la producción siga en F7):
```bash
netlify deploy --dir scripts/f8/mantenimiento --site <ID de observatorio-sismico> --no-build --message "Mantenimiento"
```
   **[VERIFICAR]** que un borrador aparece en «Deploys» y se puede activar con «Publish deploy». Si no fuera así, alternativa: desplegarlo con `--prod`, comprobarlo y volver a publicar F7 desde el panel.
3. Anotar los IDs en la tabla de 8 bis.1 y la **etiqueta** (`--message`) de cada despliegue, para reconocerlos en el panel. Cerrar la sesión de la CLI (`netlify logout`).

### 8 bis.4 Comprobación previa obligatoria (antes de depender de la alternancia)
Con la sesión de Netlify de la persona estudiante, **sin cambiar nada** salvo lo indicado:
1. En «Deploys» siguen listados **F6 (`6af0cbc3…`), F7 y mantenimiento**, y cada uno ofrece **«Publish deploy»** [VERIFICAR].
2. **Política de conservación** de despliegues anteriores en el plan vigente [VERIFICAR; ACTUALIZAR EN CIERRE].
3. **Una prueba completa del ciclo**: F7 → mantenimiento → F7, comprobando en cada paso desde una ventana privada que la URL principal muestra lo esperado (título de la página, `config.json` de F7 con el mismo sha256 que el del build) y que **la URL nunca queda en un estado intermedio**.
4. **Bloqueo de publicación automática**: Netlify puede dejar «bloqueado» el despliegue publicado a mano y no publicar automáticamente los siguientes; **[VERIFICAR]** si un `netlify deploy --prod` posterior se publica o queda sin publicar; si queda bloqueado, hay que «Start auto publishing» (o publicar desde el panel) antes de volver a usar la CLI.
5. **Consumo de créditos** observado tras 1–2 cambios (8 bis.7).

### 8 bis.5 Cómo se alterna (procedimiento sencillo)
1. Netlify → **Sites** → `observatorio-sismico` → **Deploys**.
2. Localizar el despliegue por su etiqueta («F7 Mission Control» o «Mantenimiento»).
3. Abrirlo y pulsar **«Publish deploy»**. El cambio es atómico y se nota en segundos.
4. Comprobar en una ventana privada que `https://observatorio-sismico.netlify.app` muestra el estado deseado.

Qué ocurre:
- **Con mantenimiento activo**: la URL principal y **cualquier ruta** muestran solo la pantalla; no se carga Angular, Three.js ni el panel y no se hacen consultas a la API desde esa pantalla.
- **Al volver a publicar F7**: Mission Control vuelve y se conecta al backend si Docker y ngrok están operativos.
- **Pestañas abiertas**: un cambio de despliegue **no actualiza las pestañas ya abiertas**; hay que **recargarlas** (si aparece el contenido anterior, recarga forzada, `Ctrl+F5`). Una pestaña con F7 abierta **sigue consultando la API** (si el túnel está abierto) hasta que se recargue o se oculte (`pausarSiOculta`).

### 8 bis.6 Lo que este mecanismo NO es
- **«Publish deploy» no es un acceso privado.** Las URL permanentes de despliegues anteriores (`<id>--observatorio-sismico.netlify.app`) pueden seguir accesibles **[VERIFICAR]**; el código de F7 no se oculta. Los datos siguen protegidos solo por la clave de la API y esas URL no están en `API_CORS_ORIGINS`, de modo que **no pueden leer datos**.
- No apaga el backend ni el túnel: la API sigue accesible con la clave mientras ngrok esté abierto. Cerrarlo o rotar la clave son decisiones aparte.
- No es automático (lo hace la persona estudiante a mano) y depende de que Netlify esté disponible.

### 8 bis.7 Cuota de Netlify: pendiente de comprobar
**No se afirma que las alternancias sean gratuitas ni ilimitadas.** Los datos disponibles son los de F6 (300 créditos al mes, 15 créditos por despliegue de producción, 20 por GB; consultados el 2026-11-08) **[ACTUALIZAR EN CIERRE]**. Pendiente de comprobar en Netlify:
- si **«Publish deploy» de un despliegue existente consume créditos** y cuántos;
- si los despliegues de borrador consumen créditos;
- el **consumo ya acumulado** este mes (los intentos y despliegues de F6 pueden haber gastado parte).

Cálculo condicional **[ESTIMADO]**: crear F7 y mantenimiento son 2 despliegues (≈ 30 créditos, más 15 si se hace una prueba con borrador). **Si cada «Publish deploy» costara 15 créditos, 300 créditos solo darían ≈ 20 cambios al mes en total**, lo que **no soportaría «varias veces al día»**. Antes de usar la alternancia con frecuencia, se hacen 1–2 cambios, se lee el consumo en el panel y se decide el ritmo razonable.

### 8 bis.8 Ventana de evaluación del profesor (19/20 → 22 de noviembre, sin confirmar)
- **F7 permanece publicada y operativa durante toda la ventana**; antes de que empiece se deja F7 publicada y verificada (T036) y la comprobación del ciclo hecha.
- **No se activa mantenimiento durante la corrección**, salvo una incidencia que lo justifique; en ese caso conviene avisar al profesor. Una pantalla de mantenimiento durante la evaluación se interpretaría como un fallo.
- Se incorpora al checklist de T039: «F7 publicada (no mantenimiento) y verificada antes de la ventana; no alternar durante ella».
- Si el plan de Netlify permite **bloquear la publicación** del despliegue activo, podría usarse para fijar F7 durante la ventana **[VERIFICAR]**.

### 8 bis.9 Acceso local independiente del estado público
El estado público solo decide **qué sirve Netlify**. No afecta a: Docker, Kafka, PostgreSQL, el productor y el consumidor de USGS, la API en `127.0.0.1:8000`, el túnel de ngrok ni el servidor local de desarrollo `npm run start:local` en `localhost:4200` (que usa su propio proxy hacia `127.0.0.1:8000`). La persona estudiante puede seguir trabajando en local sin restricciones con cualquiera de los dos estados.

### 8 bis.10 Comprobaciones hechas y pendientes
- **Hechas en local, sin servicios ni red** (2026-11-11): estructura HTML válida (un `h1`, `lang`, `main`, sin `script`, sin enlaces ni recursos externos), contenido sin claves ni infraestructura, `_redirects` de una línea, previsualización en el navegador integrado a 1280×760 y 320×568 sin desbordamiento horizontal ni recursos de red, contrastes calculados.
- **Pendientes** (requieren Netlify): publicar los despliegues, la comprobación previa de 8 bis.4, el ciclo F7 ↔ mantenimiento, el comportamiento real del HTTP 200 y de `/*` en Netlify, el estado de los borradores y el consumo de créditos.

## 8 quater. Variante con Netlify Function: acceso público sin clave (T042–T043; **publicada el 2026-11-11 y verificada con reservas**)

**Objetivo**: cualquier visitante (incluido el profesor) abre `https://observatorio-sismico.netlify.app` y usa Panel, Análisis, Eventos, globo 3D, EN VIVO y REPRODUCCIÓN **sin formularios ni claves**. FastAPI sigue exigiendo la clave y `localhost:4200` conserva su proxy local.

### 8 quater.1 Cómo funciona
```
Navegador ──GET /api/eventos?…──▶ Netlify Function «api» ──GET + X-Observatorio-Clave──▶ ngrok ──▶ FastAPI (127.0.0.1:8000)
 (sin clave, mismo origen)         (clave y destino en variables privadas)                 (exige la clave, sin cambios)
```
- El panel usa `apiUrl` = su **propio origen** (`https://observatorio-sismico.netlify.app`): el `config.json` público **ya no contiene la URL del túnel ni clave alguna**. No se ha cambiado ni una línea de Angular: es el mismo mecanismo que el proxy local (`apiUrl: http://localhost:4200`).
- La función (`frontend/netlify/functions/api.mjs`, 7 KB, sin dependencias) solo atiende **`GET`** de **tres rutas exactas** (`/api/eventos`, `/api/estadisticas`, `/api/salud`), con los **parámetros** que acepta la API (`start`, `end`, `min_mag`, `country_id`, `limit`, `offset`, `mode`, `run`; por ruta), **sin repetir**, de ≤ 64 caracteres de `[A-Za-z0-9_.:+-]`; todo lo demás → 400/404/405 **sin llamar a la API**.
- **No es un proxy abierto**: el destino es **fijo** (`API_UPSTREAM_URL`, https, sin ruta, validado) y no depende de nada que envíe el visitante (ni Host, ni cabeceras, ni parámetros, ni redirecciones: `redirect: 'manual'`). No se reenvían cookies, `Authorization`, `Origin`, `Referer` ni la clave que pudiera enviar el visitante.
- **La clave** (`API_CLAVE_ACCESO`) se lee **solo** de la variable privada de Netlify y se añade en el servidor. Nunca está en el código, el build, el `config.json`, las respuestas (la función descarta todas las cabeceras de la API), los registros (solo escribe «el origen rechazó la clave» sin valores) ni en las herramientas de desarrollo del navegador.
- **Traducción de errores**: 200 → datos; 422/503 de la API → se reenvían (el panel ya los muestra); 401/403 del origen → **502** (el panel no pide clave al visitante); ngrok cerrado, 404 HTML, 3xx, 5xx, tipos inesperados, respuestas > 5 MB → 502/504 con un código genérico (**sin URL ni detalles**); sin variables válidas → 503.
- **Sin CORS**: la función no emite cabeceras `Access-Control-*`, así que ningún otro sitio web puede leerla desde un navegador. **Sin OPTIONS** en el túnel: la llamada a ngrok es de servidor a servidor.

### 8 quater.2 Qué se ha hecho y comprobado (local, 2026-11-11)
| Comprobación | Resultado |
|---|---|
| Pruebas (`frontend/tests/funcion-api.test.ts`, sin red) | **17 pasan**: rutas y métodos cerrados, parámetros validados, destino y cabeceras fijos, la clave no sale en respuestas, cabeceras ni logs, mapeo de errores, configuración inválida → 503, código fuente sin dominios ni claves |
| Suite completa del frontend | **493 pasan (476 + 17), 0 fallan** |
| `scripts/f8/preparar-netlify-funcion.sh` (build público de mismo origen, 60 s) | **OK**: sin URL de túnel, sin clave en el build ni en la función, `config.json` del repositorio restaurado (mismo hash) |
| `scripts/f8/probar_publico_local.mjs --autotest` (misma función + API **local** real, sin ngrok ni Netlify) | **OK, 15/15**: 200 en las tres rutas y en REPRODUCCIÓN, 422 reenviado, 405/404/400, la clave del visitante se ignora, sin CORS, **la API sin clave sigue dando 401** |
| Panel real en el navegador integrado contra ese servidor local | Sin formulario de clave; **204 eventos**, globo 3D, Análisis, Eventos y REPRODUCCIÓN (35 eventos) funcionan |
| Peticiones a la API por ciclo | **[MEDIDO local]** 3 GET (salud, eventos, estadísticas) y **0 OPTIONS** |

**Después, en producción (T043)**: ver `verificacion-funcion-netlify.md`. **La prueba local no detectó una incidencia real**: la primera publicación no enrutaba `/api/*` porque `config.path` se calculaba con `Object.keys(...)` y la CLI de Netlify lo lee por análisis estático; ahora es un literal y una prueba lo comprueba. **Sigue sin comprobarse**: otro dispositivo, registros de la función y que el valor de la variable secreta aparezca oculto en la interfaz de Netlify.

### 8 quater.3 Configurar las variables privadas (lo hace la persona estudiante; no se comparten secretos)
1. Netlify → sitio `observatorio-sismico` → **Project configuration → Environment variables → Add a variable**.
2. `API_UPSTREAM_URL` = origen del túnel (**solo** `https://<dominio>.ngrok-free.dev`, sin barra final ni ruta). Puede dejarse sin marcar como secreta.
3. `API_CLAVE_ACCESO` = el mismo valor que `API_CLAVE_ACCESO` del `.env` local (cópialo desde el `.env` al portapapeles; **no lo pegues en el chat ni en ningún archivo**). Márcala **«Contains secret values»** (Secrets controller) para que no vuelva a mostrarse.
4. Las variables deben estar disponibles **en tiempo de ejecución de las funciones** (en planes con ámbitos, incluir *Functions*). Las definidas en `netlify.toml` **no** llegan a las funciones: no se usa ese archivo.
5. Los cambios de variables pueden requerir **un nuevo despliegue** para aplicarse **[VERIFICAR]**.
6. Si se **rota la clave** de FastAPI, hay que actualizar también la variable de Netlify (y volver a desplegar).

### 8 quater.4 Compilación y despliegue manual (ejecutados el 2026-11-11: despliegues `6af4b7d3…` —sin enrutado— y `6af4b81f…` —vigente—)
```bash
bash scripts/f8/preparar-netlify-funcion.sh                      # build en frontend/dist/publico-netlify-f7-funcion; no publica nada
netlify deploy --prod --no-build --dir frontend/dist/publico-netlify-f7-funcion --functions frontend/netlify/functions --site <ID de observatorio-sismico> --message "F7 con funcion"
```
Sin GitHub, sin compilar en Netlify y sin dependencias nuevas. Los respaldos **no se tocan**: F7 anterior (`6af4a52d30a824e6ef9dead2`, carpeta `frontend/dist/publico-netlify-f7/`) y F6 (`6af0cbc3bee7002e941af403`, `data/respaldo/f6-publico-netlify-2026-11-08/`). Vuelta atrás: «Publish deploy» de `6af4a52d…` desde el panel o redesplegar su carpeta (sección 8). Si se vuelve a ese despliegue, el panel vuelve a pedir la clave. Al terminar: `netlify logout`.

### 8 quater.5 Límites, cuota y abuso
- **Netlify Functions** (documentación y API de la cuenta, 2026-11-11): ejecución síncrona ≤ 60 s y carga ≤ 6 MB (la función corta a los 8 s y a 5 MB); **125 000 invocaciones/mes** incluidas en esta cuenta (plan «Free», leído de la API de Netlify; **[VERIFICAR]** qué ocurre al superarlas). Con el refresco de 60 s una pestaña visible hace **3 invocaciones por ciclo = 4 320 al día [ESTIMADO]** (≈ 17 280 en 4 días).
- **ngrok** (cuota gratuita de 20 000 peticiones HTTP al mes): la función llama del lado del servidor, **sin OPTIONS**: **3 peticiones por ciclo [MEDIDO local]** frente a las 6 medidas en T036 con la llamada directa desde el navegador. **[ESTIMADO]** 4 320 al día por pestaña visible; **no se conoce el consumo real de la cuenta**.
- **Protección contra abuso**: validación estricta antes de llamar a la API (no consume cuota de ngrok con peticiones inválidas); **límite por visitante** en la propia función (60 peticiones por minuto por IP y dominio, `config.rateLimit`; en planes gratuitos Netlify agrega por dominio **e IP**, **no** hay un tope global); tiempo de espera de 8 s; la función no se puede usar contra otro destino.
- **Riesgo que no se elimina**: cualquiera puede llamar a la función (es la idea) y, por tanto, **los datos de lectura pasan a ser públicos** (son datos públicos de USGS) y un tercero con muchas IP podría **gastar la cuota de ngrok o de invocaciones**. No se añade arquitectura nueva (sin base de datos de contadores ni servicios externos). Medidas operativas: cerrar ngrok, retirar la variable y volver a desplegar, publicar el despliegue anterior o la pantalla de mantenimiento (T041).
- **No se cachea** la respuesta en la CDN: `end` y `start` cambian en cada petición del panel, así que no habría aciertos.
- **Compromiso de seguridad asumido y documentado**: la clave deja de ser una barrera para el visitante; sigue protegiendo el acceso **directo** a la API por ngrok y la cabecera nunca llega al navegador.

## 9. Seguridad

- **No exponer el proxy local ni el servidor de desarrollo**: el túnel solo reenvía al puerto 8000; nunca al 4200. `proxy.conf.mjs` y `config-local/` no entran en el build ni en Netlify. No se debilita ningún control del proxy.
- **Credenciales**: ni `.env`, ni authtoken de ngrok, ni sesión de Netlify, ni la clave de la API aparecen en repositorio, build, `config.json`, capturas, vídeo, logs, documentos o chat; el inspector de ngrok contiene la clave en cabeceras: no se muestra.
- **Servicios internos**: Kafka y PostgreSQL sin puertos publicados; no se abren ni se cambian. `/docs` sigue oculta.
- **Sin cambios de seguridad**: no se modifican ajustes de Windows, cortafuegos, CORS ni la clave sin autorización expresa. Si la clave se hubiera filtrado, se rota (decisión de la persona estudiante).
- **Datos**: el sitio es público pero solo ofrece datos reales de USGS de solo lectura tras la clave; los datos de replay y sintéticos permanecen separados de EN VIVO.
- **Escaneo**: `escaneo_secretos.sh` antes de publicar y la comprobación de la clave ausente del build tras compilar; revisión del historial de Git en T031.
- **Un tiempo a la vez**: definir → aprobar por escrito → ejecutar con autorización expresa → verificar. Nada se publica por inercia.

## 10. Acciones y autorizaciones

Ninguna se considera concedida por este documento. «Cada vez» = se pide de nuevo en cada ocasión.

| # | Acción | Efecto | Autorización necesaria |
|---|---|---|---|
| A1 | Aprobar esta estrategia **por escrito** | Habilita T035 | Persona estudiante |
| A2 | Leer estado de Docker y servicios (`docker compose ps`, `GET /api/salud` local) | Solo lectura | Confirmación |
| A3 | Recrear `api` si CORS/clave no son los esperados | Toca Docker y `.env` | **Autorización aparte** (como PA-3 de F6) y etiqueta de imagen previa |
| A4 | Compilar el build público con `preparar-netlify.sh` | Solo local; restaura `config.json` | Confirmación |
| A5 | Descargar la CLI de Netlify | Descarga externa | **Autorización expresa** |
| A6 | `netlify login` y `netlify logout` | Sesión de la persona estudiante | La hace la persona estudiante |
| A7 | Despliegue de borrador (opcional) | Servicio externo, créditos | **Autorización expresa de Netlify** |
| A8 | Despliegue de producción de F7 | Cambia la web pública | **Autorización expresa de Netlify, cada vez** |
| A9 | Abrir el túnel ngrok | Exposición de la API | **Autorización expresa de ngrok, cada vez** |
| A10 | Sesión de medición de cuota (sección 5) | Consume cuota de ngrok | Autorización de ngrok; límite de tiempo acordado |
| A11 | Verificación desde otro dispositivo (y la clave) | Interviene la persona estudiante | La hace la persona estudiante |
| A12 | Cerrar y reabrir el túnel (prueba de error y recuperación) | Interrumpe el servicio | Autorización de ngrok, cada vez |
| A13 | Cambiar el intervalo y republicar | Recompila y despliega | Aprobación del valor + A4/A8 |
| A14 | Vuelta atrás a F6 | Cambia la web pública | Autorización de Netlify, cada vez |
| A15 | Fijar `max_age` en CORS o cualquier cambio de `backend/` | Reabre la congelación | **Decisión expresa**; no prevista |
| A16 | Cambiar ajustes de Windows (suspensión) o reiniciar servicios | Configuración del sistema | Autorización expresa (T037) |
| A17 | Crear el despliegue de mantenimiento (borrador o producción) con la CLI | Servicio externo, créditos | **Autorización expresa de Netlify, cada vez** |
| A18 | Comprobar en el panel de Netlify que F6, F7 y mantenimiento se conservan y se pueden publicar | Sesión de la persona estudiante; solo lectura | La hace la persona estudiante (8 bis.4) |
| A19 | Prueba del ciclo F7 → mantenimiento → F7 antes de congelar | Cambia la web pública | **Autorización expresa**, cada vez |
| A20 | Cada alternancia posterior («Publish deploy») | Cambia la web pública | La decide y ejecuta la persona estudiante en el panel; Claude no la hace sin autorización expresa; **nunca durante la ventana de evaluación** salvo incidencia |
| A21 | Crear en Netlify las variables privadas `API_UPSTREAM_URL` y `API_CLAVE_ACCESO` (8 quater.3) | Configuración de Netlify | La hace **la persona estudiante** en la interfaz; **nunca se comparten con Claude** |
| A22 | Desplegar la versión con función (`--functions`) | Cambia la web pública | **Autorización expresa de Netlify, cada vez** |
| A23 | Abrir ngrok para verificar la versión con función (T043) | Exposición de la API | **Autorización expresa de ngrok, cada vez** |
| — | SC-010 (PA-10) y volúmenes temporales (PA-11) | Independientes de la publicación | **No concedidas**; fuera de esta estrategia |
| — | `commit` y `push` | Repositorio | Siempre manuales de la persona estudiante |

## 11. Secuencia propuesta y calendario [PROPUESTA]

Hoy mié 11 nov; entrega prevista jue 19 o vie 20 (sin confirmar). **Publicar con margen**, no el día de la entrega:

1. **Aprobación escrita** de esta estrategia (A1) y decisión provisional del intervalo.
2. T031 (secretos e historial) y reglas de la sección 2.1 → puertas OK.
3. Con tu autorización: arranque de servicios, ngrok, `verificar_publicacion.py` (conectividad y CORS) → build → copia de respaldo F6 → (borrador opcional) → despliegue de producción → verificación externa (T036) → **medición de cuota** (sección 5) → decisión definitiva del intervalo (con republicación si cambia).
4. **Modo mantenimiento (T041)**: crear el despliegue de mantenimiento, comprobar la conservación de los tres despliegues y probar un ciclo completo (8 bis.3 y 8 bis.4), dejando F7 publicada.
5. **Congelación** de la versión publicada → capturas → T040(a) → vídeo → T040(b) → entrega. En la ventana de evaluación, F7 publicada y sin alternar (8 bis.8).

Objetivo: tener publicada y verificada F7 **varios días antes** del 19/20, para disponer de margen si hace falta la vuelta atrás o un cambio de intervalo.

## 12. Riesgos abiertos

| Riesgo | Estado |
|---|---|
| Preflights `OPTIONS` duplican las peticiones por refresco | **Hipótesis sin medir**; se mide (sección 5) |
| Cuota mensual compartida y consumo en la ventana de 2–4 días | Por medir y proyectar; decisión de intervalo pendiente |
| Falso fallo del script por la comprobación de la cabecera en 1 archivo | Posible; solo se ve al compilar |
| CORS de la API en ejecución no verificado desde F6 | [VERIFICAR] antes de desplegar |
| Camino Netlify → ngrok con F7 no probado | Se prueba en T036 |
| Globo 3D/WebGL en dispositivos del profesor; evidencia del 2D sin archivar | Se verifica en la sección 7 |
| Teselas de OpenStreetMap (dependencia externa) | Aceptado, como en F6 |
| Límite de duración de sesión del túnel gratuito | [VERIFICAR] en la documentación de ngrok |
| Sitio de Netlify público (sin contraseña en plan gratuito) | Aceptado; protege la clave de la API |
| Vuelta atrás: la web dejaría de coincidir con vídeo y README | Documentado en la sección 8 |
| Reinicio de Windows, suspensión del PC, Docker o túnel caídos en la ventana | T037/T039; esta estrategia no los resuelve |
| Las cuotas y planes de ngrok y Netlify pueden haber cambiado | [ACTUALIZAR EN CIERRE] |
| Coste en créditos de «Publish deploy» y de los borradores; podría no soportar «varias veces al día» | Pendiente de comprobar (8 bis.7) |
| Conservación de despliegues antiguos, disponibilidad de «Publish deploy» y bloqueo de publicación automática | [VERIFICAR] (8 bis.4) |
| Mantenimiento activo durante la evaluación se interpretaría como un fallo | Regla: no alternar durante la ventana (8 bis.8, T039) |
| Pestañas con F7 abiertas siguen consultando la API tras activar mantenimiento | Aceptado; recargar o cerrar el túnel (decisión aparte) |
| «Publish deploy» no es privacidad: URL permanentes de despliegues anteriores | Aceptado; los datos los protege la clave y el CORS (8 bis.6) |
