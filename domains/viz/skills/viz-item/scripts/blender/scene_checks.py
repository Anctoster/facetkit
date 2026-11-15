"""scene_checks - READ-ONLY defect checks for the open Blender scene. Changes nothing.
Run inside Blender with VIZ_ARGS defined first, for example:
  VIZ_ARGS = {"out": r"...\\checks.json", "terrain": "Teren*", "expected_holes": 0, "height_limit": 60.0, "height_pattern": "*",
              "designed": "Bud*", "etalon_materials": ["BRICK_RED", "GLASS_CLEAR"], "max_polys": 3000000}
Each check prints one line: OK / FAIL / SKIP(reason). A skipped check is not a passed one.
Checks: holes and non-manifold edges in terrain meshes, objects above a height limit, missing textures,
        designed objects using materials outside the etalon list, objects with no material, negative scale."""
import bpy, fnmatch, json, os
import numpy as np
from mathutils import Vector

A = dict(globals().get("VIZ_ARGS") or {})
_OUT = []


def P(text):
    _OUT.append(str(text))
    print(text)

res, lines = {}, []
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]


def report(name, status, text, data=None):
    res[name] = {"status": status, "text": text, "data": data}
    lines.append("%-4s %s: %s" % (status, name, text))


def boundary_loops(me):
    """Open edges (one face) grouped into loops, and edges shared by more than two faces."""
    ne = len(me.edges)
    if ne == 0 or len(me.polygons) == 0:
        return [], 0
    le = np.empty(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("edge_index", le)
    use = np.bincount(le, minlength=ne)
    ev = np.empty(ne * 2, dtype=np.int32)
    me.edges.foreach_get("vertices", ev)
    ev = ev.reshape(-1, 2)
    open_e = ev[use == 1]
    parent = {}

    def find(x):
        while parent.setdefault(x, x) != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b in open_e.tolist():
        parent[find(a)] = find(b)
    groups = {}
    for a, b in open_e.tolist():
        groups.setdefault(find(a), []).append(a)
    return list(groups.values()), int((use > 2).sum())


# 1. terrain: holes and bad joins -------------------------------------------------------------
pat = A.get("terrain")
if not pat:
    report("terrain_holes", "SKIP", "no 'terrain' name pattern given")
else:
    hit = [o for o in meshes if fnmatch.fnmatch(o.name, pat)]
    budget, found, heavy, nonman = A.get("max_polys", 3000000), [], [], 0
    for o in hit:
        if len(o.data.polygons) > budget:
            heavy.append(o.name)
            continue
        loops, nm = boundary_loops(o.data)
        nonman += nm
        loops.sort(key=len, reverse=True)
        co = o.data.vertices
        for lp in loops[1:]:  # the longest open loop is the outer border; the others are holes
            c = o.matrix_world @ (sum((co[i].co for i in lp[:200]), Vector()) / min(len(lp), 200))
            found.append({"object": o.name, "edges": len(lp), "at": [round(c.x, 1), round(c.y, 1), round(c.z, 1)]})
    found.sort(key=lambda h: -h["edges"])
    if not hit:
        report("terrain_holes", "SKIP", "no object matches '%s'" % pat)
    elif heavy and not found:
        report("terrain_holes", "SKIP", "too heavy to scan: %s" % heavy[:3])
    else:
        # an opening cut on purpose (the site model sits in it) is declared with "expected_holes"
        ok = len(found) == A.get("expected_holes", 0) and not nonman
        report("terrain_holes", "OK" if ok else "FAIL",
               "%d objects, %d holes (expected %d), %d edges shared by >2 faces%s%s" %
               (len(hit), len(found), A.get("expected_holes", 0), nonman, "; largest at %s" % found[0]["at"] if found else "",
                "; NOT scanned: %s" % heavy[:3] if heavy else ""), found[:50])

# 2. height limit ---------------------------------------------------------------------------------
lim = A.get("height_limit")
if lim is None:
    report("height_limit", "SKIP", "no 'height_limit' given")
else:
    hp, over = A.get("height_pattern", "*"), []
    for o in meshes:
        if fnmatch.fnmatch(o.name, hp):
            top = max((o.matrix_world @ Vector(c)).z for c in o.bound_box)
            if top > lim:
                over.append((round(top, 2), o.name))
    over.sort(reverse=True)
    report("height_limit", "FAIL" if over else "OK", "%d objects above %.2f m%s" %
           (len(over), lim, "; highest %s" % (over[0],) if over else ""), over[:50])

# 3. textures on disk ------------------------------------------------------------------------------
missing = sorted(i.name for i in bpy.data.images
                 if i.source == "FILE" and i.packed_file is None and not os.path.exists(bpy.path.abspath(i.filepath)))
report("missing_textures", "FAIL" if missing else "OK", "%d image files not found %s" % (len(missing), missing[:4]), missing)

# 4. designed objects use only etalon materials ------------------------------------------------------
des, eta = A.get("designed"), A.get("etalon_materials")
if not des or not eta:
    report("etalon_materials", "SKIP", "needs 'designed' pattern and 'etalon_materials' list")
else:
    eta, foreign, n = set(eta), {}, 0
    for o in meshes:
        if fnmatch.fnmatch(o.name, des):
            n += 1
            for s in o.material_slots:
                if s.material and s.material.name not in eta:
                    foreign.setdefault(s.material.name, []).append(o.name)
    top = sorted(((len(v), k) for k, v in foreign.items()), reverse=True)
    report("etalon_materials", "FAIL" if foreign else ("OK" if n else "SKIP"),
           "%d designed objects, %d materials outside the etalon list %s" % (n, len(foreign), top[:4]),
           {k: v[:20] for k, v in foreign.items()})

# 5. objects without material, mirrored scale -------------------------------------------------------
bare = [o.name for o in meshes if len(o.data.polygons) and not any(s.material for s in o.material_slots)]
report("no_material", "FAIL" if bare else "OK", "%d mesh objects without material %s" % (len(bare), bare[:4]), bare[:200])
neg = [o.name for o in meshes if o.matrix_world.determinant() < 0]
report("negative_scale", "FAIL" if neg else "OK", "%d mirrored objects (flipped normals risk) %s" % (len(neg), neg[:4]), neg[:200])

path = A.get("out")
if path:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(res, f, indent=1, ensure_ascii=False)
for l in lines:
    P(l)
c = {s: sum(1 for r in res.values() if r["status"] == s) for s in ("OK", "FAIL", "SKIP")}
P("RESULT passed %d  failed %d  skipped %d  not run 0   details: %s" % (c["OK"], c["FAIL"], c["SKIP"], path or "-"))
VIZ_DIGEST = "\n".join(_OUT)
VIZ_RESULTS = {k: v["status"] for k, v in res.items()}  # same text, for tools that do not return printed output
