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
      '<div><b>' + U.fmtNum(total) + '</b><span>真题总数</span></div>' +
      '<div><b>' + years[0].y + '–' + years[years.length - 1].y + '</b><span>年份跨度</span></div>' +
      '<div><b>' + U.fmtNum(st.done) + '</b><span>已作答</span></div>' +
      '<div><b>' + (st.done ? pct + '%' : '—') + '</b><span>正确率</span></div>' +
      '<div><b>1,127</b><span>模拟题（12 套）</span></div>' +
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
      entry('病例题专项', '按系统归类的 319 组病例题（呼吸/循环/消化/骨科…）', '#/cases') +
      entry('思维导图', '五科导图 272 页，可手写、记笔记、按目录/关键词检索', '#/maps') +
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

  function entry(t, d, href, blank) {
    return '<a class="entry" href="' + href + '"' + (blank ? ' target="_blank" rel="noopener"' : '') + '>' +
      '<h3>' + esc(t) + '</h3><p>' + esc(d) + '</p></a>';
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

﻿  Views.subject = function (name) {
    const s0 = Bank.subjectMeta(name);
    if (!s0) { location.hash = '#/subjects'; return; }
    shell('<div class="empty">正在载入 ' + esc(name) + ' …</div>');
    Bank.ensure([name]).then(function () { renderTree(); }).catch(function (e) {
      shell('<div class="empty">载入失败：' + esc(e.message) + '</div>');
    });

    const open = {};
    function range() {
      return { f: Store.get('subjFrom') || 0, t: Store.get('subjTo') || 9999 };
    }
    function inRange(q) { const r = range(); return q.y >= r.f && q.y <= r.t; }

    function qsOf(ci, secTitle, kp) {
      return (Bank.loaded[name] || []).filter(function (q) {
        if (q.ci !== ci) return false;
        if (!inRange(q)) return false;
        if (secTitle) {
          const t = q.sec.replace(/^第[一二三四五六七八九十百\d]+节\s*/, '');
          if (q.sec !== secTitle && t !== secTitle) return false;
        }
        if (kp && q.kp !== kp) return false;
        return true;
      });
    }

    function renderTree() {
      const years = Bank.meta.years;
      const y0 = years[0].y, y1 = years[years.length - 1].y;
      const r = range();
      let html = crumb([{ t: '首页', href: '#/home' }, { t: '按科目', href: '#/subjects' }, { t: name }]);
      html += '<div class="page-hd"><h1>' + esc(name) + '</h1><div class="sub">' +
        s0.chapters.length + ' 章 · ' + s0.n + ' 题　（点击章标题展开）</div></div>';

      html += '<div class="tree-tools" style="gap:8px">' +
        '<span class="hint">年份</span>' +
        '<select class="select" data-yr="from"></select><span class="hint">—</span>' +
        '<select class="select" data-yr="to"></select>' +
        '<button class="btn sm" data-quick="all">全部</button>' +
        '<button class="btn sm" data-quick="10">近 10 年</button>' +
        '<button class="btn sm" data-quick="5">近 5 年</button>' +
        '<span class="hint" data-range-hint></span></div>';

      html += '<div class="tree-tools">' +
        '<button class="btn sm" data-all="seq">整科顺序刷</button>' +
        '<button class="btn sm" data-all="rand">整科随机刷</button>' +
        '<span class="hint">数字＝所选年份范围内的题量；该范围内没题的章/节/知识点会变灰</span></div>';

      html += '<div class="tree">';
      s0.chapters.forEach(function (ch, ci) {
        const chQs = qsOf(ci);
        const empty = chQs.length === 0;
        const isOpen = open[ci];
        html += '<details class="tree-ch' + (empty ? ' dim' : '') + '" data-ci="' + ci + '"' + (isOpen ? ' open' : '') + '>' +
          '<summary><span class="caret">▶</span>' +
          '<span class="name">' + (ch.p ? '第' + ch.p + '篇 ' : '') + '第' + ch.z + '章 ' + esc(ch.t) + '</span>' +
          '<span class="meta">' + chQs.length + ' 题</span></summary>';
        html += '<div class="ch-actions">' +
          '<button class="btn sm" data-ch="' + ci + '" data-order="seq"' + (empty ? ' disabled' : '') + '>刷本章</button>' +
          '<button class="btn sm" data-ch="' + ci + '" data-order="rand"' + (empty ? ' disabled' : '') + '>随机本章</button></div>';
        ch.sec.forEach(function (sec, si) {
          const secQs = qsOf(ci, sec.t);
          const secEmpty = secQs.length === 0;
          html += '<div class="tree-sec' + (secEmpty ? ' dim' : '') + '">' +
            '<div class="st"><span>' + esc(sec.t) + '</span><span class="n">' + secQs.length + '</span>' +
            '<span style="flex:1"></span>' +
            '<button class="btn ghost sm" data-sec="' + si + '" data-ch="' + ci + '"' + (secEmpty ? ' disabled' : '') + '>刷本节</button></div>';
          if (sec.kp && sec.kp.length) {
            html += '<div class="kps">' + sec.kp.map(function (k) {
              const n = qsOf(ci, sec.t, k.t).length;
              return '<span class="kp' + (n ? '' : ' dim') + '" data-ch="' + ci + '" data-sec="' + si + '" data-kp="' + esc(k.t) + '">' +
                esc(k.t) + '<span class="c">' + n + '</span></span>';
            }).join('') + '</div>';
          }
          html += '</div>';
        });
        html += '</details>';
      });
      html += '</div>';
      shell(html);

      const fSel = app().querySelector('[data-yr="from"]');
      const tSel = app().querySelector('[data-yr="to"]');
      years.forEach(function (y) {
        fSel.appendChild(U.el('option', { value: y.y }, String(y.y)));
        tSel.appendChild(U.el('option', { value: y.y }, String(y.y)));
      });
      fSel.value = String(r.f || y0);
      tSel.value = String(r.t === 9999 ? y1 : r.t);
      const hint = app().querySelector('[data-range-hint]');
      if (hint) hint.textContent = '当前 ' + (r.f || y0) + '–' + (r.t === 9999 ? y1 : r.t);

      // 记录展开状态
      app().querySelectorAll('details.tree-ch').forEach(function (d) {
        d.addEventListener('toggle', function () { open[+d.dataset.ci] = d.open; });
      });

      app().addEventListener('change', function (e) {
        if (!e.target.matches('[data-yr]')) return;
        let f = parseInt(app().querySelector('[data-yr="from"]').value, 10) || y0;
        let t = parseInt(app().querySelector('[data-yr="to"]').value, 10) || y1;
        if (f > t) { const tmp = f; f = t; t = tmp; }
        Store.set('subjFrom', f === y0 ? 0 : f);
        Store.set('subjTo', t === y1 ? 9999 : t);
        renderTree();
      });

      bindSubject(name, qsOf);
    }
  };

  function bindSubject(name, qsOf) {
    const s0 = Bank.subjectMeta(name);
    app().addEventListener('click', function (e) {
      const qb = e.target.closest('[data-quick]');
      if (qb) {
        const years = Bank.meta.years;
        const y1 = years[years.length - 1].y;
        const n = qb.dataset.quick;
        if (n === 'all') { Store.set('subjFrom', 0); Store.set('subjTo', 9999); }
        else { Store.set('subjFrom', y1 - (parseInt(n, 10) - 1)); Store.set('subjTo', 9999); }
        Views.subject(name);
        return;
      }
      const allBtn = e.target.closest('[data-all]');
      if (allBtn) {
        const qs = [];
        (Bank.loaded[name] || []).forEach(function (q) {
          if (qsOf && qsOf(q.ci).indexOf(q) < 0) return;
          qs.push(q);
        });
        let items = Bank.itemsOf(qs);
        if (allBtn.dataset.all === 'rand') Bank.shuffle(items);
        startItems(items, name + (allBtn.dataset.all === 'rand' ? '（随机）' : '（顺序）'), name);
        return;
      }
      const chBtn = e.target.closest('[data-ch]');
      if (!chBtn || chBtn.disabled) return;
      const ci = +chBtn.dataset.ch;
      const secIdx = chBtn.dataset.sec != null ? +chBtn.dataset.sec : null;
      const kp = chBtn.dataset.kp || '';
      const ch = s0.chapters[ci];
      const secTitle = secIdx != null && ch.sec[secIdx] ? ch.sec[secIdx].t : null;
      const qs = qsOf ? qsOf(ci, secTitle, kp) : [];
      let items = Bank.itemsOf(qs);
      if (!items.length) { U.toast('这个范围内没有题目'); return; }
      if ((chBtn.dataset.order || 'seq') === 'rand') Bank.shuffle(items);
      const label = name + ' · 第' + ch.z + '章 ' + ch.t + (secTitle ? ' · ' + secTitle : '') + (kp ? ' · ' + kp : '');
      startItems(items, label, label.replace(/ · /g, ' / '));
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

    html += '<div class="field"><div class="k">名称</div><div class="v">' +
      '<input class="input" data-paper-name placeholder="给这份题单起个名字（留空自动命名）" style="min-width:280px">' +
      '<label class="chk"><input type="checkbox" data-save-paper checked> 存进「我的题单」</label>' +
      '</div></div>';

    html += '<div style="display:flex;gap:12px;align-items:center;margin-top:22px;flex-wrap:wrap">' +
      '<button class="btn primary" data-act="go">生成并开始</button>' +
      '<span class="hint" data-preview>已选：全部</span></div>';

    html += '<div style="margin-top:40px" id="paper-box"></div>';

    shell(html);
    renderPapers();

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
      const pgo = e.target.closest('[data-pgo]');
      if (pgo) { openPaper(pgo.dataset.pgo); return; }
      const pnm = e.target.closest('[data-pname]');
      if (pnm) {
        const p = Store.papers().filter(function (x) { return x.id === pnm.dataset.pname; })[0];
        if (!p) return;
        const body = U.el('div');
        const inp = U.el('input', { class: 'input', style: 'width:100%', value: p.name });
        body.appendChild(inp);
        U.modal({
          title: '重命名题单', body: body, onOpen: function () { inp.focus(); inp.select(); },
          buttons: [{ label: '取消' }, {
            label: '保存', cls: 'primary', onClick: function () {
              const v = inp.value.trim();
              if (v) { Store.renamePaper(p.id, v); renderPapers(); U.toast('已重命名'); }
            }
          }]
        });
        return;
      }
      const pdl = e.target.closest('[data-pdel]');
      if (pdl) {
        const p = Store.papers().filter(function (x) { return x.id === pdl.dataset.pdel; })[0];
        U.modal({
          title: '删除题单？',
          body: '<p>只删除这份题单记录，做题记录与错题本不受影响。</p>' +
            (p ? '<p class="hint">' + esc(p.name) + '</p>' : ''),
          buttons: [{ label: '取消' }, {
            label: '删除', cls: 'primary', onClick: function () {
              Store.removePaper(pdl.dataset.pdel); renderPapers(); U.toast('已删除');
            }
          }]
        });
        return;
      }
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
        const nameInput = app().querySelector('[data-paper-name]');
        const wantSave = app().querySelector('[data-save-paper]').checked;
        const auto = (subs.length ? subs.join('/') : '全科') + ' · ' + items.length + ' 组 · ' +
          new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        const name = (nameInput && nameInput.value.trim()) || auto;
        if (wantSave) {
          Store.addPaper({
            name: name, items: items.map(function (it) { return it.key; }),
            filters: (subs.length ? subs.join('/') : '全科') + ' · ' + opt.yearFrom + '–' + opt.yearTo +
              (chaps.length ? ' · 已选 ' + chaps.length + ' 章' : '') + ' · ' + count + ' 组'
          });
        }
        startItems(items, name, (subs.length ? subs.join('/') : '全科') + ' · ' + opt.yearFrom + '–' + opt.yearTo);
      });
    });
  };

  /* ================= 我的题单（组题历史） ================= */
  function renderPapers() {
    const box = document.getElementById('paper-box');
    if (!box) return;
    const list = Store.papers();
    if (!list.length) {
      box.innerHTML = '<h3 style="font-family:var(--serif);margin-bottom:10px">我的题单</h3>' +
        '<div class="empty">还没有保存过题单。生成一次组题后会自动出现在这里。</div>';
      return;
    }
    let html = '<h3 style="font-family:var(--serif);margin-bottom:10px">我的题单 <span class="hint">（' + list.length + '）</span></h3>';
    html += '<div class="list">';
    list.forEach(function (p, i) {
      let done = 0, right = 0, total = 0;
      (p.items || []).forEach(function (key) {
        const it = paperItem(key);
        if (!it) return;
        total++;
        const allDone = it.qs.every(function (q) { return Store.prog(q.id); });
        if (allDone) {
          done++;
          if (it.qs.every(function (q) { return (Store.prog(q.id) || {}).ok; })) right++;
        }
      });
      html += '<div class="row" data-paper="' + p.id + '">' +
        '<div class="grow"><div class="t">' + esc(p.name) + '</div>' +
        '<div class="d">' + U.fmtTime(p.ts) + ' · ' + total + ' 组 · 已做 ' + done +
        (done ? ' · 正确率 ' + U.pct(right, done) + '%' : '') +
        (p.filters ? ' · ' + esc(p.filters) : '') + '</div>' +
        '<div class="bar" style="margin-top:6px"><i style="width:' + U.pct(done, total || 1) + '%"></i></div></div>' +
        '<button class="btn sm" data-pgo="' + p.id + '">' + (done ? '继续' : '开始') + '</button>' +
        '<button class="btn ghost sm" data-pname="' + p.id + '">重命名</button>' +
        '<button class="btn ghost sm" data-pdel="' + p.id + '">删除</button></div>';
    });
    html += '</div>';
    box.innerHTML = html;
  }

  function openPaper(id) {
    const p = Store.papers().filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    U.toast('正在载入题单…', 6000);
    Bank.ensureAll().then(function () { return Bank.ensureMock(); }).then(function () {
      const items = (p.items || []).map(paperItem).filter(Boolean);
      if (!items.length) { U.toast('这份题单里的题已经找不到了'); return; }
      startItems(items, p.name, p.filters || '');
    }).catch(function (e) { U.toast('载入失败：' + e.message); });
  }

  function paperItem(key) {
    if (key.indexOf('c:') === 0) {
      const qs = Bank.clusters[key.slice(2)];
      return qs && qs.length ? Bank.itemOf(qs[0]) : null;
    }
    if (key.indexOf('b:') === 0) {
      const q = Bank.q(key.slice(2));
      return q ? Bank.itemsOf([q])[0] : null;
    }
    if (key.indexOf('mg:') === 0) {
      const q = Bank.q(key.slice(3));
      return q ? Bank.itemOf(q) : null;
    }
    const q = Bank.q(key.slice(2));
    return q ? Bank.itemOf(q) : null;
  }

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
      const all = [];
      Bank.subjectNames().forEach(function (n) {
        (Bank.loaded[n] || []).forEach(function (q) { all.push(q); });
      });
      (Bank.mock ? Bank.mock.list : []).forEach(function (q) { all.push(q); });
      all.forEach(function (q) {
        if (tab === 'fav' && !Store.isFav(q.id)) return;
        if (tab === 'wrong') { const p = Store.prog(q.id); if (!p || p.ok) return; }
        if (tab === 'flag' && !Store.flag(q.id)) return;
        if (tab === 'note') { const nt = Store.note(q.id); if (!nt) return; }
        rows.push(q);
      });
      rows.sort(function (a, b) {
        const am = a.mock ? 1 : 0, bm = b.mock ? 1 : 0;
        if (am !== bm) return am - bm;
        return (b.y - a.y) || (a.n - b.n);
      });
      items = Bank.itemsOf(rows);
      if (!items.length) {
        box.innerHTML = '<div class="empty">这里还是空的。' + (tab === 'fav' ? '做题时点 ☆ 收藏。' : tab === 'wrong' ? '做错的题会自动出现在这里。' : tab === 'flag' ? '点 ⚑ 给题目打标记。' : '') + '</div>';
        return;
      }
      box.innerHTML = '<div class="list result-list">' + items.map(function (it, i) {
        const q = it.qs[0];
        const chap = q.mock ? null : Bank.chapterMeta(q.subj, q.ci);
        const fl = Store.flag(q.id);
        const p = Store.prog(q.id);
        return '<div class="row" data-i="' + i + '">' +
          '<div class="grow"><div class="t">' + esc(q.stem.slice(0, 56)) + (q.stem.length > 56 ? '…' : '') + '</div>' +
          '<div class="d">' + (q.mock ? ('模拟 · ' + esc(q.set) + ' 第' + q.n + '题') : esc(q.label)) + ' · ' + esc(q.subj) + (chap ? ' · ' + esc(chap.t) : '') +
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
        loadAllThen(render);
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

    function loadAllThen(fn) {
      U.toast('正在载入题库…', 6000);
      Bank.ensure(Bank.subjectNames())
        .then(function () { return Bank.ensureMock(); })
        .then(function () { const t = document.getElementById('toast'); if (t) t.hidden = true; fn(); })
        .catch(function () { fn(); });
    }

    // 默认标签
    const first = app().querySelector('.seg[data-seg="tab"] button');
    if (first) first.classList.add('on');
    loadAllThen(render);
  };

  /* ================= 模拟题 ================= */
  Views.mock = function () {
    shell('<div class="empty">正在载入模拟题库…</div>');
    Bank.ensureMock().then(function () {
      const m = Bank.mock.meta;
      let html = crumb([{ t: '首页', href: '#/home' }, { t: '模拟题' }]);
      const setCount = m.sets.filter(function (x) { return x.t !== '未标注来源'; }).length;
      html += '<div class="page-hd"><h1>天天师兄模拟题</h1><div class="sub">' +
        '课后巩固、阶段测试、基础/冲刺摸底共 ' + setCount + ' 套、' + Bank.mock.list.length + ' 题，' +
        '题号与顺序和原试卷一致，跨套重复的题只存一份。' +
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

  /* ================= 思维导图 ================= */
  Views.maps = function (startPage) {
    shell('<div class="empty">正在载入思维导图…</div>');
    Bank.ensureMaps().then(function () {
      const pages = Bank.mapPages();
      const toc = Bank.mapToc();
      let html = crumb([{ t: '首页', href: '#/home' }, { t: '思维导图' }]);
      html += '<div class="page-hd"><h1>思维导图</h1><div class="sub">' +
        '天天师兄五科思维导图，共 ' + pages.length + ' 页。可以在图上手写、写笔记，左边目录直接跳转。</div></div>';
      html += '<div class="maps">' +
        '<aside class="maps-side">' +
        '<input class="input" data-mapsearch placeholder="搜导图内容 / 目录…" style="width:100%">' +
        '<div class="maps-toc" data-toc></div>' +
        '<div class="maps-hits" data-hits hidden></div>' +
        '</aside>' +
        '<div class="maps-main" data-viewer></div>' +
        '</div>';
      shell(html);

      const tocBox = app().querySelector('[data-toc]');
      tocBox.innerHTML = toc.map(function (s0, si) {
        return '<details class="mt-subj"' + (si === 0 ? ' open' : '') + '>' +
          '<summary><span class="caret">▶</span><span class="name">' + esc(s0.t) + '</span></summary>' +
          s0.chapters.map(function (ch) {
            return '<div class="mt-ch"><a data-goto="' + (ch.p || 1) + '">' + esc(ch.t) + '</a>' +
              (ch.secs || []).map(function (sec) {
                return sec.p ? '<a class="mt-sec" data-goto="' + sec.p + '">' + esc(sec.t) + '</a>' : '';
              }).join('') + '</div>';
          }).join('') + '</details>';
      }).join('');

      const viewerHost = app().querySelector('[data-viewer]');
      const start = startPage ? (pages.filter(function (p) { return p.n === startPage; })[0] || pages[0]) : pages[0];
      MapUI.viewer(viewerHost, pages, { startPage: start ? start.n : 1 });

      app().addEventListener('click', function (e) {
        const g = e.target.closest('[data-goto]');
        if (g) {
          const n = +g.dataset.goto;
          MapUI.viewer(viewerHost, pages, { startPage: n });
          location.hash = '#/maps/' + n;
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        const hit = e.target.closest('[data-hit]');
        if (hit) {
          MapUI.viewer(viewerHost, pages, { startPage: +hit.dataset.hit });
          location.hash = '#/maps/' + hit.dataset.hit;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });

      const inp = app().querySelector('[data-mapsearch]');
      const hits = app().querySelector('[data-hits]');
      const doSearch = U.debounce(function () {
        const t = inp.value.trim();
        if (!t) { hits.hidden = true; tocBox.hidden = false; return; }
        const rows = Bank.mapSearch(t);
        tocBox.hidden = true;
        hits.hidden = false;
        hits.innerHTML = rows.length
          ? rows.map(function (p2) {
            return '<div class="mh" data-hit="' + p2.n + '"><b>第 ' + p2.n + ' 页</b> · ' +
              esc(p2.c || p2.s || '') + '<div class="hint">' + esc((p2.txt || '').slice(0, 40)) + '…</div></div>';
          }).join('')
          : '<div class="empty">没有匹配的导图页</div>';
      }, 200);
      inp.addEventListener('input', doSearch);
    }).catch(function (e) {
      shell('<div class="empty">导图载入失败：' + esc(e.message) + '</div>');
    });
  };

  /* ================= 病例题专项 ================= */
  Views.cases = function () {
    shell('<div class="empty">正在载入病例题…</div>');
    Bank.ensureAll().then(function () { return Bank.ensureCases(); }).then(function () {
      const topics = Bank.caseTopics();
      const total = topics.reduce(function (a, t) { return a + t.n; }, 0);
      let html = crumb([{ t: '首页', href: '#/home' }, { t: '病例题专项' }]);
      html += '<div class="page-hd"><h1>病例题专项</h1><div class="sub">' +
        '来自《病例分析&狂背·临床学科病例题真题》，共 ' + topics.length + ' 个系统、' + total + ' 组病例。' +
        '题目与真题库是同一批题，答案、笔记、手写、错题全部互通。</div></div>';
      html += '<div class="tree-tools">' +
        '<button class="btn sm" data-topic="__all">全部病例题（顺序）</button>' +
        '<button class="btn sm" data-topic="__all" data-rand="1">全部（随机）</button></div>';
      html += '<div class="list">';
      topics.forEach(function (t) {
        html += '<div class="row" data-topic="' + esc(t.t) + '"><div class="grow">' +
          '<div class="t">' + esc(t.t) + '</div><div class="d">' + t.n + ' 组病例</div></div>' +
          '<span class="num">' + t.n + '</span><span class="go">开始 →</span></div>';
      });
      html += '</div>';
      shell(html);
      app().addEventListener('click', function (e) {
        const b = e.target.closest('[data-topic]');
        if (!b) return;
        const topic = b.dataset.topic;
        loadThen(Bank.subjectNames(), function () {
          let items = Bank.caseItems(topic === '__all' ? null : topic);
          if (!items.length) { U.toast('没有题目'); return; }
          if (b.dataset.rand) Bank.shuffle(items);
          startItems(items, topic === '__all' ? '病例题 · 全部' : '病例题 · ' + topic,
            items.length + ' 组');
        });
      });
    }).catch(function (e) {
      shell('<div class="empty">病例题载入失败：' + esc(e.message) + '</div>');
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
    Bank.ensure(Bank.subjectNames()).then(function () { return Bank.ensureMock(); })
      .then(function () { renderStats(); }).catch(function () { renderStats(); });
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
    if (Bank.mock) {
      let md = 0, mr = 0;
      Bank.mock.list.forEach(function (q) {
        const p = Store.prog(q.id); if (p) { md++; if (p.ok) mr++; }
      });
      html += '<tr><td>模拟题（天天师兄）</td><td class="n">' + Bank.mock.list.length + '</td><td class="n">' + md + '</td>' +
        '<td class="n">' + (md ? U.pct(mr, md) + '%' : '—') + '</td>' +
        '<td><div class="mini-bar"><i style="width:' + U.pct(md, Bank.mock.list.length) + '%"></i></div></td></tr>';
    }
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

  /* ================= 备份：ZIP（含原图） ================= */
  async function exportZip() {
    try {
      U.toast('正在打包…', 8000);
      const entries = [];
      entries.push({
        name: 'data.json',
        data: new TextEncoder().encode(JSON.stringify({ app: 'xizong-brush', v: 1, doc: Store.doc }, null, 1))
      });
      const ids = Store.imageIds();
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const d = (await Store.getImageOrig(id)) || (await Store.getImage(id));
        if (!d) continue;
        const mime = (String(d).match(/^data:([^;]+)/) || [])[1] || 'image/png';
        entries.push({ name: 'notes/' + id + '.' + ZIP.extOf(mime), data: ZIP.dataUrlToBytes(d) });
      }
      const blob = ZIP.create(entries);
      const a = U.el('a', {
        href: URL.createObjectURL(blob),
        download: '西综刷题备份-' + new Date().toISOString().slice(0, 10) + '.zip'
      });
      document.body.appendChild(a); a.click(); a.remove();
      U.toast('已导出 ' + entries.length + ' 个文件');
    } catch (e) {
      U.toast('导出失败：' + e.message, 4000);
    }
  }

  async function importZip(file) {
    try {
      U.toast('正在读取备份…', 8000);
      const entries = await ZIP.read(file);
      const dataEntry = entries.filter(function (e) { return e.name === 'data.json'; })[0];
      if (!dataEntry) throw new Error('压缩包里没有 data.json');
      const obj = JSON.parse(new TextDecoder().decode(dataEntry.data));
      await Store.importDoc(obj);
      let n = 0;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e.name.indexOf('notes/') !== 0) continue;
        const id = e.name.slice(6).replace(/\.[^.]+$/, '');
        const dataUrl = ZIP.bytesToDataUrl(e.data, ZIP.mimeOf(e.name));
        await Store.putImageOrig(id, dataUrl);
        await Store.putImage(id, await U.compressDataUrl(dataUrl, 1400, 0.82));
        n++;
      }
      U.toast('导入完成：' + n + ' 张图片');
    } catch (e) {
      U.toast('导入失败：' + e.message, 4000);
    }
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
      '<button class="btn sm" data-act="exportzip">导出备份 ZIP（含原图）</button>' +
      '<button class="btn sm" data-act="importzip">导入备份 ZIP</button>' +
      '<button class="btn sm" data-act="export">导出 JSON</button>' +
      '<button class="btn sm" data-act="import">导入 JSON</button>' +
      '<button class="btn sm" data-act="reset">清空所有记录</button>' +
      '<input type="file" accept="application/json,.zip,application/zip" data-file hidden>' +
      '<span class="hint">ZIP 备份包含全部记录 + 笔记<strong>原图</strong>（notes/ 目录），可在另一台设备一键恢复；JSON 只含文字与手写笔迹。</span>' +
      '</div></div>';
    const cf = Store.cloud.cfg();
    html += '<div class="field"><div class="k">云端同步</div><div class="v" style="display:block">' +
      '<div class="hint" style="margin-bottom:8px">把作答记录、收藏、标记、笔记（<b>文字 + 原图</b>）、手写同步到 GitHub 仓库里，换设备也能接着做。' +
      '图片按原图存在 <code>notes/</code> 目录，每张一个文件，只有新增/删除图片时才会上传。' +
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
      if (act.dataset.act === 'exportzip') exportZip();
      if (act.dataset.act === 'importzip') app().querySelector('[data-file]').click();
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
        if (/\.zip$/i.test(f.name)) { importZip(f).then(function () { Views.settings(); }); return; }
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
    html += '<div class="page-hd"><h1>搜索 “' + esc(term) + '”</h1>' +
      '<div class="sub" data-count>正在载入题库…</div></div>';

    const st = {
      scope: 'all', fields: ['stem', 'opts'], subjects: [], yFrom: 0, yTo: 9999
    };

    html += '<div class="sf">' +
      '<div class="sf-row"><span class="sf-k">范围</span><div class="seg" data-fs="scope">' +
      '<button data-v="all" class="on">全部</button><button data-v="real">真题</button><button data-v="mock">模拟题</button></div>' +
      '<span class="hint" data-scope-hint></span></div>' +
      '<div class="sf-row"><span class="sf-k">搜在哪</span>' +
      '<label class="chk"><input type="checkbox" data-ff="stem" checked> 题干</label>' +
      '<label class="chk"><input type="checkbox" data-ff="opts" checked> 选项</label>' +
      '<label class="chk"><input type="checkbox" data-ff="exp"> 解析</label>' +
      '<label class="chk"><input type="checkbox" data-ff="meta"> 章节 / 题号 / 知识点</label></div>' +
      '<div class="sf-row"><span class="sf-k">科目</span><span data-subj-box></span></div>' +
      '<div class="sf-row" data-year-row><span class="sf-k">年份</span>' +
      '<input class="input" type="number" min="1988" max="2026" placeholder="起" data-yfrom style="width:84px">' +
      '<span class="hint">—</span>' +
      '<input class="input" type="number" min="1988" max="2026" placeholder="止" data-yto style="width:84px">' +
      '<span class="hint">留空＝不限</span></div>' +
      '</div>';

    html += '<div id="search-body"><div class="empty">正在载入题库…（首次搜索要下载全部题库，约 7MB）</div></div>';
    shell(html);

    const body = function () { return document.getElementById('search-body'); };
    const cntEl = function () { return app().querySelector('[data-count]'); };

    // 科目 chips
    const subjBox = app().querySelector('[data-subj-box]');
    Bank.subjectNames().forEach(function (n) {
      const b = U.el('button', { class: 'sf-chip', 'data-subj': n }, esc(n));
      subjBox.appendChild(b);
    });

    let timer = null;
    function schedule() { clearTimeout(timer); timer = setTimeout(run, 160); }

    function run() {
      const opt = {
        scope: st.scope, fields: st.fields,
        subjects: st.subjects, yearFrom: st.yFrom, yearTo: st.yTo, limit: 300
      };
      const rows = Bank.search(term, opt);
      const items = Bank.itemsOf(rows);
      const seen = {};
      const uniq = [];
      items.forEach(function (it) {
        if (seen[it.key]) return;
        seen[it.key] = 1;
        uniq.push(it);
      });
      const c = cntEl();
      if (c) {
        const realN = rows.filter(function (q) { return !q.mock; }).length;
        const mockN = rows.filter(function (q) { return q.mock; }).length;
        c.textContent = '命中 ' + rows.length + ' 题（真题 ' + realN + ' · 模拟题 ' + mockN + '）' +
          (rows.length >= 300 ? '，仅显示前 300 条' : '');
      }
      const box = body();
      if (!rows.length) {
        box.innerHTML = '<div class="empty">没有找到。换个词试试，或放宽搜索范围（范围/科目/年份/字段）。</div>';
        return;
      }
      const t = term.toLowerCase();
      const mark = function (txt) {
        const i = txt.toLowerCase().indexOf(t);
        if (i < 0) return esc(txt);
        return esc(txt.slice(0, i)) + '<mark class="hl">' + esc(txt.slice(i, i + term.length)) + '</mark>' +
          esc(txt.slice(i + term.length));
      };
      box.innerHTML = '<div class="list result-list">' + uniq.map(function (it, i) {
        const q = it.qs[0];
        const where = q.mock
          ? ('模拟 · ' + esc(q.set || '') + ' 第' + q.n + '题 · ' + esc(q.subj))
          : (esc(q.label) + ' · ' + esc(q.subj) + (q.kp ? ' · ' + esc(q.kp) : ''));
        return '<div class="row" data-i="' + i + '"><div class="grow">' +
          '<div class="t">' + mark(q.stem.slice(0, 90)) + (q.stem.length > 90 ? '…' : '') + '</div>' +
          '<div class="d">' + where + (it.qs.length > 1 ? ' · 共 ' + it.qs.length + ' 小问' : '') + '</div></div>' +
          '<span class="num">' + (q.mock ? '模拟' : esc(q.label)) + '</span><span class="go">→</span></div>';
      }).join('') + '</div>';
      box._items = uniq;
    }

    function loadAll() {
      U.toast('正在载入题库，搜索马上出结果…', 4000);
      return Bank.ensure(Bank.subjectNames())
        .then(function () { return Bank.ensureMock(); })
        .then(function () {
          const yf = app().querySelector('[data-yfrom]');
          const yt = app().querySelector('[data-yto]');
          if (yf) yf.value = '';
          if (yt) yt.value = '';
          run();
        })
        .catch(function (e) {
          body().innerHTML = '<div class="empty">题库载入失败：' + esc(e.message) + '</div>';
        });
    }

    app().addEventListener('click', function (e) {
      const sc = e.target.closest('.seg[data-fs="scope"] button');
      if (sc) {
        st.scope = sc.dataset.v;
        U.$$('.seg[data-fs="scope"] button', app()).forEach(function (b) { b.classList.toggle('on', b === sc); });
        const yr = app().querySelector('[data-year-row]');
        if (yr) yr.style.opacity = st.scope === 'mock' ? '.45' : '1';
        schedule();
        return;
      }
      const chip = e.target.closest('[data-subj]');
      if (chip) {
        const n = chip.dataset.subj;
        const i = st.subjects.indexOf(n);
        if (i >= 0) st.subjects.splice(i, 1); else st.subjects.push(n);
        chip.classList.toggle('on', i < 0);
        schedule();
        return;
      }
      const row = e.target.closest('.row[data-i]');
      if (row && body()._items) {
        const it = body()._items[+row.dataset.i];
        if (it) startItems([it], '搜索回顾', term);
      }
    });

    app().addEventListener('change', function (e) {
      if (e.target.matches('[data-ff]')) {
        st.fields = U.$$('[data-ff]', app()).filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.ff; });
        if (!st.fields.length) { st.fields = ['stem']; U.$('[data-ff="stem"]', app()).checked = true; }
        schedule();
      }
      if (e.target.matches('[data-yfrom]') || e.target.matches('[data-yto]')) {
        const a = parseInt(app().querySelector('[data-yfrom]').value, 10);
        const b = parseInt(app().querySelector('[data-yto]').value, 10);
        st.yFrom = isNaN(a) ? 0 : a;
        st.yTo = isNaN(b) ? 9999 : b;
        if (st.yFrom && st.yTo && st.yFrom > st.yTo) { const t2 = st.yFrom; st.yFrom = st.yTo; st.yTo = t2; }
        schedule();
      }
    });

    loadAll();
  };

})();

