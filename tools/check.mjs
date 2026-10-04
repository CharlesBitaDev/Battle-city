// Checks that the game code parses as ES2017 (old TV WebViews) and the 100 stages are well formed.
// Run: node tools/check.mjs   (needs the "acorn" package: npm install --no-save acorn)
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let acorn;
try { acorn = require('acorn'); } catch (e) { acorn = createRequire('/opt/node-tools/')('acorn'); }

const root = new URL('../web/', import.meta.url).pathname;
let bad = 0;
function parse(name, code) {
  try { acorn.parse(code, { ecmaVersion: 2017, sourceType: 'script' }); }
  catch (e) { console.error(name + ': ' + e.message); bad++; }
}
for (const f of readdirSync(root + 'js')) parse('js/' + f, readFileSync(root + 'js/' + f, 'utf8'));
for (const f of ['index.html', 'controller.html', '../store/web/index.html']) {
  const html = readFileSync(root + f, 'utf8');
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) parse(f, m[1]);
}

globalThis.window = {};
new Function('window', readFileSync(root + 'js/levels.js', 'utf8'))(globalThis.window);
const L = globalThis.window.BC.LEVELS;
if (L.length !== 100) { console.error('expected 100 stages, got ' + L.length); bad++; }
L.forEach((l, i) => {
  if (l.m.length !== 676 || /[^.#@~%-]/.test(l.m)) { console.error('stage ' + (i + 1) + ': bad map'); bad++; }
  if (l.o.length !== 20 || /[^bfpa]/.test(l.o)) { console.error('stage ' + (i + 1) + ': bad enemy list'); bad++; }
});
try {
  const cat = JSON.parse(readFileSync(new URL('../store/catalog.json', import.meta.url), 'utf8'));
  for (const g of cat.games) {
    for (const k of ['id', 'name', 'package', 'version', 'apk']) if (!g[k]) { console.error('catalog: ' + (g.id || '?') + ' has no ' + k); bad++; }
  }
  if (!cat.store || !cat.store.apk) { console.error('catalog: no store entry'); bad++; }
} catch (e) { console.error('store/catalog.json: ' + e.message); bad++; }
if (bad) process.exit(1);
console.log('OK: code parses as ES2017, ' + L.length + ' stages valid');
