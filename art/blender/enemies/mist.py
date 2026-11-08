"""Piezas comunes de las criaturas de la Bruma: paleta, ojos que brillan, mechones de bruma y ensamblado.

Las criaturas son de bruma oscura con reflejos violetas y ojos de luz; al morir se deshacen en ceniza (en el juego).
"""

import math

from mathutils import Vector

import common as c
import rig as r
import sculpt as s

PALETTE = {
    "body": "#33294c",
    "bodyLight": "#4b3d6e",
    "bodyTop": "#6a5894",
    "belly": "#241c38",
    "wisp": "#7d6aa8",
    "wispTip": "#b3a3d9",
    "rock": "#6a6e86",
    "rockLight": "#8d92aa",
    "rockDark": "#474a5f",
    "mask": "#e2d8c6",
    "maskShade": "#b9ae9b",
    "eyeAmber": "#ffd27a",
    "eyeCyan": "#9ff4ff",
    "ember": "#ff9b4a",
    "pupil": "#1a1226",
}


def gradient(low, mid, high, z_low, z_high):
    """Color por altura: oscuro abajo, base en medio, claro arriba (luz de la bruma)."""

    def color(co):
        t = (co.z - z_low) / max(z_high - z_low, 1e-6)
        if t < 0.28:
            return low
        if t > 0.78:
            return high
        return mid

    return color


def body_from_blob(blob, name, target_tris, color_fn, resolution=0.012):
    """Convierte un Blob en malla suave, la reduce y la pinta por caras."""
    obj = blob.to_object(name, resolution=resolution)
    s.decimate(obj, target_tris)
    c.smooth(obj)
    return c.paint(obj, color_fn, per_face=True)


def glow_eye(name, center, radii, color):
    """Ojo de luz: un óvalo que brilla (material "glow") algo hundido en la cara."""
    eye = c.ellipsoid(name, center, radii, color, subdivisions=2)
    c.smooth(eye)
    return eye


class Surface:
    """Consultas sobre una malla (para pegar ojos, placas y mechones a la superficie)."""

    def __init__(self, obj):
        import bpy
        from mathutils.bvhtree import BVHTree

        self.tree = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())

    def hit(self, origin, direction, margin=0.0):
        """Primer punto de la superficie desde `origin` en `direction` (hacia dentro), separado `margin` hacia fuera."""
        d = Vector(direction).normalized()
        point, normal, _i, _dist = self.tree.ray_cast(Vector(origin), d)
        if point is None:
            # Sin esto la pieza quedaría flotando en el punto de partida del rayo.
            raise ValueError(f"El rayo desde {tuple(origin)} no toca el cuerpo")
        return point + normal * margin

    def front(self, x, z, margin=0.0):
        """Punto de la cara delantera (-Y) a una altura y un lado dados."""
        return self.hit((x, -3.0, z), (0, 1, 0), margin)


def wisp(name, points, width, outward, thickness=0.02, tip_color=None, base_color=None):
    """Mechón de bruma que se afina en la punta, con la punta más clara."""
    base = base_color or PALETTE["wisp"]
    tip = tip_color or PALETTE["wispTip"]
    widths = [width * (1 - 0.15 * i) for i in range(len(points) - 1)] + [0.0]

    def colors(t, outer):
        if not outer:
            return PALETTE["body"]
        return tip if t > 0.62 else base

    return s.lock(name, points, widths, thickness, outward, colors, curl=0.2, steps=7, extra_t=(0.62,), across=4)


def finish(model, armature, toon_parts, glow_parts, outline_hex, outline=0.008):
    """Une las piezas: las de bandas de luz llevan contorno; las que brillan van aparte sin contorno."""
    body = c.join(toon_parts, f"{model}Body")
    c.assign_material(body, c.MAT_TOON)
    c.add_outline(body, outline, outline_hex, tint=True)
    parts = [body]
    if glow_parts:
        glow = c.join(glow_parts, f"{model}Glow")
        c.assign_material(glow, c.MAT_GLOW, emission=1.5)
        parts.append(glow)
    mesh = c.join(parts, model)
    if not any(m.type == "ARMATURE" for m in mesh.modifiers):
        r.bind_with_groups(mesh, armature)
    mesh.parent = armature
    return mesh


def frames_for(seconds):
    return r.clip_frames(seconds)


def orbit_points(center, radius, count, z_offset=0.0, start=0.0):
    """Puntos repartidos en un círculo horizontal."""
    cx, cy, cz = center
    return [
        Vector((cx + math.cos(start + 2 * math.pi * i / count) * radius, cy + math.sin(start + 2 * math.pi * i / count) * radius, cz + z_offset))
        for i in range(count)
    ]


def rock(name, center, radii, seed=0, tilt=(0.0, 0.0, 0.0)):
    """Roca angulosa (icosfera irregular, caras planas), clara por arriba y oscura por abajo."""
    import random

    import bmesh
    from mathutils import Euler

    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    rot = Euler(tilt).to_matrix()
    for v in bm.verts:
        jitter = 1 + rnd.uniform(-0.18, 0.18)
        co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2])) * jitter
        v.co = rot @ co + Vector(center)
    obj = c._object_from_bmesh(name, bm)
    c.smooth(obj, False)
    colors = []
    for poly in obj.data.polygons:
        n = poly.normal.z
        colors.append(PALETTE["rockLight"] if n > 0.45 else PALETTE["rockDark"] if n < -0.25 else PALETTE["rock"])
    s._paint_by_index(obj, colors)
    return obj


def gradient_weights(obj, bones, axis_values, axis=2):
    """Reparte el peso entre una cadena de huesos según la posición en un eje (z por defecto).

    `axis_values` = valor del eje en cada hueso, en el mismo orden que `bones`.
    """
    groups = [obj.vertex_groups.get(b) or obj.vertex_groups.new(name=b) for b in bones]
    for v in obj.data.vertices:
        value = (obj.matrix_world @ v.co)[axis]
        weights = [0.0] * len(bones)
        if (value - axis_values[0]) * (axis_values[-1] - axis_values[0]) <= 0:
            weights[0] = 1.0
        elif (value - axis_values[-1]) * (axis_values[-1] - axis_values[0]) >= 0:
            weights[-1] = 1.0
        else:
            for k in range(len(bones) - 1):
                a, b = axis_values[k], axis_values[k + 1]
                if (value - a) * (value - b) <= 0:
                    f = (value - a) / (b - a) if b != a else 0.0
                    weights[k] = 1 - f
                    weights[k + 1] = f
                    break
        for g, w in zip(groups, weights):
            g.add([v.index], w, "REPLACE")
