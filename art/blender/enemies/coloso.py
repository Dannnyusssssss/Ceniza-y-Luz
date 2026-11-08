"""Coloso de Bruma: gigante encorvado de bruma con placas de roca, puños enormes y un núcleo de brasa en el pecho.

Avanza despacio y levanta los dos brazos antes de golpear el suelo (el golpe se ve venir).
"""

from mathutils import Vector

import common as c
import mist as m
import rig as r
import sculpt as s

P = m.PALETTE

BONES = [
    ("root", (0, 0, 0), (0, 0.3, 0), None, False),
    ("hips", (0, 0.1, 0.95), (0, 0.04, 1.3), "root", True),
    ("chest", (0, 0.04, 1.3), (0, -0.05, 1.82), "hips", True),
    ("head", (0, -0.3, 1.78), (0, -0.36, 2.06), "chest", True),
]
for _side, _sx in (("L", 1), ("R", -1)):
    BONES += [
        (f"upperarm.{_side}", (0.6 * _sx, 0, 1.7), (0.78 * _sx, -0.12, 1.12), "chest", True),
        (f"forearm.{_side}", (0.78 * _sx, -0.12, 1.12), (0.76 * _sx, -0.24, 0.45), f"upperarm.{_side}", True),
        (f"thigh.{_side}", (0.28 * _sx, 0.1, 0.95), (0.3 * _sx, 0.08, 0.48), "hips", True),
        (f"shin.{_side}", (0.3 * _sx, 0.08, 0.48), (0.31 * _sx, 0.04, 0.08), f"thigh.{_side}", True),
    ]


def build_mesh():
    blob = s.Blob()
    blob.chain(
        [(0, 0.12, 0.98), (0, 0.03, 1.3), (0, -0.04, 1.62), (0, 0.06, 1.84)],
        [0.24, 0.3, 0.33, 0.24],
        scale_x=[1.2, 1.25, 1.5, 1.3],
        scale_y=[1.0, 1.0, 0.95, 0.9],
        density=0.3,
    )
    blob.ellipsoid((0, -0.34, 1.86), (0.17, 0.16, 0.15))
    for sx in (1, -1):
        blob.ellipsoid((0.56 * sx, 0.0, 1.72), (0.22, 0.2, 0.2))
        blob.chain([(0.62 * sx, 0, 1.7), (0.78 * sx, -0.12, 1.12)], [0.15, 0.13])
        blob.chain([(0.78 * sx, -0.12, 1.12), (0.77 * sx, -0.2, 0.66)], [0.15, 0.18])
        blob.ellipsoid((0.77 * sx, -0.25, 0.45), (0.2, 0.2, 0.17))
        blob.chain([(0.28 * sx, 0.1, 0.95), (0.3 * sx, 0.08, 0.48), (0.31 * sx, 0.05, 0.14)], [0.17, 0.15, 0.15])
        blob.ellipsoid((0.31 * sx, -0.05, 0.08), (0.17, 0.22, 0.09))
    body = m.body_from_blob(blob, "colosoBody", 3200, m.gradient(P["belly"], P["body"], P["bodyLight"], 0.3, 1.95), resolution=0.022)
    s.cut_below(body, 0.004)
    surface = m.Surface(body)

    rocks = []  # (pieza, hueso)
    for sx, side in ((1, "L"), (-1, "R")):
        rocks.append((m.rock(f"pauldron{side}", (0.6 * sx, 0.02, 1.9), (0.3, 0.28, 0.17), seed=3 + sx, tilt=(0, 0.35 * sx, 0)), "chest"))
        rocks.append((m.rock(f"bracer{side}", (0.95 * sx, -0.18, 0.86), (0.12, 0.2, 0.26), seed=7 + sx, tilt=(0.15, 0, 0)), f"forearm.{side}"))
        rocks.append((m.rock(f"knuckle{side}", (0.78 * sx, -0.4, 0.5), (0.18, 0.1, 0.12), seed=11 + sx), f"forearm.{side}"))
        rocks.append((m.rock(f"knee{side}", (0.31 * sx, -0.12, 0.5), (0.13, 0.1, 0.12), seed=13 + sx), f"shin.{side}"))
        # Placas a los lados del núcleo: dejan una grieta por la que asoma la brasa.
        front = surface.front(0.27 * sx, 1.5, 0.0)
        rocks.append((m.rock(f"chestPlate{side}", front, (0.13, 0.07, 0.19), seed=17 + sx, tilt=(0, -0.35 * sx, -0.25 * sx)), "chest"))
        rib = surface.front(0.3 * sx, 1.22, 0.0)
        rocks.append((m.rock(f"rib{side}", rib, (0.11, 0.06, 0.1), seed=41 + sx, tilt=(0, -0.3 * sx, 0.3 * sx)), "chest"))
    for i, z in enumerate((1.45, 1.7, 1.92)):
        back = surface.hit((0, 2.0, z), (0, -1, 0), 0.0)
        rocks.append((m.rock(f"back{i}", back, (0.22 - 0.03 * i, 0.12, 0.15), seed=21 + i, tilt=(-0.4, 0, 0)), "chest"))
    brow = surface.front(0, 1.95, 0.0)
    rocks.append((m.rock("brow", brow, (0.19, 0.08, 0.06), seed=31, tilt=(0.3, 0, 0)), "head"))

    glow = []
    for sx in (1, -1):
        glow.append((m.glow_eye(f"eye{sx}", surface.front(0.07 * sx, 1.87, -0.012), (0.045, 0.022, 0.028), P["eyeAmber"]), "head"))
    glow.append((m.glow_eye("core", surface.front(0, 1.48, -0.03), (0.12, 0.06, 0.2), P["ember"]), "chest"))

    wisps = []
    # A los lados el cuerpo es más bajo: esos mechones nacen de los hombros.
    for i, (x, z) in enumerate(((-0.45, 1.85), (0.45, 1.85), (0.0, 2.02), (-0.2, 1.95), (0.25, 1.96))):
        root = surface.hit((x, 2.0, z - 0.1), (0, -1, 0), -0.03)
        pts = [root, root + Vector((x * 0.15, 0.08, 0.22)), root + Vector((x * 0.3, 0.22, 0.42)), root + Vector((x * 0.35, 0.42, 0.55))]
        wisps.append(m.wisp(f"wisp{i}", pts, 0.13, lambda q: Vector((0, 1, 0.5)), 0.04))
    return body, rocks, glow, wisps


def arms(x, fore=0):
    return {"upperarm.L": [("x", x)], "upperarm.R": [("x", x)], "forearm.L": [("x", fore)], "forearm.R": [("x", fore)]}


def keys_idle():
    return [(0.0, {}), (0.5, {"@scale:chest": (1.02, 1.02, 1.03), "head": [("x", 4)], **arms(-4)})]


def keys_move():
    step_l = {
        "thigh.L": [("x", -22)], "shin.L": [("x", 12)], "thigh.R": [("x", 16)], "shin.R": [("x", 20)],
        "chest": [("z", -6)], "upperarm.L": [("x", 14)], "upperarm.R": [("x", -14)], "@loc:hips": (0, 0, -0.04),
    }
    mid = {"thigh.L": [("x", 2)], "thigh.R": [("x", -4)], "shin.R": [("x", 30)], "@loc:hips": (0, 0, 0.03)}

    def mirror(pose):
        out = {}
        for k, v in pose.items():
            if k.startswith("@"):
                out[k] = v
                continue
            other = k.replace(".L", ".#").replace(".R", ".L").replace(".#", ".R")
            out[other] = [(ax, -d if ax in ("y", "z") else d) for ax, d in v]
        return out

    return [(0.0, step_l), (0.25, mid), (0.5, mirror(step_l)), (0.75, mirror(mid))]


def keys_windup():
    raised = {**arms(-165, -30), "chest": [("x", -16)], "head": [("x", -12)], "@loc:hips": (0, 0, 0.05), "thigh.L": [("x", -8)], "thigh.R": [("x", -8)]}
    return [(0.0, {}), (0.55, raised), (1.0, {**raised, **arms(-172, -38)})]


def keys_attack():
    slam = {**arms(-48, -6), "chest": [("x", 34)], "head": [("x", 10)], "@loc:hips": (0, 0, -0.16),
            "thigh.L": [("x", -30)], "thigh.R": [("x", -30)], "shin.L": [("x", 40)], "shin.R": [("x", 40)]}
    return [(0.0, {**arms(-172, -38), "chest": [("x", -16)]}), (1.0, slam)]


def keys_recover():
    slam = {**arms(-48, -6), "chest": [("x", 34)], "head": [("x", 10)], "@loc:hips": (0, 0, -0.16),
            "thigh.L": [("x", -30)], "thigh.R": [("x", -30)], "shin.L": [("x", 40)], "shin.R": [("x", 40)]}
    tired = {**arms(-30, -4), "chest": [("x", 22)], "head": [("x", 6)], "@loc:hips": (0, 0, -0.1)}
    return [(0.0, slam), (0.55, tired), (1.0, {})]


def keys_hurt():
    return [(0.0, {}), (0.35, {"chest": [("x", -7)], "head": [("x", -10)]}), (1.0, {})]


def build(data):
    stats = data["enemies"]["coloso"]
    armature = r.create_armature("colosoRig", BONES)
    body, rocks, glow, wisps = build_mesh()
    r.bind_automatic(body, armature)
    for part, bone in [*rocks, *glow]:
        r.set_rigid_group(part, bone)
    for w in wisps:
        r.set_rigid_group(w, "chest")
    mesh = m.finish("coloso", armature, [body, *(p for p, _ in rocks), *wisps], [p for p, _ in glow], data["outline"], outline=0.012)

    clips = {
        "idle": r.make_clip(armature, "idle", keys_idle(), 120, loop=True),
        "move": r.make_clip(armature, "move", keys_move(), 80, loop=True),
        "windup": r.make_clip(armature, "windup", keys_windup(), r.clip_frames(stats["windup"])),
        "attack": r.make_clip(armature, "attack", keys_attack(), r.clip_frames(stats["active"])),
        "recover": r.make_clip(armature, "recover", keys_recover(), r.clip_frames(stats["recover"])),
        "hurt": r.make_clip(armature, "hurt", keys_hurt(), 24),
    }
    r.rest_pose(armature)
    return {
        "object": mesh,
        "armature": armature,
        "clips": clips,
        "previewPose": lambda: r.rest_pose(armature),
        "restPose": lambda: r.rest_pose(armature),
        "previewTarget": 1.1,
        "previewDistance": 6.0,
        "previewShots": [("front", 0, 1.1, 6.0), ("threequarter", 35, 1.1, 6.0), ("side", 90, 1.1, 6.0), ("back", 180, 1.1, 6.0)],
    }
