// Draws the app icon and TV banner from the game's own sprites (needs Playwright).
// Run: node tools/make-icons.mjs
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
  function scaled(src, w) {
    const c = BC.canvas(w, w * src.height / src.width);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }
  // icon: 32x32, Pip with a big cheese, a cat behind
  const ic = BC.canvas(32, 32);
  const x = ic.getContext('2d');
  x.fillStyle = '#1a120c'; x.fillRect(0, 0, 32, 32);
  x.fillStyle = '#e0a050'; x.fillRect(0, 27, 32, 1); x.fillRect(0, 4, 32, 1);
  x.drawImage(BC.cat(0, 3, 0, ''), 17, 9);
  x.drawImage(BC.mouse(0, true, 0), 2, 12);
  const icons = {};
  for (const [d, s] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) icons[d] = scaled(ic, s);
  // banner: 160x90 drawn at 2x = 320x180
  const bn = BC.canvas(160, 90);
  const y = bn.getContext('2d');
  y.fillStyle = '#120c0a'; y.fillRect(0, 0, 160, 90);
  y.fillStyle = '#38200e'; y.fillRect(0, 0, 160, 4); y.fillRect(0, 86, 160, 4);
  y.fillStyle = '#e0a050'; y.fillRect(0, 4, 160, 1); y.fillRect(0, 85, 160, 1);
  BC.text(y, 'CHEESE', 81, 11, '#6a3a10', 3, 'center');
  BC.text(y, 'CHEESE', 80, 10, '#ffd23f', 3, 'center');
  BC.text(y, 'CHASE', 81, 37, '#6a3a10', 3, 'center');
  BC.text(y, 'CHASE', 80, 36, '#ffd23f', 3, 'center');
  y.drawImage(BC.BIG_CHEESE, 10, 66);
  for (let i = 30; i < 50; i += 8) { y.fillStyle = '#ffe08a'; y.fillRect(i, 70, 2, 2); }
  y.drawImage(BC.mouse(0, true, 0), 56, 64);
  for (let i = 0; i < 4; i++) y.drawImage(BC.cat(i, 3, i % 2, ''), 80 + i * 18, 64);
  return { icons, banner: scaled(bn, 320) };
});
await b.close();
const save = (path, url) => { mkdirSync(path.replace(/\/[^/]+$/, ''), { recursive: true }); writeFileSync(path, Buffer.from(url.split(',')[1], 'base64')); };
for (const d in out.icons) save(root + `android/res/mipmap-${d}/ic_launcher.png`, out.icons[d]);
save(root + 'android/res/drawable-xhdpi/banner.png', out.banner);
console.log('icons written');
