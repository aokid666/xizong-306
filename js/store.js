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
    hw: {},         // qid -> {w,h,s:[[x,y,..]]}
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
    }, 500),
    saveNow() { return kvSet('doc', Store.doc); },

    /* settings */
    set(key, val) { Store.doc.settings[key] = val; Store.save(); },
    get(key) { return Store.doc.settings[key]; },

    /* progress */
    record(qid, ans, ok) {
      const p = Store.doc.progress[qid] || { n: 0 };
      p.a = ans; p.ok = ok ? 1 : 0; p.t = Date.now(); p.n = (p.n || 0) + 1;
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

    /* notes */
    note(qid) { return Store.doc.notes[qid]; },
    setNote(qid, txt) {
      const n = Store.doc.notes[qid] || { imgs: [] };
      n.t = txt; n.ts = Date.now();
      if (!txt && !(n.imgs && n.imgs.length)) delete Store.doc.notes[qid];
      else Store.doc.notes[qid] = n;
      Store.save();
    },
    addNoteImage(qid, id) {
      const n = Store.doc.notes[qid] || { t: '', imgs: [] };
      n.imgs = n.imgs || []; n.imgs.push(id); n.ts = Date.now();
      Store.doc.notes[qid] = n; Store.save();
    },
    removeNoteImage(qid, id) {
      const n = Store.doc.notes[qid]; if (!n) return;
      n.imgs = (n.imgs || []).filter(function (x) { return x !== id; });
      if (!n.t && !n.imgs.length) delete Store.doc.notes[qid];
      Store.save();
      kvDel('img:' + id);
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
      else Store.doc.hw[qid] = obj;
      Store.save();
    },

    /* images */
    async putImage(id, dataUrl) { await kvSet('img:' + id, dataUrl); },
    async getImage(id) {
      const v = await kvGet('img:' + id);
      return typeof v === 'string' ? v : null;
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

    /* derived stats */
    stats() {
      const p = Store.doc.progress;
      let done = 0, right = 0;
      for (const k in p) { done++; if (p[k].ok) right++; }
      return { done: done, right: right, wrong: done - right };
    }
  };
})();

