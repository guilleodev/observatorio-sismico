# Lista final de comprobación de la Guía (T068) · estado a 2026-11-09

> **Nota del 2026-11-17**: este documento recoge el estado de la fase en su fecha. Lo que figura aquí como pendiente o abierto se resolvió después o consta como reserva en el [Anexo C de la memoria](../../entrega/memoria.md#anexo-c--reservas-de-esta-memoria) y en la [matriz de trazabilidad](../../entrega/matriz-trazabilidad.md).

Solo se marca «Verificado» lo comprobado con evidencia guardada. «Pendiente» = depende de F7 (memoria) o de una acción de la persona estudiante. Ningún punto figura como superado sin haberse ejecutado.

| # | Punto de la Guía | Estado | Evidencia / reserva |
|---|---|---|---|
| 1 | El profesor puede acceder al repositorio | **Pendiente (persona estudiante)** | Existe el remoto `origin` (GitHub), pero la visibilidad o las invitaciones al profesor no se pueden comprobar desde aquí. Además hay que hacer el commit `[F6]` y el push (autorización expresa). |
| 2 | El README permite arrancar desde un entorno limpio con los requisitos indicados | **Verificado con reservas** (defecto corregido; una sola máquina, imágenes base en caché; 2.º intento con exportación reutilizada, ver `6.9-entorno-limpio.txt`) | `6.9-entorno-limpio.txt` (cinco `healthy` en proyecto paralelo, 36 s sin contar el build) y `6.9-entorno-limpio-intento1.txt` (el defecto del paso 2 y de `004`). Reserva: una sola máquina; imágenes base ya en caché. |
| 3 | Los cinco servicios obligatorios están definidos en Docker Compose | **Verificado** | `compose.yaml`; `aislamiento.txt` (`api consumer kafka postgres producer`, solo la API publicada en 127.0.0.1). |
| 4 | Dependencias, Dockerfile, SQL y `.env.example` sin credenciales reales | **Verificado** | `backend/requirements*.txt`, `backend/Dockerfile`, `sql/001`–`004`, `.env.example` revisado contra `compose.yaml`; `escaneo_secretos.sh` (0 avisos) y `aislamiento.txt` (0 `.env` versionados). |
| 5 | Campos, unidades, fuentes, filtros y consultas de extracción documentados | **Pendiente (F7, memoria)** | Material disponible: `docs/evidencias/f3/`, `f4/regla-geografica.md`, `specs/*/data-model.md`, `sql/consultas/`, `docs/referencias/FUENTES-Y-LICENCIAS.md`. El diccionario consolidado no está escrito todavía. |
| 6 | Apartado de calidad con código/consultas, resultados y decisiones | **Parcial (F7 lo consolida)** | `docs/evidencias/f3/3.5-calidad*.txt`, `f4/4.6-calidad.txt`. |
| 7 | Modelo conceptual, lógico y físico (entidades, tablas, claves, tipos, índices) | **Pendiente (F7, memoria)** | Fuentes: `specs/*/data-model.md`, `sql/001`–`004`, `f5/5.7-explain.txt`. |
| 8 | Al menos tres conclusiones con resultados y filtros identificables | **Verificado (F5)** | `docs/evidencias/f5/conclusiones.md` (tres, reproducibles desde la API; una con cobertura distinta, declarada). |
| 9 | Mediciones con tres tamaños, complejidad, costes y mejoras | **Verificado con reservas** | `6.4-mediciones.txt` (1 000 / 10 000 / 100 000), `6.5-comparaciones.txt`, `complejidad-costes.md`. Reservas: una sola máquina; 100 millones es una proyección, no una medición; datos de costes de la persona estudiante marcados `[PENDIENTE]`. |
| 10 | Pruebas de aceptación ejecutadas con evidencias | **Verificado** | `6.3-aceptacion.md` (ocho superadas), reinicio del consumidor en `6.8-consumidor.txt`, túnel en `6.6-tunel.md`; regresión `6.9-regresion-final.txt` (964 + 130). |
| 11 | Reproducción histórica activable sin mezclarla con datos actuales | **Verificado** | `reproduccion-historica.md`, `6.1-*`, `6.2-*`, `aislamiento.txt`. |
| 12 | La URL de Netlify funciona y sé activar backend y túnel en la defensa | **Verificado con reserva** | URL `https://observatorio-sismico.netlify.app` (HTTP 200, `6.9-defensa-seco.txt`), túnel abierto/cerrado/reabierto desde el navegador integrado (`6.6-tunel.md`), guion `procedimiento-defensa.md`. Abierta desde un móvil Android con datos móviles el 2026-11-09 (`6.9-movil.md`). Reserva: un solo dispositivo, sin capturas. |
| 13 | Puedo explicar individualmente el flujo completo y una decisión técnica propia | **Pendiente (persona estudiante / F7)** | Preguntas y respuestas preparadas en `resultados.md` (T073); la explicación es oral. |

Resumen (13): 5 verificados (3, 4, 8, 10, 11), 3 verificados con reservas (2, 9 y 12), 1 parcial (6) y 4 pendientes de F7 o de la persona estudiante (1, 5, 7, 13).
