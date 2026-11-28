#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Convert exported PNGs into web assets.

.build/slides/<key>/slide-NN.png  ->  site/media/slides/<key>/NN.webp  (1600w)
cover PNG in the source folder     ->  site/media/covers/<key>.webp    (1280w)
                                   ->  site/media/covers/<key>-thumb.webp (560w)
The 1~10 combo cover is a 2x2 mosaic of four episode covers.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = r"C:\Users\31996\OneDrive\文档\PrAe\跨圈人物志极速版"
BUILD = os.path.join(ROOT, ".build", "slides")
SITE = os.path.join(ROOT, "site")
COVERS = os.path.join(SITE, "media", "covers")
SLIDES = os.path.join(SITE, "media", "slides")

# key -> (source png, kind)
COVER_MAP = {
    "ep01": ("1b.png", 0), "ep02": ("2b.png", 0), "ep03": ("3b.png", 0),
    "ep04": ("4b.png", 0), "ep05": ("5a.png", 1), "ep06": ("6a.png", 1),
    "ep07": ("7a.png", 1), "ep08": ("8a.png", 1), "ep09": ("9a.png", 1),
    "ep10": ("10a.png", 1), "ep11": ("11a.png", 1),
    "ep01b": ("1c.png", 1), "od01": ("od1.png", 0),
}


def save_webp(img, path, width, quality=82):
    w, h = img.size
    if w != width:
        img = img.resize((width, max(1, round(h * width / w))), Image.LANCZOS)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "WEBP", quality=quality, method=6)


def build_covers():
    total = 0
    for key, (fname, _) in COVER_MAP.items():
        img = Image.open(os.path.join(SRC, fname)).convert("RGB")
        save_webp(img, os.path.join(COVERS, f"{key}.webp"), 1280, 82)
        save_webp(img, os.path.join(COVERS, f"{key}-thumb.webp"), 560, 78)
        total += 2
    print(f"covers: {total}")


def build_slides():
    total = 0
    for key in sorted(os.listdir(BUILD)):
        d = os.path.join(BUILD, key)
        if not os.path.isdir(d):
            continue
        out = os.path.join(SLIDES, key)
        os.makedirs(out, exist_ok=True)
        for f in sorted(os.listdir(d)):
            if not f.lower().endswith(".png"):
                continue
            num = f.split("-")[-1].split(".")[0]
            img = Image.open(os.path.join(d, f)).convert("RGB")
            save_webp(img, os.path.join(out, f"{num}.webp"), 1600, 80)
            total += 1
        print(f"  {key}: {len(os.listdir(out))} slides")
    print(f"slides: {total}")


if __name__ == "__main__":
    os.makedirs(COVERS, exist_ok=True)
    build_covers()
    build_slides()
    print("done")
