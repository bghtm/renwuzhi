#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Build the site data model from the source folder.

Reads:  C:\\Users\\31996\\OneDrive\\文档\\PrAe\\跨圈人物志极速版
Writes: data/episodes.json   (public, consumed by the frontend)
        data/media-map.json  (server-side: virtual url name -> real absolute path)
"""
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
SITE = os.path.join(ROOT, "site")
FILES_DIR = os.path.join(SITE, "files")
HLS_FILE = os.path.join(DATA, "hls.json")
MP4_FILE = os.path.join(DATA, "mp4.json")
FFPROBE = shutil.which("ffprobe") or r"D:\code\python\Bvideo\ffmpeg-2025-10-09-git-469aad3897-essentials_build\bin\ffprobe.exe"


def find_src():
    """素材目录：先找仓库里的 renwuzhi/，兼容旧目录名与 OneDrive 原位置。"""
    for p in (
        os.path.join(ROOT, "renwuzhi"),
        os.path.join(ROOT, "跨圈人物志极速版"),
        r"C:\Users\31996\OneDrive\文档\PrAe\跨圈人物志极速版",
    ):
        if os.path.isdir(p) and os.path.isfile(os.path.join(p, "跨圈人物志极速版（1）.mp4")):
            return p
    return os.path.join(ROOT, "renwuzhi")


SRC = find_src()

E = "跨圈人物志极速版"
OD = "药圈人物志极速版"

# ------------------------------------------------------------- the two series
# 跨圈 and 药圈 are two separate catalogues (different decks, different style).
SERIES = [
    dict(id="kuake", order=1, name="跨圈人物志", short="跨圈", suffix="极速版",
         kicker="CROSS-CIRCLE PERSONA ARCHIVE", accent="pink",
         tagline="记录人物行为成就与争议的公开资料档案",
         blurb="从跨性别社群出发，把公开资料里的人物行为、成就与争议整理成档案；"
               "每期配一份可翻页的配套 PPT。",
         cover="1b.png"),
    dict(id="od", order=2, name="药圈人物志", short="药圈", suffix="极速版",
         kicker="OD / PHARM COMMUNITY ARCHIVE", accent="dark",
         tagline="记录药圈人物的贡献与相关争议",
         blurb="记录药圈里人物的贡献与相关争议，按人物建档，接受公开投稿与更正。"
               "封面与版式使用 OD 黑白档案风格。",
         cover="od1.png"),
]

# ---------------------------------------------------------------- episode table
# cover: file in SRC; topic/guests come from the deck's cover + contents slides.
EPISODES = [
    dict(id="ep01", num=1, title="跨圈人物志极速版（1）", topic=None,
         guests=["寒涟漪", "千叶芙卡", "盐田", "命令方块", "魔骨", "雪秋"],
         cover="1b.png", video=f"{E}（1）.mp4",
         variants=[(f"{E}（1）(3).mp4", "重制版"), (f"{E}（1）(4).mp4", "重制版")],
         ppt=f"{E}（1）.pptx", slide_key="ep01"),
    dict(id="ep02", num=2, title="跨圈人物志极速版（2）", topic=None,
         guests=["ill", "N552AA", "冰棍好烫喵", "唐毓文", "emo"],
         cover="2b.png", video=f"{E}（2）.mp4",
         variants=[(f"{E}（2）(9).mp4", "重制版"), (f"{E}（2）(10).mp4", "重制版"),
                   (f"{E}（2）(12).mp4", "重制版")],
         ppt=f"{E}（2）.pptx", slide_key="ep02"),
    dict(id="ep03", num=3, title="跨圈人物志极速版（3）", topic=None,
         guests=["Unk", "雪", "Dr土豆尼", "Yzmt", "N2O", "林莫"],
         cover="3b.png", video=f"{E}（3）.mp4",
         variants=[(f"{E}（3）(1).mp4", "重制版")],
         ppt=f"{E}（3）.pptx", slide_key="ep03"),
    dict(id="ep04", num=4, title="跨圈人物志极速版（4）", topic=None,
         guests=["任成轩", "咱喵", "柠檬味软糖", "李松杰"],
         cover="4b.png", video=f"{E}（4）.mp4", variants=[],
         ppt=f"{E}（4）.pptx", slide_key="ep04"),
    dict(id="ep05", num=5, title="跨圈人物志极速版（5）",
         topic="专题篇：上海主播女孩快闪店捅人事件",
         guests=["三角枫", "无线爱", "蘑菇盆栽", "Aiko"],
         cover="5a.png", video=f"{E}（5）.mp4",
         variants=[(f"{E}（5）(1).mp4", "重制版")],
         ppt=f"{E}（5）.pptx", slide_key="ep05"),
    dict(id="ep06", num=6, title="跨圈人物志极速版（6）", topic="专题篇：梗图博主",
         guests=["hsn", "沫柠", "環状線", "星野ふじ"],
         cover="6a.png", video=f"{E}（6）.mp4", variants=[],
         ppt=f"{E}（6）.pptx", slide_key="ep06"),
    dict(id="ep07", num=7, title="跨圈人物志极速版（7）", topic=None,
         guests=["杨崇志", "amber", "鲨猫", "核弹"],
         cover="7a.png", video=f"{E}（7）.mp4",
         variants=[(f"{E}（7）(1).mp4", "重制版")],
         ppt=f"{E}（7）.pptx", slide_key="ep07"),
    dict(id="ep08", num=8, title="跨圈人物志极速版（8）", topic="专题篇：南京",
         guests=["海葵", "南宫", "冬鸟", "小南", "七三", "芙兰"],
         cover="8a.png", video=f"{E}（8）.mp4", variants=[],
         ppt=f"{E}（8）.pptx", slide_key="ep08"),
    dict(id="ep09", num=9, title="跨圈人物志极速版（9）", topic=None,
         guests=["烧仙草", "Chinese", "紫喵", "小茶子"],
         cover="9a.png", video=f"{E}（9）.mp4", variants=[],
         ppt=f"{E}（9）.pptx", slide_key="ep09"),
    dict(id="ep10", num=10, title="跨圈人物志极速版（10）",
         topic="专题篇：劳保跨、自恨跨",
         guests=["竹蜻蜓", "傻猫", "枣桐", "沐桃", "索瑟尔", "瑶瑶"],
         cover="10a.png", video=f"{E}（10）.mp4", variants=[],
         ppt=f"{E}（10）.pptx", slide_key="ep10"),
    dict(id="ep11", num=11, title="跨圈人物志极速版（11）", topic="专题篇：岛娘",
         guests=["小岛 美奈子"],
         cover="11a.png", video=f"{E}（11）.mp4",
         variants=[(f"{E}（11）和谐版.mp4", "和谐版")],
         ppt=f"{E}（11）.pptx", slide_key="ep11"),
]

# 药圈 is its own series: same pipeline, own catalogue, own numbering.
for _ep in EPISODES:
    _ep.setdefault("series", "kuake")
    _ep.setdefault("prefix", E)

EPISODES.append(dict(
    id="od01", num=1, series="od", prefix=OD,
    title="药圈人物志极速版（1）", topic="记录药圈人物的贡献与相关争议",
    guests=["鸡哥", "Spring风", "鼠尾草", "沐雨"],
    cover="od1.png", video=f"{OD}（1）.mp4", variants=[],
    ppt=f"{OD}（1）.pptx", slide_key="od01",
))

EXTRAS = [
    # 说明：1~10 期「大合集」已按作者要求下线，不再收录、也不再生成（原片仍在素材目录里，但不会进站点）。
    dict(id="ep01b", kind="extra", series="kuake", num=None, tag="补充",
         title="跨圈人物志极速版（1）补充",
         topic="第 1 期补充：新增与修订档案",
         guests=["寒涟漪", "千叶芙卡", "盐田", "命令方块", "魔骨", "雪秋"],
         cover="1c.png", video=f"{E}（1补充）.mp4", variants=[],
         ppt=f"{E}（1） 补充.pptx", slide_key="ep01b"),
]

RESOURCES = [
    dict(id="tpl-main", title="蓝粉白鱼板风格模板", note="封面 / 目录 / 人物速写 / 圈层地图 等 7 页版式",
         ppt="跨圈人物志_蓝粉白鱼板风格模板.pptx", slide_key="extra-template"),
    dict(id="tpl-labor", title="劳保跨 · 自恨跨 单页介绍", note="两种社群话语中身份矛盾的说明页",
         ppt="劳保跨与自恨跨_单页介绍.pptx", slide_key="extra-labor"),
    dict(id="tpl-trans", title="上集补充 · 过渡页", note="蓝粉白过渡页",
         ppt="上集补充_蓝粉白过渡页.pptx", slide_key="extra-trans"),
]


# ---------------------------------------------------------------------- probes
def run_ffprobe(path):
    out = subprocess.run(
        [FFPROBE, "-v", "error", "-show_entries",
         "format=duration,size:stream=codec_type,width,height", "-of", "json", path],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    if out.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {path}")
    o = json.loads(out.stdout)
    v = next((s for s in o["streams"] if s.get("codec_type") == "video"), {})
    return dict(duration=round(float(o["format"]["duration"]), 2),
                size=os.path.getsize(path),
                width=int(v.get("width") or 0), height=int(v.get("height") or 0))


def pptx_info(path):
    size = os.path.getsize(path)
    with zipfile.ZipFile(path) as z:
        n = len([x for x in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", x)])
    return dict(size=size, slides=n)


def mtime_label(path):
    import datetime
    return datetime.datetime.fromtimestamp(os.path.getmtime(path)).strftime("%m-%d %H:%M")


# ---------------------------------------------------------------------- builder
def main():
    os.makedirs(DATA, exist_ok=True)
    media_map = {"video": {}, "file": {}}
    problems = []

    # HLS 切片信息（由 tools/make-hls.py 产出）；有的话每期就能在静态托管上整段播放
    hls_items = {}
    if os.path.isfile(HLS_FILE):
        try:
            with open(HLS_FILE, encoding="utf-8") as f:
                hls_items = json.load(f).get("items", {})
        except Exception as e:
            problems.append(f"data/hls.json 读取失败：{e}")

    # 可下载/可直接播放的 MP4（tools/make-mp4.py）；静态托管与下载按钮都用它
    mp4_items = {}
    if os.path.isfile(MP4_FILE):
        try:
            with open(MP4_FILE, encoding="utf-8") as f:
                mp4_items = json.load(f).get("items", {})
        except Exception as e:
            problems.append(f"data/mp4.json 读取失败：{e}")

    def with_media(video, vname):
        if not video:
            return video
        entry = hls_items.get(vname)
        if entry:
            video["hls"] = dict(src=entry["src"], bytes=entry.get("bytes", 0),
                                segments=entry.get("segments", 0),
                                width=entry.get("width", 0), height=entry.get("height", 0),
                                mode=entry.get("mode", ""))
        m = mp4_items.get(vname)
        if m:
            video["mp4"] = dict(src=m["src"], bytes=m.get("bytes", 0),
                                width=m.get("width", 0), height=m.get("height", 0),
                                seconds=m.get("seconds", 0), mode=m.get("mode", ""))
            # 下载优先给 MP4（本地/线上都能直接下）
            video["download"] = m["src"]
        return video

    def serve_file(path, dl_name):
        """PPT 复制进 site/files/，用相对地址：本地与 GitHub Pages 都能直接下载。"""
        os.makedirs(FILES_DIR, exist_ok=True)
        dst = os.path.join(FILES_DIR, dl_name)
        try:
            if (not os.path.exists(dst)) or os.path.getmtime(dst) < os.path.getmtime(path):
                shutil.copyfile(path, dst)
        except OSError as e:
            problems.append(f"复制 PPT 失败 {dl_name}: {e}")
            return None
        return "files/" + quote(dl_name, safe="")

    def add_video(vname, src_file, dl_name):
        path = os.path.join(SRC, src_file)
        if not os.path.exists(path):
            problems.append(f"missing video {src_file}")
            return None
        info = run_ffprobe(path)
        media_map["video"][vname] = dict(path=path, name=dl_name, size=info["size"])
        return with_media(dict(src=f"/v/{vname}", download=f"/d/v/{vname}", size=info["size"],
                             sizeText=human_size(info["size"]), duration=info["duration"],
                             width=info["width"], height=info["height"],
                             durationText=clock(info["duration"])), vname)

    def add_ppt(pname, src_file, dl_name):
        path = os.path.join(SRC, src_file)
        if not os.path.exists(path):
            problems.append(f"missing ppt {src_file}")
            return None
        info = pptx_info(path)
        media_map["file"][pname] = dict(path=path, name=dl_name, size=info["size"])
        served = serve_file(path, dl_name)
        return dict(download=served or f"/d/p/{pname}", size=info["size"],
                    sizeText=human_size(info["size"]), slides=info["slides"])

    episodes, extras = [], []
    for ep in EPISODES:
        n = ep["num"]
        px = ep.get("prefix", E)
        video = add_video(f"{ep['id']}.mp4", ep["video"], f"{px}（{n:02d}）.mp4")
        variants = []
        for i, (vf, lab) in enumerate(ep["variants"], start=2):
            stamp = mtime_label(os.path.join(SRC, vf))
            v = add_video(f"{ep['id']}-v{i}.mp4", vf,
                          f"{px}（{n:02d}）_{lab}-{stamp.replace(' ', '-')}.mp4")
            if v:
                v["label"] = f"{lab} · {stamp}"
                variants.append(v)
        ppt = add_ppt(f"{ep['id']}.pptx", ep["ppt"], f"{px}（{n:02d}）配套PPT.pptx")
        cover = ep["cover"]
        item = dict(
            id=ep["id"], kind="episode", series=ep["series"],
            num=n, numText=f"{n:02d}", tag=None,
            title=ep["title"], topic=ep["topic"],
            guests=ep["guests"],
            summary=summary_text(ep["guests"], ep["topic"]),
            cover=f"media/covers/{ep['id']}.webp",
            coverThumb=f"media/covers/{ep['id']}-thumb.webp",
            coverSrc=cover,
            video=video, variants=variants, ppt=ppt,
            slideKey=ep["slide_key"],
            slides=[f"media/slides/{ep['slide_key']}/{i:02d}.webp"
                    for i in range(1, (ppt["slides"] if ppt else 0) + 1)],
        )
        episodes.append(item)

    for ex in EXTRAS:
        n = ex["num"]
        vname = "combo.mp4" if ex["id"] == "combo" else f"{ex['id']}.mp4"
        dl = f"{E}1~10大合集.mp4" if ex["id"] == "combo" else ex["video"]
        video = add_video(vname, ex["video"], dl)
        ppt = add_ppt(f"{ex['id']}.pptx", ex["ppt"], f"{ex['title']}配套PPT.pptx") if ex["ppt"] else None
        item = dict(
            id=ex["id"], kind="extra", series=ex["series"],
            num=None, numText=None, tag=ex["tag"],
            title=ex["title"], topic=ex["topic"], guests=ex["guests"],
            summary=summary_text(ex["guests"], ex["topic"]),
            cover=f"media/covers/{ex['id']}.webp",
            coverThumb=f"media/covers/{ex['id']}-thumb.webp",
            coverSrc=ex.get("cover"),
            video=video, variants=[], ppt=ppt,
            slideKey=ex["slide_key"],
            slides=[f"media/slides/{ex['slide_key']}/{i:02d}.webp"
                    for i in range(1, (ppt["slides"] if ppt else 0) + 1)],
        )
        extras.append(item)

    resources = []
    for r in RESOURCES:
        p = add_ppt(f"{r['id']}.pptx", r["ppt"], r["ppt"])
        resources.append(dict(id=r["id"], title=r["title"], note=r["note"],
                              ppt=p,
                              thumb=f"media/slides/{r['slide_key']}/01.webp",
                              slideKey=r["slide_key"]))

    # -------------------------------------------- content/ 里新加的期数（增量）
    content_dir = os.path.join(ROOT, "content")
    order_of = {s["id"]: s["order"] for s in SERIES}
    known = {e["id"] for e in episodes + extras}
    added = []

    if os.path.isdir(content_dir):
        metas = []
        for sdir in sorted(os.listdir(content_dir)):
            sp = os.path.join(content_dir, sdir)
            if sdir not in order_of or not os.path.isdir(sp):
                continue
            for edir in sorted(os.listdir(sp)):
                mp = os.path.join(sp, edir, "meta.json")
                if os.path.isfile(mp):
                    metas.append((order_of[sdir], edir, mp))

        for _, edir, mp in sorted(metas):
            with open(mp, encoding="utf-8") as f:
                m = json.load(f)
            eid = m.get("id") or edir
            if eid in known:
                problems.append(f"content/{edir}: id {eid} 与现有期数重复，已跳过")
                continue

            mv = m.get("video") or {}
            if mv.get("url"):
                vdur = mv.get("duration") or 0
                video = dict(src=mv["url"], download=mv["url"],
                             size=mv.get("size") or 0, sizeText="在线",
                             duration=vdur, width=mv.get("width") or 0,
                             height=mv.get("height") or 0,
                             durationText=clock(vdur) if vdur else "")
            else:
                vf = mv.get("file") or ""
                if not os.path.isfile(vf):
                    problems.append(f"{eid}: 视频文件不存在 {vf}")
                    continue
                info = run_ffprobe(vf)
                vname = f"{eid}.mp4"
                media_map["video"][vname] = dict(path=vf, size=info["size"],
                                                 name=m.get("videoDownloadName") or f"{eid}.mp4")
                video = with_media(dict(src=f"/v/{vname}", download=f"/d/v/{vname}",
                                      size=info["size"], sizeText=human_size(info["size"]),
                                      duration=info["duration"], width=info["width"],
                                      height=info["height"], durationText=clock(info["duration"])), vname)

            variants = []
            for i, vv in enumerate(m.get("variants") or [], start=2):
                if vv.get("url"):
                    vdur = vv.get("duration") or 0
                    variants.append(dict(src=vv["url"], download=vv["url"], size=vv.get("size") or 0,
                                         sizeText="在线", duration=vdur,
                                         width=vv.get("width") or 0, height=vv.get("height") or 0,
                                         durationText=clock(vdur) if vdur else "",
                                         label=vv.get("label") or f"版本 {i}"))
                elif vv.get("file") and os.path.isfile(vv["file"]):
                    info = run_ffprobe(vv["file"])
                    vname = f"{eid}-v{i}.mp4"
                    media_map["video"][vname] = dict(path=vv["file"], size=info["size"],
                                                     name=vv.get("label") or f"{eid}-v{i}.mp4")
                    variants.append(with_media(dict(src=f"/v/{vname}", download=f"/d/v/{vname}",
                                                 size=info["size"], sizeText=human_size(info["size"]),
                                                 duration=info["duration"], width=info["width"],
                                                 height=info["height"], durationText=clock(info["duration"]),
                                                 label=vv.get("label") or f"版本 {i}"), vname))

            ppt = None
            mp_ppt = m.get("ppt") or {}
            deck_rel = m.get("deck") or ""
            if mp_ppt.get("url"):
                ppt = dict(download=mp_ppt["url"], size=mp_ppt.get("size") or 0,
                           sizeText="在线", slides=m.get("slides") or 0)
            elif deck_rel and os.path.isfile(os.path.join(ROOT, deck_rel)):
                deck_abs = os.path.join(ROOT, deck_rel)
                pname = f"{eid}.pptx"
                dl_name = mp_ppt.get("downloadName") or f"{eid}.pptx"
                media_map["file"][pname] = dict(path=deck_abs, size=os.path.getsize(deck_abs),
                                                name=dl_name)
                info = pptx_info(deck_abs)
                served = serve_file(deck_abs, dl_name)
                ppt = dict(download=served or f"/d/p/{pname}", size=info["size"],
                           sizeText=human_size(info["size"]), slides=info["slides"])

            slide_key = m.get("slideKey") or ""
            slides = []
            slide_dir = os.path.join(ROOT, "site", "media", "slides", slide_key) if slide_key else ""
            if slide_dir and os.path.isdir(slide_dir):
                slides = [f"media/slides/{slide_key}/{f}"
                          for f in sorted(os.listdir(slide_dir)) if f.endswith(".webp")]

            cover_ok = os.path.isfile(os.path.join(ROOT, "site", "media", "covers", f"{eid}.webp"))
            if not cover_ok:
                problems.append(f"{eid}: 缺少封面 site/media/covers/{eid}.webp")

            item = dict(
                id=eid, kind=m.get("kind") or "episode",
                series=m.get("series") or "kuake",
                num=m.get("num"), numText=f"{m['num']:02d}" if m.get("num") else None,
                tag=m.get("tag"),
                title=m.get("title") or eid, topic=m.get("topic"),
                guests=m.get("guests") or [],
                summary=m.get("summary") or summary_text(m.get("guests") or [], m.get("topic")),
                cover=f"media/covers/{eid}.webp",
                coverThumb=f"media/covers/{eid}-thumb.webp",
                coverSrc=m.get("cover"),
                video=video, variants=variants, ppt=ppt,
                slideKey=slide_key, slides=slides,
            )
            (extras if item["kind"] == "extra" else episodes).append(item)
            known.add(eid)
            added.append(eid)

    episodes.sort(key=lambda e: (order_of.get(e["series"], 9), e.get("num") or 0))

    all_items = episodes + extras
    series_out = []
    for s in SERIES:
        items = [e for e in all_items if e["series"] == s["id"]]
        series_out.append(dict(
            id=s["id"], order=s["order"], name=s["name"], short=s["short"], suffix=s["suffix"],
            kicker=s["kicker"], accent=s["accent"], tagline=s["tagline"],
            blurb=s["blurb"],
            count=len([e for e in items if e["kind"] == "episode"]),
            collections=len([e for e in items if e["kind"] == "extra"]),
            slides=sum(len(e["slides"]) for e in items),
            videos=len(items),
        ))

    # 下载文件名去重：名字重复说明两个文件会被当成同一份上传/下载
    seen = {}
    for kind, table in media_map.items():
        for vname, entry in table.items():
            nm = entry["name"]
            if nm in seen:
                problems.append(f"下载文件名重复：{nm}（{seen[nm]} 与 {vname}）")
            seen[nm] = vname

    total_slides = sum(len(e["slides"]) for e in all_items)
    model = dict(
        site=dict(
            title="人物志档案 · 跨圈 / 药圈",
            kicker="PERSONA ARCHIVE",
            tagline="跨圈人物志 与 药圈人物志：记录人物行为成就与争议的公开资料档案",
            author="冰棍好烫啊", handle="@bghtmqwq",
            rankNote="人物排名严格意义上不分先后，是否上榜按粉丝量影响力评定；未上榜不代表不属于该分类，也可能是影响力不足或遗漏。",
            notice="站内内容整理自公开信息，仅作记录之用；如涉侵权请联系删除。",
            mode="local",
            stats=dict(series=len(series_out),
                       episodes=len([e for e in episodes]),
                       videos=len(all_items),
                       slides=total_slides,
                       resources=len(resources)),
        ),
        series=series_out,
        episodes=episodes, extras=extras, resources=resources,
    )

    with open(os.path.join(DATA, "episodes.json"), "w", encoding="utf-8") as f:
        json.dump(model, f, ensure_ascii=False, indent=1)
    # the front-end loads this copy; site/ stays a pure static tree
    site_data = os.path.join(ROOT, "site", "data")
    os.makedirs(site_data, exist_ok=True)
    with open(os.path.join(site_data, "episodes.json"), "w", encoding="utf-8") as f:
        json.dump(model, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(DATA, "media-map.json"), "w", encoding="utf-8") as f:
        json.dump(media_map, f, ensure_ascii=False, indent=1)
    # 只含「虚拟地址 → 下载文件名」，不含本机绝对路径；导出静态包时用这份（可安全提交）
    names = {
        "video": {k: v["name"] for k, v in media_map["video"].items()},
        "file": {k: v["name"] for k, v in media_map["file"].items()},
    }
    with open(os.path.join(DATA, "media-names.json"), "w", encoding="utf-8") as f:
        json.dump(names, f, ensure_ascii=False, indent=1)

    print(f"series={len(series_out)} episodes={len(episodes)} extras={len(extras)} resources={len(resources)}")
    for s in series_out:
        print(f"  {s['id']:<6} 期数={s['count']} 合集={s['collections']} 幻灯片={s['slides']}")
    print(f"videos={len(media_map['video'])} files={len(media_map['file'])}")
    print(f"slides total={total_slides}")
    if added:
        print(f"content/ 新增：{', '.join(added)}")
    for p in problems:
        print("PROBLEM:", p)


def summary_text(guests, topic):
    n = len(guests)
    if n == 0:
        return "历期内容连续播放"
    if n == 1:
        return f"本期专题人物：{guests[0]}"
    head = "本期收录" if not topic else "本期收录"
    return f"{head} {n} 位人物档案"


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


if __name__ == "__main__":
    sys.exit(main())
