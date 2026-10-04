// Pre-records every sound effect and music loop from web/js/audio.js (8-bit voices) into
// web/sounds/*.ogg. The TV app plays effects with Android's SoundPool and the music with
// MediaPlayer, which is far lighter than synthesising sound live in the WebView (the TV's CPU is weak).
// Needs Playwright (Chromium) and ffmpeg with libvorbis. Run: node tools/render-sounds.mjs
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch (e) { pw = createRequire('/opt/node-tools/')('playwright'); }

const root = new URL('..', import.meta.url).pathname;
const outDir = root + 'web/sounds/';
const RATE = 44100;
// Loudest point of each effect (0-1); balances them against each other on the TV.
const PEAK = { move: 0.4, tick: 0.35, select: 0.5, pause: 0.5, coin: 0.55, jump: 0.55, fire: 0.5 };
const DEFAULT_PEAK = 0.7;
const MUSIC_PEAK = 0.8;

const tmp = join(tmpdir(), 'kiko-sounds');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

function wav(samples) {
  const n = samples.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return b;
}

function save(name, samples) {
  const w = join(tmp, name + '.wav');
  writeFileSync(w, wav(samples));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', w, '-c:a', 'libvorbis', '-q:a', '4', outDir + name + '.ogg']);
}

function normalise(s, peakTo) {
  let peak = 0;
  for (const v of s) peak = Math.max(peak, Math.abs(v));
  const k = peakTo / Math.max(peak, 0.001);
  for (let i = 0; i < s.length; i++) s[i] *= k;
  return s;
}

const b = await pw.chromium.launch();
const p = await b.newPage();
await p.goto('file://' + root + 'web/index.html');
const names = await p.evaluate(() => BC.audio.names());
const report = [];

for (const name of names) {
  const data = await p.evaluate(async ([n, rate]) => {
    const c = new OfflineAudioContext(1, rate * 3, rate);
    BC.audio.renderSound(c, n);
    const buf = await c.startRendering();
    return Array.from(buf.getChannelData(0));
  }, [name, RATE]);
  // trim the silent tail, then fade the last 20 ms
  let end = data.length;
  while (end > 1000 && Math.abs(data[end - 1]) < 0.002) end--;
  const s = normalise(data.slice(0, Math.min(data.length, end + 400)), PEAK[name] || DEFAULT_PEAK);
  const fade = Math.min(s.length, Math.round(RATE * 0.02));
  for (let i = 0; i < fade; i++) s[s.length - 1 - i] *= i / fade;
  save(name, s);
  report.push(name + ' ' + (s.length / RATE).toFixed(2) + 's');
}

// Music: exactly one loop of each tune, so MediaPlayer can repeat it without a gap.
for (const name of await p.evaluate(() => BC.MUSIC)) {
  const data = await p.evaluate(async ([n, rate]) => {
    const len = Math.round(BC.audio.trackLength(n) * rate);
    const c = new OfflineAudioContext(1, len, rate);
    BC.audio.renderMusic(c, n);
    const buf = await c.startRendering();
    return Array.from(buf.getChannelData(0));
  }, [name, RATE]);
  save('music-' + name, normalise(data, MUSIC_PEAK));
  report.push('music-' + name + ' ' + (data.length / RATE).toFixed(2) + 's loop');
}

await b.close();
rmSync(tmp, { recursive: true, force: true });
console.log(report.join('\n'));
