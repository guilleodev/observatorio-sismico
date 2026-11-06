# Guía de validación: Geografía e histórico (F4)

Guion de pruebas de extremo a extremo por paso. Detalle de datos en [data-model.md](data-model.md) y de contratos en [contracts/](contracts/).
**Previos**: los cinco servicios `healthy`, `.env` local con `INGESTA_PUBLICAR=true`, lag 0 y consulta de reconciliación de F3 vacía
(`specs/002-ingesta-real-calidad/quickstart.md`). **Nunca** `docker compose down -v` ni borrar volúmenes. Comandos concretos se fijan al implementar cada paso.

## 4.1 Catálogo
Informe del catálogo (177 entidades, `ADM0_A3` único, `Polygon`/`MultiPolygon`, CRS84, entidades `-99`). Aplicar la parte `geo` de `sql/003_esquema_f4.sql`
dos veces y cargar `geo.pais`. **Esperado**: 177 filas, segunda ejecución sin cambios, archivo montado solo lectura.

## 4.2 Asignación
Puntos de control: `(-3.7, 40.4)` → `ESP`; un punto del Atlántico → `null`. Reconstruir `consumer`, procesar un evento real nuevo y consultar `GET /api/eventos`.
Ejecutar la asignación retroactiva dos veces. **Esperado**: todos los eventos con `geo_resultado`; segunda ejecución sin cambios; una revisión con otro país
actualiza el estado actual y una versión antigua tardía no.

## 4.3 Casos límite
Batería de ≥ 20 puntos (océano, frontera exacta, antimeridiano, polos, isla ausente, ceros). Recuento de «sin país» y de `frontera`/`varias` sobre los eventos reales.
Contraste de ≥ 100 eventos con el sufijo de `place`. Tiempo por evento con `STRtree` y secuencial. **Esperado**: 100 % de la batería correcta; discrepancias explicadas.

## 4.4 Histórico
`docker compose build` y después `docker compose run --rm --no-deps -v <catálogo>:/datos/paises.geojson:ro -v <data/historico>:/exportacion producer python -m observatorio.historico.cargar` (nombre provisional). Comparar cada mes con el recuento del catálogo (referencia
real el 2026-11-06: 18 302 en 2025, ver R-006), repetir la carga (0 consultas a USGS), reiniciar contenedores y comprobar el histórico. Prueba con límite pequeño para
provocar la subdivisión y con un tramo interrumpido. **Esperado**: cuadre `Σ obtenidos − Σ duplicados = eventos + cuarentena`; 0 filas históricas en `live`.

## 4.5 Hueco
Recursos temporales (base, topic y grupo aparte, como en F3): simular una última ingesta correcta de más de 24 h − margen, comprobar la advertencia y el hueco (`recuperar --listar`), ejecutar la
recuperación contra un catálogo simulado, repetirla (la recuperación contra USGS real solo ante un hueco real). **Esperado**: eventos recuperados una vez, con `source = usgs-fdsn-recuperacion`; el hueco pasa a `recuperado`; intervalo menor sin hueco.

## 4.6 Comparaciones y cierre
Ejecutar las consultas de [contracts/consultas-comparacion.md](contracts/consultas-comparacion.md) (global, un país y «sin país») y contrastarlas con un recuento
independiente; media cero → «no definida». Cuadres de trazabilidad (R-011), medición de índices y rendimiento, suite completa (205 pruebas de F3 + nuevas).
**Esperado**: SC-001 a SC-012 con evidencia en `docs/evidencias/f4/`; los no medidos figuran como pendientes.
