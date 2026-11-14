/* ============================================================
   lecture.js — 讲义（PDF 渲染页）：浏览 / 目录 / 搜索 / 手写 / 框选进笔记
   ============================================================ */
(function () {
  'use strict';

  let cache = null;
  const BASE = (function () {
    try {
      const s = document.currentScript;
      if (s && s.src) return s.src.replace(/js\/[^/]+\.js.*$/, '');
    } catch (e) { }
    return '';
  })();

  function ensure() {
    if (cache) return Promise.resolve(cache);
    if (window.XZ && window.XZ.lectures) { cache = window.XZ.lectures; return Promise.resolve(cache); }
    return new Promise(function (res, rej) {
      const s = document.createElement('script');
      s.src = BASE + 'data/lectures.js?v=20261103q';
      s.onload = function () { cache = window.XZ.lectures || { books: [] }; res(cache); };
      s.onerror = function () { rej(new Error('讲义数据载入失败')); };
      document.head.appendChild(s);
    });
  }

  const LEC_BASE = 'https://aokid666.github.io/xizong-lec/';
  function pageImg(book, n) {
    const f = book.img.split('/').pop() + ('0000' + n).slice(-4) + '.webp';
    return LEC_BASE + f;
  }

  /* ---------------- 查看器 ---------------- */
  function viewer(host, opts) {
    opts = opts || {};
    let book = null, idx = 0, mode = 'single', dir = 'v';
    let hw = null;   // {api}
    const qid = opts.qid || null;

    host.innerHTML =
      '<div class="lec-bar">' +
      '<select class="select" data-lb-book></select>' +
      '<select class="select" data-lb-toc style="max-width:190px"></select>' +
      '<input class="input" data-lb-q placeholder="搜讲义内容" style="width:130px">' +
      '<button class="btn ghost sm" data-lb-go="prev">←</button>' +
      '<input class="input" data-lb-page type="number" style="width:64px">' +
      '<span class="hint" data-lb-total></span>' +
      '<button class="btn ghost sm" data-lb-go="next">→</button>' +
      '<span style="flex:1"></span>' +
      '<button class="btn ghost sm on" data-lb-mode="single">单页</button>' +
      '<button class="btn ghost sm" data-lb-mode="list">连续</button>' +
      '<button class="btn ghost sm on" data-lb-dir="v">上下</button>' +
      '<button class="btn ghost sm" data-lb-dir="h">左右</button>' +
      '</div>' +
      '<div class="lec-tools">' +
      '<button class="icon-btn" data-lb-hw="pen" title="手写">✎</button>' +
      '<button class="icon-btn" data-lb-hw="eraser" title="橡皮">⌫</button>' +
      '<button class="icon-btn" data-lb-hw="undo" title="撤销">↶</button>' +
      '<button class="icon-btn" data-lb-hw="clear" title="清空">✕</button>' +
      '<button class="btn sm" data-lb-crop="1">框选</button>' +
      '<span class="hint" data-lb-hint>' + (qid ? '框选后自动加入本题笔记' : '打开题目后可框选进笔记') + '</span>' +
      '</div>' +
      '<div class="lec-stage" data-lb-stage></div>';

    const $ = function (s) { return host.querySelector(s); };
    const stage = $('[data-lb-stage]');

    function fillToc() {
      const sel = $('[data-lb-toc]');
      sel.innerHTML = '<option value="1">目录</option>' + book.toc.map(function (t) {
        return '<option value="' + t.p + '">' + '　'.repeat(Math.max(0, t.d - 1)) + esc(t.t) + '</option>';
      }).join('');
    }

    function render() {
      const n = idx + 1;
      $('[data-lb-page]').value = n;
      $('[data-lb-total]').textContent = '/ ' + book.pages;
      if (mode === 'single') {
        stage.innerHTML = '<div class="lec-page-wrap"><img class="lec-page" src="' + pageImg(book, n) + '"><canvas class="lec-hw"></canvas></div>';
        bindHw();
      } else {
        const from = Math.max(1, n - 2), to = Math.min(book.pages, n + 6);
        let h = '';
        for (let i = from; i <= to; i++) h += '<div class="lec-item" data-pg="' + i + '"><img class="lec-page" loading="lazy" src="' + pageImg(book, i) + '"><div class="lec-cap">' + i + '</div></div>';
        stage.className = 'lec-stage' + (dir === 'h' ? ' h' : '');
        stage.innerHTML = h;
      }
      stage.className = 'lec-stage' + (mode === 'list' && dir === 'h' ? ' h' : '');
    }

    function go(n) {
      idx = Math.max(0, Math.min(book.pages - 1, n - 1));
      render();
    }

    /* 手写 */
    function bindHw() {
      const wrap = stage.querySelector('.lec-page-wrap');
      const cv = stage.querySelector('.lec-hw');
      const img = stage.querySelector('.lec-page');
      if (!wrap || !cv) return;
      const key = 'LEC:' + book.id + ':' + (idx + 1);
      let strokes = [], tool = 'pen', drawing = false, cur = null;

      function load() {
        const d = Store.hw(key);
        strokes = d && d.s ? d.s.slice() : [];
      }
      function redraw() {
        const r = img.getBoundingClientRect();
        cv.style.width = r.width + 'px';
        cv.style.height = r.height + 'px';
        cv.width = r.width; cv.height = r.height;
        const c = cv.getContext('2d');
        c.clearRect(0, 0, cv.width, cv.height);
        strokes.forEach(function (st) {
          c.beginPath(); c.strokeStyle = st.c || '#191919'; c.lineWidth = st.w || 3; c.lineCap = 'round';
          for (let i = 0; i < st.p.length; i += 2) {
            const x = st.p[i] * r.width, y = st.p[i + 1] * r.height;
            if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
          }
          c.stroke();
        });
      }
      function save() { Store.setHw(key, { w: 1, h: 1, s: strokes }); }
      function pos(e) {
        const r = cv.getBoundingClientRect();
        return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
      }

      cv.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        try { cv.setPointerCapture(e.pointerId); } catch (err) { }
        const p = pos(e);
        if (tool === 'eraser') {
          strokes = strokes.filter(function (st) {
            for (let i = 0; i < st.p.length - 1; i += 2) {
              const dx = (st.p[i] - p[0]) * cv.width, dy = (st.p[i + 1] - p[1]) * cv.height;
              if (dx * dx + dy * dy < 400) return false;
            }
            return true;
          });
          save(); redraw(); return;
        }
        drawing = true;
        cur = { p: [p[0], p[1]], c: '#191919', w: 3 };
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
      const end = function () { if (drawing) { drawing = false; save(); } };
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);

      load();
      cv.style.pointerEvents = 'none';           // 默认不接管触摸，先能正常滚动
      if (img.complete) redraw(); else img.onload = redraw;
      window.addEventListener('resize', redraw);
      hw = { setTool: function (t) { tool = t; }, undo: function () { strokes.pop(); save(); redraw(); }, clear: function () { strokes = []; save(); redraw(); } };
      host._hw = hw;
    }

    /* 框选 -> 笔记 */
    let cropping = false, cstart = null, boxEl = null;
    function startCrop() {
      if (!qid) { U.toast('先在某道题里打开讲义，才能框选进笔记'); return; }
      cropping = true;
      const wrap = stage.querySelector('.lec-page-wrap');
      if (!wrap) { U.toast('切到「单页」再框选'); cropping = false; return; }
      boxEl = U.el('div', { class: 'lec-crop' });
      wrap.appendChild(boxEl);
      U.toast('在讲义上拖出一个矩形，松手即加入笔记');
    }

    stage.addEventListener('pointerdown', function (e) {
      if (!cropping) return;
      const wrap = stage.querySelector('.lec-page-wrap');
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      cstart = { x: e.clientX - r.left, y: e.clientY - r.top, r: r };
      boxEl.style.display = 'block';
      boxEl.style.left = cstart.x + 'px';
      boxEl.style.top = cstart.y + 'px';
      boxEl.style.width = '0px';
      boxEl.style.height = '0px';
      e.preventDefault();
    });
    stage.addEventListener('pointermove', function (e) {
      if (!cropping || !cstart) return;
      const r = cstart.r;
      const x = Math.min(Math.max(0, e.clientX - r.left), r.width);
      const y = Math.min(Math.max(0, e.clientY - r.top), r.height);
      boxEl.style.left = Math.min(cstart.x, x) + 'px';
      boxEl.style.top = Math.min(cstart.y, y) + 'px';
      boxEl.style.width = Math.abs(x - cstart.x) + 'px';
      boxEl.style.height = Math.abs(y - cstart.y) + 'px';
    });
    stage.addEventListener('pointerup', function () {
      if (!cropping || !cstart) return;
      const bw = parseFloat(boxEl.style.width), bh = parseFloat(boxEl.style.height);
      const bx = parseFloat(boxEl.style.left), by = parseFloat(boxEl.style.top);
      cstart = null;
      cropping = false;
      boxEl.style.display = 'none';
      if (bw < 12 || bh < 12) { U.toast('框选太小了'); return; }
      const img = stage.querySelector('.lec-page');
      const r = img.getBoundingClientRect();
      const sx = img.naturalWidth / r.width, sy = img.naturalHeight / r.height;
      const cv = document.createElement('canvas');
      cv.width = Math.round(bw * sx);
      cv.height = Math.round(bh * sy);
      cv.getContext('2d').drawImage(img, bx * sx, by * sy, bw * sx, bh * sy, 0, 0, cv.width, cv.height);
      const url = cv.toDataURL('image/png');
      const id = U.uid();
      Promise.all([Store.putImageOrig(id, url), Store.putImage(id, url)]).then(function () {
        Store.addNoteImage(qid, id);
        U.toast('已加入本题笔记');
      });
    });

    /* 事件 */
    host.addEventListener('click', function (e) {
      const b = e.target.closest('[data-lb-go]');
      if (b) { go(idx + (b.dataset.lbGo === 'next' ? 2 : 0)); return; }
      const m = e.target.closest('[data-lb-mode]');
      if (m) {
        mode = m.dataset.lbMode;
        host.querySelectorAll('[data-lb-mode]').forEach(function (x) { x.classList.toggle('on', x === m); });
        render(); return;
      }
      const d = e.target.closest('[data-lb-dir]');
      if (d) {
        dir = d.dataset.lbDir;
        host.querySelectorAll('[data-lb-dir]').forEach(function (x) { x.classList.toggle('on', x === d); });
        render(); return;
      }
      const h = e.target.closest('[data-lb-hw]');
      if (h) {
        const act = h.dataset.lbHw;
        if (!host._hw) return;
        const cv = host.querySelector('canvas.lec-hw');
        if (act === 'undo') { host._hw.undo(); return; }
        if (act === 'clear') { host._hw.clear(); return; }
        // 再点同一个工具 = 关闭手写
        const on = h.classList.contains('on');
        host.querySelectorAll('[data-lb-hw]').forEach(function (x) { x.classList.remove('on'); });
        if (on) {
          if (cv) cv.style.pointerEvents = 'none';
          U.toast('手写已关闭');
          return;
        }
        h.classList.add('on');
        if (cv) cv.style.pointerEvents = 'auto';
        host._hw.setTool(act);
        U.toast(act === 'eraser' ? '橡皮：点中笔迹即可擦除' : '手写已开启（再点一次关闭）');
        return;
      }
      const c = e.target.closest('[data-lb-crop]');
      if (c) { startCrop(); return; }
    });

    host.addEventListener('change', function (e) {
      const t = e.target;
      if (t.matches('[data-lb-book]')) {
        book = cache.books[+t.value] || cache.books[0];
        idx = 0; fillToc(); render(); return;
      }
      if (t.matches('[data-lb-toc]')) { go(+t.value); return; }
      if (t.matches('[data-lb-page]')) { go(+t.value || 1); return; }
    });

    let timer = null;
    host.addEventListener('input', function (e) {
      if (!e.target.matches('[data-lb-q]')) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        const q = e.target.value.trim().toLowerCase();
        if (!q) { fillToc(); return; }
        const sel = $('[data-lb-toc]');
        const hits = [];
        book.toc.forEach(function (t) { if (t.t.toLowerCase().indexOf(q) >= 0) hits.push(t); });
        for (let i = 0; i < book.pages && hits.length < 60; i++) {
          if ((book.txt[i] || '').toLowerCase().indexOf(q) >= 0) hits.push({ t: '第 ' + (i + 1) + ' 页 · ' + (book.txt[i] || '').slice(0, 30), p: i + 1, d: 1 });
        }
        sel.innerHTML = hits.length
          ? hits.map(function (t) { return '<option value="' + t.p + '">' + esc(t.t) + '</option>'; }).join('')
          : '<option value="1">没有匹配</option>';
      }, 250);
    });

    /* 初始化 */
    const sel = $('[data-lb-book]');
    sel.innerHTML = cache.books.map(function (b, i) { return '<option value="' + i + '">' + esc(b.name) + '</option>'; }).join('');
    book = cache.books[0];
    fillToc();
    if (opts.startPage) idx = Math.max(0, opts.startPage - 1);
    render();
  }

  window.LectureUI = {
    ensure: ensure,
    open: function (item) {
      const qid = item && item.qs && item.qs[0] ? item.qs[0].id : null;
      ensure().then(function () {
        const box = U.el('div');
        U.openDrawer('讲义', box);
        const d = document.getElementById('drawer');
        if (d) d.querySelector('.drawer-panel').classList.add('wide');
        const host = U.el('div', { class: 'lec-host' });
        box.appendChild(host);
        viewer(host, { qid: qid });
      }).catch(function (e) { U.toast(e.message || '讲义载入失败'); });
    }
  };

  function esc(s) { return U.esc(s); }
})();
