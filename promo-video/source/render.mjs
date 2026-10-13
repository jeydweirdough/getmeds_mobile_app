// Frame-accurate renderer: serves the composition, seeks GSAP to each (sub)frame, screenshots.
//   node render.mjs stills 0.5 4.1 ...      -> stills/t_<time>.png
//   node render.mjs frames <fps> <sub> <workers> -> frames/f_000000.jpg (fps*sub images; blended later by ffmpeg)
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname).replace(/^\/(\w:)/, '$1');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
}).listen(0);
const URL_ = `http://127.0.0.1:${server.address().port}/index.html`;
const DUR = Number(process.env.DUR || 35);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

async function open() {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') console.log('console', m.text()); });
  await p.goto(URL_, { waitUntil: 'load' });
  const dur = await p.evaluate(() => window.__ready);
  return { b, p, dur };
}
const seek = (p, t) => p.evaluate((t) => { window.__seek(t); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, t);

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'stills') {
  fs.mkdirSync(path.join(ROOT, 'stills'), { recursive: true });
  const { b, p, dur } = await open();
  console.log('duration', dur);
  for (const t of rest.map(Number)) { await seek(p, t); await p.screenshot({ path: path.join(ROOT, 'stills', `t_${t.toFixed(2)}.png`) }); console.log('still', t); }
  await b.close();
} else if (mode === 'frames') {
  const fps = Number(rest[0] || 60), sub = Number(rest[1] || 1), workers = Number(rest[2] || 6);
  const shutter = 0.5; // 180-degree shutter: subframes span half a frame
  const out = path.join(ROOT, 'frames');
  const from = rest[3] != null ? Math.round(Number(rest[3]) * fps) * sub : 0, to = rest[4] != null ? Math.round(Number(rest[4]) * fps) * sub : Math.round(DUR * fps) * sub;
  if (rest[3] == null) fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const total = to - from;
  const t0 = Date.now();
  let done = 0;
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const { b, p } = await open();
    const per = Math.ceil(total / workers);
    for (let i = from + w * per; i < from + Math.min(total, (w + 1) * per); i++) {
      const frame = Math.floor(i / sub), s = i % sub;
      const t = (frame + (sub > 1 ? (s / sub) * shutter : 0)) / fps;
      await seek(p, t);
      await p.screenshot({ path: path.join(out, `f_${String(i).padStart(6, '0')}.jpg`), type: 'jpeg', quality: 94, optimizeForSpeed: true });
      if (++done % 200 === 0) console.log(`${done}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    await b.close();
  }));
  console.log('frames done', total, ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
server.close();
