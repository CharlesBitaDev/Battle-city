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
  function scaled(src, size) {
    const c = BC.canvas(size, size * src.height / src.width);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }
  // icon: 32x32
  const ic = BC.canvas(32, 32);
  const x = ic.getContext('2d');
  x.fillStyle = '#101010'; x.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 4; i++) { x.drawImage(BC.CELLS.brick, i * 8, 24); }
  x.drawImage(BC.CELLS.steel, 0, 16); x.drawImage(BC.CELLS.steel, 24, 16);
  x.drawImage(BC.tankSprite('pl', 'p1', 0, 0), 8, 5);
  x.fillStyle = '#e8e8e8'; x.fillRect(15, 1, 2, 2);
  const icons = {};
  for (const [d, s] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) icons[d] = scaled(ic, s);
  // banner: 160x90 drawn at 2x = 320x180
  const bn = BC.canvas(160, 90);
  const y = bn.getContext('2d');
  y.fillStyle = '#000'; y.fillRect(0, 0, 160, 90);
  BC.brickText(y, 'BATTLE', 80, 14, 3, 'center');
  BC.brickText(y, 'CITY', 80, 40, 3, 'center');
  for (let i = 0; i < 20; i++) y.drawImage(BC.CELLS.brick, i * 8, 82);
  y.drawImage(BC.tankSprite('pl', 'p1', 1, 0), 8, 66);
  y.drawImage(BC.tankSprite('pl', 'p2', 1, 1), 28, 66);
  y.drawImage(BC.tankSprite(3, 'ag', 3, 0), 136, 66);
  y.drawImage(BC.tankSprite(1, 'en', 3, 0), 116, 66);
  y.fillStyle = '#e8e8e8'; y.fillRect(56, 73, 2, 2); y.fillRect(100, 73, 2, 2);
  return { icons, banner: scaled(bn, 320) };
});
await b.close();
const save = (path, url) => { mkdirSync(path.replace(/\/[^/]+$/, ''), { recursive: true }); writeFileSync(path, Buffer.from(url.split(',')[1], 'base64')); };
for (const d in out.icons) save(root + `android/res/mipmap-${d}/ic_launcher.png`, out.icons[d]);
save(root + 'android/res/drawable-xhdpi/banner.png', out.banner);
console.log('icons written');
