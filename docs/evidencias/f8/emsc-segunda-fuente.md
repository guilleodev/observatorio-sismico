# F8 · Segunda fuente en vivo: EMSC (Centro Sismológico Euro-Mediterráneo)

**Fecha**: 2026-11-16 · **Estado**: implementada y verificada en el sistema local; **sin commitear y sin publicar en Netlify** (ver §8).

## 1. Motivo y alcance
El feed `all_day` de USGS es completo en EE. UU. pero escaso fuera (por debajo de M4,5). EMSC publica también la actividad europea y mediterránea de baja magnitud. Se añade como **fuente adicional**, sin cambiar el comportamiento existente: USGS sigue siendo la fuente principal y la única de la comparación con 2025. El profesor lo permitió con la condición expresa de **no duplicar** terremotos informados por ambas.

## 2. Fuente
`https://www.seismicportal.eu/fdsnws/event/1/query` (FDSN, `format=json`). Datos **CC BY 4.0**: se cita «EMSC» en el pie de la aplicación. Consulta **incremental** cada 60 s (`updatedafter` con un margen de 120 s); la primera vez pide las últimas 24 h. Magnitud mínima **2** (configurable con `EMSC_MAG_MIN`).

Volumen medido (24 h): M≥0 329 · M≥1 309 · **M≥2 235** · M≥2,5 184 · M≥3 117 · M≥4 26 eventos; 7 días con M≥2: 1 756. Una consulta incremental pesa ≈ 1 KB.

## 3. Arquitectura (aditiva)
| Pieza | Cambio |
|---|---|
| Productor | Una **tarea asyncio independiente** (`ingesta_emsc.py`), misma imagen y mismo servicio (siguen siendo 5 servicios). Conexión PostgreSQL y estado propios. **Nunca propaga errores** a la ingesta de USGS. Solo corre con `INGESTA_PUBLICAR=true`. |
| Kafka | Mismo topic `terremotos.live`; clave `emsc:<unid>`; `source = emsc-fdsn`. Sin topics ni consumidores nuevos. |
| Consumidor | Sin cambios de lógica: `emsc-fdsn` se admite en `SOURCES_ADMITIDOS`. Validación, versiones, cuarentena y `ON CONFLICT` son las mismas. Un evento que no es terremoto (`evtype` ≠ `ke`) se publica con su tipo y va a cuarentena. |
| PostgreSQL | `sql/005_fuente_emsc.sql` (idempotente): `live.consulta_fuente`, `live.estado_fuente`, funciones `live.distancia_km` y `live.emsc_duplicado`. |
| API | Parámetro opcional `fuente=usgs\|emsc`; `properties.source` en cada evento en vivo; `/api/salud` añade `fuentes.emsc` (`last_ingestion` y `stale` siguen siendo de USGS). |
| Frontend | Selector «Fuente», fila «Fuente» en la ficha, atribución en el pie, nota «solo USGS» en la comparación. Sin `fuente` en reproducción. |
| Netlify | La lista blanca de la función admite `fuente` en `/api/eventos` y `/api/estadisticas`. |

## 4. Regla de no duplicación
Mismo evento si **|Δt| ≤ 90 s y distancia ≤ 100 km**. Para EMSC con **M ≥ 4,5** se admite además **|Δt| ≤ 300 s, ≤ 300 km y |ΔM| ≤ 0,6** (siempre que la magnitud de USGS no sea nula): casos reales de sismos lejanos (p. ej. Kamchatka) con 210 s y ~120 km de diferencia entre agencias. **Gana USGS**; el de EMSC queda oculto.
- Se evalúa **al leer** (`NOT live.emsc_duplicado(...)` dentro de `Filtros.donde()`), no al guardar: el orden de llegada es irrelevante y no se reescribe nada. Los mismos filtros alimentan eventos, estadísticas y comparación, así que **las cifras coinciden**.
- Un evento de USGS **retirado** no cuenta como pareja.
- **Validación** con 7 días de datos reales de ambas fuentes: 21,8 % de los eventos de EMSC eran duplicados de USGS bajo esta regla.
- **Limitación honesta**: es una heurística espacio-temporal, no una identidad. Dos réplicas muy próximas en tiempo y espacio pueden fusionarse, y un mismo sismo con localizaciones muy distintas entre agencias puede no emparejarse. Se documenta, no se oculta.

## 5. Resultado en el sistema real (2026-11-16)
- Primer ciclo: 232 eventos publicados; segundo ciclo: incremental, 1 evento (614 bytes).
- `live.evento_actual`: `emsc-fdsn` 233 · `usgs-all-day` 1 850 · `usgs-fdsn-recuperacion` 529. **51 filas de EMSC ocultas como duplicado** (22 %, coherente con la validación).
- `GET /api/eventos` (ventana por defecto): 358 eventos, **0 ids repetidos** (178 USGS + 180 EMSC); `fuente=usgs` 178; `fuente=emsc` 180; `/api/estadisticas` total 358 (igual que eventos).
- Europa/Mediterráneo (lon −25..45, lat 34..72): 34 eventos, **todos de EMSC** (USGS aporta 0 ahí).
- `live.estado_fuente`: 7 consultas correctas, 0 errores. `/api/salud`: `status ok`, `fuentes.emsc.activa true`, edad de la última ingesta 26 s.
- `scripts/f6/invariantes.sh`: lag 0, offsets duplicados 0, reconciliación 0, 5 servicios `healthy`, sin bases ni contenedores temporales.

## 6. Pruebas
- Backend (PostgreSQL y Kafka reales en contenedores efímeros): **1 046 pasan** (964 antes; +82 nuevas: adaptador, ciclo/bucle, configuración, función de duplicados con límites exactos, API y filtro de fuente).
- Frontend: **528 pasan** (521 antes) y `ng build` compila. Nueva `tests/fuente-emsc.test.ts` (filtro, ficha, atribución, replay y lista blanca de la función).
- La versión publicada en Netlify se verificó después (sección 8); la estabilidad en 24 h está en la sección 9.

## 7. Cómo apagarla o revertirla
1. **Apagar sin tocar código**: `EMSC_ACTIVO=false` en `.env` y recrear el productor (`docker compose up -d --no-deps producer`). El flujo de USGS no cambia.
2. **Ocultar sus datos**: basta con apagarla; las filas `emsc-fdsn` pueden borrarse (`DELETE ... WHERE source='emsc-fdsn'`) sin afectar a USGS. La vista y las funciones SQL son inofensivas si se dejan.
3. **Revertir el código**: `git revert` del commit de F8. Todo lo anterior estaba commiteado.

## 8. Publicación y pendiente
- **Publicado en Netlify el 2026-11-16**: despliegue `6afb5599ce45e13699c428b8` (commit `bd6877b`). Respaldo inmediato: `6afa2ccf37d6b9bb717c44f4`.
- **Verificado**: la web carga (200); `config.json` de mismo origen, 60 s, sin clave ni URL del túnel; el bundle contiene la atribución «CC BY 4.0» y el selector «Todas (USGS + EMSC)»; la función acepta `fuente` en `/api/eventos` y `/api/estadisticas` (502 `api_no_disponible` sin túnel, no 400) y rechaza `fuente` en `/api/salud` y valores no permitidos (400).
- **Verificado con datos reales (2026-11-16, túnel abierto)**: `/api/salud` ok con `fuentes.emsc.activa = true` y edad 15 s; `/api/eventos` devuelve 373 eventos (197 USGS + 176 EMSC, 373 ids únicos), `fuente=usgs` 197, `fuente=emsc` 176; `/api/estadisticas?fuente=emsc` total 176 con la comparación solo de USGS; `fuente=otra` da 422; el túnel directo sin clave da 401. En el navegador integrado la web carga sin pedir clave (373 eventos dibujados, selector «Fuente» visible, atribución en el pie) y al aplicar «Fuente = EMSC» muestra 176 y el chip «fuente EMSC», sin errores de consola.
- **Móvil real**: la persona estudiante comprobó la web con EMSC en un móvil el 2026-11-17 y se ve correcta (sin captura). **Sin verificar**: otro navegador distinto de Chrome.
- **Capturas** (2026-11-17): `capturas/C-18-emsc-filtro-fuente-y-ficha.png` y `capturas/C-20-pie-atribucion-usgs-emsc.png`.
- El hueco de USGS que había pendiente (apagado nocturno del 2026-11-15) se recuperó el 2026-11-16 con confirmación expresa: 55 encontrados, 52 ya guardados, 3 publicados; `huecos pendientes = 0`.

## 9. Prueba de 24 h de funcionamiento continuo (2026-11-16 → 2026-11-17)
Equipo encendido sin suspensión (suspender e hibernar con corriente en «Nunca»), sin tocar el sistema durante la ventana ni cerrar Docker Desktop. Revisión de **solo lectura** el 2026-11-17 a las 19:45 UTC sobre las últimas 24 h (desde las 19:45 UTC del 16/11). Las pruebas de fallo de la sección 6 se hicieron antes de esa ventana.

| Comprobación | Resultado |
|---|---|
| Servicios | Los 5 `healthy`, 0 reinicios (`RestartCount`) |
| Errores en logs (25 h) | 0 en productor y 0 en consumidor (`ERROR`, `incompleta`, `timeout`, `traceback`) |
| Kafka | Lag 0 (offset 4528 = final 4528) |
| Integridad (`invariantes.sh`) | Reconciliación 0, offsets duplicados 0, `geo` incoherentes 0, huecos pendientes 0 |
| Continuidad de datos | Versiones guardadas en **las 25 franjas horarias** para USGS y para EMSC, ninguna hora vacía |
| `live.estado_fuente` (EMSC) | 1 545 consultas correctas; 4 errores, todos de la prueba de EMSC bloqueado (último 2026-11-16 18:40 UTC), ninguno en la ventana |
| EMSC y duplicados | 612 eventos: 138 ocultos como duplicado de USGS y 474 visibles; **0 visibles que cumplan la regla** frente a USGS |
| Histórico y exportados | 18 302 eventos; 0 fallos en `sha256sum -c` |
| Consumo (`docker stats`) | Productor 35 MiB, API 71 MiB, consumidor 40 MiB, Postgres 125 MiB, Kafka 1,05 GiB; base de datos 60 MB |

**Matices.** El mayor intervalo entre eventos guardados fue de 59 min (USGS) y 28 min (EMSC): es baja actividad sísmica, no un fallo de ingesta (lo prueban el lag 0, los 0 huecos y las consultas correctas). La comprobación de duplicados exactos de versiones falló por un nombre de columna y no se midió; no cambia la conclusión porque la clave primaria `(event_id, updated_at)` lo impide. **Alcance:** demuestra 24 h continuas en local con USGS y EMSC; no cubre la web pública, la cuota de ngrok bajo uso real ni una prueba con captura desde otro dispositivo (la persona estudiante la comprobó en un móvil el 2026-11-17, sin captura).
