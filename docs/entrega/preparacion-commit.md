# Preparación del commit manual de F8 (T025)

**Estado**: **no se ha ejecutado ningún `git add`, `commit` ni `push`.** Este documento solo prepara la secuencia para que la persona estudiante la ejecute a mano (CLAUDE.md: commits y push solo con autorización expresa; mensajes en español; agrupados por fase o hito).

**Estado verificado el 2026-11-11 (noche)**: rama `main` = `origin/main` (último commit `4f5580e`); **todo lo de F8 está sin commitear**: 4 archivos modificados de la rama (`README.md`, `specs/007-…/{plan,spec,tasks}.md`) más `docs/HOJA-DE-RUTA.md` y `specs/INDICE.md`, y los archivos nuevos de `docs/entrega/`, `docs/evidencias/f8/`, `frontend/netlify/`, `frontend/tests/funcion-api.test.ts` y `scripts/f8/`. No hay archivos > 500 KB ni rastreados indebidos (`.env`, `node_modules`, `dist`, vídeos); `data/respaldo/` y `frontend/dist/` están ignorados. Los avisos «LF will be replaced by CRLF» son normales en Windows.

## 0. Antes de commitear
```bash
cd frontend && node --test tests/*.test.ts && cd ..       # 494 pruebas
bash scripts/f6/escaneo_secretos.sh 1000                  # sin secretos
git diff --check                                          # sin errores (ignora los avisos de CRLF)
git status --short                                        # revisa que solo está lo previsto
```

## 1. Cuatro commits propuestos (por hito de F8)
Los `git add` usan rutas explícitas para que cada archivo caiga en **un solo** commit. Si prefieres uno solo, usa el mensaje de la sección 2.

**Commit 1 · memoria, README y matriz (F8.1–F8.2)**
```bash
git add README.md docs/entrega/memoria.md docs/entrega/matriz-trazabilidad.md docs/entrega/requisitos-fuente.md
git commit -m "docs: [F8.2] memoria técnica, README definitivo y matriz de trazabilidad"
```

**Commit 2 · función de Netlify y sus pruebas (F8.3)**
```bash
git add frontend/netlify frontend/tests/funcion-api.test.ts scripts/f8/preparar-netlify-funcion.sh scripts/f8/probar_publico_local.mjs scripts/f8/mantenimiento
git commit -m "feat: [F8.3] función de Netlify de solo lectura para el acceso público sin clave"
```

**Commit 3 · evidencias de validación (F8.3 y F8.5)**
```bash
git add docs/evidencias/f8 ':!docs/evidencias/f8/auditoria-final.md' scripts/f8/sc010_f3.sql scripts/f8/calidad_live.sql
git commit -m "docs: [F8.3] evidencias de validación técnica, seguridad y publicación de F7"
```

**Commit 4 · vídeo, entrega y planificación (F8.4–F8.5)**
```bash
git add docs/entrega/guion-video.md docs/entrega/checklist-grabacion.md docs/entrega/capturas-y-evidencias.md docs/entrega/checklist-ventana-evaluacion.md docs/entrega/checklist-entrega-final.md docs/entrega/preparacion-commit.md docs/evidencias/f8/auditoria-final.md specs/007-documentacion-entrega-video docs/HOJA-DE-RUTA.md specs/INDICE.md
git commit -m "docs: [F8.5] guion del vídeo, checklists de entrega, auditoría y planificación"
```

Después de cada commit puedes comprobar `git show --stat HEAD`. Al final `git status` debe quedar **limpio** (salvo la carpeta ignorada `data/respaldo/` y `frontend/dist/`).

## 2. Alternativa: un único commit de F8
```bash
git add -A
git status --short      # revisa antes de confirmar
git commit -m "docs: [F8] memoria, README, función de Netlify, evidencias, guion y checklists de entrega"
```
(`git add -A` solo es seguro porque `.env`, `node_modules`, `dist` y `data/respaldo` están en `.gitignore`: comprueba el estado antes.)

## 3. Mensaje de commit final `[F8]` (T025)
Si prefieres un commit de cierre al entregar, usa un mensaje del estilo: «`docs: [F8] entrega final: vídeo, evidencias actualizadas y cierre dinámico`» (después de T040).

## 4. Nota sobre la autoría
Los commits los haces tú. Si quieres reflejar que el trabajo se hizo con asistencia de Claude, puedes añadir al final del mensaje la línea `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (opcional).

## 5. Push y comprobaciones posteriores (manuales)
```bash
git push origin main
```
Después: abrir el repositorio en GitHub, comprobar que el README **renderiza los diagramas Mermaid** y que los enlaces funcionan, y verificar que el **profesor tiene acceso de lectura** (CA-05). **No** subas el vídeo a Git.
