"""Ropa y accesorios de los gemelos, ajustados a la forma del cuerpo.

Cada función devuelve piezas ya pintadas; quien llama decide los pesos de cada una.
"""

import math

import bmesh
from mathutils import Vector

import common as c
import sculpt as s
import twins_body as tb

# ---------------------------------------------------------------------------
# Zonas pintadas sobre el cuerpo
# ---------------------------------------------------------------------------

ALBA_ARM = [(0.095, "outfit"), (0.105, "accent"), (0.285, "skin"), (0.295, "accent"), (0.42, "outfitDark"), (9, "skin")]
ALBA_TORSO = [(0.955, "pants"), (0.965, "accent"), (1.035, "outfitDark"), (1.045, "accent"), (1.236, "outfit"), (9, "skin")]
ALBA_LEGS = [(0.31, "boots"), (9, "pants")]

CIRO_ARM = [(0.085, "outfit"), (0.093, "outfitDark"), (0.37, "skin"), (0.395, "accent"), (0.418, "skin"), (9, "outfitDark")]
CIRO_TORSO = [(0.925, "pants"), (1.236, "outfit"), (9, "skin")]
CIRO_LEGS = [(0.28, "boots"), (9, "pants")]


NECK_RADIUS = 0.052


def _pick(table, value, colors):
    for limit, key in table:
        if value <= limit:
            return colors[key]
    return colors[table[-1][1]]


def dress_body(body, model, colors):
    """Corta y pinta la ropa sobre el cuerpo."""
    if model == "alba":
        arm, torso, legs = ALBA_ARM, ALBA_TORSO, ALBA_LEGS
        extra = []
    else:
        arm, torso, legs = CIRO_ARM, CIRO_TORSO, CIRO_LEGS
        # Cortes del chaleco: abertura delantera, ribete y bajo.
        front = lambda p: p.y < 0 and 0.9 < p.z < 1.25 and tb.arm_param(p) is None
        extra = [((x, 0, 0), (1, 0, 0), front) for x in (0.042, -0.042, 0.054, -0.054)]
    tb.cut_zones(
        body,
        [limit for limit, _ in arm[:-1]],
        [limit for limit, _ in torso[:-1]] + ([0.95, 0.962] if model == "ciro" else []),
        [limit for limit, _ in legs[:-1]],
        extra,
    )
    def torso_zone(co):
        # Por encima de la línea de los hombros solo es piel el cuello; el resto sigue siendo ropa.
        if co.z > 1.236 and math.hypot(co.x, co.y - 0.006) > NECK_RADIUS:
            return colors[torso[-2][1]]
        return _pick(torso, co.z, colors)

    tb.paint_zones(
        body,
        torso_zone,
        lambda distance: _pick(arm, distance, colors),
        lambda z: _pick(legs, z, colors),
    )


# ---------------------------------------------------------------------------
# Piezas comunes
# ---------------------------------------------------------------------------

def arm_band(body, sx, distance, color, name, height=0.012, thickness=0.005, offset=0.001):
    point, normal = tb.arm_point(sx, distance)
    loop = s.section_loop(body, point, normal, point, samples=14)
    obj = s.band(name, loop, normal, height, thickness, offset)
    return c.paint_flat(obj, color)


def leg_band(body, sx, z, color, name, height=0.02, thickness=0.006):
    near = Vector((0.095 * sx, 0.008, z))
    loop = s.section_loop(body, near, (0, 0, 1), near, samples=16)
    obj = s.band(name, loop, (0, 0, 1), height, thickness, 0.001)
    return c.paint_flat(obj, color)


def boots_and_bands(body, model, colors):
    """Puños de las botas y bandas de mangas y muñecas. Devuelve [(pieza, hueso)]."""
    parts = []
    top = 0.32 if model == "alba" else 0.29
    for sx, side in ((1, "L"), (-1, "R")):
        parts.append((leg_band(body, sx, top, colors["accent"], f"bootCuff{side}"), f"shin.{side}"))
        if model == "alba":
            parts.append((arm_band(body, sx, 0.1, colors["accent"], f"sleeve{side}", 0.012, 0.006), f"upperarm.{side}"))
            parts.append((arm_band(body, sx, 0.29, colors["accent"], f"bracerTop{side}", 0.01, 0.004), f"forearm.{side}"))
        else:
            parts.append((arm_band(body, sx, 0.089, colors["outfitDark"], f"sleeve{side}", 0.01, 0.005), f"upperarm.{side}"))
            parts.append((arm_band(body, sx, 0.382, colors["accent"], f"wrist{side}", 0.022, 0.005), f"forearm.{side}"))
    return parts


# ---------------------------------------------------------------------------
# Alba
# ---------------------------------------------------------------------------

def alba_collar(body, colors):
    """Cuello alto con borde y una pequeña gema de luz delante."""
    loop = s.section_loop(body, (0, 0, 1.243), (0, 0, 1), (0, 0.005, 1.243), samples=22)
    lower = s.offset_loop(loop, (0, 0, 1), 0.004)
    upper = [p + Vector((0, 0, 0.024)) for p in s.offset_loop(loop, (0, 0, 1), 0.009)]
    collar = s.loft("collar", [lower, upper], closed=True)
    mod = collar.modifiers.new("thick", "SOLIDIFY")
    mod.thickness = 0.004
    mod.offset = 1
    c.apply_modifiers(collar)
    c.smooth(collar)
    c.paint_flat(collar, colors["accent"])
    front = min(lower, key=lambda p: p.y)
    gem = c.ellipsoid("gem", front + Vector((0, -0.01, 0.006)), (0.009, 0.006, 0.011), "#fff1b8", subdivisions=2)
    return collar, gem


def alba_skirt(body, colors):
    """Falda de tablas desde la cintura, con ribete en el bajo."""
    samples = 36
    waist = s.section_loop(body, (0, 0, 0.995), (0, 0, 1), (0, 0.005, 0.995), samples=samples)
    waist = s.offset_loop(waist, (0, 0, 1), 0.005)
    center = s.loop_center(waist)
    heights = [0.995, 0.96, 0.905, 0.85, 0.795, 0.752, 0.744, 0.726]
    rings = []
    for z in heights:
        t = (0.995 - z) / (0.995 - 0.726)
        flare = 1 + 1.0 * t ** 0.7
        amp = 0.011 * min(t * 2.5, 1.0)
        ring = []
        for j, p in enumerate(waist):
            radial = Vector((p.x - center.x, p.y - center.y, 0))
            # Tablas: zigzag de 16 pliegues (3 muestras cada uno).
            zig = (1.0, -0.4, -0.4)[j % 3]
            q = center + radial * flare + radial.normalized() * (amp * zig)
            ring.append(Vector((q.x, q.y + 0.012 * t, z)))
        rings.append(ring)
    skirt = s.loft("skirt", rings, closed=True)
    mod = skirt.modifiers.new("thick", "SOLIDIFY")
    mod.thickness = 0.004
    mod.offset = 1
    c.apply_modifiers(skirt)
    c.smooth(skirt)
    return c.paint(skirt, lambda co: colors["accent"] if co.z < 0.748 else colors["outfitDark"], per_face=True)


def alba_cape(colors):
    """Capa corta sobre los hombros que cae por la espalda, con pliegues y ribete."""
    # Filas: (altura, centro en Y, semiejes X e Y, ángulo máximo desde la espalda en grados).
    top_rows = [(1.258, 0.012, 0.066, 0.06, 74), (1.236, 0.016, 0.135, 0.084, 66), (1.205, 0.02, 0.17, 0.104, 58)]
    lower_rows = [(1.15, 0.022, 0.17, 0.108), (1.05, 0.03, 0.155, 0.112), (0.95, 0.04, 0.15, 0.12), (0.86, 0.05, 0.152, 0.128)]
    cols = 17
    rows = []
    for z, yc, rx, ry, amax in top_rows:
        rows.append([(z, yc, rx, ry, math.radians(amax) * (-1 + 2 * i / (cols - 1)), 0.0) for i in range(cols)])
    hem_v = [0.0, 0.3, 0.6, 0.85, 0.93, 1.0]
    for v in hem_v:
        row = []
        for i in range(cols):
            u = -1 + 2 * i / (cols - 1)
            amax = math.radians(52)
            bottom = 0.8 + 0.2 * u ** 4 + 0.05 * u * u
            z = 1.15 + (bottom - 1.15) * v
            k = min(max((1.15 - z) / (1.15 - 0.86), 0.0), 1.0)
            idx = min(int(k * (len(lower_rows) - 1)), len(lower_rows) - 2)
            f = k * (len(lower_rows) - 1) - idx
            a, b = lower_rows[idx], lower_rows[idx + 1]
            yc = a[1] + (b[1] - a[1]) * f
            rx = a[2] + (b[2] - a[2]) * f
            ry = a[3] + (b[3] - a[3]) * f
            row.append((z, yc + 0.02 * v * v, rx, ry, amax * u, v))
        rows.append(row)
    bm = bmesh.new()
    grid = []
    for row in rows:
        verts = []
        for z, yc, rx, ry, ang, v in row:
            fold = 1 + 0.13 * v ** 0.8 * math.sin(ang * 6.5)
            verts.append(bm.verts.new((math.sin(ang) * rx * fold, yc + math.cos(ang) * ry * fold, z)))
        grid.append(verts)
    for a, b in zip(grid, grid[1:]):
        for i in range(cols - 1):
            bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    cape = c._object_from_bmesh("cape", bm)
    mod = cape.modifiers.new("thick", "SOLIDIFY")
    mod.thickness = 0.006
    mod.offset = 0
    c.apply_modifiers(cape)
    c.smooth(cape)
    inner = s.shade_hex(colors["cloth"], 0.7)

    def color_of(poly):
        cen = poly.center
        outward = Vector((cen.x, cen.y - 0.01, 0)).normalized()
        if poly.normal.dot(outward) < -0.2:
            return inner
        uu = min(abs(math.atan2(cen.x, cen.y - 0.02)) / math.radians(52), 1.0)
        bottom = 0.8 + 0.2 * uu ** 4 + 0.05 * uu * uu
        return colors["outfitDark"] if cen.z < bottom + (1.15 - bottom) * 0.075 else colors["cloth"]

    s._paint_by_index(cape, [color_of(p) for p in cape.data.polygons])
    return cape


# ---------------------------------------------------------------------------
# Ciro
# ---------------------------------------------------------------------------

def ciro_vest(body, colors):
    """Chaleco abierto: una capa separada del cuerpo en el tronco, con ribete delante y en el bajo."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.normal_update()

    def in_vest(f):
        cen = f.calc_center_median()
        if tb.arm_param(cen) is not None or cen.z < 0.95:
            return False
        if cen.z > 1.236 and math.hypot(cen.x, cen.y - 0.006) < NECK_RADIUS:
            return False
        return not (cen.y < 0 and abs(cen.x) < 0.042)

    remove = [f for f in bm.faces if not in_vest(f)]
    normals = {v.index: v.normal.copy() for v in bm.verts}
    for v in bm.verts:
        v.co += normals[v.index] * 0.006
    bmesh.ops.delete(bm, geom=remove, context="FACES")
    vest = c._object_from_bmesh("vest", bm)
    mod = vest.modifiers.new("thick", "SOLIDIFY")
    mod.thickness = 0.004
    mod.offset = -1
    c.apply_modifiers(vest)
    c.smooth(vest)
    trim = lambda co: (co.y < 0 and abs(co.x) < 0.054) or co.z < 0.962
    return c.paint(vest, lambda co: colors["accent"] if trim(co) else colors["outfitDark"], per_face=True)


def ciro_belt(body, colors):
    loop = s.section_loop(body, (0, 0, 0.94), (0, 0, 1), (0, 0.005, 0.94), samples=28)
    belt = c.paint_flat(s.band("belt", loop, (0, 0, 1), 0.026, 0.008, 0.002), colors["boots"])
    front = min(loop, key=lambda p: p.y)
    buckle = c.box("buckle", front + Vector((0, -0.009, 0)), (0.028, 0.008, 0.026), colors["accent"])
    return belt, buckle


def ciro_scarf(body, colors):
    """Bufanda de dos vueltas al cuello y dos colas por la espalda. Devuelve (vueltas, colas)."""
    cloth = colors["cloth"]
    wraps = []
    # Dos vueltas: elipses alrededor del cuello (justo encima de los hombros).
    for i, (z, rx, ry, height, thick) in enumerate(((1.252, 0.058, 0.054, 0.038, 0.022), (1.282, 0.05, 0.048, 0.03, 0.018))):
        loop = [Vector((math.sin(a) * rx, 0.008 + math.cos(a) * ry, z)) for a in (2 * math.pi * k / 22 for k in range(22))]
        wraps.append(c.paint_flat(s.band(f"scarfWrap{i}", loop, (0, 0, 1), height, thick, 0.0), cloth if i == 0 else s.shade_hex(cloth, 0.9)))
    inner = s.shade_hex(cloth, 0.72)

    def colors_fn(t, outer):
        if 0.84 <= t <= 0.9:
            return colors["accent"]
        return cloth if outer else inner

    outward = lambda p: Vector((0.35 if p.x > 0 else -0.35, 1, 0.2))
    tails = [
        s.lock("scarfTail1", [(0.03, 0.055, 1.252), (0.045, 0.105, 1.19), (0.058, 0.145, 1.07), (0.064, 0.165, 0.94)],
               [0.036, 0.04, 0.042, 0.042], 0.007, outward, colors_fn, curl=0.0, steps=7, extra_t=(0.84, 0.9), open_end=True),
        s.lock("scarfTail2", [(-0.012, 0.055, 1.247), (-0.032, 0.1, 1.185), (-0.048, 0.135, 1.1), (-0.056, 0.152, 1.01)],
               [0.034, 0.037, 0.039, 0.039], 0.007, outward, colors_fn, curl=0.0, steps=7, extra_t=(0.84, 0.9), open_end=True),
    ]
    return wraps, tails
