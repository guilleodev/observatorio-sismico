#!/usr/bin/env bash
# Vuelta atrás de PA-3 (F6, T001): ETIQUETA —no borra, no recrea, no para nada— la imagen que usa cada contenedor real, para poder volver a ella si una
# recreación posterior con la imagen nueva no queda `healthy`. `docker tag` solo añade un nombre a una imagen que ya existe.
# Si la imagen de un contenedor YA NO EXISTE en el almacén de Docker (p. ej. porque su etiqueta se movió al reconstruir la de otro servicio), no se inventa nada:
# se informa «NO DISPONIBLE». La alternativa (etiquetar `observatorio-backend:latest` si su código es equivalente) es un paso aparte y verificado:
#   bash scripts/f6/verificar_imagen_equivalente.sh <imagen>   y después   bash scripts/f6/etiquetar_imagenes.sh --equivalente <imagen>
# Uso: bash scripts/f6/etiquetar_imagenes.sh [--equivalente <imagen-verificada>]   (idempotente)
cd "$(dirname "$0")/../.."
export MSYS_NO_PATHCONV=1
equivalente=""
if [ "${1:-}" = "--equivalente" ]; then equivalente="${2:?indica la imagen verificada}"; fi
echo "# etiquetado de las imágenes en uso $(date -u +%FT%TZ)"
for servicio in api consumer producer; do
  id=$(docker compose ps -q "$servicio")
  img=$(docker inspect -f '{{.Image}}' "$id")
  etiqueta="observatorio-backend:previo-f6-$servicio"
  if docker image inspect "$img" >/dev/null 2>&1; then
    docker tag "$img" "$etiqueta"
    echo "$servicio: contenedor=$(echo "$id" | cut -c1-12) imagen=$img -> $etiqueta (OK)"
  elif [ -n "$equivalente" ] && docker image inspect "$equivalente" >/dev/null 2>&1; then
    docker tag "$equivalente" "$etiqueta"
    echo "$servicio: contenedor=$(echo "$id" | cut -c1-12) imagen en uso=$img NO DISPONIBLE -> $etiqueta = imagen equivalente verificada $(docker image inspect -f '{{.Id}}' "$equivalente")"
  else
    echo "$servicio: contenedor=$(echo "$id" | cut -c1-12) imagen en uso=$img NO DISPONIBLE en el almacén de Docker; no se etiqueta nada"
  fi
done
echo "volver atrás: solo con autorización expresa y siguiendo specs/005-replay-despliegue-final/research.md (R-017)"
