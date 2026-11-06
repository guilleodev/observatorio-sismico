"""Arranque seguro del consumidor (paso 4.2): sin catálogo válido y coherente con la base, NO se procesa ningún evento.

Un evento guardado con un país equivocado, o como «sin país» por no haber catálogo, sería un dato falso (constitución III). Por eso el
consumidor espera —sin consumir de Kafka ni declararse sano— hasta que el catálogo se pueda leer, sea válido y coincida con `geo.catalogo`
y `geo.pais`. Los mensajes esperan en el transporte mientras dure su retención (24 h).
"""

import asyncio
import logging

from observatorio.config import ConfigGeo
from observatorio.geo.asignador import Asignador
from observatorio.geo.catalogo import Catalogo, leer_catalogo

log = logging.getLogger("consumer.geo")
ESPERA_MAX_S = 30


class CatalogoNoCoincide(Exception):
    """El catálogo montado no coincide con la dimensión de la base (hay que ejecutar python -m observatorio.geo.catalogo)."""


async def verificar_dimension(conexion, catalogo: Catalogo) -> None:
    """Comprueba que la huella del archivo está en `geo.catalogo` y que todos sus `ADM0_A3` están en `geo.pais`."""
    cursor = await conexion.execute("SELECT 1 FROM geo.catalogo WHERE sha256 = %s", (catalogo.sha256,))
    if await cursor.fetchone() is None:
        raise CatalogoNoCoincide(
            f"la versión {catalogo.sha256[:12]}… del catálogo no está en geo.catalogo: ejecutar python -m observatorio.geo.catalogo")
    cursor = await conexion.execute("SELECT country_id FROM geo.pais")
    en_base = {fila[0] for fila in await cursor.fetchall()}
    faltan = sorted(set(catalogo.geometrias) - en_base)
    if faltan:
        raise CatalogoNoCoincide(f"{len(faltan)} países del catálogo no están en geo.pais (p. ej. {', '.join(faltan[:5])})")


async def preparar_asignador(conexion) -> Asignador:
    """Lee y valida el catálogo, construye el índice espacial y lo contrasta con la base. Lanza si algo no cuadra."""
    catalogo = leer_catalogo(ConfigGeo.desde_entorno().catalogo_path)
    asignador = Asignador(catalogo)
    await verificar_dimension(conexion, catalogo)
    return asignador


async def esperar_asignador(preparar, asegurar=None, dormir=asyncio.sleep) -> Asignador:
    """Reintenta `preparar` hasta que tenga éxito, sin devolver nunca un asignador a medias. Espera 1, 2, 4… hasta 30 s."""
    espera = 1
    while True:
        try:
            asignador = await preparar()
        except Exception as exc:  # cualquier fallo (archivo, geometría, base) impide procesar a ciegas
            log.error("Catálogo geográfico no utilizable (%s); el consumidor NO procesa eventos hasta tenerlo (reintento en %s s)", exc, espera)
            await dormir(espera)
            espera = min(espera * 2, ESPERA_MAX_S)
            if asegurar is not None:
                await asegurar()
            continue
        if asignador.reparadas:
            log.warning("Geometrías reparadas en memoria (catálogo sin modificar): %s", ", ".join(asignador.reparadas))
        log.info("Catálogo geográfico listo: versión %s", asignador.catalogo_sha256[:12])
        return asignador
