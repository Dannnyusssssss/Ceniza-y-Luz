"""Tirador de Ceniza: figura que flota, con capucha en punta, máscara clara con ojos de luz y una brasa entre las manos.

Se mantiene lejos, carga la brasa (se ve crecer) y lanza una bola de ceniza lenta.
"""

import math

import bmesh
from mathutils import Vector

import common as c
import mist as m
import rig as r
import sculpt as s

P = m.PALETTE

BONES = [
    ("root", (0, 0, 0), (0, 0.2, 0), None, False),
    ("body", (0, 0, 0.6), (0, 0, 1.05), "root", True),
    ("chest", (0, 0, 1.05), (0, 0, 1.36), "body", True),
    ("head", (0, 0, 1.36), (0, 0, 1.72), "chest", True),
    ("cloak.1", (0, 0.02, 0.95), (0, 0.04, 0.62), "body", True),
    ("cloak.2", (0, 0.04, 0.62), (0, 0.06, 0.28), "cloak.1", True),
    ("orb", (0, -0.38, 1.0), (0, -0.38, 1.12), "chest", True),
]
for _side, _sx in (("L", 1), ("R", -1)):
    BONES += [
        (f"arm.{_side}", (0.19 * _sx, 0, 1.3), (0.27 * _sx, -0.15, 1.1), "chest", True),
        (f"hand.{_side}", (0.27 * _sx, -0.15, 1.1), (0.12 * _sx, -0.32, 1.02), f"arm.{_side}", True),
    ]


def cloak():
    """Manto: anillos del cuello al bajo, que se ensancha y termina en jirones de bruma."""
    rings = []
    count = 28
    profile = [(1.38, 0.1, 0.09), (1.3, 0.22, 0.17), (1.12, 0.25, 0.2), (0.9, 0.27, 0.22), (0.66, 0.3, 0.25), (0.46, 0.33, 0.28)]
    for z, rx, ry in profile:
        rings.append([Vector((math.sin(2 * math.pi * k / count) * rx, 0.02 + math.cos(2 * math.pi * k / count) * ry, z)) for k in range(count)])
    # Bajo en picos: cada punta baja un poco más que la anterior, como jirones.
    hem = []
    for k in range(count):
        a = 2 * math.pi * k / count
        drop = 0.1 if k % 2 == 0 else 0.0
        hem.append(Vector((math.sin(a) * 0.31, 0.02 + math.cos(a) * 0.26, 0.36 - drop)))
    rings.append(hem)
    obj = s.loft("cloak", rings, closed=True)
    mod = obj.modifiers.new("thick", "SOLIDIFY")
    mod.thickness = 0.014
    mod.offset = 0
    c.apply_modifiers(obj)
    c.smooth(obj)
    def color(co):
        if co.z < 0.42:
            return P["wisp"]
        if co.z > 1.24:
            return P["bodyLight"]
        # Franja clara por delante, del cuello al bajo, con un ribete de brasa en el borde.
        if co.y < 0 and abs(co.x) < 0.045 + 0.05 * (1.24 - co.z):
            return P["bodyTop"]
        return P["body"]

    return c.paint(obj, color, per_face=True)


def hood():
    """Capucha en punta, abierta por delante."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=1.0)
    for v in bm.verts:
        d = v.co.copy()
        p = Vector((d.x * 0.16, d.y * 0.17, d.z * 0.19)) + Vector((0, 0.01, 1.5))
        # Punta de la capucha hacia arriba y atrás.
        if d.z > 0.3 and d.y > -0.2:
            k = (d.z - 0.3) / 0.7 * (d.y + 0.2) / 1.2
            p += Vector((0, 0.1 * k, 0.12 * k))
        v.co = p
    cut = [f for f in bm.faces if f.calc_center_median().y < -0.05 and 1.38 < f.calc_center_median().z < 1.62]
    bmesh.ops.delete(bm, geom=cut, context="FACES")
    obj = c._object_from_bmesh("hood", bm)
    mod = obj.modifiers.new("thick", "SOLIDIFY")
    mod.thickness = 0.016
    mod.offset = 1
    c.apply_modifiers(obj)
    c.smooth(obj)
    return c.paint(obj, m.gradient(P["body"], P["body"], P["bodyLight"], 1.35, 1.7), per_face=True)


def build_mesh():
    parts = {"head": [], "chest": [], "glow_head": [], "orb": [], "arms": []}
    parts["head"].append(hood())
    parts["head"].append(c.ellipsoid("void", (0, 0.0, 1.5), (0.13, 0.11, 0.15), P["pupil"], 2))
    mask = c.ellipsoid("mask", (0, -0.09, 1.49), (0.082, 0.04, 0.1), P["mask"], 3)
    c.smooth(mask)
    c.paint(mask, lambda co: P["maskShade"] if co.z < 1.43 else P["mask"], per_face=True)
    parts["head"].append(mask)
    # Una marca de brasa en la frente de la máscara.
    parts["head"].append(c.tube("mark", [(0, -0.128, 1.545), (0, -0.124, 1.575)], [0.007, 0.0035], P["ember"], sides=5))
    for sx in (1, -1):
        parts["glow_head"].append(m.glow_eye(f"eye{sx}", (0.034 * sx, -0.122, 1.5), (0.018, 0.012, 0.026), P["eyeAmber"]))
        sleeve = c.tube(
            f"sleeve{sx}",
            [(0.19 * sx, 0.0, 1.3), (0.27 * sx, -0.15, 1.1), (0.17 * sx, -0.29, 1.03)],
            [0.07, 0.07, 0.085],
            P["body"],
            sides=8,
        )
        c.smooth(sleeve)
        hand = c.ellipsoid(f"hand{sx}", (0.1 * sx, -0.33, 1.02), (0.04, 0.05, 0.035), P["maskShade"], 2)
        c.smooth(hand)
        parts["arms"].append((sleeve, sx, hand))
    parts["orb"].append(m.glow_eye("orb", (0, -0.38, 1.06), (0.085, 0.085, 0.085), P["ember"]))
    tatters = []
    for i in range(8):
        a = 2 * math.pi * (i + 0.5) / 8
        top = Vector((math.sin(a) * 0.29, 0.02 + math.cos(a) * 0.24, 0.42))
        out = Vector((math.sin(a), math.cos(a), 0))
        pts = [top, top + out * 0.03 + Vector((0, 0, -0.1)), top + out * 0.05 + Vector((0, 0.03, -0.22))]
        tatters.append(m.wisp(f"tatter{i}", pts, 0.06, lambda q, out=out: out, 0.016))
    return cloak(), parts, tatters


def keys_idle():
    return [(0.0, {"@loc:body": (0, 0, 0.0)}), (0.5, {"@loc:body": (0, 0, 0.07), "cloak.1": [("x", -5)], "cloak.2": [("x", -6)]})]


def keys_move():
    lean = {"body": [("x", 10)], "cloak.1": [("x", -14)], "cloak.2": [("x", -12)]}
    return [(0.0, {**lean, "@loc:body": (0, 0, 0.02)}), (0.5, {**lean, "@loc:body": (0, 0, 0.08), "cloak.2": [("x", -20)]})]


def hands(arm, hand):
    return {"arm.L": [("x", arm)], "arm.R": [("x", arm)], "hand.L": [("x", hand)], "hand.R": [("x", hand)]}


def keys_windup():
    charge = {**hands(-40, -25), "head": [("x", -8)], "@loc:orb": (0, 0.05, 0.22), "@scale:orb": (1.6, 1.6, 1.6), "body": [("x", -6)]}
    return [(0.0, {}), (0.8, charge), (1.0, {**charge, "@scale:orb": (1.8, 1.8, 1.8)})]


def keys_attack():
    throw = {**hands(-80, -5), "body": [("x", 14)], "head": [("x", 6)], "@loc:orb": (0, -0.35, 0.05), "@scale:orb": (0.2, 0.2, 0.2)}
    return [(0.0, {**hands(-40, -25), "@loc:orb": (0, 0.05, 0.22), "@scale:orb": (1.8, 1.8, 1.8)}), (1.0, throw)]


def keys_recover():
    return [(0.0, {**hands(-60, -5), "@scale:orb": (0.2, 0.2, 0.2)}), (0.6, {**hands(-20, 0), "@scale:orb": (0.7, 0.7, 0.7)}), (1.0, {})]


def keys_hurt():
    return [(0.0, {}), (0.3, {"body": [("x", -20)], "head": [("x", -12)], "@loc:body": (0, 0.1, 0.0), "cloak.2": [("x", 15)]}), (1.0, {})]


def build(data):
    stats = data["enemies"]["tirador"]
    armature = r.create_armature("tiradorRig", BONES)
    cloak_obj, parts, tatters = build_mesh()
    m.gradient_weights(cloak_obj, ["chest", "body", "cloak.1", "cloak.2"], [1.2, 0.95, 0.62, 0.3])
    for part in [*parts["head"], *parts["glow_head"]]:
        r.set_rigid_group(part, "head")
    for part in parts["orb"]:
        r.set_rigid_group(part, "orb")
    arms_toon = []
    for sleeve, sx, hand in parts["arms"]:
        side = "L" if sx > 0 else "R"
        m.gradient_weights(sleeve, [f"arm.{side}", f"hand.{side}"], [1.3, 1.03])
        r.set_rigid_group(hand, f"hand.{side}")
        arms_toon += [sleeve, hand]
    for t in tatters:
        r.set_rigid_group(t, "cloak.2")
    toon = [cloak_obj, *parts["head"], *arms_toon, *tatters]
    mesh = m.finish("tirador", armature, toon, [*parts["glow_head"], *parts["orb"]], data["outline"])

    clips = {
        "idle": r.make_clip(armature, "idle", keys_idle(), 120, loop=True),
        "move": r.make_clip(armature, "move", keys_move(), 70, loop=True),
        "windup": r.make_clip(armature, "windup", keys_windup(), r.clip_frames(stats["windup"])),
        "attack": r.make_clip(armature, "attack", keys_attack(), max(r.clip_frames(stats["active"]), 6)),
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
        "previewTarget": 0.95,
        "previewDistance": 3.6,
        "previewShots": [("front", 0, 0.95, 3.6), ("threequarter", 35, 0.95, 3.6), ("side", 90, 0.95, 3.6), ("back", 180, 0.95, 3.6)],
    }
