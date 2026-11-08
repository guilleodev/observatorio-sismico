"""Datos de PRUEBA para el replay (F6). Solo existen en memoria o en bases temporales: nunca en las tablas definitivas.

`seleccion_ficticia` imita lo que devuelve la selección real (`historico.evento.raw`): Features de USGS ordenados por fecha. Las coordenadas
caen dentro de ZA1/ZB1 del catálogo de juguete (`fixtures.geo`), así que su país es conocido; el punto marítimo del replay (-140, 0) no está en ninguno.
"""

from copy import deepcopy

T0 = 1_735_689_600_000  # 2025-01-01T00:00:00Z


def feature(i: int, *, tiempo_ms: int | None = None, mag="auto", updated: int | None = None, lon=5.0, lat=5.0, prof=10.0, tipo="earthquake") -> dict:
    tiempo = T0 + i * 60_000 if tiempo_ms is None else tiempo_ms
    return {
        "type": "Feature",
        "id": f"us-hist-{i:03d}",
        "geometry": {"type": "Point", "coordinates": [lon, lat, prof]},
        "properties": {
            "mag": (4.0 + (i % 5) / 10) if mag == "auto" else mag, "magType": "mb", "place": f"Lugar histórico {i}", "time": tiempo,
            "updated": tiempo + 3_600_000 if updated is None else updated, "type": tipo, "url": f"https://example.invalid/{i}",
        },
    }


def seleccion_ficticia(n: int = 30, *, con_nulos_al_principio: int = 0) -> list[dict]:
    """n Features ordenados por fecha. Los primeros `con_nulos_al_principio` tienen magnitud nula (para probar la elección de la base de los casos)."""
    resultado = []
    for i in range(n):
        f = feature(i + 1, lon=5.0 if i % 2 == 0 else 15.0)  # ZA1 y ZB1 alternando
        if i < con_nulos_al_principio:
            f["properties"]["mag"] = None
        resultado.append(f)
    return deepcopy(resultado)
