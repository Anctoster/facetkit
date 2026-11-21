#!/usr/bin/env python3
"""trace - does the delivered set answer the task, clause by clause, and does it hold nothing the task
did not ask for? For checking the office's own set against the client's questionnaire, and a
consultant's or subcontractor's drawings and schedules against what they were asked to do.

The task is cut into numbered clauses once (by the reader; the architect confirms the list). Each
clause then points at the place that answers it, and the tool goes and looks: the sheet exists, the
schedule really holds the row, the model really holds the element. A clause answered only by
somebody's word is listed apart, under the name of the person who gave it.

Usage: trace.py REQUIREMENTS.json --dir DELIVERED_DIR [--layouts layouts.json] [--snapshot snapshot.json] [--out results.json] [--md trace.md]

requirements.json
  {"task": "ankieta-inwestora.pdf",
   "clauses": [{"id": "4.2", "text": "Ogrzewanie podlogowe w przedpokoju", "source": "ankieta s.3",
                "evidence": [{"kind": "table", "file": "EOM-zestawienie.csv", "find": "ogrzewanie pod.*przedpok"}]},
               {"id": "5.1", "text": "Listwa przypodlogowa ukryta", "source": "ankieta s.4",
                "evidence": [{"kind": "table", "file": "wykonczenie.csv", "find": "listw.*ukryt"}]}],
   "inventory": [{"file": "wykonczenie.csv", "column": "Pozycja", "allowed": ["Grunt*"]}]}
evidence kinds:  sheet  {"ref": "EOM-3", "find": "<text on the sheet, optional>"}
                 table  {"file": "<csv|txt|md in DIR>", "find": "<regular expression>", "column": "<optional>"}
                 model  {"type": "door", "where": [{"field": "name", "match": "DW*"}], "min_count": 1}
                 person {"by": "<name>", "on": "<date>", "note": "..."}   - recorded, not measured
                 none   {"by": "<name>", "reason": "..."}                 - the clause was withdrawn or does not apply
inventory: rows of a delivered table that no clause asks for are listed as extras, unless a pattern allows them."""
import argparse, csv, fnmatch, io, json, os, re, sys
import receipt
import safe

RES, LINES, SHARED = {}, [], []


def report(cid, problems, ok_text, skip=None):
    status = "SKIP" if skip else "FAIL" if problems else "OK"
    problems = [safe.clean(p, 240) for p in problems or []]
    text = safe.clean(skip, 400) if skip else (("%d problems: %s" % (len(problems), "; ".join(problems[:5]))) if problems else ok_text)
    RES[cid] = {"status": status, "text": text, "data": (problems or [])[:200]}
    LINES.append("%-4s %s: %s" % (status, cid, text))


def read_text(path):
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "cp1250", "cp1251"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    return raw.decode("utf-8", "replace")


def table(path):
    """Rows of a delimited file as dicts; the delimiter is the one the header line uses most."""
    txt = read_text(path)
    head = txt.splitlines()[0] if txt.strip() else ""
    delim = max(";,\t|", key=head.count) if head else ","
    return list(csv.DictReader(io.StringIO(txt), delimiter=delim))


def pdf_text(path):
    try:
        from pypdf import PdfReader
    except ImportError:
        return None
    try:
        return "\n".join((pg.extract_text() or "") for pg in PdfReader(path).pages)
    except Exception:
        return None


def within(base, path):
    """The path only if, with links resolved, it lies inside the delivered folder: evidence may not point anywhere else."""
    b, t = os.path.realpath(base), os.path.realpath(path)
    try:
        return path if os.path.commonpath([b, t]) == b else None
    except ValueError:
        return None


def look(ev, ctx):
    """(found?, where it was found or why not). None means the place could not be read at all."""
    kind = ev.get("kind")
    if kind in ("table", "sheet") and not within(ctx["dir"], os.path.join(ctx["dir"], ev.get("file") or (ev.get("ref", "") + ".pdf"))):
        return False, "'%s' points outside the delivered folder" % (ev.get("file") or ev.get("ref"))
    if kind in ("table", "sheet") and (kind == "table" or ev.get("find")):
        why = safe.bad_regex(ev.get("find"))
        if why:
            return False, "'%s' cannot be used as evidence: %s" % (safe.clean(ev.get("find"), 60), why)
    if kind == "table":
        path = os.path.join(ctx["dir"], ev.get("file", ""))
        if not os.path.isfile(path):
            return False, "file %s is not in the delivered set" % ev.get("file")
        rx = re.compile(ev["find"], re.I)
        if path.lower().endswith((".csv", ".tsv")):
            for n, row in enumerate(table(path), 2):
                cell = row.get(ev["column"], "") if ev.get("column") else " ".join(str(v) for v in row.values() if v)
                if rx.search((cell or "")[:2000]):
                    whole = " | ".join(str(v) for v in row.values() if v)
                    return True, "%s row %d: '%s'" % (ev["file"], n, safe.clean(whole, 90))
            return False, "no row of %s matches '%s'" % (ev["file"], ev["find"])
        for n, line in enumerate(read_text(path).splitlines(), 1):
            if rx.search(line[:2000]):
                return True, "%s line %d: '%s'" % (ev["file"], n, safe.clean(line, 90))
        return False, "nothing in %s matches '%s'" % (ev["file"], ev["find"])
    if kind == "sheet":
        ref = ev.get("ref", "")
        pdf = os.path.join(ctx["dir"], ref + ".pdf")
        if ref not in ctx["sheets"] and not os.path.isfile(pdf):
            return False, "sheet %s is not in the set" % ref
        if not ev.get("find"):
            return True, "sheet %s exists (its content was not read: no 'find' given)" % ref
        txt = pdf_text(pdf) if os.path.isfile(pdf) else None
        if txt is None:
            return None, "sheet %s exists but its text cannot be read here" % ref
        return (True, "sheet %s" % ref) if re.search(ev["find"], txt, re.I) else (False, "sheet %s does not carry '%s'" % (ref, ev["find"]))
    if kind == "model":
        if ctx["snapshot"] is None:
            return None, "no model snapshot given"
        n = 0
        for e in ctx["snapshot"].get("elements", []):
            if ev.get("type") and e.get("type") != ev["type"]:
                continue
            get = lambda f: e.get(f) if f in e else (e.get("props") or {}).get(f)
            if all(("match" not in w or fnmatch.fnmatch(str(get(w["field"]) or "").lower(), str(w["match"]).lower())) and ("eq" not in w or get(w["field"]) == w["eq"]) for w in ev.get("where", [])):
                n += 1
        need = ev.get("min_count", 1)
        return (n >= need), "%d matching elements in the model, %d needed" % (n, need)
    return False, "unknown kind of evidence '%s'" % kind


def run(req, ctx):
    cl = req.get("clauses", [])
    ids = [c.get("id") for c in cl]
    p = ["the task was not cut into clauses"] if not cl else []
    p += ["clause id used twice: %s" % i for i in sorted({i for i in ids if i and ids.count(i) > 1})]
    p += ["clause %s lacks %s" % (c.get("id", "?"), ", ".join(k for k in ("id", "text", "source") if not c.get(k))) for c in cl if not all(c.get(k) for k in ("id", "text", "source"))]
    p += ["clause %s reads like an instruction to whoever reads it, not like a requirement for the building: show the architect ('%s')" % (c.get("id"), safe.clean(c.get("text"), 70))
          for c in cl if safe.suspect(c.get("text", ""))]
    report("trace.clauses", p, "%d clauses, each with its own number and the place in the task it comes from" % len(cl))
    rows, missing, blind, used_rx = [], [], [], {}
    for c in cl:
        evs = c.get("evidence") or []
        state, notes = "not answered", []
        if not evs:
            notes.append("nothing points at an answer")
        for ev in evs:
            if ev.get("kind") == "person":
                ok, where = (bool(ev.get("by") and ev.get("on")), "word of %s, %s%s" % (ev.get("by", "?"), ev.get("on", "no date"), ": " + ev["note"] if ev.get("note") else ""))
                state = "by word" if ok and state != "found" else state
            elif ev.get("kind") == "none":
                ok, where = (bool(ev.get("by") and ev.get("reason")), "withdrawn by %s: %s" % (ev.get("by", "?"), ev.get("reason", "no reason")))
                state = "withdrawn" if ok else state
            else:
                ok, where = look(ev, ctx)
                if ev.get("kind") == "table" and ev.get("file"):
                    used_rx.setdefault(ev["file"], []).append(ev["find"])
                if ok:
                    state = "found"
                elif ok is None and state == "not answered":
                    state = "unreadable"
            notes.append(where)
        rows.append((c.get("id"), c.get("text", ""), state, "; ".join(notes)))
        if state == "not answered":
            missing.append("clause %s '%s': %s" % (c.get("id"), c.get("text", "")[:60], "; ".join(notes)))
        elif state == "unreadable":
            blind.append("clause %s: %s" % (c.get("id"), "; ".join(notes)))
    place = {}
    for i, _, state, note in rows:
        for m in re.finditer(r"(\S+ (?:row|line) \d+):", note if state == "found" else ""):
            place.setdefault(m.group(1), []).append(i)
    SHARED[:] = ["%s answers clauses %s" % (k, ", ".join(v)) for k, v in sorted(place.items()) if len(v) > 1]
    found = sum(1 for r in rows if r[2] == "found")
    word = sum(1 for r in rows if r[2] == "by word")
    report("trace.covered", missing, "%d clauses: %d found in the set, %d by a person's word, %d withdrawn" % (len(rows), found, word, sum(1 for r in rows if r[2] == "withdrawn")),
           None if rows else "no clauses")
    if blind:
        report("trace.readable", [], "", "%d clauses point at a place that cannot be read here: %s" % (len(blind), "; ".join(blind[:3])))
    extras, looked = [], 0
    for inv in req.get("inventory", []):
        path = os.path.join(ctx["dir"], inv["file"])
        if not within(ctx["dir"], path) or not os.path.isfile(path):
            extras.append("inventory file %s is not in the delivered set" % inv["file"])
            continue
        rxs = [re.compile(r, re.I) for r in used_rx.get(inv["file"], [])]
        for n, row in enumerate(table(path), 2):
            key = (row.get(inv["column"]) or "").strip()
            if not key:
                continue
            looked += 1
            whole = " ".join(str(v) for v in row.values() if v)
            if not any(r.search(whole) for r in rxs) and not any(fnmatch.fnmatch(key.lower(), a.lower()) for a in inv.get("allowed", [])):
                extras.append("%s row %d '%s' answers no clause of the task" % (inv["file"], n, key[:50]))
    report("trace.extras", extras, "%d rows of the delivered tables, each asked for by a clause or allowed" % looked, None if req.get("inventory") else "no 'inventory' table named: extras were not looked for")
    return rows


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("requirements"); ap.add_argument("--dir", required=True); ap.add_argument("--layouts"); ap.add_argument("--snapshot"); ap.add_argument("--out"); ap.add_argument("--md")
    a = ap.parse_args()
    load = lambda p: json.load(open(p, encoding="utf-8")) if p else None
    lay = load(a.layouts) or {}
    rows = run(load(a.requirements), {"dir": a.dir, "sheets": {l.get("no") for l in lay.get("layouts", [])}, "snapshot": load(a.snapshot)})
    print("\n".join(LINES))
    for i, text, state, note in [r for r in rows if r[2] != "found"][:12]:
        print("  %-6s %-12s %s  <- %s" % (i, state.upper(), text[:50], note[:90]))
    for line in SHARED[:8]:
        print("  ONE PLACE FOR SEVERAL CLAUSES: %s - check that each of them is really there" % line)
    c = {s: sum(1 for r in RES.values() if r["status"] == s) for s in ("OK", "FAIL", "SKIP")}
    print("RESULT passed %d  failed %d  skipped %d   ('found' means the expression matched the row shown in --md; read the rows)" % (c["OK"], c["FAIL"], c["SKIP"]))
    if a.md:
        with open(a.md, "w", encoding="utf-8") as f:
            f.write("| Clause | Requirement | Result | Where, and the text that was found |\n|---|---|---|---|\n" +
                    "".join("| %s | %s | %s | %s |\n" % tuple(safe.clean(x, 200).replace("|", "/") for x in r) for r in rows))
    if a.out:
        json.dump(receipt.stamp(RES, __file__), open(a.out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    sys.exit(1 if c["FAIL"] else 2 if c["SKIP"] else 0)
