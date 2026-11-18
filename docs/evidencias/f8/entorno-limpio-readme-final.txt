# PA-11 · README final en un entorno limpio paralelo · 2026-11-17T23:07:32Z
Proyecto: -p observatorio_limpio_3 · API_PUERTO=8010 · BACKEND_IMAGE=observatorio-backend-limpio · INGESTA_PUBLICAR=false · base: .env.example (sin clave) con una contraseña de PostgreSQL generada solo para este ensayo (archivo fuera del repositorio; no se imprime)
Código: el árbol de trabajo en el commit bd6877b (sin cambios de código desde entonces; hay documentación sin commitear).
## ANTES (sistema real)
ids: api=c1afbe883370 consumer=a42c78179cc4 kafka=8334b55b327c postgres=9e078ba23d42 producer=39c9e2fd236d 
imagen real: sha256:134e592a4ed6
volúmenes reales: observatorio_kafkadata=2026-11-06T16:51:57Z observatorio_pgdata=2026-11-04T18:34:02Z 
healthy: 5
API_CLAVE_ACCESO en el archivo de entorno limpio: 
## compose config del proyecto limpio (nombre, puerto, imagen)
        published: "8010"
    image: apache/kafka:4.3.2
    image: observatorio-backend-limpio
    image: postgres:17.11
name: observatorio_limpio_3
## 1. build desde cero (--no-cache)
 Image observatorio-backend-limpio Built 
 Image observatorio-backend-limpio Built 
 Image observatorio-backend-limpio Built 
(build: 13 s)
## 2. README paso 2: up --build -d --wait postgres kafka
 Container observatorio_limpio_3-postgres-1 Started 
 Container observatorio_limpio_3-kafka-1 Started 
 Container observatorio_limpio_3-postgres-1 Waiting 
 Container observatorio_limpio_3-kafka-1 Waiting 
 Container observatorio_limpio_3-postgres-1 Healthy 
 Container observatorio_limpio_3-kafka-1 Healthy 
(postgres y kafka healthy: 8 s)
## 3. README paso 3: esquemas creados al inicializar el volumen (sql/001–005)
esquemas: geo,historico,live,replay
funcion live.emsc_duplicado (005): 1
tablas live.consulta_fuente y live.estado_fuente (005): 2
## 4. README paso 3: catálogo de países
 Container observatorio_limpio_3-producer-run-c3be2c8329d0 Creating 
 Container observatorio_limpio_3-producer-run-c3be2c8329d0 Created 
Catálogo paises.geojson sha256=d2aec98bfd1ffda2d8adea42b7ec473365eef38defc48e83afb7d58ae60bfe7c entidades=177
geo.catalogo: versión nueva registrada
geo.pais: nuevos=177 actualizados=0 sin_cambios=0
(catálogo: 2 s)
## 5. README paso 3: carga histórica de 2025 (exportación a una carpeta temporal NUEVA y vacía, para no tocar data/historico real)
RESUMEN {"tramos_nuevos": 12, "tramos_reutilizados": 0, "tramos_subdivididos": 0, "tramos_con_error": 0, "errores": [], "obtenidos": 18302, "duplicados": 0, "fuera_de_tramo": 0, "eventos_nuevos": 18302, "cuarentena_nueva": 0, "peticiones_http": 24, "archivos_exportados": 12, "asignaciones": 18302, "asignacion_total_s": 0.164, "asignacion_max_ms": 0.617, "descarga_s": 11.281, "duracion_s": 17.449, 
tramos con línea «tramo»: 12 · líneas ERROR: 0
(carga histórica: 19 s)
## 6. README paso 4: up -d --wait de los cinco servicios
 Container observatorio_limpio_3-api-1 Waiting 
 Container observatorio_limpio_3-postgres-1 Waiting 
 Container observatorio_limpio_3-kafka-1 Waiting 
 Container observatorio_limpio_3-postgres-1 Healthy 
 Container observatorio_limpio_3-kafka-1 Healthy 
 Container observatorio_limpio_3-api-1 Healthy 
 Container observatorio_limpio_3-producer-1 Healthy 
 Container observatorio_limpio_3-consumer-1 Healthy 
(cinco servicios healthy: 7 s)
api=running/healthy puertos=127.0.0.1:8010->8000/tcp
consumer=running/healthy puertos=
kafka=running/healthy puertos=9092/tcp
postgres=running/healthy puertos=5432/tcp
producer=running/healthy puertos=
## 7. README paso 5 y comprobaciones del proyecto limpio
historico.evento=18302 · geo.pais=177 · replay.ejecucion=0 · live.evento_actual=0
API limpia (127.0.0.1:8010) /api/salud → HTTP 200
API limpia (127.0.0.1:8010) /api/eventos → HTTP 200
API limpia (127.0.0.1:8010) /api/eventos?mode=replay → HTTP 200
API limpia (127.0.0.1:8010) /api/eventos?fuente=emsc → HTTP 200
API limpia (127.0.0.1:8010) /api/estadisticas → HTTP 200
contenido de /api/salud: {"status":"ok","database":"ok","last_ingestion":1794956900802,"generated":1794956907526,"ingestion_age_s":6,"stale":false,"stale_after_s":300,"gaps_pending":0,"live_since":null,"fuentes":{"emsc":{"activa":false,"last_ingestion":null,"ingestion_age_s":null}}}
puertos publicados del proyecto limpio: api=127.0.0.1:8010->8000/tcp
ps final: api=healthy consumer=healthy kafka=healthy postgres=healthy producer=healthy 
## 8. bajar SOLO el proyecto limpio, sin -v
 Container observatorio_limpio_3-producer-1 Removing 
 Container observatorio_limpio_3-producer-1 Removed 
 Container observatorio_limpio_3-kafka-1 Stopping 
 Container observatorio_limpio_3-postgres-1 Stopping 
 Container observatorio_limpio_3-postgres-1 Stopped 
 Container observatorio_limpio_3-postgres-1 Removing 
 Container observatorio_limpio_3-postgres-1 Removed 
 Container observatorio_limpio_3-kafka-1 Stopped 
 Container observatorio_limpio_3-kafka-1 Removing 
 Container observatorio_limpio_3-kafka-1 Removed 
 Network observatorio_limpio_3_observatorio Removing 
 Network observatorio_limpio_3_observatorio Removed 
volúmenes del proyecto limpio (conservados por down): observatorio_limpio_3_kafkadata observatorio_limpio_3_pgdata 
## DESPUÉS (sistema real)
ids: api=c1afbe883370 consumer=a42c78179cc4 kafka=8334b55b327c postgres=9e078ba23d42 producer=39c9e2fd236d 
imagen real: sha256:134e592a4ed6
volúmenes reales: observatorio_kafkadata=2026-11-06T16:51:57Z observatorio_pgdata=2026-11-04T18:34:02Z 
healthy: 5
contenedores limpios restantes: 0 · red limpia restante: 0
FIN 2026-11-17T23:08:37Z

## Limpieza (con la autorización PA-11 de la persona estudiante, 2026-11-17)
Eliminados SOLO los recursos de este ensayo, identificados por la etiqueta del proyecto `observatorio_limpio_3`: los volúmenes `observatorio_limpio_3_pgdata` y `observatorio_limpio_3_kafkadata`, la imagen `observatorio-backend-limpio` y el archivo de entorno temporal (fuera del repositorio, con la contraseña generada). Después: 0 volúmenes temporales, 0 contenedores y 0 redes del proyecto limpio; el sistema real sigue con sus 5 servicios `healthy`, `observatorio_pgdata` y `observatorio_kafkadata` intactos y `data/historico` sin cambios.

## Lectura (añadida tras la ejecución)
- **Resultado**: siguiendo los pasos 2 a 5 del README final, los cinco servicios del proyecto paralelo llegaron a `healthy` sin pasos no documentados. Build sin caché de capas 13 s, PostgreSQL y Kafka 8 s, catálogo 2 s (177 entidades), histórico 19 s (**18 302 eventos**, 12 tramos, 24 peticiones HTTP, 0 duplicados, **0 errores**), cinco servicios 7 s.
- **Cubre lo añadido desde F6**: el volumen nuevo ejecutó `sql/005_fuente_emsc.sql` al inicializarse (existe `live.emsc_duplicado` y las dos tablas de fuente adicional) y la API responde 200 en `/api/salud`, `/api/eventos`, `/api/eventos?mode=replay`, `/api/eventos?fuente=emsc` y `/api/estadisticas`. `/api/salud` informa `fuentes.emsc.activa = false`, lo esperado con `INGESTA_PUBLICAR=false` (EMSC solo se consulta con la publicación activa).
- **Desviaciones respecto a «README tal cual»**: (1) `-p observatorio_limpio_3` y `--env-file` con un archivo temporal basado en `.env.example` (sin clave de API, contraseña de PostgreSQL generada, `API_PUERTO=8010`, `BACKEND_IMAGE=observatorio-backend-limpio`, `INGESTA_PUBLICAR=false`) en lugar de `cp .env.example .env`; (2) la exportación del histórico va a una carpeta temporal nueva y vacía, no a `data/historico` (así no se toca el original ni se repite la reserva de F6, que reutilizó una carpeta y dio 12 errores de «ya existe»); (3) se usó la misma copia de trabajo (commit `bd6877b`, sin cambios de código desde entonces; la documentación tenía cambios sin commitear), no un clon nuevo.
- **No se ejecutó** el paso 6 del README (panel Angular con `npm ci` y `npm start`) ni la ingesta real (`INGESTA_PUBLICAR=true`) en el proyecto limpio, ni se probó el comando manual de los esquemas para un volumen ya existente. La verificación del panel y de la ingesta real está en las demás evidencias de F8 (sistema real y web publicada).
- **Limitaciones**: una sola máquina y con las imágenes base (`python`, `postgres`, `kafka`) ya descargadas.
- **Sistema real**: mismos ids de contenedor, misma imagen, mismos volúmenes (nombre y fecha) y cinco `healthy`, antes y después.
