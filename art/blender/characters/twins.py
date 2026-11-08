"""Alba y Ciro: los gemelos protagonistas.

Comparten esqueleto y animaciones; cambian el cuerpo (Ciro algo más ancho de hombros), el pelo, la ropa y
los colores (leídos de los datos del juego). Estilo anime de unas 5,7 cabezas de alto.
Miran hacia -Y; X positivo es su lado izquierdo.

Piezas del modelo exportado:
- `<modelo>`: cuerpo, ropa, pelo y contorno (materiales "toon", "outline" y "glow").
- `<modelo>Face`: la cara, con la textura `<modelo>-face.png` (material "face").
"""

import os

import bpy

import common as c
import rig as r
import sculpt as s
import twins_anim as anim
import twins_body as tb
import twins_head as th
import twins_outfit as to

BONES = [
    ("root", (0, 0, 0), (0, 0.2, 0), None, False),
    ("hips", (0, 0, 0.84), (0, 0, 0.98), "root", True),
    ("spine", (0, 0, 0.98), (0, 0, 1.1), "hips", True),
    ("chest", (0, 0, 1.1), (0, 0, 1.24), "spine", True),
    ("neck", (0, 0, 1.24), (0, 0, 1.29), "chest", True),
    ("head", (0, 0, 1.29), (0, 0, 1.56), "neck", True),
    ("hair.1", (0, 0.1, 1.42), (0, 0.14, 1.22), "head", True),
    ("hair.2", (0, 0.14, 1.22), (0, 0.16, 1.0), "hair.1", True),
    ("cape", (0, 0.1, 1.22), (0, 0.15, 0.8), "chest", True),
    ("scarf", (0, 0.07, 1.25), (0, 0.16, 0.96), "chest", True),
]
for _side, _sx in (("L", 1), ("R", -1)):
    BONES += [
        (f"shoulder.{_side}", (0.03 * _sx, 0, 1.21), (0.14 * _sx, 0, 1.19), "chest", True),
        (f"upperarm.{_side}", (0.15 * _sx, 0, 1.19), (0.3 * _sx, 0, 1.03), f"shoulder.{_side}", True),
        (f"forearm.{_side}", (0.3 * _sx, 0, 1.03), (0.44 * _sx, -0.01, 0.88), f"upperarm.{_side}", True),
        (f"hand.{_side}", (0.44 * _sx, -0.01, 0.88), (0.5 * _sx, -0.015, 0.82), f"forearm.{_side}", True),
        (f"thigh.{_side}", (0.088 * _sx, 0, 0.82), (0.095 * _sx, 0, 0.45), "hips", True),
        (f"shin.{_side}", (0.095 * _sx, 0, 0.45), (0.095 * _sx, 0.01, 0.085), f"thigh.{_side}", True),
        (f"foot.{_side}", (0.095 * _sx, 0.01, 0.085), (0.095 * _sx, -0.12, 0.02), f"shin.{_side}", True),
    ]

# Grosor del contorno por tipo de pieza (fino, como un trazo de dibujo).
OUTLINE = {"body": 0.0042, "head": 0.0034, "hair": 0.0045}


def skirt_weights(obj):
    """Falda: arriba sigue a la cadera; abajo, en parte al muslo de su lado (así se abre al andar)."""
    names = ["hips", "thigh.L", "thigh.R"]
    groups = {n: obj.vertex_groups.get(n) or obj.vertex_groups.new(name=n) for n in names}
    for v in obj.data.vertices:
        co = obj.matrix_world @ v.co
        t = min(max((0.99 - co.z) / 0.26, 0.0), 1.0)
        side = min(abs(co.x) / 0.1, 1.0)
        w_thigh = 0.55 * t * side
        for g in groups.values():
            g.add([v.index], 0.0, "REPLACE")
        groups["hips"].add([v.index], 1.0 - w_thigh, "REPLACE")
        groups["thigh.L" if co.x >= 0 else "thigh.R"].add([v.index], w_thigh, "REPLACE")


def gradient_chain(obj, bones, z_top, z_bottom):
    """Reparte el peso a lo largo de una cadena de huesos según la altura (pelo largo, capa y colas)."""
    groups = [obj.vertex_groups.get(b) or obj.vertex_groups.new(name=b) for b in bones]
    n = len(bones) - 1
    for v in obj.data.vertices:
        z = (obj.matrix_world @ v.co).z
        t = min(max((z_top - z) / (z_top - z_bottom), 0.0), 1.0) * n
        k = min(int(t), n - 1)
        f = t - k
        for g in groups:
            g.add([v.index], 0.0, "REPLACE")
        groups[k].add([v.index], 1.0 - f, "REPLACE")
        groups[k + 1].add([v.index], f, "REPLACE")


def _with_outline(parts, name, thickness, outline_hex):
    obj = c.join(parts, name)
    c.assign_material(obj, c.MAT_TOON)
    c.add_outline(obj, thickness, outline_hex, tint=True)
    return obj


def build(data):
    model = data["model"]
    character = data["characters"][model]
    colors = character["colors"]
    is_alba = character["hairStyle"] == "longLoose"
    outline = data["outline"]

    armature = r.create_armature(f"{model}Rig", BONES)

    # 1) Cuerpo con la ropa pintada y pesos automáticos. Los huesos secundarios no deforman en este paso,
    #    para que no "roben" peso al cuello ni a la espalda.
    body = tb.body_object(model)
    to.dress_body(body, model, colors)
    secondary = [b for b in armature.data.bones if b.name in r.SECONDARY_BONES]
    for b in secondary:
        b.use_deform = False
    r.bind_automatic(body, armature)
    for b in secondary:
        b.use_deform = True

    # 2) Ropa pegada al cuerpo: copia sus pesos. Piezas rígidas: un solo hueso.
    clothes = []
    rigid = list(to.boots_and_bands(body, model, colors))
    gem = None
    cloth_chain = []
    if is_alba:
        collar, gem = to.alba_collar(body, colors)
        s.transfer_weights(collar, body)
        clothes.append(collar)
        skirt = to.alba_skirt(body, colors)
        skirt_weights(skirt)
        clothes.append(skirt)
        cape = to.alba_cape(colors)
        gradient_chain(cape, ["chest", "cape"], 1.2, 0.78)
        cloth_chain.append(cape)
    else:
        vest = to.ciro_vest(body, colors)
        belt, buckle = to.ciro_belt(body, colors)
        wraps, tails = to.ciro_scarf(body, colors)
        for piece in (vest, belt, *wraps):
            s.transfer_weights(piece, body)
            clothes.append(piece)
        rigid.append((buckle, "hips"))
        for tail in tails:
            gradient_chain(tail, ["chest", "scarf"], 1.25, 0.96)
            cloth_chain.append(tail)
    for part, bone in rigid:
        r.set_rigid_group(part, bone)
        clothes.append(part)

    # 3) Cabeza, orejas, cara con textura y pelo.
    head = th.head_object(colors)
    surface = th.HeadSurface(head)
    texture_path = os.path.join(data["textureDir"], f"{model}-face.png")
    face = th.face_decal(head, colors, model, texture_path, model)
    head_parts = [head, *th.ears(colors)]
    hair_rigid, hair_flowing = (th.long_hair if is_alba else th.spiky_hair)(surface, colors)
    for part in head_parts + hair_rigid + [face]:
        r.set_rigid_group(part, "head")
    for strand in hair_flowing:
        gradient_chain(strand, ["head", "hair.1", "hair.2"], 1.4, 1.0)

    # 4) Contorno por grupos (cada uno con su grosor) y una sola malla con varios materiales.
    body_group = _with_outline([body, *clothes, *cloth_chain], f"{model}Body", OUTLINE["body"], outline)
    head_group = _with_outline(head_parts, f"{model}Head", OUTLINE["head"], outline)
    hair_group = _with_outline(hair_rigid + hair_flowing, f"{model}Hair", OUTLINE["hair"], outline)
    groups = [body_group, head_group, hair_group]
    if gem is not None:
        r.set_rigid_group(gem, "chest")
        c.assign_material(gem, c.MAT_GLOW, emission=1.2)
        groups.append(gem)
    character_mesh = c.join(groups, model)
    # El cuerpo ya tiene su modificador de esqueleto; las demás piezas lo heredan al unirse.
    if not any(m.type == "ARMATURE" for m in character_mesh.modifiers):
        r.bind_with_groups(character_mesh, armature)
    character_mesh.parent = armature
    r.bind_with_groups(face, armature)

    # 5) Animaciones con los tiempos del juego.
    clips = anim.build_animations(armature, data["timings"])

    bpy.context.view_layer.update()
    return {
        "object": character_mesh,
        "armature": armature,
        "clips": clips,
        "textures": [os.path.basename(texture_path)],
        "previewPose": lambda: r.apply_pose(armature, anim.base_pose()),
        "restPose": lambda: r.rest_pose(armature),
        "previewTarget": 0.82,
        "previewDistance": 3.4,
        "previewShots": [
            ("front", 0, 0.82, 3.4),
            ("threequarter", 35, 0.82, 3.4),
            ("side", 90, 0.82, 3.4),
            ("back", 180, 0.82, 3.4),
            ("face", 20, 1.4, 0.95),
        ],
    }
