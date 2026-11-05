# Observatorio de actividad sísmica

Proyecto académico de Sistemas de Big Data. Arquitectura: productor Python → Apache Kafka → consumidor Python →
PostgreSQL → API FastAPI → mapa Angular/Leaflet, en cinco servicios de Docker Compose.

**Estado:** fase F3 en curso. El MVP de la fase F2 (un evento sintético que recorría todo el circuito) está
**retirado del sistema** (paso 3.1) y se conserva en Git (commit `0a56f65`), en `docs/evidencias/mvp/` y en el esquema
archivado `sintetico` de PostgreSQL, que ningún componente lee. El servicio `producer` consulta ya el feed de USGS cada 60 s **en modo seco**
(`INGESTA_PUBLICAR=false`): registra las consultas y conserva la respuesta original en PostgreSQL, pero no publica en Kafka hasta que el
consumidor definitivo esté listo (pasos 3.3–3.5); mientras tanto la API devuelve `features: []` con `mode: "live"`.

Documentación de trabajo: [`docs/HOJA-DE-RUTA.md`](docs/HOJA-DE-RUTA.md), [`specs/`](specs/) y la constitución del
proyecto. Requisitos originales en [`docs/referencias/`](docs/referencias/).

## Requisitos

- Docker Desktop (Docker Compose v2) en marcha.
- Node.js y npm (solo para el mapa).

## Arranque

1. Crear el archivo de entorno y cambiar la contraseña (el `.env` real no se versiona):

   ```bash
   cp .env.example .env
   ```

2. Levantar los cinco servicios:

   ```bash
   docker compose up --build -d --wait
   docker compose ps
   ```

   Solo la API se publica en el equipo (`127.0.0.1:8000`); Kafka y PostgreSQL quedan internos.

3. Si el volumen de PostgreSQL ya existía, aplicar a mano los esquemas `001_esquema_live.sql` y `002_esquema_f3.sql` (los scripts de `sql/` solo
   se ejecutan al crear el volumen; el comando no borra nada):

   ```bash
   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/001_esquema_live.sql -f /docker-entrypoint-initdb.d/002_esquema_f3.sql'
   ```

4. Comprobar la API:

   ```bash
   curl http://127.0.0.1:8000/api/salud
   curl http://127.0.0.1:8000/api/eventos
   ```

5. Ver el mapa (`frontend/public/config.json`: `mode: "api"`; con `mode: "demo"` se ve el ejemplo estático):

   ```bash
   cd frontend
   npm start
   ```

   Abrir `http://localhost:4200`.

## Datos y modos

- La API y el consumidor solo admiten los modos del contrato del profesor: `live` y `replay`. El consumidor procesa solo
  `live`; cualquier otro mensaje se descarta con motivo en el registro. La reproducción (`replay`) llegará en F6 con su
  propio topic y esquema.
- Los datos definitivos viven en el esquema `live` (`sql/001_esquema_live.sql`, estructura provisional hasta el paso 3.3).
- `sql/mvp/` y `scripts/mvp/` son material histórico del MVP: no se ejecutan ni se mantienen.

## Pruebas

Las pruebas están en `backend/tests/unit/` (Python 3.13). Las de PostgreSQL se ejecutan solo si existe `POSTGRES_HOST` y
corren en transacciones que se revierten: no dejan datos en las tablas definitivas. Resultados en `docs/evidencias/`.

## Parada

```bash
docker compose stop      # conserva contenedores y datos
docker compose down      # elimina contenedores y red; conserva el volumen de PostgreSQL (los mensajes de Kafka no tienen volumen y se pierden)
```
