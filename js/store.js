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
    hw: {},         // qid -> {w,h,u,s:[[x,y,..]]}
    keys: {},       // qid -> {v:'AB', t:ts} 模拟题自行订正的正确答案
    imgDel: {},     // 图片删除墓碑 id -> ts（用于云端同步时同步删除）
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
      if (Store.cloud) Store.cloud.markImagesDirty();
    },
    removeNoteImage(qid, id) {
      const n = Store.doc.notes[qid]; if (!n) return;
      n.imgs = (n.imgs || []).filter(function (x) { return x !== id; });
      if (!n.t && !n.imgs.length) delete Store.doc.notes[qid];
      Store.doc.imgDel[id] = Date.now();
      Store.save();
      kvDel('img:' + id);
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
    async delImage(id) { await kvDel('img:' + id); },
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

    /* ---- 笔记图片同步：独立的 json 文件，避免主文件过大 ---- */
    async pullImages() {
      const c = this.cfg();
      const u = this.urlFor(this.imgPath(), '?ref=' + encodeURIComponent(c.branch || 'main') + '&t=' + Date.now());
      const r = await fetch(u, { headers: this.headers(), cache: 'no-store' });
      if (r.status === 404) return { data: null, sha: null };
      if (!r.ok) throw new Error('拉取图片失败 HTTP ' + r.status);
      const j = await r.json();
      let data = null;
      try { data = JSON.parse(b64dec(j.content || '{}')); } catch (e) { data = null; }
      return { data: data, sha: j.sha };
    },

    async syncImages() {
      // 没有任何图片相关变动，且本机已拉过 → 跳过（避免每次同步都下载图片文件）
      const refIds = new Set();
      const notes = Store.doc.notes || {};
      Object.keys(notes).forEach(function (qid) {
        (notes[qid].imgs || []).forEach(function (id) { refIds.add(id); });
      });
      const known = this._imgIds;
      const needPull = this._imgDirty || !this._imgPulled ||
        (known && Array.from(refIds).some(function (id) { return !known.has(id); }));
      if (!needPull) return;

      const remote = await this.pullImages();
      const rdata = remote.data || { imgs: {}, del: {} };
      const del = Object.assign({}, rdata.del || {});
      const localDel = Store.doc.imgDel || {};
      Object.keys(localDel).forEach(function (k) {
        if (!del[k] || localDel[k] > del[k]) del[k] = localDel[k];
      });
      Store.doc.imgDel = del;

      this._applying = true;
      try {
        // 1) 应用删除：删本地文件、清掉笔记里的引用
        for (const id in del) {
          await Store.delImage(id);
          Object.keys(Store.doc.notes || {}).forEach(function (qid) {
            const n = Store.doc.notes[qid];
            if (!n || !n.imgs || n.imgs.indexOf(id) < 0) return;
            n.imgs = n.imgs.filter(function (x) { return x !== id; });
            if (!n.t && !n.imgs.length) delete Store.doc.notes[qid];
          });
        }
        // 2) 下载云端新增的图片
        const rimgs = rdata.imgs || {};
        for (const id in rimgs) {
          if (del[id]) continue;
          const have = await Store.getImage(id);
          if (!have) await Store.putImage(id, rimgs[id]);
        }
        // 3) 收集本地图片并上传
        const ids = new Set();
        Object.keys(Store.doc.notes || {}).forEach(function (qid) {
          (Store.doc.notes[qid].imgs || []).forEach(function (id) { if (!del[id]) ids.add(id); });
        });
        const imgs = {};
        for (const id of ids) {
          const d = await Store.getImage(id);
          if (d) imgs[id] = d;
        }
        const payload = JSON.stringify({ v: 1, at: Date.now(), imgs: imgs, del: del });
        const remoteIds = Object.keys(rimgs).filter(function (id) { return !del[id]; }).sort().join(',');
        const localIds = Object.keys(imgs).sort().join(',');
        if (localIds !== remoteIds || !remote.sha) {
          if (payload.length > 18 * 1024 * 1024) {
            throw new Error('笔记图片合计 ' + Math.round(payload.length / 1048576) + 'MB，超过云端同步上限，请用「导出备份」或减少图片');
          }
          const c = this.cfg();
          const body = {
            message: 'sync images (' + Object.keys(imgs).length + ')',
            content: b64enc(payload),
            branch: c.branch || 'main'
          };
          if (remote.sha) body.sha = remote.sha;
          let r = await fetch(this.urlFor(this.imgPath(), '?t=' + Date.now()), {
            method: 'PUT',
            cache: 'no-store',
            headers: Object.assign({ 'Content-Type': 'application/json' }, this.headers()),
            body: JSON.stringify(body)
          });
          if (r.status === 409 || r.status === 422) {
            const again = await this.pullImages();
            const b2 = {
              message: 'sync images retry',
              content: b64enc(JSON.stringify({ v: 1, at: Date.now(), imgs: imgs, del: del })),
              branch: c.branch || 'main'
            };
            if (again.sha) b2.sha = again.sha;
            r = await fetch(this.urlFor(this.imgPath(), '?t=' + Date.now()), {
              method: 'PUT', cache: 'no-store',
              headers: Object.assign({ 'Content-Type': 'application/json' }, this.headers()),
              body: JSON.stringify(b2)
            });
          }
          if (!r.ok) {
            let detail = '';
            try { detail = (await r.text()).slice(0, 120); } catch (e) { }
            throw new Error('上传图片失败 HTTP ' + r.status + ' ' + detail);
          }
        }
        this._imgIds = new Set(Object.keys(imgs));
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

