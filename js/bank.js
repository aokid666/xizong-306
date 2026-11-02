/* ============================================================
   bank.js — 题库加载、索引、组题（病例题整体化）
   ============================================================ */
(function () {
  'use strict';

  // 以 bank.js 自身位置推导站点根目录，便于从任意子路径/测试页调用
  const BASE = (function () {
    try {
      const sc = document.currentScript;
      if (sc && sc.src) return new URL('../', sc.src).href;
    } catch (e) { }
    return location.href.split('#')[0].replace(/[^/]*$/, '');
  })();

  function sameOptions(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].k !== b[i].k) return false;
      if (a[i].v !== b[i].v) return false;
    }
    return true;
  }

  const Bank = window.Bank = {
    meta: (window.XZ && window.XZ.meta) || null,
    loaded: {},          // subject -> [q]
    byId: new Map(),
    clusters: {},        // cid -> [q]
    _loading: {},        // subject -> Promise
    _manifest: null,

    async init() {
      if (!this.meta) throw new Error('题库索引缺失');
      return this.meta;
    },

    subjectNames() { return this.meta.subjects.map(function (s) { return s.name; }); },
    subjectMeta(name) {
      return this.meta.subjects.filter(function (s) { return s.name === name; })[0];
    },
    chapterMeta(subjectName, ci) {
      const s = this.subjectMeta(subjectName);
      return s ? s.chapters[ci] : null;
    },

    _loadScript(src) {
      return new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = src;
        s.onload = function () { resolve(); };
        s.onerror = function () { reject(new Error('加载失败: ' + src)); };
        document.head.appendChild(s);
      });
    },

    ensure(names) {
      const self = this;
      const list = (Array.isArray(names) ? names : [names]).filter(function (n) { return !self.loaded[n]; });
      if (!list.length) return Promise.resolve();
      const tasks = list.map(function (name) {
        if (self._loading[name]) return self._loading[name];
        const code = (self.subjectMeta(name) || {}).code;
        const file = (self._manifest && self._manifest.files && self._manifest.files[name]) || ('bank-' + code + '.js');
        self._loading[name] = self._loadScript(BASE + 'data/' + file + '?v=20261103a').then(function () {
          const rows = window.XZ.bank[name] || [];
          const arr = [];
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const q = {
              id: r[0], subj: name, ci: r[1], sec: r[2] || '', kp: r[3] || '',
              y: r[4], n: r[5], t: r[6], v: r[7], stem: r[8],
              opts: r[9].map(function (o) { return { k: o[0], v: o[1] }; }),
              ans: r[10] || '', exp: r[11] || '', clus: r[12] || '', mid: r[13] || 'N'
            };
            q.multi = q.ans.length > 1;
            q.label = q.mid === 'N' ? (q.y + 'N' + q.n + (q.t || '')) : (q.y + q.mid + '-' + q.n + (q.t === 'A' ? '' : (q.t || '')));
            if (q.v === 'C') q.label += '·临床';
            else if (q.v === 'B') q.label += '·基础';
            arr.push(q);
            self.byId.set(q.id, q);
            if (q.clus) (self.clusters[q.clus] = self.clusters[q.clus] || []).push(q);
          }
          self.loaded[name] = arr;
          return arr;
        }).catch(function (e) {
          delete self._loading[name];
          throw e;
        });
        return self._loading[name];
      });
      return Promise.all(tasks);
    },

    ensureAll() { return this.ensure(this.subjectNames()); },
    loadedCount() {
      let n = 0;
      for (const k in this.loaded) n += this.loaded[k].length;
      return n;
    },

    q(id) { return this.byId.get(id); },

    /* ---------- 病例题整体：把共用题干的若干小问合成一个 item ---------- */
    itemOf(q) {
      if (q._mockItem) return q._mockItem;
      if (q._bItem) return q._bItem;
      if (!q.clus) return { key: 'q:' + q.id, qs: [q], vignette: '', tails: [q.stem], cid: '' };
      if (q._item) return q._item;
      const qs = (this.clusters[q.clus] || [q]).slice().sort(function (a, b) { return a.n - b.n; });
      const item = { key: 'c:' + q.clus, qs: qs, vignette: '', tails: [], cid: q.clus };
      // 最长公共前缀 -> 题干正文
      let pre = qs[0].stem;
      for (let i = 1; i < qs.length; i++) {
        const s = qs[i].stem;
        let j = 0;
        const max = Math.min(pre.length, s.length);
        while (j < max && pre.charCodeAt(j) === s.charCodeAt(j)) j++;
        pre = pre.slice(0, j);
      }
      // 截断到最后一个句末标点
      const cut = Math.max(pre.lastIndexOf('。'), pre.lastIndexOf('？'), pre.lastIndexOf('！'), pre.lastIndexOf('；'));
      let vignette = cut > 24 ? pre.slice(0, cut + 1) : '';
      if (vignette.length < 30) vignette = '';
      if (vignette) {
        const tails = qs.map(function (x) {
          return x.stem.slice(vignette.length).replace(/^[\s，。、；：,.;:]+/, '');
        });
        if (tails.filter(function (t) { return t.length < 4; }).length > 0) vignette = '';
      }
      if (!vignette) {
        item.vignette = '';
        item.tails = qs.map(function (x) { return x.stem; });
      } else {
        item.vignette = vignette;
        item.tails = qs.map(function (x) {
          return x.stem.slice(vignette.length).replace(/^[\s，。、；：,.;:]+/, '');
        });
      }
      qs.forEach(function (x) { x._item = item; });
      return item;
    },

    itemsOf(qs) {
      const self = this, out = [], seen = {};
      for (let i = 0; i < qs.length; i++) {
        const it = self.itemOf(qs[i]);
        if (seen[it.key]) continue;
        seen[it.key] = 1;
        out.push(it);
      }
      if (!Store.get('bGroup')) return out;
      // B 型题（共用备选答案）：把相邻、选项相同的题合成一题组
      const merged = [], used = {};
      for (let i = 0; i < out.length; i++) {
        const it = out[i];
        if (used[i]) continue;
        if (it.qs.length > 1 || it.qs[0].t !== 'B') { merged.push(it); continue; }
        const grp = [it];
        let j = i + 1;
        while (j < out.length && !used[j] && out[j].qs.length === 1 && out[j].qs[0].t === 'B') {
          const a = grp[grp.length - 1].qs[0], b = out[j].qs[0];
          if (b.y !== a.y || b.mid !== a.mid || b.v !== a.v || b.n !== a.n + 1) break;
          if (!sameOptions(a.opts, b.opts)) break;
          grp.push(out[j]); used[j] = 1; j++;
        }
        if (grp.length >= 2) {
          merged.push({
            key: 'b:' + grp[0].qs[0].id, qs: grp.map(function (g) { return g.qs[0]; }),
            vignette: '', tails: [], cid: '', bGroup: true, bShared: grp[0].qs[0].opts
          });
          used[i] = 1;
          // 子题缓存，避免重复渲染
          grp.forEach(function (g) { g.qs[0]._bItem = merged[merged.length - 1]; });
        } else {
          merged.push(it);
        }
      }
      return merged;
    },

    sameOptions(a, b) { return sameOptions(a, b); },

    shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },

    /* ---------- 取题 ---------- */
    itemsByYear(year, opt) {
      const self = this, out = [];
      this.subjectNames().forEach(function (name) {
        if (name === '人文精神' && !(opt && opt.includeHumanity)) return;
        (self.loaded[name] || []).forEach(function (q) { if (q.y === year) out.push(q); });
      });
      out.sort(function (a, b) {
        const va = a.v || 'A', vb = b.v || 'A';
        if (va !== vb) return va < vb ? -1 : 1;
        if (a.mid !== b.mid) return a.mid < b.mid ? -1 : 1;
        return a.n - b.n;
      });
      return self.itemsOf(out);
    },

    itemsByChapter(subjectName, ci, secTitle, kp) {
      const qs = (this.loaded[subjectName] || []).filter(function (q) {
        if (ci != null && q.ci !== ci) return false;
        if (secTitle && q.sec !== secTitle && q.sec.replace(/^第[一二三四五六七八九十百\d]+节\s*/, '') !== secTitle) return false;
        if (kp && q.kp !== kp) return false;
        return true;
      });
      qs.sort(function (a, b) { return (a.y - b.y) || (a.n - b.n); });
      return this.itemsOf(qs);
    },

    itemsBySubject(subjectName) {
      const qs = (this.loaded[subjectName] || []).slice().sort(function (a, b) {
        return (a.ci - b.ci) || (a.y - b.y) || (a.n - b.n);
      });
      return this.itemsOf(qs);
    },

    /* 自定义组题 */
    query(opt) {
      const self = this;
      opt = opt || {};
      const subjSet = opt.subjects && opt.subjects.length ? new Set(opt.subjects) : null;
      const chapSet = opt.chapters && opt.chapters.length ? new Set(opt.chapters) : null; // "subj|ci"
      const secSet = opt.sections && opt.sections.length ? new Set(opt.sections) : null;  // "subj|ci|sec"
      const kpSet = opt.kps && opt.kps.length ? new Set(opt.kps) : null;                  // "subj|ci|sec|kp"
      const yFrom = opt.yearFrom || 0, yTo = opt.yearTo || 9999;
      const types = opt.types && opt.types.length ? new Set(opt.types) : null;
      const excludeFlags = opt.excludeFlags;
      const onlyUndone = opt.onlyUndone;
      const onlyWrong = opt.onlyWrong;
      const onlyFav = opt.onlyFav;
      const prog = Store.doc.progress;

      let qs = [];
      this.subjectNames().forEach(function (name) {
        if (subjSet && !subjSet.has(name)) return;
        if (!self.loaded[name]) return;
        self.loaded[name].forEach(function (q) {
          if (q.y < yFrom || q.y > yTo) return;
          if (types && !types.has(q.t)) return;
          const ck = name + '|' + q.ci;
          if (chapSet && !chapSet.has(ck)) return;
          const sk = ck + '|' + q.sec;
          if (secSet && !secSet.has(sk)) return;
          const kk = sk + '|' + q.kp;
          if (kpSet && !kpSet.has(kk)) return;
          if (excludeFlags && Store.flag(q.id)) return;
          if (onlyUndone && prog[q.id]) return;
          if (onlyWrong && !(prog[q.id] && !prog[q.id].ok)) return;
          if (onlyFav && !Store.isFav(q.id)) return;
          qs.push(q);
        });
      });
      let items = self.itemsOf(qs);
      return items;
    },

    /* ---------- 模拟题（天天师兄） ---------- */
    ensureMock() {
      const self = this;
      if (this.mock) return Promise.resolve(this.mock);
      if (this._mockP) return this._mockP;
      this._mockP = this._loadScript(BASE + 'data/mock.js?v=20261103a').then(function () {
        const d = window.XZ.mock || { rows: [] };
        const list = d.rows.map(function (r, i) {
          const q = {
            id: 'M' + i, mock: true, subj: r[0], ci: -1, chapter: r[1] || '', sec: r[2] || '', kp: '',
            set: r[3], n: r[4], stem: r[5],
            opts: r[6].map(function (o) { return { k: o[0], v: o[1] }; }),
            ans: r[7] || '', exp: '', clus: '', y: 0, t: 'M', v: '', mid: 'M'
          };
          q.multi = !!r[8] || q.ans.length > 1;
          q.label = '第' + q.n + '题';
          return q;
        });
        list.forEach(function (q) { self.byId.set(q.id, q); });
        (d.groups || []).forEach(function (g) {
          const qs = g.qs.map(function (i) { return list[i]; }).filter(Boolean);
          if (qs.length < 2) return;
          const item = {
            key: 'mg:' + qs[0].id, qs: qs, cid: '', bGroup: false,
            vignette: g.v || '', tails: g.tails || qs.map(function (q) { return q.stem; })
          };
          qs.forEach(function (q) { q._mockItem = item; });
        });
        self.mock = { meta: d, list: list };
        return self.mock;
      }).catch(function (e) {
        delete self._mockP;
        throw e;
      });
      return this._mockP;
    },

    mockSets() {
      if (!this.mock || !this.mock.meta.sets) return [];
      return this.mock.meta.sets.map(function (s) { return { t: s.t, n: s.n }; });
    },

    mockItemsBySet(setName) {
      if (!this.mock) return [];
      const set = (this.mock.meta.sets || []).filter(function (s) { return s.t === setName; })[0];
      if (!set) return [];
      const list = this.mock.list;
      const self = this, out = [], seen = {};
      set.qs.forEach(function (i) {
        const q = list[i];
        if (!q) return;
        const it = self.itemOf(q);
        if (seen[it.key]) return;
        seen[it.key] = 1;
        out.push(it);
      });
      return out;
    },

    mockItemsByChapter(subj, chapter, sec) {
      const qs = (this.mock ? this.mock.list : []).filter(function (q) {
        return q.subj === subj && q.chapter === chapter && (!sec || q.sec === sec);
      });
      return qs.map(function (q) { return { key: 'q:' + q.id, qs: [q], vignette: '', tails: [q.stem], cid: '' }; });
    },

    /* ---------- 易错小结 ---------- */
    ensureYicuo() {
      if (window.XZ && window.XZ.yicuo) return Promise.resolve(window.XZ.yicuo);
      if (this._ycP) return this._ycP;
      this._ycP = this._loadScript(BASE + 'data/yicuo.js?v=20261103a').then(function () { return window.XZ.yicuo || {}; });
      return this._ycP;
    },
    yicuoMap() { return (window.XZ && window.XZ.yicuo) || {}; },
    yicuoItems(subject) {
      const map = this.yicuoMap();
      const keys = map[subject] || [];
      const qs = [];
      keys.forEach(function (k) {
        const parts = String(k).split('|');
        const base = parts[0] + '-N' + parts[1];
        const cand = Bank.byId.get(base) || Bank.byId.get(base + '-L') || Bank.byId.get(base + '-J');
        if (cand) qs.push(cand);
      });
      return this.itemsOf(qs);
    },

    /* ---------- 标准答案（模拟题可自行订正） ---------- */
    truth(q) {
      const k = Store.doc.keys && Store.doc.keys[q.id];
      return (k && k.v) ? k.v : (q.ans || '');
    },

    search(term, limit) {
      term = (term || '').trim().toLowerCase();
      if (!term) return [];
      const out = [];
      this.subjectNames().forEach(function (name) {
        (Bank.loaded[name] || []).forEach(function (q) {
          if (out.length >= (limit || 80)) return;
          if (q.id.toLowerCase().indexOf(term) >= 0 || q.label.toLowerCase().indexOf(term) >= 0 ||
            q.stem.toLowerCase().indexOf(term) >= 0 || (q.kp && q.kp.toLowerCase().indexOf(term) >= 0)) out.push(q);
        });
      });
      return out;
    }
  };
})();

