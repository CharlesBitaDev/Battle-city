// 8-bit sound effects and music for Cheese Chase, made with the same voices as an old console:
// pulse waves, a triangle bass and shift-register noise, stepped every 1/60 s.
// All tunes are original. In the TV app the sounds and music are pre-recorded
// (tools/render-sounds.mjs) and played natively; browsers synthesise them live.
var BC = window.BC || (window.BC = {});

BC.audio = (function () {
  'use strict';
  var FR = 1 / 60;
  var VOL = 0.22;
  var ac = null, master = null;          // the live context
  var C = null, OUT = null, W = null;    // where voices are being built right now
  var liveWaves = null;
  var muted = false, musicOn = true;
  var last = {};
  var wantMusic = '', playingMusic = '', musicSrc = null, musicGain = null;
  var musicBuffers = {};
  var NATIVE = (window.Android && typeof window.Android.playSound === 'function') ? window.Android : null;

  function ensure() {
    if (!ac) {
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        ac = new Ctx();
        var comp = ac.createDynamicsCompressor();
        comp.threshold.value = -6;
        comp.ratio.value = 4;
        comp.connect(ac.destination);
        master = ac.createGain();
        master.gain.value = 0.9;
        master.connect(comp);
        liveWaves = makeWaves(ac);
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
  function lfsr(c, short) {
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
  function makeWaves(c) {
    return { p12: pulseWave(c, 0.125), p25: pulseWave(c, 0.25), p50: pulseWave(c, 0.5), nl: lfsr(c, false), ns: lfsr(c, true) };
  }
  function target(c, out, waves) { C = c; OUT = out; W = waves; }

  // ------------------------------------------------------------------ voices
  function steps(param, t, list, scale) {
    for (var i = 0; i < list.length; i++) param.setValueAtTime(list[i] * (scale || 1), t + i * FR);
  }
  function voice(type, t, freqs, vols, vol) {
    var o = C.createOscillator();
    if (type === 'tri') o.type = 'triangle';
    else o.setPeriodicWave(W[type]);
    var g = C.createGain();
    g.gain.setValueAtTime(0, t);
    var f = [];
    for (var i = 0; i < vols.length; i++) f.push(freqs[Math.min(i, freqs.length - 1)]);
    steps(o.frequency, t, f);
    steps(g.gain, t, vols, (vol || VOL) / 15);
    g.gain.setValueAtTime(0, t + vols.length * FR);
    o.connect(g);
    g.connect(OUT);
    o.start(t);
    o.stop(t + vols.length * FR + 0.02);
  }
  function noise(t, rates, vols, short, vol) {
    var s = C.createBufferSource();
    s.buffer = short ? W.ns : W.nl;
    s.loop = true;
    var g = C.createGain();
    g.gain.setValueAtTime(0, t);
    var r = [];
    for (var i = 0; i < vols.length; i++) r.push(rates[Math.min(i, rates.length - 1)]);
    steps(s.playbackRate, t, r);
    steps(g.gain, t, vols, (vol || VOL) / 15);
    g.gain.setValueAtTime(0, t + vols.length * FR);
    s.connect(g);
    g.connect(OUT);
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
  function tune(type, t, notes, len, vol, tail) {
    var at = t;
    for (var i = 0; i < notes.length; i++) {
      var l = typeof len === 'number' ? len : len[i];
      if (notes[i] !== '-') voice(type, at, [hz(notes[i])], fall(vol, l, tail === undefined ? Math.max(1, vol - 6) : tail));
      at += l * FR;
    }
  }

  // ------------------------------------------------------------------ sound effects
  var S = {
    nibble1: function (t) { voice('p25', t, [620, 820, 980], [7, 6, 3]); },
    nibble2: function (t) { voice('p25', t, [980, 820, 620], [7, 6, 3]); },
    cheese: function (t) { tune('p25', t, ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'], 2, 10, 5); },
    catch: function (t) {
      voice('p12', t, sweep(180, 1800, 18), fall(12, 18, 6));
      noise(t + 0.3, [0.5], [5, 3, 1], true);
    },
    snack: function (t) { tune('p50', t, ['A5', 'E6', 'A6'], [3, 3, 10], 11, 3); },
    die: function (t) {
      var f = [], v = [];
      for (var i = 0; i < 80; i++) {
        f.push(880 * Math.pow(0.25, i / 80) * (1 + 0.06 * Math.sin(i * 1.3)));
        v.push(Math.max(1, Math.round(11 - i / 10)));
      }
      voice('p50', t, f, v);
      tune('p25', t + 80 * FR, ['C5', 'G4', 'C4'], [5, 5, 14], 10, 2);
    },
    start: function (t) {
      var lens = [6, 6, 6, 6, 12, 6, 6, 6, 6, 12, 6, 6, 6, 6, 6, 6, 24];
      tune('p25', t, ['C5', 'E5', 'G5', 'E5', 'C6', 'D5', 'F5', 'A5', 'F5', 'D6', 'E5', 'G5', 'C6', 'B5', 'G5', 'D6', 'C6'], lens, 11, 4);
      tune('tri', t, ['C3', 'C3', 'G2', 'G2', 'C3', 'D3', 'D3', 'A2', 'A2', 'D3', 'G2', 'G2', 'E3', 'E3', 'G2', 'G2', 'C3'], lens, 15, 15);
    },
    clear: function (t) {
      var lens = [5, 5, 5, 5, 5, 5, 20];
      tune('p25', t, ['G5', 'C6', 'E6', 'G6', 'E6', 'G6', 'C7'], lens, 12, 5);
      tune('tri', t, ['C3', 'E3', 'G3', 'C4', 'G3', 'E3', 'C3'], lens, 15, 15);
    },
    life: function (t) { tune('p25', t, ['E6', 'G6', 'E7', 'C7', 'D7', 'G7'], [4, 4, 4, 4, 4, 14], 11, 4); },
    move: function (t) { voice('p12', t, [1760], [9, 5, 2]); },
    select: function (t) { tune('p25', t, ['E6', 'A6'], [3, 6], 11, 3); },
    pause: function (t) { tune('p50', t, ['E6', 'C6', 'E6', 'C6'], 5, 10, 3); },
    tick: function (t) { voice('p12', t, [2349], [8, 4]); },
    over: function (t) {
      var lens = [10, 10, 10, 10, 10, 10, 34];
      tune('p50', t, ['E5', 'D#5', 'D5', 'C#5', 'C5', 'B4', 'C5'], lens, 11, 5);
      tune('tri', t, ['E3', 'D#3', 'D3', 'C#3', 'C3', 'B2', 'C3'], lens, 15, 15);
    }
  };
  var GAP = { nibble1: 0.03, nibble2: 0.03, catch: 0.1 };

  // ------------------------------------------------------------------ music (original tunes)
  // One token per step: a note, '.' (rest) or '_' (hold the previous note).
  var MAZE_LEAD = 'C5 . E5 . G5 . E5 . A5 . G5 . E5 . C5 . D5 . F5 . A5 . F5 . G5 _ _ _ . . . . ' +
                  'C5 . E5 . G5 . C6 . B5 . G5 . E5 . G5 . F5 . D5 . B4 . D5 . C5 _ _ _ . . . .';
  var MAZE_BASS = 'C3 . G2 . C3 . G2 . F2 . C3 . F2 . C3 . D3 . A2 . D3 . A2 . G2 . D3 . G2 . D3 . ' +
                  'C3 . G2 . C3 . G2 . A2 . E3 . A2 . E3 . F2 . C3 . G2 . D3 . C3 . G2 . C3 . . .';
  var TRACKS = {
    title: {
      step: 8,
      lead: 'G4 . C5 . E5 . G5 _ E5 . C5 . D5 _ _ _ F4 . A4 . D5 . F5 _ D5 . B4 . C5 _ _ _ ' +
            'E5 . G5 . C6 _ B5 . A5 . G5 _ E5 . F5 . D5 . E5 . C5 _ _ _ . . . . . . . .',
      bass: 'C3 . G2 . C3 . G2 . C3 . G2 . G2 . D3 . D3 . A2 . D3 . A2 . G2 . D3 . C3 . G2 . ' +
            'A2 . E3 . A2 . E3 . F2 . C3 . F2 . C3 . G2 . D3 . G2 . D3 . C3 . G2 . C3 . . .'
    },
    maze: { step: 7, lead: MAZE_LEAD, bass: MAZE_BASS, leadVol: 6 },
    hurry: { step: 5, lead: MAZE_LEAD, bass: MAZE_BASS, leadVol: 7 },
    scared: { step: 4, lead: 'F5 A5 F5 A5 F5 A5 F5 A5 E5 G#5 E5 G#5 E5 G#5 E5 G#5', drums: false, leadVol: 6 },
    home: { step: 2, lead: 'C7 A6 F6 D6 C7 A6 F6 D6 C7 A6 F6 D6 C7 A6 F6 D6', drums: false, leadVol: 5 }
  };
  BC.MUSIC = ['title', 'maze', 'hurry', 'scared', 'home'];

  function playLine(type, tokens, step, vol, tail) {
    var i = 0;
    while (i < tokens.length) {
      var tok = tokens[i];
      var len = 1;
      while (i + len < tokens.length && tokens[i + len] === '_') len++;
      if (tok !== '.' && tok !== '_') {
        voice(type, i * step * FR, [hz(tok)], fall(vol, len * step, tail === undefined ? Math.max(1, vol - 5) : tail), VOL * 0.8);
      }
      i += len;
    }
  }

  function trackLength(name) {
    var t = TRACKS[name];
    return t.lead.split(' ').length * t.step * FR;
  }

  // Builds one loop of a track on context c (offline or live), starting at time 0.
  function buildTrack(c, out, name) {
    target(c, out, makeWaves(c));
    var t = TRACKS[name];
    var lead = t.lead.split(' ');
    playLine('p25', t.lead.split(' '), t.step, t.leadVol || 8);
    if (t.bass) playLine('tri', t.bass.split(' '), t.step, 13, 13);
    if (t.drums !== false) for (var i = 2; i < lead.length; i += 4) noise(i * t.step * FR, [0.85], [4, 2, 1], true, VOL * 0.8);
  }

  function renderTrack(name, done) {
    if (musicBuffers[name]) { done(musicBuffers[name]); return; }
    var rate = 22050;
    var Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Off) return;
    var oc = new Off(1, Math.ceil(trackLength(name) * rate), rate);
    buildTrack(oc, oc.destination, name);
    var finish = function (buf) { musicBuffers[name] = buf; done(buf); };
    var p = oc.startRendering();
    if (p && p.then) p.then(finish);
    else oc.oncomplete = function (e) { finish(e.renderedBuffer); };
  }

  function stopLiveMusic() {
    if (musicSrc) { try { musicSrc.stop(); } catch (e) { /* ignore */ } }
    musicSrc = null;
    playingMusic = '';
  }

  function applyMusic() {
    var name = (muted || !musicOn) ? '' : wantMusic;
    if (NATIVE) {
      try { NATIVE.music(name); } catch (e) { /* ignore */ }
      return;
    }
    if (name === playingMusic) return;
    stopLiveMusic();
    if (!name || !ensure()) return;
    playingMusic = name;
    renderTrack(name, function (buf) {
      if (playingMusic !== name || musicSrc) return;
      if (!musicGain) { musicGain = ac.createGain(); musicGain.gain.value = 0.7; musicGain.connect(master); }
      var s = ac.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.connect(musicGain);
      s.start();
      musicSrc = s;
    });
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
      target(ac, master, liveWaves);
      try { S[name](ac.currentTime + 0.005); } catch (e) { /* ignore */ }
    },
    music: function (name) { wantMusic = name || ''; applyMusic(); },
    setMusicOn: function (on) { musicOn = !!on; applyMusic(); },
    unlock: function () { if (!NATIVE) { ensure(); applyMusic(); } },
    suspend: function () {
      if (!ac) return;
      try {
        var r = ac.suspend();
        if (r && r.catch) r.catch(function () { /* ignore */ });
      } catch (e) { /* ignore */ }
    },
    setMuted: function (m) { muted = !!m; applyMusic(); },
    isMuted: function () { return muted; },
    // For tools/render-sounds.mjs
    names: function () { return Object.keys(S); },
    renderSound: function (c, name) { target(c, c.destination, makeWaves(c)); S[name](0.005); },
    renderMusic: function (c, name) { buildTrack(c, c.destination, name); },
    trackLength: trackLength
  };
})();
