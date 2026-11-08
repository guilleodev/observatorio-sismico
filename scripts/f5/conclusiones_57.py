"""Cifras de las conclusiones (F5, paso 5.7, T051), obtenidas SOLO de la API (GET): cada número sale de una consulta con filtros y periodo explícitos y fijos, de modo que se puede reproducir.

Periodo reciente fijo: [2026-11-05T17:00:00Z, 2026-11-07T18:00:00Z) (≈ 2,04 días, dentro de la cobertura real del feed en vivo —empieza 2026-11-05T16:54Z—, sin huecos pendientes).
Línea base: media diaria de 2025 que devuelve la propia API (`comparacion.historico`). Uso:  python -X utf8 /scripts5/conclusiones_57.py [http://api:8000]
"""

import json
import sys
import urllib.parse
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://api:8000").rstrip("/")
INICIO, FIN = "2026-11-05T17:00:00Z", "2026-11-07T18:00:00Z"


def api(**filtros):
    url = f"{BASE}/api/estadisticas?" + urllib.parse.urlencode({"start": INICIO, "end": FIN, **filtros})
    with urllib.request.urlopen(url, timeout=60) as r:
        return url.replace(BASE, ""), json.load(r)


salud = json.load(urllib.request.urlopen(f"{BASE}/api/salud", timeout=30))
print(f"periodo reciente: [{INICIO}, {FIN}) | live_since={salud['live_since']} | huecos pendientes={salud['gaps_pending']}")
urls = {}
datos = {}
for etiqueta, f in (("g45", {"min_mag": "4.5"}), ("g4", {"min_mag": "4"}), ("s45", {"min_mag": "4.5", "country_id": "sin_pais"}), ("usa45", {"min_mag": "4.5", "country_id": "USA"})):
    urls[etiqueta], datos[etiqueta] = api(**f)
g45, g4, s45, usa45 = datos["g45"], datos["g4"], datos["s45"], datos["usa45"]
c45, c4 = g45["comparacion"], g4["comparacion"]
print("\n== Comparabilidad del periodo ==")
print(f"periodo incompleto={c45['periodo_reciente_incompleto']} motivos={c45['motivos_incompleto']} | dias={c45['reciente']['dias']}")

print("\n== Conclusión 1: peso de «Sin país asignado» entre los terremotos de M ≥ 4,5 (cobertura global comparable en ambos periodos) ==")
vivo_total, vivo_sin = c45["reciente"]["count"], s45["comparacion"]["reciente"]["count"]
h_total, h_sin = c45["historico"]["total"], s45["comparacion"]["historico"]["total"]
print(f"reciente: {vivo_sin} de {vivo_total} = {100 * vivo_sin / vivo_total:.1f} % | 2025: {h_sin} de {h_total} = {100 * h_sin / h_total:.1f} %")
print("consultas:", urls["g45"], "|", urls["s45"])

print("\n== Conclusión 2: recuento reciente de M ≥ 4,5 frente a lo esperado según 2025 ==")
print(f"reciente={vivo_total} en {c45['reciente']['dias']} d ({vivo_total / c45['reciente']['dias']:.2f}/día) | 2025: media diaria {c45['historico']['media_diaria']:.2f}, mediana diaria {c45['historico']['mediana_diaria']:.1f}, esperado {c45['historico']['esperado_para_ventana']:.1f} | diferencia {100 * c45['variacion']:+.0f} %")
print("consulta:", urls["g45"])

print("\n== Conclusión 3: diferencia de cobertura entre M 4,0–4,5 y M ≥ 4,5 (feed reciente frente a 2025) ==")
v4, v45 = c4["reciente"]["count"], vivo_total
h4, h45 = c4["historico"]["total"], h_total
banda_v, banda_h = v4 - v45, h4 - h45
print(f"M≥4: reciente {v4}, 2025 {h4} | M≥4,5: reciente {v45}, 2025 {h45}")
print(f"banda [4,0–4,5): reciente {banda_v} ({banda_v / c45['reciente']['dias']:.2f}/día; {100 * banda_v / v4:.1f} % de M≥4) | 2025 {banda_h} ({banda_h / 365:.2f}/día; {100 * banda_h / h4:.1f} % de M≥4)")
print(f"M≥4,5: {v45 / c45['reciente']['dias']:.2f}/día reciente frente a {h45 / 365:.2f}/día en 2025")
print("consultas:", urls["g4"], "|", urls["g45"])

print("\n== Dato descriptivo adicional: profundidad de los M ≥ 4,5 recientes (solo feed en vivo) ==")
prof = g45["profundidad"]
print([(i["from"], i["to"], i["count"]) for i in prof["items"]], "sin valor:", prof["sin_valor"])
print("países M≥4,5:", [(i["country_name"], i["count"]) for i in g45["por_pais"]["items"][:6]], "| USA M≥4,5 reciente:", usa45["comparacion"]["reciente"]["count"], "| 2025:", usa45["comparacion"]["historico"]["total"])
print("consulta:", urls["g45"])
