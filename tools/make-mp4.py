#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把一期视频转成「能直接播放 + 直接下载」的 MP4（Progressive + faststart）。

为什么不再用 HLS：重编码后每期只有 10–40 MB，远低于 GitHub 100 MB 单文件限制，
普通 MP4 更简单也更好用——浏览器原生播放、HTTP Range 拖动进度条、点一下就能下载，
三者用的是同一个文件。

优先级：
  1. 如果还存在旧的 HLS 切片（site/media/hls/<key>/index.m3u8），先无损 remux（-c copy，几秒）
  2. 没有切片（新一期）或 remux 后超过 --max-mb，就从原片重编码（正常期 1728w/CRF22，
     超长视频 960w/CRF29），仍超限就继续提高 CRF

产物：site/files/video/<下载名>.mp4 + data/mp4.json

用法：
  python tools/make-mp4.py                 # 全部
  python tools/make-mp4.py --only od02,ep12
  python tools/make-mp4.py --force         # 已存在也重做
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
SITE = os.path.join(ROOT, "site")
OUT_DIR = os.path.join(SITE, "files", "video")
HLS_FILE = os.path.join(DATA, "hls.json")
NAMES_FILE = os.path.join(DATA, "media-names.json")
MAP_FILE = os.path.join(DATA, "media-map.json")
EPISODES = os.path.join(SITE, "data", "episodes.json")
MP4_FILE = os.path.join(DATA, "mp4.json")
FFMPEG = shutil.which("ffmpeg") or r"D:\code\python\Bvideo\ffmpeg-2025-10-09-git-469aad3897-essentials_build\bin\ffmpeg.exe"
FFPROBE = shutil.which("ffprobe") or r"D:\code\python\Bvideo\ffmpeg-2025-10-09-git-469aad3897-essentials_build\bin\ffprobe.exe"


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")


def probe(path):
    r = run([FFPROBE, "-v", "error", "-show_entries",
             "format=duration:stream=codec_type,width,height", "-of", "json", path])
    if r.returncode != 0:
        raise SystemExit("ffprobe 失败：" + path)
    o = json.loads(r.stdout)
    v = next((s for s in o["streams"] if s["codec_type"] == "video"), {})
    return dict(duration=float(o["format"]["duration"]),
                width=int(v.get("width") or 0), height=int(v.get("height") or 0))


def detect_crop(path):
    r = run([FFMPEG, "-hide_banner", "-ss", "20", "-t", "10", "-i", path,
             "-vf", "cropdetect=24:16:0", "-f", "null", "-"])
    m = re.findall(r"crop=(\d+):(\d+):(\d+):(\d+)", r.stderr or "")
    if not m:
        return None
    w, h, x, y = (int(v) for v in m[-1])
    if w < 16 or h < 16:
        return None
    return dict(w=w - w % 2, h=h - h % 2, x=x - x % 2, y=y - y % 2)


def remux(playlist, out_path):
    cmd = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y",
           "-fflags", "+genpts", "-i", playlist,
           "-c", "copy", "-movflags", "+faststart",
           "-avoid_negative_ts", "make_zero", out_path]
    r = run(cmd)
    if r.returncode != 0:
        return False, (r.stderr or "")[-800:]
    return True, ""


def encode(src, out_path, max_width, crf, preset="medium"):
    crop = detect_crop(src)
    info = probe(src)
    vf = []
    if crop and (crop["w"] != info["width"] or crop["h"] != info["height"]):
        vf.append(f"crop={crop['w']}:{crop['h']}:{crop['x']}:{crop['y']}")
        if crop["w"] > max_width:
            vf.append(f"scale={max_width}:-2")
    elif info["width"] > max_width:
        vf.append(f"scale={max_width}:-2")
    cmd = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", src]
    if vf:
        cmd += ["-vf", ",".join(vf)]
    cmd += ["-c:v", "libx264", "-profile:v", "high", "-preset", preset,
            "-crf", str(crf), "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "96k", "-ac", "2",
            "-movflags", "+faststart", out_path]
    r = run(cmd)
    if r.returncode != 0:
        raise SystemExit(f"重编码失败：\n{(r.stderr or '')[-1200:]}")


def vname_of(url):
    m = re.match(r"^(?:/v/|/d/v/)(.+)$", url or "")
    return m.group(1) if m else ""


def main():
    try:
        sys.stdout.reconfigure(errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="视频 → 可播放 / 可下载的 MP4")
    ap.add_argument("--only", default="", help="只处理这些 id（逗号分隔，如 od02,ep12）")
    ap.add_argument("--max-mb", type=float, default=95.0, help="单文件上限（GitHub 100MB，留余量）")
    ap.add_argument("--width", type=int, default=1728, help="普通期数编码宽度")
    ap.add_argument("--crf", type=int, default=22)
    ap.add_argument("--long-width", type=int, default=960, help="超长视频（>30 分钟）宽度")
    ap.add_argument("--long-crf", type=int, default=29)
    ap.add_argument("--long-seconds", type=float, default=1800)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-build", action="store_true")
    args = ap.parse_args()

    for f in (NAMES_FILE, MAP_FILE, EPISODES):
        if not os.path.exists(f):
            raise SystemExit(f"缺少 {os.path.relpath(f, ROOT)}，先跑 build-data.py")
    names = json.load(open(NAMES_FILE, encoding="utf-8"))["video"]
    media = json.load(open(MAP_FILE, encoding="utf-8"))["video"]
    model = json.load(open(EPISODES, encoding="utf-8"))
    hls = {}
    if os.path.exists(HLS_FILE):
        try:
            hls = json.load(open(HLS_FILE, encoding="utf-8")).get("items", {})
        except Exception:
            hls = {}

    wanted = {s.strip() for s in args.only.split(",") if s.strip()}
    jobs = []
    for item in model["episodes"] + model["extras"]:
        vn = vname_of((item.get("video") or {}).get("src"))
        if not vn:
            continue
        item_id = vn.rsplit(".", 1)[0]
        if wanted and item_id not in wanted and vn not in wanted:
            continue
        jobs.append((vn, item_id))
    if not jobs:
        raise SystemExit("没有可处理的任务")

    os.makedirs(OUT_DIR, exist_ok=True)
    old = {}
    if os.path.exists(MP4_FILE):
        try:
            old = json.load(open(MP4_FILE, encoding="utf-8")).get("items", {})
        except Exception:
            old = {}

    print(f"\n视频 → MP4：{len(jobs)} 个 → site/files/video/\n")
    results = {}
    total = 0

    for i, (vname, item_id) in enumerate(jobs, start=1):
        dl_name = names.get(vname) or (item_id + ".mp4")
        out_path = os.path.join(OUT_DIR, dl_name)
        src_path = (media.get(vname) or {}).get("path", "")

        if os.path.exists(out_path) and not args.force:
            size_mb = os.path.getsize(out_path) / 1048576
            print(f"  [{i}/{len(jobs)}] {item_id:<9} 已存在，跳过（{size_mb:.1f} MB）")
            p = probe(out_path)
            results[vname] = dict(
                src="files/video/" + quote(dl_name, safe=""),
                bytes=os.path.getsize(out_path),
                width=p["width"], height=p["height"],
                seconds=round(p["duration"], 1),
                mode=old.get(vname, {}).get("mode", "remux"),
            )
            total += os.path.getsize(out_path)
            continue

        t0 = time.time()
        mode = "remux"
        playlist = None
        if hls.get(vname, {}).get("src"):
            cand = os.path.join(SITE, hls[vname]["src"])
            if os.path.isfile(cand):
                playlist = cand

        if playlist:
            ok, err = remux(playlist, out_path)
            if not ok:
                raise SystemExit(f"remux 失败（{item_id}）：\n{err}")
            size_mb = os.path.getsize(out_path) / 1048576
        else:
            size_mb = float("inf")  # 强制走编码分支

        if size_mb > args.max_mb:
            if not src_path or not os.path.isfile(src_path):
                raise SystemExit(f"{item_id} 需要重编码，但找不到原片：{src_path}")
            if os.path.exists(out_path):
                os.remove(out_path)
            dur = probe(src_path)["duration"]
            long_form = dur > args.long_seconds
            width = args.long_width if long_form else args.width
            crf = args.long_crf if long_form else args.crf
            for attempt in range(3):
                encode(src_path, out_path, width, crf)
                size_mb = os.path.getsize(out_path) / 1048576
                mode = f"x264 crf{crf} @{width}w"
                if size_mb <= args.max_mb:
                    break
                print(f"      {size_mb:.0f} MB 超过 {args.max_mb:.0f} MB，提高 CRF 重来 …")
                crf += 2

        p = probe(out_path)
        results[vname] = dict(
            src="files/video/" + quote(dl_name, safe=""),
            bytes=os.path.getsize(out_path),
            width=p["width"], height=p["height"],
            seconds=round(p["duration"], 1),
            mode=mode,
        )
        total += os.path.getsize(out_path)
        print(f"  [{i}/{len(jobs)}] {item_id:<9} {p['duration']:>5.0f}s → {size_mb:>6.1f} MB · "
              f"{p['width']}×{p['height']} · {mode} · {time.time() - t0:.1f}s")
        if size_mb > args.max_mb:
            print(f"      ⚠ 仍超过 {args.max_mb} MB，GitHub 会拒收")

    old.update(results)
    json.dump({"items": old}, open(MP4_FILE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n  合计 {total / 1048576:.1f} MB · data/mp4.json 已更新")

    if not args.no_build:
        env = dict(os.environ, PYTHONIOENCODING="utf-8")
        r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build-data.py")],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
        print((r.stdout or "").strip())
        if r.returncode != 0:
            print((r.stderr or "").strip(), file=sys.stderr)
            raise SystemExit("build-data.py 失败")


if __name__ == "__main__":
    main()
