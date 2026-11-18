# Procedimiento para activar el sistema durante la evaluación (Guía 3.2; el nombre del archivo conserva la antigua «defensa»)

Cinco pasos, de unos 5 minutos. El ensayo en seco (sin abrir ngrok ni publicar nada) está en `6.9-defensa-seco.txt`. **Nada de esto borra datos.** Variable: `<dominio>` = tu dominio de ngrok (`grandpa-bunkbed-spree.ngrok-free.dev`); sitio = `https://observatorio-sismico.netlify.app`.

## 1. Arrancar Docker Compose y comprobar los servicios
```bash
docker compose up -d --wait        # no recrea lo que ya corre; si el equipo se apagó, los volúmenes conservan los datos
docker compose ps                  # esperado: api, consumer, kafka, postgres y producer en «healthy»
```
Si Docker Desktop no está abierto, ábrelo y espera 1–3 minutos: el consumidor puede reiniciarse una vez mientras Kafka arranca (esperado, ver `6.8-reinicio.txt`). **Nunca** `down -v`.

## 2. Comprobar la base y que funciona la ingesta
```bash
bash scripts/f6/invariantes.sh defensa     # lag 0, reconciliación 0, 0 duplicados, huellas de historico y sintetico, volúmenes
```
Esperado: `reconciliacion=0`, `offset/final/lag=N/N/0`, 18 302 eventos de 2025 en `historico` y «ingesta hace < 60 s» (`estado_ingesta`). Si `INGESTA_PUBLICAR` no es `true` en el `.env`, el productor solo consulta (modo seco).

## 3. Activar ngrok y verificar la URL configurada en Angular
```bash
ngrok http --url=https://<dominio> 8000          # deja la ventana abierta
curl -s -o /dev/null -w "%{http_code}\n" https://<dominio>/api/salud                      # esperado 401 (sin clave)
```
La URL que usa Angular está en `config.json` del sitio publicado (`apiUrl`); debe ser la de ngrok. Con la clave (cabecera `X-Observatorio-Clave`, guardada en el `.env`) debe responder 200. Si el túnel está cerrado: HTTP 404 de ngrok y el panel muestra «Sin conexión con el backend».

## 4. Abrir el panel y comprobar datos, filtros y estado
Abre `https://observatorio-sismico.netlify.app`, escribe la clave cuando la pida (solo se guarda en memoria) y comprueba: eventos en el mapa = filas de la tabla = total de gráficas, filtros (periodo, magnitud, país), comparación con 2025 y estado («Datos al día», última ingesta). Tras cada cambio del túnel usa **«Actualizar ahora»** (el refresco automático es de 10 min).

## 5. Preparar la reproducción histórica
Ver [`reproduccion-historica.md`](reproduccion-historica.md). Ensayo previo sin publicar: `docker compose run --rm --no-deps producer python -m observatorio.replay.reproducir --solo-plan`. En la demostración: consumidor efímero + `reproducir --run r-defensa` (≈ 76 s) y en el panel el selector **REPRODUCCIÓN**.

## Al terminar
Cierra ngrok (Ctrl+C). Deja Docker en marcha o `docker compose stop` (conserva todo).

## Preguntas que conviene tener preparadas
Recorrido de un evento (USGS → productor → Kafka → consumidor → PostgreSQL → API → panel) y una decisión propia: «confirmamos el offset después de guardar en PostgreSQL; si el proceso se interrumpe y Kafka reentrega, las restricciones y la escritura idempotente evitan duplicar». Más en `resultados.md` (T073).
