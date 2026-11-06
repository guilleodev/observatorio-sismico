# Contrato del mensaje de Kafka: cambios de F4

Base: [`specs/002-ingesta-real-calidad/contracts/mensaje-kafka.md`](../../002-ingesta-real-calidad/contracts/mensaje-kafka.md) (no se repite). **Único cambio** (D4, requiere aprobación):

| Campo | F3 | F4 |
|---|---|---|
| `source` | `usgs-all-day` (el consumidor descarta cualquier otro) | `usgs-all-day` **o** `usgs-fdsn-recuperacion` |

- `usgs-fdsn-recuperacion` solo lo publica la orden de recuperación de huecos; el evento es un *Feature* del catálogo (`fdsnws/event/1`), con `mode = live`.
- Misma clave (`event.id`), mismo topic y mismas reglas (versiones, calidad, cuarentena, idempotencia). El `source` se conserva en `evento_version` y `evento_actual`.
- El histórico de 2025 **no** viaja por Kafka (D3). Cualquier otro `source` o `mode` se sigue descartando con motivo.
- El consumidor añade el país al estado actual; el mensaje no cambia (el original no se transforma).
