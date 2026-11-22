#!/usr/bin/env python3
"""vizflow - append-only, hash-chained journal for visualization work items.
State, next step, model and cost are computed from the journal, never remembered.
Beyond the item flow: `stale` (which proofs a change sends back, by scope), `memory` (lessons tied
to a place in the project) and `cost` (render, person and farm time next to tokens).
Python 3.8+, standard library only.  Usage: vizflow.py [--root DIR] <command> ...
Exit codes: 0 ok, 1 refused, 3 cap spent or loop (stop and report BLOCKED)."""
import argparse, hashlib, json, os, re, socket, sys, time
try:
    import safe  # shared with the tools: foreign text is data
except ImportError:
    safe = None

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import efficiency  # noqa: E402  (next to this script)
import echo_check  # noqa: E402  (next to this script; FacetKit plan 2.9)
import gates  # noqa: E402  (next to this script; FacetKit plan 2.10)

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
    "release": ["pack"],  # routes that put work in front of other people: refused while proofs sent back by a change wait
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
                   checks=["export.scale", "export.ids", "export.duplicates", "swap.kept", "materials.etalon", "junction.step", "invariants"]),
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
    "rates": {"currency": "", "render_hour": None, "farm_hour": None, "person_hour": None, "tokens_1k": {}},
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
        """One writer at a time: the next number and the previous hash are read before the line is written.
        A lock is taken over only when its owner is known to be gone - never because it is old."""
        os.makedirs(self.root, exist_ok=True)
        path, until, owner = self.path + ".lock", time.time() + float(os.environ.get("FLOW_LOCK_WAIT", "20")), []
        me = "%d %s" % (os.getpid(), socket.gethostname())
        while True:
            try:
                fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(fd, me.encode())
                os.close(fd)
                return path
            except (FileExistsError, PermissionError):
                # Windows: a lock file that another session is deleting cannot be opened or created for a moment
                # (PermissionError, not FileExistsError) - that is the same contention, so wait for it like any other
                try:
                    with open(path, encoding="utf-8") as f:
                        owner = f.read().split(None, 1)
                    here = len(owner) == 1 or (len(owner) == 2 and owner[1].strip() == socket.gethostname())  # a bare number: written by an earlier version, on this computer
                    if owner and owner[0].isdigit() and here and not alive(int(owner[0])):
                        os.remove(path)  # the session that held it died on this computer
                        continue
                    if not owner and time.time() - os.path.getmtime(path) > 60:
                        os.remove(path)  # no owner was ever written: a session died while taking it. A writer holds the lock for milliseconds
                        continue
                except (OSError, ValueError):
                    pass
                if time.time() > until:
                    die("The journal is locked by another session (%s) that is still running or is on another computer.\n"
                        "  Wait for it. If you are sure it is gone, delete this file by hand: %s" % (" ".join(owner) or "owner unknown", path))
                time.sleep(0.05)

    @staticmethod
    def digest(prev, body):
        raw = prev + json.dumps(body, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def verify(self):
        """0 when the chain holds, else the number of the first line that does not. Lines written by earlier
        versions carry a hash cut to 16 characters; they are checked at that length and never rewritten."""
        prev = ""
        for i, e in enumerate(self.events()):
            body = {k: v for k, v in e.items() if k != "hash"}
            h = str(e.get("hash") or "")
            if e.get("prev") != prev or len(h) not in (16, 64) or h != self.digest(prev, body)[:len(h)]:
                return i + 1
            prev = h
        return 0

    def head(self):
        ev = self.events()
        return (len(ev), ev[-1]["hash"]) if ev else (0, "")

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
            with open(self.path, "a", encoding="utf-8", newline="\n") as f:
                f.write(json.dumps(body, ensure_ascii=False) + "\n")
                f.flush()
                os.fsync(f.fileno())  # a line the journal reported as written survives a power cut
            return body
        finally:
            release(lock)


def release(lock):
    """Remove our lock. On Windows another session reading it (to see whose it is) blocks the removal for a moment:
    try again for up to two seconds. The event is already written, so a lock that still cannot be removed is left
    for the next writer, which takes it over once this process has ended - it must not turn a written event into
    a failed command."""
    for _ in range(40):
        try:
            os.remove(lock)
            return
        except FileNotFoundError:
            return
        except PermissionError:
            time.sleep(0.05)
    print("note: the journal lock %s could not be removed yet; the next session takes it over once this one has ended" % lock, file=sys.stderr)


def alive(pid):
    """Is a process of this computer still running? Unknown counts as alive: a lock is never broken on a guess."""
    if pid == os.getpid():
        return True
    try:
        if os.name == "nt":
            import ctypes
            h = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
            if not h:
                return ctypes.windll.kernel32.GetLastError() == 5  # access denied: it exists
            code = ctypes.c_ulong()
            ok = ctypes.windll.kernel32.GetExitCodeProcess(h, ctypes.byref(code))
            ctypes.windll.kernel32.CloseHandle(h)
            return (not ok) or code.value == 259  # STILL_ACTIVE
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except Exception:
        return True


def write_json(path, obj, indent=1):
    """Write beside the file and swap it in: a crash leaves the old file or the new one, never half of one."""
    tmp = "%s.%d.tmp" % (path, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=indent, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


HERE = os.path.dirname(os.path.abspath(__file__))
ITEM_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")


def file_sha(path):
    """SHA-256 of a file with line ends normalised: the same script hashes the same on Windows and in the mirror."""
    with open(path, "rb") as f:
        return hashlib.sha256(f.read().replace(b"\r\n", b"\n")).hexdigest()


def inside(base, path):
    """True when `path`, with links resolved, lies in `base`. Every path an item id or a results file can influence goes through here."""
    b, t = os.path.realpath(base), os.path.realpath(path)
    try:
        return os.path.commonpath([b, t]) == b
    except ValueError:  # different drives
        return False


def registry(events):
    """Scripts by mode, as registered in the journal: {mode: {"name", "sha"}}; and every hash ever registered."""
    by, known = {}, set()
    for e in events:
        if e["type"] == "script":
            by[e["mode"]] = {"name": e["name"], "sha": e["sha"]}
            known.add(e["sha"])
        elif e["type"] == "script.drop":
            by.pop(e["mode"], None)
    return by, known


def check_receipt(data, events, built_by_builder=False):
    """Why a results file may not be taken as evidence, or None. A result counts when the tool that wrote it is
    the one shipped next to this journal, byte for byte, or a script registered in the journal."""
    r = data.get("_receipt") if isinstance(data, dict) else None
    if not isinstance(r, dict) or not r.get("tool") or not r.get("tool_sha"):
        return "the file carries no receipt: it was not written by a tool of this version (or the tool was run without its 'tools' folder)"
    name = os.path.basename(str(r["tool"]))
    known = registry(events)[1]
    shipped = [os.path.join(HERE, name), os.path.join(HERE, "blender", name)]
    if not (any(os.path.isfile(x) and file_sha(x) == r["tool_sha"] for x in shipped) or r["tool_sha"] in known):
        return "the receipt names %s, but its code is not the tool shipped with this plugin nor a registered script: the tool was edited, or is of another version" % name
    body = {k: v for k, v in data.items() if k != "_receipt"}
    if r.get("results_sha") != hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest():
        return "the results do not match their receipt: the file was changed after the tool wrote it"
    if name in SIGNED_INPUT:
        signed = {e["sha"] for e in events if e["type"] == "sign"}
        if not signed & set((r.get("inputs") or {}).values()):
            return ("%s measured against a list nobody signed, or one changed after it was signed. The person who answers for it reads it and records: %s sign <file> --by <name>"
                    % (name, os.path.basename(sys.argv[0])))
    op = (data.get("report") or {}).get("op_sha") if isinstance(data.get("report"), dict) else None
    if op and op not in known and not built_by_builder:
        return "the transaction ran a script that is not registered, or was changed after it was registered (%s). Only the builder's own item may run one." % (data["report"].get("op") or "?")
    return None


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
    lst, bad = read_criteria(text)
    if lst is not None:
        # the block is the list of criteria: its gate, and the other sections as before
        for k in SECTIONS:
            if not sec.get(k):
                out.append("section '%s' is empty" % k.capitalize())
        out += bad + gate_criteria(lst, known)
        if len(lst) > 9:
            out.append("Acceptance has %d criteria; more than 9 means this is several items" % len(lst))
        tools = [CRIT_CHECK.match(str(c.get("check") or "").strip()).group(1) for c in lst
                 if isinstance(c, dict) and not judged_check(c.get("check")) and CRIT_CHECK.match(str(c.get("check") or "").strip())]
        return out, tools, len(lst)
    for k in SECTIONS:
        if not sec.get(k):
            out.append("section '%s' is empty" % k.capitalize())
    crit = [l for l in sec.get("acceptance", []) if re.match(r"\d+[.)]\s*\S", l)]
    if not crit:
        out.append("Acceptance has no numbered criterion")
    if len(crit) > 9:
        out.append("Acceptance has %d criteria; more than 9 means this is several items" % len(crit))
    judged = sum(1 for l in crit if any(t[0] in ("look", "user") for t in TAG.findall(l)))
    if judged > MAX_JUDGED:
        out.append("%d criteria are judged by a person ([user] or [look]); at most %d - the rest must be measured" % (judged, MAX_JUDGED))
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


# ---- numbered criteria (FacetKit plan 2.8): a ```criteria block in Acceptance ------------------
# [{"id": "A3", "text": "...", "check": "terrain_holes = 0" | "[user]" | "[look: ...]", "by": "<step>", "chain": [...]}]
# check: a known check with an optional threshold, or [user] / [look: what] - judged by a person; at most
# three of those per item. With the block, the block is the list of criteria; without it, the numbered
# Acceptance lines are, as before.
CRIT_BLOCK = re.compile(r"^```criteria[ \t]*\r?\n(.*?)^```[ \t]*$", re.M | re.S)
CRIT_ID = re.compile(r"^[A-Z][A-Z0-9]{0,7}$")
CRIT_CHECK = re.compile(r"^([\w.\-]+)(?:\s+([^\s<>=!]+))?(?:\s*(<=|>=|==|=|!=|<|>)\s*(-?\d+(?:\.\d+)?)\s*(%|[a-zA-Z]{1,4})?)?$")
MAX_JUDGED = 3


def judged_check(check):
    """True for a criterion a person judges: [user] or [look: what]."""
    c = str(check or "").strip()
    return c == "[user]" or (c.startswith("[look:") and c.endswith("]") and len(c) > 7)


def read_criteria(text):
    """(list or None when there is no block, problems)."""
    m = CRIT_BLOCK.search(text)
    if not m:
        return None, []
    try:
        lst = json.loads(m.group(1))
    except ValueError as e:
        return [], ["the criteria block is not JSON: %s" % e]
    if not isinstance(lst, list):
        return [], ["the criteria block is a list: [{\"id\": ..., \"text\": ..., \"check\": ..., \"by\": ...}]"]
    return lst, []


def gate_criteria(lst, known=(), steps=None):
    """Why the criteria cannot be accepted: no check and no [user]/[look] - refused; more than three judged - refused."""
    out, seen = [], set()
    if not lst:
        out.append("no criteria: 'done' is not stated")
    for c in lst:
        if not isinstance(c, dict):
            out.append("a criterion is an object with id, text, check and by")
            continue
        cid = c.get("id")
        if not CRIT_ID.match(str(cid or "")):
            out.append("criterion %s: the id is a letter and up to seven letters or digits (A3)" % cid)
        elif cid in seen:
            out.append("criterion %s: the id is used twice" % cid)
        seen.add(cid)
        if not str(c.get("text") or "").strip():
            out.append("criterion %s: no text" % cid)
        chk = str(c.get("check") or "").strip()
        if not chk:
            out.append("criterion %s: no check - name the check and its threshold, or [user] / [look: what]" % cid)
        elif not judged_check(chk):
            m = CRIT_CHECK.match(chk)
            if not m:
                out.append("criterion %s: the check '%s' cannot be read: <check> [<op> <number>]" % (cid, chk))
            elif known and m.group(1) not in known:
                out.append("criterion %s: no check named '%s' (known: %s)" % (cid, m.group(1), ", ".join(sorted(known))))
        if not str(c.get("by") or "").strip():
            out.append("criterion %s: no 'by' - name the step that must make it true" % cid)
        elif steps and c["by"] not in steps:
            out.append("criterion %s: 'by' %s is not a step of this route (%s)" % (cid, c["by"], ", ".join(steps)))
        if "chain" in c and (not isinstance(c["chain"], list) or not all(isinstance(x, str) and x.strip() for x in c["chain"])):
            out.append("criterion %s: 'chain' is a list of link names, source first" % cid)
    judged = sum(1 for c in lst if isinstance(c, dict) and judged_check(c.get("check")))
    if judged > MAX_JUDGED:
        out.append("%d criteria are judged by a person ([user] or [look]); at most %d - the rest must be measured" % (judged, MAX_JUDGED))
    return out


def criteria_hash(lst):
    """The same hash FacetKit's core takes: SHA-256 over canonical JSON (sorted keys, no spaces)."""
    return hashlib.sha256(json.dumps(lst, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()


def snapshot_state(root, item, step):
    """The state of the item when a step starts: its JSON files (the description, readbacks, results, scene
    digests, transactions) copied to work/<ITEM>/snap/<step>/. FacetKit's facet origin runs a criterion's check
    on these states to find the step that broke it (plan 2.8). Images and models are not copied: the checks
    read their JSON digests."""
    src = os.path.join(root, "work", item)
    if not os.path.isdir(src):
        return
    dst = os.path.join(src, "snap", step)
    os.makedirs(dst, exist_ok=True)
    for name in os.listdir(src):
        f = os.path.join(src, name)
        if name.endswith(".json") and os.path.isfile(f):
            with open(f, "rb") as a, open(os.path.join(dst, name), "wb") as b:
                b.write(a.read())


def echo_check_judged(check):
    """A criterion a person judges ([user], [look: ...]) has no tool result to show."""
    c = str(check or "").strip()
    return not c or c == "[user]" or c.startswith("[look:")


def approved_list(events, item):
    """The criteria block approved last for the item (brief.ok with a list), or []."""
    mine = [e for e in events if e.get("item") == item and e["type"] == "brief.ok" and e.get("list")]
    return mine[-1]["list"] if mine else []


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
                "inverted_normals", "floating", "intersections", "orphans", "txn.contract", "index",
                "unapplied_scale", "asset_paths", "render.output", "swap.kept", "images.changed", "images.noise"]


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
                 "attempts": {}, "accepted": None, "remarks": [], "previews": 0, "ends": [], "origin": e.get("origin"),
                 "costs": [], "scopes": {}}
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
                s["scopes"][e["check"]] = e.get("scope")
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
        elif t == "cost":
            s["costs"].append(e)
    return s if item is None else last


def actor(root, step):
    """Who runs the step now: the operator when the project has a registered script for it, else the builder."""
    if step.get("script") and step.get("else"):
        if step["script"] not in registry(Journal(root).events())[0] and step["script"] not in BUILTIN_MODES:
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
        return "BRIEF NOT USABLE (%d problems) - fix work/%s/brief.md, then: vizflow.py brief check\n  - %s" % (len(problems), s["item"], "\n  - ".join(problems[:8]))
    now, ok, _ = brief_state(j, j.root, s["item"], j.events())
    if ok == now:
        return None
    if not s["approve"]:
        return "RECORD THE BRIEF: vizflow.py brief approve --by auto   (this route needs no sign-off)"
    return "ASK THE USER: %s work/%s/brief.md - show it in full and ask for approval or corrections. Then: vizflow.py brief approve --by <name>" % (
        "the brief CHANGED after it was approved;" if ok else "approve the brief", s["item"])


def cmd_next(j, routes, a):
    s = state(j, routes)
    if s is None:
        die("NO OPEN ITEM. Open one: vizflow.py open <ITEM> --route <%s>   (or: vizflow.py plan)" % "|".join(routes["routes"]), 0)
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
        die("ASK THE USER: approve %s of %s before the expensive step. Yes: vizflow.py answer   No: vizflow.py answer --no \"<their remarks>\"" % (s["gate"][1], s["item"]), 0)
    if s["need_verdict"]:
        miss = missing_evidence(j, s)
        die("RECORD VERDICT: vizflow.py verdict PASS|REWORK|NEEDS-USER  (first line of work/%s/proof.md)%s" %
            (s["item"], "\n  PASS will be refused: no reproduced OK for %s" % ", ".join(miss) if miss else ""), 0)
    if s["passed"]:
        die("CLOSE: vizflow.py close", 0)
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
    by_route = {}
    for s in closed:
        if s["remarks"]:
            by_route[s["route"]] = by_route.get(s["route"], 0) + len(s["remarks"])
    if by_route:
        n = sum(by_route.values())
        print("REMARKS ARRIVE AFTER  " + "  ".join("%s %s" % (r, pct(k, n)) for r, k in sorted(by_route.items(), key=lambda x: -x[1])) +
              "   (what they cost: %s cost report)" % os.path.basename(sys.argv[0]))
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
        die("No plan. Start one: vizflow.py plan new-project --prefix N1   or   vizflow.py plan model-change --prefix C1", 0)
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
        print("NEXT: vizflow.py open %s" % nxt["item"])


# ---- stale: a change sends back only the proofs whose scope it touches ---------------------------
def tokens_of(text):
    return [t.strip() for t in (text or "").split(",") if t.strip()]


def cmd_stale(j, routes, a):
    if a.action in ("status", "waive"):
        return cmd_stale_more(j, routes, a)
    """Trust decay by scope. Every piece of evidence may name what it covers (a zone, a story, a sheet);
    evidence that names nothing covers everything. A change of some scopes sends back exactly the
    proofs that cover them - a re-saved project file by itself sends back nothing."""
    touched, src = tokens_of(a.touched), None
    if a.src:
        d = load_json(a.src, {})
        d = d.get("report", d)
        touched += [str(x) for x in (d.get("touched") or d.get("zones") or [])]
        src = os.path.basename(a.src)
    if any(t.startswith(("story:", "zone:")) for t in touched):
        touched.append("model")  # a change of a story or a room is a change of the model
    touched = sorted(set(touched))
    ev = j.events()
    if not touched:
        die("NOTHING TOUCHED: no scope given (--touched a,b or --from <diff.json>). With no change, every proof stands.", 0)
    back, kept = {}, 0
    for item in [e["item"] for e in ev if e["type"] == "open"]:
        s = state(j, routes, item=item, events=ev)
        if not s or not s["passed"]:
            continue
        for c, st in s["evidence"].items():
            if st != "OK":
                continue
            sc = s["scopes"].get(c)
            if not sc:
                back.setdefault(item, []).append("%s (covers everything)" % c)
            elif set(sc) & set(touched):
                back.setdefault(item, []).append("%s (%s)" % (c, ", ".join(sorted(set(sc) & set(touched))[:4])))
            else:
                kept += 1
    if not a.dry:
        j.add("change", touched=touched[:200], source=src, by=a.by, back=sum(len(v) for v in back.values()), kept=kept,
              returns={i: [c.split(" (")[0] for c in v] for i, v in back.items()} or None)
    print("CHANGE touches %d scopes: %s%s" % (len(touched), ", ".join(touched[:8]), " ..." if len(touched) > 8 else ""))
    for item, checks in back.items():
        print("  RE-RUN for %s (%s): %s" % (item, state(j, routes, item=item, events=ev)["route"], "; ".join(checks)))
    print("sent back %d proofs in %d items  ·  still standing %d (their scope was not touched)" % (sum(len(v) for v in back.values()), len(back), kept))
    if back:
        print("Open a 'revise' or 'fix' item for the change; its inspector re-runs exactly these.")
        print("Until each is re-run with an OK in an item that passes (or waived by name: stale waive <ITEM> <check> --by <name> --reason \"...\"),\n"
              "nothing can be released: the routes %s refuse." % " and ".join("'%s'" % r for r in release_routes(routes)))


SIGNED_INPUT = ("rules_check.py", "trace.py")  # tools whose first input is a list a person must have confirmed


def approvals(j, item):
    """Everything that was decided in a person's name for one item - so that a decision nobody made is seen."""
    rows = []
    for e in j.events():
        if e.get("item") != item:
            continue
        t, at = e["type"], e["ts"][11:16]
        if t == "brief.ok":
            rows.append("%s  brief approved by %s%s" % (at, e.get("by"), " (changed after an earlier approval)" if e.get("changed") else ""))
        elif t == "answer":
            rows.append("%s  %s" % (at, "preview sent back" if e.get("no") else "question or gate answered"))
        elif t == "waive":
            rows.append("%s  check %s waived by %s: %s" % (at, e.get("check"), e.get("by"), e.get("reason")))
        elif t == "sign":
            rows.append("%s  %s signed by %s%s" % (at, e.get("name"), e.get("by"), " - " + e["what"] if e.get("what") else ""))
        elif t in ("open", "start") and e.get("forced"):
            rows.append("%s  %s forced: %s" % (at, t, e["forced"]))
        elif t == "script":
            rows.append("%s  script %s registered for '%s' by %s" % (at, e.get("name"), e.get("mode"), e.get("by")))
        elif t == "memory.confirm":
            rows.append("%s  lesson %s confirmed by %s" % (at, e.get("id"), e.get("by")))
    print("DECIDED IN A PERSON'S NAME for %s - show this list to the requester; a line they do not recognise is a defect:" % item)
    for r in rows:
        print("  " + r)
    if not rows:
        print("  nothing")


def release_routes(routes):
    return routes.get("release") or ["pack", "issue"]


def pending_returns(ev):
    """Proofs a change sent back and nobody has re-run since: [(item, check, touched scopes, n of the change)].
    A return is settled by a later OK for the same check, covering a touched scope (or everything), in an item
    whose inspector then passed - or by a waiver with a name and a reason."""
    passed_after, pend = {}, []
    for e in ev:
        if e["type"] == "verdict" and e.get("verdict") == "PASS":
            passed_after[e["item"]] = e["n"]
    for c in ev:
        if c["type"] != "change" or not c.get("returns"):
            continue
        t = set(c.get("touched") or [])
        for item, checks in c["returns"].items():
            for chk in checks:
                done = any(e["type"] == "evidence" and e["n"] > c["n"] and e.get("check") == chk and e.get("status") == "OK"
                           and (not e.get("scope") or set(e["scope"]) & t) and passed_after.get(e.get("item"), 0) > e["n"] for e in ev)
                done = done or any(e["type"] == "stale.waive" and e["n"] > c["n"] and e.get("of") == item and e.get("check") == chk for e in ev)
                if not done:
                    pend.append((item, chk, sorted(t), c["n"]))
    return pend


def cmd_stale_more(j, routes, a):
    ev = j.events()
    if a.action == "waive":
        if not (a.item and a.check and a.by and a.reason):
            die("stale waive <ITEM> <check> --by <name> --reason \"...\"")
        if not any(p[0] == a.item and p[1] == a.check for p in pending_returns(ev)):
            die("Nothing is waiting under %s / %s." % (a.item, a.check))
        j.add("stale.waive", of=a.item, check=a.check, by=a.by, reason=a.reason)
        return print("waived the re-run of %s for %s by %s - it stays on the record" % (a.check, a.item, a.by))
    pend = pending_returns(ev)
    for item, chk, t, n in pend:
        print("  WAITING %s: %s  (change #%d touched %s)" % (item, chk, n, ", ".join(t[:4])))
    print("%d proofs sent back by a change are waiting to be re-run%s" % (len(pend), "" if pend else " - nothing blocks a release"))


# ---- memory: what the project taught, tied to the place it is about -------------------------------
def memory_rows(ev, confirmed=True):
    """Live lessons. A lesson is written by whoever noticed it - often an agent - and is only proposed until a
    person confirms it: a wrong or planted lesson would otherwise reach every later brief for that place."""
    gone = {e["id"] for e in ev if e["type"] == "memory.retire"}
    ok = {e["id"]: e for e in ev if e["type"] == "memory.confirm"}
    rows = []
    for e in ev:
        if e["type"] == "memory" and e["id"] not in gone and (e["id"] in ok) == confirmed:
            rows.append(dict(e, confirmed_by=ok[e["id"]]["by"]) if e["id"] in ok else e)
    return rows


def cmd_memory(j, routes, a):
    ev = j.events()
    if a.action == "add":
        where = tokens_of(a.where)
        if not where or not a.text or not a.by:
            die("Refused: memory add --where <zone,room,sheet,...> --text \"...\" --by <name>. A lesson with no place is recalled never or always.")
        if len(a.text) > 240:
            die("Refused: %d characters; a lesson is one fact and one consequence, at most 240." % len(a.text))
        if any(w in a.text.lower() for w in VAGUE) and not re.search(r"\d", a.text):
            die("Refused: the lesson says how something should feel, not what is there. Name the element, the number and what not to do.")
        if safe is None:
            die("Refused: safe.py is missing next to %s - copy the plugin's scripts again. Lessons are not taken unchecked." % os.path.basename(sys.argv[0]))
        if safe.suspect(a.text) or safe.clean(a.text, 240) != " ".join(a.text.split()):
            die("Refused: the lesson addresses its reader or carries control characters. A lesson states a fact about a place and what not to do there.")
        mid = "M%d" % (sum(1 for e in ev if e["type"] == "memory") + 1)
        cur = state(j, routes, events=ev)
        j.add("memory", id=mid, where=where, text=a.text, anchor=a.anchor, by=a.by, item=a.item or (cur or {}).get("item"))
        return print("proposed %s for %s. It reaches no brief until a person confirms it: %s memory confirm %s --by <name>" % (mid, ", ".join(where), os.path.basename(sys.argv[0]), mid))
    if a.action == "confirm":
        if not a.id or not a.by:
            die("Refused: memory confirm <id> --by <the person who read it and agrees>")
        if a.id not in {m["id"] for m in memory_rows(ev, confirmed=False)}:
            die("No proposed lesson %s." % a.id)
        j.add("memory.confirm", id=a.id, by=a.by, item=(state(j, routes, events=ev) or {}).get("item"))
        return print("confirmed %s by %s - from now on it is recalled for its places" % (a.id, a.by))
    if a.action == "proposed":
        rows = memory_rows(ev, confirmed=False)
        for m in rows:
            print("%s  %s: %s  (proposed by %s%s)" % (m["id"], ", ".join(m["where"]), safe.clean(m["text"], 240) if safe else m["text"], m.get("by", "?"), ", in " + m["item"] if m.get("item") else ""))
        return print("%d proposed lessons wait for a person to confirm or retire them" % len(rows))
    if a.action == "retire":
        if not a.id or not a.by or not a.reason:
            die("Refused: memory retire <id> --by <name> --reason \"...\"")
        if a.id not in {m["id"] for m in memory_rows(ev) + memory_rows(ev, confirmed=False)}:
            die("No live lesson %s." % a.id)
        j.add("memory.retire", id=a.id, by=a.by, reason=a.reason)
        return print("retired %s - it stays in the journal, it is no longer recalled" % a.id)
    rows, where = memory_rows(ev), set(tokens_of(a.where))
    now = load_json(a.state, {}) if a.state else {}
    hits = [m for m in rows if not where or where & set(m["where"])]
    waiting = [m for m in memory_rows(ev, confirmed=False) if not where or where & set(m["where"])]
    tail = ("  (%d proposed lessons for these places are not shown until confirmed: memory proposed)" % len(waiting)) if waiting else ""
    if not hits:
        return print("no lesson recorded for %s  (%d live lessons in the project)%s" % (", ".join(sorted(where)) or "this project", len(rows), tail))
    for m in hits[-(a.max or 7):]:
        mark = ""
        if m.get("anchor") and now:
            cur = [str(now.get(w)) for w in m["where"] if w in now]
            mark = "" if m["anchor"] in cur else "  [STALE: the place changed since this was written - check it before relying on it]"
        print("%s  %s: %s  (%s, confirmed by %s%s)%s" % (m["id"], ", ".join(m["where"]), safe.clean(m["text"], 240) if safe else m["text"], m.get("by", "?"),
                                                          m.get("confirmed_by"), ", from " + m["item"] if m.get("item") else "", mark))
    print("%d of %d lessons. A lesson is a hint to check, not a fact: the model decides.%s" % (min(len(hits), a.max or 7), len(hits), tail))


# ---- cost: what an item took besides tokens ---------------------------------------------------------
COST_KINDS = ("render", "farm", "person", "other")


def cmd_cost(j, routes, a):
    ev = j.events()
    rates = load_json(os.path.join(j.root, "project.json"), {}).get("rates") or {}
    if a.action == "add":
        if a.kind not in COST_KINDS or (a.minutes is None and a.amount is None):
            die("cost add --kind %s --minutes N [--amount X] [--note \"...\"] [--item ITEM]" % "|".join(COST_KINDS))
        item = a.item or (state(j, routes, events=ev) or {}).get("item")
        if not item or not any(e["type"] == "open" and e["item"] == item for e in ev):
            die("Refused: no such item. Costs are recorded against an item, open or closed.")
        j.add("cost", item=item, kind=a.kind, minutes=a.minutes, amount=a.amount, note=(a.note or "")[:120] or None)
        return print("recorded for %s: %s %s" % (item, a.kind, "%.0f min" % a.minutes if a.minutes is not None else "%.2f" % a.amount))
    items = [e["item"] for e in ev if e["type"] == "open"]
    if not items:
        die("No item yet.", 0)
    cur = rates.get("currency") or ""
    tok_rate = rates.get("tokens_1k") or {}

    def money(s):
        """(amount, complete?) - an amount is complete only when every recorded quantity has a rate."""
        total, complete = 0.0, True
        for c in s["costs"]:
            if c.get("amount") is not None:
                total += c["amount"]
            elif rates.get(c["kind"] + "_hour") is not None:
                total += c["minutes"] / 60.0 * rates[c["kind"] + "_hour"]
            else:
                complete = False
        for _, model, tok in s["tokens"]:
            if tok and tok_rate.get(model) is not None:
                total += tok / 1000.0 * tok_rate[model]
            elif tok:
                complete = False
        return total, complete

    rows, tot = [], {"tokens": 0, "machine": 0.0, "render": 0.0, "farm": 0.0, "person": 0.0, "money": 0.0}
    all_complete = True
    for i in items:
        s = state(j, routes, item=i, events=ev)
        mins = {k: sum(c.get("minutes") or 0 for c in s["costs"] if c["kind"] == k) for k in COST_KINDS}
        m, complete = money(s)
        all_complete &= complete
        r = {"item": i, "route": s["route"], "origin": s.get("origin"), "tokens": sum(t for _, _, t in s["tokens"]),
             "machine": sum(t.get("sec", 0) for t in s["ticks"]) / 60.0, "money": m, "rework": s["rework"] + s["previews"], **mins}
        rows.append(r)
        for k in tot:
            tot[k] += r[k]
    print("%-9s %-13s %9s %8s %8s %8s %8s %10s  %s" % ("item", "route", "tokens", "tools", "render", "farm", "person", "amount", "answers"))
    for r in rows[-(a.max or 30):]:
        print("%-9s %-13s %9d %7.0fm %7.0fm %7.0fm %7.0fm %10.2f  %s" % (r["item"], r["route"], r["tokens"], r["machine"], r["render"], r["farm"], r["person"], r["money"],
                                                                 r["origin"] or ("%d returns" % r["rework"] if r["rework"] else "")))
    print("TOTAL  tokens %d  ·  tools %.0f min  ·  render %.0f min  ·  farm %.0f min  ·  people %.0f min  ·  %.2f %s%s" %
          (tot["tokens"], tot["machine"], tot["render"], tot["farm"], tot["person"], tot["money"], cur,
           "" if all_complete else "  (INCOMPLETE: some quantities have no rate in project.json -> rates)"))
    rev = [r for r in rows if r["origin"]]
    if rev:
        cause = {}
        for r in rev:
            o = state(j, routes, item=r["origin"], events=ev)
            c = (o["remarks"][-1].get("cause") if o and o["remarks"] else None) or "unrecorded"
            x = cause.setdefault(c, {"n": 0, "money": 0.0, "render": 0.0, "person": 0.0})
            x["n"] += 1; x["money"] += r["money"]; x["render"] += r["render"] + r["farm"]; x["person"] += r["person"]
        share = lambda v, t: "%d%%" % round(100.0 * v / t) if t else "-"
        print("REVISIONS after acceptance: %d items  ·  %s of the amount  ·  %s of render time" %
              (len(rev), share(sum(r["money"] for r in rev), tot["money"]), share(sum(r["render"] + r["farm"] for r in rev), tot["render"] + tot["farm"])))
        names = {"brief": "the brief missed it", "taste": "a new wish of the client", "agent": "a defect that got through", "unrecorded": "cause not recorded"}
        for c, x in sorted(cause.items(), key=lambda kv: -kv[1]["money"]):
            print("  %-28s items %d  render %.0f min  people %.0f min  %.2f %s" % (names.get(c, c), x["n"], x["render"], x["person"], x["money"], cur))
    print("Tokens come from the agents' reports, tool time from ticks; render, farm and person time only when recorded with 'cost add'.")


BUILTIN_MODES = ("pack", "preview", "render")  # modes whose tool ships with the plugin
# FacetKit plan 2.10: the files that hold the checks (H2) and what stands where work should be (H4); domain.json may name its own
CHECK_FILES = ["project.json", "domain.json", "routes.json"]
PLACEHOLDERS = []
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
    CHECK_FILES = _d.get("checkFiles", CHECK_FILES)
    PLACEHOLDERS = _d.get("placeholders", PLACEHOLDERS)


def main():
    ap = argparse.ArgumentParser(prog="vizflow.py")
    ap.add_argument("--root", default=os.environ.get("VIZ_ROOT", "_viz"))
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init")
    p = sub.add_parser("open"); p.add_argument("item"); p.add_argument("--route"); p.add_argument("--title", default=""); p.add_argument("--force", metavar="REASON")
    p.add_argument("--origin", metavar="ITEM", help="the closed item whose remark this one answers")
    sub.add_parser("verify").add_argument("--anchor")
    for name in ("next", "status", "ledger", "close", "quality"):
        sub.add_parser(name)
    p = sub.add_parser("plan"); p.add_argument("kind", nargs="?"); p.add_argument("--prefix", default="N1")
    p = sub.add_parser("brief"); p.add_argument("action", choices=["new", "check", "approve"]); p.add_argument("--by"); p.add_argument("--file")
    p = sub.add_parser("start"); p.add_argument("step"); p.add_argument("--force", default=None, metavar="REASON")
    p = sub.add_parser("approve-checks"); p.add_argument("step"); p.add_argument("--by", required=True); p.add_argument("--note", required=True)
    p = sub.add_parser("echo"); p.add_argument("action", choices=["check"]); p.add_argument("step"); p.add_argument("--file")
    p = sub.add_parser("end"); p.add_argument("step"); p.add_argument("--status", required=True, choices=["DONE", "BLOCKED", "NEEDS-USER"])
    p.add_argument("--tokens", type=int); p.add_argument("--model"); p.add_argument("--question")
    p = sub.add_parser("note"); p.add_argument("text")
    p = sub.add_parser("tick"); p.add_argument("label"); p.add_argument("--fail", action="store_true"); p.add_argument("--sec", type=float, default=0)
    p = sub.add_parser("evidence"); p.add_argument("check", nargs="?"); p.add_argument("--status", choices=["OK", "FAIL", "SKIP"]); p.add_argument("--from", dest="src"); p.add_argument("--value")
    p.add_argument("--by"); p.add_argument("--reason")
    p.add_argument("--scope", help="what the result covers: zones, stories or sheets, comma-separated; nothing = everything")
    p = sub.add_parser("waive"); p.add_argument("check"); p.add_argument("--by", required=True); p.add_argument("--reason", required=True)
    p = sub.add_parser("verdict"); p.add_argument("verdict", choices=["PASS", "REWORK", "NEEDS-USER"])
    p.add_argument("--fix", default=""); p.add_argument("--question")
    p = sub.add_parser("answer"); p.add_argument("--no", metavar="REMARKS")
    p = sub.add_parser("accept"); p.add_argument("item"); p.add_argument("--by", required=True)
    p = sub.add_parser("remark"); p.add_argument("item"); p.add_argument("text"); p.add_argument("--cause", required=True, choices=["agent", "brief", "taste"])
    p = sub.add_parser("stale"); p.add_argument("action", nargs="?", default="mark", choices=["mark", "status", "waive"]); p.add_argument("item", nargs="?"); p.add_argument("check", nargs="?")
    p.add_argument("--reason"); p.add_argument("--touched", default=""); p.add_argument("--from", dest="src"); p.add_argument("--by"); p.add_argument("--dry", action="store_true")
    p = sub.add_parser("memory"); p.add_argument("action", choices=["add", "recall", "retire", "confirm", "proposed"]); p.add_argument("id", nargs="?")
    p.add_argument("--where", default=""); p.add_argument("--text"); p.add_argument("--anchor"); p.add_argument("--by"); p.add_argument("--item")
    p.add_argument("--reason"); p.add_argument("--state"); p.add_argument("--max", type=int)
    p = sub.add_parser("cost"); p.add_argument("action", choices=["add", "report"]); p.add_argument("--kind"); p.add_argument("--minutes", type=float)
    p.add_argument("--amount", type=float); p.add_argument("--note"); p.add_argument("--item"); p.add_argument("--max", type=int)
    p = sub.add_parser("anchor")
    p = sub.add_parser("sign"); p.add_argument("file"); p.add_argument("--by"); p.add_argument("--what")
    p = sub.add_parser("approvals"); p.add_argument("item", nargs="?")
    p = sub.add_parser("diff"); p.add_argument("before"); p.add_argument("after"); p.add_argument("--only", default=""); p.add_argument("--out")
    p = sub.add_parser("script"); p.add_argument("action", choices=["register", "drop", "list", "lock"]); p.add_argument("mode", nargs="?")
    p.add_argument("--file"); p.add_argument("--sha"); p.add_argument("--name"); p.add_argument("--by"); p.add_argument("--out")
    efficiency.add_parsers(sub)
    a = ap.parse_args()
    j = Journal(a.root)
    routes = load_routes(a.root)

    done = efficiency.dispatch(j, routes, state, a, os.path.join(a.root, "project.json"))
    if done is not None:
        print(done[0])
        sys.exit(done[1])
    if a.cmd == "init":
        os.makedirs(os.path.join(a.root, "work"), exist_ok=True)
        for name, data in (("routes.json", DEFAULT_ROUTES), ("project.json", PROJECT_TEMPLATE)):
            p = os.path.join(a.root, name)
            if not os.path.exists(p):
                write_json(p, data, 2)
        # a project set up with an earlier version keeps its own routes and settings and gains what is new
        added = []
        for name, data, keys in (("routes.json", DEFAULT_ROUTES, ("routes", "plans")), ("project.json", PROJECT_TEMPLATE, (None,))):
            p = os.path.join(a.root, name)
            cur, changed = load_json(p, {}), False
            for k in keys:
                src, dst = (data, cur) if k is None else (data.get(k, {}), cur.setdefault(k, {}))
                for kk, vv in src.items():
                    if kk not in dst:
                        dst[kk] = vv
                        changed = True
                        added.append("%s: %s" % (name, kk))
            if changed:
                write_json(p, cur, 2)
        print("ready: %s  (fill project.json before the first item)%s" % (a.root, "\n  added from this version, nothing existing was changed: " + ", ".join(added) if added else ""))
    elif a.cmd == "verify":
        bad = j.verify()
        if bad:
            die("JOURNAL BROKEN at line %d" % bad)
        ev = j.events()
        print("journal intact: %d events" % len(ev))
        if a.anchor:
            m = re.match(r"(\d+):([0-9a-f]{16,64})$", a.anchor.strip())
            if not m:
                die("--anchor is <number>:<hash>, as printed by 'anchor' and at every close.")
            n, h = int(m.group(1)), m.group(2)
            if n > len(ev) or not ev[n - 1]["hash"].startswith(h):
                die("ANCHOR DOES NOT MATCH: line %d of this journal is not the one the anchor was taken from. The journal was rewritten or cut after that anchor. Stop and tell the user." % n)
            print("anchor holds: the first %d events are the ones that were there when it was taken" % n)
    elif a.cmd == "anchor":
        n, h = j.head()
        if not n or j.verify():
            die("No intact journal to anchor.")
        print("ANCHOR %d:%s  (%s)" % (n, h[:24], time.strftime("%Y-%m-%d %H:%M")))
        print("Keep this line where this folder's tools cannot rewrite it - the project's notes, a message to the requester - and check it later:\n"
              "  %s verify --anchor %d:%s" % (os.path.basename(sys.argv[0]), n, h[:24]))
    elif a.cmd == "sign":
        if not a.by or not os.path.isfile(a.file):
            die("sign <file> --by <the person who read and confirmed it> [--what \"...\"]")
        sha = file_sha(a.file)
        cur = state(j, routes)
        j.add("sign", name=os.path.basename(a.file), sha=sha, by=a.by, what=a.what, item=(cur or {}).get("item"))
        print("signed %s (%s...) by %s. A result that rests on this file counts only while the file is this exact text." % (os.path.basename(a.file), sha[:12], a.by))
    elif a.cmd == "approvals":
        approvals(j, a.item or (state(j, routes) or {}).get("item"))
    elif a.cmd == "plan":
        cmd_plan(j, routes, a)
    elif a.cmd == "quality":
        cmd_quality(j, routes, a)
    elif a.cmd == "script":
        ev = j.events()
        by, known = registry(ev)
        if a.action == "register":
            if not a.mode or not a.by or not (a.file or (a.sha and a.name)):
                die("script register <mode> --file <script> --by <name>     (or --sha <sha256> --name <file name> when the file is only on the other computer)")
            sha = file_sha(a.file) if a.file else a.sha.lower()
            if not re.match(r"[0-9a-f]{64}$", sha):
                die("Refused: --sha is the full SHA-256 of the script, 64 hex characters.")
            cur = state(j, routes, events=ev)
            j.add("script", mode=a.mode, name=os.path.basename(a.file or a.name), sha=sha, by=a.by, item=(cur or {}).get("item"))
            print("registered %s for mode '%s' (%s...). From now on the operator runs exactly this text; an edited copy is refused until it is registered again." % (os.path.basename(a.file or a.name), a.mode, sha[:12]))
        elif a.action == "drop":
            if not a.mode or a.mode not in by or not a.by:
                die("script drop <registered mode> --by <name>")
            j.add("script.drop", mode=a.mode, by=a.by)
            print("dropped: mode '%s' goes back to the builder" % a.mode)
        elif a.action == "lock":
            out = a.out or os.path.join(a.root, "scripts.lock.json")
            with open(out, "w", encoding="utf-8") as f:
                json.dump({m: v for m, v in sorted(by.items())}, f, indent=1)
            print("written: %s (%d scripts) - a copy for people and tools to read; the journal stays the authority" % (out, len(by)))
        else:
            for m, v in sorted(by.items()):
                print("  %-14s %-28s %s" % (m, v["name"], v["sha"][:16]))
            print("%d registered scripts" % len(by))
    elif a.cmd == "stale":
        cmd_stale(j, routes, a)
    elif a.cmd == "memory":
        cmd_memory(j, routes, a)
    elif a.cmd == "cost":
        cmd_cost(j, routes, a)
    elif a.cmd == "open":
        if not ITEM_ID.match(a.item) or not inside(os.path.join(a.root, "work"), os.path.join(a.root, "work", a.item)):
            die("Refused: an item id is 1-64 letters, digits, '-' or '_' (D1-02, V-014). It names a folder under work/ and nothing else.")
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
            die("Refused: %s needs %s closed first (see: vizflow.py plan)." % (a.item, ", ".join(waits)))
        waiting = pending_returns(j.events())
        if route in release_routes(routes) and waiting and not a.force:
            die("Refused: %d proofs that a change sent back have not been re-run (%s). What goes out must rest on proofs that still stand.\n"
                "  See them: %s stale status. Re-run them in an item, or waive each by name." %
                (len(waiting), ", ".join("%s/%s" % (w[0], w[1]) for w in waiting[:4]), os.path.basename(sys.argv[0])))
        if a.origin:
            o = state(j, routes, item=a.origin)
            if o is None or not o["closed"] or not o["remarks"]:
                die("Refused: --origin names a closed item with a recorded remark; %s is not one." % a.origin)
        os.makedirs(os.path.join(a.root, "work", a.item), exist_ok=True)
        bp = brief_path(a.root, a.item)
        if not os.path.exists(bp):
            with open(bp, "w", encoding="utf-8") as f:
                f.write(BRIEF_TEMPLATE.format(item=a.item, route=route))
        j.add("open", item=a.item, route=route, title=a.title or (planned or {}).get("title", ""), forced=a.force, origin=a.origin)
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
        lst = read_criteria(open(bp, encoding="utf-8").read())[0]
        if lst:
            bad = gate_criteria(lst, KNOWN_CHECKS, [x["id"] for x in s["steps"]])
            if bad:
                die("BRIEF NOT USABLE - %d problems:\n  - %s" % (len(bad), "\n  - ".join(bad)))
        # with a criteria block the approved list itself is recorded, with its hash: FacetKit imports it as the item's criteria
        j.add("brief.ok", item=s["item"], brief=now, by=a.by, criteria=n, changed=bool(ok) or None,
              list=lst or None, list_hash=criteria_hash(lst) if lst else None)
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
            die("Refused: step %s is running. Resume it (vizflow.py next)." % s["running"])
        expected = s["pending"][0] if s["pending"] else None
        block = brief_blocker(j, s) if a.step != "order" else None
        if (a.step != expected or s["question"] or s["need_verdict"] or s["gate"] or block) and not a.force:
            die("Refused: %s. Run: vizflow.py next" % ("the brief is not approved" if block else "the next step is %s, not %s" % (expected, a.step)))
        step = next((x for x in s["steps"] if x["id"] == a.step), None) or die("No step '%s' on this route." % a.step)
        agent, model, _ = model_for(a.root, s, step)
        j.add("start", item=s["item"], step=a.step, agent=agent, model=model, forced=a.force,
              checks=gates.checks_hash(a.root, CHECK_FILES), at=round(time.time(), 3))
        snapshot_state(a.root, s["item"], a.step)
        print("started %s (%s on %s)" % (a.step, agent, model))
    elif a.cmd == "end":
        s = need(j, routes)
        if s["running"] != a.step:
            die("Refused: step %s is not running." % a.step)
        if a.status == "NEEDS-USER" and not a.question:
            die("Refused: NEEDS-USER needs --question.")
        evs = j.events()
        started = [e for e in evs if e["type"] == "start" and e.get("item") == s["item"] and e["step"] == a.step][-1]
        # a step that owns criteria of the brief's criteria block does not finish without an echo that passed after it started (FacetKit plan 2.9)
        owned = [c["id"] for c in approved_list(evs, s["item"]) if c.get("by") == a.step]
        if a.status == "DONE" and owned and not any(e["type"] == "echo" and e.get("step") == a.step and e.get("ok") and e["n"] > started["n"] for e in evs if e.get("item") == s["item"]):
            die("Refused: %s owns criteria %s and has no echo that passed. The agent writes work/%s/echo.json before its first action, then: echo check %s" % (a.step, ", ".join(owned), s["item"], a.step))
        # FacetKit plan 2.10: H2 the checks untouched, H4 no placeholder, H9 every criterion's status - for a working step
        if a.status == "DONE" and a.step not in ("order", "proof"):
            work = os.path.join(a.root, "work", s["item"])
            bad = []
            approved = any(e["type"] == "checks.ok" and e.get("step") == a.step and e["n"] > started["n"] for e in evs if e.get("item") == s["item"])
            if gates.changed_checks(a.root, CHECK_FILES, started.get("checks")) and not approved:
                bad.append("H2 %s changed the files that hold its checks (%s) - undo it, or a person approves: approve-checks %s --by <name> --note \"why\"" % (a.step, ", ".join(CHECK_FILES), a.step))
            bad += ["H4 " + x for x in gates.placeholders(work, PLACEHOLDERS)[:8]]
            if owned:
                bad += ["H9 " + x for x in gates.criteria_status(work, owned, started.get("at", 0))]
                # A1 (plan 2.11): each measured criterion of the step has an OK of its tool, with the receipt, written during the step
                measured = [c for c in approved_list(evs, s["item"]) if c.get("by") == a.step and not echo_check_judged(c.get("check"))]
                tools = sorted({str(c["check"]).split()[0] for c in measured})
                bad += ["A1 %s: no OK of %s with its receipt written during %s - run the tool in this step" % (", ".join(c["id"] for c in measured if str(c["check"]).split()[0] == t), t, a.step)
                        for t in gates.measured_in_step(work, tools, started.get("at", 0))]
            if bad:
                die("Refused: %s is not done as declared:\n  - %s" % (a.step, "\n  - ".join(bad)))
        claimed = gates.statuses(os.path.join(a.root, "work", s["item"]), owned, started.get("at", 0)) if owned and a.status == "DONE" else {}
        j.add("end", item=s["item"], step=a.step, status=a.status, criteria=claimed or None, tokens=a.tokens, agent=started.get("agent"),
              model=a.model or started.get("model"), question=a.question)
        print("ended %s: %s" % (a.step, a.status))
    elif a.cmd == "approve-checks":
        s = need(j, routes)
        started = [e for e in j.events() if e["type"] == "start" and e.get("item") == s["item"] and e["step"] == a.step]
        if not started:
            die("Refused: step %s has not started." % a.step)
        agents = {started[-1].get("agent")} | {x.get("agent") for x in s["steps"]} | {x.get("else", {}).get("agent") for x in s["steps"]}
        if a.by in agents:
            die("Refused: an agent of this route cannot approve a change to its own checks - a person of another role does.")
        j.add("checks.ok", item=s["item"], step=a.step, by=a.by, note=a.note[:300])
        print("change of the checks during %s approved by %s" % (a.step, a.by))
    elif a.cmd == "echo":
        s = need(j, routes)
        lst = approved_list(j.events(), s["item"])
        if not lst:
            die("Refused: the brief of %s has no approved criteria block - echo check compares with that list." % s["item"])
        f = a.file or os.path.join(a.root, "work", s["item"], "echo.json")
        if not os.path.exists(f):
            die("No echo at %s - the agent of %s writes it before its first action." % (f, a.step))
        try:
            said = json.load(open(f, encoding="utf-8"))
        except ValueError:
            said = None
        bp = brief_path(a.root, s["item"])
        r = echo_check.check_echo(said, a.step, lst, echo_check.fixed_of(open(bp, encoding="utf-8").read()) if os.path.exists(bp) else [])
        j.add("echo", item=s["item"], step=a.step, ok=r["ok"], u1=r["u1"], u2=r["u2"], u3=r["u3"], u4=r["u4"],
              problems=["%s %s" % (u, t) for u, t, _ in r["problems"][:8]] or None)
        print(echo_check.render(r))
        if r["ok"]:
            return
        evs = [e for e in j.events() if e.get("item") == s["item"]]
        since = max([e["n"] for e in evs if e["type"] == "start" and e["step"] == a.step] or [0])
        tries = [e for e in evs if e["type"] == "echo" and e.get("step") == a.step and e["n"] > since]
        streak = len(tries) - 1 - max([i for i, e in enumerate(tries) if e.get("ok")] or [-1])
        if streak >= 2:
            first = s["steps"][0]["id"]
            for cid in sorted({i for u, _, i in r["problems"] if i and u != "U4"}) or [None]:
                j.add("echo.return", item=s["item"], step=a.step, to=first, criterion=cid)
            die("BRIEF NOT READABLE: two failed echoes in a row. Send the brief back to %s with the lines above - recorded against the brief, not against %s." % (first, a.step))
        die("ECHO NOT UNDERSTOOD: fix work/%s/echo.json and run echo check %s again." % (s["item"], a.step))
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
        rows, scopes, rc = {}, {}, None
        if a.src:
            data = load_json(a.src, {})
            ev = j.events()
            built = any(e["type"] == "start" and e.get("item") == s["item"] and str(e.get("agent", "")).endswith("-builder") for e in ev)
            why = check_receipt(data, ev, built)
            if why:
                die("Refused: %s.\n  Run the tool again in this proof step and record the file it writes." % why)
            rc = {"tool": data["_receipt"]["tool"], "sha": data["_receipt"]["tool_sha"][:16], "inputs": hashlib.sha256(json.dumps(data["_receipt"].get("inputs"), sort_keys=True).encode()).hexdigest()[:16]}
            for k, v in data.items():
                if k.startswith("_"):
                    continue
                st = v.get("status") if isinstance(v, dict) else v
                if st in ("OK", "FAIL", "SKIP"):
                    rows[k] = st
                    sc = (v.get("scope") or v.get("zones")) if isinstance(v, dict) else None
                    scopes[k] = [str(x) for x in sc][:200] if sc else None
        elif a.check and a.status:
            if a.status == "OK":
                die("Refused: an OK is taken only from the file a tool wrote (evidence --from <results.json>). What only a person can judge is a [user] line of the brief;\n"
                    "  a check that cannot be run is SKIP, and the requester may waive it by name: %s waive %s --by <name> --reason \"...\"" % (os.path.basename(sys.argv[0]), a.check))
            if not a.reason:
                die("Refused: a %s recorded by hand needs --reason \"<what was seen>\"." % a.status)
            rows[a.check] = a.status
        else:
            die("evidence <check> --status OK|FAIL|SKIP   or   evidence --from <results.json>")
        for k, st in rows.items():
            j.add("evidence", item=s["item"], check=k, status=st, value=a.value, scope=scopes.get(k) or tokens_of(a.scope) or None, receipt=rc, by=a.by, reason=a.reason)
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
        if a.verdict == "PASS" and s["route"] in release_routes(routes) and pending_returns(j.events()):
            die("Refused: PASS for a release while proofs sent back by a change wait to be re-run. See: %s stale status" % os.path.basename(sys.argv[0]))
        if a.verdict == "PASS":
            miss = missing_evidence(j, s)
            if miss:
                die("Refused: PASS without a reproduced OK for: %s.\n  A check that failed, was skipped or was not run has not passed. Run it in the proof step, send the work back (REWORK),\n  or let the user decide: vizflow.py waive <check> --by <name> --reason \"...\"" %
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
        approvals(j, s["item"])
        new = [m for m in memory_rows(j.events(), confirmed=False) if m.get("item") == s["item"]]
        for m in new:
            print("PROPOSED LESSON %s for %s: %s  - ask the user; confirm only if they agree" % (m["id"], ", ".join(m["where"]), safe.clean(m["text"], 200) if safe else m["text"]))
        n, h = j.head()
        print("ANCHOR %d:%s  - put this line in your report to the requester; it proves later that the record was not rewritten" % (n, h[:24]))
        print("ask the user to look at the result, then record it: vizflow.py accept %s --by <name>   or   vizflow.py remark %s \"...\" --cause agent|brief|taste" % (s["item"], s["item"]))
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
        if a.out:  # the result of the comparison as evidence for the check `invariants`
            me = os.path.abspath(__file__)
            res = {"invariants": {"status": "FAIL" if keys else "OK", "text": "%d keys differ%s" % (len(keys), ": " + ", ".join(keys[:6]) if keys else ""), "data": keys[:200]}}
            res = {"invariants": res["invariants"],
                   "_receipt": {"tool": os.path.basename(me), "tool_sha": file_sha(me), "results_sha": hashlib.sha256(json.dumps(res, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest(), "inputs": {os.path.basename(x): file_sha(x) for x in (a.before, a.after) if os.path.isfile(x)},
                                "at": time.strftime("%Y-%m-%dT%H:%M:%S")}}
            with open(a.out, "w", encoding="utf-8") as f:
                json.dump(res, f, indent=1, ensure_ascii=False)
        sys.exit(1 if keys else 0)


if __name__ == "__main__":
    main()
