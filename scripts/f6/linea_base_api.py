"""Línea base de la API en vivo (F6, T001). SOLO LECTURA: únicamente peticiones GET a la API y consultas SELECT.

Captura, con una ventana PASADA y FIJA, la forma canónica de varias respuestas de la API en vivo (sin los campos que cambian en cada petición:
`generated`, `last_ingestion` e `ingestion_age_s`) y guarda su huella. En T026 se repite con la API recreada y deben coincidir: así se demuestra que, sin `mode`,
las respuestas son idénticas a las de F5. Como USGS puede revisar un evento de la ventana, se guarda también un oráculo SQL independiente (recuento y md5 de
`event_id|updated_at` de la ventana): si un día cambia la huella de la API pero no el oráculo SQL, es una regresión; si cambian los dos, es una revisión legítima de USGS.

Uso (desde la raíz del repositorio, con `.env` cargado):  py -3.13 scripts/f6/linea_base_api.py [salida.json] [--base http://127.0.0.1:8000]
"""

import hashlib
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8000"
INICIO, FIN = "2026-11-06T00:00:00Z", "2026-11-07T00:00:00Z"  # ventana cerrada y pasada, dentro de la cobertura de live
IGNORAR = {"generated", "last_ingestion", "ingestion_age_s"}

CONSULTAS = [
    ("eventos", {"start": INICIO, "end": FIN, "limit": "5000"}),
    ("eventos", {"start": INICIO, "end": FIN, "min_mag": "4.5", "limit": "5000"}),
    ("eventos", {"start": INICIO, "end": FIN, "country_id": "sin_pais", "limit": "5000"}),
    ("eventos", {"start": INICIO, "end": FIN, "country_id": "USA", "limit": "50", "offset": "10"}),
    ("estadisticas", {"start": INICIO, "end": FIN}),
    ("estadisticas", {"start": INICIO, "end": FIN, "min_mag": "4.5"}),
    ("estadisticas", {"start": INICIO, "end": FIN, "country_id": "sin_pais"}),
]


def limpiar(valor):
    """Quita recursivamente los campos que cambian en cada petición."""
    if isinstance(valor, dict):
        return {k: limpiar(v) for k, v in valor.items() if k not in IGNORAR}
    if isinstance(valor, list):
        return [limpiar(v) for v in valor]
    return valor


def huella(cuerpo) -> str:
    return hashlib.sha256(json.dumps(limpiar(cuerpo), sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()


def pedir(base, ruta, params):
    url = f"{base}/api/{ruta}?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=60) as r:
        return url.replace(base, ""), r.status, json.load(r)


def oraculo_sql():
    """Recuento y md5 de (event_id|updated_at) de la ventana en live.evento_actual (sin retirados), por psql dentro del contenedor de PostgreSQL."""
    sql = ("SELECT count(*) || ' ' || coalesce(md5(string_agg(event_id || '|' || updated_at::text, ',' ORDER BY event_id)), '-') "
           f"FROM live.evento_actual WHERE NOT retirado AND event_time >= '{INICIO}' AND event_time < '{FIN}'")
    env = os.environ
    salida = subprocess.run(["docker", "compose", "exec", "-T", "postgres", "psql", "-U", env["POSTGRES_USER"], "-d", env["POSTGRES_DB"], "-tAc", sql],
                            capture_output=True, text=True, check=True).stdout.strip()
    n, md5 = salida.split(" ", 1)
    return {"eventos_en_ventana": int(n), "md5_ids_y_updated": md5}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    base = sys.argv[sys.argv.index("--base") + 1] if "--base" in sys.argv else BASE
    salida = args[0] if args and not args[0].startswith("http") else "docs/evidencias/f6/6.1-linea-base-api.json"
    consultas = []
    for ruta, params in CONSULTAS:
        url, estado, cuerpo = pedir(base, ruta, params)
        total = (cuerpo.get("metadata", {}).get("total") if ruta == "eventos" else cuerpo.get("total"))
        consultas.append({"url": url, "estado": estado, "total": total, "sha256": huella(cuerpo)})
    resultado = {"ventana": [INICIO, FIN], "ignorados": sorted(IGNORAR), "oraculo_sql": oraculo_sql(), "consultas": consultas}
    texto = json.dumps(resultado, indent=2, ensure_ascii=False)
    if "--comparar" in sys.argv:
        previo = json.load(open(sys.argv[sys.argv.index("--comparar") + 1], encoding="utf-8"))
        igual_api = [a["sha256"] for a in previo["consultas"]] == [b["sha256"] for b in consultas]
        igual_sql = previo["oraculo_sql"] == resultado["oraculo_sql"]
        print(f"huellas de la API iguales: {igual_api} | oráculo SQL igual: {igual_sql}")
        print("RESULTADO:", "OK" if igual_api else ("REVISIÓN LEGÍTIMA DE USGS (cambia también el oráculo SQL)" if not igual_sql else "REGRESIÓN"))
        sys.exit(0 if igual_api else 1)
    open(salida, "w", encoding="utf-8", newline="\n").write(texto + "\n")
    print(texto)


if __name__ == "__main__":
    main()
