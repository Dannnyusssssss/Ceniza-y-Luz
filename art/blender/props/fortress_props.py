"""Objetos de la Fortaleza del Eclipse: el brasero de la sala y el trono.

Cada modelo tiene el origen en el suelo y su frente mira hacia -Y. La llama del brasero la pone el juego al encenderlo.
"""

import math

import common as c
from world_props import METAL, _cylinder, _finish

STONE = {"light": "#5c4644", "mid": "#463432", "dark": "#2e2120"}
GOLD = {"bright": "#e8b84a", "dark": "#8a5f22"}


def brazier(data):
    """Brasero alto de hierro sobre un pie de piedra. Se distingue de lejos por el aro de oro."""
    outline = data["outline"]
    parts = [
        _cylinder("foot", 0.0, 0.22, 0.62, 0.5, STONE["dark"], sides=8),
        _cylinder("shaft", 0.22, 1.12, 0.2, 0.15, METAL["dark"], sides=8),
        c.ring_tube("band", (0, 0, 0.7), 0.18, 0.025, GOLD["bright"], segments=12),
        _cylinder("bowl", 1.12, 1.46, 0.16, 0.46, METAL["dark"], sides=10),
        c.ring_tube("lip", (0, 0, 1.46), 0.46, 0.035, GOLD["bright"], segments=16),
    ]
    for i in range(3):
        a = i / 3 * math.tau
        base = (math.cos(a) * 0.5, math.sin(a) * 0.5, 0.2)
        top = (math.cos(a) * 0.3, math.sin(a) * 0.3, 1.2)
        parts.append(c.tube(f"strut{i}", [base, top], [0.035, 0.03], GOLD["dark"], sides=5))
    obj = _finish(parts, "brazier", outline)
    return {"object": obj, "armature": None, "clips": {}, "previewTarget": 0.8, "previewDistance": 4.5}


def throne(data):
    """Trono de piedra negra, con respaldo alto y puntas de oro. Su centro queda a 2,8 m de ancho."""
    outline = data["outline"]
    parts = [
        c.box("step", (0, 0, 0.14), (2.8, 1.5, 0.28), STONE["dark"]),
        c.box("step2", (0, 0.05, 0.42), (2.2, 1.2, 0.28), STONE["mid"]),
        c.box("seat", (0, 0.05, 0.78), (1.3, 0.9, 0.44), STONE["mid"]),
        c.box("back", (0, 0.5, 2.1), (1.5, 0.3, 3.1), STONE["dark"]),
        c.box("backInner", (0, 0.32, 1.95), (1.0, 0.08, 2.1), STONE["light"]),
    ]
    for sx in (1, -1):
        parts.append(c.box(f"arm{sx}", (0.72 * sx, 0.05, 1.12), (0.22, 0.9, 0.2), STONE["light"]))
        parts.append(c.box(f"armPost{sx}", (0.72 * sx, -0.3, 0.9), (0.16, 0.16, 0.3), STONE["dark"]))
        parts.append(c.tube(f"spike{sx}", [(0.74 * sx, 0.5, 3.6), (0.82 * sx, 0.5, 4.4)], [0.12, 0.0], GOLD["bright"], sides=4))
        parts.append(c.tube(f"spikeB{sx}", [(0.36 * sx, 0.5, 3.6), (0.4 * sx, 0.5, 4.15)], [0.09, 0.0], GOLD["dark"], sides=4))
    parts.append(c.tube("spikeTop", [(0, 0.5, 3.6), (0, 0.5, 4.7)], [0.15, 0.0], GOLD["bright"], sides=4))
    parts.append(c.box("trim", (0, 0.5, 3.62), (1.56, 0.34, 0.07), GOLD["dark"]))
    obj = _finish(parts, "throne", outline, thickness=0.016)
    return {"object": obj, "armature": None, "clips": {}, "previewTarget": 2.0, "previewDistance": 8}


BUILDERS = {"brazier": brazier, "throne": throne}


def build(data):
    return BUILDERS[data["model"]](data)
