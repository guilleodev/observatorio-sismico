# Observatorio de actividad sísmica

Proyecto académico de Sistemas de Big Data. Arquitectura: productor Python → Apache Kafka → consumidor Python →
PostgreSQL → API FastAPI → mapa Angular/Leaflet, en cinco servicios de Docker Compose.

**Estado:** fase F6 (replay, pruebas, mediciones y despliegue) técnicamente cerrada; pendientes la revisión humana y el commit `[F6]`, y las reservas listadas en
[`docs/evidencias/f6/resultados.md`](docs/evidencias/f6/resultados.md) (SC-010 de F3 de más de 24 h, T063, lector de pantalla real, otros navegadores y la recuperación de un hueco real de USGS). F3, F4 y F5 ya están commiteadas. Resultados por criterio de éxito en
[`docs/evidencias/f5/resultados.md`](docs/evidencias/f5/resultados.md) (F4 en [`docs/evidencias/f4/resultados.md`](docs/evidencias/f4/resultados.md)). El MVP de la fase F2 (un evento sintético que recorría todo el circuito) está
**retirado del sistema** (paso 3.1) y se conserva en Git (commit `0a56f65`), en `docs/evidencias/mvp/` y en el esquema
archivado `sintetico` de PostgreSQL, que ningún componente lee. El servicio `producer` consulta el feed de USGS cada 60 s, registra las consultas, conserva la respuesta original y publica en
Kafka solo las versiones nuevas o revisadas (con `INGESTA_PUBLICAR=true` en el `.env`; el valor por defecto `false` es el modo seco, sin publicar). El consumidor
valida cada evento, **le asigna el país por pertenencia al polígono**, guarda el historial de versiones y el estado actual, y manda a cuarentena lo no sísmico o no tratable. La API
sirve los terremotos con `mode: "live"` (24 h por defecto, o el periodo y los filtros pedidos), `country_id`/`country_name` reales (o `null` = «Sin país asignado») y `last_ingestion` (última consulta correcta a USGS);
además calcula estadísticas, la comparación con la media de 2025 y el estado de la ingesta, que el panel Angular muestra con mapa, tabla y gráficas.

Documentación de trabajo: [`docs/HOJA-DE-RUTA.md`](docs/HOJA-DE-RUTA.md), [`specs/`](specs/) y la constitución del
proyecto. Requisitos originales en [`docs/referencias/`](docs/referencias/).

## Requisitos

- Docker Desktop (Docker Compose v2) en marcha.
- Node.js 24 y npm (para el panel y las pruebas del frontend).
- Solo para publicar (opcional): una cuenta gratuita de ngrok y otra de Netlify (ver «Publicación»). Para ejecutar y defender el sistema en local no hacen falta.
- Conexión a Internet en el primer arranque (imágenes, dependencias de Python y descarga de USGS).

## Arranque

1. Crear el archivo de entorno y cambiar la contraseña (el `.env` real no se versiona):

   ```bash
   cp .env.example .env
   ```

   `INGESTA_PUBLICAR` vale `false` por defecto (instalación nueva = modo seco: el productor consulta y registra, pero no publica en
   Kafka). Para ingerir y publicar datos reales, ponerlo a `true` en el `.env` local.

2. Construir la imagen y levantar primero la base de datos y Kafka (los cinco servicios completos se levantan en el paso 4, cuando el catálogo ya está cargado: el consumidor no pasa a `healthy` hasta entonces, y `up --wait` con él
   fallaría en una instalación nueva):

   ```bash
   docker compose up --build -d --wait postgres kafka
   ```

3. En una instalación nueva PostgreSQL ejecuta solo `sql/001`–`004` al crear el volumen y este paso solo exige cargar el catálogo y el histórico. Si el volumen ya existía, aplicar a mano `001_esquema_live.sql`, `002_esquema_f3.sql`, `003_esquema_f4.sql` y `004_esquema_f6.sql` (los scripts de `sql/` solo
   se ejecutan al crear el volumen; son idempotentes y el comando no borra nada):

   ```bash
   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/001_esquema_live.sql -f /docker-entrypoint-initdb.d/002_esquema_f3.sql -f /docker-entrypoint-initdb.d/003_esquema_f4.sql -f /docker-entrypoint-initdb.d/004_esquema_f6.sql'
   ```

   Después, cargar el catálogo de países en la dimensión `geo` (una vez; el consumidor no procesa eventos hasta que el catálogo montado coincida con la base):

   ```bash
   docker compose run --rm --no-deps -v "$PWD/frontend/public/datos/paises.geojson:/datos/paises.geojson:ro" -e CATALOGO_PATH=/datos/paises.geojson producer python -m observatorio.geo.catalogo
   ```

   Después, cargar el histórico de 2025 (una vez; ver «Histórico de 2025 (F4)», ≈ 20 s y 13 peticiones a USGS).

4. Levantar los cinco servicios y comprobarlos (solo la API se publica en el equipo, `127.0.0.1:8000`; Kafka y PostgreSQL quedan internos):

   ```bash
   docker compose up -d --wait
   docker compose ps
   ```

5. Comprobar la API:

   ```bash
   curl http://127.0.0.1:8000/api/salud
   curl http://127.0.0.1:8000/api/eventos
   ```

6. Ver el panel (`frontend/public/config.json`: `mode: "api"`; con `mode: "demo"` se ve el ejemplo estático):

   ```bash
   cd frontend
   npm start
   ```

   Abrir `http://localhost:4200`.

## Datos y modos

- La API y el consumidor solo admiten los modos del contrato del profesor: `live` y `replay`. El consumidor procesa solo
  `live`; cualquier otro mensaje se descarta con motivo en el registro. La reproducción (`replay`) tiene su
  propio topic (`terremotos.replay`), grupo (`consumidor-replay`) y esquema (`replay`, `sql/004_esquema_f6.sql`); ver «Reproducción histórica».
- Los datos en tiempo real viven en el esquema `live` (`sql/001_esquema_live.sql` y `sql/002_esquema_f3.sql`), la dimensión geográfica en `geo`, el histórico de 2025 en `historico` (`sql/003_esquema_f4.sql`) y las reproducciones en `replay` (`sql/004_esquema_f6.sql`): almacenes separados, sin claves foráneas entre ellos y con `CHECK` de modo y fuente.
- `sql/mvp/` y `scripts/mvp/` son material histórico del MVP: no se ejecutan ni se mantienen.

## Geografía (F4)

- **Catálogo:** `frontend/public/datos/paises.geojson` (Natural Earth 1:110 M entregado, WGS84, 177 entidades, `ADM0_A3` único) se monta de **solo lectura** en el consumidor y no se modifica.
  `geo.catalogo` guarda su huella `sha256` y `geo.pais` una fila por entidad. `USA` y `SDN` traen geometrías inválidas: se reparan solo en memoria.
- **Regla** (`docs/evidencias/f4/regla-geografica.md`): un punto cubierto por un solo polígono recibe ese país (`interior` o `frontera`); por varios, el de menor `ADM0_A3` (`varias`);
  por ninguno, **«Sin país asignado»** (`country_id` nulo, `sin_pais`). Nunca se asigna el país más cercano ni se usa el texto `place`. Se aplica a los eventos nuevos, a las revisiones
  (el país sigue a las coordenadas de la versión vigente) y a los ya almacenados:

  ```bash
  docker compose run --rm --no-deps -v "$PWD/frontend/public/datos/paises.geojson:/datos/paises.geojson:ro" -e CATALOGO_PATH=/datos/paises.geojson producer python -m observatorio.geo.retroactivo
  ```

## Histórico de 2025 (F4)

Terremotos de USGS de 2025 (mundo, magnitud ≥ 4, tipo `earthquake`) en 12 tramos mensuales UTC, en el esquema **`historico`**, aislado de `live` y de la API. Se carga directamente en
PostgreSQL (sin Kafka), una sola vez; repetir la orden no consulta a USGS y reanuda un tramo interrumpido. Cada respuesta original se guarda comprimida en `historico.archivo` y se
exporta a `data/historico/` (ignorada por Git) con su `sha256` en `SHA256SUMS`:

```bash
docker compose build
mkdir -p data/historico
docker compose run --rm --no-deps -v "$PWD/frontend/public/datos/paises.geojson:/datos/paises.geojson:ro" -v "$PWD/data/historico:/exportacion" -e CATALOGO_PATH=/datos/paises.geojson producer python -m observatorio.historico.cargar
docker compose run --rm --no-deps producer python -m observatorio.historico.cargar --solo-recuento   # solo `count` por mes, sin descargar ni escribir
```

Variables (opcionales, ver `.env.example`): `HISTORICO_ANIO`, `HISTORICO_MAG_MIN`, `HISTORICO_LIMITE` (subdivide un tramo que alcance ese número), `HISTORICO_TIMEOUT_S`,
`HISTORICO_MAX_REINTENTOS`, `HISTORICO_EXPORT_DIR`. Verificación y trazabilidad: `scripts/f4/verificar_historico.py` y `scripts/f4/trazabilidad_historico.py`.

## Comparación entre ventanas (F4)

`sql/consultas/comparacion.sql` contiene las consultas de referencia (los endpoints son de F5): recuento reciente (`live.evento_actual`, sin retirados) frente a la media diaria del periodo
histórico (total / días, **incluyendo los días sin eventos**), con ámbito global, un país o «sin país», umbral ≥ 4 en ambos periodos, mediana diaria, variación «no definida» si la media es 0
y la marca `periodo_reciente_incompleto` (hueco pendiente, ventana fuera de la cobertura en vivo o aún abierta). `scripts/f4/comparacion.py` las ejecuta y calcula la variación; no mezclan
`live`, `historico` ni `sintetico`. Sesgos: el histórico es la instantánea revisada y el reciente es preliminar; la media anual está inflada por réplicas.

## Recuperación de huecos de ingesta (F4)

El productor anota en `live.hueco` un intervalo cuando pasó más de 24 h − `HUECO_MARGEN_S` (6 h por defecto) desde la última consulta correcta. La recuperación es **a demanda** y usa el canal real
(`source = usgs-fdsn-recuperacion`), omitiendo lo ya guardado:

```bash
docker compose run --rm --no-deps producer python -m observatorio.recuperacion.recuperar --listar    # huecos pendientes
docker compose run --rm --no-deps producer python -m observatorio.recuperacion.recuperar --simular   # cuenta lo que publicaría
docker compose run --rm --no-deps producer python -m observatorio.recuperacion.recuperar             # recupera
```

Procedimiento y límites: [`docs/evidencias/f4/procedimiento-hueco.md`](docs/evidencias/f4/procedimiento-hueco.md). La recuperación solo se ha probado con un catálogo simulado, no con un hueco real.

## API y dashboard (F5)

**Endpoints** (solo `GET`/`OPTIONS`; contrato completo en [`specs/004-api-dashboard/contracts/api-f5.md`](specs/004-api-dashboard/contracts/api-f5.md), sobre `CONTRATO-API.md`):

| Endpoint | Qué devuelve |
|---|---|
| `GET /api/eventos` | FeatureCollection de `live` (24 h por defecto). Filtros `start` (inclusivo), `end` (exclusivo), `min_mag` y `country_id` (`sin_pais` = «Sin país asignado»); paginación `limit`/`offset` (máximo 5 000) y `metadata` con `total`, `next_offset`, `truncated`, `period`, `coverage` y `sin_magnitud` |
| `GET /api/estadisticas` | Con los mismos filtros (sin paginación): `por_hora` (horas UTC con ceros; se omite con su motivo si supera 744 casillas), `por_pais`, `magnitud`, `profundidad` y `comparacion` con la media diaria de 2025 |
| `GET /api/salud` | `status`, `database`, `last_ingestion`, `generated`, `ingestion_age_s`, `stale` (umbral `INGESTA_OBSOLETA_S`), `gaps_pending` y `live_since` |

Un parámetro inválido da **422** (`{error: "parametro_invalido", detail}`) y una base inalcanzable o una consulta demasiado lenta da **503** (`base_de_datos_no_disponible`): nunca se recorta en silencio ni se devuelve una lista vacía. Cada petición lee en una
transacción de solo lectura `REPEATABLE READ`. Solo `api/comparacion.py` lee `historico.evento` (agregados, para comparar con 2025); nada lee `sintetico`.

**Variables nuevas** (`.env.example`): `API_MAX_EVENTOS=5000`, `API_MAX_VENTANA_HORAS=744`, `INGESTA_OBSOLETA_S=300` (5 ciclos del productor, medido en 60 s), `API_STATEMENT_TIMEOUT_S=10` y `API_MARGEN_PUBLICACION_S=900`.
Tras cambiarlas, `docker compose up -d --build --no-deps api` recrea solo la API.

**Panel** (`frontend/src/app/`, extiende el frontend entregado sin sustituirlo): filtros de periodo UTC, magnitud mínima y país; mapa Leaflet, tabla ordenable y con búsqueda, cuatro gráficas SVG propias (hora UTC, país, magnitud y profundidad, cada una con su tabla de texto),
tarjeta de comparación con 2025 y panel de estado con avisos (sin conexión, filtros rechazados, datos desactualizados, sin eventos, resultados truncados, huecos). Mapa, tabla, gráficas y comparación salen de una única lectura con el mismo periodo resuelto.
Con `mode: "demo"` en `frontend/public/config.json` se ve el ejemplo estático, sin llamadas a la API.

**Reservas que el panel muestra siempre:** el feed reciente no cubre M 4,0–4,5 fuera de EE. UU. como el histórico, por lo que una variación a M ≥ 4 no demuestra un cambio real de actividad (use M ≥ 4,5); lo reciente es preliminar y la cobertura en vivo es corta.
Esto describe lo observado: no es una predicción ni una evaluación de riesgo.

## Reproducción histórica (F6)

Envía por Kafka una selección de eventos reales de 2025 (leídos solo de `historico.evento`) más seis casos controlados (ids `replay-ctl-…`, solo en `replay`), a la velocidad configurada, para demostrar el flujo sin esperar a eventos nuevos.
Un productor bajo demanda (no es un servicio permanente) publica en `terremotos.replay` y un consumidor efímero con `--destino replay` guarda en el esquema `replay`; el consumidor de `live` nunca lee ese topic. Guion completo: [`docs/evidencias/f6/reproduccion-historica.md`](docs/evidencias/f6/reproduccion-historica.md).

```bash
docker compose run --rm --no-deps producer python -m observatorio.replay.reproducir --solo-plan            # muestra la secuencia; no publica ni registra nada
docker compose run --rm --no-deps consumer python -m observatorio.consumer.main --destino replay &       # consumidor efímero (termina solo tras REPLAY_ESPERA_FINAL_S sin mensajes)
sleep 8; docker compose run --rm --no-deps producer python -m observatorio.replay.reproducir --run r-demo   # ≈ 76 s con REPLAY_INTERVALO_S=2
```

La API sirve esos datos con `GET /api/eventos?mode=replay[&run=r-demo]` y el panel las muestra con el selector **REPRODUCCIÓN** (etiqueta visible en mapa, tabla, gráficas y estado). Las fechas originales se conservan (2025): el periodo por defecto es el de la ejecución, no «últimas 24 h».
Variables: `KAFKA_TOPIC_REPLAY`, `KAFKA_CONSUMER_GROUP_REPLAY`, `REPLAY_EVENTOS`, `REPLAY_INTERVALO_S`, `REPLAY_ESPERA_FINAL_S`, `REPLAY_ESPERA_MAX_S`.

## Publicación: ngrok y Netlify (F6)

La API corre en tu equipo y se publica por un túnel de ngrok; el panel Angular, en Netlify. **Sin túnel no hay datos, y el panel debe mostrarlo con claridad.** La API publicada exige una clave de acceso en la cabecera
`X-Observatorio-Clave` (`API_CLAVE_ACCESO` en el `.env` local, ≥ 32 caracteres, nunca en Git ni en la URL ni en `config.json`; el panel la pide y la guarda solo en memoria), CORS con los orígenes exactos (`API_CORS_ORIGINS`) y `API_DOCS=false`.
El sitio de Netlify es público (sus ficheros son públicos; los datos no). Procedimiento paso a paso y lecciones aprendidas: [`docs/evidencias/f6/procedimiento-ngrok-netlify.md`](docs/evidencias/f6/procedimiento-ngrok-netlify.md); contraseña de PostgreSQL:
[`procedimiento-cambio-password-postgres.md`](docs/evidencias/f6/procedimiento-cambio-password-postgres.md). Comprobaciones previas sin publicar: `bash scripts/f6/escaneo_secretos.sh`. Para una demostración: `docker compose up -d --wait`, abrir el túnel
(`ngrok http --url=https://<dominio>.ngrok-free.dev 8000`) y abrir la URL de Netlify; al terminar, cerrar el túnel. Guion de defensa: [`docs/evidencias/f6/procedimiento-defensa.md`](docs/evidencias/f6/procedimiento-defensa.md).

## Parada, recuperación y persistencia (F6)

Los volúmenes `pgdata` (PostgreSQL) y `kafkadata` (mensajes y offsets) sobreviven a `stop`, a `down` sin `-v` y a un reinicio del equipo; los contenedores tienen `restart: unless-stopped`. **Nunca** uses `down -v`, `docker volume rm` ni `docker system prune --volumes`: borran los datos.
Si un servicio cae: `docker compose start <servicio>` (el consumidor drena el lag al volver y no duplica nada: confirma el offset tras guardar y las escrituras son idempotentes por `(event_id, updated)`). Comprobación de estado de solo lectura:
`bash scripts/f6/invariantes.sh <etiqueta>` (lag, reconciliación, offsets duplicados, huellas, contenedores y volúmenes). Ensayos reales de parada/arranque de los cinco servicios y estabilidad de 60 min: `docs/evidencias/f6/6.8-*`.
Los huecos de ingesta se recuperan a demanda (ver «Recuperación de huecos»).

## Entorno limpio paralelo (F6)

Para comprobar que el README basta desde cero **sin tocar el sistema real** se usa otro proyecto de Compose con su propia red, imagen y volúmenes (se identifica por `-p`, de modo que no coincide con `observatorio_*`). Con un archivo de entorno propio
(contraseña aparte, `API_PUERTO=8010`, `BACKEND_IMAGE=observatorio-backend-limpio`, `INGESTA_PUBLICAR=false`):

```bash
docker compose -p observatorio_limpio --env-file ENTORNO_LIMPIO.env up --build -d --wait postgres kafka
```

Los pasos 3 y 4 de «Arranque» se ejecutan igual anteponiendo `-p observatorio_limpio --env-file ENTORNO_LIMPIO.env` (y con `-v` a otra carpeta de exportación en el histórico, para no tocar `data/historico`). Resultado medido: `docs/evidencias/f6/6.9-entorno-limpio.txt`. Bajarlo sin `-v` conserva sus volúmenes; eliminarlos requiere autorización expresa.

## Mapa de evidencias

| Qué | Dónde |
|---|---|
| Resultados por criterio (F6) y reservas | `docs/evidencias/f6/resultados.md` |
| Lista final de la Guía (13 puntos) | `docs/evidencias/f6/lista-final.md` |
| Replay, velocidad, identidad y separación | `6.1-*`, `6.2-*` |
| Pruebas de aceptación del profesor (§11) | `6.3-aceptacion.md`, `6.3-matrices.txt` |
| Mediciones, complejidad y costes | `6.4-mediciones.txt`, `6.5-comparaciones.txt`, `complejidad-costes.md` |
| ngrok, Netlify y acceso a la API | `6.6-*`, `procedimiento-ngrok-netlify.md` |
| Accesibilidad, responsive y compatibilidad | `6.7-*`, `guion-accesibilidad.md` |
| Estabilidad, recuperación y persistencia | `6.8-*` |
| Entorno limpio, regresión final y aislamiento | `6.9-*`, `aislamiento.txt` |
| Fases anteriores | `docs/evidencias/f3/`, `f4/`, `f5/` (cada una con su `resultados.md`) |

## Pruebas

Las pruebas están en `backend/tests/unit/` (Python 3.13). Las de PostgreSQL se ejecutan solo si existe `POSTGRES_HOST` y
corren en transacciones que se revierten (las de comparación, en una base temporal que se elimina): no dejan datos en las tablas definitivas.
`scripts/f4/pruebas.sh`, `scripts/f5/ejecutar.sh <comando>` y `scripts/f6/ejecutar.sh <comando>` las ejecutan en un contenedor temporal de la red de Compose, sin tocar los servicios (964 pruebas de backend en la regresión final de F6, con Kafka real temporal: `F6_KAFKA=1 scripts/f6/ejecutar.sh "python -m pytest -q"`). Resultados en `docs/evidencias/`.

La lógica pura del frontend (filtros, API, tabla, gráficas, comparación, estado) se prueba con el ejecutor de Node 24, sin dependencias nuevas (130 pruebas en la regresión final), y el panel se comprueba en el navegador:

```bash
cd frontend
node --test tests/*.test.ts
npm run build
```

Aislamiento e invariantes de solo lectura (`live`/`historico`/`sintetico`, puertos, huellas, archivos que no deben cambiar): `scripts/f6/aislamiento_final.sh` (el de F5 sigue disponible). Mediciones de F5: `scripts/f5/escala_57.py` (planes con y sin índices en una base temporal)
y `scripts/f5/tiempos_57.py` (tiempos HTTP); sus resultados, en `docs/evidencias/f5/`.

## Parada

```bash
docker compose stop      # conserva contenedores y datos
docker compose down      # elimina contenedores y red; conserva los volúmenes de PostgreSQL y de Kafka (mensajes y offsets). NO añadas -v
```
