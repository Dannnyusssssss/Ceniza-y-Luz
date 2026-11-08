"""Cuerpo de los gemelos: una sola pieza orgánica (metaballs) con la ropa pintada en zonas de borde recto.

Medidas en metros; el personaje mira hacia -Y y X positivo es su lado izquierdo.
"""

import math

from mathutils import Vector

import common as c
import sculpt as s

# Articulaciones en reposo (las mismas que el esqueleto).
SHOULDER = Vector((0.15, 0.0, 1.19))
ELBOW = Vector((0.3, 0.0, 1.03))
WRIST = Vector((0.44, -0.01, 0.88))
FINGERS = Vector((0.5, -0.015, 0.82))
HIP = Vector((0.088, 0.0, 0.82))
KNEE = Vector((0.095, 0.0, 0.45))
ANKLE = Vector((0.095, 0.01, 0.085))

# Perfil del tronco: (altura, semiancho, semifondo, desplazamiento en Y). Ciro es algo más ancho de hombros.
TORSO = {
    "alba": [
        (0.79, 0.098, 0.074, 0.008), (0.85, 0.116, 0.082, 0.01), (0.91, 0.114, 0.08, 0.009),
        (0.97, 0.097, 0.069, 0.005), (1.025, 0.086, 0.062, 0.0), (1.075, 0.091, 0.066, -0.004),
        (1.125, 0.1, 0.074, -0.009), (1.175, 0.108, 0.07, -0.004), (1.212, 0.11, 0.06, 0.002),
        (1.236, 0.068, 0.048, 0.004),
    ],
    "ciro": [
        (0.79, 0.096, 0.072, 0.006), (0.85, 0.106, 0.076, 0.007), (0.91, 0.103, 0.073, 0.006),
        (0.97, 0.097, 0.068, 0.004), (1.025, 0.095, 0.066, 0.0), (1.075, 0.102, 0.07, -0.003),
        (1.125, 0.112, 0.075, -0.005), (1.175, 0.12, 0.072, -0.003), (1.212, 0.122, 0.062, 0.002),
        (1.236, 0.074, 0.05, 0.004),
    ],
}

# Grosor de brazos y piernas (multiplicador por personaje).
LIMB_SCALE = {"alba": 1.0, "ciro": 1.1}
LEG_SCALE = {"alba": 1.0, "ciro": 0.97}


def arm_polyline(sx):
    return [Vector((p.x * sx, p.y, p.z)) for p in (SHOULDER, ELBOW, WRIST, FINGERS)]


def _hand(blob, sx, k):
    """Mano en manopla con pulgar: palma, bloque de dedos algo curvado y pulgar delante."""
    wrist = Vector((WRIST.x * sx, WRIST.y, WRIST.z))
    tip = Vector((FINGERS.x * sx, FINGERS.y, FINGERS.z))
    d = (tip - wrist).normalized()
    # La palma mira hacia el muslo (hacia dentro y algo abajo); el ancho va de delante a atrás.
    palm_normal = Vector((-sx, 0.0, 0.0))
    palm_normal = (palm_normal - d * palm_normal.dot(d)).normalized()
    across = d.cross(palm_normal).normalized()
    if across.y > 0:
        across = -across
    palm_center = wrist + d * 0.03
    blob.ellipsoid(palm_center, (0.012 * k, 0.026 * k, 0.034), tangent=d, side=palm_normal)
    fingers_center = wrist + d * 0.072 + palm_normal * 0.008
    blob.ellipsoid(fingers_center, (0.011 * k, 0.024 * k, 0.03), tangent=(d + palm_normal * 0.35), side=palm_normal)
    thumb_root = wrist + d * 0.02 + across * 0.018 + palm_normal * 0.004
    thumb_tip = wrist + d * 0.058 + across * 0.026 + palm_normal * 0.02
    blob.chain([thumb_root, thumb_tip], [0.0095 * k, 0.0085 * k])


def body_object(model):
    """Malla del cuerpo completa (sin pintar), cerrada y con suela plana."""
    k = LIMB_SCALE[model]
    kl = LEG_SCALE[model]
    blob = s.Blob()
    profile = TORSO[model]
    rho = 0.06
    blob.chain(
        [(0, yc, z) for z, _w, _d, yc in profile],
        [rho] * len(profile),
        scale_x=[w / rho for _z, w, _d, _y in profile],
        scale_y=[d / rho for _z, _w, d, _y in profile],
        density=0.25,
    )
    # Cuello (entra en la cabeza, que lo tapa).
    blob.chain([(0, 0.01, 1.22), (0, 0.004, 1.34)], [0.037 * k, 0.034 * k])
    for sx in (1, -1):
        # Hombro (deltoides) que une el tronco con el brazo.
        blob.chain([(0.05 * sx, 0.0, 1.214), (0.152 * sx, 0.0, 1.19)], [0.046 * k, 0.045 * k])
        mid_upper = SHOULDER.lerp(ELBOW, 0.45)
        blob.chain(
            [Vector((SHOULDER.x * sx, 0, SHOULDER.z)), Vector((mid_upper.x * sx, 0, mid_upper.z)), Vector((ELBOW.x * sx, 0, ELBOW.z))],
            [0.04 * k, 0.035 * k, 0.029 * k],
        )
        fore = ELBOW.lerp(WRIST, 0.3)
        blob.chain(
            [Vector((ELBOW.x * sx, ELBOW.y, ELBOW.z)), Vector((fore.x * sx, fore.y, fore.z)), Vector((WRIST.x * sx, WRIST.y, WRIST.z))],
            [0.029 * k, 0.031 * k, 0.021 * k],
        )
        _hand(blob, sx, k)
        # Pierna: muslo, rodilla, gemelo y tobillo.
        blob.chain(
            [(0.078 * sx, 0.004, 0.84), (0.09 * sx, 0.0, 0.66), (KNEE.x * sx, KNEE.y, KNEE.z)],
            [0.068 * kl, 0.056 * kl, 0.041 * kl],
        )
        blob.chain(
            [(KNEE.x * sx, 0.0, KNEE.z), (0.095 * sx, 0.009, 0.37), (0.095 * sx, 0.008, 0.22), (ANKLE.x * sx, ANKLE.y, ANKLE.z)],
            [0.042 * kl, 0.047 * kl, 0.034 * kl, 0.03 * kl],
        )
        # Caña de la bota: un poco más ancha que la pierna.
        blob.chain([(0.095 * sx, 0.008, 0.31), (0.095 * sx, 0.01, 0.11)], [0.036 * kl, 0.033 * kl])
        # Pie (bota): talón, planta y puntera, de sección aplanada.
        blob.chain(
            [(0.095 * sx, 0.035, 0.055), (0.096 * sx, -0.055, 0.042), (0.097 * sx, -0.118, 0.036)],
            [0.03, 0.03, 0.026],
            scale_x=[1.35, 1.45, 1.3],
            scale_y=[1.5, 1.2, 0.95],
            side=(1, 0, 0),
        )
    body = blob.to_object("body", resolution=0.0065)
    s.cut_below(body, 0.004)
    s.decimate(body, 3000)
    c.smooth(body)
    return body


# ---------------------------------------------------------------------------
# Zonas de ropa
# ---------------------------------------------------------------------------

def _arm_side(co):
    return 1 if co.x >= 0 else -1


def arm_param(co):
    """Si el punto es del brazo, devuelve (lado, distancia desde el hombro a lo largo del brazo); si no, None."""
    sx = _arm_side(co)
    if co.x * sx < 0.085 or co.z < 0.7:
        return None
    pts = arm_polyline(sx)
    direction = (pts[1] - pts[0]).normalized()
    if (co - pts[0]).dot(direction) < -0.004:
        return None
    best, best_d, acc = 0.0, 1e9, 0.0
    for a, b in zip(pts, pts[1:]):
        seg = b - a
        length = seg.length
        t = min(max((co - a).dot(seg) / (length * length), 0.0), 1.0)
        d = (a + seg * t - co).length
        if d < best_d:
            best_d, best = d, acc + t * length
        acc += length
    # Lejos del eje del brazo no es brazo (evita confundir la cadera o el muslo con la mano).
    if best_d > 0.075:
        return None
    return sx, best


def arm_point(sx, distance):
    """Punto del eje del brazo a una distancia del hombro, y la dirección local."""
    pts = arm_polyline(sx)
    acc = 0.0
    for a, b in zip(pts, pts[1:]):
        length = (b - a).length
        if distance <= acc + length:
            t = (distance - acc) / length
            return a.lerp(b, t), (b - a).normalized()
        acc += length
    return pts[-1], (pts[-1] - pts[-2]).normalized()


def cut_zones(body, arm_cuts, torso_cuts, leg_cuts, extra=None):
    """Corta el cuerpo para que cada cambio de color sea una línea recta."""
    for sx in (1, -1):
        shoulder = Vector((SHOULDER.x * sx, SHOULDER.y, SHOULDER.z))
        direction = (Vector((ELBOW.x * sx, ELBOW.y, ELBOW.z)) - shoulder).normalized()
        # Sisa: separa el brazo del tronco.
        s.bisect_faces(body, shoulder, direction, lambda p, sx=sx: p.x * sx > 0.07 and (p - shoulder).length < 0.12)
        for distance in arm_cuts:
            point, normal = arm_point(sx, distance)
            s.bisect_faces(body, point, normal, lambda p, point=point: (p - point).length < 0.07 and arm_param(p) is not None)
    for z in torso_cuts:
        s.bisect_faces(body, (0, 0, z), (0, 0, 1), lambda p: arm_param(p) is None and 0.6 < p.z < 1.3)
    for z in leg_cuts:
        s.bisect_faces(body, (0, 0, z), (0, 0, 1), lambda p: p.z < 0.6)
    for plane_co, plane_no, face_filter in extra or []:
        s.bisect_faces(body, plane_co, plane_no, face_filter)


def paint_zones(body, torso_zone, arm_zone, leg_zone):
    """Pinta cada cara según la zona: brazo (por distancia al hombro), piernas (por altura) o tronco."""
    def zone(co):
        arm = arm_param(co)
        if arm is not None:
            return arm_zone(arm[1])
        if co.z < 0.6:
            return leg_zone(co.z)
        return torso_zone(co)

    return c.paint(body, zone, per_face=True)
