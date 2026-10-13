"""Сохранение и выдача геометрии, построенной браузерным ядром.

Сервер не строит и не разбирает B-rep: он проверяет контракт меша, права и
версию документа и хранит opaque STEP рядом с тесселяцией.
"""

from .browser_boolean import save_browser_boolean
from .browser_extrude import load_browser_step, parse_revolve_origin, save_browser_extrude
from .common import next_label
from .mesh import get_mesh
from .target_resolution import resolve_target_body

__all__ = [
    "get_mesh",
    "load_browser_step",
    "next_label",
    "parse_revolve_origin",
    "resolve_target_body",
    "save_browser_boolean",
    "save_browser_extrude",
]
