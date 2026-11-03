# Investigación y decisiones: MVP — evento sintético

Cada decisión indica qué se eligió, por qué y qué alternativas se descartaron. Los datos de
versiones se consultaron el 2026-11-03 en PyPI y Docker Hub.

## R-001 — Valor de `mode` para el dato sintético (**excepción TEMPORAL, aceptada provisionalmente el 2026-11-03**)

- **Contexto**: `ENUNCIADO.md` §5.4 y `CONTRATO-API.md` solo contemplan `live` y `replay`. Un
  evento sintético no es ninguno de los dos y no debe confundirse con ellos (constitución III).
- **Decisión**: usar `mode = "synthetic"` **únicamente** en el circuito aislado del MVP: en el
  mensaje de `terremotos.sintetico`, en la tabla `sintetico.evento_actual` y en `metadata.mode` de
  la respuesta de esa API del MVP. Es una excepción transitoria y declarada, **no** una
  ampliación del contrato del profesor, cuyo documento no se modifica.
- **Condiciones aceptadas**:
  1. El contrato del profesor no se toca: solo admite `live` y `replay`.
  2. Los datos sintéticos permanecen identificados (id `synthetic-…`, `source`, `mode`, topic,
     esquema, etiqueta visual) y separados de los reales.
  3. `synthetic` **no** será un valor válido de `mode` en la API definitiva.
  4. La excepción se documenta como temporal y tiene un plan de retirada (abajo).
- **Cómo se limita en el MVP**: el literal `"synthetic"` solo aparece en un único punto de la API
  (una constante `MODO_MVP` en `api/repositorio.py`) y en el generador del evento. Ningún otro
  módulo lo usa; así la retirada es un cambio localizado.
- **Plan de retirada** (no forma parte del MVP). **Plazo único**: completado como máximo al cerrar
  el paso 3.1 de `docs/HOJA-DE-RUTA.md` (criterio obligatorio), que es el primer paso de F3 y
  precede a la ingesta real de USGS (paso 3.2), es decir, **antes** de conectarla:
  1. Eliminar la constante `MODO_MVP`; el modelo de respuesta de la API valida
     `mode ∈ {"live", "replay"}` y una prueba comprueba que `"synthetic"` se rechaza.
  2. `GET /api/eventos` deja de leer del esquema `sintetico` y pasa a leer los datos reales
     (`live`), con `metadata.mode = "live"`; la reproducción (F6) devolverá `replay`.
  3. El circuito sintético no se borra necesariamente: se **aísla** como material de pruebas
     (el enunciado §6 exige mantener separados e identificados los casos artificiales). Se conserva
     solo el esquema `sintetico`, el topic y el generador, sin ruta pública en la API definitiva, o
     se eliminan si no se usan en las pruebas de F3.
  4. Los criterios de aceptación de F3 incluyen: ninguna respuesta de la API contiene `synthetic`
     y ninguna consulta de la API definitiva referencia el esquema `sintetico`.
- **Alternativas**:
  - (B) usar `replay`: confunde el MVP con la reproducción histórica de F6.
  - (C) usar `live` más una bandera: puede acabar mezclado con la ingesta real.
  - (D) servir el circuito sintético en otra ruta (por ejemplo, `/api/sintetico/eventos`) y dejar
    `/api/eventos` con `live`: respetaría el contrato al pie de la letra, pero obligaría a cambiar
    la URL del componente del profesor y añadiría una segunda ruta solo para el MVP. Se descarta
    por simplicidad, al ser la excepción acotada y reversible.
- **Riesgo residual**: mientras dure el MVP, la API devuelve un valor que el contrato no
  contempla. Se mitiga con el punto único de definición y el plan de retirada, y se recordará en
  la memoria como limitación temporal.

## R-002 — Python 3.13 y dependencias

- **Decisión**: imagen `python:3.13-slim-trixie` (el patch se fija al construir) y las dependencias
  de `plan.md`.
- **Evidencia obtenida**: `uv pip compile` para `--python-version 3.13 --python-platform linux`
  resuelve el conjunto sin conflictos; `aiokafka 0.15.0` publica ruedas `cp313` manylinux (x86_64 y
  aarch64), por lo que no necesita compilación. **No** se ha construido la imagen ni ejecutado el
  código todavía: la compatibilidad en tiempo de ejecución se confirmará en la tarea de
  construcción de la imagen.
- **Alternativa**: 3.12, descartada de entrada porque no hay motivo técnico y la decisión previa
  fue 3.13.

## R-003 — Kafka en un solo nodo con KRaft

- **Decisión**: imagen oficial `apache/kafka:4.3.2` (estable; existe 4.4.0 publicada hace pocos
  días, se evita por ser demasiado reciente), KRaft, un nodo con roles `broker,controller`, listener
  interno `PLAINTEXT://kafka:9092`, sin puerto publicado en el host.
- **Healthcheck**: `kafka-broker-api-versions.sh --bootstrap-server localhost:9092`.
- **Alternativas**: ZooKeeper (obsoleto, más contenedores); Redpanda (no es Apache Kafka); publicar
  un listener externo (no necesario en el MVP; se documentará si hace falta depurar desde el host).
- **Pendiente de verificar al ejecutar**: la sintaxis exacta de variables de entorno de la imagen
  no se ha probado (Docker Desktop estaba detenido al planificar).

## R-004 — Creación del topic y retención limitada de Kafka

- **Requisito [P]**: `ENUNCIADO.md` §9 pide «una retención limitada de Kafka» y §2 que el broker
  gestione la «retención de mensajes». Se cumple desde el MVP, no se aplaza.
- **Decisión (política base)**: la retención se fija **a nivel de broker** en `compose.yaml`
  (variables `KAFKA_*` de la imagen), de modo que se aplica también al topic creado
  automáticamente:
  - `log.retention.hours = 24`: los mensajes se conservan como máximo 24 h. Es coherente con la
    ventana de 24 h del feed y suficiente para que el consumidor se recupere de una parada de un
    día; paradas mayores se recuperan con el catálogo histórico (`ENUNCIADO.md` §5).
  - `log.retention.bytes = 104857600` (100 MiB por partición): tope de espacio en disco.
  - `log.roll.hours = 6`: Kafka solo borra segmentos **cerrados**; con el tamaño de segmento por
    defecto (1 GiB) un topic pequeño nunca cerraría el segmento activo y la retención no se
    aplicaría. Forzar el cierre cada 6 h hace efectiva la política de 24 h.
- **Topic**: creación automática con una partición (sin servicio de inicialización). La creación
  controlada del topic y la política por topic (por ejemplo, otra retención para `replay`) se
  revisan en F3 con volúmenes reales; la base de 24 h/100 MiB es **provisional**.
- **Verificación prevista** (aún no ejecutada): comprobar con `kafka-configs.sh --describe` que la
  configuración efectiva del broker coincide, ya que el mapeo exacto de las variables de entorno de
  la imagen no se ha probado todavía.
- **Alternativas**: contenedor de inicialización (sexto contenedor que complica el «cinco
  servicios»); crear el topic desde el productor con el cliente administrador (viable, más código
  para el MVP).

## R-005 — Cómo se «emite bajo demanda» si el productor es un servicio

- **Decisión**: el servicio `producer` arranca, se conecta a Kafka (con reintentos), marca su salud y
  espera. El evento se emite con `docker compose exec producer python -m
  observatorio.producer.emitir_sintetico [--repeat N] [--secuencia N] [--minutos-atras M]`
  (opciones en R-012).
- **Por qué**: cumple «cinco servicios separados» y la emisión explícita (FR-001); en F3 el mismo
  servicio pasará a consultar USGS cada 60 s sin cambiar la composición.
- **Alternativas**: emitir al arrancar (cada reinicio reemitiría y dificulta el control de
  pruebas); un contenedor efímero con `docker compose run` (no cuenta como servicio permanente).

## R-006 — Idempotencia en el MVP

- **Decisión**: `INSERT ... ON CONFLICT (event_id) DO NOTHING` dentro de una transacción; el offset
  se confirma manualmente después del commit (`enable_auto_commit=False`).
- **Por qué**: garantiza «como máximo una fila por identificador» (FR-005) y tolera la entrega
  repetida tras un fallo. No se compara `updated`: las revisiones se tratan en F3 (el texto de la
  especificación lo declara fuera de alcance).
- **Alternativa**: upsert con comparación de versiones ya ahora: adelanta F3 y aumenta la
  superficie del MVP.

## R-007 — Aislamiento de datos

- **Decisión**: esquema PostgreSQL `sintetico` (tabla `sintetico.evento_actual`), topic
  `terremotos.sintetico`, id con prefijo `synthetic-`, `source = "synthetic-generator"` y
  `mode = "synthetic"`, más `CHECK` en la tabla que exige el prefijo. Los datos reales irán al
  esquema `public`/`live` en F3, que la API no mezclará.
- **Alternativa**: una sola tabla con columna `mode`: más simple, pero una consulta equivocada
  mezclaría datos sintéticos y reales.

## R-008 — Controlador de PostgreSQL

- **Decisión**: `psycopg` 3 (asíncrono) con `psycopg-pool` para consumidor y API; un único
  controlador, SQL explícito (sin ORM) para que el flujo sea fácil de explicar y defender.
- **Alternativas**: `asyncpg` (rápido pero otro controlador y API distintas); SQLAlchemy (más capas
  que el MVP justifica).

## R-009 — Imagen compartida por los tres servicios Python

- **Decisión**: un `backend/Dockerfile` y un paquete `observatorio`; `compose.yaml` fija el
  `command` de cada servicio. Permitido por `ENUNCIADO.md` §2.
- **Alternativas**: tres imágenes (más mantenimiento y tiempo de construcción).

## R-010 — Cambios en el frontend

- **Decisión**: `public/config.json` pasa a `mode: "api"` con `apiUrl: "http://localhost:8000"`; el
  componente muestra una insignia «DATOS SINTÉTICOS» cuando `metadata.mode === "synthetic"` y marca
  «SINTÉTICO» en la ficha. Nada más (sin filtros ni gráficos).
- **Nota**: el modo `demo` sigue disponible cambiando `config.json`; no se borra el archivo de
  demostración del profesor.
- **Riesgo**: `config.json` es público y se versiona; `localhost` no es un secreto. Al publicar en
  Netlify (F6) se sustituirá por la URL de ngrok.

## R-011 — `GET /api/salud` mínimo

- **Decisión**: se implementa la versión mínima (estado de la API y de la base, `last_ingestion`)
  porque Compose la necesita como healthcheck; `/api/estadisticas` queda para F5.
- **`last_ingestion`**: significado **provisional** en el MVP = instante del último mensaje
  sintético procesado (`max(ingested_at)` del esquema `sintetico`), `null` si no hay. **No es** una
  consulta a USGS. Significado **definitivo** (desde la ingesta real de F3: pasos 3.2 y 3.6, contrato del profesor) = instante de la última
  consulta correcta a USGS, que no se alimenta nunca de datos sintéticos. Se redefine al retirar
  `synthetic` (R-001) y se documenta en `contracts/api-mvp.md` y `spec.md`.

## R-012 — Evento sintético

- **Decisión**: id `synthetic-mvp-00N` (por defecto `N = 1`, `synthetic-mvp-001`);
  `time = ahora − M minutos` (por defecto `M = 10`) y `updated = time` al generar; coordenadas
  válidas (no pretenden representar un sismo real); país nulo.
- **Opciones del comando de emisión**: `--repeat N` reenvía **el mismo mensaje** N veces (prueba de
  reenvío idéntico); `--secuencia N` cambia el sufijo del id (otro evento sintético);
  `--minutos-atras M` fija cuánto tiempo atrás ocurrió.
- **Por qué**: el id fijo por defecto hace trivial demostrar el reenvío (SC-004); el tiempo reciente
  hace que el evento entre en la ventana por defecto de 24 h de la API (`CONTRATO-API.md`).
- **Caducidad de 24 h**: la API solo devuelve por defecto los eventos de las últimas 24 h, así que
  un evento sintético deja de verse pasado ese tiempo aunque siga guardado (no se borra: ver
  `spec.md`, casos límite). Esto se comprueba sin esperar un día emitiendo un evento con
  `--secuencia 2 --minutos-atras 1500` (25 h).
- **Repetir la demostración**: el reenvío con el mismo id es ignorado (`DO NOTHING`) y **no
  refresca** la hora del evento. Dos formas de repetirla: (a) emitir otro evento con
  `--secuencia N`; (b) empezar de cero con `docker compose down -v` y `up` (borra los datos
  sintéticos y los mensajes del broker). Procedimiento paso a paso en `quickstart.md`.

## R-013 — Qué queda explícitamente fuera

Feed de USGS, histórico, versiones/revisiones, validación y cuarentena, geografía, filtros,
estadísticas, tabla, gráficos, replay, ngrok y Netlify (Fases 3–7).
