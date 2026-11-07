# Procedimiento: detectar, recuperar y verificar un hueco de ingesta (F4, paso 4.5)

Un **hueco** es un intervalo en el que el feed de USGS (`all_day`, que solo cubre las últimas 24 h) no pudo leerse: el productor estuvo parado o sin
red más de 24 h − margen. Los eventos de ese intervalo no están en Kafka ni en la base y el feed ya no los devuelve. La **detección es automática**;
la **recuperación es a demanda** (nunca automática: una carga grande e inesperada sin supervisión es un riesgo).

Todas las órdenes se ejecutan desde la raíz del repositorio. Ninguna borra datos ni recrea Kafka.

## 1. Detectar

El productor, al registrar una consulta correcta, compara con la anterior consulta correcta (`live.estado_ingesta.ultima_consulta_ok_at`). Si pasó **más de
24 h − `HUECO_MARGEN_S`** (6 h por defecto) anota en `live.hueco` el intervalo `(anterior − margen, ahora − 24 h + margen)` con una advertencia en el
registro (`HUECO de ingesta anotado…`). El margen se aplica por ambos lados porque algunos eventos se publican con retraso; el solape lo absorbe la
deduplicación. No se anota en modo seco (`INGESTA_PUBLICAR=false`), ni la primera consulta de la historia, ni dos veces el mismo intervalo.

```bash
docker compose run --rm --no-deps producer python -m observatorio.recuperacion.recuperar --listar
```

Muestra los huecos `pendiente` con su intervalo y duración. En funcionamiento normal: `huecos pendientes: 0`.

## 2. Recuperar

Primero, un ensayo que no cambia nada (cuenta lo que se publicaría):

```bash
docker compose run --rm --no-deps producer python -m observatorio.recuperacion.recuperar --simular
```

Después, la recuperación (consumidor y Kafka en marcha, lag 0):

```bash
docker compose run --rm --no-deps producer python -m observatorio.recuperacion.recuperar
```

Qué hace, por cada hueco pendiente:

1. Consulta el catálogo de USGS (`fdsnws/event/1`) en el intervalo ampliado a segundos enteros, **sin `eventtype` ni `minmagnitude`** (el feed no filtra), con
   subdivisión si el recuento alcanza 20 000.
2. Omite una versión solo si `(id, updated)` ya está **guardada** (`evento_version` o `cuarentena`). No se decide con `version_publicada`: un mensaje
   publicado que el consumidor nunca guardó (p. ej. perdido por la retención de 24 h de Kafka) se reenvía.
3. Publica el resto por el **mismo topic** con `source = usgs-fdsn-recuperacion` y `mode = live`. El consumidor aplica las mismas reglas que al feed
   (versiones por `updated`, cuarentena, país por punto-en-polígono). Cada confirmación se anota en `live.version_publicada`.
4. Marca el hueco `recuperado` (con `eventos_publicados`) y comprueba que el consumidor guardó lo publicado.

Se recupera por el canal real, y no escribiendo en `live`, para no saltarse el versionado, la cuarentena ni la asignación de país.

Repetir es seguro: `--hueco ID` reprocesa un hueco concreto aunque esté recuperado y publica 0 si todo está guardado. Si algo falla a mitad (Kafka, USGS),
el hueco sigue `pendiente` y se repite sin riesgo: el consumidor ignora las versiones ya guardadas y una versión antigua nunca sobrescribe una más reciente.

## 3. Verificar

```bash
scripts/f4/invariantes.sh despues-de-recuperar
```

Debe mostrar reconciliación 0, offsets duplicados 0, estado actual desfasado 0 y lag 0. Para ver el origen de lo recuperado:

```sql
SELECT source, count(*) FROM live.evento_version GROUP BY 1;                       -- usgs-fdsn-recuperacion = recuperado
SELECT id, inicio, fin, estado, eventos_publicados FROM live.hueco ORDER BY id;
```

## Límites

- **Solo hasta lo que conserve el catálogo.** Un hueco largo se recupera con lo que USGS devuelva ahora para ese intervalo (el catálogo se
  revisa y completa con el tiempo); lo que ya no esté allí no puede recuperarse.
- **Por tiempo del evento.** Se consulta por el `time` de los eventos del hueco. Una *revisión* hecha durante el hueco a un evento anterior a él no se
  ve hasta que el feed la vuelva a publicar.
- **Eliminaciones no reconciliadas.** Un evento que USGS borró durante el hueco no se retira de la base (FR-022 de F3, fuera de alcance).
- **Consumidor parado más de 24 h** con el productor funcionando: no hay hueco de ingesta (el productor sí consultó), pero los mensajes de Kafka se
  pierden con la retención de 24 h. Se recupera porque la omisión se decide contra lo **guardado**: ejecutar la recuperación sobre ese intervalo
  (`INSERT` manual del hueco en `live.hueco`, solo si fuera necesario) reenvía lo que nunca se guardó.
- **Kafka caído con USGS accesible:** la consulta a USGS es correcta aunque no se publique, así que el hueco **no se detecta**; la reconciliación de F3
  (publicadas frente a guardadas) y el lag lo revelan, y el productor reenvía lo no confirmado en el ciclo siguiente.
- **Margen:** `HUECO_MARGEN_S` (6 h). Con un margen mayor se recupera más solape (más trabajo, mismo resultado); con 0 no hay protección frente a retrasos.
- **No hay `/api/salud`** con el estado de los huecos hasta F5.
- **Prueba:** el catálogo se simuló (ver `4.5-recuperacion.txt`); la recuperación contra USGS real solo se ejecutará ante un hueco real.
