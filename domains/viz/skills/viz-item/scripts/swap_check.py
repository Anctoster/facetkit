#!/usr/bin/env python3
"""swap_check - after a new Archicad model replaced the old one: did everything that was set up by
hand in Blender survive? Compares the scene index taken before the swap with the one taken after
(`scene_index.py` with "id_property" set), element by element, through the identifiers from Archicad.

A re-import quietly drops what the exporter does not know about: a material slot comes back empty or
as a numbered copy ("Brick.001"), a modifier disappears, an object leaves its collection or its parent.
This tool names every such loss, lists what the new model added, removed and reshaped, and says which
zones of the scene were touched - so that only their checks are run again.

Usage: swap_check.py BEFORE_index.json AFTER_index.json [--pattern "BLD_*"] [--allow "BLD_roof*"] [--min-match 0.95]
                     [--out swap.json] [--md swap-changes.md]
--pattern    the designed objects the swap replaces (others are the transaction's business)
--allow      objects the brief says may change, or go: their materials and modifiers are not losses, and their
             disappearance does not count against the share of objects followed
--min-match  the share of the old model's objects (outside --allow) that must be found again in the new one.
             Below it the check cannot conclude: an object the import renamed looks removed and added, and
             whatever it lost is invisible. Then the answer is SKIP with the numbers, never OK.
Then:  vizflow.py evidence --from swap.json   and   vizflow.py stale --from swap.json"""
import argparse, fnmatch, json, re, sys
import receipt
import safe

NUMBERED = re.compile(r"\.\d{3}$")


def keyed(index, pattern):
    """Objects by their Archicad identifier; objects without one by name. Returns (map, objects sharing an id)."""
    out, twice = {}, []
    for name, r in index.get("objects", {}).items():
        if not fnmatch.fnmatch(name, pattern):
            continue
        k = "id:%s" % r["id"] if r.get("id") not in (None, "") else "name:%s" % name
        if k in out:
            twice.append(name)
        else:
            out[k] = dict(r, name=name)
    return out, twice


def compare(before, after, pattern="*", allow=()):
    b, tb = keyed(before, pattern)
    a, ta = keyed(after, pattern)
    allowed = lambda n: any(fnmatch.fnmatch(n, p) for p in allow)
    lost, reshaped, moved = [], [], []
    for k in sorted(set(b) & set(a)):
        x, y = b[k], a[k]
        n = y["name"]
        if x.get("geometry") != y.get("geometry"):
            reshaped.append(n)
        elif x.get("transform") != y.get("transform"):
            moved.append(n)
        if allowed(n):
            continue
        xm, ym = x.get("materials") or [], y.get("materials") or []
        for i, m in enumerate(xm):
            now = ym[i] if i < len(ym) else None
            if m and not now:
                lost.append("%s: slot %d lost its material '%s'" % (n, i + 1, m))
            elif m and now != m:
                lost.append("%s: slot %d was '%s', is now '%s'%s" % (n, i + 1, m, now, " - a numbered copy made by the import" if NUMBERED.sub("", now) == m else ""))
        gone = [m for m in x.get("modifiers") or [] if m not in (y.get("modifiers") or [])]
        if gone:
            lost.append("%s: lost modifiers %s" % (n, ", ".join(gone)))
        for f in ("collection", "parent"):
            if x.get(f) != y.get(f):
                lost.append("%s: %s was '%s', is now '%s'" % (n, f, x.get(f), y.get(f)))
    added = sorted(a[k]["name"] for k in set(a) - set(b))
    removed = sorted(b[k]["name"] for k in set(b) - set(a))
    bare = sorted(a[k]["name"] for k in set(a) - set(b) if not any(a[k].get("materials") or []))
    # zones the swap touched: of every object that came, went, or differs in anything the scene keeps -
    # geometry, place, materials, modifiers, collection, parent - allowed or not. An object that differs and
    # carries no zones could be anywhere: then every zone of the scene is touched.
    FIELDS = ("geometry", "transform", "materials", "modifiers", "collection", "parent")
    differs = [k for k in set(b) & set(a) if any(b[k].get(f) != a[k].get(f) for f in FIELDS)]
    touched = [a[k] for k in set(a) - set(b)] + [b[k] for k in set(b) - set(a)] + [b[k] for k in differs] + [a[k] for k in differs]
    zones = set()
    for o in touched:
        zones.update(o.get("zones") or [])
    unplaced = sorted({o["name"] for o in touched if not o.get("zones")})
    if unplaced:
        for idx in (before, after):
            for o in idx.get("objects", {}).values():
                zones.update(o.get("zones") or [])
    base = [k for k in b if not allowed(b[k]["name"])]
    found = [k for k in base if k in a]
    return {"lost": lost, "added": added, "removed": removed, "reshaped": reshaped, "moved": moved, "bare": bare,
            "no_id": sorted(v["name"] for k, v in a.items() if k.startswith("name:")), "twice": tb + ta, "matched": len(set(a) & set(b)), "zones": sorted(zones),
            "unplaced": unplaced, "share": (len(found) / float(len(base))) if base else 1.0, "base": len(base), "by_name": sum(1 for k in found if k.startswith("name:"))}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("before"); ap.add_argument("after"); ap.add_argument("--pattern", default="*"); ap.add_argument("--allow", default="")
    ap.add_argument("--min-match", type=float, default=0.95)
    ap.add_argument("--out"); ap.add_argument("--md")
    a = ap.parse_args()
    load = lambda p: json.load(open(p, encoding="utf-8"))
    before, after = load(a.before), load(a.after)
    r = compare(before, after, a.pattern, [x for x in a.allow.split(",") if x])
    problems = list(r["lost"])
    problems += ["%d new objects arrived with no material: %s" % (len(r["bare"]), ", ".join(r["bare"][:4]))] if r["bare"] else []
    problems += ["%d objects share an Archicad identifier: %s" % (len(r["twice"]), ", ".join(r["twice"][:4]))] if r["twice"] else []
    if not (before.get("complete", True) and after.get("complete", True)):
        status, text = "SKIP", "an index is incomplete: nothing may be concluded"
    elif not r["matched"]:
        status, text = "SKIP", "no object of the old model was found in the new one: the identifiers do not match, or the pattern is wrong"
    elif problems:
        status, text = "FAIL", "%d losses: %s" % (len(problems), "; ".join(problems[:4]))
    elif r["share"] < a.min_match:
        status, text = "SKIP", ("only %d%% of the old model's objects (%d of %d outside --allow) were found again; at least %d%% are needed. "
                                "An object the import renamed looks removed and added, and what it lost cannot be seen. If the removals are intended, "
                                "name them with --allow; otherwise carry the Archicad identifiers over" % (round(100 * r["share"]), round(r["share"] * r["base"]), r["base"], round(100 * a.min_match)))
    else:
        status = "OK"
        text = "%d objects carried over with their materials, modifiers, collection and parent; %d%% of the old model followed%s" % (
            r["matched"], round(100 * r["share"]), (" (%d only by name: a renamed one would not be seen)" % r["by_name"]) if r["by_name"] else "")
    text = safe.clean(text, 600)
    print("%-4s swap.kept: %s" % (status, text))
    print("new model: added %d  removed %d  reshaped %d  moved %d  (matched %d, without an Archicad id %d)" %
          (len(r["added"]), len(r["removed"]), len(r["reshaped"]), len(r["moved"]), r["matched"], len(r["no_id"])))
    print("zones touched %d: %s%s" % (len(r["zones"]), ", ".join(r["zones"][:10]),
                                       ("  (every zone: %d changed objects carry no zones, e.g. %s)" % (len(r["unplaced"]), safe.clean(r["unplaced"][0], 40))) if r["unplaced"] else ""))
    if a.md:
        with open(a.md, "w", encoding="utf-8") as f:
            for title, rows in (("Added", r["added"]), ("Removed", r["removed"]), ("Reshaped", r["reshaped"]), ("Moved", r["moved"]), ("Lost in the swap", r["lost"])):
                f.write("## %s (%d)\n%s\n\n" % (title, len(rows), "\n".join("- " + str(x) for x in rows[:200]) or "- none"))
    if a.out:
        json.dump(receipt.stamp({"swap.kept": {"status": status, "text": text, "data": problems[:200], "zones": r["zones"] or None}, "touched": r["zones"],
                   "report": {k: v[:500] if isinstance(v, list) else v for k, v in r.items()}}, __file__), open(a.out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    sys.exit(1 if status == "FAIL" else 2 if status == "SKIP" else 0)
