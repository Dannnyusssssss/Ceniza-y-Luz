"""Animaciones de los gemelos (posturas clave; los tiempos de los golpes y la voltereta vienen del juego)."""

import rig as r


def base_pose(extra=None):
    """Postura relajada: brazos junto al cuerpo y la espada al frente con la mano derecha."""
    pose = {
        "upperarm.L": [("y", 38), ("x", 4)],
        "upperarm.R": [("y", -34), ("x", -8)],
        "forearm.L": [("x", -12)],
        "forearm.R": [("x", -38)],
        "hand.R": [("x", -10)],
    }
    for bone, rotations in (extra or {}).items():
        if bone.startswith("@"):
            pose[bone] = rotations
        else:
            pose[bone] = pose.get(bone, []) + rotations
    return pose


def mirror(pose):
    """Intercambia izquierda y derecha de una postura (para la segunda mitad de los ciclos)."""
    out = {}
    for bone, value in pose.items():
        if bone.startswith("@"):
            out[bone] = value
            continue
        other = bone.replace(".L", ".#").replace(".R", ".L").replace(".#", ".R")
        out[other] = [(ax, -deg if ax in ("y", "z") else deg) for ax, deg in value]
    return out


def walk_keys():
    contact = {
        "thigh.L": [("x", -24)], "shin.L": [("x", 6)], "foot.L": [("x", 8)],
        "thigh.R": [("x", 20)], "shin.R": [("x", 22)], "foot.R": [("x", -10)],
        "upperarm.L": [("x", 16)], "upperarm.R": [("x", -6)],
        "spine": [("z", -4)], "chest": [("z", -3)],
        "@loc:hips": (0, 0, -0.012),
    }
    passing = {
        "thigh.L": [("x", 2)], "shin.L": [("x", 8)],
        "thigh.R": [("x", -8)], "shin.R": [("x", 40)], "foot.R": [("x", -8)],
        "@loc:hips": (0, 0, 0.012),
    }
    keys = [(0.0, contact), (0.25, passing), (0.5, mirror(contact)), (0.75, mirror(passing))]
    return [(t, base_pose(p)) for t, p in keys]


def run_keys():
    contact = {
        "thigh.L": [("x", -48)], "shin.L": [("x", 16)], "foot.L": [("x", 10)],
        "thigh.R": [("x", 30)], "shin.R": [("x", 50)], "foot.R": [("x", -20)],
        "upperarm.L": [("x", 34), ("y", -12)], "forearm.L": [("x", -70)],
        "upperarm.R": [("x", -22), ("y", 8)], "forearm.R": [("x", -40)],
        "spine": [("x", 10), ("z", -7)], "chest": [("z", -5)], "head": [("x", -9)],
        "@loc:hips": (0, 0, -0.03),
    }
    passing = {
        "thigh.L": [("x", 0)], "shin.L": [("x", 20)],
        "thigh.R": [("x", -20)], "shin.R": [("x", 95)], "foot.R": [("x", -10)],
        "upperarm.L": [("y", -12)], "forearm.L": [("x", -70)], "forearm.R": [("x", -40)],
        "spine": [("x", 10)], "head": [("x", -9)],
        "@loc:hips": (0, 0, 0.035),
    }
    keys = [(0.0, contact), (0.25, passing), (0.5, mirror(contact)), (0.75, mirror(passing))]
    return [(t, base_pose(p)) for t, p in keys]


def idle_keys():
    breathe_in = {"chest": [("x", -2)], "upperarm.L": [("y", -2)], "upperarm.R": [("y", 2)], "head": [("x", 1)]}
    return [(0.0, base_pose()), (0.5, base_pose(breathe_in))]


def dodge_keys():
    tuck = {
        "thigh.L": [("x", -105)], "thigh.R": [("x", -100)], "shin.L": [("x", 135)], "shin.R": [("x", 130)],
        "upperarm.L": [("x", -55)], "upperarm.R": [("x", -55)], "forearm.L": [("x", -85)], "forearm.R": [("x", -85)],
        "spine": [("x", 32)], "chest": [("x", 18)], "head": [("x", 22)],
    }

    def roll(angle, lift, amount):
        pose = {bone: [(ax, deg * amount) for ax, deg in rots] for bone, rots in tuck.items()}
        pose["hips"] = [("x", angle)]
        pose["@loc:hips"] = (0, 0, lift)
        return base_pose(pose)

    crouch = base_pose({"thigh.L": [("x", -22)], "thigh.R": [("x", -18)], "shin.L": [("x", 32)], "shin.R": [("x", 30)], "spine": [("x", 14)], "@loc:hips": (0, 0, -0.06)})
    land = base_pose({"thigh.L": [("x", -16)], "thigh.R": [("x", -12)], "shin.L": [("x", 26)], "shin.R": [("x", 24)], "spine": [("x", 8)], "@loc:hips": (0, 0, -0.04)})
    return [
        (0.0, crouch),
        (0.14, roll(40, 0.02, 0.8)),
        (0.3, roll(110, 0.2, 1.0)),
        (0.5, roll(180, 0.27, 1.0)),
        (0.7, roll(260, 0.2, 1.0)),
        (0.86, roll(330, 0.05, 0.6)),
        (1.0, land),
    ]


def slash_keys(timing, direction):
    """Corte horizontal. `direction` 1 = de su derecha a su izquierda; -1 = revés."""
    d = timing["duration"]
    hit_from, hit_to = timing["hitFrom"] / d, timing["hitTo"] / d
    d_ = direction
    windup = base_pose({
        "spine": [("z", -22 * d_)], "chest": [("z", -16 * d_)],
        "upperarm.R": [("x", -78), ("z", -48 * d_)], "forearm.R": [("x", 10)], "hand.R": [("x", 30)],
        "upperarm.L": [("x", -20)], "thigh.L": [("x", -14)], "thigh.R": [("x", 10)],
    })
    strike = base_pose({
        "spine": [("z", 24 * d_)], "chest": [("z", 18 * d_)],
        "upperarm.R": [("x", -80), ("z", 62 * d_)], "forearm.R": [("x", 12)], "hand.R": [("x", 30)],
        "upperarm.L": [("x", 10)], "thigh.L": [("x", -24)], "shin.L": [("x", 20)], "thigh.R": [("x", 14)],
        "@loc:hips": (0, 0, -0.03),
    })
    follow = base_pose({
        "spine": [("z", 30 * d_)], "chest": [("z", 20 * d_)],
        "upperarm.R": [("x", -62), ("z", 72 * d_)], "forearm.R": [("x", -6)], "hand.R": [("x", 22)],
        "thigh.L": [("x", -20)], "shin.L": [("x", 18)], "thigh.R": [("x", 12)],
        "@loc:hips": (0, 0, -0.025),
    })
    return [(0.0, base_pose()), (hit_from, windup), (hit_to, strike), (min(hit_to + 0.25, 0.85), follow), (1.0, base_pose())]


def overhead_keys(timing):
    d = timing["duration"]
    hit_from, hit_to = timing["hitFrom"] / d, timing["hitTo"] / d
    windup = base_pose({
        "upperarm.R": [("x", -165), ("y", 20)], "forearm.R": [("x", -15)], "hand.R": [("x", 40)],
        "upperarm.L": [("x", -150), ("y", -20)], "forearm.L": [("x", -30)],
        "spine": [("x", -12)], "chest": [("x", -6)], "head": [("x", -6)],
        "thigh.R": [("x", 8)],
    })
    strike = base_pose({
        "upperarm.R": [("x", -42), ("y", 20)], "forearm.R": [("x", 8)], "hand.R": [("x", 25)],
        "upperarm.L": [("x", -38), ("y", -24)], "forearm.L": [("x", -20)],
        "spine": [("x", 24)], "chest": [("x", 10)], "head": [("x", -12)],
        "thigh.L": [("x", -34)], "shin.L": [("x", 42)], "thigh.R": [("x", 18)], "shin.R": [("x", 20)],
        "@loc:hips": (0, 0, -0.08),
    })
    return [(0.0, base_pose()), (hit_from, windup), (hit_to, strike), (0.8, strike), (1.0, base_pose())]


def hurt_keys():
    recoil = base_pose({
        "spine": [("x", -16)], "chest": [("x", -8)], "head": [("x", -16)],
        "upperarm.L": [("y", -12), ("x", 10)], "upperarm.R": [("y", 12)],
        "thigh.L": [("x", 10)], "shin.L": [("x", 12)], "@loc:hips": (0, 0, -0.02),
    })
    return [(0.0, base_pose()), (0.25, recoil), (1.0, base_pose())]


def fall_keys():
    buckle = base_pose({
        "thigh.L": [("x", -42)], "thigh.R": [("x", -36)], "shin.L": [("x", 85)], "shin.R": [("x", 80)],
        "spine": [("x", 22)], "head": [("x", 12)], "@loc:hips": (0, 0, -0.24),
    })
    kneel = base_pose({
        "thigh.L": [("x", -88)], "thigh.R": [("x", -84)], "shin.L": [("x", 140)], "shin.R": [("x", 138)],
        "spine": [("x", 30)], "head": [("x", 16)], "upperarm.L": [("x", -30)], "upperarm.R": [("x", -30)],
        "@loc:hips": (0, 0, -0.44),
    })
    lying = {
        "hips": [("x", 86)], "@loc:hips": (0, 0, -0.71),
        "upperarm.L": [("x", -150), ("y", -10)], "upperarm.R": [("x", -150), ("y", 10)],
        "forearm.L": [("x", -10)], "forearm.R": [("x", -10)], "head": [("x", -20), ("z", 25)],
    }
    return [(0.0, base_pose()), (0.3, buckle), (0.6, kneel), (1.0, lying)]


def build_animations(armature, timings):
    clips = {}
    clips["idle"] = r.make_clip(armature, "idle", idle_keys(), 120, loop=True)
    clips["walk"] = r.make_clip(armature, "walk", walk_keys(), 60, loop=True)
    clips["run"] = r.make_clip(armature, "run", run_keys(), 38, loop=True)
    clips["dodge"] = r.make_clip(armature, "dodge", dodge_keys(), r.clip_frames(timings["dodge"]))
    attacks = timings["attacks"]
    clips["attack1"] = r.make_clip(armature, "attack1", slash_keys(attacks[0], 1), r.clip_frames(attacks[0]["duration"]))
    clips["attack2"] = r.make_clip(armature, "attack2", slash_keys(attacks[1], -1), r.clip_frames(attacks[1]["duration"]))
    clips["attack3"] = r.make_clip(armature, "attack3", overhead_keys(attacks[2]), r.clip_frames(attacks[2]["duration"]))
    clips["hurt"] = r.make_clip(armature, "hurt", hurt_keys(), 24)
    clips["fall"] = r.make_clip(armature, "fall", fall_keys(), 60)
    r.rest_pose(armature)
    return clips


