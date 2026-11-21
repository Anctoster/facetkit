#!/usr/bin/env python3
"""rules_check - the model against the numeric requirements the designer wrote down for this project.

The tool holds no regulation. `rules.json` is the designer's own list: each rule names what is measured,
the limit, the provision it comes from, and who confirmed the number and when. The tool measures and
compares; a rule nobody confirmed is reported, never counted as met. What comes out is a comparison
with that list - compliance stays the designer's statement.

Usage: rules_check.py RULES.json MODEL.json [--out results.json]
MODEL.json is a snapshot (ifc_read.py, readback) or a building description (spec.json).

rules.json  {"rules": [{"id": "R1", "title": "Corridor clear width", "select": {"type": "zone", "where": [{"field": "name", "match": "Korytarz*"}]},
                        "field": "min_width", "min": 1.2, "basis": "<provision>", "confirmed_by": "<designer>", "confirmed_on": "2026-11-16"}]}
Fields measured by the tool when the model does not carry them: zone `area` and `min_width` (the narrowest
place of the outline), ramp `slope_pct` (rise / run), stair `two_r_plus_t` (2 x riser + tread)."""
import argparse, fnmatch, json, math, sys
import receipt
import safe

RES, LINES = {}, []


def report(cid, problems, ok_text, skip=None, scope=None):
    status = "SKIP" if skip else "FAIL" if problems else "OK"
    problems = [safe.clean(p, 240) for p in problems or []]
    text = safe.clean(skip, 400) if skip else (("%d problems: %s" % (len(problems), "; ".join(problems[:5]))) if problems else ok_text)
    RES[cid] = {"status": status, "text": text, "data": (problems or [])[:200], "scope": scope}
    LINES.append("%-4s %s: %s" % (status, cid, text))


def area(poly):
    return abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))) / 2.0


def inside(p, poly):
    c, n = False, len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        if (a[1] > p[1]) != (b[1] > p[1]) and p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]:
            c = not c
    return c


def min_width(poly):
    """The narrowest place of a room: the shortest way from a corner to a side it does not belong to,
    measured through the room. Exact for rooms with straight sides; an estimate for curved ones."""
    best, n = None, len(poly)
    for i, p in enumerate(poly):
        for k in range(n):
            if k in (i, (i - 1) % n):
                continue
            a, b = poly[k], poly[(k + 1) % n]
            dx, dy = b[0] - a[0], b[1] - a[1]
            L2 = dx * dx + dy * dy
            if not L2:
                continue
            t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
            q = (a[0] + t * dx, a[1] + t * dy)
            d = math.hypot(p[0] - q[0], p[1] - q[1])
            if d > 1e-6 and inside(((p[0] + q[0]) / 2, (p[1] + q[1]) / 2), poly) and (best is None or d < best):
                best = d
    return best


def elements_of(model):
    """A snapshot as it is; a description (spec.json) turned into the same records."""
    if "elements" in model:
        return [dict(e) for e in model["elements"]]
    out = []
    for kind, typ in (("walls", "wall"), ("slabs", "slab"), ("zones", "zone"), ("columns", "column"), ("roofs", "roof"), ("stairs", "stair"), ("ramps", "ramp")):
        out += [dict(e, type=typ) for e in model.get(kind, [])]
    out += [dict(o, type=o.get("type", "opening")) for o in model.get("openings", [])]
    return out


def derive(e):
    if e.get("type") == "zone" and e.get("outline") and len(e["outline"]) >= 3:
        e.setdefault("area", round(area(e["outline"]), 3))
        w = min_width(e["outline"])
        if w is not None:
            e.setdefault("min_width", round(w, 3))
    if e.get("rise") is not None and e.get("run"):
        e.setdefault("slope_pct", round(100.0 * e["rise"] / e["run"], 2))
    if e.get("riser") is not None and e.get("tread") is not None:
        e.setdefault("two_r_plus_t", round(2 * e["riser"] + e["tread"], 3))
    return e


def get(e, field):
    return e.get(field) if field in e else (e.get("props") or {}).get(field)


def selected(e, sel):
    if sel.get("type") and e.get("type") not in ([sel["type"]] if isinstance(sel["type"], str) else sel["type"]):
        return False
    if sel.get("story") and e.get("story") != sel["story"]:
        return False
    for w in sel.get("where", []):
        v = get(e, w["field"])
        if "match" in w and not fnmatch.fnmatch(str(v if v is not None else "").lower(), str(w["match"]).lower()):
            return False
        if "eq" in w and v != w["eq"]:
            return False
    return True


def check(rules, model):
    els = [derive(e) for e in elements_of(model)]
    rl = rules.get("rules", [])
    if not rl:
        for c in ("rules.confirmed", "rules.coverage", "rules.values"):
            report(c, [], "", "the list holds no rule")
        return RES
    ids = [r.get("id") for r in rl]
    p = ["rule without an id"] * ids.count(None) + ["rule id used twice: %s" % i for i in sorted({i for i in ids if i and ids.count(i) > 1})]
    for r in rl:
        miss = [k for k in ("basis", "confirmed_by", "confirmed_on") if not r.get(k)]
        if miss:
            p.append("rule %s '%s' lacks %s" % (r.get("id"), r.get("title", ""), ", ".join(miss)))
        if r.get("min") is None and r.get("max") is None:
            p.append("rule %s has neither a minimum nor a maximum" % r.get("id"))
    report("rules.confirmed", p, "%d rules, each with its provision and the designer who confirmed the number" % len(rl))
    unconfirmed = {r.get("id") for r in rl if not (r.get("basis") and r.get("confirmed_by") and r.get("confirmed_on"))}
    cov, bad, measured, scope = [], [], 0, set()
    for r in rl:
        hit = [e for e in els if selected(e, r.get("select", {}))]
        vals = [(e, get(e, r["field"])) for e in hit]
        blind = [e for e, v in vals if not isinstance(v, (int, float)) or isinstance(v, bool)]
        if not hit:
            cov.append("rule %s '%s' found nothing to measure: the selection matches no element" % (r["id"], r.get("title", "")))
        elif blind:
            cov.append("rule %s: %d of %d elements carry no '%s' (first: %s %s)" % (r["id"], len(blind), len(hit), r["field"], blind[0].get("type"), blind[0].get("id") or blind[0].get("number") or blind[0].get("guid")))
        for e, v in vals:
            if e in blind:
                continue
            measured += 1
            scope.update(["story:%s" % e["story"]] if e.get("story") else [])
            who = "%s %s%s" % (e.get("type"), e.get("id") or e.get("number") or e.get("guid"), " '%s'" % e["name"] if e.get("name") and e.get("type") == "zone" else "")
            tag = "  (the number is not confirmed)" if r["id"] in unconfirmed else ""
            if r.get("min") is not None and v < r["min"] - 1e-9:
                bad.append("%s: %s %s = %.3f, at least %.3f required [%s]%s" % (r["id"], who, r["field"], v, r["min"], r.get("basis") or "no provision named", tag))
            if r.get("max") is not None and v > r["max"] + 1e-9:
                bad.append("%s: %s %s = %.3f, at most %.3f allowed [%s]%s" % (r["id"], who, r["field"], v, r["max"], r.get("basis") or "no provision named", tag))
    sc = ["model"]  # a rule applies to elements a change may add on any story, not only to those measured today
    report("rules.coverage", cov, "every rule found its elements and every one of them could be measured", scope=sc)
    report("rules.values", bad, "%d measurements within the limits of the list" % measured, None if measured else "nothing could be measured", scope=sc)
    return RES


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("rules"); ap.add_argument("model"); ap.add_argument("--out")
    a = ap.parse_args()
    load = lambda p: json.load(open(p, encoding="utf-8"))
    check(load(a.rules), load(a.model))
    print("\n".join(LINES))
    c = {s: sum(1 for r in RES.values() if r["status"] == s) for s in ("OK", "FAIL", "SKIP")}
    print("RESULT passed %d  failed %d  skipped %d   (a comparison with the designer's list, not a statement of compliance)" % (c["OK"], c["FAIL"], c["SKIP"]))
    if a.out:
        json.dump(receipt.stamp(RES, __file__), open(a.out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    sys.exit(1 if c["FAIL"] else 2 if c["SKIP"] else 0)
