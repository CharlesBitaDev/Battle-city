// Checks that the game code parses as ES2017 (old TV WebViews) and the 30 mazes are well formed.
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
if (L.length !== 30) { console.error('expected 30 levels, got ' + L.length); bad++; }
L.forEach((l, i) => {
  if (l.maze.length !== 27 || l.maze.some((r) => r.length !== 27 || /[^#.o T=-]/.test(r))) { console.error('level ' + (i + 1) + ': bad maze'); bad++; }
  if ((l.maze.join('').match(/o/g) || []).length !== 4) { console.error('level ' + (i + 1) + ': needs 4 big cheeses'); bad++; }
});
if (bad) process.exit(1);
console.log('OK: code parses as ES2017, ' + L.length + ' mazes valid');
