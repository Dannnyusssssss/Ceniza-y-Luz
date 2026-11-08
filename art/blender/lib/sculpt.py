"""Formas orgánicas para los personajes.

- `Blob`: cuerpos suaves a partir de cadenas de metaballs (las uniones quedan redondeadas, como un modelado a mano).
- Cortes rectos (`bisect_faces`) para que los bordes entre colores de ropa queden limpios.
- Secciones del cuerpo (`section_loop`) para que cinturones, cuellos y faldas se ajusten a su forma.
- Mechones de pelo y cintas de tela con sección de lente (`lock`).
- Transferencia de pesos del cuerpo a la ropa (`transfer_weights`).
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import common as c

STIFFNESS = 2.0
THRESHOLD = 0.6


# ---------------------------------------------------------------------------
# Metaballs
# ---------------------------------------------------------------------------

def _element_radius(rho, spacing):
    """Radio de cada metaball para que una cadena densa tenga radio de superficie `rho`.

    Blender suma s·(1 − d²/R²)³ de todos los elementos y la superficie está donde la suma vale el umbral.
    """
    def field(radius):
        total, k = 0.0, 0
        while True:
            d2 = rho * rho + (k * spacing) ** 2
            if d2 >= radius * radius:
                return total
            value = STIFFNESS * (1 - d2 / (radius * radius)) ** 3
            total += value if k == 0 else 2 * value
            k += 1

    lo, hi = rho * 1.0001, rho * 6
    for _ in range(40):
        mid = (lo + hi) / 2
        if field(mid) < THRESHOLD:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def _frame(tangent, side_hint):
    """Base ortonormal: z local = tangente, x local lo más cerca posible de `side_hint`."""
    z = tangent.normalized()
    x = Vector(side_hint)
    x = (x - z * x.dot(z)).normalized()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()


def _lerp(a, b, t):
    return a + (b - a) * t


class Blob:
    """Colección de elementos de metaball que se convierte en una malla."""

    def __init__(self):
        self.elements = []

    def chain(self, points, radii, scale_x=None, scale_y=None, side=(1, 0, 0), density=0.4):
        """Cadena de elementos a lo largo de una polilínea con radio variable.

        Con `scale_x`/`scale_y` (uno por punto) la sección es elíptica: semiejes radio·escala en los ejes
        locales x (lo más cerca de `side`) e y.
        """
        pts = [Vector(p) for p in points]
        n = len(pts)
        sx = scale_x or [1.0] * n
        sy = scale_y or [1.0] * n
        rho_ref = min(radii)
        spacing = rho_ref * density
        lengths = [0.0]
        for a, b in zip(pts, pts[1:]):
            lengths.append(lengths[-1] + (b - a).length)
        total = lengths[-1]
        steps = max(1, int(math.ceil(total / spacing)))
        radius = _element_radius(rho_ref, total / steps) / rho_ref
        for i in range(steps + 1):
            s = total * i / steps
            k = 0
            while k < n - 2 and lengths[k + 1] < s:
                k += 1
            seg = lengths[k + 1] - lengths[k]
            t = 0.0 if seg <= 0 else (s - lengths[k]) / seg
            co = _lerp(pts[k], pts[k + 1], t)
            rho = _lerp(radii[k], radii[k + 1], t)
            tangent = (pts[k + 1] - pts[k]).normalized()
            self.elements.append({
                "co": co,
                "radius": radius * rho,
                "sx": _lerp(sx[k], sx[k + 1], t),
                "sy": _lerp(sy[k], sy[k + 1], t),
                "frame": _frame(tangent, side),
            })

    def ellipsoid(self, center, radii, tangent=(0, 0, 1), side=(1, 0, 0)):
        """Elemento suelto con forma de elipsoide (semiejes de superficie aproximados)."""
        rho = min(radii)
        r = _element_radius(rho, rho * 10) / rho
        self.elements.append({
            "co": Vector(center),
            "radius": r * rho,
            "sx": radii[0] / rho,
            "sy": radii[1] / rho,
            "sz": radii[2] / rho,
            "frame": _frame(Vector(tangent), side),
        })

    def to_object(self, name, resolution=0.006):
        mb = bpy.data.metaballs.new(f"{name}Meta")
        mb.resolution = resolution
        mb.render_resolution = resolution
        mb.threshold = THRESHOLD
        for e in self.elements:
            el = mb.elements.new(type="ELLIPSOID")
            el.co = e["co"]
            el.radius = e["radius"]
            el.stiffness = STIFFNESS
            el.size_x = e["sx"]
            el.size_y = e["sy"]
            el.size_z = e.get("sz", 1.0)
            el.rotation = e["frame"].to_quaternion()
        meta_obj = bpy.data.objects.new(f"{name}Meta", mb)
        bpy.context.scene.collection.objects.link(meta_obj)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        depsgraph.update()
        mesh = bpy.data.meshes.new_from_object(meta_obj.evaluated_get(depsgraph))
        bpy.data.objects.remove(meta_obj)
        bpy.data.metaballs.remove(mb)
        mesh.name = name
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


def decimate(obj, target_tris, symmetric=True):
    """Reduce la malla a unos `target_tris` triángulos conservando la forma."""
    current = c.triangle_count(obj)
    if current <= target_tris:
        return obj
    mod = obj.modifiers.new("decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = target_tris / current
    mod.use_symmetry = symmetric
    mod.symmetry_axis = "X"
    c.apply_modifiers(obj)
    return obj


# ---------------------------------------------------------------------------
# Cortes y secciones
# ---------------------------------------------------------------------------

def bisect_faces(obj, plane_co, plane_no, face_filter=None):
    """Corta con un plano solo las caras que cumplen `face_filter(centro)` (borde recto entre colores)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    faces = [f for f in bm.faces if face_filter is None or face_filter(f.calc_center_median())]
    if faces:
        edges = {e for f in faces for e in f.edges}
        verts = {v for f in faces for v in f.verts}
        bmesh.ops.bisect_plane(
            bm, geom=list(verts) + list(edges) + faces, plane_co=Vector(plane_co), plane_no=Vector(plane_no), dist=1e-5
        )
        # Las caras cortadas pueden quedar como n-gonos: se triangulan las que tengan más de 4 lados.
        ngons = [f for f in bm.faces if len(f.verts) > 4]
        if ngons:
            bmesh.ops.triangulate(bm, faces=ngons)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def cut_below(obj, z):
    """Elimina lo que queda por debajo de `z` y tapa el hueco (suela plana)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    result = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=(0, 0, 1), clear_inner=True, dist=1e-5)
    edges = [e for e in result["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
    if edges:
        bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    ngons = [f for f in bm.faces if len(f.verts) > 4]
    if ngons:
        bmesh.ops.triangulate(bm, faces=ngons)
    bm.to_mesh(obj.data)
    bm.free()


def section_loop(obj, plane_co, plane_no, near, samples=32):
    """Contorno cerrado de la malla cortada por un plano, el más cercano a `near`, remuestreado.

    Devuelve los puntos en orden antihorario visto desde la punta de la normal y empezando por detrás (+Y).
    """
    plane_co, plane_no, near = Vector(plane_co), Vector(plane_no).normalized(), Vector(near)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    result = bmesh.ops.bisect_plane(
        bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=plane_co, plane_no=plane_no, dist=1e-6
    )
    adjacency = {}
    for e in result["geom_cut"]:
        if isinstance(e, bmesh.types.BMEdge):
            a, b = e.verts
            adjacency.setdefault(a, []).append(b)
            adjacency.setdefault(b, []).append(a)
    loops, seen = [], set()
    for start in adjacency:
        if start in seen:
            continue
        loop, prev, cur = [start], None, start
        seen.add(start)
        while True:
            nxt = [v for v in adjacency[cur] if v is not prev and v not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            seen.add(cur)
            loop.append(cur)
        if len(loop) > 4:
            loops.append([v.co.copy() for v in loop])
    bm.free()
    if not loops:
        raise RuntimeError(f"Sin sección en {tuple(plane_co)}")
    best = min(loops, key=lambda pts: (sum(pts, Vector()) / len(pts) - near).length)
    return _resample_loop(best, plane_no, samples)


def _resample_loop(points, normal, samples):
    center = sum(points, Vector()) / len(points)
    # Orden antihorario respecto a la normal.
    area = Vector()
    for a, b in zip(points, points[1:] + points[:1]):
        area += (a - center).cross(b - center)
    if area.dot(normal) < 0:
        points = list(reversed(points))
    lengths = [0.0]
    closed = points + points[:1]
    for a, b in zip(closed, closed[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    total = lengths[-1]
    out = []
    k = 0
    for i in range(samples):
        s = total * i / samples
        while lengths[k + 1] < s:
            k += 1
        seg = lengths[k + 1] - lengths[k]
        t = 0.0 if seg <= 0 else (s - lengths[k]) / seg
        out.append(_lerp(closed[k], closed[k + 1], t))
    # Empieza por el punto más hacia atrás (+Y) para que todos los anillos queden alineados.
    start = max(range(samples), key=lambda i: (out[i] - center).y)
    return out[start:] + out[:start]


def loop_center(points):
    return sum(points, Vector()) / len(points)


def offset_loop(points, normal, amount, scale=1.0):
    """Separa un contorno hacia fuera (en su plano) y opcionalmente lo agranda."""
    center = loop_center(points)
    normal = Vector(normal).normalized()
    out = []
    for p in points:
        radial = p - center
        radial -= normal * radial.dot(normal)
        length = radial.length
        direction = radial / length if length > 1e-9 else Vector((1, 0, 0))
        out.append(center + direction * (length * scale + amount))
    return out


def loft(name, rings, closed=True, cap_start=False, cap_end=False):
    """Superficie que une anillos con el mismo número de puntos. Devuelve el objeto (sin pintar)."""
    bm = bmesh.new()
    vert_rings = [[bm.verts.new(p) for p in ring] for ring in rings]
    count = len(rings[0])
    span = count if closed else count - 1
    for a, b in zip(vert_rings, vert_rings[1:]):
        for k in range(span):
            k2 = (k + 1) % count
            bm.faces.new((a[k], a[k2], b[k2], b[k]))
    if cap_start and closed:
        bm.faces.new(list(reversed(vert_rings[0])))
    if cap_end and closed:
        bm.faces.new(vert_rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return c._object_from_bmesh(name, bm)


def band(name, loop, normal, height, thickness, offset=0.0):
    """Banda cerrada que abraza un contorno (cinturón, cuello, puño): sección elíptica."""
    normal = Vector(normal).normalized()
    center = loop_center(loop)
    sides = 6
    rings = []
    for k in range(sides):
        a = 2 * math.pi * k / sides
        ring = []
        for p in loop:
            radial = p - center
            radial -= normal * radial.dot(normal)
            radial.normalize()
            ring.append(p + radial * (offset + thickness * (0.5 + 0.5 * math.cos(a))) + normal * (height * 0.5 * math.sin(a)))
        rings.append(ring)
    # Los anillos de la sección se unen en forma de toro.
    bm = bmesh.new()
    verts = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(loop)
    for s in range(sides):
        a, b = verts[s], verts[(s + 1) % sides]
        for k in range(n):
            k2 = (k + 1) % n
            bm.faces.new((a[k], a[k2], b[k2], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = c._object_from_bmesh(name, bm)
    c.smooth(obj)
    return obj


# ---------------------------------------------------------------------------
# Mechones y cintas
# ---------------------------------------------------------------------------

def _catmull(points, t):
    """Punto de una curva Catmull-Rom que pasa por `points` (t de 0 a 1)."""
    n = len(points) - 1
    x = min(max(t, 0.0), 1.0) * n
    i = min(int(x), n - 1)
    u = x - i
    p0 = points[max(i - 1, 0)]
    p1, p2 = points[i], points[i + 1]
    p3 = points[min(i + 2, n)]
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)


def lock(name, points, widths, thickness, outward, colors, curl=0.25, steps=12, extra_t=(), across=5, open_end=False):
    """Mechón (o cinta) con sección de lente que se afina hasta la punta.

    - `points`: curva de la raíz a la punta. `widths`: semiancho en cada punto (0 en la punta = punta afilada).
    - `outward(p)`: dirección "hacia fuera" (la cara visible del mechón).
    - `colors(t, outer)`: color de cada tramo según la posición t (0 raíz, 1 punta) y si es la cara exterior.
    - `extra_t`: posiciones donde debe haber un anillo (bordes nítidos de franjas de color).
    """
    pts = [Vector(p) for p in points]
    ts = sorted(set([i / steps for i in range(steps + 1)] + [t for t in extra_t if 0 < t < 1]))
    centers = [_catmull(pts, t) for t in ts]

    def width_at(t):
        x = t * (len(widths) - 1)
        i = min(int(x), len(widths) - 2)
        return _lerp(widths[i], widths[i + 1], x - i)

    bm = bmesh.new()
    rings = []
    for idx, (t, p) in enumerate(zip(ts, centers)):
        if idx == 0:
            tangent = centers[1] - centers[0]
        elif idx == len(ts) - 1:
            tangent = centers[-1] - centers[-2]
        else:
            tangent = centers[idx + 1] - centers[idx - 1]
        tangent.normalize()
        n = Vector(outward(p))
        n = (n - tangent * n.dot(tangent)).normalized()
        a = tangent.cross(n).normalized()
        w = width_at(t)
        th = thickness * (0.35 + 0.65 * min(w / max(widths[0], 1e-6), 1.0))
        if w <= 1e-5 and not open_end:
            rings.append([bm.verts.new(p)])
            continue
        outer, inner = [], []
        for j in range(across):
            s = -1 + 2 * j / (across - 1)
            base = p + a * (s * w) - n * (curl * w * s * s)
            bulge = 1 - s * s
            outer.append(base + n * (th * bulge))
            inner.append(base - n * (th * 0.3 * bulge))
        # Anillo: exterior de un borde al otro y vuelta por el interior (los bordes se comparten).
        ring_pts = outer + list(reversed(inner[1:-1]))
        rings.append([bm.verts.new(q) for q in ring_pts])
    color_faces = []
    for idx, (ra, rb) in enumerate(zip(rings, rings[1:])):
        t_mid = (ts[idx] + ts[idx + 1]) / 2
        count = len(ra)
        for k in range(count):
            is_outer = k < across - 1
            if len(rb) == 1:
                f = bm.faces.new((ra[k], ra[(k + 1) % count], rb[0]))
            else:
                f = bm.faces.new((ra[k], ra[(k + 1) % count], rb[(k + 1) % count], rb[k]))
            color_faces.append((f, colors(t_mid, is_outer)))
    if len(rings[0]) > 2:
        f = bm.faces.new(list(reversed(rings[0])))
        color_faces.append((f, colors(0.0, False)))
    if len(rings[-1]) > 2:
        f = bm.faces.new(rings[-1])
        color_faces.append((f, colors(1.0, True)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # El orden de las caras se conserva al pasar a malla: se guarda el color de cada índice.
    bm.faces.index_update()
    ordered = [None] * len(bm.faces)
    for f, col in color_faces:
        ordered[f.index] = col
    obj = c._object_from_bmesh(name, bm)
    _paint_by_index(obj, ordered)
    c.smooth(obj)
    return obj


def _paint_by_index(obj, hex_per_face):
    mesh = obj.data
    attr = mesh.color_attributes.get(c.COLOR_ATTRIBUTE) or mesh.color_attributes.new(c.COLOR_ATTRIBUTE, "BYTE_COLOR", "CORNER")
    cache = {}
    for poly in mesh.polygons:
        hex_value = hex_per_face[poly.index] or "#ff00ff"
        rgb = cache.get(hex_value) or cache.setdefault(hex_value, c.hex_to_rgb(hex_value))
        for li in poly.loop_indices:
            attr.data[li].color = (*rgb, 1.0)
    mesh.color_attributes.active_color = attr


# ---------------------------------------------------------------------------
# Pesos
# ---------------------------------------------------------------------------

def transfer_weights(target, source):
    """Copia los pesos del cuerpo a una prenda pegada a él (sigue igual sus deformaciones)."""
    for group in source.vertex_groups:
        if target.vertex_groups.get(group.name) is None:
            target.vertex_groups.new(name=group.name)
    mod = target.modifiers.new("weights", "DATA_TRANSFER")
    mod.object = source
    mod.use_vert_data = True
    mod.data_types_verts = {"VGROUP_WEIGHTS"}
    mod.vert_mapping = "POLYINTERP_NEAREST"
    mod.layers_vgroup_select_src = "ALL"
    mod.layers_vgroup_select_dst = "NAME"
    with bpy.context.temp_override(object=target, active_object=target):
        bpy.ops.object.modifier_apply(modifier="weights")


def shade_hex(hex_value, factor, toward=None, amount=0.0):
    """Oscurece o aclara un color; con `toward` lo mezcla además con otro color."""
    value = hex_value.lstrip("#")
    rgb = [int(value[i:i + 2], 16) for i in (0, 2, 4)]
    if toward:
        tv = toward.lstrip("#")
        trgb = [int(tv[i:i + 2], 16) for i in (0, 2, 4)]
        rgb = [a + (b - a) * amount for a, b in zip(rgb, trgb)]
    rgb = [max(0, min(255, int(round(v * factor)))) for v in rgb]
    return "#" + "".join(f"{v:02x}" for v in rgb)
