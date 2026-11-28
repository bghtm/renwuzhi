#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""新增一期（跨圈或药圈）：一条命令生成幻灯片、封面、元数据，并重建站点数据。

例：
  python tools/add-episode.py --series od --num 2 \\
      --title "药圈人物志极速版（2）" --topic "第 2 期" \\
      --guests "甲,乙,丙" \\
      --video "D:\\media\\od02.mp4" \\
      --deck "D:\\media\\od02.pptx" \\
      --cover "D:\\media\\od02_cover.png"

做的事：
  1. deck.pptx → 逐页 PNG（PowerPoint COM）→ site/media/slides/<id>/NN.webp
  2. cover.png → site/media/covers/<id>.webp + <id>-thumb.webp
  3. 探测视频时长/分辨率/大小（ffprobe；也可直接给 URL）
  4. 写 content/<series>/<id>/meta.json（+ 备份 deck / cover）
  5. 运行 tools/build-data.py 重建 site/data/episodes.json

完成后：
  - 本地 node server.mjs 直接能看到新一期（视频按 meta 里的路径或 URL 播放）
  - 上 GitHub Pages 时，把 meta 里列出的同名文件传到你的存储（见 docs/DEPLOY.md）
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site")
CONTENT = os.path.join(ROOT, "content")
BUILD_SLIDES = os.path.join(ROOT, ".build", "slides")
PS1 = os.path.join(ROOT, "tools", "export-slides.ps1")

SERIES_INFO = {
    "kuake": dict(prefix="ep", label="跨圈人物志极速版", dl="跨圈人物志极速版"),
    "od": dict(prefix="od", label="药圈人物志极速版", dl="药圈人物志极速版"),
}

FFPROBE = shutil.which("ffprobe") or r"D:\code\python\Bvideo\ffmpeg-2025-10-09-git-469aad3897-essentials_build\bin\ffprobe.exe"


def human_size(b):
    if b >= 1024 ** 3:
        return f"{b / 1024 ** 3:.2f} GB"
    if b >= 1024 ** 2:
        return f"{b / 1024 ** 2:.1f} MB"
    return f"{max(1, round(b / 1024))} KB"


def clock(sec):
    s = int(round(sec))
    h, m, s = s // 3600, (s % 3600) // 60, s % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def probe_video(path):
    out = subprocess.run(
        [FFPROBE, "-v", "error", "-show_entries",
         "format=duration,size:stream=codec_type,width,height", "-of", "json", path],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    if out.returncode != 0:
        raise SystemExit(f"ffprobe 读不了这个视频：{path}")
    o = json.loads(out.stdout)
    v = next((s for s in o["streams"] if s.get("codec_type") == "video"), {})
    size = os.path.getsize(path)
    return dict(file=os.path.abspath(path), url="", size=size,
                sizeText=human_size(size),
                duration=round(float(o["format"]["duration"]), 2),
                width=int(v.get("width") or 0), height=int(v.get("height") or 0))


def export_deck(deck, key):
    """PowerPoint COM（仅 Windows）。deck 已复制到 content 里。"""
    if os.name != "nt":
        raise SystemExit("导出幻灯片需要 Windows + PowerPoint；在 macOS/Linux 上请先准备好 site/media/slides/<id>。")
    cmd = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PS1,
           "-Pptx", deck, "-Key", key, "-Out", BUILD_SLIDES]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res.returncode != 0:
        raise SystemExit("导出幻灯片失败：\n" + (res.stdout or "") + (res.stderr or ""))
    src_dir = os.path.join(BUILD_SLIDES, key)
    if not os.path.isdir(src_dir):
        raise SystemExit("导出后没找到 PNG 目录：" + src_dir)
    return src_dir


def build_slides_webp(png_dir, key):
    dst = os.path.join(SITE, "media", "slides", key)
    os.makedirs(dst, exist_ok=True)
    pngs = sorted(f for f in os.listdir(png_dir) if f.lower().endswith(".png"))
    n = 0
    for f in pngs:
        n += 1
        im = Image.open(os.path.join(png_dir, f)).convert("RGB")
        w, h = im.size
        if w != 1600:
            im = im.resize((1600, max(1, round(h * 1600 / w))), Image.LANCZOS)
        im.save(os.path.join(dst, f"{n:02d}.webp"), "WEBP", quality=80, method=6)
    return n


def build_cover(cover_path, key):
    im = Image.open(cover_path).convert("RGB")
    out = os.path.join(SITE, "media", "covers")
    os.makedirs(out, exist_ok=True)

    def save(img, width, path, q):
        w, h = img.size
        if w != width:
            img = img.resize((width, max(1, round(h * width / w))), Image.LANCZOS)
        img.save(path, "WEBP", quality=q, method=6)

    save(im, 1280, os.path.join(out, f"{key}.webp"), 82)
    save(im, 560, os.path.join(out, f"{key}-thumb.webp"), 78)


def main():
    try:  # Windows 控制台可能是 GBK，避免出现无法编码的字符时直接崩掉
        sys.stdout.reconfigure(errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="新增一期并重建站点数据")
    ap.add_argument("--series", default="kuake", choices=["kuake", "od"])
    ap.add_argument("--num", type=int, required=True)
    ap.add_argument("--title", default="")
    ap.add_argument("--topic", default="")
    ap.add_argument("--guests", default="", help="逗号分隔")
    ap.add_argument("--summary", default="")
    ap.add_argument("--video", required=True, help="本地 mp4 路径，或 https:// 开头的地址")
    ap.add_argument("--deck", default="", help="配套 pptx")
    ap.add_argument("--cover", default="", help="封面图 png/jpg；不给则用幻灯片第 1 页")
    ap.add_argument("--variants", default="", help="额外版本：路径=标签;路径=标签")
    ap.add_argument("--no-build", action="store_true", help="只生成素材，不重建数据")
    args = ap.parse_args()

    info = SERIES_INFO[args.series]
    key = f"{info['prefix']}{args.num:02d}"
    work = os.path.join(CONTENT, args.series, key)
    os.makedirs(work, exist_ok=True)

    title = args.title or f"{info['label']}（{args.num}）"
    guests = [g.strip() for g in re.split(r"[,，]", args.guests) if g.strip()]

    print(f"\n新增 {info['label']} 第 {args.num} 期 → id={key}")
    print("-" * 52)

    # 1. deck
    deck_dst = ""
    if args.deck:
        if not os.path.isfile(args.deck):
            raise SystemExit("找不到 pptx：" + args.deck)
        deck_dst = os.path.join(work, "deck.pptx")
        shutil.copyfile(args.deck, deck_dst)
        png_dir = export_deck(deck_dst, key)
        n_slides = build_slides_webp(png_dir, key)
        print(f"  幻灯片    {n_slides} 页 → site/media/slides/{key}/")
    else:
        n_slides = 0
        print("  幻灯片    未提供 deck（这一期没有 PPT）")

    # 2. cover
    cover_dst = ""
    if args.cover:
        if not os.path.isfile(args.cover):
            raise SystemExit("找不到封面：" + args.cover)
        ext = os.path.splitext(args.cover)[1].lower()
        cover_dst = os.path.join(work, "cover" + ext)
        shutil.copyfile(args.cover, cover_dst)
    elif args.deck:
        first = os.path.join(SITE, "media", "slides", key, "01.webp")
        if os.path.exists(first):
            cover_dst = first
    if cover_dst:
        build_cover(cover_dst, key)
        print(f"  封面      → site/media/covers/{key}.webp")
    else:
        print("  封面      未生成（可稍后补 --cover）")

    # 3. video
    if args.video.startswith(("http://", "https://")):
        video = dict(file="", url=args.video, size=0, sizeText="在线", duration=0, width=0, height=0)
        print("  视频      使用外部地址：" + args.video)
    else:
        if not os.path.isfile(args.video):
            raise SystemExit("找不到视频：" + args.video)
        video = probe_video(args.video)
        print(f"  视频      {video['sizeText']} · {video['width']}×{video['height']} · "
              f"{clock(video['duration'])}（本地路径，Pages 需上传后改成 URL）")

    variants = []
    for i, chunk in enumerate([c for c in args.variants.split(";") if c.strip()], start=2):
        path, _, label = chunk.partition("=")
        path = path.strip()
        label = label.strip() or "其他版本"
        if path.startswith(("http://", "https://")):
            variants.append(dict(file="", url=path, size=0, sizeText="在线", duration=0,
                                 width=0, height=0, label=label))
        else:
            v = probe_video(path)
            v["label"] = label
            variants.append(v)
    if variants:
        print(f"  额外版本  {len(variants)} 个")

    dl_base = f"{info['dl']}（{args.num:02d}）"
    meta = dict(
        id=key, series=args.series, num=args.num, kind="episode",
        title=title, topic=(args.topic or None), guests=guests,
        summary=args.summary or (f"本期收录 {len(guests)} 位人物档案" if guests else ""),
        slideKey=(key if n_slides else ""),
        cover=os.path.relpath(cover_dst, ROOT).replace("\\", "/") if cover_dst else "",
        deck=os.path.relpath(deck_dst, ROOT).replace("\\", "/") if deck_dst else "",
        video=video, variants=variants,
        ppt=dict(url="", downloadName=dl_base + "配套PPT.pptx") if deck_dst else None,
        videoDownloadName=dl_base + ".mp4",
    )
    meta_path = os.path.join(work, "meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(f"  元数据    {os.path.relpath(meta_path, ROOT)}")

    if not args.no_build:
        print("\n重建站点数据 ...")
        env = dict(os.environ, PYTHONIOENCODING="utf-8")
        res = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build-data.py")],
                             capture_output=True, text=True, encoding="utf-8", errors="replace",
                             env=env)
        print((res.stdout or "").strip())
        if res.returncode != 0:
            print((res.stderr or "").strip(), file=sys.stderr)
            raise SystemExit("build-data.py 失败")

    print("\n上传清单（GitHub Pages 需要这些文件在外部存储里，名字保持不变）：")
    if video.get("file"):
        print(f"  视频  {video['sizeText']:<9} → 视频存储 / {meta['videoDownloadName']}")
    if deck_dst:
        size = human_size(os.path.getsize(deck_dst))
        print(f"  PPT   {size:<9} → 文件存储 / {meta['ppt']['downloadName']}")
    print("\n然后：node server.mjs 本地预览；git push 后 GitHub Actions 自动发布（docs/DEPLOY.md）。\n")


if __name__ == "__main__":
    main()
