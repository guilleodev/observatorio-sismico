# Hueco de más de 24 horas sin ingesta (T041)

**Estado: procedimiento documentado, NO ejecutado.** Cubre el caso en que el productor (o todo el sistema) estuvo parado más de 24 h.

## Por qué hay pérdida

El feed `all_day.geojson` de USGS solo contiene las últimas 24 h. El productor consulta cada 60 s, así que mientras funciona no se pierde
nada. Si estuvo parado más de 24 h, los eventos ocurridos en ese intervalo y que ya salieron del feed **no se pueden recuperar con este
feed**: al reanudar, el productor solo ve las últimas 24 h y publica lo desconocido (FAQ 10).

Si el hueco es **menor de 24 h**, no hay pérdida de eventos nuevos: al reanudar, el feed aún contiene todo lo ocurrido durante la parada y
el productor lo publica como desconocido. Lo mismo para las revisiones (`updated` mayor que el máximo publicado).

## Procedimiento previsto (F4, catálogo histórico)

1. Medir el hueco: `SELECT max(iniciada_at) FROM live.consulta_extraccion WHERE resultado = 'ok'` (instante de la última consulta correcta
   antes de la parada) frente a la hora de reanudación. También lo refleja `last_ingestion` de la API.
2. Reanudar el productor con normalidad; el feed rellena las últimas 24 h.
3. Para el intervalo anterior, consultar el catálogo histórico de USGS (servicio FDSN `fdsnws/event/1`, usado en F4 para la carga
   histórica) con `starttime`/`endtime` acotados al hueco y publicar los eventos en el mismo topic con el mismo contrato
   (`mode: "live"`, `source: "usgs-all-day"` o la fuente que defina F4). La idempotencia (`event_id`, `updated`) impide duplicados con lo
   que el feed ya aportó.
4. Comprobar con la consulta de reconciliación (`quickstart.md`) y el recuento de eventos del intervalo.

Este procedimiento no se implementa en F3: queda para F4.

## Limitaciones conocidas (FR-022)

- El sistema **no distingue** un evento que «salió de la ventana de 24 h» de uno que USGS ha **eliminado o fusionado**: en ambos casos
  deja de aparecer en el feed. Los eventos eliminados por USGS (por ejemplo, duplicados fusionados) permanecen en `evento_actual` y
  `evento_version` con su última versión conocida; no se detectan ni se retiran.
- Las reclasificaciones a no sísmico que **sí** llegan en el feed (`type` distinto de `earthquake`) se tratan con `retirado` (decisión D2).
- La API solo muestra los eventos de las últimas 24 h (`NOT retirado`); lo anterior queda almacenado, no visible.

## Pérdida en Kafka de mensajes ya publicados (procedimiento manual, revisión T048)

`version_publicada` es una promesa: el productor omite toda versión con `updated` menor o igual que el máximo publicado. Si Kafka perdiera
mensajes publicados y aún sin consumir (consumidor parado más de 24 h con la retención de 24 h, o broker recreado sin volumen), el
productor no los reenviaría aunque el feed siga teniéndolos. Detección: la consulta de reconciliación de `quickstart.md` (devuelve
filas). Si el hueco es **menor de 24 h**, con autorización expresa se pueden borrar de `live.version_publicada` solo las filas que
devuelve esa consulta y el productor las republica desde el feed en el ciclo siguiente (idempotente: `evento_version` ignora las
repetidas). Si es mayor de 24 h, catálogo histórico (F4). No es automático ni forma parte de F3.
