# Resultados de F8.3 — Evidencias y validación técnica final

**Fecha**: 2026-11-11. **Principio**: nada se declara superado sin una evidencia; lo no probado consta como pendiente. Sin commit ni push.

> **Nota del 2026-11-17**: SC-010 se observó (`f3/sc-010-observacion-24h.txt`), las pruebas se repitieron tras añadir EMSC (backend 1 046, frontend 528) y el contador de ngrok se leyó (5,18 MB de 1 GB). Lo que sigue es el estado del 2026-11-11.

## 1. Estado de las tareas de 8.3
| Tarea | Estado | Evidencia |
|---|---|---|
| T030 Validación técnica final | **Hecha con reservas** (ver 2) | Esta página; `8.3-aislamiento-invariantes.txt`; `8.3-seguridad-secretos.md` §7 |
| T015 README en entorno limpio | **Hecha el 2026-11-17** (PA-11 concedida) | `docs/evidencias/f8/entorno-limpio-readme-final.txt` |
| T016 Preparar SC-010 | **Preparada y ejecutada el 2026-11-17** (solo lectura, PA-10 concedida) | `scripts/f8/sc010_f3.sql` |
| T017 Anexar el resultado de SC-010 | **Hecho** (2026-11-17) | `docs/evidencias/f3/sc-010-observacion-24h.txt` |
| T031 Secretos y seguridad | **Hecha** (0 secretos); quedan capturas/acceso a GitHub | `8.3-seguridad-secretos.md` |
| T033 Acceso del profesor a la web publicada | **Hecha** (solo lectura); diferencia F6/F7 identificada | `estrategia-publicacion-f7.md` §1, `verificacion-publicacion-f7.md` |
| T034 Estrategia de publicación de F7 | **Hecha y ejecutada** | `estrategia-publicacion-f7.md` |
| T035 Publicar F7 | **Hecha**: despliegue `6af4a52d30a824e6ef9dead2`, 15 archivos con SHA-256 verificado, F6 conservado | `estrategia-publicacion-f7.md`, T035 en la conversación |
| T036 Verificar F7 publicada | **Hecha** (2026-11-11): navegador integrado y **Pixel con datos móviles confirmado por la persona estudiante** (sin capturas); reservas: otro navegador distinto de Chrome y el cierre del túnel desde el móvil | `verificacion-publicacion-f7.md` |
| T037 Funcionamiento continuado, conectividad, suspensión | **Verificación documental hecha; hallazgo importante**; la ejecución continuada y las pruebas reales quedan para 8.5 | `8.3-continuidad-ventana.md` |
| T038 Procedimiento de credenciales | **Hecha** (procedimiento); la entrega es manual | `procedimiento-credenciales-profesor.md` |
| T041 Modo mantenimiento | **Preparado, no publicado** (opcional) | `scripts/f8/mantenimiento/`, `estrategia-publicacion-f7.md` §8 bis |
| T042 Acceso público sin clave (Netlify Function) | **Hecha** (18 pruebas; prueba con la API local 15/15; panel sin formulario de clave) | `frontend/netlify/functions/api.mjs`, `scripts/f8/`, `estrategia-publicacion-f7.md` §8 quater |
| T043 Publicar y verificar la función | **Hecha con reservas** (2026-11-11): despliegue `6af4b81f…`, sin formulario de clave, 60 s, FastAPI 401 sin clave, 0 coincidencias de la clave; incidencia del `config.path` resuelta; Pixel confirmado por la persona estudiante; **pendientes (los dejó la persona estudiante)**: registros de la función, comprobar el secreto oculto en la interfaz y el contador de ngrok | `verificacion-funcion-netlify.md` |
| T039 (de 8.5) Procedimiento de la ventana de evaluación | **Hecho** (arranque y parada en el README §15 y §20) | `README.md` |

## 2. T030 — pruebas y comprobaciones
| Comprobación | Resultado | Notas |
|---|---|---|
| Pruebas del **frontend** (`node --test tests/*.test.ts`) | **476 pasan, 0 fallan** (2026-11-11) | Son mayoritariamente de lógica pura y de forma del código fuente |
| Pruebas del **backend** (964) | **No se han repetido; se reutiliza la evidencia de F6** (`f6/6.9-regresion-final.txt`, 964 pasadas el 2026-11-09 15:31 UTC) | `backend/`, `sql/`, `compose.yaml`, `scripts/` y `.env.example` **no han cambiado** desde el commit `fd9e1a7` (T033). La batería usó un Kafka temporal en un contenedor efímero: **se omite** por requerir crear contenedores (no autorizado) |
| Aislamiento e invariantes (`aislamiento_final.sh`, solo lectura) | **OK** | Cinco servicios `healthy`; solo la API en `127.0.0.1:8000`; 0 mezclas live/historico/replay/sintético |
| `compose.yaml` válido | **OK** | `docker compose config --quiet` |
| Imágenes frente al código | **API idéntica al repositorio**; `consumer`/`producer` solo difieren en código exclusivo de la API | `8.3-seguridad-secretos.md` §7 |
| EN VIVO y REPRODUCCIÓN en la web publicada | **OK** (T036): 206 eventos en vivo; REPRODUCCIÓN con 35 | Un solo navegador |
| Recuperación del hueco real #475 | Reutilizada (`f4/recuperacion-hueco-475.md`) | No se repite |
| Calidad (SQL literal de calidad, R5) | **Resuelta en F8.5**: `scripts/f8/calidad_live.sql` y muestra del 2026-11-11 en `8.5-calidad-live.txt` (solo lectura) | `8.5-calidad-live.txt` |
| ACE-08 (matar el consumidor) | **No ejecutada**, reserva conservada | Decisión de la persona estudiante |
| Contraste 197/198 (R6) | **Explicación probable por la ventana móvil de 24 h (cálculo con la antigüedad máxima de 1 438,5 min); no demostrada** | `memoria.md` §4.4 |

## 3. Reservas R1–R10 tras T030–T041
| Reserva | Estado |
|---|---|
| R1 ACE-08 | Sin cambios |
| R2 ACE-09/10 con F7 | **Verificada con F7 publicada en el navegador integrado** (T036): cerrar el túnel → «Sin conexión», datos conservados; reabrir → recuperación en ≈ 7–11 s. En el Pixel con datos móviles la web funcionó según la persona estudiante; **no se repitió el cierre del túnel desde el móvil** |
| R3 SC-010 | **Ejecutada el 2026-11-17** (PA-10 concedida) |
| R4 Re-verificar pruebas, servicios, entorno limpio, seguridad e historial | Frontend, servicios, seguridad e historial **hechos**; entorno limpio **hecho el 2026-11-17** (PA-11) |
| R5 SQL literal de calidad | **Resuelta en F8.5** |
| R6 197/198 | Explicación probable, no demostrada (F8.5) |
| R7 Costes reales | Sin datos reales: los importes son supuestos |
| R8 Cuotas y refresco | **Decisión cerrada: 60 s.** Medido: **3 peticiones por ciclo en ngrok con la función de Netlify** (6 con la llamada directa de T036). Consumo de ngrok leído el 2026-11-16 y el 2026-11-17 (5,18 MB de 1 GB) |
| R9 Mermaid y enlaces | 160 enlaces comprobados (0 rotos); 5 diagramas parsean y renderizan con Mermaid 11.4.1 en un navegador; GitHub renderiza Mermaid de forma nativa |
| R10 Interrupciones | Sin cambios |

## 4. Incidencias de T036 (resumen; detalle en `verificacion-publicacion-f7.md`)
- **Media**: cuota de ngrok con 60 s (6 peticiones por ciclo con la llamada directa de T036; **3 con la función de Netlify publicada en T043**); insignia «Powered by Netlify» inyectada por Netlify.
- **Baja**: 8 teselas de OpenStreetMap con error 400 en el mapa 2D; estado transitorio «sin ejecuciones» al cambiar a REPRODUCCIÓN.
- **Observaciones**: otro cliente Firefox sin clave (una pestaña antigua). **Comprobados después**: búsqueda de la tabla, filtros por periodo y país, causa de las teselas (todas fuera del mundo), fallback sin WebGL (copia local) y Pixel con datos móviles (confirmación de la persona estudiante).
- **No verificado**: otro navegador distinto de Chrome, el cierre del túnel desde el móvil, la pausa con una pestaña realmente oculta (solo cubierta por la prueba en móvil real), registros de la función y contador de invocaciones de Netlify (el de ngrok se leyó).

## 5. Problema que podría afectar a la entrega
**El PC se suspende tras 1 h de inactividad con alimentación (10 min con batería) y Windows puede reiniciar de madrugada** (`8.3-continuidad-ventana.md`): si no se cambian esos ajustes, la web quedaría sin datos durante la ventana. Es una acción de la persona estudiante, no un fallo del sistema.

## 6. Qué requiere intervención personal
Intervenciones personales de la ventana: ajustes de energía (comprobados el 2026-11-16), contador de ngrok (leído el 2026-11-16 y el 2026-11-17), prueba en el móvil (hecha por el autor, sin captura) y acceso del profesor al repositorio (se le entrega el enlace). SC-010 y el entorno limpio se ejecutaron el 2026-11-17.
