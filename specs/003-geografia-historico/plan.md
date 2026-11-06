# Plan de implementación: Geografía e histórico (F4)

**Rama**: `003-geografia-historico` (trabajo en `main`) | **Fecha**: 2026-11-06 | **Especificación**: [spec.md](spec.md)

**Entrada**: `specs/003-geografia-historico/spec.md`. Fase **F4** de `docs/HOJA-DE-RUTA.md` (pasos 4.1 a 4.6). Commit previsto: **`[F4]`**
al cerrar la fase. Reutiliza F3 (`specs/002-ingesta-real-calidad/`, solo lectura) sin repetirla.

## Resumen

El consumidor asigna a cada versión válida el país cuyo polígono contiene el epicentro (catálogo Natural Earth entregado, solo lectura) y lo
guarda en el estado actual dentro de la misma transacción; una orden idempotente asigna los eventos ya almacenados. Una orden de lote
descarga una vez el histórico de 2025 (mundo, magnitud ≥ 4, tipo `earthquake`) por meses, conserva cada respuesta original y lo guarda,
con país y trazabilidad, en un esquema `historico` aislado. El productor anota los huecos de más de 24 h y una orden a demanda los recupera
con el catálogo histórico por el mismo canal de la ingesta real. Las consultas de comparación entre ventanas equivalentes se dejan validadas
para F5. **No se añade ningún servicio**; la única dependencia nueva posible es Shapely (D1). Detalle en [research.md](research.md).

## Contexto técnico

**Lenguaje**: Python 3.13 (imagen existente). **Dependencias nuevas**: solo Shapely (+ NumPy), sujeta a D1; el cliente del catálogo usa
`urllib` y `gzip` como en F3. **Almacenamiento**: PostgreSQL 17, esquemas nuevos `geo` e `historico` y columnas en `live`
(`sql/003_esquema_f4.sql`, aplicable a mano sin borrar datos). **Mensajería**: sin cambios (topic `terremotos.live`; nuevo `source` de
recuperación, D4). **Catálogo**: `frontend/public/datos/paises.geojson` montado solo lectura en `consumer` y, para la carga de lote, con `-v` en `docker compose run`.
**Pruebas**: `pytest` (unitarias del asignador y del cliente con servidor HTTP local simulado), integración con PostgreSQL en transacciones
revertidas, recursos temporales para el hueco simulado y las interrupciones, carga real de 2025 una sola vez ([quickstart.md](quickstart.md)).
**Plataforma**: Docker Desktop en Windows 11. **Rendimiento**: volumen en vivo ≈ 1 evento/min; histórico = 18 302 eventos (recuento real de
USGS, ver R-006). Umbrales de SC-011 pendientes de medición. **Restricciones**: cinco servicios; solo la API publicada;
sin datos de prueba en tablas definitivas; sin borrar volúmenes; sin tocar `docs/referencias/`, `specs/001` ni `specs/002`.
**Alcance**: pasos 4.1–4.6; endpoints/filtros/panel (F5), replay (F6) y despliegue (F7) quedan fuera.

## Comprobación de la constitución (v1.0.3)

| Principio | Cumplimiento |
|---|---|
| I. Requisitos del profesor | `ENUNCIADO.md` §4.2, §4.3, §7 y §8 cubiertos (trazabilidad en [research.md](research.md)); no se modifican documentos originales |
| II. Arquitectura y tecnologías | Cinco servicios; la carga y la recuperación reutilizan la imagen existente; Shapely es una biblioteca Python citada por el enunciado (D1); sin Spark/Flink/ML/PostGIS |
| III. Datos honestos y aislados | `historico` separado de `live`; nulo = «Sin país asignado»; nunca el país más cercano; el histórico se descarga de USGS, no se simula |
| IV. Idempotencia y versionado | País derivado de la versión vigente; carga y recuperación idempotentes y reanudables; recuperación pasa por versiones y cuarentena |
| V. Verificación | Cada comportamiento con prueba ejecutada y evidencia en `docs/evidencias/f4/` |
| VI. Seguridad | Sin credenciales nuevas; catálogo en solo lectura; Kafka y PostgreSQL sin publicar |
| VII. Simplicidad | Sin servicios nuevos; archivos en la base; sin tablas de auditoría extra; complejidad justificada en research |
| VIII. Aprendizaje | Cada paso termina con explicación por bloques y pregunta de defensa |

**Resultado**: sin violaciones. Reevaluación tras el diseño: sin cambios. Cuatro decisiones requieren aprobación (abajo).

## Decisiones que requieren aprobación

Afectan a dependencias, almacenamiento o tratamiento de datos; el resto está en [research.md](research.md). Hasta su aprobación **no se implementa** el paso que bloquean.

| Decisión | Recomendada | Alternativa | Bloquea |
|---|---|---|---|
| **D1 — Geometría** (R-001) | Shapely con `STRtree` y `covers` | Implementación propia con caja envolvente | 4.2 |
| **D2 — Esquemas** (R-005) | `geo` + `historico`, separados de `live` | Mezclar en `live` con columna de origen | 4.1 (carga de `geo.pais`) |
| **D3 — Carga histórica** (R-007, R-008) | Orden de lote con la imagen existente, directo a PostgreSQL, originales comprimidos en la base **y exportados a `data/historico/`** | Publicar por Kafka; solo archivos en volumen | 4.4 |
| **D4 — Recuperación** (R-009) | A demanda, por el canal real, con `source = usgs-fdsn-recuperacion` | Automática al arrancar; escritura directa | 4.5 |

## Pasos de F4 y verificación

| Paso | Qué se hace | Se comprueba |
|---|---|---|
| **4.1** Explorar polígonos y códigos de país | Informe del catálogo (unicidad de `ADM0_A3`, geometrías, `-99`, tipos, CRS), `sql/003_esquema_f4.sql` (parte `geo`), carga idempotente de `geo.pais`, montaje solo lectura | SC-001; migración repetible sin pérdida |
| **4.2** Asignación punto-en-polígono | Módulo del asignador con la regla de R-002, validación de geometrías, integración en el consumidor (misma transacción), columnas nuevas de `live`, asignación retroactiva y `country_*` real en la API | SC-002, SC-004; suite anterior intacta |
| **4.3** Océanos, fronteras y sin país | Batería de ≥ 20 puntos, medición de la proporción «sin país», contraste con `place`, medición del tiempo con `STRtree` frente a recorrido secuencial | SC-003, SC-005, parte de SC-011 |
| **4.4** Carga histórica de 2025 | Cliente del catálogo, tramos mensuales con subdivisión, deduplicación, originales y consultas, cuarentena propia, carga real y repetición sin descargar | SC-006, SC-007, SC-008 |
| **4.5** Recuperación tras > 24 h | Detección de huecos en el productor, orden de recuperación, `source` admitido, prueba con hueco simulado en recursos temporales | SC-009 |
| **4.6** Validar histórico, trazabilidad y comparaciones | Consultas de referencia contra recuento independiente, cuadres de trazabilidad, medición de rendimiento e índices, resultados y cierre | SC-010, SC-011, SC-012 |

## Estructura del código (cambios)

```text
backend/src/observatorio/
├── geo/            # NUEVO: catalogo.py (leer/validar/volcar), asignador.py (R-001/R-002), retroactivo.py (orden)
├── historico/      # NUEVO: fdsn.py (cliente), cargador.py (tramos/dedupe), repositorio.py, main.py (orden de lote)
├── recuperacion/   # NUEVO: recuperar.py (orden a demanda con --listar; usa la publicación del productor)
├── consumer/       # MODIFICA: asignación en la transacción; admitir el nuevo source; clasificador reutilizable por el histórico
├── producer/       # MODIFICA: detección de huecos al registrar la consulta correcta
└── config.py       # MODIFICA: variables del catálogo, del histórico (año, magnitud mínima, límite de consulta)
sql/003_esquema_f4.sql        # NUEVO: esquemas geo e historico, columnas de live, live.hueco (idempotente)
sql/consultas/comparacion.sql # NUEVO: consultas de referencia (sin módulo de producción; F5 las convierte en API)
compose.yaml / .env.example   # MODIFICA: montaje solo lectura del catálogo en el consumidor, variables nuevas (sin servicio nuevo)
backend/tests/unit/           # NUEVAS pruebas por paso (la integración con PostgreSQL va aquí, como en F3); docs/evidencias/f4/ evidencias
```

## Orden de activación

D1–D4 se aprueban **juntas en T001**; cada punto de control solo pide autorización para seguir. 1. Aplicar la parte `geo` de `003` y cargar `geo.pais` (sin tocar el flujo).
2. Asignador y pruebas; solo después, enlazarlo al consumidor y ejecutar la asignación retroactiva (con lag 0 y reconciliación vacía).
3. Carga real de 2025 (una vez) y repetición. 4. Detección en el productor, `source` en el consumidor y prueba con hueco simulado.
Durante todo F4: `INGESTA_PUBLICAR=true` en el `.env` local sigue activo; **no** se recrean Kafka ni PostgreSQL ni se borran volúmenes; los cambios de
`consumer` y `producer` se despliegan reconstruyendo solo esos contenedores, verificando antes lag 0 y reconciliación vacía (aprendizaje de F3).

## Riesgos y complejidad

Ver tabla de riesgos en [research.md](research.md#r-013--riesgos). La complejidad añadida (Shapely, esquemas, orden de lote, tabla de huecos) se
justifica por los requisitos del enunciado y se evita todo lo demás: sin PostGIS, sin servicio nuevo, sin recuperación automática, sin endpoints (F5).
