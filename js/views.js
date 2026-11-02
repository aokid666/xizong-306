/* ============================================================
   views.js — 页面视图
   ============================================================ */
(function () {
  'use strict';
  const esc = U.esc;

  const Views = window.Views = {};

  function app() { return document.getElementById('app'); }
  function shell(html) {
    const a = U.resetApp('wrap');
    a.innerHTML = html;
  }
  function crumb(items) {
    return '<div class="crumb">' + items.map(function (it, i) {
      return (i ? '<span class="sep">/</span>' : '') + (it.href ? '<a href="' + it.href + '">' + esc(it.t) + '</a>' : '<span>' + esc(it.t) + '</span>');
    }).join('') + '</div>';
  }

  function startItems(items, title, subtitle) {
    if (!items || !items.length) { U.toast('没有符合条件的题目'); return; }
    Session.start({ title: title, subtitle: subtitle, items: items });
    location.hash = '#/play';
  }

  function loadThen(names, fn, label) {
    U.toast(label || '正在载入题库…', 9000);
    return Bank.ensure(names).then(function () {
      const t = document.getElementById('toast'); if (t) t.hidden = true;
      fn();
    }).catch(function (e) {
      U.toast('题库载入失败：' + e.message, 4000);
    });
  }

  /* ================= 首页 ================= */
  Views.home = function () {
    const st = Store.stats();
    const total = Bank.meta.total;
    const years = Bank.meta.years;
    const snap = Store.doc.session;
    const pct = st.done ? Math.round(st.right * 100 / st.done) : 0;

    let html = '<section class="hero">' +
      '<h1>西医综合真题刷题本</h1>' +
      '<p>1988—2026 年 306 真题，按年份、科目、章节、知识点分层整理。支持随机组题、病例题整体作答、手写批注、划线高亮、笔记、错题与标记。数据保存在本机。</p>' +
      '<div class="hero-stats">' +
      '<div><b>' + U.fmtNum(total) + '</b><span>题目总数</span></div>' +
      '<div><b>' + years[0].y + '–' + years[years.length - 1].y + '</b><span>年份跨度</span></div>' +
      '<div><b>' + U.fmtNum(st.done) + '</b><span>已作答</span></div>' +
      '<div><b>' + (st.done ? pct + '%' : '—') + '</b><span>正确率</span></div>' +
      '</div></section>';

    if (snap && snap.items && snap.items.length) {
      const answered = Object.keys(snap.sel || {}).length;
      html += '<div class="resume"><span class="t"><b>' + esc(snap.title || '上次练习') + '</b>　已答 ' + answered + ' 题 · ' +
        U.fmtTime(snap.ts) + '</span>' +
        '<button class="btn sm" data-act="resume">继续上次</button>' +
        '<button class="btn ghost sm" data-act="drop-resume">放弃</button></div>';
    }

    html += '<div class="entries">' +
      entry('按年份刷题', '整套真题按题号顺序或随机，滚动 / 单题两种作答方式', '#/years') +
      entry('按科目 · 章节', '生理、生化、病理、内科、外科，逐章逐节刷', '#/subjects') +
      entry('模拟题（天天师兄）', '课后 / 阶段测试 / 摸底 / 冲刺共 12 套，答案可自行订正', '#/mock') +
      entry('易错小结（天天师兄）', '五科易错真题清单，按科目集中攻克', '#/yicuo') +
      entry('随机组题', '自选科目、章节、分层、年份，随机抽取指定题量', '#/build') +
      entry('收藏 / 错题 / 标记', '回顾收藏、做错的题，以及标记为过时、争议的题', '#/lists') +
      entry('学习统计', '各科目进度与正确率', '#/stats') +
      entry('设置与备份', '解析显示方式、提交方式、数据导出导入', '#/settings') +
      '</div>';

    html += '<div style="margin-top:40px" class="hint">提示：病例题（共用题干的多小问）在组题与随机时始终作为一个整体，不会被拆开；提交时也只给一个提交按钮。</div>';
    shell(html);

    app().addEventListener('click', function (e) {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'resume') {
        U.toast('正在恢复…', 4000);
        Session.resume().then(function (ok) {
          if (ok) { location.hash = '#/play'; } else U.toast('没有可恢复的练习');
        });
      }
      if (b.dataset.act === 'drop-resume') {
        Store.clearSession();
        Views.home();
      }
    });
  };

  function entry(t, d, href) {
    return '<a class="entry" href="' + href + '"><h3>' + esc(t) + '</h3><p>' + esc(d) + '</p></a>';
  }

  /* ================= 按年份 ================= */
  Views.years = function () {
    const ys = Bank.meta.years.slice().reverse();
    let html = crumb([{ t: '首页', href: '#/home' }, { t: '按年份刷题' }]);
    html += '<div class="page-hd"><h1>按年份刷题</h1><div class="sub">选择年份后，可以选择「滚动（像纸质卷子一样）」或「单题（左右切换）」作答方式，也可以随机打乱题序。病例题始终成组出现。</div></div>';
    html += '<div class="tree-tools"><label class="chk"><input type="checkbox" id="y-human"> 年份套题包含「人文精神」</label>' +
      '<span class="hint">默认只取 306 的五个科目</span></div>';
    html += '<div class="list">';
    ys.forEach(function (y) {
      const p = yearProgress(y.y);
      html += '<div class="row" data-year="' + y.y + '">' +
        '<div class="grow"><div class="t">' + y.y + ' 年真题</div>' +
        '<div class="d">' + y.n + ' 题' + (p.done ? ' · 已做 ' + p.done + ' · 正确率 ' + U.pct(p.right, p.done) + '%' : '') + '</div>' +
        '</div><span class="num">' + y.n + ' 题</span><span class="go">开始 →</span></div>';
    });
    html += '</div>';
    shell(html);

    app().addEventListener('click', function (e) {
      const row = e.target.closest('[data-year]');
      if (!row) return;
      pickYear(+row.dataset.year);
    });
  };

  function yearProgress(y) {
    let done = 0, right = 0;
    Bank.subjectNames().forEach(function (n) {
      (Bank.loaded[n] || []).forEach(function (q) {
        if (q.y !== y) return;
        const p = Store.prog(q.id);
        if (p) { done++; if (p.ok) right++; }
      });
    });
    return { done: done, right: right };
  }

  function pickYear(y) {
    const incHuman = document.getElementById('y-human') && document.getElementById('y-human').checked;
    const body = U.el('div');
    body.innerHTML =
      '<p class="hint" style="margin-bottom:14px">' + y + ' 年 · ' + (incHuman ? '含人文精神' : '生理/生化/病理/内科/外科') + '</p>' +
      '<div class="field"><div class="k">作答方式</div><div class="v">' +
      '<div class="seg" data-seg="mode"><button data-v="scroll" class="on">滚动（纸质版）</button><button data-v="paged">单题（左右切换）</button></div></div></div>' +
      '<div class="field"><div class="k">题目顺序</div><div class="v">' +
      '<div class="seg" data-seg="order"><button data-v="seq" class="on">按题号</button><button data-v="rand">随机打乱</button></div>' +
      '<span class="hint">打乱时病例题整组移动，不会拆开</span></div></div>' +
      '<div class="field"><div class="k">提交方式</div><div class="v">' +
      '<div class="seg" data-seg="submit"><button data-v="single" class="on">每题提交</button><button data-v="chunk">每 N 题一起提交</button><button data-v="all">整卷提交</button></div>' +
      '<input class="input" type="number" min="2" max="100" value="' + (Store.get('chunk') || 10) + '" style="width:72px" data-chunk>' +
      '<span class="hint">N</span></div></div>' +
      '<div class="field"><div class="k">范围</div><div class="v" style="gap:14px">' +
      '<label class="chk"><input type="checkbox" data-range="from" checked> 从第 <input class="input" type="number" min="1" value="1" style="width:68px"> 题</label>' +
      '<label class="chk">到第 <input class="input" type="number" min="1" value="' + 999 + '" style="width:68px" data-to> 题</label>' +
      '</div></div>';
    U.modal({
      title: y + ' 年真题', body: body, buttons: [
        { label: '取消' },
        {
          label: '开始', cls: 'primary', onClick: function () {
            const mode = segVal(body, 'mode'), order = segVal(body, 'order'), submit = segVal(body, 'submit');
            const chunk = parseInt((body.querySelector('[data-chunk]') || {}).value || 10, 10) || 10;
            Store.set('chunk', chunk);
            Store.set('submitMode', submit);
            Store.set('mode', mode);
            loadThen(Bank.subjectNames(), function () {
              let items = Bank.itemsByYear(y, { includeHumanity: incHuman });
              const inputs = body.querySelectorAll('input[type=number]');
              const from = Math.max(1, parseInt(inputs[1] ? inputs[1].value : 1, 10) || 1);
              const to = parseInt(body.querySelector('[data-to]').value, 10) || 9999;
              items = items.filter(function (it) {
                const n = it.qs[0].n;
                return n >= from && n <= to;
              });
              if (order === 'rand') Bank.shuffle(items);
              const label = y + ' 年真题' + (order === 'rand' ? '（随机）' : '');
              startItems(items, label, y + ' 年 · ' + items.length + ' 题');
            });
          }
        }
      ]
    });
  }

  function segVal(root, name) {
    const seg = root.querySelector('[data-seg="' + name + '"]');
    if (!seg) return '';
    const on = seg.querySelector('button.on');
    return on ? on.dataset.v : '';
  }

  /* ================= 按科目 / 章节 ================= */
  Views.subjects = function () {
    let html = crumb([{ t: '首页', href: '#/home' }, { t: '按科目 · 章节' }]);
    html += '<div class="page-hd"><h1>按科目 · 章节</h1><div class="sub">按 科目 → 章 → 节 → 知识点 逐层刷题。章节层级来自「医考帮分层刷题」。</div></div>';
    html += '<div class="list">';
    Bank.meta.subjects.forEach(function (s) {
      let done = 0;
      (Bank.loaded[s.name] || []).forEach(function (q) { if (Store.prog(q.id)) done++; });
      html += '<div class="row" data-subject="' + esc(s.name) + '">' +
        '<div class="grow"><div class="t">' + esc(s.name) + '</div>' +
        '<div class="d">' + s.chapters.length + ' 章 · ' + s.n + ' 题</div></div>' +
        '<span class="go">进入 →</span></div>';
    });
    html += '</div>';
    html += '<p class="hint" style="margin-top:22px">提示：章节页可以直接「刷本章」「刷本节」「刷某知识点」，也可以多选后点右下角组题。</p>';
    shell(html);
    app().addEventListener('click', function (e) {
      const r = e.target.closest('[data-subject]');
      if (r) location.hash = '#/subject/' + encodeURIComponent(r.dataset.subject);
    });
  };

  Views.subject = function (name) {
    const s = Bank.subjectMeta(name);
    if (!s) { location.hash = '#/subjects'; return; }
    let html = crumb([{ t: '首页', href: '#/home' }, { t: '按科目', href: '#/subjects' }, { t: name }]);
    html += '<div class="page-hd"><h1>' + esc(name) + '</h1><div class="sub">' + s.chapters.length + ' 章 · ' + s.n + ' 题　（点击章标题展开）</div></div>';
    html += '<div class="tree-tools">' +
      '<button class="btn sm" data-all="seq">整科顺序刷</button>' +
      '<button class="btn sm" data-all="rand">整科随机刷</button>' +
      '<span class="hint">章节内可按年份顺序，也可随机</span></div>';
    html += '<div class="tree">';
    s.chapters.forEach(function (ch, ci) {
      html += '<details class="tree-ch"><summary>' +
        '<span class="caret">▶</span>' +
        '<span class="name">' + (ch.p ? '第' + ch.p + '篇 ' : '') + '第' + ch.z + '章 ' + esc(ch.t) + '</span>' +
        '<span class="meta">' + ch.n + ' 题</span></summary>';
      html += '<div class="ch-actions">' +
        '<button class="btn sm" data-ch="' + ci + '" data-order="seq">刷本章</button>' +
        '<button class="btn sm" data-ch="' + ci + '" data-order="rand">随机本章</button></div>';
      ch.sec.forEach(function (sec, si) {
        html += '<div class="tree-sec">' +
          '<div class="st"><span>' + esc(sec.t) + '</span><span class="n">' + sec.n + '</span>' +
          '<span style="flex:1"></span>' +
          '<button class="btn ghost sm" data-sec="' + si + '" data-ch="' + ci + '">刷本节</button></div>';
        if (sec.kp && sec.kp.length) {
          html += '<div class="kps">' + sec.kp.slice(0, 14).map(function (k) {
            return '<span class="kp" data-ch="' + ci + '" data-sec="' + si + '" data-kp="' + esc(k.t) + '">' +
              esc(k.t) + '<span class="c">' + k.n + '</span></span>';
          }).join('') + '</div>';
        }
        html += '</div>';
      });
      html += '</details>';
    });
    html += '</div>';
    shell(html);
    bindSubject(name);
  };

  function bindSubject(name) {
    const s = Bank.subjectMeta(name);
    app().addEventListener('click', function (e) {
      const chBtn = e.target.closest('[data-ch]');
      const allBtn = e.target.closest('[data-all]');
      if (allBtn) {
        loadThen([name], function () {
          const items = Bank.itemsBySubject(name);
          if (allBtn.dataset.all === 'rand') Bank.shuffle(items);
          startItems(items, name + (allBtn.dataset.all === 'rand' ? '（随机）' : '（顺序）'), name + ' · ' + items.length + ' 题');
        });
        return;
      }
      if (!chBtn) return;
      const ci = +chBtn.dataset.ch;
      const secIdx = chBtn.dataset.sec != null ? +chBtn.dataset.sec : null;
      const kp = chBtn.dataset.kp || '';
      if (e.target.classList.contains('kp') && !e.target.dataset.kp) return;
      loadThen([name], function () {
        const ch = s.chapters[ci];
        const secTitle = secIdx != null && ch.sec[secIdx] ? ch.sec[secIdx].t : null;
        let items = Bank.itemsByChapter(name, ci, secTitle, kp);
        const order = chBtn.dataset.order || 'seq';
        if (order === 'rand') Bank.shuffle(items);
        const label = name + ' · 第' + ch.z + '章 ' + ch.t + (secTitle ? ' · ' + secTitle : '') + (kp ? ' · ' + kp : '');
        startItems(items, label, label.replace(/ · /g, ' / '));
      });
    });
  }

  /* ================= 随机组题 ================= */
  Views.build = function () {
    let html = crumb([{ t: '首页', href: '#/home' }, { t: '随机组题' }]);
    html += '<div class="page-hd"><h1>随机组题</h1><div class="sub">勾选科目、章节、分层、年份，指定题量随机抽取。病例题作为一个整体抽取，不会拆开。</div></div>';

    html += '<div class="field"><div class="k">科目</div><div class="v" data-subj-box>';
    Bank.meta.subjects.forEach(function (s) {
      html += '<label class="chk"><input type="checkbox" value="' + esc(s.name) + '" checked> ' + esc(s.name) + '</label>';
    });
    html += '</div></div>';

    html += '<div class="field"><div class="k">章节</div><div class="v" style="display:block">' +
      '<div class="hint" style="margin-bottom:8px">不勾选＝该科目全部章节；勾选后只从选中章节抽题。</div>' +
      '<div data-chap-box style="max-height:230px;overflow:auto;border:1px solid var(--line);border-radius:7px;padding:10px 12px;display:flex;flex-direction:column;gap:6px"></div>' +
      '</div></div>';

    html += '<div class="field"><div class="k">分层（节）</div><div class="v">' +
      '<select class="select" data-sec-select><option value="">不限（全部节）</option></select>' +
      '<span class="hint">先在下方章节里勾选，再选具体「节」</span></div></div>';

    html += '<div class="field"><div class="k">年份</div><div class="v">' +
      '<select class="select" data-yfrom></select><span class="hint">至</span><select class="select" data-yto></select>' +
      '</div></div>';

    html += '<div class="field"><div class="k">题型</div><div class="v">' +
      '<label class="chk"><input type="checkbox" value="A" checked> A 型</label>' +
      '<label class="chk"><input type="checkbox" value="B" checked> B 型（共用备选）</label>' +
      '<label class="chk"><input type="checkbox" value="C" checked> C 型</label>' +
      '<label class="chk"><input type="checkbox" value="X" checked> X 型（多选）</label>' +
      '</div></div>';

    html += '<div class="field"><div class="k">题量</div><div class="v">' +
      '<input class="input" type="number" min="1" max="300" value="30" data-count style="width:90px">' +
      '<span class="hint">按「组」计数：一道病例题算 1 组（可能含 3 小问）</span></div></div>';

    html += '<div class="field"><div class="k">筛选</div><div class="v">' +
      '<label class="chk"><input type="checkbox" data-opt="excludeFlags"> 排除已标记的题（过时/争议/烂题…）</label>' +
      '<label class="chk"><input type="checkbox" data-opt="onlyUndone"> 只抽没做过的</label>' +
      '<label class="chk"><input type="checkbox" data-opt="onlyWrong"> 只抽做错的</label>' +
      '</div></div>';

    html += '<div class="field"><div class="k">顺序</div><div class="v">' +
      '<div class="seg" data-seg="order"><button data-v="rand" class="on">随机打乱</button><button data-v="seq">按章节顺序</button></div>' +
      '</div></div>';

    html += '<div style="display:flex;gap:12px;align-items:center;margin-top:22px;flex-wrap:wrap">' +
      '<button class="btn primary" data-act="go">生成并开始</button>' +
      '<span class="hint" data-preview>已选：全部</span></div>';

    shell(html);

    // 填充章节树
    const chapBox = app().querySelector('[data-chap-box]');
    function fillChapters() {
      const subs = checkedSubjects();
      chapBox.innerHTML = '';
      Bank.meta.subjects.forEach(function (s) {
        if (subs.length && subs.indexOf(s.name) < 0) return;
        const grp = U.el('div', { style: 'margin-bottom:4px' });
        grp.innerHTML = '<div class="hint" style="margin:6px 0 4px;color:#8a857e">' + esc(s.name) + '</div>';
        s.chapters.forEach(function (ch, ci) {
          const lab = U.el('label', { class: 'chk', style: 'display:flex;padding:2px 0' });
          lab.innerHTML = '<input type="checkbox" data-chap value="' + esc(s.name) + '|' + ci + '"> ' +
            '第' + ch.z + '章 ' + esc(ch.t) +
            '<span class="hint" style="margin-left:auto">' + ch.n + '</span>';
          grp.appendChild(lab);
        });
        chapBox.appendChild(grp);
      });
      fillSecSelect();
    }

    function checkedSubjects() {
      return U.$$('[data-subj-box] input:checked', app()).map(function (x) { return x.value; });
    }

    function fillSecSelect() {
      const sel = app().querySelector('[data-sec-select]');
      sel.innerHTML = '<option value="">不限（全部节）</option>';
      const chaps = U.$$('[data-chap]:checked', app()).map(function (x) { return x.value; });
      const subs = checkedSubjects();
      Bank.meta.subjects.forEach(function (s) {
        if (subs.length && subs.indexOf(s.name) < 0) return;
        s.chapters.forEach(function (ch, ci) {
          const ck = s.name + '|' + ci;
          if (chaps.length && chaps.indexOf(ck) < 0) return;
          ch.sec.forEach(function (sec) {
            if (!sec.n) return;
            const o = U.el('option', { value: ck + '|' + sec.t }, s.name + ' · 第' + ch.z + '章 · ' + sec.t + '（' + sec.n + '）');
            sel.appendChild(o);
          });
        });
      });
    }

    const yfrom = app().querySelector('[data-yfrom]');
    const yto = app().querySelector('[data-yto]');
    Bank.meta.years.forEach(function (y) {
      yfrom.appendChild(U.el('option', { value: y.y }, String(y.y)));
      yto.appendChild(U.el('option', { value: y.y }, String(y.y)));
    });
    yfrom.value = '2000';
    yto.value = String(Bank.meta.years[Bank.meta.years.length - 1].y);

    fillChapters();

    app().addEventListener('change', function (e) {
      if (e.target.matches('[data-subj-box] input')) { fillChapters(); updatePreview(); }
      else if (e.target.matches('[data-chap]')) { fillSecSelect(); updatePreview(); }
      else updatePreview();
    });

    function updatePreview() {
      const n = U.$$('[data-chap]:checked', app()).length;
      const subs = checkedSubjects();
      const el = app().querySelector('[data-preview]');
      el.textContent = (subs.length ? subs.join('、') : '全部科目') + (n ? ' · 已选 ' + n + ' 章' : ' · 全部章节');
    }

    app().addEventListener('click', function (e) {
      if (!e.target.closest('[data-act="go"]')) return;
      const subs = checkedSubjects();
      const chaps = U.$$('[data-chap]:checked', app()).map(function (x) { return x.value; });
      const secV = app().querySelector('[data-sec-select]').value;
      const yf = parseInt(yfrom.value, 10), yt = parseInt(yto.value, 10);
      const types = U.$$('.field input[type=checkbox][value=A],.field input[type=checkbox][value=B],.field input[type=checkbox][value=C],.field input[type=checkbox][value=X]', app())
        .filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
      const count = parseInt(app().querySelector('[data-count]').value, 10) || 30;
      const order = segVal(app(), 'order');
      const opt = {
        subjects: subs, chapters: chaps, types: types,
        yearFrom: Math.min(yf, yt), yearTo: Math.max(yf, yt),
        excludeFlags: app().querySelector('[data-opt="excludeFlags"]').checked,
        onlyUndone: app().querySelector('[data-opt="onlyUndone"]').checked,
        onlyWrong: app().querySelector('[data-opt="onlyWrong"]').checked
      };
      if (secV) opt.sections = [secV];
      const need = subs.length ? subs : Bank.subjectNames();
      loadThen(need, function () {
        let items = Bank.query(opt);
        if (!items.length) { U.toast('没有符合条件的题目'); return; }
        if (order === 'rand') Bank.shuffle(items);
        if (count < items.length) items = items.slice(0, count);
        const label = '随机组题 · ' + items.length + ' 组';
        startItems(items, label, (subs.length ? subs.join('/') : '全科') + ' · ' + opt.yearFrom + '–' + opt.yearTo);
      });
    });
  };

  /* ================= 收藏 / 错题 / 标记 ================= */
  Views.lists = function () {
    let html = crumb([{ t: '首页', href: '#/home' }, { t: '收藏 / 错题 / 标记' }]);
    html += '<div class="page-hd"><h1>收藏 · 错题 · 标记</h1><div class="sub">按状态筛选题目，可一键开始重刷。需要先载入题库。</div></div>';
    html += '<div class="tree-tools">' +
      '<div class="seg" data-seg="tab">' +
      '<button data-v="fav">收藏</button><button data-v="wrong">错题</button>' +
      '<button data-v="flag">标记</button><button data-v="note">有笔记</button>' +
      '</div>' +
      '<span style="flex:1"></span>' +
      '<button class="btn sm" data-act="play">开始刷这些题</button>' +
      '</div>';
    html += '<div id="list-body"><div class="empty">正在载入题库…</div></div>';
    shell(html);

    let tab = 'fav', items = [];

    function render() {
      const box = document.getElementById('list-body');
      const rows = [];
      Bank.subjectNames().forEach(function (n) {
        (Bank.loaded[n] || []).forEach(function (q) {
          if (tab === 'fav' && !Store.isFav(q.id)) return;
          if (tab === 'wrong') { const p = Store.prog(q.id); if (!p || p.ok) return; }
          if (tab === 'flag' && !Store.flag(q.id)) return;
          if (tab === 'note') { const nt = Store.note(q.id); if (!nt) return; }
          rows.push(q);
        });
      });
      rows.sort(function (a, b) { return (b.y - a.y) || (a.n - b.n); });
      items = Bank.itemsOf(rows);
      if (!items.length) {
        box.innerHTML = '<div class="empty">这里还是空的。' + (tab === 'fav' ? '做题时点 ☆ 收藏。' : tab === 'wrong' ? '做错的题会自动出现在这里。' : tab === 'flag' ? '点 ⚑ 给题目打标记。' : '') + '</div>';
        return;
      }
      box.innerHTML = '<div class="list result-list">' + items.map(function (it, i) {
        const q = it.qs[0];
        const chap = Bank.chapterMeta(q.subj, q.ci);
        const fl = Store.flag(q.id);
        const p = Store.prog(q.id);
        return '<div class="row" data-i="' + i + '">' +
          '<div class="grow"><div class="t">' + esc(q.stem.slice(0, 56)) + (q.stem.length > 56 ? '…' : '') + '</div>' +
          '<div class="d">' + esc(q.label) + ' · ' + esc(q.subj) + (chap ? ' · ' + esc(chap.t) : '') +
          (it.qs.length > 1 ? ' · 病例题 ' + it.qs.length + ' 小问' : '') +
          (fl ? ' · <span style="color:#bf2b2b">' + esc(Card.FLAGS[fl.t] || fl.t) + '</span>' : '') +
          (p ? ' · 上次' + (p.ok ? '正确' : '错误') : '') + '</div></div>' +
          '<span class="num">' + esc(q.label) + '</span><span class="go">→</span></div>';
      }).join('') + '</div>';
    }

    app().addEventListener('click', function (e) {
      const seg = e.target.closest('.seg[data-seg="tab"] button');
      if (seg) {
        tab = seg.dataset.v;
        U.$$('.seg[data-seg="tab"] button', app()).forEach(function (b) { b.classList.toggle('on', b === seg); });
        loadThen(Bank.subjectNames(), render);
        return;
      }
      if (e.target.closest('[data-act="play"]')) {
        if (!items.length) { U.toast('列表为空'); return; }
        startItems(items.slice(), '回顾 · ' + items.length + ' 组', '来自「' + tab + '」');
        return;
      }
      const row = e.target.closest('.row[data-i]');
      if (row) {
        const it = items[+row.dataset.i];
        startItems([it], '单题回顾', it.qs[0].label);
      }
    });

    // 默认标签
    const first = app().querySelector('.seg[data-seg="tab"] button');
    if (first) first.classList.add('on');
    loadThen(Bank.subjectNames(), render);
  };

  /* ================= 模拟题 ================= */
  Views.mock = function () {
    shell('<div class="empty">正在载入模拟题库…</div>');
    Bank.ensureMock().then(function () {
      const m = Bank.mock.meta;
      let html = crumb([{ t: '首页', href: '#/home' }, { t: '模拟题' }]);
      const setCount = m.sets.filter(function (x) { return x.t !== '未标注来源'; }).length;
      html += '<div class="page-hd"><h1>天天师兄模拟题</h1><div class="sub">' +
        '课后巩固、阶段测试、基础/冲刺摸底共 ' + setCount + ' 套、' +
        m.subjects.reduce(function (a, s2) { return a + s2.n; }, 0) + ' 题，已按题干合并去重（同一题只保留一条，并标注来源）。' +
        '答案来自题库，若课堂讲解不同，可在题目里点「答」自行订正。</div></div>';
      html += '<h3 style="margin:18px 0 8px;font-family:var(--serif)">按套卷</h3><div class="list">';
      m.sets.forEach(function (x) {
        html += '<div class="row" data-set="' + esc(x.t) + '"><div class="grow">' +
          '<div class="t">' + esc(x.t) + '</div><div class="d">' + x.n + ' 题</div></div>' +
          '<span class="num">' + x.n + '</span><span class="go">开始 →</span></div>';
      });
      html += '</div>';
      html += '<h3 style="margin:30px 0 8px;font-family:var(--serif)">按科目 · 章</h3><div class="list">';
      m.subjects.forEach(function (s, si) {
        html += '<div class="row" data-ms="' + si + '"><div class="grow">' +
          '<div class="t">' + esc(s.name) + '</div><div class="d">' + s.chapters.length + ' 章 · ' + s.n + ' 题</div></div>' +
          '<span class="num">' + s.n + '</span><span class="go">进入 →</span></div>';
      });
      html += '</div>';
      shell(html);
      app().addEventListener('click', function (e) {
        const row = e.target.closest('[data-set]');
        if (row) {
          const set = row.dataset.set;
          const items = Bank.mockItemsBySet(set);
          startItems(items, '模拟题 · ' + set, set + ' · ' + items.length + ' 题');
          return;
        }
        const ms = e.target.closest('[data-ms]');
        if (ms) location.hash = '#/mock/sub/' + ms.dataset.ms;
      });
    }).catch(function (e) { shell('<div class="empty">模拟题库载入失败：' + esc(e.message) + '</div>'); });
  };

  Views.mockSubject = function (si) {
    Bank.ensureMock().then(function () {
      const s = Bank.mock.meta.subjects[+si];
      if (!s) { location.hash = '#/mock'; return; }
      let html = crumb([{ t: '首页', href: '#/home' }, { t: '模拟题', href: '#/mock' }, { t: s.name }]);
      html += '<div class="page-hd"><h1>' + esc(s.name) + ' · 模拟题</h1><div class="sub">' + s.n + ' 题</div></div>';
      html += '<div class="tree">';
      s.chapters.forEach(function (ch, ci) {
        html += '<details class="tree-ch"><summary><span class="caret">▶</span>' +
          '<span class="name">' + esc(ch.t) + '</span><span class="meta">' + ch.n + ' 题</span></summary>' +
          '<div class="ch-actions"><button class="btn sm" data-mc="' + ci + '">刷本章</button></div>';
        ch.sec.forEach(function (sec) {
          html += '<div class="tree-sec"><div class="st"><span>' + esc(sec.t) + '</span><span class="n">' + sec.n + '</span>' +
            '<span style="flex:1"></span><button class="btn ghost sm" data-msec="' + esc(sec.t) + '" data-mc="' + ci + '">刷本节</button></div></div>';
        });
        html += '</details>';
      });
      html += '</div>';
      shell(html);
      app().addEventListener('click', function (e) {
        const b = e.target.closest('[data-mc]');
        if (!b) return;
        const ch = s.chapters[+b.dataset.mc];
        const sec = b.dataset.msec || '';
        const items = Bank.mockItemsByChapter(s.name, ch.t, sec);
        startItems(items, '模拟题 · ' + s.name + ' · ' + ch.t + (sec ? ' · ' + sec : ''), s.name);
      });
    });
  };

  /* ================= 易错小结 ================= */
  Views.yicuo = function () {
    Bank.ensureYicuo().then(function () {
      const map = Bank.yicuoMap();
      const order = ['生理学', '生物化学', '病理学', '内科学', '外科学'];
      let html = crumb([{ t: '首页', href: '#/home' }, { t: '易错小结' }]);
      html += '<div class="page-hd"><h1>易错小结</h1><div class="sub">天天师兄「易错小结（真题）」五科清单，共 ' +
        Object.keys(map).reduce(function (a, k) { return a + (map[k] || []).length; }, 0) + ' 题，全部能在真题库里找到。</div></div>';
      html += '<div class="list">';
      order.forEach(function (s) {
        const n = (map[s] || []).length;
        if (!n) return;
        html += '<div class="row" data-yc="' + esc(s) + '"><div class="grow">' +
          '<div class="t">' + esc(s) + ' 易错 ' + n + ' 题</div>' +
          '<div class="d">按讲义顺序排列，直接开刷</div></div>' +
          '<span class="num">' + n + '</span><span class="go">开始 →</span></div>';
      });
      html += '</div>';
      html += '<p class="hint" style="margin-top:20px">这些题本身就在真题库里，做错的会自动进「错题」，收藏与标记同样通用。</p>';
      shell(html);
      app().addEventListener('click', function (e) {
        const row = e.target.closest('[data-yc]');
        if (!row) return;
        const subj = row.dataset.yc;
        loadThen(Bank.subjectNames(), function () {
          const items = Bank.yicuoItems(subj);
          startItems(items, '易错小结 · ' + subj, subj + ' · ' + items.length + ' 组');
        });
      });
    });
  };

  /* ================= 统计 ================= */
  Views.stats = function () {
    Bank.ensure(Bank.subjectNames()).then(function () { renderStats(); });
    shell('<div class="empty">正在统计…</div>');
  };

  function renderStats() {
    const st = Store.stats();
    let html = crumb([{ t: '首页', href: '#/home' }, { t: '学习统计' }]);
    html += '<div class="page-hd"><h1>学习统计</h1><div class="sub">记录保存在本机浏览器。可在设置里导出备份。</div></div>';
    html += '<div class="stat-grid">' +
      '<div class="stat"><b>' + U.fmtNum(st.done) + '</b><span>已作答（题次去重）</span></div>' +
      '<div class="stat"><b>' + (st.done ? U.pct(st.right, st.done) + '%' : '—') + '</b><span>总体正确率</span></div>' +
      '<div class="stat"><b>' + U.fmtNum(st.wrong) + '</b><span>做错的题</span></div>' +
      '<div class="stat"><b>' + U.fmtNum(Object.keys(Store.doc.fav).length) + '</b><span>收藏</span></div>' +
      '<div class="stat"><b>' + U.fmtNum(Object.keys(Store.doc.flags).length) + '</b><span>标记</span></div>' +
      '<div class="stat"><b>' + U.fmtNum(Object.keys(Store.doc.notes).length) + '</b><span>有笔记</span></div>' +
      '</div>';

    html += '<h3 style="margin:34px 0 10px;font-family:var(--serif)">分科目</h3>';
    html += '<table class="tb"><thead><tr><th>科目</th><th>题量</th><th>已做</th><th>正确率</th><th style="width:34%">进度</th></tr></thead><tbody>';
    let td = 0, tr = 0;
    Bank.meta.subjects.forEach(function (s) {
      let done = 0, right = 0;
      (Bank.loaded[s.name] || []).forEach(function (q) {
        const p = Store.prog(q.id); if (p) { done++; if (p.ok) right++; }
      });
      td += done; tr += right;
      html += '<tr><td>' + esc(s.name) + '</td><td class="n">' + s.n + '</td><td class="n">' + done + '</td>' +
        '<td class="n">' + (done ? U.pct(right, done) + '%' : '—') + '</td>' +
        '<td><div class="mini-bar"><i style="width:' + U.pct(done, s.n) + '%"></i></div></td></tr>';
    });
    html += '</tbody></table>';

    html += '<h3 style="margin:34px 0 10px;font-family:var(--serif)">标记分布</h3><table class="tb"><thead><tr><th>类型</th><th>数量</th></tr></thead><tbody>';
    const cnt = {};
    for (const k in Store.doc.flags) { const t = Store.doc.flags[k].t; cnt[t] = (cnt[t] || 0) + 1; }
    Card.FLAG_ORDER.forEach(function (t) {
      html += '<tr><td>' + esc(Card.FLAGS[t]) + '</td><td class="n">' + (cnt[t] || 0) + '</td></tr>';
    });
    html += '</tbody></table>';
    shell(html);
  }

  /* ================= 设置 ================= */
  Views.settings = function () {
    let html = crumb([{ t: '首页', href: '#/home' }, { t: '设置' }]);
    html += '<div class="page-hd"><h1>设置</h1><div class="sub">所有数据只保存在本机浏览器（IndexedDB / localStorage）。</div></div>';
    html += '<div class="field"><div class="k">解析显示</div><div class="v">' +
      '<div class="seg" data-setseg="revealMode"><button data-v="fold">题目下方折叠展开</button><button data-v="side">侧边栏显示</button></div>' +
      '</div></div>';
    html += '<div class="field"><div class="k">提交方式</div><div class="v">' +
      '<div class="seg" data-setseg="submitMode"><button data-v="single">每题提交</button><button data-v="chunk">每 N 题一起提交</button><button data-v="all">整卷提交</button></div>' +
      '<input class="input" type="number" min="2" max="100" data-setnum="chunk" style="width:80px">' +
      '</div></div>';
    html += '<div class="field"><div class="k">题干信息</div><div class="v">' +
      '<label class="chk"><input type="checkbox" data-setbool="hideMeta"> 做题时先隐藏「科目·章节·知识点」标签，提交后再显示</label>' +
      '</div></div>';
    html += '<div class="field"><div class="k">B 型题</div><div class="v">' +
      '<label class="chk"><input type="checkbox" data-setbool="bGroup"> 共用备选答案的 B 型题合并显示（像试卷一样：选项只出现一次）</label>' +
      '</div></div>';
    html += '<div class="field"><div class="k">默认模式</div><div class="v">' +
      '<div class="seg" data-setseg="mode"><button data-v="scroll">滚动（纸质版）</button><button data-v="paged">单题</button></div>' +
      '</div></div>';
    html += '<div class="field"><div class="k">字号</div><div class="v">' +
      '<input type="range" min="15" max="21" step="1" data-setnum="fontSize" style="width:220px">' +
      '<span class="hint" data-fs>17px</span></div></div>';
    html += '<div class="field"><div class="k">数据</div><div class="v">' +
      '<button class="btn sm" data-act="export">导出备份（JSON）</button>' +
      '<button class="btn sm" data-act="import">导入备份</button>' +
      '<button class="btn sm" data-act="reset">清空所有记录</button>' +
      '<input type="file" accept="application/json" data-file hidden>' +
      '<span class="hint">导出包含作答记录、收藏、标记、笔记文字与手写笔迹；笔记中的图片体积较大，不含在 JSON 里。</span>' +
      '</div></div>';
    const cf = Store.cloud.cfg();
    html += '<div class="field"><div class="k">云端同步</div><div class="v" style="display:block">' +
      '<div class="hint" style="margin-bottom:8px">把作答记录、收藏、标记、笔记（文字）、手写同步到一个 GitHub 仓库的 JSON 文件里，换设备也能接着做。' +
      '需要一次 GitHub 令牌（fine-grained，仅 Contents 读写，<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener" style="text-decoration:underline">点此创建</a>）。令牌只存在本机浏览器，不会上传到任何地方。</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<input class="input" data-cloud="repo" placeholder="owner/repo（私有仓库更安全）" value="' + esc(cf.repo || 'aokid666/xizong-306-data') + '" style="min-width:230px">' +
      '<input class="input" data-cloud="path" placeholder="文件名 xizong.json" value="' + esc(cf.path || 'xizong.json') + '" style="width:170px">' +
      '<input class="input" data-cloud="branch" placeholder="分支 main" value="' + esc(cf.branch || 'main') + '" style="width:110px">' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">' +
      '<input class="input" type="password" data-cloud="token" placeholder="GitHub token（ghp_… 或 github_pat_…）" value="' + esc(cf.token || '') + '" style="min-width:330px">' +
      '<button class="btn sm" data-act="cloud-save">保存</button>' +
      '<button class="btn sm" data-act="cloud-sync">立即同步</button>' +
      '<button class="btn sm" data-act="cloud-off">断开</button>' +
      '<span class="hint" data-cloud-state></span></div>' +
      '</div></div>';

    html += '<div class="field"><div class="k">存储状态</div><div class="v"><span class="hint" data-storage></span></div></div>';
    html += '<div class="field"><div class="k">关于</div><div class="v"><span class="hint">真题库 ' + U.fmtNum(Bank.meta.total) + ' 题（' +
      Bank.meta.years[0].y + '—' + Bank.meta.years[Bank.meta.years.length - 1].y + ' 年，来源：医考帮顺序版 + 分层刷题）；' +
      '模拟题 1,127 题（天天师兄，12 套）；易错小结 175 题。除云端同步外不含任何服务器请求。</span></div></div>';
    shell(html);

    const d = Store.doc.settings;
    function syncSegs() {
      U.$$('[data-setseg]', app()).forEach(function (seg) {
        const key = seg.dataset.setseg;
        U.$$('button', seg).forEach(function (b) { b.classList.toggle('on', b.dataset.v === String(d[key])); });
      });
      const fs = app().querySelector('[data-setnum="fontSize"]');
      if (fs) { fs.value = d.fontSize || 17; app().querySelector('[data-fs]').textContent = (d.fontSize || 17) + 'px'; }
      const ch = app().querySelector('[data-setnum="chunk"]');
      if (ch) ch.value = d.chunk || 10;
      app().querySelector('[data-storage]').textContent = '存储方式：' + (Store.backend === 'idb' ? 'IndexedDB（推荐）' : 'localStorage（降级）') +
        '　已记录 ' + Object.keys(Store.doc.progress).length + ' 题';
      const setb = app().querySelectorAll('[data-setbool]');
      setb.forEach(function (x) { x.checked = !!Store.get(x.dataset.setbool); });
      const st = app().querySelector('[data-cloud-state]');
      if (st) st.textContent = Store.cloud.label() + (Store.cloud.error ? '（' + Store.cloud.error + '）' : '');
    }
    document.addEventListener('xz-sync', function () {
      const st = app().querySelector('[data-cloud-state]');
      if (st) st.textContent = Store.cloud.label() + (Store.cloud.error ? '（' + Store.cloud.error + '）' : '');
    });
    syncSegs();

    app().addEventListener('click', function (e) {
      const b = e.target.closest('[data-setseg] button');
      if (b) {
        const key = b.closest('[data-setseg]').dataset.setseg;
        Store.set(key, b.dataset.v);
        if (key === 'fontSize' || key === 'mode') { }
        d[key] = b.dataset.v;
        syncSegs();
        return;
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'cloud-save' || act.dataset.act === 'cloud-sync' || act.dataset.act === 'cloud-off') {
        const cfg = Store.cloud.cfg();
        if (act.dataset.act === 'cloud-off') {
          Store.cloud.setCfg({});
          U.toast('已断开云端同步');
          Views.settings();
          return;
        }
        U.$$('[data-cloud]', app()).forEach(function (inp) { cfg[inp.dataset.cloud] = inp.value.trim(); });
        Store.cloud.setCfg(cfg);
        if (act.dataset.act === 'cloud-sync') {
          U.toast('同步中…', 3000);
          Store.cloud.syncNow().then(function (ok) {
            U.toast(ok ? '同步完成' : ('同步失败：' + (Store.cloud.error || '请检查仓库与令牌')));
          });
        } else {
          U.toast('已保存云端配置');
        }
        return;
      }
      if (act.dataset.act === 'export') {
        const blob = Store.exportBlob();
        const a = U.el('a', { href: URL.createObjectURL(blob), download: 'xizong-backup-' + new Date().toISOString().slice(0, 10) + '.json' });
        document.body.appendChild(a); a.click(); a.remove();
        U.toast('已导出');
      }
      if (act.dataset.act === 'import') app().querySelector('[data-file]').click();
      if (act.dataset.act === 'reset') {
        U.modal({
          title: '清空所有记录？', body: '<p>作答记录、收藏、标记、笔记、手写都会删除，且无法恢复。建议先导出备份。</p>',
          buttons: [{ label: '取消' }, {
            label: '确认清空', cls: 'primary', onClick: function () {
              Store.clearAll().then(function () { U.toast('已清空'); Views.settings(); });
            }
          }]
        });
      }
    });

    app().addEventListener('change', function (e) {
      if (e.target.matches('[data-setnum="fontSize"]')) {
        Store.set('fontSize', +e.target.value);
        document.documentElement.style.setProperty('--fs', e.target.value + 'px');
        app().querySelector('[data-fs]').textContent = e.target.value + 'px';
      }
      if (e.target.matches('[data-setnum="chunk"]')) Store.set('chunk', Math.max(2, +e.target.value || 10));
      if (e.target.matches('[data-setbool]')) Store.set(e.target.dataset.setbool, e.target.checked);
      if (e.target.matches('[data-file]')) {
        const f = e.target.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = function () {
          try {
            const obj = JSON.parse(rd.result);
            Store.importDoc(obj).then(function () { U.toast('导入完成'); Views.settings(); });
          } catch (err) { U.toast('导入失败：' + err.message); }
        };
        rd.readAsText(f);
      }
    });
  };

  /* ================= 搜索 ================= */
  Views.search = function (term) {
    let html = crumb([{ t: '首页', href: '#/home' }, { t: '搜索：' + term }]);
    html += '<div class="page-hd"><h1>搜索 “' + esc(term) + '”</h1><div class="sub" data-count>正在搜索…</div></div>';
    html += '<div id="search-body"></div>';
    shell(html);
    loadThen(Bank.subjectNames(), function () {
      const rows = Bank.search(term, 120);
      const box = document.getElementById('search-body');
      const cnt = app().querySelector('[data-count]');
      if (!rows.length) { cnt.textContent = '没有找到'; box.innerHTML = '<div class="empty">换个关键词试试，或直接用年份代号（如 2019N52）。</div>'; return; }
      cnt.textContent = '共 ' + rows.length + ' 条' + (rows.length >= 120 ? '（仅显示前 120 条）' : '');
      const items = Bank.itemsOf(rows);
      box.innerHTML = '<div class="list result-list">' + items.map(function (it, i) {
        const q = it.qs[0];
        return '<div class="row" data-i="' + i + '"><div class="grow">' +
          '<div class="t">' + esc(q.stem.slice(0, 70)) + (q.stem.length > 70 ? '…' : '') + '</div>' +
          '<div class="d">' + esc(q.label) + ' · ' + esc(q.subj) + '</div></div>' +
          '<span class="num">' + esc(q.label) + '</span><span class="go">→</span></div>';
      }).join('') + '</div>';
      box.addEventListener('click', function (e) {
        const row = e.target.closest('.row[data-i]');
        if (row) startItems([items[+row.dataset.i]], '搜索回顾', term);
      });
    });
  };
})();

