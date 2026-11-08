# Investigación y decisiones técnicas: replay, integración y despliegue (F6)

Cada decisión indica su motivo y las alternativas descartadas. Las marcadas **(DGn)** esperan aprobación (ver [plan.md](plan.md)). Lo ya decidido en F3, F4 y F5 no se repite.

## R-001 — Esquema `replay` y clave `(run_id, event_id)` (DG3)

- **Decisión**: esquema `replay` con `ejecucion`, `evento_actual`, `evento_version` y `cuarentena`, con las mismas columnas que `live` más `run_id` y `caso`. `mode` lleva
  `CHECK (mode = 'replay')` y `source` `CHECK (source = 'replay-historico')`; la clave de `evento_actual` es `(run_id, event_id)` y la de `evento_version` `(run_id, event_id, updated_at)`.
  `country_id` referencia `geo.pais` y no hay `version_publicada` ni `estado_ingesta` (son del productor en vivo).
- **Motivo**: aislamiento a nivel de base (una fila de replay no puede entrar en `live` por el `CHECK` de `live`, ni al revés); repetir con el mismo `run_id` es idempotente y una
  ejecución nueva no pisa ni borra las anteriores; los eventos reproducidos mantienen sus `event_id` reales (no se renombran) sin colisionar con `live`.
- **Alternativas**: mismas tablas de `live` con una columna de modo (rompe el `CHECK` y mezcla); limpiar el esquema entre ejecuciones (operación destructiva sobre datos de prueba).

- **Cuarentena por ejecución**: la huella actual (`sha256(categoria|motivo|event_id|updated_ms)`) no incluye el run y la inserción hace `ON CONFLICT (huella) DO NOTHING`; en `replay.cuarentena` la unicidad es `(run_id, huella)` para que cada ejecución conserve su propio registro (T007 lo prueba con dos `run_id`).

## R-002 — Mensaje y topic de replay

- **Decisión**: topic `terremotos.replay` (una partición, creado por el broker con la retención actual de 24 h y 100 MiB; la clave es el `event_id`, como en vivo). Mensaje: el de
  vivo (`source`, `ingested_at`, `mode`, `event`) con `mode = "replay"`, `source = "replay-historico"`, `ingested_at` = instante de reproducción y un bloque `replay`
  (`run_id`, `seq`, `caso`, `velocidad`). El `event` es el GeoJSON original guardado en `historico.evento.raw`; **`time` y `updated` no se tocan**. Contrato en [contracts/f6.md](contracts/f6.md).
- **Motivo**: el procesamiento existente ya valida `mode`, `source` y el evento; añadir un bloque no rompe la clasificación. Una sola partición conserva el orden.
- **Alternativas**: otro formato de mensaje (más código de validación); desplazar las fechas a «ahora» (prohibido por la FAQ 32: no cambiar fechas originales).

## R-003 — Reutilizar el consumidor con un destino parametrizado (DG1)

- **Decisión**: `RepositorioEventos` recibe un **destino** (esquema `live` o `replay`, validado contra una lista cerrada, y `run_id` solo en replay) y construye su SQL a partir de plantillas. Para `live` el SQL generado es **idéntico carácter a carácter** al actual (una prueba lo compara con una copia congelada del literal actual dentro del propio test). `clasificar_mensaje`, `procesar_registro`, `procesar_con_reintentos`, la geografía y la cuarentena se comparten sin copiar.
- **Alcance real del cambio** (no solo el repositorio): (a) `consumer/mensaje.py` hoy descarta `mode = replay` y limita `source` a `SOURCES_ADMITIDOS`; el clasificador pasa a recibir el modo y la fuente que admite el destino, y `EventoRecibido` gana `run_id` y `caso` (nulos en vivo); (b) las plantillas de upsert (`ON CONFLICT (event_id)` frente a `(run_id, event_id)`, el alias de `updated_at`), de retirada y de cuarentena llevan `run_id` en replay; (c) `consumer/main.py` usa `async for`, que nunca termina: el destino replay necesita un bucle con `getmany(timeout)` para parar por inactividad (R-005); (d) `ConfigKafka` exige `KAFKA_TOPIC`: el destino replay toma el topic y el grupo de `ConfigReplay`.
- **Motivo**: «el productor de replay reutiliza el procesamiento del consumidor» (§11) sin duplicar lógica ni ensuciar el camino en vivo; el riesgo se acota con la prueba de identidad del SQL y la regresión de 661 pruebas.
- **Alternativas**: subclase con su propio SQL (duplica el upsert y la cuarentena); suscribir el consumidor en vivo a ambos topics (un fallo del replay podría bloquear el camino real); sexto servicio (viola los cinco servicios).
- **Adaptación de pruebas**: `test_consultas_solo_sobre_el_esquema_live` pasa a exigir «solo `live` en el destino `live` y solo `replay` en el destino `replay`» y, en 6.2, también cubre `SQL_EVENTOS` de la API, sin debilitar la garantía.

## R-004 — Productor de replay: selección, velocidad y casos controlados (DG3, DG10)

- **Decisión**: `observatorio.replay.reproducir` (bajo demanda) lee `historico.evento` en solo lectura y elige **30 eventos de un mismo día UTC** (por defecto el día de 2025 con más eventos; parámetro `--dia`), ordenados por `(event_time, event_id)`; publica un mensaje cada `REPLAY_INTERVALO_S` (2 s) y registra la ejecución (`replay.ejecucion`: intervalo, tamaño, criterio, día, velocidad, estado). Velocidad = tiempo real cubierto por la selección / duración de la reproducción (factor de aceleración).
- **Seis casos controlados con ids propios `replay-ctl-<caso>`**, copiados de los seis primeros eventos de la selección con magnitud no nula (los eventos reales se publican también tal cual y **no se alteran**); su `time` es el del evento base, así que queda dentro del intervalo de la ejecución; todos los mensajes llevan `replay.caso`:

  | Caso | Base | Mensajes | Resultado esperado |
  |---|---|---|---|
  | `duplicado` | evento 1 | el mismo mensaje dos veces | 1 fila, 1 versión, 1 duplicada descartada |
  | `revision` | evento 2 | v1 = copia; v2 = `updated` + 60 000 ms y `mag` + 0,1 (a 1 decimal) | 1 fila con v2, 2 versiones |
  | `antigua` | evento 3 | v nueva = copia; después v vieja = `updated` − 3 600 000 ms y `mag` − 0,1 | 1 fila con la nueva, 2 versiones (la vieja solo en el historial) |
  | `magnitud_nula` | evento 4 | `mag = null` | 1 fila con magnitud nula, 1 versión |
  | `coordenadas_invalidas` | evento 5 | latitud 123 | 1 registro en cuarentena con su motivo, 0 filas |
  | `maritimo` | evento 6 | coordenadas en un punto del Pacífico que la prueba comprueba que ningún polígono del catálogo cubre | 1 fila `sin_pais`, 1 versión |

- **Oráculo de una ejecución**: 30 + 9 = **39 mensajes**; **35 filas** en `evento_actual` (30 + 5), **37 versiones** (30 + 1 + 2 + 2 + 1 + 1), **1** en cuarentena y 1 duplicado descartado (SC-001). Duración por defecto: 39 × 2 s = 78 s.
- **Motivo**: respeta §11/FAQ 32 (fechas originales, duplicado y revisión controlados), es determinista y repetible, y no fabrica datos bajo un id real (una revisión con otra magnitud sobre un id de USGS lo haría).
- **Alternativas**: derivar los casos sobre ids reales (fabrica datos bajo un id real); elegir al azar (no reproducible); más eventos o menos intervalo (se configura).

## R-005 — Consumidor de replay bajo demanda (DG1)

- **Decisión**: `python -m observatorio.consumer.main --destino replay` con `docker compose run --rm --no-deps`, grupo `consumidor-replay`, topic `terremotos.replay`, misma imagen y variables; confirma el offset después de escribir (igual que en vivo) y **termina solo**: la cuenta de inactividad (`REPLAY_ESPERA_FINAL_S`, 10 s) empieza **tras el primer mensaje procesado** y, si nunca llega ninguno, un tope de `REPLAY_ESPERA_MAX_S` (120 s) evita esperar sin fin; una prueba con un productor lento comprueba que no termina antes de tiempo.
- **Estado de la ejecución**: lo escribe el productor (`en_curso` al crearla, `terminada` tras publicar y confirmar el último mensaje). Si se interrumpe queda `en_curso`; reanudar (`--reanudar <run_id>`) vuelve a publicar **la selección completa** con el mismo `run_id`, que el procesamiento idempotente absorbe sin duplicar y sin depender de la retención de Kafka (24 h).
- **Motivo**: sin servicio permanente, el replay no compite con el camino real y la demostración son dos comandos.
- **Alternativas**: dejarlo corriendo (consume recursos y es un sexto servicio de hecho).

## R-006 — API: parámetro `mode` (DG2)

- **Decisión**: `mode=live` (por defecto) o `replay` en los tres endpoints, más `run` opcional (por defecto, la ejecución más reciente); otro valor → 422. En `replay` solo se lee
  `replay.*`; el periodo por defecto es el intervalo de la ejecución (tiempo original del primer al último evento), no «últimas 24 h»; `metadata.replay` describe la ejecución; la
  comparación con 2025 se devuelve como no aplicable con su motivo; `/api/salud?mode=replay` añade el bloque `replay` y no cambia `last_ingestion`. Sin `mode`, las respuestas son
  idénticas a las de F5. Se amplía `test_aislamiento_api.py`: solo el camino `replay` toca `replay.*` y el de `live` nunca.
- **Motivo**: es el uso previsto de `metadata.mode` del contrato y no añade rutas; los mismos filtros valen en ambos modos.
- **Alternativas**: rutas `/api/replay/*` (duplica endpoints y pruebas).

## R-007 — Panel: selector y etiqueta «REPRODUCCIÓN»

- **Decisión**: un selector visible en el panel (inicial `live`) cambia el modo sin recompilar; en replay el periodo por defecto sale de `metadata.replay`, se muestra «REPRODUCCIÓN» en
  el mapa, la tabla, la ficha, las gráficas y el estado, y se oculta la tarjeta de comparación con un aviso. Cambiar de modo descarta la lectura anterior (no se mezclan) y cancela la
  petición en vuelo. El modo `demo` de `config.json` no cambia. Pruebas de lógica pura en `frontend/tests/` y comprobación en el navegador.
- **Alternativas**: modo solo en `config.json` (obliga a recompilar y republicar en la defensa).

## R-008 — Pruebas de aceptación de §11: cómo se ejecuta cada fila

| Prueba (§11) | Cómo se ejecuta | Dónde |
|---|---|---|
| Evento nuevo | Rastro de un evento real (consulta a USGS → mensaje → versión → fila → API → panel) y, en replay, un evento nuevo reproducido | 6.3 |
| Reenviar la misma versión | Caso `duplicado` y reenvíos naturales del feed cada minuto (recuentos estables) | 6.3 |
| Versión posterior | Caso `revision`: cambian datos y agregaciones | 6.3 |
| Versión antigua | Caso `antigua`: queda en el historial sin sustituir | 6.3 |
| Magnitud nula | Caso `magnitud_nula`: conservada y mostrada como ND | 6.3 |
| Coordenadas inválidas | Caso `coordenadas_invalidas`: cuarentena con motivo, sin punto | 6.3 |
| Evento marítimo | Caso `maritimo`: «Sin país asignado» y presente en el análisis | 6.3 |
| Reiniciar consumidor | `stop`/`start` del consumidor real con PA-5; lag 0 y reconciliación vacía | 6.8 |
| Cerrar el túnel | Parar ngrok y observar el panel (aviso y última lectura) | 6.6 tras PA-8 |
| Reabrir el túnel | Reabrirlo y ver la recuperación automática | 6.6 tras PA-8 |
| Reproducción histórica | Replay completo con el panel en modo reproducción | 6.2–6.3 |

Los seis primeros casos pasan por el mismo procesamiento del consumidor pero en el esquema `replay`; en `live` solo se **observan** duplicados y revisiones reales. 6.3 cubre ocho de
las once filas: «Reiniciar consumidor» en 6.8 y las dos del túnel en 6.6; el informe lo indica fila a fila.

## R-009 — Saneamiento de `matriz_51.py` y `matriz_52.py`

- **Decisión**: actualizar solo las tres aserciones obsoletas (claves de `/api/salud`; claves de `/api/estadisticas`; ausencia del texto «historico» en las estadísticas) al contrato
  vigente, ejecutarlas hasta OK y comprobar con una regresión introducida a propósito que siguen detectando. La evidencia de `docs/evidencias/f5/` no se reescribe: se añade una
  nota con la fecha de la actualización. Si algo no se pudiera mantener, se marca el script como evidencia histórica.
- **Alternativas**: dejarlas fallando (ruido en la defensa); borrarlas (se pierde la trazabilidad de F5).

## R-010 — Mediciones de tiempo y memoria (6.4)

- **Decisión**: `scripts/f6/` mide en un **contenedor PostgreSQL temporal propio** (como en F5; nunca `CREATE DATABASE` en el servidor real, para no competir con la ingesta) y un contenedor de medida, con tres tamaños (1 000, 10 000 y 100 000; opcional ≈ 183 000 como en F5): (a) búsqueda de versiones por `event_id`; (b) integración geográfica (asignador del catálogo frente a recorrido secuencial de los 177 polígonos); (c) agregación por ventanas de 1 h (Python frente a SQL). Tiempo con reloj monotónico (mediana y p95 de repeticiones); memoria con el pico de `tracemalloc` y el máximo residente del proceso, un proceso por tamaño. Las réplicas se marcan como sintéticas (`origen`) y desaparecen con el contenedor. Se anota el equipo y su estado.
- **Motivo**: cumple §10 (tres tamaños, tiempo y memoria, sintético fuera del análisis real) y reutiliza las cifras de F4 y F5 como referencia sin repetirlas.

## R-011 — Comparaciones, 100 millones, escalado y costes (6.5)

- **Decisión**: secuencial frente a diccionario (Python) y consulta sin y con índice (tabla de prueba sin clave frente a la clave primaria); coste medio y peor caso razonados (O(n) frente a O(1) esperado y O(log n)); proyección a 10⁸ con memoria y disco medidos por fila, tamaño del índice, particionado por tiempo y archivado. El informe (`docs/evidencias/f6/complejidad-costes.md`) incluye **una propuesta de escalado y de mejoras** (§10, §12) y cubre hardware, electricidad, almacenamiento, transferencia, mantenimiento y desarrollo con supuestos explícitos; los datos que solo conoce la persona estudiante (tarifa eléctrica, potencia, horas de desarrollo) se piden o se marcan como supuesto, no se inventan; las cuotas de ngrok y Netlify se consultan en sus páginas oficiales en ese momento y se citan con fecha. Es un borrador que alimenta la memoria (F7, paso 7.2), no la sustituye.

## R-012 — Accesibilidad, responsive y compatibilidad (6.7)

- **Decisión**: guion con teclado, lector de pantalla (NVDA o Narrador, ejecutado por la persona estudiante), zoom del 200 % y reflujo a 320 px; contraste de la capa del mapa medido
  muestreando los píxeles del teselado bajo los círculos y la leyenda, con la tabla como alternativa; matriz de anchos (320, 375, 768, 1024, 1440) y de navegadores: Chromium del panel,
  Chrome real (Claude in Chrome) y Edge/Firefox si existen (manual); móvil emulado más un dispositivo real mediante la URL de Netlify. Se reutiliza el script de comprobación DOM de F5.
  Los hallazgos se corrigen en `frontend/src/app/`; lo no verificable (Safari, lector real si no se ejecuta) queda como reserva. Opcional: un verificador de accesibilidad externo
  inyectado solo en el navegador de pruebas y sin entrar en el repositorio.

## R-013 — ngrok, Netlify y CORS (DG4, DG5, DG6)

- **Decisión**: ngrok instalado en el equipo (`ngrok http 8000`) sobre el puerto ya publicado en `127.0.0.1` (preferencia propia por simplicidad: el token queda fuera de Compose; `ENUNCIADO.md` §9 admite también un contenedor en la misma red); el authtoken vive en la configuración propia de ngrok, fuera del repositorio. Con dominio estático gratuito la URL no cambia entre sesiones.
- **Netlify**: la persona estudiante crea el sitio primero (así se conoce el origen exacto). `scripts/f6/preparar-netlify.*` escribe la URL HTTPS de ngrok en `public/config.json` **antes de compilar** (como pide §9), con `skipNgrokWarning: true`, ejecuta `npm run build` y **restaura el original** comprobando su hash, de modo que el repositorio conserva `http://127.0.0.1:8000`; se publica el build con arrastrar o el CLI de Netlify. `API_CORS_ORIGINS` pasa a `https://<sitio>.netlify.app,http://localhost:4200` (variable del `.env` local; recrear `api` con PA-3), sin comodines.
- **Antes de publicar** se comprueba en local: preflight con `Origin` simulado, build, escaneo de secretos y que Kafka/PostgreSQL no se alcanzan; además se **enumeran las rutas que salen por el túnel** (FastAPI sirve `/docs`, `/redoc` y `/openapi.json`; no son rutas de administración, pero se decide si salen). `netlify.toml` declara Node 22; al compilar en local no afecta y se documenta (Angular 20 admite 22.12+). Configuración sin secretos en [contracts/f6.md](contracts/f6.md).
- **Alternativas**: escribir la URL solo en la copia de `dist` (se aparta de la letra de §9); despliegue conectado a Git (push y Node 22 en la plataforma); ngrok en contenedor (sexto servicio).

## R-014 — Estabilidad, recuperación y persistencia (DG8)

- **Decisión**: ensayos uno a uno con `scripts/f6/invariantes` antes y después (lag, reconciliación, offsets duplicados, huellas del histórico y de `sintetico`, ids de contenedores y
  volúmenes): consumidor, productor y API con `stop`/`start`; Kafka y PostgreSQL con `stop`/`start` (F3 ya los reinició); reinicio de Docker Desktop y del equipo por la persona
  estudiante (el 2026-11-08 ya se observó uno natural); `down` sin `-v` solo si se autoriza. Estabilidad: ≤ 60 min con ingesta real y un replay, midiendo errores, reinicios y memoria
  de los contenedores (`docker stats`). Recuperación de huecos: se documenta; sin hueco real de USGS sigue siendo reserva.
- **Dos consumidores, dos ensayos**: (a) la fila «Reiniciar consumidor» de §11 es el servicio `consumer` **en vivo**: se para mientras el productor sigue ingiriendo, los mensajes esperan en Kafka y al arrancar el lag se drena sin duplicados; (b) la caída del consumidor de **replay** (contenedor efímero) se simula con `docker kill` en mitad de una reproducción y se repite: sin duplicados.
- **Prohibido siempre**: `down -v`, borrar volúmenes o datos, recrear Kafka o PostgreSQL, `docker system prune`.

## R-015 — Entorno limpio con un proyecto Compose paralelo (DG7)

- **Decisión**: `docker compose -p observatorio_limpio` con otro `.env`, puerto de API distinto (`API_PUERTO`, por defecto 8000), **etiqueta de imagen propia** (`image: ${BACKEND_IMAGE:-observatorio-backend}`, para que construir el proyecto paralelo no re-etiquete la imagen de los contenedores reales), `INGESTA_PUBLICAR=false` y volúmenes propios (`compose.yaml` fija `name: observatorio`, así que **siempre** se pasa `-p`). Se siguen los pasos del README tal cual (esquemas, catálogo, carga histórica por la vía documentada) y se mide el tiempo hasta `healthy`.
- **Limpieza (condición aprobada)**: tras comprobar `docker compose -p observatorio_limpio ps` y `config`, se baja **solo ese proyecto sin `-v`**. Eliminar sus volúmenes `observatorio_limpio_*`, incluso siendo temporales, exige una **autorización específica (PA-11)**, por nombre exacto y previamente listados; sin ella el proyecto queda parado con sus volúmenes. Después se comprueba que los ids de `pgdata` y `kafkadata` reales y de sus contenedores no cambiaron.
- **Riesgos**: memoria de dos Kafka y dos PostgreSQL; la carga histórica vuelve a consultar a USGS y los recuentos pueden diferir si USGS revisó el catálogo (se informa).

## R-016 — SC-010 de F3 como bloque condicionado (6.10)

- **Decisión**: el bloque contiene las consultas de solo lectura de T044 de F3 (eventos con `event_time` anterior a 24 h en `evento_actual` y `evento_version`, y la reconciliación vacía), la
  fecha de activación de referencia (2026-11-06 16:54 UTC) y la salida en `docs/evidencias/f3/sc-010-observacion-24h.txt`. Se ejecuta **solo** con PA-10 y cuando la persona estudiante
  lo diga; no hay medición prolongada ni temporizador. Hasta entonces `resultados.md` dice «pendiente de observación». Los apagados del equipo no invalidan la comprobación (es una
  consulta sobre lo almacenado), pero se anotan.

## R-017 — Riesgos

- Parametrizar el SQL y el clasificador del consumidor puede alterar el camino real → prueba de identidad del SQL de `live`, regresión completa y recreación del consumidor con invariantes y **vuelta atrás**: antes de `--build` se etiqueta la imagen anterior (`docker tag <id> observatorio-backend:previo-f6`) y se anota en T001.
- La API de `replay` no debe filtrarse a `live` (ni al revés) → `CHECK` por esquema, pruebas de aislamiento y huellas.
- Reanudar una reproducción tras más de 24 h: no depende de la retención porque se republica la selección completa (R-005).
- Recargar el catálogo de países (F4) con filas de replay que referencian `geo.pais`: la clave foránea lo impediría; se documenta y no se recarga durante F6.
- La URL gratuita de ngrok cambia sin dominio estático → panel apuntando a una URL muerta: debe mostrar el fallo; procedimiento de actualización documentado.
- Dependencia de cuentas y herramientas de la persona estudiante (ngrok, Netlify, lector de pantalla, Firefox, Chrome real) → guiones y reservas; el cierre técnico no espera (A-11).
- Memoria del equipo al lanzar el proyecto paralelo → PA-7 y comprobación previa de recursos.
- Datos de prueba olvidados (bases, contenedores, topics) → comprobación final de recursos temporales en `aislamiento_final` (el topic y el grupo de replay están exentos, A-13).
- Las mediciones de una máquina no se extrapolan → se declara (reserva heredada). Los umbrales nuevos deben salir de medir y confirmarse.
