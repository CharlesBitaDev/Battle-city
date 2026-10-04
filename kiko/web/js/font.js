// Pixel font (5x7) and cached text drawing.
// Written for old Android TV WebViews: plain ES2017, no modules.
var BC = window.BC || (window.BC = {});

(function () {
  'use strict';

  var G = {
    'A': [14, 17, 17, 31, 17, 17, 17], 'B': [30, 17, 17, 30, 17, 17, 30],
    'C': [14, 17, 16, 16, 16, 17, 14], 'D': [30, 17, 17, 17, 17, 17, 30],
    'E': [31, 16, 16, 30, 16, 16, 31], 'F': [31, 16, 16, 30, 16, 16, 16],
    'G': [14, 17, 16, 23, 17, 17, 15], 'H': [17, 17, 17, 31, 17, 17, 17],
    'I': [14, 4, 4, 4, 4, 4, 14], 'J': [7, 2, 2, 2, 2, 18, 12],
    'K': [17, 18, 20, 24, 20, 18, 17], 'L': [16, 16, 16, 16, 16, 16, 31],
    'M': [17, 27, 21, 21, 17, 17, 17], 'N': [17, 17, 25, 21, 19, 17, 17],
    'O': [14, 17, 17, 17, 17, 17, 14], 'P': [30, 17, 17, 30, 16, 16, 16],
    'Q': [14, 17, 17, 17, 21, 18, 13], 'R': [30, 17, 17, 30, 20, 18, 17],
    'S': [15, 16, 16, 14, 1, 1, 30], 'T': [31, 4, 4, 4, 4, 4, 4],
    'U': [17, 17, 17, 17, 17, 17, 14], 'V': [17, 17, 17, 17, 17, 10, 4],
    'W': [17, 17, 17, 21, 21, 21, 10], 'X': [17, 17, 10, 4, 10, 17, 17],
    'Y': [17, 17, 10, 4, 4, 4, 4], 'Z': [31, 1, 2, 4, 8, 16, 31],
    '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14],
    '2': [14, 17, 1, 2, 4, 8, 31], '3': [31, 2, 4, 2, 1, 17, 14],
    '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14],
    '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8],
    '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12],
    ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12],
    ':': [0, 12, 12, 0, 12, 12, 0], '-': [0, 0, 0, 31, 0, 0, 0],
    '/': [1, 1, 2, 4, 8, 16, 16], '!': [4, 4, 4, 4, 4, 0, 4],
    '?': [14, 17, 1, 2, 4, 0, 4], ',': [0, 0, 0, 0, 12, 4, 8],
    "'": [4, 4, 8, 0, 0, 0, 0], '(': [2, 4, 8, 8, 8, 4, 2],
    ')': [8, 4, 2, 2, 2, 4, 8], '>': [8, 4, 2, 1, 2, 4, 8],
    '<': [2, 4, 8, 16, 8, 4, 2], '+': [0, 4, 4, 31, 4, 4, 0],
    '#': [10, 10, 31, 10, 31, 10, 10], '=': [0, 0, 31, 0, 31, 0, 0],
    '&': [12, 18, 20, 8, 21, 18, 13], 'x': [0, 0, 17, 10, 4, 10, 17]
  };

  var cache = {};
  var cacheCount = 0;

  function glyphs(str, color, scale) {
    var key = str + '|' + color + '|' + scale;
    var c = cache[key];
    if (c) return c;
    if (cacheCount > 500) { cache = {}; cacheCount = 0; }
    c = document.createElement('canvas');
    c.width = Math.max(1, str.length * 6 - 1) * scale;
    c.height = 7 * scale;
    var x = c.getContext('2d');
    x.fillStyle = color;
    for (var i = 0; i < str.length; i++) {
      var g = G[str.charAt(i)] || G['?'];
      for (var r = 0; r < 7; r++) {
        var row = g[r];
        if (!row) continue;
        for (var b = 0; b < 5; b++) {
          if (row & (16 >> b)) x.fillRect((i * 6 + b) * scale, r * scale, scale, scale);
        }
      }
    }
    cache[key] = c;
    cacheCount++;
    return c;
  }

  function prep(str) {
    // Keep the small 'x' (times sign); everything else upper case.
    return String(str).toUpperCase().replace(/ X /g, ' x ');
  }

  // Draws text; returns its width. align: 'left' (default), 'center', 'right'.
  BC.text = function (ctx, str, x, y, color, scale, align) {
    var c = glyphs(prep(str), color || '#fff', scale || 1);
    if (align === 'center') x -= (c.width / 2) | 0;
    else if (align === 'right') x -= c.width;
    ctx.drawImage(c, x | 0, y | 0);
    return c.width;
  };

  BC.textWidth = function (str, scale) {
    return (String(str).length * 6 - 1) * (scale || 1);
  };

  // Splits text into lines of at most `max` characters.
  BC.wrap = function (str, max) {
    var words = String(str).split(' ');
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!line) line = w;
      else if ((line + ' ' + w).length <= max) line += ' ' + w;
      else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    return lines;
  };

  // Big title letters filled with a brick pattern.
  BC.brickText = function (ctx, str, x, y, scale, align) {
    str = String(str).toUpperCase();
    var w = BC.textWidth(str, scale);
    if (align === 'center') x -= (w / 2) | 0;
    for (var i = 0; i < str.length; i++) {
      var g = G[str.charAt(i)] || G['?'];
      for (var r = 0; r < 7; r++) {
        for (var b = 0; b < 5; b++) {
          if (!(g[r] & (16 >> b))) continue;
          var px = x + (i * 6 + b) * scale;
          var py = y + r * scale;
          ctx.fillStyle = '#b5541f';
          ctx.fillRect(px, py, scale, scale);
          ctx.fillStyle = '#e8834a';
          ctx.fillRect(px, py, scale - 1, 1);
          ctx.fillStyle = '#4a1c08';
          ctx.fillRect(px, py + scale - 1, scale, 1);
          ctx.fillRect(px + (((r & 1) ? 1 : scale - 1)), py, 1, scale - 1);
        }
      }
    }
    return w;
  };
})();
