// Cheese Chase graphics: all drawn in code into small canvases once, then reused.
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

  // Filled pixel ellipse; with `outline`, a 1px ring is drawn first.
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
  BC.blob = blob;

  // ------------------------------------------------------------------ Pip the mouse (14x14)
  var K = '#2a2026';
  var MICE = [
    { body: '#d6cec6', dark: '#a89e96', ear: '#f4a6b8' },   // Pip
    { body: '#b88458', dark: '#86583a', ear: '#f4a6b8' }    // Dot (player 2)
  ];
  // Side view, facing right; frame 0-3 (feet and tail move, frame 1 nibbles)
  function drawMouse(p, frame) {
    var c = canvas(14, 14), x = ctxOf(c);
    var M = MICE[p];
    var n = frame === 1 ? 1 : 0;
    // tail curling up behind
    var wig = [0, 1, 0, -1][frame % 4];
    px(x, '#e88aa0', 0, 9, 2, 1);
    px(x, '#e88aa0', 0, 8 + wig, 1, 1);
    px(x, '#e88aa0', 1, 6 + wig, 1, 2);
    // feet
    var f = frame % 2;
    px(x, '#e88aa0', 3 + f, 12, 2, 2);
    px(x, '#e88aa0', 8 - f, 12, 2, 2);
    // body, belly and head
    blob(x, 6, 9, 4.6, 3.3, M.body, K);
    px(x, '#f2ece6', 5, 10, 5, 2);
    blob(x, 10 + n, 8, 2.9, 2.5, M.body, K);
    px(x, '#f06080', 13, 8 + n, 1, 2);
    // ear
    blob(x, 8 + n, 4.4, 2.3, 2.3, M.body, K);
    blob(x, 8 + n, 4.6, 1.1, 1.2, M.ear);
    // eye and whiskers
    px(x, K, 11 + n, 7, 1, 2);
    px(x, '#ffffff', 11 + n, 7, 1, 1);
    px(x, '#ffffff', 12, 10, 2, 1);
    return c;
  }
  function flip(src) {
    var c = canvas(src.width, src.height), x = ctxOf(c);
    x.translate(src.width, 0);
    x.scale(-1, 1);
    x.drawImage(src, 0, 0);
    return c;
  }
  var mouseCache = {};
  // Faces right, or left when `left`
  BC.mouse = function (p, left, frame) {
    var k = p + '|' + (left ? 'L' : 'R') + '|' + frame;
    if (!mouseCache[k]) mouseCache[k] = left ? flip(BC.mouse(p, false, frame)) : drawMouse(p, frame);
    return mouseCache[k];
  };

  // ------------------------------------------------------------------ cats (front view, 14x14)
  BC.CATS = [
    { name: 'GINGER', fur: '#f07a2a', dark: '#b84c10', light: '#ffc890' },
    { name: 'ROSIE', fur: '#f28cc6', dark: '#c0508e', light: '#ffd8ec' },
    { name: 'SMOKY', fur: '#6f8fd0', dark: '#3f5c98', light: '#c8d8ff' },
    { name: 'SUNNY', fur: '#e8c440', dark: '#a8861c', light: '#fff0b0' }
  ];
  var SCARED = { fur: '#8e7ad8', dark: '#5a48a0', light: '#c8bcf4' };
  var FLASH = { fur: '#f4f4f4', dark: '#b8b8c8', light: '#ffffff' };

  // look: 0 up, 1 right, 2 down, 3 left
  function drawCat(P, look, frame, scared) {
    var c = canvas(14, 14), x = ctxOf(c);
    // tail, swishing
    var tx = frame ? 12 : 11;
    px(x, K, tx, 5, 2, 8); px(x, P.dark, tx, 6, 1, 6);
    // body
    blob(x, 7, 10.5, 5, 3.4, P.fur, K);
    px(x, P.light, 5, 10, 4, 3);
    // paws
    px(x, P.light, frame ? 3 : 4, 13, 2, 1); px(x, P.light, frame ? 9 : 8, 13, 2, 1);
    // head and ears
    for (var e = 0; e < 2; e++) {
      var ex = e ? 9 : 2;
      px(x, K, ex, 0, 3, 1); px(x, K, ex - (e ? 0 : 0), 1, 3, 3);
      px(x, P.dark, ex + 1, 1, 1, 2);
    }
    blob(x, 7, 5.5, 5.3, 4, P.fur, K);
    px(x, P.dark, 6, 2, 2, 1);
    if (scared) {
      // worried face
      px(x, '#ffffff', 4, 4, 2, 2); px(x, '#ffffff', 8, 4, 2, 2);
      for (var w = 0; w < 6; w++) px(x, '#ffffff', 4 + w, 8 - (w % 2), 1, 1);
      return c;
    }
    var ox = [0, 1, 0, -1][look], oy = [-1, 0, 1, 0][look];
    px(x, '#ffffff', 3, 4, 3, 3); px(x, '#ffffff', 8, 4, 3, 3);
    px(x, '#1a3a1a', 4 + ox, 5 + oy, 1, 1); px(x, '#1a3a1a', 9 + ox, 5 + oy, 1, 1);
    px(x, '#f06080', 6, 7, 2, 1);
    px(x, K, 1, 7, 3, 1); px(x, K, 10, 7, 3, 1);
    return c;
  }
  function drawEyes(look) {
    var c = canvas(14, 14), x = ctxOf(c);
    var ox = [0, 1, 0, -1][look], oy = [-1, 0, 1, 0][look];
    blob(x, 4.5, 5.5, 1.8, 2.2, '#ffffff', K);
    blob(x, 9.5, 5.5, 1.8, 2.2, '#ffffff', K);
    px(x, '#2040c0', 4 + ox, 5 + oy, 1, 2); px(x, '#2040c0', 9 + ox, 5 + oy, 1, 2);
    px(x, '#d0d0e0', 1, 9, 3, 1); px(x, '#d0d0e0', 10, 9, 3, 1);
    return c;
  }
  var catCache = {};
  // state: '' normal, 'scared', 'flash', 'eyes'
  BC.cat = function (i, look, frame, state) {
    var k = i + '|' + look + '|' + frame + '|' + state;
    if (!catCache[k]) {
      if (state === 'eyes') catCache[k] = drawEyes(look);
      else catCache[k] = drawCat(state === 'scared' ? SCARED : state === 'flash' ? FLASH : BC.CATS[i], look, frame, !!state);
    }
    return catCache[k];
  };

  // ------------------------------------------------------------------ cheese
  BC.BIG_CHEESE = (function () {
    var c = canvas(10, 10), x = ctxOf(c);
    for (var r = 0; r < 8; r++) px(x, '#a8700c', 1, 1 + r, 2 + r, 1);
    for (var r2 = 0; r2 < 7; r2++) px(x, '#ffd23f', 1, 2 + r2, 1 + r2, 1);
    px(x, '#a8700c', 1, 9, 9, 1);
    px(x, '#ffe680', 1, 2, 1, 6);
    px(x, '#d89a18', 3, 6, 1, 1); px(x, '#d89a18', 5, 7, 2, 1); px(x, '#d89a18', 2, 4, 1, 1);
    return c;
  })();

  // ------------------------------------------------------------------ bonus snacks (12x12)
  function snack(fn) { var c = canvas(12, 12); fn(ctxOf(c)); return c; }
  BC.SNACKS = [
    { name: 'STRAWBERRY', pts: 100, img: snack(function (x) {
      blob(x, 6, 7, 4.3, 4.3, '#e8384f', K);
      for (var i = 0; i < 5; i++) px(x, '#ffe080', 3 + (i % 3) * 2 + (i > 2 ? 1 : 0), 5 + (i > 2 ? 3 : 0), 1, 1);
      px(x, '#3cb44b', 3, 1, 6, 2); px(x, '#3cb44b', 5, 0, 2, 1);
    }) },
    { name: 'CARROT', pts: 300, img: snack(function (x) {
      for (var r = 0; r < 8; r++) px(x, r % 3 ? '#f08020' : '#c85c10', 3 + (r >> 1), 3 + r, 6 - r, 1);
      px(x, '#3cb44b', 3, 0, 2, 3); px(x, '#3cb44b', 6, 0, 2, 3); px(x, '#2a8a38', 5, 1, 1, 2);
    }) },
    { name: 'APPLE', pts: 500, img: snack(function (x) {
      blob(x, 6, 7, 4.6, 4.3, '#50c040', K);
      px(x, '#a8f080', 3, 5, 2, 2); px(x, '#6a3410', 6, 0, 1, 3); px(x, '#3cb44b', 7, 1, 3, 1);
    }) },
    { name: 'GRAPES', pts: 700, img: snack(function (x) {
      var g = [[4, 4], [8, 4], [6, 6], [4, 8], [8, 8], [6, 10], [2, 6], [10, 6]];
      for (var i = 0; i < g.length; i++) blob(x, g[i][0], g[i][1], 1.6, 1.6, '#9050c8', K);
      px(x, '#3cb44b', 5, 0, 3, 2);
    }) },
    { name: 'CUPCAKE', pts: 1000, img: snack(function (x) {
      blob(x, 6, 4.5, 4.6, 3.2, '#ffb0d0', K);
      px(x, '#e8384f', 5, 0, 2, 2);
      for (var r = 0; r < 5; r++) px(x, r % 2 ? '#c0782c' : '#e09848', 2 + (r >> 2), 7 + r, 8 - (r >> 2) * 2, 1);
      px(x, '#ffffff', 3, 3, 1, 1); px(x, '#80d0ff', 7, 4, 1, 1);
    }) },
    { name: 'MELON', pts: 2000, img: snack(function (x) {
      for (var r = 0; r < 6; r++) px(x, '#3cb44b', 6 - r - 1, 5 + r, (r + 1) * 2, 1);
      for (var r2 = 0; r2 < 5; r2++) px(x, '#ff5a6a', 6 - r2 - 1 + 1, 4 + r2, r2 * 2 + 1 > 0 ? (r2 + 1) * 2 - 2 + 1 : 1, 1);
      px(x, '#ff5a6a', 1, 9, 10, 1); px(x, '#2a8a38', 0, 10, 12, 1);
      px(x, K, 4, 7, 1, 1); px(x, K, 7, 7, 1, 1); px(x, K, 6, 5, 1, 1);
    }) },
    { name: 'DONUT', pts: 3000, img: snack(function (x) {
      blob(x, 6, 6, 5, 5, '#d89048', K);
      blob(x, 6, 5.5, 4.4, 4, '#f070b0');
      blob(x, 6, 6, 1.6, 1.6, '#000000');
      x.clearRect(5, 5, 2, 2);
      px(x, '#ffffff', 3, 3, 1, 1); px(x, '#ffe060', 8, 4, 1, 1); px(x, '#80d0ff', 4, 8, 1, 1);
    }) },
    { name: 'GOLD STAR', pts: 5000, img: snack(function (x) {
      for (var r = 0; r < 12; r++) {
        var w = r < 4 ? 2 + r : r < 6 ? 12 : 10 - (r - 6);
        px(x, '#ffd23f', 6 - w / 2, r, w, 1);
      }
      px(x, '#a8700c', 4, 5, 1, 2); px(x, '#a8700c', 7, 5, 1, 2);
    }) }
  ];

  BC.ICON_LIFE = [BC.mouse(0, false, 0), BC.mouse(1, false, 0)];

  BC.SPARKLE = [2, 4, 6].map(function (n) {
    var c = canvas(16, 16), x = ctxOf(c);
    px(x, '#ffffff', 7, 8 - n, 2, n * 2); px(x, '#ffffff', 8 - n, 7, n * 2, 2);
    return c;
  });
})();
