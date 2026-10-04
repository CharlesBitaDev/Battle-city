// Input from every source (TV remote, phones, keyboard, touch) merged per player.
// Sources: 'rc' TV remote, 'ph1'/'ph2' phones, 'kb'/'kb2' keyboard, 'tc' on-screen touch.
var BC = window.BC || (window.BC = {});

BC.input = (function () {
  'use strict';
  var DIRS = ['up', 'right', 'down', 'left'];
  var held = {};
  var players = [mk(), mk()];
  var nav = [];

  function mk() {
    return { stack: [], fire: {}, fireEdge: false };
  }

  function press(src, p, btn, down) {
    var k = src + '|' + p + '|' + btn;
    if (!!held[k] === !!down) return;
    held[k] = !!down;
    var pl = players[p];
    if (btn === 'fire') {
      if (down) { pl.fire[src] = true; pl.fireEdge = true; }
      else delete pl.fire[src];
    } else {
      var d = DIRS.indexOf(btn);
      if (d < 0) return;
      for (var i = pl.stack.length - 1; i >= 0; i--) {
        if (pl.stack[i].d === d && pl.stack[i].s === src) pl.stack.splice(i, 1);
      }
      if (down) pl.stack.push({ d: d, s: src });
    }
    if (down) nav.push({ p: p, b: btn === 'fire' ? 'ok' : btn, s: src });
  }

  // Releases everything a source is holding (e.g. a phone disconnected).
  function releaseSource(src) {
    for (var k in held) {
      if (!held[k]) continue;
      var parts = k.split('|');
      if (parts[0] === src) press(src, +parts[1], parts[2], false);
    }
  }

  return {
    DIRS: DIRS,
    press: press,
    releaseSource: releaseSource,
    // Pushes a menu-only event ('back', 'ok', ...).
    nav: function (b, p, src) { nav.push({ p: p || 0, b: b, s: src || '' }); },
    takeNav: function () { var n = nav; nav = []; return n; },
    clearNav: function () { nav = []; },
    // Direction currently held by player p (0-3) or -1.
    dir: function (p) {
      var s = players[p].stack;
      return s.length ? s[s.length - 1].d : -1;
    },
    fireHeld: function (p) {
      for (var k in players[p].fire) return true;
      return false;
    },
    fireEdge: function (p) {
      var e = players[p].fireEdge;
      players[p].fireEdge = false;
      return e;
    },
    clearEdges: function () { players[0].fireEdge = false; players[1].fireEdge = false; }
  };
})();
