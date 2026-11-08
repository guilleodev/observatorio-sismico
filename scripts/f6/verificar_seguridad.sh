#!/usr/bin/env bash
# Verificación estática de seguridad de los scripts de F6 (T001). SOLO LECTURA: no ejecuta ninguno de los scripts que revisa.
# Falla si encuentra, en scripts/f6/*, una orden destructiva o que pare/recree servicios sin que esté en la lista de excepciones aprobadas (scripts/f6/excepciones_seguridad.txt,
# una línea por excepción: «archivo:fragmento», que debe corresponder a una autorización expresa de la persona estudiante).
# Uso: bash scripts/f6/verificar_seguridad.sh
cd "$(dirname "$0")/../.."
PATRONES='docker compose (down|rm|stop|kill|restart|up)|docker (rm|rmi|kill|stop|restart|system prune|volume rm|volume prune|network rm|container prune|image prune)|down -v|--volumes|docker-compose|rm -rf|rm -r |truncate|drop (table|schema|database)|delete from|alter table|create database|git (commit|push|reset|checkout|clean|stash)|--delete|ngrok (authtoken|config)|authtoken'
FALLOS=0
# Una excepción es «archivo:fragmento»: se aprueba la línea de ese archivo que contiene el fragmento (recursos temporales de pruebas, nunca datos reales).
excepcion_aprobada() {
  [ -f scripts/f6/excepciones_seguridad.txt ] || return 1
  while IFS= read -r exc; do
    case "$exc" in ""|"#"*) continue ;; esac
    [ "${exc%%:*}" = "$1" ] && [[ "$2" == *"${exc#*:}"* ]] && return 0
  done < scripts/f6/excepciones_seguridad.txt
  return 1
}
echo "# verificación estática de scripts/f6 $(date -u +%FT%TZ)"
for f in scripts/f6/*.sh scripts/f6/*.py scripts/f6/*.sql scripts/f6/*.js; do
  [ -f "$f" ] || continue
  [ "$f" = "scripts/f6/verificar_seguridad.sh" ] && continue
  while IFS= read -r linea; do
    n="${linea%%:*}"; texto="${linea#*:}"
    # las líneas de comentario no se ejecutan
    case "$(echo "$texto" | sed 's/^[[:space:]]*//')" in "#"*|"--"*|"//"*) continue ;; esac
    if excepcion_aprobada "$f" "$texto"; then
      echo "  EXCEPCIÓN APROBADA  $f:$n"; continue
    fi
    echo "  PELIGRO  $f:$n: $(echo "$texto" | cut -c1-140)"; FALLOS=$((FALLOS+1))
  done < <(grep -n -i -E "$PATRONES" "$f")
  echo "  revisado $f"
done
if [ "$FALLOS" = 0 ]; then echo "RESULTADO: OK - ningún script de scripts/f6 contiene órdenes destructivas ni que paren o recreen servicios"; else echo "RESULTADO: $FALLOS FALLOS"; exit 1; fi
