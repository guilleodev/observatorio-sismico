# Procedimiento de publicación con ngrok y Netlify (F6 · 6.6 · T046)

Guion para **la persona estudiante**. Nada de esto se ha ejecutado: abrir un túnel, crear cuentas, introducir el authtoken y publicar en Netlify requieren su autorización (PA-8) y sus propias credenciales.
Todo se hace con los planes **gratuitos** (sin contratar nada). Las cuotas se consultaron el 2026-11-08 y pueden cambiar: ngrok gratuito = 20 000 peticiones/mes y 1 GB/mes de salida
([fuente](https://ngrok.com/docs/pricing-limits/free-plan-limits)); Netlify gratuito = 300 créditos/mes, 20 por GB y 15 por despliegue
([fuente](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)). Comprueba las páginas antes de publicar.

## Qué se publica y qué no

| Pieza | Dónde | Se expone |
|---|---|---|
| Angular (estático) | Netlify, HTTPS | sí: solo ficheros del build |
| API (FastAPI) | tu equipo, `127.0.0.1:8000` → túnel ngrok HTTPS | sí: solo `GET /api/eventos`, `/api/estadisticas`, `/api/salud` |
| Kafka, PostgreSQL | red interna de Docker | **no**: sin puertos publicados (verificado en `6.6-cors-local.txt`) |
| `/docs`, `/redoc`, `/openapi.json` | API | **ocultas (404)** con `API_DOCS=false` |

CORS **no es autenticación**: impide que otro sitio web lea la API desde el navegador de un visitante, pero cualquiera con la URL del túnel puede pedir los datos con otra herramienta. Son datos públicos de USGS de solo lectura.

## Antes de empezar (ya verificado en local)

`bash scripts/f6/escaneo_secretos.sh` (sin secretos), `bash scripts/f6/ejecutar.sh python /scripts6/verificar_cors_local.py` (CORS, rutas, gzip) y `bash scripts/f6/preparar-netlify.sh https://ejemplo.ngrok-free.app --restaurar-dist` (build).

## Pasos

1. **Cuenta y authtoken de ngrok.** Crea la cuenta tú, instala ngrok y registra el token **solo con su comando** (`ngrok config add-authtoken <TOKEN>`): queda en la configuración de ngrok de tu usuario, **fuera del repositorio**. Nunca lo pegues en el `.env`, en `config.json`, en Angular, en una evidencia ni en este chat.
2. **Dominio estático (opcional).** Si tu cuenta ofrece un dominio gratuito fijo, úsalo (`ngrok http --url=<dominio> 8000`): la URL no cambia entre sesiones y evitas repetir los pasos 5–7. Si no, la URL cambia cada vez (ver «Si la URL cambia»).
3. **Crea el sitio de Netlify primero** (vacío, sin publicar nada) para conocer su origen exacto: `https://<sitio>.netlify.app`.
4. **Fija el CORS en tu `.env` local** (no se versiona): `API_CORS_ORIGINS=https://<sitio>.netlify.app,http://localhost:4200` y `API_DOCS=false`. Sin comodines, sin barra final. Para aplicarlo hay que **recrear `api`** (`docker compose up -d --build --no-deps api`); es la autorización **PA-3** de 6.6 y solo afecta a la API. Antes de recrearla, etiqueta la imagen en uso como vuelta atrás con `bash scripts/f6/etiquetar_imagenes.sh` (sustituye la etiqueta `previo-f6-api` de 6.2 por la imagen vigente); si algo falla, `docker tag observatorio-backend:previo-f6-api observatorio-backend:latest` y `docker compose up -d --no-deps --no-build api`.
5. **Abre el túnel:** `ngrok http 8000`. Copia la URL HTTPS (`https://<dominio>.ngrok-free.app`). Deja la ventana abierta; el panel local de ngrok está en `http://127.0.0.1:4040`.
6. **Construye el panel público:** `bash scripts/f6/preparar-netlify.sh https://<dominio>.ngrok-free.app`. Escribe la URL en `config.json` **antes de compilar** (refresco de 10 min, suspensión con la pestaña oculta, `skipNgrokWarning`), compila y **restaura el original comprobando su hash**; el repositorio sigue con `http://127.0.0.1:8000` y 60 s.
7. **Publica** `frontend/dist/observatorio/browser` en Netlify (arrastrar la carpeta en «Deploys» o el CLI de Netlify). Cada despliegue de producción consume 15 créditos.
8. **Verifica** (otro dispositivo + script):
   `py -3.13 scripts/f6/verificar_publicacion.py --api https://<dominio>.ngrok-free.app --sitio https://<sitio>.netlify.app --inspector http://127.0.0.1:4040`
   Abre la URL de Netlify en el móvil con datos móviles (no tu Wi-Fi): debe mostrar el mapa, los eventos reales, filtros, tabla, gráficas y el estado del sistema.

## Los dos escenarios del túnel (§11 del profesor)

Con el refresco de 10 min el panel tarda **hasta 10 minutos** en notar un cambio por sí solo: en la demostración usa el botón **«Actualizar ahora»** tras cada paso.

| Escenario | Procedimiento | Esperado | Observado |
|---|---|---|---|
| Cerrar el túnel | Con el panel abierto y con datos, para ngrok (Ctrl+C). Pulsa «Actualizar ahora». Ejecuta `verificar_publicacion.py --api … --fase cerrada` | Estado «Sin conexión con el backend»; aviso «No se puede conectar con la API (red, túnel o CORS)… Se muestran los últimos datos válidos, leídos hace …»; el mapa y la tabla conservan los últimos datos; nunca se presentan como actuales | _(a rellenar)_ |
| Reabrir el túnel | `ngrok http 8000` (con dominio estático la URL es la misma; si no, ver abajo). Espera ≤ 30 s con la pestaña visible o pulsa «Actualizar ahora». `verificar_publicacion.py --fase reabierta` | Desaparece el aviso, aparece «Conexión recuperada» y los datos se actualizan solos | _(a rellenar)_ |

El resultado se anota en `docs/evidencias/f6/6.6-tunel.md` y `6.6-publicacion.txt` (T047).

## Si la URL cambia (sin dominio estático)

El panel publicado seguirá apuntando a la URL antigua y mostrará «Sin conexión». Repite los pasos 5–7 con la URL nueva (`preparar-netlify.sh` + nuevo despliegue); el CORS **no** cambia (depende del origen de Netlify, no del de ngrok).
Si cambia el nombre del sitio de Netlify, repite el paso 4 (CORS) con la nueva API recreada.

## Cuotas y qué ocurre al agotarlas

Con 10 min y gzip: 3 peticiones cada 10 min por pestaña visible (≈ 1 100 pestaña-horas/mes dentro de las 20 000 peticiones de ngrok). Al agotarlas el túnel deja de responder y el panel mostrará «Sin conexión». No hay cargo (plan gratuito) pero tampoco servicio hasta el mes siguiente.

## Para dejar de publicar

Cierra ngrok; en Netlify, «Site configuration → Delete site» o despublica; vuelve a `API_CORS_ORIGINS=http://localhost:4200` y `API_DOCS=true` si quieres la documentación local (recrea `api`). El `config.json` del repositorio no necesita cambios.

## Privacidad y acceso (decisión 2026-11-08, FR-041)

Datos fijados: sitio `https://observatorio-sismico.netlify.app/` (cuenta existente, proyecto independiente del portfolio) y dominio ngrok `grandpa-bunkbed-spree.ngrok-free.dev`.

### Netlify: limitación conocida
La cuenta gratuita de la persona estudiante muestra «Project configuration → Visitor access → Password Protection → Upgrade to unlock»: **no hay privacidad ni contraseña** y no se contratará ningún plan. Por tanto **el sitio es público**: lo comprueba una petición sin sesión (`6.6-privacidad.txt`: HTTP 200 con la página provisional). `noindex`, `robots.txt` o una URL difícil de adivinar NO son protección y no se usan como tal.
Consecuencias y decisión:
- El dashboard real **no se sube** a Netlify hasta autorización expresa.
- Lo que sí hace falta proteger es el **dato**: aunque alguien viera el panel (HTML/JS/CSS, sin datos ni secretos), la API del túnel no responde sin la clave de acceso.
- Cuando se autorice publicar, cualquiera con la URL verá el panel y un formulario «Clave de acceso»; solo quien tenga la clave verá datos. Si más adelante se quisiera que fuera abierto, bastaría quitar `API_CLAVE_ACCESO` y recrear `api`.

### API en el túnel: CORS no es autenticación → clave de acceso (opción A, implementada)
| Aspecto | Decisión |
|---|---|
| Qué rechaza | `/api/*` sin la cabecera `X-Observatorio-Clave` correcta → **401** `{error: no_autorizado}`, antes de validar parámetros (un `mode=otro` sin clave da 401, no 422) y en live y replay |
| Cómo se envía | Solo por cabecera (no por URL, cookie ni `Authorization`); comparación con `hmac.compare_digest` |
| Preflight CORS | Se contesta sin clave y sin datos; `x-observatorio-clave` figura en las cabeceras permitidas; el 401 lleva el origen CORS exacto para que el panel pueda leerlo |
| Generación y almacenamiento | 48 caracteres aleatorios (`/dev/urandom`) por `scripts/f6/preparar_api_publica.sh --aplicar`: van al `.env` local (ignorado por Git) y al portapapeles; nunca se imprimen, ni en Git, registros, URLs, `config.json` ni el build. La API exige >= 32 caracteres de `[A-Za-z0-9_-]` y no arranca con una clave débil |
| Panel | Pide la clave tras un 401, la entrega al servicio en **memoria** y la olvida si es rechazada; sin `localStorage`, `sessionStorage` ni cookies; hay que reescribirla al recargar. No reintenta en bucle mientras falta |
| Local | Sin `API_CLAVE_ACCESO` la API se comporta como siempre. Con ella activa, el panel local también la pide |
| Qué NO protege | Una persona con la clave tiene acceso completo (de lectura); no hay límite de intentos propio (clave de 48 caracteres ⇒ fuerza bruta inviable; además manda el límite de ngrok de 4 000 peticiones/minuto); el túnel solo se abre durante las sesiones |
Evidencias: `6.6-acceso-api.txt` (76 pruebas de backend, 8 de frontend, integración sobre API temporal, 18 mutaciones detectadas, panel en el navegador). Descartadas: Basic Auth de ngrok (complica el preflight; queda como complemento posible), OAuth de ngrok (documentación contradictoria sobre el plan gratuito y cookies de terceros), IP (de pago).

### Orden de T047 (cada paso con autorización expresa; nada se ha hecho todavía)
1. **PA-3** · `CONFIRMO_PUBLICAR_API=si bash scripts/f6/preparar_api_publica.sh --aplicar`: CORS definitivo (`https://observatorio-sismico.netlify.app,http://localhost:4200`), `API_DOCS=false`, clave (al portapapeles), recrea solo `api` y la verifica (401/200, preflight, docs 404, gzip). Vuelta atrás: `bash scripts/f6/preparar_api_publica.sh --deshacer`.
2. **Abrir el túnel** (autorización aparte): `ngrok http --url=https://grandpa-bunkbed-spree.ngrok-free.dev 8000` en tu PowerShell. Después `py -3.13 scripts/f6/verificar_publicacion.py --api https://grandpa-bunkbed-spree.ngrok-free.dev --sitio https://observatorio-sismico.netlify.app --inspector http://127.0.0.1:4040` (comprueba 401 sin clave a través del túnel y el resto con la clave leída del `.env`, sin imprimirla).
3. **Publicar el dashboard real** (autorización aparte): el build ya está preparado y sin publicar en `frontend/dist/publico-netlify` (URL de ngrok, refresco de 10 minutos, pausa con la pestaña oculta, actualización manual; sin clave). En Netlify: Deploys → arrastrar esa carpeta.
4. **Escenarios del túnel** (cerrar y reabrir ngrok) con el panel abierto: tabla de este documento.

## Resultado real de T047 (2026-11-08) y lecciones para repetir la publicación
- **Publicar con el CLI y sin build** es lo fiable en esta cuenta: arrastrar la carpeta en Deploys falló dos veces ejecutando Hugo (origen `api`; sitio sin repositorio). Procedimiento: `npm install netlify-cli` en una carpeta fuera del proyecto → `netlify login` (autorizas en el navegador) → `netlify sites:list --json` (buscar `observatorio-sismico`, sin repo) → `netlify deploy --prod --dir frontend/dist/publico-netlify --site <ID> --no-build` → `netlify logout`.
- **ngrok**: el agente debe tener la versión mínima de la cuenta (3.28.0 en 2026-11); `winget` instala la 3.3.1: ejecutar `ngrok update`. Comando del túnel: `ngrok http --url=https://grandpa-bunkbed-spree.ngrok-free.dev 8000` (la URL con `https://`). El dominio es `grandpa-…`, no `granada-…`.
- **Clave**: para ver datos en el panel hay que escribirla (está en `.env` como `API_CLAVE_ACCESO`; `preparar_api_publica.sh --aplicar` la copia al portapapeles solo la primera vez). Nunca se imprime.
- **Estado final dejado**: ngrok CERRADO; dashboard publicado; API con protección activa. Para una demostración: abrir ngrok con el comando anterior y abrir `https://observatorio-sismico.netlify.app`; al terminar, cerrar ngrok (Ctrl+C).
