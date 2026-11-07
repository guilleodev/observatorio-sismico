# Resultados de la fase F4 — Geografía e histórico (T061)

Resultado **observado** de cada criterio de `specs/003-geografia-historico/spec.md`. Solo se marca «cumplido» lo comprobado con evidencia guardada en esta carpeta
(`docs/evidencias/f4/`). Las reservas figuran junto a cada criterio. Estado del sistema al cerrar: 5 servicios `healthy`, lag 0, reconciliación 0, **419 pruebas** pasan.

## 1. Criterios de éxito

| SC | Criterio | Resultado | Evidencia |
|----|----------|-----------|-----------|
| SC-001 | Catálogo: 0 `ADM0_A3` repetidos y 0 geometrías inválidas sin tratar | **Cumplido**: 177 entidades, `ADM0_A3` único. `USA` y `SDN` son inválidas (auto-intersección); se **informaron antes de asignar** y, por decisión de la persona estudiante, se reparan solo en memoria (`make_valid`, archivo sin tocar; área idéntica y 0 desacuerdos en 400 000 puntos) | `4.1-catalogo.txt`, `4.1-carga-catalogo.txt`, `4.2-validez-geometrias.txt` |
| SC-002 | 100 % de los eventos con un país o «sin país», solo por pertenencia al polígono | **Cumplido**: 18 302 históricos y todos los de `live` con `geo_resultado` (0 sin asignar); recálculo independiente con 0 diferencias; el punto marino cercano a la costa devuelve «sin país» (también con eventos reales) | `4.2-eventos-reales.txt`, `4.3-bateria.txt`, `4.6-sin-pais-historico.txt` |
| SC-003 | Batería ≥ 20 puntos con el resultado documentado | **Cumplido con reserva**: 46/46 con la expectativa vigente. **3 expectativas mías se corrigieron tras analizar la primera ejecución** (Nome, Taveuni, Sáhara Occidental): ninguna era un error del asignador, pero se revisó la expectativa, no el código. Además, 7 536 vértices, 290 polígonos y 5 000 puntos aleatorios sin diferencias | `4.3-bateria.txt` |
| SC-004 | Asignación retroactiva y mensaje repetido: 0 duplicados y 0 cambios en la 2.ª ejecución | **Cumplido**: pasada retroactiva real idempotente (2.ª pasada: 0 leídos) también con 18 302 eventos; reinserción cubierta por pruebas | `4.2-retroactivo.txt`, `4.6-rendimiento.txt`, `test_retroactivo.py`, `test_consistencia_geografica.py` |
| SC-005 | ≥ 100 eventos con país contrastados con `place` (solo control): % y 0 discrepancias sin causa | **Cumplido**: live 199/200 (99,5 %); histórico 3 437/3 743 (91,8 %). 306 discrepancias, **0 sin causa**: 204 frontera/localidad al otro lado, 95 localidad de referencia en el país vecino a la distancia citada, 1 territorio no contiguo y 6 revisadas a mano (5 localidad ambigua del gazetteer de USGS, 1 territorio en disputa). `place` nunca decide el país | `4.3-contraste-place.txt`, `4.6-sin-pais-historico.txt` |
| SC-006 | Por mes, eventos + cuarentena = `count` de USGS inmediatamente antes de la carga; total cuadra | **Cumplido**: 12/12 meses (1 413 … 1 277; total 18 302 = 18 302), 0 duplicados, 0 cuarentena. Un `count` nuevo de USGS horas después da lo mismo (sin revisiones) | `4.4-carga-real.txt`, `4.4-verificacion.txt`, `4.6-trazabilidad.txt` |
| SC-007 | 2.ª carga: 0 peticiones HTTP y recuentos idénticos; tras reiniciar, recuentos y `sha256` iguales | **Cumplido**: `peticiones_http = 0`, hashes de eventos y archivos idénticos; tras `restart postgres` y `stop`/`start` del stack: mismos recuentos y `sha256` de los 12 archivos (BD y exportados). **Reserva:** no se probó `down` + `up -d` (exige autorización expresa y no se pidió) | `4.4-repeticion.txt`, `4.4-persistencia.txt` |
| SC-008 | 0 filas históricas en `live` ni en `/api/eventos`; 0 de `live` en el histórico | **Cumplido** (re-comprobado al cierre) | `4.4-aislamiento.txt`, `4.6-aislamiento.txt` |
| SC-009 | Hueco simulado > 24 h: 0 duplicados, 100 % identificado con su origen; repetir no cambia nada | **Cumplido con reserva**: en recursos temporales (base, topic, grupo y consumidor aparte) y catálogo FDSN **simulado**: hueco anotado a las 30 h, 7 versiones recuperadas con `source=usgs-fdsn-recuperacion`, repetición con 0 publicados y base idéntica. **No se ha probado contra un hueco real de USGS** | `4.5-recuperacion.txt`, `test_recuperacion.py`, `test_huecos.py` |
| SC-010 | Media diaria = total / 365 coincide con un recuento independiente (global, un país, «sin país»); media 0 → «no definida» | **Cumplido**: global 18 302 (50,142/día), CHN 354, CHL 348, sin país 14 350, todos iguales al recuento independiente sobre los archivos originales; media 0 → «no definida» (prueba). Ventana reciente marcada **incompleta** cuando procede | `4.6-comparaciones.txt`, `test_comparacion.py` |
| SC-011 | Se mide el tiempo de asignación y el de la carga desde archivos locales; umbrales confirmados por la persona estudiante | **Medido y verificado** frente a los umbrales que confirmó el 2026-11-07 (< 100 ms por asignación; < 10 min la carga): asignación media 8,7 µs, p99 31,5 µs, máximo 152 µs (0,2-0,9 ms dentro de la carga); carga desde archivos 2,4 s; con descarga real 16 s. Cifras de una máquina concreta, no garantías | `4.4-rendimiento.txt`, `4.6-rendimiento.txt` |
| SC-012 | 0 escrituras de pruebas en tablas definitivas, 0 volúmenes o datos borrados, suite anterior sigue pasando | **Cumplido**: 0 residuos `prueba-%` en `live`, `historico` y cuarentena antes y después de cada suite; volúmenes `observatorio_kafkadata` y `observatorio_pgdata` intactos (nunca `down`, `-v` ni recrear Kafka/PostgreSQL); las 205 pruebas de F3 siguen y la suite completa es de **419** | `4.6-pruebas.txt`, `4.6-aislamiento.txt` |

## 2. Requisitos funcionales

| Bloque | FR | Estado | Dónde |
|---|---|---|---|
| Geografía (4.1-4.3) | FR-001 a FR-011 | Implementados y probados | `geo/catalogo.py`, `geo/asignador.py`, `geo/arranque.py`, `geo/retroactivo.py`, `consumer/*`; API con `country_id`/`country_name` reales |
| Histórico (4.4) | FR-012 a FR-018 | Implementados y probados | `historico/` (`fdsn.py`, `cargador.py`, `repositorio.py`, `cargar.py`), esquema `historico` |
| Huecos (4.5) | FR-019 (detección y recuperación) | Implementados y probados | `producer/repositorio.py` (`live.hueco`), `recuperacion/recuperar.py` |
| Comparación (4.6) | FR-020 y FR-021 | Implementados como consultas de referencia (los endpoints son de F5) | `sql/consultas/comparacion.sql`, `scripts/f4/comparacion.py` |
| Transversales | FR-022 a FR-025 | Cumplidos (trazabilidad, aislamiento, evidencias, configuración) | `4.6-trazabilidad.txt`, `4.6-aislamiento.txt` |

## 3. Métricas observadas

- **Histórico 2025:** 18 302 eventos en 12 tramos mensuales; 24 peticiones (12 `count` + 12 `query`); 13,9 s en el programa (11,4 s de descarga); 12 archivos, 1,35 MB comprimidos (13 MB sin comprimir); 0 cuarentena, 0 duplicados, 0 fuera de tramo.
- **Reparto geográfico:** 3 952 con país (87 países distintos; CHN 354, CHL 348, IDN 306), 14 350 sin país (78,4 %): 84,2 % de ellos a más de 50 km de cualquier polígono (mediana 144 km), 14,4 % entre 5 y 50 km y 1,4 % a ≤ 5 km (limitación de escala 1:110 M). 0 eventos «sin país» dentro de un polígono (comprobación exhaustiva independiente).
- **Live (estado actual):** 281 con país y 56 sin país a las 10:00 UTC del 2026-11-07 (el 16,6 % es mar; en el histórico es mayor porque el feed en vivo está dominado por la red de EE. UU.).
- **Rendimiento:** asignación 8,7 µs de media; retroactiva de 18 302 eventos 10,6 s (582 µs por evento, dominado por la base); índices de `historico.evento` conservados (consultas puntuales 4-90 veces más rápidas).
- **Calidad (seis dimensiones):** completitud 100 % en los campos obligatorios; unicidad 18 302/18 302; validez 0 fallos; consistencia 0 diferencias entre columnas y `raw` (2 eventos difieren en la cifra 16 por la precisión de `numeric`); exactitud 40/40 frente a la consulta por id a USGS.
- **Suite:** 316 → 362 (4.4) → 401 (4.5) → 419 (4.6) pruebas; mutaciones temporales en cargador, recuperación, detección y consultas (todas detectadas salvo 2 equivalentes explicadas).

## 4. Decisiones arquitectónicas

| Decisión | Contenido | Motivo |
|---|---|---|
| D1 | Shapely + NumPy para punto-en-polígono (`STRtree` + `covers`) | Cumple Python/estándar, sin PostGIS ni ML; 9 µs por evento |
| D2 | Esquemas `geo` (dimensión) e `historico` separados de `live` | Constitución III: datos reales, históricos y de reproducción aislados |
| D3 | Carga histórica directa a PostgreSQL, sin Kafka, con originales comprimidos en la base **y** exportados con `sha256` | Reproducible, trazable y sin mezclar el histórico con el transporte en tiempo real |
| D4 | Recuperación a demanda por el canal real con `source=usgs-fdsn-recuperacion` | Reutiliza versionado, cuarentena y país del consumidor; nunca escribe directamente en `live` |
| Complementarias | Desempate por menor `ADM0_A3`; margen de huecos de 6 h por ambos lados; recuperación sin filtro de magnitud ni tipo; omisión contra lo **guardado** (no contra `version_publicada`) | Determinista, auditable y robusto a mensajes perdidos |
| Reparación en memoria | `USA` y `SDN` con `make_valid`, catálogo del profesor intacto | Aprobada por la persona estudiante en 4.2 |

## 5. Incidencias y su resolución

1. **4.1-4.2:** geometrías inválidas en `USA` y `SDN` → consulta a la persona estudiante y reparación en memoria. Un arranque sin catálogo coherente no consume (`esperar_asignador`).
2. **4.3:** tres expectativas propias de la batería eran erróneas (Nome, Taveuni, Sáhara); umbral de vértices mal calculado; clasificación automática de «posible error» demasiado simple → refinada con la distancia que cita USGS.
3. **4.4:** un test de F3 detectó la palabra «sintetico» en un docstring; el manifiesto `SHA256SUMS` listaba archivos de otros años; el análisis del límite de `endtime` fue engañoso por los milisegundos (USGS los descarta) y se rehizo con segundos enteros. Un `LIKE` con `%` sin escapar rompió dos scripts de evidencia.
4. **4.5:** `aiokafka` no puede borrar grupos de consumidores → el grupo temporal se borró con `kafka-consumer-groups.sh` tras expirar la sesión; el ensayo se repitió completo tras corregir mis dos errores de script.
5. **4.6:** discrepancias contra `place` mal clasificadas (101 → 6 con la distancia citada, 6 resueltas a mano); la serie diaria tardaba 543 ms y se reescribió (11 ms); 2 eventos con diferencia de 2e-14 en la columna `numeric`.
6. Varias pruebas «pasaron a la primera»: se comprobó con **mutaciones temporales** que detectan los fallos reales (`4.4-mutaciones.txt`, `4.5-mutaciones.txt`, `4.6-mutaciones.txt`); 2 mutantes quedaron como equivalentes y están explicados.

## 6. Limitaciones y reservas

- **Recuperación de huecos sin prueba contra un hueco real de USGS.** Solo se probó con catálogo simulado y recursos temporales; se ejecutará ante un hueco real (`procedimiento-hueco.md`).
- **SC-010 de F3 (conservación tras 24 h) sigue pendiente de observación real** (primera comprobación posible: 2026-11-07 16:55 UTC, sin interrupciones prolongadas); T044 de F3.
- `down` + `up -d` sin `-v` **no se probó** (opcional, exige autorización expresa); la persistencia se verificó con `restart` y `stop`/`start`.
- **Escala del catálogo (1:110 M):** faltan islas pequeñas y la costa está simplificada; esos epicentros salen «sin país» (≈ 1,4 % de los «sin país»). No se asigna el país más cercano. El 78,4 % histórico depende del catálogo y de dónde ocurren los terremotos: no es un objetivo ni un indicador de calidad.
- Las fronteras del catálogo son aproximadas y los territorios en disputa se usan tal cual.
- El histórico es la instantánea **revisada** del catálogo; la actividad reciente son datos preliminares; la cobertura en vivo es de ~1-2 días, así que las ventanas largas se marcan incompletas.
- Los eventos que USGS elimina o fusiona no se reconcilian (FR-022 de F3); una revisión hecha durante un hueco a un evento anterior a él no se ve hasta que el feed la vuelva a publicar.
- Kafka caído con USGS accesible: el hueco no se detecta (lo revelan la reconciliación y el lag).
- La detección de huecos no cubre un consumidor parado más de 24 h con el productor activo; la recuperación se puede lanzar a mano sobre ese intervalo (omite lo guardado).

## 7. Pendiente de otras fases

- **F5:** endpoints de comparación y de hueco (`/api/salud` con huecos), filtros por país/fecha/magnitud, gráficas y panel; opcional: índice por `country_id` en `live` si se mide.
- **F6:** reproducción `replay` (topic y esquema propios), ngrok, y la observación real de más de 24 h de SC-010 de F3.
- **F7:** Netlify y entrega final.

## 8. Mapa de evidencias

`4.1-*` catálogo y migración · `4.2-*` asignación, retroactivo y despliegue · `4.3-*` batería, «sin país», contraste y rendimiento · `4.4-*` carga histórica (migración, pruebas, recuentos USGS,
carga real, repetición, persistencia, aislamiento, rendimiento, verificación, interrupción, mutaciones) · `4.5-*` huecos (migración, mutaciones, recuperación en recursos temporales, despliegue,
comandos reales, pruebas) y `procedimiento-hueco.md` · `4.6-*` comparaciones, trazabilidad, calidad, sin país histórico, rendimiento, aislamiento, mutaciones y pruebas · `regla-geografica.md`.
Scripts reproducibles en `scripts/f4/`.

## 9. Revisión final independiente (T064)

Dos revisiones independientes (subagentes sin contexto previo), 2026-11-07.

- **Architect: APTO CON RESERVAS.** Sin incumplimientos de requisitos del profesor; arquitectura, aislamiento, regla geográfica e idempotencia conformes. Hallazgos:
  1. *(corregido)* `resultados.md` §9 sin completar y T061-T064 sin marcar → completado en este cierre.
  2. *(corregido)* `comparacion.sql` decía «siempre tipo earthquake» pero el reciente no filtra el tipo → se comprobó que `live.evento_actual` tiene 0 filas no `earthquake` y no retiradas (el consumidor manda lo no sísmico a cuarentena y marca el reclasificado como `retirado`) y se documentó en la propia consulta; se añadió también la nota de días UTC de 24 h sin ajuste por zona horaria.
  3. *(reservas, ya declaradas)* SC-009 solo con catálogo simulado; SC-003 con 3 expectativas ajustadas tras ver el resultado (causas en `4.3-bateria.txt`: Nome a 2,0 km mar adentro por la simplificación de costa, Taveuni ausente del catálogo, Sáhara Occidental repartido entre `MAR` y `SAH` por la línea de facto; las tres se justificaron con la geografía y la distancia al polígono, no solo con la salida del asignador); SC-010 de F3 pendiente (F4 no lo cierra).
  4. *(nota)* SC-011: los umbrales (< 100 ms; < 10 min) los confirmó la persona estudiante el mismo día en que se midió, es decir, conociendo ya el orden de magnitud; la verificación demuestra que se cumplen con amplio margen, no que fueran predichos.
  El Architect no pudo reproducir cifras; QA y esta sección las contrastaron (199/200, 12/12 meses con `+0`, CHN 354, 205 pruebas de F3 en `3.7-pruebas.txt`).
- **QA Engineer: APTO CON RESERVAS.** Reejecutó la suite (**419 pasan**), los invariantes (reconciliación 0, 0 offsets duplicados, 0 desfases, lag 0, 5 servicios `healthy`), el aislamiento (todo OK) y las huellas del histórico (idénticas a las de `4.4-persistencia.txt`); comprobó que las órdenes del README existen en el código y que `git diff --check` no da errores. Único hallazgo previo al commit: este apartado vacío (corregido). Reservas: cobertura de ramas no medida (se revisaron por patrones 5 de los archivos de pruebas); `test_huecos.py` prueba `_anotar_hueco`, una API privada; SC-009/SC-007/SC-003 y Kafka caído con USGS accesible, ya declarados; SC-010 de F3 pendiente. QA no contrastó con sus `.txt` SC-001, 002, 004, 005, 006, 008, 010 y 012: lo hizo la sección 1 de este documento a partir de las evidencias guardadas.

## 10. Preguntas de defensa

1. **Un terremoto cae sobre la frontera entre dos países. ¿Qué país se le asigna y por qué esa regla?**
   *Esperada:* el borde cuenta como pertenencia a ambos (`covers`) y gana el menor `ADM0_A3` en orden alfabético: una regla determinista, sin criterio político, que además deja constancia (`geo_resultado = 'varias'`) para medir y reprocesar si cambia el catálogo (`geo_catalogo` guarda su huella). Nunca se asigna el país más cercano.
2. **El 78 % de los eventos históricos queda «sin país». ¿Es un error? ¿Cómo lo comprobaste?**
   *Esperada:* no es un error de la lógica: con una comprobación exhaustiva e independiente ningún «sin país» cae dentro de un polígono; el 84 % de ellos está a más de 50 km de la costa (mediana 144 km), en fosas de subducción (Kuriles-Kamchatka, Indonesia, Japón…). Sí hay una limitación real y medida: islas ausentes y costa simplificada del catálogo 1:110 M (≈ 1,4 %), que no se corrige con «el país más cercano».
3. **Si USGS devuelve un evento exactamente en el límite entre dos meses, ¿cómo evita el cargador contarlo dos veces?**
   *Esperada:* `endtime` es inclusivo y USGS descarta los milisegundos, así que el cargador solo acepta `inicio ≤ time < fin`, cuenta el resto como `fuera_de_tramo` y deduplica por `id` conservando el mayor `updated`. Se comprueba con el cuadre `Σobtenidos − Σduplicados − Σfuera = |evento| + |cuarentena|`.
4. **¿Por qué se recupera un hueco por el canal Kafka real y se omite contra lo guardado, no contra lo publicado?**
   *Esperada:* escribir directamente en `live` se saltaría versionado, cuarentena y país. `version_publicada` es solo una promesa: un mensaje publicado y nunca guardado (retención de 24 h) debe reenviarse; el consumidor ignora lo ya guardado y una versión antigua nunca pisa a una más reciente.
5. **¿Por qué la media diaria se calcula con los días de cero y qué sesgos tiene la comparación?**
   *Esperada:* dividir entre 365 (no entre los días con eventos) evita inflar la media. Sesgos: el histórico es la instantánea revisada y el reciente es preliminar; la media está inflada por secuencias de réplicas (julio de 2025: 2 684 eventos), por eso se da la mediana; con medias casi nulas la variación es inestable; y la ventana reciente puede estar incompleta (se marca).
6. **¿Qué demuestra cada huella del histórico (`md5(eventos)` de `invariantes.sh`, `md5_ids_y_updated` de `4.4-repeticion.txt`, `b2ff6ce5…` de la reconstrucción) y por qué son estables tras reiniciar PostgreSQL?**
   *Esperada:* son resúmenes distintos del mismo contenido: la primera incluye id, `updated` y país; la segunda solo id y `updated`; la tercera añade `geo_resultado` y compara la base real con una reconstrucción desde los archivos originales. Son estables porque el histórico es de solo lectura tras la carga y vive en el volumen `pgdata`, que `restart`/`stop`/`start` no tocan; si cambiara algo, las huellas diferirían.
7. **Si el consumidor perdió mensajes que `version_publicada` marca como publicados, ¿cómo se recuperan?**
   *Esperada:* la recuperación omite según lo **guardado** (`evento_version`/`cuarentena`), no lo publicado; por eso reenvía lo que nunca se guardó y es idempotente.
