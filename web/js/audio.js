// Simple synthesised sound effects (no sound files needed).
var BC = window.BC || (window.BC = {});

BC.audio = (function () {
  'use strict';
  var ac = null;
  var master = null;
  var noiseBuf = null;
  var muted = false;

  function ensure() {
    if (!ac) {
      try {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        ac = new C();
        master = ac.createGain();
        master.gain.value = 0.22;
        master.connect(ac.destination);
        noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) {
        ac = null;
        return null;
      }
    }
    if (ac.state === 'suspended') {
      try { ac.resume(); } catch (e) { /* ignore */ }
    }
    return ac;
  }

  function tone(t, freq, dur, type, vol, slideTo) {
    var o = ac.createOscillator();
    var g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(t, dur, vol, freq) {
    var s = ac.createBufferSource();
    s.buffer = noiseBuf;
    var f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq || 2000, t);
    f.frequency.exponentialRampToValueAtTime(120, t + dur);
    var g = ac.createGain();
    g.gain.setValueAtTime(vol || 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  function melody(t, notes, len, type, vol) {
    for (var i = 0; i < notes.length; i++) {
      if (notes[i]) tone(t + i * len, notes[i], len * 0.95, type || 'square', vol || 0.18);
    }
  }

  var S = {
    shoot: function (t) { tone(t, 880, 0.07, 'square', 0.12, 440); },
    brick: function (t) { noise(t, 0.12, 0.35, 1800); },
    steel: function (t) { tone(t, 1400, 0.08, 'triangle', 0.25, 900); },
    hit: function (t) { tone(t, 600, 0.06, 'square', 0.15, 900); },
    boom: function (t) { noise(t, 0.45, 0.7, 1200); tone(t, 120, 0.35, 'sawtooth', 0.2, 40); },
    bigboom: function (t) { noise(t, 0.9, 0.9, 900); tone(t, 90, 0.8, 'sawtooth', 0.25, 30); },
    bonus: function (t) { melody(t, [660, 880, 660, 880], 0.06, 'square', 0.15); },
    pick: function (t) { melody(t, [523, 659, 784, 1047, 1319], 0.05, 'square', 0.16); },
    life: function (t) { melody(t, [784, 988, 1175, 1568, 1175, 1568], 0.07, 'square', 0.16); },
    move: function (t) { tone(t, 330, 0.04, 'square', 0.08); },
    select: function (t) { melody(t, [660, 990], 0.06, 'square', 0.15); },
    pause: function (t) { melody(t, [523, 392, 523, 392], 0.08, 'square', 0.14); },
    start: function (t) { melody(t, [392, 0, 392, 523, 659, 0, 587, 659, 784], 0.11, 'square', 0.16); },
    clear: function (t) { melody(t, [523, 659, 784, 1047, 0, 784, 1047], 0.1, 'square', 0.16); },
    over: function (t) { melody(t, [392, 370, 349, 330, 311, 294, 262], 0.16, 'triangle', 0.25); },
    tick: function (t) { tone(t, 1200, 0.03, 'square', 0.08); }
  };

  return {
    play: function (name) {
      if (muted) return;
      if (!ensure()) return;
      try { S[name](ac.currentTime + 0.01); } catch (e) { /* ignore */ }
    },
    unlock: function () { ensure(); },
    suspend: function () { if (ac) { try { ac.suspend(); } catch (e) { /* ignore */ } } },
    setMuted: function (m) { muted = !!m; },
    isMuted: function () { return muted; }
  };
})();
