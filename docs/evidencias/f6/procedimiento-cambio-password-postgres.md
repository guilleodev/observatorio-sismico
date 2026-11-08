# Cambio de la contraseña de PostgreSQL sin perder datos (preparado, NO ejecutado)

Contexto: el escaneo de 6.6 (`6.6-secretos.txt`) detectó que la contraseña real de `.env` es el marcador público de `.env.example`. Riesgo actual bajo (PostgreSQL no publica puertos), pero debe sustituirse antes de publicar.
**Estado: EJECUTADO el 2026-11-08 con tu autorización expresa; resultado verificado en `6.6-cambio-password.txt`.**

## Qué hay que saber (y por qué el procedimiento es así)

1. `POSTGRES_PASSWORD` solo lo usa la imagen de PostgreSQL **la primera vez que crea el volumen**. Cambiarlo en `.env` **no** cambia la contraseña de la base ya creada: hay que hacerlo dentro de PostgreSQL con `ALTER USER`.
2. Los datos están en el volumen `observatorio_pgdata`, que no se toca: ni se borra ni se recrea. `ALTER USER` solo modifica el hash de la contraseña (SCRAM-SHA-256) y PostgreSQL no se reinicia.
3. `api`, `consumer` y `producer` leen `POSTGRES_PASSWORD` del entorno **al arrancar**. Hasta que se recreen siguen usando la antigua en sus conexiones abiertas (PostgreSQL no corta sesiones existentes al cambiar la contraseña, según su documentación; no lo medí aquí),
   pero cualquier conexión nueva con la antigua se rechazaría. Por eso el cambio y la recreación de los tres servicios van **seguidos, en segundos**.
4. Kafka no usa credenciales y no se toca. El consumidor retoma desde su offset confirmado; el productor repite su ciclo (el feed de 24 h cubre el hueco de unos segundos).
5. Si tras editar `.env` se ejecutara un `docker compose up -d` sin más, Compose **recrearía también `postgres`** (su entorno cambia). Por eso el script recrea los servicios uno a uno con `--no-deps`. Recrear `postgres` es opcional y se haría aparte (unos 10 s sin base de datos, datos intactos).
6. Las imágenes no se reconstruyen. Nota: `consumer` y `producer` hoy corren con una imagen anterior a la que lleva la etiqueta `latest` (que contiene el código de la API de 6.2); su código propio es el mismo, y el cambio de imagen es equivalente.

## Procedimiento (script: `scripts/f6/cambiar_password_postgres.sh`)

| Paso | Qué hace | Interrupción |
|---|---|---|
| 0 | Simulacro de solo lectura (por defecto): requisitos, huellas de datos y plan. **Ejecutado hoy: requisitos OK, nada cambiado.** | ninguna |
| 1 | Copia del `.env` actual fuera del repositorio (`~/.observatorio-backup/`, permisos 600) | ninguna |
| 2 | Genera 32 caracteres alfanuméricos aleatorios (no se imprimen; sin comillas ni símbolos que rompan SQL o `.env`) | ninguna |
| 3 | `ALTER USER` con la contraseña **por stdin**, por el socket local del contenedor (nunca en argumentos ni en el historial del shell) | ninguna |
| 4 | Sustituye la línea `POSTGRES_PASSWORD` del `.env` local (no versionado) | ninguna |
| 5 | Recrea `api`, `consumer` y `producer` de uno en uno (`up -d --no-deps`, sin `--build`) y espera `healthy` | ≈ 5–15 s cada uno |
| 6 | Verifica: cinco servicios `healthy`; la contraseña antigua **rechazada** y la nueva **aceptada** por la red de Compose; huellas de `historico`, `sintetico` y `replay` idénticas; `live` no pierde versiones | ninguna |
| 7 | Si algo falla: vuelta atrás automática (ALTER USER con la antigua, `.env` restaurado, servicios recreados) | ≈ 30 s |

Lanzarlo (solo con tu autorización expresa; sin la variable no hace nada):

```bash
CONFIRMO_CAMBIO_PASSWORD=si bash scripts/f6/cambiar_password_postgres.sh --ejecutar
```

**Recomendación de orden:** hacerlo junto con la recreación de `api` de T047 (CORS definitivo y `API_DOCS=false`), para reiniciar la API una sola vez; primero la contraseña (afecta a los tres servicios) y después, si la API hay que reconstruirla, `up -d --build --no-deps api`.

## Qué se probó (PostgreSQL 17.11 temporal, ya eliminado, sin tocar los servicios reales)

- El método efectivo es `scram-sha-256` para conexiones por red (`host all all all scram-sha-256`) y `password_encryption = scram-sha-256`.
- Antes del cambio la contraseña antigua entra por TCP; tras `ALTER USER` por stdin la **antigua es rechazada** y la **nueva aceptada**.
- La **vuelta atrás** funciona por el socket local (de confianza) aunque el acceso por red ya no acepte la antigua: se restauró la antigua y volvió a entrar.
- No probado (se dice de forma expresa): el flujo completo del script sobre los servicios reales (`--ejecutar`) —precisamente lo que requiere tu autorización— ni el comportamiento de sesiones abiertas.

## Qué NO queda en ningún sitio

La contraseña nueva no se imprime, no entra en `.env.example`, en las evidencias, en el historial de Git ni en este chat; solo en el `.env` local y en la copia de seguridad que está fuera del repositorio.
Después de ejecutarlo, `bash scripts/f6/escaneo_secretos.sh` pasará a buscar su valor real en el repositorio, `dist/` y el historial (esperado: 0 coincidencias) y el aviso del marcador desaparecerá.

## Revisión previa a la ejecución (2026-11-08)
- **Respaldo lógico hecho:** `bash scripts/f6/cambiar_password_postgres.sh --respaldo` (solo lectura sobre los datos) generó un `pg_dump -Fc` completo FUERA del repositorio (`~/.observatorio-backup/bd-<fecha>.dump`, permisos 600): 14,6 MB, 19 tablas con datos legibles con `pg_restore --list`, sha256 anotado en la salida. No contiene la contraseña del rol. `--ejecutar` hace este respaldo automáticamente antes de cambiar nada.
- **La contraseña no se expone:** viaja por stdin (`printf` es una orden interna del shell, no aparece en `ps`); el `.env` se reescribe leyéndola del entorno (`awk … ENVIRON`, no por argumento); los clientes de comprobación heredan `PGPASSWORD` del entorno (no en la línea de órdenes ni en `docker inspect`); nunca se imprime y no hay `set -x`. En el `.env` y en la copia de seguridad del `.env` solo hay: la nueva y la antigua (marcador público de `.env.example`).
- **No toca datos de terremotos:** el script solo ejecuta `ALTER USER`, `pg_dump` (lectura) y SELECT de comprobación; compara las huellas de `historico`, `sintetico` y `replay` antes y después y exige que `live` no pierda versiones.
- **Simulacro de solo lectura OK** (cinco servicios healthy, SCRAM-SHA-256, una sola línea `POSTGRES_PASSWORD`, rol con permiso para cambiarla).
- **Vuelta atrás:** (a) automática si falla cualquier paso (ALTER USER con la antigua + `.env` restaurado + servicios recreados); (b) manual: restaurar el `.env` de la copia y `ALTER USER` con la antigua por el socket local; (c) último recurso: restaurar el volcado en una base nueva (`pg_restore`), sin sobrescribir el volumen sin autorización.
