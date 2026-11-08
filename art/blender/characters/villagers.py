"""Aldeanos de Lumbre: Ilse, Oren y Teo.

Comparten el cuerpo base y el esqueleto de los gemelos, con menos detalle; cambian la ropa, el pelo y los colores
(leídos de los datos del juego). Solo tienen dos clips: reposo y hablar.
"""

import math
import os

import bpy

import common as c
import rig as r
import sculpt as s
import twins
import twins_body as tb
import twins_head as th
import twins_outfit as to

BODY_TRIS = 1300
HAIR_TRIS = {"ilse": 1100, "oren": 500, "teo": 1100}
OUTLINE = {"body": 0.0048, "head": 0.004, "hair": 0.005}

# Zonas pintadas sobre el cuerpo: (límite, color). Brazo por distancia al hombro; tronco y piernas por altura.
ROBE_ARM = [(0.33, "outfit"), (0.35, "accent"), (9, "skin")]
ROBE_TORSO = [(1.04, "outfitDark"), (1.055, "accent"), (1.17, "outfit"), (1.19, "accent"), (1.236, "outfit"), (9, "skin")]
ROBE_LEGS = [(0.3, "boots"), (9, "pants")]
TUNIC_ARM = [(0.2, "outfit"), (0.215, "accent"), (9, "skin")]
TUNIC_TORSO = [(0.87, "pants"), (0.89, "accent"), (1.236, "outfit"), (9, "skin")]
TUNIC_LEGS = [(0.26, "boots"), (9, "pants")]
TABLES = {
    "ilse": (ROBE_ARM, ROBE_TORSO, ROBE_LEGS),
    "oren": (ROBE_ARM, ROBE_TORSO, ROBE_LEGS),
    "teo": (TUNIC_ARM, TUNIC_TORSO, TUNIC_LEGS),
}


def _dress(body, model, colors):
    arm, torso, legs = TABLES[model]
    tb.cut_zones(body, [v for v, _ in arm[:-1]], [v for v, _ in torso[:-1]], [v for v, _ in legs[:-1]])

    def torso_zone(co):
        if co.z > 1.236 and math.hypot(co.x, co.y - 0.006) > to.NECK_RADIUS:
            return colors[torso[-2][1]]
        return to._pick(torso, co.z, colors)

    tb.paint_zones(body, torso_zone, lambda d: to._pick(arm, d, colors), lambda z: to._pick(legs, z, colors))


def _skirt(name, z_top, z_bottom, r_top, r_bottom, color, trim):
    """Falda larga: un tronco de cono con el borde de otro color."""
    points = [(0, 0.004, z_top), (0, 0.006, (z_top + z_bottom) / 2), (0, 0.01, z_bottom + 0.03), (0, 0.01, z_bottom)]
    radii = [r_top, (r_top + r_bottom) / 2 * 1.04, r_bottom, r_bottom * 0.98]
    skirt = c.tube(name, points, radii, color, sides=12, cap_end=False)
    return c.paint(skirt, lambda co: trim if co.z < z_bottom + 0.03 else color, per_face=True)


def _ilse_extras(colors):
    return [_skirt("robe", 1.05, 0.2, 0.125, 0.235, colors["outfit"], colors["accent"])]


def _oren_extras(colors):
    parts = [_skirt("apron", 1.04, 0.42, 0.135, 0.19, colors["outfitDark"], colors["accent"])]
    parts.append(c.ring_tube("belt", (0, 0.004, 1.05), 0.122, 0.018, colors["accent"], segments=14, sides=4, scale=(1.02, 0.74)))
    # Bolsa al cinto.
    parts.append(c.ellipsoid("pouch", (0.13, -0.05, 0.96), (0.05, 0.035, 0.06), colors["boots"], subdivisions=1))
    return parts


def _teo_extras(colors):
    return []


EXTRAS = {"ilse": _ilse_extras, "oren": _oren_extras, "teo": _teo_extras}


def _ilse_hair(surface, colors):
    palette = th.hair_palette(colors)
    rigid = [th.hair_cap(surface, palette, math.radians(-20), math.radians(32))]
    rigid += th._bangs(surface, palette, [(-0.07, 1.47, 0.04), (-0.024, 1.456, 0.04), (0.024, 1.456, 0.04), (0.07, 1.47, 0.04)], swept=0.002)
    # Moño alto, atado con una cinta del color de la ropa.
    rigid.append(c.ellipsoid("bun", (0, 0.11, 1.55), (0.066, 0.066, 0.06), palette["base"], subdivisions=2))
    rigid.append(c.ring_tube("bunTie", (0, 0.098, 1.505), 0.03, 0.009, colors["accent"], segments=8, sides=4))
    return rigid


def _oren_hair(surface, colors):
    palette = th.hair_palette(colors)
    rigid = [th.hair_cap(surface, palette, math.radians(-30), math.radians(38))]
    # Barba corta bajo la barbilla, sin tapar la boca.
    beard = c.ellipsoid("beard", (0, -0.062, 1.292), (0.056, 0.05, 0.03), palette["base"], subdivisions=2)
    rigid.append(beard)
    # Gorro de ala corta.
    rigid.append(c.ellipsoid("hatCrown", (0, 0.01, 1.522), (0.11, 0.115, 0.058), colors["outfitDark"], subdivisions=2))
    rigid.append(c.ring_tube("hatBrim", (0, 0.006, 1.485), 0.13, 0.016, colors["accent"], segments=16, sides=4, scale=(1.0, 1.04)))
    return rigid


def _teo_hair(surface, colors):
    return th.spiky_hair(surface, colors)[0]


HAIR = {"ilse": _ilse_hair, "oren": _oren_hair, "teo": _teo_hair}


def _relaxed(extra=None):
    """Brazos relajados a los lados (los gemelos sujetan la espada; los aldeanos no)."""
    pose = {
        "upperarm.L": [("y", 38), ("x", 4)],
        "upperarm.R": [("y", -38), ("x", 4)],
        "forearm.L": [("x", -14)],
        "forearm.R": [("x", -14)],
    }
    for bone, rotations in (extra or {}).items():
        pose[bone] = pose.get(bone, []) + rotations if not bone.startswith("@") else rotations
    return pose


def _build_clips(armature):
    idle_in = {"chest": [("x", -2)], "head": [("x", 1)], "upperarm.L": [("y", -2)], "upperarm.R": [("y", 2)]}
    idle = [(0.0, _relaxed()), (0.5, _relaxed(idle_in))]
    # Hablar: asiente y gesticula con una mano.
    say_a = {"head": [("x", 5), ("z", 3)], "upperarm.R": [("x", -38), ("y", 12)], "forearm.R": [("x", -68)], "chest": [("x", 2)]}
    say_b = {"head": [("x", -2), ("z", -4)], "upperarm.R": [("x", -46), ("y", 18)], "forearm.R": [("x", -84)], "chest": [("x", -1)]}
    talk = [(0.0, _relaxed(say_a)), (0.33, _relaxed(say_b)), (0.66, _relaxed(say_a))]
    clips = {
        "idle": r.make_clip(armature, "idle", idle, 150, loop=True),
        "talk": r.make_clip(armature, "talk", talk, 96, loop=True),
    }
    r.rest_pose(armature)
    return clips


def _with_outline(parts, name, thickness, outline_hex):
    obj = c.join(parts, name)
    c.assign_material(obj, c.MAT_TOON)
    c.add_outline(obj, thickness, outline_hex, tint=True)
    return obj


def build(data):
    model = data["model"]
    look = data["npcs"][model]
    colors = look["colors"]
    outline = data["outline"]
    armature = r.create_armature(f"{model}Rig", twins.BONES)

    body = tb.body_object(look["build"], target_tris=BODY_TRIS)
    _dress(body, model, colors)
    secondary = [b for b in armature.data.bones if b.name in r.SECONDARY_BONES]
    for b in secondary:
        b.use_deform = False
    r.bind_automatic(body, armature)
    for b in secondary:
        b.use_deform = True

    extras = EXTRAS[model](colors)
    for piece in extras:
        c.smooth(piece)
        r.set_rigid_group(piece, "hips")

    head = th.head_object(colors)
    surface = th.HeadSurface(head)
    texture_path = os.path.join(data["textureDir"], f"{model}-face.png")
    # La cara se recorta antes de simplificar la cabeza: la textura necesita su forma completa.
    face = th.face_decal(head, colors, look["build"], texture_path, model)
    hair_parts = HAIR[model](surface, colors)
    hair = c.join(hair_parts, "hair")
    s.decimate(hair, HAIR_TRIS[model], symmetric=False)
    head_parts = [head, *th.ears(colors)]
    for part in head_parts + [hair, face]:
        r.set_rigid_group(part, "head")

    body_group = _with_outline([body, *extras], f"{model}Body", OUTLINE["body"], outline)
    head_group = _with_outline(head_parts, f"{model}Head", OUTLINE["head"], outline)
    hair_group = _with_outline([hair], f"{model}Hair", OUTLINE["hair"], outline)
    mesh = c.join([body_group, head_group, hair_group], model)
    if not any(m.type == "ARMATURE" for m in mesh.modifiers):
        r.bind_with_groups(mesh, armature)
    mesh.parent = armature
    r.bind_with_groups(face, armature)

    clips = _build_clips(armature)
    bpy.context.view_layer.update()
    return {
        "object": mesh,
        "armature": armature,
        "clips": clips,
        "previewPose": lambda: r.apply_pose(armature, _relaxed()),
        "restPose": lambda: r.rest_pose(armature),
        "previewTarget": 0.82,
        "previewDistance": 3.4,
        "previewShots": [("front", 0, 0.82, 3.4), ("threequarter", 35, 0.82, 3.4), ("back", 180, 0.82, 3.4), ("face", 20, 1.4, 0.95)],
    }

