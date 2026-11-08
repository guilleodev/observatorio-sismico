"""Modelo reproducible de escalado y costes (F6, 6.5, T039-T040; FR-021, FR-022, SC-011). Solo cálculo: no mide nada, no toca servicios ni datos.

Uso:  py -3.13 -X utf8 scripts/f6/modelo_costes.py            (imprime las tablas que cita docs/evidencias/f6/complejidad-costes.md)
Cada variable lleva su ORIGEN:  [MEDIDO] sale de una medición de este proyecto (se cita el archivo);  [PUBLICADO] cuota de una página oficial consultada en la fecha indicada;
[SUPUESTO] valor HIPOTÉTICO de ejemplo para que el modelo funcione, sin base real: sustitúyelo;  [PENDIENTE] dato que solo conoce la persona estudiante (SUPUESTO mientras no lo dé).
Los resultados del escalado son un MODELO calibrado con las medidas de 100 000 elementos, NO mediciones a esa escala.
"""
import math

# ---------------------------------------------------------------- 1. Medidas del proyecto (no editar sin repetir la medición)
NS_FILA_SECUENCIAL_PY = 10.2e6 / 100_000          # [MEDIDO] 6.4/6.5: 10,2 ms por búsqueda secuencial sobre 100 000 filas (6.5-comparaciones.txt)
NS_FILA_SQL_SIN_INDICE = 4.0e6 / 100_000          # [MEDIDO] 4,0 ms por consulta sin índice (recorrido secuencial en caché), 100 000 filas
NS_FILA_AGREGACION_SQL = 35e6 / 100_000           # [MEDIDO] 35 ms agregando 100 000 filas por hora en SQL (6.4-mediciones.txt)
US_PUNTO_GEO = 7.5                                # [MEDIDO] 7,5 µs por asignación punto-en-polígono (6.4-mediciones.txt)
BYTES_FILA_COMPACTA = 136 + 41                    # [MEDIDO] heap 136 B/fila + clave primaria 41 B/fila a 100 000 filas, SIN el JSON original (6.5-comparaciones.txt)
BYTES_FILA_REAL = 1.29 * 1024                     # [MEDIDO] historico.evento: 23 MB / 18 302 filas, con el GeoJSON original (raw) e índices (consulta del 2026-11-08)
BYTES_INDICE_PK_REAL = 1936 * 1024 / 18_302       # [MEDIDO] índice de historico.evento: 1 936 kB / 18 302 filas ≈ 108 B/fila
BYTES_RAM_POR_FILA_PYTHON = 1024                  # [MEDIDO, cota] RSS 144 MB a 100 000 filas frente a 40 MB a 1 000: ≈ 1 KB/fila con filas, lista y diccionario (cota alta)
RAM_EQUIPO_GB = 15.15                             # [MEDIDO] memoria disponible para Docker (docker info), equipo de las mediciones
VERSIONES_POR_DIA_LIVE = 882 / 2.8                # [MEDIDO] 882 versiones en live en ≈ 2,8 días de funcionamiento (2026-11-05 → 2026-11-08), ≈ 315 al día
MB_DIA_LIVE = 9808 / 1024 / (68.2 / 24)           # [MEDIDO] live.respuesta_original: 9,8 MB en 68,2 h  → ≈ 3,4 MB al día (dominante)
KB_FILA_VERSION_LIVE = 1184 / 882                 # [MEDIDO] live.evento_version: 1 184 kB / 882 filas ≈ 1,34 KB por versión
KB_FEED = 135_872 / 1024                          # [MEDIDO] media de bytes por consulta correcta a USGS (live.consulta_extraccion, 1 282 consultas)
INTERVALO_USGS_S = 60                             # [MEDIDO] compose.yaml: USGS_INTERVAL_S=60
KB_REFRESCO_PANEL = (187 + 57_058 + 2_904) / 1024  # [MEDIDO] /api/salud + /api/eventos (24 h, 201 eventos) + /api/estadisticas el 2026-11-08, sin compresión
PETICIONES_REFRESCO = 3                           # [MEDIDO] el panel pide salud, eventos y estadísticas en cada refresco (app.component.ts)
REFRESCO_PANEL_S = 60                             # [MEDIDO] public/config.json: refreshMs = 60000
KB_VISITA_NETLIFY = 1237783 / 1024                # [MEDIDO] tamaño del build estático (dist, sin comprimir), incluye el GeoJSON de 819 KiB

# ---------------------------------------------------------------- 2. Hipótesis editables
FANOUT_BTREE = 200                                # [SUPUESTO] claves por página de 8 KiB con clave de ≈ 40 B
DISCO_MB_S = 1000                                 # [SUPUESTO] lectura secuencial de un SSD de consumo (1 GB/s); un disco más lento lo multiplica
PRECIO_EQUIPO_EUR = 900.0                         # [PENDIENTE] precio de compra del equipo (hipotético)
VIDA_UTIL_ANIOS = 4.0                             # [SUPUESTO] años de amortización
FRACCION_USO_PROYECTO = 0.25                      # [SUPUESTO] parte del equipo atribuible al proyecto (el resto, uso personal)
POTENCIA_MEDIA_W = 65.0                           # [PENDIENTE] potencia media del equipo con la pila en marcha (hipotética; medir con un vatímetro)
HORAS_ENCENDIDO_DIA = 24.0                        # [SUPUESTO] 24 horas al día en la observación de estabilidad; 8 en uso académico normal
TARIFA_EUR_KWH = 0.15                             # [PENDIENTE] tarifa eléctrica de la persona estudiante (hipotética)
PRECIO_SSD_EUR_GB = 0.08                          # [SUPUESTO] coste de capacidad de un SSD de consumo
HORAS_DESARROLLO = 120.0                          # [PENDIENTE] horas de desarrollo de F3-F6 (hipotéticas)
EUR_HORA_DESARROLLO = 15.0                        # [PENDIENTE] valoración de la hora (hipotética; el trabajo académico no se factura)
HORAS_MANTENIMIENTO_MES = 2.0                     # [SUPUESTO] revisar avisos, actualizar imágenes, comprobar copias
VM_ALTERNATIVA_EUR_MES = 60.0                     # [SUPUESTO] referencia genérica: máquina virtual de 4 vCPU y 16 GB (precio hipotético, solo para comparar; no es parte del MVP)
DISCO_VM_EUR_GB_MES = 0.10                        # [SUPUESTO] almacenamiento de bloque de esa referencia
# [PUBLICADO] consultado el 2026-11-08: https://ngrok.com/docs/pricing-limits/free-plan-limits  (plan gratuito)
NGROK_GB_MES, NGROK_PETICIONES_MES = 1.0, 20_000
# [PUBLICADO] consultado el 2026-11-08: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/  (plan gratuito por créditos; el
# precio por GB y por despliegue varía entre páginas de Netlify -10 y 20 créditos/GB-: se usa la más reciente de la documentación, 20)
NETLIFY_CREDITOS_MES, NETLIFY_CREDITOS_GB, NETLIFY_CREDITOS_DESPLIEGUE = 300, 20, 15


def fmt_bytes(b):
    for u, d in (("TB", 1e12), ("GB", 1e9), ("MB", 1e6), ("KB", 1e3)):
        if b >= d:
            return f"{b / d:,.1f} {u}"
    return f"{b:.0f} B"


def fmt_t(s):
    if s < 1e-3: return f"{s * 1e6:.0f} µs"
    if s < 1: return f"{s * 1e3:.1f} ms"
    if s < 120: return f"{s:.1f} s"
    if s < 7200: return f"{s / 60:.1f} min"
    return f"{s / 3600:.1f} h"


def escalado():
    print("## A. Proyección (modelo lineal calibrado en 10^5; NO son mediciones a esa escala)\n")
    print("| N filas | disco con JSON original | disco compacto (sin JSON) | índice PK real | RAM de lista+dict (cota) | ¿cabe en RAM? | búsqueda secuencial Python | SQL sin índice (en caché / leyendo disco) | niveles B-tree | agregación SQL de toda la tabla (en caché) | asignación de país en lote (1 núcleo) |")
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    for n in (1e5, 1e6, 1e7, 1e8):
        disco_real, disco_compacto = n * BYTES_FILA_REAL, n * BYTES_FILA_COMPACTA
        ram = n * BYTES_RAM_POR_FILA_PYTHON
        niveles = max(1, math.ceil(math.log(n) / math.log(FANOUT_BTREE)))
        print(f"| {n:,.0f} | {fmt_bytes(disco_real)} | {fmt_bytes(disco_compacto)} | {fmt_bytes(n * BYTES_INDICE_PK_REAL)} | {fmt_bytes(ram)} | {'sí' if ram < RAM_EQUIPO_GB * 1e9 * 0.6 else 'NO'} | "
              f"{fmt_t(n * NS_FILA_SECUENCIAL_PY / 1e9)} | {fmt_t(n * NS_FILA_SQL_SIN_INDICE / 1e9)} / {fmt_t(disco_real / (DISCO_MB_S * 1e6))} | {niveles} | {fmt_t(n * NS_FILA_AGREGACION_SQL / 1e9)} | {fmt_t(n * US_PUNTO_GEO / 1e6)} |")
    tope = RAM_EQUIPO_GB * 1e9 * 0.6 / BYTES_RAM_POR_FILA_PYTHON
    print(f"\nTope de un diccionario en memoria con el 60 % de la RAM ({RAM_EQUIPO_GB} GB): ≈ {tope:,.0f} filas (≈ 10^7). A 10^8 hace falta el índice de la base de datos.")
    anios = 1e8 / (VERSIONES_POR_DIA_LIVE * 365)
    print(f"Ritmo real de este proyecto: ≈ {VERSIONES_POR_DIA_LIVE:.0f} versiones/día → 10^8 filas equivaldrían a ≈ {anios:,.0f} años de ingesta como la actual: solo se alcanzaría con otras fuentes (sensores, redes sísmicas completas).")
    print(f"Crecimiento de `live` por día [MEDIDO]: ≈ {MB_DIA_LIVE:.1f} MB (respuestas originales) + {VERSIONES_POR_DIA_LIVE * KB_FILA_VERSION_LIVE / 1024:.2f} MB (versiones) ≈ {MB_DIA_LIVE + VERSIONES_POR_DIA_LIVE * KB_FILA_VERSION_LIVE / 1024:.1f} MB/día → {(MB_DIA_LIVE + VERSIONES_POR_DIA_LIVE * KB_FILA_VERSION_LIVE / 1024) * 365 / 1024:.1f} GB/año.")


def costes():
    print("\n## B. Costes anuales (EUR) de mantener la pila actual en el equipo propio; variables [PENDIENTE]/[SUPUESTO] editables arriba\n")
    crec_gb_anio = (MB_DIA_LIVE + VERSIONES_POR_DIA_LIVE * KB_FILA_VERSION_LIVE / 1024) * 365 / 1024
    escenarios = {"A · 24 h/día (estabilidad)": 24.0, "B · 8 h/día (uso académico)": 8.0}
    print("| Categoría | " + " | ".join(escenarios) + " | Base del cálculo |")
    print("|---|" + "---|" * len(escenarios) + "---|")
    filas = {
        "Hardware (amortización de la fracción del equipo)": lambda h: PRECIO_EQUIPO_EUR / VIDA_UTIL_ANIOS * FRACCION_USO_PROYECTO,
        "Electricidad": lambda h: POTENCIA_MEDIA_W / 1000 * h * 365 * TARIFA_EUR_KWH,
        "Almacenamiento (capacidad nueva de un año)": lambda h: crec_gb_anio * PRECIO_SSD_EUR_GB,
        "Transferencia (ngrok + Netlify, planes gratuitos)": lambda h: 0.0,
        "Mantenimiento": lambda h: HORAS_MANTENIMIENTO_MES * 12 * EUR_HORA_DESARROLLO,
        "Desarrollo (una vez, no anual)": lambda h: HORAS_DESARROLLO * EUR_HORA_DESARROLLO,
    }
    base = {"Hardware (amortización de la fracción del equipo)": f"{PRECIO_EQUIPO_EUR:.0f} € / {VIDA_UTIL_ANIOS:.0f} años × {FRACCION_USO_PROYECTO:.0%}",
            "Electricidad": f"{POTENCIA_MEDIA_W:.0f} W × horas × 365 × {TARIFA_EUR_KWH} €/kWh",
            "Almacenamiento (capacidad nueva de un año)": f"{crec_gb_anio:.1f} GB/año × {PRECIO_SSD_EUR_GB} €/GB",
            "Transferencia (ngrok + Netlify, planes gratuitos)": "0 € marginales dentro de las cuotas; ver sección C: NO equivale a coste cero",
            "Mantenimiento": f"{HORAS_MANTENIMIENTO_MES} h/mes × 12 × {EUR_HORA_DESARROLLO} €/h",
            "Desarrollo (una vez, no anual)": f"{HORAS_DESARROLLO:.0f} h × {EUR_HORA_DESARROLLO} €/h"}
    totales = {e: 0.0 for e in escenarios}
    for k, f in filas.items():
        vals = {e: f(h) for e, h in escenarios.items()}
        for e in vals: totales[e] += vals[e]
        print(f"| {k} | " + " | ".join(f"{v:,.2f}" for v in vals.values()) + f" | {base[k]} |")
    print("| **Total del primer año** | " + " | ".join(f"**{v:,.2f}**" for v in totales.values()) + " | suma de las seis categorías |")
    print("| Total de años siguientes (sin desarrollo) | " + " | ".join(f"{v - HORAS_DESARROLLO * EUR_HORA_DESARROLLO:,.2f}" for v in totales.values()) + " | |")
    vm = VM_ALTERNATIVA_EUR_MES * 12 + crec_gb_anio * DISCO_VM_EUR_GB_MES * 12 / 2
    print(f"\nReferencia hipotética, solo para comparar (no forma parte del MVP): una máquina virtual equivalente ≈ {vm:,.2f} €/año de infraestructura, sin contar el trabajo propio ({VM_ALTERNATIVA_EUR_MES} €/mes + disco, ambos supuestos).")
    kwh = POTENCIA_MEDIA_W / 1000 * 24 * 365
    print(f"Con {POTENCIA_MEDIA_W:.0f} W y 24 h/día el consumo sería ≈ {kwh:,.0f} kWh/año; por cada 10 W de diferencia en la potencia real, ±{10 / 1000 * 24 * 365 * TARIFA_EUR_KWH:.1f} €/año.")


def cuotas():
    print("\n## C. Transferencia y cuotas gratuitas (el panel con refresco de 60 s)\n")
    ref_h = 3600 / REFRESCO_PANEL_S
    print(f"Por refresco del panel: {PETICIONES_REFRESCO} peticiones y {KB_REFRESCO_PANEL:.1f} KB (sin compresión). Por pestaña abierta: {ref_h * PETICIONES_REFRESCO:.0f} peticiones/h y {ref_h * KB_REFRESCO_PANEL / 1024:.1f} MB/h; "
          f"{ref_h * 24 * PETICIONES_REFRESCO:,.0f} peticiones/día y {ref_h * 24 * KB_REFRESCO_PANEL / 1024:.0f} MB/día.\n")
    print("| Cuota gratuita (consultada 2026-11-08) | Límite mensual | Horas de UNA pestaña abierta que lo agotan | Días continuos |")
    print("|---|---|---|---|")
    h_pet = NGROK_PETICIONES_MES / (ref_h * PETICIONES_REFRESCO)
    h_gb = NGROK_GB_MES * 1024 * 1024 / (ref_h * KB_REFRESCO_PANEL)
    print(f"| ngrok · peticiones HTTP | {NGROK_PETICIONES_MES:,} | {h_pet:,.0f} h | {h_pet / 24:.1f} |")
    print(f"| ngrok · datos salientes | {NGROK_GB_MES} GB | {h_gb:,.0f} h | {h_gb / 24:.1f} |")
    gb_visita = KB_VISITA_NETLIFY / 1024 / 1024
    visitas = (NETLIFY_CREDITOS_MES - NETLIFY_CREDITOS_DESPLIEGUE * 4) / (NETLIFY_CREDITOS_GB * gb_visita)
    print(f"| Netlify · créditos (300; {NETLIFY_CREDITOS_GB} por GB, {NETLIFY_CREDITOS_DESPLIEGUE} por despliegue) | {NETLIFY_CREDITOS_MES} | ≈ {visitas:,.0f} cargas completas del sitio ({KB_VISITA_NETLIFY / 1024:.2f} MB sin comprimir) con 4 despliegues al mes | — |")
    print(f"\nLímite que manda: las {NGROK_PETICIONES_MES:,} peticiones de ngrok (una sola pestaña a 60 s las agota en ≈ {h_pet / 24:.1f} días). Con refresco de 5 min (Config.refreshMs = 300000) durarían ≈ {h_pet * 5 / 24:.0f} días por pestaña.")
    print(f"Transferencia entrante (USGS): {KB_FEED:.0f} KB/consulta × {86400 // INTERVALO_USGS_S} consultas/día ≈ {KB_FEED * 86400 / INTERVALO_USGS_S / 1024:.0f} MB/día ≈ {KB_FEED * 86400 / INTERVALO_USGS_S * 365 / 1024 / 1024:.0f} GB/año de bajada: sin coste marginal en una conexión de tarifa plana, pero no es cero.")


if __name__ == "__main__":
    escalado()
    costes()
    cuotas()
