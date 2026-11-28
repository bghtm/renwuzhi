#!/usr/bin/env node
/**
 * 跨圈人物志 · 极速版 — local web server
 *
 *   site/          static site (built assets, data, covers, slides)
 *   /v/<file>      video stream with HTTP Range support (seeking)
 *   /d/v/<file>    video download (Content-Disposition)
 *   /d/p/<file>    pptx download
 *   /api/status    JSON health/counts
 *
 * No dependencies. Node >= 18.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(ROOT, 'site');
const DATA = path.join(ROOT, 'data');

const argv = process.argv.slice(2);
const argVal = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const HOST = argVal('--host', '127.0.0.1');
const PORT = Number(argVal('--port', process.env.PORT || 5310));
const OPEN = argv.includes('--open');
const QUIET = argv.includes('--quiet');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

let MEDIA = { video: {}, file: {} };
try {
  MEDIA = JSON.parse(fs.readFileSync(path.join(DATA, 'media-map.json'), 'utf8'));
} catch (err) {
  console.warn('[warn] data/media-map.json 读取失败，先运行 python tools/build-data.py');
}

/* ------------------------------------------------------------------ helpers */
function log(...args) {
  if (!QUIET) console.log(...args);
}

function contentDisposition(name, hint) {
  const ext = path.extname(name) || '';
  const ascii = (hint || path.basename(name, ext)).replace(/[^\x20-\x7e]/g, '-').replace(/["\\]/g, '-');
  return `attachment; filename="${ascii}${ext}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m) return { invalid: true };
  const [, s, e] = m;
  if (s === '' && e === '') return { invalid: true };
  let start;
  let end;
  if (s === '') {
    const n = parseInt(e, 10);
    if (!n) return { invalid: true };
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = parseInt(s, 10);
    end = e === '' ? size - 1 : Math.min(parseInt(e, 10), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return { invalid: true };
  }
  return { start, end };
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj, null, 1);
  res.writeHead(code, {
    'Content-Type': MIME['.json'],
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendText(res, code, text) {
  res.writeHead(code, { 'Content-Type': MIME['.txt'], 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

/* --------------------------------------------------------------- static site */
async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith('/')) rel += 'index.html';
  const filePath = path.normalize(path.join(SITE, rel));
  if (!filePath.startsWith(SITE)) return sendText(res, 403, 'forbidden');

  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return sendText(res, 404, 'not found');
  }
  if (stat.isDirectory()) {
    return serveStatic(req, res, urlPath.replace(/\/?$/, '/') + 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const revalidate = ['.html', '.json', '.css', '.js'].includes(ext);
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Last-Modified': stat.mtime.toUTCString(),
    ETag: etag,
    'Accept-Ranges': 'bytes',
    'Cache-Control': revalidate ? 'no-cache' : 'public, max-age=86400',
  };

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }

  const range = parseRange(req.headers.range, stat.size);
  if (range && range.invalid) {
    res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
    return res.end();
  }
  if (range) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
    headers['Content-Length'] = range.end - range.start + 1;
    res.writeHead(206, headers);
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
  }

  headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
}

/* ------------------------------------------------------------- media routes */
async function serveMedia(req, res, kind, name, download) {
  const table = MEDIA[kind] || {};
  const entry = table[name];
  if (!entry) return sendText(res, 404, '未知的媒体文件: ' + name);

  let stat;
  try {
    stat = await fsp.stat(entry.path);
  } catch {
    return sendText(res, 404, '源文件不存在（可能被移动或仍在同步）: ' + entry.path);
  }

  const ext = path.extname(entry.path).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Last-Modified': stat.mtime.toUTCString(),
    'Cache-Control': download ? 'private, max-age=0' : 'public, max-age=3600',
  };
  if (download) headers['Content-Disposition'] = contentDisposition(entry.name, 'kuake-renwuzhi-' + path.basename(name, path.extname(name)));

  const range = download ? null : parseRange(req.headers.range, stat.size);
  if (range && range.invalid) {
    res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
    return res.end();
  }
  if (range) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
    headers['Content-Length'] = range.end - range.start + 1;
    res.writeHead(206, headers);
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(entry.path, { start: range.start, end: range.end });
    stream.on('error', () => res.destroy());
    return stream.pipe(res);
  }

  headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(entry.path);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/* ------------------------------------------------------------------- router */
const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let status = 200;
  res.on('finish', () => {
    status = res.statusCode;
    if (!QUIET) {
      const ms = Date.now() - started;
      console.log(`${String(status).padEnd(3)} ${req.method.padEnd(4)} ${decodeURIComponent(req.url)} — ${ms}ms`);
    }
  });
  res.on('error', () => {});

  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end('method not allowed');
    }
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    if (p === '/api/status') {
      const counts = {
        videos: Object.keys(MEDIA.video || {}).length,
        files: Object.keys(MEDIA.file || {}).length,
      };
      return sendJSON(res, 200, { ok: true, ...counts, root: ROOT });
    }

    // /v/<file>
    let m = /^\/v\/([^/]+)$/.exec(p);
    if (m) return await serveMedia(req, res, 'video', m[1], false);

    // /d/v/<file> and /d/p/<file>
    m = /^\/d\/(v|p)\/([^/]+)$/.exec(p);
    if (m) return await serveMedia(req, res, m[1] === 'v' ? 'video' : 'file', m[2], true);

    if (p.startsWith('/d/') || p.startsWith('/v/')) return sendText(res, 404, 'not found');

    return await serveStatic(req, res, p === '' ? '/' : p);
  } catch (err) {
    console.error('[error]', err);
    if (!res.headersSent) sendText(res, 500, 'server error');
    else res.destroy();
  }
});

/* --------------------------------------------------------------- listen loop */
let browserOpened = false;

function openBrowser(url) {
  if (browserOpened) return;
  browserOpened = true;
  try {
    if (process.platform === 'win32') {
      // 用参数数组而不是字符串，避免 cmd 引号解析出错
      spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (err) {
    console.warn('[warn] 无法自动打开浏览器，请手动访问：' + url);
  }
}

async function isOurServer(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) return false;
    const j = await res.json();
    return j && j.ok === true && typeof j.videos === 'number';
  } catch {
    return false;
  }
}

function listen(port, attempt = 0) {
  server.once('error', async (err) => {
    if (err.code === 'EADDRINUSE') {
      // 端口被占用：如果占用者就是本站在跑，就别再起一个实例（否则会开一堆重复窗口）
      if (await isOurServer(port)) {
        const url = `http://127.0.0.1:${port}/`;
        console.log('');
        console.log(`  站点已经在运行：${url}`);
        console.log('  （这次不重复启动，直接打开页面）');
        console.log('');
        if (OPEN) openBrowser(url);
        process.exit(0);
      }
      if (attempt < 10) {
        console.warn(`[warn] 端口 ${port} 被别的程序占用，尝试 ${port + 1} …`);
        listen(port + 1, attempt + 1);
        return;
      }
    }
    console.error('[fatal]', err.message);
    process.exit(1);
  });
  server.listen(port, HOST, () => {
    const hostForUrl = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;
    const url = `http://${hostForUrl}:${port}/`;
    console.log('');
    console.log('  人物志档案 · 跨圈 / 药圈');
    console.log('  ' + '-'.repeat(46));
    console.log(`  站点地址   ${url}`);
    console.log(`  视频 ${Object.keys(MEDIA.video || {}).length} 个 · 文件 ${Object.keys(MEDIA.file || {}).length} 个（从原始目录直接串流，不复制）`);
    if (HOST === '0.0.0.0') console.log(`  局域网     http://<本机IP>:${port}/`);
    console.log('  按 Ctrl+C 停止');
    console.log('');
    if (OPEN) openBrowser(url);
  });
}

listen(PORT);
