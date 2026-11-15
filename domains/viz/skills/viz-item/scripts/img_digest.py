#!/usr/bin/env python3
"""img_digest - prove an image set with numbers instead of looking at every picture.
Prints a digest of at most ~15 lines, writes details to JSON, exits 1 when an expectation fails.
Needs Pillow.  Usage: img_digest.py DIR [--glob "*.png"] [--count 72] [--size 1920x1080]
                      [--max-kb 400] [--loop] [--out digest.json]"""
import argparse, fnmatch, hashlib, json, os, re, sys
from PIL import Image, ImageChops, ImageStat


def small(path):
    with Image.open(path) as im:
        info = {"w": im.width, "h": im.height, "fmt": im.format, "mode": im.mode}
        g = im.convert("L").resize((64, 36))
    st = ImageStat.Stat(g)
    info.update(mean=round(st.mean[0], 1), std=round(st.stddev[0], 1))
    return info, g


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir"); ap.add_argument("--glob", default="*")
    ap.add_argument("--count", type=int); ap.add_argument("--size"); ap.add_argument("--max-kb", type=float)
    ap.add_argument("--loop", action="store_true", help="frames form a closed 360 orbit: check the seam last->first")
    ap.add_argument("--out")
    a = ap.parse_args()
    exts = (".png", ".jpg", ".jpeg", ".webp", ".avif", ".tif", ".tiff", ".exr")
    names = sorted(n for n in os.listdir(a.dir) if fnmatch.fnmatch(n, a.glob) and n.lower().endswith(exts))
    rows, thumbs, fails = [], [], []
    for n in names:
        p = os.path.join(a.dir, n)
        row = {"name": n, "kb": round(os.path.getsize(p) / 1024.0, 1)}
        try:
            info, g = small(p)
            row.update(info); thumbs.append(g)
            with open(p, "rb") as f:
                row["sha"] = hashlib.sha1(f.read()).hexdigest()[:12]
        except Exception as e:  # unreadable file is a finding, not a crash
            row["error"] = str(e)[:80]; thumbs.append(None)
        rows.append(row)
    ok = [r for r in rows if "error" not in r]
    sizes = sorted({"%dx%d" % (r["w"], r["h"]) for r in ok})
    blank = [r["name"] for r in ok if r["std"] < 2.0]
    dark = [r["name"] for r in ok if r["mean"] < 8.0]
    burnt = [r["name"] for r in ok if r["mean"] > 247.0]
    shas = {}
    for r in ok:
        shas.setdefault(r["sha"], []).append(r["name"])
    dups = [v for v in shas.values() if len(v) > 1]
    nums = [int(m.group(1)) for m in (re.search(r"(\d+)\D*$", os.path.splitext(n)[0]) for n in names) if m]
    gaps = sorted(set(range(min(nums), max(nums) + 1)) - set(nums)) if nums and len(nums) == len(names) else []
    # frame-to-frame change: a jump shows a skipped frame, a popped object or a wrong camera step
    steps = []
    for i in range(1, len(thumbs)):
        if thumbs[i] is not None and thumbs[i - 1] is not None:
            steps.append((ImageStat.Stat(ImageChops.difference(thumbs[i], thumbs[i - 1])).mean[0], names[i]))
    med = sorted(s for s, _ in steps)[len(steps) // 2] if steps else 0
    jumps = [n for s, n in steps if med > 0 and s > 3 * med and s > 4]
    seam = None
    if a.loop and len(thumbs) > 2 and thumbs[0] is not None and thumbs[-1] is not None:
        seam = round(ImageStat.Stat(ImageChops.difference(thumbs[0], thumbs[-1])).mean[0], 2)
        if med > 0 and seam > 3 * med and seam > 4:
            fails.append("orbit seam: last->first differs %.1f, typical step %.1f" % (seam, med))
    if a.count is not None and len(names) != a.count:
        fails.append("count %d, expected %d" % (len(names), a.count))
    if a.size and sizes != [a.size]:
        fails.append("sizes %s, expected %s" % (sizes, a.size))
    heavy = [r["name"] for r in rows if a.max_kb and r["kb"] > a.max_kb]
    for label, lst in (("unreadable", [r["name"] for r in rows if "error" in r]), ("blank", blank), ("near-black", dark),
                       ("overexposed", burnt), ("over %s kB" % a.max_kb, heavy), ("missing numbers", gaps), ("jumps at", jumps)):
        if lst:
            fails.append("%s: %d (%s)" % (label, len(lst), ", ".join(map(str, lst[:4]))))
    if dups:
        fails.append("identical files: %d groups (%s)" % (len(dups), " = ".join(dups[0][:3])))
    kbs = [r["kb"] for r in rows] or [0]
    print("images %d  formats %s  sizes %s" % (len(names), sorted({r.get("fmt") for r in ok}), sizes))
    print("kB total %.0f  max %.0f  mean %.0f" % (sum(kbs), max(kbs), sum(kbs) / len(kbs)))
    if ok:
        print("brightness mean %.0f (min %.0f, max %.0f)  typical frame step %.2f%s" %
              (sum(r["mean"] for r in ok) / len(ok), min(r["mean"] for r in ok), max(r["mean"] for r in ok), med,
               "  seam %.2f" % seam if seam is not None else ""))
    set_sha = hashlib.sha1("".join(r.get("sha", "x") for r in rows).encode()).hexdigest()[:12]
    print("set hash %s" % set_sha)
    for f in fails:
        print("FAIL " + f)
    print("RESULT %s (%d findings)" % ("FAIL" if fails else "OK", len(fails)))
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump({"set_sha": set_sha, "fails": fails, "files": rows}, f, indent=1)
        print("details: " + a.out)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
