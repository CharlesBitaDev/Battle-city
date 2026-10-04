// Game rules, stages and screens.
var BC = window.BC || (window.BC = {});

(function () {
  'use strict';

  var W = 384, H = 216;           // logical screen (16:9)
  var FX = 88, FY = 4;            // battlefield position on screen
  var N = 26;                     // cells per side (8px each), field is 208x208
  var EMPTY = 0, BRICK = 1, STEEL = 2, WATER = 3, TREES = 4, ICE = 5;
  var CHARS = { '.': EMPTY, '#': BRICK, '@': STEEL, '~': WATER, '%': TREES, '-': ICE };
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  var ETYPE = { b: 0, f: 1, p: 2, a: 3 };
  var ESPEC = [
    { speed: 0.55, bspeed: 2.4, hp: 1, pts: 100 },  // basic
    { speed: 1.3, bspeed: 2.6, hp: 1, pts: 200 },   // fast
    { speed: 0.8, bspeed: 4.2, hp: 1, pts: 300 },   // power (fast shells)
    { speed: 0.6, bspeed: 2.8, hp: 4, pts: 400 }    // armour (4 hits)
  ];
  var PLAYER_SPEED = 0.9;
  var RING = [[11, 23], [12, 23], [13, 23], [14, 23], [11, 24], [11, 25], [14, 24], [14, 25]];
  var ENEMY_SPAWN_X = [96, 192, 0];
  var PLAYER_SPAWN = [[64, 192], [128, 192]];
  var BASE_X = 96, BASE_Y = 192;
  var POWERS = ['helmet', 'clock', 'shovel', 'star', 'grenade', 'tank'];
  var STAGES = BC.LEVELS.length;
  var GREY = '#636363';

  var scene = 'title';
  var sceneT = 0;
  var G = null;          // the current game
  var menu = { sel: 0, stage: 1 };
  var save = { best: 1, hi: 20000, muted: false };

  function rnd(n) { return Math.floor(Math.random() * n); }
  function playerPal(i) { return i ? 'p2' : 'p1'; }
  function sfx(n) { BC.audio.play(n); }

  // ------------------------------------------------------------------ saving
  function loadSave() {
    var s = BC.platform.load('battlecity-save');
    if (s) {
      try {
        var o = JSON.parse(s);
        if (o.best) save.best = Math.max(1, Math.min(STAGES, o.best | 0));
        if (o.hi) save.hi = o.hi | 0;
        save.muted = !!o.muted;
      } catch (e) { /* ignore */ }
    }
    menu.stage = save.best;
    BC.audio.setMuted(save.muted);
  }
  function writeSave() {
    BC.platform.save('battlecity-save', JSON.stringify(save));
  }

  // ------------------------------------------------------------------ scenes
  function go(s) {
    scene = s;
    sceneT = 0;
    BC.input.clearNav();
    BC.platform.broadcast(s === 'play' ? 'mode:game' : 'mode:menu');
  }

  function newGame(mode, stage) {
    G = {
      mode: mode,
      stage: stage,
      players: [mkPlayer(0), mode === 2 ? mkPlayer(1) : null]
    };
    startIntro();
  }

  function mkPlayer(i) {
    return { i: i, lives: 3, score: 0, level: 0, tank: null, kills: [0, 0, 0, 0], nextLife: 20000, out: false, respawn: 0 };
  }

  function startIntro() {
    G.snapshot = G.players.map(function (P) {
      return P ? { lives: P.lives, score: P.score, level: P.level, out: P.out, nextLife: P.nextLife } : null;
    });
    go('intro');
    sfx('start');
  }

  function restartStage() {
    G.players.forEach(function (P, i) {
      if (!P) return;
      var s = G.snapshot[i];
      P.lives = s.lives; P.score = s.score; P.level = s.level; P.out = s.out; P.nextLife = s.nextLife;
    });
    startIntro();
  }

  // ------------------------------------------------------------------ stage setup
  function buildStage() {
    var L = BC.LEVELS[(G.stage - 1) % STAGES];
    G.map = new Uint8Array(N * N);
    G.bq = new Uint8Array(N * N);   // brick quarters left: 1 top-left, 2 top-right, 4 bottom-left, 8 bottom-right
    G.water = [];
    G.waterFrame = 0;
    G.ground = BC.canvas(208, 208);
    G.gctx = G.ground.getContext('2d');
    G.treeLayer = BC.canvas(208, 208);
    var tctx = G.treeLayer.getContext('2d');
    for (var i = 0; i < N * N; i++) {
      var v = CHARS[L.m.charAt(i)] || EMPTY;
      G.map[i] = v;
      G.bq[i] = v === BRICK ? 15 : 0;
      var cx = i % N, cy = (i / N) | 0;
      if (v === WATER) G.water.push(i);
      if (v === TREES) tctx.drawImage(BC.CELLS.trees, cx * 8, cy * 8);
      drawCell(cx, cy);
    }
    G.queue = L.o;
    G.qi = 0;
    G.tanks = [];
    G.bullets = [];
    G.fx = [];
    G.popups = [];
    G.power = null;
    G.freeze = 0;
    G.shovel = 0;
    G.spawnIdx = 0;
    G.spawnTimer = 30;
    G.baseAlive = true;
    G.lost = false;
    G.endTimer = 0;
    G.overTimer = 0;
    G.frame = 0;
    G.paused = false;
    G.pauseSel = 0;
    var s = G.stage;
    G.speedMul = 1 + Math.min(0.3, s * 0.003);
    G.smart = Math.min(0.75, 0.12 + s * 0.0065);
    G.fireChance = Math.min(0.045, 0.008 + s * 0.0004);
    G.spawnInterval = Math.max(70, 190 - s * 1.3) * (G.mode === 2 ? 0.8 : 1);
    G.maxOnField = G.mode === 2 ? 6 : 4;
    G.players.forEach(function (P) {
      if (!P) return;
      P.kills = [0, 0, 0, 0];
      P.tank = null;
      P.respawn = 0;
      if (!P.out) spawnPlayer(P);
    });
  }

  function drawCell(cx, cy) {
    var x = G.gctx;
    var v = G.map[cy * N + cx];
    x.clearRect(cx * 8, cy * 8, 8, 8);
    if (v === BRICK) {
      var m = G.bq[cy * N + cx];
      if (m === 15) x.drawImage(BC.CELLS.brick, cx * 8, cy * 8);
      else {
        for (var q = 0; q < 4; q++) {
          if (!(m & (1 << q))) continue;
          var qx = (q & 1) * 4, qy = (q >> 1) * 4;
          x.drawImage(BC.CELLS.brick, qx, qy, 4, 4, cx * 8 + qx, cy * 8 + qy, 4, 4);
        }
      }
    } else if (v === STEEL) x.drawImage(BC.CELLS.steel, cx * 8, cy * 8);
    else if (v === WATER) x.drawImage(BC.CELLS.water[G.waterFrame], cx * 8, cy * 8);
    else if (v === ICE) x.drawImage(BC.CELLS.ice, cx * 8, cy * 8);
  }

  function setCell(cx, cy, v) {
    G.map[cy * N + cx] = v;
    G.bq[cy * N + cx] = v === BRICK ? 15 : 0;
    drawCell(cx, cy);
  }

  function setRing(v) {
    for (var i = 0; i < RING.length; i++) {
      var c = RING[i];
      var ci = c[1] * N + c[0];
      if (G.map[ci] !== v || (v === BRICK && G.bq[ci] !== 15)) setCell(c[0], c[1], v);
    }
  }

  // ------------------------------------------------------------------ tanks
  function newTank(isPlayer) {
    return {
      isPlayer: isPlayer, pi: 0, etype: 0, x: 0, y: 0, dir: 0, speed: PLAYER_SPEED,
      bspeed: 2.6, maxBullets: 1, steel: false, bulletsOut: 0, hp: 1, bonus: false,
      spawn: 50, shield: 0, frozen: 0, slide: 0, anim: 0, moving: false, dead: false,
      ai: 0, blocked: 0, fireCd: 0, autoCd: 0
    };
  }

  function applyLevel(t, level) {
    t.bspeed = level >= 1 ? 4.2 : 2.6;
    t.maxBullets = level >= 2 ? 2 : 1;
    t.steel = level >= 3;
  }

  function spawnPlayer(P) {
    var t = newTank(true);
    t.pi = P.i;
    t.x = PLAYER_SPAWN[P.i][0];
    t.y = PLAYER_SPAWN[P.i][1];
    applyLevel(t, P.level);
    P.tank = t;
    G.tanks.push(t);
  }

  function areaBusy(x, y) {
    for (var i = 0; i < G.tanks.length; i++) {
      var o = G.tanks[i];
      if (!o.dead && Math.abs(o.x - x) < 16 && Math.abs(o.y - y) < 16) return true;
    }
    return false;
  }

  function enemiesOnField() {
    var n = 0;
    for (var i = 0; i < G.tanks.length; i++) if (!G.tanks[i].isPlayer && !G.tanks[i].dead) n++;
    return n;
  }

  function spawnEnemy() {
    if (G.qi >= G.queue.length) return true;
    if (enemiesOnField() >= G.maxOnField) return false;
    for (var k = 0; k < 3; k++) {
      var idx = (G.spawnIdx + k) % 3;
      var x = ENEMY_SPAWN_X[idx];
      if (areaBusy(x, 0)) continue;
      var t = newTank(false);
      t.etype = ETYPE[G.queue.charAt(G.qi)] || 0;
      var spec = ESPEC[t.etype];
      t.x = x;
      t.y = 0;
      t.dir = 2;
      t.hp = spec.hp;
      t.speed = spec.speed * G.speedMul;
      t.bspeed = spec.bspeed;
      t.maxBullets = (G.stage > 60 && t.etype >= 2) ? 2 : 1;
      t.bonus = G.qi === 3 || G.qi === 10 || G.qi === 17;
      t.ai = 30;
      t.fireCd = 45;
      if (t.bonus) G.power = null;
      G.tanks.push(t);
      G.qi++;
      G.spawnIdx = (idx + 1) % 3;
      return true;
    }
    return false;
  }

  function terrainBlocks(x, y) {
    if (x < 0 || y < 0 || x > 192 || y > 192) return true;
    var x0 = Math.floor(x / 8), y0 = Math.floor(y / 8);
    var x1 = Math.floor((x + 15.99) / 8), y1 = Math.floor((y + 15.99) / 8);
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        var v = G.map[cy * N + cx];
        if (v === STEEL || v === WATER) return true;
        if (v === BRICK) {
          var m = G.bq[cy * N + cx];
          if (m === 15) return true;
          for (var q = 0; q < 4; q++) {
            if (!(m & (1 << q))) continue;
            var qx = cx * 8 + (q & 1) * 4, qy = cy * 8 + (q >> 1) * 4;
            if (qx < x + 16 && qx + 4 > x && qy < y + 16 && qy + 4 > y) return true;
          }
        }
        if (cx >= 12 && cx <= 13 && cy >= 24) return true; // the eagle
      }
    }
    return false;
  }

  function tankBlocks(t, x, y) {
    for (var i = 0; i < G.tanks.length; i++) {
      var o = G.tanks[i];
      if (o === t || o.dead) continue;
      if (Math.abs(o.x - x) < 16 && Math.abs(o.y - y) < 16 &&
          !(Math.abs(o.x - t.x) < 16 && Math.abs(o.y - t.y) < 16)) return true;
    }
    return false;
  }

  function moveTank(t, dist) {
    var moved = false;
    var stuck = terrainBlocks(t.x, t.y); // e.g. bricks restored on top of a tank
    while (dist > 0.0001) {
      var s = Math.min(dist, 0.5);
      var nx = t.x + DX[t.dir] * s, ny = t.y + DY[t.dir] * s;
      if (nx < 0 || ny < 0 || nx > 192 || ny > 192) break;
      if ((!stuck && terrainBlocks(nx, ny)) || tankBlocks(t, nx, ny)) break;
      t.x = nx;
      t.y = ny;
      dist -= s;
      moved = true;
    }
    if (moved) t.anim++;
    return moved;
  }

  function turn(t, d) {
    if (d === t.dir) return;
    if ((d & 1) !== (t.dir & 1)) {
      if (d & 1) t.y = Math.round(t.y / 8) * 8;
      else t.x = Math.round(t.x / 8) * 8;
    }
    t.dir = d;
  }

  function onIce(t) {
    var cx = Math.floor((t.x + 8) / 8), cy = Math.floor((t.y + 8) / 8);
    return G.map[cy * N + cx] === ICE;
  }

  function fire(t) {
    if (t.bulletsOut >= t.maxBullets) return false;
    G.bullets.push({
      x: t.x + 8 + DX[t.dir] * 7, y: t.y + 8 + DY[t.dir] * 7, dir: t.dir,
      speed: t.bspeed, owner: t, steel: t.steel, player: t.isPlayer, dead: false
    });
    t.bulletsOut++;
    if (t.isPlayer) sfx('shoot');
    return true;
  }

  // Player input; in a 1-player game either phone can drive player 1.
  function playerInput(i) {
    var inp = BC.input;
    if (G.mode === 1) {
      var d = inp.dir(0);
      if (d < 0) d = inp.dir(1);
      var e0 = inp.fireEdge(0), e1 = inp.fireEdge(1);
      return { d: d, fire: inp.fireHeld(0) || inp.fireHeld(1), edge: e0 || e1 };
    }
    return { d: inp.dir(i), fire: inp.fireHeld(i), edge: inp.fireEdge(i) };
  }

  function updatePlayer(P) {
    if (P.out) return;
    var t = P.tank;
    if (!t) {
      if (G.lost) return;
      if (P.respawn > 0) { P.respawn--; return; }
      if (P.lives > 0) { P.lives--; spawnPlayer(P); }
      else { P.out = true; checkAllOut(); }
      return;
    }
    var inp = playerInput(P.i);
    if (t.spawn > 0) {
      t.spawn--;
      if (t.spawn === 0) t.shield = Math.max(t.shield, 180);
      return;
    }
    if (t.shield > 0) t.shield--;
    if (G.lost) return;
    if (t.frozen > 0) { t.frozen--; t.moving = false; return; }
    if (inp.d >= 0) {
      turn(t, inp.d);
      moveTank(t, PLAYER_SPEED);
      t.moving = true;
      t.slide = 22;
    } else if (t.slide > 0 && onIce(t)) {
      t.slide--;
      moveTank(t, PLAYER_SPEED);
    } else {
      t.slide = 0;
      t.moving = false;
    }
    if (t.autoCd > 0) t.autoCd--;
    if (inp.edge || (inp.fire && t.autoCd <= 0)) {
      if (fire(t)) t.autoCd = 16;
    }
    // power-up pickup
    var pw = G.power;
    if (pw && Math.abs(pw.x - t.x) < 13 && Math.abs(pw.y - t.y) < 13) {
      G.power = null;
      applyPower(P, t, pw.kind);
    }
  }

  function updateEnemy(t) {
    if (t.spawn > 0) { t.spawn--; return; }
    if (G.freeze > 0) { t.moving = false; return; }
    t.ai--;
    var moved = moveTank(t, t.speed);
    t.moving = moved;
    t.blocked = moved ? 0 : t.blocked + 1;
    if (t.ai <= 0 || (t.blocked > 0 && Math.random() < 0.08)) {
      pickDir(t);
      t.ai = 40 + rnd(140);
    }
    if (t.fireCd > 0) t.fireCd--;
    if (t.fireCd <= 0 && t.bulletsOut < t.maxBullets) {
      var chance = G.fireChance;
      if (t.blocked > 0) chance *= 4;
      var aim = aimed(t);
      if (aim === 2) chance *= 6;
      else if (aim === 1) chance *= G.stage < 20 ? 2 : 3;
      if (Math.random() < chance && fire(t)) t.fireCd = 18;
    }
  }

  function targets() {
    var list = [{ x: BASE_X + 8, y: BASE_Y + 8 }];
    G.players.forEach(function (P) {
      if (P && P.tank && !P.tank.dead) list.push({ x: P.tank.x + 8, y: P.tank.y + 8 });
    });
    return list;
  }

  function aimed(t) {
    var cx = t.x + 8, cy = t.y + 8;
    var list = targets();
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (i === 0 && cy < 104) continue; // only aim at the base from the lower half
      var hit = (t.dir === 0 && Math.abs(p.x - cx) < 6 && p.y < cy) ||
                (t.dir === 2 && Math.abs(p.x - cx) < 6 && p.y > cy) ||
                (t.dir === 1 && Math.abs(p.y - cy) < 6 && p.x > cx) ||
                (t.dir === 3 && Math.abs(p.y - cy) < 6 && p.x < cx);
      if (hit) return i === 0 ? 1 : 2;   // 1 = the base, 2 = a player
    }
    return 0;
  }

  function pickDir(t) {
    var d;
    if (Math.random() < G.smart) {
      var list = targets();
      var p = (list.length > 1 && Math.random() < 0.35) ? list[1 + rnd(list.length - 1)] : list[0];
      var dx = p.x - (t.x + 8), dy = p.y - (t.y + 8);
      var horiz = Math.abs(dx) > Math.abs(dy) ? Math.random() < 0.75 : Math.random() < 0.25;
      if (horiz) d = dx > 0 ? 1 : 3;
      else d = dy > 0 ? 2 : 0;
    } else {
      d = [2, 2, 1, 3, 0, 1, 3][rnd(7)];
    }
    if (d === t.dir && t.blocked > 0) d = (d + (Math.random() < 0.5 ? 1 : 3)) % 4;
    turn(t, d);
  }

  // ------------------------------------------------------------------ bullets
  function killBullet(b) {
    if (b.dead) return;
    b.dead = true;
    b.owner.bulletsOut = Math.max(0, b.owner.bulletsOut - 1);
  }

  function updateBullet(b) {
    var steps = Math.ceil(b.speed);
    var step = b.speed / steps;
    for (var i = 0; i < steps && !b.dead; i++) {
      b.x += DX[b.dir] * step;
      b.y += DY[b.dir] * step;
      if (bulletHits(b)) killBullet(b);
    }
  }

  function bulletHits(b) {
    if (b.x < 1 || b.y < 1 || b.x > 207 || b.y > 207) {
      boom(Math.max(0, Math.min(208, b.x)), Math.max(0, Math.min(208, b.y)), false);
      if (b.player) sfx('steel');
      return true;
    }
    if (G.baseAlive && b.x >= BASE_X && b.x < BASE_X + 16 && b.y >= BASE_Y && b.y < BASE_Y + 16) {
      destroyBase();
      return true;
    }
    if (hitTerrain(b)) return true;
    for (var i = 0; i < G.tanks.length; i++) {
      var t = G.tanks[i];
      if (t.dead || t === b.owner || t.spawn > 0) continue;
      if (b.x < t.x - 1 || b.x >= t.x + 17 || b.y < t.y - 1 || b.y >= t.y + 17) continue;
      if (!b.player && !t.isPlayer) continue;          // enemy shells pass enemies
      if (b.player && t.isPlayer) {                     // friendly fire freezes
        if (t.shield <= 0) t.frozen = 150;
        boom(b.x, b.y, false);
        return true;
      }
      boom(b.x, b.y, false);
      if (t.shield > 0) return true;
      damage(t, b.owner);
      return true;
    }
    for (var j = 0; j < G.bullets.length; j++) {
      var o = G.bullets[j];
      if (o === b || o.dead || o.player === b.player) continue;
      if (Math.abs(o.x - b.x) < 4 && Math.abs(o.y - b.y) < 4) {
        killBullet(o);
        return true;
      }
    }
    return false;
  }

  // A shell removes a 4px-deep strip of brick across its path (two hits per brick cell).
  function hitTerrain(b) {
    var list = [];
    var bits, a0, a1, k, c;
    if (b.dir === 0 || b.dir === 2) {
      var fy = b.y + DY[b.dir] * 1.5;
      c = Math.floor(fy / 8);
      bits = (Math.floor(fy / 4) & 1) ? 12 : 3;     // bottom or top half of the cell
      a0 = Math.floor((b.x - 4) / 8); a1 = Math.floor((b.x + 3.99) / 8);
      for (k = a0; k <= a1; k++) list.push(k, c);
    } else {
      var fx = b.x + DX[b.dir] * 1.5;
      c = Math.floor(fx / 8);
      bits = (Math.floor(fx / 4) & 1) ? 10 : 5;     // right or left half of the cell
      a0 = Math.floor((b.y - 4) / 8); a1 = Math.floor((b.y + 3.99) / 8);
      for (k = a0; k <= a1; k++) list.push(c, k);
    }
    var hit = false;
    var i, cx, cy, v, idx;
    for (i = 0; i < list.length; i += 2) {
      cx = list[i]; cy = list[i + 1];
      if (cx < 0 || cy < 0 || cx >= N || cy >= N) continue;
      idx = cy * N + cx;
      v = G.map[idx];
      if (v === STEEL || (v === BRICK && (G.bq[idx] & bits))) hit = true;
    }
    if (!hit) return false;
    var broke = false;
    for (i = 0; i < list.length; i += 2) {
      cx = list[i]; cy = list[i + 1];
      if (cx < 0 || cy < 0 || cx >= N || cy >= N) continue;
      idx = cy * N + cx;
      v = G.map[idx];
      if (v === BRICK) {
        // remove the strip the shell reached; if that side is gone already, the next strip
        var m = G.bq[idx];
        if (m & bits) m &= ~bits;
        if (!m) setCell(cx, cy, EMPTY);
        else { G.bq[idx] = m; drawCell(cx, cy); }
        broke = true;
      } else if (v === STEEL && b.steel) {
        setCell(cx, cy, EMPTY);
        broke = true;
      }
    }
    boom(b.x, b.y, false);
    if (b.player) sfx(broke ? 'brick' : 'steel');
    return true;
  }

  // ------------------------------------------------------------------ damage
  function damage(t, by) {
    if (t.isPlayer) { killPlayer(t); return; }
    if (t.bonus) { t.bonus = false; spawnPower(); }
    t.hp--;
    if (t.hp > 0) { sfx('hit'); return; }
    t.dead = true;
    boom(t.x + 8, t.y + 8, true);
    sfx('boom');
    if (by && by.isPlayer) {
      var P = G.players[by.pi];
      var pts = ESPEC[t.etype].pts;
      P.kills[t.etype]++;
      addScore(P, pts);
      G.popups.push({ x: t.x + 8, y: t.y + 5, text: String(pts), t: 50 });
    }
  }

  function killPlayer(t) {
    t.dead = true;
    boom(t.x + 8, t.y + 8, true);
    sfx('bigboom');
    var P = G.players[t.pi];
    P.tank = null;
    P.level = 0;
    P.respawn = 90;
    BC.platform.toPhone(t.pi + 1, 'buzz:400');
    if (G.mode === 1) BC.platform.toPhone(2, 'buzz:400');
  }

  function checkAllOut() {
    var any = false;
    G.players.forEach(function (P) { if (P && !P.out) any = true; });
    if (!any) lose();
  }

  function destroyBase() {
    if (!G.baseAlive) return;
    G.baseAlive = false;
    boom(BASE_X + 8, BASE_Y + 8, true);
    sfx('bigboom');
    lose();
  }

  function lose() {
    if (G.lost) return;
    G.lost = true;
    G.overTimer = 220;
    BC.platform.broadcast('buzz:600');
  }

  function addScore(P, n) {
    P.score += n;
    if (P.score >= P.nextLife) {
      P.nextLife += 20000;
      P.lives++;
      sfx('life');
    }
  }

  function boom(x, y, big) {
    G.fx.push({ x: x, y: y, big: big, t: 0 });
  }

  // ------------------------------------------------------------------ power-ups
  function spawnPower() {
    var x, y, tries = 0;
    do {
      x = rnd(25) * 8;
      y = rnd(23) * 8;
      tries++;
    } while (tries < 30 && Math.abs(x - BASE_X) < 24 && y > 168);
    G.power = { kind: POWERS[rnd(POWERS.length)], x: Math.min(192, x), y: Math.min(192, y), t: 0 };
    sfx('bonus');
  }

  function applyPower(P, t, kind) {
    addScore(P, 500);
    G.popups.push({ x: t.x + 8, y: t.y + 5, text: '500', t: 50 });
    if (kind === 'helmet') t.shield = 600;
    else if (kind === 'clock') G.freeze = 600;
    else if (kind === 'shovel') { G.shovel = 1200; if (G.baseAlive) setRing(STEEL); }
    else if (kind === 'star') { P.level = Math.min(3, P.level + 1); applyLevel(t, P.level); }
    else if (kind === 'grenade') {
      for (var i = 0; i < G.tanks.length; i++) {
        var e = G.tanks[i];
        if (!e.isPlayer && !e.dead) { e.dead = true; boom(e.x + 8, e.y + 8, true); }
      }
      sfx('bigboom');
    } else if (kind === 'tank') P.lives++;
    sfx(kind === 'tank' ? 'life' : 'pick');
  }

  // ------------------------------------------------------------------ play update
  function updatePlay() {
    var navs = BC.input.takeNav();
    if (G.paused) { updatePause(navs); return; }
    for (var n = 0; n < navs.length; n++) {
      if (navs[n].b === 'back' && !G.lost) {
        G.paused = true;
        G.pauseSel = 0;
        sfx('pause');
        BC.platform.broadcast('mode:menu');
        return;
      }
    }
    G.frame++;
    if (G.frame % 40 === 0) {
      G.waterFrame ^= 1;
      for (var w = 0; w < G.water.length; w++) {
        var wi = G.water[w];
        if (G.map[wi] === WATER) drawCell(wi % N, (wi / N) | 0);
      }
    }
    if (G.freeze > 0) G.freeze--;
    if (G.shovel > 0) {
      G.shovel--;
      if (G.baseAlive) {
        if (G.shovel === 0) setRing(BRICK);
        else if (G.shovel < 180 && G.shovel % 15 === 0) setRing(((G.shovel / 15) & 1) ? BRICK : STEEL);
      }
    }
    if (!G.lost && --G.spawnTimer <= 0) {
      G.spawnTimer = spawnEnemy() ? G.spawnInterval : 20;
    }
    var i;
    for (i = 0; i < G.players.length; i++) if (G.players[i]) updatePlayer(G.players[i]);
    for (i = 0; i < G.tanks.length; i++) {
      var t = G.tanks[i];
      if (!t.dead && !t.isPlayer) updateEnemy(t);
    }
    for (i = 0; i < G.bullets.length; i++) if (!G.bullets[i].dead) updateBullet(G.bullets[i]);
    G.bullets = G.bullets.filter(function (b) { return !b.dead; });
    G.tanks = G.tanks.filter(function (t) { return !t.dead; });
    if (G.power) {
      G.power.t++;
      if (G.power.t > 60 * 25) G.power = null;
    }
    for (i = 0; i < G.fx.length; i++) G.fx[i].t++;
    G.fx = G.fx.filter(function (f) { return f.t < (f.big ? 26 : 12); });
    for (i = 0; i < G.popups.length; i++) { G.popups[i].t--; G.popups[i].y -= 0.15; }
    G.popups = G.popups.filter(function (p) { return p.t > 0; });

    if (G.lost) {
      if (--G.overTimer <= 0) finishStage(false);
    } else if (!G.endTimer && G.qi >= G.queue.length && enemiesOnField() === 0) {
      G.endTimer = 150;
    } else if (G.endTimer && --G.endTimer <= 0) {
      finishStage(true);
    }
  }

  var PAUSE_ITEMS = ['RESUME', 'RESTART STAGE', 'QUIT TO MENU'];
  function updatePause(navs) {
    for (var n = 0; n < navs.length; n++) {
      var b = navs[n].b;
      if (b === 'up') { G.pauseSel = (G.pauseSel + 2) % 3; sfx('move'); }
      else if (b === 'down') { G.pauseSel = (G.pauseSel + 1) % 3; sfx('move'); }
      else if (b === 'back' || (b === 'ok' && G.pauseSel === 0)) {
        G.paused = false;
        BC.input.clearEdges();
        BC.platform.broadcast('mode:game');
        return;
      } else if (b === 'ok' && G.pauseSel === 1) { sfx('select'); restartStage(); return; }
      else if (b === 'ok' && G.pauseSel === 2) { sfx('select'); G = null; go('title'); return; }
    }
  }

  function finishStage(cleared) {
    G.result = cleared ? 'clear' : 'over';
    G.players.forEach(function (P) { if (P && P.score > save.hi) save.hi = P.score; });
    if (cleared) {
      save.best = Math.max(save.best, Math.min(STAGES, G.stage + 1));
      menu.stage = Math.min(STAGES, G.stage + 1);
    }
    writeSave();
    G.tallyStep = 0;
    go('tally');
    if (cleared) sfx('clear');
  }

  // ------------------------------------------------------------------ other scenes
  var TITLE_ITEMS = ['1 PLAYER', '2 PLAYERS', 'STAGE', 'PHONE CONTROLLER', 'SOUND'];

  function updateTitle() {
    var navs = BC.input.takeNav();
    for (var n = 0; n < navs.length; n++) {
      var b = navs[n].b;
      if (b === 'up') { menu.sel = (menu.sel + TITLE_ITEMS.length - 1) % TITLE_ITEMS.length; sfx('move'); }
      else if (b === 'down') { menu.sel = (menu.sel + 1) % TITLE_ITEMS.length; sfx('move'); }
      else if ((b === 'left' || b === 'right') && menu.sel === 2) {
        var d = b === 'left' ? -1 : 1;
        menu.stage += d;
        if (menu.stage < 1) menu.stage = save.best;
        if (menu.stage > save.best) menu.stage = 1;
        sfx('move');
      } else if ((b === 'left' || b === 'right') && menu.sel === 4) {
        toggleSound();
      } else if (b === 'ok') {
        BC.audio.unlock();
        if (menu.sel === 0 || menu.sel === 1) { sfx('select'); newGame(menu.sel + 1, menu.stage); return; }
        if (menu.sel === 2) { menu.stage = menu.stage >= save.best ? 1 : menu.stage + 1; sfx('move'); }
        if (menu.sel === 3) { sfx('select'); go('connect'); return; }
        if (menu.sel === 4) toggleSound();
      } else if (b === 'back') {
        BC.platform.exit();
      }
    }
  }

  function toggleSound() {
    save.muted = !save.muted;
    BC.audio.setMuted(save.muted);
    writeSave();
    sfx('select');
  }

  function updateConnect() {
    var navs = BC.input.takeNav();
    for (var n = 0; n < navs.length; n++) {
      if (navs[n].b === 'back' || navs[n].b === 'ok') { sfx('move'); go('title'); return; }
    }
  }

  function updateIntro() {
    var navs = BC.input.takeNav();
    var skip = false;
    for (var n = 0; n < navs.length; n++) if (navs[n].b === 'ok') skip = true;
    if (sceneT > 110 || (skip && sceneT > 20)) {
      buildStage();
      BC.input.clearEdges();
      go('play');
    }
  }

  function updateTally() {
    var navs = BC.input.takeNav();
    var rows = 5;
    if (G.tallyStep < rows && sceneT % 18 === 0 && sceneT > 0) { G.tallyStep++; sfx('tick'); }
    var ok = false;
    for (var n = 0; n < navs.length; n++) if (navs[n].b === 'ok' || navs[n].b === 'back') ok = true;
    if (ok && G.tallyStep < rows) { G.tallyStep = rows; return; }
    if ((ok && sceneT > 30) || sceneT > 420) {
      if (G.result === 'over') { go('over'); sfx('over'); }
      else if (G.stage >= STAGES) { go('win'); sfx('life'); }
      else { G.stage++; startIntro(); }
    }
  }

  function updateEnd() {
    var navs = BC.input.takeNav();
    for (var n = 0; n < navs.length; n++) {
      if ((navs[n].b === 'ok' || navs[n].b === 'back') && sceneT > 40) { G = null; go('title'); return; }
    }
    if (sceneT > 60 * 20) { G = null; go('title'); }
  }

  // ------------------------------------------------------------------ drawing
  function drawTank(ctx, t) {
    var x = FX + Math.round(t.x), y = FY + Math.round(t.y);
    if (t.spawn > 0) {
      var f = ((50 - t.spawn) >> 2) % 6;
      ctx.drawImage(BC.SPAWN[f < 4 ? f : 6 - f], x, y);
      return;
    }
    if (t.isPlayer && t.frozen > 0 && (G.frame >> 3) & 1) return;
    var pal, kind;
    if (t.isPlayer) { pal = playerPal(t.pi); kind = 'pl'; }
    else {
      kind = t.etype;
      if (t.bonus && (G.frame >> 3) & 1) pal = 'red';
      else if (t.etype === 3) pal = t.hp >= 3 ? 'ag' : t.hp === 2 ? 'ay' : 'en';
      else pal = 'en';
    }
    var frame = ((t.anim / 3) | 0) % 3;
    ctx.drawImage(BC.tankSprite(kind, pal, t.dir, frame), x, y);
    if (t.shield > 0) ctx.drawImage(BC.SHIELD[(G.frame >> 2) & 1], x, y);
  }

  function drawPlay(ctx) {
    ctx.fillStyle = GREY;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(FX, FY, 208, 208);
    ctx.save();
    ctx.beginPath();
    ctx.rect(FX, FY, 208, 208);
    ctx.clip();
    ctx.drawImage(G.ground, FX, FY);
    ctx.drawImage(G.baseAlive ? BC.EAGLE : BC.EAGLE_DEAD, FX + BASE_X, FY + BASE_Y);
    var i;
    for (i = 0; i < G.tanks.length; i++) drawTank(ctx, G.tanks[i]);
    ctx.fillStyle = '#e8e8e8';
    for (i = 0; i < G.bullets.length; i++) {
      var b = G.bullets[i];
      ctx.fillRect(FX + Math.round(b.x) - 1, FY + Math.round(b.y) - 1, 3, 3);
    }
    ctx.drawImage(G.treeLayer, FX, FY);
    if (G.power && !(G.power.t > 60 * 20 && (G.frame >> 3) & 1) && (G.frame >> 4) % 4 !== 3) {
      ctx.drawImage(BC.POWER[G.power.kind], FX + G.power.x, FY + G.power.y);
    }
    for (i = 0; i < G.fx.length; i++) {
      var f = G.fx[i];
      var img;
      if (!f.big || f.t < 12) img = BC.BOOM_SMALL[Math.min(2, (f.t / 4) | 0)];
      else img = BC.BOOM_BIG[f.t < 19 ? 0 : 1];
      ctx.drawImage(img, FX + Math.round(f.x - img.width / 2), FY + Math.round(f.y - img.height / 2));
    }
    for (i = 0; i < G.popups.length; i++) {
      var p = G.popups[i];
      BC.text(ctx, p.text, FX + p.x, FY + p.y, '#fcfcfc', 1, 'center');
    }
    if (G.lost) {
      var y = Math.max(90, 208 - (220 - G.overTimer) * 1.2);
      BC.text(ctx, 'GAME', FX + 104, FY + y, '#e8503c', 2, 'center');
      BC.text(ctx, 'OVER', FX + 104, FY + y + 16, '#e8503c', 2, 'center');
    }
    ctx.restore();
    drawPanels(ctx);
    if (G.paused) drawPause(ctx);
  }

  function drawPanels(ctx) {
    // left: scores and lives
    BC.text(ctx, 'HI', 8, 8, '#fcfcfc');
    BC.text(ctx, String(save.hi), 80, 8, '#fcfcfc', 1, 'right');
    for (var i = 0; i < 2; i++) {
      var P = G.players[i];
      if (!P) continue;
      var y = 28 + i * 40;
      var col = BC.PAL[playerPal(i)].m;
      BC.text(ctx, (i + 1) + 'P', 8, y, col);
      BC.text(ctx, String(P.score), 80, y, '#000', 1, 'right');
      ctx.drawImage(BC.ICON_LIFE[playerPal(i)], 8, y + 12);
      BC.text(ctx, 'x ' + P.lives, 20, y + 12, '#000');
      if (P.level > 0) BC.text(ctx, 'STAR ' + P.level, 80, y + 12, '#fcfcfc', 1, 'right');
    }
    ctx.drawImage(BC.ICON_FLAG, 8, 150);
    BC.text(ctx, 'STAGE', 28, 152, '#000');
    BC.text(ctx, String(G.stage), 28, 164, '#000', 2);
    if (G.freeze > 0) BC.text(ctx, 'FREEZE', 8, 196, '#fcfcfc');

    // right: enemies left, phone QR
    var left = G.queue.length - G.qi;
    for (var k = 0; k < left; k++) {
      ctx.drawImage(BC.ICON_ENEMY, 308 + (k % 2) * 10, 8 + ((k / 2) | 0) * 9);
    }
    var addr = BC.platform.address();
    if (addr) {
      var needP2 = G.mode === 2 && !BC.phones[2];
      BC.text(ctx, needP2 ? 'PLAYER 2' : 'PHONE', 340, 104, needP2 ? BC.PAL.p2.l : '#000', 1, 'center');
      BC.text(ctx, needP2 ? 'SCAN ME' : 'CONTROL', 340, 114, needP2 ? BC.PAL.p2.l : '#000', 1, 'center');
      var q = BC.qrCanvas(addr, 2);
      if (q) ctx.drawImage(q, 340 - (q.width >> 1), 126);
    }
  }

  function drawPause(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(112, 58, 160, 100);
    ctx.fillStyle = '#fcfcfc';
    ctx.fillRect(112, 58, 160, 1); ctx.fillRect(112, 157, 160, 1);
    ctx.fillRect(112, 58, 1, 100); ctx.fillRect(271, 58, 1, 100);
    BC.text(ctx, 'PAUSED', 192, 68, '#e8503c', 2, 'center');
    for (var i = 0; i < PAUSE_ITEMS.length; i++) {
      var sel = i === G.pauseSel;
      BC.text(ctx, PAUSE_ITEMS[i], 150, 96 + i * 16, sel ? '#fcfcfc' : '#8c8c8c');
      if (sel) ctx.drawImage(BC.tankSprite('pl', 'p1', 1, ((sceneT >> 2) % 3)), 128, 92 + i * 16);
    }
  }

  function drawTitle(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    BC.brickText(ctx, 'BATTLE', W / 2, 12, 4, 'center');
    BC.brickText(ctx, 'CITY', W / 2, 46, 4, 'center');
    for (var i = 0; i < TITLE_ITEMS.length; i++) {
      var label = TITLE_ITEMS[i];
      if (i === 2) label = 'STAGE  < ' + menu.stage + ' >';
      if (i === 4) label = 'SOUND  ' + (save.muted ? 'OFF' : 'ON');
      var sel = i === menu.sel;
      var y = 92 + i * 15;
      BC.text(ctx, label, 150, y, sel ? '#fcfcfc' : '#9c9c9c');
      if (sel) ctx.drawImage(BC.tankSprite('pl', 'p1', 1, ((sceneT >> 2) % 3)), 126, y - 4);
    }
    if (menu.sel === 2) BC.text(ctx, 'LEFT/RIGHT TO CHANGE. REACHED: ' + save.best + ' OF ' + STAGES, W / 2, 172, '#9c9c9c', 1, 'center');
    BC.text(ctx, 'HI-SCORE  ' + save.hi, W / 2, 184, '#e8503c', 1, 'center');
    var ph = [];
    if (BC.phones[1]) ph.push('P1');
    if (BC.phones[2]) ph.push('P2');
    var status = ph.length ? 'PHONES CONNECTED: ' + ph.join(' ') : (BC.platform.address() ? 'PHONES: NONE CONNECTED' : '');
    if (status) BC.text(ctx, status, W / 2, 196, '#58a8f8', 1, 'center');
    BC.text(ctx, 'ARROWS: CHOOSE   OK: SELECT   BACK: EXIT', W / 2, 207, '#5c5c5c', 1, 'center');
  }

  function drawConnect(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    BC.text(ctx, 'PHONE CONTROLLER', W / 2, 10, '#fcfcfc', 2, 'center');
    var addr = BC.platform.address();
    if (!BC.platform.tv) {
      var msg = BC.wrap('THE PHONE CONTROLLER WORKS WHEN THE GAME RUNS ON THE TV. HERE, USE THE KEYBOARD OR THE BUTTONS ON THE SCREEN.', 52);
      for (var m = 0; m < msg.length; m++) BC.text(ctx, msg[m], W / 2, 70 + m * 12, '#9c9c9c', 1, 'center');
    } else if (!addr) {
      var msg2 = BC.wrap('THE TV IS NOT CONNECTED TO A NETWORK. CONNECT IT TO WI-FI, THEN COME BACK HERE.', 52);
      for (var m2 = 0; m2 < msg2.length; m2++) BC.text(ctx, msg2[m2], W / 2, 70 + m2 * 12, '#9c9c9c', 1, 'center');
    } else {
      var q = BC.qrCanvas(addr, 3);
      if (q) ctx.drawImage(q, 16, 36);
      var x = 16 + (q ? q.width : 0) + 14;
      var lines = [
        ['1. CONNECT THE PHONE TO THE', '#fcfcfc'],
        ['   SAME WI-FI AS THE TV.', '#fcfcfc'],
        ['2. SCAN THIS CODE WITH THE', '#fcfcfc'],
        ['   PHONE CAMERA, OR TYPE THIS', '#fcfcfc'],
        ['   IN THE PHONE BROWSER:', '#fcfcfc'],
        ['   ' + addr.replace('http://', ''), '#f8d038'],
        ['3. TAP PLAYER 1 OR PLAYER 2.', '#fcfcfc']
      ];
      for (var i = 0; i < lines.length; i++) BC.text(ctx, lines[i][0], x, 40 + i * 12, lines[i][1]);
      BC.text(ctx, 'PLAYER 1: ' + (BC.phones[1] ? 'PHONE CONNECTED' : 'TV REMOTE'), x, 136, BC.PAL.p1.l);
      BC.text(ctx, 'PLAYER 2: ' + (BC.phones[2] ? 'PHONE CONNECTED' : 'WAITING FOR A PHONE'), x, 150, BC.PAL.p2.l);
    }
    BC.text(ctx, 'PRESS OK TO GO BACK', W / 2, 200, '#5c5c5c', 1, 'center');
  }

  function drawIntro(ctx) {
    ctx.fillStyle = GREY;
    ctx.fillRect(0, 0, W, H);
    BC.text(ctx, 'STAGE ' + G.stage, W / 2, 96, '#000', 2, 'center');
    if (G.mode === 2 && !BC.phones[2] && BC.platform.tv) {
      BC.text(ctx, 'PLAYER 2: CONNECT A PHONE (SEE THE CODE ON THE RIGHT)', W / 2, 130, '#000', 1, 'center');
    }
  }

  function drawTally(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    BC.text(ctx, 'HI-SCORE', 150, 8, '#e8503c', 1, 'right');
    BC.text(ctx, String(save.hi), 160, 8, '#f8b838');
    BC.text(ctx, 'STAGE ' + G.stage, W / 2, 24, '#fcfcfc', 1, 'center');
    var two = G.mode === 2;
    var colX = two ? [120, 264] : [150];
    for (var p = 0; p < colX.length; p++) {
      var P = G.players[p];
      BC.text(ctx, (p + 1) + '-PLAYER', colX[p], 42, '#e8503c', 1, 'center');
      BC.text(ctx, String(P.score), colX[p], 54, '#f8b838', 1, 'center');
    }
    var total = [0, 0];
    for (var r = 0; r < 4; r++) {
      var y = 72 + r * 22;
      var show = G.tallyStep > r;
      ctx.drawImage(BC.tankSprite(r, 'en', 0, 0), W / 2 - 8 + (two ? 0 : 50), y - 4);
      for (var q = 0; q < colX.length; q++) {
        var k = G.players[q].kills[r];
        total[q] += k;
        if (!show) continue;
        var pts = k * ESPEC[r].pts;
        var x = colX[q] + (two ? (q ? 12 : -12) : 0);
        BC.text(ctx, pts + ' PTS  ' + k, x + (q || !two ? 0 : 0), y, '#fcfcfc', 1, q && two ? 'left' : 'right');
      }
    }
    if (G.tallyStep >= 5) {
      for (var t = 0; t < colX.length; t++) {
        BC.text(ctx, 'TOTAL ' + total[t], colX[t], 164, '#fcfcfc', 1, 'center');
      }
      BC.text(ctx, G.result === 'clear' ? 'PRESS OK FOR THE NEXT STAGE' : 'PRESS OK', W / 2, 190, '#9c9c9c', 1, 'center');
    }
  }

  function drawOver(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    BC.brickText(ctx, 'GAME', W / 2, 40, 4, 'center');
    BC.brickText(ctx, 'OVER', W / 2, 76, 4, 'center');
    BC.text(ctx, 'YOU REACHED STAGE ' + G.stage, W / 2, 130, '#fcfcfc', 1, 'center');
    BC.text(ctx, 'HI-SCORE ' + save.hi, W / 2, 146, '#e8503c', 1, 'center');
    if (sceneT > 40) BC.text(ctx, 'PRESS OK', W / 2, 180, '#9c9c9c', 1, 'center');
  }

  function drawWin(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    BC.brickText(ctx, 'WELL', W / 2, 24, 4, 'center');
    BC.brickText(ctx, 'DONE!', W / 2, 60, 4, 'center');
    BC.text(ctx, 'YOU CLEARED ALL ' + STAGES + ' STAGES!', W / 2, 116, '#f8d038', 1, 'center');
    var y = 134;
    G.players.forEach(function (P, i) {
      if (!P) return;
      BC.text(ctx, (i + 1) + 'P SCORE ' + P.score, W / 2, y, BC.PAL[playerPal(i)].l, 1, 'center');
      y += 12;
    });
    if (sceneT > 40) BC.text(ctx, 'PRESS OK', W / 2, 186, '#9c9c9c', 1, 'center');
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
        case 'tally': updateTally(); break;
        case 'over': case 'win': updateEnd(); break;
      }
    },
    render: function (ctx) {
      switch (scene) {
        case 'title': drawTitle(ctx); break;
        case 'connect': drawConnect(ctx); break;
        case 'intro': drawIntro(ctx); break;
        case 'play': drawPlay(ctx); break;
        case 'tally': drawTally(ctx); break;
        case 'over': drawOver(ctx); break;
        case 'win': drawWin(ctx); break;
      }
    },
    // Pause when the app goes to the background.
    pause: function () {
      if (scene === 'play' && G && !G.paused && !G.lost) {
        G.paused = true;
        G.pauseSel = 0;
        BC.platform.broadcast('mode:menu');
      }
    },
    scene: function () { return scene; },
    // Test hooks (used by the automated checks).
    debug: {
      state: function () { return G; },
      unlockAll: function () { save.best = STAGES; menu.stage = 1; },
      startStage: function (mode, stage) { newGame(mode, stage); buildStage(); go('play'); },
      killEnemies: function () {
        G.qi = G.queue.length;
        G.tanks.forEach(function (t) { if (!t.isPlayer) t.dead = true; });
      },
      destroyBase: function () { destroyBase(); },
      spawnPower: function (kind) { spawnPower(); if (kind) G.power.kind = kind; return G.power; },
      cell: function (cx, cy) { return G.map[cy * N + cx]; }
    }
  };
})();
