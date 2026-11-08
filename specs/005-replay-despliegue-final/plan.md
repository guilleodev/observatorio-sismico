# Plan de implementación: Replay, integración, despliegue y pruebas finales (F6)

**Rama**: `005-replay-despliegue-final` (trabajo en `main`) | **Fecha**: 2026-11-08 | **Especificación**: [spec.md](spec.md)

**Entrada**: `specs/005-replay-despliegue-final/spec.md`. Fase **F6** de `docs/HOJA-DE-RUTA.md`, con los pasos 6.1 a 6.6 originales y 6.7 a 6.10 añadidos (DG9).
Commit previsto: **`[F6]`**. Reutiliza F3, F4 y F5 (`specs/002-…`, `003-…`, `004-…`, solo lectura) sin repetirlas.

## Resumen

El **replay** reproduce por Kafka una selección ordenada de eventos reales de `historico.evento`, con topic (`terremotos.replay`) y esquema (`replay`) propios, `mode = "replay"`
y tiempos originales intactos. Lo procesa **el mismo código del consumidor**, parametrizado por destino (esquema, topic y grupo), ejecutado bajo demanda: **no hay sexto
servicio** (DG1). La API acepta `mode=live|replay` (DG2) y el panel añade un selector con la etiqueta «REPRODUCCIÓN». Sobre eso se ejecutan las pruebas de aceptación
de `ENUNCIADO.md` §11, las mediciones de tiempo y memoria, las pruebas de accesibilidad y compatibilidad, los ensayos de recuperación sin operaciones destructivas, la
preparación de ngrok y Netlify (publicación solo con autorización) y la validación de entregables en un proyecto Compose paralelo. Detalle en [research.md](research.md) y
contratos en [contracts/f6.md](contracts/f6.md).

## Contexto técnico

**Lenguaje**: Python 3.13 (aiokafka 0.15, psycopg 3, FastAPI, ya en la imagen) y TypeScript (Angular 20, Leaflet). **Dependencias nuevas**: ninguna en el repositorio (el
CLI de Netlify y ngrok son herramientas de la persona estudiante, fuera de Git). **Almacenamiento**: PostgreSQL 17; migración aditiva e idempotente `sql/004_esquema_f6.sql`
(esquema `replay`). **Mensajería**: un topic nuevo, creado automáticamente por el broker con la retención actual (24 h, 100 MiB). **Pruebas**: `pytest` (unitarias con dobles;
integración con PostgreSQL en base temporal o transacciones revertidas), `node --test` y el navegador integrado; ensayos reales con autorización. **Plataforma**: Docker
Desktop en Windows 11, una sola máquina. **Volumen**: `live` ≈ 550 filas, `historico` 18 302, réplicas sintéticas de 10³ a ≈ 1,8·10⁵ solo en bases temporales.
**Restricciones**: cinco servicios; solo la API publicada (`127.0.0.1:8000`); sin `down -v`, sin recrear Kafka ni PostgreSQL, sin tocar `docs/referencias/`, `specs/001`–`004`
ni el catálogo; umbrales de rendimiento de F5 conservados (p95 de 50, 100, 250 y 500 ms) y los nuevos, tras medir. **Alcance**: pasos 6.1–6.10; la memoria y la defensa son F7.

## Comprobación de la constitución (v1.0.4)

| Principio | Cumplimiento |
|---|---|
| I. Requisitos del profesor | `ENUNCIADO.md` §9, §10, §11 y §12 y `CONTRATO-API.md` (`mode`, CORS) cubiertos; el replay entra aunque la lista inicial no lo nombraba; en conflicto gana el enunciado |
| II. Arquitectura y tecnologías | Cinco servicios; ngrok como agente del equipo (la tabla del enunciado lo admite); Netlify solo sirve el build; sin Spark, Flink, Kubernetes ni ML |
| III. Datos honestos y aislados | Esquema y topic de replay, `CHECK (mode = 'replay')`, etiqueta «REPRODUCCIÓN»; los casos controlados son **datos de demostración etiquetados** con ids propios (`replay-ctl-…`) y solo en `replay` (excepción acotada recogida en la constitución v1.0.4; no se insertan datos de prueba en `live`, `geo` ni `historico`); réplicas de escala sintéticas en bases temporales; nulos y «Sin país asignado» como siempre |
| IV. Idempotencia y versionado | El replay pasa por el mismo procesamiento (versión más reciente gana, duplicado no suma, offset tras escribir); se prueba con los seis casos controlados |
| V. Verificación | Cada fila de §11 y cada ensayo se ejecuta y se guarda en `docs/evidencias/f6/`; lo no ejecutable consta como pendiente, nunca como superado |
| VI. Seguridad | Authtoken solo en la configuración de ngrok; CORS con orígenes exactos; solo la API por el túnel; escaneo de secretos antes del commit |
| VII. Simplicidad | Sin servicio, librería ni caché nuevos; la complejidad añadida (esquema `replay`, destino parametrizado) se justifica en research |
| VIII. Aprendizaje | Cada paso termina con explicación por bloques y pregunta de defensa |

**Resultado**: sin violaciones. **Desviaciones justificadas**: (1) `test_consultas_solo_sobre_el_esquema_live` (F3) se **adapta** (no se debilita) para admitir el
destino `replay` y exigir que el SQL del destino `live` sea idéntico al actual — R-003; (2) `test_aislamiento_api.py` se amplía para que solo el camino `mode=replay` lea
`replay.*` — R-006; (3) T040, T067 y T073 son borradores que alimentan F7, no la sustituyen; (4) el código del replay vive en un paquete nuevo `observatorio/replay/` para que `consumer/` y `producer/` sigan sin mencionar `historico`.

## Decisiones que requieren aprobación

DG1–DG9 se aprobaron el 2026-11-08 con las condiciones de DG6, DG7 y DG8 recogidas abajo; DG10, condicionada a la constitución. Hasta su resolución no se implementa lo que bloquean.

| Decisión | Recomendada | Alternativa | Bloquea |
|---|---|---|---|
| **DG1 — Procesamiento del replay** (R-003, R-005) | Mismo código del consumidor, destino parametrizado, ejecución bajo demanda, sin servicio nuevo | Consumidor en vivo suscrito a dos topics; sexto servicio | 6.1 |
| **DG2 — Exposición en la API** (R-006) | Parámetro `mode` (y `run` opcional) en los tres endpoints | Rutas `/api/replay/*` | 6.2 |
| **DG3 — Selección y velocidad** (R-001, R-004) | 30 reales de un día, 1 mensaje/2 s; ejecuciones identificadas y sin borrar | Limpiar el esquema entre ejecuciones | 6.1 |
| **DG4 — ngrok** (R-013) | Agente en el equipo sobre `127.0.0.1:8000` (preferencia propia; §9 admite también un contenedor) | Contenedor en la red de Compose (token en el entorno, un servicio más) | 6.6 |
| **DG5 — URL del túnel** (R-013) | Dominio estático gratuito si la cuenta lo ofrece | URL cambiante y nuevo despliegue cada sesión | 6.6 |
| **DG6 — Netlify y `config.json`** (R-013) | Despliegue manual del build local; la URL de ngrok se escribe en `public/config.json` antes de compilar solo en T043 y se restaura y verifica en el mismo paso | Solo en la copia de `dist` (se aparta de §9); despliegue conectado a Git | 6.6 |
| **DG7 — Entorno limpio** (R-015) | Proyecto Compose independiente, `BACKEND_IMAGE` propia, puerto alternativo, ingesta en modo seco; eliminar sus volúmenes, incluso temporales, exige PA-11 específico (nunca `down -v`) | Revisión documental sin ejecutar | 6.9 |
| **DG8 — Ensayos sobre servicios reales** (R-014) | `stop`/`start` con autorización por ensayo; reinicio de Docker/equipo por la persona estudiante | Solo recursos temporales | 6.8 |
| **DG10 — Casos controlados** (R-004) | **Aprobada (opción A)**: solo en `replay.*`, como sintética y sin mezclar; excepción acotada aplicada en la constitución v1.0.4 | Solo duplicado y revisión en el replay; el resto en bases temporales | 6.1 |
| **DG9 — Numeración de la hoja** | Ampliar F6 con 6.7–6.10 | Absorberlos en 6.3 y 6.6 | T001 |

## Puntos de autorización

Ninguna de estas acciones se ejecuta sin el visto bueno expreso de la persona estudiante, dado **en el momento** (una aprobación no se extiende a la siguiente).

| ID | Acción | Paso | Quién |
|---|---|---|---|
| PA-1 | Aprobar DG1–DG10 | T001 | Persona estudiante |
| PA-2 | Aplicar `sql/004_esquema_f6.sql` en PostgreSQL real (aditiva, idempotente) | 6.1 | Claude con PA |
| PA-3 | Recrear `consumer`, `producer` y `api` con la imagen nueva (`up -d --build --no-deps <servicio>`), uno a uno, con invariantes antes y después y la imagen anterior etiquetada para volver atrás | 6.1, 6.2, 6.6 | Claude con PA |
| PA-4 | Reproducir en el Kafka y el PostgreSQL reales (topic y esquema de replay) | 6.1–6.3 | Claude con PA |
| PA-5 | Parar y arrancar servicios reales (consumidor, productor, API; Kafka y PostgreSQL con `stop`/`start`) | 6.8 | Claude con PA por ensayo |
| PA-6 | Reiniciar Docker Desktop o el equipo (**persona estudiante**); `docker compose down` sin `-v` (opcional, Claude con PA aparte) | 6.8 | Persona estudiante / Claude con PA |
| PA-7 | Levantar el proyecto Compose paralelo e independiente (consumo de memoria y puertos); sin eliminar nada (ver PA-11) | 6.9 | Claude con PA |
| PA-8 | Crear cuentas, introducir el authtoken, abrir el túnel, crear el sitio y publicar en Netlify | 6.6 | **Persona estudiante** (Claude no introduce tokens) |
| PA-9 | Pruebas con lector de pantalla, Firefox/Safari, dispositivos físicos y el Chrome real de la persona (Claude in Chrome) | 6.7, 6.6 | Persona estudiante con guion |
| PA-10 | Observación de más de 24 h de SC-010 de F3 | 6.10 | Autorización expresa y fecha |
| PA-11 | Eliminar los volúmenes del proyecto paralelo (por nombre exacto, listados antes; nunca `down -v`), incluso siendo temporales | 6.9 | Claude con PA específico |

## Pasos de F6 y verificación

| Paso | Qué se hace | Se comprueba |
|---|---|---|
| **6.1** Replay aislado (backend) | `sql/004_esquema_f6.sql`; destino parametrizado del consumidor; paquete `replay/` (selección, casos controlados, productor con velocidad); consumidor de replay bajo demanda | SC-001, SC-003 |
| **6.2** Replay en API y panel | `mode`/`run` en los tres endpoints; selector y etiqueta «REPRODUCCIÓN»; verificación de velocidad, identidad y separación | SC-002, SC-004, SC-005 |
| **6.3** Integración, aceptación y regresión | Rastro de un evento real; ocho filas de §11 con evidencia (la novena, reiniciar el consumidor, en 6.8 y las dos del túnel en 6.6); regresión 661 + 88 + nuevas; saneamiento de `matriz_51/52` | SC-006, SC-007, SC-017 |
| **6.4** Mediciones | Tiempo y memoria a 10³, 10⁴ y 10⁵ en versiones por id, integración geográfica y ventanas | SC-010 (parte) |
| **6.5** Comparaciones y costes | Secuencial/diccionario y SQL sin/con índice; 100 millones; informe de complejidad y costes | SC-010, SC-011 |
| **6.6** ngrok y Netlify | Preparación y verificación **locales** (CORS, build, `config.json`, escaneo de secretos); publicación y fila del túnel tras PA-8 | SC-014, SC-006 (túnel) |
| **6.7** Accesibilidad, responsive y compatibilidad | Guion con lector de pantalla, zoom 200 %, contraste del mapa, anchos y navegadores | SC-012, SC-013 |
| **6.8** Estabilidad, recuperación y persistencia | Ensayos no destructivos con invariantes; ejecución ≤ 60 min | SC-008, SC-009 |
| **6.9** Entregables y cierre | Proyecto paralelo; README, `.env.example`, procedimiento de defensa; lista de la Guía; `resultados.md`; revisión Architect y QA | SC-015, SC-016, SC-019 |
| **6.10** SC-010 de F3 (condicionado) | Consultas de solo lectura de T044 con la autorización PA-10 | SC-018 |

**Orden y paralelismo.** 6.1 → 6.2 → 6.3 es la ruta crítica del código. 6.4, 6.5 y 6.7 no dependen de 6.1 y pueden ir en paralelo con ella; 6.6 (preparación local) puede ir
tras 6.2; 6.8 tras 6.3; 6.9 cierra; **6.10 no está en la ruta crítica**: F6 se cierra técnicamente sin él y se anexa después (A-11).

## Estructura del código (cambios)

```text
backend/src/observatorio/
├── replay/                  # NUEVO: seleccion.py, casos.py, reproducir.py (productor bajo demanda), destino del replay
├── consumer/{main,repositorio,mensaje}.py   # MODIFICA: destino parametrizado (live idéntico a hoy); modo replay admitido solo por el destino replay
├── api/{main,filtros,repositorio,estadisticas}.py  # MODIFICA: mode/run; comparación omitida en replay
└── config.py                # MODIFICA: variables del replay y del destino
sql/004_esquema_f6.sql       # NUEVO: esquema replay (ejecucion, evento_actual, evento_version, cuarentena)
compose.yaml / .env.example  # MODIFICA: variables nuevas y puerto de la API configurable (API_PUERTO); sin servicio nuevo
frontend/src/app/            # MODIFICA: modo (selector), etiqueta, api.service, estado; NUEVOS tests en frontend/tests/
scripts/f6/                  # NUEVO: invariantes, rastro, aceptación, bench, aislamiento_final, preparar-netlify, mutaciones (las matrices de F5 se actualizan en scripts/f5/)
docs/evidencias/f6/          # NUEVO: evidencias, resultados.md, complejidad-costes.md, guion-accesibilidad.md, procedimiento-defensa.md
docs/evidencias/f3/sc-010-observacion-24h.txt   # SOLO en 6.10 con PA-10
```

## Orden de activación

DG1–DG10 se aprueban **juntas en T001**. 1. La migración (PA-2) se aplica antes de recrear nada. 2. Se recrean `consumer`, `producer` y `api` de uno en uno (PA-3), con
`docker compose up -d --build --no-deps <servicio>`, comprobando lag 0 y reconciliación vacía antes y después; Kafka y PostgreSQL no se tocan. 3. El replay (PA-4) usa
`docker compose run --rm --no-deps` (contenedores efímeros). 4. El panel se sirve con `npm start` en local. 5. Los ensayos de fallo y las mediciones de escala usan
**bases y APIs temporales** eliminadas al terminar. 6. Nada se publica hasta PA-8.

## Riesgos y complejidad

Ver [research.md](research.md#r-017--riesgos). Lo añadido (esquema `replay`, destino parametrizado, paquete `replay/`, selector del panel) se justifica por el enunciado; se evita
todo lo demás: sin sexto servicio, sin biblioteca nueva, sin borrado de datos y sin depender de las 24 h de SC-010.
