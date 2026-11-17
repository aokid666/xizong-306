/* ============================================================
   export.js — 导出为 PDF（一题一面；含高亮/标注/笔记/手写/导图）
   ============================================================ */
(function () {
  'use strict';
  var esc = function (s) { return U.esc(s); };

  /* ---------- 高亮与标注 ---------- */
  var markColors = [
    ['#ffe98a', '#d9a800'], ['#c8ecc0', '#4aa96c'], ['#cfe4fb', '#4b7bd4'],
    ['#fcd9c0', '#e0762c'], ['#e8d6f7', '#a05fd0']
  ];

  function renderMarked(text, marks, notes, anchors) {
    text = text || '';
    var list = (marks || []).slice().sort(function (a, b) { return a.s - b.s; });
    var out = '', pos = 0, i = 0;
    anchors = anchors || [];
    function segment(end) {
      var html = '';
      while (i < anchors.length && anchors[i].index < end) {
        var anchor = anchors[i++];
        if (anchor.index < pos) continue;
        html += esc(text.slice(pos, anchor.index)) + '<span class="pg-hw-anchor">' + anchor.html;
        while (i < anchors.length && anchors[i].index === anchor.index) html += anchors[i++].html;
        pos = Math.min(end, anchor.index + (text.codePointAt(anchor.index) > 0xFFFF ? 2 : 1));
        html += esc(text.slice(anchor.index, pos)) + '</span>';
      }
      html += esc(text.slice(pos, end));
      pos = end;
      return html;
    }
    list.forEach(function (m) {
      if (m.s < pos) return;
      out += segment(m.s);
      var cls = m.k === 'hl' ? 'hl' : 'ul';
      var colors = markColors[(m.c || (m.k === 'hl' ? 1 : 3)) - 1] || markColors[0];
      var sup = '';
      if (m.n) { notes.push(m.n); sup = '<sup class="fn">' + notes.length + '</sup>'; }
      out += '<span class="mk-' + cls + '" style="--mark-fill:' + colors[0] +
        ';--mark-line:' + colors[1] + '">' + segment(m.e) + '</span>' + sup;
    });
    return out + segment(text.length);
  }

  function marksOf(qid, field, text) {
    var list = Store.marks(qid).filter(function (m) { return m.f === field; });
    if (!text) return list;
    return list.map(function (m) {
      var s0 = m.s, e0 = m.e;
      var tx = m.tx || '';
      if (tx && (e0 > text.length || text.slice(s0, e0) !== tx)) {
        var idx = text.indexOf(tx);
        if (idx >= 0) { s0 = idx; e0 = idx + tx.length; }
      }
      s0 = Math.max(0, Math.min(s0, text.length));
      e0 = Math.max(s0, Math.min(e0, text.length));
      return { i: m.i, s: s0, e: e0, k: m.k, n: m.n, c: m.c };
    }).filter(function (m) { return m.e > m.s; });
  }

  /* ---------- 手写：优先跟随正文字符，兼容按小问定位的旧笔迹 ---------- */
  function hwStroke(data, st, x0, y0, scale) {
    var p = st.p || st, pts = [];
    for (var i = 0; i + 1 < p.length; i += 2) {
      pts.push((p[i] - x0) * scale + ',' + (p[i + 1] - y0) * scale);
    }
    if (!pts.length) return '';
    if (pts.length === 1) pts.push(pts[0]);
    return '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' +
      esc(st.c || data.c || '#191919') + '" stroke-width="' + ((st.w || data.lw || 3) * scale) +
      '" stroke-linecap="round" stroke-linejoin="round"/>';
  }

  function strokeBounds(points) {
    var box = { left: points[0], right: points[0], top: points[1], bottom: points[1] };
    for (var i = 2; i + 1 < points.length; i += 2) {
      box.left = Math.min(box.left, points[i]);
      box.right = Math.max(box.right, points[i]);
      box.top = Math.min(box.top, points[i + 1]);
      box.bottom = Math.max(box.bottom, points[i + 1]);
    }
    return box;
  }

  function strokeShift(a, b) {
    // Earlier questions may have expanded between strokes. Use the saved offsets
    // within the same subquestion to put both strokes in the same coordinates.
    return a.block === b.block && a.block >= 0 && a.yOffset != null && b.yOffset != null
      ? a.yOffset - b.yOffset : 0;
  }

  function strokeGap(a, b) {
    var shift = strokeShift(a, b);
    var x = Math.max(0, b.box.left - a.box.right, a.box.left - b.box.right);
    var y = Math.max(0, b.box.top - a.box.bottom - shift, a.box.top + shift - b.box.bottom);
    return Math.hypot(x, y);
  }

  function distanceFromStart(entry, earlier) {
    var x = entry.point[0], y = entry.point[1] + strokeShift(entry, earlier);
    var p = earlier.point;
    var distance = Math.hypot(x - p[0], y - p[1]);
    for (var i = 2; i + 1 < p.length; i += 2) {
      var dx = p[i] - p[i - 2], dy = p[i + 1] - p[i - 1];
      var lengthSquared = dx * dx + dy * dy;
      if (!lengthSquared) continue;
      var fraction = ((x - p[i - 2]) * dx + (y - p[i - 1]) * dy) / lengthSquared;
      fraction = Math.max(0, Math.min(1, fraction));
      distance = Math.min(distance, Math.hypot(x - p[i - 2] - dx * fraction, y - p[i - 1] - dy * fraction));
    }
    return distance;
  }

  function attachFreehand(entries) {
    var pending = entries.filter(function (entry) { return !entry.anchor; });
    var frontier = entries.filter(function (entry) { return entry.anchor; });
    frontier.forEach(function (entry, index) {
      // An arrow drawn from a previous line can itself pick up another glyph.
      // Keep that stroke with the earlier ink when its starting point touches it.
      var nearest = entry.anchor.font / entry.anchor.scale / 2;
      for (var i = 0; i < index; i++) {
        var earlier = frontier[i];
        if (strokeGap(entry, earlier) > nearest) continue;
        var distance = distanceFromStart(entry, earlier);
        if (distance >= nearest) continue;
        nearest = distance;
        entry.root = earlier.root;
      }
    });
    // Follow a chain of nearby strokes (circle → arrow → handwriting).
    // When two annotations are nearby, the shortest chain decides the anchor.
    while (frontier.length && pending.length) {
      var nearest = 0;
      for (var i = 1; i < frontier.length; i++) {
        if (frontier[i].distance < frontier[nearest].distance) nearest = i;
      }
      var current = frontier.splice(nearest, 1)[0];
      if (!current.anchor) pending.splice(pending.indexOf(current), 1);
      var root = current.root;
      var gapLimit = 3 * root.anchor.font / root.anchor.scale;
      pending.forEach(function (other) {
        var gap = strokeGap(current, other);
        var distance = current.distance + gap + gapLimit / 4;
        if (gap > gapLimit || distance >= other.distance) return;
        if (!other.root) frontier.push(other);
        other.root = root;
        other.distance = distance;
      });
    }
  }

  function hwForPage(item, enabled) {
    var fields = new Map(), blocks = new Map();
    if (!enabled) return { fields: fields, blocks: blocks };
    item.qs.forEach(function (q, i) {
      var data = Store.hw(q.id);
      if (!data || !data.s) return;
      var entries = data.s.filter(function (st) {
        var p = st && (st.p || st);
        return p && p.length >= 2;
      }).map(function (st) {
        var p = st.p || st;
        var at = st.textAnchor;
        var anchor = at && at.font > 0 && at.scale > 0 && Number.isInteger(at.index) ? at : null;
        var entry = {
          stroke: st, point: p, anchor: anchor, box: strokeBounds(p),
          block: st.a >= 0 ? i + st.a : (i || -1),
          yOffset: st.a >= 0 && st.ay != null ? st.ay - p[1] : null,
          root: null, distance: anchor ? 0 : Infinity
        };
        if (anchor) entry.root = entry;
        return entry;
      });
      attachFreehand(entries);
      entries.forEach(function (entry) {
        var st = entry.stroke;
        var root = entry.root;
        if (root) {
          var at = root.anchor;
          var x0 = root.point[0] - at.dx / at.scale;
          var y0 = root.point[1] - at.dy / at.scale - strokeShift(entry, root);
          var key = at.qid + '|' + at.field;
          if (!fields.has(key)) fields.set(key, []);
          fields.get(key).push({
            index: at.index,
            html: '<svg aria-hidden="true" viewBox="0 0 ' + at.font + ' ' + at.font + '">' +
              hwStroke(data, st, x0, y0, at.scale) + '</svg>'
          });
          return;
        }
        var qAtBlock = item.qs[entry.block];
        var block = qAtBlock ? qAtBlock.id : '';
        var y0 = qAtBlock && entry.yOffset != null ? -entry.yOffset : 0;
        var w = data.w || 800, h = data.h || 400;
        var svg = '<svg aria-hidden="true" class="pg-hwover" viewBox="0 0 ' + w + ' ' + h + '">' +
          hwStroke(data, st, 0, y0, 1) + '</svg>';
        blocks.set(block, (blocks.get(block) || '') + svg);
      });
    });
    fields.forEach(function (list) { list.sort(function (a, b) { return a.index - b.index; }); });
    return { fields: fields, blocks: blocks };
  }

  /* ---------- 笔记 ---------- */
  function noteHTML(qid, imgs) {
    var n = Store.note(qid);
    if (!n || !n.blocks || !n.blocks.length) return '';
    var h = '<div class="pg-note"><div class="pg-lab">笔记</div>';
    n.blocks.forEach(function (b) {
      if (b.k === 't' && b.v && b.v.trim()) h += '<div class="nb-t">' + esc(b.v) + '</div>';
      else if (b.k === 'i' && imgs[b.v]) h += '<img src="' + imgs[b.v] + '" class="nb-img">';
    });
    return h + '</div>';
  }

  /* ---------- 导图截图 ---------- */
  function mapHTML(q0) {
    var m = window.XZ && window.XZ.maps;
    if (!m) return '';
    var pages = [];
    try { pages = Bank.mapPagesForQuestion(q0); } catch (e) { pages = []; }
    if (!pages.length) return '';
    var p = pages[0];
    return '<div class="pg-map"><div class="pg-lab">关联导图 · 第 ' + p.n + ' 页</div>' +
      '<img src="data/maps/' + p.img + '" class="map-img"></div>';
  }

  /* ---------- 收集 ---------- */
  function collect(scope, f) {
    f = f || {};
    var SS = (f.subjects && f.subjects.length) ? new Set(f.subjects) : null;
    var YY = (f.years && f.years.length) ? new Set(f.years.map(String)) : null;
    var BB = (f.banks && f.banks.length) ? new Set(f.banks) : null;
    var CC = (f.chaps && f.chaps.length) ? new Set(f.chaps) : null;
    var items = [];
    function pick(q) {
      if (SS && !SS.has(q.subj)) return;
      if (CC && !CC.has(q.subj + '|' + q.ci)) return;
      if (YY && q.y && !YY.has(String(q.y))) return;
      if (BB) {
        if (!q.mock && !BB.has('real')) return;
        if (q.mock && !BB.has('mock')) return;
      }
      if (f.year && String(q.y) !== String(f.year)) return;
      if (f.bank === 'real' && q.mock) return;
      if (f.bank === 'mock' && !q.mock) return;
      if (f.chap && String(q.ci) !== String(f.chap)) return;
      if (scope === 'fav' && !Store.isFav(q.id)) return;
      if (scope === 'wrong') { var p = Store.prog(q.id); if (!p || p.ok) return; }
      if (scope === 'flag' && !Store.flag(q.id)) return;
      if (scope === 'new') { if (Store.prog(q.id)) return; }
      if (scope === 'done') { if (!Store.prog(q.id)) return; }
      items.push(q);
    }
    Bank.subjectNames().forEach(function (n) { (Bank.loaded[n] || []).forEach(pick); });
    (Bank.mock ? Bank.mock.list : []).forEach(pick);
    return Bank.itemsOf(items);
  }

  function sortItems(items, by) {
    var arr = items.slice();
    if (by === 'year') {
      arr.sort(function (a, b) { return (b.qs[0].y || 0) - (a.qs[0].y || 0) || (a.qs[0].n - b.qs[0].n); });
    } else if (by === 'chapter') {
      arr.sort(function (a, b) {
        var ca = Bank.chapterMeta(a.qs[0].subj, a.qs[0].ci) || { t: '' };
        var cb = Bank.chapterMeta(b.qs[0].subj, b.qs[0].ci) || { t: '' };
        return (a.qs[0].subj || '').localeCompare(b.qs[0].subj || '') ||
          String(ca.t).localeCompare(String(cb.t)) || (a.qs[0].n - b.qs[0].n);
      });
    } else if (by === 'bank') {
      arr.sort(function (a, b) {
        var am = a.qs[0].mock ? 1 : 0, bm = b.qs[0].mock ? 1 : 0;
        if (am !== bm) return am - bm;
        var s1 = (a.qs[0].subj || '').localeCompare(b.qs[0].subj || '');
        if (s1) return s1;
        return (b.qs[0].y || 0) - (a.qs[0].y || 0) || (a.qs[0].n - b.qs[0].n);
      });
    } else {
      arr.sort(function (a, b) { return (a.qs[0].subj || '').localeCompare(b.qs[0].subj || ''); });
    }
    return arr;
  }

  function starSvg() {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="#d0021b">' +
      '<path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>';
  }

  function pageHTML(item, idx, opts, imgs) {
    var q0 = item.qs[0];
    var fav = Store.isFav(q0.id);
    var odd = (idx % 2 === 0);
    var chap = q0.mock ? null : Bank.chapterMeta(q0.subj, q0.ci);
    var bankName = opts.title ? opts.title : (q0.mock ? '模拟题' : '十年真题');
    var head = '【' + bankName + (q0.y ? ' · ' + q0.y : '') + '】' + (q0.label || '') +
      ' · ' + (q0.subj || '') + (chap ? ' · ' + (chap.p ? '第' + chap.p + '篇 ' : '') + chap.t : '');
    var h = '<section class="pg' + (fav ? ' fav' : '') + '">';
    if (fav) h += '<div class="pg-star ' + (odd ? 'r' : 'l') + '">' + starSvg() + '</div>';
    h += '<div class="pg-hd">' + esc(head) + '</div>';
    h += '<div class="pg-body">';
    var fnotes = [];
    var ink = hwForPage(item, opts.hw);
    function field(text, qid, key) {
      return renderMarked(text, opts.mark ? marksOf(qid, key, text) : [], fnotes, ink.fields.get(qid + '|' + key));
    }
    function option(o, qid, prefix) {
      return '<div><span class="k">' + esc(o.k) + '．</span>' + field(o.v, qid, prefix + o.k) + '</div>';
    }
    if (item.bGroup) {
      h += '<div class="pg-opts">' + (item.bShared || []).map(function (o) { return option(o, q0.id, 'sopt'); }).join('') + '</div>';
    }
    if (item.vignette) {
      h += '<div class="pg-vig">' + field(item.vignette, q0.id, 'case') + '</div>';
    }

    item.qs.forEach(function (q, i) {
      var tail = (item.vignette && item.tails && item.tails[i] != null) ? item.tails[i] : q.stem;
      if (item.vignette && tail && tail.indexOf(item.vignette) === 0) {
        tail = tail.slice(item.vignette.length).replace(/^[\s，。、；：,.;:]+/, '');
      }
      h += '<div class="pg-subq"><div class="pg-q">' +
        (item.qs.length > 1 ? '<b>' + (i + 1) + '．</b>' : '') + field(tail, q.id, 'stem') + '</div>';
      h += '<div class="pg-opts">' + (q.opts || []).map(function (o) {
        return item.bGroup ? '<span>' + esc(o.k) + ' </span>' : option(o, q.id, 'opt');
      }).join('') + '</div>';
      if (opts.withAnswer) {
        h += '<div class="pg-ans">答案：' + esc(Bank.truth(q) || '（无）') + '</div>';
      }
      if (opts.withExplanation && q.exp) h += '<div class="pg-exp">解析：' + field(q.exp, q.id, 'exp') + '</div>';
      if (opts.note) h += noteHTML(q.id, imgs);
      h += (ink.blocks.get(q.id) || '') + '</div>';
    });
    h += ink.blocks.get('') || '';
    h += '</div>';
    if (opts.map) h += mapHTML(q0);
    if (opts.mark) {
      var seen = new Set(fnotes);
      item.qs.forEach(function (q) {
        Store.marks(q.id).forEach(function (m) {
          if (m.f === 'exp' && !opts.withExplanation) return;
          if (m.n && !seen.has(m.n)) { seen.add(m.n); fnotes.push(m.n); }
        });
      });
    }

    if (fnotes.length) {
      h += '<div class="pg-fn"><div class="pg-lab">标注</div>' + fnotes.map(function (n, i) {
        return '<div>' + (i + 1) + '．' + esc(n) + '</div>';
      }).join('') + '</div>';
    }
    h += '<div class="pg-ft">' + (idx + 1) + '</div></section>';
    return h;
  }

  function coverHTML(items, sections, title) {
    return '<section class="pg cover">' +
      '<div class="cv-t">' + esc(title || '西综真题 · 题目册') + '</div>' +
      '<div class="cv-s">' + new Date().toLocaleDateString('zh-CN') + ' · 共 ' + items.length + ' 组题 · ' +
      sections.length + ' 个部分</div>' +
      (sections.length ? '<ol class="cv-list">' + sections.map(function (t) {
        return '<li>' + esc(t) + '</li>';
      }).join('') + '</ol>' : '') +
      '<div class="cv-f">考西医综合 · 就用这份</div></section>';
  }

  function dividerHTML(title, sub) {
    return '<section class="pg divider"><div class="dv-t">' + esc(title) + '</div>' +
      (sub ? '<div class="dv-s">' + esc(sub) + '</div>' : '') + '</section>';
  }

  /* 预先取出笔记图片（IndexedDB，异步） */
  function loadImages(items) {
    var ids = [];
    items.forEach(function (it) {
      it.qs.forEach(function (q) {
        var n = Store.note(q.id);
        if (!n || !n.blocks) return;
        n.blocks.forEach(function (b) { if (b.k === 'i' && b.v) ids.push(b.v); });
      });
    });
    var map = {};
    return Promise.all(ids.map(function (id) {
      return Store.getImage(id).then(function (src) { if (src) map[id] = src; }).catch(function () { });
    })).then(function () { return map; });
  }

  function buildPages(items, opts, imgs) {
    var out = [], lastKey = '', part = 0, sections = [];
    items.forEach(function (it, i) {
      var q0 = it.qs[0];
      var chapM = q0.mock ? null : Bank.chapterMeta(q0.subj, q0.ci);
      var key, title;
      if (opts.sort === 'year') {
        key = 'Y' + (q0.y || 0);
        title = '第 ' + (part + 1) + ' 部分 · ' + (q0.y || '') + ' 年';
      } else if (opts.sort === 'chapter') {
        key = (q0.mock ? 'M' : (q0.subj || '')) + '|' + (q0.ci || 0);
        title = '第 ' + (part + 1) + ' 部分 · ' + (q0.subj || '') + (chapM ? ' · ' + (chapM.p ? '第' + chapM.p + '篇 ' : '') + chapM.t : '');
      } else if (opts.sort === 'subject') {
        key = q0.mock ? 'M' : (q0.subj || '');
        title = '第 ' + (part + 1) + ' 部分 · ' + (q0.mock ? '模拟题' : (q0.subj || ''));
      } else {
        key = (q0.mock ? 'M|' + (q0.set || '模拟') : 'R|' + (q0.subj || ''));
        title = q0.mock ? ('第 ' + (part + 1) + ' 部分 · 模拟题 · ' + (q0.set || ''))
          : ('第 ' + (part + 1) + ' 部分 · 真题 · ' + (q0.subj || ''));
      }
      if (key !== lastKey) {
        lastKey = key;
        part++;
        title = title.replace('第 ' + (part - 1 + 1) + ' 部分', '第 ' + part + ' 部分');
        var sub = q0.mock ? '' : ('共 ' + items.filter(function (x) {
          return !x.qs[0].mock && x.qs[0].subj === q0.subj && (!chapM || String(x.qs[0].ci) === String(q0.ci));
        }).length + ' 题');
        sections.push(title.replace(/^第 \d+ 部分 · /, ''));
        out.push(dividerHTML(title, sub));
      }
      out.push(pageHTML(it, i, opts, imgs || {}));
    });
    if (opts.cover !== false) out.unshift(coverHTML(items, sections, opts.title));
    return out;
  }

  function chooseItems(items, opts) {
    if (!items || !items.length) { U.toast('这里没有题目'); return; }
    opts = opts || {};
    var box = U.el('div');
    box.innerHTML = '<p class="hint" style="margin-bottom:10px">导出 ' + items.length + ' 组题' +
      (opts.title ? '（' + esc(opts.title) + '）' : '') + '</p>' +
      '<label class="chk"><input type="checkbox" data-ex="mark" checked> 高亮与标注</label>' +
      '<label class="chk"><input type="checkbox" data-ex="note" checked> 笔记（文字+图片）</label>' +
      '<label class="chk"><input type="checkbox" data-ex="hw" checked> 手写</label>' +
      '<label class="chk"><input type="checkbox" data-ex="map" checked> 关联导图</label>' +
      '<label class="chk"><input type="checkbox" data-ex="withAnswer"> 答案</label>' +
      '<label class="chk"><input type="checkbox" data-ex="withExplanation"> 解析</label>';
    U.modal({
      title: '导出 PDF', body: box, buttons: [
        { label: '取消' },
        { label: '开始导出', cls: 'primary', onClick: function () {
          var choices = {};
          box.querySelectorAll('[data-ex]').forEach(function (input) { choices[input.dataset.ex] = input.checked; });
          U.closeModal();
          runWith(items, Object.assign({}, opts, choices));
        } }
      ]
    });
  }

  function runWith(items, opts) {
    opts = opts || {};
    if (!items || !items.length) { U.toast('这里没有题目'); return; }
    var box = document.getElementById('print-root');
    var full = Object.assign({ mark: true, note: true, hw: true, map: true, sort: 'bank' }, opts);
    prepAll(items, full).then(function (imgs) {
      var arr = (opts.sort && opts.sort !== 'seq') ? sortItems(items, opts.sort) : items;
      var mkCount = 0;
      arr.forEach(function (it) { it.qs.forEach(function (q) { mkCount += Store.marks(q.id).length; }); });
      if (opts.mark !== false && mkCount === 0) U.toast('提示：这批题里没有高亮/标注记录', 3000);
      box.innerHTML = buildPages(arr, full, imgs).join('');
      beginPrint(full.title);
      U.toast('共 ' + arr.length + ' 组，正在准备打印…', 2000);
      waitForImages(box).then(function () {
        setTimeout(function () { printPages(box); }, 300);
      });
    });
  }

  function prepAll(items, opts) {
    var pr = (opts.map !== false && Bank.ensureMaps) ? Bank.ensureMaps().catch(function () { }) : Promise.resolve();
    return pr.then(function () { return opts.note === false ? {} : loadImages(items); }).catch(function () { return {}; });
  }

  function waitForImages(box) {
    return Promise.all(Array.from(box.querySelectorAll('img'), function (img) {
      if (img.complete) return Promise.resolve();
      return new Promise(function (resolve) {
        img.addEventListener('load', ready);
        img.addEventListener('error', ready);
        if (img.complete) ready();
        function ready() {
          img.removeEventListener('load', ready);
          img.removeEventListener('error', ready);
          resolve();
        }
      });
    }));
  }

  function fitPrintInk(box) {
    var fits = [];
    box.querySelectorAll('.pg').forEach(function (page) {
      var strokes = page.querySelectorAll('.pg-hwover polyline, .pg-hw-anchor polyline');
      if (!strokes.length) return;
      var paper = page.getBoundingClientRect();
      var left = 0, right = paper.width;
      var inset = 2;
      strokes.forEach(function (stroke) {
        var rect = stroke.getBoundingClientRect();
        var matrix = stroke.getScreenCTM();
        var radius = matrix ? Number(stroke.getAttribute('stroke-width')) * Math.hypot(matrix.a, matrix.c) / 2 : 0;
        left = Math.min(left, rect.left - paper.left - radius - inset);
        right = Math.max(right, rect.right - paper.left + radius + inset);
      });
      if (left < 0 || right > paper.width) {
        fits.push({ page: page, offset: -left, zoom: paper.width / (right - left) });
      }
    });
    // Scale the complete layout so the circle, arrow and writing keep their
    // relative positions. A fixed pre-scale A4 width prevents another reflow.
    fits.forEach(function (fit) {
      fit.page.style.marginLeft = fit.offset + 'px';
      fit.page.style.zoom = String(fit.zoom);
    });
  }

  function printPages(box) {
    fitPrintInk(box);
    document.getElementById('toast').hidden = true;
    window.print();
  }

  function beginPrint(title, done) {
    var oldTitle = document.title;
    if (title) document.title = title;
    document.body.classList.add('printing');
    window.addEventListener('afterprint', function () {
      document.body.classList.remove('printing');
      if (title) document.title = oldTitle;
      if (done) done();
    }, { once: true });
  }

  function printGroup(items, opts) {
    return new Promise(function (resolve) {
      var box = document.getElementById('print-root');
      prepAll(items, opts).then(function (imgs) {
        var arr = (opts.sort && opts.sort !== 'seq') ? sortItems(items, opts.sort) : items;
        var mkCount = 0;
        arr.forEach(function (it) { it.qs.forEach(function (q) { mkCount += Store.marks(q.id).length; }); });
        if (opts.mark !== false && mkCount === 0) U.toast('提示：这批题里没有高亮/标注记录', 3000);
        box.innerHTML = buildPages(arr, opts, imgs).join('');
        beginPrint(opts.title, resolve);
        waitForImages(box).then(function () {
          U.toast('共 ' + arr.length + ' 组：请选择「另存为 PDF」', 4000);
          setTimeout(function () { printPages(box); }, 400);
        });
      }).catch(function () { resolve(); });
    });
  }

  window.ExportUI = {
    runMulti: function (groups, opts) {
      var i = 0;
      var next = function () {
        if (i >= groups.length) { U.toast('全部导出完成', 2500); return; }
        var g = groups[i++];
        U.toast('第 ' + i + ' / ' + groups.length + ' 册：' + (g.title || ''), 3000);
        printGroup(g.items, Object.assign({}, opts, { title: g.title })).then(function () { setTimeout(next, 600); });
      };
      next();
    },
    runItems: runWith,
    chooseItems: chooseItems,
    collect: collect,
    sortItems: sortItems,
    buildPages: buildPages,
    run: function (opts) {
      var items = collect(opts.scope, opts);
      if (!items.length) { U.toast('这个范围里没有题目'); return; }
      items = sortItems(items, opts.sort);
      if (opts.limit) items = items.slice(0, opts.limit);
      var box = document.getElementById('print-root');
      var go = function (imgs) {
        box.innerHTML = buildPages(items, opts, imgs).join('');
        beginPrint(opts.title);
        U.toast('共 ' + items.length + ' 题，正在准备打印…', 2000);
        Promise.all([waitForImages(box), new Promise(function (r) { setTimeout(r, 300); })])
          .then(function () { printPages(box); });
      };
      var prep = (opts.map && Bank.ensureMaps) ? Bank.ensureMaps().catch(function () { }) : Promise.resolve();
      if (opts.note) {
        U.toast('正在整理笔记与图片…', 2000);
        prep.then(function () { return loadImages(items); }).then(go).catch(function () { go({}); });
      } else {
        prep.then(function () { go({}); }).catch(function () { go({}); });
      }
    }
  };
})();
