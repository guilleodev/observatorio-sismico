# Fase 1 — Fuentes y frontend inicial

**Fecha del trabajo:** 3 de noviembre de 2026 · **Pasos:** 1.1 a 1.5 · **Estado:** pasos completados, pendiente el commit manual `[F1]`

**Convención:** **[P]** = requisito del profesor (con su apartado) · **[R]** = recomendación propia aún por decidir · **[O]** = observación puntual de los datos, sin valor permanente.

## 1. Validación del frontend Angular en modo demo (paso 1.1)

| Comprobación | Resultado |
|---|---|
| Node.js / npm | 24.11.1 / 11.6.2; cumplen `engines` de `frontend/package.json` |
| Dependencias | Ya instaladas en `frontend/node_modules` con las versiones fijadas (Angular 20.3.0, ngx-leaflet 20.0.0, Leaflet 1.9.4); no hizo falta instalar nada |
| Modo | `frontend/public/config.json` en `"mode": "demo"` (sin cambios) |
| Compilación (`npm start`) | Correcta, sin errores ni avisos |
| Navegador (`http://localhost:4200`) | Consola sin errores; todas las peticiones 200 (`config.json`, `paises.geojson`, `terremotos-demo.geojson`); panel «DEMOSTRACIÓN · datos ficticios», 4 eventos dibujados, 0 omitidos |
| Comprobación manual de la persona estudiante | Fichas emergentes, zoom y selector de capas funcionan |

**No comprobado todavía:** compilación de producción (`npm run build`), acceso desde otro dispositivo, modo `api` y publicación en Netlify (fases posteriores).

## 2. Archivos importantes y recorrido de datos (paso 1.2)

| Ruta (`frontend/`) | Responsabilidad |
|---|---|
| `src/index.html`, `src/main.ts` | Página única con `<app-root>`; `main.ts` arranca `AppComponent` |
| `src/app/app.component.ts` | Toda la lógica: crea el mapa, carga datos, dibuja círculos, fronteras y fichas |
| `src/app/app.component.html` / `.css` | Estructura (estado, mapa, leyenda) y aspecto |
| `public/config.json` | Modo `demo` o `api`, URL de la API, refresco |
| `public/datos/paises.geojson` | Fronteras Natural Earth (177 entidades) |
| `public/datos/terremotos-demo.geojson` | 4 eventos ficticios |
| `angular.json`, `package.json`, `netlify.toml` | Compilación, dependencias fijadas y publicación |

```
index.html → main.ts → AppComponent → onMapReady(mapa)
   ├─ paises.geojson ─────────────────► L.geoJSON → capa de fronteras (+ tooltip con el nombre)
   └─ config.json ─┬─ demo → terremotos-demo.geojson ┐
                   └─ api  → {apiUrl}/api/eventos    ┴► refresh(): validar → circleMarker → ficha (popup)
```

Detalles: Leaflet usa `[lat, lon]` y GeoJSON `[lon, lat]`; el radio crece con la magnitud y el color depende de la profundidad (70 y 300 km); las fichas usan `textContent`, no HTML. Qué habrá que adaptar para nuestra API: `config.json`, tipos de `app.component.ts` (`country_id`, `magType`, `last_ingestion`), estado de ingesta, filtros, `truncated`, modo «REPRODUCCIÓN», tabla y gráficos.

## 3. Fuente USGS `all_day.geojson` (paso 1.3)

- **URL:** `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson`. Respuesta 200, `application/json`, `Cache-Control: public, max-age=60`, `Access-Control-Allow-Origin: *`. **[P]** consulta aproximada cada 60 s (`ENUNCIADO.md` §4.1); cada respuesta contiene toda la ventana móvil de 24 h.
- **Estructura** (documentación oficial de USGS, formato GeoJSON Summary): `type` (`FeatureCollection`), `metadata` (`generated`, `url`, `title`, `api`, `count`, `status`), `bbox` y `features`. El material del profesor no incluye `bbox`.
- **Campos esenciales** (ejemplo real, evento `ci41572064`, [O]):

| Campo | Significado | Ejemplo | Unidad |
|---|---|---|---|
| `id` (raíz del Feature) | Identificador; se conserva en las revisiones | `ci41572064` | texto |
| `properties.mag` | Magnitud | `4.8869…` | decimal, sin unidad |
| `properties.magType` | Escala de magnitud | `mw` | texto |
| `properties.place` | Descripción del lugar | `9 km N of Delta, B.C., MX` | texto |
| `properties.time` | Instante de ocurrencia | `1793730451190` (2026-11-03 18:27:31 UTC) | ms Unix |
| `properties.updated` | Última actualización de esa versión | `1793735362280` (19:49:22 UTC) | ms Unix |
| `properties.type` | Tipo de evento | `earthquake` | texto |
| `geometry.coordinates` | `[longitud, latitud, profundidad]` | `[-115.18, 32.43, 15.59]` | grados, grados, km |

Las unidades de profundidad (km) y tiempo (ms Unix) proceden del enunciado (§4.1); la página de USGS solo documenta los tipos. Los campos `felt`, `cdi`, `mmi`, `alert` y `tz` son opcionales y no los necesitamos **[R]**.

## 4. `time`, `updated` y tiempo de ingesta

| Tiempo | Qué es | Quién lo fija |
|---|---|---|
| `time` | Cuándo ocurrió el terremoto | USGS |
| `updated` | Cuándo USGS actualizó **esa versión** | USGS |
| Ingesta | Cuándo nuestro sistema lo recibió o procesó | Nosotros (`ingested_at`) |

**[P]** convertir a UTC conservando el valor original y separar el tiempo de ocurrencia del de procesamiento (§6). Una versión es nueva por `(id, updated)`; `time` no sirve para versionar. [O] En las dos muestras `updated` fue posterior a `time` en todos los eventos.

## 5. Reglas de calidad

| Caso | Observado [O] | Regla **[P]** | Por decidir **[R]** |
|---|---|---|---|
| Nulos | `felt`/`cdi`/`mmi` nulos en 206 de 214; `mag` y `place` sin nulos hoy | Un nulo no se rellena con 0; magnitud nula se muestra «ND» y no cumple `min_mag` (§6, contrato) | Guardar solo los campos necesarios más el original |
| Magnitud 0 | 2 eventos `ml` con `mag = 0` | No descartar valores poco habituales (FAQ 16, §6) | Conservar `0` como valor válido, distinto de `null` (aplicación de esa regla, no literal) |
| Coordenadas | 0 inválidas hoy | Cuarentena con motivo y referencia al original; sin puntos inventados (§6, §11) | Detalle de las comprobaciones (finitas, rangos, `Point`, 3 valores) |
| Profundidad negativa | 8 eventos (mínimo −2,6 km) | No rechazarla sin estudiar su significado (§6) | Conservarla y documentarla como anomalía |
| Eventos no sísmicos | 3 `explosion`, 2 `quarry blast` | Filtrar `type == "earthquake"` y conservar el motivo de exclusión (§4.1) | **Dónde** guardar los excluidos |
| Duplicados y revisiones | 0 ids repetidos en una lectura | Nuevo: publicar; `updated` posterior: actualizar; igual: omitir; antiguo: no sustituir (§5, FAQ 10 y 12) | — |
| Ventana móvil 24 h | 215 → 214 eventos en unos minutos | No borrar lo que sale de la ventana; no confundirlo con eliminación (§5, FAQ 15) | — |
| `magType` mezclado | `ml` 126, `md` 66, `mb` 16, `mw*` 6 (primera muestra) | Conservar `magType`; no presentar estadísticas como evaluación de riesgo (§8) | No mezclar escalas en medias sin avisar |

## 6. Las seis dimensiones de calidad (`ENUNCIADO.md` §6)

Completitud (% por campo) · Unicidad (duplicados de versión y eventos actuales) · Validez (tipos, fechas, coordenadas, geometría) · Consistencia (claves geográficas, unidades, secuencia de revisiones) · Actualidad (ocurrencia, actualización e ingesta) · Exactitud (qué se puede contrastar; comprobar rangos no demuestra exactitud física). **[P]** Si una no puede verificarse, se justifica la limitación; se indica siempre el denominador y los problemas pueden solaparse.

## 7. Muestras observadas (no son valores permanentes)

| Lectura | Instante `generated` (UTC) | Eventos | Ventana de eventos |
|---|---|---|---|
| 1.ª (paso 1.3) | 2026-11-03 19:50:54 | **215** | 2026-11-02 19:57:39 → 2026-11-03 19:49:13 |
| 2.ª (paso 1.4) | 2026-11-03 19:57:57 | **214** | no medida |

Son observaciones puntuales: el número cambia cada minuto. Se analizaron en memoria, sin guardarlas. **No medido:** tamaño en bytes, latencia ni errores HTTP (429/5xx); se medirán en la fase F3 (paso 3.2, con el productor real) (**[P]** §4.1 pide documentarlos).

## 8. Decisiones pendientes

**Derivadas de requisitos [P] (a implementar):** versión por `(id, updated)`, filtro `earthquake` con motivo, cuarentena de coordenadas inválidas, nulo ≠ 0, UTC, no borrar al salir de la ventana.

**Recomendaciones [R] sin decidir:**
1. ¿Dónde se guardan los eventos excluidos (tabla propia o cuarentena)?
2. ¿Se guardan `status` y otros campos opcionales además del original?
3. Tratamiento de `mag = 0` y de profundidades negativas en las estadísticas.
4. Cómo presentar `magType` mezclados en las distribuciones.

## 9. Incidencia resuelta: archivos del frontend reformateados

**Qué ocurrió.** Al revisar `git status` aparecieron modificados `frontend/public/datos/paises.geojson`, `frontend/src/app/app.component.css`, `app.component.html` y `frontend/src/index.html`, con fecha posterior al commit F0.1 (20:43–20:45). La causa, confirmada por la persona estudiante, fue un formateo manual con VS Code (Alt + Shift + F) seguido de guardado. No fue este trabajo.

**Comprobación previa.** Las diferencias eran solo de formato: el JSON de `paises.geojson` era idéntico y los otros tres archivos eran idénticos sin contar espacios en blanco. `paises.geojson` había pasado de 838 726 a 2 659 430 bytes y su SHA-256 ya no coincidía con el documentado por el profesor.

**Resolución.** Con autorización expresa, se restauraron únicamente esos cuatro archivos desde `HEAD` (`git restore`). `git status` volvió a mostrar solo los cambios de documentación de la Fase 1.

**Comprobación del SHA-256 de `paises.geojson`.**

| Versión | SHA-256 | Coincide con el documentado (`6866c877…c977f`) |
|---|---|---|
| Blob en `HEAD` | `6866c877…c977f` | Sí |
| Archivo restaurado en disco, tal cual | `d2aec98b…bfe7c` | **No** (1 byte más: 838 727 frente a 838 726) |
| Archivo en disco sin el carácter CR | `6866c877…c977f` | Sí |

**Matiz.** La diferencia de 1 byte no es de contenido: es un único retorno de carro (CR) que Git añade al salto de línea final al restaurar, porque este equipo tiene `core.autocrlf=true`. El contenido es el de la copia del profesor, y su huella coincide cuando se compara el blob de Git o el archivo sin ese CR. Quien verifique la huella con `sha256sum` sobre el archivo en disco en este equipo obtendrá un valor distinto; para comparar con el documentado hay que usar `git show HEAD:frontend/public/datos/paises.geojson | sha256sum`. No se ha modificado ninguna configuración de Git.

**Para evitarlo:** no formatear con el editor los archivos entregados por el profesor.

## 10. Coherencia con los documentos del profesor

Revisado frente a `ENUNCIADO.md` (§4.1, §5, §6, §8), `CONTRATO-API.md`, `FAQ-ALUMNADO.md` (10, 12, 15, 16, 17) y `FUENTES-Y-LICENCIAS.md`: sin contradicciones. Precisiones sobre afirmaciones anteriores de la conversación: (a) el tratamiento de `mag = 0` es una **aplicación [R]** de la regla de la FAQ 16, no una regla literal; (b) la afirmación «`updated` posterior a `time`» es una **observación**, no una garantía de la fuente.

**Nomenclatura (actualizada el 3 de noviembre de 2026):** las fases son F0 a F7, los pasos se numeran `1.1`, `1.2`… y los commits se identifican por fase (`[F1]`, `[F2]`…), con un único commit al cerrar cada fase siempre que sea razonable. Esto sustituye a la ambigüedad anterior, en la que `F1.1` designaba a la vez un paso de trabajo y el commit de la fase. El commit de cierre de esta fase es `[F1]`; el commit histórico `[F0.1]` no se reescribe. Definición completa en `docs/HOJA-DE-RUTA.md`, secciones 3 y 5.
