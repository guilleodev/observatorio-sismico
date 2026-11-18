# Resultados de la fase F6 — Replay, pruebas, mediciones y despliegue (T070)

> **Nota del 2026-11-17**: este documento recoge el estado de la fase en su fecha. Lo que figura aquí como pendiente o abierto se resolvió después o consta como reserva en el [Anexo C de la memoria](../../entrega/memoria.md#anexo-c--reservas-de-esta-memoria) y en la [matriz de trazabilidad](../../entrega/matriz-trazabilidad.md).

Resultado **observado** de cada criterio de `specs/005-replay-despliegue-final/spec.md`. Solo se marca «cumplido» lo comprobado con evidencia guardada en esta carpeta (`docs/evidencias/f6/`); las reservas figuran junto a cada criterio.
Estado al cerrar (2026-11-09): cinco servicios `healthy` con los mismos contenedores y volúmenes desde 2026-11-08, lag 0, reconciliación 0, **964 pruebas de backend y 130 de frontend** (`6.9-regresion-final.txt`), aislamiento OK en 56 comprobaciones (`aislamiento.txt`), ngrok cerrado, dashboard publicado, API protegida con clave (401 sin ella).

## 1. Criterios de éxito

| SC | Resultado | Evidencia y reservas |
|---|---|---|
| SC-001 replay exacto y sin tocar live/historico/sintetico | **Cumplido** | 35 actuales / 37 versiones / 1 cuarentena en cada ejecución (`6.1-replay-real.txt`, `6.8-estabilidad.txt`); huellas intactas (`aislamiento.txt`). |
| SC-002 cadencia, velocidad y tiempo original | **Cumplido (medido)** | Duración observada 76,1 s frente a 76,0 s previstos, ×31,9 y ×127,6; tiempos originales 30/30 idénticos (`6.2-velocidad-identidad.txt`). |
| SC-003 seis casos controlados | **Cumplido** | `6.1-replay-real.txt`, `6.1-replay-ensayos.txt`. |
| SC-004 `mode` en la API | **Cumplido** | `6.2-api-real.txt`, matriz `6.2-*`; modo desconocido → 422. |
| SC-005 «REPRODUCCIÓN» en el panel | **Cumplido** (revisión humana confirmada el 2026-11-09: `6.9-revision-humana.md`) | `6.2-panel.txt`, `6.6-publicacion.txt` §3 (panel real, 35 eventos, vuelta a vivo sin datos de replay). Reserva: revisión humana del panel. |
| SC-006 once pruebas de §11 | **Cumplido** | Once = 8 en `6.3-aceptacion.md` (evento nuevo, reenvío de la misma versión, revisión, evento antiguo, coordenadas inválidas, evento marítimo, magnitud nula y replay) + 1 reinicio del consumidor (`6.8-consumidor.txt`) + 2 del túnel, cerrarlo y reabrirlo (`6.6-tunel.md`; con el túnel abierto como línea base). |
| SC-007 regresión (661 + 88 más las nuevas) | **Cumplido** | 964 backend + 130 frontend, build OK (`6.9-regresion-final.txt`); aislamiento de F4/F5 en OK. |
| SC-008 lag 0, reconciliación 0, 0 duplicados, huellas | **Cumplido con reserva** | Cinco ensayos `stop`/`start` y estabilidad de 60 min (`6.8-*`). Reserva: T060 se superó con un **reinicio natural del PC**, no con un reinicio controlado de Docker Desktop (`6.8-reinicio.txt`). |
| SC-009 volúmenes y 0 operaciones destructivas | **Cumplido con reserva** | Mismos volúmenes (nombre y fecha) tras todo. **T063 (`down`/`up`) NO se ejecutó por decisión de la persona estudiante.** |
| SC-010 mediciones a tres tamaños y comparaciones | **Cumplido con reservas** | `6.4-mediciones.txt`, `6.5-comparaciones.txt`, `complejidad-costes.md`; umbrales aprobados y verificados. Reservas: una sola máquina; 100 millones es proyección lineal, no medición. |
| SC-011 complejidad y costes | **Cumplido con reservas** | `complejidad-costes.md`; los datos de costes propios de la persona estudiante constan como `[PENDIENTE]`/`[SUPUESTO]`. |
| SC-012 accesibilidad | **Cumplido con reservas** | `guion-accesibilidad.md`, `6.7-lector.md`, `6.7-correcciones.txt`: lector de pantalla real solo Narrador + Edge; NVDA/JAWS no probados. |
| SC-013 responsive y navegadores | **Cumplido con reservas** | `6.7-responsive.txt`, `6.7-compatibilidad.md`: Chromium/Edge verificados; Firefox, Safari/iOS y móvil físico **reserva**. |
| SC-014 URL de Netlify, datos reales vía ngrok, preflight | **Cumplido** | `6.6-publicacion.txt`, `6.6-tunel.md`, `6.6-acceso-api.txt` y `6.9-movil.md` (móvil Android con datos móviles: 401 sin clave, luego 200 en Live y Replay; ngrok cerrado después). Reserva menor: un solo móvil, sin capturas. |
| SC-015 entorno limpio | **Cumplido con reservas** (tras corregir el README) | `6.9-entorno-limpio.txt`; defecto previo en `6.9-entorno-limpio-intento1.txt`. Reservas: una máquina, imágenes base en caché; en el 2.º intento la exportación del histórico dio 12 avisos «ya existe con otro contenido» por reutilizar la carpeta del intento 1 (los datos se cargaron; el intento 1 tuvo 0 errores). |
| SC-016 lista final de 13 puntos | **Lista elaborada; 5/13 verificados** | `lista-final.md`: 5 verificados, 3 con reservas, 1 parcial y 4 pendientes (F7 o persona estudiante), ninguno como superado sin ejecutarse. |
| SC-017 matrices de F5 | **Cumplido** | `6.3-matrices.txt`, `6.2-mutaciones-*.txt`. |
| SC-018 SC-010 de F3 «pendiente de observación» | **Cumplido (pendiente de observación)** | 0 mediciones prolongadas iniciadas; `docs/evidencias/f3/sc-010-observacion-24h.txt` no existe. Bloque 6.10 (T075–T077) sin hacer. |
| SC-019 0 datos borrados, 0 temporales, 0 secretos, solo la API | **Cumplido** | `aislamiento.txt` (OK), `escaneo_secretos.sh` (0 avisos). Los 4 volúmenes temporales `observatorio_limpio*` y la imagen `observatorio-backend-limpio` se eliminaron con PA-11 expresa y nombres exactos (`6.9-limpieza-pa11.txt`); el sistema real quedó intacto. |

## 2. Requisitos funcionales por bloques
- Replay (FR-001–FR-007, FR-014): esquema, topic y grupo propios, consumidor reutilizado con destino, casos controlados y `mode` en la API: cumplidos (6.1, 6.2).
- Pruebas y mediciones (FR-008–FR-013): 6.3, 6.4, 6.5. Despliegue (FR-019–FR-031, FR-041): 6.6 y 6.7. Recuperación y estabilidad (FR-015–FR-018): 6.8; la recuperación de un hueco real de USGS sigue siendo **reserva** (`6.8-huecos.txt`).
- Entregables y reproducibilidad (FR-032–FR-040): README, `.env.example`, procedimiento de defensa, reproducción histórica, lista final, aislamiento y regresión (6.9). Decisiones DG1–DG10 aprobadas (spec.md); DG7 aplicada en T065 y DG8 en 6.8.

## 3. Métricas clave
Replay: 39 mensajes → 35/37/1, ×31,9 en 76 s. Estabilidad de 60 min: 13 muestras, 0 reinicios, 0 líneas de error, lag y reconciliación 0 (memoria de Kafka 506 → ≈1000 MiB y estable ≈978 MiB; el resto plano). Recuperación: 5 servicios parados y arrancados; cola real del consumidor 0→7→0 en ≈10 s. Entorno limpio: 36 s hasta cinco `healthy` (sin build), 18 302 eventos de 2025 cargados en 20 s (el segundo intento con avisos de exportación por reutilizar carpeta). Regresión: 964 + 130.

## 4. Incidencias y defectos corregidos en el cierre (6.9)
1. **README, paso 2** (SC-015): `up --build -d --wait` de los cinco servicios fallaba en una instalación nueva porque el consumidor no está `healthy` hasta cargar el catálogo → reordenado (postgres+kafka → catálogo → histórico → los cinco).
2. **README, paso de esquemas manuales**: omitía `004_esquema_f6.sql` → añadido. README actualizado además a F6 (replay, publicación, recuperación, entorno limpio, mapa de evidencias, cifras de pruebas).
3. **`aislamiento_final.sh`**: esperaba 2 ejecuciones de replay; con la de estabilidad (autorizada, T061) hay 3 → comprobación por nombre de ejecución (no se debilita: sigue exigiendo que no se pierda ninguna).
4. Anteriores de F6 (ya documentadas): agente ngrok desactualizado, dominio mal escrito, healthcheck sin clave en PA-3, despliegue por arrastre que ejecutaba Hugo (se usó Netlify CLI), ensayo de consumidor de 3 min sin cola (repetido con 540 s).

## 5. Limitaciones y reservas pendientes
- **SC-010 de F3 (>24 h) sin observar**: aplazada por decisión de la persona estudiante; no se ha ejecutado nada de 6.10.
- Prueba desde otro dispositivo **hecha** (`6.9-movil.md`; un móvil Android); suspensión del refresco con pestaña realmente oculta **hecha** (`6.9-refresco-oculta.txt`, con refresco de 30 s en local). Observación de usabilidad de la persona estudiante: la actualización del panel se percibe poco (`6.9-revision-humana.md`), mejora candidata para F7.
- T060 con reinicio natural del PC; **T063 no ejecutada**; recuperación de un hueco real de USGS sin probar (solo con catálogo simulado).
- Mediciones de una sola máquina; 100 millones proyectado; cobertura USGS: el feed reciente no cubre M 4,0–4,5 fuera de EE. UU. como el histórico.
- Lector de pantalla real solo Narrador+Edge; Firefox, Safari/iOS y móvil físico sin probar.
- Memoria de Kafka creciente durante 60 min (sin límite de contenedor medido).
- El sitio de Netlify es público por plan gratuito; los datos están protegidos por clave, los ficheros Angular no.
- Pendientes de F7 y de la persona estudiante: memoria (diccionario, modelo, calidad), acceso del profesor al repositorio (hasta la fecha de entrega), explicación individual, commit `[F6]` y push.

## 6. Revisión final independiente (T072)
Ver el apartado 8: Architect y QA Engineer dictaminaron **aprobado con reservas**; los hallazgos relevantes se corrigieron.

## 7. Preguntas de defensa de F6 (T073)
1. **¿Cómo se parametriza el destino del consumidor?** `--destino live|replay` elige topic, grupo y esquema; el SQL de `live` es idéntico carácter a carácter y el de replay solo cambia el esquema/tabla (con `run_id`). Así se reutiliza el mismo código idempotente.
2. **¿Cómo se aísla el replay?** Topic y grupo propios (`ConfigReplay` impide que coincidan con los de vivo), esquema `replay` sin claves foráneas hacia `live`/`historico`, `CHECK` de modo/fuente en la base y consumidor de vivo que descarta lo que no es `live`.
3. **¿Para qué los casos controlados y por qué solo en `replay`?** Demuestran duplicado, revisión, evento antiguo, magnitud nula, marítimo y coordenadas inválidas sin inventar datos en `live` (constitución v1.0.4); llevan ids `replay-ctl-…` y se etiquetan.
4. **¿Qué hace `mode` en la API?** Selecciona el esquema de origen (`live` o `replay`); otro valor → 422; nunca se mezclan en una respuesta.
5. **¿Por qué se conservan las fechas originales?** Para demostrar el pipeline con tiempos reales; el instante de reproducción va aparte (`ingested_at`). Por eso el periodo por defecto de replay es el de la ejecución: un filtro de «últimas 24 h» de 2026 no mostraría eventos de 2025.
6. **¿Qué protege ngrok + CORS?** CORS con orígenes exactos solo evita que otro sitio lea la API desde un navegador; no es autenticación. Por eso la API publicada exige la clave `X-Observatorio-Clave` (401 antes de validar), `API_DOCS=false` y solo `GET`; Kafka y PostgreSQL no se publican.
7. **¿Qué pasa con los mensajes si el consumidor se para?** Esperan en Kafka (volumen `kafkadata`); al volver, el offset confirmado tras guardar y la idempotencia por `(event_id, updated)` evitan duplicados: se observó lag 0→7→0 en ≈10 s sin duplicados.
8. **¿Y con 100 millones de registros?** No se ha medido: es una proyección lineal calibrada a 10^5 (`complejidad-costes.md`); las búsquedas con índice crecen ~O(log n) y las agregaciones ~O(n); propuestas dentro de PostgreSQL (particionado, índices, agregados).
9. **¿Cómo se demuestra la reproducibilidad?** Proyecto Compose paralelo con red, imagen y volúmenes propios que siguió el README hasta cinco servicios `healthy` en 36 s, sin tocar el sistema real; el primer intento halló dos defectos del README que se corrigieron.
10. **Decisión técnica propia:** el offset se confirma después de guardar en PostgreSQL; si se interrumpe y Kafka reentrega, las restricciones y la escritura idempotente evitan duplicar.

## 8. Dictámenes de Architect y QA Engineer (2026-11-09, revisión acotada sobre las evidencias existentes)
- **Architect: APROBADO CON RESERVAS.** Sin hallazgos bloqueantes; arquitectura obligatoria, aislamiento live/historico/sintetico/replay, contrato (`mode` solo `live|replay`) y tecnologías sin objeciones. Observó: (a) T065–T074 y la fila 6.9 sin marcar → marcados tras este dictamen; (b) SC-006 sin enumerar las once pruebas → enumeradas; (c) SC-016 y punto 2 de la lista final sobreafirmados → rebajados («lista elaborada; 5/13») y «verificado con reservas»; (d) reserva de revisión humana en SC-005 → visible. Limitación del revisor: no abrió los archivos `6.*`.
- **QA Engineer: APROBADO CON RESERVAS.** Muestreó 10 filas (SC-001, 002, 007, 008, 009, 015, 018, 019, lista final y entorno limpio) contra sus evidencias: todas OK salvo una **falla parcial**: el paso 5 del 2.º intento del entorno limpio mostraba 12 errores de exportación no reflejados → reconocida en SC-015 y en `6.9-entorno-limpio.txt`. README coherente con `compose.yaml`, `.env.example` y `sql/`; `tasks.md` y hoja de ruta sin marcas sin respaldo; sin `.env` ni credenciales (escaneo 0 avisos, `git diff --check` sin errores, solo avisos LF→CRLF). Estado vivo: lag 0, reconciliación 0, 0 duplicados, cinco `healthy`, mismos ids y volúmenes. No repitió benchmarks ni la regresión (reutiliza `6.9-regresion-final.txt`).
- Defectos corregidos en el cierre: los tres de la sección 4 más estos ajustes de redacción. Ningún bloqueante. Las reservas son las de la sección 5.
