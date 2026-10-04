// Kiko's Quest graphics: all drawn in code into small canvases once, then reused.
var BC = window.BC || (window.BC = {});

(function () {
  'use strict';

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  BC.canvas = canvas;

  function ctxOf(c) { return c.getContext('2d'); }
  function px(x, col, a, b, w, h) { x.fillStyle = col; x.fillRect(a, b, w || 1, h || 1); }

  // Filled pixel ellipse; with `outline`, a 1px darker ring is drawn first.
  function blob(x, cx, cy, rx, ry, col, outline) {
    var y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
    var x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1);
    for (var pass = outline ? 0 : 1; pass < 2; pass++) {
      var gx = pass === 0 ? rx + 1 : rx, gy = pass === 0 ? ry + 1 : ry;
      x.fillStyle = pass === 0 ? outline : col;
      for (var yy = y0; yy <= y1; yy++) {
        for (var xx = x0; xx <= x1; xx++) {
          var dx = (xx + 0.5 - cx) / gx, dy = (yy + 0.5 - cy) / gy;
          if (dx * dx + dy * dy <= 1) x.fillRect(xx, yy, 1, 1);
        }
      }
    }
  }

  function flip(src) {
    var c = canvas(src.width, src.height);
    var x = ctxOf(c);
    x.translate(src.width, 0);
    x.scale(-1, 1);
    x.drawImage(src, 0, 0);
    return c;
  }

  // ------------------------------------------------------------------ Kiko
  var K = '#2a1606';
  var FORMS = {
    small: { body: '#f39a2b', belly: '#ffd9a0', scarf: '#2ec4b6', boot: '#6a3410' },
    big: { body: '#f39a2b', belly: '#ffd9a0', scarf: '#2ec4b6', boot: '#6a3410' },
    fire: { body: '#ffd23f', belly: '#fff3c4', scarf: '#e8503c', boot: '#8a2c10' },
    // player 2 (Miko): a blue fox with an orange scarf
    small2: { body: '#5aa0f0', belly: '#d4ecff', scarf: '#f8a030', boot: '#20407a' },
    big2: { body: '#5aa0f0', belly: '#d4ecff', scarf: '#f8a030', boot: '#20407a' },
    fire2: { body: '#c8f0ff', belly: '#ffffff', scarf: '#e8503c', boot: '#8a2c10' }
  };

  // frame: stand, walk1, walk2, jump, die
  function drawKiko(form, frame, p2) {
    var big = form !== 'small';
    var h = big ? 24 : 16;
    var c = canvas(16, h);
    var x = ctxOf(c);
    var P = FORMS[form + (p2 ? '2' : '')];
    var cy = big ? 13.5 : 9.5, ry = big ? 8 : 5.3;
    var top = cy - ry;
    // tail (behind, on the left)
    blob(x, 2.5, cy + 1, 2, 3, P.body, K);
    px(x, '#ffffff', 1, Math.round(cy - 2), 2, 2);
    // ears
    for (var e = 0; e < 2; e++) {
      var ex = e ? 10 : 4;
      for (var r = 0; r < 4; r++) {
        px(x, K, ex - 1 + (r >> 1), Math.floor(top) - 3 + r, 4 - (r >> 1) * 2 + 1, 1);
      }
      px(x, P.body, ex, Math.floor(top) - 1, 2, 2);
      px(x, '#f06e8c', ex + 1, Math.floor(top), 1, 1);
    }
    // body
    blob(x, 8, cy, 5.5, ry, P.body, K);
    blob(x, 9.2, cy + ry * 0.35, 3, ry * 0.42, P.belly);
    // face (looking right)
    var ey = Math.round(top + (big ? 4 : 3));
    if (frame === 'die') {
      px(x, K, 10, ey, 1, 1); px(x, K, 12, ey, 1, 1); px(x, K, 11, ey + 1, 1, 1);
      px(x, K, 10, ey + 2, 1, 1); px(x, K, 12, ey + 2, 1, 1);
    } else {
      px(x, '#ffffff', 10, ey, 2, 3);
      px(x, '#101010', 11, ey + 1, 1, 2);
    }
    px(x, '#ffd9a0', 12, ey + 3, 2, 2);
    px(x, K, 14, ey + 3, 1, 1);
    // scarf with a tail that flaps
    var sy = Math.round(cy + (big ? 0 : 1.5));
    px(x, P.scarf, 3, sy, 10, 2);
    px(x, K, 3, sy + 2, 10, 1);
    var flap = frame === 'walk1' || frame === 'jump' ? 1 : 0;
    px(x, P.scarf, 1, sy + flap, 3, 2);
    // boots
    var fy = h - 2;
    var feet = { stand: [5, 10], walk1: [4, 11], walk2: [6, 9], jump: [3, 11], die: [5, 10] }[frame];
    px(x, P.boot, feet[0], fy, 3, 2);
    px(x, P.boot, feet[1], frame === 'jump' ? fy - 1 : fy, 3, 2);
    return c;
  }

  var kikoCache = {};
  BC.kiko = function (form, frame, left, p2) {
    var base = form + frame + (p2 ? '2' : '');
    var k = base + (left ? 'L' : 'R');
    if (!kikoCache[k]) {
      var right = kikoCache[base + 'R'] || (kikoCache[base + 'R'] = drawKiko(form, frame, p2));
      kikoCache[k] = left ? flip(right) : right;
    }
    return kikoCache[k];
  };

  // ------------------------------------------------------------------ enemies (16x16, facing right)
  function beetle(f, squashed) {
    var c = canvas(16, 16), x = ctxOf(c);
    if (squashed) {
      blob(x, 8, 13, 7, 2.5, '#7b4fbf', K);
      px(x, '#b38cf0', 5, 12, 5, 1);
      return c;
    }
    blob(x, 8, 8, 6.5, 5.5, '#7b4fbf', K);
    px(x, '#b38cf0', 4, 4, 4, 2);
    px(x, '#5a3390', 8, 3, 1, 9);
    px(x, '#ffffff', 11, 7, 3, 3);
    px(x, '#101010', 13, 8, 1, 2);
    var l = f ? [3, 7, 11] : [4, 8, 12];
    for (var i = 0; i < 3; i++) px(x, K, l[i], 13, 2, 3);
    return c;
  }
  function spiky(f) {
    var c = canvas(16, 16), x = ctxOf(c);
    for (var i = 0; i < 4; i++) {
      var sx = 2 + i * 3.5;
      px(x, '#5a5f68', Math.round(sx), 4, 3, 1);
      px(x, '#e8eef4', Math.round(sx) + 1, 1, 1, 3);
      px(x, '#5a5f68', Math.round(sx), 2, 1, 2); px(x, '#5a5f68', Math.round(sx) + 2, 2, 1, 2);
    }
    blob(x, 8, 10, 6.5, 4.5, '#d04a3a', K);
    px(x, '#f08070', 4, 7, 3, 1);
    px(x, '#ffffff', 11, 9, 2, 2);
    px(x, '#101010', 12, 10, 1, 1);
    px(x, K, f ? 3 : 4, 14, 3, 2);
    px(x, K, f ? 10 : 9, 14, 3, 2);
    return c;
  }
  function bird(f) {
    var c = canvas(16, 16), x = ctxOf(c);
    blob(x, 8, 9, 5.5, 3.8, '#4aa3f0', K);
    px(x, '#cfe8ff', 6, 10, 5, 2);
    px(x, '#f2a03d', 14, 8, 2, 2);
    px(x, '#ffffff', 10, 7, 2, 2);
    px(x, '#101010', 11, 7, 1, 1);
    if (f) { px(x, K, 4, 2, 5, 1); px(x, '#2f7fd0', 4, 3, 5, 4); }
    else { px(x, '#2f7fd0', 4, 10, 5, 4); px(x, K, 4, 14, 5, 1); }
    return c;
  }
  function frog(f) {
    var c = canvas(16, 16), x = ctxOf(c);
    var cy = f ? 9 : 11, ry = f ? 5 : 3.8;
    blob(x, 8, cy, 7, ry, '#4cbb5a', K);
    px(x, '#a8f0b0', 5, cy + 1, 6, 2);
    blob(x, 5, cy - ry, 2, 2, '#4cbb5a', K);
    blob(x, 11, cy - ry, 2, 2, '#4cbb5a', K);
    px(x, '#ffffff', 4, Math.round(cy - ry - 1), 2, 2);
    px(x, '#ffffff', 10, Math.round(cy - ry - 1), 2, 2);
    px(x, '#101010', 5, Math.round(cy - ry), 1, 1);
    px(x, '#101010', 11, Math.round(cy - ry), 1, 1);
    if (f) { px(x, '#2f8a3c', 1, 13, 3, 3); px(x, '#2f8a3c', 12, 13, 3, 3); }
    return c;
  }
  var EN = {
    beetle: [beetle(0), beetle(1)], squash: beetle(0, true),
    spiky: [spiky(0), spiky(1)], bird: [bird(0), bird(1)], frog: [frog(0), frog(1)]
  };
  var enCache = {};
  BC.enemy = function (kind, frame, left) {
    var k = kind + frame + (left ? 'L' : 'R');
    if (!enCache[k]) {
      var img = kind === 'squash' ? EN.squash : EN[kind][frame];
      enCache[k] = left ? flip(img) : img;
    }
    return enCache[k];
  };

  // ------------------------------------------------------------------ items
  function coin(w) {
    var c = canvas(16, 16), x = ctxOf(c);
    blob(x, 8, 8, Math.max(0.6, w), 6, '#f8c838', '#a8700c');
    if (w > 2) { px(x, '#fff3b0', 7, 4, 1, 4); px(x, '#d89a18', 9, 5, 1, 6); }
    return c;
  }
  BC.COIN = [coin(5), coin(3.2), coin(1), coin(3.2)];

  BC.ITEM = {
    berry: (function () {
      var c = canvas(16, 16), x = ctxOf(c);
      blob(x, 8, 9.5, 5.5, 5.5, '#e8384f', K);
      px(x, '#ff9aa8', 5, 6, 2, 2);
      px(x, '#3cb44b', 7, 1, 4, 2); px(x, '#3cb44b', 9, 3, 1, 1);
      return c;
    })(),
    seed: (function () {
      var c = canvas(16, 16), x = ctxOf(c);
      for (var i = 0; i < 6; i++) {
        var a = i * Math.PI / 3;
        blob(x, 8 + Math.cos(a) * 4.5, 8 + Math.sin(a) * 4.5, 2.2, 2.2, '#f8a030', K);
      }
      blob(x, 8, 8, 3.5, 3.5, '#ffe060', K);
      px(x, '#101010', 7, 7, 1, 1); px(x, '#101010', 9, 7, 1, 1);
      return c;
    })(),
    heart: (function () {
      var c = canvas(16, 16), x = ctxOf(c);
      blob(x, 5.5, 6.5, 3.5, 3.5, '#ff5c8a', K);
      blob(x, 10.5, 6.5, 3.5, 3.5, '#ff5c8a', K);
      for (var r = 0; r < 6; r++) px(x, '#ff5c8a', 2 + r, 8 + r, 12 - r * 2, 1);
      px(x, '#ffd0de', 4, 5, 2, 2);
      return c;
    })()
  };

  BC.FIREBALL = [0, 1].map(function (f) {
    var c = canvas(8, 8), x = ctxOf(c);
    blob(x, 4, 4, 3.2, 3.2, '#f87818', '#b01800');
    px(x, '#ffe060', f ? 2 : 3, f ? 3 : 2, 3, 3);
    return c;
  });

  // ------------------------------------------------------------------ tiles (16x16) per world
  var THEMES = [
    { name: 'grass', top: '#3cb44b', topD: '#2a8a38', body: '#b4733c', spot: '#8c5428', brick: '#c0602a', mortar: '#5a2408',
      sky: '#7ec8f0', far: '#8fd09a', near: '#59b86a', cloud: '#ffffff' },
    { name: 'desert', top: '#f2d27a', topD: '#d9b050', body: '#d9a85a', spot: '#b8863c', brick: '#c8803a', mortar: '#6a3a10',
      sky: '#f7c58a', far: '#f0c070', near: '#e0a050', cloud: '#fff1d6' },
    { name: 'cave', top: '#7a7f8c', topD: '#5c606c', body: '#4b4f5a', spot: '#383b44', brick: '#6a5ab0', mortar: '#2a2050',
      sky: '#1b1622', far: '#2b2433', near: '#3a3045', cloud: '#2b2433' },
    { name: 'night', top: '#e8eefc', topD: '#b8c4e8', body: '#8c98c8', spot: '#7280b4', brick: '#4a68c0', mortar: '#1c2a60',
      sky: '#1a1f45', far: '#2a3268', near: '#3a4480', cloud: '#3a4480' }
  ];
  BC.THEMES = THEMES;

  function groundTile(t, surface) {
    var c = canvas(16, 16), x = ctxOf(c);
    px(x, t.body, 0, 0, 16, 16);
    var s = [[2, 6], [9, 3], [12, 11], [5, 12], [13, 7]];
    for (var i = 0; i < s.length; i++) px(x, t.spot, s[i][0], s[i][1], 2, 2);
    if (surface) {
      px(x, t.top, 0, 0, 16, 5);
      px(x, t.topD, 0, 5, 16, 1);
      for (var j = 0; j < 16; j += 3) px(x, t.topD, j, 4 + (j % 2), 1, 2);
      px(x, '#ffffff', 2, 1, 3, 1);
      x.globalAlpha = 0.25; px(x, '#ffffff', 8, 1, 4, 1); x.globalAlpha = 1;
    }
    return c;
  }
  function brickTile(t) {
    var c = canvas(16, 16), x = ctxOf(c);
    px(x, t.mortar, 0, 0, 16, 16);
    for (var r = 0; r < 4; r++) {
      var off = (r % 2) ? 4 : 0;
      for (var b = -1; b < 2; b++) {
        var bx = b * 8 + off;
        px(x, t.brick, bx, r * 4, 7, 3);
        x.globalAlpha = 0.35; px(x, '#ffffff', bx, r * 4, 7, 1); x.globalAlpha = 1;
      }
    }
    return c;
  }
  function stoneTile() {
    var c = canvas(16, 16), x = ctxOf(c);
    px(x, '#5a5f68', 0, 0, 16, 16);
    px(x, '#9aa0aa', 0, 0, 15, 15);
    px(x, '#d0d4dc', 0, 0, 15, 2); px(x, '#d0d4dc', 0, 0, 2, 15);
    px(x, '#7a808a', 4, 4, 7, 7); px(x, '#b4b9c2', 4, 4, 6, 6);
    return c;
  }
  function giftTile(f, used) {
    var c = canvas(16, 16), x = ctxOf(c);
    if (used) {
      px(x, '#4a3420', 0, 0, 16, 16);
      px(x, '#8a6a4a', 1, 1, 14, 14);
      px(x, '#6a4e34', 3, 3, 2, 2); px(x, '#6a4e34', 11, 3, 2, 2); px(x, '#6a4e34', 3, 11, 2, 2); px(x, '#6a4e34', 11, 11, 2, 2);
      return c;
    }
    px(x, '#8a5a10', 0, 0, 16, 16);
    px(x, ['#f2b632', '#f8c850', '#e8a428'][f], 1, 1, 14, 14);
    px(x, '#fff0b0', 1, 1, 14, 1); px(x, '#fff0b0', 1, 1, 1, 14);
    px(x, '#ffffff', 7, 3, 2, 6); px(x, '#ffffff', 7, 11, 2, 2);
    px(x, '#8a5a10', 9, 4, 1, 5); px(x, '#8a5a10', 9, 12, 1, 1);
    return c;
  }
  function plankTile(t) {
    var c = canvas(16, 16), x = ctxOf(c);
    px(x, '#5a2c0c', 0, 0, 16, 6);
    px(x, '#a8682c', 0, 0, 16, 5);
    px(x, '#d89a50', 0, 0, 16, 1);
    px(x, '#5a2c0c', 7, 0, 1, 5);
    return c;
  }
  function spikeTile() {
    var c = canvas(16, 16), x = ctxOf(c);
    for (var i = 0; i < 2; i++) {
      for (var r = 0; r < 7; r++) {
        px(x, '#5a5f68', i * 8 + 3 - (r >> 1), 9 + r, 2 + (r >> 1) * 2, 1);
        px(x, '#e8eef4', i * 8 + 4 - (r >> 1) + (r > 1 ? 1 : 0), 9 + r, 1, 1);
      }
    }
    return c;
  }
  var tileCache = [];
  BC.tiles = function (world) {
    if (tileCache[world]) return tileCache[world];
    var t = THEMES[world];
    tileCache[world] = {
      ground: groundTile(t, false), surface: groundTile(t, true), brick: brickTile(t),
      stone: stoneTile(), gift: [giftTile(0), giftTile(1), giftTile(2)], used: giftTile(0, true),
      plank: plankTile(t), spikes: spikeTile()
    };
    return tileCache[world];
  };

  // ------------------------------------------------------------------ backgrounds (wide strips that repeat)
  var bgCache = [];
  BC.background = function (world) {
    if (bgCache[world]) return bgCache[world];
    var t = THEMES[world];
    var far = canvas(512, 216), near = canvas(512, 216);
    var a = ctxOf(far), b = ctxOf(near);
    var s = world * 97 + 13;
    function rnd() { s = (s * 16807) % 2147483647; return (s % 10000) / 10000; }
    if (t.name === 'cave') {
      for (var i = 0; i < 14; i++) {
        var x0 = Math.floor(rnd() * 512), w = 8 + Math.floor(rnd() * 20), hgt = 20 + Math.floor(rnd() * 60);
        for (var r = 0; r < hgt; r++) px(a, t.far, x0 + Math.floor(r * w / hgt / 2), r, Math.max(1, w - Math.floor(r * w / hgt)), 1);
        var x1 = Math.floor(rnd() * 512), h2 = 20 + Math.floor(rnd() * 50);
        for (var r2 = 0; r2 < h2; r2++) px(b, t.near, x1 + Math.floor(r2 / 3), 216 - r2, Math.max(1, 16 - Math.floor(r2 / 2)), 1);
      }
    } else {
      if (t.name === 'night') {
        for (var st = 0; st < 60; st++) px(a, rnd() < 0.3 ? '#fff6c0' : '#ffffff', Math.floor(rnd() * 512), Math.floor(rnd() * 120), 1, 1);
        blob(a, 400, 40, 12, 12, '#fff6d0');
        blob(a, 405, 36, 10, 10, t.sky);
      } else if (t.name === 'desert') {
        blob(a, 380, 50, 18, 18, '#fff1b0');
      }
      for (var c = 0; c < 6; c++) {
        var cx = Math.floor(rnd() * 512), cy = 20 + Math.floor(rnd() * 50);
        blob(a, cx, cy, 14, 5, t.cloud); blob(a, cx + 8, cy - 4, 9, 6, t.cloud); blob(a, cx - 9, cy - 1, 7, 4, t.cloud);
      }
      for (var h = 0; h < 5; h++) {
        var hx = h * 110 + Math.floor(rnd() * 40);
        blob(a, hx, 200, 60 + rnd() * 30, 70 + rnd() * 30, t.far);
        blob(a, hx + 512, 200, 60, 80, t.far);
      }
      for (var n = 0; n < 6; n++) {
        var nx = n * 90 + Math.floor(rnd() * 30);
        blob(b, nx, 214, 34 + rnd() * 20, 34 + rnd() * 24, t.near);
        if (nx < 60) blob(b, nx + 512, 214, 40, 40, t.near);
        if (t.name === 'desert') {
          var kx = nx + 30;
          px(b, '#3c8a48', kx, 150, 4, 50); px(b, '#3c8a48', kx - 6, 165, 6, 3); px(b, '#3c8a48', kx - 6, 158, 3, 8);
        }
      }
    }
    bgCache[world] = { far: far, near: near, sky: t.sky };
    return bgCache[world];
  };

  // ------------------------------------------------------------------ flags, effects
  BC.drawFlag = function (x, X, Y, h, color, reached) {
    px(x, '#5a5f68', X + 7, Y, 2, h);
    blob(x, X + 8, Y, 2.5, 2.5, '#f8c838', K);
    px(x, color, X + 9, Y + 3, reached ? 8 : 6, 6);
    px(x, '#ffffff', X + 10, Y + 5, 2, 2);
  };

  BC.SPARKLE = [2, 4, 6].map(function (n) {
    var c = canvas(16, 16), x = ctxOf(c);
    px(x, '#ffffff', 7, 8 - n, 2, n * 2); px(x, '#ffffff', 8 - n, 7, n * 2, 2);
    return c;
  });

  BC.DEBRIS = function (world) {
    var c = canvas(6, 6), x = ctxOf(c);
    px(x, THEMES[world].mortar, 0, 0, 6, 6);
    px(x, THEMES[world].brick, 0, 0, 5, 5);
    return c;
  };

  BC.ICON_LIFE = BC.kiko('small', 'stand', false);
  BC.ICON_LIFE2 = BC.kiko('small', 'stand', false, true);
})();
