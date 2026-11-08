# Plan de implementación: API y dashboard analítico (F5)

**Rama**: `004-api-dashboard` (trabajo en `main`) | **Fecha**: 2026-11-07 | **Especificación**: [spec.md](spec.md)

**Entrada**: `specs/004-api-dashboard/spec.md`. Fase **F5** de `docs/HOJA-DE-RUTA.md` (pasos 5.1 a 5.7). Commit previsto: **`[F5]`** al cerrar
la fase. Reutiliza F3 y F4 (`specs/002-…`, `specs/003-…`, solo lectura) sin repetirlas.

## Resumen

La API (servicio `api`, FastAPI) añade los filtros `start`, `end`, `min_mag` y `country_id`, la paginación con `truncated`/`total`, el endpoint
`/api/estadisticas` (recuentos por hora UTC y por país, distribuciones y comparación con 2025) y un `/api/salud` con el estado de la ingesta. Todo
son consultas SQL parametrizadas sobre el estado actual, calculadas en el momento. El panel Angular **amplía el frontend proporcionado**: un servicio
de API, un único estado de filtros y componentes de filtros, estado, tabla, gráficas y comparación alrededor del mapa existente. **No se añade ningún
servicio ni dependencia obligatoria**: solo se despliega de nuevo `api`. Detalle en [research.md](research.md) y contrato en [contracts/api-f5.md](contracts/api-f5.md).

## Contexto técnico

**Lenguaje**: Python 3.13 (FastAPI, psycopg 3 con `AsyncConnectionPool`, ya en la imagen) y TypeScript (Angular 20, Leaflet 1.9, ya instalados).
**Dependencias nuevas**: ninguna prevista (DF2: gráficas propias; DF5: `node --test`). **Almacenamiento**: PostgreSQL 17; sin tablas nuevas; un índice
(`sql/004_esquema_f5.sql`) solo si la medición de 5.7 lo justifica. **Lecturas**: `live.evento_actual`, `live.estado_ingesta`, `live.hueco`;
`historico.evento` y `geo.pais` solo en la comparación y los nombres de país. **Pruebas**: `pytest` (unitarias con repositorio simulado; integración
con PostgreSQL en transacciones revertidas o base temporal, como en F3/F4), `node --test` para la lógica pura del frontend, y comprobación en el
navegador integrado con la API real. **Plataforma**: Docker Desktop en Windows 11. **Volumen**: `live` ≈ 400 filas hoy (cobertura desde 2026-11-05);
`historico` 18 302. **Rendimiento**: umbrales pendientes de medición (SC-010). **Restricciones**: cinco servicios; solo la API publicada
(`127.0.0.1:8000`); CORS intacto; sin tocar `docs/referencias/`, `specs/001`–`003` ni el catálogo `paises.geojson`.
**Alcance**: pasos 5.1–5.7; replay (F6) y despliegue público (F6–F7) quedan fuera.

## Comprobación de la constitución (v1.0.3)

| Principio | Cumplimiento |
|---|---|
| I. Requisitos del profesor | `ENUNCIADO.md` §8 (puntos 1–7) y `CONTRATO-API.md` cubiertos (tabla de cobertura en [tasks.md](tasks.md)); en conflicto gana el contrato; el frontend proporcionado se extiende, no se descarta |
| II. Arquitectura y tecnologías | Cinco servicios; el panel solo consulta nuestra API; ventanas y agregaciones en Python y SQL; sin Spark/Flink/ML/PostGIS |
| III. Datos honestos y aislados | Eventos y estadísticas solo de `live`; el histórico solo como línea base agregada con `source` visible; «Sin país asignado» como categoría; nulos aparte, nunca ceros; UTC y tiempo del evento |
| IV. Idempotencia y versionado | Las cifras se recalculan desde el estado actual (una versión vigente por evento): una revisión no se cuenta dos veces |
| V. Verificación | Cada comportamiento con prueba ejecutada y evidencia en `docs/evidencias/f5/`; el dashboard se comprueba en el navegador con datos reales |
| VI. Seguridad | Parámetros validados y consultas parametrizadas; solo `GET`/`OPTIONS`; CORS sin cambios; sin rutas de administración ni secretos en `config.json` |
| VII. Simplicidad | Sin servicio, caché ni librería nueva; un solo endpoint de estadísticas; complejidad justificada en research (R-001…R-012) |
| VIII. Aprendizaje | Cada paso termina con explicación por bloques y pregunta de defensa |

**Resultado**: sin violaciones. Reevaluación tras el diseño: sin cambios. **Desviaciones justificadas**: (1) `test_consultas_solo_sobre_el_esquema_live` solo mira `SQL_EVENTOS` y las SQL del consumidor, así que **no se modifica**; se añade una prueba nueva que limita la lectura de `historico.evento` a `comparacion.py` — R-007 (DF6); (1b) `test_api_eventos.py`, `test_last_ingestion.py` y sus dobles `RepoFalso` comparan `metadata` y `/api/salud` por igualdad exacta y se actualizan por los campos nuevos; (2) F4 prohibía tocar Angular, F5 lo levanta solo para `frontend/src/app/`
y `config.json` — DF1.

## Decisiones que requieren aprobación

Afectan a dependencias, contrato o alcance del frontend; el resto está en [research.md](research.md). Hasta su aprobación **no se implementa** lo que bloquean.

| Decisión | Recomendada | Alternativa | Bloquea |
|---|---|---|---|
| **DF1 — Frontend** (R-009) | Extender el proporcionado: componentes y servicio nuevos, mapa y `config.json` intactos | Aplicación nueva | 5.4 |
| **DF2 — Gráficas** (R-010) | SVG/HTML propio en Angular, sin dependencia | Chart.js u otra biblioteca | 5.5 |
| **DF3 — Contrato ampliado** (R-002, R-003) | Campos y parámetros aditivos (`limit`/`offset`, `total`, `next_offset`, …) | Paginación por cursor | 5.1 |
| **DF4 — Obsolescencia** (R-006) | 300 s, `INGESTA_OBSOLETA_S` | 600 s | 5.6 |
| **DF5 — Pruebas del frontend** (R-011) | `node --test` (Node ≥ 24, instalado 24.11) + navegador integrado | Karma/Jasmine | 5.4 |
| **DF6 — API lee `historico`** (R-007) | `SELECT` agregado solo en `comparacion.py`, mismo rol | Rol de solo lectura distinto; media materializada | 5.3 |
| **DF7 — Convenciones del contrato** (R-001, R-002) | `sin_pais`, 422, 5 000, serie omitida con motivo, esperado = media × días | Otras convenciones | 5.1 |

## Pasos de F5 y verificación

| Paso | Qué se hace | Se comprueba |
|---|---|---|
| **5.1** Endpoints y filtros | `ConfigApi`, validación de parámetros, filtros compartidos, paginación, `metadata` ampliada, 422/503 | SC-001, SC-002 (eventos), SC-003 |
| **5.2** Estadísticas y distribuciones | `/api/estadisticas` con país, magnitud y profundidad, nulos aparte | SC-002, SC-004 (parte) |
| **5.3** Ventanas de 1 h y comparación | Serie horaria con ceros, comparación con 2025, motivos de periodo incompleto, ajuste de la prueba de aislamiento | SC-004, SC-005 |
| **5.4** Filtros del frontend | Servicio de API, estado de filtros único, componente de filtros, modo `demo` conservado | SC-008 (filtros) |
| **5.5** Mapa, gráficas y tablas | Tabla consultable, gráficas SVG, tarjeta de comparación, selección sincronizada | SC-008, SC-009 |
| **5.6** Errores, vacíos y estado | `/api/salud` ampliado, panel de estado, avisos de sin conexión, desactualizado, truncado y sin eventos | SC-006, SC-007 |
| **5.7** Validación | Planes con y sin índice, tiempos de respuesta, matriz de escenarios en el navegador, conclusiones, regresión | SC-010, SC-011, SC-012 |

## Estructura del código (cambios)

```text
backend/src/observatorio/
├── api/
│   ├── main.py            # MODIFICA: parámetros, 422, /api/estadisticas, /api/salud ampliado
│   ├── repositorio.py     # MODIFICA: eventos con filtros/paginación; sin romper SQL_EVENTOS por defecto
│   ├── filtros.py         # NUEVO: Filtros (parseo, validación, WHERE parametrizado compartido)
│   ├── estadisticas.py    # NUEVO: por hora, por país, distribuciones
│   └── comparacion.py     # NUEVO: media de 2025, esperado, variación, motivos (único módulo que lee historico, solo SELECT agregado)
└── config.py              # MODIFICA: ConfigApi (API_MAX_EVENTOS, API_MAX_VENTANA_HORAS, INGESTA_OBSOLETA_S, API_STATEMENT_TIMEOUT_S)
sql/004_esquema_f5.sql     # SOLO si 5.7 justifica un índice (idempotente)
compose.yaml / .env.example # MODIFICA: variables del servicio api (sin servicio nuevo)
frontend/src/app/          # MODIFICA app.component.*; NUEVOS modelos, filtros, api.service, componentes (filtros, estado, tabla, graficas, comparacion)
frontend/tests/            # NUEVO: pruebas de lógica pura (node --test)
backend/tests/unit/        # NUEVAS pruebas por paso; docs/evidencias/f5/ evidencias
```

## Orden de activación

DF1–DF7 se aprueban **juntas en T001**; cada punto de control solo pide autorización para seguir. 1. Backend: se reconstruye **solo `api`**
(`docker compose up -d --build --no-deps api`) tras cada paso 5.1, 5.2–5.3 y 5.6; productor, consumidor, Kafka y PostgreSQL no se tocan (`INGESTA_PUBLICAR=true`
sigue activo). 2. Frontend: se sirve en local con `npm start` contra `127.0.0.1:8000`. 3. Los ensayos de fallo (base caída, ingesta obsoleta) usan una
API y una base **temporales**, nunca se detiene el PostgreSQL real. Durante todo F5: sin `down -v`, sin recrear Kafka ni PostgreSQL, sin borrar datos.

## Riesgos y complejidad

Ver [research.md](research.md#r-012--riesgos). La complejidad añadida (módulos de filtros, estadísticas y comparación; componentes Angular) se justifica por
el enunciado y se evita todo lo demás: sin caché, sin servicio nuevo, sin gráficas de terceros, sin endpoint de países.
