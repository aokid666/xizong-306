/* ============================================================
   store.js — 本地存储（IndexedDB，降级 localStorage）、UI 小工具
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- utils ---------------- */
  const U = window.U = {};

  U.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  U.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };
  U.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  U.debounce = function (fn, ms) {
    let t = null;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };
  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  U.el = function (tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (attrs[k] === true) e.setAttribute(k, '');
      else if (attrs[k] === false || attrs[k] == null) { /* skip */ }
      else e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  };
  U.fmtTime = function (ts) {
    if (!ts) return '';
    const d = new Date(ts), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };
  U.fmtNum = function (n) { return (n || 0).toLocaleString('zh-CN'); };
  U.pct = function (a, b) { return b ? Math.round(a * 100 / b) : 0; };

  U.resetApp = function (cls) {
    const old = document.getElementById('app');
    const n = old.cloneNode(false);
    n.className = cls || 'wrap';
    n.innerHTML = '';
    old.parentNode.replaceChild(n, old);
    return n;
  };

  /* 把图片压缩成适合显示的缩略图（原图另行保存） */
  U.compressDataUrl = function (src, maxSide, quality) {
    return new Promise(function (resolve) {
      const im = new Image();
      im.onload = function () {
        let w = im.width, h = im.height;
        const max = maxSide || 1400;
        if (w > max || h > max) {
          const s2 = Math.min(max / w, max / h);
          w = Math.round(w * s2); h = Math.round(h * s2);
        }
        try {
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(im, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', quality || 0.82));
        } catch (e) { resolve(src); }
      };
      im.onerror = function () { resolve(src); };
      im.src = src;
    });
  };

  let toastTimer = null;
  U.toast = function (msg, ms) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 1800);
  };

  /* drawer / modal */
  U._drawerOnClose = null;
  U.openDrawer = function (title, bodyHTML, onClose) {
    const d = document.getElementById('drawer');
    if (!d) return;
    const ttl = document.getElementById('drawer-title');
    if (ttl) ttl.textContent = title;
    const body = document.getElementById('drawer-body');
    if (typeof bodyHTML === 'string') body.innerHTML = bodyHTML;
    else { body.innerHTML = ''; body.appendChild(bodyHTML); }
    d.hidden = false;
    U._drawerOnClose = onClose || null;
  };
  U.closeDrawer = function () {
    const d = document.getElementById('drawer');
    if (!d || d.hidden) return;
    d.hidden = true;
    const cb = U._drawerOnClose; U._drawerOnClose = null;
    if (cb) cb();
  };
  /* ---------- 图片放大查看（可缩放/拖动/双指） ---------- */
  U.zoom = function (src, alt) {
    let ov = document.getElementById('zoom-ov');
    if (!ov) {
      ov = U.el('div', { id: 'zoom-ov', class: 'zoom-ov', hidden: true });
      ov.innerHTML = '<div class="zoom-bar">' +
        '<button class="btn sm" data-z="out">−</button>' +
        '<button class="btn sm" data-z="fit">适应</button>' +
        '<button class="btn sm" data-z="in">＋</button>' +
        '<span class="zoom-tip">双指/滚轮缩放 · 拖动移动 · 双击放大</span>' +
        '<span style="flex:1"></span>' +
        '<button class="btn sm" data-z="close">✕ 关闭</button></div>' +
        '<div class="zoom-stage"><img class="zoom-img" alt=""></div>';
      document.body.appendChild(ov);
      const stage = ov.querySelector('.zoom-stage');
      const img = ov.querySelector('.zoom-img');
      const st = { s: 1, x: 0, y: 0 };
      const apply = function () {
        img.style.transform = 'translate(' + st.x + 'px,' + st.y + 'px) scale(' + st.s + ')';
      };
      const fit = function () {
        const r = stage.getBoundingClientRect();
        const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
        st.s = Math.min(r.width / iw, r.height / ih, 1);
        st.x = 0; st.y = 0;
        apply();
      };
      ov._fit = fit;
      ov.querySelector('[data-z="in"]').onclick = function () { st.s = Math.min(6, st.s * 1.35); apply(); };
      ov.querySelector('[data-z="out"]').onclick = function () { st.s = Math.max(0.15, st.s / 1.35); apply(); };
      ov.querySelector('[data-z="fit"]').onclick = fit;
      ov.querySelector('[data-z="close"]').onclick = function () { ov.hidden = true; };
      ov.addEventListener('click', function (e) { if (e.target === ov || e.target.classList.contains('zoom-stage')) ov.hidden = true; });
      stage.addEventListener('wheel', function (e) {
        e.preventDefault();
        const k = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        st.s = Math.max(0.15, Math.min(6, st.s * k));
        apply();
      }, { passive: false });
      let drag = null;
      stage.addEventListener('pointerdown', function (e) {
        try { stage.setPointerCapture(e.pointerId); } catch (err) { }
        drag = { x: e.clientX, y: e.clientY, ox: st.x, oy: st.y };
      });
      stage.addEventListener('pointermove', function (e) {
        if (!drag) return;
        st.x = drag.ox + (e.clientX - drag.x);
        st.y = drag.oy + (e.clientY - drag.y);
        apply();
      });
      stage.addEventListener('pointerup', function () { drag = null; });
      stage.addEventListener('pointercancel', function () { drag = null; });
      stage.addEventListener('dblclick', function () {
        if (st.s < 1.8) { st.s = Math.min(6, st.s * 2.2); } else { fit(); }
      });
      // 双指缩放
      let pinch = null;
      stage.addEventListener('touchstart', function (e) {
        if (e.touches.length === 2) {
          const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          pinch = { d: d, s: st.s };
        }
      }, { passive: true });
      stage.addEventListener('touchmove', function (e) {
        if (pinch && e.touches.length === 2) {
          e.preventDefault();
          const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          st.s = Math.max(0.15, Math.min(6, pinch.s * (d / (pinch.d || 1))));
          apply();
        }
      }, { passive: false });
      stage.addEventListener('touchend', function () { pinch = null; });
    }
    const img = ov.querySelector('.zoom-img');
    img.src = src;
    img.alt = alt || '';
    ov.hidden = false;
    const fitNow = function () { if (ov._fit) ov._fit(); };
    if (img.complete) fitNow(); else img.onload = fitNow;
  };

  /* ---------- 主题 ---------- */
  U.theme = function () {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  };
  U.applyTheme = function (t, noSave) {
    const dark = t === 'dark';
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    const invert = Store.get('imgInvert');
    document.documentElement.classList.toggle('no-invert', invert === false);
    try { localStorage.setItem('xz:theme', dark ? 'dark' : 'light'); } catch (e) { }
    if (!noSave) { try { Store.set('theme', dark ? 'dark' : 'light'); } catch (e) { } }
    const b = document.getElementById('btn-theme');
    if (b) {
      b.textContent = dark ? '☀' : '☾';
      b.title = dark ? '切换到白天模式' : '切换到夜间模式';
    }
  };
  U.toggleTheme = function () {
    U.applyTheme(U.theme() === 'dark' ? 'light' : 'dark');
  };

  U.confirmRedo = function (items, title, subtitle, onOK) {
    if (!items || !items.length) { U.toast('没有可重做的题'); return; }
    U.modal({
      title: '重做确认',
      body: '<p style="font-size:14px;line-height:1.8">即将重做 <b>' + items.length + '</b> 组题' +
        (title ? '（' + U.esc(title) + '）' : '') + '。</p>' +
        '<p class="hint" style="margin-top:10px;line-height:1.8">· 重做期间不显示原有笔记、手写、高亮；<br>' +
        '· 不影响原来的正误记录，提交重做后才计入「做了几次」。</p>',
      buttons: [
        { label: '取消' },
        {
          label: '开始重做', cls: 'primary', onClick: function () {
            if (onOK) { onOK(); return; }
            Session.start({ title: '重做 · ' + (title || '练习'), subtitle: subtitle || '', items: items.slice(), redo: true });
          }
        }
      ]
    });
  };

  U.modal = function (opt) {
    const m = document.getElementById('modal');
    if (!m) return null;
    const ttl = document.getElementById('modal-title');
    if (ttl) ttl.textContent = opt.title || '';
    const body = document.getElementById('modal-body');
    if (typeof opt.body === 'string') body.innerHTML = opt.body;
    else { body.innerHTML = ''; body.appendChild(opt.body); }
    const foot = document.getElementById('modal-foot');
    foot.innerHTML = '';
    (opt.buttons || []).forEach(function (b) {
      const btn = U.el('button', { class: 'btn ' + (b.cls || '') }, U.esc(b.label));
      btn.addEventListener('click', function () {
        if (b.onClick) b.onClick();
        if (b.close !== false) U.closeModal();
      });
      foot.appendChild(btn);
    });
    foot.hidden = !(opt.buttons && opt.buttons.length);
    m.hidden = false;
    U._modalOnClose = opt.onClose || null;
    if (opt.onOpen) opt.onOpen(document.getElementById('modal-body'));
    return m;
  };
  U.closeModal = function () {
    const m = document.getElementById('modal');
    if (!m || m.hidden) return;
    m.hidden = true;
    const cb = U._modalOnClose; U._modalOnClose = null;
    if (cb) cb();
  };
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) { U.closeDrawer(); U.closeModal(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { U.closeDrawer(); U.closeModal(); }
  });

  /* ---------------- backend ---------------- */
  const DB_NAME = 'xizong-brush';
  const DB_STORE = 'kv';
  let db = null, backend = 'idb';

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('no idb'));
      let req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (err) { return reject(err); }
      req.onupgradeneeded = function () {
        const d = req.result;
        if (!d.objectStoreNames.contains(DB_STORE)) d.createObjectStore(DB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('idb open error')); };
      req.onblocked = function () { reject(new Error('idb blocked')); };
      setTimeout(function () { reject(new Error('idb timeout')); }, 1200);
    });
  }

  function idbGet(key) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(DB_STORE, 'readonly');
      const rq = tx.objectStore(DB_STORE).get(key);
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function () { reject(rq.error); };
    });
  }
  function idbSet(key, val) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(val, key);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }
  function idbDel(key) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  const LS = {
    get: function (k) { try { const v = localStorage.getItem('xz:' + k); return v == null ? undefined : JSON.parse(v); } catch (e) { return undefined; } },
    set: function (k, v) { try { localStorage.setItem('xz:' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem('xz:' + k); } catch (e) { } },
    keys: function () {
      const out = [];
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('xz:') === 0) out.push(k.slice(3)); } } catch (e) { }
      return out;
    }
  };

  async function kvGet(key) {
    if (backend === 'idb') {
      try { return await idbGet(key); } catch (e) { backend = 'ls'; }
    }
    return LS.get(key);
  }
  async function kvSet(key, val) {
    if (backend === 'idb') {
      try { await idbSet(key, val); return; } catch (e) { backend = 'ls'; }
    }
    if (!LS.set(key, val)) {
      // last resort: keep in memory only
      if (!Store._warned) { Store._warned = true; U.toast('本地存储空间不足，部分内容可能无法保存'); }
    }
  }
  async function kvDel(key) {
    if (backend === 'idb') { try { await idbDel(key); return; } catch (e) { backend = 'ls'; } }
    LS.del(key);
  }

  /* ---------------- default document ---------------- */
  const DEFAULTS = {
    v: 1,
    settings: {
      revealMode: 'fold',      // fold | side
      submitMode: 'single',    // single | chunk | all
      chunk: 10,
      fontSize: 17,
      hwAlways: false,
      showExplainAuto: false,
      includeHumanityInYear: false,
      mode: 'scroll'
    },
    progress: {},   // qid -> {a:'A', ok:0|1, t:ts, n:int}
    fav: {},        // qid -> ts
    flags: {},      // qid -> {t:'outdated'|'dispute'|'bad'|'extra'|'review', n:'', ts}
    notes: {},      // qid -> {t:'text', imgs:[id], ts}
    marks: {},      // qid -> [{i,f,s,e,tx,k:'hl'|'ul',n:'note'}]
    hw: {},         // qid -> {w,h,u,s:[[x,y,..]]}
    keys: {},       // qid -> {v:'AB', t:ts} 模拟题自行订正的正确答案
    imgDel: {},     // 图片删除墓碑 id -> ts（用于云端同步时同步删除）
    papers: [],     // 自定义组题记录 [{id,name,ts,items:[key],filters}]
    links: {},      // 题目互相关联 qid -> [qid...]（双向）
    session: null   // 断点续做
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function merge(base, saved) {
    if (!saved || typeof saved !== 'object') return base;
    for (const k in saved) {
      if (saved[k] === null || saved[k] === undefined) continue;
      if (Array.isArray(saved[k]) || typeof saved[k] !== 'object') base[k] = saved[k];
      else if (typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k])) {
        for (const k2 in saved[k]) base[k][k2] = saved[k][k2];
      } else base[k] = saved[k];
    }
    return base;
  }

  const Store = window.Store = {
    doc: clone(DEFAULTS),
    backend: 'idb',
    _warned: false,

    async init() {
      try { db = await idbOpen(); } catch (e) { backend = 'ls'; }
      if (backend === 'idb') {
        try {
          const d = await idbGet('doc');
          if (d && typeof d === 'object') Store.doc = merge(clone(DEFAULTS), d);
        } catch (e) { backend = 'ls'; }
      }
      if (backend === 'ls') {
        const d = LS.get('doc');
        if (d && typeof d === 'object') Store.doc = merge(clone(DEFAULTS), d);
      }
      Store.backend = backend;
      return Store.doc;
    },

    save: U.debounce(function () {
      kvSet('doc', Store.doc);
      if (Store.cloud) Store.cloud.schedule();
    }, 500),
    saveNow() { return kvSet('doc', Store.doc); },

    /* settings */
    set(key, val) { Store.doc.settings[key] = val; Store.save(); },
    get(key) { return Store.doc.settings[key]; },

    /* progress */
    record(qid, ans, ok) {
      const p = Store.doc.progress[qid] || { n: 0 };
      p.a = ans; p.ok = ok ? 1 : 0; p.t = Date.now(); p.n = (p.n || 0) + 1; p.c = (p.c || 0) + (ok ? 1 : 0);
      Store.doc.progress[qid] = p;
      Store.save();
    },
    prog(qid) { return Store.doc.progress[qid]; },

    /* fav */
    isFav(qid) { return !!Store.doc.fav[qid]; },
    toggleFav(qid) {
      if (Store.doc.fav[qid]) delete Store.doc.fav[qid];
      else Store.doc.fav[qid] = Date.now();
      Store.save();
      return !!Store.doc.fav[qid];
    },

    /* flags */
    flag(qid) { return Store.doc.flags[qid]; },
    setFlag(qid, type, note) {
      if (!type) delete Store.doc.flags[qid];
      else Store.doc.flags[qid] = { t: type, n: note || '', ts: Date.now() };
      Store.save();
    },

    /* notes：多段落（文字 / 图片可任意排序） */
    note(qid) {
      const n = Store.doc.notes[qid];
      if (!n) return null;
      if (n.v === 2 && n.blocks) return n;
      const blocks = [];
      if (n.t) blocks.push({ i: U.uid(), k: 't', v: n.t });
      (n.imgs || []).forEach(function (id) { blocks.push({ i: U.uid(), k: 'i', v: id }); });
      const out = { v: 2, blocks: blocks, ts: n.ts || Date.now() };
      Store.doc.notes[qid] = out;
      return out;
    },
    setNoteBlocks(qid, blocks) {
      blocks = (blocks || []).filter(function (b) {
        return b && ((b.k === 't' && String(b.v || '').trim()) || (b.k === 'i' && b.v));
      });
      if (!blocks.length) delete Store.doc.notes[qid];
      else Store.doc.notes[qid] = { v: 2, blocks: blocks, ts: Date.now() };
      Store.save();
    },
    addNoteBlock(qid, block) {
      const n = Store.note(qid) || { v: 2, blocks: [] };
      n.blocks = n.blocks || [];
      block.i = U.uid();
      n.blocks.push(block);
      n.ts = Date.now();
      Store.doc.notes[qid] = n;
      Store.save();
      return block;
    },
    updateNoteBlock(qid, bid, text) {
      const n = Store.note(qid);
      if (!n) return;
      (n.blocks || []).forEach(function (b) { if (b.i === bid) b.v = text; });
      n.ts = Date.now();
      Store.save();
    },
    removeNoteBlock(qid, bid) {
      const n = Store.note(qid);
      if (!n) return;
      const b = (n.blocks || []).filter(function (x) { return x.i === bid; })[0];
      if (b && b.k === 'i') {
        Store.doc.imgDel[b.v] = Date.now();
        kvDel('img:' + b.v);
        kvDel('imgorig:' + b.v);
      }
      n.blocks = (n.blocks || []).filter(function (x) { return x.i !== bid; });
      if (!n.blocks.length) delete Store.doc.notes[qid];
      else Store.doc.notes[qid] = n;
      Store.save();
      if (Store.cloud) Store.cloud.markImagesDirty();
    },
    moveNoteBlock(qid, bid, dir) {
      const n = Store.note(qid);
      if (!n) return;
      const a = n.blocks || [];
      let i = -1;
      for (let k = 0; k < a.length; k++) if (a[k].i === bid) { i = k; break; }
      const j = i + dir;
      if (i < 0 || j < 0 || j >= a.length) return;
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
      n.ts = Date.now();
      Store.save();
    },
    setNote(qid, txt) {
      const n = Store.note(qid);
      const blocks = n ? n.blocks.slice() : [];
      const firstText = blocks.filter(function (b) { return b.k === 't'; })[0];
      if (firstText) firstText.v = txt;
      else if (txt) blocks.unshift({ i: U.uid(), k: 't', v: txt });
      Store.setNoteBlocks(qid, blocks);
    },
    addNoteImage(qid, id) {
      const n = Store.note(qid) || { v: 2, blocks: [] };
      n.blocks = n.blocks || [];
      if (!n.blocks.some(function (b) { return b.k === 'i' && b.v === id; })) {
        n.blocks.push({ i: U.uid(), k: 'i', v: id });
      }
      n.ts = Date.now();
      Store.doc.notes[qid] = n;
      Store.save();
      if (Store.cloud) Store.cloud.markImagesDirty();
    },
    removeNoteImage(qid, id) {
      const n = Store.note(qid); if (!n) return;
      n.blocks = (n.blocks || []).filter(function (b) { return !(b.k === 'i' && b.v === id); });
      if (!n.blocks.length) delete Store.doc.notes[qid];
      Store.doc.imgDel[id] = Date.now();
      Store.save();
      kvDel('img:' + id);
      kvDel('imgorig:' + id);
      if (Store.cloud) Store.cloud.markImagesDirty();
    },

    /* marks */
    marks(qid) { return Store.doc.marks[qid] || []; },
    setMarks(qid, arr) {
      if (!arr || !arr.length) delete Store.doc.marks[qid];
      else Store.doc.marks[qid] = arr;
      Store.save();
    },
    addMark(qid, mark) {
      const arr = Store.doc.marks[qid] || [];
      mark.i = U.uid();
      arr.push(mark);
      Store.doc.marks[qid] = arr; Store.save();
      return mark;
    },
    removeMark(qid, id) {
      const arr = (Store.doc.marks[qid] || []).filter(function (m) { return m.i !== id; });
      Store.setMarks(qid, arr);
    },

    /* handwriting */
    hw(qid) { return Store.doc.hw[qid]; },
    setHw(qid, obj) {
      if (!obj || !obj.s || !obj.s.length) delete Store.doc.hw[qid];
      else { obj.u = Date.now(); Store.doc.hw[qid] = obj; }
      Store.save();
    },

    /* 题目互相关联（对照模式，双向） */
    linksOf(qid) { return (Store.doc.links && Store.doc.links[qid]) || []; },
    linkAll() {
      const out = [];
      const m = Store.doc.links || {};
      Object.keys(m).forEach(function (k) { (m[k] || []).forEach(function (v) { out.push(k + '>' + v); }); });
      return out;
    },
    toggleLink(a, b) {
      if (!a || !b || a === b) return false;
      Store.doc.links = Store.doc.links || {};
      const A = Store.doc.links[a] || [];
      const has = A.indexOf(b) >= 0;
      if (has) {
        Store.doc.links[a] = A.filter(function (x) { return x !== b; });
        Store.doc.links[b] = (Store.doc.links[b] || []).filter(function (x) { return x !== a; });
      } else {
        Store.doc.links[a] = A.concat([b]);
        const B = Store.doc.links[b] || [];
        if (B.indexOf(a) < 0) Store.doc.links[b] = B.concat([a]);
      }
      if (!Store.doc.links[a].length) delete Store.doc.links[a];
      if (Store.doc.links[b] && !Store.doc.links[b].length) delete Store.doc.links[b];
      Store.save();
      return !has;
    },

    /* 组题记录 */
    papers() { return Store.doc.papers || []; },
    addPaper(p) {
      const rec = { id: U.uid(), name: p.name || '未命名题单', ts: Date.now(), items: p.items || [], filters: p.filters || '' };
      Store.doc.papers = Store.doc.papers || [];
      Store.doc.papers.unshift(rec);
      if (Store.doc.papers.length > 200) Store.doc.papers.length = 200;
      Store.save();
      return rec;
    },
    removePaper(id) {
      Store.doc.papers = (Store.doc.papers || []).filter(function (x) { return x.id !== id; });
      Store.save();
    },
    renamePaper(id, name) {
      (Store.doc.papers || []).forEach(function (x) { if (x.id === id) x.name = name; });
      Store.save();
    },

    /* 模拟题：自行订正的正确答案 */
    key(qid) { const k = Store.doc.keys[qid]; return k ? k.v : ''; },
    setKey(qid, v) {
      if (!v) delete Store.doc.keys[qid];
      else Store.doc.keys[qid] = { v: v, t: Date.now() };
      Store.save();
    },

    /* images */
    async putImage(id, dataUrl) {
      await kvSet('img:' + id, dataUrl);
      if (Store.cloud) Store.cloud.markImagesDirty();
    },
    async putImageOrig(id, dataUrl) {
      await kvSet('imgorig:' + id, dataUrl);
      if (Store.cloud) Store.cloud.markImagesDirty();
    },
    async delImage(id) { await kvDel('img:' + id); await kvDel('imgorig:' + id); },
    async getImage(id) {
      const v = await kvGet('img:' + id);
      return typeof v === 'string' ? v : null;
    },
    async getImageOrig(id) {
      const v = await kvGet('imgorig:' + id);
      return typeof v === 'string' ? v : null;
    },
    imageIds() {
      const ids = new Set();
      const notes = Store.doc.notes || {};
      Object.keys(notes).forEach(function (q) {
        const n = Store.note(q);
        (n && n.blocks ? n.blocks : []).forEach(function (b) { if (b.k === 'i' && b.v) ids.add(b.v); });
      });
      return Array.from(ids);
    },

    /* session snapshot */
    setSession(s) { Store.doc.session = s; Store.save(); },
    clearSession() { Store.doc.session = null; Store.save(); },

    /* export / import */
    exportBlob() {
      const payload = JSON.stringify({ app: 'xizong-brush', v: 1, doc: Store.doc }, null, 1);
      return new Blob([payload], { type: 'application/json' });
    },
    async importDoc(obj) {
      if (!obj || obj.app !== 'xizong-brush' || !obj.doc) throw new Error('文件格式不正确');
      Store.doc = merge(clone(DEFAULTS), obj.doc);
      await Store.saveNow();
    },
    async clearAll() {
      Store.doc = clone(DEFAULTS);
      await Store.saveNow();
      if (backend === 'idb') {
        try {
          const keys = [];
          for (const k in Store.doc) keys.push(k);
        } catch (e) { }
      }
    },

    /* ---------- 云端同步（GitHub 仓库） ---------- */
    cloud: null,

    /* derived stats */
    stats() {
      const p = Store.doc.progress;
      let done = 0, right = 0;
      for (const k in p) { done++; if (p[k].ok) right++; }
      return { done: done, right: right, wrong: done - right };
    }
  };

  /* ============================================================
     云端同步：把 doc 存到 GitHub 仓库的一个 JSON 文件里
     ============================================================ */
  const CLOUD_KEY = 'xz:cloud';

  function b64enc(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64dec(b64) {
    return decodeURIComponent(escape(atob(String(b64).replace(/\s/g, ''))));
  }

  function pickNewer(a, b, field) {
    const ta = a && a[field] || 0, tb = b && b[field] || 0;
    return tb > ta ? b : a;
  }

  function mergeDoc(local, remote) {
    if (!remote) return local;
    const out = local;
    const groups = ['progress', 'fav', 'flags', 'notes', 'keys'];
    groups.forEach(function (g) {
      const r = remote[g] || {};
      out[g] = out[g] || {};
      Object.keys(r).forEach(function (k) {
        const mine = out[g][k];
        if (g === 'progress') {
          if (!mine || (r[k].t || 0) > (mine.t || 0)) out[g][k] = r[k];
        } else if (g === 'fav') {
          out[g][k] = Math.max(mine || 0, r[k] || 0) || mine || r[k];
        } else {
          if (!mine || (r[k].ts || 0) > (mine.ts || 0)) out[g][k] = r[k];
        }
      });
    });
    // 标记：按 id 合并
    const rm = remote.marks || {};
    out.marks = out.marks || {};
    Object.keys(rm).forEach(function (k) {
      const mine = out.marks[k] || [], other = rm[k] || [];
      const byId = {};
      mine.concat(other).forEach(function (m) { if (m && m.i) byId[m.i] = m; });
      const arr = Object.keys(byId).map(function (i) { return byId[i]; });
      out.marks[k] = arr;
    });
    // 关联：取两边并集
    const rl = remote.links || {};
    out.links = out.links || {};
    Object.keys(rl).forEach(function (k) {
      const mine = out.links[k] || [];
      const other = rl[k] || [];
      const set = {};
      mine.concat(other).forEach(function (x) { set[x] = 1; });
      out.links[k] = Object.keys(set);
    });
    // 手写：取更新的一版
    const rh = remote.hw || {};
    out.hw = out.hw || {};
    Object.keys(rh).forEach(function (k) {
      const mine = out.hw[k], o = rh[k];
      if (!mine) { out.hw[k] = o; return; }
      const mu = mine.u || 0, ou = o.u || 0;
      if (ou > mu) out.hw[k] = o;
    });
    return out;
  }

  const Cloud = {
    state: 'off',       // off | idle | syncing | ok | error
    at: 0,
    error: '',
    _timer: null,
    _busy: false,
    _imgDirty: true,    // 图片有变动，需要拉/推
    _imgPulled: false,
    _imgIds: null,      // 已知「本地+云端」都有的图片 id
    _applying: false,   // 正在应用远端图片，避免重复标脏

    cfg() {
      try { return JSON.parse(localStorage.getItem(CLOUD_KEY) || '{}'); } catch (e) { return {}; }
    },
    setCfg(c) {
      try { localStorage.setItem(CLOUD_KEY, JSON.stringify(c || {})); } catch (e) { }
      this.state = (c && c.token && c.repo) ? 'idle' : 'off';
      this._imgDirty = true; this._imgPulled = false; this._imgIds = null;
      this.emit();
    },
    markImagesDirty() {
      if (this._applying) return;
      this._imgDirty = true;
    },
    imgPath() {
      const c = this.cfg();
      if (c.imgPath) return c.imgPath;
      return String(c.path || 'xizong.json').replace(/\.json$/i, '') + '-images.json';
    },
    urlFor(p, q) {
      const c = this.cfg();
      return 'https://api.github.com/repos/' + c.repo + '/contents/' + p + (q || '');
    },
    configured() {
      const c = this.cfg();
      return !!(c.token && c.repo);
    },
    url(path) {
      const c = this.cfg();
      return 'https://api.github.com/repos/' + c.repo + '/contents/' + (c.path || 'xizong.json') + (path || '');
    },
    headers() {
      const c = this.cfg();
      return {
        Authorization: 'token ' + c.token,
        Accept: 'application/vnd.github+json'
      };
    },

    async pull() {
      const c = this.cfg();
      const u = this.url('?ref=' + encodeURIComponent(c.branch || 'main') + '&t=' + Date.now());
      const r = await fetch(u, { headers: this.headers(), cache: 'no-store' });
      if (r.status === 404) return { doc: null, sha: null };
      if (!r.ok) throw new Error('拉取失败 HTTP ' + r.status);
      const j = await r.json();
      const text = b64dec(j.content || '');
      return { doc: JSON.parse(text), sha: j.sha };
    },

    async push() {
      for (let attempt = 0; attempt < 3; attempt++) {
        const c = this.cfg();
        let sha = null;
        try {
          const cur = await this.pull();
          sha = cur.sha;
          if (cur.doc) mergeDoc(Store.doc, cur.doc);
        } catch (e) { /* 网络问题时直接尝试写入 */ }
        const body = {
          message: 'sync ' + new Date().toISOString(),
          content: b64enc(JSON.stringify(Store.doc)),
          branch: c.branch || 'main'
        };
        if (sha) body.sha = sha;
        const r = await fetch(this.url('?t=' + Date.now()), {
          method: 'PUT',
          cache: 'no-store',
          headers: Object.assign({ 'Content-Type': 'application/json' }, this.headers()),
          body: JSON.stringify(body)
        });
        if (r.ok) return true;
        if (r.status === 409 || r.status === 422) continue;   // sha 过期，重新拉取后再试
        let detail = '';
        try { detail = (await r.text()).slice(0, 160); } catch (e) { }
        throw new Error('上传失败 HTTP ' + r.status + ' ' + detail);
      }
      throw new Error('上传冲突：多次重试仍失败');
    },

    /* ---- 笔记图片：原图按文件存放在仓库 notes/ 目录 ---- */
    imgDir() {
      const c = this.cfg();
      const p = String(c.path || 'xizong.json');
      const dir = p.indexOf('/') >= 0 ? p.slice(0, p.lastIndexOf('/') + 1) : '';
      return dir + 'notes';
    },

    async listNoteFiles() {
      const c = this.cfg();
      const u = this.urlFor(this.imgDir(), '?ref=' + encodeURIComponent(c.branch || 'main') + '&t=' + Date.now());
      const r = await fetch(u, { headers: this.headers(), cache: 'no-store' });
      if (r.status === 404) return [];
      if (!r.ok) throw new Error('读取图片目录失败 HTTP ' + r.status);
      const arr = await r.json();
      return Array.isArray(arr) ? arr.filter(function (x) { return x.type === 'file'; }) : [];
    },

    async downloadNoteFile(name) {
      const c = this.cfg();
      const u = this.urlFor(this.imgDir() + '/' + name, '?ref=' + encodeURIComponent(c.branch || 'main') + '&t=' + Date.now());
      const r = await fetch(u, { headers: this.headers(), cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !j.content) return null;
      // 图片是二进制，不能走 UTF-8 解码，直接拼 dataURL
      const b64 = String(j.content).replace(/\s/g, '');
      return 'data:' + ZIP.mimeOf(name) + ';base64,' + b64;
    },

    async uploadNoteFile(id, dataUrl) {
      const c = this.cfg();
      const mime = (String(dataUrl).match(/^data:([^;]+)/) || [])[1] || 'image/png';
      const name = id + '.' + ZIP.extOf(mime);
      const body = {
        message: 'note image ' + name,
        content: String(dataUrl).split(',')[1] || '',
        branch: c.branch || 'main'
      };
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await fetch(this.urlFor(this.imgDir() + '/' + name, '?t=' + Date.now()), {
          method: 'PUT', cache: 'no-store',
          headers: Object.assign({ 'Content-Type': 'application/json' }, this.headers()),
          body: JSON.stringify(body)
        });
        if (r.ok) return true;
        if (r.status === 409 || r.status === 422) {
          // 已存在同名文件 → 取出 sha 覆盖
          try {
            const cur = await this.downloadNoteFileSha(name);
            if (cur) { body.sha = cur; continue; }
          } catch (e) { }
          return true;
        }
        let detail = '';
        try { detail = (await r.text()).slice(0, 120); } catch (e) { }
        throw new Error('上传图片失败 HTTP ' + r.status + ' ' + detail);
      }
      return false;
    },

    async downloadNoteFileSha(name) {
      const c = this.cfg();
      const u = this.urlFor(this.imgDir() + '/' + name, '?ref=' + encodeURIComponent(c.branch || 'main') + '&t=' + Date.now());
      const r = await fetch(u, { headers: this.headers(), cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      return j.sha;
    },

    async deleteNoteFile(name, sha) {
      const body = { message: 'delete note image ' + name, sha: sha };
      const c = this.cfg();
      const r = await fetch(this.urlFor(this.imgDir() + '/' + name, '?t=' + Date.now()), {
        method: 'DELETE', cache: 'no-store',
        headers: Object.assign({ 'Content-Type': 'application/json' }, this.headers()),
        body: JSON.stringify(body)
      });
      return r.ok;
    },

    async syncImages() {
      const refIds = new Set(Store.imageIds());
      const known = this._imgIds;
      const needPull = this._imgDirty || !this._imgPulled ||
        (known && Array.from(refIds).some(function (id) { return !known.has(id); }));
      if (!needPull) return;

      const files = await this.listNoteFiles();
      const remote = {};                       // id -> {name, sha}
      files.forEach(function (f) {
        const id = f.name.replace(/\.[^.]+$/, '');
        remote[id] = { name: f.name, sha: f.sha };
      });

      const del = Store.doc.imgDel || {};
      this._applying = true;
      try {
        // 1) 删除墓碑 → 删云端文件
        for (const id in del) {
          const f = remote[id];
          if (f) {
            await this.deleteNoteFile(f.name, f.sha);
            delete remote[id];
          }
          await Store.delImage(id);
        }
        // 2) 下载云端有、本地没有的原图
        for (const id in remote) {
          if (del[id]) continue;
          const have = (await Store.getImageOrig(id)) || (await Store.getImage(id));
          if (have) continue;                  // 本地已有原图，跳过
          const dataUrl = await this.downloadNoteFile(remote[id].name);
          if (!dataUrl) continue;
          await Store.putImageOrig(id, dataUrl);
          await Store.putImage(id, await U.compressDataUrl(dataUrl, 1400, 0.82));
        }
        // 3) 上传本地有、云端没有的原图
        const localIds = Store.imageIds();
        for (const id of localIds) {
          if (del[id] || remote[id]) continue;
          let dataUrl = await Store.getImageOrig(id);
          if (!dataUrl) {
            dataUrl = await Store.getImage(id);
            if (dataUrl) await Store.putImageOrig(id, dataUrl);
          }
          if (dataUrl) await this.uploadNoteFile(id, dataUrl);
        }
        this._imgIds = new Set(localIds.concat(Object.keys(remote)));
        this._imgPulled = true;
        this._imgDirty = false;
      } finally {
        this._applying = false;
      }
    },

    async syncNow(opts) {
      if (!this.configured()) { this.state = 'off'; this.emit(); return false; }
      if (this._busy) return false;
      this._busy = true;
      this.state = 'syncing'; this.emit();
      try {
        const cur = await this.pull();
        if (cur.doc) mergeDoc(Store.doc, cur.doc);
        await this.syncImages();
        await kvSet('doc', Store.doc);
        await this.push();
        this.state = 'ok'; this.at = Date.now(); this.error = '';
        this.emit();
        return true;
      } catch (e) {
        this.state = 'error'; this.error = e.message || String(e);
        this.emit();
        return false;
      } finally {
        this._busy = false;
      }
    },

    schedule() {
      if (!this.configured()) return;
      clearTimeout(this._timer);
      this._timer = setTimeout(function () { Cloud.syncNow(); }, 4000);
    },

    emit() {
      try {
        document.dispatchEvent(new CustomEvent('xz-sync', {
          detail: { state: Cloud.state, at: Cloud.at, error: Cloud.error }
        }));
      } catch (e) { }
    },

    label() {
      const t = this.at ? U.fmtTime(this.at).slice(11) : '';
      switch (this.state) {
        case 'off': return '☁️ 未连接云端';
        case 'idle': return '☁️ 等待同步';
        case 'syncing': return '☁️ 同步中…';
        case 'ok': return '☁️ 已同步' + (t ? ' · ' + t : '');
        default: return '⚠️ 同步失败';
      }
    }
  };

  Store.cloud = Cloud;
})();

