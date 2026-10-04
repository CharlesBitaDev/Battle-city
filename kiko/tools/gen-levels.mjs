// Builds the 16 levels of Kiko's Quest into web/js/levels.js.
// Levels are 13 tiles tall and made of hand-designed sections ("chunks"), so every jump in
// a chunk is known to be possible; harder chunks unlock in later levels.
// Run: node tools/gen-levels.mjs
//
// Map characters:
//   . empty   # ground   X stone block   B brick   ? gift box (coin)   P gift box (power-up)
//   1 gift box (extra life)   = wooden platform (stand on top, jump up through)   ^ spikes
//   o coin   g beetle   s spiky   b bird   f frog   M moving platform (sideways)
//   V moving platform (up and down)   K checkpoint   F goal flag   S start
import { writeFileSync } from 'node:fs';

const H = 13;
const WORLDS = 4, PER_WORLD = 4;

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A chunk: width, minimum difficulty, worlds it suits, and its rows (row number -> text).
// Rows 11 and 12 are solid ground unless given.
function chunk(name, d, worlds, w, rows, weight) {
  const grid = [];
  for (let r = 0; r < H; r++) {
    let s = rows[r] !== undefined ? rows[r] : (r >= 11 ? '#'.repeat(w) : '');
    s = (s + '.'.repeat(w)).slice(0, w);
    grid.push(s);
  }
  return { name, d, worlds, w, grid, weight: weight || 1 };
}

const ALL = [0, 1, 2, 3];
const CHUNKS = [
  chunk('flat', 0, ALL, 12, { 9: '....ooo.....' }),
  chunk('boxes', 0, ALL, 16, { 7: '....?..BPB......', 10: '...........g....' }, 2),
  chunk('gap2', 0, ALL, 14, { 8: '.....oo.......', 11: '######..######', 12: '######..######' }),
  chunk('steps', 0, ALL, 16, { 8: '.........X......', 9: '........XX......', 10: '.......XXX...g..' }),
  chunk('hill', 0, [0, 1], 14, { 7: '.....ooo......', 8: '...########...', 9: '...########...', 10: '...########...' }),
  chunk('arc', 0, ALL, 14, { 6: '.....oooo.....', 7: '....o....o....', 10: '..........g...' }),
  chunk('beetles', 1, ALL, 18, { 7: '........B?B.......', 10: '......g.....g.....' }, 2),
  chunk('plank-gap', 1, ALL, 16, { 7: '.......o........', 8: '......===.......', 11: '####........####', 12: '####........####' }),
  chunk('tunnel', 1, [2], 18, { 6: '..BBBBBBBBBBBBBB..', 9: '....o.o.o.o.o.....', 10: '.........g........' }, 3),
  chunk('life', 1, ALL, 12, { 7: '.....1......', 10: '.........g..' }, 0.4),
  chunk('pillars', 2, ALL, 16, { 7: '....oo....oo....', 8: '....XX....XX....', 9: '....XX....XX....', 10: '....XX....XX....', 11: '##..XX....XX..##', 12: '##..XX....XX..##' }),
  chunk('spiky', 2, ALL, 16, { 6: '....oo..........', 7: '...BBPB.........', 10: '.........s......' }),
  chunk('birds', 2, [0, 1, 3], 18, { 8: '......b.......b...' }),
  chunk('frogs', 2, [0, 2], 16, { 10: '....f......f....' }),
  chunk('spikes', 2, ALL, 16, { 7: '......oo........', 10: '.....^^^^.......' }),
  chunk('highroad', 2, ALL, 20, { 6: '....oooo.....oooo...', 7: '...======...======..', 10: '.....g.....g........' }),
  chunk('moving', 3, [1, 2, 3], 20, { 7: '......o.o.o.o.......', 8: '.....M..............', 11: '####............####', 12: '####............####' }, 2),
  chunk('lift', 3, [2, 3], 14, { 4: '.....ooo......', 10: '.....V........', 11: '###........###', 12: '###........###' }),
  chunk('stones', 3, ALL, 20, { 9: '.....o...o...o......', 10: '.....X...X...X......', 11: '###..............###', 12: '###..............###' }),
  chunk('spiky-pair', 3, ALL, 18, { 7: '.......ooo........', 8: '.......===........', 10: '....s.......s.....' }),
  chunk('sky-steps', 3, [3], 20, { 5: '..............oo....', 6: '.............===....', 8: '.........===........', 10: '.....===............', 11: '###..............###', 12: '###..............###' }, 2)
];

const START = chunk('start', 0, ALL, 14, { 10: '..S...........' });
const CHECK = chunk('check', 0, ALL, 10, { 10: '....K.....' });
const END = chunk('end', 0, ALL, 26, {
  6: '........XX................',
  7: '.......XXX................',
  8: '......XXXX................',
  9: '.....XXXXX................',
  10: '....XXXXXX.....F..........'
});

function difficulty(world, sub) {
  return Math.min(3, world + (sub >= 2 ? 1 : 0));
}

function build(index) {
  const world = Math.floor(index / PER_WORLD), sub = index % PER_WORLD;
  const r = rng(index * 7919 + 101);
  const d = difficulty(world, sub);
  const count = 7 + sub + world;
  const pool = CHUNKS.filter((c) => c.d <= d && c.worlds.includes(world));
  const parts = [START];
  let last = '';
  for (let i = 0; i < count; i++) {
    if (i === Math.floor(count / 2)) parts.push(CHECK);
    let total = 0;
    const weights = pool.map((c) => {
      const w = c.name === last ? 0 : c.weight * (c.d === d ? 3 : 1);
      total += w;
      return w;
    });
    let pick = r() * total, k = 0;
    while (pick > weights[k]) { pick -= weights[k]; k++; }
    parts.push(pool[k]);
    last = pool[k].name;
  }
  parts.push(END);
  const rows = [];
  for (let y = 0; y < H; y++) rows.push(parts.map((p) => p.grid[y]).join(''));
  if (world === 2) {
    // caves have a rock ceiling
    rows[0] = '#'.repeat(rows[0].length);
  }
  return {
    world, sub,
    name: (world + 1) + '-' + (sub + 1),
    time: 300,
    rows
  };
}

const levels = [];
for (let i = 0; i < WORLDS * PER_WORLD; i++) levels.push(build(i));

let js = '// Generated by tools/gen-levels.mjs. Do not edit by hand.\n';
js += 'var BC = window.BC || (window.BC = {});\nBC.LEVELS = ' + JSON.stringify(levels) + ';\n';
writeFileSync(new URL('../web/js/levels.js', import.meta.url), js);
console.log(levels.map((l) => l.name + ':' + l.rows[0].length).join(' '));
