/* ============================================================
   mapview.js — 思维导图：浏览、手写、笔记、题目内嵌
   ============================================================ */
(function () {
  'use strict';

  const MAP_HW_PREFIX = 'MAP:';

  /* ---------------- 手写画布（导图专用） ---------------- */
  function attachCanvas(wrapEl, key, imgEl) {
    const cv = wrapEl.querySelector('canvas.mv-hw');
    if (!cv) return null;
    let strokes = [];
    let tool = 'pen', color = '#191919', width = 3;
    let drawing = false, cur = null;

    function size() {
      const img = wrapEl.querySelector('img.mv-img');
      if (!img) return;
      const w = img.clientWidth || img.naturalWidth;
      const h = img.clientHeight || img.naturalHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.style.width = w + 'px';
      cv.style.height = h + 'px';
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv._lw = w; cv._lh = h;
      redraw();
    }

    function redraw() {
      const ctx = cv.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      strokes.forEach(function (st) {
        const pts = st.p;
        const scale = cv._lw / (st.bw || cv._lw);
        ctx.beginPath();
        ctx.strokeStyle = st.c || '#191919';
        ctx.lineWidth = (st.w || 3) * scale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 0; i < pts.length; i += 2) {
          const x = pts[i] * scale, y = pts[i + 1] * scale;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
    }

    function load() {
      const d = Store.hw(MAP_HW_PREFIX + key);
      strokes = d && d.s ? d.s.map(function (s) {
        return { p: s.p || s, c: s.c || '#191919', w: s.w || 3, bw: d.w };
      }) : [];
      if (d && d.w) cv._bw = d.w;
    }

    function save() {
      Store.setHw(MAP_HW_PREFIX + key, {
        w: cv._lw || 1, h: cv._lh || 1,
        s: strokes.map(function (s) { return { p: s.p, c: s.c, w: s.w }; })
      });
    }

    const pos = function (e) {
      const r = cv.getBoundingClientRect();
      const scale = (cv._lw || 1) / (cv._bw || cv._lw || 1);
      return [(e.clientX - r.left) / (scale || 1), (e.clientY - r.top) / (scale || 1)];
    };

    function erase(x, y) {
      const R2 = 144;
      function d2seg(ax, ay, bx, by, px, py) {
        const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
        const l2 = vx * vx + vy * vy;
        let t = l2 ? (wx * vx + wy * vy) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
        return dx * dx + dy * dy;
      }
      const before = strokes.length;
      strokes = strokes.filter(function (st) {
        const p = st.p;
        if (p.length <= 2) {
          const dx = p[0] - x, dy = p[1] - y;
          return dx * dx + dy * dy > R2;
        }
        for (let i = 0; i + 3 < p.length; i += 2) {
          if (d2seg(p[i], p[i + 1], p[i + 2], p[i + 3], x, y) <= R2) return false;
        }
        return true;
      });
      if (strokes.length !== before) { save(); redraw(); }
    }

    cv.addEventListener('pointerdown', function (e) {
      if (!wrapEl.classList.contains('mv-draw')) return;
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (err) { }
      const p = pos(e);
      if (tool === 'eraser') { erase(p[0], p[1]); return; }
      drawing = true;
      cur = { p: [p[0], p[1]], c: color, w: width };
      strokes.push(cur);
      redraw();
    });
    cv.addEventListener('pointermove', function (e) {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      cur.p.push(p[0], p[1]);
      redraw();
    });
    const end = function () {
      if (!drawing) return;
      drawing = false;
      save();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);

    load();
    if (imgEl && imgEl.complete) size();
    else if (imgEl) imgEl.addEventListener('load', size);
    else size();

    return {
      setTool: function (t) { tool = t; },
      setColor: function (c) { color = c; tool = 'pen'; },
      setWidth: function (w) { width = w; },
      undo: function () { strokes.pop(); save(); redraw(); },
      clear: function () { strokes = []; save(); redraw(); },
      resize: size,
      refocus: function () { cv._bw = cv._lw; size(); }
    };
  }

  /* ---------------- 单页查看器（带手写 + 笔记） ---------------- */
  function viewer(host, pages, opt) {
    opt = opt || {};
    let idx = 0;
    host.innerHTML = '';

    const bar = U.el('div', { class: 'mv-bar' });
    const stage = U.el('div', { class: 'mv-stage' });
    const tools = U.el('div', { class: 'mv-tools' });
    const noteBox = U.el('div', { class: 'mv-note' });
    host.appendChild(bar);
    host.appendChild(stage);
    host.appendChild(tools);
    host.appendChild(noteBox);

    let api = null;

    function renderPage() {
      const p = pages[idx];
      if (!p) { stage.innerHTML = '<div class="empty">没有对应的导图</div>'; return; }
      bar.innerHTML = '<button class="btn ghost sm" data-mv="prev">← 上一页</button>' +
        '<span class="mv-pos">第 ' + p.n + ' / ' + pages[pages.length - 1].n + ' 页</span>' +
        '<span class="hint">' + esc(p.s || '') + (p.c ? ' · ' + esc(p.c) : '') + '</span>' +
        '<span style="flex:1"></span>' +
        '<button class="btn ghost sm" data-mv="next">下一页 →</button>';
      stage.innerHTML = '<div class="mv-wrap"><img class="mv-img" src="data/maps/' + p.img + '" alt="思维导图">' +
        '<canvas class="mv-hw"></canvas></div>';
      const wrap = stage.querySelector('.mv-wrap');
      const img = stage.querySelector('.mv-img');
      api = attachCanvas(wrap, p.n, img);

      tools.innerHTML = '<button class="icon-btn on" data-mvt="pen" title="画笔">✎</button>' +
        '<button class="icon-btn" data-mvt="eraser" title="橡皮">⌫</button>' +
        '<span class="hw-color on" data-mvc="#191919" style="background:#191919"></span>' +
        '<span class="hw-color" data-mvc="#bf2b2b" style="background:#bf2b2b"></span>' +
        '<span class="hw-color" data-mvc="#2b57a5" style="background:#2b57a5"></span>' +
        '<button class="icon-btn" data-mvw="2" title="细">·</button>' +
        '<button class="icon-btn on" data-mvw="3" title="中">●</button>' +
        '<button class="icon-btn" data-mvw="1.5" title="粗">⬤</button>' +
        '<button class="icon-btn" data-mvt2="undo" title="撤销">↶</button>' +
        '<button class="icon-btn" data-mvt2="clear" title="清空">✕</button>' +
        '<button class="icon-btn" data-mvzoom="1" title="放大看">⤢</button>' +
        '<span style="flex:1"></span>' +
        '<label class="chk"><input type="checkbox" data-mvdraw checked> 手写</label>';

      wrap.classList.toggle('mv-draw', true);
      renderNote(p);
    }

    function renderNote(p) {
      const key = MAP_HW_PREFIX + p.n;
      const n = Store.note(key);
      const val = n && n.blocks && n.blocks[0] ? n.blocks[0].v : '';
      noteBox.innerHTML = '<div class="mv-note-hd">导图笔记</div>' +
        '<textarea class="input mv-note-ta" placeholder="给这一页写点笔记…">' + esc(val) + '</textarea>';
      const ta = noteBox.querySelector('textarea');
      const save = U.debounce(function () {
        Store.setNote(key, ta.value);
        U.toast('已保存');
      }, 600);
      ta.addEventListener('input', save);
    }

    host.addEventListener('click', function (e) {
      const b = e.target.closest('[data-mv]');
      if (b) {
        const d = b.dataset.mv;
        idx = Math.max(0, Math.min(pages.length - 1, idx + (d === 'next' ? 1 : -1)));
        renderPage();
        return;
      }
      const t = e.target.closest('[data-mvt]');
      if (t) {
        if (api) api.setTool(t.dataset.mvt);
        host.querySelectorAll('[data-mvt]').forEach(function (x) { x.classList.toggle('on', x === t); });
        return;
      }
      const c = e.target.closest('[data-mvc]');
      if (c && api) {
        api.setColor(c.dataset.mvc);
        host.querySelectorAll('[data-mvc]').forEach(function (x) { x.classList.toggle('on', x === c); });
        host.querySelectorAll('[data-mvt]').forEach(function (x) { x.classList.toggle('on', x.dataset.mvt === 'pen'); });
        return;
      }
      const w = e.target.closest('[data-mvw]');
      if (w && api) {
        api.setWidth(parseFloat(w.dataset.mvw));
        host.querySelectorAll('[data-mvw]').forEach(function (x) { x.classList.toggle('on', x === w); });
        return;
      }
      const z = e.target.closest('[data-mvzoom]');
      if (z) {
        const pz = pages[idx];
        U.modal({
          title: '第 ' + pz.n + ' 页 · ' + (pz.c || pz.s || ''),
          body: '<div style="overflow:auto;max-height:78vh"><img src="data/maps/' + pz.img + '" style="width:' + (pz.w || 1500) + 'px;max-width:none;display:block"></div>',
          buttons: [{ label: '关闭', cls: 'primary' }]
        });
        return;
      }
      const t2 = e.target.closest('[data-mvt2]');
      if (t2 && api) {
        if (t2.dataset.mvt2 === 'undo') api.undo(); else api.clear();
        return;
      }
    });

    host.addEventListener('change', function (e) {
      if (e.target.matches('[data-mvdraw]')) {
        const wrap = stage.querySelector('.mv-wrap');
        if (wrap) wrap.classList.toggle('mv-draw', e.target.checked);
      }
    });

    if (opt.startPage) {
      const k = pages.findIndex(function (p) { return p.n === opt.startPage; });
      idx = k >= 0 ? k : 0;
    }
    renderPage();
  }

  /* ---------------- 题内嵌：图片直接铺在题目下面 ---------------- */
  function inline(host, pages) {
    if (!pages.length) { host.innerHTML = '<div class="hint">这一章没有找到对应导图</div>'; return; }
    host.innerHTML = pages.map(function (p) {
      return '<figure class="map-fig"><img src="data/maps/' + p.img + '" alt="思维导图" loading="lazy">' +
        '<figcaption>第 ' + p.n + ' 页 · ' + esc(p.c || p.s || '') + '</figcaption></figure>';
    }).join('');
    host.addEventListener('click', function (e) {
      const img = e.target.closest('img');
      if (!img) return;
      U.modal({ title: '思维导图', body: '<img src="' + img.src + '" style="max-width:100%">', buttons: [{ label: '关闭', cls: 'primary' }] });
    }, { once: true });
  }

  /* ---------------- 对外 ---------------- */
  window.MapUI = {
    viewer: viewer,
    inline: inline,
    /* 题目：选择展示方式 */
    openForQuestion(item, mode) {
      const q = item.qs[0];
      const pages = Bank.mapPagesForQuestion(q);
      if (!pages.length) { U.toast('这一章暂时没有对应导图'); return; }
      const title = (q.subj || '') + ' · 思维导图';
      if (mode === 'side') {
        const box = U.el('div');
        U.openDrawer(title, box);
        const d = document.getElementById('drawer');
        if (d) d.querySelector('.drawer-panel').classList.add('wide');
        const host = U.el('div', { class: 'mv-host' });
        box.appendChild(host);
        viewer(host, pages, {});
        U._drawerOnClose = function () {
          if (d) d.querySelector('.drawer-panel').classList.remove('wide');
        };
        return;
      }
      if (mode === 'inline') {
        const card = document.querySelector('.card[data-key="' + String(item.key).replace(/"/g, '\\"') + '"]');
        const box = card && card.querySelector('.map-inline');
        if (!box) return;
        if (box.dataset.on === '1') { box.dataset.on = ''; box.hidden = true; box.innerHTML = ''; return; }
        box.dataset.on = '1';
        box.hidden = false;
        inline(box, pages);
        box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  };

  function esc(s) { return U.esc(s); }
})();
