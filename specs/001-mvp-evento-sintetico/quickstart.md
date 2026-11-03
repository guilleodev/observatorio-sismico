# Guía de validación (quickstart): MVP — evento sintético

Guía para comprobar de extremo a extremo que el MVP funciona. **Todavía no se ha ejecutado**: es el
procedimiento que se seguirá al terminar la implementación. Los resultados reales se guardarán en
`docs/evidencias/mvp/`; no se rellenan aquí por adelantado.

Contratos y modelo: [contracts/](contracts/), [data-model.md](data-model.md).

## Requisitos previos

- Docker Desktop **en ejecución** (comprobar con `docker info`).
- Node.js 22.12+ o 24 y `npm` (el frontend ya tiene `node_modules`).
- Archivo `.env` creado a partir de `.env.example` (no se versiona).

## 1. Arrancar el sistema vacío (mide SC-001)

```powershell
Copy-Item .env.example .env        # editar POSTGRES_PASSWORD con un valor local
$t0 = Get-Date
docker compose up --build -d
# repetir hasta que los 5 servicios estén healthy y anotar el tiempo transcurrido
docker compose ps
((Get-Date) - $t0).TotalSeconds
```

**Esperado**: `kafka`, `postgres`, `producer`, `consumer` y `api` en estado `healthy`; el tiempo se
anota tal cual, con la indicación de si las imágenes ya estaban descargadas (SC-001: < 10 min, o
< 3 min con imágenes en caché).

## 2. API vacía

```powershell
Invoke-RestMethod http://localhost:8000/api/eventos | ConvertTo-Json -Depth 5
```

**Esperado**: `features` vacío, `metadata.count = 0`, `metadata.last_ingestion = null`,
`metadata.mode = "synthetic"` (no un error).

## 3. Emitir el evento sintético (inicia la medición de SC-002)

```powershell
Get-Date -Format o                                   # anotar el instante de emisión
docker compose exec producer python -m observatorio.producer.emitir_sintetico
docker compose logs consumer --tail 20
docker compose exec postgres psql -U observatorio -d observatorio -c "SELECT event_id, mode, source, event_time FROM sintetico.evento_actual;"
```

**Esperado**: el consumidor registra la recepción y el guardado; 1 fila con `mode = synthetic`.

## 4. Consultar la API

```powershell
Invoke-RestMethod http://localhost:8000/api/eventos | ConvertTo-Json -Depth 6
```

**Esperado**: 1 Feature `synthetic-mvp-001`; coordenadas `[lon, lat, prof]`; fechas en ms; `country_*`
a `null`; `metadata.mode = "synthetic"`; `metadata.last_ingestion` con el instante del mensaje
sintético (significado provisional del MVP, **no** una consulta a USGS).

## 5. Ver el mapa (termina la medición de SC-002)

```powershell
cd frontend; npm start          # abre http://localhost:4200
```

**Esperado**: círculo en la posición del evento, insignia «DATOS SINTÉTICOS» y ficha con
«SINTÉTICO» e id. Anotar el instante en que aparece y restarlo al de emisión del paso 3
(SC-002: ≤ 2 minutos; el mapa se refresca cada 60 s).

## 6. Reenvío (idempotencia básica)

```powershell
docker compose exec producer python -m observatorio.producer.emitir_sintetico --repeat 5
docker compose exec postgres psql -U observatorio -d observatorio -c "SELECT count(*) FROM sintetico.evento_actual;"
```

**Esperado**: el recuento sigue en `1`; la API devuelve un único Feature.

## 7. Persistencia tras reinicio

```powershell
docker compose restart
docker compose ps
Invoke-RestMethod http://localhost:8000/api/eventos | Select-Object -ExpandProperty metadata
```

**Esperado**: `count = 1` tras volver a estar sanos los servicios; sin duplicados.

## 8. Fallo de la base de datos al consultar (error explícito)

```powershell
docker compose stop postgres
Invoke-WebRequest http://localhost:8000/api/eventos -SkipHttpErrorCheck | Select-Object StatusCode
docker compose start postgres
```

**Esperado**: `503` con error explícito, no una colección vacía.

## 9. Kafka caído al emitir

```powershell
docker compose stop kafka
docker compose exec producer python -m observatorio.producer.emitir_sintetico --secuencia 3
"código de salida: $LASTEXITCODE"
docker compose start kafka
docker compose exec postgres psql -U observatorio -d observatorio -c "SELECT count(*) FROM sintetico.evento_actual WHERE event_id = 'synthetic-mvp-003';"
```

**Esperado**: la emisión falla con un error visible y código de salida distinto de cero, sin
registrar «publicado»; el recuento de `synthetic-mvp-003` es `0`.

## 10. Offset confirmado después del guardado (almacén caído al consumir)

```powershell
docker compose stop postgres
docker compose exec producer python -m observatorio.producer.emitir_sintetico --secuencia 4
docker compose logs consumer --tail 20          # error al guardar, sin confirmar offset
docker compose start postgres
# esperar a que el consumidor reintente, y entonces:
docker compose exec postgres psql -U observatorio -d observatorio -c "SELECT count(*) FROM sintetico.evento_actual WHERE event_id = 'synthetic-mvp-004';"
docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group observatorio-mvp
```

**Esperado**: mientras la base está caída el mensaje no se pierde ni se confirma; tras recuperarse
queda guardado **una sola vez** (`count = 1`) y el retardo (`LAG`) del grupo vuelve a `0`. Esta
comprobación y la prueba unitaria del orden «guardar → confirmar» (tarea T020) cubren
`ENUNCIADO.md` §11 «Reiniciar consumidor» y FR-004.

## 11. Caducidad de 24 horas (SC-009)

```powershell
docker compose exec producer python -m observatorio.producer.emitir_sintetico --secuencia 2 --minutos-atras 1500
docker compose exec postgres psql -U observatorio -d observatorio -c "SELECT event_id, event_time FROM sintetico.evento_actual WHERE event_id = 'synthetic-mvp-002';"
(Invoke-RestMethod http://localhost:8000/api/eventos).features | Where-Object { $_.id -eq 'synthetic-mvp-002' }
```

**Esperado**: el evento `synthetic-mvp-002` (25 h de antigüedad) está en la base (1 fila) y **no**
aparece en la respuesta por defecto de la API ni en el mapa (0 resultados).

## 12. CORS desde un origen distinto

```powershell
# Origen permitido
Invoke-WebRequest http://localhost:8000/api/eventos -Headers @{ Origin = 'http://localhost:4200' } | Select-Object -ExpandProperty Headers
# Preflight desde el origen permitido
Invoke-WebRequest http://localhost:8000/api/eventos -Method Options -Headers @{ Origin = 'http://localhost:4200'; 'Access-Control-Request-Method' = 'GET'; 'Access-Control-Request-Headers' = 'ngrok-skip-browser-warning' } | Select-Object StatusCode
# Origen no autorizado
Invoke-WebRequest http://localhost:8000/api/eventos -Headers @{ Origin = 'http://otro-origen.example' } | Select-Object -ExpandProperty Headers
```

**Esperado**: con el origen permitido, la respuesta incluye `Access-Control-Allow-Origin:
http://localhost:4200` y el preflight responde con éxito; con el origen no autorizado **no**
aparece `Access-Control-Allow-Origin`. (El navegador real queda cubierto por el paso 5.)

## 13. Retención limitada de Kafka (SC-010)

```powershell
docker compose exec kafka /opt/kafka/bin/kafka-configs.sh --bootstrap-server localhost:9092 --describe --entity-type brokers --entity-default --all | Select-String "log.retention.hours|log.retention.bytes|log.roll.hours"
docker compose exec kafka /opt/kafka/bin/kafka-configs.sh --bootstrap-server localhost:9092 --describe --entity-type topics --entity-name terremotos.sintetico --all | Select-String "retention.ms|retention.bytes|segment.ms"
```

**Esperado**: los valores efectivos coinciden con la política de `research.md` R-004 (24 h, 100 MiB,
cierre de segmento cada 6 h). Si el mapeo de variables no se aplicó, se anota y se corrige.

## 14. Aislamiento y exposición

```powershell
docker compose ps --format "table {{.Service}}\t{{.Ports}}"
```

**Esperado**: solo `api` publica un puerto, ligado a `127.0.0.1:8000`; `kafka` y `postgres` sin
puertos en el host. No hay tráfico hacia USGS: revisar que ningún servicio contiene esa URL.

## 15. Parar

```powershell
docker compose down      # conserva el volumen de PostgreSQL
# docker compose down -v  # además borra los datos (para repetir desde cero)
```

## Repetir la demostración

El reenvío de un identificador ya guardado se ignora y **no refresca** su hora, y un evento con más
de 24 h deja de verse en la API. Para repetir la demostración:

- **Sin borrar datos**: emitir otro evento con `--secuencia N` (por ejemplo, `--secuencia 5`); tendrá
  una hora reciente y aparecerá en el mapa en el siguiente refresco.
- **Desde cero**: `docker compose down -v`, `docker compose up --build -d` y volver al paso 3. Esto
  borra los datos sintéticos y los mensajes del broker.

`scripts/verificar-mvp.ps1` encadena estos pasos y guarda la salida en `docs/evidencias/mvp/`.
