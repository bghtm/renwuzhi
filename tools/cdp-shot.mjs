#!/usr/bin/env node
/**
 * Headless verification harness (Chrome DevTools Protocol, no dependencies).
 *
 * Usage:
 *   node tools/cdp-shot.mjs --url http://127.0.0.1:5310/ --out shots/home.png \
 *        [--width 1440] [--height 900] [--scale 1] [--mobile] [--clip] \
 *        [--eval "js expression"] [--wait 500]
 *
 * Prints a JSON report (layout metrics + optional eval result) to stdout.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const flag = (name) => argv.includes(name);

const URL_ = arg('--url', 'http://127.0.0.1:5310/');
const OUT = arg('--out', '');
const WIDTH = Number(arg('--width', 1440));
const HEIGHT = Number(arg('--height', 900));
const SCALE = Number(arg('--scale', 1));
const MOBILE = flag('--mobile');
const CLIP = flag('--clip');
const EVAL = arg('--eval', '');
const WAIT = Number(arg('--wait', 450));
const PORT = Number(arg('--port', 9411));

if (!EDGE) {
  console.error('no Chromium browser found');
  process.exit(1);
}

const profile = path.join(process.cwd(), '.build', 'cdp-profile');
fs.mkdirSync(profile, { recursive: true });

const child = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--mute-audio',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForEndpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error('devtools endpoint did not come up');
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method) {
      (listeners.get(msg.method) || []).forEach((fn) => fn(msg.params));
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  const once = (method) =>
    new Promise((resolve) => {
      const arr = listeners.get(method) || [];
      const fn = (p) => {
        listeners.set(method, (listeners.get(method) || []).filter((f) => f !== fn));
        resolve(p);
      };
      listeners.set(method, arr.concat(fn));
    });
  const close = () => ws.close();
  return { ws, ready, send, once, close };
}

function shutdown(code = 0) {
  try { child.kill(); } catch {}
  setTimeout(() => process.exit(code), 120);
}

try {
  const wsUrl = await waitForEndpoint();
  const cdp = connect(wsUrl);
  await cdp.ready;

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: SCALE, mobile: MOBILE,
  });

  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: URL_ });
  await Promise.race([loaded, sleep(8000)]);

  // wait until the app has rendered something
  for (let i = 0; i < 40; i++) {
    const r = await cdp.send('Runtime.evaluate', {
      expression: "!!document.querySelector('.card, .detail, .error')",
      returnByValue: true,
    });
    if (r.result.value) break;
    await sleep(100);
  }

  // scroll through the page so lazy images get a chance to load
  if (!flag('--noscroll')) {
    await cdp.send('Runtime.evaluate', {
      expression: `(async () => {
        const root = document.documentElement;
        const prevBehavior = root.style.scrollBehavior;
        root.style.scrollBehavior = 'auto';
        const step = Math.max(200, Math.floor(window.innerHeight * 0.75));
        const h = root.scrollHeight;
        for (let y = 0; y < h; y += step) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 110));
        }
        window.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 250));
        root.style.scrollBehavior = prevBehavior;
        return h;
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
  }

  // wait for images to settle
  await cdp.send('Runtime.evaluate', {
    expression: `Promise.race([
      Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(res => {
        i.onload = i.onerror = res; setTimeout(res, 3000);
      }))),
      new Promise(r => setTimeout(r, 3500))
    ]).then(() => 1)`,
    awaitPromise: true,
    returnByValue: true,
  });

  await sleep(WAIT);

  // optional trusted click (real user gesture → autoplay policy applies as for a user)
  const CLICK = arg('--click', '');
  if (CLICK) {
    const box = await cdp.send('Runtime.evaluate', {
      expression: `(async () => {
        const el = document.querySelector(${JSON.stringify(CLICK)});
        if (!el) return null;
        document.documentElement.style.scrollBehavior = 'auto';
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        await new Promise(r => setTimeout(r, 180));
        const r = el.getBoundingClientRect();
        return [r.x + r.width / 2, r.y + r.height / 2];
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const pt = box.result.value;
    if (!pt) {
      console.error('click target not found:', CLICK);
    } else {
      const [x, y] = pt;
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await sleep(Number(arg('--clickwait', 1500)));
    }
  }

  const metrics = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const d = document.documentElement;
      return {
        title: document.title,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth: d.scrollWidth,
        scrollHeight: d.scrollHeight,
        overflowX: d.scrollWidth - window.innerWidth,
        images: document.images.length,
        brokenImages: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.currentSrc || i.src),
        cards: document.querySelectorAll('.card').length,
      };
    })()`,
    returnByValue: true,
  });

  const report = { url: URL_, width: WIDTH, ...metrics.result.value };

  if (EVAL) {
    const r = await cdp.send('Runtime.evaluate', {
      expression: EVAL, awaitPromise: true, returnByValue: true,
    });
    report.eval = r.exceptionDetails
      ? { error: r.exceptionDetails.text, detail: r.result?.description }
      : r.result.value;
    await sleep(250);
  }

  if (OUT) {
    const layout = await cdp.send('Page.getLayoutMetrics');
    const size = layout.cssContentSize || layout.contentSize;
    const params = { format: 'png', captureBeyondViewport: !CLIP };
    if (!CLIP) {
      params.clip = { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 };
    }
    const shot = await cdp.send('Page.captureScreenshot', params);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
    report.screenshot = { file: OUT, width: Math.ceil(size.width), height: Math.ceil(size.height) };
  }

  console.log(JSON.stringify(report, null, 1));
  cdp.close();
  shutdown(0);
} catch (err) {
  console.error('CDP error:', err.message);
  shutdown(1);
}
