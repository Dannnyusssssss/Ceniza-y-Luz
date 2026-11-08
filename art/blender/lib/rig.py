"""Esqueleto y animaciones.

Las posturas se escriben con giros en ejes globales del modelo en reposo (X = hacia la izquierda
del personaje, Y = hacia atrás, Z = arriba; el personaje mira hacia -Y). Ejemplos:
- Muslo hacia delante: giro negativo en X.  Tronco inclinado hacia delante: giro positivo en X.
- Girar el torso hacia su izquierda: giro positivo en Z.
Cada giro es relativo al hueso padre, como en una cadena de articulaciones.
"""

import math

import bpy
from mathutils import Euler, Quaternion, Vector

from common import FPS


def create_armature(name, bones):
    """Crea el esqueleto. `bones` es una lista de (nombre, cabeza, cola, padre o None, deforma)."""
    data = bpy.data.armatures.new(name)
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    view_layer = bpy.context.view_layer
    for other in view_layer.objects:
        other.select_set(False)
    view_layer.objects.active = obj
    obj.select_set(True)
    if True:
        bpy.ops.object.mode_set(mode="EDIT")
        edit = data.edit_bones
        for bone_name, head, tail, parent, deform in bones:
            b = edit.new(bone_name)
            b.head = Vector(head)
            b.tail = Vector(tail)
            b.use_deform = deform
            # Rollo estable: el eje Z local apunta hacia delante (-Y) o arriba en huesos horizontales.
            direction = (b.tail - b.head).normalized()
            b.align_roll(Vector((0, -1, 0)) if abs(direction.y) < 0.9 else Vector((0, 0, 1)))
            if parent:
                b.parent = edit[parent]
                b.use_connect = False
        bpy.ops.object.mode_set(mode="OBJECT")
    for pb in obj.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return obj


def bind_automatic(mesh_obj, armature):
    """Asigna pesos automáticos (calor) del esqueleto a la malla."""
    view_layer = bpy.context.view_layer
    for other in view_layer.objects:
        other.select_set(False)
    mesh_obj.select_set(True)
    armature.select_set(True)
    view_layer.objects.active = armature
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    mesh_obj.select_set(False)
    armature.select_set(False)


def bind_with_groups(mesh_obj, armature):
    """Une la malla al esqueleto usando los grupos de vértices que ya tiene."""
    mesh_obj.parent = armature
    mod = mesh_obj.modifiers.new("armature", "ARMATURE")
    mod.object = armature


def set_rigid_group(obj, bone_name):
    """Toda la malla sigue a un solo hueso (ojos, pelo corto, accesorios rígidos)."""
    group = obj.vertex_groups.get(bone_name) or obj.vertex_groups.new(name=bone_name)
    group.add([v.index for v in obj.data.vertices], 1.0, "REPLACE")


def set_gradient_groups(obj, bone_a, bone_b, z_from, z_to):
    """Reparte el peso entre dos huesos según la altura (para pelo largo y capas que se balancean)."""
    ga = obj.vertex_groups.get(bone_a) or obj.vertex_groups.new(name=bone_a)
    gb = obj.vertex_groups.get(bone_b) or obj.vertex_groups.new(name=bone_b)
    for v in obj.data.vertices:
        z = (obj.matrix_world @ v.co).z
        t = min(max((z_from - z) / (z_from - z_to), 0.0), 1.0)
        ga.add([v.index], 1.0 - t, "REPLACE")
        gb.add([v.index], t, "REPLACE")


def _global_rotation(rotations):
    """Convierte [('x', grados), ('z', grados), ...] en un cuaternión aplicado en ese orden."""
    q = Quaternion()
    for axis, degrees in rotations:
        vec = {"x": Vector((1, 0, 0)), "y": Vector((0, 1, 0)), "z": Vector((0, 0, 1))}[axis]
        q = Quaternion(vec, math.radians(degrees)) @ q
    return q


def apply_pose(armature, pose):
    """Aplica una postura. `pose` = {hueso: [('x', grados), ...]} y opcionalmente {'@loc:hueso': (x, y, z)}."""
    for pb in armature.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector((0, 0, 0))
    for key, value in pose.items():
        if key.startswith("@loc:"):
            pb = armature.pose.bones[key[5:]]
            # El desplazamiento se da en ejes globales y se pasa al espacio local del hueso.
            rest = pb.bone.matrix_local.to_3x3()
            pb.location = rest.inverted() @ Vector(value)
            continue
        pb = armature.pose.bones[key]
        rest = pb.bone.matrix_local.to_quaternion()
        q_global = _global_rotation(value)
        # Giro global (en reposo) llevado al espacio local del hueso.
        pb.rotation_quaternion = rest.inverted() @ q_global @ rest


# Huesos que no llevan claves en los clips: los mueve el juego por código (balanceo del pelo, capa, bufanda).
SECONDARY_BONES = ("hair.1", "hair.2", "cape", "scarf")


def key_pose(armature, frame):
    for pb in armature.pose.bones:
        if pb.name in SECONDARY_BONES or pb.name == "root":
            continue
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        pb.keyframe_insert("location", frame=frame)


def make_clip(armature, name, keys, frames, loop=False):
    """Crea un clip como pista NLA (el exportador glTF crea una animación por pista).

    `keys` = [(tiempo normalizado 0..1, postura), ...]. Si `loop`, el último fotograma repite el primero.
    Devuelve la duración en fotogramas.
    """
    action = bpy.data.actions.new(name)
    armature.animation_data_create()
    armature.animation_data.action = action
    for t, pose in keys:
        apply_pose(armature, pose)
        key_pose(armature, round(t * frames))
    if loop:
        apply_pose(armature, keys[0][1])
        key_pose(armature, frames)
    for fcurve in _fcurves(action):
        for kp in fcurve.keyframe_points:
            kp.interpolation = "BEZIER"
    armature.animation_data.action = None
    track = armature.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, action)
    strip.name = name
    track.mute = True
    action.use_fake_user = True
    return frames


def _fcurves(action):
    """Curvas de una acción (Blender 5 guarda las curvas en capas y ranuras)."""
    curves = getattr(action, "fcurves", None)
    if curves is not None:
        return list(curves)
    result = []
    for layer in getattr(action, "layers", []):
        for strip in layer.strips:
            for bag in getattr(strip, "channelbags", []):
                result.extend(bag.fcurves)
    return result


def clip_frames(seconds):
    """Fotogramas enteros que cubren `seconds` a 60 fps."""
    return max(1, math.ceil(seconds * FPS - 1e-6))


def rest_pose(armature):
    apply_pose(armature, {})


__all__ = [
    "create_armature",
    "bind_automatic",
    "bind_with_groups",
    "set_rigid_group",
    "set_gradient_groups",
    "apply_pose",
    "make_clip",
    "clip_frames",
    "rest_pose",
    "Euler",
]
