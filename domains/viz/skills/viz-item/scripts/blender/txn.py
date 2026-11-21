"""txn - one change of a scene as a transaction. The project file is never edited in place.

Run in a SEPARATE background Blender on the current checkpoint, never in the open session:

    blender --background <checkpoint.blend> --python txn.py -- <args.json>

args.json = {"tools": "<viz_dir>/tools/blender", "op": "<viz_dir>/tools/project/<script>.py", "op_args": {...},
             "declares": {"objects": ["ENV_road*"], "zones": ["3_4", "3_5"], "added": 0, "removed": 0},
             "save_as": "<copies>/<name>.<n+1>.blend", "report": "<viz_dir>/work/<ITEM>/txn.json",
             "tile": 50.0, "id_property": ""}

It indexes the scene, runs the operation, indexes again and compares. The new checkpoint is written
ONLY when everything that changed was declared beforehand. Otherwise nothing is saved: the previous
checkpoint is the rollback, and the report says what strayed. An operation that changes nothing,
raises an error or leaves an incomplete index does not pass either.
Exit code: 0 committed, 1 refused."""
import bpy, json, os, sys, time, traceback

args_path = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else None
T = dict(globals().get("VIZ_TXN") or json.load(open(args_path, encoding="utf-8")))
SRC = T.get("sources") or {}
read = lambda name: SRC.get(name) or open(os.path.join(T["tools"], name), encoding="utf-8").read()
C = {}
exec(compile(read("vizcore.py"), "vizcore.py", "exec"), C)


def index():
    g = {"VIZ_ARGS": {"core_source": read("vizcore.py"), "tile": T.get("tile", 50.0), "id_property": T.get("id_property", ""), "max_seconds": T.get("index_seconds", 300)}}
    exec(compile(read("scene_index.py"), "scene_index.py", "exec"), g)
    return g["VIZ_INDEX"]


def norm_sha(text):
    import hashlib
    return hashlib.sha256(text.encode("utf-8").replace(b"\r\n", b"\n")).hexdigest()


t0 = time.time()
before = index()
error = None
# The operation's text may come as "op_source" only from the self-test, which drives this script in-process;
# from an args file it is always a file, and its hash goes into the report for the journal to hold against the registry.
op_src = (T.get("op_source") if globals().get("VIZ_TXN") else None) or open(T["op"], encoding="utf-8").read()
op_sha = norm_sha(op_src)
try:
    exec(compile(op_src, os.path.basename(T.get("op", "op.py")), "exec"), {"VIZ_ARGS": dict(T.get("op_args") or {}), "__name__": "viz_op"})
    bpy.context.view_layer.update()
except Exception as e:  # a failed operation commits nothing
    error = "%s: %s" % (type(e).__name__, str(e)[:300])
    traceback.print_exc()
after = index()
diff = C["index_diff"](before["objects"], after["objects"])
problems = []
if error:
    problems.append("the operation stopped with " + error)
if not (before["complete"] and after["complete"]):
    problems.append("the scene index is incomplete: the change cannot be verified")
problems += C["contract_violations"](diff, T.get("declares") or {})
committed = not problems
if committed and T.get("save_as"):
    if os.path.exists(T["save_as"]):
        problems.append("the next checkpoint already exists: %s" % T["save_as"])
        committed = False
    else:
        os.makedirs(os.path.dirname(T["save_as"]), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=T["save_as"], copy=True)
report = {"committed": committed, "problems": problems, "added": diff["added"][:200], "removed": diff["removed"][:200],
          "changed": dict(list(diff["changed"].items())[:200]), "zones": diff["zones"], "seconds": round(time.time() - t0, 1),
          "from": bpy.data.filepath, "to": T.get("save_as") if committed else None, "op": os.path.basename(T.get("op", "(self-test)")), "op_sha": op_sha}
if T.get("report"):
    os.makedirs(os.path.dirname(T["report"]), exist_ok=True)
    with open(T["report"], "w", encoding="utf-8") as f:
        body = json.loads(json.dumps({"txn.contract": {"status": "OK" if committed else "FAIL", "text": "; ".join(problems) or "as declared", "zones": diff["zones"] or None}, "report": report}, ensure_ascii=False))
        body["_receipt"] = {"tool": "txn.py", "tool_sha": norm_sha(read("txn.py")), "results_sha": norm_sha(json.dumps(body, sort_keys=True, ensure_ascii=False)),
                            "inputs": {"op": op_sha, "blend": bpy.data.filepath}, "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
        json.dump(body, f, indent=1, ensure_ascii=False)
print("TXN %s  added %d  removed %d  changed %d  zones %s  %.1f s" % ("COMMITTED" if committed else "REFUSED - nothing saved", len(diff["added"]), len(diff["removed"]), len(diff["changed"]), diff["zones"][:8], report["seconds"]))
for p in problems[:8]:
    print("  - " + p)
VIZ_TXN_REPORT = report
if not committed and not globals().get("VIZ_TXN"):
    sys.exit(1)
