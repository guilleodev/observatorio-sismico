#!/usr/bin/env bash
# Build público para Netlify (F6, 6.6, T043; FR-029). NO publica nada ni abre ningún túnel: solo prepara `frontend/dist/observatorio/browser`.
# Procedimiento (ENUNCIADO §9): guarda el hash de frontend/public/config.json, escribe la URL HTTPS de ngrok ANTES de compilar, compila y RESTAURA el original comprobando el hash,
# de modo que el repositorio conserva http://127.0.0.1:8000 y el refresco de desarrollo (60 s). El build público lleva refresco de 10 min, suspensión con la pestaña oculta y skipNgrokWarning.
# Uso:  bash scripts/f6/preparar-netlify.sh https://<dominio>.ngrok-free.app [--refresh-ms 600000] [--restaurar-dist]
#   --salida <dir>    copia el build público a <dir> (p. ej. frontend/dist/publico-netlify, ignorado por Git) para tenerlo listo sin dejarlo en dist/ ; NO publica nada.
#   --restaurar-dist  tras comprobar, vuelve a compilar con el config.json del repositorio para no dejar en dist/ un build con una URL de túnel (úsalo en simulacros).
# Requiere Node 22+ y las dependencias instaladas (npm ci) en frontend/.
set -uo pipefail
cd "$(dirname "$0")/../.."
URL="${1:-}"; shift || true
REFRESH_MS=600000; RESTAURAR_DIST=0; SALIDA=""
while [ $# -gt 0 ]; do
  case "$1" in
    --refresh-ms) REFRESH_MS="${2:?falta el valor}"; shift 2;;
    --salida) SALIDA="${2:?falta el directorio}"; shift 2;;
    --restaurar-dist) RESTAURAR_DIST=1; shift;;
    *) echo "argumento desconocido: $1"; exit 2;;
  esac
done
CFG=frontend/public/config.json
DIST=frontend/dist/observatorio/browser
FALLOS=0
ok() { if [ "$1" = "$2" ]; then echo "  OK    $3"; else echo "  FALLA $3 (obtenido '$1', esperado '$2')"; FALLOS=$((FALLOS+1)); fi; }

[[ "$URL" =~ ^https://[A-Za-z0-9.-]+$ ]] || { echo "Uso: $0 https://<dominio>.ngrok-free.app   (https, solo el dominio: sin barra final ni ruta)"; exit 2; }
[[ "$URL" =~ (localhost|127\.|0\.0\.0\.0|\.local$) ]] && { echo "La URL pública no puede ser local: $URL"; exit 2; }
[[ "$REFRESH_MS" =~ ^[0-9]+$ ]] && [ "$REFRESH_MS" -ge 30000 ] || { echo "--refresh-ms debe ser un entero >= 30000"; exit 2; }

echo "# 6.6 T043 - build público $(date -u +%FT%TZ)"
ORIGINAL="$(mktemp)"; cp "$CFG" "$ORIGINAL"
H0=$(sha256sum "$CFG" | cut -d' ' -f1)
echo "hash de $CFG antes: $H0"
restaurar() { cp "$ORIGINAL" "$CFG"; rm -f "$ORIGINAL"; }
trap restaurar EXIT   # pase lo que pase (error de compilación, Ctrl+C), el original vuelve

printf '{\n  "mode": "api",\n  "apiUrl": "%s",\n  "refreshMs": %s,\n  "skipNgrokWarning": true,\n  "pausarSiOculta": true\n}\n' "$URL" "$REFRESH_MS" > "$CFG"
echo "config.json escrito para el build (URL del túnel, refresco $REFRESH_MS ms, pausa con la pestaña oculta)"
( cd frontend && npm run build 2>&1 | grep -E "complete|rror" )
BUILD_RC=${PIPESTATUS[0]}
[ -f "$DIST/config.json" ] || { echo "FALLA no existe $DIST/config.json"; FALLOS=$((FALLOS+1)); }

echo "## Comprobaciones del build público"
ok "$(grep -c "\"apiUrl\": \"$URL\"" "$DIST/config.json")" 1 "el build lleva la URL del túnel ($URL)"
ok "$(grep -cE '127\.0\.0\.1|localhost' "$DIST/config.json")" 0 "el config.json del build no menciona direcciones locales"
ok "$(grep -c '"refreshMs": '"$REFRESH_MS" "$DIST/config.json")" 1 "refresco público de $REFRESH_MS ms"
ok "$(grep -c '"pausarSiOculta": true' "$DIST/config.json")" 1 "suspensión con la pestaña oculta activada"
ok "$(grep -c '"skipNgrokWarning": true' "$DIST/config.json")" 1 "skipNgrokWarning activado"
ok "$(grep -ciE 'token|secret|password|authorization|clave|key' "$DIST/config.json")" 0 "el config.json del build no contiene secretos ni claves"
ok "$(grep -rlE 'X-Observatorio-Clave' "$DIST" --include='*.js' | wc -l)" 1 "el nombre de la cabecera está en el código (solo el nombre; ninguna clave)"
if [ -f .env ] && [ -n "$(grep -E '^API_CLAVE_ACCESO=' .env | cut -d= -f2- | tr -d '\r')" ]; then ok "$(grep -rlF -- "$(grep -E '^API_CLAVE_ACCESO=' .env | cut -d= -f2- | tr -d '\r')" "$DIST" | wc -l)" 0 "la clave de acceso real NO está en ningún archivo del build"; else echo "  --    (aún no hay clave real en el .env: se comprobará cuando exista)"; fi
ok "$(grep -rlE 'localhost:4200' "$DIST" --include='*.js' --include='*.json' --include='*.html' | wc -l)" 0 "el build no cita el origen de desarrollo"

if [ -n "$SALIDA" ]; then rm -rf "$SALIDA" && mkdir -p "$SALIDA" && cp -r "$DIST"/. "$SALIDA"/ && echo "build público copiado a $SALIDA ($(find "$SALIDA" -type f | wc -l) archivos); NO publicado"; fi
echo "## Restauración del original"
restaurar; trap - EXIT
H1=$(sha256sum "$CFG" | cut -d' ' -f1)
ok "$H1" "$H0" "hash de $CFG restaurado (idéntico al de antes)"
ok "$(git status --short -- "$CFG" | wc -l)" 0 "git no ve cambios en $CFG"
ok "$(grep -c '127.0.0.1:8000' "$CFG")" 1 "el repositorio conserva http://127.0.0.1:8000"
ok "$(grep -c '"refreshMs": 60000' "$CFG")" 1 "el repositorio conserva el refresco de desarrollo (60 s)"
echo "sha256 del config.json publicado: $(sha256sum "$DIST/config.json" | cut -d' ' -f1)"
echo "archivos del build: $(find "$DIST" -type f | wc -l), $(du -sk "$DIST" | cut -f1) KB"

if [ "$RESTAURAR_DIST" = 1 ]; then
  ( cd frontend && npm run build 2>&1 | grep -E "complete|rror" )
  ok "$(grep -c '127.0.0.1:8000' "$DIST/config.json")" 1 "dist/ vuelve a compilarse con el config.json del repositorio (no queda un build con la URL del túnel)"
fi
[ "$BUILD_RC" = 0 ] || { echo "FALLA la compilación terminó con código $BUILD_RC"; FALLOS=$((FALLOS+1)); }
echo; if [ "$FALLOS" = 0 ]; then echo "RESULTADO: OK"; else echo "RESULTADO: $FALLOS FALLOS"; exit 1; fi
