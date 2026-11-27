#!/usr/bin/env python3
"""spec_compare - is the Archicad model what the description says? Compares spec.json with a
readback taken from Archicad after the build.

snapshot.json (written by the readback step: the registered procedure through the Archicad API, or ifc_read.py):
  {"elements": [{"id": "<spec id stored on the element>", "type": "wall|door|window|slab|zone|...",
                 "layer": "<Archicad layer name>", "story": "P0", "length": 10.0, "thickness": 0.4,
                 "width": 0.9, "area": 23.4, "number": "0.01"}],
   "layers_present": ["..."]}

Usage: spec_compare.py SPEC.json READBACK.json [--project project.json] [--program program.json] [--out results.json]
program.json (optional): [{"name": "Salon", "min_area_m2": 20}, ...] - the brief's list of rooms."""
import argparse, json, math, sys
import receipt

RES, LINES = {}, []
SCOPE = None  # what a result covers; set to the whole model below


def report(cid, problems, ok_text, skip=None):
    status = "SKIP" if skip else "FAIL" if problems else "OK"
    text = skip or (("%d problems: %s" % (len(problems), "; ".join(map(str, problems[:5])))) if problems else ok_text)
    RES[cid] = {"status": status, "text": text, "data": (problems or [])[:200], "scope": SCOPE}
    LINES.append("%-4s %s: %s" % (status, cid, text))


def compare(spec, back, project=None, program=None):
    global SCOPE
    SCOPE = ["model"]  # the model against its whole description: any change of the model touches it
    tol = (project or {}).get("tolerances", {})
    tl, ta = tol.get("length_m", 0.01), tol.get("area_pct", 2.0)
    roles = spec.get("layers", {})
    want = {}
    for kind, typ in (("walls", "wall"), ("slabs", "slab"), ("zones", "zone"), ("columns", "column"), ("roofs", "roof"), ("stairs", "stair")):
        for e in spec.get(kind, []):
            want[e["id"]] = dict(e, type=typ)
    for o in spec.get("openings", []):
        want[o["id"]] = dict(o, type=o.get("type", "opening"))
    got = {e.get("id"): e for e in back.get("elements", []) if e.get("id")}
    anon = [e for e in back.get("elements", []) if not e.get("id")]
    p = ["missing in the model: %s %s" % (want[i]["type"], i) for i in sorted(set(want) - set(got))]
    p += ["in the model but not in the description: %s %s" % (got[i].get("type"), i) for i in sorted(set(got) - set(want))]
    p += ["%d elements in the model carry no id: they cannot be traced to the description" % len(anon)] if anon else []
    p += ["%s is a %s in the model, a %s in the description" % (i, got[i].get("type"), want[i]["type"]) for i in sorted(set(want) & set(got)) if got[i].get("type") != want[i]["type"]]
    report("model.counts", p, "%d elements, each one traced to the description" % len(want))
    p = ["%s %s is on layer '%s', the description says '%s'" % (want[i]["type"], i, got[i].get("layer"), roles.get(want[i].get("layer"))) for i in sorted(set(want) & set(got)) if got[i].get("layer") != roles.get(want[i].get("layer"))]
    allowed = set(roles.values())
    p += ["element on a layer outside the layer plan: '%s'" % e.get("layer") for e in anon if e.get("layer") not in allowed][:20]
    report("model.layers", p, "every element is on the layer its role maps to")
    p = []
    for i in sorted(set(want) & set(got)):
        w, g = want[i], got[i]
        if w["type"] == "wall":
            L = math.hypot(w["to"][0] - w["from"][0], w["to"][1] - w["from"][1])
            if g.get("length") is not None and abs(g["length"] - L) > tl:
                p.append("wall %s is %.3f m long, described as %.3f" % (i, g["length"], L))
            if g.get("thickness") is not None and abs(g["thickness"] - w["thickness"]) > 0.001:
                p.append("wall %s is %.3f m thick, described as %.3f" % (i, g["thickness"], w["thickness"]))
        elif w["type"] in ("door", "window") and g.get("width") is not None and abs(g["width"] - w["width"]) > tl:
            p.append("%s %s is %.3f m wide, described as %.3f" % (w["type"], i, g["width"], w["width"]))
        if w.get("story") and g.get("story") and g["story"] != w["story"]:
            p.append("%s %s is on story %s, described on %s" % (w["type"], i, g["story"], w["story"]))
    measured = sum(1 for i in set(want) & set(got) if got[i].get("length") is not None or got[i].get("width") is not None)
    report("model.dimensions", p, "%d measured elements agree within %.3f m" % (measured, tl), None if measured else "the readback holds no lengths or widths")
    p, n = [], 0
    for i in sorted(set(want) & set(got)):
        w, g = want[i], got[i]
        if w["type"] == "zone" and g.get("area") is not None:
            ref = w.get("stated_area_m2")
            if ref:
                n += 1
                if abs(g["area"] - ref) / ref * 100 > ta:
                    p.append("zone %s '%s' measures %.2f m2 in the model, the source states %.2f" % (i, w.get("name"), g["area"], ref))
    report("model.areas", p, "%d zone areas agree with the source within %.1f%%" % (n, ta), None if n else "no zone has both a stated area and a measured one")
    if program is None:
        report("model.program", [], "", "no room program given")
    else:
        rooms = {}
        for i in set(want) & set(got):
            if want[i]["type"] == "zone":
                rooms.setdefault(want[i].get("name", "").strip().lower(), []).append(got[i].get("area") or 0)
        p = []
        for r in program:
            have = rooms.get(r["name"].strip().lower(), [])
            if len(have) < r.get("count", 1):
                p.append("room '%s': %d in the model, %d required" % (r["name"], len(have), r.get("count", 1)))
            elif r.get("min_area_m2") and min(have) < r["min_area_m2"]:
                p.append("room '%s': %.2f m2, at least %.2f required" % (r["name"], min(have), r["min_area_m2"]))
        report("model.program", p, "all %d rooms of the program are present and large enough" % len(program))
    return RES


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("spec"); ap.add_argument("readback"); ap.add_argument("--project"); ap.add_argument("--program"); ap.add_argument("--out")
    a = ap.parse_args()
    load = lambda p: json.load(open(p, encoding="utf-8")) if p else None
    compare(load(a.spec), load(a.readback), load(a.project), load(a.program))
    print("\n".join(LINES))
    c = {s: sum(1 for r in RES.values() if r["status"] == s) for s in ("OK", "FAIL", "SKIP")}
    print("RESULT passed %d  failed %d  skipped %d" % (c["OK"], c["FAIL"], c["SKIP"]))
    if a.out:
        json.dump(receipt.stamp(RES, __file__), open(a.out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    sys.exit(1 if c["FAIL"] else 2 if c["SKIP"] else 0)
