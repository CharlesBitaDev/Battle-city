// Cheese Chase: rules, mazes and all screens.
var BC = window.BC || (window.BC = {});

(function () {
  'use strict';

  var W = 384, H = 216;           // logical screen (16:9)
  var T = 8, S = 27;              // the maze is 27x27 tiles of 8px...
  var MX = 84, MY = 0;            // ...drawn here, with panels left and right
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];   // up, right, down, left (as BC.input)
  var LEVELS = BC.LEVELS;
  var HOUSE_X = 13 * T + 4, HOUSE_Y = 13 * T + 4, OUT_Y = 10 * T + 4;   // cats' house and the tile above its door
  var SNACK_X = 13 * T + 4, SNACK_Y = 16 * T + 4;
  var CORNERS = [[24, -3], [2, -3], [26, 29], [0, 29]];   // where each cat heads when scattering
  var PALETTES = [
    { fill: '#38200e', edge: '#e0a050', crumb: '#ffe08a' },
    { fill: '#112e24', edge: '#5ad090', crumb: '#fff0b0' },
    { fill: '#2c1438', edge: '#c47af0', crumb: '#ffe08a' },
    { fill: '#102244', edge: '#64a4f4', crumb: '#fff0b0' },
    { fill: '#40141c', edge: '#f47a8a', crumb: '#ffe08a' },
    { fill: '#24242a', edge: '#c8c8d4', crumb: '#ffe08a' }
  ];
  var FLOOR = '#0e0a08';
  var SNACK_AT = [70, 170];
  var BONUS_LIVES = [10000, 50000];

  var scene = 'title';
  var sceneT = 0;
  var G = null;
  var menu = { sel: 0, level: 0 };
  var save = { best: 0, hi: 10000, muted: false, music: true };
  var curMusic = null;

  function sfx(n) { BC.audio.play(n); }
  function music(n) {
    if (n === curMusic) return;
    curMusic = n;
    BC.audio.music(n);
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pad(n, len) { var s = String(n); while (s.length < len) s = '0' + s; return s; }
  function rnd(n) { return Math.floor(Math.random() * n); }

  // ------------------------------------------------------------------ saving
  function loadSave() {
    var s = BC.platform.load('cheese-save');
    if (s) {
      try {
        var o = JSON.parse(s);
        save.best = clamp(o.best | 0, 0, LEVELS.length - 1);
        if (o.hi) save.hi = o.hi | 0;
        save.muted = !!o.muted;
        save.music = o.music !== false;
      } catch (e) { /* ignore */ }
    }
    menu.level = save.best;
    BC.audio.setMuted(save.muted);
    BC.audio.setMusicOn(save.music);
  }
  function writeSave() { BC.platform.save('cheese-save', JSON.stringify(save)); }

  function go(s) {
    scene = s;
    sceneT = 0;
    BC.input.clearNav();
    BC.platform.broadcast(s === 'play' ? 'mode:game' : 'mode:menu');
  }

  // ------------------------------------------------------------------ level settings
  function speeds(L) {
    return {
      mouse: Math.min(1.45, 1.15 + L * 0.02),
      cat: Math.min(1.42, 0.98 + L * 0.025),
      scared: 0.68,
      tunnel: 0.6,
      eyes: 2.6,
      fright: Math.max(90, 380 - L * 16),
      // scatter, chase, scatter, chase... (frames); the last chase never ends
      waves: L < 4 ? [420, 1200, 420, 1200, 300, 1200, 300] : [300, 1500, 300, 1500, 240, 1800, 120],
      limits: L === 0 ? [0, 0, 30, 60] : L === 1 ? [0, 0, 0, 40] : [0, 0, 0, 0],
      wait: L < 2 ? 240 : L < 8 ? 170 : 110
    };
  }

  // ------------------------------------------------------------------ starting
  function newGame(mode, level) {
    G = {
      mode: mode, level: level, lives: 3, score: 0, bonusIdx: 0, snackLog: [], first: true,
      players: [mkPlayer(0), mode === 2 ? mkPlayer(1) : null]
    };
    while (G.bonusIdx < BONUS_LIVES.length && BONUS_LIVES[G.bonusIdx] <= 0) G.bonusIdx++;
    buildLevel();
    go('play');
  }
  function mkPlayer(i) { return { i: i, present: false }; }
  function p2Wanted() { return !BC.platform.tv || BC.phones[2]; }

  function buildLevel() {
    var L = LEVELS[G.level];
    G.map = L.maze.map(function (r) { return r.split(''); });
    G.left = 0;
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) if (G.map[y][x] === '.' || G.map[y][x] === 'o') G.left++;
    G.total = G.left;
    G.eaten = 0;
    G.snack = null;
    G.pal = PALETTES[G.level % PALETTES.length];
    G.sp = speeds(G.level);
    G.pops = [];
    G.paused = false;
    drawMazeLayer();
    resetActors();
  }

  function resetActors() {
    var two = G.players[1] && (G.players[1].present || p2Wanted());
    G.players.forEach(function (P, i) {
      if (!P) return;
      if (i === 1 && !p2Wanted()) { P.present = false; return; }
      P.present = true;
      P.tx = two ? (i ? 14 : 12) : 13;
      P.ty = 19;
      P.p = 0;
      P.dir = i ? 1 : 3;
      P.want = P.dir;
      P.moving = true;
      P.anim = 0;
      P.left = P.dir === 3;
    });
    G.cats = [0, 1, 2, 3].map(function (i) {
      var c = { i: i, state: i ? 'house' : 'out', x: [HOUSE_X, HOUSE_X, HOUSE_X - 8, HOUSE_X + 8][i], y: HOUSE_Y, tx: 13, ty: 10, p: 0, dir: 3, scared: false, t: i * 7 };
      return c;
    });
    G.mode = 0;
    G.modeT = 0;
    G.fright = 0;
    G.chain = 0;
    G.releaseT = 0;
    G.lifeEaten = 0;
    G.state = 'ready';
    G.stateT = 0;
    G.readyLen = G.first ? 150 : 110;
    G.nibble = 0;
  }

  // ------------------------------------------------------------------ the maze
  function cell(tx, ty) {
    if (ty < 0 || ty >= S) return '#';
    if (tx < 0) tx += S;
    if (tx >= S) tx -= S;
    return G.map[ty][tx];
  }
  function wrapX(tx) { return tx < 0 ? tx + S : tx >= S ? tx - S : tx; }
  function open(tx, ty) { var c = cell(tx, ty); return c !== '#' && c !== '-' && c !== '='; }

  // Walls and crumbs drawn once into a layer; eaten crumbs are cleared from it.
  function drawMazeLayer(flash) {
    if (!G.layer) G.layer = BC.canvas(S * T, S * T);
    var x = G.layer.getContext('2d');
    var pal = G.pal;
    x.fillStyle = FLOOR;
    x.fillRect(0, 0, S * T, S * T);
    var wall = function (tx, ty) { return tx < 0 || tx >= S || ty < 0 || ty >= S ? cell(tx, ty) !== 'T' : G.map[ty][tx] === '#'; };
    for (var ty = 0; ty < S; ty++) {
      for (var tx = 0; tx < S; tx++) {
        var c = G.map[ty][tx];
        var X = tx * T, Y = ty * T;
        if (c === '#') {
          x.fillStyle = pal.fill;
          x.fillRect(X, Y, T, T);
          x.fillStyle = flash ? '#ffffff' : pal.edge;
          if (!wall(tx, ty - 1)) x.fillRect(X, Y, T, 1);
          if (!wall(tx, ty + 1)) x.fillRect(X, Y + T - 1, T, 1);
          if (!wall(tx - 1, ty)) x.fillRect(X, Y, 1, T);
          if (!wall(tx + 1, ty)) x.fillRect(X + T - 1, Y, 1, T);
          // little rounded corners where only a diagonal is open
          if (wall(tx, ty - 1) && wall(tx - 1, ty) && !wall(tx - 1, ty - 1)) x.fillRect(X, Y, 1, 1);
          if (wall(tx, ty - 1) && wall(tx + 1, ty) && !wall(tx + 1, ty - 1)) x.fillRect(X + T - 1, Y, 1, 1);
          if (wall(tx, ty + 1) && wall(tx - 1, ty) && !wall(tx - 1, ty + 1)) x.fillRect(X, Y + T - 1, 1, 1);
          if (wall(tx, ty + 1) && wall(tx + 1, ty) && !wall(tx + 1, ty + 1)) x.fillRect(X + T - 1, Y + T - 1, 1, 1);
        } else if (c === '-') {
          x.fillStyle = '#f4a6b8';
          x.fillRect(X, Y + 3, T, 2);
        } else if (c === '.') {
          x.fillStyle = pal.crumb;
          x.fillRect(X + 3, Y + 3, 2, 2);
        }
      }
    }
  }
  function clearCrumb(tx, ty) {
    var x = G.layer.getContext('2d');
    x.fillStyle = FLOOR;
    x.fillRect(tx * T + 2, ty * T + 2, 4, 4);
  }

  // ------------------------------------------------------------------ moving on the grid
  // Grid walkers keep the tile they last stood in the middle of (tx, ty), a direction,
  // and how far (p, 0-8 px) they have gone from it towards the next tile.
  function pos(e) {
    if (e.state === 'house' || e.state === 'leaving' || e.state === 'entering') return { x: e.x, y: e.y };
    return { x: e.tx * T + 4 + DX[e.dir] * e.p, y: e.ty * T + 4 + DY[e.dir] * e.p };
  }
  function tileOf(e) {
    if (e.state === 'house' || e.state === 'leaving' || e.state === 'entering') return { x: 13, y: 13 };
    var a = e.p >= 4 ? 1 : 0;
    return { x: wrapX(e.tx + DX[e.dir] * a), y: e.ty + DY[e.dir] * a };
  }

  function advance(e, dist, decide) {
    var guard = 0;
    while (dist > 0 && guard++ < 12) {
      if (!e.moving) { decide(e); if (!e.moving) return; }
      var need = T - e.p;
      if (dist < need) { e.p += dist; return; }
      dist -= need;
      e.tx = wrapX(e.tx + DX[e.dir]);
      e.ty += DY[e.dir];
      e.p = 0;
      if (e.onTile) e.onTile(e);
      decide(e);
      if (!e.moving || e.state === 'entering') return;
    }
  }

  function reverse(e) {
    var back = (e.dir + 2) % 4;
    if (e.p > 0) {
      e.tx = wrapX(e.tx + DX[e.dir]);
      e.ty += DY[e.dir];
      e.p = T - e.p;
    }
    e.dir = back;
  }

  // ------------------------------------------------------------------ the mice
  function alive(P) { return P && P.present; }
  function mice() { return G.players.filter(alive); }

  function decideMouse(P) {
    if (P.want >= 0 && open(P.tx + DX[P.want], P.ty + DY[P.want])) { P.dir = P.want; P.moving = true; }
    else P.moving = P.dir >= 0 && open(P.tx + DX[P.dir], P.ty + DY[P.dir]);
  }

  function updateMouse(P) {
    var d = BC.input.dir(P.i);
    if (d >= 0) P.want = d;
    if (P.moving && P.p > 0 && P.want === (P.dir + 2) % 4) reverse(P);
    var sp = G.sp.mouse * (G.fright ? 1.06 : 1);
    P.onTile = eatAt;
    advance(P, sp, decideMouse);
    if (P.moving) P.anim += 0.25;
    if (P.dir === 1) P.left = false;
    else if (P.dir === 3) P.left = true;
  }

  function eatAt(P) {
    var c = G.map[P.ty] && G.map[P.ty][P.tx];
    if (c !== '.' && c !== 'o') return;
    G.map[P.ty][P.tx] = ' ';
    clearCrumb(P.tx, P.ty);
    G.left--;
    G.eaten++;
    G.lifeEaten++;
    if (c === '.') {
      score(10);
      sfx(G.nibble ? 'nibble2' : 'nibble1');
      G.nibble = 1 - G.nibble;
    } else {
      score(50);
      sfx('cheese');
      scareCats();
    }
    if (SNACK_AT.indexOf(G.eaten) >= 0) G.snack = { t: 570, kind: Math.min(G.level, BC.SNACKS.length - 1) };
    if (G.left <= 0) { G.state = 'clear'; G.stateT = 0; }
  }

  function score(n) {
    G.score += n;
    if (G.score > save.hi) save.hi = G.score;
    if (G.bonusIdx < BONUS_LIVES.length && G.score >= BONUS_LIVES[G.bonusIdx]) {
      G.bonusIdx++;
      G.lives++;
      sfx('life');
    }
  }

  // ------------------------------------------------------------------ the cats
  function scareCats() {
    G.fright = G.sp.fright;
    G.chain = 0;
    G.cats.forEach(function (c) {
      if (c.state === 'eyes' || c.state === 'entering') return;
      c.scared = true;
      if (c.state === 'out') c.flip = true;
    });
  }

  function nearestMouse(c) {
    var best = null, bd = 1e9, t = tileOf(c);
    mice().forEach(function (P) {
      var m = tileOf(P), d = (m.x - t.x) * (m.x - t.x) + (m.y - t.y) * (m.y - t.y);
      if (d < bd) { bd = d; best = P; }
    });
    return best;
  }

  // Each cat hunts in its own way.
  function targetOf(c) {
    if (c.state === 'eyes') return { x: 13, y: 10 };
    var P = nearestMouse(c);
    if (!P || G.mode % 2 === 0) return { x: CORNERS[c.i][0], y: CORNERS[c.i][1] };
    var m = tileOf(P);
    if (c.i === 0) return m;                                   // Ginger: straight at the mouse
    if (c.i === 1) return { x: m.x + DX[P.dir] * 4, y: m.y + DY[P.dir] * 4 };   // Rosie: cuts it off ahead
    if (c.i === 2) {                                           // Smoky: works with Ginger to trap it
      var g = tileOf(G.cats[0]);
      var ax = m.x + DX[P.dir] * 2, ay = m.y + DY[P.dir] * 2;
      return { x: ax * 2 - g.x, y: ay * 2 - g.y };
    }
    var t = tileOf(c);                                         // Sunny: bold from afar, shy up close
    var d = (m.x - t.x) * (m.x - t.x) + (m.y - t.y) * (m.y - t.y);
    return d > 64 ? m : { x: CORNERS[3][0], y: CORNERS[3][1] };
  }

  function decideCat(c) {
    c.moving = true;
    if (c.state === 'eyes' && c.tx === 13 && c.ty === 10) {
      c.state = 'entering';
      c.x = HOUSE_X;
      c.y = OUT_Y;
      return;
    }
    var back = (c.dir + 2) % 4;
    var opts = [];
    var order = [0, 3, 2, 1];
    for (var k = 0; k < 4; k++) {
      var d = order[k];
      if (d !== back && open(c.tx + DX[d], c.ty + DY[d])) opts.push(d);
    }
    if (!opts.length) { c.dir = back; return; }
    if (c.scared && c.state === 'out') { c.dir = opts[rnd(opts.length)]; return; }
    var tg = targetOf(c), best = opts[0], bd = 1e9;
    for (var j = 0; j < opts.length; j++) {
      var nx = c.tx + DX[opts[j]], ny = c.ty + DY[opts[j]];
      var dd = (nx - tg.x) * (nx - tg.x) + (ny - tg.y) * (ny - tg.y);
      if (dd < bd) { bd = dd; best = opts[j]; }
    }
    c.dir = best;
  }

  function catSpeed(c) {
    var sp = G.sp;
    if (c.state === 'eyes') return sp.eyes;
    if (c.ty === 13 && (c.tx <= 2 || c.tx >= S - 3)) return sp.tunnel;
    if (c.scared) return sp.scared;
    if (c.i === 0 && G.left <= Math.max(10, G.total * 0.1)) return sp.cat * 1.1;
    return sp.cat;
  }

  function updateCat(c) {
    c.t++;
    if (c.state === 'house') {
      c.y = HOUSE_Y + Math.sin(c.t * 0.12) * 3;
      return;
    }
    if (c.state === 'leaving') {
      var v = c.scared ? 0.5 : 0.8;
      if (Math.abs(c.x - HOUSE_X) > v) c.x += c.x < HOUSE_X ? v : -v;
      else {
        c.x = HOUSE_X;
        c.y -= v;
        if (c.y <= OUT_Y) {
          c.state = 'out';
          c.tx = 13; c.ty = 10; c.p = 0; c.dir = rnd(2) ? 3 : 1;
          decideCat(c);
        }
      }
      return;
    }
    if (c.state === 'entering') {
      c.y += 1.5;
      if (c.y >= HOUSE_Y) { c.y = HOUSE_Y; c.state = 'leaving'; c.scared = false; }
      return;
    }
    if (c.flip) { c.flip = false; reverse(c); }
    c.onTile = null;
    advance(c, catSpeed(c), decideCat);
  }

  function releaseCats() {
    G.releaseT++;
    for (var i = 1; i < 4; i++) {
      var c = G.cats[i];
      if (c.state !== 'house') continue;
      if (G.releaseT >= 40 && (G.lifeEaten >= G.sp.limits[i] || G.releaseT >= G.sp.wait)) {
        c.state = 'leaving';
        G.releaseT = 0;
      }
      return;
    }
  }

  // ------------------------------------------------------------------ playing
  function updatePlay() {
    var navs = BC.input.takeNav();
    if (G.paused) { updatePause(navs); return; }
    for (var n = 0; n < navs.length; n++) {
      if (navs[n].b === 'back' && (G.state === 'run' || G.state === 'ready')) { pauseGame(); return; }
    }
    G.stateT++;
    G.pops.forEach(function (p) { p.t--; });
    G.pops = G.pops.filter(function (p) { return p.t > 0; });
    joinLeave();

    if (G.state === 'ready') {
      if (G.stateT === 1 && G.first) sfx('start');
      if (G.stateT >= G.readyLen) { G.state = 'run'; G.stateT = 0; G.first = false; BC.input.clearEdges(); }
    } else if (G.state === 'run') {
      runFrame();
    } else if (G.state === 'gulp') {
      if (G.stateT >= 40) { G.state = 'run'; G.stateT = 0; }
    } else if (G.state === 'caught') {
      if (G.stateT === 45) sfx('die');
      if (G.stateT >= 165) {
        if (G.lives <= 0) {
          writeSave();
          sfx('over');
          go('over');
        } else {
          G.lives--;
          resetActors();
        }
      }
    } else if (G.state === 'clear') {
      if (G.stateT === 40) sfx('clear');
      if (G.stateT >= 40 && G.stateT % 14 === 0) drawMazeLayer((G.stateT / 14) % 2 === 1);
      if (G.stateT >= 160) nextLevel();
    }
    updateMusic();
  }

  function runFrame() {
    // scatter / chase waves (they wait while the cats are scared)
    if (G.fright > 0) {
      G.fright--;
      if (!G.fright) G.cats.forEach(function (c) { c.scared = false; });
    } else if (G.mode < G.sp.waves.length && ++G.modeT >= G.sp.waves[G.mode]) {
      G.mode++;
      G.modeT = 0;
      G.cats.forEach(function (c) { if (c.state === 'out') c.flip = true; });
    }
    releaseCats();
    mice().forEach(updateMouse);
    if (G.state !== 'run') return;
    G.cats.forEach(updateCat);
    // snack
    if (G.snack && --G.snack.t <= 0) G.snack = null;
    mice().forEach(function (P) {
      var a = pos(P);
      if (G.snack && Math.abs(a.x - SNACK_X) < 6 && Math.abs(a.y - SNACK_Y) < 6) {
        var s = BC.SNACKS[G.snack.kind];
        score(s.pts);
        G.pops.push({ x: SNACK_X, y: SNACK_Y, text: String(s.pts), t: 90 });
        G.snackLog.push(G.snack.kind);
        if (G.snackLog.length > 6) G.snackLog.shift();
        G.snack = null;
        sfx('snack');
      }
      // cats
      for (var i = 0; i < G.cats.length; i++) {
        var c = G.cats[i];
        if (c.state !== 'out') continue;
        var b = pos(c);
        if (Math.abs(a.x - b.x) >= 6 || Math.abs(a.y - b.y) >= 6) continue;
        if (c.scared) {
          var pts = 200 * Math.pow(2, Math.min(G.chain, 3));
          G.chain++;
          score(pts);
          G.pops.push({ x: b.x, y: b.y, text: String(pts), t: 40 });
          c.scared = false;
          c.state = 'eyes';
          G.state = 'gulp';
          G.stateT = 0;
          sfx('catch');
          return;
        }
        G.state = 'caught';
        G.stateT = 0;
        G.victim = P.i;
        return;
      }
    });
  }

  // Player 2 drops in when their phone connects (2-player game) and leaves when it disconnects.
  function joinLeave() {
    var P2 = G.players[1];
    if (!P2 || !BC.platform.tv) return;
    if (BC.phones[2] && !P2.present && (G.state === 'run' || G.state === 'ready')) {
      var P1 = G.players[0];
      P2.present = true;
      P2.tx = P1.tx; P2.ty = P1.ty; P2.p = 0; P2.dir = (P1.dir + 2) % 4; P2.want = P2.dir; P2.moving = true; P2.anim = 0;
      P2.left = P2.dir === 3;
    } else if (!BC.phones[2] && P2.present && G.state === 'run') {
      P2.present = false;
    }
  }

  function updateMusic() {
    var want = '';
    if (!G.paused && (G.state === 'run' || G.state === 'gulp')) {
      var eyes = G.cats.some(function (c) { return c.state === 'eyes' || c.state === 'entering'; });
      want = eyes ? 'home' : G.fright ? 'scared' : G.left <= G.total * 0.25 ? 'hurry' : 'maze';
    }
    music(want);
  }

  function nextLevel() {
    if (G.level + 1 >= LEVELS.length) {
      save.best = LEVELS.length - 1;
      writeSave();
      sfx('life');
      go('win');
      return;
    }
    G.level++;
    save.best = Math.max(save.best, G.level);
    menu.level = G.level;
    writeSave();
    buildLevel();
  }

  var PAUSE_ITEMS = ['CONTINUE', 'RESTART LEVEL', 'QUIT TO TITLE'];
  function pauseGame() {
    G.paused = true;
    G.pauseSel = 0;
    music('');
    sfx('pause');
    BC.platform.broadcast('mode:menu');
  }
  function updatePause(navs) {
    for (var n = 0; n < navs.length; n++) {
      var b = navs[n].b;
      if (b === 'up') { G.pauseSel = (G.pauseSel + 2) % 3; sfx('move'); }
      else if (b === 'down') { G.pauseSel = (G.pauseSel + 1) % 3; sfx('move'); }
      else if (b === 'back' || (b === 'ok' && G.pauseSel === 0)) {
        G.paused = false;
        BC.platform.broadcast('mode:game');
        return;
      } else if (b === 'ok' && G.pauseSel === 1) {
        sfx('select');
        G.first = true;
        buildLevel();
        BC.platform.broadcast('mode:game');
        return;
      } else if (b === 'ok' && G.pauseSel === 2) {
        sfx('select');
        writeSave();
        G = null;
        go('title');
        return;
      }
    }
  }

  // ------------------------------------------------------------------ menus
  var TITLE_ITEMS = ['1 PLAYER', '2 PLAYERS', 'LEVEL', 'PHONE CONTROLLER', 'MUSIC', 'SOUND'];
  var M_LEVEL = 2, M_PHONE = 3, M_MUSIC = 4, M_SOUND = 5;

  function updateTitle() {
    music('title');
    var navs = BC.input.takeNav();
    for (var n = 0; n < navs.length; n++) {
      var b = navs[n].b;
      if (b === 'up') { menu.sel = (menu.sel + TITLE_ITEMS.length - 1) % TITLE_ITEMS.length; sfx('move'); }
      else if (b === 'down') { menu.sel = (menu.sel + 1) % TITLE_ITEMS.length; sfx('move'); }
      else if ((b === 'left' || b === 'right') && menu.sel === M_LEVEL) {
        menu.level += b === 'left' ? -1 : 1;
        if (menu.level < 0) menu.level = save.best;
        if (menu.level > save.best) menu.level = 0;
        sfx('move');
      } else if ((b === 'left' || b === 'right' || b === 'ok') && menu.sel === M_MUSIC) {
        save.music = !save.music;
        BC.audio.setMusicOn(save.music);
        writeSave();
        sfx('select');
      } else if ((b === 'left' || b === 'right' || b === 'ok') && menu.sel === M_SOUND) {
        save.muted = !save.muted;
        BC.audio.setMuted(save.muted);
        writeSave();
        sfx('select');
      } else if (b === 'ok') {
        BC.audio.unlock();
        if (menu.sel === 0 || menu.sel === 1) { music(''); newGame(menu.sel + 1, menu.level); return; }
        if (menu.sel === M_LEVEL) { menu.level = menu.level >= save.best ? 0 : menu.level + 1; sfx('move'); }
        if (menu.sel === M_PHONE) { sfx('select'); go('connect'); return; }
      } else if (b === 'back') {
        BC.platform.exit();
      }
    }
  }

  function updateConnect() {
    var navs = BC.input.takeNav();
    for (var n = 0; n < navs.length; n++) {
      if (navs[n].b === 'back' || navs[n].b === 'ok') { sfx('move'); go('title'); return; }
    }
  }

  function updateEnd() {
    music('');
    var navs = BC.input.takeNav();
    for (var n = 0; n < navs.length; n++) {
      if ((navs[n].b === 'ok' || navs[n].b === 'back') && sceneT > 50) { G = null; go('title'); return; }
    }
    if (sceneT > 60 * 30) { G = null; go('title'); }
  }

  // ------------------------------------------------------------------ drawing
  function shadowText(ctx, str, x, y, color, scale) {
    BC.text(ctx, str, x + 1, y + 1, '#000000', scale || 1, 'center');
    BC.text(ctx, str, x, y, color, scale || 1, 'center');
  }

  function catState(c) {
    if (c.state === 'eyes' || c.state === 'entering') return 'eyes';
    if (!c.scared) return '';
    var warn = Math.min(120, G.sp.fright / 2);
    return G.fright < warn && (G.fright >> 3) % 2 ? 'flash' : 'scared';
  }

  function drawPlay(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(MX, MY, S * T, S * T);
    ctx.clip();
    ctx.drawImage(G.layer, MX, MY);
    // big cheese (blinks)
    if ((G.state !== 'run' && G.state !== 'gulp') || (sceneT >> 4) % 2 === 0) {
      for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
        if (G.map[y][x] === 'o') ctx.drawImage(BC.BIG_CHEESE, MX + x * T - 1, MY + y * T - 1);
      }
    }
    if (G.snack) ctx.drawImage(BC.SNACKS[G.snack.kind].img, MX + SNACK_X - 6, MY + SNACK_Y - 6);
    var hideCats = (G.state === 'caught' && G.stateT >= 45) || (G.state === 'clear' && G.stateT >= 40);
    var gulpCat = G.state === 'gulp' ? G.pops[G.pops.length - 1] : null;
    // mice
    G.players.forEach(function (P) {
      if (!alive(P)) return;
      if (G.state === 'gulp') return;
      var a = pos(P);
      if (G.state === 'caught' && G.victim === P.i && G.stateT >= 45) { drawDying(ctx, P, a, G.stateT - 45); return; }
      if (G.state === 'caught' && G.victim !== P.i && G.stateT >= 45) return;
      var fr = P.moving && G.state === 'run' ? Math.floor(P.anim) % 4 : 0;
      ctx.drawImage(BC.mouse(P.i, P.left, fr), Math.round(MX + a.x - 7), Math.round(MY + a.y - 7));
    });
    // cats
    if (!hideCats) {
      G.cats.forEach(function (c) {
        var b = pos(c);
        if (gulpCat && c.state === 'eyes' && Math.abs(b.x - gulpCat.x) < 1 && Math.abs(b.y - gulpCat.y) < 1) return;
        var look = c.state === 'house' ? 0 : c.state === 'leaving' || c.state === 'entering' ? (c.state === 'entering' ? 2 : 0) : c.dir;
        var fr = (c.t >> 3) % 2;
        ctx.drawImage(BC.cat(c.i, look, fr, catState(c)), Math.round(MX + b.x - 7), Math.round(MY + b.y - 7));
      });
    }
    G.pops.forEach(function (p) {
      BC.text(ctx, p.text, Math.round(MX + p.x), Math.round(MY + p.y - 3), '#80f0ff', 1, 'center');
    });
    if (G.state === 'ready') {
      if (G.stateT < G.readyLen / 2) shadowText(ctx, 'LEVEL ' + (G.level + 1), MX + 13 * T + 4, MY + 16 * T + 1, '#ffffff');
      else shadowText(ctx, 'READY!', MX + 13 * T + 4, MY + 16 * T + 1, '#ffd23f');
    }
    ctx.restore();
    drawPanels(ctx);
    if (G.paused) drawPause(ctx);
  }

  function drawDying(ctx, P, a, t) {
    if (t < 80) {
      var k = 1 - t / 90;
      ctx.save();
      ctx.translate(MX + a.x, MY + a.y);
      ctx.rotate(t * 0.25);
      ctx.scale(k, k);
      ctx.drawImage(BC.mouse(P.i, P.left, 0), -7, -7);
      ctx.restore();
    } else if (t < 92) {
      ctx.drawImage(BC.SPARKLE[Math.min(2, (t - 80) >> 2)], Math.round(MX + a.x - 8), Math.round(MY + a.y - 8));
    }
  }

  function drawPanels(ctx) {
    // left: name and scores
    var lx = MX / 2;
    BC.text(ctx, 'CHEESE', lx, 8, '#ffd23f', 1, 'center');
    BC.text(ctx, 'CHASE', lx, 18, '#ffd23f', 1, 'center');
    BC.text(ctx, 'SCORE', lx, 44, '#9c9cb0', 1, 'center');
    BC.text(ctx, pad(G.score, 6), lx, 54, '#ffffff', 1, 'center');
    BC.text(ctx, 'HI-SCORE', lx, 74, '#9c9cb0', 1, 'center');
    BC.text(ctx, pad(save.hi, 6), lx, 84, '#ffffff', 1, 'center');
    BC.text(ctx, 'LEVEL', lx, 104, '#9c9cb0', 1, 'center');
    BC.text(ctx, (G.level + 1) + ' / ' + LEVELS.length, lx, 114, '#ffffff', 1, 'center');
    BC.text(ctx, 'CRUMBS', lx, 134, '#9c9cb0', 1, 'center');
    BC.text(ctx, String(G.left), lx, 144, '#ffe08a', 1, 'center');
    BC.text(ctx, 'BACK:', lx, 192, '#5c5c6c', 1, 'center');
    BC.text(ctx, 'PAUSE', lx, 202, '#5c5c6c', 1, 'center');
    // right: lives and snacks
    var rx = MX + S * T, rc = rx + (W - rx) / 2;
    BC.text(ctx, 'LIVES', rc, 8, '#9c9cb0', 1, 'center');
    var n = Math.min(G.lives, 8);
    for (var i = 0; i < n; i++) ctx.drawImage(BC.ICON_LIFE[0], rx + 6 + (i % 4) * 18, 20 + Math.floor(i / 4) * 16);
    if (G.lives > 8) BC.text(ctx, '+' + (G.lives - 8), rc, 54, '#ffffff', 1, 'center');
    BC.text(ctx, 'SNACKS', rc, 66, '#9c9cb0', 1, 'center');
    for (var s = 0; s < G.snackLog.length; s++) ctx.drawImage(BC.SNACKS[G.snackLog[s]].img, rx + 8 + (s % 3) * 24, 78 + Math.floor(s / 3) * 16);
    var P2 = G.players[1];
    if (P2 && !P2.present && BC.platform.tv && !BC.phones[2]) {
      var addr = BC.platform.address();
      var q = addr ? BC.qrCanvas(addr, 2) : null;
      if (q) {
        BC.text(ctx, 'PLAYER 2:', rc, 120, '#b88458', 1, 'center');
        BC.text(ctx, 'SCAN ME', rc, 130, '#b88458', 1, 'center');
        ctx.drawImage(q, Math.round(rc - q.width / 2), 142);
      }
    } else if (P2 && P2.present) {
      BC.text(ctx, 'PLAYER 2', rc, 130, '#b88458', 1, 'center');
      ctx.drawImage(BC.ICON_LIFE[1], rc - 7, 142);
    }
  }

  function panel(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(14,10,8,0.9)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
  }

  function drawPause(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, H);
    panel(ctx, 112, 54, 160, 108);
    BC.text(ctx, 'PAUSED', W / 2, 64, '#ffd23f', 2, 'center');
    for (var i = 0; i < PAUSE_ITEMS.length; i++) {
      var sel = i === G.pauseSel;
      BC.text(ctx, PAUSE_ITEMS[i], 150, 94 + i * 18, sel ? '#ffffff' : '#9c9cb0');
      if (sel) ctx.drawImage(BC.mouse(0, false, (sceneT >> 3) % 4), 130, 90 + i * 18);
    }
    BC.text(ctx, 'BACK: CONTINUE', W / 2, 150, '#9c9cb0', 1, 'center');
  }

  // The title's little show: the cats chase Pip, then Pip finds the big cheese and turns the tables.
  function drawChase(ctx, y) {
    var t = sceneT % 640;
    var fr = (sceneT >> 3) % 4;
    if (t < 320) {
      var mx = 400 - t * 1.25;
      if (mx > 24) ctx.drawImage(BC.BIG_CHEESE, 18, y + 2);
      for (var d = 40; d < 384; d += 12) if (d < mx - 6) { ctx.fillStyle = '#ffe08a'; ctx.fillRect(d, y + 6, 2, 2); }
      ctx.drawImage(BC.mouse(0, true, fr), Math.round(mx), y);
      for (var i = 0; i < 4; i++) ctx.drawImage(BC.cat(i, 3, (sceneT >> 3) % 2, ''), Math.round(mx + 26 + i * 18), y);
    } else {
      var k = t - 320;
      var px = 0 + k * 1.25;
      for (var j = 0; j < 4; j++) {
        var cx = 50 + j * 18 + k * 0.95;
        var caught = cx < px + 10;
        if (!caught) ctx.drawImage(BC.cat(j, 1, (sceneT >> 3) % 2, k > 200 && (k >> 3) % 2 ? 'flash' : 'scared'), Math.round(cx), y);
      }
      ctx.drawImage(BC.mouse(0, false, fr), Math.round(px), y);
    }
  }

  function drawTitle(ctx) {
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(0, 0, W, H);
    BC.text(ctx, 'CHEESE CHASE', W / 2 + 2, 12 + 2, '#6a3a10', 3, 'center');
    BC.text(ctx, 'CHEESE CHASE', W / 2, 12, '#ffd23f', 3, 'center');
    BC.text(ctx, 'ONE MOUSE. FOUR CATS. LOTS OF CHEESE.', W / 2, 40, '#e0a050', 1, 'center');
    panel(ctx, 72, 52, 240, 116);
    var fr = (sceneT >> 3) % 4;
    for (var i = 0; i < TITLE_ITEMS.length; i++) {
      var label = TITLE_ITEMS[i];
      if (i === M_LEVEL) label = 'LEVEL  < ' + (menu.level + 1) + ' >';
      if (i === M_MUSIC) label = 'MUSIC  ' + (save.music ? 'ON' : 'OFF');
      if (i === M_SOUND) label = 'SOUND  ' + (save.muted ? 'OFF' : 'ON');
      var sel = i === menu.sel;
      var y = 60 + i * 13;
      BC.text(ctx, label, 140, y, sel ? '#ffffff' : '#9c9cb0');
      if (sel) ctx.drawImage(BC.mouse(0, false, fr), 120, y - 4);
    }
    var hint;
    if (menu.sel === M_LEVEL) hint = 'LEFT/RIGHT TO CHOOSE. REACHED: ' + (save.best + 1) + ' OF ' + LEVELS.length;
    else if (menu.sel === 1) hint = BC.platform.tv ? 'PLAYER 2 PLAYS ON A PHONE' : 'PLAYER 2: W A S D';
    else if (menu.sel === M_PHONE) hint = 'USE PHONES AS GAME CONTROLLERS';
    else hint = 'ARROWS STEER. EAT EVERY CRUMB!';
    ctx.fillStyle = '#3a3030';
    ctx.fillRect(80, 139, 224, 1);
    BC.text(ctx, hint, W / 2, 144, '#ffe08a', 1, 'center');
    BC.text(ctx, 'HI-SCORE ' + save.hi, W / 2, 156, '#e0a050', 1, 'center');
    drawChase(ctx, 176);
    var ph = [];
    if (BC.phones[1]) ph.push('P1');
    if (BC.phones[2]) ph.push('P2');
    if (ph.length) BC.text(ctx, 'PHONES CONNECTED: ' + ph.join(' '), W / 2, 196, '#c8f0ff', 1, 'center');
    BC.text(ctx, 'ARROWS: CHOOSE   OK: SELECT   BACK: EXIT', W / 2, 206, '#7c7c8c', 1, 'center');
  }

  function drawConnect(ctx) {
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(0, 0, W, H);
    BC.text(ctx, 'PHONE CONTROLLER', W / 2, 10, '#ffd23f', 2, 'center');
    var addr = BC.platform.address();
    if (!BC.platform.tv) {
      var msg = BC.wrap('THE PHONE CONTROLLER WORKS WHEN THE GAME RUNS ON THE TV. HERE, USE THE KEYBOARD OR THE BUTTONS ON THE SCREEN.', 52);
      for (var m = 0; m < msg.length; m++) BC.text(ctx, msg[m], W / 2, 70 + m * 12, '#c0c0d0', 1, 'center');
    } else if (!addr) {
      var msg2 = BC.wrap('THE TV IS NOT CONNECTED TO A NETWORK. CONNECT IT TO WI-FI, THEN COME BACK HERE.', 52);
      for (var m2 = 0; m2 < msg2.length; m2++) BC.text(ctx, msg2[m2], W / 2, 70 + m2 * 12, '#c0c0d0', 1, 'center');
    } else {
      var q = BC.qrCanvas(addr, 3);
      if (q) ctx.drawImage(q, 16, 36);
      var x = 16 + (q ? q.width : 0) + 14;
      var lines = [
        ['1. CONNECT THE PHONE TO THE', '#ffffff'],
        ['   SAME WI-FI AS THE TV.', '#ffffff'],
        ['2. SCAN THIS CODE WITH THE', '#ffffff'],
        ['   PHONE CAMERA, OR TYPE THIS', '#ffffff'],
        ['   IN THE PHONE BROWSER:', '#ffffff'],
        ['   ' + addr.replace('http://', ''), '#ffd23f'],
        ['3. TAP PLAYER 1 OR PLAYER 2.', '#ffffff']
      ];
      for (var i = 0; i < lines.length; i++) BC.text(ctx, lines[i][0], x, 40 + i * 12, lines[i][1]);
      BC.text(ctx, 'PLAYER 1: ' + (BC.phones[1] ? 'PHONE CONNECTED' : 'TV REMOTE'), x, 136, '#d6cec6');
      BC.text(ctx, 'PLAYER 2: ' + (BC.phones[2] ? 'PHONE CONNECTED' : 'WAITING FOR A PHONE'), x, 150, '#b88458');
      BC.text(ctx, 'PHONE: THE ARROWS STEER THE MOUSE', x, 168, '#c0c0d0');
    }
    BC.text(ctx, 'PRESS OK TO GO BACK', W / 2, 200, '#9c9cb0', 1, 'center');
  }

  function drawOver(ctx) {
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(0, 0, W, H);
    panel(ctx, 92, 56, 200, 100);
    BC.text(ctx, 'GAME OVER', W / 2, 70, '#ff7060', 3, 'center');
    BC.text(ctx, 'SCORE ' + G.score, W / 2, 104, '#ffffff', 1, 'center');
    BC.text(ctx, 'YOU REACHED LEVEL ' + (G.level + 1), W / 2, 118, '#c0c0d0', 1, 'center');
    if (sceneT > 50) BC.text(ctx, 'PRESS OK', W / 2, 136, '#ffd23f', 1, 'center');
    for (var i = 0; i < 4; i++) ctx.drawImage(BC.cat(i, 2, (sceneT >> 4) % 2, ''), 150 + i * 22, 172);
  }

  function drawWin(ctx) {
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(0, 0, W, H);
    panel(ctx, 52, 30, 280, 130);
    BC.text(ctx, 'YOU DID IT!', W / 2, 42, '#ffd23f', 3, 'center');
    var lines = BC.wrap('PIP ATE EVERY CRUMB IN ALL ' + LEVELS.length + ' MAZES AND OUTRAN EVERY CAT. THANK YOU FOR PLAYING!', 40);
    for (var i = 0; i < lines.length; i++) BC.text(ctx, lines[i], W / 2, 74 + i * 11, '#ffffff', 1, 'center');
    BC.text(ctx, 'FINAL SCORE ' + G.score, W / 2, 124, '#ffd23f', 1, 'center');
    if (sceneT > 50) BC.text(ctx, 'PRESS OK', W / 2, 142, '#c0c0d0', 1, 'center');
    drawChase(ctx, 180);
  }

  // ------------------------------------------------------------------ public
  BC.game = {
    W: W,
    H: H,
    init: function () { loadSave(); go('title'); },
    update: function () {
      sceneT++;
      switch (scene) {
        case 'title': updateTitle(); break;
        case 'connect': updateConnect(); break;
        case 'play': updatePlay(); break;
        case 'over': case 'win': updateEnd(); break;
      }
    },
    render: function (ctx) {
      switch (scene) {
        case 'title': drawTitle(ctx); break;
        case 'connect': drawConnect(ctx); break;
        case 'play': drawPlay(ctx); break;
        case 'over': drawOver(ctx); break;
        case 'win': drawWin(ctx); break;
      }
    },
    // Pause when the app goes to the background.
    pause: function () { if (scene === 'play' && G && !G.paused) pauseGame(); },
    scene: function () { return scene; },
    // Test hooks (used by the automated checks).
    debug: {
      state: function () { return G; },
      unlockAll: function () { save.best = LEVELS.length - 1; },
      startLevel: function (mode, index) { newGame(mode || 1, index || 0); G.state = 'run'; G.first = false; },
      // eats every crumb but n
      eatAll: function (n) {
        n = n || 0;
        for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
          if (G.left <= n) return;
          if (G.map[y][x] === '.' || G.map[y][x] === 'o') { G.map[y][x] = ' '; clearCrumb(x, y); G.left--; G.eaten++; }
        }
      },
      scare: function () { scareCats(); },
      teleport: function (i, tx, ty) { var P = G.players[i || 0]; P.tx = tx; P.ty = ty; P.p = 0; },
      pos: function (e) { return pos(e); }
    }
  };
})();
