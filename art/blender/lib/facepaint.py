"""Textura de la cara al estilo anime: ojos grandes, pestañas, cejas, nariz y boca.

Se dibuja con funciones de distancia sobre una cuadrícula en coordenadas del modelo (metros, vista frontal),
así lo que se pinta coincide con su sitio en la cabeza. El fondo es transparente: el juego recorta por alfa.
"""

import os

import bpy
import numpy as np


def _rgb(hex_value):
    v = hex_value.lstrip("#")
    srgb = np.array([int(v[i:i + 2], 16) / 255.0 for i in (0, 2, 4)])
    return srgb


def _mix(a, b, t):
    return a + (b - a) * t


class Canvas:
    def __init__(self, size, x_range, z_range, background):
        self.size = size
        self.x0, self.x1 = x_range
        self.z0, self.z1 = z_range
        js = (np.arange(size) + 0.5) / size
        self.x = self.x0 + js[np.newaxis, :] * (self.x1 - self.x0)
        self.z = self.z0 + js[:, np.newaxis] * (self.z1 - self.z0)
        self.x = np.broadcast_to(self.x, (size, size))
        self.z = np.broadcast_to(self.z, (size, size))
        self.pixel = (self.x1 - self.x0) / size
        # El color del fondo es el de la piel: así los bordes suavizados no se oscurecen.
        self.rgb = np.ones((size, size, 3)) * _rgb(background)
        self.alpha = np.zeros((size, size))

    def coverage(self, sdf):
        """Cobertura suavizada (0..1) a partir de una distancia con signo en metros."""
        return np.clip(0.5 - sdf / self.pixel, 0.0, 1.0)

    def fill(self, sdf, color):
        cov = self.coverage(sdf)
        col = color if isinstance(color, np.ndarray) and color.ndim == 3 else np.asarray(color)
        self.rgb = self.rgb * (1 - cov[..., None]) + col * cov[..., None]
        self.alpha = self.alpha + cov * (1 - self.alpha)

    def save(self, path, name):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        image = bpy.data.images.new(name, self.size, self.size, alpha=True)
        pixels = np.concatenate([self.rgb, self.alpha[..., None]], axis=2).astype(np.float32)
        image.pixels.foreach_set(pixels.ravel())
        image.filepath_raw = path
        image.file_format = "PNG"
        image.save()
        image.pack()
        return image


def _ellipse(cv, cx, cz, rx, rz):
    """Distancia aproximada con signo a una elipse."""
    q = np.sqrt(((cv.x - cx) / rx) ** 2 + ((cv.z - cz) / rz) ** 2)
    return (q - 1) * min(rx, rz)


def _stroke(cv, x_from, x_to, curve, thickness, side, cx):
    """Trazo a lo largo de una curva z = curve(u) con grosor variable; u es la distancia horizontal hacia fuera."""
    u = (cv.x - cx) * side
    inside = (u >= x_from) & (u <= x_to)
    zc = curve(u)
    th = thickness(u)
    d = np.abs(cv.z - zc) - th
    # Extremos redondeados.
    d = np.where(inside, d, np.maximum(d, np.minimum(np.abs(u - x_from), np.abs(u - x_to))))
    return d


def draw_face(path, name, colors, style):
    """Dibuja la cara y la guarda como PNG. `style` = 'alba' o 'ciro'."""
    x_range, z_range = FACE_RANGE
    cv = Canvas(512, x_range, z_range, colors["skin"])
    skin = _rgb(colors["skin"])
    lash = _rgb(colors["eyes"])
    iris_mid = _rgb(colors["iris"])
    iris_dark = _mix(iris_mid, lash, 0.7)
    iris_light = _mix(iris_mid, np.ones(3), 0.45)
    brow = _mix(_rgb(colors["hair"]), lash, 0.35)
    sclera = _rgb("#fdfaf7")
    sclera_shadow = _rgb("#d8d0e2")
    is_alba = style == "alba"

    eye_z = 1.392
    hw = 0.0215 if is_alba else 0.0205
    hu = 0.0205 if is_alba else 0.0175
    hl = 0.0165 if is_alba else 0.0145
    for side in (1, -1):
        cx = 0.046 * side

        def upper(u):
            s = np.clip(u / hw, -1, 1)
            return eye_z + hu * np.sqrt(np.clip(1 - s * s, 0, 1)) ** 0.8 * (1 - 0.18 * s) + 0.004 * s

        def lower(u):
            s = np.clip(u / hw, -1, 1)
            return eye_z - hl * np.clip(1 - s * s, 0, 1) ** 0.75 + 0.003 * s

        u = (cv.x - cx) * side
        eye_sdf = np.maximum(np.maximum(cv.z - upper(u), lower(u) - cv.z), np.abs(u) - hw)
        # Blanco del ojo con la sombra del párpado arriba.
        cv.fill(eye_sdf, sclera)
        cv.fill(np.maximum(eye_sdf, (upper(u) - 0.0055) - cv.z), sclera_shadow)
        # Iris con degradado vertical (oscuro arriba, claro abajo) y aro exterior.
        icx, icz, irx, irz = cx - 0.0012 * side, eye_z - 0.0008, 0.0138, 0.0192
        iris_sdf = np.maximum(_ellipse(cv, icx, icz, irx, irz), eye_sdf)
        t = np.clip((cv.z - (icz - irz)) / (2 * irz), 0, 1)[..., None]
        gradient = _mix(iris_light, iris_dark, t ** 0.9)
        cv.fill(iris_sdf, lash)
        cv.fill(np.maximum(_ellipse(cv, icx, icz, irx - 0.0013, irz - 0.0013), eye_sdf), gradient)
        cv.fill(np.maximum(_ellipse(cv, icx, icz + 0.0015, 0.0055, 0.0085), eye_sdf), _mix(lash, iris_dark, 0.3))
        # Sombra del párpado sobre el iris.
        cv.fill(np.maximum(iris_sdf, (upper(u) - 0.0045) - cv.z), _mix(iris_dark, lash, 0.5))
        # Brillos: uno grande arriba y uno pequeño abajo.
        cv.fill(_ellipse(cv, icx - 0.0048 * side, icz + 0.0068, 0.0042, 0.0056), np.ones(3))
        cv.fill(_ellipse(cv, icx + 0.0052 * side, icz - 0.0078, 0.0019, 0.0021), np.ones(3))
        # Pestaña superior: gruesa, más hacia fuera y con un pequeño rabillo.
        def lash_curve(uu):
            s = uu / hw
            base = upper(np.clip(uu, -hw, hw))
            return np.where(s > 1, base + 0.010 * (s - 1), base)

        def lash_thick(uu):
            s = uu / hw
            th = 0.0021 + 0.0016 * np.clip(s, 0, 1)
            return np.where(s > 1, th * np.clip(1 - (s - 1) / 0.32, 0, 1), np.where(s < -0.85, th * np.clip((s + 1.06) / 0.21, 0, 1), th))

        lash_sdf = _stroke(cv, -hw * 1.06, hw * 1.32, lash_curve, lash_thick, side, cx)
        cv.fill(lash_sdf + 0.0, lash)
        # Pestaña inferior: fina, solo en la mitad exterior.
        lower_sdf = _stroke(cv, hw * 0.15, hw * 1.0, lambda uu: lower(uu) - 0.0006, lambda uu: 0.0007 + 0.0006 * np.clip(uu / hw, 0, 1), side, cx)
        cv.fill(lower_sdf, _mix(lash, skin, 0.25))
        # Pliegue del párpado.
        crease_sdf = _stroke(cv, -hw * 0.45, hw * 0.95, lambda uu: upper(uu) + 0.0062, lambda uu: 0.0005, side, cx)
        cv.fill(crease_sdf, _mix(skin, lash, 0.35))
        # Ceja.
        bx = cx + 0.002 * side
        brow_w = 0.023
        if is_alba:
            brow_curve = lambda uu: 1.4325 + 0.0045 * (1 - ((uu + 0.002) / brow_w) ** 2) - 0.0015 * uu / brow_w
            brow_thick = lambda uu: 0.0013 * np.clip(1.1 - 0.6 * uu / brow_w, 0.35, 1.2)
        else:
            brow_curve = lambda uu: 1.4335 + 0.003 * (1 - ((uu + 0.004) / brow_w) ** 2) + 0.001 * uu / brow_w
            brow_thick = lambda uu: 0.0019 * np.clip(1.15 - 0.55 * uu / brow_w, 0.4, 1.2)
        cv.fill(_stroke(cv, -brow_w, brow_w, brow_curve, brow_thick, side, bx), brow)

    # Nariz: una pequeña sombra a un lado (la luz viene de la izquierda de la imagen).
    cv.fill(_ellipse(cv, 0.0035, 1.3505, 0.0016, 0.0032), _mix(skin, lash, 0.28))
    # Boca: línea corta con las comisuras algo hacia arriba.
    mouth_w = 0.0105 if is_alba else 0.0115
    mouth_curve = lambda uu: 1.3185 + 0.0022 * (uu / mouth_w) ** 2 if is_alba else 1.3175 + 0.0012 * (uu / mouth_w) ** 2
    mouth_sdf = _stroke(cv, -mouth_w, mouth_w, lambda xx: mouth_curve(xx), lambda xx: 0.0008 * (1 - 0.5 * np.abs(xx / mouth_w)), 1, 0.0)
    cv.fill(mouth_sdf, _rgb("#8f4642"))
    if is_alba:
        # Labio inferior insinuado.
        cv.fill(_stroke(cv, -0.004, 0.004, lambda xx: 1.3142, lambda xx: 0.0005, 1, 0.0), _mix(skin, _rgb("#c4615a"), 0.45))
    return cv.save(path, name)


# Zona de la cabeza que cubre la textura (metros, vista frontal): X de -0.08 a 0.08 y Z de 1.30 a 1.46.
FACE_RANGE = ((-0.08, 0.08), (1.3, 1.46))
