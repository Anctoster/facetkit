#!/usr/bin/env python3
"""sheets_check - is the drawing set complete and correctly made up? Checks the list of sheets a
stage requires against what Archicad holds (layouts) and what was published (PDF and DWG files).

Usage: sheets_check.py REQUIRED.json LAYOUTS.json OUTPUT_DIR [--project project.json] [--previous PB_REQUIRED.json] [--out results.json]

REQUIRED.json  {"stage": "PB", "sheets": [{"no": "PB-A-01", "title": "Rzut parteru", "scale": "1:100", "format": "A2", "part": "PAB"}],
                "documents": [{"id": "PAB-opis", "title": "Czesc opisowa", "file": "PAB-opis.pdf"}]}
LAYOUTS.json   {"layouts": [{"no": "PB-A-01", "title": "...", "format": "A2", "drawings": [{"scale": "1:100"}],
                             "titleblock": {"project_name": "...", "designer": "...", ...}, "based_on": "PB-A-01"}]}
               written by the layouts script from the Archicad API."""
import argparse, json, os, re, sys

RES, LINES = {}, []
ISO = {"A0": (841, 1189), "A1": (594, 841), "A2": (420, 594), "A3": (297, 420), "A4": (210, 297)}


def report(cid, problems, ok_text, skip=None):
    status = "SKIP" if skip else "FAIL" if problems else "OK"
    text = skip or (("%d problems: %s" % (len(problems), "; ".join(map(str, problems[:5])))) if problems else ok_text)
    RES[cid] = {"status": status, "text": text, "data": (problems or [])[:200]}
    LINES.append("%-4s %s: %s" % (status, cid, text))


def pdf_size_mm(path):
    from pypdf import PdfReader
    box = PdfReader(path).pages[0].mediabox
    return sorted((float(box.width) * 25.4 / 72, float(box.height) * 25.4 / 72))


def check(required, layouts, out_dir, project=None, previous=None):
    cfg = (project or {}).get("sheets", {})
    want = {s["no"]: s for s in required.get("sheets", [])}
    have = {l.get("no"): l for l in layouts.get("layouts", [])}
    files = set(os.listdir(out_dir)) if out_dir and os.path.isdir(out_dir) else set()
    p = ["sheet %s '%s' has no layout" % (n, want[n].get("title")) for n in sorted(set(want) - set(have))]
    p += ["sheet %s has no PDF" % n for n in sorted(want) if n in have and n + ".pdf" not in files]
    p += ["document %s '%s' is missing (%s)" % (d["id"], d.get("title"), d["file"]) for d in required.get("documents", []) if d["file"] not in files]
    extra = sorted(set(have) - set(want))
    p += ["layout %s is not in the list of sheets for this stage" % n for n in extra]
    report("sheets.complete", p, "%d sheets and %d documents, all present, none extra" % (len(want), len(required.get("documents", []))))
    pat = cfg.get("naming")
    p = ["sheet number '%s' does not follow the pattern %s" % (n, pat) for n in sorted(have) if pat and n and not re.match(pat, n)]
    p += ["sheet %s is titled '%s', the list says '%s'" % (n, have[n].get("title"), want[n].get("title")) for n in sorted(set(want) & set(have)) if want[n].get("title") and have[n].get("title") != want[n]["title"]]
    report("sheets.naming", p, "numbers follow the pattern and titles match the list", None if pat else "no naming pattern in project.json")
    p = []
    for n in sorted(set(want) & set(have)):
        scales = {d.get("scale") for d in have[n].get("drawings", [])}
        if want[n].get("scale") and want[n]["scale"] not in scales:
            p.append("sheet %s: required scale %s, placed drawings are at %s" % (n, want[n]["scale"], ", ".join(sorted(s for s in scales if s)) or "no drawing"))
        if want[n].get("format") and have[n].get("format") != want[n]["format"]:
            p.append("sheet %s: layout is %s, the list says %s" % (n, have[n].get("format"), want[n]["format"]))
    report("sheets.scales", p, "every sheet carries a drawing at its required scale, on its required format")
    p, n_pdf = [], 0
    try:
        for n in sorted(set(want) & set(have)):
            f = os.path.join(out_dir or "", n + ".pdf")
            if os.path.exists(f) and want[n].get("format") in ISO:
                n_pdf += 1
                got, exp = pdf_size_mm(f), sorted(ISO[want[n]["format"]])
                if abs(got[0] - exp[0]) > 2 or abs(got[1] - exp[1]) > 2:
                    p.append("%s.pdf is %.0f x %.0f mm, %s is %d x %d" % (n, got[0], got[1], want[n]["format"], exp[0], exp[1]))
        report("sheets.format", p, "%d PDF pages have the size of their format" % n_pdf, None if n_pdf else "no published PDF to measure")
    except ImportError:
        report("sheets.format", [], "", "pypdf is not installed: page sizes were not measured")
    if cfg.get("dwg", True):
        report("sheets.dwg", ["sheet %s has no DWG" % n for n in sorted(want) if n + ".dwg" not in files], "a DWG accompanies each of the %d sheets" % len(want))
    else:
        report("sheets.dwg", [], "", "DWG is not required by project.json")
    fields = (project or {}).get("titleblock", {}).get("required", [])
    p = ["sheet %s: title block lacks %s" % (n, ", ".join(f for f in fields if not str(have[n].get("titleblock", {}).get(f, "")).strip())) for n in sorted(set(want) & set(have))
         if any(not str(have[n].get("titleblock", {}).get(f, "")).strip() for f in fields)]
    p += ["sheet %s: the title block says stage '%s', the set is '%s'" % (n, have[n]["titleblock"].get("stage"), required.get("stage")) for n in sorted(set(want) & set(have)) if required.get("stage") and have[n].get("titleblock", {}).get("stage") not in (None, "", required["stage"])]
    p += ["sheet %s: the title block says scale %s, the list says %s" % (n, have[n]["titleblock"].get("scale"), want[n]["scale"]) for n in sorted(set(want) & set(have)) if want[n].get("scale") and have[n].get("titleblock", {}).get("scale") not in (None, "", want[n]["scale"])]
    report("titleblock.fields", p, "all %d required fields are filled on every sheet and agree with the list" % len(fields), None if fields else "no required title block fields in project.json")
    if previous is None:
        report("sheets.trace", [], "", "no earlier stage given to trace to")
    else:
        prev = {s["no"] for s in previous.get("sheets", [])}
        p = ["sheet %s names no sheet of the earlier stage it details" % n for n in sorted(set(want) & set(have)) if not have[n].get("based_on")]
        p += ["sheet %s is based on '%s', which the earlier stage does not contain" % (n, have[n]["based_on"]) for n in sorted(set(want) & set(have)) if have[n].get("based_on") and have[n]["based_on"] not in prev]
        covered = {have[n].get("based_on") for n in have}
        p += ["earlier-stage sheet %s is not carried into this stage" % n for n in sorted(prev - covered)]
        report("sheets.trace", p, "every sheet details a sheet of the earlier stage, and none of those is dropped")
    return RES


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("required"); ap.add_argument("layouts"); ap.add_argument("out_dir"); ap.add_argument("--project"); ap.add_argument("--previous"); ap.add_argument("--out")
    a = ap.parse_args()
    load = lambda p: json.load(open(p, encoding="utf-8")) if p else None
    check(load(a.required), load(a.layouts), a.out_dir, load(a.project), load(a.previous))
    print("\n".join(LINES))
    c = {s: sum(1 for r in RES.values() if r["status"] == s) for s in ("OK", "FAIL", "SKIP")}
    print("RESULT passed %d  failed %d  skipped %d" % (c["OK"], c["FAIL"], c["SKIP"]))
    if a.out:
        json.dump(RES, open(a.out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    sys.exit(1 if c["FAIL"] else 0)
