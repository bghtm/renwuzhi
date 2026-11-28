# 人物志档案 — 跨圈 / 药圈 极速版 · 站点

把《跨圈人物志极速版》与《药圈人物志极速版》两套独立档案做成一个网站：
**两套大分类**各自按期数排列，全部期数可在线播放、逐页翻看配套 PPT、并下载 PPT 原件。

- 首页：两个系列入口（跨圈 / 药圈）+ 各自的期列表 + 资料与模板；滚动时导航会跟着高亮
- 播放页：`#/ep/ep05`，原生播放器 + 版本切换（同一期有多份导出时可切）
- 幻灯片：`#/ep/ep05/s/4` 直达第 4 页，支持按钮 / 方向键 / 点击画面 / 触屏滑动 / 全屏
- 断点续播：记住每期看到的位置，卡片底部有进度条
- 同一份代码两种播放源：本地播原片（`/v/` 直传，画质最好），静态站播预转的 MP4（可播可下）

| 系列 | 期数 | 幻灯片 | 视频 |
| --- | --- | --- | --- |
| 跨圈人物志 · 极速版 | 11 期 + 第 1 期补充 | 105 页 | 12 |
| 药圈人物志 · 极速版 | 1 期（持续更新） | 9 页 | 1 |

## 快速开始（本地）

双击 **`start.cmd`**，或：

```bash
node server.mjs --open     # http://127.0.0.1:5310/
```

需要 Node.js 18+，不需要 `npm install`。如果站点已经在运行，再次启动会直接打开页面而不会重复起进程。

> 必须通过这个本地服务器访问，**不要直接双击 `site/index.html`**：原片走 `/v/…`，
> 本地服务器带 HTTP Range，拖动进度条才正常。

## 三种媒体产物

| 目录 | 内容 | 谁在用 |
| --- | --- | --- |
| `site/media/covers/`、`site/media/slides/` | 封面、逐页幻灯片（WebP） | 本地 + 线上 |
| `site/files/video/` | 视频 MP4（faststart，`make-mp4.py` 生成） | 线上播放 + 下载（本地下载也用它） |
| `site/files/` | 配套 PPT 原件（`build-data.py` 自动复制） | 本地 + 线上 |
| `data/media-map.json` | 虚拟地址 → 本机原片绝对路径 | 本地服务器（已 gitignore） |

原片目录（`renwuzhi/`，约 4.5 GB）不进仓库，已在 `.gitignore` 里。

## 目录结构

```
kuake-renwuzhi/
├─ start.cmd                  一键启动（Windows）
├─ server.mjs                 本地服务器：静态站点 + 原片串流(Range) + 单实例保护
├─ site/                      ★ 站点本体（可部署的静态资源）
│  ├─ index.html  assets/     页面 / 样式 / 前端逻辑
│  ├─ data/episodes.json      前端读取的数据
│  ├─ files/                  PPT 原件 + video/ 视频 MP4（下载用）
│  └─ media/{covers,slides}/
├─ data/                      数据模型 + 文件名映射 + MP4 索引（media-map 已 gitignore）
├─ content/                   新增一期放这里（见 content/README.md）
├─ tools/
│  ├─ build-data.py           扫描源目录 / content / mp4.json，生成两份 JSON
│  ├─ build-assets.py         PNG → WebP（封面、幻灯片）
│  ├─ export-slides.ps1       PowerPoint COM 导出幻灯片（全部或单份）
│  ├─ make-mp4.py             视频 → 可播放/可下载的 MP4（裁黑边、faststart）
│  ├─ add-episode.py          一条命令新增一期
│  ├─ export-pages.mjs        生成 dist/（自包含或外链两种模式）
│  └─ cdp-shot.mjs            无依赖的无头浏览器自检/截图
├─ .github/workflows/pages.yml  push 后自动发布到 GitHub Pages
├─ docs/DEPLOY.md             ★ 部署步骤与两种模式
└─ .build/                    中间产物（导出的 PNG、截图），可删
```

## 新增一期

```bash
python tools/add-episode.py --series od --num 2 \
  --title "药圈人物志极速版（2）" --topic "第 2 期" \
  --guests "甲,乙,丙" \
  --video "D:\media\od02.mp4" --deck "D:\media\od02.pptx" --cover "D:\media\od02_cover.png"

python tools/make-mp4.py --only od02     # 只转这一期
```

第一条命令导出幻灯片、压封面、探测视频、写 `content/<系列>/<id>/meta.json` 并重建数据；
第二条把它转成 MP4（下载和线上播放都用它）。之后 `git push` 就会自动上线。

## 部署到 GitHub Pages

见 **[docs/DEPLOY.md](docs/DEPLOY.md)**。两条路：

- **自包含（推荐）**：视频 MP4 与 PPT 都在 `site/files/` 里（合计约 364 MB），
  `node tools/export-pages.mjs` 产出 `dist/`，推上去开启 Actions 即可用，不需要任何外部存储。
- **外链**：站点放 Pages，原片放 R2 / OSS / Releases，`content/pages.json` 填两个前缀，
  导出时会自动改写地址，保留原画质与下载。

原片最大 258 MB，超过 GitHub 单文件 100 MB；重编码后每期只有 9–38 MB，
所以直接用普通 MP4：浏览器原生播放、拖动进度条走 HTTP Range、
“下载”拿到的就是正在播的那个文件。

## 自检

```bash
node tools/cdp-shot.mjs --url "http://127.0.0.1:5310/" --width 1440 --height 900 --out shot.png
```

无头 Edge/Chrome 截图，并回报横向溢出、坏图、卡片数量；支持 `--mobile`、
`--eval "<js>"`（跑脚本并回传结果）、`--click "<选择器>"`（真实点击）。

## 说明

站内内容整理自公开信息，仅作记录之用；人物排名严格意义上不分先后，是否上榜按粉丝量影响力评定。
如涉侵权请联系删除。Made by 冰棍好烫啊 @bghtmqwq。
