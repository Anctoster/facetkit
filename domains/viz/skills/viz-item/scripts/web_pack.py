#!/usr/bin/env python3
"""web_pack - turn renders into website images: fixed widths, one format, a size budget, a manifest.
Never upscales, never writes into the source folder, never overwrites without --force.
Needs Pillow.  Usage: web_pack.py SRC DST [--glob "*.png"] [--widths 1920,960] [--format webp]
                      [--quality 82] [--max-kb 400] [--force]"""
import argparse, fnmatch, json, os, sys
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("dst"); ap.add_argument("--glob", default="*")
ap.add_argument("--widths", default="1920,960"); ap.add_argument("--format", default="webp", choices=["webp", "jpg", "png"])
ap.add_argument("--quality", type=int, default=82); ap.add_argument("--max-kb", type=float); ap.add_argument("--force", action="store_true")
a = ap.parse_args()
if os.path.abspath(a.src) == os.path.abspath(a.dst):
    sys.exit("Refused: destination is the source folder.")
os.makedirs(a.dst, exist_ok=True)
exts = (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp")
names = sorted(n for n in os.listdir(a.src) if fnmatch.fnmatch(n, a.glob) and n.lower().endswith(exts))
widths = sorted({int(w) for w in a.widths.split(",")}, reverse=True)
manifest, over, skipped, total = [], [], 0, 0
for n in names:
    with Image.open(os.path.join(a.src, n)) as im:
        keep_alpha = a.format != "jpg" and im.mode in ("RGBA", "LA", "P") and "transparency" in im.info or im.mode in ("RGBA", "LA") and a.format != "jpg"
        base = im.convert("RGBA" if keep_alpha else "RGB")
        fit = [w for w in widths if w <= base.width]
        skipped += len(widths) - len(fit)  # never upscale: a wider file would only add bytes
        for w in fit or [base.width]:  # a source narrower than every width is still delivered, at its own width
            out = base if w == base.width else base.resize((w, round(base.height * w / base.width)), Image.LANCZOS)
            name = "%s_%d.%s" % (os.path.splitext(n)[0], w, a.format)
            path = os.path.join(a.dst, name)
            if os.path.exists(path) and not a.force:
                sys.exit("Refused: %s exists (use --force after checking)." % name)
            if a.format == "webp":
                out.save(path, "WEBP", quality=a.quality, method=6)
            elif a.format == "jpg":
                out.save(path, "JPEG", quality=a.quality, optimize=True, progressive=True)
            else:
                out.save(path, "PNG", optimize=True)
            kb = round(os.path.getsize(path) / 1024.0, 1); total += kb
            manifest.append({"src": n, "file": name, "w": out.width, "h": out.height, "kb": kb})
            if a.max_kb and kb > a.max_kb:
                over.append("%s %.0f kB" % (name, kb))
with open(os.path.join(a.dst, "manifest.json"), "w", encoding="utf-8") as f:
    json.dump({"format": a.format, "quality": a.quality, "widths": widths, "files": manifest}, f, indent=1)
print("sources %d  written %d  not upscaled %d  total %.0f kB" % (len(names), len(manifest), skipped, total))
for o in over[:6]:
    print("FAIL over budget: " + o)
print("RESULT %s  manifest: %s" % ("FAIL" if over else "OK", os.path.join(a.dst, "manifest.json")))
sys.exit(1 if over else 0)
