# Contrato del mensaje de Kafka (F3, datos reales)

Cumple `ENUNCIADO.md` §5.4: clave = id del evento; el valor incluye `source`, `ingested_at`, `mode` y el evento original.
Sustituye al contrato del MVP (`specs/001-mvp-evento-sintetico/contracts/mensaje-kafka.md`, solo histórico).

- **Topic**: `terremotos.live` (configurable por `KAFKA_TOPIC`). La reproducción (F6) usará otro topic.
- **Clave**: `event.id` (UTF-8). **Valor**: JSON UTF-8.

```json
{
  "source": "usgs-all-day",
  "ingested_at": 1793113140000,
  "mode": "live",
  "event": { "type": "Feature", "id": "ci41572064", "geometry": {"type": "Point", "coordinates": [-115.18, 32.43, 15.59]},
             "properties": {"mag": 4.8, "magType": "mw", "place": "...", "time": 1793730451190, "updated": 1793735362280, "type": "earthquake"} }
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `source` | texto | `usgs-all-day`; el consumidor descarta cualquier otro valor |
| `ingested_at` | entero (ms Unix UTC) | Instante en que el productor terminó de recibir la respuesta de USGS |
| `mode` | texto | `live`; el consumidor descarta cualquier otro (`replay` tiene su propio topic) |
| `event` | Feature GeoJSON | Evento original de USGS, **sin transformar**; se publica con cualquier `type` |

**Quién publica**: el productor, una vez por versión nueva o con `updated` mayor que el máximo ya publicado del evento. **Reenvíos**: pueden repetirse tras una caída
entre la confirmación de Kafka y el marcado como publicada; el consumidor es idempotente.

**Reglas del consumidor**: clasifica en válido, excluido (`type != earthquake`) o inválido (R-005 de [research](../research.md)); válido →
historial y estado actual; excluido o inválido → cuarentena con motivo; en los tres casos el offset se confirma **solo después** de
completar la escritura.
