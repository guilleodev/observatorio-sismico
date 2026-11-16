# Checklist práctico de grabación con OBS (F8 · 8.4 · T020)

**Estado**: listo para usar (2026-11-11). **No se ha grabado nada ni se ha ejecutado ningún ensayo completo** (T021 pendiente: lo hace la persona estudiante). Claude no graba, edita ni genera el vídeo. El guion es material personal (`docs/privado/`, ignorado por Git).

**Requisitos del vídeo sin confirmar (CA-03)**: duración, formato, resolución, idioma, si aparece tu cara, dónde se sube y si se entrega archivo o enlace. Lo que sigue son **propuestas**; cuando el profesor confirme, se ajusta (si pide un formato concreto, se sigue su indicación).

## 1. Qué mostrar y qué NO mostrar nunca (privacidad)
| **No debe verse** | Por qué |
|---|---|
| La **clave de la API** (`API_CLAVE_ACCESO`), `.env`, contraseñas, authtoken de ngrok, tokens de GitHub/Netlify | Seguridad (constitución VI) |
| La **URL de ngrok**, el inspector `http://127.0.0.1:4040` y la terminal de ngrok | Revelan la infraestructura y las cabeceras (incluida la clave) |
| El **panel de Netlify** con variables de entorno, o el de ngrok con datos de cuenta | Datos privados |
| Notificaciones, correo, chats, calendario, otras pestañas, marcadores | Privacidad |
| Tu usuario de Windows y rutas personales (`C:\Users\…`) | Privacidad |
| `docker compose down`, `down -v`, `volume rm`, scripts que paren o recreen servicios, `cat .env` | Riesgo para los datos |

## 2. Preparar el equipo (una vez, el día anterior)
- [ ] **Energía**: enchufado; que no se suspenda mientras grabas (`8.3-continuidad-ventana.md`); cerrar actualizaciones de Windows pendientes; **activar «No molestar» / asistente de concentración**.
- [ ] **Cerrar** todo lo que no sea necesario (mensajería, correo, otras apps); **desactivar** notificaciones del navegador.
- [ ] **Navegador de grabación**: un perfil limpio de Chrome (sin extensiones visibles, sin marcadores), zoom **100–110 %**, sin barra de marcadores, ventana a un tamaño fijo.
- [ ] **Terminal** (Git Bash o Windows Terminal) en la raíz del proyecto: **letra grande (≥ 18 pt)**, fondo oscuro, **prompt corto** (`PS1='$ '`), pantalla limpia (`clear`), sin historial a la vista (no pulses ↑).
- [ ] **Documentos**: `README.md` y `memoria.md` abiertos **renderizados** (vista previa de Markdown o GitHub) en las secciones que vayas a enseñar; marcadores o pestañas preparadas.
- [ ] **ngrok** abierto **en otra ventana que no se captura**; una pestaña/terminal aparte.
- [ ] Un **segundo dispositivo** (móvil) por si hay que comprobar la web desde fuera.

## 3. Configuración de OBS (propuesta)
Versión: la estable actual de OBS Studio.

**Ajustes → Vídeo**
- Resolución base (lienzo) **1920×1080**; resolución de salida **1920×1080** (si el equipo va justo, 1280×720); **30 FPS**.

**Ajustes → Salida → Grabación**
- Formato: **MKV** (no se corrompe si OBS se cierra) y luego *Archivo → Convertir grabaciones (Remux)* a **MP4**; o MP4 directo si el profesor lo exige.
- Codificador: **x264 o el de hardware** (NVENC/AMF) con **tasa de bits 6 000–8 000 Kbps** (CBR o CQP); audio **AAC 160 Kbps**.
- Carpeta de grabación **fuera del repositorio** (el vídeo **no** va a Git, Guía 1: nada de archivos grandes); nombre `A-apertura`, `B-extraccion`… `G-cierre` (un archivo por escena, 7 en total).

**Ajustes → Audio**
- Frecuencia **48 kHz**, mono o estéreo; **micrófono** como único dispositivo (*Audio del escritorio* **desactivado** para no grabar avisos del sistema).
- Filtros del micrófono: **supresión de ruido** y **puerta de ruido**; nivel con picos entre **−12 y −6 dB** (la barra no debe llegar al rojo).

**Atajos de teclado** (Ajustes → Atajos): empezar/detener grabación y cambiar de escena **sin tocar OBS** durante la toma.

## 4. Escenas y fuentes de OBS
| Escena de OBS | Fuente | Para las escenas del guion |
|---|---|---|
| **Navegador** | *Captura de ventana* de Chrome (no «Captura de pantalla»: evita que se vea el resto del escritorio) | A, D (reproducción), E, F, G |
| **Terminal** | *Captura de ventana* de la terminal | B, C, D, F (consultas) |
| **Documentos** | *Captura de ventana* del visor de Markdown/GitHub | B–D, F (documentos y tablas) |
| **Panel + documento** (opcional) | Navegador y documentos lado a lado | D–F |
| **Cámara** (opcional) | Webcam pequeña en una esquina | si el profesor la pide |

- **Nunca** una escena con *Captura de pantalla* completa o *Captura de monitor* salvo que cierres todo lo demás.
- Comprueba cada fuente con **«Vista previa»**: no deben aparecer ngrok, notificaciones ni rutas personales.

## 5. Antes de cada sesión de grabación (comprobaciones previas)
**Sistema (5 min)**
- [ ] Docker Desktop abierto: `docker compose ps` → **api, consumer, kafka, postgres y producer `healthy`**.
- [ ] `bash scripts/f6/invariantes.sh grabacion` (solo lectura) → lag 0, 0 duplicados, **0 huecos pendientes**; ingesta con «hace < 60 s» en el panel.
- [ ] **EMSC** activa (`fuentes.emsc.activa`) y, si se enseña, «Fuente = EMSC» en el panel con eventos de Europa/Mediterráneo; no mostrar la URL del túnel.
- [ ] **ngrok abierto** (ventana no capturada) y la API local responde (401 sin clave).
- [ ] La **web pública** `https://observatorio-sismico.netlify.app` carga **sin clave**, con «Datos al día» (y es la versión con función, no el modo mantenimiento ni la anterior con formulario).
- [ ] **REPRODUCCIÓN** disponible: existe una ejecución terminada (35 eventos) para enseñar; no hace falta lanzar otra.
- [ ] Probar la web desde el **móvil con datos móviles** (opcional pero recomendable justo antes de la grabación definitiva).

**Equipo y OBS (2 min)**
- [ ] «No molestar» activo, notificaciones cerradas, micro probado (grabación de prueba de 30 s: se oye bien, sin ruidos, volumen correcto).
- [ ] Espacio en disco suficiente (≈ 3–4 GB por hora a 8 Mbps).
- [ ] Guion y comandos a mano en un **segundo monitor** o impresos (no capturados).

**Contenido (2 min)**
- [ ] Revisar en el guion personal (`docs/privado/guion-video.md` §7) las **reservas** que vas a decir sin presentarlas como superadas.
- [ ] Tener a mano las **cifras fijas** con su fuente (README §16 y matriz); **las cifras en vivo se leen de la pantalla**.

## 6. Durante la grabación (recomendaciones)
- Graba **una escena por toma** y deja 2 s de silencio al principio y al final. Si te equivocas, **repite esa escena**; no la corrijas con ediciones.
- Habla **despacio y con tus palabras**; señala con el ratón lo que explicas; deja que se vea cada resultado 2–3 s.
- Evita explicaciones demasiado técnicas: prioriza **qué criterio demuestras** (di el criterio al empezar cada escena).
- Si algo falla en directo, **dilo y continúa**; el tratamiento del error forma parte de lo evaluado.
- Cerrar y reabrir el túnel (escena F) se hace **fuera de la captura**; en el vídeo solo se ve el panel y su aviso.

## 7. Después de grabar
- [ ] **Ver el vídeo completo a velocidad normal** (o cada archivo): imagen nítida, texto legible, audio sin saltos y **nada de lo prohibido** (sección 1; pausa y revisa los fotogramas de terminal y de URL).
- [ ] Comprobar que cada escena demuestra su criterio (guion personal) y que **no hay cifras en vivo presentadas como definitivas**.
- [ ] Anotar los **minutos reales** de cada escena en la matriz (T019).
- [ ] **Exportar/unir**: unir los archivos en orden (o subir las escenas por separado si el profesor lo permite); exportar a **MP4 (H.264 + AAC)** a 1080p/30 si no se ha pedido otra cosa. Nombre propuesto: `observatorio-sismico-demo-AAAAMMDD.mp4`.
- [ ] Guardar el **original** (MKV) y una **copia de seguridad** fuera del repositorio. **No** subir el vídeo a Git.
- [ ] Entregar **el archivo o el enlace** según lo que confirme el profesor (CA-02/CA-03). **Pendiente de confirmar**: dónde se sube, tamaño máximo y si el enlace debe ser privado.

## 8. Orden recomendado de la sesión de grabación
1. Cierre de pendientes de F8.5 que afecten al vídeo: PC sin suspensión, versión de la web publicada **congelada**, capturas EN VIVO y cifras actualizadas (T040(a)).
2. Grabar las escenas **fijas** primero (A, B y C documentales, D, F tablas, G) y las **dinámicas** (consultas de B y C, E, hueco de F) en un solo bloque con todo el sistema sano.
3. Revisar el vídeo (T023) y **repetir** lo que falte.
4. Justo antes de entregar: comprobar que **el vídeo coincide con la web publicada** y que la ventana de evaluación está lista (T040(b), T039).
