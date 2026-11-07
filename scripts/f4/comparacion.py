"""Comparación entre ventanas equivalentes (F4, paso 4.6, T055): ejecuta las consultas de sql/consultas/comparacion.sql y calcula la variación.

NO es un módulo de producción (F5 lo convertirá en API): lo usan la prueba test_comparacion.py y las evidencias 4.6. Solo lectura.
"""

import os
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

MAG_MINIMA = 4.0


def _ruta_defecto() -> Path:
    """sql/consultas/comparacion.sql del repositorio, o de SQL_DIR (en contenedor se monta en /sql)."""
    aqui = Path(__file__).resolve()
    candidatas = [Path(os.environ.get("SQL_DIR", "/sql")) / "consultas" / "comparacion.sql"]
    if len(aqui.parents) > 2:
        candidatas.insert(0, aqui.parents[2] / "sql" / "consultas" / "comparacion.sql")
    return next((c for c in candidatas if c.is_file()), candidatas[-1])


RUTA_SQL = _ruta_defecto()


class ComparacionNoValida(Exception):
    """La comparación no es fiable: faltan datos geográficos o los parámetros son incoherentes."""


def cargar_consultas(ruta: Path = RUTA_SQL) -> dict[str, str]:
    """Divide el archivo en bloques «-- name: x». Ignora los comentarios previos al primer bloque."""
    texto = ruta.read_text(encoding="utf-8")
    partes = re.split(r"^-- name: (\w+)\s*$", texto, flags=re.M)
    return {partes[i]: partes[i + 1].strip() for i in range(1, len(partes), 2)}


@dataclass
class Comparacion:
    ambito: str
    pais: str | None
    min_mag_pedida: float
    min_mag_aplicada: float
    min_mag_elevada: bool
    dias_historico: int
    total_historico: int
    media_diaria: float
    mediana_diaria: float
    media_horaria: float
    reciente: int
    reciente_mag_nula: int
    variacion: float | None  # None = «no definida» (media 0)
    variacion_horaria: float | None
    periodo_reciente_incompleto: bool
    motivos_incompleto: list[str] = field(default_factory=list)

    def texto_variacion(self) -> str:
        return "no definida" if self.variacion is None else f"{self.variacion * 100:+.1f} %"


def comparar(conn, ambito: str, pais: str | None, min_mag: float, desde: datetime, hasta: datetime, h_desde: datetime, h_hasta: datetime,
             consultas: dict[str, str] | None = None) -> Comparacion:
    """Compara el recuento de la ventana reciente [desde, hasta) con la media diaria del periodo histórico [h_desde, h_hasta).

    Fuerza UTC en la sesión. `min_mag` < 4 se eleva a 4 en AMBOS periodos. Si la ventana reciente es incompleta lo indica, con los motivos."""
    if ambito not in ("global", "pais", "sin_pais"):
        raise ComparacionNoValida(f"ámbito desconocido: {ambito!r}")
    if ambito == "pais" and not pais:
        raise ComparacionNoValida("el ámbito «pais» exige country_id")
    if not (desde < hasta and h_desde < h_hasta):
        raise ComparacionNoValida("los intervalos deben ser [desde, hasta) con desde < hasta")
    q = consultas or cargar_consultas()
    conn.execute("SET TIME ZONE 'UTC'")
    aplicada = max(float(min_mag), MAG_MINIMA)
    p = {"ambito": ambito, "pais": pais, "min_mag": aplicada, "h_desde": h_desde, "h_hasta": h_hasta, "desde": desde, "hasta": hasta}

    def uno(nombre):
        return conn.execute(q[nombre], p).fetchone()

    sin_asignar = uno("precondicion_sin_asignar")[0]
    if sin_asignar:
        raise ComparacionNoValida(f"{sin_asignar} eventos de live sin geo_resultado: asignar antes (python -m observatorio.geo.retroactivo)")
    dias = (h_hasta - h_desde).days
    if dias <= 0 or (h_hasta - h_desde).total_seconds() != dias * 86400:
        raise ComparacionNoValida("el periodo histórico debe ser un número entero de días")
    total_h = uno("historico_total")[0]
    mediana = float(uno("historico_mediana_diaria")[0])
    media = total_h / dias
    media_h = total_h / (dias * 24)
    reciente = uno("reciente_total")[0]
    horas_ventana = (hasta - desde).total_seconds() / 3600

    motivos = []
    if uno("hueco_pendiente")[0]:
        motivos.append("la ventana intersecta un hueco de ingesta pendiente")
    cobertura_desde, ultima_ok = uno("cobertura_live")
    if cobertura_desde is None:
        motivos.append("no hay datos en vivo")
    elif desde < cobertura_desde:
        motivos.append(f"la ventana empieza antes de la cobertura en vivo ({cobertura_desde:%Y-%m-%d %H:%M} UTC)")
    if ultima_ok is None or hasta > ultima_ok:
        motivos.append("la ventana termina después de la última lectura correcta del feed" + (f" ({ultima_ok:%Y-%m-%d %H:%M} UTC)" if ultima_ok else ""))

    return Comparacion(
        ambito=ambito, pais=pais, min_mag_pedida=float(min_mag), min_mag_aplicada=aplicada, min_mag_elevada=float(min_mag) < MAG_MINIMA,
        dias_historico=dias, total_historico=total_h, media_diaria=media, mediana_diaria=mediana, media_horaria=media_h, reciente=reciente,
        reciente_mag_nula=uno("reciente_mag_nula")[0],
        variacion=None if media == 0 else (reciente - media) / media,
        # variación horaria: recuento de la ventana frente a la media horaria × horas de la ventana
        variacion_horaria=None if media_h == 0 else (reciente - media_h * horas_ventana) / (media_h * horas_ventana),
        periodo_reciente_incompleto=bool(motivos), motivos_incompleto=motivos)
