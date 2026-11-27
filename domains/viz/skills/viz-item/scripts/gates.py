#!/usr/bin/env python3
"""gates - work declared done without being done, refused at the end of a step (FacetKit plan 2.10).

The journal engine calls these when a step ends DONE; domain.json says what they look for.
  H1 an OK is accepted only from a results file with the shipped tool's receipt - the engine's evidence rule.
  H2 checkFiles: the files that hold the checks (thresholds, rules, the domain file) are hashed when a step
     first starts in an item and compared whenever it ends; a change needs `approve-checks <step> --by <person>`,
     and the approval covers exactly the state the person saw.
  H4 placeholders: rules over the item's JSON files (a model snapshot, a scene digest) for what stands where the
     work should be - a zone without a name, an element on the default layer, a default material. A file the
     rule says a step writes ("after") must be there when that step ends; a file that cannot be read is refused:
     what was not read is not known to be clean.
  H9 the step's handoff (a .md file of work/<ITEM>/ written during the step) names every criterion of the
     step: "<id>: done", "<id>: blocked - why", "<id>: partial - what is left".
"""
import fnmatch, hashlib, json, os, re


def checks_hash(root, patterns):
    """One hash over the files the patterns name, relative to the domain root (sorted paths and contents)."""
    h = hashlib.sha256()
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ("work", ".git", "__pycache__")]
        for name in sorted(files):
            rel = os.path.relpath(os.path.join(dirpath, name), root).replace(os.sep, "/")
            if any(fnmatch.fnmatch(rel, p) for p in patterns):
                h.update(rel.encode("utf-8") + b"\0")
                with open(os.path.join(dirpath, name), "rb") as f:
                    h.update(hashlib.sha256(f.read()).digest())
    return h.hexdigest()


def changed_checks(root, patterns, before):
    return before is not None and checks_hash(root, patterns) != before


def _items(data, rule):
    """The objects a rule looks at: a list in the file, the keys of a mapping, or the file itself."""
    if "list" in rule:
        rows = data.get(rule["list"]) if isinstance(data, dict) else None
        rows = rows if isinstance(rows, list) else []
        want = rule.get("where") or {}
        return [r for r in rows if isinstance(r, dict) and all(r.get(k) == v for k, v in want.items())]
    if "keys" in rule:
        m = data.get(rule["keys"]) if isinstance(data, dict) else None
        return [{"key": k} for k in (m or {})] if isinstance(m, dict) else []
    return [data] if isinstance(data, dict) else []


def placeholders(work, rules, step=None):
    """H4: what in the item's JSON files stands where the work should be: ["<what>: <where>", ...].
    A file that `step` was to write and did not, or one that cannot be read, is itself a finding."""
    out, said = [], set()
    for rule in rules or []:
        name = rule.get("file", "")
        path = os.path.join(work, name)
        if not os.path.isfile(path):
            if step and step in (rule.get("after") or []) and name not in said:
                out.append("%s was to be written by this step and is not there" % name)
                said.add(name)
            continue
        try:
            with open(path, encoding="utf-8-sig") as h:
                data = json.load(h)
        except (ValueError, UnicodeDecodeError) as e:
            if name not in said:
                out.append("%s cannot be read (%s): what was not read is not known to be clean" % (name, str(e)[:60]))
                said.add(name)
            continue
        field = rule.get("field", "key")
        for row in _items(data, rule):
            v = row.get(field)
            hit = (rule.get("empty") and (v is None or str(v).strip() == "")) \
                or ("match" in rule and v is not None and re.search(rule["match"], str(v))) \
                or ("above" in rule and isinstance(v, (int, float)) and v > rule["above"])
            if hit:
                where = row.get("id") or row.get("name") or row.get("key") or rule.get("file")
                out.append("%s: %s" % (rule.get("what", "placeholder"), where))
    return out


STATUS = r"^\s*[-*]?\s*`?%s`?\s*[:—–-]\s*(done|blocked|partial)\b\s*[:—–-]?\s*(.*)$"


def criteria_status(work, ids, since):
    """H9: problems with the statuses the step's handoff gives; the handoff is any .md written since `since`."""
    texts = []
    for name in sorted(os.listdir(work)) if os.path.isdir(work) else []:
        p = os.path.join(work, name)
        if name.endswith(".md") and name != "brief.md" and os.path.isfile(p) and os.path.getmtime(p) >= since:
            texts.append(open(p, encoding="utf-8").read())
    text = "\n".join(texts)
    out = []
    for cid in ids:
        m = re.search(STATUS % re.escape(cid), text, re.I | re.M)
        if not m:
            out.append("criterion %s has no status in the handoff - write \"%s: done\", or \"%s: blocked - why\" / \"%s: partial - what is left\"" % (cid, cid, cid, cid))
        elif m.group(1).lower() != "done" and not m.group(2).strip():
            out.append("criterion %s is %s without a reason" % (cid, m.group(1).lower()))
    return out


def measured_in_step(work, checks, since):
    """A1 (plan 2.11): of these check ids, the ones without an OK in a results file with a receipt written during the step."""
    found = {}
    for name in sorted(os.listdir(work)) if os.path.isdir(work) else []:
        p = os.path.join(work, name)
        if not (name.endswith(".json") and os.path.isfile(p) and os.path.getmtime(p) >= since):
            continue
        try:
            res = json.load(open(p, encoding="utf-8"))
        except ValueError:
            continue
        if isinstance(res, dict) and "_receipt" in res:
            for c in checks:
                if isinstance(res.get(c), dict):
                    found[c] = found.get(c) or res[c].get("status") == "OK"
    return [c for c in checks if not found.get(c)]


def statuses(work, ids, since):
    """What the step's handoff says of each criterion: {id: "done" | "blocked: why" | "partial: what"} (A2)."""
    texts = []
    for name in sorted(os.listdir(work)) if os.path.isdir(work) else []:
        p = os.path.join(work, name)
        if name.endswith(".md") and name != "brief.md" and os.path.isfile(p) and os.path.getmtime(p) >= since:
            texts.append(open(p, encoding="utf-8").read())
    text, out = "\n".join(texts), {}
    for cid in ids:
        m = re.search(STATUS % re.escape(cid), text, re.I | re.M)
        if m:
            out[cid] = m.group(1).lower() + (": " + m.group(2).strip() if m.group(2).strip() else "")
    return out
