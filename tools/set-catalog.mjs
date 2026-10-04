// Records a new build in store/catalog.json so the Game Store offers it as an update.
// Usage: node tools/set-catalog.mjs <game id | store> <versionCode> <versionName>
import { readFileSync, writeFileSync } from 'node:fs';

const [id, code, name] = process.argv.slice(2);
if (!id || !code) {
  console.error('usage: node tools/set-catalog.mjs <game id | store> <versionCode> <versionName>');
  process.exit(1);
}
const file = new URL('../store/catalog.json', import.meta.url);
const cat = JSON.parse(readFileSync(file, 'utf8'));
const entry = id === 'store' ? cat.store : cat.games.find((g) => g.id === id);
if (!entry) {
  console.error('no catalog entry for ' + id);
  process.exit(1);
}
entry.version = Number(code);
if (name) entry.versionName = name;
writeFileSync(file, JSON.stringify(cat, null, 2) + '\n');
console.log('catalog: ' + id + ' -> ' + code + (name ? ' (' + name + ')' : ''));
