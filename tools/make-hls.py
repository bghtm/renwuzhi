#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把视频切成 HLS 片段（>100MB 的视频也能进 GitHub Pages），并顺手去掉黑边。

GitHub 单文件上限 100MB、Pages 站点约 1GB，原片（最大 258MB / 合集 1.63GB）都过不去。
这里用 ffmpeg 转成 HLS：每 6 秒一个 .ts 片段（通常 1–3MB），播放时 hls.js 逐个拉取
并喂给 MSE，体验上等于一个完整视频（可拖动、可跳秒）。

用法：
  python tools/make-hls.py                 # 全部（默认 1080p 内容宽 1728，CRF 22）
  python tools/make-hls.py --only ep05     # 只处理某一期（可逗号分隔）
  python tools/make-hls.py --copy          # 只切片不重编码（画质不变，体积不变）
  python tools/make-hls.py --with-variants # 连「重制版」等额外版本一起切

产物：site/media/hls/<key>/index.m3u8 + seg_0000.ts …
      data/hls.json —— 交给 build-data.py 合并进站点数据
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
SITE = os.path.join(ROOT, "site")
HLS_DIR = os.path.join(SITE, "media", "hls")
EPISODES = os.path.join(SITE, "data", "episodes.json")
MEDIA_MAP = os.path.join(DATA, "media-map.json")
FFMPEG = shutil.which("ffmpeg") or r"D:\code\python\Bvideo\ffmpeg-2025-10-09-git-469aad3897-essentials_build\bin\ffmpeg.exe"
FFPROBE = shutil.which("ffprobe") or r"D:\code\python\Bvideo\ffmpeg-2025-10-09-git-469aad3897-essentials_build\bin\ffprobe.exe"


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                          errors="replace", **kw)


def probe(path):
    r = run([FFPROBE, "-v", "error", "-show_entries",
             "format=duration:stream=codec_type,width,height,codec_name", "-of", "json", path])
    if r.returncode != 0:
        raise SystemExit("ffprobe 失败：" + path)
    o = json.loads(r.stdout)
    v = next((s for s in o["streams"] if s["codec_type"] == "video"), {})
    a = next((s for s in o["streams"] if s["codec_type"] == "audio"), None)
    return dict(
        duration=float(o["format"]["duration"]),
        width=int(v.get("width") or 0),
        height=int(v.get("height") or 0),
        has_audio=bool(a),
    )


def detect_crop(path):
    """找出画面里的黑边；找不到就返回 None（不裁）。"""
    r = run([FFMPEG, "-hide_banner", "-ss", "20", "-t", "12", "-i", path,
             "-vf", "cropdetect=24:16:0", "-f", "null", "-"])
    matches = re.findall(r"crop=(\d+):(\d+):(\d+):(\d+)", r.stderr or "")
    if not matches:
        return None
    m = matches[-1]
    w, h, x, y = (int(v) for v in m)
    if w < 16 or h < 16:
        return None
    # 裁掉后应接近 16:9，且确实裁掉了东西，否则不裁
    return dict(w=w - w % 2, h=h - h % 2, x=x - x % 2, y=y - y % 2)


def ts_size(d):
    total = 0
    n = 0
    for f in os.listdir(d):
        if f.endswith(".ts"):
            total += os.path.getsize(os.path.join(d, f))
            n += 1
    return total, n


def build_one(path, key, args, vname=None):
    out_dir = os.path.join(HLS_DIR, key)
    playlist = os.path.join(out_dir, "index.m3u8")
    if os.path.exists(playlist) and not args.force:
        info = probe(path)
        # 已有产物且比源文件新 → 跳过
        if os.path.getmtime(playlist) >= os.path.getmtime(path):
            prev = json.load(open(os.path.join(DATA, "hls.json"), encoding="utf-8"))["items"].get(vname or key, {})
            keep = {k: prev[k] for k in ("bytes", "segments", "width", "height", "seconds", "mode") if k in prev}
            return dict(skipped=True, src=f"media/hls/{key}/index.m3u8", **keep)

    os.makedirs(out_dir, exist_ok=True)
    for f in os.listdir(out_dir):
        if f.endswith((".ts", ".m3u8")):
            os.remove(os.path.join(out_dir, f))

    info = probe(path)
    long_form = info["duration"] > args.long_form_seconds
    crf = args.small_crf if long_form else args.crf
    max_w = args.small_width if long_form else args.max_width
    preset = args.preset

    vf = []
    crop = None if args.copy else detect_crop(path)
    if crop and (crop["w"] != info["width"] or crop["h"] != info["height"]):
        vf.append(f"crop={crop['w']}:{crop['h']}:{crop['x']}:{crop['y']}")
        target_h = crop["h"]
        if max_w and crop["w"] > max_w:
            vf.append(f"scale={max_w}:-2")
            target_h = round(crop["h"] * max_w / crop["w"] / 2) * 2
    else:
        target_h = info["height"]
        if max_w and info["width"] > max_w:
            vf.append(f"scale={max_w}:-2")
            target_h = round(info["height"] * max_w / info["width"] / 2) * 2

    cmd = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", path]
    if vf:
        cmd += ["-vf", ",".join(vf)]
    if args.copy:
        cmd += ["-c", "copy"]
    else:
        cmd += ["-c:v", "libx264", "-profile:v", "high", "-preset", preset,
                "-crf", str(crf), "-pix_fmt", "yuv420p",
                "-force_key_frames", "expr:gte(t,n_forced*6)"]
        cmd += (["-c:a", "aac", "-b:a", "128k", "-ac", "2"] if info["has_audio"] else ["-an"])
    cmd += [
        "-f", "hls",
        "-hls_time", "6",
        "-hls_playlist_type", "vod",
        "-hls_flags", "independent_segments",
        "-hls_segment_filename", os.path.join(out_dir, "seg_%04d.ts"),
        playlist,
    ]

    t0 = time.time()
    r = run(cmd)
    if r.returncode != 0:
        raise SystemExit(f"ffmpeg 失败（{key}）：\n{(r.stderr or '')[-1500:]}")
    total, segs = ts_size(out_dir)
    return dict(
        src=f"media/hls/{key}/index.m3u8",
        bytes=total,
        segments=segs,
        width=(max_w if max_w and info["width"] > max_w else info["width"]),
        height=target_h,
        seconds=round(info["duration"], 1),
        mode=("copy" if args.copy else f"x264 crf{crf}"),
        cropped=bool(crop),
        tookSeconds=round(time.time() - t0, 1),
    )


def main():
    try:
        sys.stdout.reconfigure(errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="生成 HLS 切片")
    ap.add_argument("--only", default="", help="只处理这些 key（逗号分隔，如 ep05,od01）")
    ap.add_argument("--copy", action="store_true", help="只切片不重编码")
    ap.add_argument("--crf", type=int, default=22)
    ap.add_argument("--preset", default="medium")
    ap.add_argument("--max-width", type=int, default=1728, help="普通期数最大宽度")
    ap.add_argument("--small-crf", type=int, default=27, help="超长视频（>30 分钟）用的 CRF")
    ap.add_argument("--small-width", type=int, default=960)
    ap.add_argument("--long-form-seconds", type=float, default=1800)
    ap.add_argument("--with-variants", action="store_true", help="连额外版本一起切")
    ap.add_argument("--force", action="store_true", help="已存在也重新生成")
    ap.add_argument("--no-build", action="store_true", help="生成后不重建站点数据")
    args = ap.parse_args()

    if not os.path.exists(MEDIA_MAP):
        raise SystemExit("先运行 python tools/build-data.py 生成 data/media-map.json")
    media = json.load(open(MEDIA_MAP, encoding="utf-8"))
    model = json.load(open(EPISODES, encoding="utf-8"))

    wanted = {s.strip() for s in args.only.split(",") if s.strip()}

    def vname_of(url):
        m = re.match(r"^(?:/v/|/d/v/)(.+)$", url or "")
        return m.group(1) if m else ""

    jobs = []  # (vname, label)
    for item in model["episodes"] + model["extras"]:
        vn = vname_of((item.get("video") or {}).get("src"))
        if vn:
            jobs.append((vn, item["id"]))
        if args.with_variants:
            for i, var in enumerate(item.get("variants") or [], start=2):
                vv = vname_of(var.get("src"))
                if vv:
                    jobs.append((vv, f"{item['id']}-v{i}"))

    seen = set()
    jobs = [(v, k) for v, k in jobs if not (v in seen or seen.add(v))]
    if wanted:
        jobs = [(v, k) for v, k in jobs if k in wanted or v.rsplit(".", 1)[0] in wanted]

    if not jobs:
        raise SystemExit("没有要处理的任务（检查 --only）")

    print(f"\nHLS 切片：{len(jobs)} 个视频 → site/media/hls/\n")
    results = {}
    total_bytes = 0
    for i, (vn, key) in enumerate(jobs, start=1):
        entry = media["video"].get(vn)
        if not entry or not os.path.isfile(entry.get("path", "")):
            print(f"  [{i}/{len(jobs)}] {key:<10} 跳过（源文件不存在）")
            continue
        res = build_one(entry["path"], key, args, vn)
        results[vn] = res
        total_bytes += res.get("bytes", 0)
        if res.get("skipped"):
            print(f"  [{i}/{len(jobs)}] {key:<10} 已存在，跳过")
        else:
            print(f"  [{i}/{len(jobs)}] {key:<10} {res['seconds']:>6.0f}s → "
                  f"{res['bytes'] / 1024 / 1024:>6.1f} MB / {res['segments']:>3} 段 · "
                  f"{res['width']}×{res['height']} · {res['mode']}"
                  + ("（已裁黑边）" if res.get("cropped") else "")
                  + f" · {res.get('tookSeconds', 0)}s")

    hls_file = os.path.join(DATA, "hls.json")
    old = {}
    if os.path.exists(hls_file):
        try:
            old = json.load(open(hls_file, encoding="utf-8")).get("items", {})
        except Exception:
            old = {}
    old.update({k: v for k, v in results.items()})
    with open(hls_file, "w", encoding="utf-8") as f:
        json.dump({"items": old}, f, ensure_ascii=False, indent=1)

    print(f"\n  合计 {total_bytes / 1024 / 1024:.1f} MB · data/hls.json 已更新")
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
