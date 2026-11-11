# Checklist: prueba de F7 desde el Google Pixel con datos móviles (F8 · T036)

**Estado**: BORRADOR para coordinar. **No se ha abierto ngrok ni se ha hecho la prueba.** Orden recomendado: decidir el refresco público y la insignia **antes**; si se republica con otro intervalo, hacer la prueba **después** de republicar, para probar lo que verá el profesor.

> **Nota T042**: la versión con función **ya está publicada** (2026-11-11): **no hay que escribir ninguna clave** en el móvil: se omite el punto 3.3 y la comprobación 1 pasa a ser «carga directamente con datos».

## 1. Antes (en el PC)
1. **Docker Desktop abierto** y los cinco servicios `healthy`: `docker compose ps` (api, consumer, kafka, postgres, producer).
2. **La API local responde**: `curl -s -o NUL -w "%{http_code}" http://127.0.0.1:8000/api/salud` debe dar **401** (sin clave); es lo esperado.
3. **El PC no debe suspenderse** durante la prueba (Configuración → Sistema → Alimentación; solo mirarlo, no hace falta cambiar nada si no se suspende en minutos).
4. **No hace falta** `npm run start:local` ni nada en el puerto 4200; **no abras ni expongas el 4200**.
5. La **clave** a mano (gestor de contraseñas o copia privada). **No se pega en el chat, ni en capturas, ni se guarda en el navegador.**

## 2. Abrir y cerrar el túnel (solo cuando lo autorices)
- **Lo abre Claude** al recibir tu autorización explícita, o lo abres tú en una terminal del PC y la dejas abierta:
```bash
ngrok http --url=https://grandpa-bunkbed-spree.ngrok-free.dev 127.0.0.1:8000
```
- Comprobación: `curl -s -o NUL -w "%{http_code}" -H "ngrok-skip-browser-warning: 1" https://grandpa-bunkbed-spree.ngrok-free.dev/api/salud` → **401** (túnel y API arriba; sin clave).
- **No enseñes ni captures `http://127.0.0.1:4040`** (el inspector contiene la clave en las cabeceras).
- **Cerrar**: `Ctrl+C` en la terminal de ngrok (o lo cierra Claude). Con el túnel cerrado el panel mostrará «Sin conexión»: es lo esperado.

## 3. En el Pixel
1. **Desactiva el Wi-Fi** y usa **datos móviles** (comprueba que el icono de Wi-Fi no está activo).
2. Abre **Chrome** y entra en `https://observatorio-sismico.netlify.app`. No abras la URL del túnel directamente (mostraría una página intermedia de ngrok; el panel no la necesita).
3. Escribe **tú** la clave en «Clave de acceso» y pulsa «Acceder». **Rechaza «Guardar contraseña»** si Chrome la ofrece.

## 4. Qué revisar (marca ✔/✘ y apunta lo raro)
| # | Comprobación | Esperado |
|---|---|---|
| 1 | Carga | Formulario de clave; tras la clave, «Datos al día» |
| 2 | Panel · Globo 3D | Carga (puede tardar), gira con el dedo, pellizco para acercar, tocar un evento muestra su detalle |
| 3 | Mapa 2D | Botón «Mapa 2D»: mapa con eventos y fondo de OpenStreetMap |
| 4 | Análisis | Gráficas legibles, scroll sin cortes |
| 5 | Eventos | Tabla con scroll horizontal, «Ver en el mapa» |
| 6 | Filtros | «Mostrar filtros», magnitud mínima 4,5 → pocos eventos; «Restablecer» |
| 7 | EN VIVO ↔ REPRODUCCIÓN | REPRODUCCIÓN muestra 35 eventos y se etiqueta como no actual; volver a EN VIVO |
| 8 | Insignia «Powered by Netlify» (si sigue activa) | No tapa controles; **no la toques** (abre una tarjeta de Netlify) |
| 9 | Segundo plano | Cambia a otra app ≥ 2 min y vuelve: aviso de pausa y actualización al volver |
| 10 | Rotar el móvil | Vertical y horizontal sin desbordamientos |
| 11 | Rendimiento | ¿El globo va fluido? ¿Se calienta o se traba? |
| 12 | Sin conexión (con tu autorización para cerrar ngrok) | «Sin conexión…», datos conservados y marcados como antiguos; al reabrir, recuperación sola |

**Anota**: modelo, Android, versión de Chrome, si fue con datos móviles, la hora, y capturas **sin la clave visible** (el campo de clave es de tipo contraseña).

## 5. Medida del consumo de ngrok (opcional, en la misma sesión)
1. Antes de empezar, en el panel de ngrok (**Usage**, inicio de sesión tuyo), anota **HTTP requests** del mes y la **fecha de reinicio del ciclo**. Aviso: el contador puede tardar minutos en actualizarse.
2. Para saber si cuentan los `OPTIONS`: con el túnel abierto, Claude envía un número conocido de `OPTIONS` (p. ej. 40, sin GET) con `curl`, y tú comparas el contador antes y después.
3. Registrar el resultado en `docs/evidencias/f8/verificacion-publicacion-f7.md`.

## 6. Resultado (2026-11-11)
**«Todo correcto» según la persona estudiante** en un Google Pixel con datos móviles y **sin escribir ninguna clave** (puntos 1–8 de la sesión: carga, globo 3D, mapa 2D, Análisis y Eventos con búsqueda, filtros, REPRODUCCIÓN y volver a EN VIVO, segundo plano con aviso de pausa y actualización, rotación). **No hay capturas ni datos del dispositivo archivados.** No se probó cerrar el túnel desde el móvil. Detalle en `verificacion-funcion-netlify.md` §8 bis.
