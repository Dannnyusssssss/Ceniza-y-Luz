"""Utilidades comunes para generar los modelos del juego en Blender.

Convenciones:
- Unidades en metros, Z hacia arriba. Los personajes miran hacia -Y (de frente en la vista frontal).
- Los colores van como atributo de color por vértice ("Color"); el juego aplica su propio material.
- Nombres de material que el juego reconoce: "toon" (bandas de luz), "outline" (contorno), "glow" (brilla).
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

COLOR_ATTRIBUTE = "Color"
MAT_TOON = "toon"
MAT_OUTLINE = "outline"
MAT_GLOW = "glow"
FPS = 60


# ---------------------------------------------------------------------------
# Escena
# ---------------------------------------------------------------------------

def reset_scene():
    """Deja una escena vacía con 60 fotogramas por segundo."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.render.fps_base = 1.0
    scene.unit_settings.system = "METRIC"
    return scene


def hex_to_rgb(value):
    """'#rrggbb' -> (r, g, b) en espacio lineal, como espera Blender."""
    value = value.lstrip("#")
    srgb = [int(value[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


# ---------------------------------------------------------------------------
# Mallas: cada constructor devuelve un objeto con un color uniforme ya pintado
# ---------------------------------------------------------------------------

def _object_from_bmesh(name, bm):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def paint(obj, color_fn, per_face=False):
    """Pinta el color por vértice. `color_fn(co)` recibe una posición y devuelve '#rrggbb'.

    Con `per_face`, cada cara toma un solo color (el de su centro): bordes nítidos entre zonas, estilo anime.
    """
    mesh = obj.data
    attr = mesh.color_attributes.get(COLOR_ATTRIBUTE)
    if attr is None:
        attr = mesh.color_attributes.new(COLOR_ATTRIBUTE, "BYTE_COLOR", "CORNER")
    cache = {}

    def rgb_for(co):
        hex_value = color_fn(co)
        rgb = cache.get(hex_value)
        if rgb is None:
            rgb = hex_to_rgb(hex_value)
            cache[hex_value] = rgb
        return rgb

    if per_face:
        for poly in mesh.polygons:
            rgb = rgb_for(obj.matrix_world @ poly.center)
            for li in poly.loop_indices:
                attr.data[li].color = (*rgb, 1.0)
    else:
        for loop in mesh.loops:
            rgb = rgb_for(obj.matrix_world @ mesh.vertices[loop.vertex_index].co)
            attr.data[loop.index].color = (*rgb, 1.0)
    mesh.color_attributes.active_color = attr
    return obj


def paint_flat(obj, hex_value):
    return paint(obj, lambda _co: hex_value)


def ellipsoid(name, center, radii, color, subdivisions=3):
    """Elipsoide (icosfera escalada)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=1.0)
    bmesh.ops.scale(bm, vec=Vector(radii), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    obj = _object_from_bmesh(name, bm)
    return paint_flat(obj, color)


def box(name, center, size, color, rotation=(0.0, 0.0, 0.0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    rot = Matrix.Rotation(rotation[2], 4, "Z") @ Matrix.Rotation(rotation[1], 4, "Y") @ Matrix.Rotation(rotation[0], 4, "X")
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return paint_flat(_object_from_bmesh(name, bm), color)


def tube(name, points, radii, color, sides=6, cap_end=True, flatten=1.0):
    """Tubo a lo largo de una polilínea, con radio variable por punto (mechones, bufandas, cintas).

    `flatten` < 1 aplana la sección (útil para mechones de pelo). Si `cap_end`, la punta se cierra en un vértice.
    """
    pts = [Vector(p) for p in points]
    bm = bmesh.new()
    rings = []
    prev_normal = None
    for i, p in enumerate(pts):
        if i == 0:
            tangent = (pts[1] - pts[0]).normalized()
        elif i == len(pts) - 1:
            tangent = (pts[-1] - pts[-2]).normalized()
        else:
            tangent = (pts[i + 1] - pts[i - 1]).normalized()
        # Marco que gira poco de un punto al siguiente, para que el tubo no se retuerza.
        if prev_normal is None:
            helper = Vector((0, 0, 1)) if abs(tangent.z) < 0.9 else Vector((1, 0, 0))
            normal = tangent.cross(helper).normalized()
        else:
            normal = (prev_normal - tangent * prev_normal.dot(tangent)).normalized()
        prev_normal = normal
        binormal = tangent.cross(normal).normalized()
        r = radii[i]
        is_tip = cap_end and i == len(pts) - 1 and r <= 1e-4
        if is_tip:
            rings.append([bm.verts.new(p)])
            continue
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            offset = normal * (math.cos(a) * r) + binormal * (math.sin(a) * r * flatten)
            ring.append(bm.verts.new(p + offset))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        if len(b) == 1:
            for k in range(len(a)):
                bm.faces.new((a[k], a[(k + 1) % len(a)], b[0]))
        else:
            for k in range(len(a)):
                bm.faces.new((a[k], a[(k + 1) % len(a)], b[(k + 1) % len(b)], b[k]))
    if len(rings[0]) > 2:
        bm.faces.new(list(reversed(rings[0])))
    if len(rings[-1]) > 2:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return paint_flat(_object_from_bmesh(name, bm), color)


def ring_tube(name, center, radius, thickness, color, segments=14, sides=5, scale=(1.0, 1.0)):
    """Anillo cerrado horizontal (cinturón, cuello de bufanda)."""
    bm = bmesh.new()
    rings = []
    c = Vector(center)
    for i in range(segments):
        a = 2 * math.pi * i / segments
        dir_ = Vector((math.cos(a) * scale[0], math.sin(a) * scale[1], 0))
        p = c + dir_ * radius
        out = Vector((math.cos(a), math.sin(a), 0))
        ring = []
        for k in range(sides):
            b = 2 * math.pi * k / sides
            ring.append(bm.verts.new(p + out * (math.cos(b) * thickness) + Vector((0, 0, math.sin(b) * thickness))))
        rings.append(ring)
    for i in range(segments):
        a, b = rings[i], rings[(i + 1) % segments]
        for k in range(sides):
            bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return paint_flat(_object_from_bmesh(name, bm), color)


def skin_body(name, verts, edges, radii, root_index, subdivisions=1):
    """Cuerpo suave a partir de un "esqueleto de vértices" con el modificador Skin y subdivisión."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, edges, [])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    skin = obj.modifiers.new("skin", "SKIN")
    skin.use_smooth_shade = True
    skin.branch_smoothing = 0.6
    for i, r in enumerate(radii):
        obj.data.skin_vertices[0].data[i].radius = r
    obj.data.skin_vertices[0].data[root_index].use_root = True
    sub = obj.modifiers.new("subsurf", "SUBSURF")
    sub.levels = subdivisions
    sub.render_levels = subdivisions
    apply_modifiers(obj)
    return obj


def apply_modifiers(obj):
    """Aplica todos los modificadores del objeto (deja la geometría final)."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    new_mesh = bpy.data.meshes.new_from_object(evaluated)
    old = obj.data
    obj.modifiers.clear()
    obj.data = new_mesh
    bpy.data.meshes.remove(old)
    return obj


def smooth(obj, value=True):
    for poly in obj.data.polygons:
        poly.use_smooth = value


def join(objects, name):
    """Une varios objetos en uno (una sola malla, una sola llamada de dibujo por material)."""
    objects = [o for o in objects if o is not None]
    if not objects:
        return None
    with bpy.context.temp_override(
        active_object=objects[0], selected_editable_objects=objects, selected_objects=objects
    ):
        bpy.ops.object.join()
    obj = objects[0]
    obj.name = name
    obj.data.name = name
    return obj


# ---------------------------------------------------------------------------
# Materiales y contorno
# ---------------------------------------------------------------------------

def toon_ramp(ramp):
    """Dos tonos con borde nítido: sombra fría algo violeta y luz plena (vista previa en Blender)."""
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.62, 0.56, 0.72, 1)
    ramp.color_ramp.elements[1].position = 0.32
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)


def _material(name, preview_color, emission=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    if name == MAT_OUTLINE:
        # Contorno: color oscuro sin luz y solo las caras traseras (casco invertido).
        emit = nodes.new("ShaderNodeEmission")
        emit.inputs["Color"].default_value = (*preview_color, 1.0)
        links.new(emit.outputs["Emission"], out.inputs["Surface"])
        mat.use_backface_culling = True
    else:
        # Vista previa en Blender: color por vértice con bandas de luz (difuso -> RGB -> rampa constante).
        attr = nodes.new("ShaderNodeVertexColor")
        attr.layer_name = COLOR_ATTRIBUTE
        diffuse = nodes.new("ShaderNodeBsdfDiffuse")
        to_rgb = nodes.new("ShaderNodeShaderToRGB")
        ramp = nodes.new("ShaderNodeValToRGB")
        toon_ramp(ramp)
        mix = nodes.new("ShaderNodeMixRGB")
        mix.blend_type = "MULTIPLY"
        mix.inputs["Fac"].default_value = 1.0
        links.new(diffuse.outputs["BSDF"], to_rgb.inputs["Shader"])
        links.new(to_rgb.outputs["Color"], ramp.inputs["Fac"])
        links.new(attr.outputs["Color"], mix.inputs["Color1"])
        links.new(ramp.outputs["Color"], mix.inputs["Color2"])
        emit = nodes.new("ShaderNodeEmission")
        emit.inputs["Strength"].default_value = 1.0 + emission
        links.new(mix.outputs["Color"], emit.inputs["Color"])
        links.new(emit.outputs["Emission"], out.inputs["Surface"])
        mat.use_backface_culling = True
    mat.diffuse_color = (*preview_color, 1.0)
    return mat


def assign_material(obj, name, preview_color=(1, 1, 1), emission=0.0):
    mat = _material(name, preview_color, emission)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat


def add_outline(obj, thickness, color_hex, tint=False):
    """Contorno de casco invertido: una capa algo más gruesa con las normales al revés.

    Se aplica como geometría (hereda los grupos de vértices, así se deforma con el esqueleto).
    Con `tint`, cada trozo de contorno toma un tono oscuro del color que rodea (trazo de color, como
    en un dibujo) en lugar de un único color.
    """
    outline_mat = _material(MAT_OUTLINE, hex_to_rgb(color_hex))
    obj.data.materials.append(outline_mat)
    mod = obj.modifiers.new("outline", "SOLIDIFY")
    mod.thickness = thickness
    mod.offset = 1.0
    mod.use_flip_normals = True
    mod.use_rim = False
    mod.material_offset = len(obj.data.materials) - 1
    mod.use_quality_normals = True
    # Se aplica solo este modificador; el de esqueleto (si existe) se mantiene.
    with bpy.context.temp_override(object=obj, active_object=obj):
        bpy.ops.object.modifier_move_to_index(modifier="outline", index=0)
        bpy.ops.object.modifier_apply(modifier="outline")
    # La capa del contorno copia los colores del cuerpo: se pinta toda del color del contorno,
    # así el juego solo necesita mostrar el color por vértice sin luz.
    outline_index = len(obj.data.materials) - 1
    rgb = hex_to_rgb(color_hex)
    attr = obj.data.color_attributes.get(COLOR_ATTRIBUTE)
    if attr is not None:
        for poly in obj.data.polygons:
            if poly.material_index == outline_index:
                for li in poly.loop_indices:
                    if tint:
                        src = attr.data[li].color
                        attr.data[li].color = tuple(rgb[k] * 0.55 + src[k] * 0.16 for k in range(3)) + (1.0,)
                    else:
                        attr.data[li].color = (*rgb, 1.0)
    return obj


def triangle_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


# ---------------------------------------------------------------------------
# Archivo, exportación y vistas previas
# ---------------------------------------------------------------------------

def save_blend(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # Sin copias de respaldo (.blend1): el archivo se regenera entero cada vez.
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)


def export_glb(path, animations=False):
    """Exporta a .glb sin compresión externa (sin Draco ni meshopt) y con colores por vértice."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_image_format="NONE",
        export_draco_mesh_compression_enable=False,
        export_meshopt_compression_enable=False,
        export_skins=True,
        export_morph=False,
        export_animations=animations,
        export_animation_mode="NLA_TRACKS",
        export_def_bones=False,
        export_leaf_bone=False,
        export_optimize_animation_size=True,
        export_anim_slide_to_zero=True,
        export_force_sampling=False,
        export_frame_step=1,
    )


def render_previews(out_dir, name, shots, size=(520, 720)):
    """Renders con una luz de sol y fondo neutro.

    `shots` = [(nombre, ángulo en grados alrededor del modelo, altura del objetivo, distancia)];
    ángulo 0 = de frente (cámara en -Y), 90 = desde su izquierda.
    """
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.get("preview") or bpy.data.worlds.new("preview")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.34, 0.37, 0.43, 1)
        bg.inputs["Strength"].default_value = 0.6
    scene.world = world
    sun_data = bpy.data.lights.new("previewSun", "SUN")
    sun_data.energy = 2.6
    sun = bpy.data.objects.new("previewSun", sun_data)
    sun.rotation_euler = (math.radians(50), 0.0, math.radians(-35))
    scene.collection.objects.link(sun)
    cam_data = bpy.data.cameras.new("previewCam")
    cam_data.lens = 70
    cam = bpy.data.objects.new("previewCam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    paths = []
    for view, degrees, target_z, distance in shots:
        a = math.radians(degrees)
        cam.location = (math.sin(a) * distance, -math.cos(a) * distance, target_z + 0.05)
        direction = Vector((0, 0, target_z)) - cam.location
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(out_dir, f"{name}-{view}.png")
        bpy.ops.render.render(write_still=True)
        paths.append(scene.render.filepath)
    bpy.data.objects.remove(cam)
    bpy.data.objects.remove(sun)
    return paths
