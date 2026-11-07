# Modelo de datos: Geografía e histórico (F4)

Migración: `sql/003_esquema_f4.sql`, **idempotente** y aplicable a mano sobre el volumen existente (sin borrar datos), igual que
`002` en F3. Convenciones heredadas de F3 (`live.*`): `timestamptz` UTC, ms Unix en mensajes, original en `raw jsonb`, claves
naturales de USGS. Solo se listan cambios.

## Esquema `geo` (dimensión compartida)

**`geo.pais`** — una fila por entidad del catálogo. Grano: país/entidad.

| Columna | Tipo | Notas |
|---|---|---|
| `country_id` | text PK, `<> ''` | `ADM0_A3`; no se presupone ISO |
| `nombre_es` / `nombre_en` | text | `NAME_ES` / `ADMIN` |
| `continente`, `subregion` | text | `CONTINENT`, `SUBREGION` |
| `tipo` | text | `TYPE` (soberano, dependencia, disputado…) |
| `iso_a3` | text nulo | `ISO_A3`; nulo si es `-99` |

**`geo.catalogo`** — versiones del catálogo usadas. `sha256` (PK), `archivo`, `entidades`, `cargado_at`.

## Cambios en `live`

**`live.evento_actual`** (ya tiene `country_id`, `country_name`): añade
`geo_resultado` (`interior` | `frontera` | `varias` | `sin_pais`, nulo hasta asignar) y `geo_catalogo` (huella de la versión
del catálogo que asignó; `REFERENCES geo.catalogo(sha256)`). `country_id` pasa a `REFERENCES geo.pais`. Las restricciones se añaden con un bloque `DO` idempotente. Índice por `country_id` solo si la medición del paso 4.6 lo justifica (se decide en F5).

**`live.hueco`** — intervalos sin cobertura del feed.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | bigserial PK | |
| `inicio`, `fin` | timestamptz | `CHECK (fin > inicio)` |
| `detectado_at` | timestamptz | |
| `estado` | text | `pendiente` → `recuperado` (`UNIQUE (inicio, fin)`; no se anotan huecos en modo seco) |
| `recuperado_at` | timestamptz nulo | |
| `eventos_publicados` | integer nulo | resultado de la recuperación |

`evento_version` **no cambia** (A-03). `source` admite también `usgs-fdsn-recuperacion` (ver [contracts](contracts/mensaje-kafka.md)).

## Esquema `historico` (instantánea de 2025, aislada)

**`historico.consulta`** — un tramo consultado. Grano: tramo (mes o subtramo).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | bigserial PK | |
| `inicio`, `fin` | timestamptz | tramo UTC; `UNIQUE (inicio, fin, filtros)` |
| `filtros` | jsonb | `minmagnitude`, `eventtype`, ámbito; iguales en todos los tramos |
| `tramo_padre` | bigint nulo | si procede de una subdivisión |
| `url` | text | parámetros reproducibles de la consulta |
| `extraida_at` | timestamptz | fecha de extracción |
| `resultado` | text | `ok` / `error` / `subdividido` (el padre solo tras completar los hijos) |
| `http_status`, `intentos`, `error` | | como en `live.consulta_extraccion` |
| `esperado` | integer | recuento de `count` |
| `obtenidos` | integer nulo | eventos devueltos |
| `duplicados` | integer | ids ya cargados por otro tramo |
| `fuera_de_tramo` | integer | eventos con `time` ≥ fin descartados (extremo inclusivo) |
| `peticiones_http` | integer | peticiones HTTP realizadas (0 al reutilizar archivos) |

**`historico.archivo`** — original reutilizable (0..1 por consulta: un tramo con `esperado = 0` no tiene archivo, porque USGS no devuelve cuerpo y no se inventa uno). `consulta_id` PK→`consulta`, `contenido_gz bytea`, `sha256`, `tamano_bytes`, `creada_at`. Cada archivo se exporta además a `data/historico/` (ignorada por Git) con el mismo `sha256`.

**`historico.evento`** — terremoto de 2025. Grano: un evento (instantánea).

| Columna | Tipo | Notas |
|---|---|---|
| `event_id` | text PK | |
| `event_time`, `updated_at` | timestamptz | tiempo del evento (ventanas) y última actualización en la extracción |
| `mag`, `mag_type`, `depth_km`, `longitude`, `latitude`, `place` | | mismas reglas y `CHECK` de rango que `live` (nulos como nulos) |
| `country_id` | text nulo | `REFERENCES geo.pais`; nulo = «Sin país asignado» |
| `geo_resultado`, `geo_catalogo` | text | igual que en `live.evento_actual` |
| `origen` | text NOT NULL | `historico-usgs-fdsn` (columna de origen visible, FR-016) |
| `consulta_id` | bigint | `REFERENCES historico.consulta` |
| `raw` | jsonb | original sin transformar |

Índices: `(event_time)`, `(country_id, event_time)`; su efecto se mide en 4.6 (con ~18 000 filas puede no aportar; si no mejora se retira, como en F3).

**`historico.cuarentena`** — misma estructura que `live.cuarentena` (categoría, motivo, `event_id`, `consulta_id`, `payload bytea`, `huella` única).

## Relaciones

`geo.pais` 1—N `live.evento_actual` y 1—N `historico.evento`; `historico.consulta` 1—1 `historico.archivo`, 1—N `historico.evento`
y `historico.cuarentena`; `geo.catalogo` identifica la versión (por huella) usada en `geo_catalogo`. Ningún dato histórico en `live`.

## Reglas de integridad

- Cuadre de la carga: `Σ obtenidos − Σ duplicados − Σ fuera_de_tramo = |historico.evento| + |historico.cuarentena|`.
- `country_id` nulo ⇔ `geo_resultado = 'sin_pais'`; no nulo ⇒ `interior`, `frontera` o `varias`.
- La retención de F3 (copias y consultas de `live`) **no** toca `historico`: el histórico no se purga.
