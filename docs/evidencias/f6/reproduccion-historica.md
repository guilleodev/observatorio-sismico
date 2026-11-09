# Reproducción histórica (Guía 2.9) · F6

Todo lo de esta página está medido en el sistema real y respaldado por evidencias (`6.1-*`, `6.2-*`, `6.3-*`). Solo se escribe en el esquema `replay` y el topic `terremotos.replay`.

## 1. Qué selección se usa y cómo se obtuvo
- Fuente: `historico.evento`, la carga de USGS 2025 (M ≥ 4, `earthquake`, 18 302 eventos; solo lectura, módulo `replay/seleccion.py`).
- Por defecto, el **día UTC de 2025 con más eventos** (2025-07-30 en las ejecuciones de prueba) o el que se indique con `--dia`; `REPLAY_EVENTOS` (30) eventos reales, ordenados por su tiempo original.
- A ellos se añaden **seis casos controlados** con ids propios `replay-ctl-…` (duplicado, revisión, evento antiguo, magnitud nula, marítimo y coordenadas inválidas), derivados de eventos base reales. Solo existen en `replay`: nunca en `live` ni en `historico` (constitución v1.0.4).
- Resultado de una ejecución: 39 mensajes (30 reales + 9 de casos) → esperado **35 actuales / 37 versiones / 1 en cuarentena** (`6.1-replay-real.txt`).

## 2. Cómo iniciarla y a qué velocidad
```bash
docker compose run --rm --no-deps producer python -m observatorio.replay.reproducir --solo-plan        # plan sin publicar
docker compose run --rm --no-deps consumer python -m observatorio.consumer.main --destino replay &    # consumidor efímero
sleep 8; docker compose run --rm --no-deps producer python -m observatorio.replay.reproducir --run r-demo
```
- Velocidad = (diferencia de tiempo original entre mensajes) / `REPLAY_INTERVALO_S`. Con 2 s: **×31,9** (76 s para 39 mensajes); con 0,5 s: **×127,6**. Se registra en `replay.ejecucion.velocidad`.
- Medido: duración observada 76,1 s frente a 76,0 s previstos (×1,002) y separación entre mensajes de 2,00 s (mediana) (`6.2-velocidad-identidad.txt`).
- Para repetir o reanudar una ejecución: `--reanudar <RUN_ID>`; el procesamiento idempotente absorbe lo ya guardado (0 duplicados, `6.1-replay-ensayos.txt`).

## 3. Cómo se separa de lo actual
- Topic y grupo propios (`terremotos.replay` / `consumidor-replay`); `ConfigReplay` impide por código que coincidan con los de vivo. El consumidor de `live` solo lee `terremotos.live`.
- Esquema `replay` aparte, sin claves foráneas hacia `live` ni `historico`, y `CHECK` de modo (`replay`) y fuente (`replay-historico`) en la base. Un dato de `live` exige `mode = 'live'`.
- En la API, `mode=live|replay` (otro valor → 422); `mode=replay` devuelve solo `replay`. `aislamiento.txt` comprueba 0 ids cruzados y que `live`, `historico` y `sintetico` conservan sus huellas.
- Se conserva el tiempo original (`time`, `updated`: 30 de 30 idénticos a `historico`) y se añade el instante de reproducción (`ingested_at`, 466 días posterior).

## 4. Cómo se identifica «REPRODUCCIÓN» en el panel
Selector **En vivo / REPRODUCCIÓN**. En modo reproducción aparece la misma etiqueta en el mapa, la tabla, la ficha, las gráficas y el estado: «REPRODUCCIÓN · ejecución r-… · ×31,9 · terminada», con el texto «Reproducción histórica (no es actividad actual)». La comparación con 2025 «no aplica» y los casos controlados se marcan en la tabla. Al volver a «En vivo» no queda ningún dato de reproducción (`6.2-panel.txt`).

## 5. Esperado y observado
| Qué | Esperado | Observado |
|---|---|---|
| Recuentos de una ejecución | 35 / 37 / 1 | 35 / 37 / 1 en `r-f6-prueba-a`, `-b` y `r-f6-estab-11082023` |
| Casos controlados | los seis con su resultado | OK (SC-003, `6.1-replay-real.txt`) |
| Tiempos originales | idénticos | 30/30 |
| Duplicados al repetir o matar el consumidor efímero | 0 | 0 |
| Panel con REPRODUCCIÓN | 35 eventos, etiqueta visible | 35 eventos, 1 caso visible en la página 1 (`6.6-publicacion.txt` §3) |
| Fechas | las de 2025 | Un filtro de «últimas 24 h» de 2026 no los muestra: por eso el periodo por defecto es el de la ejecución |

El archivo estático de cuatro eventos del frontend (`mode: "demo"`) sirve para probar el mapa, pero no sustituye esta reproducción a través del pipeline.
