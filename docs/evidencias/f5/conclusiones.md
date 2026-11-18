# Conclusiones fundamentadas — F5, paso 5.7, T051 (base de la memoria §6.2)

Todas las cifras salen de la API (`GET /api/estadisticas`, solo lectura) con periodo y filtros explícitos y se reproducen con `scripts/f5/conclusiones_57.py`
(ejecutado dos veces el 2026-11-07: salida idéntica). El complemento SQL de la conclusión 2 es `scripts/f5/ventanas_2025.sql` (solo lectura).

**Periodo reciente (fijo):** `[2026-11-05T17:00:00Z, 2026-11-07T18:00:00Z)` ≈ 2,04 días, dentro de la cobertura real del feed en vivo (empieza 2026-11-05T16:54Z), sin huecos pendientes y sin
motivos de «periodo incompleto». **Línea base:** los 18 302 terremotos de 2025 (magnitud ≥ 4, tipo `earthquake`) que devuelve la propia API en `comparacion.historico`.

## Cautelas que valen para las tres
- El feed en vivo cubre solo ~2 días: una muestra muy corta; lo reciente es preliminar (USGS publica y revisa con retraso) y el histórico es una instantánea revisada.
- La media anual de 2025 está inflada por las secuencias de réplicas (media 23,45 frente a mediana 19 terremotos/día de M ≥ 4,5): por eso se muestra también la mediana.
- **Cobertura distinta**: el feed `all_day` no garantiza cobertura completa por debajo de M4,5 fuera de EE. UU.; el histórico sí incluye esas magnitudes. Una diferencia a M ≥ 4 no es un cambio real de actividad (conclusión 3).
- Esto describe lo observado: **no es una predicción de terremotos ni una evaluación de riesgo.**

## Conclusión 1 — hallazgo real: la mayoría de los terremotos fuertes caen fuera de todo polígono de país («Sin país asignado»)
- **Cifra:** de los terremotos de **M ≥ 4,5** del periodo reciente, **17 de 22 (77,3 %)** quedan «Sin país asignado»; en 2025 fueron **7 079 de 8 559 (82,7 %)**.
- **Filtros y periodo:** `min_mag=4.5`, ámbito global frente a `country_id=sin_pais` (y global), periodo reciente fijo; 2025 completo.
- **Consultas:** `/api/estadisticas?start=2026-11-05T17:00:00Z&end=2026-11-07T18:00:00Z&min_mag=4.5` y la misma con `&country_id=sin_pais` (el 2025 sale de `comparacion.historico.total` de ambas).
- **Por qué es un hallazgo y no un artefacto de cobertura:** a M ≥ 4,5 el feed es global y comparable con el histórico; ambos periodos usan el mismo catálogo de países y la misma regla (pertenencia al polígono, nunca el país más cercano).
  Los dos porcentajes son del mismo orden (la diferencia de 5 puntos con solo 22 eventos no es concluyente). Es coherente con la geología: los terremotos se concentran en zonas de subducción y dorsales, casi todas en el mar, y el catálogo Natural Earth 1:110 M no incluye aguas territoriales
  (F4 midió que solo ≈ 1,4 % de los «sin país» se explican por islas o costa simplificada).
- **Cautelas propias:** «Sin país asignado» no equivale a «océano» en sentido estricto; con 22 eventos un solo terremoto cambia 4,5 puntos.

## Conclusión 2 — diferencia observada, NO concluyente: el recuento reciente de M ≥ 4,5 es inusualmente bajo frente a 2025, pero no demuestra un descenso real
- **Cifra:** **22 terremotos de M ≥ 4,5 en ≈ 2,04 días (10,8/día)** frente a una media diaria de 2025 de **23,45** (mediana diaria **19**) → esperado para el periodo **47,9**; diferencia **−54 %**.
- **Contraste con el histórico (SQL de solo lectura):** en las 8 664 ventanas de 49 h de 2025 (una por hora) hubo entre **19 y 573** terremotos de M ≥ 4,5 (p5 = 26, mediana 40, p95 = 86); solo el **1,0 %** de las ventanas tuvo 22 o menos. Es decir, 22 es un valor bajo incluso para 2025.
- **Filtros y periodo:** `min_mag=4.5`, ámbito global; periodo reciente fijo. **Consulta:** `/api/estadisticas?start=2026-11-05T17:00:00Z&end=2026-11-07T18:00:00Z&min_mag=4.5` (campos `comparacion.reciente.count`, `comparacion.historico.media_diaria`, `mediana_diaria`, `esperado_para_ventana`, `variacion`).
- **Por qué no se concluye un descenso:** solo ≈ 2 días de muestra; 2025 incluye grandes secuencias de réplicas que elevan las ventanas altas (la distribución es muy asimétrica: máximo 573); los eventos recientes pueden revisarse o completarse después; y no se ha comprobado la completitud del feed a M 4,5–5 por la misma vía que a M 4,0–4,5.
  La conclusión defendible es: «con los datos actuales, el recuento reciente cae en el extremo bajo del histórico; hace falta una muestra mayor para decir si hay un cambio».
- **No se presenta** como tendencia, como señal de menor riesgo ni como predicción.

## Conclusión 3 — diferencia de COBERTURA, no de actividad: por debajo de M4,5 el feed reciente recoge una fracción mucho menor que el histórico
- **Cifra:** de los terremotos de **M ≥ 4**, la banda **M 4,0–4,5** fue el **53,2 %** en 2025 (9 743 de 18 302; **26,7/día**), pero solo el **29,0 %** en el periodo reciente (9 de 31; **4,4/día**).
  La tasa de M ≥ 4,5 reciente es el 46 % de la de 2025 (10,8 frente a 23,5/día) mientras que la de la banda 4,0–4,5 es el **17 %** (4,4 frente a 26,7/día): el feed pierde proporcionalmente casi tres veces más en la banda baja.
- **Filtros y periodo:** `min_mag=4` y `min_mag=4.5`, ámbito global, periodo reciente fijo; la banda es la resta (M ≥ 4) − (M ≥ 4,5) en ambos periodos.
- **Consultas:** `/api/estadisticas?start=2026-11-05T17:00:00Z&end=2026-11-07T18:00:00Z&min_mag=4` y `...&min_mag=4.5` (`comparacion.reciente.count` y `comparacion.historico.total` de cada una).
- **Interpretación:** USGS solo garantiza cobertura mundial completa desde M4,5 (fuera de EE. UU.); por debajo, el catálogo histórico revisado contiene eventos que el feed rápido no publica. Por eso el panel advierte siempre de que una variación a M ≥ 4 no demuestra un cambio real y sugiere M ≥ 4,5.
- **Cautelas propias:** 9 eventos en la banda reciente (muestra mínima); la banda de 2025 es del catálogo revisado y la reciente del feed preliminar, así que parte de la diferencia también puede ser revisión posterior y no solo cobertura.

## Dato descriptivo adicional (solo feed en vivo, sin comparación)
Profundidad de los 22 terremotos de M ≥ 4,5 recientes: 12 de 22 a menos de 70 km (7 de ellos a menos de 30 km), 6 entre 70 y 150 km, 1 entre 150 y 300 km y 3 a 500 km o más (ninguno entre 300 y 500 km). Países con evento de M ≥ 4,5 y polígono: Chile, Indonesia, Japón, Namibia y Papúa Nueva Guinea (1 cada uno); EE. UU. 0 (frente a 23 en 2025).
Descripción de la muestra; no se compara con 2025 porque la distribución de profundidad de 2025 no la expone la API.

## Resumen de clasificación
| Conclusión | Tipo | Se puede afirmar |
|---|---|---|
| 1. «Sin país asignado» domina a M ≥ 4,5 | Hallazgo real (cobertura comparable) | 77 % reciente frente a 83 % en 2025: del mismo orden |
| 2. Recuento reciente bajo a M ≥ 4,5 | Diferencia observada, no concluyente | Está en el 1 % inferior de las ventanas de 2025, pero no demuestra un descenso |
| 3. Banda M 4,0–4,5 con menor cobertura | Diferencia de cobertura del feed | Las variaciones a M ≥ 4 no se pueden leer como cambios reales de actividad |
