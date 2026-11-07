"""Recuperación a demanda de huecos de ingesta (F4, paso 4.5; research R-009).

`python -m observatorio.recuperacion.recuperar --listar`            huecos pendientes
`python -m observatorio.recuperacion.recuperar [--hueco ID ...]`    recupera los pendientes (o los indicados)
`python -m observatorio.recuperacion.recuperar --simular`           cuenta qué publicaría, sin publicar ni cambiar nada

Consulta el catálogo de USGS (FDSN) en el intervalo del hueco SIN filtro de magnitud ni de tipo (igual que el feed) y publica en el MISMO
canal de Kafka que el productor, con `source = usgs-fdsn-recuperacion`: el consumidor aplica así las mismas reglas de versiones, calidad,
cuarentena y país. Se omite una versión solo si `(id, updated)` ya está GUARDADA (evento_version o cuarentena): un mensaje publicado que nunca
se guardó (p. ej. perdido por la retención de Kafka) se reenvía. Es idempotente: repetirla no cambia nada y una interrupción deja el hueco pendiente.
"""

import argparse
import asyncio
import json
import logging
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import psycopg

from observatorio.config import SOURCE_RECUPERACION, ConfigError, ConfigHistorico, ConfigKafka, ConfigPostgres
from observatorio.historico.fdsn import ClienteFdsn, ErrorFdsn
from observatorio.producer.ingesta import _clave_version, mensaje_kafka
from observatorio.producer.main import conectar_kafka
from observatorio.producer.repositorio import RepositorioProductor
from observatorio.tiempo import ahora_ms

log = logging.getLogger("recuperacion")
SEGUNDOS_MINIMOS_PARA_PARTIR = 2


@dataclass(frozen=True)
class Hueco:
    id: int
    inicio: datetime
    fin: datetime
    estado: str


@dataclass
class ResultadoHueco:
    hueco_id: int
    encontrados: int = 0
    ya_guardados: int = 0
    publicados: int = 0
    sin_guardar_tras_espera: int = 0
    recuperado: bool = False


class RepositorioRecuperacion:
    def __init__(self, conexion):
        self._c = conexion

    async def huecos(self, ids: list[int] | None = None) -> list[Hueco]:
        if ids:
            cur = await self._c.execute("SELECT id, inicio, fin, estado FROM live.hueco WHERE id = ANY(%s) ORDER BY inicio", (ids,))
        else:
            cur = await self._c.execute("SELECT id, inicio, fin, estado FROM live.hueco WHERE estado = 'pendiente' ORDER BY inicio")
        return [Hueco(*f) for f in await cur.fetchall()]

    async def guardadas(self, claves: list[tuple[str, int]]) -> set[tuple[str, int]]:
        """Subconjunto de `(event_id, updated_ms)` ya guardado como versión o en cuarentena."""
        ids = sorted({c[0] for c in claves})
        if not ids:
            return set()
        cur = await self._c.execute(
            "SELECT event_id, round(extract(epoch FROM updated_at) * 1000)::bigint FROM live.evento_version WHERE event_id = ANY(%s) "
            "UNION SELECT event_id, updated_ms FROM live.cuarentena WHERE event_id = ANY(%s) AND updated_ms IS NOT NULL", (ids, ids))
        guardadas = {(f[0], int(f[1])) for f in await cur.fetchall()}
        return guardadas & set(claves)

    async def marcar_recuperado(self, hueco_id: int, publicados: int) -> None:
        await self._c.execute("UPDATE live.hueco SET estado = 'recuperado', recuperado_at = now(), eventos_publicados = %s WHERE id = %s",
                              (publicados, hueco_id))


def ampliar_a_segundos(inicio: datetime, fin: datetime) -> tuple[datetime, datetime]:
    """USGS ignora los milisegundos de los parámetros: se consulta el intervalo ampliado a segundos enteros (nunca se pierde un evento)."""
    inicio = inicio.astimezone(timezone.utc).replace(microsecond=0)
    fin = fin.astimezone(timezone.utc)
    if fin.microsecond:
        fin = fin.replace(microsecond=0) + timedelta(seconds=1)
    return inicio, fin


def obtener_features(cliente: ClienteFdsn, inicio: datetime, fin: datetime, limite: int) -> list[dict]:
    """Todos los *Features* del intervalo, sin filtros, subdividiendo si el recuento alcanza el límite. Sin repetidos por (id, updated)."""
    esperado = cliente.contar(inicio, fin, None)
    if esperado == 0:
        return []
    if esperado >= limite:
        if (fin - inicio).total_seconds() < SEGUNDOS_MINIMOS_PARA_PARTIR:
            raise ErrorFdsn(f"intervalo de {(fin - inicio).total_seconds():g} s con {esperado} eventos (límite {limite}): no se puede subdividir más")
        medio = inicio + timedelta(seconds=int((fin - inicio).total_seconds() // 2))
        unidos: dict[tuple[str, int], dict] = {}
        for f in obtener_features(cliente, inicio, medio, limite) + obtener_features(cliente, medio, fin, limite):
            unidos.setdefault(_clave_version(f), f)  # el extremo compartido llega en los dos hijos
        return list(unidos.values())
    unicos: dict[tuple[str, int], dict] = {}
    for f in cliente.descargar(inicio, fin, None).datos["features"]:
        unicos.setdefault(_clave_version(f), f)
    return list(unicos.values())


async def recuperar_hueco(repo: RepositorioRecuperacion, repo_productor: RepositorioProductor, cliente: ClienteFdsn, publicador,
                          hueco: Hueco, limite: int, simular: bool = False, espera_guardado_s: float = 0, dormir=asyncio.sleep,
                          ahora=ahora_ms) -> ResultadoHueco:
    inicio, fin = ampliar_a_segundos(hueco.inicio, hueco.fin)
    features = await asyncio.to_thread(obtener_features, cliente, inicio, fin, limite)
    claves = [(_clave_version(f), f) for f in features]
    guardadas = await repo.guardadas([c for c, _ in claves])
    pendientes = [(c, f) for c, f in claves if c not in guardadas]
    resultado = ResultadoHueco(hueco.id, encontrados=len(features), ya_guardados=len(claves) - len(pendientes))
    if simular:
        resultado.publicados = len(pendientes)
        return resultado
    instante = ahora()
    for (event_id, updated_ms), feature in pendientes:  # si algo falla aquí el hueco sigue pendiente y se puede repetir
        valor = json.dumps(mensaje_kafka(feature, instante, SOURCE_RECUPERACION), ensure_ascii=False).encode("utf-8")
        particion, offset = await publicador(event_id.encode("utf-8"), valor)
        await repo_productor.marcar_publicada(event_id, updated_ms, particion, offset)  # solo tras la confirmación, como en el feed
        resultado.publicados += 1
    await repo.marcar_recuperado(hueco.id, resultado.publicados)
    resultado.recuperado = True
    # comprobación informativa: el consumidor guarda lo publicado (no cambia el estado del hueco, que ya está en Kafka)
    esperadas = [c for c, _ in pendientes]
    limite_t = time.monotonic() + espera_guardado_s
    faltan = len(esperadas)
    while esperadas:
        faltan = len(set(esperadas) - await repo.guardadas(esperadas))
        if faltan == 0 or time.monotonic() >= limite_t:
            break
        await dormir(1)
    resultado.sin_guardar_tras_espera = faltan if esperadas else 0
    return resultado


async def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Recuperación a demanda de huecos de ingesta (canal real, source usgs-fdsn-recuperacion).")
    ap.add_argument("--listar", action="store_true", help="lista los huecos pendientes y termina")
    ap.add_argument("--hueco", type=int, action="append", help="id de hueco a (re)procesar, aunque ya esté recuperado")
    ap.add_argument("--simular", action="store_true", help="cuenta lo que se publicaría, sin publicar ni modificar nada")
    ap.add_argument("--espera-s", type=float, default=60, help="segundos que se espera a que el consumidor guarde lo publicado")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", stream=sys.stdout)
    try:
        pg, config = ConfigPostgres.desde_entorno(), ConfigHistorico.desde_entorno()
        kafka = None if (args.listar or args.simular) else ConfigKafka.desde_entorno()
    except ConfigError as exc:
        log.error("%s", exc)
        return 2
    cliente = ClienteFdsn(config.url_base, config.timeout_s, config.max_reintentos)
    async with await psycopg.AsyncConnection.connect(pg.conninfo(), autocommit=True) as conexion:
        repo = RepositorioRecuperacion(conexion)
        huecos = await repo.huecos(args.hueco)
        if args.listar:
            print(f"huecos pendientes: {len(huecos)}")
            for h in huecos:
                print(f"  #{h.id} {h.inicio:%Y-%m-%dT%H:%M:%SZ} .. {h.fin:%Y-%m-%dT%H:%M:%SZ} ({(h.fin - h.inicio).total_seconds() / 3600:.1f} h) estado={h.estado}")
            return 0
        if not huecos:
            print("sin huecos pendientes: nada que recuperar")
            return 0
        productor, publicador = None, None
        if kafka is not None:
            productor = await conectar_kafka(kafka)

            async def publicador(clave: bytes, valor: bytes):
                meta = await productor.send_and_wait(kafka.topic, value=valor, key=clave)
                return meta.partition, meta.offset

        fallos = 0
        try:
            for h in huecos:
                try:
                    r = await recuperar_hueco(repo, RepositorioProductor(conexion), cliente, publicador, h, config.limite,
                                              simular=args.simular, espera_guardado_s=args.espera_s)
                except Exception as exc:  # el hueco queda pendiente: se puede repetir sin riesgo
                    log.error("hueco #%s NO recuperado (%s); sigue pendiente", h.id, exc)
                    fallos += 1
                    continue
                print(f"hueco #{h.id}: encontrados={r.encontrados} ya_guardados={r.ya_guardados} "
                      f"{'a_publicar' if args.simular else 'publicados'}={r.publicados} sin_guardar_tras_espera={r.sin_guardar_tras_espera} "
                      f"recuperado={r.recuperado} peticiones_http={cliente.peticiones_http}")
        finally:
            if productor is not None:
                await productor.stop()
    return 0 if fallos == 0 else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
