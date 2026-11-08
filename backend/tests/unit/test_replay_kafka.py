"""F6, T007: integración con KAFKA real y PostgreSQL temporal. Topic y grupo TEMPORALES (`test-f6-…`), nunca `terremotos.live`/`terremotos.replay`.

Se omite sin `KAFKA_BOOTSTRAP_SERVERS` y `POSTGRES_HOST`. Tras ejecutarla, `scripts/f6/limpiar_temporales_kafka.sh` elimina SOLO los topics y grupos con el prefijo `test-f6-`.
"""

import asyncio
import os
import uuid

import psycopg
import pytest
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

from fixtures.base_replay import base_temporal_replay, hay_entorno
from fixtures.geo import escribir_catalogo
from fixtures.replay_datos import seleccion_ficticia
from observatorio.config import ConfigReplay
from observatorio.consumer.destino import DESTINO_REPLAY
from observatorio.consumer.main import consumir_hasta_inactividad, procesar_con_reintentos
from observatorio.consumer.repositorio import RepositorioEventos
from observatorio.geo.asignador import Asignador
from observatorio.geo.catalogo import leer_catalogo
from observatorio.replay import casos
from observatorio.replay.reproducir import publicar

pytestmark = pytest.mark.skipif(not (os.environ.get("KAFKA_BOOTSTRAP_SERVERS") and hay_entorno()), reason="sin Kafka o sin PostgreSQL")
RUN = "r-kafka-prueba"


def test_publicar_y_consumir_por_kafka_real_da_35_37_1(tmp_path):
    sufijo = uuid.uuid4().hex[:10]
    topic, grupo = f"test-f6-{sufijo}", f"test-f6-grupo-{sufijo}"
    bootstrap = os.environ["KAFKA_BOOTSTRAP_SERVERS"]
    cfg = ConfigReplay(topic=topic, grupo=grupo, eventos=30, intervalo_s=0.01, espera_final_s=4, espera_max_s=60)
    catalogo = leer_catalogo(escribir_catalogo(tmp_path / "juguete.geojson"))
    secuencia = casos.construir_secuencia(seleccion_ficticia(30))

    async def interior(info):
        productor = AIOKafkaProducer(bootstrap_servers=bootstrap)
        await productor.start()
        try:
            enviados = await publicar(productor, topic, secuencia, RUN, velocidad=1200.0, intervalo_s=cfg.intervalo_s)
        finally:
            await productor.stop()
        assert enviados == 39
        async with await psycopg.AsyncConnection.connect(info, autocommit=True) as conn:
            await conn.execute("INSERT INTO geo.catalogo (sha256, archivo, entidades) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                               (catalogo.sha256, catalogo.archivo, len(catalogo.paises)))
            repo = RepositorioEventos(conn, Asignador(catalogo), destino=DESTINO_REPLAY)
            consumidor = AIOKafkaConsumer(topic, bootstrap_servers=bootstrap, group_id=grupo, enable_auto_commit=False, auto_offset_reset="earliest")
            await consumidor.start()
            try:
                async def procesar(registro):
                    return await procesar_con_reintentos(consumidor, registro, lambda: repo, _nada)

                n = await consumir_hasta_inactividad(consumidor, procesar, cfg)
            finally:
                await consumidor.stop()
        return n

    async def _nada():
        return None

    with base_temporal_replay("obs_f6_kafka") as info:
        with psycopg.connect(info, autocommit=True) as c:
            c.execute("INSERT INTO replay.ejecucion (run_id, tamano, mensajes, criterio, intervalo_s, velocidad) VALUES (%s, 30, 39, 'prueba', 0.01, 1200)", (RUN,))
        assert asyncio.run(interior(info)) == 39
        with psycopg.connect(info, autocommit=True) as c:
            q = lambda sql: c.execute(sql).fetchone()[0]  # noqa: E731
            assert (q("SELECT count(*) FROM replay.evento_actual"), q("SELECT count(*) FROM replay.evento_version"), q("SELECT count(*) FROM replay.cuarentena")) == (35, 37, 1)
            assert q("SELECT count(*) FROM live.evento_actual") == 0
            # los offsets de Kafka quedaron guardados en las filas (se confirman DESPUÉS de escribir)
            assert q("SELECT count(DISTINCT kafka_offset) FROM replay.evento_version") == 37
