# Recuperación automática tras apagar el PC (2026-11-18)

Prueba de robustez en el sistema real: se apagó Windows durante la noche y, al encenderlo, se comprobó que el sistema se recupera solo y que los terremotos ocurridos durante la parada se guardan. Todo lo que sigue sale de consultas de **solo lectura** hechas el 2026-11-18 entre las 09:20 y las 09:30 UTC.

## Qué se hizo
- El 2026-11-18 a las ≈ 00:05 UTC se apagó el PC con los cinco servicios sanos (sin `docker compose stop` ni `down`). La última consulta de EMSC marcó su marca de actualización en `2026-11-18T00:04:49`.
- A las 09:18 UTC se encendió. **No se ejecutó ningún comando para recuperar**: solo se esperó a que Docker Desktop arrancara y se abrió el túnel de ngrok.

## Resultado
| Comprobación | Resultado |
|---|---|
| Servicios | Los cinco `healthy` a los ≈ 2 minutos del arranque, solos (`restart: unless-stopped`) |
| Productor | Reintentó la conexión con Kafka durante unos segundos («Kafka no disponible; reintento en 1 s, 2 s, 4 s») y arrancó |
| USGS | Consulta correcta: 216 eventos del feed; **publicadas = 79** |
| EMSC | Consulta incremental desde `updatedafter = 2026-11-18T00:04:49`: 181 eventos; **publicadas = 180, omitidas = 1** |
| Terremotos ocurridos durante la parada (00:05–09:18 UTC) y guardados **después** de arrancar | **EMSC: 116 de 116 · USGS: 62 de 62** |
| Huecos | Ninguno nuevo: la parada fue de ≈ 9 h, menos de las 18 h (24 h − margen de 6 h) a partir de las cuales se registra un hueco; el último sigue siendo el #478 y `/api/salud` da `gaps_pending = 0` |
| Integridad (`invariantes.sh`) | Reconciliación 0, offsets duplicados 0, estado actual desfasado 0, lag 0 (offset 4952 = final 4952), `geo` incoherentes 0 |
| Web pública | `/api/salud` → `status ok`, ingesta al día (59 s), EMSC activa |

### Terremotos por hora de ocurrencia (UTC), antes, durante y después de la parada
```
  hora  | usgs | emsc
--------+------+------
 17 20h |   13 |    8
 17 21h |   12 |   21
 17 22h |    6 |    8
 17 23h |    6 |   12
 18 00h |    6 |   13      ← empieza la parada (≈ 00:05)
 18 01h |    6 |    5
 18 02h |    7 |   17
 18 03h |   11 |    9
 18 04h |    9 |   22
 18 05h |    9 |   21
 18 06h |    5 |   13
 18 07h |    1 |    8
 18 08h |    5 |    8
 18 09h |    3 |    2      ← el sistema ya está en marcha (09:18)
```
Ninguna franja horaria de la parada quedó vacía. Los valores bajos (p. ej. 1 de USGS a las 07 h) son poca actividad sísmica, no un hueco: los 62 eventos de USGS ocurridos durante la parada se publicaron al arrancar porque el feed `all_day` conserva las últimas 24 h.

## Por qué funciona
- **USGS**: el productor compara `id` y `updated` con `live.version_publicada` y publica lo que no conoce; el feed `all_day` cubre 24 h, así que una parada de menos de ≈ 18 h no pierde nada.
- **EMSC**: la marca de actualización solo avanza cuando la publicación terminó, y la primera consulta tras una parada pide desde ella (con 120 s de margen), con un máximo de 7 días.
- **Kafka y PostgreSQL**: sus datos viven en volúmenes (`kafkadata`, `pgdata`) que sobreviven al apagado; el consumidor confirma el offset después de guardar.

## Límites
- Es una sola parada de ≈ 9 h. Una parada de más de ≈ 18 h registra un hueco y su recuperación es **a demanda** (`docs/evidencias/f4/recuperacion-hueco-475.md`; huecos #475–#478 en `docs/evidencias/f3/sc-010-observacion-24h.txt`).
- La comprobación es contra la propia base de datos (los eventos que ocurrieron en la parada, según los feeds, están guardados); no se comparó con una copia independiente de los feeds.
- No prueba la disponibilidad durante la ventana de evaluación: depende de que el PC no se suspenda y de que ngrok esté abierto.
