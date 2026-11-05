import time


def ahora_ms() -> int:
    """Instante actual en milisegundos Unix UTC."""
    return int(time.time() * 1000)
