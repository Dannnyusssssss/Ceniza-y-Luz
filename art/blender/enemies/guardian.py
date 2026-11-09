"""Guardián de Cristal: coloso de roca oscura cubierto de cristales violetas, con un núcleo de luz en el pecho.

Un brazo acaba en una gran maza de cristal: el barrido se ve venir porque la levanta y gira el torso.
"""

import common as c
import mist as m
import rig as r
import sculpt as s

P = {
    "body": "#5a5288",
    "bodyLight": "#7a6fb0",
    "belly": "#40396a",
    "light": "#e0ceff",
    "mid": "#a78cf5",
    "dark": "#6a52c4",
    "core": "#a8f0ff",
    "eye": "#ffe9b0",
}

BONES = [
    ("root", (0, 0, 0), (0, 0.3, 0), None, False),
    ("hips", (0, 0.1, 0.95), (0, 0.04, 1.3), "root", True),
    ("chest", (0, 0.04, 1.3), (0, -0.05, 1.86), "hips", True),
    ("head", (0, -0.26, 1.84), (0, -0.32, 2.14), "chest", True),
]
for _side, _sx in (("L", 1), ("R", -1)):
    BONES += [
        (f"upperarm.{_side}", (0.62 * _sx, 0, 1.74), (0.8 * _sx, -0.1, 1.14), "chest", True),
        (f"forearm.{_side}", (0.8 * _sx, -0.1, 1.14), (0.78 * _sx, -0.24, 0.46), f"upperarm.{_side}", True),
        (f"thigh.{_side}", (0.3 * _sx, 0.1, 0.95), (0.32 * _sx, 0.08, 0.48), "hips", True),
        (f"shin.{_side}", (0.32 * _sx, 0.08, 0.48), (0.33 * _sx, 0.04, 0.08), f"thigh.{_side}", True),
    ]


def shard(name, center, radii, seed=0, tilt=(0.0, 0.0, 0.0)):
    obj = m.rock(name, center, radii, seed=seed, tilt=tilt)
    colors = []
    for poly in obj.data.polygons:
        n = poly.normal.z
        colors.append(P["light"] if n > 0.4 else P["dark"] if n < -0.2 else P["mid"])
    s._paint_by_index(obj, colors)
    return obj


def build_mesh():
    blob = s.Blob()
    blob.chain(
        [(0, 0.12, 0.98), (0, 0.03, 1.32), (0, -0.03, 1.66), (0, 0.05, 1.88)],
        [0.25, 0.32, 0.36, 0.26],
        scale_x=[1.2, 1.28, 1.55, 1.3],
        scale_y=[1.0, 1.0, 0.95, 0.9],
        density=0.3,
    )
    blob.ellipsoid((0, -0.3, 1.92), (0.18, 0.17, 0.16))
    for sx in (1, -1):
        blob.ellipsoid((0.6 * sx, 0.0, 1.76), (0.24, 0.22, 0.22))
        blob.chain([(0.64 * sx, 0, 1.74), (0.8 * sx, -0.1, 1.14)], [0.16, 0.14])
        blob.chain([(0.8 * sx, -0.1, 1.14), (0.79 * sx, -0.2, 0.66)], [0.16, 0.19])
        blob.chain([(0.3 * sx, 0.1, 0.95), (0.32 * sx, 0.08, 0.48), (0.33 * sx, 0.05, 0.14)], [0.18, 0.16, 0.16])
        blob.ellipsoid((0.33 * sx, -0.05, 0.08), (0.18, 0.24, 0.09))
    body = m.body_from_blob(blob, "guardianBody", 3000, m.gradient(P["belly"], P["body"], P["bodyLight"], 0.3, 2.0), resolution=0.022)
    s.cut_below(body, 0.004)
    surface = m.Surface(body)

    crystals = []  # (pieza, hueso)
    for sx, side in ((1, "L"), (-1, "R")):
        crystals.append((shard(f"shoulder{side}", (0.68 * sx, 0.02, 2.02), (0.2, 0.2, 0.4), seed=3 + sx, tilt=(0, 0.45 * sx, 0)), "chest"))
        crystals.append((shard(f"shoulderB{side}", (0.46 * sx, 0.14, 2.1), (0.11, 0.11, 0.27), seed=5 + sx, tilt=(-0.2, 0.2 * sx, 0)), "chest"))
        crystals.append((shard(f"bracer{side}", (0.98 * sx, -0.14, 0.92), (0.12, 0.18, 0.28), seed=7 + sx), f"forearm.{side}"))
        crystals.append((shard(f"knee{side}", (0.33 * sx, -0.14, 0.5), (0.12, 0.1, 0.16), seed=13 + sx), f"shin.{side}"))
        front = surface.front(0.32 * sx, 1.55, 0.0)
        crystals.append((shard(f"plate{side}", front, (0.14, 0.07, 0.22), seed=17 + sx, tilt=(0, -0.35 * sx, -0.25 * sx)), "chest"))
    # La maza: el brazo derecho acaba en un gran bloque de cristal.
    crystals.append((shard("maceCore", (-0.78, -0.3, 0.4), (0.34, 0.32, 0.42), seed=23), "forearm.R"))
    crystals.append((shard("maceTop", (-0.92, -0.42, 0.56), (0.15, 0.14, 0.3), seed=25, tilt=(0.3, -0.4, 0)), "forearm.R"))
    crystals.append((shard("maceSide", (-0.6, -0.5, 0.3), (0.12, 0.14, 0.26), seed=27, tilt=(0.5, 0.3, 0)), "forearm.R"))
    # El puño izquierdo es de roca: la asimetría ayuda a leer qué brazo barre.
    crystals.append((shard("fistL", (0.78, -0.26, 0.44), (0.2, 0.2, 0.18), seed=29), "forearm.L"))
    for i, z in enumerate((1.5, 1.76, 2.0)):
        back = surface.hit((0, 2.0, z), (0, -1, 0), 0.0)
        crystals.append((shard(f"back{i}", back, (0.18 - 0.02 * i, 0.15, 0.32), seed=31 + i, tilt=(-0.5, 0, 0)), "chest"))
    crown = surface.hit((0, -0.3, 2.5), (0, 0, -1), 0.0)
    crystals.append((shard("crown", crown, (0.1, 0.1, 0.26), seed=41), "head"))

    glow = []
    for sx in (1, -1):
        glow.append((m.glow_eye(f"eye{sx}", surface.front(0.08 * sx, 1.93, -0.012), (0.05, 0.022, 0.028), P["eye"]), "head"))
    glow.append((m.glow_eye("core", surface.front(0, 1.5, -0.03), (0.13, 0.06, 0.2), P["core"]), "chest"))
    return body, crystals, glow


def arms(lx, rx, lf=0, rf=0):
    return {"upperarm.L": [("x", lx)], "upperarm.R": [("x", rx)], "forearm.L": [("x", lf)], "forearm.R": [("x", rf)]}


def keys_idle():
    return [(0.0, {}), (0.5, {"@scale:chest": (1.02, 1.02, 1.03), "head": [("x", 3)], **arms(-3, -3)})]


def keys_move():
    step = {
        "thigh.L": [("x", -20)], "shin.L": [("x", 12)], "thigh.R": [("x", 15)], "shin.R": [("x", 18)],
        "chest": [("z", -5)], "@loc:hips": (0, 0, -0.04),
    }
    mid = {"thigh.L": [("x", 2)], "thigh.R": [("x", -4)], "shin.R": [("x", 26)], "@loc:hips": (0, 0, 0.03)}

    def mirror(pose):
        out = {}
        for k, v in pose.items():
            if k.startswith("@"):
                out[k] = v
                continue
            other = k.replace(".L", ".#").replace(".R", ".L").replace(".#", ".R")
            out[other] = [(ax, -d if ax in ("y", "z") else d) for ax, d in v]
        return out

    return [(0.0, step), (0.25, mid), (0.5, mirror(step)), (0.75, mirror(mid))]


def keys_sweep_windup():
    # Levanta la maza a un lado y gira el torso: se lee bien desde lejos.
    raised = {**arms(-10, -120, 0, -40), "chest": [("z", 28), ("x", -6)], "head": [("z", -14)], "@loc:hips": (0, 0, 0.03)}
    return [(0.0, {}), (0.7, raised), (1.0, raised)]


def keys_sweep():
    start = {**arms(-10, -120, 0, -40), "chest": [("z", 28), ("x", -6)]}
    end = {**arms(10, -70, 0, -10), "chest": [("z", -34), ("x", 12)], "head": [("z", 10)]}
    return [(0.0, start), (1.0, end)]


def keys_slam_windup():
    raised = {**arms(-165, -165, -30, -30), "chest": [("x", -16)], "head": [("x", -12)], "@loc:hips": (0, 0, 0.05)}
    return [(0.0, {}), (0.6, raised), (1.0, {**raised, **arms(-172, -172, -36, -36)})]


def keys_slam():
    slam = {**arms(-48, -48, -6, -6), "chest": [("x", 34)], "head": [("x", 10)], "@loc:hips": (0, 0, -0.16),
            "thigh.L": [("x", -28)], "thigh.R": [("x", -28)], "shin.L": [("x", 38)], "shin.R": [("x", 38)]}
    return [(0.0, {**arms(-172, -172, -36, -36), "chest": [("x", -16)]}), (1.0, slam)]


def keys_hurt():
    return [(0.0, {}), (0.3, {"chest": [("x", -9)], "head": [("x", -12)]}), (1.0, {})]


def keys_stagger():
    bent = {**arms(-20, -20, -4, -4), "chest": [("x", 30)], "head": [("x", 14)], "@loc:hips": (0, 0, -0.18),
            "thigh.L": [("x", -24)], "thigh.R": [("x", -24)], "shin.L": [("x", 34)], "shin.R": [("x", 34)]}
    return [(0.0, {}), (0.2, bent), (0.85, bent), (1.0, {})]


def build(data):
    g = data["guardian"]
    attacks = g["attacks"]
    armature = r.create_armature("guardianRig", BONES)
    body, crystals, glow = build_mesh()
    r.bind_automatic(body, armature)
    for part, bone in [*crystals, *glow]:
        r.set_rigid_group(part, bone)
    mesh = m.finish("guardian", armature, [body, *(p for p, _ in crystals)], [p for p, _ in glow], data["outline"], outline=0.012)
    clips = {
        "idle": r.make_clip(armature, "idle", keys_idle(), 120, loop=True),
        "move": r.make_clip(armature, "move", keys_move(), 90, loop=True),
        "sweepWindup": r.make_clip(armature, "sweepWindup", keys_sweep_windup(), r.clip_frames(attacks["sweep"]["windup"])),
        "sweep": r.make_clip(armature, "sweep", keys_sweep(), r.clip_frames(attacks["sweep"]["active"])),
        "slamWindup": r.make_clip(armature, "slamWindup", keys_slam_windup(), r.clip_frames(attacks["spikes"]["windup"])),
        "slam": r.make_clip(armature, "slam", keys_slam(), r.clip_frames(attacks["spikes"]["active"])),
        "stagger": r.make_clip(armature, "stagger", keys_stagger(), r.clip_frames(g["stagger"])),
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
