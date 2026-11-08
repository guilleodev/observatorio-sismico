# Guía de validación: replay, integración y despliegue (F6)

Guion de pruebas de extremo a extremo por paso. Datos en [data-model.md](data-model.md); contratos en [contracts/f6.md](contracts/f6.md); decisiones y puntos de autorización en [plan.md](plan.md).
**Previos**: los cinco servicios `healthy`, `INGESTA_PUBLICAR=true` en el `.env` local, lag 0 y reconciliación de F3 vacía, 661 pruebas de backend y 88 de frontend en verde,
`scripts/f5/aislamiento_final.sh` en OK. **Nunca** `docker compose down -v`, ni borrar volúmenes o datos, ni recrear Kafka o PostgreSQL. Los comandos concretos se fijan al implementar cada paso.

## 6.1 Replay aislado
Aplicar la migración (PA-2), recrear consumidor y productor (PA-3), reproducir la selección por defecto (PA-4). **Esperado**: 35 filas actuales, 37 versiones y 1 en cuarentena (39 mensajes) en
`replay`; `live`, `historico` y `sintetico` con las mismas huellas; repetir con el mismo `run_id` no cambia nada; interrumpir y reanudar no duplica.

## 6.2 API y panel
`/api/eventos?mode=replay`, `/api/estadisticas?mode=replay`, `/api/salud?mode=replay`, `mode=otro` (422), `run` inexistente (422). En el panel, el selector. **Esperado**: periodo de la
ejecución, «REPRODUCCIÓN» visible en todo, mapa = tabla = gráficas, comparación «no aplica», volver a vivo no deja datos de replay; velocidad e identidad medidas.

## 6.3 Integración, aceptación y regresión
Rastro de un evento real; las filas de §11 de la tabla de [research.md](research.md#r-008--pruebas-de-aceptación-de-11-cómo-se-ejecuta-cada-fila); suites completas con la salida guardada;
matrices de F5 actualizadas. **Esperado**: resultado observado = esperado en cada fila; todo en verde.

## 6.4–6.5 Mediciones y comparaciones
`scripts/f6/` en un contenedor y una base temporales: tres tamaños por operación, tiempo y memoria, secuencial/diccionario, SQL sin/con índice. **Esperado**: tablas reproducibles y
un informe con la proyección a 10⁸ y los costes. Umbrales nuevos: propuestos tras medir y confirmados.

## 6.6 ngrok y Netlify
Local primero: build, preflight desde el origen de Netlify (simulado con `Origin`), escaneo de secretos, comprobación de que solo responde la API. Con PA-8: túnel, sitio, publicación,
apertura desde otro dispositivo, cierre y reapertura del túnel. **Esperado**: ver SC-014 y las dos filas del túnel.

## 6.7 Accesibilidad, responsive y compatibilidad
Guion con lector de pantalla, zoom 200 %, 320 px, contraste del mapa, matriz de anchos y navegadores. **Esperado**: sin pérdida de función; hallazgos corregidos o documentados.

## 6.8 Estabilidad, recuperación y persistencia
Con PA-5/PA-6: parar y arrancar cada componente con invariantes antes y después; ejecución de ≤ 60 min. **Esperado**: lag 0, reconciliación 0, 0 duplicados, mismos volúmenes.

## 6.9 Entregables y cierre
Proyecto Compose paralelo siguiendo el README (PA-7), procedimiento de defensa en seco, lista final de la Guía, `resultados.md`, revisión Architect y QA, `git status` y escaneo de secretos.
**Esperado**: ver SC-015, SC-016 y SC-019. No hacer commit ni push.

## 6.10 SC-010 de F3 (solo con PA-10)
Consultas de solo lectura de T044 de F3. **Esperado**: eventos anteriores a 24 h conservados y reconciliación vacía; hasta entonces, «pendiente de observación».
