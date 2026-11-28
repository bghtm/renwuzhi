#!/usr/bin/env node
/**
 * 生成 GitHub Pages 用的静态包 dist/。
 *
 * 两种模式（由 content/pages.json 决定）：
 *
 * 1) 自包含模式（videoBase / fileBase 都留空）
 *    视频用 site/files/video 里的 MP4（make-mp4.py 生成），PPT 用 site/files/，
 *    全部是相对路径 —— 整个 dist/ 传上去即可用，不依赖任何外部存储。
 *
 * 2) 外链模式（两者都填）
 *    把 /v/…、/d/v/…、/d/p/… 改写成对象存储 / Releases 上的绝对地址，
 *    适合想保留原片画质与下载的场景。
 *
 *   node tools/export-pages.mjs [--config content/pages.json] [--out dist]
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE = path.join(ROOT, 'site');
const NAMES_FILE = fs.existsSync(path.join(ROOT, 'data', 'media-names.json'))
  ? path.join(ROOT, 'data', 'media-names.json')
  : path.join(ROOT, 'data', 'media-map.json');

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};

const CONFIG = path.resolve(ROOT, arg('--config', 'content/pages.json'));
const OUT = path.resolve(ROOT, arg('--out', 'dist'));

function die(msg) {
  console.error('\n✗ ' + msg + '\n');
  process.exit(1);
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (fallback !== undefined) return fallback;
    die(`读取失败 ${path.relative(ROOT, file)}：${e.message}`);
  }
}

const config = fs.existsSync(CONFIG)
  ? readJSON(CONFIG, {})
  : { videoBase: '', fileBase: '' };
const videoBase = String(config.videoBase || '').trim();
const fileBase = String(config.fileBase || '').trim();
const SELF_CONTAINED = !videoBase && !fileBase;

if (!SELF_CONTAINED && (!videoBase || !fileBase)) {
  die('videoBase 与 fileBase 要么都填（外链模式），要么都留空（自包含模式）。');
}

const media = readJSON(NAMES_FILE, { video: {}, file: {} });

function downloadName(entry) {
  if (!entry) return '';
  return typeof entry === 'string' ? entry : entry.name || '';
}

function joinUrl(base, name) {
  return `${base.replace(/\/+$/, '')}/${name.split('/').map(encodeURIComponent).join('/')}`;
}

const stats = { rewrote: 0, stripped: 0, droppedVariants: 0 };

/* --- 自包含：删掉只在本地服务器里有效的地址，只留 files/ 相对路径 --- */
function stripLocal(value, key) {
  if (Array.isArray(value)) return value.map((v) => stripLocal(v, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = stripLocal(v, k);
    return out;
  }
  if (typeof value === 'string' && /^\/(v|d)\//.test(value)) {
    stats.stripped++;
    return '';
  }
  return value;
}

/* --- 外链：把本地路由换成外部绝对地址 --- */
function rewriteUrl(url) {
  if (typeof url !== 'string') return url;
  let m;
  if ((m = /^\/v\/(.+)$/.exec(url)) || (m = /^\/d\/v\/(.+)$/.exec(url))) {
    const entry = media.video[m[1]];
    if (!entry) return url;
    stats.rewrote++;
    return joinUrl(videoBase, downloadName(entry));
  }
  if ((m = /^\/d\/p\/(.+)$/.exec(url))) {
    const entry = media.file[m[1]];
    if (!entry) return url;
    stats.rewrote++;
    return joinUrl(fileBase, downloadName(entry));
  }
  return url;
}

function walk(value, fn) {
  if (Array.isArray(value)) return value.map((v) => walk(v, fn));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = walk(v, fn);
    return out;
  }
  return fn(value);
}

async function copyTree(from, to) {
  await fsp.mkdir(to, { recursive: true });
  for (const entry of await fsp.readdir(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) await copyTree(src, dst);
    else if (entry.isFile()) await fsp.copyFile(src, dst);
  }
}

function checkSelfContained(model) {
  const items = [...model.episodes, ...model.extras];
  const noMp4 = items.filter((i) => i.video && !(i.video.mp4 && i.video.mp4.src)).map((i) => i.id);
  if (noMp4.length) {
    die([
      '自包含模式需要每期都有可下载/可播放的 MP4，这些还没有：',
      '  ' + noMp4.join(', '),
      '',
      '先运行：python tools/make-mp4.py',
    ].join('\n'));
  }
  if (!fs.existsSync(path.join(SITE, 'files', 'video'))) {
    die('site/files/video 不存在，先运行 python tools/make-mp4.py');
  }
}

async function main() {
  await fsp.rm(OUT, { recursive: true, force: true });
  await copyTree(SITE, OUT);

  const src = path.join(SITE, 'data', 'episodes.json');
  let model = readJSON(src);

  if (SELF_CONTAINED) {
    checkSelfContained(model);
    // 去掉没有切片的额外版本，避免切到空白
    model.episodes = model.episodes.map((e) => {
      const keep = (e.variants || []).filter((v) => v.mp4 && v.mp4.src);
      stats.droppedVariants += (e.variants || []).length - keep.length;
      return { ...e, variants: keep };
    });
    model = stripLocal(model);
    model.site.mode = 'pages';
  } else {
    model = walk(model, rewriteUrl);
    model.site.mode = 'local';
  }

  const dataFile = path.join(OUT, 'data', 'episodes.json');
  await fsp.writeFile(dataFile, JSON.stringify(model), 'utf8');
  await fsp.writeFile(path.join(OUT, '.nojekyll'), '', 'utf8');
  if (config.cname) {
    await fsp.writeFile(path.join(OUT, 'CNAME'), String(config.cname).trim() + '\n', 'utf8');
  }

  // 自包含：不能残留本地路由
  if (SELF_CONTAINED) {
    const leftovers = JSON.stringify(model).match(/"\/(?:v|d)\//g) || [];
    if (leftovers.length) die(`还有 ${leftovers.length} 个本地媒体地址没处理掉。`);
  }

  const size = (await dirSize(OUT)) / 1024 / 1024;
  console.log('');
  console.log('  静态包已生成：' + path.relative(ROOT, OUT) + '/  （' + size.toFixed(1) + ' MB）');
  console.log('  ' + '-'.repeat(46));
  if (SELF_CONTAINED) {
    console.log('  模式           自包含（视频 MP4 + PPT 全在包内）');
    console.log(`  清理本地地址   ${stats.stripped} 处`);
    if (stats.droppedVariants) console.log(`  略过无切片的版本 ${stats.droppedVariants} 个`);
  } else {
    console.log('  模式           外链');
    console.log(`  改写媒体地址   ${stats.rewrote} 处`);
    console.log(`  视频前缀       ${videoBase}`);
    console.log(`  文件前缀       ${fileBase}`);
  }
  if (config.cname) console.log(`  自定义域名     ${config.cname}`);
  console.log('');
  console.log('  下一步：git add -A && git commit && git push，Actions 会发布到 GitHub Pages（docs/DEPLOY.md）。');
  console.log('');
}

async function dirSize(dir) {
  let total = 0;
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += await dirSize(p);
    else if (e.isFile()) total += (await fsp.stat(p)).size;
  }
  return total;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
