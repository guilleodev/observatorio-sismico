# Auditoría final (F8.5 · T024) — primera pasada, parte estable [E]

**Fecha**: 2026-11-11 (noche). **Alcance**: comprobaciones de solo lectura y correcciones documentales. **No se ha publicado nada, no se ha abierto ngrok, no se ha tocado Angular, FastAPI, SQL de producción, Docker ni volúmenes, no se han ejecutado SC-010 ni el entorno limpio y no hay commit.** La parte dinámica [D] (capturas EN VIVO y sistema real) se completó el 2026-11-17 (ver la nota siguiente).

> **Nota del 2026-11-17**: SC-010 se observó (`f3/sc-010-observacion-24h.txt`), las pruebas se repitieron (backend 1 046, frontend 528), el contador de ngrok se leyó (5,18 MB de 1 GB) y el escaneo de secretos se repitió. Lo que sigue es el estado del 2026-11-11.

Etiquetas: **[MEDIDO]** comprobado ahora; **[ESTIMADO]**; **[NO COMPROBADO]**.

## 1. Resultado resumido
> **Nota (2026-11-15)**: esta auditoría describe el estado del 2026-11-11. Desde entonces se aplicaron mejoras de interfaz (`8.6-mejoras-interfaz.md`): el frontend **ya no es idéntico a `9008772`** y las pruebas pasan de 494 a **521**. Las comprobaciones de seguridad y de enlaces deben **repetirse** antes de entregar.

**El repositorio está preparado para el commit manual y no hay secretos.** La aplicación Angular es idéntica a la congelada (`9008772`). Quedan **reservas conocidas y documentadas**, ninguna oculta; las que impiden cerrar del todo son del vídeo, de los contadores y del servicio durante la ventana (secciones 6 y 7).

## 2. Comprobaciones técnicas
| Comprobación | Resultado |
|---|---|
| Pruebas del frontend (`node --test tests/*.test.ts`) | **494 pasan, 0 fallan** [MEDIDO] (18 de la función de Netlify) |
| Compilación (`npm run build`) | **OK** [MEDIDO] |
| Aplicación Angular frente a `9008772` (`src`, `public`, `angular.json`, `package*.json`, proxy, `config-local`) | **Idéntica** (`git diff 9008772` vacío) [MEDIDO] |
| Backend, SQL, Compose y scripts de F6 | Sin cambios desde la regresión de F6 (T033); las 964 pruebas **no se repiten** (evidencia de 2026-11-09) |
| Servicios | Cinco `healthy` (≈ 26 h); API publicada solo en `127.0.0.1:8000`; sin ngrok abierto |
| Escaneo de secretos (`escaneo_secretos.sh`, 17 commits) | **OK, 0 avisos** [MEDIDO] |
| Valor de `API_CLAVE_ACCESO` en árbol, historial, salidas de la sesión y transcripciones | **0 coincidencias** [MEDIDO] |
| Rastreados indebidos (`.env`, `node_modules`, `dist`, vídeos, zips) / archivos nuevos > 500 KB | **Ninguno** [MEDIDO] |
| `git diff --check` | Sin errores (solo avisos de fin de línea CRLF de Windows) |
| Estado de Git | `main` = `origin/main` (`4f5580e`); el trabajo de F8 estaba entonces sin commitear (los commits posteriores constan en el historial de Git) |

## 3. Documentación
| Comprobación | Resultado |
|---|---|
| Enlaces relativos de los documentos de entrega (README, memoria, matriz, requisitos, guion, checklists, evidencias de F8 y specs de F8) | **162 comprobados, 0 rotos; 0 anclas rotas** [MEDIDO] |
| Rutas entre comillas | Solo faltan las de **evidencias futuras** (`auditoria-final.md` se crea ahora, `sc-010-observacion-24h.txt`, capturas) y el fragmento `sql/001`–`004` |
| Frases obsoletas | **Corregidas**: «F7 no publicada»/«versión F6» en matriz (LF-12, D2, WEB-01, resumen G) y requisitos; «6 peticiones por ciclo» (ahora **3 con la función** y 6 con la llamada directa); estado del README |
| Afirmaciones frente a evidencias archivadas | **24 contrastadas** (18 302 eventos y 12 tramos; 964 pruebas; conclusiones 17 de 22, 7 079, 23,45, 53,2 %, 29,0 %; 30/30 consultas; exactitud 40/40; replay 39/37/35; hueco #475; mediciones; cuota de ngrok; aislamiento; entorno limpio de F6; ráfaga 63/37; 0 coincidencias de la clave): **todas respaldadas** (2 requirieron lectura manual por el texto exacto) |
| Marcas `[ACTUALIZAR EN CIERRE]` | Resueltas el 2026-11-17 |
| Lectura «como profesor» | El README se entiende de arriba abajo (estado, cómo revisar, arquitectura, instalación, modos EN VIVO/REPRODUCCIÓN, pruebas, rúbrica, limitaciones); la memoria sigue la Guía 2.1–2.9. Observaciones **no bloqueantes**: ambos son largos (la tabla de rúbrica y la sección 14 son lo esencial); varias evidencias son de fases anteriores y llevan su fecha |

## 4. Reservas (estado tras F8.5)
| Reserva | Estado | Cómo se resolvió o por qué no |
|---|---|---|
| R1 ACE-08 | **Abierta** | No se mata el consumidor en directo; evidencia: lag 0 → 7 → 0 y atomicidad |
| R2 ACE-09/10 y publicación | **Parcial** | Verificado con F7 en navegador del equipo; Pixel confirmado **sin evidencia archivada** |
| R3 SC-010 | **Abierta** | PA-10 no concedida; SQL preparado (`scripts/f8/sc010_f3.sql`) |
| R4 Pruebas | **Parcial** | Frontend 494 ✔; backend 964 de 2026-11-09 (código sin cambios); **entorno limpio no repetido** (PA-11) |
| R5 SQL de calidad | **Resuelta** | `scripts/f8/calidad_live.sql` + muestra del 2026-11-11 en `8.5-calidad-live.txt` (solo `SELECT`); no sustituye a la de 2026-11-06 |
| R6 197/198 | **Explicación probable, no demostrada** | La antigüedad máxima de 1 438,5 min implica que un evento salió de la ventana de 24 h entre dos llamadas a la API; la misma cifra se repite en la muestra del 2026-11-11 |
| R7 Costes | **Abierta** | Datos reales de la persona estudiante pendientes; importes hipotéticos |
| R8 Cuotas | **Parcial** | 60 s decidido; 3 peticiones por ciclo en ngrok medidas; **contadores sin leer** (persona estudiante) |
| R9 Mermaid | **Parcial** | Los 5 diagramas parsean y renderizan con Mermaid 11.4.1 en un navegador; **render en GitHub sin comprobar** hasta tras el push |
| R10 Interrupciones | **Abierta** | Sin investigación prevista |
| R11 Función de Netlify | **Parcial** | Publicada y verificada; faltan registros de la función, ver que el secreto aparece oculto y el contador |

## 5. Plan de evaluación (revisión)
| Elemento | Estado comprobado | Riesgo |
|---|---|---|
| **PC** | Suspende a **1 h** (10 min con batería); Windows puede reiniciar de madrugada (horas activas 09:00–03:00); sin pausa de actualizaciones; **ajustes sin cambiar** (releídos hoy) | **Alto**: la web se quedaría sin datos |
| **Docker** | Docker Desktop se inicia con la sesión; servicios `unless-stopped`; 26 h sanos | Medio tras un reinicio (hay que iniciar sesión) |
| **ngrok** | Sin servicio: se abre a mano; sin límite de duración (docs); contador **sin leer** | Medio |
| **Netlify** | F7 con función publicada (`6af4b81f…`), respaldos `6af4a52d…` y F6; **insignia** «Powered by Netlify» visible; variable secreta **no confirmada oculta** en la interfaz | Bajo/Medio |
| **Repositorio privado** | `github.com/…` responde **404 sin sesión** (privado o inexistente) y `origin/main` coincide con el último commit; **los permisos del profesor no se pueden comprobar desde el equipo** | Medio (CA-05) |
| **Credencial** | El visitante no necesita clave; clave solo en `.env` y en Netlify | Bajo |
| **Entrega** | Fecha, canal y requisitos del vídeo **sin confirmar** (CA-02/CA-03) | Medio |

## 6. Qué no se ha hecho (y por qué)
Vídeo y capturas (los hace la persona estudiante), SC-010 (PA-10), entorno limpio (PA-11), pruebas de backend (crean contenedores), lectura de contadores y registros (paneles privados), comprobación de permisos en GitHub, ajustes de Windows, nueva medición con ngrok (no autorizado) y revisión con otros navegadores.

## 7. Problemas importantes que siguen abiertos
1. **Disponibilidad durante la ventana**: ajustes de energía y de actualizaciones sin cambiar (acción de la persona estudiante).
2. **Vídeo**: sin grabar; requisitos sin confirmar; capturas pendientes (`capturas-y-evidencias.md`).
3. **Evidencias confirmadas solo de palabra**: Pixel, túnel cerrado/reabierto con F7 y fallback sin WebGL (sin capturas).
4. **Contadores y secretos de Netlify/ngrok** sin revisar.
5. **Acceso del profesor al repositorio** y condiciones de entrega sin confirmar.
