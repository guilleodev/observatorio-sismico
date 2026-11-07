"""Orden de la carga histórica (F4, paso 4.4): `python -m observatorio.historico.cargar [--solo-recuento]`.

Se ejecuta una vez con `docker compose run --rm --no-deps producer ...` (sin Kafka y sin servicio nuevo). Es idempotente y reanudable:
volver a ejecutarla reutiliza los tramos completos sin consultar a USGS. Código de salida 0 si todo cargó; 1 si algún tramo falló.
"""

import argparse
import json
import logging
import sys

import psycopg

from observatorio.config import ConfigError, ConfigGeo, ConfigHistorico, ConfigPostgres
from observatorio.geo.asignador import Asignador
from observatorio.geo.catalogo import leer_catalogo
from observatorio.historico.cargador import Cargador, Exportador, contar_tramos
from observatorio.historico.fdsn import ClienteFdsn
from observatorio.historico.repositorio import RepositorioHistorico

log = logging.getLogger("historico")


class CatalogoNoCoincide(Exception):
    """El catálogo montado no es el de la dimensión `geo` de la base."""


def verificar_dimension(repo: RepositorioHistorico, catalogo) -> None:
    """Sin catálogo coherente con la base no se carga nada: un país asignado con otro catálogo sería un dato falso."""
    if not repo.catalogo_registrado(catalogo.sha256):
        raise CatalogoNoCoincide(f"la versión {catalogo.sha256[:12]}… del catálogo no está en geo.catalogo: ejecutar python -m observatorio.geo.catalogo")
    faltan = sorted(set(catalogo.geometrias) - repo.paises_registrados())
    if faltan:
        raise CatalogoNoCoincide(f"{len(faltan)} países del catálogo no están en geo.pais (p. ej. {', '.join(faltan[:5])})")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Carga histórica de terremotos de USGS (aislada de live).")
    ap.add_argument("--solo-recuento", action="store_true", help="solo `count` por mes y anual: no descarga datos ni escribe en la base")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", stream=sys.stdout)
    try:
        config = ConfigHistorico.desde_entorno()
        cliente = ClienteFdsn(config.url_base, config.timeout_s, config.max_reintentos)
        if args.solo_recuento:
            for inicio, fin, n in contar_tramos(cliente, config):
                print(f"{inicio:%Y-%m-%dT%H:%M:%SZ} {fin:%Y-%m-%dT%H:%M:%SZ} {n}")
            print(f"peticiones_http={cliente.peticiones_http}")
            return 0
        catalogo = leer_catalogo(ConfigGeo.desde_entorno().catalogo_path)
        asignador = Asignador(catalogo)
        with psycopg.connect(ConfigPostgres.desde_entorno().conninfo(), autocommit=True) as conexion:
            repo = RepositorioHistorico(conexion)
            verificar_dimension(repo, catalogo)
            exportador = Exportador(config.exportacion if config.exportacion.is_dir() else None)
            if exportador.directorio is None:
                log.warning("la carpeta de exportación %s no existe (falta montarla con -v): los originales solo quedan en la base", config.exportacion)
            resumen = Cargador(repo, cliente, asignador, config, exportador).cargar()
    except (ConfigError, CatalogoNoCoincide) as exc:
        log.error("%s", exc)
        return 2
    print("RESUMEN " + json.dumps(resumen.como_dict(), ensure_ascii=False))
    return 0 if resumen.tramos_con_error == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
