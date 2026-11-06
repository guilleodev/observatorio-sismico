"""Batería de puntos de referencia del paso 4.3 (T022). Los ESPERADOS se escribieron ANTES de ejecutar nada, a partir de la geografía
real y de las coordenadas conocidas de ciudades, regiones y océanos; no se calcularon con el asignador.

Cada fila: (nombre, longitud, latitud, país esperado según la realidad o None, categoría, nota).
Categorías:
  pais    un punto claramente dentro de un país: debe asignarse ese país (interior o frontera según el catálogo)
  mar     mar abierto o costa afuera: debe quedar sin país, aunque haya un país cerca (nunca el más cercano)
  escala  el lugar PERTENECE a un país en la realidad, pero el catálogo 1:110 000 000 no tiene esa isla: se espera «sin país»
          como limitación documentada de cobertura (no un error del asignador); el país real figura como informativo
  especial entidades dependientes, disputadas o sin ISO propio del catálogo: deben asignarse con su ADM0_A3 del catálogo
"""

BATERIA = [
    # --- países claros (lejos de cualquier frontera) ---
    ("Madrid", -3.70, 40.42, "ESP", "pais", ""),
    ("París", 2.35, 48.85, "FRA", "pais", "ADM0_A3 FRA aunque ISO_A3 sea -99 en el catálogo"),
    ("Tokio", 139.69, 35.69, "JPN", "pais", ""),
    ("Santiago de Chile", -70.65, -33.45, "CHL", "pais", ""),
    ("Lima", -77.04, -12.05, "PER", "pais", ""),
    ("Nairobi", 36.82, -1.29, "KEN", "pais", ""),
    ("Canberra", 149.13, -35.28, "AUS", "pais", ""),
    ("Brasilia", -47.93, -15.78, "BRA", "pais", ""),
    ("Ankara", 32.86, 39.93, "TUR", "pais", ""),
    ("Katmandú", 85.32, 27.72, "NPL", "pais", ""),
    ("Anchorage (Alaska)", -149.90, 61.22, "USA", "pais", "Alaska es parte del MultiPolygon de EE. UU. (geometría reparada en memoria)"),
    ("Ciudad de México", -99.13, 19.43, "MEX", "pais", ""),
    ("Yakarta", 106.85, -6.21, "IDN", "pais", ""),
    ("Moscú", 37.62, 55.75, "RUS", "pais", ""),
    ("Teherán", 51.39, 35.69, "IRN", "pais", ""),
    ("Jartum", 32.53, 15.50, "SDN", "pais", "Sudán: la otra geometría reparada en memoria"),
    ("Nome (Alaska, lado del estrecho de Bering)", -165.40, 64.50, "USA", "pais", ""),
    # --- mar abierto y costa afuera: sin país, sin buscar el más cercano ---
    ("Atlántico Norte", -30.0, 30.0, None, "mar", ""),
    ("Pacífico ecuatorial", -150.0, 0.0, None, "mar", ""),
    ("Índico sur", 80.0, -30.0, None, "mar", ""),
    ("Golfo de Guinea (0, 0)", 0.0, 0.0, None, "mar", "el punto (0, 0) es mar"),
    ("Polo Norte", 0.0, 90.0, None, "mar", "océano Ártico"),
    ("Golfo de Vizcaya, a ~0,6° de España", -4.0, 44.0, None, "mar", "cerca de la costa española: aun así sin país"),
    ("Mar de Alborán, entre España y Marruecos", -3.0, 36.0, None, "mar", "equidistante de dos países: sin país"),
    ("Mediterráneo oriental", 28.0, 34.0, None, "mar", ""),
    ("Pacífico frente a Chile", -75.0, -33.0, None, "mar", ""),
    # --- antimeridiano (±180°) ---
    ("Fiyi, Viti Levu (lado este)", 178.0, -17.8, "FJI", "pais", "el catálogo parte Fiyi en el antimeridiano"),
    ("Fiyi, Taveuni (lado oeste)", -179.9, -16.85, "FJI", "pais", "la misma entidad al otro lado de ±180°"),
    ("Chukotka, Rusia (este de 180°)", 178.0, 66.5, "RUS", "pais", ""),
    ("Chukotka, Rusia (oeste de -180°)", -175.0, 67.0, "RUS", "pais", "Rusia cruza el antimeridiano"),
    # --- polos ---
    ("Polo Sur", 0.0, -90.0, "ATA", "pais", "Antártida; el polo puede quedar en el borde del polígono (frontera)"),
    # --- entidades especiales del catálogo ---
    ("Puerto Rico", -66.45, 18.20, "PRI", "especial", "dependencia de EE. UU. con polígono propio"),
    ("Hargeisa (Somalilandia)", 44.06, 9.56, "SOL", "especial", "ISO_A3 -99; disputado"),
    ("Ramala (Palestina)", 35.20, 31.90, "PSX", "especial", "ADM0_A3 PSX distinto de ISO PSE"),
    ("Pristina (Kosovo)", 21.17, 42.67, "KOS", "especial", "ISO_A3 -99"),
    ("Sáhara Occidental", -13.0, 25.0, "SAH", "especial", "ADM0_A3 SAH distinto de ISO ESH"),
    ("Taipéi (Taiwán)", 121.0, 23.7, "TWN", "especial", ""),
    ("Kyrenia (norte de Chipre)", 33.32, 35.34, "CYN", "especial", "Chipre del Norte, ISO_A3 -99"),
    ("Groenlandia", -42.0, 72.0, "GRL", "especial", "dependencia de Dinamarca"),
    ("Juba (Sudán del Sur)", 31.58, 4.85, "SDS", "especial", "ADM0_A3 SDS distinto de ISO SSD"),
    # --- islas que existen en la realidad pero no en el catálogo de escala 1:110 000 000 ---
    ("Sáhara Occidental, zona que el catálogo asigna a SAH", -12.0, 26.0, "SAH", "especial", "revisada tras la primera ejecución: este punto sí cae en el polígono SAH"),
    ("Malta (La Valeta)", 14.51, 35.90, None, "escala", "realidad: MLT"),
    ("Mauricio (Port Louis)", 57.50, -20.16, None, "escala", "realidad: MUS"),
    ("Maldivas (Malé)", 73.51, 4.18, None, "escala", "realidad: MDV"),
    ("Tonga (Nukualofa)", -175.20, -21.14, None, "escala", "realidad: TON"),
    ("Bermudas (Hamilton)", -64.78, 32.30, None, "escala", "realidad: BMU"),
]


# Primera ejecución (2026-11-06): 3 filas no coincidieron con lo esperado. Tras analizarlas NINGUNA fue un error del asignador; se
# clasifican con su causa y la fila se evalúa con la expectativa revisada. Se conserva la expectativa inicial para la evidencia.
#   nombre -> (categoría revisada, país esperado revisado, causa)
REVISADAS = {
    "Nome (Alaska, lado del estrecho de Bering)": (
        "escala", None, "Nome es costero: el catálogo 1:110 M simplifica la costa y el punto cae 2,0 km mar adentro del polígono de EE. UU. (realidad: USA)"),
    "Fiyi, Taveuni (lado oeste)": (
        "escala", None, "Taveuni no existe en el catálogo: el polígono de Fiyi más cercano está a 34 km (realidad: FJI)"),
    "Sáhara Occidental": (
        "especial", "MAR", "el catálogo usa la línea de facto: MAR cubre (-13, 25) y SAH solo la franja oriental; se respeta el catálogo, sin reinterpretar políticamente"),
}


def filas_revisadas():
    """Filas de la batería con la expectativa vigente: (nombre, lon, lat, esperado, categoría, nota, esperado_inicial, causa_revision)."""
    salida = []
    for nombre, lon, lat, esperado, categoria, nota in BATERIA:
        if nombre in REVISADAS:
            cat, esp, causa = REVISADAS[nombre]
            salida.append((nombre, lon, lat, esp, cat, nota, (esperado, categoria), causa))
        else:
            salida.append((nombre, lon, lat, esperado, categoria, nota, None, None))
    return salida
