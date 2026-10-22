// Checks that the page's code parses as ES2017 (old TV WebViews). Run: node tools/check.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let acorn;
try { acorn = require('acorn'); } catch (e) { acorn = createRequire('/opt/node-tools/')('acorn'); }
const root = new URL('../web/', import.meta.url).pathname;
let bad = 0;
for (const f of readdirSync(root + 'js')) {
  try { acorn.parse(readFileSync(root + 'js/' + f, 'utf8'), { ecmaVersion: 2017, sourceType: 'script' }); }
  catch (e) { console.error('js/' + f + ': ' + e.message); bad++; }
}
const css = readFileSync(root + 'index.html', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
for (const word of [/\binset\s*:/, /aspect-ratio/, /[^-]gap\s*:/]) if (word.test(css)) { console.error('index.html uses ' + word + ' (not on old TVs)'); bad++; }
if (bad) process.exit(1);
console.log('OK: code parses as ES2017');
