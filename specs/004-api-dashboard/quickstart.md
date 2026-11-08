# Guía de validación: API y dashboard (F5)

Guion de pruebas de extremo a extremo por paso. Datos en [data-model.md](data-model.md); contrato en [contracts/api-f5.md](contracts/api-f5.md).
**Previos**: los cinco servicios `healthy`, `.env` local con `INGESTA_PUBLICAR=true`, lag 0 y consulta de reconciliación de F3 vacía
(`specs/002-ingesta-real-calidad/quickstart.md`), suite de 419 pruebas en verde. **Nunca** `docker compose down -v`, ni parar PostgreSQL/productor reales, ni borrar
volúmenes. Los comandos concretos se fijan al implementar cada paso; la API se reconstruye con `docker compose up -d --build --no-deps api`.

## 5.1 Eventos y filtros
`curl` a `/api/eventos` sin parámetros (igual que en F4) y con cada filtro y sus combinaciones (`start`, `end`, `min_mag`, `country_id=ESP`, `sin_pais`); casos inválidos
(fecha mala, `start ≥ end`, país inexistente, `limit` excesivo); paginación con `limit=50` recorriendo `next_offset`.
**Esperado**: recuento = SQL independiente; 422 con `{error, detail}`; `truncated`/`total` correctos; cada evento una vez.

## 5.2 Estadísticas
`/api/estadisticas` con las mismas combinaciones. **Esperado**: periodo, filtros, unidad y `sin_valor` en cada bloque; `Σ items + sin_valor = total` y `total` = `metadata.total`
de `/api/eventos`; con un listado truncado, las estadísticas no cambian.

## 5.3 Ventanas de 1 h y comparación
Ventanas de unas horas con huecos de actividad; evento en `hh:00:00.000`; ventana de 32 días (422). Comparación global, de un país y `sin_pais`; `min_mag=2` (se eleva a 4);
media 0 (variación no definida); ventana con hueco pendiente simulado en base temporal. **Esperado**: coincide con `scripts/f4/comparacion.py` y con total/365.

## 5.4–5.5 Panel
`cd frontend && npm start` (API en `127.0.0.1:8000`, `mode: "api"`). Cambiar periodo, magnitud mínima y país; seleccionar un evento en la tabla; ordenar y buscar; cargar la
página siguiente con un límite bajo en una API temporal. **Esperado**: mapa, tabla, gráficas y comparación con las mismas cifras; modo `demo` intacto.

## 5.6 Errores y estado
API temporal contra una base temporal: base inalcanzable (503), ingesta antigua (reloj simulado, `stale`), filtro sin eventos, tiempo de espera, listado truncado, hueco pendiente.
**Esperado**: un aviso distinto por caso; la última lectura se conserva con su antigüedad.

## 5.7 Validación y cierre
`EXPLAIN ANALYZE` con y sin índice en una base temporal con las 18 302 filas reales; mediana y p95 de cada endpoint (≥ 100 peticiones); matriz de escenarios del panel con
capturas; tres conclusiones reproducidas con la API; suite completa, aislamiento e invariantes de Kafka/PostgreSQL. **Esperado**: ver SC-010 a SC-012.
