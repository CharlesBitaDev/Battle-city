// Start-up, main loop, and the link to the TV app (window.Android) when present.
var BC = window.BC || (window.BC = {});

(function () {
  'use strict';
  var A = window.Android || null;   // Java bridge inside the TV app
  var touch = !A && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  // ------------------------------------------------------------------ platform
  var addrCache = '';
  var addrAt = -1e9;
  BC.phones = { 1: false, 2: false };
  BC.platform = {
    tv: !!A,
    address: function () {
      if (!A) return '';
      var now = Date.now();
      if (now - addrAt > 3000) {
        addrAt = now;
        try { addrCache = A.getAddress() || ''; } catch (e) { addrCache = ''; }
      }
      return addrCache;
    },
    load: function (k) {
      try { return A ? A.load(k) : window.localStorage.getItem(k); } catch (e) { return null; }
    },
    save: function (k, v) {
      try { if (A) A.save(k, v); else window.localStorage.setItem(k, v); } catch (e) { /* ignore */ }
    },
    exit: function () { if (A) A.exit(); },
    toPhone: function (slot, msg) {
      if (!A || !BC.phones[slot]) return;
      try { A.sendToPhone(slot, msg); } catch (e) { /* ignore */ }
    },
    broadcast: function (msg) { BC.platform.toPhone(1, msg); BC.platform.toPhone(2, msg); }
  };

  // ------------------------------------------------------------------ called by the TV app
  var BTN = ['up', 'down', 'left', 'right', 'fire'];
  // Some remotes send a key-up between repeats while a button is held, so a release
  // only counts if no new press of the same button follows within a short moment.
  var releaseTimers = {};
  BC.key = function (name, down) {
    if (name === 'back') { if (down) BC.input.nav('back', 0, 'rc'); return; }
    var btn = name === 'ok' ? 'fire' : name;
    if (releaseTimers[btn]) { clearTimeout(releaseTimers[btn]); releaseTimers[btn] = 0; }
    if (down) {
      BC.audio.unlock();
      BC.input.press('rc', 0, btn, true);
    } else {
      releaseTimers[btn] = setTimeout(function () {
        releaseTimers[btn] = 0;
        BC.input.press('rc', 0, btn, false);
      }, 40);
    }
  };
  BC.phoneState = function (slot, bits) {
    for (var i = 0; i < 5; i++) BC.input.press('ph' + slot, slot - 1, BTN[i], !!(bits & (1 << i)));
  };
  BC.phoneMenu = function (slot) { BC.input.nav('back', slot - 1, 'ph' + slot); };
  BC.phoneJoin = function (slot, on) {
    BC.phones[slot] = !!on;
    if (!on) BC.input.releaseSource('ph' + slot);
    else BC.platform.toPhone(slot, BC.game.scene() === 'play' ? 'mode:game' : 'mode:menu');
  };
  BC.onPause = function () { BC.game.pause(); BC.audio.suspend(); };
  BC.onResume = function () { BC.audio.unlock(); };

  // ------------------------------------------------------------------ QR codes
  var qrCache = {};
  BC.qrCanvas = function (text, scale) {
    var key = text + '|' + scale;
    if (qrCache[key]) return qrCache[key];
    if (typeof qrcode !== 'function') return null;
    var q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    var n = q.getModuleCount();
    var pad = 2;
    var c = BC.canvas((n + pad * 2) * scale, (n + pad * 2) * scale);
    var x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#000';
    for (var r = 0; r < n; r++) {
      for (var col = 0; col < n; col++) {
        if (q.isDark(r, col)) x.fillRect((col + pad) * scale, (r + pad) * scale, scale, scale);
      }
    }
    qrCache[key] = c;
    return c;
  };

  // ------------------------------------------------------------------ keyboard (computer browsers)
  var KEYS = {
    ArrowUp: ['kb', 0, 'up'], ArrowDown: ['kb', 0, 'down'], ArrowLeft: ['kb', 0, 'left'], ArrowRight: ['kb', 0, 'right'],
    ' ': ['kb', 0, 'fire'], Enter: ['kb', 0, 'fire'],
    w: ['kb2', 1, 'up'], s: ['kb2', 1, 'down'], a: ['kb2', 1, 'left'], d: ['kb2', 1, 'right'], f: ['kb2', 1, 'fire']
  };
  window.addEventListener('keydown', function (e) {
    var k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'Escape' || k === 'Backspace' || k === 'p') {
      e.preventDefault();
      if (!e.repeat) BC.input.nav('back', 0, 'kb');
      return;
    }
    var m = KEYS[k];
    if (!m) return;
    e.preventDefault();
    BC.audio.unlock();
    if (!e.repeat) BC.input.press(m[0], m[1], m[2], true);
  });
  window.addEventListener('keyup', function (e) {
    var k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
    var m = KEYS[k];
    if (m) BC.input.press(m[0], m[1], m[2], false);
  });
  window.addEventListener('blur', function () {
    BC.input.releaseSource('kb');
    BC.input.releaseSource('kb2');
    BC.input.releaseSource('tc');
  });

  // ------------------------------------------------------------------ on-screen buttons (phone browsers)
  function setupTouch() {
    var box = document.getElementById('touch');
    box.hidden = false;
    document.body.className += ' has-touch';
    var pad = document.getElementById('t-pad');
    var fireBtn = document.getElementById('t-fire');
    var menuBtn = document.getElementById('t-menu');
    var padId = null;
    var current = null;

    function setDir(d) {
      if (d === current) return;
      if (current) BC.input.press('tc', 0, current, false);
      current = d;
      if (d) BC.input.press('tc', 0, d, true);
      pad.setAttribute('data-dir', d || '');
    }
    function dirFrom(e) {
      var r = pad.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2);
      var dy = e.clientY - (r.top + r.height / 2);
      if (Math.abs(dx) < r.width * 0.1 && Math.abs(dy) < r.height * 0.1) return null;
      if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
      return dy > 0 ? 'down' : 'up';
    }
    pad.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      BC.audio.unlock();
      padId = e.pointerId;
      try { pad.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      setDir(dirFrom(e));
    });
    pad.addEventListener('pointermove', function (e) {
      if (e.pointerId === padId) setDir(dirFrom(e));
    });
    function padEnd(e) {
      if (e.pointerId !== padId) return;
      padId = null;
      setDir(null);
    }
    pad.addEventListener('pointerup', padEnd);
    pad.addEventListener('pointercancel', padEnd);

    fireBtn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      BC.audio.unlock();
      fireBtn.className = 'on';
      BC.input.press('tc', 0, 'fire', true);
    });
    function fireEnd() { fireBtn.className = ''; BC.input.press('tc', 0, 'fire', false); }
    fireBtn.addEventListener('pointerup', fireEnd);
    fireBtn.addEventListener('pointercancel', fireEnd);
    fireBtn.addEventListener('pointerleave', fireEnd);
    menuBtn.addEventListener('click', function () { BC.input.nav('back', 0, 'tc'); });
  }

  // ------------------------------------------------------------------ screen and loop
  var cv = document.getElementById('screen');
  var ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  function resize() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var portrait = touch && vh > vw;
    var availH = portrait ? vh * 0.55 : vh;
    var s = Math.min(vw / BC.game.W, availH / BC.game.H) * (A ? 0.96 : 1);
    if (s >= 2 && Math.floor(s) >= s * 0.9) s = Math.floor(s);
    cv.style.width = Math.floor(BC.game.W * s) + 'px';
    cv.style.height = Math.floor(BC.game.H * s) + 'px';
    document.body.setAttribute('data-portrait', portrait ? '1' : '0');
  }

  var last = 0;
  var acc = 0;
  var STEP = 1000 / 60;
  function frame(ts) {
    window.requestAnimationFrame(frame);
    if (!last) last = ts;
    var dt = ts - last;
    last = ts;
    if (dt > 250) dt = 250;
    acc += dt;
    var n = 0;
    while (acc >= STEP && n < 6) {
      BC.game.update();
      acc -= STEP;
      n++;
    }
    if (n === 6) acc = 0;
    BC.game.render(ctx);
  }

  window.addEventListener('resize', resize);
  if (touch) setupTouch();
  BC.game.init();
  resize();
  if (/[?&]debug=1/.test(location.search)) BC.game.debug.unlockAll();
  window.requestAnimationFrame(frame);
})();
