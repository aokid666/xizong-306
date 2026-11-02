/* ============================================================
   card.js — 题目卡片渲染、划线高亮、手写、笔记
   ============================================================ */
(function () {
  'use strict';

  const FLAGS = {
    outdated: '过时', dispute: '争议', bad: '烂题', extra: '超纲', review: '待复习'
  };
  const FLAG_ORDER = ['outdated', 'dispute', 'bad', 'extra', 'review'];
  const esc = U.esc;

  /* ---------------- 划线 / 高亮渲染 ---------------- */
  function normalizeMarks(text, marks) {
    const out = [];
    (marks || []).forEach(function (m) {
      let s = m.s | 0, e = m.e | 0;
      if (m.tx && text.slice(s, e) !== m.tx) {
        const idx = text.indexOf(m.tx);
        if (idx < 0) return;
        s = idx; e = idx + m.tx.length;
      }
      if (!(e > s) || s < 0 || e > text.length) return;
      out.push({ i: m.i, k: m.k || 'hl', n: m.n || '', s: s, e: e });
    });
    return out;
  }

  function markedHTML(text, marks) {
    const list = normalizeMarks(text, marks);
    if (!list.length) return esc(text);
    const points = [0, text.length];
    list.forEach(function (m) { points.push(m.s, m.e); });
    points.sort(function (a, b) { return a - b; });
    let out = '';
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (b <= a) continue;
      const seg = text.slice(a, b);
      const active = list.filter(function (m) { return m.s <= a && m.e >= b; });
      if (!active.length) { out += esc(seg); continue; }
      const hasHl = active.some(function (m) { return m.k === 'hl'; });
      const ids = active.map(function (m) { return m.i; }).join(' ');
      const notes = active.filter(function (m) { return m.n; }).map(function (m) { return m.n; });
      out += '<mark class="' + (hasHl ? 'hl' : 'ul') + '" data-mid="' + ids + '"' +
        (notes.length ? ' data-note="1" title="' + esc(notes.join(' / ')) + '"' : '') + '>' + esc(seg) + '</mark>';
      active.forEach(function (m) {
        if (m.n && m.e === b) out += '<sup class="mk" data-mid="' + m.i + '" title="' + esc(m.n) + '">※</sup>';
      });
    }
    return out;
  }

  function rawOf(el) { return el ? (el.getAttribute('data-raw') || '') : ''; }

  function applyField(el, owner, field) {
    if (!el) return;
    const text = rawOf(el);
    el.innerHTML = markedHTML(text, Store.marks(owner).filter(function (m) { return m.f === field; }));
  }

  /* ---------------- 卡片构建 ---------------- */
  function tagHTML(t, cls) { return '<span class="tag ' + (cls || '') + '">' + esc(t) + '</span>'; }

  function cardHead(item, index) {
    const q0 = item.qs[0];
    const bits = [];
    if (q0.multi) bits.push(tagHTML('多选', 'multi'));
    const pr = Store.prog(q0.id);
    if (pr) bits.push('<span class="done-slot">' + tagHTML(pr.ok ? '已做 · 对' : '已做 · 错', 'done ' + (pr.ok ? 'ok' : 'no')) + '</span>');
    else bits.push('<span class="done-slot"></span>');
    if (q0.mock) {
      bits.push(tagHTML(q0.set || '模拟题'));
      bits.push(tagHTML(q0.subj + ' · ' + (q0.chapter || '') + (q0.sec ? ' · ' + q0.sec : ''), 'metatag'));
    } else {
      if (item.bGroup) bits.push(tagHTML('B 型题 · ' + item.qs.length + ' 问共用备选', 'y'));
      else if (item.qs.length > 1) bits.push(tagHTML('病例题 · ' + item.qs.length + ' 小问', 'y'));
      else bits.push(tagHTML(q0.label, 'y'));
      const chap = Bank.chapterMeta(q0.subj, q0.ci);
      bits.push(tagHTML(q0.subj + (chap ? ' · ' + (chap.p ? '第' + chap.p + '篇 ' : '') + chap.t : ''), 'metatag'));
      if (q0.kp) bits.push(tagHTML(q0.kp, 'metatag'));
    }
    return '<div class="card-hd">' +
      '<span class="card-idx">' + (index + 1) + '</span>' +
      '<div class="card-tags">' + bits.join('') +
      '<span class="flag-slot"></span>' +
      '</div>' +
      '<div class="card-acts">' +
      '<button class="icon-btn" data-act="fav" title="收藏">☆</button>' +
      '<button class="icon-btn" data-act="flag" title="标记（过时/争议/烂题）">⚑</button>' +
      (q0.mock ? '<button class="icon-btn" data-act="key" title="订正正确答案（模拟题）">答</button>' : '') +
      '<button class="icon-btn" data-act="note" title="笔记">✎</button>' +
      '<button class="icon-btn" data-act="hw" title="手写批注">✍</button>' +
      '</div></div>';
  }

  function optionsHTML(q) {
    return '<ul class="opts">' + q.opts.map(function (o) {
      return '<li class="opt" data-k="' + o.k + '">' +
        '<span class="k">' + o.k + '.</span>' +
        '<span class="t" data-field="opt' + o.k + '" data-raw="' + esc(o.v) + '">' + esc(o.v) + '</span></li>';
    }).join('') + '</ul>';
  }

  function sharedOptionsHTML(item) {
    return '<div class="shared-opts">' +
      '<div class="shared-hd">备选答案（第 ' + item.qs.map(function (q) { return q.n; }).join('、') + ' 题共用）</div>' +
      '<ul class="opts plain">' + item.bShared.map(function (o) {
        return '<li class="opt static"><span class="k">' + o.k + '.</span>' +
          '<span class="t" data-field="sopt' + o.k + '" data-owner="' + item.qs[0].id + '" data-raw="' + esc(o.v) + '">' + esc(o.v) + '</span></li>';
      }).join('') + '</ul></div>';
  }

  function picksHTML(q) {
    return '<div class="picks" data-qid="' + q.id + '">' + q.opts.map(function (o) {
      return '<button class="pick" data-k="' + o.k + '" title="' + esc(o.v) + '"><b>' + o.k + '</b></button>';
    }).join('') + '</div>';
  }

  function subqHTML(q, item, ctx, idx) {
    const multi = q.multi;
    const disp = (item.vignette && item.tails && item.tails[idx] != null) ? item.tails[idx] : q.stem;
    let head = '';
    if (item.qs.length > 1) {
      head = '<div class="subq-hd"><b>第 ' + (idx + 1) + ' 小问</b>' +
        '<span>' + esc(q.label) + '</span>' +
        '<span style="flex:1"></span>' +
        '<button class="btn ghost sm" data-act="note">✎ 笔记</button>' +
        '<button class="btn ghost sm" data-act="reveal">答案</button>' +
        '</div>';
    }
    return '<div class="subq" data-qid="' + q.id + '">' +
      head +
      '<div class="stem" data-field="stem" data-raw="' + esc(disp) + '">' + markedHTML(disp, Store.marks(q.id).filter(function (m) { return m.f === 'stem'; })) + '</div>' +
      (item.bGroup ? picksHTML(q) : optionsHTML(q)) +
      '<div class="verdict" hidden></div>' +
      '<details class="exp" hidden><summary>解析' + (multi ? '（多选）' : '') + '</summary>' +
      '<div class="body" data-field="exp" data-owner="' + q.id + '" data-raw="' + esc(q.exp || '（暂无解析）') + '">' +
      markedHTML(q.exp || '（暂无解析）', Store.marks(q.id).filter(function (m) { return m.f === 'exp'; })) +
      '</div></details>' +
      '<div class="note-wrap" data-owner="' + q.id + '"></div>' +
      '</div>';
  }

  function build(item, index, ctx) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.key = item.key;
    card.dataset.i = index;

    let body = '';
    if (item.bGroup) body += sharedOptionsHTML(item);
    if (item.vignette) {
      body += '<div class="vignette" data-field="case" data-owner="' + item.qs[0].id + '" data-raw="' + esc(item.vignette) + '">' +
        markedHTML(item.vignette, Store.marks(item.qs[0].id).filter(function (m) { return m.f === 'case'; })) + '</div>';
    }
    body += item.qs.map(function (q, i) { return subqHTML(q, item, ctx, i); }).join('');

    const showSubmit = ctx.showSubmit(item);
    const foot = '<div class="case-foot">' +
      (showSubmit ? '<button class="btn" data-act="submit">' + (item.qs.length > 1 ? '提交本题（' + item.qs.length + ' 小问）' : '提交本题') + '</button>' : '') +
      '<button class="btn ghost sm" data-act="reveal">显示答案</button>' +
      '<span class="hint" data-hint></span></div>';

    card.innerHTML = cardHead(item, index) +
      '<div class="card-bd">' + body + '<canvas class="hw-layer"></canvas></div>' +
      '<div class="case-foot-holder">' + foot + '</div>' +
      '<div class="hw-tools">' +
      '<button class="icon-btn on" data-hw="pen" title="画笔">✎</button>' +
      '<button class="icon-btn" data-hw="eraser" title="橡皮">⌫</button>' +
      '<span class="hw-color on" data-hw="color" data-color="#191919" style="background:#191919" title="黑色"></span>' +
      '<span class="hw-color" data-hw="color" data-color="#bf2b2b" style="background:#bf2b2b" title="红色"></span>' +
      '<span class="hw-color" data-hw="color" data-color="#2b57a5" style="background:#2b57a5" title="蓝色"></span>' +
      '<span style="width:8px"></span>' +
      '<button class="icon-btn" data-hw="width" data-w="2" title="细">·</button>' +
      '<button class="icon-btn on" data-hw="width" data-w="3" title="中">●</button>' +
      '<button class="icon-btn" data-hw="width" data-w="1.5" title="粗">⬤</button>' +
      '<span style="width:8px"></span>' +
      '<button class="icon-btn" data-hw="undo" title="撤销">↶</button>' +
      '<button class="icon-btn" data-hw="clear" title="清空">✕</button>' +
      '<span class="hint" style="margin-left:4px">在题面上写字，自动保存</span>' +
      '</div>';

    card._item = item;
    card._ctx = ctx;

    // 笔记按钮（单题：放到 card-acts 已有 note 按钮上）
    return card;
  }

  /* ---------------- 状态刷新 ---------------- */
  function letters(s) { return String(s || '').split('').filter(Boolean); }

  function applyState(card, item, ctx) {
    const qs = item.qs;
    qs.forEach(function (q) {
      const subq = card.querySelector('.subq[data-qid="' + q.id + '"]');
      if (!subq) return;
      const chosen = letters(ctx.sel(q.id));
      const res = ctx.res(q.id);
      const ansL = letters(Bank.truth(q));
      subq.querySelectorAll('.pick').forEach(function (b) {
        const k = b.dataset.k;
        b.classList.remove('sel', 'correct', 'wrong', 'dim');
        if (res) {
          if (ansL.indexOf(k) >= 0) b.classList.add('correct');
          else if (chosen.indexOf(k) >= 0) b.classList.add('wrong');
          else b.classList.add('dim');
        } else if (chosen.indexOf(k) >= 0) b.classList.add('sel');
      });
      subq.querySelectorAll('.opt').forEach(function (li) {
        const k = li.dataset.k;
        li.classList.remove('sel', 'correct', 'wrong', 'dim', 'locked');
        if (res) {
          li.classList.add('locked');
          if (ansL.indexOf(k) >= 0) li.classList.add('correct');
          else if (chosen.indexOf(k) >= 0) li.classList.add('wrong');
          else li.classList.add('dim');
        } else if (chosen.indexOf(k) >= 0) {
          li.classList.add('sel');
        }
      });
      const v = subq.querySelector('.verdict');
      if (res) {
        v.hidden = false;
        v.innerHTML = '<span class="vs ' + (res.ok ? 'ok' : 'no') + '">' + (res.ok ? '✓ 回答正确' : '✗ 回答错误') + '</span>' +
          '<span class="ans">正确答案 <b>' + esc(Bank.truth(q).split('').join(' ')) + '</b></span>' +
          '<span class="ans">你的答案 <b>' + esc(chosen.length ? chosen.join(' ') : '未作答') + '</b></span>' +
          '<span class="acts">' +
          (q.mock ? '<button class="btn ghost sm" data-act="key">✎ 订正答案</button>' : '') +
          '<button class="btn ghost sm" data-act="exp">展开解析</button>' +
          '<button class="btn ghost sm" data-act="note">✎ 笔记</button>' +
          '<button class="btn ghost sm" data-act="hw">✍ 手写</button>' +
          '</span>';
      } else {
        v.hidden = true; v.innerHTML = '';
      }
      const exp = subq.querySelector('details.exp');
      if (res && Store.get('revealMode') === 'fold') {
        exp.hidden = false;
      } else if (!res) {
        exp.hidden = true;
      }
    });

    // 提交按钮状态
    const hasSel = qs.some(function (q) { return ctx.sel(q.id); });
    const anyRes = qs.some(function (q) { return ctx.res(q.id); });
    const allRes = qs.every(function (q) { return ctx.res(q.id); });
    const btn = card.querySelector('[data-act="submit"]');
    if (btn) {
      btn.disabled = !hasSel || allRes;
      btn.style.display = allRes ? 'none' : '';
      btn.textContent = qs.length > 1 ? '提交本题（' + qs.length + ' 小问）' : '提交本题';
    }
    const rv = card.querySelector('.case-foot-holder [data-act="reveal"]');
    if (rv) rv.style.display = allRes ? 'none' : '';
    const hint = card.querySelector('[data-hint]');
    if (hint) hint.textContent = allRes ? '' : (hasSel ? '' : '选择选项后提交');
    // 已做标签：本次会话提交后立刻更新
    const slot = card.querySelector('.done-slot');
    if (slot) {
      const r0 = ctx.res(qs[0].id);
      const p0 = Store.prog(qs[0].id);
      if (r0) slot.innerHTML = tagHTML(r0.ok ? '已做 · 对' : '已做 · 错', 'done ' + (r0.ok ? 'ok' : 'no'));
      else if (p0) slot.innerHTML = tagHTML(p0.ok ? '已做 · 对' : '已做 · 错', 'done ' + (p0.ok ? 'ok' : 'no'));
      else slot.innerHTML = '';
    }

    // 题干标签：设置里可隐藏，作答后再显示
    const hideMeta = !!Store.get('hideMeta') && !allRes;
    card.querySelectorAll('.metatag').forEach(function (el) { el.hidden = hideMeta; });

    refreshActs(card, item);
  }

  function refreshActs(card, item) {
    const q0 = item.qs[0];
    const favBtn = card.querySelector('[data-act="fav"]');
    if (favBtn) {
      const f = Store.isFav(q0.id);
      favBtn.classList.toggle('on', f);
      favBtn.textContent = f ? '★' : '☆';
    }
    const flagSlot = card.querySelector('.flag-slot');
    if (flagSlot) {
      const fl = Store.flag(q0.id);
      flagSlot.innerHTML = fl ? '<span class="tag flag">' + esc(FLAGS[fl.t] || fl.t) + '</span>' : '';
    }
    const noteBtn = card.querySelector('.card-acts [data-act="note"]');
    if (noteBtn) {
      const n = Store.note(q0.id);
      noteBtn.classList.toggle('on', !!(n && n.blocks && n.blocks.length));
    }
    const hwBtn = card.querySelector('[data-act="hw"]');
    if (hwBtn) {
      const hw = Store.hw(q0.id);
      hwBtn.classList.toggle('on', card.classList.contains('hw-on') || !!(hw && hw.s && hw.s.length));
    }
  }

﻿  /* ---------------- 笔记面板：文字 / 图片 段落，可自由排序 ---------------- */
  function openNote(card, qid, ctx) {
    const subq = card.querySelector('.subq[data-qid="' + qid + '"]') || card;
    let wrap = subq.querySelector('.note-wrap');
    if (!wrap) {
      wrap = U.el('div', { class: 'note-wrap' });
      subq.appendChild(wrap);
    }
    if (wrap.dataset.open === '1') {
      wrap.dataset.open = '';
      wrap.style.display = 'none';
      // 关闭时清掉没写字的空段落
      const n0 = Store.note(qid);
      if (n0) Store.setNoteBlocks(qid, n0.blocks);
      if (card) refreshActs(card, card._item);
      return;
    }
    wrap.dataset.open = '1';
    wrap.style.display = 'block';
    const n1 = Store.note(qid);
    if (!n1 || !n1.blocks || !n1.blocks.length) Store.addNoteBlock(qid, { k: 't', v: '' });
    renderNote(wrap, qid, card);
  }

  function noteImgEl(wrap, id) {
    const holder = wrap.querySelector('[data-img-wrap="' + id + '"]');
    if (!holder) return;
    holder.innerHTML = '<div class="nb-loading">图片加载中…</div>';
    Store.getImageOrig(id).then(function (orig) {
      return orig || Store.getImage(id);
    }).then(function (src) {
      if (!src) { holder.innerHTML = '<div class="nb-loading">图片已丢失</div>'; return; }
      holder.innerHTML = '';
      const img = U.el('img', { alt: '笔记图片', src: src });
      img.addEventListener('click', function () {
        U.modal({ title: '笔记图片（点击可看原图）', body: '<img src="' + src + '" style="max-width:100%">', buttons: [{ label: '关闭', cls: 'primary' }] });
      });
      holder.appendChild(img);
    });
  }

  function renderNote(wrap, qid, card) {
    const n = Store.note(qid) || { blocks: [] };
    const blocks = n.blocks || [];
    let html = '';
    if (!blocks.length) {
      html += '<div class="nb-empty hint">还没有笔记。点下面「＋ 文字 / ＋ 图片」，或直接 Ctrl+V 粘贴截图。</div>';
    }
    html += '<div class="nb-list">';
    blocks.forEach(function (b, idx) {
      const bar = '<div class="nb-bar">' +
        '<span class="nb-idx">' + (b.k === 't' ? '文字' : '图片') + ' ' + (idx + 1) + '</span>' +
        '<span style="flex:1"></span>' +
        '<button class="icon-btn" data-nb="up" title="上移">↑</button>' +
        '<button class="icon-btn" data-nb="down" title="下移">↓</button>' +
        '<button class="icon-btn" data-nb="del" title="删除这一段">✕</button></div>';
      if (b.k === 't') {
        html += '<div class="nb" data-bid="' + b.i + '">' + bar +
          '<textarea class="nb-text" data-nb-text placeholder="写点什么…">' + esc(b.v || '') + '</textarea></div>';
      } else {
        html += '<div class="nb" data-bid="' + b.i + '">' + bar +
          '<div class="nb-img" data-img-wrap="' + b.v + '"></div></div>';
      }
    });
    html += '</div>';
    html += '<div class="note-tools">' +
      '<button class="btn ghost sm" data-nb="addtext">＋ 文字</button>' +
      '<button class="btn ghost sm" data-nb="addimg">＋ 图片</button>' +
      '<span class="hint">↑↓ 调顺序 · Ctrl+V 粘贴截图 · 图片按原图完整显示</span>' +
      '<span style="flex:1"></span><span data-note-saved></span></div>';
    wrap.innerHTML = html;

    blocks.forEach(function (b) { if (b.k === 'i') noteImgEl(wrap, b.v); });

    const saveTip = wrap.querySelector('[data-note-saved]');
    const markSaved = function () { if (saveTip) saveTip.textContent = '已保存 ' + U.fmtTime(Date.now()).slice(11); };

    wrap.querySelectorAll('textarea[data-nb-text]').forEach(function (ta) {
      const bid = ta.closest('.nb').dataset.bid;
      const save = U.debounce(function () {
        Store.updateNoteBlock(qid, bid, ta.value);
        markSaved();
        if (card) refreshActs(card, card._item);
      }, 500);
      ta.addEventListener('input', save);
      ta.addEventListener('paste', function (e) {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') === 0) {
            e.preventDefault();
            addImage(qid, items[i].getAsFile(), wrap, card);
          }
        }
      });
    });

    wrap.onclick = function (e) {
      const b = e.target.closest('[data-nb]');
      if (!b) return;
      const act = b.dataset.nb;
      const nb = b.closest('.nb');
      const bid = nb && nb.dataset.bid;
      if (act === 'addtext') {
        Store.addNoteBlock(qid, { k: 't', v: '' });
        renderNote(wrap, qid, card);
        const tas = wrap.querySelectorAll('textarea[data-nb-text]');
        if (tas.length) tas[tas.length - 1].focus();
        return;
      }
      if (act === 'addimg') {
        const inp = U.el('input', { type: 'file', accept: 'image/*', multiple: true });
        inp.addEventListener('change', function () {
          for (let i = 0; i < inp.files.length; i++) addImage(qid, inp.files[i], wrap, card);
        });
        inp.click();
        return;
      }
      if (act === 'up' || act === 'down') {
        Store.moveNoteBlock(qid, bid, act === 'up' ? -1 : 1);
        renderNote(wrap, qid, card);
        return;
      }
      if (act === 'del') {
        const isImg = !!nb.querySelector('.nb-img');
        U.modal({
          title: isImg ? '删除这张图片？' : '删除这段文字？',
          body: '<p>' + (isImg ? '图片会从本机删除；开了云端同步的话云端也会删。' : '这段文字会删除。') + '删除后无法恢复。</p>',
          buttons: [{ label: '取消' }, {
            label: '删除', cls: 'primary', onClick: function () {
              Store.removeNoteBlock(qid, bid);
              renderNote(wrap, qid, card);
              if (card) refreshActs(card, card._item);
              U.toast('已删除');
            }
          }]
        });
      }
    };
  }

  function addImage(qid, file, wrap, card) {
    if (!file) return;
    const rd = new FileReader();
    rd.onload = async function () {
      const id = U.uid();
      const src = rd.result;
      await Store.putImageOrig(id, src);
      await Store.putImage(id, await U.compressDataUrl(src, 1400, 0.82));
      Store.addNoteImage(qid, id);
      if (wrap) renderNote(wrap, qid, card);
      if (card) refreshActs(card, card._item);
    };
    rd.readAsDataURL(file);
  }

  /* ---------------- 手写层 ---------------- */
  const HW = {
    state: null,

    canvas(card) { return card.querySelector('.hw-layer'); },

    init(card) {
      const cv = this.canvas(card);
      if (!cv) return;
      this.resize(card, true);
      this.bind(card);
      const ro = window.ResizeObserver ? new ResizeObserver(U.debounce(function () { HW.resize(card); }, 60)) : null;
      if (ro) ro.observe(card.querySelector('.card-bd'));
    },

    resize(card, initial) {
      const cv = this.canvas(card);
      if (!cv) return;
      const bd = card.querySelector('.card-bd');
      if (!bd) return;
      const w = Math.max(1, Math.round(bd.clientWidth));
      const h = Math.max(1, Math.round(bd.clientHeight));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv._lw === w && cv._lh === h) return;
      cv._lw = w; cv._lh = h;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = w + 'px';
      cv.style.height = h + 'px';
      this.redraw(card);
    },

    data(card) {
      const id = card._item.qs[0].id;
      const stored = Store.hw(id);
      // 外部写入（导入/预览）后同步缓存；正在书写时以内存中的笔迹为准
      if (stored && card._hwD !== stored && !card._hwDrawing) card._hwD = stored;
      if (card._hwD) return card._hwD;
      const cv = this.canvas(card);
      const d = stored || { w: cv._lw, h: cv._lh, s: [] };
      if (!d.s) d.s = [];
      card._hwD = d;
      return d;
    },

    redraw(card) {
      const cv = this.canvas(card);
      const ctx = cv.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      const data = this.data(card);
      if (!data || !data.s || !data.s.length) return;
      const scale = cv._lw / (data.w || cv._lw);
      data.s.forEach(function (st) {
        const pts = st.p || st;
        const col = st.c || data.c || '#191919';
        const lw = (st.w || data.lw || 3) * scale;
        ctx.beginPath();
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 0; i < pts.length; i += 2) {
          const x = pts[i] * scale, y = pts[i + 1] * scale;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
    },

    bind(card) {
      const cv = this.canvas(card);
      if (cv._bound) return;
      cv._bound = true;
      let drawing = false, cur = null;

      const pos = function (e) {
        const r = cv.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
      };

      cv.addEventListener('pointerdown', function (e) {
        if (!card.classList.contains('hw-on')) return;
        e.preventDefault();
        try { cv.setPointerCapture(e.pointerId); } catch (err) { }
        const p = pos(e);
        const tool = cv._tool || 'pen';
        if (tool === 'eraser') {
          HW.erase(card, p[0], p[1]);
          return;
        }
        drawing = true;
        card._hwDrawing = true;
        cur = { p: [p[0], p[1]], c: cv._color || '#191919', w: cv._width || 3 };
        const d = HW.data(card);
        d.s.push(cur);
        HW.redraw(card);
      });

      cv.addEventListener('pointermove', function (e) {
        if (!drawing) return;
        e.preventDefault();
        const p = pos(e);
        cur.p.push(p[0], p[1]);
        HW.redraw(card);
      });

      const end = function () {
        if (!drawing) return;
        drawing = false;
        card._hwDrawing = false;
        const d = HW.data(card);
        d.w = cv._lw; d.h = cv._lh;
        Store.setHw(card._item.qs[0].id, d);
      };
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);
      cv.addEventListener('pointerleave', function () { if (drawing) end(); });
    },

    erase(card, x, y) {
      const d = this.data(card);
      const cv = this.canvas(card);
      // 画布可能因为笔记展开、解析展开而重新缩放，橡皮坐标要换算回笔迹原始坐标
      const scale = (d.w && cv._lw) ? (cv._lw / d.w) : 1;
      const px = x / (scale || 1), py = y / (scale || 1);
      const R = 12;                       // 橡皮半径（像素）
      const R2 = R * R;
      function dist2Seg(ax, ay, bx, by, x, y) {
        const vx = bx - ax, vy = by - ay;
        const wx = x - ax, wy = y - ay;
        const len2 = vx * vx + vy * vy;
        let t = len2 ? (wx * vx + wy * vy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const dx = x - (ax + t * vx), dy = y - (ay + t * vy);
        return dx * dx + dy * dy;
      }
      const before = d.s.length;
      d.s = d.s.filter(function (st) {
        const pts = st.p || st;
        if (pts.length <= 2) {
          const dx = pts[0] - px, dy = pts[1] - py;
          return dx * dx + dy * dy > R2;
        }
        for (let i = 0; i + 3 < pts.length; i += 2) {
          if (dist2Seg(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], px, py) <= R2) return false;
        }
        return true;
      });
      if (d.s.length !== before) { Store.setHw(card._item.qs[0].id, d); this.redraw(card); }
    },

    toggle(card) {
      const on = !card.classList.contains('hw-on');
      card.classList.toggle('hw-on', on);
      const cv = this.canvas(card);
      if (on) {
        cv._tool = 'pen'; cv._color = '#191919'; cv._width = 3;
        this.resize(card);
      }
      refreshActs(card, card._item);
    },

    tools(card) {
      const cv = this.canvas(card);
      const box = card.querySelector('.hw-tools');
      box.addEventListener('click', function (e) {
        const b = e.target.closest('[data-hw]');
        if (!b) return;
        const kind = b.dataset.hw;
        if (kind === 'pen' || kind === 'eraser') {
          cv._tool = kind;
          box.querySelectorAll('[data-hw="pen"],[data-hw="eraser"]').forEach(function (x) { x.classList.toggle('on', x === b); });
        } else if (kind === 'color') {
          cv._color = b.dataset.color; cv._tool = 'pen';
          box.querySelectorAll('[data-hw="color"]').forEach(function (x) { x.classList.toggle('on', x === b); });
          box.querySelector('[data-hw="pen"]').classList.add('on');
          box.querySelector('[data-hw="eraser"]').classList.remove('on');
        } else if (kind === 'width') {
          cv._width = parseFloat(b.dataset.w);
          box.querySelectorAll('[data-hw="width"]').forEach(function (x) { x.classList.toggle('on', x === b); });
        } else if (kind === 'undo') {
          const d = HW.data(card); d.s.pop(); Store.setHw(card._item.qs[0].id, d); HW.redraw(card);
        } else if (kind === 'clear') {
          const d = HW.data(card); d.s = []; Store.setHw(card._item.qs[0].id, d); HW.redraw(card);
        }
      });
    }
  };

  /* ---------------- 选区 -> 划线 ---------------- */
  let floatEl = null;
  function hideFloat() { if (floatEl) { floatEl.remove(); floatEl = null; } }

  function showFloat(x, y, buttons) {
    hideFloat();
    const f = U.el('div', { class: 'float-tools' });
    buttons.forEach(function (b) {
      const btn = U.el('button', { text: b.label });
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); });
      btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); b.fn(); });
      f.appendChild(btn);
    });
    document.body.appendChild(f);
    const r = f.getBoundingClientRect();
    f.style.left = Math.max(8, Math.min(window.innerWidth - r.width - 8, x - r.width / 2)) + 'px';
    f.style.top = Math.max(8, y - r.height - 8) + 'px';
    floatEl = f;
  }

  function offIn(el, node, offset) {
    let total = 0, found = null;
    (function walk(n) {
      if (found !== null) return;
      if (n.nodeType === 3) {
        if (n === node) { found = total + offset; return; }
        total += n.nodeValue.length;
      } else if (n.nodeName === 'SUP' && n.classList && n.classList.contains('mk')) {
        return;
      } else {
        for (let i = 0; i < n.childNodes.length; i++) { walk(n.childNodes[i]); if (found !== null) return; }
      }
    })(el);
    return found == null ? 0 : found;
  }

  function offsetsIn(el, range) {
    const s = offIn(el, range.startContainer, range.startOffset);
    const e = offIn(el, range.endContainer, range.endOffset);
    return [Math.min(s, e), Math.max(s, e)];
  }

  function attachSelection(root) {
    if (root._selBound) return;
    root._selBound = true;

    root.addEventListener('mouseup', function (e) {
      setTimeout(function () {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        let node = range.commonAncestorContainer;
        if (node.nodeType === 3) node = node.parentElement;
        const fieldEl = node && node.closest ? node.closest('[data-field]') : null;
        if (!fieldEl || !root.contains(fieldEl)) return;
        const field = fieldEl.dataset.field;
        if (!/^(stem|case|exp|opt[A-H])$/.test(field)) return;
        const card = fieldEl.closest('.card');
        if (!card) return;
        const subq = fieldEl.closest('.subq');
        const owner = fieldEl.dataset.owner || (subq ? subq.dataset.qid : card._item.qs[0].id);
        const off = offsetsIn(fieldEl, range);
        if (off[1] - off[0] < 1) return;
        const tx = range.toString();
        const rect = range.getBoundingClientRect();

        const add = function (kind, note) {
          Store.addMark(owner, { f: field, s: off[0], e: off[1], tx: tx, k: kind, n: note || '' });
          applyField(fieldEl, owner, field);
          sel.removeAllRanges();
          hideFloat();
        };

        showFloat(rect.left + rect.width / 2, rect.top, [
          { label: '高亮', fn: function () { add('hl'); } },
          { label: '划线', fn: function () { add('ul'); } },
          {
            label: '批注', fn: function () {
              const body = U.el('div', {}, '<p class="hint" style="margin-bottom:8px">选中：' + esc(tx.slice(0, 80)) + '</p>');
              const ta = U.el('textarea', { class: 'input', style: 'width:100%;height:90px;resize:vertical' });
              body.appendChild(ta);
              U.modal({
                title: '添加批注', body: body, onOpen: function () { ta.focus(); }, buttons: [
                  { label: '取消' },
                  { label: '保存', cls: 'primary', onClick: function () { const v = ta.value.trim(); add('hl', v || '批注'); } }
                ]
              });
            }
          }
        ]);
      }, 10);
    });

    root.addEventListener('mousedown', function (e) {
      if (floatEl && !e.target.closest('.float-tools')) hideFloat();
    });

    root.addEventListener('click', function (e) {
      const mk = e.target.closest('mark[data-mid]');
      if (!mk) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const fieldEl = mk.closest('[data-field]');
      if (!fieldEl) return;
      const field = fieldEl.dataset.field;
      const card = mk.closest('.card');
      const subq = mk.closest('.subq');
      const owner = fieldEl.dataset.owner || (subq ? subq.dataset.qid : card._item.qs[0].id);
      const ids = (mk.dataset.mid || '').split(' ').filter(Boolean);
      const marks = Store.marks(owner);
      const ms = marks.filter(function (m) { return ids.indexOf(m.i) >= 0; });
      if (!ms.length) return;
      const rect = mk.getBoundingClientRect();
      const btns = [];
      const noteM = ms.filter(function (m) { return m.n; })[0];
      if (noteM) btns.push({ label: '查看批注', fn: function () { U.modal({ title: '批注', body: '<p>' + esc(noteM.n) + '</p>', buttons: [{ label: '关闭', cls: 'primary' }] }); hideFloat(); } });
      btns.push({
        label: '删除标记', fn: function () {
          ids.forEach(function (id) { Store.removeMark(owner, id); });
          applyField(fieldEl, owner, field);
          hideFloat();
        }
      });
      showFloat(rect.left + rect.width / 2, rect.top, btns);
    });
  }

  /* ---------------- 对外接口 ---------------- */
  window.Card = {
    build: build,
    applyState: applyState,
    refreshActs: refreshActs,
    openNote: openNote,
    attach(root) {
      attachSelection(root);
      U.$$('.card', root).forEach(function (card) {
        if (card.classList.contains('hw-on')) HW.resize(card);
        HW.init(card);
        HW.tools(card);
      });
    },
    hwToggle(card) { HW.toggle(card); },
    hwRedraw(card) { HW.redraw(card); },
    FLAGS: FLAGS,
    FLAG_ORDER: FLAG_ORDER
  };
})();
