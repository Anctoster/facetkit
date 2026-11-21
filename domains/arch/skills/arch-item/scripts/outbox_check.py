#!/usr/bin/env python3
"""outbox_check - the last look at a folder before it goes to the client, a consultant or the authority.
It finds what a tired person sends by accident: working files, the office's own notes and review
comments, empty cells in schedules, products that are no longer made, and areas in a table that
disagree with the model.

Usage: outbox_check.py DIR [--config outbox.json] [--snapshot snapshot.json] [--out results.json]

outbox.json (all keys optional)
  {"forbidden_text": ["<regular expression>", ...],      added to the built-in list of office-only wording
   "forbidden_files": ["*.pln", ...],                    added to the built-in list of working files
   "allowed_ext": [".pdf", ".dwg", ".csv"],              anything else in the folder is reported
   "allowed_authors": ["Biuro *", "A. Nowak"],           names that may stay in the files' properties; others are reported
   "discontinued": "discontinued.csv" | ["ART-1", ...],  article numbers that may not appear
   "tables": [{"file": "*.csv", "required": ["Artykul", "Ilosc"], "article_column": "Artykul",
               "area": {"number_column": "Nr", "area_column": "Powierzchnia"}}]}
Reads text in txt, md, csv, json, xml, html; PDF text and annotations (needs pypdf); in docx and xlsx also review
comments, tracked changes that were never accepted (the deleted text is still in the file), hidden text, hidden
sheets, headers and footers, and the names stored in the file's properties. A file or a page it cannot read is
named - a scanned page, an archive too large to be a document: what was not read is not known to be clean.
"OK" here means: in what was read, nothing was found. It never means the folder is clean."""
import argparse, csv, fnmatch, io, json, os, re, sys, zipfile
import receipt
import safe

RES, LINES = {}, []
TEXT_EXT = (".txt", ".md", ".csv", ".tsv", ".json", ".xml", ".html", ".htm")
WORKING = ["*.bak", "*.bpn", "*.pln", "*.pla", "*.tpl", "*.blend", "*.blend1", "*.lock", "~$*", "Thumbs.db", ".DS_Store", "*.tmp",
           "journal.jsonl", "brief.md", "proof.md", "run.md", "project.json", "routes.json"]
INTERNAL = [r"\bTODO\b", r"\bFIXME\b", r"\?\?\?", r"не\s+отправлять", r"для\s+внутренн", r"внутренн\w+\s+(коммент|замеч|пометк)", r"nie\s+wysy[lł]a[cć]",
            r"\bwewn[eę]trzn\w+\s+(uwag|notat|komentarz)", r"do\s+not\s+send", r"internal\s+(only|note|comment)", r"\buzgodni[cć]\s+z\s+szefem\b", r"спросить\s+у\b"]


def report(cid, problems, ok_text, skip=None):
    status = "SKIP" if skip else "FAIL" if problems else "OK"
    problems = [safe.clean(p, 240) for p in problems or []]
    text = safe.clean(skip, 400) if skip else (("%d problems: %s" % (len(problems), "; ".join(problems[:5]))) if problems else ok_text)
    RES[cid] = {"status": status, "text": text, "data": (problems or [])[:200]}
    LINES.append("%-4s %s: %s" % (status, cid, text))


def decode(raw):
    for enc in ("utf-8-sig", "cp1250", "cp1251"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    return raw.decode("utf-8", "replace")


def table(path):
    txt = decode(open(path, "rb").read())
    head = txt.splitlines()[0] if txt.strip() else ""
    return list(csv.DictReader(io.StringIO(txt), delimiter=max(";,\t|", key=head.count) if head else ","))


def strip_xml(b):
    return re.sub(r"<[^>]+>", " ", decode(b))


ZIP_FILES, ZIP_MEMBER, ZIP_TOTAL = 5000, 50 * 1024 * 1024, 200 * 1024 * 1024


def open_zip(path):
    """An office document is an archive. One that unpacks to more than a document can be is not opened."""
    z = zipfile.ZipFile(path)
    infos = z.infolist()
    if len(infos) > ZIP_FILES or any(i.file_size > ZIP_MEMBER for i in infos) or sum(i.file_size for i in infos) > ZIP_TOTAL:
        raise ValueError("the archive inside is larger than a document can be")
    return z, [i.filename for i in infos]


def contents(path):
    """What one file holds: {"text", "notes" (things a recipient was not meant to see), "meta" (names of people and
    firms stored in the file), "read": True | False | None (a kind this tool does not read), "why"}."""
    low, out = path.lower(), {"text": "", "notes": [], "meta": [], "read": True, "why": ""}
    try:
        if low.endswith(TEXT_EXT):
            out["text"] = decode(open(path, "rb").read())
        elif low.endswith((".docx", ".xlsx")):
            z, names = open_zip(path)
            parts = [n for n in names if n in ("word/document.xml", "xl/sharedStrings.xml") or re.match(r"word/(footnotes|endnotes|header\d*|footer\d*)\.xml$", n)]
            out["text"] = " ".join(strip_xml(z.read(n)) for n in parts)
            out["notes"] += ["review comment: '%s'" % strip_xml(z.read(n)).strip()[:80] for n in names if re.match(r"(word/comments|xl/comments|xl/threadedComments/)", n) and strip_xml(z.read(n)).strip()]
            if "word/document.xml" in names:
                doc = decode(z.read("word/document.xml"))
                gone = [re.sub(r"<[^>]+>", "", m).strip() for m in re.findall(r"<w:delText[^>]*>(.*?)</w:delText>", doc, re.S)]
                if gone:
                    out["notes"].append("tracked changes not accepted - deleted text still inside: '%s'" % " ".join(g for g in gone if g)[:80])
                    out["text"] += " " + " ".join(gone)
                elif "<w:ins " in doc or "<w:del " in doc:
                    out["notes"].append("tracked changes not accepted")
                if "<w:vanish" in doc:
                    out["notes"].append("hidden text")
            if "xl/workbook.xml" in names:
                wb = decode(z.read("xl/workbook.xml"))
                hid = [re.search(r'name="([^"]*)"', m).group(1) for m in re.findall(r"<sheet\b[^>]*>", wb) if re.search(r'state="(hidden|veryHidden)"', m) and re.search(r'name="([^"]*)"', m)]
                out["notes"] += ["hidden sheet '%s'" % h for h in hid]
            for n, tags in (("docProps/core.xml", ("dc:creator", "cp:lastModifiedBy")), ("docProps/app.xml", ("Company", "Manager"))):
                if n in names:
                    x = decode(z.read(n))
                    out["meta"] += [m.strip() for t in tags for m in re.findall(r"<%s[^>]*>([^<]+)</%s>" % (t, t), x) if m.strip()]
        elif low.endswith(".pdf"):
            from pypdf import PdfReader
            rd, text, blank = PdfReader(path), [], 0
            for pg in rd.pages:
                t = pg.extract_text() or ""
                blank += 0 if t.strip() else 1
                text.append(t)
                for an in pg.get("/Annots") or []:
                    an = an.get_object()
                    if an.get("/Subtype") in ("/Text", "/FreeText", "/Highlight", "/Popup", "/Ink", "/Squiggly", "/StrikeOut", "/Underline", "/Caret") and an.get("/Contents"):
                        out["notes"].append("review comment: '%s'" % str(an["/Contents"])[:80])
            out["text"] = "\n".join(text)
            md = rd.metadata or {}
            out["meta"] += [str(md[k]).strip() for k in ("/Author",) if md.get(k) and str(md[k]).strip()]
            if blank:
                out["read"], out["why"] = False, "%d of %d pages carry no text (a scan, or text turned into outlines): they were not read" % (blank, len(rd.pages))
        else:
            out["read"] = None
    except ImportError:
        out["read"], out["why"] = False, "reading PDF needs the pypdf package"
    except Exception as e:
        out["read"], out["why"] = False, "%s: %s" % (type(e).__name__, str(e)[:80])
    return out


def number(v):
    try:
        return float(str(v).replace(" ", "").replace(" ", "").replace(",", "."))
    except ValueError:
        return None


def check(folder, cfg=None, snapshot=None):
    cfg = cfg or {}
    files = sorted(os.path.relpath(os.path.join(d, f), folder) for d, _, fs in os.walk(folder) for f in fs)
    if not files:
        for c in ("outbox.files", "outbox.read", "outbox.internal", "outbox.metadata", "outbox.tables", "outbox.articles", "outbox.areas"):
            report(c, [], "", "the folder is empty")
        return RES
    pats = WORKING + list(cfg.get("forbidden_files") or [])
    p = ["working file in the set: %s" % f for f in files if any(fnmatch.fnmatch(os.path.basename(f), x) for x in pats)]
    if cfg.get("allowed_ext"):
        ok = tuple(e.lower() for e in cfg["allowed_ext"])
        p += ["file of a kind not meant to be sent: %s" % f for f in files if not f.lower().endswith(ok)]
    p += ["empty file: %s" % f for f in files if os.path.getsize(os.path.join(folder, f)) == 0]
    report("outbox.files", p, "%d files, none of them a working file" % len(files))
    rx = [re.compile(x, re.I) for x in INTERNAL + list(cfg.get("forbidden_text") or [])]
    p, unread, read, names = [], [], 0, {}
    for f in files:
        c = contents(os.path.join(folder, f))
        if c["read"] is None:
            continue
        if c["read"] is False:
            unread.append("%s (%s)" % (f, c["why"]))
        else:
            read += 1
        p += ["%s carries a %s" % (f, n) if n.startswith("review") else "%s: %s" % (f, n) for n in c["notes"][:4]]
        for n, line in enumerate(c["text"].splitlines(), 1):
            if any(r.search(line[:2000]) for r in rx):
                p.append("%s line %d: '%s'" % (f, n, line.strip()[:70]))
                break
        if any(r.search(os.path.basename(f)) for r in rx):
            p.append("file name looks office-only: %s" % f)
        for m in c["meta"]:
            names.setdefault(m, []).append(f)
    report("outbox.read", ["not read, so not known to be clean: %s" % u for u in unread],
           "%d files of the kinds this tool reads, every one read to the last page" % read, None if read or unread else "no file of a kind this tool reads")
    report("outbox.internal", p, "%d files read; in what was read, no office-only wording, no review comments, no tracked changes, nothing hidden" % read)
    allowed = [a.lower() for a in cfg.get("allowed_authors") or []]
    stray = ["'%s' is stored as author or firm in %s" % (m, ", ".join(fs[:3])) for m, fs in sorted(names.items()) if not any(fnmatch.fnmatch(m.lower(), a) for a in allowed)]
    report("outbox.metadata", stray if allowed else [], "%d names stored in the files, all on the list of names that may go out" % len(names),
           None if allowed or not names else "names stored inside the files: %s. Put the ones that may go out into 'allowed_authors'" % "; ".join(sorted(names)[:6]))
    tabs = cfg.get("tables") or []
    gone = cfg.get("discontinued")
    if isinstance(gone, str):
        gp = gone if os.path.isabs(gone) else os.path.join(os.path.dirname(cfg.get("_path", "")) or ".", gone)
        gone = [next(iter(r.values()), "") for r in table(gp)] if os.path.isfile(gp) else None
    gone = {str(g).strip().lower() for g in gone or [] if str(g).strip()}
    empty, art, areas, n_cells, n_art, n_area = [], [], [], 0, 0, 0
    zones = {str(e.get("number")): e for e in (snapshot or {}).get("elements", []) if e.get("type") == "zone" and e.get("number")}
    for t in tabs:
        for f in [f for f in files if fnmatch.fnmatch(os.path.basename(f), t.get("file", "*.csv")) and f.lower().endswith((".csv", ".tsv"))]:
            rows = table(os.path.join(folder, f))
            cols = rows[0].keys() if rows else []
            empty += ["%s has no column '%s'" % (f, c) for c in t.get("required", []) if rows and c not in cols]
            for n, row in enumerate(rows, 2):
                for c in t.get("required", []):
                    if c in row:
                        n_cells += 1
                        if not (row[c] or "").strip():
                            empty.append("%s row %d: '%s' is empty" % (f, n, c))
                ac = t.get("article_column")
                if ac and (row.get(ac) or "").strip():
                    n_art += 1
                    if row[ac].strip().lower() in gone:
                        art.append("%s row %d: article %s is no longer made" % (f, n, row[ac].strip()))
                ar = t.get("area")
                if ar and zones and (row.get(ar["number_column"]) or "").strip() in zones:
                    z, v = zones[row[ar["number_column"]].strip()], number(row.get(ar["area_column"]))
                    if v is not None and z.get("area") is not None:
                        n_area += 1
                        if abs(v - z["area"]) > max(0.01, z["area"] * ar.get("tol_pct", 0.5) / 100.0):
                            areas.append("%s row %d: room %s is %.2f m2 in the table, %.2f in the model" % (f, n, z["number"], v, z["area"]))
    report("outbox.tables", empty, "%d required cells, none empty" % n_cells, None if n_cells or empty else "no table with required columns named in the config")
    report("outbox.articles", art, "%d article numbers, none on the list of discontinued ones" % n_art, None if gone and n_art else "needs 'discontinued' and a table with 'article_column'")
    report("outbox.areas", areas, "%d room areas agree with the model" % n_area, None if n_area or areas else "needs --snapshot and a table with 'area' columns")
    return RES


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("dir"); ap.add_argument("--config"); ap.add_argument("--snapshot"); ap.add_argument("--out")
    a = ap.parse_args()
    load = lambda p: json.load(open(p, encoding="utf-8")) if p else None
    cfg = load(a.config) or {}
    cfg["_path"] = a.config or ""
    check(a.dir, cfg, load(a.snapshot))
    print("\n".join(LINES))
    c = {s: sum(1 for r in RES.values() if r["status"] == s) for s in ("OK", "FAIL", "SKIP")}
    print("RESULT passed %d  failed %d  skipped %d   (drawings in dwg and pictures are not read: look at them)" % (c["OK"], c["FAIL"], c["SKIP"]))
    if a.out:
        json.dump(receipt.stamp(RES, __file__), open(a.out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    sys.exit(1 if c["FAIL"] else 2 if c["SKIP"] else 0)
