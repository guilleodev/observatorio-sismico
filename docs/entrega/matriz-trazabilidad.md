# Matriz de trazabilidad — Observatorio Sísmico

**Versión final a 2026-11-17.** Relaciona cada requisito del enunciado y de la Guía con su implementación, sus evidencias y el apartado de la memoria, del README y del vídeo donde se trata. Requisitos y fuentes literales: [`requisitos-fuente.md`](requisitos-fuente.md) (los IDs son los de ese documento). El estado de cada fila sale de las evidencias de `docs/evidencias/` (F3–F8) y de las verificaciones del 2026-11-16 y 2026-11-17.

## 0. Cómo leer la matriz

| Estado | Significado |
|---|---|
| **VERIFICADO** | Implementado y comprobado, con evidencia guardada y enlazada |
| **CON RESERVAS** | Cumplido, con una limitación indicada en la fila (recogida en el [Anexo C de la memoria](memoria.md#anexo-c--reservas-de-esta-memoria)) |

**Códigos**: M1–M10 = apartados de la [memoria](memoria.md) (M1 Objetivo · M2 Diccionario · M3 Procedencia · M4 Calidad · M5 Modelo · M6 Análisis · M7 Complejidad y costes · M8 Pruebas · M9 Reproducción · M10 Decisiones y limitaciones) · R1–R11 = apartados del [README](../../README.md) (R1 Presentación · R2 Arquitectura · R3 Estructura · R4 Instalación · R5 Frontend · R6 Calidad y modelo · R7 Análisis · R8 Pruebas · R9 Rúbrica · R10 Evaluación · R11 Limitaciones) · A–G = escenas del vídeo de 5 min (A Apertura · B Extracción · C Calidad · D Modelado · E Análisis · F Reflexión · G Cierre; el guion es material personal y no está en el repositorio). Las capturas están en [`docs/evidencias/f8/capturas/`](../evidencias/f8/capturas/LEEME.md).

## A. Criterios de la rúbrica (ENUNCIADO §13)

| ID | Implementación y archivos | Evidencias | Estado y reservas | Mem. | README | Vídeo |
|---|---|---|---|---|---|---|
| **EVA-1** Extracción | Productor del feed (60 s), EMSC como segunda fuente aditiva sin duplicados, carga histórica 2025 por meses con huellas y catálogo geográfico: `backend/src/observatorio/{producer,historico,geo}`, `data/historico/` + `SHA256SUMS` | F3 `3.2-ingesta.txt`, `3.7-ejecucion-continua.txt`; F4 `4.4-carga-real.txt` (18 302 eventos, 12/12 meses = `count` de USGS); F8 `emsc-segunda-fuente.md` | **CON RESERVAS**: ramas HTTP 429/5xx/timeout solo con pruebas unitarias y un fallo inyectado; diccionario, tabla de tipos y procedencia en la memoria | M2, M3 | R4, R6 | B |
| **EVA-2** Calidad | Reglas del consumidor, cuarentena con motivo, UTC; seis dimensiones sobre el histórico y una muestra del feed: `consumer/`, `geo/`, `live.cuarentena` | F3 `3.5-calidad-datos-reales.txt`; F4 `4.6-calidad.txt`; F8 `8.5-calidad-live.txt` | **CON RESERVAS**: muestra del feed pequeña y temprana (2026-11-06) y discrepancia 197/198 sin causa demostrada (R5, R6) | M4 | R6 | C |
| **EVA-3** Modelado | Esquemas `live`, `geo`, `historico`, `replay`; versión + estado actual con upsert idempotente; punto-en-polígono; índices medidos: `sql/001`–`005` | F3 `3.3-versiones.txt`, `3.4-idempotencia.txt`; F4 `regla-geografica.md`; F5 `5.7-explain.txt` | **CON RESERVAS**: diagramas derivados del SQL (R9); los índices no mejoran ≥ 2× a volumen real y así se declara | M5 | R6 | D |
| **EVA-4** Análisis | Ventanas horarias UTC, países, distribuciones, comparación con 2025 y 3 conclusiones: `api/estadisticas.py`, `api/comparacion.py`, vista Análisis | F5 `conclusiones.md`, `5.2-estadisticas-real.txt`, `5.3-comparacion-real.txt`; capturas C-04 a C-07 | **VERIFICADO**; la conclusión 2 es «no concluyente» y la 3, «cobertura distinta»; las capturas C-05 a C-07 muestran cifras actuales del periodo fijo (ver su LEEME) | M6 | R7 | E, F |
| **EVA-5** Reflexión | Complejidad O(·), mediciones 10³/10⁴/10⁵, comparaciones sin/con índice y modelo de costes: `scripts/f6/` | F6 `6.4-mediciones.txt`, `6.5-comparaciones.txt`, `complejidad-costes.md` | **CON RESERVAS**: una sola máquina; 10⁸ filas es una proyección; costes con supuestos | M7, M10 | R8, R11 | F |

## B. Lista final de comprobación de la Guía (13 puntos) y puntos de la FAQ 35

| ID | Implementación y archivos | Evidencias | Estado y reservas | Mem. | README | Vídeo |
|---|---|---|---|---|---|---|
| **LF-01** Acceso del profesor al repositorio | Repositorio privado en GitHub | — | Se entrega al profesor el enlace del repositorio | — | R10 | G |
| **LF-02** README arranca desde un entorno limpio | `README.md`, `compose.yaml`, `.env.example`, `sql/` | F6 `6.9-entorno-limpio.txt`; F8 `entorno-limpio-readme-final.txt` (2026-11-17: cinco `healthy`, 18 302 eventos históricos, API 200) | **VERIFICADO** con el README final en un proyecto Compose paralelo; una sola máquina, imágenes base ya descargadas y sin el paso del panel Angular | M10 | R4 | A |
| **LF-03** Cinco servicios en Compose | `compose.yaml`: `postgres`, `kafka`, `producer`, `consumer`, `api`, volúmenes `pgdata` y `kafkadata`, red `observatorio` | F6 `aislamiento.txt`; F8 `capturas/C-15-docker-compose-ps.txt` (2026-11-17) | **VERIFICADO**: solo la API publicada en `127.0.0.1` | M1 | R2, R4 | A |
| **LF-04** Dependencias, Dockerfile, SQL y `.env.example` sin credenciales | `backend/requirements*.txt`, `backend/Dockerfile`, `sql/001`–`005`, `.env.example`, `frontend/package.json` + lock | F6 `6.6-secretos.txt`; F8 `8.3-seguridad-secretos.md`; `escaneo_secretos.sh` (0 hallazgos en el árbol, repetido el 2026-11-17, y en el historial de 17 commits) | **CON RESERVAS**: la URL del túnel figura en 12 evidencias de F6 y F8; la API exige clave (401 sin ella) | M10 | R3, R4 | G |
| **LF-05** Campos, unidades, fuentes, filtros y consultas | Diccionario y procedencia en la memoria | `f3/`, `f4/regla-geografica.md`, `sql/consultas/`, `FUENTES-Y-LICENCIAS.md` | **VERIFICADO** | M2, M3 | R6 | B |
| **LF-06** Apartado de calidad | Memoria §4 con código, consultas, antes/después y decisiones | `3.5-*`, `4.6-calidad.txt`, `8.5-calidad-live.txt` | **CON RESERVAS** (EVA-2) | M4 | R6 | C |
| **LF-07** Modelo conceptual, lógico y físico | Memoria §5 con diagramas Mermaid derivados del SQL | `sql/001`–`005`, `5.7-explain.txt` | **CON RESERVAS** (EVA-3) | M5 | R6 | D |
| **LF-08** ≥ 3 conclusiones con filtros identificables | Memoria §6.2 y capturas | `f5/conclusiones.md`; `capturas/C-05*`, `C-06`, `C-07a` | **VERIFICADO** (EVA-4) | M6 | R7 | E, F |
| **LF-09** Mediciones, complejidad, costes y mejoras | Memoria §7 | `6.4`, `6.5`, `complejidad-costes.md` | **CON RESERVAS** (EVA-5) | M7 | R8 | F |
| **LF-10** Pruebas de aceptación con evidencias | Memoria §8 (esperado/observado/evidencia) | `6.3-aceptacion.md`, `6.8-consumidor.txt`, `6.6-tunel.md`, capturas C-11, C-12, C-12b | **VERIFICADO** (11/11) con las reservas de la sección C | M8 | R8 | F |
| **LF-11** Reproducción sin mezclar con datos actuales | `replay/`, topic `terremotos.replay`, esquema `replay`, `--destino live\|replay` | `reproduccion-historica.md`, `6.1-*`, `6.2-*`, `aislamiento.txt`, capturas C-09 y C-10 | **VERIFICADO** (0 ids de replay en `live`) | M9 | R5 | D |
| **LF-12** La URL de Netlify funciona y se sabe activar backend y túnel | Netlify (F7 con función y EMSC) + ngrok | `6.6-tunel.md`, `6.6-publicacion.txt`; F8 `verificacion-publicacion-f7.md`, `verificacion-funcion-netlify.md`, `capturas/C-14` | **CON RESERVAS**: verificada en un navegador del propio equipo y en un móvil real (sin captura); la continuidad durante la ventana no se ha medido | M10 | R10 | G |
| **LF-13** Explicar el flujo y una decisión técnica propia | Material en memoria §1.3 y §10.1 | `resultados.md` de F3 y F6 | En el vídeo (escena G) | M1, M10 | R2 | G |
| FQ-02, FQ-05…08, FQ-10 | Datos reales con procedencia; «sin país» y nulos; API → PostgreSQL y Angular → API; filtros coherentes; comparación equivalente; fallo de API indicado | `f3/3.5-*`, `f4/4.2-*`, `f5/5.5-panel.txt`, `5.6-fallos.txt` | **VERIFICADO** (F5–F6; el rediseño F7 conserva la lógica, con 528 pruebas del frontend) | M6, M8 | R7, R8 | E, F |
| FQ-04 La base conserva los datos al reiniciar | `pgdata`, `kafkadata` | `6.8-reinicio.txt`, `4.4-persistencia.txt` | **VERIFICADO**; `T063` (`down`/`up`) no se ejecutó por decisión del autor | M8, M10 | R4 | F |

## C. Pruebas de aceptación (ENUNCIADO §11; Guía 2.8)

Fuente principal: `docs/evidencias/f6/6.3-aceptacion.md` (ejecución `r-f6-prueba-b`: 30 eventos reales + 5 casos controlados, 39 mensajes) y las evidencias de reinicio y túnel.

| ID | Prueba | Evidencia observada | Estado y reservas | Mem. | README | Vídeo |
|---|---|---|---|---|---|---|
| ACE-01 | Evento nuevo | `6.3-aceptacion.md` §1, `6.3-rastro.txt` | **VERIFICADO** | M8 | R8 | F |
| ACE-02 | Reenviar la misma versión | §2 (1 versión; 39 mensajes = 37 versiones + 1 cuarentena + 1 reenvío descartado); `3.4-idempotencia.txt` | **VERIFICADO** | M8 | R8 | D, F |
| ACE-03 | Versión posterior | §3 (caso `revision`: 4,7 → 4,8; total sin cambio); 117 revisiones reales en `live` | **VERIFICADO** | M8 | R8 | D, F |
| ACE-04 | Versión antigua después de la nueva | §4 (caso `antigua`: la actual conserva 5,2) | **VERIFICADO** | M8 | R8 | D, F |
| ACE-05 | Magnitud nula (ND) | §5 (`mag` = null, `sin_magnitud` = 1); captura C-11 | **VERIFICADO** | M8 | R8 | F |
| ACE-06 | Coordenadas inválidas → cuarentena | §6 (`coordenadas fuera de rango`, 0 filas actuales; 35 y no 36) | **VERIFICADO** | M4, M8 | R8 | C, F |
| ACE-07 | Evento marítimo → «Sin país asignado» | §7 (−140, 0; `country_id` nulo; permanece en el análisis) | **VERIFICADO** | M8 | R8 | F |
| ACE-08 | Reiniciar el consumidor | `6.8-consumidor.txt` (lag 0→7→0 en ~10 s, sin duplicados); F3 SC-007 | **CON RESERVAS**: no se capturó un *kill* en mitad de una transacción; la atomicidad se acredita con pruebas (`3.4-atomicidad*.txt`) | M8 | R8 | F |
| ACE-09 | Cerrar el túnel | `6.6-tunel.md`; F7 publicada en el navegador integrado (2026-11-11); capturas C-12 (2026-11-17) | **CON RESERVAS**: no se repitió el cierre del túnel desde el móvil | M8 | R8 | F |
| ACE-10 | Reabrir el túnel → recuperación automática | `6.6-tunel.md` (≤ 5 s con F6); F7: ≈ 7–11 s (2026-11-11); captura C-12b | **CON RESERVAS** (igual que ACE-09) | M8 | R8 | F |
| ACE-11 | Reproducción histórica sin mezclar | §8; `6.1-replay-ensayos.txt`; `6.2-panel.txt` (mapa = tabla = estadísticas = API = 35); `aislamiento.txt` | **VERIFICADO** | M9 | R5 | D |
| REP-01/02 | Replay acelerado, tiempo original y de reproducción, etiqueta «REPRODUCCIÓN», casos controlados | `reproduccion-historica.md`; `6.2-velocidad-identidad.txt` (×127,6; duración ×1,003); capturas C-09 y C-10 | **VERIFICADO** | M9 | R5 | D |
| ACE-00 | Esperado/observado/evidencia y cómo repetirlas | `6.3-aceptacion.md`; `scripts/f6/aceptacion_63.py`; memoria §8 | **VERIFICADO** | M8 | R8 | F |

## D. Requisitos técnicos y de entrega

| ID | Implementación y archivos | Evidencias | Estado y reservas | Mem. | README | Vídeo |
|---|---|---|---|---|---|---|
| **D1** ARQ-01/02/04, DES-01/02 (Compose, salud, reintentos, persistencia, retención) | `compose.yaml`, `backend/Dockerfile`, volúmenes `pgdata` y `kafkadata`; retención de Kafka de 24 h y 100 MiB | F3 `3.6-indices-y-retencion.txt`, `3.6-kafka-persistencia.txt`; F6 `6.8-estabilidad.txt` | **VERIFICADO**; la incidencia de Kafka (mensajes perdidos por no escribir en el volumen) se corrigió | M1, M10 | R2, R4 | A |
| **D2** ARQ-03, DES-03/04, API-04 (ngrok, CORS, Netlify, clave, solo la API expuesta) | `X-Observatorio-Clave` (401 sin clave), `API_DOCS=false`, CORS exacto; `config.json` público sin secretos; función de Netlify | `6.6-acceso-api.txt`, `6.6-cors-local.txt`, `6.6-publicacion.txt`; F8 `verificacion-funcion-netlify.md` | **VERIFICADO**. Con la función, los datos de lectura son públicos a través de ella; la clave solo protege el acceso directo a ngrok | M1, M10 | R4, R10 | A, G |
| **D3** EXT-01/02/03/06 (productor: 60 s, mensaje, clave, confirmación, reintentos) | `producer/` | F3 `3.2-ingesta.txt`, `3.7-ejecucion-continua.txt` (30/30 consultas, separación 60,0 s) | **CON RESERVAS**: ramas 429/5xx/timeout con pruebas unitarias; el fallo observado fue inyectado | M3, M4 | R4 | B |
| **D4** EXT-04 (histórico 2025) | `historico/`, `data/historico`, `SHA256SUMS`, esquema `historico` | F4 `4.4-carga-real.txt`, `4.4-repeticion.txt`, `4.4-recuentos-usgs.txt` | **VERIFICADO** (18 302 eventos, 24 peticiones, 0 duplicados) | M3 | R6 | B |
| **D5** EXT-05, MOD-02 (integración geográfica) | `geo/`, catálogo Natural Earth (177 entidades) | F4 `regla-geografica.md`, `4.1-catalogo.txt`, `4.3-bateria.txt` (46/46) | **CON RESERVAS**: `USA` y `SDN` con geometría inválida reparadas solo en memoria; escala 1:110 M (78,4 % del histórico «sin país») | M3, M5 | R6 | B, D |
| **D6** EXT-07 (hueco > 24 h, eliminados) | `live.hueco`, `recuperacion/recuperar.py` | F4 `procedimiento-hueco.md`, `recuperacion-hueco-475.md`; F3 `sc-010-observacion-24h.txt` (huecos #475–#478 recuperados) | **VERIFICADO**; limitación de eventos eliminados o fusionados documentada | M4, M10 | R6, R8 | F |
| **D7** CAL-01/04/05 (reglas, cuarentena, UTC) | `consumer/` | F3 `3.5-activacion.txt`, `3.5-calidad*.txt`, `3.7-despliegue-correccion.txt` | **VERIFICADO** | M4 | R6 | C |
| **D8** MOD-03 (idempotencia, orden de versiones, offset tras guardar) | `consumer/`, `live.evento_version`, `live.evento_actual` | F3 `3.3-versiones.txt`, `3.4-atomicidad*.txt`, `3.4-idempotencia.txt` | **CON RESERVAS** (ACE-08) | M5 | R6 | D, G |
| **D9** MOD-04/05 (diccionario, procedencia y consultas) | Memoria §2 y §3 | `sql/`, `CONTRATO-API.md`, `f4/4.4-*` | **VERIFICADO** | M2, M3 | R6 | B |
| **D10a** ANA-01 (mapa/globo, ficha, leyenda, nulos) | Leaflet 2D + globo 3D (Three.js), leyenda interactiva, ficha: `frontend/src/app/globo/`, `app.component.*` | F5 `5.5-panel.txt`; F6 `6.7-contraste-mapa.txt`; F7 `estado-tecnico-f7.md`; capturas C-01 a C-03b | **CON RESERVAS**: sin dispositivo táctil real ni lector de pantalla real con F7 (solo Narrador y Edge con F6) | M6 | R5 | E |
| **D10b** ANA-02/03/08 (horas UTC, países, distribuciones, revisiones) | `api/estadisticas.py`; vista Análisis | F5 `5.2-estadisticas-real.txt`; invariante Σ serie = Σ países = total | **VERIFICADO** | M6 | R7 | E |
| **D10c** ANA-04 (comparación histórica equivalente) | `api/comparacion.py`; tarjeta de comparación | F4 `4.6-comparaciones.txt`; F5 `5.3-comparacion-real.txt` (12 comparaciones = oráculo independiente) | **CON RESERVAS** (SC-005 de F5): umbral < 4 elevado e indicado; es solo de USGS | M6 | R7 | E, F |
| **D10d** ANA-05/06/07/10 (filtros, estado, tabla, la API como única fuente) | Filtros (incluida «Fuente»), indicador de refresco y KPI; vista Eventos; `api.service.ts` | F5 `5.4-filtros.txt`, `5.6-fallos.txt`; F6 `6.7-*`; capturas C-08, C-12, C-18 | **CON RESERVAS** (D10a) | M6 | R5, R7 | E |
| **D11** API-01..03 (contrato) | `backend/src/observatorio/api/` | F5 SC-001 a SC-004 (estructura, 0 NaN, 503 explícito, filtros = SQL independiente, paginación sin duplicados); F8: el filtro `fuente` y `fuentes.emsc` son aditivos | **VERIFICADO** | M5, M10 | R4 | A, E |
| **D12** CPX-01..04 (complejidad, mediciones, costes, mejoras) | Ver EVA-5 | Ver EVA-5 | **CON RESERVAS** (EVA-5) | M7 | R8 | F |
| **D13** Pruebas automatizadas | Backend `pytest`; frontend `node --test` | Backend **1 046** y frontend **528** (2026-11-16, repetidas el 2026-11-17) | **CON RESERVAS**: las pruebas del frontend son en gran parte de lectura de código y lógica pura, no de renderizado | M8 | R8 | F |
| **D14** ENT-01/03 (repositorio: código, originales y regeneración) | `backend/`, `frontend/`, `sql/`, `data/historico` (con `SHA256SUMS`), `scripts/` | README «Histórico de 2025»; `6.6-secretos.txt` | **VERIFICADO**; el material de apoyo del profesor (mapa y catálogo) se distingue del desarrollo propio (README §4) | M3, M10 | R3 | G |
| **D15** ENT-02 (README reproducible) | `README.md` | F6 `6.9-entorno-limpio.txt`; F8 `entorno-limpio-readme-final.txt` | **VERIFICADO** (LF-02) | — | R4 | A |
| **D16** Seguridad y secretos (DES-03, REPO-02) | Clave en cabecera (401), `API_DOCS=false`, CORS exacto; proxy local con clave en servidor (solo `start:local`) | F6 `6.6-secretos.txt`, `escaneo_secretos.sh`; F8 `8.3-seguridad-secretos.md` | **CON RESERVAS**: 0 hallazgos en el árbol y en el historial de 17 commits; la URL del túnel figura en 12 evidencias (la API exige clave) | M10 | R4, R10 | G |
| **D17** SC-010 de F3 (conservación > 24 h) | `scripts/f8/sc010_f3.sql` (solo lectura) | `f3/resultados.md`, `f3/sc-010-observacion-24h.txt` | **VERIFICADO** (2026-11-17): 1 905 eventos y 2 695 versiones de más de 24 h conservados (el más antiguo, del 05/11) y reconciliación 0; con 4 huecos de ingesta recuperados anotados. Mantener el equipo encendido durante la ventana no equivale a SC-010 | M8, M10 | R8, R11 | F |
| **D18** Disponibilidad y estabilidad (DES-06, FAQ 31) | Salud de Compose, `/api/salud`, indicador de refresco, huecos detectados | F3 `3.7-ejecucion-continua.txt`; F6 `6.8-estabilidad.txt`; F8 `emsc-segunda-fuente.md` §9 (24 h continuas, 2026-11-16/17), `8.3-continuidad-ventana.md` | **CON RESERVAS**: la ventana de ~2 días no se ha medido; el equipo está configurado para no suspenderse y una actualización de Windows con reinicio la interrumpiría | M8, M10 | R10 | F |
| **D19** Calidad de interfaz (reglas del proyecto) | Responsive, contraste AA, teclado, foco, lector | F6 `6.7-responsive.txt`, `6.7-lector.md`, `6.7-compatibilidad.md`; F7: 1440/1280/1100/1024/375/320 px; capturas C-13a/b (emulación) | **CON RESERVAS**: móvil real comprobado por el autor sin captura | M10 | R5, R11 | opcional |

## E. Revisión autónoma por el profesor y ventana de evaluación

| ID | Qué exige | Estado y evidencia | Mem. | README | Vídeo |
|---|---|---|---|---|---|
| **WEB-01** El profesor abre y usa la web publicada por su cuenta | `https://observatorio-sismico.netlify.app` responde 200 y sirve F7 con función de Netlify y EMSC; los datos dependen de la API y el túnel (arquitectura obligatoria) | **CON RESERVAS**: verificada en un navegador del propio equipo y, por el autor, en un móvil real; la insignia «Powered by Netlify» la inyecta Netlify | M10 | R10 | G |
| **WEB-02** La web publicada es la versión que se entrega | Local = Netlify: despliegue `6afb5599…` (2026-11-16, commit `bd6877b`); verificada con la API real por el túnel; capturas del 2026-11-17 | **VERIFICADO**; respaldos `6afa2ccf…`, `6af4b81f…`, `6af4a52d…` y F6 | M10 | R10 | G |
| **WEB-03** Ventana de ~2 días operativa | Procedimientos de F6 (`procedimiento-defensa.md`, `procedimiento-ngrok-netlify.md`); ajustes de suspensión comprobados (2026-11-16) | **CON RESERVAS** (D18) | M10 | R10 | G |
| **WEB-04** Fallo de conexión claro | ACE-09/10; estados del indicador de refresco | **CON RESERVAS** (ACE-09); capturas C-12 y C-12b | M8 | R8 | F |
| **REPO-01** Repositorio revisable por el profesor | README, memoria, matriz, evidencias de F3–F8 y capturas | **VERIFICADO**: enlaces relativos comprobados, sin rotos | M10 | R3, R9, R10 | G |
| **REPO-02** Sin secretos; permisos verificados sin modificarlos | Ver D16 y LF-01 | **VERIFICADO** (D16); el acceso del profesor se concede con el enlace al repositorio privado (LF-01) | M10 | R10 | G |

## F. Verificaciones de cierre (2026-11-16 y 2026-11-17)

| Qué | Resultado | Evidencia |
|---|---|---|
| Estado de los cinco servicios y datos actuales | Cinco `healthy`, 0 huecos pendientes, ingesta al día | `capturas/C-15-docker-compose-ps.txt`, `capturas/C-16-cuarentena-y-recuentos.txt` |
| Pruebas automáticas | Backend 1 046 y frontend 528 | `emsc-segunda-fuente.md` §6 |
| README en un entorno limpio | Verificado en un proyecto paralelo | `entorno-limpio-readme-final.txt` |
| Secretos | 0 hallazgos en el árbol (2026-11-17) y en el historial de Git | `8.3-seguridad-secretos.md` |
| SC-010 | Observado | `f3/sc-010-observacion-24h.txt` |
| 24 h de funcionamiento continuo en local | Sin reinicios, errores ni huecos nuevos | `emsc-segunda-fuente.md` §9 |
| Recuperación tras apagar el PC ≈ 9 h (2026-11-18) | Servicios solos; 62 de USGS y 116 de EMSC recuperados; sin hueco; reconciliación 0 | `recuperacion-tras-apagado.md` |
| Capturas de la web publicada | 21 imágenes, un GIF y 2 textos | `docs/evidencias/f8/capturas/LEEME.md` |
| Segunda fuente EMSC | Sin duplicados con USGS (0 visibles que cumplan la regla) | `emsc-segunda-fuente.md` |

## G. Resumen del estado

| Estado | Filas |
|---|---|
| **VERIFICADO** | LF-02, LF-03, LF-05, LF-08, LF-10, LF-11, ACE-00 a ACE-07, ACE-11, REP-01/02, D1, D2, D4, D6, D7, D9, D10b, D11, D14, D15, D17, WEB-02, REPO-01, REPO-02, EVA-4 |
| **CON RESERVAS** | EVA-1, EVA-2, EVA-3, EVA-5, LF-04, LF-06, LF-07, LF-09, LF-12, ACE-08, ACE-09, ACE-10, D3, D5, D8, D10a, D10c, D10d, D12, D13, D16, D18, D19, WEB-01, WEB-03, WEB-04 |
| **En el vídeo** | LF-13 (explicación del flujo y de una decisión técnica propia) |

**Conclusión**: la parte técnica del backend y las pruebas de aceptación están respaldadas por evidencias de F3–F8; F7 está publicada con una función de Netlify y con EMSC; la memoria y el README están redactados y sus enlaces comprobados. Las reservas están en el [Anexo C de la memoria](memoria.md#anexo-c--reservas-de-esta-memoria). Ningún requisito original se ha eliminado ni degradado a opcional.
