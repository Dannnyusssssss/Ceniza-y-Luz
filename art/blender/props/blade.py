"""La Hoja de Luz: empuñadura, guarda y hoja que brilla.

El origen está en el centro de la empuñadura y la hoja apunta hacia +Z; el juego la engancha a la mano derecha.
"""

import common as c


def build(data):
    colors = data["blade"]
    hilt = c.tube(
        "hilt",
        [(0, 0, -0.09), (0, 0, 0.0), (0, 0, 0.09)],
        [0.019, 0.017, 0.019],
        colors["hilt"],
        sides=8,
        cap_end=False,
    )
    pommel = c.ellipsoid("pommel", (0, 0, -0.105), (0.03, 0.03, 0.026), colors["guard"], subdivisions=2)
    guard = c.box("guard", (0, 0, 0.105), (0.2, 0.04, 0.035), colors["guard"])
    guard_tips = [
        c.ellipsoid(f"guardTip{i}", (x, 0, 0.11), (0.024, 0.024, 0.024), colors["guard"], subdivisions=1)
        for i, x in enumerate((-0.105, 0.105))
    ]
    body = c.join([hilt, pommel, guard, *guard_tips], "bladeHilt")
    c.assign_material(body, c.MAT_TOON)

    # Hoja: sección de rombo aplanado que se afila hasta la punta.
    blade = c.tube(
        "bladeEdge",
        [(0, 0, 0.12), (0, 0, 0.5), (0, 0, 0.88), (0, 0, 0.98)],
        [0.034, 0.032, 0.026, 0.0],
        colors["blade"],
        sides=4,
        flatten=0.28,
    )
    c.assign_material(blade, c.MAT_GLOW, emission=1.5)

    obj = c.join([body, blade], "blade")
    c.add_outline(obj, 0.006, data["outline"])
    return {"object": obj, "armature": None, "clips": {}, "previewTarget": 0.45, "previewDistance": 2.6}
