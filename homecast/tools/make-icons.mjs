// Draws the app icon and the TV banner (needs Playwright). Run: node tools/make-icons.mjs
import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch (e) { pw = createRequire('/opt/node-tools/')('playwright'); }
const root = new URL('..', import.meta.url).pathname;

const mark = (s) => `
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3b5c"/><stop offset="1" stop-color="#ff7a2f"/></linearGradient></defs>
  <rect x="${s * 0.06}" y="${s * 0.06}" width="${s * 0.88}" height="${s * 0.88}" rx="${s * 0.2}" fill="url(#g)"/>
  <path d="M${s * 0.38} ${s * 0.3} L${s * 0.72} ${s * 0.5} L${s * 0.38} ${s * 0.7} Z" fill="#fff"/>
  <path d="M${s * 0.2} ${s * 0.62} a${s * 0.12} ${s * 0.12} 0 0 1 ${s * 0.12} ${s * 0.12}" stroke="#fff" stroke-width="${s * 0.045}" fill="none" stroke-linecap="round"/>
  <path d="M${s * 0.2} ${s * 0.5} a${s * 0.24} ${s * 0.24} 0 0 1 ${s * 0.24} ${s * 0.24}" stroke="#fff" stroke-opacity="0.7" stroke-width="${s * 0.045}" fill="none" stroke-linecap="round"/>
  <circle cx="${s * 0.22}" cy="${s * 0.72}" r="${s * 0.035}" fill="#fff"/>`;

const b = await pw.chromium.launch();
const p = await b.newPage();
const out = {};
for (const [d, s] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  await p.setViewportSize({ width: s, height: s });
  await p.setContent(`<body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">${mark(s)}</svg></body>`);
  out[d] = await p.screenshot({ omitBackground: true });
}
await p.setViewportSize({ width: 320, height: 180 });
await p.setContent(`<body style="margin:0;width:320px;height:180px;background:#0b0d12;display:flex;align-items:center;justify-content:center;font-family:Roboto,Arial,sans-serif">
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">${mark(96)}</svg>
  <div style="color:#fff;font-size:40px;font-weight:800;margin-left:14px;letter-spacing:-0.5px">Home<span style="color:#ff5a45">Cast</span></div></body>`);
const banner = await p.screenshot();
await b.close();
const save = (path, buf) => { mkdirSync(path.replace(/\/[^/]+$/, ''), { recursive: true }); writeFileSync(path, buf); };
for (const d in out) save(root + `android/res/mipmap-${d}/ic_launcher.png`, out[d]);
save(root + 'android/res/drawable-xhdpi/banner.png', banner);
console.log('icons written');
