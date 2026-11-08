"""Objetos del mundo: cofre, faro, interruptor, bloque empujable, plataforma de presión y puerta.

Cada modelo tiene el origen en el suelo y su frente mira hacia -Y. Las piezas que el juego mueve van en un objeto
aparte con nombre propio: la tapa del cofre (`chestLid`, con el origen en la bisagra) y las rejas (`gateBars`).
"""

import math

from mathutils import Matrix, Vector

import common as c

STONE = {"light": "#a7a196", "mid": "#8a857c", "dark": "#6a665f", "moss": "#6f9a5a"}
WOOD = {"light": "#a8703f", "mid": "#8a5a33", "dark": "#5f3d25"}
METAL = {"gold": "#e8c25a", "dark": "#4a4650"}
GLOW = {"warm": "#ffd98a", "cyan": "#8fe9ff"}


def _finish(parts, name, outline, thickness=0.012, glow=None):
    """Une las piezas, les da el material de bandas de luz y el contorno; lo que brilla va sin contorno."""
    obj = c.join(parts, name)
    c.assign_material(obj, c.MAT_TOON)
    c.add_outline(obj, thickness, outline, tint=True)
    if glow:
        lit = c.join(glow, f"{name}Glow")
        c.assign_material(lit, c.MAT_GLOW, emission=1.2)
        obj = c.join([obj, lit], name)
    return obj


def _move_origin(obj, point):
    """Lleva el origen del objeto a `point` sin mover la malla (bisagras y piezas móviles)."""
    obj.data.transform(Matrix.Translation(-Vector(point)))
    obj.location = Vector(point)


def _cylinder(name, z_from, z_to, r_from, r_to, color, sides=10, at=(0, 0)):
    return c.tube(name, [(at[0], at[1], z_from), (at[0], at[1], z_to)], [r_from, r_to], color, sides=sides, cap_end=False)


def chest(data):
    outline = data["outline"]
    w, d, h = 1.0, 0.68, 0.46
    body = [c.box("base", (0, 0, h / 2), (w, d, h), WOOD["mid"])]
    for x in (-0.46, 0.46):
        body.append(c.box(f"band{x}", (x, 0, h / 2), (0.1, d + 0.03, h + 0.02), METAL["gold"]))
    body.append(c.box("rim", (0, 0, h - 0.03), (w + 0.03, d + 0.03, 0.06), WOOD["dark"]))
    body.append(c.box("plinth", (0, 0, 0.03), (w + 0.05, d + 0.05, 0.06), WOOD["dark"]))
    base = _finish(body, "chestBody", outline)

    # Tapa abovedada: un semicilindro a lo largo de X, con el borde sobre la caja.
    hinge = (0, d / 2, h)
    lid_parts = []
    steps = 6
    radius_y = d / 2
    radius_z = 0.3
    for i in range(steps):
        a0 = math.pi * i / steps
        a1 = math.pi * (i + 1) / steps
        y0, z0 = math.cos(a0) * radius_y, h + math.sin(a0) * radius_z
        y1, z1 = math.cos(a1) * radius_y, h + math.sin(a1) * radius_z
        cy, cz = (y0 + y1) / 2, (z0 + z1) / 2
        length = math.hypot(y1 - y0, z1 - z0)
        angle = math.atan2(z1 - z0, y1 - y0)
        lid_parts.append(
            c.box(f"lid{i}", (0, cy, cz), (w, length + 0.01, 0.06), WOOD["light"], rotation=(angle, 0, 0))
        )
        for x in (-0.46, 0.46):
            lid_parts.append(
                c.box(f"lidBand{i}{x}", (x, cy, cz), (0.1, length + 0.015, 0.075), METAL["gold"], rotation=(angle, 0, 0))
            )
    # Tapas laterales de la bóveda.
    for x in (-w / 2 + 0.03, w / 2 - 0.03):
        cap = c.ellipsoid(f"lidCap{x}", (x, 0, h), (0.03, radius_y - 0.02, radius_z - 0.02), WOOD["mid"], subdivisions=2)
        lid_parts.append(cap)
    lock = c.box("lock", (0, -d / 2 - 0.015, h + 0.02), (0.15, 0.04, 0.18), METAL["gold"])
    lid_parts.append(lock)
    lid = _finish(lid_parts, "chestLid", outline, glow=[c.ellipsoid("gem", (0, -d / 2 - 0.04, h + 0.02), (0.035, 0.018, 0.035), GLOW["warm"], subdivisions=1)])
    _move_origin(lid, hinge)
    return {"object": base, "armature": None, "clips": {}, "previewTarget": 0.4, "previewDistance": 3.2}


def beacon(data):
    outline = data["outline"]
    parts = [
        _cylinder("step", 0.0, 0.16, 0.72, 0.66, STONE["dark"], sides=8),
        _cylinder("step2", 0.16, 0.3, 0.52, 0.46, STONE["mid"], sides=8),
        _cylinder("column", 0.3, 1.7, 0.24, 0.17, STONE["light"], sides=8),
        c.ring_tube("ringLow", (0, 0, 0.62), 0.225, 0.028, METAL["gold"], segments=16),
        c.ring_tube("ringHigh", (0, 0, 1.5), 0.185, 0.024, METAL["gold"], segments=16),
        _cylinder("cup", 1.7, 1.92, 0.17, 0.3, METAL["dark"], sides=10),
    ]
    # Brazos que sujetan la llama de luz.
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        base = (math.cos(a) * 0.27, math.sin(a) * 0.27, 1.9)
        tip = (math.cos(a) * 0.15, math.sin(a) * 0.15, 2.5)
        mid = (math.cos(a) * 0.32, math.sin(a) * 0.32, 2.25)
        parts.append(c.tube(f"arm{i}", [base, mid, tip], [0.028, 0.024, 0.0], METAL["gold"], sides=5))
    flame = c.ellipsoid("flame", (0, 0, 2.16), (0.16, 0.16, 0.26), GLOW["warm"], subdivisions=2)
    obj = _finish(parts, "beacon", outline, glow=[flame])
    return {"object": obj, "armature": None, "clips": {}, "previewTarget": 1.2, "previewDistance": 6}


def switch(data):
    outline = data["outline"]
    parts = [
        _cylinder("foot", 0.0, 0.14, 0.48, 0.42, STONE["dark"], sides=8),
        _cylinder("shaft", 0.14, 0.82, 0.26, 0.2, STONE["mid"], sides=8),
        _cylinder("top", 0.82, 0.98, 0.36, 0.42, STONE["light"], sides=8),
        c.ring_tube("rim", (0, 0, 0.98), 0.38, 0.03, METAL["gold"], segments=18),
    ]
    obj = _finish(parts, "switch", outline)
    return {"object": obj, "armature": None, "clips": {}, "previewTarget": 0.6, "previewDistance": 3.6}


def pushblock(data):
    outline = data["outline"]
    s, h = 1.76, 1.36
    parts = [c.box("core", (0, 0, h / 2), (s, s, h), STONE["mid"])]
    # Listones de las aristas, para que se lea como un bloque tallado.
    for x, y in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        parts.append(c.box(f"edge{x}{y}", (x * (s / 2 - 0.08), y * (s / 2 - 0.08), h / 2), (0.2, 0.2, h + 0.02), STONE["light"]))
    parts.append(c.box("cap", (0, 0, h - 0.06), (s + 0.04, s + 0.04, 0.14), STONE["dark"]))
    parts.append(c.box("foot", (0, 0, 0.06), (s + 0.04, s + 0.04, 0.12), STONE["dark"]))
    glow = []
    # Runas que brillan en las cuatro caras.
    for i, (nx, ny) in enumerate(((0, -1), (0, 1), (1, 0), (-1, 0))):
        offset = s / 2 + 0.008
        px, py = nx * offset, ny * offset
        across = (0.42, 0.012, 0.09) if ny else (0.012, 0.42, 0.09)
        upright = (0.09, 0.012, 0.5) if ny else (0.012, 0.09, 0.5)
        glow.append(c.box(f"runeH{i}", (px, py, h / 2 - 0.08), across, GLOW["cyan"]))
        glow.append(c.box(f"runeV{i}", (px, py, h / 2 + 0.02), upright, GLOW["cyan"]))
    glow.append(c.box("runeTop", (0, 0, h + 0.005), (0.5, 0.5, 0.012), GLOW["cyan"]))
    obj = _finish(parts, "pushblock", outline, thickness=0.014, glow=glow)
    return {"object": obj, "armature": None, "clips": {}, "previewTarget": 0.7, "previewDistance": 5}


def plate(data):
    outline = data["outline"]
    parts = [
        _cylinder("rim", 0.0, 0.08, 0.98, 0.94, STONE["dark"], sides=8),
        _cylinder("disc", 0.08, 0.13, 0.78, 0.74, STONE["light"], sides=8),
    ]
    glow = [c.ring_tube("ring", (0, 0, 0.11), 0.86, 0.035, GLOW["cyan"], segments=8, sides=4)]
    obj = _finish(parts, "plate", outline, glow=glow)
    return {"object": obj, "armature": None, "clips": {}, "previewTarget": 0.1, "previewDistance": 4}


def gate(data):
    """Puerta de 4 m de ancho. El juego la escala al hueco y hunde las rejas al abrirla."""
    outline = data["outline"]
    half = 2.0
    height = 3.0
    posts = []
    for sx in (1, -1):
        posts.append(c.box(f"post{sx}", (sx * (half + 0.22), 0, height / 2 + 0.2), (0.44, 0.6, height + 0.4), STONE["mid"]))
        posts.append(c.box(f"cap{sx}", (sx * (half + 0.22), 0, height + 0.46), (0.56, 0.72, 0.16), STONE["dark"]))
        posts.append(c.box(f"foot{sx}", (sx * (half + 0.22), 0, 0.1), (0.56, 0.72, 0.2), STONE["dark"]))
    posts_obj = _finish(posts, "gatePosts", outline)
    bars = []
    count = 7
    for i in range(count):
        x = -half + 0.25 + i * (2 * half - 0.5) / (count - 1)
        bars.append(c.box(f"bar{i}", (x, 0, height / 2), (0.14, 0.14, height), WOOD["dark"]))
        bars.append(c.ellipsoid(f"tip{i}", (x, 0, 0.02), (0.1, 0.1, 0.14), METAL["dark"], subdivisions=1))
    for z in (0.7, 1.6, 2.5):
        bars.append(c.box(f"rail{z}", (0, 0, z), (2 * half, 0.1, 0.16), METAL["dark"]))
    _finish(bars, "gateBars", outline, thickness=0.012)
    return {"object": posts_obj, "armature": None, "clips": {}, "previewTarget": 1.6, "previewDistance": 8.5}


BUILDERS = {"chest": chest, "beacon": beacon, "switch": switch, "pushblock": pushblock, "plate": plate, "gate": gate}


def build(data):
    return BUILDERS[data["model"]](data)
