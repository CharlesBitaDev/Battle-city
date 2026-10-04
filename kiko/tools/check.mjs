// Checks that the game code parses as ES2017 (old TV WebViews) and the 16 levels are well formed.
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
for (const f of ['index.html', 'controller.html']) {
  const html = readFileSync(root + f, 'utf8');
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) parse(f, m[1]);
}

globalThis.window = {};
new Function('window', readFileSync(root + 'js/levels.js', 'utf8'))(globalThis.window);
const L = globalThis.window.BC.LEVELS;
if (L.length !== 16) { console.error('expected 16 levels, got ' + L.length); bad++; }
L.forEach((l) => {
  const w = l.rows[0].length;
  if (l.rows.length !== 13 || l.rows.some((r) => r.length !== w || /[^.#XB?P1=^ogsbfMVKFS]/.test(r))) { console.error(l.name + ': bad map'); bad++; }
  const all = l.rows.join('');
  if ((all.match(/S/g) || []).length !== 1 || (all.match(/F/g) || []).length !== 1) { console.error(l.name + ': needs one S and one F'); bad++; }
});
if (bad) process.exit(1);
console.log('OK: code parses as ES2017, ' + L.length + ' levels valid');
