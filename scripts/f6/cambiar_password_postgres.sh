#!/usr/bin/env bash
# Cambio de la contraseña de PostgreSQL SIN perder datos (F6, 6.7; hallazgo de 6.6: la contraseña real era el marcador de .env.example).
# POR DEFECTO ES UN SIMULACRO DE SOLO LECTURA: comprueba requisitos, imprime el plan y NO cambia nada. Con --ejecutar (y CONFIRMO_CAMBIO_PASSWORD=si) aplica el cambio.
# La contraseña nueva se genera aquí, NO se imprime, NO se escribe en ningún archivo versionado (solo en el .env local, que Git ignora) y viaja por stdin, nunca por argumentos.
# Procedimiento y razones: docs/evidencias/f6/procedimiento-cambio-password-postgres.md
# Uso:  bash scripts/f6/cambiar_password_postgres.sh                       (simulacro)
#       CONFIRMO_CAMBIO_PASSWORD=si bash scripts/f6/cambiar_password_postgres.sh --ejecutar     (requiere autorización expresa)
cd "$(dirname "$0")/../.."
export MSYS_NO_PATHCONV=1
EJECUTAR=0; RESPALDO=0; [ "${1:-}" = "--ejecutar" ] && EJECUTAR=1; [ "${1:-}" = "--respaldo" ] && RESPALDO=1
FALLOS=0
ok() { if [ "$1" = "$2" ]; then echo "  OK    $3"; else echo "  FALLA $3 (obtenido '$1', esperado '$2')"; FALLOS=$((FALLOS+1)); fi; }
cargar_env() { set -a; . ./.env; set +a; }
cargar_env
sql() { docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1" 2>/dev/null | tr -d '\r'; }
SERVICIOS=(api consumer producer)   # los que leen POSTGRES_PASSWORD; Kafka no usa credenciales
salud() { docker compose ps --format '{{.Service}}={{.Health}}' | sort | tr '\n' ' '; }
huella() { echo "historico=$(sql "select md5(string_agg(event_id||updated_at::text, '|' order by event_id)) from historico.evento") sintetico=$(sql "select md5(string_agg(t::text,'|' order by t::text)) from sintetico.evento_actual t") replay=$(sql "select md5(string_agg(t::text,'|' order by run_id, event_id)) from replay.evento_actual t") live_filas=$(sql "select count(*) from live.evento_version")"; }
espera_healthy() { for i in $(seq 1 40); do [ "$(docker compose ps --format '{{.Health}}' "$1" | tr -d '\r')" = "healthy" ] && return 0; sleep 2; done; return 1; }

if [ $RESPALDO = 1 ] || [ $EJECUTAR = 1 ]; then
  DIR="$HOME/.observatorio-backup"; mkdir -p "$DIR"; DUMP="$DIR/bd-$(date +%Y%m%d-%H%M%S).dump"
  docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$DUMP" 2>/dev/null; chmod 600 "$DUMP"
  echo "respaldo lógico (pg_dump -Fc) en $DUMP: $(wc -c < "$DUMP") bytes, sha256 $(sha256sum "$DUMP" | cut -c1-16)…"
  echo "contenido legible por pg_restore --list: $(docker compose exec -T postgres pg_restore --list < "$DUMP" 2>/dev/null | grep -c 'TABLE DATA') tablas con datos"
  [ $RESPALDO = 1 ] && { echo "(solo respaldo: no se cambia nada; el volcado no contiene la contraseña, solo hashes de rol si se pidiera --globals, que NO se usa)"; exit 0; }
fi
echo "# Cambio de contraseña de PostgreSQL · $([ $EJECUTAR = 1 ] && echo EJECUCIÓN || echo SIMULACRO de solo lectura) · $(date -u +%FT%TZ)"
echo "## Requisitos"
ok "$(git check-ignore -q .env && echo ignorado || echo NO-ignorado)" ignorado ".env ignorado por Git (la contraseña nueva solo vivirá ahí)"
ok "$(git ls-files | grep -cE '(^|/)\.env$')" 0 ".env no versionado"
ok "$(salud)" "api=healthy consumer=healthy kafka=healthy postgres=healthy producer=healthy " "los cinco servicios healthy antes de empezar"
ok "$(sql "show password_encryption")" scram-sha-256 "las contraseñas se guardan con SCRAM-SHA-256"
ok "$(sql "select count(*) from pg_hba_file_rules where auth_method = 'scram-sha-256' and type = 'host'")" "$(sql "select count(*) from pg_hba_file_rules where auth_method = 'scram-sha-256' and type = 'host'")" "(informativo) reglas host con SCRAM: $(sql "select count(*) from pg_hba_file_rules where auth_method = 'scram-sha-256' and type = 'host'")"
ok "$([ -n "${POSTGRES_PASSWORD:-}" ] && echo definida || echo vacía)" definida "POSTGRES_PASSWORD definida en el .env (valor NO mostrado)"
ok "$(grep -c '^POSTGRES_PASSWORD=' .env)" 1 "una sola línea POSTGRES_PASSWORD en el .env"
ok "$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select rolsuper from pg_roles where rolname = current_user" 2>/dev/null | tr -d '\r')" t "el usuario del proyecto puede cambiar su propia contraseña (superusuario de la imagen)"
ANTES="$(huella)"; echo "huellas de datos ANTES: $ANTES"

if [ $EJECUTAR = 0 ]; then
  cat <<'PLAN'

## Plan (no ejecutado)
 1. Copia del .env actual FUERA del repositorio (~/.observatorio-backup/env-<fecha>, permisos 600) para poder volver atrás.
 2. Genera 32 caracteres aleatorios alfanuméricos (sin comillas ni símbolos que rompan SQL o .env); no se imprimen.
 3. ALTER USER "<usuario>" PASSWORD '<nueva>'   ← por stdin, dentro del contenedor, por el socket local (de confianza); PostgreSQL NO se reinicia ni se recrea; los datos no se tocan.
 4. Sustituye la línea POSTGRES_PASSWORD del .env local (el .env no está versionado).
 5. Recrea de uno en uno, sin reconstruir imágenes: api, consumer, producer (`up -d --no-deps <servicio>`); cada uno vuelve a leer el .env. Interrupción: unos 5–15 s por servicio.
    Kafka y PostgreSQL no se recrean. El consumidor retoma desde su offset confirmado (sin pérdidas ni duplicados); el productor repite el ciclo siguiente (el feed de 24 h cubre el hueco).
 6. Verifica: cinco servicios healthy; la contraseña ANTIGUA es rechazada y la NUEVA aceptada por la red de Compose; huellas de datos idénticas; consumidor sin retraso.
 7. Si algo falla: vuelta atrás automática = ALTER USER con la contraseña antigua (desde la copia) + restaurar el .env + recrear los tres servicios.
 8. (Opcional, aparte, con otra autorización) recrear `postgres` para que su propio entorno coincida con el .env; no es necesario para que todo funcione.
PLAN
  echo; [ "$FALLOS" = 0 ] && echo "RESULTADO SIMULACRO: requisitos OK (nada cambiado)" || echo "RESULTADO SIMULACRO: $FALLOS requisito(s) sin cumplir"
  exit $FALLOS
fi

[ "${CONFIRMO_CAMBIO_PASSWORD:-}" = "si" ] || { echo "Falta CONFIRMO_CAMBIO_PASSWORD=si: no se cambia nada."; exit 2; }
[ "$FALLOS" = 0 ] || { echo "Requisitos sin cumplir: no se cambia nada."; exit 1; }

COPIA="$HOME/.observatorio-backup/env-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$(dirname "$COPIA")" && cp .env "$COPIA" && chmod 600 "$COPIA" && echo "copia del .env: $COPIA (fuera del repositorio)"
ANTIGUA="$POSTGRES_PASSWORD"; USUARIO="$POSTGRES_USER"
NUEVA="$(head -c 96 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)"
[ "${#NUEVA}" = 32 ] || { echo "no se pudo generar la contraseña"; exit 1; }

volver_atras() {
  echo "!! VUELTA ATRÁS"
  printf "ALTER USER \"%s\" PASSWORD '%s';\n" "$USUARIO" "$ANTIGUA" | docker compose exec -T postgres psql -U "$USUARIO" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 >/dev/null
  cp "$COPIA" .env; cargar_env
  for s in "${SERVICIOS[@]}"; do docker compose up -d --no-deps "$s" >/dev/null; espera_healthy "$s"; done
  echo "!! contraseña antigua restaurada, .env restaurado y servicios recreados: $(salud)"
}

echo "## 1. ALTER USER (por stdin, socket local)"
printf "ALTER USER \"%s\" PASSWORD '%s';\n" "$USUARIO" "$NUEVA" | docker compose exec -T postgres psql -U "$USUARIO" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 >/dev/null || { echo "FALLA el ALTER USER; no se ha cambiado nada"; exit 1; }
echo "## 2. .env local"
NUEVA="$NUEVA" awk 'BEGIN{FS=OFS="="} /^POSTGRES_PASSWORD=/{print "POSTGRES_PASSWORD", ENVIRON["NUEVA"]; next} {print}' .env > .env.nuevo && mv .env.nuevo .env   # por entorno, no por argumento (ps)
unset POSTGRES_PASSWORD; cargar_env
[ "$POSTGRES_PASSWORD" = "$NUEVA" ] || { echo "FALLA la escritura del .env"; volver_atras; exit 1; }
echo "## 3. Recreación de los servicios, de uno en uno"
for s in "${SERVICIOS[@]}"; do
  docker compose up -d --no-deps "$s" >/dev/null 2>&1
  if espera_healthy "$s"; then echo "  OK    $s healthy"; else echo "  FALLA $s no recupera healthy"; volver_atras; exit 1; fi
done
echo "## 4. Verificación"
ok "$(salud)" "api=healthy consumer=healthy kafka=healthy postgres=healthy producer=healthy " "cinco servicios healthy"
rechazo=$(PGPASSWORD="$ANTIGUA" docker run --rm --network observatorio_observatorio -e PGPASSWORD postgres:17.11 psql -h postgres -U "$USUARIO" -d "$POSTGRES_DB" -tAc "select 1" 2>&1 | grep -c "password authentication failed")
ok "$rechazo" 1 "la contraseña ANTIGUA es rechazada por la red de Compose"
acepta=$(PGPASSWORD="$NUEVA" docker run --rm --network observatorio_observatorio -e PGPASSWORD postgres:17.11 psql -h postgres -U "$USUARIO" -d "$POSTGRES_DB" -tAc "select 'ok'" 2>/dev/null | tr -d '\r')
ok "$acepta" ok "la contraseña NUEVA es aceptada por la red de Compose"
DESPUES="$(huella)"
ok "$(echo "$DESPUES" | sed 's/live_filas=[0-9]*//')" "$(echo "$ANTES" | sed 's/live_filas=[0-9]*//')" "huellas de historico, sintetico y replay idénticas"
ok "$([ "$(sql "select count(*) from live.evento_version")" -ge "$(echo "$ANTES" | sed 's/.*live_filas=//')" ] && echo si || echo no)" si "live no ha perdido versiones (solo puede crecer)"
echo "(la contraseña nueva está únicamente en el .env local y en la copia $COPIA; no se ha impreso)"
[ "$FALLOS" = 0 ] && echo "RESULTADO: OK" || { echo "RESULTADO: $FALLOS FALLOS"; volver_atras; exit 1; }
