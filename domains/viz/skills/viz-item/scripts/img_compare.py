#!/usr/bin/env python3
"""img_compare - two pictures of the same view, compared by numbers before anybody looks.

What it answers without eyes - and what it cannot:
  - WHERE the new picture differs from the reference (an earlier approved render, a clay preview, the
    same frame before a model swap): the picture is cut into a grid and each cell compared for
    brightness, colour and the amount of edges. Cells are named like a chessboard: A1 top left.
  - whether it differs only where it was meant to (`--expect "C2,C3,D2"` or `--expect none`);
  - whether the view itself moved (most of the picture differs: a camera, lens or sun problem, not a detail);
  - how grainy the picture is in its flat areas (render noise), against `--max-noise`.
  - whether the whole picture got brighter or darker (exposure, sun, colour management), against `--max-shift`.
The inspector then looks only at the cells this tool names - and is told which cell holds a known
difference, so that "I see nothing wrong" can be told from "I did not see".

It is a coarse filter, not a proof of sameness. Each cell is averaged: a detail much smaller than a cell
stays below the threshold. The tool prints that size for the picture at hand and the largest difference
it saw outside the expected cells, so the reader knows how fine the sieve was. For small details use a finer
`--grid`; for "is it exactly the same" there is no substitute for comparing the scene itself.

Needs Pillow.  Usage: img_compare.py REFERENCE NEW [--grid 8x6] [--expect CELLS|none] [--threshold 6]
                                     [--max-noise 2.5] [--max-shift 3] [--crop OUT_DIR] [--out compare.json]"""
import argparse, json, math, os, sys
import receipt
from PIL import Image, ImageChops, ImageFilter, ImageStat


def cells(w, h, cols, rows):
    for j in range(rows):
        for i in range(cols):
            yield "%s%d" % (chr(65 + i), j + 1), (i * w // cols, j * h // rows, (i + 1) * w // cols, (j + 1) * h // rows)


def noise(im):
    """Grain in the flattest tenth of the picture: the spread of a pixel around its neighbours, 0-255."""
    g = im.convert("L")
    g.thumbnail((960, 960))
    resid = ImageChops.difference(g, g.filter(ImageFilter.MedianFilter(3)))
    edges = g.filter(ImageFilter.FIND_EDGES)
    w, h = g.size
    vals = []
    for _, box in cells(w, h, 12, 8):
        vals.append((ImageStat.Stat(edges.crop(box)).mean[0], ImageStat.Stat(resid.crop(box)).rms[0]))
    vals.sort()
    flat = vals[:max(1, len(vals) // 10)]
    return round(sum(v for _, v in flat) / len(flat), 2)


def compare(ref, new, cols=8, rows=6, threshold=6.0):
    a, b = Image.open(ref).convert("RGB"), Image.open(new).convert("RGB")
    same_shape = abs(a.width / a.height - b.width / b.height) < 0.01
    size = (min(a.width, b.width, 1280), 0)
    size = (size[0], round(size[0] * b.height / b.width))
    a2, b2 = a.resize(size).filter(ImageFilter.GaussianBlur(1.5)), b.resize(size).filter(ImageFilter.GaussianBlur(1.5))
    d = ImageChops.difference(a2, b2).convert("L")
    la, lb = a2.convert("L"), b2.convert("L")
    ea, eb = (x.convert("L").filter(ImageFilter.FIND_EDGES) for x in (a2, b2))
    out = {}
    for name, box in cells(size[0], size[1], cols, rows):
        tone = ImageStat.Stat(d.crop(box)).mean[0]
        edge = abs(ImageStat.Stat(ea.crop(box)).mean[0] - ImageStat.Stat(eb.crop(box)).mean[0])
        lift = ImageStat.Stat(lb.crop(box)).mean[0] - ImageStat.Stat(la.crop(box)).mean[0]
        out[name] = {"tone": round(tone, 1), "edges": round(edge, 1), "lift": round(lift, 2), "changed": tone > threshold or edge > threshold}
    cw, ch = size[0] / float(cols), size[1] / float(rows)
    # a detail of full contrast raises a cell's mean by 255 x its share of the cell; below the threshold it is not seen
    side = math.sqrt(threshold / 255.0 * cw * ch) * b.width / float(size[0])
    return out, same_shape, b, {"detail_px": int(round(side)), "cell_px": [int(round(b.width / float(cols))), int(round(b.height / float(rows)))]}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("reference"); ap.add_argument("new"); ap.add_argument("--grid", default="8x6"); ap.add_argument("--expect")
    ap.add_argument("--threshold", type=float, default=6.0); ap.add_argument("--max-noise", type=float); ap.add_argument("--crop"); ap.add_argument("--out")
    ap.add_argument("--max-shift", type=float, default=3.0, help="largest change of the whole picture's brightness, 0-255, that is not a defect")
    a = ap.parse_args()
    cols, rows = (int(x) for x in a.grid.lower().split("x"))
    grid, same_shape, new, sieve = compare(a.reference, a.new, cols, rows, a.threshold)
    changed = sorted(k for k, v in grid.items() if v["changed"])
    share = len(changed) / float(len(grid))
    want = set() if (a.expect or "").lower() in ("none", "") else {c.strip().upper() for c in a.expect.split(",") if c.strip()}
    rest = {k: max(v["tone"], v["edges"]) for k, v in grid.items() if k not in want}
    top = max(rest, key=rest.get) if rest else None
    # brightness of what was NOT expected to change: a local change must not hide, or fake, a change of exposure
    sieve["shift"] = round(sum(grid[k]["lift"] for k in rest) / len(rest), 2) if rest else 0.0
    fine = ("largest difference outside the expected cells: %s %.1f (threshold %.1f); a full-contrast detail smaller than about %dx%d px "
            "of this %dx%d frame can stay below it, a low-contrast one must be larger" %
            (top, rest[top], a.threshold, sieve["detail_px"], sieve["detail_px"], new.width, new.height)) if top else "every cell was expected to change"
    res = {}
    if a.expect is None:
        res["images.changed"] = {"status": "SKIP", "text": "no --expect given: %d of %d cells differ (%s)" % (len(changed), len(grid), ", ".join(changed[:12]))}
    else:
        stray, quiet = sorted(set(changed) - want), sorted(want - set(changed))
        p = []
        if not same_shape:
            p.append("the two pictures have different proportions: not the same view")
        if share > 0.6 and len(want) < 0.6 * len(grid):
            p.append("%d%% of the picture differs: the camera, the lens, the sun or the exposure moved - this is not a local change" % round(share * 100))
        elif stray:
            p.append("changed where nothing was to change: %s" % ", ".join(stray[:16]))
        if quiet:
            p.append("no visible change where one was expected: %s" % ", ".join(quiet[:16]))
        if abs(sieve["shift"]) > a.max_shift and len(want) < 0.6 * len(grid):
            p.append("the whole picture is %s by %.1f of 255 (limit %.1f) outside the expected cells: exposure, the sun or colour management changed" %
                     ("brighter" if sieve["shift"] > 0 else "darker", abs(sieve["shift"]), a.max_shift))
        res["images.changed"] = {"status": "FAIL" if p else "OK", "data": {"stray": stray, "quiet": quiet, "sieve": sieve},
                                 "text": "; ".join(p) if p else "no cell outside the expected ones differs above the threshold (%d expected cells differ). "
                                                                 "This narrows where to look; it does not show that the rest is the same" % len(changed)}
    n = noise(new)
    if a.max_noise is None:
        res["images.noise"] = {"status": "SKIP", "text": "grain in flat areas %.2f; no --max-noise given" % n}
    else:
        res["images.noise"] = {"status": "OK" if n <= a.max_noise else "FAIL", "text": "grain in flat areas %.2f, limit %.2f" % (n, a.max_noise), "data": n}
    for k, v in res.items():
        print("%-4s %s: %s" % (v["status"], k, v["text"]))
    print("grid %dx%d (a cell is %dx%d px), columns A-%s left to right, rows 1-%d top to bottom; changed cells: %s" %
          (cols, rows, sieve["cell_px"][0], sieve["cell_px"][1], chr(64 + cols), rows, ", ".join(changed[:24]) or "none"))
    print("sieve: " + fine + "; brightness outside the expected cells %+.1f" % sieve["shift"])
    if a.crop and changed:
        os.makedirs(a.crop, exist_ok=True)
        boxes = dict(cells(new.width, new.height, cols, rows))
        for c in changed[:12]:
            new.crop(boxes[c]).save(os.path.join(a.crop, "cell_%s.jpg" % c), quality=88)
        print("crops of the changed cells for the inspector's look: %s (%d files)" % (a.crop, min(len(changed), 12)))
    if a.out:
        json.dump(receipt.stamp(dict(res, grid=grid, changed=changed), __file__), open(a.out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    sys.exit(1 if any(v["status"] == "FAIL" for v in res.values()) else 2 if any(v["status"] == "SKIP" for v in res.values()) else 0)
