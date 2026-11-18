# Acceso del profesor a la web y al repositorio (F8)

**Estado (2026-11-17)**: con la **función de Netlify** (publicada el 2026-11-11; despliegue vigente `6afb5599…`) el profesor **no necesita ninguna clave**: abre la URL y usa la web. La clave de la API existe solo en el `.env` local y en una variable privada de Netlify (`estrategia-publicacion-f7.md` §8 quater). **Solo el procedimiento vive en el repositorio: la clave no aparece nunca en el repositorio, el README, la memoria, el vídeo, las capturas ni los registros.**

## 1. Qué recibe el profesor
1. **URL de la web**: `https://observatorio-sismico.netlify.app` (pública; sin formulario de clave).
2. **Enlace del repositorio privado de GitHub** (acceso de lectura, sin hacerlo público).
3. **Ventana de disponibilidad** y qué esperar si la web muestra «Sin conexión» (equipo apagado o túnel cerrado): el enunciado §9 dice que se evalúa ese tratamiento del error, no la disponibilidad 24/7.

## 2. Qué se documenta y qué nunca
| Se documenta (sí) | Nunca |
|---|---|
| Que la API exige una clave y que la función de Netlify la añade en el servidor | El valor de la clave en cualquier archivo del repositorio, capturas, vídeo o chat |
| Cómo rotarla y revocarla | El contenido de `.env`, el authtoken de ngrok o las sesiones de Netlify |
| La longitud mínima exigida (≥ 32 caracteres) | La URL del inspector `127.0.0.1:4040` ni el túnel abierto en pantalla con cabeceras |

## 3. Mensaje de entrega (sin clave)
> Hola. La web del Observatorio Sísmico está en https://observatorio-sismico.netlify.app y no necesita clave. El sistema funciona mientras mi equipo, Docker y el túnel estén activos durante la revisión (fin de semana del 21–22 de noviembre de 2026); si no hay conexión, la web lo indica y conserva los últimos datos. El repositorio privado está en GitHub. Documentación: README y `docs/entrega/memoria.md`.

## 4. Rotación y revocación de la clave
- No hace falta rotarla si no se ha filtrado: el escaneo de secretos encontró **0 coincidencias** en el repositorio, el historial y las evidencias.
- **Después de la evaluación** (recomendado): se genera una clave nueva con `scripts/f6/preparar_api_publica.sh --aplicar`, que la escribe en el `.env` local y recrea **solo** la API; hay que actualizar también la variable `API_CLAVE_ACCESO` de Netlify y volver a desplegar. Cambia el `.env` y Docker y deja invalidada la clave anterior.
- **Si se sospecha que se filtró**: rotar de inmediato.
- Cerrar ngrok al terminar y, si se desea, publicar de nuevo F6 o el modo mantenimiento para dejar la web sin acceso a datos.
