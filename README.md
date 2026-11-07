# Observatorio de actividad sísmica

Proyecto académico de Sistemas de Big Data. Arquitectura: productor Python → Apache Kafka → consumidor Python →
PostgreSQL → API FastAPI → mapa Angular/Leaflet, en cinco servicios de Docker Compose.

**Estado:** fase F4 (geografía e histórico) técnicamente cerrada; pendiente la revisión humana y el commit `[F4]`. Resultados por criterio de éxito en
[`docs/evidencias/f4/resultados.md`](docs/evidencias/f4/resultados.md). El MVP de la fase F2 (un evento sintético que recorría todo el circuito) está
**retirado del sistema** (paso 3.1) y se conserva en Git (commit `0a56f65`), en `docs/evidencias/mvp/` y en el esquema
archivado `sintetico` de PostgreSQL, que ningún componente lee. El servicio `producer` consulta el feed de USGS cada 60 s, registra las consultas, conserva la respuesta original y publica en
Kafka solo las versiones nuevas o revisadas (con `INGESTA_PUBLICAR=true` en el `.env`; el valor por defecto `false` es el modo seco, sin publicar). El consumidor
valida cada evento, **le asigna el país por pertenencia al polígono**, guarda el historial de versiones y el estado actual, y manda a cuarentena lo no sísmico o no tratable. La API
sirve los terremotos de las últimas 24 h con `mode: "live"`, `country_id`/`country_name` reales (o `null` = «Sin país asignado») y `last_ingestion` (última consulta correcta a USGS).

Documentación de trabajo: [`docs/HOJA-DE-RUTA.md`](docs/HOJA-DE-RUTA.md), [`specs/`](specs/) y la constitución del
proyecto. Requisitos originales en [`docs/referencias/`](docs/referencias/).

## Requisitos

- Docker Desktop (Docker Compose v2) en marcha.
- Node.js y npm (solo para el mapa).

## Arranque

1. Crear el archivo de entorno y cambiar la contraseña (el `.env` real no se versiona):

   ```bash
   cp .env.example .env
   ```

   `INGESTA_PUBLICAR` vale `false` por defecto (instalación nueva = modo seco: el productor consulta y registra, pero no publica en
   Kafka). Para ingerir y publicar datos reales, ponerlo a `true` en el `.env` local.

2. Levantar los cinco servicios:

   ```bash
   docker compose up --build -d --wait
   docker compose ps
   ```

   Solo la API se publica en el equipo (`127.0.0.1:8000`); Kafka y PostgreSQL quedan internos.

3. Si el volumen de PostgreSQL ya existía, aplicar a mano los esquemas `001_esquema_live.sql`, `002_esquema_f3.sql` y `003_esquema_f4.sql` (los scripts de `sql/` solo
   se ejecutan al crear el volumen; son idempotentes y el comando no borra nada):

   ```bash
   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/001_esquema_live.sql -f /docker-entrypoint-initdb.d/002_esquema_f3.sql -f /docker-entrypoint-initdb.d/003_esquema_f4.sql'
   ```

   Después, cargar el catálogo de países en la dimensión `geo` (una vez; el consumidor no procesa eventos hasta que el catálogo montado coincida con la base):

   ```bash
   docker compose run --rm --no-deps -v "$PWD/frontend/public/datos/paises.geojson:/datos/paises.geojson:ro" -e CATALOGO_PATH=/datos/paises.geojson producer python -m observatorio.geo.catalogo
   ```

4. Comprobar la API:

   ```bash
   curl http://127.0.0.1:8000/api/salud
   curl http://127.0.0.1:8000/api/eventos
   ```

5. Ver el mapa (`frontend/public/config.json`: `mode: "api"`; con `mode: "demo"` se ve el ejemplo estático):

   ```bash
   cd frontend
   npm start
   ```

   Abrir `http://localhost:4200`.

## Datos y modos

- La API y el consumidor solo admiten los modos del contrato del profesor: `live` y `replay`. El consumidor procesa solo
  `live`; cualquier otro mensaje se descarta con motivo en el registro. La reproducción (`replay`) llegará en F6 con su
  propio topic y esquema.
- Los datos en tiempo real viven en el esquema `live` (`sql/001_esquema_live.sql` y `sql/002_esquema_f3.sql`), la dimensión geográfica en `geo` y el histórico de 2025 en `historico` (`sql/003_esquema_f4.sql`): almacenes separados.
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

## Pruebas

Las pruebas están en `backend/tests/unit/` (Python 3.13). Las de PostgreSQL se ejecutan solo si existe `POSTGRES_HOST` y
corren en transacciones que se revierten (las de comparación, en una base temporal que se elimina): no dejan datos en las tablas definitivas.
`scripts/f4/pruebas.sh` las ejecuta en un contenedor temporal de la red de Compose, sin tocar los servicios. Resultados en `docs/evidencias/`.

## Parada

```bash
docker compose stop      # conserva contenedores y datos
docker compose down      # elimina contenedores y red; conserva los volúmenes de PostgreSQL y de Kafka (mensajes y offsets)
```
