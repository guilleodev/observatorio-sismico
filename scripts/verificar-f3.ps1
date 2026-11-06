# verificar-f3.ps1 - Pruebas de fallos y recuperacion de la fase F3 (tareas T037 a T040 + invariante).
# Solo ASCII. Repetible. NO borra datos: usa kill/stop/start/restart, nunca "down", "rm" ni "-v".
# Requiere los 5 servicios en marcha y ejecucion real de la ingesta (INGESTA_PUBLICAR=true en el .env local).
# Las pruebas esperan eventos NUEVOS reales de USGS (no se insertan datos de prueba); el limite de espera es -EsperaMaxMin.
# Uso (desde la raiz del repositorio):  powershell -ExecutionPolicy Bypass -File scripts/verificar-f3.ps1
param([int]$EsperaMaxMin = 20)

$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
$envf = '.env.example'
if (Test-Path '.env') { $envf = '.env' }
$salida = 'docs/evidencias/f3/verificacion-f3.txt'
Set-Content -Path $salida -Value '' -Encoding ASCII
$resultados = @()

function Log($t) { Write-Host $t; Add-Content -Path $salida -Value $t -Encoding ASCII }
function DC { & docker compose --env-file $envf @args }
function Ahora { (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }
function Q($sql) { (DC exec -T postgres psql -U observatorio -d observatorio -tAc $sql | Out-String).Trim() }

function Lag {
    $o = DC exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group consumidor-live | Out-String
    foreach ($l in ($o -split "`n")) {
        if ($l -match 'terremotos\.live\s+0\s+(\d+)\s+(\d+)\s+(\d+)') {
            return [pscustomobject]@{ Actual = [int64]$Matches[1]; Fin = [int64]$Matches[2]; Lag = [int64]$Matches[3] }
        }
    }
    return $null
}

function Publicadas { [int64](Q 'SELECT count(*) FROM live.version_publicada') }

function EsperarHasta([scriptblock]$cond, [int]$segundos, [int]$pasoMs = 3000) {
    $fin = (Get-Date).AddSeconds($segundos)
    while ((Get-Date) -lt $fin) {
        if (& $cond) { return $true }
        Start-Sleep -Milliseconds $pasoMs
    }
    return $false
}

function TodosSanos {
    $o = (DC ps --format '{{.Service}}:{{.Health}}' | Out-String)
    foreach ($s in 'api', 'consumer', 'kafka', 'postgres', 'producer') {
        if ($o -notmatch ($s + ':healthy')) { return $false }
    }
    return $true
}

function Lag0 { $l = Lag; return ($null -ne $l -and $l.Lag -eq 0) }

function Invariante($etiqueta) {
    $rec = Q "SELECT count(*) FROM live.version_publicada p WHERE NOT EXISTS (SELECT 1 FROM live.evento_version v WHERE v.event_id = p.event_id AND v.updated_at = to_timestamp(p.updated_ms / 1000.0)) AND NOT EXISTS (SELECT 1 FROM live.cuarentena c WHERE c.event_id = p.event_id AND c.updated_ms = p.updated_ms)"
    $dup = Q 'SELECT count(*) FROM (SELECT kafka_offset FROM live.evento_version GROUP BY kafka_offset HAVING count(*) > 1) s'
    $des = Q 'SELECT count(*) FROM live.evento_actual a WHERE NOT a.retirado AND a.updated_at <> (SELECT max(v.updated_at) FROM live.evento_version v WHERE v.event_id = a.event_id)'
    $pub = Q 'SELECT count(*) FROM live.version_publicada'
    $ver = Q 'SELECT count(*) FROM live.evento_version'
    $cua = Q 'SELECT count(*) FROM live.cuarentena'
    $act = Q 'SELECT count(*) FROM live.evento_actual'
    $l = Lag
    $lagTxt = 'n/d'
    if ($null -ne $l) { $lagTxt = [string]$l.Lag }
    $ok = ($rec -eq '0') -and ($dup -eq '0') -and ($des -eq '0') -and ($lagTxt -eq '0') -and ([int64]$pub -eq ([int64]$ver + [int64]$cua))
    Log ("  INVARIANTE [{0}]: publicadas={1} versiones={2} cuarentena={3} (publicadas = versiones + cuarentena: {4}) | reconciliacion={5} | offsets duplicados={6} | actual desfasado={7} | evento_actual={8} | lag={9}" -f $etiqueta, $pub, $ver, $cua, ([int64]$pub -eq ([int64]$ver + [int64]$cua)), $rec, $dup, $des, $act, $lagTxt)
    Log ("  INVARIANTE [{0}] -> {1}" -f $etiqueta, $(if ($ok) { 'CUMPLIDO' } else { 'NO CUMPLIDO' }))
    return $ok
}

function Servicios { (DC ps -a --format '{{.Service}}={{.State}}/{{.Health}}' | Out-String).Trim() -replace "\s+", ' ' }
function Cuenta($servicio, $desde, $patron) { @(DC logs --since $desde $servicio | Select-String -Pattern $patron).Count }
function Resultado($nombre, $ok, $nota) {
    $txt = 'NO CUMPLIDO'
    if ($ok) { $txt = 'CUMPLIDO' }
    if ($null -eq $ok) { $txt = 'NO CONCLUYENTE' }
    $script:resultados += ('{0}: {1} - {2}' -f $nombre, $txt, $nota)
    Log ('  RESULTADO {0}: {1} - {2}' -f $nombre, $txt, $nota)
}

try {
    Log ('# Verificacion de fallos y recuperacion F3 (T037-T040) - inicio ' + (Ahora))
    Log ('Entorno: ' + $envf + ' | espera maxima por evento nuevo: ' + $EsperaMaxMin + ' min | sin down, rm ni -v')
    Log ('Servicios: ' + (Servicios))
    $l = Lag
    Log ('Estado inicial: offset del grupo=' + $l.Actual + ' final del topic=' + $l.Fin + ' lag=' + $l.Lag)
    $base = Invariante 'inicial'
    if (-not $base) { Log 'ABORTA: el invariante inicial no se cumple; no se provoca ningun fallo.'; return }

    # ---------------------------------------------------------------- T037
    Log ''
    Log '## T037 - Reinicio del consumidor a mitad de procesamiento (kill)'
    $t = Ahora
    $p0 = Publicadas
    Log ('Se espera a que el productor publique una version nueva y se mata el consumidor justo al detectarla (publicadas antes: ' + $p0 + ')')
    $hubo = EsperarHasta { (Publicadas) -gt $p0 } ($EsperaMaxMin * 60) 500
    if ($hubo) {
        DC kill consumer | Out-Null
        Log ('consumer matado (SIGKILL) a las ' + (Ahora) + '; publicadas ahora=' + (Publicadas))
        $l = Lag
        Log ('  lag justo tras matar: ' + $l.Lag + ' (si es 0, el consumidor alcanzo a terminar antes del kill)')
        $conLag = EsperarHasta { $x = Lag; $null -ne $x -and $x.Lag -gt 0 } ($EsperaMaxMin * 60) 5000
        $l = Lag
        Log ('  con el consumidor caido: lag=' + $l.Lag + ' (offset del grupo=' + $l.Actual + ', final=' + $l.Fin + ')')
        DC start consumer | Out-Null
        Log ('consumer iniciado a las ' + (Ahora))
        $rec = EsperarHasta { Lag0 } 180 3000
        $l = Lag
        Log ('  tras reiniciar: lag=' + $l.Lag + ' (offset del grupo=' + $l.Actual + ')')
        Log ('  lineas del consumidor tras el reinicio: GUARDADA=' + (Cuenta consumer $t 'GUARDADA') + ' DUPLICADA=' + (Cuenta consumer $t 'DUPLICADA') + ' EXCLUIDA=' + (Cuenta consumer $t 'EXCLUIDA'))
        $inv = Invariante 'T037'
        $ok = $rec -and $inv
        $nota = 'lag con el consumidor caido > 0: ' + $conLag + '; lag final 0: ' + $rec
        if (-not $conLag) { $ok = $null; $nota = 'no hubo versiones nuevas con el consumidor caido, no se demostro el desfase' }
        Resultado 'T037' $ok $nota
    } else {
        Resultado 'T037' $null 'no se publico ninguna version nueva en el tiempo de espera'
    }

    # ---------------------------------------------------------------- T038
    Log ''
    Log '## T038 - Reinicio del productor (restart)'
    EsperarHasta { TodosSanos } 120 3000 | Out-Null
    $t = Ahora
    $p0 = Publicadas
    $l = Lag
    $fin0 = $l.Fin
    $ok0 = [int64](Q 'SELECT count(*) FROM live.consulta_extraccion')
    DC restart producer | Out-Null
    Log ('producer reiniciado a las ' + (Ahora) + '; publicadas antes=' + $p0 + ' final del topic antes=' + $fin0)
    $ciclos = EsperarHasta { [int64](Q ("SELECT count(*) FROM live.consulta_extraccion WHERE iniciada_at > '" + $t + "' AND resultado = 'ok'")) -ge 3 } 300 5000
    EsperarHasta { Lag0 } 120 3000 | Out-Null
    $p1 = Publicadas
    $l = Lag
    $dPub = $p1 - $p0
    $dFin = $l.Fin - $fin0
    Log ('  consultas correctas tras el reinicio: ' + (Q ("SELECT count(*) FROM live.consulta_extraccion WHERE iniciada_at > '" + $t + "' AND resultado = 'ok'")) + ' (ciclos reanudados: ' + $ciclos + ')')
    Log ('  versiones marcadas publicadas durante la prueba=' + $dPub + ' | mensajes nuevos en el topic=' + $dFin + ' (deben coincidir: nada republicado)')
    $inv = Invariante 'T038'
    Resultado 'T038' ($ciclos -and ($dPub -eq $dFin) -and $inv) ('ciclos reanudados: ' + $ciclos + '; publicadas nuevas=' + $dPub + ' = mensajes nuevos=' + $dFin)

    # ---------------------------------------------------------------- T039
    Log ''
    Log '## T039 - PostgreSQL parado (stop/start)'
    DC stop consumer | Out-Null
    $p0 = Publicadas
    Log ('consumer parado para acumular versiones nuevas en el topic (publicadas antes=' + $p0 + ')')
    $conLag = EsperarHasta { $x = Lag; $null -ne $x -and $x.Lag -gt 0 } ($EsperaMaxMin * 60) 5000
    $l = Lag
    $act0 = $l.Actual
    $fin0 = $l.Fin
    Log ('  antes de parar PostgreSQL: offset del grupo=' + $act0 + ' final=' + $fin0 + ' lag=' + $l.Lag)
    $t = Ahora
    DC stop postgres | Out-Null
    Log ('postgres parado a las ' + (Ahora))
    # docker start (no compose start): compose start arranca tambien las dependencias y reiniciaria PostgreSQL
    $cid = (DC ps -a -q consumer | Out-String).Trim()
    docker start $cid | Out-Null
    Log ('consumer iniciado con PostgreSQL parado (hay ' + $l.Lag + ' mensaje(s) pendiente(s))')
    Start-Sleep -Seconds 170
    $l = Lag
    Log ('  con PostgreSQL parado (170 s): offset del grupo=' + $l.Actual + ' (antes ' + $act0 + ') final=' + $l.Fin + ' (antes ' + $fin0 + ') lag=' + $l.Lag)
    Log ('  consumidor: reintentos sin saltar el registro=' + (Cuenta consumer $t 'NO se salta') + ' | base no disponible=' + (Cuenta consumer $t 'no disponible') + ' | GUARDADA=' + (Cuenta consumer $t 'GUARDADA'))
    Log ('  productor: errores de PostgreSQL=' + (Cuenta producer $t 'PostgreSQL fall') + ' | Fallo al publicar=' + (Cuenta producer $t 'Fallo al publicar') + ' | consultas ok registradas en el log=' + (Cuenta producer $t 'Consulta ok'))
    Log ('  contenedores con PostgreSQL parado: ' + (Servicios))
    $sinConfirmar = ($l.Actual -eq $act0) -and ($l.Lag -gt 0)
    $sinPublicar = ($l.Fin -eq $fin0)
    DC start postgres | Out-Null
    Log ('postgres iniciado a las ' + (Ahora))
    $sanos = EsperarHasta { TodosSanos } 240 3000
    $t2 = Ahora
    $rec = EsperarHasta { Lag0 } 240 3000
    $ciclos = EsperarHasta { [int64](Q ("SELECT count(*) FROM live.consulta_extraccion WHERE iniciada_at > '" + $t2 + "' AND resultado = 'ok'")) -ge 2 } 300 5000
    Log ('  tras recuperar: servicios sanos=' + $sanos + ' | lag 0=' + $rec + ' | productor con consultas correctas tras volver=' + $ciclos)
    Log ('  contenedores: ' + (Servicios))
    $inv = Invariante 'T039'
    $ok = $sinConfirmar -and $sinPublicar -and $rec -and $ciclos -and $inv
    if (-not $conLag) { $ok = $null }
    Resultado 'T039' $ok ('offset sin confirmar con la base parada: ' + $sinConfirmar + '; productor sin publicar: ' + $sinPublicar + '; recuperacion: lag 0=' + $rec + ', ciclos=' + $ciclos + '; hubo mensajes pendientes: ' + $conLag)

    # ---------------------------------------------------------------- T040
    Log ''
    Log '## T040 - Kafka parado (stop/start)'
    EsperarHasta { TodosSanos } 120 3000 | Out-Null
    $l = Lag
    $act0 = $l.Actual
    $fin0 = $l.Fin
    $p0 = Publicadas
    Log ('  antes: offset del grupo=' + $act0 + ' final del topic=' + $fin0 + ' publicadas=' + $p0)
    $t = Ahora
    DC stop kafka | Out-Null
    Log ('kafka parado a las ' + (Ahora) + ' (se espera un evento nuevo real que el productor no pueda publicar)')
    $fallo = EsperarHasta { (Cuenta producer $t 'Fallo al publicar') -ge 1 } ($EsperaMaxMin * 60) 10000
    Start-Sleep -Seconds 20
    $p1 = Publicadas
    Log ('  con Kafka parado: Fallo al publicar=' + (Cuenta producer $t 'Fallo al publicar') + ' | consultas ok=' + (Cuenta producer $t 'Consulta ok') + ' | publicadas=' + $p1 + ' (antes ' + $p0 + ')')
    Log ('  contenedores con Kafka parado: ' + (Servicios))
    DC start kafka | Out-Null
    Log ('kafka iniciado a las ' + (Ahora))
    $sanos = EsperarHasta { TodosSanos } 300 3000
    $l = Lag
    if ($null -ne $l) {
        Log ('  tras volver Kafka: offset del grupo=' + $l.Actual + ' (antes ' + $act0 + ') final=' + $l.Fin + ' (antes ' + $fin0 + ') lag=' + $l.Lag)
    }
    $t2 = Ahora
    $ciclos = EsperarHasta { [int64](Q ("SELECT count(*) FROM live.consulta_extraccion WHERE iniciada_at > '" + $t + "' AND resultado = 'ok'")) -ge 3 } 300 5000
    $rec = EsperarHasta { Lag0 } 300 3000
    $l = Lag
    $p2 = Publicadas
    Log ('  tras recuperar: servicios sanos=' + $sanos + ' | lag 0=' + $rec + ' | publicadas=' + $p2 + ' (reenviadas tras volver: ' + ($p2 - $p1) + ') | final del topic=' + $l.Fin + ' (mensajes nuevos desde la parada: ' + ($l.Fin - $fin0) + ')')
    Log ('  contenedores: ' + (Servicios))
    $inv = Invariante 'T040'
    $conservado = ($null -ne $l) -and ($l.Actual -ge $act0) -and ($l.Fin -ge $fin0)
    $ok = $sanos -and $rec -and $inv -and $conservado -and ($p1 -eq $p0)
    if (-not $fallo) { $ok = $null }
    Resultado 'T040' $ok ('hubo fallo de publicacion real: ' + $fallo + '; sin marcar publicadas con Kafka parado: ' + ($p1 -eq $p0) + '; offsets y mensajes conservados: ' + $conservado + '; lag 0: ' + $rec)
}
finally {
    Log ''
    Log '## Estado final'
    DC start | Out-Null
    EsperarHasta { TodosSanos } 240 3000 | Out-Null
    Log ('Servicios: ' + (Servicios))
    Log ('Ingesta real activa: INGESTA_PUBLICAR=' + ((DC exec -T producer printenv INGESTA_PUBLICAR | Out-String).Trim()))
    Log '## Resumen'
    foreach ($r in $resultados) { Log $r }
    Log ('Fin ' + (Ahora))
}
