"""Cabeza, cara (pieza con textura) y peinados de los gemelos."""

import math

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import common as c
import facepaint
import sculpt as s

HEAD_CENTER = Vector((0.0, 0.006, 1.412))
HEAD_RADII = Vector((0.118, 0.126, 0.136))


# ---------------------------------------------------------------------------
# Cabeza
# ---------------------------------------------------------------------------

def _head_shape(d):
    """Lleva un punto de la esfera unidad a la forma de cabeza anime: cráneo redondo, cara plana, barbilla fina."""
    x, y, z = d.x * HEAD_RADII.x, d.y * HEAD_RADII.y, d.z * HEAD_RADII.z
    t = max(-d.z, 0.0)
    x *= 1 - 0.42 * t ** 1.45
    if d.y < 0:
        y *= 0.93 - 0.1 * t
        y -= 0.006 * t * t
    else:
        y *= 1 - 0.36 * t ** 1.2
    p = HEAD_CENTER + Vector((x, y, z))
    if d.y < 0:
        # Nariz: un pequeño relieve para que se lea de perfil.
        bump = math.exp(-((p.x / 0.0075) ** 2 + ((p.z - 1.356) / 0.013) ** 2))
        p.y -= 0.0065 * bump
    return p


def head_object(colors):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=22, radius=1.0)
    for v in bm.verts:
        v.co = _head_shape(v.co.normalized())
    obj = c._object_from_bmesh("head", bm)
    c.smooth(obj)
    return c.paint_flat(obj, colors["skin"])


def ears(colors):
    parts = []
    for sx in (1, -1):
        ear = c.ellipsoid(f"ear{sx}", (0.0, 0.0, 0.0), (0.009, 0.019, 0.027), colors["skin"], subdivisions=1)
        for v in ear.data.vertices:
            # Inclinada hacia atrás y algo abierta.
            co = v.co
            co.y, co.z = co.y * 0.96 + co.z * 0.28, co.z * 0.96 - co.y * 0.28
            v.co = co + Vector((0.112 * sx, 0.016, 1.39))
        c.smooth(ear)
        parts.append(ear)
    return parts


class HeadSurface:
    """Consultas sobre la superficie de la cabeza (para colocar pelo y cara)."""

    def __init__(self, head):
        self.tree = BVHTree.FromObject(head, bpy.context.evaluated_depsgraph_get())

    def along(self, direction, margin=0.0):
        """Punto de la superficie en una dirección desde el centro, separado `margin` hacia fuera."""
        d = Vector(direction).normalized()
        hit, _n, _i, _dist = self.tree.ray_cast(HEAD_CENTER + d * 0.4, -d)
        if hit is None:
            hit = HEAD_CENTER + d * 0.12
        return hit + d * margin

    def at(self, azimuth, elevation, margin=0.0):
        """Ángulos en radianes: acimut desde la nuca (+Y) hacia la izquierda (+X); elevación desde el ecuador."""
        d = Vector((math.sin(azimuth) * math.cos(elevation), math.cos(azimuth) * math.cos(elevation), math.sin(elevation)))
        return self.along(d, margin)

    def front_y(self, x, z):
        hit, _n, _i, _d = self.tree.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
        return hit.y if hit is not None else HEAD_CENTER.y - 0.1


def face_decal(head, colors, style, texture_path, model):
    """Pieza fina sobre la cara con la textura de ojos, cejas, nariz y boca."""
    (x0, x1), (z0, z1) = facepaint.FACE_RANGE
    image = facepaint.draw_face(texture_path, f"{model}-face", colors, style)
    bm = bmesh.new()
    bm.from_mesh(head.data)
    keep = set()
    for f in bm.faces:
        cen = f.calc_center_median()
        if abs(cen.x) < x1 + 0.006 and z0 - 0.006 < cen.z < z1 + 0.006 and cen.y < HEAD_CENTER.y - 0.03:
            keep.add(f)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in keep], context="FACES")
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * 0.0011
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = ((co.x - x0) / (x1 - x0), (co.z - z0) / (z1 - z0))
    obj = c._object_from_bmesh(f"{model}Face", bm)
    c.smooth(obj)
    c.paint_flat(obj, "#ffffff")
    _face_material(obj, image)
    return obj


def _face_material(obj, image):
    """Material "face": textura recortada por alfa (en Blender, solo para la vista previa)."""
    mat = bpy.data.materials.new("face")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Linear"
    diffuse = nodes.new("ShaderNodeBsdfDiffuse")
    to_rgb = nodes.new("ShaderNodeShaderToRGB")
    ramp = nodes.new("ShaderNodeValToRGB")
    c.toon_ramp(ramp)
    mix = nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MULTIPLY"
    mix.inputs["Fac"].default_value = 1.0
    emit = nodes.new("ShaderNodeEmission")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    cutoff = nodes.new("ShaderNodeMath")
    cutoff.operation = "GREATER_THAN"
    cutoff.inputs[1].default_value = 0.5
    shader_mix = nodes.new("ShaderNodeMixShader")
    links.new(diffuse.outputs["BSDF"], to_rgb.inputs["Shader"])
    links.new(to_rgb.outputs["Color"], ramp.inputs["Fac"])
    links.new(tex.outputs["Color"], mix.inputs["Color1"])
    links.new(ramp.outputs["Color"], mix.inputs["Color2"])
    links.new(mix.outputs["Color"], emit.inputs["Color"])
    links.new(tex.outputs["Alpha"], cutoff.inputs[0])
    links.new(cutoff.outputs["Value"], shader_mix.inputs["Fac"])
    links.new(transparent.outputs["BSDF"], shader_mix.inputs[1])
    links.new(emit.outputs["Emission"], shader_mix.inputs[2])
    links.new(shader_mix.outputs["Shader"], out.inputs["Surface"])
    obj.data.materials.append(mat)


# ---------------------------------------------------------------------------
# Pelo
# ---------------------------------------------------------------------------

def hair_palette(colors):
    base = colors["hair"]
    return {
        "base": base,
        # Brillo del mismo tono, más claro (no gris): se aclara y se mezcla un poco con blanco.
        "shine": s.shade_hex(s.shade_hex(base, 1.0, toward="#ffffff", amount=0.12), 1.55),
        "inner": s.shade_hex(base, 0.72),
    }


BAND = (1.486, 1.506)


def _band_ts(points, z_from, z_to):
    """Posiciones t donde la curva cruza las alturas de la franja de brillo."""
    pts = [Vector(p) for p in points]
    ts = []
    prev = s._catmull(pts, 0.0).z
    for i in range(1, 201):
        t = i / 200
        z = s._catmull(pts, t).z
        for edge in (z_from, z_to):
            if (prev - edge) * (z - edge) < 0:
                ts.append(t - 0.0025)
        prev = z
    return ts


def _hair_colors(points, palette):
    pts = [Vector(p) for p in points]

    def color(t, outer):
        if not outer:
            return palette["inner"]
        z = s._catmull(pts, t).z
        return palette["shine"] if BAND[0] <= z <= BAND[1] else palette["base"]

    return color


def hair_lock(name, points, widths, thickness, palette, outward=None, curl=0.25, steps=7):
    outward = outward or (lambda p: p - HEAD_CENTER)
    return s.lock(
        name, points, widths, thickness, outward, _hair_colors(points, palette),
        curl=curl, steps=steps, extra_t=_band_ts(points, *BAND), across=4,
    )


def hair_cap(surface, palette, nape_elevation, front_elevation, margin=0.009):
    """Casquete de pelo pegado al cráneo; se recorta en la cara y la nuca."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=22, radius=1.0)
    for v in bm.verts:
        v.co = surface.along(v.co.normalized(), margin)

    def keep(cen):
        d = (cen - HEAD_CENTER).normalized()
        elevation = math.asin(max(-1.0, min(1.0, d.z)))
        azimuth = abs(math.atan2(d.x, d.y))
        blend = min(max((azimuth - math.radians(70)) / math.radians(60), 0.0), 1.0)
        blend = blend * blend * (3 - 2 * blend)
        limit = nape_elevation + (front_elevation - nape_elevation) * blend
        return elevation > limit

    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(f.calc_center_median())], context="FACES")
    obj = c._object_from_bmesh("hairCap", bm)
    mod = obj.modifiers.new("thick", "SOLIDIFY")
    mod.thickness = 0.008
    mod.offset = -1
    c.apply_modifiers(obj)
    c.smooth(obj)
    return c.paint(obj, lambda co: palette["shine"] if BAND[0] <= co.z <= BAND[1] else palette["base"], per_face=True)


def _bangs(surface, palette, layout, swept=0.0):
    """Flequillo: mechones desde la coronilla que caen sobre la frente."""
    locks = []
    for i, (x, tip_z, width) in enumerate(layout):
        p0 = surface.along((x * 0.35, -0.045, 0.13), -0.004)
        p1 = surface.along((x * 0.8, -0.11, 0.085), 0.011)
        z2 = 1.478
        p2 = Vector((x * 0.97 + swept * 0.4, surface.front_y(x * 0.97, z2) - 0.013, z2))
        tx = x * 1.02 + swept
        p3 = Vector((tx, surface.front_y(tx, tip_z) - 0.009, tip_z))
        locks.append(hair_lock(f"bang{i}", [p0, p1, p2, p3], [width * 0.85, width, width * 0.85, 0.0], 0.011, palette))
    return locks


def long_hair(surface, colors):
    """Pelo largo y suelto de Alba. Devuelve (rígido a la cabeza, mechones que se balancean)."""
    palette = hair_palette(colors)
    rigid = [hair_cap(surface, palette, math.radians(-30), math.radians(30))]
    rigid += _bangs(surface, palette, [
        (-0.09, 1.462, 0.024), (-0.066, 1.444, 0.027), (-0.04, 1.432, 0.028), (-0.012, 1.41, 0.024),
        (0.016, 1.438, 0.028), (0.044, 1.428, 0.027), (0.07, 1.446, 0.026), (0.092, 1.465, 0.022),
    ], swept=0.004)
    # Mechones que enmarcan la cara y caen por delante hasta el pecho.
    for sx in (1, -1):
        pts = [
            surface.at(math.radians(112) * sx, math.radians(50), -0.006),
            surface.at(math.radians(118) * sx, math.radians(12), 0.012),
            Vector((0.112 * sx, -0.045, 1.34)),
            Vector((0.122 * sx, -0.05, 1.25)),
            Vector((0.116 * sx, -0.064, 1.17)),
            Vector((0.104 * sx, -0.07, 1.12)),
        ]
        out = lambda p, sx=sx: Vector((sx, -0.6, 0.0))
        rigid.append(hair_lock(f"sideLock{sx}", pts, [0.03, 0.038, 0.04, 0.034, 0.02, 0.0], 0.012, palette, outward=out, curl=0.35))
        # Un segundo mechón más corto detrás, para que el lateral tenga volumen.
        pts2 = [
            surface.at(math.radians(100) * sx, math.radians(45), -0.006),
            surface.at(math.radians(100) * sx, math.radians(5), 0.014),
            Vector((0.128 * sx, -0.012, 1.3)),
            Vector((0.124 * sx, -0.02, 1.22)),
        ]
        rigid.append(hair_lock(f"sideLockB{sx}", pts2, [0.032, 0.04, 0.03, 0.0], 0.012, palette, outward=lambda p, sx=sx: Vector((sx, -0.2, 0.0)), curl=0.35))
    flowing = []
    for layer, (count, spread, radius, shorten) in enumerate(((11, 100, 0.118, 0.0), (8, 80, 0.106, 0.05))):
        layer_palette = palette if layer == 0 else {**palette, "base": palette["inner"], "shine": palette["base"]}
        for i in range(count):
            a = math.radians(-spread + 2 * spread * i / (count - 1))
            side = abs(math.degrees(a))
            jitter = 0.025 * math.sin(i * 2.3 + layer)
            out_dir = Vector((math.sin(a), math.cos(a), 0.0))
            pts = [
                surface.at(a, math.radians(64), -0.012),
                surface.at(a, math.radians(32), 0.013 - layer * 0.006),
                surface.at(a, math.radians(-4), 0.017 - layer * 0.006),
            ]
            axis = Vector((0, 0.05, 0))
            if side > 58:
                # Laterales: terminan sobre el hombro y se van hacia atrás.
                end_z = 1.24 + jitter * 0.4
                pts += [
                    axis + out_dir * (radius + 0.008) + Vector((0, 0.01, 1.31)),
                    axis + out_dir * (radius - 0.004) + Vector((0, 0.035, end_z)),
                ]
            else:
                end_z = 0.98 + 0.08 * side / 58 + jitter + shorten
                mid_z = (1.26 + end_z) / 2
                pts += [
                    axis + out_dir * (radius + 0.004) + Vector((0, 0.0, 1.27)),
                    axis + out_dir * (radius + 0.006) + Vector((0.006 * math.sin(i), 0.008, mid_z)),
                    axis + out_dir * (radius - 0.008) + Vector((0, 0.02, end_z)),
                ]
            n = len(pts)
            widths = [0.032] + [0.048 - 0.004 * layer] * (n - 3) + [0.034, 0.0]
            outward = lambda p, out_dir=out_dir: out_dir + Vector((0, 0, 0.15))
            flowing.append(hair_lock(f"back{layer}_{i}", pts, widths, 0.013, layer_palette, outward=outward, curl=0.3, steps=7))
    return rigid, flowing


def spiky_hair(surface, colors):
    """Pelo corto y despeinado de Ciro, con puntas hacia atrás y un flequillo hacia un lado."""
    palette = hair_palette(colors)
    rigid = [hair_cap(surface, palette, math.radians(-42), math.radians(34), margin=0.013)]
    rigid += _bangs(surface, palette, [
        (-0.085, 1.47, 0.026), (-0.058, 1.452, 0.03), (-0.028, 1.44, 0.03), (0.004, 1.448, 0.03),
        (0.034, 1.438, 0.029), (0.064, 1.452, 0.027), (0.088, 1.47, 0.023),
    ], swept=0.012)
    # Puntas de la coronilla: gruesas, hacia atrás y hacia arriba (dan volumen a la silueta).
    for i, deg in enumerate((-160, -125, -90, -55, -20, 20, 55, 90, 125, 160, 0)):
        a = math.radians(deg)
        out_dir = Vector((math.sin(a), math.cos(a), 0.0))
        length = 0.075 + 0.02 * math.cos(i * 1.7)
        root = surface.at(a, math.radians(80), -0.014)
        mid = surface.at(a, math.radians(52 if deg != 0 else 34), 0.02)
        rise = 0.55 if abs(deg) < 110 else 0.3
        tip = mid + (out_dir * 0.55 + Vector((0, 0.6, rise))).normalized() * length
        rigid.append(hair_lock(f"spike{i}", [root, mid, tip], [0.024, 0.026, 0.0], 0.02, palette, curl=0.1))
    # Segunda fila más baja, hacia atrás y abajo.
    for i, deg in enumerate((-130, -95, -60, -25, 25, 60, 95, 130)):
        a = math.radians(deg)
        out_dir = Vector((math.sin(a), math.cos(a), 0.0))
        root = surface.at(a, math.radians(50), -0.012)
        mid = surface.at(a, math.radians(18), 0.018)
        tip = mid + (out_dir * 0.6 + Vector((0, 0.6, -0.1))).normalized() * 0.07
        rigid.append(hair_lock(f"spikeLow{i}", [root, mid, tip], [0.026, 0.028, 0.0], 0.018, palette, curl=0.12))
    # Laterales sobre las sienes (dejan ver las orejas).
    for sx in (1, -1):
        root = surface.at(math.radians(105) * sx, math.radians(55), -0.008)
        mid = surface.at(math.radians(102) * sx, math.radians(22), 0.012)
        tip = Vector((0.128 * sx, 0.012, 1.425))
        rigid.append(hair_lock(f"temple{sx}", [root, mid, tip], [0.03, 0.03, 0.0], 0.012, palette))
    # Nuca: puntas cortas hacia abajo.
    for i, deg in enumerate((-55, -28, 0, 28, 55)):
        a = math.radians(deg)
        out_dir = Vector((math.sin(a), math.cos(a), 0.0))
        root = surface.at(a, math.radians(30), -0.01)
        mid = surface.at(a, math.radians(-12), 0.013)
        tip = Vector((0, 0.035, 1.305 + 0.012 * (i % 2))) + out_dir * 0.105
        rigid.append(hair_lock(f"nape{i}", [root, mid, tip], [0.036, 0.034, 0.0], 0.013, palette))
    return rigid, []
