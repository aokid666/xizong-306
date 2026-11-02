/* ============================================================
   session.js — 做题引擎（滚动模式 / 单题模式、分组提交）
   ============================================================ */
(function () {
  'use strict';
  const esc = U.esc;

  const S = {
    title: '', subtitle: '', items: [], sel: {}, res: {},
    mode: 'scroll', idx: 0, chunk: 10, submitMode: 'single',
    startTs: 0, done: false
  };
  window.Session = {
    S: S, start: start, resume: resume,
    teardown: function () {
      S.items = []; S.sel = {}; S.res = {};
      const p = document.querySelector('.pager'); if (p) p.remove();
      document.body.classList.remove('has-pager');
    }
  };

  let bar = null, content = null, pager = null;

  function sortLetters(s) { return String(s || '').split('').sort().join(''); }

  /* ---------------- 启动 ---------------- */
  function start(opt) {
    S.title = opt.title || '练习';
    S.subtitle = opt.subtitle || '';
    S.items = opt.items || [];
    S.sel = {}; S.res = {}; S.idx = 0; S.done = false;
    S.mode = opt.mode || Store.get('mode') || 'scroll';
    S.chunk = Math.max(1, Store.get('chunk') || 10);
    S.submitMode = Store.get('submitMode') || 'single';
    S.startTs = Date.now();
    if (!S.items.length) { U.toast('没有符合条件的题目'); return; }
    saveSnapshot();
    mount();
  }

  function resume() {
    const snap = Store.doc.session;
    if (!snap || !snap.items || !snap.items.length) return false;
    const names = snap.subjects || [];
    return Bank.ensure(names).then(function () {
      const items = [];
      snap.items.forEach(function (key) {
        if (key.indexOf('c:') === 0) {
          const cid = key.slice(2);
          const qs = Bank.clusters[cid];
          if (qs && qs.length) { const it = Bank.itemOf(qs[0]); it.key = key; items.push(it); }
        } else if (key.indexOf('b:') === 0) {
          const q = Bank.q(key.slice(2));
          if (q) {
            const rebuilt = Bank.itemsOf([q])[0];
            rebuilt.key = key;
            items.push(rebuilt);
          }
        } else {
          const q = Bank.q(key.slice(2));
          if (q) items.push(Bank.itemOf(q));
        }
      });
      if (!items.length) { Store.clearSession(); return false; }
      S.title = snap.title; S.subtitle = snap.subtitle || '';
      S.items = items; S.sel = snap.sel || {}; S.res = snap.res || {};
      S.mode = snap.mode || 'scroll'; S.idx = snap.idx || 0;
      S.chunk = snap.chunk || 10; S.submitMode = snap.submitMode || 'single';
      S.startTs = snap.ts || Date.now(); S.done = false;
      mount();
      return true;
    });
  }

  function saveSnapshot() {
    const subs = {};
    S.items.forEach(function (it) { it.qs.forEach(function (q) { subs[q.subj] = 1; }); });
    Store.setSession({
      title: S.title, subtitle: S.subtitle,
      items: S.items.map(function (it) { return it.key; }),
      sel: S.sel, res: S.res, idx: S.idx, mode: S.mode,
      chunk: S.chunk, submitMode: S.submitMode, ts: S.startTs,
      subjects: Object.keys(subs)
    });
  }

  /* ---------------- 挂载 ---------------- */
  function mount() {
    const old = document.querySelector('.pager');
    if (old) old.remove();
    const app = U.resetApp('wrap session');
    document.body.classList.toggle('has-pager', S.mode === 'paged');

    bar = U.el('div', { class: 'session-bar' });
    bar.innerHTML = '<div class="in">' +
      '<span class="session-title">' + esc(S.title) + '</span>' +
      '<span class="session-prog" data-prog>0 / 0</span>' +
      '<div class="progress-line"><i data-bar style="width:0%"></i></div>' +
      '<span class="sp"></span>' +
      '<div class="session-tools">' +
      '<button class="btn ghost sm" data-tool="sheet">答题卡</button>' +
      '<button class="btn ghost sm" data-tool="submit">' + (S.submitMode === 'single' ? '提交本题' : '提交本组') + '</button>' +
      '<button class="btn ghost sm" data-tool="mode">' + (S.mode === 'scroll' ? '单题模式' : '滚动模式') + '</button>' +
      '<button class="btn ghost sm" data-tool="exit">退出</button>' +
      '</div></div>';

    content = U.el('div', { class: 'session-body' });
    app.appendChild(bar);
    app.appendChild(content);

    pager = U.el('div', { class: 'pager', hidden: S.mode !== 'paged' });
    pager.innerHTML = '<div class="in">' +
      '<button class="btn ghost sm" data-page="prev">← 上一题</button>' +
      '<span class="pos" data-pos></span>' +
      '<span class="sp"></span>' +
      '<button class="btn ghost sm" data-tool2="sheet">答题卡</button>' +
      '<button class="btn sm primary" data-tool2="submit">提交</button>' +
      '<button class="btn ghost sm" data-page="next">下一题 →</button>' +
      '</div>';
    document.body.appendChild(pager);

    renderContent();
    refreshBar();
    Card.attach(content);
    bind();
  }

  function renderContent() {
    content.innerHTML = '';
    content.className = 'session-body' + (S.mode === 'paged' ? ' paged' : '');
    if (S.mode === 'paged') {
      const it = S.items[S.idx];
      if (it) content.appendChild(makeCard(it, S.idx));
      return;
    }
    const frag = document.createDocumentFragment();
    S.items.forEach(function (it, i) {
      frag.appendChild(makeCard(it, i));
      if (S.submitMode === 'chunk' && (i + 1) % S.chunk === 0 && i + 1 < S.items.length) {
        frag.appendChild(chunkSep(i - S.chunk + 2, i + 1));
      }
    });
    content.appendChild(frag);
  }

  function chunkSep(from, to) {
    const d = U.el('div', { class: 'chunk-sep', style: 'display:flex;gap:12px;align-items:center;padding:16px 0;border-bottom:1px solid #efedeb' });
    d.innerHTML = '<span class="hint">第 ' + from + '–' + to + ' 题</span><span style="flex:1"></span>' +
      '<button class="btn sm" data-tool="submit-chunk" data-from="' + (from - 1) + '" data-to="' + (to - 1) + '">提交本组</button>';
    return d;
  }

  function makeCard(item, i) {
    const card = Card.build(item, i, {
      sel: function (qid) { return S.sel[qid] || ''; },
      res: function (qid) { return S.res[qid] || null; },
      showSubmit: function () { return S.submitMode === 'single' || S.mode === 'paged'; }
    });
    Card.applyState(card, item, {
      sel: function (qid) { return S.sel[qid] || ''; },
      res: function (qid) { return S.res[qid] || null; },
      showSubmit: function () { return S.submitMode === 'single' || S.mode === 'paged'; }
    });
    return card;
  }

  function reState(card) {
    Card.applyState(card, card._item, {
      sel: function (qid) { return S.sel[qid] || ''; },
      res: function (qid) { return S.res[qid] || null; },
      showSubmit: function () { return S.submitMode === 'single' || S.mode === 'paged'; }
    });
  }

  /* ---------------- 交互 ---------------- */
  function bind() {
    if (bind._done) { return; }
    bind._done = true;

    document.addEventListener('click', function (e) {
      if (!S.items.length) return;
      const t = e.target;

      const opt = t.closest('.opt');
      if (opt && !opt.classList.contains('locked') && content.contains(opt)) {
        toggleChoice(opt.closest('.subq'), opt.dataset.k, opt);
        return;
      }
      const pick = t.closest('.pick');
      if (pick && content.contains(pick)) {
        toggleChoice(pick.closest('.subq'), pick.dataset.k, pick);
        return;
      }

      const act = t.closest('[data-act]');
      if (act && content.contains(act)) {
        const card = act.closest('.card');
        const item = card._item;
        const kind = act.dataset.act;
        const subq = act.closest('.subq');
        if (kind === 'submit') { submitItem(item); return; }
        if (kind === 'reveal') { revealItem(item); return; }
        if (kind === 'exp') {
          if (Store.get('revealMode') === 'side') { showExplain(subq ? subq.dataset.qid : item.qs[0].id); }
          else {
            const d = subq && subq.querySelector('details.exp');
            if (d) { d.hidden = false; d.open = true; d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
          }
          return;
        }
        if (kind === 'fav') { Store.toggleFav(item.qs[0].id); Card.refreshActs(card, item); U.toast(Store.isFav(item.qs[0].id) ? '已收藏' : '已取消收藏'); return; }
        if (kind === 'flag') { flagDialog(item.qs[0].id, function () { Card.refreshActs(card, item); }); return; }
        if (kind === 'note') { Card.openNote(card, subq ? subq.dataset.qid : item.qs[0].id); return; }
        if (kind === 'hw') { Card.hwToggle(card); return; }
        if (kind === 'key') { keyDialog(item); return; }
      }

      const tool = t.closest('[data-tool]');
      if (tool) {
        const k = tool.dataset.tool;
        if (k === 'sheet') openSheet();
        else if (k === 'submit') submitChunk();
        else if (k === 'submit-chunk') submitRange(+tool.dataset.from, +tool.dataset.to);
        else if (k === 'mode') toggleMode();
        else if (k === 'exit') exit();
        return;
      }
      const tool2 = t.closest('[data-tool2]');
      if (tool2) {
        if (tool2.dataset.tool2 === 'sheet') openSheet();
        else submitChunk();
        return;
      }
      const page = t.closest('[data-page]');
      if (page) {
        go(S.idx + (page.dataset.page === 'next' ? 1 : -1));
        return;
      }
      const jump = t.closest('[data-jump]');
      if (jump) { U.closeDrawer(); go(+jump.dataset.jump); return; }
    });

    document.addEventListener('keydown', function (e) {
      if (!S.items.length) return;
      if (e.target.matches('input,textarea,select')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' && S.mode === 'paged') {
        if (S.mode === 'paged') { e.preventDefault(); go(S.idx + 1); }
      } else if (e.key === 'ArrowLeft') {
        if (S.mode === 'paged') { e.preventDefault(); go(S.idx - 1); }
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        submitChunk();
      }
    });

    window.addEventListener('scroll', function () {
      if (S.mode !== 'scroll') return;
      updateActiveOnScroll();
    }, { passive: true });
  }

  function currentCardIndexOnScreen() {
    const cards = U.$$('.card', content);
    if (!cards.length) return 0;
    const mid = window.innerHeight * 0.35;
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (r.bottom > mid) return i;
    }
    return cards.length - 1;
  }

  function updateActiveOnScroll() {
    if (!bar) return;
    const i = currentCardIndexOnScreen();
    if (i !== S.idx) { S.idx = i; refreshBar(); }
  }

  /* ---------------- 提交与判定 ---------------- */
  function submitItem(item) {
    let any = false;
    item.qs.forEach(function (q) {
      const chosen = S.sel[q.id];
      if (!chosen || S.res[q.id]) return;
      const truth = Bank.truth(q);
      if (!truth) { U.toast('这题还没有正确答案，点「✎答」录入后再提交'); return; }
      const ok = sortLetters(chosen) === sortLetters(truth);
      S.res[q.id] = { ok: ok, ans: chosen };
      Store.record(q.id, chosen, ok);
      any = true;
    });
    if (!any) { U.toast('先选择答案'); return; }
    const card = U.$('.card[data-key="' + cssKey(item.key) + '"]', content);
    if (card) {
      reState(card);
      if (S.mode === 'paged') Card.hwRedraw(card);
    }
    refreshBar();
    saveSnapshot();
    if (Store.get('revealMode') === 'side') showExplain(item.qs[0].id);
  }

  function revealItem(item) {
    item.qs.forEach(function (q) {
      if (S.res[q.id]) return;
      S.res[q.id] = { ok: null, ans: S.sel[q.id] || '' };
    });
    const card = U.$('.card[data-key="' + cssKey(item.key) + '"]', content);
    if (card) reState(card);
    refreshBar(); saveSnapshot();
  }

  function submitRange(from, to) {
    let n = 0;
    for (let i = from; i <= to && i < S.items.length; i++) {
      const it = S.items[i];
      if (it.qs.some(function (q) { return S.res[q.id]; })) continue;
      if (!it.qs.some(function (q) { return S.sel[q.id]; })) continue;
      submitItem(it);
      n++;
    }
    if (!n) U.toast('本组还没有作答');
  }

  function submitChunk() {
    if (S.submitMode === 'all') { submitRange(0, S.items.length - 1); return; }
    const i = S.mode === 'paged' ? S.idx : currentCardIndexOnScreen();
    if (S.submitMode === 'single') { submitItem(S.items[i]); return; }
    const start = Math.floor(i / S.chunk) * S.chunk;
    submitRange(start, Math.min(start + S.chunk - 1, S.items.length - 1));
  }

  function showExplain(qid) {
    const q = Bank.q(qid);
    if (!q) return;
    const html = '<div class="ans-line" style="margin-bottom:10px;font-size:13px;color:#555">' +
      '正确答案 <b style="font-family:var(--mono)">' + esc(Bank.truth(q).split('').join(' ')) + '</b>' +
      '　你的答案 <b style="font-family:var(--mono)">' + esc((S.sel[qid] || '未作答').split('').join(' ')) + '</b></div>' +
      '<div style="font-family:var(--serif);line-height:1.9;font-size:14.5px">' + esc(q.exp || '（暂无解析）') + '</div>';
    U.openDrawer('解析 · ' + q.label, html);
  }

  function toggleChoice(subq, k, el) {
    if (!subq) return;
    const qid = subq.dataset.qid;
    const q = Bank.q(qid);
    let cur = S.sel[qid] || '';
    if (q && q.multi) {
      cur = cur.indexOf(k) >= 0 ? cur.split('').filter(function (x) { return x !== k; }).join('') : (cur + k);
    } else {
      cur = (cur === k) ? '' : k;
    }
    if (cur) S.sel[qid] = cur; else delete S.sel[qid];
    reState(el.closest('.card'));
    refreshBar();
    saveSnapshot();
  }

  function keyDialog(item) {
    const q = item.qs[0];
    const cur = Bank.truth(q);
    const picks = {};
    cur.split('').forEach(function (c) { picks[c] = 1; });
    const body = U.el('div');
    body.innerHTML = '<p class="hint" style="margin-bottom:10px">' +
      '这是模拟题：可以按课堂讲解录入/订正「正确答案」，之后判分以它为准。<br>' +
      '题库自带的答案：<b style="font-family:var(--mono)">' + esc(q.ans || '（无）') + '</b></p>';
    const row = U.el('div', { class: 'picks' });
    q.opts.forEach(function (o) {
      const b = U.el('button', { class: 'pick' + (picks[o.k] ? ' sel' : ''), title: o.v }, '<b>' + o.k + '</b>');
      b.addEventListener('click', function () {
        picks[o.k] = !picks[o.k];
        b.classList.toggle('sel', !!picks[o.k]);
      });
      row.appendChild(b);
    });
    body.appendChild(row);
    U.modal({
      title: '订正正确答案 · ' + q.label, body: body, buttons: [
        { label: '取消' },
        {
          label: '保存', cls: 'primary', onClick: function () {
            const v = Object.keys(picks).filter(function (k) { return picks[k]; }).sort().join('');
            Store.setKey(q.id, v);
            if (S.res[q.id]) {
              S.res[q.id].ok = sortLetters(S.sel[q.id] || '') === sortLetters(Bank.truth(q)) && !!S.sel[q.id];
              Store.record(q.id, S.sel[q.id] || '', S.res[q.id].ok);
            }
            const card = U.$('.card[data-key="' + cssKey(item.key) + '"]', content);
            if (card) reState(card);
            U.toast(v ? '已保存正确答案 ' + v : '已清除订正');
          }
        }
      ]
    });
  }

  function flagDialog(qid, done) {
    const cur = Store.flag(qid);
    const body = U.el('div');
    body.innerHTML = '<p class="hint" style="margin-bottom:12px">给这道题打个标记，之后可以按标记筛选、组题时排除。</p>';
    const list = U.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' });
    const types = Card.FLAG_ORDER.concat(['']);
    types.forEach(function (t) {
      const b = U.el('button', { class: 'btn sm' + (cur && cur.t === t ? ' on' : '') }, t ? Card.FLAGS[t] : '清除标记');
      b.addEventListener('click', function () {
        Store.setFlag(qid, t || null);
        U.closeModal();
        if (done) done();
        U.toast(t ? '已标记为「' + Card.FLAGS[t] + '」' : '已清除标记');
      });
      list.appendChild(b);
    });
    body.appendChild(list);
    U.modal({ title: '标记这道题', body: body, buttons: [{ label: '关闭' }] });
  }

  /* ---------------- 导航 / 视图 ---------------- */
  function go(i) {
    if (S.mode !== 'paged') {
      const cards = U.$$('.card', content);
      const c = cards[U.clamp(i, 0, cards.length - 1)];
      if (c) {
        window.scrollTo({ top: c.getBoundingClientRect().top + window.scrollY - 120, behavior: 'smooth' });
        S.idx = i; refreshBar();
      }
      return;
    }
    if (i < 0 || i >= S.items.length) return;
    S.idx = i;
    content.innerHTML = '';
    const card = makeCard(S.items[i], i);
    content.appendChild(card);
    Card.attach(content);
    Card.hwRedraw(card);
    window.scrollTo(0, 0);
    refreshBar();
    saveSnapshot();
  }

  function toggleMode() {
    S.mode = S.mode === 'scroll' ? 'paged' : 'scroll';
    Store.set('mode', S.mode);
    document.body.classList.toggle('has-pager', S.mode === 'paged');
    pager.hidden = S.mode !== 'paged';
    bar.querySelector('[data-tool="mode"]').textContent = S.mode === 'scroll' ? '单题模式' : '滚动模式';
    renderContent();
    if (S.mode === 'paged') { S.idx = Math.min(S.idx, S.items.length - 1); go(S.idx); }
    Card.attach(content);
    refreshBar();
    saveSnapshot();
  }

  function refreshBar() {
    if (!bar) return;
    const total = S.items.length;
    const done = S.items.filter(function (it) { return it.qs.every(function (q) { return S.res[q.id]; }); }).length;
    bar.querySelector('[data-prog]').textContent = (S.idx + 1) + ' / ' + total + '　已做 ' + done;
    const pct = total ? Math.round(done * 100 / total) : 0;
    bar.querySelector('[data-bar]').style.width = pct + '%';
    const pos = pager && pager.querySelector('[data-pos]');
    if (pos) pos.textContent = (S.idx + 1) + ' / ' + total;
  }

  function openSheet() {
    const body = U.el('div');
    const groups = [
      { t: 'A 型题', test: function (q) { return q.t === 'A' || q.t === 'M'; } },
      { t: 'B 型题（共用备选）', test: function (q) { return q.t === 'B'; } },
      { t: 'C 型题', test: function (q) { return q.t === 'C'; } },
      { t: 'X 型题（多选）', test: function (q) { return q.t === 'X'; } }
    ];
    body.innerHTML = '<p class="hint" style="margin-bottom:14px">灰=已选未交　绿=对　红=错　右上角红点=已标记</p>';
    groups.forEach(function (g) {
      const rows = [];
      S.items.forEach(function (it, i) { if (g.test(it.qs[0])) rows.push(i); });
      if (!rows.length) return;
      const h = U.el('div', { class: 'sheet-hd' }, g.t + '　<span class="hint">' + rows.length + ' 题</span>');
      body.appendChild(h);
      const grid = U.el('div', { class: 'sheet' });
      rows.forEach(function (i) {
        const it = S.items[i], q0 = it.qs[0];
        const sub = it.qs.every(function (q) { return S.res[q.id]; });
        const ok = it.qs.every(function (q) { return S.res[q.id] && S.res[q.id].ok; });
        const cls = 'btn-sheet' + (sub ? (ok ? ' ok' : ' no') : (S.sel[q0.id] ? ' done' : '')) + (i === S.idx ? ' cur' : '') + (Store.flag(q0.id) ? ' flag' : '');
        grid.appendChild(U.el('button', { class: cls, 'data-jump': i, title: q0.label }, String(i + 1)));
      });
      body.appendChild(grid);
    });
    U.openDrawer('答题卡 · ' + (S.idx + 1) + '/' + S.items.length, body);
  }

  function exit() {
    U.modal({
      title: '退出练习？', body: '<p>作答记录已经保存，可以随时从「继续上次」进入。</p>',
      buttons: [
        { label: '继续做题' },
        {
          label: '退出', cls: 'primary', onClick: function () {
            saveSnapshot();
            S.items = [];
            if (pager) pager.remove();
            document.body.classList.remove('has-pager');
            location.hash = '#/home';
          }
        }
      ]
    });
  }

  function cssKey(k) { return String(k).replace(/["\\]/g, '\\$&'); }
})();


