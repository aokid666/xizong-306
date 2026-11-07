/* ============================================================
   export.js — 导出为 PDF（一题一面；含高亮/标注/笔记/手写/导图）
   ============================================================ */
(function () {
  'use strict';
  var esc = function (s) { return U.esc(s); };

  /* ---------- 高亮与标注 ---------- */
  function renderMarked(text, marks) {
    text = text || '';
    var list = (marks || []).slice().sort(function (a, b) { return a.s - b.s; });
    if (!list.length) return { html: esc(text), notes: [] };
    var out = '', pos = 0, notes = [];
    list.forEach(function (m) {
      if (m.s < pos) return;
      out += esc(text.slice(pos, m.s));
      var seg = text.slice(m.s, m.e);
      var cls = m.k === 'hl' ? 'hl' : 'ul';
      var sup = '';
      if (m.n) { notes.push(m.n); sup = '<sup class="fn">' + notes.length + '</sup>'; }
      out += '<span class="mk-' + cls + '">' + esc(seg) + '</span>' + sup;
      pos = m.e;
    });
    out += esc(text.slice(pos));
    return { html: out, notes: notes };
  }

  function marksOf(qid, field) {
    return Store.marks(qid).filter(function (m) { return m.f === field; });
  }

  /* ---------- 手写：转成 SVG（矢量，打印清晰） ---------- */
  function hwSvg(qid, w) {
    var d = Store.hw(qid);
    if (!d || !d.s || !d.s.length) return '';
    var bw = d.w || 800, bh = d.h || 400;
    var scale = w / bw;
    var parts = d.s.map(function (st) {
      var p = st.p || [], pts = [];
      for (var i = 0; i + 1 < p.length; i += 2) pts.push((p[i] * scale) + ',' + (p[i + 1] * scale));
      return '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#222" stroke-width="' +
        Math.max(1, (st.w || 3) * scale) + '" stroke-linecap="round" stroke-linejoin="round"/>';
    }).join('');
    return '<div class="pg-hw"><div class="pg-lab">手写批注</div>' +
      '<svg viewBox="0 0 ' + w + ' ' + (bh * scale) + '" width="' + w + '">' + parts + '</svg></div>';
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
      '<img src="https://aokid666.github.io/xizong-lec/' + p.img.split('/').pop() + '" class="map-img"></div>';
  }

  /* ---------- 收集 ---------- */
  function collect(scope, f) {
    f = f || {};
    var items = [];
    function pick(q) {
      if (f.subj && q.subj !== f.subj) return;
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
    var bankName = q0.mock ? '模拟题' : '十年真题';
    var head = '【' + bankName + (q0.y ? ' · ' + q0.y : '') + '】' + (q0.label || '') +
      ' · ' + (q0.subj || '') + (chap ? ' · ' + (chap.p ? '第' + chap.p + '篇 ' : '') + chap.t : '');
    var h = '<section class="pg' + (fav ? ' fav' : '') + '">';
    if (fav) h += '<div class="pg-star ' + (odd ? 'r' : 'l') + '">' + starSvg() + '</div>';
    h += '<div class="pg-hd">' + esc(head) + '</div>';
    if (item.vignette) h += '<div class="pg-vig">' + esc(item.vignette) + '</div>';

    var fnotes = [];
    item.qs.forEach(function (q, i) {
      var tail = (item.vignette && item.tails && item.tails[i] != null) ? item.tails[i] : q.stem;
      var r = renderMarked(tail, opts.mark ? marksOf(q.id, 'stem') : []);
      var html = r.html; fnotes = fnotes.concat(r.notes || []);
      h += '<div class="pg-q">' + (item.qs.length > 1 ? '<b>' + (i + 1) + '．</b>' : '') + html + '</div>';
      h += '<div class="pg-opts">' + (q.opts || []).map(function (o) {
        var rr = renderMarked(o.v, opts.mark ? marksOf(q.id, 'opt' + o.k) : []);
        (rr.notes || []).forEach(function (n) { fnotes.push(n); });
        return '<div><span class="k">' + esc(o.k) + '．</span>' +
          (typeof rr === 'string' ? esc(o.v) : rr.html) + '</div>';
      }).join('') + '</div>';
      if (opts.withAnswer) {
        h += '<div class="pg-ans">答案：' + esc(Bank.truth(q) || '（无）') + '</div>';
        if (q.exp) {
          var re = renderMarked(q.exp, opts.mark ? marksOf(q.id, 'exp') : []);
          (re.notes || []).forEach(function (n) { fnotes.push(n); });
          h += '<div class="pg-exp">解析：' + (typeof re === 'string' ? esc(q.exp) : re.html) + '</div>';
        }
      }
      if (opts.note) h += noteHTML(q.id, imgs);
      if (opts.hw) h += hwSvg(q.id, 560);
    });
    if (opts.map) h += mapHTML(q0);
    if (fnotes.length) {
      h += '<div class="pg-fn"><div class="pg-lab">标注</div>' + fnotes.map(function (n, i) {
        return '<div>' + (i + 1) + '．' + esc(n) + '</div>';
      }).join('') + '</div>';
    }
    h += '<div class="pg-ft">' + (idx + 1) + '</div></section>';
    return h;
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
    var out = [], lastKey = '', part = 0;
    items.forEach(function (it, i) {
      var q0 = it.qs[0];
      var key = (q0.mock ? 'M|' + (q0.set || '模拟') : 'R|' + (q0.subj || ''));
      if (key !== lastKey) {
        lastKey = key;
        part++;
        var title = q0.mock ? ('第 ' + part + ' 部分 · 模拟题 · ' + (q0.set || ''))
          : ('第 ' + part + ' 部分 · 真题 · ' + (q0.subj || ''));
        var sub = q0.mock ? '' : ('1988–2026 · 共 ' +
          items.filter(function (x) { return !x.qs[0].mock && x.qs[0].subj === q0.subj; }).length + ' 题');
        out.push(dividerHTML(title, sub));
      }
      out.push(pageHTML(it, i, opts, imgs || {}));
    });
    return out;
  }

  window.ExportUI = {
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
        document.body.classList.add('printing');
        var back = function () {
          document.body.classList.remove('printing');
          window.removeEventListener('afterprint', back);
        };
        window.addEventListener('afterprint', back);
        U.toast('共 ' + items.length + ' 题，正在打开打印窗口…', 3000);
        setTimeout(function () { window.print(); }, 400);
      };
      if (opts.note) {
        U.toast('正在整理笔记…', 2000);
        loadImages(items).then(go).catch(function () { go({}); });
      } else {
        go({});
      }
    }
  };
})();
