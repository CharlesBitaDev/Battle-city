// All graphics are drawn in code into small canvases once, then reused.
var BC = window.BC || (window.BC = {});

(function () {
  'use strict';

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // Draws a picture given as rows of characters; ' ' and '.' are transparent.
  function fromMap(rows, colors, size) {
    var w = size || 16;
    var c = canvas(w, w);
    var x = c.getContext('2d');
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      for (var i = 0; i < row.length && i < w; i++) {
        var col = colors[row.charAt(i)];
        if (!col) continue;
        x.fillStyle = col;
        x.fillRect(i, r, 1, 1);
      }
    }
    return c;
  }

  var PAL = {
    p1: { d: '#7a5400', m: '#e0a000', l: '#f8e070' },
    p2: { d: '#00502a', m: '#00a050', l: '#98f070' },
    en: { d: '#404040', m: '#9c9c9c', l: '#f0f0f0' },
    red: { d: '#700c00', m: '#d03818', l: '#f8a080' },
    ag: { d: '#004020', m: '#30a050', l: '#b0f0b0' },
    ay: { d: '#6a4c00', m: '#c8a030', l: '#f8e8a0' }
  };
  BC.PAL = PAL;

  // Tank kinds: 'pl' player, 0 basic, 1 fast, 2 power, 3 armor. Drawn facing up.
  function drawTankUp(kind, pal, frame) {
    var c = canvas(16, 16);
    var x = c.getContext('2d');
    function r(col, a, b, w, h) { x.fillStyle = col; x.fillRect(a, b, w, h); }
    var tl, tr, tw, ty, th, bx, by, bw, bh, gy, gh, gw;
    if (kind === 1) { tl = 2; tr = 11; tw = 3; ty = 2; th = 14; bx = 5; by = 3; bw = 6; bh = 12; gy = 0; gh = 7; gw = 2; }
    else if (kind === 3) { tl = 0; tr = 12; tw = 4; ty = 1; th = 15; bx = 3; by = 3; bw = 10; bh = 12; gy = 1; gh = 6; gw = 2; }
    else if (kind === 2) { tl = 1; tr = 12; tw = 3; ty = 2; th = 14; bx = 3; by = 4; bw = 10; bh = 11; gy = 0; gh = 8; gw = 2; }
    else if (kind === 0) { tl = 1; tr = 12; tw = 3; ty = 3; th = 13; bx = 4; by = 5; bw = 8; bh = 10; gy = 1; gh = 7; gw = 2; }
    else { tl = 1; tr = 12; tw = 3; ty = 2; th = 14; bx = 4; by = 4; bw = 8; bh = 10; gy = 0; gh = 8; gw = 2; }

    // tracks
    [tl, tr].forEach(function (tx) {
      r(pal.m, tx, ty, tw, th);
      r(pal.l, tx, ty, 1, th);
      for (var y = ty; y < ty + th; y++) {
        if ((y + frame) % 3 === 0) r(pal.d, tx, y, tw, 1);
      }
    });
    // body
    r(pal.m, bx, by, bw, bh);
    r(pal.l, bx, by, bw, 1);
    r(pal.l, bx, by, 1, bh);
    r(pal.d, bx, by + bh - 1, bw, 1);
    r(pal.d, bx + bw - 1, by, 1, bh);
    if (kind === 3) {
      r(pal.d, bx + 1, by + 3, bw - 2, 1);
      r(pal.d, bx + 1, by + 7, bw - 2, 1);
    }
    // turret
    var cx = 8;
    var cy = by + (bh >> 1);
    r(pal.d, cx - 3, cy - 2, 6, 5);
    r(pal.l, cx - 2, cy - 2, 4, 4);
    r(pal.m, cx - 1, cy - 1, 3, 3);
    if (kind === 'pl') r(pal.d, cx - 1, cy, 2, 1);
    // gun
    r(pal.l, cx - 1, gy, gw - 1, gh);
    r(pal.m, cx - 1 + gw - 1, gy, 1, gh);
    if (kind === 2) r(pal.l, cx - 1, gy, gw, 2);
    return c;
  }

  function rotate(src, dir) {
    if (!dir) return src;
    var c = canvas(src.width, src.height);
    var x = c.getContext('2d');
    var h = src.width / 2;
    x.translate(h, h);
    x.rotate(dir * Math.PI / 2);
    x.drawImage(src, -h, -h);
    return c;
  }

  var tankCache = {};
  BC.tankSprite = function (kind, palName, dir, frame) {
    var key = kind + '|' + palName + '|' + dir + '|' + frame;
    var s = tankCache[key];
    if (!s) {
      var upKey = kind + '|' + palName + '|0|' + frame;
      var up = tankCache[upKey];
      if (!up) up = tankCache[upKey] = drawTankUp(kind, PAL[palName], frame);
      s = tankCache[key] = rotate(up, dir);
    }
    return s;
  };

  // ---- terrain cells (8x8) ----
  function brickCell() {
    var c = canvas(8, 8);
    var x = c.getContext('2d');
    x.fillStyle = '#4a1c08'; x.fillRect(0, 0, 8, 8);
    x.fillStyle = '#b5541f';
    x.fillRect(0, 0, 7, 3); x.fillRect(0, 4, 3, 3); x.fillRect(4, 4, 4, 3);
    x.fillStyle = '#e8834a';
    x.fillRect(0, 0, 7, 1); x.fillRect(0, 4, 3, 1); x.fillRect(4, 4, 4, 1);
    return c;
  }
  function steelCell() {
    var c = canvas(8, 8);
    var x = c.getContext('2d');
    x.fillStyle = '#747474'; x.fillRect(0, 0, 8, 8);
    x.fillStyle = '#bcbcbc'; x.fillRect(0, 0, 7, 7);
    x.fillStyle = '#fcfcfc'; x.fillRect(2, 2, 3, 3);
    x.fillStyle = '#747474'; x.fillRect(5, 2, 1, 4); x.fillRect(2, 5, 4, 1);
    return c;
  }
  function waterCell(f) {
    var c = canvas(8, 8);
    var x = c.getContext('2d');
    x.fillStyle = '#2848d8'; x.fillRect(0, 0, 8, 8);
    x.fillStyle = '#90b0f8';
    var o = f ? 4 : 0;
    x.fillRect((1 + o) % 8, 1, 2, 1); x.fillRect((0 + o) % 8, 2, 1, 1); x.fillRect((3 + o) % 8, 2, 1, 1);
    x.fillRect((5 + o) % 8, 5, 2, 1); x.fillRect((4 + o) % 8, 6, 1, 1); x.fillRect((7 + o) % 8, 6, 1, 1);
    return c;
  }
  function treeCell() {
    return fromMap([
      ' gGGg gG',
      'gGLLGgGL',
      'GLLGGgLL',
      'gGGgGGGg',
      ' gG gGLG',
      'gGLGgLLG',
      'GLLGGGGg',
      ' gGg gG '
    ], { g: '#005c00', G: '#2c9c00', L: '#88d818' }, 8);
  }
  function iceCell() {
    var c = canvas(8, 8);
    var x = c.getContext('2d');
    x.fillStyle = '#c8d0d8'; x.fillRect(0, 0, 8, 8);
    x.fillStyle = '#f8f8f8';
    for (var i = 0; i < 8; i++) x.fillRect(i, (i + 3) % 8, 1, 1);
    x.fillStyle = '#9ca4ac';
    for (var j = 0; j < 8; j++) x.fillRect(j, (j + 6) % 8, 1, 1);
    return c;
  }

  BC.CELLS = {
    brick: brickCell(),
    steel: steelCell(),
    water: [waterCell(0), waterCell(1)],
    trees: treeCell(),
    ice: iceCell()
  };

  // ---- base ----
  BC.EAGLE = fromMap([
    '',
    ' #           # ',
    ' ##   ##    ## ',
    ' ###  ###  ### ',
    ' #### #oo ###',
    '  ##########  ',
    '   ########   ',
    '    ######    ',
    '   ###  ###   ',
    '  ###    ###  ',
    '   # #### #   ',
    '    ######    ',
    '     ####     ',
    '    ##  ##    ',
    '   ###  ###   '
  ], { '#': '#a8a8a8', o: '#f8f8f8' });
  BC.EAGLE_DEAD = fromMap([
    '',
    '    #',
    '    #######',
    '    #########',
    '    #######',
    '    #####',
    '    #',
    '    #',
    '    #',
    '    #',
    '    #',
    '  #####',
    ' #######',
    '#########'
  ], { '#': '#c8c8c8' });

  // ---- power-ups (16x16) ----
  var PU_COL = { '#': '#a80020', o: '#fcfcfc' };
  BC.POWER = {
    helmet: fromMap([
      '', '',
      '     ######',
      '   ##oooooo##',
      '  #oooooooooo#',
      ' #oooooooooooo#',
      ' #oooooooooooo#',
      ' #oooooooooooo#',
      ' ##############',
      ' #oo########oo#',
      ' #oo#      #oo#',
      '  ##        ##'
    ], PU_COL),
    clock: fromMap([
      '',
      '     ######',
      '   ##oooooo##',
      '  #oooooooooo#',
      ' #oooooo#ooooo#',
      ' #oooooo#ooooo#',
      ' #oooooo#ooooo#',
      ' #oooooo####oo#',
      ' #oooooooooooo#',
      ' #oooooooooooo#',
      '  #oooooooooo#',
      '   ##oooooo##',
      '     ######'
    ], PU_COL),
    shovel: fromMap([
      '',
      '           ##',
      '          #oo#',
      '         #oo#',
      '        #oo#',
      '       #oo#',
      '  ##  #oo#',
      '  #o##oo#',
      '  #oooo#',
      '  #ooooo#',
      ' #ooooooo#',
      ' #oooooo#',
      '  #oooo#',
      '   ####'
    ], PU_COL),
    star: fromMap([
      '',
      '       ##',
      '      #oo#',
      '      #oo#',
      '     #oooo#',
      ' #####oooo#####',
      ' #oooooooooooo#',
      '  #oooooooooo#',
      '   #oooooooo#',
      '    #oooooo#',
      '   #ooo##ooo#',
      '   #oo#  #oo#',
      '  #o#      #o#',
      '  ##        ##'
    ], PU_COL),
    grenade: fromMap([
      '',
      '       ###',
      '      #o#',
      '     ####',
      '    #oooo#',
      '   #oooooo#',
      '  #oooooooo#',
      '  #o#o#o#oo#',
      '  #oooooooo#',
      '  #o#o#o#oo#',
      '  #oooooooo#',
      '   #oooooo#',
      '    ######'
    ], PU_COL),
    tank: fromMap([
      '',
      '       ##',
      '       ##',
      '  ###  ##  ###',
      '  #o#######o#',
      '  #o#oooooo#o#',
      '  ###oo##oo###',
      '  #o#o####o#o#',
      '  #o#o####o#o#',
      '  ###oo##oo###',
      '  #o#oooooo#o#',
      '  #o########o#',
      '  ###      ###'
    ], PU_COL)
  };

  BC.POWER.ship = fromMap([
    '',
    '       #',
    '       #o#',
    '       #oo#',
    '       #ooo#',
    '       #oooo#',
    '       #',
    ' ##############',
    ' #oooooooooooo#',
    '  #oooooooooo#',
    '   ##########',
    '',
    ' o  o  o  o  o',
    'o oo oo oo oo o'
  ], PU_COL);

  // Boat hull drawn under a tank that has the ship power-up (18x18, centred on the tank).
  BC.SHIP = (function () {
    var c = canvas(18, 18);
    var x = c.getContext('2d');
    x.fillStyle = '#f8f8f8';
    x.fillRect(2, 0, 14, 18); x.fillRect(0, 2, 18, 14); x.fillRect(1, 1, 16, 16);
    x.fillStyle = '#8c4a1c';
    x.fillRect(2, 1, 14, 16); x.fillRect(1, 2, 16, 14);
    x.fillStyle = '#5c2c0c';
    for (var yy = 3; yy < 16; yy += 3) x.fillRect(1, yy, 16, 1);
    return c;
  })();

  // ---- small icons ----
  BC.ICON_ENEMY = fromMap([
    '#  #  #',
    '# ### #',
    '#######',
    '#######',
    '# ### #',
    '#     #'
  ], { '#': '#000000' }, 8);
  BC.ICON_LIFE = {
    p1: fromMap(['#  #  #', '# ### #', '#######', '#######', '# ### #', '#     #'], { '#': PAL.p1.m }, 8),
    p2: fromMap(['#  #  #', '# ### #', '#######', '#######', '# ### #', '#     #'], { '#': PAL.p2.m }, 8)
  };
  BC.ICON_FLAG = fromMap([
    ' #',
    ' #######',
    ' #########',
    ' ########',
    ' ######',
    ' #',
    ' #',
    ' #',
    ' #',
    '####',
    '####'
  ], { '#': '#000000' }, 16);

  // ---- effects ----
  function blast(size, radius, seed) {
    var c = canvas(size, size);
    var x = c.getContext('2d');
    var h = size / 2;
    var s = seed;
    function rnd() { s = (s * 16807) % 2147483647; return (s % 1000) / 1000; }
    for (var py = 0; py < size; py++) {
      for (var px = 0; px < size; px++) {
        var dx = px + 0.5 - h, dy = py + 0.5 - h;
        var d = Math.sqrt(dx * dx + dy * dy) + rnd() * radius * 0.35;
        if (d > radius) continue;
        var t = d / radius;
        x.fillStyle = t < 0.3 ? '#fcfcfc' : t < 0.55 ? '#fce060' : t < 0.8 ? '#f87818' : '#b01800';
        x.fillRect(px, py, 1, 1);
      }
    }
    return c;
  }
  BC.BOOM_SMALL = [blast(16, 3, 7), blast(16, 5.5, 11), blast(16, 7.5, 13)];
  BC.BOOM_BIG = [blast(32, 11, 17), blast(32, 15, 19)];

  function sparkle(n) {
    var c = canvas(16, 16);
    var x = c.getContext('2d');
    x.fillStyle = '#fcfcfc';
    x.fillRect(8 - 1, 8 - n, 2, n * 2);
    x.fillRect(8 - n, 8 - 1, n * 2, 2);
    x.fillStyle = '#a8c8fc';
    var d = (n * 0.6) | 0;
    for (var i = 1; i <= d; i++) {
      x.fillRect(8 - 1 - i, 8 - 1 - i, 1, 1); x.fillRect(8 + i, 8 - 1 - i, 1, 1);
      x.fillRect(8 - 1 - i, 8 + i, 1, 1); x.fillRect(8 + i, 8 + i, 1, 1);
    }
    return c;
  }
  BC.SPAWN = [sparkle(2), sparkle(4), sparkle(6), sparkle(8)];

  function shield(f) {
    var c = canvas(16, 16);
    var x = c.getContext('2d');
    x.fillStyle = f ? '#fcfcfc' : '#80c0fc';
    for (var i = 0; i < 16; i++) {
      if ((i + f) % 2) continue;
      x.fillRect(i, 0, 1, 1); x.fillRect(i, 15, 1, 1);
      x.fillRect(0, i, 1, 1); x.fillRect(15, i, 1, 1);
    }
    x.fillRect(1 + f, 1, 2, 1); x.fillRect(13 - f, 14, 2, 1);
    x.fillRect(1, 13 - f, 1, 2); x.fillRect(14, 1 + f, 1, 2);
    return c;
  }
  BC.SHIELD = [shield(0), shield(1)];

  BC.canvas = canvas;
})();
