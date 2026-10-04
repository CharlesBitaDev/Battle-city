// Sound effects, all synthesised with WebAudio (no sound files): layered noise, low
// thumps and metal partials, a small room echo, and a tank engine rumble while driving.
var BC = window.BC || (window.BC = {});

BC.audio = (function () {
  'use strict';
  var ac = null;
  var master = null;   // everything goes through here, then a compressor
  var verb = null;     // short "battlefield" echo
  var white = null, brown = null, shaper = null;
  var muted = false;
  var last = {};
  var engine = null;
  var engineLevel = 0;

  // ------------------------------------------------------------------ set-up
  function ensure() {
    if (!ac) {
      try {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        ac = new C();
        build();
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

  function build() {
    var comp = ac.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    comp.attack.value = 0.002;
    comp.release.value = 0.25;
    comp.connect(ac.destination);
    master = ac.createGain();
    master.gain.value = 0.9;
    master.connect(comp);

    verb = ac.createConvolver();
    verb.buffer = impulse(1.3, 2.8);
    var verbOut = ac.createGain();
    verbOut.gain.value = 0.5;
    verb.connect(verbOut);
    verbOut.connect(master);

    var n = ac.sampleRate;
    white = ac.createBuffer(1, n, n);
    var w = white.getChannelData(0);
    for (var i = 0; i < n; i++) w[i] = Math.random() * 2 - 1;
    brown = ac.createBuffer(1, n * 2, n);
    var b = brown.getChannelData(0);
    var v = 0;
    for (var j = 0; j < b.length; j++) {
      v = (v + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[j] = v * 3.5;
    }

    shaper = ac.createWaveShaper();
    var curve = new Float32Array(1024);
    for (var k = 0; k < 1024; k++) {
      var x = k / 512 - 1;
      curve[k] = (3 + 20) * x * 0.35 / (Math.PI + 20 * Math.abs(x));
    }
    shaper.curve = curve;
  }

  function impulse(seconds, decay) {
    var len = Math.floor(ac.sampleRate * seconds);
    var buf = ac.createBuffer(2, len, ac.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // ------------------------------------------------------------------ building blocks
  // Connects a sound's output to the mix, with an amount sent to the echo.
  function out(node, wet) {
    node.connect(master);
    if (wet) {
      var s = ac.createGain();
      s.gain.value = wet;
      node.connect(s);
      s.connect(verb);
    }
  }

  function amp(t, peak, attack, decay) {
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  function filter(type, freq, q) {
    var f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    return f;
  }

  function noise(buf, t, dur, chain, wet) {
    var s = ac.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    var node = s;
    for (var i = 0; i < chain.length; i++) { node.connect(chain[i]); node = chain[i]; }
    out(node, wet);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  function tone(type, t, f0, f1, slide, peak, attack, decay, wet, chain) {
    var o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + slide);
    var g = amp(t, peak, attack, decay);
    var node = o;
    if (chain) for (var i = 0; i < chain.length; i++) { node.connect(chain[i]); node = chain[i]; }
    node.connect(g);
    out(g, wet);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  // A struck metal plate: a few out-of-tune partials ringing down.
  function metal(t, base, vol, len, wet) {
    var parts = [1, 1.5, 2.03, 2.65, 3.7];
    for (var i = 0; i < parts.length; i++) {
      tone('sine', t, base * parts[i], 0, 0, vol / (i + 1.2), 0.001, len / (1 + i * 0.35), wet);
    }
    noise(white, t, 0.02, [filter('highpass', 3500), amp(t, vol * 0.8, 0.001, 0.015)], wet);
  }

  // Brass-like note: sawtooth softened by a closing filter.
  function brass(t, f, len, vol, wet) {
    var lp = filter('lowpass', 2200, 1);
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.linearRampToValueAtTime(2400, t + 0.04);
    lp.frequency.exponentialRampToValueAtTime(900, t + len);
    tone('sawtooth', t, f, 0, 0, vol, 0.015, len, wet, [lp]);
    tone('square', t, f / 2, 0, 0, vol * 0.25, 0.015, len, wet, [filter('lowpass', 800)]);
  }

  function snare(t, vol, wet) {
    noise(white, t, 0.12, [filter('bandpass', 2600, 0.7), amp(t, vol, 0.001, 0.1)], wet);
    tone('triangle', t, 220, 150, 0.05, vol * 0.6, 0.001, 0.06, wet);
  }

  function boom(t, size, vol) {
    vol = vol || 1;
    // deep thump
    tone('sine', t, 95 / size, 26, 0.55 * size, 1.0 * vol, 0.004, 0.75 * size, 0.3);
    // the blast: rumbling noise through a closing filter, roughened
    var lp = filter('lowpass', 2600, 0.5);
    lp.frequency.setValueAtTime(2600 / size, t);
    lp.frequency.exponentialRampToValueAtTime(110, t + 0.85 * size);
    var drive = ac.createWaveShaper();
    drive.curve = shaper.curve;
    noise(brown, t, 1.0 * size, [lp, drive, amp(t, 0.9 * vol, 0.004, 0.95 * size)], 0.5);
    noise(white, t, 0.25, [filter('lowpass', 5000), amp(t, 0.35, 0.001, 0.18)], 0.3);
    // flying debris
    var n = Math.round(6 * size);
    for (var i = 0; i < n; i++) {
      var tt = t + 0.05 + Math.random() * 0.5 * size;
      noise(white, tt, 0.03, [filter('bandpass', 1500 + Math.random() * 3000, 2), amp(tt, 0.12 + Math.random() * 0.1, 0.001, 0.025)], 0.4);
    }
  }

  function shot(t, vol, far) {
    noise(white, t, 0.12, [filter('bandpass', far ? 900 : 1700, 0.9), amp(t, 0.7 * vol, 0.001, 0.09)], far ? 0.35 : 0.18);
    tone('sine', t, 170, 45, 0.12, 0.9 * vol, 0.002, 0.14, 0.15);
    if (!far) tone('square', t, 1500, 250, 0.035, 0.12 * vol, 0.001, 0.035, 0, [filter('lowpass', 3000)]);
  }

  // ------------------------------------------------------------------ the sounds
  var S = {
    shoot: function (t) { shot(t, 1.4, false); },
    eshoot: function (t) { shot(t, 0.5, true); },
    brick: function (t) {
      tone('sine', t, 130, 60, 0.08, 0.45, 0.002, 0.1, 0.2);
      for (var i = 0; i < 5; i++) {
        var tt = t + i * 0.017 + Math.random() * 0.012;
        noise(white, tt, 0.07, [filter('lowpass', 2800 - i * 350), amp(tt, 0.45 * (1 - i * 0.15), 0.001, 0.05)], 0.25);
      }
    },
    steel: function (t) { metal(t, 1180, 0.32, 0.32, 0.35); },
    hit: function (t) {
      metal(t, 330, 0.4, 0.28, 0.3);
      tone('sine', t, 120, 70, 0.08, 0.5, 0.002, 0.1, 0.2);
    },
    boom: function (t) { boom(t, 1); },
    bigboom: function (t) { boom(t, 1.6, 0.75); boom(t + 0.15, 1.1, 0.6); },
    bonus: function (t) {
      var f = [880, 1109, 1319, 1760, 1319, 1760];
      for (var i = 0; i < f.length; i++) tone('triangle', t + i * 0.055, f[i], 0, 0, 0.22, 0.003, 0.12, 0.45);
    },
    pick: function (t) {
      var f = [523, 659, 784, 1047, 1319, 1568, 2093];
      for (var i = 0; i < f.length; i++) {
        tone('square', t + i * 0.042, f[i], 0, 0, 0.09, 0.002, 0.1, 0.35, [filter('lowpass', 4000)]);
        tone('sine', t + i * 0.042, f[i] * 2, 0, 0, 0.06, 0.002, 0.18, 0.4);
      }
    },
    life: function (t) {
      var f = [523, 659, 784, 1047, 0, 784, 1047];
      for (var i = 0; i < f.length; i++) if (f[i]) brass(t + i * 0.09, f[i], i === f.length - 1 ? 0.45 : 0.12, 0.2, 0.3);
    },
    move: function (t) { tone('square', t, 1900, 1200, 0.02, 0.22, 0.001, 0.025, 0, [filter('lowpass', 5000)]); },
    select: function (t) {
      tone('square', t, 880, 0, 0, 0.1, 0.002, 0.06, 0.2, [filter('lowpass', 4000)]);
      tone('square', t + 0.06, 1320, 0, 0, 0.1, 0.002, 0.12, 0.25, [filter('lowpass', 4000)]);
    },
    pause: function (t) {
      tone('sine', t, 1318, 0, 0, 0.25, 0.002, 0.35, 0.4);
      tone('sine', t + 0.12, 988, 0, 0, 0.25, 0.002, 0.5, 0.4);
    },
    start: function (t) {
      // drum roll, then a short bugle call
      for (var i = 0; i < 10; i++) snare(t + i * 0.055, 0.12 + i * 0.03, 0.25);
      snare(t + 0.6, 0.5, 0.35);
      var f = [392, 392, 523, 659, 0, 587, 659, 784];
      var d = [0.1, 0.1, 0.1, 0.2, 0.06, 0.1, 0.1, 0.45];
      var tt = t + 0.65;
      for (var j = 0; j < f.length; j++) {
        if (f[j]) brass(tt, f[j], d[j], 0.22, 0.3);
        tt += d[j] + 0.02;
      }
    },
    clear: function (t) {
      var f = [523, 523, 523, 659, 784, 0, 659, 784, 1047];
      var d = [0.08, 0.08, 0.08, 0.16, 0.25, 0.05, 0.12, 0.12, 0.6];
      var tt = t;
      for (var i = 0; i < f.length; i++) {
        if (f[i]) brass(tt, f[i], d[i], 0.22, 0.35);
        if (i === 0 || i === 4 || i === 8) snare(tt, 0.35, 0.3);
        tt += d[i] + 0.02;
      }
    },
    over: function (t) {
      var f = [392, 370, 349, 330, 311, 294, 262];
      for (var i = 0; i < f.length; i++) brass(t + i * 0.2, f[i], i === f.length - 1 ? 1.0 : 0.18, 0.22, 0.4);
      tone('sine', t + 1.2, 70, 30, 1.0, 0.7, 0.01, 1.2, 0.4);
    },
    tick: function (t) { metal(t, 2400, 0.3, 0.06, 0.1); }
  };

  // Minimum gap between repeats of the same sound, so a burst doesn't turn into noise.
  var GAP = { shoot: 0.03, eshoot: 0.08, brick: 0.04, steel: 0.04, hit: 0.04, boom: 0.06, bigboom: 0.1 };

  // ------------------------------------------------------------------ engine rumble
  function startEngine() {
    var g = ac.createGain();
    g.gain.value = 0;
    var lp = filter('lowpass', 200, 3);
    var o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 36;
    var o2 = ac.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 18.3;
    var o2g = ac.createGain();
    o2g.gain.value = 0.35;
    var src = ac.createBufferSource();
    src.buffer = brown;
    src.loop = true;
    var ng = ac.createGain();
    ng.gain.value = 0.5;
    // tread clatter: amplitude wobble
    var trem = ac.createGain();
    trem.gain.value = 0.7;
    var lfo = ac.createOscillator();
    lfo.frequency.value = 11;
    var lfoAmt = ac.createGain();
    lfoAmt.gain.value = 0.3;
    lfo.connect(lfoAmt);
    lfoAmt.connect(trem.gain);
    o.connect(lp);
    o2.connect(o2g);
    o2g.connect(lp);
    src.connect(ng);
    ng.connect(lp);
    lp.connect(trem);
    trem.connect(g);
    g.connect(master);
    o.start(); o2.start(); src.start(); lfo.start();
    engine = { g: g, lp: lp, o: o, o2: o2, lfo: lfo };
  }

  return {
    play: function (name) {
      if (muted || !S[name]) return;
      if (!ensure()) return;
      var t = ac.currentTime;
      if (last[name] && t - last[name] < (GAP[name] || 0.02)) return;
      last[name] = t;
      try { S[name](t + 0.005); } catch (e) { /* ignore */ }
    },
    // 0 = off, 1 = idling, 2 = driving
    engine: function (level) {
      if (muted) level = 0;
      if (level === engineLevel) return;
      engineLevel = level;
      if (!ac) { if (!level) return; if (!ensure()) return; }
      try {
        if (!engine) { if (!level) return; startEngine(); }
        var t = ac.currentTime;
        var drive = level === 2;
        engine.g.gain.setTargetAtTime(level ? (drive ? 0.075 : 0.025) : 0, t, 0.08);
        engine.o.frequency.setTargetAtTime(drive ? 52 : 36, t, 0.15);
        engine.o2.frequency.setTargetAtTime(drive ? 26.3 : 18.3, t, 0.15);
        engine.lp.frequency.setTargetAtTime(drive ? 420 : 200, t, 0.15);
        engine.lfo.frequency.setTargetAtTime(drive ? 16 : 9, t, 0.2);
      } catch (e) { /* ignore */ }
    },
    unlock: function () { ensure(); },
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
