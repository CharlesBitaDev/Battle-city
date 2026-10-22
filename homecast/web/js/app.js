// HomeCast screens. The same page runs on the TV (library, player controls; it owns the shared
// state) and on the phone (remote: same library, now-playing controls). Plain ES2017 for old TV
// WebViews: no ?., ??, class fields, Array.flat, Object.fromEntries or modules.
(function () {
  'use strict';

  var A = window.Android || null;
  var Q = window.location.search;
  var MODE = A ? A.mode() : (/mode=phone/.test(Q) ? 'phone' : 'tv');
  var TV = MODE === 'tv';
  document.body.className = TV ? 'tv' : 'phone';

  function $(id) { return document.getElementById(id); }
  function param(k) { var m = new RegExp('[?&]' + k + '=([^&]*)').exec(Q); return m ? decodeURIComponent(m[1]) : ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ------------------------------------------------------------------ icons (Material Icons, Apache 2.0)
  var ICON = {
    home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    phone: 'M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z',
    settings: 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
    play: 'M8 5v14l11-7z',
    pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
    rew: 'M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z',
    ff: 'M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z',
    stop: 'M6 6h12v12H6z',
    audio: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z',
    subs: 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z',
    tv: 'M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z',
    vol: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
    restart: 'M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z',
    remote: 'M15 7.5V2H9v5.5l3 3 3-3zM7.5 9H2v6h5.5l3-3-3-3zM9 16.5V22h6v-5.5l-3-3-3 3zM16.5 9l-3 3 3 3H22V9h-5.5z',
    refresh: 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    up: 'M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z',
    down: 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z',
    left: 'M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z',
    right: 'M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z'
  };
  function icon(n) { return '<svg class="i" viewBox="0 0 24 24"><path d="' + ICON[n] + '"/></svg>'; }

  // ------------------------------------------------------------------ helpers
  function fmtTime(ms) {
    var s = Math.max(0, Math.floor((ms || 0) / 1000));
    var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x;
  }
  function fmtSize(b) {
    if (!b) return '';
    if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
    return Math.max(1, Math.round(b / 1048576)) + ' MB';
  }
  function quality(w, h) {
    var lines = Math.min(w || 0, h || 0);
    if (!lines) return '';
    return lines >= 2000 ? '4K' : lines >= 1400 ? '1440p' : lines >= 1000 ? '1080p' : lines >= 700 ? '720p' : lines >= 470 ? '480p' : 'SD';
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(sec) {
    if (!sec) return '';
    var d = new Date(sec * 1000);
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  function load(k, def) {
    try {
      var v = A ? A.load(k) : window.localStorage.getItem('hc.' + k);
      return v ? JSON.parse(v) : def;
    } catch (e) { return def; }
  }
  function save(k, v) {
    try {
      var s = JSON.stringify(v);
      if (A) A.save(k, s); else window.localStorage.setItem('hc.' + k, s);
    } catch (e) { /* ignore */ }
  }
  function randomKey(n) {
    var abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
    for (var i = 0; i < n; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
    return s;
  }
  var toastTimer = 0;
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.display = 'none'; }, ms || 4500);
  }

  // ------------------------------------------------------------------ library rows (same on both sides)
  // Continue watching, Recently added, then one row per folder (newest first).
  function buildRows(list, resume, multi) {
    var rows = [];
    var cont = list.filter(function (it) {
      var r = resume[it.id];
      return r && r.p > 30000 && r.p < (it.dur || r.d || 0) - 60000;
    }).sort(function (a, b) { return resume[b.id].at - resume[a.id].at; }).slice(0, 20);
    if (cont.length) rows.push({ title: 'Continue watching', ids: cont.map(function (it) { return it.id; }) });
    var recent = list.slice().sort(function (a, b) { return b.date - a.date; }).slice(0, 20);
    if (recent.length) rows.push({ title: 'Recently added', ids: recent.map(function (it) { return it.id; }) });
    var groups = {}, order = [];
    list.forEach(function (it) {
      var k = (multi ? it.phone + ' · ' : '') + (it.folder || 'Videos');
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(it);
    });
    order.forEach(function (k) { groups[k].sort(function (a, b) { return b.date - a.date; }); });
    order.sort(function (a, b) { return groups[b][0].date - groups[a][0].date; });
    order.forEach(function (k) {
      var g = groups[k];
      rows.push({ title: k, sub: g.length + (g.length === 1 ? ' video' : ' videos'), ids: g.slice(0, 200).map(function (it) { return it.id; }) });
    });
    return rows;
  }

  // ------------------------------------------------------------------ shared drawing
  var D = { items: {}, rows: [], focus: { r: 0, c: 0 }, off: [], resume: {} };   // what is shown
  var rowEls = [];

  function cardHtml(it, r) {
    var res = D.resume[it.id];
    var pct = res && it.dur ? clamp(res.p / it.dur * 100, 0, 100) : 0;
    var q = quality(it.w, it.h);
    return '<div class="thumb">' + (q ? '<span class="q">' + q + '</span>' : '') +
      (it.dur ? '<span class="dur">' + fmtTime(it.dur) + '</span>' : '') +
      (pct > 0 && r !== 1 ? '<div class="bar"><b style="width:' + pct.toFixed(1) + '%"></b></div>' : '') +
      '</div><div class="ctitle">' + esc(it.title) + '</div>';
  }

  function renderRows() {
    var box = $('rowsIn');
    box.innerHTML = '';
    rowEls = [];
    D.rows.forEach(function (row, r) {
      var el = document.createElement('div');
      el.className = 'row';
      el.innerHTML = '<div class="rowTitle">' + esc(row.title) + (row.sub ? '<small>' + esc(row.sub) + '</small>' : '') + '</div>';
      var track = document.createElement('div');
      track.className = 'track';
      var cards = [];
      row.ids.forEach(function (id, c) {
        var it = D.items[id];
        if (!it) return;
        var card = document.createElement('div');
        card.className = 'card';
        if (TV) card.style.left = (c * 16.6) + 'em';
        card.innerHTML = cardHtml(it, r);
        card.setAttribute('data-r', r);
        card.setAttribute('data-c', c);
        if (!TV) card.addEventListener('click', function () { phoneTapCard(r, c); });
        track.appendChild(card);
        cards.push(card);
      });
      el.appendChild(track);
      if (!TV) {
        el.style.top = '';
        track.addEventListener('scroll', function () { phoneRowScrolled(r, track); }, { passive: true });
      }
      box.appendChild(el);
      rowEls.push({ el: el, track: track, cards: cards, loaded: {} });
    });
    lazyImages();
  }

  // Loads thumbnails only for cards near what is on screen (big libraries stay quick).
  var observer = null;
  function lazyImages() {
    if (TV) {
      var r0 = Math.max(0, D.focus.r - 1), r1 = Math.min(rowEls.length - 1, D.focus.r + 3);
      for (var r = r0; r <= r1; r++) {
        var re = rowEls[r];
        var off = D.off[r] || 0;
        for (var c = Math.max(0, off - 2); c < Math.min(re.cards.length, off + visibleCards() + 3); c++) loadThumb(r, c);
      }
      return;
    }
    if (!observer && window.IntersectionObserver) {
      observer = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          loadThumb(+e.target.getAttribute('data-r'), +e.target.getAttribute('data-c'));
          observer.unobserve(e.target);
        });
      }, { rootMargin: '200px' });
    }
    rowEls.forEach(function (re, r) {
      re.cards.forEach(function (card, c) {
        if (observer) observer.observe(card); else loadThumb(r, c);
      });
    });
  }
  function loadThumb(r, c) {
    var re = rowEls[r];
    if (!re || re.loaded[c]) return;
    var it = D.items[D.rows[r].ids[c]];
    if (!it || !it.th) return;
    re.loaded[c] = true;
    re.cards[c].firstChild.style.backgroundImage = 'url("' + it.th + '")';
  }

  function visibleCards() {
    if (!TV) return 2;
    var em = window.innerWidth / 100;
    return Math.max(1, Math.floor((window.innerWidth - 9.6 * em) / (16.6 * em)));
  }

  function focusedItem() {
    var row = D.rows[D.focus.r];
    return row ? D.items[row.ids[D.focus.c]] : null;
  }

  var heroFor = '';
  function renderHero() {
    var it = focusedItem();
    $('hero').className = it ? '' : 'hide';
    if (!it) return;
    var res = D.resume[it.id];
    if (heroFor !== it.id) {
      heroFor = it.id;
      var img = $('heroImg');
      if (it.th) img.src = it.th; else img.removeAttribute('src');
      $('heroFolder').textContent = it.folder + (it.phone ? '  ·  ' + it.phone : '');
      $('heroTitle').textContent = it.title;
      var meta = [];
      var q = quality(it.w, it.h);
      var m = (q ? '<i>' + q + '</i>' : '');
      if (it.dur) meta.push(fmtTime(it.dur));
      if (it.w && it.h) meta.push(it.w + '×' + it.h);
      if (it.size) meta.push(fmtSize(it.size));
      if (it.date) meta.push(fmtDate(it.date));
      $('heroMeta').innerHTML = m + esc(meta.join('   ·   '));
    }
    var resumable = res && res.p > 30000 && it.dur && res.p < it.dur - 60000;
    $('heroBar').className = resumable ? 'heroBar' : 'heroBar hide';
    if (resumable) $('heroBar').firstChild.style.width = (res.p / it.dur * 100).toFixed(1) + '%';
    var btns = resumable ? [['play', TV ? 'Resume ' + fmtTime(res.p) : 'Resume on TV', 'resume'], ['restart', 'Start over', 'start']]
      : [['play', TV ? 'Play' : 'Play on TV', 'start']];
    if (TV) heroButtons = btns;
    $('heroBtns').innerHTML = btns.map(function (b, i) {
      return '<div class="btn' + (TV && zone === 'hero' && heroSel === i ? ' focus' : '') + (!TV && i === 0 ? ' primary' : '') + '" data-a="' + b[2] + '">' + icon(b[0]) + esc(b[1]) + '</div>';
    }).join('');
    if (!TV) {
      Array.prototype.forEach.call($('heroBtns').children, function (el) {
        el.addEventListener('click', function () { phonePlay(it.id, el.getAttribute('data-a')); });
      });
    }
  }

  function updateFocusView() {
    rowEls.forEach(function (re, r) {
      re.cards.forEach(function (card, c) {
        var on = r === D.focus.r && c === D.focus.c && (!TV || zone === 'rows');
        if (on !== (card.className === 'card focus')) card.className = on ? 'card focus' : 'card';
      });
      if (TV) re.track.style.transform = 'translateX(-' + ((D.off[r] || 0) * 16.6) + 'em)';
    });
    if (TV) $('rowsIn').style.transform = 'translateY(-' + (D.focus.r * 15.6) + 'em)';
    renderHero();
    lazyImages();
  }

  // ================================================================== TV
  var zone = 'rows';          // rail | hero | rows | panel
  var railSel = 0, heroSel = 0, heroButtons = [];
  var view = 'home';          // home | phones | settings | player
  var NAV = [['home', 'home', 'Home'], ['phones', 'phone', 'Phones'], ['settings', 'settings', 'Settings']];

  var ws = null, phones = {}, keys = {}, code = '', tvName = A ? A.name() : 'Test TV';
  var sources = {};           // dev -> {name, items: [...]}
  var now = null;             // what the TV is playing: {id, title, pos, dur, playing, buffering}
  var vol = { v: 0, max: 15 };
  var stateTimer = 0;

  function tvInit() {
    keys = load('keys', {});
    code = load('code', '');
    if (!code) { code = String(1000 + Math.floor(Math.random() * 9000)); save('code', code); }
    D.resume = load('resume', {});
    var nav = document.querySelectorAll('.nav');
    for (var i = 0; i < nav.length; i++) nav[i].innerHTML = icon(NAV[i][1]) + '<b>' + NAV[i][2] + '</b>';
    hubConnect();
    rebuild();
    setInterval(tvTick, 500);
    readVolume();
  }

  function hubConnect() {
    var url = A ? 'ws://127.0.0.1:' + A.hubPort() + '/ws' : (param('hub') || 'ws://127.0.0.1:8790/ws');
    var secret = A ? A.hubSecret() : (param('secret') || 'test');
    try { ws = new WebSocket(url); } catch (e) { setTimeout(hubConnect, 2000); return; }
    ws.onopen = function () { ws.send(JSON.stringify({ hub: 'tv', secret: secret })); };
    ws.onmessage = function (e) {
      var m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      onPhone(m.from, m.msg || {});
    };
    ws.onclose = function () { ws = null; phones = {}; setTimeout(hubConnect, 1500); };
  }
  function sendTo(id, obj) { if (ws && ws.readyState === 1) ws.send(id + '|' + JSON.stringify(obj)); }
  function broadcast(obj) { if (ws && ws.readyState === 1) ws.send('*|' + JSON.stringify(obj)); }

  function onPhone(id, msg) {
    var t = msg.t, ph = phones[id];
    if (t === '_open') { phones[id] = { ip: msg.ip, paired: false }; return; }
    if (t === '_close') { delete phones[id]; if (view === 'phones') renderPanel(); if (!D.rows.length) renderEmpty(); return; }
    if (!ph) ph = phones[id] = { paired: false };
    if (t === 'hello') {
      var key = '';
      if (msg.dev && msg.key && keys[msg.dev] === msg.key) key = msg.key;
      else if (msg.code && String(msg.code) === code) {
        key = randomKey(24);
        keys[msg.dev] = key;
        save('keys', keys);
      }
      if (!key) {
        sendTo(id, { t: 'need', bad: !!msg.code });
        toast((msg.name || 'A phone') + ' wants to connect. Enter the code ' + code + ' on the phone.', 9000);
        if (view === 'phones') renderPanel();
        return;
      }
      ph.paired = true;
      ph.dev = msg.dev;
      ph.name = msg.name || 'Phone';
      if (ws) ws.send('auth|' + id);
      sendTo(id, { t: 'welcome', key: key, tv: tvName });
      sendTo(id, libMsg());
      sendTo(id, stateMsg());
      toast(ph.name + ' is connected', 3000);
      if (!D.rows.length) renderEmpty();
      if (view === 'phones') renderPanel();
      return;
    }
    if (!ph.paired) return;
    if (t === 'lib') {
      sources[ph.dev] = { name: ph.name, perm: msg.perm !== false, items: (msg.items || []).map(function (it) { it.phone = ph.name; it.dev = ph.dev; return it; }) };
      rebuild();
      broadcast(libMsg());
      dirty();
    } else if (t === 'focus') {
      setFocus(msg.r | 0, msg.c | 0);
      if (view !== 'player') { closePanels(); zone = 'rows'; renderRail(); }
      updateFocusView();
      dirty();
    } else if (t === 'top') {
      var r = clamp(msg.r | 0, 0, Math.max(0, D.rows.length - 1));
      setFocus(r, D.off[r] || 0);
      updateFocusView();
      dirty();
    } else if (t === 'hs') {
      var hr = msg.r | 0, row = D.rows[hr];
      if (!row) return;
      var vis = visibleCards();
      D.off[hr] = clamp(msg.first | 0, 0, Math.max(0, row.ids.length - vis));
      if (D.focus.r === hr) D.focus.c = clamp(D.focus.c, D.off[hr], Math.min(row.ids.length - 1, D.off[hr] + vis - 1));
      updateFocusView();
      dirty();
    } else if (t === 'play') {
      playItem(msg.id, msg.from === 'start');
    } else if (t === 'cmd') {
      command(msg.a, msg.ms);
    } else if (t === 'vol') {
      if (A) A.setVolume(msg.v | 0);
      vol.v = msg.v | 0;
      showVolume();
      dirty();
    } else if (t === 'track') {
      if (view === 'player') { chooseTrack(msg.i | 0, !!msg.on); showControls(); }
    } else if (t === 'key') {
      key(msg.k, true, 0);
    }
  }

  function libMsg() {
    return { t: 'lib', items: Object.keys(D.items).map(function (k) { return D.items[k]; }), rows: D.rows, resume: D.resume };
  }
  function stateMsg() {
    return { t: 'state', focus: D.focus, off: D.off, view: view, now: now, vol: vol };
  }
  function dirty() {
    if (stateTimer) return;
    stateTimer = setTimeout(function () { stateTimer = 0; broadcast(stateMsg()); }, 60);
  }

  function rebuild() {
    var keep = focusedItem();
    var list = [];
    D.items = {};
    Object.keys(sources).forEach(function (dev) {
      sources[dev].items.forEach(function (it) { D.items[it.id] = it; list.push(it); });
    });
    D.rows = buildRows(list, D.resume, Object.keys(sources).length > 1);
    D.off = D.rows.map(function () { return 0; });
    D.focus = { r: 0, c: 0 };
    if (keep) {
      for (var r = 0; r < D.rows.length; r++) {
        var c = D.rows[r].ids.indexOf(keep.id);
        if (c >= 0) { setFocus(r, c); break; }
      }
    }
    renderRows();
    var empty = !list.length;
    $('empty').className = empty && view === 'home' ? '' : 'hide';
    $('main').className = empty || view !== 'home' ? 'hide' : '';
    if (empty) renderEmpty();
    if (empty && zone !== 'rail') zone = 'rail';
    else if (!empty && zone === 'rail' && view === 'home' && !railTouched) zone = 'rows';
    renderRail();
    updateFocusView();
  }
  var railTouched = false;

  function setFocus(r, c) {
    if (!D.rows.length) { D.focus = { r: 0, c: 0 }; return; }
    r = clamp(r, 0, D.rows.length - 1);
    c = clamp(c, 0, D.rows[r].ids.length - 1);
    D.focus = { r: r, c: c };
    var vis = visibleCards(), off = D.off[r] || 0;
    if (c < off) off = c;
    if (c > off + vis - 1) off = c - vis + 1;
    D.off[r] = clamp(off, 0, Math.max(0, D.rows[r].ids.length - vis));
  }

  function renderEmpty() {
    var on = Object.keys(phones).map(function (id) { return phones[id]; }).filter(function (p) { return p.paired; });
    if (on.length) {
      var ph = on[0], src = sources[ph.dev];
      var noPerm = src && src.perm === false;
      $('empty').innerHTML = '<div><h1>' + esc(ph.name) + ' is connected</h1>' +
        (noPerm ? '<p>On the phone, tap <b>Allow access to videos</b> so HomeCast can share them with this TV.</p>'
          : '<p>' + (src ? 'It has no videos to share.' : 'Waiting for its videos…') + ' Videos in WhatsApp, Facebook, Instagram and TikTok folders are not shown.</p>') +
        '<p>To add another phone, enter this code on it:</p><div class="code">' + esc(code) + '</div></div>';
      return;
    }
    var ips = A ? JSON.parse(A.addresses()) : ['127.0.0.1'];
    $('empty').innerHTML = '<div><h1>Play your phone\'s videos here</h1>' +
      '<p>1. Connect the phone to the same Wi-Fi as this TV' + (ips.length ? ' (TV address: <b>' + esc(ips.join(', ')) + '</b>)' : '') + '.</p>' +
      '<p>2. Install HomeCast on the phone (the same app as on this TV) and open it. It finds this TV by itself.</p>' +
      '<p>3. When the phone asks, enter this code:</p><div class="code">' + esc(code) + '</div>' +
      '<p>Videos stream from the phone over your Wi-Fi only, in their original quality. Nothing goes over the internet.</p></div>';
  }

  function renderRail() {
    $('rail').className = zone === 'rail' ? 'open' : '';
    var nav = document.querySelectorAll('.nav');
    for (var i = 0; i < nav.length; i++) {
      nav[i].className = 'nav' + (NAV[i][0] === view ? ' on' : '') + (zone === 'rail' && railSel === i ? ' focus' : '');
    }
  }

  // ---- panels (Phones, Settings)
  var panelSel = 0, panelOpts = [];
  function openView(v) {
    view = v;
    $('panel').className = v === 'home' ? 'panel hide' : 'panel';
    var empty = !Object.keys(D.items).length;
    $('main').className = v === 'home' && !empty ? '' : 'hide';
    $('empty').className = v === 'home' && empty ? '' : 'hide';
    if (v !== 'home') { panelSel = 0; renderPanel(); }
    renderRail();
    dirty();
  }
  function closePanels() { if (view === 'phones' || view === 'settings') openView('home'); }

  function renderPanel() {
    var h = '';
    var ips = A ? JSON.parse(A.addresses()) : ['127.0.0.1'];
    if (view === 'phones') {
      var list = Object.keys(phones).filter(function (id) { return phones[id].paired; }).map(function (id) { return phones[id]; });
      h = '<h1>Phones</h1><p>Open HomeCast on a phone on the same Wi-Fi. New phones need this code once:</p><div class="code">' + esc(code) + '</div>' +
        '<p>TV address: <b>' + esc(ips.join(', ') || 'not on a network') + '</b> &nbsp; (the phone finds it by itself)</p>' +
        '<div class="phoneList">' + (list.length ? list.map(function (p) { return '<div><span class="dot"></span>' + esc(p.name) + ' <span style="color:#a3aab9">' + esc(p.ip || '') + '</span></div>'; }).join('') : '<div style="color:#a3aab9">No phone connected right now.</div>') + '</div>';
      panelOpts = [['newcode', 'New code', 'Phones already set up keep working'], ['forget', 'Forget all phones', 'They will need a code again']];
    } else {
      h = '<h1>Settings</h1>';
      var best = A ? A.bestMode() : true;
      panelOpts = [['best', 'Best picture: match the video\'s resolution', best ? 'On' : 'Off'],
        ['asphone', 'Use this device as a phone remote', ''], ['about', 'HomeCast ' + (A ? A.version() : ''), 'Plays the original file on the TV\'s own decoder']];
    }
    h += panelOpts.map(function (o, i) {
      return '<div class="opt' + (zone === 'panel' && panelSel === i ? ' focus' : '') + '">' + esc(o[1]) + '<span>' + esc(o[2]) + '</span></div>';
    }).join('');
    $('panel').innerHTML = h;
  }

  function panelAction() {
    var o = panelOpts[panelSel];
    if (!o) return;
    if (o[0] === 'newcode') { code = String(1000 + Math.floor(Math.random() * 9000)); save('code', code); }
    else if (o[0] === 'forget') { keys = {}; save('keys', keys); toast('Phones forgotten. They need the code to connect again.'); }
    else if (o[0] === 'best' && A) A.setBestMode(!A.bestMode());
    else if (o[0] === 'asphone' && A) A.setMode('phone');
    renderPanel();
    if (!Object.keys(D.items).length) renderEmpty();
  }

  // ---- remote keys
  function key(k, down, repeat) {
    if (!down) { if (view === 'player') playerKeyUp(k); return; }
    if (!TV) { if (k === 'back') phoneBack(); return; }
    if (view === 'player') { playerKey(k, repeat || 0); return; }
    if (k === 'playpause' || k === 'play') { var f = focusedItem(); if (f && zone === 'rows') playItem(f.id, false); return; }
    if (zone === 'rail') {
      if (k === 'up') railSel = Math.max(0, railSel - 1);
      else if (k === 'down') railSel = Math.min(NAV.length - 1, railSel + 1);
      else if (k === 'ok' || k === 'right') {
        railTouched = true;
        var v = NAV[railSel][0];
        if (v !== view) openView(v);
        if (v === 'home') { if (Object.keys(D.items).length) zone = 'rows'; }
        else zone = 'panel';
        if (view !== 'home') renderPanel();
      } else if (k === 'back') { if (A) A.exit(); return; }
      renderRail();
      updateFocusView();
      dirty();
      return;
    }
    if (zone === 'panel') {
      if (k === 'up') panelSel = Math.max(0, panelSel - 1);
      else if (k === 'down') panelSel = Math.min(panelOpts.length - 1, panelSel + 1);
      else if (k === 'ok') panelAction();
      else if (k === 'left' || k === 'back') { zone = 'rail'; renderRail(); }
      renderPanel();
      return;
    }
    if (zone === 'hero') {
      if (k === 'left') { if (heroSel > 0) heroSel--; else { zone = 'rail'; railSel = 0; } }
      else if (k === 'right') heroSel = Math.min(heroButtons.length - 1, heroSel + 1);
      else if (k === 'down') zone = 'rows';
      else if (k === 'ok') { var it = focusedItem(); var b = heroButtons[heroSel]; if (it && b) playItem(it.id, b[2] === 'start'); return; }
      else if (k === 'back') zone = 'rows';
      renderRail();
      updateFocusView();
      dirty();
      return;
    }
    // rows
    var r = D.focus.r, c = D.focus.c;
    if (k === 'left') { if (c > 0) setFocus(r, c - 1); else { zone = 'rail'; railSel = 0; } }
    else if (k === 'right') setFocus(r, c + 1);
    else if (k === 'up') { if (r > 0) setFocus(r - 1, Math.max(D.off[r - 1] || 0, Math.min(c - (D.off[r] || 0) + (D.off[r - 1] || 0), 999))); else { zone = 'hero'; heroSel = 0; } }
    else if (k === 'down') { if (r < D.rows.length - 1) setFocus(r + 1, (D.off[r + 1] || 0) + (c - (D.off[r] || 0))); }
    else if (k === 'ok') { var f2 = focusedItem(); if (f2) playItem(f2.id, false); return; }
    else if (k === 'back') { if (r > 0 || c > 0) { setFocus(0, 0); D.off[0] = 0; } else { zone = 'rail'; railSel = 0; } }
    renderRail();
    updateFocusView();
    dirty();
  }

  // ================================================================== TV player
  var player = A && A.play ? A : webPlayer();
  var pFocus = 'bar', pBtn = 1, idleTimer = 0, seekTarget = -1, seekTimer = 0, menu = null, lastSave = 0;
  var PBTN = [['rew', 'back'], ['play', 'toggle'], ['ff', 'fwd'], ['audio', 'audio'], ['subs', 'subs']];

  function playItem(id, fromStart) {
    var it = D.items[id];
    if (!it) { toast('That video is no longer available. Open HomeCast on the phone.'); return; }
    if (view === 'player' && now) savePosition(false);
    var res = D.resume[id];
    var start = !fromStart && res && res.p > 30000 && res.p < (it.dur || res.d) - 60000 ? res.p : 0;
    now = { id: id, title: it.title, phone: it.phone, pos: start, dur: it.dur || 0, playing: false, buffering: true, th: it.th };
    view = 'player';
    setScreen(true);
    $('pTitle').textContent = it.title;
    $('pSub').textContent = [it.phone, quality(it.w, it.h), it.w && it.h ? it.w + '×' + it.h : ''].filter(Boolean).join('  ·  ');
    $('pSubs').textContent = '';
    menu = null;
    $('pMenu').style.display = 'none';
    pFocus = 'bar';
    pBtn = 1;
    $('pSpin').style.display = 'block';
    showControls();
    player.play(it.v, start);
    renderPlayer();
    dirty();
  }

  // While a video plays, the page must be see-through: on the TV the video is drawn behind the
  // WebView, so an opaque <html> background would hide the picture (sound still plays).
  function setScreen(playing) {
    document.body.className = playing ? 'tv playing' : 'tv';
    document.documentElement.className = playing ? 'playing' : '';
  }

  function stopPlayer(ended) {
    if (view !== 'player') return;
    savePosition(ended);
    player.stop();
    now = null;
    view = 'home';
    setScreen(false);
    clearTimeout(idleTimer);
    rebuildKeepFocus();
    dirty();
  }
  function rebuildKeepFocus() {
    var f = D.focus, off = D.off.slice();
    var it = focusedItem();
    D.rows = buildRows(Object.keys(D.items).map(function (k) { return D.items[k]; }), D.resume, Object.keys(sources).length > 1);
    renderRows();
    D.off = D.rows.map(function (r, i) { return off[i] || 0; });
    var found = false;
    if (it) {
      var r0 = clamp(f.r, 0, D.rows.length - 1);
      if (D.rows[r0] && D.rows[r0].ids.indexOf(it.id) >= 0) { setFocus(r0, D.rows[r0].ids.indexOf(it.id)); found = true; }
      for (var r = 0; !found && r < D.rows.length; r++) {
        var c = D.rows[r].ids.indexOf(it.id);
        if (c >= 0) { setFocus(r, c); found = true; }
      }
    }
    if (!found) setFocus(0, 0);
    heroFor = '';
    updateFocusView();
    broadcast(libMsg());
  }

  function savePosition(ended) {
    if (!now) return;
    var it = D.items[now.id];
    if (ended || (now.dur && now.pos > now.dur - 60000)) delete D.resume[now.id];
    else if (now.pos > 30000) D.resume[now.id] = { p: now.pos, d: now.dur, at: Date.now() };
    var ks = Object.keys(D.resume);
    if (ks.length > 400) {
      ks.sort(function (a, b) { return D.resume[a].at - D.resume[b].at; });
      ks.slice(0, ks.length - 400).forEach(function (k) { delete D.resume[k]; });
    }
    save('resume', D.resume);
    return it;
  }

  function tvTick() {
    if (view !== 'player' || !now) return;
    var st;
    try { st = JSON.parse(player.status()); } catch (e) { return; }
    if (seekTarget < 0) now.pos = st.pos;
    if (st.dur) now.dur = st.dur;
    now.playing = st.playing;
    now.buffering = st.buffering || !st.prepared;
    $('pSpin').style.display = now.buffering ? 'block' : 'none';
    if (Date.now() - lastSave > 5000) { lastSave = Date.now(); savePosition(false); }
    renderPlayer();
    readVolume();
    dirty();
  }
  function readVolume() {
    if (!A || !A.volume) return;
    try {
      var v = JSON.parse(A.volume());
      if (v.v !== vol.v || v.max !== vol.max) { vol = v; dirty(); }
    } catch (e) { /* ignore */ }
  }

  function renderPlayer() {
    if (!now) return;
    var pos = seekTarget >= 0 ? seekTarget : now.pos;
    $('pPos').textContent = fmtTime(pos);
    $('pDur').textContent = now.dur ? '-' + fmtTime(now.dur - pos) : '';
    var pct = now.dur ? clamp(pos / now.dur * 100, 0, 100) : 0;
    var bar = $('pBar');
    bar.className = pFocus === 'bar' ? 'focus' : '';
    bar.firstChild.style.width = pct + '%';
    bar.lastChild.style.left = pct + '%';
    $('pBtns').innerHTML = PBTN.map(function (b, i) {
      var ic = b[0] === 'play' ? (now.playing ? 'pause' : 'play') : b[0];
      return '<div class="pb' + (i === 1 ? ' big' : '') + (pFocus === 'btns' && pBtn === i ? ' focus' : '') + '">' + icon(ic) + '</div>';
    }).join('');
  }

  function showControls() {
    $('player').className = '';
    armHide();
  }
  // Like other players: the controls fade 4 s after the last key, once the video plays.
  // While it loads or is paused they stay, and this keeps checking.
  function armHide() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (view !== 'player' || !now) return;
      if (!now.playing || menu) { armHide(); return; }
      $('player').className = 'idle';
      pFocus = 'bar';
      renderPlayer();
    }, 4000);
  }
  function controlsShown() { return $('player').className !== 'idle'; }

  function seekBy(ms) {
    if (!now) return;
    var base = seekTarget >= 0 ? seekTarget : now.pos;
    seekTarget = clamp(base + ms, 0, Math.max(0, (now.dur || 0) - 1000));
    var s = $('pSeek');
    s.textContent = (ms < 0 ? '« ' : '» ') + fmtTime(seekTarget);
    s.style.display = 'block';
    clearTimeout(seekTimer);
    seekTimer = setTimeout(function () {
      player.seek(seekTarget);
      now.pos = seekTarget;
      seekTarget = -1;
      s.style.display = 'none';
      dirty();
    }, 600);
    renderPlayer();
    dirty();
  }

  function command(a, ms) {
    if (view !== 'player' || !now) return;
    if (a === 'toggle') { if (now.playing) player.pause(); else player.resume(); now.playing = !now.playing; }
    else if (a === 'pause') { player.pause(); now.playing = false; }
    else if (a === 'resume') { player.resume(); now.playing = true; }
    else if (a === 'stop') { stopPlayer(false); return; }
    else if (a === 'seek') { player.seek(ms | 0); now.pos = ms | 0; }
    else if (a === 'skip') { seekBy(ms | 0); }
    showControls();
    renderPlayer();
    dirty();
  }

  function playerKey(k, repeat) {
    if (menu) { menuKey(k); return; }
    var step = repeat < 5 ? 10000 : repeat < 15 ? 30000 : 60000;
    if (k === 'back') { if (controlsShown() && now && now.playing) { $('player').className = 'idle'; return; } stopPlayer(false); return; }
    if (k === 'stop') { stopPlayer(false); return; }
    if (k === 'playpause') { command('toggle'); return; }
    if (k === 'play') { command('resume'); return; }
    if (k === 'pause') { command('pause'); return; }
    if (k === 'ff') { showControls(); seekBy(step * 3); return; }
    if (k === 'rew') { showControls(); seekBy(-step * 3); return; }
    var wasShown = controlsShown();
    showControls();
    if (pFocus === 'bar') {
      if (k === 'left') seekBy(-step);
      else if (k === 'right') seekBy(step);
      else if (k === 'ok') { if (wasShown || !now.playing) command('toggle'); }
      else if (k === 'down' || k === 'menu') { pFocus = 'btns'; pBtn = 1; }
      else if (k === 'up' && wasShown) { pFocus = 'btns'; pBtn = 1; }
    } else {
      if (k === 'left') pBtn = Math.max(0, pBtn - 1);
      else if (k === 'right') pBtn = Math.min(PBTN.length - 1, pBtn + 1);
      else if (k === 'up') pFocus = 'bar';
      else if (k === 'ok') {
        var a = PBTN[pBtn][1];
        if (a === 'back') seekBy(-10000);
        else if (a === 'fwd') seekBy(10000);
        else if (a === 'toggle') command('toggle');
        else openTrackMenu(a === 'audio' ? 'audio' : 'text');
      }
    }
    renderPlayer();
  }
  function playerKeyUp() { /* nothing */ }

  // [{i, type: 'audio'|'text', lang}] of the playing video
  function trackList() {
    var all = [];
    try { all = JSON.parse(player.tracks()); } catch (e) { all = []; }
    return all.filter(function (t) { return t.type === 'audio' || t.type === 'text'; })
      .map(function (t) { return { i: t.i, type: t.type, lang: t.lang || '' }; });
  }
  // i < 0 turns subtitles off
  function chooseTrack(i, on) {
    if (i >= 0) { player.selectTrack(i, on); return; }
    trackList().forEach(function (t) { if (t.type === 'text') player.selectTrack(t.i, false); });
    $('pSubs').textContent = '';
  }

  function openTrackMenu(type) {
    var all = [];
    try { all = JSON.parse(player.tracks()); } catch (e) { all = []; }
    var list = all.filter(function (t) { return t.type === type; });
    var opts = list.map(function (t, i) { return { label: (type === 'audio' ? 'Audio ' : 'Subtitles ') + (i + 1) + (t.lang && t.lang !== 'und' ? ' (' + t.lang + ')' : ''), i: t.i, on: true }; });
    if (type === 'text') opts.unshift({ label: 'Subtitles off', i: -1, on: false });
    if (!opts.length || (type === 'text' && opts.length === 1)) { toast(type === 'audio' ? 'This video has one sound track.' : 'This video has no subtitles inside it.'); return; }
    menu = { type: type, opts: opts, sel: 0 };
    renderMenu();
  }
  function renderMenu() {
    var m = $('pMenu');
    if (!menu) { m.style.display = 'none'; return; }
    m.style.display = 'block';
    m.innerHTML = '<h3>' + (menu.type === 'audio' ? 'Sound' : 'Subtitles') + '</h3>' + menu.opts.map(function (o, i) {
      return '<div class="opt' + (i === menu.sel ? ' focus' : '') + '">' + esc(o.label) + '</div>';
    }).join('');
  }
  function menuKey(k) {
    if (k === 'up') menu.sel = Math.max(0, menu.sel - 1);
    else if (k === 'down') menu.sel = Math.min(menu.opts.length - 1, menu.sel + 1);
    else if (k === 'ok') {
      chooseTrack(menu.opts[menu.sel].i, true);
      menu = null;
    } else if (k === 'back' || k === 'left') menu = null;
    renderMenu();
    showControls();
  }

  var volTimer = 0;
  function showVolume() {
    var v = $('pVol');
    if (view !== 'player') return;
    v.style.display = 'block';
    v.firstChild.firstChild.style.height = (vol.max ? vol.v / vol.max * 100 : 0) + '%';
    v.lastChild.textContent = vol.v;
    clearTimeout(volTimer);
    volTimer = setTimeout(function () { v.style.display = 'none'; }, 2000);
  }

  // For testing in a computer browser: the same player calls on an HTML <video>.
  function webPlayer() {
    var v = null, prepared = false;
    function el() {
      if (!v) {
        v = document.createElement('video');
        v.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;background:#000;z-index:-1';
        document.body.appendChild(v);
        v.addEventListener('loadedmetadata', function () { prepared = true; HC.onPlayer('prepared', ''); });
        v.addEventListener('ended', function () { HC.onPlayer('ended', ''); });
        v.addEventListener('error', function () { HC.onPlayer('error', 'cannot play'); });
      }
      return v;
    }
    return {
      play: function (url, start) { var x = el(); prepared = false; x.src = url; x.currentTime = (start || 0) / 1000; var p = x.play(); if (p && p.catch) p.catch(function () { }); },
      pause: function () { if (v) v.pause(); },
      resume: function () { if (v) { var p = v.play(); if (p && p.catch) p.catch(function () { }); } },
      seek: function (ms) { if (v) v.currentTime = ms / 1000; },
      stop: function () { if (v) { v.pause(); v.removeAttribute('src'); v.load(); } prepared = false; },
      status: function () {
        if (!v) return '{"pos":0,"dur":0,"playing":false,"buffering":false,"prepared":false}';
        return JSON.stringify({ pos: Math.round(v.currentTime * 1000), dur: isFinite(v.duration) ? Math.round(v.duration * 1000) : 0, playing: !v.paused && !v.ended,
          buffering: v.readyState < 3, prepared: prepared, w: v.videoWidth, h: v.videoHeight });
      },
      tracks: function () { return '[]'; },
      selectTrack: function () { }
    };
  }

  // ================================================================== phone
  var P = { lib: null, tv: null, ws: null, ok: false, key: '', tries: 0, manual: false };
  var phoneNow = null, phoneVol = null, seeking = false, volDragging = false;
  var suppressUntil = 0, sheet = null;

  function phoneInit() {
    D.resume = {};
    $('tvChip').className = 'off';
    $('tvChip').addEventListener('click', function () { openSheet('tv'); });
    $('nowStop').innerHTML = icon('stop');
    $('nowBack').innerHTML = icon('rew');
    $('nowFwd').innerHTML = icon('ff');
    $('nowPadBtn').innerHTML = icon('remote');
    $('nowVolIcon').innerHTML = icon('vol');
    $('nowPlay').addEventListener('click', function () { phoneSend({ t: 'cmd', a: 'toggle' }); if (phoneNow) { phoneNow.playing = !phoneNow.playing; renderNow(); } });
    $('nowBack').addEventListener('click', function () { phoneSend({ t: 'cmd', a: 'skip', ms: -10000 }); });
    $('nowFwd').addEventListener('click', function () { phoneSend({ t: 'cmd', a: 'skip', ms: 10000 }); });
    $('nowStop').addEventListener('click', function () { phoneSend({ t: 'cmd', a: 'stop' }); });
    $('nowPadBtn').addEventListener('click', function () { openSheet('pad'); });
    $('nowAudio').innerHTML = icon('audio');
    $('nowSubs').innerHTML = icon('subs');
    $('nowAudio').addEventListener('click', function () { openSheet('tracks', 'audio'); });
    $('nowSubs').addEventListener('click', function () { openSheet('tracks', 'text'); });
    var seek = $('nowSeek');
    seek.addEventListener('input', function () { seeking = true; if (phoneNow) $('nowPos').textContent = fmtTime(seek.value / 1000 * phoneNow.dur); });
    seek.addEventListener('change', function () {
      if (phoneNow) phoneSend({ t: 'cmd', a: 'seek', ms: Math.round(seek.value / 1000 * phoneNow.dur) });
      setTimeout(function () { seeking = false; }, 1200);
    });
    var vs = $('nowVol');
    vs.addEventListener('input', function () { volDragging = true; $('nowVolNum').textContent = vs.value; phoneSend({ t: 'vol', v: +vs.value }); });
    vs.addEventListener('change', function () { setTimeout(function () { volDragging = false; }, 1200); });
    $('app').addEventListener('scroll', phoneScrolled, { passive: true });
    $('sheet').addEventListener('click', function (e) { if (e.target.id === 'sheet') closeSheet(); });

    loadLibrary();
    var saved = load('tv', null);
    if (saved && saved.ip) { P.key = saved.key || ''; connect(saved); }
    else discover();
  }

  function showPermission() {
    $('main').className = 'hide';
    $('empty').className = '';
    $('empty').innerHTML = '<h1>See your videos on the TV</h1><p>HomeCast needs to see the videos on this phone so the TV can play them. They stay on the phone and are sent only to your TV, over your Wi-Fi.</p>' +
      '<button class="bigbtn" id="permBtn">Allow access to videos</button>';
    $('permBtn').addEventListener('click', function () { if (A) A.askMediaPermission(); });
  }

  function loadLibrary() {
    try { P.lib = A ? JSON.parse(A.library()) : mockLibrary(); } catch (e) { P.lib = { items: [] }; }
    if (!P.ok) showLocal();
    if (P.ok) sendLibrary();
  }
  function mockLibrary() {
    var base = param('media') || 'http://127.0.0.1:8792';
    var n = +(param('count') || 3), items = [];
    for (var i = 1; i <= n; i++) items.push({ id: 'clip' + ((i - 1) % 3 + 1) + '.webm' + (i > 3 ? '~' + i : ''), title: 'Test clip ' + i, folder: i % 2 ? 'Camera' : 'Downloads', dur: 20000, w: 1280, h: 720, size: 1300000, date: 1760000000 + i });
    return { dev: 'testphone', name: 'Test phone', mockBase: base, token: param('token') || 'testtoken', items: items };
  }

  // The address the TV should use to reach this phone: the one on the TV's network.
  function myBase() {
    var lib = P.lib;
    if (!lib) return '';
    if (lib.mockBase) return lib.mockBase;
    var ips = lib.ips || [], pick = ips[0];
    if (P.tv) {
      var pre = P.tv.ip.split('.').slice(0, 3).join('.');
      ips.forEach(function (ip) { if (ip.split('.').slice(0, 3).join('.') === pre) pick = ip; });
    }
    return pick ? 'http://' + pick + ':' + lib.port : '';
  }
  function libItems() {
    var lib = P.lib, base = myBase();
    if (!lib) return [];
    return lib.items.map(function (it) {
      var o = {};
      for (var k in it) o[k] = it[k];
      o.mid = it.id;
      o.id = lib.dev + ':' + it.id;
      o.v = base + '/v/' + encodeURIComponent(it.id) + '?k=' + lib.token;
      o.th = base + '/t/' + encodeURIComponent(it.id) + '?k=' + lib.token;
      o.phone = lib.name;
      return o;
    });
  }

  function showLocal() {
    var list = libItems();
    D.items = {};
    list.forEach(function (it) { D.items[it.id] = it; });
    D.rows = buildRows(list, {}, false);
    D.off = D.rows.map(function () { return 0; });
    if (!D.rows[D.focus.r]) D.focus = { r: 0, c: 0 };
    phoneRender();
  }

  function phoneRender() {
    var has = D.rows.length > 0;
    $('main').className = has ? '' : 'hide';
    $('empty').className = has ? 'hide' : '';
    if (!has) {
      if (A && !A.hasMediaPermission()) showPermission();
      else $('empty').innerHTML = '<h1>No videos found</h1><p>Videos you record or download on this phone appear here. Videos in WhatsApp, Facebook, Instagram and TikTok folders are not shown.</p>';
    }
    renderRows();
    updateFocusView();
  }

  function discover() {
    setChip('Looking for your TV…', false);
    if (!A) { HC.onDiscover([{ ip: '127.0.0.1', port: 8790, name: 'Test TV' }]); return; }
    if (!A.onWifi()) { setChip('Not on Wi-Fi', false); openSheet('wifi'); return; }
    A.discover();
  }
  function onDiscover(list) {
    if (P.ok) return;
    if (list.length === 1 && !P.manual) { connect(list[0]); return; }
    P.found = list;
    setChip(list.length ? 'Choose your TV' : 'No TV found', false);
    openSheet('tv');
  }

  function connect(tv) {
    if (P.ws) { try { P.ws.onclose = null; P.ws.close(); } catch (e) { /* ignore */ } }
    P.tv = tv;
    P.ok = false;
    setChip('Connecting to ' + (tv.name || tv.ip) + '…', false);
    var sock;
    try { sock = new WebSocket('ws://' + tv.ip + ':' + (tv.port || 8790) + '/ws'); } catch (e) { retry(); return; }
    P.ws = sock;
    var opened = false;
    sock.onopen = function () {
      opened = true;
      var lib = P.lib || {};
      sock.send(JSON.stringify({ t: 'hello', dev: lib.dev || load('dev', ''), name: lib.name || 'Phone', key: P.key, code: P.code || '' }));
      P.code = '';
    };
    sock.onmessage = function (e) {
      var m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      onTv(m);
    };
    sock.onclose = function () {
      var was = P.ok;
      P.ok = false;
      P.ws = null;
      setChip(was ? 'Reconnecting…' : 'TV not reachable', false);
      if (!opened && !was && P.tries > 2) { P.tries = 0; discover(); return; }
      retry();
    };
  }
  function retry() {
    P.tries++;
    clearTimeout(P.retryTimer);
    P.retryTimer = setTimeout(function () { if (!P.ok && P.tv && !P.waitingCode) connect(P.tv); }, 3000);
  }

  function onTv(m) {
    if (m.t === 'need') {
      P.waitingCode = true;
      openSheet('code', m.bad);
      return;
    }
    if (m.t === 'rehello') {
      // the TV's screen restarted: say hello again
      P.ok = false;
      var lib = P.lib || {};
      if (P.ws) P.ws.send(JSON.stringify({ t: 'hello', dev: lib.dev || '', name: lib.name || 'Phone', key: P.key }));
      return;
    }
    if (m.t === 'welcome') {
      P.ok = true;
      P.tries = 0;
      P.waitingCode = false;
      P.key = m.key;
      P.tv.name = m.tv || P.tv.name;
      save('tv', { ip: P.tv.ip, port: P.tv.port || 8790, name: P.tv.name, key: m.key });
      setChip(P.tv.name, true);
      if (sheet === 'code' || sheet === 'tv') closeSheet();
      sendLibrary(true);
      return;
    }
    if (m.t === 'lib') {
      D.items = {};
      m.items.forEach(function (it) { D.items[it.id] = it; });
      D.rows = m.rows || [];
      D.resume = m.resume || {};
      D.off = D.rows.map(function (r, i) { return D.off[i] || 0; });
      if (!D.rows[D.focus.r]) D.focus = { r: 0, c: 0 };
      heroFor = '';
      phoneRender();
      if (!D.rows.length) showLocal();
      return;
    }
    if (m.t === 'state') applyState(m);
    if (m.t === 'msg') toast(m.text, 9000);
  }

  var lastLib = '';
  function sendLibrary(force) {
    if (!P.ok || !P.lib) return;
    var perm = A ? A.hasMediaPermission() : true;
    var items = libItems(), json = (perm ? 'p' : 'n') + JSON.stringify(items);
    if (!force && json === lastLib) return;
    lastLib = json;
    phoneSend({ t: 'lib', items: items, perm: perm });
  }
  function phoneSend(o) {
    if (P.ws && P.ok && P.ws.readyState === 1) { P.ws.send(JSON.stringify(o)); return true; }
    if (o.t === 'play' || o.t === 'cmd') { toast('Not connected to the TV yet.'); openSheet('tv'); }
    return false;
  }

  function setChip(text, ok) {
    $('tvChip').className = ok ? '' : 'off';
    $('tvChipText').textContent = text;
    if (!ok) { phoneNow = null; renderNow(); }
  }

  // ---- shared state from the TV
  function applyState(m) {
    var prevR = D.focus.r, prevOff = D.off.slice();
    D.focus = m.focus || D.focus;
    if (m.off) D.off = m.off;
    phoneVol = m.vol || phoneVol;
    phoneNow = m.view === 'player' ? m.now : null;
    var t = Date.now();
    suppressUntil = t + 700;
    updateFocusView();
    // follow the TV's selection: the row into view, each row to the TV's position
    var re = rowEls[D.focus.r];
    if (re && D.focus.r !== prevR) {
      var top = re.el.getBoundingClientRect().top, h = window.innerHeight;
      if (top < 60 || top > h - 260) $('app').scrollTop += top - 70;
    }
    rowEls.forEach(function (row, r) {
      if (D.off[r] === prevOff[r] && r !== D.focus.r) return;
      var card = row.cards[0];
      if (!card) return;
      var step = card.offsetWidth + 10;
      var want = (D.off[r] || 0) * step;
      var fc = row.cards[D.focus.c];
      if (r === D.focus.r && fc) {
        var l = fc.offsetLeft - 16, rr = l + fc.offsetWidth;
        if (l >= row.track.scrollLeft && rr <= row.track.scrollLeft + row.track.clientWidth) return;
        want = l;
      }
      if (Math.abs(row.track.scrollLeft - want) > 4) row.track.scrollLeft = want;
    });
    renderNow();
  }

  function phoneTapCard(r, c) {
    D.focus = { r: r, c: c };
    updateFocusView();
    phoneSend({ t: 'focus', r: r, c: c });
    var row = D.rows[r];
    if (row && row.ids[c]) phonePlay(row.ids[c], 'resume');
  }
  function phonePlay(id, from) {
    if (!P.ok) { toast('Connect to your TV first.'); openSheet('tv'); return; }
    phoneSend({ t: 'play', id: id, from: from });
  }

  // scrolling on the phone moves the TV too (after the finger stops)
  var vTimer = 0, hTimers = {};
  function phoneScrolled() {
    clearTimeout(vTimer);
    vTimer = setTimeout(function () {
      if (!P.ok) return;
      if (Date.now() < suppressUntil) { phoneScrolled(); return; }
      var best = -1;
      for (var r = 0; r < rowEls.length; r++) {
        var top = rowEls[r].el.getBoundingClientRect().top;
        if (top >= 50) { best = r; break; }
      }
      if (best >= 0 && best !== D.focus.r && $('app').scrollTop > 40) phoneSend({ t: 'top', r: best });
    }, 250);
  }
  function phoneRowScrolled(r, track) {
    clearTimeout(hTimers[r]);
    hTimers[r] = setTimeout(function () {
      if (!P.ok) return;
      if (Date.now() < suppressUntil) { phoneRowScrolled(r, track); return; }
      var card = rowEls[r] && rowEls[r].cards[0];
      if (!card) return;
      var first = Math.round(track.scrollLeft / (card.offsetWidth + 10));
      if (first !== (D.off[r] || 0)) { D.off[r] = first; phoneSend({ t: 'hs', r: r, first: first }); }
    }, 250);
  }

  function renderNow() {
    var n = phoneNow, box = $('now');
    box.className = n ? 'show' : '';
    if (!n) return;
    $('nowName').textContent = n.title;
    $('nowStatus').textContent = n.buffering ? 'Loading on the TV…' : (n.playing ? 'Playing on ' : 'Paused on ') + (P.tv ? P.tv.name : 'TV');
    if (n.th && $('nowImg').getAttribute('src') !== n.th) $('nowImg').src = n.th;
    $('nowPlay').innerHTML = icon(n.playing ? 'pause' : 'play');
    if (!seeking) {
      $('nowPos').textContent = fmtTime(n.pos);
      $('nowSeek').value = n.dur ? Math.round(n.pos / n.dur * 1000) : 0;
    }
    $('nowDur').textContent = fmtTime(n.dur);
    if (phoneVol && !volDragging) {
      $('nowVol').max = phoneVol.max || 15;
      $('nowVol').value = phoneVol.v;
      $('nowVolNum').textContent = phoneVol.v;
    }
  }

  // ---- sheets
  function openSheet(kind, extra) {
    sheet = kind;
    var b = $('sheetBox'), h = '';
    if (kind === 'tv') {
      var found = P.found || [];
      h = '<h2>Your TV</h2>' + (P.ok ? '<p>Connected to <b>' + esc(P.tv.name) + '</b> (' + esc(P.tv.ip) + ').</p>' : '<p>Open HomeCast on the TV, and keep the phone on the same Wi-Fi.</p>') +
        found.map(function (t, i) { return '<div class="tvItem" data-i="' + i + '">' + icon('tv') + '<div>' + esc(t.name) + '<small>' + esc(t.ip) + '</small></div></div>'; }).join('') +
        '<div class="row2"><button class="bigbtn alt" id="shSearch">Search again</button></div>' +
        '<p style="margin-top:16px">Or type the TV address shown on the TV (Phones):</p><input class="text" id="shIp" inputmode="decimal" placeholder="192.168.1.20">' +
        '<button class="bigbtn" id="shGo">Connect</button>' +
        '<div class="setRow" style="margin-top:18px">Sharing this phone\'s videos<span>' + (P.lib ? P.lib.items.length + ' videos' : '') + '</span></div>' +
        '<div class="setRow" id="shStop">Stop sharing and close<span>›</span></div>';
    } else if (kind === 'code') {
      h = '<h2>Enter the TV\'s code</h2><p>' + (extra ? 'That code isn\'t right. ' : '') + 'The 4-digit code is on the TV (Phones). You only need it once.</p>' +
        '<input class="text code" id="shCode" inputmode="numeric" maxlength="4" autocomplete="off"><button class="bigbtn" id="shCodeGo">Connect</button>';
    } else if (kind === 'wifi') {
      h = '<h2>Connect to Wi-Fi</h2><p>HomeCast only uses your home Wi-Fi (or the TV\'s hotspot), never mobile data. Connect this phone to the same Wi-Fi as the TV, then try again.</p><button class="bigbtn" id="shSearch">Try again</button>';
    } else if (kind === 'tracks') {
      var ts = ((phoneNow && phoneNow.tracks) || []).filter(function (t) { return t.type === extra; });
      var opts = ts.map(function (t, n) { return [t.i, (extra === 'audio' ? 'Sound ' : 'Subtitles ') + (n + 1) + (t.lang && t.lang !== 'und' ? ' (' + t.lang + ')' : '')]; });
      if (extra === 'text' && opts.length) opts.unshift([-1, 'Subtitles off']);
      h = '<h2>' + (extra === 'audio' ? 'Sound' : 'Subtitles') + '</h2>' + (opts.length
        ? opts.map(function (o) { return '<div class="setRow" data-ti="' + o[0] + '">' + esc(o[1]) + '<span>›</span></div>'; }).join('')
        : '<p>' + (extra === 'audio' ? 'This video has one sound track.' : 'This video has no subtitles inside it.') + '</p>');
    } else if (kind === 'pad') {
      h = '<h2>TV remote</h2><p>Moves the selection on the TV, just like its remote.</p><div class="pad">' +
        '<button class="u" data-k="up">' + icon('up') + '</button><button class="l" data-k="left">' + icon('left') + '</button>' +
        '<button class="k" data-k="ok">OK</button><button class="r" data-k="right">' + icon('right') + '</button><button class="d" data-k="down">' + icon('down') + '</button></div>' +
        '<div class="row2"><button class="bigbtn alt" data-k="back">Back</button><button class="bigbtn alt" data-k="playpause">' + icon('play') + icon('pause') + '</button></div>';
    }
    b.innerHTML = h;
    $('sheet').className = 'show';
    var el;
    if ((el = $('shSearch'))) el.addEventListener('click', function () { P.manual = true; closeSheet(); discover(); });
    if ((el = $('shGo'))) el.addEventListener('click', function () {
      var ip = $('shIp').value.trim();
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) { toast('Type the address like 192.168.1.20'); return; }
      closeSheet();
      P.key = '';
      connect({ ip: ip, port: 8790, name: ip });
    });
    if ((el = $('shStop'))) el.addEventListener('click', function () { if (A) { A.stopSharing(); A.exit(); } });
    if ((el = $('shCodeGo'))) el.addEventListener('click', submitCode);
    if ((el = $('shCode'))) {
      el.addEventListener('input', function () { if (el.value.length === 4) submitCode(); });
      setTimeout(function () { el.focus(); }, 50);
    }
    Array.prototype.forEach.call(b.querySelectorAll('.tvItem'), function (d) {
      d.addEventListener('click', function () { var t = (P.found || [])[+d.getAttribute('data-i')]; closeSheet(); if (t) { P.key = savedKeyFor(t); connect(t); } });
    });
    Array.prototype.forEach.call(b.querySelectorAll('[data-ti]'), function (d) {
      d.addEventListener('click', function () { var i = +d.getAttribute('data-ti'); phoneSend({ t: 'track', i: i, on: i >= 0 }); closeSheet(); });
    });
    Array.prototype.forEach.call(b.querySelectorAll('[data-k]'), function (d) {
      d.addEventListener('click', function () { phoneSend({ t: 'key', k: d.getAttribute('data-k') }); });
    });
  }
  function savedKeyFor(t) { var s = load('tv', null); return s && s.ip === t.ip ? s.key : ''; }
  function submitCode() {
    var v = $('shCode').value.trim();
    if (!/^\d{4}$/.test(v)) return;
    P.code = v;
    P.waitingCode = false;
    closeSheet();
    if (P.tv) connect(P.tv);
  }
  function closeSheet() { sheet = null; $('sheet').className = ''; }
  function phoneBack() {
    if (sheet) { closeSheet(); return; }
    if (A) A.exit();
  }

  // ================================================================== called by the app
  window.HC = {
    key: function (k, down, repeat) { key(k, down, repeat); },
    onPlayer: function (e, info) {
      if (!TV || view !== 'player') return;
      if (e === 'prepared' || e === 'ready') {
        $('pSpin').style.display = 'none';
        if (now) { now.buffering = false; now.tracks = trackList(); }
      }
      else if (e === 'buffering') $('pSpin').style.display = 'block';
      else if (e === 'ended') { stopPlayer(true); }
      else if (e === 'error') {
        var lost = 'Lost the connection to the phone. Keep HomeCast open on the phone and on the same Wi-Fi.';
        var why = {
          unsupported: 'This TV can\'t play this video\'s format.', network: lost, timeout: lost,
          unreachable: 'The TV can\'t reach the phone. Keep HomeCast open on the phone, and check the phone and TV are on the same Wi-Fi (not a guest network).',
          refused: 'The phone refused this video. Close and reopen HomeCast on the phone.',
          missing: 'That video is no longer on the phone.',
          stuck: 'The TV couldn\'t open this video. It may be too big for this TV to decode (tall phone screen recordings often are). Try another video.'
        }[info] || 'Couldn\'t play this video (' + info + ').';
        toast(why, 9000);
        broadcast({ t: 'msg', text: why });
        stopPlayer(false);
      }
      dirty();
    },
    onSubtitle: function (text) { $('pSubs').textContent = text; },
    onDiscover: function (list) { onDiscover(list); },
    onPermission: function (ok) { if (ok) { loadLibrary(); if (P.ok) sendLibrary(); } else showPermission(); },
    onResume: function () {
      if (TV) return;
      if (A) loadLibrary();
      if (!P.ok && P.tv) connect(P.tv);
    },
    onPause: function () { },
    debug: { state: function () { return { D: D, zone: zone, view: view, now: now, P: P, phones: phones, code: code }; } }
  };

  // keyboard (computer browsers, for testing)
  window.addEventListener('keydown', function (e) {
    var map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', Escape: 'back', Backspace: 'back', ' ': 'playpause' };
    var k = map[e.key];
    if (!k || (!TV && k !== 'back')) return;
    if (e.target && e.target.tagName === 'INPUT') return;
    e.preventDefault();
    key(k, true, e.repeat ? 6 : 0);
  });
  window.addEventListener('resize', function () { if (TV) { setFocus(D.focus.r, D.focus.c); updateFocusView(); } });

  if (TV) tvInit(); else phoneInit();
})();
