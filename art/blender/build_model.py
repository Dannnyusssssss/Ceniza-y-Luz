"""Punto de entrada que ejecuta Blender en segundo plano para un modelo.

Uso (lo llama `art/build.mjs`):
  blender --background --factory-startup --python art/blender/build_model.py -- <args.json>

`args.json` contiene: model, mode ("generate" o "export"), blend, glb, previews, manifest y data
(colores y tiempos leídos de los datos del juego).
"""

import importlib
import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
for sub in ("lib", "props", "characters", "enemies"):
    sys.path.insert(0, os.path.join(HERE, sub))

import common  # noqa: E402

MODULES = {
    "blade": "blade",
    "dummy": "dummy",
    "alba": "twins",
    "ciro": "twins",
    "brumilla": "brumilla",
    "acechador": "acechador",
    "coloso": "coloso",
    "tirador": "tirador",
    "chest": "world_props",
    "beacon": "world_props",
    "switch": "world_props",
    "pushblock": "world_props",
    "plate": "world_props",
    "gate": "world_props",
    "torch": "cave_props",
    "prism": "cave_props",
    "shrine": "cave_props",
    "crystalwall": "cave_props",
    "guardian": "guardian",
    "ilse": "villagers",
    "oren": "villagers",
    "teo": "villagers",
}


def read_manifest_from_scene(model):
    """Lee clips, huesos y triángulos de la escena actual (sirve para modelos retocados a mano)."""
    clips = {}
    bones = []
    tris = 0
    for obj in bpy.data.objects:
        if obj.type == "ARMATURE":
            bones = [b.name for b in obj.data.bones]
            if obj.animation_data:
                for track in obj.animation_data.nla_tracks:
                    for strip in track.strips:
                        frames = int(round(strip.action_frame_end - strip.action_frame_start))
                        clips[track.name] = {"frames": frames, "seconds": frames / common.FPS}
        elif obj.type == "MESH" and obj.data.materials and obj.data.materials[0].name != "face":
            tris += common.triangle_count(obj)
    return {"model": model, "clips": clips, "bones": bones, "triangles": tris}


def main():
    args_path = sys.argv[sys.argv.index("--") + 1]
    with open(args_path, encoding="utf-8") as f:
        args = json.load(f)
    model = args["model"]

    if args["mode"] == "export":
        # Modelo retocado a mano: se abre tal cual y solo se exporta.
        bpy.ops.wm.open_mainfile(filepath=args["blend"])
        result = None
    else:
        common.reset_scene()
        module = importlib.import_module(MODULES[model])
        texture_dir = os.path.dirname(args["glb"])
        result = module.build(dict(args["data"], model=model, textureDir=texture_dir))
        common.save_blend(args["blend"])

    # Las vistas previas van antes de exportar: el exportador deja aplicada la última animación.
    if args.get("previews") and result is not None:
        if result.get("previewPose"):
            result["previewPose"]()
        target, distance = result["previewTarget"], result["previewDistance"]
        shots = result.get("previewShots") or [
            ("front", 0, target, distance),
            ("side", 90, target, distance),
            ("back", 180, target, distance),
        ]
        common.render_previews(args["previews"], model, shots)
        if result.get("restPose"):
            result["restPose"]()

    has_animation = any(o.type == "ARMATURE" for o in bpy.data.objects)
    common.export_glb(args["glb"], animations=has_animation)
    manifest = read_manifest_from_scene(model)
    manifest["textures"] = sorted(
        os.path.basename(img.filepath_raw) for img in bpy.data.images if img.filepath_raw.endswith(".png")
    )

    with open(args["manifest"], "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print("MODEL_OK", model, manifest["triangles"])


main()
