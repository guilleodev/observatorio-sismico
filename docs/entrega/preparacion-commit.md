# Preparación del commit manual (F8 · 8.6 y cierre documental)

**Estado**: **no se ha ejecutado ningún `git add`, `commit` ni `push` en esta tanda.** Este documento solo prepara la secuencia para que la persona estudiante la ejecute a mano (CLAUDE.md: commits y push solo con autorización expresa; mensajes en español; agrupados por fase o hito).

**Punto de partida (2026-11-15)**: el último commit es `304fec2` (`[F8-WIP]`: publicación de F7 y preparación de entrega). Todo lo siguiente está **sin commitear**:
- **Frontend**: mejoras de interfaz de `docs/evidencias/f8/8.6-mejoras-interfaz.md` (paleta grafito, cabecera, pie con la firma de la autora, mejoras del globo, escala de tamaños, transición entre vistas…): archivos modificados en `frontend/src/` y `frontend/tests/`, y **nuevos**: `frontend/public/img/` (2 logos), `frontend/src/app/cifra-animada*.ts`, `frontend/src/app/globo/{vida,etiquetas}.ts`, `frontend/tests/{fase1,vida}.test.ts`.
- **Documentación**: `README.md`, `docs/entrega/*` (memoria, matriz, requisitos, checklists…), `docs/evidencias/f8/{8.6-mejoras-interfaz,auditoria-final,estrategia-publicacion-f7}.md`, `docs/HOJA-DE-RUTA.md`.
- **Guiones del vídeo**: son **material personal**. Viven en `docs/privado/` (ignorada por `.gitignore`; solo se versiona `docs/privado/LEEME.md`) y `docs/entrega/guion-video.md` aparece como **borrado** (`D`): el commit registra que ya no está en la versión actual. *El guion largo sigue en el historial (commit `304fec2`); es una decisión ya aceptada.*

## 0. Antes de commitear
```bash
cd frontend && node --test tests/*.test.ts && cd ..       # 521 pruebas
cd frontend && npm run build && cd ..                     # compila
bash scripts/f6/escaneo_secretos.sh 1000                  # sin secretos
git diff --check                                          # sin errores (ignora los avisos de CRLF)
git status --short                                        # solo lo previsto (arriba)
git ls-files docs/privado                                 # debe salir SOLO docs/privado/LEEME.md
```
Si `git status` muestra `docs/privado/guion-video-5min.md` o `docs/privado/guion-video.md` **como nuevos o preparados**, **no los añadas** (`git add -f` los subiría; no lo uses sobre esa carpeta).

## 1. Dos commits propuestos
**Commit 1 · interfaz (F8.6)**
```bash
git add frontend/src frontend/tests frontend/public/img
git commit -m "feat: [F8.6] mejoras de interfaz: paleta grafito, cabecera, pie, globo y transiciones"
```

**Commit 2 · documentación (F8.6)**
```bash
git add -A docs/entrega docs/evidencias/f8 docs/HOJA-DE-RUTA.md README.md .gitignore docs/privado/LEEME.md
git commit -m "docs: [F8.6] evidencias y documentación tras las mejoras de interfaz; guiones del vídeo fuera del repositorio"
```
`git add -A docs/entrega` también registra el borrado de `docs/entrega/guion-video.md`. Después de cada commit puedes revisar `git show --stat HEAD`.

Al final `git status` debe quedar **limpio** (salvo las carpetas ignoradas `data/respaldo/`, `frontend/dist/` y los guiones de `docs/privado/`).

## 2. Alternativa: un único commit
```bash
git add frontend/src frontend/tests frontend/public/img
git add -A docs/entrega docs/evidencias/f8 docs/HOJA-DE-RUTA.md README.md .gitignore docs/privado/LEEME.md
git status --short      # revisa antes de confirmar
git commit -m "feat: [F8.6] mejoras de interfaz y documentación asociada; guiones del vídeo fuera del repositorio"
```

## 3. Nota sobre la autoría
Los commits los haces tú. Si quieres reflejar que el trabajo se hizo con asistencia de Claude, puedes añadir al final del mensaje la línea `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (opcional).

## 4. Push y comprobaciones posteriores (manuales)
```bash
git push origin main
```
Después: abrir el repositorio en GitHub, comprobar que el README **renderiza los diagramas Mermaid** y que los enlaces funcionan, y verificar que el **profesor tiene acceso de lectura** (CA-05). **No** subas el vídeo a Git.

## 5. Mensaje final `[F8]` (T025)
Al entregar, si prefieres un commit de cierre: «`docs: [F8] entrega final: vídeo, evidencias actualizadas y cierre dinámico`» (después de T040 y de publicar las mejoras en Netlify).
