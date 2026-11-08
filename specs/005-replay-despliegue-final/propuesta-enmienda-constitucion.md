# Enmienda de la constitución v1.0.4 (DG10) — APROBADA (opción A) y APLICADA el 2026-11-08

**Fecha**: 2026-11-08 | **Constitución anterior**: v1.0.3 | **Vigente**: v1.0.4 (PATCH: aclaración, no cambia ni elimina ningún principio) | **Estado**: aprobada por la persona estudiante (opción A) y aplicada en `.specify/memory/constitution.md`

## Comprobación de compatibilidad

DG10 fue aprobada «únicamente en `replay.*`, identificada como sintética y sin mezclar con `live` ni `historico`». Se contrasta con la constitución:

| Texto vigente | Compatibilidad con los seis casos controlados |
|---|---|
| **Principio III** — los datos de replay y los sintéticos «MUST mantenerse separados (topic, tablas o esquema, y etiqueta visible)»; todo dato sintético «MUST estar identificado como tal y MUST NOT mezclarse con el análisis de sismicidad real» | **Compatible.** Esquema y topic propios, `caso` en la base, ids `replay-ctl-…`, distintivo «caso controlado / sintético» en el panel, y ninguna estadística de sismicidad real los lee (`mode=live` solo lee `live`). |
| **Principio IV** — idempotencia y versionado | **Compatible**: los casos ejercitan precisamente esas reglas por el mismo procesamiento. |
| **Principio V** — ejecutar y registrar, no suponer | **Compatible**: son la forma de ejecutar las filas de duplicado, revisión, antigua, nula, inválida y marítimo de §11 sin ensuciar `live`. |
| **Restricciones técnicas, «Valores de `mode`»** — «Un dato de prueba MUST NOT insertarse en las tablas definitivas (las pruebas usan transacciones que se revierten)» | **Ambigua.** Escrita al retirar el modo `synthetic` del MVP, está pensada para `live`, `geo` e `historico`, pero `replay.*` es un esquema permanente (migración versionada) y los casos controlados son datos de demostración insertados de verdad. Una lectura literal los prohibiría. |

**Conclusión**: no vulnera ningún principio, pero la última cláusula, leída al pie de la letra, choca con DG10 y con `ENUNCIADO.md` §11 («Incluye casos controlados de duplicado y revisión»). Por claridad y para no dejar una desviación implícita se propone una enmienda mínima. Las pruebas unitarias y de integración **siguen usando** transacciones que se revierten o bases temporales; la enmienda solo afecta a los casos del replay.

## Cambio mínimo propuesto (una frase añadida; el resto del texto no cambia)

En **Restricciones técnicas y de datos → «Valores de `mode`»**, tras «…(las pruebas usan transacciones que se revierten).», añadir:

> Excepción acotada: el esquema `replay` puede contener los casos controlados que exige el enunciado (§11), con ids `replay-ctl-…`, la columna `caso` y el distintivo visible «caso controlado / sintético»; nunca en `live`, `geo` ni `historico`, ni en el análisis de sismicidad real.

Y actualizar el pie: **Versión**: 1.0.4 | **Ratificada**: 2026-11-03 | **Última enmienda**: 2026-11-08 (PATCH: aclaración de los casos controlados del replay).

## Procedimiento (Gobierno de la constitución)

Toda enmienda se documenta, la aprueba la persona estudiante y actualiza la versión. **Resultado: la persona estudiante aprobó la opción A el 2026-11-08 y se aplicó únicamente la frase anterior (más la versión); las demás restricciones no cambian.** Opciones que se presentaron:

| Opción | Efecto |
|---|---|
| **A. Aprobar la enmienda (recomendada)** | Se aplica el cambio, se sube a v1.0.4 y DG10 queda plenamente conforme. |
| **B. No enmendar y asumir la interpretación** | Se documenta en el plan que la cláusula se refiere a `live`, `geo` e `historico`; queda una desviación justificada por escrito (el Gobierno lo permite) sin cambiar la constitución. |
| **C. Limitar el replay** | Solo duplicado y revisión (lo que exige §11 de forma expresa); el resto de casos se prueba en bases temporales. Se reduce el oráculo a 30 + 4 mensajes (duplicado 2, revisión 2). |
