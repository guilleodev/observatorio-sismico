# Regla geográfica de asignación de país (F4, T026)

Documento de referencia para la memoria y la defensa. Código: `backend/src/observatorio/geo/asignador.py`. Evidencias: `4.3-*.txt`.

## La regla

Entrada: la longitud y la latitud del epicentro (WGS84). **Nunca** el texto de `place`. Fuente: el catálogo Natural Earth entregado
(`frontend/public/datos/paises.geojson`, 177 entidades, escala 1:110 000 000), identificado por `ADM0_A3` y por la huella `sha256` del archivo.

| Situación | `country_id` | `geo_resultado` |
|---|---|---|
| Un solo polígono cubre el punto y el punto está estrictamente dentro | `ADM0_A3` de ese país | `interior` |
| Un solo polígono cubre el punto y el punto está **en su borde** (o vértice) | `ADM0_A3` de ese país | `frontera` |
| Más de un polígono cubre el punto (borde compartido, trifinio o solapamiento) | el **menor `ADM0_A3` en orden alfabético** | `varias` |
| Ningún polígono lo cubre (mar, costa simplificada, isla ausente) | **nulo** («Sin país asignado») | `sin_pais` |

- «Cubrir» incluye el borde (`covers`): un punto exactamente sobre una frontera pertenece a los dos países, y el desempate lo decide el orden alfabético.
- El orden alfabético es **determinista y sin significado geográfico ni político**: solo evita que el resultado dependa del orden del catálogo o de la
  ejecución. Por eso se guarda `geo_resultado = 'varias'`: permite medir y revisar estos casos.
- **Nunca** se asigna el país más cercano: un epicentro en el mar queda sin país aunque esté a un kilómetro de la costa (`enunciado §4.3`).
  «Sin país asignado» no es un error ni va a cuarentena: el evento permanece en el análisis.
- El catálogo se usa tal cual, sin reinterpretar fronteras: por ejemplo, el Sáhara Occidental queda repartido entre `MAR` y `SAH` según la línea de facto del catálogo.

## Geometrías inválidas (decisión aprobada en 4.2)

`USA` y `SDN` son inválidas en el catálogo (auto-intersección). Se reparan **solo en memoria** con `make_valid`; el archivo no se toca y cada arranque
registra las entidades reparadas. Medido: área idéntica y 0 desacuerdos en 400 000 puntos (`4.2-validez-geometrias.txt`).

## Lo que se ha comprobado (paso 4.3)

- Batería de 46 puntos (países, mar abierto y costa afuera, antimeridiano, polos, entidades especiales, islas ausentes): 46/46 con la expectativa vigente;
  3 expectativas iniciales se corrigieron tras analizarlas y ninguna era un error del asignador (`4.3-bateria.txt`).
- Los **7 536 vértices** del catálogo: 4 878 de un solo país → `frontera`; 2 658 compartidos → `varias` con el menor `ADM0_A3`; 1 trifinio
  (Sudán–Sudán del Sur–Etiopía) con un tercer país cuyo borde pasa por el punto sin tenerlo como vértice, resuelto correctamente.
- Los **290 polígonos** individuales (incluidas las partes de Fiyi, Rusia y la Antártida en ±180°): su punto interior se asigna a su país.
- 5 000 puntos aleatorios del globo: el índice espacial coincide con el recorrido secuencial de los 177 polígonos (0 diferencias); el 67 % es mar → sin país.
- Orden del catálogo irrelevante; coordenadas límite (±180, ±90) sin error; coordenadas imposibles (NaN, fuera de rango) rechazadas con un error explícito.
- Eventos nuevos, revisiones y asignación retroactiva dan el mismo resultado (`test_consistencia_geografica.py`).

## Eventos reales «sin país» (38 de 239; 15,9 %)

Todos explicados (`4.3-sin-pais-analisis.txt`): 32 en el mar o costa afuera, 4 en tierra o costa que el trazo 1:110 M no recoge y 2 junto a islas de Vanuatu que
el catálogo no trae. 0 errores de lógica. La proporción **no es un objetivo**: depende de cuánto mar y cuántas islas pequeñas caigan en el periodo observado.

## Límites conocidos (A-02)

- Escala 1:110 M: faltan islas pequeñas (Malta, Mauricio, Maldivas, Tonga, Bermudas, Tanna en Vanuatu, Taveuni en Fiyi, islas Vírgenes de EE. UU., islas del Canal)
  y la costa está simplificada (Puget Sound, Nome o Kodiak quedan a pocos kilómetros fuera del polígono). Esos epicentros salen «sin país» aunque en la realidad
  pertenezcan a un país. No se corrige acercándolos al más cercano: es una limitación de cobertura que se documenta.
- Las fronteras del catálogo son aproximadas: no se afirma precisión cartográfica. Un punto a unos pocos kilómetros de una frontera puede caer en el país vecino.
- Hay 3 astillas de solapamiento de ~1e-3 km² en el trifinio Sudán–Sudán del Sur–Etiopía; no son solapes políticos.
- El texto `place` cita la localidad de referencia, que puede estar en otro país que el epicentro (caso `us7000tw8p`: referencia en la India, epicentro en el polígono de China).

## Pregunta de defensa

«Un terremoto cae sobre la frontera entre dos países. ¿Qué país se le asigna y por qué esa regla?»
Respuesta esperada: el borde cuenta como pertenencia a ambos, y gana el menor `ADM0_A3` en orden alfabético; es una regla determinista, sin criterio político,
que además deja constancia (`geo_resultado = 'varias'`) para poder medir cuántos casos hay y reprocesarlos si cambia el catálogo (`geo_catalogo` guarda su huella).
