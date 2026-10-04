// Generates the 100 stages into web/js/levels.js.
// Each stage is a 26x26 grid of 8px cells:
//   . empty  # brick  @ steel  ~ water  % trees  - ice
// Run: node tools/gen-levels.mjs
import { writeFileSync } from 'node:fs';

const N = 26;     // cells per side
const T = 13;     // tiles per side (a tile = 2x2 cells)
const COUNT = 100;

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

// Tile grid: { t: char, m: mask } mask bits 1=TL 2=TR 4=BL 8=BR
function emptyTiles() {
  const g = [];
  for (let y = 0; y < T; y++) {
    const row = [];
    for (let x = 0; x < T; x++) row.push({ t: '.', m: 15 });
    g.push(row);
  }
  return g;
}

const HALVES = [3, 12, 5, 10]; // top, bottom, left, right

function makeStage(level, attempt) {
  const r = rng(level * 7919 + attempt * 104729 + 17);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const t = (level - 1) / (COUNT - 1); // 0..1 difficulty
  const g = emptyTiles();

  const steelP = 0.02 + 0.3 * t;
  const halfP = 0.25;
  function wallTile() {
    return r() < steelP ? '@' : '#';
  }
  function set(x, y, ch, mask) {
    if (x < 0 || y < 0 || x >= T || y >= T) return;
    g[y][x] = { t: ch, m: mask || 15 };
  }
  function wall(x, y) {
    set(x, y, wallTile(), r() < halfP ? pick(HALVES) : 15);
  }

  const styles = ['columns', 'rows', 'blocks', 'rooms', 'river', 'forest', 'diagonal', 'cross', 'checker', 'caves', 'fortress', 'ice'];
  let style;
  if (level === 1) style = 'columns';
  else if (level === 2) style = 'blocks';
  else if (level === 3) style = 'rows';
  else if (level <= 8) style = pick(['columns', 'rows', 'blocks', 'cross', 'checker', 'diagonal', 'forest']);
  else style = styles[(level * 5 + attempt) % styles.length];

  const mirror = level < 6 || r() < 0.7;

  switch (style) {
    case 'columns': {
      for (let x = 1; x < T; x += 2) {
        const top = 1 + Math.floor(r() * 2);
        const len = 4 + Math.floor(r() * 5);
        for (let y = top; y < Math.min(top + len, 11); y++) wall(x, y);
        if (r() < 0.5) set(x, 5, '.');
      }
      break;
    }
    case 'rows': {
      for (let y = 2; y < 11; y += 2) {
        for (let x = 0; x < T; x++) if (r() < 0.7) wall(x, y);
        set(Math.floor(r() * T), y, '.');
        set(Math.floor(r() * T), y, '.');
      }
      break;
    }
    case 'blocks': {
      const n = 8 + Math.floor(t * 8);
      for (let i = 0; i < n; i++) {
        const x = Math.floor(r() * 12), y = 1 + Math.floor(r() * 9);
        wall(x, y); wall(x + 1, y); wall(x, y + 1); wall(x + 1, y + 1);
      }
      break;
    }
    case 'rooms': {
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const w = 3 + Math.floor(r() * 3), h = 3 + Math.floor(r() * 3);
        const x0 = Math.floor(r() * (T - w)), y0 = 1 + Math.floor(r() * (9 - h));
        for (let x = x0; x < x0 + w; x++) { wall(x, y0); wall(x, y0 + h - 1); }
        for (let y = y0; y < y0 + h; y++) { wall(x0, y); wall(x0 + w - 1, y); }
        set(x0 + Math.floor(w / 2), y0 + h - 1, '.');
        set(x0 + Math.floor(w / 2), y0, '.');
      }
      break;
    }
    case 'river': {
      const y = 4 + Math.floor(r() * 4);
      for (let x = 0; x < T; x++) set(x, y, '~');
      const bridges = 2 + Math.floor(r() * 2);
      for (let i = 0; i < bridges; i++) set(Math.floor(r() * T), y, r() < 0.5 ? '#' : '.');
      set(Math.floor(r() * 6), y, '.');
      for (let x = 0; x < T; x++) {
        if (r() < 0.35) set(x, y - 1, '%');
        if (r() < 0.35) set(x, y + 1, '%');
        if (r() < 0.3) wall(x, y - 3);
        if (r() < 0.3 && y + 3 < 11) wall(x, y + 3);
      }
      break;
    }
    case 'forest': {
      const n = 4 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const cx = Math.floor(r() * T), cy = 1 + Math.floor(r() * 9);
        for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) if (r() < 0.8) set(x, y, '%');
      }
      for (let i = 0; i < 12; i++) wall(Math.floor(r() * T), 1 + Math.floor(r() * 9));
      break;
    }
    case 'diagonal': {
      const n = 3 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const x0 = Math.floor(r() * 6), y0 = 1 + Math.floor(r() * 4);
        const len = 4 + Math.floor(r() * 4);
        for (let k = 0; k < len; k++) { set(x0 + k, y0 + k, wallTile()); if (r() < 0.5) set(x0 + k + 1, y0 + k, wallTile()); }
      }
      break;
    }
    case 'cross': {
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const cx = 1 + Math.floor(r() * 11), cy = 2 + Math.floor(r() * 7);
        const a = 1 + Math.floor(r() * 2);
        for (let k = -a; k <= a; k++) { wall(cx + k, cy); wall(cx, cy + k); }
      }
      break;
    }
    case 'checker': {
      for (let y = 1; y < 11; y++) for (let x = 0; x < T; x++) {
        if ((x + y) % 2 === 0 && r() < 0.75) set(x, y, wallTile(), pick([1, 2, 4, 8, 15, 9, 6]));
      }
      break;
    }
    case 'caves': {
      let a = [];
      for (let y = 0; y < T; y++) { a.push([]); for (let x = 0; x < T; x++) a[y].push(r() < 0.42); }
      for (let it = 0; it < 3; it++) {
        const b = a.map((row) => row.slice());
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
          let c = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy, xx = x + dx;
            if (yy < 0 || xx < 0 || yy >= T || xx >= T) continue;
            if (a[yy][xx]) c++;
          }
          b[y][x] = c >= 5;
        }
        a = b;
      }
      for (let y = 1; y < 11; y++) for (let x = 0; x < T; x++) if (a[y][x]) wall(x, y);
      break;
    }
    case 'fortress': {
      const x0 = 2 + Math.floor(r() * 2), y0 = 2;
      const x1 = T - 1 - x0, y1 = 7 + Math.floor(r() * 2);
      for (let x = x0; x <= x1; x++) { set(x, y0, '@', pick([3, 12, 15])); set(x, y1, '@', pick([3, 12, 15])); }
      for (let y = y0; y <= y1; y++) { set(x0, y, '@', pick([5, 10, 15])); set(x1, y, '@', pick([5, 10, 15])); }
      set(6, y0, '#'); set(6, y1, '#'); set(x0, 5, '#'); set(x1, 5, '#');
      for (let i = 0; i < 6; i++) wall(x0 + 1 + Math.floor(r() * (x1 - x0 - 1)), y0 + 1 + Math.floor(r() * (y1 - y0 - 1)));
      for (let i = 0; i < 8; i++) wall(Math.floor(r() * T), 1 + Math.floor(r() * 10));
      break;
    }
    case 'ice': {
      for (let y = 2; y < 10; y++) for (let x = 0; x < T; x++) if (r() < 0.55) set(x, y, '-');
      for (let i = 0; i < 14; i++) wall(Math.floor(r() * T), 1 + Math.floor(r() * 10));
      break;
    }
  }

  // Extra features as levels get harder.
  if (style !== 'river' && level > 5 && r() < 0.25 + 0.3 * t) {
    const cx = Math.floor(r() * T), cy = 2 + Math.floor(r() * 7);
    const w = 1 + Math.floor(r() * 3);
    for (let x = cx; x < cx + w; x++) set(x, cy, '~');
  }
  if (style !== 'forest' && r() < 0.35) {
    for (let i = 0; i < 4; i++) set(Math.floor(r() * T), 1 + Math.floor(r() * 9), '%');
  }
  if (style !== 'ice' && level > 10 && r() < 0.2) {
    for (let i = 0; i < 6; i++) set(Math.floor(r() * T), 2 + Math.floor(r() * 8), '-');
  }

  if (mirror) {
    for (let y = 0; y < T; y++) for (let x = 0; x < 6; x++) {
      const s = g[y][x];
      let m = s.m;
      // swap left/right quarters
      m = ((m & 1) << 1) | ((m & 2) >> 1) | ((m & 4) << 1) | ((m & 8) >> 1);
      g[y][T - 1 - x] = { t: s.t, m };
    }
  }

  // Shield the base from a straight shot down the middle.
  let middle = 0;
  for (let y = 1; y <= 10; y++) if (g[y][6].t === '#' || g[y][6].t === '@') middle++;
  if (middle < 2) {
    set(6, 9, '#');
    if (level > 1 && g[5][6].t === '.') set(6, 5, '#', 12);
  }

  // Keep spawn points and the base area clear.
  for (const [x, y] of [[0, 0], [6, 0], [12, 0], [4, 12], [8, 12], [5, 11], [6, 11], [7, 11], [5, 12], [6, 12], [7, 12]]) set(x, y, '.');

  // Tiles -> cells
  const cells = [];
  for (let y = 0; y < N; y++) cells.push(new Array(N).fill('.'));
  for (let ty = 0; ty < T; ty++) for (let tx = 0; tx < T; tx++) {
    const s = g[ty][tx];
    if (s.t === '.') continue;
    const m = (s.t === '#' || s.t === '@') ? s.m : 15;
    if (m & 1) cells[ty * 2][tx * 2] = s.t;
    if (m & 2) cells[ty * 2][tx * 2 + 1] = s.t;
    if (m & 4) cells[ty * 2 + 1][tx * 2] = s.t;
    if (m & 8) cells[ty * 2 + 1][tx * 2 + 1] = s.t;
  }
  // Brick ring around the base (base itself is cells 12-13, 24-25).
  for (const [x, y] of [[11, 23], [12, 23], [13, 23], [14, 23], [11, 24], [11, 25], [14, 24], [14, 25]]) cells[y][x] = '#';

  return { cells, style };
}

// Can a 16x16 tank (top-left at cell x,y) stand here? Bricks can be shot, so they count as open.
function open(cells, x, y) {
  if (x < 0 || y < 0 || x > N - 2 || y > N - 2) return false;
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const c = cells[y + dy][x + dx];
    if (c === '@' || c === '~') return false;
    const cx = x + dx, cy = y + dy;
    if (cx >= 12 && cx <= 13 && cy >= 24) return false; // the eagle
  }
  return true;
}

function reach(cells, sx, sy) {
  const seen = new Set();
  const q = [[sx, sy]];
  seen.add(sx + ',' + sy);
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || !open(cells, nx, ny)) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
}

function valid(cells) {
  const from = reach(cells, 12, 0);
  for (const k of ['0,0', '24,0', '8,24', '16,24', '12,22']) if (!from.has(k)) return false;
  let solid = 0;
  for (const row of cells) for (const c of row) {
    if (c === '#' || c === '@') solid++;
    else if (c === '~' || c === '%') solid += 0.5;
    else if (c === '-') solid += 0.2;
  }
  const share = solid / (N * N);
  return share >= 0.1 && share <= 0.5;
}

function roster(level) {
  const r = rng(level * 31337 + 5);
  const t = (level - 1) / (COUNT - 1);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let armor = clamp(Math.round(-0.6 + 10 * t + r() * 2), 0, 10);
  let power = clamp(Math.round(0.5 + 5.5 * t + r() * 2), 0, 7);
  let fast = clamp(Math.round(1.5 + 4.5 * t + r() * 2), 0, 7);
  if (level === 1) { armor = 0; power = 0; fast = 2; }
  let basic = 20 - armor - power - fast;
  if (basic < 0) { armor += basic; basic = 0; }
  // Order: shuffle, then push armour towards the end.
  const list = [];
  for (let i = 0; i < basic; i++) list.push('b');
  for (let i = 0; i < fast; i++) list.push('f');
  for (let i = 0; i < power; i++) list.push('p');
  for (let i = 0; i < armor; i++) list.push('a');
  const keyed = list.map((c) => ({ c, k: r() + (c === 'a' ? 0.6 : c === 'p' ? 0.25 : 0) }));
  keyed.sort((a, b) => a.k - b.k);
  return keyed.map((o) => o.c).join('');
}

// Hand-made stages, drawn in 13x13 tiles (each tile = 2x2 cells).
// . empty  # brick  @ steel  ~ water  % trees  - ice
// u / n / [ / ] = top / bottom / left / right half of a brick tile
// Keep clear: enemy spawns (row 0, columns 0, 6, 12), player spawns (row 12, columns 4 and 8)
// and the base area (columns 5-7, rows 11-12).
const CUSTOM = {
  1: [
    '.............',
    '.##.#...#.##.',
    '.##.#.@.#.##.',
    '....n...n....',
    '%%....#....%%',
    '%%.##.#.##.%%',
    '...#.....#...',
    '~~...uuu...~~',
    '...#.....#...',
    '.#.#.###.#.#.',
    '.#.........#.',
    '..#.......#..',
    '..#.......#..'
  ]
};

function customStage(rows) {
  const HALF = { u: 3, n: 12, '[': 5, ']': 10 };
  const cells = [];
  for (let y = 0; y < N; y++) cells.push(new Array(N).fill('.'));
  rows.forEach((row, ty) => {
    for (let tx = 0; tx < T; tx++) {
      const ch = row.charAt(tx) || '.';
      if (ch === '.') continue;
      const mask = HALF[ch] || 15;
      const t = HALF[ch] ? '#' : ch;
      if (mask & 1) cells[ty * 2][tx * 2] = t;
      if (mask & 2) cells[ty * 2][tx * 2 + 1] = t;
      if (mask & 4) cells[ty * 2 + 1][tx * 2] = t;
      if (mask & 8) cells[ty * 2 + 1][tx * 2 + 1] = t;
    }
  });
  for (const [x, y] of [[11, 23], [12, 23], [13, 23], [14, 23], [11, 24], [11, 25], [14, 24], [14, 25]]) cells[y][x] = '#';
  return { cells, style: 'hand-made' };
}

const out = [];
const styles = {};
for (let level = 1; level <= COUNT; level++) {
  let stage = null;
  if (CUSTOM[level]) {
    stage = customStage(CUSTOM[level]);
    if (!valid(stage.cells)) throw new Error('Hand-made stage ' + level + ' blocks a spawn or the base, or is too full or empty');
  }
  for (let attempt = 0; attempt < 200 && !stage; attempt++) {
    const s = makeStage(level, attempt);
    if (valid(s.cells)) { stage = s; break; }
  }
  if (!stage) throw new Error('No valid layout for stage ' + level);
  styles[stage.style] = (styles[stage.style] || 0) + 1;
  out.push({ m: stage.cells.map((row) => row.join('')).join(''), o: roster(level) });
}

let js = '// Generated by tools/gen-levels.mjs. Do not edit by hand.\n';
js += '// m: 26x26 cells (. empty, # brick, @ steel, ~ water, % trees, - ice); o: enemy order (b basic, f fast, p power, a armour)\n';
js += 'var BC = window.BC || (window.BC = {});\nBC.LEVELS = [\n';
js += out.map((l) => '  {m:"' + l.m + '",o:"' + l.o + '"}').join(',\n');
js += '\n];\n';
writeFileSync(new URL('../web/js/levels.js', import.meta.url), js);
console.log('Wrote ' + out.length + ' stages', styles);
