"""scene_digest - READ-ONLY summary of the open Blender scene. Changes nothing, saves nothing but its JSON.
Run inside Blender. Parameters come from a dict named VIZ_ARGS defined before this file is executed:
  VIZ_ARGS = {"out": r"<viz_dir>\\work\\<ITEM>\\scene.json", "designed": "Bud*", "max_objects": 200000}
Prints a digest of about 20 lines (also left in the variable VIZ_DIGEST); details go to the JSON file."""
import bpy, fnmatch, hashlib, json, os
import numpy as np

A = dict(globals().get("VIZ_ARGS") or {})
_OUT = []


def P(text):
    _OUT.append(str(text))
    print(text)

S = bpy.context.scene


def rnd(v, n=4):
    try:
        return [round(float(x), n) for x in v]
    except TypeError:
        return round(float(v), n)


def node_fingerprint(mat):
    """Hash of everything that decides how a material looks: nodes, values, links, image files."""
    if not mat.use_nodes or mat.node_tree is None:
        return hashlib.sha1(repr(rnd(mat.diffuse_color)).encode()).hexdigest()[:12]
    parts = []
    for n in sorted(mat.node_tree.nodes, key=lambda n: n.name):
        row = [n.bl_idname, n.name]
        for i in n.inputs:
            if not i.is_linked and hasattr(i, "default_value"):
                try:
                    row.append((i.identifier, rnd(i.default_value)))
                except Exception:
                    row.append((i.identifier, str(i.default_value)))
        img = getattr(n, "image", None)
        if img is not None:
            row.append(("image", os.path.basename(bpy.path.abspath(img.filepath)), img.colorspace_settings.name))
        for attr in ("blend_type", "operation", "interpolation", "projection", "distribution", "data_type"):
            if hasattr(n, attr):
                row.append((attr, str(getattr(n, attr))))
        parts.append(row)
    for l in sorted(mat.node_tree.links, key=lambda l: (l.from_node.name, l.from_socket.identifier, l.to_node.name, l.to_socket.identifier)):
        parts.append((l.from_node.name, l.from_socket.identifier, l.to_node.name, l.to_socket.identifier))
    return hashlib.sha1(repr(parts).encode()).hexdigest()[:12]


objs = list(S.objects)
if len(objs) > A.get("max_objects", 200000):
    raise RuntimeError("scene_digest: %d objects is over max_objects; narrow the scene or raise the limit" % len(objs))
types = {}
verts = polys = 0
no_mat = 0
seen_meshes = set()
for o in objs:
    types[o.type] = types.get(o.type, 0) + 1
    if o.type == "MESH":
        if o.data.name not in seen_meshes:  # count each mesh datablock once; instances share it
            seen_meshes.add(o.data.name)
            verts += len(o.data.vertices)
            polys += len(o.data.polygons)
        if not any(s.material for s in o.material_slots):
            no_mat += 1
bb = None
mesh_objs = [o for o in objs if o.type == "MESH"]
if mesh_objs:
    pts = np.array([o.matrix_world @ __import__("mathutils").Vector(c) for o in mesh_objs for c in o.bound_box])
    bb = {"min": rnd(pts.min(axis=0), 2), "max": rnd(pts.max(axis=0), 2)}
materials = {m.name: {"users": m.users, "fp": node_fingerprint(m)} for m in bpy.data.materials}
designed = A.get("designed")
designed_mats = sorted({s.material.name for o in mesh_objs if designed and fnmatch.fnmatch(o.name, designed)
                        for s in o.material_slots if s.material})
missing = sorted(i.name for i in bpy.data.images
                 if i.source == "FILE" and i.packed_file is None and not os.path.exists(bpy.path.abspath(i.filepath)))
r = S.render
render = {"engine": r.engine, "size": "%dx%d" % (r.resolution_x, r.resolution_y), "percent": r.resolution_percentage,
          "frames": [S.frame_start, S.frame_end, S.frame_step], "fps": r.fps, "transparent": r.film_transparent,
          "format": r.image_settings.file_format, "view": S.view_settings.view_transform, "look": S.view_settings.look,
          "exposure": rnd(S.view_settings.exposure), "gamma": rnd(S.view_settings.gamma)}
if r.engine == "CYCLES":
    render.update(samples=S.cycles.samples, denoise=S.cycles.use_denoising, device=S.cycles.device)
suns = [{"name": o.name, "rot": rnd(o.rotation_euler), "strength": rnd(o.data.energy), "angle": rnd(o.data.angle)}
        for o in objs if o.type == "LIGHT" and o.data.type == "SUN"]
cams = [{"name": o.name, "lens": rnd(o.data.lens), "loc": rnd(o.location, 2), "active": o == S.camera}
        for o in objs if o.type == "CAMERA"]
colls = sorted(((c.name, len(c.all_objects)) for c in bpy.data.collections), key=lambda x: -x[1])
mat_fp = hashlib.sha1(repr(sorted((k, v["fp"]) for k, v in materials.items())).encode()).hexdigest()[:12]
designed_fp = hashlib.sha1(repr([(m, materials[m]["fp"]) for m in designed_mats]).encode()).hexdigest()[:12]
out = {"file": bpy.data.filepath, "blender": bpy.app.version_string, "dirty": bpy.data.is_dirty,
       "objects": len(objs), "types": types, "verts": verts, "polys": polys, "bbox": bb,
       "objects_without_material": no_mat, "materials": materials, "materials_fp": mat_fp,
       "designed_materials": designed_mats, "designed_fp": designed_fp, "missing_images": missing,
       "render": render, "suns": suns, "cameras": cams, "collections": dict(colls)}
path = A.get("out")
if path:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
P("file %s  blender %s  unsaved changes %s" % (os.path.basename(bpy.data.filepath) or "<unsaved>", bpy.app.version_string, bpy.data.is_dirty))
P("objects %d  %s" % (len(objs), "  ".join("%s %d" % kv for kv in sorted(types.items(), key=lambda x: -x[1])[:6])))
P("verts %d  polys %d  mesh objects without material %d" % (verts, polys, no_mat))
P("bbox min %s max %s" % ((bb["min"], bb["max"]) if bb else ("-", "-")))
P("materials %d  fingerprint %s  designed (%s) %d  fingerprint %s" % (len(materials), mat_fp, designed or "-", len(designed_mats), designed_fp))
P("missing image files %d %s" % (len(missing), missing[:4]))
P("render %s" % json.dumps(render))
P("suns %s" % json.dumps(suns[:2]))
P("cameras %d  active %s" % (len(cams), S.camera.name if S.camera else None))
P("top collections %s" % colls[:6])
P("details: %s" % (path or "(not written: no 'out' given)"))
VIZ_DIGEST = "\n".join(_OUT)  # same text, for tools that do not return printed output
