// Draws the Game Store's icon and TV banner (needs Playwright). Run: node tools/make-store-icons.mjs
import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch (e) { pw = createRequire('/opt/node-tools/')('playwright'); }
const root = new URL('..', import.meta.url).pathname;
const b = await pw.chromium.launch();
const p = await b.newPage();
await p.goto('file://' + root + 'web/index.html');
await p.waitForTimeout(300);
const out = await p.evaluate(() => {
  function scaled(src, w, h) {
    const c = BC.canvas(w, h);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(src, 0, 0, w, h);
    return c.toDataURL('image/png');
  }
  // A pixel gamepad on a dark tile, 32x32.
  function pad(x, ox, oy) {
    x.fillStyle = '#f2a03d';
    x.fillRect(ox + 3, oy + 2, 20, 10); x.fillRect(ox + 1, oy + 4, 24, 8); x.fillRect(ox + 1, oy + 12, 7, 3); x.fillRect(ox + 18, oy + 12, 7, 3);
    x.fillStyle = '#10131c';
    x.fillRect(ox + 5, oy + 7, 6, 2); x.fillRect(ox + 7, oy + 5, 2, 6);
    x.fillRect(ox + 17, oy + 5, 2, 2); x.fillRect(ox + 20, oy + 8, 2, 2);
  }
  const ic = BC.canvas(32, 32);
  const x = ic.getContext('2d');
  x.fillStyle = '#10131c'; x.fillRect(0, 0, 32, 32);
  x.fillStyle = '#232a3c'; x.fillRect(2, 2, 28, 28);
  pad(x, 3, 8);
  const icons = {};
  for (const [d, s] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) icons[d] = scaled(ic, s, s);
  const bn = BC.canvas(160, 90);
  const y = bn.getContext('2d');
  y.fillStyle = '#10131c'; y.fillRect(0, 0, 160, 90);
  pad(y, 67, 6);
  BC.text(y, 'GAME', 80, 32, '#f2f4f8', 3, 'center');
  BC.text(y, 'STORE', 80, 60, '#f2a03d', 3, 'center');
  return { icons, banner: scaled(bn, 320, 180) };
});
await b.close();
const save = (path, url) => { mkdirSync(path.replace(/\/[^/]+$/, ''), { recursive: true }); writeFileSync(path, Buffer.from(url.split(',')[1], 'base64')); };
for (const d in out.icons) save(root + `store/android/res/mipmap-${d}/ic_launcher.png`, out.icons[d]);
save(root + 'store/android/res/drawable-xhdpi/banner.png', out.banner);
console.log('store icons written');
