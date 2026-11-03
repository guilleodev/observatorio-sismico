# Plan de implementación: MVP — recorrido completo de un evento sintético

**Rama**: `001-mvp-evento-sintetico` (trabajo en `main`) | **Fecha**: 2026-11-03 | **Especificación**: [spec.md](spec.md)

**Entrada**: especificación en `specs/001-mvp-evento-sintetico/spec.md`. Fase 2 de
`docs/HOJA-DE-RUTA.md`; hitos de commit **F2.1** (infraestructura) y **F2.2** (pipeline, API y mapa).

## Resumen

Un único evento sintético, identificado y aislado, recorre productor Python → Kafka → consumidor
Python → PostgreSQL → FastAPI → Angular/Leaflet. Se levantan los cinco servicios obligatorios con
`docker compose up --build -d`. El productor es un servicio de larga vida que se conecta a Kafka y
emite el evento **bajo demanda** (`docker compose exec`). El consumidor guarda con una escritura
idempotente en un esquema propio (`sintetico`) y confirma el offset después del commit. La API
sirve `GET /api/eventos` según `CONTRATO-API.md`. El mapa entregado se reutiliza con cambios
mínimos. Detalle de decisiones en [research.md](research.md).

## Contexto técnico

**Lenguaje/versión**: Python 3.13 (candidata; se confirma al construir la imagen) para backend;
TypeScript 5.9 / Angular 20.3 (ya fijado) para el mapa.

**Dependencias principales** (versiones consultadas en PyPI el 2026-11-03; se fijan en
`backend/requirements.txt` con sus transitivas): `aiokafka 0.15.0`, `fastapi 0.162.0`,
`uvicorn 0.54.0`, `psycopg[binary] 3.3.7`, `psycopg-pool 3.3.3`. Desarrollo: `pytest 9.2.0`,
`httpx 0.28.1`.

**Almacenamiento**: PostgreSQL 17.11, esquema `sintetico`, volumen persistente.

**Mensajería**: Apache Kafka 4.3.2 en modo KRaft de un solo nodo (imagen `apache/kafka`), un topic
propio del MVP (`terremotos.sintetico`). **Retención limitada desde el MVP** (`ENUNCIADO.md` §9),
configurada a nivel de broker en `compose.yaml`: 24 h (`log.retention.hours`), 100 MiB por partición
(`log.retention.bytes`) y cierre de segmento cada 6 h (`log.roll.hours`, necesario para que la
retención se aplique). Valores provisionales; razonamiento en [research.md](research.md) R-004.

**Pruebas**: `pytest` para la lógica pura (generador del evento, mensaje, mapeo a GeoJSON,
validaciones de CORS/errores con `TestClient`); verificación de integración con `quickstart.md` y
`scripts/verificar-mvp.ps1`, ejecutadas contra el sistema real en Docker.

**Plataforma objetivo**: Docker Desktop en Windows 11 (contenedores Linux); mapa en
`http://localhost:4200` con `npm start`.

**Tipo de proyecto**: aplicación web con backend por servicios (un paquete Python compartido por
tres servicios) y frontend Angular.

**Objetivos de rendimiento**: no relevantes en el MVP (un evento). Las mediciones son de las
Fases 5–6.

**Restricciones**: cinco servicios separados en Compose; solo la API se publica
(`127.0.0.1:8000:8000`); Kafka y PostgreSQL sin puertos en el host; sin USGS, sin ngrok, sin
Netlify en el MVP.

**Escala/alcance**: 1 evento sintético; 5 servicios; 1 tabla; 1 topic; 2 endpoints mínimos
(`/api/eventos`, `/api/salud`) más la emisión por línea de comandos.

## Comprobación de la constitución

*Puerta: debe pasar antes de la investigación. Reevaluada tras el diseño.*

| Principio | Cumplimiento en este plan |
|---|---|
| I. Requisitos del profesor | Se respeta `CONTRATO-API.md` (estructura GeoJSON, `null`, ms UTC, CORS, error explícito). **Una excepción temporal**: `metadata.mode = "synthetic"` solo en la API del MVP (el contrato admite únicamente `live` y `replay`, y no se modifica). Aceptada provisionalmente el 2026-11-03, con plan de retirada completado como máximo al cerrar F3.1 (preferiblemente antes de la ingesta real) en [research.md](research.md) R-001 |
| II. Arquitectura y tecnologías | Cinco servicios Compose; aiokafka, FastAPI, PostgreSQL, Kafka; el mapa consulta la API. Sin Spark/Flink/Kubernetes/ML |
| III. Datos honestos y aislados | Topic, esquema, prefijo de id, `mode` y etiqueta visual propios; 0 consultas a USGS; nulos como `null` |
| IV. Idempotencia | Inserción `ON CONFLICT (event_id) DO NOTHING` en una transacción y commit de offset posterior. El versionado por `updated` queda explícitamente para F3 |
| V. Verificación | Pruebas unitarias + quickstart ejecutado; evidencias en `docs/evidencias/mvp/` |
| VI. Seguridad | `.env.example` sin secretos; PostgreSQL y Kafka sin puertos en el host; CORS al origen de desarrollo |
| VII. Simplicidad | Una imagen compartida, un topic, una tabla, un nodo Kafka; sin roles de BD ni ORM |
| VIII. Aprendizaje | Cada módulo es pequeño; las tareas incluyen la explicación por bloques y una pregunta de defensa |

**Resultado**: sin violaciones. Reevaluación tras el diseño (Fase 1): sin cambios.

## Estructura del proyecto

### Documentación (esta funcionalidad)

```text
specs/001-mvp-evento-sintetico/
├── plan.md              # Este archivo
├── research.md          # Decisiones y alternativas
├── data-model.md        # Entidades, esquema SQL lógico y reglas
├── quickstart.md        # Guía de validación de extremo a extremo
├── contracts/
│   ├── mensaje-kafka.md # Contrato del mensaje de evento
│   └── api-mvp.md       # Diferencias del MVP respecto a CONTRATO-API.md
├── checklists/requirements.md
└── tasks.md             # Generado por /speckit-tasks
```

### Código fuente (raíz del repositorio)

```text
compose.yaml                      # 5 servicios, healthchecks, volumen
.env.example                      # Variables sin secretos reales
sql/
└── 001_esquema_sintetico.sql     # Esquema, tabla y restricciones (initdb)
backend/
├── Dockerfile                    # Imagen única (python:3.13-slim) para los 3 servicios Python
├── requirements.txt              # Dependencias fijadas
├── requirements-dev.txt          # pytest, httpx
├── src/observatorio/
│   ├── config.py                 # Variables de entorno
│   ├── sintetico.py              # Construcción del evento y del mensaje
│   ├── producer/
│   │   ├── main.py               # Servicio: conecta a Kafka, queda a la espera (healthcheck)
│   │   └── emitir_sintetico.py   # Comando bajo demanda (--repeat, --secuencia, --minutos-atras)
│   ├── consumer/
│   │   ├── main.py               # Bucle aiokafka: procesar → commit offset
│   │   └── repositorio.py        # Inserción idempotente en PostgreSQL
│   └── api/
│       ├── main.py               # FastAPI, CORS, /api/eventos, /api/salud
│       └── repositorio.py        # Consultas y conversión a GeoJSON
└── tests/unit/                   # Pruebas de lógica pura y de la API (TestClient)
scripts/
└── verificar-mvp.ps1             # Ejecuta el quickstart y guarda evidencias
frontend/                         # Cambios mínimos
├── public/config.json            # mode=api, apiUrl=http://localhost:8000
└── src/app/                      # Etiqueta «SINTÉTICO» (ts + html)
docs/evidencias/mvp/              # Salidas reales de la verificación
```

**Decisión de estructura**: un paquete Python (`observatorio`) y una imagen Docker compartidos por
productor, consumidor y API, con comandos de inicio distintos (permitido por `ENUNCIADO.md` §2).
Reduce duplicación y mantenimiento. Se reevaluará en F4 si `geopandas/shapely` justifica separar la
imagen del consumidor.

## Seguimiento de complejidad

Sin violaciones de la constitución que justificar. **Excepción temporal registrada**: `mode = "synthetic"` (R-001), que no
es una violación porque el contrato no se modifica y la excepción se acota a un único punto del
código y se retira o aísla por completo como máximo al cerrar F3.1 (preferiblemente antes de la
ingesta real). Simplificaciones deliberadas del MVP, a revisar en fases posteriores (no son
violaciones): creación automática del topic (F3: creación controlada y retención por topic; la
retención base ya se aplica en el MVP), un solo usuario de base de datos (F3/F6: roles separados), `DO NOTHING` en lugar de
comparación de `updated` (F3), sin paginación (F5).

## Correspondencia con los commits

| Commit | Contenido | Hito de verificación |
|---|---|---|
| **F2.1** | `compose.yaml`, `.env.example`, `sql/`, `backend/Dockerfile` y `requirements`, servicios Kafka y PostgreSQL sanos, esqueleto de los servicios Python con healthchecks | Los cinco servicios `healthy`; tabla creada; restricciones comprobadas con SQL |
| **F2.2** | Emisión, consumo, API, CORS, cambios del mapa, `verificar-mvp.ps1`, evidencias | Evento en mapa; reenvío ×5 = 1 fila; reinicio conserva el evento; Kafka caído, offset tras guardado, caducidad de 24 h, CORS y tiempos SC-001/SC-002 comprobados y registrados |
