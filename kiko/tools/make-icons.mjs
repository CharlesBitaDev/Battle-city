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
  const t = BC.tiles(0);
  // icon: 32x32, Kiko on a grass block under a sky
  const ic = BC.canvas(32, 32);
  const x = ic.getContext('2d');
  x.fillStyle = BC.THEMES[0].sky; x.fillRect(0, 0, 32, 32);
  x.drawImage(t.surface, 0, 24); x.drawImage(t.surface, 16, 24);
  x.drawImage(BC.kiko('big', 'jump', false), 8, 1);
  x.drawImage(BC.COIN[0], 22, -2, 10, 10);
  const icons = {};
  for (const [d, s] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) icons[d] = scaled(ic, s);
  // banner: 160x90 drawn at 2x = 320x180
  const bn = BC.canvas(160, 90);
  const y = bn.getContext('2d');
  const bg = BC.background(0);
  y.fillStyle = bg.sky; y.fillRect(0, 0, 160, 90);
  y.drawImage(bg.far, -40, -110);
  for (let i = 0; i < 10; i++) y.drawImage(t.surface, i * 16, 76);
  BC.text(y, "KIKO'S", 81, 7, '#2a1606', 2, 'center');
  BC.text(y, "KIKO'S", 80, 6, '#ffd23f', 2, 'center');
  BC.text(y, 'QUEST', 81, 25, '#2a1606', 3, 'center');
  BC.text(y, 'QUEST', 80, 24, '#ffd23f', 3, 'center');
  y.drawImage(BC.kiko('big', 'walk1', false), 20, 52);
  y.drawImage(BC.kiko('small', 'jump', false, true), 44, 50);
  y.drawImage(t.gift[0], 72, 48);
  y.drawImage(BC.enemy('beetle', 0, true), 124, 60);
  return { icons, banner: scaled(bn, 320) };
});
await b.close();
const save = (path, url) => { mkdirSync(path.replace(/\/[^/]+$/, ''), { recursive: true }); writeFileSync(path, Buffer.from(url.split(',')[1], 'base64')); };
for (const d in out.icons) save(root + `android/res/mipmap-${d}/ic_launcher.png`, out.icons[d]);
save(root + 'android/res/drawable-xhdpi/banner.png', out.banner);
console.log('icons written');
