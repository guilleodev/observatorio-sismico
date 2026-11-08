# Contrato de la API: cambios de F5

Base: `docs/referencias/CONTRATO-API.md` (prevalece) y `specs/003-geografia-historico/contracts/api-f4.md`. Los cambios son **aditivos**: los campos que ya devolvían
`/api/eventos` y `/api/salud` conservan nombre y significado; solo se añaden parámetros opcionales y campos nuevos. Como `test_api_eventos.py` y `test_last_ingestion.py`
comparan los diccionarios `metadata` y `/api/salud` por igualdad exacta, **esas pruebas y sus dobles `RepoFalso` se actualizan** (T006, T040), con la justificación de que el contrato crece.
Fechas en milisegundos Unix UTC; `null` nunca NaN/Infinity. Solo `GET` y `OPTIONS`. Errores: `{ "error": "<código>", "detail": "<texto>" }` (422 parámetros, 503 base de datos).

## Parámetros comunes (eventos y estadísticas, misma semántica)

| Parámetro | Valor | Regla |
|---|---|---|
| `start` | ISO 8601 | inclusivo; sin zona = UTC; un `+` sin codificar llega como espacio y es 422; con solo `end`, `start = end − 24 h`; sin ambos, `generated − 24 h` |
| `end` | ISO 8601 | exclusivo; por defecto `generated`; `start ≥ end` → 422 |
| `min_mag` | número finito | `mag ≥ min_mag`; la magnitud nula no cumple y se cuenta aparte; sin parámetro, los nulos se incluyen |
| `country_id` | `ADM0_A3` o `sin_pais` (sin distinguir mayúsculas) | `sin_pais` = `geo_resultado = 'sin_pais'`; código que no está en `geo.pais` → 422 |

Cada petición lee en una única transacción de solo lectura con instantánea consistente (`REPEATABLE READ`): `total`, `features` y los bloques salen del mismo estado.
Siempre: solo `live`, sin retirados, una versión vigente por evento, tiempo del **evento** en UTC.

## GET /api/eventos (añade)

Parámetros propios: `limit` (1 a `API_MAX_EVENTOS`, por defecto el máximo; **5 000**), `offset` (≥ 0). Orden: `time DESC, id ASC`.

`metadata` conserva `generated`, `last_ingestion`, `mode`, `count` (= `features` de esta página) y `truncated`, y añade:

| Campo | Significado |
|---|---|
| `total` | eventos que cumplen el filtro (todas las páginas) |
| `limit`, `offset` | los aplicados |
| `next_offset` | `offset` de la página siguiente, `null` si no hay |
| `sin_magnitud` | eventos de magnitud nula que cumplen el resto de filtros, **con o sin** `min_mag` (con `min_mag` están fuera de `features` y de `total`) |
| `period` | `{start, end}` **siempre resueltos** (ms UTC; `end = generated` si no se pidió); el cliente los reutiliza en todas las páginas |
| `coverage` | `{live_since}`: inicio de la cobertura real de `live`, definido como en F4: `min(ingested_at) − 24 h`; `null` si no hay eventos |

`truncated` = `offset + count < total`. Sin eventos: 200 con `features: []`. Un `limit` mayor que el máximo → 422.

## GET /api/estadisticas

Mismos parámetros comunes. Los bloques se calculan sobre **todos** los eventos del filtro, nunca sobre una página. Devuelve `por_pais`, `magnitud`, `profundidad` (paso 5.2), `por_hora` y `comparacion` (paso 5.3). No admite `limit` ni `offset` (422). La respuesta lleva `period` y `filters`; cada bloque, `unit` y `sin_valor`.

```json
{
  "generated": 1794063351298,
  "period": {"start": 1793976951298, "end": 1794063351298},
  "filters": {"min_mag": null, "country_id": "ESP"},
  "total": 12,
  "sin_magnitud": 0,
  "por_hora": {"unit": "events/hour UTC", "sin_valor": 0,
               "items": [{"hour": 1794060000000, "count": 3}]},
  "por_pais": {"unit": "events", "sin_valor": 0,
               "items": [{"country_id": "ESP", "country_name": "España", "count": 12}]},
  "magnitud": {"unit": "magnitude", "sin_valor": 0,
               "items": [{"from": 4.0, "to": 5.0, "count": 9}]},
  "profundidad": {"unit": "km", "sin_valor": 0,
                  "items": [{"from": null, "to": 10, "count": 7}]},
  "comparacion": { }
}
```

- `por_hora`: una casilla por hora UTC desde `floor(start)` hasta `end` (exclusivo), **con ceros**. Si la ventana necesita más de 744 casillas (`API_MAX_VENTANA_HORAS`, 31 días; una casilla por hora UTC que toca el periodo, así que 31 días exactos empezando a mitad de hora son 745) el bloque se devuelve como `{"unit": "events/hour UTC", "sin_valor": 0, "items": null, "motivo": "ventana_demasiado_amplia", "max_casillas": 744}` y **los demás bloques siguen siendo válidos** (200). `sin_valor` es 0 (todo evento tiene tiempo).
- `por_pais`: ordenado por `count DESC, country_id`; solo aparecen las categorías con recuento > 0 (un periodo vacío da `items: []`); la categoría «Sin país asignado» (`country_id: null`) cuenta **solo** `geo_resultado = 'sin_pais'`, igual que el filtro `sin_pais`; los eventos con `geo_resultado` nulo (aún sin asignar) van a `por_pais.sin_valor`. Con `country_id` filtrado aparece solo ese país (o la categoría «Sin país asignado» si el filtro es `sin_pais`).
- `magnitud`: intervalos fijos `[null,0)`, `[0,1)`, … `[8,null)` de ancho 1; `profundidad` (km): `[null,10)`, `[10,30)`, `[30,70)`, `[70,150)`, `[150,300)`, `[300,500)`, `[500,null)` (bordes **confirmados** en 5.2 con los datos reales: magnitud −0,10 a 6,10 y profundidad −2,61 a 567,22 km; ver `docs/evidencias/f5/5.2-estadisticas-real.txt`). Un extremo abierto es `null` en `from`/`to` (nunca Infinity). Los valores negativos van al primer intervalo; los intervalos vacíos se devuelven con 0.
- `sin_valor` de `magnitud`/`profundidad` cuenta los nulos incluidos en `total`; con `min_mag` es 0 en `magnitud` porque los nulos quedan fuera (se ven en `sin_magnitud`).
- Invariante comprobable: `Σ items.count + sin_valor = total` en cada bloque (salvo `por_hora` omitido).
- Fallo de base de datos o consulta que excede el tiempo máximo → 503 (nunca ceros).

### `comparacion`

```json
{
  "unit": "events", "comparacion_disponible": true,
  "ambito": "pais",  /* global | pais | sin_pais */
  "country_id": "ESP",
  "min_mag_solicitada": null, "min_mag_efectiva": 4.0, "min_mag_elevada": true,
  "reciente": {"source": "live", "count": 3, "sin_magnitud": 0, "desde": 1793976951298, "hasta": 1794063351298, "dias": 1.0},
  "historico": {"source": "historico", "periodo": {"desde": "2025-01-01", "hasta": "2026-01-01"}, "dias": 365, "total": 130,
                "media_diaria": 0.356, "mediana_diaria": 0.0, "esperado_para_ventana": 0.356},
  "variacion": 7.43,
  "variacion_definida": true,
  "periodo_reciente_incompleto": true,
  "motivos_incompleto": ["hueco_pendiente", "antes_de_cobertura", "hasta_ahora", "despues_de_ultima_lectura"]
}
```

- `reciente` cuenta solo eventos con `mag ≥ min_mag_efectiva` (puede ser menos que `total`, que usa el filtro solicitado); los de magnitud nula, aparte. `esperado_para_ventana = media_diaria × reciente.dias`.
- `variacion = (reciente.count − esperado) / esperado` como **fracción** (7.43 = +743 %); `variacion_definida: false` y `variacion: null` si el esperado es 0.
- Sin histórico cargado → `comparacion_disponible: false`, `historico: null`, `variacion: null`; nunca ceros inventados.
- `hasta_ahora` = `end > generated − API_MARGEN_PUBLICACION_S` (900 s, a confirmar); `antes_de_cobertura` = `start < coverage.live_since`; `hueco_pendiente` = hueco de `live.hueco` pendiente que intersecta la ventana (con `inicio < end` y `fin > start`); `despues_de_ultima_lectura` = `end` posterior a `last_ingestion` (o no hubo ninguna lectura correcta; regla de F4). Con `end` justo igual a la última lectura la ventana está completa.
- Mismo ámbito en ambos periodos; el histórico nunca se mezcla con `reciente`: cada cifra lleva su `source`.
- `unit` de `comparacion` es `events`; `variacion` es una fracción. Periodo histórico fijo `[2025-01-01, 2026-01-01)`, 365 días, solo `type = earthquake` y `mag ≥ min_mag_efectiva`.
- **Cautela de cobertura (medida en 5.3):** el feed en vivo `all_day` no garantiza cobertura completa por debajo de M4,5 fuera de EE. UU. (entre M4,0 y M4,5: 26,7 eventos/día en 2025 frente a 3,0 en los últimos 3 días del feed; M ≥ 4,5: 23,4 frente a 7,3). La variación a M ≥ 4 mezcla coberturas de detección distintas; el panel debe advertirlo (5.5) y puede sugerir `min_mag=4,5`.

## GET /api/salud (añade)

```json
{"status": "ok", "database": "ok", "last_ingestion": 1794063351298,
 "generated": 1794063360000, "ingestion_age_s": 9, "stale": false, "stale_after_s": 300,
 "gaps_pending": 0, "live_since": 1793897785875}
```

- `ingestion_age_s` = segundos enteros entre `generated` y `last_ingestion` (nunca negativo; `null` si no hay ninguna ingesta correcta). `stale` = `last_ingestion` nulo o `ingestion_age_s > INGESTA_OBSOLETA_S` (DF4), con el reloj de la API; en el umbral exacto no es obsoleta. `gaps_pending` = filas de `live.hueco` pendientes. `live_since` como en `coverage`.
- `generated` es el instante que el panel usa para calcular la ventana de sus filtros (no el reloj del navegador).
- Base caída → 503 (como hoy). Sin credenciales, rutas internas ni nombres de tabla.

## Lo que NO cambia

CORS (hoy solo el origen de desarrollo; el de Netlify se añade en F6–F7; `GET`/`OPTIONS`; cabecera `ngrok-skip-browser-warning`); `mode` solo `live`; ninguna ruta de escritura ni administración.
