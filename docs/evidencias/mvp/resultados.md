# Resultados observados del MVP (F2) — T045, T046

Fecha: 2026-11-04. Fuentes (todas en esta carpeta): `verificacion-final.txt` (salida real de
`scripts/verificar-mvp.ps1`: 39 comprobaciones, 0 fallidas), `T042-arranque-limpio.txt`, `T039-analisis-offset23.txt`,
`T031-*` (navegador), `T0*-*.txt` y capturas.

**Nota de honestidad:** la primera ejecución del script dio 8 fallos por **errores del propio script** (una variable `$T`
pisada por `$t` y una búsqueda de «usgs» que encontró un comentario), no del sistema; se corrigió y se repitió entera. La
salida de esa primera ejecución se sobrescribió. El script se mejoró después (ver «Comprobaciones mejoradas») y se volvió a
ejecutar completo.

## Criterios de éxito (spec.md)

| Criterio | Resultado observado | Estado |
|---|---|---|
| SC-001 arranque de los 5 servicios | Tras `docker compose down` (PostgreSQL conserva su volumen): **primera ejecución** (imagen propia eliminada, `build --no-cache` + `up --wait`): **21,1 s** (7,9 s de construcción + 13,2 s hasta `healthy`) — imágenes externas ya descargadas, no se midió la descarga; **con imágenes ya construidas**: **13,0 s**. Objetivos: < 10 min y < 3 min | Cumplido, con la limitación de abajo |
| SC-002 evento visible ≤ 2 min | Emisión → mapa (navegador, refresco de 60 s): **51,4 s** y **56,4 s** (2.ª medición hecha justo tras un refresco). Emisión → API: 0,7 s | Cumplido (2 mediciones) |
| SC-003 todo punto etiquetado como sintético | Insignia, ficha, modo y atribución «sintéticos» en el navegador; capturas con 1 evento. No se comprobó con muchos puntos | Parcial |
| SC-004 reenvío ×5 = 1 evento | 1 fila y 1 Feature; lag 0 (en cada ejecución del script) | Cumplido |
| SC-005 reinicio conserva el evento | Mismas filas antes y después de `docker compose restart` y tras `down`/`up` (10 filas conservadas) | Cumplido |
| SC-006 0 filas sintéticas fuera de su espacio | Única tabla del esquema `sintetico`; `CHECK` de prefijo, modo y rangos rechazan inserciones inválidas (4 casos) sin dejar filas; sin URL de USGS en `backend/src`; solo la API publica puerto. No se midió tráfico de red | Cumplido (con la limitación) |
| SC-007 cuatro etapas con evidencia | Consumidor, almacén y API con evidencia automática; mapa con captura y medición | Cumplido |
| SC-008 explicación oral | Depende de la persona estudiante | **Pendiente** |
| SC-009 evento de 25 h guardado y no visible | `synthetic-mvp-002` está en la tabla y no sale en `/api/eventos` ni en el mapa | Cumplido |
| SC-010 retención de Kafka | `retention.ms=86400000`, `retention.bytes=104857600`, `segment.ms=21600000` leídos del broker, también tras recrear el contenedor | Cumplido |

**Limitaciones de SC-001:** PostgreSQL conservaba datos (10 filas) en ambas mediciones; **no** se midió con el almacén vacío
porque exigiría `docker compose down -v`, que borra el volumen y no se ha autorizado. El arranque de Kafka sí fue limpio
(contenedor nuevo, sin mensajes). La descarga de las imágenes de PostgreSQL, Kafka y Python no se midió.

## T042 — `down`/`up` y datos que se pierden

- **Antes** (`T042-arranque-limpio.txt`, sección A): topic con 26 mensajes (offsets 0–25), grupo en offset 26 con lag 0;
  Kafka guarda sus datos en un **volumen anónimo** (no nombrado, sin persistencia declarada) y PostgreSQL en el volumen
  nombrado `observatorio_pgdata` (10 filas). Todos los mensajes ya estaban procesados, así que no se perdió nada pendiente.
- **Después de `down` + `up`:** PostgreSQL conserva las 10 filas y el volumen; la API devuelve 9 (el de 25 h queda fuera);
  Kafka arranca **vacío**: el topic se crea solo (al suscribirse el consumidor) con la misma retención, y el grupo
  de consumo pierde sus offsets. Los volúmenes anónimos antiguos de Kafka quedan huérfanos en Docker (no se eliminaron).
- **Incidencia de trazabilidad:** al recrearse Kafka, los offsets vuelven a 0. `synthetic-mvp-011` quedó con
  `kafka_offset = 0` mientras `synthetic-mvp-010` tiene 25: la terna (topic, partición, offset) guardada en la tabla **no es
  única** entre recreaciones del broker. No afecta a la idempotencia (clave `event_id`). A decidir en F3 (volumen nombrado
  para Kafka o aceptar la limitación).
- **No ejecutado:** `down -v` (destructivo).

## Otras tareas del paso 2.8

| Tarea | Resultado |
|---|---|
| T016 | Cinco servicios `healthy`; Python 3.13.18, aiokafka 0.15.0, psycopg 3.3.7 en el contenedor |
| T017 | Con Kafka y PostgreSQL parados, `producer`, `consumer` y `api` siguen en ejecución con `RestartCount = 0` en los tres, y todo se recupera al volver la infraestructura (con emisión posterior correcta) |
| T030 | 40 pruebas pasan (Python 3.13.18 en contenedor), con 1 aviso de obsolescencia de `httpx`/`starlette`. Unitarias y de repositorio contra PostgreSQL real; no hay pruebas automáticas de integración de los servicios |
| T032 | Aislamiento, puertos y `CHECK` comprobados |
| T033 | Mensaje `mode: live` publicado a mano: descartado con motivo, sin inserción (por recuento y por id), lag 0 |
| T034 | Insignia y ficha en el navegador |
| T035–T041 | Reenvío, reinicio, 503 con la base parada, Kafka caído al emitir (código 1, no llega al almacén), offset sin confirmar con la base parada (lag 1, «NO se confirma») y recuperación (1 fila, lag 0), caducidad de 24 h y CORS: correctos |
| T042 | Ejecutada (arriba) |
| T043–T044 | `scripts/verificar-mvp.ps1` y `README.md` |

### «Fallo al guardar offset=23» — causa demostrada
Ver `T039-analisis-offset23.txt`. El offset 23 **no se reprocesó**: solo hay una línea GUARDADO, posterior al fallo. Se
reprodujo parando y arrancando solo PostgreSQL con el consumidor ocioso y emitiendo un evento: el primer mensaje encuentra la
conexión cerrada («terminating connection due to administrator command»), el consumidor **no** confirma, reabre la
conexión y guarda 1 s después (1 fila, lag 0). Mi hipótesis anterior (reentrega tras reiniciar Kafka) era incorrecta.
Mejora opcional sin aplicar (fuera del MVP): comprobar la conexión antes de la primera consulta.

## Comprobaciones mejoradas en el script (sin cambiar el alcance)
- Rechazo de 4 inserciones inválidas por los `CHECK` (prefijo, latitud, longitud y modo) y comprobación de que no dejan filas.
- El mensaje rechazado (`mode: live`) tampoco existe en la tabla por id, además del recuento.
- T017 comprueba `RestartCount = 0` en los servicios Python, no solo «running».
- Los ids de los eventos nuevos son la siguiente secuencia libre, así que el script se puede repetir (añade 4 eventos por
  ejecución).

## T046 — Lista de salida de la excepción `synthetic` (sin ejecutar)

Plazo: como máximo al cerrar el paso 3.1, antes de la ingesta real del paso 3.2. El literal aparece en más sitios que los
tres previstos en las tareas, por diseño de `data-model.md` y de T029:

1. `backend/src/observatorio/sintetico.py`: `MODO_MVP`, `SOURCE`, `PREFIJO_ID` (único punto del literal en Python;
   lo importan `api/repositorio.py` y `consumer/mensaje.py`).
2. `sql/001_esquema_sintetico.sql`: `CHECK (mode = 'synthetic')` y `CHECK (event_id LIKE 'synthetic-%')`.
3. `frontend/src/app/app.component.ts` y `.html`: lectura de `metadata.mode === 'synthetic'`, insignia, línea de la ficha,
   texto del modo y atribución.
4. `backend/src/observatorio/producer/emitir_sintetico.py`: texto de ayuda del id.
5. Pruebas en `backend/tests/unit/`.
6. `compose.yaml`/`.env.example`: topic `terremotos.sintetico` y grupo `consumidor-sintetico`.

`metadata.last_ingestion` tiene hoy el significado provisional «último mensaje sintético procesado»; el contrato del profesor
lo define como la última consulta correcta a USGS (se redefine en los pasos 3.2 y 3.6).

## Pendiente y deuda declarada

- **SC-008:** explicación oral (persona estudiante).
- **No medido:** arranque con el almacén vacío (`down -v`), descarga de imágenes, tráfico de red.
- **Deuda de F3:** comparación de versiones por `updated` (hoy `DO NOTHING`), cuarentena duradera de mensajes inválidos,
  `last_ingestion` definitivo, trazabilidad de offsets entre recreaciones de Kafka.
- **Revisión Architect/QA (2026-11-04):** sin bloqueantes; Architect «conforme con reservas» (excepción `synthetic` y
  `last_ingestion`, recogidos arriba); QA señaló los criterios parciales, ya medidos o declarados aquí.
