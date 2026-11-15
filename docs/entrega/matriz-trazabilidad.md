# Matriz de trazabilidad — Observatorio Sísmico (F8.1)

**Fecha**: 2026-11-11 · **Paso**: F8.1 (T006, T007, T027, T032) · **Estado**: versión inicial, pendiente de revisión por la persona estudiante. Referencia para 8.2–8.5; se actualiza al cerrar cada paso.
Requisitos y fuentes exactas: [`requisitos-fuente.md`](requisitos-fuente.md) (los IDs de esta matriz son los de ese documento). **No se ha ejecutado ninguna prueba, servicio ni observación** para elaborarla: el estado sale de las evidencias guardadas en `docs/evidencias/f3`–`f6`, de `specs/006-mejoras-evolucion/` y de la lectura de los materiales; lo que exige una comprobación nueva va a la sección E (8.3).

## 0. Cómo leer la matriz

**Estados** (nada se da por demostrado solo porque exista código):

| Estado | Significado |
|---|---|
| **VERIFICADO** | Implementado y comprobado, con evidencia guardada y enlazada. |
| **Sin comprobar en dispositivo real** | Lector de pantalla y táctil (D10a/D19), cierre del túnel desde el móvil, navegadores distintos de Chrome |
| **RESERVAS** | Cumplido, pero con una limitación, hueco de documentación o parte pendiente indicada en la fila. |
| **PENDIENTE** | LF-01 (acceso del profesor al repositorio privado), LF-13 (explicación del flujo y de una decisión: en el vídeo), D17 (SC-010, PA-10 no concedida), REPO-02 (permisos y revisión del acceso) |

**Columnas**: Imp. = implementación real · Archivos = archivos, servicios o componentes · Evid. = pruebas y evidencias disponibles · Mem. / README / Vídeo = apartado o bloque previsto (códigos abajo) y pendientes de demostración.

**Escenas del vídeo (máximo 5 min, orden de la rúbrica; su guion es material personal y no está en el repositorio)**: A Apertura · B Extracción · C Calidad · D Modelado · E Análisis · F Reflexión · G Cierre. Lista de capturas: `docs/entrega/capturas-y-evidencias.md`.

| Código | Memoria (`docs/entrega/memoria.md`, = Guía 2.x) | Código | README definitivo | Código | Escena del vídeo (5 min) |
|---|---|---|---|---|---|
| M1 | Objetivo y funcionamiento (2.1) | R1 | Presentación, objetivos y alcance | A | Apertura |
| M2 | Diccionario de datos (2.2) | R2 | Arquitectura y flujo de datos, stack | A | Apertura (flujo en una frase) |
| M3 | Procedencia y consultas (2.3) | R3 | Estructura del repositorio | B | Extracción |
| M4 | Calidad (2.4) | R4 | Instalación, configuración y ejecución segura (Docker, USGS, Kafka, PostgreSQL, FastAPI, ngrok, Netlify) | C | Calidad |
| M5 | Modelo conceptual/lógico/físico, SQL e índices (2.5) | R5 | Frontend Mission Control: Panel · Análisis · Eventos, globo 3D/2D, EN VIVO/REPRODUCCIÓN | D | Modelado |
| M6 | Análisis y ≥ 3 conclusiones (2.6) | R6 | Calidad, modelo, huecos | E | Análisis (panel con filtros) |
| M7 | Complejidad, mediciones, costes y mejoras (2.7) | R7 | Análisis, filtros, estadísticas, comparación | D | Modelado (REPRODUCCIÓN sin mezclar datos) |
| M8 | Evidencias de pruebas (2.8) | R8 | Pruebas y resultados, capturas, evidencias | F | Reflexión (recuperación de fallos y huecos) |
| M9 | Reproducción histórica (2.9) | R9 | **Cumplimiento de la rúbrica** | F | Reflexión |
| M10 | Limitaciones y decisiones | R10 | Evaluación: web publicada, repositorio y ventana | G | Cierre (decisión técnica propia) |
| | | R11 | Limitaciones conocidas | G | Cierre |

## A. Criterios de la rúbrica (ENUNCIADO §13)

| ID | Imp. | Archivos | Evid. | Estado y reservas | Mem. | README | Vídeo / pendiente de demostración |
|---|---|---|---|---|---|---|---|
| **EVA-1** Extracción (carga + exploración + análisis de tipos) | Productor del feed (60 s), carga histórica 2025 por meses y catálogo geográfico | `backend/src/observatorio/producer`, `historico`, `geo`; `data/historico/*.geojson.gz` + `SHA256SUMS` | F3: `3.2-ingesta.txt`, `3.7-ejecucion-continua.txt`; F4: `4.4-carga-real.txt` (18 302 eventos, 12/12 meses = `count` de USGS), `4.1-catalogo.txt` | **RESERVAS**: ejecución verificada; **falta la tabla de tipos, unidades y campos opcionales** y el registro de consultas consolidados (EXT-02, MOD-05) y la latencia/errores documentados en un solo sitio | M2, M3 | R4, R6 | B: mostrar feed, archivos históricos con huellas y catálogo; **pendiente** preparar la tabla de tipos |
| **EVA-2** Calidad (4+ dimensiones → completo + acciones) | Reglas del consumidor, cuarentena con motivo, UTC; análisis de seis dimensiones sobre histórico y live | `consumer/`, `geo/`, `live.cuarentena`; consultas en `sql/` y scripts de `scripts/f3`–`f4` | F3: `3.5-calidad-datos-reales.txt`, `3.5-calidad.txt`; F4: `4.6-calidad.txt` (completitud 100 %, unicidad 18 302/18 302, validez 0 fallos, consistencia, exactitud 40/40) | **RESERVAS**: evidencia sólida, pero **el apartado de calidad con código/consultas, antes/después y decisiones no está redactado** (LF-06 «Parcial»); los casos sintéticos deben quedar separados en el texto | M4 | R6 | C: mostrar consultas y resultados, cuarentena (explosiones excluidas), decisiones (nulos no a cero) |
| **EVA-3** Modelado (modelo optimizado) | Esquemas `live`, `historico`, `replay`; versión + estado actual con upsert idempotente; integración punto-en-polígono; índices medidos | `sql/001`–`004`; `specs/002`–`005/data-model.md` | F3: `3.3-versiones.txt`, `3.4-idempotencia.txt`; F4: `regla-geografica.md`, `4.2-*`; F5: `5.7-explain.txt` (planes con/sin índice) | **RESERVAS**: **sin diagrama conceptual/lógico/físico consolidado** (LF-07 pendiente); índices sin mejora ≥ 2× a volumen real: razonar, no afirmar «optimiza todo» | M5 | R6 | D: mostrar tablas, claves, revisión sin duplicar y plan EXPLAIN; **pendiente** crear el diagrama |
| **EVA-4** Análisis (3+ análisis → insights) | Ventanas horarias UTC, países, distribuciones, comparación 2025, 3 conclusiones | `api/estadisticas.py`, `api/comparacion.py`; `frontend/src/app/graficas`, `comparacion` (vista Análisis de F7) | F5: `conclusiones.md` (3 reproducidas), `5.2-estadisticas-real.txt`, `5.3-comparacion-real.txt`; F4: `4.6-comparaciones.txt` | **RESERVAS**: conclusiones verificadas con la API; **faltan capturas del panel final (F7) con los filtros visibles** (ENUNCIADO §12, Guía 2.6). Conclusión 2 «no concluyente» y 3 «cobertura distinta»: redactar con ese matiz | M6 | R7 | E: Análisis con filtros; F: insights. **Pendiente** capturas T014b/T020b |
| **EVA-5** Reflexión (excelente + propuestas) | Complejidad O(·), mediciones 10³/10⁴/10⁵, comparaciones sin/con índice, modelo de costes | `scripts/f6/bench_*.py`, `modelo_costes.py` | F6: `6.4-mediciones.txt`, `6.5-comparaciones.txt`, `complejidad-costes.md` | **RESERVAS**: una sola máquina; 10⁸ es **proyección**, no medición; **costes `[PENDIENTE]`** dependen de datos de la persona estudiante; mejoras por escribir | M7, M10 | R8, R11 | F: tablas de mediciones, costes con supuestos marcados |

## B. Lista final de comprobación de la Guía (13 puntos) + puntos propios de FAQ 35

Estado de partida: `docs/evidencias/f6/lista-final.md` (2026-11-09), revisado con lo ocurrido desde entonces.

| ID | Imp. y archivos | Evid. | Estado y reservas | Mem. | README | Vídeo / pendiente |
|---|---|---|---|---|---|---|
| **LF-01** Acceso del profesor al repositorio | Remoto `origin` (GitHub, privado) | — (no comprobable desde el entorno) | **PENDIENTE** (CA-05): usuario del profesor y permisos; no se modifican sin decisión expresa | — | R10 | G; checklist T025/T039 |
| **LF-02** README arranca desde entorno limpio | `README.md` (F6) + `compose.yaml`, `.env.example`, `sql/` | `6.9-entorno-limpio.txt` (cinco `healthy` en proyecto paralelo, 36 s), `6.9-entorno-limpio-intento1.txt` (dos defectos corregidos) | **RESERVAS**: verificado con el README de F6 en una sola máquina, imágenes en caché. El README actual **describe el panel anterior** y el definitivo **debe volver a probarse** (T015, PA-11) | M10 | R4 | A; **pendiente** T015 |
| **LF-03** Cinco servicios en Compose | `compose.yaml`: `postgres`, `kafka`, `producer`, `consumer`, `api` (+ volúmenes `pgdata`, `kafkadata`, red `observatorio`) | `aislamiento.txt` (solo la API publicada en 127.0.0.1) | **VERIFICADO** (F6); estado actual de contenedores no revisado hoy (8.3) | M1 | R2, R4 | A |
| **LF-04** Dependencias, Dockerfile, SQL y `.env.example` sin credenciales | `backend/requirements*.txt`, `backend/Dockerfile`, `sql/001`–`004`, `.env.example`; `frontend/package.json` + lock | `6.6-secretos.txt`, `escaneo_secretos.sh` (0 avisos), `aislamiento.txt` (solo `.env.example` versionado) | **VERIFICADO** (F6). **Revisar de nuevo** (T031): historial de Git y que las URLs del túnel presentes en README y evidencias no filtren nada sensible | M10 | R3, R4 | G |
| **LF-05** Campos, unidades, fuentes, filtros y consultas | — (material en `f3/`, `f4/regla-geografica.md`, `specs/*/data-model.md`, `sql/consultas/`, `FUENTES-Y-LICENCIAS.md`) | — | **PENDIENTE**: el diccionario y el registro de procedencia **no están escritos** | M2, M3 | R6 | B |
| **LF-06** Apartado de calidad | Ver EVA-2 | `3.5-*`, `4.6-calidad.txt` | **RESERVAS** (parcial): falta redacción con antes/después | M4 | R6 | C |
| **LF-07** Modelo conceptual, lógico y físico | Ver EVA-3 | `sql/001`–`004`, `5.7-explain.txt` | **PENDIENTE**: falta el documento/diagrama | M5 | R6 | D |
| **LF-08** ≥ 3 conclusiones con filtros identificables | Ver EVA-4 | `f5/conclusiones.md` | **RESERVAS**: conclusiones verificadas; **capturas con filtros pendientes** | M6 | R7 | E, F |
| **LF-09** Mediciones (3 tamaños), complejidad, costes, mejoras | Ver EVA-5 | `6.4`, `6.5`, `complejidad-costes.md` | **RESERVAS** (ver EVA-5) | M7 | R8 | F |
| **LF-10** Pruebas de aceptación ejecutadas con evidencias | Ver sección C | `6.3-aceptacion.md` (8 filas), `6.8-consumidor.txt`, `6.6-tunel.md` | **VERIFICADO** (11/11 con las reservas de la sección C); la guía pide esperado/observado/evidencia: **redactar tabla** en memoria | M8 | R8 | F |
| **LF-11** Reproducción sin mezclar con datos actuales | `replay/`, topic `terremotos.replay`, esquema `replay`, `--destino live|replay` | `reproduccion-historica.md`, `6.1-*`, `6.2-*`, `aislamiento.txt` | **VERIFICADO** (0 ids de replay en live) | M9 | R5 | D |
| **LF-12** URL de Netlify funciona y sé activar backend y túnel | Netlify (F7 con función de Netlify) + ngrok | `6.6-tunel.md`, `6.6-publicacion.txt`, `6.9-defensa-seco.txt` (HTTP 200), `6.9-movil.md` (móvil con datos móviles) | **RESERVAS**: F7 con función publicada (2026-11-11) y verificada en un navegador del propio equipo; Pixel confirmado por la persona estudiante **sin evidencia archivada**; procedimiento convertido en checklist (`checklist-ventana-evaluacion.md`, `checklist-entrega-final.md`) | M10 | R4, R10 | G; T033–T036, T039 |
| **LF-13** Explicar el flujo y una decisión técnica propia | — (material en `resultados.md` de F3 y F6: preguntas y decisiones) | — | **PENDIENTE**: se realiza en el vídeo (CA-08) | M1, M10 | R2 | G |
| FQ-02, FQ-05, FQ-06, FQ-07, FQ-08, FQ-10 (FAQ 35) | Datos reales con procedencia; «sin país» y nulos; API→PostgreSQL y Angular→API; filtros coherentes; comparación equivalente; fallo de API indicado | `f3/3.5-*`, `f4/4.2-*`, `f5/5.5-panel.txt`, `5.7-escenarios.md`, `5.6-fallos.txt` | **VERIFICADO** (F5–F6) para el panel de entonces; el rediseño F7 conserva la lógica (476 pruebas) pero la comprobación en navegador es parcial (ver D10) | M6, M8 | R7, R8 | E, F |
| FQ-04 (FAQ 35) La base conserva los datos al reiniciar | `pgdata`, `kafkadata` | `6.8-reinicio.txt`, `4.4-persistencia.txt` | **VERIFICADO** con la reserva **T063 (down/up) no ejecutada** por decisión de la persona estudiante | M8, M10 | R4 | F |

## C. Pruebas de aceptación (ENUNCIADO §11; Guía 2.8)

Fuente principal: `docs/evidencias/f6/6.3-aceptacion.md` (ejecución observada `r-f6-prueba-b`: 30 eventos reales + 5 casos controlados, 39 mensajes) y evidencias de reinicio y túnel.

| ID | Prueba | Evid. observada | Estado y reservas | Mem. | README | Vídeo / pendiente |
|---|---|---|---|---|---|---|
| ACE-01 | Evento nuevo | `6.3-aceptacion.md` §1, `6.3-rastro.txt` (consulta → mensaje → versión → fila → API → estadísticas) | **VERIFICADO** | M8 | R8 | F |
| ACE-02 | Reenviar la misma versión | §2 (1 versión; 39 mensajes = 37 versiones + 1 cuarentena + 1 reenvío descartado); live: 1 244 consultas, 597 actuales, 875 versiones; `3.4-idempotencia.txt` | **VERIFICADO** | M8 | R8 | D, F |
| ACE-03 | Versión posterior | §3 (caso `revision`: 4,7 → 4,8; total sin cambio); 117 revisiones reales en live | **VERIFICADO** | M8 | R8 | D, F |
| ACE-04 | Versión antigua después de la nueva | §4 (caso `antigua`: actual conserva 5,2) | **VERIFICADO** | M8 | R8 | D, F |
| ACE-05 | Magnitud nula (ND) | §5 (`mag` = null, `sin_magnitud` = 1; panel «ND»/«sin valor»: `formato.test.ts`) | **VERIFICADO** (F6). El rediseño F7 mantiene «ND» (pruebas); comprobar en captura final | M8 | R8 | F |
| ACE-06 | Coordenadas inválidas → cuarentena | §6 (`coordenadas fuera de rango`, 0 filas actuales; 35 y no 36); explosiones excluidas en live | **VERIFICADO** | M4, M8 | R8 | C, F |
| ACE-07 | Evento marítimo → «Sin país asignado» | §7 (−140, 0; `country_id` nulo; permanece en el análisis) | **VERIFICADO** | M8 | R8 | F |
| ACE-08 | Reiniciar consumidor | `6.8-consumidor.txt` (lag 0→7→0 en ~10 s, sin duplicados); F3 SC-007 | **VERIFICADO con reserva**: no se capturó un *kill* en mitad de una transacción; la atomicidad se acredita con pruebas (`3.4-atomicidad*.txt`) | M8 | R8 | F (reiniciar el consumidor en directo: **pendiente** decidir si se hace en el vídeo) |
| ACE-09 | Cerrar el túnel | `6.6-tunel.md` (panel: «Sin conexión con el backend · última lectura…») | **VERIFICADO con reserva**: con F6 (2026-11-08) **y con F7 publicada, a través del túnel, en el navegador integrado del propio equipo (2026-11-11, T036: «Sin conexión», datos conservados y marcados como antiguos)**; la web se comprobó en un Pixel con datos móviles según la persona estudiante, pero **no se repitió el cierre del túnel desde el móvil** | M8 | R8 | F (ngrok solo con autorización) |
| ACE-10 | Reabrir el túnel → recuperación automática | `6.6-tunel.md` (recuperación ≤ 5 s tras reabrir) | **VERIFICADO con reserva** (igual que ACE-09): con F7, recuperación automática en ≈ 7–11 s tras reabrir el túnel (2026-11-11) | M8 | R8 | F / T036 |
| ACE-11 | Reproducción histórica sin mezclar | §8; `6.1-replay-ensayos.txt`; `6.2-panel.txt` (mapa = tabla = estadísticas = API = 35); `aislamiento.txt` | **VERIFICADO** | M9 | R5 | D |
| REP-01/02 | Replay acelerado, tiempo original + de reproducción, etiqueta «REPRODUCCIÓN», casos controlados, documentación de selección/velocidad | `reproduccion-historica.md`; `6.2-velocidad-identidad.txt` (×127,6; duración ×1,003 de la prevista) | **VERIFICADO**. F7 mantiene la etiqueta violeta (comprobada en navegador integrado; sin captura archivada) | M9 | R5 | D; capturas pendientes |
| ACE-00 | Esperado/observado/evidencia y cómo repetirlas | `6.3-aceptacion.md` ya usa ese formato | **RESERVAS**: trasladar a la memoria con comandos reproducibles (`scripts/f6/aceptacion_63.py`) | M8 | R8 | F |

## D. Requisitos técnicos y de entrega no cubiertos arriba

| ID | Imp. y archivos | Evid. | Estado y reservas | Mem. | README | Vídeo / pendiente |
|---|---|---|---|---|---|---|
| **D1** ARQ-01/02/04, DES-01/02 (Compose, salud, reintentos, persistencia, retención) | `compose.yaml`, `backend/Dockerfile`, volúmenes `pgdata`/`kafkadata`; retención Kafka 24 h/100 MiB | F3: `3.6-indices-y-retencion.txt`, `3.6-kafka-persistencia.txt`, `3.7-aislamiento.txt`; F6: `6.8-estabilidad.txt`, `6.8-ensayo-*.txt` | **VERIFICADO con reservas**: incidencia de Kafka (mensajes perdidos por no escribir en el volumen) **corregida**; memoria de Kafka crece con el tiempo sin límite de contenedor medido | M1, M10 | R2, R4 | A |
| **D2** ARQ-03, DES-03/04, API-04 (ngrok, CORS, Netlify, clave, solo la API expuesta) | API con `X-Observatorio-Clave` (401 sin clave), `API_DOCS=false`, CORS exacto; `config.json` público sin secretos | `6.6-acceso-api.txt`, `6.6-cors-local.txt`, `6.6-build-publico.txt`, `6.6-privacidad.txt`, `6.6-secretos.txt`, `6.6-publicacion.txt` | **VERIFICADO** (F6) y **F7 con función de Netlify** (2026-11-11): el `config.json` público ya no lleva la URL del túnel ni clave y FastAPI sigue exigiendo la clave (401 sin ella). El sitio de Netlify es público y, con la función, **los datos de lectura son públicos a través de ella**; la clave solo protege el acceso directo a ngrok (`f8/verificacion-funcion-netlify.md`) | M1, M10 | R4, R10 | A, G |
| **D3** EXT-01/02/03/06 (productor: 60 s, mensaje, clave, confirmación, reintentos, filtro `earthquake`) | `producer/` | F3: `3.2-ingesta.txt`, `3.4-idempotencia.txt`, `3.7-ejecucion-continua.txt` (30/30 consultas, separación 60,0 s), `3.6-estado-ingesta.txt` | **RESERVAS**: ramas HTTP 429/5xx/timeout cubiertas por pruebas unitarias; el fallo observado fue **inyectado** (SC-008) | M3, M4 | R4 | B |
| **D4** EXT-04 (histórico 2025) | `historico/`, `data/historico`, `SHA256SUMS`, esquema `historico` | F4: `4.4-carga-real.txt`, `4.4-repeticion.txt` (2.ª carga: 0 peticiones, hashes idénticos), `4.4-recuentos-usgs.txt` | **VERIFICADO** (18 302 eventos; 24 peticiones; 0 duplicados) | M3 | R6 | B |
| **D5** EXT-05, MOD-02 (integración geográfica) | `geo/` (punto-en-polígono, WGS84), catálogo Natural Earth (177 entidades) | F4: `regla-geografica.md`, `4.1-catalogo.txt`, `4.3-bateria.txt` (46/46), `4.3-contraste-place.txt`, `4.6-sin-pais-historico.txt` | **VERIFICADO con reservas**: `USA` y `SDN` con geometría inválida reparadas solo en memoria (informado); 3 expectativas de la batería corregidas tras analizar; escala 1:110 M (78,4 % del histórico «sin país») | M3, M5 | R6 | B, D |
| **D6** EXT-07 (hueco > 24 h, limitación de eliminados) | `producer` (`live.hueco`), `recuperacion/recuperar.py` | F4: `procedimiento-hueco.md`, `4.5-recuperacion.txt` (simulado); **`recuperacion-hueco-475.md` (real: 9 publicados, 8 guardados, 1 explosión en cuarentena; invariantes OK)**; F3 `hueco-24h.md` | **VERIFICADO** (recuperación real realizada el 2026-11-10 23:07 UTC; antes solo simulada). Limitación de eliminados/fusionados documentada | M4, M10 | R6, R8 | F |
| **D7** CAL-01/04/05 (reglas del consumidor, cuarentena, UTC) | `consumer/` | F3: `3.5-activacion.txt`, `3.5-calidad*.txt`, `3.7-despliegue-correccion.txt` (errores permanentes aislados) | **VERIFICADO** | M4 | R6 | C |
| **D8** MOD-03 (idempotencia, orden de versiones, offset tras guardar) | `consumer/`, `live.evento_version`, `live.evento_actual` | F3: `3.3-versiones.txt`, `3.4-atomicidad*.txt`, `3.4-idempotencia.txt` | **VERIFICADO con reserva** (ver ACE-08) | M5 | R6 | D, G (decisión propia candidata: «offset tras guardar») |
| **D9** MOD-04/05 (diccionario y procedencia/consultas) | — | — | **PENDIENTE** (redacción en 8.2) | M2, M3 | R6 | B |
| **D10a** ANA-01 (mapa/globo, ficha, leyenda, nulos) | Leaflet 2D + **globo 3D (Three.js)** por defecto, alternativa 2D, leyenda interactiva, ficha en HUD; `frontend/src/app/globo/`, `app.component.*` | F5: `5.5-panel.txt`, `5.7-escenarios.md`; F6: `6.7-contraste-mapa.txt`; F7: `specs/006-mejoras-evolucion/estado-tecnico-f7.md`; 476 pruebas `node --test` (cierre F7) | **RESERVAS**: F5–F6 verificado en navegador; **F7 implementado con pruebas y comprobaciones en navegador integrado**, pero la revisión humana archivada son **4 comprobaciones** (`comprobaciones-manuales-f7.md`: acceso local, mapa, indicador, filtros); sin dispositivo táctil real, sin `prefers-reduced-motion` ejercido, sin lector de pantalla real en F7 | M6 | R5 | E (globo 3D y alternativa 2D) |
| **D10b** ANA-02/03/08 (horas UTC, países, distribuciones, revisiones) | `api/estadisticas.py` (SQL sobre el estado actual); vista **Análisis** | F5: `5.2-estadisticas-real.txt`; invariante Σ serie = Σ países = Σ distribuciones + sin valor = total | **VERIFICADO** (backend); presentación F7 con las reservas de D10a | M6 | R7 | E |
| **D10c** ANA-04 (comparación histórica equivalente) | `api/comparacion.py`; tarjeta de comparación (vista Análisis) | F4: `4.6-comparaciones.txt`; F5: `5.3-comparacion-real.txt` (12 comparaciones = oráculo independiente) | **VERIFICADO con reserva** (SC-005 de F5): umbral < 4 elevado e indicado; motivos de periodo incompleto probados | M6 | R7 | E, F |
| **D10d** ANA-05/06/07/10 (filtros, estado del sistema, tabla, la API como única fuente) | Filtros en el HUD; indicador de refresco y KPI de estado; vista **Eventos** (tabla con búsqueda, paginación, vista previa 3D); `api.service.ts` | F5: `5.4-filtros.txt`, `5.6-fallos.txt`, `5.6-estado-real.txt`, `5.7-escenarios.md`; F6: `6.7-*`, `6.9-refresco-oculta.txt`; F7: 476 pruebas | **RESERVAS**: ver D10a; estados de error/401/422 comprobados en F7 con la API simulada en navegador integrado (no archivado como evidencia) | M6 | R5, R7 | E |
| **D11** API-01..03 (contrato) | `backend/src/observatorio/api/` | F5: SC-001 a SC-004 (estructura, 0 NaN, 503 explícito, filtros = SQL independiente en ≥ 12 combinaciones, paginación sin duplicados) | **VERIFICADO** (F5); 0 cambios de contrato en F7 (`api.service.ts`/`modelos.ts` sin modificar) | M5, M10 | R4 | A, E |
| **D12** CPX-01..04 (complejidad, mediciones, costes, mejoras) | Ver EVA-5 | Ver EVA-5 | **RESERVAS** (ver EVA-5) | M7 | R8 | F |
| **D13** Pruebas automatizadas (apoyo a todos los anteriores) | Backend `pytest`; frontend `node --test` | Backend: **964** al cierre de F6 (`6.9-regresion-final.txt`); frontend: **476** en el cierre de F7 y **521** el 2026-11-15 (`8.6-mejoras-interfaz.md`) | **RESERVAS**: el backend **no se ha vuelto a ejecutar desde el cierre de F6** (sin cambios de código en F7); las pruebas del frontend son en gran parte de lectura de código y lógica pura, no de renderizado | M8 | R8 | F |
| **D14** ENT-01/03 (repositorio: código, originales y regeneración) | `backend/`, `frontend/`, `sql/`, `data/historico` (originales con `SHA256SUMS`), `scripts/` | README «Histórico de 2025 (F4)»; `6.6-secretos.txt` | **RESERVAS**: confirmar el procedimiento de regeneración y que no hay datos pesados versionados; reutilización de material de apoyo (mapa y catálogo entregados) por distinguir (Guía 1.1) | M3, M10 | R3 | G |
| **D15** ENT-02 (README reproducible, 9 contenidos de Guía 1.4) | README de F6/F7 (secciones Arranque, Datos, Histórico, Huecos, API y dashboard, Replay, Publicación, Parada, Entorno limpio, Mapa de evidencias, Pruebas) | `6.9-entorno-limpio.txt` | **RESERVAS**: existe, pero **describe el panel anterior** (p. ej. «130 pruebas», mapa y tabla); el definitivo se redacta en 8.2 y se verifica en 8.3 (T015) | — | R4 | A |
| **D16** Seguridad y secretos (DES-03, REPO-02) | Clave en cabecera (401), `API_DOCS=false`, CORS exacto; **proxy local con clave en servidor** (F7, solo `start:local`) | F6: `6.6-secretos.txt`, `escaneo_secretos.sh`; F7: revisión de código (proxy con rutas/métodos cerrados, sin clave en cliente) | **RESERVAS**: **historial de Git no escaneado**; las URLs del túnel aparecen en README y en ≥ 8 evidencias (están protegidas por clave pero conviene decidir si se mantienen) | M10 | R4, R10 | G; T031 |
| **D17** SC-010 de F3 (conservación > 24 h) — **independiente** | Consultas de solo lectura previstas (T075–T077 de `specs/005-…`) | `f3/resultados.md`: «PENDIENTE DE OBSERVACIÓN» | **PENDIENTE** (PA-10 **no concedida**; SQL preparado en `scripts/f8/sc010_f3.sql`, sin ejecutar). Mantener el PC encendido en la ventana **no** equivale a SC-010 (FR-024) | M8, M10 | R8, R11 | F (solo si hay resultado) |
| **D18** Disponibilidad y estabilidad (DES-06, FAQ 31) | Salud de Compose, `/api/salud`, indicador de refresco, huecos detectados | F3: `3.7-ejecucion-continua.txt`; F6: `6.8-estabilidad.txt`, `6.8-ensayo-*`; incidencia real: parada del PC ~19,6 h → hueco #475 recuperado | **RESERVAS**: ensayos de 60 min (no de 2 días); funcionamiento continuado, suspensión del PC y recuperación para la ventana: **por comprobar** (T037) | M8, M10 | R10 | F; T037, T039 |
| **D19** Calidad de interfaz (no exigida por el profesor; reglas del proyecto) | Responsive, contraste AA, teclado, foco, lector | F6: `6.7-responsive.txt`, `6.7-lector.md` (solo Narrador+Edge), `6.7-compatibilidad.md`; F7: comprobaciones en 1440/1280/1100/1024/375/320 px (sin desbordamiento de página) y orden de foco | **RESERVAS**: móvil real solo con F6 (`6.9-movil.md`); F7 sin prueba en móvil real | M10 | R5, R11 | opcional en E |

## E. Requisitos de revisión autónoma (derivados [D]) y ventana de evaluación

| ID | Qué exige | Estado actual y evidencia | Mem. | README | Vídeo | Tareas |
|---|---|---|---|---|---|---|
| **WEB-01** El profesor abre y usa la web publicada por su cuenta | URL `https://observatorio-sismico.netlify.app` responde 200 y muestra **F7 con función** (`f8/verificacion-funcion-netlify.md`); datos solo con el túnel abierto (el visitante no introduce clave) | **RESERVAS**: funciona con F6; no depende de más que API y túnel (arquitectura obligatoria). **T042–T043 (2026-11-11)**: Netlify Function para que el visitante no introduzca clave, **publicada y verificada con reservas en un navegador del propio equipo** (`f8/verificacion-funcion-netlify.md`); falta otro dispositivo | M10 | R10 | G | T033, T042, T043 |
| **WEB-02** La web publicada = la versión que se entrega | Local: F7 + mejoras 8.6 (2026-11-15) ≠ Netlify: F7 `6af4b81f…` sin esas mejoras (hasta publicarlas) | **VERIFICADO con reserva (2026-11-11)**: F7 publicada con función de Netlify (despliegue `6af4b81f…`, 60 s, sin formulario de clave) y verificada con la API real en el navegador integrado y en un Pixel con datos móviles (confirmación de la persona estudiante); F6 y `6af4a52d…` conservados. **Pendiente**: otro navegador distinto de Chrome y la insignia inyectada por Netlify | M10 | R10 | G | T034–T036 |
| **WEB-03** Ventana de ~2 días operativa | Procedimiento de F6 (`procedimiento-defensa.md`, `procedimiento-ngrok-netlify.md`) | **PARCIAL (2026-11-11)**: procedimiento de credenciales y checklist redactados; **hallazgo**: suspensión del PC tras 1 h y reinicios de Windows posibles; ngrok sin servicio. **Pendiente**: fechas (CA-06/CA-02), cambios de ajustes por la persona estudiante y comprobación real de la continuidad | M10 | R10 | G | T037–T039 |
| **WEB-04** Fallo de conexión claro | ACE-09/10; estados del indicador de refresco | **VERIFICADO con reserva** (ver ACE-09; con F7 en el navegador integrado) | M8 | R8 | F | T036 |
| **REPO-01** Repositorio revisable por el profesor | Estructura y documentación existentes | **RESERVAS**: faltan README y memoria definitivos, matriz y evidencias de F8 | M10 | R3, R9, R10 | G | 8.2–8.5 |
| **REPO-02** Sin secretos; permisos verificados sin modificarlos | Ver D16 y LF-01 | **PENDIENTE** | M10 | R10 | G | T031, T025 |

## F. Evidencias y comprobaciones pendientes para 8.3 (sin ejecutar nada todavía)

| Nº | Qué falta | Filas afectadas | Coste/autorización |
|---|---|---|---|
| P1 | Capturas reales de la versión **F7** (Panel, Análisis, Eventos, globo 3D y 2D, EN VIVO, REPRODUCCIÓN, filtros visibles, estados, móvil) en `docs/evidencias/f8/capturas/` | EVA-4, LF-08, ACE-05, REP-01, D10a–d | Bajo; sin claves visibles (T014b, T020b) |
| P2 | Estado de los cinco servicios, `/api/salud` y datos actuales (lectura) | LF-03, D1, D18 | Lectura; Docker activo del equipo |
| P3 | Re-verificar el README definitivo en un proyecto Compose paralelo | LF-02, D15 | **PA-11** si hay que eliminar volúmenes temporales (T015) |
| P4 | Escaneo de secretos del árbol y del **historial de Git**; decidir sobre URLs del túnel en el repositorio | LF-04, D16, REPO-02 | Solo lectura (T031) |
| P5 | Re-ejecución selectiva del backend y del frontend (pruebas) si se estima necesario | D13 | Coste bajo; no repetir baterías largas (T030) |
| P6 | Revisión de la web publicada actual (F6) desde el punto de vista del profesor: qué ve, diferencias con F7 | WEB-01/02 | Lectura de la URL pública; **sin** abrir ngrok ni desplegar (T033) |
| P7 | Estrategia segura de publicación de F7 → aprobación escrita → (autorizada) publicación → verificación desde otro dispositivo con la API real | WEB-02, ACE-09/10, LF-12 | **Autorización expresa Netlify y ngrok** (T034–T036) |
| P8 | Funcionamiento continuado, conectividad externa, recuperación y suspensión del PC (comprobar y documentar) | WEB-03, D18 | Posible ngrok/Docker; **sin cambiar ajustes sin autorización** (T037) |
| P9 | SC-010 (observación > 24 h) | D17 | **PA-10 (no concedida)** |
| P10 | Diccionario de datos, procedencia y registro de consultas, tabla de tipos/unidades | LF-05, EVA-1, D9 | Redacción en 8.2 (T008–T012) |
| P11 | Diagrama conceptual/lógico/físico | LF-07, EVA-3 | Redacción en 8.2 |
| P12 | Apartado de calidad redactado (antes/después, consultas) | LF-06, EVA-2 | Redacción en 8.2 |
| P13 | Datos de costes de la persona estudiante (`[PENDIENTE]`) | LF-09, EVA-5 | Aporta la persona estudiante |
| P14 | Confirmaciones: CA-01 (fuente escrita), CA-02, CA-03, CA-04, CA-05, CA-06 (fechas, URL) | WEB-*, LF-01, LF-12, vídeo | La persona estudiante |
| P15 | Revisión humana de F7 ampliada (solo lo que confirme la persona estudiante: móvil real, estados) | D10a–d, D19 | `comprobaciones-manuales-f7.md` |

## G. Resumen del estado (para la revisión)

| Estado | Filas |
|---|---|
| **VERIFICADO** | LF-03, LF-04 (con revisión de T031), LF-10, LF-11, ACE-01 a ACE-07, ACE-11, REP-01/02, D4, D6, D7, D10b, D11 |
| **VERIFICADO con reserva puntual** | ACE-08, ACE-09, ACE-10, D1, D2, D5, D8, D10c, FQ-04, FQ-02/05–08/10, LF-12, WEB-02, WEB-04 |
| **RESERVAS** (existe; documentado en la memoria o comprobado con reserva) | EVA-1 a EVA-5, LF-02, LF-05, LF-06, LF-07, LF-08, LF-09, D3, D9, D10a, D10d, D12–D16, D18, D19, ACE-00, WEB-01, WEB-03, REPO-01 |
| **PENDIENTE** | LF-01, LF-05, LF-07, LF-13, D9, D17 (SC-010), WEB-02, WEB-03, REPO-02 |
| **IMPL-PEND** | La presentación F7 en dispositivos táctiles reales y con lector de pantalla (D10a/D19) y el comportamiento de F7 **a través del túnel y Netlify** (ACE-09/10, WEB-02) |

**Conclusión de la auditoría (actualizada en F8.5, 2026-11-11)**: la parte técnica del backend y las pruebas de aceptación están respaldadas por evidencias de F3–F6; F7 está publicada con una función de Netlify y verificada con reservas; la memoria y el README están redactados y sus enlaces comprobados. **Lo que sigue pendiente**: el vídeo y sus capturas, la prueba del Pixel con evidencia archivada, SC-010 (PA-10), el README en entorno limpio (PA-11), la lectura de los contadores, los permisos del profesor en el repositorio y la continuidad de la ventana (T037). Ningún requisito original se ha eliminado ni degradado a opcional.
