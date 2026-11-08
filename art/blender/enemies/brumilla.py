"""Brumilla: bolita de bruma con ojos grandes de luz, patitas y tres mechones en la cabeza.

Avanza a saltitos (se aplasta y se estira) y embiste con un salto corto.
"""

from mathutils import Vector

import common as c
import mist as m
import rig as r
import sculpt as s

P = m.PALETTE

BONES = [
    ("root", (0, 0, 0), (0, 0.2, 0), None, False),
    ("body", (0, 0, 0.06), (0, 0, 0.7), "root", True),
    ("tuft", (0, 0.02, 0.6), (0, 0.12, 0.85), "body", True),
    ("foot.L", (0.13, -0.02, 0.12), (0.13, -0.1, 0.02), "root", True),
    ("foot.R", (-0.13, -0.02, 0.12), (-0.13, -0.1, 0.02), "root", True),
]


def build_mesh():
    blob = s.Blob()
    blob.chain([(0, 0.01, 0.34), (0, 0, 0.46), (0, 0.01, 0.58)], [0.31, 0.31, 0.23], density=0.3)
    # Mejillas un poco abultadas para una cara más tierna.
    for sx in (1, -1):
        blob.ellipsoid((0.15 * sx, -0.16, 0.36), (0.12, 0.1, 0.1))
    body = m.body_from_blob(blob, "brumillaBody", 2200, m.gradient(P["belly"], P["body"], P["bodyLight"], 0.05, 0.8))
    s.cut_below(body, 0.05)
    surface = m.Surface(body)

    face, glow = [], []
    for sx in (1, -1):
        x, z = 0.11 * sx, 0.47
        p = surface.front(x, z, -0.012)
        glow.append(m.glow_eye(f"eye{sx}", p, (0.07, 0.035, 0.09), P["eyeAmber"]))
        # Pupila oscura y un brillo blanco: mirada viva.
        face.append(c.ellipsoid(f"pupil{sx}", p + Vector((0.006 * sx, -0.031, -0.012)), (0.03, 0.012, 0.042), P["pupil"], 2))
        glow.append(c.ellipsoid(f"glint{sx}", p + Vector((-0.02 * sx, -0.04, 0.035)), (0.014, 0.008, 0.016), "#ffffff", 1))
        # Rubor en las mejillas.
        face.append(c.ellipsoid(f"blush{sx}", surface.front(0.18 * sx, 0.37, -0.008), (0.045, 0.012, 0.025), "#6b4a8a", 1))
    mouth_y = surface.front(0, 0.37).y - 0.004
    face.append(c.tube("mouth", [(-0.035, mouth_y + 0.003, 0.385), (0, mouth_y, 0.37), (0.035, mouth_y + 0.003, 0.385)], [0.008, 0.01, 0.008], P["pupil"], sides=5))

    tufts = []
    for i, (x, lean) in enumerate(((-0.07, -0.5), (0.0, 0.0), (0.08, 0.6))):
        pts = [(x * 0.6, 0.02, 0.56), (x, 0.04, 0.72), (x * 1.6 + lean * 0.05, 0.12, 0.84), (x * 1.8 + lean * 0.08, 0.24, 0.84)]
        tufts.append(m.wisp(f"tuft{i}", pts, 0.05, lambda p: p - Vector((0, 0, 0.45)), 0.022))
    feet = [c.ellipsoid(f"foot{sx}", (0.12 * sx, -0.06, 0.06), (0.07, 0.095, 0.055), P["belly"], 2) for sx in (1, -1)]
    for f in feet:
        c.smooth(f)
    return body, face, glow, tufts, feet


def keys_idle():
    rest = {}
    breathe = {"@scale:body": (1.03, 1.03, 0.96), "tuft": [("x", -8)]}
    return [(0.0, rest), (0.5, breathe)]


def keys_move():
    return [
        (0.0, {"@scale:body": (1.1, 1.1, 0.86)}),
        (0.3, {"@scale:body": (0.93, 0.93, 1.1), "@loc:body": (0, 0, 0.1), "tuft": [("x", -15)]}),
        (0.55, {"@scale:body": (1.0, 1.0, 1.02), "@loc:body": (0, 0, 0.17), "tuft": [("x", 10)]}),
        (0.85, {"@scale:body": (0.95, 0.95, 1.07), "@loc:body": (0, 0, 0.05), "foot.L": [("x", -20)], "foot.R": [("x", -20)]}),
    ]


def keys_windup():
    crouch = {"@scale:body": (1.2, 1.2, 0.76), "body": [("x", -14)], "tuft": [("x", 25)]}
    return [(0.0, {}), (0.6, crouch), (1.0, {**crouch, "@scale:body": (1.24, 1.24, 0.72)})]


def keys_attack():
    return [
        (0.0, {"@scale:body": (1.2, 1.2, 0.76), "body": [("x", -14)]}),
        (0.35, {"@scale:body": (0.88, 0.88, 1.18), "body": [("x", 28)], "@loc:body": (0, 0, 0.16), "tuft": [("x", 35)]}),
        (1.0, {"@scale:body": (1.08, 1.08, 0.9), "body": [("x", 10)]}),
    ]


def keys_recover():
    return [
        (0.0, {"@scale:body": (1.08, 1.08, 0.9)}),
        (0.25, {"body": [("y", 10)]}),
        (0.5, {"body": [("y", -10)]}),
        (0.75, {"body": [("y", 6)]}),
        (1.0, {}),
    ]


def keys_hurt():
    return [(0.0, {}), (0.3, {"@scale:body": (1.14, 1.14, 0.84), "body": [("x", -22)], "tuft": [("x", 30)]}), (1.0, {})]


def build(data):
    stats = data["enemies"]["brumilla"]
    armature = r.create_armature("brumillaRig", BONES)
    body, face, glow, tufts, feet = build_mesh()
    for part in [body, *face, *glow]:
        r.set_rigid_group(part, "body")
    for t in tufts:
        r.set_rigid_group(t, "tuft")
    for f, side in zip(feet, ("L", "R")):
        r.set_rigid_group(f, f"foot.{side}")
    mesh = m.finish("brumilla", armature, [body, *face, *tufts, *feet], glow, data["outline"])

    clips = {
        "idle": r.make_clip(armature, "idle", keys_idle(), 90, loop=True),
        "move": r.make_clip(armature, "move", keys_move(), 36, loop=True),
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
        "previewTarget": 0.4,
        "previewDistance": 2.4,
        "previewShots": [("front", 0, 0.4, 2.4), ("threequarter", 35, 0.4, 2.4), ("side", 90, 0.4, 2.4), ("back", 180, 0.4, 2.4)],
    }
