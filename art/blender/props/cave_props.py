"""Objetos de las zonas oscuras: antorcha, prisma, altar de habilidad y barrera de cristal.

Cada modelo tiene el origen en el suelo y su frente mira hacia -Y. Lo que brilla va sin contorno.
"""

import math

import common as c
import mist as m
import sculpt as s
from world_props import GLOW, METAL, STONE, _cylinder, _finish

CRYSTAL = {"light": "#d9c4ff", "mid": "#a689f2", "dark": "#6d55c4", "cyan": "#9fe9ff"}


def _shard(name, center, radii, seed, tilt, palette):
    """Cristal anguloso, con la cara de arriba más clara: caras planas y pocos triángulos."""
    obj = m.rock(name, center, radii, seed=seed, tilt=tilt)
    colors = []
    for poly in obj.data.polygons:
        n = poly.normal.z
        colors.append(palette["light"] if n > 0.4 else palette["dark"] if n < -0.2 else palette["mid"])
    s._paint_by_index(obj, colors)
    return obj


def torch(data):
    """Antorcha de piedra hundida en el agua. La llama la pone el juego cuando se enciende."""
    outline = data["outline"]
    parts = [
        _cylinder("foot", 0.0, 0.3, 0.5, 0.36, STONE["dark"], sides=7),
        _cylinder("shaft", 0.3, 1.5, 0.2, 0.14, STONE["mid"], sides=7),
        c.ring_tube("band", (0, 0, 0.95), 0.17, 0.025, METAL["gold"], segments=12),
        _cylinder("bowl", 1.5, 1.82, 0.14, 0.34, METAL["dark"], sides=8),
        c.ring_tube("lip", (0, 0, 1.82), 0.33, 0.03, METAL["gold"], segments=14),
    ]
    obj = _finish(parts, "torch", outline)
    return {"object": obj, "armature": None, "clips": {}, "previewTarget": 1.0, "previewDistance": 5}


def prism(data):
    """Prisma sobre un pedestal. Se ilumina del todo cuando el Pulso lo alcanza (lo pone el juego)."""
    outline = data["outline"]
    parts = [
        _cylinder("foot", 0.0, 0.26, 0.56, 0.44, STONE["dark"], sides=6),
        _cylinder("neck", 0.26, 0.62, 0.26, 0.2, STONE["mid"], sides=6),
        _cylinder("cup", 0.62, 0.78, 0.2, 0.36, METAL["dark"], sides=6),
    ]
    gem = _shard("gem", (0, 0, 1.28), (0.26, 0.26, 0.56), 5, (0, 0, 0.2), CRYSTAL)
    side = _shard("gemSide", (0.2, -0.05, 1.0), (0.1, 0.1, 0.26), 9, (0.3, 0.4, 0), CRYSTAL)
    obj = _finish([*parts, gem, side], "prism", outline)
    return {"object": obj, "armature": None, "clips": {}, "previewTarget": 0.9, "previewDistance": 4.5}


def shrine(data):
    """Altar donde se gana una habilidad. El juego pone encima una esfera de luz mientras esté sin tomar."""
    outline = data["outline"]
    parts = [
        _cylinder("step", 0.0, 0.18, 1.0, 0.92, STONE["dark"], sides=8),
        _cylinder("step2", 0.18, 0.36, 0.76, 0.68, STONE["mid"], sides=8),
        _cylinder("column", 0.36, 1.0, 0.4, 0.32, STONE["light"], sides=8),
        c.ring_tube("ring", (0, 0, 0.72), 0.38, 0.03, METAL["gold"], segments=16),
        _cylinder("top", 1.0, 1.14, 0.46, 0.54, STONE["mid"], sides=8),
    ]
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        base = (math.cos(a) * 0.5, math.sin(a) * 0.5, 1.12)
        tip = (math.cos(a) * 0.26, math.sin(a) * 0.26, 1.72)
        parts.append(c.tube(f"claw{i}", [base, tip], [0.05, 0.0], METAL["gold"], sides=5))
    glow = [c.ring_tube("rune", (0, 0, 0.27), 0.84, 0.03, GLOW["cyan"], segments=8, sides=4)]
    obj = _finish(parts, "shrine", outline, glow=glow)
    return {"object": obj, "armature": None, "clips": {}, "previewTarget": 0.9, "previewDistance": 5.5}


def crystalwall(data):
    """Barrera de cristal de 4 m de ancho. El juego la escala al hueco y la hace desaparecer al romperla."""
    outline = data["outline"]
    parts = []
    count = 7
    for i in range(count):
        x = -1.8 + i * 3.6 / (count - 1)
        height = 1.15 + (0.45 if i % 2 else 0.1)
        parts.append(_shard(f"big{i}", (x, 0, height), (0.42, 0.34, height + 0.1), 11 + i, (0.05 * (i - 3), 0, 0.05 * (3 - i)), CRYSTAL))
    for i in range(5):
        x = -1.6 + i * 0.8
        parts.append(_shard(f"low{i}", (x, -0.26, 0.5), (0.3, 0.2, 0.55), 31 + i, (0.2, 0, 0.1 * (i - 2)), CRYSTAL))
    obj = _finish(parts, "crystalwall", outline, thickness=0.014)
    return {"object": obj, "armature": None, "clips": {}, "previewTarget": 1.3, "previewDistance": 8}


BUILDERS = {"torch": torch, "prism": prism, "shrine": shrine, "crystalwall": crystalwall}


def build(data):
    return BUILDERS[data["model"]](data)
