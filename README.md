# Observatorio de actividad sísmica

Proyecto académico de Sistemas de Big Data. Estado actual: **MVP de la Fase F2**, en el que un
**evento sintético** (claramente identificado, no es un terremoto real) recorre el circuito completo:
productor Python → Kafka → consumidor Python → PostgreSQL → API FastAPI → mapa Angular/Leaflet.

El MVP **no consulta USGS** ni usa ngrok o Netlify (fases posteriores). Documentación de trabajo:
[`docs/HOJA-DE-RUTA.md`](docs/HOJA-DE-RUTA.md) y [`specs/001-mvp-evento-sintetico/`](specs/001-mvp-evento-sintetico/).
Requisitos originales en [`docs/referencias/`](docs/referencias/).

## Requisitos

- Docker Desktop (Docker Compose v2) en marcha.
- Node.js y npm (solo para el mapa; las dependencias ya están en `frontend/package.json`).

## Arranque

1. Crear el archivo de entorno y cambiar la contraseña (el `.env` real no se versiona):

   ```bash
   cp .env.example .env
   ```

2. Levantar los cinco servicios (productor, Kafka, consumidor, PostgreSQL y API):

   ```bash
   docker compose up --build -d --wait
   docker compose ps
   ```

   Solo la API se publica en el equipo (`127.0.0.1:8000`); Kafka y PostgreSQL quedan internos.

3. Emitir el evento sintético (se ejecuta dentro del servicio `producer`):

   ```bash
   docker compose exec producer python -m observatorio.producer.emitir_sintetico
   ```

   Opciones: `--repeat N` (reenvía el mismo mensaje N veces), `--secuencia N` (otro evento:
   `synthetic-mvp-00N`) y `--minutos-atras M` (hora del evento; con más de 1440 queda fuera de la
   ventana de 24 h de la API).

4. Comprobar la API:

   ```bash
   curl http://127.0.0.1:8000/api/salud
   curl http://127.0.0.1:8000/api/eventos
   ```

5. Ver el mapa (en `frontend/`; `public/config.json` usa `mode: "api"`; con `mode: "demo"` vuelve el ejemplo estático):

   ```bash
   cd frontend
   npm start
   ```

   Abrir `http://localhost:4200`: debe verse la insignia «DATOS SINTÉTICOS» y un marcador sobre la
   península ibérica.

## Repetir la demostración

El reenvío del mismo id se ignora y no actualiza la hora del evento. Para ver un evento nuevo usar
`--secuencia N`. Empezar desde cero **borra los datos sintéticos y los mensajes del broker**
(`docker compose down -v`); no se hace sin querer.

## Verificación automatizada

`scripts/verificar-mvp.ps1` encadena las comprobaciones del `quickstart.md` y guarda la salida real en
`docs/evidencias/mvp/verificacion-final.txt`. Detiene y reinicia servicios, y **añade eventos
sintéticos 003 a 006**; no borra datos ni volúmenes.

```bash
powershell -File scripts/verificar-mvp.ps1
```

Pruebas unitarias y de integración (Python 3.13 en contenedor; ver `docs/evidencias/mvp/`).

## Parada

```bash
docker compose stop      # conserva contenedores y datos
docker compose down      # elimina contenedores y red; conserva el volumen de PostgreSQL (los mensajes de Kafka no tienen volumen y se pierden)
```

## Aviso

`mode = "synthetic"` es una excepción **temporal** del MVP: el contrato de la API del profesor solo
admite `live` y `replay`. Se retira o aísla como máximo al cerrar el paso 3.1 de la hoja de ruta.
