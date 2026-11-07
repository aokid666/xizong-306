/* ============================================================
   export.js — 导出为 PDF（一题一面，可打印）
   ============================================================ */
(function () {
  'use strict';

  function esc(s) { return U.esc(s); }

  function collect(scope, subj) {
    const items = [];
    Bank.subjectNames().forEach(function (n) {
      (Bank.loaded[n] || []).forEach(function (q) {
        if (subj && q.subj !== subj) return;
        if (scope === 'fav' && !Store.isFav(q.id)) return;
        if (scope === 'wrong') { const p = Store.prog(q.id); if (!p || p.ok) return; }
        if (scope === 'flag' && !Store.flag(q.id)) return;
        if (scope === 'new') { if (Store.prog(q.id)) return; }
        if (scope === 'done') { if (!Store.prog(q.id)) return; }
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
    } else if (by === 'bank') {
      arr.sort(function (a, b) {
        const am = a.qs[0].mock ? 1 : 0, bm = b.qs[0].mock ? 1 : 0;
        if (am !== bm) return am - bm;
        return (b.qs[0].y || 0) - (a.qs[0].y || 0) || (a.qs[0].n - b.qs[0].n);
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
    const chap = q0.mock ? null : Bank.chapterMeta(q0.subj, q0.ci);
    const bankName = q0.mock ? '模拟题' : '十年真题';
    const head = '【' + bankName + (q0.y ? ' · ' + q0.y : '') + '】' + (q0.label || '') +
      ' · ' + (q0.subj || '') + (chap ? ' · ' + (chap.p ? '第' + chap.p + '篇 ' : '') + chap.t : '');
    h += '<div class="pg-hd">' + esc(head) + '</div>';
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

  function dividerHTML(title, sub) {
    return '<section class="pg divider"><div class="dv-t">' + esc(title) + '</div>' +
      (sub ? '<div class="dv-s">' + esc(sub) + '</div>' : '') + '</section>';
  }

  function buildPages(items, opts) {
    const out = [];
    let lastKey = '';
    let part = 0;
    items.forEach(function (it, i) {
      const q0 = it.qs[0];
      const key = (q0.mock ? 'M' : 'R') + '|' + (q0.mock ? (q0.set || '模拟') : (q0.subj || ''));
      if (key !== lastKey) {
        lastKey = key;
        part++;
        const title = q0.mock ? ('第 ' + part + ' 部分 · 模拟题 · ' + (q0.set || '')) :
          ('第 ' + part + ' 部分 · 真题 · ' + (q0.subj || ''));
        const sub = q0.mock ? '' : ('1988–2026 · 共 ' + items.filter(function (x) { return !x.qs[0].mock && x.qs[0].subj === q0.subj; }).length + ' 题');
        out.push(dividerHTML(title, sub));
      }
      out.push(pageHTML(it, i, opts));
    });
    return out;
  }

  window.ExportUI = {
    buildPages: buildPages,
    collect: collect,
    sortItems: sortItems,
    pageHTML: pageHTML,
    run: function (opts) {
      let items = collect(opts.scope, opts.subj);
      if (!items.length) { U.toast('这个范围里没有题目'); return; }
      items = sortItems(items, opts.sort);
      if (opts.limit) items = items.slice(0, opts.limit);
      const box = document.getElementById('print-root');
      box.innerHTML = buildPages(items, opts).join('');
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
