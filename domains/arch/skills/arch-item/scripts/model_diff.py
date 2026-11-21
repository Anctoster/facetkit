#!/usr/bin/env python3
"""model_diff - what a change of the model really changed, element by element, and what follows from it.

A saved project file is new every time it is saved; that says nothing. Two snapshots of the model
(from `ifc_read.py` or the readback procedure) are compared by the elements' own keys - GUID first,
then id - so that moving one partition names that partition, its rooms, the sheets that show them
and the people who must look again, and leaves every other proof standing.

Usage: model_diff.py BEFORE.json AFTER.json [--links impact.json] [--sheets sheets.pb.json]
                     [--declared "W5,D*,zone:0.02"] [--out change.json] [--md change.md]

--links     the office's table of consequences (start from impact.example.json): which kind of change
            sends which discipline or schedule back to be checked. The tool applies it; it knows no trade itself.
--sheets    a stage list whose sheets say what they show:  {"no": "PAB-A-01", "shows": ["story:P0"]}.
            A sheet that does not say what it shows cannot be excluded and is listed as such.
--declared  what the brief's Scope allows to change (ids, patterns, or story:/zone: scopes).
            Anything else that changed fails `change.declared`.
change.json carries "touched": the scopes to give to  archflow.py stale --from change.json"""
import argparse, fnmatch, hashlib, json, sys
import receipt
import safe

RES, LINES = {}, []
FIELDS = ("type", "layer", "story", "name", "number", "length", "width", "height", "thickness", "area", "sill", "pos", "dir", "shape", "zones", "props")
# what must be present on BOTH sides for "nothing changed" to mean anything; a field absent from both is not "the same"
MUST = {"wall": ("pos", "length"), "door": ("pos", "width"), "window": ("pos", "width"), "zone": ("area",), "slab": ("pos",), "column": ("pos",),
        "beam": ("pos",), "stair": ("pos",), "roof": ("pos",), "fixture": ("pos",), "furniture": ("pos",), "other": ("pos",)}
TOL = {"length": 0.001, "width": 0.001, "height": 0.001, "thickness": 0.0005, "sill": 0.001, "area": 0.01}


def report(cid, problems, ok_text, skip=None, scope=None):
    status = "SKIP" if skip else "FAIL" if problems else "OK"
    problems = [safe.clean(p, 240) for p in problems or []]
    text = safe.clean(skip, 400) if skip else (("%d problems: %s" % (len(problems), "; ".join(problems[:5]))) if problems else ok_text)
    RES[cid] = {"status": status, "text": text, "data": (problems or [])[:200], "scope": scope}
    LINES.append("%-4s %s: %s" % (status, cid, text))


def keyed(snap):
    out, loose = {}, 0
    for e in snap.get("elements", []):
        k = e.get("guid") or e.get("id")
        if not k or k in out:
            loose += 1
        else:
            out[k] = e
    return out, loose


def same(f, x, y):
    if f in TOL and isinstance(x, (int, float)) and isinstance(y, (int, float)):
        return abs(x - y) <= TOL[f]
    if f == "pos" and x and y and len(x) == len(y):
        return all(abs(a - b) <= 0.001 for a, b in zip(x, y))
    if f == "dir" and isinstance(x, (int, float)) and isinstance(y, (int, float)):
        return abs((x - y + 180.0) % 360.0 - 180.0) <= 0.05
    return x == y


def name_of(e):
    return "%s %s" % (e.get("type", "?"), safe.clean(e.get("id") or e.get("number") or e.get("guid"), 60))


def scopes_of(e):
    return (["story:%s" % e["story"]] if e.get("story") else []) + ["zone:%s" % z for z in e.get("zones", [])] + \
           (["zone:%s" % e["number"]] if e.get("type") == "zone" and e.get("number") else [])


def diff(before, after):
    b, lb = keyed(before)
    a, la = keyed(after)
    rows = [{"key": k, "change": "added", "element": a[k], "fields": {}} for k in a if k not in b]
    rows += [{"key": k, "change": "removed", "element": b[k], "fields": {}} for k in b if k not in a]
    for k in b:
        if k in a:
            f = {}
            for fld in FIELDS:
                x, y = b[k].get(fld), a[k].get(fld)
                if fld == "props":
                    x, y = x or {}, y or {}
                    for pk in sorted(set(x) | set(y)):
                        if x.get(pk) != y.get(pk):
                            f["props." + pk] = [x.get(pk), y.get(pk)]
                elif not same(fld, x, y):
                    f[fld] = [x, y]
            if f:
                rows.append({"key": k, "change": "changed", "element": a[k], "was": b[k], "fields": f})
    blind = {}
    for k in b:
        if k in a:
            t = a[k].get("type")
            for fld in MUST.get(t, ()) + (("shape",) if SHAPES else ()):
                if b[k].get(fld) is None or a[k].get(fld) is None:
                    blind.setdefault("%s of a %s" % ("position" if fld == "pos" else fld, t), []).append(a[k].get("id") or k)
    return rows, len(b), len(a), lb + la, blind


SHAPES = False  # set when both snapshots say they fingerprinted shapes


def consequences(rows, links):
    """Apply the office's table: a rule fires for a row when the kind of change, the element type and
    (if the rule names fields) one of the changed fields match."""
    out = []
    for r in rows:
        e = r["element"]
        for rule in links or []:
            w = rule.get("when", {})
            if w.get("change") and r["change"] not in w["change"]:
                continue
            if w.get("type") and e.get("type") not in w["type"]:
                continue
            if w.get("layer") and not fnmatch.fnmatch(e.get("layer") or "", w["layer"]):
                continue
            if w.get("fields") and r["change"] == "changed" and not any(f.split(".")[0] in w["fields"] for f in r["fields"]):
                continue
            for c in rule.get("recheck", []):
                out.append((c.get("who", "?"), c.get("what", ""), r))
    return out


def run(before, after, links=None, sheets=None, declared=None):
    global SHAPES
    SHAPES = all((s.get("census") or {}).get("shape_computed") for s in (before, after))
    rows, nb, na, loose, blind = diff(before, after)
    p = ["%s was not compared for %d elements, it is missing from a snapshot (first: %s)" % (what, len(ids), ids[0]) for what, ids in sorted(blind.items())]
    for s, label in ((before, "before"), (after, "after")):
        cs = s.get("census") or {}
        p += ["the snapshot '%s' lost %d records it could not read" % (label, cs["broken_records"])] if cs.get("broken_records") else []
    if not SHAPES:
        p.append("shapes were not fingerprinted in both snapshots: a change of form with the same position and size cannot be seen")
    report("change.complete", p, "position%s and the sizes of every element were present on both sides" % (", shape" if SHAPES else ""))
    report("change.listed", ["%d elements have no key of their own or share one: they cannot be followed from one version to the next" % loose] if loose else [],
           "%d elements before, %d after: %d added, %d removed, %d changed" % (nb, na, *(sum(1 for r in rows if r["change"] == c) for c in ("added", "removed", "changed"))))
    touched, unplaced = set(), []
    for r in rows:
        here = scopes_of(r["element"]) + scopes_of(r.get("was") or {})
        touched.update(here)
        if not any(h.startswith("story:") for h in here):
            unplaced.append(name_of(r["element"]))
    if rows:
        touched.add("model")
    # the rooms next to a changed wall, door or window change with it
    hit_sheets, blind_sheets = [], []
    for s in (sheets or {}).get("sheets", []):
        shows = s.get("shows")
        if not shows:
            blind_sheets.append(s["no"])
        elif touched & set(shows) or unplaced:  # an element on no story could be on any sheet
            hit_sheets.append(s["no"])
    touched.update("sheet:%s" % n for n in hit_sheets)
    if rows:
        touched.update("sheet:%s" % n for n in blind_sheets)  # a sheet that does not say what it shows cannot be excluded
    if declared is None:
        report("change.declared", [], "", "no --declared scope given: what the brief allowed to change is unknown")
    else:
        ok = lambda r: any(fnmatch.fnmatch(str(r["element"].get("id") or ""), d) or fnmatch.fnmatch(str(r["key"]), d) or d in scopes_of(r["element"]) for d in declared)
        stray = ["%s %s (%s)" % (r["change"], name_of(r["element"]), ", ".join(list(r["fields"])[:3]) or "-") for r in rows if not ok(r)]
        p = stray + (["nothing changed: the revision had no effect"] if not rows else [])
        report("change.declared", p, "all %d changes are inside what the brief allowed" % len(rows), scope=sorted(touched) or None)
    cons = consequences(rows, links)
    rev = "revision:" + hashlib.sha256(json.dumps([before.get("elements"), after.get("elements")], sort_keys=True).encode("utf-8")).hexdigest()[:16]
    for c in ("change.complete", "change.listed", "change.declared"):  # claims about this pair of snapshots: a later change does not make them false
        if c in RES:
            RES[c]["scope"] = [rev]
    return {"unplaced": unplaced, "rows": rows, "touched": sorted(touched), "sheets": hit_sheets, "sheets_unknown": blind_sheets, "consequences": cons,
            "complete": RES["change.complete"]["status"] == "OK"}


def tree(result, limit=30):
    out = []
    for r in result["rows"][:limit]:
        e = r["element"]
        what = "; ".join("%s %s -> %s" % (f, safe.clean(v[0], 60), safe.clean(v[1], 60)) for f, v in list(r["fields"].items())[:4])
        out.append("%s %s%s%s" % (r["change"].upper(), name_of(e), "  [%s]" % ", ".join(scopes_of(e)) if scopes_of(e) else "", ": " + what if what else ""))
        for who, text, row in result["consequences"]:
            if row is r:
                out.append("    -> %s: %s" % (who, text))
    if len(result["rows"]) > limit:
        out.append("... and %d more (see the JSON)" % (len(result["rows"]) - limit))
    if result["sheets"]:
        out.append("SHEETS to issue again: " + ", ".join(result["sheets"]))
    if result["sheets_unknown"] and result["rows"]:
        out.append("SHEETS that do not say what they show, so cannot be excluded: " + ", ".join(result["sheets_unknown"][:12]))
    if result["unplaced"]:
        out.append("ELEMENTS ON NO STORY changed (%s): every sheet counts as touched" % ", ".join(result["unplaced"][:4]))
    by = {}
    for who, text, _ in result["consequences"]:
        by.setdefault(who, [])
        if text not in by[who]:
            by[who].append(text)
    for who, texts in sorted(by.items()):
        out.append("TO CHECK AGAIN - %s: %s" % (who, "; ".join(texts[:6])))
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("before"); ap.add_argument("after"); ap.add_argument("--links"); ap.add_argument("--sheets"); ap.add_argument("--declared")
    ap.add_argument("--out"); ap.add_argument("--md")
    a = ap.parse_args()
    load = lambda p: json.load(open(p, encoding="utf-8")) if p else None
    links = load(a.links)
    res = run(load(a.before), load(a.after), (links or {}).get("rules") if isinstance(links, dict) else links, load(a.sheets),
              [d.strip() for d in a.declared.split(",") if d.strip()] if a.declared is not None else None)
    lines = tree(res)
    print("\n".join(LINES + lines))
    if not res["rows"] and res["complete"]:
        print("IDENTICAL: no element differs. A new save of the file sends no proof back.")
    elif not res["rows"]:
        print("NO DIFFERENCE FOUND IN WHAT COULD BE COMPARED - this is not 'identical': see change.complete for what was not compared.")
    print("touched scopes %d: %s" % (len(res["touched"]), ", ".join(res["touched"][:10])))
    if a.md:
        open(a.md, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    if a.out:
        slim = [{"key": r["key"], "change": r["change"], "what": name_of(r["element"]), "fields": r["fields"]} for r in res["rows"]]
        json.dump(receipt.stamp(dict(RES, touched=res["touched"], rows=slim[:2000], sheets=res["sheets"], sheets_unknown=res["sheets_unknown"],
                       consequences=[{"who": w, "what": t, "from": name_of(r["element"])} for w, t, r in res["consequences"]][:500]), __file__),
                  open(a.out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    sys.exit(1 if any(r["status"] == "FAIL" for r in RES.values()) else 2 if any(r["status"] == "SKIP" for r in RES.values()) else 0)
