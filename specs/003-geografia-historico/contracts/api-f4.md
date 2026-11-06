# Contrato de la API: cambios de F4

Base: `docs/referencias/CONTRATO-API.md` y `specs/002-ingesta-real-calidad/contracts/api-f3.md`. **No cambia ningún endpoint ni esquema**.

| Campo de `GET /api/eventos` | Antes (F3) | F4 |
|---|---|---|
| `properties.country_id` | siempre `null` | `ADM0_A3` del país asignado, o `null` («Sin país asignado») |
| `properties.country_name` | siempre `null` | `nombre_es` del catálogo, o `null` |

- Nulo = evento marítimo o sin cobertura del catálogo; nunca el país más cercano. La API no expone `geo_resultado` ni `geo_catalogo`.
- Sin filtros nuevos (`country_id`, `start`, `end`, `min_mag` son de F5). La API solo lee `live`; nunca `historico` ni `geo` salvo la dimensión de país.
