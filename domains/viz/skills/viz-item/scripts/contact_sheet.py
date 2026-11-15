#!/usr/bin/env python3
"""contact_sheet - one small picture instead of N big ones, for the inspector's single look.
Needs Pillow.  Usage: contact_sheet.py DIR OUT.jpg [--glob "*.png"] [--pick 12] [--cols 4] [--thumb 400]"""
import argparse, fnmatch, os
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument("dir"); ap.add_argument("out"); ap.add_argument("--glob", default="*")
ap.add_argument("--pick", type=int, default=12); ap.add_argument("--cols", type=int, default=4)
ap.add_argument("--thumb", type=int, default=400)
a = ap.parse_args()
exts = (".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff")
names = sorted(n for n in os.listdir(a.dir) if fnmatch.fnmatch(n, a.glob) and n.lower().endswith(exts))
if not names:
    raise SystemExit("no images match")
k = min(a.pick, len(names))
picked = [names[round(i * (len(names) - 1) / max(k - 1, 1))] for i in range(k)] if k > 1 else names[:1]
picked = list(dict.fromkeys(picked))
tiles = []
for n in picked:
    with Image.open(os.path.join(a.dir, n)) as im:
        im = im.convert("RGB")
        im.thumbnail((a.thumb, a.thumb))
        ImageDraw.Draw(im).text((6, 4), os.path.splitext(n)[0][-18:], fill=(255, 255, 0))
        tiles.append(im.copy())
tw, th = max(t.width for t in tiles), max(t.height for t in tiles)
cols = min(a.cols, len(tiles)); rows = -(-len(tiles) // cols)
sheet = Image.new("RGB", (cols * tw, rows * th), (30, 30, 30))
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
sheet.save(a.out, quality=80)
print("sheet %s  %dx%d  %d of %d images  %.0f kB" % (a.out, sheet.width, sheet.height, len(tiles), len(names), os.path.getsize(a.out) / 1024.0))
