#!/usr/bin/env python3
"""model_spec - checks a building description before anything is drawn in Archicad.

The description (spec.json) is the single place where text and raster sources are turned into
numbers: stories, walls, openings, slabs, zones, each on a named layer role, each with the source it
was read from and how sure the reader is. This tool proves that the description is consistent and
complete enough to build from; it never guesses a missing value.

Usage: model_spec.py SPEC.json [--project project.json] [--out results.json] [--min-conf 0.8]
Every check prints OK | FAIL | SKIP(reason). Exit 1 when any check fails."""
import argparse, json, math, sys

RES, LINES = {}, []


def report(cid, status, text, data=None):
    RES[cid] = {"status": status, "text": text, "data": data}
    LINES.append("%-4s %s: %s" % (status, cid, text))


def verdict(cid, problems, ok_text, skip=None):
    if skip:
        return report(cid, "SKIP", skip)
    report(cid, "FAIL" if problems else "OK", ("%d problems: %s" % (len(problems), "; ".join(map(str, problems[:5])))) if problems else ok_text, problems[:200])


def length(w):
    return math.hypot(w["to"][0] - w["from"][0], w["to"][1] - w["from"][1])


def area(poly):
    return abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))) / 2.0


def check(spec, project=None, min_conf=0.8):
    tol = (project or {}).get("tolerances", {})
    snap, area_pct, scale_pct = tol.get("snap_m", 0.02), tol.get("area_pct", 2.0), tol.get("scale_pct", 1.0)
    walls, openings, zones, stories = spec.get("walls", []), spec.get("openings", []), spec.get("zones", []), spec.get("stories", [])
    elements = [(k, e) for k in ("walls", "openings", "slabs", "zones", "columns", "roofs", "stairs") for e in spec.get(k, [])]
    # schema: what must be there for anything else to make sense
    p = [k for k in ("units", "stories", "walls", "layers", "sources") if not spec.get(k)]
    p += ["units must be 'm'"] if spec.get("units") not in (None, "m") else []
    need = {"walls": ("id", "story", "from", "to", "thickness", "height", "layer", "source"), "openings": ("id", "wall", "type", "offset", "width", "height", "layer", "source"),
            "slabs": ("id", "story", "outline", "thickness", "layer", "source"), "zones": ("id", "story", "name", "outline", "layer", "source")}
    for k, e in elements:
        miss = [f for f in need.get(k, ("id", "story", "layer", "source")) if e.get(f) in (None, "", [])]
        if miss:
            p.append("%s %s lacks %s" % (k[:-1], e.get("id", "?"), ", ".join(miss)))
    ids = [e.get("id") for _, e in elements]
    p += ["id used twice: %s" % i for i in sorted({i for i in ids if i and ids.count(i) > 1})]
    verdict("spec.schema", p, "%d elements, every one with id, layer and source" % len(elements))
    # scale: at least one known dimension per raster source; several must agree
    proofs = spec.get("scale_proofs", [])
    rasters = sorted({s["id"] for s in spec.get("sources", []) if s.get("kind") == "raster"})
    p = ["raster %s has no known dimension to fix its scale" % r for r in rasters if not any(x.get("source") == r for x in proofs)]
    for r in rasters:
        ppm = [x["measured_px"] / x["known_m"] for x in proofs if x.get("source") == r and x.get("known_m")]
        if len(ppm) > 1 and (max(ppm) - min(ppm)) / min(ppm) * 100 > scale_pct:
            p.append("raster %s: known dimensions disagree by %.1f%% (limit %.1f%%) - the drawing is distorted or a dimension was misread" % (r, (max(ppm) - min(ppm)) / min(ppm) * 100, scale_pct))
    verdict("spec.scale", p, "%d raster sources, each tied to a known dimension" % len(rasters), None if rasters or proofs else None)
    # layers: every element names a role, every role maps to a real layer name
    roles = spec.get("layers", {})
    target = (project or {}).get("layers", {})
    p = ["%s %s uses unknown layer role '%s'" % (k[:-1], e.get("id"), e.get("layer")) for k, e in elements if e.get("layer") not in roles]
    p += ["layer role '%s' has no Archicad layer name" % r for r, name in roles.items() if not name]
    p += ["layer role '%s' is '%s' here but '%s' in the project" % (r, roles[r], target[r]) for r in roles if target.get(r) and roles[r] and target[r] != roles[r]]
    verdict("spec.layers", p, "%d layer roles, all mapped; every element is assigned" % len(roles))
    # stories
    sid = {s.get("id") for s in stories}
    p = ["story %s: height must be positive" % s.get("id") for s in stories if not (s.get("height") or 0) > 0]
    el = [s.get("elevation", 0) for s in stories]
    p += ["stories are not in ascending order of elevation"] if el != sorted(el) else []
    p += ["story %s ends at %.2f but the next starts at %.2f" % (a["id"], a["elevation"] + a["height"], b["elevation"]) for a, b in zip(stories, stories[1:]) if abs(a.get("elevation", 0) + a.get("height", 0) - b.get("elevation", 0)) > 0.005]
    p += ["%s %s is on unknown story '%s'" % (k[:-1], e.get("id"), e.get("story")) for k, e in elements if k != "openings" and e.get("story") not in sid]
    verdict("spec.stories", p, "%d stories, contiguous" % len(stories))
    # walls
    ok_walls = [w for w in walls if all(k in w for k in ("from", "to", "thickness"))]
    p = ["wall %s is %.3f m long" % (w["id"], length(w)) for w in ok_walls if length(w) < 0.1]
    p += ["wall %s: thickness %.3f m is outside 0.05-1.5" % (w["id"], w["thickness"]) for w in ok_walls if not 0.05 <= w["thickness"] <= 1.5]
    key = lambda w: (w.get("story"), tuple(sorted([tuple(round(c, 2) for c in w["from"]), tuple(round(c, 2) for c in w["to"])])))
    seen = {}
    for w in ok_walls:
        if key(w) in seen:
            p.append("walls %s and %s are the same segment" % (seen[key(w)], w["id"]))
        seen[key(w)] = w["id"]
    verdict("spec.walls", p, "%d walls, lengths and thicknesses plausible, none doubled" % len(walls))
    # loops: exterior walls of a story close; no wall end hangs free
    p = []
    for s in stories:
        ends = {}
        mine = [w for w in ok_walls if w.get("story") == s.get("id")]
        pts = []
        for w in mine:
            for q in (w["from"], w["to"]):
                hit = next((i for i, o in enumerate(pts) if math.hypot(o[0] - q[0], o[1] - q[1]) <= snap), None)
                if hit is None:
                    pts.append(q)
                    hit = len(pts) - 1
                ends.setdefault(hit, []).append(w)
        def touches_body(i):  # a T-junction: the end lies on another wall's line
            q = pts[i]
            for w in mine:
                if w in ends[i]:
                    continue
                (x1, y1), (x2, y2) = w["from"], w["to"]
                L = length(w)
                if L and abs((x2 - x1) * (q[1] - y1) - (y2 - y1) * (q[0] - x1)) / L <= snap + w["thickness"] / 2 and -snap <= ((q[0] - x1) * (x2 - x1) + (q[1] - y1) * (y2 - y1)) / L <= L + snap:
                    return True
            return False
        loose = [i for i, ws in ends.items() if len(ws) == 1 and not touches_body(i)]
        p += ["story %s: wall %s ends at (%.2f, %.2f) without meeting another wall" % (s.get("id"), ends[i][0]["id"], pts[i][0], pts[i][1]) for i in loose]
        ext = [i for i, ws in ends.items() if sum(1 for w in ws if "ext" in str(w.get("layer"))) % 2]
        if ext:
            p.append("story %s: exterior walls do not form a closed outline (%d open corners)" % (s.get("id"), len(ext)))
    verdict("spec.loops", p, "wall ends meet; exterior outlines close on every story")
    # openings
    wid = {w["id"]: w for w in ok_walls}
    p = ["opening %s is in unknown wall '%s'" % (o.get("id"), o.get("wall")) for o in openings if o.get("wall") not in wid]
    for w in ok_walls:
        mine = sorted((o for o in openings if o.get("wall") == w["id"] and "offset" in o and "width" in o), key=lambda o: o["offset"])
        p += ["opening %s (%.2f + %.2f) does not fit wall %s (%.2f m)" % (o["id"], o["offset"], o["width"], w["id"], length(w)) for o in mine if o["offset"] < 0 or o["offset"] + o["width"] > length(w) + 1e-6]
        p += ["openings %s and %s overlap in wall %s" % (a["id"], b["id"], w["id"]) for a, b in zip(mine, mine[1:]) if a["offset"] + a["width"] > b["offset"] + 1e-6]
        p += ["opening %s: sill %.2f + height %.2f exceeds the wall height %.2f" % (o["id"], o.get("sill", 0), o["height"], w.get("height", 0)) for o in mine if w.get("height") and o.get("sill", 0) + o.get("height", 0) > w["height"] + 1e-6]
    verdict("spec.openings", p, "%d openings, all inside their walls" % len(openings))
    # zones: drawn outline agrees with the area the source states
    p = []
    for z in zones:
        if len(z.get("outline", [])) >= 3 and z.get("stated_area_m2"):
            a = area(z["outline"])
            if abs(a - z["stated_area_m2"]) / z["stated_area_m2"] * 100 > area_pct:
                p.append("zone %s '%s': outline gives %.2f m2, the source states %.2f m2" % (z.get("id"), z.get("name"), a, z["stated_area_m2"]))
    verdict("spec.zones", p, "%d zones; %d with a stated area, all within %.1f%%" % (len(zones), sum(1 for z in zones if z.get("stated_area_m2")), area_pct))
    # confidence and questions: nothing uncertain is built silently
    qs = spec.get("questions", [])
    blocked = {b for q in qs for b in q.get("blocks", [])}
    p = ["%s %s was read with confidence %.2f and no question covers it" % (k[:-1], e.get("id"), e.get("conf", 0)) for k, e in elements if e.get("conf", 1.0) < min_conf and e.get("id") not in blocked]
    verdict("spec.confidence", p, "every element read with confidence under %.2f is covered by a question" % min_conf)
    open_q = [q for q in qs if not q.get("answer")]
    report("spec.questions", "FAIL" if open_q else "OK", ("%d questions wait for the architect: %s" % (len(open_q), "; ".join("%s %s" % (q.get("id"), q.get("text", "")[:60]) for q in open_q[:4]))) if open_q else "%d questions, all answered" % len(qs), open_q)
    return RES


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("spec"); ap.add_argument("--project"); ap.add_argument("--out"); ap.add_argument("--min-conf", type=float, default=0.8)
    a = ap.parse_args()
    project = json.load(open(a.project, encoding="utf-8")) if a.project else None
    check(json.load(open(a.spec, encoding="utf-8")), project, a.min_conf)
    print("\n".join(LINES))
    c = {s: sum(1 for r in RES.values() if r["status"] == s) for s in ("OK", "FAIL", "SKIP")}
    print("RESULT passed %d  failed %d  skipped %d" % (c["OK"], c["FAIL"], c["SKIP"]))
    if a.out:
        json.dump(RES, open(a.out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    sys.exit(1 if c["FAIL"] else 0)
