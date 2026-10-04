// Kiko's Quest: rules, levels and all screens.
var BC = window.BC || (window.BC = {});

(function () {
  'use strict';

  var W = 384, H = 216;           // logical screen (16:9)
  var T = 16, ROWS = 13, OY = 8;  // tiles are 16px; the map is 13 rows, drawn from y = 8 (above it: the score line)
  var EMPTY = 0, GROUND = 1, STONE = 2, BRICK = 3, GIFT = 4, GIFTP = 5, GIFT1 = 6, USED = 7, PLANK = 8, SPIKES = 9, COIN = 10;
  var CHARS = { '#': GROUND, 'X': STONE, 'B': BRICK, '?': GIFT, 'P': GIFTP, '1': GIFT1, '=': PLANK, '^': SPIKES, 'o': COIN };
  var LEVELS = BC.LEVELS;
  var WORLD_NAMES = ['SUNNY MEADOWS', 'DUNE ROAD', 'CRYSTAL CAVES', 'STARRY HEIGHTS'];

  // Movement, in pixels per frame (60 frames a second).
  var MAXV = 2.2;          // top walking speed
  var ACC = 0.12, ACC_AIR = 0.1, TURN = 0.3, FRICTION = 0.15;
  var JUMPV = -5.3;        // jump take-off speed
  var GRAV_HOLD = 0.2;     // gravity while the jump button is held (higher jumps)
  var GRAV_UP = 0.6;       // gravity once it is let go
  var GRAV_FALL = 0.42;
  var MAXFALL = 6;
  var HOLD_MAX = 22, HOLD_MIN = 4;
  var COYOTE = 6, BUFFER = 6;   // frames of leeway for late or early jump presses
  var TIME_UNIT = 30;           // frames per tick of the level clock
  var CHAIN = [100, 200, 400, 800, 1000, 2000, 4000, 8000];
  var BUMP = [0, 3, 5, 6, 6, 5, 3, 1];

  var scene = 'title';
  var sceneT = 0;
  var G = null;          // the current game
  var menu = { sel: 0, level: 0 };
  var save = { best: 0, hi: 10000, muted: false, music: true };

  function sfx(n) { BC.audio.play(n); }
  function music(n) { BC.audio.music(n); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sign(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
  function overlap(a, b, m) {
    m = m || 0;
    return a.x + m < b.x + b.w && a.x + a.w - m > b.x && a.y + m < b.y + b.h && a.y + a.h - m > b.y;
  }
  function pad(n, len) { var s = String(n); while (s.length < len) s = '0' + s; return s; }

  // ------------------------------------------------------------------ saving
  function loadSave() {
    var s = BC.platform.load('kiko-save');
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
  function writeSave() { BC.platform.save('kiko-save', JSON.stringify(save)); }

  // ------------------------------------------------------------------ scenes
  function go(s) {
    scene = s;
    sceneT = 0;
    BC.input.clearNav();
    BC.platform.broadcast(s === 'play' ? 'mode:game' : 'mode:menu');
  }

  function p2Wanted() { return !BC.platform.tv || BC.phones[2]; }

  function newGame(mode, level) {
    G = {
      mode: mode, level: level, lives: 3, coins: 0, score: 0, check: -1,
      players: [mkPlayer(0), mode === 2 ? mkPlayer(1) : null]
    };
    go('intro');
  }

  function mkPlayer(i) {
    return { i: i, form: 'small', present: false, benched: false, x: 0, y: 0, w: 12, h: 14, vx: 0, vy: 0, face: 1 };
  }

  function score(n, x, y) {
    G.score += n;
    if (G.score > save.hi) save.hi = G.score;
    if (x !== undefined) G.pops.push({ x: x, y: y, text: String(n), t: 40 });
  }
  function addLife(x, y) {
    G.lives = Math.min(99, G.lives + 1);
    sfx('life');
    if (x !== undefined) G.pops.push({ x: x, y: y, text: '1UP', t: 50 });
  }
  function addCoin() {
    G.coins++;
    sfx('coin');
    if (G.coins >= 100) { G.coins -= 100; addLife(); }
  }

  // ------------------------------------------------------------------ building a level
  function buildLevel() {
    var L = LEVELS[G.level];
    G.world = L.world;
    G.LW = L.rows[0].length;
    G.map = [];
    G.enemies = []; G.items = []; G.fireballs = []; G.plats = []; G.fx = []; G.pops = []; G.bumps = [];
    G.checks = [];
    G.goal = null;
    G.paused = false;
    G.t = 0;
    var start = 2;
    for (var y = 0; y < ROWS; y++) {
      var row = L.rows[y];
      for (var x = 0; x < G.LW; x++) {
        var ch = row.charAt(x);
        G.map.push(CHARS[ch] || EMPTY);
        if (ch === 'g' || ch === 's' || ch === 'b' || ch === 'f') addEnemy(ch, x, y);
        else if (ch === 'M' || ch === 'V') addPlat(ch, x, y);
        else if (ch === 'K') G.checks.push(x);
        else if (ch === 'F') G.goalCol = x;
        else if (ch === 'S') start = x;
      }
    }
    G.poleX = G.goalCol * T + 8;
    G.flagY = 2 * T + 3;
    G.time = L.time;
    G.timeT = 0;
    var sx = G.check >= 0 ? G.check : start;
    G.cam = clamp(sx * T - W * 0.3, 0, G.LW * T - W);
    G.players.forEach(function (P, i) {
      if (!P) return;
      P.benched = false;
      if (i === 0 || p2Wanted()) spawnPlayer(P, sx * T + i * 20, 10 * T);
      else P.present = false;
    });
    music(BC.MUSIC[G.world]);
    BC.input.clearEdges();
  }

  function addEnemy(ch, cx, cy) {
    var kind = { g: 'beetle', s: 'spiky', b: 'bird', f: 'frog' }[ch];
    var e = { kind: kind, x: cx * T + 1, y: cy * T + 2, w: 14, h: 14, vx: -0.5, vy: 0, t: 0, active: false, dead: '', face: -1 };
    if (kind === 'spiky') e.vx = -0.45;
    if (kind === 'bird') { e.h = 12; e.baseY = e.y; e.vx = -0.6; }
    if (kind === 'frog') { e.y = cy * T + 4; e.h = 12; e.vx = 0; e.hop = 50; }
    G.enemies.push(e);
  }

  function addPlat(ch, cx, cy) {
    var p = { kind: ch, x: cx * T, y: cy * T, w: 48, h: 6, x0: cx * T, y0: cy * T, dir: 1, dx: 0, dy: 0 };
    if (ch === 'M') { p.range = 128; p.sp = 0.7; }
    else { p.range = 80; p.sp = 0.6; p.dir = -1; }
    G.plats.push(p);
  }

  function spawnPlayer(P, x, y) {
    P.present = true;
    P.dead = false;
    P.pit = false;
    P.x = x + 2;
    P.h = P.form === 'small' ? 14 : 22;
    P.y = y + T - P.h;
    P.vx = 0; P.vy = 0; P.face = 1;
    P.onGround = false; P.plat = null;
    P.coyote = 0; P.buffer = 0; P.holdT = 0; P.jumping = false;
    P.inv = 0; P.grow = 0; P.anim = 0; P.chain = 0; P.shootT = 0;
    P.prevDir = -1;
  }

  // ------------------------------------------------------------------ the map
  function tile(cx, cy) {
    if (cx < 0 || cx >= G.LW) return STONE;
    if (cy < 0 || cy >= ROWS) return EMPTY;
    return G.map[cy * G.LW + cx];
  }
  function setTile(cx, cy, v) { G.map[cy * G.LW + cx] = v; }
  function solid(t) { return t >= GROUND && t <= USED; }
  function solidAt(cx, cy) { return solid(tile(cx, cy)); }

  // Moves a body sideways; returns true if it ran into a wall.
  function moveX(b) {
    if (!b.vx) return false;
    b.x += b.vx;
    var y0 = Math.floor(b.y / T), y1 = Math.floor((b.y + b.h - 0.01) / T);
    var cx = b.vx > 0 ? Math.floor((b.x + b.w - 0.01) / T) : Math.floor(b.x / T);
    for (var cy = y0; cy <= y1; cy++) {
      if (solidAt(cx, cy)) {
        b.x = b.vx > 0 ? cx * T - b.w : (cx + 1) * T;
        return true;
      }
    }
    return false;
  }

  // Moves a body up or down. Returns the row of a ceiling it hit (or -1).
  function moveY(b) {
    b.onGround = false;
    var prevBottom = b.y + b.h;
    b.y += b.vy;
    var x0 = Math.floor(b.x / T), x1 = Math.floor((b.x + b.w - 0.01) / T);
    var cx;
    if (b.vy > 0) {
      var cy = Math.floor((b.y + b.h - 0.01) / T);
      for (cx = x0; cx <= x1; cx++) {
        var t = tile(cx, cy);
        if (solid(t) || (t === PLANK && prevBottom <= cy * T + 0.5)) {
          b.y = cy * T - b.h;
          b.vy = 0;
          b.onGround = true;
          return -1;
        }
      }
    } else if (b.vy < 0) {
      var cyc = Math.floor(b.y / T);
      for (cx = x0; cx <= x1; cx++) {
        if (solidAt(cx, cyc)) {
          b.y = (cyc + 1) * T;
          b.vy = 0;
          return cyc;
        }
      }
    }
    return -1;
  }

  // ------------------------------------------------------------------ blocks
  function bumpBlock(P, cx, cy) {
    var t = tile(cx, cy);
    var X = cx * T, Y = cy * T;
    if (t === GIFT) {
      setTile(cx, cy, USED);
      G.fx.push({ type: 'coin', x: X, y: Y - 16, vy: -5, t: 0 });
      addCoin();
      score(200);
    } else if (t === GIFTP || t === GIFT1) {
      setTile(cx, cy, USED);
      var kind = t === GIFT1 ? 'heart' : (P.form === 'small' ? 'berry' : 'seed');
      G.items.push({ kind: kind, x: X + 1, y: Y, w: 14, h: 14, vx: 0, vy: 0, rise: 16, t: 0 });
      sfx('appear');
    } else if (t === BRICK && P.form !== 'small') {
      setTile(cx, cy, EMPTY);
      for (var i = 0; i < 4; i++) {
        G.fx.push({ type: 'debris', x: X + (i % 2) * 8 + 2, y: Y + (i >> 1) * 8 + 2, vx: (i % 2 ? 1 : -1) * (1 + (i >> 1) * 0.4), vy: -5 + (i >> 1) * 1.5, t: 0 });
      }
      score(50);
      sfx('break');
    } else {
      sfx('bump');
    }
    if (tile(cx, cy) !== EMPTY) G.bumps.push({ cx: cx, cy: cy, t: 0 });
    // Whatever stands on the block gets knocked
    G.enemies.forEach(function (e) {
      if (e.dead || !e.active) return;
      if (e.x + e.w > X && e.x < X + T && Math.abs(e.y + e.h - Y) < 4) knockOut(e, sign(e.x + e.w / 2 - (X + 8)) || 1, 100);
    });
    if (tile(cx, cy - 1) === COIN) {
      setTile(cx, cy - 1, EMPTY);
      G.fx.push({ type: 'coin', x: X, y: Y - 16, vy: -5, t: 0 });
      addCoin();
      score(200);
    }
    G.items.forEach(function (it) {
      if (!it.rise && it.x + it.w > X && it.x < X + T && Math.abs(it.y + it.h - Y) < 4) { it.vy = -4; it.vx = it.vx || 1; }
    });
  }

  // ------------------------------------------------------------------ players
  function alive(P) { return P && P.present && !P.dead; }
  function livePlayers() { return G.players.filter(alive); }
  function leader() {
    var best = null;
    G.players.forEach(function (P) { if (alive(P) && (!best || P.x > best.x)) best = P; });
    return best;
  }

  function setForm(P, form) {
    var oldH = P.h;
    P.form = form;
    P.h = form === 'small' ? 14 : 22;
    P.y += oldH - P.h;
  }

  function hurt(P) {
    if (P.inv > 0 || P.dead || G.goal) return;
    if (P.form === 'small') { killPlayer(P); return; }
    setForm(P, P.form === 'fire' ? 'big' : 'small');
    P.inv = 110;
    P.grow = -24;
    sfx('hurt');
  }

  function killPlayer(P, pit) {
    if (P.dead) return;
    P.dead = true;
    P.pit = !!pit;
    P.deathT = pit ? 40 : 0;
    P.vx = 0;
    P.vy = -5;
    P.plat = null;
    if (!livePlayers().length) music('');
    sfx('die');
  }

  function deathDone(P) {
    var others = livePlayers();
    if (others.length) {
      if (G.lives > 0) {
        G.lives--;
        var o = others[0];
        setForm(P, 'small');
        spawnPlayer(P, clamp(o.x, G.cam + 8, G.cam + W - 40), -T * 2);
        P.inv = 120;
      } else {
        P.present = false;
        P.benched = true;
      }
      return;
    }
    if (G.lives > 0) {
      G.lives--;
      G.players.forEach(function (Q) { if (Q) setForm(Q, 'small'); });
      go('intro');
    } else {
      music('');
      sfx('over');
      writeSave();
      go('over');
    }
  }

  function readInput(P) {
    var d = BC.input.dir(P.i);
    var fe = BC.input.fireEdge(P.i), fh = BC.input.fireHeld(P.i);
    var inp = {
      move: d === 1 ? 1 : d === 3 ? -1 : 0,
      jumpPress: (d === 0 && P.prevDir !== 0) || fe,
      jumpHeld: d === 0 || fh,
      shoot: d === 2 && P.prevDir !== 2
    };
    P.prevDir = d;
    return inp;
  }

  function updatePlayer(P) {
    if (P.dead) {
      P.deathT++;
      if (!P.pit && P.deathT > 30) { P.vy = Math.min(P.vy + 0.3, 6); P.y += P.vy; }
      if (P.deathT >= 150) deathDone(P);
      return;
    }
    var inp = readInput(P);
    if (P.inv > 0) P.inv--;
    if (P.grow > 0) P.grow--;
    else if (P.grow < 0) P.grow++;
    if (P.shootT > 0) P.shootT--;

    // ride a moving platform
    if (P.plat) {
      var pl = P.plat;
      if (P.x + P.w > pl.x && P.x < pl.x + pl.w) {
        P.x += pl.dx;
        P.y = pl.y - P.h;
      } else P.plat = null;
    }

    // walking
    if (inp.move) {
      P.face = inp.move;
      var a = P.onGround ? (P.vx * inp.move < 0 ? TURN : ACC) : ACC_AIR;
      P.vx = clamp(P.vx + inp.move * a, -MAXV, MAXV);
    } else if (P.onGround) {
      P.vx = Math.abs(P.vx) <= FRICTION ? 0 : P.vx - sign(P.vx) * FRICTION;
    }

    // jumping
    if (inp.jumpPress) P.buffer = BUFFER;
    else if (P.buffer > 0) P.buffer--;
    if (P.onGround) P.coyote = COYOTE;
    else if (P.coyote > 0) P.coyote--;
    if (P.buffer > 0 && P.coyote > 0) {
      P.vy = JUMPV - Math.abs(P.vx) * 0.12;
      P.jumping = true;
      P.holdT = 0;
      P.buffer = 0;
      P.coyote = 0;
      P.plat = null;
      sfx('jump');
    }
    var g;
    if (P.vy < 0) {
      if (P.jumping && (inp.jumpHeld || P.holdT < HOLD_MIN) && P.holdT < HOLD_MAX) { g = GRAV_HOLD; P.holdT++; }
      else { g = GRAV_UP; P.jumping = false; }
    } else {
      g = GRAV_FALL;
      P.jumping = false;
    }
    P.vy = Math.min(P.vy + g, MAXFALL);

    // fireballs
    if (inp.shoot && P.form === 'fire') {
      var mine = G.fireballs.filter(function (f) { return f.owner === P.i; }).length;
      if (mine < 2) {
        G.fireballs.push({ owner: P.i, x: P.face > 0 ? P.x + P.w - 2 : P.x - 6, y: P.y + 4, w: 8, h: 8, vx: 4 * P.face, vy: 1, t: 0 });
        P.shootT = 10;
        sfx('fire');
      }
    }

    // move and collide
    if (moveX(P)) P.vx = 0;
    // the screen's edges
    var rightEnd = G.LW * T - P.w;
    if (P.x > rightEnd) { P.x = rightEnd; P.vx = 0; }
    if (P.x < G.cam) {
      P.x = G.cam;
      if (P.vx < 0) P.vx = 0;
      if (overlapsSolid(P)) catchUp(P);
    }
    // nudge round a block corner when the head only just clips it
    if (P.vy < 0) cornerNudge(P);
    var prevBottom = P.y + P.h;
    var ceil = moveY(P);
    if (ceil >= 0) headHit(P, ceil);
    if (!P.onGround && P.vy >= 0) {
      P.plat = null;
      for (var i = 0; i < G.plats.length; i++) {
        var p = G.plats[i];
        if (P.x + P.w > p.x && P.x < p.x + p.w && prevBottom <= p.y + 1 + Math.max(0, p.dy) && P.y + P.h >= p.y) {
          P.y = p.y - P.h;
          P.vy = 0;
          P.onGround = true;
          P.plat = p;
          break;
        }
      }
    } else if (P.onGround) P.plat = null;
    if (P.onGround) P.chain = 0;

    // animation
    if (P.onGround && Math.abs(P.vx) > 0.1) P.anim += Math.abs(P.vx) * 0.09;

    // pickups and hazards in the map
    touchTiles(P);
    if (P.y > ROWS * T + 8) killPlayer(P, true);
  }

  function overlapsSolid(b) {
    var x0 = Math.floor(b.x / T), x1 = Math.floor((b.x + b.w - 0.01) / T);
    var y0 = Math.floor(b.y / T), y1 = Math.floor((b.y + b.h - 0.01) / T);
    for (var cy = y0; cy <= y1; cy++) for (var cx = x0; cx <= x1; cx++) if (solidAt(cx, cy)) return true;
    return false;
  }

  // A player left behind and squeezed against a wall by the screen edge jumps to the leader.
  function catchUp(P) {
    var L = leader();
    if (!L || L === P) return;
    P.x = L.x;
    P.y = L.y + L.h - P.h;
    P.vx = 0; P.vy = 0;
    P.inv = Math.max(P.inv, 60);
  }

  function cornerNudge(P) {
    var cy = Math.floor((P.y + P.vy) / T);
    var x0 = Math.floor(P.x / T), x1 = Math.floor((P.x + P.w - 0.01) / T);
    if (x0 === x1) return;
    var a = solidAt(x0, cy), b = solidAt(x1, cy);
    if (a && !b) {
      var over = (x0 + 1) * T - P.x;
      if (over <= 5 && !solidAt(x1, Math.floor(P.y / T))) P.x += over;
    } else if (b && !a) {
      var over2 = P.x + P.w - x1 * T;
      if (over2 <= 5 && !solidAt(x0, Math.floor(P.y / T))) P.x -= over2;
    }
  }

  function headHit(P, cy) {
    var mid = Math.floor((P.x + P.w / 2) / T);
    var cx = solidAt(mid, cy) ? mid : (solidAt(Math.floor(P.x / T), cy) ? Math.floor(P.x / T) : Math.floor((P.x + P.w - 0.01) / T));
    P.jumping = false;
    bumpBlock(P, cx, cy);
  }

  function touchTiles(P) {
    var x0 = Math.floor(P.x / T), x1 = Math.floor((P.x + P.w - 0.01) / T);
    var y0 = Math.floor(P.y / T), y1 = Math.floor((P.y + P.h - 0.01) / T);
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        var t = tile(cx, cy);
        if (t === COIN) {
          setTile(cx, cy, EMPTY);
          addCoin();
          score(200);
          G.fx.push({ type: 'spark', x: cx * T, y: cy * T, t: 0 });
        } else if (t === SPIKES) {
          if (P.x + P.w > cx * T + 2 && P.x < cx * T + 14 && P.y + P.h > cy * T + 9) hurt(P);
        }
      }
    }
    // checkpoints
    for (var i = 0; i < G.checks.length; i++) {
      var k = G.checks[i];
      if (k > G.check && P.x + P.w / 2 >= k * T + 8) {
        G.check = k;
        G.fx.push({ type: 'spark', x: k * T + 4, y: 8 * T, t: 0 });
        sfx('select');
      }
    }
    // the goal
    if (!G.goal && P.x + P.w >= G.poleX - 1) reachGoal(P);
  }

  function reachGoal(P) {
    var h = 11 * T - (P.y + P.h);
    var bonus = h >= 112 ? 5000 : h >= 80 ? 2000 : h >= 48 ? 800 : h >= 24 ? 400 : 100;
    score(bonus, P.x, P.y);
    G.goal = { P: P, phase: 'slide', t: 0 };
    P.x = G.poleX - P.w + 1;
    P.vx = 0;
    P.vy = 0;
    P.face = 1;
    music('');
    sfx('flag');
  }

  function updateGoal() {
    var gl = G.goal, P = gl.P;
    gl.t++;
    var ground = 11 * T;
    if (gl.phase === 'slide') {
      if (P.y + P.h < ground) P.y = Math.min(ground - P.h, P.y + 2);
      if (G.flagY < ground - 14) G.flagY += 2;
      if (P.y + P.h >= ground && G.flagY >= ground - 14) { gl.phase = 'wait'; gl.t = 0; }
    } else if (gl.phase === 'wait') {
      if (gl.t === 12) sfx('clear');
      if (gl.t > 20) { gl.phase = 'walk'; gl.t = 0; P.x = G.poleX + 4; }
    } else if (gl.phase === 'walk') {
      P.vx = 1.2;
      P.vy = Math.min(P.vy + GRAV_FALL, MAXFALL);
      moveX(P);
      moveY(P);
      P.anim += 0.11;
      if (gl.t > 70) { P.vx = 0; gl.phase = 'count'; gl.t = 0; }
    } else if (gl.phase === 'count') {
      if (G.time > 0) {
        var n = Math.min(G.time, 2);
        G.time -= n;
        score(50 * n);
        if (gl.t % 4 === 0) sfx('tick');
      } else if (gl.t > 30 || G.time <= 0) {
        gl.phase = 'done';
        gl.t = 0;
      }
    } else if (gl.phase === 'done' && gl.t > 50) {
      levelCleared();
    }
    G.cam = clamp(Math.max(G.cam, P.x + P.w / 2 - W * 0.5), 0, G.LW * T - W);
  }

  function levelCleared() {
    G.check = -1;
    if (G.level + 1 >= LEVELS.length) {
      save.best = LEVELS.length - 1;
      writeSave();
      music('grass');
      sfx('life');
      go('win');
      return;
    }
    G.level++;
    save.best = Math.max(save.best, G.level);
    menu.level = G.level;
    writeSave();
    // players who ran out of lives come back for the next level
    G.players.forEach(function (Q) { if (Q) Q.benched = false; });
    go('intro');
  }

  // ------------------------------------------------------------------ enemies
  function knockOut(e, dir, pts) {
    e.dead = 'flip';
    e.vy = -3.5;
    e.vx = dir * 0.8;
    e.t = 0;
    score(pts, e.x, e.y);
    sfx('stomp');
  }

  function updateEnemy(e) {
    if (!e.active) {
      if (e.x < G.cam + W + 24) e.active = true;
      else return;
    }
    e.t++;
    if (e.dead === 'squash') { if (e.t > 30) e.gone = true; return; }
    if (e.dead === 'flip') {
      e.vy += 0.35;
      e.y += e.vy;
      e.x += e.vx;
      if (e.y > ROWS * T + 32) e.gone = true;
      return;
    }
    if (e.kind === 'bird') {
      e.x += e.vx;
      e.y = e.baseY + Math.sin(e.t * 0.06) * 18;
      e.face = -1;
    } else if (e.kind === 'frog') {
      var L = leader();
      if (e.onGround) {
        e.vx = 0;
        if (L) e.face = L.x < e.x ? -1 : 1;
        if (--e.hop <= 0 && L && Math.abs(L.x - e.x) < 220) {
          e.vy = -4.6;
          e.vx = e.face * 1.1;
          e.hop = 70 + Math.floor(Math.random() * 50);
        }
      }
      e.vy = Math.min(e.vy + 0.3, MAXFALL);
      if (moveX(e)) e.vx = -e.vx;
      moveY(e);
    } else {
      e.vy = Math.min(e.vy + 0.35, MAXFALL);
      if (moveX(e)) e.vx = -e.vx;
      moveY(e);
      e.face = e.vx < 0 ? -1 : 1;
    }
    if (e.y > ROWS * T + 32 || e.x < G.cam - 96) e.gone = true;
  }

  function walkersBump() {
    var list = G.enemies.filter(function (e) { return e.active && !e.dead && (e.kind === 'beetle' || e.kind === 'spiky'); });
    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) {
        var a = list[i], b = list[j];
        if (!overlap(a, b, 1)) continue;
        var l = a.x < b.x ? a : b, r = l === a ? b : a;
        l.vx = -Math.abs(l.vx);
        r.vx = Math.abs(r.vx);
      }
    }
  }

  function playerVsEnemies(P) {
    if (P.dead || !P.present) return;
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (!e.active || e.dead || !overlap(P, e, 2)) continue;
      var fromAbove = P.vy > 0 && P.y + P.h - P.vy <= e.y + 7;
      if (fromAbove && e.kind !== 'spiky') {
        var pts = CHAIN[Math.min(P.chain, CHAIN.length - 1)];
        if (P.chain >= CHAIN.length) addLife(e.x, e.y);
        else score(pts, e.x, e.y);
        P.chain++;
        if (e.kind === 'bird') { e.dead = 'flip'; e.vy = 0; e.vx = 0; e.t = 0; }
        else { e.dead = 'squash'; e.t = 0; }
        var held = BC.input.fireHeld(P.i) || BC.input.dir(P.i) === 0;
        P.vy = held ? -5.4 : -3.8;
        P.jumping = held;
        P.holdT = HOLD_MAX - 8;
        sfx('stomp');
      } else {
        hurt(P);
      }
    }
  }

  // ------------------------------------------------------------------ items and fireballs
  function updateItem(it) {
    it.t++;
    if (it.rise > 0) {
      it.rise--;
      it.y -= 1;
      if (!it.rise && it.kind !== 'seed') it.vx = it.kind === 'heart' ? 1.2 : 1;
      return;
    }
    if (it.kind === 'seed') return;
    it.vy = Math.min(it.vy + 0.35, MAXFALL);
    if (moveX(it)) it.vx = -it.vx;
    moveY(it);
    if (it.y > ROWS * T + 16 || it.x < G.cam - 64) it.gone = true;
  }

  function collectItems(P) {
    if (!alive(P)) return;
    for (var i = 0; i < G.items.length; i++) {
      var it = G.items[i];
      if (it.gone || it.rise > 4 || !overlap(P, it)) continue;
      it.gone = true;
      if (it.kind === 'heart') { addLife(it.x, it.y); continue; }
      score(1000, it.x, it.y);
      sfx('power');
      if (it.kind === 'berry' && P.form === 'small') { setForm(P, 'big'); P.grow = 30; }
      else if (it.kind === 'seed') {
        if (P.form !== 'fire') P.grow = 30;
        setForm(P, 'fire');
      }
    }
  }

  function updateFireball(f) {
    f.t++;
    f.vy = Math.min(f.vy + 0.35, 5);
    if (moveX(f)) { poof(f); return; }
    if (moveY(f) >= 0) { poof(f); return; }
    if (f.onGround) f.vy = -3.2;
    if (f.y > ROWS * T || f.x < G.cam - 16 || f.x > G.cam + W + 16) { f.gone = true; return; }
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (e.active && !e.dead && overlap(f, e)) {
        knockOut(e, sign(f.vx), 200);
        poof(f);
        return;
      }
    }
  }
  function poof(f) {
    f.gone = true;
    G.fx.push({ type: 'spark', x: f.x - 4, y: f.y - 4, t: 0 });
  }

  function updatePlats() {
    G.plats.forEach(function (p) {
      var ox = p.x, oy = p.y;
      if (p.kind === 'M') {
        p.x += p.sp * p.dir;
        if (p.x >= p.x0 + p.range) { p.x = p.x0 + p.range; p.dir = -1; }
        if (p.x <= p.x0) { p.x = p.x0; p.dir = 1; }
      } else {
        p.y += p.sp * p.dir;
        if (p.y <= p.y0 - p.range) { p.y = p.y0 - p.range; p.dir = 1; }
        if (p.y >= p.y0) { p.y = p.y0; p.dir = -1; }
      }
      p.dx = p.x - ox;
      p.dy = p.y - oy;
    });
  }

  // ------------------------------------------------------------------ playing
  function updatePlay() {
    var navs = BC.input.takeNav();
    if (G.paused) { updatePause(navs); return; }
    for (var n = 0; n < navs.length; n++) {
      if (navs[n].b === 'back') { pauseGame(); return; }
    }
    G.t++;

    // player 2 drops in when their phone connects, and leaves when it disconnects
    var P2 = G.players[1];
    if (P2 && BC.platform.tv) {
      if (BC.phones[2] && !P2.present && !P2.benched) {
        var L = leader();
        if (L) { setForm(P2, 'small'); spawnPlayer(P2, clamp(L.x, G.cam + 8, G.cam + W - 40), -T * 2); P2.inv = 90; }
      } else if (!BC.phones[2] && P2.present && !P2.dead && livePlayers().length > 1) {
        P2.present = false;
      }
    }

    updatePlats();
    if (G.goal) {
      updateGoal();
    } else {
      G.players.forEach(function (P) { if (P && P.present) updatePlayer(P); });
      if (scene !== 'play') return;
      G.enemies.forEach(updateEnemy);
      walkersBump();
      G.players.forEach(function (P) { if (P) { playerVsEnemies(P); collectItems(P); } });
      G.items.forEach(updateItem);
      G.fireballs.forEach(updateFireball);
      // camera follows whoever is furthest ahead, and never goes back
      var lead = leader();
      if (lead) G.cam = clamp(Math.max(G.cam, lead.x + lead.w / 2 - W * 0.4), 0, G.LW * T - W);
      // the clock
      if (livePlayers().length && ++G.timeT >= TIME_UNIT) {
        G.timeT = 0;
        G.time--;
        if (G.time === 100) sfx('pause');
        if (G.time <= 0) { G.time = 0; livePlayers().forEach(function (P) { killPlayer(P); }); }
      }
    }
    G.enemies = G.enemies.filter(function (e) { return !e.gone; });
    G.items = G.items.filter(function (i) { return !i.gone; });
    G.fireballs = G.fireballs.filter(function (f) { return !f.gone; });
    G.fx.forEach(function (f) {
      f.t++;
      if (f.type === 'debris') { f.vy += 0.35; f.x += f.vx; f.y += f.vy; }
      if (f.type === 'coin') { f.vy += 0.4; f.y += f.vy; }
    });
    G.fx = G.fx.filter(function (f) {
      return f.type === 'debris' ? f.y < H : f.type === 'coin' ? f.t < 26 : f.t < 12;
    });
    G.pops.forEach(function (p) { p.t--; p.y -= 0.6; });
    G.pops = G.pops.filter(function (p) { return p.t > 0; });
    G.bumps.forEach(function (b) { b.t++; });
    G.bumps = G.bumps.filter(function (b) { return b.t < BUMP.length; });
  }

  var PAUSE_ITEMS = ['CONTINUE', 'RESTART LEVEL', 'QUIT TO TITLE'];

  function pauseGame() {
    if (!G || G.paused || G.goal || !livePlayers().length) return;
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
        music(BC.MUSIC[G.world]);
        BC.input.clearEdges();
        G.players.forEach(function (P) { if (P) P.prevDir = BC.input.dir(P.i); });
        BC.platform.broadcast('mode:game');
        return;
      } else if (b === 'ok' && G.pauseSel === 1) {
        sfx('select');
        G.paused = false;
        G.players.forEach(function (P) { if (P) setForm(P, 'small'); });
        go('intro');
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

  // ------------------------------------------------------------------ other scenes
  var TITLE_ITEMS = ['1 PLAYER', '2 PLAYERS', 'LEVEL', 'PHONE CONTROLLER', 'MUSIC', 'SOUND'];
  var M_LEVEL = 2, M_PHONE = 3, M_MUSIC = 4, M_SOUND = 5;

  function updateTitle() {
    if (sceneT === 1) music('grass');
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
        if (menu.sel === 0 || menu.sel === 1) { sfx('select'); music(''); newGame(menu.sel + 1, menu.level); return; }
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

  function updateIntro() {
    if (sceneT === 1) { music(''); sfx('start'); }
    var navs = BC.input.takeNav();
    var skip = false;
    for (var n = 0; n < navs.length; n++) if (navs[n].b === 'ok') skip = true;
    if (sceneT > 140 || (skip && sceneT > 30)) {
      buildLevel();
      go('play');
    }
  }

  function updateEnd() {
    var navs = BC.input.takeNav();
    for (var n = 0; n < navs.length; n++) {
      if ((navs[n].b === 'ok' || navs[n].b === 'back') && sceneT > 50) { G = null; go('title'); return; }
    }
    if (sceneT > 60 * 30) { G = null; go('title'); }
  }

  // ------------------------------------------------------------------ drawing the level
  function drawBackground(ctx, world, cam) {
    var bg = BC.background(world);
    ctx.fillStyle = bg.sky;
    ctx.fillRect(0, 0, W, H);
    var fo = -Math.floor(cam * 0.2) % 512, no = -Math.floor(cam * 0.45) % 512;
    ctx.drawImage(bg.far, fo, 0);
    ctx.drawImage(bg.far, fo + 512, 0);
    ctx.drawImage(bg.near, no, 0);
    ctx.drawImage(bg.near, no + 512, 0);
  }

  function drawTiles(ctx, cam) {
    var tiles = BC.tiles(G.world);
    var c0 = Math.floor(cam / T), c1 = Math.min(G.LW - 1, c0 + Math.ceil(W / T));
    var gf = [0, 1, 2, 1][(G.t >> 3) & 3];
    var cf = (G.t >> 3) & 3;
    var bumpAt = {};
    G.bumps.forEach(function (b) { bumpAt[b.cy * G.LW + b.cx] = BUMP[b.t]; });
    for (var cy = 0; cy < ROWS; cy++) {
      for (var cx = c0; cx <= c1; cx++) {
        var t = G.map[cy * G.LW + cx];
        if (!t) continue;
        var X = cx * T - cam, Y = cy * T + OY - (bumpAt[cy * G.LW + cx] || 0);
        var img = null;
        switch (t) {
          case GROUND: img = tile(cx, cy - 1) === GROUND || (cy === 0 && G.world === 2) ? tiles.ground : tiles.surface; break;
          case STONE: img = tiles.stone; break;
          case BRICK: img = tiles.brick; break;
          case GIFT: case GIFTP: case GIFT1: img = tiles.gift[gf]; break;
          case USED: img = tiles.used; break;
          case PLANK: img = tiles.plank; break;
          case SPIKES: img = tiles.spikes; break;
          case COIN: img = BC.COIN[cf]; break;
        }
        if (img) ctx.drawImage(img, X, Y);
      }
    }
  }

  function drawPoles(ctx, cam) {
    // checkpoints
    for (var i = 0; i < G.checks.length; i++) {
      var k = G.checks[i];
      var kx = k * T - cam;
      if (kx < -16 || kx > W) continue;
      BC.drawFlag(ctx, kx, 8 * T + OY, 48, G.check >= k ? '#3cb44b' : '#e8503c', G.check >= k);
    }
    // the goal pole and its flag
    var gx = G.goalCol * T - cam;
    if (gx > -24 && gx < W + 8) {
      ctx.fillStyle = '#5a5f68';
      ctx.fillRect(gx + 7, 2 * T + OY, 2, 9 * T);
      ctx.fillStyle = '#f8c838';
      ctx.fillRect(gx + 5, 2 * T + OY - 4, 6, 5);
      var fy = G.flagY + OY;
      ctx.fillStyle = '#e8503c';
      for (var r = 0; r < 12; r++) ctx.fillRect(gx + 7 - (12 - Math.abs(6 - r) * 2), fy + r, 12 - Math.abs(6 - r) * 2, 1);
      ctx.fillStyle = '#fff6d0';
      ctx.fillRect(gx + 1, fy + 5, 2, 2);
      ctx.fillStyle = '#5a5f68';
      ctx.fillRect(gx + 2, 11 * T + OY - 8, 12, 8);
    }
  }

  function drawPlayer(ctx, P, cam) {
    if (!P || !P.present) return;
    if (!P.dead && P.inv > 0 && (P.inv >> 2) % 2 && P.grow === 0) return;
    if (P.dead && P.pit) return;
    var form = P.form;
    if (P.grow > 0) form = (P.grow >> 2) % 2 ? (P.form === 'fire' ? 'big' : 'small') : P.form;
    if (P.grow < 0) form = (P.grow >> 2) % 2 ? 'big' : 'small';
    var frame = 'stand';
    if (P.dead) frame = 'die';
    else if (!P.onGround && !(G.goal && G.goal.P === P && G.goal.phase !== 'walk')) frame = 'jump';
    else if (Math.abs(P.vx) > 0.1 || (G.goal && G.goal.phase === 'walk')) frame = (Math.floor(P.anim) % 2) ? 'walk2' : 'walk1';
    var img = BC.kiko(form, frame, P.face < 0, P.i === 1);
    ctx.drawImage(img, Math.round(P.x - 2 - cam), Math.round(P.y + P.h - img.height + OY));
  }

  function drawEnemy(ctx, e, cam) {
    if (!e.active) return;
    var X = Math.round(e.x - 1 - cam), Y = Math.round(e.y + e.h - 16 + OY);
    if (X < -20 || X > W + 4) return;
    if (e.dead === 'squash') { ctx.drawImage(BC.enemy('squash', 0, false), X, Y); return; }
    var img = BC.enemy(e.kind, (e.t >> 3) % 2, e.face < 0);
    if (e.dead === 'flip') {
      ctx.save();
      ctx.translate(X, Y + 16);
      ctx.scale(1, -1);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
      return;
    }
    if (e.kind === 'frog' && !e.onGround) img = BC.enemy('frog', 1, e.face < 0);
    ctx.drawImage(img, X, Y);
  }

  function drawItem(ctx, it, cam) {
    var img = BC.ITEM[it.kind];
    ctx.drawImage(img, Math.round(it.x - 1 - cam), Math.round(it.y - 2 + OY));
  }

  function drawPlay(ctx) {
    var cam = Math.round(G.cam);
    drawBackground(ctx, G.world, cam);
    G.items.forEach(function (it) { if (it.rise > 0) drawItem(ctx, it, cam); });
    drawTiles(ctx, cam);
    var tiles = BC.tiles(G.world);
    G.plats.forEach(function (p) {
      for (var i = 0; i < 3; i++) ctx.drawImage(tiles.plank, Math.round(p.x + i * T - cam), Math.round(p.y + OY));
    });
    drawPoles(ctx, cam);
    G.items.forEach(function (it) { if (!it.rise) drawItem(ctx, it, cam); });
    G.enemies.forEach(function (e) { drawEnemy(ctx, e, cam); });
    G.fireballs.forEach(function (f) { ctx.drawImage(BC.FIREBALL[(f.t >> 2) % 2], Math.round(f.x - cam), Math.round(f.y + OY)); });
    G.players.forEach(function (P) { drawPlayer(ctx, P, cam); });
    var debris = BC.DEBRIS(G.world);
    G.fx.forEach(function (f) {
      var X = Math.round(f.x - cam), Y = Math.round(f.y + OY);
      if (f.type === 'debris') ctx.drawImage(debris, X, Y);
      else if (f.type === 'coin') ctx.drawImage(BC.COIN[(f.t >> 2) & 3], X, Y);
      else ctx.drawImage(BC.SPARKLE[Math.min(2, f.t >> 2)], X, Y);
    });
    G.pops.forEach(function (p) {
      BC.text(ctx, p.text, Math.round(p.x - cam + 7), Math.round(p.y + OY - 6), '#101010', 1, 'center');
      BC.text(ctx, p.text, Math.round(p.x - cam + 6), Math.round(p.y + OY - 7), '#ffffff', 1, 'center');
    });
    drawHud(ctx);
    if (G.goal && G.goal.phase === 'done') {
      BC.text(ctx, 'LEVEL CLEAR!', W / 2 + 1, 81, '#101010', 2, 'center');
      BC.text(ctx, 'LEVEL CLEAR!', W / 2, 80, '#ffd23f', 2, 'center');
    }
    var P2 = G.players[1];
    if (P2 && !P2.present && !P2.benched && BC.platform.tv && !BC.phones[2] && G.t < 600) {
      BC.text(ctx, 'PLAYER 2: CONNECT A PHONE IN TITLE > PHONE CONTROLLER', W / 2, H - 10, '#ffffff', 1, 'center');
    }
    if (G.paused) drawPause(ctx);
  }

  function drawHud(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, 10);
    BC.text(ctx, 'SCORE ' + pad(G.score, 6), 4, 2, '#ffffff');
    ctx.drawImage(BC.COIN[0], 92, 1, 8, 8);
    BC.text(ctx, 'x' + pad(G.coins, 2), 101, 2, '#ffffff');
    BC.text(ctx, 'WORLD ' + LEVELS[G.level].name, 150, 2, '#ffffff');
    BC.text(ctx, 'TIME ' + pad(G.time, 3), 236, 2, G.time <= 60 && (G.t >> 4) % 2 ? '#ff7060' : '#ffffff');
    ctx.drawImage(BC.ICON_LIFE, 320, 0, 10, 10);
    BC.text(ctx, 'x' + G.lives, 332, 2, '#ffffff');
    var P2 = G.players[1];
    if (P2 && P2.present) ctx.drawImage(BC.ICON_LIFE2, 360, 0, 10, 10);
  }

  function panel(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(10,8,20,0.82)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
  }

  function drawPause(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);
    panel(ctx, 112, 54, 160, 108);
    BC.text(ctx, 'PAUSED', W / 2, 64, '#ffd23f', 2, 'center');
    for (var i = 0; i < PAUSE_ITEMS.length; i++) {
      var sel = i === G.pauseSel;
      BC.text(ctx, PAUSE_ITEMS[i], 150, 94 + i * 18, sel ? '#ffffff' : '#9c9cb0');
      if (sel) ctx.drawImage(BC.kiko('small', (sceneT >> 3) % 2 ? 'walk1' : 'walk2', false), 128, 89 + i * 18);
    }
    BC.text(ctx, 'BACK: CONTINUE', W / 2, 150, '#9c9cb0', 1, 'center');
  }

  // ------------------------------------------------------------------ other screens
  function titleTitle(ctx, y) {
    var s = "KIKO'S QUEST";
    BC.text(ctx, s, W / 2 + 2, y + 2, '#2a1606', 4, 'center');
    BC.text(ctx, s, W / 2, y, '#ffd23f', 4, 'center');
  }

  function shadowText(ctx, str, x, y, color) {
    BC.text(ctx, str, x + 1, y + 1, '#1a0e04', 1, 'center');
    BC.text(ctx, str, x, y, color, 1, 'center');
  }

  function drawScenery(ctx, world, cam) {
    drawBackground(ctx, world, cam);
    var tiles = BC.tiles(world);
    for (var x = -(cam % T); x < W; x += T) {
      ctx.drawImage(tiles.surface, x, 11 * T + OY);
      ctx.drawImage(tiles.ground, x, 12 * T + OY);
    }
  }

  function drawTitle(ctx) {
    drawScenery(ctx, 0, sceneT * 0.5);
    titleTitle(ctx, 14);
    BC.text(ctx, 'A LITTLE FOX, A BIG ADVENTURE', W / 2, 48, '#2a1606', 1, 'center');
    // Kiko and Miko trotting along
    var fr = (sceneT >> 3) % 2 ? 'walk1' : 'walk2';
    ctx.drawImage(BC.kiko('big', fr, false), 40, 11 * T + OY - 24);
    ctx.drawImage(BC.kiko('small', fr, false, true), 16, 11 * T + OY - 16);
    ctx.drawImage(BC.enemy('beetle', (sceneT >> 3) % 2, true), 330, 11 * T + OY - 16);
    panel(ctx, 72, 58, 240, 116);
    for (var i = 0; i < TITLE_ITEMS.length; i++) {
      var label = TITLE_ITEMS[i];
      if (i === M_LEVEL) label = 'LEVEL  < ' + LEVELS[menu.level].name + ' >';
      if (i === M_MUSIC) label = 'MUSIC  ' + (save.music ? 'ON' : 'OFF');
      if (i === M_SOUND) label = 'SOUND  ' + (save.muted ? 'OFF' : 'ON');
      var sel = i === menu.sel;
      var y = 66 + i * 13;
      BC.text(ctx, label, 140, y, sel ? '#ffffff' : '#9c9cb0');
      if (sel) ctx.drawImage(BC.kiko('small', fr, false), 118, y - 5);
    }
    var hint = '';
    if (menu.sel === M_LEVEL) hint = 'LEFT/RIGHT TO CHOOSE. ' + WORLD_NAMES[LEVELS[menu.level].world];
    else if (menu.sel === 1) hint = BC.platform.tv ? 'PLAYER 2 PLAYS ON A PHONE: SEE PHONE CONTROLLER' : 'PLAYER 2: WASD MOVE, W OR F JUMP, S THROWS';
    else if (menu.sel === M_PHONE) hint = 'USE PHONES AS GAME CONTROLLERS';
    else hint = 'OK OR UP: JUMP.  DOWN: THROW FIRE';
    ctx.fillStyle = '#3a3450';
    ctx.fillRect(80, 145, 224, 1);
    BC.text(ctx, hint, W / 2, 150, '#c8f0ff', 1, 'center');
    BC.text(ctx, 'HI-SCORE ' + save.hi, W / 2, 162, '#ffd23f', 1, 'center');
    var ph = [];
    if (BC.phones[1]) ph.push('P1');
    if (BC.phones[2]) ph.push('P2');
    if (ph.length) shadowText(ctx, 'PHONES CONNECTED: ' + ph.join(' '), W / 2, 194, '#c8f0ff');
    shadowText(ctx, 'ARROWS: CHOOSE   OK: SELECT   BACK: EXIT', W / 2, 205, '#ffffff');
  }

  function drawConnect(ctx) {
    ctx.fillStyle = '#141024';
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
      BC.text(ctx, 'PLAYER 1: ' + (BC.phones[1] ? 'PHONE CONNECTED' : 'TV REMOTE'), x, 136, '#f39a2b');
      BC.text(ctx, 'PLAYER 2: ' + (BC.phones[2] ? 'PHONE CONNECTED' : 'WAITING FOR A PHONE'), x, 150, '#5aa0f0');
      BC.text(ctx, 'PHONE: ARROWS MOVE, A JUMPS, DOWN THROWS FIRE', x, 168, '#c0c0d0');
    }
    BC.text(ctx, 'PRESS OK TO GO BACK', W / 2, 200, '#9c9cb0', 1, 'center');
  }

  function drawIntro(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    var L = LEVELS[G.level];
    BC.text(ctx, 'WORLD ' + L.name, W / 2, 54, '#ffffff', 2, 'center');
    BC.text(ctx, WORLD_NAMES[L.world], W / 2, 76, '#ffd23f', 1, 'center');
    ctx.drawImage(BC.kiko('small', 'stand', false), 166, 98);
    BC.text(ctx, 'x  ' + G.lives, 188, 103, '#ffffff');
    if (G.players[1]) ctx.drawImage(BC.kiko('small', 'stand', false, true), 146, 98);
    BC.text(ctx, 'SCORE ' + pad(G.score, 6), W / 2, 130, '#9c9cb0', 1, 'center');
    if (G.players[1] && BC.platform.tv && !BC.phones[2]) {
      var addr = BC.platform.address();
      var q = addr ? BC.qrCanvas(addr, 2) : null;
      if (q) {
        var qx = W - 56;
        ctx.drawImage(q, qx - (q.width >> 1), H - q.height - 10);
        BC.text(ctx, 'PLAYER 2: SCAN', qx, H - q.height - 32, '#5aa0f0', 1, 'center');
        BC.text(ctx, 'WITH A PHONE', qx, H - q.height - 22, '#5aa0f0', 1, 'center');
      }
    }
  }

  function drawOver(ctx) {
    drawScenery(ctx, G ? G.world : 0, 0);
    panel(ctx, 92, 60, 200, 96);
    BC.text(ctx, 'GAME OVER', W / 2, 74, '#ff7060', 3, 'center');
    BC.text(ctx, 'SCORE ' + G.score, W / 2, 108, '#ffffff', 1, 'center');
    BC.text(ctx, 'TRY WORLD ' + LEVELS[G.level].name + ' AGAIN FROM THE TITLE', W / 2, 124, '#c0c0d0', 1, 'center');
    if (sceneT > 50) BC.text(ctx, 'PRESS OK', W / 2, 140, '#ffd23f', 1, 'center');
  }

  function drawWin(ctx) {
    drawScenery(ctx, 3, sceneT * 0.3);
    panel(ctx, 52, 30, 280, 130);
    BC.text(ctx, 'YOU DID IT!', W / 2, 42, '#ffd23f', 3, 'center');
    var lines = BC.wrap('KIKO CROSSED THE MEADOWS, THE DUNES, THE CAVES AND THE STARRY SKY. THANK YOU FOR PLAYING!', 40);
    for (var i = 0; i < lines.length; i++) BC.text(ctx, lines[i], W / 2, 74 + i * 11, '#ffffff', 1, 'center');
    BC.text(ctx, 'FINAL SCORE ' + G.score, W / 2, 124, '#ffd23f', 1, 'center');
    if (sceneT > 50) BC.text(ctx, 'PRESS OK', W / 2, 142, '#c0c0d0', 1, 'center');
    var fr = (sceneT >> 3) % 2 ? 'walk1' : 'jump';
    ctx.drawImage(BC.kiko('fire', fr, false), 170, 11 * T + OY - 24 - ((sceneT >> 4) % 2) * 6);
    if (G.players[1]) ctx.drawImage(BC.kiko('fire', fr, true, true), 198, 11 * T + OY - 24);
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
        case 'intro': updateIntro(); break;
        case 'play': updatePlay(); break;
        case 'over': case 'win': updateEnd(); break;
      }
    },
    render: function (ctx) {
      switch (scene) {
        case 'title': drawTitle(ctx); break;
        case 'connect': drawConnect(ctx); break;
        case 'intro': drawIntro(ctx); break;
        case 'play': drawPlay(ctx); break;
        case 'over': drawOver(ctx); break;
        case 'win': drawWin(ctx); break;
      }
    },
    // Pause when the app goes to the background.
    pause: function () { if (scene === 'play') pauseGame(); },
    scene: function () { return scene; },
    // Test hooks (used by the automated checks).
    debug: {
      state: function () { return G; },
      unlockAll: function () { save.best = LEVELS.length - 1; },
      startLevel: function (mode, index) { newGame(mode || 1, index || 0); buildLevel(); go('play'); },
      give: function (i, form) { setForm(G.players[i || 0], form); },
      kill: function (i) { killPlayer(G.players[i || 0]); },
      teleport: function (i, col, row) {
        var P = G.players[i || 0];
        P.x = col * T + 2; P.y = row * T + T - P.h; P.vx = 0; P.vy = 0;
        G.cam = clamp(P.x - W * 0.4, 0, G.LW * T - W);
      },
      tile: function (cx, cy) { return tile(cx, cy); }
    }
  };
})();
