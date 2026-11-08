"""Acechador: cuadrúpedo esbelto de humo, con orejas en punta, crin de bruma, cola larga y ojos cian.

Rodea al jugador a la carrera y se lanza en línea recta.
"""

from mathutils import Vector

import common as c
import mist as m
import rig as r
import sculpt as s

P = m.PALETTE

BONES = [
    ("root", (0, 0, 0), (0, 0.2, 0), None, False),
    ("hips", (0, 0.3, 0.6), (0, 0.04, 0.62), "root", True),
    ("chest", (0, 0.04, 0.62), (0, -0.27, 0.66), "hips", True),
    ("neck", (0, -0.27, 0.68), (0, -0.44, 0.82), "chest", True),
    ("head", (0, -0.44, 0.83), (0, -0.74, 0.79), "neck", True),
    ("tail.1", (0, 0.32, 0.64), (0, 0.62, 0.79), "hips", True),
    ("tail.2", (0, 0.62, 0.79), (0, 0.93, 1.12), "tail.1", True),
]
for _side, _sx in (("L", 1), ("R", -1)):
    BONES += [
        (f"legF.{_side}", (0.1 * _sx, -0.26, 0.56), (0.11 * _sx, -0.24, 0.3), "chest", True),
        (f"pawF.{_side}", (0.11 * _sx, -0.24, 0.3), (0.11 * _sx, -0.29, 0.04), f"legF.{_side}", True),
        (f"legB.{_side}", (0.1 * _sx, 0.28, 0.56), (0.11 * _sx, 0.38, 0.28), "hips", True),
        (f"pawB.{_side}", (0.11 * _sx, 0.38, 0.28), (0.11 * _sx, 0.31, 0.04), f"legB.{_side}", True),
    ]


def build_mesh():
    blob = s.Blob()
    # Lomo: estrecho, con el pecho más hondo que la cadera.
    blob.chain(
        [(0, 0.33, 0.6), (0, 0.06, 0.58), (0, -0.24, 0.64)],
        [0.085, 0.072, 0.09],
        scale_x=[1.0, 0.9, 1.0],
        scale_y=[1.15, 1.05, 1.4],
        density=0.3,
    )
    blob.chain([(0, -0.27, 0.68), (0, -0.44, 0.82)], [0.05, 0.042])
    blob.chain([(0, -0.45, 0.85), (0, -0.6, 0.83), (0, -0.75, 0.78)], [0.065, 0.05, 0.022])
    for sx in (1, -1):
        blob.chain([(0.09 * sx, -0.26, 0.56), (0.1 * sx, -0.24, 0.3), (0.1 * sx, -0.29, 0.06)], [0.042, 0.025, 0.021])
        blob.ellipsoid((0.1 * sx, -0.31, 0.03), (0.03, 0.045, 0.022))
        blob.chain([(0.09 * sx, 0.28, 0.57), (0.1 * sx, 0.38, 0.28), (0.1 * sx, 0.31, 0.06)], [0.055, 0.026, 0.021])
        blob.ellipsoid((0.1 * sx, 0.29, 0.03), (0.03, 0.045, 0.022))
    body = m.body_from_blob(blob, "acechadorBody", 2600, m.gradient(P["belly"], P["body"], P["bodyLight"], 0.35, 0.85), resolution=0.01)
    s.cut_below(body, 0.005)
    surface = m.Surface(body)

    glow, rigid_head, mane, tail = [], [], [], []
    for sx in (1, -1):
        p = surface.hit((0.25 * sx, -0.62, 0.86), (-sx, 0.35, -0.15), -0.004)
        glow.append(m.glow_eye(f"eye{sx}", p, (0.02, 0.042, 0.016), P["eyeCyan"]))
        root = Vector((0.045 * sx, -0.46, 0.9))
        rigid_head.append(
            m.wisp(f"ear{sx}", [root, root + Vector((0.025 * sx, 0.02, 0.09)), root + Vector((0.045 * sx, 0.05, 0.17))], 0.045, lambda q, sx=sx: Vector((sx * 0.3, -1, 0.2)), 0.018)
        )
    # Crin de bruma que fluye hacia atrás a lo largo del cuello y el lomo (mechones solapados).
    for i in range(9):
        t = i / 8
        y = -0.43 + 0.62 * t
        z = surface.hit((0, y, 1.5), (0, 0, -1)).z
        pts = [(0, y - 0.02, z - 0.03), (0, y + 0.08, z + 0.05), (0, y + 0.2, z + 0.06), (0, y + 0.3, z + 0.02)]
        mane.append(m.wisp(f"mane{i}", pts, 0.085 - 0.03 * t, lambda q: Vector((0, -0.2, 1)), 0.022, tip_color=P["wisp"], base_color=P["bodyTop"]))
    # Cola larga y espesa que sube en curva: tres mechones que se abren al final, con una brasa cian en la punta.
    for i, spread in enumerate((-1, 0, 1)):
        pts = [(0.0, 0.32, 0.64), (0.02 * spread, 0.52, 0.72), (0.05 * spread, 0.72, 0.86), (0.09 * spread, 0.86, 1.02), (0.12 * spread, 0.93, 1.12)]
        tail.append(m.wisp(f"tail{i}", pts, 0.085, lambda q: Vector((0, -0.6, 1)), 0.035))
    tip = m.glow_eye("tailTip", (0, 0.93, 1.12), (0.04, 0.04, 0.05), P["eyeCyan"])
    return body, glow, rigid_head, mane, tail, tip


def tail_weights(obj):
    """Cola: de la cadera a la punta, repartida entre los dos huesos de la cola según la distancia."""
    names = ["hips", "tail.1", "tail.2"]
    groups = [obj.vertex_groups.get(n) or obj.vertex_groups.new(name=n) for n in names]
    for v in obj.data.vertices:
        y = (obj.matrix_world @ v.co).y
        t = min(max((y - 0.32) / (0.93 - 0.32), 0.0), 1.0) * 2
        k = min(int(t), 1)
        f = t - k
        for g in groups:
            g.add([v.index], 0.0, "REPLACE")
        groups[k].add([v.index], 1.0 - f, "REPLACE")
        groups[k + 1].add([v.index], f, "REPLACE")


def legs(front, back, paws_f=0, paws_b=0):
    pose = {}
    for side in ("L", "R"):
        pose[f"legF.{side}"] = [("x", front)]
        pose[f"legB.{side}"] = [("x", back)]
        if paws_f:
            pose[f"pawF.{side}"] = [("x", paws_f)]
        if paws_b:
            pose[f"pawB.{side}"] = [("x", paws_b)]
    return pose


def keys_idle():
    return [
        (0.0, {"tail.1": [("z", 10)], "tail.2": [("z", 8)]}),
        (0.5, {"tail.1": [("z", -10)], "tail.2": [("z", -10)], "@scale:chest": (1.03, 1.0, 1.04), "head": [("x", 4)]}),
    ]


def keys_move():
    stretch = {**legs(-38, 34, 20, -10), "@loc:hips": (0, 0, 0.03), "tail.1": [("x", -6)], "head": [("x", 6)]}
    gather = {**legs(26, -30, 35, 25), "@loc:hips": (0, 0, 0.09), "chest": [("x", -6)], "tail.1": [("x", 14)], "head": [("x", -4)]}
    return [(0.0, stretch), (0.5, gather)]


def keys_windup():
    crouch = {
        **legs(-18, 12, 45, -35),
        "@loc:hips": (0, 0, -0.12),
        "chest": [("x", 10)],
        "head": [("x", -16)],
        "tail.1": [("x", 38)],
        "tail.2": [("x", 15)],
    }
    return [(0.0, {}), (0.7, crouch), (1.0, {**crouch, "tail.2": [("x", 25)]})]


def keys_attack():
    lunge = {**legs(-62, 52, 10, -20), "@loc:hips": (0, 0, 0.06), "head": [("x", -8)], "tail.1": [("x", -10)], "neck": [("x", -10)]}
    return [(0.0, lunge), (1.0, {**lunge, **legs(-30, 30)})]


def keys_recover():
    return [
        (0.0, legs(-20, 20)),
        (0.3, {"head": [("z", 18)], "neck": [("z", 10)]}),
        (0.6, {"head": [("z", -18)], "neck": [("z", -10)]}),
        (1.0, {}),
    ]


def keys_hurt():
    return [(0.0, {}), (0.3, {"chest": [("x", -14)], "head": [("x", 22)], "@loc:hips": (0, 0.06, 0.02), "tail.1": [("x", 25)]}), (1.0, {})]


def build(data):
    stats = data["enemies"]["acechador"]
    armature = r.create_armature("acechadorRig", BONES)
    body, glow, rigid_head, mane, tail, tip = build_mesh()
    tail_bones = [b for b in armature.data.bones if b.name.startswith("tail")]
    for b in tail_bones:
        b.use_deform = False
    r.bind_automatic(body, armature)
    for b in tail_bones:
        b.use_deform = True
    for part in [*glow, *rigid_head]:
        r.set_rigid_group(part, "head")
    for part in mane:
        r.set_rigid_group(part, "chest" if (part.matrix_world @ part.data.vertices[0].co).y > -0.3 else "neck")
    for part in tail:
        tail_weights(part)
    r.set_rigid_group(tip, "tail.2")
    mesh = m.finish("acechador", armature, [body, *rigid_head, *mane, *tail], [*glow, tip], data["outline"])

    clips = {
        "idle": r.make_clip(armature, "idle", keys_idle(), 100, loop=True),
        "move": r.make_clip(armature, "move", keys_move(), 26, loop=True),
        "windup": r.make_clip(armature, "windup", keys_windup(), r.clip_frames(stats["windup"])),
        "attack": r.make_clip(armature, "attack", keys_attack(), r.clip_frames(stats["active"])),
        "recover": r.make_clip(armature, "recover", keys_recover(), r.clip_frames(stats["recover"])),
        "hurt": r.make_clip(armature, "hurt", keys_hurt(), 21),
    }
    r.rest_pose(armature)
    return {
        "object": mesh,
        "armature": armature,
        "clips": clips,
        "previewPose": lambda: r.rest_pose(armature),
        "restPose": lambda: r.rest_pose(armature),
        "previewTarget": 0.6,
        "previewDistance": 4.0,
        "previewShots": [("front", 0, 0.6, 4.0), ("threequarter", 50, 0.6, 4.0), ("side", 90, 0.6, 4.0), ("back", 180, 0.6, 4.0)],
    }
