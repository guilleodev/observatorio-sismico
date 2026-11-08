#!/usr/bin/env bash
# Configuración de la API para el túnel (F6, 6.6, T047, PA-3): CORS definitivo, API_DOCS=false, gzip (ya en el código) y CLAVE DE ACCESO obligatoria (FR-041).
# POR DEFECTO ES UN SIMULACRO DE SOLO LECTURA: comprueba requisitos y muestra el plan. Con --aplicar (y CONFIRMO_PUBLICAR_API=si) edita SOLO el .env local, reconstruye y recrea ÚNICAMENTE `api`.
# No abre ningún túnel, no publica nada, no toca Kafka, PostgreSQL, consumer ni producer. La clave se genera aquí, NO se imprime, va al .env local (ignorado por Git) y al portapapeles.
# Uso:  bash scripts/f6/preparar_api_publica.sh                                         (simulacro)
#       CONFIRMO_PUBLICAR_API=si bash scripts/f6/preparar_api_publica.sh --aplicar       (requiere autorización expresa)
#       bash scripts/f6/preparar_api_publica.sh --deshacer                                (vuelta atrás: restaura el .env anterior y la imagen anterior de api)
cd "$(dirname "$0")/../.."
export MSYS_NO_PATHCONV=1
NETLIFY="https://observatorio-sismico.netlify.app"
ORIGENES="$NETLIFY,http://localhost:4200"
DIR="$HOME/.observatorio-backup"
MODO=simulacro; [ "${1:-}" = "--aplicar" ] && MODO=aplicar; [ "${1:-}" = "--deshacer" ] && MODO=deshacer
FALLOS=0
ok() { if [ "$1" = "$2" ]; then echo "  OK    $3"; else echo "  FALLA $3 (obtenido '$1', esperado '$2')"; FALLOS=$((FALLOS+1)); fi; }
valor() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '\r'; }
poner() { # poner NOMBRE VALOR → reemplaza o añade la línea en el .env local; el valor viaja por el entorno, no por argumentos
  local tmp; tmp="$(mktemp)"; V="$2" N="$1" awk 'BEGIN{FS=OFS="="; hecho=0} $1==ENVIRON["N"]{print ENVIRON["N"], ENVIRON["V"]; hecho=1; next} {print} END{if(!hecho) print ENVIRON["N"], ENVIRON["V"]}' .env > "$tmp" && cp "$tmp" .env && rm -f "$tmp"; }
salud() { docker compose ps --format '{{.Service}}={{.Health}}' | sort | tr '\n' ' '; }
espera_api() { for i in $(seq 1 40); do [ "$(docker compose ps --format '{{.Health}}' api | tr -d '\r')" = "healthy" ] && return 0; sleep 2; done; return 1; }

if [ $MODO = deshacer ]; then
  ULTIMA="$(ls -t "$DIR"/env-api-* 2>/dev/null | head -1)"; [ -n "$ULTIMA" ] || { echo "no hay copia previa del .env (env-api-*)"; exit 1; }
  cp "$ULTIMA" .env && docker tag observatorio-backend:previo-f6-api observatorio-backend:latest && docker compose up -d --no-deps --no-build api >/dev/null 2>&1
  espera_api && echo "vuelta atrás hecha: .env restaurado desde $ULTIMA, imagen anterior de api restaurada. Estado: $(salud)" || echo "api no recupera healthy tras la vuelta atrás: revisar a mano"
  exit 0
fi

echo "# API pública (PA-3) · $([ $MODO = aplicar ] && echo APLICAR || echo SIMULACRO de solo lectura) · $(date -u +%FT%TZ)"
echo "## Requisitos"
ok "$(git check-ignore -q .env && echo ignorado || echo NO-ignorado)" ignorado ".env ignorado por Git"
ok "$(salud)" "api=healthy consumer=healthy kafka=healthy postgres=healthy producer=healthy " "los cinco servicios healthy"
ok "$(docker image inspect -f '{{.Id}}' observatorio-backend:latest >/dev/null 2>&1 && echo si || echo no)" si "existe la imagen actual (observatorio-backend:latest) para etiquetarla como vuelta atrás"
ok "$(grep -c "API_CLAVE_ACCESO" compose.yaml)" 2 "compose.yaml pasa API_CLAVE_ACCESO a la API y su healthcheck usa la clave (con la clave activa /api/salud da 401 sin ella)"
ok "$(docker compose config -q 2>&1 | wc -l)" 0 "compose.yaml válido"
echo "  --    CORS actual: $(valor API_CORS_ORIGINS) | API_DOCS actual: $(valor API_DOCS | grep . || echo '(sin definir: true)') | clave de acceso: $([ -n "$(valor API_CLAVE_ACCESO)" ] && echo 'ya definida (valor NO mostrado)' || echo 'sin definir')"

if [ $MODO = simulacro ]; then
  cat <<PLAN

## Plan (no ejecutado)
 1. Copia del .env fuera del repositorio ($DIR/env-api-<fecha>) y etiqueta de vuelta atrás: la imagen actual de api pasa a observatorio-backend:previo-f6-api.
 2. .env local: API_CORS_ORIGINS=$ORIGENES ; API_DOCS=false ; API_CLAVE_ACCESO=<48 caracteres aleatorios> (si no existía; no se imprime; se copia al portapapeles para que la pegues en el panel).
 3. docker compose up -d --build --no-deps api  (solo api; consumer, producer, Kafka y PostgreSQL no se tocan; sin tráfico de datos nuevo: la API es de solo lectura). Interrupción de la API: ≈ 10–30 s.
 4. Verifica contra la API recreada: sin clave 401; clave incorrecta 401; clave correcta 200; mode=replay igual; preflight de Netlify 200 y de otro origen 400; /docs, /redoc y /openapi.json 404; gzip.
 5. Vuelta atrás automática si algo falla (y manual: bash scripts/f6/preparar_api_publica.sh --deshacer): restaura el .env y la imagen anterior y recrea api.
Efecto colateral que debes conocer: con la clave activa, el panel LOCAL (localhost:4200) también la pedirá (se escribe en la pestaña y se pierde al recargar) y los scripts que consultan la API sin clave (matrices de F5, aislamiento_final.sh de F5) darán 401.
Para volver a la API sin protección: quitar la línea API_CLAVE_ACCESO del .env y recrear api.
PLAN
  echo; [ "$FALLOS" = 0 ] && echo "RESULTADO SIMULACRO: requisitos OK (nada cambiado)" || echo "RESULTADO SIMULACRO: $FALLOS requisito(s) sin cumplir"
  exit $FALLOS
fi

[ "${CONFIRMO_PUBLICAR_API:-}" = "si" ] || { echo "Falta CONFIRMO_PUBLICAR_API=si: no se cambia nada."; exit 2; }
[ "$FALLOS" = 0 ] || { echo "Requisitos sin cumplir: no se cambia nada."; exit 1; }

mkdir -p "$DIR"; COPIA="$DIR/env-api-$(date +%Y%m%d-%H%M%S)"; cp .env "$COPIA" && chmod 600 "$COPIA"
docker tag observatorio-backend:latest observatorio-backend:previo-f6-api
echo "copia del .env: $COPIA · imagen anterior etiquetada: observatorio-backend:previo-f6-api"
poner API_CORS_ORIGINS "$ORIGENES"; poner API_DOCS false
if [ -z "$(valor API_CLAVE_ACCESO)" ]; then
  CLAVE="$(head -c 128 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)"; [ "${#CLAVE}" = 48 ] || { echo "no se pudo generar la clave"; cp "$COPIA" .env; exit 1; }
  poner API_CLAVE_ACCESO "$CLAVE"
  printf '%s' "$CLAVE" | powershell -NoProfile -Command '[Console]::In.ReadToEnd() | Set-Clipboard' && echo "clave nueva generada (no se muestra): está en el .env local y COPIADA AL PORTAPAPELES"
  unset CLAVE
fi
echo "## Recreación de api (solo api)"
if ! { docker compose up -d --build --no-deps api >/dev/null 2>&1 && espera_api; }; then echo "FALLA: api no recupera healthy"; cp "$COPIA" .env; docker tag observatorio-backend:previo-f6-api observatorio-backend:latest; docker compose up -d --no-deps --no-build api >/dev/null 2>&1; espera_api; echo "vuelta atrás aplicada"; exit 1; fi
echo "  OK    api healthy · $(salud)"

echo "## Verificación contra la API recreada (la clave se lee del .env y viaja desde un archivo temporal, no por argumentos)"
CAB="$(cygpath -m "$(mktemp)")"; chmod 600 "$CAB"; printf 'X-Observatorio-Clave: %s\n' "$(valor API_CLAVE_ACCESO)" > "$CAB"; MAL="$(cygpath -m "$(mktemp)")"; printf 'X-Observatorio-Clave: incorrecta\n' > "$MAL"
trap 'rm -f "$CAB" "$MAL"' EXIT
U=http://127.0.0.1:8000
codigo() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
ok "$(codigo $U/api/salud)" 401 "sin clave: /api/salud -> 401"
ok "$(codigo $U/api/eventos)" 401 "sin clave: /api/eventos -> 401"
ok "$(codigo $U/api/estadisticas)" 401 "sin clave: /api/estadisticas -> 401"
ok "$(codigo "$U/api/eventos?mode=replay")" 401 "sin clave: mode=replay -> 401"
ok "$(codigo "$U/api/eventos?mode=otro")" 401 "sin clave: parámetro inválido -> 401 (no 422)"
ok "$(codigo -H @"$MAL" $U/api/salud)" 401 "clave incorrecta -> 401"
ok "$(codigo "$U/api/salud?clave=x&key=x")" 401 "clave por la URL no vale -> 401"
ok "$(codigo -H @"$CAB" $U/api/salud)" 200 "clave correcta: /api/salud -> 200"
ok "$(codigo -H @"$CAB" "$U/api/eventos?limit=1")" 200 "clave correcta: /api/eventos (live) -> 200"
ok "$(codigo -H @"$CAB" "$U/api/eventos?mode=replay&limit=1")" 200 "clave correcta: mode=replay -> 200"
ok "$(codigo -H @"$CAB" $U/api/estadisticas)" 200 "clave correcta: /api/estadisticas -> 200"
ok "$(codigo -H @"$CAB" "$U/api/eventos?mode=otro")" 422 "clave correcta + parámetro inválido -> 422"
ok "$(codigo -X OPTIONS -H "Origin: $NETLIFY" -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: x-observatorio-clave,ngrok-skip-browser-warning' $U/api/eventos)" 200 "preflight de Netlify sin clave -> 200"
ok "$(codigo -X OPTIONS -H 'Origin: https://otro.netlify.app' -H 'Access-Control-Request-Method: GET' $U/api/eventos)" 400 "preflight de otro origen -> 400"
ok "$(curl -s -D - -o /dev/null -H "Origin: $NETLIFY" $U/api/salud | tr -d '\r' | grep -ci '^access-control-allow-origin: https://observatorio-sismico.netlify.app$')" 1 "el 401 lleva el origen CORS exacto de Netlify"
for r in /docs /redoc /openapi.json; do ok "$(codigo $U$r)" 404 "$r oculta -> 404"; done
ok "$(curl -s -D - -o /dev/null -H @"$CAB" -H 'Accept-Encoding: gzip' "$U/api/eventos" | tr -d '\r' | grep -ci '^content-encoding: gzip')" 1 "gzip activo en /api/eventos"
ok "$(docker compose logs --since 3m api 2>&1 | grep -cF "$(valor API_CLAVE_ACCESO)")" 0 "la clave no aparece en los registros de la API"
ok "$(salud)" "api=healthy consumer=healthy kafka=healthy postgres=healthy producer=healthy " "los cinco servicios healthy"
[ "$FALLOS" = 0 ] && echo "RESULTADO: OK" || { echo "RESULTADO: $FALLOS FALLOS → vuelta atrás"; cp "$COPIA" .env; docker tag observatorio-backend:previo-f6-api observatorio-backend:latest; docker compose up -d --no-deps --no-build api >/dev/null 2>&1; espera_api; exit 1; }
