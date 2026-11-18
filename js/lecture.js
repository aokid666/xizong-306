/* ============================================================
   lecture.js — 讲义（PDF 渲染页）：浏览 / 目录 / 搜索 / 手写 / 框选进笔记
   ============================================================ */
(function () {
  'use strict';

  let cache = null;
  let sourcePane = null, sourceLauncher = null, openRequest = 0;
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
    const catalogId = 'lecture-catalog-' + U.uid();

    host.innerHTML =
      '<div class="lec-bar">' +
      '<select class="select" data-lb-book aria-label="讲义版本"></select>' +
      '<button type="button" class="btn sm lec-catalog-toggle" data-lb-toc aria-expanded="false" aria-controls="' + catalogId + '">目录</button>' +
      '<button class="btn ghost sm" data-lb-go="prev" aria-label="上一页">←</button>' +
      '<input class="input" data-lb-page type="number" aria-label="页码" style="width:64px">' +
      '<span class="hint" data-lb-total></span>' +
      '<button class="btn ghost sm" data-lb-go="next" aria-label="下一页">→</button>' +
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
      '<button class="btn sm" data-lb-crop="1" aria-pressed="false">框选</button>' +
      '<span class="hint" data-lb-hint>' + (qid ? '框选后自动加入本题笔记' : '打开题目后可框选进笔记') + '</span>' +
      '</div>' +
      '<div class="lec-location" data-lb-location hidden></div>' +
      '<div class="lec-reading-area">' +
      '<div class="lec-stage" data-lb-stage></div>' +
      '<aside class="lec-catalog" id="' + catalogId + '" aria-label="讲义目录" hidden>' +
      '<div class="lec-catalog-head"><h3 tabindex="-1">讲义目录</h3>' +
      '<button type="button" class="icon-btn" data-lb-toc-close aria-label="关闭目录">×</button></div>' +
      '<div class="lec-catalog-search"><input type="search" class="input" data-lb-q placeholder="搜章节或讲义正文" aria-label="搜索章节或讲义正文"></div>' +
      '<div class="lec-catalog-scroll" data-lb-toc-scroll><div data-lb-tree></div><div data-lb-hits hidden></div></div>' +
      '</aside></div>';

    const $ = function (s) { return host.querySelector(s); };
    const stage = $('[data-lb-stage]');
    const cropButton = $('[data-lb-crop]');
    const cropHint = $('[data-lb-hint]');
    const idleHint = cropHint.textContent;
    let cropBox = null, cropDrag = null;
    const catalog = $('#' + catalogId), catalogToggle = $('[data-lb-toc]');
    const locationLabel = $('[data-lb-location]');
    const tocScroll = $('[data-lb-toc-scroll]');
    const tocTree = $('[data-lb-tree]'), searchHits = $('[data-lb-hits]'), searchInput = $('[data-lb-q]');
    let entries = [], activeEntry = null, locationHint = null, timer = null;

    function tocBranch(nodes) {
      return '<ul class="lec-catalog-list">' + nodes.map(function (entry) {
        const expand = entry.children.length
          ? '<button type="button" class="lec-catalog-fold" data-lb-fold="' + entry.id + '" aria-expanded="false" aria-label="展开' + esc(entry.title) + '"><span aria-hidden="true">›</span></button>'
          : '<span class="lec-catalog-fold-slot"></span>';
        return '<li><div class="lec-catalog-row">' + expand +
          '<button type="button" class="lec-catalog-link" data-lb-entry="' + entry.id + '">' +
          '<span>' + esc(entry.title) + '</span><span class="lec-catalog-page">' + entry.page + '</span></button></div>' +
          (entry.children.length ? '<div class="lec-catalog-branch" data-lb-branch="' + entry.id + '" hidden>' + tocBranch(entry.children) + '</div>' : '') +
          '</li>';
      }).join('') + '</ul>';
    }

    function fillToc() {
      const roots = [], stack = [];
      entries = [];
      activeEntry = null;
      locationHint = null;
      const toc = book.toc || [];
      const rows = toc.some(function (t) { return t.p === 1; }) ? toc : [{ t: '讲义首页', p: 1, d: 0 }].concat(toc);
      rows.forEach(function (t) {
        const depth = Math.max(0, t.d || 0);
        while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
        const parent = stack[stack.length - 1] || null;
        const entry = { id: entries.length, title: t.t, page: t.p, depth: depth, parent: parent, children: [] };
        (parent ? parent.children : roots).push(entry);
        entries.push(entry);
        stack.push(entry);
      });
      tocTree.innerHTML = tocBranch(roots);
      tocScroll.scrollTop = 0;
      clearTimeout(timer);
      searchInput.value = '';
      updateSearch();
    }

    function expandEntry(entry, open) {
      const control = tocTree.querySelector('[data-lb-fold="' + entry.id + '"]');
      if (!control) return;
      control.setAttribute('aria-expanded', String(open));
      control.setAttribute('aria-label', (open ? '收起' : '展开') + entry.title);
      tocTree.querySelector('[data-lb-branch="' + entry.id + '"]').hidden = !open;
    }

    function showCurrentChapter() {
      let entry = locationHint;
      if (!entry || entry.page !== idx + 1) {
        entry = null;
        entries.forEach(function (candidate) {
          if (candidate.page <= idx + 1 && (!entry || candidate.page >= entry.page)) entry = candidate;
        });
      }
      if (activeEntry) tocTree.querySelector('[data-lb-entry="' + activeEntry.id + '"]').removeAttribute('aria-current');
      activeEntry = entry;
      locationLabel.hidden = !entry;
      if (!entry) return;
      let root = entry;
      while (root.parent) root = root.parent;
      locationLabel.textContent = root === entry ? entry.title : root.title + ' / ' + entry.title;
      locationLabel.title = locationLabel.textContent;
      tocTree.querySelector('[data-lb-entry="' + entry.id + '"]').setAttribute('aria-current', 'location');
    }

    function toggleCatalog(open) {
      catalog.hidden = !open;
      catalogToggle.setAttribute('aria-expanded', String(open));
      if (!open) {
        catalogToggle.focus({ preventScroll: true });
        return;
      }
      catalog.querySelector('h3').focus({ preventScroll: true });
      if (!searchInput.value.trim()) revealCurrentChapter();
    }

    function revealCurrentChapter() {
      if (catalog.hidden || !activeEntry) return;
      for (let entry = activeEntry; entry; entry = entry.parent) expandEntry(entry, true);
      const row = tocTree.querySelector('[aria-current]');
      tocScroll.scrollTop += row.getBoundingClientRect().top - tocScroll.getBoundingClientRect().top - 12;
    }

    function matchLabel(text, start, length, snippet) {
      const from = snippet ? Math.max(0, start - 14) : 0;
      const to = snippet ? Math.min(text.length, start + length + 26) : text.length;
      return (from ? '…' : '') + esc(text.slice(from, start)) + '<mark>' +
        esc(text.slice(start, start + length)) + '</mark>' + esc(text.slice(start + length, to)) +
        (to < text.length ? '…' : '');
    }

    function hitRow(page, label, entry) {
      return '<button type="button" class="lec-catalog-link lec-catalog-hit" data-lb-hit="' + page + '"' +
        (entry ? ' data-lb-hit-entry="' + entry.id + '"' : '') + '><span>' + label +
        '</span><span class="lec-catalog-page">' + page + '</span></button>';
    }

    function updateSearch() {
      const q = searchInput.value.trim().toLowerCase();
      tocTree.hidden = !!q;
      searchHits.hidden = !q;
      if (!q) { revealCurrentChapter(); return; }
      const limit = 30;
      const headings = [], content = [];
      let headingCount = 0, contentCount = 0;
      entries.forEach(function (entry) {
        const start = entry.title.toLowerCase().indexOf(q);
        if (start < 0) return;
        headingCount++;
        if (headings.length < limit) headings.push(hitRow(entry.page, matchLabel(entry.title, start, q.length, false), entry));
      });
      (book.txt || []).forEach(function (text, i) {
        const start = (text || '').toLowerCase().indexOf(q);
        if (start < 0) return;
        contentCount++;
        if (content.length < limit) content.push(hitRow(i + 1, matchLabel(text, start, q.length, true)));
      });
      const group = function (label, hits, count) {
        if (!hits.length) return '';
        return '<div class="lec-catalog-hit-group"><h4>' + label + ' <span>' + count + '</span></h4>' +
          hits.join('') + '</div>';
      };
      searchHits.innerHTML = group('章节', headings, headingCount) + group('正文', content, contentCount) ||
        '<p class="lec-catalog-empty">没有找到匹配的章节或页面。</p>';
      if (headingCount > limit || contentCount > limit) {
        searchHits.innerHTML += '<p class="lec-catalog-empty">每类显示前 ' + limit + ' 条，试试更具体的关键词。</p>';
      }
      tocScroll.scrollTop = 0;
    }

    function render() {
      stopCrop();
      const n = idx + 1;
      $('[data-lb-page]').value = n;
      $('[data-lb-total]').textContent = '/ ' + book.pages;
      showCurrentChapter();
      if (mode === 'single') {
        stage.innerHTML = '<div class="lec-page-wrap"><img class="lec-page" draggable="false" src="' + pageImg(book, n) + '"><canvas class="lec-hw"></canvas></div>';
        bindHw();
      } else {
        const to = Math.min(book.pages, n + 6);
        let h = '';
        for (let i = n; i <= to; i++) h += '<div class="lec-item" data-pg="' + i + '"><img class="lec-page" loading="lazy" src="' + pageImg(book, i) + '"><div class="lec-cap">' + i + '</div></div>';
        stage.className = 'lec-stage' + (dir === 'h' ? ' h' : '');
        stage.innerHTML = h;
      }
      stage.className = 'lec-stage' + (mode === 'list' && dir === 'h' ? ' h' : '');
    }

    function go(n, entry) {
      locationHint = entry || null;
      idx = Math.max(0, Math.min(book.pages - 1, n - 1));
      render();
      stage.scrollTop = 0;
      stage.scrollLeft = 0;
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
    function resetCropDrag() {
      if (!cropDrag) return;
      const id = cropDrag.id;
      cropDrag = null;
      cropBox.style.display = 'none';
      if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
    }

    function stopCrop() {
      if (!cropBox) return;
      resetCropDrag();
      cropBox.remove();
      cropBox = null;
      stage.classList.remove('is-cropping');
      cropButton.classList.remove('on');
      cropButton.setAttribute('aria-pressed', 'false');
      cropHint.textContent = idleHint;
    }

    function startCrop() {
      if (!qid) { U.toast('先在某道题里打开讲义，才能框选进笔记'); return; }
      const wrap = stage.querySelector('.lec-page-wrap');
      if (!wrap) { U.toast('切到「单页」再框选'); return; }
      const img = wrap.querySelector('.lec-page');
      if (!img.naturalWidth) { U.toast('讲义图片尚未载入'); return; }
      cropBox = U.el('div', { class: 'lec-crop' });
      wrap.appendChild(cropBox);
      stage.classList.add('is-cropping');
      cropButton.classList.add('on');
      cropButton.setAttribute('aria-pressed', 'true');
      cropHint.textContent = '拖动框选，松手加入笔记。再次点击「框选」可恢复滚动。';
    }

    function cropPoint(img, e) {
      const rect = img.getBoundingClientRect();
      return {
        x: U.clamp(e.clientX - rect.left, 0, rect.width),
        y: U.clamp(e.clientY - rect.top, 0, rect.height),
        width: rect.width, height: rect.height
      };
    }

    function cropRect(e) {
      const p = cropPoint(cropDrag.img, e);
      return {
        x: Math.min(cropDrag.x, p.x), y: Math.min(cropDrag.y, p.y),
        w: Math.abs(p.x - cropDrag.x), h: Math.abs(p.y - cropDrag.y),
        sx: cropDrag.img.naturalWidth / p.width, sy: cropDrag.img.naturalHeight / p.height
      };
    }

    stage.addEventListener('pointerdown', function (e) {
      const img = e.target.closest('.lec-page');
      if (!cropBox || cropDrag || !e.isPrimary || e.button !== 0 || !img) return;
      e.preventDefault();
      const p = cropPoint(img, e);
      cropDrag = { id: e.pointerId, x: p.x, y: p.y, img: img };
      stage.setPointerCapture(e.pointerId);
      Object.assign(cropBox.style, {
        display: 'block', left: p.x + 'px', top: p.y + 'px', width: '0px', height: '0px'
      });
    });
    stage.addEventListener('pointermove', function (e) {
      if (!cropDrag || e.pointerId !== cropDrag.id) return;
      const r = cropRect(e);
      Object.assign(cropBox.style, {
        left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px'
      });
    });
    stage.addEventListener('pointerup', async function (e) {
      if (!cropDrag || e.pointerId !== cropDrag.id) return;
      const img = cropDrag.img;
      const r = cropRect(e);
      if (r.w < 12 || r.h < 12) {
        resetCropDrag();
        U.toast('框选太小了，请重新拖动');
        return;
      }
      stopCrop();
      const source = { type: 'lecture', bookId: book.id, page: idx + 1 };
      try {
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(r.w * r.sx));
        cv.height = Math.max(1, Math.round(r.h * r.sy));
        cv.getContext('2d').drawImage(img, r.x * r.sx, r.y * r.sy, r.w * r.sx, r.h * r.sy, 0, 0, cv.width, cv.height);
        const url = cv.toDataURL('image/png');
        const id = U.uid();
        await Promise.all([Store.putImageOrig(id, url), Store.putImage(id, url)]);
        Store.addNoteImage(qid, id, source);
        if (window.Card) Card.refreshNote(qid);
        U.toast('已加入本题笔记');
      } catch (err) {
        U.toast('截图保存失败，请重新框选');
      }
    });
    function cancelPointer(e) {
      if (cropDrag && e.pointerId === cropDrag.id) resetCropDrag();
    }
    stage.addEventListener('pointercancel', cancelPointer);
    stage.addEventListener('lostpointercapture', cancelPointer);
    stage.addEventListener('wheel', function (e) {
      if (cropBox) e.preventDefault();
    }, { passive: false });

    /* 事件 */
    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-lb-toc], [data-lb-toc-close]')) {
        toggleCatalog(catalog.hidden);
        return;
      }
      const fold = e.target.closest('[data-lb-fold]');
      if (fold) {
        expandEntry(entries[Number(fold.dataset.lbFold)], fold.getAttribute('aria-expanded') !== 'true');
        return;
      }
      const chapter = e.target.closest('[data-lb-entry], [data-lb-hit]');
      if (chapter) {
        const entry = entries[Number(chapter.dataset.lbEntry ?? chapter.dataset.lbHitEntry)];
        go(entry ? entry.page : Number(chapter.dataset.lbHit), entry);
        toggleCatalog(false);
        return;
      }
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
        stopCrop();
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
      if (c) {
        if (cropBox) stopCrop();
        else startCrop();
      }
    });

    host.addEventListener('change', function (e) {
      const t = e.target;
      if (t.matches('[data-lb-book]')) {
        book = cache.books[+t.value] || cache.books[0];
        fillToc(); go(1); return;
      }
      if (t.matches('[data-lb-page]')) { go(+t.value || 1); return; }
    });

    searchInput.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(updateSearch, 180);
    });
    host.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !catalog.hidden) {
        e.stopPropagation();
        toggleCatalog(false);
      }
    });

    /* 初始化 */
    const sel = $('[data-lb-book]');
    sel.innerHTML = cache.books.map(function (b, i) { return '<option value="' + i + '">' + esc(b.name) + '</option>'; }).join('');
    sel.value = String(opts.bookIndex || 0);
    book = cache.books[+sel.value];
    fillToc();
    go(opts.startPage || 1);
  }

  function showDrawer(title, host, launcher) {
    U.closeDrawer();
    const drawer = document.getElementById('drawer');
    const panel = drawer && drawer.querySelector('.drawer-panel');
    U.openDrawer(title, host, function () {
      if (panel) panel.classList.remove('wide', 'lecture-drawer');
      if (launcher && launcher.isConnected) launcher.focus({ preventScroll: true });
    });
    if (panel) panel.classList.add('wide', 'lecture-drawer');
  }

  function closeSource(restoreFocus) {
    if (!sourcePane) return;
    sourcePane.remove();
    sourcePane = null;
    document.body.classList.remove('lecture-source-open');
    if (restoreFocus && sourceLauncher && sourceLauncher.isConnected) sourceLauncher.focus({ preventScroll: true });
    sourceLauncher = null;
  }

  function showSourcePane(host, launcher) {
    sourcePane = U.el('aside', { class: 'drawer-panel lecture-source-pane', 'aria-label': '讲义原页' },
      '<header class="drawer-hd"><h2>讲义原页</h2><button type="button" class="icon-btn" aria-label="关闭讲义原页">✕</button></header>');
    const body = U.el('div', { class: 'drawer-bd' });
    body.appendChild(host);
    sourcePane.appendChild(body);
    const close = sourcePane.querySelector('button');
    close.addEventListener('click', function () { closeSource(true); });
    sourcePane.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') closeSource(true);
    });
    sourceLauncher = launcher;
    document.body.classList.add('lecture-source-open');
    document.body.appendChild(sourcePane);
    if (launcher && launcher.isConnected) launcher.scrollIntoView({ block: 'nearest' });
    close.focus({ preventScroll: true });
  }

  window.addEventListener('hashchange', function () {
    openRequest++;
    closeSource(false);
    if (document.querySelector('#drawer:not([hidden]) [data-lecture-source]')) U.closeDrawer();
  });

  window.LectureUI = {
    ensure: ensure,
    open: async function (item) {
      const qid = item && item.qs && item.qs[0] ? item.qs[0].id : null;
      const request = ++openRequest;
      try {
        await ensure();
        if (request !== openRequest) return;
        closeSource(false);
        const host = U.el('div', { class: 'lec-host' });
        showDrawer('讲义', host);
        viewer(host, { qid: qid });
      } catch (e) {
        if (request === openRequest) U.toast(e.message || '讲义载入失败');
      }
    },
    openSource: async function (source, qid, launcher) {
      const request = ++openRequest;
      try {
        const data = await ensure();
        if (request !== openRequest || (launcher && !launcher.isConnected)) return;
        const bookIndex = data.books.findIndex(function (b) { return source && source.type === 'lecture' && source.bookId === b.id; });
        const book = data.books[bookIndex];
        if (!book || !Number.isInteger(source.page) || source.page < 1 || source.page > book.pages) {
          U.toast('找不到这张截图的讲义原页');
          return;
        }
        closeSource(false);
        const host = U.el('div', { class: 'lec-host', 'data-lecture-source': '' });
        if (window.matchMedia('(min-width: 721px)').matches) showSourcePane(host, launcher);
        else showDrawer('讲义原页', host, launcher);
        viewer(host, { qid: qid, bookIndex: bookIndex, startPage: source.page });
      } catch (e) {
        if (request === openRequest) U.toast(e.message || '讲义原页载入失败');
      }
    }
  };

  function esc(s) { return U.esc(s); }
})();
