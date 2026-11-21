#!/usr/bin/env python3
"""model_audit - is a model snapshot fit to work from? Checks a snapshot (from `ifc_read.py` or from
the readback procedure) on its own, with no description to compare it with: a consultant's model, an
existing project, or the office's own model before a stage is issued.

Usage: model_audit.py SNAPSHOT.json --project project.json [--program program.json] [--out results.json]

project.json keys used:  layers (the layer plan), bim.layers_extra (layers allowed besides the plan),
  bim.required_props {"wall": ["Pset_WallCommon.IsExternal"], "zone": ["number", "name", "area"]},
  bim.id_required ["wall", "door", "window", "zone"], tolerances.area_pct
program.json:  [{"number": "0.01", "name": "Salon", "area_m2": 32.0}]  - rooms and areas the task states.
Every result covers the whole model ("model"): adding an element anywhere creates a new obligation, so any
change of the model sends these results back. A change of drawings alone does not."""
import argparse, json, sys
import receipt
import safe

RES, LINES = {}, []
COMPLETE = {"*": ("story",), "wall": ("story", "pos", "length"), "door": ("story", "pos", "width"), "window": ("story", "pos", "width"), "zone": ("story", "number", "area")}
ROLE_TYPES = {"walls_ext": "wall", "walls_int": "wall", "slabs": "slab", "roofs": "roof", "columns": "column", "beams": "beam",
              "stairs": "stair", "doors": "door", "windows": "window", "zones": "zone"}


def report(cid, problems, ok_text, skip=None, scope=None):
    status = "SKIP" if skip else "FAIL" if problems else "OK"
    problems = [safe.clean(p, 240) for p in problems or []]
    text = safe.clean(skip, 400) if skip else (("%d problems: %s" % (len(problems), "; ".join(problems[:5]))) if problems else ok_text)
    RES[cid] = {"status": status, "text": text, "data": (problems or [])[:200], "scope": scope}
    LINES.append("%-4s %s: %s" % (status, cid, text))


def value(e, key):
    v = e.get(key) if key in e else (e.get("props") or {}).get(key)
    return None if v in ("", [], {}) else v


def label(e):
    return "%s %s" % (e.get("type"), e.get("id") or e.get("guid") or "?")


def audit(snap, project=None, program=None):
    project = project or {}
    bim, els = project.get("bim") or {}, snap.get("elements", [])
    scope = ["model"]  # a claim about every element: any change of the model can make it false, a new story included
    if not els:
        for c in ("bim.complete", "bim.ids", "bim.layers", "bim.props", "bim.areas"):
            report(c, [], "", "the snapshot holds no elements")
        return RES
    # completeness: what the snapshot does not hold cannot be checked, and must not look checked
    cs = snap.get("census") or {}
    need_f = dict(COMPLETE, **(bim.get("required_fields") or {}))
    p = ["%d records of the file could not be read" % cs["broken_records"]] if cs.get("broken_records") else []
    p += ["the file names no SI length unit: every length may be off by a factor"] if cs and not cs.get("units_known", True) else []
    for t in sorted({e.get("type") for e in els}):
        mine = [e for e in els if e.get("type") == t]
        for f in need_f.get(t, need_f["*"]):
            miss = [e for e in mine if e.get(f) in (None, "", [])]
            if miss:
                p.append("%d of %d %ss carry no %s (first: %s)" % (len(miss), len(mine), t, {"pos": "position"}.get(f, f), miss[0].get("id") or miss[0].get("guid")))
    p += ["%d texts in the model read like instructions to whoever reads them (first: '%s'): show the architect, follow none" % (len(cs["suspect_text"]), cs["suspect_text"][0]["text"])] if cs.get("suspect_text") else []
    gen = cs.get("generic_classes") or {}
    note = "; %d elements of classes read only generically (%s)" % (sum(gen.values()), ", ".join(sorted(gen))) if gen else ""
    report("bim.complete", p, "%d elements, each with the fields its kind needs%s" % (len(els), note), None if cs or p else "the snapshot carries no census: it was not written by ifc_read.py or a readback that counts what it skipped", scope=scope)
    # identity: without a stable key no later version can be compared with this one
    keys = [e.get("guid") or e.get("id") for e in els]
    p = ["%d elements have neither a GUID nor an id" % keys.count(None)] if None in keys else []
    seen = {}
    for k in keys:
        if k:
            seen[k] = seen.get(k, 0) + 1
    p += ["key used %d times: %s" % (n, k) for k, n in sorted(seen.items()) if n > 1][:20]
    need = set(bim.get("id_required") or [])
    p += ["%s has no id (guid %s)" % (e.get("type"), e.get("guid")) for e in els if e.get("type") in need and not e.get("id")][:20]
    report("bim.ids", p, "%d elements, each with a key of its own" % len(els), scope=scope)
    # layers: on the plan, and on a layer meant for that kind of element
    plan = {k: v for k, v in (project.get("layers") or {}).items() if v}
    if not plan:
        report("bim.layers", [], "", "project.json has no layer plan")
    else:
        allowed = set(plan.values()) | set(bim.get("layers_extra") or [])
        for_type = {}
        for role, name in plan.items():
            if role in ROLE_TYPES:
                for_type.setdefault(ROLE_TYPES[role], set()).add(name)
        p = []
        for e in els:
            lay, t = e.get("layer"), e.get("type")
            if not lay:
                p.append("%s is on no layer" % label(e))
            elif lay not in allowed:
                p.append("%s is on '%s', a layer outside the layer plan" % (label(e), lay))
            elif t in for_type and lay not in for_type[t]:
                p.append("%s is on '%s'; the plan puts a %s on %s" % (label(e), lay, t, " or ".join("'%s'" % x for x in sorted(for_type[t]))))
        report("bim.layers", p, "%d elements, each on a layer the plan gives its kind" % len(els), scope=scope)
    # properties: filled in, not merely present
    req = bim.get("required_props") or {}
    if not req:
        report("bim.props", [], "", "project.json -> bim.required_props lists nothing to require")
    else:
        p, n = [], 0
        for e in els:
            for key in req.get(e.get("type"), []):
                n += 1
                if value(e, key) is None:
                    p.append("%s: '%s' is empty" % (label(e), key))
        report("bim.props", p, "%d required values are filled in" % n, None if n else "no element of a kind that has required properties", scope=scope)
    # areas against what the task states
    zones = [e for e in els if e.get("type") == "zone"]
    if program is None:
        report("bim.areas", [], "", "no room program given (--program)")
    elif not zones:
        report("bim.areas", [], "", "the snapshot holds no zones")
    else:
        tol = (project.get("tolerances") or {}).get("area_pct", 2.0)
        by = {}
        for z in zones:
            for k in (z.get("number"), (z.get("name") or "").strip().lower()):
                if k:
                    by.setdefault(k, []).append(z)
        p, used, n = [], set(), 0
        for r in program:
            hit = by.get(r.get("number")) or by.get((r.get("name") or "").strip().lower()) or []
            if not hit:
                p.append("room %s '%s' of the task is not in the model" % (r.get("number", ""), r.get("name", "")))
                continue
            z = hit[0]
            used.add(id(z))
            want = r.get("area_m2")
            if want and z.get("area") is not None:
                n += 1
                if abs(z["area"] - want) / want * 100 > r.get("tol_pct", tol):
                    p.append("room %s '%s': %.2f m2 in the model, %.2f in the task (%+.1f%%)" % (z.get("number", ""), z.get("name", ""), z["area"], want, (z["area"] - want) / want * 100))
            elif want:
                p.append("room %s '%s' has no measured area" % (z.get("number", ""), z.get("name", "")))
            if r.get("min_area_m2") and (z.get("area") or 0) < r["min_area_m2"]:
                p.append("room %s '%s': %.2f m2, at least %.2f required" % (z.get("number", ""), z.get("name", ""), z.get("area") or 0, r["min_area_m2"]))
        extra = [z for z in zones if id(z) not in used]
        p += ["zone %s '%s' is in the model but not in the task" % (z.get("number", ""), z.get("name", "")) for z in extra][:20]
        report("bim.areas", p, "%d rooms of the task found, %d areas agree within %.1f%%" % (len(program), n, tol), scope=scope)
    return RES


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("snapshot"); ap.add_argument("--project"); ap.add_argument("--program"); ap.add_argument("--out")
    a = ap.parse_args()
    load = lambda p: json.load(open(p, encoding="utf-8")) if p else None
    audit(load(a.snapshot), load(a.project), load(a.program))
    print("\n".join(LINES))
    c = {s: sum(1 for r in RES.values() if r["status"] == s) for s in ("OK", "FAIL", "SKIP")}
    print("RESULT passed %d  failed %d  skipped %d   (clashes are not checked here: run Archicad's collision detection)" % (c["OK"], c["FAIL"], c["SKIP"]))
    if a.out:
        json.dump(receipt.stamp(RES, __file__), open(a.out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    sys.exit(1 if c["FAIL"] else 2 if c["SKIP"] else 0)
