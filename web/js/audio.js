// 8-bit sound effects in the style of the old NES console: pulse waves (12.5/25/50% duty),
// a triangle bass and the console's shift-register noise, with volume and pitch changing
// in 1/60-second steps. The tunes are original, not copies of the arcade game's music.
// In the TV app these are pre-recorded (tools/render-sounds.mjs) and played natively.
var BC = window.BC || (window.BC = {});

BC.audio = (function () {
  'use strict';
  var FR = 1 / 60;          // one console frame
  var VOL = 0.22;           // loudness of one voice at full volume (15)
  var ac = null;
  var master = null;
  var waves = {};
  var noiseLong = null, noiseShort = null;
  var muted = false;
  var last = {};
  var engine = null;
  var engineLevel = 0;
  // In the TV app, pre-recorded sounds are played natively (much lighter for the TV).
  var NATIVE = (window.Android && typeof window.Android.playSound === 'function') ? window.Android : null;

  // ------------------------------------------------------------------ set-up
  function ensure() {
    if (!ac) {
      try {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        ac = new C();
        build(ac);
      } catch (e) {
        ac = null;
        return null;
      }
    }
    if (ac.state === 'suspended') {
      try {
        var r = ac.resume();
        if (r && r.catch) r.catch(function () { /* ignore */ });
      } catch (e) { /* ignore */ }
    }
    return ac;
  }

  function pulseWave(c, duty) {
    var n = 48;
    var re = new Float32Array(n), im = new Float32Array(n);
    for (var k = 1; k < n; k++) {
      re[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI);
      im[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (k * Math.PI);
    }
    return c.createPeriodicWave(re, im);
  }

  // The console's noise: a 15-bit shift register; "short" mode gives a metallic buzz.
  function lfsrBuffer(c, short) {
    var len = short ? 93 * 64 : 32767;
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    var reg = 1;
    for (var i = 0; i < len; i++) {
      var bit = (reg ^ (reg >> (short ? 6 : 1))) & 1;
      reg = (reg >> 1) | (bit << 14);
      d[i] = (reg & 1) ? 0.8 : -0.8;
    }
    return buf;
  }

  function build(c) {
    var comp = c.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.ratio.value = 4;
    comp.connect(c.destination);
    master = c.createGain();
    master.gain.value = 0.9;
    master.connect(comp);
    waves = { p12: pulseWave(c, 0.125), p25: pulseWave(c, 0.25), p50: pulseWave(c, 0.5) };
    noiseLong = lfsrBuffer(c, false);
    noiseShort = lfsrBuffer(c, true);
  }

  // ------------------------------------------------------------------ voices
  function steps(param, t, list, scale) {
    for (var i = 0; i < list.length; i++) param.setValueAtTime(list[i] * (scale || 1), t + i * FR);
  }

  // A pulse or triangle voice: per-frame frequencies and volumes (0-15).
  function voice(type, t, freqs, vols) {
    var o = ac.createOscillator();
    if (type === 'tri') o.type = 'triangle';
    else o.setPeriodicWave(waves[type]);
    var g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    var f = [];
    for (var i = 0; i < vols.length; i++) f.push(freqs[Math.min(i, freqs.length - 1)]);
    steps(o.frequency, t, f);
    steps(g.gain, t, vols, VOL / 15);
    g.gain.setValueAtTime(0, t + vols.length * FR);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + vols.length * FR + 0.02);
  }

  // Noise voice: per-frame "pitch" (shift-register speed, 0-1) and volumes.
  function noise(t, rates, vols, short) {
    var s = ac.createBufferSource();
    s.buffer = short ? noiseShort : noiseLong;
    s.loop = true;
    var g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    var r = [];
    for (var i = 0; i < vols.length; i++) r.push(rates[Math.min(i, rates.length - 1)]);
    steps(s.playbackRate, t, r);
    steps(g.gain, t, vols, VOL / 15);
    g.gain.setValueAtTime(0, t + vols.length * FR);
    s.connect(g);
    g.connect(master);
    s.start(t);
    s.stop(t + vols.length * FR + 0.02);
  }

  function fall(from, frames, to) {
    var a = [];
    to = to || 0;
    for (var i = 0; i < frames; i++) a.push(Math.round(from + (to - from) * i / Math.max(1, frames - 1)));
    return a;
  }
  function sweep(f0, f1, frames) {
    var a = [];
    for (var i = 0; i < frames; i++) a.push(f0 * Math.pow(f1 / f0, i / Math.max(1, frames - 1)));
    return a;
  }

  var NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  function hz(name) {
    var m = /^([A-G]#?)(\d)$/.exec(name);
    return 440 * Math.pow(2, (NOTE[m[1]] + (+m[2] + 1) * 12 - 69) / 12);
  }

  // A tune: notes ('-' = rest), each `len` frames (or lens[i]), volume falling within each note.
  function tune(type, t, notes, len, vol, tail) {
    var at = t;
    for (var i = 0; i < notes.length; i++) {
      var l = typeof len === 'number' ? len : len[i];
      if (notes[i] !== '-') voice(type, at, [hz(notes[i])], fall(vol, l, tail === undefined ? Math.max(1, vol - 6) : tail));
      at += l * FR;
    }
  }

  // ------------------------------------------------------------------ the sounds
  var S = {
    shoot: function (t) {
      voice('p12', t, sweep(1600, 600, 6), [13, 12, 10, 7, 4, 2]);
      noise(t, [0.9, 0.7], [7, 3], true);
    },
    eshoot: function (t) { voice('p12', t, sweep(1100, 500, 5), [6, 5, 4, 2, 1]); },
    brick: function (t) { noise(t, [0.32, 0.28, 0.24, 0.2, 0.17, 0.15, 0.13, 0.12], [14, 12, 10, 8, 6, 4, 2, 1]); },
    steel: function (t) {
      voice('p25', t, [2093, 2093, 2093, 1568, 1568, 1568, 1568], [12, 10, 7, 11, 8, 5, 2]);
    },
    hit: function (t) {
      voice('p50', t, [392, 392, 330, 330, 262, 262], [13, 11, 9, 7, 4, 2]);
      noise(t, [0.45, 0.35, 0.3], [9, 6, 3]);
    },
    boom: function (t) {
      noise(t, sweep(0.45, 0.04, 30), fall(15, 30));
      voice('tri', t, sweep(130, 40, 12), fall(15, 12));
    },
    bigboom: function (t) {
      var v = fall(15, 54);
      for (var i = 0; i < 8; i++) v[i] = 15;
      noise(t, sweep(0.35, 0.025, 54), v);
      noise(t + 10 * FR, sweep(0.5, 0.06, 24), fall(12, 24), true);
      voice('tri', t, sweep(100, 30, 24), fall(15, 24));
    },
    bonus: function (t) {
      tune('p25', t, ['C6', 'E6', 'G6', 'C7', 'E7', 'G7', 'C6', 'E6', 'G6', 'C7', 'E7', 'G7'], 2, 9, 6);
    },
    pick: function (t) {
      var f = [];
      for (var i = 0; i < 18; i++) f.push(523 * Math.pow(1.065, i) * (i % 2 ? 1.01 : 1));
      voice('p50', t, f, fall(13, 18, 6));
      tune('p25', t + 18 * FR, ['C7', 'G7'], [4, 10], 11, 2);
    },
    life: function (t) {
      tune('p25', t, ['G5', 'C6', 'E6', 'G6', '-', 'E6', 'G6', 'C7'], [5, 5, 5, 8, 2, 5, 5, 22], 12);
      tune('tri', t, ['C4', 'C4', 'G3', 'G3', '-', 'C4', 'E4', 'C4'], [5, 5, 5, 8, 2, 5, 5, 22], 15, 15);
    },
    move: function (t) { voice('p12', t, [1760], [9, 5, 2]); },
    select: function (t) { tune('p25', t, ['E6', 'A6'], [3, 6], 11, 3); },
    pause: function (t) { tune('p50', t, ['G6', 'D6', 'G6', 'D6', 'G6'], 5, 10, 3); },
    start: function (t) {
      var L = 7;
      tune('p25', t, ['E5', 'G5', 'C6', 'E6', 'D6', 'C6', 'G5', 'A5', 'G5', 'C6', '-', 'C6', 'E6', 'G6', 'E6', 'G6'], L, 12);
      tune('tri', t, ['C3', 'C3', 'C3', 'C3', 'F3', 'F3', 'G3', 'G3', 'C3', 'C3', 'E3', 'E3', 'G3', 'G3', 'C4', 'C4'], L, 15, 15);
      for (var i = 0; i < 16; i += 2) noise(t + i * L * FR, [0.8, 0.5], [9, 4], true);
      voice('p25', t + 16 * L * FR, [hz('C7')], fall(12, 24, 2));
      voice('tri', t + 16 * L * FR, [hz('C3')], fall(15, 24, 15));
    },
    clear: function (t) {
      var lens = [6, 6, 6, 12, 4, 6, 26];
      tune('p25', t, ['C6', 'E6', 'G6', 'C7', '-', 'G6', 'C7'], lens, 12, 4);
      tune('p50', t, ['G5', 'C6', 'E6', 'G6', '-', 'E6', 'G6'], lens, 7, 2);
      tune('tri', t, ['C4', 'E4', 'G4', 'C5', '-', 'G3', 'C4'], lens, 15, 15);
    },
    over: function (t) {
      var lens = [10, 10, 10, 10, 10, 10, 10, 34];
      tune('p50', t, ['G5', 'F#5', 'F5', 'E5', 'D#5', 'D5', 'C#5', 'C5'], lens, 11, 5);
      tune('tri', t, ['G3', 'F#3', 'F3', 'E3', 'D#3', 'D3', 'C#3', 'C3'], lens, 15, 15);
    },
    tick: function (t) { voice('p12', t, [2349], [10, 6, 2]); }
  };

  // Minimum gap between repeats of the same sound, so a burst doesn't turn into noise.
  var GAP = { shoot: 0.03, eshoot: 0.08, brick: 0.04, steel: 0.04, hit: 0.04, boom: 0.06, bigboom: 0.1 };

  // ------------------------------------------------------------------ engine
  // A low buzzing pulse whose pitch rocks up and down 8 times a second, like the console's
  // tank engine (56 Hz +/- 5; whole cycles per second, so a one-second recording loops cleanly).
  // Built on any audio context (the recorder uses it to make the TV's engine loop).
  function engineGraph(c, out, wave) {
    var o = c.createOscillator();
    o.setPeriodicWave(wave);
    o.frequency.value = 56;
    var lfo = c.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 8;
    var depth = c.createGain();
    depth.gain.value = 5;
    lfo.connect(depth);
    depth.connect(o.frequency);
    var g = c.createGain();
    g.gain.value = 0;
    o.connect(g);
    g.connect(out);
    o.start();
    lfo.start();
    return { o: o, lfo: lfo, depth: depth, g: g };
  }

  return {
    play: function (name) {
      if (muted || !S[name]) return;
      var now = Date.now() / 1000;
      if (last[name] && now - last[name] < (GAP[name] || 0.02)) return;
      last[name] = now;
      if (NATIVE) {
        try { NATIVE.playSound(name, 1); } catch (e) { /* ignore */ }
        return;
      }
      if (!ensure()) return;
      try { S[name](ac.currentTime + 0.005); } catch (e) { /* ignore */ }
    },
    // 0 = off, 1 = idling, 2 = driving
    engine: function (level) {
      if (muted) level = 0;
      if (level === engineLevel) return;
      engineLevel = level;
      if (NATIVE) {
        try { NATIVE.engine(level); } catch (e) { /* ignore */ }
        return;
      }
      if (!ac) { if (!level) return; if (!ensure()) return; }
      try {
        if (!engine) { if (!level) return; engine = engineGraph(ac, master, waves.p50); }
        var t = ac.currentTime;
        var k = level === 2 ? 1.2 : 1;
        engine.g.gain.setValueAtTime(level ? (level === 2 ? 0.06 : 0.03) : 0, t);
        engine.o.frequency.setValueAtTime(56 * k, t);
        engine.lfo.frequency.setValueAtTime(8 * k, t);
        engine.depth.gain.setValueAtTime(5 * k, t);
      } catch (e) { /* ignore */ }
    },
    // For tools/render-sounds.mjs: records the engine loop on a given (offline) context.
    renderEngine: function (c) {
      var e = engineGraph(c, c.destination, pulseWave(c, 0.5));
      e.g.gain.value = 0.5;
    },
    unlock: function () { if (!NATIVE) ensure(); },
    suspend: function () {
      if (!ac) return;
      try {
        var r = ac.suspend();
        if (r && r.catch) r.catch(function () { /* ignore */ });
      } catch (e) { /* ignore */ }
    },
    setMuted: function (m) { muted = !!m; if (muted) BC.audio.engine(0); },
    isMuted: function () { return muted; }
  };
})();
