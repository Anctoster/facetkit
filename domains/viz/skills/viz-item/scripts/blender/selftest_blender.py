"""selftest_blender - proves that the check scripts work with THIS version of Blender, on a tiny scene it
builds itself. It runs in a separate background Blender and never opens or saves a project file:

    blender --background --factory-startup --python selftest_blender.py

Each check is run on a scene where it must pass and on one where it must fail. The last line is
SELFTEST PASS n/n or SELFTEST FAIL with the list of checks that answered wrongly."""
import bpy, json, math, os, sys, tempfile, datetime
from mathutils import Vector

HERE = globals().get("VIZ_TOOLS") or (os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd())
SRC = globals().get("VIZ_SOURCES") or {n: open(os.path.join(HERE, n), encoding="utf-8").read() for n in ("vizcore.py", "stage_checks.py", "scene_checks.py", "scene_digest.py")}
CORE = {}
exec(compile(SRC["vizcore.py"], "vizcore.py", "exec"), CORE)

bpy.ops.wm.read_factory_settings(use_empty=True)
S = bpy.context.scene
TMP = tempfile.mkdtemp(prefix="vizselftest_")


def run(name, args):
    g = {"VIZ_ARGS": args, "__name__": "viz_check"}
    exec(compile(SRC[name], name, "exec"), g)
    return g.get("VIZ_RESULTS", {}), g.get("VIZ_DIGEST", "")


def mesh_obj(name, verts, faces):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    S.collection.objects.link(o)
    return o


def grid(name, x0, y0, x1, y1, n, z, hole=None):
    xs = [x0 + (x1 - x0) * i / n for i in range(n + 1)]
    ys = [y0 + (y1 - y0) * i / n for i in range(n + 1)]
    verts = [(x, y, z) for y in ys for x in xs]
    faces = []
    for j in range(n):
        for i in range(n):
            cx, cy = (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2
            if hole and hole[0] < cx < hole[2] and hole[1] < cy < hole[3]:
                continue
            a = j * (n + 1) + i
            faces.append((a, a + 1, a + n + 2, a + n + 1))
    return mesh_obj(name, verts, faces)


def box(name, cx, cy, sx, sy, sz, mat=None, vid=None):
    x0, x1, y0, y1 = cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2
    v = [(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0), (x0, y0, sz), (x1, y0, sz), (x1, y1, sz), (x0, y1, sz)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    o = mesh_obj(name, v, f)
    uv = o.data.uv_layers.new(name="UVMap")
    for poly in o.data.polygons:  # every face mapped so that one UV unit is 2 metres
        for li in poly.loop_indices:
            co = o.data.vertices[o.data.loops[li].vertex_index].co
            n = poly.normal
            pair = (co.x, co.y) if abs(n.z) > 0.5 else ((co.y, co.z) if abs(n.x) > 0.5 else (co.x, co.z))
            uv.data[li].uv = (pair[0] / 2.0, pair[1] / 2.0)
    if mat:
        o.data.materials.append(mat)
    if vid:
        o["viz_id"] = vid
    return o


brick = bpy.data.materials.new("Brick")
brick.use_nodes = True
site = grid("SITE_terrain", -10, -10, 10, 10, 10, 0.0)
env = grid("ENV_terrain", -30, -30, 30, 30, 30, 0.03, hole=(-10, -10, 10, 10))
a = box("BLD_A", 0, 0, 4, 4, 4, brick, "A1")
c = box("BLD_C", 5, 0, 4, 4, 4, brick, "C1")
box("REF_BOX", 20, 20, 10, 10, 3)
centre = Vector((2.5, 0.0, 2.0))
cams = []
for i in range(12):
    ang = math.radians(i * 30)
    cam = bpy.data.objects.new("ORB_%02d" % i, bpy.data.cameras.new("ORB_%02d" % i))
    cam.location = (centre.x + 50 * math.cos(ang), centre.y + 50 * math.sin(ang), 20)
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = (centre - Vector(cam.location)).to_track_quat("-Z", "Y")
    cam.data.lens = 35
    cam.data.clip_end = 500
    S.collection.objects.link(cam)
    cams.append(cam)
S.camera = cams[0]
WHEN = "2026-05-30T10:00:00"
el, az = CORE["sun_position"](50.0, 20.0, datetime.datetime.fromisoformat(WHEN))
sun = bpy.data.objects.new("SUN", bpy.data.lights.new("SUN", "SUN"))
sun.rotation_mode = "QUATERNION"
d = Vector((math.sin(math.radians(az)) * math.cos(math.radians(el)), math.cos(math.radians(az)) * math.cos(math.radians(el)), math.sin(math.radians(el))))
sun.rotation_quaternion = d.to_track_quat("Z", "Y")
S.collection.objects.link(sun)
S.unit_settings.system = "METRIC"
S.unit_settings.scale_length = 1.0
bpy.context.view_layer.update()

size_now = "%dx%d" % (S.render.resolution_x, S.render.resolution_y)
env_file = os.path.join(TMP, "env.json")
digest_res, digest_text = run("scene_digest.py", {"out": os.path.join(TMP, "scene.json"), "designed": "BLD_*"})
with open(os.path.join(TMP, "scene.json"), encoding="utf-8") as f:
    scene = json.load(f)
etalon = {"Brick": scene["materials"]["Brick"]["fp"]}


def stage_args(**over):
    args = {
        "core_source": SRC["vizcore.py"], "out": os.path.join(TMP, "stage.json"),
        "export": {"pattern": "BLD_*", "reference": {"object": "REF_BOX", "size": [10, 10, 3], "tol": 0.005},
                   "expected_bbox": {"min": [-2, -2, 0], "max": [7, 2, 4], "tol": 0.01}, "id_property": "viz_id",
                   "required_surfaces": ["Brick"], "expected_counts": {"BLD_*": 2}, "max_polys": 1000, "max_objects": 10},
        "junction": {"model_terrain": "SITE_*", "env_terrain": "ENV_*", "max_step": 0.05, "max_gap": 0.05, "samples": 200},
        "environment": {"pattern": "ENV_*", "baseline": env_file},
        "materials": {"pattern": "BLD_*", "etalon": dict(etalon), "tile": {"Brick": {"size": 2.0, "tol": 0.05}}},
        "cameras": {"required": ["ORB_00"], "target": "BLD_*", "min_in_frame": 0.9, "lens": [18, 85],
                    "orbit": {"pattern": "ORB_*", "count": 12, "max_step_error_deg": 0.5, "max_radius_spread_pct": 1.0, "max_height_spread": 0.1}},
        "render": {"expected": {"engine": S.render.engine, "size": size_now},
                   "sun": {"lat": 50.0, "lon": 20.0, "utc": WHEN, "tol_deg": 2.0}},
    }
    args.update(over)
    return args


wrong, total = [], 0


def expect(label, got, want):
    global total
    for cid, status in want.items():
        total += 1
        if got.get(cid) != status:
            wrong.append("%s %s: expected %s, got %s" % (label, cid, status, got.get(cid)))


expect("digest", {"objects": scene["objects"], "meshes": scene["types"].get("MESH"), "designed": len(scene["designed_materials"])}, {"objects": 18, "meshes": 5, "designed": 1})
run("stage_checks.py", {"core_source": SRC["vizcore.py"], "environment": {"pattern": "ENV_*", "write_baseline": env_file}})
good, good_text = run("stage_checks.py", stage_args())
expect("good", good, {k: "OK" for k in ("export.scale", "export.position", "export.ids", "export.surfaces", "export.counts", "export.duplicates", "export.budget",
                                         "junction.step", "junction.gap", "environment.unchanged", "materials.etalon", "materials.uv", "materials.tile_size",
                                         "cameras.required", "cameras.lens", "cameras.frame", "cameras.clip", "cameras.orbit", "render.settings", "render.sun")})
sc, sc_text = run("scene_checks.py", {"out": os.path.join(TMP, "checks.json"), "terrain": "ENV_*", "expected_holes": 1, "height_limit": 10.0, "height_pattern": "BLD_*", "designed": "BLD_*", "etalon_materials": ["Brick"]})
expect("scene good", sc, {"terrain_holes": "OK", "height_limit": "OK", "missing_textures": "OK", "etalon_materials": "OK", "negative_scale": "OK"})

# ---- now break one thing per check and see that each of them notices ---------------------------
env.location.z += 0.5                                   # a visible step at the seam, and changed surroundings
twin = box("BLD_B", 0, 0, 4, 4, 4, bpy.data.materials.new("Brick.001"))  # same place as BLD_A, no id, a numbered copy of a surface
cams[5].location.z += 8                                 # one orbit position out of the ring
cams[0].data.lens = 200                                 # too long a lens: the target no longer fits
sun.rotation_quaternion = (Vector((d.x, -d.y, d.z))).to_track_quat("Z", "Y")  # sun on the wrong side of the sky
brick.node_tree.nodes.new("ShaderNodeRGB")              # the approved material was touched
S.unit_settings.scale_length = 0.001
bpy.context.view_layer.update()
bad_args = stage_args()
bad_args["export"]["max_polys"] = 10
bad_args["materials"]["tile"] = {"Brick": {"size": 0.25, "tol": 0.05}}
bad_args["render"]["expected"]["size"] = "1x1"
bad_args["cameras"]["required"] = ["ORB_00", "CAM_missing"]
bad, bad_text = run("stage_checks.py", bad_args)
expect("bad", bad, {k: "FAIL" for k in ("export.scale", "export.position", "export.ids", "export.surfaces", "export.counts", "export.duplicates", "export.budget",
                                        "junction.step", "environment.unchanged", "materials.etalon", "materials.tile_size",
                                        "cameras.required", "cameras.lens", "cameras.frame", "cameras.orbit", "render.settings", "render.sun")})
zoned = stage_args()
zoned["environment"]["zone"] = {"min": [-100, -100], "max": [100, 100]}
expect("zone", run("stage_checks.py", {"core_source": SRC["vizcore.py"], "environment": zoned["environment"]})[0], {"environment.unchanged": "OK"})
sc2, _ = run("scene_checks.py", {"terrain": "ENV_*", "expected_holes": 0, "height_limit": 3.0, "height_pattern": "BLD_*", "designed": "BLD_*", "etalon_materials": ["Brick"]})
expect("scene bad", sc2, {"terrain_holes": "FAIL", "height_limit": "FAIL", "etalon_materials": "FAIL"})
expect("skip", run("stage_checks.py", {"core_source": SRC["vizcore.py"], "junction": {"model_terrain": "NOPE_*", "env_terrain": "ENV_*"}, "render": {}})[0],
       {"junction.step": "SKIP", "render.settings": "SKIP", "render.sun": "SKIP"})

line = "SELFTEST %s %d/%d  blender %s" % ("FAIL" if wrong else "PASS", total - len(wrong), total, bpy.app.version_string)
print("\n".join(wrong))
print(line)
result = {"line": line, "wrong": wrong, "good": good_text, "bad": bad_text, "scene": sc_text, "digest": digest_text}
if wrong and not globals().get("VIZ_SOURCES"):
    sys.exit(1)
