/* ============================================================
   export.js — 导出为 PDF（一题一面，可打印）
   ============================================================ */
(function () {
  'use strict';

  function esc(s) { return U.esc(s); }

  function collect(scope) {
    const items = [];
    Bank.subjectNames().forEach(function (n) {
      (Bank.loaded[n] || []).forEach(function (q) {
        if (scope === 'fav' && !Store.isFav(q.id)) return;
        if (scope === 'wrong') { const p = Store.prog(q.id); if (!p || p.ok) return; }
        if (scope === 'flag' && !Store.flag(q.id)) return;
        if (scope === 'new') { if (Store.prog(q.id)) return; }
        items.push(q);
      });
    });
    (Bank.mock ? Bank.mock.list : []).forEach(function (q) {
      if (scope === 'fav' && !Store.isFav(q.id)) return;
      if (scope === 'wrong') { const p = Store.prog(q.id); if (!p || p.ok) return; }
      if (scope === 'flag' && !Store.flag(q.id)) return;
      if (scope === 'new') { if (Store.prog(q.id)) return; }
      items.push(q);
    });
    return Bank.itemsOf(items);
  }

  function sortItems(items, by) {
    const arr = items.slice();
    if (by === 'year') {
      arr.sort(function (a, b) { return (b.qs[0].y || 0) - (a.qs[0].y || 0) || (a.qs[0].n - b.qs[0].n); });
    } else if (by === 'chapter') {
      arr.sort(function (a, b) {
        const ca = Bank.chapterMeta(a.qs[0].subj, a.qs[0].ci) || { t: '' };
        const cb = Bank.chapterMeta(b.qs[0].subj, b.qs[0].ci) || { t: '' };
        return (a.qs[0].subj || '').localeCompare(b.qs[0].subj || '') ||
          String(ca.t).localeCompare(String(cb.t)) || (a.qs[0].n - b.qs[0].n);
      });
    } else {
      arr.sort(function (a, b) { return (a.qs[0].subj || '').localeCompare(b.qs[0].subj || ''); });
    }
    return arr;
  }

  function starSvg() {
    return '<svg viewBox="0 0 24 24" width="22" height="22" fill="#d0021b">' +
      '<path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>';
  }

  function pageHTML(item, idx, opts) {
    const q0 = item.qs[0];
    const fav = Store.isFav(q0.id);
    const odd = (idx % 2 === 0);
    let h = '<section class="pg' + (fav ? ' fav' : '') + '">';
    if (fav) h += '<div class="pg-star ' + (odd ? 'r' : 'l') + '">' + starSvg() + '</div>';
    h += '<div class="pg-hd">' + esc(q0.label || '') + (q0.mock ? ' · 模拟题' : '') +
      ' · ' + esc(q0.subj || '') + '</div>';
    if (item.vignette) h += '<div class="pg-vig">' + esc(item.vignette) + '</div>';
    item.qs.forEach(function (q, i) {
      const tail = (item.vignette && item.tails && item.tails[i] != null) ? item.tails[i] : q.stem;
      h += '<div class="pg-q">' + (item.qs.length > 1 ? '<b>' + (i + 1) + '．</b>' : '') + esc(tail) + '</div>';
      h += '<div class="pg-opts">' + (q.opts || []).map(function (o) {
        return '<div><span class="k">' + esc(o.k) + '．</span>' + esc(o.v) + '</div>';
      }).join('') + '</div>';
      if (opts.withAnswer) {
        h += '<div class="pg-ans">答案：' + esc(Bank.truth(q) || '（无）') + '</div>';
        if (q.exp) h += '<div class="pg-exp">解析：' + esc(q.exp) + '</div>';
      }
    });
    h += '<div class="pg-ft">' + (idx + 1) + '</div></section>';
    return h;
  }

  window.ExportUI = {
    collect: collect,
    sortItems: sortItems,
    pageHTML: pageHTML,
    run: function (opts) {
      let items = collect(opts.scope);
      if (!items.length) { U.toast('这个范围里没有题目'); return; }
      items = sortItems(items, opts.sort);
      if (opts.limit) items = items.slice(0, opts.limit);
      const box = document.getElementById('print-root');
      box.innerHTML = items.map(function (it, i) { return pageHTML(it, i, opts); }).join('');
      document.body.classList.add('printing');
      const back = function () {
        document.body.classList.remove('printing');
        window.removeEventListener('afterprint', back);
      };
      window.addEventListener('afterprint', back);
      U.toast('共 ' + items.length + ' 页，正在打开打印窗口…', 3000);
      setTimeout(function () { window.print(); }, 300);
    }
  };
})();
