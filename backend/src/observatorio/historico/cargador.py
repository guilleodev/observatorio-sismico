"""Carga histórica de USGS por tramos (F4, paso 4.4; research R-006 a R-008). Lógica sin E/S de consola, probada con un servidor simulado.

Flujo por tramo (12 meses UTC de 2025): `count` -> si alcanza el límite se parte por la mitad (recursivo) -> si no, `query` -> clasificar con las reglas
de calidad del tiempo real -> asignar país -> guardar consulta + archivo comprimido + eventos + cuarentena en UNA transacción -> exportar el archivo.
Un tramo ya completo no se vuelve a pedir (se reutiliza su archivo), así que repetir o reanudar la carga no duplica ni pierde eventos.
"""

import gzip
import hashlib
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

from observatorio.config import ConfigHistorico
from observatorio.consumer.mensaje import clasificar_feature
from observatorio.consumer.repositorio import calcular_huella
from observatorio.historico.fdsn import ClienteFdsn, ErrorFdsn
from observatorio.historico.repositorio import EventoHistorico, RegistroCuarentena, RepositorioHistorico, canonico

log = logging.getLogger("historico")
SEGUNDOS_MINIMOS_PARA_PARTIR = 2  # un tramo de 1 s no se puede partir más: se registra el error en vez de recursar sin fin


class ErrorExportacion(Exception):
    """Un archivo exportado ya existe con otro contenido: nunca se sobrescribe."""


def tramos_mensuales(anio: int) -> list[tuple[datetime, datetime]]:
    """Los 12 meses UTC del año: [1 de mes 00:00, 1 del mes siguiente 00:00]."""
    meses = [datetime(anio, m, 1, tzinfo=timezone.utc) for m in range(1, 13)] + [datetime(anio + 1, 1, 1, tzinfo=timezone.utc)]
    return list(zip(meses[:-1], meses[1:]))


def filtros_de(config: ConfigHistorico) -> dict:
    return {"minmagnitude": config.mag_min, "eventtype": "earthquake", "ambito": "mundial"}


def nombre_archivo(inicio: datetime, fin: datetime, mag_min: float) -> str:
    f = "%Y%m%dT%H%M%SZ"
    return f"usgs-fdsn_{inicio.strftime(f)}_{fin.strftime(f)}_m{mag_min:g}.geojson.gz"


@dataclass
class Resumen:
    tramos_nuevos: int = 0
    tramos_reutilizados: int = 0
    tramos_subdivididos: int = 0
    tramos_con_error: int = 0
    errores: list[str] = field(default_factory=list)
    obtenidos: int = 0
    duplicados: int = 0
    fuera_de_tramo: int = 0
    eventos_nuevos: int = 0
    cuarentena_nueva: int = 0
    peticiones_http: int = 0
    archivos_exportados: int = 0
    asignaciones: int = 0
    asignacion_total_s: float = 0.0
    asignacion_max_ms: float = 0.0
    descarga_s: float = 0.0
    duracion_s: float = 0.0

    def como_dict(self) -> dict:
        d = dict(self.__dict__)
        d["asignacion_media_us"] = round(self.asignacion_total_s / self.asignaciones * 1e6, 1) if self.asignaciones else None
        for k in ("asignacion_total_s", "asignacion_max_ms", "descarga_s", "duracion_s"):
            d[k] = round(d[k], 3)
        return d


class Exportador:
    """Exporta cada archivo original a una carpeta local (R-007). Nunca sobrescribe un archivo distinto."""

    def __init__(self, directorio: Path | None):
        self.directorio = directorio

    def exportar(self, nombre: str, contenido_gz: bytes, sha256: str) -> bool:
        """True si escribió el archivo; False si ya estaba igual. Lanza ErrorExportacion si existe con otra huella."""
        if self.directorio is None:
            return False
        self.directorio.mkdir(parents=True, exist_ok=True)
        destino = self.directorio / nombre
        if destino.exists():
            if hashlib.sha256(destino.read_bytes()).hexdigest() != sha256:
                raise ErrorExportacion(f"{destino} ya existe con otro contenido: no se sobrescribe")
            return False
        temporal = destino.with_name(destino.name + ".parcial")
        temporal.write_bytes(contenido_gz)
        temporal.replace(destino)
        return True

    def manifiesto(self, entradas: list[tuple[str, str]]) -> None:
        """SHA256SUMS (formato sha256sum) con la huella de cada archivo; se regenera entero porque se deriva de la base."""
        if self.directorio is None:
            return
        self.directorio.mkdir(parents=True, exist_ok=True)
        (self.directorio / "SHA256SUMS").write_text("".join(f"{sha}  {nombre}\n" for nombre, sha in entradas), encoding="utf-8")


class Cargador:
    def __init__(self, repo: RepositorioHistorico, cliente: ClienteFdsn, asignador, config: ConfigHistorico, exportador: Exportador | None = None):
        self.repo = repo
        self.cliente = cliente
        self.asignador = asignador
        self.config = config
        self.exportador = exportador or Exportador(None)
        self.filtros = filtros_de(config)
        self.resumen = Resumen()

    # ------------------------------------------------------------------ entrada
    def cargar(self) -> Resumen:
        inicio = time.monotonic()
        for ini, fin in tramos_mensuales(self.config.anio):
            self._procesar(ini, fin, None)
        self._escribir_manifiesto()
        r = self.resumen
        r.peticiones_http = self.cliente.peticiones_http
        r.duracion_s = time.monotonic() - inicio
        return r

    # ------------------------------------------------------------------ un tramo
    def _procesar(self, inicio: datetime, fin: datetime, padre: int | None) -> str:
        fila = self.repo.buscar(inicio, fin, self.filtros)
        if fila is not None and fila.resultado in ("ok", "subdividido"):
            self.resumen.tramos_reutilizados += 1
            if fila.tiene_archivo:
                self._asegurar_exportacion(fila.id, inicio, fin)
            log.info("tramo %s..%s reutilizado (%s): 0 peticiones", inicio.date(), fin.date(), fila.resultado)
            return fila.resultado

        peticiones0 = self.cliente.peticiones_http
        url = self.cliente.url("query", inicio, fin, self.config.mag_min)
        try:
            esperado = self.cliente.contar(inicio, fin, self.config.mag_min)
        except ErrorFdsn as exc:
            return self._error(inicio, fin, padre, None, url, exc, peticiones0)
        if esperado >= self.config.limite:
            return self._subdividir(inicio, fin, padre, esperado, url, peticiones0)
        return self._cargar_tramo(inicio, fin, padre, esperado, url, peticiones0)

    def _error(self, inicio, fin, padre, esperado, url, exc, peticiones0) -> str:
        mensaje = str(exc)
        with self.repo.transaccion():
            cid = self.repo.abrir(inicio, fin, self.filtros, url, padre, esperado, "error", mensaje)
            self.repo.cerrar(cid, "error", error=mensaje, http_status=getattr(exc, "http_status", None),
                             intentos=getattr(exc, "intentos", None), peticiones=self.cliente.peticiones_http - peticiones0)
        self.resumen.tramos_con_error += 1
        self.resumen.errores.append(f"{inicio:%Y-%m-%dT%H:%M:%S}..{fin:%Y-%m-%dT%H:%M:%S}: {mensaje}")
        log.error("tramo %s..%s con error: %s", inicio, fin, mensaje)
        return "error"

    def _subdividir(self, inicio, fin, padre, esperado, url, peticiones0) -> str:
        if (fin - inicio).total_seconds() < SEGUNDOS_MINIMOS_PARA_PARTIR:
            return self._error(inicio, fin, padre, esperado, url,
                               ErrorFdsn(f"tramo de {(fin - inicio).total_seconds():g} s con {esperado} eventos (límite {self.config.limite}): no se puede subdividir más"),
                               peticiones0)
        pid = self.repo.abrir(inicio, fin, self.filtros, url, padre, esperado, "error", "subdivisión en curso")
        medio = inicio + timedelta(seconds=int((fin - inicio).total_seconds() // 2))
        log.info("tramo %s..%s: %s eventos >= límite %s: se parte en %s", inicio, fin, esperado, self.config.limite, medio)
        hijos = [self._procesar(inicio, medio, pid), self._procesar(medio, fin, pid)]
        if all(h in ("ok", "subdividido") for h in hijos):  # el padre solo se cierra cuando los hijos están completos
            self.repo.cerrar(pid, "subdividido", peticiones=self.cliente.peticiones_http - peticiones0)
            self.resumen.tramos_subdivididos += 1
            return "subdividido"
        self.repo.cerrar(pid, "error", error="hijos incompletos", peticiones=self.cliente.peticiones_http - peticiones0)
        return "error"

    def _cargar_tramo(self, inicio, fin, padre, esperado, url, peticiones0) -> str:
        if esperado == 0:  # tramo sin eventos: correcto; USGS no devolvería cuerpo (204), así que no hay archivo que guardar
            with self.repo.transaccion():
                cid = self.repo.abrir(inicio, fin, self.filtros, url, padre, 0, "ok", None)
                self.repo.cerrar(cid, "ok", obtenidos=0, peticiones=self.cliente.peticiones_http - peticiones0)
            self.resumen.tramos_nuevos += 1
            log.info("tramo %s..%s: 0 eventos (correcto)", inicio.date(), fin.date())
            return "ok"

        t0 = time.monotonic()
        try:
            descarga = self.cliente.descargar(inicio, fin, self.config.mag_min)
        except ErrorFdsn as exc:
            return self._error(inicio, fin, padre, esperado, url, exc, peticiones0)
        t_descarga = time.monotonic() - t0
        self.resumen.descarga_s += t_descarga

        t1 = time.monotonic()
        features = descarga.datos["features"]
        validos, cuarentena, fuera, duplicados = self._clasificar(features, inicio, fin)
        contenido_gz = gzip.compress(descarga.cuerpo, mtime=0)  # mtime fijo: misma huella si se repite
        sha = hashlib.sha256(contenido_gz).hexdigest()
        with self.repo.transaccion():
            cid = self.repo.abrir(inicio, fin, self.filtros, descarga.url, padre, esperado, "error", "en curso")
            self.repo.guardar_archivo(cid, contenido_gz, sha)
            existentes = self.repo.actualizados_existentes(list(validos))
            filas = []
            for event_id, (ft, _) in validos.items():
                if event_id in existentes:  # repetido de otro tramo: se conserva el de mayor `updated`
                    duplicados += 1
                    if ft.updated_ms <= existentes[event_id]:
                        continue
                filas.append(self._con_pais(ft, validos[event_id][1]))
            nuevos_eventos = sum(1 for f in filas if f.event_id not in existentes)
            self.repo.guardar_eventos(cid, filas)
            nueva_cuarentena = self.repo.guardar_cuarentena(cid, cuarentena)
            duplicados += len(cuarentena) - nueva_cuarentena
            if len(features) != nuevos_eventos + nueva_cuarentena + duplicados + fuera:  # cuadre del tramo: si falla, se revierte todo
                raise RuntimeError(f"el tramo {inicio}..{fin} no cuadra: {len(features)} obtenidos != {nuevos_eventos} nuevos + "
                                   f"{nueva_cuarentena} cuarentena + {duplicados} duplicados + {fuera} fuera de tramo")
            self.repo.cerrar(cid, "ok", http_status=descarga.http_status, intentos=descarga.intentos, obtenidos=len(features),
                             duplicados=duplicados, fuera=fuera, peticiones=self.cliente.peticiones_http - peticiones0)
        r = self.resumen
        r.tramos_nuevos += 1
        r.obtenidos += len(features)
        r.duplicados += duplicados
        r.fuera_de_tramo += fuera
        r.eventos_nuevos += nuevos_eventos
        r.cuarentena_nueva += nueva_cuarentena
        log.info("tramo %s..%s: esperado %s, obtenidos %s, nuevos %s, cuarentena %s, duplicados %s, fuera %s | descarga %.1f s, proceso %.1f s",
                 inicio.date(), fin.date(), esperado, len(features), nuevos_eventos, nueva_cuarentena, duplicados, fuera,
                 t_descarga, time.monotonic() - t1)
        self._exportar(inicio, fin, contenido_gz, sha)
        return "ok"

    # ------------------------------------------------------------------ calidad y país
    @staticmethod
    def _clasificar(features: list, inicio: datetime, fin: datetime):
        """-> (válidos por id con el de mayor `updated`, cuarentena, fuera_de_tramo, repetidos dentro de la respuesta)."""
        desde, hasta = int(inicio.timestamp() * 1000), int(fin.timestamp() * 1000)
        validos, cuarentena, fuera, duplicados = {}, [], 0, 0
        for f in features:
            if not isinstance(f, dict):
                motivo = "el feature no es un objeto JSON"
                cuarentena.append(RegistroCuarentena("invalido", motivo, None, None, canonico(f), calcular_huella("invalido", motivo, canonico(f))))
                continue
            c = clasificar_feature(f)
            if c.estado != "valido":
                cuarentena.append(RegistroCuarentena(c.estado, c.motivo, c.event_id, c.updated_ms, canonico(f),
                                                     calcular_huella(c.estado, c.motivo, c.base_huella)))
                continue
            ft = c.feature
            if not desde <= ft.event_time_ms < hasta:  # `endtime` es inclusivo en USGS: el evento de las 00:00 del mes siguiente es de ese mes
                fuera += 1
                continue
            previo = validos.get(ft.event_id)
            if previo is None:
                validos[ft.event_id] = (ft, f)
            else:
                duplicados += 1
                if ft.updated_ms > previo[0].updated_ms:
                    validos[ft.event_id] = (ft, f)
        return validos, cuarentena, fuera, duplicados

    def _con_pais(self, ft, raw: dict) -> EventoHistorico:
        t = time.perf_counter()
        a = self.asignador.asignar(ft.longitude, ft.latitude)  # misma regla que el tiempo real
        dt = time.perf_counter() - t
        r = self.resumen
        r.asignaciones += 1
        r.asignacion_total_s += dt
        r.asignacion_max_ms = max(r.asignacion_max_ms, dt * 1000)
        return EventoHistorico(ft.event_id, ft.event_time_ms, ft.updated_ms, ft.mag, ft.mag_type, ft.depth_km, ft.longitude, ft.latitude,
                               ft.place, a.country_id, a.resultado, a.catalogo, raw)

    # ------------------------------------------------------------------ exportación
    def _exportar(self, inicio, fin, contenido_gz, sha) -> None:
        try:
            if self.exportador.exportar(nombre_archivo(inicio, fin, self.config.mag_min), contenido_gz, sha):
                self.resumen.archivos_exportados += 1
        except (ErrorExportacion, OSError) as exc:  # la base ya guarda el original: se informa y la ejecución sigue
            self.resumen.errores.append(f"exportación {inicio:%Y-%m-%d}: {exc}")
            self.resumen.tramos_con_error += 1
            log.error("exportación fallida: %s", exc)

    def _asegurar_exportacion(self, consulta_id: int, inicio, fin) -> None:
        sha, contenido_gz = self.repo.archivo(consulta_id)
        self._exportar(inicio, fin, contenido_gz, sha)

    def _escribir_manifiesto(self) -> None:
        tramos = tramos_mensuales(self.config.anio)
        archivos = self.repo.huellas_de_archivos(tramos[0][0], tramos[-1][1], self.filtros)  # solo el año y los filtros de esta carga
        entradas = [(nombre_archivo(ini, fin, self.config.mag_min), sha) for _, ini, fin, sha in archivos]
        try:
            self.exportador.manifiesto(entradas)
        except OSError as exc:
            self.resumen.errores.append(f"manifiesto: {exc}")
            self.resumen.tramos_con_error += 1


def contar_tramos(cliente: ClienteFdsn, config: ConfigHistorico) -> list[tuple[datetime, datetime, int]]:
    """Modo de solo recuento (T037): `count` por mes y anual, sin descargar datos ni escribir en la base."""
    tramos = tramos_mensuales(config.anio)
    resultado = [(i, f, cliente.contar(i, f, config.mag_min)) for i, f in tramos]
    resultado.append((tramos[0][0], tramos[-1][1], cliente.contar(tramos[0][0], tramos[-1][1], config.mag_min)))
    return resultado
