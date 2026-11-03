# Contrato del mensaje de Kafka (MVP)

Cumple `ENUNCIADO.md` §5.4: clave = identificador del evento; el valor incluye `source`,
`ingested_at`, `mode` y el evento original.

- **Topic**: `terremotos.sintetico` (propio del MVP; los datos reales usarán otro topic).
- **Clave**: `event.id` (UTF-8). Mantiene el orden por evento dentro de la partición.
- **Valor**: JSON UTF-8.

```json
{
  "source": "synthetic-generator",
  "ingested_at": 1793113140000,
  "mode": "synthetic",
  "event": {
    "type": "Feature",
    "id": "synthetic-mvp-001",
    "geometry": { "type": "Point", "coordinates": [-3.7, 40.4, 12] },
    "properties": {
      "type": "earthquake",
      "mag": 3.2,
      "magType": "ml",
      "place": "SINTÉTICO: ejemplo de prueba",
      "time": 1793112540000,
      "updated": 1793112540000
    }
  }
}
```

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `source` | texto | sí | `synthetic-generator` en el MVP |
| `ingested_at` | entero (ms Unix UTC) | sí | Instante de producción del mensaje |
| `mode` | texto | sí | `synthetic` solo en el topic del MVP (excepción temporal, research R-001). El contrato admite `live` y `replay`; los topics de datos reales y de reproducción nunca llevarán `synthetic` |
| `event` | Feature GeoJSON | sí | Mismo formato que el feed de USGS |

**Reglas del consumidor en el MVP**: acepta solo `mode = "synthetic"` e id con prefijo
`synthetic-`; cualquier otro mensaje se registra y se descarta de forma visible (la cuarentena
duradera es de F3). La confirmación del offset sigue a la escritura confirmada.

*Los valores de coordenadas y de tiempo del ejemplo son ilustrativos.*
