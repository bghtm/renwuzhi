# 部署到 GitHub Pages

站点现在是**自包含**的：页面、封面、逐页幻灯片、PPT 原件和视频 MP4 全在仓库里，
`node tools/export-pages.mjs` 产出的 `dist/` 直接发布即可，不依赖任何外部存储。

```
仓库 ≈ 375 MB          发布出来的站点 ≈ 379 MB
  site/files/video/   视频 MP4（每期 9–38 MB）                 ≈ 295 MB
  site/files/         配套 PPT 原件                            ≈ 69 MB
  site/media/         封面 + 逐页幻灯片（WebP）                 ≈ 10 MB
```

两种发布模式（由 `content/pages.json` 决定）：

| 模式 | 视频从哪来 | 适用 |
| --- | --- | --- |
| **自包含**（两个地址都留空，当前默认） | 仓库里的 `site/files/video/*.mp4` | 只想用 GitHub，够用 |
| 外链 | 对象存储 / Releases（填 `videoBase`、`fileBase`） | 想放原画质原片、或站点体积要更小 |

## 为什么是普通 MP4，而不是切片

早期为了绕开 **GitHub 100 MB 单文件限制**和 **Pages 约 1 GB 站点限制**，视频先被转成 HLS 切片。
但重编码之后每期只有 9–37 MB（原片 34–258 MB），**单文件限制已经不是问题**，于是改回普通 MP4：

- 浏览器原生播放（不再需要 hls.js / MSE）；
- **下载和播放是同一个文件**，点一下就能存成 `.mp4`；
- 拖动进度条靠 HTTP Range —— GitHub Pages 的 CDN 支持（实测 `206 Partial Content`）；
- 进阶 faststart（moov 在文件头），边下边播。

单期最大 37.5 MB（第 10 期），全部远低于 100 MB 限制。（1~10 期「大合集」已下线，不再收录。）

## 部署步骤

```bash
# 1) 有新素材时：生成/更新视频、数据、静态包
python tools/make-mp4.py          # HLS 旧切片在的话无损 remux，几秒一个；不在则从原片编码
node tools/export-pages.mjs       # → dist/（约 379 MB，自动 .nojekyll）

# 2) 推到 GitHub
git add -A
git commit -m "更新站点"
git push

# 3) 仓库 → Settings → Pages → Source 选 GitHub Actions（只需设置一次）
```

`.github/workflows/pages.yml` 会在每次 push 后自动：检出 → `export-pages.mjs` → 上传 `dist/` → 发布。
地址：`https://<账号>.github.io/<仓库名>/`

> `Source` 必须是 **GitHub Actions**，不要选 “Deploy from a branch”——站点入口在 `dist/`，不是仓库根目录。
> 如果 Pages 还没启用，workflow 里的 `configure-pages` 带 `enablement: true` 会自动帮你启用。

## 上传新一期

```bash
python tools/add-episode.py --series od --num 3 \
  --title "药圈人物志极速版（3）" --topic "第 3 期" \
  --guests "甲,乙" \
  --video "D:\media\od03.mp4" --deck "D:\media\od03.pptx" --cover "D:\media\od03_cover.png"

python tools/make-mp4.py --only od03     # 转 MP4（约 20–40 秒）
git add -A; git commit -m "药圈第 3 期"; git push
```

1–2 分钟后 Actions 自动发布，线上立刻有这一期。

## 说明 / 常见坑

- **单文件 100 MB**：`make-mp4.py` 用 `--max-mb 95` 兜底，超了就提高 CRF 重编码，并在输出里提示。
- **拖动进度条**：依赖 HTTP Range。GitHub Pages 支持；用别的静态托管（如某些对象存储静态网站）也要确认支持 Range。
- **中文文件名**：站内链接是百分号编码的，GitHub Pages 正常返回；下载时浏览器用 `download` 属性给出原名。
- **仓库体积**：工作区约 375 MB；`.git` 历史里还留着旧版 HLS 切片和已下线的大合集，所以 `.git` 约 800 MB 级（仍低于 GitHub 1 GB 的建议上限）。
  想瘦身可以合并历史（`git checkout --orphan` 重建一次再 force push），需要的话告诉我。
- **别提交 `跨圈人物志极速版/`**：原始素材（视频 + PSD，约 4.5 GB）在 `.gitignore` 里，push 前扫一眼 `git status`。
- **国内访问**：`*.github.io` 经常打不开，这是网络问题不是部署问题；可换 Cloudflare Pages + 已备案域名。
- **本地与线上**：本地 `node server.mjs` 播原片（`/v/`，画质最好）；线上播 `site/files/video` 里的 MP4。
  `site.mode` 区分（`local` / `pages`），下载按钮在两种模式下都指向 MP4。
