# Plan de implementación: Ingesta real y calidad de datos (F3)

**Rama**: `002-ingesta-real-calidad` (trabajo en `main`) | **Fecha**: 2026-11-05 | **Especificación**: [spec.md](spec.md)

**Entrada**: `specs/002-ingesta-real-calidad/spec.md`. Fase **F3** de `docs/HOJA-DE-RUTA.md` (pasos 3.2 a 3.7). Commit
previsto: **`[F3]`** al cerrar la fase.

## Resumen

El servicio `producer` deja de ser un esqueleto y consulta USGS cada 60 s. Conserva la respuesta original (con retención) y el
registro de consultas, publica a Kafka solo versiones nuevas o revisadas y las marca como publicadas tras la confirmación del
broker. El `consumer` valida cada evento, lo guarda en una transacción (historial de versiones + estado actual solo si es más
reciente) y confirma el offset después; lo dudoso va a cuarentena. La API informa de `last_ingestion` desde el estado de
ingesta. **No se añade ningún servicio ni dependencia**: se amplía el código existente. Detalle de decisiones en
[research.md](research.md).

## Contexto técnico

**Lenguaje/versión**: Python 3.13 (imagen ya fijada). **Dependencias**: las existentes (`aiokafka`, `psycopg`, `psycopg-pool`,
`fastapi`, `uvicorn`); la consulta HTTP usa `urllib` de la biblioteca estándar en `asyncio.to_thread`, y `gzip`/`hashlib`
también estándar (R-002).

**Almacenamiento**: PostgreSQL 17, esquema `live` (migración `sql/002_esquema_f3.sql`, aplicable a mano al volumen existente
sin borrar datos). El esquema `sintetico` del MVP queda archivado.

**Mensajería**: Kafka KRaft de un nodo, topic `terremotos.live`, retención ya fijada (24 h, 100 MiB, segmento de 6 h).

**Pruebas**: `pytest` con servidor HTTP local simulado para los fallos de USGS (sin tocar Kafka ni la base); integración con
PostgreSQL real en transacciones que se revierten; verificación extremo a extremo con el feed real de USGS y fallos
provocados en los servicios ([quickstart.md](quickstart.md)).

**Plataforma**: Docker Desktop (Linux) en Windows 11.

**Rendimiento**: un ciclo con fallos puede superar los 60 s (hasta 3 reintentos de 5/10/20 s más 20 s de tiempo máximo por intento); el ciclo siguiente empieza al terminar. Una respuesta ≈ 200–250 eventos por minuto; un ciclo debe terminar muy por debajo de 60 s. Las mediciones de
tamaño y latencia (pendientes de F1) se registran en el paso 3.2. Las pruebas de escala son de F5–F6.

**Restricciones**: cinco servicios; solo la API publicada; secretos fuera de Git; sin datos de prueba en tablas definitivas;
sin tocar `docs/referencias/` ni `specs/001-mvp-evento-sintetico/`.

**Alcance**: 3.2–3.7; geografía (F4), estadísticas/filtros/panel (F5) y replay (F6) quedan fuera.

## Comprobación de la constitución (v1.0.3)

| Principio | Cumplimiento |
|---|---|
| I. Requisitos del profesor | `ENUNCIADO.md` §4.1, §5, §6, §7, §11 y el contrato API se cubren (trazabilidad en [research.md](research.md)); no se modifican |
| II. Arquitectura y tecnologías | Cinco servicios; sin Spark/Flink/Kubernetes/ML; el panel sigue consultando solo la API |
| III. Datos honestos y aislados | Solo `live`; nulos como `null`; `source` admitido acotado; los casos dañados de prueba **no** se escriben en tablas definitivas (R-009) |
| IV. Idempotencia y versionado | Núcleo de F3: `(event_id, updated)` único, actualización solo si más reciente, transacción y offset tras el commit, cuarentena con motivo |
| V. Verificación | Cada comportamiento con prueba ejecutada y evidencia en `docs/evidencias/f3/` |
| VI. Seguridad | Sin credenciales nuevas; PostgreSQL y Kafka sin puertos publicados; `.env.example` sin secretos |
| VII. Simplicidad | Una sola cuarentena con categoría, un solo usuario de BD, sin servicios nuevos; la complejidad añadida se justifica en research |
| VIII. Aprendizaje | Cada paso termina con explicación por bloques y pregunta de defensa |

**Resultado**: sin violaciones. Reevaluación tras el diseño: sin cambios. Cuatro decisiones requieren aprobación (abajo).

## Decisiones que requieren aprobación

Afectan a arquitectura o tratamiento de datos; el resto de decisiones menores está en [research.md](research.md).

1. **D1 — El productor accede a PostgreSQL** (estado de publicación, consultas, respuestas y estado de ingesta). Es lo que
   pide `ENUNCIADO.md` §5.3 («estado persistente»); acopla el productor a la base (R-001).
2. **D2 — Reclasificación a no sísmico**: el evento sale del estado actual (marca `retirado`), se conserva el historial
   (aclaración de la especificación; R-006).
3. **D3 — `source` admitido y datos dañados de prueba**: el consumidor solo acepta `source = usgs-all-day`; los casos
   dañados se prueban en transacciones revertidas y no se publican en el topic real (R-009).
4. **D4 — Volumen persistente para Kafka**: recomendado para conservar mensajes y offsets entre `docker compose down` y
   mantener la trazabilidad `(topic, partición, offset)`; el contenedor de Kafka actual usa un volumen anónimo (R-010).

## Orden de activación

El productor trabaja en **modo seco** (`INGESTA_PUBLICAR=false`) durante el paso 3.2 y los pasos 3.3–3.4; la publicación real se activa en la tarea T026, tras
implementar el consumidor definitivo (3.5) y con las tablas de eventos vacías (R-015). Los pasos 3.3 y 3.4 se validan antes con transacciones revertidas.

## Estructura del proyecto

### Documentación (esta funcionalidad)

```text
specs/002-ingesta-real-calidad/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/
│   ├── mensaje-kafka.md   # Mensaje live (diferencias con el MVP)
│   └── api-f3.md          # Diferencias respecto a CONTRATO-API.md
├── checklists/requirements.md
└── tasks.md               # Generado por /speckit-tasks
```

### Código fuente (cambios sobre lo existente)

```text
sql/002_esquema_f3.sql                    # NUEVO: tablas del modelo y columna `retirado` (idempotente)
backend/src/observatorio/
├── config.py                             # + ConfigIngesta (URL, intervalo, timeout, reintentos, retenciones, INGESTA_PUBLICAR) y SOURCE_ADMITIDO
├── producer/
│   ├── usgs.py                           # NUEVO: consulta HTTP + reintentos (sin BD ni Kafka)
│   ├── repositorio.py                    # NUEVO: versiones publicadas, consultas, respuestas, estado de ingesta
│   ├── ingesta.py                        # NUEVO: un ciclo completo (consultar → conservar → publicar → marcar)
│   └── main.py                           # bucle de 60 s sobre `ingesta`
├── consumer/
│   ├── mensaje.py                        # + clasificación (válido / excluido / inválido) y motivos
│   ├── repositorio.py                    # + versión + estado actual + cuarentena en una transacción
│   └── main.py                           # procesar_registro con las tres salidas
└── api/repositorio.py                    # evento_actual sin retirados; last_ingestion desde estado_ingesta
backend/tests/unit/                       # pruebas por módulo (+ servidor HTTP simulado)
compose.yaml / .env.example               # producer con PostgreSQL y variables nuevas; volumen de Kafka (D4)
scripts/verificar-f3.ps1                  # NUEVO: extremo a extremo y fallos (tareas)
docs/evidencias/f3/                       # salidas reales
```

**Decisión de estructura**: se respeta la organización por servicio del MVP. La lógica de red (`usgs.py`) se separa de la de
orquestación (`ingesta.py`) para probar los reintentos sin infraestructura.

## Seguimiento de complejidad

Sin violaciones. Simplificaciones deliberadas, a revisar en fases posteriores: un solo usuario de base de datos (roles en F6),
sin particionado de tablas, sin reconciliación de eventos eliminados por USGS (`FR-022`), país sin asignar hasta F4.

## Hitos técnicos y commit

Los hitos son técnicos, no commits; el commit previsto es **`[F3]`** al cerrar la fase.

| Hito técnico | Pasos | Verificación |
|---|---|---|
| **Ingesta en modo seco** | 3.2 | Ciclos de 60 s registrados, original conservado, tamaño y latencia medidos; **sin publicar** (R-015); fallos de USGS simulados con servidor local |
| **Historial y estado actual** | 3.3–3.4 | Nuevo, repetido, posterior y antiguo; transacción y offset tras guardar |
| **Calidad y cuarentena** | 3.5 | Excluidos, inválidos, nulos, `mag = 0`, profundidad negativa; **activación de la publicación real** y verificación con datos reales de 3.3–3.4 |
| **Estado y retención** | 3.6 | `last_ingestion` con fallos; retención de Kafka y purga de copias |
| **Resiliencia** | 3.7 | Reinicios y caídas sin duplicados; hueco de más de 24 h documentado; SC-010 pendiente de observación real de más de 24 h |
