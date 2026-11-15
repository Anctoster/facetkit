"""Tests of the viz-flow tools that need no Blender: the journal flow, the brief checker, the arithmetic
core and the image tools.  Run: python3 -m unittest discover -s tests -v   (image tests need Pillow)"""
import datetime, json, math, os, subprocess, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "..", "skills", "viz-item", "scripts")
sys.path.insert(0, os.path.join(SCRIPTS, "blender"))
sys.path.insert(0, SCRIPTS)
import vizcore
import vizflow

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
        self.v("evidence", "images", "--status", "OK", ok=True)
        self.v("end", "proof", "--status", "DONE", "--tokens", "3000", ok=True)
        self.assertIn("invariants (not run)", self.v("verdict", "PASS", ok=False))
        self.v("verdict", "REWORK", "--fix", "nobody:x", ok=False)
        self.v("verdict", "REWORK", "--fix", "scene-operator:frames-missing", ok=True)
        self.assertIn("step=preview  mode=rework", self.v("next"))  # every operator step of the route is the owner's
        self.step("preview"); self.v("answer", ok=True); self.step("render")
        self.v("start", "proof", ok=True)
        self.v("evidence", "invariants", "--status", "OK", ok=True)
        self.v("end", "proof", "--status", "DONE", ok=True)
        self.assertIn("images (not run)", self.v("verdict", "PASS", ok=False), "evidence from the earlier proof run does not carry over")
        self.v("start", "proof", "--force", "re-run the proof", ok=True)
        results = os.path.join(self.root, "r.json")
        with open(results, "w") as f:
            json.dump({"images": {"status": "OK"}, "invariants": {"status": "OK"}, "extra": {"status": "FAIL"}}, f)
        self.v("evidence", "--from", results, ok=True)
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
        self.assertIn("AGENT scene-operator  step=work  mode=export  model=haiku", self.v("next"))
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


if __name__ == "__main__":
    unittest.main()
