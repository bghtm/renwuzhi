# content/ —— 新增一期时放这里

每新增一期，建一个文件夹（`tools/add-episode.py` 会自动生成）：

```
content/
├─ pages.json                静态托管用：视频 / PPT 的外部地址前缀（见 docs/DEPLOY.md）
├─ kuake/                    跨圈人物志
│  └─ ep12/
│     ├─ meta.json           这一期的元数据（下面有字段说明）
│     ├─ deck.pptx           配套 PPT 原件（可选，用于导出幻灯片、生成下载项）
│     └─ cover.png           封面原图（可选，用来压 webp）
└─ od/                       药圈人物志
   └─ od02/…
```

站点真正读的图片在 `site/media/` 下：

- `site/media/covers/<id>.webp` 与 `<id>-thumb.webp`
- `site/media/slides/<id>/01.webp …`（每页 1600px 宽）

`python tools/build-data.py` 会扫描 `content/<系列>/<id>/meta.json`，把新的一期并入
`site/data/episodes.json`（重复 id 会被跳过并提示）。

## 用一条命令添加

```bash
python tools/add-episode.py --series kuake --num 12 \
  --title "跨圈人物志极速版（12）" --topic "专题篇：……" \
  --guests "甲,乙,丙" \
  --video "D:\media\ep12.mp4" --deck "D:\media\ep12.pptx" --cover "D:\media\ep12_cover.png"
```

它会：导出幻灯片 PNG → 压成 webp → 压封面 → 探测视频 → 写 `meta.json` → 重建站点数据，
最后打印「上传清单」（上线时要传到视频/文件存储的文件名）。

接着把它转成可播放 / 可下载的 MP4（GitHub Pages 用，几十秒）：

```bash
python tools/make-mp4.py --only ep12
```

手写 `meta.json` 也可以，字段如下：

```jsonc
{
  "id": "ep12",                     // 唯一 id，同时是路由：#/ep/ep12
  "series": "kuake",                // kuake | od
  "num": 12,                        // 该系列内的期号
  "kind": "episode",                // episode | extra（extra 用于合集/补充，卡片显示 tag）
  "tag": null,                      // kind=extra 时显示的角标，如 "合集"
  "title": "跨圈人物志极速版（12）",
  "topic": "专题篇：……",            // 可为 null
  "guests": ["甲", "乙"],
  "summary": "本期收录 2 位人物档案",
  "slideKey": "ep12",               // site/media/slides/ep12/ 下的目录名
  "cover": "content/kuake/ep12/cover.png",
  "deck": "content/kuake/ep12/deck.pptx",
  "video": {                        // 二选一：url（线上用）或 file（本机绝对路径）
    "url": "https://…/跨圈人物志极速版（12）.mp4",
    "file": "",
    "size": 173296858,
    "duration": 506.1,
    "width": 1728,
    "height": 1080
  },
  "variants": [],                   // 同一期的其它导出：{url|file, label}
  "ppt": { "url": "", "downloadName": "跨圈人物志极速版（12）配套PPT.pptx" },
  "videoDownloadName": "跨圈人物志极速版（12）.mp4"
}
```

> 视频填了 `file` 时，本地 `node server.mjs` 会直接串流那个文件；
> 上 GitHub Pages 前把视频传到存储，再把 `url` 填上（或重新跑一次 `add-episode.py --video <URL>`）。
