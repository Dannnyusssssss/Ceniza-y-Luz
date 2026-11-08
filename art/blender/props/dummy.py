"""Muñeco de práctica: poste de madera con pies, cuerpo de paja atado con cuerdas, diana y cabeza de paja.

El origen está en el suelo, en el centro del poste; la diana mira hacia -Y (el frente). El juego lo balancea
entero desde la base al recibir un golpe.
"""

import math

import bmesh

import common as c

COLORS = {
    "wood": "#8a5a3b",
    "woodDark": "#6b4430",
    "straw": "#e3c27a",
    "strawDark": "#c39a52",
    "rope": "#7b4e2f",
    "target": "#c8553d",
    "targetLight": "#f3e6c8",
}


def _straw_tufts(name, center, radius, z_dir, count, length, color):
    """Puntas de paja que asoman de un borde (cónicas, en corona)."""
    tufts = []
    for i in range(count):
        a = 2 * math.pi * i / count + 0.3 * (i % 2)
        base = (center[0] + math.cos(a) * radius, center[1] + math.sin(a) * radius, center[2])
        tip = (
            base[0] + math.cos(a) * length * 0.5,
            base[1] + math.sin(a) * length * 0.5,
            base[2] + z_dir * length * (0.8 + 0.3 * ((i * 7) % 3) / 2),
        )
        tufts.append(c.tube(f"{name}{i}", [base, tip], [0.028, 0.0], color, sides=4))
    return tufts


def _target():
    """Diana: un solo disco con anillos de color pintados, delante del pecho (su cara mira a -Y)."""
    rings = [0.0, 0.04, 0.09, 0.14, 0.19]
    colors = [COLORS["targetLight"], COLORS["target"], COLORS["targetLight"], COLORS["target"]]
    segments = 24
    front_y, back_y, z = -0.29, -0.268, 1.08
    bm = bmesh.new()
    center_front = bm.verts.new((0, front_y, z))
    center_back = bm.verts.new((0, back_y, z))
    loops_front, loops_back = [], []
    for r in rings[1:]:
        loops_front.append([bm.verts.new((math.cos(2 * math.pi * k / segments) * r, front_y, z + math.sin(2 * math.pi * k / segments) * r)) for k in range(segments)])
        loops_back.append([bm.verts.new((math.cos(2 * math.pi * k / segments) * r, back_y, z + math.sin(2 * math.pi * k / segments) * r)) for k in range(segments)])
    for k in range(segments):
        k2 = (k + 1) % segments
        bm.faces.new((center_front, loops_front[0][k], loops_front[0][k2]))
        bm.faces.new((center_back, loops_back[0][k2], loops_back[0][k]))
        for a, b in zip(loops_front, loops_front[1:]):
            bm.faces.new((a[k], b[k], b[k2], a[k2]))
        for a, b in zip(loops_back, loops_back[1:]):
            bm.faces.new((a[k2], b[k2], b[k], a[k]))
        outer_f, outer_b = loops_front[-1], loops_back[-1]
        bm.faces.new((outer_f[k], outer_b[k], outer_b[k2], outer_f[k2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = c._object_from_bmesh("target", bm)

    def color(co):
        r = math.hypot(co.x, co.z - z)
        for limit, col in zip(rings[1:], colors):
            if r <= limit - 1e-4:
                return col
        return COLORS["target"]

    return c.paint(obj, color, per_face=True)


def build(data):
    parts = []
    # Poste y pies en cruz.
    parts.append(c.tube("post", [(0, 0, 0.0), (0, 0, 0.9), (0, 0, 1.62)], [0.06, 0.055, 0.05], COLORS["wood"], sides=8))
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        end = (math.cos(a) * 0.32, math.sin(a) * 0.32, 0.03)
        parts.append(c.tube(f"foot{i}", [(0, 0, 0.1), end], [0.04, 0.035], COLORS["woodDark"], sides=6))
    # Brazos: travesaño con paja en los extremos.
    parts.append(c.tube("arms", [(-0.55, 0, 1.24), (0, 0, 1.26), (0.55, 0, 1.24)], [0.045, 0.05, 0.045], COLORS["wood"], sides=6))
    for sx in (1, -1):
        parts += [
            c.ellipsoid(f"hand{sx}", (0.56 * sx, 0, 1.24), (0.07, 0.07, 0.08), COLORS["straw"], subdivisions=2),
            c.ring_tube(f"wrist{sx}", (0.5 * sx, 0, 1.24), 0.06, 0.012, COLORS["rope"], segments=10),
        ]
        # El anillo de la muñeca rodea el brazo (eje X): se gira 90°.
        ring = parts[-1]
        for v in ring.data.vertices:
            x, y, z = v.co.x - 0.5 * sx, v.co.y, v.co.z - 1.24
            v.co = (0.5 * sx + z, y, 1.24 - x)
    # Cuerpo de paja con dos cuerdas.
    body = c.ellipsoid("body", (0, 0, 1.05), (0.32, 0.26, 0.42), COLORS["straw"], subdivisions=3)
    c.paint(body, lambda co: COLORS["strawDark"] if (co.z < 0.78 or (co.x * 3 + co.z * 7) % 0.2 < 0.03) else COLORS["straw"])
    c.smooth(body)
    parts.append(body)
    for z in (0.86, 1.27):
        # El anillo sigue el contorno del elipsoide a esa altura.
        k = math.sqrt(1 - ((z - 1.05) / 0.42) ** 2)
        parts.append(c.ring_tube(f"rope{z}", (0, 0, z), 0.32 * k + 0.004, 0.018, COLORS["rope"], segments=18, scale=(1.0, 0.81)))
    parts += _straw_tufts("tuftLow", (0, 0, 0.7), 0.17, -1, 9, 0.12, COLORS["strawDark"])
    # La diana va aparte (sin sombreado suave) y bien separada de la paja, para que no se peleen en profundidad.
    target = _target()
    # Cabeza con cuello de cuerda y mechón de paja.
    parts.append(c.ellipsoid("head", (0, 0, 1.66), (0.17, 0.16, 0.18), COLORS["straw"], subdivisions=2))
    parts.append(c.ring_tube("neck", (0, 0, 1.5), 0.09, 0.016, COLORS["rope"], segments=12))
    parts += _straw_tufts("tuftTop", (0, 0, 1.8), 0.05, 1, 6, 0.09, COLORS["strawDark"])

    soft = c.join(parts, "dummySoft")
    c.smooth(soft)
    obj = c.join([soft, target], "dummy")
    c.assign_material(obj, c.MAT_TOON)
    c.add_outline(obj, 0.008, data["outline"], tint=True)
    return {"object": obj, "armature": None, "clips": {}, "previewTarget": 1.0, "previewDistance": 4.2}
