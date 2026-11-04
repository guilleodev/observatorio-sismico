# Verificacion final del MVP (quickstart pasos 1-14). NO borra datos ni volumenes (sin "down -v").
# Uso (desde la raiz del repositorio, con Docker Desktop abierto):  powershell -File scripts\verificar-mvp.ps1
# Anade 4 eventos sinteticos nuevos (siguientes secuencias libres) al almacen. Salida real: docs/evidencias/mvp/verificacion-final.txt
# Solo ASCII: PowerShell 5.1 lee los .ps1 sin BOM como ANSI.

$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Out = Join-Path (Get-Location) 'docs/evidencias/mvp/verificacion-final.txt'
[IO.File]::WriteAllText($Out, '', $Utf8)
$script:fallos = 0
$G = 'consumidor-sintetico'; $Topico = 'terremotos.sintetico'

function Log { param($t) $s = ($t -join "`n"); [IO.File]::AppendAllText($Out, $s + "`n", $Utf8); Write-Host $s }
function D { & docker compose --env-file .env.example @args 2>&1 | ForEach-Object { "$_" } }
function Sql { param($q) ((D exec -T postgres psql -U observatorio -d observatorio -tAc $q) -join '').Trim() }
function Verif { param($nombre, [bool]$ok, $detalle = '')
    if (-not $ok) { $script:fallos++ }
    Log ("[{0}] {1} {2}" -f $(if ($ok) { 'OK' } else { 'FALLO' }), $nombre, $detalle) }
function Esperar { param([scriptblock]$cond, [int]$seg = 60)
    $fin = (Get-Date).AddSeconds($seg)
    while ((Get-Date) -lt $fin) { if (& $cond) { return $true }; Start-Sleep -Seconds 1 }
    return $false }
function Api { param($ruta, $cabeceras = @())
    $r = & curl.exe -s --max-time 15 -w "`n%{http_code}" @cabeceras "http://127.0.0.1:8000$ruta" 2>$null
    $lineas = @($r); $codigo = [int]$lineas[-1]
    $cuerpo = ($lineas[0..($lineas.Count - 2)] -join "`n")
    $json = $null; try { $json = $cuerpo | ConvertFrom-Json } catch { }
    @{ codigo = $codigo; cuerpo = $cuerpo; json = $json } }
function Lag { $l = (D exec -T kafka sh -c "/opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group $G") |
        Where-Object { $_ -match [regex]::Escape($Topico) } | Select-Object -First 1
    if ($l) { return [int](($l -split '\s+')[5]) } else { return -1 } }
function Emitir { param([string[]]$argumentos)
    D exec -T producer python -m observatorio.producer.emitir_sintetico @argumentos }
function Filas { param($id) [int](Sql "SELECT count(*) FROM sintetico.evento_actual WHERE event_id='$id'") }


# Secuencias nuevas: siguiente numero libre, para poder repetir el script sin chocar con ejecuciones anteriores
$max = [int](Sql "SELECT coalesce(max(substring(event_id from '[0-9]+`$')::int), 0) FROM sintetico.evento_actual WHERE event_id LIKE 'synthetic-mvp-%'")
$n1 = $max + 1; $n2 = $max + 2; $n3 = $max + 3; $n4 = $max + 4
$id1 = 'synthetic-mvp-{0:000}' -f $n1; $id2 = 'synthetic-mvp-{0:000}' -f $n2
$id3 = 'synthetic-mvp-{0:000}' -f $n3; $id4 = 'synthetic-mvp-{0:000}' -f $n4

Log "# Verificacion final del MVP - $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"

# --- 1. T016 / SC-001: arranque de los cinco servicios --------------------------------------
Log "`n## 1. Arranque (T016, SC-001). Los datos NO estan vacios y las imagenes estaban en cache"
D stop | Out-Null
$t = Measure-Command { D up --build -d --wait --wait-timeout 240 | Out-Null }
Log (D ps --format '{{.Service}} {{.State}} {{.Health}}')
$estado = D ps --format '{{.Service}} {{.Health}}'
Verif 'Cinco servicios healthy' ((@($estado | Where-Object { $_ -match ' healthy$' }).Count) -eq 5) ("tiempo hasta healthy: {0:N1} s" -f $t.TotalSeconds)
Log (D exec -T consumer python -c "import sys, aiokafka, psycopg; print('python', sys.version.split()[0], '| aiokafka', aiokafka.__version__, '| psycopg', psycopg.__version__)")

# --- 2. T030: pruebas automatizadas ---------------------------------------------------------
Log "`n## 2. Pruebas automatizadas (T030) en contenedor Python 3.13"
$red = (docker network ls --format '{{.Name}}' | Where-Object { $_ -like '*observatorio*' } | Select-Object -First 1)
$pt = & docker run --rm --network $red -v "$((Get-Location).Path)/backend:/app" -w /app -e PYTHONPATH=/app/src -e PYTHONDONTWRITEBYTECODE=1 `
    -e POSTGRES_HOST=postgres -e POSTGRES_DB=observatorio -e POSTGRES_USER=observatorio -e POSTGRES_PASSWORD=CAMBIAR_EN_LOCAL `
    python:3.13-slim-trixie sh -c "pip install -q --no-cache-dir -r requirements-dev.txt 2>&1 | grep -v -i -E 'notice|warning'; python -m pytest tests/unit -p no:cacheprovider -q" 2>&1 | ForEach-Object { "$_" }
Log ($pt | Select-Object -Last 4)
Verif 'pytest sin fallos' ((($pt -join ' ') -match 'passed') -and -not (($pt -join ' ') -match 'failed|error'))

# --- 3. Recorrido (SC-002 parte API), idempotencia (SC-004) ---------------------------------
Log "`n## 3. Emision y recorrido productor -> Kafka -> consumidor -> PostgreSQL -> API (SC-002)"
$antes = Api '/api/eventos'
Log ("Antes: HTTP {0}; features: {1}" -f $antes.codigo, (@($antes.json.features).Count))
$sw = [Diagnostics.Stopwatch]::StartNew()
Log (Emitir @('--secuencia', "$n1"))
$vio = Esperar { $a = Api '/api/eventos'; @($a.json.features | Where-Object { $_.id -eq $id1 }).Count -eq 1 } 120
Verif 'Evento nuevo visible en la API' $vio ("desde la emision hasta la API: {0:N1} s (el mapa se midio a mano en 2.7)" -f $sw.Elapsed.TotalSeconds)
Log "`n## 3b. Reenvio idempotente (SC-004): --repeat 5 del mismo evento"
Log (Emitir @('--secuencia', "$n1", '--repeat', '5'))
Start-Sleep -Seconds 5
$a = Api '/api/eventos'
Verif 'Reenvio x5: 1 fila' ((Filas $id1) -eq 1) ("filas=" + (Filas $id1))
Verif 'Reenvio x5: 1 Feature' (@($a.json.features | Where-Object { $_.id -eq $id1 }).Count -eq 1)
Verif 'Lag del grupo = 0 (offsets confirmados)' ((Esperar { (Lag) -eq 0 } 30)) ("lag=" + (Lag))

# --- 4. T040 / SC-009: caducidad de 24 h ----------------------------------------------------
Log "`n## 4. Caducidad de 24 h (T040, SC-009): synthetic-mvp-002 (emitido con --minutos-atras 1500)"
Log (D exec -T postgres psql -U observatorio -d observatorio -c "SELECT event_id, event_time, now()-event_time AS antiguedad FROM sintetico.evento_actual ORDER BY event_id")
$a = Api '/api/eventos'
Verif 'Evento de 25 h guardado' ((Filas 'synthetic-mvp-002') -eq 1)
Verif 'Evento de 25 h NO aparece en la API' (@($a.json.features | Where-Object { $_.id -eq 'synthetic-mvp-002' }).Count -eq 0)
Log ("API: count={0}; mode={1}; last_ingestion={2}; truncated={3}" -f $a.json.metadata.count, $a.json.metadata.mode, $a.json.metadata.last_ingestion, $a.json.metadata.truncated)

# --- 5. T041: CORS --------------------------------------------------------------------------
Log "`n## 5. CORS (T041)"
$c1 = (& curl.exe -s -i -H 'Origin: http://localhost:4200' http://127.0.0.1:8000/api/eventos) -join "`n"
$c2 = (& curl.exe -s -i -X OPTIONS -H 'Origin: http://localhost:4200' -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: ngrok-skip-browser-warning' http://127.0.0.1:8000/api/eventos) -join "`n"
$c3 = (& curl.exe -s -i -H 'Origin: https://otro.example' http://127.0.0.1:8000/api/eventos) -join "`n"
Verif 'Origen permitido con cabecera' ($c1 -match '(?i)access-control-allow-origin: http://localhost:4200')
Verif 'Preflight con ngrok-skip-browser-warning' (($c2 -match '^HTTP/1.1 200') -and ($c2 -match '(?i)access-control-allow-headers:.*ngrok-skip-browser-warning'))
Verif 'Origen no autorizado sin cabecera de acceso' (-not ($c3 -match '(?i)access-control-allow-origin'))

# --- 6. SC-010: retencion de Kafka ----------------------------------------------------------
Log "`n## 6. Retencion de Kafka (SC-010)"
$ret = D exec -T kafka sh -c "/opt/kafka/bin/kafka-configs.sh --bootstrap-server localhost:9092 --describe --all --entity-type topics --entity-name $Topico" | Where-Object { $_ -match '^\s+(retention\.(ms|bytes)|segment\.ms)=' } | ForEach-Object { ($_ -split ' sensitive')[0].Trim() }
Log $ret
Verif 'Retencion 24 h / 100 MiB / segmento 6 h' (($ret -contains 'retention.ms=86400000') -and ($ret -contains 'retention.bytes=104857600') -and ($ret -contains 'segment.ms=21600000'))

# --- 7. T032 / T033: aislamiento y mensaje con mode distinto ----------------------------------
Log "`n## 7. Aislamiento y exposicion (T032)"
Log (D ps --format '{{.Service}} | puertos: {{.Ports}}')
$pub = D ps --format '{{.Service}} {{.Ports}}'
Verif 'Solo la API publica puerto en el host' ((@($pub | Where-Object { $_ -match '127\.0\.0\.1|0\.0\.0\.0' }).Count -eq 1) -and ($pub -match 'api .*127\.0\.0\.1:8000'))
$usgs = Get-ChildItem backend/src -Recurse -Filter *.py | Select-String -Pattern 'usgs\.gov|earthquake\.usgs'
Verif 'Sin URL ni consulta a USGS en backend/src' (@($usgs).Count -eq 0) ("coincidencias=" + @($usgs).Count)
Log (D exec -T postgres psql -U observatorio -d observatorio -c "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1,2")
Log "`n## 7a. Restricciones CHECK de la tabla (T032): inserciones invalidas deben rechazarse y no dejar filas"
$filasCheck = [int](Sql 'SELECT count(*) FROM sintetico.evento_actual')
$cols = "INSERT INTO sintetico.evento_actual(event_id,event_time,updated_at,longitude,latitude,source,mode,ingested_at,kafka_topic,kafka_partition,kafka_offset,raw)"
$casos = @(
  @('event_id sin prefijo synthetic-', "$cols VALUES ('us-prueba',now(),now(),0,0,'x','synthetic',now(),'t',0,0,'{}')"),
  @('latitud fuera de rango', "$cols VALUES ('synthetic-check-1',now(),now(),0,95,'x','synthetic',now(),'t',0,0,'{}')"),
  @('longitud fuera de rango', "$cols VALUES ('synthetic-check-2',now(),now(),200,0,'x','synthetic',now(),'t',0,0,'{}')"),
  @('mode distinto de synthetic', "$cols VALUES ('synthetic-check-3',now(),now(),0,0,'x','live',now(),'t',0,0,'{}')"))
foreach ($c in $casos) {
    $r = (D exec -T postgres psql -U observatorio -d observatorio -c $c[1]) -join ' '
    Verif ("CHECK rechaza: " + $c[0]) ($r -match 'violates check constraint')
}
Verif 'Las inserciones invalidas no dejaron filas' (([int](Sql 'SELECT count(*) FROM sintetico.evento_actual')) -eq $filasCheck)

Log "`n## 7b. Prueba negativa (T033): mensaje con mode=live publicado a mano en el topic"
$filasAntes = [int](Sql 'SELECT count(*) FROM sintetico.evento_actual')
$msg = 'synthetic-mvp-901#{"source":"prueba-manual","ingested_at":1793113140000,"mode":"live","event":{"type":"Feature","id":"synthetic-mvp-901","geometry":{"type":"Point","coordinates":[0,0,1]},"properties":{"time":1793113140000,"updated":1793113140000}}}'
$msg | & docker compose --env-file .env.example exec -T kafka sh -c "/opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic $Topico --property parse.key=true --property key.separator=#" 2>&1 | Out-Null
Start-Sleep -Seconds 5
$desc = (D logs consumer --no-log-prefix --since 60s) | Where-Object { $_ -match 'DESCARTADO' }
Log $desc
Verif 'Consumidor descarta con motivo (mode live)' (@($desc).Count -ge 1)
Verif 'No se inserta nada' (([int](Sql 'SELECT count(*) FROM sintetico.evento_actual')) -eq $filasAntes)
Verif 'El id del mensaje rechazado no esta en la tabla' ((Filas 'synthetic-mvp-901') -eq 0)
Verif 'Offset confirmado tras el descarte (lag 0)' ((Esperar { (Lag) -eq 0 } 20))

# --- 8. T036: reinicio ----------------------------------------------------------------------
Log "`n## 8. Reinicio de todos los servicios (T036, SC-005)"
$antesFilas = [int](Sql 'SELECT count(*) FROM sintetico.evento_actual')
D restart | Out-Null
D up -d --wait --wait-timeout 240 | Out-Null
$despFilas = [int](Sql 'SELECT count(*) FROM sintetico.evento_actual')
Verif 'Tras reiniciar: mismas filas, sin duplicados' (($antesFilas -eq $despFilas) -and ((Filas $id1) -eq 1)) ("antes=$antesFilas despues=$despFilas")
Verif 'Evento nuevo sigue en la API' (@((Api '/api/eventos').json.features | Where-Object { $_.id -eq $id1 }).Count -eq 1)

# --- 9. T037: base caida al consultar -------------------------------------------------------
Log "`n## 9. PostgreSQL detenido: la API debe dar 503, no una coleccion vacia (T037)"
D stop postgres | Out-Null
$e = Api '/api/eventos'; $s = Api '/api/salud'
Log ("/api/eventos -> HTTP {0} {1}" -f $e.codigo, $e.cuerpo)
Verif '503 explicito en /api/eventos (sin features)' (($e.codigo -eq 503) -and ($null -eq $e.json.features))
Verif '503 en /api/salud' ($s.codigo -eq 503)
D start postgres | Out-Null
Verif 'API se recupera sola' ((Esperar { (Api '/api/eventos').codigo -eq 200 } 90))

# --- 10. T038: Kafka caido al emitir --------------------------------------------------------
Log "`n## 10. Kafka detenido al emitir (T038)"
D stop kafka | Out-Null
$salida = & docker compose --env-file .env.example exec -T producer python -m observatorio.producer.emitir_sintetico --secuencia $n2 2>&1 | ForEach-Object { "$_" }
$codigo = $LASTEXITCODE
Log $salida
Verif 'Emision falla con error visible y codigo != 0' (($codigo -ne 0) -and ($salida -match 'ERROR') -and -not ($salida -match 'confirmado')) ("codigo de salida=$codigo")
Verif 'El evento nuevo no llega al almacen' ((Filas $id2) -eq 0)
D start kafka | Out-Null
D up -d --wait --wait-timeout 240 | Out-Null
Log (Emitir @('--secuencia', "$n2"))
Verif 'Tras recuperar Kafka, el evento llega al almacen' ((Esperar { (Filas $id2) -eq 1 } 90))

# --- 11. T039: offset confirmado solo tras guardar ---------------------------------------------
Log "`n## 11. PostgreSQL detenido al consumir: no se confirma el offset (T039)"
D stop postgres | Out-Null
Log (Emitir @('--secuencia', "$n3"))
Start-Sleep -Seconds 10
$lagCaido = Lag
$noConf = (D logs consumer --no-log-prefix --since 40s) | Where-Object { $_ -match 'NO se confirma' } | Select-Object -First 2
Log $noConf
Verif 'Con la base caida el lag > 0 y el consumidor no confirma' (($lagCaido -ge 1) -and (@($noConf).Count -ge 1)) ("lag=$lagCaido")
D start postgres | Out-Null
Verif 'Evento guardado una sola vez al recuperar la base' ((Esperar { try { (Filas $id3) -eq 1 } catch { $false } } 120)) ("filas=" + (Filas $id3))
Verif 'Lag vuelve a 0' ((Esperar { (Lag) -eq 0 } 60)) ("lag=" + (Lag))

# --- 12. T017: reintentos de los servicios Python ---------------------------------------------
Log "`n## 12. Reintentos (T017): Kafka y PostgreSQL parados, reinicio de los servicios Python"
D stop kafka postgres | Out-Null
D restart producer consumer api | Out-Null
Start-Sleep -Seconds 25
$vivos = D ps --format '{{.Service}} {{.State}}'
Log $vivos
Verif 'producer, consumer y api siguen en ejecucion sin infraestructura' ((@($vivos | Where-Object { $_ -match '^(producer|consumer|api) running' }).Count) -eq 3)
$reinicios = @('producer','consumer','api') | ForEach-Object { (docker inspect "observatorio-$_-1" --format '{{.RestartCount}}') }
Verif 'Sin bucles de reinicio automatico (RestartCount=0 en los tres servicios Python)' (@($reinicios | Where-Object { $_ -ne '0' }).Count -eq 0) ("RestartCount=" + ($reinicios -join ','))
D start kafka postgres | Out-Null
D up -d --wait --wait-timeout 240 | Out-Null
Verif 'Los cinco vuelven a healthy' ((@(D ps --format '{{.Service}} {{.Health}}' | Where-Object { $_ -match ' healthy$' }).Count) -eq 5)
Log (Emitir @('--secuencia', "$n4"))
Verif 'Recorrido completo tras recuperacion' ((Esperar { try { (Filas $id4) -eq 1 } catch { $false } } 90))
Verif 'Lag 0 al final' ((Esperar { (Lag) -eq 0 } 60))

Log "`n## Estado final"
Log (D ps --format '{{.Service}} {{.State}} {{.Health}}')
Log (D exec -T postgres psql -U observatorio -d observatorio -c "SELECT event_id, mode, kafka_offset FROM sintetico.evento_actual ORDER BY event_id")
Log ("`nRESULTADO: {0} comprobaciones fallidas" -f $script:fallos)
exit $script:fallos
