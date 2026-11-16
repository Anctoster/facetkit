#!/usr/bin/env python3
"""vizflow - append-only, hash-chained journal for visualization work items.
State, next step, model and cost are computed from the journal, never remembered.
Python 3.8+, standard library only.  Usage: archflow.py [--root DIR] <command> ...
Exit codes: 0 ok, 1 refused, 3 cap spent or loop (stop and report BLOCKED)."""
import argparse, hashlib, json, os, re, sys, time

LADDER = ["haiku", "sonnet", "opus"]
def _r(*steps, checks=(), approve=True):
    return {"steps": list(steps), "checks": list(checks), "approve_brief": approve}


def _order():
    return {"id": "order", "agent": "viz-conductor", "mode": "brief", "model": "haiku"}


def _map():
    return {"id": "map", "agent": "scene-cartographer", "mode": "map", "model": "haiku"}


def _work(mode, sid="work", gate=None):
    # a registered script is run by the operator on the smallest model; until one exists the builder writes it
    st = {"id": sid, "agent": "scene-operator", "mode": mode, "model": "haiku", "script": mode,
          "else": {"agent": "scene-builder", "model": "sonnet"}}
    if gate:
        st["gate"] = gate
    return st


def _proof(mode="full", model="sonnet"):
    return {"id": "proof", "agent": "viz-inspector", "mode": mode, "model": model}


DEFAULT_ROUTES = {
    "note": "One route per kind of item. model = cheapest capable model for the step; the flow moves one step up "
            "the ladder only after 2 failed attempts. checks = results the inspector must reproduce before PASS is accepted.",
    "caps": {"runs": 40, "minutes": 60},
    "rework_max": 2,
    "routes": {
        "audit": _r(_order(), _map(), _proof("numbers", "haiku"), approve=False),
        "export": _r(_order(), _work("export"), _map(), _proof(),
                     checks=["export.scale", "export.ids", "export.surfaces", "export.duplicates", "export.budget"]),
        "environment": _r(_order(), _map(), _work("environment"), _proof(),
                          checks=["junction.step", "junction.gap", "terrain_holes", "missing_textures"]),
        "materials": _r(_order(), _map(), _work("materials"), _proof(),
                        checks=["materials.etalon", "materials.uv", "missing_textures"]),
        "cameras": _r(_order(), _map(), _work("cameras"), _proof(),
                      checks=["cameras.required", "cameras.frame", "cameras.clip"]),
        "render-setup": _r(_order(), _work("render-setup"), _proof(), checks=["render.settings", "render.sun"]),
        "swap": _r(_order(), _map(), _work("export", "sync"), _work("materials", "apply"), _proof(),
                   checks=["export.scale", "export.ids", "export.duplicates", "materials.etalon", "junction.step", "invariants"]),
        "env-adjust": _r(_order(), _map(), _work("env-adjust"), _proof(),
                         checks=["environment.unchanged", "junction.step", "junction.gap", "terrain_holes"]),
        "fix": _r(_order(), _map(), {"id": "build", "agent": "scene-builder", "mode": "build", "model": "sonnet"}, _proof()),
        "render": _r(_order(), _work("preview", "preview", gate="the preview contact sheet"), _work("render", "render"), _proof(),
                     checks=["images", "invariants"]),
        "pack": _r(_order(), _work("pack", "pack"), _proof("numbers", "haiku"), checks=["images"], approve=False),
    },
    "plans": {
        "new-project": [["export", "Source model out of Archicad", []], ["environment", "Existing surroundings, joined to the site", [1]],
                        ["materials", "Surface materials from the approved library", [1]], ["cameras", "Cameras and orbit", [2]],
                        ["render-setup", "Render settings and the real sun", [3, 4]], ["render", "Renders", [5]], ["pack", "Website images", [6]]],
        "model-change": [["swap", "New Archicad model in place of the old", []], ["env-adjust", "Surroundings corrected around the change", [1]],
                         ["render", "Renders", [2]], ["pack", "Website images", [3]]],
    },
}
BRIEF_TEMPLATE = """# Brief {item}
route: {route}

## Goal
(one to three sentences: what must exist when this is done, and what it is for)

## Reference
(files, links or earlier renders the result must match - or: none)

## Scope
(what is to be made or changed)

## Fixed
(what must NOT change: objects, materials, cameras, files - or: nothing)

## Acceptance
(numbered, at most 9. Each line ends with exactly one tag:
 [check: <check id> <= 0.05]  a number a script measures
 [look: <what to look at>]     one thing the inspector looks for on the contact sheet
 [user: <what to approve>]     something only the requester can judge)
1.

## Views
(cameras or frames the result is judged from - needed for every [look])

## Decisions
(what the agents may decide alone, and what they must ask about first)

## Budget
(runs, minutes; whether a low-resolution preview must be approved before the full render)
"""
VAGUE = ["красив", "реалистич", "качествен", "хорош", "нормальн", "как надо", "аккуратн", "получше", "nice", "good", "better",
         "realistic", "beautiful", "proper", "natural", "ładn", "dobrz", "естественн"]
SECTIONS = ["goal", "reference", "scope", "fixed", "acceptance", "views", "decisions", "budget"]
TAG = re.compile(r"\[(check|look|user):\s*([^\]]+)\]")
PROJECT_TEMPLATE = {
    "project": "", "viz_dir": "", "blend_working": "", "blend_copy_dir": "",
    "etalon_library": "", "archicad_source": "", "sync_method": "",
    "designed_pattern": "", "terrain_pattern": "", "height_limit_m": None,
    "render": {"frames": None, "size": "", "batch": 6},
    "web": {"widths": [1920, 960], "format": "webp", "quality": 82, "max_kb": 400},
    "scripts": {}, "baseline": {"scene": "", "etalon": "", "environment": ""},
    "site": {"lat": None, "lon": None, "north_offset_deg": 0.0, "datum_note": ""},
    "export": {"id_property": "", "reference": {"object": "", "size": []}, "required_surfaces": []},
}


def die(msg, code=1):
    print(msg)
    sys.exit(code)


class Journal:
    def __init__(self, root):
        self.root = root
        self.path = os.path.join(root, "journal.jsonl")

    def events(self):
        if not os.path.exists(self.path):
            return []
        out = []
        with open(self.path, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    try:
                        out.append(json.loads(line))
                    except ValueError:
                        out.append({"type": "torn", "n": len(out) + 1, "prev": "", "hash": ""})
        return out

    def lock(self):
        """One writer at a time: the next number and the previous hash are read before the line is written."""
        os.makedirs(self.root, exist_ok=True)
        path, until = self.path + ".lock", time.time() + 15
        while True:
            try:
                fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(fd, str(os.getpid()).encode())
                os.close(fd)
                return path
            except FileExistsError:
                try:
                    if time.time() - os.path.getmtime(path) > 30:  # left behind by a session that died
                        os.remove(path)
                        continue
                except OSError:
                    continue
                if time.time() > until:
                    die("The journal is locked by another session: %s" % path)
                time.sleep(0.05)

    @staticmethod
    def digest(prev, body):
        raw = prev + json.dumps(body, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]

    def verify(self):
        prev = ""
        for i, e in enumerate(self.events()):
            body = {k: v for k, v in e.items() if k != "hash"}
            if e.get("prev") != prev or e.get("hash") != self.digest(prev, body):
                return i + 1
            prev = e["hash"]
        return 0

    def add(self, type_, **kw):
        lock = self.lock()
        try:
            bad = self.verify()
            if bad:
                die("JOURNAL BROKEN at line %d: a line was edited or cut off. Stop and tell the user." % bad)
            ev = self.events()
            prev = ev[-1]["hash"] if ev else ""
            body = {"n": len(ev) + 1, "ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "type": type_, "prev": prev}
            body.update({k: v for k, v in kw.items() if v is not None})
            body["hash"] = self.digest(prev, body)
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(json.dumps(body, ensure_ascii=False) + "\n")
            return body
        finally:
            os.remove(lock)


def load_json(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def load_routes(root):
    return load_json(os.path.join(root, "routes.json"), DEFAULT_ROUTES)


def route_of(routes, name):
    r = routes["routes"][name]
    return r if isinstance(r, dict) else {"steps": r, "checks": [], "approve_brief": False}  # 0.1 files were plain lists


# ---- the brief: what "done" means, agreed before any work -------------------------------------
def brief_path(root, item):
    return os.path.join(root, "work", item, "brief.md")


def parse_brief(text):
    sec, cur = {}, None
    for line in text.splitlines():
        if line.startswith("## "):
            word = re.sub(r"[^a-z]", " ", line[3:].lower()).split()
            cur = next((k for k in SECTIONS if word and word[0] == k), None)
            if cur:
                sec[cur] = []
        elif cur and line.strip() and not line.strip().startswith("("):
            sec[cur].append(line.strip())
    return sec


def check_brief(text, known=()):
    """Problems that make a brief unusable. An empty list means agents can work from it without asking again."""
    sec, out = parse_brief(text), []
    for k in SECTIONS:
        if not sec.get(k):
            out.append("section '%s' is empty" % k.capitalize())
    crit = [l for l in sec.get("acceptance", []) if re.match(r"\d+[.)]\s*\S", l)]
    if not crit:
        out.append("Acceptance has no numbered criterion")
    if len(crit) > 9:
        out.append("Acceptance has %d criteria; more than 9 means this is several items" % len(crit))
    checks = []
    for l in crit:
        num = l.split(".")[0].split(")")[0]
        tags = TAG.findall(l)
        if len(tags) != 1:
            out.append("criterion %s needs exactly one tag: [check: ...], [look: ...] or [user: ...]" % num)
            continue
        kind, body = tags[0][0], tags[0][1].strip()
        if kind == "check":
            m = re.match(r"([\w.\-]+)(?:\s*(<=|>=|==|<|>)\s*(-?[\d.]+))?$", body)
            if not m:
                out.append("criterion %s: write the check as '<check id>' or '<check id> <= number'" % num)
            else:
                checks.append(m.group(1))
                if known and m.group(1) not in known:
                    out.append("criterion %s: no check named '%s' (known: %s)" % (num, m.group(1), ", ".join(sorted(known))))
        else:
            low = l.lower()
            vague = [w for w in VAGUE if w in low]
            if vague and "ref" not in low and not re.search(r"\d", TAG.sub("", l).split(".", 1)[-1]):
                out.append("criterion %s says '%s' without saying what is seen: name the reference it must match, or a property and a number" % (num, vague[0]))
            if kind == "look" and not sec.get("views"):
                out.append("criterion %s is a [look] but Views names no camera or frame to look from" % num)
    return out, checks, len(crit)


def brief_state(j, root, item, events):
    """(hash now, approved hash, changes after approval)."""
    p = brief_path(root, item)
    now = hashlib.sha256(open(p, "rb").read()).hexdigest()[:12] if os.path.exists(p) else None
    mine = [e for e in events if e.get("item") == item and e["type"] == "brief.ok"]
    return now, (mine[-1]["brief"] if mine else None), max(0, len(mine) - 1)


KNOWN_CHECKS = ["export.scale", "export.position", "export.ids", "export.surfaces", "export.counts", "export.duplicates", "export.budget",
                "junction.step", "junction.gap", "environment.unchanged", "materials.etalon", "materials.uv", "materials.tile_size",
                "cameras.required", "cameras.lens", "cameras.frame", "cameras.clip", "cameras.orbit", "render.settings", "render.sun",
                "terrain_holes", "height_limit", "missing_textures", "etalon_materials", "no_material", "negative_scale", "images", "invariants",
                "inverted_normals", "floating", "intersections", "orphans", "txn.contract", "index"]


# ---- state, computed by replaying the journal ---------------------------------------------------
def state(j, routes, item=None, events=None):
    """Replay the journal for the open item (or for `item`, open or closed). None if there is none."""
    s, last = None, None
    for e in (events if events is not None else j.events()):
        t = e["type"]
        if t == "open":
            if item is not None and e["item"] != item:
                continue
            ro = route_of(routes, e["route"])
            steps = [dict(x) for x in ro["steps"]]
            s = {"item": e["item"], "route": e["route"], "title": e.get("title", ""), "steps": steps, "checks": list(ro.get("checks", [])),
                 "approve": ro.get("approve_brief", False), "pending": [x["id"] for x in steps], "running": None, "fails": {},
                 "rework": 0, "reworked": {}, "question": None, "gate": None, "need_verdict": False, "passed": False, "closed": False,
                 "forced": 0, "notes": [], "ticks": [], "tokens": [], "since": 0, "evidence": {}, "waived": {}, "proof_n": 0,
                 "attempts": {}, "accepted": None, "remarks": [], "previews": 0, "ends": []}
            last = s
            continue
        if s is None or e.get("item") != s["item"]:
            continue
        if t == "start":
            s["running"], s["since"] = e["step"], e["n"]
            s["forced"] += 1 if e.get("forced") else 0
            s["attempts"][e["step"]] = s["attempts"].get(e["step"], 0) + 1
            if e["step"] == "proof":
                s["proof_n"], s["evidence"] = e["n"], {}  # evidence counts only when reproduced in this proof run
        elif t == "end":
            s["running"] = None
            s["tokens"].append((e.get("agent", "?"), e.get("model", "?"), e.get("tokens") or 0))
            s["ends"].append(e)
            if e["status"] == "DONE":
                s["fails"].pop(e["step"], None)  # back down the ladder after a success
                if e["step"] in s["pending"]:
                    s["pending"].remove(e["step"])
                step = next(x for x in s["steps"] if x["id"] == e["step"])
                if step.get("gate"):
                    s["gate"] = (e["step"], step["gate"])
                if e["step"] == "proof":
                    s["need_verdict"] = True
            elif e["status"] == "BLOCKED":
                s["fails"][e["step"]] = s["fails"].get(e["step"], 0) + 1
            else:
                s["question"] = e.get("question") or "(no question recorded)"
        elif t == "answer":
            s["question"] = None
            if s["gate"]:
                step_id = s["gate"][0]
                s["gate"] = None
                if e.get("no"):  # the preview was not approved: the same step again, with the remarks
                    s["previews"] += 1
                    s["pending"].insert(0, step_id)
                    s["fixes"] = ["%s:preview: %s" % (next(x for x in s["steps"] if x["id"] == step_id)["agent"], e["no"])]
        elif t == "evidence":
            if s["running"] == "proof":
                s["evidence"][e["check"]] = e["status"]
        elif t == "waive":
            s["waived"][e["check"]] = e.get("by", "?")
        elif t == "verdict":
            s["need_verdict"] = False
            if e["verdict"] == "PASS":
                s["passed"], s["pending"] = True, []
            elif e["verdict"] == "REWORK":
                s["rework"] += 1
                owners = [f.split(":")[0] for f in e.get("fix", [])]
                for a in owners:
                    s["reworked"][a] = s["reworked"].get(a, 0) + 1
                redo = [x["id"] for x in s["steps"] if x["id"] != "proof" and ({x["agent"], x.get("else", {}).get("agent")} & set(owners))]
                s["pending"] = redo + ["proof"]
                s["fixes"] = e.get("fix", [])
            else:
                s["question"] = e.get("question") or "The inspector needs a decision."
        elif t == "note":
            s["notes"].append((e["n"], e["text"]))
        elif t == "tick":
            s["ticks"].append(e)
        elif t == "close":
            s["closed"] = True
            if item is None:
                s = None
        elif t == "accept":
            s["accepted"] = True
        elif t == "remark":
            s["remarks"].append(e)
    return s if item is None else last


def actor(root, step):
    """Who runs the step now: the operator when the project has a registered script for it, else the builder."""
    if step.get("script") and step.get("else"):
        scripts = load_json(os.path.join(root, "project.json"), {}).get("scripts", {})
        if not scripts.get(step["script"]) and step["script"] not in BUILTIN_MODES:
            return step["else"]["agent"], step["else"].get("model", "sonnet"), "no registered script for '%s' yet" % step["script"]
    return step["agent"], step.get("model", "sonnet"), "route default"


def model_for(root, s, step):
    agent, base, why = actor(root, step)
    i = LADDER.index(base) if base in LADDER else 1
    if s["fails"].get(step["id"], 0) >= 2 or s["reworked"].get(agent, 0) >= 2:
        i, why = min(i + 1, len(LADDER) - 1), "escalated one step: 2 failed attempts"
    return agent, LADDER[i], why


def caps(j, routes, s):
    c = dict(routes.get("caps", {}))
    c.update(load_json(os.path.join(j.root, "work", s["item"], "caps.json"), {}))
    return c


def required_checks(j, s):
    p = brief_path(j.root, s["item"])
    extra = check_brief(open(p, encoding="utf-8").read())[1] if os.path.exists(p) else []
    return list(dict.fromkeys(s["checks"] + extra))


def missing_evidence(j, s):
    return [c for c in required_checks(j, s) if s["evidence"].get(c) != "OK" and c not in s["waived"]]


def brief_blocker(j, s):
    """Why work may not go on yet, or None."""
    if "order" in s["pending"]:
        return None
    p = brief_path(j.root, s["item"])
    if not os.path.exists(p):
        return "BRIEF MISSING: work/%s/brief.md was not written. Send the order step back." % s["item"]
    problems = check_brief(open(p, encoding="utf-8").read(), KNOWN_CHECKS)[0]
    if problems:
        return "BRIEF NOT USABLE (%d problems) - fix work/%s/brief.md, then: archflow.py brief check\n  - %s" % (len(problems), s["item"], "\n  - ".join(problems[:8]))
    now, ok, _ = brief_state(j, j.root, s["item"], j.events())
    if ok == now:
        return None
    if not s["approve"]:
        return "RECORD THE BRIEF: archflow.py brief approve --by auto   (this route needs no sign-off)"
    return "ASK THE USER: %s work/%s/brief.md - show it in full and ask for approval or corrections. Then: archflow.py brief approve --by <name>" % (
        "the brief CHANGED after it was approved;" if ok else "approve the brief", s["item"])


def cmd_next(j, routes, a):
    s = state(j, routes)
    if s is None:
        die("NO OPEN ITEM. Open one: archflow.py open <ITEM> --route <%s>   (or: archflow.py plan)" % "|".join(routes["routes"]), 0)
    if s["question"]:
        die("ASK THE USER: " + s["question"], 0)
    if s["running"]:
        step = next(x for x in s["steps"] if x["id"] == s["running"])
        print("RESUME step=%s agent=%s item=%s  (started, never ended - do not restart it)" % (step["id"], model_for(j.root, s, step)[0], s["item"]))
        for n, text in [x for x in s["notes"] if x[0] > s["since"]][-6:]:
            print("  note: " + text)
        for t in [t for t in s["ticks"] if t["n"] > s["since"] and not t["ok"]][-3:]:
            print("  failed: " + t["label"])
        return
    if s["gate"]:
        die("ASK THE USER: approve %s of %s before the expensive step. Yes: archflow.py answer   No: archflow.py answer --no \"<their remarks>\"" % (s["gate"][1], s["item"]), 0)
    if s["need_verdict"]:
        miss = missing_evidence(j, s)
        die("RECORD VERDICT: archflow.py verdict PASS|REWORK|NEEDS-USER  (first line of work/%s/proof.md)%s" %
            (s["item"], "\n  PASS will be refused: no reproduced OK for %s" % ", ".join(miss) if miss else ""), 0)
    if s["passed"]:
        die("CLOSE: archflow.py close", 0)
    block = brief_blocker(j, s)
    if block:
        die(block, 0)
    if s["rework"] > routes.get("rework_max", 2):
        die("ASK THE USER: item %s was sent back %d times; re-plan instead of patching." % (s["item"], s["rework"]), 0)
    step = next(x for x in s["steps"] if x["id"] == s["pending"][0])
    agent, model, why = model_for(j.root, s, step)
    redo = s["attempts"].get(step["id"], 0) > 0 and step["id"] != "proof" and s.get("fixes")
    mode = "rework" if redo else step.get("mode", "")
    print("AGENT %s  step=%s  mode=%s  model=%s (%s)  item=%s" % (agent, step["id"], mode, model, why, s["item"]))
    if mode == "rework":
        print("  fixes: " + "; ".join(s.get("fixes", [])) + ("" if step.get("mode") in (None, "", "build") else "   (the step's own mode is '%s')" % step.get("mode")))
    if step["id"] == "proof":
        print("  must be reproduced in this run: " + (", ".join(required_checks(j, s)) or "the criteria of the brief"))


def need(j, routes):
    s = state(j, routes)
    if s is None:
        die("No open item.")
    return s


def cmd_ledger(j, routes, a, s=None):
    s = s or need(j, routes)
    c = caps(j, routes, s)
    runs = len(s["ticks"])
    minutes = sum(t.get("sec", 0) for t in s["ticks"]) / 60.0
    print("item %s  route %s  rework %d  preview rounds %d  forced %d" % (s["item"], s["route"], s["rework"], s["previews"], s["forced"]))
    print("runs %d/%s  minutes %.1f/%s  failed runs %d" %
          (runs, c.get("runs", "-"), minutes, c.get("minutes", "-"), sum(1 for t in s["ticks"] if not t["ok"])))
    by = {}
    for agent, model, tok in s["tokens"]:
        by[(agent, model)] = by.get((agent, model), 0) + tok
    total = sum(by.values()) or 1
    for (agent, model), tok in sorted(by.items(), key=lambda x: -x[1]):
        print("  %-20s %-7s %8d tokens  %3d%%" % (agent, model, tok, round(100 * tok / total)))
    cheap = sum(v for (ag, m), v in by.items() if m == "haiku")
    print("tokens %d  on haiku %d%%" % (sum(by.values()), round(100 * cheap / total)))


# ---- quality: how well the agents, the inspector and the briefs are doing ----------------------
def cmd_quality(j, routes, a):
    ev = j.events()
    items = [e["item"] for e in ev if e["type"] == "open"]
    states = [state(j, routes, item=i, events=ev) for i in items]
    closed = [s for s in states if s and s["closed"]]
    if not closed:
        die("No closed item yet: quality is read from finished work.", 0)
    MIN = 5
    pct = lambda k, n: "%d%%" % round(100.0 * k / n) if n else "-"
    first = sum(1 for s in closed if s["rework"] == 0)
    judged = [s for s in closed if s["accepted"] or s["remarks"]]
    clean = sum(1 for s in judged if not s["remarks"])
    print("ITEMS  closed %d  passed inspection first time %s  accepted by the user without remarks %s (%d judged)" %
          (len(closed), pct(first, len(closed)), pct(clean, len(judged)), len(judged)))
    rows = {}
    for s in closed:
        sent = {}
        for e in ev:
            if e["type"] == "verdict" and e.get("item") == s["item"] and e["verdict"] == "REWORK":
                for f in e.get("fix", []):
                    sent[f.split(":")[0]] = sent.get(f.split(":")[0], 0) + 1
        seen = set()
        for e in s["ends"]:
            k = (e.get("agent", "?"), e.get("model", "?"))
            r = rows.setdefault(k, {"items": 0, "runs": 0, "blocked": 0, "sent": 0, "tokens": 0})
            r["runs"] += 1
            r["blocked"] += e["status"] == "BLOCKED"
            r["tokens"] += e.get("tokens") or 0
            if k not in seen:
                seen.add(k)
                r["items"] += 1
                r["sent"] += 1 if sent.get(k[0]) else 0
    print("AGENTS  (sent back = items where the inspector returned this agent's work)")
    for (agent, model), r in sorted(rows.items()):
        if agent == "viz-inspector":
            continue
        rate = r["sent"] / r["items"] if r["items"] else 0
        word = ("not enough data (fewer than %d items)" % MIN if r["items"] < MIN else
                "reliable on this model" if rate <= 0.1 else
                "raise this step one model up in routes.json" if rate > 0.3 else "watch")
        print("  %-19s %-7s items %2d  sent back %-4s blocked %d  tokens/item %6d  -> %s" %
              (agent, model, r["items"], pct(r["sent"], r["items"]), r["blocked"], r["tokens"] / max(1, r["items"]), word))
    cause = {"agent": 0, "brief": 0, "taste": 0}
    for s in closed:
        for r in s["remarks"]:
            cause[r.get("cause", "agent")] = cause.get(r.get("cause", "agent"), 0) + 1
    esc = sum(1 for s in closed if any(r.get("cause") == "agent" for r in s["remarks"]))
    print("INSPECTOR  passed %d items; the user then found a defect in %d (%s)%s" %
          (len(closed), esc, pct(esc, len(closed)),
           "" if len(closed) >= MIN else "  -> not enough data") )
    if esc:
        print("  each such defect should become a check: add it to tools/project/ and to the route's checks")
    changed = sum(brief_state(j, j.root, s["item"], ev)[2] for s in closed)
    print("BRIEFS  remarks caused by a missing criterion %d  ·  briefs changed after approval %d  ·  new wishes after acceptance %d" %
          (cause.get("brief", 0), changed, cause.get("taste", 0)))
    if cause.get("brief", 0):
        print("  a missing criterion is a brief problem, not an agent problem: add the criterion to references/stages.md for that route")
    waived = sum(len(s["waived"]) for s in closed)
    forced = sum(s["forced"] for s in closed)
    prev = sum(s["previews"] for s in closed)
    print("TRUST  checks waived %d  ·  forced steps %d  ·  preview rounds before approval %d" % (waived, forced, prev))
    by = {}
    for s in closed:
        for agent, model, tok in s["tokens"]:
            by[model] = by.get(model, 0) + tok
    total = sum(by.values())
    if total:
        print("COST  tokens %d  ·  %s" % (total, "  ".join("%s %s" % (m, pct(t, total)) for m, t in sorted(by.items(), key=lambda x: -x[1]))))
    print("This counts what was checked. Defects nobody reported are not in it.")


def flat(d, pre=""):
    out = {}
    for k, v in (d.items() if isinstance(d, dict) else enumerate(d)):
        key = "%s.%s" % (pre, k) if pre else str(k)
        if isinstance(v, (dict, list)):
            out.update(flat(v, key))
        else:
            out[key] = v
    return out


def cmd_plan(j, routes, a):
    path = os.path.join(j.root, "plan.json")
    if a.kind:
        if a.kind not in routes.get("plans", {}):
            die("Unknown plan. Choose: " + ", ".join(routes.get("plans", {})))
        plan = load_json(path, [])
        used = {p["item"] for p in plan} | {e["item"] for e in j.events() if e["type"] == "open"}
        rows = routes["plans"][a.kind]
        ids = ["%s-%02d" % (a.prefix, i + 1) for i in range(len(rows))]
        if used & set(ids):
            die("Refused: ids with prefix %s are in use; pass another --prefix." % a.prefix)
        plan += [{"item": ids[i], "route": r[0], "title": r[1], "needs": [ids[n - 1] for n in r[2]]} for i, r in enumerate(rows)]
        with open(path, "w", encoding="utf-8") as f:
            json.dump(plan, f, indent=1, ensure_ascii=False)
    plan = load_json(path, [])
    if not plan:
        die("No plan. Start one: archflow.py plan new-project --prefix N1   or   archflow.py plan model-change --prefix C1", 0)
    ev = j.events()
    closed = {e["item"] for e in ev if e["type"] == "close"}
    opened = {e["item"] for e in ev if e["type"] == "open"}
    nxt = None
    for p in plan:
        st = "done" if p["item"] in closed else "open" if p["item"] in opened else "ready" if all(n in closed for n in p["needs"]) else "waits for " + ", ".join(n for n in p["needs"] if n not in closed)
        if st == "ready" and nxt is None:
            nxt = p
        print("  %-8s %-13s %-9s %s" % (p["item"], p["route"], st if len(st) < 9 else "waits", p["title"] + ("" if len(st) < 9 else "  (%s)" % st)))
    if nxt and not (opened - closed):
        print("NEXT: archflow.py open %s" % nxt["item"])


BUILTIN_MODES = ("pack", "preview", "render")  # modes whose tool ships with the plugin
# A domain file next to this script replaces the routes, the checks and the project template:
# the same journal engine serves any kind of work whose result can be checked.
_DOMAIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "domain.json")
if os.path.exists(_DOMAIN):
    with open(_DOMAIN, encoding="utf-8") as _f:
        _d = json.load(_f)
    DEFAULT_ROUTES = _d.get("routes", DEFAULT_ROUTES)
    KNOWN_CHECKS = _d.get("checks", KNOWN_CHECKS)
    PROJECT_TEMPLATE = _d.get("project", PROJECT_TEMPLATE)
    BUILTIN_MODES = tuple(_d.get("builtin_modes", BUILTIN_MODES))


def main():
    ap = argparse.ArgumentParser(prog="archflow.py")
    ap.add_argument("--root", default=os.environ.get("VIZ_ROOT", "_viz"))
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init")
    p = sub.add_parser("open"); p.add_argument("item"); p.add_argument("--route"); p.add_argument("--title", default=""); p.add_argument("--force", metavar="REASON")
    for name in ("next", "status", "ledger", "verify", "close", "quality"):
        sub.add_parser(name)
    p = sub.add_parser("plan"); p.add_argument("kind", nargs="?"); p.add_argument("--prefix", default="N1")
    p = sub.add_parser("brief"); p.add_argument("action", choices=["new", "check", "approve"]); p.add_argument("--by"); p.add_argument("--file")
    p = sub.add_parser("start"); p.add_argument("step"); p.add_argument("--force", default=None, metavar="REASON")
    p = sub.add_parser("end"); p.add_argument("step"); p.add_argument("--status", required=True, choices=["DONE", "BLOCKED", "NEEDS-USER"])
    p.add_argument("--tokens", type=int); p.add_argument("--model"); p.add_argument("--question")
    p = sub.add_parser("note"); p.add_argument("text")
    p = sub.add_parser("tick"); p.add_argument("label"); p.add_argument("--fail", action="store_true"); p.add_argument("--sec", type=float, default=0)
    p = sub.add_parser("evidence"); p.add_argument("check", nargs="?"); p.add_argument("--status", choices=["OK", "FAIL", "SKIP"]); p.add_argument("--from", dest="src"); p.add_argument("--value")
    p = sub.add_parser("waive"); p.add_argument("check"); p.add_argument("--by", required=True); p.add_argument("--reason", required=True)
    p = sub.add_parser("verdict"); p.add_argument("verdict", choices=["PASS", "REWORK", "NEEDS-USER"])
    p.add_argument("--fix", default=""); p.add_argument("--question")
    p = sub.add_parser("answer"); p.add_argument("--no", metavar="REMARKS")
    p = sub.add_parser("accept"); p.add_argument("item"); p.add_argument("--by", required=True)
    p = sub.add_parser("remark"); p.add_argument("item"); p.add_argument("text"); p.add_argument("--cause", required=True, choices=["agent", "brief", "taste"])
    p = sub.add_parser("diff"); p.add_argument("before"); p.add_argument("after"); p.add_argument("--only", default="")
    a = ap.parse_args()
    j = Journal(a.root)
    routes = load_routes(a.root)

    if a.cmd == "init":
        os.makedirs(os.path.join(a.root, "work"), exist_ok=True)
        for name, data in (("routes.json", DEFAULT_ROUTES), ("project.json", PROJECT_TEMPLATE)):
            p = os.path.join(a.root, name)
            if not os.path.exists(p):
                with open(p, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
        print("ready: %s  (fill project.json before the first item)" % a.root)
    elif a.cmd == "verify":
        bad = j.verify()
        die("JOURNAL BROKEN at line %d" % bad) if bad else print("journal intact: %d events" % len(j.events()))
    elif a.cmd == "plan":
        cmd_plan(j, routes, a)
    elif a.cmd == "quality":
        cmd_quality(j, routes, a)
    elif a.cmd == "open":
        cur = state(j, routes)
        if cur is not None:
            die("Refused: item %s is still open. One item at a time." % cur["item"])
        planned = next((p for p in load_json(os.path.join(a.root, "plan.json"), []) if p["item"] == a.item), None)
        route = a.route or (planned or {}).get("route")
        if route not in routes["routes"]:
            die("Choose a route: " + ", ".join(routes["routes"]))
        if any(e["type"] == "open" and e["item"] == a.item for e in j.events()):
            die("Refused: item id %s was used before." % a.item)
        closed = {e["item"] for e in j.events() if e["type"] == "close"}
        waits = [n for n in (planned or {}).get("needs", []) if n not in closed]
        if waits and not a.force:
            die("Refused: %s needs %s closed first (see: archflow.py plan)." % (a.item, ", ".join(waits)))
        os.makedirs(os.path.join(a.root, "work", a.item), exist_ok=True)
        bp = brief_path(a.root, a.item)
        if not os.path.exists(bp):
            with open(bp, "w", encoding="utf-8") as f:
                f.write(BRIEF_TEMPLATE.format(item=a.item, route=route))
        j.add("open", item=a.item, route=route, title=a.title or (planned or {}).get("title", ""), forced=a.force)
        print("opened %s on route %s; brief template: work/%s/brief.md" % (a.item, route, a.item))
    elif a.cmd == "brief":
        s = need(j, routes)
        bp = a.file or brief_path(a.root, s["item"])
        if a.action == "new":
            if os.path.exists(bp):
                die("Refused: %s exists." % bp)
            with open(bp, "w", encoding="utf-8") as f:
                f.write(BRIEF_TEMPLATE.format(item=s["item"], route=s["route"]))
            return print("written: " + bp)
        if not os.path.exists(bp):
            die("No brief at %s" % bp)
        problems, checks, n = check_brief(open(bp, encoding="utf-8").read(), KNOWN_CHECKS)
        if problems:
            die("BRIEF NOT USABLE - %d problems:\n  - %s" % (len(problems), "\n  - ".join(problems)))
        if a.action == "check":
            return print("brief usable: %d criteria, %d measured by checks (%s)" % (n, len(checks), ", ".join(checks) or "none"))
        if not a.by:
            die("Refused: --by <who approved it>.")
        if s["approve"] and a.by == "auto":
            die("Refused: this route needs the requester's approval of the brief, not 'auto'.")
        now, ok, _ = brief_state(j, a.root, s["item"], j.events())
        if ok == now:
            return print("brief already approved in this form")
        j.add("brief.ok", item=s["item"], brief=now, by=a.by, criteria=n, changed=bool(ok) or None)
        print("brief approved by %s: %d criteria%s" % (a.by, n, "  (CHANGED after an earlier approval - counted)" if ok else ""))
    elif a.cmd == "next":
        cmd_next(j, routes, a)
    elif a.cmd == "status":
        s = state(j, routes)
        if s is None:
            die("no open item; %d events in the journal" % len(j.events()), 0)
        print("item %s (%s) route %s | pending: %s | running: %s | rework %d | passed %s" %
              (s["item"], s["title"], s["route"], ",".join(s["pending"]) or "-", s["running"] or "-", s["rework"], s["passed"]))
    elif a.cmd == "ledger":
        cmd_ledger(j, routes, a)
    elif a.cmd == "start":
        s = need(j, routes)
        if s["running"]:
            die("Refused: step %s is running. Resume it (archflow.py next)." % s["running"])
        expected = s["pending"][0] if s["pending"] else None
        block = brief_blocker(j, s) if a.step != "order" else None
        if (a.step != expected or s["question"] or s["need_verdict"] or s["gate"] or block) and not a.force:
            die("Refused: %s. Run: archflow.py next" % ("the brief is not approved" if block else "the next step is %s, not %s" % (expected, a.step)))
        step = next((x for x in s["steps"] if x["id"] == a.step), None) or die("No step '%s' on this route." % a.step)
        agent, model, _ = model_for(a.root, s, step)
        j.add("start", item=s["item"], step=a.step, agent=agent, model=model, forced=a.force)
        print("started %s (%s on %s)" % (a.step, agent, model))
    elif a.cmd == "end":
        s = need(j, routes)
        if s["running"] != a.step:
            die("Refused: step %s is not running." % a.step)
        if a.status == "NEEDS-USER" and not a.question:
            die("Refused: NEEDS-USER needs --question.")
        started = [e for e in j.events() if e["type"] == "start" and e.get("item") == s["item"] and e["step"] == a.step][-1]
        j.add("end", item=s["item"], step=a.step, status=a.status, tokens=a.tokens, agent=started.get("agent"),
              model=a.model or started.get("model"), question=a.question)
        print("ended %s: %s" % (a.step, a.status))
    elif a.cmd == "note":
        s = need(j, routes)
        j.add("note", item=s["item"], text=a.text[:200])
    elif a.cmd == "tick":
        s = need(j, routes)
        j.add("tick", item=s["item"], label=a.label, ok=not a.fail, sec=a.sec)
        s = need(j, routes)
        c = caps(j, routes, s)
        tail = [t for t in s["ticks"] if t["label"] == a.label][-3:]
        if len(tail) == 3 and not any(t["ok"] for t in tail):
            die("LOOP: '%s' failed 3 times in a row. Stop, report BLOCKED." % a.label, 3)
        if len(s["ticks"]) >= c.get("runs", 10 ** 9):
            die("CAP: %d runs spent. Stop, report BLOCKED." % len(s["ticks"]), 3)
        if sum(t.get("sec", 0) for t in s["ticks"]) / 60.0 >= c.get("minutes", 10 ** 9):
            die("CAP: minutes spent. Stop, report BLOCKED.", 3)
    elif a.cmd == "evidence":
        s = need(j, routes)
        if s["running"] != "proof":
            die("Refused: evidence is recorded by the inspector, while the proof step runs - a result quoted from an earlier step proves nothing.")
        rows = {}
        if a.src:
            for k, v in load_json(a.src, {}).items():
                st = v.get("status") if isinstance(v, dict) else v
                if st in ("OK", "FAIL", "SKIP"):
                    rows[k] = st
        elif a.check and a.status:
            rows[a.check] = a.status
        else:
            die("evidence <check> --status OK|FAIL|SKIP   or   evidence --from <results.json>")
        for k, st in rows.items():
            j.add("evidence", item=s["item"], check=k, status=st, value=a.value)
        need_ = required_checks(j, s)
        print("recorded %d: %s" % (len(rows), "  ".join("%s=%s" % kv for kv in rows.items() if kv[0] in need_ or kv[1] != "OK") or "all OK"))
    elif a.cmd == "waive":
        s = need(j, routes)
        j.add("waive", item=s["item"], check=a.check, by=a.by, reason=a.reason)
        print("waived %s for %s by %s - it stays on the record and in the quality report" % (a.check, s["item"], a.by))
    elif a.cmd == "verdict":
        s = need(j, routes)
        if not s["need_verdict"]:
            die("Refused: no finished proof step is waiting for a verdict.")
        fix = [f for f in a.fix.split(",") if f]
        agents = {x["agent"] for x in s["steps"]} | {x["else"]["agent"] for x in s["steps"] if x.get("else")}
        if a.verdict == "REWORK" and (not fix or any(f.split(":")[0] not in agents for f in fix)):
            die("Refused: REWORK needs --fix agent:cause,... with agents of this route: " + ", ".join(sorted(agents)))
        if a.verdict == "PASS":
            miss = missing_evidence(j, s)
            if miss:
                die("Refused: PASS without a reproduced OK for: %s.\n  A check that failed, was skipped or was not run has not passed. Run it in the proof step, send the work back (REWORK),\n  or let the user decide: archflow.py waive <check> --by <name> --reason \"...\"" %
                    ", ".join("%s (%s)" % (c, s["evidence"].get(c, "not run")) for c in miss))
        j.add("verdict", item=s["item"], verdict=a.verdict, fix=fix or None, question=a.question)
        print("verdict %s" % a.verdict)
    elif a.cmd == "answer":
        s = need(j, routes)
        if a.no and not s["gate"]:
            die("Refused: --no answers a preview gate; nothing is waiting for one.")
        j.add("answer", item=s["item"], no=a.no)
        print("recorded" + (": the step is repeated with the remarks" if a.no else ""))
    elif a.cmd == "close":
        s = need(j, routes)
        if not s["passed"]:
            die("Refused: no PASS from the inspector. An item closes only on evidence.")
        cmd_ledger(j, routes, a)
        j.add("close", item=s["item"], forced=s["forced"] or None, waived=sorted(s["waived"]) or None)
        print("closed %s%s%s" % (s["item"], "  (WARNING: %d forced steps - say so in the report)" % s["forced"] if s["forced"] else "",
                                 "  (waived: %s)" % ", ".join(sorted(s["waived"])) if s["waived"] else ""))
        print("ask the user to look at the result, then record it: archflow.py accept %s --by <name>   or   archflow.py remark %s \"...\" --cause agent|brief|taste" % (s["item"], s["item"]))
    elif a.cmd in ("accept", "remark"):
        s = state(j, routes, item=a.item)
        if s is None or not s["closed"]:
            die("Refused: %s is not a closed item. During work, remarks go through the inspector (REWORK) or a preview answer." % a.item)
        if a.cmd == "accept":
            j.add("accept", item=a.item, by=a.by)
            print("accepted %s by %s" % (a.item, a.by))
        else:
            j.add("remark", item=a.item, text=a.text[:300], cause=a.cause)
            print({"agent": "recorded as a defect the inspector let through. Open a 'fix' item for it, and turn it into a check.",
                   "brief": "recorded as a missing criterion: the brief did not ask for it. Open a new item, and add the criterion to the stage defaults.",
                   "taste": "recorded as a new wish, not a defect. Open a new item for it."}[a.cause])
    elif a.cmd == "diff":
        x, y = flat(load_json(a.before, {})), flat(load_json(a.after, {}))
        keys = [k for k in sorted(set(x) | set(y)) if x.get(k) != y.get(k) and (not a.only or any(k.startswith(o) for o in a.only.split(",")))]
        for k in keys[:40]:
            print("%s: %r -> %r" % (k, x.get(k, "<absent>"), y.get(k, "<absent>")))
        print("changed keys: %d%s" % (len(keys), " (first 40 shown)" if len(keys) > 40 else ""))
        sys.exit(1 if keys else 0)


if __name__ == "__main__":
    main()
