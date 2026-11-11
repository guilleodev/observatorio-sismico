#!/usr/bin/env bash
# Build público de F7 CON función de Netlify (F8 · T042). NO publica nada, NO abre ningún túnel y NO toca Docker: solo prepara una carpeta local lista para desplegar a mano.
# Diferencia con scripts/f6/preparar-netlify.sh (que se conserva para F6 y como plan B): el panel público llama a su PROPIO origen (/api/*) y una Netlify Function
# (frontend/netlify/functions/api.mjs) añade la clave en el servidor. Por eso el config.json público NO lleva la URL del túnel ni clave alguna.
# Uso:  bash scripts/f8/preparar-netlify-funcion.sh [https://observatorio-sismico.netlify.app] [--salida frontend/dist/<nombre>] [--restaurar-dist]
#   --salida <dir>    carpeta de salida bajo frontend/dist/ (por defecto frontend/dist/publico-netlify-f7-funcion); NO puede ser la copia de F6 ni la de F7 anterior.
#   --restaurar-dist  tras comprobar, recompila con el config.json del repositorio para no dejar en dist/ un build público.
# Requiere Node 22+ y las dependencias instaladas (npm ci) en frontend/.
set -uo pipefail
cd "$(dirname "$0")/../.."
SITIO="${1:-https://observatorio-sismico.netlify.app}"; [ $# -gt 0 ] && shift
REFRESH_MS=60000; SALIDA="frontend/dist/publico-netlify-f7-funcion"; RESTAURAR_DIST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --salida) SALIDA="${2:?falta el directorio}"; shift 2;;
    --restaurar-dist) RESTAURAR_DIST=1; shift;;
    *) echo "argumento desconocido: $1"; exit 2;;
  esac
done
CFG=frontend/public/config.json
DIST=frontend/dist/observatorio/browser
FUNC=frontend/netlify/functions
FALLOS=0
ok() { if [ "$1" = "$2" ]; then echo "  OK    $3"; else echo "  FALLA $3 (obtenido '$1', esperado '$2')"; FALLOS=$((FALLOS+1)); fi; }

[[ "$SITIO" =~ ^https://[A-Za-z0-9.-]+$ ]] || { echo "Uso: $0 https://<sitio>.netlify.app   (https, solo el origen: sin barra final ni ruta)"; exit 2; }
[[ "$SITIO" =~ (localhost|127\.|0\.0\.0\.0|\.local$) ]] && { echo "El origen público no puede ser local: $SITIO"; exit 2; }
[[ "$SALIDA" =~ ^frontend/dist/[A-Za-z0-9._-]+$ ]] || { echo "--salida debe ser frontend/dist/<nombre>"; exit 2; }
case "$SALIDA" in frontend/dist/observatorio|frontend/dist/publico-netlify|frontend/dist/publico-netlify-f7|frontend/dist/publico-netlify-f6*) echo "Esa carpeta es un respaldo o el build de F7 anterior: elige otro nombre"; exit 2;; esac
[ -f "$FUNC/api.mjs" ] || { echo "No existe $FUNC/api.mjs"; exit 2; }

echo "# F8 T042 - build público con función $(date -u +%FT%TZ)"
ORIGINAL="$(mktemp)"; cp "$CFG" "$ORIGINAL"
H0=$(sha256sum "$CFG" | cut -d' ' -f1)
echo "hash de $CFG antes: $H0"
restaurar() { cp "$ORIGINAL" "$CFG"; rm -f "$ORIGINAL"; }
trap restaurar EXIT   # pase lo que pase (error de compilación, Ctrl+C), el original vuelve

printf '{\n  "mode": "api",\n  "apiUrl": "%s",\n  "refreshMs": %s,\n  "skipNgrokWarning": false,\n  "pausarSiOculta": true\n}\n' "$SITIO" "$REFRESH_MS" > "$CFG"
echo "config.json escrito para el build (mismo origen $SITIO, refresco $REFRESH_MS ms, pausa con la pestaña oculta, sin URL de túnel ni clave)"
( cd frontend && npm run build 2>&1 | grep -E "complete|rror" )
BUILD_RC=${PIPESTATUS[0]}
[ -f "$DIST/config.json" ] || { echo "FALLA no existe $DIST/config.json"; FALLOS=$((FALLOS+1)); }

echo "## Comprobaciones del build público"
ok "$(grep -c "\"apiUrl\": \"$SITIO\"" "$DIST/config.json")" 1 "el build llama a su propio origen ($SITIO)"
ok "$(grep -c '"refreshMs": 60000' "$DIST/config.json")" 1 "refresco público de 60 s (ENUNCIADO §9)"
ok "$(grep -c '"pausarSiOculta": true' "$DIST/config.json")" 1 "suspensión con la pestaña oculta activada"
ok "$(grep -c '"skipNgrokWarning": false' "$DIST/config.json")" 1 "sin cabecera de ngrok (no hay llamadas cruzadas al túnel)"
ok "$(grep -cE '127\.0\.0\.1|localhost' "$DIST/config.json")" 0 "el config.json del build no menciona direcciones locales"
ok "$(grep -ciE 'token|secret|password|authorization|clave|key|ngrok-free|\.ngrok\.' "$DIST/config.json")" 0 "el config.json del build no contiene secretos, claves ni la URL del túnel"
ok "$(grep -rlE 'ngrok-free\.(dev|app)|[A-Za-z0-9-]+\.ngrok\.(io|app|dev)' "$DIST" | wc -l)" 0 "ningún archivo del build menciona un dominio de ngrok (el destino vive solo en la variable privada de Netlify)"
ok "$(grep -rlE 'localhost:4200' "$DIST" --include='*.js' --include='*.json' --include='*.html' | wc -l)" 0 "el build no cita el origen de desarrollo"
if [ -f .env ] && [ -n "$(grep -E '^API_CLAVE_ACCESO=' .env | cut -d= -f2- | tr -d '\r')" ]; then
  CLAVE_REAL="$(grep -E '^API_CLAVE_ACCESO=' .env | cut -d= -f2- | tr -d '\r')"
  ok "$(grep -rlF -- "$CLAVE_REAL" "$DIST" | wc -l)" 0 "la clave de acceso real NO está en ningún archivo del build"
  ok "$(grep -rlF -- "$CLAVE_REAL" "$FUNC" | wc -l)" 0 "la clave de acceso real NO está en el código de la función"
  unset CLAVE_REAL
else echo "  --    (no hay clave real en el .env: no se puede comprobar su ausencia)"; fi
ok "$(grep -c "X-Observatorio-Clave" "$FUNC/api.mjs")" "$(grep -c "X-Observatorio-Clave" "$FUNC/api.mjs")" "(informativo) la función añade la cabecera de la clave en el servidor"
ok "$(grep -cE "ngrok-free|netlify\.app|127\.0\.0\.1|localhost" <(sed 's#//.*$##' "$FUNC/api.mjs"))" 0 "el código de la función no fija dominios (el destino viene de API_UPSTREAM_URL)"
ok "$(ls "$FUNC" | wc -l)" 1 "una sola función en $FUNC (api.mjs)"

mkdir -p "$(dirname "$SALIDA")" && rm -rf "$SALIDA" && cp -r "$DIST"/. "$SALIDA"/ && echo "build público copiado a $SALIDA ($(find "$SALIDA" -type f | wc -l) archivos); NO publicado"
echo "## Restauración del original"
restaurar; trap - EXIT
H1=$(sha256sum "$CFG" | cut -d' ' -f1)
ok "$H1" "$H0" "hash de $CFG restaurado (idéntico al de antes)"
ok "$(git status --short -- "$CFG" | wc -l)" 0 "git no ve cambios en $CFG"
ok "$(grep -c '127.0.0.1:8000' "$CFG")" 1 "el repositorio conserva http://127.0.0.1:8000"
ok "$(grep -c '"refreshMs": 60000' "$CFG")" 1 "el repositorio conserva el refresco de 60 s"
echo "sha256 del config.json publicado: $(sha256sum "$SALIDA/config.json" | cut -d' ' -f1)"
echo "archivos del build: $(find "$SALIDA" -type f | wc -l), $(du -sk "$SALIDA" | cut -f1) KB; función: $FUNC/api.mjs ($(wc -c < "$FUNC/api.mjs") bytes)"

if [ "$RESTAURAR_DIST" = 1 ]; then
  ( cd frontend && npm run build 2>&1 | grep -E "complete|rror" )
  ok "$(grep -c '127.0.0.1:8000' "$DIST/config.json")" 1 "dist/ vuelve a compilarse con el config.json del repositorio"
fi
[ "$BUILD_RC" = 0 ] || { echo "FALLA la compilación terminó con código $BUILD_RC"; FALLOS=$((FALLOS+1)); }
echo
echo "Despliegue manual (NO ejecutado; requiere autorización y variables privadas ya configuradas en Netlify):"
echo "  netlify deploy --prod --no-build --dir $SALIDA --functions $FUNC --site <ID de observatorio-sismico> --message \"F7 con funcion\""
echo; if [ "$FALLOS" = 0 ]; then echo "RESULTADO: OK"; else echo "RESULTADO: $FALLOS FALLOS"; exit 1; fi
