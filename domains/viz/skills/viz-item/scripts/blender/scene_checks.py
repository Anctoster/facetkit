"""scene_checks - READ-ONLY defect checks for the open Blender scene. Changes nothing.
Run inside Blender with VIZ_ARGS defined first, for example:
  VIZ_ARGS = {"out": r"...\\checks.json", "terrain": "Teren*", "expected_holes": 0, "height_limit": 60.0, "height_pattern": "*",
              "designed": "Bud*", "etalon_materials": ["BRICK_RED", "GLASS_CLEAR"], "max_polys": 3000000}
Each check prints one line: OK / FAIL / SKIP(reason). A skipped check is not a passed one.
Checks: holes and non-manifold edges in terrain meshes, objects above a height limit, missing textures,
        designed objects using materials outside the etalon list, objects with no material, negative scale,
        closed solids that face inward ("closed"), objects not resting on their support ("grounded", "support",
        "gap_tolerance"), bounding-box clashes between two groups ("clash_a", "clash_b"), unused data ("max_orphans").
        The last four need "tools": the folder of vizcore.py."""
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

# 6. large-scene hygiene: inside-out meshes, objects hanging above their support, clashes, leftovers --------
def _core():
    src = A.get("core_source") or (open(os.path.join(A["tools"], "vizcore.py"), encoding="utf-8").read() if A.get("tools") else None)
    if not src:
        return None
    g = {}
    exec(compile(src, "vizcore.py", "exec"), g)
    return g


def _coords(o):
    co = np.empty(len(o.data.vertices) * 3, dtype=np.float64)
    o.data.vertices.foreach_get("co", co)
    m = np.array(o.matrix_world, dtype=np.float64)
    return co.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3]


def _box(objs):
    lo, hi = [], []
    for o in objs:
        pts = np.array([o.matrix_world @ Vector(c) for c in o.bound_box], dtype=float)
        lo.append(pts.min(axis=0)); hi.append(pts.max(axis=0))
    return np.array(lo), np.array(hi)


try:
    core = _core()
    closed_pat = A.get("closed")
    if not core or not closed_pat:
        report("inverted_normals", "SKIP", "needs 'tools' and a 'closed' name pattern (objects that are closed solids)")
    else:
        inside_out, looked = [], 0
        for o in [o for o in meshes if fnmatch.fnmatch(o.name, closed_pat)]:
            me = o.data
            if len(me.polygons) == 0 or len(me.polygons) > A.get("max_polys", 3000000) or boundary_loops(me)[0]:
                continue  # an open mesh has no inside
            looked += 1
            co = _coords(o)
            lv = np.empty(len(me.loops), dtype=np.int32); me.loops.foreach_get("vertex_index", lv)
            ls = np.empty(len(me.polygons), dtype=np.int32); me.polygons.foreach_get("loop_start", ls)
            lt = np.empty(len(me.polygons), dtype=np.int32); me.polygons.foreach_get("loop_total", lt)
            tris = []
            for k in range(1, int(lt.max()) - 1):  # fan triangles, one layer of the fan at a time
                sel = lt > k + 1
                tris.append(np.stack([co[lv[ls[sel]]], co[lv[ls[sel] + k]], co[lv[ls[sel] + k + 1]]], axis=1))
            vol = core["signed_volume"](np.concatenate(tris)) * (-1.0 if o.matrix_world.determinant() < 0 else 1.0)
            if vol < 0:
                inside_out.append(o.name)
        report("inverted_normals", "FAIL" if inside_out else ("OK" if looked else "SKIP"), "%d closed solids looked at, %d face inward %s" % (looked, len(inside_out), inside_out[:4]), inside_out[:200])
    gp, sp = A.get("grounded"), A.get("support")
    if not gp or not sp:
        report("floating", "SKIP", "needs 'grounded' (objects that must stand on something) and 'support' (what they stand on) patterns")
    else:
        from mathutils.bvhtree import BVHTree
        sup = [o for o in meshes if fnmatch.fnmatch(o.name, sp) and len(o.data.polygons) <= A.get("max_polys", 3000000)]
        gr = [o for o in meshes if fnmatch.fnmatch(o.name, gp)]
        if not sup or not gr:
            report("floating", "SKIP", "%d objects to check, %d support objects found" % (len(gr), len(sup)))
        else:
            verts, polys, base = [], [], 0
            for o in sup:
                co = _coords(o)
                verts.extend(map(tuple, co)); polys.extend([[base + i for i in p.vertices] for p in o.data.polygons]); base += len(co)
            tree = BVHTree.FromPolygons(verts, polys)
            tol, off = A.get("gap_tolerance", 0.02), []
            lo, hi = _box(gr)
            for o, l, h in zip(gr, lo, hi):
                hit = tree.ray_cast(Vector(((l[0] + h[0]) / 2, (l[1] + h[1]) / 2, h[2] + 1.0)), Vector((0, 0, -1)))[0]
                if hit is None:
                    off.append((None, o.name))
                elif abs(l[2] - hit.z) > tol:
                    off.append((round(float(l[2] - hit.z), 3), o.name))
            report("floating", "FAIL" if off else "OK", "%d objects checked; %d do not rest on their support within %.3f m (gap, name) %s" % (len(gr), len(off), tol, off[:4]), off[:200])
    ap, bp = A.get("clash_a"), A.get("clash_b")
    if not core or not ap or not bp:
        report("intersections", "SKIP", "needs 'tools' and the patterns 'clash_a' and 'clash_b'")
    else:
        ao, bo = [o for o in meshes if fnmatch.fnmatch(o.name, ap)], [o for o in meshes if fnmatch.fnmatch(o.name, bp) and not fnmatch.fnmatch(o.name, ap)]
        if not ao or not bo or len(ao) * len(bo) > 4000000:
            report("intersections", "SKIP", "%d x %d objects: nothing to compare, or too many pairs - narrow the patterns" % (len(ao), len(bo)))
        else:
            pairs = core["boxes_overlap"](*_box(ao), *_box(bo), margin=A.get("clash_margin", 0.05))
            names = [(ao[i].name, bo[j].name) for i, j in pairs]
            report("intersections", "FAIL" if names else "OK", "%d pairs of bounding boxes overlap by more than %.2f m %s" % (len(names), A.get("clash_margin", 0.05), names[:3]), names[:200])
except Exception as e:  # a check that broke has not passed
    report("hygiene.error", "SKIP", "stopped with %s: %s" % (type(e).__name__, str(e)[:160]))
orph = {k: sum(1 for d in getattr(bpy.data, k) if d.users == 0) for k in ("meshes", "materials", "images", "node_groups")}
report("orphans", "FAIL" if sum(orph.values()) > A.get("max_orphans", 0) else "OK", "unused data left in the file: %s" % orph, orph)

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
