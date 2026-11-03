# Especificación de la funcionalidad: MVP — recorrido completo de un evento sintético

**Rama de la funcionalidad**: `001-mvp-evento-sintetico` (el proyecto trabaja en `main`; no se crea rama)

**Creada**: 2026-11-03

**Estado**: Borrador

**Entrada**: «El MVP debe permitir que un evento sísmico sintético recorra el circuito completo
(productor → Kafka → consumidor → PostgreSQL → FastAPI → Angular/Leaflet), identificado claramente
como dato sintético y separado de la ingesta real.» Corresponde a la fase F2 de `docs/HOJA-DE-RUTA.md`
(pasos 2.1 a 2.8; commit previsto `[F2]`). Requisitos de origen: `ENUNCIADO.md` §2, §9, §11; `CONTRATO-API.md`;
`FAQ-ALUMNADO.md` preguntas 6, 7 y 12.

## Escenarios de usuario y pruebas *(obligatorio)*

La «persona usuaria» de este MVP es la persona estudiante que desarrolla, prueba y defiende el
sistema; el «visitante» es quien abre el mapa.

### Historia 1 — Un evento sintético completa el circuito y se ve en el mapa (Prioridad: P1)

La persona estudiante arranca el sistema, emite un único evento sísmico sintético y comprueba que
atraviesa todas las etapas hasta aparecer como un punto en el mapa, claramente etiquetado como
sintético.

**Por qué esta prioridad**: es el punto de control que pide la FAQ (pregunta 7): demuestra que las
piezas obligatorias están conectadas antes de añadir calidad, geografía o análisis. Sin esto no hay
base para las fases siguientes.

**Prueba independiente**: arrancar el sistema vacío, emitir el evento sintético y consultar, en
este orden, el registro de la etapa de procesamiento, el almacén de datos, la respuesta de la API y
el mapa. Se entrega valor aunque no exista nada más (ni feed real, ni histórico).

**Escenarios de aceptación**:

1. **Dado** el sistema recién arrancado y sin eventos, **cuando** se consulta la API de eventos,
   **entonces** responde con éxito y una colección vacía de eventos (no un error).
2. **Dado** el sistema arrancado, **cuando** se emite el evento sintético, **entonces** el
   procesamiento deja constancia de haberlo recibido y guardado, y el almacén contiene exactamente
   una fila para ese identificador.
3. **Dado** el evento guardado, **cuando** se consulta la API de eventos, **entonces** la respuesta
   contiene exactamente ese evento, con coordenadas en orden longitud, latitud y profundidad (km),
   fechas en milisegundos Unix UTC y la marca de dato sintético en los metadatos.
4. **Dado** el mapa configurado para consultar la API, **cuando** transcurre su siguiente ciclo de
   refresco, **entonces** muestra un círculo en la posición del evento, cuya ficha identifica el
   dato como **SINTÉTICO** y su identificador.

---

### Historia 2 — Los datos sintéticos están aislados de los reales (Prioridad: P2)

La persona estudiante puede demostrar que el dato sintético nunca se confunde ni se mezcla con la
ingesta real de USGS, ni ahora ni cuando se incorporen los datos reales.

**Por qué esta prioridad**: lo exige la constitución (principio III) y el enunciado (§6, §10, §11:
los datos artificiales se separan y se identifican, y no entran en el análisis real). Es barato
establecerlo ahora y caro corregirlo después.

**Prueba independiente**: tras la Historia 1, comprobar que el identificador, el canal de
transporte y el espacio de almacenamiento del evento son propios del entorno sintético, y que la
visualización lo señala sin ambigüedad.

**Escenarios de aceptación**:

1. **Dado** un evento sintético guardado, **cuando** se inspeccionan su identificador y su
   procedencia, **entonces** ambos lo declaran sintético de forma inequívoca (por ejemplo, el
   identificador comienza con un prefijo reservado) y su origen no es USGS.
2. **Dado** el MVP en funcionamiento, **cuando** se revisan los lugares donde se guardan los datos,
   **entonces** los eventos sintéticos residen en un espacio propio y no comparten tabla ni canal
   con datos reales, históricos o de reproducción (que aún no existen).
3. **Dado** el mapa mostrando el evento, **cuando** la persona visitante lo ve, **entonces** el
   mapa muestra de forma visible que los datos son sintéticos (no actividad sísmica real).

---

### Historia 3 — Arranque reproducible y verificable (Prioridad: P3)

La persona estudiante (o quien revise el repositorio) puede levantar el sistema con un único
comando documentado y comprobar que cada servicio está sano, sin depender del orden de arranque.

**Por qué esta prioridad**: el enunciado (§2, §9) exige que el arranque con un único comando sea
reproducible, con comprobaciones de salud y reintentos. Se necesita para repetir la demostración,
pero el valor de negocio principal (Historia 1) ya existe con un arranque manual.

**Prueba independiente**: partir de un entorno sin contenedores, ejecutar el comando de arranque y
comprobar que los cinco servicios obligatorios llegan al estado «sano»; repetir tras reiniciar.

**Escenarios de aceptación**:

1. **Dado** un equipo con los requisitos instalados y un archivo de configuración creado a partir
   del ejemplo, **cuando** se ejecuta el comando único de arranque, **entonces** los cinco
   servicios obligatorios llegan al estado sano sin intervención manual.
2. **Dado** que el broker o la base de datos tardan en estar disponibles, **cuando** arrancan el
   productor, el consumidor o la API, **entonces** reintentan la conexión y no terminan con error.
3. **Dado** el sistema con un evento ya guardado, **cuando** se reinician los servicios,
   **entonces** el evento sigue consultándose en la API y no se duplica.

---

### Casos límite

- **Reenvío del mismo evento** (antes o tras un fallo): no crea una segunda fila ni aumenta el
  recuento. Alcance MVP: protección por identificador; el control de versiones y revisiones
  (`updated`) completo corresponde a la Fase 3.
- **API sin eventos**: devuelve una colección vacía con éxito, nunca un error ni datos inventados.
- **Almacén de datos no disponible**: la API devuelve un error explícito, no cero eventos como si
  fuera un resultado válido (`CONTRATO-API.md`).
- **Servicio de transporte no disponible al emitir**: la emisión falla de forma visible (error y
  código de salida distinto de cero) y el evento no se da por publicado ni llega al almacén.
- **Almacén no disponible al consumir**: el consumo no se confirma, de modo que, al recuperarse el
  almacén, el mensaje se procesa y se guarda una sola vez.
- **Evento con más de 24 horas de antigüedad**: se conserva en el almacén (no se borra) pero no
  aparece en la respuesta por defecto de la API, que solo cubre las últimas 24 horas
  (`CONTRATO-API.md`); tampoco en el mapa. Por eso un evento sintético «caduca» de la vista al día
  siguiente aunque siga guardado.
- **Repetir la demostración**: reenviar un identificador ya guardado no refresca su hora. Para
  repetir la demostración se emite otro evento sintético (identificador distinto) o se reinicia el
  entorno borrando los datos del MVP; el procedimiento está en `quickstart.md`.
- **Petición desde un origen no autorizado**: la API no concede el acceso entre orígenes a ningún
  origen distinto del permitido (CORS no es autenticación, pero no se amplía sin motivo).
- **Mensaje con datos incompletos o inválidos**: queda fuera del MVP (Fase 3: validación y
  cuarentena); el MVP solo emite y procesa un evento sintético válido y controlado.
- **País**: el evento sintético no tiene país asignado (la integración geográfica es de la Fase 4);
  se muestra como «Sin país asignado».
- **Magnitud o profundidad desconocidas**: el contrato exige `null`, no 0; el evento sintético del
  MVP trae ambas, pero el mapa ya trata los nulos como «ND».

## Requisitos *(obligatorio)*

### Requisitos funcionales

- **FR-001**: El sistema MUST permitir emitir, bajo demanda y de forma explícita, **un** evento
  sísmico sintético por emisión (con posibilidad de elegir otro identificador sintético y su
  antigüedad, para repetir la demostración y probar la ventana de 24 h), con identificador, instante de ocurrencia, instante de actualización,
  magnitud, tipo de magnitud, profundidad, coordenadas y descripción del lugar.
- **FR-002**: El evento sintético MUST estar marcado como sintético en todo su recorrido: en su
  identificador (prefijo reservado), en el mensaje transportado, en el dato guardado, en los
  metadatos de la respuesta de la API y en la ficha del mapa.
- **FR-003**: El mensaje transportado MUST llevar el identificador del evento como clave, el
  origen (`source`), el instante de ingesta (`ingested_at`), el modo y el evento original, según
  `ENUNCIADO.md` §5.4. El modo del MVP es la excepción temporal «synthetic» (ver Supuestos).
- **FR-004**: El procesamiento MUST guardar el evento y confirmar su consumo solo después de que
  el guardado sea duradero (el reenvío tras un fallo no duplica el evento).
- **FR-005**: El almacén MUST contener, como máximo, una fila actual por identificador de evento,
  y los eventos sintéticos MUST residir en un espacio separado de los datos reales, históricos y
  de reproducción.
- **FR-006**: La API MUST ofrecer `GET /api/eventos` conforme a `CONTRATO-API.md`: colección
  GeoJSON con `metadata` (`generated`, `last_ingestion`, `mode`, `count`, `truncated`), cada evento
  una sola vez, `[]` sin eventos, `null` (nunca NaN/Infinity) para valores desconocidos, y fechas
  en milisegundos Unix UTC. Por defecto devuelve los eventos de las últimas 24 horas; los filtros
  quedan para la Fase 5. **Significado de `last_ingestion`**: *provisional (solo MVP)* = instante
  del último mensaje sintético procesado, o `null` si no hay ninguno; **no** es una consulta a
  USGS. *Definitivo (desde la ingesta real de F3: pasos 3.2 y 3.6, según el contrato)* = instante de la
  última consulta correcta a USGS; en la API definitiva nunca se calcula con datos sintéticos.
- **FR-007**: La API MUST responder a las peticiones del navegador desde el origen de desarrollo
  del mapa (`http://localhost:4200`), incluida la comprobación previa (`OPTIONS`) y la cabecera
  `ngrok-skip-browser-warning`, y MUST devolver un error explícito si el almacén falla.
- **FR-008**: El mapa MUST obtener sus datos de la API (no del archivo de demostración ni de USGS),
  mostrar el evento y señalar visiblemente que se trata de datos **sintéticos**.
- **FR-009**: Los servicios obligatorios (productor, transporte, consumidor, almacén y API) MUST
  arrancar con un único comando documentado, con comprobaciones de salud y reintentos de conexión,
  y MUST conservar los datos del almacén al reiniciarse.
- **FR-010**: Los transportes y el almacén MUST NOT ser accesibles desde fuera del equipo; solo la
  API de consulta se publica, y solo hacia el equipo anfitrión.
- **FR-011**: El MVP MUST NOT realizar ninguna consulta a USGS ni cargar datos reales o
  históricos; la ingesta real queda fuera de alcance (Fases 3 y 4).
- **FR-012**: Cada etapa del recorrido MUST dejar una evidencia verificable (registro, consulta o
  captura) que la persona estudiante pueda conservar para la memoria, sin inventar resultados.
- **FR-013**: La configuración MUST gestionarse mediante un archivo de ejemplo sin credenciales
  reales; los secretos reales no se versionan.
- **FR-014**: El servicio de transporte MUST tener desde el MVP una **retención limitada y
  explícita** de mensajes (`ENUNCIADO.md` §9), por tiempo y por espacio, cuya política y valores
  provisionales se definen en `plan.md` y `research.md` (R-004) y se revisan en F3.

### Entidades clave

- **Evento sísmico sintético**: terremoto ficticio con identificador reservado, instante de
  ocurrencia y de actualización (UTC), magnitud y tipo, profundidad (km), posición (longitud,
  latitud), lugar y marca de sintético. Su país es desconocido en este MVP.
- **Mensaje de evento**: sobre de transporte con clave (identificador), origen, instante de
  ingesta, modo y el evento original.
- **Evento actual**: versión consultable de un evento; una fila por identificador, en el espacio
  de datos sintéticos.
- **Respuesta de eventos**: colección GeoJSON con metadatos (generación, última ingesta, modo,
  recuento, truncado) y un elemento por evento.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: Con un único comando de arranque, el 100 % de los cinco servicios obligatorios
  alcanza el estado «sano» en menos de 10 minutos desde un entorno limpio (con las imágenes ya
  descargadas, menos de 3 minutos).
- **SC-002**: Tras emitir el evento sintético, este aparece en el mapa como máximo 2 minutos
  después, sin ninguna acción manual intermedia.
- **SC-003**: El 100 % de los puntos visibles en el mapa durante el MVP se identifica como
  sintético en su ficha, y el mapa muestra una indicación visible de datos sintéticos.
- **SC-004**: Emitir el mismo evento 5 veces seguidas deja exactamente 1 evento en el almacén y 1
  elemento en la respuesta de la API.
- **SC-005**: Tras reiniciar todos los servicios, el evento sigue presente (1 de 1) y no se
  duplica.
- **SC-006**: 0 filas sintéticas en espacios de datos reales, históricos o de reproducción, y 0
  consultas a USGS durante todo el MVP.
- **SC-007**: Las 4 etapas verificables (procesamiento, almacén, API, mapa) tienen cada una una
  evidencia reproducible registrada.
- **SC-008**: La persona estudiante puede explicar oralmente, con apoyo del código, el recorrido
  completo del evento y la decisión de confirmar el consumo tras el guardado.
- **SC-009**: Un evento sintético con 25 horas de antigüedad queda guardado (1 de 1 en el
  almacén) y aparece 0 veces en la respuesta por defecto de la API y en el mapa.
- **SC-010**: La configuración efectiva de retención del transporte coincide con la política
  documentada (tiempo y espacio máximos), comprobada con una consulta al propio servicio.

## Supuestos

- **Alcance (fuera del MVP)**: feed real de USGS cada 60 s, carga histórica, versiones y
  revisiones completas, validación y cuarentena, integración geográfica, filtros, estadísticas,
  tabla, gráficos, replay, ngrok, Netlify, memoria y mediciones (Fases 3–7).
- **Arquitectura y tecnologías**: obligatorias por `ENUNCIADO.md` §2 y la constitución (principio
  II); su elección concreta se desarrolla en el plan, no aquí.
- **Modo del mensaje (excepción temporal)**: el enunciado y el contrato definen `mode` como `live`
  o `replay`, y no se modifican. El evento sintético no es ninguno de los dos; solo durante el MVP se
  usa el valor transitorio «synthetic», únicamente en el canal y el espacio aislados del MVP. No es
  un valor válido de la API definitiva. La retirada o el aislamiento completo debe estar terminado
  como máximo al cerrar el paso 3.1 de la hoja de ruta (criterio obligatorio), que precede a la
  ingesta real del paso 3.2 (aceptado provisionalmente por la persona estudiante el 2026-11-03;
  plan de retirada en `research.md`, R-001).
- **Entorno de uso**: se ejecuta en el equipo anfitrión (Windows con Docker Desktop en marcha); el
  mapa se sirve en desarrollo en `http://localhost:4200` y consulta la API local. La publicación
  con ngrok y Netlify no forma parte del MVP.
- **Datos del evento**: son ficticios, pero con valores plausibles y coordenadas válidas en mar
  abierto o tierra sin pretender representar un sismo real; su magnitud y profundidad no se
  utilizan para ninguna conclusión.
- **Mapa existente**: se reutiliza el componente entregado por el profesor; solo se adapta para
  conectar con la API y señalar el dato como sintético, sin añadir filtros ni gráficos.
- **Calidad de la comprobación**: no se marca como superada ninguna prueba sin ejecutarla; los
  resultados observados se registran tal cual.
