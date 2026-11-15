"""stage_checks - measured acceptance checks for each stage of a visualization project. READ-ONLY:
nothing in the scene is changed or saved (the one exception, `cameras.orbit` with "animated", steps
through frames and puts the current frame back).

Run inside Blender with VIZ_ARGS defined first. Only the groups that have parameters are run:

VIZ_ARGS = {
  "tools": r"<viz_dir>\\tools\\blender",            # where vizcore.py lives
  "out":   r"<viz_dir>\\work\\<ITEM>\\stage.json",
  "export":   {"pattern": "BLD_*", "reference": {"object": "REF_BOX", "size": [10, 10, 3], "tol": 0.005},
               "expected_bbox": {"min": [..], "max": [..], "tol": 0.01}, "id_property": "viz_id",
               "required_surfaces": ["Brick", "Glass"], "expected_counts": {"BLD_*": 120},
               "max_polys": 3000000, "max_objects": 50000},
  "junction": {"model_terrain": "SITE_*", "env_terrain": "ENV_terrain*", "max_step": 0.05, "max_gap": 0.05, "samples": 400},
  "environment": {"pattern": "ENV_*", "baseline": r"...\\env.json", "zone": {"min": [x, y], "max": [x, y]},
                  "write_baseline": r"...\\env.json"},
  "materials": {"pattern": "BLD_*", "etalon": r"...\\etalon.json", "tile": {"Brick": {"size": 0.25, "tol": 0.1}}},
  "cameras":  {"required": ["CAM_main"], "target": "BLD_*", "min_in_frame": 0.9, "lens": [18, 85],
               "orbit": {"pattern": "ORB_*", "count": 72, "max_step_error_deg": 0.5,
                         "max_radius_spread_pct": 1.0, "max_height_spread": 0.1}},
  "render":   {"expected": {"engine": "CYCLES", "size": "3840x2160", "samples": 256},
               "sun": {"lat": 50.0, "lon": 20.0, "utc": "2026-05-30T10:00:00", "tol_deg": 2.0, "north_offset_deg": 0.0}},
}

Every check prints one line:  OK | FAIL | SKIP(reason)  <check id>: <what was measured>.
A check that cannot run - a missing parameter, no matching object, an error - is SKIP, never OK."""
import bpy, datetime, fnmatch, hashlib, json, os, re
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

A = dict(globals().get("VIZ_ARGS") or {})
_OUT, RES = [], {}
C = {}
_src = A.get("core_source") or open(os.path.join(A["tools"], "vizcore.py"), encoding="utf-8").read()
exec(compile(_src, "vizcore.py", "exec"), C)
S = bpy.context.scene
MESHES = [o for o in S.objects if o.type == "MESH"]


def P(text):
    _OUT.append(str(text))
    print(text)


def report(cid, status, text, data=None):
    RES[cid] = {"status": status, "text": text, "data": data}
    P("%-4s %s: %s" % (status, cid, text))


def verdict(cid, ok, text, data=None):
    report(cid, "OK" if ok else "FAIL", text, data)


def match(pattern, objs=None):
    return [o for o in (MESHES if objs is None else objs) if fnmatch.fnmatch(o.name, pattern)]


def world_bbox(objs):
    pts = np.array([o.matrix_world @ Vector(c) for o in objs for c in o.bound_box], dtype=float)
    return pts.min(axis=0), pts.max(axis=0)


def world_coords(o):
    co = np.empty(len(o.data.vertices) * 3, dtype=np.float64)
    o.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    m = np.array(o.matrix_world, dtype=np.float64)
    return co @ m[:3, :3].T + m[:3, 3]


def open_edge_vertices(me):
    """Indices of vertices on open edges (edges that belong to exactly one face)."""
    ne = len(me.edges)
    if ne == 0 or len(me.polygons) == 0:
        return np.empty(0, dtype=np.int32)
    le = np.empty(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("edge_index", le)
    use = np.bincount(le, minlength=ne)
    ev = np.empty(ne * 2, dtype=np.int32)
    me.edges.foreach_get("vertices", ev)
    return np.unique(ev.reshape(-1, 2)[use == 1])


def node_fingerprint(mat):  # the same recipe as scene_digest.py, so that fingerprints compare
    def rnd(v, n=4):
        try:
            return [round(float(x), n) for x in v]
        except TypeError:
            return round(float(v), n)
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


# ---- export: what any Archicad -> Blender link must deliver ------------------------------------
def g_export(a):
    objs = match(a.get("pattern", "*"))
    if not objs:
        return report("export.objects", "SKIP", "no object matches '%s'" % a.get("pattern", "*"))
    us = S.unit_settings
    ok_units = us.system == "METRIC" and abs(us.scale_length - 1.0) < 1e-6
    ref = a.get("reference")
    if ref:
        ro = bpy.data.objects.get(ref["object"])
        if ro is None:
            report("export.scale", "SKIP", "reference object '%s' not found" % ref["object"])
        else:
            lo, hi = world_bbox([ro])
            d = float(np.abs(np.sort(hi - lo) - np.sort(np.array(ref["size"], float))).max())
            verdict("export.scale", ok_units and d <= ref.get("tol", 0.005),
                    "units %s x%.3f; reference '%s' differs from its true size by %.4f m (tolerance %.4f)" % (us.system, us.scale_length, ro.name, d, ref.get("tol", 0.005)), {"delta": d})
    else:
        report("export.scale", "SKIP", "no 'reference' object with a known size given (units are %s x%.3f)" % (us.system, us.scale_length))
    eb = a.get("expected_bbox")
    if eb:
        lo, hi = world_bbox(objs)
        d = C["bbox_delta"](lo, hi, eb["min"], eb["max"])
        verdict("export.position", d <= eb.get("tol", 0.01), "bounding box differs from the expected one by %.4f m (tolerance %.4f)" % (d, eb.get("tol", 0.01)), {"min": lo.tolist(), "max": hi.tolist()})
    else:
        report("export.position", "SKIP", "no 'expected_bbox' given")
    prop = a.get("id_property")
    if prop:
        ids = [o.get(prop) for o in objs]
        missing = [o.name for o, i in zip(objs, ids) if i in (None, "")]
        have = [i for i in ids if i not in (None, "")]
        dup = len(have) - len(set(have))
        verdict("export.ids", not missing and not dup, "%d objects, %d without '%s', %d repeated ids %s" % (len(objs), len(missing), prop, dup, missing[:3]), missing[:100])
    else:
        report("export.ids", "SKIP", "no 'id_property' given")
    names = sorted({s.material.name for o in objs for s in o.material_slots if s.material})
    req = a.get("required_surfaces")
    copies = [n for n in names if re.search(r"\.\d{3}$", n)]
    if req is not None:
        lost = [r for r in req if r not in names]
        verdict("export.surfaces", not lost and not copies, "%d surfaces; %d required ones missing %s; %d numbered copies %s" % (len(names), len(lost), lost[:4], len(copies), copies[:3]), {"missing": lost, "copies": copies})
    else:
        report("export.surfaces", "SKIP", "no 'required_surfaces' list given (%d surfaces, %d numbered copies)" % (len(names), len(copies)))
    ec = a.get("expected_counts")
    if ec:
        got = {p: len(match(p, list(S.objects))) for p in ec}
        bad = {p: (got[p], n) for p, n in ec.items() if got[p] != n}
        verdict("export.counts", not bad, "%d of %d groups have the expected number of objects %s" % (len(ec) - len(bad), len(ec), dict(list(bad.items())[:3])), got)
    else:
        report("export.counts", "SKIP", "no 'expected_counts' given")
    seen, twins = {}, []
    for o in objs:
        if len(o.data.vertices) > 200000:
            continue
        k = C["geometry_key"](world_coords(o))
        if k in seen:
            twins.append((seen[k], o.name))
        seen[k] = o.name
    verdict("export.duplicates", not twins, "%d objects occupy exactly the same place as another %s" % (len(twins), twins[:3]), twins[:100])
    polys = sum(len(o.data.polygons) for o in objs)
    mp, mo = a.get("max_polys"), a.get("max_objects")
    if mp or mo:
        verdict("export.budget", (not mp or polys <= mp) and (not mo or len(objs) <= mo), "%d objects (limit %s), %d polygons (limit %s)" % (len(objs), mo, polys, mp))
    else:
        report("export.budget", "SKIP", "no limits given (%d objects, %d polygons)" % (len(objs), polys))


# ---- junction: where the built surroundings meet the site model --------------------------------
def g_junction(a):
    model, env = match(a.get("model_terrain", "")), match(a.get("env_terrain", ""))
    if not model or not env:
        return report("junction.step", "SKIP", "needs objects for 'model_terrain' (%d found) and 'env_terrain' (%d found)" % (len(model), len(env)))
    limit = a.get("max_polys", 2000000)
    if sum(len(o.data.polygons) for o in env) > limit:
        return report("junction.step", "SKIP", "surroundings terrain is over %d polygons: name a smaller part" % limit)
    verts, polys, base = [], [], 0
    for o in env:
        co = world_coords(o)
        verts.extend(map(tuple, co))
        polys.extend([[base + i for i in p.vertices] for p in o.data.polygons])
        base += len(co)
    tree = BVHTree.FromPolygons(verts, polys)
    pts = np.concatenate([world_coords(o)[open_edge_vertices(o.data)] for o in model]) if model else np.empty((0, 3))
    if not len(pts):
        return report("junction.step", "SKIP", "the model terrain has no open border to follow")
    n = int(a.get("samples", 400))
    pts = pts[np.linspace(0, len(pts) - 1, min(n, len(pts))).astype(int)]
    max_gap = a.get("max_gap", 0.05)
    dz, far, worst = [], 0, None
    for p in pts:
        loc = tree.find_nearest(Vector(p))[0]
        if loc is None:
            dz.append(float("nan"))
            continue
        gap = ((loc.x - p[0]) ** 2 + (loc.y - p[1]) ** 2) ** 0.5
        if gap > max_gap:
            far += 1
        dz.append(loc.z - p[2])
        if worst is None or abs(dz[-1]) > abs(worst[0]):
            worst = (round(dz[-1], 3), [round(float(x), 2) for x in p])
    st = C["step_stats"](dz)
    ms = a.get("max_step", 0.05)
    verdict("junction.step", st["max"] is not None and st["max"] <= ms,
            "height step along the seam: max %s m, 95%% of points within %s m (limit %.3f); worst at %s" % (st["max"], st["p95"], ms, worst[1] if worst else "-"), st)
    verdict("junction.gap", far + st["gaps"] <= a.get("max_gaps", 0),
            "%d of %d seam points are further than %.2f m from the surroundings" % (far + st["gaps"], st["samples"], max_gap))


# ---- environment: surroundings stay as approved outside the zone being edited ------------------
def g_environment(a):
    objs = match(a.get("pattern", ""))
    if not objs:
        return report("environment.unchanged", "SKIP", "no object matches '%s'" % a.get("pattern", ""))
    now = {}
    for o in objs:
        lo, hi = world_bbox([o])
        now[o.name] = {"key": C["geometry_key"](world_coords(o)) if len(o.data.vertices) <= 2000000 else "heavy:%d" % len(o.data.vertices),
                       "min": [round(float(x), 2) for x in lo[:2]], "max": [round(float(x), 2) for x in hi[:2]],
                       "materials": sorted(s.material.name for s in o.material_slots if s.material)}
    wb = a.get("write_baseline")
    if wb:
        os.makedirs(os.path.dirname(wb), exist_ok=True)
        with open(wb, "w", encoding="utf-8") as f:
            json.dump(now, f, indent=1, ensure_ascii=False)
        return report("environment.unchanged", "SKIP", "baseline of %d objects written to %s; nothing compared" % (len(now), wb))
    bp = a.get("baseline")
    if not bp or not os.path.exists(bp):
        return report("environment.unchanged", "SKIP", "no baseline file: run once with 'write_baseline' after the surroundings are approved")
    with open(bp, encoding="utf-8") as f:
        was = json.load(f)
    z = a.get("zone")

    def outside(e):
        return z is None or e["max"][0] < z["min"][0] or e["min"][0] > z["max"][0] or e["max"][1] < z["min"][1] or e["min"][1] > z["max"][1]
    changed = sorted(n for n, e in was.items() if outside(e) and n in now and (now[n]["key"] != e["key"] or now[n]["materials"] != e["materials"]))
    removed = sorted(n for n, e in was.items() if outside(e) and n not in now)
    added = sorted(n for n, e in now.items() if n not in was and outside(e))
    verdict("environment.unchanged", not (changed or removed or added),
            "outside the edit zone: %d changed %s, %d removed %s, %d added %s (of %d approved objects)" % (len(changed), changed[:3], len(removed), removed[:3], len(added), added[:3], len(was)),
            {"changed": changed[:100], "removed": removed[:100], "added": added[:100]})


# ---- materials -----------------------------------------------------------------------------------
def g_materials(a):
    objs = match(a.get("pattern", "*"))
    if not objs:
        return report("materials.etalon", "SKIP", "no object matches '%s'" % a.get("pattern", "*"))
    used = {s.material.name: s.material for o in objs for s in o.material_slots if s.material}
    et = a.get("etalon")
    if isinstance(et, str) and os.path.exists(et):
        with open(et, encoding="utf-8") as f:
            et = json.load(f)
        et = {k: (v["fp"] if isinstance(v, dict) else v) for k, v in (et.get("materials", et)).items()}
    if isinstance(et, dict):
        foreign = sorted(n for n in used if n not in et)
        drift = sorted(n for n in used if n in et and node_fingerprint(used[n]) != et[n])
        verdict("materials.etalon", not foreign and not drift, "%d materials in use; %d not in the approved library %s; %d differ from their approved version %s" % (len(used), len(foreign), foreign[:3], len(drift), drift[:3]), {"foreign": foreign, "drift": drift})
    else:
        report("materials.etalon", "SKIP", "no approved material list ('etalon') given or found")
    no_uv = [o.name for o in objs if len(o.data.polygons) and not o.data.uv_layers]
    verdict("materials.uv", not no_uv, "%d objects have no UV map %s" % (len(no_uv), no_uv[:4]), no_uv[:100])
    tile = a.get("tile")
    if not tile:
        return report("materials.tile_size", "SKIP", "no expected tile sizes ('tile') given")
    l3 = {n: [] for n in tile}
    lu = {n: [] for n in tile}
    for o in objs:
        me = o.data
        slots = [s.material.name if s.material else None for s in o.material_slots]
        if not me.uv_layers or not any(s in tile for s in slots) or len(me.loops) > 6000000:
            continue
        nl, npoly = len(me.loops), len(me.polygons)
        lv = np.empty(nl, dtype=np.int32); me.loops.foreach_get("vertex_index", lv)
        uv = np.empty(nl * 2, dtype=np.float64); me.uv_layers.active.data.foreach_get("uv", uv); uv = uv.reshape(-1, 2)
        ls = np.empty(npoly, dtype=np.int32); me.polygons.foreach_get("loop_start", ls)
        lt = np.empty(npoly, dtype=np.int32); me.polygons.foreach_get("loop_total", lt)
        mi = np.empty(npoly, dtype=np.int32); me.polygons.foreach_get("material_index", mi)
        nxt = np.arange(nl) + 1
        nxt[ls + lt - 1] = ls
        co = world_coords(o)
        d3 = np.linalg.norm(co[lv[nxt]] - co[lv], axis=1)
        du = np.linalg.norm(uv[nxt] - uv, axis=1)
        lm = np.repeat(mi, lt)
        for idx, name in enumerate(slots):
            if name in tile:
                sel = lm == idx
                l3[name].append(d3[sel]); lu[name].append(du[sel])
    rows, bad = {}, []
    for name, want in tile.items():
        size = C["tile_size"](np.concatenate(l3[name]), np.concatenate(lu[name])) if l3[name] else None
        rows[name] = size
        if size is None or abs(size - want["size"]) > want["size"] * want.get("tol", 0.1):
            bad.append("%s %s m (expected %s)" % (name, size, want["size"]))
    verdict("materials.tile_size", not bad, "%d of %d materials have the expected real-world texture size; wrong: %s" % (len(tile) - len(bad), len(tile), bad[:4] or "none"), rows)


# ---- cameras -------------------------------------------------------------------------------------
def g_cameras(a):
    from bpy_extras.object_utils import world_to_camera_view
    cams = [o for o in S.objects if o.type == "CAMERA"]
    req = a.get("required") or []
    lost = [r for r in req if not match(r, cams)]
    verdict("cameras.required", not lost, "%d cameras in the scene; %d required ones missing %s" % (len(cams), len(lost), lost[:4]))
    chosen = [c for r in req for c in match(r, cams)] or cams
    lens = a.get("lens")
    if lens:
        off = [(c.name, round(c.data.lens, 1)) for c in chosen if not (lens[0] <= c.data.lens <= lens[1])]
        verdict("cameras.lens", not off, "%d cameras outside the %s-%s mm range %s" % (len(off), lens[0], lens[1], off[:3]))
    tg = match(a.get("target", "")) if a.get("target") else []
    if tg and chosen:
        corners = [o.matrix_world @ Vector(c) for o in tg for c in o.bound_box]
        fr = {c.name: C["in_frame_fraction"]([tuple(world_to_camera_view(S, c, p)) for p in corners]) for c in chosen}
        need = a.get("min_in_frame", 0.9)
        low = sorted((v, k) for k, v in fr.items() if v < need)
        verdict("cameras.frame", not low, "%d of %d cameras show at least %d%% of the target; worst %s" % (len(fr) - len(low), len(fr), need * 100, low[:3] or "-"), fr)
        far = max((c.matrix_world.translation - p).length for c in chosen for p in corners)
        cut = [c.name for c in chosen if c.data.clip_end < max((c.matrix_world.translation - p).length for p in corners)]
        verdict("cameras.clip", not cut, "%d cameras would cut the target off (far clip shorter than %.0f m) %s" % (len(cut), far, cut[:3]))
    else:
        report("cameras.frame", "SKIP", "no 'target' objects or no cameras to judge")
    ob = a.get("orbit")
    if not ob:
        return report("cameras.orbit", "SKIP", "no 'orbit' given")
    pos = []
    if ob.get("animated"):
        cam = bpy.data.objects.get(ob["animated"])
        if cam is None:
            return report("cameras.orbit", "SKIP", "camera '%s' not found" % ob["animated"])
        keep = S.frame_current
        try:
            for f in range(ob.get("start", S.frame_start), ob.get("end", S.frame_end) + 1, ob.get("step", 1)):
                S.frame_set(f)
                pos.append(tuple(cam.matrix_world.translation))
        finally:
            S.frame_set(keep)
    else:
        pos = [tuple(c.matrix_world.translation) for c in sorted(match(ob.get("pattern", ""), cams), key=lambda c: c.name)]
    if len(pos) < 3:
        return report("cameras.orbit", "SKIP", "fewer than 3 orbit positions found")
    if tg:
        lo, hi = world_bbox(tg)
        centre = (lo + hi) / 2
    else:
        centre = np.array(pos).mean(axis=0)
    st = C["orbit_stats"](pos, centre)
    ok = ((ob.get("count") is None or st["count"] == ob["count"]) and st["step_error_deg"] <= ob.get("max_step_error_deg", 0.5)
          and st["radius_spread_pct"] <= ob.get("max_radius_spread_pct", 1.0) and st["height_spread"] <= ob.get("max_height_spread", 0.1))
    verdict("cameras.orbit", ok, "%d positions (expected %s), radius %.1f m varying %.2f%%, height varying %.2f m, angular step %.2f deg off by up to %.2f deg" %
            (st["count"], ob.get("count"), st["radius"], st["radius_spread_pct"], st["height_spread"], st["step_deg"], st["step_error_deg"]), st)


# ---- render setup --------------------------------------------------------------------------------
def g_render(a):
    r = S.render
    now = {"engine": r.engine, "size": "%dx%d" % (r.resolution_x, r.resolution_y), "percent": r.resolution_percentage,
           "fps": r.fps, "transparent": r.film_transparent, "format": r.image_settings.file_format,
           "view": S.view_settings.view_transform, "look": S.view_settings.look,
           "exposure": round(S.view_settings.exposure, 3), "gamma": round(S.view_settings.gamma, 3),
           "frames": [S.frame_start, S.frame_end, S.frame_step]}
    if r.engine == "CYCLES":
        now.update(samples=S.cycles.samples, denoise=S.cycles.use_denoising)
    exp = a.get("expected")
    if exp:
        diff = {k: (now.get(k), v) for k, v in exp.items() if now.get(k) != v}
        verdict("render.settings", not diff, "%d of %d settings as specified; different (found, expected): %s" % (len(exp) - len(diff), len(exp), diff or "none"), now)
    else:
        report("render.settings", "SKIP", "no 'expected' settings given")
    sun = a.get("sun")
    if not sun:
        return report("render.sun", "SKIP", "no 'sun' place and time given")
    lamps = [o for o in S.objects if o.type == "LIGHT" and o.data.type == "SUN" and not o.hide_render]
    if len(lamps) != 1:
        return verdict("render.sun", False, "%d sun lamps are enabled for rendering; exactly one physical sun is expected" % len(lamps))
    el, az = C["sun_position"](sun["lat"], sun["lon"], datetime.datetime.fromisoformat(sun["utc"]))
    le, la = C["sun_from_matrix"](lamps[0].matrix_world.to_3x3())
    la = (la + sun.get("north_offset_deg", 0.0)) % 360.0
    tol = sun.get("tol_deg", 2.0)
    de, da = abs(le - el), C["angle_diff"](la, az)
    verdict("render.sun", el > 0 and de <= tol and da <= tol,
            "sun lamp at elevation %.1f, azimuth %.1f; the real sun there and then: elevation %.1f, azimuth %.1f (off by %.1f and %.1f deg, tolerance %.1f)" % (le, la, el, az, de, da, tol),
            {"lamp": [le, la], "real": [el, az]})


GROUPS = {"export": g_export, "junction": g_junction, "environment": g_environment, "materials": g_materials, "cameras": g_cameras, "render": g_render}
for _name, _fn in GROUPS.items():
    if _name not in A:
        continue
    try:
        _fn(A[_name] or {})
    except Exception as _e:  # a check that broke has not passed
        report(_name + ".error", "SKIP", "the check stopped with %s: %s" % (type(_e).__name__, str(_e)[:160]))
_c = {s: sum(1 for r in RES.values() if r["status"] == s) for s in ("OK", "FAIL", "SKIP")}
if A.get("out"):
    os.makedirs(os.path.dirname(A["out"]), exist_ok=True)
    with open(A["out"], "w", encoding="utf-8") as _f:
        json.dump(RES, _f, indent=1, ensure_ascii=False)
P("RESULT passed %d  failed %d  skipped %d   details: %s" % (_c["OK"], _c["FAIL"], _c["SKIP"], A.get("out") or "-"))
VIZ_DIGEST = "\n".join(_OUT)
VIZ_RESULTS = {k: v["status"] for k, v in RES.items()}
