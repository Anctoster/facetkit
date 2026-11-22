"""Tests of the viz-flow tools that need no Blender: the journal flow, the brief checker, the arithmetic
core and the image tools.  Run: python3 -m unittest discover -s tests -v   (image tests need Pillow)"""
import datetime, json, math, os, subprocess, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "..", "skills", "viz-item", "scripts")
sys.path.insert(0, os.path.join(SCRIPTS, "blender"))
sys.path.insert(0, SCRIPTS)
import vizcore
import vizflow
import receipt


def stamped(results, tool="img_digest.py"):
    """A results file as a shipped tool would have written it: with that tool's receipt."""
    f = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
    json.dump(receipt.stamp(results, os.path.join(SCRIPTS, tool), []), f)
    f.close()
    return f.name

BRIEF = """# Brief {item}
route: {route}

## Goal
Frames of the orbit for the website viewer.

## Reference
reference_orbit.jpg

## Scope
72 frames from the orbit camera.

## Fixed
Materials, sun, render settings, surroundings.

## Acceptance
{criteria}

## Views
ORB_00, ORB_18, ORB_36, ORB_54

## Decisions
Agents choose the batch size. Ask before changing any setting.

## Budget
40 runs, 60 minutes, preview first.
"""
GOOD = "1. All 72 frames exist, none black or repeated [check: images]\n2. Brick matches reference_orbit.jpg in colour [look: both long facades against the reference]\n3. Framing is approved [user: framing of frame 0]"


class Flow(unittest.TestCase):
    def setUp(self):
        self.root = os.path.join(tempfile.mkdtemp(), "v")
        self.v("init")

    def v(self, *args, ok=None):
        r = subprocess.run([sys.executable, os.path.join(SCRIPTS, "vizflow.py"), "--root", self.root, *args], capture_output=True, text=True)
        if ok is not None:
            self.assertEqual(r.returncode == 0, ok, r.stdout + r.stderr)
        return r.stdout

    def brief(self, item, route, criteria=GOOD):
        with open(os.path.join(self.root, "work", item, "brief.md"), "w", encoding="utf-8") as f:
            f.write(BRIEF.format(item=item, route=route, criteria=criteria))

    def step(self, name, status="DONE", tokens=1000):
        self.v("start", name, ok=True)
        self.v("end", name, "--status", status, "--tokens", str(tokens), ok=True)

    def test_brief_is_refused_while_vague_and_work_waits_for_approval(self):
        self.v("open", "R-1", "--route", "render", ok=True)
        self.step("order")
        self.assertIn("BRIEF NOT USABLE", self.v("next"))
        self.brief("R-1", "render", "1. The orbit looks nice [look: frames]\n2. Frames exist")
        out = self.v("brief", "check", ok=False)
        self.assertIn("says 'nice'", out)
        self.assertIn("criterion 2 needs exactly one tag", out)
        self.brief("R-1", "render", "1. Frames exist [check: no.such.check]")
        self.assertIn("no check named", self.v("brief", "check", ok=False))
        self.brief("R-1", "render")
        self.v("brief", "check", ok=True)
        self.assertIn("ASK THE USER: approve the brief", self.v("next"))
        self.v("start", "preview", ok=False)
        self.v("brief", "approve", "--by", "auto", ok=False)
        self.v("brief", "approve", "--by", "requester", ok=True)
        self.assertIn("AGENT scene-operator  step=preview", self.v("next"))

    def test_preview_gate_pass_needs_reproduced_evidence_and_remarks_have_causes(self):
        self.v("open", "R-2", "--route", "render", ok=True)
        self.step("order")
        self.brief("R-2", "render")
        self.v("brief", "approve", "--by", "requester", ok=True)
        self.step("preview")
        self.assertIn("ASK THE USER: approve the preview contact sheet", self.v("next"))
        self.v("start", "render", ok=False)
        self.v("answer", "--no", "camera too low", ok=True)
        nxt = self.v("next")
        self.assertIn("step=preview  mode=rework", nxt)
        self.assertIn("camera too low", nxt)
        self.step("preview")
        self.v("answer", ok=True)
        self.step("render", tokens=5000)
        self.assertIn("must be reproduced in this run: images, invariants", self.v("next"))
        self.v("start", "proof", ok=True)
        self.assertIn("an OK is taken only from the file a tool wrote", self.v("evidence", "images", "--status", "OK", ok=False))
        self.v("evidence", "images", "--status", "FAIL", ok=False)  # a finding recorded by hand says what was seen
        self.v("evidence", "--from", stamped({"images": {"status": "OK"}}), ok=True)
        self.v("end", "proof", "--status", "DONE", "--tokens", "3000", ok=True)
        self.assertIn("invariants (not run)", self.v("verdict", "PASS", ok=False))
        self.v("verdict", "REWORK", "--fix", "nobody:x", ok=False)
        self.v("verdict", "REWORK", "--fix", "scene-operator:frames-missing", ok=True)
        self.assertIn("step=preview  mode=rework", self.v("next"))  # every operator step of the route is the owner's
        self.step("preview"); self.v("answer", ok=True); self.step("render")
        self.v("start", "proof", ok=True)
        same = os.path.join(self.root, "same.json")
        with open(same, "w") as f:
            json.dump({"render": {"size": "1920x1080"}}, f)
        inv = os.path.join(self.root, "inv.json")
        self.v("diff", same, same, "--out", inv, ok=True)  # the comparison itself writes the evidence for `invariants`
        self.v("evidence", "--from", inv, ok=True)
        self.v("end", "proof", "--status", "DONE", ok=True)
        self.assertIn("images (not run)", self.v("verdict", "PASS", ok=False), "evidence from the earlier proof run does not carry over")
        self.v("start", "proof", "--force", "re-run the proof", ok=True)
        results = os.path.join(self.root, "r.json")
        with open(results, "w") as f:
            json.dump({"images": {"status": "OK"}, "invariants": {"status": "OK"}, "extra": {"status": "FAIL"}}, f)
        self.assertIn("carries no receipt", self.v("evidence", "--from", results, ok=False))
        forged = dict(receipt.stamp({"images": {"status": "OK"}}, os.path.join(SCRIPTS, "img_digest.py"), []))
        forged["_receipt"] = dict(forged["_receipt"], tool_sha="0" * 64)
        with open(results, "w") as f:
            json.dump(forged, f)
        self.assertIn("its code is not the tool shipped with this plugin", self.v("evidence", "--from", results, ok=False))
        edited = dict(receipt.stamp({"images": {"status": "FAIL"}}, os.path.join(SCRIPTS, "img_digest.py"), []))
        edited["images"] = {"status": "OK"}  # the tool said FAIL; somebody turned it into OK afterwards
        with open(results, "w") as f:
            json.dump(edited, f)
        self.assertIn("the file was changed after the tool wrote it", self.v("evidence", "--from", results, ok=False))
        self.v("evidence", "--from", stamped({"images": {"status": "OK"}, "invariants": {"status": "OK"}, "extra": {"status": "FAIL"}}), ok=True)
        self.v("end", "proof", "--status", "DONE", ok=True)
        self.v("verdict", "PASS", ok=True)
        self.v("remark", "R-2", "too dark", "--cause", "taste", ok=False)  # not closed yet
        self.assertIn("closed R-2", self.v("close", ok=True))
        self.v("remark", "R-2", "frame 12 shows a floating tree", "--cause", "agent", ok=True)
        self.v("remark", "R-2", "nobody asked for evening light", "--cause", "brief", ok=True)
        q = self.v("quality", ok=True)
        self.assertIn("closed 1", q)
        self.assertIn("the user then found a defect in 1", q)
        self.assertIn("remarks caused by a missing criterion 1", q)
        self.assertIn("preview rounds before approval 1", q)
        self.assertIn("forced steps 1", q)
        self.assertIn("not enough data", q)
        self.assertIn("journal intact", self.v("verify", ok=True))

    def test_a_changed_brief_must_be_approved_again_and_is_counted(self):
        self.v("open", "P-1", "--route", "pack", ok=True)
        self.step("order")
        self.brief("P-1", "pack", "1. All images within the weight budget [check: images]")
        self.assertIn("RECORD THE BRIEF", self.v("next"))
        self.v("brief", "approve", "--by", "auto", ok=True)
        self.brief("P-1", "pack", "1. All images within the weight budget [check: images]\n2. Names follow the site's scheme [look: file list]")
        self.v("start", "pack", ok=False)
        self.assertIn("CHANGED after an earlier approval", self.v("brief", "approve", "--by", "auto", ok=True))

    def test_plan_orders_the_stages_and_the_builder_stands_in_until_a_script_is_registered(self):
        out = self.v("plan", "new-project", "--prefix", "N1", ok=True)
        self.assertIn("NEXT: vizflow.py open N1-01", out)
        self.v("open", "N1-02", ok=False)
        self.v("open", "N1-01", ok=True)
        self.step("order")
        self.brief("N1-01", "export", "1. Scale is 1:1 [check: export.scale]")
        self.v("brief", "approve", "--by", "requester", ok=True)
        self.assertIn("AGENT scene-builder  step=work  mode=export  model=sonnet (no registered script", self.v("next"))
        p = os.path.join(self.root, "project.json")
        with open(p) as f:
            d = json.load(f)
        d["scripts"]["export"] = "tools/project/export.py"
        with open(p, "w") as f:
            json.dump(d, f)
        self.assertIn("AGENT scene-builder", self.v("next"), "a path written into project.json is not a registration")
        script = os.path.join(self.root, "export.py")
        with open(script, "w") as f:
            f.write("import bpy\n")
        self.v("script", "register", "export", "--file", script, ok=False)  # nobody answers for it
        self.assertIn("registered export.py for mode 'export'", self.v("script", "register", "export", "--file", script, "--by", "requester", ok=True))
        self.assertIn("AGENT scene-operator  step=work  mode=export  model=haiku", self.v("next"))
        # a transaction that ran a text other than the registered one is not evidence in an operator's item
        import hashlib
        sha = lambda t: hashlib.sha256(t.encode()).hexdigest()
        self.step("work"); self.step("map")
        self.v("start", "proof", ok=True)
        txn = lambda op: stamped({"txn.contract": {"status": "OK"}, "report": {"committed": True, "op": "export.py", "op_sha": sha(op)}}, os.path.join("blender", "txn.py"))
        self.assertIn("not registered, or was changed after it was registered (export.py)", self.v("evidence", "--from", txn("import bpy\nimport os\n"), ok=False))
        self.v("evidence", "--from", txn("import bpy\n"), ok=True)
        self.v("end", "proof", "--status", "BLOCKED", ok=True)
        self.v("plan", "model-change", "--prefix", "N1", ok=False)

    def test_two_failures_move_one_model_up_and_a_success_moves_back(self):
        self.v("open", "F-1", "--route", "audit", ok=True)
        self.step("order")
        self.brief("F-1", "audit", "1. The scene digest exists [look: digest lines]")
        self.v("brief", "approve", "--by", "auto", ok=True)
        self.step("map", "BLOCKED"); self.step("map", "BLOCKED")
        self.assertIn("model=sonnet (escalated", self.v("next"))
        for _ in range(2):
            self.v("start", "map"); self.v("tick", "digest", "--fail")
            self.v("end", "map", "--status", "BLOCKED")
        self.v("start", "map", ok=True)
        r = subprocess.run([sys.executable, os.path.join(SCRIPTS, "vizflow.py"), "--root", self.root, "tick", "digest", "--fail"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 3, "three identical failures stop the step")

    def test_an_edited_or_torn_journal_is_refused(self):
        self.v("open", "J-1", "--route", "audit", ok=True)
        path = os.path.join(self.root, "journal.jsonl")
        with open(path, "a") as f:
            f.write('{"n": 2, "type": "no')
        self.assertIn("JOURNAL BROKEN", self.v("verify", ok=False))
        self.assertIn("JOURNAL BROKEN", self.v("note", "x", ok=False))
        lock = path + ".lock"
        open(lock, "w").close()
        os.utime(lock, (0, 0))  # a lock left by a session that died long ago is taken over
        with open(path) as f:
            lines = f.readlines()
        with open(path, "w") as f:
            f.writelines(lines[:-1])
        self.v("note", "after a crash", ok=True)
        self.assertFalse(os.path.exists(lock))


class Brief(unittest.TestCase):
    def test_russian_vague_words_and_too_many_criteria(self):
        text = BRIEF.format(item="X", route="fix", criteria="1. Фасады выглядят красиво [look: фасады]")
        self.assertTrue(any("красив" in p for p in vizflow.check_brief(text)[0]))
        many = "\n".join("%d. Step under 5 cm [check: junction.step <= 0.05]" % i for i in range(1, 11))
        self.assertTrue(any("more than 9" in p for p in vizflow.check_brief(BRIEF.format(item="X", route="fix", criteria=many))[0]))
        ok = "1. Кирпич совпадает с ref A по цвету [look: длинные фасады]\n2. Ступень не больше 5 см [check: junction.step <= 0.05]"
        problems, checks, n = vizflow.check_brief(BRIEF.format(item="X", route="fix", criteria=ok), vizflow.KNOWN_CHECKS)
        self.assertEqual((problems, checks, n), ([], ["junction.step"], 2))


class Core(unittest.TestCase):
    def test_sun_stands_where_astronomy_says(self):
        el, az = vizcore.sun_position(50, 0, datetime.datetime(2026, 6, 21, 12, 2))
        self.assertAlmostEqual(el, 90 - 50 + 23.44, delta=0.3)
        self.assertAlmostEqual(az, 180, delta=1.0)
        self.assertAlmostEqual(vizcore.sun_position(50, 0, datetime.datetime(2026, 12, 21, 11, 58))[0], 90 - 50 - 23.44, delta=0.3)
        self.assertLess(vizcore.sun_position(50, 0, datetime.datetime(2026, 6, 21, 0, 0))[0], 0)
        self.assertLess(vizcore.sun_position(50, 0, datetime.datetime(2026, 6, 21, 6, 0))[1], 90)
        s = math.sin(math.radians(45))
        self.assertEqual([round(x) for x in vizcore.sun_from_matrix([[1, 0, 0], [0, 1, -s], [0, 0, s]])], [45, 180])
        self.assertEqual(vizcore.angle_diff(350, 10), 20)

    def test_ring_seam_tile_and_frame_measures(self):
        ring = [(100 * math.cos(math.radians(a)), 100 * math.sin(math.radians(a)), 40) for a in range(0, 360, 5)]
        st = vizcore.orbit_stats(ring, (0, 0, 0))
        self.assertEqual((st["count"], st["step_error_deg"], st["radius_spread_pct"], st["height_spread"]), (72, 0.0, 0.0, 0.0))
        ring[10] = (130, 30, 45)
        bad = vizcore.orbit_stats(ring, (0, 0, 0))
        self.assertGreater(bad["step_error_deg"], 5); self.assertGreater(bad["radius_spread_pct"], 5); self.assertEqual(bad["height_spread"], 5.0)
        st = vizcore.step_stats([0.01, -0.02, float("nan"), 0.3])
        self.assertEqual((st["gaps"], st["max"]), (1, 0.3))
        self.assertIsNone(vizcore.step_stats([float("nan")])["max"])
        self.assertEqual(vizcore.tile_size([1, 2, 3], [0.5, 1, 1.5]), 2.0)
        self.assertIsNone(vizcore.tile_size([1], [0]))
        self.assertEqual(vizcore.in_frame_fraction([[.5, .5, 10], [1.2, .5, 10], [.5, .5, -1], [0, 1, 1]]), 0.5)
        self.assertEqual(vizcore.geometry_key([[0, 0, 0], [1, 2, 3]]), vizcore.geometry_key([[1, 2, 3], [0, 0, 0]]))
        self.assertNotEqual(vizcore.geometry_key([[0, 0, 0], [1, 2, 3]]), vizcore.geometry_key([[0, 0, 0], [1, 2, 3.01]]))
        self.assertIsNone(vizcore.compare(None, "<=", 1))


class LargeScenes(unittest.TestCase):
    BEFORE = {"road": {"geometry": "g1", "transform": "t1", "materials": ["asphalt"], "zones": ["0_0"]},
              "tree": {"geometry": "g2", "transform": "t", "materials": [], "zones": ["1_0"]},
              "far": {"geometry": "g9", "transform": "t", "materials": [], "zones": ["5_5"]}}

    def test_zones_follow_the_ground_plan(self):
        self.assertEqual(vizcore.zone_of(-0.1, 49.9, 50), "-1_0")
        self.assertEqual(vizcore.zones_of_box([40, 40, 0], [110, 60, 5], 50), ["0_0", "0_1", "1_0", "1_1", "2_0", "2_1"])

    def test_a_transaction_commits_only_what_it_declared(self):
        after = {"road": dict(self.BEFORE["road"], transform="t2", zones=["0_0", "0_1"]), "bench": {"geometry": "g3", "transform": "t", "materials": [], "zones": ["1_0"]}, "far": self.BEFORE["far"]}
        d = vizcore.index_diff(self.BEFORE, after)
        self.assertEqual((d["added"], d["removed"], d["changed"], d["zones"]), (["bench"], ["tree"], {"road": ["transform"]}, ["0_0", "0_1", "1_0"]))
        self.assertEqual(vizcore.contract_violations(d, {"objects": ["road", "bench", "tree"], "zones": ["0_0", "0_1", "1_0"], "added": 1, "removed": 1}), [])
        self.assertEqual(vizcore.contract_violations(d, {"objects": ["road", "bench"]}), ["removed tree outside the declared objects"])
        self.assertIn("touched zones outside the declared ones: 0_1, 1_0", vizcore.contract_violations(d, {"objects": ["*"], "zones": ["0_0"]}))
        self.assertIn("added 1 objects, declared 0", vizcore.contract_violations(d, {"objects": ["*"], "added": 0}))
        self.assertEqual(vizcore.contract_violations(vizcore.index_diff(self.BEFORE, self.BEFORE), {"objects": ["*"]}), ["nothing changed: the operation had no effect"])
        swapped = dict(self.BEFORE, far=dict(self.BEFORE["far"], materials=["other"]))
        self.assertEqual(vizcore.index_diff(self.BEFORE, swapped)["changed"], {"far": ["materials"]}, "a material swap far away is a change too")

    def test_only_the_checks_of_touched_zones_decay(self):
        ev = {"junction.step": {"zones": ["0_0"]}, "terrain_holes": {"zones": ["9_9"]}, "render.sun": {"zones": None}}
        self.assertEqual(vizcore.decayed_zone_checks(ev, ["0_0", "1_0"]), ["junction.step", "render.sun"])
        self.assertEqual(vizcore.decayed_zone_checks(ev, []), [])

    def test_inside_out_solids_and_clashing_boxes(self):
        tet = [[(0, 0, 0), (0, 1, 0), (1, 0, 0)], [(0, 0, 0), (1, 0, 0), (0, 0, 1)], [(0, 0, 0), (0, 0, 1), (0, 1, 0)], [(1, 0, 0), (0, 1, 0), (0, 0, 1)]]
        self.assertGreater(vizcore.signed_volume(tet), 0)
        self.assertLess(vizcore.signed_volume([t[::-1] for t in tet]), 0)
        self.assertEqual(vizcore.boxes_overlap([[0, 0, 0], [10, 10, 0]], [[2, 2, 2], [12, 12, 2]], [[1, 1, 1], [20, 20, 20]], [[3, 3, 3], [21, 21, 21]]), [(0, 0)])
        self.assertEqual(vizcore.boxes_overlap([[0, 0, 0]], [[2, 2, 2]], [[1.98, 0, 0]], [[4, 2, 2]], margin=0.05), [], "touching within the margin is not a clash")


try:
    from PIL import Image, ImageDraw
except ImportError:
    Image = None


@unittest.skipIf(Image is None, "Pillow is not installed: the image tools are not tested here")
class Images(unittest.TestCase):
    def frames(self, n=24):
        d = tempfile.mkdtemp()
        for i in range(n):
            im = Image.new("RGB", (640, 360), (120, 160, 200))
            x, y = 320 + 200 * math.cos(2 * math.pi * i / n), 180 + 80 * math.sin(2 * math.pi * i / n)
            ImageDraw.Draw(im).rectangle([x - 50, y - 50, x + 50, y + 50], fill=(150, 40, 30))
            im.save(os.path.join(d, "orbit_%04d.png" % i))
        return d

    def tool(self, name, *args):
        return subprocess.run([sys.executable, os.path.join(SCRIPTS, name), *args], capture_output=True, text=True)

    def test_a_whole_orbit_passes_and_each_kind_of_damage_is_named(self):
        d = self.frames()
        self.assertEqual(self.tool("img_digest.py", d, "--count", "24", "--size", "640x360", "--loop").returncode, 0)
        Image.new("RGB", (640, 360), (0, 0, 0)).save(os.path.join(d, "orbit_0010.png"))
        os.remove(os.path.join(d, "orbit_0017.png"))
        Image.open(os.path.join(d, "orbit_0003.png")).save(os.path.join(d, "orbit_0004.png"))
        r = self.tool("img_digest.py", d, "--count", "24", "--size", "640x360", "--loop")
        self.assertEqual(r.returncode, 1)
        for word in ("count 23", "near-black", "missing numbers", "identical files", "jumps at"):
            self.assertIn(word, r.stdout)

    def test_packing_never_upscales_or_overwrites_and_reports_the_budget(self):
        d, out = self.frames(4), tempfile.mkdtemp()
        r = self.tool("web_pack.py", d, out, "--widths", "1280,640,320", "--max-kb", "400")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("written 8  not upscaled 4", r.stdout)
        self.assertEqual(self.tool("web_pack.py", d, out).returncode, 1)
        self.assertEqual(self.tool("web_pack.py", d, d).returncode, 1)
        self.assertEqual(self.tool("web_pack.py", d, tempfile.mkdtemp(), "--widths", "640", "--max-kb", "0.01").returncode, 1)
        self.assertEqual(self.tool("contact_sheet.py", d, os.path.join(out, "sheet.jpg"), "--pick", "4").returncode, 0)


class Efficiency(unittest.TestCase):
    """Is the agent team worth it on this kind of task - from the journal, plus two records only the architect can give."""
    SCRIPT = "vizflow.py"
    ROUTE = "materials"

    def setUp(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("flow_under_test", os.path.join(SCRIPTS, self.SCRIPT))
        self.m = importlib.util.module_from_spec(spec)
        sys.path.insert(0, SCRIPTS)
        spec.loader.exec_module(self.m)
        self.root = os.path.join(tempfile.mkdtemp(), "j")
        self.f("init")
        self.j = self.m.Journal(self.root)

    def f(self, *a):
        return subprocess.run([sys.executable, os.path.join(SCRIPTS, self.SCRIPT), "--root", self.root, *a], capture_output=True, text=True)

    def item(self, it, rework=False, minutes=10, model="sonnet", hand=None, spent=None, remark=None, fail=None):
        """A finished item written straight into the journal, with timestamps an agent run would leave."""
        if hand is not None:
            self.assertEqual(self.f("hand", it, "--hours", str(hand), "--by", "arch").returncode, 0)
        route = self.m.DEFAULT_ROUTES["routes"][self.ROUTE]
        self.j.add("open", item=it, route=self.ROUTE, title="")
        clock = [0]

        def ts():
            clock[0] += 1
            return "2026-11-02T%02d:%02d:00" % divmod(clock[0] * minutes, 60)
        steps = [s for s in route["steps"]]
        worker = next(s["agent"] for s in steps if s["id"] not in ("order", "proof"))
        rounds = [True, False] if rework else [False]
        for again in rounds:
            for s in steps:
                self.j.add("start", item=it, step=s["id"], agent=s["agent"], model=model, ts=ts())
                if s["id"] == "proof" and fail:
                    self.j.add("evidence", item=it, check=fail, status="FAIL")
                self.j.add("end", item=it, step=s["id"], status="DONE", tokens=1000, agent=s["agent"], model=model, ts=ts())
            self.j.add("verdict", item=it, verdict="REWORK" if again else "PASS", fix=["%s:other" % worker] if again else None)
        self.j.add("close", item=it)
        if spent is not None:
            self.assertEqual(self.f("spent", it, "--minutes", str(spent), "--on", "review").returncode, 0)
        if remark:
            self.j.add("remark", item=it, text="x", cause=remark)
        else:
            self.j.add("accept", item=it, by="arch")

    def test_nothing_is_concluded_from_unfinished_work(self):
        self.assertIn("No closed item yet", self.f("efficiency").stdout)

    def test_savings_come_from_the_estimate_given_before_the_work(self):
        for i in range(5):
            self.item("A%d" % i, hand=4, spent=60, rework=(i == 0))
        r = self.f("efficiency").stdout
        self.assertIn("worth it: saves 3.0 h per item and is right the first time in 80%", r)
        self.assertIn("right the first time", r)
        self.assertIn("80% (4/5, 80%:", r)
        self.assertRegex(r, r"same work by hand\s+4\.0 h")
        self.assertNotIn("! ", r.split("Agents")[0])

    def test_an_estimate_given_after_the_agents_started_is_not_used(self):
        self.item("L1", spent=30)
        out = self.f("hand", "L1", "--hours", "8", "--by", "arch")
        self.assertIn("LATE", out.stdout)
        r = self.f("efficiency").stdout
        self.assertIn("1 estimates given after the work started", r)
        self.assertIn("too few items to judge", r)
        self.assertEqual(self.f("hand", "L1", "--hours", "2", "--by", "arch").returncode, 1, "the first estimate stands")

    def test_missing_records_are_named_not_guessed(self):
        self.item("M1")
        r = self.f("efficiency").stdout
        self.assertIn("the architect's time was not recorded", r)
        self.assertIn("no estimate of the hand work", r)
        self.assertRegex(r, r"time saved per item\s+unknown")

    def test_when_the_architect_spends_more_than_by_hand_it_says_so(self):
        for i in range(5):
            self.item("B%d" % i, hand=1, spent=90)
        self.assertIn("not worth it yet", self.f("efficiency").stdout)

    def test_a_cheaper_model_is_compared_only_with_enough_items_and_separated_intervals(self):
        for i in range(6):
            self.item("H%d" % i, model="haiku", rework=True)
        for i in range(6):
            self.item("S%d" % i, model="sonnet")
        rep = json.loads(self.f("efficiency", "--json").stdout)
        cmp_ = rep["routes"][self.ROUTE]["models"][0]
        self.assertEqual(cmp_["better"], "sonnet")
        r = self.f("efficiency", "--lang", "ru").stdout
        self.assertIn("sonnet здесь лучше, чем haiku", r)
        self.assertIn("поднять на модель выше", r)

    def test_checks_that_caught_a_defect_and_the_remarks_are_counted(self):
        self.item("C1", fail="invariants", remark="brief")
        self.item("C2", remark="taste")
        sm = json.loads(self.f("efficiency", "--json").stdout)["routes"][self.ROUTE]
        self.assertEqual(sm["caught"], {"invariants": 1})
        self.assertEqual((sm["remarks"]["brief"], sm["remarks"]["taste"], sm["accepted"]["k"]), (1, 1, 0))
        self.assertEqual(sm["agent_min"], 10 * (len(self.m.DEFAULT_ROUTES["routes"][self.ROUTE]["steps"]) - 0))

    def test_cost_needs_a_price_for_every_model_used(self):
        self.item("P1")
        sm = json.loads(self.f("efficiency", "--json").stdout)["routes"][self.ROUTE]
        self.assertIsNone(sm["cost"])
        pj = os.path.join(self.root, "project.json")
        with open(pj, encoding="utf-8") as fh:
            d = json.load(fh)
        d["prices"] = {"sonnet": 3.0}
        with open(pj, "w", encoding="utf-8") as fh:
            json.dump(d, fh)
        sm = json.loads(self.f("efficiency", "--json").stdout)["routes"][self.ROUTE]
        self.assertAlmostEqual(sm["cost"], len(self.m.DEFAULT_ROUTES["routes"][self.ROUTE]["steps"]) * 1000 / 1e6 * 3.0)

    def test_a_page_for_the_office(self):
        for i in range(5):
            self.item("W%d" % i, hand=3, spent=40)
        out = os.path.join(self.root, "eff.html")
        self.f("efficiency", "--lang", "pl", "--html", out)
        with open(out, encoding="utf-8") as fh:
            page = fh.read()
        self.assertIn("opłaca się", page)
        self.assertIn("prefers-color-scheme:dark", page)
        self.assertEqual(self.f("verify").returncode, 0, "the records sit in the same hash chain")


class AfterAChange(unittest.TestCase):
    def tool(self, name, *args):
        return subprocess.run([sys.executable, os.path.join(SCRIPTS, name), *args], capture_output=True, text=True)

    def dump(self, obj):
        f = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
        json.dump(obj, f)
        f.close()
        return f.name

    def index(self):
        rec = lambda i, mats, mods, zone, geo="g": {"id": i, "geometry": geo, "transform": "t", "materials": mats, "modifiers": mods, "collection": "Building", "parent": None, "zones": [zone]}
        return {"complete": True, "objects": {"BLD_A": rec("A1", ["Brick", "Glass"], ["BEVEL"], "0_0"), "BLD_B": rec("B1", ["Brick"], [], "1_0")}}

    def test_what_was_set_up_by_hand_must_survive_a_new_model(self):
        before = self.index()
        self.assertIn("OK   swap.kept: 2 objects carried over", self.tool("swap_check.py", self.dump(before), self.dump(before)).stdout)
        after = self.index()
        a = after["objects"].pop("BLD_A")  # the importer renamed the object, dropped a slot, a modifier and copied a material
        a.update(materials=["Brick.001", None], modifiers=[], geometry="g2")
        after["objects"]["BLD_A.001"] = a
        after["objects"]["BLD_N"] = {"id": "N1", "geometry": "g", "transform": "t", "materials": [], "modifiers": [], "zones": ["2_0"]}
        out = os.path.join(tempfile.mkdtemp(), "swap.json")
        r = self.tool("swap_check.py", self.dump(before), self.dump(after), "--out", out)
        self.assertEqual(r.returncode, 1)
        for line in ("slot 1 was 'Brick', is now 'Brick.001' - a numbered copy made by the import", "slot 2 lost its material 'Glass'", "lost modifiers BEVEL",
                     "1 new objects arrived with no material: BLD_N", "added 1  removed 0  reshaped 1", "zones touched 2: 0_0, 2_0"):
            self.assertIn(line, r.stdout)
        self.assertEqual(self.tool("swap_check.py", self.dump(before), self.dump(after), "--pattern", "BLD_A*", "--allow", "BLD_A*").returncode, 0, "what the brief allows to change is not a loss")
        # an allowed change of materials alone still touches its zone: the material checks there must run again
        paint = self.index()
        paint["objects"]["BLD_B"]["materials"] = ["Brick_dark"]
        out_p = os.path.join(tempfile.mkdtemp(), "p.json")
        self.tool("swap_check.py", self.dump(self.index()), self.dump(paint), "--allow", "BLD_B", "--out", out_p)
        with open(out_p, encoding="utf-8") as f:
            self.assertEqual(json.load(f)["touched"], ["1_0"])
        # an object that changed and carries no zones could be anywhere: every zone of the scene is touched
        nowhere = self.index()
        del nowhere["objects"]["BLD_B"]["zones"]
        moved = json.loads(json.dumps(nowhere))
        moved["objects"]["BLD_B"]["transform"] = "t2"
        self.assertIn("zones touched 1: 0_0  (every zone: 1 changed objects carry no zones, e.g. BLD_B)", self.tool("swap_check.py", self.dump(nowhere), self.dump(moved)).stdout)
        # S6: when most of the old model is not found again, the check cannot conclude - it never says OK
        big = {"complete": True, "objects": {"BLD_%02d" % i: {"id": "X%d" % i, "geometry": "g", "transform": "t", "materials": ["Brick"], "modifiers": [], "zones": ["0_0"]} for i in range(20)}}
        renamed = json.loads(json.dumps(big))
        for i in range(3):  # the import gave three objects new identifiers: they look removed and added, losses on them are invisible
            renamed["objects"]["BLD_%02d" % i]["id"] = "NEW%d" % i
        r = self.tool("swap_check.py", self.dump(big), self.dump(renamed))
        self.assertEqual(r.returncode, 2, r.stdout)
        self.assertIn("SKIP swap.kept: only 85% of the old model's objects (17 of 20 outside --allow) were found again; at least 95% are needed", r.stdout)
        self.assertEqual(self.tool("swap_check.py", self.dump(big), self.dump(renamed), "--allow", "BLD_00,BLD_01,BLD_02").returncode, 0, "removals the brief names do not count against the share")
        after["complete"] = False
        self.assertIn("SKIP swap.kept", self.tool("swap_check.py", self.dump(before), self.dump(after)).stdout)
        for o in after["objects"].values():
            o["id"] = None
        after["complete"] = True
        self.assertIn("SKIP swap.kept: no object of the old model was found", self.tool("swap_check.py", self.dump(before), self.dump(after), "--pattern", "BLD_N").stdout)
        # the same file tells the journal which proofs the swap sends back
        root = os.path.join(tempfile.mkdtemp(), "v")
        v = lambda *args: subprocess.run([sys.executable, os.path.join(SCRIPTS, "vizflow.py"), "--root", root, *args], capture_output=True, text=True).stdout
        v("init")
        v("open", "P-1", "--route", "pack")
        v("start", "order"); v("end", "order", "--status", "DONE")
        with open(os.path.join(root, "work", "P-1", "brief.md"), "w", encoding="utf-8") as f:
            f.write(BRIEF.format(item="P-1", route="pack", criteria="1. Seam is clean in the zones of building B [check: junction.step <= 0.05]\n2. Images within budget [check: images]"))
        v("brief", "approve", "--by", "auto")
        v("start", "pack"); v("end", "pack", "--status", "DONE")
        v("start", "proof")
        v("evidence", "--from", stamped({"junction.step": {"status": "OK", "zones": ["1_0"]}, "images": {"status": "OK"}}))
        v("end", "proof", "--status", "DONE"); v("verdict", "PASS"); v("close")
        back = v("stale", "--from", out)
        self.assertIn("RE-RUN for P-1 (pack): images (covers everything)", back)
        self.assertIn("still standing 1", back, "the seam in zone 1_0 was not touched by a change in 0_0 and 2_0")
        v("cost", "add", "--kind", "render", "--minutes", "90", "--item", "P-1", "--note", "72 frames")
        self.assertIn("render 90 min", v("cost", "report"))

    @unittest.skipIf(Image is None, "Pillow is not installed: the image tools are not tested here")
    def test_pictures_are_compared_by_numbers_before_anybody_looks(self):
        import random
        from PIL import Image, ImageDraw
        d = tempfile.mkdtemp()
        ref = Image.new("RGB", (800, 600), (120, 150, 200))
        ImageDraw.Draw(ref).rectangle((300, 250, 500, 600), fill=(140, 60, 50))
        ref.save(os.path.join(d, "ref.png"))
        new = ref.copy()
        ImageDraw.Draw(new).rectangle((620, 420, 700, 600), fill=(30, 90, 30))  # something appeared in G5-G6
        new.save(os.path.join(d, "new.png"))
        run = lambda *args: self.tool("img_compare.py", os.path.join(d, "ref.png"), *args)
        r = run(os.path.join(d, "new.png"), "--expect", "none", "--max-noise", "2.5", "--crop", os.path.join(d, "crops"))
        self.assertIn("FAIL images.changed: changed where nothing was to change: G5, G6", r.stdout)
        self.assertIn("OK   images.noise", r.stdout)
        self.assertEqual(sorted(os.listdir(os.path.join(d, "crops"))), ["cell_G5.jpg", "cell_G6.jpg"])
        self.assertEqual(run(os.path.join(d, "new.png"), "--expect", "G5,G6").returncode, 2, "nothing failed; the noise limit was not given, and the exit code says so")
        good = run(os.path.join(d, "new.png"), "--expect", "G5,G6", "--max-noise", "2.5")
        self.assertEqual(good.returncode, 0)
        self.assertIn("it does not show that the rest is the same", good.stdout)
        self.assertIn("a full-contrast detail smaller than about 15x15 px of this 800x600 frame can stay below it", good.stdout)
        self.assertIn("a cell is 100x100 px", good.stdout)
        # the same view, a little brighter everywhere: no cell passes the threshold, the whole picture does
        Image.eval(new, lambda v: min(255, v + 4)).save(os.path.join(d, "bright.png"))  # +4 everywhere: under the threshold in every cell
        bright = run(os.path.join(d, "bright.png"), "--expect", "G5,G6")
        self.assertIn("the whole picture is brighter by 4.0 of 255 (limit 3.0)", bright.stdout)
        self.assertNotIn("changed where nothing was to change", bright.stdout, "no single cell shows it - only the whole picture does")
        self.assertEqual(bright.returncode, 1)
        self.assertIn("no visible change where one was expected: A1", run(os.path.join(d, "new.png"), "--expect", "A1,G5,G6").stdout)
        self.assertIn("OK   images.changed", run(os.path.join(d, "ref.png"), "--expect", "none").stdout)
        random.seed(1)
        grain = new.copy()
        px = grain.load()
        for x in range(800):
            for y in range(600):
                k = random.randint(-25, 25)
                px[x, y] = tuple(max(0, min(255, c + k)) for c in px[x, y])
        grain.save(os.path.join(d, "grain.png"))
        self.assertIn("FAIL images.noise", run(os.path.join(d, "grain.png"), "--max-noise", "2.5").stdout)
        shifted = Image.new("RGB", (800, 600), (60, 60, 60))
        shifted.paste(ref, (200, 80))
        shifted.save(os.path.join(d, "shifted.png"))
        self.assertIn("this is not a local change", run(os.path.join(d, "shifted.png"), "--expect", "G5").stdout)


class WindowsLock(unittest.TestCase):
    """On Windows a lock file that another session is deleting, or reading, cannot be created or removed for a moment:
    that is contention to wait out, not a failure of the command."""
    SCRIPT = "vizflow.py"

    def test_a_lock_being_deleted_or_read_by_another_session_is_waited_out(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("lock_under_test", os.path.join(SCRIPTS, self.SCRIPT))
        m = importlib.util.module_from_spec(spec)
        sys.path.insert(0, SCRIPTS)
        spec.loader.exec_module(m)
        root = os.path.join(tempfile.mkdtemp(), "j")
        real_open, real_remove = os.open, os.remove
        calls = {"open": 0, "remove": 0}

        def flaky_open(path, *a, **kw):
            if path.endswith(".lock") and calls["open"] < 2:
                calls["open"] += 1
                raise PermissionError(13, "delete pending")  # what Windows answers while another session removes its lock
            return real_open(path, *a, **kw)

        def flaky_remove(path):
            if path.endswith(".lock") and calls["remove"] < 3:
                calls["remove"] += 1
                raise PermissionError(32, "being used by another process")  # another session is reading whose lock it is
            return real_remove(path)
        m.os.open, m.os.remove = flaky_open, flaky_remove
        try:
            j = m.Journal(root)
            j.add("note", text="one")
            j.add("note", text="two")
        finally:
            m.os.open, m.os.remove = real_open, real_remove
        self.assertEqual([calls["open"], calls["remove"]], [2, 3])
        self.assertEqual([e["n"] for e in j.events()], [1, 2])
        self.assertFalse(os.path.exists(j.path + ".lock"))


if __name__ == "__main__":
    unittest.main()


class Criteria(unittest.TestCase):
    """FacetKit plan 2.8: a criteria block in Acceptance, held to the core's gate; [look] counts as [user]."""

    def setUp(self):
        import vizflow
        self.e = vizflow

    def brief(self, crit):
        return ("# Brief\nroute: x\n\n## Goal\nx\n\n## Reference\nnone\n\n## Scope\nx\n\n## Fixed\nx\n\n## Acceptance\n"
                "```criteria\n%s\n```\n\n## Views\nCAM_1\n\n## Decisions\nx\n\n## Budget\nx\n" % json.dumps(crit))

    def test_a_block_is_the_list_and_passes_the_gate(self):
        crit = [{"id": "A1", "text": "t", "check": "k.one <= 0.05", "by": "work"}, {"id": "A2", "text": "t", "check": "[look: brick against A]", "by": "work"}]
        problems, tools, n = self.e.check_brief(self.brief(crit), ("k.one",))
        self.assertEqual((problems, tools, n), ([], ["k.one"], 2))

    def test_no_check_four_judged_and_unknown_tools_are_refused(self):
        bad = [{"id": "A1", "text": "t", "by": "work"}]
        self.assertTrue(any("no check" in p for p in self.e.check_brief(self.brief(bad))[0]))
        judged = [{"id": "A%d" % i, "text": "t", "check": "[look: x]" if i % 2 else "[user]", "by": "work"} for i in range(1, 5)]
        self.assertTrue(any("4 criteria are judged by a person" in p for p in self.e.check_brief(self.brief(judged))[0]))
        self.assertTrue(any("no check named 'nope'" in p for p in self.e.check_brief(self.brief([{"id": "A1", "text": "t", "check": "nope", "by": "w"}]), ("k.one",))[0]))

    def test_lines_count_look_with_user(self):
        lines = "# B\n## Goal\nx\n## Reference\nx\n## Scope\nx\n## Fixed\nx\n## Acceptance\n" + "".join("%d. thing %d [look: wall %d]\n" % (i, i, i) for i in range(1, 5)) + "## Views\nCAM\n## Decisions\nx\n## Budget\nx\n"
        self.assertTrue(any("4 criteria are judged by a person" in p for p in self.e.check_brief(lines)[0]))

    def test_the_hash_is_the_cores(self):
        # sha256 over canonical JSON: sorted keys, no spaces - what lib/criteria.mjs criteriaHash computes
        self.assertEqual(self.e.criteria_hash([{"id": "A1", "by": "b"}]), self.e.criteria_hash([{"by": "b", "id": "A1"}]))
