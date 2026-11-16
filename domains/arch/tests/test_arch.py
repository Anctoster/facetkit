"""Tests of the arch-flow tools. None of them needs Archicad.  Run: python3 -m unittest discover -s tests"""
import copy, json, os, subprocess, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "..", "skills", "arch-item", "scripts")
load = lambda name: json.load(open(os.path.join(SCRIPTS, name), encoding="utf-8"))


def tool(name, *args):
    return subprocess.run([sys.executable, os.path.join(SCRIPTS, name), *args], capture_output=True, text=True)


def dump(obj):
    f = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
    json.dump(obj, f)
    f.close()
    return f.name


class Spec(unittest.TestCase):
    def run_spec(self, change):
        spec = copy.deepcopy(load("spec.example.json"))
        change(spec)
        return tool("model_spec.py", dump(spec))

    def test_the_example_description_is_buildable(self):
        r = tool("model_spec.py", os.path.join(SCRIPTS, "spec.example.json"))
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("passed 10  failed 0", r.stdout)

    def test_each_kind_of_defect_is_named_by_its_own_check(self):
        cases = [
            (lambda s: s["walls"][0].pop("layer"), "FAIL spec.schema", "wall W1 lacks layer"),
            (lambda s: s["scale_proofs"].__setitem__(1, {"source": "rzut-parteru.png", "known_m": 6.0, "measured_px": 780}), "FAIL spec.scale", "disagree"),
            (lambda s: s.__setitem__("scale_proofs", []), "FAIL spec.scale", "no known dimension"),
            (lambda s: s["walls"][4].__setitem__("layer", "partitions"), "FAIL spec.layers", "unknown layer role 'partitions'"),
            (lambda s: s["layers"].__setitem__("zones", ""), "FAIL spec.layers", "has no Archicad layer name"),
            (lambda s: s["stories"].append({"id": "P1", "name": "Pietro", "elevation": 3.2, "height": 3.0}), "FAIL spec.stories", "ends at 3.00 but the next starts at 3.20"),
            (lambda s: s["walls"].append(dict(s["walls"][0], id="W9")), "FAIL spec.walls", "the same segment"),
            (lambda s: s["walls"][1].__setitem__("to", [10, 5.5]), "FAIL spec.loops", "without meeting another wall"),
            (lambda s: s["openings"][0].__setitem__("offset", 9.5), "FAIL spec.openings", "does not fit wall W1"),
            (lambda s: s["openings"].append(dict(s["openings"][0], id="D2", offset=2.5)), "FAIL spec.openings", "overlap in wall W1"),
            (lambda s: s["zones"][0].__setitem__("stated_area_m2", 40.0), "FAIL spec.zones", "the source states 40.00"),
            (lambda s: s["questions"][0].__setitem__("blocks", []), "FAIL spec.confidence", "wall W5 was read with confidence 0.70"),
            (lambda s: s["questions"][0].pop("answer"), "FAIL spec.questions", "1 questions wait for the architect"),
        ]
        for change, line, detail in cases:
            r = self.run_spec(change)
            self.assertEqual(r.returncode, 1, detail)
            self.assertIn(line, r.stdout, detail)
            self.assertIn(detail, r.stdout)

    def test_a_partition_meeting_a_wall_in_its_middle_is_not_a_loose_end(self):
        self.assertIn("OK   spec.loops", tool("model_spec.py", os.path.join(SCRIPTS, "spec.example.json")).stdout)


def readback_of(spec):
    import math
    out = []
    for w in spec["walls"]:
        out.append({"id": w["id"], "type": "wall", "layer": spec["layers"][w["layer"]], "story": w["story"], "length": math.hypot(w["to"][0] - w["from"][0], w["to"][1] - w["from"][1]), "thickness": w["thickness"]})
    for o in spec["openings"]:
        out.append({"id": o["id"], "type": o["type"], "layer": spec["layers"][o["layer"]], "width": o["width"]})
    out += [{"id": s["id"], "type": "slab", "layer": spec["layers"][s["layer"]], "story": s["story"]} for s in spec["slabs"]]
    out += [{"id": z["id"], "type": "zone", "layer": spec["layers"][z["layer"]], "story": z["story"], "area": z["stated_area_m2"]} for z in spec["zones"]]
    return {"elements": out}


class Model(unittest.TestCase):
    def cmp(self, change=lambda b: None, *extra):
        spec = load("spec.example.json")
        back = readback_of(spec)
        change(back)
        return tool("spec_compare.py", os.path.join(SCRIPTS, "spec.example.json"), dump(back), *extra)

    def test_a_faithful_model_passes_and_every_departure_is_named(self):
        r = self.cmp()
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("OK   model.counts: 10 elements", r.stdout)
        by_id = lambda b, i: next(e for e in b["elements"] if e["id"] == i)
        cases = [
            (lambda b: b["elements"].pop(0), "missing in the model: wall W1"),
            (lambda b: b["elements"].append({"id": "W77", "type": "wall", "layer": "A-SC-WEWN"}), "in the model but not in the description: wall W77"),
            (lambda b: b["elements"].append({"type": "wall", "layer": "Warstwa ARCHICAD"}), "carry no id"),
            (lambda b: by_id(b, "W5").__setitem__("layer", "A-SC-ZEWN"), "wall W5 is on layer 'A-SC-ZEWN', the description says 'A-SC-WEWN'"),
            (lambda b: by_id(b, "W2").__setitem__("length", 6.25), "wall W2 is 6.250 m long, described as 6.000"),
            (lambda b: by_id(b, "D1").__setitem__("width", 0.9), "door D1 is 0.900 m wide, described as 1.000"),
            (lambda b: by_id(b, "Z1").__setitem__("area", 28.0), "zone Z1 'Salon' measures 28.00 m2"),
        ]
        for change, detail in cases:
            r = self.cmp(change)
            self.assertEqual(r.returncode, 1, detail)
            self.assertIn(detail, r.stdout)

    def test_the_room_program_of_the_brief_is_checked(self):
        ok = self.cmp(lambda b: None, "--program", dump([{"name": "Salon", "min_area_m2": 30}, {"name": "Pokoj", "count": 1}]))
        self.assertIn("OK   model.program", ok.stdout)
        bad = self.cmp(lambda b: None, "--program", dump([{"name": "Salon", "min_area_m2": 35}, {"name": "Lazienka"}]))
        self.assertIn("room 'Salon': 32.10 m2, at least 35.00 required", bad.stdout)
        self.assertIn("room 'Lazienka': 0 in the model, 1 required", bad.stdout)


PROJECT = {"sheets": {"naming": r"^(PZT|PAB|PW)-A-\d{2}$", "dwg": True}, "titleblock": {"required": ["project_name", "designer", "licence_no", "stage", "sheet_no", "scale", "date"]}}


class Sheets(unittest.TestCase):
    def setUp(self):
        self.req = load("sheets.pb.json")
        self.out = tempfile.mkdtemp()
        tb = lambda s: {"project_name": "Budynek", "designer": "mgr inz. arch.", "licence_no": "00/00", "stage": "PB", "sheet_no": s["no"], "scale": s["scale"], "date": "2026-12-01"}
        self.lay = {"layouts": [{"no": s["no"], "title": s["title"], "format": s["format"], "drawings": [{"scale": s["scale"]}], "titleblock": tb(s)} for s in self.req["sheets"]]}
        try:
            from pypdf import PdfWriter
            sizes = {"A2": (420, 594), "A1": (594, 841)}
            for s in self.req["sheets"]:
                w = PdfWriter()
                w.add_blank_page(width=sizes[s["format"]][1] * 72 / 25.4, height=sizes[s["format"]][0] * 72 / 25.4)
                with open(os.path.join(self.out, s["no"] + ".pdf"), "wb") as f:
                    w.write(f)
        except ImportError:
            for s in self.req["sheets"]:
                open(os.path.join(self.out, s["no"] + ".pdf"), "wb").close()
        for s in self.req["sheets"]:
            open(os.path.join(self.out, s["no"] + ".dwg"), "wb").close()
        for d in self.req["documents"]:
            open(os.path.join(self.out, d["file"]), "wb").close()

    def run_check(self, *extra):
        return tool("sheets_check.py", dump(self.req), dump(self.lay), self.out, "--project", dump(PROJECT), *extra)

    def test_a_complete_set_passes(self):
        r = self.run_check()
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("OK   sheets.complete: 5 sheets and 4 documents", r.stdout)
        self.assertIn("OK   titleblock.fields", r.stdout)
        self.assertIn("SKIP sheets.trace", r.stdout)

    def test_what_a_set_usually_lacks_is_found(self):
        os.remove(os.path.join(self.out, "PAB-A-02.pdf"))
        os.remove(os.path.join(self.out, "PAB-A-03.dwg"))
        os.remove(os.path.join(self.out, "PAB-opis.pdf"))
        self.lay["layouts"][1]["drawings"][0]["scale"] = "1:50"
        self.lay["layouts"][0]["titleblock"]["licence_no"] = " "
        self.lay["layouts"][4]["titleblock"]["stage"] = "PW"
        self.lay["layouts"].append({"no": "szkic 7", "title": "Szkic", "format": "A3", "drawings": [], "titleblock": {}})
        r = self.run_check()
        self.assertEqual(r.returncode, 1)
        for detail in ("sheet PAB-A-02 has no PDF", "document PAB-opis", "layout szkic 7 is not in the list", "sheet number 'szkic 7' does not follow", "sheet PAB-A-01: required scale 1:100, placed drawings are at 1:50",
                       "sheet PAB-A-03 has no DWG", "sheet PZT-A-01: title block lacks licence_no", "says stage 'PW', the set is 'PB'"):
            self.assertIn(detail, r.stdout)

    def test_a_page_of_the_wrong_size_is_measured(self):
        try:
            from pypdf import PdfWriter
        except ImportError:
            self.skipTest("pypdf is not installed")
        w = PdfWriter()
        w.add_blank_page(width=420 * 72 / 25.4, height=297 * 72 / 25.4)
        with open(os.path.join(self.out, "PAB-A-01.pdf"), "wb") as f:
            w.write(f)
        self.assertIn("PAB-A-01.pdf is 297 x 420 mm, A2 is 420 x 594", self.run_check().stdout)

    def test_the_executive_set_must_trace_to_the_building_set(self):
        pb = dump(self.req)
        self.req = load("sheets.pw.json")
        self.lay = {"layouts": [{"no": s["no"], "title": s["title"], "format": s["format"], "drawings": [{"scale": s["scale"]}], "titleblock": {}, "based_on": b}
                                for s, b in zip(self.req["sheets"], ["PAB-A-01", "PAB-A-02", "PAB-A-03", "PAB-A-04", "PAB-A-01", None])]}
        r = tool("sheets_check.py", dump(self.req), dump(self.lay), self.out, "--previous", pb)
        self.assertIn("sheet PW-A-20 names no sheet of the earlier stage", r.stdout)
        self.assertIn("earlier-stage sheet PZT-A-01 is not carried into this stage", r.stdout)


class Schedule(unittest.TestCase):
    def test_dates_risk_level_and_measured_gains(self):
        r = tool("schedule.py", os.path.join(SCRIPTS, "schedule.example.json"), "--out", dump({}))
        self.assertIn("NOT calibrated", r.stdout)
        self.assertRegex(r.stdout, r"ready with 50% certainty by 2027-\d\d-\d\d, 80% by 2027-\d\d-\d\d")
        self.assertRegex(r.stdout, r"chance of missing the deadline \d+% -> (GREEN|YELLOW|RED)")
        self.assertRegex(r.stdout, r"gains \d+ working days: ")
        again = tool("schedule.py", os.path.join(SCRIPTS, "schedule.example.json"))
        self.assertEqual(r.stdout, again.stdout, "the same plan and seed give the same dates")

    def test_a_tight_deadline_fails_and_history_scales_the_hours(self):
        plan = load("schedule.example.json")
        plan["deadline"] = "2027-01-15"
        r = tool("schedule.py", dump(plan))
        self.assertEqual(r.returncode, 1)
        self.assertIn("-> RED", r.stdout)
        plan["history"] = [{"estimated_hours": 100, "actual_hours": a} for a in (130, 150, 170)]
        self.assertIn("hours scaled by 1.50, the median of 3 finished projects", tool("schedule.py", dump(plan)).stdout)

    def test_a_plan_that_cannot_be_computed_says_why(self):
        plan = load("schedule.example.json")
        plan["packages"][1]["hours"] = [50, 50, 50]
        plan["packages"][0]["after"] = ["pw"]
        plan["risks"][0]["hits"] = "nowhere"
        r = tool("schedule.py", dump(plan))
        self.assertEqual(r.returncode, 1)
        for detail in ("best and worst are equal", "wait for each other in a circle", "hits unknown package 'nowhere'", "SKIP schedule.result"):
            self.assertIn(detail, r.stdout)


class Variants(unittest.TestCase):
    def run_v(self, change=lambda d: None, *extra):
        d = copy.deepcopy(load("variants.example.json"))
        change(d)
        return tool("variants.py", dump(d), *extra)

    def test_indicators_come_from_geometry_and_the_tool_does_not_choose(self):
        r = self.run_v(lambda d: None, "--chosen", "C")
        self.assertEqual(r.returncode, 0, r.stdout)
        for line in ("OK   variants.limits: 3 of 3", "OK   variants.distinct", "OK   variants.compared: 3 variants scored on 5 weighted criteria", "OK   variants.chosen: variant C"):
            self.assertIn(line, r.stdout)
        self.assertRegex(r.stdout, r"A\s+0\.\d+\s+1800\s+37\.5")  # green 900 m2 of a 2400 m2 plot

    def test_what_makes_a_comparison_worthless_is_refused(self):
        cases = [
            (lambda d: d["variants"].pop(), "variants given, at least 3 are needed"),
            (lambda d: d["variants"][0].__setitem__("idea", " "), "variant A has no one-line idea"),
            (lambda d: d.__setitem__("weights", {}), "the architect has not said what matters"),
            (lambda d: d["limits"].__setitem__("max_noise", 1), "limit 'max_noise' is not known"),
            (lambda d: d["variants"][1].pop("green_m2"), "variant B lacks what 'green_pct' is computed from"),
            (lambda d: d["variants"][0]["buildings"][0]["outline"].__setitem__(1, [70, 24]), "building corners lie outside the plot"),
        ]
        for change, detail in cases:
            r = self.run_v(change)
            self.assertEqual(r.returncode, 1, detail)
            self.assertIn(detail, r.stdout)
            self.assertIn("SKIP variants.compared", r.stdout)

    def test_a_variant_over_a_limit_is_shown_and_marked_and_cannot_be_chosen(self):
        over = lambda d: d["variants"][2]["buildings"][0].__setitem__("height_m", 19.0)
        r = self.run_v(over, "--chosen", "C")
        self.assertIn("2 of 3 variants keep every limit; over a limit: C - height_m 19.0 (limit <= 16)", r.stdout)
        self.assertIn("[OVER A LIMIT]", r.stdout)
        self.assertIn("FAIL variants.chosen: the chosen variant C is over a limit", r.stdout)
        tight = self.run_v(lambda d: d["limits"].__setitem__("min_setback_m", 20))
        self.assertIn("FAIL variants.limits: 0 of 3", tight.stdout)
        self.assertIn("FAIL variants.chosen: the chosen variant 'Z' is not in the set", self.run_v(lambda d: None, "--chosen", "Z").stdout)

    def test_three_versions_of_one_idea_are_not_three_variants(self):
        def twin(d):
            d["variants"][1] = dict(copy.deepcopy(d["variants"][0]), id="B", idea="the same bar, 20 cm longer", usable_m2=1810)
        r = self.run_v(twin)
        self.assertIn("FAIL variants.distinct: A and B differ by less than 5% on every criterion", r.stdout)

    def test_a_variant_beaten_on_every_criterion_is_named(self):
        def weak(d):
            d["variants"].append(dict(copy.deepcopy(d["variants"][2]), id="D", idea="the L-block, smaller and dearer", usable_m2=1700, cost_index=1.2, green_m2=700, parking_places=30, flats=30))
        self.assertRegex(self.run_v(weak).stdout, r"D\s+0\.0 .*\[beaten on every criterion by [ABC]\]")

    def test_facades_and_layouts_have_their_own_indicators(self):
        d = {"aspect": "facade", "weights": {"south_glazing_share": 2, "glazing_ratio": 1}, "limits": {"max_glazing_ratio": 0.5},
             "variants": [{"id": i, "idea": "idea %s" % i, "facade": {"walls_m2": {"N": 300, "S": 300}, "glazing_m2": {"N": n, "S": s}}} for i, n, s in (("A", 60, 60), ("B", 30, 120), ("C", 100, 220))]}
        r = tool("variants.py", dump(d))
        self.assertIn("over a limit: C - glazing_ratio 0.533", r.stdout)
        lay = {"aspect": "layout", "weights": {"circulation_share": -1, "usable_m2": 1},
               "variants": [{"id": i, "idea": "idea %s" % i, "rooms": [{"name": "pokoj", "area_m2": a}, {"name": "hol", "kind": "circulation", "area_m2": c}]} for i, a, c in (("A", 40, 10), ("B", 44, 6), ("C", 30, 20))]}
        self.assertRegex(tool("variants.py", dump(lay)).stdout, r"B\s+0\.75\s+0\.12\s+50")


class Flow(unittest.TestCase):
    def test_the_engine_runs_the_architecture_routes(self):
        root = os.path.join(tempfile.mkdtemp(), "a")
        f = lambda *a: subprocess.run([sys.executable, os.path.join(SCRIPTS, "archflow.py"), "--root", root, *a], capture_output=True, text=True).stdout
        f("init")
        self.assertIn("NEXT: archflow.py open D1-01", f("plan", "documentation", "--prefix", "D1"))
        design = f("plan", "design", "--prefix", "E1")
        for line in ("E1-02    variants", "Variants of the layouts  (waits for E1-02)", "E1-08    sheets-pw"):
            self.assertIn(line, design)
        f("open", "D1-02")
        self.assertIn("AGENT arch-conductor  step=order", f("next"))
        f("start", "order"); f("end", "order", "--status", "DONE")
        with open(os.path.join(root, "work", "D1-02", "brief.md"), "w", encoding="utf-8") as b:
            b.write("# Brief\nroute: intake\n\n## Goal\nA checked description of the building.\n\n## Reference\nrzut-parteru.png\n\n## Scope\nGround floor.\n\n## Fixed\nThe source files.\n\n"
                    "## Acceptance\n1. Every raster is tied to a known dimension [check: spec.scale]\n2. No open question remains [check: spec.questions]\n\n## Views\nnone\n\n## Decisions\nAsk about every unclear dimension.\n\n## Budget\n20 runs.\n")
        self.assertIn("ASK THE USER: approve the brief", f("next"))
        f("brief", "approve", "--by", "architect")
        self.assertIn("AGENT source-reader  step=read  mode=read  model=sonnet", f("next"))
        f("start", "read"); f("end", "read", "--status", "DONE")
        self.assertIn("ASK THE USER: approve the list of open questions", f("next"))
        f("answer")
        self.assertIn("must be reproduced in this run: spec.schema, spec.scale", f("next"))


if __name__ == "__main__":
    unittest.main()
