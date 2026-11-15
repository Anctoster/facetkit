"""scene_index - the scene as a table: one record per object. READ-ONLY.
Agents and checks work from this index, not from the scene: comparing two indexes shows exactly what
an operation did, and which zones need checking again. Cost grows with the number of objects, not
with their weight: heavy meshes are fingerprinted by counts and bounds only.

VIZ_ARGS = {"tools": r"<viz_dir>\\tools\\blender", "out": r"...\\index.json", "tile": 50.0,
            "pattern": "*", "heavy": 300000, "max_seconds": 60, "id_property": ""}
`complete` is False when the time limit stopped the walk: an incomplete index proves nothing."""
import bpy, fnmatch, hashlib, json, os, time
import numpy as np
from mathutils import Vector

A = dict(globals().get("VIZ_ARGS") or {})
C = {}
exec(compile(A.get("core_source") or open(os.path.join(A["tools"], "vizcore.py"), encoding="utf-8").read(), "vizcore.py", "exec"), C)
_OUT = []


def P(text):
    _OUT.append(str(text))
    print(text)


tile, heavy, limit, t0 = float(A.get("tile", 50.0)), int(A.get("heavy", 300000)), float(A.get("max_seconds", 60)), time.time()
index, complete, cache = {}, True, {}
coll_of = {}
for c in bpy.data.collections:
    for o in c.objects:
        coll_of.setdefault(o.name, c.name)
for o in bpy.context.scene.objects:
    if not fnmatch.fnmatch(o.name, A.get("pattern", "*")):
        continue
    if time.time() - t0 > limit:
        complete = False
        break
    pts = np.array([o.matrix_world @ Vector(c) for c in o.bound_box], dtype=float) if o.type in ("MESH", "CURVE", "SURFACE", "FONT", "META") else np.array([tuple(o.matrix_world.translation)] * 2)
    lo, hi = pts.min(axis=0), pts.max(axis=0)
    rec = {"type": o.type, "collection": coll_of.get(o.name), "parent": o.parent.name if o.parent else None,
           "transform": hashlib.sha1(repr([round(v, 4) for row in o.matrix_world for v in row]).encode()).hexdigest()[:10],
           "min": [round(float(x), 2) for x in lo], "max": [round(float(x), 2) for x in hi], "zones": C["zones_of_box"](lo, hi, tile),
           "materials": [s.material.name if s.material else None for s in o.material_slots],
           "modifiers": [m.type for m in o.modifiers], "constraints": [c.type for c in o.constraints],
           "scale_applied": all(abs(abs(s) - 1.0) < 1e-4 for s in o.scale)}
    if A.get("id_property"):
        rec["id"] = o.get(A["id_property"])
    if o.type == "MESH":
        me = o.data
        rec["verts"], rec["polys"] = len(me.vertices), len(me.polygons)
        if me.name not in cache:  # instances share a mesh: fingerprint it once
            if len(me.vertices) > heavy:
                cache[me.name] = "heavy|%d|%d|%d" % (len(me.vertices), len(me.edges), len(me.polygons))
            else:
                co = np.empty(len(me.vertices) * 3, dtype=np.float64)
                me.vertices.foreach_get("co", co)
                cache[me.name] = "%s|%d" % (C["geometry_key"](co), len(me.polygons))
        rec["geometry"] = cache[me.name]
    else:
        rec["geometry"] = o.type
    index[o.name] = rec
zones = {}
for n, r in index.items():
    for z in r["zones"]:
        zones.setdefault(z, {"objects": 0, "polys": 0})
        zones[z]["objects"] += 1
        zones[z]["polys"] += r.get("polys", 0)
out = {"complete": complete, "tile": tile, "objects": index, "zones": zones, "seconds": round(time.time() - t0, 1)}
if A.get("out"):
    os.makedirs(os.path.dirname(A["out"]), exist_ok=True)
    with open(A["out"], "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
mods = sum(1 for r in index.values() if r["modifiers"])
unscaled = [n for n, r in index.items() if not r["scale_applied"]]
top = sorted(zones.items(), key=lambda kv: -kv[1]["polys"])[:4]
P("index %s  objects %d  zones %d (tile %.0f m)  %.1f s" % ("complete" if complete else "INCOMPLETE - time limit reached, nothing may be concluded", len(index), len(zones), tile, out["seconds"]))
P("heaviest zones %s" % [(z, v["polys"]) for z, v in top])
P("objects with modifiers %d  with constraints %d  with a parent %d  with unapplied scale %d %s" %
  (mods, sum(1 for r in index.values() if r["constraints"]), sum(1 for r in index.values() if r["parent"]), len(unscaled), unscaled[:3]))
P("details: %s" % (A.get("out") or "(not written)"))
VIZ_DIGEST = "\n".join(_OUT)
VIZ_INDEX = out
VIZ_RESULTS = {"index": "OK" if complete else "SKIP"}
