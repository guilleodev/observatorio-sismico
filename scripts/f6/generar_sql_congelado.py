"""Congela el SQL ACTUAL del consumidor en vivo (F6, T006) para demostrar que parametrizar el destino no lo cambia ni un carácter.

Se ejecuta UNA vez, ANTES de tocar `consumer/repositorio.py`, dentro del contenedor temporal de pruebas:
    bash scripts/f6/ejecutar.sh python /scripts6/generar_sql_congelado.py
Escribe `backend/tests/unit/sql_live_congelado.py` con las cuatro sentencias como literales. Se niega a sobrescribirlo (el congelado es la referencia).
"""

import sys
from pathlib import Path

DESTINO = Path("/app/tests/unit/sql_live_congelado.py")
if DESTINO.exists():
    sys.exit(f"{DESTINO} ya existe: es la referencia congelada y no se sobrescribe")

from observatorio.consumer import repositorio as r  # noqa: E402

cabecera = '''"""Copia CONGELADA del SQL del consumidor en vivo tal y como estaba antes de parametrizar el destino (F6, T006).

Es la referencia de `test_destino_sql.py`: el SQL que genera el destino `live` debe ser idéntico, carácter a carácter, a estas sentencias.
Generado con `scripts/f6/generar_sql_congelado.py` a partir de `consumer/repositorio.py` en el commit 6f11d5b ([F5]). No editar a mano.
"""

'''
cuerpo = "".join(f"{nombre} = {getattr(r, nombre)!r}\n\n" for nombre in ("SQL_VERSION", "SQL_ACTUAL", "SQL_RETIRAR", "SQL_CUARENTENA"))
DESTINO.write_text(cabecera + cuerpo, encoding="utf-8", newline="\n")
print(f"escrito {DESTINO}: " + ", ".join(f"{n}={len(getattr(r, n))} caracteres" for n in ("SQL_VERSION", "SQL_ACTUAL", "SQL_RETIRAR", "SQL_CUARENTENA")))
