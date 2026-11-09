"""Regente del Eclipse: figura alta envuelta en un manto de ceniza, con corona de puntas doradas y un disco negro a la
espalda de la cabeza. Empuña una hoja larga con la mano derecha: los ataques se leen por lo que hace ese brazo.
"""

import math

import common as c
import mist as m
import rig as r
import sculpt as s

P = {
    "low": "#1d1216",
    "mid": "#3a2226",
    "high": "#6a3a30",
    "skin": "#2a1a20",
    "gold": "#e8b84a",
    "goldDark": "#8a5f22",
    "disc": "#120a0e",
    "ember": "#ffb45a",
    "hot": "#fff0c0",
}

BONES = [
    ("root", (0, 0, 0), (0, 0.3, 0), None, False),
    ("hips", (0, 0, 1.05), (0, 0, 1.45), "root", True),
    ("chest", (0, 0, 1.45), (0, 0, 2.02), "hips", True),
    ("head", (0, -0.02, 2.04), (0, -0.04, 2.5), "chest", True),
]
for _side, _sx in (("L", 1), ("R", -1)):
    BONES += [
        (f"upperarm.{_side}", (0.34 * _sx, 0, 1.94), (0.56 * _sx, -0.04, 1.42), "chest", True),
        (f"forearm.{_side}", (0.56 * _sx, -0.04, 1.42), (0.62 * _sx, -0.16, 0.92), f"upperarm.{_side}", True),
        (f"thigh.{_side}", (0.16 * _sx, 0, 1.05), (0.2 * _sx, 0, 0.55), "hips", True),
        (f"shin.{_side}", (0.2 * _sx, 0, 0.55), (0.22 * _sx, 0, 0.08), f"thigh.{_side}", True),
    ]


def _circle(center_y, center_z, radius, count=18):
    """Puntos de un círculo vertical, de frente a la cámara: sirve para aros y discos a la espalda."""
    return [
        (math.cos(i / count * math.tau) * radius, center_y, center_z + math.sin(i / count * math.tau) * radius)
        for i in range(count + 1)
    ]


def build_mesh():
    blob = s.Blob()
    # El manto: ancho abajo y estrecho en la cintura, hasta el suelo.
    blob.chain(
        [(0, 0.02, 0.06), (0, 0.02, 0.5), (0, 0, 1.05), (0, 0, 1.5), (0, 0, 1.96)],
        [0.5, 0.42, 0.28, 0.27, 0.3],
        scale_x=[1.25, 1.2, 1.1, 1.15, 1.5],
        scale_y=[1.15, 1.05, 0.9, 0.82, 0.8],
        density=0.3,
    )
    blob.ellipsoid((0, -0.03, 2.28), (0.15, 0.16, 0.2))
    blob.chain([(0, 0, 1.98), (0, -0.02, 2.14)], [0.1, 0.09])
    for sx in (1, -1):
        blob.ellipsoid((0.38 * sx, 0, 1.96), (0.17, 0.16, 0.14))
        blob.chain([(0.38 * sx, 0, 1.94), (0.56 * sx, -0.04, 1.42)], [0.11, 0.09])
        blob.chain([(0.56 * sx, -0.04, 1.42), (0.62 * sx, -0.16, 0.92)], [0.09, 0.12])
    body = m.body_from_blob(blob, "regenteBody", 3200, m.gradient(P["low"], P["mid"], P["high"], 0.0, 2.2), resolution=0.02)
    s.cut_below(body, 0.004)
    surface = m.Surface(body)

    rigid = []  # (pieza, hueso)
    # Corona: aro y puntas de oro.
    rigid.append((c.ring_tube("crownRing", (0, -0.03, 2.43), 0.17, 0.022, P["gold"], segments=14), "head"))
    for i in range(7):
        a = i / 7 * math.tau + math.pi / 2
        base = (math.cos(a) * 0.17, -0.03 + math.sin(a) * 0.17, 2.44)
        tip = (math.cos(a) * 0.24, -0.03 + math.sin(a) * 0.24, 2.68 if i % 2 else 2.58)
        rigid.append((c.tube(f"crown{i}", [base, tip], [0.035, 0.0], P["gold"], sides=4), "head"))
    # Disco negro con aro de oro, a la espalda: el eclipse que le da nombre.
    rigid.append((c.ellipsoid("disc", (0, 0.26, 2.42), (0.52, 0.025, 0.52), P["disc"], subdivisions=2), "head"))
    rigid.append((c.tube("discRing", _circle(0.24, 2.42, 0.54), [0.02] * 19, P["goldDark"], sides=4), "head"))
    # Hombreras.
    for sx, side in ((1, "L"), (-1, "R")):
        rigid.append((m.rock(f"pauldron{side}", (0.42 * sx, 0, 2.04), (0.2, 0.2, 0.1), seed=3 + sx, tilt=(0, 0.3 * sx, 0)), "chest"))
        c.paint_flat(rigid[-1][0], P["goldDark"])
    # La hoja: larga, con guarda de oro, en la mano derecha y hacia delante.
    hand = (-0.62, -0.2, 0.86)
    rigid.append((c.ellipsoid("handR", hand, (0.09, 0.09, 0.09), P["skin"], subdivisions=2), "forearm.R"))
    rigid.append((c.box("guard", (hand[0] - 0.05, hand[1] - 0.08, hand[2] - 0.02), (0.2, 0.16, 0.08), P["gold"]), "forearm.R"))
    # Hacia fuera y abajo: así la silueta de la hoja se ve también de frente.
    tip = (hand[0] - 0.95, hand[1] - 1.2, hand[2] - 0.5)
    blade = c.tube(
        "bladeEdge",
        [(hand[0] - 0.06, hand[1] - 0.1, hand[2] - 0.03), (hand[0] - 0.7, hand[1] - 0.88, hand[2] - 0.36), tip],
        [0.075, 0.06, 0.0],
        P["gold"],
        sides=4,
        flatten=0.3,
    )
    rigid.append((blade, "forearm.R"))
    rigid.append((c.ellipsoid("handL", (0.62, -0.2, 0.86), (0.09, 0.09, 0.09), P["skin"], subdivisions=2), "forearm.L"))

    glow = []
    for sx in (1, -1):
        glow.append((m.glow_eye(f"eye{sx}", surface.front(0.06 * sx, 2.3, -0.012), (0.04, 0.018, 0.02), P["ember"]), "head"))
    glow.append((m.glow_eye("core", surface.front(0, 1.72, -0.02), (0.055, 0.03, 0.09), P["ember"]), "chest"))
    return body, rigid, glow


def arms(lx, rx, lf=0, rf=0):
    return {"upperarm.L": [("x", lx)], "upperarm.R": [("x", rx)], "forearm.L": [("x", lf)], "forearm.R": [("x", rf)]}


def keys_idle():
    return [(0.0, {}), (0.5, {"@scale:chest": (1.015, 1.015, 1.02), "head": [("x", 2)], **arms(-2, -3)})]


def keys_move():
    step = {"thigh.L": [("x", -16)], "thigh.R": [("x", 12)], "shin.R": [("x", 14)], "chest": [("z", -4)], "@loc:hips": (0, 0, -0.02)}
    mid = {"thigh.L": [("x", 2)], "thigh.R": [("x", -3)], "@loc:hips": (0, 0, 0.02)}

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
    # Se lleva la hoja atrás y gira el torso: se lee bien desde lejos.
    raised = {**arms(-8, -95, 0, -30), "chest": [("z", 34), ("x", -6)], "head": [("z", -16)]}
    return [(0.0, {}), (0.7, raised), (1.0, raised)]


def keys_sweep():
    start = {**arms(-8, -95, 0, -30), "chest": [("z", 34), ("x", -6)]}
    end = {**arms(8, -75, 0, -8), "chest": [("z", -38), ("x", 10)], "head": [("z", 12)]}
    return [(0.0, start), (1.0, end)]


def keys_lunge_windup():
    # Se encoge hacia atrás con la hoja a la altura del pecho: anuncia la línea.
    coil = {**arms(14, -60, -10, -70), "chest": [("x", -14), ("z", 14)], "head": [("x", 8)], "@loc:hips": (0, 0.1, -0.06)}
    return [(0.0, {}), (0.75, coil), (1.0, coil)]


def keys_lunge():
    start = {**arms(14, -60, -10, -70), "chest": [("x", -14), ("z", 14)]}
    thrust = {**arms(26, -92, -6, 0), "chest": [("x", 26), ("z", -12)], "head": [("x", -10)], "@loc:hips": (0, -0.12, -0.08)}
    return [(0.0, start), (0.35, thrust), (1.0, thrust)]


def keys_cast_windup():
    raised = {**arms(-150, -120, -24, -20), "chest": [("x", -14)], "head": [("x", -14)], "@loc:hips": (0, 0, 0.05)}
    return [(0.0, {}), (0.7, raised), (1.0, {**raised, **arms(-160, -128, -30, -24)})]


def keys_cast():
    start = {**arms(-160, -128, -30, -24), "chest": [("x", -14)]}
    open_arms = {**arms(-40, -48, -6, -6), "chest": [("x", 18)], "head": [("x", 6)], "@loc:hips": (0, 0, -0.08)}
    return [(0.0, start), (0.3, open_arms), (1.0, open_arms)]


def keys_hurt():
    return [(0.0, {}), (0.3, {"chest": [("x", -8)], "head": [("x", -10)]}), (1.0, {})]


def keys_stagger():
    bent = {**arms(-12, -18, -4, -4), "chest": [("x", 32)], "head": [("x", 16)], "@loc:hips": (0, 0, -0.2)}
    return [(0.0, {}), (0.2, bent), (0.85, bent), (1.0, {})]


def build(data):
    g = data["regent"]
    attacks = g["attacks"]
    armature = r.create_armature("regenteRig", BONES)
    body, rigid, glow = build_mesh()
    r.bind_automatic(body, armature)
    for part, bone in [*rigid, *glow]:
        r.set_rigid_group(part, bone)
    mesh = m.finish("regente", armature, [body, *(p for p, _ in rigid)], [p for p, _ in glow], data["outline"], outline=0.01)
    clips = {
        "idle": r.make_clip(armature, "idle", keys_idle(), 120, loop=True),
        "move": r.make_clip(armature, "move", keys_move(), 90, loop=True),
        "sweepWindup": r.make_clip(armature, "sweepWindup", keys_sweep_windup(), r.clip_frames(attacks["sweep"]["windup"])),
        "sweep": r.make_clip(armature, "sweep", keys_sweep(), r.clip_frames(attacks["sweep"]["active"])),
        "lungeWindup": r.make_clip(armature, "lungeWindup", keys_lunge_windup(), r.clip_frames(attacks["lunge"]["windup"])),
        "lunge": r.make_clip(armature, "lunge", keys_lunge(), r.clip_frames(attacks["lunge"]["active"])),
        "castWindup": r.make_clip(armature, "castWindup", keys_cast_windup(), r.clip_frames(attacks["volley"]["windup"])),
        "cast": r.make_clip(armature, "cast", keys_cast(), r.clip_frames(attacks["volley"]["active"])),
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
        "previewTarget": 1.3,
        "previewDistance": 6.0,
        "previewShots": [("front", 0, 1.3, 6.0), ("threequarter", 35, 1.3, 6.0), ("side", 90, 1.3, 6.0), ("back", 180, 1.3, 6.0)],
    }
