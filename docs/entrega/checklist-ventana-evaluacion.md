# Checklist de activación y de la ventana de evaluación (F8 · T039)

**Estado**: BORRADOR preparado en 8.3 (parte [E]); se **completa y ejecuta en 8.5** (parte [D]). Nada de esto se ha ejecutado todavía. **No sustituye a SC-010** (FR-024).

**Fechas (sin confirmar, CA-02/CA-06)**: entrega jue 19 o vie 20 de noviembre; revisión del profesor hasta dom 22. Marcas `[ACTUALIZAR EN CIERRE]` = valores a rellenar entonces.

> **Con la función de Netlify publicada (T042–T043, 2026-11-11) el profesor no necesita clave**: el paso de «entregar la credencial» desaparece y el paso B.7 se hace sin escribir clave. Si se volviera al despliegue anterior (`6af4a52d…`) se aplicaría lo descrito.

## A. Con unos días de margen (antes del 19)
- [ ] **PC**: enchufado; **Suspender: nunca** con alimentación; tapa «No hacer nada» si es portátil; actualizaciones de Windows **pausadas** durante la ventana; inicio de sesión automático o plan de reinicio (`8.3-continuidad-ventana.md`). *Lo hace la persona estudiante.*
- [ ] **ngrok (Usage)**: anotar HTTP requests del mes, fecha de reinicio del ciclo y plan. Probar si cuentan los `OPTIONS` (`checklist-prueba-movil-pixel.md`, sección 5). `[ACTUALIZAR EN CIERRE]`
- [ ] **Prueba en el Pixel** con datos móviles y la clave (`checklist-prueba-movil-pixel.md`).
- [ ] **Netlify**: el sitio sirve **F7** (`6af4a52d30a824e6ef9dead2`), no mantenimiento ni F6. La insignia «Powered by Netlify» decidida (apagarla en el panel o aceptarla).
- [ ] **Credencial / función**: `procedimiento-credenciales-profesor.md` listo; **o**, si se publica la función (T043): variables `API_UPSTREAM_URL` y `API_CLAVE_ACCESO` creadas en Netlify por la persona estudiante, despliegue verificado y la clave del `.env` coincide con la de Netlify.
- [ ] **GitHub**: el profesor tiene acceso de lectura al repositorio privado (CA-05).
- [ ] Escaneo de secretos y de la clave sin coincidencias (`8.3-seguridad-secretos.md`).

## B. El día antes y el día de empezar la ventana
Orden de arranque (cada paso comprueba el anterior):
1. Reiniciar el PC si hace falta y esperar a Docker Desktop. **No** ejecutar scripts que paren o recreen servicios.
2. `docker compose up -d --wait` (no recrea lo que ya corre) y `docker compose ps`: **api, consumer, kafka, postgres y producer en `healthy`**.
3. Ingesta al día: `/api/salud` local con la clave o el panel («Última ingesta correcta hace … s»); **0 huecos pendientes** (`docker compose run --rm --no-deps producer python -m observatorio.recuperacion.recuperar --listar`). Si hay huecos: `--simular` y después sin parámetro (README §10.4).
4. Cerrar `npm run start:local` (puerto 4200) y cualquier pestaña innecesaria.
5. Abrir el túnel **solo hacia la API**: `ngrok http --url=https://grandpa-bunkbed-spree.ngrok-free.dev 127.0.0.1:8000` y **dejar la terminal abierta**.
6. Comprobar: `curl -s -o NUL -w "%{http_code}" -H "ngrok-skip-browser-warning: 1" https://grandpa-bunkbed-spree.ngrok-free.dev/api/salud` → **401** sin clave.
7. Abrir la web publicada **desde otro dispositivo** y entrar con la clave: «Datos al día», globo/mapa, Análisis, Eventos, EN VIVO y REPRODUCCIÓN (35 eventos). `[ACTUALIZAR EN CIERRE]`
8. Entregar la credencial por el canal privado (`procedimiento-credenciales-profesor.md`).
9. Anotar hora de inicio, contador de ngrok y estado de las comprobaciones en `docs/evidencias/f8/auditoria-final.md` (8.5).

## C. Durante la ventana
- [ ] **No tocar nada**: ni código, ni servicios, ni scripts de F6 que paren o recreen contenedores, ni la clave, ni Netlify. **No activar mantenimiento**, salvo incidencia que lo justifique y avisando al profesor.
- [ ] Mantener PC encendido y enchufado, ngrok abierto y la terminal visible.
- [ ] Cerrar pestañas de F7 que no se usen (cada pestaña visible consume ≈ 180 peticiones/h a ngrok con 60 s [MEDIDO: 3 por ciclo con la función de Netlify]; **no se conoce el consumo real de la cuenta**).
- [ ] Revisar el contador de ngrok 1–2 veces al día; si se acerca al límite: decisión de la persona estudiante (Plan B de `estrategia-publicacion-f7.md`).
- [ ] Si algo falla: `docker compose ps`; si el PC se reinició, repetir el orden de la sección B; tras una parada larga, recuperar huecos (B.3).

## D. Incidencias y qué hacer
| Síntoma | Causa probable | Acción |
|---|---|---|
| La web dice «Sin conexión con el backend» | PC suspendido/reiniciado, Docker parado, ngrok cerrado, cuota de ngrok agotada | Repetir sección B; comprobar contador de ngrok |
| 401 / «clave no correcta» | Clave mal escrita o rotada | Reenviar por el canal privado; no rotar sin avisar |
| «Datos desactualizados» | Productor parado o hueco de ingesta | Sección B.2–B.3 |
| Falla el globo 3D | Sin WebGL en el dispositivo | Debe pasar a Mapa 2D con aviso (comprobar en el dispositivo) |

## E. Al terminar la ventana
- [ ] Anotar el resultado en `docs/evidencias/f8/auditoria-final.md`.
- [ ] **Rotar la clave** (autorización expresa) y cerrar ngrok; decidir si se deja F6/mantenimiento publicados.
- [ ] Restablecer los ajustes de energía y las actualizaciones de Windows si se cambiaron.

## Pendiente de intervención personal (resumen)
Ajustes de energía y actualizaciones de Windows; contador y plan de ngrok; prueba en el Pixel; insignia de Netlify; elección del canal y entrega de la credencial; permisos del repositorio; ejecución del checklist y cierre.
