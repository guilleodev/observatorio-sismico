#!/usr/bin/env bash
# Comprueba (SOLO LECTURA) que el código Python que lleva una imagen es idéntico al de un commit de Git (por defecto HEAD), archivo a archivo, comparando sha256.
# Lanza un contenedor efímero (--rm) de esa imagen solo para listar y resumir sus archivos; no toca ningún servicio ni volumen.
# Uso: bash scripts/f6/verificar_imagen_equivalente.sh <imagen> [commit]
cd "$(dirname "$0")/../.."
export MSYS_NO_PATHCONV=1
img="${1:?indica la imagen}"; commit="${2:-HEAD}"
tmp=$(mktemp -d)
docker run --rm --entrypoint sh "$img" -c 'cd /app/src && find observatorio -name "*.py" | sort | while read f; do printf "%s  %s\n" "$(tr -d "\r" < "$f" | sha256sum | cut -d" " -f1)" "$f"; done' > "$tmp/imagen.txt"
git ls-tree -r --name-only "$commit" backend/src/observatorio | grep '\.py$' | sed 's#^backend/src/##' | sort | while read f; do
  printf '%s  %s\n' "$(git show "$commit:backend/src/$f" | tr -d '\r' | sha256sum | cut -d' ' -f1)" "$f"
done > "$tmp/git.txt"
echo "# imagen $img frente a $commit ($(wc -l < "$tmp/imagen.txt") archivos en la imagen, $(wc -l < "$tmp/git.txt") en Git; se ignoran los saltos de línea CRLF)"
if diff "$tmp/imagen.txt" "$tmp/git.txt" > "$tmp/diff.txt"; then echo "RESULTADO: IDÉNTICOS - la imagen lleva exactamente el código de $commit"; rc=0; else echo "RESULTADO: DIFIEREN"; cat "$tmp/diff.txt"; rc=1; fi
rm -f "$tmp"/imagen.txt "$tmp"/git.txt "$tmp"/diff.txt; rmdir "$tmp"
exit $rc
