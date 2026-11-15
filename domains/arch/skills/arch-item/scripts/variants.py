#!/usr/bin/env python3
"""variants - compares design variants by what can be measured, before anything is drawn in detail.

A variant set covers one aspect - the site plan, the layouts or the facades. Each variant states its
idea in one line and carries its geometry and counts; this tool computes the indicators from them,
tests every variant against the limits the architect gave (from the local plan or the decision on
building conditions), shows whether the variants really differ, scores them by the architect's
weights and marks the ones no other variant beats on every criterion. It never chooses.

Usage: variants.py VARIANTS.json [--chosen ID] [--min 3] [--out results.json]
See variants.example.json for the format. Weights: a negative weight means "lower is better"."""
import argparse, json, math, sys

RES, LINES = {}, []


def report(cid, status, text, data=None):
    RES[cid] = {"status": status, "text": text, "data": data}
    LINES.append("%-4s %s: %s" % (status, cid, text))


def area(poly):
    return abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))) / 2.0


def seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L2 = dx * dx + dy * dy
    t = 0.0 if not L2 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
    return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))


def setback(building, plot):
    """Smallest distance between a building outline and the plot boundary."""
    edges = lambda poly: [(poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly))]
    return min(min(seg_dist(p, a, b) for p in building for a, b in edges(plot)), min(seg_dist(p, a, b) for p in plot for a, b in edges(building)))


def inside(p, poly):
    n, hit = len(poly), False
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        if (y1 > p[1]) != (y2 > p[1]) and p[0] < (x2 - x1) * (p[1] - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def indicators(v, plot):
    m = {}
    b = v.get("buildings", [])
    if plot and b:
        pa = area(plot)
        foot = sum(area(x["outline"]) for x in b)
        gross = v.get("gross_m2") or sum(area(x["outline"]) * x.get("storeys", 1) for x in b)
        m.update(plot_m2=round(pa, 1), footprint_m2=round(foot, 1), coverage_pct=round(foot / pa * 100, 2), gross_m2=round(gross, 1), intensity=round(gross / pa, 3),
                 setback_m=round(min(setback(x["outline"], plot) for x in b), 2), height_m=max(x.get("height_m", 0) for x in b),
                 outside_plot=sum(1 for x in b for p in x["outline"] if not inside(p, plot)))
        if v.get("green_m2") is not None:
            m["green_pct"] = round(v["green_m2"] / pa * 100, 2)
    elif v.get("gross_m2"):
        m["gross_m2"] = v["gross_m2"]
    for k in ("flats", "usable_m2", "parking_places", "cost_index"):
        if v.get(k) is not None:
            m[k] = v[k]
    if m.get("flats") and v.get("parking_places") is not None:
        m["parking_per_flat"] = round(v["parking_places"] / m["flats"], 2)
    if m.get("usable_m2") and m.get("gross_m2"):
        m["efficiency"] = round(m["usable_m2"] / m["gross_m2"], 3)
    f = v.get("facade")
    if f:
        walls, glass = sum(f.get("walls_m2", {}).values()), sum(f.get("glazing_m2", {}).values())
        if walls:
            m["glazing_ratio"] = round(glass / walls, 3)
        if glass:
            m["south_glazing_share"] = round(sum(a for o, a in f["glazing_m2"].items() if "S" in o.upper()) / glass, 3)
    rooms = v.get("rooms")
    if rooms:
        m["rooms"] = len(rooms)
        m["usable_m2"] = m.get("usable_m2") or round(sum(r.get("area_m2", 0) for r in rooms), 1)
        m["circulation_share"] = round(sum(r.get("area_m2", 0) for r in rooms if r.get("kind") == "circulation") / max(m["usable_m2"], 1e-9), 3)
    m.update(v.get("extra", {}))
    return m


LIMITS = {"max_coverage_pct": ("coverage_pct", "<="), "max_intensity": ("intensity", "<="), "min_intensity": ("intensity", ">="), "min_green_pct": ("green_pct", ">="),
          "max_height_m": ("height_m", "<="), "min_setback_m": ("setback_m", ">="), "min_parking_per_flat": ("parking_per_flat", ">="), "min_flats": ("flats", ">="),
          "min_usable_m2": ("usable_m2", ">="), "max_glazing_ratio": ("glazing_ratio", "<="), "min_glazing_ratio": ("glazing_ratio", ">="), "max_circulation_share": ("circulation_share", "<=")}


def run(data, chosen=None, minimum=3):
    vs, plot, limits, weights = data.get("variants", []), (data.get("plot") or {}).get("outline"), data.get("limits", {}), data.get("weights", {})
    p = []
    if len(vs) < minimum:
        p.append("%d variants given, at least %d are needed for a choice" % (len(vs), minimum))
    ids = [v.get("id") for v in vs]
    p += ["variant id used twice: %s" % i for i in sorted({i for i in ids if ids.count(i) > 1})]
    p += ["variant %s has no one-line idea ('idea')" % v.get("id") for v in vs if not str(v.get("idea", "")).strip()]
    p += ["limit '%s' is not known (known: %s)" % (k, ", ".join(sorted(LIMITS))) for k in limits if k not in LIMITS]
    p += ["no weights given: the architect has not said what matters"] if not weights else []
    met = {v.get("id"): indicators(v, plot) for v in vs}
    for v in vs:
        p += ["variant %s lacks what '%s' is computed from" % (v.get("id"), LIMITS[k][0]) for k in limits if k in LIMITS and LIMITS[k][0] not in met[v.get("id")]]
        p += ["variant %s lacks the weighted criterion '%s'" % (v.get("id"), k) for k in weights if k not in met[v.get("id")]]
        if met[v.get("id")].get("outside_plot"):
            p.append("variant %s: %d building corners lie outside the plot" % (v.get("id"), met[v["id"]]["outside_plot"]))
    report("variants.inputs", "FAIL" if p else "OK", ("%d problems: %s" % (len(p), "; ".join(p[:5]))) if p else "%d variants, each with an idea, its geometry and every weighted criterion" % len(vs), p)
    if p:
        for c in ("variants.limits", "variants.distinct", "variants.compared"):
            report(c, "SKIP", "the inputs must be fixed first")
        return None
    # limits: a variant that breaks one stays in the table, marked - it is never dropped silently
    broke = {}
    for i in ids:
        for k, lim in limits.items():
            key, op = LIMITS[k]
            if not (met[i][key] <= lim if op == "<=" else met[i][key] >= lim):
                broke.setdefault(i, []).append("%s %s (limit %s %s)" % (key, met[i][key], op, lim))
    ok_ids = [i for i in ids if i not in broke]
    report("variants.limits", "OK" if ok_ids else "FAIL", "%d of %d variants keep every limit%s" % (len(ok_ids), len(ids), "; over a limit: " + "; ".join("%s - %s" % (i, ", ".join(b)) for i, b in list(broke.items())[:4]) if broke else ""), broke)
    # distinct: two variants within 5 % of each other on every weighted criterion are one variant shown twice
    twins = []
    for a in range(len(ids)):
        for b in range(a + 1, len(ids)):
            d = [abs(met[ids[a]][k] - met[ids[b]][k]) / max(abs(met[ids[a]][k]), abs(met[ids[b]][k]), 1e-9) for k in weights]
            if max(d) < 0.05:
                twins.append("%s and %s differ by less than 5%% on every criterion" % (ids[a], ids[b]))
    report("variants.distinct", "FAIL" if twins else "OK", "; ".join(twins[:4]) if twins else "every pair of variants differs by 5% or more on at least one criterion", twins)
    # scores: each criterion scaled between the worst and best variant, then weighted
    score = {i: 0.0 for i in ids}
    for k, w in weights.items():
        vals = [met[i][k] for i in ids]
        lo, hi = min(vals), max(vals)
        for i in ids:
            s = 0.5 if hi == lo else (met[i][k] - lo) / (hi - lo)
            score[i] += abs(w) * (1 - s if w < 0 else s)
    total = sum(abs(w) for w in weights.values()) or 1.0
    score = {i: round(s / total, 3) for i, s in score.items()}
    better = lambda a, b, k: (met[a][k] < met[b][k]) if weights[k] < 0 else (met[a][k] > met[b][k])
    beaten = {i: next((j for j in ids if j != i and all(not better(i, j, k) for k in weights) and any(better(j, i, k) for k in weights)), None) for i in ids}
    order = sorted(ids, key=lambda i: (i in broke, -score[i]))
    LINES.append("%-6s %-7s %s  idea" % ("id", "score", "  ".join("%-18s" % k[:18] for k in weights)))
    by = {v["id"]: v for v in vs}
    for i in order:
        LINES.append("%-6s %-7s %s  %s%s%s" % (i, score[i], "  ".join("%-18s" % met[i][k] for k in weights), by[i]["idea"][:60],
                                               "  [OVER A LIMIT]" if i in broke else "", "  [beaten on every criterion by %s]" % beaten[i] if beaten[i] else ""))
    lead = [i for i in order if i not in broke]
    if len(lead) > 1 and score[lead[0]] - score[lead[1]] < 0.05:
        LINES.append("%s and %s are within 0.05 of each other: the weights do not separate them - this is a choice, not a calculation" % (lead[0], lead[1]))
    out = {"indicators": met, "score": score, "over_limit": broke, "beaten_by": beaten, "order": order}
    report("variants.compared", "OK", "%d variants scored on %d weighted criteria; %d are not beaten on every criterion by another" % (len(ids), len(weights), sum(1 for i in ids if not beaten[i])), out)
    if chosen is not None:
        if chosen not in ids:
            report("variants.chosen", "FAIL", "the chosen variant '%s' is not in the set" % chosen)
        elif chosen in broke:
            report("variants.chosen", "FAIL", "the chosen variant %s is over a limit: %s" % (chosen, ", ".join(broke[chosen])))
        else:
            report("variants.chosen", "OK", "variant %s was chosen; it keeps every limit%s" % (chosen, " (note: %s beats it on every criterion)" % beaten[chosen] if beaten[chosen] else ""))
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("variants"); ap.add_argument("--chosen"); ap.add_argument("--min", type=int, default=3); ap.add_argument("--out")
    a = ap.parse_args()
    run(json.load(open(a.variants, encoding="utf-8")), a.chosen, a.min)
    print("\n".join(LINES))
    if a.out:
        json.dump(RES, open(a.out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    sys.exit(1 if any(r["status"] == "FAIL" for r in RES.values()) else 0)
