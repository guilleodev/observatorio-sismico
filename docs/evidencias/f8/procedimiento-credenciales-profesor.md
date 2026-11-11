# T038 · Procedimiento de entrega privada de credenciales al profesor (F8.3)

**Estado**: procedimiento definido; **no se ha entregado ninguna credencial**. **Solo el procedimiento vive en el repositorio: la clave no aparece nunca en el repositorio, el README, la memoria, el vídeo, las capturas, los registros ni el chat.** El canal lo elige la persona estudiante (CA-02: aún no se sabe qué canal de entrega indica el profesor).

> **Actualización T042 (2026-11-11)**: con la **función de Netlify** (**publicada el 2026-11-11**, despliegue `6af4b81f…`) el profesor **no necesita ninguna clave**: abre la URL y usa la web. En ese caso solo queda el punto 1.1 (URL), el acceso al repositorio y la ventana de disponibilidad; la clave permanece únicamente en el `.env` local y en la variable privada de Netlify (`estrategia-publicacion-f7.md` §8 quater). Este procedimiento completo se aplica **mientras esté publicado el despliegue que pide clave** (`6af4a52d…`) o si se vuelve a él.

## 1. Qué recibe el profesor
1. **URL de la web**: `https://observatorio-sismico.netlify.app` (pública).
2. **Clave de acceso de la API** (`X-Observatorio-Clave`, 48 caracteres): al abrir la web aparece «Acceso restringido a la API» con un campo «Clave de acceso»; la escribe, pulsa «Acceder» y la web carga los datos. La clave se guarda solo en la memoria de la pestaña: **hay que escribirla de nuevo si se recarga la página**.
3. **Acceso al repositorio privado de GitHub** (CA-05): la persona estudiante añade al profesor como colaborador con lectura, **sin hacerlo público**; no se cambian permisos sin decisión expresa.
4. **Ventana de disponibilidad** y qué esperar si la web muestra «Sin conexión» (el equipo de la persona estudiante está apagado o el túnel cerrado): el enunciado §9 dice que se evalúa ese tratamiento del error, no la disponibilidad 24/7.

## 2. Canal (a elegir por la persona estudiante) `[ELEGIR]`
- Correo universitario, mensajería de la plataforma del máster u otro **canal privado y nominal** indicado por el profesor. Evitar canales públicos, repositorios, comentarios o formularios abiertos.
- **Dos mensajes separados** si es posible: uno con la URL y las instrucciones (sin clave) y otro con la clave, para que ninguno la lleve junto a la URL.
- El mensaje con la clave **no se reenvía ni se archiva** en carpetas compartidas.

## 3. Qué se documenta y qué nunca
| Se documenta (sí) | Nunca |
|---|---|
| Que la API exige una clave y cómo se introduce | El valor de la clave en cualquier archivo del repositorio, capturas, vídeo o chat |
| Que la clave se entrega por canal privado | El contenido de `.env`, el authtoken de ngrok o las sesiones de Netlify |
| Cómo rotarla y revocarla | La URL del inspector `127.0.0.1:4040` ni el túnel abierto en pantalla con cabeceras |
| La longitud mínima exigida (≥ 32 caracteres) | Capturas con el campo de clave visible o el gestor de contraseñas abierto |

## 4. Texto sugerido para el mensaje 1 (sin clave)
> Hola. La web del Observatorio Sísmico está en https://observatorio-sismico.netlify.app. Al abrirla pide una clave de acceso a la API, que le envío por separado. El sistema funciona mientras mi equipo, Docker y el túnel estén activos durante la revisión (fechas: [ACTUALIZAR EN CIERRE]); si no hay conexión, la web lo indica y conserva los últimos datos. El repositorio privado está en GitHub y le he dado acceso de lectura. Documentación: README y `docs/entrega/memoria.md`.

## 5. Rotación y revocación (decisión de la persona estudiante)
- **Antes de entregar**: comprobar que la clave actual funciona desde otro dispositivo (T036). No hace falta rotarla si no se ha filtrado: el escaneo de T031 encontró **0 coincidencias** en el repositorio, el historial y las evidencias.
- **Después de la evaluación** (recomendado): sustituir la clave. Se genera una nueva con `scripts/f6/preparar_api_publica.sh --aplicar`, que la escribe en el `.env` local y recrea **solo** la API. **Ejecutarlo exige autorización expresa** (cambia el `.env` y Docker) y deja invalidada la clave entregada.
- **Si se sospecha que se filtró**: rotar de inmediato y avisar al profesor por el canal privado.
- Cerrar ngrok y, si se desea, publicar de nuevo F6 o el modo mantenimiento (T041, opcional) para dejar la web sin acceso a datos.

## 6. Comprobaciones previas a la entrega (T040(b), T025)
- [ ] La clave entregada coincide con la del `.env` en uso (se prueba escribiéndola en la web desde otro dispositivo; Claude no la ve).
- [ ] El profesor aparece como colaborador del repositorio privado y puede leer.
- [ ] Ningún archivo, captura ni vídeo contiene la clave (repetir `escaneo_secretos.sh` y la comprobación del valor, `8.3-seguridad-secretos.md` §3).
- [ ] Constancia del envío (fecha, canal) anotada por la persona estudiante.
