#!/usr/bin/env bash
# Escaneo de secretos (F6, 6.6, T045; FR-027, SC-014). SOLO LECTURA. NUNCA imprime valores: solo nombres de variable, rutas y recuentos.
# Busca: (1) el .env real versionado o pendiente de versionar; (2) formato de authtoken de ngrok y claves privadas; (3) los VALORES de las variables sensibles del .env real
# (contraseñas, tokens, claves) en el repositorio, en dist/, en las evidencias y en el historial reciente de Git; (4) claves tipo `authtoken: <valor>` en cualquier archivo.
# Uso: bash scripts/f6/escaneo_secretos.sh [commits_de_historial=300]
cd "$(dirname "$0")/../.."
N="${1:-300}"
FALLOS=0; AVISOS=0
ok() { if [ "$1" = "$2" ]; then echo "  OK    $3 ($1)"; else echo "  FALLA $3: obtenido '$1', esperado '$2'"; FALLOS=$((FALLOS+1)); fi; }
# archivos candidatos: versionados + nuevos no ignorados + dist/ (el build que se publicaría) + evidencias; el .env real queda fuera de la búsqueda (es donde viven los valores)
LISTA="$(mktemp)"; trap 'rm -f "$LISTA"' EXIT
{ git ls-files -co --exclude-standard; find frontend/dist -type f 2>/dev/null; } | grep -v -E '(^|/)\.env$|^frontend/node_modules/|\.(png|jpg|ico|gz|woff2?|zip)$|(^|/)data/' | sort -u > "$LISTA"
echo "# 6.6 T045 - escaneo de secretos $(date -u +%FT%TZ)"
echo "archivos analizados: $(wc -l < "$LISTA") (versionados, nuevos no ignorados y dist/); commits de historial: $(git rev-list --count HEAD | awk -v n="$N" '{print ($1<n)?$1:n}')"

echo "## .env real"
ok "$(git ls-files | grep -cE '(^|/)\.env$')" 0 ".env real versionado"
ok "$(git status --short | awk '{print $2}' | grep -cE '(^|/)\.env$')" 0 ".env real entre los cambios pendientes"
ok "$(git check-ignore -q .env && echo ignorado || echo NO-ignorado)" ignorado ".env ignorado por Git"
ok "$(git log --all --diff-filter=A --name-only --format= -n "$N" | grep -cE '(^|/)\.env$')" 0 ".env añadido alguna vez al historial reciente"

echo "## Formatos conocidos (sin imprimir valores)"
ok "$(xargs -a "$LISTA" -d '\n' grep -lE '(^|[^A-Za-z0-9])[0-9][A-Za-z0-9]{20,}_[A-Za-z0-9]{20,}([^A-Za-z0-9]|$)' 2>/dev/null | wc -l)" 0 "archivos con un patrón de authtoken de ngrok (id_secreto)"
ok "$(xargs -a "$LISTA" -d '\n' grep -lE 'BEGIN [A-Z ]*PRIVATE KEY' 2>/dev/null | wc -l)" 0 "archivos con claves privadas"
ok "$(xargs -a "$LISTA" -d '\n' grep -liE '(authtoken|auth_token|api[_-]?key|secret)[" ]*[:=][" ]*[A-Za-z0-9_\-]{16,}' 2>/dev/null | wc -l)" 0 "archivos con «authtoken/secret/api_key» seguido de un valor"
ok "$(xargs -a "$LISTA" -d '\n' grep -liE 'NGROK_AUTHTOKEN[ ]*=[ ]*[^ #]' 2>/dev/null | wc -l)" 0 "archivos que asignan NGROK_AUTHTOKEN"
ok "$(xargs -a "$LISTA" -d '\n' grep -lE 'AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}' 2>/dev/null | wc -l)" 0 "archivos con claves de nube, GitHub o Slack"

echo "## Valores de las variables sensibles del .env real (solo nombres y recuentos)"
if [ -f .env ]; then
  while IFS='=' read -r nombre valor; do
    valor="${valor%\"}"; valor="${valor#\"}"; valor="${valor%\'}"; valor="${valor#\'}"; valor="${valor%$'\r'}"
    [[ "$nombre" =~ (PASSWORD|PASSWD|SECRET|TOKEN|KEY)$ ]] || continue
    [ "${#valor}" -ge 6 ] || { echo "  --    $nombre: valor vacío o demasiado corto para buscarlo con fiabilidad (${#valor} caracteres): no analizado"; continue; }
    ejemplo=$(grep -E "^$nombre=" .env.example 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r"'"'")
    if [ -n "$ejemplo" ] && [ "$valor" = "$ejemplo" ]; then
      echo "  AVISO $nombre: el valor del .env real ES el marcador de .env.example (no se busca como secreto; es público y predecible). Recomendación: sustituirlo por uno propio (cambiarlo exige ALTER USER y recrear servicios: requiere autorización)."
      AVISOS=$((AVISOS+1)); continue
    fi
    en_archivos=$(xargs -a "$LISTA" -d '\n' grep -lF -- "$valor" 2>/dev/null | wc -l)
    en_historial=$(git log -n "$N" --all -p -S"$valor" --format=%h 2>/dev/null | grep -c .)
    ok "$en_archivos/$en_historial" "0/0" "$nombre: archivos/líneas de historial que contienen su valor"
  done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env)
else
  echo "  --    no hay .env: no se pueden buscar sus valores"
fi

echo "## ngrok y Netlify"
ok "$(ls ngrok.yml .ngrok2 2>/dev/null | wc -l)" 0 "configuración local de ngrok dentro del repositorio"
ok "$(grep -c 'ngrok' .gitignore)" "$(grep -c 'ngrok' .gitignore)" "(informativo) entradas de ngrok en .gitignore"
ok "$(grep -E 'ngrok-free|ngrok\.app|ngrok\.io' frontend/public/config.json .env.example 2>/dev/null | wc -l)" 0 "URL de un túnel en config.json o .env.example del repositorio"
ok "$(grep -rIhoE 'https?://[A-Za-z0-9-]+\.netlify\.app' frontend/public .env.example backend/src 2>/dev/null | grep -vi 'sitio' | wc -l)" 0 "dominio de Netlify fijado en el código (solo debe vivir en el .env local)"

echo; if [ "$FALLOS" = 0 ]; then echo "RESULTADO: OK - sin secretos detectados ($AVISOS aviso(s))"; else echo "RESULTADO: $FALLOS FALLOS"; exit 1; fi
