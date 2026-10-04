// Pre-records every sound effect from web/js/audio.js (8-bit, NES-style) into
// web/sounds/*.ogg, plus a seamless engine loop. The TV app plays these with Android's SoundPool, which is far lighter than
// synthesising sounds live in the WebView (the TV's CPU is weak).
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
// Loudest point of each recording (0-1); balances the effects against each other on the TV.
const PEAK = {
  shoot: 0.85, eshoot: 0.45, brick: 0.7, steel: 0.65, hit: 0.7, boom: 0.9, bigboom: 0.95,
  bonus: 0.6, pick: 0.6, life: 0.6, move: 0.45, select: 0.5, pause: 0.55,
  start: 0.7, clear: 0.7, over: 0.8, tick: 0.45
};
const LENGTH = {
  shoot: 0.6, eshoot: 0.6, brick: 0.8, steel: 0.9, hit: 0.9, boom: 1.6, bigboom: 2.2,
  bonus: 1.0, pick: 1.0, life: 1.4, move: 0.4, select: 0.6, pause: 1.2,
  start: 2.6, clear: 2.2, over: 3.0, tick: 0.4
};

const tmp = join(tmpdir(), 'bc-sounds');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
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

const b = await pw.chromium.launch();
const report = [];
for (const name of Object.keys(LENGTH)) {
  const p = await b.newPage();
  await p.addInitScript(([len, rate]) => {
    window.AudioContext = function () {
      const c = new OfflineAudioContext(2, Math.ceil(rate * len), rate);
      Object.defineProperty(c, 'state', { get: () => 'running' });
      window.__ctx = c;
      return c;
    };
  }, [LENGTH[name], RATE]);
  await p.goto('file://' + root + 'web/index.html');
  const data = await p.evaluate(async (n) => {
    BC.audio.setMuted(false);
    BC.audio.play(n);
    const buf = await window.__ctx.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    const out = new Array(L.length);
    for (let i = 0; i < L.length; i++) out[i] = (L[i] + R[i]) / 2;
    return out;
  }, name);
  await p.close();
  // trim the silent tail, then fade the last 20 ms
  let end = data.length;
  while (end > 1000 && Math.abs(data[end - 1]) < 0.002) end--;
  const s = data.slice(0, Math.min(data.length, end + 400));
  let peak = 0;
  for (const v of s) peak = Math.max(peak, Math.abs(v));
  const k = PEAK[name] / Math.max(peak, 0.001);
  for (let i = 0; i < s.length; i++) s[i] *= k;
  const fade = Math.min(s.length, Math.round(RATE * 0.02));
  for (let i = 0; i < fade; i++) s[s.length - 1 - i] *= i / fade;
  save(name, s);
  report.push(name + ' ' + (s.length / RATE).toFixed(2) + 's peak ' + PEAK[name]);
}

// Engine: exactly one second of the engine buzz. Its pitch flips 15 times a second and the
// tone completes a whole number of cycles, so the second loops seamlessly. The app speeds it
// up (higher pitch) while the tank drives.
{
  const p = await b.newPage();
  await p.goto('file://' + root + 'web/index.html');
  const data = await p.evaluate(async (rate) => {
    const ctx = new OfflineAudioContext(1, rate, rate);
    BC.audio.renderEngine(ctx);
    const buf = await ctx.startRendering();
    return Array.from(buf.getChannelData(0));
  }, RATE);
  await p.close();
  let peak = 0;
  for (const x of data) peak = Math.max(peak, Math.abs(x));
  save('engine', data.map((x) => x * (0.6 / peak)));
  report.push('engine loop 1.00s (normalised to 0.60)');
}

await b.close();
rmSync(tmp, { recursive: true, force: true });
console.log(report.join('\n'));
